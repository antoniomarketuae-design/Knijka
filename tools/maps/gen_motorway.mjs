/**
 * gen_motorway.mjs — the MOTORWAY-SEGMENT micro-map (Scenario Studio doc 76
 * §3; doc 72 §8 archetype SP-10 „Минимална скорост на магистрала" + the OV-11
 * keep-right discipline at speed). The map archetype id "motorway-segment"
 * has been reserved in scenario/types.ts MAP_ARCHETYPES since the vocabulary
 * shipped — this generator brings it alive.
 *
 *   - mw-v1 „Автомагистрала" (SP-10 / OV-11): a DIVIDED 2+2 motorway — two
 *     one-way carriageways of 3 marked lanes each (the curb lane is the
 *     ЛЕНТА ЗА ПРИНУДИТЕЛНО СПИРАНЕ + 2 travel lanes), posted the honest
 *     ЗДвП чл. 21 motorway 140 for category B, ~1000 m straight (long enough
 *     for honest high-speed stories — see the recorder-envelope assert), a
 *     6 m median. NO junctions, crossings, signals or signs: the only things
 *     the rule engine can grade are the driver's own speed and lane choice.
 *
 * THE EMERGENCY LANE, honestly: it is expressed as the carriageway's CURB
 * LANE (laneId 0 — the Locator's own lane bank; `lanes: 3` per direction)
 * covered by a zone span kind "emergencyLane" — the busLane data seam,
 * mirrored. That grades cleanly through the committed lane fix (laneId +
 * span membership), exactly like maxspeed does; the alternative (off-road
 * shoulder geometry) would grade as POOR_LANE_KEEPING/off-road — the wrong
 * code for a real, named fault. Effects downstream:
 *   - EMERGENCY_LANE_DRIVING (опасна, ЗДвП чл. 58, т. 3) on sustained travel
 *     in laneId 0 (rules/engine.ts — the detector this slice ships);
 *   - the keep-right detector's rightmost REQUIRED lane becomes laneId 1
 *     (the busLaneRight exemption seam), so NOT_KEEPING_RIGHT grades the
 *     2-travel-lane story with zero new code (the ln-v1 precedent).
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; the
 * `zones` array is additive; kind "emergencyLane" needs no extra fields;
 * meta.zonesVersion stays 1. The edge-level `motorway: true` tag is additive
 * generator data (the noOvertake/noUTurn surface-tag discipline) — it flows
 * onto SimTick.motorway and arms DRIVING_TOO_SLOW_FOR_MOTORWAY; no shipped
 * map carries it, which is what makes the detector's default-ON structural.
 *
 * LAW NOTES (verified against content/, see rules/catalog.ts):
 *   - 140 on АМ: ЗДвП чл. 21 (magistrali question bank);
 *   - emergency-lane ban: ЗДвП чл. 58, т. 3 (q-magistrali-…-009 verbatim);
 *   - NO general motorway minimum exists — чл. 54 admits only vehicles
 *     constructively capable of > 50 km/h (q-magistrali-…-026), so the crawl
 *     detector grades the SP-10 flow-differential fault against that 50 line
 *     as второстепенна, not a phantom absolute limit.
 *
 * THE М2 LINE, no longer a gap: this header used to record that the emergency
 * lane „renders as a third marked lane", and the founder's verdict-board note
 * on sc-hz-breakdown-pulloff said the same in his words („the marking on the
 * road is not showing it either"). builders/markings.ts now paints the span's
 * inner boundary with EMERGENCY_LANE_SEAM_WIDTH_M — the wide continuous М2 —
 * and, because `motorway` is deliberately outside ARTERIAL_CLASSES (no street
 * furniture on a motorway) so nothing drew the outside either, the carriageway
 * EDGE line on the curb side as well. The shoulder is therefore bounded on both
 * sides by paint that is not a lane divider, which is what makes it read as the
 * лента за принудително спиране rather than a lane you may use. The zone data
 * did not move, so no verdict moved: EMERGENCY_LANE_DRIVING still grades laneId
 * 0 ∈ span. Agreement battery: sim/world/__tests__/sign-marking-agreement.test.ts.
 *
 * KNOWN VISUAL GAP (honest, the gen_rural_curve А1 precedent): no Д5
 * „Автомагистрала" sign asset exists — content/signs/svg/d5.svg is authored but
 * tools/blender/signs.py never bakes it into a GLB, and world/types.ts has no
 * matching SignKind. Posting a face the kit does not ship would be the same
 * class of lie the М2 fix above exists to remove, so the scenario copy carries
 * the sign teaching until that asset drop.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_motorway.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Kinematic recorder envelope (traces/recorder.ts) — asserted against so a
 *  param change that makes the authored 130 km/h stories physically dishonest
 *  fails the BUILD, not the demo: accel 2.2 m/s², stop envelope 0.7 × 4.6. */
