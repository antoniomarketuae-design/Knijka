/**
 * gen_mg_busstop.mjs — mg-busstop-v1, the BUS-PULLOUT micro-map (Scenario
 * Studio doc 76 §3; doc 72 §15 archetype VU-11 „Потеглящ автобус", ЗДвП
 * чл. 67). The gen_pe_crossings.mjs framing (one straight city street that
 * teaches ONE approach and nothing else) executed in the gen_ban_zones.mjs
 * mold — because the thing that makes this drill gradable is a `zones` span,
 * not a crossing:
 *
 *     mgb-n-end (0, 400)
 *         │
 *         ·  mgb-spawn-finish (4.06, 385)
 *         │
 *         ▓  спирка (bus bay window)  y ∈ [130, 176]   — in the БУС ЛЕНТА
 *         │
 *         ·  mgb-spawn-start (4.06, 15)   ← the GENERAL lane: where the law
 *         │                                 already puts the car
 *     mgb-n-start (0, 0)
 *
 *   NORTHBOUND BANK      x = 12.19  laneId 0 — БУС ЛЕНТА (BUS маркировка);
 *                                             the спирка sits in it
 *                        x =  4.06  laneId 1 — the general lane (the player)
 *
 * WHY THE BUS LANE IS THE WHOLE MAP (the mw-entry-v1 „data gap" trick, in
 * reverse). The drill needs the bus laterally RIGHT of the player and the
 * player innocent in the general lane from frame 1 to the finish line. Both
 * fall out of ONE authored span:
 *   - `busLane` sets tick.busLaneRight, and the keep-right detector then reads
 *     rightmostRequiredLane = 1 (rules/engine.ts — the SN-05 interplay): a car
 *     cruising laneId 1 for the whole 400 m can never grade NOT_KEEPING_RIGHT,
 *     which is exactly the legality of not driving along a bus bay;
 *   - the staged bus rides the graph's default lane for a two-way edge — the
 *     CURB lane, x = 12.1875 (extraRightOffsetM 0, so it is NEVER tagged as a
 *     cyclist proxy, A11) — and its pull-out is a laneShift of −8.125 m into
 *     the player's lane. No new engine code, no new tick field, no detector.
 * The span therefore covers the FULL edge (fromM 0 → toM lengthM): a partial
 * span would make the player's own lane illegal on the approach, and a drill
 * that convicts the student for being where the law put him teaches nothing.
 *
 * WHY THERE IS NO JUNCTION, NO CROSSING AND NO SIGNAL (the gen_pk_busstop.mjs
 * clean-room law): the graded channels here are the player's speed at the
 * pull-out and the gap he keeps behind the bus afterwards. A crossing would
 * arm CrossingZoneTracker within ~35 m of the bay and start grading
 * PEDESTRIAN_* on a drill about vehicles; an intersection would feed
 * buildStopLines and arm the junction trackers. This map carries ZERO of each,
 * so the only thing that can grade is the drive.
 *
 * LAW NOTES (retrieval + citation only, ADR-002 — the repo's own sources):
 *   - the duty to let a route bus pull out of a stop IN A BUILT-UP AREA:
 *     scenarios/event-library.json ev-bus-pullout → „ЗДвП чл. 67" (itself a
 *     correction of an earlier чл. 100), and doc 72 §15 VU-11 agrees. The
 *     QUESTION BANK's own refs on the same duty are flagged uncertain —
 *     q-predimstvo-020/041 cite „чл. 68?" and q-manevri-036 „чл. 69?", all
 *     status needs-review (content/audits/manevri-i-izprevarvane.audit.json
 *     argues чл. 69 for the OTHER drivers' duty). The template cites the
 *     event library's чл. 67 and the divergence is flagged, not papered over;
 *   - 50 in населено място: ЗДвП чл. 21 — q-speed-*;
 *   - the hazards around a halted bus (hidden crossers, running passengers):
 *     ЗДвП чл. 20 / чл. 116 — q-eco-005, q-uyazvimi-065.
 *
 * KNOWN GAPS (honest — the gen_pk_busstop.mjs / gen_ban_zones.mjs precedent;
 * all three are RENDER-only, and grading reads the spans and the drive, never
 * paint or props):
 *  - INDICATOR: TrafficVehicleState carries no indicator channel (traffic/
 *    types.ts) — a staged bus CANNOT show a ляв мигач. The visible cue is the
 *    rig itself getting under way out of the bay; the scenario copy carries
 *    the „подал ляв мигач" teaching, and nothing grades off the missing lamp.
 *  - MARKING: builders/markings.ts does not read District.zones, so the BUS
 *    inscription and the bay's own paint are not painted (the ov-bus-v1
 *    precedent). Grading is exact regardless — authored spans, not paint reads.
 *  - SHELTER: builders/props.ts places bus-stop shelters only on primary/
 *    secondary edges anchored to a degree >= 3 node; both are unavailable here
 *    BY DESIGN (arterial rank + a junction are exactly the furniture the
 *    clean-room law forbids), so the bay renders as plain curb with a block
 *    behind it. builders/zoneSigns.ts posts nothing for a `busLane` span
 *    (marking-only kind) — so, unlike pk-busstop-v1, this map places no
 *    wrong-but-harmless В27 face either.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; `zones`
 * is additive and reuses the shipped "busLane" kind; meta.zonesVersion stays 1.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_mg_busstop.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/mg-busstop-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** signRef ↔ kind pairing law (self-validation): the бус лента is marked by
 *  the BUS надпис (Наредба № 2 — други маркировки), never by a В-plate. */
