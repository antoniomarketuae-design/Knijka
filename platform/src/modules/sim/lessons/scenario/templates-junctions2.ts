/**
 * Scenario templates — the JUNCTION/PRIORITY family, S3 batch-4 wave. DATA
 * ONLY (the templates.ts law): coordinates are denormalized from the committed
 * district files (content/world/tj-emerge-v1.json, tj-occluded-v1.json —
 * tools/maps/gen_ju_junctions2.mjs) so nothing loads world JSON at runtime;
 * the tj-junctions2 battery asserts every pinned value against the generated
 * files, and the sc-ju2 trace gate replays the drives through the production
 * stack.
 *
 * Two NEW junction archetypes, both grading the SAME priority vocabulary the
 * shipped four already prove — but sited so ONLY ONE adjudicator fires:
 *
 *   sc-junction-gap  (JU-04) — Б2 „Спри!" + a car on the priority road. The
 *     student stops (theatre), then emerges into the car → give-way
 *     conflictNear at the stop-line grades FAILED_TO_YIELD. The full stop
 *     itself earns FULL_STOP_AT_STOP_SIGN, so the Б2 adjudicator NEVER
 *     double-grades the emerge fault: rolling the line is not the lesson here,
 *     the gap misjudgment is.
 *   sc-junction-blind (JU-17) — equal T with a SE corner building walling off
 *     the view to the RIGHT. IDENTICAL grading to sc-junction-rhr (the RHR
 *     tracker on the uncontrolled node), the occlusion is world dressing.
 *
 * Shared geometry truths (battery: tj-junctions2-districts.test.ts):
 *   - drawn lane centers sit ±4.0625 m off the road centerline;
 *   - the Б2 line on tj-emerge's 100 m stem sits 27.725 m out (y = −27.725);
 *   - tj-occluded derives NO control at all → right-hand rule at tj-n-c.
 */

import type { ScenarioSpec } from "./types";
import type { PriorityFromRightSpec } from "../../contracts";

/** Drawn lane-center offset from the road centerline on every junction map, m. */
export const JUNCTION2_LANE_CENTER_M = 4.0625;
/** Derived Б2 setback from the junction node on tj-emerge's stem, m. */
export const JUNCTION2_STOP_LINE_M = 27.725;

