/**
 * Reverse-travel read-out — the SECOND sentence of the rear channel: how many
 * metres the car has actually gone backwards in the manoeuvre it is in right
 * now („Заден ход · 12 м").
 *
 * WHY IT EXISTS (sc-ed-reverse-line:e05f2cee — „no rear proximity read-out on
 * screen at any point of the reverse manoeuvre", filed on
 * `.audit-frames/w10-4/frames/sc-ed-reverse-line__pc-right/05r-reverse-R.png`).
 * The proximity half of that row is not a defect and must not be "fixed": the
 * drill runs on poligon-v1 with NOTHING staged behind the car
 * (`heldSceneryFor("sc-ed-reverse-line@L1", poligon-v1)` is `[]`, the template
 * authors no traffic, and the district's two buildings are 40 m off the lane),
 * so `stepRearCue` reporting nothing is the honesty contract working — a
 * distance to nothing is the false-warning class doc 62 #39/#48 is about.
 *
 * What IS missing is the other quantity, and the lesson grades it: instruction
 * 6 is «Спри плавно след около 25 метра» and the third gate is a reachZone 25 m
 * back. Nothing on the glass counted them, so the student was asked to judge 25
 * metres backwards out of a cockpit turned over his shoulder, with no
 * instrument at all — the FollowGapCue situation exactly ("the number the
 * student is billed against was never shown to him"), pointing the other way.
 *
 * WHAT IT DOES NOT DO. It says nothing about what is behind the car. It is an
 * odometer for one manoeuvre, not a clearance, and it never outranks the
 * proximity warning: `RearProximityCue` renders this only when there is no real
 * body to report, so the two claims can never be on the glass at once and a
 * student can never read the odometer as air.
 *
 * Pure — no DOM, no React, node-testable. The caller owns the run (a ref) and
 * hands one poll at a time.
 */

import { REAR_CUE_REVERSING_KMH } from "./rearProximity";

/**
 * Above this SIGNED speed (km/h) the car is going FORWARD and the reverse
 * manoeuvre is over — the mirror of `REAR_CUE_REVERSING_KMH`, so the run
 * starts and ends in the same band the badge beside it and the cockpit's own
 * „R" readout already change their mind in (`VehicleSim.gear`), and the dither
 * of a car at rest belongs to neither edge.
 */
export const REVERSE_RUN_FORWARD_KMH = -REAR_CUE_REVERSING_KMH;

/**
 * A single poll may add at most this many metres, m. At the 5 Hz poll rate this
 * is 90 km/h of reversing — unreachable — so it costs a real drive nothing and
 * refuses the one thing that would print a lie: a respawn, a scene reload or a
 * teleport between two samples, which is a jump in the position feed and not a
 * metre the student drove.
 */
export const REVERSE_RUN_MAX_STEP_M = 5;

/**
 * The run is not shown below this, m. Under a metre the number is noise the
 * student cannot act on and the chip would flicker on every creep; the first
 * whole metre of the manoeuvre is where it appears.
 */
export const REVERSE_RUN_MIN_M = 1;

/** One reverse manoeuvre in progress. `meters` is PATH length, not displacement. */
export interface ReverseRun {
  /** Metres travelled backwards since this run began. */
  meters: number;
  /** Last sampled position, world metres — the anchor for the next delta. */
  lastX: number;
  lastY: number;
}

/**
 * Fold one poll of the shared vehicle sample into the run.
 *
 * Three bands, and the middle one is the one the lesson depends on:
 *  · FORWARD (> REVERSE_RUN_FORWARD_KMH) — the manoeuvre ended; drop the run.
 *  · REVERSING (< REAR_CUE_REVERSING_KMH) — integrate the path.
 *  · the standstill band between them — HOLD the count and re-anchor. «Ако
 *    усетиш, че губиш линията — спри и коригирай» is instruction 6 of the drill
 *    itself, so a stop mid-manoeuvre must not zero what the student has already
 *    reversed; re-anchoring means the dither of a stationary car is not counted
 *    as travel either.
 */
export function stepReverseRun(
  prev: ReverseRun | null,
  x: number,
  y: number,
  speedKmh: number,
): ReverseRun | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(speedKmh)) return prev;
  if (speedKmh > REVERSE_RUN_FORWARD_KMH) return null;
  if (speedKmh >= REAR_CUE_REVERSING_KMH) {
    return prev === null ? null : { meters: prev.meters, lastX: x, lastY: y };
  }
  if (prev === null) return { meters: 0, lastX: x, lastY: y };
  const step = Math.hypot(x - prev.lastX, y - prev.lastY);
  return {
    meters: prev.meters + (step > REVERSE_RUN_MAX_STEP_M ? 0 : step),
    lastX: x,
    lastY: y,
  };
}

/**
 * Whole display metres, or null while there is nothing worth showing. A
 * primitive on purpose: the caller can hand it straight to `setState` and
 * React's own bail-out gives the 5 Hz poll the same "re-render only on a real
 * edge" grammar `stepRearCue` gets from returning `prev`.
 */
export function reverseRunMeters(run: ReverseRun | null): number | null {
  if (run === null || run.meters < REVERSE_RUN_MIN_M) return null;
  return Math.round(run.meters);
}

/**
 * WHICH SENTENCE THE REAR CHANNEL SPEAKS THIS FRAME — one box, never two.
 *
 * A real body behind always outranks the odometer: metres a student has DRIVEN
 * and metres of AIR are different claims, and the one that can hurt him wins
 * the box. Pure and exported so the priority is pinned by a test rather than
 * living only inside a JSX chain (`RearProximityCue`).
 */
export function rearChannelBadge<T>(
  cue: T | null,
  travelMeters: number | null,
): { kind: "proximity"; cue: T } | { kind: "travel"; meters: number } | null {
  if (cue !== null) return { kind: "proximity", cue };
  if (travelMeters !== null) return { kind: "travel", meters: travelMeters };
  return null;
}

/** Badge copy (BG). Names the MANOEUVRE, never a gap — see the header. */
export function reverseRunLabelBg(meters: number): string {
  return `Заден ход · ${meters} м`;
}

/**
 * …and what a screen reader says, which is the same fact spelled out: the
 * metres are ones the student has already driven, not metres of space left.
 */
export function reverseRunAriaBg(meters: number): string {
  return `Изминал си ${meters} метра на заден ход`;
}
