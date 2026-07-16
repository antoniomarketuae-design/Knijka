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
 * but LEARN-ONLY (penalty-free — no shadow+2-graded-mistakes mold); FO-03/04/
 * 06/07/08 are 🟡 PARTIAL or 🔴 NEW (cut-in actor, rain-follow config, truck
 * profile, tailgater actor, standstill-gap rule) and skipped for later waves.
 */

import type { BrakingLeadCarSpec } from "../../contracts";
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

/** The following-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_FOLLOWING: readonly ScenarioSpec[] = [
  SC_FOLLOW_DISTANCE,
  SC_FOLLOW_BRAKE,
  SC_FOLLOW_STANDSTILL,
  SC_FOLLOW_RAIN_GAP,
];
