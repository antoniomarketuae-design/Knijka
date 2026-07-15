/**
 * gen_mini_roundabout.mjs — parametric MINI-ROUNDABOUT map archetype
 * (Scenario Studio, doc 76 §3) → content/world/<districtId>.json
 *
 * The roundabout-family micro-map: one SINGLE-LANE ring with four radial
 * arms, encoded with district-v1's rb-1 conventions exactly (proven by the
 * city map): the ring is a closed sequence of ONEWAY edges flagged
 * `roundabout: true` (lanes 1), the arm↔ring joints are unsignalized
 * degree-3 intersections, and roundabouts[] carries {id, x, y, radius,
 * edgeIds} — which is what arms the runtime's circulatingConflict machinery
 * (worldRuntime 4c) and the props builder's Б1+Д11 entry signs. Contract
 * battery: platform/src/modules/sim/world/__tests__/rb-mini-district.test.ts.
 *
 * Layout (x = east, y = north, ring center at the origin; circulation is
 * COUNTER-CLOCKWISE viewed from above — right-hand traffic, the rb-1 flow):
 *
 *                 rbm-n-n-out (0, R+armLen)
 *                      │  north arm
 *                 rbm-n-n (0, R)
 *                ╱             ╲          ring edges (oneway, CCW):
 *      rbm-n-w (-R, 0)     rbm-n-e (R, 0)   s→e, e→n, n→w, w→s
 *                ╲             ╱
 *                 rbm-n-s (0, -R)
 *                      │  south arm (the scenario entry)
 *                 rbm-n-s-out (0, -R-armLen)
 *
 * No signals, no stop lines (the stop-sign heuristic skips roundabout nodes
 * by design — priority-inside, yield on entry), no crossings. Deterministic:
 * same params → byte-identical JSON. Run: node tools/maps/gen_mini_roundabout.mjs
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
/** Ring quarter-arc sampling step, degrees (rb-1 rides ~5 m point spacing). */
const ARC_STEP_DEG = 15;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/**
 * CCW ring arc from compass angle a0 to a1 (degrees measured from SOUTH,
 * increasing counter-clockwise through EAST — the circulation direction):
 * point(φ) = (R·sin φ, −R·cos φ), so φ=0 is the south node, φ=90 east,
 * φ=180 north, φ=270 west.
 */
