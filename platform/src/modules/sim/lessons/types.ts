/**
 * sim/lessons — shared types of the lesson subsystem.
 *
 * The lesson engine is a PURE orchestration layer above the rule engine
 * (rules/) and the pre-drive machine (procedures/): it owns objective
 * progression and the session lifecycle, accumulates every scorable event,
 * and at the end folds everything through `buildSessionSummary` into an
 * official-style result. Zero DOM/3D/DB dependencies — the store (store.ts)
 * is the only impure seam and is injectable, like every other module store.
 */

import type {
  LessonObjective,
  LessonSpec,
  ParkingBaySpec,
  StagedEventOutcome,
} from "../contracts";
import type {
  RuleEngineState,
  ScorableEvent,
  SessionSummary,
  SeverityClass,
  Vec2,
} from "../rules";
import type { PreDriveMachine } from "../procedures";
import type { EscalatedMistake, PenaltyEscalation } from "./escalation";

// ---------------------------------------------------------------------------
// Objective parameters (typed views over LessonObjective.params)
// ---------------------------------------------------------------------------

/** Vehicle entered a circular zone (optionally at/below a max speed). */
export interface ReachZoneParams {
  kind: "reachZone";
  x: number;
  y: number;
  radiusM: number;
  /** When set, the zone only completes at/below this speed (km/h). */
  maxSpeedKmh?: number;
  /**
   * THE SAME SPEED CONTRACT, READ FROM UNDERNEATH — the authoring half of the
   * eleventh arrival demand (sc-ac-night-overdrive:b9d61410, critical).
   *
   * A ceiling alone is satisfied by a car at walking pace, so «Мини участъка
   * със съобразена за видимостта скорост» ticked green at 15 км/ч. When set,
   * the zone completes only at/above this speed too, and the band is
   * [minSpeedKmh, maxSpeedKmh].
   *
   * The full design note — the geometry it borrows from the cap, the slack it
   * mirrors, why the number may NOT be derived from the banner, and the
   * anti-trap re-earn — lives on `ReachZoneWitnessDemands.minSpeedKmh`
   * (objectives.ts), which is where the evaluator reads it.
   *
   * NOT LADDERED (`scenario/params.ts serializeObjectiveParams` carries it
   * through untouched while `widenSpeedCap` raises the ceiling), so the band is
   * WIDEST at L1 and the authored number must be comfortable at the rung with
   * the most help. `parseSpeedFloor` refuses a band narrower than
   * REACH_ZONE_CAP_SLACK_KMH outright, so a gate nobody can drive cannot ship.
   */
  minSpeedKmh?: number;
  /**
   * B18 residual / FR-24 (founder: „the green circle that is stating where the
   * car to stop is actually putted AFTER the stop marked line on the road …
   * I have to stop BEFORE the line not after it").
   *
   * THE HALF THAT WAS LEFT. The DRAWN marker was fixed in scene/
   * guidanceRoute.ts — a waypoint authored past visible paint is pulled back
   * and drawn as a gate bar on the lawful side. Its own comment says the
   * acceptance radius „rides along untouched", and that is this row's
   * residual: the GRADE still came from the full circle, so a car stopped
   * 1.7 m PAST the give-way bars was credited with having stopped at them.
   *
   * A waypoint is a circle and a circle reaches exactly as far past a mark as
   * it reaches short of it. Where the mark stands for painted line the student
   * must not cross, that symmetry is a lie the lesson tells — and the aids
   * make it worse, because the L1/L2 tolerance ladder widens the radius in
   * BOTH directions.
   *
   * Set this to the SIGNED distance from the paint to the authored mark along
   * the approach — i.e. how far PAST the paint the mark itself sits — and the
   * acceptance becomes the disc cut off exactly at the line. Stopping earlier
   * still counts (early is the same act done sooner, and every metre the
   * ladder adds still adds backwards); stopping past the paint never does, at
   * any rung.
   *
   *   POSITIVE — the mark is inside the junction and credit must stop SHORT of
   *              it by this much (`sc-rb-approach`: +1.725 m past the М8 bars).
   *   NEGATIVE — the mark is on the approach and the paint is this far AHEAD of
   *              it, so credit may extend that far past the mark and no further
   *              (`sc-sdead-approach`: −2.275 m, a mark 2.275 m short of the
   *              stop line whose 12 m disc otherwise reached 9.72 m into the
   *              junction). Ten of the catalog's twelve cut objectives are this
   *              sign: the defect is almost always a generous RADIUS, not a
   *              badly placed mark.
   *
   * FR-24 required the negative half. The first version of this parameter only
   * accepted values ≥ 0, which is exactly why it could be authored on one
   * template and nowhere else — every other overhang in the catalog needed a
   * sign the type could not express, so the drawing stayed honest catalog-wide
   * and the grading stayed wrong catalog-wide.
   *
   * A value larger than `radiusM` would leave the disc with no acceptable
   * region at all and make the objective uncompletable except by the grace
   * capsule; `stop-line-grading.test.ts` refuses that rather than shipping it.
   *
   * The mark itself deliberately stays where the template authored it: that
   * is what keeps the guidance clamp engaged and the gate bar drawn
   * (governingPaintLine only pulls a marker back when the waypoint is PAST the
   * line). One anchor, two honest derivations from it.
   *
   * Nothing here is a fault: the rule engine's law adjudication is untouched.
   * This decides only whether the TASK is ticked off.
   */
  acceptBeforeMarkM?: number;
  /**
   * THE GATE FINALLY HAS THE CONTACT TERM ITS OWN TEMPLATE ROUTED HERE —
   * sc-hazard-obstacle:0f31ccfb, wave 2.
   *
   * `templates-hazards.ts sc-obs-cleared` carries the routing note verbatim:
   * *„A real gate — «no contact event since this objective armed» — needs a new
   * term on `ReachZoneParams` plus the evaluator that reads it … Routed."* This
   * is that term. Until it existed the objective was retitled DOWN — from
   * «Задмини обекта, без да го закачиш» to «Задмини обекта и продължи напред» —
   * because an honest title was the only thing the lane could ship, and
   * `__tests__/hazard-obstacle-claims.test.ts` was left standing so the promise
   * could not come back without the gate arriving with it. It has now arrived.
   *
   * WHAT IT MEANS. `true` = this waypoint may not be ticked on a drive whose
   * own protocol already books a `COLLISION` — a struck body, of any kind,
   * anywhere in the run. It is a claim about the JOURNEY, exactly like
   * `requireVruUntouched` (objectives.ts `ReachZoneWitnessDemands`) and read the
   * same way: a per-frame consultation of the run's SCORED ledger, no
   * eval-state memory, and never part of the `capMet` latch.
   *
   * WHY THE WHOLE-RUN LEDGER AND NOT „the obstacle". `stepReachZone` is handed
   * (params, prev, tick, ctx) and has no notion of WHICH body a template meant;
   * `ObjectiveContext` carries facts about the drive, not a cast list. On the
   * one drill that authors it there is exactly one thing on the carriageway to
   * strike, so the two readings coincide — and where they would not, the
   * broader reading is the SAFE direction for a certificate: it can only ever
   * withhold a tick from a drive the same debrief already convicts of the
   * gravest fault in the catalogue (Наредба № 38 чл. 48, ал. 3).
   *
   * IT CANNOT REFUSE A CLEAN DRIVE. The channel is the rule engine's BILLED
   * collision, not the raw contact stream: a touch under the closing-speed
   * floor never becomes a `ScorableEvent`, so it never reaches this gate (see
   * orchestrator/contact.ts — „a 2 km/h bumper kiss is not a crash"). A drive
   * that hits nothing is bit-identical to shipped, and so is every waypoint
   * that does not author the key.
   */
  requireNoContact?: true;
  /**
   * THE ARM WAS UP WHEN THE CAR WENT OVER THE RAILS — sc-rx-guarded:deb92207,
   * wave 2, and the second term this file's own templates routed here.
   *
   * `templates-rail.ts sc-rxg-finish` names the owner in so many words: *„this
   * disc CAN be taught to refuse while the arm is down — and until it is, this
   * drill's own two ❌ demos still complete it at 33.4 s and 46.9 s on drives
   * convicted of entering barred. OWNER: `lessons/objectives.ts` (a
   * `requireRailClear` demand reading `tick.railBarred`)."* `traces/
   * scRxGuarded.ts` and `rail-cross-when-clear.test.ts` §5 route the same
   * clause to the same address. This is it.
   *
   * WHAT IT MEANS. `true` = this waypoint is earned by BEING ON the authored
   * track band (`tick.railCrossing === "on"`) while the guarded arm is NOT down
   * (`tick.railBarred !== true`), and thrown away by being on that band while
   * it IS. Like `requireControllerProceed` it is a claim about a moment on the
   * JOURNEY rather than a state at the mark — the finish disc sits 130 m past
   * the crossing — so it rides the same `capMet` latch and shares that demand's
   * single-frame rule: it may not sit on a zone that also carries a cap, a lamp
   * or a gear demand, because one latch cannot hold two independently-earned
   * halves (see `parseControllerDemand`).
   *
   * WHY NOT „the arm is up AT the mark". Because the arm is on a 90 s cycle
   * inside a 95 s par time: it comes back down while a perfectly correct
   * student is still driving the last 130 m, and refusing him then would be a
   * lie about a crossing he has already made properly. What is graded is the
   * crossing, at the crossing.
   *
   * IT CANNOT TRAP ANYONE, and that is the half checked before the half that
   * refuses. The latch is not one-shot: a student who creeps across barred and
   * comes round to cross again after the lift earns it back, the same escape
   * `requireControllerProceed` documents. And an unmeasurable channel never
   * refuses — absent `railCrossing` means the tick's author cannot answer, so
   * a zone that authors this key on a map with no rail span would never
   * complete, which is why the key is authored only on the two drills whose
   * district ships the timetable and why `rail-cross-when-clear.test.ts` pins
   * the census.
   */
  requireRailClear?: true;
  /**
   * THE CAR DID NOT REST WHERE THE BANNER SAYS IT DID NOT — sc-pk-rail-ban:
   * 84bce2a3 (critical), and the third term this file's own templates route
   * here rather than invent an instrument for.
   *
   * WHAT WAS ACTUALLY WRONG, off `w16/frames/sc-pk-rail-ban__mobile-wrong`.
   * One debrief, eight seconds apart:
   *
   *   Грешки              ✗ Спиране в забранена зона −3 изпитни т.
   *                         ОСНОВНА ГРЕШКА                        в 1:11
   *   Задачи от маршрута  ✓ Подмини цялата забранена зона, БЕЗ
   *                         ПРЕСТОЙ В НЕЯ                            1:19
   *
   * The product convicts the student of resting inside the чл. 98 zone and
   * then certifies, on the same screen, that he passed that zone without
   * resting. `sc-pkr-past-zone` is `{kind:"reachZone", x:4.06, y:275,
   * radiusM:6}` — a disc 19 m past the zone's end. Arrival was the whole
   * certificate, and «без престой в нея» was a sentence nothing measured.
   *
   * THE MEASUREMENT ALREADY EXISTS; ONLY THE READ WAS MISSING. Nothing new
   * observes anything here — `rules/engine.ts` bills `ILLEGAL_STOP_IN_BAN_ZONE`
   * (основна) for a rest inside an authored no-stopping span (`tick.noStopZone`) and
   * `RAIL_CROSSING_VIOLATION` detail `"stopped-on-track"` (опасна) for a rest
   * between the rails, both with their catalogue explanation, their «✔
   * Правилното действие» corrective and their law refs. This term makes the
   * credit read the conviction the same protocol has already written, exactly
   * as `requireNoContact` reads the collision and `requireRailClear` reads the
   * barred entry.
   *
   * WHICH LEDGER ROW FALSIFIES WHICH BANNER — `banZone` reads
   * ILLEGAL_STOP_IN_BAN_ZONE, `railBand` reads RAIL_CROSSING_VIOLATION detail
   * "stopped-on-track". SPLIT, NOT POOLED, on the rule `ReachZoneYieldDemand`
   * states in full: on this very drill the two acts are six metres and two
   * severity classes apart, and «Премини коловоза … без да спираш ВЪРХУ
   * РЕЛСИТЕ» is not falsified by a rest fifty metres short of them. A pooled
   * kind would withdraw a certificate for something it never claimed.
   *
   * A CLAIM ABOUT THE JOURNEY, so it is read per frame off the run's own
   * ledger and stays outside the `capMet` latch — the shape of the fourth,
   * fifth and sixth demands. The full design note (why the read is run-wide
   * rather than windowed, the census, the shown-but-not-charged half and the
   * two false-refusal risks that were checked before it shipped) lives on
   * `ReachZoneWitnessDemands.requireRestClean` in objectives.ts, which is where
   * the evaluator reads it.
   */
  requireRestClean?: ReachZoneRestDemand;
  /**
   * THE CAR WAS ON ITS OWN SIDE OF THE М1 THE BANNER NAMES —
   * sc-ov-solid-return:b542b84e (critical), and the fourth term this file's
   * own templates route here rather than invent an instrument for.
   *
   * WHAT IT MEANS. `true` = this waypoint is thrown away by a run that has been
   * convicted of `CROSSED_SOLID_LINE` — the основна the catalogue titles
   * «Пресичане на непрекъсната осева линия» — whether the sheet CHARGED it or
   * the teach-first coach gave the first one away as a card. Absent = no such
   * claim, which is every other gate in the catalogue.
   *
   * NOT POOLED WITH `CENTER_LINE_TOUCHED`, on the split rule
   * `ReachZoneRestDemand` states: touching the paint and crossing to the other
   * half of the carriageway are two acts with two codes and two prices, and a
   * banner about the second may not be withdrawn for the first.
   *
   * A CLAIM ABOUT THE JOURNEY, so it is read per frame off the run's own ledger
   * and stays outside the `capMet` latch — the shape of the four journey
   * demands above it. The full design note (the drive it closes, the census,
   * the coached half and the false-refusal checks) lives on
   * `ReachZoneWitnessDemands.requireSolidLineClean` in objectives.ts, which is
   * where the evaluator reads it.
   */
  requireSolidLineClean?: true;
  /**
   * «СПРИ НАПЪЛНО» MEANS THE STOP THE LAW MEANS — sc-merge-from-property:
   * ab353b86, and the fifth term this file's own templates route here.
   *
   * WHAT IT MEANS. `true` = this waypoint may be ticked only on a frame where
   * the rule engine is holding a full stop it would accept at a Б2 — ≤
   * `fullStopMaxSpeedKmh` for ≥ `fullStopMinDurationSec`, within
   * `stopRecencySec` (rules/types.ts). Absent = no such claim, which is every
   * other gate in the catalogue.
   *
   * WHY A CAP COULD NEVER CARRY IT. A halt gate states a SPEED
   * (`maxSpeedKmh`); the law states a speed AND a dwell AND a recency, and no
   * single number on this side can express the other two. So a banner promising
   * «спри НАПЪЛНО» and a −10 saying he did not could be printed on one sheet,
   * and were.
   *
   * The full design note — the protocol it closes, the measured order that
   * rules out an after-the-fact ledger read, and the checks that it cannot
   * refuse a drive which actually stopped — lives on
   * `ReachZoneWitnessDemands.requireFullStop` in objectives.ts, which is where
   * the evaluator reads it.
   */
  requireFullStop?: true;
  /**
   * THE CEILING THE ROAD GAVE WAS HELD OVER THE STRETCH THE BANNER NAMES —
   * sc-sp-wet-limit-plate:d9fd3821 (critical), and the sixth term this file's
   * own templates route here rather than invent an instrument for.
   *
   * WHAT IT MEANS. `true` = this waypoint is thrown away by a run that has been
   * convicted of exceeding the road's own ceiling — `SPEEDING_OVER_LIMIT` /
   * `SPEEDING_DANGEROUS` (ЗДвП чл. 21, ал. 1, the sign's number) or
   * `SPEED_TOO_FAST_FOR_CONDITIONS` (чл. 20, ал. 2, what the surface leaves of
   * it) — whether the sheet CHARGED it or the teach-first coach gave the first
   * one away as a card. Absent = no such claim, which is every other gate in
   * the catalogue.
   *
   * WHY A CAP COULD NEVER CARRY IT, and why the at-mark demand cannot either.
   * `maxSpeedKmh` is ONE template-wide number, so on a drill whose whole point
   * is that the lawful ceiling CHANGES with the weather it would fail the
   * lawful dry drive; and the title-derived `requireLawfulSpeed` reads the
   * speed at the tick's own position, which answers «законен ли си тук» and not
   * «задържа ли го дотук». This is the stretch-shaped reading, and it is a read
   * of the protocol rather than a second speedometer.
   *
   * A CLAIM ABOUT THE JOURNEY, so it is read per frame off the run's own ledger
   * and stays outside the `capMet` latch — the shape of the journey demands
   * above it. The full design note (the two demonstration drives it closes, why
   * the read is run-wide, the coached half and the strand-cutting arm that
   * keeps a refusal from becoming a trap) lives on
   * `ReachZoneWitnessDemands.requireSpeedClean` in objectives.ts, which is where
   * the evaluator reads it.
   */
  requireSpeedClean?: true;
  /**
   * REPORT THE ONCOMING GAP HE TURNED INTO, against this drill's taught norm,
   * in seconds — the authored half of the only key here that refuses nothing.
   * `done` is bit-identical with it and without it; what it adds is the
   * `ObjectiveDetail` («oncomingGap») the debrief prints on the row.
   *
   * The full design note — the two places the product already measured this and
   * never read either, why the norm is authored rather than taken from a
   * runtime constant, and why the 2–4 s band is the one that mattered — lives
   * on `ReachZoneWitnessDemands.reportOncomingGapSec` in objectives.ts, which
   * is where the evaluator reads it.
   */
  reportOncomingGapSec?: number;
}

