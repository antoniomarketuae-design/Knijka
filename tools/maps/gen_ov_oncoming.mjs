/**
 * gen_ov_oncoming.mjs — the OVERTAKE-CORRIDOR micro-map (doc 72 §10 archetypes
 * OV-05 „Изпреварване срещу насрещен" and OV-08 abort discipline; the N1
 * oncoming machinery's home ground).
 *
 *   - ov-oncoming-v1: a straight extra-urban 1+1 two-way road with a DASHED
 *     осева throughout — deliberately NO `zones` array: crossing to the
 *     oncoming bank is LEGAL here (contrast ov-solid-v1's М1 span), which is
 *     exactly what makes the graded quantity the ONCOMING GAP, not the
 *     marking. Hosts BOTH corridor templates (sc-ov-oncoming-gap /
 *     sc-ov-abort — the mw-v1 shared-district precedent): a slow staged lead
 *     + a deterministic oncoming stream are the LESSONS' data, not the map's.
 *
 * Geometry contract (the gen_ban_zones lane math, verbatim): the street runs
 * south → north on x = 0, so edge arclength EQUALS district y; the northbound
 * (own) lane centers x = +4.06, the southbound (oncoming) bank x = −4.06 —
 * the perceptual 8.125 m drawn lane.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_oncoming.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix
 *   lengthM: number,      // road length (600..1200 — the corridor needs room)
 *   maxspeedKmh: number,  // legal limit (50..90 — extra-urban)
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildOncomingRoad(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 600 && lengthM <= 1200)) errors.push(`lengthM must be within 600..1200 m (an overtake corridor needs room), got ${lengthM}`);
  if (!(maxspeedKmh >= 50 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 50..90 (extra-urban), got ${maxspeedKmh}`);
  if (errors.length > 0) throw new Error(`gen_ov_oncoming params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 → lanesPerDir 1; northbound
  // lane (laneId 0) centers 0.5 drawn lanes east of the polyline.
  const lanes = 2;
  const lanesPerDir = 1;
  const laneRightM = r2(0.5 * SCALED_LANE_W); // 4.06 — the own (northbound) lane
  const halfRoadM = lanesPerDir * SCALED_LANE_W;

  const edgeId = `${idPrefix}-e-road`;
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: edgeId,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      class: "tertiary",
      name: label,
      oneway: false,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — своята лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // One visual-anchor block west of the road near the spawn (the rest of the
  // stretch reads as open country — the rural sightline the corridor needs).
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 5,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 22)), 40],
        [r2(-(halfRoadM + 9)), 40],
        [r2(-(halfRoadM + 9)), 58],
        [r2(-(halfRoadM + 22)), 58],
      ],
    },
  ];

  const bounds = {
    minX: r2(-(halfRoadM + 28)),
    minY: -6,
    maxX: r2(halfRoadM + 6),
    maxY: r2(lengthM + 6),
  };

  const scenario = {
    archetype: "straight-street",
    params: { lengthM, maxspeedKmh },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    /** The oncoming (southbound) bank center — the corridor's other half. */
    laneCenterOncomingM: r2(-laneRightM),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_ov_oncoming.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен извънградски път за изпреварване срещу насрещно движение — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: noteBg,
      },
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: 0,
        crossings: 0,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
      },
      scenario,
    },
    roads: {
      nodes: Object.entries(NODES)
        .map(([id, [x, y]]) => ({ id, x: r2(x), y: r2(y) }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: EDGES,
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: BUILDINGS,
    spawnPoints: SPAWN_POINTS,
  };

  // -- Self-validation (the gen_ban_zones invariants, minus zones).
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
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way 1+1 road expected`);
  }
  if (district.zones !== undefined) post.push("ov-oncoming carries NO zones by design (dashed осева — legal crossing country)");
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`own lane center ${laneRightM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_oncoming self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (OVERTAKE-CORRIDOR slice)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ov-oncoming-v1",
    label: "Учебен извънградски път — изпреварване срещу насрещни (сценарии OV-05/OV-08)",
    idPrefix: "ovg",
    lengthM: 900,
    maxspeedKmh: 90,
    noteBg:
      "Двупосочен път с прекъсната осева: изпреварването е разрешено — преценявай насрещния прозорец в секунди и прекъсвай маневрата, щом той се затваря.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildOncomingRoad(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== ov-oncoming build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("lanes (total / per dir)", `2 / 1`);
  line("own / oncoming centers", `+${district.meta.scenario.laneCenterRightM} / ${district.meta.scenario.laneCenterOncomingM}`);
  line("zones", "none (dashed осева by design)");
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
