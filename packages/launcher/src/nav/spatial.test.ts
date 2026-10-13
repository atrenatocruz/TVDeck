import { describe, expect, it } from "vitest";
import { navigate, navigateWithControls, pickNext, scrollIntoRow, type FocusRect, type RowMemory } from "./spatial.ts";

/** rows of tiles 100x60 with 20px gaps; row pitch 100. */
function grid(counts: number[], xOffset: number[] = []): FocusRect[] {
  const out: FocusRect[] = [];
  counts.forEach((n, row) => {
    for (let i = 0; i < n; i++) out.push({ id: `r${row}c${i}`, row, x: (xOffset[row] ?? 0) + i * 120, y: row * 100, w: 100, h: 60 });
  });
  return out;
}

describe("pickNext", () => {
  const rects = grid([4, 4]);
  const by = (id: string) => rects.find((r) => r.id === id)!;
  it("moves to the neighbour in each direction", () => {
    expect(pickNext(by("r0c1"), rects, "right")?.id).toBe("r0c2");
    expect(pickNext(by("r0c1"), rects, "left")?.id).toBe("r0c0");
    expect(pickNext(by("r0c1"), rects, "down")?.id).toBe("r1c1");
    expect(pickNext(by("r1c2"), rects, "up")?.id).toBe("r0c2");
  });
  it("returns null when nothing lies in that half-plane", () => {
    expect(pickNext(by("r0c0"), rects, "left")).toBeNull();
    expect(pickNext(by("r0c0"), rects, "up")).toBeNull();
    expect(pickNext(by("r1c3"), rects, "down")).toBeNull();
  });
  it("prefers the aligned candidate over a closer but offset one", () => {
    const a: FocusRect = { id: "a", row: 0, x: 0, y: 0, w: 100, h: 100 };
    const aligned: FocusRect = { id: "aligned", row: 0, x: 200, y: 0, w: 100, h: 100 };
    const offset: FocusRect = { id: "offset", row: 1, x: 120, y: 180, w: 100, h: 100 };
    expect(pickNext(a, [a, aligned, offset], "right")?.id).toBe("aligned");
  });
});

describe("navigate", () => {
  it("stops at row edges (no wrap)", () => {
    const rects = grid([3, 5]);
    const mem: RowMemory = new Map();
    expect(navigate(rects, "r0c2", "right", mem)).toBeNull();
    expect(navigate(rects, "r0c0", "left", mem)).toBeNull();
    // row 1 is longer, but moving right inside row 0 never escapes into it
    expect(navigate(rects, "r1c4", "right", mem)).toBeNull();
  });
  it("stops at the first and last rows", () => {
    const rects = grid([3, 3]);
    expect(navigate(rects, "r0c1", "up", new Map())).toBeNull();
    expect(navigate(rects, "r1c1", "down", new Map())).toBeNull();
  });
  it("lands on the geometrically nearest tile when the row has no memory", () => {
    const rects = grid([5, 2]);
    expect(navigate(rects, "r0c4", "down", new Map())).toBe("r1c1");
    expect(navigate(rects, "r0c0", "down", new Map())).toBe("r1c0");
  });
  it("lands on the remembered tile of the target row", () => {
    const rects = grid([4, 4]);
    const mem: RowMemory = new Map([[1, "r1c3"]]);
    expect(navigate(rects, "r0c0", "down", mem)).toBe("r1c3");
  });
  it("ignores a remembered tile that no longer exists", () => {
    const rects = grid([4, 2]);
    const mem: RowMemory = new Map([[1, "gone"]]);
    expect(navigate(rects, "r0c0", "down", mem)).toBe("r1c0");
  });
  it("skips empty rows and falls back to the first tile when nothing is focused", () => {
    const rects = grid([2, 0, 2]);
    expect(navigate(rects, "r0c1", "down", new Map())).toBe("r2c1");
    expect(navigate(rects, null, "down", new Map())).toBe("r0c0");
    expect(navigate([], null, "down", new Map())).toBeNull();
  });
});

describe("scrollIntoRow", () => {
  it("does not move when the tile is already comfortably visible", () => {
    expect(scrollIntoRow(0, 120, 480, 1920, 4000, 120, 220)).toBe(0);
  });
  it("scrolls just enough to reveal a tile past the right margin", () => {
    expect(scrollIntoRow(0, 1700, 2060, 1920, 4000, 120, 220)).toBe(2060 - (1920 - 220));
  });
  it("scrolls back left and clamps to the content", () => {
    expect(scrollIntoRow(800, 500, 860, 1920, 4000, 120, 220)).toBe(380);
    expect(scrollIntoRow(0, 3700, 4060, 1920, 4000, 120, 220)).toBe(2080);
    expect(scrollIntoRow(50, 120, 480, 1920, 1000, 120, 220)).toBe(0);
  });
});

describe("navigateWithControls", () => {
  const rects = grid([3, 3]);
  const C = "@phones";
  it("reaches the corner controls with Up from the first row only", () => {
    expect(navigateWithControls(rects, "r0c1", "up", new Map(), C)).toBe(C);
    expect(navigateWithControls(rects, "r1c1", "up", new Map(), C)).toBe("r0c1");
  });
  it("comes back down to the remembered tile of the first row", () => {
    expect(navigateWithControls(rects, C, "down", new Map([[0, "r0c2"]]), C)).toBe("r0c2");
    expect(navigateWithControls(rects, C, "down", new Map(), C)).toBe("r0c0");
    expect(navigateWithControls(rects, C, "down", new Map([[0, "gone"]]), C)).toBe("r0c0");
  });
  it("ignores other keys on the controls and edges elsewhere", () => {
    for (const d of ["up", "left", "right"] as const) expect(navigateWithControls(rects, C, d, new Map(), C)).toBeNull();
    expect(navigateWithControls(rects, "r1c2", "down", new Map(), C)).toBeNull();
    expect(navigateWithControls(rects, "r0c0", "left", new Map(), C)).toBeNull();
  });
});
