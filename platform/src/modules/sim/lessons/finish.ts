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
 *  - It never arms while the chain is healthy. A run that progresses normally
 *    reaches the last objective and terminates through the pre-existing path,
 *    bit-identically: L7 still has to park, L3 still has to come out of the
 *    roundabout, a clean exam still ends on its own last objective.
 *
 * ---------------------------------------------------------------------------
 * 2026-07-30 — B1/B2/B3 (doc 86 §3). The gate shipped correct and INCOMPLETE:
 * three different causes still stranded students, and the founder's most
 * repeated complaint („the only solution was refreshing the entire webpage")
 * was all three at once. None of them is a bug in the rule above; each is a
 * place the rule was not reachable.
 *
 *  B1 — TEN routes had no anchor at all. `finishAnchor` returned a zone only
 *  for `parkInBay`; every other terminal maneuver returned null, so six
 *  roundabout drills and four turn drills had NO termination path whatsoever
 *  — not a hard one, none. The premise ("a maneuver target is where the WORK
 *  happens, so arriving there is not an ending") was right; the conclusion was
 *  wrong. The ending is not the island — it is having LEFT the island. Those
 *  anchors are now `mode: "outside"`: armed by reaching the ring/corridor,
 *  tripped by driving away from it. Standing still in the middle of the work
 *  can never end a drive, and finishing the work and leaving always can.
 *
 *  B2 — the rescue was disarmed on the FINAL objective (`engine.ts` consulted
 *  it only while `currentIndex < objectives.length - 1`), which is precisely
 *  where a student is most likely to be stuck: the last gate is the one with
 *  nothing after it to walk to. It is armed there now, through a SEPARATE
 *  derivation (`terminalRescueZone`) rather than the same zone, because the
 *  two situations need different evidence. A stalled chain is proven by the
 *  car being where the route ends. A stuck TERMINAL objective is proven by the
 *  car being there AND STANDING COMPLETELY STILL for FINISH_STUCK_S — the one
 *  signal no legitimate approach, creep, shuffle or red-light wait produces
 *  while it is still going somewhere. Without that distinction the rescue
 *  would eat the very lessons it is meant to save: a candidate lining up 10 m
 *  short of the exam bay, or a beginner pausing mid-park to think.
 *
 *  B3 — the rescue inherited the terminal objective's deliberately
 *  lane-exclusive radius. Templates author radius 4–6 so the gate is
 *  satisfiable only from the correct lane; the rescue copied that, so a car
 *  one lane over at the end of the route (8.13 m — the taught mistake of
 *  `sc-ln-boulevard-discipline` puts it exactly there) missed the escape by
 *  centimetres. The rescue radius now has a FLOOR of FINISH_LANE_FLOOR_M,
 *  applied before the half-distance clamp, and the terminal rescue skips the
 *  clamp entirely — by then every earlier leg is already complete, so there is
 *  no leg left for the finish to swallow.
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

/**
 * B3 — radius FLOOR of a rescue zone, meters. The lane pitch on every shipped
 * map is 8.125 m (LANE_WIDTH_M × the 2.5× perceptual exaggeration), so a
 * terminal objective authored at radius 4–6 is satisfiable only from ONE lane
 * — which is the point of the objective and the ruin of the rescue that
 * copied it. 9 m is the pitch plus 0.875 m of margin, deliberately not the
 * pitch itself: a car sitting in the adjacent lane is exactly 8.125 m away
 * and has to be strictly INSIDE the escape, not balanced on its edge.
 * (`sc-ln-decisive-change`'s final gate is radius 8 against that same pitch —
 * it missed by 0.13 m. `sc-ln-boulevard-discipline`'s taught left-lane hog
 * sits 8.13 m from a radius-4 gate.)
 *
 * The floor never loosens GRADING: the objective keeps its authored radius.
 * It only widens the door out of a lesson that is already unpassable.
 */
export const FINISH_LANE_FLOOR_M = 9;

/**
 * B2 — a TERMINAL objective is only proven stuck by a full standstill, held
 * this long. Anything shorter is a normal part of driving: a candidate lines
 * up for the exam bay, a beginner pauses mid-shuffle to work out the wheel, a
 * student stops to read the banner. Twelve seconds motionless at the end of
 * the route, with the task still not done, is not any of those.
 */
export const FINISH_STANDSTILL_KMH = 1;
export const FINISH_STUCK_S = 12;

/**
 * The same evidence, but for an anchor where MANEUVERING is the task — a
 * parking bay. Twelve seconds is unambiguous at a waypoint, where there is
 * nothing to do but arrive; it is not unambiguous beside a bay, where a
 * beginner works the wheel in stop-start shunts and an exam candidate stops
 * to plan the whole reverse before touching anything. Twenty-five seconds
 * completely motionless with the park still unfinished is not planning.
 *
 * The margin against a correct park is 16×: `parkInBay` completes after
 * `holdSec` (1.5 s default) at rest in the rect, so a student who is actually
 * parking always finishes first, by a wide margin, every time.
 */
export const FINISH_BAY_STUCK_S = 25;

/**
 * B1 — an "outside" (leave-the-work-site) finish trips after this many
 * continuous seconds away from the ring/corridor. It is long on purpose: an
 * unsignalled roundabout exit voids the traversal (objectives.ts), and the
 * student who realises it immediately must have room to swing back and redo
 * the ring rather than have the lesson closed under them. Twenty seconds is
 * ~150 m at drill speed — past that, the drive is over and the debrief is the
 * better use of the student's time.
 */
export const FINISH_LEAVE_S = 20;

/**
 * Margin added to a turn corridor's circumradius before "away" counts, m.
 * Shuffling at the corner of the box must never read as leaving it.
 */
export const FINISH_CORRIDOR_MARGIN_M = 8;

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

/**
 * The terminal objective's zone BEFORE clamping — null only when the route
 * genuinely ends nowhere (a distance to cover, a stop to perform anywhere).
 *
 * `forRescue` asks for the anchor's OTHER face: the same place, but with the
 * evidence a stuck TERMINAL objective needs instead of the evidence a stalled
 * chain needs (see `terminalRescueZone`). An "outside" anchor has only one
 * face — leaving the work site already proves the work is over — so the flag
 * does nothing there.
 */
function finishAnchor(params: ObjectiveParams, forRescue = false): RouteFinishZone | null {
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
        dwellSec: forRescue ? FINISH_STUCK_S : FINISH_DWELL_S,
        terminalRescue: true,
        ...(forRescue
          ? { maxSpeedKmh: FINISH_STANDSTILL_KMH }
          : params.maxSpeedKmh !== undefined
            ? { maxSpeedKmh: params.maxSpeedKmh }
            : {}),
      };
    case "passSignal":
      // A junction is passed THROUGH, not stopped at — so the end of a route
      // that finishes on one is the far side of it, not the box. The shape
      // matters for more than tidiness: an inside-zone here would trip while a
      // student sits at a red he is legally required to wait out, and closing
      // a lesson on a driver doing exactly the right thing is the worst
      // failure this module can produce.
      //
      // `requireRedMet` junctions (l2-intersections) opt OUT of the terminal
      // rescue entirely: that gate is designed to be retried on the spot —
      // every light shows red 26 s of every 50 s, so re-approaching and
      // waiting one out always works (objectives.ts stepPassSignal), and a
      // rescue would close the lesson during the retry it prescribes.
      return {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        dwellSec: FINISH_LEAVE_S,
        mode: "outside",
        terminalRescue: params.requireRedMet !== true,
      };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (params.maneuver) {
        case "parkInBay":
          // The bay is the one maneuver target that IS the end of the road:
          // every route ending in a park ends AT it (L7, the полигон drill,
          // every exam-bank shell). Its rescue face is the strictest one in
          // the module — FINISH_BAY_STUCK_S motionless — because this is the
          // anchor where being present, slow and unfinished is what CORRECT
          // driving looks like for the whole minute before the park lands.
          return {
            x: params.bay.x,
            y: params.bay.y,
            radiusM: FINISH_BAY_RADIUS_M,
            dwellSec: forRescue ? FINISH_BAY_STUCK_S : FINISH_REST_S,
            maxSpeedKmh: forRescue ? FINISH_STANDSTILL_KMH : FINISH_REST_KMH,
            terminalRescue: true,
          };
        case "roundabout":
          // B1. Six drills ended here with no finish at all. The route does
          // not end at the island — it ends when the ring is BEHIND you.
          // Armed by entering (`enterRadiusM`, the objective's own threshold),
          // tripped by being clear of `exitRadiusM` for FINISH_LEAVE_S. A car
          // circulating, hesitating or stopped on the ring can never trip it.
          return {
            x: params.x,
            y: params.y,
            radiusM: params.exitRadiusM,
            armWithinM: params.enterRadiusM,
            dwellSec: FINISH_LEAVE_S,
            mode: "outside",
            terminalRescue: true,
          };
        case "threePointTurn": {
          // B1, same shape: four turn drills had no finish. The corridor is
          // the work box; the route ends when the car has driven out of it,
          // turn completed or turn abandoned. Circumradius so leaving in ANY
          // direction counts, plus a margin so a shunt at the box corner does
          // not read as departure.
          const { corridor } = params;
          return {
            x: corridor.x,
            y: corridor.y,
            radiusM:
              Math.hypot(corridor.halfWidthM, corridor.halfLengthM) + FINISH_CORRIDOR_MARGIN_M,
            armWithinM: Math.min(corridor.halfWidthM, corridor.halfLengthM),
            dwellSec: FINISH_LEAVE_S,
            mode: "outside",
            terminalRescue: true,
          };
        }
        case "smoothStop":
        case "emergencyStop":
          // Genuinely placeless: „stop smoothly" and „stop for the hazard"
          // happen wherever the road puts them. No anchor is derivable and
          // inventing one would end drives at an arbitrary coordinate.
          return null;
      }
  }
}

