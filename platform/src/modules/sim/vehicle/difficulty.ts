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
import { AERO_DRAG, CHASSIS_LINEAR_DAMPING, CHASSIS_MASS, engineForceAt } from "./tuning";

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

/**
 * Speed band (km/h) over which the governor eases the throttle to zero.
 *
 * EXPORTED since 2026-08-11 because the HUD has to be able to say WHEN the
 * governor starts holding the car back, and „when" is exactly this band: one
 * `GOVERNOR_BAND_KMH` below the cap the throttle stops being the student's.
 * Restating the 6 in the HUD would have been a second copy of a number that
 * decides physics.
 */
export const GOVERNOR_BAND_KMH = 6;

// ---------------------------------------------------------------------------
// Domain-scaled governor (founder review R3 #37, doc 62 S6): the static caps
// below were researched for the URBAN 50 km/h domain — on the АМ-140 motorway
// map Нормален's 90 cap made the drill absurd (the copy demands „установи се
// около 120–130", the car died at ~87). The cap therefore RESPECTS THE
// LESSON'S SPEED DOMAIN: the max legal speed of the loaded map (max edge
// maxspeed, threaded by LessonScene → VehicleRig). The character of each tier
// is preserved, just expressed relative to the domain:
//  - Нормален: domain + 10 — mistakes stay committable (the 2026-07-19
//    founder ruling: SPEEDING_OVER_LIMIT needs limit×1.1, so a 50-domain cap
//    of 60 still lets the student sustain 55+ and FAIL), while a 50-street
//    joyride to 87 is gone (the governor now governs ~55–60 in the city);
//  - Начинаещ: domain − 10 — the training wheel stays UNDER the posted max
//    (identical 40 in the 50-city, byte-for-byte), but a motorway beginner
//    can now ride the flow (~130 cap) instead of crawling at 40;
//  - Напреднал: no cap, unchanged.
// When no domain is threaded (headless callers, tests, legacy mounts) the
// preset's researched static cap applies — byte-identical shipped behavior.
// ---------------------------------------------------------------------------
/** Нормален's governor margin ABOVE the lesson's max legal speed (km/h). */
export const NORMAL_CAP_MARGIN_KMH = 10;
/** Начинаещ's governor distance BELOW the lesson's max legal speed (km/h). */
export const BEGINNER_CAP_UNDER_KMH = 10;
/** Floor for any domain-scaled cap (km/h) — the полигон's 20–30 domain must
 *  still allow maneuvering pace (a 20 km/h beginner cap would fight the
 *  crawl bands this same layer exists to serve). Начинаещ's floor. */
export const DOMAIN_CAP_FLOOR_KMH = 30;
/**
 * НОРМАЛЕН'S OWN FLOOR (doc 86 L17, founder item 5: *„в Нормален режим мога да
 * карам само до 30 км/ч"*). Measured: the four `lot-*` districts publish a
 * 20 km/h domain, so `20 + NORMAL_CAP_MARGIN_KMH = 30` collapsed onto
 * DOMAIN_CAP_FLOOR_KMH and Нормален governed at **exactly the same 30 km/h as
 * Начинаещ** — the tier selector did nothing on those maps, and a 30 km/h
 * ceiling on a car reads as a broken engine, which is what he reported.
 * `poligon-v1`/`pk-drive-v1`/`sp-zone30-v1`/`vu-child-v1` (domain 30) sat one
 * notch up at 40.
 *
 * Нормален is the DEFAULT tier and the tier that must keep every mistake
 * committable, so its floor is the national in-town limit (ЗДвП чл. 21 — 50
 * км/ч): whatever micro-map is loaded, the default tier never governs a
 * student below the speed the law itself permits in a settlement. Above a
 * 40 km/h domain the formula already clears 50 on its own, so this touches
 * exactly the 8 districts whose domain is 20 or 30 and nothing else.
 */
