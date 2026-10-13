import type { ClientMsg, ServerMsg } from "@tvdeck/protocol";
import type { AppService } from "./apps/service.ts";
import { InputGuard } from "./inputGuard.ts";
import { log } from "./log.ts";
import { goHome } from "./win32/foreground.ts";
import { chord, mouseClick, mouseMove, mouseScroll, tapKey, typeText } from "./win32/input.ts";
import type { KeyName } from "./win32/keymap.ts";

const MEDIA: Record<"playPause" | "next" | "prev" | "stop", KeyName> = {
  playPause: "playPause",
  next: "next",
  prev: "prev",
  stop: "stop",
};
const VOLUME: Record<"up" | "down" | "mute", KeyName> = { up: "volumeUp", down: "volumeDown", mute: "mute" };

/** Executes an authenticated, validated input message. Launcher-only types are filtered upstream. */
export function dispatch(
  msg: ClientMsg,
  reply: (m: ServerMsg) => void = () => {},
  apps?: AppService,
  guard: InputGuard = new InputGuard(),
): void {
  if (msg.type !== "hello" && msg.type !== "ping" && !guard.allowMessage()) {
    if (guard.shouldNotify()) {
      log.warn("input", `rate limit hit, dropping ${msg.type}`);
      reply({ type: "error", code: "rate_limited", message: "Too many inputs, slow down" });
    }
    return;
  }
  switch (msg.type) {
    case "nav":
      tapKey(msg.dir);
      break;
    case "button":
      if (msg.name === "ok") tapKey("enter");
      else if (msg.name === "back") {
        const keys = apps?.backKeys() ?? ["esc"];
        log.info("input", `back -> ${keys.join("+")}`);
        chord(keys);
      }
      else {
        apps?.noteHome();
        void goHome((m) => log.info("foreground", m)).then(() => apps?.refresh());
      }
      break;
    case "media":
      tapKey(MEDIA[msg.action]);
      break;
    case "volume":
      tapKey(VOLUME[msg.action]);
      break;
    case "mouseMove": {
      const m = guard.move(msg.dx, msg.dy);
      mouseMove(m.dx, m.dy);
      break;
    }
    case "mouseClick":
      mouseClick(msg.button, msg.double ?? false);
      break;
    case "mouseScroll": {
      const s = guard.scroll(msg.dx, msg.dy);
      mouseScroll(s.dx, s.dy);
      break;
    }
    case "typeText": {
      const text = guard.allowText(msg.text);
      if (text.length < msg.text.length) log.warn("input", `typeText throttled (${text.length}/${msg.text.length} chars)`);
      if (text) typeText(text);
      break;
    }
    case "textKey":
      tapKey(msg.key);
      break;
    case "openApp":
      if (!apps) {
        reply({ type: "error", code: "launch_failed", message: "App launching is not available" });
        break;
      }
      apps.open(msg.tileId).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        log.warn("apps", `openApp "${msg.tileId}" failed: ${message}`);
        reply({ type: "error", code: "launch_failed", message });
      });
      break;
    case "pairingStart":
    case "deviceRevoke":
      log.info("dispatch", `${msg.type} not implemented until M5`);
      break;
    case "hello":
    case "ping":
      break; // handled by the socket layer
  }
}