/**
 * Which forbidden stretch a «без престой / без да спираш» banner is about.
 *
 * Declared here rather than in objectives.ts because this is the AUTHORED half
 * — templates write the key into `ScenarioObjectiveSpec.params`, which is this
 * union's `ReachZoneParams` — and objectives.ts already imports from this file
 * (the reverse edge would be a cycle). `ReachZoneYieldDemand`, whose key is
 * parsed but never authored, lives the other way round.
 */
export type ReachZoneRestDemand = "banZone" | "railBand";

/**
 * Vehicle crossed a stop line of the given control type near a district node.
 * The objective tracks PROGRESSION only — running the red is still "passing";
 * the rule engine adjudicates the violation separately. `nodeId` refers to
 * district-v1.json; the coordinates are denormalized into the spec so the
 * lesson engine never needs the world file at runtime.
 */
export interface PassSignalParams {
  kind: "passSignal";
  /** Intersection/signal node id from district-v1.json (traceability). */
  nodeId: string;
  x: number;
  y: number;
  /** How close to the node a stopLineCrossed event must occur to count. */
  radiusM: number;
  control: "trafficLight" | "stopSign";
  /**
   * A10 (trafficLight only): the objective completes only if the RUN has met
   * at least one red — this objective, or an earlier passSignal objective via
   * ObjectiveContext.redsMetInRun. A red counts as MET only when it was
   * HANDLED LAWFULLY, and there are exactly two ways to do that:
   *   · WAITED OUT — a full stop on this approach (inside the zone, or queued
   *     behind a light the world reports as forbidding), then a crossing on
   *     GREEN;
   *   · WAVED THROUGH — a crossing of a forbidding lamp carrying a
   *     регулировчик's `proceed`, which ЗДвП чл. 7 ranks above the светофар.
   * A red simply DRIVEN THROUGH, with nobody's permission, is not a met red;
   * it used to be, and the gate then certified itself with the very offence it
   * exists to forbid (stepPassSignal's header carries the staging
   * reproduction).
   *
   * Which of the two happened is recorded on the detail as `redMetVia`,
   * because the debrief prints it IN WORDS (SessionEndScreen) and the two are
   * opposite acts — one waited and one deliberately did not. No single
   * sentence covers both honestly, so the boolean alone is not a sufficient
   * record.
   *
   * Guards against a greens-only luck run "passing" L2 without the student
   * ever handling a red. The signal cycle guarantees feasibility: every light
   * shows red 26 s of every 50 s (runtime SIGNAL_TIMING), so stopping at the
   * line always meets a red within ≤ 24 s.
   */
  requireRedMet?: boolean;
}

