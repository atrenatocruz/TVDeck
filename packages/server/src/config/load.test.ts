import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureTilesFile, expandEnv, loadTilesFile, parseTilesConfig } from "./load.ts";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-cfg-"));
const EXAMPLE = path.resolve(import.meta.dirname, "../../../../config/tiles.example.json");

describe("parseTilesConfig", () => {
  it("accepts the shipped example", () => {
    expect(loadTilesFile(EXAMPLE).ok).toBe(true);
  });
  it("reports invalid JSON", () => {
    const r = parseTilesConfig("{ nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Invalid JSON/);
  });
  it("reports schema issues with paths", () => {
    const r = parseTilesConfig(JSON.stringify({ rows: [{ title: "A", tiles: [{ id: "Bad Id", title: "x", type: "web" }] }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("rows.0.tiles.0.id");
      expect(r.error).toContain("need a url");
    }
  });
  it("rejects duplicate ids", () => {
    const t = { id: "a", title: "A", type: "folder", path: "C:\\" };
    const r = parseTilesConfig(JSON.stringify({ rows: [{ title: "R", tiles: [t, t] }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('duplicate tile id "a"');
  });
  it("tolerates a BOM", () => {
    expect(parseTilesConfig("\uFEFF" + JSON.stringify({ rows: [] })).ok).toBe(true);
  });
});

describe("files", () => {
  it("copies the example only when missing", () => {
    const f = path.join(tmp(), "tiles.json");
    expect(ensureTilesFile(f, EXAMPLE)).toBe(true);
    fs.writeFileSync(f, '{"rows":[]}');
    expect(ensureTilesFile(f, EXAMPLE)).toBe(false);
    expect(fs.readFileSync(f, "utf8")).toBe('{"rows":[]}');
  });
  it("reports unreadable files", () => {
    expect(loadTilesFile(path.join(tmp(), "missing.json")).ok).toBe(false);
  });
});

describe("expandEnv", () => {
  it("expands case-insensitively and leaves unknown names", () => {
    expect(expandEnv("%userprofile%\\Videos", { USERPROFILE: "C:\\U" })).toBe("C:\\U\\Videos");
    expect(expandEnv("%NOPE%\\x", {})).toBe("%NOPE%\\x");
  });
});
