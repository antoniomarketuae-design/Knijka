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

import { parseScenarioLessonId, scenarioById } from "@/modules/sim/lessons";
import type {
  ScenarioObstacleSpec,
  ScenarioPropObstacle,
} from "./obstacleSpec";

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

  // ---- PARKING-DEPTH: the two neighbours a parking lot cannot express -------
  //
  // A gen_parking_lot district says only „bay N is occupied", and the scene
  // answers that with a deterministic civilian car. Two of the ten new drills
  // are ABOUT a neighbour that is not a car, so their bodies are authored here
  // and their headless twins live in traces/scParkDepth.ts (PARK_DEPTH_VAN /
  // PARK_DEPTH_WALL) — pinned against each other by the unit test below, the
  // same pairing sc-pk-smooth-stop's van uses.
  //
  // Both are HITTABLE, unlike the stalled/wreck dressing above: here the live
  // student is graded against exactly these surfaces (the drills' own mistake
  // demos are geometric contacts with them), so a visual-only body would show
  // him an obstacle the world lets him drive through.

  // sc-park-van: the kargo_v standing in lotvn-bay-2, which the district leaves
  // FREE on purpose so no civilian car is drawn on top of it. Wider and ~0.45 m
  // longer than a compact — it protrudes further into the aisle than the parked
  // cars beside it, which is the sight-line the drill teaches around.
  "sc-park-van": [
    { kind: "vehicle", x: 5.03, y: -2.7, headingDeg: 90, model: "kargo_v", seed: 41 },
  ],

  // sc-park-wall: the garage end wall closing lot-wall-v1's row 1.65 m past the
  // last bay's line. `wall` renders as code geometry with an exact cuboid
  // collider and grades as „staticObject" (the untagged fallback) — the code
  // the drill's own mistake demo cites.
  "sc-park-wall": [
    { kind: "wall", x: 5.03, y: 8.6, headingDeg: 90, lengthM: 6.0, heightM: 1.6, thicknessM: 0.4 },
  ],
};

// ---------------------------------------------------------------------------
// Source 3 — parked-decoration CLEAR ZONES (doc 66 R5, founder v1 №9;
// re-derived for doc 86 L9/D10)
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
 * The zones are DERIVED, never authored (doc 86 L9/D10).
 *
 * This used to be a hand-written allowlist with exactly one entry —
 * `sc-junction-stop: [{0, 0, 16}]` — put there because the curb pass seated a
 * body at (11, −10.125), 15.0 m from the junction node, and both committed
 * ghost lines cut the corner through its footprint at 0.84 / 0.85 m. Two
 * sibling drills on the same map (`sc-junction-scan`, `sc-junction-gap`) had
 * the identical body and no entry, because an allowlist only covers what
 * somebody remembered to list.
 *
 * The junction case is now structural: `TrafficLayer.computeParkedCars`
 * measures the curb walk against the junction mouth `nodeOpenRadiusM` opens
 * plus ЗДвП чл. 98's 5 m, so no body can stand in a junction on ANY of the 90
 * districts and the allowlist entry is dead. What is left here is the one
 * class the district alone cannot know: a STAGED PEDESTRIAN's authored walk
 * line, which is scenario content, not map content.
 *
 * A `pedestrianDartOut` walks a 2-point polyline (orchestrator/runners.ts
 * stages `[start, start + dir·travelM]`) with no obstacle query of any kind —
 * so wherever that line runs through a curb slot, the walker crossed inside a
 * parked car. Measured on the shipped specs: `sc-hz-emergency-stop`'s child
 * STARTS inside the body at (10.13, 149.60) — clearance 0.00 m — and
 * `sc-driver-distraction` (1.35 m) and `sc-hz-accident-scene` (1.38 m) pass
 * within a shoulder of one. Their maps have no authored `crossings[]` entry
 * at the walk (they are mid-block walks), so the district-side crossing rule
 * cannot see them.
 *
 * One rule, no list: cover the walk polyline in overlapping circles wide
 * enough that a body centre inside one cannot reach the line.
 */

/** Half the walker's shoulder width, m — the body the line represents. */
const WALKER_HALF_W_M = 0.35;
/** Worst-case parked-body half-diagonal (2.25 × 0.95 footprint), m. */
const PARKED_HALF_DIAG_M = Math.hypot(2.25, 0.95);
/** Radius of each corridor circle: a body whose centre is outside every
 *  circle cannot overlap the walk line. */
