import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { CloseCode, LAUNCHER_ONLY, parseClientMsg, type ServerMsg } from "@tvdeck/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { dispatch } from "./dispatch.ts";
import type { TilesState } from "./config/watch.ts";
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
}

export function attachWebSocket(
  httpServer: HttpServer,
  ctx: AuthContext,
  serverVersion: string,
  getTiles: () => TilesState,
): WsHandle {
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

  wss.on("connection", (ws: Live, req) => {
    const peer = req.socket.remoteAddress ?? "?";
    let role: "remote" | "launcher" | null = null;
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
        const d = decideAuth(msg, ctx);
        if (!d.ok) {
          log.warn("ws", `${peer} failed auth`);
          send(ws, { type: "error", code: "unauthorized", message: "invalid credentials" });
          return void ws.close(CloseCode.unauthorized, "unauthorized");
        }
        role = d.role;
        clearTimeout(helloTimer);
        log.info("ws", `${peer} connected as ${role}`);
        authed.add(ws);
        send(ws, { type: "welcome", serverVersion });
        send(ws, tilesMsg(getTiles()));
        return;
      }

      if (!msg) return void send(ws, { type: "error", code: "bad_message", message: "invalid message" });
      if (msg.type === "hello") return void send(ws, { type: "error", code: "bad_message", message: "already authenticated" });
      if (msg.type === "ping") return void send(ws, { type: "pong", t: msg.t });
      if (role === "remote" && LAUNCHER_ONLY.has(msg.type)) {
        return void send(ws, { type: "error", code: "forbidden", message: `${msg.type} is launcher-only` });
      }
      try {
        dispatch(msg, (m) => send(ws, m));
      } catch (e) {
        log.error("ws", `dispatch ${msg.type} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (role) log.info("ws", `${peer} (${role}) disconnected`);
    });
    ws.on("error", (e) => log.warn("ws", `${peer} socket error: ${e.message}`));
  });

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
    close() {
      clearInterval(beat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
