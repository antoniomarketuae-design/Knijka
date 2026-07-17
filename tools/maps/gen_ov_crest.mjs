/**
 * gen_ov_crest.mjs — the BLIND-CURVE OVERTAKING-BAN micro-map (Scenario Studio
 * doc 76 §3; doc 72 §10 archetype OV-06 „Изпреварване при забрана" × OV-05
 * „Прозорецът срещу насрещния" × SP-05 „Скорост в завой"). Structurally the
 * gen_rural_curve.mjs recipe (approach → chorded 90° arc → exit), with the
 * ZONE layer carrying TWO overlapping-but-distinct spans instead of one.
 *
 *   - ov-crest-v1  „Забранено изпреварване преди било и завой" (ЗДвП чл. 43):
 *     an extra-urban 1+1 posted 90 — a straight approach, a marked ~90° arc
 *     with a sight-blocking slope block on its INSIDE, a long straight exit.
 *     Two authored spans:
 *       * noOvertaking (В24) from banAheadM BEFORE the arc to the arc END —
 *         the ban starts at the sign, not at the bend, because a maneuver
 *         begun „on the edge" ENDS inside the blind part;
 *       * curveAdvisory (А1 + Т-table advisoryKmh) over the arc EXACTLY — the
 *         same span the SP-05 detector grades (ЗДвП чл. 20, ал. 2).
 *     Everything past the arc end is the LEGAL PASSING WINDOW: no span, full
 *     posted limit, straight sightline — the place the lesson sends you.
 *
 * NO ELEVATION EXISTS in the engine (the hill-ramp archetype is a reserved id
 * with no ramp geometry), so „било" is narrative only: this map's blindness is
 * a CURVE plus the slope block inside its arc. Every copy the scenario carries
 * is curve-based — the generator does not pretend to a crest it cannot build.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; `zones`
 * is optional and additive; kind "curveAdvisory" carries the REQUIRED
 * advisoryKmh; kind "noOvertaking" carries none (the span IS the ban);
 * meta.zonesVersion stays 1. Both kinds post a sign through the zone-sign pass
 * (builders/zoneSigns.ts: В24 → "noOvertaking", А1 → "curve").
 *
 * CURVED GEOMETRY (the gen_rural_curve polyline law, verbatim): the arc is a
 * chorded polyline sampled every ARC_STEP_DEG (2.5° at R = 135 → ~5.9 m
 * chords) — the Locator/lane-fix discipline the mini-roundabout ring set. Both
 * spans' [fromM, toM] are computed from the ACTUAL polyline cumulative
 * arclength (the Locator's sM measure), so membership resolves exactly like
 * maxspeed does.
 *
 * TURN-DETECTOR NO-DOUBLE-BILL (the gen_rural_curve proof, re-derived for this
 * radius): turnStarted needs BOTH > 55° of heading change within a 3 s window
 * AND the vehicle inside a junction area (runtime/turns.ts). This map is safe
 * twice over — ZERO intersections (the junction gate never opens), and the
 * window math stays under threshold at every speed the posted limit allows
 * (inside lane R − 4.06 = 130.94 m): 90 km/h → ~10.9°/s → ~32.8°/3 s « 55.
 * The self-validation asserts both.
 *
 * RECORDER CURVE-CAP HEADROOM (traces/recorder.ts): the kinematic recorder caps
 * curve speed at √(2.4 · radius) ≈ 63.8 km/h on the inside lane. The guilty
 * SP-05 demo must hold ~54 km/h through an advisory-40 arc, so the validation
 * asserts cap > advisory + 20 — the gen_rural_curve invariant, which keeps the
 * whole convict band (advisory + curveSpeedGraceKmh, upward) recordable.
 *
 * THE LEGAL WINDOW IS A LOAD-BEARING DIMENSION, not scenery: the shadow demo
 * has to complete a whole pass (out, past, back) inside it against a lead that
 * does not stop being slow. The validation asserts the window is at least
 * LEGAL_WINDOW_MIN_M — a shorter exit would silently turn „изпревари след
 * завоя" into „няма къде да изпревариш".
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ov_crest.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Arc sampling step, degrees (~5.9 m chords at R = 135 — the ring's law). */
const ARC_STEP_DEG = 2.5;

