/**
 * gen_pk_banx.mjs — pk-banx-v1, the LAW-IMPLIED ban map (doc 72 §11 archetype
 * PK-06 „спиране в забранена зона", ЗДвП чл. 98, ал. 1). The gen_ban_zones.mjs
 * mold (same `zones` layer, same self-validating shape), with the one
 * difference that IS the template:
 *
 *   pk-ban-v1 (shipped) bans by SIGN — a В27 plate marks the span, and the
 *   drill is "read the plate". pk-banx-v1 bans by LAW — no plate exists; the
 *   ZEBRA and the JUNCTION CORNER are themselves the ban, and the drill is
 *   "know чл. 98 without being told". Same detector, opposite cue.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength runs WITH travel on every edge):
 *
 *     pkx-n-end (0, 360)
 *         │
 *         ·  legal curb bay        y = 300   (outside every span — the goal)
 *         │
 *         ═  pkx-x-zebra           y = 260   marked zebra, unsignalized
 *         ▓  z-zebra   чл. 98 т.1  y = [255, 262.5]
 *         │
 *         ▓  z-jx-after  чл. 98 т.2  y = [150, 163.13]
 *   ──────┼──────  pkx-n-jx (0, 150)  degree 4, UNSIGNALIZED
 *         ▓  z-jx-before чл. 98 т.2  y = [136.88, 150]
 *         │
 *     pkx-spawn-start (4.06, 15)
 *         │
 *     pkx-n-start (0, 0)
 *
 * WHY THE JUNCTION BAN IS TWO SPANS, NOT ONE: a DistrictZone span is an
 * arclength range on ONE edge (runtime/district.ts), and the junction node
 * splits the street into two edges. чл. 98 ал. 1 т. 2 bans stopping „на
 * кръстовищата и на по-малко от 5 метра от тях" — BOTH sides — so the one
 * legal rule is authored as its two natural halves, one per approach edge.
 * The schema forces the shape; the law justifies it.
 *
 * WHY NOTHING IS SIGNALIZED / ARTERIAL: the ILLEGAL_STOP_IN_BAN_ZONE detector
 * is structurally innocent wherever a stop is traffic-shaped (a queue lead, a
 * stop line within 25 m, any forbidding signal). Every edge here is
 * `residential` (CLASS_RANK 2 < ARTERIAL_MIN_RANK 4) and the junction is
 * unsignalized, so buildStopLines emits NOTHING and no FP-armor case is
 * disturbed: a rest in a span is the authored fault and nothing else.
 *
 * KNOWN GAPS (honest — the gen_ban_zones.mjs header precedent):
 *  - RENDER: builders/zoneSigns.ts posts a В27 face at the START of every
 *    `noStopping` span, because until now every such span WAS sign-posted.
 *    This map's spans are law-implied and carry no plate in reality, so the
 *    three posts it places are wrong-but-harmless furniture (render-only —
 *    grading reads the spans, never the posts). The fix is a `posted?:
 *    boolean` on DistrictZone (default true ⇒ every shipped map byte-
 *    identical) that zoneSigns honours; not taken here — shared file.
 *  - GRADING: the z-zebra span does not currently convict. The detector
 *    requires `s.crossing === null`, and CrossingZoneTracker arms ~35 m out
 *    from any zebra, so EVERY rest in the 5 m before a crossing reads as a
 *    (possibly lawful) yielding stop. The span is authored anyway: it is
 *    correct чл. 98 data and it grades the moment the armor narrows to
 *    „a pedestrian was actually seen". The district battery pins today's
 *    behaviour so the flip is a visible, deliberate change.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_banx.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** ЗДвП чл. 98, ал. 1 — the statutory clear distance, real meters. */
const LAW_CLEAR_M = 5;
/** Half-width of the painted zebra band, m (the span covers the band itself:
 *  чл. 98 bans stopping ON the crossing as well as before it). */
