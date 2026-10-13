import { log } from "../log.ts";
import { MOD_NOREPEAT, native, type Native } from "../win32/user32.ts";

const VK_BROWSER_BACK = 0xa6;
const VK_BROWSER_HOME = 0xac;
const ID_HOME = 0x7d01;
const ID_BACK = 0x7d02;

type Api = Pick<Native, "RegisterHotKey" | "UnregisterHotKey" | "PeekHotkey" | "available">;

export interface Hotkeys {
  stop(): void;
}

/**
 * Captures Browser Home / Browser Back system-wide (the Xiaomi remote's Home and Back arrive as these keys)
 * so neither Windows nor Edge acts on them; TVDeck does instead. Polls this thread's message queue for WM_HOTKEY.
 */
export function startHotkeys(onHome: () => void, onBack: () => void, api: Api = native, pollMs = 30): Hotkeys {
  if (!api.available) return { stop() {} };
  const handlers = new Map<number, { name: string; fn: () => void }>();
  const wanted = [
    { id: ID_HOME, vk: VK_BROWSER_HOME, name: "Browser Home", button: "Home", fn: onHome },
    { id: ID_BACK, vk: VK_BROWSER_BACK, name: "Browser Back", button: "Back", fn: onBack },
  ];
  for (const w of wanted) {
    if (api.RegisterHotKey(w.id, MOD_NOREPEAT, w.vk)) {
      handlers.set(w.id, w);
      log.info("remote", `captured ${w.name} key`);
    } else {
      log.warn(
        "remote",
        `could not capture the ${w.name} key (another app or another TVDeck already owns it); the remote's ${w.button} button keeps its normal Windows behaviour`,
      );
    }
  }
  if (handlers.size === 0) return { stop() {} };
  const timer = setInterval(() => {
    for (let i = 0; i < 16; i++) {
      const id = api.PeekHotkey();
      if (id === null) break;
      try {
        handlers.get(id)?.fn();
      } catch (e) {
        log.error("remote", e instanceof Error ? e.message : String(e));
      }
    }
  }, pollMs);
  return {
    stop() {
      clearInterval(timer);
      for (const id of handlers.keys()) api.UnregisterHotKey(id);
      handlers.clear();
    },
  };
}
