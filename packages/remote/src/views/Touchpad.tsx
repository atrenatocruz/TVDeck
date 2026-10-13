import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { PressButton } from "../components/Buttons.tsx";
import { tick } from "../haptics.ts";
import { IconBackspace, IconEnter, IconKeyboard, IconSpace, IconTab } from "../icons.tsx";
import { type Sensitivity, SENSITIVITY, TouchpadGestures } from "../touchpad/gestures.ts";
import { sensitivity, setSensitivity } from "../touchpad/prefs.ts";
import { planSink, SENTINEL, type TextOp } from "../touchpad/sink.ts";
import { send, status } from "../ws.ts";

/* ---------------- outbound text queue (keeps order, paces big pastes under the server limit) ---------------- */

const queue: TextOp[] = [];
let pumping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (let op = queue.shift(); op; op = queue.shift()) {
      if (!send(op)) {
        queue.length = 0; // offline: drop rather than replay stale typing later
        break;
      }
      if (op.type === "typeText" && op.text.length > 100) await sleep(op.text.length * 0.7);
    }
  } finally {
    pumping = false;
  }
}
function enqueue(ops: TextOp[]): void {
  queue.push(...ops);
  void pump();
}

/* ---------------- text sink ---------------- */

function TextSink() {
  const ta = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const reset = () => {
    const el = ta.current;
    if (!el) return;
    el.value = SENTINEL;
    el.setSelectionRange(SENTINEL.length, SENTINEL.length);
  };
  const flush = () => {
    const el = ta.current;
    if (!el) return;
    const ops = planSink(el.value);
    if (ops.length) {
      enqueue(ops);
      tick(4);
    }
    reset();
  };
  useEffect(reset, []);
  // Preact only lowercases known on* handlers, and composition events are not among them, so bind natively.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    const start = () => void (composing.current = true);
    const end = () => {
      composing.current = false;
      flush(); // committed text only; partial composition is never sent
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    return () => {
      el.removeEventListener("compositionstart", start);
      el.removeEventListener("compositionend", end);
    };
  }, []);

  const keys = [
    { label: "Backspace", key: "backspace", icon: <IconBackspace />, repeat: 70 },
    { label: "Space", key: "space", icon: <IconSpace /> },
    { label: "Enter", key: "enter", icon: <IconEnter /> },
    { label: "Tab", key: "tab", icon: <IconTab /> },
  ] as const;

  return (
    <section class="typebox" aria-label="Type on the TV">
      <label class="field">
        <span class="field-icon">
          <IconKeyboard />
        </span>
        <span class="field-ph" aria-hidden="true">
          Tap to type on the TV
        </span>
        <textarea
          ref={ta}
          rows={1}
          class="field-input"
          aria-label="Text to type on the PC"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="send"
          autocorrect="off"
          onFocus={reset}
          onSelect={(e) => {
            const el = e.currentTarget;
            if (!composing.current && el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
          }}
          onInput={(e) => {
            const ev = e as InputEvent;
            if (composing.current || ev.isComposing) return;
            flush();
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              enqueue([{ type: "textKey", key: "tab" }]);
            }
          }}
        />
      </label>
      <div class="keyrow" role="group" aria-label="Keys">
        {keys.map((k) => (
          <PressButton
            key={k.key}
            class="keybtn"
            label={k.label}
            showLabel
            repeat={"repeat" in k ? k.repeat : undefined}
            onPress={() => {
              if (ta.current && ta.current.value !== SENTINEL) flush(); // keep order: pending text first
              return send({ type: "textKey", key: k.key });
            }}
          >
            {k.icon}
          </PressButton>
        ))}
      </div>
    </section>
  );
}

/* ---------------- pad ---------------- */

const touched = signal(false); // hides the gesture hint after the first touch this session

function Pad() {
  const pad = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const glows = useRef(new Map<number, HTMLElement>());
  const raf = useRef(0);
  const g = useMemo(() => new TouchpadGestures(() => SENSITIVITY[sensitivity.value]), []);

  const flush = () => {
    raf.current = 0;
    const f = g.takeFrame();
    if (f.move) send({ type: "mouseMove", dx: f.move.dx, dy: f.move.dy });
    if (f.scroll) send({ type: "mouseScroll", dx: f.scroll.dx, dy: f.scroll.dy });
  };
  const schedule = () => {
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const local = (e: PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const ripple = (x: number, y: number, kind: "left" | "right") => {
    const el = document.createElement("i");
    el.className = `ripple ${kind}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 900);
    fx.current?.appendChild(el);
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button > 0) return;
    try {
      pad.current!.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone: keep tracking via the pad's own events */
    }
    touched.value = true;
    g.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    const { x, y } = local(e);
    const glow = document.createElement("i");
    glow.className = "glow";
    glow.style.transform = `translate(${x}px, ${y}px)`;
    fx.current?.appendChild(glow);
    glows.current.set(e.pointerId, glow);
    requestAnimationFrame(() => glow.classList.add("on"));
  };
  const move = (e: PointerEvent) => {
    const glow = glows.current.get(e.pointerId);
    if (!glow) return;
    g.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    const { x, y } = local(e);
    glow.style.transform = `translate(${x}px, ${y}px)`;
    if (g.hasPending) schedule();
  };
  const end = (e: PointerEvent, cancelled: boolean) => {
    const glow = glows.current.get(e.pointerId);
    if (!glow) return;
    glows.current.delete(e.pointerId);
    glow.classList.remove("on");
    setTimeout(() => glow.remove(), 450);
    if (cancelled) return g.cancel(e.pointerId);
    // Deliver pending motion first so the click lands where the finger left off.
    cancelAnimationFrame(raf.current);
    flush();
    const { x, y } = local(e);
    for (const c of g.up(e.pointerId, e.timeStamp)) {
      if (send({ type: "mouseClick", button: c.button })) tick(c.button === "right" ? 14 : 8);
      ripple(x, y, c.button);
    }
  };

  const disabled = status.value === "unpaired";
  return (
    <div
      ref={pad}
      class="pad"
      data-disabled={disabled}
      data-touched={touched.value}
      role="application"
      aria-label="Touchpad. Drag to move the pointer, tap to click, two fingers to scroll."
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
    >
      <div class="pad-grain" aria-hidden="true" />
      <div class="pad-hint" aria-hidden="true">
        <div>
          <b>1 finger</b>
          <span>Move, tap to click</span>
        </div>
        <div>
          <b>2 fingers</b>
          <span>Scroll, tap to right-click</span>
        </div>
      </div>
      <div class="pad-fx" ref={fx} aria-hidden="true" />
    </div>
  );
}

const SPEEDS: { id: Sensitivity; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

function Speed() {
  const idx = SPEEDS.findIndex((s) => s.id === sensitivity.value);
  return (
    <div class="speed" role="radiogroup" aria-label="Pointer speed" style={{ "--i": String(idx) }}>
      <i class="speed-thumb" aria-hidden="true" />
      {SPEEDS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={sensitivity.value === s.id}
          onClick={() => {
            setSensitivity(s.id);
            tick(6);
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function TouchpadView() {
  return (
    <div class="touchpad">
      <TextSink />
      <Pad />
      <Speed />
    </div>
  );
}
