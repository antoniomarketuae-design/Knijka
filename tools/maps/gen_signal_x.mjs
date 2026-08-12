/**
 * gen_signal_x.mjs — parametric SIGNALIZED 4-WAY map archetype (Scenario
 * Studio, doc 76 §3) → content/world/<districtId>.json (+ byte-identical
 * publish to platform/public/world/).
 *
 * The SIGNALS-family generator, in the gen_parking_lot.mjs mold. The signal
 * itself is pure district-v1 convention: intersections[].signalized = true —
 * the runtime's SignalController clusters the single node (cluster id = the
 * node id, deterministic FNV-1a phase offset), buildStopLines derives one
 * trafficLight line per approach at the junction mouth, and the world
 * builder's props pass places the visible lamp heads on every incoming
 * approach. NOTHING here is hand-tuned — grading, paint and lamps all derive
 * from the one `signalized` flag. Contract battery:
 * platform/src/modules/sim/world/__tests__/sx-district.test.ts.
 *
 * Layout (local meters, x = east, y = north, origin at the junction node):
 *
 *                        sx-n-n
 *                           │       N–S road: secondary (the arterial the
 *   sx-n-w ────────────  sx-n-c ──────────── sx-n-e     signal serves — the
 *                           │       cluster's own axis-group derives "ns"
 *                        sx-n-s     from the dominant class, signals.ts)
 *
 * Arms are individually sized: staged oncoming actors need runway (the N1
 * sync holds an actor (playerEta + gapSec) × cruise metres before the node —
 * doc 72 JU-10), so the west arm of the committed instance is the longest.
 *
 * No crossings by design (doc 76 §3 "road + markings + spawn + finish"):
 * a zebra would join the signal cluster and add pedestrian grading noise to
 * what is a pure signal-discipline drill.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_signal_x.mjs
 *       node tools/maps/gen_signal_x.mjs --only sxh-v1,sxd-v1
 *
 * ⚠ DOC 87 B40(b) — WHY THIS FILE EMITS SIX MAPS AND NOT ONE. The founder played
 * the signals family back to back and wrote, on «Спане на зелено»: „its pritty
 * simillar to previous both questions". Measured on the shipped catalogue on
 * 2026-08-10 he was under-counting: positions **12, 19, 20, 21, 22 and 23 —
 * SIX lessons — all ran `sx-v1` from `sx-spawn-south`**, i.e. the identical
 * pose on the identical street. Photographed at that spawn through the real
 * cockpit, four of the six sit within **1.76–3.20 mean |ΔRGB|** of each other
 * over an 800 × 380 windscreen band; the other two differ only by an ACTOR
 * standing in the road, not by a street. That is one map wearing six titles.
 *
 * It is the same complaint doc 86 D1 closed for the PEDESTRIAN family, and it
 * is closed the same way — except that pass learned a lesson this one starts
 * with: **facades were not enough.** „Fixing this is ROAD work, not facades"
 * (doc 87 FR-41). So each instance names a CARRIAGEWAY as well as a frontage.
 *
 * WHAT MAY NOT MOVE, AND WHY (the reason this is a parameter table and not six
 * hand-drawn junctions). Five lessons pin coordinates against this geometry and
 * ship committed ghost traces recorded on it — `content/traces/sc-signal-*`
 * open at `x = 4.0625, y = −105` and the graded stop line is derived, not
 * authored. So every instance holds these EXACTLY:
 *
 *   • node ids + N–S coordinates: `sx-n-c` (0,0), `sx-n-s` (0,−120),
 *     `sx-spawn-south` at the curb lane of the south arm (4.06, −105);
 *   • `nsClass: "secondary"`, 2 lanes, 50 — so `edgeHalfWidth` = 8.125 + 4.0
 *     = 12.125 m and `CLASS_RANK` = 4;
 *   • therefore `nodeOpenRadiusM` = 12.125 + 15 = 27.125 and the derived stop
 *     line stays at 27.725 m from the node, on every one of the six.
 *
 * `validateInstance()` below re-derives those three numbers from the emitted
 * bytes and throws, so an instance cannot drift off them by accident.
 *
 * WHAT IS THEREFORE FREE — and every lever here is one a driver reads from the
 * SEAT, not from a plan view:
 *
 *   ROADSCAPE  the cross street's class + limit + one-way (a bare 16 m
 *              residential vs a 24 m collector with parking bands and edge
 *              lines vs a one-way with no centre line at all); which KERB the
 *              parked row stands on and WHAT stands there (`parkingSide` /
 *              `parkingMix`, doc 87 B50/B53/B54); whether the approach carries
 *              a kerbside band AT ALL (`parkingBand: false` necks the street
 *              from 24.25 m curb-to-curb to 16.25 m and empties the kerb — the
 *              travel lanes, and therefore every graded metre, are untouched);
 *              the arm lengths east/west/north; and the В24/В27 face posted on
 *              the approach.
 *   FRONTAGE   what stands beside the approach and what closes the view past
 *              the junction — authored here per instance rather than stamped by
 *              `gen_streetwall.mjs`, because that pass keys its jitter on the
 *              EDGE id (`sw-<edgeId>-<side><k>`) and every instance shares
 *              `sx-e-s`, so it would hand all six the identical wall. `sx-v1`
 *              keeps its streetwall (it is on that pass's TARGETS list and its
 *              bytes are pinned by `streetwall.test.ts` at 16 plots); the five
 *              new maps carry their own and are deliberately NOT targets.
 *
 * `parkingBand` is stated EXPLICITLY on every edge of every new instance. Left
 * absent, `TrafficLayer`'s curb pass parks bodies 2 m past a kerb that has no
 * band under it — 68.6 % of the fleet stood on a footway before FR-21, and
 * `parked-on-footway.test.ts` admits legacy districts by name only.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curbLaneOffsetM, toCurbLane } from "./lib/lane.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

/** World-builder numbers this generator has to agree with, restated here so a
 *  map can be validated without importing TypeScript. Keep in sync with
 *  `platform/src/modules/sim/world/builders/constants.ts`. */
