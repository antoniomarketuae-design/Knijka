/**
 * Driving-school difficulty engine (Phase 0 of the realism upgrade, doc 63 §1.4).
 *
 * Applied at the INPUT layer — between SimInput.read() and VehicleSim.update() —
 * so the tuned physics constants (and the CI harness that guards them) are never
 * touched. It shapes the driver's raw input into a beginner-friendly response:
 * softer throttle, a speed governor, and smoothed steering.
 *
 * Parameters follow the sim-racing / driving-school research: throttle multiplier
 * + eased curve, a top-speed cap, and steering sensitivity + low-pass smoothing.
 */

import type { VehicleInput } from "./VehicleSim";

export type DifficultyMode = "beginner" | "normal" | "advanced";

export interface DifficultyPreset {
  labelBg: string;
  /** Hard top-speed governor (km/h); null = no cap. */
  speedCapKmh: number | null;
  /** Scales peak accelerator (0.5 = half the acceleration). */
  throttleMul: number;
  /** Throttle response curve exponent (>1 = gentler off the line). */
  throttleExp: number;
  /** Steering input scale (lower = calmer). */
  steerSens: number;
  /** Steering low-pass time constant (s); higher = smoother/slower. */
  steerTau: number;
}

/** Ordered beginner → advanced. Values from docs/simulation/63 research. */
export const DIFFICULTY_PRESETS: Record<DifficultyMode, DifficultyPreset> = {
  beginner: {
    labelBg: "Начинаещ",
    speedCapKmh: 40,
    throttleMul: 0.5,
    throttleExp: 2,
    steerSens: 0.6,
    steerTau: 0.25,
  },
  normal: {
    labelBg: "Нормален",
    speedCapKmh: 90,
    throttleMul: 0.75,
    throttleExp: 1.4,
    steerSens: 0.8,
    steerTau: 0.15,
  },
  advanced: {
    labelBg: "Напреднал",
    speedCapKmh: null,
    throttleMul: 1,
    throttleExp: 1,
    steerSens: 1,
    steerTau: 0.06,
  },
};

export const DIFFICULTY_ORDER: DifficultyMode[] = [
  "beginner",
  "normal",
  "advanced",
];

/** The safe default for a driving-education product: gentle and forgiving. */
export const DEFAULT_DIFFICULTY: DifficultyMode = "beginner";

/** Per-session mutable smoothing state (steering low-pass). */
export interface DriveAssistState {
  steerSmoothed: number;
  out: VehicleInput;
}

export function createDriveAssistState(): DriveAssistState {
  return {
    steerSmoothed: 0,
    out: { throttle: 0, brake: 0, steer: 0, handbrake: false },
  };
}

/** Speed band (km/h) over which the governor eases the throttle to zero. */
const GOVERNOR_BAND_KMH = 6;

/**
 * Shape raw input for the given mode. Mutates and returns `state.out` (no
 * per-frame allocation). `speedKmh` is the current signed/abs speed; `dt` is
 * the fixed physics step.
 */
export function applyDifficulty(
  input: VehicleInput,
  mode: DifficultyMode,
  speedKmh: number,
  dt: number,
  state: DriveAssistState,
): VehicleInput {
  const p = DIFFICULTY_PRESETS[mode];
  const out = state.out;

  // Throttle: eased curve × multiplier.
  let throttle = Math.pow(clamp01(input.throttle), p.throttleExp) * p.throttleMul;

  // Speed governor: ramp throttle down as we approach the cap; 0 at/over it.
  if (p.speedCapKmh !== null) {
    const over = Math.abs(speedKmh) - (p.speedCapKmh - GOVERNOR_BAND_KMH);
    if (over > 0) {
      const scale = clamp01(1 - over / GOVERNOR_BAND_KMH);
      throttle *= scale;
    }
  }
  out.throttle = clamp01(throttle);

  // Steering: sensitivity scale + exponential low-pass (frame-rate independent).
  const target = clamp(input.steer * p.steerSens, -1, 1);
  const alpha = p.steerTau > 0 ? 1 - Math.exp(-dt / p.steerTau) : 1;
  state.steerSmoothed += (target - state.steerSmoothed) * alpha;
  out.steer = clamp(state.steerSmoothed, -1, 1);

  // Brake and handbrake pass through unchanged.
  out.brake = clamp01(input.brake);
  out.handbrake = input.handbrake;

  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
