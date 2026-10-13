import { describe, expect, it } from "vitest";
import { accentOf, greeting, luminance, wordmarkSize } from "./tileInfo.ts";

describe("accentOf", () => {
  it("keeps valid colours, derives a stable one otherwise", () => {
    expect(accentOf({ id: "a", accent: "#e5384a" })).toBe("#e5384a");
    expect(accentOf({ id: "abc" })).toBe(accentOf({ id: "abc" }));
    expect(accentOf({ id: "abc" })).not.toBe(accentOf({ id: "abd" }));
    expect(accentOf({ id: "a", accent: "red; background:url(x)" })).toMatch(/^#/);
  });
});

describe("luminance / wordmarkSize / greeting", () => {
  it("rates light and dark colours", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 2);
    expect(luminance("#000")).toBe(0);
    expect(luminance("hsl(1 1% 1%)")).toBeNull();
  });
  it("shrinks long titles", () => {
    expect(wordmarkSize("VLC")).toBeGreaterThan(wordmarkSize("Steam Big Picture"));
    expect(wordmarkSize("Steam Big Picture")).toBeGreaterThanOrEqual(32);
  });
  it("greets by time of day", () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 20))).toBe("Good evening");
    expect(greeting(new Date(2026, 0, 1, 2))).toBe("Good night");
  });
});
