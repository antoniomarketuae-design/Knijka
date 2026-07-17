/**
 * gen_mv_uturn.mjs — mv-uturn-v1, the U-TURN BAN map (doc 72 §10 OV-17
 * „Обратен завой" / §12 PK-12 „Обръщане"; ЗДвП чл. 38). The
 * gen_wide_boulevard.mjs mold (2+2 boulevard, one smooth forward arc reverses
 * direction — no reverse shunts) fused with the gen_ov_solid2.mjs `zones` layer,
 * pointed at the ONE thing neither map can teach:
 *
 *   wb-boulevard-v1 (shipped) is 200 m of empty boulevard with NOTHING on it.
 *   Every metre of it is a legal place to turn, so its drill („обръщане в едно
 *   движение", sc-maneuver-uturn) is pure vehicle control: the student is never
 *   asked WHERE.
 *   mv-uturn-v1 asks only that. Its first 220 m carry an М1 непрекъсната осева
 *   + a В23 „Забранено е завиването в обратна посока" posting — the boulevard
 *   is WIDE, the car would fit, and the turn is banned anyway. 150 m past the
 *   tempting spot the median opens at a real cross street, the marking is
 *   dashed, and the same maneuver is lawful. The drill is the READING.
 *
 * Layout (x = east, y = north; the boulevard runs south → north on x = 0, the
 * driver travels north — so edge arclength EQUALS district y along it):
 *
 *     mvu-n-end (0, 460)
 *         │
 *         │   run-out — 2+2 boulevard, dashed осева
 *         │
 *     mvu-n-gap (0, 280)  ═══ mvu-n-west (−88, 280)   THE LEGAL GAP
 *         │                    (cross street, Б2 on its mouth)
 *         │   dashed run-in — the marking opens for the turn   y = [220, 280]
 *         ▓   z-solidcenterline  М1 + В23                      y = [40, 220]
 *         ·   mvu-spawn-tempting (12.19, 130)   ← ЗАБРАНЕНО, and it looks fine
 *         │
 *     mvu-spawn-start (12.19, 15)
 *         │
 *     mvu-n-start (0, 0)
 *
 * WHY THE GAP IS A REAL JUNCTION AND NOT A BARE NODE. The graded U-turn needs
 * an adjudicator, and the only one that reads „обръщане срещу насрещния поток"
 * is the runtime's JU-10 left-turn-across-path tracker — which arms EXCLUSIVELY
 * inside a junction area (nearestIx !== null, 40 m; runtime/worldRuntime.ts).
 * Off a junction the same act falls to the overtake corridor instead, which
 * bills OVERTAKE_INSUFFICIENT_GAP — the head-on GAMBLE's code, a different law
 * (чл. 42) and a different lesson from чл. 38's „обърни се там, където е
 * разрешено". So the median opening is authored as what it is in Sofia: a cross
 * street. That single choice also DISARMS the corridor at the gap (its own
 * nearestIx exemption) — one act, one code, by construction.
 *
 * WHY THE BOULEVARD IS `primary` AND THE STEM `residential`. The stop-sign
 * heuristic (runtime/stoplines.ts: rank ≥ 4 meets rank ≤ 2) then derives a Б2
 * line on the STEM's mouth — which puts mvu-n-gap into `guardedNodeIds`, and a
 * guarded node is NOT an uncontrolled junction (worldRuntime `degree >= 3 &&
 * !guarded`). The right-hand-rule tracker therefore never arms on this map, so
 * no drive can pick up a phantom „предимство отдясно" FAILED_TO_YIELD next to
 * the чл. 38 one this map exists to grade. Two edges of the same primary
 * boulevard meeting the node stay arterial and derive no line of their own.
 *
 * WHY THE М1 SPAN STOPS 60 m SHORT OF THE NODE. The junction area reaches 40 m
 * back (JUNCTION_AREA_RADIUS_M) — an М1 span running into it would make the
 * BANNED marking and the LEGAL turn overlap on the same metres, and the
 * template's whole claim („плътна = НЕ, прекъсната = ДА") would stop being
 * readable off the map. 220 leaves 20 m of clearance under the junction area
 * and matches the ordinance's own habit of opening the marking before a turn.
 *
 * WHY THE В23 POSTING IS meta.scenario AND NOT A ZONE — the gen_ov_solid2.mjs
 * `warningDashSpanY` precedent, verbatim. No ZoneKind carries a U-turn ban
 * (runtime/district.ts), the world's sign pass has no В23 SignKind
 * (world/builders/zoneSigns.ts), and the ONE tick channel that names this ban —
 * `noUTurn` — is EDGE-scoped while the ban is SPAN-scoped: tagging mvu-e-ban
 * would declare the ban true on the 60 m of dashed run-in where this map's
 * whole lesson is that it has ENDED. (It grades nothing either way — no
 * detector reads it; rules/types.ts calls it surface-only.) So the posting is
 * authored where authored-but-ungraded truth goes, with `graded: false` said out
 * loud, and the GRADED wall stays what the law actually makes it: you cannot
 * turn there because you cannot cross the М1 (CROSSED_SOLID_LINE, чл. 42 +
 * Наредба № 2/2001). The day a `noUTurn` ZoneKind lands, this block is the
 * migration source and nothing else here changes.
 *
 * KNOWN RENDER GAP (honest — the gen_ov_solid2.mjs header precedent): the
 * markings builder paints no solid осева along an М1 span, and no В23 post
 * exists to place. The ban renders as ordinary boulevard today; the scenario
 * copy carries the teaching and the GRADING is exact regardless (authored
 * spans, never paint reads). Pinned as an assertion in
 * platform/src/modules/sim/world/__tests__/mv-uturn-districts.test.ts.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_mv_uturn.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** runtime/turns.ts JUNCTION_AREA_RADIUS_M — the reach of the left-turn tracker. */