const LANE_WIDTH_M = 3.25 * 2.5; // 8.125 — PERCEPTUAL_ROAD_SCALE 2.5
const PARKING_LANE_WIDTH_M = 4.0;
const PARKING_LANE_CLASSES = new Set(["primary", "secondary", "tertiary"]);
const SIDEWALK_WIDTH_M = 3.5;
const RANK = { secondary: 4, tertiary: 3, residential: 2 };
const CORNER_RADIUS_BY_RANK = { 4: 15, 3: 12, 2: 9 };
/** Clear air demanded between a frontage footprint and the far kerb of the
 *  street it faces (the pavement it stands behind is 3.5 m of it). */
const FRONTAGE_MARGIN_M = 1.5;
/** No footprint may come nearer the junction node than this — the approach has
 *  to stay readable from the full braking distance (gen_streetwall's JUNCTION
 *  sight leg is 30 m and this is the same discipline). */
const JUNCTION_CLEAR_M = 30;
/** …nor nearer a spawn pose than this (gen_streetwall spawnClearM = 12). */
const SPAWN_CLEAR_M = 12;

/** Travel-lane half width — the GRADED carriageway (network.edgeTravelHalfWidth). */
const travelHalfOf = (edge) => (Math.max(1, edge.lanes) * LANE_WIDTH_M) / 2;
/** Curbside band per side (network.edgeParkingWidthM): the explicit tag wins. */
const parkingWidthOf = (edge) =>
  edge.parkingBand === true
    ? PARKING_LANE_WIDTH_M
    : edge.parkingBand === false
      ? 0
      : PARKING_LANE_CLASSES.has(edge.class)
        ? PARKING_LANE_WIDTH_M
        : 0;
/** Curb-to-curb half width (network.edgeHalfWidth) — kerbs, pavements, the
 *  junction mouth and the derived stop line all hang off this. */
const halfWidthOf = (edge) => travelHalfOf(edge) + parkingWidthOf(edge);

/**
 * A rectangular frontage plot, authored in STREET terms rather than in
 * coordinates: which arm it stands beside, which side of it, the arclength
 * window along that arm, and how far back from the centreline.
 *
 * `axis: "ns"` runs along y (`fromM`/`toM` are y); `"ew"` runs along x. `side`
 * is +1 for the east / north flank and −1 for the west / south one.
 */
function frontagePlots(spec, idPrefix) {
  const out = [];
  for (const p of spec) {
    const n = Math.max(1, p.plots ?? 1);
    const span = p.toM - p.fromM;
    const step = span / n;
    for (let k = 0; k < n; k++) {
      const a = p.fromM + k * step + (p.gapM ?? 6) / 2;
      const b = p.fromM + (k + 1) * step - (p.gapM ?? 6) / 2;
      if (b - a < 4) continue;
      const near = p.setbackM;
      const far = p.setbackM + p.depthM;
      const s = p.side;
      const h = Array.isArray(p.heights) ? p.heights[k % p.heights.length] : p.heights;
      const footprint =
        p.axis === "ns"
          ? [
              [r2(s * near), r2(a)],
              [r2(s * far), r2(a)],
              [r2(s * far), r2(b)],
              [r2(s * near), r2(b)],
            ]
          : [
              [r2(a), r2(s * near)],
              [r2(a), r2(s * far)],
              [r2(b), r2(s * far)],
              [r2(b), r2(s * near)],
            ];
      const bl = {
        id: `${idPrefix}-${p.tag}${k}`,
        height: r2(h),
        heightSource: "default",
        footprint,
      };
      if (p.kind) bl.kind = p.kind;
      out.push(bl);
    }
  }
  return out;
}

/**
 * @param {{
 *   districtId: string,        // output file name + LessonSpec.world.districtId
 *   label: string,             // human label (meta)
 *   armNorthM: number,         // arm lengths from the node (60..400 each)
 *   armSouthM: number,
 *   armEastM: number,
 *   armWestM: number,
 *   nsClass: "secondary"|"tertiary"|"residential",  // N–S road class
 *   ewClass: "secondary"|"tertiary"|"residential",  // E–W road class
 *   nsMaxKmh: number,          // 30|40|50
 *   ewMaxKmh: number,          // 30|40|50
 *   ewOneway?: boolean,        // B40(b): the cross street runs one way (no
 *                              //   centre line, no oncoming, Д4 at its mouth).
 *                              //   IMPLEMENTED AND CURRENTLY UNUSED, on
 *                              //   evidence: on sxf-v1 it deleted the lane the
 *                              //   drill's own conflict car needs („staged
 *                              //   event sc-sflash-conflict: vehicle path
 *                              //   failed to stage"), and on sxr-v1 the Д4 it
 *                              //   earns projects onto the two-way BOULEVARD
 *                              //   (sign-truth.test.ts „Д4 on sx-e-s
 *                              //   (secondary, oneway=false)"). The second is
 *                              //   a props-pass placement finding, not a map
 *                              //   one, and is filed rather than worked around.
 *   kerb?: Record<string, {parkingBand?: boolean, parkingSide?: "left"|"right"|"both", parkingMix?: string}>,
 *                              //   per EDGE ID — what the kerb of that arm carries
 *   frontage?: object[],       // B40(b) authored massing (see frontagePlots)
 *   zones?: object[],          // ADR-006 stage 2a ban spans (В24 / В27 faces)
 *   roadscapeNoteBg?: string,  // why THIS lesson happens on THIS street
 *   frontageNoteBg?: string,
 * }} params
 */
