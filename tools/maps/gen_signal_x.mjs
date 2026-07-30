/**
 * gen_signal_x.mjs — parametric SIGNALIZED 4-WAY map archetype (Scenario
 * Studio, doc 76 §3) → content/world/<districtId>.json (+ byte-identical
 * publish to platform/public/world/).
 *
 * The SIGNALS-family generator, in the gen_parking_lot.mjs mold. The signal
 * itself is pure district-v1 convention: intersections[].signalized = true —
 * the runtime's SignalController clusters the single node (cluster id = the
 * node id, deterministic FNV-1a phase offset), buildStopLines derives one
 * trafficLight line per approach at the junction mouth, and the world
 * builder's props pass places the visible lamp heads on every incoming
 * approach. NOTHING here is hand-tuned — grading, paint and lamps all derive
 * from the one `signalized` flag. Contract battery:
 * platform/src/modules/sim/world/__tests__/sx-district.test.ts.
 *
 * Layout (local meters, x = east, y = north, origin at the junction node):
 *
 *                        sx-n-n
 *                           │       N–S road: secondary (the arterial the
 *   sx-n-w ────────────  sx-n-c ──────────── sx-n-e     signal serves — the
 *                           │       cluster's own axis-group derives "ns"
 *                        sx-n-s     from the dominant class, signals.ts)
 *
 * Arms are individually sized: staged oncoming actors need runway (the N1
 * sync holds an actor (playerEta + gapSec) × cruise metres before the node —
 * doc 72 JU-10), so the west arm of the committed instance is the longest.
 *
 * No crossings by design (doc 76 §3 "road + markings + spawn + finish"):
 * a zebra would join the signal cluster and add pedestrian grading noise to
 * what is a pure signal-discipline drill.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_signal_x.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curbLaneOffsetM, toCurbLane } from "./lib/lane.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
 *   districtId: string,        // output file name + LessonSpec.world.districtId
 *   label: string,             // human label (meta)
 *   armNorthM: number,         // arm lengths from the node (60..400 each)
 *   armSouthM: number,
 *   armEastM: number,
 *   armWestM: number,
 *   nsClass: "secondary"|"tertiary"|"residential",  // N–S road class
 *   ewClass: "secondary"|"tertiary"|"residential",  // E–W road class
 *   nsMaxKmh: number,          // 30|40|50
 *   ewMaxKmh: number,          // 30|40|50
 * }} params
 */
