/**
 * Scenario templates — the RAIL family, WAVE 2 (doc 72 §12 „Family RX —
 * Railway & tram crossings"). Slice 1 gave the crossing as world data
 * (templates-rail.ts: the unguarded ritual RX-02, the barrier discipline
 * RX-01, the tram RX-04/RX-05). This file adds the ONE rail archetype doc 72
 * numbers but no template had claimed yet:
 *
 *  - sc-rx-queue-clear „Не стъпвай на релсите без изход" (RX-03 „опашка върху
 *    прелеза", rx-guarded-v1 — honest map REUSE, the sc-rx-tram-left
 *    precedent: the shipped guarded crossing hosts the queue trap exactly as
 *    it hosts the barrier drill; the staged actor and the teach copy carry
 *    the new lesson)
 *
 * WHY THE GUARDED MAP IS THE RIGHT REUSE (the load-bearing choice): the
 * reducer's rail block bills three acts under ONE code, keyed by detail —
 * "no-stop" (an UNGUARDED band entry without the mandatory full stop),
 * "entered-barred", and "stopped-on-track". This drill grades the THIRD arm
 * ONLY, so it must run where the first cannot arm: on a GUARDED map чл. 52
 * carries no stop duty while the barrier is open, which leaves coming to REST
 * on the band as the single rail fault the drives can trip. On rx-unguarded-v1
 * every demo would drag the stop ritual (RX-02's teach) along with it.
 *
 * THE BARRIER IS THE PREAMBLE, NOT THE TRAP (the doc 76 §5 timing law):
 * rx-guarded-v1's timetable is WORLD DATA — down [0, 40) of every 90 s cycle.
 * All three drives therefore make their band entry inside the OPEN window
 * [40, 90): the barrier lifts, and the far side is STILL blocked. That is the
 * whole lesson — „вдигната бариера" is permission to cross, never permission
 * to enter without an exit (чл. 52–53).
 *
 * DATA ONLY in the templates.ts mold (coordinates denormalized from the
 * committed district file; the trace gate + the rail-district battery assert
 * every pinned value against the generated map).
 *
 * KNOWN VISUAL GAP (inherited, honest — the templates-rail.ts note): the
 * barrier arm prop renders in a STATIC DOWN pose (world/builders/zoneSigns.ts
 * — the timetable animates grading-side only), so the lift at t = 40 is
 * graded but not yet shown. The crossing GRADES exactly; the scenario copy
 * and the ghost narration carry the visual story until the animated-arm drop.
 */

