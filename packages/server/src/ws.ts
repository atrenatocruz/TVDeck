import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { CloseCode, LAUNCHER_ONLY, parseClientMsg, type ServerMsg } from "@tvdeck/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { AppService, StateMsg } from "./apps/service.ts";
import { dispatch } from "./dispatch.ts";
import { InputGuard } from "./inputGuard.ts";
import type { TilesState } from "./config/watch.ts";
import { AuthRateLimiter } from "./auth/rateLimit.ts";
import { log } from "./log.ts";
import { decideAuth, isOriginAllowed, type AuthContext } from "./wsPolicy.ts";

const HELLO_TIMEOUT_MS = 3000;
const HEARTBEAT_MS = 15_000;
const MAX_PAYLOAD = 16 * 1024;

type Live = WebSocket & { isAlive?: boolean };

export interface WsHandle {
  close(): void;
  /** Sends the tiles config to every authenticated socket (launcher and remotes). */
  broadcastTiles(state: TilesState): void;
  /** Sends the foreground/running state to every authenticated socket. */
  broadcastState(state: StateMsg): void;
  /** Sends the device list to every launcher. */
  broadcastDevices(): void;
  /** Tells these devices they are revoked and closes their live sockets. */
  closeDevices(ids: readonly string[]): void;
}

export interface WsOptions {
  /** Base URL phones should use, e.g. http://192.168.1.20:7420 (evaluated per pairing request). */
  publicBase: () => string;
  limiter?: AuthRateLimiter;
}

