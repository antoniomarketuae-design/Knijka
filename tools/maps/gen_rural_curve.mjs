/**
 * gen_rural_curve.mjs — the RURAL-CURVE micro-map (Scenario Studio doc 76 §3;
 * doc 72 §8 archetype SP-05 „Скорост в завой" — SWOV's headline novice
 * finding: single-vehicle loss of control IN CURVES). The map archetype id
 * "rural-curve" has been reserved in scenario/types.ts MAP_ARCHETYPES since
 * the vocabulary shipped — this generator brings it alive.
 *
 *   - sp-curve-v1  „Скорост в завой"  (SP-05): an extra-urban 1+1 road posted
 *     90 km/h (the ЗДвП чл. 21 default извън населено място) — a straight
 *     approach, a marked ~90° arc, a straight exit. The ARC carries the
 *     first "curveAdvisory" district zone span (advisoryKmh 50 — the Т-table
 *     under the А1 „Опасен завой надясно" warning): sustained speed above the
 *     advisory inside the span grades the основна SPEED_TOO_FAST_FOR_CURVE
 *     (чл. 20 ал. 2). The approach and exit stay governed by the posted 90
 *     alone — the speed lesson is WHERE you slow down, not just how much.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; the
 * `zones` array is optional and additive; kind "curveAdvisory" carries the
 * REQUIRED advisoryKmh (a span without it is inert); meta.zonesVersion stays 1.
 *
 * CURVED GEOMETRY (the polyline law): the arc is a chorded polyline sampled
 * every ARC_STEP_DEG (2.5° at R = 170 → ~7.4 m chords, sagitta ~0.04 m) — the
 * same discipline as the mini-roundabout ring (~5 m spacing), which the
 * Locator/lane-fix already handles. The zone span's [fromM, toM] is computed
 * from the ACTUAL polyline cumulative arclength (the Locator's sM measure), so
 * membership resolves exactly like maxspeed does.
 *
 * TURN-DETECTOR NO-DOUBLE-BILL (documented interplay proof, doc 72 §8):
 * turnStarted needs BOTH > 55° of heading change within a 3 s window AND the
 * vehicle inside a junction area (≤ 40 m of an intersection node —
 * runtime/turns.ts). This map is structurally safe twice over:
 *  1. it has ZERO intersections, so the junction-area gate can never open;
 *  2. even the WINDOW math stays under threshold at every relevant speed on
 *     the inside lane (radius R − 4.06 ≈ 165.9 m):
 *       50 km/h (advisory) → ~4.8°/s → ~14.4°/3 s
 *       70 km/h (guilty)   → ~6.7°/s → ~20.2°/3 s
 *       90 km/h (limit)    → ~8.6°/s → ~25.9°/3 s   — all « 55°.
 * The self-validation below asserts both facts so a future param change that
 * would break the guarantee fails the build, not the student.
 *
 * RECORDER CURVE-CAP HEADROOM (traces/recorder.ts): the kinematic recorder
 * caps curve speed at √(2.4 · radius) ≈ 71.9 km/h on the inside lane — the
 * guilty demo (hold ~70 into the advisory-50 arc) must stay recordable, so
 * the self-validation asserts cap > advisory + 20 km/h.
 *
 * KNOWN VISUAL GAP (honest, the gen_ban_zones precedent): no А1/Т-table sign
 * assets exist yet, so the zone GRADES correctly but renders no sign post —
 * the scenario copy carries the sign teaching until a sign-asset drop.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_rural_curve.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Arc sampling step, degrees (~7.4 m chords at R = 170 — the ring's law). */
const ARC_STEP_DEG = 2.5;

