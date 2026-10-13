import { signal } from "@preact/signals";
import type { ClientMsg, CloseCode, ServerMsg, TilesConfig } from "@tvdeck/protocol";

export type ConnStatus = "connecting" | "connected" | "reconnecting" | "unpaired";

const UNAUTHORIZED: typeof CloseCode.unauthorized = 4001;
const TOKEN_KEY = "tvdeck.token";

export const status = signal<ConnStatus>("connecting");
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

function readToken(): string | null {
  try {
    const m = /(?:^#|&)t=([^&]+)/.exec(location.hash);
    if (m?.[1]) {
      const t = decodeURIComponent(m[1]);
      try {
        localStorage.setItem(TOKEN_KEY, t);
      } catch {
        /* storage unavailable: keep for this session only */
        sessionToken = t;
      }
      history.replaceState(null, "", location.pathname + location.search);
      return t;
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionToken;
  } catch {
    return sessionToken;
  }
}
let sessionToken: string | null = null;

let socket: WebSocket | null = null;
let attempt = 0;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let lastRx = 0;
let stopped = false;
let token: string | null = null;

function scheduleReconnect(): void {
  if (stopped) return;
  status.value = "reconnecting";
  clearTimeout(retryTimer);
  const base = Math.min(5000, 500 * 2 ** attempt);
  attempt++;
  retryTimer = window.setTimeout(connect, base + Math.random() * 250);
}

function connect(): void {
  if (stopped || !token) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  if (status.value !== "reconnecting") status.value = "connecting";

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    const hello: ClientMsg = { type: "hello", v: 1, role: "remote", auth: { kind: "shared", token: token! } };
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
    if (msg.type === "welcome") {
      attempt = 0;
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
      if (msg.code === "unauthorized") markUnpaired();
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
    if (ev.code === UNAUTHORIZED) return markUnpaired();
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* onclose follows */
  };
}

function markUnpaired(): void {
  stopped = true;
  status.value = "unpaired";
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  sessionToken = null;
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

export function startConnection(): void {
  token = readToken();
  void fetch("/healthz")
    .then((r) => r.json() as Promise<{ name?: string }>)
    .then((j) => void (pcName.value = j.name ?? null))
    .catch(() => {});

  if (!token) {
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