import type { BrakingLeadCarSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district by value —
// the L7 pattern; the rail-district battery asserts the copies match the map)
// ---------------------------------------------------------------------------

/** rx-guarded-v1 (1+1 street): the single northbound lane center. */
const RX_LANE = 4.06;
/** rx-guarded-v1: the track band along the street (meta.scenario.railCrossing). */
const RX_BAND_FROM = 150;
const RX_BAND_TO = 156;
/** rx-guarded-v1: the А34 barrier stop line (meta.scenario stopLineY). */
const RX_STOP_LINE_Y = 145;
/** rx-guarded-v1: the deterministic barrier timetable (down [0, 40) of 90 s). */
const RXG_BARRIER_CYCLE_SEC = 90;
const RXG_BARRIER_DOWN_FROM_SEC = 0;
const RXG_BARRIER_DOWN_TO_SEC = 40;

/**
 * The queue tail's resting arc on rx-guarded-v1, m (= y, the street runs
 * 0 → 300 on x = 0). Ten meters past the far rail: close enough that following
 * it across strands the player ON the band (the taught kill), far enough that
 * a bumper-kiss rest behind it lands CLEAR of the band — so the two mistake
 * demos grade one code each instead of double-billing.
 */
const RXQ_QUEUE_TAIL_Y = 166;

// ---------------------------------------------------------------------------
// 1. sc-rx-queue-clear — „Не стъпвай на релсите без изход" (RX-03) on
//    rx-guarded-v1 (300 m 1+1 street, limit 50, guarded track band @
//    y ∈ [150, 156], stop line y = 145, barrier down [0, 40) of every 90 s)
// ---------------------------------------------------------------------------

/**
 * The staged QUEUE TAIL: a stationary car halted at y = 166 — ten meters
 * BEYOND the far rail, in the player's own lane. The FS_LEAD_CAR recipe
 * (sc-follow-standstill) with one deliberate twist: `slamAt` sits ON the hold
 * pose, so the "slam" the runner stages is the halt the car ARRIVED in — the
 * queue is already stopped when the player gets there, which is exactly the
 * real picture (traffic beyond a crossing backs up while the barrier holds
 * everyone behind it). The car therefore never moves under its own timing:
 *
 *  - armDistM 60 — the encounter arms when the player closes to 60 m (y ≈ 106)
 *    and is rolling; matchPlayer is commanded for the single frame before the
 *    slam takes over, and with the gap error at −46 m its target clamps to 0,
 *    so the tail does not creep by even a centimeter (deterministic pose);
 *  - minSlamSpeedKmh 8 — any real approach trips the brake command at once;
 *  - resumeAfterSec 32 — the queue rolls 32 s after the PLAYER comes to rest.
 *    That is the drill's clock: the barrier lifts at t = 40 (world data), the
 *    player's stop lands at t ≈ 20, and the queue moves off at t ≈ 52 — so the
 *    lawful crossing happens ~12 s INTO the open window, and „бариерата се
 *    вдигна" is never the moment to go.
 *
 * The runner emits no SimTick events of its own here (no hazard visual, no
 * collision on these drives): the grading is 100% the shipped rail + standstill
 * detectors reading the player's own channels.
 */
const RXQ_QUEUE_TAIL: BrakingLeadCarSpec = {
  id: "sc-rxq-tail",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["rxg-n-start", "rxg-n-end"],
    hold: { nodeIndex: 0, offsetM: RXQ_QUEUE_TAIL_Y },
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 14,
  maxMatchSpeedMps: 12,
  // ON the hold pose: the halt IS the staged event — see the doc above.
  slamAt: { x: RX_LANE, y: RXQ_QUEUE_TAIL_Y },
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 8,
  proximityFallbackM: 0.3,
  armDistM: 60,
  triggersHazard: false,
  resumeAfterSec: 32,
};

/** RX-03 — опашка върху прелеза (ЗДвП чл. 52–53: на прелез се навлиза само
 *  когато отсрещната страна е свободна и преминаването може да завърши без
 *  спиране; върху коловоза не се спира никога). Вдигната бариера разрешава
 *  преминаване — не разрешава влизане без изход. */
export const SC_RX_QUEUE_CLEAR: ScenarioSpec = {
  id: "sc-rx-queue-clear",
  family: "rail",
  tagsBg: ["жп прелез", "колона", "свободен изход", "релси", "дистанция"],
  titleBg: "Не стъпвай на релсите без изход",
  objectiveBg:
    "Влизай върху жп прелеза само ако отсрещната страна е свободна — колона, която спира върху релсите, е смъртоносна грешка.",
  archetypeIds: ["RX-03"],
  conceptIds: ["c-railway-crossing", "c-following-distance", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in rx-guarded-v1.json meta.scenario
    // .params (tools/maps/gen_rail_crossing.mjs; honest REUSE of the shipped
    // guarded crossing — the staged queue tail is what is new).
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
    { n: 1, textBg: "Потегли по улицата — напред има охраняем жп прелез (А34), а отвъд релсите се е образувала колона." },
    { n: 2, textBg: "Намали отрано и спри зад стоп-линията, преди релсите — не плътно до бариерата и никога върху коловоза." },
    {
      n: 3,
      textBg:
        "Бариерата ще се вдигне, но колоната отвъд релсите още стои. Вдигната бариера значи „разрешено е да преминеш“ — не значи „влез, пък ще видим“.",
    },
    { n: 4, textBg: "Изчакай спокойно: тръгваш чак когато отсрещната страна е свободна и можеш да преминеш прелеза без спиране." },
    { n: 5, textBg: "Премини решително и на едно движение, без да залепваш за колата пред теб — и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-rxq-hold",
      titleBg: "Спри пред релсите, докато отсрещната страна е заета",
      // Completable ONLY at near-stop speed at the barrier line (the
      // pk-smooth-stop mark discipline): a driver who rolls onto the band
      // behind the queue never satisfies it — the wait IS the drill.
      params: { kind: "reachZone", x: RX_LANE, y: RX_STOP_LINE_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-rxq-cross",
      titleBg: "Премини прелеза едва след като колоната се е отлепила",
      // Twelve meters past the queue tail's rest pose: reachable only once
      // the tail has actually rolled away — the „свободен изход" made graded.
      params: { kind: "reachZone", x: RX_LANE, y: 178, radiusM: 6 },
    },
    {
      id: "sc-rxq-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: RX_LANE, y: 283, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 110 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxQueueClear.ts; gates in traces/__tests__/sc-rx-queue-clear-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-queue-clear/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-queue-clear/mistake-stop-on-rails.trace.json" },
      titleBg: "Спиране върху релсите зад колоната",
      whatWentWrongBg:
        "Бариерата се вдигна, водачът тръгна с колоната — и спря върху коловоза, защото отпред нямаше място. Точно така умират хора на прелез: колата остава между релсите, влакът се появява след секунди, а спирачният му път е над километър — той нито ще спре, нито ще те заобиколи. Правилото няма изключения: навлизаш на прелеза само когато отсрещната страна е свободна и можеш да го преминеш без спиране (чл. 52–53).",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-queue-clear/mistake-bumper-kiss.trace.json" },
      titleBg: "Залепване зад спрелия на сантиметри",
      whatWentWrongBg:
        "Прелезът беше преминат, но колата спря на сантиметри от бронята на предната. На прелез тази дистанция е разликата между живот и смърт: ако предният се върне назад или се наложи да излезеш от коловоза, нямаш нито метър да маневрираш — а следващият в колоната ще спре точно върху релсите, защото ти си му взел мястото. Оставяй поне колкото да виждаш гумите на предния да опират в асфалта (чл. 23).",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки жп прелез в населено място или пред задръстено кръстовище веднага след релсите — щом отвъд коловоза има колона, светофар или стеснение. Охраняем или неохраняем, с вдигната бариера или без бариера: правилото е едно и също.",
    whyBg:
      "Вдигнатата бариера казва „линията е чиста СЕГА“ — нищо повече. Прелезите се превземат от опашката, не от влака: водачът влиза с колоната, тя спира, той остава между релсите и в този момент бариерата тръгва да слиза. Оттам нататък няма добър изход — влакът е в участъка, спирачният му път е над километър и релсите не завиват. Единствената защита е решението, взето ПРЕДИ релсите: има ли отсреща място за цялата ми кола? Ако не — чакаш, колкото трябва.",
    lawRef: "ЗДвП чл. 52–53",
    examinerBg:
      "Изпитващият следи решението пред прелеза: спиране зад стоп-линията, изчакване на реално свободна отсрещна страна и преминаване на едно движение, без спиране върху коловоза и без залепване за предния. Спиране върху релсите е опасна грешка от прекратяващия клас.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — нощ: the queue tail's tail-lights are the only warning that the far
    // side is blocked, and the А34 furniture reads late. („The lead stops
    // later" of the backlog note is NOT expressible as a level delta: a
    // LevelSpec may ADD staged encounters (stagedAdd), never re-time the
    // template's own — and re-timing the tail would fork the tuned clock the
    // barrier window pins. Night is the honest rung.)
    { level: 5, conditions: { night: true } },
  ],
  staged: [RXQ_QUEUE_TAIL],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The RAIL-family wave-2 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_RAIL2: readonly ScenarioSpec[] = [SC_RX_QUEUE_CLEAR];
