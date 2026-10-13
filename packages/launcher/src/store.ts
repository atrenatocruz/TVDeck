import { signal } from "@preact/signals";
import type { DeviceInfo, TilesConfig } from "@tvdeck/protocol";

export type LinkStatus = "connecting" | "connected" | "reconnecting" | "unauthorized";

export const status = signal<LinkStatus>("connecting");
/** null until the first `tiles` message arrives. */
export const config = signal<TilesConfig | null>(null);
export const configError = signal<string | null>(null);
export const focusId = signal<string | null>(null);
/** tileIds that currently have a live window (from the server's `state`). */
export const running = signal<string[]>([]);
export const frontState = signal<{ foreground: "launcher" | "app" | "other"; tileId?: string }>({ foreground: "launcher" });

const OPENING_MAX_MS = 12_000;
/** The tile the user just opened, until it is in front, an error arrives or 12 s pass. */
export const opening = signal<{ id: string; since: number } | null>(null);
let openingTimer: number | undefined;

export function beginOpening(id: string): void {
  opening.value = { id, since: Date.now() };
  clearTimeout(openingTimer);
  openingTimer = window.setTimeout(endOpening, OPENING_MAX_MS);
}
export function endOpening(): void {
  clearTimeout(openingTimer);
  opening.value = null;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "warn";
}
export const toasts = signal<Toast[]>([]);

let nextToast = 1;
export function pushToast(text: string, tone: Toast["tone"] = "info", ms = 3800): void {
  const id = nextToast++;
  toasts.value = [...toasts.value.slice(-2), { id, text, tone }];
  setTimeout(() => dismissToast(id), ms);
}
export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

// ---- pairing and devices ----
/** Pseudo focus id for the "Phones" button in the top bar. */
export const PHONES_ID = "@phones";
export type Overlay = { kind: "pair" } | { kind: "devices" } | { kind: "confirm"; device: DeviceInfo };
export const overlay = signal<Overlay | null>(null);
/** null until the first `devices` message. */
export const devices = signal<DeviceInfo[] | null>(null);
export const pairing = signal<{ url: string; expiresAt: number } | null>(null);
/** Name of the phone that just paired, while the pair overlay shows its confirmation. */
export const justPaired = signal<string | null>(null);

export function closeOverlay(): void {
  overlay.value = null;
  pairing.value = null;
  justPaired.value = null;
}
