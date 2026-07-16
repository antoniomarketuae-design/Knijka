/**
 * gen_ov_crossing.mjs — the OV-07 „изпреварване на пътека" micro-map (Scenario
 * Studio, doc 76 §3; doc 72 §10 archetype OV-07). ONE straight road with TWO
 * marked lanes per direction (edge lanes = 4, two-way) carrying a single MARKED
 * pedestrian crossing — the composite stage the OVERTAKING_AT_CROSSING detector
 * needs: a lead car to pass, two lanes to pass INTO, and an armed crossing zone
 * the pass lands inside (чл. 119). It fuses the gen_two_lane_road lane bank with
 * the gen_zebra_street crossing, in the exact district-v1 format the world,
 * runtime (the Locator's lane bank + the CrossingZoneTracker) and traffic
 * already consume.
 *
 * Layout (x = east, y = north; the road runs south → north on x = 0; drawn
 * lane = 8.125 m at the perceptual road scale):
 *
 *     ovc-n-end (0, L)
 *         │
 *         ═  ovc-x-1 (0, crossingY)   marked zebra (radius-35 zone arms on the edge)
 *         │
 *         │   lane 1 (left)  center x =  4.06   ← the overtake target lane
 *         │   lane 0 (right) center x = 12.19   ← spawn / cruise lane (lead paces here)
 *         │
 *     ovc-spawn-start (12.19, 15)
 *         │
 *     ovc-n-start (0, 0)
 *
 * No signals, no junctions — the road stages the crossing overtake, nothing
 * else. The lead car + the staged pedestrian presence are LESSON data
 * (StagedEventSpec in the ScenarioSpec); the map hosts the lanes + the crossing.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_crossing.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // road length (200..1000)
 *   crossingY: number,    // marked crossing position along the road (>= 90)
 *   maxspeedKmh: number,  // legal limit (40..90)
 * }} params
 */
export function buildOvCrossingDistrict(params) {
  const errors = [];
  const { districtId, label, lengthM, crossingY, maxspeedKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(crossingY >= 90 && crossingY <= lengthM - 60)) {
    errors.push(`crossingY must be within 90..${lengthM - 60} m, got ${crossingY}`);
  }
  if (!(maxspeedKmh >= 40 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 40..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_ov_crossing params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): two-way, lanes 4 → lanesPerDir 2;
  // northbound right lane (laneId 0) centers 1.5 lanes east, left (laneId 1) 0.5.
  const laneRightM = r2(1.5 * SCALED_LANE_W); // 12.19
  const laneLeftM = r2(0.5 * SCALED_LANE_W); // 4.06
  const halfRoadM = 2 * SCALED_LANE_W;

  const NODES = {
    "ovc-n-start": [0, 0],
    "ovc-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "ovc-e-road",
      from: "ovc-n-start",
      to: "ovc-n-end",
      class: "tertiary",
      name: "Булевард с пешеходна пътека",
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

  const INTERSECTIONS = [];
  const CROSSINGS = [
    { id: "ovc-x-1", x: 0, y: r2(crossingY), kind: "marked", signalized: false, edgeId: "ovc-e-road" },
  ];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "ovc-spawn-start",
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId: "ovc-e-road",
      name: "Начало — дясна лента",
    },
    {
      id: "ovc-spawn-finish",
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "ovc-e-road",
      name: "Контролна точка — след пътеката",
    },
  ];

  const BUILDINGS = [
    {
      id: "ovc-b-shop",
      height: 4.5,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), r2(crossingY - 40)],
        [r2(-(halfRoadM + 8)), r2(crossingY - 40)],
        [r2(-(halfRoadM + 8)), r2(crossingY - 28)],
        [r2(-(halfRoadM + 20)), r2(crossingY - 28)],
      ],
    },
  ];

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
      generator: "tools/maps/gen_ov_crossing.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен булевард с пешеходна пътека — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права отсечка с две ленти: пред пешеходна пътека не се изпреварва и не се заобикаля колата отпред.",
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
      scenario: {
        archetype: "zebra-block",
        params: { lengthM, crossingY, maxspeedKmh },
        lanesPerDirection: 2,
        laneCenterRightM: laneRightM,
        laneCenterLeftM: laneLeftM,
        primaryCrossingId: "ovc-x-1",
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
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

  // -- Self-validation.
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
    if (e.lanes !== 4 || e.oneway) post.push(`${e.id}: the archetype is a two-way 2+2 road (lanes 4)`);
  }
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "ovc-e-road") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "ovc-e-road") post.push(`${c.id}: crossing must host on the road edge`);
  }
  for (const [name, x] of [["right", laneRightM], ["left", laneLeftM]]) {
    if (!(x > 0 && x < halfRoadM)) post.push(`${name} lane center ${x} outside the northbound bank`);
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_crossing self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// ovc-v1 instance — the sc-ov-crossing-overtake product map (doc 76 §3):
// 320 m of 2+2 road with a marked crossing at y = 220 (an armed zone from ~185).
// ---------------------------------------------------------------------------

const OVC_PARAMS = {
  districtId: "ov-crossing-v1",
  label: "Учебен булевард — изпреварване на пешеходна пътека (сценарий OV-07)",
  lengthM: 320,
  crossingY: 220,
  maxspeedKmh: 50,
};

const district = buildOvCrossingDistrict(OVC_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${OVC_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${OVC_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== ov-crossing build: ${OVC_PARAMS.districtId} ===`);
line("length / maxspeed", `${OVC_PARAMS.lengthM} m / ${OVC_PARAMS.maxspeedKmh} km/h`);
line("lane centers (R / L)", `${district.meta.scenario.laneCenterRightM} / ${district.meta.scenario.laneCenterLeftM} m east`);
line("crossing", `ovc-x-1 @ y=${OVC_PARAMS.crossingY}`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
