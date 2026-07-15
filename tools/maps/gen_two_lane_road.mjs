/**
 * gen_two_lane_road.mjs — parametric TWO-LANES-PER-DIRECTION road archetype
 * (Scenario Studio, doc 76 §3) → content/world/<districtId>.json
 *
 * The lanes-family micro-map: ONE straight road with two marked lanes per
 * travel direction (edge lanes = 4, two-way), in the exact district-v1
 * format buildWorldGeometry (world), parseDistrict/createWorldRuntime
 * (runtime — the Locator's lane bank yields laneId 0/1 + laneCount 2 for
 * lane-change grading) and buildLaneGraph/createTrafficSystem (traffic)
 * already consume — the gen_parking_lot.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/ln-district.test.ts.
 *
 * Layout (x = east, y = north; the road runs south → north on x = 0; drawn
 * lane = 8.125 m at the perceptual road scale, so the northbound bank is):
 *
 *     ln-n-end (0, L)
 *         │
 *         │   lane 1 (left)  center x =  4.06   ← the lane-change target
 *         │   lane 0 (right) center x = 12.19   ← spawn / cruise lane
 *         │
 *     ln-n-start (0, 0)
 *
 * No signals, no crossings, no junctions — the road teaches mirror → signal
 * → smooth lane change, nothing else (doc 76 §3). Staged traffic is LESSON
 * data (StagedEventSpec in the ScenarioSpec); the map only hosts the lanes.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_two_lane_road.mjs
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

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // road length (200..1000)
 *   maxspeedKmh: number,  // legal limit (40..90)
 * }} params
 */
export function buildTwoLaneRoadDistrict(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 40 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 40..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_two_lane_road params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): two-way, lanes 4 → lanesPerDir 2;
  // northbound right lane (laneId 0) centers 1.5 lanes east of the
  // centerline, the left lane (laneId 1) 0.5 lanes east.
  const laneRightM = r2(1.5 * SCALED_LANE_W);
  const laneLeftM = r2(0.5 * SCALED_LANE_W);
  const halfRoadM = 2 * SCALED_LANE_W;

  const NODES = {
    "ln-n-start": [0, 0],
    "ln-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "ln-e-road",
      from: "ln-n-start",
      to: "ln-n-end",
      class: "tertiary",
      name: "Булевард с две ленти в посока",
      oneway: false,
      roundabout: false,
      lanes: 4,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = []; // degree-2 road — none by the OSM-build convention
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- Spawns: right-lane start (the cruise lane) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "ln-spawn-start",
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId: "ln-e-road",
      name: "Начало — дясна лента",
    },
    {
      id: "ln-spawn-finish",
      x: laneLeftM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "ln-e-road",
      name: "Контролна точка — лява лента",
    },
  ];

  // -- One office block west of the road (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: "ln-b-office",
      height: 7,
      heightSource: "default",
      footprint: [
        [-(halfRoadM + 20), 120],
        [-(halfRoadM + 8), 120],
        [-(halfRoadM + 8), 138],
        [-(halfRoadM + 20), 138],
      ].map(([x, y]) => [r2(x), r2(y)]),
    },
  ];

  // -- Bounds + stats.
  const bounds = {
    minX: r2(-(halfRoadM + 26)),
    minY: -6,
    maxX: r2(halfRoadM + 6),
    maxY: r2(lengthM + 6),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_two_lane_road.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебен булевард с две ленти в посока — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права отсечка: движение в дясната лента; лявата е за престрояване след огледало и мигач.",
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
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the lane
       * truth. ScenarioSpecs pin lane centers by value and the contract
       * battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh },
        lanesPerDirection: 2,
        laneCenterRightM: laneRightM,
        laneCenterLeftM: laneLeftM,
      },
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
  // Self-validation (the invariants tools/osm/build.mjs + gen_poligon enforce)
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
    if (e.lanes !== 4 || e.oneway) post.push(`${e.id}: the archetype is a two-way 2+2 road (lanes 4)`);
  }
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "ln-e-road") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // Both graded lane centers must lie inside the northbound bank.
  for (const [name, x] of [["right", laneRightM], ["left", laneLeftM]]) {
    if (!(x > 0 && x < halfRoadM)) post.push(`${name} lane center ${x} outside the northbound bank`);
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_two_lane_road self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// ln-v1 instance — the sc-lane-change product map (doc 76 §3): 400 m of
// 2+2 boulevard at the urban 50.
// ---------------------------------------------------------------------------

const LN_PARAMS = {
  districtId: "ln-v1",
  label: "Учебен булевард — смяна на лента (сценарий LC)",
  lengthM: 400,
  maxspeedKmh: 50,
};

const district = buildTwoLaneRoadDistrict(LN_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const OUT_FILE = path.join(REPO_ROOT, "content", "world", `${LN_PARAMS.districtId}.json`);
mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, out);

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== two-lane-road build: ${LN_PARAMS.districtId} ===`);
line("length / maxspeed", `${LN_PARAMS.lengthM} m / ${LN_PARAMS.maxspeedKmh} km/h`);
line("lane centers (R / L)", `${district.meta.scenario.laneCenterRightM} / ${district.meta.scenario.laneCenterLeftM} m east`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", OUT_FILE);
console.log("Validation OK.");