export function buildSignalXDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    armNorthM,
    armSouthM,
    armEastM,
    armWestM,
    nsClass,
    ewClass,
    nsMaxKmh,
    ewMaxKmh,
    ewOneway = false,
    kerb = {},
    frontage = null,
    zones = null,
    roadscapeNoteBg = null,
    frontageNoteBg = null,
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
  const CLASSES = ["secondary", "tertiary", "residential"];
  if (!CLASSES.includes(nsClass)) errors.push(`nsClass must be ${CLASSES.join("|")}, got ${nsClass}`);
  if (!CLASSES.includes(ewClass)) errors.push(`ewClass must be ${CLASSES.join("|")}, got ${ewClass}`);
  if (![30, 40, 50].includes(nsMaxKmh)) errors.push(`nsMaxKmh must be 30|40|50, got ${nsMaxKmh}`);
  if (![30, 40, 50].includes(ewMaxKmh)) errors.push(`ewMaxKmh must be 30|40|50, got ${ewMaxKmh}`);
  // The cluster's own axis-group falls back to the DOMINANT incident class
  // (signals.ts nodeGroup, single-node cluster). Equal classes would leave
  // the pick to edge-id tie-breaking — legal but opaque; demand a dominant
  // axis so the derived group is self-evident from the params.
  if (RANK[nsClass] === RANK[ewClass]) {
    errors.push(`nsClass and ewClass must differ in rank (dominant axis = the cluster's own group)`);
  }
  for (const [id, k] of Object.entries(kerb)) {
    if (!["sx-e-s", "sx-e-n", "sx-e-w", "sx-e-e"].includes(id)) errors.push(`kerb: unknown edge id ${id}`);
    if (k.parkingSide && !["left", "right", "both"].includes(k.parkingSide)) {
      errors.push(`kerb ${id}: parkingSide must be left|right|both, got ${k.parkingSide}`);
    }
    if (k.parkingMix && !["freight", "compact", "veteran"].includes(k.parkingMix)) {
      errors.push(`kerb ${id}: parkingMix must be freight|compact|veteran (TrafficLayer.PARKED_MIXES), got ${k.parkingMix}`);
    }
    if (k.parkingSide && k.parkingBand === false) {
      errors.push(`kerb ${id}: parkingSide with parkingBand:false — the curb pass places nothing, so the side is a lie`);
    }
  }
  if (errors.length > 0) throw new Error(`gen_signal_x params invalid:\n  - ${errors.join("\n  - ")}`);

  const NODES = {
    "sx-n-n": [0, armNorthM],
    "sx-n-s": [0, -armSouthM],
    "sx-n-e": [armEastM, 0],
    "sx-n-w": [-armWestM, 0],
    "sx-n-c": [0, 0],
  };

  const edge = (id, from, to, cls, maxspeed, name, oneway = false) => {
    const geometry = [
      [r2(NODES[from][0]), r2(NODES[from][1])],
      [r2(NODES[to][0]), r2(NODES[to][1])],
    ];
    const e = {
      id,
      from,
      to,
      class: cls,
      name,
      oneway,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
    // B40(b) — the kerb tags, appended only where a map declares them so every
    // instance written before this key existed stays byte-identical.
    const k = kerb[id];
    if (k) {
      if (k.parkingSide !== undefined) e.parkingSide = k.parkingSide;
      if (k.parkingMix !== undefined) e.parkingMix = k.parkingMix;
      if (k.parkingBand !== undefined) e.parkingBand = k.parkingBand;
    }
    return e;
  };

  const EDGES = [
    edge("sx-e-s", "sx-n-s", "sx-n-c", nsClass, nsMaxKmh, "Булевард — южен подход"),
    edge("sx-e-n", "sx-n-c", "sx-n-n", nsClass, nsMaxKmh, "Булевард — северен изход"),
    edge("sx-e-w", "sx-n-w", "sx-n-c", ewClass, ewMaxKmh, "Пресечна улица — запад", ewOneway),
    edge("sx-e-e", "sx-n-c", "sx-n-e", ewClass, ewMaxKmh, "Пресечна улица — изток", ewOneway),
  ];

  const INTERSECTIONS = [
    // THE signal: one flag, everything else derives (see the header).
    { id: "sx-n-c", x: 0, y: 0, degree: 4, signalized: true },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Visual anchors on two quadrants, clear of carriageway + sidewalk
  // (max half-width 12.13 m + ~4 m): |x|,|y| >= 26.
  //
  // B40(b): an instance that names its own `frontage` REPLACES these two — the
  // five new maps each carry a different wall, and two shared corner prisms in
  // the same two corners on all six would put the sameness straight back.
  const BUILDINGS = frontage
    ? frontagePlots(frontage, `${districtId.replace(/-v\d+$/, "")}-f`)
    : [
        {
          id: "sx-b-sw",
          height: 7,
          heightSource: "default",
          footprint: [
            [-44, -44],
            [-27, -44],
            [-27, -27],
            [-44, -27],
          ],
        },
        {
          id: "sx-b-ne",
          height: 5,
          heightSource: "default",
          footprint: [
            [27, 27],
            [42, 27],
            [42, 42],
            [27, 42],
          ],
        },
      ];

  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: "sx-spawn-south",
        x: 0,
        y: r2(-(armSouthM - 15)),
        heading: 0,
        edgeId: "sx-e-s",
        name: "Южен подход към светофара",
      },
      {
        id: "sx-spawn-east",
        x: r2(armEastM - 15),
        y: 0,
        heading: 270,
        edgeId: "sx-e-e",
        name: "Източен подход към светофара",
      },
      {
        id: "sx-spawn-west",
        x: r2(-(armWestM - 15)),
        y: 0,
        heading: 90,
        edgeId: "sx-e-w",
        name: "Западен подход към светофара",
      },
    ],
    EDGES,
  );

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
      generator: "tools/maps/gen_signal_x.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно светофарно кръстовище — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(nsMaxKmh, ewMaxKmh),
        note: "Учебно светофарно кръстовище: ограниченията идват от таговете на улиците.",
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
          nsClass,
          ewClass,
          nsMaxKmh,
          ewMaxKmh,
        },
        junctionNodeId: "sx-n-c",
        /** Derivation truth the battery asserts: one single-node cluster
         *  whose own axis-group is the dominant class's axis. */
        expectedControl: "trafficLight",
        expectedClusterGroup: RANK[nsClass] > RANK[ewClass] ? "ns" : "ew",
        // B40(b) — the two variety axes, recorded in the data so „why does this
        // lesson happen HERE" is answerable from the map and not only from the
        // generator source. Absent on sx-v1 (written before the axes existed),
        // which is why both keys are conditional.
        ...(roadscapeNoteBg ? { roadscapeNoteBg } : {}),
        ...(frontageNoteBg ? { frontageNoteBg } : {}),
        ...(ewOneway ? { ewOneway: true } : {}),
        // The three numbers every instance must agree on (see the header) —
        // re-derived from the emitted edges, not copied from a comment.
        ...(frontage
          ? {
              derived: {
                nsHalfWidthM: r2(halfWidthOf(EDGES[0])),
                nodeOpenRadiusM: r2(
                  Math.max(...EDGES.map(halfWidthOf)) +
                    CORNER_RADIUS_BY_RANK[Math.max(...EDGES.map((e) => RANK[e.class] ?? 2))],
                ),
                stopLineFromNodeM: r2(
                  Math.max(...EDGES.map(halfWidthOf)) +
                    CORNER_RADIUS_BY_RANK[Math.max(...EDGES.map((e) => RANK[e.class] ?? 2))] +
                    0.6,
                ),
              },
            }
          : {}),
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
    ...(zones ? { zones } : {}),
  };
  // ADR-006 stage 2a: a file carrying zones must SAY so (runtime/district.ts
  // reads `meta.zonesVersion` before it reads the array).
  if (zones) district.meta.zonesVersion = 1;

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
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    // doc 87 T2: "on its edge" used to mean "within a metre of its CENTRELINE",
    // i.e. the invariant enforced the defect it was supposed to catch.
    else if (Math.abs(distToEdge(host, s.x, s.y) - curbLaneOffsetM(host.lanes, host.oneway)) > 1)
      post.push(`${s.id}: not in its edge's curb lane`);
  }
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

  // -- B40(b): THE THREE NUMBERS THE FIVE PINNED LESSONS STAND ON -------------
  // Re-derived from the bytes about to be written, not from the params. Five
  // ScenarioSpecs pin marks against a stop line at 27.725 m and three ghost
  // traces per lesson open at (4.0625, −105); an instance that drifts off these
  // does not fail a test somewhere later, it silently re-times a recorded
  // demonstration. So it fails HERE.
  {
    const maxHalf = Math.max(...EDGES.map(halfWidthOf));
    const maxRank = Math.max(...EDGES.map((e) => RANK[e.class] ?? 2));
    const openR = maxHalf + CORNER_RADIUS_BY_RANK[maxRank];
    if (Math.abs(openR - 27.125) > 1e-6) {
      post.push(`nodeOpenRadiusM ${r2(openR)} != the pinned 27.125 (stop line would move to ${r2(openR + 0.6)})`);
    }
    const south = EDGES.find((e) => e.id === "sx-e-s");
    if (!south || travelHalfOf(south) !== LANE_WIDTH_M) post.push("sx-e-s is not the pinned 2-lane carriageway");
    const spawn = SPAWN_POINTS.find((s) => s.id === "sx-spawn-south");
    if (!spawn || Math.abs(spawn.x - 4.06) > 0.02 || Math.abs(spawn.y - -105) > 1e-6) {
      post.push(`sx-spawn-south is at (${spawn?.x}, ${spawn?.y}); every committed trace opens at (4.06, -105)`);
    }
  }

  // -- B40(b): the authored frontage may not stand in the road ---------------
  // gen_streetwall enforces the same three clearances on the maps it stamps;
  // the instances that author their own wall get them here instead.
  {
    const distToPolyline = (g, x, y) => {
      let best = Infinity;
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
    for (const bl of BUILDINGS) {
      for (const [x, y] of bl.footprint) {
        for (const e of EDGES) {
          const need = halfWidthOf(e) + SIDEWALK_WIDTH_M + FRONTAGE_MARGIN_M;
          const d = distToPolyline(e.geometry, x, y);
          if (d < need - 1e-6) {
            post.push(`${bl.id}: vertex (${x}, ${y}) is ${r2(d)} m from ${e.id}, needs ${r2(need)} (kerb + pavement + margin)`);
          }
        }
        if (Math.hypot(x, y) < JUNCTION_CLEAR_M - 1e-6) {
          post.push(`${bl.id}: vertex (${x}, ${y}) is ${r2(Math.hypot(x, y))} m from the junction, needs ${JUNCTION_CLEAR_M}`);
        }
        for (const s of SPAWN_POINTS) {
          const d = Math.hypot(x - s.x, y - s.y);
          if (d < SPAWN_CLEAR_M - 1e-6) {
            post.push(`${bl.id}: vertex (${x}, ${y}) is ${r2(d)} m from ${s.id}, needs ${SPAWN_CLEAR_M}`);
          }
        }
      }
    }
  }

  if (post.length > 0) {
    throw new Error(`gen_signal_x self-validation FAILED (${districtId}):\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// THE COMMITTED INSTANCES — one signalized junction per signals lesson (B40(b))
// ---------------------------------------------------------------------------
//
// The catalogue positions are the MEASURED ones (2026-08-10, dumped from
// SCENARIO_TEMPLATES, 167 entries), not the numbers doc 87's B40 row carries:
// that row says „10, 17, 18, 19, 21" and the shipped order is 12, 19, 20, 21,
// 22, 23 — two later insertions moved them, and it is six lessons, not five.
//
// `sx-v1` is UNCHANGED and stays the family home: it also hosts the east-spawn
// left-turn drill, the tram left-turn, the blocked-exit and eco-coast drills
// and the two later регулировчик entries, none of which this row is about.

const INSTANCES = [
  {
    // S2-B: JU-05/06/10 host — signal response + left turn. UNTOUCHED, and it
    // must stay so: `streetwall.test.ts` pins its 16 `sw-` plots and its bytes
    // are a fixed point of `gen_streetwall.mjs`. Re-running this generator
    // strips those plots, so the pipeline is:
    //   node tools/maps/gen_signal_x.mjs && node tools/maps/gen_streetwall.mjs --only sx-v1
    districtId: "sx-v1",
    label: "Учебно светофарно кръстовище (сценарии JU-05/JU-06/JU-10)",
    armNorthM: 90,
    armSouthM: 120,
    armEastM: 120,
    // Longest arm: the N1 oncoming sync stages the actor up to
    // (playerEta + gapSec) × cruise ≈ 150 m before the node (doc 72 JU-10).
    armWestM: 170,
    nsClass: "secondary",
    ewClass: "residential",
    nsMaxKmh: 50,
    ewMaxKmh: 40,
  },

  // -- catalogue 19 · «Загаснал светофар» (JU-20) ----------------------------
  // TWO THROUGH-ROADS CROSSING. The drill's own card says a dark head makes the
  // junction равнозначно and hands priority to whoever comes from the right —
  // which only bites if traffic really can come from there. So the cross street
  // is a COLLECTOR here (tertiary 50, kerbside bands, edge lines) running 150 m
  // straight each way, and the frontage is a low set-back panel estate that
  // leaves the sightline down it open. The parked row moves to the LEFT kerb:
  // the right verge, where the rule says to look, is deliberately empty.
  {
    districtId: "sxd-v1",
    label: "Кръстовище на две събирателни улици с угаснал светофар (сценарий JU-20)",
    armNorthM: 80,
    armSouthM: 120,
    armEastM: 150,
    armWestM: 150,
    nsClass: "secondary",
    ewClass: "tertiary",
    nsMaxKmh: 50,
    ewMaxKmh: 50,
    kerb: {
      "sx-e-s": { parkingBand: true, parkingSide: "left", parkingMix: "veteran" },
      "sx-e-n": { parkingBand: true, parkingSide: "left", parkingMix: "veteran" },
      "sx-e-w": { parkingBand: true, parkingSide: "both", parkingMix: "compact" },
      "sx-e-e": { parkingBand: true, parkingSide: "both", parkingMix: "compact" },
    },
    roadscapeNoteBg:
      "Пресичат се две събирателни улици (и двете с крайни линии и крайпътни ленти за паркиране), а не булевард с тиха пресечка — затова угасналият светофар наистина значи равнозначно кръстовище. Паркираните коли са само от ЛЯВАТА страна: дясната видимост, откъдето идва предимството, е чиста.",
    frontageNoteBg:
      "Ниски панелни блокове, отдръпнати навътре: покрай подхода няма нищо високо, така че тъмната глава на светофара се вижда на фона на небето, а погледът надясно по пресечната улица не е затворен.",
    frontage: [
      { tag: "es", axis: "ns", side: 1, fromM: -112, toM: -40, plots: 3, gapM: 10, setbackM: 22, depthM: 14, heights: [11, 8, 11] },
      { tag: "ws", axis: "ns", side: -1, fromM: -112, toM: -40, plots: 3, gapM: 10, setbackM: 24, depthM: 14, heights: [8, 11, 8] },
      { tag: "nn", axis: "ns", side: 1, fromM: 36, toM: 76, plots: 2, gapM: 8, setbackM: 22, depthM: 12, heights: [8, 11] },
      { tag: "nw", axis: "ns", side: -1, fromM: 36, toM: 76, plots: 2, gapM: 8, setbackM: 22, depthM: 12, heights: [11, 8] },
      { tag: "en", axis: "ew", side: 1, fromM: 40, toM: 140, plots: 3, gapM: 12, setbackM: 22, depthM: 16, heights: [8, 11, 8] },
      { tag: "wn", axis: "ew", side: -1, fromM: -140, toM: -40, plots: 3, gapM: 12, setbackM: 22, depthM: 16, heights: [11, 8, 11] },
    ],
  },

  // -- catalogue 20 · «Мигащо жълто» (JU-20) ---------------------------------
  // THE BOULEVARD MEETS A ONE-WAY SIDE STREET. Flashing amber does not regulate,
  // and the thing that actually saves a driver here is reading that this side
  // street can only produce traffic from ONE direction (Д4 at its mouth, no
  // centre line, no oncoming). Nothing parks on it; the boulevard, by contrast,
  // is parked BOTH kerbs with small cars and walled in tight — the approach
  // reads narrow and busy, the opposite of the открит estate crossing above.
  {
    districtId: "sxf-v1",
    label: "Булевард с еднопосочна пресечка и мигащо жълто (сценарий JU-20)",
    armNorthM: 130,
    armSouthM: 120,
    armEastM: 90,
    armWestM: 110,
    nsClass: "secondary",
    ewClass: "residential",
    nsMaxKmh: 50,
    ewMaxKmh: 40,
    // NO one-way here, and the reason is the drill: SC_SIGNAL_FLASHING_CONFLICT
    // stages a car coming from the EAST (`sx-n-e -> sx-n-c -> sx-n-w`) — the
    // give-way-to-the-right this lesson grades. A one-way in the emitted
    // direction deletes that lane, measured rather than guessed: the recorder
    // threw „staged event sc-sflash-conflict: vehicle path failed to stage".
    // A map that forbids the movement its own lesson stages is a falsehood, so
    // the variety comes from the CARRIAGEWAY instead.
    kerb: {
      // The approach carries NO kerbside band at all: 16.25 m curb-to-curb
      // instead of 24.25, and not one parked car on it. The travel lanes — and
      // therefore every graded metre and every recorded sample — are untouched.
      "sx-e-s": { parkingBand: false },
      "sx-e-n": { parkingBand: true, parkingSide: "both", parkingMix: "compact" },
      "sx-e-w": { parkingBand: false },
      "sx-e-e": { parkingBand: false },
    },
    roadscapeNoteBg:
      "Тесен гол булевард: подходът е без крайпътна лента и без нито една паркирана кола (16,25 м от бордюр до бордюр вместо 24,25), а платното се отваря чак СЛЕД кръстовището. Пресечната улица е тиха квартална, също без паркиране — при мигащо жълто нищо не ти помага освен собствената преценка.",
    frontageNoteBg:
      "Висок затворен фронт плътно до тротоара от двете страни на подхода: небето е процеп, кръстовището се появява късно. Точно обратното на откритото панелно кръстовище на угасналия светофар.",
    frontage: [
      // East side pushed to 16.2: at 13.2 the nearest corner is 11.2 m from the
      // spawn pose and gen_streetwall keeps 12 m of air around a spawn.
      { tag: "es", axis: "ns", side: 1, fromM: -114, toM: -38, plots: 4, gapM: 5, setbackM: 16.2, depthM: 18, heights: [21, 24, 18, 24] },
      { tag: "ws", axis: "ns", side: -1, fromM: -114, toM: -38, plots: 4, gapM: 5, setbackM: 13.2, depthM: 18, heights: [24, 18, 24, 21] },
      { tag: "ne", axis: "ns", side: 1, fromM: 36, toM: 124, plots: 3, gapM: 6, setbackM: 17.5, depthM: 16, heights: [18, 24, 18] },
      { tag: "nw", axis: "ns", side: -1, fromM: 36, toM: 124, plots: 3, gapM: 6, setbackM: 17.5, depthM: 16, heights: [24, 18, 21] },
      { tag: "en", axis: "ew", side: 1, fromM: 34, toM: 66, plots: 2, gapM: 6, setbackM: 16, depthM: 14, heights: [18, 21] },
      { tag: "ws2", axis: "ew", side: -1, fromM: -86, toM: -34, plots: 2, gapM: 6, setbackM: 16, depthM: 14, heights: [21, 18] },
    ],
  },

  // -- catalogue 21 · «Спане на зелено» (JU-09) — doc 87 B40(a)'s own map ----
  // THE MAP IS BUILT AROUND SEEING THE FAR STOP LINE. The whole drill is
  // spotting a car standing 62 m beyond the junction, nose-on, on the same
  // green. So everything past the node is cleared out of its way: the north
  // exit carries NO kerbside band (`parkingBand: false` necks it from 24.25 m
  // curb-to-curb to 16.25 and empties the kerb — the travel lanes, and every
  // graded metre, are untouched), it runs 150 m dead straight, and the frontage
  // beyond the junction is LOW and set well back, so the sleeper stands against
  // sky instead of against a wall. The approach itself is a delivery street:
  // box vans down the RIGHT kerb, which is also why the LEFT side — the side
  // instruction 3 tells him to look at — is conspicuously empty.
  {
    districtId: "sxh-v1",
    label: "Светофарно кръстовище с открита далечна стоп-линия (сценарий JU-09)",
    armNorthM: 150,
    armSouthM: 120,
    armEastM: 80,
    armWestM: 100,
    nsClass: "secondary",
    ewClass: "residential",
    nsMaxKmh: 50,
    ewMaxKmh: 40,
    kerb: {
      "sx-e-s": { parkingBand: true, parkingSide: "right", parkingMix: "freight" },
      "sx-e-n": { parkingBand: false },
      "sx-e-w": { parkingBand: false },
      "sx-e-e": { parkingBand: false },
    },
    roadscapeNoteBg:
      "Складова улица: по десния бордюр стоят бусове и пикапи, а лявата страна — тази, към която сочи инструкция 3 — е празна. СЛЕД кръстовището платното се стеснява (няма лента за паркиране) и остава празно, за да се вижда далечната стоп-линия на 62 м.",
    frontageNoteBg:
      "Дълга ниска складова редица покрай подхода и почти нищо след кръстовището: колата, която „спи на зелено“, стои на фона на небе, а не на фона на стена.",
    frontage: [
      { tag: "es", axis: "ns", side: 1, fromM: -116, toM: -38, plots: 3, gapM: 8, setbackM: 17.5, depthM: 22, heights: [9, 12, 9] },
      { tag: "ws", axis: "ns", side: -1, fromM: -116, toM: -38, plots: 2, gapM: 10, setbackM: 19, depthM: 20, heights: [12, 9] },
      { tag: "ne", axis: "ns", side: 1, fromM: 44, toM: 92, plots: 2, gapM: 12, setbackM: 26, depthM: 12, heights: [6, 6] },
      { tag: "nw", axis: "ns", side: -1, fromM: 44, toM: 92, plots: 2, gapM: 12, setbackM: 28, depthM: 12, heights: [6, 6] },
      { tag: "en", axis: "ew", side: 1, fromM: 34, toM: 56, plots: 1, gapM: 8, setbackM: 16, depthM: 14, heights: [9] },
      { tag: "wn", axis: "ew", side: -1, fromM: -76, toM: -34, plots: 2, gapM: 8, setbackM: 16, depthM: 14, heights: [12, 9] },
    ],
  },

  // -- catalogue 22 · «Регулировчик на кръстовището» (JU-18) -----------------
  // THE BIG CROSSING WHERE A HUMAN GETS POSTED. Two collectors, 170 m each way,
  // parked both kerbs on all four arms — the widest, busiest place in the family
  // and the only one where a policeman standing in the box is plausible. It is
  // also the only instance carrying a posted BAN: a В24 «Забранено е
  // изпреварването» from 20 m north of the spawn up to the junction mouth, so
  // there is a real sign face on the approach and not just paint.
  {
    districtId: "sxc-v1",
    label: "Голямо кръстовище на две събирателни улици с регулировчик (сценарий JU-18)",
    armNorthM: 100,
    armSouthM: 120,
    armEastM: 170,
    armWestM: 170,
    nsClass: "secondary",
    ewClass: "tertiary",
    nsMaxKmh: 50,
    ewMaxKmh: 50,
    kerb: {
      "sx-e-s": { parkingBand: true, parkingSide: "both", parkingMix: "veteran" },
      "sx-e-n": { parkingBand: true, parkingSide: "both", parkingMix: "veteran" },
      "sx-e-w": { parkingBand: true, parkingSide: "both", parkingMix: "freight" },
      "sx-e-e": { parkingBand: true, parkingSide: "both", parkingMix: "freight" },
    },
    // ADR-006 stage 2a. Arclength runs from `sx-n-s` (y = −120), so 60 → 92 is
    // y = −60 up to the junction mouth cut at 92.875.
    //
    // 60, AND BOTH OTHER CANDIDATES WERE MEASURED AND REJECTED. At `fromM: 20`
    // the entry face lands at y = −100 — 5 m ahead of the spawn and 12.93 m off
    // to the right, 69° off the axis — and the placement dump put its screen
    // rect at x 2074–2395 on a 1350 px canvas: OFF THE WINDSCREEN ENTIRELY, at
    // the only moment it is near. A graded ban whose face the driver can never
    // see is the convicting-falsehood class this register exists to remove.
    // At `fromM: 45` it is in the frame — and standing INSIDE the В26 «50» that
    // the ns road already posts at arclength 45 on the same verge:
    // `sign-truth.test.ts` measured the two at 0.00 m apart. 60 puts the В24
    // 45 m ahead of the spawn, 15 m clear of the limit sign, on the same kerb,
    // read before the span it announces.
    zones: [
      {
        id: "sxc-z-noovertaking",
        kind: "noOvertaking",
        edgeId: "sx-e-s",
        fromM: 60,
        toM: 92,
        signRef: "В24",
      },
    ],
    roadscapeNoteBg:
      "Две събирателни улици по 170 м на всяка страна, паркирано и от четирите бордюра — най-голямото и най-натовареното кръстовище в групата, и единственото, на което човек с палка е обяснимо. По подхода е поставен и знак В24 „Забранено е изпреварването“.",
    frontageNoteBg:
      "Представителен булеварден фронт: високи блокове с широко отстояние от двете страни и автобусна спирка на тротоара преди кръстовището.",
    frontage: [
      { tag: "es", axis: "ns", side: 1, fromM: -116, toM: -74, plots: 1, gapM: 6, setbackM: 21, depthM: 18, heights: [27] },
      { tag: "eb", axis: "ns", side: 1, fromM: -70, toM: -40, plots: 1, gapM: 6, setbackM: 21, depthM: 12, heights: [5], kind: "busStop" },
      { tag: "ws", axis: "ns", side: -1, fromM: -116, toM: -40, plots: 2, gapM: 8, setbackM: 22, depthM: 18, heights: [24, 30] },
      { tag: "ne", axis: "ns", side: 1, fromM: 38, toM: 94, plots: 2, gapM: 8, setbackM: 21, depthM: 16, heights: [24, 27] },
      { tag: "nw", axis: "ns", side: -1, fromM: 38, toM: 94, plots: 2, gapM: 8, setbackM: 21, depthM: 16, heights: [30, 24] },
      { tag: "en", axis: "ew", side: 1, fromM: 40, toM: 160, plots: 3, gapM: 10, setbackM: 21, depthM: 18, heights: [24, 30, 24] },
      { tag: "wn", axis: "ew", side: -1, fromM: -160, toM: -40, plots: 3, gapM: 10, setbackM: 21, depthM: 18, heights: [30, 24, 27] },
    ],
  },

  // -- catalogue 23 · «Тръгване на червено-жълто» (JU-08) --------------------
  // A TIGHT TOWN-CENTRE CROSSING THAT ENDS. Every arm is short, the cross street
  // is posted 30, and the boulevard runs into a slab 20 m past the north node —
  // so the horizon is CLOSED, which is the one thing none of the other five do.
  // The point of the drill is not creeping on червено-жълто, and here there is
  // visibly nowhere to creep to.
  {
    districtId: "sxr-v1",
    label: "Тясно централно кръстовище със затворен хоризонт (сценарий JU-08)",
    armNorthM: 70,
    armSouthM: 120,
    armEastM: 70,
    armWestM: 80,
    nsClass: "secondary",
    ewClass: "residential",
    nsMaxKmh: 50,
    ewMaxKmh: 30,
    // ewOneway TRIED HERE AND WITHDRAWN — see the note on the param. The Д4 the
    // one-way earns lands where `sign-truth.test.ts` can only read it as posted
    // on the BOULEVARD, and a Д4 that appears to apply to a two-way carriageway
    // is a lie about the road. The tightness comes from short arms instead.
    kerb: {
      "sx-e-s": { parkingBand: true, parkingSide: "right", parkingMix: "veteran" },
      "sx-e-n": { parkingBand: true, parkingSide: "both", parkingMix: "veteran" },
      "sx-e-w": { parkingBand: false },
      "sx-e-e": { parkingBand: false },
    },
    roadscapeNoteBg:
      "Централно кръстовище с къси рамена: пресечната улица е ограничена на 30 км/ч, а булевардът свършва на 70 м след възела. Няма накъде да „подпълзиш“ на червено-жълто и това се вижда от седалката.",
    frontageNoteBg:
      "Плътна пететажна редица по минималното отстояние от двете страни на подхода, а право напред — сграда, която затваря хоризонта веднага след кръстовището. Единственият затворен изглед в групата.",
    frontage: [
      { tag: "es", axis: "ns", side: 1, fromM: -114, toM: -38, plots: 5, gapM: 4, setbackM: 17.2, depthM: 16, heights: [15, 18, 15, 18, 15] },
      { tag: "ws", axis: "ns", side: -1, fromM: -114, toM: -38, plots: 5, gapM: 4, setbackM: 17.2, depthM: 16, heights: [18, 15, 18, 15, 18] },
      { tag: "ne", axis: "ns", side: 1, fromM: 38, toM: 64, plots: 1, gapM: 4, setbackM: 17.2, depthM: 14, heights: [15] },
      { tag: "nw", axis: "ns", side: -1, fromM: 38, toM: 64, plots: 1, gapM: 4, setbackM: 17.2, depthM: 14, heights: [18] },
      // THE CLOSER: dead ahead, 20 m past the north terminal node (y = 70), so
      // it fills the top-centre of the windscreen for the whole approach and
      // cannot touch a metre any recorded drive reaches (the furthest sample of
      // the six lessons' 18 committed traces is y = 48).
      { tag: "end", axis: "ew", side: 1, fromM: -34, toM: 34, plots: 2, gapM: 6, setbackM: 90, depthM: 20, heights: [21, 24] },
      { tag: "en", axis: "ew", side: 1, fromM: 34, toM: 46, plots: 1, gapM: 4, setbackM: 16, depthM: 14, heights: [15] },
      { tag: "wn", axis: "ew", side: -1, fromM: -56, toM: -34, plots: 1, gapM: 4, setbackM: 16, depthM: 14, heights: [18] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx >= 0 && argv[onlyIdx + 1] ? new Set(argv[onlyIdx + 1].split(",")) : null;

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  if (only && !only.has(params.districtId)) continue;
  const district = buildSignalXDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== signal-x build: ${params.districtId} ===`);
  line("signal node / group", `${district.meta.scenario.junctionNodeId} (${district.meta.scenario.expectedClusterGroup})`);
  line("arms N/S/E/W", `${params.armNorthM}/${params.armSouthM}/${params.armEastM}/${params.armWestM} m`);
  line("cross street", `${params.ewClass} ${params.ewMaxKmh}${params.ewOneway ? " ONE-WAY" : ""}`);
  line(
    "kerb",
    district.roads.edges
      .map((e) => `${e.id}:${e.parkingBand === false ? "none" : `${e.parkingSide ?? "right"}/${e.parkingMix ?? "mixed"}`}`)
      .join("  "),
  );
  line("stop line (derived)", `${district.meta.scenario.derived?.stopLineFromNodeM ?? 27.725} m from the node`);
  line("nodes / edges / bld", `${district.meta.stats.nodes} / ${district.meta.stats.edges} / ${district.meta.stats.buildings}`);
  line("zones", district.zones ? district.zones.map((z) => `${z.signRef} ${z.edgeId}@${z.fromM}-${z.toM}`).join(", ") : "—");
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
