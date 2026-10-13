import type { Tile as TileData } from "@tvdeck/protocol";
import { accentOf, luminance, tileSub, wordmarkSize } from "../tileInfo.ts";

interface Props {
  tile: TileData;
  row: number;
  index: number;
  focused: boolean;
  rowActive: boolean;
  /** Entrance stagger step; undefined once the intro has played. */
  intro?: number;
  onHover(): void;
  onOpen(): void;
}

export function Tile({ tile, row, index, focused, rowActive, intro, onHover, onOpen }: Props) {
  const accent = accentOf(tile);
  const lum = luminance(accent);
  const hasIcon = !!tile.icon;
  const style: Record<string, string | number> = { "--accent": accent, "--wm": wordmarkSize(tile.title) };
  if (intro !== undefined) style["--i"] = intro;

  return (
    <div class="slot" data-row={row} data-index={index} data-intro={intro !== undefined ? "" : undefined} style={style}>
      <button
        type="button"
        class="tile"
        data-tile={tile.id}
        data-focused={focused ? "" : undefined}
        data-row-active={rowActive ? "" : undefined}
        data-kind={hasIcon ? "icon" : "wordmark"}
        data-ink={lum !== null && lum > 0.55 ? "dark" : "light"}
        tabIndex={-1}
        aria-label={tile.title}
        onPointerMove={(e) => (e.movementX || e.movementY) && onHover()}
        onClick={onOpen}
      >
        <span class="tile-glow" aria-hidden="true" />
        <span class="tile-face">
          {hasIcon ? (
            <img class="tile-icon" src={`/icons/${encodeURIComponent(tile.icon!)}`} alt="" draggable={false} />
          ) : (
            <span class="tile-wordmark">{tile.title}</span>
          )}
          <span class="tile-shade" aria-hidden="true" />
        </span>
        <span class="tile-ring" aria-hidden="true" />
      </button>
      <div class="caption" aria-hidden="true">
        {hasIcon ? <span class="cap-title">{tile.title}</span> : null}
        <span class="cap-sub">{tileSub(tile)}</span>
      </div>
    </div>
  );
}
