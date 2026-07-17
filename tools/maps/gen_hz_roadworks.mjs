/**
 * gen_hz_roadworks.mjs — the ROADWORKS LANE-CLOSURE micro-map (Scenario Studio
 * doc 76 §3; doc 72 §10 archetype OV-16 „Цип-принцип" in its temporary-
 * signalling frame + OV-01/OV-02, the lane-change duties) →
 * content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * STRUCTURAL PARENTS, and why there are two (honest note): the backlog names
 * gen_hazard_obstacle.mjs as the basedOn, and this file takes its whole
 * OBSTACLE PHILOSOPHY from it — the things you can hit (there: a stalled car;
 * here: the cones) are NOT map data but recorder obstacle rects the
 * ScenarioSpec's trace scripts pin by value (the sc-pk-smooth-stop pattern).
 * The CARRIAGEWAY, however, is gen_ln_merge.mjs's: a lane closure is a lane
 * DROP, and a merge only grades as a merge on a ONE-WAY multi-lane edge. On
 * gen_hazard_obstacle's two-way 1+1 street „merging left" would be crossing
 * into oncoming — a different (and wrong) lesson, graded by CENTER_LINE_
 * TOUCHED, not by the lane-change adjudicator this template is about.
 *
 *   - hz-roadworks-v1 „Улица с ремонт в дясната лента": a one-way 2-lane city
 *     street whose RIGHT (curb) lane is coned off, split into THREE collinear
 *     segments at plain degree-2 nodes (the gen_mw_entry precedent) so the
 *     works can carry their OWN posted limit:
 *
 *        hzr-n-end (0, 310)
 *            │   hzr-e-exit — 50 again, both lanes open
 *        hzr-n-works-end (0, 276)
 *            │   hzr-e-works — ВРЕМЕННО 30 through the site
 *            │   lane 1 (open)   center x = -4.06   ← the lane that survives
 *            │   lane 0 (closed) center x = +4.06   ← yours; cones own it
 *        hzr-n-works-start (0, 240)
 *            │   hzr-e-approach — 50
 *        …taperToY = 240  ← the cone taper has fully closed lane 0
 *        …taperFromY = 216 ← the taper begins (24 m of конусно стеснение)
 *            │
 *        hzr-n-start (0, 0)
 *
 * WHAT GRADES THIS, honestly (no new engine code):
 *   - the merge is a laneId 0 → 1 delta WITHIN the approach edge, so the
 *     SHIPPED lane-change adjudication (indicator + mirror, rules/engine.ts
 *     §3) grades it. Every authored merge commits far enough from the works
 *     joint that laneChangeJointGraceSec (1.5 s) can never eat the grade —
 *     ASSERTED below against the authored pace, not hoped for;
 *   - „снижи скоростта" is REAL LAW here, not narration: the works segment is
 *     its own edge at maxspeed 30, so the shipped speeding detectors grade the
 *     site. It is deliberately a PLAIN LIMIT (an edge maxspeed), NOT a
 *     curveAdvisory zone — the backlog's own ruling: a curveAdvisory span
 *     would drag SPEED_TOO_FAST_FOR_CURVE into a template about merging;
 *   - „did you actually get out of the closed lane" is the OBJECTIVE GATE: a
 *     reachZone pinned on the open-lane center inside the works with a radius
 *     under the 8.125 m lane pitch, so it is unsatisfiable from lane 0.
 *
 * KNOWN CAPABILITY GAPS (honest, flagged — the gen_ln_merge.mjs precedent):
 *   1. THE CONES DO NOT REACH THE LIVE SESSION. They grade in every RECORDED
 *      drive (the trace scripts feed meta.scenario.cones to the recorder as
 *      ObstacleRect2D with collisionMinKmh 0 — doc 76 §0's low-speed collider
 *      ruling, so brushing one registers), which is what the §5/§9 gates need.
 *      But LessonScene derives its live ScenarioObstacles ONLY from occupied
 *      parking BAYS, so a live student meets no cone collider and no cone
 *      mesh. The data seam is authored here and ready (meta.scenario.cones);
 *      closing it is a LessonScene edit this map does not own. The live drill
 *      stays honest without it: POOR_LANE_KEEPING and the objective gate both
 *      still bite a driver who rides the closed lane — only the physical
 *      contact is missing.
 *   2. NO TEMPORARY-SIGNALLING ASSETS EXIST. world/types.ts SignKind is a
 *      closed union of the shipped GLBs — there is no „ремонт"/А23 plate, no
 *      lane-shift arrow, no works lamp; and DistrictZoneKind carries no
 *      roadworks span. So the site's signalling is the 30-limit edge + the
 *      cone data + the scenario copy and the trace annotations. It GRADES
 *      correctly; it does not yet fully RENDER.
 *
 * KEEP-RIGHT HONESTY — why this street is sized the way it is (the
 * gen_ln_merge law, tightened): on a 2-lane one-way with no span,
 * rules/engine.ts computes rightmostRequiredLane = 0, so the correctly-merged
 * driver sitting in lane 1 IS a keep-right candidate and would grade
 * NOT_KEEPING_RIGHT after keepRightSustainSec (12 s) — a false positive
 * against a driver doing exactly what the closure demands. The engine cannot
 * know the curb lane is coned (that IS gap 1 above). An emergencyLane/busLane
 * span would exempt him — and is REFUSED here, because it would also drag
 * EMERGENCY_LANE_DRIVING / bus-lane codes into the „провиране през конусите"
 * demo, whose whole point is that the cones and the line are the consequence.
 * So the map answers structurally: this street's mandatory 30 zone makes the
 * lane-1 run SLOWER (hence longer in seconds) than gen_ln_merge's, and the
 * geometry is sized so the worst authored run still lands inside the same
 * 0.75 budget. The invariant is ASSERTED below, so a future param change that
 * breaks it fails the BUILD instead of the demo.
 *
 * LAW NOTES (verified against content/questions, see rules/catalog.ts):
 *   - маневра само след като водачът се убеди, че е безопасна, и със сигнал:
 *     ЗДвП чл. 25 — q-manevri-033;
 *   - временна организация на движението / пътни знаци и маркировка при
 *     ремонт: Наредба № 2/2001 — q-signali-i-markirovka-032/060, q-signs-013.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_hz_roadworks.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/hz-roadworks-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Kinematic recorder envelope (traces/recorder.ts): accel 2.2 m/s². */
