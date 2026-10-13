import type { Dir } from "./nav/spatial.ts";
import { reducedMotion } from "./spring.ts";

/** Tilt (-1..1 per axis) and sheen position (0..1) for a nudge toward a direction. */
export function nudgeTarget(dir: Dir): { tx: number; ty: number } {
  return { tx: dir === "left" ? -1 : dir === "right" ? 1 : 0, ty: dir === "up" ? -1 : dir === "down" ? 1 : 0 };
}

const MAX_DEG = 9;

/**
 * The tvOS focus effect for one icon: a spring-driven parallax tilt plus a specular sheen that glides
 * across the surface. Driven by CSS variables (--rx --ry --px --py --sx --sy --glow) so only transform and
 * opacity change per frame. All four values are springs that start from where they are, so any new
 * input (arrow press, pointer move, losing focus) redirects the motion without a jump.
 */
export class Tilt {
  private v = { rx: 0, ry: 0, sx: 0.5, sy: 0.4, glow: 0 };
  private vel = { rx: 0, ry: 0, sx: 0, sy: 0, glow: 0 };
  private to = { rx: 0, ry: 0, sx: 0.5, sy: 0.4, glow: 0 };
  private raf = 0;
  private last = 0;
  private release = 0;
  private hovering = false;

  constructor(private readonly el: HTMLElement) {}

  /** Focus arrived or an arrow was pressed on the icon: lean toward `dir`, then settle back. */
  nudge(dir: Dir, arrival = false): void {
    if (reducedMotion()) return;
    if (this.hovering) return; // the pointer owns the tilt
    const { tx, ty } = nudgeTarget(dir);
    this.to.ry = tx * MAX_DEG;
    this.to.rx = -ty * MAX_DEG;
    // the highlight slides against the lean, like light on a tilting pane
    this.to.sx = 0.5 - tx * 0.38;
    this.to.sy = 0.4 - ty * 0.34;
    this.to.glow = 1;
    if (arrival) {
      // arrive with the highlight on the leading edge and glide it through the surface
      this.v.sx = 0.5 + tx * 0.55 + (tx === 0 ? -0.5 : 0);
      this.v.sy = 0.4 + ty * 0.5;
    }
    this.kick();
    clearTimeout(this.release);
    this.release = window.setTimeout(() => this.rest(), arrival ? 170 : 150);
  }

  /** Pointer position within the icon, 0..1 on each axis. */
  pointer(px: number, py: number): void {
    if (reducedMotion()) return;
    this.hovering = true;
    clearTimeout(this.release);
    this.to.ry = (px - 0.5) * 2 * MAX_DEG;
    this.to.rx = -(py - 0.5) * 2 * MAX_DEG;
    this.to.sx = 1 - px;
    this.to.sy = 1 - py;
    this.to.glow = 1;
    this.kick();
  }

  leave(): void {
    this.hovering = false;
    this.rest();
  }

  /** Back to flat. `glow` stays up while the icon is focused (see setFocused). */
  rest(): void {
    this.to.rx = 0;
    this.to.ry = 0;
    this.to.sx = 0.5;
    this.to.sy = 0.4;
    this.kick();
  }

  setFocused(on: boolean): void {
    this.to.glow = on ? 1 : 0;
    if (!on) {
      this.hovering = false;
      clearTimeout(this.release);
      this.rest();
    }
    this.kick();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.release);
  }

  private kick(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    dt /= steps;
    // tilt: lively with a touch of overshoot; sheen: critically damped glide; glow: soft fade
    const cfg = { rx: [0.28, 0.62], ry: [0.28, 0.62], sx: [0.42, 0.95], sy: [0.42, 0.95], glow: [0.35, 1] } as const;
    let moving = false;
    for (const k of Object.keys(cfg) as (keyof typeof cfg)[]) {
      const [response, damping] = cfg[k];
      const w = (2 * Math.PI) / response;
      for (let i = 0; i < steps; i++) {
        const a = w * w * (this.to[k] - this.v[k]) - 2 * damping * w * this.vel[k];
        this.vel[k] += a * dt;
        this.v[k] += this.vel[k] * dt;
      }
      if (Math.abs(this.to[k] - this.v[k]) > 0.002 || Math.abs(this.vel[k]) > 0.01) moving = true;
      else {
        this.v[k] = this.to[k];
        this.vel[k] = 0;
      }
    }
    const s = this.el.style;
    s.setProperty("--rx", `${this.v.rx.toFixed(3)}deg`);
    s.setProperty("--ry", `${this.v.ry.toFixed(3)}deg`);
    s.setProperty("--px", (this.v.ry / MAX_DEG).toFixed(3));
    s.setProperty("--py", (-this.v.rx / MAX_DEG).toFixed(3));
    s.setProperty("--sx", this.v.sx.toFixed(3));
    s.setProperty("--sy", this.v.sy.toFixed(3));
    s.setProperty("--glow", this.v.glow.toFixed(3));
    this.raf = moving ? requestAnimationFrame(this.tick) : 0;
  };
}

/** Live tilt controllers by tile id, so the key handler can nudge the icon it just moved to. */
export const tilts = new Map<string, Tilt>();
