/**
 * gen_parking_lot.mjs — parametric PARKING-LOT map archetype (Scenario Studio,
 * doc 76 §3) → content/world/<districtId>.json
 *
 * The first archetype GENERATOR of the scenario program: one function,
 * parameters in → a complete district-v1 document out, in the exact format
 * buildWorldGeometry (world), parseDistrict/createWorldRuntime (runtime) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_poligon.mjs mold, proven by poligon-district.test.ts. Contract battery:
 * platform/src/modules/sim/world/__tests__/lot-perp-district.test.ts.
 *
 * Layout (canonical frame, entry "south"; x = east, y = north, origin at the
 * bay-row center; the whole lot rotates for other entries):
 *
 *                lot-n-end (0, 40)          aisle: service road, EXCLUDED from
 *                    │                      ambient traffic routes
 *          bays →  ▐ ▐ ▐ ▐ ▐  (east side; painted lesson-side as
 *                    │          ParkingBaySpec rects — the L7/полигон pattern:
 *                    │          bays are DATA, the map only hosts them;
 *                lot-n-gate (0, -30)        meta.scenario carries the rects +
 *                    │                      occupancy so specs single-source)
 *                    │  approach: residential, routable
 *                lot-n-start (0, -30-approachM)
 *
 * No signals, no crossings, no stop lines — a parking lot teaches low-speed
 * maneuvering, nothing else (doc 76 §3: "road + markings + spawn + finish,
 * nothing else"). Parked-neighbor OCCUPANCY is emitted as data (meta.scenario
 * .bays[].occupied); the low-speed/collider workstream places the hittable
 * car props from it — this file stays geometry-only.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_parking_lot.mjs
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
/** Paint keep-back from the drawn curb, m (the полигон bay-fit convention). */
const CURB_MARGIN_M = 0.6;

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
 *   bays: number,              // bay count in the row (>= 3)
 *   bayWidthM: 2.5|2.7|3.0,    // real-world bay width (doc 76 §2 params)
 *   bayDepthM: number,         // bay depth (perpendicular/echelon) or length (parallel)
 *   angle: "90"|"parallel"|"45",
 *   aisleWidthM: number,       // real-world logical aisle width (recorded; drawn width follows the perceptual scale)
 *   occupancy: string,         // one char per bay: "X" occupied, "_" free (>= 1 free; first free = the target)
 *   approachM: number,         // approach road length (>= 40)
 *   entry: "south"|"west"|"north"|"east", // which side the approach comes from
 * }} params
 */
