import type { Dir } from "@tvdeck/protocol";

/**
 * Swipe surface recognizer (the "clickpad"). Pure apart from timers, so it is unit-tested.
 *
 * - A swipe past `threshold` sends one step in its dominant direction; every further `step` px in that
 *   direction sends another, so a long flick moves several tiles.
 * - Keeping the finger down after a step repeats it: first after `holdDelay`, then every `holdInterval`,
 *   speeding up by `accel` per repeat down to `minInterval`. Moving again or lifting stops it.
 * - Moving the other way past `threshold` changes direction.
 * - A short touch that barely moved is a tap (OK).
 */
export type SwipeEvent = { kind: "nav"; dir: Dir } | { kind: "ok" };

export const SWIPE = {
  threshold: 32,
  step: 70,
  holdDelay: 350,
  holdInterval: 110,
  minInterval: 70,
  accel: 0.92,
  tapMaxMs: 300,
  tapMaxMove: 10,
};

interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
  now(): number;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** Dominant direction of a movement, or null when it is shorter than `min` on both axes. */
export function dirOf(dx: number, dy: number, min: number): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export class SwipeTracker {
  private down = false;
  private start = { x: 0, y: 0, t: 0 };
  private anchor = { x: 0, y: 0 };
  private maxMove = 0;
  private dir: Dir | null = null;
  private hold: unknown = null;
  private interval = SWIPE.holdInterval;

  constructor(
    private emit: (e: SwipeEvent) => void,
    private timers: Timers = defaultTimers,
    private cfg = SWIPE,
  ) {}

  pointerDown(x: number, y: number): void {
    this.reset();
    this.down = true;
    this.start = { x, y, t: this.timers.now() };
    this.anchor = { x, y };
  }

  pointerMove(x: number, y: number): void {
    if (!this.down) return;
    this.maxMove = Math.max(this.maxMove, Math.hypot(x - this.start.x, y - this.start.y));
    const dx = x - this.anchor.x;
    const dy = y - this.anchor.y;
    if (this.dir === null) {
      const d = dirOf(dx, dy, this.cfg.threshold);
      if (d) this.fire(d, x, y);
      return;
    }
    // Same direction: one more step every `step` px. Another direction: needs the full threshold.
    const d = dirOf(dx, dy, this.cfg.threshold);
    if (!d) return;
    if (d !== this.dir) this.fire(d, x, y);
    else if (Math.max(Math.abs(dx), Math.abs(dy)) >= this.cfg.step) this.fire(d, x, y);
  }

  pointerUp(): void {
    if (!this.down) return;
    const quick = this.timers.now() - this.start.t <= this.cfg.tapMaxMs;
    const tap = this.dir === null && quick && this.maxMove <= this.cfg.tapMaxMove;
    this.reset();
    if (tap) this.emit({ kind: "ok" });
  }

  cancel(): void {
    this.reset();
  }

  private fire(dir: Dir, x: number, y: number): void {
    this.dir = dir;
    this.anchor = { x, y };
    this.emit({ kind: "nav", dir });
    this.interval = this.cfg.holdInterval;
    this.schedule(this.cfg.holdDelay);
  }

  private schedule(ms: number): void {
    if (this.hold !== null) this.timers.clear(this.hold);
    this.hold = this.timers.set(() => {
      if (!this.down || !this.dir) return;
      this.emit({ kind: "nav", dir: this.dir });
      const next = this.interval;
      this.interval = Math.max(this.cfg.minInterval, this.interval * this.cfg.accel);
      this.schedule(next);
    }, ms);
  }

  private reset(): void {
    if (this.hold !== null) this.timers.clear(this.hold);
    this.hold = null;
    this.down = false;
    this.dir = null;
    this.maxMove = 0;
    this.interval = this.cfg.holdInterval;
  }
}
