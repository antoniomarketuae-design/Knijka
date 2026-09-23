/**
 * gen_pk_busstop.mjs — pk-busstop-v1, the BUS-STOP map (doc 72 §11 archetype
 * PK-06 „спиране в забранена зона"). The gen_ban_zones.mjs mold by way of
 * gen_pk_banx.mjs (same `zones` layer, same self-validating shape), with the
 * one difference that IS the template:
 *
 *   pk-ban-v1  (shipped) bans by SIGN  — a В27 plate marks the span.
 *   pk-banx-v1 (shipped) bans by LAW   — the zebra and the corner ARE the ban.
 *   pk-busstop-v1 is governed by the STOP ZONE — ЗДвП чл. 69 lets other
 *   vehicles stop at a spirka ONLY to let passengers alight and ONLY if they do
 *   not hinder the bus, and чл. 98, ал. 2, т. 3 bans PARKING there; the зигзаг
 *   marks out how far that zone reaches. The drill is that the zone is BIGGER
 *   than the shelter you can see: the marked approach is already the spirka.
 *
 * FOUNDER RULINGS 2026-09-22 — «Convict under чл. 69» (sc-pk-busstop-ban:
 * b103c282) and «Teach чл. 69 as written». This generator used to author both
 * spans as «ЗДвП-98-1» (чл. 98, ал. 1 — a closed list of eight places with no
 * spirka in it) and the note claimed ал. 1 bans «even a brief престой» here,
 * which the act does not say. Both spans now carry `basis: "law-bus-stop"`,
 * which (a) selects the card that quotes чл. 69 verbatim from the law bank,
 * (b) tells builders/zoneSigns.ts to post NO В27 (чл. 69 needs no plate), and
 * (c) gives the reducer its drop-off allowance — a brief stop to let a
 * passenger out is lawful; a rest past `busStopDropOffMaxSec` is паркиране
 * (чл. 93, ал. 2) and is what convicts. The zone KIND stays `noStopping`
 * because that is the flag the detector reads; the basis is what relaxes it.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength EQUALS district y along the street):
 *
 *     pkbs-n-end (0, 340)
 *         │
 *         ·  legal curb bay          y = 250   (40 m past the zone — the goal)
 *         │
 *         ▓  z-stop-pocket  чл. 69   y = [180, 210]   the bay itself
 *         ▓  z-stop-marking чл. 69   y = [150, 180]   the зигзаг approach
 *         │
 *     pkbs-spawn-start (4.06, 15)
 *         │
 *     pkbs-n-start (0, 0)
 *
 * WHY THE ZONE IS TWO SPANS, NOT ONE: they are the template's two mistake
 * demos, and a rest must be attributable to ONE of them (zone detail is what
 * distinguishes „спрях на спирката" from „спрях преди спирката, на зигзага").
 * They are contiguous — [150, 180] ∪ [180, 210] is one continuous ban in the
 * driver's experience — but authored apart because they are two different
 * misconceptions. The law is one; the excuses are two.
 *
 * WHY THERE IS NO JUNCTION, NO CROSSING AND NO SIGNAL ANYWHERE: the
 * ILLEGAL_STOP_IN_BAN_ZONE detector is structurally innocent wherever a rest is
 * traffic-shaped — a queue lead within 8 m, a stop line within 25 m, any
 * forbidding signal, OR an armed crossing zone (`s.crossing === null` is a hard
 * precondition). This map carries ZERO intersections and ZERO crossings, so
 * buildStopLines emits nothing and CrossingZoneTracker never arms: there is no
 * armor to disturb and no acquittal to trip over. (pk-banx-v1 had to route its
 * demos AROUND the ~35 m crossing arm of its own zebra; this map simply has no
 * zebra.) Every edge is `residential` (CLASS_RANK 2 < ARTERIAL_MIN_RANK 4) as a
 * second belt. A rest in a span here is the authored fault and nothing else.
 *
 * WHY NO STAGED BUS SITS IN THE POCKET (the backlog's own note): a halted bus
 * would be a lead vehicle within banZoneStopQueueGapM, which makes every rest
 * behind it queue-innocent by construction. The pocket is empty on purpose —
 * „свободна е, само за секунда" IS the misconception being taught.
 *
 * FURNITURE (render-only; grading reads the spans, never paint). All three
 * gaps this header used to list are closed downstream of this file, and none
 * of them needed a change to the JSON it writes:
 *  - MARKING: the зигзаг is painted from `meta.scenario.busStopPocketY` and the
 *    `noStopping` spans (world/__tests__/pk-busstop-districts.test.ts).
 *  - SIGN: builders/zoneSigns.ts posts NO В27 for a `law-bus-stop` span
 *    (`zonePostsPlate`); strip the basis and both faces come back.
 *  - SHELTER: props.ts's bus-stop pass reads `meta.scenario.busStopPocketY`
 *    and places the навес at the pocket's midpoint.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_busstop.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The spans' declared ground (rules/types.ts NoStopBasis). Founder rulings
 * 2026-09-22: ЗДвП чл. 69 (stop only to let passengers alight, only if the bus
 * is not hindered) + чл. 98, ал. 2, т. 3 (no parking at the stops).
 */
