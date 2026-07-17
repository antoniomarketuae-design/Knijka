/**
 * gen_pk_rail.mjs — pk-rail-v1, the RAIL-CROSSING ban map (doc 72 §11 archetype
 * PK-06 „спиране в забранена зона" + §12 RX-03 „опашка върху прелеза";
 * ЗДвП чл. 98). The gen_rail_crossing.mjs geometry (the authored track BAND, the
 * guarded А34 variant, the barrier timetable) fused with gen_ban_zones.mjs /
 * gen_pk_banx.mjs span authoring — the first district where the two data layers
 * share one street.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength (the Locator's sM) EQUALS district y):
 *
 *     pkr-n-end (0, 400)
 *         │
 *         ·  legal shoulder bay          y = 330   (outside everything — the goal)
 *         │
 *         ▓  z-ban-after   чл. 98        y = [206, 256]
 *         ═  z-railcrossing (А34, guarded) y = [200, 206]   ← the BAND
 *         ·  СТОП line / barrier arm     y = 195
 *         ▓  z-ban-before  чл. 98        y = [150, 200]
 *         │
 *     pkr-spawn-start (4.06, 15)
 *         │
 *     pkr-n-start (0, 0)
 *
 * WHY THE BAND CARRIES NO BAN SPAN. Stopping ON the rails is not merely also
 * forbidden — it is the worst thing in this whole stretch, and the engine
 * already grades it: the railCrossing zone's rest-on-tracks arm bills
 * RAIL_CROSSING_VIOLATION (опасна) with detail "stopped-on-track", deliberately
 * WITHOUT the queue exemption every ban span has. Laying a noStopping span over
 * the band as well would double-bill ONE legal fault under TWO codes, and would
 * make the тежката грешка indistinguishable from the лека one beside it. So the
 * two data layers split the geography exactly on the rail edge: the ban spans
 * own the approach and the run-out, the rail zone owns the band. Together they
 * cover the whole forbidden stretch, each with the code it deserves. The spans
 * ABUT the band (toM 200 / fromM 206) — there is no legal metre anywhere between
 * y = 150 and y = 256.
 *
 * WHY THE CROSSING IS GUARDED (А34), AND WHY THE BARRIER NEVER COMES DOWN HERE.
 * Both are forced by the ban this map exists to teach:
 *  - GUARDED: an unguarded crossing (А35, чл. 52) carries a MANDATORY full stop
 *    before the band — which on this map would land inside z-ban-before, i.e.
 *    the law would order the driver to commit the fault being graded. Чл. 52
 *    asks no stop of a guarded-open crossing, so the correct drive here really
 *    is one unbroken motion, and „спрях за малко пред прелеза" really is a
 *    choice rather than a duty.
 *  - BARRIER UP: the timetable is authored down [480, 540) of a 600 s cycle (a
 *    train every ten minutes, a minute of closure) — entirely outside the
 *    drillWindowSec the params assert, so every drive on this map lives in the
 *    open window. This is not tidiness: waiting at a lowered barrier inside a
 *    ban span is LAWFUL (чл. 93 — that is спиране for a traffic reason, not
 *    престой), and ILLEGAL_STOP_IN_BAN_ZONE has no armor that can see a barrier
 *    (its banZoneControl reads stop lines and signals only). A drill that put
 *    the barrier down over the span would convict a driver for obeying it. The
 *    missing capability — the rail phase joining the detector's innocent-context
 *    set in rules/engine.ts — is named, not taken (shared file).
 *
 * WHY NOTHING IS SIGNALIZED / ARTERIAL / CROSSED (the gen_pk_banx precondition,
 * verbatim): ILLEGAL_STOP_IN_BAN_ZONE is structurally innocent wherever a rest
 * is traffic-shaped (a queue lead, a stop line within the clear window, any
 * forbidding signal, an armed crossing zone). This map carries ZERO
 * intersections and ZERO crossings and its one edge is `residential`
 * (CLASS_RANK 2 < ARTERIAL_MIN_RANK 4), so buildStopLines emits NOTHING and
 * CrossingZoneTracker can never arm: a rest in a span is the authored fault and
 * nothing else.
 *
 * HONEST SCOPE — the 50 m reach is the CONTENT BANK's number, and it is flagged.
 * q-spirane-i-parkirane-056 („на самия прелез и на по-малко от 50 метра от двете
 * му страни") is `status: needs-review` and its own explanation carries
 * „[REVIEW: потвърди точното разстояние (50 м?)]" with lawRef „чл. 98?". The
 * SUBSTANCE — the zone around a crossing stays clear, both sides, band included
 * — is certain; the exact statutory metre count is not. So banReachM = 50 mirrors
 * that item's keyed option (the map is data, and data can be re-cut in one run),
 * while the scenario copy teaches the PRINCIPLE and never drills the number as
 * law (ADR-002: retrieval + citation, never free recall). When review confirms
 * the distance, change banReachM here and re-run — the template needs no edit.
 *
 * KNOWN VISUAL GAP (honest — the gen_rail_crossing.mjs + gen_pk_banx.mjs header
 * precedent): no А34 / Андреевски-кръст / barrier-arm asset exists, so the
 * crossing GRADES exactly (authored band + timetable) but renders no track,
 * posts or arm; and builders/zoneSigns.ts posts a В27 face at the start of every
 * `noStopping` span, so the two law-implied spans here get two wrong-but-harmless
 * plates (render-only — grading reads the spans, never the posts). The fix for
 * the latter is a `posted?: boolean` on DistrictZone (default true ⇒ every
 * shipped map byte-identical); not taken here — shared file.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_rail.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** The СТОП cross / barrier arm sits this far before the band (gen_rail_crossing). */
