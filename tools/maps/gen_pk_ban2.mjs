/**
 * gen_pk_ban2.mjs — pk-ban2-v1, the В27-vs-В28 READING map (doc 72 §11
 * archetype PK-06 „спиране в забранена зона"; ЗДвП чл. 93 + чл. 98, Наредба
 * № РД-02-21-1/2023 знаци В27/В28). The gen_ban_zones.mjs mold by way of
 * gen_pk_busstop.mjs (same `zones` layer, same self-validating shape), with the
 * one difference that IS the template:
 *
 *   pk-ban-v1     (shipped) posts ONE В27 span — the drill is "read the plate".
 *   pk-banx-v1    (shipped) posts NOTHING      — the zebra and the corner ARE the ban.
 *   pk-busstop-v1 (shipped) posts the зигзаг   — the zone is bigger than the shelter.
 *   pk-ban2-v1 posts TWO ADJACENT SPANS OF DIFFERENT KIND — В28 (престоят е
 *   разрешен, паркирането не е) handing straight over to В27 (нищо не е
 *   разрешено). The drill is not "is there a plate" but "WHICH plate": the
 *   whole street is signed, and only one half of it will take your passenger.
 *
 * WHY NO EXISTING MAP COULD HOST IT (the backlog's own feasibility check):
 * gen_ban_zones.mjs emits exactly ONE zone per district and every shipped ban
 * file (pk-ban, pk-banx, pk-busstop, ov-ban) authors `noStopping` only — there
 * is no В28 span anywhere in content/world. pk-ban-v1 could not be edited into
 * one either: it is a
 * regenerated instance of a shared generator (four districts ride it), so this
 * map is its own file, as the backlog's fallback directs.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength EQUALS district y along the street):
 *
 *     pkb2-n-end (0, 380)
 *         │
 *         ·  legal curb bay              y = 330   (40 m past both bans — the goal)
 *         │
 *         ▓  z-nostopping   В27          y = [170, 290]   нищо не е разрешено
 *         ▒  z-noparking    В28          y = [70, 170]    престоят Е разрешен
 *         │
 *     pkb2-spawn-start (4.06, 15)
 *         │
 *     pkb2-n-start (0, 0)
 *
 * WHY THE SPANS ABUT WITH NO LEGAL ROAD BETWEEN THEM: the seam IS the lesson.
 * Наредба № РД-02-21-1/2023 runs a prohibition from its plate to the next
 * junction or to a revoking plate — so a driver who saw В28, learned „престоят
 * тук е позволен" and kept that permission across y = 170 is not being tricked,
 * he is failing to re-read. A legal gap between the spans would let a sloppy
 * rest land on innocent road and grade nothing; abutting them makes the seam
 * sharp: y = 165 is lawful престой, y = 175 is основна грешка, and the only
 * thing that changed is the plate.
 *
 * WHY THERE IS NO JUNCTION, NO CROSSING AND NO SIGNAL ANYWHERE (the
 * gen_pk_busstop.mjs clean-room precedent): the ILLEGAL_STOP_IN_BAN_ZONE
 * detector is structurally innocent wherever a rest is traffic-shaped — a queue
 * lead within 8 m, a stop line within 25 m, any forbidding signal, OR an armed
 * crossing zone (`s.crossing === null` is a hard precondition). This map carries
 * ZERO intersections and ZERO crossings, so buildStopLines emits nothing and
 * CrossingZoneTracker never arms; every edge is `residential` (CLASS_RANK 2 <
 * ARTERIAL_MIN_RANK 4) as a second belt. A rest in the В27 span is the authored
 * fault and nothing else — and, just as load-bearing here, a rest in the В28
 * span is provably innocent for the RIGHT reason (the law), not because some
 * armor happened to acquit it.
 *
 * KNOWN GAPS (honest — the gen_ban_zones.mjs / gen_pk_busstop.mjs header
 * precedent; both are RENDER-only, and grading reads the spans, never paint):
 *  - SIGN: builders/zoneSigns.ts maps `noStopping` → the В27 face and places
 *    NOTHING for `noParking` (marking-only kinds place no post). So the В27 half
 *    of this street posts its plate and the В28 half renders bare — exactly
 *    backwards from what the drill wants a learner to SEE. The scenario copy and
 *    the instructions carry the В28 teaching; the grading is exact regardless.
 *    FIX: a `noParking: "noParking"` entry in ZONE_SIGN_KIND plus a В28 SignKind
 *    asset — shared files, not taken here. Pinned in the battery.
 *  - GRADING: the reducer reads `tick.noStopZone` only; `tick.noParkZone`
 *    surfaces on the tick and grades nothing (engine.ts says so out loud —
 *    „престоят под В28 е разрешен, and parking vs престой is indistinguishable
 *    with current telemetry"). That is CORRECT for the shadow's passenger stop
 *    and WRONG for a long stay, which is a real чл. 93 паркиране the drill
 *    cannot bill. The battery pins both halves of that truth so the day the
 *    rest-duration threshold lands, the gap fails loudly instead of silently.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_ban2.mjs
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

/** signRef ↔ kind pairing law, inherited from gen_ban_zones.mjs. */
const KIND_TO_SIGN = {
  noStopping: "В27",
  noParking: "В28",
};

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn id prefix
 *   parkFromM: number,      // where В28 (and the signed street) starts, district y
 *   parkToM: number,        // where В28 ends AND В27 starts — the seam, district y
 *   stopToM: number,        // where В27 (and the signed street) ends, district y
 *   legalBayY: number,      // the one place a car may be LEFT, district y
 *   lengthM: number,        // street length
 *   maxspeedKmh: number,    // legal limit
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildStopVsParkStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    parkFromM,
    parkToM,
    stopToM,
    legalBayY,
    lengthM,
    maxspeedKmh,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);

  // -- This map's own shape laws --------------------------------------------
  /** Room to build speed and READ the first plate before its span starts. */
  const APPROACH_MIN_M = 60;
  /** The В28 span must hold a full passenger stop — pull in, rest past the 4 s
   *  sustain the В27 detector uses, pull out — with margin either side. */
  const PARK_SPAN_MIN_M = 80;
  /** The В27 span must be long enough to rest inside it, twice, at different
   *  marks that mean different things (the two mistake demos). */
  const STOP_SPAN_MIN_M = 80;
  /** The legal bay sits clear of BOTH bans by this much (the pk-busstop contract). */
  const BAY_CLEAR_MIN_M = 40;
  /** Run-out past the bay so the drill can drive on after resting. */
  const RUNOUT_MIN_M = 40;

  if (!(parkFromM >= APPROACH_MIN_M)) {
    errors.push(`parkFromM needs >= ${APPROACH_MIN_M} m of approach, got ${parkFromM}`);
  }
  if (!(parkToM - parkFromM >= PARK_SPAN_MIN_M)) {
    errors.push(`the В28 span needs >= ${PARK_SPAN_MIN_M} m, got ${r2(parkToM - parkFromM)}`);
  }
  if (!(stopToM - parkToM >= STOP_SPAN_MIN_M)) {
    errors.push(`the В27 span needs >= ${STOP_SPAN_MIN_M} m, got ${r2(stopToM - parkToM)}`);
  }
  if (!(legalBayY - stopToM >= BAY_CLEAR_MIN_M)) {
    errors.push(`the legal bay must sit >= ${BAY_CLEAR_MIN_M} m past the В27 span, got ${r2(legalBayY - stopToM)}`);
  }
  if (!(lengthM - legalBayY >= RUNOUT_MIN_M)) {
    errors.push(`the bay needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - legalBayY)}`);
  }
  if (errors.length > 0) throw new Error(`gen_pk_ban2 params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06 — the single northbound lane center
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

  // The FP-armor precondition, as DATA: nothing here can make a rest look
  // traffic-shaped, because there is no traffic furniture at all.
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- The two authored spans. The street is one edge on x = 0, so edge
  // arclength (the runtime Locator's sM) EQUALS district y.
  const ZONES = [
    {
      // В28 — паркирането е забранено, престоят НЕ Е. The only span in
      // content/world that authors this kind; the shadow rests HERE, lawfully.
      id: `${idPrefix}-z-noparking`,
      kind: "noParking",
      edgeId,
      fromM: r2(parkFromM),
      toM: r2(parkToM),
      signRef: KIND_TO_SIGN.noParking,
    },
    {
      // В27 — нито престой, нито паркиране. Starts exactly where В28 ends.
      id: `${idPrefix}-z-nostopping`,
      kind: "noStopping",
      edgeId,
      fromM: r2(parkToM),
      toM: r2(stopToM),
      signRef: KIND_TO_SIGN.noStopping,
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
      id: `${idPrefix}-spawn-dropoff`,
      x: laneRightM,
      y: r2((parkFromM + parkToM) / 2),
      heading: 0,
      edgeId,
      name: "Място за престой — под В28 (слизане на пътник)",
    },
    {
      id: `${idPrefix}-spawn-bay`,
      x: laneRightM,
      y: r2(legalBayY),
      heading: 0,
      edgeId,
      name: "Място за паркиране — след двата знака",
    },
  ];

  // -- Visual anchors. Blocks flank the two signed halves so the seam has a
  // read against the world, plus one at the bay. All clear of the carriageway
  // + sidewalk.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-approach`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), r2(parkFromM - 40)],
        [r2(-CLEAR), r2(parkFromM - 40)],
        [r2(-CLEAR), r2(parkFromM - 10)],
        [r2(-CLEAR - 22), r2(parkFromM - 10)],
      ],
    },
    {
      id: `${idPrefix}-b-park-block`,
      height: 15,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(parkFromM + 6)],
        [r2(CLEAR + 24), r2(parkFromM + 6)],
        [r2(CLEAR + 24), r2(parkToM - 6)],
        [r2(CLEAR), r2(parkToM - 6)],
      ],
    },
    {
      id: `${idPrefix}-b-stop-block`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(parkToM + 6)],
        [r2(CLEAR + 20), r2(parkToM + 6)],
        [r2(CLEAR + 20), r2(stopToM - 6)],
        [r2(CLEAR), r2(stopToM - 6)],
      ],
    },
    {
      id: `${idPrefix}-b-bay-block`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(legalBayY - 14)],
        [r2(CLEAR + 20), r2(legalBayY - 14)],
        [r2(CLEAR + 20), r2(legalBayY + 12)],
        [r2(CLEAR), r2(legalBayY + 12)],
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
      parkFromM,
      parkToM,
      stopToM,
      legalBayY,
      banKind: "noParking+noStopping", // the ONLY mixed-kind map in content/world
      banBasis: "sign", // В28/В27 plates — Наредба № РД-02-21-1/2023
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    /** The В28 half: престоят Е разрешен here — the shadow's drop-off. */
    dropoffSpanY: { fromY: r2(parkFromM), toY: r2(parkToM) },
    legalBayY: r2(legalBayY),
    /** The seam the whole template turns on: В28 ends and В27 begins on the
     *  same meter, with no legal road between them. */
    signSeamY: r2(parkToM),
    /** District-y (not edge-arclength) view of every span — what the
     *  ScenarioSpec and the trace scripts are written against. Identical to the
     *  arclength here (one edge, x = 0), and stated anyway so the template never
     *  has to know that. */
    banZonesY: [
      {
        id: ZONES[0].id,
        signRef: KIND_TO_SIGN.noParking,
        lawRef: "ЗДвП чл. 93; Наредба № РД-02-21-1/2023 — В28",
        fromY: r2(parkFromM),
        toY: r2(parkToM),
        /** The engine's own words: no detector reads noParkZone. */
        graded: false,
      },
      {
        id: ZONES[1].id,
        signRef: KIND_TO_SIGN.noStopping,
        lawRef: "ЗДвП чл. 98; Наредба № РД-02-21-1/2023 — В27",
        fromY: r2(parkToM),
        toY: r2(stopToM),
        graded: true,
      },
    ],
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_ban2.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица със знаци В27 и В28 — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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

  // -------------------------------------------------------------------------
  // Self-validation — the gen_ban_zones invariants + this map's own laws.
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
    // The no-stop-line law: an arterial rank here would post a stop line and
    // silently acquit every graded rest (buildStopLines).
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The TOTAL-armor law (gen_pk_busstop.mjs precedent): no junction, no
  // crossing, no signal may exist here — each would acquit the В27 rest this
  // map exists to convict, AND would muddy the В28 acquittal the shadow needs
  // to earn from the LAW rather than from armor.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (stop-line armor)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (crossing-arm armor)");
  if (ROUNDABOUTS.length !== 0) post.push("no roundabout may exist");

  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  if (new Set(ZONES.map((z) => z.id)).size !== ZONES.length) post.push("zone ids must be unique");
  // THE map's reason to exist: one В28 span and one В27 span, of DIFFERENT
  // kind, abutting on the seam. Any of these three failing turns the district
  // back into a plain pk-ban-v1 clone that teaches nothing new.
  const kinds = ZONES.map((z) => z.kind);
  if (!(kinds.includes("noParking") && kinds.includes("noStopping"))) {
    post.push(`this map MUST author BOTH kinds (В28 + В27), got ${kinds.join(" + ")}`);
  }
  if (ZONES[0].toM !== ZONES[1].fromM) {
    post.push(`В28 must hand over to В27 with no legal road between (${ZONES[0].toM} != ${ZONES[1].fromM})`);
  }
  if (ZONES[0].kind === ZONES[1].kind) post.push("the two spans must differ in kind — the seam IS the lesson");
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // The В27 span is the only stretch a drill may never rest on. The bay and the
  // start must be clear of BOTH spans; the drop-off spawn must sit inside В28
  // (престоят там е точно това, което шадоуто демонстрира) and outside В27.
  const inZone = (y, z) => y >= z.fromM && y <= z.toM;
  const [parkZone, stopZone] = ZONES;
  const bay = SPAWN_POINTS.find((s) => s.id === `${idPrefix}-spawn-bay`);
  const dropoff = SPAWN_POINTS.find((s) => s.id === `${idPrefix}-spawn-dropoff`);
  const start = SPAWN_POINTS.find((s) => s.id === `${idPrefix}-spawn-start`);
  for (const z of ZONES) {
    if (inZone(bay.y, z)) post.push(`the legal bay (y=${bay.y}) rests inside ${z.id} — parking there must be lawful`);
    if (inZone(start.y, z)) post.push(`the start spawn sits inside ${z.id}`);
  }
  if (!inZone(dropoff.y, parkZone)) post.push(`the drop-off spawn (y=${dropoff.y}) must sit INSIDE the В28 span`);
  if (inZone(dropoff.y, stopZone)) post.push(`the drop-off spawn (y=${dropoff.y}) must sit OUTSIDE the В27 span`);
  if (!(legalBayY > stopToM)) post.push(`the legal bay must sit past the В27 span`);

  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the carriageway`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pk_ban2 self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-ban2-v1",
    label: "Учебна улица — В27 срещу В28 (сценарий PK-06)",
    idPrefix: "pkb2",
    parkFromM: 70,
    parkToM: 170,
    stopToM: 290,
    legalBayY: 330,
    lengthM: 380,
    maxspeedKmh: 50,
    noteBg:
      "Улицата е подписана два пъти: В28 от 70-ия до 170-ия метър (престоят за слизане е разрешен, паркирането — не) и В27 от 170-ия до 290-ия метър (нищо не е разрешено). Паркирай чак след 290-ия метър — на 330-ия.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildStopVsParkStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== stop-vs-park build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  for (const z of district.meta.scenario.banZonesY) {
    line(`${z.signRef} ${z.id}`, `y ∈ [${z.fromY}, ${z.toY}]  graded=${z.graded}  (${z.lawRef})`);
  }
  line("sign seam", `y = ${district.meta.scenario.signSeamY} (В28 → В27, no legal road between)`);
  line("legal bay", `y = ${params.legalBayY} (${params.legalBayY - params.stopToM} m past В27)`);
  line("intersections / crossings", `${district.intersections.length} / ${district.crossings.length} (total FP armor)`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
