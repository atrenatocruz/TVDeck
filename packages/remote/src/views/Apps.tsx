import type { Tile } from "@tvdeck/protocol";
import { tick } from "../haptics.ts";
import { frontTileId, running, send, status, tiles } from "../ws.ts";

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|lab|lch|hwb)a?\([^)]+\))$/i;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Same rule as the launcher: the configured accent, or a stable colour derived from the id. */
export function accentOf(t: Pick<Tile, "id" | "accent">): string {
  if (t.accent && COLOR_RE.test(t.accent.trim())) return t.accent.trim();
  if (t.accent) return "#7f8cff";
  return `hsl(${hash(t.id) % 360} 62% 56%)`;
}

function Card({ tile }: { tile: Tile }) {
  const isFront = frontTileId.value === tile.id;
  const isRunning = running.value.has(tile.id);
  const state = isFront ? "front" : isRunning ? "running" : "idle";
  return (
    <button
      type="button"
      class="app"
      data-state={state}
      style={{ "--tile": accentOf(tile) }}
      aria-label={`${tile.title}${isFront ? ", in front" : isRunning ? ", running" : ""}`}
      onClick={() => {
        if (send({ type: "openApp", tileId: tile.id })) tick(12);
      }}
    >
      <span class="app-glyph" aria-hidden="true">
        {tile.title.trim().charAt(0).toUpperCase()}
      </span>
      <span class="app-title">{tile.title}</span>
      <span class="app-state">{isFront ? "In front" : isRunning ? "Running" : " "}</span>
    </button>
  );
}

export function AppsView() {
  const cfg = tiles.value;
  const rows = cfg?.rows.filter((r) => r.tiles.length > 0) ?? [];
  return (
    <div class="apps" data-disabled={status.value === "unpaired"}>
      {rows.length === 0 ? (
        <div class="empty">
          <b>{cfg ? "No apps yet" : "Waiting for the TV"}</b>
          <span>
            {cfg
              ? "Add tiles to config/tiles.json on the PC and they will show up here."
              : "Your apps appear here once the remote connects."}
          </span>
        </div>
      ) : (
        rows.map((row) => (
          <section class="apps-row" key={row.title}>
            <h2>{row.title}</h2>
            <div class="apps-grid">
              {row.tiles.map((t) => (
                <Card key={t.id} tile={t} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
