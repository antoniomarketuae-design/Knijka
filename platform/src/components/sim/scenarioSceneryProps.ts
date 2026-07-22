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
/**
 * The sc-follow-standstill „колона" (founder R3 #40 — „line of cars is ONE
 * car"): 1–2 visual-only queue cars AHEAD of the staged stationary lead, so
 * the column the copy narrates exists. Truth: the lead is FS_LEAD_CAR
 * (templates-following.ts) held at y = 290 on the fo-follow-v1 northbound
 * lane center x = 4.0625; the shadow rests at y ≈ 281 and the player stops
 * behind it — nothing ever drives past y 290, so bodies at y = 298 / 306
 * (≈ 3.9 m bumper gaps — a real queue) are pure dressing. Grading unchanged:
 * leadGapM still measures the REAL staged lead (visual bodies are not
 * traffic), the trace bytes carry no world actors — no re-record.
 */
const STANDSTILL_COLUMN: readonly ScenarioObstacleSpec[] = [
  { kind: "vehicle", x: 4.0625, y: 298, headingDeg: 0, model: "corva_s", seed: 21, visual: true },
  { kind: "vehicle", x: 4.0625, y: 306, headingDeg: 0, model: "vela_h3", seed: 22, visual: true },
];

/**
 * The sc-ov-narrow corridor dressing (founder R3 #49 — „street not actually
 * narrow"): parked rows on BOTH curbs squeeze the 1+1 street visually without
 * touching the map or the choreography. Truths (traces/scOvNarrow.ts +
 * templates-lanes.ts NARROW_MEETING): driven lines span x ∈ [−4.06, 4.06]
 * with corner cuts at x = 1..2 over y ∈ [96, 114] and [146, 154]; the staged
 * in-lane row sits at (4.06, 120/135); the oncoming holds at (−4.06, 200) and
 * transits the west lane. Bodies hug the carriageway edge at |x| = 7.0 (spans
 * |6.0..8.0|, edge 8.125 — the pe-child parked-row convention), so every
 * driven line keeps ≥ 1.09 m of flank clearance (worst case: lane center
 * |4.06| + hero half-width 0.85 = 4.91 vs body flank 6.0). The squeeze
 * section itself (y ∈ [105, 150]) stays undressed on the west side — the
 * meeting corridor — and on the east the staged row IS the obstruction.
 * Visual-only: no colliders, no grading change, no re-record.
 */
const NARROW_ROWS: readonly ScenarioObstacleSpec[] = (
  [
    // East (player) curb — south approach, clear of the wait pose (4.06, 104).
    [7.0, 25, 0, "vela_h3"],
    [7.0, 40, 0, "pino"],
    [7.0, 55, 0, "corva_s"],
    [7.0, 70, 0, "dret_90"],
    [7.0, 85, 0, "arden_x"],
    // East curb — past the section, clear of the return cut (ends y 154).
    [7.0, 162, 0, "corva_sw"],
    [7.0, 177, 0, "pino"],
    [7.0, 192, 0, "vela_h3"],
    // West (oncoming) curb — parked facing south; the section (y 105..150)
    // and the staged oncoming's hold (−4.06, 200) stay clear.
    [-7.0, 25, 180, "corva_s"],
    [-7.0, 45, 180, "tarpan"],
    [-7.0, 65, 180, "vela_h3"],
    [-7.0, 85, 180, "pino"],
    [-7.0, 160, 180, "dret_90"],
    [-7.0, 176, 180, "corva_sw"],
    [-7.0, 192, 180, "arden_x"],
  ] as const
).map(([x, y, headingDeg, model], i) => ({
  kind: "vehicle" as const,
  x,
  y,
  headingDeg,
  model,
  seed: 30 + i,
  visual: true as const,
}));

