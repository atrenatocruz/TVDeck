import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../paths.ts";

export interface Secrets {
  token: string;
  launcherKey: string;
}

const valid = (v: unknown): v is string => typeof v === "string" && v.length >= 20;
const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/**
 * Persists the shared phone token AND the launcher key in one file, so restarting the
 * server (tsx watch) does not orphan an already-open launcher window.
 */
export function loadOrCreateSecrets(file = path.join(dataDir(), "secret.json")): Secrets {
  let parsed: { token?: unknown; launcherKey?: unknown } = {};
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8")) as typeof parsed;
  } catch {
    /* create below */
  }
  const secrets: Secrets = {
    token: valid(parsed.token) ? parsed.token : randomSecret(32),
    launcherKey: valid(parsed.launcherKey) ? parsed.launcherKey : newLauncherKey(),
  };
  if (secrets.token !== parsed.token || secrets.launcherKey !== parsed.launcherKey) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  return secrets;
}

export function loadOrCreateToken(file?: string): string {
  return loadOrCreateSecrets(file).token;
}

/** Constant-time comparison that is safe for different lengths. */
export function checkToken(expected: string, given: string): boolean {
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b) && expected.length === given.length;
}

/** Random launcher key (persisted by loadOrCreateSecrets). */
export function newLauncherKey(): string {
  return randomSecret(24);
}
