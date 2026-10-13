import type { Tile, TilesConfig } from "@tvdeck/protocol";
import type { AppService } from "../apps/service.ts";
import { pressBack, pressHome } from "../dispatch.ts";
import { InputGuard } from "../inputGuard.ts";
import { log } from "../log.ts";
import { tapKey } from "../win32/input.ts";
import { RemoteButtons, resolveButtons, resolveHid } from "./actions.ts";
import { startHotkeys, type Hotkeys } from "./hotkeys.ts";
import { loadNodeHid, startHidRemote } from "./hidRemote.ts";

export interface RemoteSupport {
  stop(): void;
}

const DRY = () => process.env.TVDECK_DRY_INPUT === "1";

/**
 * Xiaomi Bluetooth remote: HID buttons plus the system-wide Browser Home/Back capture.
 * Every action goes through the same functions the phone remote uses.
 */
export function startRemoteSupport(
  getConfig: () => TilesConfig,
  getTiles: () => readonly Tile[],
  apps: AppService,
): RemoteSupport {
  const guard = new InputGuard();
  const dry = DRY();
  const home = () => (dry ? log.info("remote", "[dry] home") : pressHome(apps));
  const back = () => pressBack(apps); // chord() already honours TVDECK_DRY_INPUT
  const buttons = new RemoteButtons({
    tap: tapKey,
    home,
    back,
    open: async (id) => {
      if (dry) return log.info("remote", `[dry] open ${id}`);
      await apps.open(id);
    },
    hasTile: (id) => getTiles().some((t) => t.id === id),
    buttons: () => resolveButtons(getConfig().remote),
    allow: () => guard.allowMessage(),
    warn: (m) => log.warn("remote", m),
    info: (m) => log.info("remote", m),
  });

  let hid: { stop(): void } | undefined;
  let hotkeys: Hotkeys | undefined;
  let stopped = false;

  loadNodeHid()
    .then((backend) => {
      if (stopped) return;
      hid = startHidRemote({
        backend,
        ids: () => resolveHid(getConfig().remote),
        onDown: (b) => buttons.press(b),
        onUp: (b) => buttons.release(b),
        onDisconnect: () => buttons.releaseAll(),
      });
    })
    .catch((e: unknown) => log.warn("remote", `Xiaomi remote support unavailable (node-hid): ${e instanceof Error ? e.message : String(e)}`));

  if (process.env.TVDECK_CAPTURE_BROWSER_KEYS === "0") log.info("remote", "TVDECK_CAPTURE_BROWSER_KEYS=0: Browser Home/Back keys are not captured");
  else hotkeys = startHotkeys(home, back);

  return {
    stop() {
      stopped = true;
      buttons.releaseAll();
      hid?.stop();
      hotkeys?.stop();
    },
  };
}
