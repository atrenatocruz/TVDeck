import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../paths.ts";

export function loadOrCreateToken(file = path.join(dataDir(), "secret.json")): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { token?: unknown };
    if (typeof parsed.token === "string" && parsed.token.length >= 20) return parsed.token;
  } catch {
    /* create below */
  }
  const token = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(file, JSON.stringify({ token }, null, 2), { mode: 0o600 });
  return token;
}

/** Constant-time comparison that is safe for different lengths. */
export function checkToken(expected: string, given: string): boolean {
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b) && expected.length === given.length;
}

/** Random per-boot key the launcher presents (used from M2). */
export function newLauncherKey(): string {
  return crypto.randomBytes(24).toString("base64url");
}
