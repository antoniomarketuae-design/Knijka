/**
 * gen_rb_single.mjs — parametric SINGLE (full-size) ROUNDABOUT archetype
 * (Scenario Studio, doc 76 §3) → content/world/<districtId>.json
 *   (+ the byte-identical platform/public/world/ publish copy)
 *
 * WHY THIS ARCHETYPE EXISTS — the founder's verdict on q-krastovishta-064/065:
 *
 *     „the map … it is not real roundabout - rather 4 small roundabouts"
 *     „4 small roundabouts which in fact on the map are not roundabouts
 *      rather look like some wrong thing, we need proper 1 roundabout"
 *
 * He is right, and the cause is geometric, not cosmetic. The engine opens a
 * junction pad at EVERY node of degree >= 3 whose radius is
 * `nodeOpenRadiusM = widestApproachHalfWidth + curbFilletRadius`
 * (world/builders/network.ts + constants.ts). On a 2-lane arm at the
 * perceptual road scale that is 8.125 + 9 = 17.13 m — and the pad is opened at
 * each of the four arm↔ring joints. rb-mini-v1 puts those joints on an R = 18
 * ring, i.e. 25.5 m apart: the four pads overlap, the ring arcs between them
 * are trimmed down to ~3 m, and what renders is FOUR TOUCHING CIRCLES around a
 * star-shaped scrap of grass. Exactly the picture the founder rejected.
 *
 * A ring therefore only reads as ONE roundabout when its radius leaves BOTH:
 *   · a circulatory carriageway between consecutive mouths — quarter arc minus
 *     the two junction pads it is trimmed by, and
 *   · a central island the pads cannot bite through.
 * Both are computed exactly (not guessed) and enforced below as the
 * ONE-ROUNDABOUT INVARIANT. That invariant is the whole archetype: it is why
 * `ringRadiusM` here is bounded 30..60 instead of the roundabout family's
 * 14..30, and it is what makes it impossible to regenerate the founder's bug.
 *
 * WHY A NEW DISTRICT RATHER THAN A BIGGER rb-mini-v1. rb-mini-v1's R = 18 is
 * pinned BY VALUE by the scenario templates (templates-roundabout.ts /
 * templates-flow.ts), by every authored trace on them, and by ~4 bot-completion
 * batteries that grade real verdicts off ring phase, mouth spacing and gap
 * timing. Growing that ring would silently move graded verdicts, which is not
 * a thing a picture fix may do. rb-mini-v1 is left byte-identical; this file
 * ships the honest roundabout the STILLS (and any future full-size ring
 * scenario) are authored against.
 *
 * Encoded with district-v1's rb-1 conventions exactly, like the rest of the
 * family: the ring is a closed sequence of ONEWAY edges flagged
 * `roundabout: true` (lanes 1), the arm↔ring joints are unsignalized degree-3
 * intersections, and roundabouts[] carries {id, x, y, radius, edgeIds} — which
 * is what arms the runtime's circulatingConflict machinery and the props
 * builder's Б1 (give way) + Д11 (roundabout) entry signs. The Б1 approach also
 * makes the world builder paint the DASHED GIVE-WAY LINE across every entry
 * (markings.ts paintStopLine, dashed) at `entryGiveWayRadiusM` from the centre
 * — the line the ego must be authored BEHIND.
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * rb-single-district.test.ts.
 *
 * Layout (x = east, y = north, ring centre at the origin; circulation is
 * COUNTER-CLOCKWISE viewed from above — right-hand traffic, the rb-1 flow):
 *
 *                 rbs-n-n-out (0, R+armLen)
 *                      │  north arm
 *                 ── give-way line (0, R+giveWayOffset) ──
 *                 rbs-n-n (0, R)
 *                ╱             ╲          ring edges (oneway, CCW):
 *      rbs-n-w (-R, 0)     rbs-n-e (R, 0)   s→e, e→n, n→w, w→s
 *                ╲             ╱
 *                 rbs-n-s (0, -R)
 *                      │  south arm (the scenario/still entry)
 *                 rbs-n-s-out (0, -R-armLen)
 *
 * No signals, no stop lines (the stop-sign heuristic skips roundabout nodes by
 * design — priority-inside, yield on entry), no crossings. Deterministic: same
 * params → byte-identical JSON. Run: node tools/maps/gen_rb_single.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts —
// and the junction geometry in world/builders/constants.ts + network.ts. The
// ONE-ROUNDABOUT INVARIANT is arithmetic on these, so a drift here shows up as
// a generator failure rather than as a silently ugly map.)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** Curb fillet the builder adds past the widest approach at a degree-3 node
 *  whose dominant class ranks <= 2 (JUNCTION_CORNER_RADIUS_MINOR_M). */
