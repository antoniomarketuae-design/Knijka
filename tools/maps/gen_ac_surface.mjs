/**
 * gen_ac_surface.mjs — the SURFACE-PATCH micro-maps (the AQUAPLANE + ICE
 * slice; Scenario Studio doc 76 §3; doc 72 §13 AC-07-full standing-water
 * float / AC-08 ice band). The exact straight-street shape of
 * gen_ac_vp_streets.mjs: ONE plain two-way street (one marked lane per
 * direction) carrying a posted limit and NOTHING else — no crossing, no
 * junction, no signal, no sign — PLUS one authored surface zone span:
 *
 *   - ac-aqua-v1  „Аквапланинг"   (AC-07-full): a 520 m extra-urban 90 road
 *                 with a `waterPatch` span at [240, 280] — patchGripFactor
 *                 0.15, aquaplaneAboveKmh 65 (tuning.AQUAPLANE_* — the
 *                 constants stay the documented truth; the battery asserts
 *                 the copies match);
 *   - ac-ice-v1   „Лед по моста"  (AC-08 ice band): a 360 m urban 50 street
 *                 whose exposed "bridge" span [210, 300] carries an
 *                 `icePatch` — patchGripFactor 0.15, constant at any speed.
 *
 * The spans are consumed by the PHYSICS RIG (runtime/surface.ts →
 * VehicleRig → VehicleSim.setSurfaceGripFactor), NOT by the rule-engine
 * tick — worldRuntime ignores the kinds (unknown-kind tolerance), so these
 * maps add NO grading channel: the physical outcome (a blown stop objective,
 * a collision demo, a drift over the осева) is graded by shipped machinery.
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime) and buildLaneGraph/createTrafficSystem (traffic) already consume.
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * ac-surface-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     <p>-n-end (0, L)                    L = lengthM
 *         │
 *         ▓▓▓  the surface span [fromM, toM] (full carriageway width)
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06
 *         │
 *     <p>-spawn-approach (4.06, 15)
 *         │
 *     <p>-n-start (0, 0)
 *
 * Ambient traffic is authored to ZERO by every drive (seed 7). Deterministic:
 * same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ac_surface.mjs
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
// The generator (one straight two-way street + ONE surface zone span)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   idPrefix: string,     // node/edge/spawn id prefix (kebab-case)
 *   label: string,        // human label (meta)
 *   nameBg: string,       // street display name (edge.name)
 *   roadClass: string,    // OSM-style class ("residential" | "unclassified")
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 *   patch: {
 *     kind: "waterPatch"|"icePatch",
 *     fromM: number, toM: number,
 *     patchGripFactor: number,       // tuning.*_PATCH_GRIP_FACTOR copy
 *     aquaplaneAboveKmh?: number,    // waterPatch only (tuning copy)
 *     signRef: string,               // provenance ("А15" — Опасност от хлъзгане)
 *     noteBg: string,                // meta provenance note
 *   },
 * }} params
 */
