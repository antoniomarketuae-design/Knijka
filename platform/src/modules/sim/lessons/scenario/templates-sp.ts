/**
 * Scenario templates — the SPEED-MANAGEMENT family, S3 batch 2 (doc 72 §8
 * „Family SP"): three ✅ FULL overspeed archetypes staged on purpose-built
 * straight-street micro-maps, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district files so nothing loads world JSON at
 * runtime; the trace-gate batteries assert every pinned value against the
 * generated maps):
 *
 *  - sc-speed-creep     „Пълзящо превишаване"  (SP-01 + SP-03, sp-creep2-v1 —
 *    the founder R3 P5 redesign, doc 62 #30: a LONG 50→30 road, both caps
 *    signed by the world and both failable)
 *  - sc-speed-dangerous „Над +10 км/ч"         (SP-02 + SP-13, ov-keepright-v1
 *    REUSED — the founder R3 redesign, doc 62 #31: staged „поток" traffic at
 *    an illegal pace makes resisting the flow the actual drill)
 *  - sc-speed-rain      „Скорост в дъжд"        (SP-04, sp-rain-v1, ×N — the
 *    doc 62 #32 redesign: BOTH gates enforce the wet envelope, so the
 *    dry-legal pace fails the drill, which is the drill)
 *
 * Each mistake demo cites SHIPPED rules-catalog SPEED codes and grades EXACTLY
 * them, with NO extra codes, when replayed through the production stack (the
 * §5/§9 gates, traces/__tests__/sp-speed-*-traces.test.ts):
 *   - SP-01 → SPEEDING_OVER_LIMIT (второстепенна: graced-limit..+10 — on BOTH
 *     the 50 approach and the 30 zone of the P5 road);
 *   - SP-02 → SPEEDING_OVER_LIMIT vs SPEEDING_DANGEROUS (the BAND contrast —
 *     pacing the flow at 58 is второстепенна, chasing it at 66 ends the exam);
 *   - SP-04 → SPEEDING_DANGEROUS vs SPEED_TOO_FAST_FOR_CONDITIONS (the founder
 *     taste-pass contrast: blasting past the В26-50 at ~72 km/h in the rain is
 *     +22 over the limit → опасна, ends the exam; pacing the „поток" at 48 is
 *     the legal-but-imprudent wet envelope, the rain factor 0.85 × 50 =
 *     42.5 km/h. NB the engine's conditions code is capped at the graced limit,
 *     so the 72 demo grades SPEEDING_DANGEROUS ALONE, not both).
 *
 * Ambient traffic is ZERO in every drive (seed 7). sc-speed-creep and
 * sc-speed-rain carry no actor at all — the only gradable fault is the
 * driver's own speed. sc-speed-dangerous stages TWO learn-only flow actors
 * (a runaway pace car + an overtaking passer, both structurally unable to
 * emit events — the FTG_LEAD / rearTailgater precedents), so its only
 * gradable fault is STILL the driver's own speed. The shadow drives
 * disciplined and clean and earns the family positive CLEAN_DRIVING.
 *
 * Family: "speed" — the catalog chip added for the SP family (doc 72 §8);
 * the ids (sc-speed-*) match the sc-<family>-<slug> naming standard.
 *
 * Doc-72 provenance: the batch-2 three are marked "Engine: ✅ FULL". Later
 * waves in this file: SP-03 (zone/transition — sc-speed-zone + sc-speed-
 * transition), SP-11/VP-09 (harsh brake — sc-sp-harsh-brake), SP-05
 * (curve envelope — sc-sp-curve on the rural-curve archetype + the
 * curveAdvisory zone layer) and SP-10 (the motorway-segment archetype —
 * sc-mw-discipline on mw-v1: the edge motorway tag arms the SP-10 crawl
 * detector, and OV-11's keep-right works at 130 with zero new code).
 * SP-06..SP-09 stay 🟡/🔴; SP-12 grades a crossing code (pedestrian family);
 * SP-13 needs ambient traffic set over the limit, which the determinism law
 * (ambient 0) forbids — left for later waves.
 */

import type {
  BrakingLeadCarSpec,
  PedestrianDartOutSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Wet, l5WetGrip } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the sp-districts / sp-transition / ov-keepright batteries
// assert the copies match the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (sp-*-v1). */
const LANE_X = 4.06;
/** ov-keepright-v1 (2+2 boulevard): right (cruise) / left (pass) centers. */
const KRD_RIGHT = 12.19;
const KRD_LEFT = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-speed-creep — „Пълзящо превишаване" (SP-01 + SP-03) on sp-creep2-v1:
//    the founder R3 P5 road (doc 62 #30 — „a LONG road: sign 50 → hold under
//    50 → sign 30 → drop to 30. Signed, staged, failable — not an empty
//    cap."). 400 m posted 50, then a 280 m zone 30 (per-edge maxspeed — the
//    runtime grades the LOCAL limit), В26-50 plate at the entry (props.ts
//    district-entry pass) and painted „30" road numerals through the zone
//    (markings.ts speed glyphs on the tagged school edge). BOTH caps are
//    failable: creeping over 50 on the approach and creeping over 30 in the
//    zone each grade SPEEDING_OVER_LIMIT against their own edge.
// ---------------------------------------------------------------------------

/** Transition Y of sp-creep2-v1 (= approachM); where the zone 30 begins. */
const CRP_TRANS_Y = 400;
/** Total length of sp-creep2-v1 (approachM + zoneM). */
const CRP_TOTAL_Y = 680;

/** SP-01 + SP-03 — движение над разрешената скорост в рамките на +10 км/ч
 *  (ЗДвП чл. 21: ограничението е таван, не цел) — по ДЪЛЪГ маршрут с два
 *  тавана (50, после зона 30), така че пълзенето на стрелката е грешка и в
 *  двата участъка. */
