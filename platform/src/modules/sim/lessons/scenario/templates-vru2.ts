/**
 * Scenario templates — the VULNERABLE-ROAD-USER family, SECOND file (doc 76
 * §2 chip "vru"; templates-vru.ts holds VU-01/02/04/09/10):
 *
 *  - sc-vu-blindspot-moto  „Мотор в мъртвата зона"       (VU-07, ln-v1)
 *  - sc-vu-cyclist-group   „Изпреварване на група ..."   (VU-02, vu-pass-v1)
 *  - sc-vu-child-cyclist   „Дете на колело лъкатуши"     (VU-03, vu-child-v1)
 *
 * The wave-2 member is staged on the committed ln-v1 boulevard (the
 * sc-lane-change map, reused — a plain 2+2 straight is exactly where the
 * queue-filtering drill lives); the wave-4 member reuses vu-pass-v1, the
 * junction-free 1+1 street sc-vu-pass-clearance already proves; the wave-7
 * member is the only one with a map of its own (vu-child-v1 — the same
 * junction-free bones at жилищна scale, plus an authored mid-block swerve arc
 * the street itself owns; tools/maps/gen_vu_child.mjs).
 *
 * DATA ONLY, the templates.ts mold: every coordinate below is denormalized
 * from the committed district file (meta.scenario), so nothing loads world
 * JSON at runtime; the district battery (world/__tests__/ln-district.test.ts
 * + vu-blindspot-districts.test.ts) and the trace gate assert every pinned
 * value against the generated map.
 *
 * WHY THE MAP GRADES THIS FOR FREE: ln-v1 carries NO signal, sign, crossing,
 * junction or ban span — the ONLY thing the rule engine can grade on it is the
 * player's own lane-change channel (laneId 0 → 1 within one edge, adjudicated
 * on indicator + mirror) and the speed envelope against the posted 50. So the
 * demos convict on exactly the doc-72 VU-07 pair and nothing else.
 *
 * HONEST v1 PROXY (flagged twice over — doc 72 VU-07 reads „🔴 NEW: narrow
 * fast actor with between-lane pathing … grading falls to
 * LANE_CHANGE_WITHOUT_MIRROR_CHECK + collision(vehicle); the actor is the
 * missing half"):
 *   1. THE PATHING half IS authorable today and is authored here: the shipped
 *      rearTailgater rides `extraRightOffsetM` −4.6 off the graph's curb lane
 *      — x = 7.59, hugging the lane DIVIDER, which is between-lane pathing in
 *      the doc-72 sense and, not by accident, the driver's left blind spot. It
 *      matchPlayer-paces a gap behind the player through the crawl, then
 *      laneShift-passes into the LEFT lane (x = 4.06) — the lane the player
 *      wants. That is the whole drill: the мотор lives where you are going.
 *   2. THE RIG half does NOT exist: VehicleProfile is car|van|truck|emergency|
 *      tram — there is no narrow PTW mesh, so the rider renders as the
 *      smallest shipped rig (profile omitted = "car"). A motorcycle model is a
 *      later asset item; the copy carries the rider, and NOTHING grades off
 *      the rig's width (the runner is pressure scenery — see below).
 *   3. THE COLUMN is copy, not actors: ln-v1 runs ambient traffic ZERO under
 *      the harness law and the item stages ONE actor. „Бавната колона" lives
 *      in the objective/annotations; the graded content is the lane change.
 *
 * The rearTailgater runner emits ZERO SimTick events by contract (doc 72
 * FO-07 pressure scenery, A12) — no violation and no collision can originate
 * from the rider. Everything the gate asserts comes from the PLAYER's own
 * channels, and the collision demo's contact is an AUTHORED beat
 * (DriveStep.collision — the scMergeAccelLane precedent), never a silent
 * detector.
 *
 * SHOULDER-CHECK HONESTY (the item's own flag): the rule engine has ONE
 * direction-keyed glance channel — `mirrorGlance: "left"` covers огледало AND
 * рамо together; a "rear" glance does not satisfy it. So the taught ritual
 * (ляво огледало → мигач → рамо → волан) is what the copy and the rubric's
 * observation moments carry, while the engine grades the direction: the
 * mirror-only demo glances REAR and never LEFT, which is exactly the fault it
 * is named for — гледане в огледалото за обратно виждане is not проверка на
 * лявата мъртва зона.
 *
 * Both mistake demos cite SHIPPED rules-catalog codes and grade EXACTLY them
 * through the production stack (the §5/§9 gates, traces/__tests__/
 * sc-vu-blindspot-moto-traces.test.ts):
 *   - „Престрояване само по огледало" → LANE_CHANGE_WITHOUT_MIRROR_CHECK +
 *     COLLISION (the indicator is ON — signalling is not looking);
 *   - „Престрояване без мигач пред моториста" → LANE_CHANGE_WITHOUT_INDICATOR
 *     (the glance is there — the rider was SEEN and still not announced to).
 */

