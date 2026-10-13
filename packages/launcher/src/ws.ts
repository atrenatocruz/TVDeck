import type { ClientMsg, ServerMsg } from "@tvdeck/protocol";
import { batch } from "@preact/signals";
import { config, configError, devices, endOpening, frontState, opening, overlay, pairing, pushToast, running, status } from "./store.ts";

const UNAUTHORIZED = 4001;
const KEY_KEY = "tvdeck.launcherKey";

let socket: WebSocket | null = null;
let attempt = 0;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let lastRx = 0;
let stopped = false;
let key: string | null = null;

/** The launcher key arrives as #k=... (never in a request). Keep it for this session, strip it from the URL. */
function readKey(): string | null {
  const m = /(?:^#|&)k=([^&]+)/.exec(location.hash);
  if (m?.[1]) {
    const k = decodeURIComponent(m[1]);
    try {
      sessionStorage.setItem(KEY_KEY, k);
    } catch {
      /* in-memory only */
    }
    history.replaceState(null, "", location.pathname + location.search);
    return k;
  }
  try {
    return sessionStorage.getItem(KEY_KEY);
  } catch {
    return null;
  }
}

function scheduleReconnect(): void {
  if (stopped) return;
  status.value = "reconnecting";
  clearTimeout(retryTimer);
  const wait = Math.min(5000, 500 * 2 ** attempt);
  attempt++;
  retryTimer = window.setTimeout(connect, wait + Math.random() * 250);
}

function onMessage(msg: ServerMsg): void {
  switch (msg.type) {
    case "welcome":
      attempt = 0;
      status.value = "connected";
      break;
    case "tiles":
      batch(() => {
        config.value = msg.config;
        configError.value = msg.error ?? null;
      });
      break;
    case "state":
      batch(() => {
        running.value = msg.running ?? [];
        frontState.value = { foreground: msg.foreground, ...(msg.tileId ? { tileId: msg.tileId } : {}) };
        const op = opening.value;
        if (op && msg.foreground === "app" && msg.tileId === op.id) endOpening();
        // Home pressed while an app was still opening: stop showing the spinner once the launcher is back for a moment
        else if (op && msg.foreground === "launcher" && Date.now() - op.since > 2500) endOpening();
      });
      break;
    case "pairingCode":
      pairing.value = { url: msg.url, expiresAt: msg.expiresAt };
      break;
    case "devices": {
      const first = devices.value === null;
      devices.value = msg.list;
      // First run: nothing is paired, so go straight to the QR code.
      if (first && msg.list.length === 0 && !overlay.value) overlay.value = { kind: "pair" };
      break;
    }
    case "error":
      if (msg.code === "launch_failed") endOpening();
      if (msg.code === "unauthorized") markUnauthorized();
      else pushToast(msg.message, msg.code === "launch_failed" ? "info" : "warn");
      break;
    default:
      break;
  }
}

function connect(): void {
  if (stopped || !key) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(retryTimer);
  if (status.value !== "reconnecting") status.value = "connecting";

  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    const hello: ClientMsg = { type: "hello", v: 1, role: "launcher", auth: { kind: "launcher", key: key! } };
    ws.send(JSON.stringify(hello));
    lastRx = Date.now();
  };
  ws.onmessage = (ev) => {
    lastRx = Date.now();
    try {
      onMessage(JSON.parse(String(ev.data)) as ServerMsg);
    } catch {
      /* ignore malformed */
    }
  };
  ws.onclose = (ev) => {
    if (socket === ws) socket = null;
    if (ev.code === UNAUTHORIZED) return markUnauthorized();
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* onclose follows */
  };
}

function markUnauthorized(): void {
  stopped = true;
  status.value = "unauthorized";
  clearTimeout(retryTimer);
}

export function send(msg: ClientMsg): boolean {
  if (socket?.readyState !== WebSocket.OPEN || status.value !== "connected") return false;
  socket.send(JSON.stringify(msg));
  return true;
}

export function startConnection(): void {
  key = readKey();
  if (!key) {
    status.value = "unauthorized";
    return;
  }
  connect();
  pingTimer = window.setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastRx > 30_000) socket.close();
    else send({ type: "ping", t: Date.now() });
  }, 10_000);
  const retryNow = () => {
    if (!stopped && socket?.readyState !== WebSocket.OPEN) {
      attempt = 0;
      connect();
    }
  };
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && retryNow());
  window.addEventListener("online", retryNow);
}

export function stopConnection(): void {
  stopped = true;
  clearInterval(pingTimer);
  clearTimeout(retryTimer);
  socket?.close();
}