const RECORDER_ACCEL_MPS2 = 2.2;
const RECORDER_STOP_MPS2 = 4.6 * 0.7;
/** The fastest authored cruise of the mw trace scripts, km/h. */
const AUTHORED_CRUISE_KMH = 130;

/** Locator edge-stealing margin (runtime/locator.ts) — the median must keep
 *  the carriageway banks clearly apart. */
const EDGE_SWITCH_MARGIN_M = 4.0;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation): the лента за принудително
 *  спиране is bounded by the wide solid edge line — М2 (Наредба № 2). */
const KIND_TO_SIGN = { emergencyLane: "М2" };

/**
 * @param {{
 *   districtId: string,        // output file name + ScenarioSpec.map.districtId
 *   label: string,             // human label (meta)
 *   idPrefix: string,          // node/edge/spawn id prefix (e.g. "mw")
 *   lengthM: number,           // segment length (800..1500)
 *   maxspeedKmh: number,       // posted limit (the АМ 140; 100..140)
 *   lanesPerDirection: number, // TRAVEL lanes per carriageway (exactly 2)
 *   medianM: number,           // gap between the carriageway banks (4..12)
 *   noteBg: string,            // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildMotorwaySegment(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, lanesPerDirection, medianM, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  // 1500 → 3000 (doc 87 B67). See RUNWAY_FOR_POSTED_LIMIT_M below for why the
  // old ceiling made the posted limit unreachable in the product.
  if (!(lengthM >= 800 && lengthM <= 3000)) errors.push(`lengthM must be within 800..3000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 100 && maxspeedKmh <= 140)) errors.push(`maxspeedKmh must be within 100..140, got ${maxspeedKmh}`);
  if (lanesPerDirection !== 2) errors.push(`only the 2+2 shape is exercised/asserted so far, got ${lanesPerDirection}+${lanesPerDirection}`);
  if (!(medianM >= 4 && medianM <= 12)) errors.push(`medianM must be within 4..12 m, got ${medianM}`);
  if (errors.length > 0) throw new Error(`gen_motorway params invalid:\n  - ${errors.join("\n  - ")}`);

  // The carriageway carries lanesPerDirection TRAVEL lanes + the emergency
  // curb lane, all marked (`lanes` on a oneway edge = lanes in direction).
  const markedLanes = lanesPerDirection + 1;
  const halfBankM = r2((markedLanes * SCALED_LANE_W) / 2); // 12.19

  // Northbound (driven) carriageway centered on x = 0. Locator one-way lane
  // math (locator.ts computeLane): laneId 0 (curb/EMERGENCY) center at
  // +1 lane east of the centerline, laneId 1 (cruise) ON the centerline,
  // laneId 2 (left) 1 lane west.
  const laneEmergencyX = r2(SCALED_LANE_W); // 8.13
  const laneCruiseX = 0;
  const laneLeftX = r2(-SCALED_LANE_W); // -8.13
  // Southbound (scenery) carriageway west of the median.
  const sbX = r2(-(markedLanes * SCALED_LANE_W + medianM));

  const NODES = {
    [`${idPrefix}-n-nb-start`]: [0, 0],
    [`${idPrefix}-n-nb-end`]: [0, lengthM],
    [`${idPrefix}-n-sb-start`]: [sbX, lengthM],
    [`${idPrefix}-n-sb-end`]: [sbX, 0],
  };
  const nbGeometry = [
    [0, 0],
    [0, lengthM],
  ];
  const sbGeometry = [
    [sbX, lengthM],
    [sbX, 0],
  ];
  const EDGES = [
    {
      id: `${idPrefix}-e-nb`,
      from: `${idPrefix}-n-nb-start`,
      to: `${idPrefix}-n-nb-end`,
      // Class "motorway" (not "primary"): a motorway carriageway is NOT an
      // arterial street — it carries no curbside parking band and no
      // palm/leafy street-tree rows. Tagging it "primary" put a 4 m
      // ARTERIAL_CLASSES/PARKING_LANE_CLASSES parking band on each side, which
      // widened each bank's half-width past the median half-gap and overlapped
      // the two carriageways (palms then planted on the opposing asphalt —
      // founder R-media #7/#8). "motorway" is EXCLUDED from ARTERIAL_CLASSES +
      // PARKING_LANE_CLASSES + SIDEWALK_CLASSES but kept in MARKED_CLASSES, so
      // the lane dividers still paint (the OV-11 keep-right story needs a
      // visible lane line) while the parking band, palms, streetlights and
      // sidewalks are gone. Grading is unaffected: it reads `motorway: true`.
      class: "motorway",
      name: label,
      oneway: true,
      roundabout: false,
      lanes: markedLanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      motorway: true,
      length: polylineLength(nbGeometry),
      geometry: nbGeometry,
    },
    {
      id: `${idPrefix}-e-sb`,
      from: `${idPrefix}-n-sb-start`,
      to: `${idPrefix}-n-sb-end`,
      // Class "motorway" (not "primary"): a motorway carriageway is NOT an
      // arterial street — it carries no curbside parking band and no
      // palm/leafy street-tree rows. Tagging it "primary" put a 4 m
      // ARTERIAL_CLASSES/PARKING_LANE_CLASSES parking band on each side, which
      // widened each bank's half-width past the median half-gap and overlapped
      // the two carriageways (palms then planted on the opposing asphalt —
      // founder R-media #7/#8). "motorway" is EXCLUDED from ARTERIAL_CLASSES +
      // PARKING_LANE_CLASSES + SIDEWALK_CLASSES but kept in MARKED_CLASSES, so
      // the lane dividers still paint (the OV-11 keep-right story needs a
      // visible lane line) while the parking band, palms, streetlights and
      // sidewalks are gone. Grading is unaffected: it reads `motorway: true`.
      class: "motorway",
      name: label,
      oneway: true,
      roundabout: false,
      lanes: markedLanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      motorway: true,
      length: polylineLength(sbGeometry),
      geometry: sbGeometry,
    },
  ];

  const INTERSECTIONS = []; // a motorway SEGMENT — no junctions by design
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The emergency lane, honestly: the curb lane of EACH carriageway over the
  // FULL segment — one authored span per edge (the busLane seam, mirrored).
  const signRef = KIND_TO_SIGN.emergencyLane;
  const ZONES = EDGES.map((e, i) => ({
    id: `${idPrefix}-z-emerg-${i === 0 ? "nb" : "sb"}`,
    kind: "emergencyLane",
    edgeId: e.id,
    fromM: 0,
    toM: e.length,
    signRef,
  }));

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-approach`,
      x: laneCruiseX,
      y: 15,
      heading: 0,
      edgeId: `${idPrefix}-e-nb`,
      name: "Начало — дясна лента за движение",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneCruiseX,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: `${idPrefix}-e-nb`,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // One visual-anchor block east of the northbound carriageway (a service
  // building beyond the verge) — clear of both banks.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-service`,
      height: 8,
      heightSource: "default",
      footprint: [
        [r2(halfBankM + 10), r2(lengthM * 0.44)],
        [r2(halfBankM + 24), r2(lengthM * 0.44)],
        [r2(halfBankM + 24), r2(lengthM * 0.44 + 30)],
        [r2(halfBankM + 10), r2(lengthM * 0.44 + 30)],
      ],
    },
  ];

  const bounds = {
    minX: r2(sbX - halfBankM - 6),
    minY: -6,
    maxX: r2(halfBankM + 30),
    maxY: r2(lengthM + 6),
  };

  const scenario = {
    archetype: "motorway-segment",
    params: { lengthM, maxspeedKmh, lanesPerDirection, medianM },
    lanesPerDirection,
    // Northbound lane centers (the Locator's one-way bank math) — the
    // ScenarioSpecs/trace scripts pin these by value; the district battery
    // asserts the copies against this truth (the L7 pattern).
    laneEmergencyX,
    laneCruiseX,
    laneLeftX,
    emergencyZoneIds: ZONES.map((z) => z.id),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_motorway.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен участък от автомагистрала (2+2 с аварийна лента) — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // The motorway limit doubles as the runtime's off-road fallback here
        // (ЗДвП чл. 21: автомагистрала 140 за категория B).
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
  // Self-validation (the gen_rural_curve invariants + the motorway laws)
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
    if (!e.oneway) post.push(`${e.id}: a divided motorway carriageway must be oneway`);
    if (e.lanes !== markedLanes) post.push(`${e.id}: lanes must be ${markedLanes} (emergency + ${lanesPerDirection} travel)`);
    if (e.motorway !== true) post.push(`${e.id}: must carry the motorway tag (arms the SP-10 detectors)`);
    if (e.maxspeed !== maxspeedKmh) post.push(`${e.id}: maxspeed mismatch`);
  }
  if (INTERSECTIONS.length !== 0) post.push("motorway-segment must carry ZERO intersections");
  if (CROSSINGS.length !== 0) post.push("motorway-segment must carry ZERO crossings");
  // Every carriageway carries exactly one full-length emergencyLane span.
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  if (ZONES.length !== EDGES.length) post.push("one emergencyLane span per carriageway required");
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    const host = EDGES.find((e) => e.id === z.edgeId);
    if (!(z.fromM === 0 && z.toM === host.length)) post.push(`${z.id}: span must cover the full carriageway`);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not mark ${z.kind}`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  // The carriageway banks must stay clearly apart for the Locator (median gap
  // beyond the edge-steal margin — a fix can never wander across the median).
  const bankGap = -halfBankM - (sbX + halfBankM);
  if (!(bankGap >= EDGE_SWITCH_MARGIN_M)) {
    post.push(`median bank gap ${r2(bankGap)} m must be >= the locator steal margin ${EDGE_SWITCH_MARGIN_M} m — widen medianM`);
  }
  // Recorder-envelope honesty (traces/recorder.ts): the authored top cruise
  // must be reachable AND stoppable inside the segment with story headroom —
  // accel to 130 (~296 m) + brake to rest (~203 m) + >= 300 m of story.
  const vTop = AUTHORED_CRUISE_KMH / 3.6;
  const accelDist = (vTop * vTop) / (2 * RECORDER_ACCEL_MPS2);
  const stopDist = (vTop * vTop) / (2 * RECORDER_STOP_MPS2);
  if (lengthM < accelDist + stopDist + 300) {
    post.push(
      `lengthM ${lengthM} leaves no honest ${AUTHORED_CRUISE_KMH} km/h story: accel ${r2(accelDist)} + stop ${r2(stopDist)} + 300 m story headroom needed`,
    );
  }
  // -- THE RUNWAY (doc 87 B67) -------------------------------------------------
  //
  // HIS SENTENCE on catalog 37: „I can't go more than 100-105", and the lesson
  // asks him to hold BELOW 125. The re-look refuted the number with a
  // measurement — peak 144.4 km/h across 705 SimTick samples — and then found
  // the real defect underneath it: the segment ENDS before the car has finished
  // accelerating. Its own arithmetic, on the shipped vehicle rather than on the
  // recorder script above: 160 km/h needs ~1.7 km of runway and 170 needs
  // ~2.4 km, because a real drivetrain is DRAG-limited at the top of its range
  // and the constant-2.2 m/s² envelope the recorder honesty check uses stops
  // being true above ~120. A 1000 m carriageway is 1000 m: at 140 posted, the
  // student reaches the end of the road before he reaches the speed the lesson
  // is about, and then reads that as „the car will not go faster".
  //
  // So the honest floor for a segment posted at motorway speed is the distance
  // the SHIPPED CAR needs to reach the posted limit and still stop inside the
  // map, not the distance a scripted 2.2 m/s² ramp needs. 2400 m is the
  // register's own measured number for 170 km/h; the committed instance carries
  // 2600 so the driver also gets a stretch of ACTUAL CRUISE at the top of the
  // range instead of one sample at the far kerb.
  const RUNWAY_FOR_POSTED_LIMIT_M = 2400;
  if (maxspeedKmh >= 130 && lengthM < RUNWAY_FOR_POSTED_LIMIT_M) {
    post.push(
      `lengthM ${lengthM} cannot deliver the posted ${maxspeedKmh} km/h: a drag-limited ` +
        `drivetrain needs >= ${RUNWAY_FOR_POSTED_LIMIT_M} m to reach ~170 km/h and stop ` +
        `(founder item B67 — the lesson asked for below 125 on a road that ended first)`,
    );
  }

  // The crawl detector's floor must sit far under the posted limit.
  if (!(maxspeedKmh > 50)) post.push("maxspeed must exceed the чл. 54 50 km/h flow floor");
  // Lane-center math (the Locator's one-way bank): curb lane +1W, cruise on
  // the centerline, left −1W.
  if (laneEmergencyX !== r2(SCALED_LANE_W)) post.push("emergency-lane center must sit 1 lane east of the centerline");
  if (laneCruiseX !== 0) post.push("cruise-lane center must sit ON the centerline");
  if (laneLeftX !== r2(-SCALED_LANE_W)) post.push("left-lane center must sit 1 lane west of the centerline");
  // Spawns on the northbound cruise lane.
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== `${idPrefix}-e-nb`) post.push(`${s.id}: must spawn on the northbound carriageway`);
    if (Math.abs(s.x - laneCruiseX) > 0.01 || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the cruise lane`);
  }
  // Buildings clear of both carriageways.
  for (const b of BUILDINGS) {
    for (const [x] of b.footprint) {
      if (x > sbX - halfBankM && x < halfBankM) post.push(`${b.id}: footprint inside a carriageway bank`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_motorway self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (SP-10 / OV-11 at speed / чл. 58 emergency lane)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mw-v1",
    label: "Учебна автомагистрала — 2+2 с аварийна лента, 2,6 км (сценарий SP-10)",
    idPrefix: "mw",
    // 1000 → 2600 m per carriageway (doc 87 B67 — see RUNWAY_FOR_POSTED_LIMIT_M).
    lengthM: 2600,
    maxspeedKmh: 140,
    lanesPerDirection: 2,
    medianM: 6,
    noteBg:
      "Автомагистрала с ограничение 140 км/ч: движи се в дясната лента за движение със скоростта на потока; лявата е за изпреварване, а аварийната лента е само за принудително спиране.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildMotorwaySegment(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== motorway build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("carriageways", `2 × (${params.lanesPerDirection} travel + emergency), median ${params.medianM} m`);
  line("NB lane centers", `emerg x=${district.meta.scenario.laneEmergencyX}, cruise x=${district.meta.scenario.laneCruiseX}, left x=${district.meta.scenario.laneLeftX}`);
  line("emergency spans", district.zones.map((z) => `${z.id}@[${z.fromM},${z.toM}]`).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
