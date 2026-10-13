import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteConfig } from "@tvdeck/protocol";
import { DEFAULT_BUTTONS, REPEAT, RemoteButtons, resolveButtons, resolveHid, type ButtonDeps } from "./actions.ts";

function make(over: Partial<ButtonDeps> = {}) {
  const calls: string[] = [];
  const deps: ButtonDeps = {
    tap: (k) => void calls.push(`tap:${k}`),
    home: () => void calls.push("home"),
    back: () => void calls.push("back"),
    open: async (id) => void calls.push(`open:${id}`),
    hasTile: (id) => id !== "ghost",
    buttons: () => DEFAULT_BUTTONS,
    allow: () => true,
    warn: (m) => void calls.push(`warn:${m}`),
    info: () => {},
    ...over,
  };
  return { calls, b: new RemoteButtons(deps) };
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("RemoteButtons", () => {
  it("taps once on press, repeats after 400 ms every 90 ms, stops on release", () => {
    const { b, calls } = make();
    b.press("down");
    expect(calls).toEqual(["tap:down"]);
    vi.advanceTimersByTime(REPEAT.delayMs - 1);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1 + REPEAT.intervalMs * 3);
    expect(calls).toHaveLength(1 + 3);
    b.release("down");
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(1 + 3);
  });
  it("a short press does not repeat", () => {
    const { b, calls } = make();
    b.press("left");
    vi.advanceTimersByTime(100);
    b.release("left");
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual(["tap:left"]);
  });
  it("releaseAll (disconnect) stops repeating", () => {
    const { b, calls } = make();
    b.press("up");
    vi.advanceTimersByTime(600);
    b.releaseAll();
    const n = calls.length;
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(n);
  });
  it("gives up repeating after the safety timeout", () => {
    const { b, calls } = make();
    b.press("right");
    vi.advanceTimersByTime(REPEAT.maxHoldMs + 100);
    const n = calls.length;
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(n);
  });
  it("a new arrow replaces the previous repeat", () => {
    const { b, calls } = make();
    b.press("up");
    b.press("down");
    calls.length = 0;
    vi.advanceTimersByTime(REPEAT.delayMs + REPEAT.intervalMs);
    expect(new Set(calls)).toEqual(new Set(["tap:down"]));
  });
  it("OK is Enter", () => {
    const { b, calls } = make();
    b.press("ok");
    expect(calls).toEqual(["tap:enter"]);
  });
  it("maps the configurable buttons", () => {
    const { b, calls } = make();
    b.press("netflix");
    b.press("prime");
    b.press("apps");
    b.press("assistant");
    expect(calls).toEqual(["open:netflix", "open:prime", "home"]);
  });
  it("warns for a missing tile", () => {
    const { b, calls } = make({ buttons: () => ({ ...DEFAULT_BUTTONS, prime: { open: "ghost" } }) });
    b.press("prime");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^warn:.*ghost/);
  });
  it("supports back and honours the guard", () => {
    const { b, calls } = make({ buttons: () => ({ ...DEFAULT_BUTTONS, assistant: "back" }) });
    b.press("assistant");
    expect(calls).toEqual(["back"]);
    const g = make({ allow: () => false });
    g.b.press("up");
    g.b.press("apps");
    expect(g.calls).toEqual([]);
  });
});

describe("remote config", () => {
  it("resolves defaults and overrides", () => {
    expect(resolveButtons(undefined)).toEqual(DEFAULT_BUTTONS);
    expect(resolveButtons({ buttons: { apps: "back", prime: { open: "x" } } })).toEqual({
      ...DEFAULT_BUTTONS,
      apps: "back",
      prime: { open: "x" },
    });
    expect(resolveHid({ hid: { productId: 5 } })).toEqual({ vendorId: 0x2717, productId: 5 });
  });
  it("validates with zod", () => {
    expect(RemoteConfig.safeParse({ buttons: { netflix: { open: "nf" }, apps: "home", assistant: "none" }, hid: { vendorId: 1 } }).success).toBe(true);
    expect(RemoteConfig.safeParse({ buttons: { netflix: "launch" } }).success).toBe(false);
    expect(RemoteConfig.safeParse({ buttons: { power: "home" } }).success).toBe(false);
    expect(RemoteConfig.safeParse({ hid: { vendorId: -1 } }).success).toBe(false);
  });
});