import type {
  CutInLeadCarSpec,
  CyclistRightHookSpec,
  OncomingStreamSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// sc-vu-blindspot-moto — „Мотор в мъртвата зона" (VU-07 „Мотор между колоните")
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const VUB_X_RIGHT = 12.19; // laneId 0 — the crawling column's lane
const VUB_X_LEFT = 4.06; // laneId 1 — the target lane (and the rider's exit)
/**
 * The rider's FILTERING LINE: hugging the drawn lane boundary (x = 8.125),
 * 0.54 m into the target lane's half. Deliberately NOT the boundary itself —
 * the traffic system's lead corridor is LEAD_CORRIDOR_M = 4.0 m either side of
 * the player's path, and the boundary sits 4.07 m off the right-lane center,
 * i.e. 7 cm outside it. That margin is load-bearing (a rider INSIDE the
 * corridor while drawing level would read as a zero-gap lead and fire
 * FOLLOWING_TOO_CLOSE on an innocent player), so it is bought properly: 7.59
 * puts 4.60 m between the lines — 0.60 m of daylight past the corridor,
 * asserted by the vu-blindspot-districts battery. Still visually between the
 * lanes: this is the лепка pose of a rider splitting a crawling column.
 */
const VUB_X_FILTER = 7.59;

/**
 * The staged MOTORCYCLIST on ln-v1: the shipped rearTailgater actor offset onto
 * the filtering line (extraRightOffsetM −4.6 off the curb lane ⇒ x = 7.59, the
 * divider), held dormant 15 m behind the spawn, released once the player is
 * genuinely up the boulevard. It closes on a tight ~10 m gap — the лепка pose
 * IS the filtering rider's pose — holds it through the pressure window, then
 * squirts past at ~58 km/h and settles in the LEFT lane: the lane the player
 * is about to take.
 *
 * PRESSURE SCENERY (doc 72 FO-07, A12): the runner emits ZERO SimTick events —
 * no violation and no collision can grade from it. See the module header for
 * the two halves of the VU-07 proxy (pathing: authored; narrow rig: absent).
 */
const VUB_MOTO: RearTailgaterSpec = {
  id: "sc-vubs-moto",
  kind: "rearTailgater",
  libraryEventId: "ev-lane-change",
  actor: {
    // ln-v1 is one edge: start → end, northbound.
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind ln-spawn-start
    cruiseSpeedMps: 14,
    // The graph's lane rides the CURB lane (x = 12.19); −4.6 lands the rider
    // on the filtering line x = 7.59 — between the lanes, in the blind spot,
    // and clear of the lead corridor (see VUB_X_FILTER).
    extraRightOffsetM: VUB_X_FILTER - VUB_X_RIGHT,
    colorIndex: 3,
  },
  releaseGapM: 25, // the player is ~25 m up the boulevard before it rolls
  followBehindM: 10, // ~6 m of bumpers — the filtering rider's own pose
  maxMatchSpeedMps: 20,
  pressureSec: 4,
  passShiftM: VUB_X_LEFT - VUB_X_FILTER, // the pass lands in the LEFT lane
  passSpeedMps: 16, // ~58 km/h — the rider squirts away up the boulevard
  passAheadM: 40,
  easeKmh: 5,
};

/**
 * VU-07 — мотор между колоните (ЗДвП чл. 25, ал. 1: преди да започне
 * престрояване, водачът е длъжен да се убеди, че няма да създаде опасност за
 * движещите се по лентата, в която навлиза — и да подаде сигнал; чл. 42:
 * мотоциклетистът има право на цялата лента. Bank-verified: q-uyazvimi-031
 * grounds precisely the queue lane-change duty toward filtering riders at
 * чл. 25, q-vehicle-034 the shoulder-glance duty, q-uyazvimi-050/061 the
 * чл. 42 lane-width and огледало+мъртва зона pair).
 */
export const SC_VU_BLINDSPOT_MOTO: ScenarioSpec = {
  id: "sc-vu-blindspot-moto",
  family: "vru",
  tagsBg: ["мотоциклетист", "мъртва зона", "смяна на лента", "колона", "уязвими участници"],
  titleBg: "Мотор в мъртвата зона",
  objectiveBg:
    "Преди престрояване в колона провери огледало И рамо — мотористът, който се промъква между лентите, живее точно в мъртвата ти зона.",
  archetypeIds: ["VU-07"],
  conceptIds: ["c-motorcyclists-visibility", "c-mirrors-blind-spots", "c-lane-change"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ln-v1.json meta.scenario.params
    // (tools/maps/gen_two_lane_road.mjs; map REUSED from sc-lane-change).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Движението пълзи. Карай спокойно в дясната лента и не бързай да се местиш в „по-бързата“ съседна лента.",
    },
    {
      n: 2,
      textBg:
        "Погледни в лявото огледало — и веднага след това през лявото рамо. Между лентите се промъква мотор.",
    },
    {
      n: 3,
      textBg:
        "Точно там огледалото не стига: мъртвата зона е с размера на цял мотоциклет. Рамото е единственото, което я покрива.",
    },
    {
      n: 4,
      textBg:
        "Изчакай моториста да отмине изцяло — той се движи по-бързо от колоната и минава по разделителната линия.",
    },
    {
      n: 5,
      textBg:
        "Чак когато е чист: ляво огледало, ляв мигач, поглед през рамо — и тогава воланът. Мигачът обявява, рамото проверява.",
    },
    { n: 6, textBg: "Влез плавно в лявата лента, изключи мигача и продължи." },
  ],
  success: [
    {
      id: "sc-vubs-let-pass",
      titleBg: "Изчакай моториста, вместо да се престроиш пред него",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the RIGHT
      // lane. Reaching it at column pace IS „не се престрои пред мотора" —
      // a driver who moved left early is at x ≈ 4.06 here and misses it.
      params: { kind: "reachZone", x: VUB_X_RIGHT, y: 200, radiusM: 4, maxSpeedKmh: 45 },
    },
    {
      id: "sc-vubs-changed",
      titleBg: "Престрой се в лявата лента, след като е преминал",
      // Same lane-pinning radius on the TARGET lane — the completed maneuver.
      params: { kind: "reachZone", x: VUB_X_LEFT, y: 320, radiusM: 4 },
    },
    {
      id: "sc-vubs-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: VUB_X_LEFT, y: 375, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-vubs-glance-mirror", titleBg: "Ляво огледало, докато колоната пълзи" },
        { id: "sc-vubs-glance-shoulder", titleBg: "Поглед през рамо в мъртвата зона, преди волана" },
      ],
    },
    parTimeSec: 65,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVuBlindspotMoto.ts; the §5 gate (shadow replays with ZERO
  // violations + SAFE_LANE_CHANGE) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vu-blindspot-moto-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-blindspot-moto/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-blindspot-moto/mistake-mirror-only.trace.json" },
      titleBg: "Престрояване само по огледало",
      whatWentWrongBg:
        "Водачът погледна в огледалото за обратно виждане, видя „чисто“ и зави наляво — с мигач, но без нито един поглед към лявата мъртва зона. А мотористът беше точно там: между лентите, в единствения сектор, който огледалата не покриват. Мъртвата зона е с размера на цял мотоциклет — затова чл. 25 иска да се УБЕДИШ, че не застрашаваш движещите се в лентата, а не да предположиш. Огледало и поглед през рамо — и двете, преди волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-blindspot-moto/mistake-no-indicator.trace.json" },
      titleBg: "Престрояване без мигач пред моториста",
      whatWentWrongBg:
        "Този път водачът се огледа — огледало и рамо — и ВИДЯ моториста. И въпреки това тръгна наляво без мигач, разчитайки, че „щом го виждам, всичко е наред“. Не е: мотористът няма как да прочете намерението ти. На мотор няма ламарина, спирачният му път по мокра разделителна линия е дълъг, а изненадата е единственото, което го поваля. Мигачът предхожда маневрата — той е за ДРУГИТЕ, не за теб (чл. 25).",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
  ],
  teach: {
    whenBg:
      "При всяко престрояване в бавно или спряло движение — на булевард, пред светофар, в задръстване. Точно там моторите се движат между редиците и изникват за секунда; същото важи и за куриерите на велосипед и тротинетки.",
    whyBg:
      "Мотористът е тесен, бърз и тих — трите неща, които правят огледалото лъжец. Той се побира изцяло в мъртвата зона и се движи по-бързо от колоната, така че между два твои погледа изминава десетки метри. Затова редът е железен и еднакъв за всички: огледало, мигач, рамо, волан. Погледът през рамо трае половин секунда и покрива точно сектора, който огледалата изпускат — това е цялата разлика между забелязан и ударен мотоциклетист.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа: проверка на огледалото И осезаем поглед през рамо преди всяко престрояване, навременен мигач ПРЕДИ маневрата, и плавно навлизане, което не принуждава никого в съседната лента да реагира. Престрояване без поглед през рамо или без мигач е основна грешка; отрязването на движещ се в лентата е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: rain. Deliberately NO physics.wetGrip — the authored ghost envelope
    // of this template is dry-tuned (the ADR-006 stage-4a opt-in rule); the
    // taught delta here is visibility (a wet mirror reads worse, the rider
    // sits closer), not braking distance.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [VUB_MOTO],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vu-cyclist-group — „Изпреварване на група велосипедисти" (VU-02, the
// COLUMN variant) on the reused vu-pass-v1 street
// ---------------------------------------------------------------------------

/** vu-pass-v1 northbound lane center (meta.scenario.laneCenterRightM). */
const VUG_LANE_X = 4.06;
/** The riders' shared curb line: lane center + extraRightOffsetM 2.6 — the
 *  SAME line sc-vu-pass-clearance pins (vu-streets battery CYCLIST_X). */
const VUG_RIDER_X = 6.66;
/**
 * THE WIDE LINE — x = −2.0, i.e. genuinely ON THE ONCOMING BANK, and that is
 * the whole difference from sc-vu-pass-clearance (one rider, nudged past from
 * inside the own lane at x 2.2). Three numbers force it:
 *  1. CLEARANCE: 8.66 m of centers ≈ 7.4 m of air — far past the 2.75 m SAFE
 *     bar, because a column is passed ONCE and the margin must survive all
 *     five riders (runtime VULNERABLE_PASS_SAFE_LATERAL_M).
 *  2. THE LEAD CORRIDOR (4.0 m either side of the player's path): riders
 *     INSIDE it read as a zero-gap lead and would fire FOLLOWING_TOO_CLOSE on
 *     an innocent driver. 8.66 buys 4.66 m of daylight — the own-lane line
 *     (4.46) buys only 0.46, which is fine past ONE rider and reckless past a
 *     ~80 m column the player rides beside for ~15 s.
 *  3. LANE-KEEPING: laneKeepMaxOffsetM = 1.3 × PERCEPTUAL_ROAD_SCALE = 3.25 m,
 *     and −2.0 sits 2.06 m off the SOUTHBOUND lane center (−4.06) — inside the
 *     bar. The band between x ±0.81 is off-center for BOTH lanes; the drives
 *     cross it in well under laneKeepSustainSec (3 s), so the transit is free
 *     and only LOITERING on the crown would grade. This is why the pass line
 *     is −2.0 and not −0.5.
 * Crossing the center line is FREE here by construction: vu-pass-v1 carries
 * `zones: []` — no М1 span exists, so CROSSED_SOLID_LINE cannot arm (it is the
 * sc-vu-door-zone map that owns the solid-line canvas).
 */
const VUG_PASS_X = -2.0;
/**
 * COLUMN SPACING — the load-bearing number, not a styling choice. The
 * vulnerable-pass tracker is SINGLE-TARGET and identity-blind: it follows
 * whatever `cyclistNear` says is the NEAREST rider, adjudicates when that
 * rider falls VULNERABLE_PASS_DONE_BEHIND_M (8 m) behind, then re-arms on the
 * next one. With spacing S, the query flips forward at the midpoint (S/2), so
 * per-rider adjudication needs S/2 > 8 ⇒ S > 16 m. At S = 20 the rider being
 * graded is still the nearest by 8 m vs 12 m when its bill lands, and the flip
 * happens 2 m later on dead ground — every rider gets his own verdict.
 * A tighter column would flip the target MID-EPISODE, and because the tracker
 * measures the swerve stand-down against the line it froze at ARM, the new
 * rider's offset line would read as a huge „swerve" and stand the episode down
 * — a column packed realistically tight would grade NOTHING. 20 m is the
 * honest price of the shipped tracker; asserted in the district battery
 * against the runtime constant itself.
 */
const VUG_SPACING_M = 20;
/** The tail rider's start line (y, district space) — the lead sits at +80. */
const VUG_TAIL_Y = 100;
/** vu-pass-v1 is one 360 m edge start → end; holds are arcs off the END node. */
const VUG_STREET_M = 360;

/**
 * THE COLUMN — five riders on the east curb at 3 m/s (~11 km/h), nose to tail
 * over 80 m. REUSED cyclistRightHook kind ×5 (NO new actor type — the N8
 * mandate; the sc-vu-pass-clearance recipe, replicated): the "junction" is the
 * far end node nobody ever turns right at, so each runner contributes only its
 * release choreography + the collision(cyclist) contact channel, and
 * releaseDistM 360 exceeds the spawn's ~345 m node distance, so the whole
 * column rolls from the first frame (no hold theater on an empty street).
 * The GRADING is the runtime's vulnerable-pass tracker, once per rider.
 * A11: extraRightOffsetM > 0 at stage time is what tags each proxy a CYCLIST —
 * it drives both `cyclistNear` (the tracker's feed) and collision(cyclist).
 */
const VUG_COLUMN: readonly CyclistRightHookSpec[] = [1, 2, 3, 4, 5].map((n) => ({
  // n = 1 is the LEAD rider (furthest up the street), n = 5 the tail.
  id: `sc-vug-rider-${n}`,
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vup-n-end", x: 0, y: VUG_STREET_M },
  actor: {
    pathNodes: ["vup-n-start", "vup-n-end"],
    hold: {
      nodeIndex: 1,
      offsetM: VUG_TAIL_Y + (5 - n) * VUG_SPACING_M - VUG_STREET_M,
    },
    cruiseSpeedMps: 3,
    extraRightOffsetM: VUG_RIDER_X - VUG_LANE_X, // 2.6 — the curb line
    colorIndex: n,
  },
  junctionNodeIndex: 1,
  releaseDistM: VUG_STREET_M,
  dangerRadiusM: 9, // inert here — no right turn exists on this street
  conflictWindowM: 25,
}));

/**
 * THE ONCOMING CAR — ONE southbound car (count 1) held at y = 110 and released
 * the moment the player rolls, meeting him at y ≈ 50 while the column is still
 * ~70 m up the street. It is not scenery: the wide line is the ONCOMING BANK,
 * so the overtake corridor arms for the whole pass, and a car still inside the
 * 4-second window (OVERTAKE_CONVICT_GAP_SEC) when the player commits grades
 * OVERTAKE_INSUFFICIENT_GAP. ONE car is the honest count — clearing an 80 m
 * column needs ~15 s of UNBROKEN excursion (measured: y 78 → 268), which is
 * longer than any stream's headway can offer, so a second car would make the
 * drill unpassable rather than harder. THAT is the
 * lesson the objective states: a column is one long commitment, and the whole
 * commitment must fit in the gap you can see.
 */
const VUG_ONCOMING: OncomingStreamSpec = {
  id: "sc-vug-oncoming",
  kind: "oncomingStream",
  libraryEventId: "ev-cyclist",
  actor: {
    pathNodes: ["vup-n-end", "vup-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: VUG_STREET_M - 110 }, // y = 110
    cruiseSpeedMps: 12,
    colorIndex: 6,
  },
  count: 1,
  gapsM: [], // length count − 1
  releaseKmh: 3, // rolls as soon as the player does
};

/**
 * VU-02, the COLUMN variant — изпреварване на група велосипедисти (ЗДвП чл. 42:
 * изпреварваш велосипедист само с ДОСТАТЪЧНО странично разстояние, и само след
 * като си се убедил, че пътят е свободен на разстояние, достатъчно за ЦЯЛАТА
 * маневра. Bank-verified: q-uyazvimi-045 grounds the clearance duty at чл. 42,
 * q-magistrali-i-izvangradsko-039 / q-manevri-040 the „free road, enough for
 * the whole maneuver" precondition, q-uyazvimi-051 the group case. The 1.5 m
 * figure is the taught BG/EU GUIDANCE, not a statutory number — the copy
 * teaches it, the tracker convicts only under ~1.2 m of air).
 *
 * WHY IT IS NOT A DUPLICATE of sc-vu-pass-clearance (same map, same archetype,
 * same actor kind): that template grades the LATERAL MARGIN past one rider from
 * inside your own lane. This one grades the COMMITMENT — five verdicts instead
 * of one, on the oncoming bank, where the graded question is whether you sized
 * the gap for all 80 m before you left your lane. One act; five bills.
 */
export const SC_VU_CYCLIST_GROUP: ScenarioSpec = {
  id: "sc-vu-cyclist-group",
  family: "vru",
  tagsBg: [
    "велосипедисти",
    "група",
    "изпреварване",
    "странична дистанция",
    "насрещно движение",
    "уязвими участници",
  ],
  titleBg: "Изпреварване на група велосипедисти",
  objectiveBg:
    "Изпревари колоната от петима с ЕДНА дълга маневра, минимум 1,5 м страничен просвет, и никога не се прибирай между колелата.",
  archetypeIds: ["VU-02"],
  conceptIds: ["c-cyclists", "c-overtaking-procedure", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-pass-v1.json meta.scenario.params
    // (tools/maps/gen_vu_streets.mjs; map REUSED from sc-vu-pass-clearance).
    params: { lengthM: 360, maxspeedKmh: 50, variant: "pass" },
    districtId: "vu-pass-v1",
  },
  start: {
    spawnPointId: "vup-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Пред теб по десния бордюр кара група от петима велосипедисти — колоната е дълга близо 80 метра.",
    },
    {
      n: 2,
      textBg:
        "Не се залепяй зад последния и не изпреварвай „на части“. Групата се изпреварва като едно цяло — с една маневра.",
    },
    {
      n: 3,
      textBg:
        "Първо прецени насрещното: маневрата е дълга около 15 секунди. Изчакай насрещната кола да отмине и чак тогава реши.",
    },
    {
      n: 4,
      textBg:
        "Огледало, ляв мигач и излез широко — толкова широко, че да минеш и петимата с поне метър и половина въздух.",
    },
    {
      n: 5,
      textBg:
        "Дръж линията покрай цялата колона. Не се прибирай между колелата — там няма място за теб, а за тях няма изход.",
    },
    {
      n: 6,
      textBg:
        "Прибери се плавно чак когато и ПЪРВИЯТ велосипедист е изцяло в огледалото ти за обратно виждане.",
    },
  ],
  success: [
    {
      id: "sc-vug-wide",
      titleBg: "Изпревари цялата колона по широката линия",
      // Radius 5 < the 6.06 m to the lane center: satisfiable ONLY from the
      // oncoming bank — a driver who nudged past inside his lane misses it.
      params: { kind: "reachZone", x: VUG_PASS_X, y: 190, radiusM: 5 },
    },
    {
      id: "sc-vug-back",
      titleBg: "Прибери се в лентата чак след първия велосипедист",
      params: { kind: "reachZone", x: VUG_LANE_X, y: 290, radiusM: 6 },
    },
    {
      id: "sc-vug-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: VUG_LANE_X, y: 325, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-vug-glance-oncoming", titleBg: "Преценка на насрещното преди маневрата" },
        { id: "sc-vug-glance-mirror", titleBg: "Огледало преди излизането и преди прибирането" },
      ],
    },
    parTimeSec: 80,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVuCyclistGroup.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY from five clean verdicts) and the §9
  // stage-5 code asserts run in traces/__tests__/sc-vu-cyclist-group-traces.
  // test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-cyclist-group/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-group/mistake-narrow.trace.json" },
      titleBg: "Тесен просвет покрай колоната",
      whatWentWrongBg:
        "Колата се провря покрай цялата колона, без изобщо да излезе от лентата си — на около метър въздух от всеки от петимата, един след друг. Законът иска ДОСТАТЪЧНА странична дистанция (чл. 42), а таксата за грешка при група е петорна: това не е един риск, а пет поредни. На метър всяко клатушкане — дупка, шахта, порив на вятъра — е сблъсък. Групата не се „провира“: или излизаш широко, или оставаш зад нея.",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-group/mistake-cut-in.trace.json" },
      titleBg: "Прибиране между велосипедистите",
      whatWentWrongBg:
        "Началото беше правилно: широка дъга и двама изпреварени с истински просвет. После водачът се уплаши от дългата маневра и се прибра „в дупката“ между третия и втория. Сметката дойде на три части и за един-единствен ход: притисна третия до бордюра (без просвет), падна на метри зад втория (без дистанция) и го удари. Между два велосипедиста НЯМА пролука — тя е дълга колкото колата ти, тоест е място за кола само погледнато от насрещната лента, а не и когато си в нея. Изпреварването на група завършва след ПОСЛЕДНИЯ преден велосипедист или изобщо не започва (чл. 42).",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE", "FOLLOWING_TOO_CLOSE", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато пред теб има повече от един велосипедист — извън града в неделя, по крайградските шосета, по алеите към Витоша. Същото важи за група тротинетки, за каруца с колело зад нея и за всяка колона, която не можеш да подминеш с едно кратко отклонение.",
    whyBg:
      "Групата променя аритметиката, не правилото. Един велосипедист се изпреварва за две секунди; колона от петима е близо 80 метра, а ти я задминаваш с около 30 км/ч разлика — значи стоиш в насрещната лента около 15 секунди и изминаваш почти двеста метра. Точно затова чл. 42 иска свободен път за ЦЯЛАТА маневра, а не само за началото ѝ: прозорецът се преценява за края, не за старта. Оттук идва и забраната да се прибираш между колелата — „пролуката“ между двама велосипедисти е дълга колкото колата ти и няма никакъв резерв; влезеш ли в нея, отнемаш на предния спирачния път, а на задния — единствения изход. Ако прозорецът не стига за всички петима, отговорът не е половин изпреварване, а търпение: изчакваш зад колоната. Изпреварването на група е решение, което се взема ВЕДНЪЖ и се изпълнява докрай.",
    lawRef: "ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа: преценка на насрещното ПРЕДИ маневрата (в секунди, за цялата дължина на колоната), огледало и мигач, едно решително и широко излизане, задържана линия покрай всички велосипедисти и прибиране чак след последния от тях. Провирането покрай колоната и прибирането между два велосипеда са грешки; принудата върху велосипедист е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху същата колона: the RENDER/conditions axis only.
    //
    // The backlog asked this rung for CROSSWIND („the riders' wobble widens —
    // the pass gap must grow"). It is not authorable, for two independent
    // reasons, and both are worth the ink:
    //  1. THE SEAM: `physics` is a TEMPLATE-WIDE ScenarioSpec field — LevelSpec
    //     carries `conditions` but no physics override — so opting in would blow
    //     wind through L1 too, against a dry/calm-tuned ghost (ADR-006 stage 4a;
    //     the same wall sc-ac-night-overdrive and sc-hz-emergency-stop hit).
    //  2. THE MECHANISM: `crosswind` blows the STUDENT's car (CROSSWIND_BRIDGE_N
    //     + the deterministic gust). Staged actors are path-locked, so it could
    //     never widen a rider's wobble — the backlog's stated rationale does not
    //     describe the shipped capability. When LevelSpec.physics lands, this
    //     rung takes crosswind for the honest reason: holding a wide, steady
    //     line past a column for 15 s in wind is the harder version of the SAME
    //     skill.
    // Rain (no wetGrip — the dry-tuned-ghost rule, exactly as the VU-07 rung
    // above) carries the authorable delta: a wet crown, a slicker line and five
    // riders who look less predictable through a wet windscreen.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [...VUG_COLUMN, VUG_ONCOMING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vu-child-cyclist — „Дете на колело лъкатуши" (VU-03 „Колелото завива около
