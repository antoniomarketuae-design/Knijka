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
 *
 * LOW-SPEED MANEUVERING PASS (S0, doc 76 §0/§12 — parking lives at 0–10 km/h):
 * below ~12 km/h the SAME layer switches from "calm the street" to "make the
 * car precise":
 *  - full steering lock unlocks in every mode (steerSens < 1 exists to stop
 *    90 km/h twitch; at parking speed it silently ballooned the turning
 *    circle from ~5.2 m to ~7 m — the student physically could not make the
 *    полигон bay). Sens fades back to the authored value by ~24 km/h.
 *  - steering answers fast (the beginner 0.25 s low-pass made the wheel feel
 *    mushy exactly where quick lock-to-lock is the skill being taught).
 *  - a creep throttle ceiling caps how hard a held key/pedal can shove the
 *    car at crawl, so keyboard bang-bang can hold 2–3 km/h (envelope-tested
 *    in parking-envelope.test.ts).
 *  - a crawl brake ceiling removes the binary-key full-stop snap at walking
 *    pace while leaving emergency braking above ~14 km/h untouched.
 * All of it is input shaping — the physics envelope (CI harness) is unchanged.
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
  /**
   * S0 creep control: ceiling on the SHAPED throttle while maneuvering at
   * crawl (full below CREEP_CAP_FULL_KMH, fades out by CREEP_CAP_END_KMH).
   * 1 = disabled. Keeps a held key from slamming 2 400 N into a parking
   * creep; taps then add ~0.8 km/h each instead of ~1.6 — the difference
   * between holding 3 km/h and sawing 2–5.
   */
  creepThrottleCap: number;
  /**
   * S0 crawl brake softening: ceiling on the brake while below
   * CRAWL_BRAKE_FULL_KMH (fades out by CRAWL_BRAKE_END_KMH). 1 = disabled.
   * A binary key at 4 km/h otherwise applies the full 11 000 N — a 0.9 g
   * head-snap stop from walking pace. Emergency stops from street speed are
   * untouched (the ceiling is gone above ~14 km/h, and by the time a hard
   * stop decays into the band the car is stopping anyway).
   */
  crawlBrakeCap: number;
}

/** Ordered beginner → advanced. Values from docs/simulation/63 research;
 *  creep/crawl ceilings from the S0 parking-envelope pass (advanced = the
 *  raw realism tier — no low-speed pedal shaping, exactly the pre-S0 feel). */
export const DIFFICULTY_PRESETS: Record<DifficultyMode, DifficultyPreset> = {
  beginner: {
    labelBg: "Начинаещ",
    speedCapKmh: 40,
    throttleMul: 0.5,
    throttleExp: 2,
    steerSens: 0.6,
    steerTau: 0.25,
    creepThrottleCap: 0.35,
    crawlBrakeCap: 0.5,
  },
  normal: {
    labelBg: "Нормален",
    speedCapKmh: 90,
    throttleMul: 0.75,
    throttleExp: 1.4,
    steerSens: 0.8,
    steerTau: 0.15,
    creepThrottleCap: 0.45,
    crawlBrakeCap: 0.6,
  },
  advanced: {
    labelBg: "Напреднал",
    speedCapKmh: null,
    throttleMul: 1,
    throttleExp: 1,
    steerSens: 1,
    steerTau: 0.06,
    creepThrottleCap: 1,
    crawlBrakeCap: 1,
  },
};

export const DIFFICULTY_ORDER: DifficultyMode[] = [
  "beginner",
  "normal",
  "advanced",
];

/**
 * Default for a fresh drive: NORMAL, not beginner (founder ruling 2026-07-19).
 * Beginner's 40 km/h governor (throttle dead from ~34, settles ~39) sits
 * BELOW the speeds the curriculum grades against (~42 km/h "не карай повече
 * от" questions; SPEEDING_OVER_LIMIT needs limit×1.1 — unreachable in 40+
 * zones). Defaulting to beginner meant the student physically could not make
 * the mistake the lesson exists to catch — an unfailable trap, not teaching.
 * Normal (90 cap) keeps mistakes possible; students who want assistance
 * switch to beginner explicitly (persisted via DIFFICULTY_STORAGE_KEY).
 */
export const DEFAULT_DIFFICULTY: DifficultyMode = "normal";

/**
 * localStorage key for the EXPLICITLY chosen difficulty. Contract: written
 * only on a user click of the selector — never eagerly with the default —
 * so an absent key always means "no explicit choice" and silently follows
 * whatever DEFAULT_DIFFICULTY says (this is what let the 2026-07-19 default
 * flip reach existing users who never touched the selector).
 */
export const DIFFICULTY_STORAGE_KEY = "sim.difficulty";

/** Parse a persisted difficulty value; null = unset/garbage → caller default. */
export function parseDifficultyMode(v: unknown): DifficultyMode | null {
  return v === "beginner" || v === "normal" || v === "advanced" ? v : null;
}

