/**
 * Objective-param serialization: typed ObjectiveParams (the evaluator union,
 * lessons/types.ts) → the { kind, params } record shape LessonObjective
 * carries and parseObjectiveParams narrows at session start.
 *
 * Shared by validate.ts (round-trip check: a spec that validates can never
 * fail inside createLessonSession) and compile.ts (the actual compile) —
 * kept in its own file so those two stay cycle-free.
 *
 * `toleranceScale` is where a difficulty rung becomes an actual number (doc
 * 76 §7, doc 86 L13). It reaches two kinds of gate and treats them
 * differently on purpose — see WIDEN-ONLY below.
 */

import type { LessonObjective } from "../../contracts";
import {
  PARK_CENTER_TOL_M,
  PARK_HEADING_TOL_DEG,
  REACH_ZONE_GRACE_M,
  REACH_ZONE_HALT_CAP_KMH,
} from "../objectives";
import type { ObjectiveParams } from "../types";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Extra km/h a waypoint's speed cap gains per 1.0 of tolerance above 1. The
 * L1 ladder rung is 1.5, so the fully-aided rung forgives **5 km/h** — the
 * same absolute slack the rule engine's own `speedingGraceMaxKmh` (rules/
 * types.ts) already gives every driver against a posted limit. L2 (1.25)
 * forgives 2.5; L3/L4/L5 forgive nothing.
 *
 * Additive, never multiplicative, and that is the point: multiplying would
 * turn an authored «мини на не повече от 30» into a 45 km/h gate at L1 and
 * the objective's own Bulgarian title would then be a lie (doc 86 D3 —
 * „objective titles promise acts the gates do not measure"). A flat 5 km/h
 * of slack keeps the title true and still stops one honest frame at 33 from
 * locking a beginner out of the rest of the chain (doc 86 B4).
 */
export const SPEED_CAP_GRACE_KMH_PER_TOLERANCE = 10;

/**
 * WIDEN-ONLY (doc 86 B3/B5). A waypoint radius or speed cap is a
 * COMPLETABILITY gate, not a skill: 50 of 154 terminal radii already sit
 * below the 8.125 m lane pitch, and a blown speed-capped waypoint is
 * unrecoverable on 127 scenarios. Difficulty at L4/L5 comes from the aids
 * coming off, exam protocol, traffic, weather and physics — never from
 * shrinking the target, so a `toleranceScale < 1` leaves waypoints alone.
 */
const widenFactor = (toleranceScale: number) => Math.max(1, toleranceScale);

/**
 * Widen a waypoint radius, bounded twice:
 *  - by `maxRadiusWidenM`, which compileScenario derives from the objective
 *    CHAIN so a forgiving rung can never make two consecutive zones overlap
 *    (a zone already containing the car when the previous gate completes is a
 *    graded gate the student never drove);
 *  - by REACH_ZONE_GRACE_M as the standing ceiling — the aided rung never
 *    gets more room than the along-approach grace the evaluator already
 *    grants on EVERY rung (objectives.ts).
 */
function widenRadius(radiusM: number, toleranceScale: number, maxRadiusWidenM: number): number {
  const wanted = radiusM * widenFactor(toleranceScale) - radiusM;
  const allowed = Math.max(0, Math.min(wanted, maxRadiusWidenM, REACH_ZONE_GRACE_M));
  return r2(radiusM + allowed);
}

/**
 * Widen a waypoint's speed cap by the flat grace above.
 *
 * A HALT DEMAND IS NEVER WIDENED. `stepReachZone` treats a cap at or below
 * REACH_ZONE_HALT_CAP_KMH (8) as „come to rest here" and unlocks the
 * approach-grace capsule for it; pushing a 5 km/h gate to 10 would both make
 * «спри напълно» accept a rolling car and strip the very capsule that makes
 * stopping a metre short count. So the 42 halt gates in the catalog read the
 * same at L1 as at L4 — «спри» means спри on every rung.
 *
 * THE POSTED-LIMIT CEILING (doc 87 B58, and B56 before it). The compiled cap
 * is not a private number: `RouteGuidance` prints it in the world, on the gate
 * bar across the lane, as «не по-бързо от N км/ч» — an INSTRUCTION the student
 * reads and obeys. On `sc-speed-dangerous` — the drill whose entire subject is
 * that 51–60 км/ч in a 50 zone is a scored fault — the L1 ladder turned an
 * authored 52 into a bar reading **57 on a street posted 50**, so the world
 * instructed the exact offence it was about to bill. The founder's B58 words
 * for the class: „a student who obeys the number the world shows him commits
 * the mistake the world is grading."
 *
 * The census that made this a class rather than an anecdote: **126** compiled
 * reachZone gates across the catalog carried a cap above their district's
 * posted limit, and **94 of them were the ladder's doing** (authored ≤ posted,
 * compiled above it) — every aided rung of every speed, overtaking and
 * lane-discipline drill, plus the motorway (authored 140 = posted 140 → an L1
 * bar reading 145). Grace is forgiveness for a beginner's speedometer; it was
 * never a licence to post a higher number than the sign.
 *
 * So the grace is bounded by the posted limit, and by `maxSpeedKmh` itself so
 * the WIDEN-ONLY rule above still holds exactly: a template that authored a
 * cap ABOVE its own posted limit keeps that authored cap (tightening it is an
 * authoring decision, not the ladder's, and would move 32 graded gates), it
 * simply stops being inflated further. `postedLimitKmh` absent ⇒ behaviour is
 * bit-identical to before, which is what keeps the 446 gates on maps that
 * declare no limit unchanged.
 */