const JUNCTION_CORNER_RADIUS_M = 9;
/** Painted give-way / stop lines sit this far outside the junction cut
 *  (STOP_LINE_BEYOND_CUT_M — paint and the runtime's graded line coincide). */
const STOP_LINE_BEYOND_CUT_M = 0.6;
/** Ring quarter-arc sampling step, degrees (rb-1 rides ~5 m point spacing). */
const ARC_STEP_DEG = 15;

/** Circulatory carriageway that must survive between two consecutive mouths.
 *  Below ~20 m the mouths merge visually and the ring stops reading as a ring
 *  (measured: rb-mini-v1's R = 18 leaves −6.3 m, i.e. the pads OVERLAP). */
const MIN_CIRCULATORY_RUN_M = 20;
/** Central island radius that must survive the junction pads' deepest bite.
 *  Below ~18 m the island is a scrap between mouths rather than an island
 *  (measured: rb-mini-v1 leaves 0.4 m — the star the founder rejected). */
const MIN_ISLAND_RADIUS_M = 18;

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

/**
 * THE ONE-ROUNDABOUT MEASUREMENT — how the engine will actually draw a ring of
 * radius `R` with 2-lane arms, resolved from the builder's own rules.
 *
 * `openRadiusM`      the junction pad the builder opens at each arm↔ring joint
 *                    (nodeOpenRadiusM: widest approach half-width + fillet).
 *                    Every incident edge — including the ring — is trimmed by
 *                    it, so it is subtracted TWICE from each quarter arc.
 * `circulatoryRunM`  drawn ring left between two consecutive mouths. Negative
 *                    means the pads overlap: four blobs, no ring.
 * `islandMinRadiusM` the island's radius where a pad bites deepest — at the
 *                    mouth, where the pad's inner corner arc bulges toward the
 *                    centre. The bulge reaches the pad's INNER ring cut point,
 *                    which sits `openRadiusM` along the arc from the node and
 *                    `ringHalfWidthM` inboard of the ring centreline.
 * `islandMaxRadiusM` the island's radius midway between two mouths — simply
 *                    the inner edge of the circulatory carriageway.
 */
export function measureRoundabout(R) {
  const armHalfWidthM = SCALED_LANE_W; // 2 lanes × 8.125 / 2
  // Single-lane ring, floored at 2.4 the same way edgeTravelHalfWidth floors it.
  const ringHalfWidthM = Math.max(SCALED_LANE_W / 2, 2.4);
  const openRadiusM = armHalfWidthM + JUNCTION_CORNER_RADIUS_M;
  const quarterArcM = (Math.PI * R) / 2;
  const theta = openRadiusM / R; // arc angle from the node to the ring cut
  const innerCutToNodeM = Math.hypot(
    (R - ringHalfWidthM) * Math.sin(theta),
    R - (R - ringHalfWidthM) * Math.cos(theta),
  );
  return {
    armHalfWidthM,
    ringHalfWidthM,
    openRadiusM: r2(openRadiusM),
    quarterArcM: r2(quarterArcM),
    circulatoryRunM: r2(quarterArcM - 2 * openRadiusM),
    islandMinRadiusM: r2(R - innerCutToNodeM),
    islandMaxRadiusM: r2(R - ringHalfWidthM),
    /** Painted dashed give-way line on an entry arm, m from the ring centre. */
    entryGiveWayRadiusM: r2(R + openRadiusM + STOP_LINE_BEYOND_CUT_M),
    /** Outer edge of the circulatory carriageway, m from the ring centre. */
    ringOuterEdgeM: r2(R + ringHalfWidthM),
  };
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,     // output file name + LessonSpec.world.districtId
 *   label: string,          // human label (meta)
 *   ringRadiusM: number,    // ring centerline radius (30..60 — see the
 *                           //   ONE-ROUNDABOUT INVARIANT in the header)
 *   arms: 4,                // radial arms (v1 ships the 4-arm cross)
 *   armLengthM: number,     // arm length from ring node to the outer end (>= 60)
 *   ringSpeedKmh: number,   // legal limit on the ring (20..30)
 *   armSpeedKmh: number,    // legal limit on the arms (30..50)
 * }} params
 */
