import { log } from "../log.ts";
import { diffPressed, hex, parseReport, type ButtonName, type Pressed } from "./parseReport.ts";

export const USAGE_PAGE_CONSUMER = 0x0c;
export const USAGE_CONSUMER_CONTROL = 0x01;
export const RETRY_MS = 3000;

export interface HidInfo {
  path?: string;
  vendorId: number;
  productId: number;
  usagePage?: number;
  usage?: number;
}

export interface HidHandle {
  on(event: "data", cb: (data: Buffer) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  close(): void;
}

export interface HidBackend {
  devices(): HidInfo[];
  open(path: string): HidHandle;
}

/** Real backend (node-hid). Loaded lazily so a missing native module only disables the remote. */
export async function loadNodeHid(): Promise<HidBackend> {
  const mod = (await import("node-hid")) as unknown as { default?: typeof import("node-hid"); HID: new (path: string) => HidHandle; devices: () => HidInfo[] };
  const hid = (mod.default ?? mod) as { HID: new (path: string) => HidHandle; devices: () => HidInfo[] };
  return { devices: () => hid.devices(), open: (p) => new hid.HID(p) };
}

export function findRemote(devs: readonly HidInfo[], ids: { vendorId: number; productId: number }): HidInfo | undefined {
  return devs.find(
    (d) =>
      d.path &&
      d.vendorId === ids.vendorId &&
      d.productId === ids.productId &&
      d.usagePage === USAGE_PAGE_CONSUMER &&
      (d.usage === undefined || d.usage === USAGE_CONSUMER_CONTROL),
  );
}

export interface HidRemoteOptions {
  backend: HidBackend;
  ids(): { vendorId: number; productId: number };
  onDown(b: ButtonName): void;
  onUp(b: ButtonName): void;
  /** Called whenever the device goes away (or on stop) so callers can release held buttons. */
  onDisconnect(): void;
  /** Raw report tap (the probe script prints these). */
  onReport?(data: Buffer, down: ButtonName[], up: ButtonName[], newUnknown: string[]): void;
  retryMs?: number;
  /** Quiet = no connect/disconnect/waiting log lines (probe prints its own). */
  quiet?: boolean;
}

/** Reads the remote's Consumer Control reports and reconnects every few seconds when it sleeps or is missing. */
export function startHidRemote(o: HidRemoteOptions): { stop(): void; connected(): boolean } {
  const retryMs = o.retryMs ?? RETRY_MS;
  let handle: HidHandle | null = null;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let prev: Pressed | null = null;
  let announcedMissing = false;
  const seenUnknown = new Set<string>();

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(attempt, retryMs);
  };

  const drop = (reason: string) => {
    const h = handle;
    if (!h) return;
    handle = null;
    prev = null;
    try {
      h.close();
    } catch {
      /* already gone */
    }
    o.onDisconnect();
    if (!stopped && !o.quiet) log.info("remote", `Xiaomi remote disconnected (${reason}); looking for it again every ${retryMs / 1000}s`);
    schedule();
  };

  const onData = (data: Buffer) => {
    const next = parseReport(data);
    if (!next) return;
    const e = diffPressed(prev, next);
    prev = next;
    for (const u of e.newUnknown) {
      if (seenUnknown.has(u)) continue;
      seenUnknown.add(u);
      log.debug("remote", `unknown remote bit ${u} (report ${hex(data)})`);
    }
    o.onReport?.(data, e.down, e.up, e.newUnknown);
    for (const b of e.up) o.onUp(b);
    for (const b of e.down) o.onDown(b);
  };

  function attempt() {
    if (stopped || handle) return;
    let info: HidInfo | undefined;
    try {
      info = findRemote(o.backend.devices(), o.ids());
    } catch (e) {
      log.warn("remote", `cannot list HID devices: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!info?.path) {
      if (!announcedMissing && !o.quiet) {
        announcedMissing = true;
        log.info("remote", "Xiaomi remote not found (pair it in Windows first); looking for it every 3s");
      }
      return schedule();
    }
    try {
      const h = o.backend.open(info.path);
      handle = h;
      prev = null;
      announcedMissing = false;
      h.on("data", onData);
      h.on("error", (err) => drop(err.message));
      if (!o.quiet) log.info("remote", "Xiaomi remote connected");
    } catch (e) {
      handle = null;
      schedule();
      if (!announcedMissing && !o.quiet) {
        announcedMissing = true;
        log.warn("remote", `Xiaomi remote found but cannot be opened: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  attempt();
  return {
    connected: () => handle !== null,
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (handle) {
        const h = handle;
        handle = null;
        try {
          h.close();
        } catch {
          /* ignore */
        }
        o.onDisconnect();
      }
    },
  };
}
