/**
 * gen_hz_accident.mjs — the ACCIDENT-SCENE micro-map (Scenario Studio, doc 76 §3;
 * doc 72 §14 VP-12 „Поведение след ПТП / Post-collision conduct", ЗДвП чл. 123 +
 * чл. 20) → content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A plain straight two-way street with ONE marked lane per direction — the stage
 * for driving PAST a fresh crash: a wreck tableau eats the curb-half of the
 * right lane mid-block, and a noStopping (В27) span covers the scene so
 * gawking-to-a-stop in the live lane grades ILLEGAL_STOP_IN_BAN_ZONE. The wreck
 * itself and the bystander are STAGED lesson data (recorder obstacle rects +
 * a pedestrianDartOut in the ScenarioSpec — the sc-hz-emergency-stop pattern),
 * NOT map data: the map hosts only the street + the ban span. The drawn lane is
 * a wide 8.125 m, so a driver can arc AROUND a curb-side wreck WITHOUT crossing
 * the centreline (staying in laneId 0; the gen_hazard_obstacle geometry).
 *
 * WHY the noStopping span is the ONLY map-data addition over gen_hazard_obstacle:
 * this drill grades TWO things — the gawk-stop (ILLEGAL_STOP_IN_BAN_ZONE, off the
 * authored В27 data) and the tight-and-fast pass (COLLISION, off the recorder
 * wreck rects). Both need the street EMPTY of everything else: NO crossing (so
 * the CrossingZoneTracker never arms and no PEDESTRIAN_* code can fire off the
 * staged bystander — the sc-hz-emergency-stop finding), NO junction/signal (so
 * the ban-zone detector's control acquittal never applies and the зона is the
 * whole cause the rest cannot be), NO second zone kind. The battery
 * (hz-accident-districts.test.ts) pins every one of these absences.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     hza-n-end (0, L)                    L = lengthM
 *         │
 *         │   1 lane per direction; right-lane center x = 4.06, curb edge on
 *         │   x = 8.125. The В27 noStopping span [banFromM, banToM] wraps the
 *         │   scene; the wreck sits curb-side of the driving line mid-span, the
 *         │   driver arcs toward the centreline to clear it.
 *         │
 *     hza-spawn-approach (4.06, 15)
 *         │
 *     hza-n-start (0, 0)
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_hz_accident.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/hz-accident-districts.test.ts
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

/** signRef law for the ban span (self-validation) — В27 posts noStopping. */
const NO_STOPPING_SIGN = "В27";

/**
 * @param {{
 *   districtId: string,     // output file name + map.districtId
 *   label: string,          // human label (meta)
 *   lengthM: number,        // street length (200..1000)
 *   maxspeedKmh: number,    // legal limit on the street (30..90)
 *   banFromM: number,       // В27 span start (edge arclength = y), m
 *   banToM: number,         // В27 span end, m
 * }} params
 */
export function buildAccidentSceneStreet(params) {
  const errors = [];
  const { districtId, label, lengthM, maxspeedKmh, banFromM, banToM } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  // The span must leave a clean APPROACH before it (read + slow) and a legal
  // RUN-OUT after it (resume), i.e. 40 <= from < to <= lengthM - 40.
  if (!(banFromM >= 40 && banFromM < banToM && banToM <= lengthM - 40)) {
    errors.push(`ban span must satisfy 40 <= banFromM < banToM <= ${lengthM - 40}, got [${banFromM}, ${banToM}]`);
  }
  if (errors.length > 0) throw new Error(`gen_hz_accident params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W;
  const laneCenterM = r2(SCALED_LANE_W / 2);
  const edgeId = "hza-e-street";

  const NODES = {
    "hza-n-start": [0, 0],
    "hza-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: edgeId,
      from: "hza-n-start",
      to: "hza-n-end",
      class: "residential",
      name: "Права улица с място на произшествие",
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

  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The authored В27 span. The street runs south → north on x = 0, so edge
  // arclength (the runtime Locator's sM) EQUALS district y along the street.
  const ZONES = [
    {
      id: "hza-z-nostopping",
      kind: "noStopping",
      edgeId,
      fromM: r2(banFromM),
      toM: r2(banToM),
      signRef: NO_STOPPING_SIGN,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: "hza-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало на отсечката",
    },
    {
      id: "hza-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — след произшествието",
    },
  ];

  // One visual-anchor block west of the street, beside the scene (clear of the
  // carriageway + sidewalk).
  const BUILDINGS = [
    {
      id: "hza-b-block",
      height: 7,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), r2(banFromM + 4)],
        [r2(-(halfRoadM + 8)), r2(banFromM + 4)],
        [r2(-(halfRoadM + 8)), r2(banFromM + 26)],
        [r2(-(halfRoadM + 20)), r2(banFromM + 26)],
      ],
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
  bounds.minX = Math.min(bounds.minX, -halfRoadM - 6);
  bounds.maxX = Math.max(bounds.maxX, halfRoadM + 6);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_hz_accident.mjs",
      // ZONE-BAN schema marker (ADR-006 stage 2a version contract): this file
      // carries the optional `zones` array.
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна права улица с място на произшествие — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Покрай произшествие: намали под лимита, мини широко от хората и ламарините и не спирай в лентата да зяпаш — В27 забранява престоя през зоната на сцената.",
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
      scenario: {
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
        banZone: { id: ZONES[0].id, kind: ZONES[0].kind, signRef: ZONES[0].signRef, fromM: r2(banFromM), toM: r2(banToM) },
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
    zones: ZONES,
  };

  // -- Self-validation (gen_hazard_obstacle invariants + the ban-span laws).
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
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 street (lanes 2)`);
  }
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${lengthM}`);
    if (z.kind !== "noStopping" || z.signRef !== NO_STOPPING_SIGN) post.push(`${z.id}: must be a noStopping/В27 span`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_hz_accident self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the VP-12 accident-scene micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "hz-accident-v1",
    label: "Учебна улица — място на произшествие (сценарий VP-12)",
    lengthM: 260,
    maxspeedKmh: 50,
    banFromM: 120,
    banToM: 195,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildAccidentSceneStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== accident-scene build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("В27 no-stopping span", `[${district.zones[0].fromM}, ${district.zones[0].toM}] m`);
  line("zonesVersion", district.meta.zonesVersion);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
