import { describe, expect, it } from "vitest";
import { accelerate, Accumulator, buildChord, buildClick, buildScroll, buildTap, buildText, KEYEVENTF, MOUSEEVENTF } from "./input.ts";

const scan = (vk: number) => vk + 100;

describe("input builders", () => {
  it("tap = down then up, extended flag on arrows only", () => {
    const [d, u] = buildTap("up", scan);
    expect(d?.u.ki).toMatchObject({ wVk: 0x26, wScan: 0x26 + 100, dwFlags: KEYEVENTF.EXTENDEDKEY });
    expect(u?.u.ki?.dwFlags).toBe(KEYEVENTF.EXTENDEDKEY | KEYEVENTF.KEYUP);
    const [d2, u2] = buildTap("enter", scan);
    expect(d2?.u.ki?.dwFlags).toBe(0);
    expect(u2?.u.ki?.dwFlags).toBe(KEYEVENTF.KEYUP);
  });
  it("chord presses in order and releases in reverse", () => {
    const seq = buildChord(["alt", "left"], scan).map((i) => [i.u.ki?.wVk, !!((i.u.ki?.dwFlags ?? 0) & KEYEVENTF.KEYUP)]);
    expect(seq).toEqual([[0x12, false], [0x25, false], [0x25, true], [0x12, true]]);
  });
  it("text uses unicode flag per UTF-16 unit and maps newline to Enter", () => {
    const items = buildText("é✓\n😀", scan);
    expect(items.length).toBe(2 + 2 + 2 + 4); // e-acute, check, enter, surrogate pair
    expect(items[0]?.u.ki).toMatchObject({ wVk: 0, wScan: 0xe9, dwFlags: KEYEVENTF.UNICODE });
    expect(items[1]?.u.ki?.dwFlags).toBe(KEYEVENTF.UNICODE | KEYEVENTF.KEYUP);
    expect(items[4]?.u.ki?.wVk).toBe(0x0d);
    expect(items[6]?.u.ki?.wScan).toBe(0xd83d);
  });
  it("clicks and scroll produce the right flags", () => {
    expect(buildClick("right").map((i) => i.u.mi?.dwFlags)).toEqual([MOUSEEVENTF.RIGHTDOWN, MOUSEEVENTF.RIGHTUP]);
    expect(buildClick("left", true)).toHaveLength(4);
    const [w] = buildScroll(0, 1);
    expect(w?.u.mi?.dwFlags).toBe(MOUSEEVENTF.WHEEL);
    expect(w?.u.mi?.mouseData).toBe((-120) >>> 0);
    expect(buildScroll(1, 0)[0]?.u.mi?.dwFlags).toBe(MOUSEEVENTF.HWHEEL);
    expect(buildScroll(0, 0)).toEqual([]);
  });
  it("acceleration is monotonic and clamped", () => {
    expect(accelerate(1, 0).dx).toBeGreaterThan(1);
    expect(Math.abs(accelerate(1000, 0).dx / 1000)).toBeLessThanOrEqual(4);
    expect(accelerate(-10, 0).dx).toBeLessThan(0);
  });
  it("accumulator keeps fractions", () => {
    const a = new Accumulator();
    expect(a.push(0.6, 0)).toEqual({ x: 0, y: 0 });
    expect(a.push(0.6, 0).x).toBe(1);
  });
});
