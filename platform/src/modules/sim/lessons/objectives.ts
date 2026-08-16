/**
 * Objective evaluators — pure functions that decide, tick by tick, whether
 * the ACTIVE lesson objective just completed.
 *
 * Design decisions (documented):
 *  - Objectives are strictly SEQUENTIAL: only the active one advances. The
 *    banner always shows exactly one task; a student can never "accidentally"
 *    complete objective 3 while objective 1 is open.
 *  - Objectives verify THE BEHAVIOR THEY NAME (A10). v1 measured raw
 *    progression only, which left cheat paths open (audit D4): parkInBay
 *    completed on any reverse + stop anywhere, emergencyStop on any hard stop
 *    with no stimulus, L2 could luck three greens, L3 never checked the exit
 *    indicator. The hardened evaluators bind each objective to its promised
 *    skill: park = at rest inside the authored bay, aligned, via reverse;
 *    emergency stop = resolved staged encounter with measured reaction time;
 *    signals = a met red in the run; roundabout = exit under right indicator.
 *    Where progression and correctness still SPLIT (e.g. crossing on red
 *    completes a plain passSignal and earns RED_LIGHT_CROSSED), the rule
 *    engine keeps adjudicating the law separately — the final verdict
 *    combines both.
 *  - Evaluators read SimTick frames plus the session-level ObjectiveContext
 *    (staged-encounter outcomes, run-wide reds tally), so the whole lesson
 *    engine stays testable without a WorldRuntime; the runtime's job is to
 *    emit honest ticks (contracts.ts) and the orchestrator's to resolve
 *    honest StagedEventOutcomes.
 */

import type { LessonObjective, ParkingBaySpec, StagedEventOutcome } from "../contracts";
import type { SimTick } from "../rules";
import type {
  ObjectiveDetail,
  ObjectiveEvalState,
  ObjectiveParams,
  ParkAlignment,
  ParkInBayParams,
  PassSignalParams,
  ReactionBand,
  ReachZoneParams,
  ThreePointTurnParams,
} from "./types";

// ---------------------------------------------------------------------------
// Param parsing — specs are data (Record<string, unknown> by contract);
// narrow them once at session start and fail loudly on malformed specs.
// ---------------------------------------------------------------------------