// дупка" + VU-02's lateral machinery) on the NEW vu-child-v1 residential street
// ---------------------------------------------------------------------------

/** vu-child-v1 meta.scenario.laneCenterRightM — the northbound lane center. */
const VUCC_LANE_X = 4.06;
/** meta.scenario.wobble.curbXM — the child's line BEFORE the swerve. The SAME
 *  curb line sc-vu-pass-clearance and sc-vu-cyclist-group ride (lane center +
 *  extraRightOffsetM 2.6): three templates, one cyclist line, one set of proven
 *  lateral numbers. */
const VUCC_CURB_X = 6.66;
/**
 * meta.scenario.wobble.apexXM — where the swerve LEAVES him, and the number the
 * whole template turns on. 4.66 is 0.6 m east of the driver's own lane center:
 * after the wobble the child is not „near the curb", he is IN YOUR LANE. Every
 * clearance in this drill is measured against THIS line, never against 6.66 —
 * which is precisely the mistake the second demo commits.
 */
const VUCC_APEX_X = 4.66;
/** meta.scenario.wobble — the authored mid-block swerve-out, district space. */
const VUCC_WOBBLE_Y = 100;
const VUCC_WOBBLE_RADIUS_M = 2;
const VUCC_WOBBLE_ARC_M = 6.5;
const VUCC_WOBBLE_AMPLITUDE_M = 2.0;
/** ~9.4 km/h — a child's pedalling pace, not an adult commuter's. It is also a
 *  grading dial: the pass floor is 15 km/h and the follow detector's floor is
 *  20, so the demos have to squeeze in a 15–20 km/h band, and only a genuinely
 *  slow child leaves enough closing speed inside it to complete a pass at all. */
