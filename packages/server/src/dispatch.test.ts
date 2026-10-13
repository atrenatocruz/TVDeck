import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: [string, ...unknown[]][] = [];
vi.mock("./win32/input.ts", () => ({
  tapKey: (k: string) => calls.push(["tapKey", k]),
  chord: (k: string[]) => calls.push(["chord", k]),
  typeText: (t: string) => calls.push(["typeText", t]),
  mouseMove: (x: number, y: number) => calls.push(["mouseMove", x, y]),
  mouseClick: (b: string, d: boolean) => calls.push(["mouseClick", b, d]),
  mouseScroll: (x: number, y: number) => calls.push(["mouseScroll", x, y]),
}));
vi.mock("./win32/foreground.ts", () => ({ goHome: async () => null }));

const { dispatch } = await import("./dispatch.ts");
const { InputGuard, LIMITS } = await import("./inputGuard.ts");

beforeEach(() => void (calls.length = 0));

describe("dispatch input routing", () => {
  it("maps media and volume actions to media keys", () => {
    dispatch({ type: "media", action: "playPause" });
    dispatch({ type: "media", action: "next" });
    dispatch({ type: "media", action: "prev" });
    dispatch({ type: "volume", action: "up" });
    dispatch({ type: "volume", action: "down" });
    dispatch({ type: "volume", action: "mute" });
    expect(calls).toEqual([
      ["tapKey", "playPause"],
      ["tapKey", "next"],
      ["tapKey", "prev"],
      ["tapKey", "volumeUp"],
      ["tapKey", "volumeDown"],
      ["tapKey", "mute"],
    ]);
  });

  it("routes mouse, text and text keys", () => {
    dispatch({ type: "mouseMove", dx: 3, dy: -4 });
    dispatch({ type: "mouseClick", button: "right" });
    dispatch({ type: "mouseClick", button: "left", double: true });
    dispatch({ type: "mouseScroll", dx: 1, dy: 2 });
    dispatch({ type: "typeText", text: "héllo 😀" });
    for (const key of ["backspace", "enter", "tab", "space"] as const) dispatch({ type: "textKey", key });
    expect(calls).toEqual([
      ["mouseMove", 3, -4],
      ["mouseClick", "right", false],
      ["mouseClick", "left", true],
      ["mouseScroll", 1, 2],
      ["typeText", "héllo 😀"],
      ["tapKey", "backspace"],
      ["tapKey", "enter"],
      ["tapKey", "tab"],
      ["tapKey", "space"],
    ]);
  });

  it("clamps oversized moves and scrolls", () => {
    dispatch({ type: "mouseMove", dx: 9000, dy: 0 });
    dispatch({ type: "mouseScroll", dx: 0, dy: -9000 });
    expect(calls).toEqual([
      ["mouseMove", LIMITS.maxMovePerMsg, 0],
      ["mouseScroll", 0, -LIMITS.maxScrollPerMsg],
    ]);
  });

  it("throttles typed text and floods of messages, and tells the client once", () => {
    let t = 0;
    const guard = new InputGuard(() => t);
    const replies: unknown[] = [];
    const reply = (m: unknown) => replies.push(m);
    dispatch({ type: "typeText", text: "a".repeat(500) }, reply, undefined, guard);
    dispatch({ type: "typeText", text: "a".repeat(500) }, reply, undefined, guard);
    dispatch({ type: "typeText", text: "a".repeat(500) }, reply, undefined, guard);
    dispatch({ type: "typeText", text: "a".repeat(500) }, reply, undefined, guard);
    dispatch({ type: "typeText", text: "b".repeat(500) }, reply, undefined, guard);
    const typed = calls.filter((c) => c[0] === "typeText").map((c) => (c[1] as string).length);
    expect(typed).toEqual([500, 500, 500, 500]); // 2000 burst, the fifth is dropped

    calls.length = 0;
    for (let i = 0; i < 1000; i++) dispatch({ type: "nav", dir: "up" }, reply, undefined, guard);
    expect(calls.length).toBeLessThanOrEqual(LIMITS.msgBurst);
    expect(replies.filter((r) => (r as { code?: string }).code === "rate_limited")).toHaveLength(1);
  });
});
