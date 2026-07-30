/**
 * gen_sig_wave.mjs — parametric SIGNAL-WAVE AVENUE archetype (Scenario Studio,
 * doc 76 §3) → content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A straight arterial carrying THREE signalized 4-way junctions on one axis —
 * the host of sc-sig-green-wave („Зелена вълна"). Structurally gen_signal_x
 * repeated three times along y: the same one-flag convention does everything
 * (intersections[].signalized = true → one single-node SignalController cluster
 * per junction, four trafficLight stop lines at each junction mouth, lamp heads
 * on every incoming approach). Nothing here is hand-tuned EXCEPT the one thing
 * this archetype exists for:
 *
 * THE WAVE IS IN THE MAP, NOT IN A RUNTIME DIAL. A cluster's phase offset is
 * `fnv1a(clusterId) % 50` and a single-node cluster's id IS its node id
 * (runtime/signals.ts) — so the node ids and the block spacing are the ONLY two
 * knobs, and together they ARE the green wave:
 *
 *   offset(sw-n-tl1)=36  offset(sw-n-tl2)=17  offset(sw-n-tl3)=48   (fnv1a % 50)
 *   (36 − 17) mod 50 = 19 s      (17 − 48) mod 50 = 19 s
 *   19 s × 50 km/h (13.889 m/s)  = 263.9 m  ≈ blockM 264
 *
 * i.e. a driver holding the tagged 50 km/h spends exactly one inter-offset
 * interval per block, so the cycle-local phase he meets is IDENTICAL at all
 * three lamps: green at the first ⇒ green at all three, and a driver who
 * arrives EARLY (the sprinter) wraps below the green window and waits. The
 * `waveSpeedKmh` self-check below asserts precisely this, so the invariant can
 * never silently rot behind a rename or a spacing tweak.
 *
 * WHY natural offsets and not the recorder's `signalOffsets` dial: LessonSpec
 * carries no per-cluster offset map (only the single-cluster, approach-relative
 * `signalPlan`), so a wave pinned only in the trace recorder would exist for the
 * shadow ghost and NOT for the live student. Baking it into the district makes
 * the recorded drives and the live session read the same three offsets.
 *
 * Layout (local meters, x = east, y = north, origin at the FIRST signal):
 *
 *        sw-n-n                  N–S avenue: secondary, 50 km/h (the wave axis;
 *           │  armNorthM         each cluster's own axis-group derives "ns" from
 *   sw-n-w3 ┼ sw-n-tl3 ─ sw-n-e3 the dominant incident class, signals.ts)
 *           │  blockM
 *   sw-n-w2 ┼ sw-n-tl2 ─ sw-n-e2 E–W cross streets: residential, 40 km/h —
 *           │  blockM            present only to make each junction a real
 *   sw-n-w1 ┼ sw-n-tl1 ─ sw-n-e1 degree-4 signalized X (and to give the
 *           │  armSouthM         perpendicular axis-group something to serve).
 *        sw-n-s   ← spawn 15 m in
 *
 * armSouthM is a TIMING parameter, not decoration: it sets how deep into the
 * first green a bot that departs promptly at 50 km/h arrives (≈ 8 s in at 304 m
 * — the ~12 s of dawdle tolerance the live session gets before the wave is lost).
 *
 * No crossings by design (doc 76 §3): a zebra would join a signal cluster and
 * add pedestrian grading noise to what is a pure signal-timing/eco drill.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Contract battery: platform/src/modules/sim/world/__tests__/sig-wave-districts.test.ts.
 * Run:  node tools/maps/gen_sig_wave.mjs
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

/** FNV-1a — VERBATIM from platform/src/modules/sim/runtime/geometry.ts. The
 *  generator must derive the cluster offsets exactly as the runtime does, or
 *  the wave self-check would be validating a different function than the one
 *  the simulator runs. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** SIGNAL_TIMING.cycleSec — runtime/signals.ts (green 20 / yellow 3 / red 26 / redYellow 1). */
const SIGNAL_CYCLE_SEC = 50;
/** SignalController's single-linkage cluster link radius, runtime/signals.ts. */
const CLUSTER_LINK_M = 40;