export function buildParkingLotDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    bays,
    bayWidthM,
    bayDepthM,
    angle,
    aisleWidthM,
    occupancy,
    approachM,
    entry,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!Number.isInteger(bays) || bays < 3) errors.push(`bays must be an integer >= 3, got ${bays}`);
  if (![2.5, 2.7, 3.0].includes(bayWidthM)) errors.push(`bayWidthM must be 2.5 | 2.7 | 3.0, got ${bayWidthM}`);
  if (!(bayDepthM >= 4 && bayDepthM <= 7)) errors.push(`bayDepthM must be within 4..7 m, got ${bayDepthM}`);
  if (!["90", "parallel", "45"].includes(angle)) errors.push(`angle must be "90" | "parallel" | "45", got ${angle}`);
  if (!(aisleWidthM >= 3 && aisleWidthM <= 12)) errors.push(`aisleWidthM must be within 3..12 m, got ${aisleWidthM}`);
  if (typeof occupancy !== "string" || occupancy.length !== bays) {
    errors.push(`occupancy "${occupancy}" must be exactly ${bays} chars of X/_`);
  } else if (/[^X_]/.test(occupancy)) {
    errors.push(`occupancy "${occupancy}" may contain only "X" (occupied) and "_" (free)`);
  } else if (!occupancy.includes("_")) {
    errors.push(`occupancy "${occupancy}" needs at least one free "_" bay (the maneuver target)`);
  }
  if (!(approachM >= 40 && approachM <= 300)) errors.push(`approachM must be within 40..300 m, got ${approachM}`);
  if (!["south", "west", "north", "east"].includes(entry)) errors.push(`entry must be south|west|north|east, got ${entry}`);
  if (errors.length > 0) throw new Error(`gen_parking_lot params invalid:\n  - ${errors.join("\n  - ")}`);

  // -- Bay row geometry (canonical frame; east side of the north-south aisle).
  // headingDeg: bay AXIS (ParkingBaySpec convention: lengthM along it), 0 = north, cw.
  const halfRoadM = SCALED_LANE_W; // 2 lanes → half-width = one drawn lane
  let bayHeadingDeg;
  let bayLengthM; // along the axis
  let bayAcrossM; // across the axis (= ParkingBaySpec.widthM)
  let pitchM; // center-to-center spacing along the aisle
  if (angle === "90") {
    bayHeadingDeg = 90; // axis east-west: nose/tail toward the aisle
    bayLengthM = bayDepthM;
    bayAcrossM = bayWidthM;
    pitchM = bayWidthM;
  } else if (angle === "parallel") {
    bayHeadingDeg = 0; // axis along the aisle
    bayLengthM = bayDepthM;
    bayAcrossM = bayWidthM;
    pitchM = bayDepthM + 1.0; // maneuvering gap between parallel bays
  } else {
    bayHeadingDeg = 45; // echelon
    bayLengthM = bayDepthM;
    bayAcrossM = bayWidthM;
    pitchM = bayWidthM * Math.SQRT2;
  }
  // Axis-aligned half-extent of one bay rect in x (for the curb-fit check).
  const hRad = (bayHeadingDeg * Math.PI) / 180;
  const extentX = (bayLengthM * Math.abs(Math.sin(hRad)) + bayAcrossM * Math.abs(Math.cos(hRad))) / 2;
  const bayCenterX = halfRoadM - CURB_MARGIN_M - extentX;
  if (bayCenterX - extentX < 0.5) {
    throw new Error(
      `gen_parking_lot: bay rect (extent ${r2(extentX * 2)} m across) does not fit the drawn ` +
        `half-carriageway (${halfRoadM} m) with ${CURB_MARGIN_M} m curb margin — reduce bayDepthM/angle`,
    );
  }

  const rowSpanM = pitchM * (bays - 1) + bayAcrossM; // full row along the aisle
  const aisleSouthY = -30;
  const aisleNorthY = Math.max(40, rowSpanM / 2 + 20);
  if (rowSpanM / 2 + 5 > aisleNorthY || -(rowSpanM / 2) - 5 < aisleSouthY) {
    throw new Error(`gen_parking_lot: bay row (${r2(rowSpanM)} m) does not fit the aisle span`);
  }

  const bayRects = [];
  for (let i = 0; i < bays; i++) {
    const y = (i - (bays - 1) / 2) * pitchM;
    bayRects.push({
      id: `lot-bay-${i + 1}`,
      x: r2(bayCenterX),
      y: r2(y),
      headingDeg: bayHeadingDeg,
      widthM: bayAcrossM,
      lengthM: bayLengthM,
      occupied: occupancy[i] === "X",
    });
  }
  const targetBay = bayRects[occupancy.indexOf("_")];

  // -- Entry rotation: canonical frame has the approach from the SOUTH.
  const ROT_DEG = { south: 0, west: 90, north: 180, east: 270 }[entry];
  const rotRad = (ROT_DEG * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  /** Rotate a canonical point clockwise by ROT_DEG. */
  const rot = ([x, y]) => [r2(x * cos + y * sin), r2(-x * sin + y * cos)];
  const rotHeading = (h) => (h + ROT_DEG) % 360;

  // -- Nodes / edges (canonical, then rotated).
  const NODES_CANON = {
    "lot-n-start": [0, aisleSouthY - approachM],
    "lot-n-gate": [0, aisleSouthY],
    "lot-n-end": [0, aisleNorthY],
  };
  const NODES = Object.fromEntries(Object.entries(NODES_CANON).map(([id, p]) => [id, rot(p)]));

  const edge = (id, from, to, cls, lanes, maxspeed, name) => {
    const geometry = [
      [NODES[from][0], NODES[from][1]],
      [NODES[to][0], NODES[to][1]],
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
  };

  const EDGES = [
    // Approach — the only ROUTABLE edge (ambient traffic, if any, stays out of
    // the lot). residential 20 km/h: a lot approach, not a street.
    edge("lot-e-approach", "lot-n-start", "lot-n-gate", "residential", 2, 20, "Подход към паркинга"),
    // Aisle — service class: excluded from ambient routes like the полигон
    // aprons (DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses).
    edge("lot-e-aisle", "lot-n-gate", "lot-n-end", "service", 2, 20, "Алея на паркинга"),
  ];

  // Rotate bay rects into the final frame.
  const baysOut = bayRects.map((b) => {
    const [x, y] = rot([b.x, b.y]);
    return { ...b, x, y, headingDeg: rotHeading(b.headingDeg) };
  });
  const targetOut = baysOut[bayRects.indexOf(targetBay)];

  // -- Spawns: approach start (the scenario's cold/ready start pose) + a
  // finish-check reference point past the bay row on the aisle.
  const spawnApproachCanon = [0, aisleSouthY - approachM + 15];
  const finishCanon = [0, rowSpanM / 2 + 12];
  const SPAWN_POINTS = [
    {
      id: "lot-spawn-approach",
      x: rot(spawnApproachCanon)[0],
      y: rot(spawnApproachCanon)[1],
      heading: rotHeading(0),
      edgeId: "lot-e-approach",
      name: "Подход към паркинга",
    },
    {
      id: "lot-spawn-finish",
      x: rot(finishCanon)[0],
      y: rot(finishCanon)[1],
      heading: rotHeading(0),
      edgeId: "lot-e-aisle",
      name: "Контролна точка — след маневрата",
    },
  ];

  // -- One attendant kiosk west of the approach mouth (visual anchor, clear of
  // the carriageway + sidewalk: |x| > halfRoad + ~4 m sidewalk).
  const kioskCanon = [
    [-28, aisleSouthY - 24],
    [-20, aisleSouthY - 24],
    [-20, aisleSouthY - 16],
    [-28, aisleSouthY - 16],
  ];
  const BUILDINGS = [
    {
      id: "lot-b-kiosk",
      height: 3.5,
      heightSource: "default",
      footprint: kioskCanon.map(rot),
    },
  ];

  // intersections[]: degree >= 3 only (OSM-build convention) — a straight
  // approach→aisle joint is degree 2, so a parking lot has NONE.
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

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
  // Bays + kiosk can outgrow the road bounds — cover them too.
  for (const b of baysOut) {
    bounds.minX = Math.min(bounds.minX, b.x - 6);
    bounds.minY = Math.min(bounds.minY, b.y - 6);
    bounds.maxX = Math.max(bounds.maxX, b.x + 6);
    bounds.maxY = Math.max(bounds.maxY, b.y + 6);
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
      mapKind: "scenario-lot",
      generator: "tools/maps/gen_parking_lot.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебен паркинг — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: 20,
        note: "Паркинг: 20 km/h навсякъде; маневрите се изпълняват с пешеходна скорост.",
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
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the bay rects
       * with OCCUPANCY. Bays are ParkingBaySpec-shaped (x, y, headingDeg,
       * widthM, lengthM) so specs/tests consume them verbatim; `occupied`
       * bays receive hittable parked-car props from the low-speed workstream.
       * The map file stays the single geometric truth — ScenarioSpecs pin the
       * TARGET bay by value and the contract battery asserts the copy matches.
       */
      scenario: {
        archetype: "parking-lot",
        params: {
          bays,
          bayWidthM,
          bayDepthM,
          angle,
          aisleWidthM,
          occupancy,
          approachM,
          entry,
        },
        targetBayId: targetOut.id,
        bays: baysOut,
      },
    },
    roads: {
      nodes: Object.entries(NODES)
        .map(([id, [x, y]]) => ({ id, x, y }))
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
    else if (distToEdge(host, s.x, s.y) > 1) post.push(`${s.id}: not on its edge`);
  }
  // Every bay rect must hug the AISLE (its center within a drawn half-width +
  // depth of the aisle line) and never cross the centerline.
  const aisle = EDGES.find((e) => e.id === "lot-e-aisle");
  for (const b of baysOut) {
    const d = distToEdge(aisle, b.x, b.y);
    if (d > halfRoadM) post.push(`${b.id}: bay center ${r2(d)} m off the aisle (max ${halfRoadM})`);
  }
  // Exactly one target bay, and it must be free.
  if (!targetOut || targetOut.occupied) post.push("target bay missing or occupied");
  // Routable (non-service) connectivity: one component.
  {
    const routable = EDGES.filter((e) => e.class !== "service");
    if (routable.length === 0) post.push("no routable (non-service) edge — traffic graph would be empty");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_parking_lot self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instances.
//
// P0 — the founder's reference image (doc 76 §10/§12): perpendicular bay,
// 2.7 m wide, 4 occupied neighbors around ONE free bay, approach south.
//
// S2-A parking wave (doc-72 PK-01/PK-02 variants — same generator, new
// params; no new archetype):
//   lot-par-v1    — angle "parallel": street-side parallel slot between two
//                   parked cars (THE Наредба-38 exam maneuver, PK-01);
//   lot-45-v1     — angle "45": echelon bays, forward entry;
//   lot-narrow-v1 — angle "90" at bayWidth 2.5 (the tight-pocket hard
//                   variant of P0 — both neighbors occupied, tighter rubric).
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "lot-perp-v1",
    label: "Учебен паркинг — перпендикулярно място на заден ход (сценарий P0)",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },
  {
    districtId: "lot-par-v1",
    label: "Учебен паркинг — успоредно място между две коли (сценарий S2)",
    bays: 5,
    bayWidthM: 2.5,
    bayDepthM: 5.5,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },
  {
    districtId: "lot-45-v1",
    label: "Учебен паркинг — косо място на 45° с преден вход (сценарий S2)",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "45",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },
  {
    districtId: "lot-narrow-v1",
    label: "Учебен паркинг — тясно гнездо 2,5 м на заден ход (сценарий S2)",
    bays: 5,
    bayWidthM: 2.5,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildParkingLotDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  // content/world is the source of truth; platform/public/world is the
  // byte-identical published copy the browser fetches (the world-JSON law —
  // the contract batteries assert equality).
  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  for (const file of [CONTENT_FILE, PUBLIC_FILE]) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, out);
  }

  console.log(`=== parking-lot build: ${params.districtId} ===`);
  line("bays / width / angle", `${params.bays} / ${params.bayWidthM} m / ${params.angle}`);
  line("occupancy (X=car, _=free)", params.occupancy);
  line("target bay", `${district.meta.scenario.targetBayId} @ (${district.meta.scenario.bays.find((b) => !b.occupied).x}, ${district.meta.scenario.bays.find((b) => !b.occupied).y})`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
