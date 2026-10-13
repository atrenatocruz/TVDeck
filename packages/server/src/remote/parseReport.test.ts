import { describe, expect, it } from "vitest";
import { diffPressed, parseReport } from "./parseReport.ts";

const p = (...b: number[]) => parseReport(b)!;

describe("parseReport", () => {
  it("decodes the measured buttons", () => {
    expect([...p(1, 0x02, 0).buttons]).toEqual(["up"]);
    expect([...p(1, 0x04, 0).buttons]).toEqual(["down"]);
    expect([...p(1, 0x08, 0).buttons]).toEqual(["left"]);
    expect([...p(1, 0x10, 0).buttons]).toEqual(["right"]);
    expect([...p(1, 0x01, 0).buttons]).toEqual(["ok"]);
    expect([...p(1, 0x40, 0).buttons]).toEqual(["assistant"]);
    expect([...p(1, 0x20, 0).buttons]).toEqual(["power"]);
    expect([...p(1, 0, 0x02).buttons]).toEqual(["apps"]);
    expect([...p(1, 0, 0x04).buttons]).toEqual(["netflix"]);
    expect([...p(1, 0, 0x20).buttons]).toEqual(["prime"]);
  });
  it("release is empty", () => {
    const r = p(1, 0, 0);
    expect(r.buttons.size).toBe(0);
    expect(r.unknown).toEqual([]);
  });
  it("tolerates short reports and ignores other report ids", () => {
    expect([...p(1, 0x02).buttons]).toEqual(["up"]);
    expect(parseReport([2, 0x02, 0])).toBeNull();
    expect(parseReport([1])).toBeNull();
  });
  it("reports unknown bits", () => {
    const r = p(1, 0x80, 0x01);
    expect(r.buttons.size).toBe(0);
    expect(r.unknown).toEqual(["b1:0x80", "b2:0x01"]);
  });
  it("combines simultaneous buttons", () => {
    expect([...p(1, 0x03, 0x04).buttons].sort()).toEqual(["netflix", "ok", "up"]);
  });
});

describe("diffPressed", () => {
  it("emits down then up edges", () => {
    const a = diffPressed(null, p(1, 0x02, 0));
    expect(a.down).toEqual(["up"]);
    const b = diffPressed(p(1, 0x02, 0), p(1, 0x02, 0)); // repeated identical report
    expect(b.down).toEqual([]);
    expect(b.up).toEqual([]);
    const c = diffPressed(p(1, 0x02, 0), p(1, 0, 0));
    expect(c.up).toEqual(["up"]);
  });
  it("moving from one button to another", () => {
    const d = diffPressed(p(1, 0x02, 0), p(1, 0x04, 0));
    expect(d.down).toEqual(["down"]);
    expect(d.up).toEqual(["up"]);
  });
  it("flags new unknown bits once", () => {
    const first = diffPressed(null, p(1, 0x80, 0));
    expect(first.newUnknown).toEqual(["b1:0x80"]);
    expect(diffPressed(p(1, 0x80, 0), p(1, 0x80, 0)).newUnknown).toEqual([]);
  });
});
