/**
 * Scenario templates — DATA ONLY (the lesson-specs pattern: coordinates are
 * denormalized from the committed district file so nothing loads world JSON
 * at runtime).
 *
 * P0 (doc 76 §10, founder rulings §12): ONE template end-to-end —
 * „Перпендикулярно паркиране на заден ход", the reference image. The template
 * ships with PENDING traces (shadow + 2 mistake demos): the spec validates
 * and compiles today; the S1 trace recorder fills the files and flips
 * `pending` in the same commit (the §5 zero-violation replay gate arms then).
 */

import type { ScenarioSpec } from "./types";
import type { ParkingBaySpec } from "../../contracts";
import { SCENARIO_TEMPLATES_JUNCTIONS } from "./templates-junctions";
import { SCENARIO_TEMPLATES_JUNCTIONS2 } from "./templates-junctions2";
import { PARKING_TEMPLATES } from "./templates-parking";
import { SCENARIO_TEMPLATES_FLOW } from "./templates-flow";
import { SCENARIO_TEMPLATES_PE } from "./templates-pe";
import { SCENARIO_TEMPLATES_SP } from "./templates-sp";
import { SCENARIO_TEMPLATES_FOLLOWING } from "./templates-following";
import { SCENARIO_TEMPLATES_LANES } from "./templates-lanes";

/**
 * The TARGET bay of content/world/lot-perp-v1.json — meta.scenario bay
 * "lot-bay-3" (the only free one in the XX_XX row), copied by value like
 * every lesson pins district coordinates. The templates test asserts this
 * copy matches the generated file byte-for-value, and compileScenario turns
 * it into BOTH the painted rect (LessonSpec.parkingBay) and the graded rect
 * (parkInBay objective) — one truth, the L7 pattern.
 */
export const LOT_PERP_TARGET_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

/**
 * P0 — reverse perpendicular parking (doc-72 PK-02 „Гараж на заден /
 * Perpendicular bay reverse"; the Наредба-38 alternative parking maneuver).
 * Law basis: ЗДвП чл. 40 (движение назад — водачът е длъжен да се убеди, че
 * пътят зад него е свободен и да пропусне останалите участници; the same
 * ref content/concepts.json c-reversing cites), maneuvering duties ЗДвП
 * чл. 25 (c-maneuver-principles).
 */
