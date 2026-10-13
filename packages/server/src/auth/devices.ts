import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DeviceInfo } from "@tvdeck/protocol";

export interface DeviceRecord {
  id: string;
  name: string;
  /** sha256 hex of the device token. The token itself is never stored. */
  tokenHash: string;
  createdAt: number;
  lastSeen: number;
}

export const LAST_SEEN_THROTTLE_MS = 60_000;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export function readDevicesFile(file: string): DeviceRecord[] {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (d): d is DeviceRecord =>
        !!d &&
        typeof d === "object" &&
        typeof d.id === "string" &&
        typeof d.name === "string" &&
        typeof d.tokenHash === "string" &&
        typeof d.createdAt === "number" &&
        typeof d.lastSeen === "number",
    );
  } catch {
    return [];
  }
}

/** Atomic write: temp file in the same folder, then rename over the target. */
export function writeDevicesFile(file: string, list: readonly DeviceRecord[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function info(d: DeviceRecord): DeviceInfo {
  return { id: d.id, name: d.name, createdAt: d.createdAt, lastSeen: d.lastSeen };
}

export class Devices {
  private list: DeviceRecord[];
  private lastWrite = new Map<string, number>();

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    this.list = readDevicesFile(file);
  }

  /** Creates a device; the plain token is returned once and only its hash is kept. */
  create(name: string): { device: DeviceInfo; token: string } {
    const token = crypto.randomBytes(32).toString("base64url");
    const t = this.now();
    const rec: DeviceRecord = {
      id: crypto.randomBytes(6).toString("hex"),
      name: name.trim().slice(0, 40) || "Phone",
      tokenHash: hashToken(token),
      createdAt: t,
      lastSeen: t,
    };
    this.list.push(rec);
    this.lastWrite.set(rec.id, t);
    this.save();
    return { device: info(rec), token };
  }

  /** Returns the matching device (timing-safe hash compare over all devices), or null. */
  verify(token: string): DeviceInfo | null {
    const given = Buffer.from(hashToken(token), "hex");
    let hit: DeviceRecord | null = null;
    for (const d of this.list) {
      const a = Buffer.from(d.tokenHash, "hex");
      if (a.length === given.length && crypto.timingSafeEqual(a, given)) hit = d;
    }
    return hit ? info(hit) : null;
  }

  /** lastSeen is updated in memory always, written to disk at most once a minute per device. */
  touch(id: string): void {
    const d = this.list.find((x) => x.id === id);
    if (!d) return;
    const t = this.now();
    d.lastSeen = t;
    if (t - (this.lastWrite.get(id) ?? 0) >= LAST_SEEN_THROTTLE_MS) {
      this.lastWrite.set(id, t);
      this.save();
    }
  }

  revoke(id: string): boolean {
    const before = this.list.length;
    this.list = this.list.filter((d) => d.id !== id);
    if (this.list.length === before) return false;
    this.lastWrite.delete(id);
    this.save();
    return true;
  }

  listInfo(): DeviceInfo[] {
    return this.list.map(info);
  }

  /**
   * Re-reads devices.json (after an external edit). Keeps the in-memory lastSeen for devices
   * that still exist. Returns the ids that disappeared.
   */
  reload(): string[] {
    const disk = readDevicesFile(this.file);
    const keep = new Set(disk.map((d) => d.id));
    const removed = this.list.filter((d) => !keep.has(d.id)).map((d) => d.id);
    const mem = new Map(this.list.map((d) => [d.id, d]));
    this.list = disk.map((d) => {
      const m = mem.get(d.id);
      return m && m.lastSeen > d.lastSeen ? { ...d, lastSeen: m.lastSeen } : d;
    });
    return removed;
  }

  private save(): void {
    writeDevicesFile(this.file, this.list);
  }
}

/** Watches devices.json (debounced). `onRemoved` gets the ids that vanished; `onChange` fires after every reload. */
export function watchDevices(devices: Devices, onRemoved: (ids: string[]) => void, onChange: () => void): { close(): void } {
  let timer: NodeJS.Timeout | undefined;
  const dir = path.dirname(devices.file);
  const base = path.basename(devices.file);
  let watcher: fs.FSWatcher | null = null;
  let lastJson = JSON.stringify(devices.listInfo().map((d) => d.id));
  try {
    fs.mkdirSync(dir, { recursive: true });
    watcher = fs.watch(dir, (_ev, name) => {
      if (name && name !== base) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const removed = devices.reload();
        if (removed.length) onRemoved(removed);
        const now = JSON.stringify(devices.listInfo().map((d) => d.id));
        if (removed.length || now !== lastJson) onChange();
        lastJson = now;
      }, 150);
    });
  } catch {
    /* no watcher: external edits need a restart */
  }
  return {
    close() {
      clearTimeout(timer);
      watcher?.close();
    },
  };
}
