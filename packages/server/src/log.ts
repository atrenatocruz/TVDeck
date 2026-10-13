import fs from "node:fs";
import path from "node:path";

const ts = () => new Date().toTimeString().slice(0, 8);
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date(); // local time, like the console
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Append-only log file that rotates by size: tvdeck.log, tvdeck.log.1, tvdeck.log.2 ... */
export class RotatingLog {
  private size = 0;
  constructor(
    private readonly file: string,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly keep = 3,
  ) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.size = fs.statSync(file).size;
    } catch {
      this.size = 0;
    }
  }

  write(line: string): void {
    const data = line + "\n";
    try {
      if (this.size > 0 && this.size + Buffer.byteLength(data) > this.maxBytes) this.rotate();
      fs.appendFileSync(this.file, data);
      this.size += Buffer.byteLength(data);
    } catch {
      /* logging must never take the server down */
    }
  }

  private rotate(): void {
    const oldest = this.keep - 1; // files: base, base.1 ... base.(keep-1)
    try {
      fs.rmSync(`${this.file}.${oldest}`, { force: true });
      for (let i = oldest - 1; i >= 1; i--) if (fs.existsSync(`${this.file}.${i}`)) fs.renameSync(`${this.file}.${i}`, `${this.file}.${i + 1}`);
      if (oldest >= 1) fs.renameSync(this.file, `${this.file}.1`);
      else fs.rmSync(this.file, { force: true });
    } catch {
      /* best effort */
    }
    this.size = 0;
  }
}

let sink: RotatingLog | null = null;

/** Mirror every log line into <dir>/tvdeck.log from now on. */
export function enableFileLog(file: string): void {
  sink = new RotatingLog(file);
}

const emit = (level: string, scope: string, msg: string) => sink?.write(`${stamp()} ${level} [${scope}] ${msg}`);

const debugConsole = () => process.env.TVDECK_DEBUG === "1";

export const log = {
  /** Always goes to the log file; also to the console with TVDECK_DEBUG=1. */
  debug: (scope: string, msg: string) => (debugConsole() && console.log(`${ts()} [${scope}] DEBUG ${msg}`), emit("DEBUG", scope, msg)),
  info: (scope: string, msg: string) => (console.log(`${ts()} [${scope}] ${msg}`), emit("INFO ", scope, msg)),
  warn: (scope: string, msg: string) => (console.warn(`${ts()} [${scope}] WARN ${msg}`), emit("WARN ", scope, msg)),
  error: (scope: string, msg: string) => (console.error(`${ts()} [${scope}] ERROR ${msg}`), emit("ERROR", scope, msg)),
};