/** Accumulate driven distance (odometer over position deltas). */
export interface DriveDistanceParams {
  kind: "driveDistance";
  meters: number;
}

/**
 * Come to a full stop from at least `minApproachKmh` without exceeding
 * `maxDecelMs2` (harsh braking re-arms the attempt — accelerate and retry).
 */
export interface SmoothStopParams {
  kind: "completeManeuver";
  maneuver: "smoothStop";
  minApproachKmh: number;
  maxDecelMs2: number;
}

/**
 * Emergency stop (L5 „Аварийно спиране") — STIMULUS-LOCKED since A10. The
 * old evaluator armed on speed alone, so any hard stop anywhere completed it
 * without a hazard ever appearing (audit D4: reaction untrained). Now the
 * objective is bound to the A8 staged encounter named by `stagedEventId`
 * (L5: "l5-braking-lead-car"): it completes ONLY from that encounter's
 * StagedEventOutcome — success requires detail "stoppedInTime" (full stop,
 * no collision); "hitLeadCar" / "passedWithoutStopping" leave it failed.
 * The measured reaction time (stimulus onset → first brake application) is
 * surfaced in the objective detail with a grade band (see REACTION_BAND_*
 * in objectives.ts). Outcomes are session facts (LessonSessionState
 * .stagedOutcomes), so an outcome earned before the objective activates
 * still counts — the behavior was performed and measured.
 */
export interface EmergencyStopParams {
  kind: "completeManeuver";
  maneuver: "emergencyStop";
  /** Id of the staged encounter (LessonSpec.stagedEvents) this stop grades from. */
  stagedEventId: string;
}

/**
 * Reverse-park (L7 „Паркиране") — BAY-LOCKED since A10. The old evaluator was
 * coordinate-free, so ANY reverse + ANY held stop anywhere completed it
 * (audit D4). Now completion requires the car at rest INSIDE the authored
 * bay rect (A5 `LessonSpec.parkingBay`, denormalized here): centre within
 * `centerTolM` of the bay centre, heading within `headingTolDeg` of the bay
 * axis (folded to 180° — the rect is symmetric), reverse gear used during
 * the current attempt, and the stop held `holdSec` continuous seconds.
 * Attempts are counted (leaving the bay and re-entering = a new attempt,
 * which also re-demands reverse); alignment quality goes into the objective
 * detail for the debrief.
 */
export interface ParkInBayParams {
  kind: "completeManeuver";
  maneuver: "parkInBay";
  /** Continuous seconds the vehicle must stay stopped to finish parking. */
  holdSec: number;
  /** The marked bay rect the park must land in (same values as LessonSpec.parkingBay). */
  bay: ParkingBaySpec;
  /** Max distance of the car centre from the bay centre at rest, m. */
  centerTolM: number;
  /** Max |heading − bay axis| at rest, degrees (folded to the 180° axis). */
  headingTolDeg: number;
  /**
   * Which gear must carry the bay entry (S2, additive — absent = "reverse",
   * the A10/D4-hardened default every existing lesson keeps byte-identical).
   * "forward": echelon/45° forward-entry drills (doc-72 PK-02 echelon
   * variant) — the CURRENT attempt's bay entry itself must happen in a
   * forward gear; the reverse-credit machinery is not consulted.
   */
  entry?: "reverse" | "forward";
}

/**
 * Enter the roundabout ring, then leave it again — WITH the right indicator
 * on in the exit window (A10; the L3 spec promises „излез с десен мигач").
 * An unsignaled exit resets the traversal: the student re-enters the ring
 * and exits properly. The exit window is the annulus between enterRadiusM
 * and the exit crossing, after having entered.
 */
export interface RoundaboutParams {
  kind: "completeManeuver";
  maneuver: "roundabout";
  x: number;
  y: number;
  /** Inside this radius of the island center counts as "in the roundabout". */
  enterRadiusM: number;
  /** Beyond this radius (after entering) counts as "exited". */
  exitRadiusM: number;
}

/**
 * Corridor rect a three-point turn must complete inside (bay-locked, like
 * parkInBay). Axis-oriented on the maneuver's `startHeadingDeg`: `halfLengthM`
 * runs ALONG the start heading (up the street), `halfWidthM` ACROSS it. Center
 * (x, y) in district space.
 */
export interface ThreePointTurnCorridor {
  x: number;
  y: number;
  halfWidthM: number;
  halfLengthM: number;
}

/**
 * Three-point turn / обратен завой (Наредба-38 exam-required, ЗДвП чл. 38) —
 * CORRIDOR-LOCKED, the parkInBay mold. Completes only when the car has REVERSED
 * its travel direction (~180°, ending within `toleranceDeg` of
 * `startHeadingDeg + 180`, folded to the 180° axis), at rest INSIDE the corridor
 * rect, held `holdSec` continuous seconds. A genuine turn on a narrow street is
 * three movements (forward-left, reverse-right, forward-away) — the evaluator
 * counts direction-change shunts (forward↔reverse) into the detail's `movements`
 * (= reversals + 1) so the rubric can grade economy; curb/obstacle contact
 * grades COLLISION through the existing obstacle-rect machinery (collisionMinKmh
 * 0, like parking). The evaluator never HARD-requires a reverse (a wide one-arc
 * U-turn is a 1-movement completion) — the narrow corridor + curbs are what make
 * the reverse physically necessary; economy is where the shunt count is judged.
 */
export interface ThreePointTurnParams {
  kind: "completeManeuver";
  maneuver: "threePointTurn";
  /** The bounded turn box the maneuver must complete inside (axis = startHeadingDeg). */
  corridor: ThreePointTurnCorridor;
  /** Travel heading at the start of the maneuver, deg (0 = north, cw). */
  startHeadingDeg: number;
  /** Max |final heading − (startHeadingDeg + 180)| folded to the 180° axis, deg. */
  toleranceDeg: number;
  /** Continuous seconds at rest (inside the corridor, facing back) to finish. */
  holdSec: number;
}

export type ManeuverParams =
  | SmoothStopParams
  | EmergencyStopParams
  | RoundaboutParams
  | ParkInBayParams
  | ThreePointTurnParams;

export type ObjectiveParams =
  | ReachZoneParams
  | PassSignalParams
  | DriveDistanceParams
  | ManeuverParams;

// ---------------------------------------------------------------------------
// Route finish (founder 2026-07-28 — see finish.ts for the full rationale)
// ---------------------------------------------------------------------------

