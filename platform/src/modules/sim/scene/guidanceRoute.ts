/**
 * guidanceRoute — PURE route derivation for A7 "in-world route guidance"
 * (doc 68 Pillar 2; audit finding B9: attention belongs on traffic, not
 * wayfinding). No three.js here — RouteGuidance.tsx renders what this derives,
 * and the unit tests run in plain node.
 *
 * Per-lesson derivation model (specs stay DATA-only, nothing added to them):
 *  - reachZone / passSignal   → shortest legal on-road path to the target
 *                               point + a light-pillar marker there.
 *  - roundabout maneuver      → the road AHEAD through the ring, cut at the
 *                               next mouth (ribbon only; guidance is never
 *                               told which exit — see ROUNDABOUT RIBBONS).
 *  - parkInBay maneuver       → shortest path to lesson.parkingBay + marker.
 *  - driveDistance            → no target exists, so guide "ahead": follow the
 *                               road from the current pose, choosing the
 *                               straightest legal continuation at each node,
 *                               for `meters` + a small buffer.
 *  - emergencyStop            → "ahead" along the stimulus corridor (L5).
 *  - smoothStop               → null (stop where you are — nothing to find).
 *
 * Derivation runs ONLY on objective change; the per-frame helpers at the
 * bottom (nearestArcOnRoute / routePointAt) are allocation-free.
 *
 * GUIDANCE GEOMETRY (doc 86 T3 / T8 / L5, 2026-07-30). Three rules the founder
 * review made non-negotiable, all of them enforced by guidance-geometry.test.ts:
 *
 *  1. A marker never stands past a stop line the same lesson grades. A
 *     `passSignal` objective is authored as the junction NODE (10 of the 11 in
 *     the catalog are literally `x: 0, y: 0`) and the graded cut is the derived
 *     stop line 27.7 m out on the approach — so the old marker told a beginner
 *     to stop 27.7 m INSIDE the box. The marker is now resolved against the
 *     runtime's own `debugStopLines()` — the same lines the rule engine
 *     convicts on — so the class of defect is unauthorable rather than fixed
 *     nine times.
 *
 *     1b (register B18, 2026-07-30). „Спри преди линията, не след нея" is a
 *     rule about PAINT, not about grading. `debugStopLines()` deliberately
 *     skips roundabout mouths (runtime/stoplines.ts:248 — priority-inside,
 *     yield on entry), yet the world PAINTS an М8 give-way line at every one
 *     of them, and `sc-roundabout-entry`'s own waypoint stands 1.72 m past it
 *     on the lesson the founder played. So the guidance layer now knows both
 *     kinds of line: the GRADED set (`graded: true`, the only set a
 *     `passSignal` may resolve against — T3's contract is untouched) and the
 *     PAINTED set derived from the builder's own predicate, which a `reachZone`
 *     marker may not stand past. Where the lawful aim point still lies inside
 *     the objective's acceptance circle the marker is pulled back onto it and
 *     drawn as a gate; where it does not, the objective ITSELF is authored
 *     inside the junction and only its template can fix that — moving the
 *     marker there would trade „it points past the line" for „I stopped on it
 *     and nothing happened", which is the worse lie (doc 86 §7 R6).
 *  2. The marker states its own contract. It carries the objective's
 *     acceptance radius and its speed cap, and it says whether the student
 *     drives THROUGH it or STOPS on it. A ring drawn at a fixed 1.85 m over a
 *     radius-3.5 gate with a hidden ≤5 km/h cap is why „стоях точно на кръга и
 *     нищо не стана" was never a tolerance problem.
 *  3. Guidance looks AHEAD. The ribbon and its turn chevrons run through the
 *     active waypoint into objective n+1, so „надясно на следващото
 *     кръстовище" is announced before the junction — not after the nose has
 *     already committed and TURN_WITHOUT_INDICATOR has been billed.
 *
 *     3b (register B24/B6, 2026-07-30). ONE objective of look-ahead is not
 *     enough. `sc-junction-stop` is approach → stop line → exit-east: while
 *     the approach is active, objective n+1 is the stop line itself, which is
 *     straight ahead, so the ribbon showed no turn at all for the whole
 *     approach and the right turn appeared only when the nose crossed the Б2
 *     paint — the founder's item 9, verbatim. The look-ahead is therefore a
 *     CHAIN: legs are appended, objective by objective, until a turn appears
 *     beyond the active waypoint or the 170 m budget runs out.
 *
 *     3c (register B1, 2026-07-30). A `driveDistance` objective walks „ahead",
 *     and that walk used to append whole edges — 176 m of green ribbon for an
 *     80 m request on Урок 7, running past the parking bay and out to the end
 *     of the street, „and then it disappears and asks me to go back and park".
 *     The walk is now trimmed to the distance it was asked for, and trimmed
 *     again at the place the NEXT objective happens when that place is on the
 *     same corridor — so the ribbon ends where the task ends.
 *  4. A ribbon never runs PAST the thing it is drawing (audit rows
 *     sc-rb-lane-choice:ffdffd55 / sc-rb-circulate-priority:317c79f0,
 *     2026-08-31). A roundabout goal is the island CENTRE, 17.85–25.78 m off
 *     any carriageway, and the shortest path to its snap rode 98.4 m past the
 *     drill's own third exit to a point chosen by district-JSON edge order.
 *     The ring leg is now cut at the next mouth — and guidance says nothing
 *     about WHICH exit, because `RoundaboutParams` cannot tell it. The whole
 *     measurement, and the two drills that need opposite answers from the same
 *     geometry, are in ROUNDABOUT RIBBONS below `walkAheadRaw`.
 */

import { parseObjectiveParams, type LessonSpec } from "@/modules/sim/lessons";
import { LANE_WIDTH_M, createWorldRuntime } from "@/modules/sim/runtime";
import { DistrictIndex } from "@/modules/sim/runtime/spatial";
import {
  GIVE_WAY_TRIANGLE_LENGTH_M,
  GIVE_WAY_TRIANGLE_SETBACK_M,
  STOP_LINE_WIDTH_M,
  paintsZebra,
} from "@/modules/sim/world/builders/constants";
import {
  JUNCTION_TRIM_MAX_FRACTION,
  STOP_LINE_BEYOND_CUT_M,
  junctionPriorityControls,
  nodeOpenRadiusM,
} from "@/modules/sim/world/builders/network";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Geometry capacity of the preallocated ribbon (samples along the route). */
export const ROUTE_MAX_SAMPLES = 1024;

const DENSIFY_STEP_M = 2.5;
const MAX_ROUTE_LEN_M = (ROUTE_MAX_SAMPLES - 1) * DENSIFY_STEP_M;
const MIN_ROUTE_LEN_M = 6;
/** Junction heading change that counts as "a turn" (arrow-worthy). */
const TURN_MIN_RAD = (30 * Math.PI) / 180;
/** Corner sharpness above which the polyline gets a rounding arc. */
const CORNER_MIN_RAD = (18 * Math.PI) / 180;
const CORNER_CUT_MAX_M = 8;
/** Window over which junction in/out directions are measured (noise-proof). */
const TURN_DIR_WINDOW_M = 6;
/** driveDistance routes extend past the odometer mark so the ribbon never
 * ends exactly where the counter will complete. */
const AHEAD_BUFFER_M = 30;
/** emergencyStop is coordinate-free — guide down the corridor this far. */
const EMERGENCY_AHEAD_M = 150;
const MAX_WALK_EDGES = 64;
const EPS = 1e-6;
const DEG2RAD = Math.PI / 180;

/**
 * Setback of a STOP bar from the graded line: the exam phrasing is «спри на
 * 1–2 метра ПРЕДИ стоп-линията» (templates-junctions.ts:331), and
 * `stopOvershootCenterM` is 1.2 m, so a car whose centre rests on the bar has
 * its nose at the paint and its centre inside tolerance.
 */
export const STOP_BAR_BEFORE_LINE_M = 2;
/**
 * Setback of a THROUGH gate. It reads as standing ON the line while its centre
 * stays on the lawful side of it — the invariant guidance-geometry.test.ts
 * asserts for every marker in the catalog.
 */
export const THROUGH_GATE_BEFORE_LINE_M = 0.8;
/** Half-width of a stop-line gate bar: one lane of the perceptual carriageway. */
export const GATE_HALF_WIDTH_M = LANE_WIDTH_M / 2;
/**
 * A derived stop line is anchored on the edge's CENTRELINE. The bar belongs in
 * the lane the student is actually in, so it is slid sideways by the driver's
 * own measured offset — bounded here so a car parked off the carriageway (or
 * one still behind a bend) cannot fling the marker off the road.
 */
export const GATE_LATERAL_MAX_M = LANE_WIDTH_M * 0.75;
/**
 * A `reachZone` cap at or below this reads as „спри", not „намали" — the halt
 * objectives in the catalog author 5 or 6 km/h (doc 86 B5).
 */
export const HALT_CAP_KMH = 6;
/** Hard cap on the look-ahead legs appended for objectives n+1, n+2, … */
export const LOOKAHEAD_MAX_M = 170;
/**
 * How far the look-ahead chain may reach in OBJECTIVES. Three is the deepest
 * chain in the catalog that still describes one junction (approach → line →
 * exit); past that the leg is a different beat of the lesson and the ribbon's
 * 120 m ahead-fade has swallowed it anyway.
 */
export const LOOKAHEAD_MAX_LEGS = 3;

/**
 * Paint has width and the marker sits on a densified polyline: half a metre
 * past a line is still inside the painted band. Same number as
 * guidance-geometry.test.ts's PAST_TOLERANCE_M, and it means the same thing.
 */
const PAST_LINE_TOLERANCE_M = 0.5;
/**
 * A line only governs a marker that is NEAR it — beyond this the marker is a
 * different beat of the lesson (`sc-junction-stop`'s exit waypoint is 57 m
 * past the Б2 line and is supposed to be). 12 m = a junction mouth plus a car,
 * so a waypoint parked just inside the box is still caught when the objective's
 * own radius is small.
 */
const MARKER_GOVERNING_NEAR_M = 12;
/**
 * …and never further than this, however big the objective's radius is. Some
 * waypoints are 60 m proximity blobs (`l3-approach` is „be somewhere near the
 * roundabout"); at that range „which line governs this marker" stops being a
 * measurement and becomes a guess, and a marker moved 30 m onto the wrong arm
 * would be a far worse lie than the 1.7 m one this clamp exists to fix. 20 m
 * is a perceptually-scaled junction mouth (≈17 m) plus a car.
 */
const MARKER_GOVERNING_MAX_M = 20;
/**
 * How deep inside the acceptance circle the clamped aim point must land before
 * the clamp is allowed. Three quarters of the radius: a student who stops on
 * the bar is unambiguously inside the gate the engine tests, so moving the
 * marker can never produce „стоях точно на маркера и нищо не стана".
 */
export const MARKER_INSIDE_FRACTION = 0.75;
/** Direction agreement required between „driver → marker" and a line's own
 *  travel direction before that line is treated as being on this approach. */
const APPROACH_ALIGN_DOT = 0.5;

/**
 * An „ahead" walk may overrun the distance it was asked for by this much and
 * no more — two densify steps, so the ribbon never ends exactly on the
 * odometer mark, and never runs to the end of whatever edge it happens to be
 * on either (register B1: 176 m of ribbon for an 80 m request).
 */
export const AHEAD_OVERRUN_M = 5;
/** An „ahead" corridor is cut short at the next objective only when that
 *  objective is genuinely beside the corridor, not merely somewhere nearby. */
const AHEAD_NEXT_LATERAL_M = 30;
/** …and never cut shorter than this, whatever the next objective's distance. */
const AHEAD_TRIM_FLOOR_M = 25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structural view of the district pieces this module reads (the world and
 * runtime modules each own richer types; we depend on neither). */
export interface RouteEdgeLike {
  id: string;
  from: string;
  to: string;
  oneway: boolean;
  /** Polyline [x, y][] in district meters; endpoints = from/to nodes. */
  geometry: [number, number][];
}
export interface RouteDistrictLike {
  roads: { nodes: { id: string; x: number; y: number }[]; edges: RouteEdgeLike[] };
  /**
   * Pedestrian crossings, when the caller has them. Optional so nothing that
   * feeds guidance a roads-only shape has to change; `LessonScene` passes the
   * whole `District`, which always carries them. Used by
   * `crossingMuteSpans` — see its header for the frame that forced it.
   */
  crossings?: readonly RouteCrossingLike[];
}

/** The part of `DistrictCrossing` guidance reasons about. */
export interface RouteCrossingLike {
  x: number;
  y: number;
  kind: string;
}

/**
 * A stop line flattened into the plane guidance reasons in.
 *
 *  - `graded: true`  — from `worldRuntime.debugStopLines()`, the SAME lines
 *    `rules/engine.ts` convicts `STOP_LINE_OVERSHOOT` / `RED_LIGHT_CROSSED`
 *    on, never a second derivation. Only these may anchor a `passSignal`.
 *  - `graded: false` — PAINTED but not graded: the world builder draws a line
 *    here (`world/builders/markings.ts` stop/give-way pass) while the runtime
 *    deliberately grades nothing, the roundabout mouths being the whole class.
 *    A student cannot tell the difference from the driving seat, so guidance
 *    must not send him past one either.
 */
export interface GuidanceStopLine {
  id: string;
  /** Where the line crosses the carriageway, district meters. */
  x: number;
  y: number;
  /** Unit direction of TRAVEL across the line (approach → junction). */
  dirX: number;
  dirY: number;
  control: "trafficLight" | "stopSign" | "giveWay";
  junctionNodeId: string;
  edgeId: string;
  /** The rule engine convicts on this line (vs. paint-only — see above). */
  graded: boolean;
}

/** Does the student drive THROUGH this marker, or come to rest ON it? */
export type MarkerAffordance = "through" | "halt";

/**
 * The marker's footprint on the ground.
 *  - `zone`: the objective's acceptance CIRCLE. `radiusM` is the engine's own
 *    `radiusM`, so what the student sees is what the gate tests.
 *  - `gate`: a bar across the lane at a stop line. A `passSignal`'s `radiusM`
 *    is a 40–50 m PROXIMITY radius (how near the node a `stopLineCrossed`
 *    event still counts), not a target — drawing it as a ring would be a
 *    second lie on top of the one T3 fixed.
 */
export type MarkerShape =
  | { kind: "zone"; radiusM: number }
  | { kind: "gate"; halfWidthM: number; dirX: number; dirY: number };