export function buildSurfaceStreet(params) {
  const errors = [];
  const { districtId, idPrefix, label, nameBg, roadClass, lengthM, maxspeedKmh, patch } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9-]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!["residential", "unclassified"].includes(roadClass)) errors.push(`roadClass "${roadClass}" must be residential|unclassified`);
  if (!patch || !["waterPatch", "icePatch"].includes(patch.kind)) {
    errors.push(`patch.kind must be waterPatch|icePatch`);
  } else {
    if (!(patch.fromM >= 30 && patch.fromM < patch.toM && patch.toM <= lengthM - 30)) {
      errors.push(`patch span [${patch.fromM}, ${patch.toM}] must satisfy 30 <= from < to <= length-30`);
    }
    if (!(patch.patchGripFactor > 0 && patch.patchGripFactor < 1)) {
      errors.push(`patch.patchGripFactor must be in (0, 1), got ${patch.patchGripFactor}`);
    }
    if (patch.kind === "waterPatch" && !(patch.aquaplaneAboveKmh > 0)) {
      errors.push(`waterPatch requires aquaplaneAboveKmh > 0`);
    }
    if (patch.kind === "icePatch" && patch.aquaplaneAboveKmh !== undefined) {
      errors.push(`icePatch must NOT carry aquaplaneAboveKmh (ice bites at any speed)`);
    }
  }
  if (errors.length > 0) throw new Error(`gen_ac_surface params invalid:\n  - ${errors.join("\n  - ")}`);

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
      class: roadClass,
      name: nameBg,
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
  const CROSSINGS = []; // a pure surface drill carries no crossing
  const ROUNDABOUTS = [];

  // -- The authored surface span (the reason this generator exists).
  const ZONES = [
    {
      id: `${idPrefix}-z-${patch.kind === "waterPatch" ? "water" : "ice"}`,
      kind: patch.kind,
      edgeId: EDGE_ID,
      fromM: patch.fromM,
      toM: patch.toM,
      signRef: patch.signRef,
      patchGripFactor: patch.patchGripFactor,
      ...(patch.kind === "waterPatch" ? { aquaplaneAboveKmh: patch.aquaplaneAboveKmh } : {}),
    },
  ];

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

  // -- One low block west of the street (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), 110],
        [r2(-(halfRoadM + 8)), 110],
        [r2(-(halfRoadM + 8)), 128],
        [r2(-(halfRoadM + 20)), 128],
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
      generator: "tools/maps/gen_ac_surface.mjs",
      boundsLocalMeters: bounds,
      // Zone layer marker (ADR-006 stage 2a version contract): new vocabulary,
      // same shape — zonesVersion stays 1.
      zonesVersion: 1,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна права улица с участък с влошено сцепление — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: patch.noteBg,
      },
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
        zones: ZONES.length,
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
    zones: ZONES,
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
  for (const z of ZONES) {
    if (z.edgeId !== EDGE_ID) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span outside the edge`);
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
    throw new Error(`gen_ac_surface self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The two committed instances (the AQUAPLANE + ICE batch)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ac-aqua-v1",
    idPrefix: "ac-aqua",
    label: "Учебен извънграден път — аквапланинг върху стояща вода (сценарий AC-07)",
    nameBg: "Прав извънградски път със стояща вода на платното",
    roadClass: "unclassified",
    lengthM: 520,
    maxspeedKmh: 90,
    patch: {
      kind: "waterPatch",
      fromM: 240,
      toM: 280,
      // COPIES of tuning.AQUAPLANE_PATCH_GRIP_FACTOR / AQUAPLANE_ABOVE_KMH —
      // the battery asserts these match the constants (the LANE_X discipline).
      patchGripFactor: 0.15,
      aquaplaneAboveKmh: 65,
      signRef: "А15",
      noteBg:
        "Прав извънградски път (90 км/ч): при [240, 280] м платното е покрито със стояща вода — над ~65 км/ч гумите изплуват (аквапланинг), под тази скорост сцеплението се връща.",
    },
  },
  {
    districtId: "ac-ice-v1",
    idPrefix: "ac-ice",
    label: "Учебна улица — лед по моста (сценарий AC-08)",
    nameBg: "Права улица с заледен открит участък",
    roadClass: "residential",
    lengthM: 360,
    maxspeedKmh: 50,
    patch: {
      kind: "icePatch",
      fromM: 210,
      toM: 300,
      // COPY of tuning.ICE_PATCH_GRIP_FACTOR — battery-pinned.
      patchGripFactor: 0.15,
      signRef: "А15",
      noteBg:
        "Права улица (50 км/ч): откритият „мост“ при [210, 300] м е заледен — сцеплението там е ~15% от сухото при всяка скорост; знакът А15 „Опасност от хлъзгане“ живее в разказа на урока.",
    },
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildSurfaceStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== ac-surface build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("patch", `${params.patch.kind} @ [${params.patch.fromM}, ${params.patch.toM}] grip ${params.patch.patchGripFactor}`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
