import type { ComponentChildren } from "preact";
import { useMemo, useRef } from "preact/hooks";
import { tick } from "../haptics.ts";
import { createRepeater, VOLUME_REPEAT_INTERVAL_MS } from "../repeat.ts";

interface BtnProps {
  label: string;
  /** Fire the action; return true when it was actually sent (drives the haptic tick). */
  onPress: () => boolean | void;
  children: ComponentChildren;
  /** Hold-to-repeat: true = the slower volume cadence, or an interval in ms. */
  repeat?: boolean | number;
  class?: string;
  /** Show the text label next to the icon (pill) or only icon (round). */
  showLabel?: boolean;
}

/** Responds on pointer-down (not release), repeats while held when asked, and haptics on every fire. */
export function PressButton(props: BtnProps) {
  const latest = useRef(props);
  latest.current = props;
  const fire = () => {
    if (latest.current.onPress() !== false) tick(latest.current.repeat ? 6 : 10);
  };
  const repeater = useMemo(() => (props.repeat ? createRepeater(() => fire(), typeof props.repeat === "number" ? props.repeat : VOLUME_REPEAT_INTERVAL_MS) : null), []);
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (repeater) repeater.start();
    else fire();
  };
  const up = () => repeater?.stop();
  return (
    <button
      type="button"
      class={`pbtn ${props.class ?? ""}`}
      aria-label={props.label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onKeyDown={(e) => !e.repeat && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fire())}
    >
      <span class="pbtn-icon">{props.children}</span>
      {props.showLabel ? <span class="pbtn-label">{props.label}</span> : null}
    </button>
  );
}
