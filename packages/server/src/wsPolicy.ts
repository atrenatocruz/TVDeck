import type { Hello } from "@tvdeck/protocol";
import { checkToken } from "./auth/sharedToken.ts";

/**
 * Browsers always send Origin on WebSocket upgrades. We require it, and require it to
 * match the Host the client reached us at (blocks cross-site WebSocket hijacking).
 */
export function isOriginAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface AuthContext {
  sharedToken: string;
  launcherKey: string;
}

export type AuthDecision = { ok: true; role: "remote" | "launcher" } | { ok: false };

/** Pure decision: which role (if any) does this hello earn? */
export function decideAuth(hello: Hello, ctx: AuthContext): AuthDecision {
  const { role, auth } = hello;
  if (role === "remote" && auth.kind === "shared" && checkToken(ctx.sharedToken, auth.token)) {
    return { ok: true, role: "remote" };
  }
  if (role === "launcher" && auth.kind === "launcher" && checkToken(ctx.launcherKey, auth.key)) {
    return { ok: true, role: "launcher" };
  }
  // "device" and "pair" arrive in M5.
  return { ok: false };
}
