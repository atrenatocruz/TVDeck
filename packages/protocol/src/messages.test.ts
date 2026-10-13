import { describe, expect, it } from "vitest";
import { parseClientMsg, PROTOCOL_VERSION, ServerMsg, TilesConfig } from "./index.ts";

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

describe("ServerMsg state", () => {
  it("accepts state with and without running (backwards compatible)", () => {
    expect(ServerMsg.safeParse({ type: "state", foreground: "launcher" }).success).toBe(true);
    expect(ServerMsg.safeParse({ type: "state", foreground: "app", tileId: "yt", running: ["yt", "vlc"] }).success).toBe(true);
    expect(ServerMsg.safeParse({ type: "state", foreground: "app", running: [1] }).success).toBe(false);
  });
});

describe("pairingCancel", () => {
  it("parses and is launcher-only", async () => {
    const { LAUNCHER_ONLY, parseClientMsg } = await import("./messages.ts");
    expect(parseClientMsg('{"type":"pairingCancel"}')).toEqual({ type: "pairingCancel" });
    expect(LAUNCHER_ONLY.has("pairingCancel")).toBe(true);
  });
});
