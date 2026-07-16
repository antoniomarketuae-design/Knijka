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

// ---------------------------------------------------------------------------
// 4. sc-crossing-dart — „Внезапен пешеходец на пътеката" (PE-02 dart-out +
//    PE-04 occlusion) on pe-dart-v1 (crossing at y = 80, a corner shop west of
//    the zebra hides the curb — the reaction emergency, not the patience test)
// ---------------------------------------------------------------------------

/**
 * The staged DART at pe-x-1 (0, 80): a pedestrian steps off the WEST curb at
 * 1.6 m/s (a hurried step-out, between the 1.4 m/s walk and the 2.2 m/s sprint)
 * only when the player closes within ~40 m — LATE, so the encounter is a
 * reaction test, not a long approach. The corner shop the generator places just
 * west of the zebra hides the curb until the last moment (PE-04 world dressing,
 * zero grading change). triggerDistM 40 still leaves a legal approach room to
 * brake and stop (the shadow does exactly that).
 */
const DART_PED: PedestrianDartOutSpec = {
  id: "sc-drt-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 80 },
  start: { x: CURB_X, y: 80 },
  dir: { x: 1, y: 0 },
  speedMps: 1.6,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 40,
  minTriggerSpeedKmh: 10,
};

/** PE-02 / PE-04 — внезапен пешеходец иззад закрита гледка (ЗДвП чл. 119 +
 *  чл. 20: скорост и внимание, позволяващи спиране при внезапна поява). */
