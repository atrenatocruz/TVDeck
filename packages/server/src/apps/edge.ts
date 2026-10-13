import { createHash } from "node:crypto";
import path from "node:path";

export interface LauncherArgsOpts {
  /** %LOCALAPPDATA%\TVDeck */
  dataDir: string;
  port: number;
  key: string;
}

export const LAUNCHER_TITLE = "TVDeck";

export function launcherUrl(port: number, key: string): string {
  return `http://localhost:${port}/launcher/#k=${encodeURIComponent(key)}`;
}

/** Command-line arguments for the fullscreen launcher window (own profile, app mode). */
export function buildLauncherArgs(o: LauncherArgsOpts): string[] {
  return [
    `--user-data-dir=${path.join(o.dataDir, "edge-launcher")}`,
    `--app=${launcherUrl(o.port, o.key)}`,
    "--start-fullscreen",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    "--autoplay-policy=no-user-gesture-required",
  ];
}

/** A Chromium-based smart-TV browser. Sites such as youtube.com/tv serve their TV interface to it. */
export const TV_USER_AGENT =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36";

/** Expands the "tv" shorthand; anything else is used as the user-agent string itself. */
export function resolveUserAgent(ua: string | undefined): string | undefined {
  return ua === "tv" ? TV_USER_AGENT : ua;
}

/**
 * Edge applies --user-agent to its whole browser process, so each user agent gets its own profile.
 * Tiles without one share the "edge-apps" profile.
 */
export function webProfileDir(dataDir: string, userAgent?: string): string {
  if (!userAgent) return path.join(dataDir, "edge-apps");
  const id = userAgent === TV_USER_AGENT ? "tv" : createHash("sha256").update(userAgent).digest("hex").slice(0, 8);
  return path.join(dataDir, `edge-apps-${id}`);
}

export interface WebArgsOpts {
  dataDir: string;
  url: string;
  /** Already resolved (see resolveUserAgent). */
  userAgent?: string;
}

/** Arguments for a web tile: its own fullscreen app window in a persistent apps profile. */
export function buildWebArgs(o: WebArgsOpts): string[] {
  return [
    `--user-data-dir=${webProfileDir(o.dataDir, o.userAgent)}`,
    ...(o.userAgent ? [`--user-agent=${o.userAgent}`] : []),
    `--app=${o.url}`,
    "--start-fullscreen",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
  ];
}
