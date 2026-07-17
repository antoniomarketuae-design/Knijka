/**
 * gen_ov_solid2.mjs — ov-solid2-v1, the CLOSING-WINDOW map (doc 72 §10 archetype
 * OV-04 „непрекъсната осева линия" turned forward: Наредба № 2/2001 надлъжна
 * маркировка М1/М2; ЗДвП чл. 42). The gen_ban_zones.mjs mold by way of
 * gen_pk_ban2.mjs (same `zones` layer, same self-validating shape), with the one
 * difference that IS the template:
 *
 *   ov-solid-v1  (shipped) puts the М1 span at y ∈ [90, 230] of a 340 m street.
 *   The drill there is „не пресичай" — a pure line-discipline drive, no lead,
 *   no oncoming, nothing to plan.
 *   ov-solid2-v1 puts the М1 span at y ∈ [300, 500] of a 620 m road, and hands
 *   the driver 285 m of DASHED road in front of it with a crawler to pass. The
 *   drill is no longer „не пресичай" but „кога": the window is real, legal, and
 *   it ENDS — and the М2 предупредителна маркировка is what tells you where.
 *
 * WHY ov-solid-v1 COULD NOT HOST IT (the backlog's own feasibility check, run).
 * Its М1 span starts at y = 90 and its spawn sits at y = 15 — 75 m of dashed
 * road. A pass of a 40 km/h lead at ~62 km/h closes ~6 m/s and needs ~36 m of
 * relative gain, i.e. ~100 m of travel: the whole maneuver does not fit BEFORE
 * the span, let alone „finished 30 m early" as the template's shadow requires.
 * Nor could the file be edited: ov-solid-v1 is a regenerated instance of a
 * shared generator (four districts ride gen_ban_zones.mjs), so this map is its
 * own file, as the backlog's fallback directs.
 *
 * Layout (x = east, y = north; the road runs south → north on x = 0, the driver
 * travels north — so edge arclength EQUALS district y along the road):
 *
 *     ovs2-n-end (0, 620)
 *         │
 *         │  run-out — прекъсната М2 again        y = [500, 620]
 *         ▓  z-solidcenterline  М1                y = [300, 500]   прозорецът е ЗАТВОРЕН
 *         ┊  предупредителна М2 (удължени)        y = [240, 300]   „остават 60 м"
 *         ·  ovs2-spawn-returnby (4.06, 270)      y = 270          прибери се ДОТУК
 *         │  прекъсната М2 — изпреварването е разрешено
 *     ovs2-spawn-start (4.06, 15)
 *         │
 *     ovs2-n-start (0, 0)
 *
 * WHY THE WARNING SPAN IS meta.scenario AND NOT A ZONE. Наредба № 2/2001 paints
 * М2 with LENGTHENED dashes for the last stretch before an М1 span — the
 * marking whose entire job is to say „прозорецът се затваря". No `kind` in the
 * runtime's ZoneKind vocabulary carries it (runtime/district.ts), and no
 * detector could read it if it did: the warning is INFORMATION, and what it
 * informs is a decision the driver makes 60 m earlier. So it is authored where
 * authored-but-ungraded truth goes — meta.scenario.warningDashSpanY, the
 * ln-arrows-v1 `laneArrows` precedent — and the template's copy, instructions
 * and objective gate carry it. The day a `warningDashes` ZoneKind lands, that
 * block is the migration source and nothing else here changes.
 *
 * WHY THERE IS NO JUNCTION, NO CROSSING AND NO SIGNAL ANYWHERE (the
 * gen_pk_ban2.mjs clean-room precedent, pointed at a different detector): the
 * overtake-corridor and overtake-return trackers both DISARM inside a junction
 * area (`nearestIx === null` is a hard precondition of ocArmed) and the return
 * adjudication discards its whole episode on any exit that is not a committed
 * return to the own bank. A junction anywhere near the window would therefore
 * acquit the very cut this map exists to convict — silently, and for a reason
 * that has nothing to do with чл. 42. Zero intersections, zero crossings, zero
 * roundabouts: the excursion is graded by the marking and the mate, or not at
 * all.
 *
 * KNOWN RENDER GAP (honest — the gen_ban_zones.mjs header precedent): the
 * markings builder paints no solid осева along an М1 span and no lengthened
 * dashes along a warning span, and no М-marking has a sign face. Both the wall
 * and the warning render as ordinary road today; the scenario copy carries the
 * teaching and the GRADING is exact regardless (authored spans, never paint
 * reads). Pinned as an assertion in ov-solid2-districts.test.ts.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_solid2.mjs
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

/** kind ↔ marking pairing law, inherited from gen_ban_zones.mjs (М1 = единична
 *  непрекъсната осева; Наредба № 2/2001 надлъжна маркировка). */
