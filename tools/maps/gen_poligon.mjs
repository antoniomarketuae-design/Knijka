/**
 * gen_poligon.mjs — hand-authored ПОЛИГОН training ground → content/world/poligon-v1.json
 *
 * The first NON-OSM district: a closed maneuvering area (учебна площадка) in
 * the exact district-v1 format that buildWorldGeometry (world), parseDistrict/
 * createWorldRuntime (runtime) and buildLaneGraph/createTrafficSystem
 * (traffic) already consume — proven by
 * platform/src/modules/sim/world/__tests__/poligon-district.test.ts.
 *
 * Layout (local meters, x = east, y = north, origin at the ground's center):
 *
 *        nw-a ─────────── n0 ─────────── ne-b            perimeter circuit:
 *      nw-b┐                              ┌ne-a          unclassified, 2 lanes,
 *        │                │                 │            30 km/h, 20 m corner
 *        │                │(spine,          │            arcs (curve technique)
 *        w0 ───────────── c ────────────── e0            cross alleys: tertiary
 *        │    (cross, tertiary 30)          │            → painted center line
 *        │      g1 ┐      │        ┌ h1     │            aprons: service stubs
 *      sw-b┘       │(slalom)       │(bays) └se-b         (slalom 20, bays 20)
 *        sw-a ── g2 ───── s0 ───── p1 ──── se-a
 *              (старт-стоп права, spawn-1 →)
 *
 * Junctions: 6 × T + 1 × 4-way, ALL uncontrolled (right-hand-rule drills at
 * walking pace — no signals on a real полигон). One marked pedestrian
 * crossing on the north spine. Parking-bay PAINT is not in this file by
 * design: bays are lesson-authored data (ParkingBaySpec → buildWorldGeometry
 * options.parkingBays), same pattern as L7 in the city district.
 *
 * Deterministic: same script → byte-identical JSON. No external data, no
 * OSM, no randomness. Run:  node tools/maps/gen_poligon.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curbLaneOffsetM, toCurbLane } from "./lib/lane.mjs";

/** The painted classes this pad uses (world/builders/constants MARKED_CLASSES). */
const MARKED_POLIGON_CLASSES = new Set(["unclassified", "tertiary"]);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_FILE = path.join(REPO_ROOT, "content", "world", "poligon-v1.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r2 = (v) => Math.round(v * 100) / 100;

/** Quarter-circle arc polyline: center (cx,cy), radius r, θ from a0 to a1 (deg). */
function arc(cx, cy, r, a0deg, a1deg, segments = 8) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = ((a0deg + ((a1deg - a0deg) * i) / segments) * Math.PI) / 180;
    pts.push([r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))]);
  }
  return pts;
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** id -> [x, y]. Perimeter rectangle 380 × 260 with 20 m corner arcs. */
const NODES = {
  // south straight (старт-стоп права)
  "pg-n-sw-a": [-170, -130],
  "pg-n-g2": [-95, -130],
  "pg-n-s0": [0, -130],
  "pg-n-p1": [95, -130],
  "pg-n-se-a": [170, -130],
  // east straight
  "pg-n-se-b": [190, -110],
  "pg-n-e0": [190, 0],
  "pg-n-ne-a": [190, 110],
  // north straight
  "pg-n-ne-b": [170, 130],
  "pg-n-n0": [0, 130],
  "pg-n-nw-a": [-170, 130],
  // west straight
  "pg-n-nw-b": [-190, 110],
  "pg-n-w0": [-190, 0],
  "pg-n-sw-b": [-190, -110],
  // center of the 4-way
  "pg-n-c": [0, 0],
  // maneuvering-apron stub ends (dead ends by design)
  "pg-n-g1": [-95, -40],
  "pg-n-h1": [95, -40],
};

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** Straight edge between two named nodes. */
function straight(id, from, to, cls, lanes, maxspeed, name) {
  const a = NODES[from];
  const b = NODES[to];
  const geometry = [
    [r2(a[0]), r2(a[1])],
    [r2(b[0]), r2(b[1])],
  ];
  return {
    id,
    from,
    to,
    class: cls,
    name,
    oneway: false,
    roundabout: false,
    lanes,
    lanesSource: "tag",
    maxspeed,
    maxspeedSource: "tag",
    length: polylineLength(geometry),
    geometry,
  };
}

