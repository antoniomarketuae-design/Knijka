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
 * ---------------------------------------------------------------------------
 * 2026-08-18 — B1's SHAPE HAD A HOLE IN IT (sweep161, the 174-scenario audit).
 * B1 gave the maneuver anchors an "outside" face and got the two circles right
 * for both of them. The `passSignal` anchor, written to the same shape, ships
 * ONE radius and let `normalizeOutside` default the arming circle to it — so
 * its band is zero wide and „left the junction" means „one pose sample further
 * out than the sample that armed it". Five rungs measured (see
 * FINISH_OUTSIDE_ANNULUS_M), and on all five the junction's own graded stop
 * line falls INSIDE the arming circle, so the gate is armed by stopping
 * legally and tripped by hesitating a metre outside it — at a GREEN light,
 * where B15's freeze withholds nothing. The floor now lives in
 * `normalizeOutside`, where it is a property of the shape and not of any one
 * anchor.
 *
 * Pure and deterministic, like every other fold in this module: no clock, no
 * randomness, same state + same tick ⇒ same output.
 */

import type { SimTick } from "../rules";
import type {
  FinishGateState,
  ObjectiveParams,
  RouteFinishZone,
  YieldReason,
  YieldWaitState,
} from "./types";

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
 *
 * B15 CORRECTION (2026-08-04). The original of this comment ended „…and a
 * red-light wait ends by itself", and that sentence carried the whole weight
 * of the distinction. It is false at a GIVE-WAY line: nothing ends a wait for
 * a gap in circulating traffic except a gap, and the founder waited forty
 * seconds for one. A standstill is therefore no longer sufficient evidence of
 * being stuck by itself — see `stepYieldWait` below, which withholds the
 * evidence entirely while the standstill is the lawful thing to be doing.
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
 * THE ANNULUS — the band between "you have been here" and "you have left", m.
 *
 * Every "outside" gate has two circles: `armWithinM`, which records that the
 * car reached the work site, and `radiusM`, past which it has left. The band
 * between them is NEITHER, and it is what makes the gate mean anything:
 * shuffling at the corner of a turn box, hovering at the mouth of a junction
 * or being nudged back a metre in a queue must never read as a departure.
 * Collapse the band to nothing and "left" degrades into "one frame further out
 * than the frame that armed it", which one pose sample can satisfy without the
 * car going anywhere.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18 — GENERALISED FROM THE TURN BOX, because a gate shipped without a
 * band. This constant used to be `FINISH_CORRIDOR_MARGIN_M`, added to a
 * `threePointTurn` corridor's circumradius and used nowhere else; the
 * roundabout got its band for free (`enterRadiusM` < `exitRadiusM`) and the
 * `passSignal` anchor got none at all — it published a single radius, so
 * `normalizeOutside` defaulted `armWithinM` to that same number and the two
 * circles coincided.
 *
 * MEASURED over the compiled catalogue (808 rungs, all 167 templates × their
 * authored levels): of the 108 "outside" zones `routeFinishZone` and
 * `terminalRescueZone` hand out, exactly FIVE had a zero-width band —
 * `sc-sig-green-wave` L1–L5, radius 40 m, arm 40 m, the only `passSignal`
 * TERMINAL in the catalogue.
 *
 * WHY THAT IS REACHABLE RATHER THAN THEORETICAL. A signalized approach's
 * graded line is derived at the JUNCTION MOUTH, and with the 2.5× road scale
 * those mouths land 17–43 m from the node (runtime/stoplines.ts; the shipped
 * micro-districts measure 27.7 m, JUNCTION_STOP_LINE_M). Every value in that
 * band is INSIDE a 40 m arming circle — so on this lesson a car stopped
 * legally AT THE PAINT is what arms the gate, and a car that then holds a few
 * metres further back — 41 m from the node, one metre into "left the
 * junction", still short of the line it has not crossed — spends
 * FINISH_LEAVE_S there and the drive is declared finished with the third lamp
 * never passed. The lesson is a GREEN wave, so the lamp the student is
 * hesitating at is green, B15's lawful-wait freeze withholds nothing, and the
 * gate spends every one of those twenty seconds. That is precisely the harm
 * the `passSignal` anchor's own comment calls „the worst failure this module
 * can produce".
 *
 * The floor is applied in `normalizeOutside`, so it is a property of the SHAPE
 * rather than of any one anchor — the next authored maneuver cannot reinvent
 * the defect. It widens the departure circle rather than narrowing the arming
 * one, which is the only safe direction: narrowing the arm would stop drives
 * ARMING and could withhold an ending, while widening the departure can only
 * ask a car that is genuinely leaving to travel eight more metres (~1 s at
 * drill speed). The roundabout (26 → 45 m, band 19 m) and the turn box (band
 * ≥ this margin by construction) are unchanged, bit for bit.
 *
 * WHY EIGHT. It is the number the turn box already carried for exactly this
 * job, and it is one lane pitch — 8.125 m, LANE_WIDTH_M × the 2.5×
 * perceptual exaggeration, the same pitch FINISH_LANE_FLOOR_M is derived from
 * — rounded down: a car that has genuinely left a work site is at least a lane
 * clear of it, and a car being shuffled about at its edge is not.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18, LATER THE SAME DAY — „~1 s AT DRILL SPEED" ASSUMED A DRILL SPEED.
 * The paragraph above costs a car that is genuinely leaving eight metres, and
 * that is true of every car that is still moving. A car that has STOPPED in
 * the band travels them never, and the band is then not a delay but a wall.
 *
 * MEASURED by driving the compiled `sc-sig-green-wave` L1 (the same five rungs
 * this constant was written for) through `applyTick`, stopping the car a swept
 * distance past its terminal node and holding it there 200 s. Stops at 0, 10,
 * 20, 30, 36, 39, 41, 42, 44 and 46 m past tl3 all ran the full 200 s of
 * standstill ticks with the phase still "driving" and 0 of 3 objectives
 * ticked; the stop at 48 m ended at 95.3 s. With the band at zero the
 * departure circle is the arming circle, so every one of those rests from
 * 41 m out is in the region and trips on FINISH_LEAVE_S instead — this
 * constant turned a working ending into a trap for a car resting in 40–48 m.
 *
 * FINISH_OUTSIDE_STUCK_S below closes that band. It does NOT close the 0–40 m
 * disc inside the arming circle, which never had an ending either and is B1's
 * deliberate ruling rather than this constant's doing; see that constant for
 * what remains open there and why widening into it is a different decision.
 */
