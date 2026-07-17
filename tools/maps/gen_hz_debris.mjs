/**
 * gen_hz_debris.mjs — the DEBRIS-IN-LANE micro-map (Scenario Studio doc 76 §3;
 * doc 72 §10 archetype PE-04/OV-18 territory, but the graded claim is чл. 20's
 * „намали и спри", not an avoidance line) → content/world/<districtId>.json
 * (+ byte-identical publish to platform/public/world/).
 *
 * The structural parent is gen_hazard_obstacle.mjs (one straight parametric
 * street whose obstacle is RECORDER data, never map data). The single delta —
 * and the whole reason this map exists instead of reusing hz-obstacle-v1 — is
 * that the carriageway is ONE-WAY with TWO lanes in the SAME direction:
 * sc-hz-brake-dont-swerve teaches „спри в лентата, не свивай на сляпо", and
 * that lesson is meaningless without a neighbouring lane that is (a) occupied
 * by an escort car and (b) reachable by a real, GRADABLE laneId delta.
 * hz-obstacle-v1 is a two-way 1+1: its „swerve" can only ever be a lane-keep
 * excursion (POOR_LANE_KEEPING), never the lane change the лекция is about.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     hzd-n-end (0, 300)
 *         │
 *         │   lane 1 (escort)  center x = -4.06   ← the neighbour car lives here
 *         │   lane 0 (player)  center x = +4.06   ← yours; the debris lands here
 *         │
 *     …debrisY = 190   ← the debris rect (recorder data — see below)
 *     …revealY = 160   ← 30 m out: the reveal (the rect's trigger arms here)
 *         │
 *     hzd-spawn-approach (4.06, 15)
 *         │
 *     hzd-n-start (0, 0)
 *
 * WHAT IS *NOT* ON THIS MAP, and why each absence is load-bearing (the
 * hz-obstacle-v1 precedent — the battery hz-debris-districts.test.ts pins all
 * of them, because each silently changes the drill if it ever appears):
 *   - NO crossings ⇒ the CrossingZoneTracker builds its zones from district
 *     crossings[] alone, so no PEDESTRIAN_* code can fire and the drill cannot
 *     quietly become a zebra lesson;
 *   - NO intersections / stop lines / signals ⇒ nextJunctionM and nextStopLineM
 *     stay undefined, which (together with the escort sitting a full lane pitch
 *     outside the 4 m lead corridor) is exactly why the template must disarm
 *     HARSH_BRAKING_NO_CAUSE — see the templates-hazards2.ts header;
 *   - ONE edge ⇒ no segment joint exists that could drop the swerve's laneId
 *     delta inside laneChangeJointGraceSec (the gen_ln_merge law): the §9
 *     lane-change asserts have teeth;
 *   - ONE-WAY ⇒ CROSSED_SOLID_LINE and CENTER_LINE_TOUCHED are STRUCTURALLY
 *     disarmed (rules/engine.ts guards both on `tick.oneway === false`), so the
 *     leftward swerve grades as the lane change it is, and nothing else.
 *
 * The debris itself is NOT map data: it is a recorder ObstacleRect2D with a
 * `trigger` (traces/scHzBrakeDontSwerve.ts) — the VU-04 door-swing seam, which
 * is what makes the object APPEAR at the reveal instead of having been visible
 * from the spawn. Same ruling as gen_hazard_obstacle's stalled car and
 * gen_ln_merge's taper: the map hosts the street, the ScenarioSpec stages the
 * story. (Honest gap, flagged: there is no debris GLB and no „падащ товар"
 * world zone — the object grades correctly, it does not yet render as itself.)
 *
 * KEEP-RIGHT HONESTY (the gen_ln_merge law, inherited): on a 2-lane one-way
 * with no span, rules/engine.ts computes rightmostRequiredLane = 0, so ANY run
 * an authored drive spends in lane 1 is a keep-right episode — the engine cannot
 * know the curb lane is blocked (no lane-closure zone exists). The SHADOW is
 * immune by construction: it never leaves lane 0, because stopping in your own
 * lane IS the lesson. Only the blind-swerve demo enters lane 1, and its budget
 * is asserted below at BUILD time so a param change that would add a stray
 * NOT_KEEPING_RIGHT to its exact codeRefs fails the generator, not the demo.
 *
 * LAW NOTES (verified against content/questions, see rules/catalog.ts):
 *   - опасност на платното: намали скоростта и спри — ЗДвП чл. 20 (q-eco-062);
 *   - дистанция и съобразена скорост — ЗДвП чл. 23 (q-magistrali-i-izvangradsko-032);
 *   - маневра само след като се убедиш, че е безопасна, и със сигнал —
 *     ЗДвП чл. 25 (q-nosht-020 frames the night variant of the same reflex).
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_hz_debris.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/hz-debris-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's own — contracts.ts / rules/types.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Rule-engine defaults the authored drives are sized against (rules/types.ts
 *  DEFAULT_RULE_CONFIG), mirrored so a drift there fails THIS build. */