/** Clamp an "outside" anchor's arming radius into its own zone. */
function normalizeOutside(zone: RouteFinishZone): RouteFinishZone {
  const armWithinM = Math.min(zone.armWithinM ?? zone.radiusM, zone.radiusM);
  return { ...zone, armWithinM };
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

  // An "outside" anchor is a departure threshold, not an arrival circle:
  // shrinking it would make leaving EASIER, which is backwards, and there is
  // no earlier leg for it to swallow because it is satisfied by being away
  // from the route's end rather than at it. It ships unclamped.
  if (anchor.mode === "outside") return normalizeOutside(anchor);

  // B3: floor first, clamp second — the order matters and is the whole fix.
  // Flooring after the clamp would let a compact route re-narrow the escape;
  // flooring before it means the escape is one lane wide wherever the route
  // has room for it, and the clamp only bites where the previous waypoint is
  // genuinely close (where a wrong-lane car cannot be hiding anyway).
  let radiusM = Math.max(anchor.radiusM, FINISH_LANE_FLOOR_M);
  for (let i = 0; i < objectives.length - 1; i++) {
    const prev = targetPoint(objectives[i]);
    if (prev === null) continue;
    radiusM = Math.min(radiusM, dist(anchor, prev) / 2);
  }
  if (radiusM < FINISH_MIN_RADIUS_M) return null;
  return { ...anchor, radiusM };
}

