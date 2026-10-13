export interface ForegroundState {
  foreground: "launcher" | "app" | "other";
  tileId?: string;
}

export interface ClassifyDeps {
  isLauncher(hwnd: number): boolean;
  /** Tile that owns this exact window, if any. */
  tileOf(hwnd: number): string | undefined;
  rootOwner(hwnd: number): number;
}

/** Pure: what is in front? A tracked window, or a window owned by one (dialogs), counts as that app. */
export function classifyForeground(fg: number, d: ClassifyDeps): ForegroundState {
  if (!fg) return { foreground: "other" };
  if (d.isLauncher(fg)) return { foreground: "launcher" };
  const direct = d.tileOf(fg);
  if (direct) return { foreground: "app", tileId: direct };
  const root = d.rootOwner(fg);
  if (root && root !== fg) {
    if (d.isLauncher(root)) return { foreground: "launcher" };
    const owned = d.tileOf(root);
    if (owned) return { foreground: "app", tileId: owned };
  }
  return { foreground: "other" };
}

export interface FullState extends ForegroundState {
  running: string[];
}

export const sameState = (a: FullState, b: FullState): boolean =>
  a.foreground === b.foreground && a.tileId === b.tileId && a.running.join("\0") === b.running.join("\0");