export const SC_SPEED_CREEP: ScenarioSpec = {
  id: "sc-speed-creep",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "зона 30", "градско каране", "самоконтрол"],
  titleBg: "Пълзящо превишаване на скоростта",
  objectiveBg:
    "Измини дългата улица с два тавана: дръж под 50 км/ч по целия подход, а на знака за зона 30 свали НАВРЕМЕ до под 30 и задръж до края. Скоростта пълзи неусетно — стрелката се проверява, не се усеща.",
  archetypeIds: ["SP-01", "SP-03"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-creep2-v1.json meta.scenario.params
    // (tools/maps/gen_sp_transition.mjs — the P5 long two-segment street).
    params: { approachM: 400, zoneM: 280, approachKmh: 50, zoneKmh: 30 },
    districtId: "sp-creep2-v1",
  },
  start: {
    spawnPointId: "sp-tr-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по дългата улица — знакът на входа казва 50 км/ч. Установи спокойни 46–48 и ги ЗАДРЪЖ." },
    { n: 2, textBg: "Поглеждай скоростомера на всеки няколко секунди: при дълго равномерно каране скоростта пълзи нагоре, без да усетиш." },
    { n: 3, textBg: "Напред започва зона 30 — цифрите „30“ са изписани на самото платно. Вдигни газта отрано и влез в зоната вече под 30." },
    { n: 4, textBg: "В зоната дръж 26–28 км/ч — и тук стрелката пълзи: същият навик, по-нисък таван." },
    { n: 5, textBg: "Задръж под 30 до края на зоната — двата тавана са един и същ урок: таванът е граница, не цел." },
  ],
  success: [
    {
      id: "sc-crp-approach",
      titleBg: "Мини подхода под 50 км/ч",
      // Cap just above the taught 46–48 cruise: a disciplined drive satisfies
      // it, a „с потока" speeder at 57 does not.
      params: { kind: "reachZone", x: LANE_X, y: 240, radiusM: 10, maxSpeedKmh: 52 },
    },
    {
      id: "sc-crp-zone",
      titleBg: "Мини зоната 30 под 30 км/ч",
      // Deep in the zone, cap = the graced 33: an adapted ~27 drive satisfies
      // it; a zone-creeper at 37 does not.
      params: { kind: "reachZone", x: LANE_X, y: 520, radiusM: 10, maxSpeedKmh: 33 },
    },
    {
      id: "sc-crp-finish",
      titleBg: "Стигни края на зоната, още под 30",
      params: { kind: "reachZone", x: LANE_X, y: 650, radiusM: 12, maxSpeedKmh: 33 },
    },
  ],
  rubric: { parTimeSec: 90 },
  shadow: { path: "content/traces/sc-speed-creep/shadow-correct.trace.json" },
  // MISTAKE ORDER IS A FRAMING DECISION (founder R0 on the produced clip:
  // „here totally not understandable … a car driving forward in a city street
  // nothing else"). The why-panel serves ev-speed-limit with mistake INDEX 0
  // (whyPanel DIRECT_SIM_REFS), and the clip rig frames a window around the
  // engine fault. A speeding clip only reads if the CAP is in the same frame
  // as the needle:
  //   - the APPROACH demo breaks the 50, whose only rendered face is the В26
  //     disc props.ts posts at the segment entry (y ≈ 14). The fault cannot be
  //     dragged back to it — the car starts at rest and needs ~85 m just to
  //     reach a sustained 57 — so that clip is structurally sign-less.
  //   - the ZONE demo breaks the 30, and the 30 is painted ON THE ROAD every
  //     120 m (markings.ts SPEED_GLYPH_* — 6 m numerals in the driver's own
  //     lane). The recorder authors the conviction ONTO one of those numerals,
  //     so the cap is under the ❌ and cannot leave the chase frame.
  // So the ZONE demo leads. Both are still shipped and still graded the same;
  // only the order (and therefore which one the clip pilot renders) changed.
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-zone-creep.trace.json" },
      titleBg: "Пълзене в зоната 30",
      whatWentWrongBg:
        "Подходът беше дисциплиниран и колата влезе в зоната правилно, с 27 км/ч — но без поглед към скоростомера стрелката изпълзя до 37. Усещането при 37 в зона 30 е „бавно“; присъдата е същата второстепенна грешка като 57 в зона 50. Навикът да проверяваш стрелката важи двойно там, където таванът е нисък.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-flow-along.trace.json" },
      titleBg: "Носене с потока по подхода",
      whatWentWrongBg:
        "По дългия подход колата задържа около 57 км/ч, защото „всички карат така“ — но 51–60 км/ч в зона 50 е второстепенна грешка. В зоната водачът намали правилно; грешката вече беше отбелязана: ограничението е таван за всеки поотделно, потокът не го вдига.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко продължително равномерно каране — по булеварди, прави отсечки и особено след преход към по-нисък таван (зона 30, жилищна зона): точно там пълзенето на стрелката е най-неусетно и най-скъпо.",
    whyBg:
      "Рискът от тежко нараняване при удар расте стръмно със скоростта — няколко километра в час над тавана свиват дистанцията за спиране и полето на видимост точно там, където се появяват пешеходци. Усещането за скорост се приспособява за минути; затова стрелката се ПРОВЕРЯВА периодично, а таванът е граница, под която си оставяш резерв.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през ЦЕЛИЯ маршрут — и на булеварда, и в зоната: движение над разрешеното е грешка дори без злополука, а над +10 км/ч е опасна грешка и прекратява изпита. Очаква се и навременно сваляне при влизане в зона с по-нисък таван.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-speed-dangerous — „Над +10 км/ч" (SP-02 + SP-13) on ov-keepright-v1
//    (REUSED 360 m 2+2 boulevard, limit 50 — the map-reuse house pattern:
//    sc-sp-harsh-brake↔sp-creep-v1, sc-follow-tailgater↔ln-v1).
//
// FOUNDER R3 REDESIGN (doc 62 #31: „IDENTICAL to #30; if a user sees this he
// will start to feel the platform is a scam"). The drill's own concept — the
// +10 band — is a THRESHOLD, and a threshold is taught by CONTRAST plus the
// pressure that makes real drivers cross it: the flow. Doc 72's SP-13 („скорост
// на потока") was parked because AMBIENT traffic must stay zero; staged
// DETERMINISTIC actors are the honest unlock:
//   - the RUNAWAY PACE CAR ahead (brakingLeadCar with followGapM authored far
//     above the real gap — the FTG_LEAD constant-cruise trick) pulls away at
//     ~61 km/h: the carrot;
//   - the PASSER behind (rearTailgater — learn-only, emits ZERO events by its
//     runner contract) glues briefly, then overtakes on the left at the same
//     illegal pace: the push.
// Neither actor can grade anything; the ONLY gradable fault stays the
// player's own speed. The two mistakes now demonstrate the BAND ITSELF:
// pacing the flow at ~58 grades второстепенна SPEEDING_OVER_LIMIT; chasing it
// at ~66 grades опасна SPEEDING_DANGEROUS — same road, same flow, 8 km/h
// apart, an exam continued vs an exam terminated. That contrast IS the +10
// lesson, and it is distinct from sc-speed-creep (zones, no actors) by both
// staging and graded band.
// ---------------------------------------------------------------------------

/**
 * The RUNAWAY PACE CAR — „потокът" ahead. followGapM 400 on a 360 m road can
 * never be satisfied, so the matchPlayer controller pins the actor at its
 * maxMatchSpeedMps constantly (the FTG_LEAD documented precedent): a car in
 * the player's own lane pulling away at ~61 km/h. Slam tier authored out of
 * reach (slamAt past the road end + minSlamSpeedKmh 250) — deterministic
 * moving traffic, never a braking drill. It starts ~55 m ahead and only
 * GAINS distance on a lawful player, so FOLLOWING_TOO_CLOSE structurally
 * cannot arm even against the 66 km/h chase demo (gap stays ≥ ~50 m).
 */
const SPD_FLOW_LEAD: BrakingLeadCarSpec = {
  id: "sc-dng-flow-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ov-kr-n-start", "ov-kr-n-end"],
    hold: { nodeIndex: 0, offsetM: 70 }, // dormant ~55 m ahead of the spawn
    cruiseSpeedMps: 17,
    extraRightOffsetM: 0, // the player's own (right) lane, x ≈ 12.19
    colorIndex: 2,
  },
  followGapM: 400, // ABOVE any possible gap → constant maxMatchSpeedMps cruise
  maxMatchSpeedMps: 17, // ~61 km/h — the flow's illegal pace
  slamAt: { x: KRD_RIGHT, y: 900 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The PASSER — „потокът" behind. The shipped rearTailgater actor (learn-only:
 * its runner emits ZERO SimTick events, the FO-07 contract), released once the
 * player pulls ~15 m ahead: it closes, sits ~10 m of centers behind for ~5 s,
 * then laneShift-passes on the LEFT at ~61 km/h and drives off — the driver
 * who „не издържа" and breaks the limit around you. Against the 66 km/h chase
 * demo its 16 m/s match cap simply leaves it behind — still zero events.
 */
