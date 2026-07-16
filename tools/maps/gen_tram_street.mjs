/**
 * gen_tram_street.mjs — the TRAM-STOP micro-map (ADR-006 stage 3b; doc 72 §12
 * archetype RX-04 „Трамвайна спирка с остров"). The rail pack's actor-slice
 * street: a straight 1+1 road (the gen_pe_crossings bones) whose OPPOSITE
 * (southbound) lane carries a street-running tram corridor — trams in this
 * engine are PATH-LOCKED staged actors (profile "tram" on the shipped staged
 * vehicle seam), so the corridor is DATA, not physics: the tram's authored
 * lane polyline IS its track. The map contributes:
 *
 *   - ONE marked, unsignalized crossing (rxt-x-1) where passengers cross the
 *     player's lane to reach the stop island — the existing CrossingZone /
 *     PEDESTRIAN_* grading chain adjudicates the whole scenario (ЗДвП чл. 66,
 *     ал. 2: остров на платното — намали и при необходимост спри, за да
 *     преминат пешеходците между тротоара и острова);
 *   - the STOP ISLAND as a LOW extruded block (rxt-b-island, 0.25 m) on the
 *     buildings channel — an authored physical platform between the tram
 *     corridor and the player's lane (no new world contract: buildings are a
 *     shipped channel; the island is just a very low one);
 *   - meta.scenario.tramStop — the single pinned truth the templates + trace
 *     batteries copy by value (island span, tram hold pose, lane centers).
 *
 * KNOWN VISUAL GAP (honest, the 3a precedent): the markings builder paints
 * only white paint quads from network data — no dark rail-pair strip exists,
 * so the tram TRACK renders as ordinary asphalt; the halted tram rig, the
 * island block and the scenario copy carry the visual story until a markings
 * seam grows a dark-strip channel. Grading never reads paint.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_tram_street.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** Street continues this far past the crossing (run-out + finish), m. */