export function attachWebSocket(
  httpServer: HttpServer,
  ctx: AuthContext,
  serverVersion: string,
  getTiles: () => TilesState,
  apps: AppService | undefined,
  opts: WsOptions,
): WsHandle {
  const limiter = opts.limiter ?? new AuthRateLimiter();
  const byDevice = new Map<string, Set<WebSocket>>();
  const launchers = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  httpServer.on("upgrade", (req, socket: Duplex, head) => {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    if (pathname !== "/ws") return; // leave Vite HMR etc. alone
    if (!isOriginAllowed(req.headers.origin, req.headers.host)) {
      log.warn("ws", `refused upgrade, bad origin (${req.headers.origin ?? "none"})`);
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const tilesMsg = (s: TilesState): ServerMsg => ({ type: "tiles", config: s.config, ...(s.error ? { error: s.error } : {}) });
  const authed = new WeakSet<WebSocket>();
  const devicesMsg = (): ServerMsg => ({ type: "devices", list: ctx.devices.listInfo() });
  const broadcastDevices = () => {
    const m = JSON.stringify(devicesMsg());
    for (const l of launchers) if (l.readyState === WebSocket.OPEN) l.send(m);
  };
  const closeDevices = (ids: readonly string[]) => {
    for (const id of ids) {
      for (const sock of byDevice.get(id) ?? []) {
        send(sock, { type: "revoked" });
        sock.close(CloseCode.revoked, "revoked");
      }
      byDevice.delete(id);
    }
  };

  wss.on("connection", (ws: Live, req) => {
    const peer = req.socket.remoteAddress ?? "?";
    let role: "remote" | "launcher" | null = null;
    let deviceId: string | null = null;
    const guard = new InputGuard();
    ws.isAlive = true;
    ws.on("pong", () => void (ws.isAlive = true));

    const helloTimer = setTimeout(() => {
      if (!role) {
        log.warn("ws", `${peer} sent no hello in time`);
        ws.close(CloseCode.helloTimeout, "hello timeout");
      }
    }, HELLO_TIMEOUT_MS);

    ws.on("message", (data, isBinary) => {
      if (isBinary) return void ws.close(1003, "text only");
      const msg = parseClientMsg(data.toString());

      if (!role) {
        if (msg?.type !== "hello") return void ws.close(CloseCode.unauthorized, "hello first");
        const deny = (code: "unauthorized" | "rate_limited", message: string) => {
          send(ws, { type: "error", code, message });
          ws.close(code === "rate_limited" ? 1008 : CloseCode.unauthorized, code);
        };
        // Behind `tailscale serve` every client shares 127.0.0.1; see AuthRateLimiter.
        if (limiter.isBlocked(peer)) {
          log.warn("ws", `${peer} is rate limited`);
          return deny("rate_limited", "Too many failed attempts, try again later");
        }
        const d = decideAuth(msg, ctx);
        if (!d.ok) {
          limiter.fail(peer);
          log.warn("ws", `${peer} failed auth (${msg.role}/${msg.auth.kind})`);
          return deny("unauthorized", msg.auth.kind === "pair" ? "pairing code expired or already used" : "invalid credentials");
        }
        role = d.role;
        clearTimeout(helloTimer);
        authed.add(ws);
        if (d.deviceId) {
          deviceId = d.deviceId;
          let set = byDevice.get(deviceId);
          if (!set) byDevice.set(deviceId, (set = new Set()));
          set.add(ws);
          ctx.devices.touch(deviceId);
        }
        if (d.paired) {
          log.info("ws", `${peer} paired as device ${d.paired.deviceId}`);
          send(ws, { type: "paired", deviceId: d.paired.deviceId, deviceToken: d.paired.deviceToken });
        } else {
          log.info("ws", `${peer} connected as ${role}${deviceId ? ` (device ${deviceId})` : ""}`);
        }
        send(ws, { type: "welcome", serverVersion, ...(deviceId ? { deviceId } : {}) });
        send(ws, tilesMsg(getTiles()));
        if (apps) send(ws, apps.state());
        if (role === "launcher") {
          launchers.add(ws);
          send(ws, devicesMsg());
        } else if (deviceId) broadcastDevices();
        return;
      }

      if (!msg) return void send(ws, { type: "error", code: "bad_message", message: "invalid message" });
      if (msg.type === "hello") return void send(ws, { type: "error", code: "bad_message", message: "already authenticated" });
      if (msg.type === "ping") {
        if (deviceId) ctx.devices.touch(deviceId);
        return void send(ws, { type: "pong", t: msg.t });
      }
      if (role === "remote" && LAUNCHER_ONLY.has(msg.type)) {
        return void send(ws, { type: "error", code: "forbidden", message: `${msg.type} is launcher-only` });
      }
      if (role === "launcher" && msg.type === "pairingStart") {
        const { code, expiresAt } = ctx.pairing.start();
        log.info("ws", "pairing code issued");
        return void send(ws, { type: "pairingCode", url: `${opts.publicBase()}/remote/#pair=${code}`, expiresAt });
      }
      if (role === "launcher" && msg.type === "deviceRevoke") {
        if (ctx.devices.revoke(msg.deviceId)) {
          log.info("ws", `device ${msg.deviceId} revoked from the launcher`);
          closeDevices([msg.deviceId]);
        }
        return void broadcastDevices();
      }
      try {
        dispatch(msg, (m) => send(ws, m), apps, guard);
      } catch (e) {
        log.error("ws", `dispatch ${msg.type} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      launchers.delete(ws);
      if (deviceId) {
        const set = byDevice.get(deviceId);
        set?.delete(ws);
        if (set && set.size === 0) byDevice.delete(deviceId);
        broadcastDevices();
      }
      if (role) log.info("ws", `${peer} (${role}) disconnected`);
    });
    ws.on("error", (e) => log.warn("ws", `${peer} socket error: ${e.message}`));
  });

  // keeps "last seen" fresh on the launcher's Phones screen
  const devicesTick = setInterval(() => launchers.size > 0 && broadcastDevices(), 30_000);

  const beat = setInterval(() => {
    for (const ws of wss.clients as Set<Live>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  return {
    broadcastTiles(state) {
      const m = JSON.stringify(tilesMsg(state));
      for (const c of wss.clients) if (authed.has(c) && c.readyState === WebSocket.OPEN) c.send(m);
    },
    broadcastState(state) {
      const m = JSON.stringify(state);
      for (const c of wss.clients) if (authed.has(c) && c.readyState === WebSocket.OPEN) c.send(m);
    },
    broadcastDevices,
    closeDevices,
    close() {
      clearInterval(beat);
      clearInterval(devicesTick);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
