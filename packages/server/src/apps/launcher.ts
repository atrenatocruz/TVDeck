import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { log } from "../log.ts";
import { dataDir, findEdge } from "../paths.ts";
import { bringToFront, setLauncherResolver, setLauncherWindow } from "../win32/foreground.ts";
import { native, WM_CLOSE } from "../win32/user32.ts";
import { findWindow, waitForWindow, type WinInfo } from "../win32/windows.ts";
import { buildLauncherArgs, LAUNCHER_TITLE } from "./edge.ts";
import { LauncherWatchdog } from "./watchdog.ts";

const isLauncherWindow = (w: WinInfo) =>
  w.title === LAUNCHER_TITLE && w.processName.toLowerCase() === "msedge.exe" && w.visible;

export function findLauncherWindow(): WinInfo | undefined {
  return findWindow(isLauncherWindow);
}

function spawnLauncher(port: number, key: string): boolean {
  const edge = findEdge();
  if (!edge) {
    log.error("launcher", "Microsoft Edge not found; open http://localhost:" + port + "/launcher/ yourself");
    return false;
  }
  fs.mkdirSync(path.join(dataDir(), "edge-launcher"), { recursive: true });
  const child = spawn(edge, buildLauncherArgs({ dataDir: dataDir(), port, key }), { detached: true, stdio: "ignore" });
  child.on("error", (e) => log.error("launcher", `spawn failed: ${e.message}`));
  child.unref();
  return true;
}

let inflight: Promise<number | null> | null = null;

/** Set by "power off" so the watchdog doesn't bring the closed launcher back; cleared by Home/Power. */
let watchdogPaused = false;

/** Closes the launcher window and keeps it closed until the next Home (or Power) press. */
export function closeLauncher(): boolean {
  watchdogPaused = true;
  const w = findLauncherWindow();
  if (!w) return false;
  native.PostMessage(w.hwnd, WM_CLOSE, 0, 0);
  return true;
}

/** Finds the launcher window or starts it; remembers the HWND. Concurrent calls share one attempt. */
export function ensureLauncher(port: number, key: string): Promise<number | null> {
  inflight ??= (async () => {
    await Promise.resolve(); // make sure `inflight` is assigned before the finally below can run
    try {
      if (!native.available) return null;
      const existing = findLauncherWindow();
      if (existing) {
        setLauncherWindow(existing.hwnd);
        log.info("launcher", `found existing launcher window (hwnd ${existing.hwnd})`);
        return existing.hwnd;
      }
      if (!spawnLauncher(port, key)) return null;
      log.info("launcher", "started Edge launcher, waiting for its window");
      const w = await waitForWindow(isLauncherWindow, 20_000, 200);
      if (!w) {
        log.warn("launcher", 'launcher window titled "TVDeck" did not appear within 20 s');
        return null;
      }
      setLauncherWindow(w.hwnd);
      const r = await bringToFront(w.hwnd);
      log.info("launcher", `launcher window ready (hwnd ${w.hwnd}), raise: ${r.ok ? r.step : "failed"}`);
      return w.hwnd;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Wires Home so it can re-find or relaunch the launcher when the window is gone. */
export function registerLauncher(port: number, key: string): void {
  setLauncherResolver(async (step) => {
    watchdogPaused = false;
    const found = findLauncherWindow();
    if (found) {
      step("re-found launcher window");
      return found.hwnd;
    }
    step("relaunching launcher");
    return ensureLauncher(port, key);
  });
}

/**
 * Keeps the launcher alive: if its window disappears (Edge crashed, or someone closed it) while the
 * server runs, start it again after ~5 s. Backs off when it keeps dying. Returns a stop function.
 */
export function startLauncherWatchdog(port: number, key: string, intervalMs = 1000): () => void {
  if (!native.available) return () => {};
  const dog = new LauncherWatchdog();
  const timer = setInterval(() => {
    if (watchdogPaused) return;
    const present = !!findLauncherWindow();
    if (!dog.tick(Date.now(), present, inflight !== null)) return;
    log.warn("launcher", "launcher window is gone; relaunching");
    void ensureLauncher(port, key).catch((e) => log.error("launcher", e instanceof Error ? e.message : String(e)));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
