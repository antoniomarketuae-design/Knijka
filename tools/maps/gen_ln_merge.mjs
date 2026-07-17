/**
 * gen_ln_merge.mjs — the LANE-DROP merge micro-map (Scenario Studio doc 76 §3;
 * doc 72 §10 archetype OV-16 „Цип-принцип / Zipper merge at a lane drop" +
 * OV-01/OV-02, the lane-change duties). The structural parent is
 * gen_ov_lanekeep.mjs (one straight parametric street, the same district-v1
 * shape buildWorldGeometry / createWorldRuntime / buildLaneGraph consume);
 * the delta is a ONE-WAY carriageway with TWO marked lanes and an authored
 * taper.
 *
 *   - ln-merge-v1 „Улица с край на дясната лента" (OV-16): a one-way 2-lane
 *     city street whose RIGHT (curb) lane tapers out over 60 m:
 *
 *        lnm-n-end (0, 280)
 *            │
 *            │   lane 1 (through)  center x = -4.06   ← the lane that survives
 *            │   lane 0 (ending)   center x = +4.06   ← yours; it dies at 240
 *            │
 *        …taperToY = 240  ← the ending lane is gone: you had to be left of the
 *            ╱               осева by here
 *        …taperFromY = 180 ← the taper begins (60 m of дясно стеснение)
 *            │
 *        lnm-n-start (0, 0)
 *
 * WHAT GRADES THIS, honestly (the brief's own design — no new engine code):
 *   - the merge is a laneId 0 → 1 delta WITHIN one edge, so the SHIPPED
 *     lane-change adjudication (indicator + mirror, rules/engine.ts §3) grades
 *     it. The street is a SINGLE edge on purpose: cross-edge deltas never
 *     grade (the C1 revision), and a lane delta inside laneChangeJointGraceSec
 *     of a joint is dropped — one edge means no joint can ever eat the grade;
 *   - „did you actually get out of the dying lane" is the OBJECTIVE GATE: a
 *     reachZone pinned on the through-lane center past the taper with a radius
 *     under the 8.125 m lane pitch, so it is unsatisfiable from lane 0.
 *
 * KNOWN CAPABILITY GAP (honest, flagged — doc 72 OV-16 already scores this
 * 🔴 NEW): the physical lane drop does not exist. There is no lane-drop world
 * zone, no taper wedge, no lane-arrow marking and no „стеснение" sign asset
 * (world/types.ts SignKind is a closed union of the shipped GLBs, and zone
 * kinds are a closed union the rule engine reads). So:
 *   - the taper is a DATA BOUNDARY (meta.scenario.taperFromY/taperToY) plus
 *     the scenario copy and the trace annotations — the gen_mw_entry М2
 *     precedent, where the acceleration lane's taper is likewise data, not
 *     paint. It GRADES correctly; it does not yet RENDER;
 *   - a driver who never merges rides lane 0 to the end and simply MISSES the
 *     objective. He is not physically stopped, and the zipper's alternation
 *     ledger (doc 72 OV-16's other 🔴 half) is not adjudicated at all.
 *
 * KEEP-RIGHT HONESTY — why this street is deliberately SHORT (280 m): on a
 * 2-lane one-way with no span, rules/engine.ts computes rightmostRequiredLane
 * = 0, so the correctly-merged driver sitting in lane 1 is a keep-right
 * candidate and would grade NOT_KEEPING_RIGHT after keepRightSustainSec (12 s)
 * — a false positive against a driver doing exactly what the lane drop
 * demands. The engine cannot know the curb lane is dying (that IS the missing
 * lane-drop zone). The map answers structurally: the whole post-taper run is
 * sized so the through lane can never be held for 12 s at any authored pace,
 * and the invariant is ASSERTED below, so a future param change that breaks it
 * fails the BUILD instead of the demo.
 *
 * LAW NOTES (verified against content/questions, see rules/catalog.ts):
 *   - маневра само след като водачът се убеди, че е безопасна, и със сигнал:
 *     ЗДвП чл. 25 — q-predimstvo-061, q-manevri-006/007/008;
 *   - движение във възможно най-дясната свободна лента: ЗДвП чл. 15.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ln_merge.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/merge-districts.test.ts
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
/** Metres of violation-free travel that earn CLEAN_DRIVING — the shadow demo
 *  must be able to reach it, so the street cannot be shorter than this. */