const WALK_CLEAR_RADIUS_M = WALKER_HALF_W_M + PARKED_HALF_DIAG_M;
/** Circle pitch along the walk — ≤ radius, so the union has no gaps. */
const WALK_CLEAR_PITCH_M = WALK_CLEAR_RADIUS_M;
/** Kerb kept clear either side of an authored bus stop, m past the frontage's
 *  own half-diagonal. ЗДвП чл. 98 bans stopping AT the spirka; the extra
 *  metres are the bay a bus needs to pull in and out of, which is exactly the
 *  span that has to be empty for the shelter to be visible from the road. */
const BUS_STOP_NO_PARK_MARGIN_M = 6;

/** Circles covering the segment (ax,ay)→(bx,by) at WALK_CLEAR_RADIUS_M. */
function corridorZones(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): ParkedClearZone[] {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / WALK_CLEAR_PITCH_M));
  const out: ParkedClearZone[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      radiusM: WALK_CLEAR_RADIUS_M,
    });
  }
  return out;
}

const walkZoneCache = new Map<string, readonly ParkedClearZone[]>();

/**
 * Clear zones for one lesson's parked-car curb pass ([] when the template
 * stages no walking pedestrian). Flows through LessonWorldCore so the drill
 * and the capture rig mount the SAME filtered decoration (doc 66 R5 — one
 * recipe). Purely visual: the curb pass has no colliders and feeds no
 * proximity query, so removing a body changes zero grading.
 */
export function parkedClearZonesFor(
  lessonId: string,
  districtRaw?: unknown,
): readonly ParkedClearZone[] {
  const parsed = parseScenarioLessonId(lessonId);
  if (!parsed) return [];
  // The district is an OPTIONAL second input (the bus-stop rule below), so the
  // cache must not serve a district-less answer to a district-ful caller.
  const cacheKey = `${parsed.templateId}|${districtRaw === undefined ? 0 : 1}`;
  const cached = walkZoneCache.get(cacheKey);
  if (cached) return cached;
  const spec = scenarioById(parsed.templateId);
  const zones: ParkedClearZone[] = [];
  // ── RULE 2 (doc 87 B64): NOBODY PARKS AT A BUS STOP. ─────────────────────
  //
  // ЗДвП чл. 98, ал. 1, т. 4 — спиране и престой на спирка на превозно средство
  // от редовните линии е забранено. The curb pass did not know that, so on
  // `sp-creep-v1` the decorative row ran unbroken straight past the frontage
  // the drill points at, and the shelter that now stands there was behind a
  // parked car from the driving seat: „I stopped at my bus stop" with the bus
  // stop hidden by the thing that may not be there.
  //
  // Derived from the same authored key that places the shelter, so there is no
  // list to keep in sync — a map that names a stop clears its own kerb, and
  // the 90 districts that name none are byte-identical. Radius covers the
  // frontage plus the ban's own margin rather than a guessed number.
  if (districtRaw !== null && typeof districtRaw === "object") {
    const buildings = (districtRaw as { buildings?: unknown }).buildings;
    if (Array.isArray(buildings)) {
      for (const b of buildings as Array<{
        kind?: string;
        footprint?: Array<[number, number]>;
      }>) {
        if (b.kind !== "busStop" || !Array.isArray(b.footprint) || b.footprint.length < 3) continue;
        let cx = 0;
        let cy = 0;
        let half = 0;
        for (const [px, py] of b.footprint) {
          cx += px;
          cy += py;
        }
        cx /= b.footprint.length;
        cy /= b.footprint.length;
        for (const [px, py] of b.footprint) half = Math.max(half, Math.hypot(px - cx, py - cy));
        zones.push({ x: cx, y: cy, radiusM: half + BUS_STOP_NO_PARK_MARGIN_M });
      }
    }
  }
  if (spec) {
    const staged = [
      ...(spec.staged ?? []),
      ...spec.levels.flatMap((level) => level.stagedAdd ?? []),
    ];
    for (const event of staged) {
      if (event.kind !== "pedestrianDartOut") continue;
      zones.push(
        ...corridorZones(
          event.start.x,
          event.start.y,
          event.start.x + event.dir.x * event.travelM,
          event.start.y + event.dir.y * event.travelM,
        ),
      );
    }
  }
  const frozen: readonly ParkedClearZone[] = zones;
  walkZoneCache.set(cacheKey, frozen);
  return frozen;
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
