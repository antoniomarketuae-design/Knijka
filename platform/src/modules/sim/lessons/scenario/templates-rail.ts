/**
 * Scenario templates — the RAIL family, ADR-006 stage 3a slice 1 (doc 72 §12
 * „Family RX — Railway & tram crossings"): the RAILWAY CROSSING as world data
 * + grading, NO tram actor yet (that is stage 3b). DATA ONLY in the
 * templates.ts mold (coordinates denormalized from the committed district
 * files; the trace-gate batteries assert every pinned value against the
 * generated maps):
 *
 *  - sc-rx-unguarded „Неохраняем жп прелез"        (RX-02, rx-unguarded-v1)
 *  - sc-rx-guarded   „Охраняем прелез с бариера"   (RX-01, rx-guarded-v1)
 *
 * Both are pure world-data drills: NO staged actor, ambient traffic ZERO
 * (seed 7) — the trap is the CROSSING itself (the authored track-band span +
 * the guarded map's deterministic barrier timetable), so the only gradable
 * act is the driver's own crossing discipline. Every mistake demo cites the
 * ONE dedicated rail code and grades EXACTLY it through the production stack
 * (the §5/§9 gates, traces/__tests__/sc-rx-*-traces.test.ts):
 *   - RX-02 → RAIL_CROSSING_VIOLATION (опасна: unguarded band entry without
 *     the mandatory full stop — the Б2 full-stop ledger pointed at the rails;
 *     and coming to rest ON the band — the mid-tracks hesitation);
 *   - RX-01 → RAIL_CROSSING_VIOLATION (опасна: entering while the barrier is
 *     down — fast or as a polite-stop-then-creep weave).
 * The LEGAL ASYMMETRY is proven on the guarded map: crossing a GUARDED-OPEN
 * crossing without stopping is legal (чл. 52 — no stop duty where a barrier
 * does the guarding), which is exactly how the guarded shadow crosses.
 *
 * Family: "rail" — a NEW catalog chip (additive: ScenarioFamily +
 * SCENARIO_FAMILIES + the catalog icon 🚂); no existing chip covers rail.
 *
 * Doc-72 provenance note: doc 72 §12 numbers the GUARDED crossing RX-01 and
 * the UNGUARDED one RX-02 — the archetypeIds below follow the doc.
 *
 * KNOWN VISUAL GAP (honest, the 2a/2b precedent): no А34/А35/СТОП-cross GLB
 * assets, no track-band paint, no barrier-arm/РЖ-lamp prop exist yet — the
 * crossings GRADE exactly (authored spans + timetable), the scenario copy and
 * ghost narration carry the visual story until an asset drop.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the rail-district battery asserts the copies match the maps)
// ---------------------------------------------------------------------------

/** rx-*-v1 (1+1 street): the single northbound lane center. */
const RX_LANE = 4.06;
/** rx-*-v1: the track band along the street (meta.scenario.railCrossing). */
const RX_BAND_FROM = 150;
const RX_BAND_TO = 156;
/** rx-*-v1: the СТОП-cross / barrier stop line (meta.scenario stopLineY). */
const RX_STOP_LINE_Y = 145;
/** rx-guarded-v1: the deterministic barrier timetable (down [0, 40) of 90 s). */
const RXG_BARRIER_CYCLE_SEC = 90;
const RXG_BARRIER_DOWN_FROM_SEC = 0;
const RXG_BARRIER_DOWN_TO_SEC = 40;

// ---------------------------------------------------------------------------
// 1. sc-rx-unguarded — „Неохраняем жп прелез" (RX-02) on rx-unguarded-v1
//    (300 m 1+1 street, limit 50, unguarded track band @ y ∈ [150, 156])
// ---------------------------------------------------------------------------

/** RX-02 — неохраняем прелез (ЗДвП чл. 51–53): водачът Е бариерата — пълно
 *  спиране преди релсите, оглеждане в двете посоки, решително преминаване
 *  без спиране върху коловоза. */
