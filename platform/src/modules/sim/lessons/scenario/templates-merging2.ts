/**
 * Scenario templates — the MERGING family, wave 2 (doc 76 §2 chip "merging",
 * doc 72 §8 SP-10 „Магистрала" + §10 „Family OV"). Where templates-merging.ts
 * teaches how you JOIN a stream, this file teaches how you LEAVE one:
 *
 *  - sc-merge-motorway-exit „Изход от магистралата"
 *    (SP-10 + SP-05, mw-exit-v1 — tools/maps/gen_mw_exit.mjs)
 *
 * DATA ONLY, the templates.ts mold: every coordinate below is denormalized
 * from the committed district file (meta.scenario), so nothing loads world
 * JSON at runtime; the district battery (world/__tests__/
 * mw-exit-districts.test.ts) and the trace gate assert every pinned value
 * against the generated map.
 *
 * WHY THE MAP GRADES THIS FOR FREE (see gen_mw_exit.mjs's header): the
 * deceleration lane is the carriageway's CURB lane (laneId 0) over the 280 m
 * segment that carries NO emergencyLane span. So:
 *   - braking in it is legal and it is the rightmost REQUIRED lane (no
 *     NOT_KEEPING_RIGHT, no EMERGENCY_LANE_DRIVING) — while BEFORE the taper
 *     and AFTER the gore that same curb lane IS the аварийна лента;
 *   - the move into it is a laneId 1 → 0 delta WITHIN one edge, which the
 *     shipped lane-change adjudicator grades on indicator + mirror;
 *   - the ramp's marked bend carries a curveAdvisory span (А1 + Т-табела 60),
 *     so „намалих чак на рампата" grades SPEED_TOO_FAST_FOR_CURVE with zero
 *     new code — the engine's curve detector is deliberately NOT capped at the
 *     graced limit, which is exactly the exit's legal shape: no sign lowers the
 *     ramp's limit, the ADVISORY is what protects you (чл. 20, ал. 2).
 *
 * THE MISSED EXIT (чл. 58) is TEACH-CARD + NARRATION content, not a drivable
 * demo: reversing on a motorway needs opposing geometry to stage, and the
 * shipped WRONG_WAY detector would need it to convict. The honest slice: the
 * map PROVES the correct alternative gradable (the battery drives laneId 1 past
 * the gore to the end with ZERO violations — „изпуснах изхода, карам до
 * следващия" is innocent by construction), and the copy carries the ban.
 *
 * Both mistake demos cite SHIPPED rules-catalog codes and grade EXACTLY them
 * through the production stack (the §5/§9 gates, traces/__tests__/
 * sc-merge-motorway-exit-traces.test.ts):
 *   - „Спиране на платното преди изхода" → HARSH_BRAKING_NO_CAUSE (основна:
 *     the ledger is positively empty on this map — no crossing, no stop line,
 *     no junction, nothing ahead; the staged car is BEHIND, which is the whole
 *     point of the fault);
 *   - „Рампата с магистрална скорост" → SPEED_TOO_FAST_FOR_CURVE (the лента за
 *     намаляване went by at 130 and the braking started at the gore — 85 in the
 *     advisory-60 bend; 85 stays at/under the ramp's own 90, so no SPEEDING_*
 *     code can leak into the single-code demo).
 */

