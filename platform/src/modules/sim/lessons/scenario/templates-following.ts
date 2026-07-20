/**
 * Scenario templates — the FOLLOWING & GAP-MANAGEMENT family, S3 batch 3 (doc
 * 72 §9 „Family FO"): two ✅ FULL gradable following archetypes staged on
 * purpose-built straight-street micro-maps, DATA ONLY in the templates.ts mold
 * (coordinates denormalized from the committed district files so nothing loads
 * world JSON at runtime; the trace-gate batteries assert every pinned value
 * against the generated maps):
 *
 *  - sc-follow-distance  „Дистанция на следване"  (FO-01, fo-follow-v1)
 *  - sc-follow-brake     „Внезапно спиране“        (FO-02, fo-brake-v1)
 *
 * Both stage the SHIPPED `brakingLeadCar` kind — a lead car that paces AHEAD in
 * the driver's own lane (positive followGapM, matchPlayer) — and each mistake
 * demo cites SHIPPED rules-catalog codes and grades EXACTLY them when replayed
 * through the production stack (the §5/§9 gates, traces/__tests__/fo-follow-*):
 *   - FO-01 → FOLLOWING_TOO_CLOSE (основна: под 2-секундната дистанция за
 *     скоростта; the 2-second-gap detector). The lead's slam tier is authored
 *     OUT of reach (slamAt far past the road end + minSlamSpeedKmh 250), so the
 *     encounter is pure gap-management: the shadow keeps a safe gap for its
 *     calm speed, the mistakes hold the SAME metric gap at a higher speed —
 *     under 1.3 s → tailgating.
 *   - FO-02 → COLLISION (опасна + прекратяване: rear-end on a lead brake-slam).
 *     The lead paces at a SAFE gap and then slams mid-street; the shadow reacts
 *     in time and stops WITHOUT contact, the two mistakes react late / not at
 *     all and rear-end it. All three approach at the SAME safe gap, so the
 *     collision demos grade ONLY COLLISION (never a following code as well).
 *
 * The maps carry NO crossing, junction, signal or sign; every drive runs
 * ambient traffic ZERO (seed 7): the ONLY actor is the lead car and the ONLY
 * fault the rule engine can grade is the driver's own gap / reaction against it.
 *
 * Family: "following" — the catalog chip added for the FO family (doc 72 §9);
 * the ids (sc-follow-*) match the sc-<family>-<slug> naming standard.
 *
 * Doc-72 provenance: FO-01 and FO-02 are the two "Engine: ✅ FULL" archetypes
 * with a CLEANLY GRADABLE following fault. FO-05 (queue harmonics) is ✅ FULL
 * but LEARN-ONLY (penalty-free — no shadow+2-graded-mistakes mold). Since
 * shipped here beyond the original batch: FO-08 (standstill-gap rule), FO-04
 * (rain-follow config drill), FO-06 (sc-follow-truck — the large-vehicle
 * actor PROFILE: the same brakingLeadCar staged kind with `profile: "truck"`,
 * rendered as the procedural box-truck rig; leadGap detector unchanged), and
 * the FO ACTOR PAIR on ln-v1 (needs the adjacent lane): FO-03 sc-follow-cutin
 * (the cutInLeadCar staged kind + the traffic port's laneShift command —
 * grading fully shipped: FOLLOWING_TOO_CLOSE with the recovery-rate innocence
 * guard) and FO-07 sc-follow-tailgater (the rearTailgater pressure actor,
 * learn-only — the mistakes grade the SHIPPED HARSH_BRAKING_NO_CAUSE /
 * SPEEDING_OVER_LIMIT off the player's own choices).
 */

import type {
  BrakingLeadCarSpec,
  CutInLeadCarSpec,
  OncomingStreamSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated districts by value —
// the L7 pattern; the fo-districts battery asserts the copy matches the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (fo-*-v1). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-follow-distance — „Дистанция на следване" (FO-01) on fo-follow-v1
//    (360 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR on fo-follow-v1: paces the player's own northbound lane
 * (x = 4.06, extraRightOffsetM 0) at a fixed ~13 m ahead (positive followGapM,
 * matchPlayer). The gap is PINNED by the runner, so the shadow (calm ~26 km/h,
 * ~1.8 s of gap) and the mistakes (~48 km/h, ~1.0 s of the SAME 13 m) differ
 * only in SPEED — which is exactly FO-01's lesson: distance is measured in
 * SECONDS, not metres; the faster you go the more metres two seconds buys, and
 * the mistake is not extending the metric gap as the speed rises.
 *
 * The slam tier is authored OUT of the play corridor (slamAt at y = 520, well
 * past the 360 m road; minSlamSpeedKmh 250; proximityFallbackM 0.3), so the
 * lead never brakes — it is deterministic moving traffic, not a braking drill.
 */
const FD_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fd-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 35 }, // dormant ~20 m ahead of the spawn
    cruiseSpeedMps: 9,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 13, // pace ~13 m AHEAD of the player, matchPlayer
  maxMatchSpeedMps: 15, // 54 km/h — holds 13 m at any legal player speed
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned at 13 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-01 — движение в колона на съобразена дистанция (ЗДвП чл. 23: водачът е
 *  длъжен да спазва достатъчна дистанция до движещото се пред него ППС). */