/**
 * B2 — the escape for a student stuck ON the terminal objective, where the
 * `routeFinishZone` above deliberately does not reach (it exists to end a
 * chain stalled on an EARLIER task, and its evidence — "the car is where the
 * route ends" — is satisfied by every normal final approach).
 *
 * Null when the anchor opts out (`terminalRescue: false`) — today that is a
 * `requireRedMet` junction, whose retry is designed and feasible on the spot
 * and whose student is legitimately stationary while he waits the red out.
 *
 * For an "inside" anchor the rescue is the anchor with two changes:
 *  - the half-distance clamp is DROPPED. Every earlier leg is complete by
 *    definition here, so there is nothing left for the finish to swallow —
 *    which is what lets the FINISH_LANE_FLOOR_M floor survive on a compact
 *    route, and the floor is the entire point (B3);
 *  - presence is replaced by a full STANDSTILL, held FINISH_STUCK_S at a
 *    waypoint and FINISH_BAY_STUCK_S beside a bay. That is the only
 *    observable that separates "stuck" from "still driving this": an
 *    approach, a creep toward the mark and a park shuffle all keep moving,
 *    and a red-light wait ends by itself.
 *
 * An "outside" anchor needs neither change — leaving the work site already
 * means the work is over — so it is returned as-is.
 */
