/**
 * gen_pe_crossings.mjs — the S3 PEDESTRIAN-family micro-maps (Scenario Studio,
 * doc 76 §3; doc 72 §6 archetypes PE-03 / PE-08 / PE-16). Same zebra-block
 * shape as gen_zebra_street.mjs (one straight two-lane street carrying a
 * MARKED, unsignalized crossing) — a purpose-built street per archetype so
 * each ScenarioSpec pins its own approach length, limit and crossing y.
 *
 * ⚠ DOC 86 D1 — WHY THIS FILE GREW A SECOND PARAMETER AXIS (read before adding
 * an eighth instance). The founder played catalog positions 22, 23, 25, 26, 27
 * and 28 back to back and wrote: „same map, same pedestrian behaviour, same
 * crossing, same interaction — only the character model changed. Changing the
 * character model alone does not create a new learning experience." He was
 * right about the map. The generator took exactly ONE meaningful parameter
 * (`approachM`) and emitted, seven times, the same two nodes, one edge, one
 * zebra, one 10 × 12 m corner shop and two spawns — so seven different lessons
 * were taught on one street with the pedestrian's pace as the only difference.
 *
 * Every instance now also names a STREETSCAPE: the frontage that explains why
 * THIS lesson happens on THIS street, and that occludes, frames and lights the
 * approach differently. It is real learning content, not decoration — a blind
 * corner pushed to the kerb line, an unlit warehouse canyon, a depot gate that
 * explains the stopped truck, a courtyard mouth children come out of. The
 * road, the crossing, the limit and the spawns are untouched, so every
 * committed trace, every pinned coordinate and the whole pe-districts contract
 * battery hold byte-for-byte; what changes is what the student SEES and what
 * hides the pedestrian from them.
 *
 * Pinned by platform/src/modules/sim/lessons/scenario/__tests__/
 * lane10-pe-vru-truth.test.ts (G7): every district must name a distinct
 * streetscape and no two may share a building layout.
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime — the CrossingZoneTracker derives its zone from crossings[]) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_zebra_street.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/pe-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pe-n-end (0, L)                  L = approachM + RUNOUT_M
 *         │
 *         ═  pe-x-1 (0, approachM)     marked zebra (kind "marked",
 *         │                            signalized false — CrossingZone
 *     pe-spawn-approach (4.06, 15)     radius ~35 m arms on the host edge)
 *         │
 *     pe-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions — the street teaches the crossing
 * approach, nothing else (doc 76 §3). The staged pedestrian is LESSON data
 * (StagedEventSpec pedestrianDartOut in the ScenarioSpec); the map only carries
 * the crossing geometry — single truth in meta.scenario.crossings.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pe_crossings.mjs
 *
 * ⚠ FOLLOW-UP PASS. `tools/maps/gen_streetwall.mjs` (doc 82 V7) appends `sw-`
 * prefixed procedural frontage to pe-dart-v1 and pe-child-v1 IN PLACE, so this
 * generator's output is not the final committed file for those two. Re-run the
 * street-wall pass after any run of this script, or those maps lose their
 * procedural fill (streetwall.test.ts's POPULATED table catches it).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** Street continues this far past the crossing (run-out + finish), m. */
const RUNOUT_M = 60;
/**
 * Nearest x a building volume may occupy: half-carriageway 8.125 + the kerb
 * skirt 0.35 + the 3.5 m sidewalk the builder draws + 0.5 m of stand-back.
 * Self-validated below — a frontage inside this eats the pavement the staged
 * pedestrians walk on.
 */
const FRONTAGE_CLEAR_X = 12.5;

const r2 = (v) => Math.round(v * 100) / 100;

