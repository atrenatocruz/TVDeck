import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Devices, LAST_SEEN_THROTTLE_MS, readDevicesFile } from "./devices.ts";

let dir: string;
let file: string;
let t = 1_000_000;
const now = () => t;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-dev-"));
  file = path.join(dir, "devices.json");
  t = 1_000_000;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Devices", () => {
  it("never stores the token in plain text", () => {
    const d = new Devices(file, now);
    const { token, device } = d.create("Pixel");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain(token);
    const rec = readDevicesFile(file)[0]!;
    expect(rec.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.id).toBe(device.id);
    expect(Object.keys(rec).sort()).toEqual(["createdAt", "id", "lastSeen", "name", "tokenHash"]);
  });
  it("verifies tokens and survives a restart", () => {
    const d = new Devices(file, now);
    const { token, device } = d.create("A");
    expect(d.verify(token)?.id).toBe(device.id);
    expect(d.verify(token + "x")).toBeNull();
    expect(d.verify("")).toBeNull();
    expect(new Devices(file, now).verify(token)?.id).toBe(device.id);
  });
  it("revokes", () => {
    const d = new Devices(file, now);
    const a = d.create("A");
    const b = d.create("B");
    expect(d.revoke(a.device.id)).toBe(true);
    expect(d.revoke(a.device.id)).toBe(false);
    expect(d.verify(a.token)).toBeNull();
    expect(d.verify(b.token)).not.toBeNull();
    expect(readDevicesFile(file)).toHaveLength(1);
  });
  it("trims and defaults names", () => {
    const d = new Devices(file, now);
    expect(d.create("  Pixel  ").device.name).toBe("Pixel");
    expect(d.create("   ").device.name).toBe("Phone");
  });
  it("throttles lastSeen writes to once a minute", () => {
    const d = new Devices(file, now);
    const { device } = d.create("A");
    t += 5_000;
    d.touch(device.id);
    expect(d.listInfo()[0]!.lastSeen).toBe(t); // in memory right away
    expect(readDevicesFile(file)[0]!.lastSeen).toBe(1_000_000); // disk untouched
    t += LAST_SEEN_THROTTLE_MS;
    d.touch(device.id);
    expect(readDevicesFile(file)[0]!.lastSeen).toBe(t);
  });
  it("reload reports devices removed externally", () => {
    const d = new Devices(file, now);
    const a = d.create("A");
    d.create("B");
    fs.writeFileSync(file, JSON.stringify(readDevicesFile(file).filter((x) => x.id !== a.device.id)));
    expect(d.reload()).toEqual([a.device.id]);
    expect(d.verify(a.token)).toBeNull();
  });
  it("writes atomically (no temp files left behind)", () => {
    const d = new Devices(file, now);
    d.create("A");
    expect(fs.readdirSync(dir)).toEqual(["devices.json"]);
  });
  it("tolerates a missing or corrupt file", () => {
    expect(new Devices(file, now).listInfo()).toEqual([]);
    fs.writeFileSync(file, "{not json");
    expect(new Devices(file, now).listInfo()).toEqual([]);
  });
});
