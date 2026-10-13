import { classifyLogo, type LogoStats, type LogoTone, rgbLuminance } from "./tileInfo.ts";

export interface LogoInfo extends LogoStats {
  tone: LogoTone;
}

const cache = new Map<string, Promise<LogoInfo | null>>();

/**
 * Looks at the logo's visible pixels (alpha-weighted) so the launcher can pick a surface it
 * reads well on. Resolves null if the image cannot be read; callers then use the safe default.
 */
export function analyzeLogo(src: string): Promise<LogoInfo | null> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<LogoInfo | null>((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        try {
          const N = 64;
          const c = document.createElement("canvas");
          c.width = c.height = N;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
          const w = ratio >= 1 ? N : N * ratio;
          const h = ratio >= 1 ? N / ratio : N;
          ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
          const d = ctx.getImageData(0, 0, N, N).data;
          let r = 0, g = 0, b = 0, wsum = 0;
          for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3]! / 255;
            if (a < 0.2) continue;
            r += d[i]! * a;
            g += d[i + 1]! * a;
            b += d[i + 2]! * a;
            wsum += a;
          }
          if (wsum < 8) return resolve(null);
          const rgb = { r: r / wsum, g: g / wsum, b: b / wsum };
          const stats = { rgb, lum: rgbLuminance(rgb) };
          resolve({ ...stats, tone: classifyLogo(stats) });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}
