/**
 * Scenario templates — the PEDESTRIAN family, S3 batch 1 (doc 72 §6 „Family
 * PE"): three ✅ FULL crossing archetypes staged on purpose-built zebra-block
 * micro-maps, DATA ONLY in the templates.ts mold (coordinates denormalized
 * from the committed district files so nothing loads world JSON at runtime;
 * the trace-gate batteries assert every pinned value against the generated
 * maps):
 *
 *  - sc-crossing-let-pass    „Изчакай пътеката"  (PE-03, pe-clear-v1)
 *  - sc-crossing-slow-crosser „Бавен пешеходец"   (PE-08, pe-slow-v1)
 *  - sc-crossing-rain-sprint „Пътека в дъжд/нощ"  (PE-16, pe-rain-v1)
 *
 * Every staged encounter uses the SHIPPED StagedEventSpec kind
 * `pedestrianDartOut` and every mistake demo cites SHIPPED rules-catalog codes
 * (PEDESTRIAN_CROSSING_TOO_FAST / PEDESTRIAN_NOT_YIELDED) — verified by
 * replaying the committed traces through the production stack
 * (traces/__tests__/sc-crossing-*-traces.test.ts, the §5/§9 gates).
 *
 * Doc-72 provenance: all three archetypes are marked "Engine: ✅ FULL". PE-13
 * (jaywalker) was skipped this batch: it wants a signalized crossing, which
 * gen_zebra_street/gen_pe_crossings deliberately REJECTS (the runtime can only
 * adjudicate signals at INTERSECTIONS — a standalone signal zebra would paint
 * lamps the rule engine cannot grade).
 */

