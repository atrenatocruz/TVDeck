/**
 * Failed-auth limiter per remote address: `max` failures within `windowMs` blocks that
 * address until the window (counted from the first failure) ends.
 *
 * Behind `tailscale serve` every connection arrives from 127.0.0.1, so the whole tailnet
 * shares one bucket. That is acceptable: codes are 128-bit and device tokens 256-bit, so
 * guessing is infeasible regardless; the limiter only caps log noise and CPU.
 */
export class AuthRateLimiter {
  private hits = new Map<string, { count: number; first: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly max = 10,
    private readonly windowMs = 5 * 60_000,
  ) {}

  isBlocked(addr: string): boolean {
    const h = this.hits.get(addr);
    if (!h) return false;
    if (this.now() - h.first >= this.windowMs) {
      this.hits.delete(addr);
      return false;
    }
    return h.count >= this.max;
  }

  fail(addr: string): void {
    const t = this.now();
    const h = this.hits.get(addr);
    if (!h || t - h.first >= this.windowMs) this.hits.set(addr, { count: 1, first: t });
    else h.count++;
    if (this.hits.size > 1000) for (const [k, v] of this.hits) if (t - v.first >= this.windowMs) this.hits.delete(k);
  }
}