export const SC_RX_UNGUARDED: ScenarioSpec = {
  id: "sc-rx-unguarded",
  family: "rail",
  tagsBg: ["жп прелез", "неохраняем прелез", "СТОП", "оглеждане"],
  titleBg: "Неохраняем жп прелез",
  objectiveBg:
    "Премини неохраняемия жп прелез по желязното правило: пълно спиране преди релсите, оглеждане наляво и надясно по линията и решително преминаване — без да спираш върху коловоза.",
  archetypeIds: ["RX-02"],
  conceptIds: ["c-railway-crossing", "c-give-way-stop-behavior", "c-warning-signs"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in rx-unguarded-v1.json meta.scenario
    // .params (tools/maps/gen_rail_crossing.mjs).
    params: {
      lengthM: 300,
      maxspeedKmh: 50,
      crossingFromM: RX_BAND_FROM,
      crossingToM: RX_BAND_TO,
      guarded: "unguarded",
    },
    districtId: "rx-unguarded-v1",
  },
  start: {
    spawnPointId: "rxu-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред има неохраняем жп прелез (знак А35 и Андреевски кръст), без бариери и без светлини." },
    { n: 2, textBg: "Намали отрано: на неохраняем прелез ТИ си бариерата — никой друг няма да спре влака." },
    { n: 3, textBg: "Спри напълно на стоп-линията преди релсите — колелата неподвижни, не „почти спрях“." },
    { n: 4, textBg: "Огледай се в двете посоки по линията — наляво и надясно, докъдето стига погледът." },
    { n: 5, textBg: "Премини решително и без колебание — върху релсите не се спира никога — и продължи до края." },
  ],
  success: [
    {
      id: "sc-rxu-stop",
      titleBg: "Спри напълно на стоп-линията преди релсите",
      // Completable ONLY at near-stop speed at the СТОП-cross line (the
      // pk-smooth-stop mark discipline) — the stop IS the drill.
      params: { kind: "reachZone", x: RX_LANE, y: RX_STOP_LINE_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-rxu-finish",
      titleBg: "Премини прелеза и стигни края на отсечката",
      params: { kind: "reachZone", x: RX_LANE, y: 285, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxUnguarded.ts; gates in traces/__tests__/sc-rx-unguarded-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-unguarded/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-unguarded/mistake-roll-through.trace.json" },
      titleBg: "Преминаване без спиране",
      whatWentWrongBg:
        "Колата премина неохраняемия прелез с 30 км/ч, без изобщо да спре — „нали нищо не се чува“. На прелез без бариери пълното спиране и оглеждането са задължителни: влакът идва с 100+ км/ч, не може нито да спре, нито да те заобиколи, а на селските линии често се чува чак когато е късно. Това е опасна грешка (чл. 51–53).",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-unguarded/mistake-stop-on-track.trace.json" },
      titleBg: "Спиране върху релсите",
      whatWentWrongBg:
        "Водачът спря правилно преди прелеза, но след потеглянето се поколеба и замръзна по средата на коловоза. Върху релсите не се спира никога — колона, колебание или загасване върху прелеза е смъртоносният сценарий: премини решително и спри чак след като целият автомобил е отвъд релсите.",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки неохраняем жп прелез — знак А35 „Железопътен прелез без бариери“ и Андреевският кръст. Най-често по селски и второстепенни пътища, точно където видимостта е лоша и никой не очаква влак.",
    whyBg:
      "Катастрофите на прелез са редки, но почти винаги смъртоносни — влакът не може да спре (спирачният му път е над километър) и не може да завие. На неохраняемия прелез никой не пази вместо теб: пълното спиране и двойното оглеждане са единствената бариера, а решителното преминаване гарантира, че няма да останеш върху релсите.",
    lawRef: "ЗДвП чл. 51–53",
    examinerBg:
      "Изпитващият следи ритуала на прелеза: навременно намаляване, ПЪЛНО спиране преди релсите, оглеждане в двете посоки и решително преминаване без спиране върху коловоза. Преминаване без спиране или спиране върху релсите е опасна грешка от прекратяващия клас.",
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
// 2. sc-rx-guarded — „Охраняем прелез с бариера" (RX-01) on rx-guarded-v1
//    (300 m 1+1 street, limit 50, guarded track band @ y ∈ [150, 156],
//    barrier down [0, 40) of every 90 s — the deterministic timetable)
// ---------------------------------------------------------------------------

/** RX-01 — охраняем прелез (ЗДвП чл. 51–52): при спуснати или спускащи се
 *  бариери не се навлиза — никога; при вдигнати бариери преминаваш без
 *  спиране върху коловоза (отворен охраняем прелез не носи задължение за
 *  спиране — чл. 52 асиметрията спрямо неохраняемия). */
export const SC_RX_GUARDED: ScenarioSpec = {
  id: "sc-rx-guarded",
  family: "rail",
  tagsBg: ["жп прелез", "бариера", "охраняем прелез", "търпение"],
  titleBg: "Охраняем прелез с бариера",
  objectiveBg:
    "Пристигаш пред жп прелез със спуснати бариери: изчакай търпеливо зад стоп-линията, докато се вдигнат напълно, и премини едва тогава — решително, без да спираш върху релсите.",
  archetypeIds: ["RX-01"],
  conceptIds: ["c-railway-crossing", "c-warning-signs", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in rx-guarded-v1.json meta.scenario
    // .params (tools/maps/gen_rail_crossing.mjs).
    params: {
      lengthM: 300,
      maxspeedKmh: 50,
      crossingFromM: RX_BAND_FROM,
      crossingToM: RX_BAND_TO,
      guarded: "guarded",
      barrierCycleSec: RXG_BARRIER_CYCLE_SEC,
      barrierDownFromSec: RXG_BARRIER_DOWN_FROM_SEC,
      barrierDownToSec: RXG_BARRIER_DOWN_TO_SEC,
    },
    districtId: "rx-guarded-v1",
  },
  start: {
    spawnPointId: "rxg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерите са спуснати: минава влак." },
    { n: 2, textBg: "Намали отрано и спри зад стоп-линията — не плътно до бариерата и никога върху релсите." },
    { n: 3, textBg: "Изчакай търпеливо: бариерата се вдига чак когато линията е чиста. Не се промъквай и не криволичи покрай нея — никога." },
    { n: 4, textBg: "Едва след ПЪЛНОТО вдигане на бариерите се огледай и премини решително, без спиране върху коловоза." },
    { n: 5, textBg: "Продължи спокойно до края на отсечката." },
  ],
  success: [
    {
      id: "sc-rxg-wait",
      titleBg: "Изчакай зад стоп-линията пред бариерата",
      // Completable ONLY at near-stop speed at the barrier line — the wait IS
      // the drill (a blast-through at speed can never satisfy it).
      params: { kind: "reachZone", x: RX_LANE, y: RX_STOP_LINE_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-rxg-finish",
      titleBg: "Премини прелеза след вдигането и стигни края",
      params: { kind: "reachZone", x: RX_LANE, y: 285, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 95 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxGuarded.ts; gates in traces/__tests__/sc-rx-guarded-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-guarded/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-guarded/mistake-run-barrier.trace.json" },
      titleBg: "Навлизане при спуснати бариери",
      whatWentWrongBg:
        "Колата премина прелеза с 30 км/ч, докато бариерите бяха спуснати — „ще мина преди влака“. Точно това е фаталният ход на прелеза: бариерата слиза, защото влакът вече е в участъка, а надбягването с него е катастрофа с почти сигурен смъртен изход. При спуснати или спускащи се бариери не се навлиза — никога (чл. 51–52).",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-guarded/mistake-creep-barred.trace.json" },
      titleBg: "Промъкване покрай бариерата",
      whatWentWrongBg:
        "Водачът спря учтиво пред прелеза, но не изчака: пропълзя напред и се промъкна през коловоза при още спуснати бариери. Учтивото спиране не оправдава нищо — забраната важи до пълното вдигане на бариерите, а „бавно и внимателно“ върху релсите те оставя точно там, където влакът не може да те пропусне.",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки охраняем жп прелез — знак А34, бариери и мигаща червена светлина. Спуснати или СПУСКАЩИ СЕ бариери значат едно: влак в участъка. При вдигнати бариери преминаваш без спиране — но винаги с готовност и без да оставаш върху релсите.",
    whyBg:
      "Надбягването с бариерата е най-смъртоносният навик на пътя: бариерата не „затваря по разписание“, а защото влакът вече идва. Криволиченето покрай полубариери и пропълзяването „само този път“ убиват точно защото влакът нито спира, нито завива. Търпението пред прелеза струва две минути; всичко друго може да струва всичко.",
    lawRef: "ЗДвП чл. 51–52",
    examinerBg:
      "Изпитващият следи поведението пред затворен прелез: навременно спиране зад стоп-линията, търпеливо изчакване без промъкване и преминаване едва след пълното вдигане на бариерите. Навлизане при спуснати бариери е опасна грешка от прекратяващия клас.",
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

/** The rail-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_RAIL: readonly ScenarioSpec[] = [
  SC_RX_UNGUARDED,
  SC_RX_GUARDED,
];
