import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dirOf, SWIPE, SwipeTracker, type SwipeEvent } from "./swipe.ts";

let events: SwipeEvent[];
let t: SwipeTracker;
const navs = () => events.filter((e) => e.kind === "nav").map((e) => (e.kind === "nav" ? e.dir : ""));

beforeEach(() => {
  vi.useFakeTimers();
  events = [];
  t = new SwipeTracker((e) => events.push(e), {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  });
});
afterEach(() => vi.useRealTimers());

describe("dirOf", () => {
  it("picks the dominant axis and ignores short moves", () => {
    expect(dirOf(40, 10, 32)).toBe("right");
    expect(dirOf(-40, 10, 32)).toBe("left");
    expect(dirOf(5, -50, 32)).toBe("up");
    expect(dirOf(5, 50, 32)).toBe("down");
    expect(dirOf(20, 20, 32)).toBeNull();
  });
});

describe("SwipeTracker", () => {
  it("a quick still touch is OK", () => {
    t.pointerDown(100, 100);
    t.pointerMove(103, 101);
    vi.advanceTimersByTime(120);
    t.pointerUp();
    expect(events).toEqual([{ kind: "ok" }]);
  });

  it("a slow touch or one that wandered is not a tap", () => {
    t.pointerDown(100, 100);
    vi.advanceTimersByTime(SWIPE.tapMaxMs + 50);
    t.pointerUp();
    t.pointerDown(100, 100);
    t.pointerMove(120, 100);
    t.pointerUp();
    expect(events).toEqual([]);
  });

  it("one swipe past the threshold sends one step, and never OK", () => {
    t.pointerDown(100, 100);
    t.pointerMove(100 + SWIPE.threshold + 2, 104);
    t.pointerUp();
    expect(navs()).toEqual(["right"]);
    expect(events.some((e) => e.kind === "ok")).toBe(false);
  });

  it("a long flick sends extra steps", () => {
    t.pointerDown(100, 300);
    t.pointerMove(100, 300 - 40);
    t.pointerMove(100, 300 - 40 - SWIPE.step);
    t.pointerMove(100, 300 - 40 - 2 * SWIPE.step);
    t.pointerUp();
    expect(navs()).toEqual(["up", "up", "up"]);
  });

  it("holding after a step repeats, faster over time, until lifted", () => {
    t.pointerDown(100, 100);
    t.pointerMove(140, 100);
    expect(navs()).toHaveLength(1);
    vi.advanceTimersByTime(SWIPE.holdDelay - 1);
    expect(navs()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(navs()).toHaveLength(2);
    vi.advanceTimersByTime(SWIPE.holdInterval);
    expect(navs()).toHaveLength(3);
    vi.advanceTimersByTime(2000);
    const held = navs().length;
    expect(held).toBeGreaterThan(2000 / SWIPE.holdInterval + 2);
    t.pointerUp();
    vi.advanceTimersByTime(2000);
    expect(navs().length).toBe(held);
    expect(new Set(navs())).toEqual(new Set(["right"]));
  });

  it("changes direction mid-gesture", () => {
    t.pointerDown(100, 100);
    t.pointerMove(140, 100);
    t.pointerMove(140, 140);
    t.pointerUp();
    expect(navs()).toEqual(["right", "down"]);
  });

  it("cancel stops a running repeat", () => {
    t.pointerDown(100, 100);
    t.pointerMove(100, 60);
    t.cancel();
    vi.advanceTimersByTime(2000);
    expect(navs()).toEqual(["up"]);
  });
});
