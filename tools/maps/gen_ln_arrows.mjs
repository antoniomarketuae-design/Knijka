/**
 * gen_ln_arrows.mjs — parametric ARROW-LANE SIGNALIZED X archetype (Scenario
 * Studio, doc 76 §3) → content/world/<districtId>.json (+ byte-identical
 * publish to platform/public/world/).
 *
 * gen_signal_x.mjs's sibling, with ONE structural delta: the N–S arterial is a
 * 3+3 boulevard (lanes 6) instead of a 1+1 street, so its southern approach
 * carries THREE separate lanes — the substrate the SN-04/JU-14 lane-arrow drill
 * needs (right-only | straight-only | left-only). Everything else is pure
 * district-v1 convention, exactly as in gen_signal_x: intersections[].signalized
 * = true derives the cluster, the four approach stop lines and the lamp heads;
 * nothing here is hand-tuned. Contract battery:
 * platform/src/modules/sim/world/__tests__/ln-arrows-districts.test.ts.
 *
 * THE ARROWS THEMSELVES ARE META, NOT A DATA LAYER. district-v1 `zones` has no
 * lane-intent kind (doc 72 N3 — the legality/zone layer's lane-arrow slice is
 * still 🔴 NEW), and inventing one here would fork the runtime contract. So the
 * arrow assignment lives in meta.scenario.laneArrows: authored TRUTH the
 * ScenarioSpec pins by value and the battery asserts, consumed as pedagogy
 * (instructions + objective gates), never as a detector input. When the
 * lane-intent layer lands, this block is the migration source.
 *
 * Layout (local meters, x = east, y = north, origin at the junction node):
 *
 *                        ln-n-n
 *                          ║        N–S: 3+3 boulevard (secondary, 50) — the
 *   ln-n-w ───────────── ln-n-c ───────────── ln-n-e     signalized arterial
 *                          ║        E–W: 1+1 street (residential, 40)
 *                        ln-n-s     ← the approach carrying the arrows
 *
 * Northbound lane centers (locator math: two-way bank, laneId 0 = curb lane,
 * center (lanesPerDir − 1 − laneId + 0.5) × 8.125):
 *   laneId 0  x = 20.31  →  „само надясно"
 *   laneId 1  x = 12.19  ↑  „само направо"
 *   laneId 2  x =  4.06  ←  „само наляво"
 *
 * The south arm is the longest: the drill reads the arrows and repositions
 * across two lanes BEFORE the junction, and the ~12 s keep-right sustain must
 * close outside the approach for the un-signalled mistake demos to isolate.
 *
 * No crossings by design (gen_signal_x's rule): a zebra would join the signal
 * cluster and add pedestrian grading noise to a pure lane-choice drill.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ln_arrows.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Lane width at the perceptual road scale (sim/runtime/spatial.ts). */
const SCALED_LANE_W = 3.25 * 2.5;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** Center of `laneId` on a two-way bank, measured from the centerline. */
function laneCenterM(lanesPerDir, laneId) {
  return r2((lanesPerDir - 1 - laneId + 0.5) * SCALED_LANE_W);
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,        // output file name + LessonSpec.world.districtId
 *   label: string,             // human label (meta)
 *   armNorthM: number,         // arm lengths from the node (60..400 each)
 *   armSouthM: number,
 *   armEastM: number,
 *   armWestM: number,
 *   nsLanes: number,           // N–S total lanes, EVEN (two-way): 4|6
 *   ewLanes: number,           // E–W total lanes, EVEN (two-way): 2|4
 *   nsClass: "secondary"|"tertiary"|"residential",
 *   ewClass: "secondary"|"tertiary"|"residential",
 *   nsMaxKmh: number,          // 30|40|50
 *   ewMaxKmh: number,          // 30|40|50
 *   arrowsFromM: number,       // painted-arrow span start, m before the node
 *   laneArrows: string[],      // one of "right"|"through"|"left" per laneId 0..n-1
 * }} params
 */
