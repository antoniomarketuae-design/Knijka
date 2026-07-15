/**
 * Scenario templates — the JUNCTION/SIGNALS family (S2-B breadth wave).
 * DATA ONLY, the templates.ts law: coordinates are denormalized from the
 * committed district files (content/world/tj-rhr-v1.json, tj-stop-v1.json,
 * sx-v1.json — tools/maps/gen_t_junction.mjs + gen_signal_x.mjs) so nothing
 * loads world JSON at runtime; the templates-junctions test asserts every
 * pinned value against the generated files.
 *
 * Shared geometry truths (batteries: tj-districts.test.ts, sx-district.test.ts):
 *   - drawn lane centers sit ±4.0625 m off the road centerline (2-lane
 *     two-way, 3.25 m × 2.5 perceptual scale / 2);
 *   - primary/secondary junction mouths cut 27.125 m from the node, so every
 *     derived stop line (Б2 and светофар alike) sits 27.725 m out;
 *   - the tj-rhr junction derives NO control at all → right-hand rule;
 *   - sx-n-c is ONE single-node signal cluster (natural FNV-1a offset 1).
 *
 * Grading note recorded during S2-B (the mission's JU-15 verification): the
 * STOP_LINE_OVERSHOOT detector (rules/engine.ts) requires
 * nextStopLineControl === "trafficLight" + a red/redYellow lamp — on a Б2
 * map every line is control "stopSign" with NO lamp channel, so the code is
 * STRUCTURALLY unreachable there (not an adjudicator bug: rolling past a Б2
 * line without a prior qualifying stop IS the Б2 offence, and it grades
 * STOP_SIGN_NO_FULL_STOP at the crossing). The overshoot demo therefore
 * lives on the signalized map (sc-signal-response „Пропълзяване на червено"),
 * where the lawful-presence latch semantics actually exist — and the
 * sc-junction-stop „stop past the line" demo honestly grades
 * STOP_SIGN_NO_FULL_STOP.
 */

import type { ScenarioSpec } from "./types";
import type {
  AmberDilemmaSpec,
  OncomingLeftTurnSpec,
  PriorityFromRightSpec,
} from "../../contracts";

/** Drawn lane-center offset from the road centerline on every S2-B map, m. */
export const JUNCTION_LANE_CENTER_M = 4.0625;
/** Derived stop-line setback from the junction node (primary/secondary
 *  mouths: half-width 12.125 + corner 15 + paint inset 0.6), m. */
export const JUNCTION_STOP_LINE_M = 27.725;

// ---------------------------------------------------------------------------
// sc-junction-rhr — „Предимство отдясно" (JU-01) on tj-rhr-v1
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car crosses the equal T-junction from the player's
 * RIGHT (east arm → west arm, straight through), timed by the
 * priorityFromRight runner against the player's approach up the stem.
 * junctionControl "uncontrolled": the runtime's own right-hand-rule tracker
 * adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY) — the runner only
 * records the outcome. leadSec is NEGATIVE: the car reaches the node ~3.5 s
 * AFTER the player's projected line-crossing, so a barging player crosses
 * the car's path with the conflict still inbound (the classic „отнемане на
 * предимство отдясно"), while a yielding player watches it pass.
 */
export const SC_JUNCTION_RHR_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jrhr-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-01",
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

