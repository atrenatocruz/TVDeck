import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Tile } from "@tvdeck/protocol";
import { expandEnv } from "../config/load.ts";
import { dataDir, findEdge } from "../paths.ts";
import { buildWebArgs, resolveUserAgent, webProfileDir } from "./edge.ts";

export interface Target {
  command: string;
  args: string[];
  /** Expanded path for exe/folder tiles (used for the default folder window match). */
  path?: string;
}

const hasDir = (p: string) => /[\\/]/.test(p);

const statKind = (p: string): "file" | "dir" | null => {
  try {
    return fs.statSync(p).isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
};

/** Resolves what to spawn for a tile, or throws an Error with a message fit for a toast. */
export function resolveTarget(
  tile: Tile,
  o: { dataDir: string; edge: string | null; exists?: (p: string) => "file" | "dir" | null },
): Target {
  const exists = o.exists ?? statKind;
  switch (tile.type) {
    case "web": {
      if (!o.edge) throw new Error("Microsoft Edge was not found on this PC");
      return { command: o.edge, args: buildWebArgs({ dataDir: o.dataDir, url: tile.url!, userAgent: resolveUserAgent(tile.userAgent) }) };
    }
    case "exe": {
      const p = expandEnv(tile.path!);
      // A bare name such as "notepad.exe" is resolved through PATH by the OS; anything with a folder must exist.
      if (hasDir(p) && exists(p) !== "file") throw new Error(`Can't open ${tile.title}: file not found (${p})`);
      return { command: p, args: (tile.args ?? []).map((a) => expandEnv(a)), path: p };
    }
    case "uri":
      return { command: "explorer.exe", args: [tile.url!] };
    case "folder": {
      const p = expandEnv(tile.path!);
      if (exists(p) !== "dir") throw new Error(`Can't open ${tile.title}: folder not found (${p})`);
      return { command: "explorer.exe", args: [p], path: p };
    }
  }
}

/** Starts the process detached; resolves once it has spawned, rejects if it can't be started. */
export function spawnDetached(command: string, args: string[], title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      cwd: path.isAbsolute(command) ? path.dirname(command) : undefined,
    });
    child.once("error", (e: NodeJS.ErrnoException) =>
      reject(new Error(e.code === "ENOENT" ? `Can't open ${title}: ${command} was not found` : `Can't open ${title}: ${e.message}`)),
    );
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Resolves a tile's launch target (throws a readable Error when it can't be opened). */
export function targetFor(tile: Tile): Target {
  return resolveTarget(tile, { dataDir: dataDir(), edge: tile.type === "web" ? findEdge() : null });
}

/** Launches a resolved target. The tracker finds the resulting window. */
export async function launchTarget(tile: Tile, target: Target): Promise<void> {
  if (tile.type === "web") fs.mkdirSync(webProfileDir(dataDir(), resolveUserAgent(tile.userAgent)), { recursive: true });
  await spawnDetached(target.command, target.args, tile.title);
}