/** Circular arrival zone marking where a lesson route ENDS, district meters. */
export interface RouteFinishZone {
  x: number;
  y: number;
  radiusM: number;
  /** Continuous seconds the arrival must hold before the finish trips. */
  dwellSec: number;
  /**
   * When set, only frames at/below this speed count toward `dwellSec` — the
   * difference between a finish you CROSS (a waypoint) and one you ARRIVE AT
   * (a parking bay, which every parallel-park route drives past on its way to
   * the pull-up pose). |speed| is compared, so reversing in counts.
   */
  maxSpeedKmh?: number;
  /**
   * WHICH SIDE of `radiusM` is the finish (B1, 2026-07-30).
   *
   * "inside" (the default, and every zone that shipped before this) — the
   * route ends AT a place: a waypoint, a junction, a painted bay. You arrive.
   *
   * "outside" — the route ends when you have LEFT a place. This is the only
   * honest shape for a maneuver whose target is where the WORK happens: the
   * roundabout island and the three-point-turn corridor are arrived at to
   * BEGIN the task, so an inside-zone there would trip while the student is
   * still working it. Standing still inside the ring can never end a drive;
   * driving away from it always can.
   */
  mode?: "inside" | "outside";
  /**
   * "outside" zones only: the vehicle must be observed WITHIN this radius
   * before leaving can count (you cannot leave somewhere you never reached).
   * Defaults to `radiusM`; always ≤ `radiusM`. For a roundabout this is the
   * ring's own `enterRadiusM`, so a car that merely passed nearby and turned
   * back has not "left the roundabout" — it never entered it.
   */
  armWithinM?: number;
  /**
   * "outside" zones only (O23, 2026-08-19) — the outer bound of the AUTHORED
   * WORK SITE, m: where the work stops and the margin begins.
   *
   * WHY THE ZONE HAS TO CARRY THIS RATHER THAN HAVE IT INFERRED. The band
   * between „you were here" (`armWithinM`) and „you have left" (`radiusM`) has
   * a standstill face — a car that stops in a margin has no exit, so
   * finish.ts's FINISH_OUTSIDE_STUCK_S closes the drive there. That face may
   * never reach into the work site itself (B1: standing still in the middle of
   * the work can never end a drive), so it needs to know where the work site
   * ENDS — and `armWithinM` is not that number for either of the two shapes
   * that get it wrong, in OPPOSITE directions:
   *
   *   · a `threePointTurn` arms on the circle INSCRIBED in its corridor, which
   *     is SMALLER than the box. Reading the arm as the work site put poses
   *     strictly inside the authored corridor into the „margin" and closed the
   *     lesson on a student pausing inside the box he was told to turn in
   *     (doc 88 §4 N3, two measured poses).
   *   · a `roundabout` arms on `enterRadiusM` and departs at `exitRadiusM`,
   *     an AUTHORED band that is wider than one margin on 48 of the 58 ring
   *     zones in the catalogue. Inferring the inner edge as
   *     `radiusM − FINISH_OUTSIDE_ANNULUS_M` handed the difference — up to
   *     5.0 m (`sc-rb-lane-choice`, enter 33 / exit 46) — back to NO AUTOMATIC
   *     ENDING: a car resting there is neither in the region nor in the band,
   *     so no gate in the module could ever close its drive.
   *
   * Absent = infer it, exactly as before (finish.ts `strandedBeyondM`), so a
   * hand-built zone and every recorded session behave bit-identically.
   */
  workSiteRadiusM?: number;
  /**
   * May this zone be consulted while the chain is ALREADY ON the terminal
   * objective (the B2 rescue)? False for anchors where being inside the zone
   * is the normal, correct state of a student still working: a parking bay
   * (mid-shuffle pauses), a red light held at a `requireRedMet` junction.
   * Those keep the stalled-chain rescue and get a standstill-gated rescue of
   * their own (finish.ts `terminalRescueZone`) or none at all.
   */
  terminalRescue?: boolean;
}

/**
 * B15 (2026-08-04) — per-session memory of the LAWFUL-WAIT hold that suspends
 * the finish gates (finish.ts `stepYieldWait`).
 *
 * The gates below end a session nobody is driving any more. They could not
 * tell that apart from a session someone is driving CORRECTLY: waiting at a
 * give-way line for a gap looks, to a gate that only reads position and speed,
 * exactly like an abandoned tab. It is the opposite — it is the single most
 * important thing a learner does at a junction, and the founder was failed for
 * doing it well after a 40-second wait.
 */
export interface YieldWaitState {
  /** Was the LAST tick a lawful stationary wait? (The gates are frozen on it.) */
  holding: boolean;
  /** Session time the current continuous hold began; null when not holding. */
  sinceSec: number | null;
  /**
   * WHY this frame is a lawful wait (finish.ts `yieldReasonAt`), or null when
   * it is not one. Never graded — the same "measurement channel, not a
   * verdict" contract `yieldWaitSec` rides.
   *
   * REQUIREMENT ZERO (doc 64 THEO-4) is why it is remembered rather than
   * recomputed at the caller. The hold used to publish only the BOOLEAN, so
   * every surface downstream — the advisor card, the teach channel — knew that
   * the student was waiting and could not say what for. The result was the
   * defect this field exists to close: for the whole minute he waited
   * correctly at the give-way line the product said nothing at all, and the
   * first thing it ever said about the priority car was a penalty. A virtual
   * instructor that explains every decision cannot narrate a duty it cannot
   * name.
   */
  reason: YieldReason | null;
  /**
   * Crossings the vehicle is inside the approach zone of WITH a pedestrian on
   * them (latched from `crossingZoneEntered`, released by `crossingPassed` /
   * `crossingZoneExited` / a re-entry event that clears the flag). Stopping for
   * a pedestrian is a yield the tick reports only as an event, so it has to be
   * remembered across frames like every other zone state in this module.
   */
  pedestrianCrossingIds: readonly string[];
}

/**
 * Why a frame is a lawful wait — for the instructor's voice, the tests and
 * telemetry, NEVER for grading. Declared here rather than in finish.ts (which
 * still re-exports it, so every existing import keeps working) because
 * `YieldWaitState` above now carries one and types.ts is the leaf of this
 * folder's import graph.
 */
export type YieldReason =
  | "giveWayLine"
  | "stopSign"
  | "redLight"
  | "pedestrian"
  | "roundaboutEntry";

/**
 * B15-VOICE (2026-08-05) — per-session memory of what the instructor has
 * ALREADY said about the wait in progress, so that saying it is not the same
 * as saying it again. See advisor.ts `stepYieldVoice`.
 *
 * The whole point of this state is the second half of the founder's
 * constraint: the fix for silence is not a line on every frame. A prompt that
 * repeats every two seconds is worse than saying nothing, so the voice is
 * STAGED — one line when the wait begins, one when it has lasted long enough
 * that the student starts doubting himself, one when he goes — and this is the
 * memory that keeps each of them to exactly once per wait.
 */
export interface YieldVoiceState {
  /** The wait being narrated; null = no wait is in progress. */
  reason: YieldReason | null;
  /** Session time that wait began (matches YieldWaitState.sinceSec). */
  sinceSec: number;
  /**
   * Session time the wait ended; null while it is still running. An episode
   * that ended only moments ago is still the SAME episode — a creep of one car
   * length in a queue, or speed noise around the standstill bar, must not
   * re-open the lecture.
   */
  endedAtSec: number | null;
  /** Staged lines already spoken for THIS episode: 0, 1 (named) or 2 (settled). */
  spoken: number;
  /**
   * A finished wait whose GAP has not been judged yet. The verdict is withheld
   * for `YIELD_VOICE_VERDICT_S` after the wheels turn, because the honest
   * evidence is what the rule engine does NEXT: a barged entry convicts within
   * ~1–3 s of moving into a visible conflict (worldRuntime's
   * YIELD_CONVICT_SUSTAIN_SEC 0.9 s + YIELD_BRAKE_RESPONSE_MAX_SEC 3.0 s).
   *
   * A yield-family fault graded inside the window DROPS this outright: the
   * graded card owns the moment, and this channel stays quiet rather than
   * congratulating a student the same screen is penalising.
   */
  pending: {
    reason: YieldReason;
    /** Seconds he actually stood there. */
    waitedSec: number;
    /** When the wheels turned; null = the wait ended but he has not moved yet
     *  (a light went green and he is still gathering himself). */
    wentAtSec: number | null;
  } | null;
}

