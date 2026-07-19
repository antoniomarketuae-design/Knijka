/**
 * scenarioSceneryProps — HELD scenario scenery (the render-only audit wave):
 * bodies for things the drills already grade against but never showed.
 *
 * Two sources, composed by heldSceneryFor() into the ScenarioObstacles list
 * LessonScene mounts (scenario lessons only — the existing gate):
 *
 *  1. DISTRICT CONES (meta.scenario.cones): hz-roadworks-v1's authored seam,
 *     flagged "ready for that edit" in traces/scMergeRoadworksShift.ts. Cones
 *     mount through the ScenarioObstacles PROP path — mesh + slim collider —
 *     so a live brush grades COLLISION as "staticObject" (VehicleRig's
 *     untagged fallback), exactly the code the recorded „Провиране през
 *     конусите" demo cites (compile writes collisionMinKmh 0 for every
 *     scenario lesson, so the geometric contact registers at any speed).
 *
 *  2. TEMPLATE DRESSING (keyed by template id — never by district, because
 *     districts are shared: ac-rain-v1 also hosts the van-less rain/fog
 *     drills; poligon-v1 also hosts reverse-line and free drive):
 *      - the five stalled/wreck vehicles are VISUAL-ONLY (`visual: true`,
 *        no collider): for these templates the collision consequence is the
 *        RECORDER's ObstacleRect2D channel + the objective zones BY DESIGN
 *        (each template header names it — "a RECORDER obstacle rect, not a
 *        live prop"), so a live crash surface would be a new grading path
 *        the specs never authored. Visual bodies match the TrafficLayer
 *        curb-decoration convention: visible, not hittable.
 *      - the sc-ed-poligon-chain bay cones DO collide: the trace harness
 *        calls its rects "the headless twins of the scene's cone colliders"
 *        (traces/scEdPoligonChain.ts) — this is the scene side of that pair,
 *        and „Удар в конус" is the drill's own graded mistake.
 *
 * Every coordinate is pinned BY VALUE from its single truth (the district
 * meta / the trace-harness rect), cited at each entry; the unit test
 * re-asserts the pins against the committed district JSON and the public
 * trace exports where they exist (scenarioSceneryProps.test.ts).
 */

import { parseScenarioLessonId } from "@/modules/sim/lessons";
import type {
  ScenarioObstacleSpec,
  ScenarioPropObstacle,
} from "./ScenarioObstacles";

// ---------------------------------------------------------------------------
// Source 1 — district-authored cones (meta.scenario.cones)
// ---------------------------------------------------------------------------

/**
 * Defensive read of `meta.scenario.cones` from a raw district document (the
 * contracts.ts scenarioBaysOf mold). A cone is radially symmetric, so the
 * authored payload carries no heading; districts without the payload yield [].
 */
