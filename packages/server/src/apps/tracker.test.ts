import { describe, expect, it } from "vitest";
import type { Tile } from "@tvdeck/protocol";
import { backKeysFor } from "./back.ts";
import { classifyForeground } from "./foregroundState.ts";
import {
  effectiveMatch,
  findExisting,
  findNewWindows,
  matchWindow,
  pickAdoption,
  Tracker,
  type TrackerEnv,
  type WinLite,
} from "./tracker.ts";

const w = (hwnd: number, title: string, processName = "msedge.exe", extra: Partial<WinLite> = {}): WinLite => ({
  hwnd,
  title,
  processName,
  ...extra,
});

describe("matchWindow", () => {
  it("needs at least one criterion", () => {
    expect(matchWindow(w(1, "x"), undefined)).toBe(false);
    expect(matchWindow(w(1, "x"), {})).toBe(false);
  });
  it("matches title regex and process case-insensitively, both must hold", () => {
    const win = w(1, "Steam Big Picture Mode", "steamwebhelper.exe");
    expect(matchWindow(win, { titleRegex: "big picture" })).toBe(true);
    expect(matchWindow(win, { process: "STEAMWEBHELPER" })).toBe(true);
    expect(matchWindow(win, { process: "steamwebhelper.exe", titleRegex: "nope" })).toBe(false);
    expect(matchWindow(win, { process: "vlc.exe" })).toBe(false);
  });
  it("treats an invalid regex as no match", () => {
    expect(matchWindow(w(1, "x"), { titleRegex: "(" })).toBe(false);
  });
});

describe("findNewWindows / pickAdoption", () => {
  const now = [
    w(1, "old"),
    w(2, "launcher"),
    w(3, "New", "msedge.exe"),
    w(4, "tool", "x.exe", { real: false }),
    w(5, "Steam Big Picture Mode", "steamwebhelper.exe"),
  ];
  it("diffs against the snapshot, ignoring excluded and non-real windows", () => {
    const news = findNewWindows(new Set([1]), now, new Set([2]));
    expect(news.map((x) => x.hwnd)).toEqual([3, 5]);
  });
  it("prefers a matching window, falls back only when allowed", () => {
    const news = findNewWindows(new Set([1, 2]), now);
    expect(pickAdoption(news, { titleRegex: "Big Picture" }, false)?.hwnd).toBe(5);
    expect(pickAdoption(news, { titleRegex: "zzz" }, false)).toBeUndefined();
    expect(pickAdoption(news, { titleRegex: "zzz" }, true)?.hwnd).toBe(3);
    expect(pickAdoption(news, undefined, false)?.hwnd).toBe(3);
    expect(pickAdoption([], undefined, true)).toBeUndefined();
  });
  it("findExisting skips excluded windows", () => {
    expect(findExisting(now, { process: "msedge.exe" }, new Set([1]))?.hwnd).toBe(2);
  });
});

describe("effectiveMatch", () => {
  const folder = { id: "v", title: "Videos", type: "folder", path: "C:\Users\me\Videos" } as Tile;
  it("defaults folder tiles to a new Explorer window (titles are localised)", () => {
    expect(effectiveMatch(folder)).toEqual({ process: "explorer.exe" });
  });
  it("keeps an explicit match and has none for other types", () => {
    expect(effectiveMatch({ ...folder, match: { process: "x" } })).toEqual({ process: "x" });
    expect(effectiveMatch({ id: "w", title: "W", type: "web", url: "https://x" } as Tile)).toBeUndefined();
  });
});

function fakeEnv(initial: WinLite[]) {
  const state = { wins: [...initial], clock: 0, raised: [] as number[], appear: [] as Array<{ at: number; win: WinLite }> };
  const env: TrackerEnv = {
    isWindow: (h) => state.wins.some((x) => x.hwnd === h),
    list: () => {
      for (const a of state.appear) if (state.clock >= a.at && !state.wins.includes(a.win)) state.wins.push(a.win);
      return [...state.wins];
    },
    bringToFront: async (h) => (state.raised.push(h), { ok: true, step: "fake" }),
    sleep: async (ms) => void (state.clock += ms),
    now: () => state.clock,
    log: () => {},
  };
  return { env, state };
}
const tile = (id: string, extra: Partial<Tile> = {}): Tile => ({ id, title: id, type: "web", url: "https://x", ...extra }) as Tile;

