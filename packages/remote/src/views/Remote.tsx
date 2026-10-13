import { PressButton } from "../components/Buttons.tsx";
import { tick } from "../haptics.ts";
import { IconBack, IconMinus, IconMute, IconPlayPause, IconPlus, IconTv } from "../icons.tsx";
import { send } from "../ws.ts";
import { Clickpad, padMode, setPadMode, type PadMode } from "./Clickpad.tsx";
import { Dpad } from "./Dpad.tsx";

const MODES: { id: PadMode; label: string }[] = [
  { id: "swipe", label: "Swipe" },
  { id: "dpad", label: "D-pad" },
];

function ModeSwitch() {
  const idx = MODES.findIndex((m) => m.id === padMode.value);
  return (
    <div class="mode" role="radiogroup" aria-label="Control style" style={{ "--i": String(idx) }}>
      <i class="mode-thumb" aria-hidden="true" />
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={padMode.value === m.id}
          class="mode-opt"
          onPointerDown={() => {
            if (padMode.value !== m.id) tick(6);
            setPadMode(m.id);
          }}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPadMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** The surface (swipe pad or click-ring) on top; Back/Home/Play/Mute and a volume rocker under the thumb. */
export function RemoteView() {
  return (
    <div class="remote">
      <div class="surface">
        {padMode.value === "swipe" ? (
          <Clickpad />
        ) : (
          <div class="ring-wrap">
            <Dpad />
          </div>
        )}
        <ModeSwitch />
      </div>
      <div class="controls">
        <div class="keys" role="group" aria-label="Buttons">
          <PressButton class="key" label="Back" onPress={() => send({ type: "button", name: "back" })}>
            <IconBack />
          </PressButton>
          <PressButton class="key" label="Home" onPress={() => send({ type: "button", name: "home" })}>
            <IconTv />
          </PressButton>
          <PressButton class="key" label="Play or pause" onPress={() => send({ type: "media", action: "playPause" })}>
            <IconPlayPause />
          </PressButton>
          <PressButton class="key" label="Mute" onPress={() => send({ type: "volume", action: "mute" })}>
            <IconMute />
          </PressButton>
        </div>
        <div class="rocker" role="group" aria-label="Volume">
          <PressButton class="rocker-btn" label="Volume up" repeat onPress={() => send({ type: "volume", action: "up" })}>
            <IconPlus />
          </PressButton>
          <PressButton class="rocker-btn" label="Volume down" repeat onPress={() => send({ type: "volume", action: "down" })}>
            <IconMinus />
          </PressButton>
        </div>
      </div>
    </div>
  );
}
