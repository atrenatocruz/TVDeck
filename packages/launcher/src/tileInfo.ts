import type { Tile } from "@tvdeck/protocol";

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

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** #rgb, #rrggbb, rgb()/rgba() and hsl()/hsla() (comma or space syntax); null for anything else. */
export function parseColor(color: string): Rgb | null {
  const c = color.trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(c);
  if (m) {
    let hex = m[1]!;
    if (hex.length === 3) hex = [...hex].map((x) => x + x).join("");
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (m) return { r: clamp255(+m[1]!), g: clamp255(+m[2]!), b: clamp255(+m[3]!) };
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(c);
  if (m) {
    const h = ((+m[1]! % 360) + 360) % 360;
    const s = Math.min(1, +m[2]! / 100);
    const l = Math.min(1, +m[3]! / 100);
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: clamp255(f(0) * 255), g: clamp255(f(8) * 255), b: clamp255(f(4) * 255) };
  }
  return null;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function toHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("");
}

export function rgbLuminance({ r, g, b }: Rgb): number {
  const ch = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** HSL-style saturation 0..1 (0 for greys). */
export function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

/** WCAG contrast of white text on this colour. */
export const contrastOnWhite = (c: Rgb) => 1.05 / (rgbLuminance(c) + 0.05);

/** Mixes the colour towards black, no more than needed, until white reads on it at `min` contrast. */
export function darkenForWhite(c: Rgb, min = 3.4): Rgb {
  let out = c;
  for (let t = 0; t <= 1 && contrastOnWhite(out) < min; t += 0.04) {
    out = { r: c.r * (1 - t), g: c.g * (1 - t), b: c.b * (1 - t) };
  }
  return out;
}

/** What the logo itself looks like, measured over its visible pixels. */
export interface LogoStats {
  lum: number;
  rgb: Rgb;
}
export type LogoTone = "light" | "dark" | "mixed";

/** Near-white logos, near-black logos, and everything else (coloured, or two-tone like YouTube). */
export function classifyLogo(s: LogoStats): LogoTone {
  if (s.lum >= 0.72 && saturation(s.rgb) < 0.35) return "light";
  if (s.lum <= 0.1 && saturation(s.rgb) < 0.35) return "dark";
  return "mixed";
}

export interface Surface {
  kind: "accent" | "dark" | "light";
  /** Lower colour of the icon's very subtle vertical gradient, and its upper colour. */
  base: string;
  top: string;
}

const NEUTRAL: Record<"dark" | "light", Surface> = {
  dark: { kind: "dark", base: "#17171b", top: "#26262c" },
  light: { kind: "light", base: "#e9e9ee", top: "#ffffff" },
};

/**
 * Icon surface that keeps the logo readable. White logos sit on the tile's accent (darkened until
 * white reads at 3.4:1); near-black logos on a light neutral; coloured logos on a dark neutral.
 */
export function surfaceFor(accent: string, tone: LogoTone | null): Surface {
  if (tone === "dark") return NEUTRAL.light;
  if (tone === "mixed" || tone === null) return NEUTRAL.dark;
  const rgb = parseColor(accent);
  if (!rgb) return { kind: "accent", base: `color-mix(in oklab, ${accent} 60%, #000)`, top: `color-mix(in oklab, ${accent} 75%, #000)` };
  const base = darkenForWhite(rgb);
  const top = { r: base.r + (255 - base.r) * 0.1, g: base.g + (255 - base.g) * 0.1, b: base.b + (255 - base.b) * 0.1 };
  return { kind: "accent", base: toHex(base), top: toHex(top) };
}

/** Surface for tiles without an icon (a white wordmark is drawn on it). */
export const wordmarkSurface = (accent: string): Surface => surfaceFor(accent, "light");

/**
 * Colour of the ambient light behind the hero. The accent, unless it is nearly grey (Netflix's
 * near-black) and the logo has a real colour of its own.
 */
export function backdropColor(accent: string, logo: Rgb | null): string {
  const a = parseColor(accent);
  if (!a) return accent;
  if (logo && saturation(a) < 0.25 && saturation(logo) > 0.4) return toHex(logo);
  return accent;
}
