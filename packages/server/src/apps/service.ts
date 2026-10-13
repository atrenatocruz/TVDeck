import type { ServerMsg, Tile } from "@tvdeck/protocol";
import { log } from "../log.ts";
import { bringToFront, getLauncherWindow } from "../win32/foreground.ts";
import { native } from "../win32/user32.ts";
import { describeWindow, listTopLevelWindows } from "../win32/windows.ts";
import { backKeysFor } from "./back.ts";
import { classifyForeground, sameState, type ForegroundState, type FullState } from "./foregroundState.ts";
import { LAUNCHER_TITLE } from "./edge.ts";
import { launchTarget, targetFor } from "./launchTile.ts";
import { effectiveMatch, Tracker, type TrackerEnv } from "./tracker.ts";
import type { KeyName } from "../win32/keymap.ts";

export type StateMsg = Extract<ServerMsg, { type: "state" }>;

const POLL_MS = 500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const nativeEnv: TrackerEnv = {
  isWindow: (h) => native.IsWindow(h),
  list: () => listTopLevelWindows(),
  bringToFront,
  sleep,
  now: () => Date.now(),
  log: (m) => log.info("apps", m),
};

export interface AppService {
  /** Opens (or re-focuses) a tile. Rejects with a user-readable Error. */
  open(tileId: string): Promise<void>;
  /** Keys for the Back button given what is in front right now. */
  backKeys(): KeyName[];
  state(): StateMsg;
  /** Re-reads the foreground immediately and broadcasts if it changed. */
  refresh(): void;
  /** Home was pressed: an app that is still opening must not pull itself back to the front. */
  noteHome(): void;
  start(): void;
  stop(): void;
}

export function createAppService(
  getTiles: () => readonly Tile[],
  onState: (s: StateMsg) => void,
  env: TrackerEnv = nativeEnv,
): AppService {
  const tracker = new Tracker(env);
  const inflight = new Map<string, Promise<void>>();
  let last: FullState = { foreground: "other", running: [] };
  let timer: NodeJS.Timeout | undefined;
  let homeAt = 0;

  const isLauncher = (h: number) => {
    if (h === getLauncherWindow()) return true;
    if (!native.IsWindow(h)) return false;
    const w = describeWindow(h);
    return w.title === LAUNCHER_TITLE && w.processName.toLowerCase() === "msedge.exe";
  };

  const compute = (): FullState => {
    const fg: ForegroundState = classifyForeground(native.GetForegroundWindow(), {
      isLauncher,
      tileOf: (h) => tracker.tileOf(h),
      rootOwner: (h) => native.GetRootOwner(h),
    });
    return { ...fg, running: tracker.running() };
  };

  const toMsg = (s: FullState): StateMsg => ({
    type: "state",
    foreground: s.foreground,
    ...(s.tileId ? { tileId: s.tileId } : {}),
    running: s.running,
  });

  const refresh = () => {
    const next = compute();
    if (sameState(next, last)) return;
    last = next;
    log.info("state", `${next.foreground}${next.tileId ? ` (${next.tileId})` : ""} running=[${next.running.join(",")}]`);
    onState(toMsg(next));
  };

  async function doOpen(tile: Tile): Promise<void> {
    const target = targetFor(tile); // throws a readable error before anything is spawned
    const startedAt = Date.now();
    const timeoutMs = tile.type === "uri" ? 15_000 : 10_000;
    await tracker.open(tile, () => launchTarget(tile, target), {
      match: effectiveMatch(tile),
      adoptExisting: !!tile.match,
      shouldRaise: () => homeAt < startedAt,
      timeoutMs,
      exclude: new Set([getLauncherWindow() ?? 0]),
    });
  }

  return {
    async open(tileId) {
      const tile = getTiles().find((t) => t.id === tileId);
      if (!tile) throw new Error(`Unknown tile "${tileId}"`);
      const running = inflight.get(tileId);
      if (running) return running; // OK pressed twice: one launch
      const p = doOpen(tile).finally(() => {
        inflight.delete(tileId);
        refresh();
      });
      inflight.set(tileId, p);
      return p;
    },
    backKeys: () => backKeysFor(last, getTiles()),
    state: () => toMsg(last),
    refresh,
    noteHome: () => void (homeAt = Date.now()),
    start() {
      if (!native.available || timer) return;
      timer = setInterval(refresh, POLL_MS);
      timer.unref();
      refresh();
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
