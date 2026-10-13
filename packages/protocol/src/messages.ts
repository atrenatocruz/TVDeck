import { z } from "zod";
import { TilesConfig } from "./config.ts";

export const PROTOCOL_VERSION = 1;

export const Dir = z.enum(["up", "down", "left", "right"]);
export type Dir = z.infer<typeof Dir>;

const delta = z.number().finite().min(-10_000).max(10_000);

// ---- client → server ----

export const HelloAuth = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shared"), token: z.string().max(200) }),
  z.object({ kind: z.literal("device"), token: z.string().max(200) }),
  z.object({ kind: z.literal("launcher"), key: z.string().max(200) }),
  z.object({ kind: z.literal("pair"), code: z.string().max(200), deviceName: z.string().max(40) }),
]);

export const Hello = z.object({
  type: z.literal("hello"),
  v: z.literal(PROTOCOL_VERSION),
  role: z.enum(["remote", "launcher"]),
  auth: HelloAuth,
});

export const ClientMsg = z.discriminatedUnion("type", [
  Hello,
  z.object({ type: z.literal("nav"), dir: Dir }),
  z.object({ type: z.literal("button"), name: z.enum(["ok", "back", "home"]) }),
  z.object({ type: z.literal("media"), action: z.enum(["playPause", "next", "prev", "stop"]) }),
  z.object({ type: z.literal("volume"), action: z.enum(["up", "down", "mute"]) }),
  z.object({ type: z.literal("mouseMove"), dx: delta, dy: delta }),
  z.object({
    type: z.literal("mouseClick"),
    button: z.enum(["left", "right"]),
    double: z.boolean().optional(),
  }),
  z.object({ type: z.literal("mouseScroll"), dx: delta, dy: delta }),
  z.object({ type: z.literal("typeText"), text: z.string().max(500) }),
  z.object({ type: z.literal("textKey"), key: z.enum(["backspace", "enter", "tab", "space"]) }),
  z.object({ type: z.literal("openApp"), tileId: z.string().max(100) }),
  // launcher-only
  z.object({ type: z.literal("pairingStart") }),
  z.object({ type: z.literal("pairingCancel") }),
  z.object({ type: z.literal("deviceRevoke"), deviceId: z.string().max(100) }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);

/** Messages only the launcher may send. */
export const LAUNCHER_ONLY = new Set<ClientMsg["type"]>(["pairingStart", "pairingCancel", "deviceRevoke"]);

// ---- server → client ----

export const DeviceInfo = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  lastSeen: z.number(),
});

export const ErrorCode = z.enum([
  "unauthorized",
  "bad_message",
  "forbidden",
  "launch_failed",
  "rate_limited",
]);

export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("welcome"), serverVersion: z.string(), deviceId: z.string().optional() }),
  z.object({ type: z.literal("paired"), deviceId: z.string(), deviceToken: z.string() }),
  z.object({ type: z.literal("tiles"), config: TilesConfig, error: z.string().optional() }),
  z.object({
    type: z.literal("state"),
    foreground: z.enum(["launcher", "app", "other"]),
    tileId: z.string().optional(),
    /** tileIds that currently have a live window (optional: older servers omit it). */
    running: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal("pairingCode"), url: z.string(), expiresAt: z.number() }),
  z.object({ type: z.literal("devices"), list: z.array(DeviceInfo) }),
  z.object({ type: z.literal("revoked") }),
  z.object({ type: z.literal("error"), code: ErrorCode, message: z.string() }),
  z.object({ type: z.literal("pong"), t: z.number() }),
]);

export type Hello = z.infer<typeof Hello>;
export type HelloAuth = z.infer<typeof HelloAuth>;
export type ClientMsg = z.infer<typeof ClientMsg>;
export type ServerMsg = z.infer<typeof ServerMsg>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export type DeviceInfo = z.infer<typeof DeviceInfo>;

/** Close codes used by the server (4000–4999 is the application range). */
export const CloseCode = {
  unauthorized: 4001,
  helloTimeout: 4002,
  badOrigin: 4003,
  revoked: 4004,
} as const;

/** Parses raw socket data; returns null for anything that isn't a valid message. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = ClientMsg.safeParse(json);
  return r.success ? r.data : null;
}