/** Axis-aligned block, counter-clockwise, rounded — the footprint helper. */
function block(x0, x1, y0, y1, height) {
  return {
    height,
    heightSource: "default",
    footprint: [
      [r2(x0), r2(y0)],
      [r2(x1), r2(y0)],
      [r2(x1), r2(y1)],
      [r2(x0), r2(y1)],
    ],
  };
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// Streetscapes (doc 86 D1) — the per-archetype frontage recipes
// ---------------------------------------------------------------------------

/**
 * Each recipe answers one question: WHY does this lesson happen on this street,
 * and what hides the pedestrian here? The recipes are pure functions of the
 * crossing's y so the same geometry rides any approach length, and every volume
 * stands clear of FRONTAGE_CLEAR_X (self-validated below).
 *
 * `note` is the one-line design intent; it ships in meta.scenario so a reviewer
 * reading the district JSON alone can see what the map is for.
 */
const STREETSCAPES = {
  /** PE-03 „Изчакай пътеката" — a shopping block: people on the zebra is normal. */
  "corner-shop-terrace": {
    noteBg:
      "Търговска отсечка: магазини от двете страни, затова на пътеката ПОСТОЯННО има хора — изчакването е нормата, не изключението.",
    build: (cY) => [
      { id: "pe-b-shop", ...block(-26, -16, cY - 34, cY - 22, 4.5) },
      { id: "pe-b-terrace-w", ...block(-30, -13, cY - 18, cY + 16, 11) },
      { id: "pe-b-kiosk-e", ...block(13, 17.5, cY - 14, cY - 8, 3) },
      { id: "pe-b-arcade-e", ...block(13, 24, cY + 6, cY + 34, 8) },
    ],
  },
  /** PE-08 „Бавен пешеходец" — a health centre: this is WHERE slow people cross. */
  "clinic-and-park": {
    noteBg:
      "Поликлиника точно срещу пътеката и парк отсреща: тук пресичат възрастни хора и хора с намалена подвижност — бавно и по всяко време.",
    build: (cY) => [
      { id: "pe-b-clinic", ...block(12.8, 30, cY + 2, cY + 26, 5.5) },
      { id: "pe-b-clinic-annex", ...block(12.8, 21, cY - 20, cY - 4, 4) },
      { id: "pe-b-park-wall", ...block(-15.5, -12.8, cY - 46, cY + 30, 1.8) },
      { id: "pe-b-pavilion", ...block(-34, -22, cY - 8, cY + 8, 4.2) },
    ],
  },
  /** PE-16 „Пътека в дъжд през нощта" — the UNLIT block: a warehouse canyon. */
  "unlit-warehouse-canyon": {
    noteBg:
      "Неосветен складов участък: две глухи стени образуват тъмен коридор и единственият процеп в него е точно на пътеката — нощем фаровете са цялата видимост.",
    build: (cY) => [
      { id: "pe-b-wh-w1", ...block(-40, -12.6, cY - 70, cY - 6, 12) },
      { id: "pe-b-wh-w2", ...block(-40, -12.6, cY + 6, cY + 48, 12) },
      { id: "pe-b-wh-e1", ...block(12.6, 42, cY - 62, cY - 4, 12) },
      { id: "pe-b-wh-e2", ...block(12.6, 42, cY + 8, cY + 44, 12) },
    ],
  },
  /** PE-02 „Внезапен пешеходец" — the blind corner, pushed onto the kerb line. */
  "blind-corner-kiosk": {
    noteBg:
      "Ъглова сграда, изнесена до самия бордюр 1,5 м преди зебрата: западният тротоар е невидим до последния метър — оттам излиза пешеходецът.",
    build: (cY) => [
      { id: "pe-b-corner", ...block(-28, -12.6, cY - 30, cY - 1.5, 9) },
      { id: "pe-b-kiosk", ...block(-16.5, -12.6, cY - 40, cY - 33, 3) },
      { id: "pe-b-east-row", ...block(12.6, 26, cY - 46, cY - 10, 7) },
      { id: "pe-b-east-row2", ...block(12.6, 26, cY + 4, cY + 30, 7) },
    ],
  },
  /** PE-10 „Пешеходци иззад спрял камион" — the depot gate that explains it. */
  "depot-gate": {
    noteBg:
      "Складова база с товарен вход точно преди пътеката: затова тук ВИНАГИ стои спряло голямо превозно средство, а хората излизат иззад него.",
    build: (cY) => [
      { id: "pe-b-depot-s", ...block(12.6, 46, cY - 58, cY - 20, 8) },
      { id: "pe-b-gatehouse", ...block(12.6, 17, cY - 19.5, cY - 15, 3.2) },
      { id: "pe-b-depot-n", ...block(12.6, 46, cY - 6, cY + 34, 8) },
      { id: "pe-b-flats-w", ...block(-32, -13, cY - 36, cY + 12, 14) },
    ],
  },
  /** PE-04 „Дете след топка" / „покрай редицата" — the courtyard mouth. */
  "courtyard-blocks": {
    noteBg:
      "Два панелни блока с междублоково пространство, чието устие гледа право към пътеката: децата излизат от двора, а редицата гаражи отдясно крие погледа.",
    build: (cY) => [
      { id: "pe-b-slab-s", ...block(-44, -13.2, cY - 60, cY - 13, 17) },
      { id: "pe-b-slab-n", ...block(-44, -13.2, cY + 7, cY + 46, 17) },
      { id: "pe-b-playhouse", ...block(-26, -17, cY - 8, cY + 2, 3) },
      { id: "pe-b-garages", ...block(12.7, 19, cY - 52, cY - 12, 2.8) },
      { id: "pe-b-garages-n", ...block(12.7, 19, cY + 6, cY + 30, 2.8) },
    ],
  },
  /** PE-14 „Бял бастун" — the institute whose door points at the zebra. */
  "institute-and-transit": {
    noteBg:
      "Обществена сграда за хора с увредено зрение, чийто вход е насочен към пътеката, и спирка отсреща: белият бастун тук е ежедневие, а не изключение.",
    build: (cY) => [
      { id: "pe-b-institute", ...block(-38, -12.9, cY - 26, cY + 18, 10) },
      { id: "pe-b-institute-wing", ...block(-38, -25, cY + 18, cY + 40, 10) },
      { id: "pe-b-shelter", ...block(12.9, 16.4, cY - 9, cY - 3, 2.8) },
      { id: "pe-b-offices-e", ...block(12.9, 30, cY + 8, cY + 40, 12) },
    ],
  },
};

// ---------------------------------------------------------------------------
// The generator (single crossing — the S3 PE micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,      // output file name + LessonSpec.world.districtId
 *   label: string,           // human label (meta)
 *   approachM: number,       // street-start → crossing distance (>= 60)
 *   maxspeedKmh: number,     // legal limit on the street (30..50)
 *   streetscape: string,     // doc 86 D1 — the frontage recipe (STREETSCAPES)
 * }} params
 */
