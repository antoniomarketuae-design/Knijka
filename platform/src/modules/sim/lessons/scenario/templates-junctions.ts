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
  RearTailgaterSpec,
} from "../../contracts";
import { l5BusyStreet } from "./complications";

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
  // tj-rhr-v1 is all-`residential`, so its mouth is 17.125 m (8.125 half-width
  // + the 9 m minor corner) and there is no paint at all — 18 m IS this map's
  // line. Not the T7 defect: that one is `lineDistM 18` copied onto sx-v1,
  // whose secondary mouth is 27.125 m and whose paint is at 27.725 m.
  lineDistM: 18,
  clearSpeedMps: 11.5,
  /**
   * L7 (ledger §4) — authored, not inherited.
   *
   * This spec was one of the eight `priorityFromRight` specs that opted out, so
   * its car committed on a pure 22 m distance gate: it was fully clear ~6.1 s
   * after release, while a student obeying THIS lesson's own objective cap
   * (`maxSpeedKmh 25`) and its instruction 3 «намали отрано» needs 5.8 s at
   * 25 km/h, 9.6 s at 15 and 14.4 s at 10. Driving the taught pace deleted the
   * encounter — the founder's «the traffic car crossed much quicker before I
   * reach the crossroad». The runner now defaults the gate, but the value
   * belongs in the data: a spec that stages a conflict states when it is
   * witnessed. Values copied verbatim from templates-junctions2.ts:74.
   */
  witnessArm: { etaSec: 8, nearLineM: 6 },
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
      { level: 5, traffic: { vehicleCount: 8 } }, // L5: живо движение около кръстовището
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
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
    { n: 1, textBg: "Тръгни по булеварда на север — напред е светофарно кръстовище. По тъмно карай с включени къси светлини (чл. 70): нощем на кръстовище чуждите фарове са единственото, по което се чете кой идва — и твоите са единственото, по което другите четат теб." },
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
      { level: 5, conditions: { night: true } }, // L5: светофар нощем — сигналът носи цялата информация
  ],
  staged: [SC_SIGNAL_AMBER_EVENT],
  // LIVE arrival pin (LessonSpec.signalPlan — the founder traffic-light fix):
  // the JU-05 arc AND the requireRedMet gate above need a RED arrival — a
  // wall-clock arrival on green completes nothing (the passSignal objective
  // demands a handled red) and one on stale yellow teaches chaos. redFresh
  // rebases to a fresh 26 s red so every attempt gets stop → wait →
  // redYellow → green. triggerM 75 sits deliberately ABOVE the amber
  // runner's 60 m arm ring: a ≥ 21 km/h approach still re-pins the JU-06
  // green→yellow flip OVER this baseline (the runner fires second — its
  // authored dilemma wins exactly as it wins over the natural offset), while
  // slower approaches keep the fresh-red teaching arc.
  signalPlan: { arm: "redFresh", triggerM: 75 },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_LTAP_TIGHT_EVENT, SC_LTAP_FOLLOW_EVENT],
  // LIVE arrival pin (LessonSpec.signalPlan — the founder traffic-light fix):
  // the JU-10 lesson is GAP JUDGMENT on „зелено за всички" — the signal must
  // carry no information, only the oncoming does. greenFresh gives the
  // westbound approach a full 20 s green from 45 m (approach ~3 s + yield
  // ~8 s + turn ~5 s fits inside it), mirroring the recordings' authored EW
  // green window (SX_PIN_EW_GREEN_WINDOW). Wall-clock arrival on red would
  // stack a signal wait onto the gap lesson and desync nothing — the staged
  // actors sync to the player's ETA, not to the lamps.
  signalPlan: { arm: "greenFresh", triggerM: 45 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-scan — „Един поглед не стига" (JU-23) on tj-stop-v1: the
// ляво-дясно-ляво observation drill at a Б2 line. Rides the config-gated
// JUNCTION_SCAN_INCOMPLETE detector (enabled per-lesson via the recorder's
// ruleConfig; see rules/types.ts). Reuses the sc-junction-stop map + path.
// ---------------------------------------------------------------------------

/**
 * T9 (ledger §2) — THE CAR THE LESSON IS ABOUT, finally staged.
 *
 * `SC_JUNCTION_SCAN` shipped with no `staged` array and no `traffic` on any
 * rung, so `SCENARIO_DEFAULT_TRAFFIC` applied and the map was empty for the
 * whole drive — while the objective, instruction 4, the teach copy and BOTH
 * mistake narrations asserted, four times over, a car that approached while the
 * student was looking the other way. `JUNCTION_SCAN_INCOMPLETE` reads only
 * glance bookkeeping (rules/engine.ts), so nothing in the world was ever
 * consulted and nothing contradicted the claim. The founder played it and wrote
 * exactly that down (item 12): *„it asks the user to look left and right for
 * traffic cars, but the road is empty and there are no traffic cars moving at
 * all on the map ever."*
 *
 * WHY FROM THE LEFT (west → east), and why that is not a copy of
 * SC_JUNCTION_RHR_CONFLICT: the player turns RIGHT out of the stem, so the lane
 * he merges into is the EASTBOUND one at y = −4.06 — the near lane, fed from
 * the west, i.e. from his LEFT. That is precisely the car the second look left
 * is for, and the reason the ritual is ляво-дясно-ЛЯВО rather than a single
 * sweep. A car from the right would cross the far lane and never touch him.
 *
 * junctionControl "stopLine": tj-stop-v1 derives a real Б2 line at the stem
 * mouth (27.725 m — primary priority road, so the arterial mouth), so the
 * runtime's give-way adjudication grades the crossing and the runner commends
 * the wait. leadSec −3.2 puts the car at the node ~3.2 s after the player's
 * projected crossing: it is HELD, visible, ~25 m out through the whole scan,
 * and it crosses while a student who actually looked is still waiting.
 */
export const SC_JUNCTION_SCAN_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jscan-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-23",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    // The priority road, west → east: the near (eastbound) lane the right turn
    // merges into. tj-stop-v1 nodes, pinned by the tj-districts battery.
    pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"],
    hold: { nodeIndex: 1, offsetM: -95 }, // 95 m west of the junction
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.2,
  // tj-stop-v1's Б2 line: primary half-width 12.125 + arterial corner 15 +
  // 0.6 paint inset (= JUNCTION_STOP_LINE_M above; battery tj-districts).
  lineDistM: JUNCTION_STOP_LINE_M,
  clearSpeedMps: 11.5,
  // L7: the release waits for the student to actually be at the line, so the
  // «приближи бавно» this drill teaches cannot delete its own encounter.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

/** JU-23 — оглеждане наляво-надясно-наляво преди навлизане на кръстовище с Б2
 *  (ЗДвП чл. 50: на знак „Спри!“ водачът спира и пропуска, като се убеди, че не
 *  идват ППС с предимство — убеждаването изисква пълно оглеждане). */
export const SC_JUNCTION_SCAN: ScenarioSpec = {
  id: "sc-junction-scan",
  family: "junction",
  tagsBg: ["кръстовище", "оглеждане", "знак Стоп", "ляво-дясно-ляво"],
  titleBg: "Оглеждане на кръстовище (един поглед не стига)",
  objectiveBg:
    "На знак Б2 „Спри!“ спри напълно и се огледай по реда ляво-дясно-ляво — вторият поглед наляво хваща колата, приближила, докато си гледал надясно. Потегляш чак след ПЪЛНО оглеждане.",
  archetypeIds: ["JU-23"],
  conceptIds: ["c-give-way-stop-behavior", "c-mirrors-blind-spots", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Reuses the committed tj-stop-v1 map (its meta.scenario.params, for provenance).
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
    { n: 1, textBg: "Приближи знака Б2 „Спри!“ по страничната улица с намалена скорост и десен мигач." },
    { n: 2, textBg: "Спри НАПЪЛНО преди стоп-линията — колелата неподвижни." },
    { n: 3, textBg: "Огледай се по реда: наляво, надясно и ПАК наляво. Един поглед не стига." },
    {
      n: 4,
      textBg:
        "Вторият поглед наляво е за колата, която е приближила, докато си гледал надясно — тя идва по главния отляво, точно в лентата, в която ще завиеш.",
    },
    {
      n: 5,
      textBg:
        "Изчакай я да премине изцяло покрай теб и чак тогава потегли и завий надясно. „Убедих се“ значи видях я и я пропуснах, не „погледнах натам“.",
    },
  ],
  success: [
    {
      id: "sc-jscan-approach",
      titleBg: "Приближи знака Б2 с контролирана скорост",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jscan-line",
      titleBg: "Премини стоп-линията след пълно спиране и оглеждане",
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jscan-exit",
      titleBg: "Завий надясно и продължи по пътя с предимство",
      params: { kind: "reachZone", x: 55, y: -4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 55 },
  shadow: { path: "content/traces/sc-junction-scan/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-scan/mistake-no-scan.trace.json" },
      titleBg: "Потегляне без оглеждане",
      whatWentWrongBg:
        "Колата спря напълно на Б2, но потегли, без да се огледа нито наляво, нито надясно — и точно затова не видя автомобила, който в същите секунди приближаваше по главния път отляво, в лентата, в която тя завива. Пълното спиране е само половината работа: то ти дава секундите, в които главата трябва да се завърти и очите наистина да проверят. Тук се отсъждат две неща наведнъж — непълното наблюдение и отнетото предимство, — защото те са едно и също събитие, видяно отвън и отвътре. „Гледах, но не видях“ е най-честата причина за удар на кръстовище.",
      codeRefs: ["JUNCTION_SCAN_INCOMPLETE", "FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-scan/mistake-single-glance.trace.json" },
      titleBg: "Само един поглед",
      whatWentWrongBg:
        "Водачът спря и погледна веднъж наляво, но не и надясно — а после потегли. Един поглед не стига, и ето защо: в мига на този поглед пътят отляво наистина беше чист, а колата с предимство се появи в следващите секунди, докато главата вече беше обърната напред. Точно нея хваща ВТОРИЯТ поглед наляво — той не е повторение, а нова информация. Затова се отсъждат и непълното оглеждане, и отнетото предимство: пропуснатият поглед и пропуснатата кола са едно и също.",
      codeRefs: ["JUNCTION_SCAN_INCOMPLETE", "FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всеки знак Б2 „Спри!“ и на всяко кръстовище с ограничена видимост. Знакът се поставя точно там, където видимостта е лоша — затова оглеждането трябва да е пълно, а не един бегъл поглед в движение.",
    whyBg:
      "Най-цитираната причина за катастрофи на кръстовища е „гледах, но не видях“: водачът поглежда веднъж отдалеч и потегля в ситуация, която се е променила. Оглеждането наляво-надясно-наляво, СЛЕД пълното спиране, хваща именно колата, приближила междувременно — вторият поглед наляво е застраховката, която липсва при бързия единичен поглед.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият следи за ПЪЛНО оглеждане след спирането на Б2: наляво, надясно и пак наляво, преди потегляне. Потегляне без оглеждане или само с един поглед е основна грешка (качество на наблюдението).",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  // T9: the car the whole lesson talks about. Until now this array did not
  // exist — see SC_JUNCTION_SCAN_CONFLICT above.
  staged: [SC_JUNCTION_SCAN_CONFLICT],
  // B28 (founder, doc 87): „it is asking the user to look left and right to see
  // if there are traffic cars, but in fact the road is empty and there are no
  // traffic cars moving at all on the map EVER". The staged conflict car is
  // held 95 m west and only released once the player is at the line, which is
  // correct for the ENCOUNTER — and it left the entire graded approach on a
  // dead street, so the ляво-дясно-ляво ritual was a ritual about nothing.
  //
  // A template BASELINE, so the §7 ladder does the rest: L1 gets 2 cars (a
  // beginner is not made to read a boulevard), L2 3, L3/L4 4. Never an
  // absolute rung count — the same shape sc-junction-rhr's L5 already proves
  // this map family hosts (vehicleCount 8 on the sibling tj-rhr-v1). The trace
  // recorder reads `staged` only (traces/scJunctionScan.ts:188), so every
  // committed ghost stays byte-identical.
  traffic: { vehicleCount: 4 },
  conditions: { weather: "dry" },
  // The junction-scan detector is default-OFF (it would false-fire the exam
  // bank's unglanced Б2 crossings); this drill opts it in so the LIVE session
  // grades a student's missing observation, matching the shadow's gate.
  ruleConfig: { junctionScanObservationEnabled: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-jx-giveway-b1 — „Б1 не значи спри винаги" (JU-02) on jxg-giveway-v1: the
// give-way CAPABILITY's shipped lesson, and the 150th (final) template. A
// tertiary street crosses TWO secondary boulevards under Б1 „Пропусни
// движението". Mouth 1 is CLEAR — the crux: a rolling yield with a full scan,
// NO full stop, grading ZERO violations (Б1 ≠ „спри винаги", ЗДвП чл. 50).
// Mouth 2 is CONFLICTED by a staged priorityFromRight car — the full wait.
// Rides the give-way stop-line adjudication (prioritySituation "give-way" →
// FAILED_TO_YIELD) and the config-gated JUNCTION_SCAN_INCOMPLETE detector.
//
// NOTE for the integration pass (main session): NOT spread into
// SCENARIO_TEMPLATES_JUNCTIONS below — the main session adds it + bumps the
// roster to 150 (s2-catalog-integrity). Its map lives in
// tools/maps/gen_jx_giveway.mjs → jxg-giveway-v1, its two Б1 grading lines in
// runtime STOP_LINE_OVERRIDES (control "giveWay").
// ---------------------------------------------------------------------------

/** The mouth-2 conflict: a car crosses the SECOND junction (jxg-n-j2) from the
 *  player's RIGHT (east arm → west arm) on the priority boulevard, timed to the
 *  player's approach. junctionControl "stopLine": the runtime's give-way
 *  adjudication (conflictNear at the Б1 line crossing) grades FAILED_TO_YIELD /
 *  the runner commends the yield (the stop-line case is the runner's to
 *  commend). Mouth 1 has NO staged car — its rolling pass is structurally clear. */
export const SC_JX_GIVEWAY_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jxgb-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-02",
  junction: { nodeId: "jxg-n-j2", x: 0, y: 150 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["jxg-n-e2", "jxg-n-j2", "jxg-n-w2"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.2,
  // The player's Б1 line sits 27.725 m short of jxg-n-j2 (the secondary-mouth
  // derivation, proven by the district battery) — its authored stop-line dist.
  lineDistM: 27.725,
  clearSpeedMps: 11.5,
  // L7 (ledger §4): authored rather than inherited from the runner default —
  // this drill's own instruction 4 demands a full stop at the Б1 line, and on a
  // pure distance gate the car it tells you to wait for has already gone.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

/** Learn-only rear pressure (доп. натиск): a car glued behind the player, so
 *  the „не бързай да минеш" decision is made with a лепка in the mirror. The
 *  rearTailgater runner emits ZERO SimTick events (pressure scenery, A12) — it
 *  never grades and never conflicts (same-direction bearing). */
export const SC_JX_GIVEWAY_TAILGATER: RearTailgaterSpec = {
  id: "sc-jxgb-tailgater",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["jxg-n-s", "jxg-n-j1", "jxg-n-j2"],
    hold: { nodeIndex: 0, offsetM: 6 },
    cruiseSpeedMps: 9,
    extraRightOffsetM: 0,
  },
  releaseGapM: 12,
  followBehindM: 11,
  maxMatchSpeedMps: 9,
  pressureSec: 4,
  passShiftM: -8.125,
  passSpeedMps: 11,
  passAheadM: 16,
  easeKmh: 6,
};

/** JU-02 — Влизане от „Пропусни" (Б1) без изчакване (ЗДвП чл. 50: при Б1
 *  намаляваш и пропускаш всички по пътя с предимство, спираш само ако иначе би
 *  ги засякъл — content bank c-give-way-stop-behavior / q-krastovishta-006). */
export const SC_JX_GIVEWAY_B1: ScenarioSpec = {
  id: "sc-jx-giveway-b1",
  family: "junction",
  tagsBg: ["кръстовище", "Б1", "пропусни", "предимство", "оглеждане"],
  titleBg: "Б1 не значи спри винаги",
  objectiveBg:
    "На знак Б1 „Пропусни движението“ намали и се огледай — ако пътят с предимство е чист, минаваш БЕЗ да спираш; ако идва кола, спираш и я пропускаш. Пълно спиране се налага само когато иначе би я засякъл.",
  archetypeIds: ["JU-02", "JU-23"],
  conceptIds: ["c-give-way-stop-behavior", "c-stop-give-way-signs", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Mirrored in jxg-giveway-v1.json meta.scenario.params: a TERTIARY NS
    // street crossing TWO SECONDARY boulevards — the heuristic derives no line
    // (tertiary minor rank 3 > MINOR_MAX_RANK 2), so the two giveWay
    // STOP_LINE_OVERRIDES are the sole grading lines and props paints a VISIBLE
    // Б1 (maxRank 4 < 5).
    params: {
      southArmM: 130,
      midArmM: 150,
      northArmM: 90,
      ewArmM: 120,
      lanes: 2,
      minorMaxKmh: 40,
      priorityMaxKmh: 50,
    },
    districtId: "jxg-giveway-v1",
  },
  start: {
    spawnPointId: "jxg-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по второстепенната улица на север — напред са две кръстовища със знак Б1 „Пропусни движението“." },
    { n: 2, textBg: "Първо кръстовище: намали и се огледай наляво и надясно. Пътят с предимство е чист — минаваш плавно, БЕЗ да спираш. Б1 не е „Спри!“." },
    { n: 3, textBg: "Второ кръстовище: пак се оглеждаш. Този път отдясно по булеварда идва кола с предимство." },
    { n: 4, textBg: "Спираш преди линията и я пропускаш изцяло — тук пълното спиране е задължително, защото иначе би я засякъл." },
    { n: 5, textBg: "Щом пътят е чист, потегляш и продължаваш на север." },
  ],
  success: [
    {
      id: "sc-jxgb-roll",
      titleBg: "Премини първия Б1 след оглед, без излишно спиране",
      // Just north of jxg-n-j1 (the clear mouth) — reached while rolling.
      params: { kind: "reachZone", x: 4.06, y: 22, radiusM: 8 },
    },
    {
      id: "sc-jxgb-yield",
      titleBg: "Пропусни колата с предимство на второто кръстовище",
      /**
       * The yield pose before the mouth-2 Б1 line (y = 122.275): a crawl gate
       * (≤ 6 km/h) unsatisfiable by anyone who barges through. The SPEED cap is
       * the drill and it stays.
       *
       * B5 (ledger §3), data half — the PLACE was the defect. At `y 118 r4` the
       * gate admitted y ∈ [114, 122]: the last 8 m of an approach on which
       * every metre below 122.275 is a lawful place to give way. A student who
       * stopped further back — where, before Lane 4 clears the parked bodies
       * off this junction's apron, he can actually SEE down the boulevard — was
       * refused and had to creep forward to the one pose the circle allowed,
       * which is the pose with the worst sightline. The founder wrote it down as
       * *„if I don't stop on the green circle I can't do anything."*
       *
       * `y 113 r9` → y ∈ [104, 122]: 18 m of admissible band instead of 8, and
       * the upper edge lands 0.275 m SHORT of the Б1 line at y 122.275.
       *
       * FR-24 — AND THAT LAST SENTENCE USED TO SAY „so no pose inside the
       * junction can ever satisfy it", WHICH WAS FALSE AT THE RUNGS THE
       * STUDENT ACTUALLY DRIVES. It reasoned from the AUTHORED radius and
       * forgot the aid ladder: L1 widens 9 → 13.5 and L2 → 11.25, so the disc
       * really admitted y up to 126.5 — 4.22 m PAST the Б1 line, on the rung a
       * beginner starts on. Measured, not argued. `acceptBeforeMarkM` cuts the
       * acceptance at the paint AFTER the ladder has been applied, so the
       * claim is now true at every rung instead of at the one nobody drives.
       */
      params: {
        kind: "reachZone",
        x: 4.06,
        y: 113,
        radiusM: 9,
        maxSpeedKmh: 6,
        acceptBeforeMarkM: -9.275,
      },
    },
    {
      id: "sc-jxgb-exit",
      titleBg: "Премини второто кръстовище и продължи на север",
      // North arm, past the jxg-n-j2 junction area.
      params: { kind: "reachZone", x: 4.06, y: 178, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-jx-giveway-b1/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-jx-giveway-b1/mistake-barge-priority.trace.json" },
      titleBg: "Навлизане пред колата по главния",
      whatWentWrongBg:
        "На второто кръстовище водачът се огледа, видя приближаващата кола по пътя с предимство — и въпреки това навлезе пред нея. Б1 задължава да пропуснеш всички по главния път; „ще успея“ пред кола на секунди е отнето предимство, а на изпита — прекратяване при намеса.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-jx-giveway-b1/mistake-no-scan.trace.json" },
      titleBg: "Излизане без пълен оглед в двете посоки",
      whatWentWrongBg:
        "Колата навлезе през първия Б1, без да се огледа наляво-надясно. При „Пропусни“ не спираш винаги — но задължително проверяваш и в двете посоки, защото само оглеждането ти казва дали пътят с предимство наистина е чист. Един поглед (или никакъв) е основната причина за удар на такова кръстовище.",
      codeRefs: ["JUNCTION_SCAN_INCOMPLETE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки знак Б1 „Пропусни движението“ и обърнат триъгълник с акулски зъби — второстепенна улица, вливаща се в път с предимство. Знакът иска да пропуснеш, не непременно да спреш.",
    whyBg:
      "Най-честата грешка на Б1 е едната от двете крайности: или спираш излишно на всеки празен изход (и объркваш движението отзад), или влиташ „на прескок“ без оглед пред кола с предимство. Правилото е просто: намаляваш до скорост, от която можеш да спреш, оглеждаш се, и спираш САМО ако иначе би засякъл някого. Пълно спиране при Б1 не се изисква — изисква се реално пропускане.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване преди Б1, оглеждане наляво и надясно, минаване без излишно спиране при чист път, и реално пропускане (спиране при нужда) когато по главния идва превозно средство. Влизане пред кола с предимство е отнемане на предимство; липсата на оглед е грешка в наблюдението.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    { level: 5, traffic: { vehicleCount: 8 } }, // L5: живо движение по булевардите
  ],
  staged: [SC_JX_GIVEWAY_CONFLICT, SC_JX_GIVEWAY_TAILGATER],
  // The junction-scan detector is default-OFF (it would false-fire the exam
  // bank's unglanced crossings); this drill opts it in so the LIVE session
  // grades a student's missing observation at a Б1 line, matching the shadow.
  ruleConfig: { junctionScanObservationEnabled: true },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION/SIGNALS family batch (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS: readonly ScenarioSpec[] = [
  SC_JUNCTION_RHR,
  SC_JUNCTION_STOP,
  SC_SIGNAL_RESPONSE,
  SC_TURN_LEFT_ONCOMING,
  SC_JUNCTION_SCAN,
  SC_JX_GIVEWAY_B1,
];
