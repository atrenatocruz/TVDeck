import { describe, expect, it } from "vitest";
import { nudgeTarget } from "./tilt.ts";

describe("nudgeTarget", () => {
  it("leans toward the pressed direction", () => {
    expect(nudgeTarget("left")).toEqual({ tx: -1, ty: 0 });
    expect(nudgeTarget("right")).toEqual({ tx: 1, ty: 0 });
    expect(nudgeTarget("up")).toEqual({ tx: 0, ty: -1 });
    expect(nudgeTarget("down")).toEqual({ tx: 0, ty: 1 });
  });
});