/** Per-session memory of the route-finish gate (finish.ts `stepFinishGate`). */
export interface FinishGateState {
  /** The vehicle has been observed OUTSIDE the zone at least once — you
   *  cannot arrive somewhere you never left (a lesson may spawn in its bay). */
  armed: boolean;
  /** Start of the current continuous stay inside the zone; null = outside. */
  insideSinceSec: number | null;
  /**
   * WHICH FACE the clock above is currently timing (2026-08-19). "outside"
   * zones have two qualifying states with two different bars, and
   * `insideSinceSec` times both:
   *   · "region"   — away from the work site, counting `zone.dwellSec`
   *                  (FINISH_LEAVE_S) toward „this drive has left";
   *   · "stranded" — at a standstill in the BAND, counting
   *                  FINISH_OUTSIDE_STUCK_S toward „this drive has nowhere
   *                  left to go".
   *
   * WHY IT IS REMEMBERED RATHER THAN INFERRED. The two states are
   * geometrically exclusive but ADJACENT at `radiusM`, and until this field
   * the clock was silently carried across that boundary. A car that stood
   * still in the band for ≥ FINISH_LEAVE_S and then drove out arrived in the
   * region with its departure dwell already spent, so the drive ended on the
   * very frame it crossed the departure circle instead of FINISH_LEAVE_S
   * later. Those twenty seconds are not slack: they are the room B1
   * deliberately gives a student who leaves a roundabout without signalling to
   * realise it and swing back in, and closing the lesson under him is the
   * false refusal this module exists to refuse. Doc 88 §4 N3's third bullet
   * („one class of drive ending 20 s early") is this field.
   *
   * IT WAS ONCE A LABEL ON `insideSinceSec` RATHER THAN A SECOND CLOCK, and
   * that choice had a hole big enough to matter. The reasoning was sound as far
   * as it went — B15's freeze cleared `insideSinceSec` alone, so a second
   * stored clock would have escaped the freeze and banked a lawful wait toward
   * the stranded bar, which is precisely what B15 forbids. What it could not
   * do was reach `lessons/engine.ts` to clear a second field, so it took the
   * design the routing allowed.
   *
   * THE COST, measured: the two faces are ADJACENT at `radiusM`, so a car whose
   * distance STRADDLES the departure circle changes face on every crossing and
   * restarts the only clock there is. At 0.9 км/ч — a standstill by this
   * module's own `FINISH_STANDSTILL_KMH` — a ±1.2 m rock with a period under
   * 20 s accumulates NEITHER bar and the drive NEVER ENDS. An idling automatic
   * nudged on and off the brake near the circle does it. The pre-fix build
   * ended that same pose at +200.25 s: a lane whose entire subject is drives
   * nobody can end opened a new one.
   *
   * SO EACH FACE NOW CARRIES ITS OWN ACCUMULATED DWELL, and the freeze clears
   * both (`lessons/engine.ts`). Accumulated rather than a start-timestamp on
   * purpose, because timestamps are wrong in the other direction: a car that
   * stands in the region for 19 s, leaves for a minute and returns for one
   * frame must not read 80 s of dwell. Only seconds actually spent on a face
   * count toward that face's bar. The straddling car now accumulates on both
   * and ends; the leave-and-return car does not end early. `dwellFace` stays as
   * the label of the face the pose is on THIS frame — it no longer decides
   * whether a clock survives.
   */
  dwellFace?: "region" | "stranded";
  /**
   * Seconds already banked on the REGION face across earlier visits, plus the
   * same for the STRANDED face. `insideSinceSec` times the CURRENT visit to
   * whichever face `dwellFace` names; these hold what previous visits earned.
   * Both are cleared by B15's freeze together with `insideSinceSec`, so a
   * lawful wait can never be banked toward either bar.
   *
   * Absent = zero. An in-flight session predating these fields simply starts
   * both accumulators empty, which is the generous direction.
   */
  regionDwellSec?: number;
  strandedDwellSec?: number;
  /** Session time the finish tripped; null = the end is still ahead. */
  reachedAtSec: number | null;
}

// ---------------------------------------------------------------------------
// Objective runtime state
// ---------------------------------------------------------------------------

export type ObjectiveStatus = "pending" | "active" | "done";

/** Per-objective evaluator memory (discriminated by evaluator, not by kind). */
export type ObjectiveEvalState =
  | {
      /**
       * reachZone. Stateless until B4/B5 (2026-07-30): the evaluator used to
       * demand `inZone && slowEnough` on the SAME frame, so one fast pass
       * through an 8 m window permanently voided a gate that could then only
       * be satisfied by physically driving back — 178 capped waypoints across
       * 137 templates, and the sequential chain locks behind every one of
       * them. Both halves now LATCH, independently and monotonically.
       */
      type: "reachZone";
      /** The zone itself has been reached (see objectives.ts for the terms). */
      reached: boolean;
      /** The arrival speed cap has been honoured at least once at the zone;
       *  always true for an uncapped zone. */
      capMet: boolean;
      /** The „arrived, but too fast" HUD notice has been shown once (engine). */
      overCapNoted: boolean;
      /**
       * Where the vehicle was on the frame BEFORE it first entered the grace
       * ring of a capped zone — the only thing in a position-and-speed tick
       * that says which way the student was coming from, and therefore which
       * side of the mark is „short of it" and which is „past it". Taken from
       * the previous frame rather than the first inside one so a coarse tick
       * step (or a replayed trace) cannot latch it on top of the mark itself
       * and flatten the direction to nothing. Null until the ring is entered,
       * and on uncapped zones, which have no grace ring at all.
       */
      approachFrom: Vec2 | null;
      /** Previous frame's position — only used to derive `approachFrom`. */
      prevPos: Vec2 | null;
      /**
       * The car has been OUTSIDE this zone's grace ring at least once while
       * the objective was live — i.e. there was a real arrival to concede.
       * Latched, never cleared. Guards the halt arm of the grace only (doc 87
       * B3/B10/B11: „it states 2 tasks and it is only 1"): a drill that spawns
       * you three metres from its own halt mark ticked task 1 off at t = 0,
       * at rest, for having done nothing.
       */
      everOutside: boolean;
      /**
       * WHAT THIS APPROACH DID WITH THE SPEED CAP, as opposed to what the whole
       * arrival contract did — which is `capMet`, and which is a conjunction:
       * on the 29 gates that carry a lamp or gear demand beside their cap,
       * `capMet` is false on a car that honoured the cap perfectly and only
       * missed the switch. Grading the cap needed its own word.
       *
       *   „honoured" — the cap arm was satisfied at least once on this approach
       *                (at or under the cap, inside the acceptance or the grace
       *                capsule). Sticky: what the car does afterwards is
       *                `capMet`'s to withdraw and win back, exactly as shipped.
       *   „blown"    — the car went THROUGH the authored disc more than
       *                `REACH_ZONE_CAP_SLACK_KMH` over a FLOW cap having never
       *                honoured it, so the approach the banner names has
       *                already happened badly and no later slow frame beside
       *                the mark may re-issue the certificate.
       *   undefined  — neither yet.
       *
       * The two are mutually exclusive per frame (one needs speed ≤ cap, the
       * other > cap + slack), which is why they share one field.
       *
       * NOT `overCapNoted`, which fires at the bare cap, never clears, and
       * exists only to make the HUD card speak. This one carries the slack
       * band, ignores halt gates, and IS cleared by a genuine fresh approach
       * (see `stepReachZone`) — self-correction is the one thing a drill must
       * never punish.
       *
       * OPTIONAL, and absent means „neither" — every hand-built eval state (the
       * rigs, the fixtures, every replay recorded before this field existed)
       * omits it and behaves exactly as shipped.
       */
      approachCap?: "honoured" | "blown";
    }
  | {
      type: "passSignal";
      /** The matching stop line has been crossed (near the node). */
      crossed: boolean;
      /**
       * Full stop observed inside the zone during the CURRENT visit (resets
       * on leaving the zone) — the observable signature of waiting at the
       * light; combined with a green crossing it certifies a met red.
       */
      stoppedInZoneVisit: boolean;
      /** This objective's junction contributed a met red to the run (A10). */
      redMet: boolean;
      /**
       * WHICH of the two lawful signatures certified it, latched with `redMet`
       * on the frame it first fired; null while no red has been met here. The
       * debrief says this out loud, so it has to survive the run and not be
       * re-derived from a boolean that cannot tell the two apart.
       */
      redMetVia: RedMetVia | null;
    }
  | { type: "driveDistance"; accumulatedM: number; prevPos: Vec2 | null }
  | {
      type: "smoothStop";
      /** True once the vehicle reached the minimum approach speed. */
      armed: boolean;
      /** Peak deceleration observed during the current armed attempt, m/s². */
      maxDecelMs2: number;
      prevSpeedKmh: number | null;
      prevT: number | null;
    }
  /**
   * emergencyStop is outcome-driven since A10 (no tick memory): completion
   * reads the staged encounter's StagedEventOutcome from ObjectiveContext.
   */
  | { type: "emergencyStop" }
  | {
      type: "roundabout";
      entered: boolean;
      /** Right indicator observed in the exit window after entering (A10). */
      exitSignaled: boolean;
      /**
       * B21-RB (2026-08-11): degrees of arc about the island the car has
       * travelled since the LAST frame the right stalk was live while it was
       * still ON the ring — null until there has been such a frame, zeroed by
       * every further lit frame, and cleared by a voided traversal. So what it
       * holds is how far past his own signal the student now is. Degrees, not
       * seconds: measured, the two currencies disagree, and only this one
       * separates a correct slow exit from a signal flicked a lap ago (see
       * ROUNDABOUT_EXIT_SIGNAL_ARC_DEG).
       */
      ringSignalArcDeg: number | null;
      /** Previous tick's azimuth about the island, deg — the arc integrator's
       *  only state. Null before entering and after a voided traversal. */
      prevAzimuthDeg: number | null;
      /**
       * 2026-08-17: NET degrees of arc travelled about the island while INSIDE
       * `enterRadiusM`, since the current attempt latched — signed, so a car
       * that shuffles at the give-way line cancels itself out and only real
       * rotation about the island accumulates. This is the „премини ПРЕЗ
       * кръговото" half of the objective: `entered` alone is satisfied 6–11 m
       * short of the carriageway, so without this a car that reached the
       * give-way line, turned right down the side road and drove off collected
       * the traversal. Cleared by a void and by an abandoned attempt.
       *
       * NULL MEANS UNMEASURABLE, and it is not a corner case: objectives are
       * SEQUENTIAL (engine.ts steps only the current one), so four of the five
       * shipped roundabout drills start evaluating this objective with the car
       * ALREADY on the ring or in the pocket past it — sc-rb-ped-exit's own
       * header spells the arithmetic out. The evaluator cannot demand arc it
       * was never watching, so the passage is required only of attempts it saw
       * begin from OUTSIDE `exitRadiusM`; in every such drill an earlier
       * objective (a zone ON the ring) has already gated the traversal.
       * See ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG.
       */
      traversalArcDeg: number | null;
      /**
       * Previous azimuth sampled while INSIDE `enterRadiusM`, deg — null
       * whenever the last tick was outside it. Separate from `prevAzimuthDeg`
       * (which keeps running out to `exitRadiusM`, because the signal memory is
       * spent by driving away) so that arc travelled OUTSIDE the ring can never
       * be banked as traversal: without it, a lap around the outside of the
       * roundabout and back into the mouth would read as a passage.
       */
      insideAzimuthDeg: number | null;
      /**
       * B6 (2026-07-30): ring exits taken WITHOUT the right indicator. The
       * traversal still resets (the skill has to be performed, not banked),
       * but the reset is no longer SILENT — the engine turns each increment
       * into an explaining HUD card, and finish.ts gives the maneuver a
       * leave-the-ring finish so „redo it" is a choice instead of the only
       * way out of a lesson that could not otherwise end.
       */
      voidedExits: number;
    }
  | {
      type: "parkInBay";
      /**
       * Reverse gear engaged during the CURRENT attempt (reset when the car
       * leaves the bay — a new attempt must reverse again).
       */
      usedReverse: boolean;
      /**
       * The CURRENT bay entry happened in a forward gear (set on the
       * outside → inside transition, cleared on exit) — the gate the
       * `entry: "forward"` variant checks instead of usedReverse (S2).
       */
      enteredForward: boolean;
      /** Session time the current continuous in-bay stop began; null while moving. */
      stoppedSinceT: number | null;
      /** Car centre currently inside the bay rect. */
      inBay: boolean;
      /** Bay entries so far (outside → inside transitions). */
      attempts: number;
    }
  | {
      type: "threePointTurn";
      /** Car centre has been inside the corridor at least once. */
      entered: boolean;
      /**
       * Last non-zero travel direction (−1 reverse, +1 forward, 0 = none yet).
       * Tracked only after entering the corridor — used to count shunts.
       */
      lastDir: number;
      /** Direction-change shunts (forward↔reverse) since entering the corridor. */
      reversals: number;
      /** Session time the current continuous in-corridor at-rest stop began; null while moving/outside. */
      stoppedSinceT: number | null;
    };

