/**
 * Sanity clamps and rate limits for remote input. Pure (clock injected) so it is unit-tested.
 * One guard per socket: a misbehaving phone cannot flood SendInput or fling the cursor across the screen.
 */

export const LIMITS = {
  /** Largest pointer movement accepted in one mouseMove message (pre-acceleration, in phone px). */
  maxMovePerMsg: 400,
  /** Largest scroll accepted in one mouseScroll message (phone px; 40 px = one wheel notch). */
  maxScrollPerMsg: 800,
  /** typeText throughput: refill rate and burst capacity, in UTF-16 units. */
  textCharsPerSec: 1500,
  textBurst: 2000,
  /** Every input message costs one token. mouseMove/scroll run at 60/s, key repeat at 12/s. */
  msgsPerSec: 240,
  msgBurst: 180,
} as const;

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly perSec: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }
  /** Takes up to `n` tokens and returns how many were granted (0..n). */
  take(n: number): number {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSec);
    this.last = t;
    const granted = Math.max(0, Math.min(n, Math.floor(this.tokens)));
    this.tokens -= granted;
    return granted;
  }
}

/** Scales (dx, dy) down so its magnitude is at most `max`, keeping direction. Non-finite becomes 0. */
export function clampVector(dx: number, dy: number, max: number): { dx: number; dy: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { dx: 0, dy: 0 };
  const mag = Math.hypot(dx, dy);
  if (mag <= max) return { dx, dy };
  const k = max / mag;
  return { dx: dx * k, dy: dy * k };
}

/** Cuts text at `max` UTF-16 units without splitting a surrogate pair. */
export function truncateText(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  let end = max;
  const c = text.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end--; // high surrogate left dangling
  return text.slice(0, end);
}

export class InputGuard {
  private readonly msgs: TokenBucket;
  private readonly text: TokenBucket;
  constructor(now: () => number = Date.now) {
    this.clock = now;
    this.msgs = new TokenBucket(LIMITS.msgsPerSec, LIMITS.msgBurst, now);
    this.text = new TokenBucket(LIMITS.textCharsPerSec, LIMITS.textBurst, now);
  }
  private lastNotice = -Infinity;
  private readonly clock: () => number;
  /** True when one more input message is within budget. */
  allowMessage(): boolean {
    return this.msgs.take(1) === 1;
  }
  /** True at most once per second: used to tell the client it is being throttled without echo-flooding it. */
  shouldNotify(): boolean {
    const t = this.clock();
    if (t - this.lastNotice < 1000) return false;
    this.lastNotice = t;
    return true;
  }
  move(dx: number, dy: number): { dx: number; dy: number } {
    return clampVector(dx, dy, LIMITS.maxMovePerMsg);
  }
  scroll(dx: number, dy: number): { dx: number; dy: number } {
    return clampVector(dx, dy, LIMITS.maxScrollPerMsg);
  }
  /** Returns the part of `text` that fits the typing budget ("" when exhausted). */
  allowText(text: string): string {
    if (text.length === 0) return "";
    const granted = this.text.take(text.length);
    if (granted >= text.length) return text;
    // Tokens were consumed for `granted` units; a trimmed surrogate pair just wastes one.
    return truncateText(text, granted);
  }
}