const KEEP_RIGHT_SUSTAIN_SEC = 12;
const LANE_KEEP_MAX_OFFSET_M = 1.3 * 2.5;
/** Safety margin on the keep-right budget (the gen_ln_merge ratio). */
const KEEP_RIGHT_BUDGET_RATIO = 0.75;

/**
 * The live car's full-pedal deceleration, m/s² — BRAKE_FORCE_N / CHASSIS_MASS
 * = 11000 / 1220 (vehicle/tuning.ts). The ghost of traces/scHzBrakeDontSwerve
 * is authored to this same rate (0.7 × 12.9 ≈ 9.03 — the recorder's envelope
 * tracks 0.7 × the step's decel cap), so „does the stop FIT" is one number for
 * both the student and the demo.
 */
const FULL_BRAKE_DECEL_MPS2 = 9.03;
/** Hero half-length, m (vehicle/tuning.ts CHASSIS_HALF_EXTENTS.z). */
const HERO_HALF_LENGTH_M = 2.02;
/** The authored drives of traces/scHzBrakeDontSwerve.ts, km/h. */
const AUTHORED_CRUISE_KMH = 50; // the approach — the posted limit exactly
/** The slowest speed any authored drive holds while changing lane, km/h. */
const AUTHORED_PASS_KMH = 20;
/**
 * The LONGEST arc any authored drive spends in laneId 1, m. The SHADOW never
 * leaves lane 0 at all (it stops in its own lane and stays — that IS the
 * lesson), so the only lane-1 exposure in the whole template is the blind-swerve
 * demo's excursion: the laneId flips at ≈ revealY + 12 and the drive is over
 * ~24 m later, stopped, wrecked. Budgeted generously at 40 m below.
 */