export const FINISH_OUTSIDE_ANNULUS_M = 8;

/**
 * THE STRANDED FACE of an "outside" gate — seconds at a FULL STANDSTILL in the
 * ANNULUS before the drive is closed where it stands.
 *
 * WHY IT HAS TO EXIST AT ALL. The band above is a margin, not a place: it is
 * neither the work site (which B1 protects, and still does — the arming
 * circle's interior is untouched by this) nor the far side. A car MOVING
 * through it is doing exactly what the band was drawn for and is left alone.
 * A car that STOPS in it has no exit at all: it is not in the region, so the
 * departure dwell never runs, and it is not moving, so the region never
 * arrives. Every other anchor in the file has a standstill face —
 * FINISH_STUCK_S at a waypoint, FINISH_BAY_STUCK_S beside a bay — because
 * every other anchor can be stood in. This is that face for the one shape that
 * shipped without one, and the bar is what separates „paused" from „not going
 * anywhere".
 *
 * MEASURED AGAINST REAL DRIVES, not against the shadow tapes — the tapes are
 * ideal and would only prove that an ideal driver never pauses. Every run.log
 * of the sweep161 audit (332 lanes, 174 scenarios, 7,398 speed samples at a
 * 5.2 s cadence) was walked for maximal runs of |v| ≤ FINISH_STANDSTILL_KMH
 * that the drive RESUMED from — i.e. pauses a real student took and then drove
 * on out of, which is exactly the thing this bar may not cut short. Of 1,569
 * such pauses:
 *      longest   69 s  sc-ed-d2-priority-run · mobile · right (t 65 → 134)
 *      next four 45 / 43 / 43 / 43 s — sc-ed-d2-priority-run,
 *                sc-merge-from-property and two roundabout give-way waits
 *                (sc-rb-circulate-priority, sc-rb-ped-exit)
 *      p99 21 s · p95 6 s · median 0 s
 * 69 s is a SAMPLED length, so the true pause is at most one cadence longer:
 * 69 + 5.2 = 74.2 ⇒ 75. Above the longest standstill any of the 332 audited
 * drives ever resumed from, and 1.7× the worst roundabout give-way wait in the
 * set — which is the case this bar is most likely to meet, because B15's
 * lawful-wait window opens at `enterRadiusM` and a car nosed INSIDE it gets no
 * hold (`yieldReasonAt` case 5, `d > p.enterRadiusM`).
 *
 * Deliberately NOT applied to "inside" zones: they already have their own
 * standstill faces and their own measured bars, and every one of them stays
 * bit-identical. B15's freeze applies here exactly as it does to the rest of
 * the module — a lawful wait is evidence of nothing, and the engine drops the
 * partial dwell on every frame of one, so a wait cannot be banked toward this.
 *
 * WHAT IS STILL OPEN, AND IS NOT THIS BAND'S TO CLOSE. The arming circle's
 * INTERIOR has no automatic ending either, and never had one — that is B1's
 * ruling and its own test. It costs nothing on a roundabout (a 24 m ring the
 * student is working) or a turn box (an 8 m corridor), but `passSignal` arms
 * on the objective's GRADING radius rather than on a work site, so on
 * `sc-sig-green-wave` the ending-free disc is 40 m in every direction from the
 * node — measured above: a car resting 0–40 m past tl3 still runs out the
 * capture with the drive live. Closing that means giving the `passSignal`
 * anchor an arm that describes the junction instead of the acceptance ring,
 * which changes when drives ARM and is a founder-visible call, not a widening.
 */
export const FINISH_OUTSIDE_STUCK_S = 75;

// ---------------------------------------------------------------------------
// FR-B5-JAM (doc 87, 2026-08-05) — THE CRASH PIN
// ---------------------------------------------------------------------------
//
// Both gates above are ANCHORED AT THE END OF THE ROUTE, because that is where
// the three stranded-student reports of July came from. A fourth way to be
// stranded was found by driving on 2026-08-05 and it is nowhere near the end:
// `sc-jx-giveway-b1@L1`, driven correctly — stop at the Б1 line, wait, then
// „щом пътят е чист, потегляш" — ended in a 10-point COLLISION with a car
// standing in the second junction's mouth at y = 146.00, and after it the car
// was **held at full throttle for 40 s** with the third objective 32 m ahead
// and unreachable. The obstacle itself is fixed elsewhere (templates-junctions
// + the traffic clamps). This is the other half, and it is the more dangerous
// one, because it does not need THAT obstacle: pin a car against ANY solid
// thing anywhere on a route and the same nothing happens forever.
//
// The evidence has to separate „pinned" from every legitimate standstill, and
// a standstill alone cannot do it — B15 taught that lesson at a give-way line.
// So the pin needs all three of:
//
//   1. a graded COLLISION has happened (the catalog's `terminateSession` flag —
//      the only code that carries it). Nothing else arms this;
//   2. the car has not left the place it hit (within CRASH_PIN_RADIUS_M of the
//      collision pose). Drive away and the arm is dropped — a student who
//      reverses out and carries on is not stuck, and must never be closed down;
//   3. it has then stood completely still for CRASH_PIN_STUCK_S, with the
//      lawful-wait freeze applying exactly as it does to the other two gates.
//
// Nothing here grades. Like every other finish gate it decides WHEN the drive
// stops, never WHAT counts as a fault: the collision keeps its 10 points, the
// unreached objectives stay honestly unreached, and `buildLessonResult` reports
// finished-and-not-passed. The alternative — teleporting the car free — was
// rejected: it would invent a driving outcome the student did not drive, and
// the debrief is the thing he actually needs after a crash he cannot undo.