// ---------------------------------------------------------------------------
// Objective detail (A10) — measurement channel for HUD + debrief
// ---------------------------------------------------------------------------

/** Final-position quality of a park (debrief: „centred" vs „sloppy"). */
export type ParkAlignment = "centered" | "acceptable" | "sloppy";

/** Reaction-time grade band for the stimulus-locked emergency stop (A10). */
export type ReactionBand = "otlichen" | "dobur" | "baven";

/**
 * The two lawful ways a red can be MET at a signalized junction — kept apart
 * because they are OPPOSITE ACTS and the debrief prints them in words:
 *  · "waitedOutGreen"    — stopped on the approach, then away on GREEN;
 *  · "controllerProceed" — never stopped, crossed a forbidding lamp on a
 *    регулировчик's signal (ЗДвП чл. 7 puts him above the светофар, and the
 *    rule engine treats such a crossing as innocent even on red).
 *
 * The distinction exists because one sentence used to serve both. The debrief
 * said „Изчака червения сигнал и потегли на зелено" for every met red, so
 * `sc-sig-controller-live` — whose bot crosses red at 22 km/h on the officer's
 * wave and whose ONLY completion path is that wave — congratulated the student,
 * in words, for a wait that never happened, on every successful run. THEO-4:
 * the student is owed the reasoning, which means the account has to be true.
 */
export type RedMetVia = "waitedOutGreen" | "controllerProceed";

/**
 * Structured per-objective measurements the evaluators surface alongside
 * done/progress (A10). Additive: only the hardened evaluators emit one; the
 * engine mirrors it onto ObjectiveProgress and buildLessonResult copies it
 * onto ObjectiveOutcome so the debrief can cite reaction time, park
 * alignment, attempts, and the red-light record without re-deriving them.
 */
export type ObjectiveDetail =
  | {
      kind: "parkInBay";
      attempts: number;
      inBay: boolean;
      /** Distance of car centre from bay centre, m; null while outside the bay. */
      centerOffsetM: number | null;
      /** |heading − bay axis| folded to 180°, degrees; null while outside. */
      headingOffsetDeg: number | null;
      /** Quality at the current/final in-bay stop; null while moving/outside. */
      alignment: ParkAlignment | null;
    }
  | {
      kind: "emergencyStop";
      /** Encounter resolution ("pending" until the staged event resolves). */
      outcome: "pending" | "stoppedInTime" | "hitLeadCar" | "passedWithoutStopping" | "collision";
      /** Stimulus onset → first brake application, s (null until measured). */
      reactionTimeSec: number | null;
      band: ReactionBand | null;
      /** Remaining bumper gap at full stop, m. */
      stopGapM: number | null;
    }
  | {
      kind: "passSignal";
      /** Reds met across the whole run (all passSignal objectives so far). */
      redsMetInRun: number;
      /** This objective's junction contributed a met red. */
      redMetHere: boolean;
      /**
       * HOW that red was met — see RedMetVia. Null when none was met here, and
       * on pre-2026-08-17 payloads replayed through wire.ts, which recorded the
       * boolean but not the act; the debrief falls back to a sentence true of
       * both signatures rather than guessing one.
       */
      redMetVia: RedMetVia | null;
    }
  | {
      /**
       * N1 (doc 72 JU-10): the gap the student actually turned into, in the
       * unit his briefing counts in. `OncomingLeftTurnRunner` has measured
       * `acceptedGapSec` since A8 and no surface ever read it, so the one drill
       * whose whole subject is „прецени интервала в СЕКУНДИ" never told the
       * student what his interval was. The runtime convicts only the ≤ 2 s cut;
       * between that and the taught 4 s norm nothing was said at all.
       */
      kind: "oncomingGap";
      /** Tightest gap the student turned into, s — how long the nearest
       *  oncoming still needed to reach the junction at his commit. null = none
       *  was inbound then (he waited them out, or the road was clear). */
      acceptedGapSec: number | null;
      /** The taught norm it is read against, s (authored on the gate). */
      normSec: number;
    }
  | { kind: "roundabout"; entered: boolean; exitSignaled: boolean }
  | {
      kind: "threePointTurn";
      /** Car centre has been inside the corridor. */
      entered: boolean;
      /** Direction-change shunts (forward↔reverse) used in the corridor. */
      reversals: number;
      /** Movements = reversals + 1 (a clean three-point turn is 3); 0 before entering. */
      movements: number;
      /** Current |heading − target| folded to the 180° axis, deg; null before entering. */
      headingToTargetDeg: number | null;
    };

export interface ObjectiveProgress {
  spec: LessonObjective;
  params: ObjectiveParams;
  status: ObjectiveStatus;
  /** 0..1 for the HUD progress bar (distance/maneuver phases); 0 when N/A. */
  progress: number;
  completedAtSec: number | null;
  /** A10 measurement channel (attempts, reaction band, …); hardened evaluators only. */
  detail?: ObjectiveDetail;
}

// ---------------------------------------------------------------------------
// Teach moment (A9 — pause + card instead of a drive-by toast)
// ---------------------------------------------------------------------------

/**
 * A first, teachable encounter the shell must PAUSE for (doc 65 §5): freeze
 * physics, show the mini-lesson card with the authored law-cited WHY, resume
 * on acknowledgment. Emitted by applyTick for teach-mode coach decisions only
 * — опасна/terminating mistakes never become teach moments (safety floor:
 * they grade from the first encounter and keep the non-blocking toast, so a
 * modal never interrupts evasive handling mid-incident).
 */
export interface TeachMoment {
  /** Rule-catalog violation code that triggered the teachable moment. */
  code: string;
  /** Scenario event id it maps to (null → coached by its own code). */
  scenarioId: string | null;
  titleBg: string;
  /** Authored explanation from the violation catalog (ADR-002: no free text). */
  explanationBg: string;
  /** Legal basis, e.g. "ЗДвП чл. 21" — rendered as the law-ref chip. */
  lawRef?: string;
  /** Official class + points a REPEAT would cost — the card states the stake. */
  severity: SeverityClass;
  points: number;
  /** Session time of the mistake, seconds. */
  t: number;
}

/**
 * ONE VIOLATION THE STUDENT WAS SHOWN AND THE SCORE DELIBERATELY DID NOT
 * CHARGE — the teach-first-then-grade half of the drive, recorded so the
 * surfaces that describe the whole drive stop describing only the ledger.
 *
 * WHY A STATE CHANNEL AND NOT THE UI QUEUE. `DebriefContext.coachedMistakes`
 * existed, was documented, was filtered, was tested — and NO live caller fed
 * it: neither `actions.ts:315` (the debrief the student actually reads) nor
 * `LessonPlayShell.tsx:3483` (the fallback) passed the field, so the whole
 * repair was dead code and the debrief still wrote «чисто каране без нито
 * едно нарушение» on drives whose HUD had raised «Превишена скорост» twice
 * (measured: sweep161 `sc-signal-flashing`/mobile-wrong 04-t012s, 59 км/ч
 * under a 50 badge, «(+1)»; wave-c `sc-signal-hesitation`/mobile-wrong the
 * same shape — findings ef1eb9cf, a448e5f0, 0fde4ec0, faae7057). The UI's
 * `teachQueue` could not close this: it sees only the PAUSE arm, while the
 * rate-limited toast downgrade and the ambient learn-only toast never reach
 * it. So the ENGINE records every unscored display arm here, the result
 * carries it, and both debrief call sites read it off the result.
 *
 * Titles are catalog copy stamped at emission (ADR-002); the wire drops them
 * and the server re-derives from the catalog by code, so a client cannot
 * author a sentence into its own debrief.
 */