const CLEAN_DRIVING_DISTANCE_M = 250;
/** Safety margin on the keep-right budget: the worst-case authored run in the
 *  through lane must stay under this fraction of the sustain window. */
const KEEP_RIGHT_BUDGET_RATIO = 0.75;

/** The authored drives of traces/scMergeLaneEnd.ts, km/h. */
const AUTHORED_CRUISE_KMH = 45; // approach + post-merge cruise
const AUTHORED_EASE_KMH = 30; // shed in the ENDING lane to let the through car go by
const AUTHORED_MERGE_KMH = 35; // the slowest speed any authored merge is driven at
/** Lateral run of the authored merge (8.125 m of lateral over this arc), m. */
const AUTHORED_MERGE_RUN_M = 34;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (one straight one-way 2-lane street whose curb lane tapers out)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix (e.g. "lnm")
 *   lengthM: number,      // street length (180..320 — see the keep-right law)
 *   taperFromM: number,   // the taper begins here, m of arc (60..200)
 *   taperM: number,       // taper length, m ("~60 m" — 40..90)
 *   maxspeedKmh: number,  // posted urban limit (30..60)
 *   spawnY: number,       // player spawn, m of arc (8..30)
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildLaneDropStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, taperFromM, taperM, maxspeedKmh, spawnY, noteBg } =
    params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 260 && lengthM <= 320)) errors.push(`lengthM must be within 260..320 m, got ${lengthM}`);
  if (!(taperM >= 40 && taperM <= 90)) errors.push(`taperM must be within 40..90 m ("~60 m"), got ${taperM}`);
  if (!(taperFromM >= 60 && taperFromM <= 220)) errors.push(`taperFromM must be within 60..220 m, got ${taperFromM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 60)) errors.push(`maxspeedKmh must be within 30..60, got ${maxspeedKmh}`);
  if (!(spawnY >= 8 && spawnY <= 30)) errors.push(`spawnY must be within 8..30 m, got ${spawnY}`);
  if (errors.length > 0) throw new Error(`gen_ln_merge params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2; // the archetype IS 2 → 1; only this shape is asserted
  const halfRoadM = r2((lanes * SCALED_LANE_W) / 2); // 8.13
  // Locator one-way lane math (runtime/locator.ts computeLane): lane j center
  // sits at x = lanes·W/2 − (j + 0.5)·W east of the centerline.
  const laneEndingX = r2(SCALED_LANE_W / 2); // 4.06 — laneId 0 (curb lane; it dies)
  const laneThroughX = r2(-SCALED_LANE_W / 2); // -4.06 — laneId 1 (the survivor)

  const taperFromY = taperFromM;
  const taperToY = taperFromM + taperM;
  const endY = lengthM;

  // -- Nodes / edge. ONE edge on purpose: the merge is an intra-edge laneId
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
  const CROSSINGS = []; // a pure merge street carries no crossing
  const ROUNDABOUTS = [];

  // -- Spawns: the ending lane (the drill's start), a through-lane checkpoint
  // and the finish reference the ScenarioSpec pins by value.
  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-ending-lane`,
      x: laneEndingX,
      y: spawnY,
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Начало — в дясната лента, която свършва",
    },
    {
      id: `${idPrefix}-spawn-through`,
      x: laneThroughX,
      y: r2(taperFromY - 20),
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Контролна точка — в оставащата лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneThroughX,
      y: r2(endY - 15),
      heading: 0,
      edgeId: `${idPrefix}-e-street`,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- Two blocks, one per side (visual anchors + the „улицата се стеснява"
  // frame), clear of the carriageway + a ~4 m sidewalk on either side.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-west`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 26)), r2(taperFromY - 40)],
        [r2(-(halfRoadM + 8)), r2(taperFromY - 40)],
        [r2(-(halfRoadM + 8)), r2(taperFromY - 8)],
        [r2(-(halfRoadM + 26)), r2(taperFromY - 8)],
      ],
    },
    {
      id: `${idPrefix}-b-east`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(halfRoadM + 8), r2(taperFromY + 6)],
        [r2(halfRoadM + 24), r2(taperFromY + 6)],
        [r2(halfRoadM + 24), r2(taperToY + 10)],
        [r2(halfRoadM + 8), r2(taperToY + 10)],
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
   * ScenarioSpecs and trace scripts pin these BY VALUE; the contract battery
   * asserts every copy against this file (the L7 pattern).
   */
  const scenario = {
    archetype: "merge-lane",
    params: { lengthM, taperFromM, taperM, maxspeedKmh, lanesBefore: lanes, lanesAfter: 1 },
    lanesPerDirection: lanes,
    laneEndingX,
    laneThroughX,
    // The story's arclengths, in DISTRICT y (the street runs on x = 0).
    taperFromY,
    taperToY,
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
      generator: "tools/maps/gen_ln_merge.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна еднопосочна улица с край на дясната лента — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
  // Self-validation (the gen_ov_lanekeep invariants + the lane-drop laws)
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
  // THE ARCHETYPE'S SHAPE: exactly ONE oneway 2-lane edge — see the header.
  if (EDGES.length !== 1) post.push("the merge must be an INTRA-edge laneId delta: author exactly one edge");
  if (!EDGES[0].oneway) post.push(`${EDGES[0].id}: the archetype is a ONE-WAY street (oneway: true)`);
  if (EDGES[0].lanes !== lanes) post.push(`${EDGES[0].id}: the archetype is a 2-lane one-way carriageway`);
  if (INTERSECTIONS.length !== 0) post.push("lane-drop must carry ZERO intersections (no stop line, no junction tracker)");
  if (CROSSINGS.length !== 0) post.push("lane-drop must carry ZERO crossings (nothing may excuse a stop here)");
  // Lane-center math (the Locator's one-way bank).
  if (laneEndingX !== r2(SCALED_LANE_W / 2)) post.push("ending-lane center must sit half a lane east of the centerline");
  if (laneThroughX !== r2(-SCALED_LANE_W / 2)) post.push("through-lane center must sit half a lane west of the centerline");
  if (Math.abs(laneEndingX - laneThroughX - SCALED_LANE_W) > 0.02) {
    post.push("the two lane centers must be exactly one lane pitch apart");
  }
  // The story's arclengths.
  if (!(spawnY < taperFromY && taperFromY < taperToY && taperToY < endY)) {
    post.push(`story order broken: spawn ${spawnY} < taperFrom ${taperFromY} < taperTo ${taperToY} < end ${endY}`);
  }
  if (taperToY - taperFromY !== taperM) post.push("taper span must be exactly taperM long");
  // Recorder-envelope honesty (traces/recorder.ts) — the authored drives must
  // be physically reachable on this geometry:
  //  1. the approach must fit move-off → cruise → the mirror/indicator ritual
  //     → the merge run, all COMPLETE before the ending lane is gone;
  const buildM = (AUTHORED_CRUISE_KMH / 3.6) ** 2 / (2 * RECORDER_ACCEL_MPS2);
  if (taperToY - spawnY < buildM + AUTHORED_MERGE_RUN_M + 30) {
    post.push(
      `the ending lane dies ${r2(taperToY - spawnY)} m after the spawn — no honest drill: build ${r2(buildM)} + merge run ${AUTHORED_MERGE_RUN_M} + 30 m of ritual needed`,
    );
  }
  //  2. THE KEEP-RIGHT LAW (see the header): the longest run an AUTHORED drive
  //     spends in laneId 1 is "merged at the taper start → end of the street"
  //     (every authored merge commits at or after taperFromY). On a span-less
  //     2-lane one-way that run IS a keep-right episode, so it must stay well
  //     under keepRightSustainSec at the authored post-merge cruise. This is
  //     what caps lengthM — NOT a style choice.
  const worstThroughRunM = endY - taperFromY;
  const worstThroughSec = worstThroughRunM / (AUTHORED_CRUISE_KMH / 3.6);
  if (worstThroughSec >= KEEP_RIGHT_SUSTAIN_SEC * KEEP_RIGHT_BUDGET_RATIO) {
    post.push(
      `the through-lane run of ${r2(worstThroughRunM)} m takes ${r2(worstThroughSec)} s at ${AUTHORED_CRUISE_KMH} km/h — NOT_KEEPING_RIGHT fires at ${KEEP_RIGHT_SUSTAIN_SEC} s: shorten lengthM or move taperFromM north`,
    );
  }
  //  2b. …and the street must still be LONG enough for the shadow to earn
  //     CLEAN_DRIVING, or its trace gate can never assert the §5 innocence
  //     commendation. Together with (2) this pins lengthM from both sides.
  if (endY - spawnY < CLEAN_DRIVING_DISTANCE_M + 5) {
    post.push(
      `only ${r2(endY - spawnY)} m are drivable — the shadow cannot reach the ${CLEAN_DRIVING_DISTANCE_M} m CLEAN_DRIVING streak: lengthen lengthM`,
    );
  }
  //  3. the лента-change must be gradable: the adjudicator ignores deltas
  //     under laneChangeMinSpeedKmh (10), so the authored cruise must clear it
  //     with room, and nothing about the authored pace may grade as speeding.
  if (!(AUTHORED_CRUISE_KMH < maxspeedKmh)) post.push("the authored cruise must stay under the posted limit");
  if (!(AUTHORED_EASE_KMH > 15)) post.push("the authored ease must stay well over laneChangeMinSpeedKmh (10)");
  //  4. the merge's lateral rate must be a lane change, not a swerve: the
  //     off-centre window it opens must stay under laneKeepSustainSec (3 s).
  const offCentreLateralM = 2 * (0.5 * SCALED_LANE_W - LANE_KEEP_MAX_OFFSET_M);
  const offCentreSec =
    (AUTHORED_MERGE_RUN_M * (offCentreLateralM / SCALED_LANE_W)) / (AUTHORED_MERGE_KMH / 3.6);
  if (!(offCentreSec < 3)) {
    post.push(`the authored merge sits off-centre for ${r2(offCentreSec)} s — POOR_LANE_KEEPING fires at 3 s: shorten AUTHORED_MERGE_RUN_M`);
  }
  // Spawns on their declared edge, on the authored lane centers.
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > endY ? y - endY : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== `${idPrefix}-e-street`) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
    if (s.heading !== 0) post.push(`${s.id}: every spawn faces the one-way flow (heading 0)`);
  }
  if (SPAWN_POINTS[0].x !== laneEndingX) post.push(`${SPAWN_POINTS[0].id}: the drill starts in the ENDING lane`);
  for (const s of [SPAWN_POINTS[1], SPAWN_POINTS[2]]) {
    if (s.x !== laneThroughX) post.push(`${s.id}: must sit on the through-lane center`);
  }
  if (!(SPAWN_POINTS[2].y > taperToY)) post.push(`${SPAWN_POINTS[2].id}: the finish must sit past the taper`);
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
    throw new Error(`gen_ln_merge self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (OV-16 „Цип-принцип" — the sc-merge-lane-end map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ln-merge-v1",
    label: "Учебна улица — краят на дясната лента (сценарий OV-16)",
    idPrefix: "lnm",
    lengthM: 280,
    taperFromM: 180,
    taperM: 60,
    maxspeedKmh: 50,
    spawnY: 12,
    noteBg:
      "Дясната лента свършва след 180 метра. Твоята лента свършва — значи ти се съобразяваш: огледало, мигач и вливане в пролука, без да изтласкваш движещите се в лявата лента.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildLaneDropStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== ln-merge build: ${params.districtId} ===`);
  line("street / limit", `${params.lengthM} m one-way, ${sc.lanesPerDirection} lanes @ ${params.maxspeedKmh} km/h`);
  line("taper (data boundary)", `y ∈ [${sc.taperFromY}, ${sc.taperToY}] — the curb lane dies at ${sc.taperToY}`);
  line("lane centers", `ending x=${sc.laneEndingX} (laneId 0), through x=${sc.laneThroughX} (laneId 1)`);
  line("through-lane budget", `${r2(sc.endY - sc.taperFromY)} m ≈ ${r2((sc.endY - sc.taperFromY) / (AUTHORED_CRUISE_KMH / 3.6))} s at ${AUTHORED_CRUISE_KMH} km/h (< ${KEEP_RIGHT_SUSTAIN_SEC} s keep-right)`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
