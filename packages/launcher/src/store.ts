import { signal } from "@preact/signals";
import type { TilesConfig } from "@tvdeck/protocol";

export type LinkStatus = "connecting" | "connected" | "reconnecting" | "unauthorized";

export const status = signal<LinkStatus>("connecting");
/** null until the first `tiles` message arrives. */
export const config = signal<TilesConfig | null>(null);
export const configError = signal<string | null>(null);
export const focusId = signal<string | null>(null);

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