export interface CoachedMistake {
  /** Rule-catalog violation code (plain string — future codes pass through). */
  code: string;
  /** Catalog title at emission — display only; the server re-derives it. */
  titleBg: string;
  /** Session time of the mistake, seconds. */
  t: number;
}

// ---------------------------------------------------------------------------
// A15 — mistake-map measurement channels (both ADDITIVE)
// ---------------------------------------------------------------------------

/**
 * World position of one scored event (A15 mistake map). The rule engine's
 * ScorableEvent deliberately carries no position (rules/ adjudicates law, not
 * geometry) — the lessons engine records it here AT EMISSION TIME from the
 * very SimTick the event fired on, paired back to its event by (kind, code, t)
 * exactly like PenaltyEscalation pairs. Pre-drive events (no tick in hand)
 * simply have no record — their mistake rows render without a map marker.
 */
export interface EventPosition {
  kind: "violation" | "commendation";
  /** Rule-catalog code — pairs with ScorableEvent.code. */
  code: string;
  /** Session time of the event, seconds — pairs with ScorableEvent.t. */
  t: number;
  /** World position, meters (SimTick.position at emission). */
  x: number;
  y: number;
}

/**
 * One near-miss encounter as the SESSION records it (A15): the A11 traffic
 * stat (contracts.ts NearMissEvent) plus the player position the shell
 * captured when the encounter resolved — clearance is sub-meter, so the
 * player's own position IS the encounter location for map purposes. Nothing
 * here is graded (deliberately no ViolationCode); the end screen plots these
 * as "мина на косъм" rings.
 */
export interface SessionNearMiss {
  /** Session time at resolution, s. */
  tSec: number;
  /** What was nearly hit. */
  kind: "vehicle" | "pedestrian" | "cyclist";
  /** Tightest body-envelope clearance during the encounter, m (0 = brushed). */
  clearanceM: number;
  /** Peak relative speed during the encounter, m/s. */
  relSpeedMps: number;
  /** Player world position at resolution, m; null when no tick was in hand. */
  x: number | null;
  y: number | null;
}

// ---------------------------------------------------------------------------
// A13 — exam termination (examMode sessions only)
// ---------------------------------------------------------------------------

/**
 * Why an exam session terminated mid-route (A13). The first three mirror the
 * official fail rule (rules/summary.ts FailReason — doc 32: no опасна, ≤ 9
 * total, ≤ 6 from основни); "collision" is the terminateSession catalog flag
 * (a ПТП ends the real exam on the spot). In examMode these end the session
 * THE MOMENT they occur — unlike training lessons, which keep driving for
 * learning value and only fold the verdict at the end.
 */
export type ExamTerminationReason =
  | "collision"
  | "dangerous-mistake"
  | "total-points-exceeded"
  | "osnovni-points-exceeded";

/** The termination record: what ended the exam, and when. */
export interface ExamTermination {
  reason: ExamTerminationReason;
  /** Session time of the violation that tripped the limit, seconds. */
  tSec: number;
}

// ---------------------------------------------------------------------------
// Lesson session state (the pure reducer state)
// ---------------------------------------------------------------------------

export type LessonPhase = "preDrive" | "driving" | "completed" | "aborted";

export interface LessonSessionState {
  lesson: LessonSpec;
  phase: LessonPhase;
  isNight: boolean;
  /** Pre-drive machine — non-null only when lesson.preDrive is true. */
  preDrive: PreDriveMachine | null;
  rules: RuleEngineState;
  objectives: ObjectiveProgress[];
  evalStates: ObjectiveEvalState[];
  /** Index of the active objective; === objectives.length when all are done. */
  currentObjectiveIndex: number;
  /** Every scorable event of the session (rule engine + pre-drive machine).
   *  Coached: a first, teachable mistake is shown live but NOT added here. */
  events: ScorableEvent[];
  /** How many times each scenario has been encountered — drives teach-first-then-grade. */
  scenarioEncounters: Record<string, number>;
  /**
   * Scored repeats the coach graded above ×1.0, in order (A9). Folded into the
   * result's effective score by buildLessonResult; the base `events` stay
   * official/catalog-fixed.
   */
  penaltyEscalations: PenaltyEscalation[];
  /**
   * Session time the last teach-moment PAUSE was emitted (null = none yet) —
   * the rate limit that keeps a mistake cluster from chaining pauses.
   */
  lastTeachMomentAtSec: number | null;
  /**
   * Every violation shown to the student that the score deliberately did not
   * charge (see CoachedMistake): the teach-pause card, its rate-limited toast
   * downgrade, the learn-only ambient toast and the THEO-3 consequence moment
   * all record here at emission. The `events` comment above says „shown live
   * but NOT added here" — this is where it IS added, so the debrief and the
   * verdict copy can stop mistaking the ledger for the drive.
   */
  coachedMistakes: CoachedMistake[];
  /** Session time of the last processed tick, seconds. */
  lastT: number;
  /**
   * FRAME-ZERO POSE GUARD (doc 87 B3/B10/B11 — „it states 2 tasks and it is
   * only 1 task"). Session time of the first tick that DESCRIBED THE VEHICLE:
   * the first one carrying motion, or a position different from the one the
   * session opened on. Undefined until then, and while it is undefined the
   * objective chain does not advance.
   *
   * The scene mounts its pose buffer at the DISTRICT ORIGIN
   * (scene/vehicleSample.ts `createVehicleSample` → position {0, 0}) and ticks
   * this engine with it for the frames before the chassis writes its first
   * pose. Four shipped drills author their first waypoint within one car
   * length of that origin — sc-park-perp-rev (6.07 m), sc-park-parallel
   * (7.30), sc-park-narrow (5.87), sc-park-bay-exit-rev (3.19) — so their
   * „ЗАДАЧА 1/2" was ticked off by a car that did not exist yet, at a place
   * 111 m from where the student was actually sitting. sc-park-45, whose gate
   * is authored away from the origin, was the one bay drill the founder found
   * honest; that is the same fact from the other side.
   *
   * Held in the LESSON engine rather than patched in the scene because the
   * rule is a grading rule and belongs where grading lives: an objective is
   * earned by driving, and nothing has been driven while the car has not
   * moved. When the scene stops publishing the placeholder pose this guard
   * costs exactly one frame and changes nothing.
   *
   * B-NEW-1 (doc 87:229): the ROUTE-FINISH gates obey it too, and that is
   * what the guard originally missed. `rb-mini-v1` centres its ring on
   * exactly (0, 0), so the placeholder pose sat inside the roundabout
   * finish's arming circle and armed „you have left the ring" before the
   * student had moved a centimetre; the car then dwelt outside it — at its
   * own spawn — and the drive „finished" FINISH_LEAVE_S later. Same rule,
   * same reason: a drive that has not begun cannot end.
   */
  posedAtSec?: number;
  endedAtSec: number | null;
  /**
   * A8 (additive): resolved staged-encounter outcomes, in resolution order.
   * The GRADED consequences already live in `events` (the orchestrator emits
   * only existing SimTick vocabulary); this is the measurement channel —
   * `reactionTimeSec` on the l5-braking-lead-car outcome is the
   * stimulus→brake-onset delta A10 locks the L5 objective to. Populated via
   * `applyStagedOutcome` (engine.ts) from LessonScene's onStagedOutcome
   * callback; absent on sessions predating A8.
   */
  stagedOutcomes?: StagedEventOutcome[];
  /**
   * A15 (additive): world positions of the SCORED events, recorded by
   * applyTick from the tick each event fired on — see EventPosition. Only
   * tick-emitted events appear (pre-drive events carry no position).
   */
  eventPositions?: EventPosition[];
  /**
   * A15 (additive): near-miss encounters, in resolution order — recorded via
   * `applyNearMiss` (engine.ts) from LessonScene's onNearMiss callback (A11).
   * Session stat only; never folds into any score.
   */
  nearMisses?: SessionNearMiss[];
  /**
   * A13 (additive; examMode sessions only): set the moment the exam
   * terminated on the official limits (exam.ts examTerminationFor) — the
   * session phase flips to "completed" on the same step. Absent on training
   * lessons and on exams that finished the route within limits.
   */
  examTermination?: ExamTermination;
  /**
   * THEO-3 (additive; lesson.mistakeExperience sessions only): session time
   * the targeted wrong action first fired — the one-shot latch behind the
   * consequence moment (applyTick emits `mistakeMoment` exactly once).
   * Absent on every other session and until the mistake happens.
   */
  mistakeExperienceHitAtSec?: number;
  /**
   * Route-finish gate (founder 2026-07-28; additive — absent until the first
   * tick that consults it, and never present on routes with no locatable end).
   * Tracked ONLY while the sequential chain has not yet reached the final
   * objective: it is the escape hatch that lets a student who skipped a task
   * still END the drive by reaching the end of the route, instead of being
   * made to re-drive it correctly before he may see what he did wrong. See
   * finish.ts — it changes WHEN a session stops, never WHAT is graded.
   */
  finishGate?: FinishGateState;
  /**
   * B2/B3 (2026-07-30) — the STANDSTILL rescue, tracked independently and on
   * every frame, whichever objective is active. It answers one question the
   * gate above deliberately cannot: „is this car simply stuck?" The evidence
   * is a full standstill held at the end of the route (finish.ts
   * `terminalRescueZone`), which no approach, creep, park shuffle or
   * red-light wait produces, and it needs its own dwell memory because the
   * two gates watch different zones with different criteria.
   *
   * It runs alongside the stalled-chain gate rather than only in its place
   * because a compact route (a parking lot, where the pull-up pose is 10 m
   * from the bay) clamps that gate below one lane wide — so a car parked at
   * the end of the route, three metres off, satisfied neither of them and had
   * no way out at all.
   */
  finishRescueGate?: FinishGateState;
  /**
   * O30 (additive, armed 2026-08-24) — the DEPARTURE gate on a terminal
   * arrival waypoint (finish.ts `terminalDepartureZone`). The third zone the
   * two above cannot express: a car that drove THROUGH the end of the route
   * and kept going satisfies neither presence at the mark nor a standstill at
   * it, and nothing else in the module is anchored anywhere it still is. Its
   * dwell is FINISH_DEPARTED_S (75 s, sized so the recorded
   * overshoot-and-return drive is NOT refused), frozen by the lawful wait like
   * both gates above. Absent until the first tick that consults it, so no
   * recorded session can reach it.
   */
  finishDepartureGate?: FinishGateState;
  /**
   * B15 (additive) — the lawful-wait hold that FREEZES the three gates above.
   * See YieldWaitState and finish.ts `stepYieldWait`. Absent until the first
   * tick that consults it.
   */
  yieldWait?: YieldWaitState;
  /**
   * B15 (additive) — total session seconds spent lawfully stationary at a
   * yield (give-way line, stop sign, red light, pedestrian on a crossing, or
   * short of a roundabout the route still has to enter).
   *
   * Two consumers, and NEITHER of them grades: the finish gates read the live
   * `yieldWait` above, and the scenario rubric subtracts this total before it
   * compares the drive against `parTimeSec`, so a student who waits forty
   * seconds for a real gap is not told he was slow for doing the one thing the
   * lesson asked of him. Points, pass/fail and stars never see it.
   */
  yieldWaitSec?: number;
  /**
   * B15-VOICE (additive) — what the instructor has already said about the wait
   * in progress (advisor.ts `stepYieldVoice`). Absent until the first tick
   * that consults it; inert on exam sessions, where the advisor is silent by
   * design and coaching a live yield would be feeding the candidate the
   * answer.
   */
  yieldVoice?: YieldVoiceState;
  /**
   * FR-B5-JAM (additive) — the CRASH PIN (finish.ts CRASH_PIN_STUCK_S).
   *
   * Armed by a graded COLLISION with the pose it happened at; disarmed the
   * moment the car leaves CRASH_PIN_RADIUS_M of that pose (it drove away, so
   * it is not stuck). `stillSinceSec` is the session time the car last came to
   * a complete standstill inside that radius, or null while it is moving —
   * frozen, like both finish gates, while the lawful-wait hold is on.
   *
   * Absent on every session until the first collision, so no existing drive
   * can reach it.
   */
  crashPin?: {
    atSec: number;
    x: number;
    y: number;
    stillSinceSec: number | null;
  };
  /**
   * O22 — session time the current OFF-NETWORK run began (`finish.ts`
   * `stepOffNetwork`), or null while the car is on a road the world authored.
   *
   * Fourteen drives in the sweep could not be ended by anything at all. The
   * class that survived measurement is a car NO LONGER IN THE AUTHORED WORLD —
   * `sc-junction-blind/pc-right/04-t090s.png` is a featureless green plane at
   * 0 км/ч with the task chip still reading «ЗАДАЧА 2/2 · Завий наляво». No
   * standstill bar can reach it, because those drives oscillate rather than
   * stand still, and no duration cap may be added instead: that would end
   * drives on a timer regardless of what the student is doing, which is a false
   * refusal manufactured to answer a missing ending.
   *
   * A primitive rather than an object so `finish.ts` need not be imported here.
   * Absent on every session that predates it, and `stepOffNetwork` treats an
   * absent `edgeId` as innocent — only an explicit null is the runtime SAYING
   * there is no road here — so no recorded trace or hand-built tick can trip it.
   */
  offNetworkSinceSec?: number | null;
  /**
   * THE RUN-OUT (additive, 2026-08-16) — the drive between finishing the last
   * task and reaching the end of the route.
   *
   * Armed on the frame the sequential chain completes, IF the route ends at an
   * arrival waypoint the car has not physically reached yet — which was the
   * normal case, because a `reachZone` is satisfied at the EDGE of its
   * tolerance and the terminal ring is 10 m wide on catalogue average. See
   * finish.ts `routeEndMark` for the measurement and for which routes get one.
   *
   * `fromX/fromY` pin where the run-out began (always on the approach side of
   * the mark) so „past the mark" has an axis; `elapsedSec` accrues only on
   * frames that are evidence — the lawful-wait freeze skips it, exactly as it
   * skips the finish gates' dwell.
   *
   * Absent on every route that ends nowhere and on every drive that was
   * already at the mark, so those terminate on the chain exactly as before.
   */
  routeRunOut?: {
    markX: number;
    markY: number;
    fromX: number;
    fromY: number;
    elapsedSec: number;
  };
}

