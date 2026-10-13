/** Decides when to relaunch a vanished launcher window; pure so the back-off is testable. */
export interface WatchdogOptions {
  /** How long the window must be missing before we relaunch it. */
  graceMs?: number;
  /** Relaunches within this window count towards the back-off. */
  windowMs?: number;
  maxDelayMs?: number;
}

export class LauncherWatchdog {
  private missingSince: number | null = null;
  private relaunches: number[] = [];
  private readonly graceMs: number;
  private readonly windowMs: number;
  private readonly maxDelayMs: number;

  constructor(opts: WatchdogOptions = {}) {
    this.graceMs = opts.graceMs ?? 5000;
    this.windowMs = opts.windowMs ?? 10 * 60_000;
    this.maxDelayMs = opts.maxDelayMs ?? 60_000;
  }

  /** Current wait before the next relaunch: 5 s, then doubling once it has died 3 times recently. */
  delayMs(now: number): number {
    this.relaunches = this.relaunches.filter((t) => now - t < this.windowMs);
    const n = this.relaunches.length;
    return n < 3 ? this.graceMs : Math.min(this.maxDelayMs, this.graceMs * 2 ** (n - 2));
  }

  /** Call periodically. Returns true when the launcher should be relaunched now. */
  tick(now: number, present: boolean, busy = false): boolean {
    if (present) {
      this.missingSince = null;
      return false;
    }
    if (busy) return false;
    this.missingSince ??= now;
    if (now - this.missingSince < this.delayMs(now)) return false;
    this.relaunches.push(now);
    this.missingSince = null;
    return true;
  }
}
