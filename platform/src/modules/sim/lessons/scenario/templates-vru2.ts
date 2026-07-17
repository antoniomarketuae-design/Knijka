/**
 * Scenario templates — the VULNERABLE-ROAD-USER family, SECOND file (doc 76
 * §2 chip "vru"; templates-vru.ts holds VU-01/02/04/09/10). Wave-2 member,
 * staged on the committed ln-v1 boulevard (the sc-lane-change map, reused — a
 * plain 2+2 straight is exactly where the queue-filtering drill lives):
 *
 *  - sc-vu-blindspot-moto  „Мотор в мъртвата зона"  (VU-07, ln-v1)
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

import type { RearTailgaterSpec } from "../../contracts";
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

/** The VRU-family templates, file 2 — in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU2: readonly ScenarioSpec[] = [SC_VU_BLINDSPOT_MOTO];
