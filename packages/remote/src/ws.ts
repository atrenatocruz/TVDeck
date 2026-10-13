import { signal } from "@preact/signals";
import type { ClientMsg, CloseCode, ServerMsg, TilesConfig } from "@tvdeck/protocol";
import { clearDeviceToken, clearLegacyToken, defaultDeviceName, loadDeviceToken, loadLegacyToken, saveDeviceToken, saveLegacyToken } from "./credentials.ts";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "unpaired";
/** Why the "Not paired" screen is showing. */
export type UnpairedReason = "none" | "expired" | "removed";

const UNAUTHORIZED: typeof CloseCode.unauthorized = 4001;
const REVOKED: typeof CloseCode.revoked = 4004;

export const status = signal<ConnStatus>("connecting");
export const unpairedReason = signal<UnpairedReason>("none");
export const pcName = signal<string | null>(null);
/** Title of the app in front on the TV, or null when it is the launcher or something else. */
export const frontApp = signal<string | null>(null);
/** Launcher tiles, tileIds with a live window, and the tile in front (for the Apps tab). */
export const tiles = signal<TilesConfig | null>(null);
export const running = signal<ReadonlySet<string>>(new Set());
export const frontTileId = signal<string | null>(null);
export interface Toast {
  id: number;
  text: string;
}
export const toast = signal<Toast | null>(null);
let titles = new Map<string, string>();
let frontId: string | null = null;
let toastTimer: number | undefined;
let toastSeq = 0;

function showToast(text: string): void {
  clearTimeout(toastTimer);
  toast.value = { id: ++toastSeq, text };
  toastTimer = window.setTimeout(() => (toast.value = null), 4200);
}
const syncFront = () => (frontApp.value = frontId ? (titles.get(frontId) ?? null) : null);

type Cred = { kind: "device"; token: string } | { kind: "shared"; token: string } | { kind: "pair"; code: string };

/** Pulls #pair= / #t= out of the URL fragment and removes it from the address bar. */
function takeHash(): { pair: string | null; shared: string | null } {
  const grab = (k: string) => {
    const m = new RegExp(`(?:^#|&)${k}=([^&]+)`).exec(location.hash);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  };
  const out = { pair: grab("pair"), shared: grab("t") };
  if (out.pair || out.shared) history.replaceState(null, "", location.pathname + location.search);
  return out;
}

let socket: WebSocket | null = null;
let attempt = 0;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let lastRx = 0;
let stopped = false;
let cred: Cred | null = null;

function scheduleReconnect(): void {
  if (stopped) return;
  status.value = "reconnecting";
  clearTimeout(retryTimer);
  const base = Math.min(5000, 500 * 2 ** attempt);
  attempt++;
  retryTimer = window.setTimeout(connect, base + Math.random() * 250);
}

function connect(): void {
  if (stopped || !cred) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  if (status.value !== "reconnecting") status.value = "connecting";

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    const c = cred!;
    const auth: Extract<ClientMsg, { type: "hello" }>["auth"] =
      c.kind === "pair" ? { kind: "pair", code: c.code, deviceName: defaultDeviceName() } : c.kind === "device" ? { kind: "device", token: c.token } : { kind: "shared", token: c.token };
    const hello: ClientMsg = { type: "hello", v: 1, role: "remote", auth };
    ws.send(JSON.stringify(hello));
    lastRx = Date.now();
  };
  ws.onmessage = (ev) => {
    lastRx = Date.now();
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return;
    }
    if (msg.type === "paired") {
      // The token is shown to us exactly once. Keep it and use it from now on.
      cred = { kind: "device", token: msg.deviceToken };
      void saveDeviceToken(msg.deviceToken);
      clearLegacyToken();
    } else if (msg.type === "revoked") {
      markUnpaired("removed");
    } else if (msg.type === "welcome") {
      attempt = 0;
      unpairedReason.value = "none";
      status.value = "connected";
    } else if (msg.type === "tiles") {
      titles = new Map(msg.config.rows.flatMap((r) => r.tiles.map((t) => [t.id, t.title] as const)));
      tiles.value = msg.config;
      syncFront();
    } else if (msg.type === "state") {
      frontId = msg.foreground === "app" && msg.tileId ? msg.tileId : null;
      frontTileId.value = frontId;
      running.value = new Set(msg.running ?? []);
      syncFront();
    } else if (msg.type === "error") {
      if (msg.code === "unauthorized") markUnpaired(cred?.kind === "pair" ? "expired" : "removed");
      else if (msg.code === "launch_failed") showToast(msg.message);
    }
  };
  ws.onclose = (ev) => {
    if (socket === ws) {
      socket = null;
      frontId = null;
      frontTileId.value = null;
      running.value = new Set();
      syncFront();
    }
    if (stopped) return;
    if (ev.code === UNAUTHORIZED) return markUnpaired(cred?.kind === "pair" ? "expired" : "removed");
    if (ev.code === REVOKED) return markUnpaired("removed");
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* onclose follows */
  };
}

/** Credentials were refused (or revoked): forget them and stop retrying. */
function markUnpaired(reason: UnpairedReason): void {
  if (status.value === "unpaired") return;
  stopped = true;
  unpairedReason.value = reason;
  status.value = "unpaired";
  if (cred?.kind !== "pair") {
    void clearDeviceToken();
    clearLegacyToken();
  }
  cred = null;
  clearTimeout(retryTimer);
}

export function send(msg: ClientMsg): boolean {
  if (socket?.readyState !== WebSocket.OPEN || status.value !== "connected") return false;
  socket.send(JSON.stringify(msg));
  return true;
}

function reconnectNow(): void {
  if (stopped) return;
  if (socket?.readyState === WebSocket.OPEN) return;
  attempt = 0;
  connect();
}

export async function startConnection(): Promise<void> {
  const hash = takeHash();
  void fetch("/healthz")
    .then((r) => r.json() as Promise<{ name?: string }>)
    .then((j) => void (pcName.value = j.name ?? null))
    .catch(() => {});

  const device = await loadDeviceToken();
  if (hash.pair) cred = { kind: "pair", code: hash.pair };
  else if (device) cred = { kind: "device", token: device };
  else if (hash.shared) {
    // Only works on servers started with TVDECK_ALLOW_SHARED_TOKEN=1.
    saveLegacyToken(hash.shared);
    cred = { kind: "shared", token: hash.shared };
  } else {
    const legacy = loadLegacyToken();
    if (legacy) cred = { kind: "shared", token: legacy };
  }

  if (!cred) {
    status.value = "unpaired";
    stopped = true;
    return;
  }
  connect();

  pingTimer = window.setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      if (Date.now() - lastRx > 30_000) socket.close(); // half-open connection
      else send({ type: "ping", t: Date.now() });
    }
  }, 10_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnectNow();
  });
  window.addEventListener("online", reconnectNow);
  window.addEventListener("pageshow", reconnectNow);
}

export function stopConnection(): void {
  stopped = true;
  clearInterval(pingTimer);
  clearTimeout(retryTimer);
  socket?.close();
}
