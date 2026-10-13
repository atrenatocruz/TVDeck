import type { Tile } from "@tvdeck/protocol";

/** Short secondary line under a tile. */
export function tileSub(t: Pick<Tile, "type" | "url" | "path">): string {
  switch (t.type) {
    case "web":
      try {
        return new URL(t.url ?? "").hostname.replace(/^(www|play|web)\./, "");
      } catch {
        return "Website";
      }
    case "uri": {
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(t.url ?? "")?.[1];
      return scheme ? scheme[0]!.toUpperCase() + scheme.slice(1).toLowerCase() : "App";
    }
    case "exe":
      return "App";
    case "folder":
      return "Folder";
  }
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch|hwb)a?\([^)]+\))$/i;
const FALLBACK_INK = "#7f8cff";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The tile's configured accent, or a stable colour derived from its id. */
export function accentOf(t: Pick<Tile, "id" | "accent">): string {
  if (t.accent && COLOR_RE.test(t.accent.trim())) return t.accent.trim();
  if (t.accent) return FALLBACK_INK; // unknown syntax: do not guess
  return `hsl(${hash(t.id) % 360} 62% 56%)`;
}

/** Relative luminance (0..1) for #rgb / #rrggbb; null for anything else. */
export function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Wordmark text size tier, in units of the reference 1920x1080 pixel. */
export function wordmarkSize(title: string): number {
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length), 1);
  const total = title.length;
  if (total <= 7) return 64;
  if (longest <= 8 && total <= 12) return 54;
  if (longest <= 8) return 46;
  return longest <= 11 ? 40 : 32;
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 22) return "Good evening";
  return "Good night";
}
