import { KEYS, type KeyName } from "./keymap.ts";
import { native, type InputRecord } from "./user32.ts";

export const KEYEVENTF = { EXTENDEDKEY: 0x1, KEYUP: 0x2, UNICODE: 0x4, SCANCODE: 0x8 } as const;
export const MOUSEEVENTF = {
  MOVE: 0x1,
  LEFTDOWN: 0x2,
  LEFTUP: 0x4,
  RIGHTDOWN: 0x8,
  RIGHTUP: 0x10,
  WHEEL: 0x800,
  HWHEEL: 0x1000,
} as const;
export const WHEEL_DELTA = 120;
const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

// ---------- pure builders (unit-tested; no FFI) ----------

type ScanLookup = (vk: number) => number;

export function keyInput(vk: number, scan: number, flags: number): InputRecord {
  return { type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
}

/** Down+up for one key, as an ordered list. */
export function buildTap(key: KeyName, scanOf: ScanLookup): InputRecord[] {
  const { vk, extended } = KEYS[key];
  const ext = extended ? KEYEVENTF.EXTENDEDKEY : 0;
  const scan = scanOf(vk);
  return [keyInput(vk, scan, ext), keyInput(vk, scan, ext | KEYEVENTF.KEYUP)];
}

/** Press all keys in order, release in reverse. */
export function buildChord(keys: KeyName[], scanOf: ScanLookup): InputRecord[] {
  const downs: InputRecord[] = [];
  const ups: InputRecord[] = [];
  for (const k of keys) {
    const { vk, extended } = KEYS[k];
    const ext = extended ? KEYEVENTF.EXTENDEDKEY : 0;
    const scan = scanOf(vk);
    downs.push(keyInput(vk, scan, ext));
    ups.unshift(keyInput(vk, scan, ext | KEYEVENTF.KEYUP));
  }
  return [...downs, ...ups];
}

/** One down/up pair per UTF-16 code unit via KEYEVENTF_UNICODE; a newline becomes Enter. */
export function buildText(text: string, scanOf: ScanLookup): InputRecord[] {
  const out: InputRecord[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit === 0x0a) out.push(...buildTap("enter", scanOf));
    else if (unit === 0x0d) continue;
    else {
      out.push(keyInput(0, unit, KEYEVENTF.UNICODE));
      out.push(keyInput(0, unit, KEYEVENTF.UNICODE | KEYEVENTF.KEYUP));
    }
  }
  return out;
}

export function mouseInput(dx: number, dy: number, data: number, flags: number): InputRecord {
  return { type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData: data >>> 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
}

export function buildClick(button: "left" | "right", double = false): InputRecord[] {
  const [d, u] =
    button === "left" ? [MOUSEEVENTF.LEFTDOWN, MOUSEEVENTF.LEFTUP] : [MOUSEEVENTF.RIGHTDOWN, MOUSEEVENTF.RIGHTUP];
  const pair = [mouseInput(0, 0, 0, d), mouseInput(0, 0, 0, u)];
  return double ? [...pair, ...pair] : pair;
}

/**
 * Pointer acceleration curve. `speed` is the per-message movement magnitude in phone px (about one
 * animation frame of finger travel). Slow drags stay precise (gain 1), fast flicks ramp to `maxGain`.
 * Tune here; the phone's slow/normal/fast sensitivity multiplies the input before this curve.
 */
export const ACCEL = { k: 0.05, maxGain: 4 } as const;
export function accelerate(dx: number, dy: number): { dx: number; dy: number } {
  const speed = Math.hypot(dx, dy);
  const gain = Math.min(1 + ACCEL.k * speed, ACCEL.maxGain);
  return { dx: dx * gain, dy: dy * gain };
}

/** Accumulates fractional movement so slow drags are not rounded away. */
export class Accumulator {
  private rx = 0;
  private ry = 0;
  push(x: number, y: number, unit = 1): { x: number; y: number } {
    this.rx += x / unit;
    this.ry += y / unit;
    const ix = Math.trunc(this.rx);
    const iy = Math.trunc(this.ry);
    this.rx -= ix;
    this.ry -= iy;
    return { x: ix, y: iy };
  }
}

/** wy > 0 scrolls the page down; wx > 0 scrolls right. Units: wheel notches. */
export function buildScroll(wx: number, wy: number): InputRecord[] {
  const out: InputRecord[] = [];
  if (wy !== 0) out.push(mouseInput(0, 0, -wy * WHEEL_DELTA, MOUSEEVENTF.WHEEL));
  if (wx !== 0) out.push(mouseInput(0, 0, wx * WHEEL_DELTA, MOUSEEVENTF.HWHEEL));
  return out;
}

// ---------- FFI-backed API ----------

const scanOf: ScanLookup = (vk) => native.MapVirtualKeyW(vk, 0);

/** TVDECK_DRY_INPUT=1 logs events instead of injecting them (safe end-to-end tests of the phone UI). */
const DRY = process.env.TVDECK_DRY_INPUT === "1";
function describe(i: InputRecord): string {
  if (i.u.mi) return `m${i.u.mi.dwFlags.toString(16)}(${i.u.mi.dx},${i.u.mi.dy},${i.u.mi.mouseData | 0})`;
  const k = i.u.ki!;
  return `k${k.wVk || "u" + k.wScan.toString(16)}${k.dwFlags & KEYEVENTF.KEYUP ? "^" : "v"}`;
}

function send(inputs: InputRecord[]): number {
  if (inputs.length === 0) return 0;
  if (DRY) {
    console.log(`[dry-input] ${inputs.map(describe).join(" ")}`);
    return inputs.length;
  }
  const sent = native.SendInput(inputs);
  if (sent !== inputs.length) {
    console.warn(`[input] SendInput injected ${sent}/${inputs.length} events (blocked by UIPI?)`);
  }
  return sent;
}

export const tapKey = (key: KeyName): number => send(buildTap(key, scanOf));
export const chord = (keys: KeyName[]): number => send(buildChord(keys, scanOf));
export const typeText = (text: string): number => send(buildText(text, scanOf));
export const mouseClick = (button: "left" | "right", double = false): number => send(buildClick(button, double));

const moveAcc = new Accumulator();
export function mouseMove(dx: number, dy: number): number {
  const a = accelerate(dx, dy);
  const { x, y } = moveAcc.push(a.dx, a.dy);
  return x !== 0 || y !== 0 ? send([mouseInput(x, y, 0, MOUSEEVENTF.MOVE)]) : 0;
}

/** Raw relative move with no acceleration (used by the spike). */
export const mouseMoveRaw = (dx: number, dy: number): number => send([mouseInput(dx, dy, 0, MOUSEEVENTF.MOVE)]);

const wheelAccX = new Accumulator();
const wheelAccY = new Accumulator();
const PIXELS_PER_NOTCH = 40;
export function mouseScroll(dx: number, dy: number): number {
  const x = wheelAccX.push(dx, 0, PIXELS_PER_NOTCH).x;
  const y = wheelAccY.push(0, dy, PIXELS_PER_NOTCH).y;
  return send(buildScroll(x, y));
}