const KIND_TO_SIGN = { busLane: "BUS" };

/** Kinematic recorder envelope (traces/recorder.ts): accel 2.2 m/s². Asserted
 *  against so a param change that makes the authored drives physically
 *  dishonest fails the BUILD, not the demo. */
const RECORDER_ACCEL_MPS2 = 2.2;
/** The approach cruise the authored drives of traces/scMergeBusPullout.ts
 *  build before the bay, km/h. */
const AUTHORED_APPROACH_KMH = 45;
/** The player must SEE the bay from this far back — the brief's „sightline
 *  long enough to read the bus indicator early", made a build-time law. */
const SIGHTLINE_MIN_M = 100;
/** A bay shorter than this is not a bay (a rigid bus is ~12 m and has to roll
 *  out of it before the pull-out point). */
const BAY_MIN_M = 30;
/** Run-out past the bay: the merged bus and the car behind it need room to
 *  settle into a following gap that the drill can measure. */
const RUNOUT_MIN_M = 150;

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
 *   idPrefix: string,     // node/edge/zone/spawn id prefix
 *   lengthM: number,      // street length (300..800)
 *   maxspeedKmh: number,  // legal limit (30..50 — населено място)
 *   bayFromM: number,     // спирка window start, district y
 *   bayToM: number,       // спирка window end (the pull-out point), district y
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildBusStopPulloutStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, bayFromM, bayToM, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 300 && lengthM <= 800)) errors.push(`lengthM must be within 300..800 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) {
    errors.push(`maxspeedKmh must be within 30..50 (населено място — чл. 67 scope), got ${maxspeedKmh}`);
  }
  if (!(bayFromM >= SIGHTLINE_MIN_M)) {
    errors.push(`bayFromM needs >= ${SIGHTLINE_MIN_M} m of sightline before it, got ${bayFromM}`);
  }
  if (!(bayToM - bayFromM >= BAY_MIN_M)) {
    errors.push(`the bay needs >= ${BAY_MIN_M} m (a rigid bus rolls out of it), got ${r2(bayToM - bayFromM)}`);
  }
  if (!(lengthM - bayToM >= RUNOUT_MIN_M)) {
    errors.push(`the pull-out needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - bayToM)}`);
  }
  if (errors.length > 0) throw new Error(`gen_mg_busstop params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts + traffic/graph.ts): 2+2, so the
  // northbound curb lane (laneId 0 — the бус лента the staged bus rides on
  // extraRightOffsetM 0) centers 1.5 drawn lanes east, and the general lane
  // (laneId 1 — the player) 0.5 lanes east.
  const lanes = 4;
  const lanesPerDir = lanes / 2;
  const laneBusM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 12.19
  const laneGeneralM = r2(0.5 * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 16.25

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
      class: "tertiary", // the ov-bus-v1 rank: a boulevard, still no stop lines
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

  // The clean-room law, as DATA: nothing here can arm a crossing zone, a stop
  // line or a junction tracker, because none of that furniture exists.
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The бус лента. The street is one edge on x = 0, so edge arclength (the
  // runtime Locator's sM) EQUALS district y — and the span is the FULL edge
  // (see the header: the player's general-lane cruise must be innocent on the
  // first frame and on the last).
  const ZONES = [
    {
      id: `${idPrefix}-z-buslane`,
      kind: "busLane",
      edgeId,
      fromM: 0,
      toM: r2(lengthM),
      signRef: KIND_TO_SIGN.busLane,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      // THE DRILL'S PREMISE: the car starts in the GENERAL lane, because the
      // curb lane is the бус лента — driving along it is the other lesson
      // (SN-05, ov-bus-v1). Here the curb lane is where the bus lives.
      x: laneGeneralM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — общата лента (дясната е бус лента)",
    },
    {
      id: `${idPrefix}-spawn-bay`,
      x: laneBusM,
      y: r2(bayFromM + 10),
      heading: 0,
      edgeId,
      name: "Спирката — автобусът чака в бус лентата",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneGeneralM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — след спирката",
    },
  ];

  // Visual anchors. The bay is on the RIGHT of northbound travel (east, x > 0),
  // so the stop's block sits east beside it; one west block gives the approach
  // something to read the distance against. All clear of carriageway+sidewalk.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-approach`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), 40],
        [r2(-CLEAR), 40],
        [r2(-CLEAR), 96],
        [r2(-CLEAR - 22), 96],
      ],
    },
    {
      id: `${idPrefix}-b-stop-block`,
      height: 15,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(bayFromM - 6)],
        [r2(CLEAR + 26), r2(bayFromM - 6)],
        [r2(CLEAR + 26), r2(bayToM + 6)],
        [r2(CLEAR), r2(bayToM + 6)],
      ],
    },
    {
      id: `${idPrefix}-b-runout-block`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(bayToM + 60)],
        [r2(CLEAR + 20), r2(bayToM + 60)],
        [r2(CLEAR + 20), r2(bayToM + 108)],
        [r2(CLEAR), r2(bayToM + 108)],
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
    params: { lengthM, maxspeedKmh, lanes, bayFromM, bayToM, banKind: "busLane" },
    lanesPerDirection: lanesPerDir,
    /** laneId 0 — the бус лента: the staged bus's own path (offset 0). */
    laneCenterRightM: laneBusM,
    /** laneId 1 — the general lane: the player's whole drive. */
    laneCenterLeftM: laneGeneralM,
    /** The EXACT lane-graph x the staged actor rides / shifts to (unrounded —
     *  the ScenarioSpec pins cutAt/cutShiftM against these, the L7 truth). */
    actorLaneX: (lanesPerDir - 0.5) * SCALED_LANE_W,
    actorShiftM: -SCALED_LANE_W,
    /** The спирка window, district y (= edge arclength here) — the narrative
     *  anchor the scenario copy and the trace scripts are written against. */
    busBayY: { fromY: r2(bayFromM), toY: r2(bayToM) },
    /** The бус лента span, district y. Full-edge by law (see the header). */
    busLaneY: { id: ZONES[0].id, lawRef: "Наредба № 2/2001 — BUS", fromY: 0, toY: r2(lengthM) },
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_mg_busstop.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с автобусна спирка в бус лента — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
    // A bus lane needs a general lane BESIDE it: a 1+1 street would leave the
    // car no legal lane at all (the gen_ban_zones stage-2b shape law).
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way street with ${lanes} marked lanes expected`);
    for (const [x] of e.geometry) if (x !== 0) post.push(`${e.id}: the street must stay collinear on x = 0`);
  }
  // The CLEAN-ROOM law (gen_pk_busstop's precedent): the graded channels are
  // the player's speed and gap, and nothing else may compete for them.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (stop-line + junction-tracker armor)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (CrossingZoneTracker arms within ~35 m)");
  if (ROUNDABOUTS.length !== 0) post.push("no roundabout may exist");

  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (z.kind !== "busLane") post.push(`${z.id}: the only span this map authors is the бус лента`);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not mark ${z.kind}`);
    // THE MAP'S REASON TO EXIST: the span covers the FULL edge, so
    // tick.busLaneRight is true on every frame of every authored drive and the
    // general-lane cruise can never grade NOT_KEEPING_RIGHT.
    if (!(z.fromM === 0 && z.toM === host.length)) {
      post.push(`${z.id}: the бус лента span must cover the full edge [0, ${host.length}], got [${z.fromM}, ${z.toM}]`);
    }
  }
  if (ZONES.length !== 1) post.push("exactly one span (the бус лента) — a second kind would grade something else");
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  // The bay must sit inside the street with the authored sightline before it.
  if (!(bayFromM > 0 && bayToM < lengthM)) post.push(`the bay [${bayFromM}, ${bayToM}] must sit inside 0..${lengthM}`);

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // The start + finish spawns ride the GENERAL lane; only the bay reference
  // point sits in the бус лента (it is the BUS's mark, never the player's).
  if (Math.abs(SPAWN_POINTS[0].x - laneGeneralM) > 0.01 || SPAWN_POINTS[0].y >= bayFromM - SIGHTLINE_MIN_M + 1) {
    post.push(`${SPAWN_POINTS[0].id}: must start on the general lane with the full sightline ahead of it`);
  }
  if (Math.abs(SPAWN_POINTS[1].x - laneBusM) > 0.01 || SPAWN_POINTS[1].y <= bayFromM || SPAWN_POINTS[1].y >= bayToM) {
    post.push(`${SPAWN_POINTS[1].id}: must sit in the бус лента, inside the bay window`);
  }
  if (Math.abs(SPAWN_POINTS[2].x - laneGeneralM) > 0.01 || SPAWN_POINTS[2].y <= bayToM) {
    post.push(`${SPAWN_POINTS[2].id}: must sit on the general lane past the pull-out`);
  }
  // Lane-center math (the Locator's two-way bank).
  if (!(laneBusM > 0 && laneBusM < halfRoadM)) post.push(`bus-lane center ${laneBusM} outside the northbound bank`);
  if (!(laneGeneralM > 0 && laneGeneralM < laneBusM)) post.push(`general-lane center ${laneGeneralM} is not left of the бус лента`);
  // The pull-out shift is asserted against the EXACT (unrounded) lane-graph
  // centers, not the rounded meta copies: the actor rides x = 12.1875 and must
  // land on x = 4.0625 — the general lane's true center, which r2 only
  // DISPLAYS as 4.06 (traffic/graph.ts lane math, the ln-v1 precedent).
  const exactBusX = (lanesPerDir - 0.5) * SCALED_LANE_W;
  const exactGeneralX = 0.5 * SCALED_LANE_W;
  if (scenario.actorLaneX !== exactBusX || exactBusX + scenario.actorShiftM !== exactGeneralX) {
    post.push(`the authored pull-out shift ${scenario.actorShiftM} does not land on the general lane`);
  }
  if (r2(exactBusX) !== laneBusM || r2(exactGeneralX) !== laneGeneralM) {
    post.push("the rounded meta lane centers must match the exact lane-graph centers");
  }
  // Recorder-envelope honesty (traces/recorder.ts): the approach must be long
  // enough to BUILD the authored cruise and still leave the sightline intact.
  const buildM = (AUTHORED_APPROACH_KMH / 3.6) ** 2 / (2 * RECORDER_ACCEL_MPS2);
  if (bayFromM - SPAWN_POINTS[0].y < buildM + 20) {
    post.push(
      `the approach leaves no honest ${AUTHORED_APPROACH_KMH} km/h build-up (needs ${r2(buildM)} + 20 m, has ${r2(bayFromM - SPAWN_POINTS[0].y)})`,
    );
  }
  // The чл. 67 scope, as data: the drill only exists в населено място.
  if (!(maxspeedKmh <= 50)) post.push("чл. 67 applies в населено място — the posted limit must stay urban");
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
    throw new Error(`gen_mg_busstop self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (VU-11 „Потеглящ автобус")
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mg-busstop-v1",
    label: "Учебна улица — потеглящ автобус от спирка (сценарий VU-11)",
    idPrefix: "mgb",
    lengthM: 400,
    maxspeedKmh: 50,
    bayFromM: 130,
    bayToM: 176,
    noteBg:
      "Дясната лента е бус лента и в нея е спирката — ти пътуваш в лявата, обща лента. В населено място намали и пропусни автобуса от редовната линия, който потегля от спирката (ЗДвП чл. 67).",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildBusStopPulloutStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== mg-busstop build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("lanes (total / per dir)", `${sc.params.lanes} / ${sc.lanesPerDirection}`);
  line("бус лента (laneId 0)", `x = ${sc.laneCenterRightM} — span y ∈ [${sc.busLaneY.fromY}, ${sc.busLaneY.toY}] (full edge)`);
  line("general lane (laneId 1)", `x = ${sc.laneCenterLeftM} — the player's whole drive`);
  line("спирка (bay window)", `y ∈ [${sc.busBayY.fromY}, ${sc.busBayY.toY}]`);
  line("actor lane / shift", `x = ${sc.actorLaneX} → laneShift ${sc.actorShiftM} m`);
  line("intersections / crossings", `${district.intersections.length} / ${district.crossings.length} (clean room)`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