/** Stored explicit choice if any, else DEFAULT_DIFFICULTY (client only). */
export function loadDifficulty(): DifficultyMode {
  try {
    return (
      parseDifficultyMode(window.localStorage.getItem(DIFFICULTY_STORAGE_KEY)) ??
      DEFAULT_DIFFICULTY
    );
  } catch {
    return DEFAULT_DIFFICULTY; // private mode / SSR — session default applies
  }
}

/** Persist an explicit selector click (and ONLY that — see the key contract). */
export function storeDifficulty(mode: DifficultyMode): void {
  try {
    window.localStorage.setItem(DIFFICULTY_STORAGE_KEY, mode);
  } catch {
    // Private mode — the in-memory choice still applies this session.
  }
}

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

// ---------------------------------------------------------------------------
// S0 low-speed maneuvering bands (parking envelope, doc 76 §0). All ramps are
// linear in |speed| and fully faded out well below street speed, so nothing
// here can touch the 50/90 km/h behavior the presets were researched for.
// ---------------------------------------------------------------------------
/** Creep throttle ceiling fully applied at/below this speed (km/h). */
export const CREEP_CAP_FULL_KMH = 4;
/** …and fully faded out (ceiling = 1) at/above this speed (km/h). */
export const CREEP_CAP_END_KMH = 12;
/** Crawl brake ceiling fully applied at/below this speed (km/h). */
export const CRAWL_BRAKE_FULL_KMH = 6;
/** …and fully faded out at/above this speed (km/h). */
export const CRAWL_BRAKE_END_KMH = 14;
/**
 * Below this speed (km/h) the steering sensitivity is 1 in EVERY mode: the
 * physics grants full lock below tuning.STEER_FULL_SPEED_KMH (15), and
 * parking needs all of it — the correct ~5.2 m turning circle only exists at
 * input 1.0 (see the reverse-arc envelope test). The preset's authored
 * street-speed sens returns by FULL_LOCK_FADE_END_KMH.
 */
export const FULL_LOCK_BELOW_KMH = 12;
export const FULL_LOCK_FADE_END_KMH = 24;
/**
 * Steering low-pass floor at crawl (s): quick enough that a lock-to-lock
 * shuffle answers within ~0.3 s, still filtering keyboard chatter. Applied as
 * a MINIMUM with the preset value (advanced's 0.06 stays 0.06).
 */
export const PARKING_STEER_TAU_S = 0.08;

/** 0 at/below `from`, 1 at/above `to`, linear between (|speed| ramps). */
function rampUp(absKmh: number, from: number, to: number): number {
  return clamp01((absKmh - from) / (to - from));
}

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
  const absKmh = Math.abs(speedKmh);

  // Throttle: eased curve × multiplier.
  let throttle = Math.pow(clamp01(input.throttle), p.throttleExp) * p.throttleMul;

  // Speed governor: ramp throttle down as we approach the cap; 0 at/over it.
  if (p.speedCapKmh !== null) {
    const over = absKmh - (p.speedCapKmh - GOVERNOR_BAND_KMH);
    if (over > 0) {
      const scale = clamp01(1 - over / GOVERNOR_BAND_KMH);
      throttle *= scale;
    }
  }

  // S0 creep control: ceiling on the shaped throttle at crawl (both
  // directions — reverse parking creeps too). A ceiling, not a scale, so the
  // low pedal range keeps its authored resolution for analog devices.
  if (p.creepThrottleCap < 1) {
    const ceil =
      p.creepThrottleCap +
      (1 - p.creepThrottleCap) * rampUp(absKmh, CREEP_CAP_FULL_KMH, CREEP_CAP_END_KMH);
    if (throttle > ceil) throttle = ceil;
  }
  out.throttle = clamp01(throttle);

  // Steering: sensitivity scale + exponential low-pass (frame-rate
  // independent). At parking speed sens rises to 1 (full lock — see the
  // FULL_LOCK constants above) and the low-pass floors at PARKING_STEER_TAU_S
  // so the wheel answers as fast as the maneuver demands.
  const sensRamp = rampUp(absKmh, FULL_LOCK_BELOW_KMH, FULL_LOCK_FADE_END_KMH);
  const sens = 1 + (p.steerSens - 1) * sensRamp;
  const tau = Math.min(p.steerTau, PARKING_STEER_TAU_S + (p.steerTau - PARKING_STEER_TAU_S) * sensRamp);
  const target = clamp(input.steer * sens, -1, 1);
  const alpha = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  state.steerSmoothed += (target - state.steerSmoothed) * alpha;
  out.steer = clamp(state.steerSmoothed, -1, 1);

  // Brake: pass-through above the crawl band; ceiling inside it (S0 — no
  // binary-key full-stop snap at walking pace). Handbrake passes through.
  let brake = clamp01(input.brake);
  if (p.crawlBrakeCap < 1) {
    const ceil =
      p.crawlBrakeCap +
      (1 - p.crawlBrakeCap) * rampUp(absKmh, CRAWL_BRAKE_FULL_KMH, CRAWL_BRAKE_END_KMH);
    if (brake > ceil) brake = ceil;
  }
  out.brake = brake;
  out.handbrake = input.handbrake;

  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
