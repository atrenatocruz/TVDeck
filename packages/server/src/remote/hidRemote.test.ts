import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRemote, startHidRemote, type HidBackend, type HidHandle, type HidInfo } from "./hidRemote.ts";

const IDS = { vendorId: 0x2717, productId: 0x32b9 };
const DEV: HidInfo = { path: "\\\\?\\HID#x", ...IDS, usagePage: 0x0c, usage: 0x01 };

class Fake extends EventEmitter implements HidHandle {
  closed = false;
  close() {
    this.closed = true;
  }
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("findRemote", () => {
  it("matches vid/pid and the consumer collection only", () => {
    const other = { ...DEV, path: "b", usagePage: 0x01, usage: 0x06 };
    expect(findRemote([other, DEV], IDS)).toBe(DEV);
    expect(findRemote([other], IDS)).toBeUndefined();
    expect(findRemote([DEV], { vendorId: 1, productId: 2 })).toBeUndefined();
  });
});

describe("startHidRemote", () => {
  function setup(present: () => boolean) {
    const opened: Fake[] = [];
    const backend: HidBackend = {
      devices: () => (present() ? [DEV] : []),
      open: () => {
        const f = new Fake();
        opened.push(f);
        return f;
      },
    };
    const ev: string[] = [];
    const r = startHidRemote({
      backend,
      ids: () => IDS,
      onDown: (b) => ev.push(`down:${b}`),
      onUp: (b) => ev.push(`up:${b}`),
      onDisconnect: () => ev.push("disconnect"),
      quiet: true,
    });
    return { opened, ev, r };
  }

  it("emits edges from reports and ignores repeated identical ones", () => {
    const { opened, ev } = setup(() => true);
    const d = opened[0]!;
    d.emit("data", Buffer.from([1, 0x02, 0]));
    d.emit("data", Buffer.from([1, 0x02, 0]));
    d.emit("data", Buffer.from([1, 0, 0]));
    d.emit("data", Buffer.from([1, 0, 0x04]));
    d.emit("data", Buffer.from([1, 0, 0]));
    expect(ev).toEqual(["down:up", "up:up", "down:netflix", "up:netflix"]);
  });

  it("retries every 3 s while missing, then connects", () => {
    let there = false;
    const { opened, r } = setup(() => there);
    expect(opened).toHaveLength(0);
    vi.advanceTimersByTime(3000 * 2);
    expect(opened).toHaveLength(0);
    there = true;
    vi.advanceTimersByTime(3000);
    expect(opened).toHaveLength(1);
    expect(r.connected()).toBe(true);
  });

  it("on error releases buttons, closes, and reconnects", () => {
    const { opened, ev, r } = setup(() => true);
    opened[0]!.emit("data", Buffer.from([1, 0x08, 0]));
    opened[0]!.emit("error", new Error("device gone"));
    expect(opened[0]!.closed).toBe(true);
    expect(ev).toContain("disconnect");
    expect(r.connected()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(opened).toHaveLength(2);
    // state was reset: the same bit is a fresh press
    opened[1]!.emit("data", Buffer.from([1, 0x08, 0]));
    expect(ev.filter((e) => e === "down:left")).toHaveLength(2);
    r.stop();
    expect(opened[1]!.closed).toBe(true);
  });
});