/** What the active objective asks the guidance layer to show. */
export interface GuidancePointGoal {
  kind: "point";
  x: number;
  y: number;
  marker: boolean;
  affordance: MarkerAffordance;
  shape: MarkerShape;
  /** The radius the ENGINE tests — always the objective's own `radiusM`. */
  acceptRadiusM: number;
  /** The objective's hidden speed contract, km/h. Undefined = uncapped. */
  maxSpeedKmh?: number;
  /** Instructor-voice line rendered at the marker (never a bare verdict). */
  labelBg: string;
  /** The stop line this marker was resolved against, when it was one. */
  stopLineId?: string;
  /**
   * ROUNDABOUT ONLY. The radius, about (x, y), at which the maneuver counts as
   * LEFT (`RoundaboutParams.exitRadiusM`). Its presence is what tells the route
   * derivation that (x, y) is an ISLAND — a place the student drives AROUND and
   * out of, never TO — so the ribbon is built by the ring rule below rather
   * than by a shortest path to a point that is not on any carriageway. Nothing
   * in the marker vocabulary reads it: `marker` is false for this goal.
   */
  leaveRadiusM?: number;
}

export type GuidanceGoal = GuidancePointGoal | { kind: "ahead"; meters: number };

/** All path derivation needs — the marker vocabulary is irrelevant to routing,
 *  EXCEPT for `shape`, which says whether the coordinates were authored or
 *  derived from the driver's own pose. Lane alignment may only follow the
 *  former; see `alignRawToGoalLane`. `GuidancePointGoal` satisfies this. */
export type RouteTarget =
  | {
      kind: "point";
      x: number;
      y: number;
      shape?: MarkerShape;
      /** See `GuidancePointGoal.leaveRadiusM` — set ⇒ (x, y) is a roundabout
       *  island, and `ringRouteRaw` owns the derivation. */
      leaveRadiusM?: number;
    }
  | { kind: "ahead"; meters: number };

/**
 * World knowledge the goal resolver may use. Absent = the pure-data reading of
 * the spec (what the AUTHOR wrote); present = the corrected marker (what the
 * student must actually see). Both are meaningful: `world/referents.ts` calls
 * the two-argument form deliberately, because its T3 census counts authored
 * anchors, not rendered markers.
 */
export interface GuidanceContext {
  stopLines?: readonly GuidanceStopLine[];
  /** The driver's pose — picks WHICH arm's stop line the marker belongs to. */
  from?: { x: number; y: number };
}

export interface RouteTurn {
  /** Arclength along the derived route where the junction sits, meters. */
  s: number;
  x: number;
  y: number;
  side: "left" | "right";
  /** Unit exit direction at the junction (district coords, x east y north). */
  dirX: number;
  dirY: number;
}

/**
 * A POLYLINE WITH ARCLENGTH — the whole of what the arclength arithmetic in
 * this file actually reads.
 *
 * Extracted from `DerivedRoute` (which still IS one, and every existing caller
 * is unaffected) because a DERIVED ROUTE is not the only ribbon this product
 * lays over a zebra. `traces/sample.ts tracePathForRibbon` builds the same
 * shape for the SHADOW CAR's demonstration path, `ShadowCar.tsx` draws it
 * through the same `ribbonStrip` builder — and it was drawing it straight
 * across the crossing stripes on `sc-crossing-dart/mobile-right/06-waited.png`
 * while the guidance ribbon beside it went quiet correctly. The mute arithmetic
 * had no opinion about that path only because its parameter type said
 * „objectives", not „polyline". Now it says polyline.
 */
export interface ArcSampledPath {
  /** Flat [x0, y0, x1, y1, …] district-coord samples (2.5 m spacing). */
  pts: Float32Array;
  /** Cumulative arclength per sample, meters. */
  arc: Float32Array;
  count: number;
  totalLen: number;
}

export interface DerivedRoute extends ArcSampledPath {
  turns: RouteTurn[];
  /**
   * Arclength at which the ACTIVE objective's marker sits. Equals `totalLen`
   * when no look-ahead leg was appended; everything past it is objective n+1's
   * leg, which the ribbon draws dimmer (doc 86 L5 — the turn must be visible
   * BEFORE the current waypoint, but it is not yet the task).
   */
  goalS: number;
}

// ---------------------------------------------------------------------------
// Goal resolution (reads lesson specs; additive-only contract respected)
// ---------------------------------------------------------------------------

/**
 * Which graded stop line does this `passSignal` objective mean? The objective
 * names its junction node and the control it grades; the world derives one
 * line per APPROACH into that node. The driver's own pose picks the arm — and
 * a line the driver has already crossed is heavily penalised, never chosen
 * over one still ahead, so a re-derivation mid-junction (a `requireRedMet`
 * objective still open after the crossing) does not jump the marker to the
 * opposite arm.
 */
function approachStopLine(
  ctx: GuidanceContext | undefined,
  nodeId: string,
  control: "trafficLight" | "stopSign",
): GuidanceStopLine | null {
  const lines = ctx?.stopLines;
  if (!lines || lines.length === 0) return null;
  // GRADED lines only. T3's whole point is that the gate stands on the cut the
  // rule engine convicts at; anchoring it to paint the engine ignores would
  // reopen exactly the gap that fix closed.
  const atNode = lines.filter((l) => l.junctionNodeId === nodeId && l.graded);
  // Exact control first. A Б1 „Пропусни движението" line is accepted for a
  // stopSign objective only as a last resort: the paint the student can SEE
  // beats a marker floating at the node, even though `stepPassSignal` then
  // never fires (that is a template defect, and Lane 9's to fix, not ours).
  let pool = atNode.filter((l) => l.control === control);
  if (pool.length === 0 && control === "stopSign") {
    pool = atNode.filter((l) => l.control === "giveWay");
  }
  if (pool.length === 0) return null;
  const from = ctx?.from;
  if (!from) return pool[0]!;
  let best: GuidanceStopLine | null = null;
  let bestScore = Infinity;
  for (const l of pool) {
    const dx = from.x - l.x;
    const dy = from.y - l.y;
    // > 0 ⇒ the driver is already PAST this line (travelling across it).
    const past = dx * l.dirX + dy * l.dirY > 0;
    const score = Math.hypot(dx, dy) + (past ? 1e4 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = l;
    }
  }
  return best;
}

/**
 * The line a `reachZone` marker is standing PAST — the one whose paint the
 * student must not be told to cross to reach his own waypoint (register B18).
 *
 * Four conditions, and every one of them exists to stop the clamp from lying
 * in some new direction:
 *
 *  · the line is near enough to govern this marker at all;
 *  · the marker really is on the far side of it (paint tolerance aside);
 *  · the driver is travelling ACROSS it on his way to the marker — the give-way
 *    line on the opposite arm of the same roundabout is not his obligation;
 *  · and the lawful aim point still lands well inside the objective's own
 *    acceptance circle. If it does not, the OBJECTIVE is authored inside the
 *    junction and no marker placement can rescue it: pulling the marker back
 *    would replace „it points past the line" with „I stopped on it and nothing
 *    happened" (doc 86 §7 R6). Those are reported by guidance-geometry.test.ts
 *    against the template that owns them, never papered over here.
 */
function governingPaintLine(
  ctx: GuidanceContext | undefined,
  x: number,
  y: number,
  radiusM: number,
  backM: number,
): { line: GuidanceStopLine; x: number; y: number } | null {
  const lines = ctx?.stopLines;
  if (!lines || lines.length === 0) return null;
  const near = Math.min(
    Math.max(radiusM, MARKER_GOVERNING_NEAR_M),
    MARKER_GOVERNING_MAX_M,
  );
  let best: { line: GuidanceStopLine; x: number; y: number } | null = null;
  let bestPast = PAST_LINE_TOLERANCE_M;
  for (const line of lines) {
    const dx = x - line.x;
    const dy = y - line.y;
    if (Math.hypot(dx, dy) > near) continue;
    const past = dx * line.dirX + dy * line.dirY;
    if (past <= bestPast) continue;
    const from = ctx?.from;
    if (from) {
      const ax = x - from.x;
      const ay = y - from.y;
      const len = Math.hypot(ax, ay);
      if (len > EPS && (ax * line.dirX + ay * line.dirY) / len < APPROACH_ALIGN_DOT) continue;
      // The line comes FIRST: the student meets the paint, then the waypoint.
      if (Math.hypot(line.x - from.x, line.y - from.y) > len) continue;
    }
    // Slide the bar into the marker's own lane: the line is anchored on the
    // edge centreline, and a «спри тук» bar straddling the осева would be its
    // own small lie (the same correction the passSignal gate makes).
    const lat = clamp(
      dx * -line.dirY + dy * line.dirX,
      -GATE_LATERAL_MAX_M,
      GATE_LATERAL_MAX_M,
    );
    const px = line.x - line.dirX * backM - line.dirY * lat;
    const py = line.y - line.dirY * backM + line.dirX * lat;
    if (Math.hypot(px - x, py - y) > radiusM * MARKER_INSIDE_FRACTION) continue;
    best = { line, x: px, y: py };
    bestPast = past;
  }
  return best;
}

/** «Спри на …» / «Карай до …» for a marker resolved onto a line, named by the
 *  sign that governs it — a Б1 give-way line is not a стоп-линия and an
 *  instructor never calls it one. */
function lineLabelBg(control: GuidanceStopLine["control"], halt: boolean): string {
  const what = control === "giveWay" ? "линията за пропускане" : "стоп-линията";
  return halt ? `Спри на ${what}` : `Карай до ${what}`;
}

/** Ring radii the renderer draws for a zone marker: the OUTER radius is the
 *  objective's acceptance radius, exactly. Null for a stop-line gate, which is
 *  a bar across the lane and has no acceptance circle to draw. */
export function markerRingRadii(goal: GuidancePointGoal): { innerM: number; outerM: number } | null {
  if (goal.shape.kind !== "zone") return null;
  const outerM = goal.shape.radiusM;
  const band = Math.min(1.25, Math.max(0.35, outerM * 0.14));
  return { innerM: Math.max(0.05, outerM - band), outerM };
}

// ---------------------------------------------------------------------------
// THE MARKER'S SIGN — where the «Карай дотук» chip stands
// ---------------------------------------------------------------------------
//
// THE DEFECT, from the founder's own frames (scratchpad/play/01-arrival.png and
// lessons/sc-zebra-approach/portrait-18-overlay-hint.png, sc-zebra-approach at
// spawn): „«КАРАЙ ДОТУК» HANGS IN MID-AIR … a dark billboard floating at
// BUILDING HEIGHT in the middle of the street … It reads as unfinished, and it
// sits on the vanishing point — the exact place a driver must look."
//
// He is describing three separate things, and all three were true of the chip:
//
//  1. NOTHING HELD IT UP. The panel was a camera-facing quad at y = 4.4 m with
//     no support of any kind. The 11 m marker shaft that is nominally under it
//     is fully transparent below SHAFT_EYE_CLEAR_M = 2.6 m and dissolves
//     entirely inside 9 m, so from the seat there is never anything between the
//     panel and the road.
//  2. IT WAS ON THE AXIS. The chip hung over the marker itself, i.e. over the
//     centre of the student's own lane, so on a straight street it projects
//     onto the vanishing point at every distance.
//  3. IT WAS FULL STRENGTH AT ANY RANGE. The fade ramp ran 30 m → 11 m and had
//     no far end, so at 120 m — where 5 m of panel subtends 2.4° and the
//     28 px of text in it cannot be read at all — it still drew at 0.95 alpha.
//     That is the state every one of his frames catches it in.
//
// The fix keeps the panel a billboard (a fixed-plane sign is unreadable when
// the route bends into it) and changes where and when it exists:
//
//   · it stands on a POST that reaches the road surface — the thing that turns
//     „floating panel" into „sign";
//   · it moves to the KERB SIDE of the route, so the axis the driver reads the
//     road down is clear;
//   · it is at real sign height instead of first-floor height;
//   · and it fades out beyond the distance at which its text is legible, so it
//     is never again a dark rectangle parked on the horizon.
//
// The numbers live here rather than in the component because they are a
// TEACHING contract, not a styling choice, and `guidance-marker-sign.test.ts`
// asserts them as angles at the eye rather than as metres in a file.

/**
 * Lateral offset of the sign from the route, m — kerb side (right of travel).
 *
 * `GATE_HALF_WIDTH_M` is half the perceptual lane, so this stands the post
 * beyond the lane edge: on the pavement, where road signs are, and clear of the
 * wheel track of a car that drives through the gate.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT STOOD 0.20 m FROM THE ROAD'S OWN SIGN POST, AND THAT IS THE WHOLE ROW.
 *
 * sc-zebra-approach (wave 8, major): «The world-space coach label is drawn half
 * behind the А18 pedestrian-crossing triangle, so the instruction is
 * unreadable.» The adjudication crop: „The А18 triangle sits squarely across
 * the MIDDLE of the teal label panel; of the coach text only «Кар» survives on
 * the left and a single glyph fragment on the right."
 *
 * ARITHMETIC, on the shape most of the catalogue uses — the 1-lane-per-direction
 * scenario street, where the route IS the lane centre:
 *
 *   the road's own kerb signs   `world/builders/props.ts` posts every one of
 *                               them at `eb.halfWidth + 0.8`. halfWidth is
 *                               LANE_WIDTH_M (8.125), so the post is 8.925 m
 *                               from the centreline and the route is at
 *                               LANE_WIDTH_M / 2 = 4.0625 —
 *                               **4.8625 m from the route**
 *   the coach's chip (before)   GATE_HALF_WIDTH_M + 1 =
 *                               **5.0625 m from the route**
 *
 * Two posts 0.20 m apart. Not „near": the same place. The А18 plate therefore
 * stood 2.3 m across a 5.0 m panel — 46 % in, i.e. dead centre, exactly where
 * `LABEL_TITLE_BASELINE_PX` centres the title — and no fade, weight or size
 * pass on the chip could ever have helped, because the ink was behind an opaque
 * object rather than too faint.
 *
 * THE FIX IS THE OFFSET, and it is chosen by where it puts the OCCLUDER rather
 * than by taste. `+ 2.6` stands the coaching post 1.80 m OUTBOARD of the road's
 * sign band — behind the road's sign, from the driving seat — which moves the
 * plate from 46 % across the panel to 14 %, i.e. off the centred text and onto
 * its inboard margin. On the scenario street's own cross-section the post lands
 * 10.725 m from the centreline: 2.60 m past the kerb (8.125) and still 0.90 m
 * short of the back of the 3.5 m pavement, so it is street furniture and not a
 * thing standing in a building.
 *
 * WHAT THIS DOES NOT CLAIM. A 5 m billboard beside a 0.9 m triangle can always
 * be made to overlap by choosing a viewpoint; nothing here promises they never
 * touch. What it promises is that the coach's post is no longer IN the road's
 * sign band, so the road's own sign can no longer bisect the instruction — and
 * `guidance-marker-sign.test.ts` measures that as the clearance rather than as
 * a number retyped here.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const MARKER_SIGN_LATERAL_M = GATE_HALF_WIDTH_M + 2.6;

/**
 * Where `world/builders/props.ts` stands a kerb sign, measured from the ROUTE
 * on a 1-lane-per-direction scenario street: `eb.halfWidth + 0.8` from the
 * centreline, less the outermost lane centre. Pinned BY VALUE (the L7 copy law)
 * because `props.ts` is a world builder and this is a scene module — the test
 * re-asserts it against the real `buildWorldGeometry` output on zb-v1, so a
 * builder that moves its posts convicts this copy instead of silently drifting
 * back into it.
 */
