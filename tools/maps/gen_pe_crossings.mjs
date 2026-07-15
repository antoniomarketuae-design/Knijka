/**
 * gen_pe_crossings.mjs — the S3 PEDESTRIAN-family micro-maps (Scenario Studio,
 * doc 76 §3; doc 72 §6 archetypes PE-03 / PE-08 / PE-16). Same zebra-block
 * shape as gen_zebra_street.mjs (one straight two-lane street carrying a
 * MARKED, unsignalized crossing) — a purpose-built street per archetype so
 * each ScenarioSpec pins its own approach length, limit and crossing y:
 *
 *   - pe-clear-v1  „Изчакай пътеката да се освободи"  (PE-03, squeeze-past)
 *   - pe-slow-v1   „Бавен пешеходец"                  (PE-08, elderly crosser)
 *   - pe-rain-v1   „Пътека в дъжд през нощта"         (PE-16, rain sprinter ×N)
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime — the CrossingZoneTracker derives its zone from crossings[]) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_zebra_street.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/pe-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pe-n-end (0, L)                  L = approachM + RUNOUT_M
 *         │
 *         ═  pe-x-1 (0, approachM)     marked zebra (kind "marked",
 *         │                            signalized false — CrossingZone
 *     pe-spawn-approach (4.06, 15)     radius ~35 m arms on the host edge)
 *         │
 *     pe-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions — the street teaches the crossing
 * approach, nothing else (doc 76 §3). The staged pedestrian is LESSON data
 * (StagedEventSpec pedestrianDartOut in the ScenarioSpec); the map only carries
 * the crossing geometry — single truth in meta.scenario.crossings.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pe_crossings.mjs
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
/** Street continues this far past the crossing (run-out + finish), m. */
const RUNOUT_M = 60;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (single crossing — the S3 PE micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,      // output file name + LessonSpec.world.districtId
 *   label: string,           // human label (meta)
 *   approachM: number,       // street-start → crossing distance (>= 60)
 *   maxspeedKmh: number,     // legal limit on the street (30..50)
 * }} params
 */
export function buildPeCrossingStreet(params) {
  const errors = [];
  const { districtId, label, approachM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_pe_crossings params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; a zebra needs no junctions).
  const NODES = {
    "pe-n-start": [0, 0],
    "pe-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "pe-e-street",
      from: "pe-n-start",
      to: "pe-n-end",
      class: "residential",
      name: "Улица с пешеходна пътека",
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

  // -- Crossing: the single geometric truth (CrossingZoneTracker + the
  // markings builder + the ScenarioSpec all read exactly this).
  const CROSSINGS = [
    {
      id: "pe-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "pe-e-street",
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "pe-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pe-e-street",
      name: "Подход към пешеходната пътека",
    },
    {
      id: "pe-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "pe-e-street",
      name: "Контролна точка — след пътеката",
    },
  ];

  // -- One corner shop west of the crossing (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: "pe-b-shop",
      height: 4.5,
      heightSource: "default",
      footprint: [
        [-26, r2(crossingY - 34)],
        [-16, r2(crossingY - 34)],
        [-16, r2(crossingY - 22)],
        [-26, r2(crossingY - 22)],
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
      generator: "tools/maps/gen_pe_crossings.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица с пешеходна пътека — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: ограничението важи по цялата дължина; пред пътеката се кара с готовност за спиране.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the crossing
       * truth. ScenarioSpecs pin the crossing by value and the contract battery
       * asserts the copy matches this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings: 1, signalized: "no", approachM },
        primaryCrossingId: "pe-x-1",
        laneCenterRightM: laneCenterM,
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
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "pe-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // The crossing must sit ON the street centerline with real approach room
  // before it (the ~35 m zone must arm on the road, not at spawn).
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "pe-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pe_crossings self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The three committed instances (S3 PE batch 1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pe-clear-v1",
    label: "Учебна улица — изчакай пътеката (сценарий PE-03)",
    approachM: 90,
    maxspeedKmh: 50,
  },
  {
    districtId: "pe-slow-v1",
    label: "Учебна улица — бавен пешеходец (сценарий PE-08)",
    approachM: 85,
    maxspeedKmh: 40,
  },
  {
    districtId: "pe-rain-v1",
    label: "Учебна улица — пътека в дъжд през нощта (сценарий PE-16)",
    approachM: 95,
    maxspeedKmh: 50,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPeCrossingStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== pe-crossings build: ${params.districtId} ===`);
  line("approach / street length", `${params.approachM} m / ${district.roads.edges[0].length} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
