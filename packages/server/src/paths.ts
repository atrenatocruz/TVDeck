import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const REMOTE_ROOT = path.join(REPO_ROOT, "packages", "remote");
export const REMOTE_DIST = path.join(REMOTE_ROOT, "dist");
export const LAUNCHER_ROOT = path.join(REPO_ROOT, "packages", "launcher");
export const LAUNCHER_DIST = path.join(LAUNCHER_ROOT, "dist");
export const CONFIG_DIR = process.env.TVDECK_CONFIG ? path.dirname(path.resolve(process.env.TVDECK_CONFIG)) : path.join(REPO_ROOT, "config");
export const TILES_FILE = process.env.TVDECK_CONFIG ? path.resolve(process.env.TVDECK_CONFIG) : path.join(REPO_ROOT, "config", "tiles.json");
export const TILES_EXAMPLE = path.join(REPO_ROOT, "config", "tiles.example.json");
export const ICONS_DIR = path.join(CONFIG_DIR, "icons");

/** %LOCALAPPDATA%\TVDeck (falls back to ~/.tvdeck on other platforms). Created on first use. */
export function dataDir(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share");
  const dir = path.join(base, "TVDeck");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function findEdge(): string | null {
  const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, "C:\\Program Files (x86)", "C:\\Program Files"];
  for (const r of roots) {
    if (!r) continue;
    const p = path.join(r, "Microsoft", "Edge", "Application", "msedge.exe");
    if (fs.existsSync(p)) return p;
  }
  return null;
}
