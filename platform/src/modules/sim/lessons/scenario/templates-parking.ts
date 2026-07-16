/**
 * Scenario templates — PARKING family, S2-A breadth wave (doc 76 §9; the
 * sc-park-perp-rev mold). DATA ONLY: every coordinate is denormalized from
 * its committed lot district so nothing loads world JSON at runtime; the
 * templates test asserts each pinned bay matches the generator's
 * meta.scenario truth value-for-value.
 *
 * Three templates on gen_parking_lot.mjs variants (no new archetypes):
 *   sc-park-parallel — „Успоредно паркиране"  (lot-par-v1,    PK-01)
 *   sc-park-45       — „Паркиране на 45°"     (lot-45-v1,     PK-02)
 *   sc-park-narrow   — „Тясно гнездо"          (lot-narrow-v1, PK-02)
 *
 * Traces are RECORDED (the §5 gate + §9 stage-5 code asserts run in
 * traces/__tests__/sc-park-*-traces.test.ts; re-record with RECORD_TRACES=1).
 */

import type { ScenarioSpec } from "./types";
import type { ParkingBaySpec } from "../../contracts";

// ---------------------------------------------------------------------------
// Pinned target bays (meta.scenario of the committed districts — bay-3, the
// only free one in every XX_XX row; copied by VALUE, the lesson-specs law)
// ---------------------------------------------------------------------------

/** content/world/lot-par-v1.json — free parallel slot between two parked cars. */
export const LOT_PAR_TARGET_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 0,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 5.5,
};

/** content/world/lot-45-v1.json — free echelon bay, axis 45° to the aisle. */
export const LOT_45_TARGET_BAY: ParkingBaySpec = {
  x: 4.8,
  y: 0,
  headingDeg: 45,
  widthM: 2.7,
  lengthM: 5,
};

/** content/world/lot-narrow-v1.json — the 2.5 m tight pocket, both neighbors occupied. */
export const LOT_NARROW_TARGET_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.5,
  lengthM: 5,
};

// ---------------------------------------------------------------------------
// sc-park-parallel — „Успоредно паркиране" (doc-72 PK-01: THE Наредба-38
// required maneuver; reverse entry off two reference-point turns)
// ---------------------------------------------------------------------------

