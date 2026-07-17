/**
 * Scenario templates — the MANEUVER form of the exam-required set: „Обратен
 * завой в три точки" (обратен завой / turn-in-the-road), doc 72 PK-12 „Обръщане
 * в три хода". DATA ONLY in the templates.ts mold: every coordinate is
 * denormalized from the committed ov-narrow-v1 district so nothing loads world
 * JSON at runtime.
 *
 * The Наредба-38 route REQUIRES one обратен завой where no junction or
 * roundabout serves (ЗДвП чл. 38). On a narrow two-way street the discipline is
 * segment-wise: reverse the travel direction (~180°) in three controlled
 * movements — forward-left to the far curb, reverse-right to the near curb,
 * forward-away — looking BEFORE each move, without mounting a curb.
 *
 *  - sc-maneuver-3point  „Обратен завой в три точки"  (PK-12, ov-narrow-v1)
 *
 * Family: "parking" — the doc-76 §2 low-speed-maneuvering chip (PK archetypes
 * live there, alongside sc-pk-smooth-stop). Traces are RECORDED (the §5 gate +
 * §9 stage-5 code asserts run in traces/__tests__/sc-maneuver-3point-traces.ts;
 * re-record with RECORD_TRACES=1).
 */

import type { ScenarioSpec } from "./types";

/** Northbound right-lane center of ov-narrow-v1 (2 lanes × 3.25 m × 2.5 / 2). */
const LANE_X = 4.06;
/** Turn corridor centre on the street (mid-block, no junction near). */
const TURN_Y = 60;

/**
 * PK-12 — обратен завой в три точки (ЗДвП чл. 38: обратен завой е разрешен там,
 * където не е забранен и водачът има видимост; на тясна улица без кръстовище се
 * извършва на части; ЗДвП чл. 40: при движение назад водачът се убеждава, че
 * пътят зад него е свободен).
 */