const ZEBRA_BAND_HALF_M = 2.5;

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
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn id prefix
 *   junctionY: number,      // the unsignalized cross street, district y
 *   zebraY: number,         // the marked crossing, district y
 *   legalBayY: number,      // the one legal stopping mark, district y
 *   lengthM: number,        // main-street length
 *   crossArmM: number,      // cross-street arm length each side
 *   maxspeedKmh: number,    // legal limit
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildLawBanStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    junctionY,
    zebraY,
    legalBayY,
    lengthM,
    crossArmM,
    maxspeedKmh,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!(crossArmM >= 40 && crossArmM <= 200)) errors.push(`crossArmM must be within 40..200 m, got ${crossArmM}`);
  if (!(junctionY >= 60)) errors.push(`junctionY needs >= 60 m of approach, got ${junctionY}`);
  if (!(zebraY > junctionY && legalBayY > zebraY && legalBayY <= lengthM - 40)) {
    errors.push(`expected junctionY < zebraY < legalBayY <= ${lengthM - 40}, got ${junctionY}/${zebraY}/${legalBayY}`);
  }

  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06 — the single northbound lane center
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  // The junction ban reaches the statutory 5 m PAST the junction body, whose
  // extent is the cross street's half-width (чл. 98 ал. 1 т. 2).
  const jxBanM = r2(halfRoadM + LAW_CLEAR_M);

  // -- The two structural separations the whole template rests on ------------
  // (1) A graded junction rest must be clear of the zebra's ~35 m crossing-arm
  //     radius, or the detector's yielding-stop armor silently acquits it.
  // (2) The legal bay must be clear of the zebra's 38 m zone-exit radius AND
  //     of every ban span, or the shadow's lawful stop is not provably lawful.
  const CROSSING_ARM_R_M = 35; // runtime/zones.ts CROSSING_ZONE_RADIUS_M
  const CROSSING_EXIT_R_M = 38; // runtime/zones.ts ZONE_EXIT_RADIUS_M
  if (zebraY - (junctionY + jxBanM) <= CROSSING_ARM_R_M) {
    errors.push(
      `the junction ban must end > ${CROSSING_ARM_R_M} m before the zebra (crossing-arm armor), ` +
        `got ${r2(zebraY - (junctionY + jxBanM))} m`,
    );
  }
  if (legalBayY - zebraY <= CROSSING_EXIT_R_M) {
    errors.push(
      `the legal bay must sit > ${CROSSING_EXIT_R_M} m past the zebra (zone-exit radius), ` +
        `got ${r2(legalBayY - zebraY)} m`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_pk_banx params invalid:\n  - ${errors.join("\n  - ")}`);

  const eStreetS = `${idPrefix}-e-street-s`; // start → junction
  const eStreetN = `${idPrefix}-e-street-n`; // junction → end
  const eCrossW = `${idPrefix}-e-cross-w`;
  const eCrossE = `${idPrefix}-e-cross-e`;
  const nJx = `${idPrefix}-n-jx`;

  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [nJx]: [0, junctionY],
    [`${idPrefix}-n-end`]: [0, lengthM],
    [`${idPrefix}-n-cross-w`]: [-crossArmM, junctionY],
    [`${idPrefix}-n-cross-e`]: [crossArmM, junctionY],
  };

  /** Every edge is authored from → to ALONG the driver's travel, so edge
   *  arclength (the Locator's sM) increases northward / eastward — the
   *  property the zone spans below are written against. */
  const mkEdge = (id, from, to, name) => {
    const geometry = [NODES[from], NODES[to]];
    return {
      id,
      from,
      to,
      class: "residential", // CLASS_RANK 2 — below ARTERIAL_MIN_RANK: no stop lines
      name,
      oneway: false,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };
  const EDGES = [
    mkEdge(eStreetS, `${idPrefix}-n-start`, nJx, label),
    mkEdge(eStreetN, nJx, `${idPrefix}-n-end`, label),
    mkEdge(eCrossW, `${idPrefix}-n-cross-w`, nJx, "Напречна улица (запад)"),
    mkEdge(eCrossE, nJx, `${idPrefix}-n-cross-e`, "Напречна улица (изток)"),
  ];

  // -- The unsignalized equal junction: the ban's REASON, not its decoration.
  const INTERSECTIONS = [
    { id: nJx, x: 0, y: r2(junctionY), degree: 4, signalized: false },
  ];

  // -- The marked crossing: likewise the ban's reason (CrossingZoneTracker
  // derives its zone from exactly this entry).
  const CROSSINGS = [
    {
      id: `${idPrefix}-x-zebra`,
      x: 0,
      y: r2(zebraY),
      kind: "marked",
      signalized: false,
      edgeId: eStreetN,
    },
  ];
  const ROUNDABOUTS = [];

  // -- The authored bans. Arclength is measured on the HOST edge: street-s
  // runs 0..junctionY, street-n runs 0..(lengthM - junctionY), both northward.
  const zebraS = r2(zebraY - junctionY); // the zebra's arclength on street-n
  const ZONES = [
    {
      // чл. 98 ал. 1 т. 2 — approaching half: the last 5 m + the junction body.
      id: `${idPrefix}-z-jx-before`,
      kind: "noStopping",
      edgeId: eStreetS,
      fromM: r2(junctionY - jxBanM),
      toM: r2(junctionY),
      signRef: "ЗДвП-98-1-2",
    },
    {
      // чл. 98 ал. 1 т. 2 — departing half: the corner and the 5 m past it.
      id: `${idPrefix}-z-jx-after`,
      kind: "noStopping",
      edgeId: eStreetN,
      fromM: 0,
      toM: jxBanM,
      signRef: "ЗДвП-98-1-2",
    },
    {
      // чл. 98 ал. 1 т. 1 — the crossing itself + the 5 m before it.
      id: `${idPrefix}-z-zebra`,
      kind: "noStopping",
      edgeId: eStreetN,
      fromM: r2(zebraS - LAW_CLEAR_M),
      toM: r2(zebraS + ZEBRA_BAND_HALF_M),
      signRef: "ЗДвП-98-1-1",
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId: eStreetS,
      name: "Начало — дясна лента",
    },
    {
      id: `${idPrefix}-spawn-bay`,
      x: laneRightM,
      y: r2(legalBayY),
      heading: 0,
      edgeId: eStreetN,
      name: "Разрешено място за престой — след пътеката",
    },
  ];

  // -- Corner blocks: the visual anchors that make the corner READ as a corner
  // (the whole cue of this map). Clear of both carriageways + sidewalks.
  const CLEAR = halfRoadM + 6;
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-corner-nw`,
      height: 12,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 26), r2(junctionY + CLEAR)],
        [r2(-CLEAR), r2(junctionY + CLEAR)],
        [r2(-CLEAR), r2(junctionY + CLEAR + 26)],
        [r2(-CLEAR - 26), r2(junctionY + CLEAR + 26)],
      ],
    },
    {
      id: `${idPrefix}-b-corner-se`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(CLEAR), r2(junctionY - CLEAR - 26)],
        [r2(CLEAR + 26), r2(junctionY - CLEAR - 26)],
        [r2(CLEAR + 26), r2(junctionY - CLEAR)],
        [r2(CLEAR), r2(junctionY - CLEAR)],
      ],
    },
    {
      id: `${idPrefix}-b-shop-zebra`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 20), r2(zebraY - 30)],
        [r2(-CLEAR), r2(zebraY - 30)],
        [r2(-CLEAR), r2(zebraY - 10)],
        [r2(-CLEAR - 20), r2(zebraY - 10)],
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
    archetype: "x-junction",
    params: {
      lengthM,
      maxspeedKmh,
      junctionY,
      zebraY,
      legalBayY,
      banKind: "noStopping",
      banBasis: "law", // чл. 98 — no plate posts these spans
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    primaryCrossingId: CROSSINGS[0].id,
    junctionNodeId: nJx,
    /** District-y (not edge-arclength) view of every ban — what the
     *  ScenarioSpec and the trace scripts are written against. */
    banZonesY: [
      { id: ZONES[0].id, lawRef: "ЗДвП чл. 98, ал. 1, т. 2", fromY: r2(junctionY - jxBanM), toY: r2(junctionY) },
      { id: ZONES[1].id, lawRef: "ЗДвП чл. 98, ал. 1, т. 2", fromY: r2(junctionY), toY: r2(junctionY + jxBanM) },
      { id: ZONES[2].id, lawRef: "ЗДвП чл. 98, ал. 1, т. 1", fromY: r2(zebraY - LAW_CLEAR_M), toY: r2(zebraY + ZEBRA_BAND_HALF_M) },
    ],
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_banx.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица със законови забрани за престой — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
    // The no-stop-line law: any arterial-ranked edge here would make
    // buildStopLines post a stop sign and silently acquit every graded rest.
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The junction must be a REAL degree-4 node: the ban has to have a reason.
  const incident = EDGES.filter((e) => e.from === nJx || e.to === nJx);
  if (incident.length !== 4) post.push(`${nJx}: degree 4 expected, ${incident.length} edges incident`);
  if (INTERSECTIONS[0].degree !== incident.length) post.push(`${nJx}: declared degree != incident edges`);
  if (INTERSECTIONS.some((it) => it.signalized)) post.push("no junction may be signalized (FP armor)");
  if (CROSSINGS.some((c) => c.signalized)) post.push("no crossing may be signalized (FP armor)");

  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (z.kind !== "noStopping") post.push(`${z.id}: every span here is a чл. 98 noStopping ban`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  // Distinct spans (the two mistake demos must be able to rest in DIFFERENT
  // zones) and distinct ids.
  if (new Set(ZONES.map((z) => z.id)).size !== ZONES.length) post.push("zone ids must be unique");
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");

  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.edgeId !== eStreetN) post.push(`${c.id}: the zebra hosts on the northern street edge`);
    if (zebraS < 60) post.push(`${c.id}: needs >= 60 m of approach on its host edge`);
  }
  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // The legal bay is the shadow's target: it must be OUTSIDE every ban.
  const bayS = r2(legalBayY - junctionY);
  for (const z of ZONES) {
    if (z.edgeId === eStreetN && bayS >= z.fromM && bayS <= z.toM) {
      post.push(`the legal bay (y=${legalBayY}) rests inside ${z.id} — it must be legal`);
    }
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  // Buildings must not sit on either carriageway.
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the main carriageway`);
      if (Math.abs(y - junctionY) <= halfRoadM && Math.abs(x) <= crossArmM) post.push(`${bl.id}: footprint on the cross street`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pk_banx self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-banx-v1",
    label: "Учебна улица — престой до пътека и кръстовище (сценарий PK-06)",
    idPrefix: "pkx",
    junctionY: 150,
    zebraY: 260,
    legalBayY: 300,
    lengthM: 360,
    crossArmM: 70,
    maxspeedKmh: 50,
    noteBg:
      "Забраните тук не са поставени със знак — те следват от закона: чл. 98 забранява престоя на кръстовището и на по-малко от 5 м от него, както и на пешеходната пътека и на 5 м преди нея. Разрешеното място е след пътеката.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildLawBanStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== law-ban build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("junction (unsignalized)", `y = ${params.junctionY}, degree 4`);
  line("zebra (marked)", `y = ${params.zebraY}`);
  line("legal bay", `y = ${params.legalBayY}`);
  for (const z of district.meta.scenario.banZonesY) {
    line(z.id, `y ∈ [${z.fromY}, ${z.toY}]  (${z.lawRef})`);
  }
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