const VUCC_CHILD_MPS = 2.6;
/** The taught wide line — the oncoming bank (vu-child-v1 carries `zones: []`,
 *  so no М1 span exists and crossing the crown is free by construction). */
const VUCC_WIDE_X = -2.0;
/** vu-child-v1 is one 300 m edge, start → end. */
const VUCC_STREET_M = 300;

/**
 * THE CHILD — the shipped cutInLeadCar actor, repurposed whole. Doc 72 VU-03
 * reads „🔴 NEW: path-deviation command for staged actors (scripted lateral
 * offset pulse at a trigger point)"; that command turned out to be ALREADY
 * SHIPPED as the FO-03 cut-in's own machinery, so this template needs no engine
 * work — it needs the right actor. Four dials do the whole job:
 *
 *  1. THE RIG + THE GRADING TAG: `extraRightOffsetM` +2.6 puts him on the curb
 *     line AND tags him a CYCLIST (A11 vehicleCollisionKind — the marker that
 *     drives `cyclistNear`, which is the vulnerable-pass tracker's only feed).
 *     The spec's own doc-comment says to keep the offset ≤ 0 „a positive curb
 *     offset tags the actor as a cyclist proxy" — here that IS the requirement.
 *  2. THE PACE: matchPlayer with `paceAheadM` 400 — an unreachable gap, so the
 *     proportional law's target (playerMps + 0.55 × (400 − gap)) is ALWAYS far
 *     above `maxMatchSpeedMps`, and the actor simply saturates the cap. Net
 *     effect: a dead-constant 2.6 m/s from the first frame the player rolls,
 *     never slaved to the player's speed. A small paceAheadM would have made
 *     the child brake to a stop whenever the driver hung back — the opposite of
 *     a child, who pedals on regardless of what you do.
 *  3. THE WOBBLE: `cutAt` is a point on the ACTOR's path, so the swerve fires
 *     at an authored MID-BLOCK LOCATION (the drain at y = 100), not off a
 *     player-relative trigger — the child swerves because of the road, not
 *     because of you, which is VU-03's entire premise. `cutShiftM` −2.0 glides
 *     him from 6.66 to 4.66 over `cutRampSec` 2.5 s (= the map's 6.5 m arc at
 *     2.6 m/s), and the traffic layer noses the rig into the glide direction, so
 *     he visibly leans into it. `minCutSpeedKmh` 5 is authored DOWN to a floor
 *     no drive can miss: the swerve must be a fact of the street, identical in
 *     all three recordings, never a function of how the driver behaved.
 *  4. THE CONTACT: the runner's ONLY emitted event is collision(vehicle) inside
 *     VEHICLE_CONTACT_M, and only AFTER the cut has fired. Both halves are
 *     load-bearing and both are asserted in the district battery — see the
 *     mistake demos' notes in traces/scVuChildCyclist.ts.
 */
