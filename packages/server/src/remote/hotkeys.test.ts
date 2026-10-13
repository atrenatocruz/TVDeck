import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHotkeys } from "./hotkeys.ts";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

function api(ok: (vk: number) => boolean) {
  const queue: number[] = [];
  const reg: number[] = [];
  const unreg: number[] = [];
  return {
    queue,
    reg,
    unreg,
    api: {
      available: true,
      RegisterHotKey: (id: number, _m: number, vk: number) => (ok(vk) ? (reg.push(id), true) : false),
      UnregisterHotKey: (id: number) => (unreg.push(id), true),
      PeekHotkey: () => queue.shift() ?? null,
    },
  };
}

describe("startHotkeys", () => {
  it("registers both, dispatches, and unregisters on stop", () => {
    const a = api(() => true);
    const calls: string[] = [];
    const h = startHotkeys(() => calls.push("home"), () => calls.push("back"), a.api, 30);
    expect(a.reg).toHaveLength(2);
    a.queue.push(a.reg[1]!, a.reg[0]!, 9999);
    vi.advanceTimersByTime(30);
    expect(calls).toEqual(["back", "home"]);
    h.stop();
    expect([...a.unreg].sort()).toEqual([...a.reg].sort());
  });
  it("continues when one registration fails", () => {
    const a = api((vk) => vk !== 0xa6);
    const calls: string[] = [];
    const h = startHotkeys(() => calls.push("home"), () => calls.push("back"), a.api);
    expect(a.reg).toHaveLength(1);
    a.queue.push(a.reg[0]!);
    vi.advanceTimersByTime(30);
    expect(calls).toEqual(["home"]);
    h.stop();
  });
  it("does nothing when both fail", () => {
    const a = api(() => false);
    const h = startHotkeys(() => {}, () => {}, a.api);
    h.stop();
    expect(a.unreg).toEqual([]);
  });
});
