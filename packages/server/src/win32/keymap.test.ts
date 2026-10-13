import { describe, expect, it } from "vitest";
import { backChord, KEYS, VK } from "./keymap.ts";

describe("keymap", () => {
  it("marks arrows and media/volume keys as extended", () => {
    for (const k of ["up", "down", "left", "right", "playPause", "next", "prev", "stop", "volumeUp", "volumeDown", "mute"] as const)
      expect(KEYS[k].extended, k).toBe(true);
    for (const k of ["enter", "esc", "backspace", "tab", "space", "alt"] as const)
      expect(KEYS[k].extended, k).toBe(false);
  });
  it("uses the documented VK codes", () => {
    expect(KEYS.up.vk).toBe(0x26);
    expect(KEYS.enter.vk).toBe(VK.RETURN);
    expect(KEYS.playPause.vk).toBe(0xb3);
  });
  it("maps back to esc or alt+left", () => {
    expect(backChord()).toEqual(["esc"]);
    expect(backChord("browserBack")).toEqual(["alt", "left"]);
  });
});
