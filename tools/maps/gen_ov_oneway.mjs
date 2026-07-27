/**
 * gen_ov_oneway.mjs — the OV one-way micro-map (Scenario Studio, doc 76 §3;
 * doc 72 §10 archetype OV-13 „Влизане срещу еднопосочна / Wrong-way entry").
 * Since the founder R3 redesign (doc 62 #47: „hold W to win… the drill must
 * become: read the entry, CHOOSE the legal direction") the map is a
 * T-JUNCTION, not a straight ride: a two-way approach stem meets a single-lane
 * ONE-WAY cross street flowing EAST. Turning RIGHT enters the one-way with the
 * flow (legal); turning LEFT enters it against the flow — the exact wrong-way
 * entry the OV-13 archetype names, graded by the shipped WRONG_WAY detector
 * (runtime oneway + tangent-vs-heading test). The choice is REAL: both turns
 * are physically drivable, only one is lawful.
 *
 * The flow direction is world truth, not copy: the approach lane carries
 * painted М10 „right-only" arrows (meta.scenario.laneArrows — the SN-04
 * machinery, markings.ts), so the legal entry is readable from the road
 * itself — AND the forbidden mouth is now SIGNED. The founder's verdict-board
 * note („there is no signal showing that this is 1 way lane — only road
 * marking; there are specific signs stating entering forbidden") named the
 * gap this header used to record as unfixable: В1 „Забранено е влизането"
 * ships in the kit (sign_no_entry.glb) and builders/props.ts posts it at the
 * west arm, the arm builders/network.onewayNoEntryArms derives from THE SAME
 * `oneway` tag the runtime grades WRONG_WAY on. Nothing here changed to earn
 * that post: the map already stated the ban in its edge tags, and the world
 * builder had simply never shown it.
 *
 * The exact district-v1 shape buildWorldGeometry (world), createWorldRuntime
 * (runtime — oneway edges make tick.oneway=true and the tangent-vs-heading
 * test drives tick.wrongWay; the degree-3 node derives an uncontrolled
 * junction, and with every edge residential NO stop line appears) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume. Contract
 * battery: platform/src/modules/sim/world/__tests__/ov-oneway-district.test.ts.
 *
 * Layout (x = east, y = north; approach runs south → north on x = 0, the bar
 * runs west → east on y = approachM — the „from → to" geometry direction IS
 * the legal flow):
 *
 *   ov-ow-n-west (−armM, A) ──►── ov-ow-n-junction (0, A) ──►── ov-ow-n-east (armM, A)
 *                 one-way, flow EAST      │                one-way, flow EAST
 *                                         │  two-way approach stem
 *                                         │  (М10 „right-only" arrows before the mouth)
 *                            ov-ow-spawn-entry (4.06, 15)
 *                                         │
 *                            ov-ow-n-south (0, 0)
 *
 * No signals, no stop lines, no crossings — ambient traffic is authored to
 * ZERO by every drive, so the ONLY thing the rule engine can grade at the
 * empty junction is the driver's own direction of travel against the one-way
 * flow (the right-hand tracker arms but has no one to convict for).
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
// The generator (two-way stem + one-way bar — the OV-13 entry-choice map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   label: string,        // human label (meta)
 *   approachM: number,    // stem length up to the junction (150..600)
 *   armM: number,         // one-way bar length each side of the stem (80..400)
 *   maxspeedKmh: number,  // legal limit everywhere (30..90)
 * }} params
 */
