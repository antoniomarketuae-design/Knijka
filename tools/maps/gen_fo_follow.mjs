/**
 * gen_fo_follow.mjs — the S3 FOLLOWING & GAP-MANAGEMENT micro-maps (Scenario
 * Studio, doc 76 §3; doc 72 §9 archetypes FO-01 / FO-02). Same straight-street
 * shape as gen_sp_speed.mjs — one plain two-way street (ONE marked lane per
 * direction), a posted limit and NOTHING else — the cleanest possible stage
 * for a pure following fault: a lead car paces AHEAD in the driver's own lane
 * and the ONLY thing the rule engine can grade is the driver's gap and reaction.
 *
 *   - fo-follow-v1  „Дистанция на следване"  (FO-01, steady-state tailgating)
 *   - fo-brake-v1   „Внезапно спиране“        (FO-02, lead-car brake slam)
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime — speedLimitAt resolves the edge's maxspeed everywhere) and
 * buildLaneGraph/createTrafficSystem (traffic — the staged lead car drives the
 * northbound lane the player follows) already consume — the gen_sp_speed.mjs
 * mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/fo-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     fo-n-end (0, L)                   L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06 — the lead car
 *         │   paces AHEAD of the player in exactly this lane
 *         │
 *     fo-spawn-approach (4.06, 15)
 *         │
 *     fo-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions, no crossings — the street teaches
 * following distance and emergency braking, nothing else (doc 76 §3). Ambient
 * traffic is authored to ZERO by every drive; the lead car is the ONE staged
 * actor, so the ONLY thing the rule engine can grade is the driver's own gap /
 * reaction against the lead.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_fo_follow.mjs
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
/** constants.PARKING_LANE_WIDTH_M — the curbside band, per side, m. */
const PARKING_LANE_WIDTH_M = 4.0;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (one straight two-way street — the S3 FO micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 * }} params
 */
export function buildFoFollowStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_fo_follow params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; no junctions).
  const NODES = {
    "fo-n-start": [0, 0],
    "fo-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "fo-e-street",
      from: "fo-n-start",
      to: "fo-n-end",
      class: "residential",
      name: "Права улица с движение в колона",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      // FR-21 (car half) — see the note above the INSTANCES table.
      parkingBand: true,
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const CROSSINGS = []; // a pure following street carries no crossing
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "fo-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "fo-e-street",
      name: "Начало на отсечката",
    },
    {
      id: "fo-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "fo-e-street",
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- One office block west of the street (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  // The kerb is the travel lanes PLUS the declared curbside band (FR-21), and
  // the frontage stands back from THAT, not from the travel lanes.
  const kerbM = r2(halfRoadM + PARKING_LANE_WIDTH_M);
  const BUILDINGS = [
    {
      id: "fo-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(kerbM + 16)), 150],
        [r2(-(kerbM + 4)), 150],
        [r2(-(kerbM + 4)), 168],
        [r2(-(kerbM + 16)), 168],
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
  bounds.minX = Math.min(bounds.minX, -kerbM - 6);
  bounds.maxX = Math.max(bounds.maxX, kerbM + 6);
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
      generator: "tools/maps/gen_fo_follow.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна права улица за движение в колона — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: дистанцията до предния се държи в секунди (2 при сухо), а не в метри на око.",
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
    if (s.edgeId !== "fo-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_fo_follow self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The two committed instances (S3 FO batch 3)
// ---------------------------------------------------------------------------

/**
 * FR-21, THE CAR HALF — why this street declares its kerbside band.
 *
 * HIS SENTENCE, four lessons running: „the Pedestrian … goes trough a car which
 * is standing on the sidewalk". The cause is a set mismatch, not a bug in any
 * one map: `traffic/TrafficLayer.PARK_CLASSES` (which parks the row) contains
 * `residential`, while `world/builders/constants.PARKING_LANE_CLASSES` (which
 * DRAWS the 4 m band the row is seated in the middle of) does not. On a
 * residential street the pass therefore seats every body at
 * `travelHalf + 2.0 m` — two metres PAST the kerb, i.e. in the middle of the
 * 3.5 m pavement, at road level, sunk 0.12 m into the footway it stands on.
 *
 * `parkingBand: true` says: this street really does have kerbside parking.
 * The world draws the band, the KERB MOVES OUT FROM UNDER THE ROW, and not one
 * body moves — `travelHalf + 2.0` IS the band's centre line. The travel lanes
 * are untouched, so the right-lane centre stays at x = 4.06 and every committed
 * trace on this map still drives a lane centre. Measured before the change: the
 * nearest authored frontage on these maps stands at |x| = 16.02–16.13 m and the
 * widened pavement's back edge lands at 15.975 m, so the band fits with no
 * building moved.
 *
 * `parkingBand: false` is the other legal answer — a street with no kerbside
 * parking at all, where the pass places nothing.
 */
const INSTANCES = [
  {
    districtId: "fo-follow-v1",
    label: "Учебна улица — дистанция на следване (сценарий FO-01)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
  {
    districtId: "fo-brake-v1",
    label: "Учебна улица — внезапно спиране на предния (сценарий FO-02)",
    lengthM: 420,
    maxspeedKmh: 50,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildFoFollowStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== fo-follow build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