/** How far from the impact pose still counts as „pinned against it", m. A car
 *  length and a half: enough that a shunt or a shuffle does not disarm the
 *  rescue, small enough that anyone who has genuinely driven away has. */
export const CRASH_PIN_RADIUS_M = 6;

/**
 * Seconds motionless against what you hit before the drive is closed for you.
 *
 * Shorter than FINISH_STUCK_S (12) on purpose: at the end of a route a
 * standstill is ambiguous (lining up, thinking, reading the banner), and after
 * an impact it is not — the student has already been given the fault card and
 * has either reversed out or cannot. Ten seconds is longer than any recovery
 * shunt and a quarter of the forty the founder's drive spent going nowhere.
 * NOTE the pause aid: at L1/L2 a graded fault freezes physics behind a teach
 * card and sim time does not advance, so the card can never spend this clock.
 *
 * OPEN, AND NOT THIS LANE'S TO CLOSE (recorded 2026-08-16 while widening
 * YIELD_STOP_LINE_REACH_M below). `engine.ts` drops this pin's partial dwell on
 * every frame `yieldWait.holding` is true, on the argument that „B15's freeze
 * applies here for the same reason it applies to the other two gates". That
 * reason does not transfer. The other two gates read only position and speed,
 * which is why a lawful standstill is invisible to them; THIS one has already
 * been handed independent evidence that the standstill is involuntary — a
 * graded collision, and a car that has not left the pose it hit in. A pinned
 * car is not waiting for the light, it is unable to move, and freezing its
 * rescue postpones the drive's end to YIELD_WAIT_MAX_S + CRASH_PIN_STUCK_S ≈
 * 190 s instead of 10. The interaction predates this file's widening — it is
 * already live for a rear-ender into the back of a queue at the line, which is
 * the likeliest place to have one — and 12 → 26 m widens the band it can
 * happen in. The fix is one condition in `engine.ts` (exempt the crash pin from
 * the freeze), which is another lane's file.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-17 — TWO MORE, MEASURED, AND THE FIRST ONE VOIDS THE PIN OUTRIGHT.
 * Driven on staging with the shipped harness (`tools/mobile/lesson-audit.mjs`,
 * sc-follow-distance · mobile · wrong). Recorded here because the pin's
 * EVIDENCE MODEL is specified in this file; both defects are in `engine.ts`'s
 * fold of it, so neither is this lane's to close either.
 *
 *  P1 — THE RE-ARM WIPES THE CLOCK, so the pin cannot fire in the one case it
 *  was written for. `engine.ts` re-arms on every graded collision
 *  („the pose that matters is the LAST one") and that re-arm sets
 *  `stillSinceSec: null`. But a collision is NOT a one-shot event against a
 *  thing you stay in contact with: `rules/engine.ts` reopens one every
 *  COLLISION_REOPEN_TRAVEL_M = 2 m of travel since the last report. So a car in
 *  sustained contact emits a fresh COLLISION every 2 m — MEASURED at 65 of them
 *  in a single 177 s drive, i.e. ~130 m spent pushing the thing it hit — and
 *  each one resets the ten-second clock that was supposed to end the drive.
 *  The dwell can only ever accumulate for a car that travels LESS than 2 m in
 *  CRASH_PIN_STUCK_S, which is the one pin that would also have satisfied the
 *  speed test anyway. Grinding forward against an obstacle — the founder's
 *  „held at full throttle" — defeats the pin twice over and always has.
 *  The fix is to re-arm the POSE without clearing `stillSinceSec` (the pose is
 *  what „did not leave the spot" is measured from; the clock is what „has not
 *  moved" is measured with, and a re-report is not evidence of movement — the
 *  `awayM > CRASH_PIN_RADIUS_M` test already carries that).
 *
 *  P2 — THE STANDSTILL TEST IS UNSIGNED, alone in this module. `engine.ts`
 *  reads `tick.speedKmh > FINISH_STANDSTILL_KMH`; every other speed test on
 *  this side of the wall compares the MAGNITUDE — `stepYieldWait` and
 *  `stepFinishGate`, the latter carrying the reason in as many words
 *  („Reverse reads negative — compare the magnitude"). Reverse reads negative,
 *  so a student backing out of what he hit at −20 km/h scores −20 > 1 = false
 *  and is counted as STANDING STILL, banking dwell toward having his lesson
 *  closed for him. He is saved only once he clears CRASH_PIN_RADIUS_M, so the
 *  exposure is the first 6 m of the one manoeuvre this gate's own comment
 *  promises never to punish („drove away — not stuck, and never closed down").
 */
