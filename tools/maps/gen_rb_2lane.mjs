/**
 * gen_rb_2lane.mjs — parametric TWO-LANE ROUNDABOUT map archetype
 * (Scenario Studio, doc 76 §3) → content/world/<districtId>.json
 *   (+ the byte-identical platform/public/world/ publish copy)
 *
 * The roundabout family's SECOND archetype, and the delta against
 * gen_mini_roundabout.mjs is the whole point of it: the ring carries TWO
 * lanes, the approaches carry two lanes PER DIRECTION, and the diameter grows
 * so both actually fit. Everything else is that generator's rb-1 encoding
 * verbatim (the ring is a closed sequence of ONEWAY edges flagged
 * `roundabout: true`, the arm↔ring joints are unsignalized degree-3
 * intersections, roundabouts[] carries {id, x, y, radius, edgeIds} — which is
 * what arms the runtime's circulatingConflict machinery and the props
 * builder's Б1+Д11 entry signs).
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * rb-2lane-district.test.ts.
 *
 * Layout (x = east, y = north, ring center at the origin; circulation is
 * COUNTER-CLOCKWISE viewed from above — right-hand traffic, the rb-1 flow):
 *
 *                 rb2-n-n-out (0, R+armLen)
 *                      ║  north arm (2 lanes per direction)
 *                 rb2-n-n (0, R)
 *                ╱             ╲          ring edges (oneway, 2 lanes, CCW):
 *      rb2-n-w (-R, 0)     rb2-n-e (R, 0)   s→e, e→n, n→w, w→s
 *                ╲             ╱
 *                 rb2-n-s (0, -R)
 *                      ║  south arm (the scenario entry)
 *                 rb2-n-s-out (0, -R-armLen)
 *
 * WHY THE RADIUS GREW. The engine's lane model is procedural (runtime/
 * locator.ts): a oneway edge centres `lanes` bands of LANE_WIDTH_M on its
 * polyline, so a 2-lane ring is a 16.25 m-wide band straddling the ring
 * centerline — lane 0 (the OUTER, curb lane, laneId 0 = rightmost of travel)
 * rides R + W/2 and lane 1 (the INNER) rides R − W/2. At the mini map's R = 18
 * the inner lane would ride r = 13.94 and the central island would be 9.9 m
 * across: a bollard, not a roundabout. R = 26 leaves a 17.9 m island, an inner
 * lane at r = 21.94 and an outer at r = 30.06 — the geometry a two-lane ring
 * needs to be a two-lane ring.
 *
 * WHY THE ARROWS ARE META, NOT A DATA LAYER (the gen_ln_arrows ruling,
 * inherited verbatim): district-v1 `zones` has no lane-intent kind, so nothing
 * in the runtime reads a painted arrow. The assignment lives in
 * meta.scenario.laneArrows as authored TRUTH the ScenarioSpec teaches from and
 * gates with objectives; the battery asserts the copy. Claiming otherwise
 * would be claiming a detector that does not exist.
 *
 * No signals, no stop lines (the stop-sign heuristic skips roundabout nodes by
 * design — priority-inside, yield on entry), no crossings. Deterministic:
 * same params → byte-identical JSON. Run: node tools/maps/gen_rb_2lane.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m.
 *  (runtime/spatial.ts LANE_WIDTH_M and traffic laneWidthM are this number.) */
const SCALED_LANE_W = 3.25 * 2.5;
/** Ring quarter-arc sampling step, degrees (rb-1 rides ~5 m point spacing). */
const ARC_STEP_DEG = 15;