export const SC_CROSSING_DART: ScenarioSpec = {
  id: "sc-crossing-dart",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "внезапна поява", "реакция"],
  titleBg: "Внезапен пешеходец на пътеката",
  objectiveBg:
    "Приближи пешеходната пътека с готовност за спиране: пешеходец изскача иззад ъгъла точно когато наближаваш — реагирай навреме, спри и го пропусни, вместо да минеш през него.",
  archetypeIds: ["PE-02", "PE-04"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-dart-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 80 },
    districtId: "pe-dart-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и приближавай пешеходната пътека с готовност за спиране — кракът над спирачката." },
    { n: 2, textBg: "Ъгловият магазин вляво крие тротоара — не разчитай, че щом не виждаш никого, няма никой." },
    { n: 3, textBg: "Пешеходец изскача на пътеката точно когато наближаваш. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и го изчакай да освободи цялото платно." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-drt-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 68, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-drt-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 118, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-crossing-dart/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-dart/mistake-not-yielded.trace.json" },
      titleBg: "Преминаване през пешеходеца",
      whatWentWrongBg:
        "Водачът не реагира на внезапната поява и мина през пътеката, докато пешеходецът още пресичаше. Дори когато пешеходецът изскача изненадващо, предимството е негово — задължението за спиране остава на водача (чл. 119).",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-dart/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца",
      whatWentWrongBg:
        "Погледът беше другаде и колата изобщо не спря — блъсна изскочилия пешеходец на самата пътека. Пред пешеходна пътека, особено със закрита гледка, скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяка пешеходна пътека, чиято гледка е закрита от сграда, паркирани коли или спрял автобус — там, където пешеходец може да се появи без предупреждение точно преди зебрата.",
    whyBg:
      "Внезапната поява на пешеходец е защитаваната урбанистична спешност за начинаещите: секунда закъсняла реакция при 50 км/ч е близо 14 метра слепешком. Единствената защита е приближаване с готовност за спиране — вдигнат газ, крак над спирачката — и незабавна реакция със спирачка, не със завиване встрани.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква намалена скорост и готовност за спиране при приближаване към закрита пътека, отчетлива реакция при появата на пешеходец и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [DART_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-crossing-bus-shadow — „Пешеходци иззад спрял автобус" (PE-10, the
//    bus-stop kill zone) on pe-bus-v1 (crossing at y = 88). A large stopped
//    vehicle occupies the NEAR (east) curb south of the zebra: a passenger who
//    got off cuts in front of it and crosses toward the far curb — emerging
//    into the player's lane from behind the bus, the „bus shadow". The bus is a
//    trace-side obstacle rect (scCrossingBusShadow.ts BUS_OBSTACLE), clear of
//    the driving lane; the shadow proves the car never touches it.
// ---------------------------------------------------------------------------

/** East (near-side) curb of a 1-lane-per-direction street (= −CURB_X): the
 *  bus stands here and the passenger steps off it. */
const EAST_CURB_X = 9.73;

/**
 * The staged NEAR-SIDE crosser at pe-x-1 (0, 88): steps off the EAST curb in
 * front of the stopped bus at 1.4 m/s, heading WEST across the carriageway,
 * once the player closes within ~44 m. Because she emerges from the bus shadow
 * she is already in the player's lane by the time the sightline clears — the
 * PE-10 kill zone. The road-occupancy span is symmetric about the centerline,
 * so ROAD_FROM_M / ROAD_TO_M / TRAVEL_M are byte-identical to the west-curb
 * crossers; only the start point and direction flip.
 */
const BUS_SHADOW_PED: PedestrianDartOutSpec = {
  id: "sc-bsh-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 88 },
  start: { x: EAST_CURB_X, y: 88 },
  dir: { x: -1, y: 0 },
  speedMps: 1.4,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 44,
  minTriggerSpeedKmh: 10,
};

/** PE-10 — пешеходци иззад спрял автобус (ЗДвП чл. 119 + чл. 20: спрелият
 *  автобус крие гледката; приближавай с готовност за спиране и пропусни
 *  изскочилия пешеходец). */
export const SC_CROSSING_BUS_SHADOW: ScenarioSpec = {
  id: "sc-crossing-bus-shadow",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "спрял автобус", "закрита гледка"],
  titleBg: "Пешеходци иззад спрял автобус",
  objectiveBg:
    "Приближавай спрелия на спирката автобус с готовност за спиране — иззад него на пътеката може да излезе пешеходец, когото не виждаш. Пропусни го и премини едва когато пътеката е свободна.",
  archetypeIds: ["PE-10"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-bus-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 88 },
    districtId: "pe-bus-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и приближавай спрелия вдясно автобус с готовност за спиране — кракът над спирачката." },
    { n: 2, textBg: "Автобусът крие тротоара пред себе си — не разчитай, че щом не виждаш никого, няма никой." },
    { n: 3, textBg: "Пешеходец излиза иззад автобуса на пътеката. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и го изчакай да освободи цялото платно." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-bsh-approach",
      titleBg: "Приближи автобуса и пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 76, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-bsh-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 126, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-bus-shadow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-bus-shadow/mistake-not-yielded.trace.json" },
      titleBg: "Преминаване покрай автобуса без пропускане",
      whatWentWrongBg:
        "Водачът подмина спрелия автобус, без да пропусне излезлия иззад него пешеходец, и мина през заетата пътека. Спрелият на спирката автобус е предупреждение — пешеходецът на пътеката има предимство по чл. 119, дори да се появява внезапно иззад превозното средство.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-bus-shadow/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца иззад автобуса",
      whatWentWrongBg:
        "Колата подмина автобуса със скорост и без готовност — и блъсна изскочилия иззад него пешеходец на самата пътека. При закрита от спрял автобус гледка скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всеки спрял на спирка автобус или голямо превозно средство до пътеката — там пешеходец може да излезе иззад него без предупреждение точно преди зебрата. Класическата „сляпа зона“ зад автобуса е сред най-честите места за прегазване в града.",
    whyBg:
      "Автобусът закрива и пешеходеца от теб, и теб от пешеходеца — а слезлите пътници бързат и пресичат отпред. Единствената защита е предварително намалената скорост и готовността за спиране: изскочи ли човек иззад автобуса, имаш части от секундата за реакция със спирачка, не със завиване.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква видимо намалена скорост и готовност за спиране при подминаване на спрял автобус до пътека, отчетлива реакция при появата на пешеходец и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [BUS_SHADOW_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-crossing-child-ball — „Дете тича след топка" (PE-04, the child dart)
//    on pe-child-v1 (crossing at y = 78, a calm 40 km/h residential street). A
//    child runs onto the crossing after a ball — FAST (2.6 m/s, faster than the
//    rain sprinter) and from the residential frontage the generator's corner
//    shop stands in for. This is the emergency-brake / anticipation lesson: the
//    graded faults are approaching a residential crossing too fast to stop, and
//    striking the child.
// ---------------------------------------------------------------------------

/**
 * The staged RUNNING CHILD at pe-x-1 (0, 78): bolts off the WEST curb at
 * 2.6 m/s — a small child chasing a ball, distinctly faster than any adult
 * walk profile — only when the player closes within ~38 m (LATE: a reaction
 * emergency, not a long approach). The corner shop just west of the zebra hides
 * the frontage until the last moment (PE-04 world dressing, zero grading
 * change). The occupancy span is the shared symmetric road window.
 */
const CHILD_BALL_PED: PedestrianDartOutSpec = {
  id: "sc-cbl-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 78 },
  start: { x: CURB_X, y: 78 },
  dir: { x: 1, y: 0 },
  speedMps: 2.6,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 38,
  minTriggerSpeedKmh: 10,
};

/** PE-04 — дете тича след топка на пътеката (ЗДвП чл. 119 + чл. 20: в
 *  жилищна зона с деца скоростта и вниманието трябва да позволяват спиране при
 *  внезапна поява). */
export const SC_CROSSING_CHILD_BALL: ScenarioSpec = {
  id: "sc-crossing-child-ball",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "дете", "жилищна зона"],
  titleBg: "Дете тича след топка на пътеката",
  objectiveBg:
    "В квартална улица приближавай пътеката бавно и с готовност за спиране — дете може да изскочи след топка си на платното. Реагирай навреме, спри и го пропусни.",
  archetypeIds: ["PE-04"],
  conceptIds: ["c-crosswalk-yield", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-child-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 78 },
    districtId: "pe-child-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Улицата е квартална, с ограничение 40 км/ч — карай спокойно и наблюдавай тротоарите и дворовете." },
    { n: 2, textBg: "Пред пътеката намали още повече и дръж крака над спирачката — тук играят деца." },
    { n: 3, textBg: "Дете изтичва след топка си на пътеката. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и изчакай детето да освободи цялото платно." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-cbl-approach",
      titleBg: "Приближи пътеката бавно, с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 66, radiusM: 10, maxSpeedKmh: 32 },
    },
    {
      id: "sc-cbl-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 116, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-crossing-child-ball/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-child-ball/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване към детето",
      whatWentWrongBg:
        "Колата приближи кварталната пътека с непроменена скорост, докато детето вече беше на платното. Пред пътека с дете скоростта трябва да позволява спиране — чл. 119; дори при законно ограничение приближаването без готовност е опасната грешка, защото детето е малко, бързо и непредвидимо.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-child-ball/mistake-collision.trace.json" },
      titleBg: "Удар в детето",
      whatWentWrongBg:
        "Погледът беше другаде и колата изобщо не спря — блъсна изтичалото след топката дете на самата пътека. В квартална зона с деца скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка квартална и жилищна зона, около училища, площадки и паркирани коли, иззад които може да изскочи дете. Появи ли се топка, ролер или тичащо дете — това е сигнал да си готов за пълно спиране.",
    whyBg:
      "Детето не преценява разстояния и скорости и тича право след топката, без да гледа. То е ниско и се появява внезапно иззад коли и огради. Единствената надеждна защита е предварително ниската скорост: при 30 км/ч спираш за метри, при 50 — прегазваш. Секунда закъсняла реакция струва живот.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква явно ниска скорост и готовност за спиране при приближаване към квартална пътека, незабавна реакция при появата на детето и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [CHILD_BALL_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-crossing-white-cane — „Пешеходец с бял бастун" (PE-14) on pe-cane-v1