export const SC_FOLLOW_DISTANCE: ScenarioSpec = {
  id: "sc-follow-distance",
  family: "following",
  tagsBg: ["дистанция", "следване", "движение в колона", "градско каране"],
  titleBg: "Дистанция на следване",
  objectiveBg:
    "Следвай движещата се пред теб кола на дистанция, която ти дава време да спреш — правилото е 2 секунди при сухо време; колкото по-бързо караш, толкова повече метри искат тези 2 секунди.",
  archetypeIds: ["FO-01"],
  conceptIds: ["c-following-distance", "c-stopping-distance-total", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in fo-follow-v1.json meta.scenario.params
    // (tools/maps/gen_fo_follow.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — пред теб се движи друга кола в твоята лента." },
    { n: 2, textBg: "Измери дистанцията в секунди: когато предният подмине някой ориентир, преброй „едно-и-две“ — стигнеш ли ориентира преди „две“, си твърде близо." },
    { n: 3, textBg: "Карай спокойно и остави поне 2 секунди до предния — това е около една дължина на колата на всеки 15 км/ч скорост." },
    { n: 4, textBg: "Не се изкушавай да залепиш, за да „не те засичат“ — колкото по-бързо караш, толкова по-голяма дистанция ти трябва." },
    { n: 5, textBg: "Задръж съобразената дистанция до края на отсечката." },
  ],
  success: [
    {
      id: "sc-fd-follow",
      titleBg: "Следвай на съобразена дистанция",
      // A plain reach-zone mid-street: the calm shadow drive passes it; the
      // grading of the gap itself is the rule engine's job (FOLLOWING_TOO_CLOSE).
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10 },
    },
    {
      id: "sc-fd-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-follow-distance/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-distance/mistake-tailgate.trace.json" },
      titleBg: "Лепене за предния",
      whatWentWrongBg:
        "Колата се движеше на около 48 км/ч само на една дължина зад предния — по-малко от секунда дистанция. При тази скорост е нужна над два пъти по-голяма дистанция; толкова близо няма никакъв шанс за спиране, ако предният забави. Несъобразената дистанция е основна грешка.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-distance/mistake-gap-melts.trace.json" },
      titleBg: "Дистанцията се топи с ускоряването",
      whatWentWrongBg:
        "Дистанцията беше добра на спокойни 26 км/ч, но с ускоряването до 48 км/ч същите метри вече значеха под секунда — метрите останаха същите, а нужната дистанция се удвои. Дистанцията се държи в секунди: ускоряваш ли, изостани още.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение зад друга кола в града и извън него — в колона, на булевард, по правата отсечка. Дистанцията е първото нещо, което се топи, когато вниманието се отклони.",
    whyBg:
      "Ударът отзад е най-честият тип произшествие. Дистанцията е времето ти за реакция и спиране, ако предният спре внезапно — а при по-висока скорост спирачният път расте квадратично. Двете секунди не са прищявка: те са разстоянието, в което изобщо можеш да реагираш.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи дистанцията през целия маршрут: движение на по-малко от съобразената дистанция е грешка дори без злополука, а „много близка дистанция“ при по-висока скорост се третира като опасно поведение. Дръж поне 2 секунди до предния.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
      { level: 5, conditions: { weather: "rain" } }, // L5: мокра дистанция — the 2 s rule wants 3
  ],
  staged: [FD_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-follow-brake — „Внезапно спиране на предния" (FO-02) on fo-brake-v1
//    (420 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR on fo-brake-v1: paces the player's own lane at a SAFE
 * ~22 m ahead (positive followGapM, matchPlayer), then BRAKE-SLAMS when it
 * reaches y = 230 with the player still at cruise (minSlamSpeedKmh 25 — the
 * ~40 km/h approach clears it). The safe pace means the pre-slam gap never
 * trips FOLLOWING_TOO_CLOSE, so the collision demos grade ONLY COLLISION. The
 * shadow reacts and stops within the 22 m; the two mistakes react late / not
 * at all and rear-end the stopped lead.
 */
const FB_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fb-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 40 }, // dormant ~25 m ahead of the spawn
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 22, // pace ~22 m AHEAD — a SAFE gap at the ~40 km/h approach
  maxMatchSpeedMps: 13, // 47 km/h — holds 22 m at the ~40 km/h cruise
  slamAt: { x: 4.06, y: 230 }, // the staged brake-slam point, mid-street
  slamRadiusM: 3,
  slamDecelMps2: 6.5, // a hard emergency slam
  minSlamSpeedKmh: 25, // the ~40 km/h cruise clears it — the slam fires
  proximityFallbackM: 0.5,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-02 — реакция при внезапно спиране на предния (ЗДвП чл. 23: достатъчната
 *  дистанция е именно тази, която позволява спиране, ако предният спре рязко). */
