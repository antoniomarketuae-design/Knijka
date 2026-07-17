/**
 * gen_pe_school.mjs — the SCHOOL-FRONT crossing micro-map (Scenario Studio,
 * doc 76 §3; doc 72 §6 family PE) → content/world/<districtId>.json (+ the
 * byte-identical publish to platform/public/world/).
 *
 * The gen_pe_crossings.mjs zebra-block FUSED with the gen_sp_transition.mjs
 * two-segment limit drop: a straight two-way street whose posted limit falls
 * 50 → 30 at a mid-block node (the school-zone entry), with the MARKED,
 * unsignalized zebra sitting deep INSIDE the 30 zone. Both halves of the
 * lesson therefore grade off shipped surfaces:
 *
 *   - the 30 zone is the zone EDGE's own `maxspeed` (runtime speedLimitAt →
 *     edgeRt.edge.maxspeed), so a boulevard-speed approach fires the speeding
 *     codes against 30, not against 50 (the SP-03 precedent);
 *   - the zebra is the CrossingZoneTracker's zone derived from crossings[],
 *     so the staged child group drives the PEDESTRIAN_* chain unchanged.
 *
 * The crossing sits `zoneCrossingM` past the transition so the ~35 m crossing
 * zone arms WHOLLY inside the 30 zone: that leaves a stretch of school zone
 * where speed alone is gradable (no pedestrian seen yet → no crossing code
 * can contaminate it) — the „бърз подход" demo's clean window.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pes-n-end (0, L)                    L = approachM + zoneCrossingM + runoutM
 *         │  run-out (still zone 30)
 *         ═  pes-x-1 (0, crossingY)       marked zebra (kind "marked",
 *         │                               signalized false); the patrol post
 *         ⌂  patrol post (-9.73, …)       stands on the WEST curb beside it
 *         │  ZONE segment — maxspeed 30, zone "school" (pes-e-zone)
 *     pes-n-mid (0, approachM)            the 50 → 30 school-zone entry
 *         │  APPROACH segment — maxspeed 50 (pes-e-approach)
 *     pes-spawn-approach (4.06, 15)
 *         │
 *     pes-n-start (0, 0)
 *
 * The mid node is a plain degree-2 vertex and NO edge outranks residential →
 * the stop-sign heuristic derives no stop line and no junction tracker there;
 * it is a limit change, not an intersection (gen_sp_transition's ruling).
 *
 * No signals, stop lines, junctions or roundabouts: the ONLY gradable faults
 * are the driver's own speed against the segment-local limit and the duty to
 * the people on the zebra. The patrol warden and the child group are LESSON
 * data (the ScenarioSpec's policeStop + pedestrianDartOut staged specs); the
 * map carries only the geometry they pin against — single truth in
 * meta.scenario.
 *
 * HONEST GAP (reported, not faked): the А19 „Деца" plate has no SignKind and
 * no GLB in the shipped kit, so the zone's visual anchor is the school block
 * + the automatic В26 entry post, not the А19 triangle. Render-only either
 * way — grading reads `maxspeed` and the crossing, never a sign placement.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pe_school.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/pe-school-districts.test.ts
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
/** L4 curb-start convention: half-carriageway + 0.4 curb + 1.2 stand-back. */
const CURB_STANDBACK_M = 1.6;
/** The crossing zone arms ~35 m out; the speed-only window needs room before it. */
const CROSSING_ZONE_M = 35;

const r2 = (v) => Math.round(v * 100) / 100;

function segLength(a, b) {
  return r2(Math.hypot(b[0] - a[0], b[1] - a[1]));
}

// ---------------------------------------------------------------------------
// The generator (two collinear segments + one zebra — the PE school micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,       // output file name + LessonSpec.world.districtId
 *   label: string,            // human label (meta)
 *   approachM: number,        // 50 km/h approach before the zone entry (100..400)
 *   zoneCrossingM: number,    // zone entry → zebra (>= 60: the 35 m zone + margin)
 *   runoutM: number,          // zebra → street end (>= 40)
 *   approachKmh: number,      // approach limit (must exceed zoneKmh; 40|50|60)
 *   zoneKmh: number,          // school-zone limit (30)
 * }} params
 */
