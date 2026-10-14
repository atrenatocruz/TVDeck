import { describe, expect, it } from "vitest";
import { decideOnFocus } from "./onScreen.ts";

const edit = { ev: "focus" as const, edit: true, pid: 10 };
const other = { ev: "focus" as const, edit: false, pid: 10 };
const ctx = { mode: "auto" as const, visible: false, foregroundPid: 10, foregroundIsApp: true };

describe("decideOnFocus", () => {
  it("opens for a text field in the TVDeck app that is in front", () => {
    expect(decideOnFocus(edit, ctx)).toBe("show");
  });
  it("ignores text fields in other programs, in the background, or when not in auto mode", () => {
    expect(decideOnFocus(edit, { ...ctx, foregroundIsApp: false })).toBeNull();
    expect(decideOnFocus(edit, { ...ctx, foregroundPid: 99 })).toBeNull();
    expect(decideOnFocus(edit, { ...ctx, mode: "manual" })).toBeNull();
    expect(decideOnFocus(edit, { ...ctx, visible: true })).toBeNull();
  });
  it("closes when the focus leaves the field", () => {
    expect(decideOnFocus(other, { ...ctx, visible: true })).toBe("hide");
    expect(decideOnFocus(other, ctx)).toBeNull();
  });
});