export const SC_FOLLOW_BRAKE: ScenarioSpec = {
  id: "sc-follow-brake",
  family: "following",
  tagsBg: ["дистанция", "аварийно спиране", "реакция", "удар отзад"],
  titleBg: "Внезапно спиране на предния",
  objectiveBg:
    "Следвай предната кола на дистанция, която ти позволява да спреш — и когато тя спре внезапно, реагирай навреме и спри напълно, без да я удариш отзад.",
  archetypeIds: ["FO-02"],
  conceptIds: ["c-following-distance", "c-reaction-time", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in fo-brake-v1.json meta.scenario.params.
    params: { lengthM: 420, maxspeedKmh: 50 },
    districtId: "fo-brake-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно зад предната кола, около 40 км/ч, и дръж поне 2 секунди дистанция." },
    { n: 2, textBg: "Гледай далеч напред — не в бронята на предния, а през и над него, за да усетиш спирането възможно най-рано." },
    { n: 3, textBg: "Спре ли предният внезапно, реагирай веднага: пълна спирачка, без да въртиш волана встрани." },
    { n: 4, textBg: "Дистанцията, която държиш, е точно разстоянието, в което имаш време да спреш — затова тя не е излишна." },
    { n: 5, textBg: "Спри напълно зад предния, изчакай и продължи, когато той потегли." },
  ],
  success: [
    {
      id: "sc-fb-approach",
      titleBg: "Следвай спокойно преди спирането",
      params: { kind: "reachZone", x: LANE_X, y: 120, radiusM: 12 },
    },
    {
      id: "sc-fb-finish",
      titleBg: "Продължи след спирането до края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 390, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-brake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-brake/mistake-late-reaction.trace.json" },
      titleBg: "Закъсняла реакция",
      whatWentWrongBg:
        "Дистанцията беше добра, но реакцията закъсня — колата продължи напред секунда и половина, преди спирачката да задейства, и това стигна, за да удари спрелия отпред. При внезапно спиране всяка десета от секундата е метри: гледай далеч напред и реагирай веднага.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-brake/mistake-no-reaction.trace.json" },
      titleBg: "Без реакция — челен удар отзад",
      whatWentWrongBg:
        "Вниманието се отклони и предният спря незабелязано — колата така и не намали и се вряза в спрелия отпред. Дори перфектната дистанция не помага, ако очите не са на пътя: наблюдението изпреварва спирачката.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато следваш друга кола — предният може да спре внезапно за пешеходец, за спрял автомобил, за дупка, която ти не виждаш. Точно затова дистанцията съществува.",
    whyBg:
      "Ударът отзад при внезапно спиране е сред най-честите градски произшествия. Дистанцията ти дава време за реакция, а времето за реакция е това, което превръща едно рязко спиране пред теб в спокойно спиране, а не в удар. Гледаш далеч напред, за да го видиш рано.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият очаква съобразена дистанция и навременна реакция при спиране на движението пред теб. Удар в предната кола е пътнотранспортно произшествие — на изпита това прекратява изпита незабавно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [FB_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-follow-standstill — „Дистанция при спиране в колона" (FO-08) on
//    fo-follow-v1 (reuses the 360 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-follow-standstill: a STATIONARY queue-tail vehicle
 * held at y = 290 in the player's own lane (a car stopped at the red light / at
 * the back of a column). It NEVER arms — armDistM 3 m means it would only begin
 * to pace if the player's CENTER came within 3 m (i.e. a bumper contact), which
 * never happens — so its position is fully deterministic and the encounter is a
 * pure pull-up-behind-a-stopped-car. That determinism is what lets the drives
 * pin the standstill gap exactly (leadGapM = 290 − playerY − 4.1 m). The slam
 * fields are inert (the lead never triggers) but kept well-formed.
 */
const FS_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fs-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 290 }, // stationary queue tail at y = 290
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 14,
  maxMatchSpeedMps: 12,
  slamAt: { x: 4.06, y: 520 }, // far past the road — inert (the lead never arms)
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250,
  proximityFallbackM: 0.3,
  armDistM: 3, // never arms — the lead stays a stationary queue tail at y = 290
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-08 — дистанция при пълно спиране в колона (ЗДвП чл. 23: дори при спиране
 *  се държи достатъчно разстояние до движещото се/спрялото пред теб ППС). */
