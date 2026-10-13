import { describe, expect, it } from "vitest";
import { clampVector, InputGuard, LIMITS, TokenBucket, truncateText } from "./inputGuard.ts";

describe("clampVector", () => {
  it("keeps small vectors and scales large ones keeping direction", () => {
    expect(clampVector(3, 4, 10)).toEqual({ dx: 3, dy: 4 });
    const c = clampVector(3000, 4000, 100);
    expect(Math.hypot(c.dx, c.dy)).toBeCloseTo(100);
    expect(c.dx / c.dy).toBeCloseTo(0.75);
  });
  it("zeroes non-finite input", () => {
    expect(clampVector(NaN, 1, 10)).toEqual({ dx: 0, dy: 0 });
    expect(clampVector(Infinity, 1, 10)).toEqual({ dx: 0, dy: 0 });
  });
});

describe("truncateText", () => {
  it("does not split surrogate pairs", () => {
    expect(truncateText("ab😀", 3)).toBe("ab");
    expect(truncateText("ab😀", 4)).toBe("ab😀");
    expect(truncateText("abc", 0)).toBe("");
  });
});

describe("TokenBucket", () => {
  it("grants burst, then refills with time", () => {
    let t = 0;
    const b = new TokenBucket(10, 5, () => t);
    expect(b.take(8)).toBe(5);
    expect(b.take(1)).toBe(0);
    t = 500;
    expect(b.take(10)).toBe(5);
    t = 10_000;
    expect(b.take(100)).toBe(5); // capped at burst
  });
});

describe("InputGuard", () => {
  it("rate limits messages", () => {
    let t = 0;
    const g = new InputGuard(() => t);
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (g.allowMessage()) ok++;
    expect(ok).toBe(LIMITS.msgBurst);
    t = 1000;
    expect(g.allowMessage()).toBe(true);
  });
  it("limits typed characters per second", () => {
    let t = 0;
    const g = new InputGuard(() => t);
    const big = "x".repeat(LIMITS.textBurst);
    expect(g.allowText(big)).toBe(big);
    expect(g.allowText("hello")).toBe("");
    t = 1000;
    expect(g.allowText("x".repeat(5000)).length).toBe(LIMITS.textCharsPerSec);
  });
  it("clamps move and scroll magnitudes", () => {
    const g = new InputGuard();
    const m = g.move(10_000, 0);
    expect(m.dx).toBe(LIMITS.maxMovePerMsg);
    expect(g.scroll(0, -10_000).dy).toBe(-LIMITS.maxScrollPerMsg);
  });
});
