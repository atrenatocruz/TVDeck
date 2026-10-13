import { tick } from "./haptics.ts";
import { Dpad } from "./views/Dpad.tsx";
import { pcName, send, status } from "./ws.ts";

const STATUS_TEXT = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  unpaired: "Not paired",
} as const;

function StatusPill() {
  const s = status.value;
  const name = pcName.value;
  return (
    <header class="top">
      <div class="pill" data-status={s} role="status" aria-live="polite">
        <span class="dot" />
        <span class="pill-text">
          {STATUS_TEXT[s]}
          {s === "connected" && name ? <span class="pill-sub"> to {name}</span> : null}
          {s === "reconnecting" || s === "connecting" ? <span class="pill-sub">...</span> : null}
        </span>
      </div>
    </header>
  );
}

function Notice() {
  if (status.value !== "unpaired") return null;
  return (
    <div class="notice" role="alert">
      <strong>Not paired</strong>
      <span>Open the link shown on the PC to pair this phone.</span>
    </div>
  );
}

function PillButton(props: { label: string; onPress: () => void; children: preact.ComponentChildren }) {
  return (
    <button
      type="button"
      class="pillbtn"
      onPointerDown={() => props.onPress()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && props.onPress()}
    >
      <span class="pillbtn-icon" aria-hidden="true">
        {props.children}
      </span>
      <span>{props.label}</span>
    </button>
  );
}

const press = (name: "back" | "home") => () => {
  if (send({ type: "button", name })) tick(10);
};

function Actions() {
  return (
    <div class="actions">
      <PillButton label="Back" onPress={press("back")}>
        <svg viewBox="0 0 24 24">
          <path d="M14.5 6 8.5 12l6 6" />
        </svg>
      </PillButton>
      <PillButton label="Home" onPress={press("home")}>
        <svg viewBox="0 0 24 24">
          <path d="M4.5 11 12 4.5 19.5 11M6.5 9.8V19h11V9.8" />
        </svg>
      </PillButton>
    </div>
  );
}

function TabBar() {
  return (
    <nav class="tabs" aria-label="Remote sections">
      <button class="tab" aria-current="page" type="button">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="3.5" width="10" height="17" rx="3.2" />
          <circle cx="12" cy="10" r="1.6" />
        </svg>
        <span>Remote</span>
      </button>
      <button class="tab" type="button" aria-disabled="true" title="Coming soon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5.5" width="16" height="13" rx="3.5" />
          <path d="M9 15.5h6" />
        </svg>
        <span>Touchpad</span>
        <i class="soon">Soon</i>
      </button>
      <button class="tab" type="button" aria-disabled="true" title="Coming soon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="4.5" width="6" height="6" rx="1.8" />
          <rect x="13.5" y="4.5" width="6" height="6" rx="1.8" />
          <rect x="4.5" y="13.5" width="6" height="6" rx="1.8" />
          <rect x="13.5" y="13.5" width="6" height="6" rx="1.8" />
        </svg>
        <span>Apps</span>
        <i class="soon">Soon</i>
      </button>
    </nav>
  );
}

export function App() {
  return (
    <div class="shell">
      <div class="aura" aria-hidden="true" />
      <StatusPill />
      <main class="stage">
        <Notice />
        <div class="brand" aria-hidden="true">
          <img class="brand-mark" src="/remote/icon.svg" alt="" />
          <span class="brand-name">TVDeck</span>
          <span>Your PC, on the big screen</span>
        </div>
        <Dpad />
        <Actions />
      </main>
      <TabBar />
    </div>
  );
}
