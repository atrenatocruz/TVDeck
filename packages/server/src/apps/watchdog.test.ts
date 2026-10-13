import { describe, expect, it } from "vitest";
import { LauncherWatchdog } from "./watchdog.ts";

describe("LauncherWatchdog", () => {
  it("does nothing while the window exists", () => {
    const w = new LauncherWatchdog();
    for (let t = 0; t < 60_000; t += 1000) expect(w.tick(t, true)).toBe(false);
  });
  it("relaunches after ~5 s of absence", () => {
    const w = new LauncherWatchdog();
    expect(w.tick(0, false)).toBe(false);
    expect(w.tick(4000, false)).toBe(false);
    expect(w.tick(5000, false)).toBe(true);
  });
  it("a window that comes back resets the timer", () => {
    const w = new LauncherWatchdog();
    w.tick(0, false);
    w.tick(3000, true);
    expect(w.tick(4000, false)).toBe(false);
    expect(w.tick(8999, false)).toBe(false);
    expect(w.tick(9000, false)).toBe(true);
  });
  it("does not count time spent while a launch is in flight", () => {
    const w = new LauncherWatchdog();
    for (let t = 0; t < 20_000; t += 1000) expect(w.tick(t, false, true)).toBe(false);
    expect(w.tick(20_000, false)).toBe(false);
    expect(w.tick(25_000, false)).toBe(true);
  });
  it("backs off when the launcher keeps dying", () => {
    const w = new LauncherWatchdog();
    let now = 0;
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const start = now;
      w.tick(now, false);
      while (!w.tick(now, false)) now += 1000;
      waits.push(now - start);
    }
    expect(waits.slice(0, 3)).toEqual([5000, 5000, 5000]);
    expect(waits[3]).toBe(10_000);
    expect(waits[4]).toBe(20_000);
    expect(waits[5]).toBe(40_000);
    expect(waits[6]).toBe(60_000);
  });
  it("forgets old deaths", () => {
    const w = new LauncherWatchdog({ windowMs: 60_000 });
    for (const t of [0, 5000, 10_000, 20_000]) {
      w.tick(t, false);
      w.tick(t + 59_999, false);
    }
    expect(w.delayMs(1_000_000)).toBe(5000);
  });
});
