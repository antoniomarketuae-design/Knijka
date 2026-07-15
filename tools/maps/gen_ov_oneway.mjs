/**
 * gen_ov_oneway.mjs — the OV one-way micro-map (Scenario Studio, doc 76 §3;
 * doc 72 §10 archetype OV-13 „Влизане срещу еднопосочна / Wrong-way entry").
 * ONE straight ONE-WAY street with a single marked lane, the exact district-v1
 * shape buildWorldGeometry (world), createWorldRuntime (runtime — an oneway edge
 * makes tick.oneway=true and the tangent-vs-heading test drives tick.wrongWay)
 * and buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_sp_speed.mjs mold, tuned to a oneway edge. Contract battery:
 * platform/src/modules/sim/world/__tests__/ov-oneway-district.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, and the
 * legal flow is northbound — the „from → to" geometry direction):
 *
 *     ov-ow-n-end (0, L)                  L = lengthM
 *         ▲   legal flow = NORTH
 *         │   single lane, center on the polyline (x = 0)
 *         │
 *     ov-ow-spawn-entry (0, 15) heading 0 (north = with the flow)
 *         │
 *     ov-ow-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions, no crossings — the street teaches
 * entering a one-way in the flow direction only (чл. 6; В2 „Влизането
 * забранено"), nothing else (doc 76 §3). Ambient traffic is authored to ZERO by
 * every drive, so the ONLY thing the rule engine can grade is the driver's own
 * direction of travel against the one-way flow.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_oneway.mjs
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
// The generator (one straight one-way street — the S3 OV wrong-way map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 * }} params
 */
export function buildOvOneWayStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_ov_oneway params invalid:\n  - ${errors.join("\n  - ")}`);

  // Oneway lane bank (runtime/spatial.ts): lanesPerDir = lanes (all one way);
  // the single lane's bank is centered on the polyline, so its center is x = 0.
  const halfRoadM = SCALED_LANE_W / 2; // one drawn lane, centered on x = 0
  const laneCenterM = 0;

  // -- Nodes / edge (one straight one-way street; no junctions).
  const NODES = {
    "ov-ow-n-start": [0, 0],
    "ov-ow-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "ov-ow-street",
      from: "ov-ow-n-start",
      to: "ov-ow-n-end",
      class: "residential",
      name: "Еднопосочна улица",
      oneway: true,
      roundabout: false,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- Spawns: the legal entry (heading north = with the flow) + a finish.
  const SPAWN_POINTS = [
    {
      id: "ov-ow-spawn-entry",
      x: laneCenterM,
      y: 15,
      heading: 0, // north = the legal flow direction (from → to)
      edgeId: "ov-ow-street",
      name: "Вход по посока на движението",
    },
    {
      id: "ov-ow-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "ov-ow-street",
      name: "Контролна точка — край на улицата",
    },
  ];

  // -- One office block west of the street (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: "ov-ow-b-block",
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
      generator: "tools/maps/gen_ov_oneway.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна еднопосочна улица — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Еднопосочна улица: влизаш само по посока на движението; знакът В2 „Влизането забранено“ значи не влизаш.",
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
       * truth. The single one-way lane centers on the polyline (x = 0); the
       * contract battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh },
        oneway: true,
        lanesPerDirection: 1,
        laneCenterM,
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
    if (e.lanes !== 1 || !e.oneway) post.push(`${e.id}: the archetype is a single-lane one-way street (lanes 1, oneway)`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "ov-ow-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_oneway self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// ov-oneway-v1 instance — the sc-ov-oneway product map (doc 76 §3):
// 300 m of straight single-lane one-way at the urban 50.
// ---------------------------------------------------------------------------

const OW_PARAMS = {
  districtId: "ov-oneway-v1",
  label: "Учебна еднопосочна улица (сценарий OV-13)",
  lengthM: 300,
  maxspeedKmh: 50,
};

const district = buildOvOneWayStreet(OW_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${OW_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${OW_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== ov-oneway build: ${OW_PARAMS.districtId} ===`);
line("length / limit", `${OW_PARAMS.lengthM} m / ${OW_PARAMS.maxspeedKmh} km/h`);
line("lane center", `${district.meta.scenario.laneCenterM} m (on the polyline)`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