export const NORMAL_CAP_FLOOR_KMH = 50;
/**
 * Headroom (km/h) a tier's cap must keep ABOVE a speed the lesson itself
 * REQUIRES (doc 86 B7). The governor starts easing the throttle one full
 * GOVERNOR_BAND_KMH below the cap, so a cap sitting exactly on the required
 * speed already has the throttle at zero there: the student can approach the
 * number and never hold it. One band of headroom is the minimum that leaves
 * undiminished throttle authority AT the required speed.
 */
export const REQUIRED_SPEED_HEADROOM_KMH = GOVERNOR_BAND_KMH;

/**
 * The effective governor cap (km/h) for a mode, or null (uncapped).
 *
 * `lessonMaxLegalKmh` = the lesson's speed domain (max legal speed anywhere
 * on the loaded map); absent/invalid = the preset's static researched cap.
 *
 * `lessonRequiredKmh` = a speed the LESSON ITSELF declares the student must
 * drive (doc 86 B7 — `sig-wave-v1`'s `meta.scenario.wave.speedKmh = 50`
 * against `governorCapKmh("beginner", 50) = 40`: at 40 km/h a wave block takes
 * 23.8 s against the 19.01 s the lamps are tuned to, the phase slipped ~4.8 s
 * per block, and the second and third greens were **unreachable on every
 * rung**). A tier may be slower than the road; it may never be slower than the
 * lesson. The floor is applied last and wins over the tier's own formula.
 */
export function governorCapKmh(
  mode: DifficultyMode,
  lessonMaxLegalKmh?: number,
  lessonRequiredKmh?: number,
): number | null {
  const preset = DIFFICULTY_PRESETS[mode];
  if (preset.speedCapKmh === null) return null; // advanced: never capped
  const domainKnown =
    lessonMaxLegalKmh !== undefined &&
    Number.isFinite(lessonMaxLegalKmh) &&
    lessonMaxLegalKmh > 0;
  let cap: number;
  if (!domainKnown) {
    cap = preset.speedCapKmh;
  } else {
    const domain = lessonMaxLegalKmh as number;
    cap =
      mode === "beginner"
        ? Math.max(domain - BEGINNER_CAP_UNDER_KMH, DOMAIN_CAP_FLOOR_KMH)
        : Math.max(domain + NORMAL_CAP_MARGIN_KMH, NORMAL_CAP_FLOOR_KMH);
  }
  if (
    lessonRequiredKmh !== undefined &&
    Number.isFinite(lessonRequiredKmh) &&
    lessonRequiredKmh > 0
  ) {
    cap = Math.max(cap, lessonRequiredKmh + REQUIRED_SPEED_HEADROOM_KMH);
  }
  return cap;
}

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