function widenSpeedCap(
  maxSpeedKmh: number,
  toleranceScale: number,
  postedLimitKmh?: number,
): number {
  if (maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH) return maxSpeedKmh;
  const grace = SPEED_CAP_GRACE_KMH_PER_TOLERANCE * Math.max(0, toleranceScale - 1);
  if (grace <= 0) return maxSpeedKmh;
  const widened = r1(maxSpeedKmh + grace);
  if (postedLimitKmh === undefined || !Number.isFinite(postedLimitKmh)) return widened;
  return Math.min(widened, Math.max(maxSpeedKmh, postedLimitKmh));
}

/**
 * `toleranceScale` widens parkInBay tolerances (L1/L2 forgiveness); absent
 * tolerances scale from the evaluator defaults so the delta is explicit in
 * the compiled data (no hidden defaults at grading time).
 *
 * `maxRadiusWidenM` is the chain-derived ceiling described on widenRadius;
 * it defaults to the standing REACH_ZONE_GRACE_M ceiling so a caller that
 * only has one objective in hand (validate.ts's round-trip) still behaves.
 *
 * `postedLimitKmh` is the street's own limit (`spec.map.params.maxspeedKmh`,
 * mirrored in the district's `meta.scenario.params`). Optional for the same
 * reason: a caller round-tripping a single objective has no map in hand, and
 * absent it the ladder behaves exactly as it always did. See widenSpeedCap —
 * the gate's number is printed in the world, so it may not exceed the sign.
 */
export function serializeObjectiveParams(
  p: ObjectiveParams,
  toleranceScale = 1,
  maxRadiusWidenM = REACH_ZONE_GRACE_M,
  postedLimitKmh?: number,
): { kind: LessonObjective["kind"]; params: Record<string, unknown> } {
  switch (p.kind) {
    case "reachZone": {
      const params: Record<string, unknown> = {
        x: p.x,
        y: p.y,
        radiusM: widenRadius(p.radiusM, toleranceScale, maxRadiusWidenM),
      };
      if (p.maxSpeedKmh !== undefined) {
        params.maxSpeedKmh = widenSpeedCap(p.maxSpeedKmh, toleranceScale, postedLimitKmh);
      }
      // B18/FR-24 — carried through untouched by the ladder, and that IS the
      // point: the widening above stretches the acceptance backwards down the
      // approach at L1/L2 and this flag stops it stretching forwards over the
      // paint. An aided rung forgives a student who stops early; no rung
      // forgives one who stops past the line.
      if (p.acceptBeforeMarkM !== undefined) params.acceptBeforeMarkM = p.acceptBeforeMarkM;
      return { kind: "reachZone", params };
    }
    case "passSignal": {
      const params: Record<string, unknown> = {
        nodeId: p.nodeId,
        x: p.x,
        y: p.y,
        // NOT laddered, deliberately. A passSignal completes on a
        // stopLineCrossed EVENT near the node — the radius is a proximity
        // window the student never feels, so widening it forgives nothing and
        // relieves none of doc 86's blocked-student band. It is also what the
        // guidance layer sizes its ground ring from (scene/guidanceRoute.ts):
        // a rung-dependent 45 → 50 m ring would move a rendered object for no
        // pedagogical gain. The ladder stays out of it.
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
          // enter/exitRadiusM DESCRIBE the ring — they are geometry, not
          // tolerance. Widening exitRadiusM would move where „left the ring"
          // is measured and change what objectives.ts voids the traversal
          // for (doc 86 B6), so the ladder leaves them exactly as authored.
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
              // A MANEUVER tolerance, so it scales both ways: a tighter rung
              // asks for a more precise park, which is real difficulty and
              // always still achievable (the bay does not move).
              centerTolM: r2((p.centerTolM ?? PARK_CENTER_TOL_M) * toleranceScale),
              headingTolDeg: r2((p.headingTolDeg ?? PARK_HEADING_TOL_DEG) * toleranceScale),
              // S2: only the non-default entry gate rides the wire — absent
              // stays byte-identical for every reverse-entry lesson.
              ...(p.entry === "forward" ? { entry: "forward" } : {}),
            },
          };
        case "threePointTurn":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "threePointTurn",
              corridor: { ...p.corridor },
              startHeadingDeg: p.startHeadingDeg,
              // toleranceScale widens the heading tolerance for the guided rungs
              // (L1/L2), symmetric with parkInBay's tolerance widening.
              toleranceDeg: r2(p.toleranceDeg * toleranceScale),
              holdSec: p.holdSec,
            },
          };
      }
  }
}