export const WORLD_KERB_SIGN_LATERAL_M = GATE_HALF_WIDTH_M + 0.8;

/**
 * The panel itself. 5.0 × 1.67 m and a 480 × 160 canvas since the 2026-08-03
 * art pass (it was 7.2 × 2.4 m and „spanned half the sky" at the mark). The
 * size lives here with the placement because the two are one contract: the
 * post's top, the lower edge of the panel and the angular clearance from the
 * road axis are all derived from these two numbers.
 */
export const MARKER_SIGN_PANEL_W_M = 5.0;
export const MARKER_SIGN_PANEL_H_M = 1.67;

/** Height of the panel's CENTRE, m. The panel is 1.67 m tall, so its lower edge
 *  sits at 2.07 m — the clearance a real sign keeps over a pavement, and the
 *  reason the post beneath it is short enough to read as a post. */
export const MARKER_SIGN_PANEL_Y = 2.9;

/** The post runs from the road surface to the panel's lower edge. Base at 0 is
 *  the whole point of this pass and is asserted, not assumed. */
export const MARKER_SIGN_POST_BASE_Y = 0;
export const MARKER_SIGN_POST_RADIUS_M = 0.08;

/**
 * The band in which the chip exists, m from the eye.
 *
 * FAR: 5.0 m of panel subtends 4.8° at 60 m and 2.4° at 120 m; the second line
 * («не по-бързо от 45 км/ч», 42 px on a 480 px canvas) is below the resolution
 * of any phone the mobile audit covers past ~80 m. Beyond FAR_END the chip is
 * therefore not information, it is a dark rectangle on the vanishing point.
 * NEAR: unchanged from the previous pass — at the mark the student's eyes
 * belong on the junction, and the contract has already been read.
 */
export const MARKER_SIGN_FAR_END_M = 82;
export const MARKER_SIGN_FAR_START_M = 56;
export const MARKER_SIGN_NEAR_START_M = 30;
export const MARKER_SIGN_NEAR_END_M = 11;
/** Peak alpha of the panel (unchanged). */
export const MARKER_SIGN_MAX_OPACITY = 0.95;

/**
 * Alpha of the sign at a given eye distance — one ramp up out of the near
 * field, one ramp down into the far field, nothing in between to tune.
 */
export function markerSignOpacity(distM: number): number {
  const near = clamp(
    (distM - MARKER_SIGN_NEAR_END_M) / (MARKER_SIGN_NEAR_START_M - MARKER_SIGN_NEAR_END_M),
    0,
    1,
  );
  const far = clamp(
    (MARKER_SIGN_FAR_END_M - distM) / (MARKER_SIGN_FAR_END_M - MARKER_SIGN_FAR_START_M),
    0,
    1,
  );
  return MARKER_SIGN_MAX_OPACITY * Math.min(near, far);
}

/**
 * District-space offset of the sign from the marker, given the direction the
 * student APPROACHES on.
 *
 * Right of travel is `(dy, −dx)` — the same convention `GATE_LATERAL_MAX_M`
 * slides a stop bar on, so the sign lands on the same side of the road as the
 * kerb the bar is measured from. A zero-length or non-finite direction (a route
 * that could not be derived) yields no offset rather than an arbitrary one: a
 * chip over the middle of the lane is the old defect, but a chip flung onto an
 * unknown bearing would be a worse one.
 */
export function markerSignOffset(dirX: number, dirY: number): { x: number; y: number } {
  const len = Math.hypot(dirX, dirY);
  if (!Number.isFinite(len) || len < EPS) return { x: 0, y: 0 };
  const ux = dirX / len;
  const uy = dirY / len;
  return { x: uy * MARKER_SIGN_LATERAL_M, y: -ux * MARKER_SIGN_LATERAL_M };
}

/**
 * The direction the student approaches the goal on, read off the derived route
 * a few metres back from the marker. Falls back to the gate's own normal for a
 * bar across a stop line, and to null when neither is available.
 */
export function markerApproachDir(
  goal: GuidancePointGoal,
  route: DerivedRoute | null,
): { x: number; y: number } | null {
  if (route && route.count >= 2) {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 0 };
    // 6 m is the same window `turnsFromRaw` measures junction headings over —
    // long enough to ignore the densifier's sample noise, short enough that a
    // corner just before the marker does not average the sign onto the wrong
    // side of the road.
    routePointAt(route, Math.max(0, route.goalS - TURN_DIR_WINDOW_M), a);
    routePointAt(route, route.goalS, b);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) > EPS) return { x: dx, y: dy };
  }
  if (goal.shape.kind === "gate") return { x: goal.shape.dirX, y: goal.shape.dirY };
  return null;
}

export function guidanceGoalFor(
  lesson: LessonSpec,
  objectiveIndex: number,
  ctx?: GuidanceContext,
): GuidanceGoal | null {
  const objective = lesson.objectives[objectiveIndex];
  if (!objective) return null;
  let params;
  try {
    params = parseObjectiveParams(objective);
  } catch {
    return null; // malformed spec — guidance silently stands down
  }
  switch (params.kind) {
    case "reachZone": {
      const halt = params.maxSpeedKmh !== undefined && params.maxSpeedKmh <= HALT_CAP_KMH;
      const back = halt ? STOP_BAR_BEFORE_LINE_M : THROUGH_GATE_BEFORE_LINE_M;
      // B18. A waypoint authored past a line the student can SEE is pulled
      // back onto the lawful side of it and drawn as the bar it now is; the
      // acceptance radius it still grades on rides along untouched.
      const clamped = governingPaintLine(ctx, params.x, params.y, params.radiusM, back);
      if (clamped) {
        const goal: GuidancePointGoal = {
          kind: "point",
          x: clamped.x,
          y: clamped.y,
          marker: true,
          affordance: halt ? "halt" : "through",
          shape: {
            kind: "gate",
            halfWidthM: GATE_HALF_WIDTH_M,
            dirX: clamped.line.dirX,
            dirY: clamped.line.dirY,
          },
          acceptRadiusM: params.radiusM,
          labelBg: lineLabelBg(clamped.line.control, halt),
          stopLineId: clamped.line.id,
        };
        if (params.maxSpeedKmh !== undefined) goal.maxSpeedKmh = params.maxSpeedKmh;
        return goal;
      }
      const goal: GuidancePointGoal = {
        kind: "point",
        x: params.x,
        y: params.y,
        marker: true,
        affordance: halt ? "halt" : "through",
        shape: { kind: "zone", radiusM: params.radiusM },
        acceptRadiusM: params.radiusM,
        labelBg: halt ? "Спри тук" : "Карай дотук",
      };
      if (params.maxSpeedKmh !== undefined) goal.maxSpeedKmh = params.maxSpeedKmh;
      return goal;
    }
    case "passSignal": {
      const halt = params.control === "stopSign";
      const line = approachStopLine(ctx, params.nodeId, params.control);
      if (line) {
        const back = halt ? STOP_BAR_BEFORE_LINE_M : THROUGH_GATE_BEFORE_LINE_M;
        // Slide the bar into the driver's own lane: the line is anchored on
        // the edge centreline, and a «спри тук» bar straddling the осева would
        // be its own small lie.
        const lat = ctx?.from
          ? clamp(
              (ctx.from.x - line.x) * -line.dirY + (ctx.from.y - line.y) * line.dirX,
              -GATE_LATERAL_MAX_M,
              GATE_LATERAL_MAX_M,
            )
          : 0;
        return {
          kind: "point",
          x: line.x - line.dirX * back - line.dirY * lat,
          y: line.y - line.dirY * back + line.dirX * lat,
          marker: true,
          affordance: halt ? "halt" : "through",
          shape: { kind: "gate", halfWidthM: GATE_HALF_WIDTH_M, dirX: line.dirX, dirY: line.dirY },
          acceptRadiusM: params.radiusM,
          labelBg: halt ? "Спри на стоп-линията" : "Премини на зелено",
          stopLineId: line.id,
        };
      }
      // No world context, or no graded line at the named node. The authored
      // anchor is all there is — and its acceptance radius is drawn honestly,
      // so a 45 m ring at a junction centre reads as the data defect it is.
      return {
        kind: "point",
        x: params.x,
        y: params.y,
        marker: true,
        affordance: halt ? "halt" : "through",
        shape: { kind: "zone", radiusM: params.radiusM },
        acceptRadiusM: params.radiusM,
        labelBg: halt ? "Спри на стоп-линията" : "Премини на зелено",
      };
    }
    case "driveDistance":
      return { kind: "ahead", meters: params.meters + AHEAD_BUFFER_M };
    case "completeManeuver":
      switch (params.maneuver) {
        case "roundabout":
          // Ribbon only, no pillar — there is nothing at (x, y) to stand on:
          // it is the ISLAND CENTRE, and `leaveRadiusM` is what says so to the
          // route derivation (see ROUNDABOUT RIBBONS below `walkAheadRaw`).
          // The old comment here read „any exit completes the maneuver", which
          // is true of THIS objective and was then used to justify routing to
          // the centre — and a centre 17.85–25.78 m off the carriageway snaps
          // to whichever ring arc the district file lists FIRST.
          return {
            kind: "point",
            x: params.x,
            y: params.y,
            marker: false,
            affordance: "through",
            shape: { kind: "zone", radiusM: params.enterRadiusM },
            acceptRadiusM: params.enterRadiusM,
            labelBg: "Влез в кръговото",
            leaveRadiusM: params.exitRadiusM,
          };
        case "parkInBay":
          return lesson.parkingBay
            ? {
                kind: "point",
                x: lesson.parkingBay.x,
                y: lesson.parkingBay.y,
                marker: true,
                affordance: "halt",
                // The gate is „centre within centerTolM of the bay centre" —
                // that circle, not the painted rect, is what completes.
                shape: { kind: "zone", radiusM: params.centerTolM },
                acceptRadiusM: params.centerTolM,
                labelBg: "Паркирай тук",
              }
            : null;
        case "emergencyStop":
          return { kind: "ahead", meters: EMERGENCY_AHEAD_M };
        case "smoothStop":
          return null;
        case "threePointTurn": {
          // The corridor is a RECT; the ring is its inscribed circle, so a car
          // on the ring is always inside the box the evaluator tests.
          const r = Math.min(params.corridor.halfWidthM, params.corridor.halfLengthM);
          return {
            kind: "point",
            x: params.corridor.x,
            y: params.corridor.y,
            marker: true,
            affordance: "halt",
            shape: { kind: "zone", radiusM: r },
            acceptRadiusM: r,
            labelBg: "Обърни тук",
          };
        }
      }
  }
}

// ---------------------------------------------------------------------------
// Graded stop lines for a district (the runtime's own, never a second
// derivation — see the header note on T3)
// ---------------------------------------------------------------------------

const stopLineCache = new WeakMap<object, readonly GuidanceStopLine[]>();

/**
 * Every line the world PAINTS at a junction mouth, graded or not.
 *
 * The predicate is the world builder's own, term for term: `markings.ts`'s
 * stop/give-way pass paints at a node of degree ≥ 3, on each INCOMING
 * approach, when the node is signalized or `junctionPriorityControls` names
 * that approach — and it puts the paint at the junction cut plus
 * `STOP_LINE_BEYOND_CUT_M`, which is the same arithmetic
 * `runtime/stoplines.ts` uses for the graded lines. Deriving it here instead
 * of calling `analyzeNetwork` keeps the guidance layer off the geometry
 * builders while landing on the identical coordinates (verified to 3 dp
 * against `analyzeNetwork` on rb-mini-v1, district-v1, d2-v1, sx-v1).
 *
 * A district the index refuses to build yields nothing and guidance falls back
 * to the graded set — it degrades, it never throws inside a render.
 */
function paintedLinesFor(index: DistrictIndex): GuidanceStopLine[] {
  const out: GuidanceStopLine[] = [];
  const signalized = new Set(
    index.district.intersections.filter((i) => i.signalized).map((i) => i.id),
  );
  for (const [nodeId, incident] of index.edgesAtNode) {
    if (incident.length < 3) continue; // markings.ts: `if (node.degree < 3) continue;`
    const touched = incident.map((i) => index.edgeRt(i).edge);
    const radius = nodeOpenRadiusM(touched, touched.length);
    if (radius <= 0) continue;
    const isSignal = signalized.has(nodeId);
    const controls = isSignal
      ? null
      : junctionPriorityControls(
          incident.map((i) => {
            const { edge } = index.edgeRt(i);
            return {
              edgeId: edge.id,
              class: edge.class,
              incoming: !edge.oneway || edge.to === nodeId,
              roundabout: edge.roundabout,
            };
          }),
        );
    for (const edgeIdx of incident) {
      const rt = index.edgeRt(edgeIdx);
      const control: GuidanceStopLine["control"] | undefined = isSignal
        ? "trafficLight"
        : controls!.get(rt.edge.id);
      if (control === undefined) continue;
      const sb = Math.min(
        Math.min(radius, rt.totalLen * JUNCTION_TRIM_MAX_FRACTION) + STOP_LINE_BEYOND_CUT_M,
        rt.totalLen / 2,
      );
      for (const atFromEnd of [true, false] as const) {
        if (atFromEnd && rt.edge.oneway) continue; // flow leaves the junction here
        if (atFromEnd ? rt.edge.from !== nodeId : rt.edge.to !== nodeId) continue;
        const sM = atFromEnd ? sb : rt.totalLen - sb;
        const dirSign = atFromEnd ? -1 : 1;
        const [x, y] = index.pointAt(edgeIdx, sM);
        const [tx, ty] = index.tangentAt(edgeIdx, sM);
        out.push({
          id: `${rt.edge.id}@${sM.toFixed(1)}:${control}:paint`,
          x,
          y,
          dirX: tx * dirSign,
          dirY: ty * dirSign,
          control,
          junctionNodeId: nodeId,
          edgeId: rt.edge.id,
          graded: false,
        });
      }
    }
  }
  return out;
}

/**
 * Flatten `worldRuntime.debugStopLines()` for the guidance layer, then add the
 * lines the world paints but does not grade (see `paintedLinesFor` and the
 * header note 1b). Memoized per district OBJECT, so a scene mount pays it
 * once. A district the runtime refuses to parse (the synthetic fixtures in the
 * unit tests, a partial document) yields an empty list and guidance falls back
 * to authored anchors — it degrades, it never throws inside a render.
 */