// ---------------------------------------------------------------------------
// MOTORWAY THROTTLE AUTHORITY (doc 86 L17, founder item 37: „Дисциплина на
// магистралата" — „no matter how fast I want to go … I can't go more than
// 100–105 km/h and the theory question already ends before I can accelerate").
//
// The ledger blamed the governor and prescribed „raise the motorway domain".
// THE LEDGER IS WRONG ABOUT THE CAUSE, measured: `mw-v1` already publishes a
// 140 km/h domain, so the governor cap on that map is Нормален 150 /
// Начинаещ 130 — neither binds. What binds is `throttleMul`, which scales the
// TRACTIVE FORCE and therefore silently acts as a SECOND, hidden top-speed
// governor: solving engineForceAt(v)·mul = AERO_DRAG·v² + ROLLING_RESISTANCE_N
// gave a terminal speed of
//     Начинаещ (0.50)  116.7 km/h   ← the lesson instructs 120–130. IMPOSSIBLE.
//     Нормален  (0.75)  124.9 km/h
//     Напреднал (1.00)  129.2 km/h
// so the tier the student is actually on could not reach the band its own
// instruction 2 demands, and no cap change could ever have fixed it.
//
// ⚠ THOSE THREE NUMBERS ARE HISTORY, NOT CURRENT FACT — kept because they are
// the evidence for the fix below, and relabelled because FR-50 later found the
// balance that produced them was wrong in BOTH terms (it carried a rolling
// resistance the full-pedal branch never applies and omitted
// CHASSIS_LINEAR_DAMPING, which is the larger half of the drag at motorway
// speed — see tierTopSpeedKmh). The conclusion survived the correction: the
// multiplier really was a second hidden governor. The digits did not. Today's
// measured numbers live in tier-feasibility.test.ts, checked against the rig.
//
// The preset comment has always said what the multiplier is FOR: „softer
// throttle, a speed governor" — two separate levers. `throttleMul` exists to
// calm the response OFF THE LINE; the governor is the top-speed authority.
// So the multiplier fades back to neutral across a high-speed band and the
// governor is left as the only ceiling.
//
// THE BAND IS CHOSEN TO CHANGE NOTHING ELSE. Census of all 90 districts: the
// domains are 20 (4), 30 (4), 40 (13), 50 (60), 70 (1), 90 (5), 140 (3). The
// highest non-motorway domain is 90, whose Нормален cap is 100 — and the
// governor has already ramped that throttle to zero by 100. So a fade that
// starts at 100 km/h is a mathematical no-op on 87 of 90 districts and on
// every urban, парking, полигон and rural lesson in the catalog; it moves only
// the three motorway maps, only above 100 km/h. Parking/creep/crawl (0–14 km/h)
// are untouched by construction.
//
// `throttleExp` is deliberately NOT faded: it only shapes a PARTIAL pedal, and
// a car being held at 110 km/h is at full pedal, where 1^exp = 1 regardless.
// ---------------------------------------------------------------------------
/** Below this speed (km/h) the preset's authored throttle multiplier applies
 *  in full — every urban lesson lives entirely under it. */
export const THROTTLE_AUTHORITY_FADE_FROM_KMH = 100;
/** …and at/above this speed the multiplier is 1: the tier's governor cap is
 *  the only remaining top-speed authority. */
export const THROTTLE_AUTHORITY_FADE_TO_KMH = 118;

/** 0 at/below `from`, 1 at/above `to`, linear between (|speed| ramps). */
function rampUp(absKmh: number, from: number, to: number): number {
  return clamp01((absKmh - from) / (to - from));
}

/** The preset's throttle multiplier at this speed — authored value below the
 *  fade band, 1 above it (see THROTTLE_AUTHORITY_FADE_*). */
function throttleAuthority(mul: number, absKmh: number): number {
  if (mul >= 1) return 1;
  const fade = rampUp(
    absKmh,
    THROTTLE_AUTHORITY_FADE_FROM_KMH,
    THROTTLE_AUTHORITY_FADE_TO_KMH,
  );
  return mul + (1 - mul) * fade;
}

/** The governor's throttle scale at this speed (1 = untouched, 0 = cut). */
function governorScale(capKmh: number | null, absKmh: number): number {
  if (capKmh === null) return 1;
  const over = absKmh - (capKmh - GOVERNOR_BAND_KMH);
  return over > 0 ? clamp01(1 - over / GOVERNOR_BAND_KMH) : 1;
}

/**
 * IS THE TIER HOLDING THIS CAR BACK RIGHT NOW? — the read channel for the HUD
 * (2026-08-11, the „silent refusal" sweep).
 *
 * The governor has always been able to take a student's throttle away and the
 * product has never said so: press harder, go no faster, and the only reading
 * available to a 17-year-old is „the car is broken". This answers the one
 * question the cluster could not — and it answers it from `governorScale`
 * itself rather than from a re-derived inequality, so a HUD claiming „the
 * governor is easing" and a physics step that is actually easing can never
 * disagree.
 *
 * `speedKmh` may be signed (reverse counts: the governor caps both ways).
 */
