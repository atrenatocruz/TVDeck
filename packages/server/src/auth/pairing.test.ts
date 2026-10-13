import { describe, expect, it } from "vitest";
import { Pairing, PAIRING_TTL_MS } from "./pairing.ts";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("Pairing", () => {
  it("issues a 128-bit base64url code that expires in 5 minutes", () => {
    const c = clock();
    const p = new Pairing(c.now);
    const { code, expiresAt } = p.start();
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(expiresAt).toBe(c.now() + PAIRING_TTL_MS);
    expect(PAIRING_TTL_MS).toBe(300_000);
  });
  it("redeems once", () => {
    const p = new Pairing(clock().now);
    const { code } = p.start();
    expect(p.redeem(code)).toBe(true);
    expect(p.redeem(code)).toBe(false);
  });
  it("rejects wrong codes without consuming the real one", () => {
    const p = new Pairing(clock().now);
    const { code } = p.start();
    expect(p.redeem("nope")).toBe(false);
    expect(p.redeem("")).toBe(false);
    expect(p.redeem(code)).toBe(true);
  });
  it("expires", () => {
    const c = clock();
    const p = new Pairing(c.now);
    const { code } = p.start();
    c.advance(PAIRING_TTL_MS - 1);
    expect(p.hasActive()).toBe(true);
    c.advance(1);
    expect(p.hasActive()).toBe(false);
    expect(p.redeem(code)).toBe(false);
  });
  it("a new code invalidates the previous one", () => {
    const p = new Pairing(clock().now);
    const a = p.start();
    const b = p.start();
    expect(a.code).not.toBe(b.code);
    expect(p.redeem(a.code)).toBe(false);
    expect(p.redeem(b.code)).toBe(true);
  });
  it("rejects everything when nothing was started", () => {
    expect(new Pairing(clock().now).redeem("anything")).toBe(false);
  });
  it("cancel invalidates the outstanding code", () => {
    const p = new Pairing(clock().now);
    const { code } = p.start();
    expect(p.cancel()).toBe(true);
    expect(p.hasActive()).toBe(false);
    expect(p.redeem(code)).toBe(false);
    expect(p.cancel()).toBe(false);
  });
});