export function stopLinesForGuidance(district: unknown): readonly GuidanceStopLine[] {
  if (typeof district !== "object" || district === null) return [];
  const hit = stopLineCache.get(district);
  if (hit) return hit;
  let out: GuidanceStopLine[] = [];
  try {
    const runtime = createWorldRuntime(district);
    const index = new DistrictIndex(runtime.district);
    out = runtime.debugStopLines().map((l) => {
      const [x, y] = index.pointAt(l.edgeIdx, l.sM);
      const [tx, ty] = index.tangentAt(l.edgeIdx, l.sM);
      return {
        id: l.id,
        x,
        y,
        dirX: tx * l.dirSign,
        dirY: ty * l.dirSign,
        control: l.control,
        junctionNodeId: l.junctionNodeId,
        edgeId: index.edges[l.edgeIdx]!.edge.id,
        graded: true,
      };
    });
    // Paint-only: same edge + within a metre of a graded line ⇒ it IS that
    // line, already present. Everything else is paint nothing convicts on.
    for (const p of paintedLinesFor(index)) {
      const dup = out.some(
        (g) => g.edgeId === p.edgeId && Math.hypot(g.x - p.x, g.y - p.y) < 1,
      );
      if (!dup) out.push(p);
    }
  } catch {
    out = [];
  }
  stopLineCache.set(district, out);
  return out;
}

// ---------------------------------------------------------------------------
// Road graph
// ---------------------------------------------------------------------------

interface GraphEdge {
  idx: number;
  raw: RouteEdgeLike;
  /** Flat vertex buffer [x0, y0, x1, y1, …]. */
  pts: Float64Array;
  /** Cumulative arclength per vertex. */
  cum: Float64Array;
  totalLen: number;
}

interface GraphArc {
  edgeIdx: number;
  toNode: string;
  len: number;
}

export interface RouteGraph {
  edges: GraphEdge[];
  /** Directed adjacency (oneway edges only run from → to). */
  adj: Map<string, GraphArc[]>;
}

/** Build once per district (mount-time); reused across objective changes. */
export function buildRouteGraph(district: RouteDistrictLike): RouteGraph {
  const edges: GraphEdge[] = [];
  const adj = new Map<string, GraphArc[]>();
  const arc = (node: string, a: GraphArc) => {
    let list = adj.get(node);
    if (!list) adj.set(node, (list = []));
    list.push(a);
  };
  for (const raw of district.roads.edges) {
    const n = raw.geometry.length;
    if (n < 2) continue;
    const pts = new Float64Array(n * 2);
    const cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = raw.geometry[i][0];
      pts[i * 2 + 1] = raw.geometry[i][1];
      if (i > 0) {
        cum[i] =
          cum[i - 1] +
          Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      }
    }
    const totalLen = cum[n - 1];
    if (totalLen <= EPS) continue;
    const idx = edges.length;
    edges.push({ idx, raw, pts, cum, totalLen });
    if (raw.from !== raw.to) {
      arc(raw.from, { edgeIdx: idx, toNode: raw.to, len: totalLen });
      if (!raw.oneway) arc(raw.to, { edgeIdx: idx, toNode: raw.from, len: totalLen });
    }
  }
  return { edges, adj };
}

// ---------------------------------------------------------------------------
// Snapping + edge geometry
// ---------------------------------------------------------------------------

export interface RoadSnap {
  edgeIdx: number;
  /** Arclength of the projection along the edge, meters. */
  sM: number;
  distM: number;
}

/** Nearest point on any edge (global scan — build-time only, never per frame). */
export function snapToRoad(graph: RouteGraph, x: number, y: number): RoadSnap | null {
  let best: RoadSnap | null = null;
  let bestD2 = Infinity;
  for (const e of graph.edges) {
    const segs = e.cum.length - 1;
    for (let s = 0; s < segs; s++) {
      const ax = e.pts[s * 2];
      const ay = e.pts[s * 2 + 1];
      const bx = e.pts[s * 2 + 2];
      const by = e.pts[s * 2 + 3];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { edgeIdx: e.idx, sM: e.cum[s] + t * (e.cum[s + 1] - e.cum[s]), distM: Math.sqrt(d2) };
      }
    }
  }
  return best;
}

function pointOnEdge(e: GraphEdge, s: number): [number, number] {
  const ss = Math.max(0, Math.min(e.totalLen, s));
  const n = e.cum.length;
  let seg = 0;
  while (seg < n - 2 && e.cum[seg + 1] < ss) seg++;
  const segLen = e.cum[seg + 1] - e.cum[seg];
  const t = segLen > 0 ? (ss - e.cum[seg]) / segLen : 0;
  return [
    e.pts[seg * 2] + t * (e.pts[seg * 2 + 2] - e.pts[seg * 2]),
    e.pts[seg * 2 + 1] + t * (e.pts[seg * 2 + 3] - e.pts[seg * 2 + 1]),
  ];
}

function tangentOnEdge(e: GraphEdge, s: number): [number, number] {
  const n = e.cum.length;
  let seg = 0;
  while (seg < n - 2 && e.cum[seg + 1] < s) seg++;
  const dx = e.pts[seg * 2 + 2] - e.pts[seg * 2];
  const dy = e.pts[seg * 2 + 3] - e.pts[seg * 2 + 1];
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [0, 1];
}

/** Sub-polyline of an edge between two arclengths; s1 < s0 ⇒ reversed. */
function slicePolyline(e: GraphEdge, s0: number, s1: number): [number, number][] {
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const out: [number, number][] = [pointOnEdge(e, lo)];
  for (let i = 0; i < e.cum.length; i++) {
    if (e.cum[i] > lo + EPS && e.cum[i] < hi - EPS) out.push([e.pts[i * 2], e.pts[i * 2 + 1]]);
  }
  out.push(pointOnEdge(e, hi));
  if (s1 < s0) out.reverse();
  return out;
}

// ---------------------------------------------------------------------------
// Raw route assembly (points + junction markers)
// ---------------------------------------------------------------------------

interface RawRoute {
  points: [number, number][];
  /** Indices into `points` where a graph node (junction) sits. */
  jointIdx: number[];
}

function appendPiece(raw: RawRoute, pts: [number, number][]): void {
  for (const p of pts) {
    const last = raw.points[raw.points.length - 1];
    if (last && Math.abs(last[0] - p[0]) < EPS && Math.abs(last[1] - p[1]) < EPS) continue;
    raw.points.push(p);
  }
}

/**
 * Dijkstra over the directed road graph (≈300 nodes — a naive scan-min is
 * instant at objective-change frequency). Start/target are edge snaps; oneway
 * edges are traversable from → to only, so guidance never routes a student
 * against a одностранна улица.
 */
function shortestPathRaw(graph: RouteGraph, start: RoadSnap, target: RoadSnap): RawRoute | null {
  const eS = graph.edges[start.edgeIdx];
  const eT = graph.edges[target.edgeIdx];

  // Same edge, legal direction → direct slice, no graph walk.
  if (start.edgeIdx === target.edgeIdx && (target.sM >= start.sM - EPS || !eS.raw.oneway)) {
    return { points: slicePolyline(eS, start.sM, target.sM), jointIdx: [] };
  }

  const dist = new Map<string, number>();
  const prevNode = new Map<string, string | null>(); // null ⇒ seeded from the start edge
  const prevEdge = new Map<string, number>();
  const settled = new Set<string>();
  const seed = (node: string, d: number) => {
    if (d < (dist.get(node) ?? Infinity)) {
      dist.set(node, d);
      prevNode.set(node, null);
      prevEdge.set(node, start.edgeIdx);
    }
  };
  seed(eS.raw.to, eS.totalLen - start.sM);
  if (!eS.raw.oneway) seed(eS.raw.from, start.sM);

  for (;;) {
    let u: string | null = null;
    let du = Infinity;
    for (const [node, d] of dist) {
      if (!settled.has(node) && d < du) {
        du = d;
        u = node;
      }
    }
    if (u === null) break;
    settled.add(u);
    const arcs = graph.adj.get(u);
    if (!arcs) continue;
    for (const a of arcs) {
      const nd = du + a.len;
      if (nd < (dist.get(a.toNode) ?? Infinity) - EPS) {
        dist.set(a.toNode, nd);
        prevNode.set(a.toNode, u);
        prevEdge.set(a.toNode, a.edgeIdx);
      }
    }
  }

  // Enter the target edge at whichever endpoint is legally + cheaply reachable.
  const viaFrom = (dist.get(eT.raw.from) ?? Infinity) + target.sM;
  const viaTo = eT.raw.oneway
    ? Infinity
    : (dist.get(eT.raw.to) ?? Infinity) + (eT.totalLen - target.sM);
  if (!Number.isFinite(viaFrom) && !Number.isFinite(viaTo)) return null;
  const entry = viaFrom <= viaTo ? eT.raw.from : eT.raw.to;

  // Backtrack node chain to a seed.
  const chainNodes: string[] = [];
  const chainEdges: number[] = [];
  let node: string = entry;
  for (;;) {
    chainNodes.push(node);
    const pe = prevEdge.get(node);
    if (pe === undefined) return null; // defensive — entry was reachable, so a chain exists
    chainEdges.push(pe);
    const pn = prevNode.get(node);
    if (pn === null || pn === undefined) break;
    node = pn;
  }
  chainNodes.reverse();
  chainEdges.reverse();

  const raw: RawRoute = { points: [], jointIdx: [] };
  // 1. Start edge: from the snap point to the seeded endpoint.
  const seedNode = chainNodes[0];
  appendPiece(raw, slicePolyline(eS, start.sM, seedNode === eS.raw.to ? eS.totalLen : 0));
  // 2. Middle edges, oriented along traversal.
  for (let i = 1; i < chainNodes.length; i++) {
    const e = graph.edges[chainEdges[i]];
    raw.jointIdx.push(raw.points.length - 1);
    appendPiece(
      raw,
      e.raw.from === chainNodes[i - 1]
        ? slicePolyline(e, 0, e.totalLen)
        : slicePolyline(e, e.totalLen, 0),
    );
  }
  // 3. Target edge: from the entry node to the target snap point.
  raw.jointIdx.push(raw.points.length - 1);
  appendPiece(
    raw,
    entry === eT.raw.from ? slicePolyline(eT, 0, target.sM) : slicePolyline(eT, eT.totalLen, target.sM),
  );
  return raw.points.length >= 2 ? raw : null;
}

function dirAtTail(points: [number, number][]): [number, number] {
  for (let i = points.length - 1; i > 0; i--) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const len = Math.hypot(dx, dy);
    if (len > EPS) return [dx / len, dy / len];
  }
  return [0, 1];
}

/** Initial travel direction when leaving `node` along an edge. */
function outgoingDir(e: GraphEdge, node: string): [number, number] {
  const n = e.cum.length;
  const forward = e.raw.from === node;
  const dx = forward ? e.pts[2] - e.pts[0] : e.pts[(n - 2) * 2] - e.pts[(n - 1) * 2];
  const dy = forward ? e.pts[3] - e.pts[1] : e.pts[(n - 2) * 2 + 1] - e.pts[(n - 1) * 2 + 1];
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [0, 1];
}

