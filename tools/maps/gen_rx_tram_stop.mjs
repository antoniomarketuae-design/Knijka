/**
 * gen_rx_tram_stop.mjs — the NO-ISLAND TRAM-STOP micro-map (ADR-006 stage 3b;
 * doc 72 §12 „Family RX", the RX-04 INVERSE). Where gen_tram_street.mjs builds
 * the island stop (чл. 66, ал. 2 — slow, stop IF NEEDED, the refuge protects
 * the passenger), THIS builds the stop WITHOUT a refuge island: passengers
 * alight straight onto the carriageway, so чл. 66, ал. 1 turns a courtesy into
 * a DUTY — the driver behind the open doors MUST stop until the lane is clear.
 * The pair is the exam's favourite contrast (island = pass with care; no island
 * = mandatory stop). Same bones as the island street, one deliberate deletion
 * (the platform block) and one addition (a kerb-side shelter marking the stop):
 *
 *   - ONE marked, unsignalized crossing (rts-x-1) at the tram's front door,
 *     where alighting passengers cross the player's lane to the kerb — the
 *     existing CrossingZone / PEDESTRIAN_* chain adjudicates the whole drill;
 *   - NO island: the door-side spill area IS the player's own lane (there is no
 *     protected middle), which is exactly why the stop is mandatory;
 *   - a low SHELTER block (rts-b-shelter) on the EAST kerb — the stop furniture
 *     (a shelter, not a wall); buildings are a shipped channel, no new contract;
 *   - meta.scenario.tramStop — the single pinned truth (no-island flag, shelter
 *     span, tram hold pose, lane centers) the templates + trace batteries copy
 *     by value; the district battery asserts the copies match this file.
 *
 * KNOWN VISUAL GAP (honest, inherited from gen_tram_street.mjs): the markings
 * builder paints only white quads — no dark rail-pair strip, so the tram TRACK
 * renders as ordinary asphalt; the halted tram rig, the shelter block and the
 * scenario copy carry the visual story until a markings dark-strip channel.
 * Grading never reads paint.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_rx_tram_stop.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** Street continues this far past the crossing (run-out + finish), m. */
