import type { Tile as TileData } from "@tvdeck/protocol";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Tile } from "./components/Tile.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { navigate, scrollIntoRow, type Dir, type FocusRect, type RowMemory } from "./nav/spatial.ts";
import { Spring } from "./spring.ts";
import { beginOpening, config, configError, focusId, opening, pushToast, running, status, toasts } from "./store.ts";
import { accentOf } from "./tileInfo.ts";
import { send } from "./ws.ts";

/** Layout is authored for 1920x1080; everything scales from this unit. */
const unit = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
const ANCHOR = 300; // where the focused row's title sits, in units, regardless of which row it is
const MARGIN_L = 120;
const MARGIN_R = 230;

const KEY_DIR: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function Wash({ accent }: { accent: string }) {
  // Two stacked layers cross-fade (opacity only), so recolouring costs nothing per frame.
  const [layers, setLayers] = useState<{ a: string; b: string; front: "a" | "b" }>({ a: accent, b: accent, front: "a" });
  useEffect(() => {
    setLayers((l) => {
      const current = l.front === "a" ? l.a : l.b;
      if (current === accent) return l;
      return l.front === "a" ? { ...l, b: accent, front: "b" } : { ...l, a: accent, front: "a" };
    });
  }, [accent]);
  return (
    <div class="wash" aria-hidden="true">
      <div class="wash-layer" data-on={layers.front === "a" ? "" : undefined} style={{ "--wash": layers.a }} />
      <div class="wash-layer" data-on={layers.front === "b" ? "" : undefined} style={{ "--wash": layers.b }} />
    </div>
  );
}

function Banner() {
  const err = configError.value;
  if (!err) return null;
  return (
    <div class="banner" role="alert">
      <strong>tiles.json has a problem</strong>
      <span class="banner-sub">Showing your last working setup. Fix the file and it reloads by itself.</span>
      <code class="banner-detail">{err}</code>
    </div>
  );
}

function Empty() {
  return (
    <div class="empty">
      <h2>Nothing here yet</h2>
      <p>
        Add apps to <code>config/tiles.json</code> in the TVDeck folder. Changes appear here as soon as you save.
      </p>
    </div>
  );
}

function Blocked() {
  return (
    <div class="empty">
      <h2>This launcher can't connect</h2>
      <p>Its access key was not accepted. Close this window and restart TVDeck to open a fresh launcher.</p>
    </div>
  );
}

