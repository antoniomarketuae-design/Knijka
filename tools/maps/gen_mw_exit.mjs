/**
 * gen_mw_exit.mjs — the MOTORWAY-EXIT micro-map (Scenario Studio doc 76 §3;
 * doc 72 §8 archetype SP-10 „Магистрала" + SP-05 „Скорост в завой" on the
 * връзка). Structural parent: tools/maps/gen_motorway.mjs (the divided 2+2
 * carriageway, the emergencyLane data seam, the recorder-envelope asserts);
 * tools/maps/gen_mw_entry.mjs is the same idea run BACKWARDS and every
 * invariant it proves is mirrored here.
 *
 *   - mw-exit-v1 „Изход от магистралата" (SP-10 / SP-05): a DIVIDED 2+2
 *     motorway whose northbound carriageway is SPLIT into three collinear
 *     segments at plain degree-2 nodes (the gen_sp_transition precedent — a
 *     data change mid-route, never an intersection), plus a right-hand EXIT
 *     RAMP that leaves the curb-lane center at the gore, tangentially:
 *
 *        mwx-n-nb-end (0, 1220)
 *            │  MAIN segment — emergencyLane span (lane 0 = аварийна лента);
 *            │  the „изпуснах изхода" continuation: you drive ON, never back
 *        mwx-n-nose (0, 800)    ← the GORE: the ramp leaves here
 *            │  DECEL segment — NO span (lane 0 = ЛЕНТА ЗА НАМАЛЯВАНЕ)
 *        mwx-n-taper (0, 520)   ← the deceleration lane OPENS here
 *            │  APPROACH segment — emergencyLane span (lane 0 = аварийна лента)
 *        mwx-n-nb-start (0, 0)
 *
 * THE DECELERATION LANE, honestly: it is the SAME curb lane (laneId 0) the
 * motorway's лента за принудително спиране occupies — the лента за намаляване
 * IS the shoulder, widened into a travel lane for 280 m and then given back.
 * That is how the geometry reads on a Bulgarian АМ изход, and it makes the
 * whole drill grade with ZERO new engine code (the mw-entry seam, mirrored):
 *   - between taper and nose the curb lane carries NO emergencyLane span, so
 *     tick.emergencyLaneRight is absent: braking there is legal (no
 *     EMERGENCY_LANE_DRIVING) and it is the rightmost REQUIRED lane;
 *   - BEFORE the taper the span is live, so the driver who „престроява се
 *     вдясно" too early would be riding the аварийна лента — the map teaches
 *     WHERE the right-hand move becomes legal, for free;
 *   - AFTER the nose the span resumes, so the driver who missed the exit and
 *     cruises laneId 1 onward is innocent (the busLane exemption seam) while
 *     one who hugs the curb lane past the gore grades the опасна
 *     EMERGENCY_LANE_DRIVING;
 *   - the move into the лента за намаляване is a laneId 1 → 0 delta WITHIN one
 *     edge, so the shipped lane-change adjudication (indicator + mirror) grades
 *     it. Cross-edge deltas never grade (rules/engine.ts C1 revision), which is
 *     precisely why the DECEL segment — not the gore — hosts the manoeuvre.
 *
 * THE RAMP: a separate oneway 1-lane secondary_link edge that leaves the
 * curb-lane center at the gore TANGENTIALLY (heading 0) and bends right through
 * `rampSweepDeg` at `rampRadiusM`, then runs a straight tail. Two deliberate
 * facts:
 *   - it is NOT `motorway`-tagged: a driver correctly down at the ramp advisory
 *     must never meet DRIVING_TOO_SLOW_FOR_MOTORWAY — чл. 54's flow floor is
 *     about the платно, not the връзка (gen_mw_entry's law note, verbatim);
 *   - it carries the honest чл. 21 extra-urban 90 (no ramp-specific sign
 *     exists — the same call gen_mw_entry made), and its ARC carries a
 *     "curveAdvisory" span (advisoryKmh — the Т-table under А1). THAT span, not
 *     the limit, is what the exit lesson is about: the engine's curve code is
 *     deliberately NOT capped at the graced limit (rules/engine.ts), so a legal
 *     85 on the връзка still bills SPEED_TOO_FAST_FOR_CURVE against a posted 60.
 *
 * LAW NOTES (verified against content/questions, see rules/catalog.ts):
 *   - изход от магистрала през лентата за намаляване, намаляването се прави В
 *     нея: ЗДвП чл. 55 (q-magistrali-i-izvangradsko-005/028, q-manevri-037);
 *   - забраната за спиране/движение назад по магистралата: ЗДвП чл. 58
 *     (q-magistrali-i-izvangradsko-007) — teach-card content: reversing needs
 *     opposing geometry to demo, so the map carries the LAW, not a drive;
 *   - 140 на АМ за категория B: ЗДвП чл. 21; скорост, съобразена с условията в
 *     завой: чл. 20, ал. 2;
 *   - аварийна лента: ЗДвП чл. 58, т. 3 (the spans on either side of the gore).
 *
 * KNOWN VISUAL GAPS (honest, the gen_motorway М2 / gen_mw_entry taper
 * precedents):
 *   - NO exit direction-sign asset exists (Д-серия „указателна табела за
 *     изход" — 500/300/100 m boards, Д10 гърловина). world/types.ts SignKind
 *     has no such kind and adding one is an engine change this map must not
 *     make: the ScenarioSpec copy + the trace annotations carry the
 *     direction-sign teaching until a sign-asset drop. The curveAdvisory span
 *     DOES render its А1 post (builders/zoneSigns.ts), which is the one sign
 *     that grades;
 *   - no taper WEDGE geometry: the deceleration lane and the emergency lane
 *     render as the same third marked lane, and the taper is a data boundary
 *     (the zone span's end) rather than painted paint. It GRADES correctly;
 *   - the ramp centerline sits inside the carriageway bank over its first
 *     ~45 m (the gore), exactly as a real gore does; asserted below so it can
 *     never creep further.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; `zones`
 * is additive and reuses the shipped "emergencyLane" + "curveAdvisory" kinds;
 * meta.zonesVersion stays 1. No new tick fields, no new detector.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_mw_exit.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/mw-exit-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Arc sampling step, degrees (the gen_rural_curve chord law + the recorder
 *  gate math below — 1.5° at R 250 gives ~6.5 m chords). */