class ObjectiveSpecError extends Error {
  constructor(objectiveId: string, message: string) {
    super(`Invalid objective spec "${objectiveId}": ${message}`);
    this.name = "ObjectiveSpecError";
  }
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Narrow an untyped `bay` param to a ParkingBaySpec, null when malformed. */
function parseBay(v: unknown): ParkingBaySpec | null {
  if (typeof v !== "object" || v === null) return null;
  const b = v as Record<string, unknown>;
  if (
    !num(b.x) ||
    !num(b.y) ||
    !num(b.headingDeg) ||
    !num(b.widthM) ||
    !num(b.lengthM) ||
    b.widthM <= 0 ||
    b.lengthM <= 0
  ) {
    return null;
  }
  return { x: b.x, y: b.y, headingDeg: b.headingDeg, widthM: b.widthM, lengthM: b.lengthM };
}

/** Narrow an untyped `corridor` param to a ThreePointTurnCorridor, null when malformed. */
function parseTurnCorridor(v: unknown): ThreePointTurnParams["corridor"] | null {
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  if (
    !num(c.x) ||
    !num(c.y) ||
    !num(c.halfWidthM) ||
    !num(c.halfLengthM) ||
    c.halfWidthM <= 0 ||
    c.halfLengthM <= 0
  ) {
    return null;
  }
  return { x: c.x, y: c.y, halfWidthM: c.halfWidthM, halfLengthM: c.halfLengthM };
}

/** Narrow a LessonObjective's untyped params to a typed evaluator config. */
export function parseObjectiveParams(objective: LessonObjective): ObjectiveParams {
  const p = objective.params;
  switch (objective.kind) {
    case "reachZone": {
      if (!num(p.x) || !num(p.y) || !num(p.radiusM) || p.radiusM <= 0) {
        throw new ObjectiveSpecError(objective.id, "reachZone needs x, y, radiusM > 0");
      }
      const out: ReachZoneParams = {
        kind: "reachZone",
        x: p.x,
        y: p.y,
        radiusM: p.radiusM,
      };
      if (num(p.maxSpeedKmh)) out.maxSpeedKmh = p.maxSpeedKmh;
      // SIGNED (FR-24): + = the mark sits past the paint, − = the paint is
      // ahead of the mark. The only rejected value is one that would empty the
      // acceptance disc — a cut deeper than the radius leaves nowhere legal to
      // stop, which is „стоях точно на маркера и нищо не стана" with extra
      // steps. Rejecting it here means a bad authoring falls back to the old
      // uncut behaviour instead of bricking the lesson, and
      // stop-line-grading.test.ts fails the build for it.
      if (num(p.acceptBeforeMarkM) && p.acceptBeforeMarkM <= p.radiusM) {
        out.acceptBeforeMarkM = p.acceptBeforeMarkM;
      }
      return out;
    }
    case "passSignal": {
      if (
        typeof p.nodeId !== "string" ||
        !num(p.x) ||
        !num(p.y) ||
        !num(p.radiusM) ||
        p.radiusM <= 0 ||
        (p.control !== "trafficLight" && p.control !== "stopSign")
      ) {
        throw new ObjectiveSpecError(
          objective.id,
          "passSignal needs nodeId, x, y, radiusM > 0, control trafficLight|stopSign",
        );
      }
      const out: PassSignalParams = {
        kind: "passSignal",
        nodeId: p.nodeId,
        x: p.x,
        y: p.y,
        radiusM: p.radiusM,
        control: p.control,
      };
      if (p.requireRedMet !== undefined) {
        // Red-light handling only exists at traffic lights — a stop sign
        // carrying the gate would deadlock the objective forever.
        if (p.requireRedMet !== true || p.control !== "trafficLight") {
          throw new ObjectiveSpecError(
            objective.id,
            "requireRedMet must be true and is only valid with control trafficLight",
          );
        }
        out.requireRedMet = true;
      }
      return out;
    }
    case "driveDistance": {
      if (!num(p.meters) || p.meters <= 0) {
        throw new ObjectiveSpecError(objective.id, "driveDistance needs meters > 0");
      }
      return { kind: "driveDistance", meters: p.meters };
    }
    case "completeManeuver": {
      if (p.maneuver === "smoothStop") {
        return {
          kind: "completeManeuver",
          maneuver: "smoothStop",
          minApproachKmh: num(p.minApproachKmh) ? p.minApproachKmh : 20,
          maxDecelMs2: num(p.maxDecelMs2) ? p.maxDecelMs2 : 3.5,
        };
      }
      if (p.maneuver === "emergencyStop") {
        // A10: stimulus-locked — the objective grades from the staged
        // encounter's outcome; a speed-only spec is a cheat path, not a spec.
        if (typeof p.stagedEventId !== "string" || p.stagedEventId.length === 0) {
          throw new ObjectiveSpecError(
            objective.id,
            "emergencyStop needs stagedEventId (the staged encounter it grades from)",
          );
        }
        return {
          kind: "completeManeuver",
          maneuver: "emergencyStop",
          stagedEventId: p.stagedEventId,
        };
      }
      if (p.maneuver === "parkInBay") {
        // A10: bay-locked — the park must land in the authored rect.
        const bay = parseBay(p.bay);
        if (bay === null) {
          throw new ObjectiveSpecError(
            objective.id,
            "parkInBay needs bay { x, y, headingDeg, widthM > 0, lengthM > 0 }",
          );
        }
        const params: ParkInBayParams = {
          kind: "completeManeuver",
          maneuver: "parkInBay",
          holdSec: num(p.holdSec) && p.holdSec > 0 ? p.holdSec : 1.5,
          bay,
          centerTolM: num(p.centerTolM) && p.centerTolM > 0 ? p.centerTolM : PARK_CENTER_TOL_M,
          headingTolDeg:
            num(p.headingTolDeg) && p.headingTolDeg > 0 ? p.headingTolDeg : PARK_HEADING_TOL_DEG,
        };
        // S2 (additive): the entry-gear gate — absent = the reverse default.
        if (p.entry !== undefined) {
          if (p.entry !== "reverse" && p.entry !== "forward") {
            throw new ObjectiveSpecError(
              objective.id,
              'parkInBay entry must be "reverse" | "forward" when present',
            );
          }
          params.entry = p.entry;
        }
        return params;
      }
      if (p.maneuver === "roundabout") {
        if (
          !num(p.x) ||
          !num(p.y) ||
          !num(p.enterRadiusM) ||
          !num(p.exitRadiusM) ||
          p.enterRadiusM <= 0 ||
          p.exitRadiusM <= p.enterRadiusM
        ) {
          throw new ObjectiveSpecError(
            objective.id,
            "roundabout needs x, y, 0 < enterRadiusM < exitRadiusM",
          );
        }
        return {
          kind: "completeManeuver",
          maneuver: "roundabout",
          x: p.x,
          y: p.y,
          enterRadiusM: p.enterRadiusM,
          exitRadiusM: p.exitRadiusM,
        };
      }
      if (p.maneuver === "threePointTurn") {
        // Corridor-locked (the parkInBay pattern): the ~180° reversal must land
        // inside the authored turn box.
        const corridor = parseTurnCorridor(p.corridor);
        if (corridor === null) {
          throw new ObjectiveSpecError(
            objective.id,
            "threePointTurn needs corridor { x, y, halfWidthM > 0, halfLengthM > 0 }",
          );
        }
        if (!num(p.startHeadingDeg)) {
          throw new ObjectiveSpecError(objective.id, "threePointTurn needs startHeadingDeg");
        }
        return {
          kind: "completeManeuver",
          maneuver: "threePointTurn",
          corridor,
          startHeadingDeg: p.startHeadingDeg,
          toleranceDeg:
            num(p.toleranceDeg) && p.toleranceDeg > 0 ? p.toleranceDeg : TURN_TOLERANCE_DEG,
          holdSec: num(p.holdSec) && p.holdSec > 0 ? p.holdSec : TURN_HOLD_SEC,
        };
      }
      throw new ObjectiveSpecError(
        objective.id,
        `unknown maneuver ${String(p.maneuver)}`,
      );
    }
  }
}

/** Fresh evaluator memory for a parsed objective. */
export function createEvalState(params: ObjectiveParams): ObjectiveEvalState {
  switch (params.kind) {
    case "reachZone":
      return {
        type: "reachZone",
        reached: false,
        // An uncapped zone has no speed half to satisfy — start it met so the
        // fold below stays one expression and an uncapped zone behaves
        // EXACTLY as it did before B4 (done ⇔ inside the authored radius).
        capMet: params.maxSpeedKmh === undefined,
        overCapNoted: false,
        approachFrom: null,
        prevPos: null,
        everOutside: false,
      };
    case "passSignal":
      return { type: "passSignal", crossed: false, stoppedInZoneVisit: false, redMet: false };
    case "driveDistance":
      return { type: "driveDistance", accumulatedM: 0, prevPos: null };
    case "completeManeuver":
      switch (params.maneuver) {
        case "smoothStop":
          return {
            type: "smoothStop",
            armed: false,
            maxDecelMs2: 0,
            prevSpeedKmh: null,
            prevT: null,
          };
        case "emergencyStop":
          return { type: "emergencyStop" };
        case "parkInBay":
          return {
            type: "parkInBay",
            usedReverse: false,
            enteredForward: false,
            stoppedSinceT: null,
            inBay: false,
            attempts: 0,
          };
        case "roundabout":
          return {
            type: "roundabout",
            entered: false,
            exitSignaled: false,
            ringSignalArcDeg: null,
            prevAzimuthDeg: null,
            voidedExits: 0,
          };
        case "threePointTurn":
          return {
            type: "threePointTurn",
            entered: false,
            lastDir: 0,
            reversals: 0,
            stoppedSinceT: null,
          };
      }
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Session-level facts the hardened evaluators need beyond the tick (A10).
 * Built by the engine from LessonSessionState on every step.
 */
export interface ObjectiveContext {
  /** Resolved staged-encounter outcomes so far (A8 measurement channel). */
  stagedOutcomes: readonly StagedEventOutcome[];
  /**
   * Reds met across the run so far — count of passSignal eval states with
   * redMet (completed objectives keep their final state, so a red met at an
   * earlier junction satisfies a later requireRedMet gate).
   */
  redsMetInRun: number;
}

const EMPTY_CONTEXT: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };

export interface ObjectiveStepResult {
  done: boolean;
  /** 0..1 for HUD progress (1 exactly when done for progressive objectives). */
  progress: number;
  evalState: ObjectiveEvalState;
  /** A10 measurement channel (attempts, reaction band, …); hardened evaluators only. */
  detail?: ObjectiveDetail;
}

const KMH_TO_MS = 1 / 3.6;
const DEG_TO_RAD = Math.PI / 180;
/** Position jumps above this per tick are treated as teleports (reset/respawn). */
const TELEPORT_JUMP_M = 50;
/** At/below this speed the vehicle counts as stopped for maneuvers, km/h. */
const STOPPED_SPEED_KMH = 1;

/**
 * B4/B5 (doc 86 §3, 2026-07-30) — the reach-zone GRACE ring, meters, and it
 * only ever extends the mark BACKWARD, toward the driver. That asymmetry is
 * the whole design; the rest is arithmetic.
 *
 * WHAT WAS BROKEN. The evaluator demanded `inZone && slowEnough` on the same
 * frame, against a circle of radius 3.5–6 m. Two students were trapped by it
 * and neither was driving badly:
 *
 *  - B5, the forced pose. Founder, verbatim: „if I don't stop on the green
 *    circle I can't do anything, I must do a violation and go back to the
 *    green circle." He had stopped SHORT of a give-way mark — the pose with
 *    the better sightline, the pose an instructor asks for — and the drill
 *    refused it, then demanded he creep forward into the one position that
 *    cannot see. `sc-jxgb-yield` is the case: a radius-4 circle admitting the
 *    last 8 m of a lawful stopping band metres long, and doc 86 T6 shows the
 *    conflict car is occluded from exactly that spot.
 *  - B4, the discipline shown early. Braking to the cap on the approach and
 *    coasting through a shade above it read as failure, though the taught
 *    behaviour — slow down BEFORE the hazard — had been performed.
 *
 * WHY IT DOES NOT EXTEND FORWARD, which the first draft of this fix got wrong
 * and three counter-proof suites caught: on a „спри на маркировката" drill the
 * OVERSHOOT IS THE GRADED FAILURE. `sc-ac-wet-braking`'s whole subject is that
 * wet grip needs an earlier braking point, and its mistake demo slides past
 * the mark into a collision; `sc-pk-ban-stop`'s mistake demo rests five metres
 * beyond the legal spot. Crediting either would have taught, at scale, that
 * stopping past the line is stopping at it. Short of the mark is better
 * driving and counts; past the mark is the mistake and does not.
 *
 * WHY IT DOES NOT EXTEND SIDEWAYS either. finish.ts treats a car standing one
 * lane over (8.13 m) at the end of the route as STUCK — that is the entire B3
 * fix — so an evaluator that called the same car ARRIVED would have the module
 * arguing with itself. The grace is therefore a CAPSULE along the approach
 * axis: extra length behind the mark, the authored radius and no more across
 * it.
 *
 * 5 m is a car length and a bit — the amount by which a learner misjudges
 * „here", and no more. It was 8 m in the first draft and that was measurably
 * too much: `sc-vp-police-stop`'s panic slam rests 10.1 m short of a radius-3
 * kerbside mark, which is not „a shade early", it is the failed pull-over the
 * drill is about. A grace big enough to swallow that is a grace big enough to
 * swallow the lesson.
 *
 * The standstill arm additionally requires the cap to be a genuine STOP
 * demand (REACH_ZONE_HALT_CAP_KMH). A cap of 20 km/h on a roundabout chord is
 * a flow envelope, not „stop here" — `sc-rb-busy-gap` says so in its own
 * comment — so a car that came to rest near it (in that drill, by crashing)
 * has demonstrated nothing about reaching the mouth.
 *
 * A student who DOES overshoot is still not trapped — he is simply not
 * credited. finish.ts ends the drive at the route's end (B1/B2/B3) and
 * progress.ts lets him take the next rung anyway (B9), so the cost of the
 * mistake is the mistake, not the afternoon.
 *
 * This LOOSENS PROGRESSION ONLY. Not one line of law moves: the rule engine
 * still grades speed, overshoot and yield exactly as before — the
 * progression/correctness split documented at the top of this file.
 */
export const REACH_ZONE_GRACE_M = 5;

/**
 * The standstill arm of the grace only applies to a zone whose cap is a STOP
 * demand. At or below walking-plus pace the objective is „спри тук" and
 * stopping short of it is the same act done earlier; above it the cap is a
 * flow envelope (a ring chord at 20, a rain approach at 42) and coming to
 * rest nearby proves nothing about having reached the place.
 */
export const REACH_ZONE_HALT_CAP_KMH = 8;

/** Default max distance of the car centre from the bay centre at rest, m. */
export const PARK_CENTER_TOL_M = 0.5;
/** Default max |heading − bay axis| at rest, degrees. */
export const PARK_HEADING_TOL_DEG = 10;
/** Reverse-gear credit for the park accrues only within this radius of the bay, m. */
export const PARK_MANEUVER_ZONE_M = 15;

/**
 * B21-RB (2026-08-11) — how far round the island an EXTINGUISHED right
 * indicator still counts as the exit signal, DEGREES of arc about the ring
 * centre.
 *
 * WHY DEGREES AND NOT SECONDS. The first cut of this fix used seconds (5, the
 * rule engine's `indicatorLookbackSec`), and seconds cannot do the job — not
 * at any value. Measured over 64 drives of the real Rapier car through the
 * real CabinControls, on all four shipped ring geometries, at 12/15/18/22 km/h
 * and in both input styles, the interval from the stalk's last lit frame to
 * the exitRadiusM crossing was:
 *
 *      textbook signal (just after the exit BEFORE mine)   1.53 – 13.57 s
 *      flicked once at the ring entrance and forgotten    10.20 – 33.70 s
 *
 * The two populations OVERLAP over 10.2–13.6 s, so every threshold either
 * fails a correct slow driver or credits a silent one. In degrees of arc the
 * same 64 drives separate completely:
 *
 *      textbook signal                                      1.1 – 87.7°
 *      flicked at the entrance and forgotten              152.1 – 231.4°
 *
 * — a 64° dead band, and 120 sits in the middle of it (+32° over the worst
 * honest drive, −32° under the cheapest cheat). The reason is structural, not
 * lucky: seconds measure how SLOWLY the student drove, degrees measure how far
 * past his signal he has travelled, and only the second one is the thing the
 * drivers waiting at the mouths actually see. It is also why a lawful HALT
 * cannot expire the credit — sc-rb-ped-exit makes the student stop between the
 * ring and the zebra and wait the pedestrian out, and a stationary car sweeps
 * no arc at all, while it burns seconds by the dozen.
 *
 * 120° is also the rule as it is taught: signal after the exit BEFORE yours.
 * On a four-arm ring that is one 90° span plus slack; on district-v1's six-arm
 * ring it is two. Signalling two exits early is not a stricter kind of correct
 * — it tells the drivers at the intervening mouth that you are coming out at
 * theirs, which is the RB-06 fault the sibling template exists to teach.
 */
export const ROUNDABOUT_EXIT_SIGNAL_ARC_DEG = 120;

/**
 * SMOOTH STOP — the window the deceleration is measured over, SECONDS
 * (2026-08-16; the rule engine's audit M-18 fix, finally applied to this file).
 *
 * WHAT WAS BROKEN. `stepSmoothStop` differentiated speed between CONSECUTIVE
 * FRAMES, and the frames it is fed are RENDER frames: `onTick` runs inside
 * `useFrame` (LessonScene), and `tick.speedKmh` is the raw Rapier `linvel`
 * projected on the body's forward axis (VehicleSim) — unsmoothed, and the
 * projection swings as the chassis pitches, which is exactly what a braking
 * car does. At 120 fps a frame lasts ~8 ms, so the repo's own measured
 * driveline wobble of 0.06 km/h differentiates to ~2.1 m/s² of pure noise —
 * and the evaluator keeps the PEAK over hundreds of frames, so it collects the
 * worst sample of the whole stop, not a typical one.
 *
 * Measured on a constant 2.5 m/s² stop against the shipped 3.5 cap, 20 trials
 * per cell, wobble amplitude in km/h (one deterministic seed of the same shape
 * is pinned in lost-credit-objectives.test.ts, which fails on the old code):
 *
 *      tick rate    0        0.03      0.06      0.12
 *      20 Hz     20/20     20/20     20/20      2/20
 *      60 Hz     20/20     20/20      0/20      0/20
 *     120 Hz     20/20      0/20      0/20      0/20
 *
 * The whole trace suite is KINEMATIC (recorder.ts computes speed analytically
 * ⇒ wobble exactly 0), which is why every gate was green while only the live
 * car failed. And the failure is worse than „not credited": a rejected attempt
 * disarms, so the student must accelerate back over the approach speed and try
 * again at the same odds — on `l1-smooth-stop`, lesson one, objective two.
 *
 * THE FIX is the rule engine's, one file over: anchor the derivative on a
 * sample at least a WINDOW old instead of on the previous frame, and never let
 * the denominator fall below the window. Noise then divides by 0.5 s instead of
 * by 8 ms — 2 × 0.12 km/h of wobble becomes 0.13 m/s², under a seventh of the
 * 1.0 m/s² headroom the cap leaves a textbook stop — while a real slam is
 * untouched: 0.5 s is a fifth of the ~2.5 s a genuine emergency stop from
 * 40 km/h takes, so every window inside the slam reads the slam's own rate.
 *
 * 0.5 s and not the engine's `accelWindowSec` (0.04): that window feeds gates
 * with a 7 m/s² threshold and no peak-hold, this one has 1 m/s² of headroom and
 * keeps the maximum over the whole attempt, where the extreme value — not the
 * typical one — is what decides.
 *
 * At the 1 Hz trace/replay rate the span already exceeds the window on every
 * frame, so recorded drives differentiate EXACTLY as before (the objectives
 * suite is unchanged, harsh stops included).
 */
export const SMOOTH_STOP_DECEL_WINDOW_SEC = 0.5;

/**
 * How far BEHIND a passSignal node a stop still counts as „waiting at its red",
 * metres, measured both from the node and from the stop line the tick reports
 * ahead (2026-08-16 — the queue arm of signature 2 in stepPassSignal).
 *
 * 60 m is the queue the radius cannot see. The shipped templates author 40–50 m
 * node radii, which covers the first six or seven cars; a Sofia light routinely
 * holds twice that, and the student who joins the tail is the one being asked to
 * do it right. Past 60 m of a line he is not queueing at this junction — he is
 * somewhere else on the street — and the bound stays tight enough that the
 * neighbouring junction's red can never certify this one.
 */
export const PASS_SIGNAL_QUEUE_REACH_M = 60;

/** Default max |final heading − (start + 180°)| for a three-point turn, deg. */
export const TURN_TOLERANCE_DEG = 20;
/** Default continuous seconds at rest (facing back, in the corridor) to finish a turn. */
export const TURN_HOLD_SEC = 0.6;

/**
 * Reaction grade bands on StagedEventOutcome.reactionTimeSec (A10; the
 * measurement itself is the orchestrator's — we only band it, no new
 * scoring): < 0.8 s отличен · < 1.2 s добър · else бавен.
 */
export const REACTION_BAND_EXCELLENT_MAX_S = 0.8;
export const REACTION_BAND_GOOD_MAX_S = 1.2;

export const REACTION_BAND_LABELS_BG: Record<ReactionBand, string> = {
  otlichen: "отличен",
  dobur: "добър",
  baven: "бавен",
};

function reactionBand(reactionTimeSec: number | undefined): ReactionBand | null {
  if (reactionTimeSec === undefined || !Number.isFinite(reactionTimeSec)) return null;
  if (reactionTimeSec < REACTION_BAND_EXCELLENT_MAX_S) return "otlichen";
  if (reactionTimeSec < REACTION_BAND_GOOD_MAX_S) return "dobur";
  return "baven";
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Advance the ACTIVE objective by one tick. Pure — returns fresh eval state.
 * `ctx` carries the session-level facts (staged outcomes, reds tally); the
 * engine always supplies it, standalone callers may omit it.
 */
export function stepObjective(
  params: ObjectiveParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext = EMPTY_CONTEXT,
): ObjectiveStepResult {
  switch (params.kind) {
    case "reachZone":
      return stepReachZone(params, prev, tick);

    case "passSignal":
      return stepPassSignal(params, prev, tick, ctx);

    case "driveDistance": {
      if (prev.type !== "driveDistance") return { done: false, progress: 0, evalState: prev };
      let accumulated = prev.accumulatedM;
      if (prev.prevPos !== null) {
        const d = dist(tick.position.x, tick.position.y, prev.prevPos.x, prev.prevPos.y);
        if (d < TELEPORT_JUMP_M) accumulated += d;
      }
      const done = accumulated >= params.meters;
      return {
        done,
        progress: Math.min(1, accumulated / params.meters),
        evalState: {
          type: "driveDistance",
          accumulatedM: accumulated,
          prevPos: { x: tick.position.x, y: tick.position.y },
        },
      };
    }

    case "completeManeuver":
      switch (params.maneuver) {
        case "smoothStop":
          return stepSmoothStop(params.minApproachKmh, params.maxDecelMs2, prev, tick);
        case "emergencyStop":
          return stepEmergencyStop(params.stagedEventId, prev, ctx);
        case "parkInBay":
          return stepParkInBay(params, prev, tick);
        case "roundabout":
          return stepRoundabout(
            params.x,
            params.y,
            params.enterRadiusM,
            params.exitRadiusM,
            prev,
            tick,
          );
        case "threePointTurn":
          return stepThreePointTurn(params, prev, tick);
      }
  }
}

/**
 * Reach a waypoint (B4/B5-hardened, 2026-07-30) — two INDEPENDENT, MONOTONIC
 * latches instead of one same-frame conjunction:
 *
 *   reached — the car was inside the authored radius, OR (on a zone whose cap
 *             is a genuine stop demand) came to a FULL STOP inside the
 *             approach capsule. The second arm is what lets a student stop
 *             SHORT of a halt mark with the better sightline and still be
 *             credited: the drill is „stop here", and stopping four metres
 *             earlier is stopping here, done better.
 *   capMet  — the arrival speed cap was honoured at least once inside the
 *             authored radius, or on the approach to it. Uncapped zones start
 *             met (see createEvalState), so an uncapped waypoint is
 *             bit-identical to the pre-B4 evaluator: done exactly when the car
 *             is inside the authored radius, at any speed, on any frame.
 *
 * The grace is not a ring but a CAPSULE: the authored circle stretched back
 * down the approach and not one centimetre sideways (see REACH_ZONE_GRACE_M
 * for why, and for the four counter-proof drills that would otherwise have
 * been taught backwards). Inside the AUTHORED radius nothing changes at all —
 * that acceptance is the template's own and is untouched.
 *
 * `overCapNoted` latches the first frame the car is genuinely AT the mark and
 * still over the cap. The engine turns that transition into one explaining
 * card (THEO-4): the founder's «I am stopping on top of the green circle and
 * nothing happens» was never a tolerance problem — it was an invisible speed
 * contract, and the silence is the part that has to go.
 */
function stepReachZone(
  params: ReachZoneParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  const st: Extract<ObjectiveEvalState, { type: "reachZone" }> =
    prev.type === "reachZone"
      ? prev
      : {
          type: "reachZone",
          reached: false,
          capMet: params.maxSpeedKmh === undefined,
          overCapNoted: false,
          approachFrom: null,
          prevPos: null,
          everOutside: false,
        };

  const d = dist(tick.position.x, tick.position.y, params.x, params.y);
  const speedKmh = Math.abs(tick.speedKmh); // reverse reads negative
  const inZone = d <= params.radiusM;
  const cap = params.maxSpeedKmh;
  // B18/FR-24: a `stopBeforeMark` zone needs the approach direction too, so
  // its ring arms on proximity alone rather than on carrying a speed cap.
  const inGraceRing =
    (cap !== undefined || params.acceptBeforeMarkM !== undefined) &&
    d <= params.radiusM + REACH_ZONE_GRACE_M;

  // Which way the student came from: where he was on the frame before he
  // entered the proximity ring. That direction turns the grace from a CIRCLE
  // into a CAPSULE stretched back down the approach — extra room along the
  // road, none at all across it.
  //
  // The lateral bound is not a detail: it is what keeps this evaluator from
  // contradicting the B3 rescue next door. finish.ts treats a car standing one
  // lane over (8.13 m) at the end of the route as STUCK and lets it out with
  // the objective marked undone. A circular grace on a radius-6 waypoint would
  // have reached 11 m and called that same car ARRIVED. Stopping short of a
  // mark on the same line is stopping there, done earlier; stopping in a
  // different lane is a different place, and both halves of the module have to
  // say so with one voice.
  //
  // RE-LATCHED ON EVERY FRESH APPROACH (2026-08-16). The axis used to be frozen
  // on FIRST contact and never revised, so a student who touched the ring badly
  // — came in off the line, or clipped it while still cornering — then backed
  // off and re-approached properly down the road was judged with a capsule
  // built for the attempt he ABANDONED: `lateral` measured across the wrong
  // axis, and on an `acceptBeforeMarkM` waypoint `along` too, so a stop
  // genuinely short of the paint could read as past it. Self-correction is the
  // one thing a drill must never punish.
  //
  // The re-latch fires on the RING ENTRY EDGE (outside last frame, inside this
  // one) and reads the same thing the first latch read — the previous frame's
  // position, outside the ring. Everything between entries is byte-identical to
  // shipped: the axis is frozen for the whole time the car is near the mark,
  // which is what makes the grace a capsule instead of a circle.
  //
  // IT MAY NOT TURN AROUND, and that guard is the whole safety of the change:
  // the re-latch is refused when the fresh direction opposes the latched one
  // (dot ≤ 0). Without it, a car that overshot the paint, left the ring and came
  // back the other way would have „short of the mark" redefined to the far side
  // of the line, and B18/FR-24 („I have to stop BEFORE the line not after it")
  // would hand credit for the exact stop it exists to refuse. Under 90° the
  // acceptance half-plane can only rotate toward the honest approach; it can
  // never flip.
  const here = { x: tick.position.x, y: tick.position.y };
  const prevInGraceRing =
    st.prevPos !== null &&
    dist(st.prevPos.x, st.prevPos.y, params.x, params.y) <= params.radiusM + REACH_ZONE_GRACE_M;
  let approachFrom = st.approachFrom;
  if (inGraceRing && !prevInGraceRing) {
    const entryFrom = st.prevPos ?? here;
    if (approachFrom === null) {
      approachFrom = entryFrom;
    } else {
      const oldX = params.x - approachFrom.x;
      const oldY = params.y - approachFrom.y;
      const newX = params.x - entryFrom.x;
      const newY = params.y - entryFrom.y;
      if (oldX * newX + oldY * newY > 0) approachFrom = entryFrom;
    }
  }
  let inApproachGrace = false;
  let beyondMark = false;
  if (approachFrom !== null) {
    const ax = params.x - approachFrom.x;
    const ay = params.y - approachFrom.y;
    const m = Math.hypot(ax, ay);
    if (m >= 1e-6) {
      const ux = ax / m;
      const uy = ay / m;
      const rx = tick.position.x - params.x;
      const ry = tick.position.y - params.y;
      const along = rx * ux + ry * uy; // + = beyond the mark
      const lateral = Math.abs(rx * uy - ry * ux); // across the approach
      // B18/FR-24 — where the ACCEPTANCE ends, on this same axis and sign
      // convention. `acceptBeforeMarkM` is the SIGNED offset from the paint to
      // the authored mark, so credit stops at the LINE instead of at the mark:
      //   + (mark inside the junction) pulls the boundary BACK off the paint;
      //   − (paint ahead of the mark)  pushes it FORWARD onto the paint.
      // Both are the same sentence — „the acceptance ends at the line" — and
      // the arithmetic below needs no branch to say it. Opt-in: absent ⇒ the
      // boundary is the mark itself ⇒ every other waypoint in the library
      // evaluates bit-identically.
      const bound = params.acceptBeforeMarkM;
      const cut = bound ?? 0;
      // The grace capsule shares the boundary — it is „extra room BEHIND the
      // acceptance", and behind now begins at the paint. Without this the cut
      // leaks: a car that barges the mouth at 40 and settles to a legal speed
      // one metre past the bars is standing inside the capsule, which would
      // hand it the speed half of the task it just failed. The capsule KEEPS
      // its length (radius + grace) and slides so its far end is the paint —
      // so a negative cut buys forgiveness ahead of the mark without inventing
      // any extra room behind it.
      inApproachGrace =
        lateral <= params.radiusM &&
        along <= -cut &&
        along >= -(cut + params.radiusM + REACH_ZONE_GRACE_M);
      // Only a waypoint that DECLARED a paint boundary refuses the far side.
      // Everywhere else `inZone` is the whole acceptance, exactly as shipped —
      // a plain reachZone is a place you get to, from any direction.
      beyondMark = bound !== undefined && along > -bound;
    }
  }
  const halted = speedKmh <= STOPPED_SPEED_KMH;
  const isHaltDemand = cap !== undefined && cap <= REACH_ZONE_HALT_CAP_KMH;

  // A conceded arrival needs an arrival to concede (doc 87 B3/B10/B11). The
  // grace capsule exists so that stopping four metres SHORT of a halt mark
  // still counts as stopping there — it was never meant to credit a student
  // who was parked inside it before the objective opened and never moved.
  // Two exit drills shipped exactly that: sc-park-parallel-exit spawns 3.20 m
  // from its own 2.85 m halt gate and sc-park-bay-exit-rev 5.04 m from its
  // 3.75 m one, so „ЗАДАЧА 1/2" ticked itself off at t = 0, at rest, and the
  // student performed one task out of the two the banner promised him.
  // `everOutside` latches the moment the car is seen beyond the grace ring,
  // so a real approach behaves exactly as before and a standing start does
  // not. The AUTHORED radius is untouched: a zone the template really does
  // draw around the spawn still completes on presence, as it always did.
  const everOutside = st.everOutside || !inGraceRing;
  const graceArmed = everOutside && inApproachGrace;

  // B18/FR-24 („I have to stop BEFORE the line not after it"). The circle is
  // cut at the mark along the approach: `inZone` alone no longer credits a car
  // that has crossed the paint. The grace capsule is unaffected — it was
  // already approach-side only (`along <= 0`) — so a student who stops SHORT
  // of the line keeps every metre of forgiveness he had, at every rung, while
  // one who rolls past it is simply not credited with having stopped at it.
  const inAcceptance = inZone && !beyondMark;
  const reached = st.reached || inAcceptance || (graceArmed && halted && isHaltDemand);
  const capMet =
    cap === undefined
      ? true
      : st.capMet || (speedKmh <= cap && (inAcceptance || graceArmed));
  const done = reached && capMet;
  // „You are ON the mark and still too fast" — the one state the student
  // reads as „nothing happened". Latched so it is said once, not every frame.
  const overCapNoted =
    st.overCapNoted || (!done && inAcceptance && cap !== undefined && speedKmh > cap);

  const evalState: ObjectiveEvalState = {
    type: "reachZone",
    reached,
    capMet,
    overCapNoted,
    approachFrom,
    prevPos: here,
    everOutside,
  };
  return {
    done,
    // Half progress once the place is reached but the speed contract is not
    // yet met — the banner stops looking inert while the student slows down.
    progress: done ? 1 : reached ? 0.5 : 0,
    evalState,
  };
}

/**
 * Pass a controlled junction (A10-hardened for traffic lights).
 *
 * Base completion: a stopLineCrossed event of the matching control type near
 * the node — running the red still COMPLETES a plain passSignal (progression);
 * the rule engine grades RED_LIGHT_CROSSED separately.
 *
 * requireRedMet gate (L2): the objective additionally demands that the RUN
 * has met at least one red. With `lightState` only observable at the moment
 * of crossing (SimTick contract), a met red has two observable signatures:
 *   1. crossing ON red (met the hard way — completes progression, costs the
 *      10-point опасна from the rule engine), or
 *   2. a full stop on the current APPROACH — inside the zone, or (2026-08-16)
 *      at the back of the queue with the tick reporting a red/red-yellow light
 *      ahead — followed by a crossing on green: the signature of waiting a red
 *      out. (A student who voluntarily stops at a green inside the zone matches
 *      it too; with the crossing-time-only sensor that stop-verify-proceed
 *      behavior is the closest honest proxy, and it is exactly the drilled
 *      sequence.)
 * Reds met by EARLIER passSignal objectives count via ctx.redsMetInRun.
 * Feasibility: runtime SIGNAL_TIMING gives every light red 26 s of every
 * 50 s cycle, so a student who crossed on green can always re-approach, stop
 * at the line, and meet a red within ≤ 24 s — the gate can never deadlock.
 *
 * WHY THE QUEUE ARM EXISTS. Signature 2 used to count a stop only INSIDE the
 * node radius (40–50 m in the shipped templates). A student who joins the back
 * of a queue beyond it, waits the whole red out properly and creeps to the line
 * already rolling never latched `stoppedInZoneVisit`, so `redMet` never fired
 * and the L2 gate stayed open although he handled the red exactly as taught —
 * the queue length decided, not the driving. Outside the circle the arm demands
 * MORE than the inside one, not less: the world must positively report a
 * forbidding light ahead.
 */
function stepPassSignal(
  params: PassSignalParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  if (prev.type !== "passSignal") return { done: false, progress: 0, evalState: prev };

  const nodeDistM = dist(tick.position.x, tick.position.y, params.x, params.y);
  const inZone = nodeDistM <= params.radiusM;

  const halted = Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH;
  // THE QUEUE THE RADIUS CANNOT SEE (2026-08-16). A stop that
  // certifies this junction's red is a stop made ON THIS APPROACH to it, and
  // the approach is longer than the acceptance circle: the tail of the queue is
  // where a student who arrives late is supposed to be. So the stop memory is
  // scoped to the approach rather than to the zone, and a halt made outside the
  // circle counts only on POSITIVE evidence from the world-context channel —
  // the runtime saying the light he is queued behind is actually forbidding.
  //
  // All three context fields are optional by the SimTick contract, and a tick
  // that cannot answer them leaves this evaluator exactly as shipped: hand-built
  // ticks, recorded traces and every legacy source are byte-identical.
  //
  // The SECOND HALF of the signature is unchanged and is what keeps this from
  // becoming a free pass: the certified red is only spent by a later crossing
  // ON GREEN, i.e. by waiting it out. A student who stops at the red and then
  // creeps over on red+yellow still fails the gate — measured on the shipped
  // `sc-signal-redyellow / mistake-creep` demo, which is exactly that drive.
  const onApproach = nodeDistM <= params.radiusM + PASS_SIGNAL_QUEUE_REACH_M;
  const queuedAtRed =
    !inZone &&
    params.control === "trafficLight" &&
    tick.nextStopLineControl === "trafficLight" &&
    (tick.nextStopLineState === "red" || tick.nextStopLineState === "redYellow") &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= PASS_SIGNAL_QUEUE_REACH_M;
  // Approach-scoped stop memory: leaving the approach forgets the stop, so a
  // halt elsewhere can never certify this junction's red.
  const stoppedInZoneVisit = onApproach
    ? prev.stoppedInZoneVisit || (halted && (inZone || queuedAtRed))
    : false;
  let redMet = prev.redMet;
  let crossed = prev.crossed;

  if (inZone) {
    for (const e of tick.events) {
      if (e.kind !== "stopLineCrossed" || e.control !== params.control) continue;
      crossed = true;
      if (params.control === "trafficLight") {
        if (e.lightState === "red") redMet = true;
        else if (e.lightState === "green" && stoppedInZoneVisit) redMet = true;
      }
    }
  }

  const redSatisfied = params.requireRedMet !== true || redMet || ctx.redsMetInRun > 0;
  const done = crossed && redSatisfied;

  const evalState: ObjectiveEvalState = {
    type: "passSignal",
    crossed,
    stoppedInZoneVisit,
    redMet,
  };
  const detail: ObjectiveDetail = {
    kind: "passSignal",
    redsMetInRun: ctx.redsMetInRun + (redMet && !prev.redMet ? 1 : 0),
    redMetHere: redMet,
  };
  // Crossed on lucky greens with the gate unmet: half progress — the banner
  // keeps the objective open until the student meets a red.
  const progress = done ? 1 : crossed ? 0.5 : 0;
  return { done, progress, evalState, detail };
}

/**
 * Smooth stop — completes on a stop whose PEAK deceleration stayed under the
 * authored cap.
 *
 * `prevSpeedKmh` / `prevT` hold the WINDOW ANCHOR, not the previous frame: the
 * oldest sample the current derivative is still measured against, re-taken once
 * it is `SMOOTH_STOP_DECEL_WINDOW_SEC` old. See that constant for the frame-rate
 * measurement that forced it (the field names are the eval-state contract's and
 * live in lessons/types.ts, another lane's file).
 */
function stepSmoothStop(
  minApproachKmh: number,
  maxDecelMs2: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "smoothStop") return { done: false, progress: 0, evalState: prev };

  let { armed, maxDecelMs2: peakDecel } = prev;
  let anchorSpeedKmh = prev.prevSpeedKmh;
  let anchorT = prev.prevT;

  // Track deceleration against the window anchor while an attempt is armed.
  // The denominator never falls below the window, so a span shorter than it
  // (the frames inside one window, and the truncated tail at the standstill)
  // is measured CONSERVATIVELY — noise cannot be amplified, and a real brake
  // application still shows up, scaled by how much of the window it fills.
  if (!armed) {
    // Nothing to measure yet: the anchor rides the live frame so the attempt
    // arms on a fresh sample instead of one banked before the approach.
    anchorSpeedKmh = tick.speedKmh;
    anchorT = tick.t;
  } else if (anchorSpeedKmh !== null && anchorT !== null && tick.t > anchorT) {
    const spanSec = tick.t - anchorT;
    const decel =
      ((anchorSpeedKmh - tick.speedKmh) * KMH_TO_MS) /
      Math.max(spanSec, SMOOTH_STOP_DECEL_WINDOW_SEC);
    if (decel > peakDecel) peakDecel = decel;
    // Re-anchor only once the sample is a full window old — at trace/replay
    // rates that is every frame (identical to the old frame-to-frame delta),
    // at render rates it is every ~30-60th.
    if (spanSec >= SMOOTH_STOP_DECEL_WINDOW_SEC) {
      anchorSpeedKmh = tick.speedKmh;
      anchorT = tick.t;
    }
  }

  if (!armed && tick.speedKmh >= minApproachKmh) {
    armed = true;
    peakDecel = 0;
  }

  let done = false;
  if (armed && tick.speedKmh <= STOPPED_SPEED_KMH) {
    if (peakDecel <= maxDecelMs2) {
      done = true;
    } else {
      // Harsh stop — the attempt failed; accelerate back up and try again.
      armed = false;
      peakDecel = 0;
    }
  }

  return {
    done,
    progress: done ? 1 : armed ? 0.5 : 0,
    evalState: {
      type: "smoothStop",
      armed,
      maxDecelMs2: peakDecel,
      prevSpeedKmh: anchorSpeedKmh,
      prevT: anchorT,
    },
  };
}

/**
 * Emergency stop (A10) — STIMULUS-LOCKED: graded purely from the staged
 * encounter's resolution (StagedEventOutcome via ObjectiveContext). The old
 * speed-only arming is gone — a hard stop with no hazard present proves
 * braking force, not hazard reaction, and trained nothing (audit D4).
 *
 *  - no outcome yet          → pending (the encounter has not resolved)
 *  - success + stoppedInTime → done; reaction time banded for the debrief
 *  - hitLeadCar / passedWithoutStopping / collision → stays failed (the
 *    orchestrator may restage a retry; the LAST outcome for the event wins)
 */
function stepEmergencyStop(
  stagedEventId: string,
  prev: ObjectiveEvalState,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  if (prev.type !== "emergencyStop") return { done: false, progress: 0, evalState: prev };

  // Last outcome wins — a restaged retry after a failure can still complete.
  let outcome: StagedEventOutcome | null = null;
  for (const o of ctx.stagedOutcomes) {
    if (o.eventId === stagedEventId) outcome = o;
  }

  if (outcome === null) {
    return {
      done: false,
      progress: 0,
      evalState: prev,
      detail: {
        kind: "emergencyStop",
        outcome: "pending",
        reactionTimeSec: null,
        band: null,
        stopGapM: null,
      },
    };
  }

  const done = outcome.success && outcome.detail === "stoppedInTime";
  const detailOutcome =
    outcome.detail === "stoppedInTime" ||
    outcome.detail === "hitLeadCar" ||
    outcome.detail === "passedWithoutStopping" ||
    outcome.detail === "collision"
      ? outcome.detail
      : "pending";
  return {
    done,
    // A resolved-but-failed encounter shows half progress: the stimulus fired
    // and was measured, but the stop was not earned.
    progress: done ? 1 : 0.5,
    evalState: prev,
    detail: {
      kind: "emergencyStop",
      outcome: detailOutcome,
      reactionTimeSec: outcome.reactionTimeSec ?? null,
      band: reactionBand(outcome.reactionTimeSec),
      stopGapM: outcome.stopGapM ?? null,
    },
  };
}

/**
 * Reverse-park (A10) — BAY-LOCKED: completes only when the car is at rest
 * INSIDE the authored bay rect, centred within `centerTolM`, aligned with
 * the bay axis within `headingTolDeg` (folded to 180° — the rect is
 * symmetric; facing direction is the rule engine's business), with reverse
 * gear used during the current attempt (and within PARK_MANEUVER_ZONE_M of
 * the bay — reverse banked elsewhere does not count) and the stop held
 * `holdSec` seconds. Rolling resets the hold clock; leaving the bay starts a
 * NEW attempt (counted, and reverse must be used again). A stop that is
 * inside the bay but outside tolerance surfaces as alignment "sloppy" and
 * does not complete.
 *
 * S2: `entry: "forward"` swaps the gate — the current attempt's bay ENTRY
 * itself must happen in a forward gear (echelon/45° drills); everything else
 * (bay lock, alignment, hold, attempts) is identical.
 */
function stepParkInBay(
  params: ParkInBayParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "parkInBay") return { done: false, progress: 0, evalState: prev };

  const { bay, holdSec, centerTolM, headingTolDeg } = params;

  // Bay-local frame. headingDeg: 0 = north, clockwise positive (contracts.ts)
  // → axis unit (sin h, cos h), right-hand lateral unit (cos h, −sin h).
  const h = bay.headingDeg * DEG_TO_RAD;
  const axX = Math.sin(h);
  const axY = Math.cos(h);
  const relX = tick.position.x - bay.x;
  const relY = tick.position.y - bay.y;
  const lonM = relX * axX + relY * axY; // along the bay axis
  const latM = relX * axY - relY * axX; // across it (signed, right positive)
  const inBay = Math.abs(lonM) <= bay.lengthM / 2 && Math.abs(latM) <= bay.widthM / 2;

  // Attempts: every outside → inside transition opens a new attempt; leaving
  // the bay revokes the reverse credit — re-entering forward in D after one
  // early reverse must not satisfy the maneuver. Reverse credit accrues only
  // inside the maneuver zone around the bay (a reverse at spawn followed by
  // a forward nose-in was the D4 cheat path).
  const attempts = prev.attempts + (inBay && !prev.inBay ? 1 : 0);
  const exitedBay = prev.inBay && !inBay;
  const nearBay = Math.hypot(relX, relY) <= PARK_MANEUVER_ZONE_M;
  const usedReverse = (exitedBay ? false : prev.usedReverse) || (tick.gear < 0 && nearBay);
  // S2 forward-entry gate: latched on the outside → inside transition (the
  // gear that CARRIED the entry), cleared on exit — a reverse nose-out
  // followed by a forward re-entry re-earns it, symmetric with usedReverse.
  const enteredForward = inBay
    ? prev.inBay
      ? prev.enteredForward
      : tick.gear > 0
    : false;

  const stopped = tick.speedKmh <= STOPPED_SPEED_KMH;
  // The hold clock only runs at rest INSIDE the bay.
  const stoppedSinceT = stopped && inBay ? (prev.stoppedSinceT ?? tick.t) : null;
  const heldFor = stoppedSinceT !== null ? tick.t - stoppedSinceT : 0;

  const centerOffsetM = Math.hypot(lonM, latM);
  const headingOffsetDeg = axisAngleDiffDeg(tick.headingDeg, bay.headingDeg);
  const aligned = centerOffsetM <= centerTolM && headingOffsetDeg <= headingTolDeg;

  // The entry-gear gate: reverse credit (the A10 default) or the S2 forward
  // entry, per the authored param.
  const entryOk = params.entry === "forward" ? enteredForward : usedReverse;

  const done = inBay && stopped && entryOk && aligned && heldFor >= holdSec;

  let alignment: ParkAlignment | null = null;
  if (inBay && stopped) {
    alignment = !aligned
      ? "sloppy"
      : centerOffsetM <= centerTolM * 0.5 && headingOffsetDeg <= headingTolDeg * 0.5
        ? "centered"
        : "acceptable";
  }

  const progress = done
    ? 1
    : inBay
      ? stopped
        ? aligned && entryOk
          ? 0.9 // holding for holdSec
          : 0.7 // stopped in bay, but sloppy or with the wrong entry gear
        : 0.5 // maneuvering inside the bay
      : entryOk
        ? 0.3
        : 0.1;

  return {
    done,
    progress,
    evalState: { type: "parkInBay", usedReverse, enteredForward, stoppedSinceT, inBay, attempts },
    detail: {
      kind: "parkInBay",
      attempts,
      inBay,
      centerOffsetM: inBay ? centerOffsetM : null,
      headingOffsetDeg: inBay ? headingOffsetDeg : null,
      alignment,
    },
  };
}

/** |a − b| in degrees, folded onto the 0..90° axis difference. */
function axisAngleDiffDeg(aDeg: number, bDeg: number): number {
  const raw = Math.abs(((aDeg - bDeg) % 360) + 360) % 360; // 0..360
  const diff = raw > 180 ? 360 - raw : raw; // 0..180
  return diff > 90 ? 180 - diff : diff; // fold to the axis
}

/**
 * Roundabout (A10) — enter the ring, then exit it WITH the right indicator
 * on in the exit window (annulus between enterRadiusM and the exit crossing,
 * after entering — the L3 spec's „излез с десен мигач"). An unsignaled exit
 * RESETS the traversal: the objective stays open and the student re-enters
 * the ring to exit properly, so signaling during the initial approach can
 * never be banked for a later silent exit.
 *
 * B6 (doc 86 §3, 2026-07-30). The reset is kept — it is the only thing that
 * stops „signal on after you are already out" from buying the objective, and
 * the skill this drill exists for is the signal, so it has to be performed
 * rather than banked. What is fixed is that the reset was SILENT and INESCAPABLE:
 *
 *  - silent: nothing on screen said the traversal had been voided or why, so
 *    the drill simply stopped responding. `voidedExits` now counts each one
 *    and the engine turns the increment into an explaining card (THEO-4);
 *  - inescapable: combined with B1 (no finish anchor for a roundabout) there
 *    was no termination path AT ALL — re-enter and redo it, or reload the
 *    browser. finish.ts now anchors the route on LEAVING the ring, with a
 *    twenty-second window so an immediate second attempt still wins the rung
 *    and a student who drives on gets the debrief instead of a dead lesson.
 *
 * B21-RB (2026-08-11, founder: «I turned on the signal when leaving it but, it
 * didnt mark it as signal is on and it popped up an error stating I didnt
 * leave the roundabout with signal»). The annulus above was read as a LEVEL —
 * the stalk had to be lit on some frame with d > enterRadiusM — and the stalk
 * is not a level. scene/cabin.ts auto-cancels like a real car (ARM 0.22 rad →
 * RELEASE 0.05), so the exit turn itself extinguishes it: the student is
 * punished for the indicator behaving like an indicator.
 *
 * MEASURED, not reasoned — fifteen drives of the rb-mini ring through the real
 * Rapier car and the real CabinControls, signalling at φ ≈ 110° (textbook: one
 * exit early), then exiting normally. Where the driver holds the ring until
 * his exit is beside him the wheel comes back to centre at d = 21.9–26.7 m,
 * i.e. INSIDE the sampling boundary, and the objective sees an unlit stalk on
 * every frame it looks at. The credit rate for a CORRECT exit was:
 *   24/34  «Кръгово движение» + sc-rb-exit-signal   12/15
 *   26/45  L3 «Кръгово движение» + the exam bank     9/15
 *   29/34  sc-rb-ped-exit                            6/15
 *   33/46  sc-rb-lane-choice                         5/15
 * — i.e. the verdict was decided by the two metres at which the driver
 * happened to straighten the wheel, which is unlearnable. A student obeying
 * the sibling template's own instruction 5 («изключи го веднага след изхода»)
 * scored 0/15 on three of the four geometries.
 *
 * THE FIX IS ADDITIVE. The annulus arm is untouched, so everything that was
 * credited before is still credited. What is added is the second, honest
 * signature of the same act: the stalk was live ON THE RING and the car has
 * not since driven more than ROUNDABOUT_EXIT_SIGNAL_ARC_DEG of arc away from
 * it. Same treatment register B21 gave the lane-change detector — remember the
 * signal instead of sampling it as a level — in the currency this geometry
 * actually needs.
 *
 * WHY NOT SECONDS (the first cut of this fix, corrected 2026-08-11 by driving
 * it): a 5 s lookback still failed 16 of 32 correct exits, because seconds
 * measure how slowly the student drove. 64 drives of the real car — four
 * geometries × two input styles × 12/15/18/22 km/h × {textbook signal, flick
 * at the entrance} — gave overlapping second-counts (1.53–13.57 vs 10.20–33.70)
 * and cleanly separated degree-counts (1.1–87.7 vs 152.1–231.4). Worst hit was
 * the keyboard driver, whose lane-keeping corrections arm the auto-cancel on
 * the ring itself: his stalk dies at d ≈ 17–21 m, a whole exit before the old
 * window even opens. See ROUNDABOUT_EXIT_SIGNAL_ARC_DEG for the table.
 *
 * WHAT STILL FAILS, and must:
 *  - no signal anywhere in the traversal → void, `voidedExits` counts it, the
 *    explaining card fires. Unchanged, and it is the whole drill;
 *  - a signal given and then driven away from — a stalk that went out more
 *    than 120° of ring ago is gone: the drivers waiting at the mouths you have
 *    since passed never saw it, and the traversal voids as it did before;
 *  - the approach signal is not banked either, and this is the part the
 *    obvious reading of this function gets wrong. `entered` does NOT mean „on
 *    the ring": enterRadiusM is authored 6–11 m OUTSIDE the circulatory
 *    carriageway on every shipped geometry (24 vs r18, 26 vs r19.83, 29 vs
 *    r18, 33 vs r21.94), which is 1–2 s of approach at lesson speed during
 *    which a right stalk lit for the give-way line would latch. Deleting the
 *    radius test outright — the tempting one-line "fix" — banks exactly that
 *    signal for a silent lap. The arc memory is what closes it: measured, that
 *    approach sweeps only 5.4–23.4° before the car joins the ring, so a signal
 *    left over from it is 152°+ stale by the exit of any traversal longer than
 *    one exit — while on a FIRST-exit traversal (73–87°) it is still fresh,
 *    which is right, because there signalling on approach is what you do.
 */
function stepRoundabout(
  x: number,
  y: number,
  enterRadiusM: number,
  exitRadiusM: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "roundabout") return { done: false, progress: 0, evalState: prev };

