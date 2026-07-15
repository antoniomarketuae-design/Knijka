/**
 * gen_ac_vp_streets.mjs — the ADVERSE-CONDITIONS (AC) + COCKPIT-PROCEDURE (VP)
 * micro-maps (Scenario Studio, doc 76 §3; doc 72 §13 „Family AC" + §3 „Family
 * VP"). The exact straight-street shape of gen_sp_speed.mjs: ONE plain two-way
 * street (one marked lane per direction) carrying a posted limit and NOTHING
 * else — no crossing, no junction, no signal, no sign. On such a map the ONLY
 * thing the rule engine can grade is the driver's own COCKPIT STATE (belt /
 * handbrake / lights) against the recorded condition, which is exactly what the
 * cockpit-channel unlock (recorder de3c33a) needs:
 *
 *   - vp-ready-v1  „Готовност преди тръгване"  (VP-02 belt + VP-05 handbrake)
 *   - ac-night-v1  „Нощно каране без светлини"  (AC-01, recorded at night)
 *   - ac-rain-v1   „Дъжд без светлини"          (AC-02, recorded in day rain)
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime) and buildLaneGraph/createTrafficSystem (traffic) already consume —
 * the gen_sp_speed.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/ac-vp-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     <p>-n-end (0, L)                    L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06
 *         │
 *     <p>-spawn-approach (4.06, 15)
 *         │
 *     <p>-n-start (0, 0)
 *
 * (<p> = the instance id prefix — "vp" / "ac-night" / "ac-rain".)
 *
 * Ambient traffic is authored to ZERO by every drive (seed 7), so nothing but
 * the cockpit fault is gradable. Deterministic: same params → byte-identical
 * JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ac_vp_streets.mjs
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
// The generator (one straight two-way street — the AC/VP micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   idPrefix: string,     // node/edge/spawn id prefix (kebab-case)
 *   label: string,        // human label (meta)
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 * }} params
 */
export function buildPlainStreet(params) {
  const errors = [];
  const { districtId, idPrefix, label, lengthM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9-]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_ac_vp_streets params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  const EDGE_ID = `${idPrefix}-e-street`;
  const NODE_START = `${idPrefix}-n-start`;
  const NODE_END = `${idPrefix}-n-end`;
  const SPAWN_APPROACH = `${idPrefix}-spawn-approach`;
  const SPAWN_FINISH = `${idPrefix}-spawn-finish`;

  // -- Nodes / edge (one straight street; no junctions).
  const NODES = {
    [NODE_START]: [0, 0],
    [NODE_END]: [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: EDGE_ID,
      from: NODE_START,
      to: NODE_END,
      class: "residential",
      name: "Права улица за упражнение на кокпит дисциплина",
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

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const CROSSINGS = []; // a pure cockpit street carries no crossing
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: SPAWN_APPROACH,
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: EDGE_ID,
      name: "Начало на отсечката",
    },
    {
      id: SPAWN_FINISH,
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: EDGE_ID,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- One office block west of the street (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), 150],
        [r2(-(halfRoadM + 8)), 150],
        [r2(-(halfRoadM + 8)), 168],
        [r2(-(halfRoadM + 20)), 168],
      ],
    },
  ];

  // -- Bounds + stats.
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  // Road body + buildings can outgrow the centerline bounds — cover them.
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
      generator: "tools/maps/gen_ac_vp_streets.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна права улица за кокпит дисциплина — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: ограничението важи по цялата дължина; фокусът е върху състоянието на кокпита, не върху скоростта.",
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
       * truth. ScenarioSpecs pin the right-lane center by value and the
       * contract battery asserts the copy matches this file.
       */
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 street (lanes 2)`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== EDGE_ID) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ac_vp_streets self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The three committed instances (AC/VP cockpit-channel batch)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "vp-ready-v1",
    idPrefix: "vp",
    label: "Учебна улица — готовност преди тръгване (сценарий VP-02/VP-05)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
  {
    districtId: "ac-night-v1",
    idPrefix: "ac-night",
    label: "Учебна улица — нощно каране без светлини (сценарий AC-01)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
  {
    districtId: "ac-rain-v1",
    idPrefix: "ac-rain",
    label: "Учебна улица — дъжд без светлини (сценарий AC-02)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPlainStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== ac-vp build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
