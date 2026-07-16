/**
 * gen_ban_zones.mjs — the ZONE-BAN micro-maps (ADR-006 stage 2a; doc 72 §10/§11
 * archetypes OV-06 „изпреварване при забрана" and PK-06 „спиране в забранена
 * зона"). First maps carrying the OPTIONAL district `zones` array — the map
 * data v2 slice: a ban is AUTHORED data (a span of edge arclength + the posting
 * sign), never a heuristic, which is what makes the deferred-illegal-stop
 * false-positive finding structural.
 *
 *   - ov-ban-v1  „Изпреварване при забрана"   (OV-06): a 2+2 boulevard with a
 *     В24 no-overtaking span mid-route — a slow lead is staged by the LESSON;
 *     the legal overtake happens after the zone ends.
 *   - pk-ban-v1  „Спиране в забранена зона"   (PK-06): a 1+1 street with a
 *     В27 no-stopping span — the legal stop happens after the zone ends.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; the
 * `zones` array is optional and additive; files that carry it set
 * meta.zonesVersion = 1. NO shipped v1 file is regenerated.
 *
 * KNOWN VISUAL GAP (honest): the district renderer instances authored GLB
 * sign models keyed by SignKind (stop/giveWay/limit50/roundabout —
 * WorldProps.tsx + platform/public/sim/signs). No В24/В27 sign assets exist
 * yet, so these zones GRADE correctly but render no sign post; the scenario
 * copy carries the sign teaching until a sign-asset drop extends SignKind.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ban_zones.mjs
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

/** signRef ↔ kind pairing law of the first slice (self-validation). */
const KIND_TO_SIGN = { noOvertaking: "В24", noStopping: "В27", noParking: "В28" };

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/spawn id prefix (e.g. "ovb")
 *   lengthM: number,        // street length (200..1000)
 *   lanes: 2 | 4,           // total marked lanes (1+1 street or 2+2 boulevard)
 *   maxspeedKmh: number,    // legal limit (30..90)
 *   zone: { kind: "noStopping"|"noParking"|"noOvertaking", fromM: number, toM: number },
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildBanZoneStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, lanes, maxspeedKmh, zone, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (lanes !== 2 && lanes !== 4) errors.push(`lanes must be 2 (1+1) or 4 (2+2), got ${lanes}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!zone || !(zone.kind in KIND_TO_SIGN)) errors.push(`zone.kind must be one of ${Object.keys(KIND_TO_SIGN).join("/")}`);
  if (!zone || !(zone.fromM >= 40 && zone.toM <= lengthM - 60 && zone.fromM < zone.toM)) {
    errors.push(`zone span must satisfy 40 <= fromM < toM <= ${lengthM - 60} (approach + legal run-out), got [${zone?.fromM}, ${zone?.toM}]`);
  }
  if (errors.length > 0) throw new Error(`gen_ban_zones params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): lanesPerDir = lanes/2; northbound
  // right lane (laneId 0) centers (lanesPerDir - 0.5) drawn lanes east.
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06 (1+1) / 12.19 (2+2)
  const laneLeftM = lanesPerDir === 2 ? r2(0.5 * SCALED_LANE_W) : null; // 4.06 on 2+2
  const halfRoadM = lanesPerDir * SCALED_LANE_W;

  const edgeId = `${idPrefix}-e-street`;
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
      class: lanes === 4 ? "tertiary" : "residential",
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

  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The authored ban span. The street runs south → north on x = 0, so edge
  // arclength (the runtime Locator's sM) EQUALS district y along the street.
  const signRef = KIND_TO_SIGN[zone.kind];
  const ZONES = [
    {
      id: `${idPrefix}-z-${zone.kind.toLowerCase()}`,
      kind: zone.kind,
      edgeId,
      fromM: r2(zone.fromM),
      toM: r2(zone.toM),
      signRef,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — дясна лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — след зоната",
    },
  ];

  // One visual-anchor block west of the street, near the zone start (the
  // sign-reading moment), clear of carriageway + sidewalk.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), r2(zone.fromM - 30)],
        [r2(-(halfRoadM + 8)), r2(zone.fromM - 30)],
        [r2(-(halfRoadM + 8)), r2(zone.fromM - 14)],
        [r2(-(halfRoadM + 20)), r2(zone.fromM - 14)],
      ],
    },
  ];

  const bounds = {
    minX: r2(-(halfRoadM + 26)),
    minY: -6,
    maxX: r2(halfRoadM + 6),
    maxY: r2(lengthM + 6),
  };

  const scenario = {
    archetype: "straight-street",
    params: { lengthM, maxspeedKmh, banKind: zone.kind, banFromM: r2(zone.fromM), banToM: r2(zone.toM) },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    banZone: { id: ZONES[0].id, kind: zone.kind, signRef, fromM: r2(zone.fromM), toM: r2(zone.toM) },
  };
  if (laneLeftM !== null) scenario.laneCenterLeftM = laneLeftM;

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_ban_zones.mjs",
      // ZONE-BAN schema marker (ADR-006 stage 2a version contract): this file
      // carries the optional `zones` array.
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица със забранителна зона — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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

  // -- Self-validation (the gen_sp_speed/gen_ov_crossing invariants + zones).
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
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way street with ${lanes} marked lanes expected`);
  }
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${lengthM}`);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  if (laneLeftM !== null && !(laneLeftM > 0 && laneLeftM < halfRoadM)) post.push(`left lane center ${laneLeftM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ban_zones self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The two committed instances (ZONE-BAN slice 1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // OV-06 host: 2+2 so the overtake is a SAME-direction lane change (the
    // shipped lane-change machinery); the В24 span covers the mid-route.
    districtId: "ov-ban-v1",
    label: "Учебен булевард — изпреварване при забрана В24 (сценарий OV-06)",
    idPrefix: "ovb",
    lengthM: 400,
    lanes: 4,
    maxspeedKmh: 50,
    zone: { kind: "noOvertaking", fromM: 90, toM: 210 },
    noteBg: "В24 забранява изпреварването в отсечката 90–210 м: следвай търпеливо и изпреварвай чак след края на зоната.",
  },
  {
    // PK-06 host: plain 1+1 street; the В27 span covers the mid-route, with a
    // legal stopping run-out after it.
    districtId: "pk-ban-v1",
    label: "Учебна улица — спиране в забранена зона В27 (сценарий PK-06)",
    idPrefix: "pkb",
    lengthM: 300,
    lanes: 2,
    maxspeedKmh: 50,
    zone: { kind: "noStopping", fromM: 70, toM: 190 },
    noteBg: "В27 забранява престоя и паркирането в отсечката 70–190 м: спри чак след края на зоната, плътно вдясно.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildBanZoneStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== ban-zone build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("lanes (total / per dir)", `${params.lanes} / ${params.lanes / 2}`);
  line("ban zone", `${district.zones[0].signRef} ${district.zones[0].kind} @ [${district.zones[0].fromM}, ${district.zones[0].toM}] m`);
  line("zonesVersion", district.meta.zonesVersion);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
