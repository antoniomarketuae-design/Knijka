/**
 * gen_rb_ped.mjs — parametric MINI-ROUNDABOUT-WITH-EXIT-ZEBRAS archetype
 * (Scenario Studio, doc 76 §3) → content/world/<districtId>.json
 *   (+ the byte-identical platform/public/world/ publish copy)
 *
 * The roundabout family's THIRD archetype. Structurally it IS
 * gen_mini_roundabout.mjs (single-lane CCW ring, four radial arms, district-v1's
 * rb-1 conventions verbatim: the ring is a closed sequence of ONEWAY edges
 * flagged `roundabout: true` with lanes 1, the arm↔ring joints are unsignalized
 * degree-3 intersections, and roundabouts[] carries {id, x, y, radius, edgeIds}
 * — which is what arms the runtime's circulatingConflict machinery and the props
 * builder's Б1+Д11 entry signs). The ONE delta is the whole archetype:
 *
 *   THE EXIT SPOKES CARRY ZEBRA CROSSINGS, A CAR-LENGTH OFF THE RING.
 *
 * WHY THE OFFSET IS THE ARCHETYPE. Leaving a roundabout is a right turn onto a
 * street, and that street's crossing carries чл. 119 like any other. The lesson
 * only exists if the geometry leaves a STOP POCKET between the ring and the
 * zebra that holds EXACTLY ONE CAR: big enough that a driver who yields to the
 * crosser waits clear of the ring, small enough that a second car cannot stack
 * into it — so the driver behind must hold ON THE RING'S APPROACH rather than
 * pile into the circulatory carriageway. Author the zebra one metre nearer and
 * the pocket cannot hold a car, so the correct stop blocks the ring and the
 * teach inverts; author it five metres further and two cars fit, the pocket
 * stops being a decision, and the teach evaporates. The self-validation below
 * enforces BOTH walls (see POCKET INVARIANT).
 *
 * The numbers, resolved at the engine's perceptual scale:
 *   · ring centerline R = 18; the drawn ring lane is 8.125 m wide, so the
 *     circulatory carriageway's OUTER EDGE sits at r = 22.06;
 *   · crossings at r = R + 12 = 30 on their arm's centerline;
 *   · pocket = 30 − 22.06 = 7.94 m. One car (4.3 m — the engine's own
 *     LEAD_CAR_LENGTH_M) fits with room to stop; two (8.6 m) do not.
 *
 * NO ZEBRA ON THE ENTRY (south) ARM — the spokes that carry zebras are the EXIT
 * spokes. This is not decoration: CrossingZoneTracker arms a zone from the
 * crossing's host edge AND every edge sharing a node with it, so a zebra on the
 * south arm would arm a crossing zone over the whole approach and mask the
 * approach's own grading (rules/engine.ts gates several detectors on
 * `s.crossing === null`).
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * rb-ped-district.test.ts.
 *
 * Layout (x = east, y = north, ring center at the origin; circulation is
 * COUNTER-CLOCKWISE viewed from above — right-hand traffic, the rb-1 flow):
 *
 *                 rbp-n-n-out (0, R+armLen)
 *                      │  north arm (the drill's EXIT)
 *                 ═══ rbp-x-n (0, 30) ═══   ← zebra, a car-length off the ring
 *                      │
 *                 rbp-n-n (0, R)
 *                ╱             ╲          ring edges (oneway, CCW):
 *      rbp-n-w (-R, 0)     rbp-n-e (R, 0)   s→e, e→n, n→w, w→s
 *                ╲             ╱
 *                 rbp-n-s (0, -R)
 *                      │  south arm (the scenario entry — NO zebra)
 *                 rbp-n-s-out (0, -R-armLen)
 *
 * (rbp-x-e at (30, 0) and rbp-x-w at (−30, 0) dress the other two exit spokes
 * identically — the driver must read WHICH exit is theirs, not learn "the map
 * has one zebra".)
 *
 * No signals, no stop lines (the stop-sign heuristic skips roundabout nodes by
 * design — priority-inside, yield on entry). Deterministic: same params →
 * byte-identical JSON. Run: node tools/maps/gen_rb_ped.mjs
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
/** The engine's own car length (orchestrator/runners.ts LEAD_CAR_LENGTH_M) —
 *  the unit the POCKET INVARIANT is measured in. NOT scaled: the perceptual
 *  scale inflates roads, never vehicles. */