//    (crossing at y = 92, a 50 km/h urban street). A blind pedestrian signals
//    with a white cane and crosses very slowly (0.75 m/s): absolute, everywhere
//    priority (ЗДвП). The lesson is RECOGNITION — the cane is an unconditional
//    stop command; you cannot rely on eye contact and must never creep or press.
//    Distinct map/geometry + faster street than the elderly slow-crosser (PE-08).
// ---------------------------------------------------------------------------

/**
 * The staged WHITE-CANE crosser at pe-x-1 (0, 92): steps off the WEST curb at
 * 0.75 m/s — a blind pedestrian tapping across, even slower than the elderly
 * profile, so the carriageway stays occupied ~22 s. Released early (within
 * ~56 m) so a correct approach spots the cane far ahead and stops; the lesson
 * is the absolute yield, not a reaction sprint.
 */
const WHITE_CANE_PED: PedestrianDartOutSpec = {
  id: "sc-wcn-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 92 },
  start: { x: CURB_X, y: 92 },
  dir: { x: 1, y: 0 },
  speedMps: 0.75,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 56,
  minTriggerSpeedKmh: 10,
};

/** PE-14 — пешеходец с бял бастун (ЗДвП чл. 119: незрящият пешеходец с бял
 *  бастун има безусловно предимство навсякъде; спираш напълно и изчакваш). */