const SPD_FLOW_PASSER: RearTailgaterSpec = {
  id: "sc-dng-flow-passer",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["ov-kr-n-start", "ov-kr-n-end"],
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant ~13 m behind the spawn
    cruiseSpeedMps: 15,
    extraRightOffsetM: 0, // the player's own (right) lane
    colorIndex: 4,
  },
  releaseGapM: 15,
  followBehindM: 10, // ~10 m of centers ≈ 6 m of bumpers — pressure, not лепка
  maxMatchSpeedMps: 16, // ~58 km/h — keeps the pressure on a flow-pacing player
  pressureSec: 5,
  passShiftM: -8.125, // one drawn lane LEFT — the legal-side pass
  passSpeedMps: 17, // ~61 km/h — the flow's pace again
  passAheadM: 30,
  easeKmh: 8,
};

/** SP-02 + SP-13 — превишаване с повече от 10 км/ч под натиска на потока
 *  (ЗДвП чл. 21; doc 32: опасна грешка — изпитът се прекратява; чл. 20 ал. 1:
 *  скоростта е твое решение, не на колоната). */
export const SC_SPEED_DANGEROUS: ScenarioSpec = {
  id: "sc-speed-dangerous",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "скорост на потока", "опасна грешка", "изпит"],
  titleBg: "Превишаване над +10 км/ч",
  objectiveBg:
    "Потокът по булеварда лети с над 60 км/ч — една кола ти се отдалечава отпред, друга те притиска и изпреварва. Задачата е да НЕ тръгнеш с тях: дръж 46–48 км/ч в дясната лента. 51–60 е второстепенна грешка; над 60 (+10) е опасна и на изпита значи директно отпадане.",
  archetypeIds: ["SP-02", "SP-13"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-keepright-v1.json
    // meta.scenario.params (tools/maps/gen_ov_keepright.mjs; map REUSED).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ov-keepright-v1",
  },
  start: {
    spawnPointId: "ov-kr-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — ограничението е 50 км/ч, а потокът около теб няма да го спазва." },
    { n: 2, textBg: "Колата пред теб се отдалечава с над 60 — остави я. Скоростта се чете от знака и скоростомера, не от гърба на предния." },
    { n: 3, textBg: "В огледалото се появява кола, която те притиска и после те изпреварва отляво. Нейната грешка е нейна — не я прави своя." },
    { n: 4, textBg: "Помни границата: 55–60 е второстепенна грешка, а НАД 60 км/ч (+10) е опасна — на изпита това е директно отпадане." },
    { n: 5, textBg: "Задръж 46–48 км/ч до края на отсечката — да те изпреварват е нормално; да отпаднеш от изпита не е." },
  ],
  success: [
    {
      id: "sc-dng-hold",
      titleBg: "Задръж под 50, докато потокът те подминава",
      // Radius 6 < the 8.125 m lane pitch: satisfiable ONLY from the RIGHT
      // lane, at a lawful pace — resisting the flow IS the drill.
      params: { kind: "reachZone", x: KRD_RIGHT, y: 200, radiusM: 6, maxSpeedKmh: 52 },
    },
    {
      id: "sc-dng-finish",
      titleBg: "Стигни края на отсечката, още под тавана",
      params: { kind: "reachZone", x: KRD_RIGHT, y: 330, radiusM: 6, maxSpeedKmh: 52 },
    },
  ],
  rubric: { parTimeSec: 55 },
  shadow: { path: "content/traces/sc-speed-dangerous/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-pace-flow.trace.json" },
      titleBg: "Със скоростта на потока — 58",
      whatWentWrongBg:
        "Водачът се лепна за потока и задържа около 58 км/ч, „за да не пречи“. 51–60 км/ч в зона 50 е второстепенна грешка — коригируема, но записана. Потокът не вдига тавана: той просто кара сбъркано пред свидетел.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-chase-flow.trace.json" },
      titleBg: "Гонене на потока — 66",
      whatWentWrongBg:
        "Отдалечаващата се кола „дръпна“ и водачът я подгони до около 66 км/ч — над +10 км/ч над ограничението. Само 8 км/ч делят тази присъда от предишната: 58 беше второстепенна грешка, 66 е опасна и на практическия изпит значи незабавно отпадане. Границата +10 не е буфер, а ръбът на изпита.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "Винаги, когато потокът кара над ограничението — по булеварди, при „дърпащ“ преден автомобил и при натиск отзад. Точно там се решава дали скоростомерът ти се управлява от теб или от колоната.",
    whyBg:
      "Наредба № 38 дели превишаването на две присъди с граница +10 км/ч: до нея грешката е второстепенна, над нея — опасна, с прекратен изпит. Границата е рязка, а натискът на потока е точно силата, която неусетно те прекарва през нея: няколко секунди „в крак с другите“ струват колкото цял изпит — а на улицата спирачен път, който вече не стига.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият вижда потока около теб и точно затова гледа ТВОЯ скоростомер: движение „със потока“ над ограничението е грешка, а едно-единствено превишаване с повече от 10 км/ч прекратява изпита на място. Спокойното изоставане от потока се брои за зрялост, не за колебание.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  staged: [SPD_FLOW_LEAD, SPD_FLOW_PASSER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-speed-rain — „Скорост в дъжд през нощта" (SP-04, ×N) on sp-rain-v1
//    (360 m straight street, limit 50, recorded at night in the rain)
// ---------------------------------------------------------------------------

/** SP-04 — несъобразена с дъжда/нощта скорост (ЗДвП чл. 20: скорост, при която
 *  водачът може да спре в рамките на видимото платно). */