export function buildLnArrowsDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    armNorthM,
    armSouthM,
    armEastM,
    armWestM,
    nsLanes,
    ewLanes,
    nsClass,
    ewClass,
    nsMaxKmh,
    ewMaxKmh,
    arrowsFromM,
    laneArrows,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  for (const [k, v] of [
    ["armNorthM", armNorthM],
    ["armSouthM", armSouthM],
    ["armEastM", armEastM],
    ["armWestM", armWestM],
  ]) {
    if (!(v >= 60 && v <= 400)) errors.push(`${k} must be within 60..400 m, got ${v}`);
  }
  for (const [k, v] of [
    ["nsLanes", nsLanes],
    ["ewLanes", ewLanes],
  ]) {
    if (!Number.isInteger(v) || v < 2 || v > 8 || v % 2 !== 0) {
      errors.push(`${k} must be an EVEN integer 2..8 (two-way carriageway), got ${v}`);
    }
  }
  const CLASSES = ["secondary", "tertiary", "residential"];
  if (!CLASSES.includes(nsClass)) errors.push(`nsClass must be ${CLASSES.join("|")}, got ${nsClass}`);
  if (!CLASSES.includes(ewClass)) errors.push(`ewClass must be ${CLASSES.join("|")}, got ${ewClass}`);
  if (![30, 40, 50].includes(nsMaxKmh)) errors.push(`nsMaxKmh must be 30|40|50, got ${nsMaxKmh}`);
  if (![30, 40, 50].includes(ewMaxKmh)) errors.push(`ewMaxKmh must be 30|40|50, got ${ewMaxKmh}`);
  // The cluster's own axis-group falls back to the DOMINANT incident class
  // (signals.ts nodeGroup, single-node cluster) — demand a dominant axis so the
  // derived group is self-evident from the params (gen_signal_x's rule).
  const RANK = { secondary: 4, tertiary: 3, residential: 2 };
  if (RANK[nsClass] === RANK[ewClass]) {
    errors.push(`nsClass and ewClass must differ in rank (dominant axis = the cluster's own group)`);
  }
  const nsLanesPerDir = Math.floor((nsLanes ?? 2) / 2);
  const ARROWS = ["right", "through", "left"];
  if (!Array.isArray(laneArrows) || laneArrows.length !== nsLanesPerDir) {
    errors.push(`laneArrows must name one arrow per northbound lane (${nsLanesPerDir} entries)`);
  } else {
    laneArrows.forEach((a, i) => {
      if (!ARROWS.includes(a)) errors.push(`laneArrows[${i}] must be ${ARROWS.join("|")}, got ${a}`);
    });
    if (new Set(laneArrows).size !== laneArrows.length) {
      errors.push(`laneArrows must be distinct — two lanes with the same arrow make the drill unteachable`);
    }
  }
  if (!(arrowsFromM > 0 && arrowsFromM < armSouthM)) {
    errors.push(`arrowsFromM must be within (0, armSouthM), got ${arrowsFromM}`);
  }
  if (errors.length > 0) throw new Error(`gen_ln_arrows params invalid:\n  - ${errors.join("\n  - ")}`);

  const NODES = {
    "ln-n-n": [0, armNorthM],
    "ln-n-s": [0, -armSouthM],
    "ln-n-e": [armEastM, 0],
    "ln-n-w": [-armWestM, 0],
    "ln-n-c": [0, 0],
  };

  const edge = (id, from, to, cls, lanes, maxspeed, name) => {
    const geometry = [
      [r2(NODES[from][0]), r2(NODES[from][1])],
      [r2(NODES[to][0]), r2(NODES[to][1])],
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
    edge("ln-e-s", "ln-n-s", "ln-n-c", nsClass, nsLanes, nsMaxKmh, "Булевард — южен подход с лентови стрелки"),
    edge("ln-e-n", "ln-n-c", "ln-n-n", nsClass, nsLanes, nsMaxKmh, "Булевард — северен изход"),
    edge("ln-e-w", "ln-n-w", "ln-n-c", ewClass, ewLanes, ewMaxKmh, "Пресечна улица — запад"),
    edge("ln-e-e", "ln-n-c", "ln-n-e", ewClass, ewLanes, ewMaxKmh, "Пресечна улица — изток"),
  ];

  const INTERSECTIONS = [
    // THE signal: one flag, everything else derives (gen_signal_x's header).
    { id: "ln-n-c", x: 0, y: 0, degree: 4, signalized: true },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  const nsHalfM = r2((nsLanes * SCALED_LANE_W) / 2);
  const ewHalfM = r2((ewLanes * SCALED_LANE_W) / 2);

  // Visual anchors on two quadrants, clear of the widest carriageway
  // (nsHalf 24.375 m + parking band 4 + ~4 m sidewalk): |x|, |y| >= 34.
  const BUILDINGS = [
    {
      id: "ln-b-sw",
      height: 8,
      heightSource: "default",
      footprint: [
        [-56, -56],
        [-36, -56],
        [-36, -36],
        [-56, -36],
      ],
    },
    {
      id: "ln-b-ne",
      height: 5,
      heightSource: "default",
      footprint: [
        [36, 36],
        [52, 36],
        [52, 52],
        [36, 52],
      ],
    },
  ];

  /** Northbound lane centers, index = laneId (0 = curb lane). */
  const NS_LANE_CENTERS = Array.from({ length: nsLanesPerDir }, (_, i) => laneCenterM(nsLanesPerDir, i));
  /** Westbound lane center on the E–W street (y > 0 bank of ln-e-w). */
  const EW_WESTBOUND_Y = laneCenterM(Math.floor(ewLanes / 2), 0);
  /** Eastbound lane center on the E–W street (y < 0 bank). */
  const EW_EASTBOUND_Y = r2(-EW_WESTBOUND_Y);

  const ARROW_LABELS_BG = { right: "само надясно", through: "само направо", left: "само наляво" };

  const SPAWN_POINTS = [
    {
      // The drill's start: the CURB lane of the arrow approach — the lane whose
      // arrow (right-only) does not match the authored left-turn route.
      id: "ln-spawn-south",
      x: NS_LANE_CENTERS[0],
      y: r2(-(armSouthM - 15)),
      heading: 0,
      edgeId: "ln-e-s",
      name: "Южен подход — дясна лента („само надясно“)",
    },
    {
      id: "ln-spawn-east",
      x: r2(armEastM - 15),
      y: EW_WESTBOUND_Y,
      heading: 270,
      edgeId: "ln-e-e",
      name: "Източен подход към светофара",
    },
    {
      id: "ln-spawn-west",
      x: r2(-(armWestM - 15)),
      y: EW_EASTBOUND_Y,
      heading: 90,
      edgeId: "ln-e-w",
      name: "Западен подход към светофара",
    },
  ];

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
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

  const totalKm = r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-junction",
      generator: "tools/maps/gen_ln_arrows.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно кръстовище с лентови стрелки — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(nsMaxKmh, ewMaxKmh),
        note: "Учебно светофарно кръстовище с лентови стрелки: ограниченията идват от таговете на улиците.",
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
      scenario: {
        archetype: "x-junction",
        params: {
          armNorthM,
          armSouthM,
          armEastM,
          armWestM,
          nsLanes,
          ewLanes,
          nsClass,
          ewClass,
          nsMaxKmh,
          ewMaxKmh,
          arrowsFromM,
        },
        junctionNodeId: "ln-n-c",
        /** Derivation truth the battery asserts (gen_signal_x's contract). */
        expectedControl: "trafficLight",
        expectedClusterGroup: RANK[nsClass] > RANK[ewClass] ? "ns" : "ew",
        /** Lane truth: ScenarioSpecs pin these by value, the battery asserts. */
        nsLanesPerDirection: nsLanesPerDir,
        nsLaneCentersM: NS_LANE_CENTERS,
        ewWestboundLaneY: EW_WESTBOUND_Y,
        ewEastboundLaneY: EW_EASTBOUND_Y,
        /**
         * The arrow assignment — AUTHORED PEDAGOGY, not a graded data layer
         * (see the header): the lane-intent zone kind does not exist in
         * district-v1, so nothing in the runtime reads this. The ScenarioSpec
         * teaches from it and gates the correct lane with a reachZone.
         */
        laneArrows: {
          edgeId: "ln-e-s",
          /** Bank the arrows are painted on: +1 = geometry-forward (northbound). */
          travelDir: 1,
          /** Painted span along ln-e-s, m from the south node to the junction. */
          fromM: r2(armSouthM - arrowsFromM),
          toM: armSouthM,
          lanes: NS_LANE_CENTERS.map((centerM, laneId) => ({
            laneId,
            centerM,
            arrow: laneArrows[laneId],
            labelBg: ARROW_LABELS_BG[laneArrows[laneId]],
          })),
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
  // Self-validation (the shared generator invariants)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeIds = new Set();
  const degree = new Map();
  for (const e of EDGES) {
    if (edgeIds.has(e.id)) post.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== r2(NODES[e.from][0]) || g0[1] !== r2(NODES[e.from][1])) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== r2(NODES[e.to][0]) || gn[1] !== r2(NODES[e.to][1])) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.oneway) post.push(`${e.id}: every arm is two-way (the lane math pins both banks)`);
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
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
  // Spawns sit on a LANE CENTER of their edge, not on the centerline: the
  // approach spawn IS a lane choice (gen_ov_keepright's rule), so the check is
  // "inside the travel carriageway", not "within a metre of the polyline".
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) {
      post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
      continue;
    }
    const half = (host.lanes * SCALED_LANE_W) / 2;
    if (distToEdge(host, s.x, s.y) > half) post.push(`${s.id}: off the carriageway of ${s.edgeId}`);
  }
  // Every northbound lane center must sit inside the northbound bank, one lane
  // pitch apart — the ScenarioSpec's pinned constants derive from exactly this.
  NS_LANE_CENTERS.forEach((c, i) => {
    if (!(c > 0 && c < nsHalfM)) post.push(`ns lane ${i} center ${c} outside the northbound bank (0, ${nsHalfM})`);
    if (i > 0 && Math.abs(NS_LANE_CENTERS[i - 1] - c - SCALED_LANE_W) > 0.02) {
      post.push(`ns lane centers ${i - 1}/${i} are not one lane pitch apart`);
    }
  });
  if (!(EW_WESTBOUND_Y > 0 && EW_WESTBOUND_Y < ewHalfM)) {
    post.push(`ew westbound lane center ${EW_WESTBOUND_Y} outside the westbound bank`);
  }
  // The turn target must exist: the authored route leaves through the west arm.
  if (!laneArrows.includes("left")) post.push(`no lane carries the left arrow — the drill has no legal left turn`);
  // Routable connectivity: one component.
  {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    for (const e of EDGES) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const start = EDGES[0].from;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const v = queue.pop();
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
    }
    if (seen.size !== nodeIds.size) post.push("routable network split");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ln_arrows self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (sc-ln-turn-lane-arrows host — SN-04/JU-14)
