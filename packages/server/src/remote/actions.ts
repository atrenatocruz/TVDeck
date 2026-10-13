import type { RemoteAction, RemoteConfig } from "@tvdeck/protocol";
import type { KeyName } from "../win32/keymap.ts";
import type { ButtonName } from "./parseReport.ts";

export type ConfigurableButton = "netflix" | "prime" | "apps" | "assistant";
export type ResolvedButtons = Record<ConfigurableButton, RemoteAction>;

export const DEFAULT_BUTTONS: ResolvedButtons = {
  netflix: { open: "netflix" },
  prime: { open: "prime" },
  apps: "home",
  assistant: "none",
};

export function resolveButtons(cfg?: RemoteConfig): ResolvedButtons {
  return { ...DEFAULT_BUTTONS, ...(cfg?.buttons ?? {}) } as ResolvedButtons;
}

export const HID_DEFAULTS = { vendorId: 0x2717, productId: 0x32b9 } as const;

export const resolveHid = (cfg?: RemoteConfig) => ({
  vendorId: cfg?.hid?.vendorId ?? HID_DEFAULTS.vendorId,
  productId: cfg?.hid?.productId ?? HID_DEFAULTS.productId,
});

export const REPEAT = { delayMs: 400, intervalMs: 90, maxHoldMs: 15_000 } as const;

const ARROW: Partial<Record<ButtonName, KeyName>> = { up: "up", down: "down", left: "left", right: "right" };

export interface ButtonDeps {
  tap(key: KeyName): void;
  home(): void;
  back(): void;
  open(tileId: string): Promise<void>;
  hasTile(tileId: string): boolean;
  buttons(): ResolvedButtons;
  /** Input guard: false drops the action. */
  allow(): boolean;
  warn(msg: string): void;
  info(msg: string): void;
}

/**
 * Turns remote button edges into the same actions the phone remote performs.
 * Arrows tap once on press, then repeat after a delay until release. Nothing is ever held down
 * (only tapped), so stopping the timers is all that "release" has to do.
 */
export class RemoteButtons {
  private delay: NodeJS.Timeout | undefined;
  private repeat: NodeJS.Timeout | undefined;
  private stopAt: NodeJS.Timeout | undefined;
  private repeating: ButtonName | null = null;

  constructor(private readonly d: ButtonDeps) {}

  press(name: ButtonName): void {
    const arrow = ARROW[name];
    if (arrow) {
      this.stopRepeat();
      this.repeating = name;
      this.fire(() => this.d.tap(arrow));
      this.delay = setTimeout(() => {
        this.repeat = setInterval(() => this.fire(() => this.d.tap(arrow)), REPEAT.intervalMs);
      }, REPEAT.delayMs);
      // Safety net against a lost release report.
      this.stopAt = setTimeout(() => this.stopRepeat(), REPEAT.maxHoldMs);
      return;
    }
    if (name === "ok") return this.fire(() => this.d.tap("enter"));
    this.runAction(name, this.d.buttons()[name as ConfigurableButton]);
  }

  release(name: ButtonName): void {
    if (this.repeating === name) this.stopRepeat();
  }

  releaseAll(): void {
    this.stopRepeat();
  }

  private stopRepeat(): void {
    clearTimeout(this.delay);
    clearInterval(this.repeat);
    clearTimeout(this.stopAt);
    this.delay = this.repeat = this.stopAt = undefined;
    this.repeating = null;
  }

  private fire(fn: () => void): void {
    if (this.d.allow()) fn();
  }

  private runAction(name: ButtonName, action: RemoteAction | undefined): void {
    if (!action || action === "none") return;
    if (!this.d.allow()) return;
    if (action === "home") return this.d.home();
    if (action === "back") return this.d.back();
    const id = action.open;
    if (!this.d.hasTile(id)) {
      this.d.warn(`${name} button is mapped to tile "${id}", which does not exist in tiles.json`);
      return;
    }
    this.d.info(`${name} -> open ${id}`);
    this.d.open(id).catch((e: unknown) => this.d.warn(`open "${id}" failed: ${e instanceof Error ? e.message : String(e)}`));
  }
}