export const SC_SPEED_RAIN: ScenarioSpec = {
  id: "sc-speed-rain",
  family: "speed",
  tagsBg: ["скорост", "дъжд", "нощно каране", "съобразена скорост"],
  titleBg: "Скорост в дъжд през нощта",
  objectiveBg:
    "Знакът остава 50, но тази вечер той ЛЪЖЕ: в дъжд и тъмнина съобразената скорост е около 38 км/ч, и карането „законно по знак“ с 48–50 тук се брои за грешка. Урокът е точно този — под ограничението НЕ значи безопасно; спираш в рамките на видимото платно.",
  archetypeIds: ["SP-04"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-rain-aquaplaning", "c-night-visibility"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-rain-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-rain-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица в дъжд и тъмнина. Знакът казва 50 — но знакът е писан за сух ден." },
    { n: 2, textBg: "Тук е разликата от урока „Пълзящо превишаване“: там таваните бяха на знаците; тук таванът го смъква НЕБЕТО. Свали до около 38 км/ч." },
    { n: 3, textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг, а фаровете осветяват само няколко метра напред." },
    { n: 4, textBg: "Карай така, че да можеш да спреш в рамките на осветеното платно — с 48 „под знака“ това вече е невъзможно и се брои за грешка." },
    { n: 5, textBg: "Задръж намалената за условията скорост ДО КРАЯ — дъждът не спира на контролната зона." },
  ],
  success: [
    {
      id: "sc-rn-adapted",
      titleBg: "Мини контролната зона със съобразена за дъжда скорост",
      // Cap 42 km/h sits just under the rain envelope (0.85 × 50 = 42.5): the
      // adapted ~38 km/h drive satisfies it; a dry-speed 50 km/h does not —
      // the „legal by the sign" pace FAILS this gate, which is the lesson.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 42 },
    },
    {
      id: "sc-rn-finish",
      titleBg: "Стигни края на отсечката, още под мокрия таван",
      // The wet cap holds to the END (doc 62 #32): sprinting to 50 after the
      // first gate is the same fault — the envelope is the road's, not a
      // checkpoint's.
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12, maxSpeedKmh: 42 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-rain/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-dry-speed.trace.json" },
      titleBg: "Като на сухо — 72 при знак 50 в дъжда",
      whatWentWrongBg:
        "Колата подмина знака В26 „50“ и ускори до около 72 км/ч, все едно е сух, открит път. 72 при ограничение 50 е над +10 км/ч — това е ОПАСНА грешка, която на изпита прекратява явяването на място (Наредба № 38). А тук грешката е двойна: мокрият и тъмен път искат скорост ЧУВСТВИТЕЛНО ПОД знака (около 38 км/ч, чл. 20), не над него. Знакът е таван за идеални условия — не покана да го надскочиш.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-flow-along.trace.json" },
      titleBg: "Каране с потока в дъжда",
      whatWentWrongBg:
        "Около 48 км/ч „с потока“ — под знака, но твърде бързо за мокрия път и слабата видимост. Съобразената скорост не се чете от знака, а от условията: намали до около 38 км/ч.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
  ],
  teach: {
    whenBg:
      "При дъжд, мокър път, мъгла или тъмнина — тогава разрешеното по знак вече не е съобразеното. Видимостта и сцеплението падат, а с тях трябва да падне и скоростта.",
    whyBg:
      "На мокър и тъмен път спирачният път нараства около 1,4 пъти, а фаровете осветяват само няколко метра — карането на „сухата“ скорост означава да летиш към участък, който още не виждаш. Съобразената скорост връща и разстоянието за спиране, и времето за реакция.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият очаква видимо намаляване за условията — не просто спазен знак. Несъобразената с дъжда/нощта скорост се отбелязва като грешка; съобразена е тази, при която спираш в рамките на видимото платно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5WetGrip(),
  ],
  conditions: { weather: "rain", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-speed-zone — „Зона 30 (училище/жилищна)" (SP-03 / PE-07) on
//    sp-zone30-v1 (360 m straight street posted 30 — the whole street IS the
//    zone; the map's own maxspeed grades it, no zone map layer needed)
// ---------------------------------------------------------------------------

/**
 * SP-03 / PE-07 — съобразяване с по-ниско ограничение в зона 30 (ЗДвП чл. 21).
 * ONE template, TWO DISTINCT codes (the sc-vp-readiness / sc-ov-lane-keeping
 * precedent): the SAME 50 км/ч, законна по булевард, в зона 30 е ОПАСНА грешка.
 *   - „Скорост от булеварда" (~37 км/ч) → SPEEDING_OVER_LIMIT (31–40 в зона 30
 *     → второстепенна; над грациозния 33, под опасния праг 40);
 *   - „Пълни 50 през зоната" (~50 км/ч) → SPEEDING_DANGEROUS (> +10 = > 40 →
 *     опасна). Колата минава лентата 33–40 за под 2 s (движещ праг), затова
 *     второстепенният код не се арма — точно като sc-speed-dangerous „flooring".
 */
// ---------------------------------------------------------------------------
// THE SCHOOLYARD (founder register items 60 + 61, doc 87 B60/B61)
// ---------------------------------------------------------------------------
//
// He played this exact lesson and wrote two things:
//   „the question is stating School zone, but in fact no kids are playing on
//    the sidewalks and we should do that it will attract the user to watch
//    closely"
//   „I see only Normal Buildings living/office building no actual school when
//    the question states there should be School, weak map engineering"
//
// Both halves are now built. The BUILDING is authored in the map
// (sp-zone30-v1 `sp-b-school`, `kind: "school"` — the УЧИЛИЩЕ name board, the
// yard railing and the А19 „Деца" posts derive from it in world/builders).
// The CHILDREN are here, because actors are scenario data, not map data.
//
// WHY THEY ARE `pedestrianDartOut` AND WHY THEY NEVER TOUCH THE ROAD.
// The ambient pedestrian system anchors every walker on a CROSSING
// (traffic/pedestrians.ts), and this street deliberately has none — it is the
// pure-overspeed archetype. So ambient `pedestrianCount` on this map produces
// exactly what the founder saw: nobody. Staged walkers are the only mechanism
// that puts a figure on this pavement.
//
// They are staged so they CANNOT change one point of grading:
//   * every path lies wholly on the EAST PAVEMENT (x ∈ [+8.1, +11.6] plus the
//     yard strip behind it) — the driver's own kerb, since he drives north in
//     the right lane. The carriageway edge is x = +8.125, and the
//     nearest any child comes to it is 2.0 m — well outside
//     PEDESTRIAN_CONTACT_M (1.5), so the collision branch cannot fire against a
//     car that stays on the road;
//   * `roadFromM`/`roadToM` are placed BEYOND the walk, so `onRoad` is false on
//     every frame and no crossing-occupancy count is ever incremented. There is
//     no crossing on this district anyway, so PEDESTRIAN_* stays structurally
//     inert exactly as it was before they existed;
//   * they release at spawn (`triggerDistM` spans the street, speed floor 0),
//     so the „encounter cancelled" branch — which fires only while an event is
//     still ARMED — can never mark them „не се случи". They are scenery with a
//     pulse, and they resolve `clear` when they finish their walk.
//
// This is the honest version of what he asked for: a reason to lift off that a
// 17-year-old can SEE, without inventing a чл. 119 duty on a street whose whole
// lesson is the number on the plate.

/** East pavement centre line (carriageway edge +8.125, pavement 3.5 m deep). */
const SCHOOL_WALK_X = 9.9;
/** The yard gate, on the railing line derived by world/builders/schools.ts
 *  (school centre 30.12 − half-depth 8 − RAILING_OFFSET_M 5.5 = 16.62). */
const SCHOOL_GATE_X = 16.6;

/** Shared shape: released at once, never on the roadway, never resolved late. */
const yardChild = (
  id: string,
  start: { x: number; y: number },
  dir: { x: number; y: number },
  speedMps: number,
  travelM: number,
  /**
   * Release radius, m. The WALKERS keep 400 — the whole street — because a
   * walker released at the first tick is still walking when he arrives.
   *
   * A RUNNER released at the first tick is not: doc 87 B60 asked for children
   * playing, and a child at 2.6 m/s covers his whole 90 m of pavement in 35 s
   * — before a lawful 27 km/h drive reaches the school at all. Measured on
   * this drive: the scene clock is ~16 s old before the car leaves y = 15, so
   * a first-tick runner is a STATUE by the time he is looked at, which is
   * exactly the failure the row already records („they walk", and now „they
   * stand"). Handing the runners a release radius instead ties their clock to
   * HIS position rather than to the scene's, so the chase is under way in the
   * window he is driving through, on any rung and at any approach speed.
   */
  triggerDistM = 400,
): PedestrianDartOutSpec => ({
  id,
  kind: "pedestrianDartOut",
  // No crossing exists on sp-zone30-v1; the id is inert (occupancy is only
  // counted while `onRoad`, which these never are) and is kept distinct so a
  // future crossing on this map can never be driven by a yard child.
  crossingId: "sp-schoolyard",
  crossing: { x: start.x, y: start.y },
  start,
  dir,
  speedMps,
  travelM,
  // Beyond the walk: `onRoad` is false on every frame, by construction.
  roadFromM: travelM + 100,
  roadToM: travelM + 200,
  // Scenery with a teaching job, not a hazard — the founder asked for children
  // on the pavement outside the school „it will attract the user to watch
  // closely". The encounter battery must therefore NOT demand they be met;
  // instead it proves they can never reach the carriageway at any speed, which
  // the two lines above already guarantee by construction.
  ambient: true,
  triggerDistM,
  minTriggerSpeedKmh: 0,
  variant: "child",
});

/**
 * Children in front of the school — and since doc 87 B60, children who are
 * PLAYING rather than commuting.
 *
 * His sentence is „no kids are playing on the sidewalks and we should do that
 * it will attract the user to watch closely." Four children existed, and the
 * 2026-08-02 re-look answered him plainly: **they walk.** 0.85–1.15 m/s,
 * single file, all four on their own errand. Nothing in that picture makes a
 * seventeen-year-old lift off.
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT.
 * Three of the six now RUN — 2.4–2.9 m/s, which is a child's jog, not a
 * sprint — and their paths CONVERGE on the stretch the driver is looking at:
 * two chase each other north up the pavement while a third runs south to meet
 * them. Movement that crosses is what reads as a game from a moving car;
 * everything else reads as a queue. The two walkers stay, because a schoolyard
 * with nobody merely walking is a cartoon.
 *
 * TIMING IS THE WHOLE TRICK, and it is arithmetic, not taste — and the first
 * cut of this got it wrong, which is worth writing down. Yard children were
 * released at the FIRST TICK (`triggerDistM` 400). That is right for a walker
 * and fatal for a runner: measured on the rendered drive, the scene clock is
 * ~16 s old before the car leaves the spawn and the school is not reached
 * until t ≈ 42 s, by which time a 2.6 m/s child has run out his whole path
 * and is STANDING — „they walk" would simply have become „they stand".
 * The three runners therefore release on a RADIUS (70 m) instead: their clock
 * starts from HIS position, ~9–12 s before he is level with them, so the chase
 * is always under way in the window he is driving through — at any approach
 * speed, on any rung, with no dependence on how long the scene was warm.
 *
 * The safety construction is unchanged and is what lets these be `ambient`:
 * every path is a straight line at constant x on the EAST pavement, the
 * nearest point of any of them is 1.78 m from the carriageway edge (x =
 * +8.125) against a `PEDESTRIAN_CONTACT_M` of 1.5, and `roadFromM`/`roadToM`
 * still sit beyond the walk so `onRoad` is false on every frame. The
 * encounter battery's ambient invariant — „never reaches the carriageway at
 * ANY speed" — is satisfied by construction for the new three exactly as it
 * was for the old four.
 */
const SCHOOL_YARD_CHILDREN: PedestrianDartOutSpec[] = [
  yardChild("sc-zn-kid-1", { x: SCHOOL_WALK_X, y: 198 }, { x: 0, y: 1 }, 1.0, 26),
  yardChild("sc-zn-kid-2", { x: SCHOOL_WALK_X + 1.2, y: 238 }, { x: 0, y: -1 }, 1.15, 30),
  // Out of the gate and TOWARD the kerb — the child who stops one pace short
  // of the carriageway. He is the reason for the 30, and he is the figure the
  // instruction text has always described. He walks west (toward the road) and
  // halts at x = 10.1, i.e. 2.0 m from the asphalt.
  yardChild("sc-zn-kid-3", { x: SCHOOL_GATE_X, y: 216 }, { x: -1, y: 0 }, 0.9, 6.5),
  // THE CHASE. kid-4 runs, kid-5 runs after him one pace of pavement over and
  // six metres back, and they stay a stride apart the whole way — the two
  // figures the driver sees moving fastest, on the kerb he is driving along.
  yardChild("sc-zn-kid-4", { x: SCHOOL_WALK_X + 0.5, y: 176 }, { x: 0, y: 1 }, 2.6, 70, 70),
  yardChild("sc-zn-kid-5", { x: SCHOOL_WALK_X + 1.4, y: 170 }, { x: 0, y: 1 }, 2.9, 74, 70),
  // …and the one running the other way, so the paths CROSS in front of him
  // instead of all drifting the same direction with the traffic. He is
  // released at y ≈ 192 — i.e. running TOWARD the windscreen, not away from it.
  yardChild("sc-zn-kid-6", { x: SCHOOL_WALK_X + 1.0, y: 262 }, { x: 0, y: -1 }, 2.4, 62, 70),
];

export const SC_SPEED_ZONE: ScenarioSpec = {
  id: "sc-speed-zone",
  family: "speed",
  tagsBg: ["скорост", "зона 30", "училищна зона", "жилищна зона"],
  titleBg: "Зона 30 — училище и жилищен квартал",
  objectiveBg:
    "Измини улицата в зона 30, като държиш скоростта под 30 км/ч през цялото време — там, където има деца и пешеходци, същите 50 км/ч, законни по булеварда, стават опасна грешка.",
  archetypeIds: ["SP-03", "PE-07"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-zone30-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 30 },
    districtId: "sp-zone30-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влизаш в зона 30 — училище и жилищен квартал. Ограничението тук е 30 км/ч, не 50." },
    { n: 2, textBg: "Свали скоростта осезаемо още на знака А19 „Деца“ и установи спокойни около 26–28 км/ч." },
    // Doc 87 B60 — the world now shows children RUNNING and the copy has to
    // say so: an instruction that describes a picture the student is not
    // looking at is worse than no instruction.
    { n: 3, textBg: "Вдясно напред е УЧИЛИЩЕТО: пред оградата му деца ТИЧАТ и се гонят по тротоара, а едно излиза от портата към бордюра. Гледай тях, не километража — тичащо дете не гледа пътя и всеки момент някое може да стъпи на платното." },
    { n: 4, textBg: "Не пренасяй „скоростта от булеварда“ в зоната: 50 км/ч тук е над +10 км/ч, тоест опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-zn-under-limit",
      titleBg: "Мини контролната зона под 30 км/ч",
      // Cap 33 (= graced limit) sits just above the taught ~27 cruise: a
      // disciplined drive satisfies it, a 37+ speeder does not.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 33 },
    },
    {
      id: "sc-zn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-zone/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-boulevard-speed.trace.json" },
      titleBg: "Скорост от булеварда в зона 30",
      whatWentWrongBg:
        "Колата задържа около 37 км/ч — нормална за булевард, но в зона 30 това е превишаване. 31–40 км/ч тук е второстепенна грешка; знакът смени тавана, скоростта трябваше да го последва.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-full-speed.trace.json" },
      titleBg: "Пълни 50 през зоната",
      whatWentWrongBg:
        "Колата премина зоната с около 50 км/ч, все едно е булевард. В зона 30 това е над +10 км/ч — опасна грешка, която на изпита означава отпадане, а на улицата е разликата между спиране и прегазено дете.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При всяка зона 30 — пред училища, детски градини, в жилищни квартали и там, където знакът В26 или табелата „Зона 30“ смъква тавана. Ниският лимит не е формалност: той е избран заради децата и пешеходците.",
    whyBg:
      "При 30 км/ч спирачният път и тежестта на удара са в пъти по-малки, отколкото при 50 — затова зоните 30 се поставят точно там, където пешеходец изскача без предупреждение. Пренасянето на булевардната скорост в зоната заличава цялото предимство, за което зоната съществува.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците: при влизане в зона с по-ниско ограничение очаква видимо и навременно намаляване. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  // The schoolyard children. In `staged`, not `stagedAdd`: this drill has no
  // committed recording that could be perturbed (its traces are speed scripts
  // on an empty street and the walkers emit no event on any of them), and the
  // founder's ask was that the school zone LOOK like one at every rung, not
  // only at L5.
  staged: SCHOOL_YARD_CHILDREN,
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-speed-transition — „Преход 50→30 (навлизане в зона 30)" (SP-03) on
//    sp-trans-v1: a street built from TWO segments — a 160 m approach posted 50
//    then a 200 m zone posted 30 — so the limit DROPS mid-route. The runtime
//    grades PER EDGE (each segment carries its own maxspeed), so keeping the
//    approach speed past the transition sign fires the speeding codes against
//    the LOCAL 30, not the 50 the driver just left.
// ---------------------------------------------------------------------------

/** Transition Y of sp-trans-v1 (= approachM); the В26 „Зона 30" sign line. */
const TRANS_Y = 160;

/**
 * SP-03 — „Преходът на зони / Zone-transition blindness (50→30)" (ЗДвП чл. 21).
 * The distinct value vs sc-speed-zone (a homogeneous 30-street): here the limit
 * actually CHANGES mid-route, so the taught fault is the missing anticipatory
 * lift at the sign. ONE template, TWO DISTINCT codes against the LOCAL 30 limit:
 *   - „Само наполовина намалена" (~37 km/h) → SPEEDING_OVER_LIMIT (31–40 in the
 *     30 zone → второстепенна);
 *   - „Скоростта от преди зоната" (~48 km/h carried straight through) →
 *     SPEEDING_DANGEROUS (> +10 = > 40 → опасна). The speed stays above 40
 *     across the sign, so it never dwells in the 33–40 minor band — only the
 *     dangerous code arms (the sc-speed-dangerous „flooring" pattern). Neither
 *     fault grades on the 50 APPROACH: 48 < the graced 55 there.
 */
export const SC_SPEED_TRANSITION: ScenarioSpec = {
  id: "sc-speed-transition",
  family: "speed",
  tagsBg: ["скорост", "зона 30", "преход на зони", "навлизане в зона", "училищна зона"],
  titleBg: "Преход 50→30 — навлизане в зона 30",
  objectiveBg:
    "Намали НАВРЕМЕ на знака за зона 30: улицата минава от 50 на 30 км/ч в средата на маршрута, а скоростта трябва да падне заедно със знака — пренесеш ли скоростта от преди зоната, тя става грешка още с влизането.",
  archetypeIds: ["SP-03"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-trans-v1.json meta.scenario.params
    // (tools/maps/gen_sp_transition.mjs): 160 m @ 50 → 200 m @ 30.
    params: { approachM: 160, zoneM: 200, approachKmh: 50, zoneKmh: 30 },
    districtId: "sp-trans-v1",
  },
  start: {
    spawnPointId: "sp-tr-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — тук ограничението все още е 50 км/ч." },
    { n: 2, textBg: "Напред следва знак за зона 30 (училище/жилищна). Забележи го отрано — намаляването започва преди знака, не след него." },
    { n: 3, textBg: "Вдигни крака от газта навреме и влез в зоната вече под 30 км/ч — около 26–28 км/ч." },
    { n: 4, textBg: "Не пренасяй скоростта от преди зоната: същите 50 км/ч, законни допреди малко, в зоната са над +10 км/ч — опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-trn-approach",
      titleBg: "Измини подхода спокойно до знака за зоната",
      // On the 50 approach — reach it under a relaxed cap (a normal ~46 drive).
      params: { kind: "reachZone", x: LANE_X, y: 120, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-trn-in-zone",
      titleBg: "Влез в зона 30 вече под ограничението",
      // Deep in the 30 zone with a cap just above the taught ~27 cruise: an
      // anticipating driver satisfies it; one who carried 37+ km/h does not.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, maxSpeedKmh: 33 },
    },
    {
      id: "sc-trn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 345, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-transition/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-carry-speed.trace.json" },
      titleBg: "Скоростта от преди зоната",
      whatWentWrongBg:
        "Колата пренесе около 48 км/ч право през знака в зона 30 — законна допреди метри, тук над +10 км/ч. Знакът смени тавана на 30; неснижаването е опасна грешка, а не продължение на подхода.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-half-slow.trace.json" },
      titleBg: "Само наполовина намалена",
      whatWentWrongBg:
        "Скоростта падна, но само до около 37 км/ч — все още над 30. Намаляването закъсня и остана недостатъчно: 31–40 км/ч в зона 30 е второстепенна грешка. Целѝ под тавана, не към него.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко влизане в зона с по-ниско ограничение — знак В26 „Зона 30“, училищна или жилищна зона, край на населено място наопаки. Ключът е преходът: таванът пада на знака, а с него трябва да падне и скоростта.",
    whyBg:
      "Проучванията за зони 30 показват типичната грешка: водачът „не регистрира“ прехода и влиза в зоната със старата скорост, като адаптацията закъснява със стотина метра — точно там, където живее по-ниският лимит заради децата. Навременното вдигане на газта на знака връща цялото предимство на зоната.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през целия маршрут и очаква видимо, НАВРЕМЕННО намаляване при прехода към по-ниско ограничение. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-sp-harsh-brake — „Рязко спиране без причина" (SP-11 / VP-09) on
//    sp-creep-v1 (map REUSED; rides the recorder's maxDecelMps2 override —
//    the hard-brake capability unlock)
// ---------------------------------------------------------------------------

/**
 * SP-11 / VP-09 — рязко спиране без причина (Наредба № 38: „много рязко
 * спиране, което създава предпоставка за ПТП" is an explicit BG examiner fail
 * cause — phantom braking is graded, not just collisions). Rides the
 * recorder's drive.maxDecelMps2 override: the default 4.6 m/s² stop envelope
 * sits under the HARSH_BRAKING_NO_CAUSE threshold (7 m/s², emergency-grade),
 * so only an authored ≥ 10 override can slam. The street is EMPTY (ambient 0,
 * no crossing/junction/signal), so every cause in the detector's ledger is
 * positively absent — the slam grades EXACTLY the phantom-brake code. The
 * shadow demonstrates the correct habit: the same stop, planned early and
 * braked progressively (~3.2 m/s²), grades nothing. Detector is default-ON
 * (no ruleConfig needed): the LIVE student session grades the same fault.
 */
export const SC_SP_HARSH_BRAKE: ScenarioSpec = {
  id: "sc-sp-harsh-brake",
  family: "speed",
  tagsBg: ["рязко спиране", "плавно спиране", "предвиждане", "удар отзад"],
  titleBg: "Рязко спиране без причина",
  objectiveBg:
    "Спирай планирано и плавно: вдигни газта рано и намалявай постепенно, така че движещите се зад теб да разберат намерението ти — рязкото забиване на спирачките без опасност пред колата е предпоставка за удар отзад и се брои като грешка.",
  archetypeIds: ["SP-11", "VP-09"],
  conceptIds: ["c-general-care-duty", "c-speed-adaptation"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-speed-creep — mirrored in sp-creep-v1.json
    // meta.scenario.params (tools/maps/gen_sp_speed.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-creep-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  // Founder R3 #35 (doc 62 — „braking with no visible reason"): the CALL here
  // is honest framing, NOT a staged obstacle. The drill's whole point is the
  // HARSH_BRAKING_NO_CAUSE detector — „рязко спиране БЕЗ причина": the street
  // must stay positively empty (the detector's cause ledger and both mistake
  // demos narrate exactly that emptiness), so a staged hazard would contradict
  // the graded code and the demos. Instead the copy now names the REASON the
  // planned stop exists (your own errand — спирка/адрес) and points at the
  // on-screen zone marker, so the stop is motivated without inventing danger.
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и установи спокойна скорост около 45 км/ч. Улицата е празна — никаква опасност: спирането тук е ТВОЕ решение, не реакция." },
    // B64. This line used to end „…представи си, че това е твоята спирка или
    // адрес", and the founder answered „the question states stopping out of
    // nowhere, but why?". It said IMAGINE because there was nothing to look at:
    // the map authored a canopy, a shop and a neighbour block, and a building
    // with no kind renders as a grey extruded box. `sp-b-stop-canopy` is now
    // `kind: "busStop"` and the world builds the shelter on the pavement beside
    // the graded zone (world/builders/props.ts), so the copy can stop asking him
    // to imagine and start telling him where to look.
    {
      n: 2,
      textBg:
        "Напред ВДЯСНО, до тротоара, има автобусна спирка — навесът се вижда отдалеч. Това е твоята спирка: там слизаш. Светещият маркер на пътя показва точно къде да спреш. Реши да спреш ОТРАНО, не в последния момент.",
    },
    { n: 3, textBg: "Вдигни газта първо и остави колата да губи скорост, после спирай постепенно и равномерно до пълен покой в зоната." },
    { n: 4, textBg: "Силната спирачка е само за истинска опасност: на празна улица рязкото забиване изненадва движещите се зад теб — точно това се брои за грешка." },
    { n: 5, textBg: "Потегли отново плавно и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-shb-stop",
      titleBg: "Мини контролната зона с планирано, плавно спиране",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-shb-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpHarshBrake.ts; gates in traces/__tests__/sp-harsh-brake-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-harsh-brake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-phantom-stop.trace.json" },
      titleBg: "Фантомно спиране",
      whatWentWrongBg:
        "На съвсем празна улица колата заби спирачките до пълен покой — „стори ми се, че нещо мръдна“. Пред нея нямаше нищо: нито пешеходец, нито кола, нито знак. Рязкото спиране без причина е точно грешката, която изпитващите описват като „предпоставка за ПТП“ — движещият се отзад няма как да го очаква.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-stab-crawl.trace.json" },
      titleBg: "Рязък натиск до пълзене",
      whatWentWrongBg:
        "Паническо набиване на спирачката от 47 км/ч до пълзене — заради сянка между паркираните коли, без реална опасност на пътя. Дори без пълно спиране внезапното силно забавяне е същата грешка: този зад теб вижда стоповете късно и разстоянието се топи. Съмняваш ли се — вдигни газта и намали плавно, не забивай.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране, което можеш да предвидиш — автобусна спирка, адрес, място за паркиране, край на отсечка. Решението за спиране се взима рано и се съобщава на другите с постепенно, равномерно спиране; резкият крак е запазен само за истинска опасност.",
    whyBg:
      "Ударът отзад е сред най-честите катастрофи в града и в около една трета от случаите го „поръчва“ спиращият — с внезапна, необяснима за другите спирачка. Плавното, планирано спиране дава на движещия се зад теб време да реагира и запазва управлението на колата; рязкото без причина е грешка дори когато нищо не се удари.",
    lawRef: "Наредба № 38 (рязко спиране — предпоставка за ПТП)",
    examinerBg:
      "Изпитващият следи как спираш през целия маршрут: „много рязко спиране, което създава предпоставка за ПТП“ е изрично посочена грешка. Очаква се ранно вдигане на газта, постепенно спиране и пълен контрол — силната спирачка е оправдана само при реална опасност пред колата.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-sp-curve — „Скорост в завой" (SP-05) on sp-curve-v1: the FIRST
//    rural-curve map (gen_rural_curve.mjs) — an extra-urban 1+1 road posted 90
//    with a marked 90° arc (R 170) carrying the first curveAdvisory zone span
//    (advisory 50, знак А1 + табела). Sustained speed above the advisory
//    INSIDE the arc grades the CURVE-ENVELOPE основна SPEED_TOO_FAST_FOR_CURVE
//    (чл. 20 ал. 2); the approach and exit stay governed by the posted 90.
// ---------------------------------------------------------------------------

/** Inside-lane arc midpoint of sp-curve-v1 (meta.scenario.laneCurveMid). */
const CURVE_MID = { x: 52.66, y: 337.34 };
/** Exit-leg lane center of sp-curve-v1 (meta.scenario.exitLaneY). */
const CURVE_EXIT_Y = 385.94;

/**
 * SP-05 — несъобразена скорост в завой (ЗДвП чл. 20, ал. 2; SWOV: загубата на
 * контрол В ЗАВОЙ е НАЙ-свръхпредставената грешка на начинаещите — влизане
 * ~10 км/ч по-бързо, паническо спиране в дъгата, поднасяне/излизане от пътя).
 * The taught discipline: brake BEFORE the curve, never in it. Detector is
 * default-ON and structurally data-armed (only an authored curveAdvisory span
 * sets the tick field), so no ruleConfig is needed — the LIVE student session
 * grades the same fault.
 */
export const SC_SP_CURVE: ScenarioSpec = {
  id: "sc-sp-curve",
  family: "speed",
  tagsBg: ["скорост", "завой", "извънградско", "препоръчителна скорост", "знак А1"],
  titleBg: "Скорост в завой",
  objectiveBg:
    "Мини обозначения завой безопасно: свали скоростта до препоръчителните 50 км/ч ПРЕДИ завоя, дръж я равномерно през дъгата и ускорявай чак на излизане — спирачките работят на правата, не в завоя.",
  archetypeIds: ["SP-05"],
  conceptIds: ["c-speed-adaptation", "c-speed-limits", "c-general-care-duty"],
  map: {
    archetype: "rural-curve",
    // The generator recipe — mirrored in sp-curve-v1.json meta.scenario.params
    // (tools/maps/gen_rural_curve.mjs).
    params: { approachM: 220, radiusM: 170, sweepDeg: 90, exitM: 200, maxspeedKmh: 90, advisoryKmh: 50 },
    districtId: "sp-curve-v1",
  },
  start: {
    spawnPointId: "spc-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по извънградския път — тук ограничението е 90 км/ч и правата е свободна." },
    { n: 2, textBg: "Напред следва знак А1 „Опасен завой надясно“ с табела „50“ — препоръчителната скорост за завоя." },
    { n: 3, textBg: "Свали скоростта ПРЕДИ завоя: вдигни газта отрано и спри намаляването около 45–50 км/ч още на правата." },
    { n: 4, textBg: "Дръж скоростта равномерна през цялата дъга — без спирачки и без газ в завоя; гледай към изхода му." },
    { n: 5, textBg: "Щом воланът започне да се изправя, ускори плавно обратно към скоростта за правата." },
  ],
  success: [
    {
      id: "sc-spcv-approach",
      titleBg: "Измини подхода с разрешената скорост",
      // On the 90 approach — a normal ~85 rural cruise satisfies it.
      params: { kind: "reachZone", x: LANE_X, y: 170, radiusM: 12, maxSpeedKmh: 92 },
    },
    {
      id: "sc-spcv-curve",
      titleBg: "Мини средата на завоя с препоръчителната скорост",
      // Mid-arc control zone (meta.scenario.laneCurveMid), cap just above the
      // advisory + grace: the adapted 48 passes, the 70 hold does not.
      params: { kind: "reachZone", x: CURVE_MID.x, y: CURVE_MID.y, radiusM: 12, maxSpeedKmh: 55 },
    },
    {
      id: "sc-spcv-finish",
      titleBg: "Излез от завоя и продължи по правата",
      params: { kind: "reachZone", x: 330, y: CURVE_EXIT_Y, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpCurve.ts; gates in traces/__tests__/sc-sp-curve-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-curve/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-hold-speed.trace.json" },
      titleBg: "Със скоростта от правата в завоя",
      whatWentWrongBg:
        "Колата влезе в обозначения завой с около 70 км/ч — цели 20 над препоръчителните 50 от табелата. В дъгата гумите нямат резерв за нищо друго: една дупка, мокро петно или по-остър радиус и колата излиза от пътя. Точно тази грешка е най-честата причина начинаещи да катастрофират сами, без никой друг на пътя.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-brake-late.trace.json" },
      titleBg: "Спиране В завоя вместо преди него",
      whatWentWrongBg:
        "Намаляването започна чак В дъгата — колата влезе с ~85 и спирачките работиха в самия завой, а скоростта така и не слезе под препоръчителната. Спирането в завой краде от сцеплението за завиване и е рецептата за поднасяне: цялото намаляване се прави на правата, преди волана да се завърти.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
  ],
  teach: {
    whenBg:
      "При всеки обозначен завой извън населено място — знак А1/А2, често с табела с препоръчителна скорост. Ограничението 90 важи за правата; завоят има собствена безопасна скорост и тя се чете от знака и от геометрията на пътя.",
    whyBg:
      "Изследванията на SWOV показват: загубата на контрол в завой е НАЙ-типичната самостоятелна катастрофа на начинаещия водач — влизане само с 10 км/ч повече, паника, спирачка в дъгата, поднасяне. Гумите имат едно сцепление и то се дели между завиване и спиране: свалиш ли скоростта преди завоя, цялото сцепление остава за завиването.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият очаква видимо, навременно намаляване ПРЕДИ завоя — не спирачки в дъгата. Несъобразената с пътните условия скорост е грешка дори в рамките на общото ограничение; равномерното преминаване и плавното ускоряване на излизане показват контрол.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 8. sc-mw-discipline — „Дисциплина на магистралата" (SP-10 + OV-11) on mw-v1:
//    the FIRST motorway-segment map (gen_motorway.mjs) — a divided 2+2
//    motorway posted the honest АМ 140, each carriageway carrying an
//    emergency curb lane (an authored "emergencyLane" zone span + the
//    edge-level motorway tag). TWO DISTINCT lane/speed faults, one template
//    (the sc-speed-zone precedent):
//      - „Висене в лявата лента при 130" → NOT_KEEPING_RIGHT (the shipped
//        keep-right detector at motorway speed — the ln-v1 precedent needed
//        ZERO new code; the emergencyLaneRight seam makes laneId 1 the
//        rightmost REQUIRED lane);
//      - „Пълзене с 40 без причина" → DRIVING_TOO_SLOW_FOR_MOTORWAY (the
//        SP-10 crawl detector this slice ships — второстепенна on the
//        VERIFIED чл. 22, ал. 1 basis; NO general BG motorway minimum exists, see
//        rules/catalog.ts).
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario — the L7 copy truth). */
const MW_X_CRUISE = 0;

/**
 * SP-10 — скорост на потока + дръж вдясно на автомагистрала (ЗДвП чл. 15,
 * чл. 21, чл. 22, ал. 1; motorway speed-differential crash studies — the far-below-
 * flow car is a mobile chicane). Detectors are default-ON and structurally
 * data-armed (edge motorway tag + emergencyLane span — no other map carries
 * them), so no ruleConfig is needed — the LIVE student session grades both.
 */
export const SC_MW_DISCIPLINE: ScenarioSpec = {
  id: "sc-mw-discipline",
  family: "speed",
  tagsBg: ["магистрала", "скорост на потока", "дръж вдясно", "лентова дисциплина"],
  titleBg: "Дисциплина на магистралата",
  objectiveBg:
    "Измини магистралния участък като част от потока: установи се в ДЯСНАТА лента за движение с около 120–130 км/ч и я дръж — лявата е само за изпреварване, а пълзенето далеч под потока е също толкова грешно, колкото и превишаването.",
  archetypeIds: ["SP-10", "OV-11"],
  conceptIds: ["c-motorway-rules", "c-speed-limits", "c-lane-choice"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params
    // (tools/maps/gen_motorway.mjs).
    // doc 87 B67: mw-v1 grew 1000 -> 2600 m per carriageway (the posted 140 was
    // unreachable inside 1000 m). This object MIRRORS the generator recipe and is
    // asserted equal to the shipped meta.scenario.params, so it moves with it.
    params: { lengthM: 2600, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по магистралата — ограничението е 140 км/ч, платното е разделено с мантинела." },
    { n: 2, textBg: "Ускорявай уверено и се установи около 120–130 км/ч — на магистрала се кара със скоростта на потока." },
    { n: 3, textBg: "Дръж ДЯСНАТА лента за движение: лявата е само за изпреварване, а аварийната вдясно не е лента за движение изобщо." },
    { n: 4, textBg: "Не пълзи: трайно движение далеч под потока (под 50 км/ч без причина) прави от колата ти подвижно препятствие." },
    { n: 5, textBg: "Задръж скоростта и лентата до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwd-lane",
      titleBg: "Мини контролната зона в дясната лента за движение",
      // Radius 6 pins the CRUISE lane (lane centers sit 8.12–8.13 m apart):
      // the left-lane hog and an emergency-lane rider both miss it.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 520, radiusM: 6, maxSpeedKmh: 140 },
    },
    {
      id: "sc-mwd-finish",
      titleBg: "Стигни края на участъка",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 940, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMwDiscipline.ts; gates in traces/__tests__/sc-mw-discipline-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mw-discipline/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-left-hog.trace.json" },
      titleBg: "Висене в лявата лента при 130",
      whatWentWrongBg:
        "Колата се настани в ЛЯВАТА лента и остана там с километри, без да изпреварва никого. И на магистрала важи чл. 15: движиш се във възможно най-дясната свободна лента за движение — лявата се освобождава за по-бързите, иначе целият поток се подрежда зад теб.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-crawl.trace.json" },
      titleBg: "Пълзене с 40 по магистралата",
      whatWentWrongBg:
        "Колата запълзя трайно с около 40 км/ч по свободна магистрала — без задръстване, без повреда. Потокът тук се движи със 120–140: разликата от 80–100 км/ч прави пълзящата кола подвижно препятствие, което всички трябва да заобикалят. Магистралата изобщо допуска само превозни средства, способни на повече от 50 км/ч.",
      codeRefs: ["DRIVING_TOO_SLOW_FOR_MOTORWAY"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение по автомагистрала и скоростен път — от включването до напускането. Двете дисциплини вървят заедно: скорост, близка до потока, и възможно най-дясната свободна лента за движение.",
    whyBg:
      "Катастрофите на магистрала се раждат от РАЗЛИКИ в скоростта, не от самата скорост: кола с 40 км/ч в поток от 130 се приближава със 90 км/ч — колкото челен удар в града. Затова и пълзенето, и висенето в лявата лента са грешки: и двете карат потока да маневрира около теб, точно там, където маневрите са най-скъпи.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият очаква уверено движение със скоростта на потока в дясната лента за движение: трайното движение в лява лента без изпреварване е грешка, а пълзенето далеч под потока без причина — също. Лентите се сменят само с огледало и мигач, с ясна причина.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The speed-management templates, in catalog order (registered in
 *  templates.ts).
 *
 *  sc-speed-rain is registered FIRST on purpose (founder ruling): the why-panel
 *  rep is derived deterministically as the FIRST mistake in SCENARIO_TEMPLATES
 *  order whose codeRefs match an event's codes (whyPanel.ts buildSimRefIndex).
 *  sc-speed-rain__m0 grades SPEEDING_DANGEROUS → ev-speed-limit; placing rain
 *  ahead of sc-speed-creep (SPEEDING_OVER_LIMIT, also ev-speed-limit) makes the
 *  founder-locked ~72 km/h rain-night blast the SERVED clip for the
 *  dangerous-speeding question — and mistake[1] (48 km/h „поток") remains the
 *  ev-speed-for-conditions rep. Reordering here is the whole mechanism; no
 *  other event's rep changes (verified in whyPanel/clipPilot gates). */
export const SCENARIO_TEMPLATES_SP: readonly ScenarioSpec[] = [
  SC_SPEED_RAIN,
  SC_SPEED_CREEP,
  SC_SPEED_DANGEROUS,
  SC_SPEED_ZONE,
  SC_SPEED_TRANSITION,
  SC_SP_HARSH_BRAKE,
  SC_SP_CURVE,
  SC_MW_DISCIPLINE,
];
