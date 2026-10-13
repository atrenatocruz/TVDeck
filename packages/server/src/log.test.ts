import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RotatingLog } from "./log.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-log-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("RotatingLog", () => {
  it("appends lines and creates the folder", () => {
    const f = path.join(dir, "a", "b", "t.log");
    const l = new RotatingLog(f, 1000, 3);
    l.write("one");
    l.write("two");
    expect(fs.readFileSync(f, "utf8")).toBe("one\ntwo\n");
  });
  it("rotates by size and keeps at most 3 files", () => {
    const f = path.join(dir, "r.log");
    const l = new RotatingLog(f, 100, 3);
    for (let i = 0; i < 40; i++) l.write(`line-${String(i).padStart(3, "0")}-xxxxxxxxxxxxxxxxxxxx`);
    const files = fs.readdirSync(dir).filter((n) => n.startsWith("r.log")).sort();
    expect(files).toEqual(["r.log", "r.log.1", "r.log.2"]);
    for (const n of files) expect(fs.statSync(path.join(dir, n)).size).toBeLessThanOrEqual(100);
    expect(fs.readFileSync(f, "utf8")).toContain("line-039");
  });
  it("continues from the existing file size", () => {
    const f = path.join(dir, "c.log");
    fs.writeFileSync(f, "x".repeat(95));
    new RotatingLog(f, 100, 3).write("0123456789");
    expect(fs.readFileSync(`${f}.1`, "utf8")).toHaveLength(95);
    expect(fs.readFileSync(f, "utf8")).toBe("0123456789\n");
  });
});