  const d = dist(tick.position.x, tick.position.y, x, y);
  let entered = prev.entered || d <= enterRadiusM;
  let exitSignaled = prev.exitSignaled;
  let voidedExits = prev.voidedExits;

  // Where the car stands on the ring, as an angle about the island. This is the
  // ONLY extra geometry the fix needs, and the objective already owns it: the
  // centre is (x, y), which is what `d` is measured from.
  const azDeg = (Math.atan2(tick.position.x - x, -(tick.position.y - y)) * 180) / Math.PI;
  let prevAzimuthDeg = prev.prevAzimuthDeg;
  let ringSignalArcDeg = prev.ringSignalArcDeg;

  if (entered) {
    // Arc swept since the previous tick, in degrees, unsigned — a car that
    // stands still (waiting out a pedestrian on the exit crossing) sweeps
    // none, which is the whole reason this is measured in degrees and not in
    // seconds. No teleport guard is needed here: a respawn puts the car past
    // exitRadiusM, which the branch below already reads as a departure.
    const step = prevAzimuthDeg === null ? 0 : headingDiffDeg(azDeg, prevAzimuthDeg);
    prevAzimuthDeg = azDeg;

    // The stalk seen ON the ring. Every lit frame RESETS the arc, so what the
    // counter holds is how far round the island the car has travelled since the
    // signal went out — by the student's hand or by the car's own auto-cancel,
    // which the objective cannot and should not tell apart.
    if (d <= enterRadiusM && tick.indicator === "right") ringSignalArcDeg = 0;
    else if (ringSignalArcDeg !== null) ringSignalArcDeg += step;
  }