function signedAngle(a: [number, number], b: [number, number]): number {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * "Ahead" walk for target-less objectives (driveDistance / emergencyStop):
 * from the pose, follow the road and take the straightest legal continuation
 * at every node (no U-turns) until `meters` of route are assembled.
 */
function walkAheadRaw(
  graph: RouteGraph,
  start: RoadSnap,
  headingDeg: number,
  meters: number,
): RawRoute | null {
  let e = graph.edges[start.edgeIdx];
  const hx = Math.sin(headingDeg * DEG2RAD);
  const hy = Math.cos(headingDeg * DEG2RAD);
  const [tx, ty] = tangentOnEdge(e, start.sM);
  // Travel with the vehicle heading; oneway forces the legal direction.
  let forward = e.raw.oneway ? true : tx * hx + ty * hy >= 0;
  let sFrom = start.sM;
  let acc = 0;

  const raw: RawRoute = { points: [], jointIdx: [] };
  for (let hop = 0; hop < MAX_WALK_EDGES; hop++) {
    const sTo = forward ? e.totalLen : 0;
    if (hop > 0) raw.jointIdx.push(raw.points.length - 1);
    appendPiece(raw, slicePolyline(e, sFrom, sTo));
    acc += Math.abs(sTo - sFrom);
    if (acc >= meters) break;

    const node = forward ? e.raw.to : e.raw.from;
    const arcs = graph.adj.get(node);
    if (!arcs || arcs.length === 0) break; // dead end — the route just ends
    const inDir = dirAtTail(raw.points);
    let best: GraphArc | null = null;
    let bestAng = Infinity;
    for (const a of arcs) {
      if (a.edgeIdx === e.idx) continue; // never U-turn back onto the same edge
      const cand = graph.edges[a.edgeIdx];
      const ang = Math.abs(signedAngle(inDir, outgoingDir(cand, node)));
      if (ang < bestAng) {
        bestAng = ang;
        best = a;
      }
    }
    if (!best) break;
    e = graph.edges[best.edgeIdx];
    forward = e.raw.from === node;
    sFrom = forward ? 0 : e.totalLen;
  }
  return raw.points.length >= 2 ? raw : null;
}

// ---------------------------------------------------------------------------
// ROUNDABOUT RIBBONS (audit rows sc-rb-lane-choice:ffdffd55 /
// sc-rb-circulate-priority:317c79f0, re-measured 2026-08-31)
//
// THE FRAME. On `sc-rb-lane-choice` the drill's own words are «Твоят изход е
// ТРЕТИЯТ (западният)», and the audit clause is „neither ever reaches the third
// exit". Derived through the shipped path (`guidanceGoalFor` →
// `deriveGuidanceRoute`) from the pose the maneuver row actually opens in —
// the north mouth, (0, 21.94), because the objective before it is a 3.5 m disc
// there — the green ribbon came back 98.4 m long and ENDED AT (15.70, −20.40),
// on the south-east ring arc. It rode past the west mouth at s ≈ 40. A student
// following the line labelled «маршрутът до целта» circulates instead of
// exiting, so «Премини през кръга и го напусни» could only be collected by
// IGNORING the guidance. Same shape on `sc-rb-circulate-priority`: 64.4 m from
// 20° short of its NORTH exit, ending at (2.30, −17.70).
//
// THE CAUSE, measured. A `completeManeuver: roundabout` goal is the ISLAND
// CENTRE, and `snapToRoad(0, 0)` is 17.85 m off the carriageway on rb-mini-v1
// and 25.78 m off it on rb-2lane-v1 — every ring sample is equidistant from the
// centre, so the winner is decided by the `d2 < bestD2` scan order, i.e. by
// whichever ring arc the district JSON lists FIRST (`rbm-e-ring-se` @ s = 2.34,
// `rb2-e-ring-se` @ s = 17.00). The ring is one-way, so the shortest path to
// that arbitrary point runs FORWARD PAST THE DRILL'S OWN EXIT. The destination
// was a property of file order and of nothing the lesson meant.
//
// WHAT GUIDANCE MAY HONESTLY DRAW, and what it may not. It may not draw an
// EXIT: `RoundaboutParams` carries one centre and two radii, so the exit arm is
// not expressible, and the two shipped shapes need OPPOSITE answers from the
// same geometry — `sc-rb-lane-choice` opens its maneuver row standing ON the
// north mouth it must PASS, while `sc-rb-circulate-priority` opens 20° short of
// the north mouth it must TAKE. Both are ~0–6 m from a mouth. No rule over
// (centre, enterRadiusM, exitRadiusM, pose) separates them; picking „the next
// exit" would have traded this defect for its mirror image on the very drill
// the row is about. So the ribbon names no exit. It runs to the NEXT MOUTH and
// stops there — the place where the decision is made and where the drill's own
// instruction («излез на третия изход») takes over. Two consequences worth
// stating plainly rather than discovering:
//   · lane-choice's ribbon becomes 40.8 m, north mouth → WEST mouth: the third
//     exit, and it can no longer run past it.
//   · when the car is already within a couple of metres of the next mouth the
//     leg is shorter than `MIN_ROUTE_LEN_M` and `finalizeRoute` drops it, so
//     the ribbon stands down. That was called „the honest half of not knowing
//     the exit". IT WAS NOT HONEST, IT WAS THE ROW AGAIN — see the next block.
// The real repair is to let the objective NAME its exit; that lives in
// `lessons/types.ts` (`RoundaboutParams`) and the templates, not here.
//
// ── 2026-09-02: THE STAND-DOWN IS WHERE THE ROW WENT, NOT WHERE IT ENDED ───
//
// The paragraph above shipped the cut and then conceded the stand-down in one
// clause, as if it were rare. It is not rare — it is the DEFAULT, and it is
// the same row. Every maneuver row on this shelf is handed over by the disc of
// the objective before it, and on all six drills that disc is authored ON a
// mouth (`sc-rb-lane-choice` (0, 21.94), `sc-rb-circulate-priority` and
// `sc-rb-busy-gap` (6.16, 16.91), `sc-rb-exit-signal` (−16.91, 6.16)). The row
// opens the instant the car ENTERS that disc, i.e. one radius BEFORE its
// centre — and one radius before a mouth is exactly the band between
// RING_MOUTH_SKIP_M (1.5 m, where the snap artifact stops) and
// MIN_ROUTE_LEN_M (6 m, where a ribbon starts existing). Cut at the mouth,
// then dropped for being too short: nothing on the asphalt at all.
//
// MEASURED on the shipped rung, sweeping the handover disc (37 poses each,
// `deriveGuidanceRoute` through `guidanceGoalFor`, L1/L3/L5):
//
//   sc-rb-lane-choice        14/37 poses NULL at L3, 15/37 at L1
//   sc-rb-exit-signal        18/37 at L3, 12/37 at L1
//   sc-rb-circulate-priority 18/37 at L3, 12/37 at L1
//   sc-rb-busy-gap           18/37 at L3, 12/37 at L1
//   sc-rb-ped-exit            4/37 at L3   ·  sc-roundabout-entry 0/37 at L3
//
// And on the CORRECT line of `sc-rb-lane-choice` it is not a probability at
// all. Walking the inner lane (r = 21.94) into the (0, 21.94) disc: the car
// enters it at φ ≈ 171°, and from φ 171 through φ 177 — the whole leading two
// thirds — the leg is NULL. The ribbon only appears from φ ≈ 178, inside
// 0.8 m of the centre. So on the drill whose entire subject is WHICH EXIT to
// take, the moment «Премини през кръга и го напусни» went live was the moment
// the green line went out. That is the row's own second clause — „neither ever
// reaches the third exit" — with a mechanism in this file: the student was
// shown nothing to reach it BY.
//
// THE FIX, and its bound. A mouth under `MIN_ROUTE_LEN_M` away is undrawable,
// so it is the mouth the car is standing in, and the cut moves to the one
// after it (RING_MOUTH_UNDRAWABLE, in `ringRouteRaw`). AT MOST ONE mouth is
// ever skipped, which is what keeps this from re-opening the defect the block
// exists to close: the leg can never exceed `MIN_ROUTE_LEN_M` plus ONE mouth
// spacing — 6 + 40.72 = 46.7 m on rb-2lane, 6 + 28.2 = 34.2 m on rb-mini —
// against centreline laps of 162.9 m and 112.8 m. It still ends AT a mouth, it
// still names no exit, and `sc-rb-lane-choice`'s leg now measures 36.5–44.5 m
// over the whole handover disc (41.1 m from its centre), every one of them
// ending at (−26.00, 0.00) — the WEST mouth, the third exit — where before it
// was drawn from a 0.8 m island of poses and was nothing everywhere else.
// Re-measured over the same 37 poses: NULLs 14 → 0 on `sc-rb-lane-choice` at
// every rung, 18 → 1 on the three rb-mini drills, and `sc-rb-ped-exit` and
// `sc-roundabout-entry` byte-identical (their cuts are (a), not (b)).
//
// THE CONSEQUENCE, stated rather than left to be found. On a drill whose own
// exit IS the near mouth — `sc-rb-circulate-priority` leaves at NORTH and its
// handover disc stands 20° short of it — a pose 1.5–6 m before that node now
// draws 30–34 m of ring to the WEST mouth instead of drawing nothing. That is
// still the ring, and the ribbon has never named an exit, but it is worth
// being clear that the trade is „a true statement about the ring" against
// „nothing at all", not against „a ribbon to your exit". The live path is not
// in that band — the leg is derived ONCE, when the row opens, and the car
// enters that disc ≈10.3 m before the node, well outside it — so this is the
// bound on the change rather than a description of it.
//
// The one case where the ribbon may leave the ring is when the CAR already
// has: once the walk is outside `exitRadiusM`, the maneuver is complete by the
// evaluator's own test, so the leg ends there (`sc-rb-ped-exit` opens its row
// 8 m up its exit arm and gets a 7.5 m ribbon out of the roundabout, where the
// old shortest-path-to-the-island pointed it 65 m BACKWARDS into the ring).
// ---------------------------------------------------------------------------

/**
 * A junction node nearer than this along the leg is the mouth the nose is
 * already in, not the next one — and `walkAheadRaw` emits a joint at s ≈ 0
 * whenever the pose snaps onto an edge END, which is exactly where a car
 * sitting on a mouth snaps. Small enough that no mouth a student could still
 * act on is skipped.
 *
 * IT IS NOT, BY ITSELF, „the mouth the nose is already in" (row
 * sc-rb-lane-choice:ffdffd55, re-measured 2026-09-02). 1.5 m is where the
 * SNAP artifact stops; `MIN_ROUTE_LEN_M` (6 m) is where a ribbon starts
 * existing, and everything between the two was cut at a mouth and then dropped
 * by `finalizeRoute` — no ribbon at all. That band is not an edge case on this
 * shelf: every maneuver row in the catalogue is handed over by a disc authored
 * ON a mouth, so the pose the row opens in lands in it by construction. So the
 * second half of the sentence lives at RING_MOUTH_UNDRAWABLE, in the loop.
 */
const RING_MOUTH_SKIP_M = 1.5;
/**
 * How far the ring walk may run while looking for the next mouth. One lap of
 * the widest shipped ring (rb-2lane-v1: 187.3 m on the outer lane) with room
 * for the leg that reaches it; the walk is cut long before this in practice.
 */
const RING_WALK_MAX_M = 260;

/** Cumulative arclength per point of a raw route (index-aligned). */
function rawArcLengths(raw: RawRoute): number[] {
  const s: number[] = new Array(raw.points.length);
  s[0] = 0;
  for (let i = 1; i < raw.points.length; i++) {
    s[i] =
      s[i - 1] +
      Math.hypot(
        raw.points[i][0] - raw.points[i - 1][0],
        raw.points[i][1] - raw.points[i - 1][1],
      );
  }
  return s;
}

/**
 * The leg for a `completeManeuver: roundabout` objective — see the block above.
 *
 * INSIDE the ring the leg is the road AHEAD (`walkAheadRaw`, which on a oneway
 * ring can only travel the legal way round and always prefers the ring to a
 * 90° arm, so it never invents an exit). OUTSIDE it, the leg is still the
 * shortest path toward the island — that part was never wrong, an approach can
 * only reach the ring through its own mouth — and the cut below is what makes
 * the arbitrary snap harmless.
 *
 * Then it is CUT, at the first of:
 *   (a) the sample where the leg is outside `leaveRadiusM` having been inside
 *       `enterRadiusM` — the evaluator's own completion test, so this is the
 *       maneuver ending rather than a guess; and
 *   (b) the first junction node at least `RING_MOUTH_SKIP_M` ahead that stands
 *       within `enterRadiusM` of the island — the next MOUTH — unless the leg
 *       to it is under `MIN_ROUTE_LEN_M`, i.e. too short to be drawn at all, in
 *       which case it is the mouth the car is STANDING IN and the one after it
 *       is taken instead (RING_MOUTH_UNDRAWABLE; at most one is ever skipped).
 *       The radius test is what keeps a 458 m city approach (`l3-roundabout`
 *       from spawn-3) from being chopped at the first side street it passes:
 *       only nodes that are part of the roundabout qualify.
 */
function ringRouteRaw(
  graph: RouteGraph,
  snap: RoadSnap,
  start: { x: number; y: number; headingDeg: number },
  cx: number,
  cy: number,
  enterRadiusM: number,
  leaveRadiusM: number,
): RawRoute | null {
  const inside = Math.hypot(start.x - cx, start.y - cy) <= enterRadiusM;
  let raw: RawRoute | null;
  if (inside) {
    raw = walkAheadRaw(graph, snap, start.headingDeg, RING_WALK_MAX_M);
  } else {
    const islandSnap = snapToRoad(graph, cx, cy);
    raw = islandSnap ? shortestPathRaw(graph, snap, islandSnap) : null;
  }
  if (!raw || raw.points.length < 2) return null;

  const s = rawArcLengths(raw);

  // (a) the completion point. `armed` starts true when the car is already in
  // the ring, so a leg that only ever drives AWAY from a roundabout it never
  // entered cannot be cut at „you have left" — it never arrived.
  //
  // The crossing is solved ALONG the segment, not read off a vertex. An arm
  // edge is authored as its two endpoints (`rbp-e-arm-n` runs (0, 18) → (0,
  // 108) with nothing between), so a vertex scan first saw „outside" 82 m out
  // at the end of the street and drew the whole arm — `sc-rb-ped-exit`, the
  // one drill that opens this row already committed to its exit.
  let cutOut = Infinity;
  let armed = inside;
  for (let i = 0; i < raw.points.length; i++) {
    const d = Math.hypot(raw.points[i][0] - cx, raw.points[i][1] - cy);
    if (!armed && d <= enterRadiusM) armed = true;
    if (!armed) continue;
    if (d > leaveRadiusM) {
      cutOut = s[i];
      break;
    }
    if (i + 1 >= raw.points.length) break;
    const dNext = Math.hypot(raw.points[i + 1][0] - cx, raw.points[i + 1][1] - cy);
    if (dNext <= leaveRadiusM) continue;
    // |A + t(B − A) − C| = leaveRadiusM, smallest root in (0, 1].
    const ax = raw.points[i][0] - cx;
    const ay = raw.points[i][1] - cy;
    const bx = raw.points[i + 1][0] - raw.points[i][0];
    const by = raw.points[i + 1][1] - raw.points[i][1];
    const qa = bx * bx + by * by;
    const qb = ax * bx + ay * by;
    const qc = ax * ax + ay * ay - leaveRadiusM * leaveRadiusM;
    const disc = qb * qb - qa * qc;
    // d ≤ R < dNext guarantees a real root; the guard is for qa ≈ 0 only.
    const t = qa > EPS && disc >= 0 ? (-qb + Math.sqrt(disc)) / qa : 1;
    cutOut = s[i] + clamp(t, 0, 1) * Math.hypot(bx, by);
    break;
  }

  // (b) the next mouth. TWO are collected, not one, because the first can be
  // the mouth the car is STANDING IN rather than the one it is heading for —
  // see RING_MOUTH_UNDRAWABLE below the loop.
  const mouths: number[] = [];
  for (const j of raw.jointIdx) {
    if (j <= 0 || j >= raw.points.length) continue;
    if (s[j] < RING_MOUTH_SKIP_M) continue;
    if (Math.hypot(raw.points[j][0] - cx, raw.points[j][1] - cy) > enterRadiusM) continue;
    mouths.push(s[j]);
    if (mouths.length >= 2) break;
  }
  // RING_MOUTH_UNDRAWABLE. A mouth so close that the leg to it could not be
  // DRAWN is not a decision the student can still act on — it is the mouth he
  // is already standing in, and the sentence RING_MOUTH_SKIP_M states was
  // simply calibrated to the wrong length. So the cut moves to the mouth after
  // it, and the ribbon says the one thing that is still true from here: the
  // ring goes on, and your next decision point is there.
  const cutMouth =
    mouths.length > 1 && mouths[0] < MIN_ROUTE_LEN_M ? mouths[1] : (mouths[0] ?? Infinity);

  const cut = Math.min(cutOut, cutMouth);
  if (Number.isFinite(cut)) return trimRawTo(raw, cut);
  // Neither a mouth nor a completion inside the leg. A ring walk with no node
  // on it would otherwise be drawn as a full lap — the defect this block
  // exists to stop — so it stands down; an APPROACH is left exactly as it was
  // derived, which is the behaviour every district but a malformed one gets.
  return inside ? null : raw;
}

// ---------------------------------------------------------------------------
// Finalization: turns → corner rounding → densify → smooth → arclengths
// ---------------------------------------------------------------------------

/** Average direction over ~`windowM` of polyline walking from `j` by `step`. */
function dirOverWindow(
  points: [number, number][],
  j: number,
  step: 1 | -1,
  windowM: number,
): [number, number] {
  let x = 0;
  let y = 0;
  let acc = 0;
  let i = j;
  while (acc < windowM && i + step >= 0 && i + step < points.length) {
    const dx = points[i + step][0] - points[i][0];
    const dy = points[i + step][1] - points[i][1];
    x += dx * step;
    y += dy * step;
    acc += Math.hypot(dx, dy);
    i += step;
  }
  const len = Math.hypot(x, y);
  return len > EPS ? [x / len, y / len] : [0, 1];
}

interface PendingTurn {
  x: number;
  y: number;
  side: "left" | "right";
  dirX: number;
  dirY: number;
}

function turnsFromRaw(raw: RawRoute): PendingTurn[] {
  const out: PendingTurn[] = [];
  for (const j of raw.jointIdx) {
    if (j <= 0 || j >= raw.points.length - 1) continue;
    const inDir = dirOverWindow(raw.points, j, -1, TURN_DIR_WINDOW_M);
    const outDir = dirOverWindow(raw.points, j, 1, TURN_DIR_WINDOW_M);
    const ang = signedAngle(inDir, outDir);
    if (Math.abs(ang) < TURN_MIN_RAD) continue;
    out.push({
      x: raw.points[j][0],
      y: raw.points[j][1],
      // x-east/y-north plane: positive (counter-clockwise) rotation = left turn.
      side: ang > 0 ? "left" : "right",
      dirX: outDir[0],
      dirY: outDir[1],
    });
  }
  return out;
}

/** Replace sharp vertices with a small quadratic-bezier arc (junction mouths
 * are 2.5×-scaled — a hard kink in the ribbon there reads broken).
 * `keepIdx` (the active waypoint, when a look-ahead leg is appended) is
 * tracked through the rewrite so `goalS` stays exact instead of estimated. */
function roundCorners(
  points: [number, number][],
  keepIdx: number,
): { points: [number, number][]; keptAt: number } {
  if (points.length < 3) return { points, keptAt: Math.min(keepIdx, points.length - 1) };
  const out: [number, number][] = [points[0]];
  let keptAt = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const prev = out[out.length - 1];
    const next = points[i + 1];
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (inLen < EPS || outLen < EPS) {
      if (i === keepIdx) keptAt = out.length - 1;
      continue;
    }
    const inDir: [number, number] = [(p[0] - prev[0]) / inLen, (p[1] - prev[1]) / inLen];
    const outDir: [number, number] = [(next[0] - p[0]) / outLen, (next[1] - p[1]) / outLen];
    if (Math.abs(signedAngle(inDir, outDir)) < CORNER_MIN_RAD) {
      out.push(p);
      if (i === keepIdx) keptAt = out.length - 1;
      continue;
    }
    const cut = Math.min(CORNER_CUT_MAX_M, inLen * 0.5, outLen * 0.5);
    const a: [number, number] = [p[0] - inDir[0] * cut, p[1] - inDir[1] * cut];
    const b: [number, number] = [p[0] + outDir[0] * cut, p[1] + outDir[1] * cut];
    // Quadratic bezier a → b with control p.
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const mt = 1 - t;
      out.push([
        mt * mt * a[0] + 2 * mt * t * p[0] + t * t * b[0],
        mt * mt * a[1] + 2 * mt * t * p[1] + t * t * b[1],
      ]);
      // The apex sample stands in for the vertex the bezier replaced.
      if (i === keepIdx && k === 3) keptAt = out.length - 1;
    }
  }
  out.push(points[points.length - 1]);
  if (keepIdx >= points.length - 1) keptAt = out.length - 1;
  return { points: out, keptAt };
}