/** Turn-detector window constants (runtime/turns.ts) — asserted against. */
const TURN_THRESHOLD_DEG = 55;
const TURN_WINDOW_SEC = 3;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation): А1 = опасен завой надясно. */
const KIND_TO_SIGN = { curveAdvisory: "А1" };

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix (e.g. "spc")
 *   approachM: number,    // straight approach length (120..500)
 *   radiusM: number,      // centerline arc radius (120..400)
 *   sweepDeg: number,     // arc sweep (60..120; the SP-05 shape is ~90)
 *   exitM: number,        // straight exit length (100..500)
 *   maxspeedKmh: number,  // posted limit (the extra-urban 90)
 *   advisoryKmh: number,  // curve advisory (Т-table under А1)
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildRuralCurveRoad(params) {
  const errors = [];
  const { districtId, label, idPrefix, approachM, radiusM, sweepDeg, exitM, maxspeedKmh, advisoryKmh, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(approachM >= 120 && approachM <= 500)) errors.push(`approachM must be within 120..500 m, got ${approachM}`);
  if (!(radiusM >= 120 && radiusM <= 400)) errors.push(`radiusM must be within 120..400 m, got ${radiusM}`);
  if (!(sweepDeg >= 60 && sweepDeg <= 120)) errors.push(`sweepDeg must be within 60..120°, got ${sweepDeg}`);
  if (!(exitM >= 100 && exitM <= 500)) errors.push(`exitM must be within 100..500 m, got ${exitM}`);
  if (!(maxspeedKmh >= 50 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 50..90, got ${maxspeedKmh}`);
  if (!(advisoryKmh >= 30 && advisoryKmh < maxspeedKmh)) {
    errors.push(`advisoryKmh must satisfy 30 <= advisory < maxspeed, got ${advisoryKmh} vs ${maxspeedKmh}`);
  }
  if (sweepDeg !== 90) errors.push(`only the 90° sweep is exercised/asserted so far, got ${sweepDeg}`);
  if (errors.length > 0) throw new Error(`gen_rural_curve params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanesPerDir = 1;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  // -- Geometry: south→north approach on x = 0, then a 90° RIGHT (eastward)
  // arc around center (radiusM, approachM), then a straight exit east.
  const cx = radiusM;
  const cy = approachM;
  const steps = Math.round(sweepDeg / ARC_STEP_DEG);
  const geometry = [
    [0, 0],
    [0, approachM],
  ];
  const arcStartIdx = 1; // index of the arc's first vertex in `geometry`
  for (let i = 1; i <= steps; i++) {
    const th = ((i * ARC_STEP_DEG) * Math.PI) / 180;
    geometry.push([r2(cx - radiusM * Math.cos(th)), r2(cy + radiusM * Math.sin(th))]);
  }
  const arcEndIdx = geometry.length - 1;
  const endX = r2(radiusM + exitM);
  const endY = r2(approachM + radiusM);
  geometry.push([endX, endY]);

  // Cumulative arclength (the Locator's sM measure) over the ROUNDED points —
  // the span must live in exactly the metric the runtime resolves.
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(geometry[i][0] - geometry[i - 1][0], geometry[i][1] - geometry[i - 1][1]));
  }
  const zoneFromM = r2(cum[arcStartIdx]);
  const zoneToM = r2(cum[arcEndIdx]);

  const edgeId = `${idPrefix}-e-road`;
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [endX, endY],
  };
  const EDGES = [
    {
      id: edgeId,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      class: "unclassified",
      name: label,
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

  const INTERSECTIONS = []; // NO junctions — the turn detector stays disarmed
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The authored curve-advisory span — the arc IS the zone.
  const signRef = KIND_TO_SIGN.curveAdvisory;
  const ZONES = [
    {
      id: `${idPrefix}-z-curve`,
      kind: "curveAdvisory",
      edgeId,
      fromM: zoneFromM,
      toM: zoneToM,
      signRef,
      advisoryKmh,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-approach`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — подход към завоя",
    },
    {
      id: `${idPrefix}-spawn-exit`,
      x: r2(endX - 15),
      y: r2(endY - laneRightM),
      heading: 90,
      edgeId,
      name: "Контролна точка — след завоя",
    },
  ];

  // The inside-lane arc midpoint (θ = sweep/2 at radius R − laneRightM) — the
  // ScenarioSpec pins its mid-curve control zone by value; the district
  // battery asserts the copy against this truth (the L7 pattern).
  const rLane = radiusM - laneRightM;
  const midTh = ((sweepDeg / 2) * Math.PI) / 180;
  const laneCurveMid = { x: r2(cx - rLane * Math.cos(midTh)), y: r2(cy + rLane * Math.sin(midTh)) };

  // One visual-anchor block west of the approach, near the А1 sign-reading
  // moment (the arc bulges EAST, so the west verge stays clear of it).
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-barn`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 22)), r2(approachM - 60)],
        [r2(-(halfRoadM + 9)), r2(approachM - 60)],
        [r2(-(halfRoadM + 9)), r2(approachM - 42)],
        [r2(-(halfRoadM + 22)), r2(approachM - 42)],
      ],
    },
  ];

  const bounds = {
    minX: r2(-(halfRoadM + 28)),
    minY: -6,
    maxX: r2(endX + 6),
    maxY: r2(endY + halfRoadM + 6),
  };

  const scenario = {
    archetype: "rural-curve",
    params: { approachM, radiusM, sweepDeg, exitM, maxspeedKmh, advisoryKmh },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    curveZone: { id: ZONES[0].id, kind: "curveAdvisory", signRef, fromM: zoneFromM, toM: zoneToM, advisoryKmh },
    laneCurveMid,
    exitLaneY: r2(endY - laneRightM),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_rural_curve.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен извънградски път с обозначен завой — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // The extra-urban default (ЗДвП чл. 21: извън населено място 90 км/ч
        // for category B) — doubles as the runtime's off-road fallback.
        maxspeedUrbanKmh: maxspeedKmh,
        note: noteBg,
      },
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
        zones: ZONES.length,
      },
      scenario,
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
    zones: ZONES,
  };

  // -------------------------------------------------------------------------
  // Self-validation (the gen_ban_zones invariants + the curve-specific laws)
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 road (lanes 2)`);
  }
  // Chord discipline: every arc chord ≤ 10 m (Locator smoothness — the ring's
  // ~5 m precedent; sagitta at 10 m/R120 is ~0.10 m, far under lane tolerance).
  for (let i = arcStartIdx + 1; i <= arcEndIdx; i++) {
    const chord = Math.hypot(geometry[i][0] - geometry[i - 1][0], geometry[i][1] - geometry[i - 1][1]);
    if (chord > 10) post.push(`arc chord ${i} is ${r2(chord)} m (> 10 m — raise the sampling density)`);
  }
  // Arc length sanity: the chorded polyline must sit within 1% of the true arc.
  const trueArc = (radiusM * sweepDeg * Math.PI) / 180;
  if (Math.abs(zoneToM - zoneFromM - trueArc) > trueArc * 0.01) {
    post.push(`arc polyline length ${r2(zoneToM - zoneFromM)} deviates > 1% from the true arc ${r2(trueArc)}`);
  }
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= EDGES[0].length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${EDGES[0].length}`);
    }
    if (Math.abs(z.fromM - approachM) > 0.05) post.push(`${z.id}: span must start at the arc (fromM ${z.fromM} != approach ${approachM})`);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
    if (!(Number.isFinite(z.advisoryKmh) && z.advisoryKmh > 0)) post.push(`${z.id}: advisoryKmh required (an advisory-less span is inert)`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  // Turn-detector no-double-bill guarantee (see the header):
  if (INTERSECTIONS.length !== 0) post.push("rural-curve must carry ZERO intersections (turn-detector junction gate)");
  const degPerSecAtLimit = ((maxspeedKmh / 3.6) / rLane) * (180 / Math.PI);
  if (degPerSecAtLimit * TURN_WINDOW_SEC >= TURN_THRESHOLD_DEG) {
    post.push(
      `turn-window math broken: ${r2(degPerSecAtLimit * TURN_WINDOW_SEC)}°/${TURN_WINDOW_SEC}s at the ${maxspeedKmh} limit reaches the ${TURN_THRESHOLD_DEG}° threshold — widen radiusM`,
    );
  }
  // Recorder curve-cap headroom (traces/recorder.ts √(2.4·R) lateral law):
  const capKmh = Math.sqrt(2.4 * rLane) * 3.6;
  if (capKmh <= advisoryKmh + 20) {
    post.push(`recorder curve cap ${r2(capKmh)} km/h leaves no guilty-demo headroom over advisory ${advisoryKmh} — widen radiusM`);
  }
  // Spawns on the carriageway.
  const sApproach = SPAWN_POINTS[0];
  if (Math.abs(sApproach.x) > halfRoadM || sApproach.y < 0 || sApproach.y > approachM) post.push(`${sApproach.id}: not on the approach`);
  const sExit = SPAWN_POINTS[1];
  if (Math.abs(sExit.y - endY) > halfRoadM || sExit.x < radiusM || sExit.x > endX) post.push(`${sExit.id}: not on the exit leg`);
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rural_curve self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (SP-05)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "sp-curve-v1",
    label: "Учебен извънградски път — скорост в завой (сценарий SP-05)",
    idPrefix: "spc",
    approachM: 220,
    radiusM: 170,
    sweepDeg: 90,
    exitM: 200,
    maxspeedKmh: 90,
    advisoryKmh: 50,
    noteBg:
      "Извънградски път с ограничение 90 км/ч; знак А1 с табела препоръчва 50 км/ч в обозначения завой — свали скоростта ПРЕДИ завоя, дръж я равномерно през дъгата.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildRuralCurveRoad(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== rural-curve build: ${params.districtId} ===`);
  line("approach / arc / exit", `${params.approachM} m / ${params.sweepDeg}° @ R${params.radiusM} / ${params.exitM} m`);
  line("limit / advisory", `${params.maxspeedKmh} km/h / ${params.advisoryKmh} km/h`);
  line("curve zone", `${district.zones[0].signRef} curveAdvisory @ [${district.zones[0].fromM}, ${district.zones[0].toM}] m`);
  line("lane mid-arc", `(${district.meta.scenario.laneCurveMid.x}, ${district.meta.scenario.laneCurveMid.y})`);
  line("edge length", `${district.roads.edges[0].length} m`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
