// haptics.ts — Vibration API feedback (doc 82 §4.3 F5).
//
// THREE DISCRETE EVENTS ONLY, and the doc is unusually strict about why:
//
//   1. `navigator.vibrate` has NO amplitude control, so a continuous rumble
//      is impossible — anything sustained would be a buzzing motor, not a
//      road. Discrete taps or nothing.
//   2. It is UNSUPPORTED ON SAFARI iOS AT EVERY VERSION. ~76.7% of Bulgarian
//      mobile users are on Android, which means roughly a quarter of the
//      phone audience will never feel any of this. So the hard rule from
//      doc 82: **every haptic here must be redundant with a cue the student
//      already gets by eye or ear** — it can never carry information alone.
//      Each event below names its redundant partner.
//
// Pure device output: nothing in this file reads or writes sim state, and no
// rule-engine input passes through it. Node-testable — the constructor takes
// its clock and its vibrate sink so tests never touch `navigator`.

/** User setting key (mirrors the audio mute / reverse-view store idiom). */
export const HAPTICS_STORAGE_KEY = "knijka.sim.haptics";

/** Curb / kerb strike and any sub-threshold nudge: one short tap.
 *  REDUNDANT WITH: the collision thump SimAudio already plays on every
 *  contact, plus the visible jolt of the car. */
export const CURB_VIBRATION_MS = 20;

/** Threshold-braking onset: a single short tap as the pedal goes to the
 *  floor at speed — the "the brakes are at their limit" moment.
 *  REDUNDANT WITH: the brake friction hiss and the HUD brake state. */
export const BRAKE_ONSET_VIBRATION_MS = 14;
/** Pedal fraction that counts as threshold braking. */
export const BRAKE_ONSET_PEDAL = 0.85;
/** Below this speed (km/h) a full-pedal stop is a normal parking action, not
 *  a threshold stop — no tap. */
export const BRAKE_ONSET_MIN_KMH = 25;
/** The pedal must fall back below this before another onset can fire, so a
 *  held pedal taps ONCE (an edge, not a stutter). */
export const BRAKE_ONSET_RELEASE_PEDAL = 0.5;

/** Collision: a hit-then-tail pattern whose length scales with impact speed.
 *  REDUNDANT WITH: the collision thump, the impact itself, and the rule
 *  engine's terminating „опасна" verdict on the screen. */
export const COLLISION_MIN_MS = 30;
export const COLLISION_MAX_MS = 160;
/** Gap between the hit and its tail (ms). */
export const COLLISION_GAP_MS = 40;

/** Minimum spacing (ms) between any two vibrations — a multi-contact pile-up
 *  must not become a continuous buzz (the same job SimAudio.thump's 0.12 s
 *  rate limit does for the audio side). */
export const HAPTIC_MIN_GAP_MS = 120;

/**
 * Collision pattern (ms, alternating vibrate/pause) for an impact speed.
 * A hard hit is longer AND carries a heavier tail; a 10 km/h bump is a tap.
 * Integers only — the Vibration API truncates, and integer patterns keep the
 * unit test exact.
 */
export function collisionVibrationPattern(impactKmh: number): number[] {
  const v = Number.isFinite(impactKmh) ? Math.abs(impactKmh) : 0;
  const hit = Math.round(
    Math.min(COLLISION_MIN_MS + v * 2.6, COLLISION_MAX_MS),
  );
  return [hit, COLLISION_GAP_MS, Math.round(hit * 0.4)];
}

/** True when this browser can vibrate at all (feature detection, never UA). */
export function supportsVibration(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Read the persisted opt-out. Default ON — it is a redundant cue, so the
 *  worst case of it being on is a phone that buzzes twice a drive. */
export function loadHapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) !== "0";
  } catch {
    return true; // storage blocked (private mode) — session default
  }
}

export interface SimHapticsDeps {
  /** Monotonic-ish clock (ms). Injected so tests never need timers. */
  now?: () => number;
  /** Vibration sink. Injected so tests never need `navigator`. */
  vibrate?: (pattern: number | number[]) => void;
  /** Whether haptics are on at all. Injected for tests; defaults to the
   *  persisted setting AND the capability check. */
  enabled?: boolean;
}

/**
 * The three-event haptic channel. Owned by the vehicle rig (one instance per
 * session); every method is a no-op when the device cannot vibrate, when the
 * user opted out, or when the rate limit is still open.
 */
export class SimHaptics {
  private readonly now: () => number;
  private readonly sink: ((pattern: number | number[]) => void) | null;
  private enabled: boolean;
  private lastAtMs = -Infinity;
  /** Edge state for the threshold-braking onset (see BRAKE_ONSET_*). */
  private brakeArmed = true;

  constructor(deps: SimHapticsDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.sink =
      deps.vibrate ??
      (supportsVibration() ? (pattern) => void navigator.vibrate(pattern) : null);
    this.enabled = deps.enabled ?? (this.sink !== null && loadHapticsEnabled());
  }

  get active(): boolean {
    return this.enabled && this.sink !== null;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.sink?.(0); // cancel anything already running
  }

  /** Curb strike / sub-threshold nudge. Returns true when it actually fired
   *  (the tests assert the rate limit through this). */
  curb(): boolean {
    return this.fire(CURB_VIBRATION_MS);
  }

  /** Graded collision — pattern scaled by the impact speed the rig already
   *  computes for the audio thump and the rule engine. */
  collision(impactKmh: number): boolean {
    return this.fire(collisionVibrationPattern(impactKmh));
  }

  /**
   * Feed the brake pedal each frame; taps ONCE on the crossing into threshold
   * braking and re-arms only after the pedal is genuinely released. Returns
   * true on the frame it fired.
   */
  brakePedal(pedal: number, speedKmh: number): boolean {
    if (pedal <= BRAKE_ONSET_RELEASE_PEDAL) {
      this.brakeArmed = true;
      return false;
    }
    if (!this.brakeArmed) return false;
    if (pedal < BRAKE_ONSET_PEDAL || Math.abs(speedKmh) < BRAKE_ONSET_MIN_KMH) return false;
    this.brakeArmed = false;
    return this.fire(BRAKE_ONSET_VIBRATION_MS);
  }

  /** Stop everything (session teardown / pause). */
  cancel(): void {
    this.sink?.(0);
  }

  // ---------------------------------------------------------------------------

  private fire(pattern: number | number[]): boolean {
    const sink = this.sink;
    if (!this.enabled || sink === null) return false;
    const t = this.now();
    if (t - this.lastAtMs < HAPTIC_MIN_GAP_MS) return false;
    this.lastAtMs = t;
    sink(pattern);
    return true;
  }
}
