/**
 * gen_pk_double.mjs — pk-double-v1, the DOUBLE-PARKING map (doc 72 §11
 * archetype PK-06 „спиране в забранена зона"; ЗДвП чл. 98, ал. 1 — спирането и
 * паркирането са забранени до друго спряло/паркирано ППС от страната на
 * движението). The gen_ban_zones.mjs mold by way of gen_pk_busstop.mjs (same
 * `zones` layer, same self-validating shape, same clean room), with the one
 * difference that IS the template:
 *
 *   pk-ban-v1     (shipped) bans by a В27 PLATE    — the drill is "read the plate".
 *   pk-banx-v1    (shipped) bans by GEOMETRY       — the zebra and the corner ARE the ban.
 *   pk-busstop-v1 (shipped) bans by the ЗИГЗАГ     — the zone is bigger than the shelter.
 *   pk-ban2-v1    (shipped) bans by TWO PLATES     — the drill is "WHICH plate".
 *   pk-double-v1 bans by THE OTHER CARS. There is no plate, no paint and no
 *   geometry to read: the ban exists because the curb beside you is ALREADY
 *   full. Спреш ли до тях, ти си втората линия — и улицата свършва.
 *
 * WHY THE PARKED ROW IS DATA, NOT DECORATION. `meta.scenario.bays` is the
 * parking-lot generator's single geometric truth (contracts.ts scenarioBaysOf):
 * occupied bays become PRECISE hittable parked cars — ScenarioObstacles in the
 * scene, ObstacleRect2D in the headless recorder. So the row that CAUSES the
 * ban is the same row the hero can hit, from one authored array. Nothing here
 * is a prop.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength EQUALS district y along the street):
 *
 *     pkd-n-end (0, 360)
 *         │
 *         ▪  free curb bay (6.8, 290)   y = 290   (80 m past the ban — the goal)
 *         │
 *      ▪  ▓  ▪                          y = [70, 210]  z-second-line, чл. 98
 *      ▪  ▓  ▪   parked row BOTH curbs  y = [75, 205]  x = ∓6.8
 *      ▪  ▓  ▪   the live lane between  ← the ban covers THIS
 *         │
 *     pkd-spawn-start (4.06, 15)
 *         │
 *     pkd-n-start (0, 0)
 *
 * WHY THE SPAN IS EXACTLY THE ROW (± a 5 m margin). The чл. 98 second-line ban
 * is not a place, it is a RELATION: it exists wherever a vehicle already stands
 * at the curb beside you, and it stops existing the metre the row does. Authored
 * any wider, the map would ban stopping where nothing is parked (a fiction the
 * battery would have to swallow); authored any narrower, a rest beside the last
 * parked car would acquit. The generator asserts the coincidence both ways.
 *
 * WHY BOTH CURBS ARE PARKED. One row makes a double-parker an obstacle; two
 * rows make the street NARROW, which is the whole Sofia-classic: the through
 * passage is a single shared lane straddling the осева, so a car stopped in it
 * does not inconvenience the oncoming — it puts the oncoming into the stopper's
 * half, with the west row denying it anywhere else to be. The oncoming stream
 * that demonstrates that squeeze is LESSON data (StagedEventSpec on the
 * ScenarioSpec); this map only has to be narrow enough to earn it.
 *
 * WHY THERE IS NO JUNCTION, NO CROSSING AND NO SIGNAL ANYWHERE (the
 * gen_pk_busstop.mjs law, inherited verbatim): ILLEGAL_STOP_IN_BAN_ZONE is
 * structurally innocent wherever a rest is traffic-shaped — a queue lead within
 * banZoneStopQueueGapM, a stop line within banZoneStopLineClearM, any forbidding
 * signal, OR an armed crossing zone (`s.crossing === null` is a hard
 * precondition). This map carries ZERO intersections and ZERO crossings, so
 * buildStopLines emits nothing and CrossingZoneTracker never arms, and every
 * edge is `residential` (CLASS_RANK 2 < ARTERIAL_MIN_RANK 4) as a second belt.
 * A rest in the span here is the authored fault and nothing else.
 *
 * WHY THE PARKED ROW CANNOT ACQUIT THE REST IT CAUSES (the one new hazard this
 * map introduces vs its siblings). The detector's queue armor reads `leadGapM`,
 * which traffic/system.ts computes over the TRAFFIC vehicle list — ambient cars
 * and staged actors. Bays are neither: they reach the sim as collider rects, so
 * a hero resting beside fourteen parked cars still has `leadGapM === Infinity`
 * and convicts. The row is also held off the travel lane by
 * LANE_CLEAR_MIN_M below, so the cruising hero never touches it. Both are
 * asserted in world/__tests__/pk-double-districts.test.ts through the real
 * reducer — if either ever changes, that battery fails and names this map.
 *
 * KNOWN GAPS (honest — the gen_pk_busstop.mjs precedent; RENDER-only, and
 * grading reads the spans, never paint):
 *  - SIGN: builders/zoneSigns.ts posts a В27 face at the START of every
 *    `noStopping` span. чл. 98 second-line posts NO plate — the ban is the row.
 *    The one post this map places is wrong-but-harmless furniture. Pinned in
 *    the battery.
 *  - MARKING: builders/markings.ts does not read District.zones, so nothing is
 *    painted along the span. Correct here by accident: there is nothing to paint.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_double.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Parked-car footprint of one parallel bay, m (the lot-generator vocabulary:
 *  widthM across the bay axis, lengthM along it). */