export const SC_PARK_PARALLEL: ScenarioSpec = {
  id: "sc-park-parallel",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "успоредно", "изпитни упражнения"],
  titleBg: "Успоредно паркиране",
  objectiveBg:
    "Паркирай на заден ход в успоредното място между двете паркирани коли — по трите ориентира на учебната маневра, с непрекъснато наблюдение и възможно най-малко корекции.",
  // Doc-72 provenance: PK-01 IS reverse parallel parking (Н38 required
  // maneuver, graded on control, observation and result).
  archetypeIds: ["PK-01"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-par-v1.json meta.scenario.params (gen_parking_lot.mjs
    // angle "parallel": street-side slots along the east curb, 6.5 m pitch).
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 5.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-par-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч." },
    {
      n: 2,
      textBg:
        "Спри успоредно на предната кола, на половин до един метър странично — задната ти броня изравнена с нейната задна броня. Това е ориентир 1.",
    },
    {
      n: 3,
      textBg:
        "Включи на задна. Огледай се — двете огледала, после през рамо — и завърти волана докрай надясно.",
    },
    {
      n: 4,
      textBg:
        "Върни бавно назад, докато колата застане под около 45° към реда. Това е ориентир 2.",
    },
    {
      n: 5,
      textBg:
        "Щом предната ти броня подмине задната броня на предната кола, завърти докрай наляво и продължи назад. Това е ориентир 3.",
    },
    {
      n: 6,
      textBg:
        "Изправи колата успоредно на линиите, центрирай се в мястото и спри напълно.",
    },
  ],
  success: [
    {
      id: "sc-ppl-position",
      titleBg: "Заеми изходна позиция до предната кола",
      // The pull-up pose beside the lead car (lot-par-v1: aisle centerline
      // x = 0, slot row on the east curb) — reached slowly, like the
      // instructions teach. Pinned to content/world/lot-par-v1.json.
      params: { kind: "reachZone", x: 0, y: 6, radiusM: 7, maxSpeedKmh: 15 },
    },
    {
      id: "sc-ppl-park",
      titleBg: "Паркирай на заден ход в успоредното място и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_PAR_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-ppl-park" },
    // German Grundfahraufgaben: > 2 correction pulls = a codified fault
    // (doc-72 PK-01 evidence) — 1 entry clean, 2 acceptable.
    economy: { objectiveId: "sc-ppl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 110,
  },
  shadow: { path: "content/traces/sc-park-parallel/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-parallel/mistake-far-from-lead.trace.json",
      },
      titleBg: "Твърде далеч от предната кола",
      whatWentWrongBg:
        "Изходната позиция започна на близо два метра от предната кола — геометрията на маневрата се разпадна: ъгълът не стигна до бордюра и при опита за корекция задницата удари задната кола. Правилно: около половин метър странично от съседа.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-parallel/mistake-no-observation.trace.json",
      },
      titleBg: "Заден ход без наблюдение",
      whatWentWrongBg:
        "Задната скорост влезе без оглеждане в огледалата и през рамо — пешеходец, минаващ зад колата, остана невидим до самия удар. Чл. 40 изисква да се убедиш, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато паркираш край тротоара между две коли — в квартала, пред офиса и на изпита. Успоредното паркиране на заден ход е задължителната маневра по Наредба 38 и най-честата градска маневра изобщо.",
    whyBg:
      "Правилното странично разстояние и три прости ориентира превръщат „невъзможното“ място във влизане от първи опит. Който владее ориентирите, не блокира улицата, не опира бордюра и не гадае къде е задницата на колата.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа изходната позиция (успоредно, на половин до един метър), непрекъснатото наблюдение преди и по време на задния ход, и крайния резултат — в очертанията, успоредно, без повече от една корекция. Прекъсни маневрата, ако се появи пешеходец или кола.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
      { level: 5, toleranceScale: 0.8 }, // L5: по-строг допуск — прецизно прибиране
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-45 — „Паркиране на 45°" (doc-72 PK-02 echelon variant: forward
// entry into an angled bay; the swing-awareness drill)
// ---------------------------------------------------------------------------

export const SC_PARK_45: ScenarioSpec = {
  id: "sc-park-45",
  family: "parking",
  tagsBg: ["паркиране", "косо място", "преден ход", "прецизност"],
  titleBg: "Паркиране на 45°",
  objectiveBg:
    "Влез напред в косото място под 45° с един плавен завой — без да подрязваш ъгъла на съседната кола и без да подминаваш линията на гнездото.",
  // Doc-72 provenance: PK-02 covers bay parking in lot geometry with
  // swing-out awareness — the echelon row is its angled variant.
  archetypeIds: ["PK-02"],
  conceptIds: ["c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-45-v1.json meta.scenario.params (angle "45": echelon
    // bays opening toward the northbound aisle).
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "45",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-45-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч." },
    {
      n: 2,
      textBg:
        "Дръпни се леко вляво в алеята и намали до пешеходна скорост — косото място се отваря надясно пред теб.",
    },
    {
      n: 3,
      textBg: "Огледай се — дясното огледало, после през рамо — и пусни десен мигач.",
    },
    {
      n: 4,
      textBg:
        "Завий плавно надясно, щом предната броня се изравни с близкия ъгъл на мястото, и влез напред под 45° — следи съседната кола в дясното огледало.",
    },
    {
      n: 5,
      textBg:
        "Изправи волана по посоката на линиите и спри центрирано в очертанията, без да подминаваш крайната линия.",
    },
  ],
  success: [
    {
      id: "sc-p45-position",
      titleBg: "Заеми изходна позиция преди косото място",
      // The wide-left setup on the aisle just before the echelon row
      // (lot-45-v1: row starts at y ≈ −7.6). Pinned to the district file.
      params: { kind: "reachZone", x: 0, y: -8, radiusM: 7, maxSpeedKmh: 15 },
    },
    {
      id: "sc-p45-park",
      titleBg: "Влез напред в косото място и спри напълно",
      // S2 forward-entry gate: the bay entry itself must happen in a forward
      // gear (entry "forward") — the echelon drill is nose-in by design.
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_45_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
        entry: "forward",
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-p45-park" },
    economy: { objectiveId: "sc-p45-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    // No observation moments: the v1 observation mapper anchors on a REVERSE
    // phase (parking-family window model) — a forward drill would surface a
    // permanently unmeasured channel instead of honest data.
    parTimeSec: 75,
  },
  shadow: { path: "content/traces/sc-park-45/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-45/mistake-overshoot.trace.json",
      },
      titleBg: "Подмината линия на гнездото",
      whatWentWrongBg:
        "Влизането продължи твърде дълбоко — предната броня подмина крайната линия на гнездото и предното колело опря в бордюра. Ориентирът е прост: спри, щом линиите отстрани застанат успоредно на колата, не когато бордюрът те спре.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-45/mistake-corner-cut.trace.json",
      },
      titleBg: "Подрязан ъгъл на съседа",
      whatWentWrongBg:
        "Завоят започна твърде рано и диагоналът мина твърде близо до съседното място — страницата на колата закачи ъгъла на паркирания съсед с пешеходна скорост. В паркинга и 2 км/ч са удар: отвори завоя и дръж метър до реда.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На косите паркинги пред магазини, покрай булеварди и в подземни гаражи — навсякъде, където местата са начертани под ъгъл и се влиза напред, по посоката на движение.",
    whyBg:
      "Косото място прощава по-малко, отколкото изглежда: подранил завой подрязва съседа, закъснял — качва колата на линията. Един плавен завой с точен момент на завиване е разликата между едно движение и три корекции с чакаща колона отзад.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа момента на завиване (предната броня срещу близкия ъгъл на мястото), плавната крива с пешеходна скорост и крайния резултат — центрирано в очертанията, без опрян бордюр и без навлизане в съседното място.",
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

// ---------------------------------------------------------------------------
// sc-park-narrow — „Тясно гнездо" (doc-72 PK-02 at bayWidth 2.5: the hard
// variant of the P0 maneuver — steeper swing, tighter rubric)
// ---------------------------------------------------------------------------

export const SC_PARK_NARROW: ScenarioSpec = {
  id: "sc-park-narrow",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "тясно място", "прецизност"],
  titleBg: "Тясно гнездо",
  objectiveBg:
    "Паркирай на заден ход в тясното 2,5-метрово място между двете коли — с по-стръмен замах от обичайния, непрекъснато наблюдение и точно центриране в очертанията.",
  // Doc-72 provenance: PK-02 (perpendicular bay reverse) — the tight-pocket
  // parameter variant, both neighbors occupied.
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-narrow-v1.json meta.scenario.params (angle "90" at
    // bayWidth 2.5 — the doc-76 §2 tight rung of the P0 recipe).
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-narrow-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч." },
    {
      n: 2,
      textBg:
        "Подмини тясното място и спри, когато задната броня подмине съседната кола — дръж около метър странично разстояние от реда.",
    },
    {
      n: 3,
      textBg:
        "Включи на задна. Огледай се — двете огледала, после през рамо — и завий към мястото с по-стръмна дъга от обичайната: в тясното гнездо широкият замах закача съседа.",
    },
    {
      n: 4,
      textBg:
        "Движи се назад съвсем бавно и следи двете съседни коли в огледалата — тук грешката се мери в сантиметри.",
    },
    {
      n: 5,
      textBg:
        "Изправи волана, центрирай се точно между линиите и спри напълно в покой.",
    },
  ],
  success: [
    {
      id: "sc-pnr-position",
      titleBg: "Заеми изходна позиция покрай тясното място",
      params: { kind: "reachZone", x: 0, y: 6, radiusM: 7, maxSpeedKmh: 15 },
    },
    {
      id: "sc-pnr-park",
      titleBg: "Паркирай на заден ход в тясното място и спри напълно",
      // Tighter than the P0 rubric (0.5 m / 10°): the 2.5 m pocket leaves
      // 0.4 m per side — the drill IS precision.
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_NARROW_TARGET_BAY,
        centerTolM: 0.35,
        headingTolDeg: 7,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pnr-park" },
    economy: { objectiveId: "sc-pnr-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на движението на заден ход" },
        { id: "obs-final-check", titleBg: "Контролен поглед към съседните коли преди окончателното спиране" },
      ],
    },
    parTimeSec: 100,
  },
  shadow: { path: "content/traces/sc-park-narrow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-narrow/mistake-wide-swing.trace.json",
      },
      titleBg: "Широк замах в тясното място",
      whatWentWrongBg:
        "Дъгата, която работи на широкото място, тук е твърде широка — по средата на завъртането задният калник закачи съседната кола. В тясно гнездо се влиза по-стръмно: по-късен и по-остър завой, с половин око на всяко огледало.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-narrow/mistake-no-observation.trace.json",
      },
      titleBg: "Заден ход без наблюдение",
      whatWentWrongBg:
        "Задната скорост влезе без огледала и без поглед през рамо — пешеходец, минаващ зад колата, остана невидим до самия удар. Чл. 40 изисква да се убедиш, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Пълните градски паркинги, подземните гаражи и „последното останало място“ между два джипа — тясното гнездо е ежедневието на шофьора в големия град.",
    whyBg:
      "Точно в тесните места стават повечето паркинг-удари: широкият замах, който минава на просторното място, тук струва калник. По-стръмен подход, пешеходна скорост и постоянна работа с огледалата правят тясното място рутинно.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа адаптацията: по-късен завой със стръмна дъга, скорост на кретане, непрекъснато наблюдение в двете огледала и краен резултат точно между линиите — без докосване на съседите и без излишни корекции.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 „Усложнени" (doc 76 §7): the same pocket at night in the rain —
    // condition delta only, no new geometry.
    { level: 5, conditions: { weather: "rain", night: true } },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The S2-A parking wave, in catalog order (consumed by the registry line in
 *  templates.ts — one spread, the assembly-line pattern). */
export const PARKING_TEMPLATES: readonly ScenarioSpec[] = [
  SC_PARK_PARALLEL,
  SC_PARK_45,
  SC_PARK_NARROW,
];
