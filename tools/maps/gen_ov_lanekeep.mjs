/**
 * gen_ov_lanekeep.mjs — the OV lane-keeping micro-map (Scenario Studio, doc 76
 * §3; doc 72 §10 archetypes OV-12 „Возене по линията / Lane straddling" and
 * OV-04 „Настъпване на осевата линия / Center-line touch"). ONE two-way street
 * with a SINGLE marked lane per direction — since the founder R3 redesign
 * (doc 62 #46: „hold W to win… a drill where no mistake is POSSIBLE teaches
 * nothing") the street is an S-CURVE, not a straight: the centerline sways
 * ±swayM east/west along the run, so holding the middle of the lane takes
 * ACTUAL steering with a direction reversal mid-route. Cutting the corner
 * rides the осева (CENTER_LINE_TOUCHED); letting the car run wide rides the
 * curb edge (POOR_LANE_KEEPING) — the two classic curve errors the drill now
 * makes physically possible.
 *
 * The exact district-v1 shape buildWorldGeometry (world), createWorldRuntime
 * (runtime — laneId 0 / laneCount 1 / oneway=false, so laneOffsetM drives the
 * lane-keeping + center-line detectors; the Locator handles polyline edges —
 * the rural-curve precedent) and buildLaneGraph/createTrafficSystem (traffic)
 * already consume. Contract battery:
 * platform/src/modules/sim/world/__tests__/ov-lane-district.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north, centerline
 * x = swayM · sin(2π · y / lengthM)):
 *
 *     ov-ln-n-end (0, L)                  L = lengthM
 *         │      ← west apex at y = 3L/4 (centerline x = −swayM)
 *        ／   1 lane per direction; lane center 4.06 m right of the centerline
 *         │      ← east apex at y = L/4 (centerline x = +swayM)
 *     ov-ln-spawn-approach (lane center @ y = 15)
 *         │
 *     ov-ln-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions, no crossings — the street teaches
 * holding the middle of your lane (чл. 15), nothing else (doc 76 §3). Ambient
 * traffic is authored to ZERO by every drive, so the ONLY thing the rule engine
 * can grade is the driver's own lateral position in the lane.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_lanekeep.mjs
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
// The generator (one S-curved two-way street — the OV lane-keeping map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // street run along y (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 *   swayM: number,        // S-curve amplitude, m east/west (6..20)
 * }} params
 */