export function governorIsEasing(capKmh: number | null, speedKmh: number): boolean {
  return governorScale(capKmh, Math.abs(speedKmh)) < 1;
}

/**
 * Shape raw input for the given mode. Mutates and returns `state.out` (no
 * per-frame allocation). `speedKmh` is the current signed/abs speed; `dt` is
 * the fixed physics step. `lessonMaxLegalKmh` (optional, additive) scales the
 * governor to the lesson's speed domain — see governorCapKmh above; absent =
 * the preset's static cap, byte-identical legacy behavior.
 */
export function applyDifficulty(
  input: VehicleInput,
  mode: DifficultyMode,
  speedKmh: number,
  dt: number,
  state: DriveAssistState,
  lessonMaxLegalKmh?: number,
  lessonRequiredKmh?: number,
): VehicleInput {
  const p = DIFFICULTY_PRESETS[mode];
  const out = state.out;
  const absKmh = Math.abs(speedKmh);

  // Throttle: eased curve × multiplier. The multiplier fades to 1 above the
  // motorway band so it can never act as a second, hidden top-speed governor
  // (doc 86 L17 — see THROTTLE_AUTHORITY_FADE_*).
  let throttle =
    Math.pow(clamp01(input.throttle), p.throttleExp) *
    throttleAuthority(p.throttleMul, absKmh);

  // Speed governor: ramp throttle down as we approach the cap; 0 at/over it.
  // The cap follows the LESSON's speed domain when one is threaded (#37) and
  // is floored at any speed the lesson itself REQUIRES (doc 86 B7).
  const capKmh = governorCapKmh(mode, lessonMaxLegalKmh, lessonRequiredKmh);
  throttle *= governorScale(capKmh, absKmh);

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

// ---------------------------------------------------------------------------
// TIER FEASIBILITY (doc 86 B7 + L17 — the lane gate).
//
// „No lesson may declare a required speed its own tier forbids." Two things
// can forbid it and both must be measured, because for eight months only one
// of them was: the GOVERNOR CAP (an input-layer number) and the TRACTIVE
// FORCE the tier's throttle multiplier leaves on the table (a physics
// equilibrium). The founder's item 37 was the second one wearing the first
// one's clothes.
//
// The equilibrium below is the steady-state force balance of the same model
// VehicleSim integrates on flat ground at full pedal.
//
// IT USED TO BE WRONG IN BOTH TERMS, and it took a rig measurement to see it
// (FR-50). The old balance read
//     engineForceAt(v)·shapedThrottle(v) = AERO_DRAG·v² + ROLLING_RESISTANCE_N
// and it reported 178.5 km/h sustainable for a car the REAL rapier car tops
// out at 143.6. Two independent errors, pulling the same way:
//
//   · ROLLING_RESISTANCE_N IS NOT A DRIVE FORCE. VehicleSim applies it as a
//     per-wheel brake floor inside `if (engineTotal === 0)` — the closed-
//     throttle branch. At full pedal it is never applied at all, so a
//     full-pedal balance must not carry it.
//   · CHASSIS_LINEAR_DAMPING WAS NEVER MODELLED. It is a rapier body property
//     (0.02) worth CHASSIS_LINEAR_DAMPING · CHASSIS_MASS · v = 24.4·v N. Its
//     own tuning.ts comment calls it „near zero"; at 47 m/s it is 1152 N,
//     larger than aero, and it is the single biggest resistance the motorway
//     car fights. Omitting it is what made the model optimistic by 35 km/h.
//
// The corrected balance, VERIFIED AGAINST THE HEADLESS RIG at five speeds
// (rig N vs model N: 30 → 226/232 · 50 → 414/420 · 90 → 869/872 ·
// 130 → 1428/1429 · 143.6 → 1630/1641 — within 1% from 50 km/h up):
//     engineForceAt(v)·shapedThrottle(v) = AERO_DRAG·v² + LINEAR_DAMPING_N_PER_MS·v
//
// It still ignores gradient, grip and tyre slip, so it remains the OPTIMISTIC
// number and anything it calls unreachable is unreachable for certain. The
// difference is that its POSITIVE claims are now worth something too: before,
// „this tier can hold 170" was a sentence about a car that does not exist.
// ---------------------------------------------------------------------------

/** Search resolution (km/h) of the terminal-speed solver. */
const TOP_SPEED_STEP_KMH = 0.1;
/** Hard search ceiling (km/h) — above the tractive curve's own zero (195). */
const TOP_SPEED_SEARCH_MAX_KMH = 220;
/**
 * Chassis linear damping expressed as the force it costs per m/s (N·s/m).
 * Rapier integrates linear damping as a velocity-proportional resistance, so
 * on a body of CHASSIS_MASS it is exactly this many newtons at 1 m/s.
 */
const LINEAR_DAMPING_N_PER_MS = CHASSIS_LINEAR_DAMPING * CHASSIS_MASS;

/**
 * The highest speed (km/h) this tier can actually SUSTAIN on this lesson at
 * full pedal on the flat — the lower of the governor cap and the tractive
 * equilibrium. This is the number a lesson's declared required speed must
 * clear, not the cap alone.
 */
export function tierTopSpeedKmh(
  mode: DifficultyMode,
  lessonMaxLegalKmh?: number,
  lessonRequiredKmh?: number,
): number {
  const p = DIFFICULTY_PRESETS[mode];
  const cap = governorCapKmh(mode, lessonMaxLegalKmh, lessonRequiredKmh);
  const ceiling = cap === null ? TOP_SPEED_SEARCH_MAX_KMH : Math.min(cap, TOP_SPEED_SEARCH_MAX_KMH);
  let top = 0;
  for (let kmh = TOP_SPEED_STEP_KMH; kmh <= ceiling; kmh += TOP_SPEED_STEP_KMH) {
    const thrust =
      engineForceAt(kmh) * throttleAuthority(p.throttleMul, kmh) * governorScale(cap, kmh);
    const ms = kmh / 3.6;
    const resistance = AERO_DRAG * ms * ms + LINEAR_DAMPING_N_PER_MS * ms;
    if (thrust <= resistance) break;
    top = kmh;
  }
  return Math.round(top * 10) / 10;
}

/** Verdict for one (tier × lesson × declared required speed) triple. */
export interface TierFeasibility {
  mode: DifficultyMode;
  /** The lesson's declared required speed (km/h). */
  requiredKmh: number;
  /** Governor cap in force for this tier on this lesson (null = uncapped). */
  capKmh: number | null;
  /** Highest sustainable speed — min(cap, tractive equilibrium). */
  topSpeedKmh: number;
  /** True when the tier can hold the declared speed. */
  feasible: boolean;
  /** Which authority is short when it is not: the cap, or the engine. */
  blockedBy: "none" | "governor" | "traction";
}

/**
 * Can this tier drive a lesson that requires `requiredKmh`? `requiredKmh` is
 * passed to `governorCapKmh` as well, so the B7 floor is part of the answer:
 * the check is „after the floor has been applied, is the number reachable".
 */
export function tierFeasibility(
  mode: DifficultyMode,
  requiredKmh: number,
  lessonMaxLegalKmh?: number,
): TierFeasibility {
  const capKmh = governorCapKmh(mode, lessonMaxLegalKmh, requiredKmh);
  const topSpeedKmh = tierTopSpeedKmh(mode, lessonMaxLegalKmh, requiredKmh);
  const feasible = topSpeedKmh >= requiredKmh;
  return {
    mode,
    requiredKmh,
    capKmh,
    topSpeedKmh,
    feasible,
    blockedBy: feasible ? "none" : capKmh !== null && capKmh <= requiredKmh ? "governor" : "traction",
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