import type { RearTailgaterSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// sc-merge-motorway-exit — „Изход от магистралата"
// (SP-10 „Магистрала" + SP-05 „Скорост в завой" on the връзка)
// ---------------------------------------------------------------------------

/**
 * mw-exit-v1 truths this spec pins by value (meta.scenario — the L7 copy
 * discipline; mw-exit-districts.test.ts asserts each against the generated
 * map). The rest of the map's vocabulary, for reading the copy below: the
 * northbound carriageway runs on x = 0 with laneId 2 (the overtaking lane the
 * drill opens in) at x = −8.12; the deceleration lane opens at y = 520; the
 * ramp bends right R 250 × 45° around (258.13, 800) with a 60 km/h advisory.
 */
const MWX_X_CURB = 8.13; // laneId 0 — ЛЕНТА ЗА НАМАЛЯВАНЕ between taper and gore
const MWX_X_CRUISE = 0; // laneId 1 — the travel lane you exit FROM
const MWX_NOSE_Y = 800; // the gore — the ramp leaves here
const MWX_RAMP_END: readonly [number, number] = [123.78, 1019.21];

/**
 * THE CAR BEHIND YOU: the shipped rearTailgater actor armed in the player's own
 * travel lane (extraRightOffsetM = −one lane off the graph's curb-lane path ⇒
 * x ≈ 0, mainline laneId 1), released once the player is well down the
 * approach. It closes up, keeps station through the pressure window at
 * motorway pace, and then passes on the LEFT (passShiftM = −one lane pitch —
 * never through the player).
 *
 * WHY IT IS HERE, precisely: this drill's основна fault is braking on the
 * ПЛАТНОТО instead of in the лента за намаляване. A slam at 130 with nothing
 * ahead reads as harmless in an empty world; the car 35 m off your bumper is
 * what makes it the real thing. PRESSURE SCENERY under the learn-only policy
 * (doc 72 FO-07): the runner emits ZERO SimTick events — no violation and no
 * collision can grade from it. Everything graded here is the player's own
 * channel: the two lane-change indicator/mirror pairs, the causeless slam and
 * the curve envelope on the ramp.
 */
const MWX_REAR_CAR: RearTailgaterSpec = {
  id: "sc-mwx-rear-car",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["mwx-n-nb-start", "mwx-n-taper", "mwx-n-nose", "mwx-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 20 }, // dormant at (0, 20) — behind the spawn
    cruiseSpeedMps: 36, // ~130 km/h — the flow the player is expected to hold
    // The graph's oneway lane rides the CURB lane (x ≈ +8.13); one lane LEFT
    // of it is the travel lane the player cruises and exits from.
    extraRightOffsetM: -MWX_X_CURB,
    colorIndex: 2,
  },
  releaseGapM: 150, // it rolls once the player is properly under way
  followBehindM: 35, // ~31 m of bumpers at 130 — under two seconds of gap
  maxMatchSpeedMps: 40, // ~144 km/h — it keeps station even with a brisk player
  pressureSec: 22,
  passShiftM: -8.125, // the pass runs one lane LEFT (never through the player)
  passSpeedMps: 38,
  passAheadM: 45,
  easeKmh: 8,
};

/**
 * SP-10 / SP-05 — изход от автомагистрала (ЗДвП чл. 55: водачът, който напуска
 * автомагистралата, е длъжен своевременно да заеме най-дясната лента и да
 * използва лентата за намаляване; чл. 58: по автомагистрала се забранява
 * спирането и движението назад — изпуснатият изход се кара до следващия;
 * чл. 20, ал. 2: скоростта се съобразява с конкретните условия — препоръчителната
 * скорост под А1 на рампата). The taught norm, grounded in the content bank
 * (q-magistrali-i-izvangradsko-005/028/007, q-manevri-037): престрояване вдясно
 * НАВРЕМЕ → мигач + огледало + рамо → влизаш в лентата за намаляване с темпото
 * на потока → цялото намаляване става В нея → рампата се кара с препоръчителната
 * скорост.
 */
export const SC_MERGE_MOTORWAY_EXIT: ScenarioSpec = {
  id: "sc-merge-motorway-exit",
  family: "merging",
  tagsBg: ["магистрала", "изход", "лента за намаляване", "рампа", "престрояване", "скорост в завой"],
  titleBg: "Изход от магистралата",
  objectiveBg:
    "Престрой се вдясно навреме, намали чак В лентата за намаляване и никога не спирай и не връщай на магистралата, ако изпуснеш изхода.",
  archetypeIds: ["SP-10", "SP-05", "OV-11"],
  conceptIds: ["c-motorway-entry-exit", "c-lane-change", "c-lane-choice", "c-mirrors-blind-spots", "c-speed-adaptation"],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in mw-exit-v1.json meta.scenario.params
    // (tools/maps/gen_mw_exit.mjs).
    params: {
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
    },
    districtId: "mw-exit-v1",
  },
  start: {
    spawnPointId: "mwx-spawn-left-lane",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгваш в ЛЯВАТА лента на магистралата — току-що си изпреварил. Изходът ти е след около километър и вдясно." },
    { n: 2, textBg: "Престрой се вдясно НАВРЕМЕ: ляво огледало, десен мигач, поглед през рамо — и чак тогава воланът. Изходът се подготвя километър преди табелата, не на самата гърловина." },
    { n: 3, textBg: "Указателните табели броят метрите до изхода (500 – 300 – 100 м). Дръж темпото на потока по дясната лента за движение — тук още НЕ се намалява." },
    { n: 4, textBg: "Там, където лентата за намаляване се отваря вдясно, дай десен мигач, огледай се и влез в нея с темпото, с което си карал." },
    { n: 5, textBg: "Цялото намаляване става В лентата за намаляване — тя е точно за това. Спирачка на платното означава изненада за движещия се плътно зад теб със 130." },
    { n: 6, textBg: "На гърловината вече си със скоростта на рампата. Знакът А1 с табела „60“ не е пожелание: рампата е завой, а сцеплението не се дели между спиране и завиване." },
    { n: 7, textBg: "Ако изпуснеш изхода — караш до следващия. По автомагистрала спирането и движението назад са забранени (чл. 58); връщането по аварийната лента убива." },
  ],
  success: [
    {
      id: "sc-mwx-keep-right",
      titleBg: "Престрой се в дясната лента за движение навреме",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the travel
      // lane, deep on the approach — getting right EARLY is the first duty.
      params: { kind: "reachZone", x: MWX_X_CRUISE, y: 300, radiusM: 4 },
    },
    {
      id: "sc-mwx-decel-lane",
      titleBg: "Влез в лентата за намаляване",
      // Same lane-pinning radius on the curb lane, 60 m before the gore: a car
      // that never moved over misses it entirely.
      params: { kind: "reachZone", x: MWX_X_CURB, y: MWX_NOSE_Y - 60, radiusM: 4 },
    },
    {
      id: "sc-mwx-ramp",
      titleBg: "Излез по рампата до края ѝ",
      params: { kind: "reachZone", x: MWX_RAMP_END[0], y: MWX_RAMP_END[1], radiusM: 12 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mwx-glance-early", titleBg: "Огледало и рамо, преди да се престроиш вдясно" },
        { id: "sc-mwx-glance-decel", titleBg: "Огледало и рамо, преди да влезеш в лентата за намаляване" },
      ],
    },
    parTimeSec: 70,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeMotorwayExit.ts; gates in traces/__tests__/
  // sc-merge-motorway-exit-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-motorway-exit/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-motorway-exit/mistake-brake-on-carriageway.trace.json" },
      titleBg: "Спиране на платното преди изхода",
      whatWentWrongBg:
        "Водачът видя изхода късно, паникьоса се и наби спирачките ДО СТОП в лентата за движение — на празно платно, без нищо пред него. Това е рязко спиране без причина: колата зад теб се движи със 130 и има под две секунди да реагира на стоповете ти, а ти оставаш неподвижна стена в поток от 140. Лентата за намаляване съществува точно за да не се стига дотук: влизаш в нея с темпото на потока и намаляваш В НЕЯ. А ако изходът вече е изпуснат — караш до следващия: спирането и движението назад по автомагистрала са забранени (чл. 58).",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-motorway-exit/mistake-ramp-too-fast.trace.json" },
      titleBg: "Рампата с магистрална скорост",
      whatWentWrongBg:
        "Престрояването беше наред, но цялата лента за намаляване мина със 130 и кракът тръгна към спирачката чак на гърловината — в дъгата на рампата колата още държи 85 при препоръчани 60. Никой знак не ти сваля ограничението на връзката: пази те табелата под А1 и чл. 20, ал. 2. Рампата е завой, а сцеплението не се дели между спиране и завиване — точно тук новите водачи излизат от пътя. Лентата за намаляване ти дава метрите: използвай ги, за да стигнеш гърловината ВЕЧЕ със скоростта на рампата.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изход от автомагистрала и скоростен път — и в умален вид при всяка отбивка с лента за намаляване. Изходът започва километър преди табелата: първо се престрояваш вдясно, после влизаш в лентата за намаляване, и чак вътре в нея намаляваш.",
    whyBg:
      "Разликата в скоростите убива на магистралата — и на изхода тя се създава по два начина. Ако намалиш на ПЛАТНОТО, ставаш неподвижна стена за идващия отзад със 130: той има под две секунди да реши, а ти си му дал стопове вместо разстояние. Ако НЕ намалиш навреме, внасяш магистралното темпо в рампата — а рампата е завой с постоянен радиус: там сцеплението трябва да стигне за завиване, не за спиране. Затова законът и геометрията дават едно и също решение: лентата за намаляване. Тя е буферът, в който темпото пада, без някой да плати за това. А изпуснатият изход не е спешен случай — той струва няколко минути до следващия; спирането и връщането по магистралата струват живот (чл. 58).",
    lawRef: "ЗДвП чл. 55; чл. 58",
    examinerBg:
      "Изпитващият гледа три неща: заема ли се най-дясната лента за движение СВОЕВРЕМЕННО (не на последните метри), пада ли скоростта в лентата за намаляване, а не преди нея на платното, и влиза ли колата в рампата вече със съобразена скорост. Рязкото спиране в лентата за движение и вливането/излизането без огледало и мигач са основни грешки; спирането или движението назад по автомагистралата, както и излизането от пътя в рампата, са опасни.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [MWX_REAR_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The family's wave-2 roster (the templates-merging.ts export mold) — the
 *  integration pass imports + spreads THIS into templates.ts SCENARIO_TEMPLATES. */
export const SCENARIO_TEMPLATES_MERGING2: readonly ScenarioSpec[] = [SC_MERGE_MOTORWAY_EXIT];
