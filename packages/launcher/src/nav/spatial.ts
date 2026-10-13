/**
 * Pure spatial navigation. Rects are in a stable (untransformed) layout space, so
 * horizontal row scrolling and page scrolling never disturb the geometry.
 */
export type Dir = "up" | "down" | "left" | "right";

export interface FocusRect {
  id: string;
  /** Row index; rows are ordered top to bottom. */
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const cx = (r: FocusRect) => r.x + r.w / 2;
const cy = (r: FocusRect) => r.y + r.h / 2;

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Best candidate in `dir`, or null. Candidates must lie in the direction's half-plane
 * (by centre). Score = gap along the primary axis + weighted perpendicular offset,
 * minus a bonus for overlapping on the perpendicular axis. Lower is better.
 */
export function pickNext(from: FocusRect, rects: readonly FocusRect[], dir: Dir): FocusRect | null {
  const horizontal = dir === "left" || dir === "right";
  const sign = dir === "right" || dir === "down" ? 1 : -1;
  let best: FocusRect | null = null;
  let bestScore = Infinity;
  for (const r of rects) {
    if (r.id === from.id) continue;
    const along = horizontal ? (cx(r) - cx(from)) * sign : (cy(r) - cy(from)) * sign;
    if (along <= 0.5) continue; // not in the half-plane
    const gap = horizontal
      ? Math.max(0, sign > 0 ? r.x - (from.x + from.w) : from.x - (r.x + r.w))
      : Math.max(0, sign > 0 ? r.y - (from.y + from.h) : from.y - (r.y + r.h));
    const perp = horizontal ? Math.abs(cy(r) - cy(from)) : Math.abs(cx(r) - cx(from));
    const shared = horizontal ? overlap(from.y, from.y + from.h, r.y, r.y + r.h) : overlap(from.x, from.x + from.w, r.x, r.x + r.w);
    const score = gap + along * 0.25 + perp * 2.5 - shared * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** row index -> id of the tile that was focused last in that row. */
export type RowMemory = Map<number, string>;

/**
 * Next focus id for a key press. Left/right stay inside the row (no wrap).
 * Up/down jump to the adjacent row: the remembered tile there if it still exists,
 * otherwise the geometrically nearest one.
 */
export function navigate(rects: readonly FocusRect[], currentId: string | null, dir: Dir, memory: RowMemory): string | null {
  const cur = rects.find((r) => r.id === currentId);
  if (!cur) return rects[0]?.id ?? null;

  if (dir === "left" || dir === "right") {
    const sameRow = rects.filter((r) => r.row === cur.row);
    return pickNext(cur, sameRow, dir)?.id ?? null;
  }

  const rows = [...new Set(rects.map((r) => r.row))].sort((a, b) => a - b);
  const at = rows.indexOf(cur.row);
  const targetRow = rows[at + (dir === "down" ? 1 : -1)];
  if (targetRow === undefined) return null;
  const inRow = rects.filter((r) => r.row === targetRow);
  const remembered = memory.get(targetRow);
  if (remembered && inRow.some((r) => r.id === remembered)) return remembered;

  // nearest by horizontal centre (rows are stacked, so perpendicular distance decides)
  let best: FocusRect | null = null;
  let bestScore = Infinity;
  for (const r of inRow) {
    const score = Math.abs(cx(r) - cx(cur)) - overlap(cur.x, cur.x + cur.w, r.x, r.x + r.w) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best?.id ?? null;
}

/** Row scroll offset that keeps `tile` inside [left, viewport - right], moving as little as needed. */
export function scrollIntoRow(current: number, tileLeft: number, tileRight: number, viewport: number, contentWidth: number, marginLeft: number, marginRight: number): number {
  let s = current;
  if (tileRight - s > viewport - marginRight) s = tileRight - (viewport - marginRight);
  if (tileLeft - s < marginLeft) s = tileLeft - marginLeft;
  return Math.max(0, Math.min(s, Math.max(0, contentWidth - viewport)));
}

/**
 * `navigate` plus the corner controls (settings), which sit above the first row: Up from the
 * first row reaches them, Down returns to that row's remembered tile, and the other directions
 * stay put. `null` means the key does nothing.
 */
export function navigateWithControls(rects: readonly FocusRect[], currentId: string | null, dir: Dir, memory: RowMemory, controlId: string): string | null {
  if (currentId === controlId) {
    if (dir !== "down" || rects.length === 0) return null;
    const firstRow = Math.min(...rects.map((r) => r.row));
    const inRow = rects.filter((r) => r.row === firstRow);
    const remembered = memory.get(firstRow);
    return (remembered && inRow.some((r) => r.id === remembered) ? remembered : inRow[0]?.id) ?? null;
  }
  const next = navigate(rects, currentId, dir, memory);
  if (next) return next;
  const cur = rects.find((r) => r.id === currentId);
  if (dir === "up" && cur && cur.row === Math.min(...rects.map((r) => r.row))) return controlId;
  return null;
}
