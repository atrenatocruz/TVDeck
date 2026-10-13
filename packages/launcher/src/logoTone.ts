import { signal } from "@preact/signals";
import { analyzeLogo, type LogoInfo } from "./iconStats.ts";
import type { LogoTone } from "./tileInfo.ts";

/** icon file -> what its logo looks like. Filled in as the icons are measured; components re-render on change. */
export const logos = signal<Record<string, LogoInfo | null>>({});

const asked = new Set<string>();

export function ensureLogo(icon: string): void {
  if (asked.has(icon)) return;
  asked.add(icon);
  void analyzeLogo(`/icons/${encodeURIComponent(icon)}`).then((info) => {
    logos.value = { ...logos.value, [icon]: info };
  });
}

/** null while still measuring; "mixed" (the safe dark surface) if the icon cannot be read. */
export function logoTone(icon: string | undefined): LogoTone | null {
  if (!icon) return null;
  ensureLogo(icon);
  const l = logos.value;
  if (!(icon in l)) return null;
  return l[icon]?.tone ?? "mixed";
}

export function logoInfo(icon: string | undefined): LogoInfo | null {
  return icon ? (logos.value[icon] ?? null) : null;
}
