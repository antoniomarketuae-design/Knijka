/**
 * Scenario templates — the RAIL family (doc 72 §12 „Family RX — Railway &
 * tram crossings"). Slice 1 (ADR-006 stage 3a): the RAILWAY CROSSING as world
 * data + grading. Slice 2 (stage 3b): the TRAM as the rail pack's ACTOR —
 * profile "tram" on the shipped staged-vehicle seam (a tram is a path-locked
 * actor; its authored lane polyline IS the track — street-running rails, no
 * separate rail physics, honestly). DATA ONLY in the templates.ts mold
 * (coordinates denormalized from the committed district files; the trace-gate
 * batteries assert every pinned value against the generated maps):
 *
 *  - sc-rx-unguarded  „Неохраняем жп прелез"        (RX-02, rx-unguarded-v1)
 *  - sc-rx-guarded    „Охраняем прелез с бариера"   (RX-01, rx-guarded-v1)
 *  - sc-rx-tram-left  „Ляв завой през трамвайно трасе" (RX-05, sx-v1 — honest
 *    map REUSE: the shipped signalized X junction hosts the left-turn-across-
 *    tram exactly as it hosts sc-turn-left-oncoming; the sc-vu-emergency-
 *    junction precedent — same adjudicator, a rail-bound actor, the teach
 *    copy carries the tram lesson)
 *  - sc-rx-tram-island „Трамвайна спирка с остров"  (RX-04, rx-tram-island-v1)
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

import type { OncomingLeftTurnSpec, PedestrianDartOutSpec, TrainPassSpec } from "../../contracts";
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
/** rx-*-v1: the track-band centre (meta.scenario.railCrossing.bandCenterY). */
const RX_BAND_CENTER_Y = 153;
/** rx-*-v1: the СТОП-cross / barrier stop line (meta.scenario stopLineY). */
const RX_STOP_LINE_Y = 145;
/** rx-*-v1: the perpendicular rail line the staged TRAIN rides — east→west at
 *  the band centre, reaching well off-frame both ways (meta.scenario
 *  .railCrossing.railPath; pinned by value, the rail-district battery asserts
 *  the copy matches the generated map — the L7 pattern). */
const RX_RAIL_PATH: ReadonlyArray<{ x: number; y: number }> = [
  { x: -130, y: RX_BAND_CENTER_Y },
  { x: 130, y: RX_BAND_CENTER_Y },
];

/**
 * The staged TRAIN crossing (ADR-006 stage 3c — the RX „жп прелез" gets a real
 * train). A locomotive + 2 cars ride RX_RAIL_PATH across the carriageway,
 * released when the player is within 55 m of the crossing so the mandatory
 * „stop and look" meets an actual train — not empty rails. BYTE-NEUTRAL to
 * grading: the TrainPassRunner emits ZERO SimTick events, so the existing
 * world-data rail-crossing detectors alone convict a driver who fails to stop
 * (guarded maps keep their own barrier timetable unchanged). The train never
 * brakes for the player — it IS the hazard.
 */
function railTrainPassEvent(id: string): TrainPassSpec {
  return {
    id,
    kind: "trainPass",
    railPath: RX_RAIL_PATH,
    // Train centre waits ~50 m west of the street axis (off-frame) then runs
    // east; at 12 m/s it reaches the carriageway ~when the player is at the
    // СТОП line, so it visibly crosses while the driver stops and looks.
    holdOffsetM: 80,
    cruiseSpeedMps: 12,
    accelMps2: 3.5,
    triggerPlayerDistM: 55,
    crossing: { x: RX_LANE, y: RX_BAND_CENTER_Y },
    colorIndex: 0,
  };
}
/** rx-guarded-v1: the deterministic barrier timetable (down [0, 40) of 90 s). */
const RXG_BARRIER_CYCLE_SEC = 90;
const RXG_BARRIER_DOWN_FROM_SEC = 0;
const RXG_BARRIER_DOWN_TO_SEC = 40;
/** rx-drop-v1: the DESCENDING-barrier timetable — OPEN at spawn, down [20, 60)
 *  of every 90 s (the barrier drops in front of the player at t = 20). */