import type { PedestrianDartOutSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the pe-districts battery asserts the copies match the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (pe-*-v1). */
const LANE_2 = 4.06;
/** L4 curb-start convention: half-carriageway 8.125 + 0.4 curb + 1.2
 *  stand-back = 9.725 m west of the centerline. */
const CURB_X = -9.73;
/** Road-occupancy span along the dart path (west edge → east edge across the
 *  16.25 m carriageway): 9.73 − 8.125 = 1.6 m in, 9.73 + 8.125 = 17.85 m out. */
const ROAD_FROM_M = 1.6;
const ROAD_TO_M = 17.85;
/** Curb → across the carriageway → a few metres of east walk-out. */
const TRAVEL_M = 23.45;

// ---------------------------------------------------------------------------
// 1. sc-crossing-let-pass — „Изчакай пътеката" (PE-03: squeezing past a
//    pedestrian on the crossing) on pe-clear-v1 (crossing at y = 90)
// ---------------------------------------------------------------------------

/**
 * The staged NORMAL-PACE crosser at pe-x-1 (0, 90): steps off the WEST curb at
 * 1.4 m/s once the player closes within ~55 m, so she is already on the FAR
 * half of the zebra as the car arrives — the PE-03 „behind their back" trap.
 * triggerDistM 55 releases her early enough that a legal approach can still
 * stop, which lets the too-fast demo grade ONLY its approach-speed code.
 */
const LET_PASS_PED: PedestrianDartOutSpec = {
  id: "sc-clp-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: CURB_X, y: 90 },
  dir: { x: 1, y: 0 },
  speedMps: 1.4,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

/** PE-03 — не заобикаляй пешеходеца на пътеката (ЗДвП чл. 119: пропусни
 *  стъпилите на пътеката пешеходци; изчакай, докато освободят платното). */
export const SC_CROSSING_LET_PASS: ScenarioSpec = {
  id: "sc-crossing-let-pass",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "предимство", "градско каране"],
  titleBg: "Изчакай пътеката да се освободи",
  objectiveBg:
    "Пропусни пешеходеца на пешеходната пътека, като изчакаш да освободи ЦЯЛОТО платно — не се промъквай зад гърба му, дори да изглежда, че има място.",
  archetypeIds: ["PE-03"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-clear-v1.json meta.scenario.params
    // (tools/maps/gen_pe_crossings.mjs).
    params: { crossings: 1, signalized: "no", approachM: 90 },
    districtId: "pe-clear-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и се движи спокойно в своята лента." },
    {
      n: 2,
      textBg:
        "Видиш ли пешеходната пътека, вдигни крака от газта и наблюдавай пешеходеца, който вече пресича.",
    },
    {
      n: 3,
      textBg: "Намали плавно и спри напълно на няколко метра преди пътеката — не навлизай в нея.",
    },
    {
      n: 4,
      textBg:
        "Изчакай пешеходеца да измине ЦЯЛАТА пътека, включително твоята половина — не се провирай зад него.",
    },
    { n: 5, textBg: "Огледай се и премини едва когато пътеката е напълно свободна." },
  ],
  success: [
    {
      id: "sc-clp-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 78, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-clp-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 128, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-let-pass/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-let-pass/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата навлезе в зоната на пътеката с непроменена висока скорост, докато пешеходецът вече пресичаше. Дори спирането след това да успее, самото приближаване без готовност е опасната грешка — чл. 119 изисква скорост, позволяваща спиране.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-let-pass/mistake-not-yielded.trace.json" },
      titleBg: "Промъкване зад гърба на пешеходеца",
      whatWentWrongBg:
        "Водачът прецени, че „има място“, и мина зад гърба на пешеходеца, докато той още беше на отсрещната половина. Пешеходецът на пътеката има предимство по чл. 119 — изчакваш го да освободи цялото платно, не се разминаваш с него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При всяка маркирана пешеходна пътека, на която пешеходец вече пресича. Предимството е негово, докато не слезе напълно от платното — включително от отсрещната лента.",
    whyBg:
      "Промъкването зад гърба на пешеходеца е класически капан: той може да спре, да се върне или да ускори, а зад него от другата лента може да се появи втори пешеходец, когото не виждаш. Изчакването на чиста пътека струва няколко секунди; ударът — цял живот.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква отчетливо намаляване при приближаване, пълно спиране преди пътеката и потегляне едва след като пешеходецът е освободил цялото платно. Разминаване с пешеходец на пътеката е опасна грешка и прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [LET_PASS_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-crossing-slow-crosser — „Бавен пешеходец" (PE-08: the slow/elderly
//    crosser) on pe-slow-v1 (crossing at y = 85, a calmer 40 km/h street)
// ---------------------------------------------------------------------------

/**
 * The staged SLOW crosser at pe-x-1 (0, 85): 0.8 m/s (an elderly pedestrian —
 * the occupancy just lasts ~20 s longer than the walk-pace tier). The lesson
 * is patience: creeping into the crossing to pressure them, or rolling before
 * they clear, is the graded fault. Same occupancy span, longer dwell.
 */
const SLOW_PED: PedestrianDartOutSpec = {
  id: "sc-scr-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 85 },
  start: { x: CURB_X, y: 85 },
  dir: { x: 1, y: 0 },
  speedMps: 0.8,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

/** PE-08 — бавният пешеходец (ЗДвП чл. 119: изчакай пешеходеца да освободи
 *  пътеката, без да го притискаш с настъпване). */
export const SC_CROSSING_SLOW_CROSSER: ScenarioSpec = {
  id: "sc-crossing-slow-crosser",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "търпение", "възрастен пешеходец"],
  titleBg: "Бавен пешеходец на пътеката",
  objectiveBg:
    "Спри пред пътеката и изчакай бавно пресичащия пешеходец да я освободи напълно — без да настъпваш и без да потегляш, докато е на платното.",
  archetypeIds: ["PE-08"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-slow-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 85 },
    districtId: "pe-slow-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се движи спокойно — улицата е квартална, с ограничение 40 км/ч." },
    {
      n: 2,
      textBg: "Забележиш ли бавно пресичащ пешеходец, вдигни газта рано и се готви за пълно спиране.",
    },
    { n: 3, textBg: "Спри напълно преди пътеката и изчакай търпеливо — не настъпвай, за да го подканиш." },
    {
      n: 4,
      textBg: "Дай му цялото време да измине платното; бавният пешеходец има нужда от повече секунди.",
    },
    { n: 5, textBg: "Потегли едва когато е слязъл напълно от пътеката, и премини спокойно." },
  ],
  success: [
    {
      id: "sc-scr-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 73, radiusM: 10, maxSpeedKmh: 35 },
    },
    {
      id: "sc-scr-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 122, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 100 },
  shadow: { path: "content/traces/sc-crossing-slow-crosser/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-slow-crosser/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата задържа 40 км/ч към пътеката, докато бавният пешеходец вече беше на платното. Пред пешеходна пътека със стъпил пешеходец скоростта трябва да позволява спиране — чл. 119; дори при законно ограничение приближаването без готовност е опасната грешка.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-slow-crosser/mistake-not-yielded.trace.json" },
      titleBg: "Потегляне, преди пешеходецът да слезе",
      whatWentWrongBg:
        "Водачът не изчака и потегли през пътеката, докато бавният пешеходец още я пресичаше. Пешеходецът има предимство до пълното освобождаване на платното — нетърпението тук е опасна грешка.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При деца, възрастни хора и хора с намалена подвижност на пешеходната пътека — те се движат по-бавно и имат нужда от повече време. Предимството е тяхно до последната крачка от платното.",
    whyBg:
      "Настъпването и потеглянето „под носа“ на бавен пешеходец е сред нещата, които изпитващите наказват веднага, защото плаши най-уязвимите участници. Търпението пред пътеката е белег на владеене на колата, не на слабост.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият следи за пълно спиране без настъпване, спокойно изчакване и потегляне едва след пълното освобождаване на платното. Настъпване или преминаване през пешеходец на пътеката е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SLOW_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-crossing-rain-sprint — „Пътека в дъжд през нощта" (PE-16: the rain
//    sprinter, night ×R) on pe-rain-v1 (crossing at y = 95)
// ---------------------------------------------------------------------------

/**
 * The staged SPRINTER at pe-x-1 (0, 95): 2.2 m/s — a pedestrian hurrying across
 * for cover in the rain, distinctly faster than the 1.4 m/s walk (and the dart)
 * profile. The crossing is driven at NIGHT in the RAIN, so the braking distance
 * is longer AND the sightline is short: the shadow's answer is a decisively
 * lower approach speed. triggerDistM 40 times her onto the zebra as the car
 * closes — late enough that the not-yielded demo meets her on the WEST half
 * (a cut-across-in-front, no contact), not head-on in the driving lane.
 */
const RAIN_SPRINT_PED: PedestrianDartOutSpec = {
  id: "sc-crs-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 95 },
  start: { x: CURB_X, y: 95 },
  dir: { x: 1, y: 0 },
  speedMps: 2.2,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 40,
  minTriggerSpeedKmh: 10,
};

/** PE-16 — спринтьорът в дъжда (ЗДвП чл. 119 + съобразена скорост чл. 20:
 *  при дъжд и нощ спирачният път расте, а пешеходецът се появява по-бързо). */
export const SC_CROSSING_RAIN_SPRINT: ScenarioSpec = {
  id: "sc-crossing-rain-sprint",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "дъжд", "нощно каране"],
  titleBg: "Пътека в дъжд през нощта",
  objectiveBg:
    "Приближи пешеходната пътека в дъжд и тъмнина с чувствително по-ниска скорост, пропусни припряно пресичащия пешеходец и премини едва когато е слязъл от платното.",
  archetypeIds: ["PE-16"],
  conceptIds: ["c-crosswalk-yield", "c-speed-adaptation", "c-rain-aquaplaning", "c-night-visibility"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-rain-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 95 },
    districtId: "pe-rain-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се със съобразена скорост — в дъжд и тъмнина спирачният път е около 1,4 пъти по-дълъг." },
    {
      n: 2,
      textBg: "Пред пътеката намали още повече от обичайното — фаровете осветяват само няколко метра напред.",
    },
    {
      n: 3,
      textBg: "Появи ли се пешеходец, който тича към отсрещния тротоар, спри плавно и напълно преди зебрата.",
    },
    { n: 4, textBg: "Изчакай го да освободи цялото платно — при дъжд той бърза и вижда по-трудно." },
    { n: 5, textBg: "Премини спокойно, след като пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-crs-approach",
      titleBg: "Приближи пътеката с намалена за условията скорост",
      params: { kind: "reachZone", x: LANE_2, y: 83, radiusM: 10, maxSpeedKmh: 35 },
    },
    {
      id: "sc-crs-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 132, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-rain-sprint/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-too-fast.trace.json" },
      titleBg: "Суха скорост в дъжд",
      whatWentWrongBg:
        "Колата приближи пътеката със сухо-дневна скорост, докато пешеходецът вече тичаше по зебрата. При дъжд и нощ скоростта пред пътека със стъпил пешеходец трябва да е още по-ниска — чл. 119 иска готовност за спиране, а мокрият път я отнема.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-not-yielded.trace.json" },
      titleBg: "Непропускане на пешеходеца",
      whatWentWrongBg:
        "Водачът мина през пътеката, докато пешеходецът още пресичаше в дъжда. Дори когато пешеходецът бърза непредпазливо, предимството е негово — задължението за спиране остава на водача.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При пешеходни пътеки в дъжд, мъгла или тъмнина — тогава пешеходецът често тича за прикритие, вижда те по-трудно (чадър, качулка), а твоят спирачен път е чувствително по-дълъг.",
    whyBg:
      "Комбинацията мокър път + слаба видимост + бързащ пешеходец е сред най-смъртоносните за пешеходци в България. Единственият надежден отговор е предварително намалената скорост: тя връща и разстоянието за спиране, и времето за реакция.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква видимо по-ниска скорост за условията при приближаване, пълно спиране пред пътеката и потегляне след освобождаването ѝ. Преминаване през пешеходец на пътеката е опасна грешка независимо от времето.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [RAIN_SPRINT_PED],
  conditions: { weather: "rain", night: true },
  localeBg: "bg-BG",
};

/** The pedestrian-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_PE: readonly ScenarioSpec[] = [
  SC_CROSSING_LET_PASS,
  SC_CROSSING_SLOW_CROSSER,
  SC_CROSSING_RAIN_SPRINT,
];
