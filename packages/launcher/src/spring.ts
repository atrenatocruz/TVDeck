/**
 * Tiny critically-damped-ish spring driven by requestAnimationFrame. Used for row and
 * page scrolling: it always starts from the current value and keeps its velocity when
 * retargeted, so rapid key presses glide instead of restarting.
 */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private raf = 0;
  private last = 0;

  /** response ~ seconds to mostly settle; damping 1 = no overshoot. */
  constructor(
    initial: number,
    private readonly apply: (v: number) => void,
    private readonly response = 0.42,
    private readonly damping = 1,
  ) {
    this.value = initial;
    this.target = initial;
  }

  set(target: number, immediate = false): void {
    this.target = target;
    if (immediate || reducedMotion()) {
      this.stop();
      this.value = target;
      this.velocity = 0;
      this.apply(target);
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    const omega = (2 * Math.PI) / this.response;
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // sub-step for stability
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    dt /= steps;
    for (let i = 0; i < steps; i++) {
      const accel = omega * omega * (this.target - this.value) - 2 * this.damping * omega * this.velocity;
      this.velocity += accel * dt;
      this.value += this.velocity * dt;
    }
    if (Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.5) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.apply(this.value);
      return;
    }
    this.apply(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}
