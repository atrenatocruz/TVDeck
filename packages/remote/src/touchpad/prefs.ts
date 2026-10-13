import { signal } from "@preact/signals";
import { type Sensitivity, SENSITIVITY } from "./gestures.ts";

const KEY = "tvdeck.sensitivity";

export function parseSensitivity(v: unknown): Sensitivity {
  return typeof v === "string" && v in SENSITIVITY ? (v as Sensitivity) : "normal";
}

function load(): Sensitivity {
  try {
    return parseSensitivity(localStorage.getItem(KEY));
  } catch {
    return "normal";
  }
}

export const sensitivity = signal<Sensitivity>(load());

export function setSensitivity(s: Sensitivity): void {
  sensitivity.value = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* not persisted */
  }
}
