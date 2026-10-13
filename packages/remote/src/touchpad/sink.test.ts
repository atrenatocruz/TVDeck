import { describe, expect, it } from "vitest";
import { chunkText, MAX_BACKSPACES, MAX_CHUNK, planSink, SENTINEL } from "./sink.ts";

describe("planSink", () => {
  it("nothing typed, nothing sent", () => {
    expect(planSink(SENTINEL)).toEqual([]);
  });
  it("typed text after the sentinel is sent as text", () => {
    expect(planSink(SENTINEL + "hello")).toEqual([{ type: "typeText", text: "hello" }]);
  });
  it("deleting the sentinel is one backspace", () => {
    expect(planSink("")).toEqual([{ type: "textKey", key: "backspace" }]);
  });
  it("replacing the sentinel with text is backspace then text", () => {
    expect(planSink("ab")).toEqual([
      { type: "textKey", key: "backspace" },
      { type: "typeText", text: "ab" },
    ]);
  });
  it("keeps accents, emoji and newlines (server turns newline into Enter)", () => {
    expect(planSink(SENTINEL + "café \u{1F600}\nok")).toEqual([{ type: "typeText", text: "café \u{1F600}\nok" }]);
    expect(planSink(SENTINEL + "a\r\nb")).toEqual([{ type: "typeText", text: "a\nb" }]);
  });
  it("never forwards stray sentinels", () => {
    expect(planSink(SENTINEL + "a" + SENTINEL + "b")).toEqual([{ type: "typeText", text: "ab" }]);
  });
  it("caps backspaces", () => {
    expect(planSink("", SENTINEL.repeat(500))).toHaveLength(MAX_BACKSPACES);
  });
});

describe("chunkText", () => {
  it("chunks at the limit", () => {
    const chunks = chunkText("a".repeat(MAX_CHUNK * 2 + 3));
    expect(chunks.map((c) => c.length)).toEqual([MAX_CHUNK, MAX_CHUNK, 3]);
  });
  it("does not split an emoji across chunks", () => {
    const text = "a".repeat(MAX_CHUNK - 1) + "\u{1F600}" + "b";
    const chunks = chunkText(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0]!.length).toBe(MAX_CHUNK - 1);
    expect(chunks[1]!.startsWith("\u{1F600}")).toBe(true);
  });
  it("empty text has no chunks", () => {
    expect(chunkText("")).toEqual([]);
  });
});