/** Exit sets the two approach lanes are painted for — AUTHORED pedagogy. */
const ARROW_KINDS = ["nearExits", "farExits"];
const ARROW_LABELS_BG = {
  nearExits: "Външна лента — първи и втори изход",
  farExits: "Вътрешна лента — трети изход и обратен завой",
};

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
 *   districtId: string,     // output file name + LessonSpec.world.districtId
 *   label: string,          // human label (meta)
 *   ringRadiusM: number,    // ring CENTERLINE radius (22..40 — the drawn ring
 *                           //   band is 2 × 8.125 m wide and must leave an
 *                           //   island; see the header)
 *   ringLanes: 2,           // v1 ships the two-lane ring (the archetype)
 *   arms: 4,                // radial arms (v1 ships the 4-arm cross)
 *   armLengthM: number,     // arm length from ring node to the outer end (>= 60)
 *   armLanes: 4,            // 2 per direction — the drill needs a lane CHOICE
 *   ringSpeedKmh: number,   // legal limit on the ring (20..30)
 *   armSpeedKmh: number,    // legal limit on the arms (30..60)
 *   arrowsFromM: number,    // painted-arrow span start, m before the ring node
 * }} params
 */
export function buildTwoLaneRoundaboutDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    ringRadiusM,
    ringLanes,
    arms,
    armLengthM,
    armLanes,
    ringSpeedKmh,
    armSpeedKmh,
    arrowsFromM,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (ringLanes !== 2) errors.push(`ringLanes must be 2 (the archetype), got ${ringLanes}`);
  if (armLanes !== 4) errors.push(`armLanes must be 4 (2 per direction — the lane choice), got ${armLanes}`);
  if (!(ringRadiusM >= 22 && ringRadiusM <= 40)) {
    errors.push(`ringRadiusM must be within 22..40 m (a 2-lane band needs an island), got ${ringRadiusM}`);
  }
  if (arms !== 4) errors.push(`arms must be 4 (the v1 cross layout), got ${arms}`);
  if (!(armLengthM >= 60 && armLengthM <= 300)) errors.push(`armLengthM must be within 60..300 m, got ${armLengthM}`);
  if (!(ringSpeedKmh >= 20 && ringSpeedKmh <= 30)) errors.push(`ringSpeedKmh must be within 20..30, got ${ringSpeedKmh}`);
  if (!(armSpeedKmh >= 30 && armSpeedKmh <= 60)) errors.push(`armSpeedKmh must be within 30..60, got ${armSpeedKmh}`);
  if (!(arrowsFromM > 0 && arrowsFromM < armLengthM)) {
    errors.push(`arrowsFromM must be within (0, armLengthM), got ${arrowsFromM}`);
  }
  if (errors.length > 0) throw new Error(`gen_rb_2lane params invalid:\n  - ${errors.join("\n  - ")}`);

  const R = ringRadiusM;
  const OUT = r2(R + armLengthM);
  const W = SCALED_LANE_W;
  const ringLanesPerDir = ringLanes; // oneway ⇒ every lane is one direction's
  const armLanesPerDir = armLanes / 2; // two-way ⇒ half the tags per bank

  /**
   * RING lane centerline RADII, laneId 0 first (the locator's numbering:
   * laneId 0 = rightmost OF TRAVEL = the OUTER lane, because the ring turns
   * CCW and the driver's right points away from the centre).
   * Oneway lane math (locator.computeLane): the bank spans ±(lanes·W)/2 about
   * the polyline; lane j centres at d = lanes·W − (j + 0.5)·W measured from
   * the bank's LEFT edge, i.e. at signed lateral (lanes·W/2 − d) left of
   * travel. Left of a CCW ring is INWARD, so radius = R − that.
   */
  const RING_LANE_RADII = [];
  for (let j = 0; j < ringLanesPerDir; j++) {
    const d = ringLanesPerDir * W - (j + 0.5) * W;
    RING_LANE_RADII.push(r2(R - ((ringLanesPerDir * W) / 2 - d)));
  }

  /**
   * ARM lane centerline OFFSETS from the arm centerline, laneId 0 first, for
   * the INBOUND (toward-the-ring) bank. Two-way lane math: lane j centres at
   * d = (lanesPerDir − 1 − j + 0.5)·W into the bank.
   */
  const ARM_LANE_CENTERS = [];
  for (let j = 0; j < armLanesPerDir; j++) {
    ARM_LANE_CENTERS.push(r2((armLanesPerDir - 1 - j + 0.5) * W));
  }
  /** laneId 0 = the CURB lane of an approach; laneId 1 = the inner one. */
  const ARM_CURB_LANE_M = ARM_LANE_CENTERS[0];
  const ARM_INNER_LANE_M = ARM_LANE_CENTERS[1];

  // -- Nodes: 4 ring joints + 4 arm outer ends.
  const NODES = {
    "rb2-n-s": [0, -R],
    "rb2-n-e": [R, 0],
    "rb2-n-n": [0, R],
    "rb2-n-w": [-R, 0],
    "rb2-n-s-out": [0, -OUT],
    "rb2-n-e-out": [OUT, 0],
    "rb2-n-n-out": [0, OUT],
    "rb2-n-w-out": [-OUT, 0],
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
      lanes: ringLanes, // THE archetype delta — two circulating lanes
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
      // "unclassified", NOT "secondary": PARKING_LANE_CLASSES adds a 4 m curb
      // parking band to arterial classes, and a parking band on a roundabout
      // approach is both wrong and a 4 m lie about where the carriageway ends.
      class: "unclassified",
      name: "Подход към кръговото",
      oneway: false,
      roundabout: false,
      lanes: armLanes, // 2 per direction — the lane CHOICE the drill grades
      lanesSource: "tag",
      maxspeed: armSpeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const EDGES = [
    // The closed CCW ring (s → e → n → w → s), rb-1 conventions.
    ringEdge("rb2-e-ring-se", "rb2-n-s", "rb2-n-e", 0, 90),
    ringEdge("rb2-e-ring-en", "rb2-n-e", "rb2-n-n", 90, 180),
    ringEdge("rb2-e-ring-nw", "rb2-n-n", "rb2-n-w", 180, 270),
    ringEdge("rb2-e-ring-ws", "rb2-n-w", "rb2-n-s", 270, 360),
    // Radial arms, authored outer-end → ring (the approach direction, so the
    // geometry-forward bank IS the inbound one the arrows are painted on).
    armEdge("rb2-e-arm-s", "rb2-n-s-out", "rb2-n-s"),
    armEdge("rb2-e-arm-e", "rb2-n-e-out", "rb2-n-e"),
    armEdge("rb2-e-arm-n", "rb2-n-n-out", "rb2-n-n"),
    armEdge("rb2-e-arm-w", "rb2-n-w-out", "rb2-n-w"),
  ];
  const RING_EDGE_IDS = ["rb2-e-ring-se", "rb2-e-ring-en", "rb2-e-ring-nw", "rb2-e-ring-ws"];
  const ARM_EDGE_IDS = ["rb2-e-arm-s", "rb2-e-arm-e", "rb2-e-arm-n", "rb2-e-arm-w"];

  // -- Intersections: the 4 arm↔ring joints (degree 3, uncontrolled — the
  // stop-sign heuristic skips roundabout members; entry priority is the
  // runtime's circulatingConflict adjudication).
  const INTERSECTIONS = [
    { id: "rb2-n-s", x: 0, y: -R, degree: 3, signalized: false },
    { id: "rb2-n-e", x: R, y: 0, degree: 3, signalized: false },
    { id: "rb2-n-n", x: 0, y: R, degree: 3, signalized: false },
    { id: "rb2-n-w", x: -R, y: 0, degree: 3, signalized: false },
  ];

  const CROSSINGS = [];
  const ROUNDABOUTS = [
    // The rb-1-shaped registration the runtime + props builder consume.
    { id: "rb2-rb-1", x: 0, y: 0, radius: R, edgeIds: RING_EDGE_IDS },
  ];

  // -- Spawns: BOTH south-arm approach lanes (the drill's choice is which one
  // you start in) + a west-arm finish reference past the third exit.
  const SPAWN_POINTS = [
    {
      id: "rb2-spawn-south-inner",
      x: ARM_INNER_LANE_M,
      y: r2(-OUT + 15),
      heading: 0,
      edgeId: "rb2-e-arm-s",
      name: "Подход към кръговото — вътрешна лента (юг)",
    },
    {
      id: "rb2-spawn-south-outer",
      x: ARM_CURB_LANE_M,
      y: r2(-OUT + 15),
      heading: 0,
      edgeId: "rb2-e-arm-s",
      name: "Подход към кръговото — външна лента (юг)",
    },
    {
      id: "rb2-spawn-finish",
      x: r2(-R - 40),
      y: ARM_CURB_LANE_M,
      heading: 270,
      edgeId: "rb2-e-arm-w",
      name: "Контролна точка — след третия изход (запад)",
    },
  ];

  // -- One corner café SW of the ring (visual anchor, clear of every
  // carriageway: the arms are 4 lanes = 16.25 m of half-width each).
  const BUILDINGS = [
    {
      id: "rb2-b-cafe",
      height: 4,
      heightSource: "default",
      footprint: [
        [-R - 44, -R - 44],
        [-R - 32, -R - 44],
        [-R - 32, -R - 32],
        [-R - 44, -R - 32],
      ].map(([x, y]) => [r2(x), r2(y)]),
    },
  ];

  // -- Bounds + stats. halfRoadM is the WIDEST carriageway half (the 4-lane
  // arms), so the bounds hold every drawn surface.
  const halfRoadM = (armLanes * W) / 2;
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
      generator: "tools/maps/gen_rb_2lane.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебно двулентово кръгово движение — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: armSpeedKmh,
        note: "Двулентово кръгово: външната лента е за първите изходи, вътрешната — за далечните. Лентата се избира ПРЕДИ кръга.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the ring
       * truth. ScenarioSpecs pin the centre/radius/lane radii by value and the
       * contract battery asserts the copy matches this file.
       */
      scenario: {
        archetype: "roundabout",
        params: { ringRadiusM, ringLanes, arms, armLengthM, armLanes, ringSpeedKmh, armSpeedKmh, arrowsFromM },
        center: { x: 0, y: 0 },
        ringNodeIds: ["rb2-n-s", "rb2-n-e", "rb2-n-n", "rb2-n-w"],
        ringEdgeIds: RING_EDGE_IDS,
        armEdgeIds: ARM_EDGE_IDS,
        entryArm: "south",
        /** Exit order counter-clockwise from the south entry — the drill counts
         *  mouths against this, it does not assume it. */
        exitOrderFromSouth: ["rb2-n-e", "rb2-n-n", "rb2-n-w"],
        /** LANE TRUTH — the locator's procedural lane model, resolved. */
        ringLanesPerDirection: ringLanesPerDir,
        /** laneId 0 = OUTER (rightmost of travel), 1 = INNER. */
        ringLaneRadiiM: RING_LANE_RADII,
        armLanesPerDirection: armLanesPerDir,
        /** laneId 0 = CURB lane, 1 = inner lane; offsets from the arm axis. */
        armLaneCentersM: ARM_LANE_CENTERS,
        /**
         * The arrow assignment — AUTHORED PEDAGOGY, not a graded data layer
         * (see the header): district-v1 has no lane-intent zone kind, so
         * nothing in the runtime reads this. The ScenarioSpec teaches from it
         * and gates the correct lane with a reachZone objective.
         */
        laneArrows: {
          edgeIds: ARM_EDGE_IDS,
          /** Bank the arrows are painted on: +1 = geometry-forward = inbound. */
          travelDir: 1,
          /** Painted span along each arm, m from its outer node to the ring. */
          fromM: r2(armLengthM - arrowsFromM),
          toM: armLengthM,
          lanes: [
            {
              laneId: 0,
              centerM: ARM_CURB_LANE_M,
              arrow: "nearExits",
              exits: [1, 2],
              labelBg: ARROW_LABELS_BG.nearExits,
            },
            {
              laneId: 1,
              centerM: ARM_INNER_LANE_M,
              arrow: "farExits",
              exits: [3, 4],
              labelBg: ARROW_LABELS_BG.farExits,
            },
          ],
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
  // plus the two-lane ones this archetype adds)
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
  // roundabout + TWO-lane (the rb-1 encoding, at the archetype's lane count).
  const ringSeq = RING_EDGE_IDS.map((id) => EDGES.find((e) => e.id === id));
  for (let i = 0; i < ringSeq.length; i++) {
    const cur = ringSeq[i];
    const nxt = ringSeq[(i + 1) % ringSeq.length];
    if (cur.to !== nxt.from) post.push(`ring break: ${cur.id}.to (${cur.to}) != ${nxt.id}.from (${nxt.from})`);
    if (!cur.oneway || !cur.roundabout || cur.lanes !== ringLanes) {
      post.push(`${cur.id}: ring edges must be oneway, roundabout, lanes ${ringLanes}`);
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
  const fromSouth = ringSeq.findIndex((e) => e.from === "rb2-n-s");
  if (fromSouth < 0) post.push("no ring edge leaves the south node");
  else {
    const order = [0, 1, 2].map((i) => ringSeq[(fromSouth + i) % ringSeq.length].to);
    if (order.join(",") !== district.meta.scenario.exitOrderFromSouth.join(",")) {
      post.push(`exitOrderFromSouth ${district.meta.scenario.exitOrderFromSouth} != derived ${order}`);
    }
  }
  // Every arm must reach a ring node and carry 2 lanes per direction.
  const ringNodeIds = new Set(["rb2-n-s", "rb2-n-e", "rb2-n-n", "rb2-n-w"]);
  for (const e of EDGES) {
    if (e.roundabout) continue;
    if (!ringNodeIds.has(e.to)) post.push(`${e.id}: arm must terminate on a ring node (to=${e.to})`);
    if (e.oneway || e.lanes !== armLanes) post.push(`${e.id}: arms must be two-way with ${armLanes} lanes`);
  }
  // TWO-LANE INVARIANTS — the archetype's own contract.
  if (RING_LANE_RADII.length !== 2) post.push(`ringLaneRadiiM must name both ring lanes`);
  const [outerR, innerR] = RING_LANE_RADII;
  if (!(outerR > R && innerR < R)) post.push(`lane 0 must be the OUTER lane and lane 1 the INNER (got ${outerR}/${innerR})`);
  if (Math.abs(outerR - innerR - W) > 0.02) post.push(`ring lanes must be one lane width apart, got ${r2(outerR - innerR)}`);
  // The inner lane must leave a real central island, not a painted dot.
  const islandR = r2(R - (ringLanes * W) / 2);
  if (islandR < 8) post.push(`central island radius ${islandR} m is too small for a 2-lane ring`);
  // Both ring lanes must sit inside the runtime's ROUNDABOUT band (radius + 9,
  // worldRuntime ROUNDABOUT_BAND_EXTRA_M) — otherwise a circulating car in the
  // outer lane is invisible to circulatingConflict and the entry teaches nothing.
  if (outerR > R + 9) post.push(`outer ring lane r=${outerR} escapes the runtime's ring band (R + 9)`);
  // The arm lanes must sit inside their own carriageway half-width.
  for (const c of ARM_LANE_CENTERS) {
    if (!(c > 0 && c < halfRoadM)) post.push(`arm lane centre ${c} is outside the carriageway half-width ${halfRoadM}`);
  }
  if (Math.abs(ARM_CURB_LANE_M - ARM_INNER_LANE_M - W) > 0.02) {
    post.push(`arm lanes must be one lane width apart, got ${r2(ARM_CURB_LANE_M - ARM_INNER_LANE_M)}`);
  }
  // The arrow assignment must actually TEACH a choice: distinct exit sets, and
  // the third exit reachable from exactly one lane (the drill's premise).
  const arrowLanes = district.meta.scenario.laneArrows.lanes;
  if (arrowLanes.length !== armLanesPerDir) post.push(`laneArrows must name one arrow per inbound lane`);
  for (const l of arrowLanes) {
    if (!ARROW_KINDS.includes(l.arrow)) post.push(`laneArrows[${l.laneId}]: unknown arrow ${l.arrow}`);
  }
  if (new Set(arrowLanes.map((l) => l.arrow)).size !== arrowLanes.length) {
    post.push(`the two approach lanes carry the same arrow — the drill has no lane choice`);
  }
  const thirdExitLanes = arrowLanes.filter((l) => l.exits.includes(3));
  if (thirdExitLanes.length !== 1 || thirdExitLanes[0].laneId !== 1) {
    post.push(`exactly ONE lane (the inner, laneId 1) must be painted for the third exit`);
  }
  if (!arrowLanes.some((l) => l.exits.includes(1) && l.laneId === 0)) {
    post.push(`the outer lane (laneId 0) must be painted for the first exit`);
  }
  const distToSegment = (x, y, [ax, ay], [bx, by]) => {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
  };
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
  if (ROUNDABOUTS.length !== 1 || ROUNDABOUTS[0].edgeIds.length !== 4) post.push("roundabouts[] must register the 4 ring edges");
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rb_2lane self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// rb-2lane-v1 instance — the sc-rb-lane-choice product map (doc 76 §3):
// two-lane ring R=26 (the island reads 17.9 m across), 4 arms of 2×2 lanes,
// 90 m approaches carrying the lane arrows over their last 60 m.
// ---------------------------------------------------------------------------

const RB2_PARAMS = {
  districtId: "rb-2lane-v1",
  label: "Учебно двулентово кръгово движение — двулентов кръг с 4 рамена (сценарий RB)",
  ringRadiusM: 26,
  ringLanes: 2,
  arms: 4,
  armLengthM: 90,
  armLanes: 4,
  ringSpeedKmh: 30,
  armSpeedKmh: 50,
  // The lane must be chosen BEFORE the ring, so the arrows have to be readable
  // with room to reposition: 60 m of painted span is ~4.3 s at the arm's 50.
  arrowsFromM: 60,
};

const district = buildTwoLaneRoundaboutDistrict(RB2_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${RB2_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${RB2_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== two-lane roundabout build: ${RB2_PARAMS.districtId} ===`);
line("ring radius / lanes", `${RB2_PARAMS.ringRadiusM} m / ${RB2_PARAMS.ringLanes}`);
line("ring lane radii (0,1)", district.meta.scenario.ringLaneRadiiM.join(" / "));
line("central island radius", `${r2(RB2_PARAMS.ringRadiusM - (RB2_PARAMS.ringLanes * SCALED_LANE_W) / 2)} m`);
line("arm lanes / centers", `${RB2_PARAMS.armLanes} (2 per dir) @ ${district.meta.scenario.armLaneCentersM.join(" / ")}`);
line("ring / arm speed", `${RB2_PARAMS.ringSpeedKmh} / ${RB2_PARAMS.armSpeedKmh} km/h`);
line("exit order from south", district.meta.scenario.exitOrderFromSouth.join(" → "));
line("lane arrows", district.meta.scenario.laneArrows.lanes.map((l) => `${l.laneId}:${l.arrow}[${l.exits}]`).join(" "));
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("intersections", `${district.meta.stats.intersections} (all uncontrolled ring joints)`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK — the two-lane invariants hold.");