export function App() {
  const cfg = config.value;
  const rows = useMemo(() => (cfg ? cfg.rows.filter((r) => r.tiles.length > 0) : []), [cfg]);
  const pageRef = useRef<HTMLDivElement>(null);
  const memory = useRef<RowMemory>(new Map()).current;
  const springs = useRef({ page: null as Spring | null, rows: new Map<number, Spring>() }).current;
  const [intro, setIntro] = useState(true);

  const allTiles = useMemo(() => rows.flatMap((r, ri) => r.tiles.map((t, ti) => ({ t, ri, ti }))), [rows]);
  const focused = allTiles.find((x) => x.t.id === focusId.value) ?? null;

  // ---- geometry in stable layout space (offsets are unaffected by transforms) ----
  const readRects = (): FocusRect[] => {
    const out: FocusRect[] = [];
    pageRef.current?.querySelectorAll<HTMLElement>(".slot").forEach((slot) => {
      const row = slot.closest<HTMLElement>(".row");
      const btn = slot.querySelector<HTMLElement>("[data-tile]");
      if (!row || !btn) return;
      out.push({ id: btn.dataset.tile!, row: Number(slot.dataset.row), x: slot.offsetLeft, y: row.offsetTop, w: slot.offsetWidth, h: slot.offsetHeight });
    });
    return out;
  };

  const rowSpring = (row: number, track: HTMLElement): Spring => {
    let s = springs.rows.get(row);
    if (!s) {
      s = new Spring(0, (v) => (track.style.transform = `translate3d(${-v}px,0,0)`), 0.5);
      springs.rows.set(row, s);
    }
    return s;
  };

  const reveal = (immediate: boolean) => {
    const page = pageRef.current;
    const id = focusId.value;
    if (!page || !id) return;
    const btn = page.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`);
    const slot = btn?.closest<HTMLElement>(".slot");
    const row = slot?.closest<HTMLElement>(".row");
    const track = row?.querySelector<HTMLElement>(".track");
    if (!slot || !row || !track) return;
    const u = unit();

    springs.page ??= new Spring(0, (v) => (page.style.transform = `translate3d(0,${-v}px,0)`), 0.52);
    springs.page.set(Math.max(0, row.offsetTop - ANCHOR * u), immediate);

    const rs = rowSpring(Number(slot.dataset.row), track);
    const target = scrollIntoRow(rs.target, slot.offsetLeft, slot.offsetLeft + slot.offsetWidth, window.innerWidth, track.scrollWidth, MARGIN_L * u, MARGIN_R * u);
    rs.set(target, immediate);
  };

  const setFocus = (id: string) => {
    const hit = allTiles.find((x) => x.t.id === id);
    if (!hit) return;
    memory.set(hit.ri, id);
    focusId.value = id;
  };

  // keep focus valid when the config changes (hot reload)
  useLayoutEffect(() => {
    if (allTiles.length === 0) {
      focusId.value = null;
      return;
    }
    const cur = allTiles.find((x) => x.t.id === focusId.value);
    if (!cur) {
      const fallback = (focusId.value && [...memory.values()].find((m) => allTiles.some((x) => x.t.id === m))) || allTiles[0]!.t.id;
      setFocus(fallback);
    }
  }, [allTiles]);

  useLayoutEffect(() => reveal(false), [focusId.value, rows]);

  useEffect(() => {
    const onResize = () => reveal(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [rows]);

  // entrance plays once, when the first config lands
  useEffect(() => {
    if (!cfg || !intro) return;
    const t = window.setTimeout(() => setIntro(false), 1600);
    return () => clearTimeout(t);
  }, [!!cfg]);

  const open = (id: string) => {
    const hit = allTiles.find((x) => x.t.id === id);
    if (!hit) return;
    const btn = pageRef.current?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`);
    if (btn) {
      btn.dataset.pressed = "";
      setTimeout(() => delete btn.dataset.pressed, 220);
    }
    if (opening.value) return; // one launch at a time; the server also ignores a repeat press
    if (send({ type: "openApp", tileId: id })) beginOpening(id);
    else pushToast("Not connected to TVDeck. Reconnecting...", "warn");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        const next = navigate(readRects(), focusId.value, dir, memory);
        if (next) setFocus(next);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!e.repeat && focusId.value) open(focusId.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (toasts.value.length) toasts.value = [];
        else if (allTiles[0] && focusId.value !== allTiles[0].t.id) setFocus(allTiles[0].t.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const washAccent = focused ? accentOf(focused.t) : "#7f8cff";
  const s = status.value;
  let introStep = 0;

  return (
    <div class="app" data-intro={intro && cfg ? "" : undefined}>
      <div class="ambient" aria-hidden="true">
        <i class="aurora a1" />
        <i class="aurora a2" />
      </div>
      <Wash accent={washAccent} />
      <TopBar />
      <main class="viewport">
        <div class="page" ref={pageRef}>
          {rows.map((row, ri) => (
            <section class="row" key={`${ri}:${row.title}`} data-row={ri} data-active={focused?.ri === ri ? "" : undefined} aria-label={row.title}>
              <h2 class="row-title">{row.title}</h2>
              <div class="track">
                {row.tiles.map((t: TileData, ti) => (
                  <Tile
                    key={t.id}
                    tile={t}
                    row={ri}
                    index={ti}
                    focused={focusId.value === t.id}
                    running={running.value.includes(t.id)}
                    opening={opening.value?.id === t.id}
                    rowActive={focused?.ri === ri}
                    intro={intro ? introStep++ : undefined}
                    onHover={() => focusId.value !== t.id && setFocus(t.id)}
                    onOpen={() => {
                      setFocus(t.id);
                      open(t.id);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      {cfg && rows.length === 0 ? <Empty /> : null}
      {!cfg && s === "unauthorized" ? <Blocked /> : null}
      <Banner />
      <Toasts />
    </div>
  );
}