const RECORDER_ACCEL_MPS2 = 2.2;
/** Rule-engine defaults the authored drives are sized against (rules/types.ts
 *  DEFAULT_RULE_CONFIG) — mirrored here so a param change that would make the
 *  map grade its own correct drive fails the build. */
const KEEP_RIGHT_SUSTAIN_SEC = 12;
const LANE_KEEP_MAX_OFFSET_M = 1.3 * 2.5;
const LANE_CHANGE_JOINT_GRACE_SEC = 1.5;
/** Metres of violation-free travel that earn CLEAN_DRIVING — the shadow demo
 *  must be able to reach it, so the street cannot be shorter than this. */
const CLEAN_DRIVING_DISTANCE_M = 250;
/** Safety margin on the keep-right budget: the worst-case authored run in the
 *  open lane must stay under this fraction of the sustain window. */
const KEEP_RIGHT_BUDGET_RATIO = 0.75;
/** Safety margin on the joint grace: the authored merge's laneId flip must sit
 *  at least this multiple of the grace away from the works joint. */
const JOINT_GRACE_SAFETY = 1.5;

/** The authored drives of traces/scMergeRoadworksShift.ts, km/h. */
const AUTHORED_CRUISE_KMH = 45; // approach cruise, under the posted 50
const AUTHORED_EASE_KMH = 30; // shed in the CLOSED lane to let the through car go by
const AUTHORED_MERGE_KMH = 35; // the speed every authored merge is committed at
const AUTHORED_WORKS_KMH = 28; // …and the pace held through the site, under its 30
const AUTHORED_EXIT_KMH = 42; // the runout past the works, under the resumed 50
/** Lateral run of the authored merge (8.125 m of lateral over this arc), m. */
const AUTHORED_MERGE_RUN_M = 34;
/** The LATEST arclength any authored merge's laneId flip lands at (the
 *  last-moment demo of the §9 pair — traces/scMergeRoadworksShift.ts). */