export function buildOvOneWayStreet(params) {
  const errors = [];
  const { districtId, label, approachM, armM, maxspeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 150 && approachM <= 600)) errors.push(`approachM must be within 150..600 m, got ${approachM}`);
  if (!(armM >= 80 && armM <= 400)) errors.push(`armM must be within 80..400 m, got ${armM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_ov_oneway params invalid:\n  - ${errors.join("\n  - ")}`);

  const stemHalfM = SCALED_LANE_W; // 1+1 stem → half-width = one drawn lane
  const barHalfM = SCALED_LANE_W / 2; // single one-way lane, centered on the polyline
  const laneCenterRightM = r2(SCALED_LANE_W / 2); // stem northbound lane center (x)
  const barLaneCenterM = 0; // bar lane center offset from its polyline

  // -- Nodes / edges (a T: two-way stem + one-way bar flowing EAST).
  const NODES = {
    "ov-ow-n-south": [0, 0],
    "ov-ow-n-junction": [0, approachM],
    "ov-ow-n-west": [-armM, approachM],
    "ov-ow-n-east": [armM, approachM],
  };
  const stemGeom = [
    [0, 0],
    [0, approachM],
  ];
  const barWestGeom = [
    [-armM, approachM],
    [0, approachM],
  ];
  const barEastGeom = [
    [0, approachM],
    [armM, approachM],
  ];
  const EDGES = [
    {
      id: "ov-ow-approach",
      from: "ov-ow-n-south",
      to: "ov-ow-n-junction",
      class: "residential",
      name: "Подход към еднопосочната улица",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(stemGeom),
      geometry: stemGeom,
    },
    {
      id: "ov-ow-oneway-w",
      from: "ov-ow-n-west",
      to: "ov-ow-n-junction",
      class: "residential",
      name: "Еднопосочна улица — западно рамо (посока изток)",
      oneway: true,
      roundabout: false,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(barWestGeom),
      geometry: barWestGeom,
    },
    {
      id: "ov-ow-oneway-e",
      from: "ov-ow-n-junction",
      to: "ov-ow-n-east",
      class: "residential",
      name: "Еднопосочна улица — източно рамо (посока изток)",
      oneway: true,
      roundabout: false,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(barEastGeom),
      geometry: barEastGeom,
    },
  ];

  const INTERSECTIONS = [
    { id: "ov-ow-n-junction", x: 0, y: approachM, degree: 3, signalized: false },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- Spawns: the approach entry + an east-arm reference point.
  const SPAWN_POINTS = [
    {
      id: "ov-ow-spawn-entry",
      x: laneCenterRightM,
      y: 15,
      heading: 0,
      edgeId: "ov-ow-approach",
      name: "Подход към еднопосочната",
    },
    {
      id: "ov-ow-spawn-east",
      x: r2(armM - 15),
      y: approachM,
      heading: 90,
      edgeId: "ov-ow-oneway-e",
      name: "Контролна точка — източно рамо (по посоката)",
    },
  ];

  // -- One corner block SW of the junction (visual anchor, clear of both
  // carriageways + sidewalks).
  const BUILDINGS = [
    {
      id: "ov-ow-b-corner",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(stemHalfM + 32)), r2(approachM - 50)],
        [r2(-(stemHalfM + 12)), r2(approachM - 50)],
        [r2(-(stemHalfM + 12)), r2(approachM - 22)],
        [r2(-(stemHalfM + 32)), r2(approachM - 22)],
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
  bounds.minY = Math.min(bounds.minY, -6);
  bounds.maxY = Math.max(bounds.maxY, approachM + barHalfM + 6);
  bounds.minX = Math.min(bounds.minX, -armM - 6);
  bounds.maxX = Math.max(bounds.maxX, armM + 6);
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
        text: "Учебно Т-кръстовище с еднопосочна улица — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Т-кръстовище с еднопосочна: стрелките на платното показват посоката на движение — влиза се само по нея (надясно).",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the lane and
       * gate truth (the L7 copy law — ScenarioSpecs pin these BY VALUE and the
       * contract battery asserts the copies match this file). laneArrows is
       * the SN-04 painted-arrow machinery: М10 „right-only" glyphs in the
       * approach lane before the mouth — the visible flow-direction truth.
       */
      scenario: {
        archetype: "t-junction",
        params: { approachM, armM, maxspeedKmh },
        oneway: true,
        onewayFlow: "east",
        junction: { x: 0, y: approachM },
        lanesPerDirection: 1,
        laneCenterRightM,
        barLaneCenterM,
        gates: {
          mouth: { x: laneCenterRightM, y: r2(approachM - 30) },
          legalEntry: { x: 60, y: approachM },
          finish: { x: r2(armM - 15), y: approachM },
          wrongEntry: { x: -60, y: approachM },
        },
        laneArrows: {
          edgeId: "ov-ow-approach",
          travelDir: 1,
          fromM: r2(approachM - 70),
          toM: r2(approachM - 10),
          lanes: [{ centerM: laneCenterRightM, arrow: "right" }],
        },
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
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
  }
  const stem = EDGES.find((e) => e.id === "ov-ow-approach");
  if (stem.lanes !== 2 || stem.oneway) post.push("the approach stem must be a two-way 1+1 street (lanes 2)");
  for (const id of ["ov-ow-oneway-w", "ov-ow-oneway-e"]) {
    const bar = EDGES.find((e) => e.id === id);
    if (bar.lanes !== 1 || !bar.oneway) post.push(`${id}: the bar is a single-lane one-way (lanes 1, oneway)`);
    // The legal flow must be EAST: geometry x strictly increasing from → to.
    if (!(bar.geometry[bar.geometry.length - 1][0] > bar.geometry[0][0])) post.push(`${id}: flow must run west → east`);
  }
  if ((degree.get("ov-ow-n-junction") ?? 0) !== 3) post.push("ov-ow-n-junction must join stem + both arms (degree 3)");
  // No arterial edge → the runtime derives NO stop line at the T (the drill
  // grades direction choice, not priority).
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  if (Math.max(...EDGES.map((e) => RANK[e.class] ?? 2)) >= 4) post.push("an arterial edge would derive a stop line at the T");
  for (const s of SPAWN_POINTS) {
    const e = EDGES.find((ed) => ed.id === s.edgeId);
    if (!e) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    else if (e.id === "ov-ow-approach" && (Math.abs(s.x) > stemHalfM || s.y < 0 || s.y > approachM)) {
      post.push(`${s.id}: not on the stem carriageway`);
    } else if (e.id !== "ov-ow-approach" && (Math.abs(s.y - approachM) > barHalfM || Math.abs(s.x) > armM)) {
      post.push(`${s.id}: not on the bar carriageway`);
    }
  }
  const la = district.meta.scenario.laneArrows;
  if (!(la.fromM >= 0 && la.toM <= approachM && la.fromM < la.toM)) post.push("laneArrows span must sit on the approach stem");
  if (laneCenterRightM <= 0 || laneCenterRightM >= stemHalfM) post.push(`stem lane center ${laneCenterRightM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_oneway self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// ov-oneway-v1 instance — the sc-ov-oneway product map (doc 76 §3; founder R3
// doc 62 #47 redesign): a 200 m approach to a one-way bar with 140 m arms.
// ---------------------------------------------------------------------------

const OW_PARAMS = {
  districtId: "ov-oneway-v1",
  label: "Учебно Т-кръстовище — вход в еднопосочна улица (сценарий OV-13)",
  approachM: 200,
  armM: 140,
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
line("approach / arms / limit", `${OW_PARAMS.approachM} m / ±${OW_PARAMS.armM} m / ${OW_PARAMS.maxspeedKmh} km/h`);
line("junction", JSON.stringify(district.meta.scenario.junction));
line("gates", JSON.stringify(district.meta.scenario.gates));
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
