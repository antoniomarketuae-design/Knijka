/**
 * gen_wide_boulevard.mjs — the WIDE-BOULEVARD U-turn micro-map (Scenario Studio,
 * doc 76 §3; doc 72 §10 OV-17 „Обратен завой" / §12 PK-12 „Обръщане") →
 * content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A plain straight two-way boulevard with TWO marked lanes per direction
 * (lanes = 4) — wide enough that «обръщане в едно движение» reverses direction
 * in ONE smooth forward arc, no reverse shunts (the contrast to the narrow
 * street's three-point turn on ov-narrow-v1). The carriageway is 4 × 8.125 m =
 * 32.5 m (half-width 16.25 m); the runtime's procedural lane banks put the
 * OUTER (curb) lane centre at x = ±12.19 and the INNER lane centre at x = ±4.06
 * on each side of the x = 0 centreline (locator: laneId 0 = outermost). NOTHING
 * else is on the map (no crossing, junction, signal or sign), so the ONLY
 * things the scenario director grades are the turn itself and any contact with
 * a CURB (staged obstacle rects in the ScenarioSpec, the sc-maneuver-3point
 * pattern).
 *
 * Layout (x = east, y = north; the boulevard runs south → north on x = 0):
 *
 *     wb-n-end (0, L)                    L = lengthM
 *         │
 *         │   2 lanes per direction; outer-lane centre x = 12.19,
 *         │   inner-lane centre x = 4.06 (northbound) / mirror (southbound).
 *         │   The обръщане corridor is mid-block on x = 0.
 *         │
 *     wb-spawn-approach (12.19, 15)
 *         │
 *     wb-n-start (0, 0)
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_wide_boulevard.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/wb-district.test.ts
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
 *   districtId: string,   // output file name + map.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // boulevard length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the boulevard (30..90)
 * }} params
 */
export function buildWideBoulevard(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_wide_boulevard params invalid:\n  - ${errors.join("\n  - ")}`);

  const LANES = 4; // 2 per direction — the boulevard standard
  const lanesPerDir = LANES / 2;
  const halfRoadM = r2(lanesPerDir * SCALED_LANE_W); // 16.25 m
  // Procedural lane-bank centres (mirror runtime/locator.computeLane): the
  // OUTER (curb) lane centre and the INNER (centreline) lane centre.
  const laneCenterOuterM = r2((lanesPerDir - 1 + 0.5) * SCALED_LANE_W); // 12.19
  const laneCenterInnerM = r2(0.5 * SCALED_LANE_W); // 4.06

  const NODES = {
    "wb-n-start": [0, 0],
    "wb-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "wb-e-street",
      from: "wb-n-start",
      to: "wb-n-end",
      class: "residential",
      name: "Широк булевард с две ленти в посока",
      oneway: false,
      roundabout: false,
      lanes: LANES,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "wb-spawn-approach",
      x: laneCenterOuterM,
      y: 15,
      heading: 0,
      edgeId: "wb-e-street",
      name: "Начало на отсечката — дясна лента",
    },
    {
      id: "wb-spawn-finish",
      x: r2(-laneCenterOuterM),
      y: 40,
      heading: 180,
      edgeId: "wb-e-street",
      name: "Контролна точка — обратна посока",
    },
  ];

  const BUILDINGS = [
    {
      id: "wb-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), 130],
        [r2(-(halfRoadM + 8)), 130],
        [r2(-(halfRoadM + 8)), 158],
        [r2(-(halfRoadM + 20)), 158],
      ],
    },
  ];

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  bounds.minX = Math.min(bounds.minX, -halfRoadM - 6);
  bounds.maxX = Math.max(bounds.maxX, halfRoadM + 6);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_wide_boulevard.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен широк булевард за обръщане в едно движение — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Широк булевард: достатъчно място за обръщане в едно движение, без връщане назад.",
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
        // MapArchetype vocabulary: a (wide) straight two-way street.
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh, lanes: LANES },
        lanesPerDirection: lanesPerDir,
        laneCenterOuterM,
        laneCenterInnerM,
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

  // Self-validation (mirrors gen_narrow_street invariants; lanes = 4 here).
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
    if (e.lanes !== 4 || e.oneway) post.push(`${e.id}: the archetype is a two-way 2+2 boulevard (lanes 4)`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "wb-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterOuterM <= 0 || laneCenterOuterM >= halfRoadM) post.push(`outer-lane centre ${laneCenterOuterM} outside the bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_wide_boulevard self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the OV-17/PK-12 wide-boulevard U-turn micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "wb-boulevard-v1",
    label: "Учебен широк булевард — обръщане в едно движение (сценарий OV-17/PK-12)",
    lengthM: 200,
    maxspeedKmh: 40,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildWideBoulevard(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  console.log(`=== wide-boulevard build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("outer / inner lane", `${district.meta.scenario.laneCenterOuterM} / ${district.meta.scenario.laneCenterInnerM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