const AUTHORED_LANE1_RUN_M = 40;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (one straight one-way 2-lane street; the debris is trace data)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix (e.g. "hzd")
 *   lengthM: number,      // street length (260..360)
 *   maxspeedKmh: number,  // posted urban limit (30..60)
 *   spawnY: number,       // player spawn, m of arc (8..30)
 *   revealY: number,      // the debris reveal (obstacle trigger), m of arc
 *   debrisY: number,      // the debris rect's center, m of arc
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildDebrisStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, spawnY, revealY, debrisY, noteBg } =
    params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 260 && lengthM <= 360)) errors.push(`lengthM must be within 260..360 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 60)) errors.push(`maxspeedKmh must be within 30..60, got ${maxspeedKmh}`);
  if (!(spawnY >= 8 && spawnY <= 30)) errors.push(`spawnY must be within 8..30 m, got ${spawnY}`);
  if (errors.length > 0) throw new Error(`gen_hz_debris params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2; // the archetype IS a 2-lane one-way; only this shape is asserted
  const halfRoadM = r2((lanes * SCALED_LANE_W) / 2); // 8.13
  // Locator one-way lane math (runtime/locator.ts computeLane): lane j center
  // sits at x = lanes·W/2 − (j + 0.5)·W east of the centerline.
  const lanePlayerX = r2(SCALED_LANE_W / 2); // 4.06 — laneId 0 (curb lane; yours)
  const laneEscortX = r2(-SCALED_LANE_W / 2); // -4.06 — laneId 1 (the escort's)

  const endY = lengthM;

  // -- Nodes / edge. ONE edge on purpose: the swerve is an intra-edge laneId
  // delta, and no joint exists that could drop it under the joint grace.
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [0, endY],
  };
  const geometry = [
    [0, 0],
    [0, endY],
  ];
  const EDGES = [
    {
      id: `${idPrefix}-e-street`,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      class: "primary",
      name: `${label} — платно`,
      oneway: true,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const CROSSINGS = []; // NOTHING may excuse a stop here, and no zebra duty exists
  const ROUNDABOUTS = [];

  // -- Spawns: the drill's start (player lane), the escort's reference lane and
  // the finish the ScenarioSpec pins by value.
  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-approach`,
      x: lanePlayerX,
      y: spawnY,
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Начало — в дясната лента",
    },
    {
      id: `${idPrefix}-spawn-escort`,
      x: laneEscortX,
      y: spawnY,
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Контролна точка — съседната (лява) лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: lanePlayerX,
      y: r2(endY - 15),
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- Two blocks, one per side (visual anchors + the „градска улица" frame),
  // clear of the carriageway + a ~6 m sidewalk on either side.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-west`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 26)), r2(revealY - 40)],
        [r2(-(halfRoadM + 8)), r2(revealY - 40)],
        [r2(-(halfRoadM + 8)), r2(revealY - 8)],
        [r2(-(halfRoadM + 26)), r2(revealY - 8)],
      ],
    },
    {
      id: `${idPrefix}-b-east`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(halfRoadM + 8), r2(debrisY - 14)],
        [r2(halfRoadM + 24), r2(debrisY - 14)],
        [r2(halfRoadM + 24), r2(debrisY + 18)],
        [r2(halfRoadM + 8), r2(debrisY + 18)],
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
   * Scenario Studio payload (doc 76): the archetype recipe + the lane truth.
   * The ScenarioSpec and the trace script pin these BY VALUE; the contract
   * battery asserts every copy against this file (the L7 pattern).
   */
  const scenario = {
    archetype: "straight-street",
    params: { lengthM, maxspeedKmh },
    lanesPerDirection: lanes,
    lanePlayerX,
    laneEscortX,
    // The story's arclengths, in DISTRICT y (the street runs on x = 0). The
    // debris is RECORDER data — these are the authored reference values the
    // trace script and the battery share, not world objects.
    revealY,
    debrisY,
    endY,
    streetEdgeId: `${idPrefix}-e-street`,
    spawnY,
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_hz_debris.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна еднопосочна улица с две ленти и препятствие на платното — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
  // Self-validation (the gen_hazard_obstacle invariants + this drill's laws)
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
  }
  // THE ARCHETYPE'S SHAPE — every clause is a grading claim (see the header).
  if (EDGES.length !== 1) post.push("the swerve must be an INTRA-edge laneId delta: author exactly one edge");
  if (!EDGES[0].oneway) {
    post.push(`${EDGES[0].id}: the archetype is a ONE-WAY street — a two-way bank would arm CENTER_LINE_TOUCHED/CROSSED_SOLID_LINE and the swerve would stop grading as a lane change`);
  }
  if (EDGES[0].lanes !== lanes) post.push(`${EDGES[0].id}: the archetype is a 2-lane one-way carriageway (the escort needs a lane)`);
  if (INTERSECTIONS.length !== 0) post.push("the drill must carry ZERO intersections (no stop line, no junction in the harsh-brake cause ledger)");
  if (CROSSINGS.length !== 0) post.push("the drill must carry ZERO crossings (no PEDESTRIAN_* code may ever fire here)");
  // Lane-center math (the Locator's one-way bank).
  if (lanePlayerX !== r2(SCALED_LANE_W / 2)) post.push("player-lane center must sit half a lane east of the centerline");
  if (laneEscortX !== r2(-SCALED_LANE_W / 2)) post.push("escort-lane center must sit half a lane west of the centerline");
  if (Math.abs(lanePlayerX - laneEscortX - SCALED_LANE_W) > 0.02) {
    post.push("the two lane centers must be exactly one lane pitch apart");
  }
  // The story's arclengths.
  if (!(spawnY < revealY && revealY < debrisY && debrisY < endY)) {
    post.push(`story order broken: spawn ${spawnY} < reveal ${revealY} < debris ${debrisY} < end ${endY}`);
  }
  // THE DRILL'S CENTRAL LAW — the stop must FIT, and only just:
  //  1. a driver who reacts AT the reveal must stop short of the debris with
  //     real margin (else the lesson orders the impossible);
  const revealToDebrisM = debrisY - revealY;
  const fullStopM = (AUTHORED_CRUISE_KMH / 3.6) ** 2 / (2 * FULL_BRAKE_DECEL_MPS2);
  const marginM = revealToDebrisM - fullStopM - HERO_HALF_LENGTH_M;
  if (!(marginM > 8)) {
    post.push(
      `only ${r2(marginM)} m of margin: a full-force stop from ${AUTHORED_CRUISE_KMH} km/h needs ${r2(fullStopM)} m and the reveal is ${r2(revealToDebrisM)} m out — the drill would order an impossible stop`,
    );
  }
  //  2. …and it must NOT be so generous that a lifted-off coast also works —
  //     the drill is „натисни ДОКРАЙ", so a comfortable C1 stop (the recorder's
  //     default 0.7 × 4.6 = 3.22 m/s²) must NOT fit inside the same window.
  //     This is what makes the reveal distance a LESSON instead of a number.
  const comfyStopM = (AUTHORED_CRUISE_KMH / 3.6) ** 2 / (2 * 0.7 * 4.6);
  if (!(comfyStopM > revealToDebrisM - HERO_HALF_LENGTH_M)) {
    post.push(
      `a COMFORTABLE ${r2(comfyStopM)} m stop already fits the ${r2(revealToDebrisM)} m reveal window — the drill stops teaching the full-force pedal: move revealY closer to debrisY`,
    );
  }
  //  3. THE KEEP-RIGHT LAW (see the header): on a span-less 2-lane one-way,
  //     rules/engine.ts computes rightmostRequiredLane = 0, so ANY run in
  //     laneId 1 is a keep-right episode — the engine cannot know the curb lane
  //     is blocked (no lane-closure zone exists). The SHADOW is immune by
  //     design: it never leaves lane 0. Only the blind-swerve demo enters lane
  //     1, and its excursion must stay under keepRightSustainSec so its codeRefs
  //     stay EXACTLY the two the card claims — a stray NOT_KEEPING_RIGHT would
  //     blame the wrong thing entirely (the demo's fault is the missing mirror,
  //     not lane discipline). Asserted here so a param change fails the BUILD.
  const worstLane1Sec = AUTHORED_LANE1_RUN_M / (AUTHORED_PASS_KMH / 3.6);
  if (worstLane1Sec >= KEEP_RIGHT_SUSTAIN_SEC * KEEP_RIGHT_BUDGET_RATIO) {
    post.push(
      `the authored lane-1 run of ${AUTHORED_LANE1_RUN_M} m takes ${r2(worstLane1Sec)} s at ${AUTHORED_PASS_KMH} km/h — NOT_KEEPING_RIGHT fires at ${KEEP_RIGHT_SUSTAIN_SEC} s: shorten the authored excursion`,
    );
  }
  //  3b. …and the street must still contain that excursion past the debris.
  if (!(endY - debrisY > AUTHORED_LANE1_RUN_M)) {
    post.push(
      `only ${r2(endY - debrisY)} m remain past the debris — the authored lane-1 excursion needs ${AUTHORED_LANE1_RUN_M} m: lengthen lengthM`,
    );
  }
  //  4. the swerve must be gradable as a LANE CHANGE: the adjudicator ignores
  //     deltas under laneChangeMinSpeedKmh (10), and the authored pace must not
  //     itself grade as speeding.
  if (!(AUTHORED_CRUISE_KMH <= maxspeedKmh)) post.push("the authored cruise must not exceed the posted limit");
  if (!(AUTHORED_PASS_KMH > 15)) post.push("the authored pass must stay well over laneChangeMinSpeedKmh (10)");
  //  5. a lane change is not a swerve-in-place: the off-centre window any
  //     authored lateral opens must stay under laneKeepSustainSec (3 s), or the
  //     shadow's own pass-around would grade POOR_LANE_KEEPING.
  const offCentreLateralM = 2 * (0.5 * SCALED_LANE_W - LANE_KEEP_MAX_OFFSET_M);
  const minLateralRunM = 24; // the shortest authored lane-change arc
  const offCentreSec =
    (minLateralRunM * (offCentreLateralM / SCALED_LANE_W)) / (AUTHORED_PASS_KMH / 3.6);
  if (!(offCentreSec < 3)) {
    post.push(`the authored lane change sits off-centre for ${r2(offCentreSec)} s — POOR_LANE_KEEPING fires at 3 s`);
  }
  // Spawns on their declared edge, on the authored lane centers, facing the flow.
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > endY ? y - endY : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== `${idPrefix}-e-street`) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
    if (s.heading !== 0) post.push(`${s.id}: every spawn faces the one-way flow (heading 0)`);
  }
  if (SPAWN_POINTS[0].x !== lanePlayerX) post.push(`${SPAWN_POINTS[0].id}: the drill starts in the PLAYER's (curb) lane`);
  if (SPAWN_POINTS[1].x !== laneEscortX) post.push(`${SPAWN_POINTS[1].id}: must sit on the escort-lane center`);
  if (!(SPAWN_POINTS[2].y > debrisY)) post.push(`${SPAWN_POINTS[2].id}: the finish must sit past the debris`);
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
    throw new Error(`gen_hz_debris self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (the sc-hz-brake-dont-swerve map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "hz-debris-v1",
    label: "Учебна улица — препятствие в лентата и кола отляво (сценарий „Спри, не свивай“)",
    idPrefix: "hzd",
    lengthM: 300,
    maxspeedKmh: 50,
    spawnY: 15,
    revealY: 160,
    debrisY: 190,
    noteBg:
      "Две ленти в една посока. В дясната лента пада препятствие, а вляво до теб се движи кола: спирачка ДОКРАЙ в своята лента, а не сляп волан встрани.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildDebrisStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  const fullStopM = (50 / 3.6) ** 2 / (2 * FULL_BRAKE_DECEL_MPS2);
  console.log(`=== hz-debris build: ${params.districtId} ===`);
  line("street / limit", `${params.lengthM} m one-way, ${sc.lanesPerDirection} lanes @ ${params.maxspeedKmh} km/h`);
  line("lane centers", `player x=${sc.lanePlayerX} (laneId 0), escort x=${sc.laneEscortX} (laneId 1)`);
  line("reveal → debris", `y ${sc.revealY} → ${sc.debrisY} (${r2(sc.debrisY - sc.revealY)} m window)`);
  line("full-force stop needs", `${r2(fullStopM)} m from 50 km/h — margin ${r2(sc.debrisY - sc.revealY - fullStopM - HERO_HALF_LENGTH_M)} m`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