const ARC_STEP_DEG = 1.5;

/** Kinematic recorder envelope (traces/recorder.ts): accel 2.2 m/s²; a drive
 *  step brakes at its own `maxDecelMps2` (default 4.6) and plans a stopAtEnd
 *  arrival on 0.7 × that. Asserted against so a param change that makes the
 *  authored drives physically dishonest fails the BUILD, not the demo. */
const RECORDER_ACCEL_MPS2 = 2.2;
const RECORDER_DECEL_MPS2 = 4.6;
const RECORDER_STOP_MPS2 = 4.6 * 0.7;
/** The mistake demo's slam override (traces/scMergeMotorwayExit.ts). */
const RECORDER_SLAM_STOP_MPS2 = 12 * 0.7;
/** Recorder curve-speed cap law: target ≤ √(2.4 · R), armed only when the
 *  heading change over one of the [10, 18, 30] m windows exceeds 8°. */
const RECORDER_CURVE_LAT_MPS2 = 2.4;
const RECORDER_CURVE_GATE_DEG = 8;
const RECORDER_CURVE_WINDOW_M = 30;

/** Turn-detector window constants (runtime/turns.ts) — asserted against. */
const TURN_THRESHOLD_DEG = 55;
const TURN_WINDOW_SEC = 3;

/** Locator edge-stealing margin (runtime/locator.ts) — the median must keep
 *  the carriageway banks clearly apart. */
const EDGE_SWITCH_MARGIN_M = 4.0;
/** Lane deltas within this of a segment joint are dropped ungraded
 *  (rules/types.ts laneChangeJointGraceSec) — the decel lane must be long
 *  enough that the authored move into it lands OUTSIDE the window. */
const LANE_CHANGE_JOINT_GRACE_SEC = 1.5;
/** rules/types.ts keepRightSustainSec. THE SPAN GAP'S PRICE: with no
 *  emergencyLane span on the decel segment, laneId 0 is its rightmost REQUIRED
 *  lane, so a driver holding laneId 1 there technically „hogs". The lane must
 *  stay short enough in TIME that simply declining the exit at motorway pace
 *  can never reach the sustain — asserted below. */
const KEEP_RIGHT_SUSTAIN_SEC = 12;
/** Speeding grace (rules/types.ts speedingGraceRatio) — the authored ramp
 *  speeds must stay at/under the ramp's own limit so no SPEEDING_* code can
 *  leak into the single-code curve demo. */
const SPEEDING_GRACE_RATIO = 0.1;

/** The authored drives of traces/scMergeMotorwayExit.ts, km/h. */
const AUTHORED_CRUISE_KMH = 130; // mainline pace held to the deceleration lane
const AUTHORED_RAMP_KMH = 60; // the shadow rides the ramp AT its advisory
const AUTHORED_RAMP_GUILTY_KMH = 85; // „Рампата с магистрална скорост"
/** The lane shift the trace scripts author (one lane over), m of arc. */
const AUTHORED_MERGE_RUN_M = 65;
/** The ramp centerline may sit inside the carriageway bank at most this far
 *  past the gore, m. */
const RAMP_GORE_OVERLAP_MAX_M = 60;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation): the лента за принудително
 *  спиране is bounded by the wide solid edge line — М2 (Наредба № 2); the
 *  marked ramp bend is posted А1 „Опасен завой надясно" + Т-табела. */
const KIND_TO_SIGN = { emergencyLane: "М2", curveAdvisory: "А1" };