const CAR_LENGTH_M = 4.3;

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
 *   districtId: string,       // output file name + LessonSpec.world.districtId
 *   label: string,            // human label (meta)
 *   ringRadiusM: number,      // ring centerline radius (14..30 — the drawn ring
 *                             //   lane is 8.125 m wide at the perceptual scale)
 *   arms: 4,                  // radial arms (v1 ships the 4-arm cross)
 *   armLengthM: number,       // arm length from ring node to the outer end (>= 60)
 *   entryArm: "south",        // the spoke the drill approaches on (no zebra)
 *   crossingOffsetM: number,  // ring node → zebra, along the arm (THE archetype
 *                             //   dial — see the POCKET INVARIANT)
 *   ringSpeedKmh: number,     // legal limit on the ring (20..30)
 *   armSpeedKmh: number,      // legal limit on the arms (30..50)
 * }} params
 */
export function buildRoundaboutPedDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    ringRadiusM,
    arms,
    armLengthM,
    entryArm,
    crossingOffsetM,
    ringSpeedKmh,
    armSpeedKmh,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(ringRadiusM >= 14 && ringRadiusM <= 30)) errors.push(`ringRadiusM must be within 14..30 m, got ${ringRadiusM}`);
  if (arms !== 4) errors.push(`arms must be 4 (the v1 cross layout), got ${arms}`);
  if (!(armLengthM >= 60 && armLengthM <= 300)) errors.push(`armLengthM must be within 60..300 m, got ${armLengthM}`);
  if (entryArm !== "south") errors.push(`entryArm must be "south" (the v1 approach), got ${entryArm}`);
  if (!(ringSpeedKmh >= 20 && ringSpeedKmh <= 30)) errors.push(`ringSpeedKmh must be within 20..30, got ${ringSpeedKmh}`);
  if (!(armSpeedKmh >= 30 && armSpeedKmh <= 50)) errors.push(`armSpeedKmh must be within 30..50, got ${armSpeedKmh}`);
  // The pocket walls, stated as PARAMETER law so the failure is readable before
  // any geometry is built (the self-validation below re-proves it on the output).
  const ringOuterEdgeM = ringRadiusM + SCALED_LANE_W / 2;
  const pocketM = r2(ringRadiusM + crossingOffsetM - ringOuterEdgeM);
  if (!(pocketM >= CAR_LENGTH_M)) {
    errors.push(
      `crossingOffsetM ${crossingOffsetM} leaves a ${pocketM} m stop pocket — a yielding car (${CAR_LENGTH_M} m) would block the ring`,
    );
  }
  if (!(pocketM < 2 * CAR_LENGTH_M)) {
    errors.push(
      `crossingOffsetM ${crossingOffsetM} leaves a ${pocketM} m stop pocket — two cars (${2 * CAR_LENGTH_M} m) stack into it and the pocket stops being a decision`,
    );
  }
  if (!(crossingOffsetM < armLengthM - 40)) {
    errors.push(`crossingOffsetM ${crossingOffsetM} leaves under 40 m of run-out past the zebra`);
  }
  if (errors.length > 0) throw new Error(`gen_rb_ped params invalid:\n  - ${errors.join("\n  - ")}`);

  const R = ringRadiusM;
  const OUT = r2(R + armLengthM);
  const XZ = r2(R + crossingOffsetM); // zebra distance from the ring centre
  const laneCenterM = r2(SCALED_LANE_W / 2); // arm right-lane center offset
  const halfCarriagewayM = SCALED_LANE_W; // 2-lane arms: 2 × 8.125 / 2

  // -- Nodes: 4 ring joints + 4 arm outer ends.
  const NODES = {
    "rbp-n-s": [0, -R],
    "rbp-n-e": [R, 0],
    "rbp-n-n": [0, R],
    "rbp-n-w": [-R, 0],
    "rbp-n-s-out": [0, -OUT],
    "rbp-n-e-out": [OUT, 0],
    "rbp-n-n-out": [0, OUT],
    "rbp-n-w-out": [-OUT, 0],
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
      // "unclassified", NOT an arterial class: PARKING_LANE_CLASSES adds a 4 m
      // curb parking band to arterial classes, and a parking band across the
      // stop pocket would be a 4 m lie about where the carriageway ends —
      // exactly the measurement this archetype is built on (the gen_rb_2lane
      // ruling, inherited).
      class: "unclassified",
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
    ringEdge("rbp-e-ring-se", "rbp-n-s", "rbp-n-e", 0, 90),
    ringEdge("rbp-e-ring-en", "rbp-n-e", "rbp-n-n", 90, 180),
    ringEdge("rbp-e-ring-nw", "rbp-n-n", "rbp-n-w", 180, 270),
    ringEdge("rbp-e-ring-ws", "rbp-n-w", "rbp-n-s", 270, 360),
    // Radial arms, authored outer-end → ring (the approach direction).
    armEdge("rbp-e-arm-s", "rbp-n-s-out", "rbp-n-s"),
    armEdge("rbp-e-arm-e", "rbp-n-e-out", "rbp-n-e"),
    armEdge("rbp-e-arm-n", "rbp-n-n-out", "rbp-n-n"),
    armEdge("rbp-e-arm-w", "rbp-n-w-out", "rbp-n-w"),
  ];
  const RING_EDGE_IDS = ["rbp-e-ring-se", "rbp-e-ring-en", "rbp-e-ring-nw", "rbp-e-ring-ws"];

  // -- Intersections: the 4 arm↔ring joints (degree 3, uncontrolled — the
  // stop-sign heuristic skips roundabout members; entry priority is the
  // runtime's circulatingConflict adjudication).
  const INTERSECTIONS = [
    { id: "rbp-n-s", x: 0, y: -R, degree: 3, signalized: false },
    { id: "rbp-n-e", x: R, y: 0, degree: 3, signalized: false },
    { id: "rbp-n-n", x: 0, y: R, degree: 3, signalized: false },
    { id: "rbp-n-w", x: -R, y: 0, degree: 3, signalized: false },
  ];

  /**
   * THE ARCHETYPE — a marked, unsignalized zebra on each EXIT spoke's
   * centerline, `crossingOffsetM` out from its ring node. The entry (south) arm
   * carries none: see the header.
   */
  const CROSSINGS = [
    { id: "rbp-x-e", x: XZ, y: 0, kind: "marked", signalized: false, edgeId: "rbp-e-arm-e" },
    { id: "rbp-x-n", x: 0, y: XZ, kind: "marked", signalized: false, edgeId: "rbp-e-arm-n" },
    { id: "rbp-x-w", x: -XZ, y: 0, kind: "marked", signalized: false, edgeId: "rbp-e-arm-w" },
  ];

  const ROUNDABOUTS = [
    // The rb-1-shaped registration the runtime + props builder consume.
    { id: "rbp-rb-1", x: 0, y: 0, radius: R, edgeIds: RING_EDGE_IDS },
  ];

  // -- Spawns: south-arm approach (the scenario entry) + a north-arm finish
  // reference past the exit zebra.
  const SPAWN_POINTS = [
    {
      id: "rbp-spawn-south",
      x: laneCenterM,
      y: r2(-OUT + 15),
      heading: 0,
      edgeId: "rbp-e-arm-s",
      name: "Подход към кръговото (юг)",
    },
    {
      id: "rbp-spawn-finish",
      x: laneCenterM,
      y: r2(XZ + 25),
      heading: 0,
      edgeId: "rbp-e-arm-n",
      name: "Контролна точка — след пътеката на изхода (север)",
    },
  ];

  // -- One corner café SW of the ring (visual anchor, clear of every
  // carriageway: > halfCarriageway + sidewalk off both the west and south arms,
  // and clear of the west zebra's approach).
  const BUILDINGS = [
    {
      id: "rbp-b-cafe",
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
      generator: "tools/maps/gen_rb_ped.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебно кръгово движение с пешеходни пътеки на изходите — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: armSpeedKmh,
        note: "Кръгово с пътеки на изходите: изходът е десен завой — мигач, а после пропусни пешеходеца. Спира се МЕЖДУ пръстена и пътеката, никога в пръстена.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the ring and
       * pocket truth. ScenarioSpecs pin the centre/radius/zebra/pocket by value
       * and the contract battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "roundabout",
        params: { ringRadiusM, arms, armLengthM, entryArm, crossingOffsetM, ringSpeedKmh, armSpeedKmh },
        center: { x: 0, y: 0 },
        ringNodeIds: ["rbp-n-s", "rbp-n-e", "rbp-n-n", "rbp-n-w"],
        ringEdgeIds: RING_EDGE_IDS,
        entryArm,
        /** The drill's exit spoke — the one the staged crosser walks. */
        exitArm: "north",
        primaryCrossingId: "rbp-x-n",
        /** Exit order counter-clockwise from the south entry — the drill counts
         *  mouths against this, it does not assume it. */
        exitOrderFromSouth: ["rbp-n-e", "rbp-n-n", "rbp-n-w"],
        laneCenterRightM: laneCenterM,
        /** Half the drawn carriageway of an arm — the crosser's road span. */
        armHalfCarriagewayM: halfCarriagewayM,
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind, edgeId: c.edgeId })),
        /** THE POCKET — resolved, so the ScenarioSpec and its trace pin numbers
         *  rather than re-derive them. */
        pocket: {
          /** Outer edge of the circulatory carriageway, m from the centre. */
          ringOuterEdgeM: r2(ringOuterEdgeM),
          /** Zebra, m from the centre (on the exit arm's centerline). */
          crossingRadiusM: XZ,
          /** Clear metres between the two — holds ONE car, never two. */
          lengthM: pocketM,
          carLengthM: CAR_LENGTH_M,
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
  // Self-validation (the invariants tools/osm/build.mjs + gen_poligon enforce,
  // plus the POCKET INVARIANT this archetype exists for)
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
  // The exit order the drill counts mouths against, derived rather than assumed.
  const fromSouth = ringSeq.findIndex((e) => e.from === "rbp-n-s");
  if (fromSouth < 0) post.push("no ring edge leaves the south node");
  else {
    const order = [0, 1, 2].map((i) => ringSeq[(fromSouth + i) % ringSeq.length].to);
    if (order.join(",") !== district.meta.scenario.exitOrderFromSouth.join(",")) {
      post.push(`exitOrderFromSouth ${district.meta.scenario.exitOrderFromSouth} != derived ${order}`);
    }
  }
  // Every arm must reach a ring node.
  const ringNodeIds = new Set(["rbp-n-s", "rbp-n-e", "rbp-n-n", "rbp-n-w"]);
  for (const e of EDGES) {
    if (e.roundabout) continue;
    if (!ringNodeIds.has(e.to)) post.push(`${e.id}: arm must terminate on a ring node (to=${e.to})`);
  }

  // ---- THE POCKET INVARIANT — the archetype's own contract. -----------------
  const armByExit = { east: "rbp-e-arm-e", north: "rbp-e-arm-n", west: "rbp-e-arm-w" };
  const exitArmEdgeIds = new Set(Object.values(armByExit));
  if (CROSSINGS.length !== 3) post.push(`every EXIT spoke carries a zebra: expected 3, got ${CROSSINGS.length}`);
  for (const c of CROSSINGS) {
    if (!exitArmEdgeIds.has(c.edgeId)) post.push(`${c.id}: must host on an EXIT arm, got ${c.edgeId}`);
    if (c.kind !== "marked" || c.signalized !== false) post.push(`${c.id}: must be a marked, unsignalized zebra`);
    // On its arm's centerline (the axis is x or y = 0 depending on the spoke).
    const host = EDGES.find((e) => e.id === c.edgeId);
    const [ax, ay] = NODES[host.from];
    const [bx, by] = NODES[host.to];
    const axis = Math.abs(bx - ax) > Math.abs(by - ay) ? "x" : "y";
    if (axis === "x" && c.y !== 0) post.push(`${c.id}: off its arm's centerline (y=${c.y})`);
    if (axis === "y" && c.x !== 0) post.push(`${c.id}: off its arm's centerline (x=${c.x})`);
    // …and exactly `crossingOffsetM` out from the ring node it belongs to.
    const rC = r2(Math.hypot(c.x, c.y));
    if (Math.abs(rC - XZ) > 0.01) post.push(`${c.id}: zebra at r=${rC}, expected ${XZ}`);
    // THE TWO WALLS. Clear of the circulatory carriageway by at least one car…
    const clearM = r2(rC - ringOuterEdgeM);
    if (clearM < CAR_LENGTH_M) {
      post.push(`${c.id}: stop pocket ${clearM} m < one car (${CAR_LENGTH_M} m) — a yielding car blocks the ring`);
    }
    // …and never by two (a stackable pocket is not a decision).
    if (clearM >= 2 * CAR_LENGTH_M) {
      post.push(`${c.id}: stop pocket ${clearM} m fits two cars (${2 * CAR_LENGTH_M} m) — the teach evaporates`);
    }
    if (Math.abs(clearM - pocketM) > 0.01) post.push(`${c.id}: pocket ${clearM} != the declared ${pocketM}`);
    // Real run-out past the zebra, so the exit has somewhere to finish.
    if (rC > OUT - 40) post.push(`${c.id}: needs >= 40 m of run-out past the zebra`);
  }
  // The ENTRY arm must stay zebra-free — a crossing zone armed over the
  // approach masks the approach's own grading (see the header).
  if (CROSSINGS.some((c) => c.edgeId === "rbp-e-arm-s")) {
    post.push("the entry (south) arm must carry NO zebra");
  }
  // The declared primary crossing must exist and sit on the declared exit arm.
  const primary = CROSSINGS.find((c) => c.id === district.meta.scenario.primaryCrossingId);
  if (!primary) post.push(`primaryCrossingId ${district.meta.scenario.primaryCrossingId} is not a crossing`);
  else if (primary.edgeId !== armByExit[district.meta.scenario.exitArm]) {
    post.push(`primaryCrossingId ${primary.id} does not host on the declared exit arm`);
  }
  // No zebra may fall inside the ring band the runtime treats as roundabout
  // (radius + ROUNDABOUT_BAND_EXTRA_M = 9, worldRuntime) — a crossing inside the
  // band would be a zebra IN the roundabout, which is not this archetype.
  for (const c of CROSSINGS) {
    if (Math.hypot(c.x, c.y) <= R + 9) post.push(`${c.id}: sits inside the runtime's ring band (R + 9)`);
  }

  const distToSegment = (x, y, [ax, ay], [bx, by]) => {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
  };
  // Every crossing must actually sit ON its host edge's carriageway.
  for (const c of CROSSINGS) {
    const host = EDGES.find((e) => e.id === c.edgeId);
    if (!host) {
      post.push(`${c.id}: unknown edgeId ${c.edgeId}`);
      continue;
    }
    let best = Infinity;
    for (let i = 0; i < host.geometry.length - 1; i++) {
      best = Math.min(best, distToSegment(c.x, c.y, host.geometry[i], host.geometry[i + 1]));
    }
    if (best > 0.01) post.push(`${c.id}: not on its host edge (${r2(best)} m off)`);
  }
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
  // The finish reference must sit PAST the exit zebra (the drill ends beyond it).
  const finish = SPAWN_POINTS.find((s) => s.id === "rbp-spawn-finish");
  if (!finish || finish.y <= XZ) post.push("rbp-spawn-finish must sit past the north exit zebra");
  if (ROUNDABOUTS.length !== 1 || ROUNDABOUTS[0].edgeIds.length !== 4) post.push("roundabouts[] must register the 4 ring edges");
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rb_ped self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// rb-ped-v1 instance — the sc-rb-ped-exit product map (doc 76 §3): the
// rb-mini-v1 ring verbatim (single-lane R=18, 4 arms of 90 m) with a marked
// zebra 12 m out from each EXIT spoke's ring node — a 7.94 m stop pocket that
// holds exactly one car.
// ---------------------------------------------------------------------------

const RBP_PARAMS = {
  districtId: "rb-ped-v1",
  label: "Учебно кръгово движение с пешеходни пътеки на изходите — еднолентов кръг с 4 рамена (сценарий RB)",
  ringRadiusM: 18,
  arms: 4,
  armLengthM: 90,
  entryArm: "south",
  // THE DIAL. 12 m out from the ring node = 7.94 m of clear pocket beyond the
  // circulatory carriageway: one 4.3 m car fits and stops clear of the ring;
  // two (8.6 m) do not. Both walls are enforced above.
  crossingOffsetM: 12,
  ringSpeedKmh: 30,
  armSpeedKmh: 40,
};

const district = buildRoundaboutPedDistrict(RBP_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${RBP_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${RBP_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== roundabout-with-exit-zebras build: ${RBP_PARAMS.districtId} ===`);
line("ring radius / arms", `${RBP_PARAMS.ringRadiusM} m / ${RBP_PARAMS.arms}`);
line("ring / arm speed", `${RBP_PARAMS.ringSpeedKmh} / ${RBP_PARAMS.armSpeedKmh} km/h`);
line("ring edges", district.roundabouts[0].edgeIds.join(", "));
line("entry / exit arm", `${district.meta.scenario.entryArm} → ${district.meta.scenario.exitArm}`);
line("exit order from south", district.meta.scenario.exitOrderFromSouth.join(" → "));
line("zebras", district.crossings.map((c) => `${c.id}@(${c.x}, ${c.y})`).join(", "));
line(
  "stop pocket",
  `${district.meta.scenario.pocket.lengthM} m (ring edge ${district.meta.scenario.pocket.ringOuterEdgeM} → zebra ${district.meta.scenario.pocket.crossingRadiusM}) — one ${CAR_LENGTH_M} m car, never two`,
);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("intersections", `${district.meta.stats.intersections} (all uncontrolled ring joints)`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK — the pocket invariant holds.");