/** Cut a raw route at `maxM` of arclength (the look-ahead leg never runs to
 *  the horizon — the chevron horizon is 140 m). */
function trimRawTo(raw: RawRoute, maxM: number): RawRoute {
  if (maxM <= 0) return { points: [], jointIdx: [] };
  const points: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < raw.points.length; i++) {
    if (i === 0) {
      points.push(raw.points[0]);
      continue;
    }
    const seg = Math.hypot(
      raw.points[i][0] - raw.points[i - 1][0],
      raw.points[i][1] - raw.points[i - 1][1],
    );
    if (acc + seg >= maxM) {
      const t = seg > EPS ? (maxM - acc) / seg : 0;
      points.push([
        raw.points[i - 1][0] + (raw.points[i][0] - raw.points[i - 1][0]) * t,
        raw.points[i - 1][1] + (raw.points[i][1] - raw.points[i - 1][1]) * t,
      ]);
      acc = maxM;
      break;
    }
    acc += seg;
    points.push(raw.points[i]);
  }
  const cut = points.length - 1;
  return { points, jointIdx: raw.jointIdx.filter((j) => j < cut) };
}

/** Polyline arclength of a raw route. */
function rawLength(raw: RawRoute): number {
  let acc = 0;
  for (let i = 1; i < raw.points.length; i++) {
    acc += Math.hypot(
      raw.points[i][0] - raw.points[i - 1][0],
      raw.points[i][1] - raw.points[i - 1][1],
    );
  }
  return acc;
}

/**
 * Where along a raw route it comes nearest to (x, y) — the cut point for an
 * „ahead" corridor whose next objective sits beside it (register B1: Урок 7's
 * bay is 6.4 m off the corridor, 62 m out, and the ribbon used to run 176 m).
 */
function nearestOnRaw(raw: RawRoute, x: number, y: number): { s: number; latM: number } {
  let acc = 0;
  let bestS = 0;
  let bestD = Infinity;
  for (let i = 0; i < raw.points.length; i++) {
    if (i > 0) {
      acc += Math.hypot(
        raw.points[i][0] - raw.points[i - 1][0],
        raw.points[i][1] - raw.points[i - 1][1],
      );
    }
    const d = Math.hypot(raw.points[i][0] - x, raw.points[i][1] - y);
    if (d < bestD) {
      bestD = d;
      bestS = acc;
    }
  }
  return { s: bestS, latM: bestD };
}

// ---------------------------------------------------------------------------
// LANE ALIGNMENT (sweep 161, `sc-ov-keep-right/mobile-right/04-t118s.png`).
//
// THE FRAME. The green ribbon — the one the legend calls «зелена — маршрутът
// до целта» — runs down the LEFT lane for the whole approach while the blue
// shadow-car ribbon runs in the far RIGHT lane, and the lesson's only task is
// «Престрой се в дясната лента». A student following the line labelled „the
// route to the goal" is led into the exact lane the lesson orders him out of.
//
// THE CAUSE, measured on the shipped district. `ov-keepright-v1` is ONE edge,
// (0,0)→(0,360): the whole 2+2 boulevard is a single centreline at x = 0. The
// objective is authored at x = 12.19 (`KR_RIGHT`, templates-lanes.ts:64) and
// `snapToRoad` returns `{ edgeIdx, sM, distM }` — it measures the lateral
// offset and then nothing downstream reads it. `shortestPathRaw` emits pure
// centreline geometry, so the derived route ran x = 0.00 at EVERY sample and
// ended 12.19 m — one and a half lane pitches — from the lane it was pointing
// at. The ribbon for a right-lane goal was byte-identical to the ribbon for a
// left-lane goal on the same edge: lane was not merely wrong, it was
// inexpressible.
//
// THE FIX is the one this file already applies to the stop-line GATE, which
// is anchored on the same centreline and is „slid sideways by the driver's own
// measured offset — bounded" (GATE_LATERAL_MAX_M). The ribbon now gets the
// same treatment at its goal end, and for the same reason.
//
// THE THREE BOUNDS, each answering a way this could lie instead:
//  - CONFINED TO THE FINAL LEG. The shift is applied along the local normal,
//    so carrying it back through a junction would hold the ribbon 12 m to the
//    right of whatever road it is on — off the carriageway of any side street
//    it crossed. It therefore eases in after the last junction before the
//    goal, never across one.
//  - BOUNDED BY THE WIDEST REAL CARRIAGEWAY. An objective further out than
//    LANE_ALIGN_MAX_M is not in a lane: `parkInBay` bays and driveway targets
//    sit off the road by design, and the marker is what shows those. Beyond
//    the bound the route is left exactly as it was — the ribbon stays on the
//    tarmac and does not drive the student into a kerb.
//  - EASED, NOT SNAPPED. A step change would read as a swerve. It ramps in
//    over LANE_ALIGN_RAMP_M and decays again past the goal so the look-ahead
//    legs rejoin the centreline they were derived on.
// ---------------------------------------------------------------------------

/** Lateral offsets past this are not lane choice — they are off-road targets
 *  (parking bays, driveways). Two lane pitches covers a 3-lanes-each-way
 *  carriageway measured from its centreline; `ov-keepright-v1`'s outer lane
 *  sits at 1.5 pitches (12.19 m of a measured 8.125 m pitch). */
export const LANE_ALIGN_MAX_M = LANE_WIDTH_M * 2;
/** Below this the goal is already on the centreline — junction nodes, and the
 *  10 of 11 `passSignal` targets authored at (0,0). Leave them untouched. */
export const LANE_ALIGN_MIN_M = 0.35;
/** Ease-in / ease-out distance for the shift, m. Longer than a lane change so
 *  the ribbon reads as „move over and stay there", not as a late swerve. */
export const LANE_ALIGN_RAMP_M = 40;

/**
 * Slide the route sideways into the goal's own lane over the final leg.
 * Mutates `raw.points` in place and returns the signed offset applied (0 when
 * the goal is on the centreline or too far off-road to be a lane).
 */
