import { describe, expect, it } from "vitest";
import type { Tile } from "@tvdeck/protocol";
import { resolveTarget } from "./launchTile.ts";

const base = { id: "t", title: "T" } as const;
const web: Tile = { ...base, type: "web", url: "https://www.youtube.com" };
const o = { dataDir: "C:\\D", edge: "C:\\edge.exe" };

describe("resolveTarget", () => {
  it("web: edge with the apps profile", () => {
    const t = resolveTarget(web, o);
    expect(t.command).toBe("C:\\edge.exe");
    expect(t.args).toContain("--user-data-dir=C:\\D\\edge-apps");
  });
  it("web: clear error without Edge", () => {
    expect(() => resolveTarget(web, { ...o, edge: null })).toThrow(/Edge/);
  });
  it("exe: expands %ENV% in path and args, errors on a missing file", () => {
    process.env.TVDECK_TEST_DIR = "C:\\Apps";
    const tile: Tile = { ...base, type: "exe", path: "%TVDECK_TEST_DIR%\\x.exe", args: ["--dir=%TVDECK_TEST_DIR%"] };
    const t = resolveTarget(tile, { ...o, exists: () => "file" });
    expect(t.command).toBe("C:\\Apps\\x.exe");
    expect(t.args).toEqual(["--dir=C:\\Apps"]);
    expect(() => resolveTarget(tile, { ...o, exists: () => null })).toThrow(/file not found \(C:\\Apps\\x\.exe\)/);
  });
  it("exe: bare names are left to PATH", () => {
    const t = resolveTarget({ ...base, type: "exe", path: "notepad.exe" }, { ...o, exists: () => null });
    expect(t.command).toBe("notepad.exe");
  });
  it("uri and folder go through explorer", () => {
    expect(resolveTarget({ ...base, type: "uri", url: "steam://open/bigpicture" }, o)).toMatchObject({
      command: "explorer.exe",
      args: ["steam://open/bigpicture"],
    });
    expect(resolveTarget({ ...base, type: "folder", path: "C:\\V" }, { ...o, exists: () => "dir" })).toMatchObject({
      command: "explorer.exe",
      args: ["C:\\V"],
    });
    expect(() => resolveTarget({ ...base, type: "folder", path: "C:\\V" }, { ...o, exists: () => null })).toThrow(/folder not found/);
  });
});
