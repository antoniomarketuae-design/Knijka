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
 * FOUNDER R3 REDESIGNS (doc 62 #45/#46/#47 — the „press W and win" family):
 * each of the three now has an act the player can genuinely fail:
 *   - keep-right SPAWNS IN THE LEFT LANE (ov-kr-spawn-left), so „дръж вдясно"
 *     is an actual mirror-signal-move lane change, and staying put grades;
 *   - lane-keeping runs on the regenerated S-CURVE ov-lane-v1 (sway ±14 m),
 *     so holding the middle takes real steering with a direction reversal —
 *     cutting or running wide grades;
 *   - oneway runs on the regenerated T-JUNCTION ov-oneway-v1 whose cross
 *     street is one-way EAST (М10 right-only arrows painted on the approach
 *     lane): the drill is CHOOSING the legal entry, and the left turn — fully
 *     drivable — grades WRONG_WAY.
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
import { l5Fog, l5Night, l5Wet } from "./complications";

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
/** ov-lane-v1 (1+1 S-curve street, sway ±14 m): the graded apex/finish gates —
 *  lane-center points at the sway apexes, pinned from meta.scenario.gates. */
const LN_GATE_EAST = { x: 18.06, y: 75 };
const LN_GATE_WEST = { x: -9.94, y: 225 };
const LN_GATE_FINISH = { x: -0.42, y: 283.91 };
/** ov-oneway-v1 (T-junction, one-way bar flowing EAST): the approach lane
 *  center + the graded gates, pinned from meta.scenario.gates. */
const OW_APPROACH_X = 4.06;
const OW_GATE_MOUTH = { x: 4.06, y: 170 };
const OW_GATE_LEGAL = { x: 60, y: 200 };
const OW_GATE_FINISH = { x: 125, y: 200 };
/** ov-ban-v1 (2+2 boulevard, В24 zone @ [90, 210]): the right (cruise / lead)
 *  and left (overtake target) lane centers. */
const OVB_RIGHT = 12.19;
const OVB_LEFT = 4.06;
/** ov-ban-v1: the В24 no-overtaking span along the street (meta.scenario). */
const OVB_BAN_FROM = 90;
const OVB_BAN_TO = 210;

/**
 * THE LANE-TRUE RADIUS, and why every gate below that names a lane is 2.7.
 *
 * Lane pitch is 8.125 m on every district in this file, so a disc centred on a
 * lane centre leaves that lane at 4.0625 m. The L1/L2 ladder MULTIPLIES the
 * authored radius (scenario/params.ts widenRadius, ×1.5 at L1), so the number
 * that has to fit inside half a pitch is the WIDEST compiled one, not the
 * authored one: 2.7 × 1.5 = 4.05, which is the largest authored radius whose
 * every rung still proves „this lane and not the next one".
 *
 * SWEEP 161 IS WHAT MADE THIS URGENT, and it caught the arithmetic in the
 * reassuring direction on live L1 sessions, twice:
 *
 *  · sc-ovr-pass — «Изпревари бавната кола в насрещната лента» — was a r5 disc
 *    on the committed-pass line x = −2.5, i.e. 7.50 at L1, reaching x = +5.00.
 *    The OWN lane centre is +4.06. The pc-right run of 2026-08-16 crawled the
 *    whole 210 s in its own lane — top speed 15 км/ч, 27 full stops, never once
 *    across the centre line — and was ticked «✓ Изпревари бавната кола в
 *    насрещната лента 2:49». It overtook nothing. All four runs of that lesson
 *    were credited with the overtake.
 *  · sc-mwe-pass — «Подмини авариралата кола в лентата за движение» — was a r6
 *    disc on the cruise lane, i.e. 9.00 at L1, and the EMERGENCY lane centre is
 *    8.13 m away. A student undertaking the stalled car down the shoulder — the
 *    one act the lesson exists to forbid — satisfied the gate that says he did
 *    it „в лентата за движение".
 *
 * A radius is the only field a `reachZone` has that can express „which lane",
 * so a lane claim is exactly as true as this number and no truer. The rows are
 * tracked in objective-title-truth-lanes-following2-rail2.test.ts §5, which is
 * an equality against a shrink-only backlog: fixing one means deleting its line
 * there, and a new lane-claiming row wider than this cannot be added at all.
 */
const LANE_TRUE_RADIUS_M = 2.7;

// ---------------------------------------------------------------------------
// 1. sc-ov-keep-right — „Дръж вдясно" (OV-11 + OV-02) on ov-keepright-v1
//    (360 m 2+2 boulevard, limit 50)
//
// FOUNDER R3 REDESIGN (doc 62 #45: „starts already right, straight road;
// nothing to do"). The drill now SPAWNS IN THE LEFT LANE (ov-kr-spawn-left):
// „дръж вдясно" is finally an ACT — mirror, right indicator, move over, come
// home — and NOT doing it is finally a fault: staying left past the 12 s
// keep-right sustain grades NOT_KEEPING_RIGHT on the live session exactly as
// in the demos. The success gates (radius 4 < the 8.125 m lane pitch) are
// satisfiable ONLY from the right lane center, so the lane change is required
// to finish, and the change itself must be signalled (the shipped
// lane-change observation detectors stay armed — the shadow shows the full
// mirror-indicator-move discipline and earns SAFE_LANE_CHANGE).
// ---------------------------------------------------------------------------

/** OV-11 + OV-02 — движение във възможно най-дясната свободна лента (ЗДвП
 *  чл. 15: извън изпреварване водачът се движи възможно най-вдясно) — но
 *  започнато от ГРЕШНАТА лента, така че прибирането вдясно е истинска
 *  маневра: огледало, мигач, престрояване. */
export const SC_OV_KEEP_RIGHT: ScenarioSpec = {
  id: "sc-ov-keep-right",
  family: "lanes",
  tagsBg: ["ленти", "дръж вдясно", "лентова дисциплина", "престрояване", "булевард"],
  titleBg: "Дръж вдясно",
  objectiveBg:
    "Започваш в ЛЯВАТА лента на булеварда — мястото ти не е там. Огледало, десен мигач, престрой се в дясната лента и я дръж до края: лявата е за изпреварване, не за пътуване. Останеш ли вляво, това е отбелязана грешка.",
  archetypeIds: ["OV-11", "OV-02"],
  conceptIds: ["c-right-side-rule", "c-lane-choice", "c-overtaking-procedure"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-keepright-v1.json meta.scenario.params
    // (tools/maps/gen_ov_keepright.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ov-keepright-v1",
  },
  start: {
    spawnPointId: "ov-kr-spawn-left",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегляш в ЛЯВАТА лента — например след изпреварване. По чл. 15 мястото ти е във възможно най-дясната свободна лента." },
    { n: 2, textBg: "Дясната е свободна: огледало, поглед през рамо, десен мигач." },
    { n: 3, textBg: "Престрой се плавно в дясната лента и изключи мигача — това е цялата маневра „прибиране“." },
    { n: 4, textBg: "Не отлагай: висенето в лявата лента без причина е грешка, която тече със секундите, а зад теб се събира колона." },
    { n: 5, textBg: "Продължи в дясната лента до края на отсечката — лявата се посещава, в дясната се живее." },
  ],
  success: [
    {
      id: "sc-ovkr-move-right",
      titleBg: "Престрой се в дясната лента",
      // Radius 4 < the 8.125 m lane pitch: the zone is satisfiable ONLY from
      // the RIGHT lane center — the lane change IS the drill. Reaching it
      // needs the move to happen well inside the 12 s keep-right sustain.
      params: { kind: "reachZone", x: KR_RIGHT, y: 150, radiusM: 4, maxSpeedKmh: 55 },
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
        "Колата така и не се прибра: остана в лявата лента, в която тръгна, при съвсем свободна дясна — без да изпреварва никого. Лявата лента не е за пътуване: извън изпреварване се движиш във възможно най-дясната свободна лента (чл. 15), иначе събираш колона зад себе си.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-keep-right/mistake-slow-hog.trace.json" },
      titleBg: "Бавно в лявата лента",
      whatWentWrongBg:
        "Водачът не само остана в лявата лента, но и кара по-бавно от потока, „за да е спокоен“ — и запуши бързата лента. По-бавното движение в лявата лента е същата грешка: мястото ти е вдясно, а лявата се освобождава за по-бързите.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
  ],
  teach: {
    whenBg:
      "На всеки булевард и многолентов път — най-често точно СЛЕД изпреварване или ляв завой, когато вече си в лявата лента и прибирането е твоя следваща маневра: огледало, мигач, вдясно.",
    whyBg:
      "Висенето в лявата лента запушва потока и тласка другите да те изпреварват отдясно — най-опасния вид изпреварване. „Дръж вдясно“ не е учтивост, а закон (чл. 15): подредеността по ленти е това, което прави многолентовия път по-безопасен от еднолентовия.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи лентовата ти дисциплина: движение в дясната лента, ползване на лявата само за изпреварване или ляв завой и СВОЕВРЕМЕННО прибиране вдясно след маневрата — с огледало и мигач. Продължителното висене в лявата лента без причина е второстепенна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-ov-lane-keeping — „Движение в средата на лентата" (OV-12 straddle +
//    OV-04 center-line touch) on ov-lane-v1 (300 m 1+1 S-CURVE street, sway
//    ±14 m, limit 50)
//
// FOUNDER R3 REDESIGN (doc 62 #46: „hold W to win"). The regenerated
// ov-lane-v1 is an S-curve: a right-hand bend into a left-hand bend, apex
// radius ≈ 160 m. Holding the middle of the lane now takes continuous, real
// steering with a direction reversal — and the two classic curve errors are
// finally COMMITTABLE: not steering enough in the right-hand bend (or cutting
// the left-hand one) drifts the car onto the осева toward oncoming
// (CENTER_LINE_TOUCHED); running wide in the left-hand bend drifts it to the
// curb edge (POOR_LANE_KEEPING). The success gates sit ON the curved lane
// center at both apexes, pinned from meta.scenario.gates (the L7 copy law).
// ---------------------------------------------------------------------------

/** OV-12 / OV-04 — устойчиво движение в средата на своята лента (ЗДвП чл. 15;
 *  Наредба № 38 — настъпване на осевата линия е второстепенна грешка) — през
 *  улица с S-извивка, където средата на лентата се ДЪРЖИ с волана, не се
 *  подарява от правата. */
export const SC_OV_LANE_KEEPING: ScenarioSpec = {
  id: "sc-ov-lane-keeping",
  family: "lanes",
  tagsBg: ["ленти", "средата на лентата", "осева линия", "завой", "лентова дисциплина"],
  titleBg: "Движение в средата на лентата",
  objectiveBg:
    "Улицата прави S-извивка — надясно, после наляво. Дръж колата устойчиво в средата на своята лента през двата завоя: не срязвай към осевата линия и не се оставяй да те изнесе към бордюра. Колата отива там, където гледаш — гледай далеч напред по лентата.",
  // Doc-72 provenance: OV-12 (lane straddling / off-centre positioning) +
  // OV-04 (touching the center line toward oncoming — the „настъпване" tier).
  archetypeIds: ["OV-12", "OV-04"],
  conceptIds: ["c-lane-choice", "c-longitudinal-markings", "c-general-care-duty"],
  map: {
    archetype: "s-curve-street",
    // The generator recipe — mirrored in ov-lane-v1.json meta.scenario.params
    // (tools/maps/gen_ov_lanekeep.mjs).
    params: { lengthM: 300, maxspeedKmh: 50, swayM: 14 },
    districtId: "ov-lane-v1",
  },
  start: {
    spawnPointId: "ov-ln-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се установи в средата на своята лента — улицата напред НЕ е права: следва извивка надясно, после наляво." },
    { n: 2, textBg: "Гледай далеч напред по средата на лентата, не в предния капак — колата отива там, където гледаш." },
    { n: 3, textBg: "В десния завой не оставяй колата да „изплува“ навън към осевата линия — води я с малки, ранни корекции." },
    { n: 4, textBg: "В левия завой не срязвай през осевата и не се оставяй да те изнесе към бордюра — дръж равни отстояния от двете страни." },
    { n: 5, textBg: "Задръж средата на лентата през цялата S-извивка до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovln-east-apex",
      titleBg: "Мини върха на десния завой центрирано",
      params: { kind: "reachZone", x: LN_GATE_EAST.x, y: LN_GATE_EAST.y, radiusM: 5, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovln-west-apex",
      titleBg: "Мини върха на левия завой центрирано",
      params: { kind: "reachZone", x: LN_GATE_WEST.x, y: LN_GATE_WEST.y, radiusM: 5, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovln-finish",
      titleBg: "Излез от S-извивката центрирано в лентата",
      params: { kind: "reachZone", x: LN_GATE_FINISH.x, y: LN_GATE_FINISH.y, radiusM: 6 },
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
      titleBg: "Изнасяне към бордюра в левия завой",
      whatWentWrongBg:
        "В левия завой воланът не води колата достатъчно и тя се изнесе навън — трайно до дясната маркировка, на педя от бордюра. Неустойчивото движение в лентата те прави непредвидим и изяжда страничния резерв точно там, където вървят пешеходци и паркирани коли; дръж средата с ранни, малки корекции.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-lane-keeping/mistake-center-line.trace.json" },
      titleBg: "Изплуване върху осевата в десния завой",
      whatWentWrongBg:
        "В десния завой колата „изплува“ навън и се вози трайно върху осевата линия, към насрещното движение — класическото недозавиване. Настъпването на осевата линия е второстепенна грешка на изпита, а на пътя е навлизане в пространството на насрещните точно където видимостта е най-къса. Води колата през завоя, не я оставяй да се носи.",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
  ],
  teach: {
    whenBg:
      "През цялото време на движение — но най-вече в завои и извивки по тесни улици с една лента в посока, където осевата линия е на ръка разстояние и всяко „изплуване“ навън или срязване навътре се брои.",
    whyBg:
      "Средата на лентата е позицията с най-голям страничен резерв от двете страни. В завой колата напуска средата САМА, ако не я водиш: недозавиването я изнася върху осевата към насрещните, срязването — към бордюра и пешеходците. Погледът далеч напред по лентата е това, което прави корекциите малки и ранни вместо късни и резки.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи траекторията ти в лентата — особено в завои: устойчиво движение по средата, без настъпване на осевата линия и без долепяне до бордюра. Настъпването на осевата линия и неустойчивото водене в лентата се отбелязват като второстепенни грешки.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-ov-oneway — „Еднопосочна улица" (OV-13) on ov-oneway-v1
//    (T-JUNCTION: 200 m two-way approach into a one-way cross street flowing
//    EAST, ±140 m arms, limit 50)
//
// FOUNDER R3 REDESIGN (doc 62 #47: „hold W to win"). The old map was a
// straight one-way the player could only ride with the flow — the wrong-way
// fault existed solely in the demos. The regenerated ov-oneway-v1 is a T:
// the player arrives on the stem and must CHOOSE an entry into the one-way
// bar. Turning right enters WITH the eastbound flow (legal); turning left —
// fully drivable — enters AGAINST it and grades the опасна WRONG_WAY on the
// live session exactly as in the demos. The flow direction is world truth:
// М10 „right-only" arrows are painted in the approach lane before the mouth
// (meta.scenario.laneArrows — the SN-04 machinery). The sign kit ships no
// В1/Д4 face yet, so the arrows are the honest visible cue; the copy teaches
// reading them (and the В1 rule in the teach block for the real street).
//
// LEDGER T13 (doc 86 §2): the copy used to cite В2 for what is В1.
// content/signs/signs.json is authoritative — В1 = „Забранено е влизането на
// пътни превозни средства" (the ONE-WAY MOUTH sign, the exit of a one-way
// street), В2 = „…в двете посоки" (a road closed to everyone, both ways).
// The world was already right: props.ts posts `noEntry` at the illegal west
// mouth. Only the two strings were wrong, and a student who memorised them
// would answer the листовка question wrong.
// ---------------------------------------------------------------------------

/** OV-13 — влизане в еднопосочна улица само по посока на движението (ЗДвП
 *  чл. 6; знак В1 „Забранено е влизането на пътни превозни средства" /
 *  стрелките на платното) — на Т-кръстовище, където грешният вход е напълно
 *  възможен и затова е урок. */
export const SC_OV_ONEWAY: ScenarioSpec = {
  id: "sc-ov-oneway",
  family: "lanes",
  tagsBg: ["ленти", "еднопосочна улица", "посока на движение", "избор на вход", "маркировка"],
  titleBg: "Еднопосочна улица",
  objectiveBg:
    "Стигаш Т-кръстовище: напречната улица е еднопосочна и се движи НАДЯСНО от теб (на изток) — стрелките на платното ти го казват отдалеч. Избери законния вход: завий надясно, по посоката. Левият завой е физически възможен — и е точно опасната грешка „срещу еднопосочното“.",
  archetypeIds: ["OV-13"],
  conceptIds: ["c-sign-groups", "c-prohibition-signs", "c-general-care-duty"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in ov-oneway-v1.json meta.scenario.params
    // (tools/maps/gen_ov_oneway.mjs).
    params: { approachM: 200, armM: 140, maxspeedKmh: 50 },
    districtId: "ov-oneway-v1",
  },
  start: {
    spawnPointId: "ov-ow-spawn-entry",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по подхода — напред улицата свършва в Т-кръстовище с еднопосочна улица." },
    { n: 2, textBg: "Чети платното отдалеч: стрелките „само надясно“ в твоята лента казват, че напречната улица се движи само на изток." },
    { n: 3, textBg: "Намали преди кръстовището, десен мигач и завий НАДЯСНО — по посоката на движението." },
    { n: 4, textBg: "Наляво НЕ се влиза: там щеше да си срещу насрещните, които нямат как да те очакват. На реалната улица този вход носи знак В1 „Забранено е влизането на пътни превозни средства“ — знакът, който стои на изхода на еднопосочната." },
    { n: 5, textBg: "Продължи по еднопосочната до края — движението по нея е само в разрешената посока." },
  ],
  success: [
    {
      id: "sc-ovow-mouth",
      titleBg: "Приближи кръстовището овладяно, готов за завой",
      params: { kind: "reachZone", x: OW_GATE_MOUTH.x, y: OW_GATE_MOUTH.y, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-ovow-entry",
      titleBg: "Влез в еднопосочната по посоката ѝ (надясно)",
      // On the EAST arm — reachable only through the legal right turn; the
      // west arm never satisfies it.
      params: { kind: "reachZone", x: OW_GATE_LEGAL.x, y: OW_GATE_LEGAL.y, radiusM: 6 },
    },
    {
      id: "sc-ovow-finish",
      titleBg: "Продължи по посоката до края на улицата",
      params: { kind: "reachZone", x: OW_GATE_FINISH.x, y: OW_GATE_FINISH.y, radiusM: 8 },
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
      titleBg: "Ляв завой срещу еднопосочната",
      whatWentWrongBg:
        "На Т-кръстовището водачът зави наляво — срещу посоката, която стрелките на платното показваха от петдесет метра. Всеки метър по западното рамо е движение срещу насрещните: те карат с очакването, че никой няма да се появи насреща им. Движението срещу еднопосочно е опасна грешка и прекратява изпита.",
      // M-17: the approach lane's М10 „само надясно" arrows are the visible cue
      // this scenario is built on — and until the arrow channel existed they
      // graded nothing. Two laws, two lessons: чл. 6 (маркировката е нареждане,
      // прочети я) and the опасна за движение срещу еднопосочното.
      codeRefs: ["WRONG_WAY", "WRONG_LANE_FOR_DIRECTION"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-oneway/mistake-wrong-way-short.trace.json" },
      titleBg: "„Само няколко метра“ в грешната посока",
      whatWentWrongBg:
        "Водачът зави наляво „колкото да спре ей там“ и измина само двайсетина метра срещу посоката, преди да закове. И краткото движение срещу еднопосочното е същата опасна грешка — насрещният, който излиза иззад завоя, не получава нито метър предупреждение. По еднопосочна се влиза единствено по посоката ѝ.",
      codeRefs: ["WRONG_WAY", "WRONG_LANE_FOR_DIRECTION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки вход на улица — особено в центъра и кварталите, където еднопосочните са гъсти. Преди да завиеш, прочети входа: знак В1 „Забранено е влизането на пътни превозни средства“ на изхода ѝ, знак Д4 „Еднопосочно движение“ на входа ѝ или стрелките на платното казват откъде се влиза и откъде — никога. (В2 е друг знак: той затваря пътя в ДВЕТЕ посоки, не само срещу теб.)",
    whyBg:
      "Движението срещу еднопосочното е особено опасно, защото водачите насреща карат с очакването, че никой няма да се появи насреща им — реакцията им закъснява фатално. Затова законът го нарежда сред грешките, които прекратяват изпита начаса: изборът на вход е избор преди маневрата, не поправка след нея.",
    lawRef: "ЗДвП чл. 6",
    examinerBg:
      "Изпитващият следи разчитането на знаците и маркировката ПРЕДИ маневрата: очаква намаляване, мигач и вход само по посоката на движението. Влизане или движение срещу еднопосочна улица е опасна грешка и прекратява изпита незабавно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
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
  // LEDGER T18 (doc 86 §2). This was 16 m of centres = 11.9 m of bumpers, i.e.
  // FOLLOWING_TOO_CLOSE above 34.0 km/h — on a street posted 50, in a lesson
  // whose OWN approach gate authorised 55. Measured through the recorder, the
  // shipped shadow held 1.86 s and the two mistake demos 1.42 / 1.62 s against
  // the 1.26 s fire line: a following bill was one hesitant beat from leaking
  // into demos that must grade OVERTAKING_AT_CROSSING and nothing else.
  //
  // 20 m of centres = 13.9 m of bumpers at the seeded worst case → the
  // threshold moves to 39.7 km/h, and sc-ovc-approach's cap drops 55 → 30 (see
  // there), so the fastest speed this lesson AUTHORISES is now 9.7 km/h below
  // the slowest speed at which it can bill a following fault. Measured after:
  // shadow 2.37 s, demos 1.93 / 2.13 s, both still grading their exact code.
  //
  // 20 IS THE CEILING, and it was found by bisection, not taste: at 22 the
  // „Изпреварване в последния момент" demo stops grading OVERTAKING_AT_CROSSING
  // and at 26 both demos do — push the lead further out and the cut-back the
  // чл. 119 detector reads is no longer a cut-back in front of anything. The
  // residual (39.7 km/h < the posted 50) is recorded rather than hidden: it
  // cannot be closed from this file without re-choreographing both demos.
  //
  // The rubber band stays. This lead is not a gap drill's lead, it is the car
  // being illegally passed, and the demos' cut-back needs it where the tape
  // expects it (Lane 7's own contract note: scheduledCruise is for drills that
  // grade a GAP).
  followGapM: 20,
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
      titleBg: "Приближи пътеката в дясната лента зад предния — под 30 км/ч",
      // LEDGER T18 / north star: the cap was 55 km/h. On a street posted 50,
      // fifty metres before a pedestrian crossing, that gate was telling the
      // student that 55 is an acceptable approach speed — a falsehood in its
      // own right, and it sat ABOVE the speed at which the drill's own lead
      // billed FOLLOWING_TOO_CLOSE (34.0 km/h then, 39.7 now). 30 km/h is what
      // instruction 3 already asks for («намали и остани зад него»), it is what
      // the shipped shadow drives (26 km/h at this gate), and it puts the
      // lesson's authorised speed safely below its own fault threshold.
      params: { kind: "reachZone", x: OVC_RIGHT, y: 170, radiusM: 6, maxSpeedKmh: 30 },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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

/** ov-narrow-v1 (240 m 1+1 two-way street): the two lane centres, pinned from
 *  meta.scenario (`laneCenterRightM` 4.06; the opposing bank mirrors it — the
 *  same ±half-pitch pair every 1+1 district in this file uses). The parked row
 *  stands ON the first of them, which is why the second one is a place the
 *  student has to drive and not just a number. */
const NM_OWN = 4.06;
const NM_ONCOMING = -4.06;
/** The two held props' arc offsets along nm-n-start → nm-n-end. That edge runs
 *  (0,0) → (0,240), so an arc metre IS a district y (the L7 copy law), and the
 *  midpoint between the two parked cars is the middle of the squeeze. */
const NM_PARKED_Y = [120, 135] as const;
const NM_SQUEEZE_Y = (NM_PARKED_Y[0] + NM_PARKED_Y[1]) / 2; // 127.5

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
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: NM_PARKED_Y[0] } },
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: NM_PARKED_Y[1] } },
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
    { n: 5, textBg: "Щом насрещният премине, излез в насрещната лента, промъкни се покрай паркираните коли и се прибери вдясно веднага след тях." },
  ],
  success: [
    {
      id: "sc-ovn-wait",
      titleBg: "Спри и изчакай на разширението (под 6 км/ч)",
      // LEDGER D3 (doc 86 §5): the cap was 30 km/h under a title that says
      // «Изчакай» and an instruction that says «Спри». 30 km/h is not waiting —
      // it is rolling through the passing place at the exact speed that makes
      // the narrow meeting a head-on. The gate now measures the act it names:
      // ≤ 6 km/h is a stop (the same halt band sc-jxb-hold / sc-pesp-halt use).
      // The shipped shadow already comes to a full 0.00 km/h inside this zone
      // (content/traces/sc-ov-narrow/shadow-correct.trace.json — 317 samples in
      // radius, minimum 0.00), so the tightening costs no re-record.
      params: { kind: "reachZone", x: NM_OWN, y: 100, radiusM: 10, maxSpeedKmh: 6 },
    },
    {
      // SWEEP 161, THE FOURTH «cannot be passed» AND THE ONLY ONE THAT WAS TRUE.
      //
      // The chain of this lesson used to be two marks — wait at (4.06, 100),
      // finish at (4.06, 200) — BOTH on the player's own lane centre, with
      // nothing between them. Its six siblings in this file all had the same
      // defect and all had it repaired in the sweep's first pass: «изпревари»,
      // «излез в лявата лента», «излез за изпреварване» were each given a gate
      // in the LANE the manoeuvre uses. This lesson was left out, and
      // lanes-sweep161-wave2 §3 wrote the exclusion down in as many words —
      // „sc-ov-narrow … is not a lane-x case … the drill is pinned by the
      // staged event rather than by a coordinate".
      //
      // A STAGED EVENT CANNOT PIN A ROUTE, and that is what turned an untidy
      // objective list into an uncompletable lesson. `scene/guidanceRoute.ts`
      // builds the blue ribbon from the ACTIVE OBJECTIVE's mark — „shortest
      // legal on-road path to the target" — and it has no knowledge of staged
      // actors. With the next mark at (4.06, 200) the shortest legal path from
      // the widening is a straight line up x = 4.06 … which is the exact
      // coordinate of both parked cars, at y = 120 and y = 135. The product
      // drew a line through the obstacle it had just staged, and «Следвай
      // синята линия» is instruction the student is given on every rung.
      //
      // That is what the frame shows. On the 2026-08-22 steered re-drive
      // (.audit-frames/rebase/frames/sc-ov-narrow__mobile-right — TRACKED, 91%
      // of moving samples on the ribbon, median error 0.9°, straightness 1.00,
      // i.e. a car doing exactly what it was told) the debrief reads
      // «✓ Спри и изчакай на разширението 1:12», «★ ✓ Правилно отстъпено
      // предимство 1:25» — the yield the lesson exists to teach, performed and
      // credited — and then «✗ Удар в друго превозно средство −10», task 2
      // never ticked. The car obeyed the guidance and drove into the parked
      // row. No lane-position claim is needed to say that, and none is made:
      // the defect is that the ROUTE went there.
      //
      // THE MARK IS DERIVED, NOT CHOSEN. x is the opposing lane centre
      // (NM_ONCOMING, meta.scenario's ±half-pitch pair) and y is the midpoint
      // of the two parked cars' own arc offsets (NM_SQUEEZE_Y = 127.5), i.e.
      // the middle of the gap the student is threading. Radius is the file's
      // LANE_TRUE_RADIUS_M, so the widest compiled rung (4.05 at L1) reaches
      // x = −0.01 and never touches the player's own paint: the row is
      // satisfiable ONLY from the opposing half, which is the whole claim its
      // title makes.
      //
      // MEASURED on the committed recordings (content/traces/sc-ov-narrow):
      //   shadow-correct   sits at x = −4.06 EXACTLY over y ∈ [118.7, 137.2],
      //                    so it crosses the disc dead centre at every rung;
      //   mistake-barge / mistake-force  complete this row too, and that is
      //                    correct — both DO make the squeeze; their fault is
      //                    making it while the oncoming still holds priority,
      //                    which FAILED_TO_YIELD bills and which the chain
      //                    still separates, because neither of them reaches
      //                    `sc-ovn-finish` (they stop at y = 140 / y = 142,
      //                    60 m short of it).
      //
      // The radius ladder is unchanged for its two neighbours, computed not
      // assumed: compile.ts `radiusWidenBudget` gives each row half the free
      // gap to its neighbour — 7.99 m on the wait→squeeze side (28.67 m of
      // centres less r10 less r2.7) and 29.13 m on squeeze→finish — and every
      // one of those is above the standing REACH_ZONE_GRACE_M ceiling of 5,
      // which is what actually binds and bound before. So `sc-ovn-wait` and
      // `sc-ovn-finish` compile to exactly the radii they compiled to with two
      // rows, and this row's own widest rung is its authored 2.7 × 1.5 = 4.05.
      id: "sc-ovn-squeeze",
      titleBg: "Промъкни се покрай паркираните коли в насрещната лента",
      params: { kind: "reachZone", x: NM_ONCOMING, y: NM_SQUEEZE_Y, radiusM: LANE_TRUE_RADIUS_M },
    },
    {
      id: "sc-ovn-finish",
      // TITLE LEFT ALONE ON PURPOSE. «Премини стеснението» is now carried by
      // the row above plus the chain's own sequencing, so it is true; adding
      // «в своята лента» here would be a lane claim this r12 disc cannot
      // prove (the widest rung spans the whole carriageway), which is the
      // exact class the lane-claim census (objective-title-truth-lanes-
      // following2-rail2 §5) is a shrink-only backlog against.
      titleBg: "Премини стеснението и стигни края на отсечката",
      params: { kind: "reachZone", x: NM_OWN, y: 200, radiusM: 12 },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
      // SWEEP 161 / finding «Изпревари след зоната … never ticks on either
      // platform»: the row below USED to be the whole overtake — one disc on
      // the RIGHT lane at y = 370, i.e. the place a student reaches by simply
      // following the lead car to the end of the road. The word «Изпревари»
      // was carried by nothing. This gate is what carries it now: the LEFT
      // lane, at y = 275, i.e. 65 m PAST the end of the В24 span (OVB_BAN_TO
      // = 210), so the chain reads „right lane inside the ban → left lane
      // after it → right lane home" and the sentence is the geometry.
      //
      // MEASURED through the production evaluator on the committed recordings:
      //   shadow-correct           10 frames inside at L3 (closest 0.19 m) ✓
      //   mistake-overtake-in-zone  refused — closest 8.13 m (it is at
      //                             x = 12.19 here: it passed INSIDE the ban
      //                             and was already home by y = 275)
      //   mistake-early-jump        refused — closest 8.13 m, same reason
      // Both demos still grade OVERTAKING_IN_BAN_ZONE; what they no longer do
      // is collect the tick for the lawful pass they never made.
      id: "sc-ovb-pass",
      titleBg: "Изпревари чак СЛЕД зоната — излез в лявата лента",
      params: { kind: "reachZone", x: OVB_LEFT, y: 275, radiusM: LANE_TRUE_RADIUS_M },
    },
    {
      id: "sc-ovb-finish",
      // r5 → 2.7 (LANE_TRUE_RADIUS_M): «в дясната лента» was creditable at L1
      // from x = 4.69, i.e. 3.44 m inside the LEFT lane, on a 8.125 m pitch.
      // The shadow sits at x = 12.19 dead centre and keeps 62 frames inside.
      titleBg: "Прибери се и завърши в дясната лента",
      params: { kind: "reachZone", x: OVB_RIGHT, y: 370, radiusM: LANE_TRUE_RADIUS_M },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
        "Колата излезе в насрещната лента през непрекъснатата осева линия — с мигач, но мигачът не отменя маркировката. Единичната непрекъсната линия (М1) не се пресича изобщо: тя стои там, където насрещното движение или видимостта правят навлизането отсреща опасно. По изпитния лист самото пресичане е ОСНОВНА грешка (3 т.) — но ако отсреща идва кола, това вече е отделна ОПАСНА грешка и изпитът приключва дотам.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-solid-line/mistake-drift.trace.json" },
      titleBg: "Отнасяне през осевата линия",
      whatWentWrongBg:
        "Водачът се отнесе и колата премина изцяло отвъд непрекъснатата осева линия, в насрещната половина на платното. Погледът далеч напред по средата на лентата държи колата в нея — отнасянето през плътната линия се отчита като основна грешка (3 т.) дори „само за момент“, а срещнеш ли насрещна кола там, вече е опасна.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
  ],
  teach: {
    whenBg:
      "Навсякъде, където осевата линия е непрекъсната — завои без видимост, върхове на изкачване, стеснени участъци. Прекъсната линия се пресича при изпреварване и завой; непрекъснатата — никога, в нито една посока.",
    whyBg:
      "Плътната осева линия е нарисувана точно там, където навлизането в насрещното убива: няма видимост или няма резерв за разминаване. Настъпването ѝ е второстепенна грешка, а пълното пресичане — основна (3 т.). Не бъркай обаче тежестта на точките с тежестта на риска: линията стои там, защото зад нея на сляпо може да идва кола, и срещнеш ли я, това е вече опасна грешка и край на изпита.",
    lawRef: "ППЗДвП надлъжна пътна маркировка",
    examinerBg:
      "Изпитващият следи позицията ти спрямо маркировката: устойчиво движение в средата на лентата, без настъпване на осевата линия (второстепенна грешка) и без пресичане на непрекъснатата линия (основна грешка, 3 т.). Пресичане срещу идваща кола е отделна опасна грешка и проваля изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Fog(),
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
    { n: 1, textBg: "Потегли по булеварда в дясната лента — напред тя става бус лента, отделена с плътна линия." },
    { n: 2, textBg: "Преди началото на бус лентата: огледало, мигач наляво и се престрой в общата лента." },
    { n: 3, textBg: "Пътувай в общата лента през целия участък — движението на автомобили в бус лентата е забранено, дори тя да е празна." },
    { n: 4, textBg: "Бус лентата се пресича само за завой надясно или спиране до бордюра — с мигач и непосредствено преди маневрата." },
    { n: 5, textBg: "След края на бус лентата: огледало, мигач надясно и се прибери в дясната лента до края." },
  ],
  success: [
    {
      id: "sc-ovbus-general",
      titleBg: "Пътувай в общата лента през участъка",
      // „Radius 4 < the 8.125 m lane pitch" was the AUTHORED number and the
      // ladder multiplies it: at L1 the disc is 6.00 and reaches x = 10.06,
      // which is 1.94 m INSIDE the bus lane (its boundary is x = 8.125). A car
      // straddling the BUS paint was creditable with «пътувай в общата лента»
      // on the aided rung, where the beginners are. 2.7 (LANE_TRUE_RADIUS_M)
      // keeps every rung inside the general lane: L1 4.05 → x ∈ [0.01, 8.11].
      // Shadow: 11 frames inside at L3, closest 0.05 m. Both bus-lane demos sit
      // at x = 12.19 and are refused at every rung, as they were before.
      params: { kind: "reachZone", x: OVBUS_LEFT, y: 210, radiusM: LANE_TRUE_RADIUS_M, maxSpeedKmh: 55 },
    },
    {
      id: "sc-ovbus-finish",
      titleBg: "Прибери се вдясно след края на бус лентата",
      // THE LANE CLAIM THE CENSUS NET CANNOT SEE, because this row says
      // «вдясно» and the net (objective-title-truth-lanes-following2-rail2
      // §5 LANE_WORDS) matches «дясната лента». Same defect as its five
      // siblings, hidden by one word: authored r5 is the L3 number and the
      // ladder multiplies it, so the L1 disc was 7.50 around x = 12.19 and
      // reached x = 4.69 — 3.44 m of the GENERAL lane, i.e. the lane the
      // student is being asked to leave. Measured through the production
      // evaluator on straight drives held at one x through the mark:
      //     OLD L1 r7.50   x = 5.0 / 6.0 / 7.0 / 8.0  all done = TRUE
      //     OLD L3 r5.00   x = 8.0                        done = TRUE
      //     NEW (below)    every one of them refused at EVERY rung
      // A car creeping the general lane to the end of the boulevard was
      // credited with «прибери се вдясно» on the rung beginners are given.
      //
      // TWO NUMBERS, both read off the district and the recording rather than
      // chosen: the radius becomes LANE_TRUE_RADIUS_M (widest rung 4.05, which
      // is inside the 4.0625 m half-pitch, so the disc is the bus/right lane
      // and nothing else — the whole of it still counts, x ∈ [8.14, 16.24]),
      // and the mark moves the 2 m onto the coordinate the shadow actually
      // comes to rest at, so the tighter disc is centred on the drive instead
      // of trailing it. Measured on the committed shadow: closest 2.05 m and
      // 55 frames inside before, 0.05 m and 54 frames inside after — the
      // longitudinal margin GREW while the lateral claim became true. Both
      // bus-lane demos are refused at every rung, as they were before.
      params: { kind: "reachZone", x: OVBUS_RIGHT, y: 468, radiusM: LANE_TRUE_RADIUS_M },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
// опасна EMERGENCY_LANE_DRIVING (ЗДвП чл. 58, т. 4 „да се движи… в лентата за
// принудително спиране" — т. 3 is the STOPPING permission, corrected
// 2026-08-03), with NO indicator exemption (a signalled undertake is still
// the fault; contrast the bus lane's legal right-turn transit).
//
// LEDGER T15 (doc 86 §2) — THE BROKEN-DOWN CAR NOW EXISTS.
// This template used to have no `staged` field at all. The stalled car lived
// ONLY as a recorder obstacle rect (traces/scMwEmergencyLane.ts), i.e. in the
// two demo recordings — while instruction 3 and the objective title told the
// LIVE student to «подмини авариралата кола», and the mistake copy told him
// «точно там може да стои аварирала кола с хора около нея». A 17-year-old
// cannot tell the simulator is lying to him; he learns that the emergency lane
// is an empty strip of tarmac with a rule attached, which is the opposite of
// why the rule exists. MWE_BREAKDOWN below puts a real body at the coordinate
// the demos already used, so the sentence the lesson says is true.
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario — the L7 copy truth). */
const MW_X_CRUISE = 0;
/** mw-v1 EMERGENCY-lane center (meta.scenario.laneEmergencyX) — where the
 *  stalled car stands, and the default lane the mw-n-nb-* path resolves to
 *  (sc-fo-motorway-gap shifts −8.13 off it to reach the cruise lane). */
const MW_X_EMERG = 8.13;
/** Arc offset of the breakdown along mw-n-nb-start → mw-n-nb-end. The edge
 *  runs (0,0) → (0,1000), so arc = y: 780 is the coordinate the recorder's
 *  `mwBreakdownRects()` has always used. */
const MWE_BREAKDOWN_Y = 780;

/**
 * THE STALLED CAR — a staged actor that is never commanded and therefore never
 * moves: the doc 72 OV-18 „stage() with a hold pose" prop pattern that
 * `narrowMeeting.props` uses for its parked row, expressed on the one staged
 * kind a template can author standalone.
 *
 * HOW IT STAYS PUT, spelled out because it is the whole trick:
 *  - `armDistM: 0` — `BrakingLeadCarRunner.step()` releases only when
 *    `dist(player, actor) <= releaseDistM`, and `s.armDistM ?? …` keeps the
 *    authored 0 (nullish coalescing, not `||`). A distance is never ≤ 0, so the
 *    runner sits in `phase: "armed"` for the whole drive, issues NO command and
 *    emits NO SimTickEvent. Nothing can grade off it except physical contact.
 *  - belt and braces, in case a future runner change ever releases it:
 *    `paceMode: "scheduledCruise"` with `paceSpeedMps: 0` and
 *    `actor.cruiseSpeedMps: 0` mean every command path it could take —
 *    `commandPace`, and the post-resolution `{type:"cruise"}` with no argument —
 *    resolves to a target speed of 0.
 *  - the slam tier is authored out of the map (y = 1400 on a 1000 m road,
 *    `minSlamSpeedKmh` 250), the same OVC/FD mold every non-braking lead uses.
 *
 * WHY IT IS SAFE FOR THE THREE COMMITTED DRIVES: it stands at x = 8.13 while
 * the shadow runs x = 0 — 8.13 m of lateral separation, far outside both the
 * contact envelope and `LEAD_CORRIDOR_M` 1.8, so it opens no lead-gap channel
 * and no following code. Both mistake demos leave the emergency lane by
 * y ≈ 700/730, i.e. ≥ 50 m short of it, exactly as their scripts were written.
 * The recorder keeps its ObstacleRect2D twin at the same coordinate (the
 * sc-ed-poligon-chain „headless twin" pattern) so the trace channel is
 * unchanged.
 *
 * WHY IT IS THE RIGHT FIX AND NOT DRESSING: it is a hittable body. A live
 * student who undertakes down the shoulder at 100 km/h now meets the thing the
 * ban exists for, instead of gliding through the story of it.
 */
const MWE_BREAKDOWN: BrakingLeadCarSpec = {
  id: "sc-mwe-breakdown",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: MWE_BREAKDOWN_Y }, // (8.13, 780) — the emergency lane
    cruiseSpeedMps: 0, // it is broken down; it has no cruise
    extraRightOffsetM: 0, // the path's own default lane IS the emergency lane
    colorIndex: 4,
  },
  followGapM: 0,
  maxMatchSpeedMps: 0,
  armDistM: 0, // never arms — see the header
  paceMode: "scheduledCruise",
  paceSpeedMps: 0,
  slamAt: { x: MW_X_EMERG, y: 1400 }, // far past the 1000 m segment — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250,
  proximityFallbackM: 0.3,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * Чл. 58, т. 4 — движение по лентата за принудително спиране е забранено
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
    { n: 1, textBg: "Потегли по магистралата и се установи в дясната лента за движение — около 100–110 км/ч." },
    { n: 2, textBg: "Вдясно от теб е аварийната лента: тя НЕ е лента за движение — по нея е забранено да се кара." },
    { n: 3, textBg: "Напред в аварийната лента стои аварирала кола — подмини я в своята лента, без да докосваш аварийната." },
    { n: 4, textBg: "Не се изкушавай да изпреварваш или да „скъсяваш“ през аварийната лента — точно тя трябва да остане свободна за линейка и пожарна." },
    { n: 5, textBg: "Продължи в лентата за движение до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwe-pass",
      titleBg: "Подмини авариралата кола в лентата за движение — под 110 км/ч",
      // ANCHORED ON THE CAR IT NAMES (y = MWE_BREAKDOWN_Y), AND IT WAS NOT.
      //
      // SWEEP 161's second finding against this row: «ticks as a bare position
      // gate … never checked which lane the pass was made from — which is the
      // only thing the task title claims to measure». The radius repair below
      // answered half of it and the mark answers the other half. The mark stood
      // at y = 830, i.e. FIFTY METRES PAST the stalled car at y = 780, so what
      // the disc witnessed was not the pass — it was where the car happened to
      // be afterwards. Measured, production evaluator, on a drive that pulls
      // onto the shoulder at y = 735, rides it past the breakdown, and merges
      // back into the cruise lane by y = 820 at 100 км/ч — the undertake this
      // lesson exists to forbid, done and tidied up before the old mark:
      //     OLD mark y = 830   done = TRUE  at every rung (L1…L5)
      //     NEW mark y = 780   done = false at every rung
      // The two committed counter-demos could not have caught it: both leave
      // the shoulder at y ≈ 660/690 (measured: `mistake-undertake` rides
      // x = 8.13 over y ∈ [361, 659], `mistake-shoulder-cruise` over
      // y ∈ [281, 690]), so both are lawfully in the cruise lane at BOTH marks
      // and complete this row either way. Their EMERGENCY_LANE_DRIVING
      // conviction is the channel that bills them, and it is untouched.
      //
      // AT THE NEW MARK, measured on the committed recordings:
      //     shadow-correct           closest 0.30 m, 4 frames inside at L3 /
      //                              6 at L1, 95.0 км/ч ✓
      //     mistake-undertake        closest 0.56 m ✓ (in the cruise lane here)
      //     mistake-shoulder-cruise  closest 0.47 m ✓ (likewise)
      // and, in the other direction, a plain lawful 100 км/ч cruise-lane pass
      // still completes at every rung while the shoulder-hold and the 139 км/ч
      // blast are refused at every rung, exactly as before this move.
      //
      // The mark is pinned to the actor and not re-typed: the breakdown holds
      // at `offsetM: MWE_BREAKDOWN_Y` on mw-n-nb-start → mw-n-nb-end, an edge
      // that runs (0,0) → (0,1000), so its arc metre IS a district y. The
      // sweep-161 battery asserts the two are the same number, so the gate can
      // never drift off the car again.
      //
      // „RADIUS 6 PINS THE CRUISE LANE — A CAR RIDING THE EMERGENCY LANE MISSES
      // IT" IS WHAT THIS COMMENT USED TO SAY, AND IT WAS FALSE ON THE RUNG THE
      // SWEEP RAN. The ladder multiplies the authored radius, so L1 compiled to
      // 9.00 and the disc reached x = ±9.00 — past the emergency-lane centre at
      // +8.13 AND past the overtaking-lane centre at −8.12. Measured, on a
      // synthetic drive holding x = 8.13 (the shoulder) through the mark of the
      // day, y = 830 — it is refused at the new mark too, and the battery keeps
      // re-measuring it there:
      //     OLD r9.00 (L1)  done = true   ← the undertake certified as „в
      //                                     лентата за движение"
      //     NEW r4.05 (L1)  done = false
      // 2.7 authored (LANE_TRUE_RADIUS_M) is the largest number whose widest
      // rung, 4.05, still sits inside the 4.0625 m half-pitch. The shadow runs
      // x = 0.00 exactly and keeps 4 frames inside at L3, 6 at L1.
      //
      // AND THE CAP, which is the other half of the same finding. This gate
      // carried NO speed demand, so sweep 161's reckless run — 139 км/ч, one
      // lane, never lifted — collected both tasks in 58 s and a three-star
      // ИЗДЪРЖАН, while the careful run got neither. Instruction 1 asks for
      // 100–110 км/ч and instruction 3 asks for a pass „без да докосваш
      // аварийната"; a gate that authorised 139 taught the opposite of both,
      // fifty metres past a stalled car with people around it. This is the
      // LEDGER T18 remedy (sc-ovc-approach's cap 55 → 30) applied to the row
      // that needed it next, and like T18 the number is PUBLISHED in the title
      // so the demand is readable before it is enforced.
      // Measured at the mark: shadow 95.0 км/ч, mistake-undertake 76.8,
      // mistake-shoulder-cruise 76.7 — 15 км/ч of headroom on the tightest
      // rung, and `done` is unchanged for all three (a cap can only ever
      // refuse; objectives.ts proves that monotonicity). Re-measured at the new
      // mark: shadow 95.0, mistake-undertake 100.0, mistake-shoulder-cruise
      // 99.9 — the headroom narrows to 10 км/ч and every one still completes.
      params: {
        kind: "reachZone",
        x: MW_X_CRUISE,
        y: MWE_BREAKDOWN_Y,
        radiusM: LANE_TRUE_RADIUS_M,
        maxSpeedKmh: 110,
      },
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
    lawRef: "ЗДвП чл. 58, т. 4",
    examinerBg:
      "Изпитващият следи лентовата дисциплина: всяко движение по лентата за принудително спиране е опасна грешка — с мигач или без. Аварийната лента се ползва само при принудително спиране, а покрай аварирала кола се минава в лентата за движение, с готовност и внимание.",
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
  staged: [MWE_BREAKDOWN], // ledger T15 — the car the copy has always narrated
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
/** ov-oncoming-v1 ONCOMING lane center (meta.scenario.laneCenterOncomingM) —
 *  the anchor every „you were out there" gate of the corridor family sits on.
 *  The recorded pass line is x = −2.5 (1.56 m short of the centre, on our side
 *  of the oncoming lane), so a LANE_TRUE_RADIUS_M disc centred here contains
 *  the whole oncoming lane at L1 and still never touches our own paint. */
const OVG_ONCOMING = -4.06;
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
      // SWEEP 161, finding «credit is INVERTED»: the two rows of this lesson
      // used to be «изчакай» (own lane, y 150) and «Изпревари в големия
      // прозорец и завърши в своята лента» (own lane, y 540) — and NOTHING
      // between them ever left the lane. The mobile-wrong run — 14 collisions,
      // 141 наказателни точки, straight down its own lane at 90 км/ч — was
      // ticked «✓ Изпревари в големия прозорец и завърши в своята лента 2:31»,
      // while the careful run was not. The word «изпревари» was carried by a
      // coordinate 390 m up the road that a non-overtaker reaches anyway.
      //
      // This gate is the overtake, expressed in the only field a reachZone has:
      // the ONCOMING lane, mid-corridor. The chain is sequential (objectives.ts
      // — only the active one advances), so completing it after `sc-ovg-wait`
      // and before `sc-ovg-finish` is a there-and-back that a lane-holder
      // cannot fake.
      //
      // WHAT THE TITLE STILL DOES NOT SAY, deliberately: «в големия прозорец».
      // The oncoming window is a time-to-contact against three staged cars and
      // `stepReachZone` sees no actor at all, so the clause is struck rather
      // than gated (the cdb2f71 give-way remedy). The duty is not lost — both
      // counter-demos cite OVERTAKE_INSUFFICIENT_GAP and the runtime's corridor
      // adjudicator convicts a pull-out into a closing window on the live run.
      //
      // MEASURED on the committed recordings, production evaluator:
      //   shadow-correct     5 frames inside at L3 / 9 at L1 (closest 1.57 m) ✓
      //   mistake-tight-gap  refused — closest 8.12 m (it is back at x = 4.06
      //                      and stopped by y = 290: its pull-out was 100 m
      //                      earlier, into car 0's ~3.5 s gap)
      //   mistake-overstay   completes (it DID take the big window; its fault
      //                      is the dawdle, and the rules bill it)
      //
      // THIS MAKES THE OVERTAKE REQUIRED to finish this drill. That is a change
      // of substance and is the intended one: doc-72 OV-05 is „изпреварване при
      // достатъчен прозорец", the briefing's step 4 orders the manoeuvre, and
      // the map stages a window ≥ 8 s wide for it. It is NOT the B8 case
      // (lane11-data-truth „no lesson is completable only by overtaking"),
      // whose two rows — sc-ov-crest-curve and sc-ov-solid-return — are drills
      // where DECLINING to overtake is the correct answer and must therefore
      // pass. Here declining is not an answer; it is not doing the exercise.
      id: "sc-ovg-pass",
      titleBg: "Излез в насрещната лента за изпреварването",
      params: { kind: "reachZone", x: OVG_ONCOMING, y: 290, radiusM: LANE_TRUE_RADIUS_M },
    },
    {
      id: "sc-ovg-finish",
      // r5 → 2.7 (LANE_TRUE_RADIUS_M). «в своята лента» on a r5 disc compiled
      // to 7.50 at L1, whose edge is x = −3.44 — 3.44 m INTO the oncoming lane,
      // i.e. the gate that says „back in your own lane" accepted a car still
      // astride the centre line. This is the identical mark and the identical
      // sizing `sc-ovr-finish` already carries one lesson down; the two rows
      // are now the same number for the same reason. Shadow: 10 frames inside
      // at L3, closest 0.17 m.
      titleBg: "Прибери се и завърши в своята лента",
      params: { kind: "reachZone", x: OVG_OWN, y: 540, radiusM: LANE_TRUE_RADIUS_M },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
      // SWEEP 161, finding «credit is inverted again»: the pc-wrong run — 46
      // наказателни точки, 4 collisions, a 0.3 m near-miss — was the ONLY run
      // of four in which this lesson's finishing objective ticked, and BOTH
      // careful drives were told they had not finished. The deeper half is
      // upstream of that: «Прекъсни маневрата» was a bare disc in the OWN lane
      // at y = 250, so a car that never began a manoeuvre was congratulated for
      // interrupting one. You cannot abort something you never started, and a
      // single circle cannot tell the two apart.
      //
      // A CHAIN CAN. This gate is the PULL-OUT — the oncoming lane at y = 200,
      // where the shadow's first (aborted) attempt lives — and the objectives
      // are strictly sequential, so `sc-ova-abort` below now means „was out
      // there, and came back", which is exactly what its sentence claims.
      //
      // MEASURED on the committed recordings, production evaluator:
      //   shadow-correct     6 frames inside at L3 / 9 at L1 (closest 1.57 m) ✓
      //   mistake-push-on    completes (it pulls out too — its fault is
      //                      REFUSING to abort, and OVERTAKE_INSUFFICIENT_GAP
      //                      bills it)
      //   mistake-head-on    completes, same reason, plus COLLISION
      // The demos completing this row is the point: the fault they exist to
      // teach is what happens AFTER the pull-out, and it is `sc-ova-abort`
      // that they now fail — measured below.
      id: "sc-ova-pullout",
      titleBg: "Излез за изпреварване в насрещната лента",
      params: { kind: "reachZone", x: OVG_ONCOMING, y: 200, radiusM: LANE_TRUE_RADIUS_M },
    },
    {
      id: "sc-ova-abort",
      titleBg: "Прекъсни маневрата и се прибери зад бавната кола",
      // r4 → 2.7 (LANE_TRUE_RADIUS_M). „Radius 4 pins the OWN lane center …
      // reachable cleanly only by a driver who tucked back" was the authored
      // intent and the ladder undid it: L1 compiled to 6.00, whose edge is
      // x = −1.94, so a car still straddling the centre line — the very pose
      // this row exists to say the student left — was credited with having
      // tucked back. At 2.7 the widest rung is 4.05 → x ∈ [0.01, 8.11], our own
      // lane and nothing else.
      // Shadow: closest 0.02 m. Both counter-demos are now refused at EVERY
      // rung (closest 5.62 m / 6.57 m — they are out in the oncoming lane at
      // y = 250 because they never aborted); under the old r4 `mistake-push-on`
      // completed this row at L1, which is a drive convicted of pushing on
      // being ticked for breaking off.
      params: { kind: "reachZone", x: OVG_OWN, y: 250, radiusM: LANE_TRUE_RADIUS_M, maxSpeedKmh: 50 },
    },
    {
      id: "sc-ova-finish",
      // TITLE-TRUTH. «Довърши изпреварването на чист път» claimed two things no
      // field on a SimTick carries — that a second overtake happened after the
      // abort, and that the road was clear when it did. The chain proves
      // neither: between `sc-ova-abort` (own lane, y 250) and this mark (own
      // lane, y 540) a car that simply drove on satisfies both. The clause goes
      // (cdb2f71's give-way remedy); what stays is the part the disc does
      // prove, and the radius that makes it true — r5 compiled to 7.50 at L1,
      // reaching 3.44 m into the oncoming lane. Shadow: 10 frames inside at L3,
      // closest 0.22 m.
      //
      // The abort discipline itself is NOT left ungraded: the two counter-demos
      // cite OVERTAKE_INSUFFICIENT_GAP (and COLLISION), the runtime's corridor
      // adjudicator convicts pushing on against a closing window on the live
      // session, and an aborted overtake never convicts — which is this
      // lesson's whole thesis and is proved in s7-ov-corridor-bot-completion.
      titleBg: "Завърши отсечката в своята лента",
      params: { kind: "reachZone", x: OVG_OWN, y: 540, radiusM: LANE_TRUE_RADIUS_M },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  staged: [ovgLeadCar("sc-ova-lead"), OVA_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 12. sc-ov-return-gap — „Прибиране след изпреварване" (OV-09, the overtake's
//     THIRD act) on ov-oncoming-v1 (map REUSED — the sc-ov-abort shared-
//     district precedent). The oncoming lane is deliberately EMPTY: the graded
//     act is the RETURN — cutting back in front of the overtaken vehicle too
//     early (the brake-forcing cut, FO-03's mirror image) — and an oncoming
//     conviction would mask it (the runtime's one-act-one-code stand-down).
// ---------------------------------------------------------------------------

/** OV-09 — връщане вдясно без засичане на изпреварения (ЗДвП чл. 42:
 *  прибираш се едва когато видиш целия изпреваран в огледалото). */
export const SC_OV_RETURN_GAP: ScenarioSpec = {
  id: "sc-ov-return-gap",
  family: "lanes",
  tagsBg: ["изпреварване", "прибиране вдясно", "дистанция", "извънградски път"],
  titleBg: "Прибиране след изпреварване",
  objectiveBg:
    "Изпревари бавната кола на празен насрещен път и се прибери вдясно БЕЗ да я засичаш: връщането е част от маневрата — прибираш се едва когато видиш целия изпреваран автомобил в огледалото за обратно виждане.",
  archetypeIds: ["OV-09"],
  conceptIds: ["c-overtaking-procedure", "c-following-distance", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oncoming-v1.json meta.scenario
    // (tools/maps/gen_ov_oncoming.mjs; shared with sc-ov-oncoming-gap and
    // sc-ov-abort — the mw-v1 shared-district precedent).
    params: { lengthM: OVG_LENGTH, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се установи зад бавната кола — насрещната лента е свободна, изпреварването е разрешено." },
    { n: 2, textBg: "Огледало, мигач наляво и излез решително — подмини бавната кола без бавене." },
    { n: 3, textBg: "НЕ бързай да се прибираш: изпреварването не свършва при подминаването, а при безопасното връщане вдясно." },
    { n: 4, textBg: "Прибери се с десен мигач едва когато видиш ЦЕЛИЯ изпреваран автомобил в огледалото за обратно виждане." },
    { n: 5, textBg: "Плавна дъга обратно в своята лента — без рязък завой пред носа на изпреварения — и продължи до края." },
  ],
  success: [
    {
      id: "sc-ovr-pass",
      titleBg: "Изпревари бавната кола в насрещната лента",
      // „RADIUS 5 ON THE COMMITTED-PASS LINE (x = −2.5): SATISFIABLE ONLY BY A
      // GENUINE PASS THROUGH THE ONCOMING LANE" — that was this row's authored
      // claim, and sweep 161 caught it being false on the rung beginners drive.
      // The ladder multiplies: L1 compiled to 7.50 around x = −2.5, so the disc
      // reached x = +5.00 and swallowed the OWN lane centre at +4.06. The
      // 2026-08-16 pc-right run held its own lane for the entire 210 s — top
      // speed 15 км/ч, 27 full stops, never across the centre line — and was
      // ticked «✓ Изпревари бавната кола в насрещната лента 2:49». So were the
      // other three runs, including a reckless one that ploughed the lead car.
      //
      // TWO NUMBERS FIX IT, and both are read off the district rather than
      // chosen: the mark moves onto the ONCOMING LANE CENTRE (OVG_ONCOMING,
      // meta.scenario.laneCenterOncomingM) and the radius becomes the
      // lane-true one, so the widest compiled disc is x ∈ [−8.11, −0.01] —
      // the oncoming lane exactly, never our own paint at any rung.
      // Measured, production evaluator, synthetic own-lane-only drive
      // (x = 4.06 throughout):
      //     OLD  L1 r7.50 @ x −2.5   done = true    ← the sweep's false tick
      //     OLD  L2 r6.25 @ x −2.5   done = false
      //     NEW  L1 r4.05 @ x −4.06  done = false
      // and on the committed recordings:
      //     shadow-correct   5 frames inside at L3 / 9 at L1 (closest 1.58 m,
      //                      the pass line sits 1.56 m off the lane centre) ✓
      //     mistake-early-cut / mistake-fast-cut  refused (closest 5.22 /
      //                      8.13 m — both are already back on our side by
      //                      y = 250, which is the fault they demonstrate);
      //                      under the old disc `mistake-fast-cut` completed
      //                      this row at L1 from x = 4.06, its own lane.
      params: { kind: "reachZone", x: OVG_ONCOMING, y: 250, radiusM: LANE_TRUE_RADIUS_M },
    },
    {
      id: "sc-ovr-finish",
      // TITLE-TRUTH (doc 86 D3, the reachZone census after cdb2f71). It read
      // «Прибери се вдясно с дистанция и завърши» and BOTH halves were false in
      // different ways.
      //
      // «С ДИСТАНЦИЯ» — UNPROVABLE, so it goes (the give-way remedy). The gap
      // this drill is about is the one to the car BEHIND you at the moment you
      // tuck in; `SimTick` carries no rear gap at all, and `stepReachZone`
      // reads no gap of any kind — measured, not assumed: a tick carrying
      // `leadGapM: 0.2` (bumper touching) at a mark completes the zone. So the
      // clause could never be checked, and it is not lost by leaving: BOTH
      // mistake demos of this very template cite OVERTAKE_RETURN_TOO_EARLY,
      // which is the code that convicts an early tuck-in, and instruction 4
      // («едва когато видиш ЦЕЛИЯ изпреваран в огледалото») still teaches it.
      //
      // «ВДЯСНО» — PROVABLE, and the radius did not prove it. Lane pitch is
      // 8.125 m (own centre +4.06, oncoming −4.06), so the disc must stay
      // inside half a pitch — 4.0625 m — of the mark or a car still straddling
      // the centre line is credited with having come back. The AUTHORED radius
      // is the L3 radius; the ladder widens the place by up to
      // `toleranceScale − 1` of it (scenario/params.ts widenRadius, ceiling
      // REACH_ZONE_GRACE_M = 5, chain budget here 141 m so it never binds), so
      // the shipped r5 compiled to:
      //     L1 7.50 → disc edge x = −3.44   (3.44 m INTO the oncoming lane)
      //     L2 6.25 → x = −2.19
      //     L3/4/5 5.00 → x = −0.94
      // — every rung across the centre line, and the aided rungs, where the
      // beginners are, within 0.6 m of the oncoming lane CENTRE.
      //
      // 2.7 is sized backwards from the widest rung so the claim and the number
      // are one thing: 2.7 × 1.5 = 4.05 at L1 (edge x = +0.01, still on our own
      // paint), 3.38 at L2 (x = +0.68), 2.7 at L3/L4/L5 (x = +1.36).
      //
      // REACHABLE, measured on the shipped shadow through the production stack
      // at every rung: it drives this street on the lane centre and sits at
      // x = 4.06 EXACTLY across the circle (closest approach 0.20 m from the
      // mark, 40.1–45.4 км/ч), so shrinking the disc costs only along-track
      // frames — 14 / 12 / 10 / 10 / 10 at L1…L5, where r5 gave 28 / 23 / 18 —
      // and both mistake demos enter NEITHER radius (they end at y = 400 and
      // y = 410, i.e. 130–140 m short of this mark), so nothing regresses in
      // either direction.
      //
      // ITS TWO NEIGHBOURS HAVE NOW FOLLOWED (sweep 161). `sc-ovg-finish` and
      // `sc-ova-finish` sat on the SAME mark of the same map at the same r5 and
      // made the same claim («…в своята лента»); this wave sized both to the
      // same 2.7 (LANE_TRUE_RADIUS_M) against their own committed recordings,
      // so the three rows are one number for one reason. The remaining rows of
      // the 26-row lane-claim census stay machine-checked and shrink-only in
      // __tests__/objective-title-truth-lanes-following2-rail2.test.ts, so the
      // list cannot grow while the rest wait.
      // ── OPEN, MEASURED, AND DELIBERATELY NOT CHANGED TONIGHT ───────────────
      //
      // Shrinking r fixed the false CERTIFICATE and introduced a small false
      // REFUSAL at the other end. Measured, synthetic straight runs at every
      // lateral x through the compiled disc:
      //     L1 r=4.05 accepts x ∈ [0.25, 8.00]
      //     L2 r=3.38 accepts x ∈ [0.75, 7.25]
      //     L3/L4/L5 r=2.70 accepts x ∈ [1.50, 6.75]
      // A real-size car fully inside its own paint has centre x ∈ [0.92, 7.21],
      // so at the three unaided rungs a car tucked hard against the KERB —
      // x ∈ (6.75, 7.21], which is precisely where this title's own verb points
      // — is refused. The disc checks lane-CENTRE proximity; the title claims
      // lane MEMBERSHIP, and a circle on the centre cannot express the second.
      //
      // The fix is to move the MARK rather than the radius: centring it right
      // of the lane centre (≈ x 5.0) accepts the kerb-side band at every rung
      // while L1's widened 4.05 still lands at x ≈ 0.95, i.e. clear of the
      // centre line. That is a geometry change against a committed recording
      // and it belongs with the 26-row lane-claim census above, measured, not
      // typed in from a report at the end of a long session — the same
      // discipline that stopped a free-running-mirror "fix" from re-buying the
      // 0d1c922 FPS regression today.
      //
      // Impact bound, so the decision is reviewable: the refused band is the
      // outer ~0.45 m at the kerb, at L3+ only, and the shipped shadow sits at
      // x = 4.06 dead centre and passes at every rung.
      titleBg: "Прибери се вдясно в своята лента и завърши отсечката",
      params: { kind: "reachZone", x: OVG_OWN, y: 540, radiusM: 2.7 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvReturnGap.ts; gates in traces/__tests__/
  // sc-ov-return-gap-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-return-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-return-gap/mistake-early-cut.trace.json" },
      titleBg: "Ранно прибиране пред изпреварения",
      whatWentWrongBg:
        "Колата подмина бавния автомобил и веднага се прибра — на метри пред носа му, под секунда дистанция. Така принуждаваш изпреварения да спира заради твоята маневра: същото вклиняване, от което всеки водач се пази. Прибираш се едва когато го видиш целия в огледалото (чл. 42).",
      codeRefs: ["OVERTAKE_RETURN_TOO_EARLY"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-return-gap/mistake-fast-cut.trace.json" },
      titleBg: "Засичане при бързо изпреварване",
      whatWentWrongBg:
        "„Минах бързо, значи мога и бързо да се прибера“ — но скоростта на изпреварването не променя дистанцията на връщането: колата се вряза пред изпреварения със същата половин секунда запас. Колкото по-бързо минаваш, толкова по-лесно е да изчакаш още миг и да се прибереш широко.",
      codeRefs: ["OVERTAKE_RETURN_TOO_EARLY"],
    },
  ],
  teach: {
    whenBg:
      "При всяко изпреварване — връщането вдясно е третото действие на маневрата, след преценката и подминаването. Сигурен ориентир: виждаш ли ЦЕЛИЯ изпреваран автомобил в огледалото за обратно виждане, разстоянието стига.",
    whyBg:
      "Ранното прибиране принуждава изпреварения да спира — а спирачка на 90 км/ч заради чуждо вклиняване е готов сценарий за верижна катастрофа. Изпреварването не е състезание до пролуката: секунда по-късно прибиране не струва нищо, секунда по-рано струва нечия спирачка (чл. 42).",
    lawRef: "ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа завършека на маневрата: навременен десен мигач, връщане с плавна дъга и ДИСТАНЦИЯ пред изпреварения — без да го засичаш. Прибиране непосредствено пред носа на изпреварения е основна грешка и разваля иначе чисто изпреварване.",
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
  staged: [ovgLeadCar("sc-ovr-lead")],
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
  SC_OV_RETURN_GAP,
];
