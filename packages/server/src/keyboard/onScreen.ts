import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { Dir } from "@tvdeck/protocol";
import { log } from "../log.ts";
import { REPO_ROOT } from "../paths.ts";
import { tapKey, typeText } from "../win32/input.ts";
import { native } from "../win32/user32.ts";
import { describeWindow } from "../win32/windows.ts";

/**
 * The on-screen TV keyboard (app/TVDeckKeyboard.exe). The helper reports when a text field gets focus
 * (Windows UI Automation) and draws a keyboard that never takes focus; while it is open, the remote's
 * D-pad/OK/Back drive it instead of the app, and what it emits is typed into the field with SendInput.
 *
 * Mode "auto": it opens when a text field gets focus inside an app TVDeck opened, and closes when the
 * focus leaves. "manual": only the Assistant button (or another button mapped to "keyboard") opens it.
 */
export type KeyboardMode = "auto" | "manual" | "off";

export const KEYBOARD_EXE = path.join(REPO_ROOT, "app", "TVDeckKeyboard.exe");

interface Options {
  mode: () => KeyboardMode;
  /** Is this window one of the apps TVDeck opened (not the launcher, not other programs)? */
  isTvdeckApp: (hwnd: number) => boolean;
}

/** What the helper prints, one JSON object per line. */
export type HelperEvent =
  | { ev: "focus"; edit: boolean; password?: boolean; pid: number }
  | { ev: "text"; text: string }
  | { ev: "key"; key: "backspace" | "enter" }
  | { ev: "closed" }
  | { ev: "error"; message: string };

/** Pure policy: should a focus event open (or close) the keyboard? */
export function decideOnFocus(
  e: Extract<HelperEvent, { ev: "focus" }>,
  ctx: { mode: KeyboardMode; visible: boolean; foregroundPid: number | null; foregroundIsApp: boolean },
): "show" | "hide" | null {
  if (!e.edit) return ctx.visible ? "hide" : null;
  if (ctx.mode !== "auto" || ctx.visible) return null;
  return ctx.foregroundIsApp && ctx.foregroundPid === e.pid ? "show" : null;
}

class OnScreenKeyboard {
  private child: ChildProcessWithoutNullStreams | null = null;
  private shown = false;
  private lastField: { password: boolean } | null = null;
  private opts: Options | null = null;
  private stopping = false;

  start(opts: Options): void {
    this.opts = opts;
    if (process.platform !== "win32" || opts.mode() === "off") return;
    if (!fs.existsSync(KEYBOARD_EXE)) {
      log.warn("keyboard", `on-screen keyboard not built (${path.relative(REPO_ROOT, KEYBOARD_EXE)}); run: npm run app:build`);
      return;
    }
    this.spawn();
  }

  private spawn(): void {
    const child = spawn(KEYBOARD_EXE, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child = child;
    child.on("error", (e) => log.warn("keyboard", `helper failed to start: ${e.message}`));
    child.stdin.on("error", () => {}); // helper gone; handled by "exit"
    child.on("exit", (code) => {
      this.child = null;
      this.shown = false;
      if (this.stopping) return;
      log.warn("keyboard", `helper exited (${code}); restarting in 3 s`);
      setTimeout(() => !this.stopping && this.spawn(), 3000).unref();
    });
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let e: HelperEvent;
      try {
        e = JSON.parse(line) as HelperEvent;
      } catch {
        return;
      }
      this.onEvent(e);
    });
    log.info("keyboard", "on-screen keyboard ready");
  }

  private onEvent(e: HelperEvent): void {
    switch (e.ev) {
      case "focus": {
        if (e.edit) this.lastField = { password: !!e.password };
        const fg = native.available ? native.GetForegroundWindow() : 0;
        const decision = decideOnFocus(e, {
          mode: this.opts?.mode() ?? "off",
          visible: this.shown,
          foregroundPid: fg ? describeWindow(fg).pid : null,
          foregroundIsApp: fg ? (this.opts?.isTvdeckApp(fg) ?? false) : false,
        });
        if (decision === "show") this.show(!!e.password);
        else if (decision === "hide") this.hide();
        return;
      }
      case "text":
        typeText(e.text);
        return;
      case "key":
        tapKey(e.key);
        return;
      case "closed":
        this.shown = false;
        return;
      case "error":
        log.warn("keyboard", `helper: ${e.message}`);
    }
  }

  private send(cmd: string): void {
    this.child?.stdin.write(cmd + "\n");
  }

  visible(): boolean {
    return this.shown;
  }

  show(password = this.lastField?.password ?? false): void {
    if (!this.child) return;
    this.shown = true;
    this.send(password ? "show password" : "show");
    log.info("keyboard", `shown${password ? " (password)" : ""}`);
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.send("hide");
  }

  toggle(): void {
    if (this.shown) this.hide();
    else this.show();
  }

  nav(dir: Dir): void {
    this.send(`nav ${dir}`);
  }

  ok(): void {
    this.send("ok");
  }

  /** Back closes the keyboard (the helper replies "closed"). */
  back(): void {
    this.send("back");
    this.shown = false;
  }

  stop(): void {
    this.stopping = true;
    this.send("quit");
    this.child?.kill();
    this.child = null;
  }
}

/** One keyboard per server; inert until start() (so tests and dispatch can always call it). */
export const keyboard = new OnScreenKeyboard();