export const SC_CROSSING_WHITE_CANE: ScenarioSpec = {
  id: "sc-crossing-white-cane",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "бял бастун", "незрящ пешеходец"],
  titleBg: "Пешеходец с бял бастун",
  objectiveBg:
    "Разпознай белия бастун — незрящият пешеходец има безусловно предимство. Спри напълно преди пътеката, без да настъпваш, и го изчакай да я освободи целия, без да разчиташ, че те вижда.",
  archetypeIds: ["PE-14"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-cane-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 92 },
    districtId: "pe-cane-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в своята лента и наблюдавай пешеходната пътека напред." },
    { n: 2, textBg: "Пешеходец с бял бастун стъпва на пътеката — това е незрящ човек с безусловно предимство. Намали рано." },
    { n: 3, textBg: "Спри напълно преди зебрата, без да настъпваш — той не може да те види и се ориентира по слуха." },
    { n: 4, textBg: "Изчакай търпеливо да измине ЦЯЛОТО платно; движи се бавно и има нужда от много време." },
    { n: 5, textBg: "Потегли едва когато е слязъл напълно от пътеката, и премини спокойно." },
  ],
  success: [
    {
      id: "sc-wcn-approach",
      titleBg: "Приближи пътеката с готовност за пълно спиране",
      params: { kind: "reachZone", x: LANE_2, y: 80, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-wcn-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 130, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 100 },
  shadow: { path: "content/traces/sc-crossing-white-cane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-white-cane/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване към незрящия",
      whatWentWrongBg:
        "Колата задържа висока скорост към пътеката, докато незрящият пешеходец с бял бастун вече пресичаше. Пред пешеходна пътека със стъпил пешеходец скоростта трябва да позволява спиране — чл. 119; при незрящ човек, който не може да реагира на теб, готовността за спиране е още по-задължителна.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-white-cane/mistake-not-yielded.trace.json" },
      titleBg: "Непропускане на незрящия пешеходец",
      whatWentWrongBg:
        "Водачът мина през пътеката, докато незрящият пешеходец още я пресичаше. Белият бастун означава безусловно предимство — незрящият не може да те види, да прецени скоростта ти или да отстъпи. Задължението да спреш и да изчакаш е изцяло твое.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато пешеходец сигнализира с бял бастун — на пътека, на кръстовище, навсякъде. Белият бастун е знак за незрящ човек с безусловно предимство; разпознаването му е самата задача.",
    whyBg:
      "Незрящият пешеходец не може да разчита на зрителен контакт, да прецени скоростта ти или да отскочи в последния момент — цялата отговорност е твоя. Настъпването „под носа“ му е особено опасно, защото го дезориентира. Затова спираш напълно, рано и спокойно, и го изчакваш докрай.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква разпознаване на белия бастун, отчетливо намаляване и пълно спиране без настъпване, и потегляне едва след пълното освобождаване на платното. Преминаване през незрящ пешеходец е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [WHITE_CANE_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The pedestrian-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_PE: readonly ScenarioSpec[] = [
  SC_CROSSING_LET_PASS,
  SC_CROSSING_SLOW_CROSSER,
  SC_CROSSING_RAIN_SPRINT,
  SC_CROSSING_DART,
  SC_CROSSING_BUS_SHADOW,
  SC_CROSSING_CHILD_BALL,
  SC_CROSSING_WHITE_CANE,
];
