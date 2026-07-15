/**
 * Scenario templates — the LANE-DISCIPLINE family, S3 batch 5 (doc 72 §10
 * „Family OV — Overtaking, lane discipline & on-road maneuvers"): three ✅ FULL
 * lane-discipline archetypes staged on purpose-built micro-maps, DATA ONLY in
 * the templates.ts mold (coordinates denormalized from the committed district
 * files so nothing loads world JSON at runtime; the trace-gate batteries assert
 * every pinned value against the generated maps):
 *
 *  - sc-ov-keep-right    „Дръж вдясно"                (OV-11, ov-keepright-v1)
 *  - sc-ov-lane-keeping  „Движение в средата на лентата" (OV-12 + OV-04, ov-lane-v1)
 *  - sc-ov-oneway        „Еднопосочна улица"           (OV-13, ov-oneway-v1)
 *
 * Each is a pure lane/position drive: NO staged actor, ambient traffic ZERO
 * (seed 7), so the ONLY thing the rule engine can grade is the driver's own
 * lane choice / lateral position / direction of travel. Each mistake demo cites
 * SHIPPED rules-catalog codes and grades EXACTLY them, with NO extra codes, when
 * replayed through the production stack (the §5/§9 gates, traces/__tests__/
 * sc-ov-*-traces.test.ts):
 *   - OV-11 → NOT_KEEPING_RIGHT (второстепенна: движение в лявата лента без
 *     причина — the keep-right detector, laneId > 0 on a multi-lane road for
 *     the 12 s sustain, left-indicator exempt);
 *   - OV-12 → POOR_LANE_KEEPING (второстепенна: trailing off-centre / on the
 *     lane edge — the lane-keep detector on |laneOffsetM|);
 *   - OV-04 → CENTER_LINE_TOUCHED (второстепенна: „настъпване на осевата линия"
 *     — the two-way + leftmost-lane + offset-toward-oncoming detector);
 *   - OV-13 → WRONG_WAY (опасна: движение срещу еднопосочна — the oneway+heading
 *     detector).
 *
 * The shadow drives disciplined and clean and earns the family positive
 * CLEAN_DRIVING (a sustained violation-free streak).
 *
 * Family: "lanes" — the existing catalog chip (doc 76 §2); the ids
 * (sc-ov-*) match the sc-<family/topic>-<slug> naming standard and ID_RE.
 *
 * Doc-72 provenance: OV-11/OV-12/OV-04/OV-13 are the "Engine: ✅ FULL"
 * lane-discipline archetypes gradable from the shipped lane/position telemetry.
 * OV-01/OV-02 (mirror/indicator) already ship as sc-lane-change; OV-03/05/06/08/
 * 10/14/16/18 need oncoming streams / an actor / a legality-zone map layer and
 * are 🟡 PARTIAL or 🔴 NEW — skipped for later waves.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the ov-*-district batteries assert the copies match the maps)
// ---------------------------------------------------------------------------

/** ov-keepright-v1 (2+2 boulevard): the right (cruise) and left (hog) centers. */
const KR_RIGHT = 12.19;
const KR_LEFT = 4.06;
/** ov-lane-v1 (1+1 street): the single lane center of the northbound bank. */
const LN_CENTER = 4.06;
/** ov-oneway-v1 (single-lane one-way): the lane centers on the polyline. */
const OW_CENTER = 0;

// ---------------------------------------------------------------------------
// 1. sc-ov-keep-right — „Дръж вдясно" (OV-11) on ov-keepright-v1
//    (360 m 2+2 boulevard, limit 50)
// ---------------------------------------------------------------------------

/** OV-11 — движение във възможно най-дясната свободна лента (ЗДвП чл. 15:
 *  извън изпреварване водачът се движи възможно най-вдясно). */