/** Corner-arc edge (endpoints must land exactly on the nodes). */
function corner(id, from, to, cx, cy, a0, a1, name) {
  const geometry = arc(cx, cy, 20, a0, a1);
  const [fx, fy] = NODES[from];
  const [tx, ty] = NODES[to];
  const [g0x, g0y] = geometry[0];
  const [gnx, gny] = geometry[geometry.length - 1];
  if (g0x !== fx || g0y !== fy || gnx !== tx || gny !== ty) {
    throw new Error(`corner ${id}: arc endpoints do not meet nodes ${from}/${to}`);
  }
  return {
    id,
    from,
    to,
    class: "unclassified",
    name,
    oneway: false,
    roundabout: false,
    lanes: 2,
    lanesSource: "tag",
    maxspeed: 30,
    maxspeedSource: "tag",
    length: polylineLength(geometry),
    geometry,
  };
}

const EDGES = [
  // Perimeter circuit — unclassified, 2 lanes, 30 km/h.
  straight("pg-e-s1", "pg-n-sw-a", "pg-n-g2", "unclassified", 2, 30, "Старт-стоп права"),
  straight("pg-e-s2", "pg-n-g2", "pg-n-s0", "unclassified", 2, 30, "Старт-стоп права"),
  straight("pg-e-s3", "pg-n-s0", "pg-n-p1", "unclassified", 2, 30, "Старт-стоп права"),
  straight("pg-e-s4", "pg-n-p1", "pg-n-se-a", "unclassified", 2, 30, "Старт-стоп права"),
  straight("pg-e-e1", "pg-n-se-b", "pg-n-e0", "unclassified", 2, 30, "Източна права"),
  straight("pg-e-e2", "pg-n-e0", "pg-n-ne-a", "unclassified", 2, 30, "Източна права"),
  straight("pg-e-n1", "pg-n-ne-b", "pg-n-n0", "unclassified", 2, 30, "Северна права"),
  straight("pg-e-n2", "pg-n-n0", "pg-n-nw-a", "unclassified", 2, 30, "Северна права"),
  straight("pg-e-w1", "pg-n-nw-b", "pg-n-w0", "unclassified", 2, 30, "Западна права"),
  straight("pg-e-w2", "pg-n-w0", "pg-n-sw-b", "unclassified", 2, 30, "Западна права"),
  // 20 m corner arcs — the curve-technique element of the circuit.
  corner("pg-e-c-sw", "pg-n-sw-a", "pg-n-sw-b", -170, -110, -90, -180, "Югозападен завой"),
  corner("pg-e-c-se", "pg-n-se-a", "pg-n-se-b", 170, -110, -90, 0, "Югоизточен завой"),
  corner("pg-e-c-ne", "pg-n-ne-a", "pg-n-ne-b", 170, 110, 0, 90, "Североизточен завой"),
  corner("pg-e-c-nw", "pg-n-nw-a", "pg-n-nw-b", -170, 110, 90, 180, "Северозападен завой"),
  // Cross alleys — tertiary so the markings builder paints a dashed center
  // line + edge lines (MARKED_CLASSES) for keep-right discipline drills.
  straight("pg-e-spine-s", "pg-n-s0", "pg-n-c", "tertiary", 2, 30, "Централна алея"),
  straight("pg-e-spine-n", "pg-n-c", "pg-n-n0", "tertiary", 2, 30, "Централна алея"),
  straight("pg-e-cross-w", "pg-n-w0", "pg-n-c", "tertiary", 2, 30, "Напречна алея"),
  straight("pg-e-cross-e", "pg-n-c", "pg-n-e0", "tertiary", 2, 30, "Напречна алея"),
  // Maneuvering aprons — service stubs, excluded from ambient traffic routes
  // (DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses), 20 km/h.
  straight("pg-e-apron-slalom", "pg-n-g2", "pg-n-g1", "service", 1, 20, "Слаломен коридор"),
  straight("pg-e-apron-bays", "pg-n-p1", "pg-n-h1", "service", 2, 20, "Коридор за паркиране"),
];

// ---------------------------------------------------------------------------
// Derived collections
// ---------------------------------------------------------------------------