export function buildPeCrossingStreet(params) {
  const errors = [];
  const { districtId, label, approachM, maxspeedKmh, streetscape } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (!STREETSCAPES[streetscape]) {
    errors.push(
      `streetscape "${streetscape}" unknown — pick one of ${Object.keys(STREETSCAPES).join(", ")} ` +
        `(doc 86 D1: an instance without its own frontage is another copy of the same street)`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_pe_crossings params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; a zebra needs no junctions).
  const NODES = {
    "pe-n-start": [0, 0],
    "pe-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "pe-e-street",
      from: "pe-n-start",
      to: "pe-n-end",
      class: "residential",
      name: "Улица с пешеходна пътека",
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

  // -- Crossing: the single geometric truth (CrossingZoneTracker + the
  // markings builder + the ScenarioSpec all read exactly this).
  const CROSSINGS = [
    {
      id: "pe-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "pe-e-street",
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "pe-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pe-e-street",
      name: "Подход към пешеходната пътека",
    },
    {
      id: "pe-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "pe-e-street",
      name: "Контролна точка — след пътеката",
    },
  ];

  // -- The STREETSCAPE (doc 86 D1): the frontage that explains why this lesson
  // happens here and that occludes the approach. Every volume stands clear of
  // the carriageway + kerb + sidewalk (post-validated below).
  const recipe = STREETSCAPES[streetscape];
  const BUILDINGS = recipe.build(crossingY);

  // -- Bounds + stats.
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  // Road body + buildings can outgrow the centerline bounds — cover them.
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
      generator: "tools/maps/gen_pe_crossings.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица с пешеходна пътека — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: ограничението важи по цялата дължина; пред пътеката се кара с готовност за спиране.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the crossing
       * truth. ScenarioSpecs pin the crossing by value and the contract battery
       * asserts the copy matches this file.
       */
      scenario: {
        archetype: "zebra-block",
        // Unchanged by doc 86 D1 on purpose: the ScenarioSpecs mirror exactly
        // this object, so the streetscape rides beside it, never inside it.
        params: { crossings: 1, signalized: "no", approachM },
        /** doc 86 D1 — WHICH street this is, not just how long the approach is. */
        streetscape,
        streetscapeNoteBg: recipe.noteBg,
        primaryCrossingId: "pe-x-1",
        laneCenterRightM: laneCenterM,
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
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
  // Self-validation (the invariants tools/osm/build.mjs + gen_poligon enforce)
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
    if (e.length <= 0) post.push(`${e.id}: zero length`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "pe-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // The crossing must sit ON the street centerline with real approach room
  // before it (the ~35 m zone must arm on the road, not at spawn).
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "pe-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  // The streetscape may never eat the carriageway, the kerb or the sidewalk the
  // staged pedestrians walk on (doc 86 D1 — a frontage that occludes must still
  // leave the pavement).
  const seenBuildingIds = new Set();
  for (const bl of BUILDINGS) {
    if (!/^pe-b-[a-z0-9-]+$/.test(bl.id ?? "")) post.push(`building id "${bl.id}" must be pe-b-kebab-case`);
    if (seenBuildingIds.has(bl.id)) post.push(`duplicate building id ${bl.id}`);
    seenBuildingIds.add(bl.id);
    if (!(bl.height > 0)) post.push(`${bl.id}: non-positive height`);
    for (const [x] of bl.footprint) {
      if (Math.abs(x) < FRONTAGE_CLEAR_X) {
        post.push(`${bl.id}: footprint x=${x} is inside the ${FRONTAGE_CLEAR_X} m kerb+sidewalk clearance`);
      }
    }
  }
  if (BUILDINGS.length < 3) post.push(`streetscape ${streetscape}: needs >= 3 volumes to read as a street`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pe_crossings self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The three committed instances (S3 PE batch 1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pe-clear-v1",
    label: "Търговска отсечка с пешеходна пътека (сценарий PE-03)",
    approachM: 90,
    maxspeedKmh: 50,
    streetscape: "corner-shop-terrace",
  },
  {
    districtId: "pe-slow-v1",
    label: "Улица пред поликлиника (сценарий PE-08)",
    approachM: 85,
    maxspeedKmh: 40,
    streetscape: "clinic-and-park",
  },
  {
    districtId: "pe-rain-v1",
    label: "Неосветен складов участък — пътека в дъжд през нощта (сценарий PE-16)",
    approachM: 95,
    maxspeedKmh: 50,
    streetscape: "unlit-warehouse-canyon",
  },
  {
    districtId: "pe-dart-v1",
    label: "Улица със закрит ъгъл преди пътеката (сценарий PE-02/PE-09)",
    approachM: 80,
    maxspeedKmh: 50,
    streetscape: "blind-corner-kiosk",
  },
  {
    districtId: "pe-bus-v1",
    label: "Улица с товарен вход на складова база (сценарий PE-10)",
    approachM: 88,
    maxspeedKmh: 50,
    streetscape: "depot-gate",
  },
  {
    districtId: "pe-child-v1",
    label: "Междублоково пространство с редица гаражи (сценарий PE-04)",
    approachM: 78,
    maxspeedKmh: 40,
    streetscape: "courtyard-blocks",
  },
  {
    districtId: "pe-cane-v1",
    label: "Улица пред институт за незрящи (сценарий PE-14)",
    approachM: 92,
    maxspeedKmh: 50,
    streetscape: "institute-and-transit",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPeCrossingStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== pe-crossings build: ${params.districtId} ===`);
  line("approach / street length", `${params.approachM} m / ${district.roads.edges[0].length} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line("streetscape", `${params.streetscape} (${district.buildings.length} volumes)`);
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
