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
import { curbLaneOffsetM, isMarkedRoadClass, toCurbLane } from "./lib/lane.mjs";

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
 *   angle: "90"|"parallel"|"45"|"135",
 *   aisleWidthM: number,       // real-world logical aisle width (recorded; drawn width follows the perceptual scale)
 *   occupancy: string,         // one char per bay: "X" occupied, "_" free (>= 1 free; first free = the target)
 *   approachM: number,         // approach road length (>= 40)
 *   entry: "south"|"west"|"north"|"east", // which side the approach comes from
 *   prefix?: string,           // id namespace (default "lot") — nodes/edges/bays/spawns
 *   side?: "east"|"west"|"both", // which kerb the bay row hugs (default "east")
 *   occupancyWest?: string,    // side "both": the west row's own occupancy (default = occupancy)
 *   pitchesM?: number[],       // bays-1 centre-to-centre gaps (default: uniform, derived)
 *   targetIndex?: number,      // which FREE bay is the drill's target (default: the first)
 *   crossings?: Array<{ id: string, y: number }>, // marked zebra across the aisle
 *   banSpans?: Array<{ id: string, fromY: number, toY: number, signRef: string }>,
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
    prefix = "lot",
    side = "east",
    occupancyWest,
    pitchesM,
    targetIndex,
    crossings = [],
    banSpans = [],
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(prefix)) errors.push(`prefix "${prefix}" must be lowercase alphanumeric`);
  if (!Number.isInteger(bays) || bays < 3) errors.push(`bays must be an integer >= 3, got ${bays}`);
  if (![2.5, 2.7, 3.0].includes(bayWidthM)) errors.push(`bayWidthM must be 2.5 | 2.7 | 3.0, got ${bayWidthM}`);
  if (!(bayDepthM >= 4 && bayDepthM <= 7)) errors.push(`bayDepthM must be within 4..7 m, got ${bayDepthM}`);
  if (!["90", "parallel", "45", "135"].includes(angle)) errors.push(`angle must be "90" | "parallel" | "45" | "135", got ${angle}`);
  if (!["east", "west", "both"].includes(side)) errors.push(`side must be east|west|both, got ${side}`);
  if (!(aisleWidthM >= 3 && aisleWidthM <= 12)) errors.push(`aisleWidthM must be within 3..12 m, got ${aisleWidthM}`);
  const checkOccupancy = (label2, s) => {
    if (typeof s !== "string" || s.length !== bays) {
      errors.push(`${label2} "${s}" must be exactly ${bays} chars of X/_`);
    } else if (/[^X_]/.test(s)) {
      errors.push(`${label2} "${s}" may contain only "X" (occupied) and "_" (free)`);
    }
  };
  checkOccupancy("occupancy", occupancy);
  if (occupancyWest !== undefined) checkOccupancy("occupancyWest", occupancyWest);
  if (side === "both" && occupancyWest === undefined) {
    // Not fatal — a symmetric lot is a legitimate recipe — but the two rows
    // must together offer the maneuver target, checked below.
  }
  if (pitchesM !== undefined) {
    if (!Array.isArray(pitchesM) || pitchesM.length !== bays - 1) {
      errors.push(`pitchesM must be exactly ${bays - 1} numbers (one gap per adjacent bay pair)`);
    } else if (!pitchesM.every((p) => Number.isFinite(p) && p >= 2 && p <= 20)) {
      errors.push(`pitchesM entries must be within 2..20 m, got ${JSON.stringify(pitchesM)}`);
    }
  }
  if (!(approachM >= 40 && approachM <= 300)) errors.push(`approachM must be within 40..300 m, got ${approachM}`);
  if (!["south", "west", "north", "east"].includes(entry)) errors.push(`entry must be south|west|north|east, got ${entry}`);
  if (errors.length > 0) throw new Error(`gen_parking_lot params invalid:\n  - ${errors.join("\n  - ")}`);

  // -- Bay row geometry (canonical frame; the aisle runs north-south).
  // headingDeg: bay AXIS (ParkingBaySpec convention: lengthM along it), 0 = north, cw.
  const halfRoadM = SCALED_LANE_W; // 2 lanes → half-width = one drawn lane
  let bayHeadingDeg;
  let bayLengthM; // along the axis
  let bayAcrossM; // across the axis (= ParkingBaySpec.widthM)
  let pitchM; // default center-to-center spacing along the aisle
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
  } else if (angle === "45") {
    bayHeadingDeg = 45; // echelon, opening toward an APPROACHING driver (nose-in)
    bayLengthM = bayDepthM;
    bayAcrossM = bayWidthM;
    pitchM = bayWidthM * Math.SQRT2;
  } else {
    // "135" — the SAME echelon row mirrored about the aisle: the mouth now
    // opens BEHIND a northbound driver, so the bay can only be taken on the
    // reverse (доc-72 PK-02 „reverse angle parking"). Identical rect extents,
    // so the curb fit and the pitch are the 45° ones.
    bayHeadingDeg = 135;
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

  // Cumulative bay-centre stations along the aisle (uniform unless pitchesM
  // authors the row gap by gap — the „two slots of different length" recipe).
  const gaps = pitchesM ?? new Array(bays - 1).fill(pitchM);
  const stations = [0];
  for (const g of gaps) stations.push(stations[stations.length - 1] + g);
  const rowLenM = stations[stations.length - 1];
  const rowSpanM = rowLenM + bayAcrossM; // full row along the aisle
  const aisleSouthY = -30;
  const aisleNorthY = Math.max(40, rowSpanM / 2 + 20);
  if (rowSpanM / 2 + 5 > aisleNorthY || -(rowSpanM / 2) - 5 < aisleSouthY) {
    throw new Error(`gen_parking_lot: bay row (${r2(rowSpanM)} m) does not fit the aisle span`);
  }

  /**
   * The WEST row is the east row mirrored across the aisle. Only the paint
   * cares about the resulting heading (markings.ts paints the ONE longitudinal
   * line on the bay's left edge, so a kerb-side bay must face the way that
   * puts it toward the carriageway); parkInBay folds heading onto the 180°
   * axis, so grading is identical either way.
   */
  const mirrorHeading = (h) => (h === 0 ? 180 : (360 - h) % 360);

  const buildRow = (rowSide, occ, idTag) => {
    const sign = rowSide === "west" ? -1 : 1;
    const heading = rowSide === "west" ? mirrorHeading(bayHeadingDeg) : bayHeadingDeg;
    return occ.split("").map((c, i) => ({
      id: `${prefix}-bay-${idTag}${i + 1}`,
      x: r2(sign * bayCenterX),
      y: r2(stations[i] - rowLenM / 2),
      headingDeg: heading,
      widthM: bayAcrossM,
      lengthM: bayLengthM,
      occupied: c === "X",
    }));
  };

  const bayRects =
    side === "both"
      ? [...buildRow("east", occupancy, ""), ...buildRow("west", occupancyWest ?? occupancy, "w")]
      : buildRow(side, occupancy, "");

  const freeIdx = bayRects.map((b, i) => (b.occupied ? -1 : i)).filter((i) => i >= 0);
  if (freeIdx.length === 0) {
    throw new Error(`gen_parking_lot: no free "_" bay anywhere — nothing to maneuver into`);
  }
  const wanted = targetIndex ?? freeIdx[0];
  if (!freeIdx.includes(wanted)) {
    throw new Error(
      `gen_parking_lot: targetIndex ${wanted} is not a FREE bay (free indices: ${freeIdx.join(", ")})`,
    );
  }
  const targetBay = bayRects[wanted];

  // -- Entry rotation: canonical frame has the approach from the SOUTH.
  const ROT_DEG = { south: 0, west: 90, north: 180, east: 270 }[entry];
  const rotRad = (ROT_DEG * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  /** Rotate a canonical point clockwise by ROT_DEG. */
  const rot = ([x, y]) => [r2(x * cos + y * sin), r2(-x * sin + y * cos)];
  const rotHeading = (h) => (h + ROT_DEG) % 360;

  // -- Nodes / edges (canonical, then rotated).
  const N_START = `${prefix}-n-start`;
  const N_GATE = `${prefix}-n-gate`;
  const N_END = `${prefix}-n-end`;
  const E_APPROACH = `${prefix}-e-approach`;
  const E_AISLE = `${prefix}-e-aisle`;
  const NODES_CANON = {
    [N_START]: [0, aisleSouthY - approachM],
    [N_GATE]: [0, aisleSouthY],
    [N_END]: [0, aisleNorthY],
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
    edge(E_APPROACH, N_START, N_GATE, "residential", 2, 20, "Подход към паркинга"),
    // Aisle — service class: excluded from ambient routes like the полигон
    // aprons (DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses).
    edge(E_AISLE, N_GATE, N_END, "service", 2, 20, "Алея на паркинга"),
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
  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: `${prefix}-spawn-approach`,
        x: rot(spawnApproachCanon)[0],
        y: rot(spawnApproachCanon)[1],
        heading: rotHeading(0),
        edgeId: E_APPROACH,
        name: "Подход към паркинга",
      },
      {
        id: `${prefix}-spawn-finish`,
        x: rot(finishCanon)[0],
        y: rot(finishCanon)[1],
        heading: rotHeading(0),
        edgeId: E_AISLE,
        name: "Контролна точка — след маневрата",
      },
    ],
    EDGES,
  );

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
      id: `${prefix}-b-kiosk`,
      height: 3.5,
      heightSource: "default",
      footprint: kioskCanon.map(rot),
    },
  ];

  // intersections[]: degree >= 3 only (OSM-build convention) — a straight
  // approach→aisle joint is degree 2, so a parking lot has NONE.
  const INTERSECTIONS = [];
  const ROUNDABOUTS = [];

  /**
   * OPTIONAL marked crossing across the aisle (the „5 m from the пешеходна
   * пътека" recipe). `kind: "marked"` is what markings.ts paints a zebra from
   * and what runtime/zones.ts grades the crossing duties against; unsignalized,
   * because a parking aisle has no head.
   */
  const CROSSINGS = crossings.map((c) => {
    if (!(Number.isFinite(c?.y) && typeof c?.id === "string")) {
      throw new Error(`gen_parking_lot: crossings entries need { id, y }`);
    }
    if (c.y < aisleSouthY + 4 || c.y > aisleNorthY - 4) {
      throw new Error(`gen_parking_lot: crossing "${c.id}" at y ${c.y} is off the aisle span`);
    }
    const [x, y] = rot([0, c.y]);
    return { id: c.id, x, y, kind: "marked", signalized: false, edgeId: E_AISLE };
  });

  /**
   * OPTIONAL чл. 98 ban spans on the aisle, authored in CANONICAL y and
   * converted to the aisle edge's own arclength (the edge runs south → north
   * from `aisleSouthY`). `noStopping` is the kind runtime/zones.ts grades
   * ILLEGAL_STOP_IN_BAN_ZONE from and the kind zoneSigns.ts stands a В27 post
   * at — so a span authored here is BOTH graded and visible, which is the only
   * shape a prohibition lesson is allowed to ship in.
   */
  const ZONES = banSpans.map((z) => {
    if (!(typeof z?.id === "string" && Number.isFinite(z?.fromY) && Number.isFinite(z?.toY))) {
      throw new Error(`gen_parking_lot: banSpans entries need { id, fromY, toY, signRef }`);
    }
    if (!(z.toY > z.fromY)) throw new Error(`gen_parking_lot: ban span "${z.id}" is empty/inverted`);
    if (z.fromY < aisleSouthY || z.toY > aisleNorthY) {
      throw new Error(`gen_parking_lot: ban span "${z.id}" runs off the aisle`);
    }
    return {
      id: z.id,
      kind: "noStopping",
      edgeId: E_AISLE,
      fromM: r2(z.fromY - aisleSouthY),
      toM: r2(z.toY - aisleSouthY),
      signRef: z.signRef ?? "В27",
    };
  });

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
        // The RECIPE, mirrored value-for-value into ScenarioSpec.map.params
        // (asserted by the templates battery). Extras appear only when they
        // are not the default, so every district authored before them keeps a
        // byte-identical params object. `pitchesM` is joined into a string
        // because map.params is Record<string, number | string>.
        params: {
          bays,
          bayWidthM,
          bayDepthM,
          angle,
          aisleWidthM,
          occupancy,
          approachM,
          entry,
          ...(side !== "east" ? { side } : {}),
          ...(occupancyWest !== undefined ? { occupancyWest } : {}),
          ...(pitchesM !== undefined ? { pitchesM: pitchesM.join("|") } : {}),
          ...(targetIndex !== undefined ? { targetIndex } : {}),
        },
        targetBayId: targetOut.id,
        bays: baysOut,
      },
      ...(ZONES.length > 0 ? { zonesVersion: 1 } : {}),
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
    ...(ZONES.length > 0 ? { zones: ZONES } : {}),
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
    if (!host) {
      post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
      continue;
    }
    // doc 87 T2: "on its edge" used to mean "within a metre of its CENTRELINE",
    // i.e. the invariant enforced the defect it was supposed to catch.
    //
    // …and then it over-corrected. An UNPAINTED class (the `service` aisle)
    // has no lane to sit in, so `toCurbLane` leaves such a pose exactly where
    // the author put it — while this check went on demanding a two-lane
    // 4.06 m offset from it and threw. That is not a hypothetical: this
    // generator could not regenerate its own four committed districts
    // („lot-spawn-finish: not in its edge's curb lane"), so the parking lot
    // archetype was frozen. Same predicate on both sides now.
    if (!isMarkedRoadClass(host.class)) continue;
    if (Math.abs(distToEdge(host, s.x, s.y) - curbLaneOffsetM(host.lanes, host.oneway)) > 1) {
      post.push(`${s.id}: not in its edge's curb lane`);
    }
  }
  // Every bay rect must hug the AISLE (its center within a drawn half-width +
  // depth of the aisle line) and never cross the centerline.
  const aisle = EDGES.find((e) => e.id === E_AISLE);
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

  // -------------------------------------------------------------------------
  // PARKING-DEPTH wave — the founder's „we can think of many many many more
  // parking variants 10 at least which to teach how to park the students".
  //
  // Ten NEW maps, one per drill, each carrying a situation the other nine do
  // not. What makes them different is never the district's colour: it is the
  // LENGTH OF THE GAP (6.5 m / 9.5 m / 12.7 m / 4.3 m-impossible), the SIDE of
  // the aisle, the ANGLE of the bay mouth (45° nose-in vs 135° reverse-in),
  // the NEIGHBOUR (car / van / wall / an opposite row), the LEGALITY of the
  // nearest slot (a чл. 98 span with its own В27 post and a painted zebra),
  // and the LIGHT (an unlit row at night).
  //
  // Each district gets its OWN id namespace (`prefix`), because spawn-point
  // ids are global to the completability battery: four lots sharing
  // „lot-spawn-approach" was survivable while every lot had the same 90 m
  // approach; ten more with different approach lengths would have silently
  // aimed the battery's synthetic driver at the wrong start pose.
  // -------------------------------------------------------------------------

  // 1 — the SHORT kerb gap. Clear space between the two parked cars is
  // 2 × 5.9 − 4.5 = 7.3 m for a 4.04 m car — 1.8 car lengths, against the
  // 8.5 m (2.1 lengths) of lot-par-v1. That is the tightest slot the taught
  // manoeuvre still fits: the constant-radius reverse S of the shadow passes
  // the lead car's corner with ~0.3 m and ends 0.9 m short of the rear one, and
  // at 5.5 m pitch it grazed. Paint rects 4.5 m so the row still reads as bays.
  {
    districtId: "lot-gap-short-v1",
    prefix: "lotgs",
    label: "Учебен паркинг — късо място край бордюра (7,3 м между колите)",
    bays: 5,
    bayWidthM: 2.5,
    bayDepthM: 4.5,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    pitchesM: [5.9, 5.9, 5.9, 5.9],
    approachM: 90,
    entry: "south",
  },

  // 2 — the LONG kerb gap: 2 × 8.6 − 4.5 = 12.7 m, three car lengths. Long
  // enough that the reverse is unnecessary and the taught entry is nose-first
  // (the drill grades parkInBay entry "forward").
  {
    districtId: "lot-gap-long-v1",
    prefix: "lotgl",
    label: "Учебен паркинг — дълго място край бордюра (12,7 м, влизане напред)",
    bays: 5,
    bayWidthM: 2.5,
    bayDepthM: 6.5,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    pitchesM: [8.6, 8.6, 8.6, 8.6],
    approachM: 90,
    entry: "south",
  },

  // 3 — the wide neighbour. Bay 2 is left FREE in the data on purpose: the
  // scene mounts a kargo_v VAN in it (held scenery, hittable), which is both
  // wider and 0.45 m longer than a car, so it steals sight-line and space from
  // exactly one side of the target bay. An occupied bay would have drawn a
  // deterministic civilian car instead and the drill would have no van.
  {
    districtId: "lot-van-v1",
    prefix: "lotvn",
    label: "Учебен паркинг — гнездо до бус с ограничена видимост",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    occupancy: "X__XX",
    targetIndex: 2,
    approachM: 90,
    entry: "south",
  },

  // 4 — REVERSE angle parking: the same echelon row as lot-45-v1 mirrored, so
  // the mouth opens BEHIND a driver coming up the aisle. Nose-in is
  // geometrically impossible; the bay can only be taken backwards, and it is
  // left nose-first, which is why the whole world parks its echelon rows this
  // way outside schools and hospitals.
  {
    districtId: "lot-45rev-v1",
    prefix: "lot45r",
    label: "Учебен паркинг — косо място на 45° на заден ход",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "135",
    aisleWidthM: 7,
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },

  // 5 — the awkward side. The row hugs the WEST kerb, so the student has to
  // cross the aisle and swing the other way: every reference point of the P0
  // is mirrored and the mirror he watches changes.
  {
    districtId: "lot-left-v1",
    prefix: "lotlf",
    label: "Учебен паркинг — гнездо от лявата страна на алеята",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    side: "west",
    occupancy: "XX_XX",
    approachM: 90,
    entry: "south",
  },

  // 6 — чл. 98 at a marked crossing. The zebra sits at y = 0 (6 m of paint,
  // ЗДвП: 5 m of ban either side ⇒ the span y ∈ [−8, 8]); the two free slots
  // INSIDE it are the tempting ones and the third, at y = 11.75, is the first
  // legal one. The span is a real `noStopping` zone, so it both GRADES
  // (ILLEGAL_STOP_IN_BAN_ZONE) and STANDS a В27 post the student can read.
  {
    districtId: "lot-zebra-v1",
    prefix: "lotzb",
    label: "Учебен паркинг — паркиране до пешеходна пътека (чл. 98)",
    bays: 6,
    bayWidthM: 2.5,
    bayDepthM: 5.5,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XX___X",
    pitchesM: [6.5, 6.5, 9.0, 8.0, 6.5],
    targetIndex: 4,
    approachM: 90,
    entry: "south",
    crossings: [{ id: "lotzb-x-zebra", y: 0 }],
    banSpans: [
      { id: "lotzb-z-zebra", fromY: -8, toY: 8, signRef: "ЗДвП-98-1-1" },
    ],
  },

  // 7 — the end bay against a wall. The only free bay is the LAST of the row
  // and a garage wall closes the row 1.65 m past it, so the swing has to be
  // bought entirely from the aisle side; there is no overshoot room at all.
  // The wall itself is held scenery (a hittable ScenarioWallObstacle).
  {
    districtId: "lot-wall-v1",
    prefix: "lotwl",
    label: "Учебен паркинг — крайно гнездо до стената на гаража",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    occupancy: "XXXX_",
    approachM: 90,
    entry: "south",
  },

  // 8 — night parking on an unlit kerb. Seven bays, one free near the far end,
  // so the student drives the whole dark row on his own lamps before the
  // manoeuvre starts.
  {
    districtId: "lot-night-v1",
    prefix: "lotnt",
    label: "Учебен паркинг — нощно паркиране край неосветен ред",
    bays: 7,
    bayWidthM: 2.5,
    bayDepthM: 5.5,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XXXXX_X",
    targetIndex: 5,
    approachM: 60,
    entry: "south",
  },

  // 9 — bays on BOTH sides of the aisle (the supermarket row). The opposite
  // row of parked cars leaves a 5.56 m corridor, so the wide run-up the P0
  // allows is no longer available: the swing must start from the middle of the
  // aisle and stay there.
  {
    districtId: "lot-double-v1",
    prefix: "lotdb",
    label: "Учебен паркинг — два реда гнезда, тесен коридор между тях",
    bays: 5,
    bayWidthM: 2.7,
    bayDepthM: 5.0,
    angle: "90",
    aisleWidthM: 7,
    side: "both",
    occupancy: "XX_XX",
    occupancyWest: "XXXXX",
    approachM: 90,
    entry: "south",
  },

  // 10 — the judgement drill. TWO free slots of very different length: the
  // first has 2 × 4.4 − 4.5 = 4.3 m of clear space for a 4.04 m car (it CANNOT
  // be taken), the second has 9.5 m. Nothing else in the family teaches the
  // decision that precedes every parallel park: is this gap even a gap?
  {
    districtId: "lot-gap-judge-v1",
    prefix: "lotgj",
    label: "Учебен паркинг — прецени мястото: късо и достатъчно",
    bays: 6,
    bayWidthM: 2.5,
    bayDepthM: 4.2,
    angle: "parallel",
    aisleWidthM: 7,
    occupancy: "XX_X_X",
    pitchesM: [6.0, 4.4, 4.4, 7.0, 7.0],
    targetIndex: 4,
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
  {
    // The TARGET bay, not "the first free one" — with `targetIndex` those are
    // deliberately different (the чл. 98 drill's first free slot is the
    // illegal one) and the log used to print the wrong pose.
    const t = district.meta.scenario.bays.find((b) => b.id === district.meta.scenario.targetBayId);
    line("target bay", `${t.id} @ (${t.x}, ${t.y})`);
  }
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