// ---------------------------------------------------------------------------
// sc-junction-gap — „Спрях, но потеглих в дупка, която я няма" (JU-04)
// on tj-emerge-v1
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car travels the priority road from the player's LEFT
 * (west → east, straight through the junction), timed by the priorityFromRight
 * runner against the player's arrival at the Б2 line. junctionControl
 * "stopLine": the runtime's give-way check (conflictNear at the stop-line
 * crossing) adjudicates — the runner emits the yielded commendation itself
 * (the RHR/roundabout trackers commend on their own; the stop-line give-way
 * case is the orchestrator's to commend, doc 72 N-notes). leadSec is POSITIVE
 * (the car passes the node ~1.1 s before the player's projected crossing), so
 * an emerging player who does NOT wait meets the car still in the box.
 */
export const SC_JUNCTION_GAP_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jgap-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"],
    hold: { nodeIndex: 1, offsetM: -60 }, // 60 m west of the junction
    cruiseSpeedMps: 6.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 92,
  leadSec: -3.5,
  lineDistM: 27.73,
  clearSpeedMps: 7,
};

export const SC_JUNCTION_GAP: ScenarioSpec = {
  id: "sc-junction-gap",
  family: "junction",
  tagsBg: ["кръстовище", "знак Стоп", "Б2", "предимство", "интервал"],
  titleBg: "Стоп и преценка на интервала",
  objectiveBg:
    "Спри напълно на знака Б2, после потегли ЕДВА когато интервалът стига: кола по пътя с предимство на по-малко от три-четири секунди означава изчакване, не спринт през кръстовището.",
  archetypeIds: ["JU-04"],
  conceptIds: ["c-give-way-stop-behavior", "c-priority-concept", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-emerge-v1.json meta.scenario.params.
    params: {
      control: "stop",
      priorityArmM: 160,
      minorArmM: 100,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-emerge-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица — напред е път с предимство и знак Б2 „Спри!“." },
    { n: 2, textBg: "Намали отрано и пусни десен мигач — ще завиваш надясно по главния път." },
    {
      n: 3,
      textBg:
        "Спри НАПЪЛНО преди стоп-линията. Спирането обаче е само половината — сега идва преценката на интервала.",
    },
    {
      n: 4,
      textBg:
        "Гледай приближаващата кола по главния път и брой в секунди: под 3–4 секунди до теб е твърде близо. Изчакай я да премине.",
    },
    { n: 5, textBg: "Чак когато пътят е чист, потегли и завий надясно, плавно и уверено." },
  ],
  success: [
    {
      id: "sc-jgap-approach",
      titleBg: "Приближи знака Б2 с контролирана скорост",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jgap-line",
      titleBg: "Премини стоп-линията след пълно спиране и пропуснат интервал",
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jgap-exit",
      titleBg: "Завий надясно и продължи по пътя с предимство",
      // East-arm eastbound lane center, past the junction area.
      params: { kind: "reachZone", x: 55, y: -4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-junction-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-gap/mistake-cut-gap.trace.json" },
      titleBg: "Потегляне в тесен интервал",
      whatWentWrongBg:
        "Колата спря на Б2, но потегли пред приближаващ автомобил на около секунда и половина — интервал, в който той няма как да не намали заради теб. Спирането не дава предимство; то се дава чак когато пуснеш идващия с предимство да премине.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-gap/mistake-creep-out.trace.json" },
      titleBg: "Пълзящо навлизане в пътя с предимство",
      whatWentWrongBg:
        "След спирането колата запълзя навътре в кръстовището, докато колата с предимство още приближаваше — носът навлезе в нейната лента и я принуди да реагира. Бавното навлизане също е отнемане на предимство: важна е позицията, не скоростта.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всеки Б2 „Спри!“ пред път с предимство — но и на всяко „Пропусни предимството“. Спирането е първата стъпка; истинската задача е да прецениш дали идващият е достатъчно далеч.",
    whyBg:
      "Най-честият сблъсък на такова кръстовище не е от неспиране, а от подценен интервал: водачът спира, „вижда“ колата, но не изчислява скоростта ѝ и потегля пред нея. Три-четири секунди резерв е разликата между уверено потегляне и отнето предимство.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: пълно спиране преди линията, реална преценка на приближаващите по главния път и потегляне само в достатъчен интервал. Потегляне пред кола с предимство — дори след коректно спиране — е тежка грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_JUNCTION_GAP_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-blind — „Т-образно с ограничена видимост" (JU-17)
// on tj-occluded-v1
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car crosses the equal T-junction from the player's
 * RIGHT (east → west), timed by the priorityFromRight runner against the
 * player's approach. junctionControl "uncontrolled": the runtime's own
 * right-hand-rule tracker adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY)
 * — the SE corner building only HIDES the car until late (world dressing, zero
 * grading change). This mirrors SC_JUNCTION_RHR_CONFLICT verbatim except for
 * the host district; the near-node dynamics are arm-independent.
 */
export const SC_JUNCTION_BLIND_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jblind-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-17",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  lineDistM: 18,
  clearSpeedMps: 11.5,
};

export const SC_JUNCTION_BLIND: ScenarioSpec = {
  id: "sc-junction-blind",
  family: "junction",
  tagsBg: ["кръстовище", "ограничена видимост", "предимство", "дясното правило"],
  titleBg: "Кръстовище с ограничена видимост",
  objectiveBg:
    "Излез от равнозначното кръстовище, чиято видимост надясно е закрита от сграда: приближи с готовност за спиране, изпълзи внимателно докато видиш, и пропусни идващия отдясно, преди да завиеш.",
  archetypeIds: ["JU-17", "JU-23"],
  conceptIds: ["c-right-hand-rule", "c-equal-junction", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-occluded-v1.json meta.scenario.params.
    params: {
      control: "none",
      priorityArmM: 140,
      minorArmM: 130,
      lanes: 2,
      priorityMaxKmh: 40,
      minorMaxKmh: 40,
    },
    districtId: "tj-occluded-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица към равнозначното кръстовище — сграда на ъгъла закрива гледката надясно." },
    { n: 2, textBg: "Намали много отрано и пусни ляв мигач — ще завиваш наляво по главното направление." },
    {
      n: 3,
      textBg:
        "Видимостта надясно е лоша: приближи почти до спиране и изпълзи внимателно, докато очите наистина видят зад сградата.",
    },
    { n: 4, textBg: "Кола отдясно има предимство по правилото на дясното — спри и я изчакай да премине изцяло." },
    { n: 5, textBg: "Щом пътят е чист, завий наляво и продължи на запад." },
  ],
  success: [
    {
      id: "sc-jblind-approach",
      titleBg: "Приближи кръстовището бавно, с готовност за спиране",
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 22 },
    },
    {
      id: "sc-jblind-cross",
      titleBg: "Премини наляво, след като пропуснеш идващия отдясно",
      // West-arm westbound lane center, past the 40 m junction area.
      params: { kind: "reachZone", x: -50, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-junction-blind/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-blind/mistake-barge.trace.json" },
      titleBg: "Изскачане иззад сградата",
      whatWentWrongBg:
        "Колата навлезе в кръстовището без да намали, точно там, където сградата крие идващите отдясно — а отдясно приближаваше автомобил с предимство. При закрита видимост скоростта убива времето за реакция: тук се пълзи, не се нахлува.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-blind/mistake-no-look.trace.json" },
      titleBg: "Навлизане без оглеждане зад сградата",
      whatWentWrongBg:
        "Водачът се вмъкна в кръстовището, без изобщо да изчака да види зад сградата — колата с предимство остана скрита до самия удар. При ограничена видимост единствената защита е да изпълзиш, докато погледът стигне отвъд ъгъла.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На квартални кръстовища, където сграда, ограда или паркирани коли крият идващите — особено на равнозначни улици, където предимството е на този отдясно. Видиш ли, че не виждаш, приемаш, че идва някой.",
    whyBg:
      "„Погледнах, но не видях“ е най-честата причина за страничен сблъсък на кръстовище. Когато ъгълът е закрит, високата скорост означава, че виждаш опасността едва когато е върху теб. Пълзенето и вторият поглед превръщат невъзможната преценка във възможна.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване далеч преди кръстовището, внимателно изпълзяване до точката на видимост, оглеждане наляво-надясно и реално пропускане на идващия отдясно. Нахлуване на сляпо е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_JUNCTION_BLIND_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-left — „Ляв завой от Б2 през пътя с предимство" (JU-04 applied to
// the LEFT turn — the harder emergence: the car crosses the near carriageway
// AND merges into the far one) on tj-emerge-v1 (map REUSED from sc-junction-gap;
// distinct maneuver + a conflict car from the player's RIGHT)
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car travels the priority road from the player's RIGHT
 * (east → west, straight through the junction), timed by the priorityFromRight
 * runner against the player's arrival at the Б2 line. junctionControl
 * "stopLine": the runtime's give-way check (conflictNear at the stop-line
 * crossing) adjudicates — the runner emits the yielded commendation itself. The
 * left-turning player must CROSS this car's lane, so pulling out in front of it
 * is отнемане на предимство (FAILED_TO_YIELD). Timing values mirror
 * SC_JUNCTION_GAP_CONFLICT verbatim (same map, same stem approach) — only the
 * actor's direction and the player's turn differ.
 */
export const SC_JUNCTION_LEFT_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jleft-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -60 }, // 60 m east of the junction
    cruiseSpeedMps: 6.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 92,
  leadSec: -3.5,
  lineDistM: 27.73,
  clearSpeedMps: 7,
};

export const SC_JUNCTION_LEFT: ScenarioSpec = {
  id: "sc-junction-left",
  family: "junction",
  tagsBg: ["кръстовище", "ляв завой", "знак Стоп", "Б2", "предимство"],
  titleBg: "Ляв завой от Б2 през пътя с предимство",
  objectiveBg:
    "Спри напълно на знака Б2 и завий наляво едва когато пътят е чист в ДВЕТЕ посоки: левият завой пресича насрещната лента и се влива в отсрещната — кола с предимство отдясно означава изчакване, не потегляне пред нея.",
  archetypeIds: ["JU-04"],
  conceptIds: ["c-give-way-stop-behavior", "c-priority-concept", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Map REUSED from sc-junction-gap — mirrored in tj-emerge-v1.json params.
    params: {
      control: "stop",
      priorityArmM: 160,
      minorArmM: 100,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-emerge-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица — напред е път с предимство и знак Б2 „Спри!“. Ще завиваш НАЛЯВО." },
    { n: 2, textBg: "Намали отрано и пусни ляв мигач." },
    {
      n: 3,
      textBg:
        "Спри НАПЪЛНО преди стоп-линията. Левият завой е по-опасен: пресичаш едната лента и се вливаш в другата.",
    },
    {
      n: 4,
      textBg:
        "Огледай и в двете посоки. Кола с предимство отдясно, която ще пресечеш, на по-малко от 3–4 секунди означава изчакване.",
    },
    { n: 5, textBg: "Чак когато пътят е чист и в двете посоки, завий наляво плавно и уверено." },
  ],
  success: [
    {
      id: "sc-jleft-approach",
      titleBg: "Приближи знака Б2 с контролирана скорост",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jleft-line",
      titleBg: "Премини стоп-линията след пълно спиране и пропуснат интервал",
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jleft-exit",
      titleBg: "Завий наляво и продължи по пътя с предимство",
      // West-arm westbound lane center, past the junction area.
      params: { kind: "reachZone", x: -55, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-junction-left/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-left/mistake-cut-gap.trace.json" },
      titleBg: "Ляв завой в тесен интервал",
      whatWentWrongBg:
        "Колата спря на Б2, но потегли наляво пред приближаваща отдясно кола с предимство — на около секунда и половина. Левият завой пресича нейната лента; тя трябваше да намали заради теб. Спирането не дава предимство — интервалът го дава.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-left/mistake-creep-out.trace.json" },
      titleBg: "Пълзящо навлизане в пътя с предимство",
      whatWentWrongBg:
        "След спирането колата запълзя навътре в кръстовището, докато колата с предимство приближаваше — носът навлезе в лентата, която левият завой трябва да пресече. Бавното навлизане също е отнемане на предимство: важна е позицията, не скоростта.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всеки ляв завой от улица с Б2 или „Пропусни предимството“ по натоварен път. Левият завой е сред най-опасните маневри: колата ти стои напречно, пресича едната лента и се влива в другата — трябва да е чисто и от двете страни.",
    whyBg:
      "Левият завой отнема повече време и излага колата ти на трафик от двете посоки едновременно. Най-честата грешка не е неспирането, а подцененият интервал към приближаващата с предимство кола, чиято лента ще пресечеш. Три-четири секунди резерв са разликата между уверен завой и отнето предимство.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: пълно спиране преди линията, реална преценка на приближаващите по главния път в ДВЕТЕ посоки и завиване наляво само в достатъчен интервал. Потегляне пред кола с предимство — дори след коректно спиране — е тежка грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_JUNCTION_LEFT_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION/PRIORITY S3 batch-4 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS2: readonly ScenarioSpec[] = [
  SC_JUNCTION_GAP,
  SC_JUNCTION_BLIND,
  SC_JUNCTION_LEFT,
];