const STOP_LINE_CLEAR_M = 5;
/** runtime/worldRuntime.ts RAIL_APPROACH_M — the phase window before the band. */
const RAIL_APPROACH_M = 30;
/** runtime/zones.ts ZONE_EXIT_RADIUS_M — the widest armor radius on this map's
 *  furniture (there is none, but the bay margin is checked against it anyway). */
const CROSSING_EXIT_R_M = 38;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation), the two generators merged:
 *  А34 posts the guarded crossing (Наредба № 18 warning signs); the чл. 98 spans
 *  are LAW-implied and carry the statute as their ref, never a plate. */
const SIGN_GUARDED = "А34";
const SIGN_UNGUARDED = "А35";
const BAN_LAW_REF = "ЗДвП-98";

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn id prefix
 *   lengthM: number,        // street length (200..1000)
 *   maxspeedKmh: number,    // legal limit (30..90)
 *   band: { fromM: number, toM: number },  // the track band (rails ± clearance)
 *   banReachM: number,      // чл. 98 reach each side of the band (see header)
 *   legalBayY: number,      // the ONE legal stopping mark, district y
 *   barrier: { cycleSec: number, downFromSec: number, downToSec: number },
 *   drillWindowSec: number, // every drive must fit in the OPEN window
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildRailBanStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    lengthM,
    maxspeedKmh,
    band,
    banReachM,
    legalBayY,
    barrier,
    drillWindowSec,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!band || !(band.fromM > 0 && band.fromM < band.toM)) {
    errors.push(`band must satisfy 0 < fromM < toM, got [${band?.fromM}, ${band?.toM}]`);
  }
  if (band && band.toM - band.fromM > 12) {
    errors.push(`band [${band.fromM}, ${band.toM}] wider than 12 m — a level crossing is a BAND, not a district`);
  }
  if (!(banReachM >= 20 && banReachM <= 100)) errors.push(`banReachM must be within 20..100 m, got ${banReachM}`);
  // The approach must be long enough that the rail PHASE window (30 m) opens
  // inside the ban span rather than before it — the two layers have to overlap
  // in the driver's experience even though their spans do not.
  if (band && !(band.fromM - banReachM >= 60)) {
    errors.push(`the ban must start >= 60 m into the street (approach), starts at ${band?.fromM - banReachM}`);
  }
  if (band && banReachM < RAIL_APPROACH_M) {
    errors.push(`banReachM ${banReachM} < RAIL_APPROACH_M ${RAIL_APPROACH_M}: the rail approach window would open on legal road`);
  }
  if (!barrier || !(barrier.cycleSec > 0) ||
      !(barrier.downFromSec >= 0 && barrier.downFromSec < barrier.downToSec && barrier.downToSec <= barrier.cycleSec)) {
    errors.push(`guarded crossing requires a valid barrier timetable (0 <= downFromSec < downToSec <= cycleSec), got ${JSON.stringify(barrier)}`);
  }
  // THE header's second law, as an assertion: the barrier may not fall while any
  // drive is running, or the drill would convict a driver for obeying it.
  if (!(drillWindowSec > 0)) errors.push(`drillWindowSec must be > 0, got ${drillWindowSec}`);
  if (barrier && drillWindowSec > 0 && !(barrier.downFromSec >= drillWindowSec)) {
    errors.push(
      `the barrier falls at ${barrier?.downFromSec} s, inside the ${drillWindowSec} s drill window — ` +
        `a lawful barrier wait inside a ban span would grade ILLEGAL_STOP_IN_BAN_ZONE (see the header)`,
    );
  }
  if (band && !(legalBayY > band.toM + banReachM && legalBayY <= lengthM - 40)) {
    errors.push(`legalBayY must sit past the far ban span and <= ${lengthM - 40}, got ${legalBayY}`);
  }
  if (errors.length > 0) throw new Error(`gen_pk_rail params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 street — the northbound lane center
  // sits half a drawn lane east of the axis.
  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  /** The СТОП cross / barrier arm — the anchor the templates and trace scripts
   *  pin (gen_rail_crossing's meta.scenario.railCrossing.stopLineY). It sits
   *  INSIDE z-ban-before by law and by geometry: see the header's barrier note. */
  const stopLineY = r2(band.fromM - STOP_LINE_CLEAR_M);

  const banBeforeFromM = r2(band.fromM - banReachM);
  const banAfterToM = r2(band.toM + banReachM);

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
      // CLASS_RANK 2 — below ARTERIAL_MIN_RANK: no stop lines, no FP armor.
      class: "residential",
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

  // The FP-armor precondition, as data: nothing here can make a rest look
  // traffic-shaped (see the header).
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- The two data layers, abutting on the rail edge (see the header).
  const ZONES = [
    {
      // чл. 98 — the approach: from the ban's start up to the near rail.
      id: `${idPrefix}-z-ban-before`,
      kind: "noStopping",
      edgeId,
      fromM: banBeforeFromM,
      toM: r2(band.fromM),
      signRef: BAN_LAW_REF,
    },
    {
      // The track band itself — RX-03's ground, and the ONLY span here that is
      // not a чл. 98 span (its rest arm is опасна, not основна).
      id: `${idPrefix}-z-railcrossing`,
      kind: "railCrossing",
      edgeId,
      fromM: r2(band.fromM),
      toM: r2(band.toM),
      signRef: SIGN_GUARDED,
      guarded: true,
      barrier: {
        cycleSec: barrier.cycleSec,
        downFromSec: barrier.downFromSec,
        downToSec: barrier.downToSec,
      },
    },
    {
      // чл. 98 — the run-out: from the far rail onward.
      id: `${idPrefix}-z-ban-after`,
      kind: "noStopping",
      edgeId,
      fromM: r2(band.toM),
      toM: banAfterToM,
      signRef: BAN_LAW_REF,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — преди зоната на прелеза",
    },
    {
      id: `${idPrefix}-spawn-bay`,
      x: laneRightM,
      y: r2(legalBayY),
      heading: 0,
      edgeId,
      name: "Разрешено място за престой — след зоната на прелеза",
    },
  ];

  // Visual anchors west of the street, clear of carriageway + sidewalk: one at
  // the ban's start (where the decision is made) and one at the legal bay (so
  // the goal READS as a place, not as a coordinate).
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block-approach`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 20), r2(banBeforeFromM - 24)],
        [r2(-CLEAR), r2(banBeforeFromM - 24)],
        [r2(-CLEAR), r2(banBeforeFromM - 6)],
        [r2(-CLEAR - 20), r2(banBeforeFromM - 6)],
      ],
    },
    {
      id: `${idPrefix}-b-block-bay`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), r2(legalBayY - 14)],
        [r2(-CLEAR), r2(legalBayY - 14)],
        [r2(-CLEAR), r2(legalBayY + 14)],
        [r2(-CLEAR - 22), r2(legalBayY + 14)],
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
      bandFromM: r2(band.fromM),
      bandToM: r2(band.toM),
      banReachM,
      legalBayY: r2(legalBayY),
      banKind: "noStopping",
      banBasis: "law", // чл. 98 — no plate posts these spans
      guarded: "guarded",
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    legalBayY: r2(legalBayY),
    railCrossing: {
      id: ZONES[1].id,
      signRef: SIGN_GUARDED,
      fromM: r2(band.fromM),
      toM: r2(band.toM),
      guarded: true,
      stopLineY,
      barrier: { ...ZONES[1].barrier },
      drillWindowSec,
    },
    /** District-y (not edge-arclength — identical here, but the pk-banx
     *  convention) view of every чл. 98 span: what the ScenarioSpec and the
     *  trace scripts are written against. The BAND is deliberately absent — it
     *  is not a ban span (see the header). */
    banZonesY: [
      { id: ZONES[0].id, lawRef: "ЗДвП чл. 98", fromY: banBeforeFromM, toY: r2(band.fromM) },
      { id: ZONES[2].id, lawRef: "ЗДвП чл. 98", fromY: r2(band.toM), toY: banAfterToM },
    ],
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_rail.mjs",
      // ZONE schema marker (ADR-006 stage 2a version contract; kind growth keeps
      // 1 — the 2b/3a precedent): this file carries the optional `zones`.
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с жп прелез и забранена за престой зона — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
  // Self-validation — the gen_ban_zones + gen_rail_crossing invariants, plus
  // the two laws that only exist because this map fuses them.
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
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way 1+1 street expected`);
    // The no-stop-line law (gen_pk_banx): an arterial rank here would post a
    // stop line and silently acquit every graded rest.
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The FP-armor precondition, asserted rather than assumed.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (it would feed buildStopLines)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (it would arm CrossingZoneTracker within ~35 m)");

  const railZones = ZONES.filter((z) => z.kind === "railCrossing");
  const banZones = ZONES.filter((z) => z.kind === "noStopping");
  if (railZones.length !== 1) post.push(`exactly ONE rail band expected, got ${railZones.length}`);
  if (banZones.length !== 2) post.push(`exactly TWO чл. 98 spans expected (both sides), got ${banZones.length}`);
  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  if (new Set(ZONES.map((z) => z.id)).size !== ZONES.length) post.push("zone ids must be unique");

  const rail = railZones[0];
  if (rail) {
    if (rail.signRef !== SIGN_GUARDED) post.push(`${rail.id}: a guarded crossing posts ${SIGN_GUARDED}, not ${rail.signRef}`);
    if (rail.signRef === SIGN_UNGUARDED) post.push(`${rail.id}: А35 would impose a чл. 52 stop duty inside the ban span`);
    if (rail.guarded !== true) post.push(`${rail.id}: this map's crossing must be guarded (see the header)`);
    const b = rail.barrier;
    if (!b || !(b.cycleSec > 0 && b.downFromSec >= 0 && b.downFromSec < b.downToSec && b.downToSec <= b.cycleSec)) {
      post.push(`${rail.id}: guarded span carries an invalid barrier timetable`);
    } else if (!(b.downFromSec >= drillWindowSec)) {
      post.push(`${rail.id}: the barrier falls inside the drill window — see the header`);
    }
    // THE law of this district: the ban spans must not overlap the band's
    // INTERIOR, or the rest-on-rails demo would bill two codes for one fault.
    for (const z of banZones) {
      if (z.fromM < rail.toM && z.toM > rail.fromM) {
        post.push(`${z.id}: чл. 98 span [${z.fromM}, ${z.toM}] overlaps the band [${rail.fromM}, ${rail.toM}]`);
      }
    }
    // …and they must ABUT it: a legal metre beside the rails would be a lie.
    const before = banZones.find((z) => z.toM <= rail.fromM);
    const after = banZones.find((z) => z.fromM >= rail.toM);
    if (!before || before.toM !== rail.fromM) post.push("the approach ban must end exactly at the near rail");
    if (!after || after.fromM !== rail.toM) post.push("the run-out ban must start exactly at the far rail");
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  if (!(stopLineY > 0 && stopLineY < band.fromM)) post.push(`stop line ${stopLineY} must sit before the band start ${band.fromM}`);

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // A drill may not start or finish anywhere forbidden — the shadow's rest is
  // the whole objective, so it has to be provably lawful ground.
  const inAnyZone = (y) => ZONES.some((z) => y >= z.fromM && y <= z.toM);
  for (const s of SPAWN_POINTS) {
    if (inAnyZone(s.y)) post.push(`${s.id} (y=${s.y}) sits inside an authored span — it must be legal ground`);
  }
  if (!(legalBayY - banAfterToM > CROSSING_EXIT_R_M)) {
    post.push(`the legal bay must sit > ${CROSSING_EXIT_R_M} m past the ban, got ${r2(legalBayY - banAfterToM)} m`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`lane center ${laneRightM} outside the northbound bank`);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the carriageway`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pk_rail self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-rail-v1",
    label: "Учебна улица — престой около жп прелез (сценарий PK-06 / RX-03)",
    idPrefix: "pkr",
    lengthM: 400,
    maxspeedKmh: 50,
    band: { fromM: 200, toM: 206 },
    banReachM: 50,
    legalBayY: 330,
    // A train every ten minutes, a minute of closure — and it falls at t = 480,
    // long after the last drive has parked (drillWindowSec 180). See the header.
    barrier: { cycleSec: 600, downFromSec: 480, downToSec: 540 },
    drillWindowSec: 180,
    noteBg:
      "Забраните тук не са поставени със знак — те следват от закона: чл. 98 забранява престоя и паркирането около железопътния прелез, от двете му страни. Върху самите релси спирането е най-тежкото от всичко: прелезът трябва да е чист и за колоната, и за влака. Разрешеното място е далеч след зоната.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildRailBanStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== rail-ban build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("track band", `[${district.meta.scenario.railCrossing.fromM}, ${district.meta.scenario.railCrossing.toM}] m (${district.meta.scenario.railCrossing.signRef}, guarded)`);
  line("stop line", `y = ${district.meta.scenario.railCrossing.stopLineY}`);
  line("barrier", `down [${params.barrier.downFromSec}, ${params.barrier.downToSec}) of ${params.barrier.cycleSec} s — UP for the whole ${params.drillWindowSec} s drill`);
  for (const z of district.meta.scenario.banZonesY) {
    line(z.id, `y ∈ [${z.fromY}, ${z.toY}]  (${z.lawRef})`);
  }
  line("legal bay", `y = ${district.meta.scenario.legalBayY}`);
  line("zonesVersion", district.meta.zonesVersion);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
