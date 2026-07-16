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
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The maneuver templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_MANEUVER: readonly ScenarioSpec[] = [SC_MANEUVER_3POINT];