export const SC_PARK_PERP_REV: ScenarioSpec = {
  id: "sc-park-perp-rev",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "перпендикулярно", "изпитни упражнения"],
  titleBg: "Перпендикулярно паркиране на заден ход",
  objectiveBg:
    "Паркирай на заден ход в свободното перпендикулярно място между паркирани коли — с оглеждане преди и по време на маневрата, точно в очертанията и с възможно най-малко корекции.",
  // Doc-72 provenance: PK-02 IS this maneuver (перпендикулярно паркиране на
  // заден ход, supermarket-lot geometry, swing-out awareness).
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // The generator recipe — mirrored in lot-perp-v1.json meta.scenario.params
    // (tools/maps/gen_parking_lot.mjs; the founder's reference image: 2.7 m
    // perpendicular bay, 4 occupied neighbors around one free bay).
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-perp-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    // The drill starts at the skill (engine running, D); L4 flips to the
    // full cold-start exam protocol below.
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч." },
    {
      n: 2,
      textBg:
        "Подмини свободното място и спри, когато задната броня подмине съседната кола — дръж около метър и половина странично разстояние от реда.",
    },
    {
      n: 3,
      textBg:
        "Включи на задна. Огледай се — двете огледала, после през рамо — и чак тогава започни да завиваш докрай към мястото.",
    },
    {
      n: 4,
      textBg:
        "Движи се назад с пешеходна скорост, следи двете съседни коли в огледалата и изправяй волана, щом колата се подравни с очертанията.",
    },
    {
      n: 5,
      textBg:
        "Спри напълно вътре в очертанията — центрирано и успоредно на линиите — и задръж колата в покой.",
    },
  ],
  success: [
    {
      id: "sc-ppr-position",
      titleBg: "Заеми изходна позиция покрай свободното място",
      // The pull-past pose on the aisle just north of the target bay
      // (lot-perp-v1: aisle centerline x = 0, bay row center y = 0): reaching
      // it slowly is the setup the instructions teach. Coordinates pinned to
      // content/world/lot-perp-v1.json like every lesson pins its district.
      params: { kind: "reachZone", x: 0, y: 6, radiusM: 7, maxSpeedKmh: 15 },
    },
    {
      id: "sc-ppr-park",
      titleBg: "Паркирай на заден ход в очертаното място и спри напълно",
      // Bay-locked parkInBay (A10): at rest INSIDE the free bay, aligned,
      // via reverse, held 1.5 s. Tolerances are the evaluator defaults at
      // L3/L4; L1/L2 widen them via toleranceScale (compile).
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_PERP_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-ppr-park" },
    // German Grundfahraufgaben codify > 2 correction pulls as a fault
    // (doc 72 PK-01/PK-02 evidence): 1 entry = clean, 2 = acceptable.
    economy: { objectiveId: "sc-ppr-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на движението на заден ход" },
        { id: "obs-final-check", titleBg: "Контролен поглед към съседните коли преди окончателното спиране" },
      ],
    },
    parTimeSec: 90,
  },
  // RECORDED (S1): the committed files are deterministic recordings of the
  // authored scripts in traces/scParkPerpRev.ts; the §5 gate (replays with
  // ZERO violations + completes parkInBay) and the §9 stage-5 code asserts
  // run in traces/__tests__/sc-park-perp-rev-traces.test.ts. Re-record with
  // RECORD_TRACES=1 (see that file's header) after any engine/script change.
  shadow: { path: "content/traces/sc-park-perp-rev/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-perp-rev/mistake-wide-approach.trace.json",
      },
      titleBg: "Твърде широк подход",
      whatWentWrongBg:
        "Подходът започна твърде далеч от реда и завоят на заден ход подряза съседната кола — ъгълът на въртене не стигна и задницата навлезе в чуждото място.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-perp-rev/mistake-no-observation.trace.json",
      },
      titleBg: "Заден ход без наблюдение",
      whatWentWrongBg:
        "Задната скорост влезе без оглеждане в огледалата и през рамо — пешеходец, минаващ зад колата, остана невидим до самия удар. Чл. 40 изисква да се убедиш, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато паркираш перпендикулярно — в паркинг на магазин, пред блока или на изпита. На заден ход колата завива по-остро и виждаш по-добре мястото, затова обратното паркиране е и по-безопасно при потегляне после.",
    whyBg:
      "Повечето леки удари в паркингите стават при заден ход без оглеждане или с подценен замах на предницата. Който владее задното паркиране, контролира и мъртвите зони, и габаритите на колата — умение, което спасява ламарини и пешеходци всеки ден.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа три неща: непрекъснато наблюдение (огледала + рамо, преди и по време на маневрата), контролирана пешеходна скорост и краен резултат в очертанията без излишни корекции. Прекъсни маневрата и пропусни, ако се появи пешеходец или кола.",
  },
  levels: [
    {
      level: 1,
      // Воден опит: widest tolerances + the full aid set (ladder default).
      toleranceScale: 1.5,
    },
    {
      level: 2,
      // Частична помощ: ribbon + idle hints (ladder default), mild widening.
      toleranceScale: 1.25,
    },
    {
      level: 3,
      // Самостоятелно: evaluator defaults, no aids.
    },
    {
      level: 4,
      // Изпитни условия: examMode (ladder), full cold-start protocol.
      vehicleStart: "cold",
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** Every authored template, id-unique (the assembly line appends here —
 *  one line per family file, each owned by its wave). */
export const SCENARIO_TEMPLATES: readonly ScenarioSpec[] = [
  SC_PARK_PERP_REV,
  ...PARKING_TEMPLATES,
  ...SCENARIO_TEMPLATES_FLOW,
  ...SCENARIO_TEMPLATES_JUNCTIONS,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
  ...SCENARIO_TEMPLATES_PE,
  ...SCENARIO_TEMPLATES_SP,
  ...SCENARIO_TEMPLATES_FOLLOWING,
  ...SCENARIO_TEMPLATES_LANES,
];

/** Lookup by template id; undefined for unknown ids. */
export function scenarioById(id: string): ScenarioSpec | undefined {
  return SCENARIO_TEMPLATES.find((s) => s.id === id);
}