/** Cycle offset the runtime will derive for a single-node cluster, seconds. */
const naturalOffsetSec = (nodeId) => fnv1a(nodeId) % SIGNAL_CYCLE_SEC;

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,          // output file name + LessonSpec.world.districtId
 *   label: string,               // human label (meta)
 *   armSouthM: number,           // spawn approach, first signal ← (120..500)
 *   blockM: number,              // spacing between consecutive signals (200..420)
 *   armNorthM: number,           // exit arm past the last signal (60..300)
 *   crossArmM: number,           // each cross-street arm from its node (60..200)
 *   avenueClass: "secondary"|"tertiary"|"residential",
 *   crossClass: "secondary"|"tertiary"|"residential",
 *   avenueMaxKmh: number,        // 30|40|50 — the wave axis limit
 *   crossMaxKmh: number,         // 30|40|50
 *   waveSpeedKmh: number,        // the speed the natural offsets encode a wave for
 * }} params
 */
export function buildSignalWaveDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    armSouthM,
    blockM,
    armNorthM,
    crossArmM,
    avenueClass,
    crossClass,
    avenueMaxKmh,
    crossMaxKmh,
    waveSpeedKmh,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  for (const [k, v, lo, hi] of [
    ["armSouthM", armSouthM, 120, 500],
    ["blockM", blockM, 200, 420],
    ["armNorthM", armNorthM, 60, 300],
    ["crossArmM", crossArmM, 60, 200],
  ]) {
    if (!(v >= lo && v <= hi)) errors.push(`${k} must be within ${lo}..${hi} m, got ${v}`);
  }
  const CLASSES = ["secondary", "tertiary", "residential"];
  if (!CLASSES.includes(avenueClass)) errors.push(`avenueClass must be ${CLASSES.join("|")}, got ${avenueClass}`);
  if (!CLASSES.includes(crossClass)) errors.push(`crossClass must be ${CLASSES.join("|")}, got ${crossClass}`);
  if (![30, 40, 50].includes(avenueMaxKmh)) errors.push(`avenueMaxKmh must be 30|40|50, got ${avenueMaxKmh}`);
  if (![30, 40, 50].includes(crossMaxKmh)) errors.push(`crossMaxKmh must be 30|40|50, got ${crossMaxKmh}`);
  // Same law as gen_signal_x: each cluster's own axis-group falls back to the
  // DOMINANT incident class, so the avenue must outrank the cross streets or
  // the derived group is an edge-id tie-break instead of "the wave axis".
  const RANK = { secondary: 4, tertiary: 3, residential: 2 };
  if (!(RANK[avenueClass] > RANK[crossClass])) {
    errors.push(`avenueClass must outrank crossClass (the wave axis IS the dominant axis)`);
  }
  if (!(waveSpeedKmh > 0)) errors.push(`waveSpeedKmh must be positive, got ${waveSpeedKmh}`);
  if (waveSpeedKmh > avenueMaxKmh) {
    errors.push(`waveSpeedKmh ${waveSpeedKmh} exceeds the avenue limit ${avenueMaxKmh} — the wave must be LAWFUL`);
  }
  if (blockM <= CLUSTER_LINK_M) {
    errors.push(`blockM ${blockM} <= cluster link radius ${CLUSTER_LINK_M} — the three signals would fuse into one cluster`);
  }
  if (errors.length > 0) throw new Error(`gen_sig_wave params invalid:\n  - ${errors.join("\n  - ")}`);

  /** The three signal nodes, south → north. Their IDS carry the wave (header). */
  const SIGNAL_IDS = ["sw-n-tl1", "sw-n-tl2", "sw-n-tl3"];

  const NODES = {
    "sw-n-s": [0, -armSouthM],
    "sw-n-tl1": [0, 0],
    "sw-n-tl2": [0, blockM],
    "sw-n-tl3": [0, 2 * blockM],
    "sw-n-n": [0, 2 * blockM + armNorthM],
  };
  for (let i = 0; i < 3; i++) {
    NODES[`sw-n-w${i + 1}`] = [-crossArmM, i * blockM];
    NODES[`sw-n-e${i + 1}`] = [crossArmM, i * blockM];
  }

  const edge = (id, from, to, cls, maxspeed, name) => {
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
      lanes: 2,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const AVE = "Булевард „Зелена вълна“";
  const EDGES = [
    edge("sw-e-a0", "sw-n-s", "sw-n-tl1", avenueClass, avenueMaxKmh, `${AVE} — южен подход`),
    edge("sw-e-a1", "sw-n-tl1", "sw-n-tl2", avenueClass, avenueMaxKmh, `${AVE} — първа отсечка`),
    edge("sw-e-a2", "sw-n-tl2", "sw-n-tl3", avenueClass, avenueMaxKmh, `${AVE} — втора отсечка`),
    edge("sw-e-a3", "sw-n-tl3", "sw-n-n", avenueClass, avenueMaxKmh, `${AVE} — северен изход`),
  ];
  for (let i = 1; i <= 3; i++) {
    EDGES.push(
      edge(`sw-e-w${i}`, `sw-n-w${i}`, `sw-n-tl${i}`, crossClass, crossMaxKmh, `Пресечна улица ${i} — запад`),
      edge(`sw-e-e${i}`, `sw-n-tl${i}`, `sw-n-e${i}`, crossClass, crossMaxKmh, `Пресечна улица ${i} — изток`),
    );
  }

  const INTERSECTIONS = SIGNAL_IDS.map((id) => ({
    // THE signals: one flag each, everything else derives (see the header).
    id,
    x: r2(NODES[id][0]),
    y: r2(NODES[id][1]),
    degree: 4,
    signalized: true,
  }));
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Visual anchors MID-BLOCK on both flanks — the wave is only legible if the
  // driver can see the next lamp coming, so nothing sits on a sightline: clear
  // of the carriageway (max half-width 12.13 m + ~4 m sidewalk ⇒ |x| >= 26) and
  // clear of every cross street (|y − y_signal| >= 26).
  const BUILDINGS = [];
  const midYs = [r2(-armSouthM / 2), r2(blockM / 2), r2(blockM * 1.5)];
  for (let i = 0; i < midYs.length; i++) {
    const y = midYs[i];
    BUILDINGS.push({
      id: `sw-b-${i}w`,
      height: 6 + i * 2,
      heightSource: "default",
      footprint: [
        [-44, r2(y - 15)],
        [-27, r2(y - 15)],
        [-27, r2(y + 15)],
        [-44, r2(y + 15)],
      ],
    });
    BUILDINGS.push({
      id: `sw-b-${i}e`,
      height: 5 + i * 3,
      heightSource: "default",
      footprint: [
        [27, r2(y - 12)],
        [42, r2(y - 12)],
        [42, r2(y + 12)],
        [27, r2(y + 12)],
      ],
    });
  }

  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: "sw-spawn-south",
        x: 0,
        y: r2(-(armSouthM - 15)),
        heading: 0,
        edgeId: "sw-e-a0",
        name: "Южен подход към зелената вълна",
      },
      {
        // Cross-street entry (unused by sc-sig-green-wave; the archetype's second
        // way in, for a future template that arrives ONTO the wave axis).
        id: "sw-spawn-cross2-west",
        x: r2(-(crossArmM - 15)),
        y: r2(blockM),
        heading: 90,
        edgeId: "sw-e-w2",
        name: "Западен подход към средния светофар",
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

  // -- the wave, derived (the battery + the trace scripts read these back) ----
  const waveMps = waveSpeedKmh / 3.6;
  const offsets = SIGNAL_IDS.map(naturalOffsetSec);
  const blockTravelSec = r2(blockM / waveMps);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-junction",
      generator: "tools/maps/gen_sig_wave.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен булевард със зелена вълна — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(avenueMaxKmh, crossMaxKmh),
        note: "Учебен булевард със зелена вълна: ограниченията идват от таговете на улиците.",
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
        archetype: "signal-wave",
        params: {
          armSouthM,
          blockM,
          armNorthM,
          crossArmM,
          avenueClass,
          crossClass,
          avenueMaxKmh,
          crossMaxKmh,
          waveSpeedKmh,
        },
        junctionNodeIds: SIGNAL_IDS,
        /** Derivation truth the battery asserts: three single-node clusters,
         *  each on the avenue's axis, whose NATURAL fnv1a offsets ride a wave. */
        expectedControl: "trafficLight",
        expectedClusterGroup: "ns",
        wave: {
          speedKmh: waveSpeedKmh,
          /** Seconds a wave rider spends per block — equals every consecutive
           *  offset difference (mod 50), which is what makes the wave. */
          blockTravelSec,
          naturalOffsetsSec: offsets,
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
  // Buildings clear of every carriageway (see the BUILDINGS comment).
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) < 26) post.push(`${bl.id}: footprint x=${x} sits on the avenue`);
      for (let i = 0; i < 3; i++) {
        if (Math.abs(y - i * blockM) < 26) post.push(`${bl.id}: footprint y=${y} sits on cross street ${i + 1}`);
      }
    }
  }

  // -- THE WAVE INVARIANT (this archetype's whole reason to exist) -----------
  // Each block must take exactly as long, at waveSpeedKmh, as the cycle-time
  // gap between the two lamps' NATURAL offsets — then a rider's cycle-local
  // phase is identical at every lamp. Tolerance 0.25 s: a quarter second of
  // drift over the whole avenue is invisible against the 20 s green window,
  // and demanding an exact match would force irrational block lengths.
  const WAVE_TOL_SEC = 0.25;
  for (let i = 0; i < SIGNAL_IDS.length - 1; i++) {
    const gapSec = (((offsets[i] - offsets[i + 1]) % SIGNAL_CYCLE_SEC) + SIGNAL_CYCLE_SEC) % SIGNAL_CYCLE_SEC;
    const driftSec = Math.abs(blockTravelSec - gapSec);
    if (driftSec > WAVE_TOL_SEC) {
      post.push(
        `WAVE BROKEN ${SIGNAL_IDS[i]}→${SIGNAL_IDS[i + 1]}: natural offsets ${offsets[i]}→${offsets[i + 1]} ` +
          `demand a ${gapSec} s block, but blockM ${blockM} at ${waveSpeedKmh} km/h takes ${blockTravelSec} s ` +
          `(drift ${r2(driftSec)} s > ${WAVE_TOL_SEC}). Fix blockM to ${r2(gapSec * waveMps)} m, or rename the signal nodes.`,
      );
    }
  }
  // The three lamps must stay THREE clusters (single-linkage, 40 m radius).
  if (new Set(offsets).size !== offsets.length) {
    post.push(`signal nodes share an offset (${offsets.join("/")}) — the wave would be a synchronized block, not a wave`);
  }
  if (post.length > 0) {
    throw new Error(`gen_sig_wave self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (wave-3: sc-sig-green-wave — „Зелена вълна")
// ---------------------------------------------------------------------------

const SW_PARAMS = {
  districtId: "sig-wave-v1",
  label: "Учебен булевард със зелена вълна (сценарий sc-sig-green-wave)",
  // 304 m: a bot that departs promptly at 50 reaches the first stop line
  // (y = −27.725) ~22 s in, i.e. ~8 s into that lamp's green — which leaves
  // ~12 s of dawdle tolerance before a live student loses the wave, and still
  // gives the sprint demo room to establish its speeding episode.
  armSouthM: 304,
  // 19 s at 13.889 m/s — the gap the natural offsets demand (see the header).
  blockM: 264,
  armNorthM: 120,
  crossArmM: 90,
  avenueClass: "secondary",
  crossClass: "residential",
  avenueMaxKmh: 50,
  crossMaxKmh: 40,
  waveSpeedKmh: 50,
};

const district = buildSignalWaveDistrict(SW_PARAMS);
const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${SW_PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${SW_PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
console.log(`=== signal-wave build: ${SW_PARAMS.districtId} ===`);
line("signal nodes", district.meta.scenario.junctionNodeIds.join(", "));
line("natural offsets (s)", district.meta.scenario.wave.naturalOffsetsSec.join(" / "));
line("block / travel", `${SW_PARAMS.blockM} m @ ${SW_PARAMS.waveSpeedKmh} km/h = ${district.meta.scenario.wave.blockTravelSec} s`);
line("arms S/N, cross", `${SW_PARAMS.armSouthM}/${SW_PARAMS.armNorthM} m, ±${SW_PARAMS.crossArmM} m`);
line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
line("output", `${CONTENT_FILE} (+ public copy)`);
console.log("Validation OK — the wave invariant holds.");