/**
 * @param {{
 *   districtId: string,        // output file name + ScenarioSpec.map.districtId
 *   label: string,             // human label (meta)
 *   idPrefix: string,          // node/edge/spawn id prefix (e.g. "mwx")
 *   approachM: number,         // mainline BEFORE the deceleration lane (400..700)
 *   decelM: number,            // the deceleration lane (200..320)
 *   mainM: number,             // mainline AFTER the gore (350..600)
 *   maxspeedKmh: number,       // posted АМ limit (100..140)
 *   rampKmh: number,           // ramp limit (60..90 — чл. 21 extra-urban)
 *   advisoryKmh: number,       // ramp-arc advisory (Т-table under А1)
 *   lanesPerDirection: number, // TRAVEL lanes per carriageway (exactly 2)
 *   medianM: number,           // gap between the carriageway banks (4..12)
 *   rampRadiusM: number,       // ramp arc radius (180..320)
 *   rampSweepDeg: number,      // ramp arc sweep (30..60)
 *   rampTailM: number,         // straight tail past the arc (40..120)
 *   noteBg: string,            // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildMotorwayExit(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    approachM,
    decelM,
    mainM,
    maxspeedKmh,
    rampKmh,
    advisoryKmh,
    lanesPerDirection,
    medianM,
    rampRadiusM,
    rampSweepDeg,
    rampTailM,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(approachM >= 400 && approachM <= 700)) errors.push(`approachM must be within 400..700 m, got ${approachM}`);
  if (!(decelM >= 200 && decelM <= 320)) errors.push(`decelM must be within 200..320 m, got ${decelM}`);
  if (!(mainM >= 350 && mainM <= 600)) errors.push(`mainM must be within 350..600 m, got ${mainM}`);
  if (!(maxspeedKmh >= 100 && maxspeedKmh <= 140)) errors.push(`maxspeedKmh must be within 100..140, got ${maxspeedKmh}`);
  if (!(rampKmh >= 60 && rampKmh <= 90)) errors.push(`rampKmh must be within 60..90, got ${rampKmh}`);
  if (!(advisoryKmh >= 40 && advisoryKmh < rampKmh)) {
    errors.push(`advisoryKmh must satisfy 40 <= advisory < rampKmh, got ${advisoryKmh} vs ${rampKmh}`);
  }
  if (lanesPerDirection !== 2) errors.push(`only the 2+2 shape is exercised/asserted so far, got ${lanesPerDirection}+${lanesPerDirection}`);
  if (!(medianM >= 4 && medianM <= 12)) errors.push(`medianM must be within 4..12 m, got ${medianM}`);
  if (!(rampRadiusM >= 180 && rampRadiusM <= 320)) errors.push(`rampRadiusM must be within 180..320 m, got ${rampRadiusM}`);
  if (!(rampSweepDeg >= 30 && rampSweepDeg <= 60)) errors.push(`rampSweepDeg must be within 30..60°, got ${rampSweepDeg}`);
  if (Math.abs(rampSweepDeg / ARC_STEP_DEG - Math.round(rampSweepDeg / ARC_STEP_DEG)) > 1e-9) {
    errors.push(`rampSweepDeg ${rampSweepDeg} must be a whole multiple of the ${ARC_STEP_DEG}° sampling step`);
  }
  if (!(rampTailM >= 40 && rampTailM <= 120)) errors.push(`rampTailM must be within 40..120 m, got ${rampTailM}`);
  if (errors.length > 0) throw new Error(`gen_mw_exit params invalid:\n  - ${errors.join("\n  - ")}`);

  // The carriageway carries lanesPerDirection TRAVEL lanes + the curb lane
  // (emergency lane / deceleration lane), all marked.
  const markedLanes = lanesPerDirection + 1;
  const halfBankM = r2((markedLanes * SCALED_LANE_W) / 2); // 12.19

  // Northbound (driven) carriageway centered on x = 0. Locator one-way lane
  // math (locator.ts computeLane): laneId 0 (CURB) center at +1 lane east of
  // the centerline, laneId 1 (the cruise lane you exit FROM) ON the
  // centerline, laneId 2 (overtaking) 1 lane west.
  const laneCurbX = r2(SCALED_LANE_W); // 8.13
  const laneCruiseX = 0;
  const laneLeftX = r2(-SCALED_LANE_W); // -8.12
  // Southbound (scenery) carriageway west of the median.
  const sbX = r2(-(markedLanes * SCALED_LANE_W + medianM));

  const taperY = approachM;
  const noseY = approachM + decelM;
  const endY = approachM + decelM + mainM;

  // -- the ramp: tangent at the gore, then a right-hand arc, then a tail.
  const arcCx = r2(laneCurbX + rampRadiusM);
  const arcCy = noseY;
  const arcSteps = Math.round(rampSweepDeg / ARC_STEP_DEG);
  const rampGeom = [];
  for (let i = 0; i <= arcSteps; i++) {
    const th = ((i * ARC_STEP_DEG) * Math.PI) / 180;
    rampGeom.push([r2(arcCx - rampRadiusM * Math.cos(th)), r2(arcCy + rampRadiusM * Math.sin(th))]);
  }
  const arcEndIdx = rampGeom.length - 1;
  const sweepRad = (rampSweepDeg * Math.PI) / 180;
  const rampEndX = r2(rampGeom[arcEndIdx][0] + rampTailM * Math.sin(sweepRad));
  const rampEndY = r2(rampGeom[arcEndIdx][1] + rampTailM * Math.cos(sweepRad));
  rampGeom.push([rampEndX, rampEndY]);
  // Cumulative arclength over the ROUNDED points — the span must live in
  // exactly the metric the runtime resolves (the Locator's sM measure).
  const rampCum = [0];
  for (let i = 1; i < rampGeom.length; i++) {
    rampCum.push(
      rampCum[i - 1] + Math.hypot(rampGeom[i][0] - rampGeom[i - 1][0], rampGeom[i][1] - rampGeom[i - 1][1]),
    );
  }
  const curveFromM = 0; // the arc starts AT the gore — the ramp bends from metre one
  const curveToM = r2(rampCum[arcEndIdx]);

  const NODES = {
    [`${idPrefix}-n-nb-start`]: [0, 0],
    [`${idPrefix}-n-taper`]: [0, taperY],
    [`${idPrefix}-n-nose`]: [0, noseY],
    [`${idPrefix}-n-nb-end`]: [0, endY],
    [`${idPrefix}-n-sb-start`]: [sbX, endY],
    [`${idPrefix}-n-sb-end`]: [sbX, 0],
    [`${idPrefix}-n-ramp-gore`]: [laneCurbX, noseY],
    [`${idPrefix}-n-ramp-end`]: [rampEndX, rampEndY],
  };

  const approachGeom = [[0, 0], [0, taperY]];
  const decelGeom = [[0, taperY], [0, noseY]];
  const mainGeom = [[0, noseY], [0, endY]];
  const sbGeom = [[sbX, endY], [sbX, 0]];

  const carriageway = (id, from, to, geometry, name) => ({
    id,
    from,
    to,
    class: "primary",
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
      `${idPrefix}-n-taper`,
      approachGeom,
      `${label} — подход`,
    ),
    carriageway(
      `${idPrefix}-e-nb-decel`,
      `${idPrefix}-n-taper`,
      `${idPrefix}-n-nose`,
      decelGeom,
      `${label} — лента за намаляване`,
    ),
    carriageway(
      `${idPrefix}-e-nb-main`,
      `${idPrefix}-n-nose`,
      `${idPrefix}-n-nb-end`,
      mainGeom,
      `${label} — платно след изхода`,
    ),
    carriageway(`${idPrefix}-e-sb`, `${idPrefix}-n-sb-start`, `${idPrefix}-n-sb-end`, sbGeom, `${label} — насрещно платно`),
    {
      // The EXIT RAMP: NOT motorway-tagged (see the header) — a driver correctly
      // down at the advisory here is exiting, not crawling on the carriageway.
      id: `${idPrefix}-e-ramp`,
      from: `${idPrefix}-n-ramp-gore`,
      to: `${idPrefix}-n-ramp-end`,
      class: "secondary_link",
      name: `${label} — рампа за изход`,
      oneway: true,
      roundabout: false,
      lanes: 1,
      lanesSource: "tag",
      maxspeed: rampKmh,
      maxspeedSource: "default",
      length: polylineLength(rampGeom),
      geometry: rampGeom,
    },
  ];

  const INTERSECTIONS = []; // collinear degree-2 splits + a gore: no junctions
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // The emergency lane: the curb lane of every carriageway segment EXCEPT the
  // deceleration segment — that 280 m gap in the span IS the лента за
  // намаляване (see the header). Plus the ramp's marked bend.
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
    signRef: KIND_TO_SIGN.emergencyLane,
  }));
  ZONES.push({
    id: `${idPrefix}-z-ramp-curve`,
    kind: "curveAdvisory",
    edgeId: `${idPrefix}-e-ramp`,
    fromM: curveFromM,
    toM: curveToM,
    signRef: KIND_TO_SIGN.curveAdvisory,
    advisoryKmh,
  });

  const rampLen = EDGES.find((e) => e.id === `${idPrefix}-e-ramp`).length;
  // Ramp finish checkpoint: 15 m back along the straight tail.
  const rampFinishX = r2(rampEndX - 15 * Math.sin(sweepRad));
  const rampFinishY = r2(rampEndY - 15 * Math.cos(sweepRad));

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-left-lane`,
      x: laneLeftX,
      y: 15,
      heading: 0,
      edgeId: `${idPrefix}-e-nb-approach`,
      name: "Начало — лявата лента на магистралата",
    },
    {
      id: `${idPrefix}-spawn-decel`,
      x: laneCurbX,
      y: r2(noseY - 60),
      heading: 0,
      edgeId: `${idPrefix}-e-nb-decel`,
      name: "Контролна точка — в лентата за намаляване",
    },
    {
      id: `${idPrefix}-spawn-ramp-exit`,
      x: rampFinishX,
      y: rampFinishY,
      heading: r2(rampSweepDeg),
      edgeId: `${idPrefix}-e-ramp`,
      name: "Контролна точка — край на рампата",
    },
  ];

  // One visual-anchor block east of the northbound carriageway, SOUTH of the
  // gore — clear of every bank and of the ramp corridor.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-service`,
      height: 8,
      heightSource: "default",
      footprint: [
        [r2(halfBankM + 10), r2(taperY + 40)],
        [r2(halfBankM + 24), r2(taperY + 40)],
        [r2(halfBankM + 24), r2(taperY + 70)],
        [r2(halfBankM + 10), r2(taperY + 70)],
      ],
    },
  ];

  const bounds = {
    minX: r2(sbX - halfBankM - 6),
    minY: -6,
    maxX: r2(Math.max(halfBankM + 24, rampEndX + SCALED_LANE_W / 2) + 10),
    maxY: r2(endY + 6),
  };

  const scenario = {
    archetype: "merge-lane",
    params: {
      approachM,
      decelM,
      mainM,
      maxspeedKmh,
      rampKmh,
      advisoryKmh,
      lanesPerDirection,
      medianM,
      rampRadiusM,
      rampSweepDeg,
      rampTailM,
    },
    lanesPerDirection,
    // Northbound lane centers (the Locator's one-way bank math) — the
    // ScenarioSpecs/trace scripts pin these by value; the district battery
    // asserts the copies against this truth (the L7 pattern).
    laneCurbX,
    laneCruiseX,
    laneLeftX,
    // The story's arclengths, in DISTRICT y (the carriageway runs on x = 0).
    taperY,
    noseY,
    endY,
    decelLaneFromY: taperY,
    decelLaneToY: noseY,
    decelEdgeId: `${idPrefix}-e-nb-decel`,
    rampEdgeId: `${idPrefix}-e-ramp`,
    // The ramp arc the trace scripts re-sample (same centre, radius, step).
    rampArc: { cx: arcCx, cy: arcCy, radiusM: rampRadiusM, sweepDeg: rampSweepDeg, stepDeg: ARC_STEP_DEG },
    rampArcEnd: [rampGeom[arcEndIdx][0], rampGeom[arcEndIdx][1]],
    rampEnd: [rampEndX, rampEndY],
    rampTailHeadingDeg: r2(rampSweepDeg),
    curveZone: {
      id: `${idPrefix}-z-ramp-curve`,
      kind: "curveAdvisory",
      signRef: KIND_TO_SIGN.curveAdvisory,
      fromM: curveFromM,
      toM: curveToM,
      advisoryKmh,
    },
    emergencyZoneIds: EMERG_HOSTS.map(([id]) => id),
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_mw_exit.mjs",
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен изход от автомагистрала с лента за намаляване и рампа — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
  // Self-validation (the gen_mw_entry invariants + the exit-specific laws)
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
  }
  const ramp = EDGES.find((e) => e.id === `${idPrefix}-e-ramp`);
  if (ramp.motorway !== undefined) {
    post.push(`${ramp.id}: the ramp must NOT carry the motorway tag — the advisory pace on a връзка is not a carriageway crawl`);
  }
  if (ramp.lanes !== 1) post.push(`${ramp.id}: the ramp is a single-lane връзка`);
  if (ramp.maxspeed !== rampKmh) post.push(`${ramp.id}: maxspeed mismatch`);
  if (INTERSECTIONS.length !== 0) post.push("the exit map must carry ZERO intersections (no stop line, no junction tracker)");
  if (CROSSINGS.length !== 0) post.push("the exit map must carry ZERO crossings");
  // The nb split nodes join exactly two collinear segments each (the
  // gen_sp_transition law: a data boundary, never an intersection); the gore
  // node is the RAMP's own start, degree 1 — so the nose stays degree 2 too.
  for (const id of [`${idPrefix}-n-taper`, `${idPrefix}-n-nose`]) {
    if ((degree.get(id) ?? 0) !== 2) post.push(`${id}: must join exactly the two collinear segments (degree 2)`);
  }
  if ((degree.get(`${idPrefix}-n-ramp-gore`) ?? 0) !== 1) {
    post.push(`${idPrefix}-n-ramp-gore: the gore is the ramp's own start node (degree 1) — never a junction`);
  }
  for (const e of CARRIAGEWAYS) {
    if (e.id === `${idPrefix}-e-sb`) continue;
    for (const [x] of e.geometry) if (x !== 0) post.push(`${e.id}: the northbound segments must stay collinear on x = 0`);
  }
  // THE ARCHETYPE'S REASON TO EXIST: exactly the decel segment lacks the span.
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  const emergEdges = new Set(ZONES.filter((z) => z.kind === "emergencyLane").map((z) => z.edgeId));
  if (emergEdges.has(`${idPrefix}-e-nb-decel`)) {
    post.push("the deceleration segment must carry NO emergencyLane span — its curb lane is a LEGAL travel lane");
  }
  for (const id of [`${idPrefix}-e-nb-approach`, `${idPrefix}-e-nb-main`, `${idPrefix}-e-sb`]) {
    if (!emergEdges.has(id)) post.push(`${id}: the curb lane outside the deceleration lane IS the аварийна лента`);
  }
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    const host = EDGES.find((e) => e.id === z.edgeId);
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not mark ${z.kind}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length + 0.01)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length}`);
    }
    if (z.kind === "emergencyLane" && !(z.fromM === 0 && z.toM === host.length)) {
      post.push(`${z.id}: an emergencyLane span must cover the full segment`);
    }
  }
  const curveZones = ZONES.filter((z) => z.kind === "curveAdvisory");
  if (curveZones.length !== 1 || curveZones[0].edgeId !== `${idPrefix}-e-ramp`) {
    post.push("exactly ONE curveAdvisory span must live on the ramp (the marked bend IS the zone)");
  }
  for (const z of curveZones) {
    if (!(Number.isFinite(z.advisoryKmh) && z.advisoryKmh > 0)) {
      post.push(`${z.id}: advisoryKmh required (an advisory-less span is inert)`);
    }
    if (z.fromM !== 0) post.push(`${z.id}: the ramp bends from metre one — the span must start at the gore`);
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
  if (laneCruiseX !== 0) post.push("cruise-lane center must sit ON the centerline");
  if (laneLeftX !== r2(-SCALED_LANE_W)) post.push("left-lane center must sit 1 lane west of the centerline");
  // The ramp must LEAVE the curb-lane center at the gore, TANGENTIALLY (no
  // lateral jump and no heading step for the driver quitting the decel lane).
  if (rampGeom[0][0] !== laneCurbX || rampGeom[0][1] !== noseY) {
    post.push("the ramp must start exactly on the curb-lane center at the gore");
  }
  const firstChordHeadingDeg =
    (Math.atan2(rampGeom[1][0] - rampGeom[0][0], rampGeom[1][1] - rampGeom[0][1]) * 180) / Math.PI;
  if (!(firstChordHeadingDeg > 0 && firstChordHeadingDeg <= ARC_STEP_DEG)) {
    post.push(`the ramp must leave the gore tangentially (first chord bears ${r2(firstChordHeadingDeg)}°, expected 0..${ARC_STEP_DEG}°)`);
  }
  // …and quit the carriageway bank within the gore allowance (the header's
  // known visual gap — the surfaces overlap there, exactly as a real gore does).
  let goreOverlapM = 0;
  for (let i = 1; i < rampGeom.length; i++) {
    if (rampGeom[i][0] < halfBankM) goreOverlapM = rampCum[i];
  }
  if (!(goreOverlapM > 0 && goreOverlapM <= RAMP_GORE_OVERLAP_MAX_M)) {
    post.push(
      `the ramp centerline stays inside the carriageway bank for ${r2(goreOverlapM)} m past the gore — keep it within ${RAMP_GORE_OVERLAP_MAX_M} m (raise rampRadiusM/rampSweepDeg)`,
    );
  }
  // Chord discipline (the gen_rural_curve law): every arc chord ≤ 10 m.
  for (let i = 1; i <= arcEndIdx; i++) {
    const chord = Math.hypot(rampGeom[i][0] - rampGeom[i - 1][0], rampGeom[i][1] - rampGeom[i - 1][1]);
    if (chord > 10) post.push(`ramp arc chord ${i} is ${r2(chord)} m (> 10 m — raise the sampling density)`);
  }
  // Arc-length sanity: the chorded polyline must sit within 1% of the true arc.
  const trueArc = (rampRadiusM * rampSweepDeg * Math.PI) / 180;
  if (Math.abs(curveToM - trueArc) > trueArc * 0.01) {
    post.push(`ramp arc polyline length ${curveToM} deviates > 1% from the true arc ${r2(trueArc)}`);
  }
  if (Math.abs(rampLen - (curveToM + rampTailM)) > 0.05) {
    post.push(`ramp length ${rampLen} != arc ${curveToM} + tail ${rampTailM}`);
  }
  // Turn-detector no-double-bill (the gen_rural_curve proof): ZERO
  // intersections keep the junction gate shut, and even the WINDOW math on the
  // ramp stays far under threshold at the ramp's own limit.
  const degPerSecAtRampLimit = ((rampKmh / 3.6) / rampRadiusM) * (180 / Math.PI);
  if (degPerSecAtRampLimit * TURN_WINDOW_SEC >= TURN_THRESHOLD_DEG) {
    post.push(
      `turn-window math broken: ${r2(degPerSecAtRampLimit * TURN_WINDOW_SEC)}°/${TURN_WINDOW_SEC}s at the ramp limit reaches the ${TURN_THRESHOLD_DEG}° threshold — widen rampRadiusM`,
    );
  }
  // RECORDER CURVE HONESTY (traces/recorder.ts):
  //  1. the 8°-per-window cap GATE stays shut on this arc, so every authored
  //     ramp speed records faithfully instead of being silently clipped;
  const windowSweepDeg = (RECORDER_CURVE_WINDOW_M / rampRadiusM) * (180 / Math.PI);
  if (windowSweepDeg > RECORDER_CURVE_GATE_DEG) {
    post.push(
      `the recorder's curve cap arms on this arc (${r2(windowSweepDeg)}° over its ${RECORDER_CURVE_WINDOW_M} m window > ${RECORDER_CURVE_GATE_DEG}°) — the authored ramp speeds would be clipped; widen rampRadiusM`,
    );
  }
  //  2. …so the √(2.4·R) comfort cap is asserted EXPLICITLY instead: the
  //     advisory must leave the gen_rural_curve guilty-demo headroom, and the
  //     authored guilty speed must stay under a genuinely drivable arc speed.
  const capKmh = Math.sqrt(RECORDER_CURVE_LAT_MPS2 * rampRadiusM) * 3.6;
  if (capKmh <= advisoryKmh + 20) {
    post.push(`recorder curve cap ${r2(capKmh)} km/h leaves no guilty-demo headroom over advisory ${advisoryKmh} — widen rampRadiusM`);
  }
  if (capKmh <= AUTHORED_RAMP_GUILTY_KMH) {
    post.push(
      `the authored guilty ramp speed ${AUTHORED_RAMP_GUILTY_KMH} km/h exceeds the ${r2(capKmh)} km/h comfort cap of this arc — the demo would be physically dishonest`,
    );
  }
  //  3. the authored ramp speeds must never leak a SPEEDING_* code into the
  //     single-code curve demo (rules: arm above limit × (1 + grace)).
  const rampGracedKmh = rampKmh * (1 + SPEEDING_GRACE_RATIO);
  if (!(AUTHORED_RAMP_GUILTY_KMH <= rampKmh && AUTHORED_RAMP_GUILTY_KMH < rampGracedKmh)) {
    post.push(
      `the authored guilty ramp speed ${AUTHORED_RAMP_GUILTY_KMH} must stay at/under the ramp limit ${rampKmh} (graced ${r2(rampGracedKmh)}) — raise rampKmh or lower the demo`,
    );
  }
  if (AUTHORED_RAMP_KMH !== advisoryKmh) {
    post.push(`the shadow rides the ramp AT the advisory: authored ${AUTHORED_RAMP_KMH} != advisory ${advisoryKmh}`);
  }
  if (!(AUTHORED_RAMP_GUILTY_KMH > advisoryKmh + 5)) {
    post.push(`the guilty ramp speed must clear the advisory grace band (advisory ${advisoryKmh} + 5)`);
  }
  // Recorder-envelope honesty on the carriageway:
  //  1. the approach must build the authored cruise from rest AND absorb the
  //     mistake demo's slam to a dead stop, with story headroom;
  const vCruise = AUTHORED_CRUISE_KMH / 3.6;
  const buildM = vCruise ** 2 / (2 * RECORDER_ACCEL_MPS2);
  const slamM = vCruise ** 2 / (2 * RECORDER_SLAM_STOP_MPS2);
  if (approachM < buildM + slamM + 120) {
    post.push(
      `approachM ${approachM} leaves no honest ${AUTHORED_CRUISE_KMH} km/h story: build ${r2(buildM)} + slam ${r2(slamM)} + 120 m headroom needed`,
    );
  }
  //  2. the deceleration lane must fit joint-grace hold → the lane shift → the
  //     brake down to the advisory, with the shift COMPLETE outside the grace
  //     window (a lane delta inside laneChangeJointGraceSec of the taper joint
  //     is dropped ungraded, which would silently gut the §9 assert);
  const graceHoldM = vCruise * LANE_CHANGE_JOINT_GRACE_SEC;
  const shedM = (vCruise ** 2 - (advisoryKmh / 3.6) ** 2) / (2 * RECORDER_DECEL_MPS2);
  if (decelM < graceHoldM + AUTHORED_MERGE_RUN_M + shedM + 20) {
    post.push(
      `decelM ${decelM} leaves no honest exit: joint-grace hold ${r2(graceHoldM)} + shift ${AUTHORED_MERGE_RUN_M} + shed ${r2(shedM)} + 20 m headroom needed`,
    );
  }
  //  2b. …and it must stay short enough in TIME that the span gap's keep-right
  //     side effect can never bill the driver who simply declines the exit and
  //     holds laneId 1 down it (see the KEEP_RIGHT_SUSTAIN_SEC note).
  const declineSec = decelM / vCruise;
  if (declineSec >= KEEP_RIGHT_SUSTAIN_SEC) {
    post.push(
      `decelM ${decelM} takes ${r2(declineSec)} s at ${AUTHORED_CRUISE_KMH} km/h — at/over the ${KEEP_RIGHT_SUSTAIN_SEC} s keep-right sustain, so declining the exit in laneId 1 would grade NOT_KEEPING_RIGHT; shorten decelM`,
    );
  }
  //  3. the mainline past the gore must carry the „изпуснах изхода — карам
  //     нататък" continuation at the authored cruise AND a stop inside it.
  const stopM = vCruise ** 2 / (2 * RECORDER_STOP_MPS2);
  if (mainM < stopM + 150) {
    post.push(`mainM ${mainM} leaves no honest missed-exit continuation: stop ${r2(stopM)} + 150 m headroom needed`);
  }
  // The crawl detector's floor must sit far under both posted limits, and the
  // advisory must stay above it (the shadow's ramp pace is not a crawl).
  if (!(maxspeedKmh > 50)) post.push("maxspeed must exceed the чл. 54 50 km/h flow floor");
  if (!(advisoryKmh > 50)) post.push("the ramp advisory must stay above the чл. 54 50 km/h flow floor");
  // Spawns on their declared edges, on the authored lane/ramp centers.
  for (const s of SPAWN_POINTS) {
    if (!edgeIdSet.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
  }
  if (Math.abs(SPAWN_POINTS[0].x - laneLeftX) > 0.01 || SPAWN_POINTS[0].y < 0 || SPAWN_POINTS[0].y > taperY) {
    post.push(`${SPAWN_POINTS[0].id}: not on the approach's left lane`);
  }
  if (Math.abs(SPAWN_POINTS[1].x - laneCurbX) > 0.01 || SPAWN_POINTS[1].y <= taperY || SPAWN_POINTS[1].y >= noseY) {
    post.push(`${SPAWN_POINTS[1].id}: not inside the deceleration lane`);
  }
  const tailDx = rampEndX - rampGeom[arcEndIdx][0];
  const tailDy = rampEndY - rampGeom[arcEndIdx][1];
  const tailOffCenter = Math.abs(
    (tailDx * (SPAWN_POINTS[2].y - rampGeom[arcEndIdx][1]) - tailDy * (SPAWN_POINTS[2].x - rampGeom[arcEndIdx][0])) /
      Math.hypot(tailDx, tailDy),
  );
  if (tailOffCenter > 0.02) post.push(`${SPAWN_POINTS[2].id}: not on the ramp tail centerline (off by ${r2(tailOffCenter)} m)`);
  // Buildings clear of both carriageways and of the ramp corridor.
  for (const b of BUILDINGS) {
    for (const [x, y] of b.footprint) {
      if (x > sbX - halfBankM && x < halfBankM) post.push(`${b.id}: footprint inside a carriageway bank`);
      if (y > noseY - 60) post.push(`${b.id}: footprint too close to the gore / ramp corridor`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_mw_exit self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (SP-10 „Магистрала" изход + SP-05 on the връзка)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mw-exit-v1",
    label: "Учебен изход от автомагистрала — лента за намаляване и рампа (сценарий SP-10/SP-05)",
    idPrefix: "mwx",
    approachM: 520,
    decelM: 280,
    mainM: 420,
    maxspeedKmh: 140,
    rampKmh: 90,
    advisoryKmh: 60,
    lanesPerDirection: 2,
    medianM: 6,
    rampRadiusM: 250,
    rampSweepDeg: 45,
    rampTailM: 60,
    noteBg:
      "Изход от автомагистрала: престрой се в дясната лента навреме, влез в лентата за намаляване и намали ЧАК в нея — рампата е с препоръчителна скорост 60 км/ч. Ако изпуснеш изхода, продължаваш до следващия: спиране и движение назад по магистралата са забранени.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildMotorwayExit(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== mw-exit build: ${params.districtId} ===`);
  console.log(`  segments                   approach ${params.approachM} → decel ${params.decelM} → main ${params.mainM} m @ ${params.maxspeedKmh} km/h`);
  line("taper / nose / end", `y = ${sc.taperY} / ${sc.noseY} / ${sc.endY}`);
  line("NB lane centers", `curb x=${sc.laneCurbX}, cruise x=${sc.laneCruiseX}, left x=${sc.laneLeftX}`);
  line("ramp", `${district.roads.edges.find((e) => e.id === "mwx-e-ramp").length} m @ ${params.rampKmh} km/h (no motorway tag)`);
  line("ramp arc", `R${params.rampRadiusM} × ${params.rampSweepDeg}° around (${sc.rampArc.cx}, ${sc.rampArc.cy}) → (${sc.rampArcEnd[0]}, ${sc.rampArcEnd[1]})`);
  line("curve zone", `${sc.curveZone.signRef} curveAdvisory ${sc.curveZone.advisoryKmh} km/h @ [${sc.curveZone.fromM}, ${sc.curveZone.toM}] m`);
  line("emergency spans", district.zones.filter((z) => z.kind === "emergencyLane").map((z) => `${z.edgeId}@[${z.fromM},${z.toM}]`).join(", "));
  line("decel lane (NO span)", `${sc.decelEdgeId} — y ∈ [${sc.decelLaneFromY}, ${sc.decelLaneToY}]`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
