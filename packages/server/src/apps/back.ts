import type { Tile } from "@tvdeck/protocol";
import type { ForegroundState } from "./foregroundState.ts";
import { backChord, type KeyName } from "../win32/keymap.ts";

/** Keys the remote's Back button sends: the foreground tile's `backKey` if it has one, else Esc. */
export function backKeysFor(state: ForegroundState, tiles: readonly Tile[]): KeyName[] {
  if (state.foreground !== "app" || !state.tileId) return backChord("esc");
  const tile = tiles.find((t) => t.id === state.tileId);
  return backChord(tile?.backKey ?? "esc");
}
