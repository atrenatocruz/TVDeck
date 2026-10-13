import { describe, expect, it } from "vitest";
import type { Hello } from "@tvdeck/protocol";
import { decideAuth, isOriginAllowed } from "./wsPolicy.ts";

const ctx = { sharedToken: "shared-secret-token", launcherKey: "launcher-key" };
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
  it("accepts the shared token for remotes only", () => {
    expect(decideAuth(hello("remote", { kind: "shared", token: ctx.sharedToken }), ctx)).toEqual({ ok: true, role: "remote" });
    expect(decideAuth(hello("launcher", { kind: "shared", token: ctx.sharedToken }), ctx).ok).toBe(false);
  });
  it("accepts the launcher key for the launcher role only", () => {
    expect(decideAuth(hello("launcher", { kind: "launcher", key: ctx.launcherKey }), ctx)).toEqual({ ok: true, role: "launcher" });
    expect(decideAuth(hello("remote", { kind: "launcher", key: ctx.launcherKey }), ctx).ok).toBe(false);
  });
  it("never lets launcher-kind auth or the launcher role cross over", () => {
    expect(decideAuth(hello("launcher", { kind: "launcher", key: "wrong" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("launcher", { kind: "shared", token: ctx.launcherKey }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "launcher", key: ctx.launcherKey }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "shared", token: ctx.launcherKey }), ctx).ok).toBe(false);
  });
  it("rejects wrong tokens and not-yet-supported kinds", () => {
    expect(decideAuth(hello("remote", { kind: "shared", token: "nope" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "device", token: "x" }), ctx).ok).toBe(false);
    expect(decideAuth(hello("remote", { kind: "pair", code: "x", deviceName: "y" }), ctx).ok).toBe(false);
  });
});