export function terminalRescueZone(
  objectives: readonly ObjectiveParams[],
): RouteFinishZone | null {
  if (objectives.length < 1) return null;

  const anchor = finishAnchor(objectives[objectives.length - 1], true);
  if (anchor === null || anchor.terminalRescue !== true) return null;
  if (anchor.mode === "outside") return normalizeOutside(anchor);

  return { ...anchor, radiusM: Math.max(anchor.radiusM, FINISH_LANE_FLOOR_M) };
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
 * until the vehicle has been observed on the OTHER side of the threshold at
 * least once — you cannot arrive somewhere you never left, and you cannot
 * leave somewhere you never reached. Arming is geometry only, at any speed.
 * For an "inside" zone that means one frame outside `radiusM`; for an
 * "outside" zone, one frame within `armWithinM`.
 *
 * TRIPPING. Once armed, `zone.dwellSec` continuous seconds of QUALIFYING
 * presence in the finish region — and at/below `zone.maxSpeedKmh` when the
 * zone demands a stop — latch `reachedAtSec`. Any disqualifying frame restarts
 * the count. The latch is permanent: the engine ends the session on that same
 * frame, and nothing can un-finish a finished drive.
 */
export function stepFinishGate(
  prev: FinishGateState,
  zone: RouteFinishZone,
  tick: SimTick,
): FinishGateState {
  if (prev.reachedAtSec !== null) return prev;

  const d = dist(tick.position, zone);
  const outsideMode = zone.mode === "outside";
  // The finish REGION, and the arming side of the threshold. For an "inside"
  // zone the two are exact complements (the shipped behaviour, unchanged);
  // for an "outside" zone the arming circle sits strictly within the region's
  // boundary, so the annulus between them is neither — passing through it
  // neither arms nor counts, which is what makes "entered the ring" mean it.
  const inRegion = outsideMode ? d > zone.radiusM : d <= zone.radiusM;
  const arming = outsideMode ? d <= (zone.armWithinM ?? zone.radiusM) : d > zone.radiusM;
  const armed = prev.armed || arming;

  if (!inRegion) {
    // Outside the finish region: clears any partial dwell, and may arm.
    return armed === prev.armed && prev.insideSinceSec === null
      ? prev
      : { armed, insideSinceSec: null, reachedAtSec: null };
  }

  if (!armed) return prev; // still sitting where the drive started

  // In the region, but rolling through one that asks to be stopped in:
  // present, not arrived. (Reverse reads negative — compare the magnitude.)
  if (zone.maxSpeedKmh !== undefined && Math.abs(tick.speedKmh) > zone.maxSpeedKmh) {
    return prev.insideSinceSec === null && prev.armed === armed
      ? prev
      : { armed, insideSinceSec: null, reachedAtSec: null };
  }

  const since = prev.insideSinceSec ?? tick.t;
  if (tick.t - since >= zone.dwellSec) {
    return { armed, insideSinceSec: since, reachedAtSec: tick.t };
  }
  return prev.insideSinceSec === since && prev.armed === armed
    ? prev
    : { armed, insideSinceSec: since, reachedAtSec: null };
}
