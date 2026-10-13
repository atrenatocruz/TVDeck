import fs from "node:fs";
import path from "node:path";
import type { TilesConfig } from "@tvdeck/protocol";
import { log } from "../log.ts";
import { loadTilesFile } from "./load.ts";

export interface TilesState {
  config: TilesConfig;
  error?: string;
}

export interface TilesWatcher {
  current(): TilesState;
  close(): void;
}

const EMPTY: TilesConfig = { rows: [] };

/**
 * Loads `file`, then watches its directory (editors replace files, so watching the
 * file itself is unreliable). Invalid edits keep the last good config and set `error`.
 */
export function watchTiles(file: string, onChange: (s: TilesState) => void, debounceMs = 200): TilesWatcher {
  let state: TilesState = { config: EMPTY };
  const reload = (initial: boolean) => {
    const r = loadTilesFile(file);
    if (r.ok) {
      state = { config: r.config };
      log.info("config", `${initial ? "loaded" : "reloaded"} ${path.basename(file)} (${r.config.rows.length} rows)`);
    } else {
      state = { config: state.config, error: r.error };
      log.warn("config", `${path.basename(file)} invalid, keeping last good: ${r.error}`);
    }
    if (!initial) onChange(state);
  };
  reload(true);

  let timer: NodeJS.Timeout | undefined;
  const base = path.basename(file).toLowerCase();
  let watcher: fs.FSWatcher | undefined;
  try {
    watcher = fs.watch(path.dirname(file), (_ev, name) => {
      if (name && name.toString().toLowerCase() !== base) return;
      clearTimeout(timer);
      timer = setTimeout(() => reload(false), debounceMs);
    });
    watcher.on("error", (e) => log.warn("config", `watch error: ${e.message}`));
  } catch (e) {
    log.warn("config", `cannot watch config: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    current: () => state,
    close() {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
