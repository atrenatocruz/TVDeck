import { afterAll, describe, expect, it } from "vitest";
import type { Hello } from "@tvdeck/protocol";
import { decideAuth, isOriginAllowed, type AuthContext } from "./wsPolicy.ts";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Devices } from "./auth/devices.ts";
import { Pairing } from "./auth/pairing.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-pol-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const makeCtx = (allowShared = false): AuthContext => ({
  sharedToken: "shared-secret-token",
  launcherKey: "launcher-key",
  allowShared,
  devices: new Devices(path.join(tmp, `d${n++}.json`)),
  pairing: new Pairing(),
});
const hello = (role: Hello["role"], auth: Hello["auth"]): Hello => ({ type: "hello", v: 1, role, auth });

describe("isOriginAllowed", () => {
  it("requires an Origin that matches Host", () => {
    expect(isOriginAllowed("http://192.168.1.5:7420", "192.168.1.5:7420")).toBe(true);
    expect(isOriginAllowed("https://pc.tail1234.ts.net", "pc.tail1234.ts.net")).toBe(true);
  });
  it("rejects missing, foreign and malformed origins", () => {
    expect(isOriginAllowed(undefined, "192.168.1.5:7420")).toBe(false);
    expect(isOriginAllowed("http://evil.example", "192.168.1.5:7420")).toBe(false);
    expect(isOriginAllowed("http://192.168.1.5:9999", "192.168.1.5:7420")).toBe(false);
    expect(isOriginAllowed("not a url", "192.168.1.5:7420")).toBe(false);
    expect(isOriginAllowed("http://a", undefined)).toBe(false);
  });
});

describe("decideAuth", () => {
  it("rejects the shared token by default and accepts it when enabled (remote only)", () => {
    const off = makeCtx(false);
    const on = makeCtx(true);
    expect(decideAuth(hello("remote", { kind: "shared", token: "shared-secret-token" }), off).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "shared", token: "shared-secret-token" }), on)).toEqual({ ok: true, role: "remote" });
    expect(decideAuth(hello("remote", { kind: "shared", token: "wrong" }), on).ok).toBe(false);
    expect(decideAuth(hello("launcher", { kind: "shared", token: "shared-secret-token" }), on).ok).toBe(false);
  });
  it("accepts the launcher key for the launcher role only", () => {
    const ctx = makeCtx();
    expect(decideAuth(hello("launcher", { kind: "launcher", key: "launcher-key" }), ctx)).toEqual({ ok: true, role: "launcher" });
    expect(decideAuth(hello("remote", { kind: "launcher", key: "launcher-key" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("launcher", { kind: "launcher", key: "wrong" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "shared", token: "launcher-key" }), makeCtx(true)).ok).toBe(false);
  });
  it("accepts a device token for remotes only", () => {
    const ctx = makeCtx();
    const { token, device } = ctx.devices.create("Pixel");
    expect(decideAuth(hello("remote", { kind: "device", token }), ctx)).toEqual({ ok: true, role: "remote", deviceId: device.id });
    expect(decideAuth(hello("launcher", { kind: "device", token }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "device", token: "nope" }), ctx).ok).toBe(false);
  });
  it("rejects a revoked device", () => {
    const ctx = makeCtx();
    const { token, device } = ctx.devices.create("Pixel");
    ctx.devices.revoke(device.id);
    expect(decideAuth(hello("remote", { kind: "device", token }), ctx).ok).toBe(false);
  });
  it("pairs a remote with a valid code, once", () => {
    const ctx = makeCtx();
    const { code } = ctx.pairing.start();
    const d = decideAuth(hello("remote", { kind: "pair", code, deviceName: "Pixel" }), ctx);
    expect(d.ok && d.paired?.deviceToken).toBeTruthy();
    if (d.ok) expect(ctx.devices.verify(d.paired!.deviceToken)?.id).toBe(d.paired!.deviceId);
    expect(decideAuth(hello("remote", { kind: "pair", code, deviceName: "Again" }), ctx).ok).toBe(false);
    expect(ctx.devices.listInfo()).toHaveLength(1);
  });
  it("never pairs the launcher role or with a wrong code", () => {
    const ctx = makeCtx();
    const { code } = ctx.pairing.start();
    expect(decideAuth(hello("launcher", { kind: "pair", code, deviceName: "x" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "pair", code: "wrong", deviceName: "x" }), ctx).ok).toBe(false);
    expect(ctx.devices.listInfo()).toHaveLength(0);
    // the failed launcher attempt did not burn the code
    expect(decideAuth(hello("remote", { kind: "pair", code, deviceName: "x" }), ctx).ok).toBe(true);
  });
});
