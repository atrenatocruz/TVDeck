import { describe, expect, it } from "vitest";
import { AuthRateLimiter } from "./rateLimit.ts";

describe("AuthRateLimiter", () => {
  it("blocks an address after 10 failures for the rest of the 5 minute window", () => {
    let t = 0;
    const l = new AuthRateLimiter(() => t, 10, 300_000);
    for (let i = 0; i < 9; i++) l.fail("a");
    expect(l.isBlocked("a")).toBe(false);
    l.fail("a");
    expect(l.isBlocked("a")).toBe(true);
    expect(l.isBlocked("b")).toBe(false);
    t = 299_999;
    expect(l.isBlocked("a")).toBe(true);
    t = 300_000;
    expect(l.isBlocked("a")).toBe(false);
  });
  it("starts a fresh window after expiry", () => {
    let t = 0;
    const l = new AuthRateLimiter(() => t, 3, 1000);
    l.fail("a");
    l.fail("a");
    t = 2000;
    l.fail("a");
    expect(l.isBlocked("a")).toBe(false);
  });
});
