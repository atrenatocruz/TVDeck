import { Offline } from "./components/Offline.tsx";
import { Unpaired } from "./components/Unpaired.tsx";
import { tick } from "./haptics.ts";
import { IconApps, IconRemote, IconTouchpad } from "./icons.tsx";
import { setTab, TABS, tab, type Tab } from "./nav.ts";
import { AppsView } from "./views/Apps.tsx";
import { RemoteView } from "./views/Remote.tsx";
import { TouchpadView } from "./views/Touchpad.tsx";
import { frontApp, pcName, send, status, toast } from "./ws.ts";

const STATUS_TEXT = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Offline",
  unpaired: "Not paired",
} as const;

function StatusPill() {
  const s = status.value;
  const name = pcName.value;
  const front = frontApp.value;
  return (
    <header class="top">
      <div class="pill" data-status={s} role="status" aria-live="polite">
        <span class="dot" />
        <span class="pill-text">
          {STATUS_TEXT[s]}
          {s === "connected" && front ? <span class="pill-sub"> · {front}</span> : null}
          {s === "connected" && !front && name ? <span class="pill-sub"> to {name}</span> : null}
          {s === "reconnecting" || s === "connecting" ? <span class="pill-sub">...</span> : null}
        </span>
      </div>
    </header>
  );
}

function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" key={t.id} role="status" aria-live="polite">
      <i class="toast-dot" />
      <span>{t.text}</span>
    </div>
  );
}

const TAB_META: Record<Tab, { label: string; icon: () => preact.JSX.Element; view: () => preact.JSX.Element }> = {
  remote: { label: "Remote", icon: IconRemote, view: RemoteView },
  touchpad: { label: "Touchpad", icon: IconTouchpad, view: TouchpadView },
  apps: { label: "Apps", icon: IconApps, view: AppsView },
};

function TabBar() {
  const idx = TABS.indexOf(tab.value);
  return (
    <nav class="tabs" aria-label="Remote sections" style={{ "--i": String(idx) }}>
      <i class="tabs-thumb" aria-hidden="true" />
      {TABS.map((t) => {
        const { label, icon: Icon } = TAB_META[t];
        return (
          <button
            key={t}
            class="tab"
            type="button"
            aria-current={tab.value === t ? "page" : undefined}
            onPointerDown={() => {
              if (tab.value !== t) tick(6);
              setTab(t);
            }}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTab(t)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** All three views stay mounted; the active one sits at 0 and the others rest to its left/right. */
function Panels() {
  const active = TABS.indexOf(tab.value);
  return (
    <main class="stage">
      {TABS.map((t, i) => {
        const View = TAB_META[t].view;
        const off = i - active;
        return (
          <section
            key={t}
            class="panel"
            data-pos={off === 0 ? "active" : off < 0 ? "before" : "after"}
            aria-hidden={off !== 0}
            inert={off !== 0}
            aria-label={TAB_META[t].label}
          >
            <View />
          </section>
        );
      })}
    </main>
  );
}

export function App() {
  if (status.value === "unpaired") {
    return (
      <div class="shell">
        <div class="aura" aria-hidden="true" />
        <Unpaired />
      </div>
    );
  }
  return (
    <div class="shell">
      <div class="aura" aria-hidden="true" />
      <StatusPill />
      <Panels />
      <Toast />
      <TabBar />
      {status.value === "offline" ? <Offline /> : null}
    </div>
  );
}