/** Turn-detector window constants (runtime/turns.ts) — asserted against. */
const TURN_THRESHOLD_DEG = 55;
const TURN_WINDOW_SEC = 3;

/** The pass the shadow must fit past the ban: out + past + back, m. */
const LEGAL_WINDOW_MIN_M = 300;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation): В24 = забранено изпреварване,
 *  А1 = опасен завой надясно (the gen_ban_zones / gen_rural_curve tables,
 *  merged — this is the first map that carries BOTH kinds at once). */
const KIND_TO_SIGN = { noOvertaking: "В24", curveAdvisory: "А1" };

/**
 * @param {{
 *   districtId: string,   // output file name + ScenarioSpec.map.districtId
 *   label: string,        // human label (meta)
 *   idPrefix: string,     // node/edge/spawn id prefix (e.g. "ovc")
 *   approachM: number,    // straight approach length (150..500)
 *   radiusM: number,      // centerline arc radius (120..400)
 *   sweepDeg: number,     // arc sweep (60..120; the blind shape is ~90)
 *   exitM: number,        // straight exit = the LEGAL passing window (300..600)
 *   maxspeedKmh: number,  // posted limit (the extra-urban 90)
 *   advisoryKmh: number,  // curve advisory (Т-table under А1)
 *   banAheadM: number,    // В24 stands this far BEFORE the arc (40..150)
 *   noteBg: string,       // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildBlindCurveBanRoad(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    approachM,
    radiusM,
    sweepDeg,
    exitM,
    maxspeedKmh,
    advisoryKmh,
    banAheadM,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(approachM >= 150 && approachM <= 500)) errors.push(`approachM must be within 150..500 m, got ${approachM}`);
  if (!(radiusM >= 120 && radiusM <= 400)) errors.push(`radiusM must be within 120..400 m, got ${radiusM}`);
  if (!(sweepDeg >= 60 && sweepDeg <= 120)) errors.push(`sweepDeg must be within 60..120°, got ${sweepDeg}`);
  if (!(exitM >= 300 && exitM <= 600)) errors.push(`exitM must be within 300..600 m, got ${exitM}`);
  if (!(maxspeedKmh >= 50 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 50..90, got ${maxspeedKmh}`);
  if (!(advisoryKmh >= 30 && advisoryKmh < maxspeedKmh)) {
    errors.push(`advisoryKmh must satisfy 30 <= advisory < maxspeed, got ${advisoryKmh} vs ${maxspeedKmh}`);
  }
  if (!(banAheadM >= 40 && banAheadM <= 150 && banAheadM < approachM - 40)) {
    errors.push(`banAheadM must be within 40..150 m and leave >= 40 m of unbanned approach, got ${banAheadM}`);
  }
  if (sweepDeg !== 90) errors.push(`only the 90° sweep is exercised/asserted so far, got ${sweepDeg}`);
  if (errors.length > 0) throw new Error(`gen_ov_crest params invalid:\n  - ${errors.join("\n  - ")}`);

  const lanesPerDir = 1;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  // -- Geometry: south→north approach on x = 0, then a 90° RIGHT (eastward)
  // arc around center (radiusM, approachM), then a straight exit east — the
  // gen_rural_curve frame, verbatim.
  const cx = radiusM;
  const cy = approachM;
  const steps = Math.round(sweepDeg / ARC_STEP_DEG);
  const geometry = [
    [0, 0],
    [0, approachM],
  ];
  const arcStartIdx = 1; // index of the arc's first vertex in `geometry`
  for (let i = 1; i <= steps; i++) {
    const th = ((i * ARC_STEP_DEG) * Math.PI) / 180;
    geometry.push([r2(cx - radiusM * Math.cos(th)), r2(cy + radiusM * Math.sin(th))]);
  }
  const arcEndIdx = geometry.length - 1;
  const endX = r2(radiusM + exitM);
  const endY = r2(approachM + radiusM);
  geometry.push([endX, endY]);

  // Cumulative arclength (the Locator's sM measure) over the ROUNDED points —
  // the spans must live in exactly the metric the runtime resolves.
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(geometry[i][0] - geometry[i - 1][0], geometry[i][1] - geometry[i - 1][1]));
  }
  const arcFromM = r2(cum[arcStartIdx]);
  const arcToM = r2(cum[arcEndIdx]);
  const banFromM = r2(arcFromM - banAheadM);

  const edgeId = `${idPrefix}-e-road`;
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [endX, endY],
  };
  const EDGES = [
    {
      id: edgeId,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      class: "unclassified",
      name: label,
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = []; // NO junctions — the turn detector stays disarmed
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The two authored spans, in sM order (the zone-sign pass places posts in
  // authored order — В24 first at its own sign point, then А1 at the arc).
  const ZONES = [
    {
      id: `${idPrefix}-z-ban`,
      kind: "noOvertaking",
      edgeId,
      fromM: banFromM,
      toM: arcToM,
      signRef: KIND_TO_SIGN.noOvertaking,
    },
    {
      id: `${idPrefix}-z-curve`,
      kind: "curveAdvisory",
      edgeId,
      fromM: arcFromM,
      toM: arcToM,
      signRef: KIND_TO_SIGN.curveAdvisory,
      advisoryKmh,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-approach`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — зад бавния камион",
    },
    {
      id: `${idPrefix}-spawn-exit`,
      x: r2(endX - 15),
      y: r2(endY - laneRightM),
      heading: 90,
      edgeId,
      name: "Контролна точка — след завоя",
    },
  ];

  // The inside-lane arc midpoint (θ = sweep/2 at radius R − laneRightM) — the
  // ScenarioSpec pins its mid-curve patience gate by value; the district
  // battery asserts the copy against this truth (the L7 pattern).
  const rLane = radiusM - laneRightM;
  const midTh = ((sweepDeg / 2) * Math.PI) / 180;
  const laneCurveMid = { x: r2(cx - rLane * Math.cos(midTh)), y: r2(cy + rLane * Math.sin(midTh)) };

  // The SLOPE BLOCK on the INSIDE of the arc — this map's only reason to call
  // the curve blind. Sits at 78% of the radius from the arc center, clear of
  // the carriageway by construction (asserted below); it is what the driver
  // cannot see past. The second block anchors the В24 sign-reading moment on
  // the approach's west verge (the arc bulges EAST — the verge stays clear).
  const blockR = radiusM * 0.78;
  const bcx = r2(cx - blockR * Math.cos(midTh));
  const bcy = r2(cy + blockR * Math.sin(midTh));
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-slope`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(bcx - 9), r2(bcy - 9)],
        [r2(bcx + 9), r2(bcy - 9)],
        [r2(bcx + 9), r2(bcy + 9)],
        [r2(bcx - 9), r2(bcy + 9)],
      ],
    },
    {
      id: `${idPrefix}-b-barn`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 22)), r2(banFromM - 30)],
        [r2(-(halfRoadM + 9)), r2(banFromM - 30)],
        [r2(-(halfRoadM + 9)), r2(banFromM - 12)],
        [r2(-(halfRoadM + 22)), r2(banFromM - 12)],
      ],
    },
  ];

  const bounds = {
    minX: r2(-(halfRoadM + 28)),
    minY: -6,
    maxX: r2(endX + 6),
    maxY: r2(endY + halfRoadM + 6),
  };

  const scenario = {
    archetype: "rural-curve",
    params: { approachM, radiusM, sweepDeg, exitM, maxspeedKmh, advisoryKmh, banAheadM },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    banZone: { id: ZONES[0].id, kind: "noOvertaking", signRef: KIND_TO_SIGN.noOvertaking, fromM: banFromM, toM: arcToM },
    curveZone: {
      id: ZONES[1].id,
      kind: "curveAdvisory",
      signRef: KIND_TO_SIGN.curveAdvisory,
      fromM: arcFromM,
      toM: arcToM,
      advisoryKmh,
    },
    laneCurveMid,
    /** The exit leg's OWN (eastbound) lane center and the OPPOSING bank line —
     *  the legal pass lives between them (the trace scripts pin both). */
    exitLaneY: r2(endY - laneRightM),
    exitOncomingLaneY: r2(endY + laneRightM),
    /** Free, span-less road past the ban — the legal passing window, m. */
    legalWindowM: r2(EDGES[0].length - arcToM),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_ov_crest.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен извънградски път със сляп завой и зона В24 — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // The extra-urban default (ЗДвП чл. 21: извън населено място 90 км/ч
        // for category B) — doubles as the runtime's off-road fallback.
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
  // Self-validation (the gen_rural_curve invariants + the two-span laws)
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 road (lanes 2)`);
  }
  // Chord discipline: every arc chord ≤ 10 m (the Locator smoothness law).
  for (let i = arcStartIdx + 1; i <= arcEndIdx; i++) {
    const chord = Math.hypot(geometry[i][0] - geometry[i - 1][0], geometry[i][1] - geometry[i - 1][1]);
    if (chord > 10) post.push(`arc chord ${i} is ${r2(chord)} m (> 10 m — raise the sampling density)`);
  }
  // Arc length sanity: the chorded polyline must sit within 1% of the true arc.
  const trueArc = (radiusM * sweepDeg * Math.PI) / 180;
  if (Math.abs(arcToM - arcFromM - trueArc) > trueArc * 0.01) {
    post.push(`arc polyline length ${r2(arcToM - arcFromM)} deviates > 1% from the true arc ${r2(trueArc)}`);
  }
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= EDGES[0].length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${EDGES[0].length}`);
    }
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
  }
  // The curve span IS the arc; the ban span STARTS at the sign, before it, and
  // both END together at the arc's end — the „маневрата трябва да завърши
  // преди зоната" geometry, encoded.
  const banZone = ZONES[0];
  const curveZone = ZONES[1];
  if (Math.abs(curveZone.fromM - approachM) > 0.05) {
    post.push(`${curveZone.id}: the advisory span must start at the arc (fromM ${curveZone.fromM} != ${approachM})`);
  }
  if (!(Number.isFinite(curveZone.advisoryKmh) && curveZone.advisoryKmh > 0)) {
    post.push(`${curveZone.id}: advisoryKmh required (an advisory-less span is inert)`);
  }
  if (banZone.advisoryKmh !== undefined) post.push(`${banZone.id}: noOvertaking carries no advisory`);
  if (!(banZone.fromM < curveZone.fromM)) post.push(`${banZone.id}: В24 must stand BEFORE the arc`);
  if (banZone.toM !== curveZone.toM) post.push(`${banZone.id}: both spans must end together at the arc end`);
  if (Math.abs(curveZone.fromM - banZone.fromM - banAheadM) > 0.05) {
    post.push(`${banZone.id}: sign stands ${r2(curveZone.fromM - banZone.fromM)} m ahead, authored ${banAheadM}`);
  }
  // The legal passing window: span-less road past the ban, long enough that a
  // whole pass (out, past, back) fits at the posted limit.
  const windowM = r2(EDGES[0].length - banZone.toM);
  if (windowM < LEGAL_WINDOW_MIN_M) {
    post.push(`legal window ${windowM} m < ${LEGAL_WINDOW_MIN_M} m — the shadow's pass cannot fit past the ban`);
  }
  if (scenario.legalWindowM !== windowM) post.push("meta.scenario.legalWindowM out of sync with the spans");
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  // Turn-detector no-double-bill guarantee (see the header):
  if (INTERSECTIONS.length !== 0) post.push("the blind-curve archetype must carry ZERO intersections");
  const degPerSecAtLimit = ((maxspeedKmh / 3.6) / rLane) * (180 / Math.PI);
  if (degPerSecAtLimit * TURN_WINDOW_SEC >= TURN_THRESHOLD_DEG) {
    post.push(
      `turn-window math broken: ${r2(degPerSecAtLimit * TURN_WINDOW_SEC)}°/${TURN_WINDOW_SEC}s at the ${maxspeedKmh} limit reaches the ${TURN_THRESHOLD_DEG}° threshold — widen radiusM`,
    );
  }
  // Recorder curve-cap headroom (traces/recorder.ts √(2.4·R) lateral law): the
  // guilty SP-05 demo lives above advisory + curveSpeedGraceKmh and must record
  // at its AUTHORED speed, not at the cap.
  const capKmh = Math.sqrt(2.4 * rLane) * 3.6;
  if (capKmh <= advisoryKmh + 20) {
    post.push(`recorder curve cap ${r2(capKmh)} km/h leaves no guilty-demo headroom over advisory ${advisoryKmh} — widen radiusM`);
  }
  // Spawns on the carriageway.
  const sApproach = SPAWN_POINTS[0];
  if (Math.abs(sApproach.x) > halfRoadM || sApproach.y < 0 || sApproach.y > approachM) post.push(`${sApproach.id}: not on the approach`);
  const sExit = SPAWN_POINTS[1];
  if (Math.abs(sExit.y - endY) > halfRoadM || sExit.x < radiusM || sExit.x > endX) post.push(`${sExit.id}: not on the exit leg`);
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the bank`);
  // The slope block must sit INSIDE the arc, clear of every carriageway.
  const clearM = halfRoadM + 4;
  for (const [px, py] of BUILDINGS[0].footprint) {
    const dArc = Math.hypot(px - cx, py - cy);
    if (dArc > radiusM - clearM) post.push(`${BUILDINGS[0].id}: corner (${px}, ${py}) reaches the arc carriageway`);
    if (Math.abs(px) < clearM && py > -clearM && py < approachM + clearM) {
      post.push(`${BUILDINGS[0].id}: corner (${px}, ${py}) sits on the approach leg`);
    }
    if (Math.abs(py - endY) < clearM && px > radiusM - clearM) {
      post.push(`${BUILDINGS[0].id}: corner (${px}, ${py}) sits on the exit leg`);
    }
  }
  for (const [px, py] of BUILDINGS[1].footprint) {
    if (Math.abs(px) < clearM) post.push(`${BUILDINGS[1].id}: corner (${px}, ${py}) reaches the approach carriageway`);
    if (Math.hypot(px - cx, py - cy) < radiusM + clearM && py > approachM) {
      post.push(`${BUILDINGS[1].id}: corner (${px}, ${py}) reaches the arc`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  for (const [px, py] of geometry) {
    if (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY) {
      post.push(`geometry vertex (${px}, ${py}) outside the authored bounds`);
    }
  }
  if (post.length > 0) {
    throw new Error(`gen_ov_crest self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (OV-06 × OV-05 × SP-05 — ЗДвП чл. 43)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ov-crest-v1",
    label: "Учебен извънградски път — сляп завой със забрана за изпреварване (сценарий OV-06)",
    idPrefix: "ovc",
    approachM: 240,
    radiusM: 135,
    sweepDeg: 90,
    exitM: 450,
    maxspeedKmh: 90,
    advisoryKmh: 40,
    banAheadM: 90,
    noteBg:
      "Извънградски път с ограничение 90 км/ч. Знак В24 забранява изпреварването 90 м преди слепия завой и до края му; знак А1 с табела препоръчва 40 км/ч в самата дъга. Правата след завоя е свободна — там изпреварването е разрешено.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildBlindCurveBanRoad(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== blind-curve ban build: ${params.districtId} ===`);
  line("approach / arc / exit", `${params.approachM} m / ${params.sweepDeg}° @ R${params.radiusM} / ${params.exitM} m`);
  line("limit / advisory", `${params.maxspeedKmh} km/h / ${params.advisoryKmh} km/h`);
  line("ban zone", `${sc.banZone.signRef} noOvertaking @ [${sc.banZone.fromM}, ${sc.banZone.toM}] m`);
  line("curve zone", `${sc.curveZone.signRef} curveAdvisory @ [${sc.curveZone.fromM}, ${sc.curveZone.toM}] m`);
  line("legal window", `${sc.legalWindowM} m of span-less road past the ban`);
  line("lane mid-arc", `(${sc.laneCurveMid.x}, ${sc.laneCurveMid.y})`);
  line("exit lanes (own/onc)", `y = ${sc.exitLaneY} / ${sc.exitOncomingLaneY}`);
  line("edge length", `${district.roads.edges[0].length} m`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
