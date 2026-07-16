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

import type { BrakingLeadCarSpec, NarrowMeetingSpec, OncomingStreamSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the ov-*-district batteries assert the copies match the maps)
// ---------------------------------------------------------------------------

/** ov-keepright-v1 (2+2 boulevard): the right (cruise) and left (hog) centers. */
const KR_RIGHT = 12.19;
const KR_LEFT = 4.06;
/** ov-crossing-v1 (2+2 boulevard + a marked crossing at y = 220): the right
 *  (cruise / lead) and left (overtake target) lane centers. */
const OVC_RIGHT = 12.19;
const OVC_LEFT = 4.06;
/** ov-lane-v1 (1+1 street): the single lane center of the northbound bank. */
const LN_CENTER = 4.06;
/** ov-oneway-v1 (single-lane one-way): the lane centers on the polyline. */
const OW_CENTER = 0;
/** ov-ban-v1 (2+2 boulevard, В24 zone @ [90, 210]): the right (cruise / lead)
 *  and left (overtake target) lane centers. */
const OVB_RIGHT = 12.19;
const OVB_LEFT = 4.06;
/** ov-ban-v1: the В24 no-overtaking span along the street (meta.scenario). */
const OVB_BAN_FROM = 90;
const OVB_BAN_TO = 210;

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

// ---------------------------------------------------------------------------
// 4. sc-ov-crossing-overtake — „Изпреварване на пешеходна пътека" (OV-07) on
//    ov-crossing-v1 (320 m 2+2 road with a marked crossing at y = 220, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-ov-crossing-overtake: paces the player's RIGHT
 * lane ~16 m ahead (matchPlayer). Its slam tier is authored out of reach — it
 * is deterministic moving traffic (the car being illegally passed), not a
 * braking drill. The shadow follows it THROUGH the crossing in the right lane
 * (no overtake); the mistake pulls OUT to the left to overtake and then CUTS
 * BACK into the right lane — toward the lead — INSIDE the armed zone. Only the
 * cut-back grades: the OVERTAKING_AT_CROSSING check reads the lead gap at the
 * lane-boundary frame, and a lane change TOWARD the lead's lane keeps it inside
 * the lead-detection corridor at exactly that frame (чл. 119).
 */
const OVC_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-ovc-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ovc-n-start", "ovc-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn
    cruiseSpeedMps: 7,
    extraRightOffsetM: 0, // right-lane center (the lead being cut back in front of)
    colorIndex: 2,
  },
  followGapM: 16, // pace ~16 m AHEAD, matchPlayer — safe from FOLLOWING_TOO_CLOSE, inside the crossing-overtake gate
  maxMatchSpeedMps: 12, // 43 km/h — holds the gap at the ~35 km/h approach
  slamAt: { x: 12.19, y: 520 }, // far past the 320 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** OV-07 — забрана за изпреварване на и непосредствено преди пешеходна пътека
 *  (ЗДвП чл. 119: на пешеходна пътека и преди нея не се изпреварва). */
export const SC_OV_CROSSING_OVERTAKE: ScenarioSpec = {
  id: "sc-ov-crossing-overtake",
  family: "lanes",
  tagsBg: ["ленти", "изпреварване", "пешеходна пътека", "забрана за изпреварване"],
  titleBg: "Изпреварване на пешеходна пътека",
  objectiveBg:
    "Следвай колата пред теб през зоната на пешеходната пътека, без да я изпреварваш — пред пътека не се изпреварва и не се заобикаля: спрялата или намаляваща кола може да пропуска пешеходец, когото ти не виждаш иззад нея.",
  archetypeIds: ["OV-07"],
  conceptIds: ["c-crosswalk-yield", "c-overtaking-procedure", "c-general-care-duty"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in ov-crossing-v1.json meta.scenario.params
    // (tools/maps/gen_ov_crossing.mjs).
    params: { lengthM: 320, crossingY: 220, maxspeedKmh: 50 },
    districtId: "ov-crossing-v1",
  },
  start: {
    spawnPointId: "ovc-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — пред теб в твоята лента се движи друга кола." },
    { n: 2, textBg: "Напред има пешеходна пътека. Пред и на пътека изпреварването е забранено — независимо дали виждаш пешеходец." },
    { n: 3, textBg: "Не се престроявай в лявата лента, за да подминеш предния в зоната на пътеката — намали и остани зад него." },
    { n: 4, textBg: "Ако предният намалява до пътеката, най-вероятно пропуска човек, когото ти не виждаш иззад колата му." },
    { n: 5, textBg: "Мини пътеката зад предната кола и чак след нея, ако е нужно, изпреварвай на разрешено място." },
  ],
  success: [
    {
      id: "sc-ovc-approach",
      titleBg: "Приближи пътеката в дясната лента зад предния",
      params: { kind: "reachZone", x: OVC_RIGHT, y: 170, radiusM: 6, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovc-finish",
      titleBg: "Мини пътеката, без да изпреварваш, и продължи",
      params: { kind: "reachZone", x: OVC_RIGHT, y: 285, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvCrossingOvertake.ts; gates in traces/__tests__/
  // sc-ov-crossing-overtake-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-crossing-overtake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-crossing-overtake/mistake-overtake-in-zone.trace.json" },
      titleBg: "Изпреварване в зоната на пътеката",
      whatWentWrongBg:
        "Колата излезе в лявата лента да изпревари предната и се върна в лентата точно в зоната на пешеходната пътека. Точно там е забранено да изпреварваш и да маневрираш: намаляващата пред теб кола може да пропуска пешеходец, скрит зад нея — престроявайки се на пътеката, влизаш в нея, без да го виждаш. Това е опасна грешка (чл. 119).",
      codeRefs: ["OVERTAKING_AT_CROSSING"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-crossing-overtake/mistake-late-swerve.trace.json" },
      titleBg: "Изпреварване в последния момент",
      whatWentWrongBg:
        "Водачът изчака до последно и започна изпреварването току пред пътеката — престрои се и се върна в лентата дълбоко в зоната на пешеходната пътека. Изпреварването и заобикалянето на пътека са забранени и опасни по същата причина: не виждаш какво пропуска предният.",
      codeRefs: ["OVERTAKING_AT_CROSSING"],
    },
  ],
  teach: {
    whenBg:
      "Пред и на всяка пешеходна пътека — маркирана или на кръстовище. Колкото и бавен да е предният, в зоната на пътеката не го изпреварваш и не го заобикаляш: изчакваш го да я премине.",
    whyBg:
      "Спрялата или намаляваща пред пътека кола почти винаги пропуска пешеходец. Изпреварвайки я, ти влизаш на пътеката с по-висока скорост, без да виждаш човека иззад нея — точно геометрията на най-тежките катастрофи с пешеходци. Затова законът забранява изпреварването на и непосредствено преди пътека.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият следи поведението ти пред пешеходна пътека: намаляване, готовност за спиране и никакво изпреварване или заобикаляне на движещите се пред теб. Изпреварване в зоната на пътека е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [OVC_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The lane-discipline-family templates, in catalog order (registered in
 *  templates.ts). */
// ---------------------------------------------------------------------------
// 5. sc-ov-narrow — „Разминаване в тясна улица" (OV-14) on ov-narrow-v1: a
//    parked row narrows the player's lane to one; an oncoming car meets them —
//    ЗДвП narrow-passage priority: the side WITH the obstruction yields.
// ---------------------------------------------------------------------------

/**
 * The staged narrow meeting: a parked row (two held props) blocks the player's
 * northbound lane through the mid-block section y ∈ [110, 145]; an oncoming car
 * transits southbound, timed by the narrowMeeting runner to meet the player.
 * The obstruction is on the PLAYER's side, so the player must yield (wait at the
 * widening for the oncoming to clear before squeezing past). Barging into the
 * oncoming's lane while it is inbound grades FAILED_TO_YIELD ("narrow-meeting");
 * waiting earns YIELDED_TO_PRIORITY — the reserved vocabulary, no new code.
 */
const NARROW_MEETING: NarrowMeetingSpec = {
  id: "sc-ovn-meeting",
  kind: "narrowMeeting",
  libraryEventId: "OV-14",
  sectionStart: { x: 0, y: 110 },
  sectionEnd: { x: 0, y: 145 },
  obstructionSide: "player",
  actor: {
    pathNodes: ["nm-n-end", "nm-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 40 }, // ~y = 200, before the section
    cruiseSpeedMps: 6,
    colorIndex: 2,
  },
  // Actor's section entrance = the far (north) end, path arc 240 − 145 = 95.
  actorEntry: { nodeIndex: 0, offsetM: 95 },
  armDistM: 70,
  transitSpeedMps: 6,
  props: [
    // Parked row in the PLAYER's (northbound) lane through the section.
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: 120 } },
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: 135 } },
  ],
};