const KIND_TO_SIGN = {
  solidCenterLine: "М1",
};

/** The DASHED marking the window rides on, and its lengthened warning variant.
 *  Authored labels only — neither is a ZoneKind (see the header). */
const DASHED_REF = "М2";

/**
 * @param {{
 *   districtId: string,      // output file name + ScenarioSpec.map.districtId
 *   label: string,           // human label (meta)
 *   idPrefix: string,        // node/edge/zone/spawn id prefix
 *   lengthM: number,         // road length
 *   maxspeedKmh: number,     // legal limit
 *   solidFromM: number,      // where the М1 span starts — the window's END, district y
 *   solidToM: number,        // where the М1 span ends, district y
 *   warnFromM: number,       // where the lengthened М2 dashes start, district y
 *   returnMarginM: number,   // the margin the drill asks the driver to land by
 *   noteBg: string,          // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildSolidWindowRoad(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    lengthM,
    maxspeedKmh,
    solidFromM,
    solidToM,
    warnFromM,
    returnMarginM,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);

  const SPAWN_Y = 15;

  // -- This map's own shape laws --------------------------------------------
  /**
   * THE law of this file. The dashed window in front of the М1 span must fit a
   * WHOLE overtake with the margin the drill grades, or the template teaches an
   * impossible standard (which is exactly what ov-solid-v1's 75 m does). The
   * arithmetic, at the authored speeds: a ~62 km/h pass of an 11.1 m/s crawler
   * closes ~6 m/s and must gain ~36 m of centers (from ~16 m behind to ~20 m
   * ahead) = ~6 s = ~103 m of travel, plus the pull-out and return arcs (~28 m
   * each). 160 m of maneuver + the graded 30 m landing margin, doubled for the
   * trail phase the oncoming stream eats: 200 m is the floor, and the committed
   * instance carries 285.
   */
  const WINDOW_MIN_M = 200;
  /** The lengthened-dash warning must be long enough to be a DECISION and short
   *  enough to be a warning (Наредба № 2/2001 runs it into the solid span). */
  const WARN_MIN_M = 40;
  const WARN_MAX_M = 100;
  /** The М1 span must hold a full wrong-bank excursion at pass speed: the
   *  crossing demo rides it for ≥ solidLineCrossSustainSec (0.6 s ≈ 11 m at
   *  62 km/h) and then returns INSIDE it, with room to settle afterwards. */
  const SOLID_MIN_M = 120;
  /** Run-out past the span so every drill can finish on legal, dashed road. */
  const RUNOUT_MIN_M = 100;
  /** The landing margin the drill grades must fit inside the warning span: the
   *  contract „прибери се преди линията" is only teachable if the marking that
   *  announces the line is still under the wheels when you land. */

  const windowM = solidFromM - SPAWN_Y;
  if (!(windowM >= WINDOW_MIN_M)) {
    errors.push(`the dashed window needs >= ${WINDOW_MIN_M} m to fit a whole pass, got ${r2(windowM)}`);
  }
  if (!(warnFromM > SPAWN_Y && warnFromM < solidFromM)) {
    errors.push(`warnFromM must sit between the spawn and the М1 span, got ${warnFromM}`);
  }
  const warnM = solidFromM - warnFromM;
  if (!(warnM >= WARN_MIN_M && warnM <= WARN_MAX_M)) {
    errors.push(`the М2 warning span must be ${WARN_MIN_M}..${WARN_MAX_M} m, got ${r2(warnM)}`);
  }
  if (!(solidToM - solidFromM >= SOLID_MIN_M)) {
    errors.push(`the М1 span needs >= ${SOLID_MIN_M} m, got ${r2(solidToM - solidFromM)}`);
  }
  if (!(lengthM - solidToM >= RUNOUT_MIN_M)) {
    errors.push(`the М1 span needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - solidToM)}`);
  }
  if (!(returnMarginM > 0 && returnMarginM <= warnM)) {
    errors.push(`returnMarginM must be > 0 and inside the ${r2(warnM)} m warning span, got ${returnMarginM}`);
  }
  if (errors.length > 0) throw new Error(`gen_ov_solid2 params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06 — the northbound lane center
  const laneOncomingM = r2(-laneRightM); // −4.06 — the bank the pass borrows
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125
  /** The meter the drill asks the driver to be home by. */
  const returnByY = r2(solidFromM - returnMarginM);

  const edgeId = `${idPrefix}-e-road`;
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
      // The rural 1+1 the overtake family lives on (the ov-oncoming-v1 rank).
      class: "tertiary",
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

  // The corridor/return trackers' arming precondition, as DATA: no junction
  // area exists anywhere, so nothing can disarm the adjudication by geometry.
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The one authored span the engine reads. One edge on x = 0 ⇒ arclength = y.
  const ZONES = [
    {
      id: `${idPrefix}-z-solidcenterline`,
      kind: "solidCenterLine",
      edgeId,
      fromM: r2(solidFromM),
      toM: r2(solidToM),
      signRef: KIND_TO_SIGN.solidCenterLine,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: SPAWN_Y,
      heading: 0,
      edgeId,
      name: "Начало — дясна лента зад бавната кола",
    },
    {
      // The drill's contract, as a coordinate: the last meter a lawful return
      // may land on with the authored margin still intact.
      id: `${idPrefix}-spawn-returnby`,
      x: laneRightM,
      y: returnByY,
      heading: 0,
      edgeId,
      name: "Прибери се дотук — преди началото на непрекъснатата линия",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — след зоната на М1",
    },
  ];

  // Visual anchors. One block at the warning span (the „прочети маркировката"
  // moment) and one alongside the М1 span, both clear of carriageway + sidewalk.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-warn-block`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), r2(warnFromM - 10)],
        [r2(-CLEAR), r2(warnFromM - 10)],
        [r2(-CLEAR), r2(solidFromM - 4)],
        [r2(-CLEAR - 22), r2(solidFromM - 4)],
      ],
    },
    {
      id: `${idPrefix}-b-solid-block`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(solidFromM + 10)],
        [r2(CLEAR + 24), r2(solidFromM + 10)],
        [r2(CLEAR + 24), r2(solidToM - 10)],
        [r2(CLEAR), r2(solidToM - 10)],
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
      banKind: "solidCenterLine",
      banFromM: r2(solidFromM),
      banToM: r2(solidToM),
      warnFromM: r2(warnFromM),
      returnMarginM,
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    laneCenterOncomingM: laneOncomingM,
    banZone: {
      id: ZONES[0].id,
      kind: "solidCenterLine",
      signRef: KIND_TO_SIGN.solidCenterLine,
      fromM: r2(solidFromM),
      toM: r2(solidToM),
    },
    /** The legal passing window: dashed М2 from the spawn to the М1 span. This
     *  is the quantity the template is about — it exists, it is generous, and
     *  it ends. */
    passWindowY: { fromY: SPAWN_Y, toY: r2(solidFromM), lengthM: r2(windowM), markingRef: DASHED_REF },
    /** The М2 предупредителна маркировка (удължени прекъсвания) — the last
     *  stretch of dashes before the wall. AUTHORED, UNGRADED: no ZoneKind
     *  carries it and no detector reads a marking (see the file header). The
     *  scenario copy and the objective gate carry it; `graded: false` says so
     *  out loud so no future template mistakes it for a detector. */
    warningDashSpanY: {
      fromY: r2(warnFromM),
      toY: r2(solidFromM),
      lengthM: r2(warnM),
      markingRef: DASHED_REF,
      lawRef: "Наредба № 2/2001 — надлъжна маркировка М2 (удължени прекъсвания)",
      graded: false,
    },
    /** The drill's own contract: be fully home by here, `returnMarginM` before
     *  the wall. The success gate is pinned to this meter. */
    returnByY,
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_ov_solid2.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен път с прекъсната и непрекъсната осева линия — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
    // The corridor's own arming law (worldRuntime ocArmed): a two-way edge with
    // >= 2 marked lanes. A one-way or a narrow road would hand the excursion to
    // a different adjudicator and this map would grade nothing it claims to.
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way road with ${lanes} marked lanes expected`);
  }
  // The clean-room law (the header): a junction area disarms BOTH the corridor
  // and the return tracker, and would acquit the cut this map exists to convict.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (the corridor's nearestIx disarm)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist");
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
  if (ZONES.length !== 1 || ZONES[0].kind !== "solidCenterLine") {
    post.push("this map MUST author exactly ONE solidCenterLine span — it is the wall the window closes against");
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  // THE map's reason to exist, as three assertions. Any of them failing turns
  // the district back into an ov-solid-v1 clone that cannot teach the timing.
  const zoneAt = (y) => ZONES.find((z) => y >= z.fromM && y < z.toM);
  if (zoneAt(SPAWN_Y)) post.push(`the spawn (y=${SPAWN_Y}) must sit on DASHED road — the window starts there`);
  if (zoneAt(returnByY)) post.push(`the return mark (y=${returnByY}) must sit on DASHED road — landing there is LAWFUL`);
  if (!zoneAt(r2(solidFromM + 1))) post.push(`the meter after the window (y=${r2(solidFromM + 1)}) must be inside the М1 span`);
  if (!(warnFromM < returnByY)) {
    post.push(`the warning dashes (y=${r2(warnFromM)}) must start BEFORE the return mark (y=${returnByY}) — the marking has to arrive in time to be read`);
  }
  if (!(scenario.warningDashSpanY.toY === scenario.banZone.fromM)) {
    post.push("the М2 warning span must run INTO the М1 span with no unmarked meter between (Наредба № 2/2001)");
  }
  if (scenario.warningDashSpanY.graded !== false) {
    post.push("the warning span is authored truth, not a detector — `graded` must stay false");
  }

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
    if (s.x !== laneRightM) post.push(`${s.id}: every spawn rides the own-lane center (${laneRightM})`);
  }
  const finish = SPAWN_POINTS.find((s) => s.id === `${idPrefix}-spawn-finish`);
  if (zoneAt(finish.y)) post.push(`the finish spawn (y=${finish.y}) must sit past the М1 span`);

  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  if (!(laneOncomingM < 0 && Math.abs(laneOncomingM) < halfRoadM)) post.push(`oncoming lane center ${laneOncomingM} outside the road`);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the carriageway`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_solid2 self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ov-solid2-v1",
    label: "Учебен път — прозорецът за изпреварване се затваря (сценарий OV-04)",
    idPrefix: "ovs2",
    lengthM: 620,
    maxspeedKmh: 90,
    solidFromM: 300,
    solidToM: 500,
    warnFromM: 240,
    returnMarginM: 30,
    noteBg:
      "Осевата линия е прекъсната (М2) до 300-ия метър и непрекъсната (М1) от 300-ия до 500-ия: изпреварвай в прозореца и се прибери изцяло вдясно най-късно на 270-ия метър. От 240-ия метър прекъсванията се удължават — това е предупреждението, че прозорецът свършва.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildSolidWindowRoad(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const s = district.meta.scenario;
  console.log(`=== solid-window build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("pass window (М2)", `y ∈ [${s.passWindowY.fromY}, ${s.passWindowY.toY}]  (${s.passWindowY.lengthM} m)`);
  line("warning dashes (М2)", `y ∈ [${s.warningDashSpanY.fromY}, ${s.warningDashSpanY.toY}]  graded=${s.warningDashSpanY.graded}`);
  line("wall (М1)", `y ∈ [${s.banZone.fromM}, ${s.banZone.toM}]  graded=true (CROSSED_SOLID_LINE)`);
  line("return by", `y = ${s.returnByY} (${params.returnMarginM} m of margin)`);
  line("intersections / crossings", `${district.intersections.length} / ${district.crossings.length} (corridor clean room)`);
  line("spawns", district.spawnPoints.map((sp) => sp.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
