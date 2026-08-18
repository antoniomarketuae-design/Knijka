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
import { l5Night, l5Wet } from "./complications";

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

/**
 * THE CAP ON EVERY „СПРИ / ИЗЧАКАЙ" GATE OF THIS FAMILY, km/h — sweep 161,
 * measured 2026-08-18. It was 5, and 5 is not a stop.
 *
 * WHAT WAS BROKEN. Every rail drill's first rung is titled with a STANDSTILL —
 * «Спри напълно на стоп-линията преди релсите — колелата неподвижни, не „почти
 * спрях"» (instruction 3, verbatim), «Изчакай зад стоп-линията…». The gate
 * behind all three accepted anything at or under 5 км/ч, i.e. a walking-pace
 * ROLL with the wheels turning — the exact „почти спрях" the copy names as the
 * failure.
 *
 * And on the UNGUARDED drill the two halves of the product then contradicted
 * each other on ONE drive. Replayed through the production stack (compile →
 * createLessonSession → applyTick, `rail-stop-gate-truth.test.ts` §1) a car
 * that dips to 4 км/ч at the line and rolls on across the band produces:
 *
 *     objectives   sc-rxu-stop=done  sc-rxu-finish=done      ← ✓ «Спри напълно»
 *     rule engine  RAIL_CROSSING_VIOLATION detail "no-stop"  ← опасна, −10,
 *                  «Преминаване без спиране» → НЕИЗДЪРЖАН
 *
 * The green tick and the disqualifying conviction describe the same 4 км/ч. The
 * rule engine is the half that is right: чл. 51–53 makes the full stop the
 * whole duty at an unguarded crossing, and `engine.ts` reads it off the Б2
 * full-stop ledger, whose threshold is `DEFAULT_RULE_CONFIG.fullStopMaxSpeedKmh
 * = 1`. `objectives.ts` calls the same number `STOPPED_SPEED_KMH = 1` for its
 * own standstill grace. So the gate now carries the number the rest of the
 * runtime already uses for „the wheels are stopped", and there is exactly one.
 *
 * NOT A TIGHTENING FOR ITS OWN SAKE — the receipts, all nine committed rail
 * recordings replayed at L1/L3/L5 (the ladder widens the RADIUS; `params.ts`
 * widenSpeedCap returns early at or below REACH_ZONE_HALT_CAP_KMH = 8, so the
 * cap itself is identical on every rung):
 *
 *   min speed inside the disc — shadow 0.00 км/ч on all three maps; the three
 *   „drove through" demos 29.83 / 29.83 / 20.86; the three „stopped" demos 0.00
 *
 * so every shipped drive completes (or fails) exactly as it did at 5. The ONLY
 * verdicts that move are drives in the 1–5 км/ч band — the rolling creep, which
 * is the act instruction 3 forbids and the act the rule engine convicts.
 *
 * WHY NOT LOOSER, AND WHY THE GRACE MAKES IT SAFE: a student who stops SHORT of
 * the mark keeps every metre of forgiveness he had (objectives.ts
 * REACH_ZONE_GRACE_M — the capsule reaches radius + 5 m back down his own
 * approach, and its standstill arm needs `halted`, i.e. this same ≤ 1 км/ч), so
 * the refusal falls only on a car that never stopped anywhere.
 */