// ---------------------------------------------------------------------------
// Result (input for persistence, debrief and the session-end screen)
// ---------------------------------------------------------------------------

export interface ObjectiveOutcome {
  id: string;
  titleBg: string;
  done: boolean;
  completedAtSec: number | null;
  /** A10 measurement channel, carried into the result for the debrief. */
  detail?: ObjectiveDetail;
}

// ---------------------------------------------------------------------------
// Gamification hook (integration ask — see note)
// ---------------------------------------------------------------------------

/**
 * INTEGRATION ASK (gamification module): the activity event a finished sim
 * lesson SHOULD report. `GamificationEvent` (modules/gamification/types.ts)
 * is a CLOSED union of practice_answer | exam_completed, so trackActivity
 * cannot accept this yet — per module-boundary rules we do NOT widen another
 * module's contract from here. Once the union gains this member (and
 * xpForEvent a case for it — suggested: base XP + pass bonus, scaled down for
 * repeat passes), call `trackActivity(userId, event)` in
 * src/app/(dashboard)/simulator/actions.ts right after saveSession (the
 * call site is marked). Until then sim lessons award no XP and the session-end
 * screen hides the XP chip.
 */
export interface SimLessonGamificationEvent {
  type: "sim_lesson";
  passed: boolean;
  /** Penalty points, 0 = perfect (NOT a 0..97 exam score). */
  score: number;
}

export interface LessonResult {
  lessonId: string;
  /** Official-format fold of every scorable event (rules/summary.ts). */
  summary: SessionSummary;
  objectives: ObjectiveOutcome[];
  /** True when every objective completed (vacuously true for free drive). */
  completedAll: boolean;
  aborted: boolean;
  /**
   * The lesson verdict: official pass rule AND all objectives done AND not
   * aborted. A free drive (no objectives) passes purely on the official rule.
   */
  passed: boolean;
  /** Total penalty points (lower is better) — stored in SimSession.score. */
  score: number;
  /**
   * Training-layer total with repeat escalation applied (×1.5/×2.0 per doc 65;
   * A9). Always ≥ `score`; fractional halves possible (3 × 1.5 = 4.5). The
   * official verdict (`passed`/`summary`) is NEVER derived from this — the
   * exam pass rule stays on official base points.
   */
  effectiveScore: number;
  /** The repeat mistakes that graded harder — debrief shows „повторна ×1.5". */
  escalations: EscalatedMistake[];
  durationSec: number;
  /**
   * B15 (additive): of `durationSec`, how many seconds were spent lawfully
   * STATIONARY at a yield — see LessonSessionState.yieldWaitSec. Read by the
   * scenario rubric's informational par-time line and by nothing else; absent
   * on server-rebuilt results (wire.ts times the drive by wall clock), which
   * leaves that line exactly as it shipped.
   */
  yieldWaitSec?: number;
  /**
   * A15 (additive): positions of the scored events for the end-screen mistake
   * map, paired to summary.mistakes/commendations by (kind, code, t). Absent
   * on server-graded results rebuilt purely from the wire (positions are
   * display metadata — the server never grades from them).
   */
  eventPositions?: EventPosition[];
  /** A15 (additive): the session's near-miss encounters ("мина на косъм"). */
  nearMisses?: SessionNearMiss[];
  /**
   * A13 (additive; examMode only): why the exam terminated mid-route, for the
   * examiner-style end framing („Изпитът се прекратява: …"). Derived on the
   * client from the live session and REDERIVED server-side from the rebuilt
   * catalog events (wire.ts) — never trusted from the client.
   */
  examTermination?: ExamTermination;
  /**
   * The violations the drive SHOWED and the score deliberately did NOT charge
   * (additive; see CoachedMistake). Client results copy the engine state's
   * record; server-rebuilt results re-derive titles from the catalog over the
   * wire's code+t list. Absent = none recorded (older sessions, clean drives).
   * Both debrief call sites feed `DebriefContext.coachedMistakes` from THIS
   * field — the context channel had no live producer before it.
   */
  coachedMistakes?: CoachedMistake[];
}