// ---------------------------------------------------------------------------

const LN_PARAMS = {
  districtId: "ln-arrows-v1",
  label: "Учебно кръстовище с лентови стрелки (сценарий SN-04/JU-14)",
  armNorthM: 100,
  // Longest arm: the drill reads the arrows ~120 m out and repositions across
  // two lanes with the whole maneuver finished well before the stop line.
  armSouthM: 150,
  armEastM: 100,
  // The exit arm the authored route leaves through: long enough that the
  // post-turn lane discipline is observable end-to-end (the wide-exit mistake
  // demo needs its 3 s sustain, the shadow its CLEAN_DRIVING streak).
  armWestM: 170,
  nsLanes: 6, // 3 northbound lanes = the three arrows
  ewLanes: 2,
  nsClass: "secondary",
  ewClass: "residential",
  nsMaxKmh: 50,
  ewMaxKmh: 40,
  arrowsFromM: 120,
  laneArrows: ["right", "through", "left"], // laneId 0 = curb lane
};

const district = buildLnArrowsDistrict(LN_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${LN_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${LN_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== ln-arrows build: ${LN_PARAMS.districtId} ===`);
line("signal node / group", `${district.meta.scenario.junctionNodeId} (${district.meta.scenario.expectedClusterGroup})`);
line("arms N/S/E/W", `${LN_PARAMS.armNorthM}/${LN_PARAMS.armSouthM}/${LN_PARAMS.armEastM}/${LN_PARAMS.armWestM} m`);
line(
  "arrow lanes (laneId: x)",
  district.meta.scenario.laneArrows.lanes.map((l) => `${l.laneId}: ${l.centerM} ${l.labelBg}`).join(" | "),
);
line("ew lane centers (y)", `${district.meta.scenario.ewWestboundLaneY} / ${district.meta.scenario.ewEastboundLaneY}`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line(
  "bounds",
  `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`,
);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK.");
