import type { Tile as TileData } from "@tvdeck/protocol";
import { useEffect, useRef } from "preact/hooks";
import { Tilt, tilts } from "../tilt.ts";
import { accentOf, surfaceFor, wordmarkSize, wordmarkSurface } from "../tileInfo.ts";
import { logoTone } from "../logoTone.ts";

interface Props {
  tile: TileData;
  row: number;
  index: number;
  focused: boolean;
  rowActive: boolean;
  /** The tile has a live window behind the launcher. */
  running: boolean;
  /** The user just opened it and it is not in front yet. */
  opening: boolean;
  /** Entrance stagger step; undefined once the intro has played. */
  intro?: number;
  onHover(): void;
  onOpen(): void;
}

export function Tile({ tile, row, index, focused, rowActive, running, opening, intro, onHover, onOpen }: Props) {
  const accent = accentOf(tile);
  const hasIcon = !!tile.icon;
  const tone = logoTone(tile.icon);
  const surface = hasIcon ? surfaceFor(accent, tone) : wordmarkSurface(accent);
  const ref = useRef<HTMLButtonElement>(null);
  const tilt = useRef<Tilt | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const t = new Tilt(el);
    tilt.current = t;
    tilts.set(tile.id, t);
    return () => {
      t.destroy();
      if (tilts.get(tile.id) === t) tilts.delete(tile.id);
    };
  }, [tile.id]);

  const wasFocused = useRef(false);
  useEffect(() => {
    tilt.current?.setFocused(focused);
    wasFocused.current = focused;
  }, [focused]);

  const style: Record<string, string | number> = {
    "--accent": accent,
    "--wm": wordmarkSize(tile.title),
    "--surface-base": surface.base,
    "--surface-top": surface.top,
  };
  if (intro !== undefined) style["--i"] = intro;

  return (
    <div class="slot" data-row={row} data-index={index} data-intro={intro !== undefined ? "" : undefined} style={style}>
      <button
        type="button"
        ref={ref}
        class="tile"
        data-tile={tile.id}
        data-focused={focused ? "" : undefined}
        data-row-active={rowActive ? "" : undefined}
        data-running={running ? "" : undefined}
        data-opening={opening ? "" : undefined}
        data-surface={surface.kind}
        data-ready={!hasIcon || tone !== null ? "" : undefined}
        aria-busy={opening || undefined}
        data-kind={hasIcon ? "icon" : "wordmark"}
        tabIndex={-1}
        aria-label={tile.title}
        onPointerMove={(e) => {
          if (e.movementX || e.movementY) onHover();
          if (!focused) return;
          const r = e.currentTarget.getBoundingClientRect();
          tilt.current?.pointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => tilt.current?.leave()}
        onClick={onOpen}
      >
        <span class="tile-body">
          <span class="tile-shadow" aria-hidden="true" />
          <span class="tile-clip">
            <span class="tile-surface" aria-hidden="true" />
            {hasIcon ? (
              <img class="tile-icon" src={`/icons/${encodeURIComponent(tile.icon!)}`} alt="" draggable={false} />
            ) : (
              <span class="tile-wordmark">{tile.title}</span>
            )}
            <span class="tile-glow" aria-hidden="true" />
            <span class="tile-sheen" aria-hidden="true" />
            <span class="tile-shimmer" aria-hidden="true" />
            <span class="tile-edge" aria-hidden="true" />
          </span>
        </span>
      </button>
      <div class="under" aria-hidden="true">
        <i class="run-dot" data-on={running ? "" : undefined} />
        <span class="cap">{tile.title}</span>
      </div>
    </div>
  );
}
