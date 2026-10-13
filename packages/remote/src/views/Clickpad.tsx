import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { tick } from "../haptics.ts";
import { SwipeTracker } from "../swipe.ts";
import { send, status } from "../ws.ts";

export type PadMode = "swipe" | "dpad";
const KEY = "tvdeck.padMode";

function loadMode(): PadMode {
  try {
    return localStorage.getItem(KEY) === "dpad" ? "dpad" : "swipe";
  } catch {
    return "swipe";
  }
}

export const padMode = signal<PadMode>(loadMode());

export function setPadMode(m: PadMode): void {
  padMode.value = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* not remembered */
  }
}

/**
 * The swipe surface: swipe to move, hold to keep moving, tap for OK. Visual feedback is written straight
 * to the DOM (CSS variables and data attributes) so a gesture never re-renders the component.
 */
export function Clickpad() {
  const el = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const nudgeTimer = useRef<number>();

  const tracker = useMemo(
    () =>
      new SwipeTracker((e) => {
        const pad = el.current;
        if (e.kind === "ok") {
          if (send({ type: "button", name: "ok" })) tick(12);
          if (pad) {
            pad.removeAttribute("data-tap");
            void pad.offsetWidth; // restart the ripple animation
            pad.setAttribute("data-tap", "");
          }
          return;
        }
        if (send({ type: "nav", dir: e.dir })) tick(6);
        if (pad) {
          pad.dataset.nudge = e.dir;
          clearTimeout(nudgeTimer.current);
          nudgeTimer.current = window.setTimeout(() => pad.removeAttribute("data-nudge"), 240);
        }
      }),
    [],
  );

  useEffect(() => {
    const stop = () => {
      tracker.cancel();
      pointer.current = null;
      el.current?.removeAttribute("data-touch");
    };
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("blur", stop);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("blur", stop);
    };
  }, [tracker]);

  const place = (e: PointerEvent) => {
    const pad = el.current!;
    const r = pad.getBoundingClientRect();
    pad.style.setProperty("--x", `${e.clientX - r.left}px`);
    pad.style.setProperty("--y", `${e.clientY - r.top}px`);
  };

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    el.current?.removeAttribute("data-touch");
    if (cancelled) tracker.cancel();
    else tracker.pointerUp();
  };

  const disabled = status.value !== "connected";

  return (
    <div
      ref={el}
      class="clickpad"
      data-disabled={disabled ? "" : undefined}
      role="application"
      aria-label="Swipe to move, tap to select"
      onPointerDown={(e) => {
        if (pointer.current !== null || e.button > 0) return;
        pointer.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone; moves still arrive while the finger stays on the pad */
        }
        place(e);
        el.current!.setAttribute("data-touch", "");
        tracker.pointerDown(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current !== e.pointerId) return;
        place(e);
        tracker.pointerMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onLostPointerCapture={(e) => end(e, true)}
    >
      <i class="cp-light" aria-hidden="true" />
      <i class="cp-ripple" aria-hidden="true" />
      <i class="cp-edge" data-edge="up" aria-hidden="true" />
      <i class="cp-edge" data-edge="down" aria-hidden="true" />
      <i class="cp-edge" data-edge="left" aria-hidden="true" />
      <i class="cp-edge" data-edge="right" aria-hidden="true" />
      <span class="cp-hint" aria-hidden="true">
        Swipe to move · Tap to select
      </span>
    </div>
  );
}
