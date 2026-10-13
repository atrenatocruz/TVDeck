import crypto from "node:crypto";

export const PAIRING_TTL_MS = 5 * 60_000;

export interface PairingCode {
  code: string;
  expiresAt: number;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest();

/**
 * One active pairing code at a time. 128-bit random, single-use, 5 minute lifetime.
 * Starting a new pairing invalidates the previous code.
 */
export class Pairing {
  private active: { hash: Buffer; expiresAt: number } | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = PAIRING_TTL_MS,
  ) {}

  start(): PairingCode {
    const code = crypto.randomBytes(16).toString("base64url");
    const expiresAt = this.now() + this.ttlMs;
    this.active = { hash: sha(code), expiresAt };
    return { code, expiresAt };
  }

  /** Validates and consumes the code. Returns false for wrong, expired, used or superseded codes. */
  redeem(code: string): boolean {
    const a = this.active;
    if (!a) return false;
    // Compare first so timing does not reveal whether a code is active or expired.
    const match = crypto.timingSafeEqual(a.hash, sha(code));
    if (this.now() >= a.expiresAt) {
      this.active = null;
      return false;
    }
    if (!match) return false;
    this.active = null; // single use
    return true;
  }

  /** True when an unexpired code is outstanding. */
  hasActive(): boolean {
    return !!this.active && this.now() < this.active.expiresAt;
  }
}