function ringArc(R, a0deg, a1deg) {
  const pts = [];
  const steps = Math.round((a1deg - a0deg) / ARC_STEP_DEG);
  for (let i = 0; i <= steps; i++) {
    const a = ((a0deg + i * ARC_STEP_DEG) * Math.PI) / 180;
    pts.push([r2(R * Math.sin(a)), r2(-R * Math.cos(a))]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,     // output file name + LessonSpec.world.districtId
 *   label: string,          // human label (meta)
 *   ringRadiusM: number,    // ring centerline radius (14..30 — the drawn ring
 *                           //   lane is 8.125 m wide at the perceptual scale)
 *   arms: 4,                // radial arms (v1 ships the 4-arm cross)
 *   armLengthM: number,     // arm length from ring node to the outer end (>= 60)
 *   ringSpeedKmh: number,   // legal limit on the ring (20..30)
 *   armSpeedKmh: number,    // legal limit on the arms (30..50)
 * }} params
 */
export function buildMiniRoundaboutDistrict(params) {
  const errors = [];
  const { districtId, label, ringRadiusM, arms, armLengthM, ringSpeedKmh, armSpeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(ringRadiusM >= 14 && ringRadiusM <= 30)) errors.push(`ringRadiusM must be within 14..30 m, got ${ringRadiusM}`);
  if (arms !== 4) errors.push(`arms must be 4 (the v1 cross layout), got ${arms}`);
  if (!(armLengthM >= 60 && armLengthM <= 300)) errors.push(`armLengthM must be within 60..300 m, got ${armLengthM}`);
  if (!(ringSpeedKmh >= 20 && ringSpeedKmh <= 30)) errors.push(`ringSpeedKmh must be within 20..30, got ${ringSpeedKmh}`);
  if (!(armSpeedKmh >= 30 && armSpeedKmh <= 50)) errors.push(`armSpeedKmh must be within 30..50, got ${armSpeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_mini_roundabout params invalid:\n  - ${errors.join("\n  - ")}`);

  const R = ringRadiusM;
  const OUT = r2(R + armLengthM);
  const laneCenterM = r2(SCALED_LANE_W / 2); // arm right-lane center offset

  // -- Nodes: 4 ring joints + 4 arm outer ends.
  const NODES = {
    "rbm-n-s": [0, -R],
    "rbm-n-e": [R, 0],
    "rbm-n-n": [0, R],
    "rbm-n-w": [-R, 0],
    "rbm-n-s-out": [0, -OUT],
    "rbm-n-e-out": [OUT, 0],
    "rbm-n-n-out": [0, OUT],
    "rbm-n-w-out": [-OUT, 0],
  };

  const ringEdge = (id, from, to, a0, a1) => {
    const geometry = ringArc(R, a0, a1);
    // Arc endpoints must coincide with the node coordinates exactly.
    geometry[0] = [NODES[from][0], NODES[from][1]];
    geometry[geometry.length - 1] = [NODES[to][0], NODES[to][1]];
    return {
      id,
      from,
      to,
      class: "unclassified",
      name: "Кръгово движение",
      oneway: true, // ring flow is one-way, counter-clockwise (rb-1 law)
      roundabout: true,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: ringSpeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const armEdge = (id, from, to) => {
    const geometry = [
      [NODES[from][0], NODES[from][1]],
      [NODES[to][0], NODES[to][1]],
    ];
    return {
      id,
      from,
      to,
      class: "residential",
      name: "Подход към кръговото",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: armSpeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const EDGES = [
    // The closed CCW ring (s → e → n → w → s), rb-1 conventions.
    ringEdge("rbm-e-ring-se", "rbm-n-s", "rbm-n-e", 0, 90),
    ringEdge("rbm-e-ring-en", "rbm-n-e", "rbm-n-n", 90, 180),
    ringEdge("rbm-e-ring-nw", "rbm-n-n", "rbm-n-w", 180, 270),
    ringEdge("rbm-e-ring-ws", "rbm-n-w", "rbm-n-s", 270, 360),
    // Radial arms, authored outer-end → ring (the approach direction).
    armEdge("rbm-e-arm-s", "rbm-n-s-out", "rbm-n-s"),
    armEdge("rbm-e-arm-e", "rbm-n-e-out", "rbm-n-e"),
    armEdge("rbm-e-arm-n", "rbm-n-n-out", "rbm-n-n"),
    armEdge("rbm-e-arm-w", "rbm-n-w-out", "rbm-n-w"),
  ];
  const RING_EDGE_IDS = ["rbm-e-ring-se", "rbm-e-ring-en", "rbm-e-ring-nw", "rbm-e-ring-ws"];

  // -- Intersections: the 4 arm↔ring joints (degree 3, uncontrolled — the
  // stop-sign heuristic skips roundabout members; entry priority is the
  // runtime's circulatingConflict adjudication).
  const INTERSECTIONS = [
    { id: "rbm-n-s", x: 0, y: -R, degree: 3, signalized: false },
    { id: "rbm-n-e", x: R, y: 0, degree: 3, signalized: false },
    { id: "rbm-n-n", x: 0, y: R, degree: 3, signalized: false },
    { id: "rbm-n-w", x: -R, y: 0, degree: 3, signalized: false },
  ];

  const CROSSINGS = [];
  const ROUNDABOUTS = [
    // The rb-1-shaped registration the runtime + props builder consume.
    { id: "rbm-rb-1", x: 0, y: 0, radius: R, edgeIds: RING_EDGE_IDS },
  ];

  // -- Spawns: south-arm approach (the scenario entry) + a north-arm finish
  // reference past the ring exit.
  const SPAWN_POINTS = [
    {
      id: "rbm-spawn-south",
      x: laneCenterM,
      y: r2(-OUT + 15),
      heading: 0,
      edgeId: "rbm-e-arm-s",
      name: "Подход към кръговото (юг)",
    },
    {
      id: "rbm-spawn-finish",
      x: laneCenterM,
      y: r2(R + 40),
      heading: 0,
      edgeId: "rbm-e-arm-n",
      name: "Контролна точка — след кръговото (север)",
    },
  ];

  // -- One corner café SW of the ring (visual anchor, clear of every
  // carriageway: > halfRoad + sidewalk off both the west and south arms).
  const BUILDINGS = [
    {
      id: "rbm-b-cafe",
      height: 4,
      heightSource: "default",
      footprint: [
        [-R - 26, -R - 26],
        [-R - 16, -R - 26],
        [-R - 16, -R - 16],
        [-R - 26, -R - 16],
      ].map(([x, y]) => [r2(x), r2(y)]),
    },
  ];

  // -- Bounds + stats.
  const halfRoadM = SCALED_LANE_W;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x - halfRoadM);
      bounds.minY = Math.min(bounds.minY, y - halfRoadM);
      bounds.maxX = Math.max(bounds.maxX, x + halfRoadM);
      bounds.maxY = Math.max(bounds.maxY, y + halfRoadM);
    }
  }
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  bounds.minX = r2(bounds.minX);
  bounds.minY = r2(bounds.minY);
  bounds.maxX = r2(bounds.maxX);
  bounds.maxY = r2(bounds.maxY);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-roundabout",
      generator: "tools/maps/gen_mini_roundabout.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебно кръгово движение — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: armSpeedKmh,
        note: "Кръгово: пропусни движещите се в кръга (те са с предимство), излез с десен мигач.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the ring
       * truth. ScenarioSpecs pin the center/radius/entry by value and the
       * contract battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "roundabout",
        params: { ringRadiusM, arms, armLengthM, ringSpeedKmh, armSpeedKmh },
        center: { x: 0, y: 0 },
        ringNodeIds: ["rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
        ringEdgeIds: RING_EDGE_IDS,
        entryArm: "south",
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
  const edgeIds = new Set();
  for (const e of EDGES) {
    if (edgeIds.has(e.id)) post.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
  }
  // Ring closure: the 4 ring edges chain s → e → n → w → s, all oneway +
  // roundabout + single-lane (the rb-1 encoding the runtime/graph expect).
  const ringSeq = RING_EDGE_IDS.map((id) => EDGES.find((e) => e.id === id));
  for (let i = 0; i < ringSeq.length; i++) {
    const cur = ringSeq[i];
    const nxt = ringSeq[(i + 1) % ringSeq.length];
    if (cur.to !== nxt.from) post.push(`ring break: ${cur.id}.to (${cur.to}) != ${nxt.id}.from (${nxt.from})`);
    if (!cur.oneway || !cur.roundabout || cur.lanes !== 1) {
      post.push(`${cur.id}: ring edges must be oneway, roundabout, lanes 1`);
    }
    const quarterLen = (2 * Math.PI * R) / 4;
    if (Math.abs(cur.length - quarterLen) > quarterLen * 0.02) {
      post.push(`${cur.id}: quarter-arc length ${cur.length} deviates from ${r2(quarterLen)}`);
    }
    // Every ring vertex must sit on the ring radius (within rounding).
    for (const [x, y] of cur.geometry) {
      if (Math.abs(Math.hypot(x, y) - R) > 0.05) post.push(`${cur.id}: vertex (${x}, ${y}) off the ring radius`);
    }
  }
  // Every arm must reach a ring node.
  const ringNodeIds = new Set(["rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"]);
  for (const e of EDGES) {
    if (e.roundabout) continue;
    if (!ringNodeIds.has(e.to)) post.push(`${e.id}: arm must terminate on a ring node (to=${e.to})`);
  }
  const distToSegment = (x, y, [ax, ay], [bx, by]) => {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
  };
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) {
      post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
      continue;
    }
    let best = Infinity;
    for (let i = 0; i < host.geometry.length - 1; i++) {
      best = Math.min(best, distToSegment(s.x, s.y, host.geometry[i], host.geometry[i + 1]));
    }
    if (best > halfRoadM) post.push(`${s.id}: not on its edge's carriageway (${r2(best)} m off)`);
  }
  if (ROUNDABOUTS.length !== 1 || ROUNDABOUTS[0].edgeIds.length !== 4) post.push("roundabouts[] must register the 4 ring edges");
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_mini_roundabout self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// rb-mini-v1 instance — the sc-roundabout-entry product map (doc 76 §3):
// single-lane ring R=18 (the rb-1 scale), 4 arms, 90 m south approach.
// ---------------------------------------------------------------------------

const RBM_PARAMS = {
  districtId: "rb-mini-v1",
  label: "Учебно мини кръгово движение — еднолентов кръг с 4 рамена (сценарий RB)",
  ringRadiusM: 18,
  arms: 4,
  armLengthM: 90,
  ringSpeedKmh: 30,
  armSpeedKmh: 40,
};

const district = buildMiniRoundaboutDistrict(RBM_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const OUT_FILE = path.join(REPO_ROOT, "content", "world", `${RBM_PARAMS.districtId}.json`);
mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, out);

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== mini-roundabout build: ${RBM_PARAMS.districtId} ===`);
line("ring radius / arms", `${RBM_PARAMS.ringRadiusM} m / ${RBM_PARAMS.arms}`);
line("ring / arm speed", `${RBM_PARAMS.ringSpeedKmh} / ${RBM_PARAMS.armSpeedKmh} km/h`);
line("ring edges", district.roundabouts[0].edgeIds.join(", "));
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("intersections", `${district.meta.stats.intersections} (all uncontrolled ring joints)`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", OUT_FILE);
console.log("Validation OK.");