describe("Tracker.open", () => {
  it("launches, adopts the new window and raises it", async () => {
    const { env, state } = fakeEnv([w(1, "existing")]);
    state.appear.push({ at: 600, win: w(9, "YouTube") });
    const t = new Tracker(env);
    const r = await t.open(tile("yt"), async () => {}, { timeoutMs: 10_000 });
    expect(r).toMatchObject({ how: "launched", hwnd: 9 });
    expect(t.running()).toEqual(["yt"]);
    expect(state.raised).toEqual([9]);
  });
  it("reuses a tracked window instead of launching again", async () => {
    const { env, state } = fakeEnv([]);
    state.appear.push({ at: 150, win: w(9, "YouTube") });
    const t = new Tracker(env);
    let launches = 0;
    const launch = async () => void launches++;
    await t.open(tile("yt"), launch, { timeoutMs: 1000 });
    const r = await t.open(tile("yt"), launch, { timeoutMs: 1000 });
    expect(r).toMatchObject({ how: "focused", hwnd: 9 });
    expect(launches).toBe(1);
  });
  it("prunes dead windows on lookup", async () => {
    const { env, state } = fakeEnv([]);
    state.appear.push({ at: 150, win: w(9, "YouTube") });
    const t = new Tracker(env);
    await t.open(tile("yt"), async () => {}, { timeoutMs: 1000 });
    state.wins = []; // user closed it
    expect(t.running()).toEqual([]);
    expect(t.get("yt")).toBeUndefined();
  });
  it("adopts an existing matching window without launching", async () => {
    const { env } = fakeEnv([w(7, "VLC media player", "vlc.exe")]);
    const t = new Tracker(env);
    let launched = false;
    const r = await t.open(tile("vlc", { type: "exe", path: "x" }), async () => void (launched = true), {
      match: { process: "vlc.exe" },
      timeoutMs: 1000,
    });
    expect(r).toMatchObject({ how: "adopted", hwnd: 7 });
    expect(launched).toBe(false);
  });
  it("does not adopt existing windows when adoptExisting is false, and can skip raising", async () => {
    const { env, state } = fakeEnv([w(3, "Base", "explorer.exe")]);
    state.appear.push({ at: 150, win: w(4, "Videos", "explorer.exe") });
    const t = new Tracker(env);
    const r = await t.open(tile("v", { type: "folder", path: "C:\V" }), async () => {}, {
      match: { process: "explorer.exe" },
      adoptExisting: false,
      timeoutMs: 1000,
      shouldRaise: () => false,
    });
    expect(r.hwnd).toBe(4);
    expect(state.raised).toEqual([]);
  });
  it("does not steal another tile's window", async () => {
    const { env, state } = fakeEnv([]);
    state.appear.push({ at: 150, win: w(9, "A") });
    const t = new Tracker(env);
    await t.open(tile("a"), async () => {}, { timeoutMs: 1000 });
    state.appear.push({ at: state.clock + 150, win: w(10, "B") });
    const r = await t.open(tile("b"), async () => {}, { timeoutMs: 1000 });
    expect(r.hwnd).toBe(10);
  });
  it("throws when no window appears", async () => {
    const { env } = fakeEnv([]);
    await expect(new Tracker(env).open(tile("n"), async () => {}, { timeoutMs: 1000 })).rejects.toThrow(/no window appeared/);
  });
  it("propagates launch failures", async () => {
    const { env } = fakeEnv([]);
    const boom = async () => {
      throw new Error("boom");
    };
    await expect(new Tracker(env).open(tile("n"), boom, { timeoutMs: 1000 })).rejects.toThrow("boom");
  });
});

describe("classifyForeground", () => {
  const d = {
    isLauncher: (h: number) => h === 100,
    tileOf: (h: number) => (h === 5 ? "yt" : undefined),
    rootOwner: (h: number) => (h === 6 ? 5 : h === 7 ? 100 : h),
  };
  it("classifies launcher, app, owned popup and other", () => {
    expect(classifyForeground(100, d)).toEqual({ foreground: "launcher" });
    expect(classifyForeground(5, d)).toEqual({ foreground: "app", tileId: "yt" });
    expect(classifyForeground(6, d)).toEqual({ foreground: "app", tileId: "yt" });
    expect(classifyForeground(7, d)).toEqual({ foreground: "launcher" });
    expect(classifyForeground(42, d)).toEqual({ foreground: "other" });
    expect(classifyForeground(0, d)).toEqual({ foreground: "other" });
  });
});

describe("backKeysFor", () => {
  const tiles = [tile("nf", { backKey: "browserBack" }), tile("vlc")];
  it("uses Alt+Left only for a foreground tile with backKey browserBack", () => {
    expect(backKeysFor({ foreground: "app", tileId: "nf" }, tiles)).toEqual(["alt", "left"]);
    expect(backKeysFor({ foreground: "app", tileId: "vlc" }, tiles)).toEqual(["esc"]);
    expect(backKeysFor({ foreground: "launcher" }, tiles)).toEqual(["esc"]);
    expect(backKeysFor({ foreground: "other", tileId: "nf" }, tiles)).toEqual(["esc"]);
    expect(backKeysFor({ foreground: "app", tileId: "gone" }, tiles)).toEqual(["esc"]);
  });
});
