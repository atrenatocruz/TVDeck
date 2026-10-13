import { describe, expect, it } from "vitest";
import { SCROLL_GAIN, SENSITIVITY, TouchpadGestures } from "./gestures.ts";

const mk = (s = 1) => new TouchpadGestures(() => s);

describe("one finger", () => {
  it("a short still touch is a left click", () => {
    const g = mk();
    g.down(1, 100, 100, 0);
    g.move(1, 103, 102, 20); // jitter inside the slop
    expect(g.takeFrame()).toEqual({});
    expect(g.up(1, 120)).toEqual([{ kind: "click", button: "left" }]);
  });

  it("a long press is not a click", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    expect(g.up(1, 400)).toEqual([]);
  });

  it("dragging past the slop moves and never clicks, paying out the held-back travel", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.move(1, 5, 0, 10);
    expect(g.takeFrame()).toEqual({});
    g.move(1, 12, 0, 20); // crosses 8px: moves the whole 12
    g.move(1, 15, 3, 30);
    expect(g.takeFrame().move).toEqual({ dx: 15, dy: 3 });
    expect(g.up(1, 80)).toEqual([]);
  });

  it("sums several moves into one frame and scales by sensitivity", () => {
    const g = mk(SENSITIVITY.fast);
    g.down(1, 0, 0, 0);
    g.move(1, 20, 0, 5);
    g.takeFrame();
    g.move(1, 30, 0, 10);
    g.move(1, 40, 0, 12);
    expect(g.takeFrame().move).toEqual({ dx: 20 * SENSITIVITY.fast, dy: 0 });
    expect(g.takeFrame()).toEqual({});
  });

  it("two quick taps give two left clicks (the OS makes the double click)", () => {
    const g = mk();
    const clicks = [];
    for (const t0 of [0, 150]) {
      g.down(1, 50, 50, t0);
      clicks.push(...g.up(1, t0 + 60));
    }
    expect(clicks).toEqual([
      { kind: "click", button: "left" },
      { kind: "click", button: "left" },
    ]);
  });

  it("a cancelled touch never clicks", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.cancel(1);
    g.down(2, 0, 0, 100);
    expect(g.up(2, 150)).toEqual([{ kind: "click", button: "left" }]);
  });
});

describe("two fingers", () => {
  it("a still two-finger tap is a right click", () => {
    const g = mk();
    g.down(1, 100, 100, 0);
    g.down(2, 160, 100, 10);
    expect(g.up(1, 90)).toEqual([]);
    expect(g.up(2, 100)).toEqual([{ kind: "click", button: "right" }]);
  });

  it("a slow two-finger press is not a click", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.down(2, 40, 0, 10);
    g.up(1, 500);
    expect(g.up(2, 520)).toEqual([]);
  });

  it("dragging both fingers scrolls with natural direction and both axes", () => {
    const g = mk();
    g.down(1, 100, 200, 0);
    g.down(2, 160, 200, 5);
    g.move(1, 100, 180, 20);
    g.move(2, 160, 180, 20); // fingers moved up 20: page scrolls down
    const s = g.takeFrame().scroll!;
    expect(s.dy).toBeCloseTo(20 * SCROLL_GAIN, 1);
    expect(s.dx).toBeCloseTo(0, 5);
    g.move(1, 80, 180, 30);
    g.move(2, 140, 180, 30); // fingers moved left 20: view scrolls right
    const f = g.takeFrame();
    expect(f.scroll!.dx).toBeCloseTo(20 * SCROLL_GAIN, 1);
    expect(f.move).toBeUndefined();
  });

  it("scrolling never ends in a click, and a trailing finger does not move the cursor", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.down(2, 50, 0, 5);
    g.move(1, 0, 40, 20);
    g.move(2, 50, 40, 20);
    g.takeFrame();
    expect(g.up(1, 60)).toEqual([]);
    g.move(2, 80, 90, 70);
    expect(g.takeFrame()).toEqual({});
    expect(g.up(2, 80)).toEqual([]);
  });

  it("moving one finger first and then adding a second is not a right click", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.move(1, 30, 0, 10);
    g.down(2, 80, 0, 20);
    g.up(2, 60);
    expect(g.up(1, 70)).toEqual([]);
  });

  it("three fingers do nothing", () => {
    const g = mk();
    g.down(1, 0, 0, 0);
    g.down(2, 30, 0, 5);
    g.down(3, 60, 0, 10);
    g.move(1, 0, 50, 20);
    expect(g.takeFrame()).toEqual({});
    g.up(1, 40);
    g.up(2, 41);
    expect(g.up(3, 42)).toEqual([]);
  });
});
