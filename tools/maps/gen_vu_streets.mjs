/**
 * gen_vu_streets.mjs — the VRU-INTERACTION street micro-maps (doc 72 §15 item
 * #8 / N8 slice 1; doc 72 §7 „Family VU") → content/world/vu-pass-v1.json +
 * vu-door-v1.json (+ byte-identical publish to platform/public/world/).
 *
 * Two variants of one straight S→N street (the gen_ban_zones bones):
 *
 *   - vu-pass-v1  „Тясно изпреварване на колело"  (VU-02): a plain 1+1 street,
 *     NO intersections, NO zones — the staged curb-riding cyclist proxy cruises
 *     the east (northbound) curb line and the driver passes it MID-BLOCK. The
 *     whole point of the emptiness: the runtime's vulnerable-pass tracker
 *     (worldRuntime VULNERABLE_PASS_*) disarms inside junction areas, so a
 *     junction-free street guarantees the pass adjudicates everywhere, and the
 *     ONLY thing the stack can grade is the lateral clearance the driver sets.
 *
 *   - vu-door-v1  „Вратата / The door zone"       (VU-04): the same street
 *     lined with an OCCUPIED parallel parking row on the east curb
 *     (meta.scenario.bays — the lot-generator single truth: the scene mounts
 *     precise hittable parked cars, the trace scripts SAT the same rects), plus
 *     an М1 solid-осева span over the row (the honest second-mistake canvas:
 *     dodging the door by swerving into the oncoming bank grades
 *     CROSSED_SOLID_LINE). The door itself is a TIMED trace obstacle
 *     (ObstacleRect2D.trigger — recorder-side), pinned in the trace script, not
 *     map data: the map hosts the row, the script stages the ambush.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_vu_streets.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * vu-streets-districts.test.ts
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
 *   districtId: string,       // output file name + ScenarioSpec.map.districtId
 *   label: string,            // human label (meta)
 *   idPrefix: string,         // node/edge/spawn id prefix ("vup" / "vud")
 *   lengthM: number,          // street length (200..1000)
 *   maxspeedKmh: number,      // legal limit (30..90)
 *   variant: "pass" | "door", // which VU host this street is
 *   // door variant only:
 *   solidSpan?: { fromM: number, toM: number },  // М1 span over the row
 *   parkedRow?: { xM: number, fromYM: number, count: number, pitchM: number,
 *                 widthM: number, lengthM: number }, // east-curb parallel row
 *   noteBg: string,
 * }} params
 */