const JUNCTION_AREA_M = 40;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** kind ↔ marking pairing law, inherited from gen_ban_zones.mjs / gen_ov_solid2.mjs. */
const KIND_TO_SIGN = {
  solidCenterLine: "М1",
};

/** The dashed осева the legal gap rides on — an authored label, not a ZoneKind. */
const DASHED_REF = "М2";

/** The В23 posting (content/signs/signs.json sign-v23). Authored, never graded. */
const UTURN_BAN_SIGN = {
  signRef: "В23",
  nameBg: "Забранено е завиването в обратна посока",
  lawRef: "Наредба № РД-02-21-1/23.11.2023 — прил. № 3, знак В23",
};

/**
 * @param {{
 *   districtId: string,      // output file name + ScenarioSpec.map.districtId
 *   label: string,           // human label (meta)
 *   idPrefix: string,        // node/edge/zone/spawn id prefix
 *   lengthM: number,         // boulevard length (start → end), m
 *   maxspeedKmh: number,     // legal limit on the boulevard
 *   banFromM: number,        // where the М1 span + В23 posting start, district y
 *   banToM: number,          // where the М1 span ends, district y
 *   temptingY: number,       // the „тук му е мястото" spot INSIDE the ban, district y
 *   gapY: number,            // the legal median gap (cross-street node), district y
 *   crossArmM: number,       // cross-street length west of the gap, m
 *   crossMaxKmh: number,     // legal limit on the cross street
 *   noteBg: string,          // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildUturnBanBoulevard(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    lengthM,
    maxspeedKmh,
    banFromM,
    banToM,
    temptingY,
    gapY,
    crossArmM,
    crossMaxKmh,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 300 && lengthM <= 1000)) errors.push(`lengthM must be within 300..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!(crossMaxKmh >= 20 && crossMaxKmh <= 50)) errors.push(`crossMaxKmh must be within 20..50, got ${crossMaxKmh}`);
  if (!(crossArmM >= 60 && crossArmM <= 400)) errors.push(`crossArmM must be within 60..400 m, got ${crossArmM}`);

  const SPAWN_Y = 15;

  // -- This map's own shape laws --------------------------------------------
  /** The ban must be long enough to be a STRETCH the driver reads and rejects,
   *  not a plate he passes in one second (4 s at the authored limit ≈ 55 m). */
  const BAN_MIN_M = 120;
  /**
   * THE law of this file. The lesson is „продължи до разрешения участък", and a
   * lesson about patience needs the patience to cost something: the legal gap
   * must sit far enough past the tempting spot that carrying on is a DECISION
   * the student feels. 150 m at 50 km/h ≈ 11 s of driving past a place the car
   * would have fitted. Anything under 100 m and „потърпи" becomes „изчакай малко".
   */
  const GAP_REACH_MIN_M = 100;
  /** The М1 span must clear the junction area, or the banned marking and the
   *  legal turn would overlap on the same metres (see the header). */
  const BAN_TO_JUNCTION_CLEAR_M = 15;
  /** Run-out past the gap so a drive that overshoots still has lawful road. */
  const RUNOUT_MIN_M = 100;

  if (!(banFromM > SPAWN_Y && banFromM < banToM)) {
    errors.push(`banFromM must sit past the spawn and before banToM, got ${banFromM}`);
  }
  if (!(banToM - banFromM >= BAN_MIN_M)) {
    errors.push(`the М1/В23 stretch needs >= ${BAN_MIN_M} m, got ${r2(banToM - banFromM)}`);
  }
  if (!(temptingY > banFromM && temptingY < banToM)) {
    errors.push(`temptingY must sit INSIDE the ban span [${banFromM}, ${banToM}], got ${temptingY}`);
  }
  const gapReachM = gapY - temptingY;
  if (!(gapReachM >= GAP_REACH_MIN_M)) {
    errors.push(`the legal gap must sit >= ${GAP_REACH_MIN_M} m past the tempting spot, got ${r2(gapReachM)}`);
  }
  if (!(gapY - banToM >= JUNCTION_AREA_M + BAN_TO_JUNCTION_CLEAR_M)) {
    errors.push(
      `the М1 span must end >= ${JUNCTION_AREA_M + BAN_TO_JUNCTION_CLEAR_M} m before the gap ` +
        `(the ${JUNCTION_AREA_M} m junction area + clearance), got ${r2(gapY - banToM)}`,
    );
  }
  if (!(lengthM - gapY >= RUNOUT_MIN_M)) {
    errors.push(`the gap needs >= ${RUNOUT_MIN_M} m of run-out, got ${r2(lengthM - gapY)}`);
  }
  if (errors.length > 0) throw new Error(`gen_mv_uturn params invalid:\n  - ${errors.join("\n  - ")}`);

  const LANES = 4; // 2 per direction — the boulevard standard (gen_wide_boulevard)
  const lanesPerDir = LANES / 2;
  const halfRoadM = r2(lanesPerDir * SCALED_LANE_W); // 16.25
  // Procedural lane-bank centres (mirror runtime/locator.computeLane AND
  // traffic/graph.laneOffsetFor — the staged stream rides the OUTER one).
  const laneCenterOuterM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 12.19
  const laneCenterInnerM = r2(0.5 * SCALED_LANE_W); // 4.06
  const crossHalfRoadM = r2(1 * SCALED_LANE_W); // 2 lanes total = 8.125

  const banEdgeId = `${idPrefix}-e-ban`;
  const beyondEdgeId = `${idPrefix}-e-beyond`;
  const crossEdgeId = `${idPrefix}-e-cross`;

  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-gap`]: [0, gapY],
    [`${idPrefix}-n-end`]: [0, lengthM],
    [`${idPrefix}-n-west`]: [r2(-crossArmM), gapY],
  };

  const edge = (id, from, to, cls, lanes, maxspeed, name) => {
    const geometry = [
      [r2(NODES[from][0]), r2(NODES[from][1])],
      [r2(NODES[to][0]), r2(NODES[to][1])],
    ];
    return {
      id,
      from,
      to,
      class: cls,
      name,
      oneway: false,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const EDGES = [
    // The two halves of ONE boulevard, split at the junction the median gap is.
    edge(banEdgeId, `${idPrefix}-n-start`, `${idPrefix}-n-gap`, "primary", LANES, maxspeedKmh, label),
    edge(beyondEdgeId, `${idPrefix}-n-gap`, `${idPrefix}-n-end`, "primary", LANES, maxspeedKmh, label),
    // The cross street — the gap's reason to exist, and the Б2 the heuristic
    // derives on its mouth is what keeps mvu-n-gap out of uncontrolledJunctions.
    edge(crossEdgeId, `${idPrefix}-n-west`, `${idPrefix}-n-gap`, "residential", 2, crossMaxKmh, "Странична улица към отвора"),
  ];

  const INTERSECTIONS = [
    { id: `${idPrefix}-n-gap`, x: 0, y: r2(gapY), degree: 3, signalized: false },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The one authored span the engine reads. The ban edge lies on x = 0 from
  // y = 0, so its arclength EQUALS district y.
  const ZONES = [
    {
      id: `${idPrefix}-z-solidcenterline`,
      kind: "solidCenterLine",
      edgeId: banEdgeId,
      fromM: r2(banFromM),
      toM: r2(banToM),
      signRef: KIND_TO_SIGN.solidCenterLine,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneCenterOuterM,
      y: SPAWN_Y,
      heading: 0,
      edgeId: banEdgeId,
      name: "Начало на булеварда — дясна лента",
    },
    {
      // The drill's antagonist, as a coordinate: wide, empty, inviting — and
      // banned. The template's teach copy and the shadow's „подмини" beat are
      // both pinned to this metre.
      id: `${idPrefix}-spawn-tempting`,
      x: laneCenterOuterM,
      y: r2(temptingY),
      heading: 0,
      edgeId: banEdgeId,
      name: "Изкушаващото място — плътна осева и В23: обратният завой е ЗАБРАНЕН",
    },
    {
      // The lawful place, in the INNER lane: обръщането се започва от лентата
      // до осевата, не от бордюра.
      id: `${idPrefix}-spawn-gap`,
      x: laneCenterInnerM,
      y: r2(gapY - 18),
      heading: 0,
      edgeId: banEdgeId,
      name: "Разрешеният отвор — вътрешна лента преди страничната улица",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: r2(-laneCenterOuterM),
      y: r2(gapY - 30),
      heading: 180,
      edgeId: banEdgeId,
      name: "Контролна точка — обратната посока след завоя",
    },
  ];

  // Visual anchors. One block alongside the ban stretch (the „прочети мястото"
  // moment) and one at the far corner of the cross street; both clear of every
  // carriageway + sidewalk.
  const CLEAR = halfRoadM + 6;
  const CROSS_CLEAR = crossHalfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-ban-block`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(banFromM + 10)],
        [r2(CLEAR + 24), r2(banFromM + 10)],
        [r2(CLEAR + 24), r2(banToM - 10)],
        [r2(CLEAR), r2(banToM - 10)],
      ],
    },
    {
      id: `${idPrefix}-b-corner-block`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 40), r2(gapY + CROSS_CLEAR)],
        [r2(-CLEAR - 16), r2(gapY + CROSS_CLEAR)],
        [r2(-CLEAR - 16), r2(gapY + CROSS_CLEAR + 26)],
        [r2(-CLEAR - 40), r2(gapY + CROSS_CLEAR + 26)],
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
    // MapArchetype vocabulary: a (wide) straight two-way street — the cross
    // street is the median gap's mechanism, not a junction drill of its own.
    archetype: "straight-street",
    params: {
      lengthM,
      maxspeedKmh,
      lanes: LANES,
      banFromM: r2(banFromM),
      banToM: r2(banToM),
      temptingY: r2(temptingY),
      gapY: r2(gapY),
    },
    lanesPerDirection: lanesPerDir,
    laneCenterOuterM,
    laneCenterInnerM,
    junctionNodeId: `${idPrefix}-n-gap`,
    /** What the runtime must derive at the gap from the classes above: a Б2 on
     *  the stem, which is what keeps the node OUT of uncontrolledJunctions
     *  (see the header). The battery asserts both halves. */
    expectedControl: "stopSignOnMinor",
    /** The GRADED wall: crossing it bills CROSSED_SOLID_LINE (опасна). This is
     *  why the U-turn at the tempting spot is impossible in law, not merely
     *  discouraged. */
    banZone: {
      id: ZONES[0].id,
      kind: "solidCenterLine",
      signRef: KIND_TO_SIGN.solidCenterLine,
      fromM: r2(banFromM),
      toM: r2(banToM),
    },
    /** The В23 posting over the same span. AUTHORED, UNGRADED: no ZoneKind
     *  carries a U-turn ban, no SignKind renders one, and the `noUTurn` tick
     *  channel is edge-scoped while this ban is span-scoped (see the header).
     *  `graded: false` says so out loud so no future template mistakes it for a
     *  detector. */
    uturnBanSign: {
      ...UTURN_BAN_SIGN,
      atY: r2(banFromM),
      spanY: { fromY: r2(banFromM), toY: r2(banToM) },
      graded: false,
    },
    /** The place the drill is ABOUT: wide enough, empty enough, and banned. */
    temptingSpotY: r2(temptingY),
    /** The lawful alternative and what patience costs to reach it. */
    legalGapY: r2(gapY),
    gapReachM: r2(gapReachM),
    /** The dashed run-in: the marking that says the ban is over. */
    dashedRunInY: { fromY: r2(banToM), toY: r2(gapY), lengthM: r2(gapY - banToM), markingRef: DASHED_REF },
    /** The turn box the ScenarioSpec's completeManeuver corridor is pinned to.
     *  halfLength 20 (not the wb-boulevard-v1 14) because the arc that starts
     *  from a STANDSTILL in the inner lane lands its exit ~16 m short of the
     *  node — a 14 m box would grade the lawful turn as „не си в кутията". */
    uturnCorridor: { x: 0, y: r2(gapY), halfWidthM: 15, halfLengthM: 20 },
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_mv_uturn.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен булевард със забранен и разрешен обратен завой — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
  // Self-validation — the gen_ban_zones/gen_t_junction invariants + this map's
  // own laws (the ones a silent edit would break without failing a type check).
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeById = new Map(EDGES.map((e) => [e.id, e]));
  const degree = new Map();
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== r2(NODES[e.from][0]) || g0[1] !== r2(NODES[e.from][1])) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== r2(NODES[e.to][0]) || gn[1] !== r2(NODES[e.to][1])) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.oneway) post.push(`${e.id}: every edge here is two-way (the осева is the subject)`);
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
  }
  // The boulevard's own arming law (the CROSSED_SOLID_LINE channel + the
  // single-arc premise): 2+2 marked lanes, two-way, on BOTH halves.
  for (const id of [banEdgeId, beyondEdgeId]) {
    const e = edgeById.get(id);
    if (!e || e.lanes !== LANES) post.push(`${id}: the archetype is a two-way 2+2 boulevard (lanes ${LANES})`);
  }

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
    post.push("this map MUST author exactly ONE solidCenterLine span — it is the ban, in law");
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  // THE map's reason to exist, as assertions. Any of them failing turns the
  // district back into a wb-boulevard-v1 clone that cannot teach the reading.
  const zoneAt = (y) => ZONES.find((z) => y >= z.fromM && y <= z.toM);
  if (!zoneAt(temptingY)) post.push(`the tempting spot (y=${temptingY}) must sit INSIDE the М1 span — that IS the drill`);
  if (zoneAt(gapY)) post.push(`the legal gap (y=${gapY}) must sit on DASHED road — turning there is LAWFUL`);
  if (zoneAt(SPAWN_Y)) post.push(`the spawn (y=${SPAWN_Y}) must sit on dashed road — the ban starts ahead, and is READ`);
  if (!(scenario.dashedRunInY.fromY === scenario.banZone.toM && scenario.dashedRunInY.toY === scenario.legalGapY)) {
    post.push("the dashed run-in must run from the М1 span's end to the gap with no unmarked metre between");
  }
  if (scenario.uturnBanSign.graded !== false) {
    post.push("the В23 posting is authored truth, not a detector — `graded` must stay false");
  }
  // The JU-10 arming law, as data: the turn box sits INSIDE the junction area
  // (or the left-turn tracker never adjudicates the graded U-turn at all) and
  // the ban stretch sits OUTSIDE it (or the two acts overlap — see the header).
  if (!(Math.abs(scenario.uturnCorridor.y - gapY) < 0.01)) post.push("the turn corridor must be centred on the gap node");
  if (!(scenario.uturnCorridor.halfLengthM < JUNCTION_AREA_M)) {
    post.push(`the turn corridor must stay inside the ${JUNCTION_AREA_M} m junction area (the JU-10 tracker's reach)`);
  }
  if (!(gapY - JUNCTION_AREA_M > banToM)) {
    post.push(`the junction area (from y=${r2(gapY - JUNCTION_AREA_M)}) must start past the М1 span (ends y=${banToM})`);
  }
  // The control-derivation preconditions (mirrors runtime/stoplines.ts ranks).
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  if ((RANK[edgeById.get(banEdgeId).class] ?? 2) < 5 || (RANK[edgeById.get(beyondEdgeId).class] ?? 2) < 5) {
    post.push("the boulevard must be PRIMARY: the derived Б2 on the stem is what keeps the gap out of uncontrolledJunctions");
  }
  if ((RANK[edgeById.get(crossEdgeId).class] ?? 2) > 2) {
    post.push("the cross street must stay rank <= 2 for the stop-sign heuristic to fire on it");
  }
  if (INTERSECTIONS.length !== 1 || INTERSECTIONS[0].signalized) {
    post.push("exactly ONE unsignalized junction: the median gap (a signal would hand the turn to a different tracker)");
  }
  if (CROSSINGS.length !== 0 || ROUNDABOUTS.length !== 0) {
    post.push("no crossing and no roundabout — the drill is the marking and the gap, nothing else");
  }

  for (const s of SPAWN_POINTS) {
    const host = edgeById.get(s.edgeId);
    if (!host) {
      post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
      continue;
    }
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
    if (![laneCenterOuterM, -laneCenterOuterM, laneCenterInnerM, -laneCenterInnerM].includes(s.x)) {
      post.push(`${s.id}: every spawn rides a lane-bank centre, got x=${s.x}`);
    }
  }
  if (!(laneCenterOuterM > laneCenterInnerM && laneCenterOuterM < halfRoadM)) {
    post.push(`lane-bank centres ${laneCenterInnerM}/${laneCenterOuterM} outside the ${halfRoadM} m half-road`);
  }
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the boulevard`);
      if (Math.abs(y - gapY) <= crossHalfRoadM && x <= 0 && x >= -crossArmM) {
        post.push(`${bl.id}: footprint on the cross street`);
      }
    }
  }
  // Routable (non-service) connectivity: one component.
  {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    const routable = EDGES.filter((e) => e.class !== "service");
    for (const e of routable) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const start = routable[0].from;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const v = queue.pop();
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
    }
    const routableNodes = new Set(routable.flatMap((e) => [e.from, e.to]));
    if (seen.size !== routableNodes.size) post.push("routable network split");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_mv_uturn self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (the OV-17/PK-12 U-turn-ban boulevard)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mv-uturn-v1",
    label: "Учебен булевард — къде обратният завой е забранен (сценарий OV-17/PK-12)",
    idPrefix: "mvu",
    // 340 m of boulevard NORTH of the gap is not run-out padding: it is the road
    // the насрещен поток comes DOWN. A staged oncoming stream holds on the path
    // and is released by the player's first movement, so the metre a car starts
    // at IS the second it reaches the gap — and this drill's whole shadow is a
    // driver arriving at the opening and WAITING. Shorten the north arm and the
    // stream has already gone by the time patience could cost anything.
    lengthM: 620,
    maxspeedKmh: 50,
    banFromM: 40,
    banToM: 220,
    temptingY: 130,
    gapY: 280,
    crossArmM: 88,
    crossMaxKmh: 30,
    noteBg:
      "От 40-ия до 220-ия метър осевата е непрекъсната (М1) и е поставен знак В23 „Забранено е завиването в обратна посока“: платното е широко, но обратният завой ТАМ е забранен. От 220-ия метър маркировката се прекъсва, а на 280-ия метър разделителната ивица се отваря при страничната улица — там обръщането е разрешено, с пълен оглед и пропускане на насрещните.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildUturnBanBoulevard(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const s = district.meta.scenario;
  console.log(`=== u-turn-ban build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("ban (М1 + В23)", `y ∈ [${s.banZone.fromM}, ${s.banZone.toM}]  graded=CROSSED_SOLID_LINE / sign graded=${s.uturnBanSign.graded}`);
  line("tempting spot", `y = ${s.temptingSpotY} (banned, and it looks fine)`);
  line("dashed run-in (М2)", `y ∈ [${s.dashedRunInY.fromY}, ${s.dashedRunInY.toY}]  (${s.dashedRunInY.lengthM} m)`);
  line("legal gap", `y = ${s.legalGapY} — ${s.gapReachM} m of patience past the temptation`);
  line("junction / control", `${s.junctionNodeId} (degree 3) → ${s.expectedControl}`);
  line("outer / inner lane", `${s.laneCenterOuterM} / ${s.laneCenterInnerM} m east`);
  line("spawns", district.spawnPoints.map((sp) => sp.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