export function buildSingleRoundaboutDistrict(params) {
  const errors = [];
  const { districtId, label, ringRadiusM, arms, armLengthM, ringSpeedKmh, armSpeedKmh } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(ringRadiusM >= 30 && ringRadiusM <= 60)) errors.push(`ringRadiusM must be within 30..60 m, got ${ringRadiusM}`);
  if (arms !== 4) errors.push(`arms must be 4 (the v1 cross layout), got ${arms}`);
  if (!(armLengthM >= 60 && armLengthM <= 300)) errors.push(`armLengthM must be within 60..300 m, got ${armLengthM}`);
  if (!(ringSpeedKmh >= 20 && ringSpeedKmh <= 30)) errors.push(`ringSpeedKmh must be within 20..30, got ${ringSpeedKmh}`);
  if (!(armSpeedKmh >= 30 && armSpeedKmh <= 50)) errors.push(`armSpeedKmh must be within 30..50, got ${armSpeedKmh}`);
  // THE ONE-ROUNDABOUT INVARIANT, stated as PARAMETER law so the failure is
  // readable before any geometry exists (re-proven on the output below).
  const M = measureRoundabout(ringRadiusM);
  if (!(M.circulatoryRunM >= MIN_CIRCULATORY_RUN_M)) {
    errors.push(
      `ringRadiusM ${ringRadiusM} leaves ${M.circulatoryRunM} m of circulatory carriageway between mouths ` +
        `(junction pads are ${M.openRadiusM} m at every joint) — under ${MIN_CIRCULATORY_RUN_M} m the four mouths ` +
        `merge and the map renders as four small roundabouts, not one`,
    );
  }
  if (!(M.islandMinRadiusM >= MIN_ISLAND_RADIUS_M)) {
    errors.push(
      `ringRadiusM ${ringRadiusM} leaves a ${M.islandMinRadiusM} m central island at the mouths ` +
        `(under ${MIN_ISLAND_RADIUS_M} m the junction pads bite through it and nothing reads as an island)`,
    );
  }
  if (!(armLengthM > M.entryGiveWayRadiusM - ringRadiusM + 40)) {
    errors.push(
      `armLengthM ${armLengthM} leaves under 40 m of approach behind the give-way line ` +
        `(the line sits ${r2(M.entryGiveWayRadiusM - ringRadiusM)} m out from the ring node)`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_rb_single params invalid:\n  - ${errors.join("\n  - ")}`);

  const R = ringRadiusM;
  const OUT = r2(R + armLengthM);
  const laneCenterM = r2(SCALED_LANE_W / 2); // arm right-lane center offset

  // -- Nodes: 4 ring joints + 4 arm outer ends.
  const NODES = {
    "rbs-n-s": [0, -R],
    "rbs-n-e": [R, 0],
    "rbs-n-n": [0, R],
    "rbs-n-w": [-R, 0],
    "rbs-n-s-out": [0, -OUT],
    "rbs-n-e-out": [OUT, 0],
    "rbs-n-n-out": [0, OUT],
    "rbs-n-w-out": [-OUT, 0],
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
      // curb parking band to arterial classes, and a parking band running into
      // the entry mouth would be a 4 m lie about where the carriageway (and
      // therefore the give-way line the ego is authored behind) ends — the
      // gen_rb_ped / gen_rb_2lane ruling, inherited.
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
    ringEdge("rbs-e-ring-se", "rbs-n-s", "rbs-n-e", 0, 90),
    ringEdge("rbs-e-ring-en", "rbs-n-e", "rbs-n-n", 90, 180),
    ringEdge("rbs-e-ring-nw", "rbs-n-n", "rbs-n-w", 180, 270),
    ringEdge("rbs-e-ring-ws", "rbs-n-w", "rbs-n-s", 270, 360),
    // Radial arms, authored outer-end → ring (the approach direction).
    armEdge("rbs-e-arm-s", "rbs-n-s-out", "rbs-n-s"),
    armEdge("rbs-e-arm-e", "rbs-n-e-out", "rbs-n-e"),
    armEdge("rbs-e-arm-n", "rbs-n-n-out", "rbs-n-n"),
    armEdge("rbs-e-arm-w", "rbs-n-w-out", "rbs-n-w"),
  ];
  const RING_EDGE_IDS = ["rbs-e-ring-se", "rbs-e-ring-en", "rbs-e-ring-nw", "rbs-e-ring-ws"];

  // -- Intersections: the 4 arm↔ring joints (degree 3, uncontrolled — the
  // stop-sign heuristic skips roundabout members; entry priority is the
  // runtime's circulatingConflict adjudication).
  const INTERSECTIONS = [
    { id: "rbs-n-s", x: 0, y: -R, degree: 3, signalized: false },
    { id: "rbs-n-e", x: R, y: 0, degree: 3, signalized: false },
    { id: "rbs-n-n", x: 0, y: R, degree: 3, signalized: false },
    { id: "rbs-n-w", x: -R, y: 0, degree: 3, signalized: false },
  ];

  const CROSSINGS = [];
  const ROUNDABOUTS = [
    // The rb-1-shaped registration the runtime + props builder consume.
    { id: "rbs-rb-1", x: 0, y: 0, radius: R, edgeIds: RING_EDGE_IDS },
  ];

  // -- Spawns: south-arm approach (the entry) + a north-arm finish reference
  // past the ring exit.
  const SPAWN_POINTS = [
    {
      id: "rbs-spawn-south",
      x: laneCenterM,
      y: r2(-OUT + 15),
      heading: 0,
      edgeId: "rbs-e-arm-s",
      name: "Подход към кръговото (юг)",
    },
    {
      // The still's authored ego pose: the last metre of approach BEFORE the
      // painted give-way line, which is where „приближаваш кръгово" actually
      // happens (founder verdict on q-krastovishta-064: the ego must be ON the
      // line, not already inside the ring). Held here so the questions and the
      // contract battery pin it by value instead of re-deriving it.
      id: "rbs-spawn-giveway",
      x: laneCenterM,
      y: r2(-(M.entryGiveWayRadiusM + 2.8)),
      heading: 0,
      edgeId: "rbs-e-arm-s",
      name: "На линията «Пропусни движението» (юг)",
    },
    {
      id: "rbs-spawn-finish",
      x: laneCenterM,
      y: r2(R + 40),
      heading: 0,
      edgeId: "rbs-e-arm-n",
      name: "Контролна точка — след кръговото (север)",
    },
  ];

  // -- One corner café SW of the ring (visual anchor, clear of every
  // carriageway: > halfRoad + sidewalk off both the west and south arms).
  const BUILDINGS = [
    {
      id: "rbs-b-cafe",
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
      generator: "tools/maps/gen_rb_single.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебно кръгово движение (един кръг) — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: armSpeedKmh,
        note: "Кръгово: спри/изчакай на линията «Пропусни движението», пропусни движещите се в кръга, излез с десен мигач.",
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
       * truth. Question media (media.poses / media.marks) and the contract
       * battery pin the centre / radius / give-way line by value from here,
       * so nothing downstream re-derives the junction arithmetic.
       */
      scenario: {
        archetype: "roundabout",
        params: { ringRadiusM, arms, armLengthM, ringSpeedKmh, armSpeedKmh },
        center: { x: 0, y: 0 },
        ringNodeIds: ["rbs-n-s", "rbs-n-e", "rbs-n-n", "rbs-n-w"],
        ringEdgeIds: RING_EDGE_IDS,
        entryArm: "south",
        /** Exit order counter-clockwise from the south entry. */
        exitOrderFromSouth: ["rbs-n-e", "rbs-n-n", "rbs-n-w"],
        laneCenterRightM: laneCenterM,
        /** THE ONE-ROUNDABOUT MEASUREMENT — resolved, so the still author and
         *  the battery read numbers instead of re-deriving them. */
        ring: {
          openRadiusM: M.openRadiusM,
          quarterArcM: M.quarterArcM,
          circulatoryRunM: M.circulatoryRunM,
          islandMinRadiusM: M.islandMinRadiusM,
          islandMaxRadiusM: M.islandMaxRadiusM,
          ringOuterEdgeM: M.ringOuterEdgeM,
          /** Painted dashed Б1 line on every entry arm, m from the centre. */
          entryGiveWayRadiusM: M.entryGiveWayRadiusM,
          minCirculatoryRunM: MIN_CIRCULATORY_RUN_M,
          minIslandRadiusM: MIN_ISLAND_RADIUS_M,
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
  // plus the ONE-ROUNDABOUT INVARIANT this archetype exists for)
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
  // The exit order the stills count mouths against, derived rather than assumed.
  const fromSouth = ringSeq.findIndex((e) => e.from === "rbs-n-s");
  if (fromSouth < 0) post.push("no ring edge leaves the south node");
  else {
    const order = [0, 1, 2].map((i) => ringSeq[(fromSouth + i) % ringSeq.length].to);
    if (order.join(",") !== district.meta.scenario.exitOrderFromSouth.join(",")) {
      post.push(`exitOrderFromSouth ${district.meta.scenario.exitOrderFromSouth} != derived ${order}`);
    }
  }
  // Every arm must reach a ring node.
  const ringNodeIds = new Set(["rbs-n-s", "rbs-n-e", "rbs-n-n", "rbs-n-w"]);
  for (const e of EDGES) {
    if (e.roundabout) continue;
    if (!ringNodeIds.has(e.to)) post.push(`${e.id}: arm must terminate on a ring node (to=${e.to})`);
  }

  // ---- THE ONE-ROUNDABOUT INVARIANT — the archetype's own contract. ---------
  // Re-proven on the built ring rather than on the parameter, so a future edit
  // to the arc sampling or the arm width cannot slip past the parameter gate.
  const measured = measureRoundabout(R);
  if (measured.circulatoryRunM < MIN_CIRCULATORY_RUN_M) {
    post.push(
      `only ${measured.circulatoryRunM} m of circulatory carriageway survives between mouths — this renders as four small roundabouts`,
    );
  }
  if (measured.islandMinRadiusM < MIN_ISLAND_RADIUS_M) {
    post.push(`central island shrinks to ${measured.islandMinRadiusM} m at the mouths — no island reads`);
  }
  // The four mouths must not be able to touch: the pads are opened at the ring
  // NODES, so their centres are the node spacing apart and each has radius
  // openRadiusM. (Chord, not arc — the pads are round, the ring is not.)
  const mouthChordM = 2 * R * Math.sin(Math.PI / 4);
  if (mouthChordM <= 2 * measured.openRadiusM) {
    post.push(
      `adjacent mouths are ${r2(mouthChordM)} m apart but each junction pad is ${measured.openRadiusM} m — the pads overlap into one blob`,
    );
  }
  if (Math.abs(measured.entryGiveWayRadiusM - M.entryGiveWayRadiusM) > 1e-9) {
    post.push("give-way radius drifted between the parameter gate and the build");
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
  // The give-way pose must sit OUTSIDE the painted line (a car whose centre is
  // inside it has already crossed) and inside the approach, not off the arm.
  const gw = SPAWN_POINTS.find((s) => s.id === "rbs-spawn-giveway");
  if (!gw || -gw.y <= measured.entryGiveWayRadiusM) {
    post.push("rbs-spawn-giveway must sit BEHIND the painted give-way line");
  } else if (-gw.y > OUT) {
    post.push("rbs-spawn-giveway ran off the south arm");
  }
  if (ROUNDABOUTS.length !== 1 || ROUNDABOUTS[0].edgeIds.length !== 4) post.push("roundabouts[] must register the 4 ring edges");
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rb_single self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// rb-single-v1 instance — the picture-question roundabout (q-krastovishta-064 /
// -065). R = 38 is the smallest ring on which the engine still draws ONE
// roundabout: 25.4 m of circulatory carriageway between mouths and a central
// island that never falls under 21.4 m. (R = 30 would leave 12.9 m / 13.8 m —
// visibly merging mouths; rb-mini-v1's R = 18 leaves −6.3 m / 0.4 m, which is
// the four-blob picture the founder rejected.)
// ---------------------------------------------------------------------------

const RBS_PARAMS = {
  districtId: "rb-single-v1",
  label: "Учебно кръгово движение — един еднолентов кръг с 4 рамена (илюстрации)",
  ringRadiusM: 38,
  arms: 4,
  armLengthM: 90,
  ringSpeedKmh: 30,
  armSpeedKmh: 40,
};

const district = buildSingleRoundaboutDistrict(RBS_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${RBS_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${RBS_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const ring = district.meta.scenario.ring;
const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== single-roundabout build: ${RBS_PARAMS.districtId} ===`);
line("ring radius / arms", `${RBS_PARAMS.ringRadiusM} m / ${RBS_PARAMS.arms}`);
line("ring / arm speed", `${RBS_PARAMS.ringSpeedKmh} / ${RBS_PARAMS.armSpeedKmh} km/h`);
line("junction pad per mouth", `${ring.openRadiusM} m (arm half 8.13 + fillet 9)`);
line("circulatory run", `${ring.circulatoryRunM} m between mouths (min ${ring.minCirculatoryRunM})`);
line("central island", `${ring.islandMinRadiusM}..${ring.islandMaxRadiusM} m (min ${ring.minIslandRadiusM})`);
line("give-way line", `r = ${ring.entryGiveWayRadiusM} m on every entry arm`);
line("ring edges", district.roundabouts[0].edgeIds.join(", "));
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("intersections", `${district.meta.stats.intersections} (all uncontrolled ring joints)`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK — the ONE-ROUNDABOUT invariant holds.");
