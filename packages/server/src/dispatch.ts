import type { ClientMsg, ServerMsg } from "@tvdeck/protocol";
import { log } from "./log.ts";
import { goHome } from "./win32/foreground.ts";
import { chord, mouseClick, mouseMove, mouseScroll, tapKey, typeText } from "./win32/input.ts";
import { backChord, type KeyName } from "./win32/keymap.ts";

const MEDIA: Record<"playPause" | "next" | "prev" | "stop", KeyName> = {
  playPause: "playPause",
  next: "next",
  prev: "prev",
  stop: "stop",
};
const VOLUME: Record<"up" | "down" | "mute", KeyName> = { up: "volumeUp", down: "volumeDown", mute: "mute" };

/** Executes an authenticated, validated input message. Launcher-only types are filtered upstream. */
export function dispatch(msg: ClientMsg, reply: (m: ServerMsg) => void = () => {}): void {
  switch (msg.type) {
    case "nav":
      tapKey(msg.dir);
      break;
    case "button":
      if (msg.name === "ok") tapKey("enter");
      else if (msg.name === "back") chord(backChord("esc"));
      else void goHome((m) => log.info("foreground", m));
      break;
    case "media":
      tapKey(MEDIA[msg.action]);
      break;
    case "volume":
      tapKey(VOLUME[msg.action]);
      break;
    case "mouseMove":
      mouseMove(msg.dx, msg.dy);
      break;
    case "mouseClick":
      mouseClick(msg.button, msg.double ?? false);
      break;
    case "mouseScroll":
      mouseScroll(msg.dx, msg.dy);
      break;
    case "typeText":
      typeText(msg.text);
      break;
    case "textKey":
      tapKey(msg.key);
      break;
    case "openApp":
      log.info("dispatch", `openApp "${msg.tileId}": launching arrives in M3`);
      reply({ type: "error", code: "launch_failed", message: "App launching arrives in M3" });
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
