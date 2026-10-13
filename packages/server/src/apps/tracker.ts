import type { Tile } from "@tvdeck/protocol";

/** The slice of a window the tracking logic needs (keeps the logic testable on fake lists). */
export interface WinLite {
  hwnd: number;
  title: string;
  processName: string;
  /** false for zero-size, tool or cloaked windows. Undefined counts as real. */
  real?: boolean;
  visible?: boolean;
}

export interface Match {
  titleRegex?: string;
  process?: string;
}

const bare = (p: string) => p.toLowerCase().replace(/\.exe$/, "");

export const hasMatch = (m?: Match): m is Match => !!m && !!(m.titleRegex || m.process);

/** A window matches when every given criterion holds (process name and/or title regex, case-insensitive). */
export function matchWindow(w: WinLite, m?: Match): boolean {
  if (!hasMatch(m)) return false;
  if (m.process && bare(w.processName) !== bare(m.process)) return false;
  if (m.titleRegex) {
    try {
      if (!new RegExp(m.titleRegex, "i").test(w.title)) return false;
    } catch {
      return false; // a bad regex in the config must not throw inside the poll loop
    }
  }
  return true;
}

/**
 * The match rule used to pick the new window after a launch. Folder tiles default to "a new Explorer window":
 * window titles are localised ("Vídeos - Explorador de Ficheiros"), so the folder name can't be matched.
 */
export function effectiveMatch(tile: Tile): Match | undefined {
  if (hasMatch(tile.match)) return tile.match;
  if (tile.type === "folder") return { process: "explorer.exe" };
  return undefined;
}

const usable = (w: WinLite) => w.real !== false && w.visible !== false;

/** Windows that exist now but were not in the snapshot taken before launching. */
export function findNewWindows(before: ReadonlySet<number>, now: readonly WinLite[], exclude: ReadonlySet<number> = new Set()): WinLite[] {
  return now.filter((w) => usable(w) && !before.has(w.hwnd) && !exclude.has(w.hwnd));
}

/**
 * Chooses which new window belongs to the launched tile. With a match rule a matching window wins;
 * a non-matching one is only taken when `allowFallback` (late in the wait, when nothing matched).
 */
export function pickAdoption(candidates: readonly WinLite[], match: Match | undefined, allowFallback: boolean): WinLite | undefined {
  if (hasMatch(match)) {
    const hit = candidates.find((w) => matchWindow(w, match));
    if (hit) return hit;
    return allowFallback ? candidates[0] : undefined;
  }
  return candidates[0];
}

/** An already-open window that matches the tile (for apps started outside TVDeck or before it). */
export function findExisting(now: readonly WinLite[], match: Match | undefined, exclude: ReadonlySet<number> = new Set()): WinLite | undefined {
  if (!hasMatch(match)) return undefined;
  return now.find((w) => usable(w) && !exclude.has(w.hwnd) && matchWindow(w, match));
}

export interface TrackerEnv {
  isWindow(hwnd: number): boolean;
  list(): WinLite[];
  bringToFront(hwnd: number): Promise<{ ok: boolean; step: string | null }>;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(msg: string): void;
}

export type OpenHow = "focused" | "adopted" | "launched";
export interface OpenResult {
  how: OpenHow;
  hwnd: number;
  step: string | null;
}

export class Tracker {
  private map = new Map<string, number>();
  constructor(private env: TrackerEnv) {}

  /** Live HWND for a tile; dead ones are pruned on lookup. */
  get(tileId: string): number | undefined {
    const h = this.map.get(tileId);
    if (h === undefined) return undefined;
    if (!this.env.isWindow(h)) {
      this.map.delete(tileId);
      return undefined;
    }
    return h;
  }

  /** TileIds with a live window. */
  running(): string[] {
    return [...this.map.keys()].filter((id) => this.get(id) !== undefined);
  }

  /** Reverse lookup: which tile owns this window (after pruning). */
  tileOf(hwnd: number): string | undefined {
    for (const id of [...this.map.keys()]) if (this.get(id) === hwnd) return id;
    return undefined;
  }

  trackedHwnds(): Set<number> {
    return new Set(this.running().map((id) => this.map.get(id)!));
  }

  /**
   * Opens a tile: focus its tracked window, else adopt a matching existing window, else launch it
   * and adopt the new window that appears. `launch` rejects with a user-readable Error on failure.
   */
  async open(
    tile: Tile,
    launch: () => Promise<void>,
    o: {
      match?: Match;
      /** Adopt an already-open window only for an explicit `match` from the config (never for implicit rules). */
      adoptExisting?: boolean;
      timeoutMs: number;
      exclude?: ReadonlySet<number>;
      /** Return false to adopt the window without raising it (the user pressed Home meanwhile). */
      shouldRaise?: () => boolean;
    },
  ): Promise<OpenResult> {
    const { env } = this;
    const tracked = this.get(tile.id);
    if (tracked !== undefined) {
      const r = await env.bringToFront(tracked);
      env.log(`tracker: "${tile.id}" already open (hwnd ${tracked}), focused via ${r.step ?? "FAILED"}`);
      return { how: "focused", hwnd: tracked, step: r.step };
    }

    const others = new Set([...this.trackedHwnds(), ...(o.exclude ?? [])]);
    const existing = o.adoptExisting === false ? undefined : findExisting(env.list(), o.match, others);
    if (existing) {
      this.map.set(tile.id, existing.hwnd);
      const r = await env.bringToFront(existing.hwnd);
      env.log(`tracker: "${tile.id}" adopted existing window hwnd ${existing.hwnd} ("${existing.title}"), raise via ${r.step ?? "FAILED"}`);
      return { how: "adopted", hwnd: existing.hwnd, step: r.step };
    }

    const before = new Set(env.list().map((w) => w.hwnd));
    await launch();
    const start = env.now();
    for (;;) {
      const elapsed = env.now() - start;
      const found = pickAdoption(findNewWindows(before, env.list(), others), o.match, elapsed > o.timeoutMs * 0.5);
      if (found) {
        this.map.set(tile.id, found.hwnd);
        if (o.shouldRaise && !o.shouldRaise()) {
          env.log(`tracker: "${tile.id}" adopted hwnd ${found.hwnd} after ${elapsed} ms, not raised (Home pressed meanwhile)`);
          return { how: "launched", hwnd: found.hwnd, step: null };
        }
        const r = await env.bringToFront(found.hwnd);
        env.log(
          `tracker: "${tile.id}" launched, adopted hwnd ${found.hwnd} ("${found.title}", ${found.processName}) after ${elapsed} ms, raise via ${r.step ?? "FAILED"}`,
        );
        return { how: "launched", hwnd: found.hwnd, step: r.step };
      }
      if (elapsed >= o.timeoutMs) break;
      await env.sleep(150);
    }
    throw new Error(`${tile.title} was started but no window appeared`);
  }

  forget(tileId: string): void {
    this.map.delete(tileId);
  }
}
