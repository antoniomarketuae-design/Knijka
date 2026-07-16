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
      return { type: "stateless" };
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
          return { type: "roundabout", entered: false, exitSignaled: false };
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

/** Default max distance of the car centre from the bay centre at rest, m. */
export const PARK_CENTER_TOL_M = 0.5;
/** Default max |heading − bay axis| at rest, degrees. */
export const PARK_HEADING_TOL_DEG = 10;
/** Reverse-gear credit for the park accrues only within this radius of the bay, m. */
export const PARK_MANEUVER_ZONE_M = 15;

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
    case "reachZone": {
      const inZone = dist(tick.position.x, tick.position.y, params.x, params.y) <= params.radiusM;
      const slowEnough =
        params.maxSpeedKmh === undefined || tick.speedKmh <= params.maxSpeedKmh;
      const done = inZone && slowEnough;
      return { done, progress: done ? 1 : 0, evalState: prev };
    }

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
 *   2. a full stop inside the zone during the current visit, followed by a
 *      crossing on green — the signature of waiting a red out. (A student who
 *      voluntarily stops at a green and proceeds matches it too; with the
 *      crossing-time-only sensor that stop-verify-proceed behavior is the
 *      closest honest proxy, and it is exactly the drilled sequence.)
 * Reds met by EARLIER passSignal objectives count via ctx.redsMetInRun.
 * Feasibility: runtime SIGNAL_TIMING gives every light red 26 s of every
 * 50 s cycle, so a student who crossed on green can always re-approach, stop
 * at the line, and meet a red within ≤ 24 s — the gate can never deadlock.
 */
function stepPassSignal(
  params: PassSignalParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  if (prev.type !== "passSignal") return { done: false, progress: 0, evalState: prev };

  const inZone =
    dist(tick.position.x, tick.position.y, params.x, params.y) <= params.radiusM;

  // Visit-scoped stop memory: leaving the zone forgets the stop, so a halt
  // elsewhere can never certify this junction's red.
  let stoppedInZoneVisit = inZone
    ? prev.stoppedInZoneVisit || tick.speedKmh <= STOPPED_SPEED_KMH
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

function stepSmoothStop(
  minApproachKmh: number,
  maxDecelMs2: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "smoothStop") return { done: false, progress: 0, evalState: prev };

  let { armed, maxDecelMs2: peakDecel } = prev;
  const { prevSpeedKmh, prevT } = prev;

  // Track deceleration between consecutive ticks while an attempt is armed.
  if (armed && prevSpeedKmh !== null && prevT !== null && tick.t > prevT) {
    const decel = ((prevSpeedKmh - tick.speedKmh) * KMH_TO_MS) / (tick.t - prevT);
    if (decel > peakDecel) peakDecel = decel;
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
      prevSpeedKmh: tick.speedKmh,
      prevT: tick.t,
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

  // Exit window: only ticks AFTER entering, outward of the ring radius.
  if (entered && d > enterRadiusM && tick.indicator === "right") exitSignaled = true;

  let done = false;
  if (entered && d >= exitRadiusM) {
    if (exitSignaled) {
      done = true;
    } else {
      // Left the roundabout without the exit signal — traversal void, redo.
      entered = false;
      exitSignaled = false;
    }
  }

  return {
    done,
    progress: done ? 1 : entered ? (exitSignaled ? 0.75 : 0.5) : 0,
    evalState: { type: "roundabout", entered, exitSignaled },
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
