/**
 * ROUTE FINISH GATE — „стигнах до края, а изпитът не спира" (founder report,
 * 2026-07-28).
 *
 * THE BUG THIS EXISTS FOR. Objectives are strictly sequential (objectives.ts):
 * only the ACTIVE one advances, and the session used to end on exactly one
 * condition — `currentObjectiveIndex >= objectives.length`, i.e. EVERY
 * objective satisfied. An objective the student drove past therefore never
 * completes and never yields: the chain stalls on it forever, the guidance
 * ribbon keeps pointing BACK to it, and the drive cannot end. A student who
 * made mistakes had to re-drive the whole route correctly before he was
 * allowed to find out what the mistakes were. That is backwards — the debrief
 * IS the teaching, and it must be reachable by the student who needs it most.
 *
 * THE RULE. Reaching the end of the route ENDS the drive, driven well or
 * driven badly. This module derives WHERE that end is (the terminal target of
 * the LAST objective — the point the guidance ribbon ends at, see
 * scene/guidanceRoute.ts `guidanceGoalFor`) and folds the per-tick arrival
 * test that trips it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It does not touch grading. Nothing here emits, suppresses or reweights a
 *    single ScorableEvent; it decides WHEN the session stops, never WHAT
 *    counts as a fault. A drive that ends here ends with its objectives
 *    honestly marked incomplete — including the final one, which is ARRIVED
 *    AT, not performed (a car that rolls up beside the bay has not parked) —
 *    so `buildLessonResult` reports it as FINISHED-but-NOT-PASSED
 *    (completedAll === false ⇒ passed === false). Finishing and passing stay
 *    two different things.
 *  - It never arms while the chain is healthy. The engine consults the gate
 *    ONLY while the active objective is not yet the final one — the stalled
 *    case. A run that progresses normally reaches the last objective and
 *    terminates through the pre-existing path, bit-identically: L7 still has
 *    to park, L3 still has to come out of the roundabout, a clean exam still
 *    ends on its own last objective. And a stalled run is ALREADY unpassable,
 *    so ending it early costs the student nothing but the walk back.
 *  - It only anchors on targets a student ARRIVES at (reachZone / passSignal /
 *    a painted parking bay). Maneuver objectives whose target is the place the
 *    WORK happens — a roundabout island, a three-point-turn corridor — are not
 *    finish anchors: arriving there begins the task, it does not end the route.
 *
 * Pure and deterministic, like every other fold in this module: no clock, no
 * randomness, same state + same tick ⇒ same output.
 */

import type { SimTick } from "../rules";
import type { FinishGateState, ObjectiveParams, RouteFinishZone } from "./types";

/**
 * Arrival radius for a bay finish, meters — before the clamp below. A bay is a
 * point target: the painted L7/exam rect is 3.0 × 6.6 m, and a student who
 * rolls up beside it from the carriageway HAS reached the end of the route
 * even though his centre never entered the paint. 14 m is wider than any
 * carriageway on the shipped maps and far narrower than the gap to the
 * previous waypoint on a street route (the exam's last checkpoint sits 62 m
 * short of its bay).
 */
export const FINISH_BAY_RADIUS_M = 14;

/**
 * Radius floor, meters. Below this a "zone" is smaller than the car and the
 * gate would be unreachable noise — the route simply gets no automatic finish
 * and the sequential chain stays its only termination path.
 */
export const FINISH_MIN_RADIUS_M = 2.5;

/**
 * Continuous seconds inside a CROSSED finish (a waypoint) before it trips.
 * Not a dwell requirement — a glitch guard: one stray frame (a physics pop, a
 * respawn) must not end a session, while a car genuinely at the end of the
 * route is inside for far longer than this even at speed.
 */
export const FINISH_DWELL_S = 0.5;

/**
 * A bay finish is an ARRIVAL, not a crossing: it trips only after the car has
 * stood still (|v| ≤ FINISH_REST_KMH) inside the zone for FINISH_REST_S
 * continuous seconds.
 *
 * This is not caution for its own sake — the shipped parallel-park drill
 * proves it. Its route drives FORWARD PAST the bay at ~10 km/h to reach the
 * pull-up pose beside the lead car, and only then reverses in; the car is
 * within a few metres of the bay centre a full two seconds before it has even
 * reached the objective that precedes the park. Passing a bay is not arriving
 * at one. Standing still in it is. FINISH_REST_S is twice the authored park
 * hold (1.5 s), so a creep-and-shuffle inside the bay never reads as an end.
 */
export const FINISH_REST_KMH = 3;
export const FINISH_REST_S = 3;

interface Point {
  x: number;
  y: number;
}

/** Where an objective happens, for any objective that happens SOMEWHERE. */
function targetPoint(params: ObjectiveParams): Point | null {
  switch (params.kind) {
    case "reachZone":
    case "passSignal":
      return { x: params.x, y: params.y };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (params.maneuver) {
        case "parkInBay":
          return { x: params.bay.x, y: params.bay.y };
        case "roundabout":
          return { x: params.x, y: params.y };
        case "threePointTurn":
          return { x: params.corridor.x, y: params.corridor.y };
        case "smoothStop":
        case "emergencyStop":
          return null;
      }
  }
}

/** The terminal objective's zone BEFORE clamping — null when it is not an
 *  arrival at all (a distance to cover, a stop to perform, work to do). */