export const SC_OV_KEEP_RIGHT: ScenarioSpec = {
  id: "sc-ov-keep-right",
  family: "lanes",
  tagsBg: ["ленти", "дръж вдясно", "лентова дисциплина", "булевард"],
  titleBg: "Дръж вдясно",
  objectiveBg:
    "Измини булеварда в дясната лента — лявата е за изпреварване, не за пътуване. Извън маневра се движи във възможно най-дясната свободна лента.",
  archetypeIds: ["OV-11"],
  conceptIds: ["c-right-side-rule", "c-lane-choice", "c-overtaking-procedure"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-keepright-v1.json meta.scenario.params
    // (tools/maps/gen_ov_keepright.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ov-keepright-v1",
  },
  start: {
    spawnPointId: "ov-kr-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда и се установи в дясната лента с постоянна скорост." },
    { n: 2, textBg: "Дясната лента е твоята лента за пътуване — дръж се в нея, докато няма причина да я напуснеш." },
    { n: 3, textBg: "Лявата лента е само за изпреварване или за ляв завой — влизаш в нея с мигач, изпреварваш и се прибираш." },
    { n: 4, textBg: "Не оставай в лявата лента „за всеки случай“ — зад теб се събира колона, която не може да те подмине отдясно законно." },
    { n: 5, textBg: "Продължи в дясната лента до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovkr-cruise",
      titleBg: "Установи се в дясната лента",
      // Radius 4 < the 8.125 m lane pitch: the zone is satisfiable ONLY from
      // the RIGHT lane center — staying right is the drill itself.
      params: { kind: "reachZone", x: KR_RIGHT, y: 170, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovkr-finish",
      titleBg: "Стигни края на отсечката в дясната лента",
      params: { kind: "reachZone", x: KR_RIGHT, y: 330, radiusM: 4 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvKeepRight.ts; gates in traces/__tests__/sc-ov-keep-right-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-keep-right/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-keep-right/mistake-hog.trace.json" },
      titleBg: "Висене в лявата лента",
      whatWentWrongBg:
        "Колата се движеше в лявата лента през цялата отсечка, при свободна дясна — без да изпреварва. Лявата лента не е за пътуване: извън изпреварване се движиш във възможно най-дясната свободна лента (чл. 15), иначе събираш колона зад себе си.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-keep-right/mistake-slow-hog.trace.json" },
      titleBg: "Бавно в лявата лента",
      whatWentWrongBg:
        "Водачът се настани в лявата лента и се движеше по-бавно от потока, „за да е спокоен“ — и запуши бързата лента. По-бавното движение в лявата лента е същата грешка: мястото ти е вдясно, а лявата се освобождава за по-бързите.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
  ],
  teach: {
    whenBg:
      "На всеки булевард и многолентов път с повече от една лента в посока. Правилото е просто: пътуваш в най-дясната свободна лента, а лявата ползваш само за да изпревариш или да завиеш наляво — и веднага се прибираш.",
    whyBg:
      "Висенето в лявата лента запушва потока и тласка другите да те изпреварват отдясно — най-опасния вид изпреварване. „Дръж вдясно“ не е учтивост, а закон (чл. 15): подредеността по ленти е това, което прави многолентовия път по-безопасен от еднолентовия.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи лентовата ти дисциплина: движение в дясната лента, ползване на лявата само за изпреварване или ляв завой и своевременно прибиране вдясно след маневрата. Продължителното висене в лявата лента без причина е второстепенна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-ov-lane-keeping — „Движение в средата на лентата" (OV-12 straddle +
//    OV-04 center-line touch) on ov-lane-v1 (300 m 1+1 street, limit 50)
// ---------------------------------------------------------------------------

/** OV-12 / OV-04 — устойчиво движение в средата на своята лента (ЗДвП чл. 15;
 *  Наредба № 38 — настъпване на осевата линия е второстепенна грешка). */
export const SC_OV_LANE_KEEPING: ScenarioSpec = {
  id: "sc-ov-lane-keeping",
  family: "lanes",
  tagsBg: ["ленти", "средата на лентата", "осева линия", "лентова дисциплина"],
  titleBg: "Движение в средата на лентата",
  objectiveBg:
    "Измини улицата, като държиш колата устойчиво в средата на своята лента — нито върху осевата линия към насрещните, нито опряна до бордюра.",
  // Doc-72 provenance: OV-12 (lane straddling / off-centre positioning) +
  // OV-04 (touching the center line toward oncoming — the „настъпване" tier).
  archetypeIds: ["OV-12", "OV-04"],
  conceptIds: ["c-lane-choice", "c-longitudinal-markings", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-lane-v1.json meta.scenario.params
    // (tools/maps/gen_ov_lanekeep.mjs).
    params: { lengthM: 300, maxspeedKmh: 50 },
    districtId: "ov-lane-v1",
  },
  start: {
    spawnPointId: "ov-ln-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и се установи в средата на своята лента." },
    { n: 2, textBg: "Гледай далеч напред по средата на лентата, не в предния капак — колата отива там, където гледаш." },
    { n: 3, textBg: "Не се притискай към осевата линия — оттам навлизаш в пространството на насрещните." },
    { n: 4, textBg: "Не се долепяй и до бордюра — дръж равномерно разстояние от двете страни на лентата." },
    { n: 5, textBg: "Задръж средата на лентата с малки, ранни корекции до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovln-middle",
      titleBg: "Дръж средата на лентата",
      params: { kind: "reachZone", x: LN_CENTER, y: 150, radiusM: 5, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovln-finish",
      titleBg: "Стигни края на отсечката центрирано в лентата",
      params: { kind: "reachZone", x: LN_CENTER, y: 270, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvLaneKeeping.ts; gates in traces/__tests__/
  // sc-ov-lane-keeping-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-lane-keeping/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-lane-keeping/mistake-straddle.trace.json" },
      titleBg: "Возене встрани от средата",
      whatWentWrongBg:
        "Колата се движеше трайно встрани от средата на лентата — опряна до дясната маркировка. Неустойчивото движение в лентата те прави непредвидим за другите и изяжда страничния резерв; дръж средата с ранни, малки корекции на волана.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-lane-keeping/mistake-center-line.trace.json" },
      titleBg: "Настъпване на осевата линия",
      whatWentWrongBg:
        "Колата се движеше трайно върху осевата линия, към насрещното движение. Настъпването на осевата линия е класическа второстепенна грешка на изпита — навлизаш в пространството на насрещните. Дръж се в средата на своята лента.",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
  ],
  teach: {
    whenBg:
      "През цялото време на движение по права отсечка и в завой — най-вече по тесни улици с една лента в посока, където осевата линия е на ръка разстояние от колелото.",
    whyBg:
      "Средата на лентата е позицията с най-голям страничен резерв от двете страни. Настъпването на осевата линия те вкарва в пътя на насрещните, а долепянето до бордюра — в пътя на пешеходци и паркирани коли. Предвидимата, центрирана траектория е и по-спокойна за управление.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи траекторията ти в лентата: устойчиво движение по средата, без настъпване на осевата линия и без долепяне до бордюра. Настъпването на осевата линия и неустойчивото водене в лентата се отбелязват като второстепенни грешки.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-ov-oneway — „Еднопосочна улица" (OV-13) on ov-oneway-v1
//    (300 m single-lane one-way, limit 50)
// ---------------------------------------------------------------------------

/** OV-13 — движение по еднопосочна улица само по посока на движението (ЗДвП
 *  чл. 6; знак В2 „Влизането забранено"). */
export const SC_OV_ONEWAY: ScenarioSpec = {
  id: "sc-ov-oneway",
  family: "lanes",
  tagsBg: ["ленти", "еднопосочна улица", "посока на движение", "знак В2"],
  titleBg: "Еднопосочна улица",
  objectiveBg:
    "Мини по еднопосочната улица само по посока на движението — влизаш откъм разрешения вход и никога срещу насрещния поток.",
  archetypeIds: ["OV-13"],
  conceptIds: ["c-sign-groups", "c-prohibition-signs", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oneway-v1.json meta.scenario.params
    // (tools/maps/gen_ov_oneway.mjs).
    params: { lengthM: 300, maxspeedKmh: 50 },
    districtId: "ov-oneway-v1",
  },
  start: {
    spawnPointId: "ov-ow-spawn-entry",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влез в еднопосочната улица по посока на движението и се движи спокойно в лентата." },
    { n: 2, textBg: "Оглеждай знаците на входа на всяка улица: В2 „Влизането забранено“ значи, че оттам не влизаш." },
    { n: 3, textBg: "По еднопосочна се движиш само по разрешената посока — насрещните нямат как да те очакват." },
    { n: 4, textBg: "Ако по грешка си влязъл срещу движението, спри веднага, включи аварийните и излез внимателно." },
    { n: 5, textBg: "Продължи по посока на движението до края на улицата." },
  ],
  success: [
    {
      id: "sc-ovow-flow",
      titleBg: "Движи се по посока на движението",
      params: { kind: "reachZone", x: OW_CENTER, y: 150, radiusM: 6, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovow-finish",
      titleBg: "Стигни края на улицата по разрешената посока",
      params: { kind: "reachZone", x: OW_CENTER, y: 270, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvOneWay.ts; gates in traces/__tests__/sc-ov-oneway-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-oneway/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-oneway/mistake-wrong-way.trace.json" },
      titleBg: "Срещу движението по еднопосочна",
      whatWentWrongBg:
        "Колата навлезе в еднопосочната улица срещу разрешената посока — покрай знака В2 „Влизането забранено“. Движението срещу еднопосочното е сред най-опасните грешки и прекратява изпита: насрещните нямат как да те очакват.",
      codeRefs: ["WRONG_WAY"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-oneway/mistake-wrong-way-short.trace.json" },
      titleBg: "Кратко в грешната посока",
      whatWentWrongBg:
        "Водачът пое срещу движението само за няколко метра — „колкото да стигне до входа“ — но и краткото движение срещу еднопосочното е същата опасна грешка. По еднопосочна се влиза и се движи единствено по посока на движението.",
      codeRefs: ["WRONG_WAY"],
    },
  ],
  teach: {
    whenBg:
      "На всяка еднопосочна улица — гъсти в центъра и кварталите. Преди да завиеш в която и да е улица, прочети знаците на входа ѝ: В2 „Влизането забранено“ или стрелките на еднопосочното казват откъде се влиза.",
    whyBg:
      "Движението срещу еднопосочното е особено опасно, защото водачите насреща карат с очакването, че никой няма да се появи насреща им — реакцията им закъснява фатално. Затова законът го нарежда сред грешките, които прекратяват изпита начаса.",
    lawRef: "ЗДвП чл. 6",
    examinerBg:
      "Изпитващият следи разчитането на пътните знаци и посоката на движение. Влизане или движение срещу еднопосочна улица е опасна грешка и прекратява изпита незабавно — оглеждай знаците на всеки вход.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The lane-discipline-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_LANES: readonly ScenarioSpec[] = [
  SC_OV_KEEP_RIGHT,
  SC_OV_LANE_KEEPING,
  SC_OV_ONEWAY,
];
