import { describe, expect, it } from "vitest";
import { accentOf, backdropColor, classifyLogo, darkenForWhite, contrastOnWhite, luminance, parseColor, surfaceFor, wordmarkSize } from "./tileInfo.ts";

describe("accentOf", () => {
  it("keeps valid colours, derives a stable one otherwise", () => {
    expect(accentOf({ id: "a", accent: "#e5384a" })).toBe("#e5384a");
    expect(accentOf({ id: "abc" })).toBe(accentOf({ id: "abc" }));
    expect(accentOf({ id: "abc" })).not.toBe(accentOf({ id: "abd" }));
    expect(accentOf({ id: "a", accent: "red; background:url(x)" })).toMatch(/^#/);
  });
});

describe("luminance / wordmarkSize", () => {
  it("rates light and dark colours", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 2);
    expect(luminance("#000")).toBe(0);
    expect(luminance("hsl(1 1% 1%)")).toBeNull();
  });
  it("shrinks long titles", () => {
    expect(wordmarkSize("VLC")).toBeGreaterThan(wordmarkSize("Steam Big Picture"));
    expect(wordmarkSize("Steam Big Picture")).toBeGreaterThanOrEqual(32);
  });
});

describe("parseColor", () => {
  it("reads hex, rgb and hsl", () => {
    expect(parseColor("#e5384a")).toEqual({ r: 229, g: 56, b: 74 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("rgb(10 20 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColor("hsl(0 100% 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("oklch(0.5 0.1 20)")).toBeNull();
  });
});

describe("icon surface", () => {
  const white = { lum: 1, rgb: { r: 255, g: 255, b: 255 } };
  const black = { lum: 0, rgb: { r: 10, g: 10, b: 10 } };
  const red = { lum: 0.21, rgb: { r: 229, g: 9, b: 20 } };
  it("classifies logos by what is visible", () => {
    expect(classifyLogo(white)).toBe("light");
    expect(classifyLogo(black)).toBe("dark");
    expect(classifyLogo(red)).toBe("mixed");
    expect(classifyLogo({ lum: 0.8, rgb: { r: 255, g: 220, b: 40 } })).toBe("mixed"); // light but saturated
  });
  it("puts white logos on the darkened accent, others on a neutral", () => {
    const s = surfaceFor("#18a8e8", "light");
    expect(s.kind).toBe("accent");
    expect(contrastOnWhite(parseColor(s.base)!)).toBeGreaterThanOrEqual(3.3);
    expect(surfaceFor("#18a8e8", "dark").kind).toBe("light");
    expect(surfaceFor("#18a8e8", "mixed").kind).toBe("dark");
    expect(surfaceFor("#18a8e8", null).kind).toBe("dark"); // not measured yet: the safe default
  });
  it("leaves dark enough accents alone and handles unparseable ones", () => {
    const c = { r: 11, g: 63, b: 117 };
    expect(darkenForWhite(c)).toEqual(c);
    expect(surfaceFor("oklch(0.6 0.2 30)", "light").base).toContain("color-mix");
  });
  it("lights the hero with the logo colour when the accent is nearly grey", () => {
    expect(backdropColor("#141414", { r: 229, g: 9, b: 20 })).toBe("#e50914");
    expect(backdropColor("#8b4dff", { r: 229, g: 9, b: 20 })).toBe("#8b4dff");
    expect(backdropColor("#141414", { r: 250, g: 250, b: 250 })).toBe("#141414");
  });
});
