/**
 * Rear-proximity cue — pure logic for the „Кола отзад · X м" HUD badge
 * (PROX; doc 62 S5 — a graded action must have an information payoff, and
 * this badge is the universal rear-awareness fallback every camera mode and
 * quality preset gets for free).
 *
 * HONESTY CONTRACT (doc 62 #39/#48 — false warnings burned the founder's
 * trust): the cue exists ONLY while traffic.rearGapMeters() reports a REAL
 * vehicle in the corridor behind (a finite gap). Infinity — the no-vehicle
 * report — maps to null in EVERY state, including mid-display: the badge can
 * never linger and never guess.
 *
 * Severity ramp (spec): neutral above 8 m, amber under 8 m, red under 4 m —
 * and the red band additionally asks whether red is RELEVANT. 1 m of exit
 * hysteresis at the outer edge keeps the 5 Hz poll from flickering the badge
 * at the boundary.
 *
 * Perf grammar: stepRearCue returns the PREVIOUS snapshot identity whenever
 * nothing visible changed, so the component's setState bails out — the badge
 * re-renders only on real level/meter edges, never at the poll rate.
 *
 * ── O61: RED COULD NOT REACH A PARKING MANOEUVRE — CLOSED 2026-08-20 ────────
 *
 * WHAT THIS FILE USED TO DO, and the sentence that justified it was right
 * about the wrong case. The red band read
 * `gapM < REAR_CUE_DANGER_M && Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH`,
 * defended as „a car parked on your bumper at a light is normal city life —
 * red is reserved for tailgating at speed". That is true of a QUEUE and false
 * of the one manoeuvre this cue exists for: reversing into a bay runs at 2–4
 * km/h BY DEFINITION, so the situation with the least air behind the car was
 * the one situation structurally forbidden from raising its voice, and
 * `Math.abs` was what threw away the branch that says which way you are
 * closing.
 *
 * MEASURED, on the shipped `sc-park-narrow/shadow-correct` trace replayed
 * through the shipped `rearGapMeters`: the badge is raised on 66 of 805
 * samples, bottoms at 0.116 m of body-to-body air at −3.828 km/h, and the
 * level over the whole drive is 739 × none + 66 × warn — **danger: 0 frames**.
 * Twelve centimetres from a parked car showed the student the same colour as
 * „something is back there somewhere".
 *
 * THE FIX IS A SPLIT, NOT A DELETION, and the split is the point. RED is a
 * question about DISTANCE (`REAR_CUE_DANGER_M`, unchanged at 4 m); the speed
 * gate is a question about RELEVANCE — is this gap CLOSING, or am I simply
 * stood next to something? One number was answering both, which is the same
 * defect shape as the repeat-vs-teach and physics-box/grading-box findings
 * earlier in this audit. `rearCueClosing` below now answers only the second
 * question, and it answers it in two ways rather than one: reversing at all,
 * or moving at traffic speed either way. The gate's original job survives
 * intact — a car stationary at a light with a wall behind it is neither.
 *
 * MEASURED AFTER, over all 51 committed parking drives (36,367 samples,
 * 17 lot districts) replayed through the shipped source:
 *   · red frames 82 → 2,399, and every one of the 2,317 new ones is a frame in
 *     which the student is REVERSING toward something inside 4 m;
 *   · red while neither reversing nor at traffic speed: 0 — the stationary
 *     case the old gate protected is untouched, by measurement and not by
 *     assertion;
 *   · slow reversing (−5 < v < −0.8 km/h) with 4 m or more of air behind:
 *     555 samples, of which red = 0. That is the false-refusal direction, and
 *     it is the one the old gate was accidentally right about;
 *   · driving the lane past the 37 legally parked cars of vu-door-v1 and
 *     pk-double-v1 raises no badge at all, so it cannot raise a red one.
 * All four are pinned by mutation in `traffic/__tests__/rear-static-gap.test.ts`.
 */