  // Exit window: only ticks AFTER entering, outward of the ring radius. Two
  // signatures of the one act — the stalk still lit out here (as shipped), or
  // a ring-side signal the car has not yet driven away from (B21-RB).
  if (entered && d > enterRadiusM) {
    if (tick.indicator === "right") {
      exitSignaled = true;
    } else if (
      ringSignalArcDeg !== null &&
      ringSignalArcDeg <= ROUNDABOUT_EXIT_SIGNAL_ARC_DEG
    ) {
      exitSignaled = true;
    }
  }

  let done = false;
  if (entered && d >= exitRadiusM) {
    if (exitSignaled) {
      done = true;
    } else {
      // Left the roundabout without the exit signal — traversal void, redo.
      // Counted, so the student is TOLD rather than left guessing. The reset
      // of `entered` also stops this branch from re-firing every frame while
      // the car drives away: one departure, one count. The ring-signal memory
      // clears with it, so a stale signal from the voided lap cannot bank into
      // the next one.
      voidedExits += 1;
      entered = false;
      exitSignaled = false;
      ringSignalArcDeg = null;
      prevAzimuthDeg = null;
    }
  }

  return {
    done,
    progress: done ? 1 : entered ? (exitSignaled ? 0.75 : 0.5) : 0,
    evalState: {
      type: "roundabout",
      entered,
      exitSignaled,
      ringSignalArcDeg,
      prevAzimuthDeg,
      voidedExits,
    },
    detail: { kind: "roundabout", entered, exitSignaled },
  };
}

