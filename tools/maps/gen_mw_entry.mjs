/**
 * gen_mw_entry.mjs — the MERGE-LANE micro-map (Scenario Studio doc 76 §3; doc
 * 72 §8 archetype OV-15 „Включване в движението" at motorway scale + SP-10
 * „Магистрала"). The map archetype id "merge-lane" has been reserved in
 * scenario/types.ts MAP_ARCHETYPES since the vocabulary shipped — this
 * generator brings it alive (gen_motorway.mjs is the structural parent: same
 * divided carriageway, same emergencyLane data seam, same envelope asserts).
 *
 *   - mw-entry-v1 „Вход на автомагистрала" (OV-15 / SP-10): a DIVIDED 2+2
 *     motorway whose northbound carriageway is SPLIT into three collinear
 *     segments at plain degree-2 nodes (the gen_sp_transition precedent — a
 *     data change mid-route, never an intersection), plus a right-side ON-RAMP
 *     that lands exactly on the curb-lane center at the nose:
 *
 *        mwe-n-nb-end (0, 960)
 *            │  MAIN segment — emergencyLane span (lane 0 = аварийна лента)
 *        mwe-n-taper (0, 460)   ← the acceleration lane TAPERS OUT here
 *            │  ACCEL segment — NO span (lane 0 = ЛЕНТА ЗА УСКОРЯВАНЕ)
 *        mwe-n-nose (0, 260)    ← the ramp nose: accel lane begins
 *            │  APPROACH segment — emergencyLane span (lane 0 = аварийна лента)
 *        mwe-n-nb-start (0, 0)
 *
 * THE ACCELERATION LANE, honestly: it is the SAME curb lane (laneId 0) the
 * motorway's лента за принудително спиране occupies — the acceleration lane
 * IS the shoulder, widened into a travel lane for 200 m and then given back.
 * That is exactly how the geometry reads on a Bulgarian АМ вход, and it makes
 * the whole drill grade with ZERO new engine code:
 *   - between nose and taper the curb lane carries NO emergencyLane span, so
 *     tick.emergencyLaneRight is absent: driving there is legal (no
 *     EMERGENCY_LANE_DRIVING) and it is the rightmost REQUIRED lane;
 *   - past the taper the span resumes, so tick.emergencyLaneRight = true: the
 *     merged driver cruising laneId 1 is innocent of NOT_KEEPING_RIGHT (the
 *     busLane exemption seam, mw-v1's precedent), while a driver who NEVER
 *     merged and rides laneId 0 past the taper grades the опасна
 *     EMERGENCY_LANE_DRIVING — the taper's real-world consequence, for free;
 *   - the merge itself is a laneId 0 → 1 delta WITHIN one edge, so the shipped
 *     lane-change adjudication (indicator + mirror) grades it. Cross-edge
 *     deltas never grade (rules/engine.ts C1 revision), which is precisely why
 *     the accel segment — not the ramp — hosts the merge.
 *
 * THE RAMP: a separate oneway 1-lane secondary_link edge, deliberately NOT
 * `motorway`-tagged — a driver building speed from rest on the ramp must never
 * meet DRIVING_TOO_SLOW_FOR_MOTORWAY (чл. 54's flow floor is about the
 * carriageway, not the връзка). It carries the honest чл. 21 extra-urban 90
 * (no ramp-specific sign exists), so nothing about the entry can grade as
 * speeding at authored pace.
 *
 * LAW NOTES (verified against content/questions, see rules/catalog.ts):
 *   - вливане през лентата за ускоряване, предимство на движещите се по
 *     магистралата: ЗДвП чл. 55 (+ чл. 25) — q-predimstvo-044,
 *     q-magistrali-i-izvangradsko-004/006/060;
 *   - 140 на АМ за категория B: ЗДвП чл. 21;
 *   - аварийна лента: ЗДвП чл. 58, т. 3 (the resumed span past the taper).
 *
 * ---------------------------------------------------------------------------
 * FOUNDER REVIEW 2026-07-27 — THE CROSS-SECTION REDESIGN
 * ---------------------------------------------------------------------------
 * Verbatim: „the shadow car is moving on top of other cars - the road is going
 * on top of some other road … the shadow car stopps on the right lane where it
 * can actually stop … if the lane is the speed lane it must be the most left
 * lane". Every one of those is the same root cause: the carriageways were
 * tagged `class: "primary"` (only `motorway: true` marked them as АМ), so the
 * CITY cross-section was drawn over a motorway:
 *   - PARKING_LANE_CLASSES has `primary`, so each bank grew a 4 m curbside
 *     parking band per side: halfWidth 12.19 → 16.19 m. The northbound bank
 *     [−16.19, 16.19] then OVERLAPPED the southbound one [−46.56, −14.19] by
 *     2 m — literally road on top of road;
 *   - TrafficLayer's PARK_CLASSES has `primary` too, so a row of PARKED CARS
 *     stood in that band at x = ±14.19 the whole length of the map. The ramp
 *     centreline crosses x = 14.19 at y ≈ 233 — the ego drove through them.
 *     That is „moving on top of other cars";
 *   - SIDEWALK_CLASSES/ARTERIAL_CLASSES have `primary` AND `secondary_link`,
 *     so the motorway grew pavements, 185 street trees, 6 billboards and a lamp
 *     row whose columns landed at x = −10.28 (inside the overtaking lane) and,
 *     off the RAMP's own row, at x = 10.48 (inside the acceleration lane);
 *   - and the аварийна лента read as an ordinary third travel lane, because
 *     markings.ts suppresses the emergency lane's OUTER edge line on arterial
 *     classes (the arterial pass is supposed to draw it — but at `halfWidth`,
 *     i.e. 4 m out at the back of the parking band, not at the carriageway
 *     edge). With no wide М2 line to bound it, the shoulder looked like a lane
 *     you may stop in — exactly the founder's read of the mistake reel.
 *
 * The fix is one honest tag change per edge, and it settles all of it:
 *   - the carriageways carry `class: "motorway"` (as gen_motorway.mjs mw-v1
 *     always has). No parking band (halfWidth back to the 3 marked lanes,
 *     12.19 m → the banks clear the 6 m median), no parked-car row, no
 *     pavements, no trees, no billboards, no lamp columns — and, because
 *     `motorway` is outside ARTERIAL_CLASSES, the emergencyLane span now paints
 *     BOTH of its edges: the wide continuous М2 line at the laneId 0/1 seam and
 *     the carriageway edge line outside it. THAT is the lane semantics the
 *     founder asked for: past the taper the curb lane is visibly bounded as
 *     аварийна лента, so the mainline reads as exactly two travel lanes — the
 *     RIGHT one the merge target, the LEFT one the overtaking lane — and the
 *     mistake reel's stop happens in a lane that is visibly not for stopping.
 *     Between nose and taper that wide line is absent, which is what makes the
 *     acceleration lane read as the legal travel lane it is;
 *   - the RAMP keeps `class: "secondary_link"` (deliberately NOT motorway —
 *     see below) and gains `bareVerge: "both"`: a връзка has grass verges, not
 *     city pavements. Its pavement strip used to sweep across the carriageway
 *     it merges into, and its lamp row stood in the acceleration lane.
 *
 * GRADING IS UNTOUCHED: `lanes`, `motorway: true`, the maxspeeds, the zone
 * spans, every node/edge/spawn id and every lane centre (x = 8.13 / 0 / −8.13)
 * are unchanged, and the Locator's lane math reads `lanes` × LANE_WIDTH_M, not
 * the ribbon's dressed halfWidth. Only what is DRAWN moved.
 *
 * KNOWN VISUAL GAPS (honest, the gen_motorway М2 precedent):
 *   - no taper WEDGE geometry exists: the acceleration lane and the emergency
 *     lane occupy the same third marked lane, and the taper is a data boundary
 *     (the zone span's start) rather than a painted wedge. Since the span now
 *     paints the wide М2 seam + the outer edge line, the boundary IS visible as
 *     the point where the shoulder markings begin; the wedge itself is not.
 *   - the ramp centerline crosses into the carriageway bank over its last
 *     ~18 m (the merge nose) — the surfaces overlap there, exactly as a real
 *     nose does; asserted below (both the centreline and the ribbon edge) so it
 *     can never creep further back.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; `zones`
 * is additive and reuses the shipped "emergencyLane" kind; meta.zonesVersion
 * stays 1. No new tick fields, no new detector.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_mw_entry.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/merge-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Kinematic recorder envelope (traces/recorder.ts): accel 2.2 m/s², stop
 *  envelope 0.7 × 4.6. Asserted against so a param change that makes the
 *  authored drives physically dishonest fails the BUILD, not the demo. */