export function buildPeSchoolStreet(params) {
  const errors = [];
  const { districtId, label, approachM, zoneCrossingM, runoutM, approachKmh, zoneKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 100 && approachM <= 400)) errors.push(`approachM must be within 100..400 m, got ${approachM}`);
  if (!(zoneCrossingM >= 60 && zoneCrossingM <= 400)) {
    errors.push(`zoneCrossingM must be within 60..400 m (the 35 m crossing zone must arm inside the 30 zone), got ${zoneCrossingM}`);
  }
  if (!(runoutM >= 40 && runoutM <= 200)) errors.push(`runoutM must be within 40..200 m, got ${runoutM}`);
  if (![40, 50, 60].includes(approachKmh)) errors.push(`approachKmh must be 40|50|60, got ${approachKmh}`);
  if (zoneKmh !== 30) errors.push(`zoneKmh must be 30 (the училищна зона archetype), got ${zoneKmh}`);
  if (approachKmh <= zoneKmh) errors.push(`approachKmh (${approachKmh}) must exceed zoneKmh (${zoneKmh})`);
  if (errors.length > 0) throw new Error(`gen_pe_school params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM + zoneCrossingM;
  const totalM = crossingY + runoutM;
  const zoneM = zoneCrossingM + runoutM;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0
  const curbX = r2(-(halfRoadM + CURB_STANDBACK_M)); // west curb (the PE convention)
  /** The warden stands just south of the zebra — clear of the dart path. */
  const patrolPost = { x: curbX, y: r2(crossingY - 4) };

  // -- Nodes / edges (the limit drop is a degree-2 collinear split).
  const NODES = {
    "pes-n-start": [0, 0],
    "pes-n-mid": [0, approachM],
    "pes-n-end": [0, totalM],
  };
  const approachGeom = [
    [0, 0],
    [0, approachM],
  ];
  const zoneGeom = [
    [0, approachM],
    [0, totalM],
  ];
  const EDGES = [
    {
      id: "pes-e-approach",
      from: "pes-n-start",
      to: "pes-n-mid",
      class: "residential",
      name: "Улица пред училището — подход преди зоната",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: approachKmh,
      maxspeedSource: "tag",
      length: segLength(approachGeom[0], approachGeom[1]),
      geometry: approachGeom,
    },
    {
      id: "pes-e-zone",
      from: "pes-n-mid",
      to: "pes-n-end",
      class: "residential",
      name: "Улица пред училището — зона 30 с пешеходна пътека",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: zoneKmh,
      maxspeedSource: "tag",
      // Additive legality tag (doc 72 N3) — the REDUCED limit is in `maxspeed`.
      zone: "school",
      length: segLength(zoneGeom[0], zoneGeom[1]),
      geometry: zoneGeom,
    },
  ];

  // -- Crossing: the single geometric truth (CrossingZoneTracker + the
  // markings builder + the ScenarioSpec all read exactly this). It hosts on
  // the ZONE edge — the zebra belongs to the school zone, not the approach.
  const CROSSINGS = [
    {
      id: "pes-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "pes-e-zone",
    },
  ];

  const INTERSECTIONS = []; // the mid node is a degree-2 limit change, not a junction
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "pes-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pes-e-approach",
      name: "Начало на отсечката — преди училищната зона",
    },
    {
      id: "pes-spawn-finish",
      x: laneCenterM,
      y: r2(totalM - 15),
      heading: 0,
      edgeId: "pes-e-zone",
      name: "Контролна точка — след пътеката",
    },
  ];

  // -- The school block west of the zebra (the zone's visual anchor, clear of
  // the carriageway + sidewalk: |x| > halfRoad + ~4 m).
  const BUILDINGS = [
    {
      id: "pes-b-school",
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 26)), r2(crossingY - 30)],
        [r2(-(halfRoadM + 8)), r2(crossingY - 30)],
        [r2(-(halfRoadM + 8)), r2(crossingY + 22)],
        [r2(-(halfRoadM + 26)), r2(crossingY + 22)],
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
      generator: "tools/maps/gen_pe_school.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица пред училище (зона 30 + пешеходна пътека) — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // Off-road / fallback default — the segments carry their own limits.
        maxspeedUrbanKmh: approachKmh,
        note: "Училищна зона: ограничението пада от 50 на 30 на средния възел; пред пътеката се кара с готовност за спиране.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the pinned
       * truths. The ScenarioSpec copies these BY VALUE and the contract
       * battery asserts the copies match this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings: 1, signalized: "no", approachM, zoneCrossingM, zoneKmh },
        primaryCrossingId: "pes-x-1",
        laneCenterRightM: laneCenterM,
        curbXWest: curbX,
        /** The 50 → 30 school-zone entry. */
        zoneEntryY: approachM,
        crossingY: r2(crossingY),
        /** Curb spot the ScenarioSpec's policeStop warden stands on. */
        patrolPost,
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
  // Self-validation (gen_pe_crossings + gen_sp_transition invariants fused)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const degree = new Map();
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(segLength(g0, gn) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: each segment is a two-way 1+1 street (lanes 2)`);
  }
  // The mid node must join exactly the two segments (degree 2 = collinear split).
  if ((degree.get("pes-n-mid") ?? 0) !== 2) post.push(`pes-n-mid must join both segments (degree 2)`);
  // No arterial edge exists → the runtime derives no stop line at the mid node.
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  if (Math.max(...EDGES.map((e) => RANK[e.class] ?? 2)) >= 4) {
    post.push(`an arterial edge would derive a stop line at the mid node`);
  }
  // The zone segment is the SLOW one and carries the school tag.
  const zoneEdge = EDGES.find((e) => e.id === "pes-e-zone");
  const approachEdge = EDGES.find((e) => e.id === "pes-e-approach");
  if (zoneEdge.maxspeed !== zoneKmh) post.push(`pes-e-zone must post ${zoneKmh}`);
  if (zoneEdge.zone !== "school") post.push(`pes-e-zone must carry the school legality tag`);
  if (approachEdge.maxspeed <= zoneEdge.maxspeed) post.push(`the approach must be the FASTER segment`);
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > totalM ? y - totalM : 0);
  for (const s of SPAWN_POINTS) {
    if (!EDGES.some((e) => e.id === s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  // The crossing must sit ON the centerline, INSIDE the 30 zone, with the whole
  // ~35 m crossing zone armed inside it (so the speed-only window is real) and
  // real run-out after it.
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.edgeId !== "pes-e-zone") post.push(`${c.id}: the zebra must host on the ZONE edge`);
    if (c.y <= approachM) post.push(`${c.id}: the zebra must sit inside the 30 zone (y > ${approachM})`);
    if (c.y - approachM < CROSSING_ZONE_M + 20) {
      post.push(`${c.id}: needs >= ${CROSSING_ZONE_M + 20} m of zone before it (the ~35 m crossing zone must arm inside the 30 zone, leaving a speed-only window)`);
    }
    if (c.y > totalM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
  }
  // The patrol post stands OFF the carriageway (it is scenery, never an obstacle).
  if (Math.abs(patrolPost.x) <= halfRoadM) post.push(`patrolPost must stand off the carriageway (|x| > ${halfRoadM})`);
  if (patrolPost.y <= approachM || patrolPost.y >= totalM) post.push(`patrolPost must stand inside the school zone`);
  // The school block must not overlap the carriageway + sidewalk.
  for (const bl of BUILDINGS) {
    for (const [x] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM + 4) post.push(`${bl.id}: footprint overlaps the street corridor`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pe_school self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (sc-pe-school-patrol — „Училищна пътека със стоп-палка")
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pe-school-v1",
    label: "Учебна улица — училищна пътека със стоп-палка (сценарий PE-школа)",
    approachM: 140,
    zoneCrossingM: 110,
    runoutM: 60,
    approachKmh: 50,
    zoneKmh: 30,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPeSchoolStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== pe-school build: ${params.districtId} ===`);
  line("approach / zone", `${params.approachM} m @ ${params.approachKmh} → ${district.meta.scenario.crossingY - params.approachM + params.runoutM} m @ ${params.zoneKmh}`);
  line("zone entry Y", `${district.meta.scenario.zoneEntryY} m`);
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("speed-only window", `y ${params.approachM}..${district.meta.scenario.crossingY - 35} (before the crossing zone arms)`);
  line("patrol post", `(${district.meta.scenario.patrolPost.x}, ${district.meta.scenario.patrolPost.y})`);
  line("street length", `${district.roads.edges.reduce((s, e) => s + e.length, 0)} m`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