/** Absolute DIRECTED angle difference, folded to 0..180° (NOT the 0..90° axis
 *  fold — a U-turn must face BACK, not merely along the axis). */
function headingDiffDeg(aDeg: number, bDeg: number): number {
  const raw = (((aDeg - bDeg) % 360) + 360) % 360; // 0..360
  return raw > 180 ? 360 - raw : raw; // 0..180
}

/**
 * Three-point turn / обратен завой (Наредба-38; ЗДвП чл. 38) — CORRIDOR-LOCKED,
 * the parkInBay mold. Completes when the car has REVERSED its travel direction
 * (final heading within `toleranceDeg` of `startHeadingDeg + 180`), at rest
 * INSIDE the corridor rect, held `holdSec` continuous seconds. Rolling or
 * leaving the corridor resets the hold clock. Economy: the evaluator counts
 * direction-change shunts (forward↔reverse) once the corridor is entered and
 * reports `movements = reversals + 1` in the detail (a clean turn is 3);
 * curb/obstacle contact grades COLLISION through the obstacle-rect machinery,
 * separately. No hard reverse requirement — the narrow corridor + curbs make the
 * reverse physically necessary; a wide one-arc U-turn is a 1-movement completion.
 */
function stepThreePointTurn(
  params: ThreePointTurnParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "threePointTurn") return { done: false, progress: 0, evalState: prev };

  const { corridor, startHeadingDeg, toleranceDeg, holdSec } = params;

  // Corridor-local frame — axis along the start heading (parkInBay convention).
  const h = startHeadingDeg * DEG_TO_RAD;
  const axX = Math.sin(h);
  const axY = Math.cos(h);
  const relX = tick.position.x - corridor.x;
  const relY = tick.position.y - corridor.y;
  const lonM = relX * axX + relY * axY; // along the corridor length (start heading)
  const latM = relX * axY - relY * axX; // across it
  const inCorridor =
    Math.abs(lonM) <= corridor.halfLengthM && Math.abs(latM) <= corridor.halfWidthM;

  const entered = prev.entered || inCorridor;

  // Shunt counting: a genuine direction reversal (forward↔reverse) while moving,
  // once the maneuver has begun. A stop does not change direction — only a sign
  // flip is a shunt, so accel/decel ramps never inflate the count.
  const stopped = Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH;
  const movingDir = stopped ? 0 : tick.gear < 0 ? -1 : 1;
  let lastDir = prev.lastDir;
  let reversals = prev.reversals;
  if (entered && movingDir !== 0) {
    if (lastDir !== 0 && movingDir !== lastDir) reversals += 1;
    lastDir = movingDir;
  }

  // Heading reversal: within tolerance of the start heading turned 180°.
  const headingToTargetDeg = headingDiffDeg(tick.headingDeg, startHeadingDeg + 180);
  const reversedFacing = headingToTargetDeg <= toleranceDeg;

  // Hold clock: at rest INSIDE the corridor (rolling or leaving resets it).
  const stoppedSinceT = stopped && inCorridor ? (prev.stoppedSinceT ?? tick.t) : null;
  const heldFor = stoppedSinceT !== null ? tick.t - stoppedSinceT : 0;

  const done = entered && inCorridor && reversedFacing && stopped && heldFor >= holdSec;

  const movements = entered ? reversals + 1 : 0;
  const progress = done
    ? 1
    : entered
      ? Math.min(0.95, Math.max(0, (180 - headingToTargetDeg) / 180))
      : 0;

  return {
    done,
    progress,
    evalState: { type: "threePointTurn", entered, lastDir, reversals, stoppedSinceT },
    detail: {
      kind: "threePointTurn",
      entered,
      reversals,
      movements,
      headingToTargetDeg: entered ? headingToTargetDeg : null,
    },
  };
}
