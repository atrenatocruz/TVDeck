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

export interface WebArgsOpts {
  dataDir: string;
  url: string;
}

/** Arguments for a web tile: its own fullscreen app window in the shared, persistent "apps" profile. */
export function buildWebArgs(o: WebArgsOpts): string[] {
  return [
    `--user-data-dir=${path.join(o.dataDir, "edge-apps")}`,
    `--app=${o.url}`,
    "--start-fullscreen",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
  ];
}
