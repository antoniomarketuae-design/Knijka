/**
 * gen_sp_speed.mjs — the S3 SPEED-MANAGEMENT micro-maps (Scenario Studio,
 * doc 76 §3; doc 72 §8 archetypes SP-01 / SP-02 / SP-04). Same straight-street
 * shape as gen_pe_crossings.mjs but with NO crossing at all: one plain two-way
 * street (ONE marked lane per direction) carrying a posted limit and NOTHING
 * else — the cleanest possible stage for a pure overspeed fault. Each archetype
 * gets a purpose-built street so its ScenarioSpec pins its own length + limit:
 *
 *   - sp-creep-v1   „Пълзящо превишаване"      (SP-01, creeping over the limit)
 *   - sp-danger-v1  „Над +10 км/ч"             (SP-02, dangerous speeding)
 *   - sp-rain-v1    „Скорост в дъжд"           (SP-04, rain speed discipline ×N)
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime — speedLimitAt resolves the edge's maxspeed everywhere) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_pe_crossings.mjs / gen_two_lane_road.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/sp-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     sp-n-end (0, L)                   L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06
 *         │
 *     sp-spawn-approach (4.06, 15)
 *         │
 *     sp-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions, no crossings — the street teaches
 * speed discipline, nothing else (doc 76 §3). Ambient traffic is authored to
 * ZERO by every drive, so the ONLY thing the rule engine can grade is the
 * driver's own speed against the posted limit / the conditions envelope.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_sp_speed.mjs
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
// The generator (one straight two-way street — the S3 SP micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 *   school?: boolean,     // author the УЧИЛИЩЕ building (founder item 61)
 * }} params
 */
export function buildSpSpeedStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_sp_speed params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; no junctions).
  const NODES = {
    "sp-n-start": [0, 0],
    "sp-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "sp-e-street",
      from: "sp-n-start",
      to: "sp-n-end",
      class: "residential",
      name: "Права улица с ограничение на скоростта",
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
  const CROSSINGS = []; // a pure speed street carries no crossing
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "sp-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "sp-e-street",
      name: "Начало на отсечката",
    },
    {
      id: "sp-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "sp-e-street",
      name: "Контролна точка — край на отсечката",
    },
  ];

  // -- One office block west of the street (visual anchor, clear of the
  // carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const BUILDINGS = [
    {
      id: "sp-b-block",
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

  // -- THE SCHOOL (founder register item 61).
  //
  // He drove „Зона 30 — училище и жилищен квартал" and wrote: „I see only
  // Normal Buildings living/office building no actual school when the question
  // states there should be School … either build schools and put and name them
  // school, or find some solutions." The street's whole justification for a 30
  // limit was a number on a plate; the building the copy named did not exist.
  //
  // `kind: "school"` is a district-v1 building kind (world/types.ts). It drives
  // three world passes and NOTHING in grading: the facade prism paints it in
  // the school palette, builders/schools.ts hangs the «УЧИЛИЩЕ» name board and
  // the yard railing on its frontage, and the sign pass posts А19 „Деца" 55 m
  // ahead of it in BOTH directions.
  //
  // GEOMETRY. 44 × 16 m — a real Bulgarian училище footprint, four times the
  // block above and unmistakably not a жилищен блок — set at y ∈ [196, 240],
  // i.e. straddling the drill's own control zone at y = 180 and comfortably
  // before its finish gate at y = 330, so the school is in the windscreen for
  // the whole graded stretch instead of flashing past. WEST side, its long
  // wall square to the street. `heightSource: "levels"` with 12.6 m = three
  // storeys + parapet, so resolveBuildingHeightM trusts the number instead of
  // hashing it into the 15–25 m residential jitter.
  //
  // SIDE. EAST — the driver's RIGHT, because he drives north in the right lane
  // (x = +4.06). A school across the oncoming lane is a school he glances at;
  // a school on his own kerb is one whose gate, railing and children are in
  // the near half of the windscreen, which is the whole point of showing it.
  // The А19 posts derive onto the same side by construction (props.ts places
  // a warning post on the right of the travel it addresses).
  //
  // CLEARANCE. The near wall stands at x = +(halfRoad + 14) = +22.12, i.e.
  // 13.99 m clear of the carriageway edge: past the 3.5 m pavement and past
  // the 5.5 m railing offset builders/schools.ts adds, so neither the fence nor
  // the board can ever reach the asphalt. gen_streetwall's own frontage
  // clearance (>= 8 m) is satisfied, and its pass keeps its distance from
  // authored footprints, so the generated street wall parts around it.
  const SCHOOL = {
    id: "sp-b-school",
    kind: "school",
    height: 12.6,
    heightSource: "levels",
    footprint: [
      [r2(halfRoadM + 14), 196],
      [r2(halfRoadM + 30), 196],
      [r2(halfRoadM + 30), 240],
      [r2(halfRoadM + 14), 240],
    ],
  };
  // Only the зона-30 street is a school street; the other three SP maps are
  // plain speed streets and stay byte-identical.
  if (params.school === true) BUILDINGS.push(SCHOOL);

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
    // THE SCHOOL DOES NOT MOVE THE BOUNDS, and that is deliberate.
    // `meta.boundsLocalMeters` seeds the Locator's spatial grid origin and
    // column count (platform/src/modules/sim/runtime/spatial.ts) — rule-engine
    // machinery. Widening it to fit a set-dressing building would be a grading
    // change disguised as scenery, which is exactly the law tools/maps/lib/
    // streetwall.mjs writes down for its own generated footprints. The school
    // instead lives inside bounds + TERRAIN_MARGIN_M (60 m), the slab of ground
    // the builder already draws past the bounds, like every `sw-` building.
    if (bl.kind === "school") continue;
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
      generator: "tools/maps/gen_sp_speed.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна права улица с ограничение на скоростта — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: ограничението важи по цялата дължина; таванът е за спазване, не за доближаване.",
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
    if (s.edgeId !== "sp-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_sp_speed self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The three committed instances (S3 SP batch 2)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "sp-creep-v1",
    label: "Учебна улица — пълзящо превишаване (сценарий SP-01)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
  {
    districtId: "sp-danger-v1",
    label: "Учебна улица — превишаване над +10 км/ч (сценарий SP-02)",
    lengthM: 400,
    maxspeedKmh: 50,
  },
  {
    districtId: "sp-rain-v1",
    label: "Учебна улица — скорост в дъжд през нощта (сценарий SP-04)",
    lengthM: 360,
    maxspeedKmh: 50,
  },
  {
    // SP-03 / PE-07 host: a school/residential street posted 30 — the WHOLE
    // street is the zone (the map's own maxspeed grades it; no zone layer).
    districtId: "sp-zone30-v1",
    label: "Учебна улица — зона 30 (училище/жилищна) (сценарий SP-03/PE-07)",
    lengthM: 360,
    maxspeedKmh: 30,
    // Founder item 61 — the map's copy says „училище", so the map has one.
    school: true,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildSpSpeedStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== sp-speed build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