const degree = new Map();
for (const e of EDGES) {
  degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
}

/** intersections[] lists degree >= 3 only (same convention as the OSM build). */
const INTERSECTIONS = [...degree.entries()]
  .filter(([, d]) => d >= 3)
  .map(([id, d]) => ({
    id,
    x: r2(NODES[id][0]),
    y: r2(NODES[id][1]),
    degree: d,
    signalized: false, // a полигон has no traffic lights — all right-hand-rule
  }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

const CROSSINGS = [
  // Marked zebra on the north spine — walking-pace pedestrian-yield drills.
  { id: "pg-x-1", x: 0, y: 65, kind: "marked", signalized: false, edgeId: "pg-e-spine-n" },
];

const ROUNDABOUTS = []; // the city district (rb-1) owns roundabout teaching

const BUILDINGS = [
  {
    id: "pg-b-office",
    height: 6,
    heightSource: "default",
    footprint: [
      [-160, -95],
      [-130, -95],
      [-130, -75],
      [-160, -75],
    ],
  },
  {
    id: "pg-b-garage",
    height: 4.5,
    heightSource: "default",
    footprint: [
      [130, -95],
      [160, -95],
      [160, -78],
      [130, -78],
    ],
  },
];

// doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
// along, not on its centreline. pg-e-s3 is `unclassified`, i.e. a PAINTED
// class, so the old centreline pose put Урок 0/8's car astride the осева of
// the start-stop straight before the student had touched anything. The two
// apron corridors are `service` (no paint, no lane), so toCurbLane leaves
// them where the pad's own geometry wants them.
const SPAWN_POINTS = toCurbLane(
  [
    // Start/stop grid on the south straight, facing east.
    { id: "pg-spawn-1", x: 20, y: -130, heading: 90, edgeId: "pg-e-s3", name: "Старт-стоп права" },
    // Slalom corridor, facing north (cones are a lesson-layer prop, not map data).
    { id: "pg-spawn-2", x: -95, y: -105, heading: 0, edgeId: "pg-e-apron-slalom", name: "Слаломен коридор" },
    // Parking apron, facing north (perpendicular bays painted lesson-side).
    { id: "pg-spawn-3", x: 95, y: -105, heading: 0, edgeId: "pg-e-apron-bays", name: "Коридор за паркиране" },
  ],
  EDGES,
);

// ---------------------------------------------------------------------------
// Meta + assembly
// ---------------------------------------------------------------------------

const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
for (const e of EDGES) {
  for (const [x, y] of e.geometry) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
}

const totalKm = r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000);

const district = {
  format: "district-v1",
  meta: {
    district: "poligon",
    label: "Учебен полигон (закрита площадка за начално обучение)",
    mapKind: "training-ground",
    generator: "tools/maps/gen_poligon.mjs",
    boundsLocalMeters: bounds,
    attribution: {
      // Original, hand-authored layout — NOT derived from OpenStreetMap, so no
      // ODbL obligation applies to this file (the city district keeps its own).
      text: "Учебен полигон — оригинален авторски дизайн (без данни от OpenStreetMap)",
      license: "All rights reserved",
      licenseUrl: "/",
      copyrightUrl: "/",
      obligation: "none — original work, no ODbL attribution required for this map",
    },
    defaults: {
      maxspeedUrbanKmh: 30,
      note: "Полигон: 30 km/h е защитната граница навсякъде на площадката; сервизните коридори са маркирани 20 km/h.",
    },
    stats: {
      roadKm: totalKm,
      nodes: Object.keys(NODES).length,
      edges: EDGES.length,
      intersections: INTERSECTIONS.length,
      crossings: CROSSINGS.length,
      buildings: BUILDINGS.length,
      spawnPoints: SPAWN_POINTS.length,
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

// ---------------------------------------------------------------------------
// Self-validation (mirrors the invariants tools/osm/build.mjs enforces)
// ---------------------------------------------------------------------------

const errors = [];
const nodeIds = new Set(Object.keys(NODES));
const edgeIds = new Set();

for (const e of EDGES) {
  if (edgeIds.has(e.id)) errors.push(`duplicate edge id ${e.id}`);
  edgeIds.add(e.id);
  if (!nodeIds.has(e.from)) errors.push(`${e.id}: unknown from ${e.from}`);
  if (!nodeIds.has(e.to)) errors.push(`${e.id}: unknown to ${e.to}`);
  if (e.geometry.length < 2) errors.push(`${e.id}: degenerate geometry`);
  const [fx, fy] = NODES[e.from];
  const [tx, ty] = NODES[e.to];
  const g0 = e.geometry[0];
  const gn = e.geometry[e.geometry.length - 1];
  if (g0[0] !== r2(fx) || g0[1] !== r2(fy)) errors.push(`${e.id}: geometry[0] != from node`);
  if (gn[0] !== r2(tx) || gn[1] !== r2(ty)) errors.push(`${e.id}: geometry[-1] != to node`);
  const recomputed = polylineLength(e.geometry);
  if (Math.abs(recomputed - e.length) > 0.01) {
    errors.push(`${e.id}: length ${e.length} != recomputed ${recomputed}`);
  }
  if (e.length <= 0) errors.push(`${e.id}: zero length`);
}

// Degree bookkeeping: every listed intersection matches actual degree.
for (const it of INTERSECTIONS) {
  if ((degree.get(it.id) ?? 0) !== it.degree) errors.push(`${it.id}: degree mismatch`);
}

// Crossings and spawns must sit on their host edge (within half a lane).
function distToEdge(edge, x, y) {
  let best = Infinity;
  const g = edge.geometry;
  for (let i = 0; i < g.length - 1; i++) {
    const [ax, ay] = g[i];
    const [bx, by] = g[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (ax + abx * t), y - (ay + aby * t)));
  }
  return best;
}
for (const c of CROSSINGS) {
  const host = EDGES.find((e) => e.id === c.edgeId);
  if (!host) errors.push(`${c.id}: unknown edgeId ${c.edgeId}`);
  else if (distToEdge(host, c.x, c.y) > 1) errors.push(`${c.id}: not on its edge`);
}
for (const s of SPAWN_POINTS) {
  const host = EDGES.find((e) => e.id === s.edgeId);
  // doc 87 T2: "on its edge" used to mean "within a metre of its CENTRELINE",
  // i.e. the invariant enforced the defect it was supposed to catch. The
  // painted classes must be in their curb lane; the service aprons have no
  // lane to be in, so they stay on the corridor's own line.
  const want = MARKED_POLIGON_CLASSES.has(host?.class) ? curbLaneOffsetM(host.lanes, host.oneway) : 0;
  if (!host) errors.push(`${s.id}: unknown edgeId ${s.edgeId}`);
  else if (Math.abs(distToEdge(host, s.x, s.y) - want) > 1) errors.push(`${s.id}: not in its edge's driving lane`);
}

// Bounds cover all geometry (exactly — they were derived from it).
if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
  errors.push("degenerate bounds");
}

// Drivable-network connectivity: the non-service graph must be ONE component
// (all edges are two-way, so undirected connectivity == strong connectivity —
// every ambient-traffic loop and every staged path can close).
{
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  const routable = EDGES.filter((e) => e.class !== "service");
  for (const e of routable) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  const start = routable[0].from;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const v = queue.pop();
    for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
  }
  const routableNodes = new Set(routable.flatMap((e) => [e.from, e.to]));
  if (seen.size !== routableNodes.size) {
    errors.push(`routable network split: reached ${seen.size}/${routableNodes.size} nodes`);
  }
}

if (errors.length > 0) {
  console.error(`VALIDATION FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write + report
// ---------------------------------------------------------------------------

const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, out);

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log("=== полигон build: Учебен полигон ===");
line("road length", `${totalKm} km`);
line("nodes / edges", `${Object.keys(NODES).length} / ${EDGES.length}`);
line("intersections (deg >= 3)", `${INTERSECTIONS.length} (all uncontrolled)`);
line("crossings", CROSSINGS.length);
line("buildings / spawns", `${BUILDINGS.length} / ${SPAWN_POINTS.length}`);
line("bounds", `${bounds.maxX - bounds.minX} x ${bounds.maxY - bounds.minY} m`);
line("output", `${OUT_FILE} (${(Buffer.byteLength(out, "utf8") / 1024).toFixed(1)} KB)`);
console.log("Validation OK.");