function finishAnchor(params: ObjectiveParams): RouteFinishZone | null {
  switch (params.kind) {
    case "reachZone":
      // A waypoint is CROSSED, on exactly the terms it was authored with: the
      // gate mirrors the objective's own ARRIVAL criteria (its radius and, when
      // the author demanded one, its arrival speed cap) and drops only the work
      // that would have to happen afterwards. sc-fo-motorway-gap is why the cap
      // matters — its terminal waypoint says „спри зад спирачещия" at ≤ 8 km/h,
      // and a car still doing 130 through it has not arrived, it is about to
      // crash into the lead car. Ending there would have erased the ПТП.
      return {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        dwellSec: FINISH_DWELL_S,
        ...(params.maxSpeedKmh !== undefined ? { maxSpeedKmh: params.maxSpeedKmh } : {}),
      };
    case "passSignal":
      return { x: params.x, y: params.y, radiusM: params.radiusM, dwellSec: FINISH_DWELL_S };
    case "driveDistance":
      return null;
    case "completeManeuver":
      // The bay is the one maneuver target that IS the end of the road: every
      // route ending in a park ends AT it (L7, the полигон drill, every
      // exam-bank shell). The others are worked through, not arrived at.
      return params.maneuver === "parkInBay"
        ? {
            x: params.bay.x,
            y: params.bay.y,
            radiusM: FINISH_BAY_RADIUS_M,
            dwellSec: FINISH_REST_S,
            maxSpeedKmh: FINISH_REST_KMH,
          }
        : null;
  }
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Where this route ENDS, or null when it has no automatic finish.
 *
 * Null happens for three honest reasons: a single-objective route (the
 * objective IS the route — there is no earlier task to stall on), a terminal
 * objective with nowhere to arrive (drive N metres, stop smoothly, brake for
 * the hazard, work the roundabout), or a route so compact that the clamp below
 * leaves no usable zone.
 *
 * THE CLAMP is what makes one rule fit both a 2.5 km exam route and a 20 m
 * parking-lot drill. The zone is shrunk to at most HALF the distance to every
 * earlier located waypoint, so a finish can never swallow the leg before it:
 * on the city exam nothing binds (the nearest earlier waypoint is 62 m away,
 * half of that is 31 m, the bay radius stays 14 m), while in the parallel-park
 * lot — pull-up pose at (0, 6), bay at (6.28, 0), 8.7 m apart — the same rule
 * tightens the finish to 4.3 m, i.e. essentially "in the bay". Self-tuning,
 * with no per-lesson authoring and no map knowledge.
 */
export function routeFinishZone(objectives: readonly ObjectiveParams[]): RouteFinishZone | null {
  if (objectives.length < 2) return null;

  const anchor = finishAnchor(objectives[objectives.length - 1]);
  if (anchor === null) return null;

  let radiusM = anchor.radiusM;
  for (let i = 0; i < objectives.length - 1; i++) {
    const prev = targetPoint(objectives[i]);
    if (prev === null) continue;
    radiusM = Math.min(radiusM, dist(anchor, prev) / 2);
  }
  if (radiusM < FINISH_MIN_RADIUS_M) return null;
  return { ...anchor, radiusM };
}

/** Fresh gate: disarmed, outside, untripped. */
export function createFinishGate(): FinishGateState {
  return { armed: false, insideSinceSec: null, reachedAtSec: null };
}

/**
 * Advance the gate by one frame.
 *
 * ARMING. A lesson may SPAWN inside its own finish zone (a lot drill can begin
 * a few metres from the bay it ends in). The gate therefore stays disarmed
 * until the vehicle has been observed OUTSIDE the zone at least once — you
 * cannot arrive somewhere you never left. Arming is geometry only: leaving the
 * zone at any speed arms it.
 *
 * TRIPPING. Once armed, `zone.dwellSec` continuous seconds of QUALIFYING
 * presence — inside the zone, and at/below `zone.maxSpeedKmh` when the zone
 * demands a stop — latch `reachedAtSec`. Any disqualifying frame restarts the
 * count. The latch is permanent: the engine ends the session on that same
 * frame, and nothing can un-finish a finished drive.
 */
export function stepFinishGate(
  prev: FinishGateState,
  zone: RouteFinishZone,
  tick: SimTick,
): FinishGateState {
  if (prev.reachedAtSec !== null) return prev;

  const inside = dist(tick.position, zone) <= zone.radiusM;

  if (!inside) {
    // Being outside is what arms the gate, and it clears any partial dwell.
    return prev.armed && prev.insideSinceSec === null
      ? prev
      : { armed: true, insideSinceSec: null, reachedAtSec: null };
  }

  if (!prev.armed) return prev; // still sitting where the drive started

  // Inside, but rolling through a zone that asks to be stopped in: present,
  // not arrived. (Reverse reads negative — compare the magnitude.)
  if (zone.maxSpeedKmh !== undefined && Math.abs(tick.speedKmh) > zone.maxSpeedKmh) {
    return prev.insideSinceSec === null
      ? prev
      : { armed: true, insideSinceSec: null, reachedAtSec: null };
  }

  const since = prev.insideSinceSec ?? tick.t;
  if (tick.t - since >= zone.dwellSec) {
    return { armed: true, insideSinceSec: since, reachedAtSec: tick.t };
  }
  return prev.insideSinceSec === since
    ? prev
    : { armed: true, insideSinceSec: since, reachedAtSec: null };
}