/** A vehicle behind within this many bumper meters raises the badge. */
export const REAR_CUE_RANGE_M = 15;
/** A raised badge drops only past this (1 m exit hysteresis, no flicker). */
export const REAR_CUE_EXIT_M = 16;
/** Amber under this gap, m. */
export const REAR_CUE_WARN_M = 8;
/** Red under this gap, m — when the gap is also CLOSING (rearCueClosing). */
export const REAR_CUE_DANGER_M = 4;
/** At/above this |speed| the player counts as moving for the red band, km/h. */
export const REAR_CUE_MOVING_KMH = 5;
/**
 * Below this SIGNED speed the car is REVERSING, km/h — negative by
 * construction, and the sign is the whole content of the constant.
 *
 * NOT A CHOSEN NUMBER. −0.8 is the threshold the cockpit's own gear readout
 * already uses to display „R" (`vehicle/VehicleSim.ts`, `get gear()`:
 * `if (v < -0.8) return "R"`), so the badge changes its mind at exactly the
 * moment the dashboard beside it says the car is in reverse — one fact, one
 * threshold, and a student is never shown „R" and an amber badge for the same
 * instant. It also has to be a band rather than `< 0`: `speedKmh` is a live
 * rapier-derived velocity, so a car at rest dithers either side of zero and
 * `speedKmh < 0` would paint red at a light with a wall behind — the exact
 * case the moving gate exists to prevent. Corpus check: across the 36,367
 * recorded parking samples the smallest non-zero |speed| is 0.132 km/h and
 * only 39 samples fall in (−0.8, 0), none of them with a body inside 4 m.
 */
export const REAR_CUE_REVERSING_KMH = -0.8;

export type RearCueLevel = "info" | "warn" | "danger";

/**
 * Is the gap behind the player CLOSING — i.e. is red relevant at all?
 *
 * The RELEVANCE half of the severity decision (see O61 in the header); the
 * DISTANCE half is `REAR_CUE_DANGER_M` and the two are deliberately no longer
 * one number. Two ways to be closing on something behind you, and the cue
 * needs both:
 *
 *   · REVERSING, at any speed. A parking manoeuvre runs at 2–4 km/h, so a
 *     magnitude threshold can only ever exclude it.
 *   · MOVING at traffic speed, either direction. This is the original gate,
 *     kept verbatim: it is what makes a tailgater at 50 km/h red, and it is
 *     `Math.abs` on purpose here because at that magnitude the reason is
 *     „we are both in traffic" rather than „I am approaching it".
 *
 * Neither is true of a car standing still with a wall behind it, which is the
 * case the original gate was written for and which this must not break.
 */
export function rearCueClosing(speedKmh: number): boolean {
  return speedKmh < REAR_CUE_REVERSING_KMH || Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH;
}

export interface RearCue {
  level: RearCueLevel;
  /** Whole display meters (rounded, never negative). */
  meters: number;
}

/**
 * Fold one 5 Hz poll into the cue state. `gapM` is the traffic system's
 * rearGapMeters read (Infinity = no vehicle behind — REAL geometry only).
 * Returns null (no badge), the unchanged `prev` identity, or a new snapshot.
 */
export function stepRearCue(
  prev: RearCue | null,
  gapM: number,
  speedKmh: number,
): RearCue | null {
  // The honesty contract: no vehicle reported ⇒ no badge, from ANY state.
  if (!Number.isFinite(gapM)) return null;
  const limit = prev !== null ? REAR_CUE_EXIT_M : REAR_CUE_RANGE_M;
  if (gapM > limit) return null;
  const level: RearCueLevel =
    gapM < REAR_CUE_DANGER_M && rearCueClosing(speedKmh)
      ? "danger"
      : gapM < REAR_CUE_WARN_M
        ? "warn"
        : "info";
  const meters = Math.max(0, Math.round(gapM));
  if (prev !== null && prev.level === level && prev.meters === meters) return prev;
  return { level, meters };
}

/** Badge copy (BG). */
export function rearCueLabelBg(cue: RearCue): string {
  return `Кола отзад · ${cue.meters} м`;
}
