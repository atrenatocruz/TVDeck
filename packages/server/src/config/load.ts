import fs from "node:fs";
import path from "node:path";
import { TilesConfig } from "@tvdeck/protocol";

export type LoadResult = { ok: true; config: TilesConfig } | { ok: false; error: string };

/** Human-readable zod issues: `rows.0.tiles.2.url: message`. */
export function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 6)
    .map((i) => `${i.path.length ? i.path.map(String).join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}

/** Pure: parse + validate raw JSON text. */
export function parseTilesConfig(text: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = TilesConfig.safeParse(json);
  if (!r.success) return { ok: false, error: formatIssues(r.error.issues) };
  return { ok: true, config: r.data };
}

export function loadTilesFile(file: string): LoadResult {
  try {
    return parseTilesConfig(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { ok: false, error: `Cannot read ${path.basename(file)}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Copies the example next to `file` when `file` is missing. Returns true when it created it. */
export function ensureTilesFile(file: string, example: string): boolean {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(example, file);
  return true;
}

/** Expands %NAME% (Windows style) using env; unknown names are left untouched. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(/%([^%]+)%/g, (m, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key && env[key] !== undefined ? env[key]! : m;
  });
}
