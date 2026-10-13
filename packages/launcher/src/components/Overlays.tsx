import QRCode from "qrcode";
import type { DeviceInfo } from "@tvdeck/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { countdown, pairedOn, relativeTime } from "../format.ts";
import { closeOverlay, devices, justPaired, overlay, pairing, pushToast, status } from "../store.ts";
import { send } from "../ws.ts";

function useTick(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const PhoneGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" class="glyph">
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

/** Phone-sized spacing in the overlay is driven by arrow keys, like the rest of the launcher. */
const topOverlay = () => [...document.querySelectorAll<HTMLElement>(".ov")].at(-1) ?? null;

function useOverlayKeys(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const items = () => [...(topOverlay()?.querySelectorAll<HTMLElement>("[data-f]") ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onEscape();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (list.length === 0) return;
        const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        const next = at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + step));
        list[next]!.focus();
      } else if (e.key === "Tab") {
        e.preventDefault(); // focus is trapped; arrows move it
      } else if (e.key === " " || (e.key === "Enter" && e.repeat)) {
        e.preventDefault();
        if (e.key === " " && !e.repeat) (document.activeElement as HTMLElement | null)?.click();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onEscape, enabled]);
}

function Frame({ label, wide, children }: { label: string; wide?: boolean; children: preact.ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-f]");
    first?.focus({ preventScroll: true });
    // if focus ever leaks out (mouse click on the scrim), pull it back
    const onOut = () => {
      queueMicrotask(() => {
        if (topOverlay() !== ref.current) return; // a dialog on top owns focus
        if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>("[data-f]")?.focus({ preventScroll: true });
      });
    };
    document.addEventListener("focusout", onOut);
    return () => document.removeEventListener("focusout", onOut);
  }, []);
  return (
    <div class="scrim" onPointerDown={(e) => e.target === e.currentTarget && overlay.value?.kind !== "confirm" && closeOverlay()}>
      <div class="ov" ref={ref} role="dialog" aria-modal="true" aria-label={label} data-wide={wide ? "" : undefined}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pair */

function PairOverlay() {
  const p = pairing.value;
  const flash = justPaired.value;
  const st = status.value;
  const now = useTick(1000);
  const baseline = useRef(new Set((devices.value ?? []).map((d) => d.id))).current;
  const [svg, setSvg] = useState<string | null>(null);
  useOverlayKeys(closeOverlay);

  // ask for a code when connected (and again after reconnecting)
  useEffect(() => {
    pairing.value = null;
    if (st === "connected") send({ type: "pairingStart" });
  }, [st]);

  // replace the code the moment it expires
  useEffect(() => {
    if (!p || flash) return;
    const t = window.setTimeout(() => {
      pairing.value = null;
      send({ type: "pairingStart" });
    }, Math.max(300, p.expiresAt - Date.now()));
    return () => clearTimeout(t);
  }, [p?.expiresAt, !!flash]);

  useEffect(() => {
    let live = true;
    setSvg(null);
    if (p)
      void QRCode.toString(p.url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#0a0c11", light: "#ffffff" } }).then((s) => live && setSvg(s));
    return () => void (live = false);
  }, [p?.url]);

  // a new entry in the device list while this is open means the phone paired
  useEffect(() => {
    const added = (devices.value ?? []).find((d) => !baseline.has(d.id));
    if (added && !justPaired.value) {
      justPaired.value = added.name;
      pairing.value = null;
    }
  }, [devices.value]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(closeOverlay, 2000);
    return () => clearTimeout(t);
  }, [flash]);

  const left = p ? p.expiresAt - now : 0;

  return (
    <Frame label="Pair a phone" wide>
      {flash ? (
        <div class="paired">
          <svg viewBox="0 0 48 48" class="paired-mark" aria-hidden="true">
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.4" />
            <path d="M14.5 25l6.5 6.5L33.5 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <h2 class="ov-title">Paired with {flash}</h2>
          <p class="ov-sub">This phone is now your remote.</p>
        </div>
      ) : (
        <div class="pair">
          <div class="qr" data-ready={svg ? "" : undefined}>
            {svg ? <div class="qr-svg" role="img" aria-label="QR code for pairing" dangerouslySetInnerHTML={{ __html: svg }} /> : <div class="qr-wait" />}
          </div>
          <div class="pair-copy">
            <h2 class="ov-title">Pair a phone</h2>
            <ol class="steps">
              <li>Point your phone's camera at the code.</li>
              <li>Open the link it shows.</li>
              <li>Your phone becomes the remote.</li>
            </ol>
            <p class="pair-url" data-state={p ? "ok" : "wait"}>
              {st !== "connected" ? "Waiting for the connection..." : p ? p.url.replace(/#pair=.*/, "#pair=...") : "Getting a code..."}
            </p>
            <p class="pair-time">{p ? `This code works for ${countdown(left)} and then refreshes.` : " "}</p>
            <button class="btn" type="button" data-f onClick={closeOverlay}>
              Close
            </button>
          </div>
        </div>
      )}
    </Frame>
  );
}

/* --------------------------------------------------------------- devices */

function DevicesOverlay() {
  const list = devices.value ?? [];
  const now = useTick(15_000);
  useOverlayKeys(closeOverlay, overlay.value?.kind === "devices");
  return (
    <Frame label="Phones">
      <header class="ov-head">
        <h2 class="ov-title">Phones</h2>
        <p class="ov-sub">{list.length === 0 ? "No phone is paired yet." : `${list.length} paired. Select one to remove it.`}</p>
      </header>
      <div class="dev-list">
        <button class="btn btn-primary dev-add" type="button" data-f onClick={() => (overlay.value = { kind: "pair" })}>
          Pair a new phone
        </button>
        {list.map((d) => (
          <DeviceRow key={d.id} d={d} now={now} />
        ))}
      </div>
      <footer class="ov-foot">
        <button class="btn" type="button" data-f onClick={closeOverlay}>
          Close
        </button>
      </footer>
    </Frame>
  );
}

function DeviceRow({ d, now }: { d: DeviceInfo; now: number }) {
  const active = now - d.lastSeen < 90_000;
  return (
    <button class="dev" type="button" data-f onClick={() => (overlay.value = { kind: "confirm", device: d })} onMouseEnter={(e) => (e.currentTarget as HTMLElement).focus({ preventScroll: true })}>
      <span class="dev-icon">
        <PhoneGlyph />
      </span>
      <span class="dev-main">
        <span class="dev-name">{d.name}</span>
        <span class="dev-meta">Paired {pairedOn(d.createdAt)}</span>
      </span>
      <span class="dev-seen" data-active={active ? "" : undefined}>
        <i class="dev-dot" />
        {active ? "Active now" : `Last seen ${relativeTime(d.lastSeen, now)}`}
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- confirm */

function ConfirmOverlay({ device }: { device: DeviceInfo }) {
  const back = () => (overlay.value = { kind: "devices" });
  useOverlayKeys(back);
  // hand focus back to the row that opened this dialog
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      const el = opener.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
      else topOverlay()?.querySelector<HTMLElement>("[data-f]")?.focus({ preventScroll: true });
    },
    [],
  );
  const remove = () => {
    if (send({ type: "deviceRevoke", deviceId: device.id })) pushToast(`Removed ${device.name}`);
    else pushToast("Not connected to TVDeck. Try again in a moment.", "warn");
    back();
  };
  return (
    <Frame label={`Remove ${device.name}?`}>
      <div class="confirm">
        <h2 class="ov-title">Remove {device.name}?</h2>
        <p class="ov-sub">It will be disconnected right away. To use it again, pair it with a new code.</p>
        <div class="btn-row">
          {/* Cancel comes first so it is the focused default */}
          <button class="btn" type="button" data-f onClick={back}>
            Cancel
          </button>
          <button class="btn btn-danger" type="button" data-f onClick={remove}>
            Remove
          </button>
        </div>
      </div>
    </Frame>
  );
}

export function Overlays() {
  const o = overlay.value;
  if (!o) return null;
  // the devices screen stays underneath the confirm dialog
  return (
    <>
      {o.kind === "devices" || o.kind === "confirm" ? <DevicesOverlay key="devices" /> : null}
      {o.kind === "pair" ? <PairOverlay key="pair" /> : null}
      {o.kind === "confirm" ? <ConfirmOverlay key={o.device.id} device={o.device} /> : null}
    </>
  );
}
