import { describe, expect, it } from "vitest";
import { parseClientMsg, PROTOCOL_VERSION, TilesConfig } from "./index.ts";

describe("parseClientMsg", () => {
  it("accepts a valid hello", () => {
    const msg = parseClientMsg(
      JSON.stringify({ type: "hello", v: PROTOCOL_VERSION, role: "remote", auth: { kind: "shared", token: "x" } }),
    );
    expect(msg?.type).toBe("hello");
  });

  it("rejects garbage, unknown types and bad fields", () => {
    expect(parseClientMsg("not json")).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "format-c" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "nav", dir: "diagonal" }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "mouseMove", dx: 1e9, dy: 0 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ type: "typeText", text: "a".repeat(501) }))).toBeNull();
  });

  it("rejects a hello with the wrong protocol version", () => {
    expect(
      parseClientMsg(JSON.stringify({ type: "hello", v: 99, role: "remote", auth: { kind: "shared", token: "x" } })),
    ).toBeNull();
  });
});

describe("TilesConfig", () => {
  it("requires url for web tiles and rejects duplicate ids", () => {
    expect(TilesConfig.safeParse({ rows: [{ title: "A", tiles: [{ id: "a", title: "A", type: "web" }] }] }).success).toBe(false);
    const dup = { id: "a", title: "A", type: "web", url: "https://example.com" };
    expect(TilesConfig.safeParse({ rows: [{ title: "A", tiles: [dup, dup] }] }).success).toBe(false);
    expect(TilesConfig.safeParse({ rows: [{ title: "A", tiles: [dup] }] }).success).toBe(true);
  });
});
