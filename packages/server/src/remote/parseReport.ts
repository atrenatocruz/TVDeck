/**
 * Decoder for the Xiaomi RC (Mi Box S remote, XMRM-006) Consumer Control HID reports.
 * Report layout (measured): [0x01, byte1, byte2, ...]; every button is one bit, release = all zero.
 */

export type ButtonName = "ok" | "up" | "down" | "left" | "right" | "assistant" | "apps" | "netflix" | "prime" | "power";

/** Bit masks per payload byte (index 1 = first byte after the report id). */
const MAP: ReadonlyArray<readonly [byteIndex: number, mask: number, name: ButtonName]> = [
  [1, 0x01, "ok"],
  [1, 0x02, "up"],
  [1, 0x04, "down"],
  [1, 0x08, "left"],
  [1, 0x10, "right"],
  [1, 0x20, "power"],
  [1, 0x40, "assistant"],
  [2, 0x02, "apps"],
  [2, 0x04, "netflix"],
  [2, 0x20, "prime"],
];

const KNOWN: Record<number, number> = {};
for (const [i, m] of MAP) KNOWN[i] = (KNOWN[i] ?? 0) | m;

export interface Pressed {
  buttons: Set<ButtonName>;
  /** Bits we have no name for, as "b1:0x80" style labels (stable, sorted). */
  unknown: string[];
}

/** Decodes one report into the set of buttons currently held. Returns null for other report ids. */
export function parseReport(data: ArrayLike<number>): Pressed | null {
  if (data.length < 2 || data[0] !== 0x01) return null;
  const buttons = new Set<ButtonName>();
  for (const [i, m, name] of MAP) if (((data[i] ?? 0) & m) !== 0) buttons.add(name);
  const unknown: string[] = [];
  for (let i = 1; i < data.length; i++) {
    const extra = (data[i] ?? 0) & ~(KNOWN[i] ?? 0) & 0xff;
    for (let bit = 0; bit < 8; bit++) if (extra & (1 << bit)) unknown.push(`b${i}:0x${(1 << bit).toString(16).padStart(2, "0")}`);
  }
  return { buttons, unknown };
}

export interface Edges {
  down: ButtonName[];
  up: ButtonName[];
  /** Unknown-bit labels that newly appeared in this report. */
  newUnknown: string[];
}

/** Compares two decoded states. */
export function diffPressed(prev: Pressed | null, next: Pressed): Edges {
  const before = prev?.buttons ?? new Set<ButtonName>();
  const beforeUnknown = new Set(prev?.unknown ?? []);
  return {
    down: [...next.buttons].filter((b) => !before.has(b)),
    up: [...before].filter((b) => !next.buttons.has(b)),
    newUnknown: next.unknown.filter((u) => !beforeUnknown.has(u)),
  };
}

export const hex = (data: ArrayLike<number>): string =>
  Array.from(data as ArrayLike<number>, (b) => b.toString(16).padStart(2, "0")).join(" ");
