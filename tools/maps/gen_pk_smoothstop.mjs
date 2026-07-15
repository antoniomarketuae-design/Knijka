/**
 * gen_pk_smoothstop.mjs — the PRECISION-STOP scenario micro-map (Scenario
 * Studio, doc 76 §3; doc 72 §11 archetype PK-14 „Плавно спиране на позиция") →
 * content/world/pk-stop-v1.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A plain straight two-way street (ONE marked lane per direction) — the
 * cleanest stage for a pure stopping-control drill: the driver must bring the
 * car to a SMOOTH, CONTROLLED stop precisely at a marked position just short of
 * a stopped obstruction ahead (a delivery van at the kerb-line, staged by the
 * trace recorder as an obstacle rect — no district prop needed). Nothing else
 * is on the map, so the ONLY things graded are the smoothness of the stop
 * (smoothStop maneuver objective) and, if the driver overruns, the contact with
 * the obstruction (COLLISION). Same straight-street shape as gen_fo_follow.mjs.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pk-n-end (0, L)                    L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06. A stopped van
 *         │   sits in this lane near y = STOP_MARK + gap; the driver eases to a
 *         │   smooth stop AT the mark, a few metres short of it.
 *         │
 *     pk-spawn-approach (4.06, 15)
 *         │
 *     pk-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions, no crossings. Ambient traffic is
 * authored to ZERO by every drive; the obstruction is a recorder obstacle rect,
 * not a lane actor — the ONLY grades are the stop's smoothness and any contact.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_smoothstop.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/pk-stop-district.test.ts
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
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 * }} params
 */
export function buildPkStopStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_pk_smoothstop params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W;
  const laneCenterM = r2(SCALED_LANE_W / 2);

  const NODES = {
    "pk-n-start": [0, 0],
    "pk-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "pk-e-street",
      from: "pk-n-start",
      to: "pk-n-end",
      class: "residential",
      name: "Права улица — плавно спиране на позиция",
      oneway: false,
      roundabout: false,
      lanes: 2,
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
      id: "pk-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pk-e-street",
      name: "Начало на отсечката",
    },
    {
      id: "pk-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "pk-e-street",
      name: "Контролна точка — край на отсечката",
    },
  ];

  const BUILDINGS = [
    {
      id: "pk-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), 80],
        [r2(-(halfRoadM + 8)), 80],
        [r2(-(halfRoadM + 8)), 98],
        [r2(-(halfRoadM + 20)), 98],
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
      generator: "tools/maps/gen_pk_smoothstop.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна права улица за плавно спиране на позиция — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: спирането е плавно и предвидимо — газта се вдига рано, спирачката е мека.",
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
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
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

  // Self-validation (mirrors gen_fo_follow / gen_poligon invariants).
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 street (lanes 2)`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "pk-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_pk_smoothstop self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (S3 batch 6: the PK precision-stop micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-stop-v1",
    label: "Учебна улица — плавно спиране на позиция (сценарий PK-14)",
    lengthM: 200,
    maxspeedKmh: 50,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPkStopStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  console.log(`=== pk-smoothstop build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