const AUTHORED_LATEST_FLIP_Y = 218;
/** …and the EARLIEST (the shadow's own flip) — the keep-right worst case. */
const AUTHORED_EARLIEST_FLIP_Y = 213;
/** Where the authored drives come to rest (the finish gate's runout), m. */
const AUTHORED_FINISH_Y = 294;

/** Traffic-cone footprint (tools/blender/scenario_props.py's cone base), m. */
const CONE_HALF_M = 0.3;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (a one-way 2-lane street whose curb lane is coned off)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix (e.g. "hzr")
 *   approachM: number,    // the 50 approach segment (180..280)
 *   worksM: number,       // the 30 works segment (24..60)
 *   exitM: number,        // the 50 runout past the works (24..60)
 *   taperM: number,       // cone-taper length (16..48)
 *   maxspeedKmh: number,  // posted urban limit outside the works (40..60)
 *   worksKmh: number,     // the works' own temporary limit (20..40)
 *   spawnY: number,       // player spawn, m of arc (8..30)
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildRoadworksStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    approachM,
    worksM,
    exitM,
    taperM,
    maxspeedKmh,
    worksKmh,
    spawnY,
    noteBg,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(approachM >= 180 && approachM <= 280)) errors.push(`approachM must be within 180..280 m, got ${approachM}`);
  if (!(worksM >= 24 && worksM <= 60)) errors.push(`worksM must be within 24..60 m, got ${worksM}`);
  if (!(exitM >= 24 && exitM <= 60)) errors.push(`exitM must be within 24..60 m, got ${exitM}`);
  if (!(taperM >= 16 && taperM <= 48)) errors.push(`taperM must be within 16..48 m, got ${taperM}`);
  if (!(maxspeedKmh >= 40 && maxspeedKmh <= 60)) errors.push(`maxspeedKmh must be within 40..60, got ${maxspeedKmh}`);
  if (!(worksKmh >= 20 && worksKmh <= 40)) errors.push(`worksKmh must be within 20..40, got ${worksKmh}`);
  if (!(worksKmh < maxspeedKmh)) errors.push(`the works limit ${worksKmh} must be BELOW the street's ${maxspeedKmh}`);
  if (!(spawnY >= 8 && spawnY <= 30)) errors.push(`spawnY must be within 8..30 m, got ${spawnY}`);
  if (errors.length > 0) throw new Error(`gen_hz_roadworks params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2; // the archetype IS 2 → 1 (coned); only this shape is asserted
  const halfRoadM = r2((lanes * SCALED_LANE_W) / 2); // 8.13
  // Locator one-way lane math (runtime/locator.ts computeLane): lane j center
  // sits at x = lanes·W/2 − (j + 0.5)·W east of the centerline.
  const laneClosedX = r2(SCALED_LANE_W / 2); // 4.06 — laneId 0 (curb lane; coned off)
  const laneOpenX = r2(-SCALED_LANE_W / 2); // -4.06 — laneId 1 (the survivor)

  const worksFromY = approachM;
  const worksToY = approachM + worksM;
  const endY = approachM + worksM + exitM;
  const taperToY = worksFromY; // the lane is fully closed where the site begins
  const taperFromY = taperToY - taperM;

  // -- Nodes / edges. THREE collinear segments at plain degree-2 vertices (the
  // gen_mw_entry precedent: a data boundary, not a junction) — the works carry
  // their own posted limit, and the lane centers are identical on all three
  // (every segment is a 2-lane one-way on x = 0), so no lateral hand-off exists.
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-works-start`]: [0, worksFromY],
    [`${idPrefix}-n-works-end`]: [0, worksToY],
    [`${idPrefix}-n-end`]: [0, endY],
  };
  const segment = (id, fromNode, toNode, fromY, toY, limit, name) => {
    const geometry = [
      [0, fromY],
      [0, toY],
    ];
    return {
      id,
      from: fromNode,
      to: toNode,
      class: "primary",
      name,
      oneway: true,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed: limit,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };
  const APPROACH_EDGE = `${idPrefix}-e-approach`;
  const WORKS_EDGE = `${idPrefix}-e-works`;
  const EXIT_EDGE = `${idPrefix}-e-exit`;
  const EDGES = [
    segment(APPROACH_EDGE, `${idPrefix}-n-start`, `${idPrefix}-n-works-start`, 0, worksFromY, maxspeedKmh, `${label} — подход`),
    segment(WORKS_EDGE, `${idPrefix}-n-works-start`, `${idPrefix}-n-works-end`, worksFromY, worksToY, worksKmh, `${label} — участък в ремонт`),
    segment(EXIT_EDGE, `${idPrefix}-n-works-end`, `${idPrefix}-n-end`, worksToY, endY, maxspeedKmh, `${label} — изход`),
  ];

  const INTERSECTIONS = []; // collinear degree-2 splits — none by the OSM convention
  const CROSSINGS = []; // a pure merge street carries no crossing
  const ROUNDABOUTS = [];
  const ZONES = []; // see the header: NO span — an emergencyLane/busLane span
  // would exempt keep-right at the price of dragging its own code into the
  // cone demo. The sizing law below is the answer instead.

  // -- The CONES (meta.scenario.cones): the taper that closes lane 0, then the
  // boundary line along the closed lane's inner edge through the site. DATA
  // ONLY — the trace scripts turn these into recorder ObstacleRect2Ds and the
  // battery re-proves every copy against this file (the L7 pattern). See gap 1.
  const CONE_TAPER_START_X = r2(halfRoadM - 0.53); // 7.6 — just inside the curb
  const CONE_LINE_X = 0.6; // the closed lane's inner edge, clear of the open lane
  const TAPER_CONES = 5;
  const WORKS_CONES = 5;
  const CONES = [];
  for (let i = 0; i < TAPER_CONES; i++) {
    const t = i / (TAPER_CONES - 1);
    CONES.push({
      id: `${idPrefix}-cone-taper-${i + 1}`,
      x: r2(CONE_TAPER_START_X + (CONE_LINE_X - CONE_TAPER_START_X) * t),
      y: r2(taperFromY + taperM * t),
    });
  }
  const worksConeFromY = worksFromY + 6;
  const worksConeToY = worksToY - 2;
  for (let i = 0; i < WORKS_CONES; i++) {
    const t = i / (WORKS_CONES - 1);
    CONES.push({
      id: `${idPrefix}-cone-works-${i + 1}`,
      x: CONE_LINE_X,
      y: r2(worksConeFromY + (worksConeToY - worksConeFromY) * t),
    });
  }

  // -- Spawns: the closed lane (the drill's start), an open-lane checkpoint
  // inside the site and the finish the ScenarioSpec pins by value.
  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-closed-lane`,
      x: laneClosedX,
      y: spawnY,
      heading: 0,
      edgeId: APPROACH_EDGE,
      name: "Начало — в дясната лента, която е затворена за ремонт",
    },
    {
      id: `${idPrefix}-spawn-works`,
      x: laneOpenX,
      y: r2((worksFromY + worksToY) / 2),
      heading: 0,
      edgeId: WORKS_EDGE,
      name: "Контролна точка — през стеснението по временната лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneOpenX,
      y: r2(endY - 15),
      heading: 0,
      edgeId: EXIT_EDGE,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- Two blocks, one per side (visual anchors + the „улицата се стеснява"
  // frame), clear of the carriageway + a ~4 m sidewalk on either side.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-west`,
      height: 14,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 26)), r2(taperFromY - 60)],
        [r2(-(halfRoadM + 8)), r2(taperFromY - 60)],
        [r2(-(halfRoadM + 8)), r2(taperFromY - 24)],
        [r2(-(halfRoadM + 26)), r2(taperFromY - 24)],
      ],
    },
    {
      id: `${idPrefix}-b-east`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(halfRoadM + 8), r2(taperFromY + 8)],
        [r2(halfRoadM + 24), r2(taperFromY + 8)],
        [r2(halfRoadM + 24), r2(worksToY + 8)],
        [r2(halfRoadM + 8), r2(worksToY + 8)],
      ],
    },
  ];

  // -- Bounds + stats.
  const bounds = { minX: Infinity, minY: -6, maxX: -Infinity, maxY: r2(endY + 6) };
  bounds.minX = -halfRoadM - 6;
  bounds.maxX = halfRoadM + 6;
  for (const bl of BUILDINGS) {
    for (const [x] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
    }
  }
  bounds.minX = r2(bounds.minX - 4);
  bounds.maxX = r2(bounds.maxX + 4);

  /**
   * Scenario Studio payload (doc 76): the archetype recipe + the lane truth +
   * the cone set. ScenarioSpecs and trace scripts pin these BY VALUE; the
   * contract battery asserts every copy against this file (the L7 pattern).
   */
  const scenario = {
    archetype: "merge-lane",
    params: { approachM, worksM, exitM, taperM, maxspeedKmh, worksKmh, lanesBefore: lanes, lanesAfter: 1 },
    lanesPerDirection: lanes,
    laneClosedX,
    laneOpenX,
    // The story's arclengths, in DISTRICT y (the street runs on x = 0).
    taperFromY,
    taperToY,
    worksFromY,
    worksToY,
    endY,
    approachEdgeId: APPROACH_EDGE,
    worksEdgeId: WORKS_EDGE,
    exitEdgeId: EXIT_EDGE,
    spawnY,
    coneHalfM: CONE_HALF_M,
    coneLineX: CONE_LINE_X,
    cones: CONES,
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_hz_roadworks.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна еднопосочна улица с ремонт в дясната лента — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: noteBg,
      },
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
      },
      scenario,
    },
    roads: {
      nodes: Object.entries(NODES)
        .map(([id, [x, y]]) => ({ id, x: r2(x), y: r2(y) }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: EDGES,
    },
    intersections: INTERSECTIONS,
    crossings: CROSSINGS,
    roundabouts: ROUNDABOUTS,
    buildings: BUILDINGS,
    spawnPoints: SPAWN_POINTS,
  };

  // -------------------------------------------------------------------------
  // Self-validation (the gen_ln_merge invariants + the roadworks laws)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    for (const [x] of e.geometry) if (x !== 0) post.push(`${e.id}: the street must stay collinear on x = 0`);
    // THE ARCHETYPE'S SHAPE: every segment is the SAME one-way 2-lane
    // carriageway, so the lane centers never move across a joint.
    if (!e.oneway) post.push(`${e.id}: the archetype is a ONE-WAY street (oneway: true)`);
    if (e.lanes !== lanes) post.push(`${e.id}: every segment is a 2-lane one-way carriageway`);
  }
  if (EDGES.length !== 3) post.push("the archetype is approach → works → exit: author exactly three segments");
  if (EDGES[1].maxspeed !== worksKmh) post.push("the works segment must carry the temporary limit");
  for (const e of [EDGES[0], EDGES[2]]) {
    if (e.maxspeed !== maxspeedKmh) post.push(`${e.id}: outside the site the street's own limit applies`);
  }
  if (INTERSECTIONS.length !== 0) post.push("roadworks must carry ZERO intersections (no stop line, no junction tracker)");
  if (CROSSINGS.length !== 0) post.push("roadworks must carry ZERO crossings (nothing may excuse a stop here)");
  if (ZONES.length !== 0) post.push("roadworks must carry ZERO zone spans — see the keep-right header note");
  // The joints are plain degree-2 vertices (a data boundary, not a junction).
  for (const nodeId of [`${idPrefix}-n-works-start`, `${idPrefix}-n-works-end`]) {
    const degree = EDGES.filter((e) => e.from === nodeId || e.to === nodeId).length;
    if (degree !== 2) post.push(`${nodeId}: a collinear split must stay a degree-2 vertex, got ${degree}`);
  }
  // Lane-center math (the Locator's one-way bank).
  if (laneClosedX !== r2(SCALED_LANE_W / 2)) post.push("closed-lane center must sit half a lane east of the centerline");
  if (laneOpenX !== r2(-SCALED_LANE_W / 2)) post.push("open-lane center must sit half a lane west of the centerline");
  if (Math.abs(laneClosedX - laneOpenX - SCALED_LANE_W) > 0.02) {
    post.push("the two lane centers must be exactly one lane pitch apart");
  }
  // The story's arclengths.
  if (!(spawnY < taperFromY && taperFromY < taperToY && taperToY === worksFromY && worksFromY < worksToY && worksToY < endY)) {
    post.push(
      `story order broken: spawn ${spawnY} < taperFrom ${taperFromY} < taperTo ${taperToY} = worksFrom ${worksFromY} < worksTo ${worksToY} < end ${endY}`,
    );
  }
  if (taperToY - taperFromY !== taperM) post.push("taper span must be exactly taperM long");
  // Recorder-envelope honesty (traces/recorder.ts) — the authored drives must
  // be physically reachable on this geometry:
  //  1. the approach must fit move-off → cruise → the mirror/indicator ritual
  //     → the merge run, all COMPLETE before the cones close the lane;
  const buildM = (AUTHORED_CRUISE_KMH / 3.6) ** 2 / (2 * RECORDER_ACCEL_MPS2);
  if (taperToY - spawnY < buildM + AUTHORED_MERGE_RUN_M + 30) {
    post.push(
      `the closed lane dies ${r2(taperToY - spawnY)} m after the spawn — no honest drill: build ${r2(buildM)} + merge run ${AUTHORED_MERGE_RUN_M} + 30 m of ritual needed`,
    );
  }
  //  2. THE JOINT-GRACE LAW: a lane delta within laneChangeJointGraceSec of a
  //     segment transition is DROPPED (rules/engine.ts §3, the C1 revision).
  //     The LATEST authored merge's flip must therefore clear the works joint
  //     by a real margin, or the §9 „вливане без мигач" assert loses its teeth
  //     silently — the worst possible failure mode.
  const latestFlipToJointSec = (worksFromY - AUTHORED_LATEST_FLIP_Y) / (AUTHORED_MERGE_KMH / 3.6);
  if (latestFlipToJointSec < LANE_CHANGE_JOINT_GRACE_SEC * JOINT_GRACE_SAFETY) {
    post.push(
      `the latest authored merge flips ${r2(latestFlipToJointSec)} s before the works joint — the ${LANE_CHANGE_JOINT_GRACE_SEC} s joint grace would eat the grade: move the taper south or the works north`,
    );
  }
  //  3. THE KEEP-RIGHT LAW (see the header): the longest run an AUTHORED drive
  //     spends in laneId 1 is „flipped at the earliest authored point → the
  //     finish". On a span-less 2-lane one-way that run IS a keep-right
  //     episode, so it must stay well under keepRightSustainSec at the
  //     authored pace. Because the site imposes 30, this run is SLOWER than
  //     gen_ln_merge's and the budget is what caps worksM/exitM — NOT a style
  //     choice. Walk the three paces the drives actually use.
  const worstThroughSec =
    (worksFromY - AUTHORED_EARLIEST_FLIP_Y) / (AUTHORED_MERGE_KMH / 3.6) +
    (worksToY - worksFromY) / (AUTHORED_WORKS_KMH / 3.6) +
    (AUTHORED_FINISH_Y - worksToY) / (AUTHORED_EXIT_KMH / 3.6);
  if (worstThroughSec >= KEEP_RIGHT_SUSTAIN_SEC * KEEP_RIGHT_BUDGET_RATIO) {
    post.push(
      `the open-lane run takes ${r2(worstThroughSec)} s at the authored paces — NOT_KEEPING_RIGHT fires at ${KEEP_RIGHT_SUSTAIN_SEC} s: shorten worksM/exitM or move the taper north`,
    );
  }
  //  3b. …and the street must still be LONG enough for the shadow to earn
  //     CLEAN_DRIVING, or its trace gate can never assert the §5 innocence
  //     commendation. Together with (3) this pins the segment lengths from
  //     both sides.
  if (AUTHORED_FINISH_Y - spawnY < CLEAN_DRIVING_DISTANCE_M + 5) {
    post.push(
      `only ${r2(AUTHORED_FINISH_Y - spawnY)} m are driven — the shadow cannot reach the ${CLEAN_DRIVING_DISTANCE_M} m CLEAN_DRIVING streak: lengthen approachM`,
    );
  }
  //  4. the лента-change must be gradable: the adjudicator ignores deltas
  //     under laneChangeMinSpeedKmh (10), so the authored paces must clear it
  //     with room, and nothing about them may grade as speeding.
  if (!(AUTHORED_CRUISE_KMH < maxspeedKmh)) post.push("the authored cruise must stay under the posted limit");
  if (!(AUTHORED_EXIT_KMH < maxspeedKmh)) post.push("the authored runout must stay under the resumed limit");
  if (!(AUTHORED_WORKS_KMH < worksKmh)) post.push("the authored works pace must stay under the site's temporary limit");
  if (!(AUTHORED_EASE_KMH > 15)) post.push("the authored ease must stay well over laneChangeMinSpeedKmh (10)");
  //  5. the merge's lateral rate must be a lane change, not a swerve: the
  //     off-centre window it opens must stay under laneKeepSustainSec (3 s).
  const offCentreLateralM = 2 * (0.5 * SCALED_LANE_W - LANE_KEEP_MAX_OFFSET_M);
  const offCentreSec =
    (AUTHORED_MERGE_RUN_M * (offCentreLateralM / SCALED_LANE_W)) / (AUTHORED_MERGE_KMH / 3.6);
  if (!(offCentreSec < 3)) {
    post.push(`the authored merge sits off-centre for ${r2(offCentreSec)} s — POOR_LANE_KEEPING fires at 3 s: shorten AUTHORED_MERGE_RUN_M`);
  }
  //  6. THE CONE LAW: the taper must close the lane it claims to close, the
  //     boundary line must live inside the closed lane, and — the invariant
  //     the shadow's innocence rests on — no cone may reach the OPEN lane's
  //     driving line (hero half-width 0.85 m; vehicle/tuning.ts).
  const HERO_HALF_W = 0.85;
  for (const c of CONES) {
    if (!(c.y > taperFromY - 0.01 && c.y < endY)) post.push(`${c.id}: outside the street's span`);
    if (Math.abs(c.x) > halfRoadM) post.push(`${c.id}: off the carriageway`);
    const clearanceToOpenLine = Math.abs(c.x - laneOpenX) - CONE_HALF_M - HERO_HALF_W;
    if (!(clearanceToOpenLine > 1)) {
      post.push(`${c.id}: only ${r2(clearanceToOpenLine)} m from the open lane's driving line — the shadow would clip it`);
    }
  }
  const taperCones = CONES.filter((c) => c.id.includes("-cone-taper-"));
  if (taperCones.length !== TAPER_CONES) post.push("the taper must carry its full cone count");
  if (taperCones[0].y !== taperFromY || taperCones[taperCones.length - 1].y !== taperToY) {
    post.push("the taper cones must span exactly taperFromY..taperToY");
  }
  // The taper actually CLOSES lane 0: it starts at the curb side of the closed
  // lane and ends on its inner edge, so a car holding the closed lane's line
  // must meet a cone.
  if (!(taperCones[0].x > laneClosedX + HERO_HALF_W)) post.push("the taper must begin curb-side of the closed lane's driving line");
  if (taperCones[taperCones.length - 1].x !== CONE_LINE_X) post.push("the taper must end on the boundary line");
  if (!(CONE_LINE_X > 0 && CONE_LINE_X < laneClosedX)) post.push("the boundary line must live inside the closed lane");
  const worksCones = CONES.filter((c) => c.id.includes("-cone-works-"));
  if (worksCones.length !== WORKS_CONES) post.push("the site must carry its full cone count");
  for (const c of worksCones) {
    if (!(c.y > worksFromY && c.y < worksToY)) post.push(`${c.id}: the site's cones must live inside the works segment`);
  }
  // Spawns on their declared edge, on the authored lane centers.
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > endY ? y - endY : 0);
  const edgeSpanOf = { [APPROACH_EDGE]: [0, worksFromY], [WORKS_EDGE]: [worksFromY, worksToY], [EXIT_EDGE]: [worksToY, endY] };
  for (const s of SPAWN_POINTS) {
    const span = edgeSpanOf[s.edgeId];
    if (span === undefined) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    else if (!(s.y >= span[0] && s.y <= span[1])) post.push(`${s.id}: y=${s.y} is not on its declared edge ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
    if (s.heading !== 0) post.push(`${s.id}: every spawn faces the one-way flow (heading 0)`);
  }
  if (SPAWN_POINTS[0].x !== laneClosedX) post.push(`${SPAWN_POINTS[0].id}: the drill starts in the CLOSED lane`);
  for (const s of [SPAWN_POINTS[1], SPAWN_POINTS[2]]) {
    if (s.x !== laneOpenX) post.push(`${s.id}: must sit on the open-lane center`);
  }
  if (!(SPAWN_POINTS[2].y > worksToY)) post.push(`${SPAWN_POINTS[2].id}: the finish must sit past the works`);
  // Buildings clear of the carriageway + sidewalk.
  for (const b of BUILDINGS) {
    for (const [x, y] of b.footprint) {
      if (Math.abs(x) < halfRoadM + 6) post.push(`${b.id}: footprint too close to the carriageway`);
      if (!(y > 0 && y < endY)) post.push(`${b.id}: footprint outside the street's span`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_hz_roadworks self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (the sc-merge-roadworks-shift map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "hz-roadworks-v1",
    label: "Учебна улица — ремонт в дясната лента (сценарий OV-16)",
    idPrefix: "hzr",
    approachM: 240,
    worksM: 36,
    exitM: 34,
    taperM: 24,
    maxspeedKmh: 50,
    worksKmh: 30,
    spawnY: 12,
    noteBg:
      "Дясната лента е затворена за ремонт: конусите я стесняват от 216-ия метър и я затварят на 240-ия. Временната сигнализация е закон — намали до 30, влей се навреме в лявата лента и дръж новата траектория през целия участък.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildRoadworksStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  const worstThroughSec =
    (sc.worksFromY - AUTHORED_EARLIEST_FLIP_Y) / (AUTHORED_MERGE_KMH / 3.6) +
    (sc.worksToY - sc.worksFromY) / (AUTHORED_WORKS_KMH / 3.6) +
    (AUTHORED_FINISH_Y - sc.worksToY) / (AUTHORED_EXIT_KMH / 3.6);
  console.log(`=== hz-roadworks build: ${params.districtId} ===`);
  line("street / limit", `${sc.endY} m one-way, ${sc.lanesPerDirection} lanes @ ${params.maxspeedKmh} km/h`);
  line("works segment", `y ∈ [${sc.worksFromY}, ${sc.worksToY}] @ ${params.worksKmh} km/h (its own edge)`);
  line("cone taper", `y ∈ [${sc.taperFromY}, ${sc.taperToY}] — lane 0 closes over ${params.taperM} m`);
  line("lane centers", `closed x=${sc.laneClosedX} (laneId 0), open x=${sc.laneOpenX} (laneId 1)`);
  const taperCount = sc.cones.filter((c) => c.id.includes("-cone-taper-")).length;
  line("cones", `${sc.cones.length} (${taperCount} taper + ${sc.cones.length - taperCount} boundary), half ${CONE_HALF_M} m`);
  line("keep-right budget", `${r2(worstThroughSec)} s at the authored paces (< ${KEEP_RIGHT_SUSTAIN_SEC} s)`);
  line("joint grace", `${r2((sc.worksFromY - AUTHORED_LATEST_FLIP_Y) / (AUTHORED_MERGE_KMH / 3.6))} s from the latest flip to the works joint (> ${LANE_CHANGE_JOINT_GRACE_SEC} s)`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