const RUNOUT_M = 60;
/** Tram half-length used in the pose checks (the articulated rig ≈ 14 m). */
const TRAM_HALF_LEN_M = 7;
/** Tram half-width used in the door-clearance check, m. */
const TRAM_HALF_W_M = 1.15;

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
 *   tramHoldY: number,    // halted tram BODY CENTER y on the southbound lane
 *                         // (its front door faces the crossing — nose ~= zebra)
 *   shelter: {
 *     fromY: number,      // shelter south edge
 *     toY: number,        // shelter north edge
 *     westX: number,      // shelter west edge (clear of the player lane)
 *     eastX: number,      // shelter east edge (on the kerb)
 *     heightM: number,    // shelter height (furniture, not a tower)
 *   },
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildTramStopNoIsland(params) {
  const errors = [];
  const { districtId, label, approachM, maxspeedKmh, tramHoldY, shelter, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (!shelter) errors.push("shelter block spec is required (the stop furniture)");
  if (errors.length > 0) throw new Error(`gen_rx_tram_stop params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right (northbound) lane center
  const southboundLaneCenterM = r2(-SCALED_LANE_W / 2);

  const NODES = {
    "rts-n-start": [0, 0],
    "rts-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "rts-e-street",
      from: "rts-n-start",
      to: "rts-n-end",
      class: "residential",
      name: "Улица с трамвайна спирка без остров",
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

  // The passenger crossing at the tram's front door: the single geometric
  // truth (CrossingZoneTracker + markings + the ScenarioSpec all read this).
  const CROSSINGS = [
    {
      id: "rts-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "rts-e-street",
    },
  ];

  const INTERSECTIONS = [];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "rts-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "rts-e-street",
      name: "Подход към трамвайната спирка без остров",
    },
    {
      id: "rts-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "rts-e-street",
      name: "Контролна точка — след спирката",
    },
  ];

  // The kerb-side SHELTER on the EAST (player-side) pavement — the stop
  // furniture (buildings are a shipped channel; no new contract), plus one
  // corner-shop visual anchor west of the street (the pe mold).
  const BUILDINGS = [
    {
      id: "rts-b-shelter",
      height: shelter.heightM,
      heightSource: "default",
      footprint: [
        [r2(shelter.westX), r2(shelter.fromY)],
        [r2(shelter.eastX), r2(shelter.fromY)],
        [r2(shelter.eastX), r2(shelter.toY)],
        [r2(shelter.westX), r2(shelter.toY)],
      ],
    },
    {
      id: "rts-b-shop",
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

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_rx_tram_stop.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с трамвайна спирка без остров — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
       * no-island tram-stop truth. ScenarioSpecs copy these by value; the
       * district battery asserts the copies match this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings: 1, signalized: "no", approachM, tramStop: "none" },
        primaryCrossingId: "rts-x-1",
        laneCenterRightM: laneCenterM,
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
        tramStop: {
          /** No refuge island — the whole lane is the spill area (чл. 66, ал. 1). */
          hasIsland: false,
          shelterId: "rts-b-shelter",
          shelterFromY: r2(shelter.fromY),
          shelterToY: r2(shelter.toY),
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
  // Self-validation (the gen_pe_crossings invariants + the no-island laws)
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
    if (s.edgeId !== "rts-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "rts-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  // Shelter laws: a piece of furniture, not a wall; on the EAST kerb (strictly
  // beyond the player lane's outer edge) so it never fouls the carriageway.
  if (!(shelter.heightM > 0 && shelter.heightM <= 3.5)) {
    post.push(`shelter height ${shelter.heightM} must be furniture (0 < h <= 3.5 m)`);
  }
  if (!(shelter.westX >= laneCenterM + 3)) {
    post.push(`shelter westX ${shelter.westX} must stay >= 3 m clear of the player lane center ${laneCenterM}`);
  }
  if (!(shelter.eastX > shelter.westX)) post.push(`shelter eastX ${shelter.eastX} must exceed westX ${shelter.westX}`);
  if (!(shelter.toY > shelter.fromY)) post.push(`shelter toY ${shelter.toY} must exceed fromY ${shelter.fromY}`);
  if (!(shelter.fromY >= 0 && shelter.toY <= lengthM)) post.push(`shelter span [${shelter.fromY}, ${shelter.toY}] off the street`);
  // Halted tram pose: its FRONT door faces the crossing (nose within a couple
  // of metres of the zebra), and the whole 14 m body stays on the street.
  const tramNoseY = tramHoldY - TRAM_HALF_LEN_M;
  const tramTailY = tramHoldY + TRAM_HALF_LEN_M;
  if (!(Math.abs(tramNoseY - crossingY) <= 4)) {
    post.push(`tram nose ${tramNoseY} must sit within 4 m of the door crossing ${crossingY}`);
  }
  if (!(tramNoseY >= 0 && tramTailY <= lengthM)) post.push(`tram body [${tramNoseY}, ${tramTailY}] off the street`);
  // The tram body must clear the player lane (it holds in the OPPOSITE lane).
  if (!(southboundLaneCenterM + TRAM_HALF_W_M < 0)) post.push(`tram body crosses the centerline`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rx_tram_stop self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (RAIL PACK — RX-04 inverse host, no island)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // RX-04 inverse host: crossing at the tram's front door (y = 90); the
    // halted tram body center y = 97 → nose at 90 (at the zebra), tail at 104;
    // alighting passengers cross the player's lane at rts-x-1 to the east kerb,
    // where the shelter marks the stop. No island — the lane IS the spill area.
    districtId: "rx-tram-stop-v1",
    label: "Учебна улица — трамвайна спирка без остров (сценарий RX-04 обратен)",
    approachM: 90,
    maxspeedKmh: 40,
    tramHoldY: 97,
    shelter: { fromY: 84, toY: 96, westX: 9, eastX: 13, heightM: 2.6 },
    noteBg:
      "Трамвайна спирка без остров на 90 м: спрелият трамвай изсипва пътници направо на платното — спираш зад отворените врати и ги изчакваш да се приберат (чл. 66, ал. 1).",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildTramStopNoIsland(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== rx-tram-stop build: ${params.districtId} ===`);
  line("approach / street length", `${params.approachM} m / ${district.roads.edges[0].length} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("shelter", `[${params.shelter.fromY}, ${params.shelter.toY}] x [${params.shelter.westX}, ${params.shelter.eastX}] h=${params.shelter.heightM}`);
  line("tram hold (body center)", `y = ${params.tramHoldY} @ lane x = ${district.meta.scenario.tramStop.tramLaneCenterM}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