export function buildSignalXDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    armNorthM,
    armSouthM,
    armEastM,
    armWestM,
    nsClass,
    ewClass,
    nsMaxKmh,
    ewMaxKmh,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  for (const [k, v] of [
    ["armNorthM", armNorthM],
    ["armSouthM", armSouthM],
    ["armEastM", armEastM],
    ["armWestM", armWestM],
  ]) {
    if (!(v >= 60 && v <= 400)) errors.push(`${k} must be within 60..400 m, got ${v}`);
  }
  const CLASSES = ["secondary", "tertiary", "residential"];
  if (!CLASSES.includes(nsClass)) errors.push(`nsClass must be ${CLASSES.join("|")}, got ${nsClass}`);
  if (!CLASSES.includes(ewClass)) errors.push(`ewClass must be ${CLASSES.join("|")}, got ${ewClass}`);
  if (![30, 40, 50].includes(nsMaxKmh)) errors.push(`nsMaxKmh must be 30|40|50, got ${nsMaxKmh}`);
  if (![30, 40, 50].includes(ewMaxKmh)) errors.push(`ewMaxKmh must be 30|40|50, got ${ewMaxKmh}`);
  // The cluster's own axis-group falls back to the DOMINANT incident class
  // (signals.ts nodeGroup, single-node cluster). Equal classes would leave
  // the pick to edge-id tie-breaking — legal but opaque; demand a dominant
  // axis so the derived group is self-evident from the params.
  const RANK = { secondary: 4, tertiary: 3, residential: 2 };
  if (RANK[nsClass] === RANK[ewClass]) {
    errors.push(`nsClass and ewClass must differ in rank (dominant axis = the cluster's own group)`);
  }
  if (errors.length > 0) throw new Error(`gen_signal_x params invalid:\n  - ${errors.join("\n  - ")}`);

  const NODES = {
    "sx-n-n": [0, armNorthM],
    "sx-n-s": [0, -armSouthM],
    "sx-n-e": [armEastM, 0],
    "sx-n-w": [-armWestM, 0],
    "sx-n-c": [0, 0],
  };

  const edge = (id, from, to, cls, maxspeed, name) => {
    const geometry = [
      [r2(NODES[from][0]), r2(NODES[from][1])],
      [r2(NODES[to][0]), r2(NODES[to][1])],
    ];
    return {
      id,
      from,
      to,
      class: cls,
      name,
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const EDGES = [
    edge("sx-e-s", "sx-n-s", "sx-n-c", nsClass, nsMaxKmh, "Булевард — южен подход"),
    edge("sx-e-n", "sx-n-c", "sx-n-n", nsClass, nsMaxKmh, "Булевард — северен изход"),
    edge("sx-e-w", "sx-n-w", "sx-n-c", ewClass, ewMaxKmh, "Пресечна улица — запад"),
    edge("sx-e-e", "sx-n-c", "sx-n-e", ewClass, ewMaxKmh, "Пресечна улица — изток"),
  ];

  const INTERSECTIONS = [
    // THE signal: one flag, everything else derives (see the header).
    { id: "sx-n-c", x: 0, y: 0, degree: 4, signalized: true },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Visual anchors on two quadrants, clear of carriageway + sidewalk
  // (max half-width 12.13 m + ~4 m): |x|,|y| >= 26.
  const BUILDINGS = [
    {
      id: "sx-b-sw",
      height: 7,
      heightSource: "default",
      footprint: [
        [-44, -44],
        [-27, -44],
        [-27, -27],
        [-44, -27],
      ],
    },
    {
      id: "sx-b-ne",
      height: 5,
      heightSource: "default",
      footprint: [
        [27, 27],
        [42, 27],
        [42, 42],
        [27, 42],
      ],
    },
  ];

  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: "sx-spawn-south",
        x: 0,
        y: r2(-(armSouthM - 15)),
        heading: 0,
        edgeId: "sx-e-s",
        name: "Южен подход към светофара",
      },
      {
        id: "sx-spawn-east",
        x: r2(armEastM - 15),
        y: 0,
        heading: 270,
        edgeId: "sx-e-e",
        name: "Източен подход към светофара",
      },
      {
        id: "sx-spawn-west",
        x: r2(-(armWestM - 15)),
        y: 0,
        heading: 90,
        edgeId: "sx-e-w",
        name: "Западен подход към светофара",
      },
    ],
    EDGES,
  );

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
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

  const totalKm = r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-junction",
      generator: "tools/maps/gen_signal_x.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно светофарно кръстовище — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(nsMaxKmh, ewMaxKmh),
        note: "Учебно светофарно кръстовище: ограниченията идват от таговете на улиците.",
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
      scenario: {
        archetype: "x-junction",
        params: {
          armNorthM,
          armSouthM,
          armEastM,
          armWestM,
          nsClass,
          ewClass,
          nsMaxKmh,
          ewMaxKmh,
        },
        junctionNodeId: "sx-n-c",
        /** Derivation truth the battery asserts: one single-node cluster
         *  whose own axis-group is the dominant class's axis. */
        expectedControl: "trafficLight",
        expectedClusterGroup: RANK[nsClass] > RANK[ewClass] ? "ns" : "ew",
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
  // Self-validation (the shared generator invariants)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeIds = new Set();
  const degree = new Map();
  for (const e of EDGES) {
    if (edgeIds.has(e.id)) post.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== r2(NODES[e.from][0]) || g0[1] !== r2(NODES[e.from][1])) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== r2(NODES[e.to][0]) || gn[1] !== r2(NODES[e.to][1])) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
  }
  const distToEdge = (host, x, y) => {
    let best = Infinity;
    const g = host.geometry;
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
  };
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    // doc 87 T2: "on its edge" used to mean "within a metre of its CENTRELINE",
    // i.e. the invariant enforced the defect it was supposed to catch.
    else if (Math.abs(distToEdge(host, s.x, s.y) - curbLaneOffsetM(host.lanes, host.oneway)) > 1)
      post.push(`${s.id}: not in its edge's curb lane`);
  }
  // Routable connectivity: one component.
  {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    for (const e of EDGES) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const start = EDGES[0].from;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const v = queue.pop();
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
    }
    if (seen.size !== nodeIds.size) post.push("routable network split");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_signal_x self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (S2-B: JU-05/06/10 host — signal response + left turn)
// ---------------------------------------------------------------------------

const SX_PARAMS = {
  districtId: "sx-v1",
  label: "Учебно светофарно кръстовище (сценарии JU-05/JU-06/JU-10)",
  armNorthM: 90,
  armSouthM: 120,
  armEastM: 120,
  // Longest arm: the N1 oncoming sync stages the actor up to
  // (playerEta + gapSec) × cruise ≈ 150 m before the node (doc 72 JU-10).
  armWestM: 170,
  nsClass: "secondary",
  ewClass: "residential",
  nsMaxKmh: 50,
  ewMaxKmh: 40,
};

const district = buildSignalXDistrict(SX_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${SX_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${SX_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== signal-x build: ${SX_PARAMS.districtId} ===`);
line("signal node / group", `${district.meta.scenario.junctionNodeId} (${district.meta.scenario.expectedClusterGroup})`);
line("arms N/S/E/W", `${SX_PARAMS.armNorthM}/${SX_PARAMS.armSouthM}/${SX_PARAMS.armEastM}/${SX_PARAMS.armWestM} m`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