const RUNOUT_M = 60;

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
 *   approachM: number,    // street-start → crossing distance (60..300)
 *   maxspeedKmh: number,  // legal limit (30..50 — a stop street is slow)
 *   island: {
 *     fromY: number,      // island south edge (must clear the zebra)
 *     toY: number,        // island north edge
 *     westX: number,      // island west edge (clear of the tram body)
 *     eastX: number,      // island east edge (clear of the player lane)
 *     heightM: number,    // platform height (a curb, not a building)
 *   },
 *   tramHoldY: number,    // halted tram BODY CENTER y on the southbound lane
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildTramStopStreet(params) {
  const errors = [];
  const { districtId, label, approachM, maxspeedKmh, island, tramHoldY, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (!island) errors.push("island block spec is required (RX-04 IS the island stop)");
  if (errors.length > 0) throw new Error(`gen_tram_street params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right (northbound) lane center

  const NODES = {
    "rxt-n-start": [0, 0],
    "rxt-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "rxt-e-street",
      from: "rxt-n-start",
      to: "rxt-n-end",
      class: "residential",
      name: "Улица с трамвайна спирка",
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

  // The passenger crossing: the single geometric truth (CrossingZoneTracker +
  // markings + the ScenarioSpec all read exactly this).
  const CROSSINGS = [
    {
      id: "rxt-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "rxt-e-street",
    },
  ];

  const INTERSECTIONS = [];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "rxt-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "rxt-e-street",
      name: "Подход към трамвайната спирка",
    },
    {
      id: "rxt-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "rxt-e-street",
      name: "Контролна точка — след спирката",
    },
  ];

  // The STOP ISLAND: a low extruded platform between the tram corridor and
  // the player's lane (buildings are a shipped channel — no new contract),
  // plus one corner-shop visual anchor west of the street (the pe mold).
  const BUILDINGS = [
    {
      id: "rxt-b-island",
      height: island.heightM,
      heightSource: "default",
      footprint: [
        [r2(island.westX), r2(island.fromY)],
        [r2(island.eastX), r2(island.fromY)],
        [r2(island.eastX), r2(island.toY)],
        [r2(island.westX), r2(island.toY)],
      ],
    },
    {
      id: "rxt-b-shop",
      height: 4.5,
      heightSource: "default",
      footprint: [
        [-26, r2(crossingY - 34)],
        [-16, r2(crossingY - 34)],
        [-16, r2(crossingY - 22)],
        [-26, r2(crossingY - 22)],
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

  const southboundLaneCenterM = r2(-SCALED_LANE_W / 2);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_tram_street.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с трамвайна спирка с остров — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
      },
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the pinned
       * tram-stop truth. ScenarioSpecs copy these by value; the district
       * battery asserts the copies match this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings: 1, signalized: "no", approachM, tramStop: "island" },
        primaryCrossingId: "rxt-x-1",
        laneCenterRightM: laneCenterM,
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
        tramStop: {
          islandId: "rxt-b-island",
          islandFromY: r2(island.fromY),
          islandToY: r2(island.toY),
          /** Southbound lane center — the halted tram's corridor. */
          tramLaneCenterM: southboundLaneCenterM,
          /** Halted tram body-center y (the staged hold pose the template
           *  pins: hold offsetM = lengthM − tramHoldY on the end→start path). */
          tramHoldY: r2(tramHoldY),
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
  // Self-validation (the gen_pe_crossings invariants + the island/tram laws)
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: two-way 1+1 street expected`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "rxt-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "rxt-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  // Island laws: a PLATFORM, not a wall; north of the zebra so the crossing
  // path stays clear; strictly between the tram body edge and the player lane.
  if (!(island.heightM > 0 && island.heightM <= 0.4)) {
    post.push(`island height ${island.heightM} must be a curb (0 < h <= 0.4 m)`);
  }
  if (!(island.fromY >= crossingY + 1.5)) post.push(`island fromY ${island.fromY} must clear the zebra at ${crossingY}`);
  if (!(island.toY > island.fromY && island.toY <= lengthM - 20)) post.push(`island toY ${island.toY} out of range`);
  const tramBodyEastEdge = southboundLaneCenterM + 1.15; // tram half-width 1.15
  if (!(island.westX > tramBodyEastEdge + 0.5)) {
    post.push(`island westX ${island.westX} must clear the tram body edge ${tramBodyEastEdge} by > 0.5 m`);
  }
  if (!(island.eastX < laneCenterM - 3)) {
    post.push(`island eastX ${island.eastX} must stay >= 3 m clear of the player lane center ${laneCenterM}`);
  }
  // Halted tram pose: fully north of the zebra (nose gap >= 2 m) and fully on
  // the street (14 m body inside [0, lengthM]).
  if (!(tramHoldY - 7 >= crossingY + 2)) post.push(`tram nose ${tramHoldY - 7} must stop >= 2 m north of the zebra ${crossingY}`);
  if (!(tramHoldY + 7 <= lengthM)) post.push(`tram tail ${tramHoldY + 7} past the street end ${lengthM}`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_tram_street self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (RAIL PACK actor slice — RX-04 host)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // RX-04 host: island stop at y ∈ [92, 106] alongside the halted tram
    // (body center y = 101 → nose at 94, 4 m north of the zebra at 90);
    // passengers cross the player's lane at rxt-x-1 to reach the island.
    districtId: "rx-tram-island-v1",
    label: "Учебна улица — трамвайна спирка с остров (сценарий RX-04)",
    approachM: 90,
    maxspeedKmh: 40,
    island: { fromY: 92, toY: 106, westX: -1.6, eastX: -0.4, heightM: 0.25 },
    tramHoldY: 101,
    noteBg:
      "Трамвайна спирка с остров на 90 м: пътници пресичат платното до острова — намали и при необходимост спри, за да преминат безопасно (чл. 66, ал. 2).",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildTramStopStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== tram-street build: ${params.districtId} ===`);
  line("approach / street length", `${params.approachM} m / ${district.roads.edges[0].length} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("island", `[${params.island.fromY}, ${params.island.toY}] x [${params.island.westX}, ${params.island.eastX}] h=${params.island.heightM}`);
  line("tram hold (body center)", `y = ${params.tramHoldY} @ lane x = ${district.meta.scenario.tramStop.tramLaneCenterM}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
