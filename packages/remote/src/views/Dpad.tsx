import { signal } from "@preact/signals";
import type { Dir } from "@tvdeck/protocol";
import { tick } from "../haptics.ts";
import { createRepeater } from "../repeat.ts";
import { send, status } from "../ws.ts";

const C = 160;
const R_OUT = 146; // geometry is inset so the 12px round-join stroke fills it back out
const R_IN = 76;
const HALF_SPAN = 45 - 4.7; // degrees; the rest is the gap between wedges

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
};

function wedgePath(centerDeg: number): string {
  const a1 = centerDeg - HALF_SPAN;
  const a2 = centerDeg + HALF_SPAN;
  const rIn = R_IN;
  return `M ${pt(R_OUT, a1)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a2)} L ${pt(rIn, a2)} A ${rIn} ${rIn} 0 0 0 ${pt(rIn, a1)} Z`;
}

const WEDGES: { dir: Dir; deg: number; rot: number; label: string }[] = [
  { dir: "up", deg: -90, rot: 0, label: "Up" },
  { dir: "right", deg: 0, rot: 90, label: "Right" },
  { dir: "down", deg: 90, rot: 180, label: "Down" },
  { dir: "left", deg: 180, rot: 270, label: "Left" },
];

const pressed = signal<Dir | null>(null);
const okDown = signal(false);

const repeaters = Object.fromEntries(
  WEDGES.map((w) => [
    w.dir,
    createRepeater(() => {
      if (send({ type: "nav", dir: w.dir })) tick();
    }),
  ]),
) as Record<Dir, ReturnType<typeof createRepeater>>;

function Wedge({ dir, deg, rot, label }: (typeof WEDGES)[number]) {
  const press = (e: PointerEvent) => {
    if (e.button > 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pressed.value = dir;
    repeaters[dir].start();
  };
  const release = () => {
    repeaters[dir].stop();
    if (pressed.value === dir) pressed.value = null;
  };
  const mid = (R_OUT + R_IN) / 2 + 2;
  const cx = C + mid * Math.cos((deg * Math.PI) / 180);
  const cy = C + mid * Math.sin((deg * Math.PI) / 180);
  return (
    <g
      class="wedge"
      data-pressed={pressed.value === dir}
      role="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
    >
      <path d={wedgePath(deg)} class="wedge-shape" />
      <path
        d="M -10 5 L 0 -5.5 L 10 5"
        class="wedge-chevron"
        transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot})`}
      />
    </g>
  );
}

export function Dpad() {
  const disabled = status.value === "unpaired";
  return (
    <div class="dpad" data-disabled={disabled} data-status={status.value}>
      <svg viewBox="0 0 320 320" class="dpad-svg" aria-label="Directional pad">
        <circle cx={C} cy={C} r="158" class="dpad-plate" />
        {WEDGES.map((w) => (
          <Wedge key={w.dir} {...w} />
        ))}
      </svg>
      <button
        type="button"
        class="ok"
        aria-label="OK"
        data-pressed={okDown.value}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          okDown.value = true;
          if (send({ type: "button", name: "ok" })) tick(12);
        }}
        onPointerUp={() => (okDown.value = false)}
        onPointerCancel={() => (okDown.value = false)}
        onLostPointerCapture={() => (okDown.value = false)}
      >
        <span>OK</span>
      </button>
    </div>
  );
}