export function buildOvLaneKeepStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh, swayM } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!(swayM >= 6 && swayM <= 20)) errors.push(`swayM must be within 6..20 m, got ${swayM}`);
  if (errors.length > 0) throw new Error(`gen_ov_lanekeep params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from the centerline

  // The S-curve centerline + its unit tangent/right-normal (analytic).
  const centerX = (y) => swayM * Math.sin((2 * Math.PI * y) / lengthM);
  const slope = (y) => swayM * ((2 * Math.PI) / lengthM) * Math.cos((2 * Math.PI * y) / lengthM);
  /** Point `offsetM` right of the centerline (driver's own lane band). */
  const offsetPoint = (y, offsetM) => {
    const dx = slope(y);
    const n = Math.hypot(dx, 1); // tangent (dx, 1) normalized
    // perpRight of (dx, 1)/n = (1, -dx)/n
    return [r2(centerX(y) + (offsetM * 1) / n), r2(y + (offsetM * -dx) / n)];
  };
  /** District heading (deg, 0 = north, cw) of the forward tangent at y. */
  const headingDeg = (y) => r2((Math.atan2(slope(y), 1) * 180) / Math.PI);

  // -- Nodes / edge (one S-curved street; no junctions). The sine closes at
  // x = 0 on both ends, so the nodes stay on the axis.
  const NODES = {
    "ov-ln-n-start": [0, 0],
    "ov-ln-n-end": [0, lengthM],
  };
  const SAMPLE_STEP_M = 7.5;
  const geometry = [];
  for (let y = 0; y < lengthM; y += SAMPLE_STEP_M) geometry.push([r2(centerX(y)), r2(y)]);
  geometry.push([0, lengthM]);
  const EDGES = [
    {
      id: "ov-ln-street",
      from: "ov-ln-n-start",
      to: "ov-ln-n-end",
      class: "residential",
      name: "Улица с S-извивка и една лента в посока",
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
  const CROSSINGS = []; // a pure lane-keeping street carries no crossing
  const ROUNDABOUTS = [];

  // -- Spawns: approach start + finish reference, ON the curved lane center.
  const spawnA = offsetPoint(15, laneCenterM);
  const spawnB = offsetPoint(lengthM - 15, laneCenterM);
  const SPAWN_POINTS = [
    {
      id: "ov-ln-spawn-approach",
      x: spawnA[0],
      y: spawnA[1],
      heading: headingDeg(15),
      edgeId: "ov-ln-street",
      name: "Начало на отсечката",
    },
    {
      id: "ov-ln-spawn-finish",
      x: spawnB[0],
      y: spawnB[1],
      heading: headingDeg(lengthM - 15),
      edgeId: "ov-ln-street",
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- One office block west of the street (visual anchor, clear of the
  // carriageway + sidewalk at every sway: |x| > sway + halfRoad + ~4 m).
  const BUILDINGS = [
    {
      id: "ov-ln-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(swayM + halfRoadM + 20)), 150],
        [r2(-(swayM + halfRoadM + 8)), 150],
        [r2(-(swayM + halfRoadM + 8)), 168],
        [r2(-(swayM + halfRoadM + 20)), 168],
      ],
    },
  ];

  // -- The graded gates (Scenario Studio L7 copy law): lane-center points at
  // the two sway apexes (tangent exactly north there) + a finish point. The
  // ScenarioSpec pins these BY VALUE and the battery asserts the copies.
  const GATES = {
    eastApex: { x: r2(swayM + laneCenterM), y: r2(lengthM / 4) },
    westApex: { x: r2(-swayM + laneCenterM), y: r2((3 * lengthM) / 4) },
    finish: (() => {
      const p = offsetPoint(lengthM - 15, laneCenterM);
      return { x: p[0], y: p[1] };
    })(),
  };

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
  bounds.minX = Math.min(bounds.minX, -(swayM + halfRoadM + 6));
  bounds.maxX = Math.max(bounds.maxX, swayM + halfRoadM + 6);
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
      generator: "tools/maps/gen_ov_lanekeep.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица с S-извивка и една лента в посока — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Улица с S-извивка: дръж колата в средата на своята лента — не срязвай завоя през осевата и не се оставяй да те изнесе към бордюра.",
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
       * truth. ScenarioSpecs pin the lane-center OFFSET and the apex gates by
       * value and the contract battery asserts the copies match this file.
       */
      scenario: {
        archetype: "s-curve-street",
        params: { lengthM, maxspeedKmh, swayM },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
        gates: GATES,
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
    // The curve must stay gentle enough for street-speed lane keeping: the
    // steepest tangent (at the ends / midpoint) under ~20° off north.
    const maxSlope = swayM * ((2 * Math.PI) / lengthM);
    if (maxSlope > Math.tan((20 * Math.PI) / 180)) post.push(`${e.id}: S-curve too sharp (max slope ${maxSlope.toFixed(3)})`);
  }
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "ov-ln-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (s.y < 0 || s.y > lengthM || Math.abs(s.x - centerX(s.y)) > halfRoadM) {
      post.push(`${s.id}: not on the carriageway`);
    }
  }
  // Both graded apex gates must sit inside the northbound lane band.
  for (const [name, g] of Object.entries(GATES)) {
    const lateral = Math.abs(g.x - centerX(g.y));
    if (!(lateral > 0 && lateral < halfRoadM)) post.push(`gate ${name}: off the northbound bank (lateral ${lateral.toFixed(2)})`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_lanekeep self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// ov-lane-v1 instance — the sc-ov-lane-keeping product map (doc 76 §3; founder
// R3 doc 62 #46 redesign): 300 m of S-curved 1+1 street at the urban 50, sway
// ±14 m (apex radius ≈ 160 m — the steering is real, the speed domain is not).
// ---------------------------------------------------------------------------

const LN_PARAMS = {
  districtId: "ov-lane-v1",
  label: "Учебна улица с S-извивка — движение в средата на лентата (сценарий OV-12/OV-04)",
  lengthM: 300,
  maxspeedKmh: 50,
  swayM: 14,
};

const district = buildOvLaneKeepStreet(LN_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${LN_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${LN_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== ov-lanekeep build: ${LN_PARAMS.districtId} ===`);
line("run / limit / sway", `${LN_PARAMS.lengthM} m / ${LN_PARAMS.maxspeedKmh} km/h / ±${LN_PARAMS.swayM} m`);
line("edge length", `${district.roads.edges[0].length} m`);
line("right-lane offset", `${district.meta.scenario.laneCenterRightM} m right of the centerline`);
line("gates (E / W / fin)", JSON.stringify(district.meta.scenario.gates));
line("spawns", district.spawnPoints.map((s) => `${s.id}@(${s.x}, ${s.y})`).join(", "));
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