const VUCC_CHILD: CutInLeadCarSpec = {
  id: "sc-vucc-child",
  kind: "cutInLeadCar",
  libraryEventId: "ev-cyclist",
  actor: {
    // vu-child-v1 is one edge: start → end, northbound.
    pathNodes: ["vuc-n-start", "vuc-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // y = 45 — 30 m up the road from the spawn
    cruiseSpeedMps: VUCC_CHILD_MPS,
    extraRightOffsetM: VUCC_CURB_X - VUCC_LANE_X, // 2.6 — the curb line + the A11 tag
    colorIndex: 2,
  },
  paceAheadM: 400, // unreachable by design — see dial 2 above
  maxMatchSpeedMps: VUCC_CHILD_MPS,
  cutAt: { x: VUCC_CURB_X, y: VUCC_WOBBLE_Y },
  cutRadiusM: VUCC_WOBBLE_RADIUS_M,
  minCutSpeedKmh: 5,
  cutShiftM: VUCC_APEX_X - VUCC_CURB_X, // −2.0 — LEFT, into the driver's lane
  cutRampSec: VUCC_WOBBLE_ARC_M / VUCC_CHILD_MPS, // 2.5 s = the map's 6.5 m arc
  cutSpeedMps: VUCC_CHILD_MPS, // he does not speed up or slow down for the swerve
  clearAheadM: 400, // longer than the street: the child is never „cleared",
  // he is simply still there when the lesson ends — which is the point
};

/**
 * L5's complication — ONE southbound car, released the moment the player rolls
 * and timed to be ALONGSIDE the wobble. „Nowhere to go but BEHIND the child":
 * the wide line this drill teaches is the ONCOMING BANK, and at L5 the bank is
 * occupied for exactly the seconds the child spends swinging into your lane. The
 * rung's answer is not a better line, it is the brake — which is the half of
 * чл. 20, ал. 2 the lower rungs never force.
 *
 * ONE car, not a stream: this street is 300 m and the honest pass needs ~8 s of
 * unbroken excursion, so a second car would make the rung unpassable rather than
 * harder (the sc-vu-cyclist-group ruling, reused).
 */
const VUCC_ONCOMING: OncomingStreamSpec = {
  id: "sc-vucc-oncoming",
  kind: "oncomingStream",
  libraryEventId: "ev-cyclist",
  actor: {
    pathNodes: ["vuc-n-end", "vuc-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: VUCC_STREET_M - 190 }, // y = 190
    cruiseSpeedMps: 8, // ~29 km/h — the street's own posted pace
    colorIndex: 6,
  },
  count: 1,
  gapsM: [], // length count − 1
  releaseKmh: 3, // rolls as soon as the player does
};

/**
 * VU-03 — колелото завива около дупка (ЗДвП чл. 42: изпреварване на велосипедист
 * само с ДОСТАТЪЧНА странична дистанция; чл. 20, ал. 2: скорост, съобразена с
 * конкретните условия — а дете на велосипед Е условие. Bank-verified:
 * q-uyazvimi-051 grounds the group/уязвими clearance duty at чл. 42, q-eco-009
 * the „скорост, при която можеш да спреш" reading of чл. 20, q-uyazvimi-010 the
 * децата-са-непредвидими care duty. The 1.5 m figure is the taught BG/EU
 * GUIDANCE, not a statutory number — the copy teaches it, the tracker convicts
 * only under ~1.2 m of air).
 *
 * WHY IT IS NOT A DUPLICATE of sc-vu-pass-clearance (one rider, one margin) or
 * sc-vu-cyclist-group (five riders, one commitment): both of those grade a
 * margin against a line the cyclist HOLDS. This one grades a margin against a
 * line the cyclist ABANDONS. The child starts 2.6 m off your lane center and
 * ends 0.6 m off it, and nothing announced the move — so the only clearance that
 * was ever real is the one you budgeted for where he might GO. That is a
 * different skill from „leave 1.5 m", and it is the one that keeps children
 * alive: не просветът, а резервът в просвета.
 */
export const SC_VU_CHILD_CYCLIST: ScenarioSpec = {
  id: "sc-vu-child-cyclist",
  family: "vru",
  tagsBg: [
    "дете",
    "велосипедист",
    "лъкатушене",
    "странична дистанция",
    "жилищна улица",
    "уязвими участници",
  ],
  titleBg: "Дете на колело лъкатуши",
  objectiveBg:
    "Дете на велосипед е непредсказуемо: очаквай завиване без знак, дръж двойно по-широк просвет и скорост, с която можеш да спреш веднага.",
  archetypeIds: ["VU-03", "VU-02"],
  conceptIds: ["c-children-on-road", "c-cyclists", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-child-v1.json meta.scenario.params
    // (tools/maps/gen_vu_child.mjs; the map is NEW and this template owns it).
    params: { lengthM: VUCC_STREET_M, maxspeedKmh: 30, variant: "child" },
    districtId: "vu-child-v1",
  },
  start: {
    spawnPointId: "vuc-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Жилищна улица, 30 км/ч. По десния бордюр пред теб кара дете на велосипед — бавно, на около 10 км/ч.",
    },
    {
      n: 2,
      textBg:
        "Не се залепяй зад него и не бързай да го подминеш. Остани назад, на разстояние, от което виждаш цялото колело.",
    },
    {
      n: 3,
      textBg:
        "Карай със скорост, с която можеш да спреш ВЕДНАГА — не „почти веднага“. Тук това е около 10–12 км/ч зад детето.",
    },
    {
      n: 4,
      textBg:
        "Гледай предното колело, не гърба му. Точно то ще ти каже накъде тръгва — половин секунда преди самото дете да знае.",
    },
    {
      n: 5,
      textBg:
        "Ще стане: около средата на улицата детето заобикаля нещо и излиза цели два метра навътре — без мигач, без поглед назад. Ти вече си отзад и просто отпускаш газта.",
    },
    {
      n: 6,
      textBg:
        "Чак когато се успокои и хване нова линия: огледало, ляв мигач и ЕДНА широка дъга — през насрещната лента, не покрай него.",
    },
    {
      n: 7,
      textBg:
        "Мери просвета от НОВАТА му линия, не от бордюра. И го удвои: детето може да лъкатуши пак, докато си до него.",
    },
    { n: 8, textBg: "Прибери се плавно чак когато детето е изцяло в огледалото ти, и продължи до края." },
  ],
  success: [
    {
      id: "sc-vucc-hold-back",
      titleBg: "Остани зад детето, докато лъкатуши",
      // The gate that CANNOT be narrated: maxSpeedKmh 14 is under the tracker's
      // own 15 km/h pass floor, so reaching (4.06, 80) inside it means the car
      // was genuinely crawling behind the child at the moment of the swerve —
      // and a driver who was already committed to a pass here is, by
      // construction, going too fast to satisfy it.
      params: { kind: "reachZone", x: VUCC_LANE_X, y: 80, radiusM: 5, maxSpeedKmh: 14 },
    },
    {
      id: "sc-vucc-wide",
      titleBg: "Изпревари по широката дъга, а не покрай детето",
      // Radius 3.5 < the 4.31 m from the wide line to the nudge line the first
      // mistake demo drives: satisfiable ONLY from the oncoming bank. A driver
      // who „went around" the child inside his own lane misses it — which is
      // exactly the fault that demo exists to name.
      params: { kind: "reachZone", x: VUCC_WIDE_X, y: 175, radiusM: 3.5 },
    },
    {
      id: "sc-vucc-finish",
      titleBg: "Прибери се и продължи до края на отсечката",
      params: { kind: "reachZone", x: VUCC_LANE_X, y: 265, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-vucc-watch-wheel", titleBg: "Наблюдение на предното колело, преди да се случи" },
        { id: "sc-vucc-glance-mirror", titleBg: "Огледало преди широката дъга и преди прибирането" },
      ],
    },
    parTimeSec: 95,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVuChildCyclist.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vu-child-cyclist-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-child-cyclist/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-child-cyclist/mistake-pass-in-wobble.trace.json" },
      titleBg: "Изпреварване точно в лъкатушенето",
      whatWentWrongBg:
        "Водачът видя всичко. Изчака детето да излезе от бордюра, изчака го да се успокои — и после мина покрай него точно както би минал покрай кола: на около метър въздух. Само че детето вече не е до бордюра, а В ТВОЯТА ЛЕНТА, и метърът, който му остави, е целият му резерв. Второто залитане дойде, докато колата беше до него. Просветът се мери от линията, на която детето Е СЕГА, и се удвоява, защото то може да я смени пак — това е разликата между чл. 42 и „разминах се“.",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-child-cyclist/mistake-narrow.trace.json" },
      titleBg: "Тесен просвет покрай детето",
      whatWentWrongBg:
        "Тук водачът дори не изчака: провря се покрай детето на метър въздух още преди дупката, докато то още караше кротко до бордюра. И се размина — детето залитна две секунди по-късно, вече зад него. Точно това прави навика опасен: сметката не идва всеки път. Метър до дете на велосипед не е дистанция, а залог — че то няма да мръдне в следващата секунда. Чл. 42 иска ДОСТАТЪЧНО странично разстояние, а достатъчно значи такова, което оцелява едно залитане.",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка жилищна улица, покрай всяко училище и всеки парк, по крайните квартали в събота сутрин. Същото важи за дете на тротинетка, за първокласник, който бута колело, и за всеки възрастен велосипедист, който изглежда несигурен на седлото.",
    whyBg:
      "Детето на велосипед не кара по линия — то кара по внимание. Балансът му е по-лош, колелото е по-леко, а решенията му са мигновени и необявени: заобикаля шахта, гони котка, поглежда назад и волво завива натам, накъдето гледа. Затова покрай дете правилото „метър и половина“ не стига — то е сметнато за възрастен, който държи линия. Резервът се удвоява не защото законът казва два метра (не казва), а защото чл. 42 иска ДОСТАТЪЧНО разстояние, а достатъчно е онова, което оцелява едно залитане. Оттам идва и второто число: скоростта. Чл. 20, ал. 2 иска скорост, съобразена с условията, а дете на колело е условие — значи скорост, при която спираш ВЕДНАГА, а не „почти“. Двете заедно дават единствения безопасен ред: назад, бавно, изчакваш детето да покаже линията си, и чак тогава една широка дъга през насрещната лента. Ако насрещната е заета — не съществува половин изпреварване: оставаш отзад. Няма закъснение, което да струва колкото едно дете.",
    lawRef: "ЗДвП чл. 42; чл. 20",
    examinerBg:
      "Изпитващият гледа: ранно забелязване на детето и осезаемо намаляване ПРЕДИ да се е случило нещо, задържане назад без залепване, преценка на насрещното преди маневрата, огледало и мигач, една широка и решителна дъга през насрещната лента с просвет, измерен от текущата линия на детето, и прибиране чак след него. Провирането покрай дете на велосипед е основна грешка; принудата върху него или контактът е опасна и прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — НЕ дъжд: на този сценарий условията са ТРАФИК, не време. The rung
    // adds ONE oncoming car timed to the swerve, and it changes the answer
    // rather than the difficulty of the same answer: the wide line this drill
    // teaches is unavailable for exactly the seconds the child needs it, so the
    // only lawful move left is the one the objective's second half names —
    // stay behind and brake. Physics stays DRY (ADR-006 stage 4a): the authored
    // ghost envelope of this template is dry-tuned, and the taught delta here
    // is a decision, not grip.
    { level: 5, stagedAdd: [VUCC_ONCOMING] },
  ],
  staged: [VUCC_CHILD],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vu-bikelane-turn — „Десен завой през велоалея" (VU-01, the TWO-WAY /
// COUNTER-FLOW variant) on the NEW vu-bikelane-v1 junction
// ---------------------------------------------------------------------------

/** vu-bikelane-v1 lane centers (meta.scenario — pinned by value; the
 *  vu-bikelane-districts battery asserts each against the generated map). */
const VBL_THROUGH_Y = -4.06; // eastbound through-lane center (driver's lane)
const VBL_STEM_X = -4.06; // southbound stem lane center — where the right turn lands
/**
 * The curb-separated TWO-WAY cycle track lines on the through road's SOUTH edge
 * (meta.scenario.cycleTrack). Both directions ride the south side; the driver
 * crosses the whole track as the right turn lands on the stem.
 *  · WF (with-flow, eastbound): the driver's own direction, curb-side. The
 *    SAME 2.6 m curb line vu-cyclist-v1 pins — 2.6 m of centers clears the
 *    2.2 m contact radius, so the driver overtakes it before the mouth without
 *    a spurious touch (the sc-vu-cyclist-hook precedent).
 *  · CF (counter-flow, westbound): the STAR — a rider coming from AHEAD on the
 *    same south track, crossing the mouth from the driver's FRONT-RIGHT. A
 *    "look back over the shoulder" check never covers it. Pushed 4.2 m off the
 *    lane center (its own sub-lane), 4.2 m of daylight from the driver's lane.
 */
const VBL_WF_Y = -6.66; // eastbound rider line (lane center − 2.6, offsetPolyline south)
const VBL_CF_Y = -8.26; // westbound rider line (lane center − 4.2)

/**
 * THE WITH-FLOW RIDER — the classic curb cyclist going the driver's own
 * direction (the sc-vu-cyclist-hook recipe, reused). Holds ~26 m short of the
 * mouth curb-side; released as the driver closes; cruises STRAIGHT through the
 * junction as the driver overtakes then turns across it. extraRightOffsetM 2.6
 * lands it on the south track's inner line (y = −6.66) AND tags it a cyclist
 * (A11 vehicleCollisionKind → collision(cyclist)). Adjudicated by the shipped
 * CyclistRightHookRunner (prioritySituation "cyclist-right-hook").
 */
const VBL_RIDER_WF: CyclistRightHookSpec = {
  id: "sc-vbl-rider-wf",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vu-n-c", x: 0, y: 0 },
  actor: {
    // Eastbound through the junction: vu-n-w → vu-n-c → vu-n-e.
    pathNodes: ["vu-n-w", "vu-n-c", "vu-n-e"],
    hold: { nodeIndex: 1, offsetM: -30 }, // curb-side, 30 m short of vu-n-c
    cruiseSpeedMps: 3.0, // ~11 km/h — a city cyclist; overtaken below the follow floor
    extraRightOffsetM: VBL_WF_Y - VBL_THROUGH_Y, // +2.6 — the south curb line + the A11 tag
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 60,
  dangerRadiusM: 9,
  conflictWindowM: 25,
};

/**
 * THE COUNTER-FLOW RIDER — the REVERSED path (vu-n-e → vu-n-c → vu-n-w), the
 * whole point of the template: a rider approaching the mouth from AHEAD on the
 * same south track. Its extraRightOffsetM is NEGATIVE (−12.32) because
 * offsetPolyline offsets to the RIGHT OF TRAVEL, and this actor travels WEST —
 * so a negative offset carries it across to the SOUTH side (y = −8.26), onto
 * the two-way track next to its with-flow mate. A negative offset also leaves
 * it UNTAGGED by the cyclistNear feed (that marker is offset > 0), which is
 * correct here: the counter-flow rider is graded ONLY by its own
 * CyclistRightHookRunner (prioritySituation + the runner's collision channel),
 * never by the vulnerable-pass tracker. Held ~36 m short of the mouth so it
 * arrives ~2.4 s AFTER the with-flow rider — the driver clears one, then the
 * other, then turns.
 */
const VBL_RIDER_CF: CyclistRightHookSpec = {
  id: "sc-vbl-rider-cf",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vu-n-c", x: 0, y: 0 },
  actor: {
    // Westbound through the junction (the reversed path): vu-n-e → vu-n-c → vu-n-w.
    pathNodes: ["vu-n-e", "vu-n-c", "vu-n-w"],
    hold: { nodeIndex: 1, offsetM: -30 }, // 30 m short of vu-n-c on the EAST arm
    cruiseSpeedMps: 4.0, // ~14 km/h — a brisk commuter; clears the mouth briskly
    extraRightOffsetM: VBL_CF_Y - 4.06, // −12.32 — westbound lane (+4.06) shoved south
    colorIndex: 3,
  },
  junctionNodeIndex: 1,
  releaseDistM: 60,
  dangerRadiusM: 9,
  conflictWindowM: 25,
};

/**
 * VU-01, the TWO-WAY / counter-flow variant — десен завой през велоалея (ЗДвП
 * чл. 25, ал. 2, т. 3: при завиване надясно водачът пропуска движещите се по
 * велоалея, която пресича платното; чл. 37: при завиване наляво/надясно
 * пропуска velосипедистите; чл. 42: изпреварване/разминаване с достатъчно
 * разстояние. Bank-verified: q-predimstvo-062 grounds the right-turn-across-
 * cycleway yield duty, q-uyazvimi-011/034/063 the cyclist-priority-on-the-path
 * cases, q-krastovishta-031 the two-way-approach scan).
 *
 * WHY IT IS NOT A DUPLICATE of the live sc-vu-cyclist-hook: that template grades
 * the OVERTAKEN-FROM-BEHIND rider only — a curb cyclist going the driver's own
 * direction. This one adds the COUNTER-FLOW half a two-way track forces: a
 * rider from AHEAD, on the driver's front-right, which the shoulder check
 * behind never sees. Two riders, two directions, one right turn.
 */
export const SC_VU_BIKELANE_TURN: ScenarioSpec = {
  id: "sc-vu-bikelane-turn",
  family: "vru",
  tagsBg: [
    "велосипедист",
    "велоалея",
    "двупосочна",
    "десен завой",
    "насрещно колело",
    "уязвими участници",
  ],
  titleBg: "Десен завой през велоалея",
  objectiveBg:
    "Преди десния завой пресичаш ДВУПОСОЧНА велоалея: огледай и надясно-назад, и НАДЯСНО-НАПРЕД — колелото може да идва и от двете посоки, и то е с предимство.",
  archetypeIds: ["VU-01"],
  conceptIds: ["c-cyclists", "c-priority-concept", "c-mirrors-blind-spots"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in vu-bikelane-v1.json meta.scenario.params
    // (tools/maps/gen_vu_bikelane.mjs; the map is NEW and this template owns it).
    params: { control: "none", throughArmM: 150, stemArmM: 90, throughMaxKmh: 50, stemMaxKmh: 50 },
    districtId: "vu-bikelane-v1",
  },
  start: {
    spawnPointId: "vu-spawn-west",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Движи се спокойно в дясната лента към кръстовището. Ще завиваш надясно по страничната улица.",
    },
    {
      n: 2,
      textBg:
        "Преди завоя пресичаш велоалея, а тя е ДВУПОСОЧНА — колело може да дойде и отзад, и насреща по същата алея.",
    },
    {
      n: 3,
      textBg:
        "Затова не стига само поглед назад: провери дясното огледало и рамо за движещия се направо велосипедист, НО и напред-надясно по алеята.",
    },
    {
      n: 4,
      textBg:
        "Точно отпред-дясно се задава колело срещу теб — то е на алеята и има предимство. Намали до крачка и го изчакай да премине устието.",
    },
    {
      n: 5,
      textBg:
        "Завий надясно чак когато и двете посоки на алеята са чисти — не отрязвай нито движещия се направо, нито насрещния велосипедист.",
    },
    { n: 6, textBg: "Влез плавно в страничната улица, изключи мигача и продължи." },
  ],
  success: [
    {
      id: "sc-vbl-approach",
      titleBg: "Приближи завоя бавно, готов да пропуснеш и двете посоки",
      // Pre-junction checkpoint ~22 m before vu-n-c on the eastbound lane:
      // arriving slowly is the yield-setup skill.
      params: { kind: "reachZone", x: -22, y: VBL_THROUGH_Y, radiusM: 9, maxSpeedKmh: 35 },
    },
    {
      id: "sc-vbl-turned",
      titleBg: "Завий надясно, след като велоалеята е чиста в двете посоки",
      // Down the south stem — reachable ONLY from a completed right turn.
      params: { kind: "reachZone", x: VBL_STEM_X, y: -45, radiusM: 10 },
    },
    {
      id: "sc-vbl-finish",
      titleBg: "Продължи по страничната улица",
      params: { kind: "reachZone", x: VBL_STEM_X, y: -70, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-vbl-glance-back", titleBg: "Огледало и рамо назад — движещият се направо велосипедист" },
        { id: "sc-vbl-glance-ahead", titleBg: "Поглед напред-надясно по алеята — насрещното колело" },
      ],
    },
    parTimeSec: 80,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVuBikelaneTurn.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vu-bikelane-turn-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-bikelane-turn/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-bikelane-turn/mistake-only-behind.trace.json" },
      titleBg: "Завой само с поглед назад — колело отпред-дясно",
      whatWentWrongBg:
        "Водачът провери назад — дясно огледало и рамо, — видя, че движещият се направо велосипедист е преминал, и зави. Но алеята е ДВУПОСОЧНА: точно отпред-дясно, срещу него, се задаваше второ колело, което погледът назад никога не покрива. Завиването пред него е непропускане на участник с предимство (чл. 25, ал. 2, т. 3; чл. 37), а на велоалея цената е контакт с уязвим участник. При двупосочна алея се гледат ОБЕ посоки — назад И напред-надясно.",
      codeRefs: ["FAILED_TO_YIELD", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-bikelane-turn/mistake-cut-path.trace.json" },
      titleBg: "Отрязване на колелото по алеята",
      whatWentWrongBg:
        "Колата зави надясно точно докато велосипедистът по алеята още не беше преминал устието — класическият „десен капан“. Велосипедистът, който се движи направо по велоалеята, има предимство пред завиващия (чл. 37); отрязването му е непропускане на участник с предимство. Един поглед и изчакване, докато алеята се освободи, го предотвратява.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "При всеки десен завой, който пресича велоалея — на кръстовище, на изход от булевард, покрай отделена от платното велосипедна писта. В София повечето обособени велоалеи са ДВУПОСОЧНИ, затова колело идва и отзад, и насреща.",
    whyBg:
      "Десният завой през велосипедист е сред най-честите тежки градски произшествия с уязвими участници — колелото няма ламарина. Двупосочната алея добавя капана, който убива: навикът да „погледнеш през дясното рамо“ покрива само колелото, което идва отзад, докато насрещното — отпред-дясно, срещу теб — остава извън всяко огледало и всеки поглед назад. То е и по-бързо в общата картина, защото се движи към теб. Затова редът при завой през двупосочна алея е ДВОЕН: назад за движещия се направо, и напред-надясно за насрещния, и завиваш едва когато и двете посоки са чисти. Велосипедистът по алеята върви направо и има предимство пред теб, който завиваш (чл. 37); ти изчакваш, той минава.",
    lawRef: "ЗДвП чл. 25; чл. 37; чл. 42",
    examinerBg:
      "Изпитващият гледа: проверка на дясното огледало и рамо назад И осезаем поглед напред-надясно по алеята преди десния завой, намаляване до крачка, пропускане на движещите се по велоалеята в ДВЕТЕ посоки, и завиване едва когато алеята е чиста. Завиване пред велосипедист по алеята е основна грешка; контакт с уязвим участник е опасна и прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху двупосочната алея. The backlog asked this rung to „release
    // riders from BOTH directions in the same window" (a tighter, simultaneous
    // crossing). That is not authorable per-rung: the two riders' arrival timing
    // is a property of the staged actors (hold offsets + releaseDistM), which are
    // TEMPLATE-WIDE — LevelSpec carries `conditions`/`stagedAdd`, not a retiming
    // of existing actors — so tightening the window would tighten it for L1 too,
    // against a ghost tuned for the sequential clear (the sc-vu-child-cyclist
    // crosswind honesty, reused). The base already presents BOTH directions; the
    // authorable delta on this rung is the wet crown and the harder-to-read wet
    // mirror. Physics stays DRY (ADR-006 stage 4a): the taught delta here is the
    // second scan, not braking grip.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [VBL_RIDER_WF, VBL_RIDER_CF],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The VRU-family templates, file 2 — in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU2: readonly ScenarioSpec[] = [
  SC_VU_BLINDSPOT_MOTO,
  SC_VU_CYCLIST_GROUP,
  SC_VU_CHILD_CYCLIST,
  SC_VU_BIKELANE_TURN,
];
