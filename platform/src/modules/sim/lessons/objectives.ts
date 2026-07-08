/**
 * Objective evaluators — pure functions that decide, tick by tick, whether
 * the ACTIVE lesson objective just completed.
 *
 * Design decisions (documented):
 *  - Objectives are strictly SEQUENTIAL: only the active one advances. The
 *    banner always shows exactly one task; a student can never "accidentally"
 *    complete objective 3 while objective 1 is open.
 *  - Objectives measure PROGRESSION, never correctness: crossing a stop line
 *    on red completes a passSignal objective AND earns a RED_LIGHT_CROSSED
 *    violation from the rule engine. Two different questions ("did you get
 *    through the route?" vs "did you drive lawfully?") — the final verdict
 *    combines both.
 *  - Evaluators read only SimTick frames, so the whole lesson engine stays
 *    testable without a WorldRuntime; the runtime's job is to emit honest
 *    ticks (contracts.ts).
 */

import type { LessonObjective } from "../contracts";
import type { SimTick } from "../rules";
import type {
  ObjectiveEvalState,
  ObjectiveParams,
  PassSignalParams,
  ReachZoneParams,
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
        return {
          kind: "completeManeuver",
          maneuver: "emergencyStop",
          minApproachKmh: num(p.minApproachKmh) ? p.minApproachKmh : 40,
          minDecelMs2: num(p.minDecelMs2) ? p.minDecelMs2 : 5,
        };
      }
      if (p.maneuver === "parkInBay") {
        return {
          kind: "completeManeuver",
          maneuver: "parkInBay",
          holdSec: num(p.holdSec) && p.holdSec > 0 ? p.holdSec : 1.5,
        };
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
    case "passSignal":
      return { type: "stateless" };
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
          return {
            type: "emergencyStop",
            armed: false,
            maxDecelMs2: 0,
            prevSpeedKmh: null,
            prevT: null,
          };
        case "parkInBay":
          return { type: "parkInBay", usedReverse: false, stoppedSinceT: null };
        case "roundabout":
          return { type: "roundabout", entered: false };
      }
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface ObjectiveStepResult {
  done: boolean;
  /** 0..1 for HUD progress (1 exactly when done for progressive objectives). */
  progress: number;
  evalState: ObjectiveEvalState;
}

const KMH_TO_MS = 1 / 3.6;
/** Position jumps above this per tick are treated as teleports (reset/respawn). */
const TELEPORT_JUMP_M = 50;
/** At/below this speed the vehicle counts as stopped for maneuvers, km/h. */
const STOPPED_SPEED_KMH = 1;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Advance the ACTIVE objective by one tick. Pure — returns fresh eval state.
 */
export function stepObjective(
  params: ObjectiveParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  switch (params.kind) {
    case "reachZone": {
      const inZone = dist(tick.position.x, tick.position.y, params.x, params.y) <= params.radiusM;
      const slowEnough =
        params.maxSpeedKmh === undefined || tick.speedKmh <= params.maxSpeedKmh;
      const done = inZone && slowEnough;
      return { done, progress: done ? 1 : 0, evalState: prev };
    }

    case "passSignal": {
      const near =
        dist(tick.position.x, tick.position.y, params.x, params.y) <= params.radiusM;
      const crossed =
        near &&
        tick.events.some(
          (e) => e.kind === "stopLineCrossed" && e.control === params.control,
        );
      return { done: crossed, progress: crossed ? 1 : 0, evalState: prev };
    }

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
          return stepEmergencyStop(params.minApproachKmh, params.minDecelMs2, prev, tick);
        case "parkInBay":
          return stepParkInBay(params.holdSec, prev, tick);
        case "roundabout":
          return stepRoundabout(
            params.x,
            params.y,
            params.enterRadiusM,
            params.exitRadiusM,
            prev,
            tick,
          );
      }
  }
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
 * Emergency stop — the mirror of smoothStop: an armed attempt completes only
 * when the vehicle reaches a full stop AND its peak deceleration met the
 * minimum (a firm brake). A gentle coast to a halt leaves it armed (progress
 * 0.5) so the student accelerates and tries a real emergency brake.
 */
function stepEmergencyStop(
  minApproachKmh: number,
  minDecelMs2: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "emergencyStop") return { done: false, progress: 0, evalState: prev };

  let { armed, maxDecelMs2: peakDecel } = prev;
  const { prevSpeedKmh, prevT } = prev;

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
    if (peakDecel >= minDecelMs2) {
      done = true;
    } else {
      // Too soft to count as an emergency brake — re-arm and try again.
      armed = false;
      peakDecel = 0;
    }
  }

  return {
    done,
    progress: done ? 1 : armed ? 0.5 : 0,
    evalState: {
      type: "emergencyStop",
      armed,
      maxDecelMs2: peakDecel,
      prevSpeedKmh: tick.speedKmh,
      prevT: tick.t,
    },
  };
}

/**
 * Reverse-park — completes once the vehicle has engaged reverse gear during
 * the attempt AND then held a full stop continuously for `holdSec`. Rolling
 * again resets the stop clock (the park is not finished until it's still).
 */
function stepParkInBay(
  holdSec: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "parkInBay") return { done: false, progress: 0, evalState: prev };

  const usedReverse = prev.usedReverse || tick.gear < 0;
  const stopped = tick.speedKmh <= STOPPED_SPEED_KMH;
  const stoppedSinceT = stopped ? (prev.stoppedSinceT ?? tick.t) : null;

  const heldFor = stoppedSinceT !== null ? tick.t - stoppedSinceT : 0;
  const done = usedReverse && stoppedSinceT !== null && heldFor >= holdSec;

  const progress = done ? 1 : usedReverse ? (stopped ? 0.75 : 0.5) : 0.25;

  return {
    done,
    progress,
    evalState: { type: "parkInBay", usedReverse, stoppedSinceT },
  };
}

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
  const entered = prev.entered || d <= enterRadiusM;
  const done = entered && d >= exitRadiusM;

  return {
    done,
    progress: done ? 1 : entered ? 0.5 : 0,
    evalState: { type: "roundabout", entered },
  };
}