export const SC_JUNCTION_RHR: ScenarioSpec = {
  id: "sc-junction-rhr",
  family: "junction",
  tagsBg: ["кръстовище", "предимство", "дясното правило"],
  titleBg: "Предимство отдясно",
  objectiveBg:
    "Премини равнозначното кръстовище по правилото на дясното: намали, огледай се, пропусни идващия отдясно и завий наляво чак когато пътят е чист.",
  archetypeIds: ["JU-01", "JU-23"],
  conceptIds: ["c-right-hand-rule", "c-equal-junction", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in tj-rhr-v1.json meta.scenario.params.
    params: {
      control: "none",
      priorityArmM: 150,
      minorArmM: 120,
      lanes: 2,
      priorityMaxKmh: 40,
      minorMaxKmh: 40,
    },
    districtId: "tj-rhr-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица към кръстовището — то е равнозначно: няма знаци, няма светофар." },
    { n: 2, textBg: "Намали отрано и пусни ляв мигач — ще завиваш наляво по главното направление." },
    {
      n: 3,
      textBg:
        "Преди устието се огледай: първо наляво, после НАДЯСНО. Кола отдясно има предимство — това е правилото на дясното.",
    },
    { n: 4, textBg: "Идва ли кола отдясно — спри преди кръстовището и я изчакай да премине изцяло." },
    { n: 5, textBg: "Щом пътят е чист, завий наляво и продължи на запад." },
  ],
  success: [
    {
      id: "sc-jrhr-approach",
      titleBg: "Приближи кръстовището бавно и с готовност за спиране",
      // Stem lane center, just before the junction area (mouth at ~17 m).
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 25 },
    },
    {
      id: "sc-jrhr-cross",
      titleBg: "Премини кръстовището наляво, след като пропуснеш идващия отдясно",
      // West-arm westbound lane center, past the 40 m junction area (the
      // right-hand-rule tracker commends on leaving it).
      params: { kind: "reachZone", x: -50, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-junction-rhr/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-rhr/mistake-barge.trace.json" },
      titleBg: "Нахлуване без предимство",
      whatWentWrongBg:
        "Колата навлезе в кръстовището с непроменена скорост, докато отдясно приближаваше автомобил с предимство. По правилото на дясното той минава пръв — навлизането пред него е опасна грешка, която на изпита прекратява всичко.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-rhr/mistake-no-look.trace.json" },
      titleBg: "Навлизане без оглеждане",
      whatWentWrongBg:
        "Водачът се вмъкна в кръстовището, без изобщо да погледне надясно — колата с предимство остана невидима до самия удар. Правилото на дясното работи само ако главата се завърти: наляво, надясно и чак тогава напред.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище на равнозначни пътища — малки квартални пресечки без знаци и светофари. Ако нищо не урежда предимството, урежда го правилото на дясното.",
    whyBg:
      "Кръстовищата на равнозначни улици са сред най-честите места за сблъсък „отстрани“ — точно защото изглеждат безобидни. Който автоматично поглежда надясно и отстъпва, не разчита на късмет, а на правило, което другият водач също знае.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа три неща: осезаемо намаляване преди равнозначно кръстовище, завъртане на главата наляво и надясно и реално пропускане на идващия отдясно — без колебание, но и без нахлуване.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_JUNCTION_RHR_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-stop — „Знак Стоп" (JU-03/JU-15) on tj-stop-v1
// ---------------------------------------------------------------------------

export const SC_JUNCTION_STOP: ScenarioSpec = {
  id: "sc-junction-stop",
  family: "junction",
  tagsBg: ["кръстовище", "знак Стоп", "Б2", "пълно спиране"],
  titleBg: "Знак Стоп",
  objectiveBg:
    "Спри НАПЪЛНО на знака Б2 — преди стоп-линията, с неподвижни колела за няколко секунди — огледай се наляво-надясно-наляво и завий надясно по пътя с предимство.",
  archetypeIds: ["JU-03", "JU-15"],
  conceptIds: ["c-give-way-stop-behavior", "c-stop-give-way-signs", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-stop-v1.json meta.scenario.params: a PRIMARY priority
    // road makes the stop-sign heuristic derive the Б2 line at the stem
    // mouth naturally AND the world builder paint the visible Б2 sign
    // (props.ts maxRank >= 5) — zero STOP_LINE_OVERRIDES entries.
    params: {
      control: "stop",
      priorityArmM: 150,
      minorArmM: 120,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-stop-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица — напред е кръстовище с път с предимство и знак Б2 „Спри!“." },
    { n: 2, textBg: "Намали отрано и пусни десен мигач — ще завиваш надясно по главния път." },
    {
      n: 3,
      textBg:
        "Спри НАПЪЛНО преди стоп-линията: колелата неподвижни, брой спокойно до три. „Почти спрях“ не е спиране.",
    },
    { n: 4, textBg: "Огледай се: наляво, надясно и пак наляво. На Стоп спираш винаги — дори пътят да изглежда празен." },
    { n: 5, textBg: "Потегли и завий надясно, като се движиш плавно по пътя с предимство." },
  ],
  success: [
    {
      id: "sc-jstop-approach",
      titleBg: "Приближи знака Б2 с контролирана скорост",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jstop-line",
      titleBg: "Премини стоп-линията след пълно спиране",
      // Progression: the crossing completes it; the rule engine grades the
      // full stop separately (STOP_SIGN_NO_FULL_STOP vs the commendation).
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jstop-exit",
      titleBg: "Завий надясно и продължи по пътя с предимство",
      // East-arm eastbound lane center, past the junction area.
      params: { kind: "reachZone", x: 55, y: -4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 55 },
  shadow: { path: "content/traces/sc-junction-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-stop/mistake-rolling-stop.trace.json" },
      titleBg: "Търкалящо спиране",
      whatWentWrongBg:
        "Колата само забави до пешеходна скорост и „изтече“ през стоп-линията, без колелата да спрат напълно. Законът и изпитът са еднозначни: на Б2 се спира ДОКРАЙ, всеки път — търкалящото спиране е опасна грешка.",
      codeRefs: ["STOP_SIGN_NO_FULL_STOP"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-stop/mistake-past-line.trace.json" },
      titleBg: "Спиране след линията",
      whatWentWrongBg:
        "Спирачката дойде късно и колата спря чак СЛЕД стоп-линията, с предница в устието на кръстовището. Пресичането на линията без предварително пълно спиране вече е нарушението — спирането метри по-навътре не го поправя, а и носът ти стои в пътя на движещите се с предимство.",
      codeRefs: ["STOP_SIGN_NO_FULL_STOP"],
    },
  ],
  teach: {
    whenBg:
      "На всеки знак Б2 „Спри!“ — той се поставя там, където видимостта е твърде лоша, за да прецениш в движение дали идва някой. Спираш напълно преди линията, после гледаш.",
    whyBg:
      "Знакът Б2 компенсира скрита опасност: ъгъл, ограда, паркирали коли. Пълното спиране ти дава секундите, в които главата се завърта и очите наистина виждат. Затова „почти спрях“ е най-честата причина за провален изпит на това кръстовище.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият проверява: пълно спиране ПРЕДИ линията (неподвижни колела, не под 1–2 секунди), оглеждане наляво-надясно-наляво и уверено потегляне. Спиране върху или след линията се отчита като неспиране.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-signal-response — „Светофар" (JU-05/JU-06) on sx-v1
// ---------------------------------------------------------------------------

/**
 * The JU-06 dilemma dial (doc 72 N2): pins the green→yellow flip 2.6 s of
 * travel before the player's stop line — but ONLY for an approach at or
 * above 21 km/h. The shadow and the red-creep demo approach slower and never
 * arm it, so their recordings keep the authored red-arrival pinning; the
 * amber-gamble demo (22 km/h) triggers it and crosses on a yellow the
 * runtime adjudicates as stoppable (YELLOW_LIGHT_NOT_STOPPED).
 */
export const SC_SIGNAL_AMBER_EVENT: AmberDilemmaSpec = {
  id: "sc-sig-amber",
  kind: "amberDilemma",
  libraryEventId: "JU-06",
  signalNodeId: "sx-n-c",
  junction: { x: 0, y: 0 },
  armDistM: 60,
  minTriggerSpeedKmh: 21,
  lineDistM: 27.73,
  flipEtaSec: 2.6,
};

export const SC_SIGNAL_RESPONSE: ScenarioSpec = {
  id: "sc-signal-response",
  family: "signals",
  tagsBg: ["светофар", "червено", "жълто", "стоп-линия"],
  titleBg: "Светофар",
  objectiveBg:
    "Реагирай правилно на светофара: спри плавно преди стоп-линията на червено, изчакай зеленото и премини кръстовището без колебание.",
  archetypeIds: ["JU-05", "JU-06"],
  conceptIds: ["c-traffic-light-signals", "c-light-junction", "c-signal-hierarchy"],
  map: {
    archetype: "x-junction",
    // Mirrored in sx-v1.json meta.scenario.params.
    params: {
      armNorthM: 90,
      armSouthM: 120,
      armEastM: 120,
      armWestM: 170,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "sx-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по булеварда на север — напред е светофарно кръстовище." },
    {
      n: 2,
      textBg:
        "Гледай светофара отдалеч и решавай отрано: на червено или жълто започни плавно спиране, без резки движения.",
    },
    {
      n: 3,
      textBg:
        "Спри на 1–2 метра ПРЕДИ стоп-линията — така виждаш и линията, и светофара, без предницата да е върху пътеката.",
    },
    { n: 4, textBg: "На червено и жълто заедно се приготви, но потегли чак на чисто зелено — след бърз поглед наляво и надясно." },
    { n: 5, textBg: "Премини кръстовището с равномерна скорост и продължи на север." },
  ],
  success: [
    {
      id: "sc-sig-approach",
      titleBg: "Приближи светофара с готовност за спиране",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 45 },
    },
    {
      id: "sc-sig-pass",
      titleBg: "Премини светофара, след като изчакаш червен сигнал",
      // A10 requireRedMet: a greens-only luck run cannot complete — the
      // student must actually handle a red (stop in zone + green crossing).
      params: {
        kind: "passSignal",
        nodeId: "sx-n-c",
        x: 0,
        y: 0,
        radiusM: 45,
        control: "trafficLight",
        requireRedMet: true,
      },
    },
    {
      id: "sc-sig-exit",
      titleBg: "Излез от кръстовището на север",
      params: { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-signal-response/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-response/mistake-amber-gamble.trace.json" },
      titleBg: "Жълтото като зелено",
      whatWentWrongBg:
        "Светна жълто, имаше предостатъчно място за спокойно спиране — но кракът остана на газта и колата пресече линията на жълто. Жълтият сигнал забранява навлизането, освен когато безопасното спиране вече е невъзможно; тук то беше напълно възможно.",
      codeRefs: ["YELLOW_LIGHT_NOT_STOPPED"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-response/mistake-red-creep.trace.json" },
      titleBg: "Пропълзяване на червено",
      whatWentWrongBg:
        "Спирането започна късно и колата спря с предница НАД стоп-линията, върху мястото за пешеходците. Линията показва докъде е твоето място на червено — спрелият отвъд нея е спрял на пътя на другите, и изпитващият го отбелязва.",
      codeRefs: ["STOP_LINE_OVERSHOOT"],
    },
  ],
  teach: {
    whenBg:
      "На всяко светофарно кръстовище, много пъти на ден. Решението за спиране се взима при появата на жълтото — не при червеното.",
    whyBg:
      "Пресичането на червено е сред най-смъртоносните грешки в града, а навикът се гради на жълтото: който гони жълтия сигнал, рано или късно влиза на червено. Плавното, ранно спиране пази и теб, и движещия се зад теб.",
    lawRef: "ППЗДвП чл. 31",
    examinerBg:
      "Изпитващият гледа: ранно забелязване на сигнала, плавно спиране 1–2 метра преди линията, търпение на червено и червено-жълто и потегляне до 2–3 секунди на зелено. Спиране върху линията или пътеката е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_SIGNAL_AMBER_EVENT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-turn-left-oncoming — „Ляв завой срещу насрещно" (JU-10) on sx-v1
// ---------------------------------------------------------------------------

/**
 * The JU-10 pair (doc 72 — the #1 capability gap, N1 machinery of 55a072a):
 * TWO oncoming actors straight through the junction. The TIGHT one (1.4 s —
 * the guilty band, LEFT_TURN_CONVICT_GAP_SEC = 2.0) forces the wait; the
 * FOLLOW one trails far enough that after yielding to the first, the player
 * turns into a ≥ 4 s gap — the accepted gap the runner measures
 * (acceptedGapSec) and the rubric's taught norm. Site: the SIGNALIZED sx-n-c
 * — the oncoming-left-turn house precedent (orchestrator tests): no RHR
 * tracker and no stop-sign give-way check can double-grade the encounter.
 */
export const SC_LTAP_TIGHT_EVENT: OncomingLeftTurnSpec = {
  id: "sc-ltap-tight",
  kind: "oncomingLeftTurn",
  libraryEventId: "JU-10",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"],
    hold: { nodeIndex: 1, offsetM: -70 },
    cruiseSpeedMps: 8.5,
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 1.4,
  clearSpeedMps: 12.5,
};

/**
 * The follow car: gapSec 18 keeps the sync's desired stand-off distance
 * ((playerEta + gapSec) × cruise ≥ 175 m) ABOVE the 160 m hold for the whole
 * approach, so the actor never advances before the player commits/yields —
 * the runner then freezes staging and the delivered arrival is exactly
 * yield-time + 160 m / 7 m/s ≈ 23 s: after the correct drive's ~8 s wait
 * and ~8 s turn, the ACCEPTED gap lands at ~6 s (≥ the 4 s taught norm);
 * a rusher meets it still far out and only the tight car convicts.
 */
export const SC_LTAP_FOLLOW_EVENT: OncomingLeftTurnSpec = {
  id: "sc-ltap-follow",
  kind: "oncomingLeftTurn",
  libraryEventId: "JU-10",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"],
    hold: { nodeIndex: 1, offsetM: -160 },
    cruiseSpeedMps: 7,
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 18,
  clearSpeedMps: 12.5,
};

export const SC_TURN_LEFT_ONCOMING: ScenarioSpec = {
  id: "sc-turn-left-oncoming",
  family: "junction",
  tagsBg: ["ляв завой", "насрещно движение", "предимство", "интервал"],
  titleBg: "Ляв завой срещу насрещно",
  objectiveBg:
    "Завий наляво през кръстовището, като пропуснеш насрещно движещите се: изчакай плътния интервал (4 и повече секунди) и завий решително, без да режеш пътя на никого.",
  archetypeIds: ["JU-10"],
  conceptIds: ["c-left-turn-oncoming", "c-turning-left-junction", "c-priority-concept"],
  map: {
    archetype: "x-junction",
    params: {
      armNorthM: 90,
      armSouthM: 120,
      armEastM: 120,
      armWestM: 170,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "sx-v1",
  },
  start: {
    spawnPointId: "sx-spawn-east",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни на запад по пресечната улица — на кръстовището ще завиваш наляво, на юг." },
    { n: 2, textBg: "Пусни ляв мигач отрано и намали — завоят наляво се готви, не се импровизира." },
    {
      n: 3,
      textBg:
        "Насрещните имат предимство. Прецени интервала в СЕКУНДИ: кола на по-малко от 4 секунди означава чакане, не спринт.",
    },
    { n: 4, textBg: "Изчакай близкия насрещен автомобил да премине изцяло — спокойно, пред устието, без да навлизаш." },
    { n: 5, textBg: "В плътния интервал завий решително наляво и продължи на юг." },
  ],
  success: [
    {
      id: "sc-ltap-approach",
      titleBg: "Приближи кръстовището с ляв мигач и премерена скорост",
      // East-arm westbound lane center.
      params: { kind: "reachZone", x: 45, y: 4.06, radiusM: 8, maxSpeedKmh: 40 },
    },
    {
      id: "sc-ltap-turn",
      titleBg: "Завърши левия завой на юг, пропуснал насрещните",
      // South-arm southbound lane center, past the junction area.
      params: { kind: "reachZone", x: -4.06, y: -50, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-turn-left-oncoming/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-turn-left-oncoming/mistake-cut-gap.trace.json" },
      titleBg: "Рязане на тесния интервал",
      whatWentWrongBg:
        "Колата зави наляво пред насрещен автомобил на около секунда и половина — интервал, в който той физически няма как да не спира заради теб. Левият завой отнема 2–3 секунди от насрещната лента: под 2 секунди това не е преценка, а отнето предимство.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-turn-left-oncoming/mistake-no-indicator.trace.json" },
      titleBg: "Ляв завой без мигач",
      whatWentWrongBg:
        "Изчакването беше правилно, но завоят започна без подаден ляв мигач. Никой около теб — нито насрещните, нито колоната отзад — не знаеше какво предстои. Мигачът се пуска преди маневрата, не по време на волана.",
      codeRefs: ["TURN_WITHOUT_INDICATOR"],
    },
  ],
  teach: {
    whenBg:
      "При всеки ляв завой през насрещно движение — на светофар със „зелено за всички“, на равнозначни и на пътища с предимство. Насрещните минават първи, винаги.",
    whyBg:
      "Левият завой срещу насрещните е сред най-тежките градски конфликти: сблъсъкът е страничен, в незащитената врата. Фаталната грешка е подценен интервал — „ще успея“ с 1–2 секунди резерв. Нормата е проста: под 4 секунди се чака.",
    lawRef: "ЗДвП чл. 37",
    examinerBg:
      "Изпитващият гледа: ранен ляв мигач, правилна позиция преди завоя, реално пропускане на насрещните и решителен завой в достатъчен интервал. Колебливо пълзене в кръстовището или рязане пред насрещен са тежки грешки.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_LTAP_TIGHT_EVENT, SC_LTAP_FOLLOW_EVENT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION/SIGNALS family batch (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS: readonly ScenarioSpec[] = [
  SC_JUNCTION_RHR,
  SC_JUNCTION_STOP,
  SC_SIGNAL_RESPONSE,
  SC_TURN_LEFT_ONCOMING,
];