export const CRASH_PIN_STUCK_S = 10;

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
 * chain needs (see `terminalRescueZone`). The flag does nothing for an
 * "outside" anchor, and that is a fact about WHERE the second face lives
 * rather than about it having none: an outside zone carries both faces at once
 * (departure, and the FINISH_OUTSIDE_STUCK_S standstill), and `stepFinishGate`
 * picks between them from the pose. It cannot be split into two zones here —
 * the engine consults the stalled-chain zone only while the chain is NOT on
 * its terminal objective, so a rescue zone that dropped the departure face
 * would silently delete the ending of every drive that reaches the last gate.
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
      //
      // ARMED BY THE OBJECTIVE'S OWN ACCEPTANCE RING, and left one annulus
      // beyond it. Naming `armWithinM` here is not decoration: this anchor
      // published one radius and let `normalizeOutside` default the arm to it,
      // which collapsed the band (see FINISH_OUTSIDE_ANNULUS_M for the five
      // rungs that measured). The arm is the objective's own statement of
      // „the car was at this junction"; the departure circle is that plus the
      // band, and `normalizeOutside` is what guarantees the second one.
      return {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        armWithinM: params.radiusM,
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
              Math.hypot(corridor.halfWidthM, corridor.halfLengthM) + FINISH_OUTSIDE_ANNULUS_M,
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

/**
 * Give an "outside" anchor its two circles, and guarantee the band between
 * them. The arm is clamped into the zone (you cannot be asked to reach further
 * out than the place you are leaving), and the departure circle is then pushed
 * out until at least FINISH_OUTSIDE_ANNULUS_M separates the two — see that
 * constant for the five rungs that shipped with the circles coincident and
 * what a car standing at a green light one metre outside them cost.
 *
 * Both operations are one-way: the arm can only shrink to the zone it belongs
 * to, and the region can only grow. THAT IS NOT THE SAME AS SAFE, and the
 * sentence that used to stand here („no drive that ends today stops ending —
 * a car that has genuinely left the work site simply travels the band before
 * it counts") was false for the only car that matters: one that has stopped.
 * Growing the region moved 40–48 m out of „left" and into „neither", and a car
 * resting there travels nothing, ever — measured on `sc-sig-green-wave` L1 at
 * FINISH_OUTSIDE_ANNULUS_M. The band is honest; what it needed was a floor in
 * TIME as well as one in distance, and that is FINISH_OUTSIDE_STUCK_S in
 * `stepFinishGate`.
 */
function normalizeOutside(zone: RouteFinishZone): RouteFinishZone {
  const armWithinM = Math.min(zone.armWithinM ?? zone.radiusM, zone.radiusM);
  const radiusM = Math.max(zone.radiusM, armWithinM + FINISH_OUTSIDE_ANNULUS_M);
  return { ...zone, armWithinM, radiusM };
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
 * An "outside" anchor needs neither change: leaving the work site already
 * means the work is over, and the standstill evidence the other two anchors
 * get from this function it gets from `stepFinishGate` instead
 * (FINISH_OUTSIDE_STUCK_S), on the same zone, because this zone is also the
 * only one the engine consults on the terminal objective.
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

// ---------------------------------------------------------------------------
// THE RUN-OUT — B-NEW-1/zebra (founder: «the session ended itself»), measured
// 2026-08-16 on `sc-zebra-approach` L1.
//
// TOLERANCE IS FORGIVENESS FOR THE TASK. IT IS NOT A RELOCATION OF THE FINISH
// LINE — and until this block the engine spent it twice.
//
// A `reachZone` completes on ENTERING its acceptance ring (objectives.ts
// `stepReachZone`: `inZone = d <= radiusM`). On the TERMINAL objective that
// same frame also ended the session (engine.ts, the chain-complete branch), so
// the drive stopped one whole radius SHORT of the mark the author placed —
// short of the very point the guidance ribbon had been pointing at all along
// (`guidanceGoalFor`, cited in this file's own header).
//
// MEASURED, on the shipped catalogue rather than argued:
//   · 674 authored rungs end on a `reachZone`. Mean radius 10.03 m, so the mean
//     drive is cut TEN METRES short of its own end; the worst is
//     `sc-fo-motorway-gap` L1 at 23 m.
//   · `sc-zebra-approach` L1: mark (4.06, 130), radius 12 → 17 after the L1
//     ladder. All three COMMITTED recordings — shadow-correct,
//     mistake-not-yielded, mistake-too-fast — end at y = 113.0…113.1. The
//     authored end of that route is 17 m further on, and the crossing the
//     lesson exists to teach is at y = 90: the founder's drive closed 23 m and
//     3.0 s after driving through an occupied zebra.
//   · AND THE LADDER IS UPSIDE DOWN. `toleranceScale` (compile.ts) widens the
//     acceptance at the LOW rungs so a beginner is not failed for stopping a
//     few metres off. Because the same number ended the drive, the kinder the
//     rung the SHORTER the road: mean terminal radius L1 12.67 m vs L5 8.91 m,
//     and on 119 of 140 templates L1 loses more road than L5. On the zebra the
//     beginner got 4.6 m less street than the expert, on the same street, for
//     the same drive. Nobody chose that; it fell out of one number doing two
//     jobs.
//
// SO THE RUN-OUT SEPARATES THE TWO JOBS. The objective is still awarded on
// EXACTLY the frame it is awarded today — nothing here grades, credits or
// withholds anything, and no student gains or loses a tick — but the DRIVE
// carries on to the mark, and ends when the car has actually got there.
//
// It is bounded three ways, because a drive that cannot end is the worse bug
// (the whole completability battery exists for it):
//   ARRIVED — within FINISH_MIN_RADIUS_M of the mark, or past it along the
//     approach (the same „along the axis" convention `stepReachZone` uses for
//     its capsule, so the two halves of the module agree about „beyond").
//   AT REST — a full standstill. A student who has finished every task and
//     stopped HAS finished the drive, wherever he stopped.
//   SPENT — ROUTE_RUNOUT_MAX_S, the backstop that makes hanging impossible.
// The lawful-wait freeze (B15) applies to the last two for the same reason it
// applies to the finish gates: a second spent stopped because the road said so
// is evidence of nothing, and closing the drive on a student yielding correctly
// at the very end would be B15 all over again.
// ---------------------------------------------------------------------------

/**
 * How close to the mark counts as ARRIVED, meters.
 *
 * Deliberately this file's own FINISH_MIN_RADIUS_M rather than a new number:
 * that constant is already the module's statement of the smallest zone it is
 * honest to draw („below this a zone is smaller than the car"). It is only a
 * tolerance for a car that comes to rest ON the mark — a car that drives
 * through is caught by the past-the-mark half, which no frame rate can miss.
 */
export const ROUTE_RUNOUT_ARRIVE_M = FINISH_MIN_RADIUS_M;

/**
 * The ceiling on a run-out, seconds. Past it the drive ends where it stands.
 *
 * IT IS NOT A SESSION BACKSTOP, and the block above says „the backstop that
 * makes hanging impossible" about a great deal less than it sounds like.
 * Asked (2026-08-18) why this did not save the car stranded 42–48 m past
 * `sc-sig-green-wave`'s terminal node, the answer is two independent noes and
 * neither is a defect in the run-out:
 *   1. IT IS NEVER ARMED FOR A STRANDED DRIVE. `engine.ts` arms it in the
 *      `currentIndex >= objectives.length` branch — i.e. only once every task
 *      is DONE. A car stranded with its terminal objective open has a chain
 *      that never completes, so this clock never starts. The run-out bounds
 *      the drive AFTER the tasks, and nothing else;
 *   2. even armed, `routeEndMark` is null for a `passSignal` terminal (see it
 *      for why), and a null mark terminates on the spot rather than counting.
 * The only thing that can end a stranded drive is a finish gate, which is why
 * the fix for that car is FINISH_OUTSIDE_STUCK_S and not a number here.
 *
 * Derived from the run-out's own worst case, which is bounded by construction:
 * the car starts inside the terminal ring, so it is at most that radius from
 * the mark, and the widest terminal ring in the catalogue is 23 m
 * (`sc-fo-motorway-gap` L1). Twenty seconds covers 23 m at anything above
 * 4.1 km/h; below that a car is either stopping — where the standstill exit
 * takes over within a second or two — or crawling nowhere, which is what a
 * ceiling is for. It can only ever ADD road to a drive that used to end
 * instantly, never withhold an ending.
 */
export const ROUTE_RUNOUT_MAX_S = 20;

/**
 * Where the route's last task was authored to happen, or null when running on
 * to it makes no sense.
 *
 * Null on purpose for everything that is not an ARRIVAL WAYPOINT:
 *  - a placeless terminal (drive N metres, stop smoothly, brake for the
 *    hazard) has no mark to run to;
 *  - a MANEUVER terminal ends by DEPARTURE, not arrival — finish.ts already
 *    models the roundabout and the turn box as `mode: "outside"`, and running
 *    a finished student back toward the island he has just left would be
 *    absurd. A `parkInBay` is excluded for the opposite reason: it completes
 *    with the car at rest inside the rect, i.e. already at the mark and
 *    already at a standstill, so a run-out has nothing to add;
 *  - a `passSignal` terminal is excluded because its defect was NOT measured.
 *    Its mark is the node while its completion is the painted line at the
 *    junction MOUTH, so it plausibly loses road the same way — but the mouth
 *    setback is derived per node (runtime/stoplines.ts) and can put the node
 *    inside the box, and this pass is not going to guess at junction geometry
 *    it has not driven.
 * What is left is `reachZone`, which is the class the 674-rung census above
 * actually measured.
 */
export function routeEndMark(objectives: readonly ObjectiveParams[]): Point | null {
  if (objectives.length < 1) return null;
  const terminal = objectives[objectives.length - 1];
  if (terminal.kind !== "reachZone") return null;
  return { x: terminal.x, y: terminal.y };
}

/**
 * Has the car got to the end of the route? True on arrival at the mark and on
 * passing it — `from` is where the run-out began, which is inside the terminal
 * ring and therefore always on the approach side of the mark.
 */
export function routeRunOutArrived(
  mark: Point,
  from: Point,
  here: Point,
): boolean {
  if (dist(here, mark) <= ROUTE_RUNOUT_ARRIVE_M) return true;
  const ax = mark.x - from.x;
  const ay = mark.y - from.y;
  const m = Math.hypot(ax, ay);
  if (m < 1e-6) return true; // began ON the mark — there is nowhere to run to
  // + = beyond the mark, the sign convention of stepReachZone's capsule.
  return ((here.x - mark.x) * ax + (here.y - mark.y) * ay) / m > 0;
}

// ---------------------------------------------------------------------------
// THE LAWFUL WAIT — B15 (founder, „Кръгово движение"): «the roundabout convicts
// me the instant the wheels turn after I have waited properly at the give-way
// line. I waited about 40 seconds.»
//
// THAT ROW WAS UNPHOTOGRAPHABLE, and this file is why. Three separate runs
// tried to hold the frame: at roughly twenty seconds of standing still the
// session handed itself a result screen («0 наказателни точки · НЕИЗДЪРЖАН ·
// Ориентировъчно време 20 с») and the keyboard stopped mattering. Twenty
// seconds is FINISH_LEAVE_S, and the gate that spends it is the one directly
// above — leave-the-work-site.
//
// THE GEOMETRY, measured on the shipped drill rather than argued
// (b15-lawful-wait.test.ts pins every number):
//   sc-roundabout-entry  ring (0,0) · enterRadiusM 24 · exitRadiusM 34
//   the painted М8 give-way bars on the south arm:  (4.06, −35.725)
//   ⇒ a car stopped ON THE PAINT is 35.96 m out — 1.96 m INSIDE the region
//     this gate calls „you have left the roundabout", which starts at 34 m.
// The gate arms on one frame within 24 m. So every student who has been at the
// ring and is then stationary where the lesson TELLS him to stand („спри на
// линията и я пропусни", instruction 2) is inside an armed finish, counting
// down, and at twenty seconds his lesson is over. Driven and confirmed live:
// the arming flips at 22.1 m from the centre, and the raw gate latches
// `reachedAtSec` exactly FINISH_LEAVE_S after the first frame on the paint.
//
// The gate fires because the ONLY thing it can read is „the car is not at the
// ring and is not moving", which is equally true of a tab someone walked away
// from and of a student doing the single most important thing a learner does
// at a junction.
//
// THE GATES ARE NOT WRONG TO EXIST. An idle tab must not hold a lesson open
// forever, and a car standing in the middle of nowhere with nothing pending is
// genuinely finished with the route. What was missing is the DISTINCTION, and
// it is not a longer timeout — a longer timeout only moves the number at which
// the product fails him. It is: while the scenario is EXPECTING a yield, a
// standstill is not evidence of anything except obedience, so it must not
// count toward the idle finish at all.
//
// WHAT COUNTS AS „expecting a yield", and why each one is here:
//  · a Б1 give-way line or a Б2 stop sign within reach ahead — the tick's own
//    `nextStopLineControl`/`nextStopLineM` (worldRuntime publishes both);
//  · a red / red-amber / amber light at that line — waiting it out is the law;
//  · a pedestrian on a crossing whose approach zone the car is inside — the
//    tick reports this as an EVENT, so it is latched (see YieldWaitState);
//  · a ROUNDABOUT this route has not finished, with the car stopped within one
//    approach of it. This one cannot be read off the stop line at all:
//    `stoplines.ts` skips every junction touching a roundabout edge
//    (`incident.some(roundabout) ⇒ continue`), so rb-mini-v1's give-way arm
//    publishes NO stop-line context whatsoever — the М8 paint and its Б1 are
//    drawn, the graded line is not. Confirmed on the live drive: the telemetry
//    reads `nextStopLineControl = null` on every frame of the approach. His
//    exact case therefore has to come from the ROUTE — a roundabout objective
//    the sequential chain has not passed yet, and a car at a standstill within
//    one approach of it.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not grade — nothing here emits,
// suppresses or reweights a ScorableEvent, exactly like the rest of this file.
// It does not touch the objective chain: a wait completes no task. And it does
// not hold a session open forever — YIELD_WAIT_MAX_S below is the point past
// which even a lawful-looking standstill is an abandoned tab.
// ---------------------------------------------------------------------------

/**
 * How close ahead a controlled line has to be for a standstill to read as
 * waiting AT it, meters. The runtime watches 120 m of road (NEXT_LINE_WATCH_M)
 * — far too generous here: a car stopped 80 m short of a give-way line is
 * stopped in open road, not at the line.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-16 — 12 → 26. THE CLIFF AT A METRE AND A HALF (founder, driven on
 * staging, `sc-signal-response@L1`, three runs of the SAME junction):
 *   · stopped 10.6 m short of the paint (PC) — the whole arc fires: the
 *     «Чакаш правилно на червено» card, «Защо чакаш: червен сигнал»,
 *     «Чакането Е маневрата», and «Изчака сигнала и тръгна чисто» after green.
 *   · stopped 12.5 m short (phone) — NOTHING, for seventy-five seconds. The
 *     only thing on the screen for the whole wait was «Кола отзад · 2 м».
 * The difference between the two drives is 1.9 m, and the MORE cautious one is
 * the one the product went silent on. Twelve was the whole reason.
 *
 * THE OLD NUMBER'S OWN JUSTIFICATION WAS THE ERROR. It read „the shipped
 * junction-mouth setback (STOP_LINE_BEYOND_CUT_M band) plus a car length and
 * change" — but STOP_LINE_BEYOND_CUT_M is 0.6 m (world/builders/network.ts), so
 * that sentence describes ~5 m, not 12. Twelve was never derived from anything;
 * it was a round number wearing a derivation.
 *
 * WHAT IT IS DERIVED FROM NOW — the queue the line itself creates, in the
 * numbers the shipped traffic actually forms with:
 *     VEHICLE_LENGTH_M 4.1 (traffic/system.ts) + minGapM 2.0 (traffic/types.ts
 *     DEFAULT_TRAFFIC_CONFIG) = 6.1 m per stopped car, centre to centre;
 *     the leader's own centre rests 1.78 m short of the paint — not a guess,
 *     it is the pose the shipped shadow drives hold (traces/scSignals.ts
 *     YIELD_Y −29.5 against the sx-v1 line at −27.725).
 *   ⇒ 1.78 + 4 × 6.1 = 26.18 m is the FIFTH car in a stopped queue.
 *
 * AND IT IS FORCED FROM ABOVE AND BELOW, which is what stops it being taste:
 *
 *   FROM BELOW — a lesson may not refuse to recognise the pose it sends the
 *   student to. FOUR shipped drills park their approach checkpoint one lane off
 *   the axis, 45 m from the node, r 8 — far edge 53 m out against a line
 *   27.725 m out (JUNCTION_STOP_LINE_M), i.e. 25.28–25.46 m short of the paint:
 *   `sc-sig-approach` (светофар), `sc-jstop-approach` and `sc-jscan-approach`
 *   (both control stopSign — so this is not a traffic-light quirk) and
 *   `sc-ltap-approach`, all in templates-junctions.ts. At 12 m the window
 *   covered 2.7 m of a 16 m zone the lesson's OWN objective tells him to stop
 *   in. 26 contains all of it, with 0.5 m to spare — deliberately tight, so
 *   that authoring a gate further out has to be a decision rather than a
 *   regression (`__tests__/signal-stop-line-window.test.ts` fails on it).
 *
 *   FROM ABOVE — the founder's own line, and the trap this fix had to avoid:
 *   „a student who stops 40 m short has NOT stopped at the line and must not be
 *   told he did". 26 < 40, with the fifth-car derivation as the reason rather
 *   than the gap. Beyond it the hold is withheld, the finish gates resume, and
 *   the drive ends with the objectives honestly unticked.
 *
 * WHAT WIDENING THIS CAN AND CANNOT COST. It grades nothing (the contract this
 * whole section opens with): its only two effects are that the idle finish may
 * not spend these seconds, and that the instructor is allowed to speak. The
 * price is that a tab abandoned within 26 m of a controlled line is held for
 * YIELD_WAIT_MAX_S instead of FINISH_STUCK_S — bounded, and the same trade B15
 * already made at 12.
 */
export const YIELD_STOP_LINE_REACH_M = 26;

/**
 * How far SHORT of a ring the car may stand and still read as waiting to enter
 * it, meters beyond the objective's own `enterRadiusM`.
 *
 * Measured against the shipped case rather than guessed: on `rb-mini-v1` the
 * ring is r=18, the objective's enterRadiusM is 24, and the painted М8
 * give-way bars sit 18.2 m out from the entry mouth — i.e. ~36 m from the ring
 * centre, 12 m beyond the arming circle. Twenty metres covers that with room
 * for the car behind him in a queue, and excludes the spawn (93 m out), which
 * must keep ending the session when a tab is abandoned there.
 */
export const YIELD_ROUNDABOUT_APPROACH_M = 20;

/**
 * The ceiling. Past this many CONTINUOUS seconds of lawful-looking standstill
 * the hold stops being honoured and the finish gates resume — because at some
 * point „waiting for a gap" and „closed the laptop" become indistinguishable
 * again, and the gate's legitimate purpose is the second one.
 *
 * Three minutes is deliberately far past any real wait. The founder's was 40 s;
 * the roundabout drill's circulator comes round every ~40 s; the longest
 * signalized red on the shipped maps is 26 s of a 50 s cycle. It is 4.5× his
 * wait and 3× the sixty-second proof this row is closed with, and it still
 * bounds an abandoned tab to three minutes.
 */
export const YIELD_WAIT_MAX_S = 180;

/**
 * Why this frame is a lawful wait — for the instructor's voice, tests and
 * telemetry, never for grading. The union itself moved to `./types` when
 * `YieldWaitState` started carrying one (B15-VOICE); re-exported here so every
 * existing `from "./finish"` import is unchanged.
 */
export type { YieldReason };

/** Fresh hold: not waiting, nothing latched. */
export function createYieldWait(): YieldWaitState {
  return { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds: [] };
}

/** The route context the roundabout reason needs (engine-side session state). */
export interface YieldWaitContext {
  /** Every objective's params, in route order. */
  params: readonly ObjectiveParams[];
  /**
   * Index of the ACTIVE objective; >= params.length ⇒ the chain is done.
   * Objectives BEFORE it are complete by construction (the chain is strictly
   * sequential), which is exactly how „a roundabout this route still has to
   * do" is expressed below — no extra state, and it stays true across a
   * voided traversal, which is when a student is most likely to be sitting at
   * the line again.
   */
  currentIndex: number;
}

/** Fold this frame's crossing events into the latched pedestrian set. */
function stepPedestrianCrossings(
  prev: readonly string[],
  tick: SimTick,
): readonly string[] {
  let next = prev;
  const drop = (id: string): void => {
    if (next.includes(id)) next = next.filter((x) => x !== id);
  };
  for (const e of tick.events) {
    switch (e.kind) {
      case "crossingZoneEntered":
        // Re-emitted whenever the flag changes, so it both arms and disarms.
        if (e.pedestrianOnCrossing) {
          if (!next.includes(e.crossingId)) next = [...next, e.crossingId];
        } else drop(e.crossingId);
        break;
      case "crossingPassed":
      case "crossingZoneExited":
        drop(e.crossingId);
        break;
      default:
        break;
    }
  }
  return next;
}

/**
 * Is the scenario expecting a yield HERE? Null = no; a reason otherwise.
 * Speed is NOT considered — the caller owns the standstill test, so this stays
 * a pure statement about the world and the route.
 */
export function yieldReasonAt(
  tick: SimTick,
  ctx: YieldWaitContext,
  pedestrianCrossingIds: readonly string[],
): YieldReason | null {
  // 1-3. A controlled line the runtime can see, within reach AHEAD.
  //
  // ONE-SIDED, AND DELIBERATELY SO — the third of the founder's three runs is
  // this side of the same junction: stopped 8.5 m PAST the line, inside the
  // mouth, seventy-five seconds, and the same total silence. `nextStopLineM`
  // is published only for a line ahead in the travel direction (worldRuntime
  // `d >= 0`), so a car that has crossed reports no line at all and falls out
  // of this clause however wide the window gets.
  //
  // That silence is a real defect and it is NOT this function's to fix. A car
  // standing inside a junction is not lawfully waiting for anything: it must
  // get no hold (its session has to be allowed to end so the student reaches
  // the debrief that explains the overshoot) and no reason (every line of copy
  // keyed to `redLight` opens with «Спрял си ПРЕД стоп-линията», which is the
  // one thing that is not true of him). Both of those are already what happens
  // — the widening above must not quietly change it, so the past-the-line pose
  // is pinned by test rather than merely left alone. What is owed to that
  // student is a FAULT and a card, and both live outside this module: the
  // STOP_LINE_OVERSHOOT detector can only see a nose over the paint while the
  // centre is still short of it (rules/engine.ts, `nextStopLineM <=
  // stopOvershootCenterM`), and there is no reason in the `YieldReason` union
  // for „stopped in the junction" to be said with.
  const lineM = tick.nextStopLineM;
  if (lineM !== undefined && lineM <= YIELD_STOP_LINE_REACH_M) {
    if (tick.nextStopLineControl === "giveWay") return "giveWayLine";
    if (tick.nextStopLineControl === "stopSign") return "stopSign";
    if (
      tick.nextStopLineControl === "trafficLight" &&
      tick.nextStopLineState !== undefined &&
      tick.nextStopLineState !== "green"
    ) {
      return "redLight";
    }
  }

  // 4. A pedestrian on a crossing this car is in the approach zone of.
  if (pedestrianCrossingIds.length > 0) return "pedestrian";

  // 5. A ring this route has NOT finished yet, with the car stopped within one
  // approach of it. The annulus is deliberately symmetric — it is not worth
  // guessing from a heading whether a stationary car 30 m out is arriving or
  // has just been told to come back (which is precisely what the voided-exit
  // card says: „върни се в кръговото и излез с пуснат десен мигач"). Inside
  // the ring is excluded by `d > enterRadiusM`, and the ring being BEHIND you
  // is excluded by the objective being done, so what is left is a car that
  // still has this roundabout to do and is not moving toward it.
  for (let i = Math.max(0, ctx.currentIndex); i < ctx.params.length; i++) {
    const p = ctx.params[i];
    if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") continue;
    const d = dist(tick.position, p);
    if (d > p.enterRadiusM && d <= p.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M) {
      return "roundaboutEntry";
    }
  }

  return null;
}

/**
 * Advance the lawful-wait hold by one frame.
 *
 * `holding` is true only while the car is at a FULL standstill
 * (FINISH_STANDSTILL_KMH — the same bar the stuck-rescue uses, so the two
 * cannot disagree about what „not moving" means) AND a reason above applies
 * AND the hold has not run past YIELD_WAIT_MAX_S. The engine freezes both
 * finish gates on exactly those frames.
 */
export function stepYieldWait(
  prev: YieldWaitState | undefined,
  tick: SimTick,
  ctx: YieldWaitContext,
): YieldWaitState {
  const base = prev ?? createYieldWait();
  const pedestrianCrossingIds = stepPedestrianCrossings(base.pedestrianCrossingIds, tick);

  const stationary = Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH;
  const reason = stationary ? yieldReasonAt(tick, ctx, pedestrianCrossingIds) : null;
  if (reason === null) {
    return { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds };
  }

  const sinceSec = base.sinceSec ?? tick.t;
  // Past the ceiling the hold is spent: the gates resume and an abandoned tab
  // still ends. `sinceSec` is kept so the hold does not silently re-arm on the
  // next frame — only moving away from the yield (above) clears it.
  const holding = tick.t - sinceSec <= YIELD_WAIT_MAX_S;
  // The reason is published on every qualifying frame, INCLUDING the ones past
  // the ceiling: it states what the world is, and the world does not change
  // because a timer expired. Only `holding` is the gate — so the instructor's
  // voice, which reads `holding`, falls silent at exactly the moment the finish
  // gates resume and the session is on its way to ending.
  return { holding, sinceSec, reason, pedestrianCrossingIds };
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
 *
 * STRANDED (2026-08-18). An "outside" zone has a SECOND qualifying state, and
 * it is the one it shipped without: armed, at a full standstill, and IN THE
 * ANNULUS — past the arming circle, short of the departure one. That is a car
 * that has reached the work site, left it, and then stopped in the margin this
 * module draws around it; it will never reach the region, because reaching the
 * region is what it has stopped doing. It counts against FINISH_OUTSIDE_STUCK_S
 * instead of `zone.dwellSec`; see that constant for the audit the bar is
 * measured from. Motion in the band still qualifies for nothing at all — every
 * shuffle, hover and queue-nudge the band exists for is unaffected — and the
 * arming circle's interior is untouched, so B1's „standing still in the middle
 * of the work can never end a drive" holds exactly as written.
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

  // The stranded face, above — THE BAND ONLY, never the arming circle it
  // guards. Inside `armWithinM` is the work site, and B1's rule there is not
  // being amended: standing still in the middle of the work still cannot end a
  // drive, at any duration (`route-finish.test.ts` pins two motionless minutes
  // on the ring). The band is not the work site — it is the margin this module
  // added around it — and a car resting in a margin is the one case with
  // nowhere to go.
  //
  // The two dwells are geometrically exclusive, so one `insideSinceSec` times
  // both and the threshold is read off THIS frame's pose. They are adjacent at
  // `radiusM`, so a clock could in principle be carried across it — but only
  // by a car that crosses the whole band without once exceeding
  // FINISH_STANDSTILL_KMH (≥ 29 s of continuous sub-1-km/h creep over the
  // 8 m), which is one unbroken standstill by any reading and would have spent
  // this bar where it stood. Any real crossing spends a frame in the band
  // MOVING, which qualifies for neither and clears the count.
  const stranded =
    outsideMode &&
    armed &&
    !inRegion &&
    d > (zone.armWithinM ?? zone.radiusM) &&
    Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH;
  const dwellSec = inRegion ? zone.dwellSec : FINISH_OUTSIDE_STUCK_S;

  if (!inRegion && !stranded) {
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
  if (tick.t - since >= dwellSec) {
    return { armed, insideSinceSec: since, reachedAtSec: tick.t };
  }
  return prev.insideSinceSec === since && prev.armed === armed
    ? prev
    : { armed, insideSinceSec: since, reachedAtSec: null };
}