function alignRawToGoalLane(
  raw: RawRoute,
  goalX: number,
  goalY: number,
  splitIdx?: number,
): { offset: number; splitIdx: number | undefined } {
  if (raw.points.length < 2) return { offset: 0, splitIdx };
  // A shortest path over a single edge comes back as TWO points, and
  // densification happens later in finalizeRoute — so a ramp applied to the
  // raw polyline would be stretched across the whole leg by the straight-line
  // interpolation that follows. Subdivide first (joint indices remapped), so
  // LANE_ALIGN_RAMP_M means metres rather than "the whole route".
  const newSplitIdx = subdivideRaw(raw, DENSIFY_STEP_M, splitIdx);
  const pts = raw.points;

  // Arclength of every sample, and of the goal's projection onto the route.
  const s: number[] = new Array(pts.length);
  s[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const hit = nearestOnRaw(raw, goalX, goalY);
  if (hit.latM < LANE_ALIGN_MIN_M || hit.latM > LANE_ALIGN_MAX_M) {
    return { offset: 0, splitIdx: newSplitIdx };
  }

  // The sample the goal projects onto, and the local tangent there.
  let gi = 0;
  for (let i = 1; i < pts.length; i++) if (Math.abs(s[i] - hit.s) < Math.abs(s[gi] - hit.s)) gi = i;
  const ta = pts[Math.max(0, gi - 1)];
  const tb = pts[Math.min(pts.length - 1, gi + 1)];
  const tlen = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
  if (tlen < EPS) return { offset: 0, splitIdx: newSplitIdx };
  const tx = (tb[0] - ta[0]) / tlen;
  const ty = (tb[1] - ta[1]) / tlen;
  // Signed offset along the route's right normal (x east, y north).
  const nx = ty;
  const ny = -tx;
  const offset = (goalX - pts[gi][0]) * nx + (goalY - pts[gi][1]) * ny;
  if (Math.abs(offset) < LANE_ALIGN_MIN_M) return { offset: 0, splitIdx: newSplitIdx };

  // The leg the shift may live on: after the last junction before the goal.
  let legStartS = 0;
  for (const j of raw.jointIdx) {
    if (j < pts.length && s[j] < hit.s - EPS && s[j] > legStartS) legStartS = s[j];
  }
  const rampIn = Math.min(LANE_ALIGN_RAMP_M, Math.max(EPS, hit.s - legStartS));

  // Normals come from a SNAPSHOT: writing pts[i] and then reading pts[i-1] as
  // a neighbour would feed each shift into the next point's tangent and bend
  // the ribbon progressively off the road.
  const src = pts.map((p) => [p[0], p[1]] as [number, number]);
  for (let i = 0; i < pts.length; i++) {
    let w: number;
    if (s[i] <= legStartS) w = 0;
    else if (s[i] < hit.s) w = Math.min(1, (s[i] - legStartS) / rampIn);
    else w = Math.max(0, 1 - (s[i] - hit.s) / LANE_ALIGN_RAMP_M);
    if (w <= 0) continue;
    // Local normal, so the shift follows the road rather than a fixed compass
    // direction — the same reason the gate bar uses the edge's own tangent.
    const a = src[Math.max(0, i - 1)];
    const b = src[Math.min(src.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < EPS) continue;
    pts[i] = [
      src[i][0] + ((b[1] - a[1]) / len) * offset * w,
      src[i][1] + (-(b[0] - a[0]) / len) * offset * w,
    ];
  }
  return { offset, splitIdx: newSplitIdx };
}

/**
 * Split every segment longer than `stepM`. `jointIdx` AND the caller's
 * `splitIdx` are indices into `points`, so both are remapped — the active
 * waypoint's arclength is measured from `splitIdx` in finalizeRoute, and
 * leaving it pointing at the pre-subdivision slot moved the reported `goalS`
 * (caught by guidance-geometry's sc-junction-stop look-ahead assertion).
 * In place; the route is at most ROUTE_MAX_SAMPLES long.
 */
function subdivideRaw(raw: RawRoute, stepM: number, splitIdx?: number): number | undefined {
  const out: [number, number][] = [];
  const remap = new Map<number, number>();
  for (let i = 0; i < raw.points.length; i++) {
    remap.set(i, out.length);
    out.push(raw.points[i]);
    if (i === raw.points.length - 1) break;
    const a = raw.points[i];
    const b = raw.points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(len / stepM);
    for (let k = 1; k <= n; k++) {
      const t = (k * stepM) / len;
      if (t >= 1 - EPS) break;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    if (out.length > ROUTE_MAX_SAMPLES * 2) break; // paranoia: never unbounded
  }
  raw.points = out;
  raw.jointIdx = raw.jointIdx.map((j) => remap.get(j) ?? j).filter((j) => j < out.length);
  return splitIdx === undefined ? undefined : (remap.get(splitIdx) ?? splitIdx);
}

/** Does the route turn ≥ TURN_MIN_RAD at a junction PAST `splitIdx` — i.e. is
 *  the next turn already announced beyond the active waypoint? */
function hasTurnBeyond(raw: RawRoute, splitIdx: number): boolean {
  for (const j of raw.jointIdx) {
    if (j <= splitIdx || j <= 0 || j >= raw.points.length - 1) continue;
    const inDir = dirOverWindow(raw.points, j, -1, TURN_DIR_WINDOW_M);
    const outDir = dirOverWindow(raw.points, j, 1, TURN_DIR_WINDOW_M);
    if (Math.abs(signedAngle(inDir, outDir)) >= TURN_MIN_RAD) return true;
  }
  return false;
}

/** Append the look-ahead leg. Returns the joined route and the index of the
 *  ACTIVE objective's marker inside it. */
function concatRaw(a: RawRoute, b: RawRoute): { raw: RawRoute; splitIdx: number } {
  const points = a.points.slice();
  const jointIdx = a.jointIdx.slice();
  const splitIdx = points.length - 1;
  const last = points[splitIdx];
  let startAt = 0;
  if (
    last &&
    b.points.length > 0 &&
    Math.abs(last[0] - b.points[0][0]) < EPS &&
    Math.abs(last[1] - b.points[0][1]) < EPS
  ) {
    startAt = 1;
  }
  const shift = points.length - startAt;
  for (let i = startAt; i < b.points.length; i++) points.push(b.points[i]);
  for (const j of b.jointIdx) {
    const nj = j + shift;
    if (nj > splitIdx && nj < points.length - 1) jointIdx.push(nj);
  }
  jointIdx.sort((p, q) => p - q);
  return { raw: { points, jointIdx }, splitIdx };
}

function finalizeRoute(raw: RawRoute, splitIdx?: number): DerivedRoute | null {
  const pending = turnsFromRaw(raw);
  const keepIdx = splitIdx ?? raw.points.length - 1;
  const { points: rounded, keptAt } = roundCorners(raw.points, keepIdx);
  // Arclength of the ACTIVE waypoint along the rounded polyline — the frame
  // densify measures in, so `goalS` lands on a real sample rather than an
  // estimate. (Everything past it is objective n+1's look-ahead leg.)
  let roundedSplitLen = 0;
  for (let i = 1; i <= Math.min(keptAt, rounded.length - 1); i++) {
    roundedSplitLen += Math.hypot(
      rounded[i][0] - rounded[i - 1][0],
      rounded[i][1] - rounded[i - 1][1],
    );
  }

  // Densify at a fixed step (capped by the preallocated ribbon capacity).
  const xs: number[] = [rounded[0][0]];
  const ys: number[] = [rounded[0][1]];
  let carried = 0;
  let total = 0;
  outer: for (let i = 1; i < rounded.length; i++) {
    let ax = rounded[i - 1][0];
    let ay = rounded[i - 1][1];
    const bx = rounded[i][0];
    const by = rounded[i][1];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (carried + segLen >= DENSIFY_STEP_M) {
      const t = (DENSIFY_STEP_M - carried) / segLen;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      segLen = Math.hypot(bx - ax, by - ay);
      carried = 0;
      total += DENSIFY_STEP_M;
      xs.push(ax);
      ys.push(ay);
      if (xs.length >= ROUTE_MAX_SAMPLES || total >= MAX_ROUTE_LEN_M) break outer;
    }
    carried += segLen;
  }
  if (carried > 0.5 && xs.length < ROUTE_MAX_SAMPLES) {
    xs.push(rounded[rounded.length - 1][0]);
    ys.push(rounded[rounded.length - 1][1]);
  }
  const count = xs.length;
  if (count < 2) return null;

  // One gentle 3-tap pass over interior samples (micro-kink polish).
  const sx = xs.slice();
  const sy = ys.slice();
  for (let i = 1; i < count - 1; i++) {
    sx[i] = xs[i - 1] * 0.25 + xs[i] * 0.5 + xs[i + 1] * 0.25;
    sy[i] = ys[i - 1] * 0.25 + ys[i] * 0.5 + ys[i + 1] * 0.25;
  }

  const pts = new Float32Array(count * 2);
  const arc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pts[i * 2] = sx[i];
    pts[i * 2 + 1] = sy[i];
    if (i > 0) arc[i] = arc[i - 1] + Math.hypot(sx[i] - sx[i - 1], sy[i] - sy[i - 1]);
  }
  const totalLen = arc[count - 1];
  if (totalLen < MIN_ROUTE_LEN_M) return null;

  // Anchor each turn to the nearest surviving sample (drops turns lost to the
  // capacity truncation).
  const turns: RouteTurn[] = [];
  for (const t of pending) {
    let best = -1;
    let bestD2 = 20 * 20;
    for (let i = 0; i < count; i++) {
      const dx = pts[i * 2] - t.x;
      const dy = pts[i * 2 + 1] - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best >= 0) {
      turns.push({ s: arc[best], x: t.x, y: t.y, side: t.side, dirX: t.dirX, dirY: t.dirY });
    }
  }
  turns.sort((a, b) => a.s - b.s);

  // Samples sit every DENSIFY_STEP_M of ROUNDED arclength, so the waypoint's
  // rounded arclength indexes straight into the final (smoothed) arc array.
  const splitSample = Math.max(
    0,
    Math.min(count - 1, Math.round(roundedSplitLen / DENSIFY_STEP_M)),
  );
  const goalS = splitIdx === undefined ? totalLen : arc[splitSample];

  return { pts, arc, count, totalLen, turns, goalS };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface DeriveRouteOptions {
  /**
   * The targets of objective n+1, n+2, … in order. The ribbon and its turn
   * chevrons run THROUGH the active waypoint into them, so the turn at the
   * junction is announced while the student is still approaching — doc 86 L5,
   * the founder's item 9 („зелената линия става надясно чак след като пресека
   * маркировката"). Legs are appended until a turn appears beyond the active
   * waypoint, or the chain / the metre budget runs out: ONE objective was not
   * enough, because on `sc-junction-stop` objective n+1 IS the stop line and
   * the turn lives one objective further (register B24/B6).
   *
   * A single target is accepted for the one-deep case. Null / absent = the old
   * behaviour, route ends at the active waypoint.
   */
  lookahead?: RouteTarget | readonly RouteTarget[] | null;
  /** Hard cap on the appended legs together, meters (default LOOKAHEAD_MAX_M). */
  lookaheadMaxM?: number;
}

/** The look-ahead chain as points, stopping at the first entry that has no
 *  coordinate to route to (an "ahead" objective ends the chain). */
function lookaheadPoints(
  spec: DeriveRouteOptions["lookahead"],
): { x: number; y: number }[] {
  if (!spec) return [];
  const list = Array.isArray(spec) ? spec : [spec as RouteTarget];
  const out: { x: number; y: number }[] = [];
  for (const t of list) {
    if (t.kind !== "point") break;
    // …and a ROUNDABOUT ISLAND ends it for the same reason an "ahead" does:
    // there is no coordinate to route to. A chain leg is a plain
    // `shortestPathRaw` to (x, y), so letting the island through drew the very
    // lap this file's ROUNDABOUT RIBBONS block exists to stop — one objective
    // early and in the dim look-ahead colour. On `sc-rb-lane-choice` the
    // objective BEFORE the maneuver is the north mouth, so its look-ahead leg
    // was the same ride past the west exit — measured 95.7 m of dim ribbon on
    // a 191.9 m route — drawn while the student was still being told to pass
    // the first two exits.
    if (t.leaveRadiusM !== undefined) break;
    out.push({ x: t.x, y: t.y });
    if (out.length >= LOOKAHEAD_MAX_LEGS) break;
  }
  return out;
}

/**
 * Derive the guidance route for one objective. Called on objective change
 * only — never per frame.
 */
export function deriveGuidanceRoute(
  graph: RouteGraph,
  start: { x: number; y: number; headingDeg: number },
  goal: RouteTarget | null,
  opts?: DeriveRouteOptions,
): DerivedRoute | null {
  if (!goal || graph.edges.length === 0) return null;
  const snap = snapToRoad(graph, start.x, start.y);
  if (!snap) return null;
  const chain = lookaheadPoints(opts?.lookahead);

  let raw: RawRoute | null;
  if (goal.kind === "ahead") {
    const walk = walkAheadRaw(graph, snap, start.headingDeg, goal.meters);
    // B1. The walk appends WHOLE edges, so an 80 m request came back as 176 m
    // of ribbon pointing at the end of the street. It is worth exactly the
    // distance it was asked for, plus two densify steps so it never ends on
    // the odometer mark itself.
    raw = walk ? trimRawTo(walk, goal.meters + AHEAD_OVERRUN_M) : null;
    // …and shorter still when the NEXT objective happens beside this corridor:
    // the ribbon must end where the task ends, not run past the parking bay.
    if (raw && chain.length > 0) {
      const hit = nearestOnRaw(raw, chain[0].x, chain[0].y);
      const floor = Math.max(AHEAD_TRIM_FLOOR_M, goal.meters - AHEAD_BUFFER_M);
      if (
        hit.latM <= AHEAD_NEXT_LATERAL_M &&
        hit.s >= floor &&
        hit.s < rawLength(raw) - DENSIFY_STEP_M
      ) {
        raw = trimRawTo(raw, hit.s);
      }
    }
    if (raw && raw.points.length < 2) raw = null;
  } else if (goal.leaveRadiusM !== undefined) {
    // A roundabout island is not a destination — see ROUNDABOUT RIBBONS.
    const enterRadiusM =
      goal.shape?.kind === "zone" ? goal.shape.radiusM : goal.leaveRadiusM;
    raw = ringRouteRaw(graph, snap, start, goal.x, goal.y, enterRadiusM, goal.leaveRadiusM);
  } else {
    const targetSnap = snapToRoad(graph, goal.x, goal.y);
    raw = targetSnap ? shortestPathRaw(graph, snap, targetSnap) : null;
  }
  if (!raw) return null;

  // Look-ahead legs. They continue from the active waypoint (a point goal) or
  // from wherever the "ahead" corridor now ends, and stop as soon as the turn
  // the student has to signal for is on the ribbon.
  let budget = opts?.lookaheadMaxM ?? LOOKAHEAD_MAX_M;
  let acc = raw;
  let splitIdx: number | undefined;
  // A ring goal's coordinates are the ISLAND, not the place this leg ends, so
  // a look-ahead leg must continue from where the ribbon actually stopped —
  // the same rule the "ahead" corridor already gets. (No shipped roundabout
  // objective has a successor today; it is written this way so that authoring
  // one cannot resurrect a leg drawn from the middle of the island.)
  let from =
    goal.kind === "point" && goal.leaveRadiusM === undefined
      ? { x: goal.x, y: goal.y }
      : { x: raw.points[raw.points.length - 1][0], y: raw.points[raw.points.length - 1][1] };
  for (const next of chain) {
    if (budget <= DENSIFY_STEP_M) break;
    const fromSnap = snapToRoad(graph, from.x, from.y);
    const toSnap = snapToRoad(graph, next.x, next.y);
    if (!fromSnap || !toSnap) break;
    // Same place — nothing to add, but the chain continues past it.
    if (fromSnap.edgeIdx === toSnap.edgeIdx && Math.abs(fromSnap.sM - toSnap.sM) < 1) {
      from = next;
      continue;
    }
    const cont = shortestPathRaw(graph, fromSnap, toSnap);
    if (!cont) break;
    const trimmed = trimRawTo(cont, budget);
    if (trimmed.points.length < 2) break;
    const joined = concatRaw(acc, trimmed);
    if (splitIdx === undefined) splitIdx = joined.splitIdx;
    budget -= rawLength(trimmed);
    acc = joined.raw;
    from = next;
    if (hasTurnBeyond(acc, splitIdx)) break;
  }
  // The ribbon must arrive in the lane the objective is in — see the block at
  // `alignRawToGoalLane`. Applied AFTER the look-ahead legs so the decay past
  // the goal eases those back onto the centreline they were derived on.
  // AUTHORED targets only. A `gate` goal's coordinates are not a lane the
  // lesson chose — they are the graded stop line slid sideways by the DRIVER'S
  // OWN measured offset (GATE_LATERAL_MAX_M above). Aligning the ribbon to
  // that would point it wherever the student already is, which on a keep-right
  // drill means endorsing the lane he was told to leave: guidance following
  // instead of leading, the same defect inverted. A `zone` goal's coordinates
  // are authored by the template, so they are the lane it means. A RING zone is
  // the exception among zones: its centre is the island, which is no lane at
  // all. The `LANE_ALIGN_MAX_M` bound already refused it (the ribbon rides
  // 17.85–25.78 m from the centre, an order of magnitude past two lane
  // pitches), so this is a statement of intent rather than a behaviour change.
  if (goal.kind === "point" && goal.shape?.kind !== "gate" && goal.leaveRadiusM === undefined) {
    splitIdx = alignRawToGoalLane(acc, goal.x, goal.y, splitIdx).splitIdx;
  }
  return finalizeRoute(acc, splitIdx);
}

// ---------------------------------------------------------------------------
// Per-frame helpers (allocation-free)
// ---------------------------------------------------------------------------

/** Arclength of the route sample nearest to (x, y) — the "head" the ribbon
 * fades around. Full scan over ≤1024 samples: trivial, zero allocation. */
export function nearestArcOnRoute(route: ArcSampledPath, x: number, y: number): number {
  const { pts, count } = route;
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < count; i++) {
    const dx = pts[i * 2] - x;
    const dy = pts[i * 2 + 1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return route.arc[best];
}

// ---------------------------------------------------------------------------
// THE RIBBON DOES NOT OWN THE PAINT AT A JUNCTION MOUTH EITHER
// ---------------------------------------------------------------------------
//
// THE FRAME (catalogue sweep 2026-08-17, `sc-sig-controller-live`, mobile/right
// — the only one of 24 combinations that produced evidence). `05-stopped.png`,
// crop [1080, 400 320×160] × 6: a регулировчик stands in the box with both arms
// out, the callout reads «СПРИ» — and the ribbon runs unbroken across the stop
// line, chevrons forward, into and through the junction he is closing. The same
// unbroken ribbon is in `04-t012s.png` and in `01-arrival.png`.
//
// MEASURED, on the recorded correct drive of that lesson (L1, sx-v1): when
// `sc-sctl-cross` goes live at t = 10.75 s the derived route is 84.31 m long
// and `goalS` is 10.00 — so 74 m of it, three quarters, is the look-ahead leg
// running THROUGH the junction, and the graded line it crosses at s ≈ 10.8 had
// nothing drawn at it at all.
//
// WHAT THIS IS AND IS NOT. The ribbon is a ROUTE, not a signal state: making it
// go dark because a controller has his arms out would put the light's state on
// the asphalt, which is a bigger lie than the one being fixed (and the
// look-ahead leg exists on purpose — register B24: the turn must be announced
// before the junction, not after the nose is in it). But the leg had no
// business being painted OVER the paint. `STOP_LINE_WIDTH_M` is 0.8 m of М7 bar
// at MARKING_Y = 0.032, under an ADDITIVELY blended ribbon at RIBBON_Y = 0.045 —
// the identical mechanism as the zebra below, at the identical two centimetres
// of separation.
//
// AND THE MOUTH'S PAINT IS NOT THE SAME DEPTH ON EVERY ARM. `markings.ts` adds
// the М8 give-way triangles — a further `GIVE_WAY_TRIANGLE_SETBACK_M +
// GIVE_WAY_TRIANGLE_LENGTH_M` = 8.4 m back from the bar — in the giveWayEdges
// branch ONLY. A signalised arm like this one, and a Б2 „Стоп" arm, carry the
// bar and nothing else. The first version of this mute took the give-way depth
// off every arm, i.e. 8 m of dark ribbon over bare asphalt at every light in
// the catalogue; `stopLineMuteBeforeM` is where that is now decided, from the
// line's own `control`.
//
// So the ribbon goes quiet over the mouth's paint, exactly as it already does
// over a zebra: there IS a change of state at the line, it is the line's own
// paint that carries it, and the leg beyond still announces the turn.
//
// ---------------------------------------------------------------------------
// THE RIBBON DOES NOT OWN THE ZEBRA
// ---------------------------------------------------------------------------
//
// THE FRAME. `scratchpad/lessons/sc-zebra-approach/landscape-13-phase-stopped-
// before-zebra.png`, cropped [200, 380 1100×420] × 2 — the student is stopped
// at the crossing, the advisor card says «Изчакай човекът да освободи платното»,
// and the guidance ribbon runs straight over the crossing with its chevrons
// pointing forward. The founder read it as a contradiction on the glass, and it
// is one; but the crop shows something narrower and worse that is not a matter
// of taste at all:
//
//   the ribbon is ADDITIVELY BLENDED (RIBBON_FRAG, `THREE.AdditiveBlending`) at
//   RIBBON_Y = 0.045, and the zebra's bars are painted at MARKING_Y = 0.032.
//   Where the two meet the bars are washed teal and their edges disappear.
//
// So on `sc-zebra-approach` — the drill whose entire objective is „видиш ли
// пешеходната пътека, вдигни крака от газта" — the HUD is painting over the
// marking the lesson exists to teach the student to SEE. That is the same
// defect as register B24/B27 („the marker curtain occludes the very left-right
// scan the lesson exists to teach"), in a different surface.
//
// The ribbon therefore stops at a marked crossing and starts again past it.
// Nothing is invented: the span comes from `district.crossings`, the same list
// `markings.ts` paints the zebra from and the same one the rule engine's
// CrossingZoneTracker grades on, so the gap in the ribbon is exactly the ground
// the bars occupy. The route, the acceptance radii and the grading are all
// untouched — this changes what is DRAWN over 8 m of asphalt, nothing else.

/**
 * Half-length of the quiet span, m. The painted zebra is ~4 m of bars deep
 * (`ZEBRA_*` in builders/constants.ts) and the ribbon has to be clear of them
 * rather than tangent, so 4 m either side leaves the bars with a metre of
 * unlit asphalt around them at the perceptual road scale.
 */
export const CROSSING_MUTE_HALF_M = 4;

/**
 * How far off the route a crossing or a stop line may sit and still count, m. A
 * crossing on the parallel street is not on this route; one on the route's own
 * edge is within half a carriageway of it even where the ribbon rides a lane
 * offset.
 */
const MUTE_MAX_OFFSET_M = LANE_WIDTH_M;

/**
 * The quiet span at a junction mouth, m, measured from the LINE'S OWN CENTRE
 * (`paintedLinesFor` / `runtime/stoplines.ts` both anchor on the bar's centre).
 *
 * BEFORE: whatever the world actually paints on the approach — and that is TWO
 * different depths, which is what this pair exists to keep straight. See the
 * block on `STOP_LINE_MUTE_BEFORE_GIVE_WAY_M` below.
 * AFTER: half the М7 bar (`STOP_LINE_WIDTH_M` / 2) and the same one metre of
 * unlit asphalt `CROSSING_MUTE_HALF_M` leaves around a zebra's bars. The span
 * stops there on purpose: past the line is the junction box, and a ribbon that
 * went dark across the whole box would be answering „is it my turn" — a
 * question the route layer must never appear to answer.
 */
export const STOP_LINE_MUTE_AFTER_M = STOP_LINE_WIDTH_M / 2 + 1;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW FAR BACK THE MUTE REACHES DEPENDS ON WHAT IS PAINTED THERE — 2026-08-18.
 *
 * ONE NUMBER SHIPPED FOR ALL THREE CONTROLS AND IT WAS THE GIVE-WAY ONE. The
 * М18 triangles are the deepest thing the world paints on an approach — base
 * `GIVE_WAY_TRIANGLE_SETBACK_M` (3.0 m) before the bar, apex a further
 * `GIVE_WAY_TRIANGLE_LENGTH_M` (5.4 m) out — so 8.4 m of paint, plus a metre of
 * clearance. But `markings.ts` paints them in exactly one branch:
 *
 *     if (node.signalized || stopSignEdges.has(key))  paintStopLine(ap, false)
 *     else if (giveWayEdges.has(key))                 paintStopLine(ap, true)
 *                                                     paintGiveWayTriangles(ap)
 *
 * — so a SIGNALISED arm and a Б2 „Стоп" arm get one 0.8 m bar and no symbol at
 * all, while the mute took 9.4 m off the ribbon in front of them. 9.4 − 1.4 =
 * 8.0 m, and on sx-v1's signalised crossroads — the map `sc-sig-controller-live`
 * runs on, and the only junction `guidance-stopline-mute.test.ts` ever measured
 * — every metre of that is bare asphalt. That is precisely the failure this
 * function's own guards are written against, quoted from the one 20 lines down:
 * „a gap with no cause is the thing this function exists to avoid."
 *
 * `GuidanceStopLine` has carried `control` since it was written; the mute loop
 * simply never read it. It does now, and the two lengths are derived from the
 * two branches above rather than chosen.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/** The М18 triangles' own depth plus a metre — a Б1 give-way arm, and only it. */
export const STOP_LINE_MUTE_BEFORE_GIVE_WAY_M =
  GIVE_WAY_TRIANGLE_SETBACK_M + GIVE_WAY_TRIANGLE_LENGTH_M + 1;
/** Half the М7 bar plus a metre — a signalised or Б2-controlled arm, where the
 *  bar is the whole of the paint. Symmetric with `STOP_LINE_MUTE_AFTER_M`,
 *  which is the same half-bar measured the other way. */
export const STOP_LINE_MUTE_BEFORE_BAR_M = STOP_LINE_WIDTH_M / 2 + 1;

/** …resolved for one line. The default is the BAR, not the triangles: a control
 *  this switch has never heard of paints no symbol we know about, and the
 *  conservative answer to „what is drawn here" is „the line itself". */
export function stopLineMuteBeforeM(control: GuidanceStopLine["control"]): number {
  return control === "giveWay" ? STOP_LINE_MUTE_BEFORE_GIVE_WAY_M : STOP_LINE_MUTE_BEFORE_BAR_M;
}

/**
 * Direction agreement required between the ribbon and a line's own travel
 * direction before that line is treated as being ON this route. Same number and
 * same meaning as `APPROACH_ALIGN_DOT` above: the cross-street's Б2 at the same
 * junction is not this driver's paint, and blanking his ribbon for it would be
 * a gap with no cause — the exact failure `crossingMuteSpans` already refuses
 * for a crossing on the parallel street.
 */
const MUTE_ALONG_DOT = 0.5;
/** Window the ribbon's own direction is measured over at a mute candidate, m —
 *  one densify step either side, so a corner does not read as a reversal. */
const MUTE_DIR_WINDOW_M = DENSIFY_STEP_M;

/** Most spans the shader carries. Four markings on one derived route is more
 *  than any district in the catalogue puts on a single objective's leg; past
 *  that the nearest ones win, because they are the ones on the glass.
 *
 *  ── AND „NEAREST" MEANS SOMETHING ELSE TO THE SECOND CALLER. Raised by the
 *  round-11 verifier and recorded here rather than in a report, because the
 *  sentence above is the thing that stops being true. It rests on s = 0 being
 *  the CAR, which holds for a `deriveGuidanceRoute` route: the route is rebuilt
 *  from the car's pose, so the four kept spans are the four ahead of him. On
 *  `ShadowCar`'s `tracePathForRibbon` polyline s = 0 is the TRACE'S START and
 *  never moves, so the four kept spans are the first four ALONG THE DEMO PATH,
 *  which are the four nearest the beginning of the demonstration and not the
 *  four in view.
 *
 *  MEASURED, not assumed: the map that row was filed on — `content/world/
 *  pe-dart-v1.json` — carries exactly one crossing (`pe-x-1` at (0, 80)) and no
 *  controlled nodes, so it yields one span and the cap is never reached. It is
 *  not a regression either way; before this round that ribbon muted over
 *  nothing at all. But on any district that paints more than four crossings and
 *  stop lines under one demo trace, the later ones stay unpainted-over
 *  permanently, and whoever raises this number or reaches for a „nearest the
 *  ghost" variant should know the fix is partial in that general case. */
export const CROSSING_MUTE_MAX_SPANS = 4;

/**
 * ── THE SHADER'S HALF OF THE SPAN CONTRACT, AND WHY IT LIVES HERE ──────────
 * These two were module-private in `components/sim/RouteGuidance.tsx` while
 * that was the only ribbon that muted. `ShadowCar.tsx` now reads the same spans
 * for the demonstration path, and a second copy of a number is how the dial
 * numerals shipped at a third of their reviewed size — so the table is one
 * table. Nothing about either value changed in the move.
 */
/** Ramp length at each end of a quiet span, m. */
export const MUTE_EDGE_M = 1.2;
/**
 * Sentinel for an unused mute slot — far past any path this product draws
 * (LOOKAHEAD_MAX_M is 170 m and the longest single leg is EMERGENCY_AHEAD_M at
 * 150), and deliberately NOT 1e9: the shader evaluates
 * `smoothstep(s − MUTE_EDGE_M, s, vS)` on every slot, and at 1e9 a float32
 * cannot represent the 1.2 m offset, so edge0 == edge1 and the smoothstep
 * divides by zero. 1e6 keeps the two edges distinct with six digits to spare.
 */
export const MUTE_UNUSED_S = 1e6;

/** The ribbon's own travel direction at arclength `s`, unit — two clamped
 *  `routePointAt` reads into points the caller owns. Unlike everything under
 *  „per-frame helpers" above, this one runs on OBJECTIVE CHANGE only (it has a
 *  single caller), so the returned pair is allocated rather than written out. */
function routeDirAtArc(
  route: ArcSampledPath,
  s: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } | null {
  routePointAt(route, s - MUTE_DIR_WINDOW_M, a);
  routePointAt(route, s + MUTE_DIR_WINDOW_M, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len > EPS ? { x: dx / len, y: dy / len } : null;
}

/**
 * Arclength spans of `route` the ribbon must not paint over: the marked
 * pedestrian crossings on it, and the stop / give-way / traffic-light paint at
 * every junction mouth it drives across (see the two section headers above —
 * one mechanism, two surfaces, both of them a lesson's own teaching object).
 *
 * Nothing here is invented. The crossings come from `district.crossings`, the
 * list `markings.ts` paints the zebra from and `CrossingZoneTracker` grades on;
 * the lines come from `stopLinesForGuidance`, the same set every marker in this
 * module resolves against (and memoized on the same district object the caller
 * already passed to it, so this costs a WeakMap hit).
 *
 * Returned sorted by arclength and capped at CROSSING_MUTE_MAX_SPANS, so the
 * consumer can write them straight into a fixed-size uniform. Sorted-then-
 * sliced means the spans that survive are the NEAREST ones — the ones on the
 * glass while the route is fresh.
 */
export function crossingMuteSpans(
  route: ArcSampledPath | null,
  district: RouteDistrictLike | null | undefined,
): Array<[number, number]> {
  if (!route || !district) return [];
  const out: Array<[number, number]> = [];
  const at = { x: 0, y: 0 };
  const scratch = { x: 0, y: 0 };
  for (const c of district.crossings ?? []) {
    // Only crossings that are actually PAINTED: an unmarked one has no bars to
    // wash out, and breaking the ribbon there would be a gap with no cause.
    if (!paintsZebra(c)) continue;
    const s = nearestArcOnRoute(route, c.x, c.y);
    routePointAt(route, s, at);
    if (Math.hypot(at.x - c.x, at.y - c.y) > MUTE_MAX_OFFSET_M) continue;
    out.push([s - CROSSING_MUTE_HALF_M, s + CROSSING_MUTE_HALF_M]);
  }
  const back = { x: 0, y: 0 };
  for (const line of stopLinesForGuidance(district)) {
    const near = nearestArcOnRoute(route, line.x, line.y);
    routePointAt(route, near, at);
    if (Math.hypot(at.x - line.x, at.y - line.y) > MUTE_MAX_OFFSET_M) continue;
    // …and the student must be driving ACROSS it, not past the mouth of the
    // side street it belongs to.
    const dir = routeDirAtArc(route, near, back, scratch);
    if (!dir || dir.x * line.dirX + dir.y * line.dirY < MUTE_ALONG_DOT) continue;
    // `nearestArcOnRoute` returns a SAMPLE's arclength, so it is quantized to
    // DENSIFY_STEP_M — up to 1.25 m of error, which the zebra's ±4 m span
    // absorbs and a 1.4 m tail past a stop bar does not. Project the line onto
    // the ribbon's own direction to recover the sub-sample arclength.
    const s = near + (line.x - at.x) * dir.x + (line.y - at.y) * dir.y;
    // A line the ribbon does not actually run over: already behind its head
    // (the re-derivation at a Б2 leaves the bar under the nose), or past its
    // tail. Either way there is no ribbon on that paint to take off it, and a
    // gap with no cause is the thing this function exists to avoid.
    if (s < -PAST_LINE_TOLERANCE_M || s > route.totalLen) continue;
    // …and the span is as deep as the PAINT on this particular arm, which is
    // decided by its control and by nothing else (see `stopLineMuteBeforeM`):
    // only a Б1 give-way arm carries the М18 triangles, so only it is worth
    // 9.4 m. A signalised or Б2 arm is one 0.8 m bar and takes 1.4.
    out.push([s - stopLineMuteBeforeM(line.control), s + STOP_LINE_MUTE_AFTER_M]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, CROSSING_MUTE_MAX_SPANS);
}

/** Point at arclength `s` (clamped), written into `out` — zero allocation. */
export function routePointAt(
  route: ArcSampledPath,
  s: number,
  out: { x: number; y: number },
): void {
  const { arc, pts, count } = route;
  const ss = Math.max(0, Math.min(route.totalLen, s));
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= ss) lo = mid;
    else hi = mid;
  }
  const span = arc[hi] - arc[lo];
  const t = span > 0 ? (ss - arc[lo]) / span : 0;
  out.x = pts[lo * 2] + t * (pts[hi * 2] - pts[lo * 2]);
  out.y = pts[lo * 2 + 1] + t * (pts[hi * 2 + 1] - pts[lo * 2 + 1]);
}