export function buildVuStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, variant, solidSpan, parkedRow, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (variant !== "pass" && variant !== "door") errors.push(`variant must be "pass" | "door", got ${variant}`);
  if (variant === "door") {
    if (!solidSpan || !(solidSpan.fromM >= 40 && solidSpan.toM <= lengthM - 40 && solidSpan.fromM < solidSpan.toM)) {
      errors.push(`door variant needs solidSpan with 40 <= fromM < toM <= ${lengthM - 40}`);
    }
    if (!parkedRow || !(parkedRow.count >= 4 && parkedRow.pitchM > parkedRow.lengthM)) {
      errors.push(`door variant needs parkedRow with count >= 4 and pitchM > lengthM (no overlapping cars)`);
    }
  } else if (solidSpan || parkedRow) {
    errors.push(`pass variant must not carry solidSpan/parkedRow (the emptiness IS the archetype)`);
  }
  if (errors.length > 0) throw new Error(`gen_vu_streets params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 street — northbound right lane
  // (laneId 0) centers half a drawn lane east of the centerline.
  const lanesPerDir = 1;
  const laneRightM = r2(0.5 * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

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
      class: "residential",
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

  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Door variant: the М1 span (edge arclength == district y on this street).
  const ZONES =
    variant === "door"
      ? [
          {
            id: `${idPrefix}-z-solidcenterline`,
            kind: "solidCenterLine",
            edgeId,
            fromM: r2(solidSpan.fromM),
            toM: r2(solidSpan.toM),
            signRef: "М1",
          },
        ]
      : [];

  // Door variant: the OCCUPIED parallel row on the east curb — the lot
  // generator's single geometric truth (ScenarioObstacles mounts precise
  // hittable cars from it; lotObstacleRects SATs the same rects headless).
  const BAYS =
    variant === "door"
      ? Array.from({ length: parkedRow.count }, (_, i) => ({
          id: `${idPrefix}-bay-${i + 1}`,
          x: r2(parkedRow.xM),
          y: r2(parkedRow.fromYM + i * parkedRow.pitchM),
          headingDeg: 0,
          widthM: r2(parkedRow.widthM),
          lengthM: r2(parkedRow.lengthM),
          occupied: true,
        }))
      : [];

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
      name: "Контролна точка — край на отсечката",
    },
  ];

  // One visual-anchor block west of the street, mid-route, clear of the
  // carriageway + sidewalk.
  const anchorY = variant === "door" ? solidSpan.fromM : lengthM / 2;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), r2(anchorY - 30)],
        [r2(-(halfRoadM + 8)), r2(anchorY - 30)],
        [r2(-(halfRoadM + 8)), r2(anchorY - 14)],
        [r2(-(halfRoadM + 20)), r2(anchorY - 14)],
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
    params: {
      lengthM,
      maxspeedKmh,
      variant,
      ...(variant === "door"
        ? { banFromM: r2(solidSpan.fromM), banToM: r2(solidSpan.toM), parkedRowXM: r2(parkedRow.xM) }
        : {}),
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    ...(variant === "door"
      ? {
          banZone: {
            id: ZONES[0].id,
            kind: "solidCenterLine",
            signRef: "М1",
            fromM: r2(solidSpan.fromM),
            toM: r2(solidSpan.toM),
          },
          bays: BAYS,
        }
      : {}),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-vru",
      generator: "tools/maps/gen_vu_streets.mjs",
      ...(ZONES.length > 0 ? { zonesVersion: 1 } : {}),
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица за уязвими участници — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
        ...(ZONES.length > 0 ? { zones: ZONES.length } : {}),
        ...(BAYS.length > 0 ? { bays: BAYS.length } : {}),
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
    ...(ZONES.length > 0 ? { zones: ZONES } : {}),
  };

  // -- Self-validation (the gen_ban_zones invariants + the VU-specific laws).
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: 1+1 two-way street expected`);
    if (e.class !== "residential") post.push(`${e.id}: residential class expected (no derived stop lines)`);
  }
  // VU-02's reason to exist: a junction-free street (the vulnerable-pass
  // tracker disarms inside junction areas — an intersection here would carve
  // dead zones out of the pass corridor).
  if (INTERSECTIONS.length !== 0) post.push(`intersections must be empty on a VU street`);
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${lengthM}`);
  }
  for (const b of BAYS) {
    // The row must sit curb-side of the northbound lane: fully east of the
    // lane center, fully west of the curb line.
    if (!(b.x - b.widthM / 2 > laneRightM)) post.push(`${b.id}: row edge reaches the lane center`);
    if (!(b.x + b.widthM / 2 <= halfRoadM)) post.push(`${b.id}: row crosses the curb line`);
    if (!(b.y > 0 && b.y < lengthM)) post.push(`${b.id}: off the street`);
    // The М1 span must cover the whole row (the swerve mistake's canvas).
    if (ZONES.length > 0 && !(b.y >= ZONES[0].fromM && b.y <= ZONES[0].toM)) {
      post.push(`${b.id}: outside the М1 span [${ZONES[0].fromM}, ${ZONES[0].toM}]`);
    }
  }
  if (variant === "door" && district.meta.zonesVersion !== 1) {
    post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  }
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_vu_streets self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The two committed instances (VRU-interaction pack slice 1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // VU-02 host: an empty 1+1 street — the staged cyclist proxy rides the
    // east curb northbound; the pass adjudicates mid-block (no junctions).
    districtId: "vu-pass-v1",
    label: "Учебна улица — изпреварване на велосипедист (сценарий VU-02)",
    idPrefix: "vup",
    lengthM: 360,
    maxspeedKmh: 50,
    variant: "pass",
    noteBg:
      "Покрай източния бордюр се движи велосипедист: изпреварвай го само с широка дъга — поне метър и половина въздух.",
  },
  {
    // VU-04 host: the same street lined with an occupied parallel row on the
    // east curb + an М1 solid осева over the row (the swerve-mistake canvas).
    // Row math (pinned by the battery + the trace script): bay center x 6.75,
    // width 2.0 → row edge x 5.75 (bay paint) / 5.85 (the 0.9 half-width
    // parked-car rect twin); the drawn lane center sits at 4.06.
    districtId: "vu-door-v1",
    label: "Учебна улица — зоната на вратата (сценарий VU-04)",
    idPrefix: "vud",
    lengthM: 300,
    maxspeedKmh: 40,
    variant: "door",
    solidSpan: { fromM: 90, toM: 240 },
    parkedRow: { xM: 6.75, fromYM: 110, count: 10, pitchM: 9, widthM: 2.0, lengthM: 5.0 },
    noteBg:
      "Плътна редица паркирани коли вдясно: дръж поне една отворена врата разстояние от тях — вратата се отваря без предупреждение.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildVuStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== vu-street build: ${params.districtId} ===`);
  line("variant", params.variant);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  if (district.zones) {
    line("М1 span", `[${district.zones[0].fromM}, ${district.zones[0].toM}] m`);
  }
  if (district.meta.scenario.bays) {
    line("parked row", `${district.meta.scenario.bays.length} bays @ x ${district.meta.scenario.bays[0].x}`);
  }
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
