/**
 * Touchpad gesture recognition. Pure: fed pointer events with timestamps, produces clicks immediately
 * and accumulates move/scroll deltas that the view drains once per animation frame.
 *
 *  - one finger, travelled <= TAP_SLOP and lifted within TAP_MS: left click
 *    (two quick taps are two clicks; Windows turns them into a double-click, so there is no tap delay)
 *  - one finger moving: relative pointer movement
 *  - two fingers, no travel, lifted within TWO_TAP_MS: right click
 *  - two fingers moving: scroll, natural direction (content follows the fingers)
 *  - three or more fingers, or a finger left behind after a two-finger gesture: ignored until all lift
 */

export const TAP_SLOP = 8; // px of travel that still counts as a tap
export const TAP_MS = 200;
export const TWO_TAP_MS = 260; // two fingers rarely land and lift in sync, so a little more room

export const SENSITIVITY = { slow: 0.65, normal: 1, fast: 1.7 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;
export const SCROLL_GAIN = 1.15;

export type Click = { kind: "click"; button: "left" | "right" };
export interface Frame {
  move?: { dx: number; dy: number };
  scroll?: { dx: number; dy: number };
}

interface Pt {
  x: number;
  y: number;
}

type Mode = "idle" | "pending" | "move" | "scroll" | "locked";

export class TouchpadGestures {
  private pointers = new Map<number, Pt>();
  private mode: Mode = "idle";
  private startT = 0;
  private maxPointers = 0;
  private anyTravel = false; // moved or scrolled beyond the slop at any point
  /** Where the current decision started: the first finger, or the two-finger centroid. */
  private origin: Pt = { x: 0, y: 0 };
  private cx = 0; // last centroid (scroll)
  private cy = 0;
  private pendMove = { dx: 0, dy: 0 };
  private pendScroll = { dx: 0, dy: 0 };

  constructor(private sensitivity: () => number = () => 1) {}

  get active(): boolean {
    return this.pointers.size > 0;
  }

  down(id: number, x: number, y: number, t: number): void {
    if (this.pointers.size === 0) {
      this.mode = "pending";
      this.startT = t;
      this.maxPointers = 0;
      this.anyTravel = false;
      this.origin = { x, y };
      this.pendMove = { dx: 0, dy: 0 };
      this.pendScroll = { dx: 0, dy: 0 };
    }
    this.pointers.set(id, { x, y });
    this.maxPointers = Math.max(this.maxPointers, this.pointers.size);
    if (this.pointers.size === 2 && this.mode === "pending") {
      const c = this.centroid();
      this.origin = c;
      this.cx = c.x;
      this.cy = c.y;
    } else if (this.pointers.size >= 2 && this.mode !== "pending") {
      this.mode = "locked"; // second finger arrived after the cursor already moved
    } else if (this.pointers.size > 2) {
      this.mode = "locked";
    }
  }

  move(id: number, x: number, y: number, _t: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const prevX = p.x;
    const prevY = p.y;
    p.x = x;
    p.y = y;

    if (this.pointers.size === 1 && (this.mode === "pending" || this.mode === "move")) {
      if (this.mode === "pending") {
        if (Math.hypot(x - this.origin.x, y - this.origin.y) <= TAP_SLOP) return;
        this.mode = "move";
        this.anyTravel = true;
        // Pay out the travel that was held back while deciding tap vs drag.
        this.pendMove.dx += x - this.origin.x;
        this.pendMove.dy += y - this.origin.y;
        return;
      }
      this.pendMove.dx += x - prevX;
      this.pendMove.dy += y - prevY;
    } else if (this.pointers.size === 2 && (this.mode === "pending" || this.mode === "scroll")) {
      const c = this.centroid();
      if (this.mode === "pending") {
        if (Math.hypot(c.x - this.origin.x, c.y - this.origin.y) <= TAP_SLOP) return;
        this.mode = "scroll";
        this.anyTravel = true;
        this.cx = this.origin.x; // pay out the held-back travel
        this.cy = this.origin.y;
      }
      // natural scrolling: the page follows the fingers, so finger up = wheel down
      this.pendScroll.dx -= c.x - this.cx;
      this.pendScroll.dy -= c.y - this.cy;
      this.cx = c.x;
      this.cy = c.y;
    }
  }

  /** Returns any click produced by lifting this finger. */
  up(id: number, t: number): Click[] {
    if (!this.pointers.delete(id)) return [];
    if (this.pointers.size > 0) {
      // Fingers remain: freeze until everyone lifts, so a trailing finger does not yank the cursor.
      this.mode = "locked";
      return [];
    }
    const dur = t - this.startT;
    this.mode = "idle";
    if (this.anyTravel) return [];
    if (this.maxPointers === 1 && dur <= TAP_MS) return [{ kind: "click", button: "left" }];
    if (this.maxPointers === 2 && dur <= TWO_TAP_MS) return [{ kind: "click", button: "right" }];
    return [];
  }

  cancel(id: number): void {
    this.pointers.delete(id);
    this.anyTravel = true; // a cancelled gesture is never a tap
    if (this.pointers.size === 0) this.mode = "idle";
  }

  /** Drains accumulated deltas (scaled by sensitivity). Call once per animation frame. */
  takeFrame(): Frame {
    const out: Frame = {};
    const s = this.sensitivity();
    const { dx, dy } = this.pendMove;
    if (dx !== 0 || dy !== 0) out.move = { dx: round(dx * s), dy: round(dy * s) };
    const sx = this.pendScroll.dx;
    const sy = this.pendScroll.dy;
    if (sx !== 0 || sy !== 0) out.scroll = { dx: round(sx * SCROLL_GAIN), dy: round(sy * SCROLL_GAIN) };
    this.pendMove = { dx: 0, dy: 0 };
    this.pendScroll = { dx: 0, dy: 0 };
    return out;
  }

  get hasPending(): boolean {
    const m = this.pendMove;
    const s = this.pendScroll;
    return m.dx !== 0 || m.dy !== 0 || s.dx !== 0 || s.dy !== 0;
  }

  private centroid(): Pt {
    let x = 0;
    let y = 0;
    for (const p of this.pointers.values()) {
      x += p.x;
      y += p.y;
    }
    const n = this.pointers.size || 1;
    return { x: x / n, y: y / n };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