const RECORDER_ACCEL_MPS2 = 2.2;
const RECORDER_STOP_MPS2 = 4.6 * 0.7;
/** The authored drives of traces/scMergeAccelLane.ts, km/h. */
const AUTHORED_RAMP_KMH = 70; // ramp cruise at the nose
const AUTHORED_MERGE_KMH = 95; // speed reached in the acceleration lane
const AUTHORED_CRUISE_KMH = 110; // mainline cruise after the merge

/** Locator edge-stealing margin (runtime/locator.ts) — the median must keep
 *  the carriageway banks clearly apart. */
const EDGE_SWITCH_MARGIN_M = 4.0;

/** The merge shift the trace scripts author (curb lane → lane 1), m of arc. */
const AUTHORED_MERGE_RUN_M = 62;
/** The ramp nose may overlap the carriageway bank at most this far back, m. */
const RAMP_NOSE_OVERLAP_MAX_M = 25;
/** …and the ramp RIBBON's inner edge (halfWidth out from the centreline), which
 *  is the surface a viewer actually sees merge, at most this far back. A real
 *  merge gore runs 30–50 m; beyond that the two asphalt sheets read as one road
 *  laid over another, which is the defect the founder called out. */
const RAMP_RIBBON_OVERLAP_MAX_M = 45;

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
 *   idPrefix: string,          // node/edge/spawn id prefix (e.g. "mwe")
 *   approachM: number,         // mainline BEFORE the ramp nose (150..400)
 *   accelM: number,            // the acceleration lane (150..260 — "~200 m")
 *   mainM: number,             // mainline AFTER the taper (400..700)
 *   maxspeedKmh: number,       // posted АМ limit (100..140)
 *   rampKmh: number,           // ramp limit (60..90 — чл. 21 extra-urban)
 *   lanesPerDirection: number, // TRAVEL lanes per carriageway (exactly 2)
 *   medianM: number,           // gap between the carriageway banks (4..12)
 *   rampStartX: number,        // ramp entry, east of the carriageway (30..60)
 *   rampStartY: number,        // ramp entry, south of the nose
 *   noteBg: string,            // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildMotorwayEntry(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    approachM,
    accelM,
    mainM,
    maxspeedKmh,
    rampKmh,
    lanesPerDirection,
    medianM,
    rampStartX,
    rampStartY,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(approachM >= 150 && approachM <= 400)) errors.push(`approachM must be within 150..400 m, got ${approachM}`);
  if (!(accelM >= 150 && accelM <= 260)) errors.push(`accelM must be within 150..260 m ("~200 m"), got ${accelM}`);
  if (!(mainM >= 400 && mainM <= 700)) errors.push(`mainM must be within 400..700 m, got ${mainM}`);
  if (!(maxspeedKmh >= 100 && maxspeedKmh <= 140)) errors.push(`maxspeedKmh must be within 100..140, got ${maxspeedKmh}`);
  if (!(rampKmh >= 60 && rampKmh <= 90)) errors.push(`rampKmh must be within 60..90, got ${rampKmh}`);
  if (lanesPerDirection !== 2) errors.push(`only the 2+2 shape is exercised/asserted so far, got ${lanesPerDirection}+${lanesPerDirection}`);
  if (!(medianM >= 4 && medianM <= 12)) errors.push(`medianM must be within 4..12 m, got ${medianM}`);
  if (!(rampStartX >= 30 && rampStartX <= 60)) errors.push(`rampStartX must be within 30..60 m, got ${rampStartX}`);
  if (!(rampStartY >= 0 && rampStartY < approachM)) errors.push(`rampStartY must sit within the approach segment, got ${rampStartY}`);
  if (errors.length > 0) throw new Error(`gen_mw_entry params invalid:\n  - ${errors.join("\n  - ")}`);

  // The carriageway carries lanesPerDirection TRAVEL lanes + the curb lane
  // (emergency lane / acceleration lane), all marked.
  const markedLanes = lanesPerDirection + 1;
  const halfBankM = r2((markedLanes * SCALED_LANE_W) / 2); // 12.19

  // Northbound (driven) carriageway centered on x = 0. Locator one-way lane
  // math (locator.ts computeLane): laneId 0 (CURB) center at +1 lane east of
  // the centerline, laneId 1 (the merge target) ON the centerline, laneId 2
  // (overtaking) 1 lane west.
  const laneCurbX = r2(SCALED_LANE_W); // 8.13
  const laneCruiseX = 0;
  const laneLeftX = r2(-SCALED_LANE_W); // -8.13
  // Southbound (scenery) carriageway west of the median.
  const sbX = r2(-(markedLanes * SCALED_LANE_W + medianM));

  const noseY = approachM;
  const taperY = approachM + accelM;
  const endY = approachM + accelM + mainM;

  const NODES = {
    [`${idPrefix}-n-nb-start`]: [0, 0],
    [`${idPrefix}-n-nose`]: [0, noseY],
    [`${idPrefix}-n-taper`]: [0, taperY],
    [`${idPrefix}-n-nb-end`]: [0, endY],
    [`${idPrefix}-n-sb-start`]: [sbX, endY],
    [`${idPrefix}-n-sb-end`]: [sbX, 0],
    [`${idPrefix}-n-ramp-start`]: [rampStartX, rampStartY],
    [`${idPrefix}-n-ramp-nose`]: [laneCurbX, noseY],
  };

  const approachGeom = [[0, 0], [0, noseY]];
  const accelGeom = [[0, noseY], [0, taperY]];
  const mainGeom = [[0, taperY], [0, endY]];
  const sbGeom = [[sbX, endY], [sbX, 0]];
  const rampGeom = [[rampStartX, rampStartY], [laneCurbX, noseY]];

  const carriageway = (id, from, to, geometry, name) => ({
    id,
    from,
    to,
    // `motorway`, not `primary` (founder review 2026-07-27 — see the header):
    // the class is what the WORLD BUILDER dresses off, and a motorway carries
    // no parking band, no parked-car row, no pavement, no trees, no billboards
    // and no lamp columns. It also puts the emergencyLane span outside
    // ARTERIAL_CLASSES, so the shoulder finally paints its own outer edge line.
    class: "motorway",
    name,
    oneway: true,
    roundabout: false,
    lanes: markedLanes,
    lanesSource: "tag",
    maxspeed: maxspeedKmh,
    maxspeedSource: "tag",
    motorway: true,
    length: polylineLength(geometry),
    geometry,
  });

  const EDGES = [
    carriageway(
      `${idPrefix}-e-nb-approach`,
      `${idPrefix}-n-nb-start`,
      `${idPrefix}-n-nose`,
      approachGeom,
      `${label} — подход`,
    ),
    carriageway(
      `${idPrefix}-e-nb-accel`,
      `${idPrefix}-n-nose`,
      `${idPrefix}-n-taper`,
      accelGeom,
      `${label} — лента за ускоряване`,
    ),
    carriageway(
      `${idPrefix}-e-nb-main`,
      `${idPrefix}-n-taper`,
      `${idPrefix}-n-nb-end`,
      mainGeom,
      `${label} — платно след вливането`,
    ),
    carriageway(`${idPrefix}-e-sb`, `${idPrefix}-n-sb-start`, `${idPrefix}-n-sb-end`, sbGeom, `${label} — насрещно платно`),
    {
      // The ON-RAMP: NOT motorway-tagged (see the header) — a driver building
      // speed from rest here is entering, not crawling on the carriageway.
      id: `${idPrefix}-e-ramp`,
      from: `${idPrefix}-n-ramp-start`,
      to: `${idPrefix}-n-ramp-nose`,
      class: "secondary_link",
      name: `${label} — рампа за включване`,
      oneway: true,
      roundabout: false,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: rampKmh,
      maxspeedSource: "default",
      // A motorway връзка runs between grass verges, not city pavements: the
      // `_link` class is arterial, so without this the ramp grew a 3.5 m
      // pavement strip that swept ACROSS the carriageway it merges into, and a
      // lamp row whose column at (10.48, 213.8) stood in the acceleration lane.
      bareVerge: "both",
      length: polylineLength(rampGeom),
      geometry: rampGeom,
    },
  ];

  const INTERSECTIONS = []; // collinear degree-2 splits + a ramp nose: no junctions
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The emergency lane: the curb lane of every carriageway segment EXCEPT the
  // acceleration segment — that 200 m gap in the span IS the лента за
  // ускоряване (see the header).
  const signRef = KIND_TO_SIGN.emergencyLane;
  const EMERG_HOSTS = [
    [`${idPrefix}-z-emerg-approach`, `${idPrefix}-e-nb-approach`],
    [`${idPrefix}-z-emerg-main`, `${idPrefix}-e-nb-main`],
    [`${idPrefix}-z-emerg-sb`, `${idPrefix}-e-sb`],
  ];
  const ZONES = EMERG_HOSTS.map(([id, edgeId]) => ({
    id,
    kind: "emergencyLane",
    edgeId,
    fromM: 0,
    toM: EDGES.find((e) => e.id === edgeId).length,
    signRef,
  }));

  // Spawn on the ramp: `rampSpawnArcM` along the ramp polyline, on its center.
  const rampLen = EDGES.find((e) => e.id === `${idPrefix}-e-ramp`).length;
  const rampDx = laneCurbX - rampStartX;
  const rampDy = noseY - rampStartY;
  const rampSpawnArcM = 20;
  const rampSpawnT = rampSpawnArcM / rampLen;
  const rampSpawnX = r2(rampStartX + rampDx * rampSpawnT);
  const rampSpawnY = r2(rampStartY + rampDy * rampSpawnT);
  const rampHeadingDeg = r2((((Math.atan2(rampDx, rampDy) * 180) / Math.PI) + 360) % 360);

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-ramp`,
      x: rampSpawnX,
      y: rampSpawnY,
      heading: rampHeadingDeg,
      edgeId: `${idPrefix}-e-ramp`,
      name: "Начало — рампата за включване",
    },
    {
      id: `${idPrefix}-spawn-accel`,
      x: laneCurbX,
      y: r2(noseY + 40),
      heading: 0,
      edgeId: `${idPrefix}-e-nb-accel`,
      name: "Контролна точка — в лентата за ускоряване",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneCruiseX,
      y: r2(endY - 15),
      heading: 0,
      edgeId: `${idPrefix}-e-nb-main`,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // One visual-anchor block east of the northbound carriageway, north of the
  // ramp corridor — clear of every bank.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-service`,
      height: 8,
      heightSource: "default",
      footprint: [
        [r2(halfBankM + 10), r2(taperY + 140)],
        [r2(halfBankM + 24), r2(taperY + 140)],
        [r2(halfBankM + 24), r2(taperY + 170)],
        [r2(halfBankM + 10), r2(taperY + 170)],
      ],
    },
  ];

  const bounds = {
    minX: r2(sbX - halfBankM - 6),
    minY: -6,
    maxX: r2(Math.max(halfBankM, rampStartX + SCALED_LANE_W / 2, halfBankM + 24) + 10),
    maxY: r2(endY + 6),
  };

  const scenario = {
    archetype: "merge-lane",
    params: { approachM, accelM, mainM, maxspeedKmh, rampKmh, lanesPerDirection, medianM },
    lanesPerDirection,
    // Northbound lane centers (the Locator's one-way bank math) — the
    // ScenarioSpecs/trace scripts pin these by value; the district battery
    // asserts the copies against this truth (the L7 pattern).
    laneCurbX,
    laneCruiseX,
    laneLeftX,
    // The story's arclengths, in DISTRICT y (the carriageway runs on x = 0).
    noseY,
    taperY,
    endY,
    accelLaneFromY: noseY,
    accelLaneToY: taperY,
    rampSpawn: [rampSpawnX, rampSpawnY, rampHeadingDeg],
    accelEdgeId: `${idPrefix}-e-nb-accel`,
    emergencyZoneIds: ZONES.map((z) => z.id),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_mw_entry.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен вход на автомагистрала с лента за ускоряване — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // Off-road / fallback default — every segment carries its own limit
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
  // Self-validation (the gen_motorway invariants + the merge-lane laws)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const degree = new Map();
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (!e.oneway) post.push(`${e.id}: every edge of this map is a one-way carriageway/ramp`);
  }
  const CARRIAGEWAYS = EDGES.filter((e) => e.id !== `${idPrefix}-e-ramp`);
  for (const e of CARRIAGEWAYS) {
    if (e.lanes !== markedLanes) post.push(`${e.id}: lanes must be ${markedLanes} (curb + ${lanesPerDirection} travel)`);
    if (e.motorway !== true) post.push(`${e.id}: must carry the motorway tag (arms the SP-10 detectors)`);
    if (e.maxspeed !== maxspeedKmh) post.push(`${e.id}: maxspeed mismatch`);
    // The founder-review invariant: the CLASS is what the world builder dresses
    // off. `primary` here put a 4 m parking band, a parked-car row, pavements,
    // trees and lamp columns on an автомагистрала — and hid the shoulder's
    // outer edge line. Only `motorway` draws a motorway.
    if (e.class !== "motorway") {
      post.push(`${e.id}: class must be "motorway" — the city cross-section does not belong on an АМ`);
    }
  }
  const ramp = EDGES.find((e) => e.id === `${idPrefix}-e-ramp`);
  if (ramp.motorway !== undefined) {
    post.push(`${ramp.id}: the ramp must NOT carry the motorway tag — entering from rest is not a carriageway crawl`);
  }
  if (ramp.lanes !== 1) post.push(`${ramp.id}: the ramp is a single-lane връзка`);
  if (ramp.maxspeed !== rampKmh) post.push(`${ramp.id}: maxspeed mismatch`);
  if (ramp.bareVerge !== "both") {
    post.push(`${ramp.id}: a връзка runs between grass verges — bareVerge must be "both" (no pavement/lamp row)`);
  }
  if (INTERSECTIONS.length !== 0) post.push("merge-lane must carry ZERO intersections (no stop line, no junction tracker)");
  if (CROSSINGS.length !== 0) post.push("merge-lane must carry ZERO crossings");
  // The nb split nodes join exactly two collinear segments each (the
  // gen_sp_transition law: a data boundary, never an intersection).
  for (const id of [`${idPrefix}-n-nose`, `${idPrefix}-n-taper`]) {
    if ((degree.get(id) ?? 0) !== 2) post.push(`${id}: must join exactly the two collinear segments (degree 2)`);
  }
  for (const e of CARRIAGEWAYS) {
    if (e.id === `${idPrefix}-e-sb`) continue;
    for (const [x] of e.geometry) if (x !== 0) post.push(`${e.id}: the northbound segments must stay collinear on x = 0`);
  }
  // THE ARCHETYPE'S REASON TO EXIST: exactly the accel segment lacks the span.
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  const spanEdges = new Set(ZONES.map((z) => z.edgeId));
  if (spanEdges.has(`${idPrefix}-e-nb-accel`)) {
    post.push("the acceleration segment must carry NO emergencyLane span — its curb lane is a LEGAL travel lane");
  }
  for (const id of [`${idPrefix}-e-nb-approach`, `${idPrefix}-e-nb-main`, `${idPrefix}-e-sb`]) {
    if (!spanEdges.has(id)) post.push(`${id}: the curb lane outside the acceleration lane IS the аварийна лента`);
  }
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    const host = EDGES.find((e) => e.id === z.edgeId);
    if (!(z.fromM === 0 && z.toM === host.length)) post.push(`${z.id}: span must cover the full segment`);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not mark ${z.kind}`);
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  // The carriageway banks must stay clearly apart for the Locator (median gap
  // beyond the edge-steal margin — a fix can never wander across the median).
  const bankGap = -halfBankM - (sbX + halfBankM);
  if (!(bankGap >= EDGE_SWITCH_MARGIN_M)) {
    post.push(`median bank gap ${r2(bankGap)} m must be >= the locator steal margin ${EDGE_SWITCH_MARGIN_M} m — widen medianM`);
  }
  // Lane-center math (the Locator's one-way bank).
  if (laneCurbX !== r2(SCALED_LANE_W)) post.push("curb-lane center must sit 1 lane east of the centerline");
  if (laneCruiseX !== 0) post.push("merge-target lane center must sit ON the centerline");
  if (laneLeftX !== r2(-SCALED_LANE_W)) post.push("left-lane center must sit 1 lane west of the centerline");
  // The ramp must LAND on the curb-lane center at the nose (the accel lane
  // begins exactly where the ramp ends — no lateral jump for the driver).
  if (rampGeom[1][0] !== laneCurbX || rampGeom[1][1] !== noseY) {
    post.push("the ramp must end exactly on the curb-lane center at the nose");
  }
  // …and stay OUT of the carriageway bank until the nose itself (the merge
  // nose overlap — see the header's known visual gap).
  const overlapBackM = (rampStartX > halfBankM)
    ? (halfBankM - laneCurbX) * ((noseY - rampStartY) / (rampStartX - laneCurbX))
    : Infinity;
  if (!(overlapBackM > 0 && overlapBackM <= RAMP_NOSE_OVERLAP_MAX_M)) {
    post.push(
      `the ramp centerline enters the carriageway bank ${r2(overlapBackM)} m before the nose — keep it within ${RAMP_NOSE_OVERLAP_MAX_M} m (move rampStartX/rampStartY)`,
    );
  }
  // …and the same for the ramp RIBBON's west edge (halfWidth = SCALED_LANE_W/2
  // out from the centreline, since a 1-lane link carries no parking band): that
  // is the asphalt a viewer sees, and it reaches the bank earlier than the
  // centreline does. Beyond RAMP_RIBBON_OVERLAP_MAX_M the gore stops reading as
  // a merge nose and starts reading as one road laid over another.
  {
    const rampHalfW = SCALED_LANE_W / 2;
    const dx = laneCurbX - rampStartX; // < 0 — the ramp closes from the east
    const dy = noseY - rampStartY;
    const len = Math.hypot(dx, dy);
    // West-facing unit normal of the ramp direction, then its x/y components.
    const nx = -dy / len;
    const ny = dx / len;
    const westX = (t) => rampStartX + dx * t + nx * rampHalfW;
    const westY = (t) => rampStartY + dy * t + ny * rampHalfW;
    // t where the west edge reaches x = halfBankM (the carriageway bank).
    const tHit = (halfBankM - rampStartX - nx * rampHalfW) / dx;
    const ribbonOverlapM = tHit >= 0 && tHit <= 1 ? Math.hypot(laneCurbX - westX(tHit), noseY - westY(tHit)) : Infinity;
    if (!(ribbonOverlapM > 0 && ribbonOverlapM <= RAMP_RIBBON_OVERLAP_MAX_M)) {
      post.push(
        `the ramp ribbon's west edge overlaps the carriageway ${r2(ribbonOverlapM)} m before the nose — keep it within ${RAMP_RIBBON_OVERLAP_MAX_M} m`,
      );
    }
  }
  // The dressed bank must BE the marked lanes: a class that carries a curbside
  // parking band (PARKING_LANE_CLASSES: primary/secondary/tertiary) widens the
  // drawn ribbon by 4 m per side beyond halfBankM, which is what made the two
  // carriageways overlap and put parked cars in the ramp's path.
  if (["primary", "secondary", "tertiary"].includes(EDGES[0].class)) {
    post.push("the carriageway class carries a curbside parking band — the drawn bank would exceed halfBankM");
  }
  // Recorder-envelope honesty (traces/recorder.ts) — the authored drives must
  // be physically reachable on this geometry:
  //  1. the ramp must be long enough to build the authored ramp cruise;
  const rampBuildM = (AUTHORED_RAMP_KMH / 3.6) ** 2 / (2 * RECORDER_ACCEL_MPS2);
  if (ramp.length < rampBuildM + 20) {
    post.push(`ramp ${ramp.length} m leaves no honest ${AUTHORED_RAMP_KMH} km/h build-up (needs ${r2(rampBuildM)} + 20 m)`);
  }
  //  2. the acceleration lane must fit ramp-cruise → merge-speed → the shift,
  //     with the merge COMPLETE well before the taper (a lane delta inside
  //     laneChangeJointGraceSec of the taper joint is dropped ungraded);
  const accelBuildM =
    ((AUTHORED_MERGE_KMH / 3.6) ** 2 - (AUTHORED_RAMP_KMH / 3.6) ** 2) / (2 * RECORDER_ACCEL_MPS2);
  if (accelM < accelBuildM + AUTHORED_MERGE_RUN_M + 40) {
    post.push(
      `accelM ${accelM} leaves no honest merge: build ${r2(accelBuildM)} + shift ${AUTHORED_MERGE_RUN_M} + 40 m of joint-grace headroom needed`,
    );
  }
  //  3. the mainline must accept the authored cruise AND a stop inside it.
  const vTop = AUTHORED_CRUISE_KMH / 3.6;
  const cruiseBuildM = (vTop ** 2 - (AUTHORED_MERGE_KMH / 3.6) ** 2) / (2 * RECORDER_ACCEL_MPS2);
  const stopDistM = vTop ** 2 / (2 * RECORDER_STOP_MPS2);
  if (mainM < cruiseBuildM + stopDistM + 150) {
    post.push(
      `mainM ${mainM} leaves no honest ${AUTHORED_CRUISE_KMH} km/h story: build ${r2(cruiseBuildM)} + stop ${r2(stopDistM)} + 150 m story headroom needed`,
    );
  }
  // The crawl detector's floor must sit far under both posted limits.
  if (!(maxspeedKmh > 50)) post.push("maxspeed must exceed the чл. 54 50 km/h flow floor");
  if (!(rampKmh > AUTHORED_RAMP_KMH)) post.push("the ramp limit must exceed the authored ramp cruise");
  // Spawns on their declared edges, on the authored lane/ramp centers.
  for (const s of SPAWN_POINTS) {
    if (!edgeIdSet.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
  }
  const spawnRamp = SPAWN_POINTS[0];
  const spawnOffCenter = Math.abs(
    ((laneCurbX - rampStartX) * (spawnRamp.y - rampStartY) - (noseY - rampStartY) * (spawnRamp.x - rampStartX)) /
      rampLen,
  );
  if (spawnOffCenter > 0.02) post.push(`${spawnRamp.id}: not on the ramp centerline (off by ${r2(spawnOffCenter)} m)`);
  if (Math.abs(SPAWN_POINTS[1].x - laneCurbX) > 0.01 || SPAWN_POINTS[1].y <= noseY || SPAWN_POINTS[1].y >= taperY) {
    post.push(`${SPAWN_POINTS[1].id}: not inside the acceleration lane`);
  }
  if (Math.abs(SPAWN_POINTS[2].x - laneCruiseX) > 0.01 || SPAWN_POINTS[2].y <= taperY || SPAWN_POINTS[2].y >= endY) {
    post.push(`${SPAWN_POINTS[2].id}: not on the mainline lane past the taper`);
  }
  // Buildings clear of both carriageways and of the ramp corridor.
  for (const b of BUILDINGS) {
    for (const [x, y] of b.footprint) {
      if (x > sbX - halfBankM && x < halfBankM) post.push(`${b.id}: footprint inside a carriageway bank`);
      if (y < noseY + 10) post.push(`${b.id}: footprint too close to the ramp corridor`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_mw_entry self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (OV-15 „Включване в движението" at motorway scale)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mw-entry-v1",
    label: "Учебен вход на автомагистрала — лента за ускоряване (сценарий OV-15/SP-10)",
    idPrefix: "mwe",
    approachM: 260,
    accelM: 200,
    mainM: 500,
    maxspeedKmh: 140,
    rampKmh: 90,
    lanesPerDirection: 2,
    medianM: 6,
    rampStartX: 40,
    rampStartY: 120,
    noteBg:
      "Вход на автомагистрала: използвай лентата за ускоряване, за да изравниш скоростта си с потока, огледай се и се влей — предимството е на движещите се по магистралата. След края на лентата вдясно вече е аварийната лента.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildMotorwayEntry(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== mw-entry build: ${params.districtId} ===`);
  console.log(`  segments                   approach ${params.approachM} → accel ${params.accelM} → main ${params.mainM} m @ ${params.maxspeedKmh} km/h`);
  line("nose / taper / end", `y = ${sc.noseY} / ${sc.taperY} / ${sc.endY}`);
  line("NB lane centers", `curb x=${sc.laneCurbX}, cruise x=${sc.laneCruiseX}, left x=${sc.laneLeftX}`);
  line("ramp", `${district.roads.edges.find((e) => e.id === "mwe-e-ramp").length} m @ ${params.rampKmh} km/h (no motorway tag)`);
  line("ramp spawn", `(${sc.rampSpawn[0]}, ${sc.rampSpawn[1]}) heading ${sc.rampSpawn[2]}°`);
  line("emergency spans", district.zones.map((z) => `${z.edgeId}@[${z.fromM},${z.toM}]`).join(", "));
  line("accel lane (NO span)", `${sc.accelEdgeId} — y ∈ [${sc.accelLaneFromY}, ${sc.accelLaneToY}]`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