export const SC_MANEUVER_3POINT: ScenarioSpec = {
  id: "sc-maneuver-3point",
  family: "parking",
  tagsBg: ["обратен завой", "в три точки", "заден ход", "тясна улица", "изпитни упражнения"],
  titleBg: "Обратен завой в три точки",
  objectiveBg:
    "Обърни посоката на 180° на тясната двупосочна улица в три контролирани движения — напред-наляво към отсрещния бордюр, назад-надясно към близкия, после напред по обратната посока — с оглеждане преди всяко движение и без да опреш бордюра.",
  // Doc-72 provenance: PK-12 IS this maneuver (Обръщане в три хода / three-point
  // turn — Н38 обратен завой when no junction/roundabout serves).
  archetypeIds: ["PK-12"],
  conceptIds: ["c-u-turn", "c-maneuver-principles", "c-reversing", "c-mirrors-blind-spots"],
  map: {
    archetype: "narrow-street",
    // Mirrored in ov-narrow-v1.json meta.scenario.params (gen_narrow_street.mjs).
    params: { lengthM: 240, maxspeedKmh: 40 },
    districtId: "ov-narrow-v1",
  },
  start: {
    spawnPointId: "nm-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Приближи мястото за обръщане в дясната лента и спри плътно, спокойно и без бързане." },
    {
      n: 2,
      textBg:
        "Убеди се, че улицата е чиста в двете посоки — обратният завой се прекъсва, ако се появи кола или пешеходец.",
    },
    {
      n: 3,
      textBg:
        "Първо движение: волан докрай наляво и бавно напред към отсрещния бордюр; спри, преди предницата да го стигне.",
    },
    {
      n: 4,
      textBg:
        "Второ движение: включи на задна, огледай се назад, волан докрай надясно и се върни към близкия бордюр; спри, преди задницата да го стигне.",
    },
    {
      n: 5,
      textBg:
        "Трето движение: напред, изправи волана и излез по платното в обратната посока — вече си обърнал на 180°.",
    },
  ],
  success: [
    {
      id: "sc-m3p-approach",
      titleBg: "Приближи мястото за обръщане и спри",
      // The pull-up pose in the right lane at the turn corridor (ov-narrow-v1:
      // right-lane center x = 4.06). Pinned to content/world/ov-narrow-v1.json.
      params: { kind: "reachZone", x: LANE_X, y: 52, radiusM: 8, maxSpeedKmh: 20 },
    },
    {
      id: "sc-m3p-turn",
      titleBg: "Обърни посоката на 180° в три движения",
      // Corridor-locked threePointTurn (Наредба-38): reversed travel direction,
      // at rest inside the turn box facing back, in as few movements as possible.
      // Tolerances are evaluator defaults at L3/L4; L1/L2 widen via toleranceScale.
      params: {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: { x: 0, y: TURN_Y, halfWidthM: 8, halfLengthM: 12 },
        startHeadingDeg: 0,
        toleranceDeg: 20,
        holdSec: 0.6,
      },
    },
  ],
  rubric: {
    // Economy = direction-change movements (a clean three-point turn is 3; German
    // Umkehren GA / DVSA turn-in-road codify more shunts as a fault). No placement
    // (no bay to align to) and no observation channel (the v1 mapper anchors on a
    // parking reverse-window, not a multi-segment turn).
    economy: { objectiveId: "sc-m3p-turn", attemptsFor3Stars: 3, attemptsFor2Stars: 5 },
    parTimeSec: 55,
  },
  // RECORDED (S-maneuver): committed deterministic recordings of the authored
  // scripts in traces/scManeuver3Point.ts; the §5 gate (shadow replays with ZERO
  // violations + completes threePointTurn in 3 movements) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-maneuver-3point-traces.test.ts (re-record
  // with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-maneuver-3point/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-maneuver-3point/mistake-wide.trace.json" },
      titleBg: "Твърде широк замах",
      whatWentWrongBg:
        "Първото движение продължи твърде широко и предницата се качи на отсрещния бордюр. Обратният завой в три точки се прави на части: волан докрай, бавно напред и СПИРАНЕ, преди колата да стигне бордюра — гледаш докъде стига предницата, не караш докато не опреш.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-maneuver-3point/mistake-shunt.trace.json" },
      titleBg: "Излишни маневри и опрян бордюр",
      whatWentWrongBg:
        "Излишни превключвания и връщане назад без контрол докъде стига задницата — тя закачи близкия бордюр. По-малко, но по-точни движения; преди всяко връщане назад — оглеждане назад и спиране, преди задницата да стигне бордюра (чл. 40).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Когато трябва да смениш посоката на 180° по тясна улица, а наблизо няма кръстовище или кръгово. Наредба 38 изисква един обратен завой по маршрута — това е разрешеният начин, когато мястото е тясно.",
    whyBg:
      "Обръщането е сред най-рисковите ниско-скоростни маневри: колата пресича насрещната лента и се движи назад с ограничена видимост. Който го прави на части — с оглеждане преди всяко движение и контрол докъде стигат предницата и задницата — не блокира улицата, не опира бордюр и не изненадва насрещните.",
    lawRef: "ЗДвП чл. 38",
    examinerBg:
      "Изпитващият гледа: убеждаване, че пътят е чист в двете посоки преди започване; три контролирани движения с пешеходна скорост; оглеждане назад преди задния ход; краен резултат — обърната посока, без опрян бордюр и без излишни корекции. Прекъсни и пропусни, ако се появи участник.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
      { level: 5, toleranceScale: 0.8 }, // L5: по-тесен коридор — прецизност
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-maneuver-uturn — „Обръщане в едно движение" (обратен завой на широк
// булевард; doc 72 OV-17 „Обратен завой") on the committed
// wb-boulevard-v1 wide street. The SAME shipped threePointTurn objective as the
// 3-point turn, but on a WIDER carriageway the reversal completes in ONE smooth
// forward arc (movements = 1 → best economy) instead of three shunts.
// ---------------------------------------------------------------------------

/** Northbound OUTER-lane center of wb-boulevard-v1 (2 lanes × 8.125 m, outer). */
const BLVD_LANE_OUT = 12.19;
/** обръщане corridor centre on the boulevard (mid-block, no junction near). */
const UTURN_Y = 76;

/**
 * OV-17 — обръщане в едно движение (ЗДвП чл. 38: обратен завой е разрешен
 * там, където не е забранен и водачът има видимост; на широко платно се
 * извършва наведнъж — в една дъга, без движение назад). The wide-street
 * counterpart of sc-maneuver-3point: same maneuver, fewer movements.
 */
