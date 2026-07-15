/**
 * Objective-param serialization: typed ObjectiveParams (the evaluator union,
 * lessons/types.ts) → the { kind, params } record shape LessonObjective
 * carries and parseObjectiveParams narrows at session start.
 *
 * Shared by validate.ts (round-trip check: a spec that validates can never
 * fail inside createLessonSession) and compile.ts (the actual compile) —
 * kept in its own file so those two stay cycle-free.
 */

import type { LessonObjective } from "../../contracts";
import { PARK_CENTER_TOL_M, PARK_HEADING_TOL_DEG } from "../objectives";
import type { ObjectiveParams } from "../types";

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * `toleranceScale` widens parkInBay tolerances (L1/L2 forgiveness); absent
 * tolerances scale from the evaluator defaults so the delta is explicit in
 * the compiled data (no hidden defaults at grading time).
 */
export function serializeObjectiveParams(
  p: ObjectiveParams,
  toleranceScale = 1,
): { kind: LessonObjective["kind"]; params: Record<string, unknown> } {
  switch (p.kind) {
    case "reachZone": {
      const params: Record<string, unknown> = { x: p.x, y: p.y, radiusM: p.radiusM };
      if (p.maxSpeedKmh !== undefined) params.maxSpeedKmh = p.maxSpeedKmh;
      return { kind: "reachZone", params };
    }
    case "passSignal": {
      const params: Record<string, unknown> = {
        nodeId: p.nodeId,
        x: p.x,
        y: p.y,
        radiusM: p.radiusM,
        control: p.control,
      };
      if (p.requireRedMet) params.requireRedMet = true;
      return { kind: "passSignal", params };
    }
    case "driveDistance":
      return { kind: "driveDistance", params: { meters: p.meters } };
    case "completeManeuver":
      switch (p.maneuver) {
        case "smoothStop":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "smoothStop",
              minApproachKmh: p.minApproachKmh,
              maxDecelMs2: p.maxDecelMs2,
            },
          };
        case "emergencyStop":
          return {
            kind: "completeManeuver",
            params: { maneuver: "emergencyStop", stagedEventId: p.stagedEventId },
          };
        case "roundabout":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "roundabout",
              x: p.x,
              y: p.y,
              enterRadiusM: p.enterRadiusM,
              exitRadiusM: p.exitRadiusM,
            },
          };
        case "parkInBay":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "parkInBay",
              holdSec: p.holdSec,
              bay: { ...p.bay },
              centerTolM: r2((p.centerTolM ?? PARK_CENTER_TOL_M) * toleranceScale),
              headingTolDeg: r2((p.headingTolDeg ?? PARK_HEADING_TOL_DEG) * toleranceScale),
            },
          };
      }
  }
}
