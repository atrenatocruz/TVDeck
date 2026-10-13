import { PressButton } from "../components/Buttons.tsx";
import {
  IconBack,
  IconHome,
  IconMute,
  IconNext,
  IconPlayPause,
  IconPrev,
  IconVolDown,
  IconVolUp,
} from "../icons.tsx";
import { send } from "../ws.ts";
import { Dpad } from "./Dpad.tsx";

type Media = "playPause" | "next" | "prev";
type Vol = "up" | "down" | "mute";
const media = (action: Media) => () => send({ type: "media", action });
const volume = (action: Vol) => () => send({ type: "volume", action });
const button = (name: "back" | "home") => () => send({ type: "button", name });

/** D-pad, Back/Home, then media and volume at the bottom where a thumb rests. */
export function RemoteView() {
  return (
    <div class="remote">
      <div class="brand" aria-hidden="true">
        <img class="brand-mark" src="/remote/icon.svg" alt="" />
        <span class="brand-name">TVDeck</span>
        <span>Your PC, on the big screen</span>
      </div>
      <Dpad />
      <div class="actions">
        <PressButton class="pill" label="Back" showLabel onPress={button("back")}>
          <IconBack />
        </PressButton>
        <PressButton class="pill" label="Home" showLabel onPress={button("home")}>
          <IconHome />
        </PressButton>
      </div>
      <div class="deck" role="group" aria-label="Media and volume">
        <div class="cluster" role="group" aria-label="Media">
          <PressButton class="round" label="Previous" onPress={media("prev")}>
            <IconPrev />
          </PressButton>
          <PressButton class="round primary" label="Play or pause" onPress={media("playPause")}>
            <IconPlayPause />
          </PressButton>
          <PressButton class="round" label="Next" onPress={media("next")}>
            <IconNext />
          </PressButton>
        </div>
        <div class="cluster" role="group" aria-label="Volume">
          <PressButton class="round" label="Volume down" repeat onPress={volume("down")}>
            <IconVolDown />
          </PressButton>
          <PressButton class="round" label="Mute" onPress={volume("mute")}>
            <IconMute />
          </PressButton>
          <PressButton class="round" label="Volume up" repeat onPress={volume("up")}>
            <IconVolUp />
          </PressButton>
        </div>
      </div>
    </div>
  );
}