const RXD_BARRIER_CYCLE_SEC = 90;
const RXD_BARRIER_DOWN_FROM_SEC = 20;
const RXD_BARRIER_DOWN_TO_SEC = 60;

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
  // ADR-006 stage 3c: a real TRAIN crosses as the player approaches — the
  // hazard the mandatory full stop exists for (unguarded: NO barrier, the
  // train + the stop duty IS the lesson). Byte-neutral to grading.
  staged: [railTrainPassEvent("sc-rxu-train")],
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
    { n: 1, textBg: "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерите са спуснати: линията не е свободна." },
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
  // ADR-006 stage 3c: the TRAIN whose approach the barrier guards — it crosses
  // while the arm is down. The barrier timetable is unchanged; the train adds
  // no grading (world-data detectors alone convict).
  staged: [railTrainPassEvent("sc-rxg-train")],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2b. sc-rx-barrier-drop — „Бариерата тръгва надолу" (RX-01, the DESCENDING
//     barrier) on rx-drop-v1 (300 m 1+1 street, limit 50, guarded track band @
//     y ∈ [150, 156], stop line y = 145, barrier OPEN at spawn and down
//     [20, 60) of every 90 s — the drop happens IN FRONT of the player at
//     t = 20, world data, no per-attempt director arming)
//
// THE SIBLING OF sc-rx-guarded (honest map contrast, not reuse): sc-rx-guarded
// arrives to a barrier ALREADY down ([0, 40)); this drill spawns with the
// barrier UP and watches it DESCEND ([20, 60)). The lesson is чл. 52's other
// half — „СПУСКАЩИ СЕ бариери" are as absolute as lowered ones: the moment the
// arm starts down, entry is forbidden, and racing it under is the fatal move.
// The barrier is WORLD DATA (rx-drop-v1's timetable), so no staged actor is
// needed — the descent is deterministic in session time, same phases always.
// ---------------------------------------------------------------------------

/** RX-01 „спускане" — охраняем прелез със спускаща се бариера (ЗДвП чл. 52: при
 *  спуснати ИЛИ СПУСКАЩИ СЕ бариери не се навлиза — никога; преминаваш едва
 *  след пълното им вдигане, без да спираш върху коловоза). */