export function scenarioConesOf(districtRaw: unknown): ScenarioPropObstacle[] {
  if (typeof districtRaw !== "object" || districtRaw === null) return [];
  const meta = (districtRaw as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return [];
  const scenario = (meta as { scenario?: unknown }).scenario;
  if (typeof scenario !== "object" || scenario === null) return [];
  const cones = (scenario as { cones?: unknown }).cones;
  if (!Array.isArray(cones)) return [];
  const out: ScenarioPropObstacle[] = [];
  for (const raw of cones) {
    if (typeof raw !== "object" || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y)
    ) {
      continue;
    }
    out.push({ kind: "prop", prop: "cone", x: c.x, y: c.y, headingDeg: 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source 2 — per-template held dressing
// ---------------------------------------------------------------------------

/** The stopped delivery-van silhouette every "stop short of it" drill stages. */
const VAN_MODEL = "kargo_v";

/**
 * The sc-pe-parked-row-scan row on pe-child-v1 („Покрай редицата паркирани
 * коли" — the audit found the titular row missing; the template header calls
 * it DRESSING, which is exactly this: bodies, no colliders, no grading).
 *
 * Geometry against the pinned map/harness values (traces/scPeParkedRowScan.ts,
 * templates-pe2.ts): east curb x = 9.73, carriageway edge x = 8.125, zebra
 * pe-x-1 at y = 78, child occupancy starts 4 m off the curb (x = 5.73 — the
 * "hidden behind the row" contract). Cars parallel-park on the right edge at
 * x = 7.0: a ~2 m-wide body spans ≈ [6.0, 8.0] — flush with the curb line,
 * covering the occlusion band, and still clear of the mistake-hug ghost line
 * (X_HUG 5.0, hero half-width 0.85 → right flank 5.85). The south block ends
 * at y = 68 (front bumper ≈ 70.25 — the чл. 98 five metres before the zebra);
 * the north block resumes past it. Models: civilian mix, deterministic.
 */
const PARKED_ROW_X = 7.0;
const PARKED_ROW: readonly ScenarioObstacleSpec[] = (
  [
    [19, "vela_h3"],
    [26, "corva_s"],
    [33, "pino"],
    [40, "dret_90"],
    [47, "corva_sw"],
    [54, "arden_x"],
    [61, "pino"],
    [68, "vela_h3"], // last before the zebra — front bumper ~70.25, > 5 m short
    [86, "corva_s"], // row resumes past the crossing
    [93, "tarpan"],
    [100, "vela_h3"],
  ] as const
).map(([y, model], i) => ({
  kind: "vehicle" as const,
  x: PARKED_ROW_X,
  y,
  headingDeg: 0,
  model,
  seed: i,
  visual: true as const,
}));

/**
 * Template id → held dressing. Poses are the trace-harness rect centres BY
 * VALUE (the L7 copy law — each entry cites its truth); `visual: true` on
 * every vehicle (see the header for why), colliders on the poligon cones.
 */
const HELD_SCENERY: Record<string, readonly ScenarioObstacleSpec[]> = {
  // traces/scHazardObstacle.ts hazardObstacleRects(): the stalled car
  // curb-side of the driving line the ease-around bends past.
  "sc-hazard-obstacle": [
    { kind: "vehicle", x: 5.5, y: 130, headingDeg: 0, model: "dret_90", seed: 4, visual: true },
  ],
  // traces/scPkSmoothStop.ts pkVanObstacle(): the stopped van behind the
  // smooth-stop mark (test-pinned against the public export).
  "sc-pk-smooth-stop": [
    { kind: "vehicle", x: 4.06, y: 120, headingDeg: 0, model: VAN_MODEL, seed: 2, visual: true },
  ],
  // traces/scAcWetBraking.ts wetVanObstacle(): the wet-envelope stop's van.
  "sc-ac-wet-braking": [
    { kind: "vehicle", x: 4.06, y: 310, headingDeg: 0, model: VAN_MODEL, seed: 2, visual: true },
  ],
  // traces/scAcSnow.ts snowVanObstacle() (the wet obstacle, verbatim).
  "sc-ac-snow": [
    { kind: "vehicle", x: 4.06, y: 310, headingDeg: 0, model: VAN_MODEL, seed: 3, visual: true },
  ],
  // traces/scHzAccidentScene.ts hzAccidentObstacles(): two damaged cars
  // askew in the curb-half of the lane (the wide-pass tableau).
  "sc-hz-accident-scene": [
    { kind: "vehicle", x: 7.0, y: 150, headingDeg: 20, model: "corva_s", seed: 5, visual: true },
    { kind: "vehicle", x: 7.2, y: 162, headingDeg: -15, model: "vela_h3", seed: 6, visual: true },
  ],
  // traces/scEdPoligonChain.ts poligonChainConeObstacles(): the bay-mouth
  // cones („Подмини гнездото между конусите") — HITTABLE, the twin contract.
  "sc-ed-poligon-chain": [
    { kind: "prop", prop: "cone", x: 140, y: -129, headingDeg: 0 },
    { kind: "prop", prop: "cone", x: 146.5, y: -129, headingDeg: 0 },
  ],
  "sc-pe-parked-row-scan": PARKED_ROW,
};

// ---------------------------------------------------------------------------
// The composition LessonScene mounts
// ---------------------------------------------------------------------------

/**
 * All held scenery for one scenario lesson: the template's dressing + the
 * district's authored cones. Pure data — the caller appends it to the
 * occupied-bay obstacle list and mounts ONE ScenarioObstacles.
 */
export function heldSceneryFor(
  lessonId: string,
  districtRaw: unknown,
): ScenarioObstacleSpec[] {
  const parsed = parseScenarioLessonId(lessonId);
  const dressing = (parsed && HELD_SCENERY[parsed.templateId]) || [];
  return [...dressing, ...scenarioConesOf(districtRaw)];
}
