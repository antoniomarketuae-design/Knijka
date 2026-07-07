// Shared mutable telemetry channel between the render loop (writes every
// frame, zero allocation) and the HUD (polls a few times per second).
// Deliberately NOT React state: 60+ writes/s must not cause 60 re-renders/s.

export interface SimTelemetry {
  /** Signed speed, km/h (+ forward). */
  speedKmh: number;
  /** Cosmetic gear display: R / N / 1..5. */
  gear: string;
  /** Smoothed frames per second. */
  fps: number;
}

export function createTelemetry(): SimTelemetry {
  return { speedKmh: 0, gear: "N", fps: 0 };
}

/** Exponential-moving-average FPS meter fed with frame deltas. */
export class FpsMeter {
  private ema = 0;

  sample(deltaSeconds: number): number {
    if (deltaSeconds <= 0) return this.ema;
    const fps = 1 / deltaSeconds;
    // Fast enough to react to real drops, slow enough not to flicker.
    this.ema = this.ema === 0 ? fps : this.ema + (fps - this.ema) * 0.08;
    return this.ema;
  }
}
