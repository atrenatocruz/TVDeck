import fs from "node:fs";
import path from "node:path";
import { log } from "../log.ts";

/** The file TVDeck.exe touches to ask a running server for the launcher. */
export const HOME_REQUEST_FILE = "home.request";

/**
 * Brings the launcher forward when `<dataDir>/home.request` is written. TVDeck.exe uses this when the
 * server is already running: a file in the user's own data folder needs no network endpoint (an HTTP one
 * would also be reachable through `tailscale serve`, which arrives from 127.0.0.1).
 *
 * Polls the file's timestamp (fs.watchFile, a stat every 400 ms): cheap, and it also works when the data
 * folder is on a drive or sync tool that doesn't deliver directory change events.
 */
export function watchHomeRequests(dataDir: string, onHome: () => void, intervalMs = 400): () => void {
  const file = path.join(dataDir, HOME_REQUEST_FILE);
  const listener = (cur: fs.Stats, prev: fs.Stats) => {
    if (cur.mtimeMs === 0 || cur.mtimeMs === prev.mtimeMs) return; // missing, or nothing new
    log.info("app", "TVDeck.exe asked for the launcher");
    onHome();
  };
  fs.watchFile(file, { interval: intervalMs }, listener);
  return () => fs.unwatchFile(file, listener);
}