/** OV-14 — разминаване в тясна улица (ЗДвП: при разминаване през стеснение
 *  отстъпва водачът, от чиято страна е препятствието). */
export const SC_OV_NARROW: ScenarioSpec = {
  id: "sc-ov-narrow",
  family: "lanes",
  tagsBg: ["тясна улица", "разминаване", "паркирани коли", "предимство при стеснение"],
  titleBg: "Разминаване в тясна улица",
  objectiveBg:
    "Паркиран ред стеснява твоята лента до една, а насреща идва кола: препятствието е от твоята страна, затова изчакай на разширението и се промъкни в насрещната лента едва след като насрещният премине.",
  archetypeIds: ["OV-14"],
  conceptIds: ["c-maneuver-principles", "c-priority-concept", "c-general-care-duty"],
  map: {
    archetype: "narrow-street",
    // The generator recipe — mirrored in ov-narrow-v1.json meta.scenario.params.
    params: { lengthM: 240, maxspeedKmh: 40 },
    districtId: "ov-narrow-v1",
  },
  start: {
    spawnPointId: "nm-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Улицата е тясна и двупосочна. Напред паркиран ред заема твоята лента — ще трябва да го заобиколиш в насрещната." },
    { n: 2, textBg: "Насреща идва кола. Препятствието е от ТВОЯТА страна, затова предимството е нейно — ти изчакваш." },
    { n: 3, textBg: "Спри на разширението преди стеснението, в своята лента, и пусни насрещния да премине." },
    { n: 4, textBg: "Не се вклинявай в насрещната лента, докато другата кола е още в стеснението — това е отнемане на предимство." },
    { n: 5, textBg: "Щом пътят се освободи, промъкни се покрай паркираните коли и продължи." },
  ],
  success: [
    {
      id: "sc-ovn-wait",
      titleBg: "Изчакай на разширението преди стеснението",
      params: { kind: "reachZone", x: 4.06, y: 100, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-ovn-finish",
      titleBg: "Премини стеснението и стигни края на отсечката",
      params: { kind: "reachZone", x: 4.06, y: 200, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-ov-narrow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-narrow/mistake-barge.trace.json" },
      titleBg: "Вклиняване насреща",
      whatWentWrongBg:
        "Колата се вмъкна в насрещната лента, за да заобиколи паркирания ред, докато насрещният автомобил беше още в стеснението — и той трябваше да спре заради нея. При разминаване през стеснение отстъпва страната, от която е препятствието; тук това си ти.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-narrow/mistake-force.trace.json" },
      titleBg: "Насилване през стеснението",
      whatWentWrongBg:
        "Вместо да изчака, водачът форсира навлизането в стеснението срещу приближаващата кола с предимство. Тясното платно не се дели наполовина: този, от чиято страна е препятствието, изчаква другия да премине пръв.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "По тесни двупосочни улици с паркирани коли — ежедневието в кварталите. Когато паркиран ред заеме твоята лента, заобикалянето му минава през насрещната лента: значи насрещните имат предимство пред теб.",
    whyBg:
      "Тясната улица е място за преценка, не за надпревара: който насила се вклини срещу насрещния, създава задънена ситуация или челен удар. Правилото е просто и спестява нерви и ламарини — от чиято страна е препятствието, той изчаква.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа преценката при стеснение: навременно намаляване, изчакване на разширението от твоята страна и промъкване едва след като насрещният премине. Насилственото навлизане срещу насрещен с предимство е груба грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [NARROW_MEETING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-ov-ban-overtake — „Изпреварване при забрана" (OV-06) on ov-ban-v1
//    (400 m 2+2 boulevard, limit 50, В24 noOvertaking zone @ y ∈ [90, 210] —
//    the FIRST map carrying the ZONE-BAN district data layer, ADR-006 stage 2a)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-ov-ban-overtake: paces the player's RIGHT lane
 * ~16 m ahead (matchPlayer), capped at ~21.6 km/h — the slow vehicle the В24
 * zone tempts you to pass. Its slam tier is authored out of reach (it is
 * deterministic moving traffic, not a braking drill — the OVC_LEAD_CAR mold).
 * The shadow follows it patiently THROUGH the zone and overtakes AFTER the
 * zone ends (a full legal pass: out, past, back — two SAFE_LANE_CHANGEs); the
 * mistakes start the pass INSIDE the zone and cut back toward the lead while
 * the ban is armed. Only the cut-back grades (the OV-07 corridor discipline:
 * the OVERTAKING_IN_BAN_ZONE check reads the lead gap at the lane-boundary
 * frame, and only a change TOWARD the lead's lane keeps it in the corridor).
 */
const OVB_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-ovb-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ovb-n-start", "ovb-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn
    cruiseSpeedMps: 6,
    extraRightOffsetM: 0, // right-lane center (the slow vehicle being passed)
    colorIndex: 2,
  },
  followGapM: 16, // pace ~16 m AHEAD, matchPlayer — inside the ban-overtake gate at a cut-back
  maxMatchSpeedMps: 6, // ~21.6 km/h — slow enough that the post-zone pass completes on the map
  slamAt: { x: 12.19, y: 600 }, // far past the 400 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** OV-06 — забрана за изпреварване, знак В24 (ЗДвП чл. 42–43: изпреварва се
 *  само където и когато е разрешено; знакът В24 забранява изпреварването в
 *  участъка до края на действието си). */
export const SC_OV_BAN_OVERTAKE: ScenarioSpec = {
  id: "sc-ov-ban-overtake",
  family: "lanes",
  tagsBg: ["ленти", "изпреварване", "забрана за изпреварване", "знак В24"],
  titleBg: "Изпреварване при забрана",
  objectiveBg:
    "Следвай бавната кола търпеливо през участъка със знак В24 „Забранено е изпреварването“ и я изпревари чак след края на зоната — забраната важи, дори предният да пълзи.",
  archetypeIds: ["OV-06"],
  conceptIds: ["c-overtaking-prohibitions", "c-prohibition-signs", "c-overtaking-procedure"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-ban-v1.json meta.scenario.params
    // (tools/maps/gen_ban_zones.mjs).
    params: { lengthM: 400, maxspeedKmh: 50, banKind: "noOvertaking", banFromM: OVB_BAN_FROM, banToM: OVB_BAN_TO },
    districtId: "ov-ban-v1",
  },
  start: {
    spawnPointId: "ovb-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — пред теб се движи бавна кола." },
    { n: 2, textBg: "Напред започва зона със знак В24 „Забранено е изпреварването“ — в нея не се изпреварва, независимо колко бавен е предният." },
    { n: 3, textBg: "Остани зад бавната кола с равномерна дистанция и изчакай търпеливо края на зоната." },
    { n: 4, textBg: "След края на забраната: огледало, мигач наляво и плавно излез в лявата лента за изпреварване." },
    { n: 5, textBg: "Подмини бавната кола и се прибери вдясно с мигач, щом я видиш в огледалото — и продължи до края." },
  ],
  success: [
    {
      id: "sc-ovb-patience",
      titleBg: "Следвай търпеливо през зоната В24",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the RIGHT
      // lane center, deep inside the ban span — the patience IS the drill.
      params: { kind: "reachZone", x: OVB_RIGHT, y: 190, radiusM: 4, maxSpeedKmh: 35 },
    },
    {
      id: "sc-ovb-finish",
      titleBg: "Изпревари след зоната и завърши в дясната лента",
      params: { kind: "reachZone", x: OVB_RIGHT, y: 370, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 80 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvBanOvertake.ts; gates in traces/__tests__/
  // sc-ov-ban-overtake-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-ban-overtake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-ban-overtake/mistake-overtake-in-zone.trace.json" },
      titleBg: "Изпреварване в зоната на забраната",
      whatWentWrongBg:
        "Колата излезе в лявата лента и се върна пред бавния автомобил дълбоко в зоната на знака В24. Точно там изпреварването е забранено: знакът стои, защото видимостта или насрещното движение го правят опасно — „предният е бавен“ не е разрешение (чл. 42–43).",
      codeRefs: ["OVERTAKING_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-ban-overtake/mistake-early-jump.trace.json" },
      titleBg: "Хвърляне точно преди знака",
      whatWentWrongBg:
        "Водачът започна изпреварването току пред знака В24 и завърши маневрата вече в зоната на забраната. Изпреварването трябва да ЗАВЪРШИ преди началото на зоната — започнатото „на ръба“ те вкарва в най-опасния участък по средата на маневрата.",
      codeRefs: ["OVERTAKING_IN_BAN_ZONE"],
    },
  ],
  teach: {
    whenBg:
      "Във всеки участък със знак В24 — изкачвания без видимост, училищни отсечки, ремонтни стеснения. Забраната важи от знака до края ѝ (знак В25 или следващото кръстовище) — и важи за всяко изпреварване, не само за „опасните“.",
    whyBg:
      "Знакът В24 стои точно там, където изпреварването убива: сляпо било, насрещен поток без резерв, стеснено платно. Търпението зад бавен водач струва секунди; изпреварването под забрана изнася колата в насрещното на най-лошото възможно място.",
    lawRef: "ЗДвП чл. 42–43",
    examinerBg:
      "Изпитващият следи разчитането на знаците и дисциплината на маневрата: никакво изпреварване в зоната на В24, търпеливо следване и правилно изпълнено изпреварване (огледало-мигач-маневра) чак след края на забраната.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [OVB_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-ov-solid-line — „Непрекъсната осева линия" (OV-04 escalation + SN-03)
//    on ov-solid-v1 (340 m 1+1 street, limit 50, М1 solidCenterLine span
//    @ y ∈ [90, 230] — ADR-006 stage 2b LINE TYPES)
// ---------------------------------------------------------------------------

/** ov-solid-v1 (1+1): the single lane center of the northbound bank. */
const OVS_LANE = 4.06;
/** ov-solid-v1: the М1 solid-осева span along the street (meta.scenario). */
const OVS_SOLID_FROM = 90;
const OVS_SOLID_TO = 230;

/** OV-04/SN-03 — единичната непрекъсната осева линия М1 не се застъпва и не
 *  се пресича (ППЗДвП чл. 63); настъпването е второстепенна, пълното
 *  пресичане — опасна. Pure line-discipline drive: NO staged actor, ambient
 *  zero — the only gradable act is the driver's own position vs the осева. */
export const SC_OV_SOLID_LINE: ScenarioSpec = {
  id: "sc-ov-solid-line",
  family: "lanes",
  tagsBg: ["ленти", "осева линия", "непрекъсната линия", "маркировка"],
  titleBg: "Непрекъсната осева линия",
  objectiveBg:
    "Измини улицата, без да застъпваш и без да пресичаш непрекъснатата осева линия — плътната линия е стена: колкото и бавен да е участъкът, оставаш изцяло в своята лента.",
  archetypeIds: ["OV-04", "SN-03"],
  conceptIds: ["c-longitudinal-markings", "c-overtaking-prohibitions", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-solid-v1.json meta.scenario.params
    // (tools/maps/gen_ban_zones.mjs).
    params: { lengthM: 340, maxspeedKmh: 50, banKind: "solidCenterLine", banFromM: OVS_SOLID_FROM, banToM: OVS_SOLID_TO },
    districtId: "ov-solid-v1",
  },
  start: {
    spawnPointId: "ovs-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и се установи в средата на своята лента." },
    { n: 2, textBg: "Напред осевата линия става непрекъсната (М1) — оттам нататък тя не се застъпва и не се пресича." },
    { n: 3, textBg: "Дръж средата на лентата: настъпването на осевата линия е грешка, а пълното ѝ пресичане те вкарва в насрещното на най-опасното място." },
    { n: 4, textBg: "Не започвай изпреварване и заобикаляне през плътната линия — изчакай прекъсната маркировка." },
    { n: 5, textBg: "Продължи в своята лента до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovsl-hold",
      titleBg: "Дръж своята лента през плътната линия",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the own-lane
      // center, deep inside the М1 span — holding the lane IS the drill.
      params: { kind: "reachZone", x: OVS_LANE, y: 160, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovsl-finish",
      titleBg: "Стигни края на отсечката в своята лента",
      params: { kind: "reachZone", x: OVS_LANE, y: 310, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvSolidLine.ts; gates in traces/__tests__/
  // sc-ov-solid-line-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-solid-line/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-solid-line/mistake-pullout.trace.json" },
      titleBg: "Изпреварващо излизане през плътната линия",
      whatWentWrongBg:
        "Колата излезе в насрещната лента през непрекъснатата осева линия — с мигач, но мигачът не отменя маркировката. Единичната непрекъсната линия (М1) не се пресича изобщо: тя стои там, където насрещното движение или видимостта правят навлизането отсреща опасно. Това е опасна грешка.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-solid-line/mistake-drift.trace.json" },
      titleBg: "Отнасяне през осевата линия",
      whatWentWrongBg:
        "Водачът се отнесе и колата премина изцяло отвъд непрекъснатата осева линия, в насрещната половина на платното. Погледът далеч напред по средата на лентата държи колата в нея — отнасянето през плътната линия е опасна грешка, дори „само за момент“.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
  ],
  teach: {
    whenBg:
      "Навсякъде, където осевата линия е непрекъсната — завои без видимост, върхове на изкачване, стеснени участъци. Прекъсната линия се пресича при изпреварване и завой; непрекъснатата — никога, в нито една посока.",
    whyBg:
      "Плътната осева линия е нарисувана точно там, където навлизането в насрещното убива: няма видимост или няма резерв за разминаване. Настъпването ѝ е класическа изпитна грешка, а пълното пресичане те поставя срещу насрещните на сляпо — затова изпитващите го третират като опасна грешка.",
    lawRef: "ППЗДвП чл. 63",
    examinerBg:
      "Изпитващият следи позицията ти спрямо маркировката: устойчиво движение в средата на лентата, без настъпване на осевата линия (второстепенна грешка) и без пресичане на непрекъснатата линия (опасна грешка, проваля изпита).",
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
// 8. sc-ov-bus-lane — „Бус лента" (SN-05) on ov-bus-v1 (500 m 2+2 boulevard,
//    limit 50, BUS busLane span @ y ∈ [90, 330] — ADR-006 stage 2b BUS LANES)
// ---------------------------------------------------------------------------

/** ov-bus-v1 (2+2): right (bus) / left (general) lane centers, northbound. */
const OVBUS_RIGHT = 12.19;
const OVBUS_LEFT = 4.06;
/** ov-bus-v1: the BUS-lane span along the boulevard (meta.scenario). */
const OVBUS_FROM = 90;
const OVBUS_TO = 330;

/** SN-05 — движение в бус лента (ЗДвП чл. 15: лентата за превозни средства от
 *  редовните линии не е за автомобили; пресича се само за завой надясно /
 *  спиране до бордюра). Pure lane-choice drive: NO staged actor, ambient
 *  zero — the only gradable act is which lane the driver travels. */
export const SC_OV_BUS_LANE: ScenarioSpec = {
  id: "sc-ov-bus-lane",
  family: "lanes",
  tagsBg: ["ленти", "бус лента", "лентова дисциплина", "булевард"],
  titleBg: "Бус лента",
  objectiveBg:
    "Измини булеварда, като пътуваш в общата (лявата) лента през участъка с бус лента и се прибереш вдясно чак след края ѝ — бус лентата не е „бърза лента“ за колите.",
  archetypeIds: ["SN-05"],
  conceptIds: ["c-other-markings", "c-lane-choice", "c-right-side-rule"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-bus-v1.json meta.scenario.params
    // (tools/maps/gen_ban_zones.mjs).
    params: { lengthM: 500, maxspeedKmh: 50, banKind: "busLane", banFromM: OVBUS_FROM, banToM: OVBUS_TO },
    districtId: "ov-bus-v1",
  },
  start: {
    spawnPointId: "ovbus-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — напред тя става бус лента (маркировка BUS)." },
    { n: 2, textBg: "Преди началото на бус лентата: огледало, мигач наляво и се престрой в общата лента." },
    { n: 3, textBg: "Пътувай в общата лента през целия участък — движението на автомобили в бус лентата е забранено, дори тя да е празна." },
    { n: 4, textBg: "Бус лентата се пресича само за завой надясно или спиране до бордюра — с мигач и непосредствено преди маневрата." },
    { n: 5, textBg: "След края на бус лентата: огледало, мигач надясно и се прибери в дясната лента до края." },
  ],
  success: [
    {
      id: "sc-ovbus-general",
      titleBg: "Пътувай в общата лента през участъка",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the LEFT
      // (general) lane center, deep inside the BUS span — the lane choice IS
      // the drill.
      params: { kind: "reachZone", x: OVBUS_LEFT, y: 210, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovbus-finish",
      titleBg: "Прибери се вдясно след края на бус лентата",
      params: { kind: "reachZone", x: OVBUS_RIGHT, y: 470, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvBusLane.ts; gates in traces/__tests__/
  // sc-ov-bus-lane-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-bus-lane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-bus-lane/mistake-cruise.trace.json" },
      titleBg: "Пътуване по бус лентата",
      whatWentWrongBg:
        "Колата остана в бус лентата и пътува по нея през целия участък. Лентата с маркировка BUS е само за превозните средства от редовните линии — за колите движението по нея е забранено, дори да е съвсем празна: тя пази разписанието на градския транспорт.",
      codeRefs: ["DRIVING_IN_BUS_LANE"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-bus-lane/mistake-dip-in.trace.json" },
      titleBg: "„Само да задмина колоната“ по бус лентата",
      whatWentWrongBg:
        "Водачът се престрои правилно в общата лента, но по средата на участъка се върна в бус лентата, „колкото да мине по-бързо“, и пътува по нея. Пресичането на бус лентата е позволено само непосредствено за завой надясно или спиране до бордюра — пътуването по нея е нарушение, колкото и кратко да изглежда.",
      codeRefs: ["DRIVING_IN_BUS_LANE"],
    },
  ],
  teach: {
    whenBg:
      "По всеки булевард с обособена бус лента — в София те са навсякъде и се снимат с камери. Правилото: пътуваш в съседната обща лента, а бус лентата пресичаш само за завой надясно или спиране до бордюра, с мигач, непосредствено преди маневрата.",
    whyBg:
      "Бус лентата прави градския транспорт предвидим — една кола „само за минутка“ в нея бави автобуса с всичките му пътници. Двойният капан на изпита: движението по бус лентата е грешка, но и отказът да я пресечеш за десен завой е грешка — тя се ползва точно и само за маневрата.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи избора на лента: движение в общата лента покрай бус лентата, без пътуване по нея, и правилно пресичане с мигач при завой надясно. Продължителното движение в бус лентата е основна грешка.",
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
// sc-mw-emergency-lane — „Аварийната лента" (SP-10-adjacent motorway lane
// legality; SN-05 is the lane-tagged-legality sibling) on mw-v1 (the
// motorway-segment archetype, gen_motorway.mjs). The emergency lane is the
// carriageway's CURB lane covered by an authored "emergencyLane" zone span
// (the busLane data seam, mirrored): sustained DRIVING in it grades the
// опасна EMERGENCY_LANE_DRIVING (ЗДвП чл. 58, т. 3 — VERIFIED against the
// content bank), with NO indicator exemption (a signalled undertake is still
// the fault; contrast the bus lane's legal right-turn transit). The
// breakdown SCENE the demos pass (a stalled car ON the emergency lane) is a
// recorder obstacle rect — trace/demo data, NOT map data (the
// sc-hazard-obstacle precedent; the live map hosts only the road).
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario — the L7 copy truth). */
const MW_X_CRUISE = 0;

/**
 * Чл. 58, т. 3 — движение по лентата за принудително спиране е забранено
 * (освен при принудително спиране). The taught norm: the lane stays FREE —
 * for ambulances, fire crews and broken-down cars; undertaking or
 * queue-skipping through it is the опасна act. Detector is default-ON and
 * structurally data-armed (only an authored emergencyLane span sets the tick
 * field), so no ruleConfig is needed — the LIVE student session grades it.
 */
export const SC_MW_EMERGENCY_LANE: ScenarioSpec = {
  id: "sc-mw-emergency-lane",
  family: "lanes",
  tagsBg: ["магистрала", "аварийна лента", "забрана", "лентова дисциплина"],
  titleBg: "Аварийната лента не е лента за движение",
  objectiveBg:
    "Измини магистралния участък, без нито веднъж да навлезеш в аварийната лента — включително покрай авариралата кола в нея. Лентата за принудително спиране е само за аварии: по нея не се кара, не се изпреварва и не се „скъсява“ колоната.",
  archetypeIds: ["SP-10", "SN-05"],
  conceptIds: ["c-motorway-prohibitions", "c-motorway-rules", "c-emergency-lane-breakdown"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params
    // (tools/maps/gen_motorway.mjs).
    params: { lengthM: 1000, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по магистралата и се установи в дясната лента за движение — около 100–110 км/ч." },
    { n: 2, textBg: "Вдясно от теб е аварийната лента: тя НЕ е лента за движение — по нея е забранено да се кара." },
    { n: 3, textBg: "Напред в аварийната лента стои аварирала кола — подмини я в своята лента, без да докосваш аварийната." },
    { n: 4, textBg: "Не се изкушавай да изпреварваш или да „скъсяваш“ през аварийната лента — точно тя трябва да остане свободна за линейка и пожарна." },
    { n: 5, textBg: "Продължи в лентата за движение до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwe-pass",
      titleBg: "Подмини авариралата кола в лентата за движение",
      // Just past the breakdown scene (the demos stage it at y = 780 on the
      // emergency lane, x = 8.13): radius 6 pins the CRUISE lane — a car
      // riding the emergency lane misses it.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 830, radiusM: 6 },
    },
    {
      id: "sc-mwe-finish",
      titleBg: "Стигни края на участъка",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 940, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMwEmergencyLane.ts; gates in traces/__tests__/
  // sc-mw-emergency-lane-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mw-emergency-lane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mw-emergency-lane/mistake-undertake.trace.json" },
      titleBg: "Изпреварване през аварийната лента",
      whatWentWrongBg:
        "Колата подаде мигач и „изпревари“ отдясно — през аварийната лента, с над 100 км/ч. Мигачът не прави маневрата законна: по лентата за принудително спиране изобщо не се кара. Точно там може да стои аварирала кола с хора около нея — а разликата в скоростите не прощава.",
      codeRefs: ["EMERGENCY_LANE_DRIVING"],
    },
    {
      traceRef: { path: "content/traces/sc-mw-emergency-lane/mistake-shoulder-cruise.trace.json" },
      titleBg: "Каране по аварийната лента",
      whatWentWrongBg:
        "Колата се настани в аварийната лента и я подкара като „своя“ — стотици метри, докато спрялата напред аварирала кола така или иначе не я върна в потока. Аварийната лента е коридорът на линейката и на повредения: движението по нея е опасна грешка, дори когато изглежда празна.",
      codeRefs: ["EMERGENCY_LANE_DRIVING"],
    },
  ],
  teach: {
    whenBg:
      "На всяка магистрала и скоростен път — особено при натоварен трафик и задръстване, когато изкушението да заобиколиш колоната по аварийната лента е най-голямо. Тогава тя е и най-необходима: по нея идват линейката и пожарната.",
    whyBg:
      "Аварийната лента е застраховката на магистралата: мястото, където повредената кола се изтегля, и коридорът, по който помощта стига до катастрофата. Кола, движеща се по нея, среща спрели автомобили, хора около тях и отломки — с магистрална скорост и без никакво време за реакция. Затова движението по нея е забранено, без изключение за „бързащите“.",
    lawRef: "ЗДвП чл. 58, т. 3",
    examinerBg:
      "Изпитващият следи лентовата дисциплина: всяко движение по лентата за принудително спиране е опасна грешка — с мигач или без. Аварийната лента се ползва само при принудително спиране, а покрай аварирала кола се минава в лентата за движение, с готовност и внимание.",
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
// 10. sc-ov-oncoming-gap — „Изпреварване срещу насрещни" (OV-05) on
//     ov-oncoming-v1 (900 m extra-urban 1+1 two-way, dashed осева, limit 90 —
//     gen_ov_oncoming.mjs). THE head-on family: the graded quantity is the
//     ONCOMING GAP in seconds (the runtime's overtake-corridor adjudicator),
//     not the marking — crossing the dashed line is legal here.
// ---------------------------------------------------------------------------

/** ov-oncoming-v1 lane centers (meta.scenario — the L7 copy truth). */
const OVG_OWN = 4.06;
/** ov-oncoming-v1 road length (meta.scenario.params). */
const OVG_LENGTH = 900;

/**
 * The staged SLOW LEAD both corridor templates share the mold of (per-lesson
 * ids): paces the player's own lane ~16 m ahead (matchPlayer) capped at
 * 11.1 m/s — the ~40 km/h rural crawler that makes overtaking tempting. Its
 * slam tier is authored out of reach (the OVC/OVB mold: deterministic moving
 * traffic, not a braking drill).
 */
function ovgLeadCar(id: string): BrakingLeadCarSpec {
  return {
    id,
    kind: "brakingLeadCar",
    actor: {
      pathNodes: ["ovg-n-start", "ovg-n-end"],
      hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn
      cruiseSpeedMps: 11.1,
      extraRightOffsetM: 0, // own-lane center (the vehicle being overtaken)
      colorIndex: 2,
    },
    // Pace ~20 m of CENTERS ahead (matchPlayer's own frame) — ≈ 16 m of
    // bumpers, which keeps the 34 km/h follow clear of the following-distance
    // fire band (0.7 × 1.8 s ≈ 11.9 m at that speed) at any seeded jitter.
    followGapM: 20,
    maxMatchSpeedMps: 11.1, // ~40 km/h — the slow rural lead
    slamAt: { x: OVG_OWN, y: 1300 }, // far past the 900 m road — never reached
    slamRadiusM: 2,
    slamDecelMps2: 6,
    minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
    proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
    triggersHazard: false,
    resumeAfterSec: 3,
  };
}

/**
 * The deterministic ONCOMING STREAM of sc-ov-oncoming-gap (OV-05): three cars
 * southbound on the oncoming bank at 12 m/s, released together on the
 * player's first movement — pure clockwork the drive scripts are authored
 * against (the runner emits nothing; the runtime's corridor tracker grades).
 * The authored windows, in INSTANT-CRUISE terms (a released car accelerates
 * at the staged default 2.6 m/s², losing v²/2a ≈ 28 m vs an instant-cruise
 * clock at 12 m/s — the holds sit 28 m further along so that, once at
 * cruise, each car tracks the instant model y = Y − 12·t exactly):
 *  - car 0, instant-model y 310 (hold @ y 282): meets the player early in
 *    the follow phase — mistake-tight-gap pulls out into ITS ~3.5 s gap;
 *  - car 1, +66 m (≈ 5.5 s headway): the between-window measures inside the
 *    4–7 s advisory band — waiting it out is the taught call;
 *  - car 2, +560 m: the BIG window after car 1 — the shadow's legal pass
 *    lives here with ≥ 8 s of measured margin; mistake-overstay keeps
 *    cruising the oncoming lane until car 2 closes under 4 s.
 */
const OVG_STREAM: OncomingStreamSpec = {
  id: "sc-ovg-stream",
  kind: "oncomingStream",
  libraryEventId: "OV-05",
  actor: {
    pathNodes: ["ovg-n-end", "ovg-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: OVG_LENGTH - 282 }, // instant-model y 310
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 3,
  gapsM: [66, 560], // instant-model y 376 / y 870
  releaseKmh: 3,
};

/** OV-05 — изпреварване само при достатъчен насрещен прозорец (ЗДвП чл. 42,
 *  ал. 1: свободен път на разстояние, достатъчно за маневрата). */
export const SC_OV_ONCOMING_GAP: ScenarioSpec = {
  id: "sc-ov-oncoming-gap",
  family: "lanes",
  tagsBg: ["изпреварване", "насрещно движение", "извънградски път", "преценка на прозореца"],
  titleBg: "Изпреварване срещу насрещни",
  objectiveBg:
    "Изчакай зад бавната кола, докато насрещните преминат, и изпревари едва в големия прозорец — насрещният коридор се смята в секунди: излизаш само когато стига за цялата маневра, с резерв.",
  archetypeIds: ["OV-05"],
  conceptIds: ["c-overtaking-procedure", "c-overtaking-prohibitions", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oncoming-v1.json meta.scenario
    // (tools/maps/gen_ov_oncoming.mjs).
    params: { lengthM: OVG_LENGTH, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по двупосочния път — пред теб пълзи бавна кола, а насреща идват автомобили." },
    { n: 2, textBg: "Остани зад бавната кола с равномерна дистанция: осевата е прекъсната, но лентата отсреща е ЗАЕТА." },
    { n: 3, textBg: "Преценявай насрещните в секунди, не „на око“: малкият прозорец между две коли не стига за цяло изпреварване." },
    { n: 4, textBg: "След последната насрещна кола: огледало, мигач наляво и излез решително — подмини бавната кола без бавене." },
    { n: 5, textBg: "Прибери се вдясно с мигач, щом видиш изпреварания в огледалото, и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovg-wait",
      titleBg: "Изчакай зад бавната кола, докато насрещните минат",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the own-lane
      // center while the stream is still inbound — the patience IS the drill.
      params: { kind: "reachZone", x: OVG_OWN, y: 150, radiusM: 4, maxSpeedKmh: 45 },
    },
    {
      id: "sc-ovg-finish",
      titleBg: "Изпревари в големия прозорец и завърши в своята лента",
      params: { kind: "reachZone", x: OVG_OWN, y: 540, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvOncomingGap.ts; gates in traces/__tests__/
  // sc-ov-oncoming-gap-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-oncoming-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-oncoming-gap/mistake-tight-gap.trace.json" },
      titleBg: "Излизане в тесен насрещен прозорец",
      whatWentWrongBg:
        "Колата излезе за изпреварване, когато насрещният беше на около 3 секунди. При взаимно приближаване такъв „прозорец“ се изпарява почти двойно по-бързо, отколкото изглежда — това е геометрията на челния удар, най-тежкият изход на пътя (чл. 42, ал. 1).",
      codeRefs: ["OVERTAKE_INSUFFICIENT_GAP"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-oncoming-gap/mistake-overstay.trace.json" },
      titleBg: "Провлачено изпреварване до следващия насрещен",
      whatWentWrongBg:
        "Водачът излезе в голям прозорец, но „изпреварваше“ едва с 2–3 км/ч разлика и остана в насрещната лента, докато следващата насрещна кола дойде под 4 секунди. Изпреварването се прави решително и за кратко — не можеш ли да минеш бързо, връщаш се зад бавния.",
      codeRefs: ["OVERTAKE_INSUFFICIENT_GAP"],
    },
  ],
  teach: {
    whenBg:
      "На всеки двупосочен път с прекъсната осева — там изпреварването е разрешено, но разрешено не значи безопасно: преценката на насрещния прозорец е изцяло твоя. Смятай в секунди: кола на хоризонта на прав участък е на около 10–12 секунди.",
    whyBg:
      "Челният удар при изпреварване е най-смъртоносната грешка на извънградските пътища: скоростите се СЪБИРАТ, а прозорецът, който изглежда достатъчен, се затваря двойно по-бързо. Затова законът изисква свободен път за ЦЯЛАТА маневра, преди изобщо да излезеш (чл. 42, ал. 1).",
    lawRef: "ЗДвП чл. 42, ал. 1",
    examinerBg:
      "Изпитващият следи преценката на насрещното: търпеливо изчакване зад бавния при заета насрещна лента, решително изпреварване едва при достатъчен прозорец и навременно прибиране вдясно. Излизане срещу близък насрещен е опасна грешка и проваля изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [ovgLeadCar("sc-ovg-lead"), OVG_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 11. sc-ov-abort — „Прекъснато изпреварване" (OV-08 abort discipline, the
//     OV-05 companion) on ov-oncoming-v1: the shadow's ABORT — brake and tuck
//     back when the window shrinks — is the whole lesson; an aborted overtake
//     NEVER convicts (the adjudicator's sacred rule), pushing on does.
// ---------------------------------------------------------------------------

/**
 * The single FAST oncoming of sc-ov-abort: 25 m/s (90 km/h — legal rural
 * speed) released on the player's first movement. Authored so the pull-out
 * moment reads a comfortable ~9 s measured gap — the trap is the SPEED: at
 * mutual closing the window collapses, and the taught response is the abort.
 * Hold in INSTANT-CRUISE terms (the OVG_STREAM note): the 2.6 m/s² spin-up
 * loses 25²/5.2 ≈ 120 m, so the hold sits 120 m further along — instant
 * model y = 882 − 25·t once at cruise.
 */
const OVA_STREAM: OncomingStreamSpec = {
  id: "sc-ova-stream",
  kind: "oncomingStream",
  libraryEventId: "OV-08",
  actor: {
    pathNodes: ["ovg-n-end", "ovg-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: OVG_LENGTH - 762 }, // instant-model y 882
    cruiseSpeedMps: 25,
    colorIndex: 3,
  },
  count: 1,
  gapsM: [],
  releaseKmh: 3,
};

/** OV-08/OV-05 — прекъсване на изпреварването, когато условията изчезнат
 *  (ЗДвП чл. 42: „започнатото се довършва" е рецепта за челен удар — намали
 *  и се прибери зад изпреварвания). */
export const SC_OV_ABORT: ScenarioSpec = {
  id: "sc-ov-abort",
  family: "lanes",
  tagsBg: ["изпреварване", "прекъсване на маневрата", "насрещно движение", "план Б"],
  titleBg: "Прекъснато изпреварване",
  objectiveBg:
    "Излез за изпреварване, но щом прозорецът срещу бързия насрещен се затвори — прекъсни: спирачка, обратно зад бавната кола, и довърши изпреварването чак когато пътят е чист. Прекъснатата маневра не е провал, а най-важното умение на изпреварването.",
  archetypeIds: ["OV-05", "OV-08"],
  conceptIds: ["c-overtaking-procedure", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oncoming-v1.json meta.scenario
    // (tools/maps/gen_ov_oncoming.mjs; shared with sc-ov-oncoming-gap — the
    // mw-v1 shared-district precedent).
    params: { lengthM: OVG_LENGTH, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се установи зад бавната кола — далеч напред се задава насрещен автомобил." },
    { n: 2, textBg: "Излез за изпреварване: разстоянието изглежда достатъчно. Но следи насрещния непрекъснато — разстоянието лъже, скоростта решава." },
    { n: 3, textBg: "Щом прецениш, че прозорецът се затваря: НЕ настоявай. Спирачка, мигач надясно и се прибери зад бавната кола." },
    { n: 4, textBg: "Прекъснатото изпреварване не е загуба — то е планът Б, който те пази жив. „Започнах, ще довърша“ е рецептата за челен удар." },
    { n: 5, textBg: "След като насрещният премине и пътят е чист — изпревари отново: решително, с мигач, и се прибери вдясно." },
  ],
  success: [
    {
      id: "sc-ova-abort",
      titleBg: "Прекъсни маневрата и се прибери зад бавната кола",
      // Radius 4 pins the OWN lane center just past the abort tuck-back, at
      // post-abort speed — reachable cleanly only by a driver who tucked back.
      params: { kind: "reachZone", x: OVG_OWN, y: 250, radiusM: 4, maxSpeedKmh: 50 },
    },
    {
      id: "sc-ova-finish",
      titleBg: "Довърши изпреварването на чист път и завърши",
      params: { kind: "reachZone", x: OVG_OWN, y: 540, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvAbort.ts; gates in traces/__tests__/sc-ov-abort-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-abort/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-abort/mistake-push-on.trace.json" },
      titleBg: "Настояване срещу затварящ се прозорец",
      whatWentWrongBg:
        "Прозорецът се затвори — насрещният идваше с 90 км/ч, — а водачът настоя да довърши изпреварването вместо да го прекъсне. Изпреварването е законно само докато условията му са налице: изчезнат ли, намаляваш и се прибираш зад изпреварвания (чл. 42). Настояването е опасна грешка.",
      codeRefs: ["OVERTAKE_INSUFFICIENT_GAP"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-abort/mistake-head-on.trace.json" },
      titleBg: "Челен сблъсък след пропуснат план Б",
      whatWentWrongBg:
        "Водачът не прекъсна маневрата и не се прибра — и се стигна до челен удар с насрещния. Точно това предотвратява планът Б на всяко изпреварване: спирачка и обратно зад бавния, ЩОМ прозорецът се затваря. При взаимно приближаване секундите се топят двойно по-бързо.",
      codeRefs: ["COLLISION", "OVERTAKE_INSUFFICIENT_GAP"],
    },
  ],
  teach: {
    whenBg:
      "При всяко изпреварване на двупосочен път — планът Б се прави ПРЕДИ да излезеш: докъде трябва да съм стигнал, за да продължа, и къде се прибирам, ако не съм. Следи насрещния през цялата маневра, не само в началото.",
    whyBg:
      "Най-често челният удар не идва от липса на преценка в началото, а от отказ да я преразгледаш по средата: „започнах, ще довърша“. Прекъснатото изпреварване струва три секунди чакане; настояването — среща с насрещен при събрани скорости. Умението да се откажеш навреме е по-важно от умението да изпревариш.",
    lawRef: "ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа готовността за план Б: непрекъснато следене на насрещния по време на маневрата и навременно прекъсване — спирачка и прибиране зад изпреварвания, — когато прозорецът се затваря. Прекъснатата маневра се оценява положително; настояването е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [ovgLeadCar("sc-ova-lead"), OVA_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

export const SCENARIO_TEMPLATES_LANES: readonly ScenarioSpec[] = [
  SC_OV_KEEP_RIGHT,
  SC_OV_LANE_KEEPING,
  SC_OV_ONEWAY,
  SC_OV_CROSSING_OVERTAKE,
  SC_OV_NARROW,
  SC_OV_BAN_OVERTAKE,
  SC_OV_SOLID_LINE,
  SC_OV_BUS_LANE,
  SC_MW_EMERGENCY_LANE,
  SC_OV_ONCOMING_GAP,
  SC_OV_ABORT,
];
