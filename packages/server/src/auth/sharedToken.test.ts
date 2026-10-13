import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkToken, loadOrCreateSecrets, loadOrCreateToken, newLauncherKey } from "./sharedToken.ts";

describe("sharedToken", () => {
  it("creates once then reuses the same token", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-")), "secret.json");
    const t = loadOrCreateToken(f);
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(loadOrCreateToken(f)).toBe(t);
  });
  it("persists the launcher key next to the token and keeps both across loads", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-")), "secret.json");
    fs.writeFileSync(f, JSON.stringify({ token: "t".repeat(43) }));
    const a = loadOrCreateSecrets(f);
    expect(a.token).toBe("t".repeat(43));
    expect(a.launcherKey.length).toBeGreaterThanOrEqual(20);
    expect(loadOrCreateSecrets(f)).toEqual(a);
  });
  it("checkToken is exact and length-safe", () => {
    expect(checkToken("abc", "abc")).toBe(true);
    expect(checkToken("abc", "abd")).toBe(false);
    expect(checkToken("abc", "abcd")).toBe(false);
    expect(checkToken("abc", "")).toBe(false);
  });
  it("launcher keys are unique", () => {
    expect(newLauncherKey()).not.toBe(newLauncherKey());
  });
});
