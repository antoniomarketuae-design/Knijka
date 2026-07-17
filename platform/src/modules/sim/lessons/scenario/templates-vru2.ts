/**
 * Scenario templates — the VULNERABLE-ROAD-USER family, SECOND file (doc 76
 * §2 chip "vru"; templates-vru.ts holds VU-01/02/04/09/10):
 *
 *  - sc-vu-blindspot-moto  „Мотор в мъртвата зона"       (VU-07, ln-v1)
 *  - sc-vu-cyclist-group   „Изпреварване на група ..."   (VU-02, vu-pass-v1)
 *
 * The wave-2 member is staged on the committed ln-v1 boulevard (the
 * sc-lane-change map, reused — a plain 2+2 straight is exactly where the
 * queue-filtering drill lives); the wave-4 member reuses vu-pass-v1, the
 * junction-free 1+1 street sc-vu-pass-clearance already proves.
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

/** The VRU-family templates, file 2 — in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU2: readonly ScenarioSpec[] = [
  SC_VU_BLINDSPOT_MOTO,
  SC_VU_CYCLIST_GROUP,
];