const HELD_SCENERY: Record<string, readonly ScenarioObstacleSpec[]> = {
  // traces/scHazardObstacle.ts hazardObstacleRects(): the stalled car
  // curb-side of the driving line the ease-around bends past.
  "sc-hazard-obstacle": [
    { kind: "vehicle", x: 5.5, y: 130, headingDeg: 0, model: "dret_90", seed: 4, visual: true },
  ],
  // traces/scCrossingBusShadow.ts BUS_OBSTACLE: the stopped large occluder at
  // the near (east) curb, nose just south of the zebra — founder R3 #26 („NO
  // BUS AT ALL") ruling: the PROCEDURAL BOX TRUCK stands in until a real bus
  // rig exists (the audit's costed stopgap; the template copy honestly says
  // „камион"). Center/heading are the trace rect's own (8.0, 80, north);
  // `visual: true` keeps the collision consequence in the trace channel where
  // the drill authored it (the graded rect stays the recorder's SAT test).
  "sc-crossing-bus-shadow": [
    { kind: "vehicle", x: 8.0, y: 80, headingDeg: 0, model: "box_truck", seed: 7, visual: true },
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
  "sc-follow-standstill": STANDSTILL_COLUMN,
  "sc-ov-narrow": NARROW_ROWS,
  // traces/scReels.ts accidentMistake(): the parked car the „собствено ПТП"
  // demo hits then flees. The demo authors the COLLISION as a recorder beat
  // (withWhat "staticObject") but hz-obstacle-v1 shows no body there — the clip
  // read as „a car on an open road" (founder R0). Bodied here at the collision
  // point: the mistakes drift RIGHT to x=5.7 and clip it (right flank ≈ 6.55 vs
  // body left flank ≈ 5.5), while the shadow passes LEFT at x=2.2 (≈ 2.5 m
  // clear). `visual: true` (the stalled/parked-car convention): the graded
  // COLLISION stays the recorder's authored beat, so no new live grading path.
  "sc-accident-own-conduct": [
    { kind: "vehicle", x: 6.4, y: 149, headingDeg: 0, model: "corva_s", seed: 8, visual: true },
  ],
  // templates-reels.ts SC_ANIMAL_HAZARD: the „животно на пътя" quadruped. The
  // template supplies it via hazard.presentation "animal" on the ballDartOut
  // path — but that only renders while TrafficLayer's hazardActiveRef is true,
  // and the trace RECORDER has no hazard channel, so recorded reel clips never
  // trigger the dart and the animal never appeared (the clip read as an empty
  // road, founder R0). Held here as STATIC scenery instead: an animal standing
  // in the ego's travel lane (LANE_RIGHT 4.06) at the hazard's own crossing
  // point (y = 152), broadside (headingDeg 90) so it reads as an animal in the
  // road the driver must brake straight for — not swerve across the M1 line.
  // `visual: true` — animals mount NO collider (the swerve/collision is graded
  // in the authored trace); this is pure dressing, like the stalled vehicles.
  "sc-animal-hazard": [
    { kind: "animal", x: 4.06, y: 152, headingDeg: 90, visual: true },
  ],
};

// ---------------------------------------------------------------------------
// Source 3 — parked-decoration CLEAR ZONES (doc 66 R5, founder v1 №9)
// ---------------------------------------------------------------------------

/** A circle (district space) inside which the TrafficLayer parked-car curb
 *  pass must not seat a decoration body. Purely visual — the curb pass has no
 *  colliders and feeds no proximity query, so removing a body changes zero
 *  grading. */
export interface ParkedClearZone {
  x: number;
  y: number;
  radiusM: number;
}

/**
 * Template id → junction-corner clear zones for the deterministic parked-car
 * curb pass (TrafficLayer.computeParkedCars — NOT the held dressing above:
 * the audit that landed here first looked for a held-scenery body, but the
 * corner car is the curb pass's slot 0 of the priority arm).
 *
 * sc-junction-stop (founder v1 №9 + pilot-v2 R0 k3): on tj-stop-v1 the curb
 * pass seats a body at (11, −10.125) — edge tj-e-e (east arm), first slot at
 * arc 11 m, offset 8.125 · 2 · 0.5 + 2.0 south of the centerline — only
 * 15.0 m from the junction node tj-n-c (0, 0). BOTH committed ghost lines cut
 * the corner straight through its footprint: min sample distance 0.84 m
 * (mistake-rolling-stop, t ≈ 22.9) and 0.85 m (shadow-correct, t ≈ 23.65)
 * against a ~2.25 m half-length body. The zone radius pins the lawful corner
 * daylight: the priority arm's carriageway half-width 8.125 m + чл. 98's 5 m
 * no-parking band before a junction + ~2.5 m half body ≈ 15.6 → 16. Radius 16
 * removes exactly that one slot; the survivors stay ≥ 17.0 m out and the
 * nearest of them clears both ghost lines by ≥ 4.57 m center-to-path
 * (pinned in scenarioSceneryProps.test.ts against the committed traces).
 */
const PARKED_CLEAR_ZONES: Record<string, readonly ParkedClearZone[]> = {
  "sc-junction-stop": [{ x: 0, y: 0, radiusM: 16 }],
};

/**
 * Clear zones for one lesson's parked-car curb pass ([] for templates without
 * an authored zone). Flows through LessonWorldCore so the drill and the
 * capture rig mount the SAME filtered decoration (doc 66 R5 — one recipe).
 */
export function parkedClearZonesFor(lessonId: string): readonly ParkedClearZone[] {
  const parsed = parseScenarioLessonId(lessonId);
  return (parsed && PARKED_CLEAR_ZONES[parsed.templateId]) || [];
}

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
