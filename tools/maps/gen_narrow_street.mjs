/**
 * gen_narrow_street.mjs — the NARROW-STREET meeting micro-map (Scenario Studio,
 * doc 76 §3; doc 72 §10 archetype OV-14 „Разминаване в тясна улица") →
 * content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A plain straight two-way street (ONE marked lane per direction) — the stage
 * for the narrow-passage meeting: a parked row (staged held props in the
 * ScenarioSpec) blocks the player's lane through a mid-block section, and an
 * oncoming actor is timed to transit it as the player arrives. ЗДвП
 * narrow-passage priority: the side WITH the obstruction yields. NOTHING else
 * is on the map (no crossing, junction, signal or sign), so the ONLY thing the
 * scenario director grades is the narrow-meeting adjudication (FAILED_TO_YIELD /
 * YIELDED_TO_PRIORITY). Same straight-street shape as gen_pk_smoothstop.mjs.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     nm-n-end (0, L)                    L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06 (player,
 *         │   northbound), oncoming lane center x = −4.06 (southbound actor).
 *         │   A parked row sits in the player's lane through the mid-block
 *         │   section; the player must swing into the oncoming lane to pass.
 *         │
 *     nm-spawn-approach (4.06, 15)
 *         │
 *     nm-n-start (0, 0)
 *
 * The parked row + the oncoming actor are LESSON data (StagedEventSpec
 * narrowMeeting in the ScenarioSpec); the map only hosts the two-way street.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_narrow_street.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/nm-district.test.ts
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
export function buildNarrowStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_narrow_street params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W;
  const laneCenterM = r2(SCALED_LANE_W / 2);

  const NODES = {
    "nm-n-start": [0, 0],
    "nm-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "nm-e-street",
      from: "nm-n-start",
      to: "nm-n-end",
      class: "residential",
      name: "Тясна двупосочна улица с паркирани коли",
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
      id: "nm-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "nm-e-street",
      name: "Начало на отсечката",
    },
    {
      id: "nm-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "nm-e-street",
      name: "Контролна точка — край на отсечката",
    },
  ];

  const BUILDINGS = [
    {
      id: "nm-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), 100],
        [r2(-(halfRoadM + 8)), 100],
        [r2(-(halfRoadM + 8)), 130],
        [r2(-(halfRoadM + 20)), 130],
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
      generator: "tools/maps/gen_narrow_street.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна тясна двупосочна улица за разминаване — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Тясна улица: при разминаване през стеснение отстъпва страната със стеснението.",
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
        archetype: "narrow-street",
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

  // Self-validation (mirrors gen_pk_smoothstop / gen_poligon invariants).
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
    if (s.edgeId !== "nm-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_narrow_street self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the OV-14 narrow-meeting micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ov-narrow-v1",
    label: "Учебна тясна улица — разминаване през стеснение (сценарий OV-14)",
    lengthM: 240,
    maxspeedKmh: 40,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildNarrowStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  console.log(`=== narrow-street build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
