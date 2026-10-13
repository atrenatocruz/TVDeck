import type { Tile as TileData } from "@tvdeck/protocol";
import { logoInfo } from "../logoTone.ts";
import { opening } from "../store.ts";

/**
 * The top shelf. Every tile has its own item stacked in the same place; the focused one is faded in
 * (opacity + a few pixels of drift), so moving focus is a pure cross-fade that can be interrupted.
 */
export function Hero({ tiles, activeId }: { tiles: TileData[]; activeId: string | null }) {
  return (
    <section class="hero" aria-hidden="true">
      {tiles.map((t) => {
        const info = logoInfo(t.icon);
        const busy = opening.value?.id === t.id;
        return (
          <div class="hero-item" key={t.id} data-active={t.id === activeId ? "" : undefined} data-opening={busy ? "" : undefined} data-tone={info?.tone}>
            {t.icon ? (
              <img class="hero-logo" src={`/icons/${encodeURIComponent(t.icon)}`} alt="" draggable={false} />
            ) : (
              <div class="hero-wordmark">{t.title}</div>
            )}
            <div class="hero-meta">
              <span class="hero-name">{t.title}</span>
              <span class="hero-state">Opening{"\u2026"}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