export const SC_RX_BARRIER_DROP: ScenarioSpec = {
  id: "sc-rx-barrier-drop",
  family: "rail",
  tagsBg: ["жп прелез", "спускаща се бариера", "охраняем прелез", "търпение"],
  titleBg: "Бариерата тръгва надолу",
  objectiveBg:
    "Пристигаш пред жп прелез с вдигната бариера — но тя тръгва надолу пред теб. Спри зад стоп-линията и изчакай пълното ѝ вдигане; не се гмуркай под спускащата се бариера и никога не спирай върху релсите.",
  archetypeIds: ["RX-01"],
  conceptIds: ["c-railway-crossing", "c-warning-signs", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in rx-drop-v1.json meta.scenario.params
    // (tools/maps/gen_rail_crossing.mjs; identical to rx-guarded-v1 EXCEPT the
    // barrier is OPEN at spawn and descends at t = 20 — down [20, 60) of 90 s).
    params: {
      lengthM: 300,
      maxspeedKmh: 50,
      crossingFromM: RX_BAND_FROM,
      crossingToM: RX_BAND_TO,
      guarded: "guarded",
      barrierCycleSec: RXD_BARRIER_CYCLE_SEC,
      barrierDownFromSec: RXD_BARRIER_DOWN_FROM_SEC,
      barrierDownToSec: RXD_BARRIER_DOWN_TO_SEC,
    },
    districtId: "rx-drop-v1",
  },
  start: {
    spawnPointId: "rxd-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред има охраняем жп прелез (знак А34). Бариерата е вдигната, но всеки момент може да тръгне надолу." },
    { n: 2, textBg: "Намали отрано. Щом бариерата започне да се спуска, спри зад стоп-линията — не се гмуркай под нея, за да „успееш“." },
    { n: 3, textBg: "Изчакай търпеливо: спускащата се бариера значи влак в участъка. Не се промъквай и не влизай, докато не се вдигне напълно — никога." },
    { n: 4, textBg: "Едва след ПЪЛНОТО вдигане на бариерата се огледай и премини решително, без спиране върху коловоза." },
    { n: 5, textBg: "Продължи спокойно до края на отсечката." },
  ],
  success: [
    {
      id: "sc-rxd-wait",
      titleBg: "Изчакай зад стоп-линията пред спускащата се бариера",
      // Completable ONLY at near-stop speed at the barrier line — the wait IS
      // the drill (diving under the descending arm can never satisfy it).
      params: { kind: "reachZone", x: RX_LANE, y: RX_STOP_LINE_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-rxd-finish",
      titleBg: "Премини прелеза след вдигането и стигни края",
      params: { kind: "reachZone", x: RX_LANE, y: 285, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 110 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxBarrierDrop.ts; gates in traces/__tests__/sc-rx-barrier-drop-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-barrier-drop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-barrier-drop/mistake-dive-barrier.trace.json" },
      titleBg: "Гмуркане под спускащата се бариера",
      whatWentWrongBg:
        "Бариерата тръгна надолу, но колата се хвърли през прелеза, за да „успее преди влака“. Точно това е фаталният ход: бариерата се спуска, защото влакът ВЕЧЕ е в участъка, а надбягването с него е катастрофа с почти сигурен смъртен изход. При спуснати или спускащи се бариери не се навлиза — никога (чл. 52).",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-barrier-drop/mistake-stop-on-track.trace.json" },
      titleBg: "Спиране върху релсите",
      whatWentWrongBg:
        "Колата влезе на прелеза при още вдигната бариера, но се поколеба и спря върху коловоза — а бариерата тръгна надолу точно над нея. Върху релсите не се спира никога: премини на едно движение и спри чак когато целият автомобил е отвъд релсите. Замръзването между релсите, докато бариерата слиза, е сценарият, който убива.",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки охраняем жп прелез, към който приближаваш с вдигната бариера — тя може да тръгне надолу всеки момент. Спускащата се бариера и мигащата червена светлина значат едно: влак в участъка. Преминаваш едва след пълното ѝ вдигане.",
    whyBg:
      "Спускащата се бариера е най-подценяваната опасност на прелеза: изглежда, че „още има време“, и водачът се гмурка под нея. Но бариерата не пада по разписание — пада, защото влакът вече идва, и спирачният му път е над километър. Гмуркането под спускащия се лост и замръзването върху релсите убиват по една и съща причина: озоваваш се на коловоза точно когато влакът не може нито да спре, нито да те заобиколи. Търпението пред прелеза струва две минути; всичко друго може да струва всичко.",
    lawRef: "ЗДвП чл. 52",
    examinerBg:
      "Изпитващият следи поведението пред спускаща се бариера: навременно спиране зад стоп-линията в мига, в който лостът тръгне надолу, търпеливо изчакване без промъкване и преминаване едва след пълното вдигане, без спиране върху коловоза. Навлизане под спускаща се бариера е опасна грешка от прекратяващия клас.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    { level: 5 },
  ],
  // ADR-006 stage 3c: the descending barrier drops BECAUSE this train is
  // coming — it crosses in front of the waiting player. Grading unchanged.
  staged: [railTrainPassEvent("sc-rxd-train")],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-rx-tram-left — „Ляв завой през трамвайно трасе" (RX-05) on sx-v1
//    (the SHIPPED signalized X junction — honest map reuse: sc-turn-left-
//    oncoming's site, with the oncoming actor a street-running TRAM)
//
// Doc-72 provenance note: §12 numbers the ISLAND stop RX-04 and the
// in-carriageway tracks RX-05 („Релси в платното" — the left-turn-across-tram
// is Sofia's signature heavy crash; "rides N1 + RX-04's actor"). The
// archetypeIds below follow the doc.
//
// HONEST LIMITS (documented once, here): (a) the tram actor is point-based
// like every staged vehicle — the N1 gap tiers measure its BODY CENTER, so
// the authored gapSec 1.6 puts the 14 m tram's NOSE well inside the ≤ 2 s
// conviction band at commit (7 m nose lead ÷ 8 m/s ≈ 0.9 s closer than the
// center reads); (b) no rail-pair strip renders on sx-v1 — the markings
// builder has no dark-paint channel (the 3a precedent: grading never reads
// paint; the rig + copy + narration carry the rails).
// ---------------------------------------------------------------------------

/**
 * The oncoming TRAM straight through sx-n-c from the west (the SC_LTAP_TIGHT
 * recipe with a rail-bound actor): cruise 8 m/s (~29 km/h — tram pace),
 * gapSec 1.6 — inside the LEFT_TURN_CONVICT_GAP_SEC = 2.0 band, so cutting
 * across it grades EXACTLY FAILED_TO_YIELD (left-turn-oncoming) through the
 * runtime's own N1 tracker, while the shadow waits it out and turns clean.
 * ONE actor (no follow car): after the tram clears, the street is empty —
 * the RX-05 decision is binary (the tram, or the wait).
 */
export const SC_RX_TRAM_LEFT_EVENT: OncomingLeftTurnSpec = {
  id: "sc-rxtl-tram",
  kind: "oncomingLeftTurn",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"],
    hold: { nodeIndex: 1, offsetM: -80 },
    cruiseSpeedMps: 8,
    colorIndex: 0,
    profile: "tram", // the articulated rig (ADR-001 fictional livery)
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 1.6,
  clearSpeedMps: 11,
};

/** RX-05 — релси в платното (ЗДвП чл. 8, ал. 2: при разрешено едновременно
 *  преминаване нерелсовото ППС пропуска релсовото НЕЗАВИСИМО от посоката му;
 *  чл. 37: при ляв завой пропусни насрещните). Трамваят спира 3× по-дълго от
 *  кола и не може да завие — левият завой през трасето е подписната тежка
 *  катастрофа на София. */
export const SC_RX_TRAM_LEFT: ScenarioSpec = {
  id: "sc-rx-tram-left",
  family: "rail",
  tagsBg: ["трамвай", "релси в платното", "ляв завой", "предимство"],
  titleBg: "Ляв завой през трамвайно трасе",
  objectiveBg:
    "Завий наляво през кръстовище с релси в платното: насреща идва трамвай — той има предимство ВИНАГИ, спира многократно по-дълго от кола и не може да завие. Изчакай го да премине изцяло и завий едва тогава.",
  archetypeIds: ["RX-05"],
  conceptIds: ["c-tram-priority", "c-left-turn-oncoming", "c-turning-left-junction"],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in sx-v1.json meta.scenario.params
    // (tools/maps/gen_signal_x.mjs; honest REUSE of the shipped junction —
    // the E–W street carries the street-running tram corridor as copy).
    params: {
      armNorthM: 90,
      armSouthM: 120,
      armEastM: 120,
      armWestM: 170,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "sx-v1",
  },
  start: {
    spawnPointId: "sx-spawn-east",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни на запад по улицата с вградени в платното релси — на кръстовището ще завиваш наляво, на юг." },
    { n: 2, textBg: "Пусни ляв мигач отрано и намали — завоят пресича насрещната релсова лента." },
    {
      n: 3,
      textBg:
        "Насреща се задава трамвай. Той има предимство независимо от посоката си: спирачният му път е в пъти по-дълъг и не може да те заобиколи — релсите не завиват.",
    },
    { n: 4, textBg: "Изчакай пред устието, без да навлизаш върху релсите — трамваят трябва да премине ИЗЦЯЛО, всичките му 14 метра." },
    { n: 5, textBg: "Едва след като трасето е чисто, завий решително наляво и продължи на юг." },
  ],
  success: [
    {
      id: "sc-rxtl-approach",
      titleBg: "Приближи кръстовището с ляв мигач и премерена скорост",
      // East-arm westbound lane center (the sc-turn-left-oncoming pins).
      params: { kind: "reachZone", x: 45, y: 4.06, radiusM: 8, maxSpeedKmh: 40 },
    },
    {
      id: "sc-rxtl-turn",
      titleBg: "Завърши левия завой на юг, пропуснал трамвая",
      // South-arm southbound lane center, past the junction area.
      params: { kind: "reachZone", x: -4.06, y: -50, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxTram.ts; gates in traces/__tests__/sc-rx-tram-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-tram-left/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-tram-left/mistake-cut-tram.trace.json" },
      titleBg: "Рязане пред трамвая",
      whatWentWrongBg:
        "Колата зави наляво през релсите, докато трамваят беше на секунда и половина от кръстовището — „той ще спре“. Няма да спре: трамваят спира три пъти по-дълго от кола и физически не може да завие. Релсовото возило се пропуска ВИНАГИ, независимо от посоката му (чл. 8, ал. 2) — левият завой през трасето с подценен интервал е подписната тежка катастрофа на София.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-tram-left/mistake-no-indicator.trace.json" },
      titleBg: "Завой през релсите без мигач",
      whatWentWrongBg:
        "Изчакването на трамвая беше правилно, но завоят започна без подаден ляв мигач. Върху трасе с релси това е двойно опасно: ватманът зад теб преценява дали да потегли от спирката по твоите намерения, а колоната отзад не знае, че ще пресичаш насрещната лента. Мигачът се пуска преди маневрата.",
      codeRefs: ["TURN_WITHOUT_INDICATOR"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище с релси, вградени в платното — булевардите с трамвайно трасе по средата или в лентите. Когато светофарът пуска едновременно колите и трамвая, релсовото возило минава първо — винаги.",
    whyBg:
      "Трамваят е най-неумолимият участник в движението: 20+ тона, спирачен път в пъти по-дълъг от автомобилния и нула възможност да завие. „Ще успея преди него“ е фаталната преценка — левият завой отнема 2–3 секунди от неговото трасе, а той не може нито да спре навреме, нито да те заобиколи. Под 4 секунди интервал се чака; при трамвай — още по-търпеливо.",
    lawRef: "ЗДвП чл. 8, ал. 2 и чл. 37",
    examinerBg:
      "Изпитващият гледа: ранен ляв мигач, изчакване пред устието без навлизане върху релсите, реално пропускане на трамвая и решителен завой едва след като трасето е чисто. Рязане пред релсово возило е опасна грешка от прекратяващия клас.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_RX_TRAM_LEFT_EVENT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-rx-tram-island — „Трамвайна спирка с остров" (RX-04) on
//    rx-tram-island-v1 (150 m 1+1 street, limit 40, marked crossing @ y = 90,
//    stop island [92, 106] × [−1.6, −0.4], halted tram body center y = 101 on
//    the southbound lane — tools/maps/gen_tram_street.mjs)
// ---------------------------------------------------------------------------

/**
 * The staged encounter: a HALTED tram at the island stop (a dart-out PROP —
 * the narrowMeeting-props recipe: staged held actor, cruise 0, never
 * commanded, profile "tram" renders the rig) + a hurrying PASSENGER who
 * steps off the EAST curb and crosses the player's lane toward the island
 * (1.8 m/s — between the 1.4 walk and the 2.2 sprint). Grading is 100% the
 * shipped pedestrian chain: crossing occupancy → PEDESTRIAN_NOT_YIELDED /
 * PEDESTRIAN_YIELDED — no new codes (the sc-vu-emergency-junction precedent:
 * honest reuse; the teach copy carries the tram-stop lesson).
 */
export const SC_RX_TRAM_ISLAND_EVENT: PedestrianDartOutSpec = {
  id: "sc-rxti-passenger",
  kind: "pedestrianDartOut",
  crossingId: "rxt-x-1",
  crossing: { x: 0, y: 90 },
  // East curb (the player-side sidewalk), crossing WEST toward the island.
  start: { x: 9.73, y: 90 },
  dir: { x: -1, y: 0 },
  speedMps: 1.8,
  travelM: 23.45,
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 48,
  minTriggerSpeedKmh: 10,
  props: [
    {
      // The halted tram on the southbound corridor: end → start path, body
      // center at y = 150 − 49 = 101 (nose at 94 — 4 m north of the zebra,
      // doors toward the island; the rx-tram-island-v1 meta.scenario pins).
      pathNodes: ["rxt-n-end", "rxt-n-start"],
      hold: { nodeIndex: 0, offsetM: 49 },
      colorIndex: 0,
      profile: "tram",
    },
  ],
};

/** RX-04 — трамвайна спирка с остров (ЗДвП чл. 66, ал. 2: при приближаване
 *  към спирка с остров на платното водачът НАМАЛЯВА и при необходимост СПИРА,
 *  за да преминат пешеходците безопасно между тротоара и острова). */
export const SC_RX_TRAM_ISLAND: ScenarioSpec = {
  id: "sc-rx-tram-island",
  family: "rail",
  tagsBg: ["трамвай", "спирка с остров", "пешеходци", "пътници"],
  titleBg: "Трамвайна спирка с остров",
  objectiveBg:
    "Трамвай е спрял на спирка с остров и пътник пресича платното пред теб, за да го хване. Намали отрано и спри, за да премине безопасно — покрай отворени врати на трамвай никога не се профучава.",
  archetypeIds: ["RX-04"],
  conceptIds: ["c-tram-priority", "c-crosswalk-yield", "c-pedestrian-rights-duties"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in rx-tram-island-v1.json meta.scenario
    // .params (tools/maps/gen_tram_street.mjs).
    params: { crossings: 1, signalized: "no", approachM: 90, tramStop: "island" },
    districtId: "rx-tram-island-v1",
  },
  start: {
    spawnPointId: "rxt-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред вляво има трамвайна спирка с остров, а на нея е спрял трамвай." },
    { n: 2, textBg: "Спрелият трамвай значи едно: хора. Вдигни крака от газта и приближавай с готовност за спиране." },
    { n: 3, textBg: "Пътник хуква по пътеката през твоята лента към острова. Реагирай веднага — спирачка, без завиване встрани." },
    { n: 4, textBg: "Спри напълно преди пътеката и го изчакай да стигне острова — не се промъквай зад гърба му." },
    { n: 5, textBg: "Премини спокойно едва когато платното е свободно, с внимание към следващи слизащи пътници." },
  ],
  success: [
    {
      id: "sc-rxti-approach",
      titleBg: "Приближи спирката с намалена скорост и готовност за спиране",
      params: { kind: "reachZone", x: 4.06, y: 76, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-rxti-clear",
      titleBg: "Премини покрай острова, пропуснал пресичащия пътник",
      params: { kind: "reachZone", x: 4.06, y: 122, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxTram.ts; gates in traces/__tests__/sc-rx-tram-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-tram-island/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-tram-island/mistake-squeeze-past.trace.json" },
      titleBg: "Профучаване покрай спрелия трамвай",
      whatWentWrongBg:
        "Колата подмина спрелия на острова трамвай, без да пропусне тичащия към него пътник — премина през пътеката, докато той беше на платното. Спирка с остров значи пешеходци МЕЖДУ тротоара и острова: чл. 66, ал. 2 изисква да намалиш и при необходимост да спреш. Отворените врати на трамвая са предупреждението — който бърза покрай тях, кара срещу хора.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-tram-island/mistake-collision.trace.json" },
      titleBg: "Удар в пресичащия пътник",
      whatWentWrongBg:
        "Погледът беше другаде и спирачка не дойде — колата блъсна пътника на самата пътека, метри пред отворените врати на трамвая. Спрелият трамвай крие хора и ги ИЗПРАЩА през платното: скоростта покрай спирка трябва да позволява спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяка трамвайна спирка с остров на платното — щом видиш спрял трамвай с отворени врати, очаквай пътници между тротоара и острова, тичащи и в двете посоки. В София това е ежедневна картина по всички трасета.",
    whyBg:
      "Спирката е най-предвидимото място за внезапен пешеходец: трамваят спира, вратите се отварят и хората хукват — закъснелите тичат, без да гледат. Островът не е тротоар докрай: пътникът трябва да прекоси твоята лента, за да стигне до него. Намаляването покрай спрял трамвай не е учтивост, а законово задължение и единствената защита срещу непоправимото.",
    lawRef: "ЗДвП чл. 66, ал. 2",
    examinerBg:
      "Изпитващият следи поведението покрай спирката: отчетливо намаляване при спрял трамвай, готовност за спиране, реално пропускане на пресичащите пътници и внимателно преминаване покрай острова. Профучаване покрай отворени врати е опасна грешка, удар — прекратяване.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_RX_TRAM_ISLAND_EVENT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The rail-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_RAIL: readonly ScenarioSpec[] = [
  SC_RX_UNGUARDED,
  SC_RX_GUARDED,
  SC_RX_TRAM_LEFT,
  SC_RX_TRAM_ISLAND,
  SC_RX_BARRIER_DROP,
];
