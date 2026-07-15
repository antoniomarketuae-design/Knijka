/**
 * gen_zebra_street.mjs — parametric ZEBRA-STREET map archetype (Scenario
 * Studio, doc 76 §3) → content/world/<districtId>.json
 *
 * The pedestrian-family micro-map: ONE straight two-lane street (one lane per
 * direction) carrying 1–2 MARKED pedestrian crossings, in the exact
 * district-v1 format buildWorldGeometry (world), parseDistrict/
 * createWorldRuntime (runtime — the CrossingZoneTracker derives its zones
 * from crossings[]) and buildLaneGraph/createTrafficSystem (traffic) already
 * consume — the gen_parking_lot.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/zb-district.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     zb-n-end (0, L)                 L = approachM + (crossings-1)·70 + 60
 *         │
 *         ═  zb-x-2 (0, approachM+70)   marked zebra (kind "marked",
 *         │                             signalized false — CrossingZone
 *         ═  zb-x-1 (0, approachM)      radius 35 m arms on the host edge)
 *         │
 *     zb-spawn-approach (4.06, 15)    right-lane center (drawn lane 8.125 m)
 *         │
 *     zb-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions — the street teaches the zebra
 * approach, nothing else (doc 76 §3). The staged pedestrian is LESSON data
 * (StagedEventSpec pedestrianDartOut in the ScenarioSpec); the map only
 * carries the crossing geometry — single truth in meta.scenario.crossings.
 *
 * `signalized: "yes"` is REJECTED for now (honest gap): the runtime's signal
 * controller derives clusters from signalized INTERSECTIONS only — a
 * standalone signal-controlled zebra would paint lights the rule engine
 * cannot adjudicate. The unsignalized marked zebra is the zb-v1 product.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_zebra_street.mjs
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
/** Distance between two authored crossings, m (≥ the 2×35 m zone would
 * overlap — deliberate: consecutive zebras in cities do sit close; zones are
 * id-keyed and arm independently). */
const CROSSING_GAP_M = 70;
/** Street continues this far past the last crossing (run-out + finish), m. */
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
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,      // output file name + LessonSpec.world.districtId
 *   label: string,           // human label (meta)
 *   crossings: 1|2,          // marked zebra count on the street
 *   signalized: "no"|"yes",  // "yes" = signal-controlled zebra (REJECTED — see header)
 *   approachM: number,       // street-start → first crossing distance (>= 60)
 *   maxspeedKmh: number,     // legal limit on the street (30..50)
 * }} params
 */
export function buildZebraStreetDistrict(params) {
  const errors = [];
  const { districtId, label, crossings, signalized, approachM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (![1, 2].includes(crossings)) errors.push(`crossings must be 1 | 2, got ${crossings}`);
  if (signalized !== "no" && signalized !== "yes") {
    errors.push(`signalized must be "no" | "yes", got ${signalized}`);
  } else if (signalized === "yes") {
    errors.push(
      `signalized "yes" is not generatable yet: signal clusters derive from signalized ` +
        `INTERSECTIONS (runtime/signals.ts) — a standalone signal zebra would paint lamps the ` +
        `rule engine cannot adjudicate. Ship the unsignalized marked zebra ("no").`,
    );
  }
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_zebra_street params invalid:\n  - ${errors.join("\n  - ")}`);

  const lastCrossingY = approachM + (crossings - 1) * CROSSING_GAP_M;
  const lengthM = lastCrossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; a zebra needs no junctions).
  const NODES = {
    "zb-n-start": [0, 0],
    "zb-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "zb-e-street",
      from: "zb-n-start",
      to: "zb-n-end",
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

  // -- Crossings: the single geometric truth (CrossingZoneTracker + the
  // markings builder + the ScenarioSpec all read exactly these).
  const CROSSINGS = [];
  for (let i = 0; i < crossings; i++) {
    CROSSINGS.push({
      id: `zb-x-${i + 1}`,
      x: 0,
      y: r2(approachM + i * CROSSING_GAP_M),
      kind: "marked",
      signalized: false,
      edgeId: "zb-e-street",
    });
  }

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "zb-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "zb-e-street",
      name: "Подход към пешеходната пътека",
    },
    {
      id: "zb-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "zb-e-street",
      name: "Контролна точка — след пътеката",
    },
  ];

  // -- One corner shop west of the first crossing (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: "zb-b-shop",
      height: 4.5,
      heightSource: "default",
      footprint: [
        [-26, r2(approachM - 34)],
        [-16, r2(approachM - 34)],
        [-16, r2(approachM - 22)],
        [-26, r2(approachM - 22)],
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
      generator: "tools/maps/gen_zebra_street.mjs",
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
       * truth. ScenarioSpecs pin the PRIMARY crossing by value and the
       * contract battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings, signalized, approachM },
        primaryCrossingId: "zb-x-1",
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
    if (s.edgeId !== "zb-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // Crossings must sit ON the street centerline, ordered, with real approach
  // room before the first (the 35 m zone must arm on the road, not at spawn).
  let prevY = -Infinity;
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y <= prevY) post.push(`${c.id}: crossings must ascend along the street`);
    prevY = c.y;
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "zb-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_zebra_street self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// zb-v1 instance — the sc-zebra-approach product map (doc 76 §3): unsignalized
// marked zebra, 90 m approach, a second crossing for map life.
// ---------------------------------------------------------------------------

const ZB_PARAMS = {
  districtId: "zb-v1",
  label: "Учебна улица — пешеходна пътека тип „зебра“ (сценарий PE)",
  crossings: 2,
  signalized: "no",
  approachM: 90,
  maxspeedKmh: 50,
};

const district = buildZebraStreetDistrict(ZB_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const OUT_FILE = path.join(REPO_ROOT, "content", "world", `${ZB_PARAMS.districtId}.json`);
mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, out);

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== zebra-street build: ${ZB_PARAMS.districtId} ===`);
line("crossings / signalized", `${ZB_PARAMS.crossings} / ${ZB_PARAMS.signalized}`);
line("approach / street length", `${ZB_PARAMS.approachM} m / ${district.roads.edges[0].length} m`);
line("crossing ids", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", OUT_FILE);
console.log("Validation OK.");