export const SC_MANEUVER_UTURN: ScenarioSpec = {
  id: "sc-maneuver-uturn",
  family: "parking",
  tagsBg: ["обръщане", "в едно движение", "широк булевард", "обратен завой", "изпитни упражнения"],
  titleBg: "Обръщане в едно движение на широк булевард",
  objectiveBg:
    "Обърни посоката на 180° на широкия булевард в ЕДНА плавна дъга — без връщане назад: широкото платно позволява завоят да се направи наведнъж, с оглеждане преди започване и без да опреш бордюра.",
  // Doc-72 provenance: OV-17 „Обратен завой" (the U-turn maneuver itself; чл. 38
  // legal execution). PK-12 „Обръщане в три хода" dropped — that is the THREE-
  // move turn, whereas this is a single forward-arc U-turn on a wide street.
  archetypeIds: ["OV-17"],
  conceptIds: ["c-u-turn", "c-maneuver-principles", "c-mirrors-blind-spots", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Mirrored in wb-boulevard-v1.json meta.scenario.params (gen_wide_boulevard.mjs).
    params: { lengthM: 200, maxspeedKmh: 40, lanes: 4 },
    districtId: "wb-boulevard-v1",
  },
  start: {
    spawnPointId: "wb-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Приближи мястото за обръщане в дясната лента и спри спокойно, без бързане." },
    {
      n: 2,
      textBg:
        "Убеди се, че булевардът е чист в двете посоки — обръщането се прекъсва, ако се появи кола или пешеходец.",
    },
    {
      n: 3,
      textBg:
        "Тук платното е широко: завърти волана наляво и опиши ЕДНА плавна дъга през насрещните ленти — без връщане назад.",
    },
    {
      n: 4,
      textBg:
        "Води колата бавно, с пешеходна скорост, и следи докъде стигат предницата и задницата — дъгата не бива да опира отсрещния бордюр.",
    },
    {
      n: 5,
      textBg: "Изправи волана по обратната посока и спри спокойно в дясната лента — вече си обърнал на 180° наведнъж.",
    },
  ],
  success: [
    {
      id: "sc-utn-approach",
      titleBg: "Приближи мястото за обръщане и спри",
      // Pull-up pose in the right (outer) lane at the turn corridor.
      params: { kind: "reachZone", x: BLVD_LANE_OUT, y: 64, radiusM: 9, maxSpeedKmh: 20 },
    },
    {
      id: "sc-utn-turn",
      titleBg: "Обърни посоката на 180° в едно движение",
      // Corridor-locked threePointTurn (Наредба-38): reversed travel direction,
      // at rest inside the turn box facing back. On this WIDE boulevard the
      // reversal is a single forward arc — the evaluator reports movements = 1.
      params: {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: { x: 0, y: UTURN_Y, halfWidthM: 15, halfLengthM: 14 },
        startHeadingDeg: 0,
        toleranceDeg: 20,
        holdSec: 0.6,
      },
    },
  ],
  rubric: {
    // Economy = direction-change movements. A clean single-arc U-turn on a wide
    // street is ONE movement (no reverse shunt); two is still acceptable, a
    // reversal-heavy turn on this wide road is over-worked.
    economy: { objectiveId: "sc-utn-turn", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    parTimeSec: 45,
  },
  // RECORDED: committed deterministic recordings of traces/scManeuverUturn.ts;
  // the §5 gate (shadow replays ZERO violations + completes threePointTurn in ONE
  // movement) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-maneuver-uturn-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-maneuver-uturn/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-maneuver-uturn/mistake-wide.trace.json" },
      titleBg: "Твърде широка дъга",
      whatWentWrongBg:
        "Дъгата тръгна прекалено плитко и предницата излезе на отсрещния бордюр. Дори на широк булевард обръщането има граница — завърти волана достатъчно и гледай докъде стига колата, за да останеш в платното.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-maneuver-uturn/mistake-swing.trace.json" },
      titleBg: "Замах надясно към близкия бордюр",
      whatWentWrongBg:
        "Колата се засили надясно „за да вземе повече място“ и закачи близкия бордюр още преди завоя. Обръщането се започва от лентата — широкото платно дава мястото, не замахът към бордюра.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Когато трябва да смениш посоката на 180° по широк булевард без кръстовище или кръгово наблизо. Достатъчно широкото платно позволява обръщане наведнъж — по-бързо и по-плавно от завоя в три точки.",
    whyBg:
      "Обръщането пресича насрещните ленти и е сред по-рисковите ниско-скоростни маневри. Който първо се убеди, че платното е чисто в двете посоки, и после опише една контролирана дъга с пешеходна скорост, не блокира движението и не опира бордюр.",
    lawRef: "ЗДвП чл. 38",
    examinerBg:
      "Изпитващият гледа: убеждаване, че пътят е чист в двете посоки преди започване; една плавна дъга с пешеходна скорост; краен резултат — обърната посока в дясната лента, без опрян бордюр и без излишни връщания. Прекъсни и пропусни, ако се появи участник.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The maneuver templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_MANEUVER: readonly ScenarioSpec[] = [
  SC_MANEUVER_3POINT,
  SC_MANEUVER_UTURN,
];