const BAY_WIDTH_M = 2.7;
const BAY_LENGTH_M = 5;

/** Headless collider half-extents of a parked car (traces/scParkPerpRev.ts
 *  PARKED_CAR_HALF_WIDTH_M / _HALF_LENGTH_M — the same numbers the recorder
 *  arms; stated here so the clearance law below is checked against what the
 *  hero actually meets, not against the painted bay). */
const PARKED_HALF_W_M = 0.9;
const PARKED_HALF_L_M = 2.25;
/** Hero chassis half-width, m (vehicle/tuning CHASSIS_HALF_EXTENTS.x). */
const HERO_HALF_W_M = 0.85;
/** A cruising hero at lane center must clear the row by at least this, m. */
const LANE_CLEAR_MIN_M = 0.5;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** Inclusive arithmetic row of bay centers along y. */
function rowYs(fromY, toY, pitchM) {
  const out = [];
  for (let y = fromY; y <= toY + 1e-9; y += pitchM) out.push(r2(y));
  return out;
}

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn/bay id prefix
 *   rowFromM: number,       // first parked car of the row, district y
 *   rowToM: number,         // last parked car of the row, district y
 *   rowPitchM: number,      // spacing between parked cars along the curb, m
 *   rowOffsetX: number,     // |x| of the parked rows (both curbs, mirrored)
 *   westPhaseM: number,     // west row's y offset vs the east row (interleave)
 *   banFromM: number,       // чл. 98 second-line span start, district y
 *   banToM: number,         // чл. 98 second-line span end, district y
 *   legalBayY: number,      // the one free curb bay, district y
 *   lengthM: number,        // street length
 *   maxspeedKmh: number,    // legal limit
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildDoubleParkStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    rowFromM,
    rowToM,
    rowPitchM,
    rowOffsetX,
    westPhaseM,
    banFromM,
    banToM,
    legalBayY,
    lengthM,
    maxspeedKmh,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);

  // -- The map's own shape laws ---------------------------------------------
  /** The drill needs room to build speed and READ the row before the ban. */
  const APPROACH_MIN_M = 50;
  /** A row shorter than this is „a parked car", not „a parked street". */
  const ROW_MIN_M = 100;
  /** The ban must wrap the row, but only just — the ban IS the row (see header). */
  const BAN_MARGIN_MIN_M = 3;
  const BAN_MARGIN_MAX_M = 10;
  /** The backlog's contract: the free bay sits 80 m past the ban. */
  const BAY_CLEAR_M = 80;
  /** Run-out past the bay so the drill can drive on after resting. */
  const RUNOUT_MIN_M = 40;
  /** Parallel bays closer than their own length would overlap. */
  const PITCH_MIN_M = BAY_LENGTH_M + 1;

  if (!(banFromM >= APPROACH_MIN_M)) {
    errors.push(`banFromM needs >= ${APPROACH_MIN_M} m of approach, got ${banFromM}`);
  }
  if (!(rowToM - rowFromM >= ROW_MIN_M)) {
    errors.push(`the parked row needs >= ${ROW_MIN_M} m, got ${r2(rowToM - rowFromM)}`);
  }
  if (!(rowPitchM >= PITCH_MIN_M)) errors.push(`rowPitchM must be >= ${PITCH_MIN_M} m, got ${rowPitchM}`);
  const headMargin = rowFromM - banFromM;
  const tailMargin = banToM - rowToM;
  for (const [name, m] of [["head", headMargin], ["tail", tailMargin]]) {
    if (!(m >= BAN_MARGIN_MIN_M && m <= BAN_MARGIN_MAX_M)) {
      errors.push(`the ban's ${name} margin must be ${BAN_MARGIN_MIN_M}..${BAN_MARGIN_MAX_M} m, got ${r2(m)}`);
    }
  }
  if (r2(legalBayY - banToM) !== BAY_CLEAR_M) {
    errors.push(`the free bay must sit exactly ${BAY_CLEAR_M} m past the ban, got ${r2(legalBayY - banToM)}`);
  }
  if (!(lengthM - legalBayY >= RUNOUT_MIN_M)) {
    errors.push(`the bay needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - legalBayY)}`);
  }
  if (errors.length > 0) throw new Error(`gen_pk_double params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06 — the northbound lane center
  const laneOncomingM = r2(-laneRightM);
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
      class: "residential", // CLASS_RANK 2 — below ARTERIAL_MIN_RANK: no stop lines
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

  // The FP-armor precondition, as DATA (gen_pk_busstop.mjs): nothing here can
  // make a rest look traffic-shaped, because there is no traffic furniture.
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- The parked row: the ban's CAUSE and the hero's colliders, one array.
  // East curb (the driver's own side — the row he is tempted to double up on)
  // and west curb (the oncoming's side — what makes the street narrow).
  const BAYS = [];
  const eastYs = rowYs(rowFromM, rowToM, rowPitchM);
  const westYs = rowYs(rowFromM + westPhaseM, rowToM, rowPitchM);
  eastYs.forEach((y, i) => {
    BAYS.push({
      id: `${idPrefix}-bay-e${String(i + 1).padStart(2, "0")}`,
      x: r2(rowOffsetX),
      y,
      headingDeg: 0, // parallel to the street: lengthM runs along y
      widthM: BAY_WIDTH_M,
      lengthM: BAY_LENGTH_M,
      occupied: true,
    });
  });
  westYs.forEach((y, i) => {
    BAYS.push({
      id: `${idPrefix}-bay-w${String(i + 1).padStart(2, "0")}`,
      x: r2(-rowOffsetX),
      y,
      headingDeg: 0,
      widthM: BAY_WIDTH_M,
      lengthM: BAY_LENGTH_M,
      occupied: true,
    });
  });
  // The ONE free bay: past the ban, on the driver's own curb — the answer to
  // „ама къде да спра тогава".
  const FREE_BAY_ID = `${idPrefix}-bay-free`;
  BAYS.push({
    id: FREE_BAY_ID,
    x: r2(rowOffsetX),
    y: r2(legalBayY),
    headingDeg: 0,
    widthM: BAY_WIDTH_M,
    lengthM: BAY_LENGTH_M,
    occupied: false,
  });

  // -- The authored ban. The street is one edge on x = 0, so edge arclength
  // (the runtime Locator's sM) EQUALS district y.
  const ZONE_ID = `${idPrefix}-z-second-line`;
  const ZONES = [
    {
      id: ZONE_ID,
      kind: "noStopping",
      edgeId,
      fromM: r2(banFromM),
      toM: r2(banToM),
      // NOT a plate: чл. 98 bans stopping beside an already-parked vehicle, and
      // the row is the only thing that says so. (zoneSigns.ts posts a В27 face
      // here anyway — wrong-but-harmless furniture; pinned in the battery.)
      signRef: "ЗДвП-98-1 — до спряло ППС",
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
      id: `${idPrefix}-spawn-bay`,
      x: r2(rowOffsetX),
      y: r2(legalBayY),
      heading: 0,
      edgeId,
      name: "Свободно място до бордюра — след паркираната редица",
    },
  ];

  // -- Visual anchors. Blocks on both sides give the narrow street its walls
  // (and the row its reason to exist); all clear of the carriageway.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-approach`,
      height: 15,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 24), 20],
        [r2(-CLEAR), 20],
        [r2(-CLEAR), 60],
        [r2(-CLEAR - 24), 60],
      ],
    },
    {
      id: `${idPrefix}-b-row-west`,
      height: 18,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 26), r2(rowFromM)],
        [r2(-CLEAR), r2(rowFromM)],
        [r2(-CLEAR), r2(rowToM)],
        [r2(-CLEAR - 26), r2(rowToM)],
      ],
    },
    {
      id: `${idPrefix}-b-row-east`,
      height: 18,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(rowFromM)],
        [r2(CLEAR + 26), r2(rowFromM)],
        [r2(CLEAR + 26), r2(rowToM)],
        [r2(CLEAR), r2(rowToM)],
      ],
    },
    {
      id: `${idPrefix}-b-bay-block`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(legalBayY - 16)],
        [r2(CLEAR + 20), r2(legalBayY - 16)],
        [r2(CLEAR + 20), r2(legalBayY + 14)],
        [r2(CLEAR), r2(legalBayY + 14)],
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
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  bounds.minX = r2(Math.min(bounds.minX, -halfRoadM - 6));
  bounds.maxX = r2(Math.max(bounds.maxX, halfRoadM + 6));
  bounds.minY = r2(Math.min(bounds.minY, -6));
  bounds.maxY = r2(Math.max(bounds.maxY, lengthM + 6));

  const scenario = {
    archetype: "straight-street",
    params: {
      lengthM,
      maxspeedKmh,
      rowFromM,
      rowToM,
      banFromM,
      banToM,
      legalBayY,
      banKind: "noStopping",
      banBasis: "law", // чл. 98 — the parked row bans the lane beside it; no plate
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    laneCenterOncomingM: laneOncomingM,
    /** The row that CAUSES the ban — narrative anchor for the scenario copy. */
    parkedRowY: { fromY: r2(rowFromM), toY: r2(rowToM) },
    parkedRowX: { eastX: r2(rowOffsetX), westX: r2(-rowOffsetX) },
    /** The ONE free bay (also `${idPrefix}-bay-free` in bays[]). */
    legalBayY: r2(legalBayY),
    /** District-y (not edge-arclength) view of every ban — what the ScenarioSpec
     *  and the trace scripts are written against. Identical to the arclength
     *  here (one edge, x = 0), and stated anyway so the template never has to
     *  know that. */
    banZonesY: [{ id: ZONE_ID, lawRef: "ЗДвП чл. 98, ал. 1", fromY: r2(banFromM), toY: r2(banToM) }],
    /** S1 single geometric truth: occupied bays become precise hittable parked
     *  cars (ScenarioObstacles in the scene, ObstacleRect2D in the recorder). */
    bays: BAYS,
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_double.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с двустранно паркирана редица — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
        bays: BAYS.length,
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
  // Self-validation — the gen_pk_busstop invariants + this map's own laws.
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeById = new Map(EDGES.map((e) => [e.id, e]));
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way street with ${lanes} marked lanes expected`);
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The TOTAL-armor law (gen_pk_busstop.mjs): a crossing anywhere would arm
  // CrossingZoneTracker within ~35 m and acquit a rest as possibly-lawful; an
  // intersection would feed buildStopLines. This map is the archetype's clean room.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (stop-line armor)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (crossing-arm armor)");
  if (ROUNDABOUTS.length !== 0) post.push("no roundabout may exist");

  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    // В28 (noParking) deliberately does NOT convict in the reducer — престоят
    // под В28 е разрешен — so a noParking span here would grade nothing.
    if (z.kind !== "noStopping") post.push(`${z.id}: the чл. 98 second-line ban is a noStopping span`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  if (ZONES.length !== 1) post.push("exactly ONE span: the ban is the row, and there is one row");
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  // -- The map's thesis, as arithmetic: THE BAN IS THE ROW ------------------
  const occupied = BAYS.filter((b) => b.occupied);
  const free = BAYS.filter((b) => !b.occupied);
  if (occupied.length < 20) post.push(`a „fully lined" street wants both curbs parked, got ${occupied.length} cars`);
  if (free.length !== 1) post.push(`exactly ONE free bay (the drill's answer), got ${free.length}`);
  for (const b of occupied) {
    // Every parked car stands INSIDE the ban it causes…
    if (!(b.y >= banFromM && b.y <= banToM)) post.push(`${b.id} (y=${b.y}) parks outside the span it causes`);
    // …on a curb, never in the live lane the hero cruises…
    const innerEdge = Math.abs(b.x) - PARKED_HALF_W_M;
    const heroOuter = laneRightM + HERO_HALF_W_M;
    if (!(innerEdge - heroOuter >= LANE_CLEAR_MIN_M)) {
      post.push(`${b.id}: only ${r2(innerEdge - heroOuter)} m from a cruising hero (need ${LANE_CLEAR_MIN_M})`);
    }
    // …and inside the carriageway (a parked car on the pavement is a different drill).
    if (Math.abs(b.x) + PARKED_HALF_W_M > halfRoadM) post.push(`${b.id}: parked past the curb`);
  }
  // The ban has no metre the row does not: nothing is banned where nothing is parked.
  const rowSpanYs = occupied.map((b) => b.y);
  if (Math.min(...rowSpanYs) - banFromM > BAN_MARGIN_MAX_M) post.push("the span opens before the row does");
  if (banToM - Math.max(...rowSpanYs) > BAN_MARGIN_MAX_M) post.push("the span outlives the row");
  // Parallel bays on the same curb must not overlap.
  for (const side of [rowOffsetX, -rowOffsetX]) {
    const ys = BAYS.filter((b) => b.x === r2(side))
      .map((b) => b.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - ys[i - 1] < 2 * PARKED_HALF_L_M) post.push(`bays overlap on curb x=${side} at y=${ys[i]}`);
    }
  }
  // The free bay is the shadow's target: it must be OUTSIDE every ban…
  for (const z of ZONES) {
    if (free[0].y >= z.fromM && free[0].y <= z.toM) post.push(`the free bay (y=${free[0].y}) sits inside ${z.id}`);
    // …and so must the spawn (a drill that starts in a ban grades on frame 1).
    if (SPAWN_POINTS[0].y >= z.fromM && SPAWN_POINTS[0].y <= z.toM) post.push(`the start spawn sits inside ${z.id}`);
  }
  // …and it must be reachable: no parked car may stand where the hero parks.
  for (const b of occupied) {
    if (Math.abs(b.y - free[0].y) < 2 * PARKED_HALF_L_M && Math.sign(b.x) === Math.sign(free[0].x)) {
      post.push(`${b.id} blocks the free bay`);
    }
  }

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  // Buildings must not sit on the carriageway.
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the carriageway`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pk_double self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-double-v1",
    label: "Учебна улица — двойно паркиране до спряла кола (сценарий PK-06)",
    idPrefix: "pkd",
    rowFromM: 75,
    rowToM: 205,
    rowPitchM: 10,
    rowOffsetX: 6.8,
    westPhaseM: 5,
    banFromM: 70,
    banToM: 210,
    legalBayY: 290,
    lengthM: 360,
    maxspeedKmh: 50,
    noteBg:
      "От 70-ия до 210-ия метър и двата бордюра са заети: спреш ли тук, си на втора линия и улицата се затваря (чл. 98, ал. 1). Свободното място е на 290-ия метър — на 80 метра след редицата.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildDoubleParkStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const bays = district.meta.scenario.bays;
  console.log(`=== double-park build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("parked row", `y ∈ [${params.rowFromM}, ${params.rowToM}] on x = ∓${params.rowOffsetX}`);
  line("parked cars (E / W)", `${bays.filter((b) => b.occupied && b.x > 0).length} / ${bays.filter((b) => b.occupied && b.x < 0).length}`);
  line("free bay", `(${bays.find((b) => !b.occupied).x}, ${params.legalBayY}) — ${params.legalBayY - params.banToM} m past the ban`);
  line("intersections / crossings", `${district.intersections.length} / ${district.crossings.length} (total FP armor)`);
  for (const z of district.meta.scenario.banZonesY) {
    line(z.id, `y ∈ [${z.fromY}, ${z.toY}]  (${z.lawRef})`);
  }
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
