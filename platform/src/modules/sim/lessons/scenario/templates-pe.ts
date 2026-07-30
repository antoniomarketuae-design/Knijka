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
    {
      n: 1,
      textBg:
        "Нощ е и вали. Провери, че късите светлини са включени, ПРЕДИ да потеглиш — в дъжд през нощта те не са само за да виждаш ти, а за да те види мокрият, забързан пешеходец иззад чадъра си.",
    },
    { n: 2, textBg: "Движи се със съобразена скорост — в дъжд и тъмнина спирачният път е около 1,4 пъти по-дълъг." },
    {
      n: 3,
      textBg: "Пред пътеката намали още повече от обичайното — фаровете осветяват само няколко метра напред.",
    },
    {
      n: 4,
      textBg: "Появи ли се пешеходец, който тича към отсрещния тротоар, спри плавно и напълно преди зебрата.",
    },
    { n: 5, textBg: "Изчакай го да освободи цялото платно — при дъжд той бърза и вижда по-трудно." },
    { n: 6, textBg: "Премини спокойно, след като пътеката е свободна." },
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
    {
      // doc 86 L10: this drill compiles NIGHT + RAIN on all four rungs, so both
      // headlight faults are armed against it unconditionally — and until this
      // demo it had five instruction steps, none of which told the student to
      // switch the lamps on, and no lights code in mistakes[]. The student
      // could collect an основна fault for a duty the lesson never stated.
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-lights-off.trace.json" },
      titleBg: "Дъждовна нощ без светлини",
      whatWentWrongBg:
        "Скоростта беше премерена, но колата пое по мократа тъмна улица с изгасени светлини. Отсъжда се като „късите светлини не са включени по тъмно“ — по-тежкото от двете задължения, което поглъща дъждовното (в дъжд светлините са задължителни и през деня; нощем те така или иначе трябва да светят). Двете причини обаче са различни и двете важат тук: без къси светлини ТИ не виждаш пътеката на 40 метра, а мокрият асфалт отразява толкова, че тъмна кола без светлини изчезва и за пешеходеца иззад чадъра му. Затова редът е: първо светлините при запалването, чак после разговорът за скорост.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
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
// 4. sc-crossing-dart — „Внезапен пешеходец на пътеката" (PE-02 dart-out at a
//    MARKED crossing) on pe-dart-v1 (crossing at y = 80, a corner shop west of
//    the zebra hides the curb — the reaction emergency, not the patience test)
// ---------------------------------------------------------------------------

/**
 * The staged DART at pe-x-1 (0, 80): a pedestrian BOLTS off the WEST curb at
 * 2.5 m/s — faster than the 2.2 m/s rain sprinter, a genuine step-off-and-go —
 * and only when the player closes within ~26 m (± the seeded 3 m jitter).
 * Founder R3 #25 ruling: the old 40 m / 1.6 m/s tuning made this drill „95%
 * identical to the basic zebra" — the trigger fired so early and the walk was
 * so calm that a live player experienced the same long-approach patience test
 * as sc-crossing-let-pass. Now the figure appears ~2.5 s before a 40 km/h
 * arrival: still stoppable at the graded 40 km/h approach cap (≈ 20 m
 * reaction + braking), but ONLY with an immediate brake — the reaction
 * emergency the PE-02 archetype is. The corner shop the generator places just
 * west of the zebra hides the curb until the last moment (the occluded start —
 * occlusion world dressing, zero grading change; NOT PE-04: that archetype is
 * an unmarked mid-block child behind PARKED CARS, sc-hz-emergency-stop's
 * drill). Delta discipline vs the siblings: let-pass 55 m/1.4 (patience),
 * night-unlit 30 m/1.4 (visibility), THIS 26 m/2.5 (suddenness).
 */
const DART_PED: PedestrianDartOutSpec = {
  id: "sc-drt-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 80 },
  start: { x: CURB_X, y: 80 },
  dir: { x: 1, y: 0 },
  speedMps: 2.5,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 26,
  minTriggerSpeedKmh: 10,
};

/** PE-02 — внезапен пешеходец на пътеката иззад закрита гледка (ЗДвП чл. 119 +
 *  чл. 20: скорост и внимание, позволяващи спиране при внезапна поява). */
export const SC_CROSSING_DART: ScenarioSpec = {
  id: "sc-crossing-dart",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "внезапна поява", "реакция"],
  titleBg: "Внезапен пешеходец на пътеката",
  objectiveBg:
    "Приближи пешеходната пътека с готовност за спиране: пешеходец изскача иззад ъгъла точно когато наближаваш — реагирай навреме, спри и го пропусни, вместо да минеш през него.",
  archetypeIds: ["PE-02"],
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
// 5. sc-crossing-bus-shadow — „Пешеходци иззад спрял камион" (PE-10, the
//    stopped-large-vehicle kill zone) on pe-bus-v1 (crossing at y = 88). A
//    large stopped vehicle occupies the NEAR (east) curb south of the zebra: a
//    pedestrian cuts in front of it and crosses toward the far curb — emerging
//    into the player's lane from behind it, the „shadow". Graded as a
//    trace-side obstacle rect (scCrossingBusShadow.ts BUS_OBSTACLE), clear of
//    the driving lane; the shadow drive proves the car never touches it. LIVE
//    play shows the occluder too (founder R3 #26 „NO BUS AT ALL" ruling): the
//    procedural BOX TRUCK body stands at the BUS_OBSTACLE rect via the
//    heldSceneryFor dressing channel (sim/scene/scenarioSceneryProps.ts)
//    — the audit's costed stopgap until a real bus rig exists. The COPY is
//    honest about it („камион", not „автобус"); a future bus rig restores the
//    original bus-stop framing. Template id stays sc-crossing-bus-shadow
//    (trace paths + claims are keyed on it).
// ---------------------------------------------------------------------------

/** East (near-side) curb of a 1-lane-per-direction street (= −CURB_X): the
 *  bus stands here and the passenger steps off it. */
const EAST_CURB_X = 9.73;

/**
 * The staged NEAR-SIDE crosser at pe-x-1 (0, 88): steps off the EAST curb in
 * front of the stopped truck at 1.4 m/s, heading WEST across the carriageway,
 * once the player closes within ~44 m. Because she emerges from the truck's
 * shadow she is already in the player's lane by the time the sightline clears
 * — the PE-10 kill zone. The road-occupancy span is symmetric about the
 * centerline, so ROAD_FROM_M / ROAD_TO_M / TRAVEL_M are byte-identical to the
 * west-curb crossers; only the start point and direction flip.
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
  // ⚠ 44 → 48 (doc 86, the T11 inversion found in this family by the lane-10
  // gradient sweep — NOT in the ledger's list). This is the family's only
  // NEAR-SIDE adult crosser: 5.67 m from the east curb to the driving line, so
  // at 1.4 m/s she needs 5.12 s to clear the 1.5 m contact band. With the old
  // 40 km/h approach gate a driver holding EXACTLY the graded cap arrived after
  // 3.94 s — measured closest approach 0.16–0.53 m across the trigger jitter,
  // i.e. a COLLISION for obeying the objective — while 60 km/h cleared at
  // 1.73–2.24 m. The approach gate below drops to 30 km/h (which is what the
  // copy has always said and what all three recorded drives already do) and the
  // release moves out to 48: closest approach at the cap is now 1.83–2.83 m and
  // contact starts at 32–36 km/h, i.e. only ABOVE the cap.
  triggerDistM: 48,
  minTriggerSpeedKmh: 10,
};

/**
 * THE SECOND FIGURE (doc 86 D2 — „plural copy against a singular staged
 * actor"). The lesson is titled «ПешеходцИ иззад спрял камион» and its teach
 * card describes „бързащите хора" in the plural, but the drill staged exactly
 * one walker. A second passenger steps out of the same shadow a stride further
 * north (the zebra is 6 m long, y ∈ [85, 91] — 89.6 is on the paint) at a
 * slightly quicker pace, so what the student sees behind the truck is a small
 * knot of people, not a single figure.
 *
 * The northward offset is the SAFE one: measured constant-speed closest
 * approach at the 30 km/h cap is 2.10–3.10 m across the jitter (the lead
 * walker's own is 1.83–2.83), so the not-yielded demo at 24 km/h and the
 * collision demo at 28 km/h keep grading exactly their authored codes.
 */
const BUS_SHADOW_PED_2: PedestrianDartOutSpec = {
  ...BUS_SHADOW_PED,
  id: "sc-bsh-ped2",
  start: { x: EAST_CURB_X, y: 89.6 },
  speedMps: 1.5,
};

/** PE-10 — пешеходци иззад спряло голямо превозно средство (ЗДвП чл. 119 +
 *  чл. 20: спрелият до пътеката камион крие гледката; приближавай с готовност
 *  за спиране и пропусни изскочилия пешеходец). Copy says КАМИОН — that is
 *  what the world stages today (the R3 #26 truck stopgap; see the section
 *  header). */
export const SC_CROSSING_BUS_SHADOW: ScenarioSpec = {
  id: "sc-crossing-bus-shadow",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "спрял камион", "закрита гледка"],
  titleBg: "Пешеходци иззад спрял камион",
  objectiveBg:
    "Приближавай спрелия до пътеката камион с готовност за спиране — иззад него на пътеката може да излезе пешеходец, когото не виждаш. Пропусни го и премини едва когато пътеката е свободна.",
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
    { n: 1, textBg: "Потегли по улицата и приближавай спрелия вдясно камион с готовност за спиране — под 30 км/ч, кракът над спирачката." },
    { n: 2, textBg: "Камионът крие тротоара пред себе си — не разчитай, че щом не виждаш никого, няма никой." },
    { n: 3, textBg: "Иззад камиона на пътеката излизат ДВАМА пешеходци, един след друг. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и ги изчакай да освободят цялото платно — вторият винаги е този, когото не си видял." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-bsh-approach",
      titleBg: "Приближи камиона и пътеката с готовност за спиране",
      // 40 → 30 (doc 86, the near-side inversion above): 40 km/h past a large
      // vehicle stopped AT a zebra is not «готовност за спиране» in any reading
      // of чл. 119, all three recorded drives already hold 24–28, and the
      // trace scripts themselves call 30 „the approach cap". The gate now says
      // what the lesson has always taught.
      params: { kind: "reachZone", x: LANE_2, y: 76, radiusM: 10, maxSpeedKmh: 30 },
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
      titleBg: "Преминаване покрай камиона без пропускане",
      whatWentWrongBg:
        "Водачът подмина спрелия камион, без да пропусне излезлия иззад него пешеходец, и мина през заетата пътека. Спрялото до пътеката голямо превозно средство е предупреждение — пешеходецът на пътеката има предимство по чл. 119, дори да се появява внезапно иззад него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-bus-shadow/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца иззад камиона",
      whatWentWrongBg:
        "Колата подмина камиона със скорост и без готовност — и блъсна изскочилия иззад него пешеходец на самата пътека. При закрита от спряло превозно средство гледка скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спряло до пътеката голямо превозно средство — камион, автобус на спирка, бус — там пешеходец може да излезе иззад него без предупреждение точно преди зебрата. Класическата „сляпа зона“ зад голямото превозно средство е сред най-честите места за прегазване в града.",
    whyBg:
      "Голямото превозно средство закрива и пешеходеца от теб, и теб от пешеходеца — а бързащите хора пресичат точно отпред. Единствената защита е предварително намалената скорост и готовността за спиране: изскочи ли човек иззад него, имаш части от секундата за реакция със спирачка, не със завиване.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква видимо намалена скорост и готовност за спиране при подминаване на спрял камион или автобус до пътека, отчетлива реакция при появата на пешеходец и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [BUS_SHADOW_PED, BUS_SHADOW_PED_2],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-crossing-child-ball — „Дете тича след топка" (PE-02 dart at a MARKED
//    crossing + PE-04 child-after-ball anticipation stimulus)
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
 * emergency, not a long approach). The staged dart at a MARKED crossing is the
 * PE-02 mechanic; the child-after-ball is the PE-04 anticipation stimulus (the
 * canonical hazard-perception clip). The corner shop just west of the zebra
 * hides the frontage until the last moment (occlusion world dressing, zero
 * grading change). The occupancy span is the shared symmetric road window.
 *
 * Founder R3 #27 („no kid, no ball; completely wrong"): the figure now
 * RENDERS as a child (`variant: "child"` — the small rig, 0.72 scale, bigger
 * head, bright jacket), and the BALL leads it: at the trigger the template's
 * `hazard` ball (below) rolls out across the zebra, and the child follows
 * `ballLeadSec` 0.5 s behind — the ball IS the warning cue the anticipation
 * lesson teaches (see a ball → expect a child). The reaction stopwatch arms
 * at the ball. 0.5 s (not more): the ball launches faster (4.5 vs 2.6 m/s),
 * so the visual lead keeps growing across the road — while the child still
 * reaches the roadway early enough that the too-fast demo's 38 km/h hold
 * meets a genuinely occupied zebra (the crossingTooFastSustainSec = 1 s
 * window; probed against the seeded choreography).
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
  variant: "child",
  ballLeadSec: 0.5,
};

/** PE-02 / PE-04 — дете тича след топка на пътеката (ЗДвП чл. 119 + чл. 20: в
 *  жилищна зона с деца скоростта и вниманието трябва да позволяват спиране при
 *  внезапна поява). PE-02 = дартът на маркирана пътека; PE-04 = стимулът
 *  „дете след топка" (класическото разпознаване на опасност). */
export const SC_CROSSING_CHILD_BALL: ScenarioSpec = {
  id: "sc-crossing-child-ball",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "дете", "жилищна зона"],
  titleBg: "Дете тича след топка на пътеката",
  objectiveBg:
    "В квартална улица приближавай пътеката бавно и с готовност за спиране — дете може да изскочи след топка си на платното. Реагирай навреме, спри и го пропусни.",
  archetypeIds: ["PE-02", "PE-04"],
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
  // R3 #27 — the BALL: the lesson's ballDartOut visual (TrafficLayer's L5
  // ball, reused) rolls from the same west curb across the zebra at 4.5 m/s
  // the moment the encounter triggers; the child follows 0.5 s later
  // (CHILD_BALL_PED.ballLeadSec). travelM 20.5 carries it across the 16.25 m
  // carriageway and onto the far curb, where it rests. Render-only — the
  // recorded traces and the grading never read it.
  hazard: {
    kind: "ballDartOut",
    x: CURB_X,
    y: 78,
    dirX: 1,
    dirY: 0,
    speedMps: 4.5,
    travelM: 20.5,
  },
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
 *
 * Founder R3 #28 („same adult, no cane, just slower; useless"): the figure
 * now RENDERS as the elder-with-white-cane rig (`variant: "elder"` — slight
 * stoop, right arm extended, the thin white cane sweeping the tarmac ahead).
 * The cane IS the recognition cue this drill grades the response to — which
 * is also why the PE-08 slow crosser (sc-crossing-slow-crosser) deliberately
 * stays variant-less: a white cane there would dilute PE-14's unique признак.
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
  variant: "elder",
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

// ---------------------------------------------------------------------------
// 8. sc-pe-jaywalker — „Пешеходец на червено" (PE-13) on pe-jay-v1
// ---------------------------------------------------------------------------

/**
 * PE-13 — the jaywalker against red at a SIGNALIZED junction (ЗДвП чл. 120:
 * грижата към пешеходеца на платното не зависи от неговото нарушение). The
 * batch-1 header's skip note is now RESOLVED: pe-jay-v1 (gen_pe_jaywalk.mjs)
 * reuses the signal-x builder — a real signalized INTERSECTION the runtime
 * adjudicates — with ONE post-processed crossing (pej-x-1, north exit arm,
 * y = 34, signalized: true — glued to the junction cluster). The STAGED
 * walker ignores the red pedestrian phase by design: that IS the jaywalk.
 * The crossing-zone grading arms on OCCUPANCY, not phase — the driver's
 * green never suspends the duty of care. Trigger 55 m releases her as the
 * player crosses the stop line on green (natural phases in live play only
 * admit a line crossing on green, so the story holds structurally; the
 * recorded ghosts pin the canonical green via signalOffsets).
 */
const JAY_PED: PedestrianDartOutSpec = {
  id: "sc-jay-ped",
  kind: "pedestrianDartOut",
  crossingId: "pej-x-1",
  crossing: { x: 0, y: 34 },
  start: { x: CURB_X, y: 34 },
  dir: { x: 1, y: 0 },
  speedMps: 1.5,
  travelM: 23.45, // curb → across the 16.25 m carriageway → 5.6 m walk-out
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

export const SC_PE_JAYWALKER: ScenarioSpec = {
  id: "sc-pe-jaywalker",
  family: "pedestrians",
  tagsBg: ["пешеходци", "светофар", "зелено", "грижа"],
  titleBg: "Пешеходец на червено",
  // Founder R3 #29 (doc 62 — „zebra placement dubious"): the crossing pej-x-1
  // sits ~34 m past the junction node (a real Sofia pattern: пътека на
  // изхода, не на самото кръстовище), so the copy says „малко след", not
  // „веднага след". The „no traffic light" half of #29 is the lamp-render
  // path (W-SIG): pe-jay-v1 IS signalized (sx-n-c signalized: true,
  // pej-x-1 signalized: true) — the map needs no reuse swap.
  objectiveBg:
    "Премини светофарното кръстовище на зелено — и спри за пешеходеца, който пресича на своето червено на пътеката малко след него. Зеленото разрешава на теб, но не отменя грижата към човека на платното.",
  archetypeIds: ["PE-13"],
  conceptIds: ["c-pedestrian-rights-duties", "c-crosswalk-yield", "c-traffic-light-signals"],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in pe-jay-v1.json meta.scenario.params
    // (tools/maps/gen_pe_jaywalk.mjs: buildSignalXDistrict + the one
    // post-processed crossing).
    params: {
      armNorthM: 120,
      armSouthM: 120,
      armEastM: 90,
      armWestM: 90,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "pe-jay-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни на север — напред е светофарно кръстовище, а малко след него има пешеходна пътека." },
    { n: 2, textBg: "Светофарът за теб е зелен — премини кръстовището с готовност: гледай и пътеката отвъд него." },
    {
      n: 3,
      textBg:
        "Пешеходец пресича на своето червено! Твоето зелено не отменя грижата — намали и спри преди пътеката.",
    },
    { n: 4, textBg: "Изчакай го да освободи платното напълно — не се разминавай с него „на косъм“." },
    { n: 5, textBg: "Продължи на север, когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-jay-approach",
      titleBg: "Приближи кръстовището с премерена скорост",
      params: { kind: "reachZone", x: LANE_2, y: -45, radiusM: 8, maxSpeedKmh: 45 },
    },
    {
      id: "sc-jay-clear",
      titleBg: "Премини пътеката след кръстовището, когато е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 70, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-pe-jaywalker/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-jaywalker/mistake-my-green.trace.json" },
      titleBg: "„Аз съм на зелено“",
      whatWentWrongBg:
        "Колата премина през заетата пътека, защото „светофарът е зелен“. Зеленото разрешава преминаването през кръстовището — но пешеходецът, стъпил на платното, е защитен от чл. 120 дори в нарушение: пропускаш го, а простъпката му я отбелязва законът, не бронята ти.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-jaywalker/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца",
      whatWentWrongBg:
        "Погледът остана върху зеления светофар, а не върху пътеката зад него — и колата удари пресичащия. Ударът в пешеходец прекратява изпита независимо чий сигнал е бил зелен: грижата по чл. 120 е абсолютна.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко светофарно кръстовище с пътека след него — особено в града, където пешеходци дотичват „на червено“. Твоето зелено е разрешение да преминеш, не имунитет срещу човека на платното.",
    whyBg:
      "Най-тежките удари с пешеходци стават точно на зелено за колата: водачът гледа светофара, не пътеката, и скоростта е висока. Чл. 120 е категоричен — пешеходецът на платното се пропуска дори когато пресича неправилно, защото той губи живота, а ти само секунди.",
    lawRef: "ЗДвП чл. 120",
    examinerBg:
      "Изпитващият гледа: премереното преминаване на зелено С наблюдение на пътеката отвъд, отчетливо спиране при пешеходец на платното (независимо от сигнала му) и потегляне едва на чиста пътека. Преминаване покрай пресичащ пешеходец е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [JAY_PED],
  /**
   * ⚠ doc 86 T10 — THE PROMISED GREEN WAS DELIVERED AS RED. Instruction 2 says
   * «Светофарът за теб е зелен», but the drill authored neither `signalPlan`
   * nor `signalModes`, so the lamp ran on the wall clock. On pe-jay-v1 the
   * junction node sx-n-c (0, 0) and the signalized crossing pej-x-1 (0, 34) are
   * 34 m apart — inside `CLUSTER_LINK_M` 40 — so they merge into ONE cluster
   * keyed „pej-x-1", whose deterministic offset is `fnv1a("pej-x-1") % 50` =
   * 27 s. With SIGNAL_TIMING = 20 green / 3 yellow / 26 red / 1 redYellow that
   * puts the NS axis on RED for t = 0 … 21.9 s. The player spawns at
   * sx-spawn-south (0, −105), 77.3 m short of the derived stop line at
   * y = −27.7, and reaches it at t ≈ 6.2 s (45 km/h) to 13.9 s (20 km/h) —
   * the WHOLE plausible arrival window sits inside the red. `RED_LIGHT_CROSSED`
   * (опасна, session-terminating at L4) was fully armed against a lesson whose
   * own copy told the student the light was green, and the red stall then held
   * the driver until the staged walker had finished crossing, so the jaywalk
   * encounter never happened either.
   *
   * `greenFresh` pins a full 20 s green the first frame the player enters the
   * ring. triggerM 90 puts that ring boundary at y = −73 (the cluster centroid
   * is (0, 17), the midpoint of the junction node and the crossing): 32 m past
   * the spawn — so the pin is an approach-relative arrival, not a session-start
   * dial — and 45.3 m short of the stop line, which even a 15 km/h crawl covers
   * in 10.9 s of the 20 s green. clusterId names the junction node explicitly
   * rather than relying on the cluster's id being the alphabetically-first
   * member. The trace recorder never reads signalPlan, so the committed ghosts
   * keep their authored signalOffsets byte-identically (contracts.ts:223).
   */
  signalPlan: { arm: "greenFresh", triggerM: 90, clusterId: "sx-n-c" },
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
  SC_PE_JAYWALKER,
];