const BUS_STOP_BASIS = "law-bus-stop";
/** What `meta.scenario.banZonesY` records per span — the same citation the
 *  card prints (catalog.ts NO_STOP_BASIS_COPY["law-bus-stop"].lawRef). */
const BUS_STOP_LAW_REF = "ЗДвП чл. 69; чл. 93, ал. 2; чл. 98, ал. 2, т. 3";

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn id prefix
 *   markingFromM: number,   // where the зигзаг (and the ban) starts, district y
 *   pocketFromM: number,    // where the bay itself starts, district y
 *   pocketToM: number,      // where the bay (and the ban) ends, district y
 *   legalBayY: number,      // the one legal stopping mark, district y
 *   lengthM: number,        // street length
 *   maxspeedKmh: number,    // legal limit
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildBusStopStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    markingFromM,
    pocketFromM,
    pocketToM,
    legalBayY,
    lengthM,
    maxspeedKmh,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);

  // -- The zone's own shape laws --------------------------------------------
  /** The drill needs room to build speed and READ the zone before it starts. */
  const APPROACH_MIN_M = 60;
  /** A bus bay shorter than this is not a bay (a rigid bus is ~12 m). */
  const POCKET_MIN_M = 20;
  /** The зигзаг approach must be long enough to rest inside past the sustain. */
  const MARKING_MIN_M = 20;
  /** The backlog's contract: the legal bay sits 40 m past the zone. */
  const BAY_CLEAR_MIN_M = 40;
  /** Run-out past the bay so the drill can drive on after resting. */
  const RUNOUT_MIN_M = 40;

  if (!(markingFromM >= APPROACH_MIN_M)) {
    errors.push(`markingFromM needs >= ${APPROACH_MIN_M} m of approach, got ${markingFromM}`);
  }
  if (!(pocketFromM - markingFromM >= MARKING_MIN_M)) {
    errors.push(`the зигзаг span needs >= ${MARKING_MIN_M} m, got ${r2(pocketFromM - markingFromM)}`);
  }
  if (!(pocketToM - pocketFromM >= POCKET_MIN_M)) {
    errors.push(`the pocket needs >= ${POCKET_MIN_M} m, got ${r2(pocketToM - pocketFromM)}`);
  }
  if (!(legalBayY - pocketToM >= BAY_CLEAR_MIN_M)) {
    errors.push(
      `the legal bay must sit >= ${BAY_CLEAR_MIN_M} m past the stop zone, got ${r2(legalBayY - pocketToM)}`,
    );
  }
  if (!(lengthM - legalBayY >= RUNOUT_MIN_M)) {
    errors.push(`the bay needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - legalBayY)}`);
  }
  if (errors.length > 0) throw new Error(`gen_pk_busstop params invalid:\n  - ${errors.join("\n  - ")}`);

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

  // -- The authored bans. The street is one edge on x = 0, so edge arclength
  // (the runtime Locator's sM) EQUALS district y.
  const ZONES = [
    {
      // The зигзаг approach — the half of the spirka drivers do not count as
      // "the stop" (the зигзаг marks it; чл. 69 governs it like the bay).
      id: `${idPrefix}-z-stop-marking`,
      kind: "noStopping",
      edgeId,
      fromM: r2(markingFromM),
      toM: r2(pocketFromM),
      signRef: "ЗДвП-69 / Наредба № 2/2001 — зигзаг",
      basis: BUS_STOP_BASIS,
    },
    {
      // The bay itself — the obvious half.
      id: `${idPrefix}-z-stop-pocket`,
      kind: "noStopping",
      edgeId,
      fromM: r2(pocketFromM),
      toM: r2(pocketToM),
      signRef: "ЗДвП-69 — спирка",
      basis: BUS_STOP_BASIS,
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
      x: laneRightM,
      y: r2(legalBayY),
      heading: 0,
      edgeId,
      name: "Разрешено място за престой — след зоната на спирката",
    },
  ];

  // -- Visual anchors. The pocket is on the RIGHT of northbound travel (east,
  // x > 0), so the stop's block sits east beside it and the bay's block east
  // beside the bay; one west block gives the approach something to read against.
  // All clear of the carriageway + sidewalk.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-approach`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), 90],
        [r2(-CLEAR), 90],
        [r2(-CLEAR), 122],
        [r2(-CLEAR - 22), 122],
      ],
    },
    {
      id: `${idPrefix}-b-stop-block`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(markingFromM + 4)],
        [r2(CLEAR + 24), r2(markingFromM + 4)],
        [r2(CLEAR + 24), r2(pocketToM + 4)],
        [r2(CLEAR), r2(pocketToM + 4)],
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
      markingFromM,
      pocketFromM,
      pocketToM,
      legalBayY,
      banKind: "noStopping",
      banBasis: "law", // чл. 69 / чл. 98, ал. 2, т. 3 — the statute governs the spirka; no plate
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    /** The bay the зигзаг wraps — narrative anchor for the scenario copy. */
    busStopPocketY: { fromY: r2(pocketFromM), toY: r2(pocketToM) },
    legalBayY: r2(legalBayY),
    /** District-y (not edge-arclength) view of every ban — what the
     *  ScenarioSpec and the trace scripts are written against. Identical to the
     *  arclength here (one edge, x = 0), and stated anyway so the template never
     *  has to know that. */
    banZonesY: [
      { id: ZONES[0].id, lawRef: BUS_STOP_LAW_REF, fromY: r2(markingFromM), toY: r2(pocketFromM) },
      { id: ZONES[1].id, lawRef: BUS_STOP_LAW_REF, fromY: r2(pocketFromM), toY: r2(pocketToM) },
    ],
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_busstop.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с автобусна спирка — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
    // The no-stop-line law: an arterial rank here would let buildStopLines post
    // a stop line and silently acquit every graded rest.
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The TOTAL-armor law: no junction, no crossing, no signal can exist here.
  // A crossing anywhere would arm CrossingZoneTracker within ~35 m and acquit a
  // rest as a possibly-lawful yielding stop (`s.crossing === null` is a hard
  // precondition of ILLEGAL_STOP_IN_BAN_ZONE); an intersection would feed
  // buildStopLines. This map is the archetype's clean room.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (stop-line armor)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (crossing-arm armor)");
  if (ROUNDABOUTS.length !== 0) post.push("no roundabout may exist");

  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (z.kind !== "noStopping") {
      // В28 (noParking) deliberately does NOT convict in the reducer — престоят
      // под В28 е разрешен — so a noParking span here would grade nothing.
      post.push(`${z.id}: every span here is a noStopping span (the flag the detector reads)`);
    }
    if (z.basis !== BUS_STOP_BASIS) {
      // Without the basis the span falls back to the pooled «под знак В27» card
      // and zoneSigns posts a В27 the spirka does not carry — the defect the
      // 2026-09-22 ruling closed — and the 4 s sustain convicts the lawful
      // drop-off чл. 69 allows.
      post.push(`${z.id}: must declare basis "${BUS_STOP_BASIS}" (founder ruling 2026-09-22)`);
    }
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  // Distinct spans (the two mistake demos must rest in DIFFERENT zones) that
  // together form ONE continuous ban (the driver never crosses legal road
  // between the зигзаг and the bay — that is the whole misconception).
  if (new Set(ZONES.map((z) => z.id)).size !== ZONES.length) post.push("zone ids must be unique");
  if (ZONES[0].toM !== ZONES[1].fromM) {
    post.push(`the зигзаг span must abut the pocket span (${ZONES[0].toM} != ${ZONES[1].fromM})`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // The legal bay is the shadow's target: it must be OUTSIDE every ban.
  for (const z of ZONES) {
    if (legalBayY >= z.fromM && legalBayY <= z.toM) {
      post.push(`the legal bay (y=${legalBayY}) rests inside ${z.id} — it must be legal`);
    }
  }
  // …and so must the spawn (a drill that starts in a ban grades on frame 1).
  for (const z of ZONES) {
    if (SPAWN_POINTS[0].y >= z.fromM && SPAWN_POINTS[0].y <= z.toM) {
      post.push(`the start spawn sits inside ${z.id}`);
    }
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
    throw new Error(`gen_pk_busstop self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-busstop-v1",
    label: "Учебна улица — престой на автобусна спирка (сценарий PK-06)",
    idPrefix: "pkbs",
    markingFromM: 150,
    pocketFromM: 180,
    pocketToM: 210,
    legalBayY: 250,
    lengthM: 340,
    maxspeedKmh: 50,
    noteBg:
      "Зоната на спирката започва на зигзага, не при навеса: от 150-ия до 210-ия метър другите коли могат да спират само за слизане на пътници и само ако не пречат на автобуса (ЗДвП чл. 69), а да чакаш там е паркиране, забранено на спирка (чл. 98, ал. 2, т. 3). Мястото за чакане е след зоната — на 250-ия метър.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildBusStopStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== bus-stop build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("зигзаг approach", `y ∈ [${params.markingFromM}, ${params.pocketFromM}]`);
  line("pocket (empty by design)", `y ∈ [${params.pocketFromM}, ${params.pocketToM}]`);
  line("legal bay", `y = ${params.legalBayY} (${params.legalBayY - params.pocketToM} m past the zone)`);
  line("intersections / crossings", `${district.intersections.length} / ${district.crossings.length} (total FP armor)`);
  for (const z of district.meta.scenario.banZonesY) {
    line(z.id, `y ∈ [${z.fromY}, ${z.toY}]  (${z.lawRef})`);
  }
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