const RX_FULL_STOP_KMH = 1;

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
 *
 * `holdOffsetM` is the ONE per-map dial (founder review 2026-07-27, „the car
 * colides in the train that is already moving — this is not good overview"):
 * the arc the consist waits at before release sets WHEN its 34.4 m body sweeps
 * the carriageway relative to the driver's own approach. The GUARDED maps keep
 * the original 80 (the barrier, not the timing, is their story); the UNGUARDED
 * map pulls the train back to RXU_TRAIN_HOLD_M so the „преминаване без спиране"
 * demo passes IN FRONT of a train that is visibly bearing down instead of
 * driving into its flank — see the constant.
 */
function railTrainPassEvent(id: string, holdOffsetM = 80): TrainPassSpec {
  return {
    id,
    kind: "trainPass",
    railPath: RX_RAIL_PATH,
    // Train centre waits off-frame west of the street axis, then runs east at
    // 12 m/s so it visibly crosses around the driver's own crossing beat.
    holdOffsetM,
    cruiseSpeedMps: 12,
    accelMps2: 3.5,
    triggerPlayerDistM: 55,
    crossing: { x: RX_LANE, y: RX_BAND_CENTER_Y },
    colorIndex: 0,
  };
}

/**
 * rx-unguarded-v1's train hold arc, m along RX_RAIL_PATH (consist CENTRE; the
 * nose sits TRAIN_LENGTH_M/2 ≈ 17.2 m further east). 32 ⇒ centre at x = −98,
 * nose at x ≈ −81 — released (like every map) when the player is 55 m from the
 * band, i.e. ~2.5 s LATER at the carriageway than the shipped 80.
 *
 * WHY THE NUMBER IS WHAT IT IS (the three recorded drives, measured):
 *   - „Преминаване без спиране" is on the band t ≈ 18.2–19.2 s and the train's
 *     nose reaches the player's lane at t ≈ 20.5 — a ~1.4 s NEAR MISS with a
 *     34 m consist 26 m away at 43 km/h while the wheels are on the rails.
 *     Before: nose and car occupied the same metre of track (a crash rendered
 *     as a lesson about not stopping);
 *   - the SHADOW and „Спиране върху релсите" both hold at the СТОП line long
 *     enough for the whole consist to pass (their line pauses were lengthened
 *     with this number — see traces/scRxUnguarded.ts), so the ritual is now
 *     performed AGAINST a train instead of after one.
 * GRADING IS UNTOUCHED BY CONSTRUCTION: the recorder stages no events for this
 * template at all (the crossing zone is the trap), and the TrainPassRunner
 * emits zero SimTick events even where it IS staged — the train is choreography
 * the clip rig re-enacts over the committed trace.
 */
const RXU_TRAIN_HOLD_M = 32;
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
      // Completable ONLY at a genuine STANDSTILL at the СТОП-cross line — the
      // stop IS the drill, and RX_FULL_STOP_KMH is the number the rule engine
      // grades the same duty on (the 4 км/ч roll that used to earn this tick
      // was being billed RAIL_CROSSING_VIOLATION "no-stop" on the same drive).
      params: {
        kind: "reachZone",
        x: RX_LANE,
        y: RX_STOP_LINE_Y,
        radiusM: 4,
        maxSpeedKmh: RX_FULL_STOP_KMH,
      },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  // ADR-006 stage 3c: a real TRAIN crosses as the player approaches — the
  // hazard the mandatory full stop exists for (unguarded: NO barrier, the
  // train + the stop duty IS the lesson). Byte-neutral to grading.
  staged: [railTrainPassEvent("sc-rxu-train", RXU_TRAIN_HOLD_M)],
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
      // Completable ONLY at a genuine STANDSTILL at the barrier line — the wait
      // IS the drill, and «изчакай» at 5 км/ч was a creep, not a wait
      // (RX_FULL_STOP_KMH; instruction 3 «не се промъквай» is the same act).
      params: {
        kind: "reachZone",
        x: RX_LANE,
        y: RX_STOP_LINE_Y,
        radiusM: 4,
        maxSpeedKmh: RX_FULL_STOP_KMH,
      },
    },
    {
      id: "sc-rxg-finish",
      // WAS «Премини прелеза СЛЕД ВДИГАНЕТО и стигни края» — see sc-rxd-finish
      // for the class. Refuted here by this drill's own two ❌ demos: replayed
      // through the shipped evaluator, `mistake-run-barrier` completes this
      // disc at t = 33.4 s and `mistake-creep-barred` at t = 46.9 s, both drives
      // billed RAIL_CROSSING_VIOLATION "entered-barred" for crossing while the
      // arm was down ([0, 40) of 90 s). Params untouched — `done` is
      // bit-identical; the lift keeps its grader in the rule engine.
      titleBg: "Премини прелеза и стигни края на отсечката",
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
      // WAS «Изчакай зад стоп-линията пред СПУСКАЩАТА СЕ бариера» — sweep 161,
      // `sc-rx-barrier-drop/pc-right/01-arrival.png`: the chip carried the
      // drill's whole subject as a certificate, and the disc cannot see an arm.
      // MEASURED (rail-stop-gate-truth.test.ts §2): this map's barrier is world
      // data, down [20, 60) of every 90 s, so it stands FULLY RAISED AND
      // MOTIONLESS for the first 20 s of the session — and the stop line is
      // 130 m from the spawn on a 50 км/ч street. A brisk lawful approach banks
      // this rung at t ≈ 14.8 s; even the shipped shadow, scripted to meet the
      // descent, banks it at t = 19.45 s. Both are „пред спускащата се бариера"
      // while nothing is descending. The title now claims only the two things
      // the params prove — the PLACE and the STANDSTILL — and the drill's
      // subject stays where it is graded: instruction 2–3, the teach card, and
      // the rule engine's own `entered-barred` arm.
      titleBg: "Изчакай зад стоп-линията пред бариерата",
      // Completable ONLY at a genuine STANDSTILL at the barrier line — «Изчакай
      // … — дръж под 5 км/ч» was the audit's own sentence for what a rolling
      // creep under a dropping arm gets credited as (RX_FULL_STOP_KMH).
      params: {
        kind: "reachZone",
        x: RX_LANE,
        y: RX_STOP_LINE_Y,
        radiusM: 4,
        maxSpeedKmh: RX_FULL_STOP_KMH,
      },
    },
    {
      id: "sc-rxd-finish",
      // WAS «Премини прелеза СЛЕД ВДИГАНЕТО и стигни края» — the same claim one
      // rung later, and this one is refuted by the template's OWN ❌ demo.
      // MEASURED: `mistake-dive-barrier` — the drive whose copy says it dove
      // under the descending arm at t ≈ 26 s, and which the rule engine bills
      // RAIL_CROSSING_VIOLATION detail "entered-barred" — completes this disc
      // at t = 42.1 s (L1 and L3 alike), while the barrier is still down
      // ([20, 60)) and has never lifted. A ✓ reading «след вдигането» for the
      // race under the arm is the certificate this family already retired twice
      // (sc-rxtl-turn, sc-rxti-clear) and once next door (templates-rail2
      // sc-rxq-cross). The disc proves arrival at the far end of the section;
      // that is now all it says. Params untouched — `done` is bit-identical.
      titleBg: "Премини прелеза и стигни края на отсечката",
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
 * recipe with a rail-bound actor): cruise 10.5 m/s (~38 km/h — a tram running
 * its own reserved lane on a green), gapSec 1.6 — inside the
 * LEFT_TURN_CONVICT_GAP_SEC = 2.0 band, so cutting across it grades EXACTLY
 * FAILED_TO_YIELD (left-turn-oncoming) through the runtime's own N1 tracker,
 * while the shadow waits it out and turns clean. ONE actor (no follow car):
 * after the tram clears, the street is empty — the RX-05 decision is binary
 * (the tram, or the wait).
 *
 * WHY 10.5 AND NOT THE SHIPPED 8 (founder review 2026-07-27: „the tram and the
 * car actually colide … in real life the cars go infront of the trams and do
 * not colide, just make it very hard for the tram to stop"). The runner's
 * arrival sync and the runtime's conviction are both denominated in SECONDS —
 * the tram is held (gapSec + the player's node ETA) × cruise from the node, and
 * the tracker convicts on distM / closingMps. So cruise speed is the one dial
 * that changes the METRES of the encounter WITHOUT touching the graded gap: at
 * 8 m/s the 14 m tram's NOSE was 5.8 m short of the node when the player got
 * there (a body already in the box — the reported crash); at 10.5 it is 10.6 m
 * short, and the corner-cut demo scrapes through with ~5 m of daylight while
 * the tram stands on its brakes. The verdict is byte-identical
 * (traces/__tests__/sc-rx-tram-traces.test.ts re-proves EXACTLY
 * FAILED_TO_YIELD, and the shadow's YIELDED_TO_PRIORITY). clearSpeedMps rises
 * with it (13) so the „sprint clear of the 36 m radius" beat stays one beat.
 */
export const SC_RX_TRAM_LEFT_EVENT: OncomingLeftTurnSpec = {
  id: "sc-rxtl-tram",
  kind: "oncomingLeftTurn",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"],
    hold: { nodeIndex: 1, offsetM: -80 },
    cruiseSpeedMps: 10.5,
    colorIndex: 0,
    profile: "tram", // the articulated rig (ADR-001 fictional livery)
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 1.6,
  clearSpeedMps: 13,
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
      // WAS «Завърши левия завой на юг, пропуснал трамвая» — the „пропуснал"
      // half was never checked. stepReachZone reads (params, prevState, tick),
      // and SimTick has no field for another vehicle's priority or for whether
      // a yield happened; the mistake-cut-tram recording — the car that turned
      // 1.6 s in front of the tram — lands in this very circle and was being
      // certified as „пропуснал трамвая" by it.
      // WHAT THE DISC ACTUALLY PROVES: (−4.06, −50) is the south arm's
      // southbound lane centre 50 m past the node, and the only way onto it
      // from the east-arm spawn is through the junction — i.e. the rails WERE
      // crossed and the left turn completed. That is what the title says now.
      // The tram's priority stays graded exactly where it was: the N1
      // left-turn tracker convicts the 1.6 s cut as FAILED_TO_YIELD (the
      // mistake below, gated in traces/__tests__/sc-rx-tram-traces.test.ts)
      // and the shadow earns YIELDED_TO_PRIORITY. Params untouched — `done` is
      // bit-identical, so nothing new can fail and no THEO-4 card is owed.
      titleBg: "Завърши левия завой през трасето и излез на юг",
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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

/**
 * THE SECOND PASSENGER (founder: „the question statements says … and in the map
 * engineering its only 1"). This drill's tags say „пешеходци / пътници", its
 * teach card says «хората хукват» and «тичащи и в двете посоки», and its last
 * instruction says «с внимание към СЛЕДВАЩИ слизащи пътници» — three plural
 * promises against one staged figure. With one walker there is no „следващ",
 * so the lesson the copy names (the queue does not end with the person you
 * watched) could never be driven.
 *
 * She leaves the SAME east curb a stride north, at a walk rather than a hurry
 * (1.25 vs 1.8 m/s), on the same release. The driver who correctly stops for
 * the first and then moves the moment he clears her meets the second still in
 * his lane — the „следващ" the instruction has always promised.
 *
 * Mounted through `LevelSpec.stagedAdd` on every rung, not `ScenarioSpec
 * .staged`: the trace recorder reads `spec.staged`, so the committed
 * recordings stay byte-identical (the LET_PASS_PED_COMPANION precedent).
 */
const RX_TRAM_ISLAND_SECOND: PedestrianDartOutSpec = {
  id: "sc-rxti-passenger-2",
  kind: "pedestrianDartOut",
  crossingId: "rxt-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: 9.73, y: 91.4 },
  dir: { x: -1, y: 0 },
  speedMps: 1.25,
  travelM: 23.45,
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 48,
  minTriggerSpeedKmh: 10,
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
      // WAS «Премини покрай острова, пропуснал пресичащия пътник» — the
      // yield clause is invisible to this evaluator. stepReachZone sees one
      // tick, and no field on it says whether the passenger was let through;
      // mistake-squeeze-past drives THROUGH the crossing while she is on the
      // carriageway and still arrives here, so the gate signed off on
      // „пропуснал пресичащия пътник" for the exact drive the template calls
      // профучаване.
      // WHAT THE DISC ACTUALLY PROVES: (4.06, 122) sits on the player's own
      // lane centre 32 m past the zebra at y = 90 and 16 m past the north end
      // of the island span [92, 106] on this 150 m street — arrival means the
      // stop with the island was driven past and the segment run out. The duty
      // keeps its grader: the pedestrian chain bills PEDESTRIAN_NOT_YIELDED
      // (and COLLISION for the second mistake) off crossing occupancy, чл. 66,
      // ал. 2 is spelled out in teach.whyBg, and instructions 3–5 still say
      // спри и изчакай. Params untouched — `done` is bit-identical, nothing
      // new can fail, no THEO-4 card owed.
      titleBg: "Подмини спирката с острова и продължи до края на отсечката",
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
    { level: 1, stagedAdd: [RX_TRAM_ISLAND_SECOND] },
    { level: 2, stagedAdd: [RX_TRAM_ISLAND_SECOND] },
    { level: 3, stagedAdd: [RX_TRAM_ISLAND_SECOND] },
    { level: 4, vehicleStart: "cold", stagedAdd: [RX_TRAM_ISLAND_SECOND] },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
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