export const SC_FOLLOW_STANDSTILL: ScenarioSpec = {
  id: "sc-follow-standstill",
  family: "following",
  tagsBg: ["дистанция", "спиране в колона", "движение в колона", "разстояние при спиране"],
  titleBg: "Дистанция при спиране в колона",
  objectiveBg:
    "Спри зад колата пред теб в колона с разумно разстояние — колкото да виждаш къде задните ѝ гуми опират в пътя (около два метра). Така имаш място за маневра и резерв, ако предният се върне назад.",
  archetypeIds: ["FO-08"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — пред теб се движи друга кола в твоята лента." },
    { n: 2, textBg: "Предният спира в колона. Намали плавно и спри зад него, без да залепваш за бронята му." },
    { n: 3, textBg: "Остави разумно разстояние: колкото да виждаш къде задните гуми на предната кола опират в асфалта — около два метра." },
    { n: 4, textBg: "Това разстояние ти дава място да заобиколиш при нужда и резерв, ако предният се върне назад по наклон." },
    { n: 5, textBg: "Изчакай спокойно зад него на тази дистанция до края на упражнението." },
  ],
  success: [
    {
      id: "sc-fs-approach",
      titleBg: "Следвай спокойно преди спирането",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 12 },
    },
    {
      id: "sc-fs-stopped",
      titleBg: "Спри зад колоната на разумно разстояние",
      // The shadow rests ~4 m behind the stationary lead (lead at y = 290,
      // shadow at ~y = 281); a low speed cap makes reaching it AT REST the drill.
      params: { kind: "reachZone", x: LANE_X, y: 281, radiusM: 8, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-follow-standstill/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-standstill/mistake-bumper-kiss.trace.json" },
      titleBg: "Залепване за бронята при спиране",
      whatWentWrongBg:
        "Колата спря почти опряна в бронята на предната — под метър и половина разстояние. Толкова близо не виждаш гумите на предния, нямаш накъде да маневрираш и рискуваш удар, ако той се върне назад по наклон. При спиране в колона остави поне колкото да виждаш къде гумите му опират в пътя.",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-standstill/mistake-creep-up.trace.json" },
      titleBg: "Пълзене напред до бронята",
      whatWentWrongBg:
        "Колата спря на разумно разстояние, но после запълзя напред и се залепи за предната — „да не остане дупка“. Дистанцията при спиране не е дупка за запълване: тя е твоят резерв за маневра и за наклона. Спри веднъж на разумно място и стой там.",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато спираш зад друга кола — на светофар, на знак, в колона. Разстоянието при спиране е също толкова важно, колкото и в движение, а най-често се пренебрегва точно на спрелия автомобил.",
    whyBg:
      "Разумната дистанция при спиране ти оставя изход: място да заобиколиш, ако предният аварира или изгасне, и резерв, ако се върне назад по наклон. Залепването за бронята премахва всеки от тези изходи и превръща една дребна ситуация в удар. Правилото „да виждаш гумите на предния“ пази точно този резерв.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи разстоянието и при спиране: спиране прекалено близо до предната кола е второстепенна грешка. Спри така, че да виждаш къде задните ѝ гуми опират в пътя — това е достатъчно разстояние за маневра и за наклона.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [FS_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-follow-rain-gap — „Дистанция в дъжд" (FO-04) on fo-follow-v1 (reuses the
//    360 m straight street, limit 50) — the config-gated wet-following drill.
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-follow-rain-gap: paces the player's lane at a fixed
 * ~18 m (matchPlayer), so the ONLY variable is the player's SPEED — exactly
 * FO-04's lesson. 18 m is a prudent ~2.6 s at the shadow's calm 25 km/h, but an
 * imprudent ~1.6 s at the mistakes' 40 km/h, where wet braking needs ~2.9 s. Its
 * slam tier is authored out of reach — it is deterministic moving traffic, not a
 * braking drill. Rides the config-gated FOLLOWING_TOO_CLOSE_FOR_RAIN detector
 * (enabled per-lesson via the recorder's ruleConfig; see rules/types.ts).
 */
const FR_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fr-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 30 }, // dormant ~15 m ahead of the spawn
    cruiseSpeedMps: 7,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 23, // pace ~23 m AHEAD (bumper gap ~19 m) — prudent at 25 km/h, imprudent for rain at 40 km/h
  maxMatchSpeedMps: 13, // 47 km/h — holds the gap at the 40 km/h mistakes
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned at 18 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-04 — увеличена дистанция при дъжд (ЗДвП чл. 23: дистанцията се съобразява
 *  с условията — при мокър път спирачният път нараства и 2-секундното правило
 *  става 3 и повече). */
export const SC_FOLLOW_RAIN_GAP: ScenarioSpec = {
  id: "sc-follow-rain-gap",
  family: "following",
  tagsBg: ["дистанция", "дъжд", "мокър път", "следване"],
  titleBg: "Дистанция в дъжд",
  objectiveBg:
    "Следвай колата пред теб в дъжд с УВЕЛИЧЕНА дистанция — при мокър път спирачният път нараства около един и половина пъти, затова правилото за 2 секунди става 3 и повече. Същите метри при по-висока скорост вече не стигат.",
  archetypeIds: ["FO-04"],
  conceptIds: ["c-following-distance", "c-rain-aquaplaning", "c-stopping-distance-total"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Вали, а пред теб в твоята лента се движи друга кола — потегли спокойно." },
    { n: 2, textBg: "В дъжд дистанцията се увеличава: същите метри при по-висока скорост значат по-малко време за спиране." },
    { n: 3, textBg: "Дръж поне 3 секунди до предния при мокър път — брой „едно-и-две-и-три“, докато той подмине ориентир." },
    { n: 4, textBg: "Не карай бързо на къса дистанция „както при сухо“ — на мокро спирачният път е с около половина по-дълъг." },
    { n: 5, textBg: "Задръж увеличената дистанция до края на отсечката." },
  ],
  success: [
    {
      id: "sc-fr-follow",
      titleBg: "Следвай с увеличена за дъжда дистанция",
      // Cap 30 km/h keeps the calm wet-prudent approach; the gap grading is the
      // rule engine's job (FOLLOWING_TOO_CLOSE_FOR_RAIN).
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-fr-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-rain-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-rain-gap/mistake-dry-habit.trace.json" },
      titleBg: "Дистанция „за сухо“ в дъжд",
      whatWentWrongBg:
        "Валеше, а колата следваше предната на 40 км/ч само на около метри — дистанция, добра за сухо, но твърде малка за мокър път. На мокро спирачният път е с около половина по-дълъг, а секундата и половина дистанция не стига. В дъжд дръж 3 и повече секунди.",
      codeRefs: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-rain-gap/mistake-gap-melts.trace.json" },
      titleBg: "Дистанцията се топи с ускоряването",
      whatWentWrongBg:
        "На спокойни 25 км/ч дистанцията беше добра дори за дъжда, но с ускоряването до 40 км/ч същите метри вече значеха под две секунди — а на мокро трябват три. Метрите останаха същите, нужната дистанция порасна: ускоряваш ли в дъжд, изостани още.",
      codeRefs: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
    },
  ],
  teach: {
    whenBg:
      "При всеки дъжд, мокър път, сняг или лапавица. Дистанцията, която те пази при сухо, не стига на мокро — точно тогава, когато и без това е по-трудно да спреш.",
    whyBg:
      "На мокър път гумите зацепват по-слабо и спирачният път нараства около един и половина пъти. Двете секунди, които стигат при сухо, се превръщат в удар при дъжд — затова правилото става 3 и повече секунди. Дистанцията е единственото, което купуваш предварително срещу по-дългото спиране.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият очаква съобразена с условията дистанция: при дъжд и мокър път — осезаемо по-голяма, отколкото при сухо. Близка дистанция в дъжд се отчита като несъобразена — увеличи разстоянието до предния.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [FR_LEAD_CAR],
  conditions: { weather: "rain" },
  // The rain-following detector is default-OFF (the exam bot holds a fixed
  // time-gap in rain and dry alike); this drill opts it in so the LIVE session
  // grades a student who keeps a dry-habit gap in the wet, matching the shadow.
  ruleConfig: { followRainAwareEnabled: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-follow-truck — „Зад камион" (FO-06) on fo-follow-v1 (reuses the 360 m
//    straight street, limit 50) — the large-vehicle actor-profile scenario.
// ---------------------------------------------------------------------------

/**
 * The staged LEAD TRUCK for sc-follow-truck: the SAME brakingLeadCar staged
 * kind as FO-01, with `profile: "truck"` — the doc 72 FO-06 unlock ("box
 * truck visual on the vehicle actor; leadGap detector unchanged"). It paces
 * the player's own lane at a fixed ~17 m (matchPlayer), so the ONLY variable
 * is the player's SPEED — but unlike FO-01 the lead is a 7.5 × 2.4 × 3.1 m
 * box truck that blocks ALL forward vision: the gap must buy the sight line
 * you lost. 17 m is ~3 seconds at the shadow's calm 20 km/h and a sub-second
 * ~1.0 s at the mistakes' 48 km/h, where FOLLOWING_TOO_CLOSE grades. The slam
 * tier is authored out of reach (slamAt past the road end, minSlamSpeedKmh
 * 250) — deterministic moving traffic, not a braking drill. HONEST LIMIT:
 * the leadGap query stays point-based around the truck's CENTER with the
 * fixed car-length constant, so the graded gap ignores the longer tail — the
 * scenario numbers are tuned to the detector, and the profile changes zero
 * grading geometry (exactly the FO-06 promise).
 */
const FT_LEAD_TRUCK: BrakingLeadCarSpec = {
  id: "sc-ft-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 35 }, // dormant ~20 m ahead of the spawn
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
    profile: "truck", // FO-06: the box-truck rig — vision blocked
  },
  followGapM: 17, // pace ~17 m AHEAD — ~3 s at 20 km/h, ~1 s at 48 km/h
  maxMatchSpeedMps: 15, // 54 km/h — holds 17 m at any legal player speed
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned at 17 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The ONCOMING counter-flow of sc-follow-truck (founder R3 #42, doc 62 —
 * „nothing stops you overtaking; the stay-behind has no taught reason"): six
 * cars southbound on the oncoming bank make overtaking the truck VISIBLY
 * insane — you cannot see past the box AND the opposite lane is occupied.
 * PRESSURE SCENERY under the learn-only policy (the runner emits nothing but
 * a contact collision; fo-follow-v1 carries no overtake-corridor data, so no
 * new grading path opens — the drill's graded fault stays FOLLOWING_TOO_CLOSE
 * and the shadow/mistake codes are unchanged). In INSTANT-CRUISE terms (the
 * OVG_STREAM note: a released car accelerating at the staged 2.6 m/s² loses
 * v²/2a ≈ 12.3 m against an instant clock at 8 m/s, so holds sit 12.3 m
 * lower): head instant-model y = 137, five more at +45 m headways (≈ 5.6 s —
 * every window far under an overtake around a 7.5 m truck). Against the
 * shadow's ~7 m/s follow (closing ≈ 15 m/s) the parade streams past from
 * t ≈ 8 s to t ≈ 23 s — bracketing the graded follow zone (y = 175); the
 * final stretch after the flow clears is where the drill already ends.
 * Hold feasibility: Σ gaps 225 ≤ head hold arc 235.3 (cars stay on-path).
 */
const FT_ONCOMING: OncomingStreamSpec = {
  id: "sc-ft-oncoming",
  kind: "oncomingStream",
  libraryEventId: "FO-06",
  actor: {
    pathNodes: ["fo-n-end", "fo-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 235.3 }, // y = 124.7 ⇒ instant model y 137
    cruiseSpeedMps: 8,
    colorIndex: 1,
  },
  count: 6,
  gapsM: [45, 45, 45, 45, 45], // hold y 169.7 … 349.7 — a rolling counter-column
  releaseKmh: 3,
};

/** FO-06 — следване зад камион със закрит обзор (ЗДвП чл. 23: дистанцията се
 *  съобразява и с видимостта — зад висок камион тя е нулева напред, затова
 *  дистанцията е по-голяма, не по-малка). */
export const SC_FOLLOW_TRUCK: ScenarioSpec = {
  id: "sc-follow-truck",
  family: "following",
  tagsBg: ["дистанция", "камион", "закрит обзор", "следване"],
  titleBg: "Зад камион",
  objectiveBg:
    "Следвай камиона пред теб на УВЕЛИЧЕНА дистанция — той закрива целия ти обзор напред и единственото, което виждаш, е неговата задна врата. Дистанцията купува видимостта, която камионът ти отне: дръж поне 3 секунди.",
  archetypeIds: ["FO-06"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-stopping-distance-total"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Пред теб в твоята лента се движи камион — потегли спокойно след него." },
    { n: 2, textBg: "Зад камион не виждаш нищо от пътя напред: нито пешеходци, нито спрели коли, нито какво го кара да натисне спирачката." },
    { n: 3, textBg: "Затова дистанцията расте: дръж поне 3 секунди до камиона — брой „едно-и-две-и-три“, докато той подмине ориентир." },
    {
      n: 4,
      textBg:
        "И не мисли за изпреварване: насрещното платно е заето, а зад камиона не виждаш нищо от него. Оставането зад камиона не е примирение — то е единственото разумно решение тук.",
    },
    { n: 5, textBg: "Не се доближавай, „за да виждаш“ — колкото по-близо си, толкова ПО-МАЛКО виждаш. Задръж увеличената дистанция до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ft-follow",
      titleBg: "Следвай камиона с увеличена дистанция",
      // Cap 30 km/h keeps the calm blocked-vision approach; the gap grading
      // itself is the rule engine's job (FOLLOWING_TOO_CLOSE).
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-ft-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 95 },
  shadow: { path: "content/traces/sc-follow-truck/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-truck/mistake-tailgate.trace.json" },
      titleBg: "Залепен зад камиона",
      whatWentWrongBg:
        "Колата се движеше на 48 км/ч на около една секунда зад камиона — при нулева видимост напред. Ако камионът спре рязко заради нещо, което ти не можеш да видиш, нямаш нито време, нито място: при закрит обзор дистанцията се увеличава, не се топи. Несъобразената дистанция е основна грешка.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-truck/mistake-peek.trace.json" },
      titleBg: "Доближаване „за да виждаш“",
      whatWentWrongBg:
        "Дистанцията беше добра, но колата ускори и се залепи зад камиона — уж за да „надникне“ напред. Точно обратното се случи: колкото по-близо до високата задна врата, толкова по-малко път се вижда и толкова по-малко време остава за реакция. Изостани — видимостта зад камион се купува само с дистанция.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато пред теб се движи камион, автобус или бус — в града, на булевард, на изхода от кръстовище. Високото превозно средство закрива всичко: пешеходци, светофари, спирачни светлини на колоните напред.",
    whyBg:
      "Зад камион губиш най-ценния си инструмент — погледа далеч напред. Не виждаш ЗАЩО камионът ще спре, затова научаваш за спирането едва от неговите стопове — със закъснение. Единственото, което връща това време, е по-голямата дистанция: тя е видимостта, която камионът ти отне.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи дистанцията особено внимателно зад високи превозни средства: близка дистанция при закрит обзор се третира като несъобразена. Дръж поне 3 секунди зад камион и не се доближавай, за да „виждаш по-добре“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
      { level: 5, conditions: { weather: "rain" } }, // L5: камион + дъжд — spray-blind following
  ],
  staged: [FT_LEAD_TRUCK, FT_ONCOMING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-follow-cutin — „Вклиняване" (FO-03) on ln-v1 (the 400 m 2+2 boulevard,
//    limit 50 — reused: the cut-in needs an adjacent lane to cut FROM). The
//    FOLLOWING family's actor pair, part 1: the cut-in actor recipe.
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario; pinned by value — L7). */
const CUT_RIGHT = 12.19;
/** One drawn lane width on ln-v1 (3.25 m × perceptual scale 2.5), m — the
 *  laneShift distance between the two northbound lane centers. */
const CUT_LANE_SHIFT = 8.125;

/**
 * The staged CUT-IN CAR on ln-v1: paces the player from the LEFT lane
 * (extraRightOffsetM −8.125 → x ≈ 4.06) pinned ~12 m of centers ahead
 * (matchPlayer — slaved to the player's own progress), then at y = 150 locks
 * a plain 11 m/s cruise and laneShift-glides one lane RIGHT over 1.5 s,
 * landing in the player's lane ~8 m of bumpers ahead at ~40 km/h — the stolen
 * cushion (~0.7 s where 2 s belong). GRADING IS FULLY SHIPPED (doc 72 FO-03):
 * the recovery-rate guard keeps the stolen-gap phase innocent while the
 * driver lifts and re-opens it; HOLDING it grades exactly FOLLOWING_TOO_CLOSE.
 * The post-cut cruise is deliberately NOT matchPlayer — the player's lift
 * must genuinely rebuild the gap, and a panic-slam stays unbilled because the
 * cut-in itself is a forward cause in the harsh-brake ledger (A12, honest).
 */
const FC_CUTTER: CutInLeadCarSpec = {
  id: "sc-fc-cutter",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 30 }, // dormant ~15 m ahead-left of the spawn
    cruiseSpeedMps: 11,
    extraRightOffsetM: -CUT_LANE_SHIFT, // the LEFT lane (x ≈ 4.06)
    colorIndex: 1,
  },
  paceAheadM: 12, // ~12 m of centers ahead in the adjacent lane (± jitter)
  maxMatchSpeedMps: 15,
  cutAt: { x: 4.0625, y: 150 }, // on the ACTOR's (left-lane) path, mid-street
  cutRadiusM: 4,
  minCutSpeedKmh: 25, // the ~40 km/h approach clears it — the cut fires
  cutShiftM: CUT_LANE_SHIFT, // one lane RIGHT — into the player's lane
  cutRampSec: 1.5,
  cutSpeedMps: 11, // ~40 km/h locked cruise — the player's lift re-opens the gap
  clearAheadM: 45,
};

/** FO-03 — вклиняване и възстановяване на дистанцията (ЗДвП чл. 23: дистанцията
 *  се възстановява спокойно — открадната възглавница не се задържа). */
export const SC_FOLLOW_CUTIN: ScenarioSpec = {
  id: "sc-follow-cutin",
  family: "following",
  tagsBg: ["вклиняване", "дистанция", "възстановяване", "спокойна реакция"],
  titleBg: "Вклиняване",
  objectiveBg:
    "Кола от съседната лента се вклинява на метри пред теб и открадва 2-секундната ти дистанция — без ти да си виновен. Умението, което се оценява: възстанови възглавницата спокойно — вдигни газта и изостани, без да задържаш открадната дистанция и без наказваща спирачка.",
  archetypeIds: ["FO-03"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-reaction-time"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ln-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — кола отляво се движи почти редом с теб." },
    { n: 2, textBg: "Колата отляво се вклинява на метри пред теб. Това се случва всеки ден — не е по твоя вина." },
    { n: 3, textBg: "Реагирай с газта, не със спирачката: вдигни крака и остави дистанцията да се отвори сама." },
    { n: 4, textBg: "Не задържай открадната дистанция „по инерция“ и не я затваряй „за наказание“ — и двете са лепене." },
    { n: 5, textBg: "Щом възглавницата от 2 секунди е възстановена, продължи спокойно до края на отсечката." },
  ],
  success: [
    {
      id: "sc-fc-approach",
      titleBg: "Установи се спокойно преди вклиняването",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 110, radiusM: 10 },
    },
    {
      id: "sc-fc-rebuild",
      titleBg: "Възстанови дистанцията след вклиняването",
      // The shadow passes here mid-rebuild at ~28 km/h — the lifted-throttle
      // posture; the gap grading itself is the rule engine's job
      // (FOLLOWING_TOO_CLOSE + the recovery-rate innocence guard).
      params: { kind: "reachZone", x: CUT_RIGHT, y: 235, radiusM: 10, maxSpeedKmh: 34 },
    },
    {
      id: "sc-fc-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 340, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-follow-cutin/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-cutin/mistake-hold-gap.trace.json" },
      titleBg: "Лепене по инерция",
      whatWentWrongBg:
        "Колата се вклини на метри отпред, а водачът просто продължи с непроменена скорост — под секунда дистанция на 40 км/ч, километър след километър. Вклиняването не е по твоя вина, но задържането на открадната дистанция вече е: това е лепене като всяко друго. Вдигни газта и остави възглавницата да се възстанови.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-cutin/mistake-squeeze.trace.json" },
      titleBg: "Затваряне „за наказание“",
      whatWentWrongBg:
        "Вместо да отстъпи, водачът ускори след вклинилия се и затвори дистанцията още повече — броени метри броня в броня на 45 км/ч. „Наказателното“ лепене не връща нищо: то само залепя два автомобила без никакво време за реакция. Дистанцията се възстановява назад, не напред.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки булевард с две и повече ленти в посока: пред отбивки, преди завои, на всяко пренареждане. Вклиняването е ежедневие — въпросът не е дали ще ти се случи, а какво правиш в първите две секунди след него.",
    whyBg:
      "Открадната дистанция е най-честият невинен път към удар отзад: ти не си сгрешил, но караш с 0,7 секунди възглавница. Инстинктите предлагат две грешки — да не отстъпиш (лепене) или да набиеш спирачка (капан за движещия се зад теб). Правилният рефлекс е третият: вдигната газ и търпение — дистанцията се връща за секунди без нито едно рязко движение.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият гледа реакцията, не вклиняването: плавно вдигане на газта и възстановена дистанция е точното поведение; задържането на къса дистанция след вклиняване се отчита като несъобразена дистанция, а рязката спирачка без причина — като създаване на предпоставка за удар.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [FC_CUTTER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-follow-tailgater — „Лепка отзад" (FO-07) on ln-v1 (reused 400 m 2+2
//    boulevard) — the FOLLOWING family's actor pair, part 2: the rear actor.
// ---------------------------------------------------------------------------

/**
 * The FRONT LEAD for sc-follow-tailgater: a constant-speed cruiser far ahead —
 * the shipped brakingLeadCar kind with the followGapM-ABOVE-ACTUAL trick
 * (followGapM 150 against an ~80 m real gap keeps the matchPlayer target
 * permanently above the cap, so the lead cruises at a CONSTANT 11.5 m/s and
 * never tracks the player). That constancy is the point: when the player
 * eases off, the FRONT gap genuinely grows — the taught FO-07 response made
 * visible on the leadGap telemetry — and at the mistake's brake-check moment
 * the lead sits ~90 m of bumpers ahead, far outside the harsh-brake ledger's
 * 45 m cause window (the slam has NO forward cause, honestly). The slam tier
 * is authored out of reach (slamAt past the road end, minSlamSpeedKmh 250).
 */
const FTG_LEAD: BrakingLeadCarSpec = {
  id: "sc-ftg-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 110 }, // dormant ~95 m ahead of the spawn
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound right, x ≈ 12.19)
    colorIndex: 2,
  },
  followGapM: 150, // ABOVE the real ~95 m gap → target always over the cap…
  maxMatchSpeedMps: 11.5, // …so the lead cruises at a constant 11.5 m/s (~41 km/h)
  slamAt: { x: 12.19, y: 520 }, // far past the 400 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap ≥ ~50 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The staged TAILGATER on ln-v1: released once the player pulls ~20 m ahead,
 * it matchPlayer-paces a NEGATIVE gap — ~9 m of centers (≈ 5 m of bumpers)
 * BEHIND the player in their OWN lane, the „лепка" pose (the emergencyApproach
 * rear-sync precedent without the offset path; playerGuard off — see the
 * RearTailgaterSpec doc, safety is the proportional law + a 12 m/s² decel cap
 * that out-brakes any player slam). PRESSURE SCENERY: the runner emits ZERO
 * events (learn-only policy, doc 72 FO-07) — the graded surfaces are the
 * player's own choices: the brake-check grades the SHIPPED
 * HARSH_BRAKING_NO_CAUSE (a rear car is not a forward cause), guilty speeding
 * grades SPEEDING_OVER_LIMIT, and the taught ease-off shows up as the growing
 * front gap. After ~12 s of pressure it laneShift-passes on the left.
 */
const FTG_TAILGATER: RearTailgaterSpec = {
  id: "sc-ftg-tail",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant ~13 m behind the spawn
    cruiseSpeedMps: 14,
    extraRightOffsetM: 0, // the player's OWN lane
    colorIndex: 3,
  },
  releaseGapM: 20,
  followBehindM: 9, // ~9 m of centers ≈ 5 m of bumpers — glued (± jitter)
  maxMatchSpeedMps: 18, // 65 km/h — the pressure keeps up even with a speeder
  pressureSec: 12,
  passShiftM: -CUT_LANE_SHIFT, // the pass runs one lane LEFT
  passSpeedMps: 17,
  passAheadM: 25,
  easeKmh: 8,
};

/** FO-07 — лепка отзад (ЗДвП чл. 23 — дистанцията НАПРЕД се увеличава, за да
 *  поеме и грешката на движещия се отзад; чл. 20, ал. 1 — водачът е длъжен да
 *  контролира превозното средство, а не да „възпитава“ със спирачката). */
export const SC_FOLLOW_TAILGATER: ScenarioSpec = {
  id: "sc-follow-tailgater",
  family: "following",
  tagsBg: ["лепка отзад", "дистанция", "спокойна реакция", "пропускане"],
  titleBg: "Лепка отзад",
  objectiveBg:
    "Агресивна кола се лепи на метри зад теб. Правилният отговор няма нищо общо с нея: вдигни газта, увеличи дистанцията НАПРЕД и я остави да те изпревари. Спирачният удар „за урок“ е точно обратното — предпоставка за удар отзад, в който пострадалият си ти.",
  archetypeIds: ["FO-07"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ln-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента и се установи на спокойна скорост." },
    { n: 2, textBg: "В огледалото се появява кола, залепена на метри зад теб. Не е приятно — и не е твой проблем за решаване със спирачка." },
    { n: 3, textBg: "Вдигни газта плавно и увеличи дистанцията НАПРЕД: тя поема и твоето спиране, и грешката на лепката." },
    { n: 4, textBg: "Не ускорявай гузно и не натискай спирачката „за урок“ — и двете само влошават положението." },
    { n: 5, textBg: "Дръж десния край на лентата и я остави да те изпревари — после продължи спокойно до края." },
  ],
  success: [
    {
      id: "sc-ftg-ease",
      titleBg: "Успокой темпото и увеличи дистанцията напред",
      // The shadow passes here mid-ease (~28 km/h) with the front gap visibly
      // growing — the taught response as a completion posture.
      params: { kind: "reachZone", x: CUT_RIGHT, y: 200, radiusM: 10, maxSpeedKmh: 36 },
    },
    {
      id: "sc-ftg-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 340, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-tailgater/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-tailgater/mistake-brake-check.trace.json" },
      titleBg: "Спирачен удар „за урок“",
      whatWentWrongBg:
        "С лепка на метри отзад водачът наби спирачките до дупка на празна улица — „да се научи“. Пред колата няма абсолютно нищо: това е рязко спиране без причина, което сам подготвя удара отзад и по закон е точно създаване на предпоставка за ПТП. Спирачката не е възпитателно средство — дистанцията напред е.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-tailgater/mistake-speed-up.trace.json" },
      titleBg: "Гузно ускоряване",
      whatWentWrongBg:
        "Заради натиска отзад водачът вдигна над 55 км/ч в ограничение 50 — „да не пречи“. Лепката просто дойде със скоростта, а нарушението остана за теб: ограничението не се предоговаря от огледалото. Скоростта не решава лепката — решава я увеличената дистанция напред и пропускането.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато някой се залепи отзад — на булевард, по тъмно, в колона. Колкото по-агресивен е отзад, толкова по-спокоен трябва да си ти отпред: цялата ти защита е пространството ПРЕД теб.",
    whyBg:
      "При удар отзад тялото на предния поема камшичния удар — лепката е опасност преди всичко за теб. Спирачният удар „за урок“ е най-лошият възможен ход: превръща потенциален удар в почти сигурен и прехвърля вината върху теб. Увеличената предна дистанция ти дава мек спирачен профил — можеш да спреш плавно и лепката има време да реагира; пропускането решава проблема окончателно.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият не оценява чуждото лепене — оценява твоя отговор: запазено спокойствие, плавно увеличаване на дистанцията напред, десен край на лентата и пропускане. Рязко спиране без причина пред следващ те автомобил е опасно поведение; гузното превишаване е просто превишаване.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [FTG_LEAD, FTG_TAILGATER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The following-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_FOLLOWING: readonly ScenarioSpec[] = [
  SC_FOLLOW_DISTANCE,
  SC_FOLLOW_BRAKE,
  SC_FOLLOW_STANDSTILL,
  SC_FOLLOW_RAIN_GAP,
  SC_FOLLOW_TRUCK,
  SC_FOLLOW_CUTIN,
  SC_FOLLOW_TAILGATER,
];
