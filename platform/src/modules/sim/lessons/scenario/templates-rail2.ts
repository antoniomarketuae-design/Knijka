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

import type { BrakingLeadCarSpec, PedestrianDartOutSpec } from "../../contracts";
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
    { n: 1, textBg: "Потегли по улицата — напред има охраняем жп прелез (А34), а отвъд релсите е спрял автомобил и мястото след прелеза не стига. По тъмно карай с включени къси светлини (чл. 70), а щом застанеш зад колата пред теб — само КЪСИ, не дълги (чл. 74): дългите в огледалата ѝ заслепяват водача точно там, където той няма къде да се дръпне." },
    { n: 2, textBg: "Намали отрано и спри зад стоп-линията, преди релсите — не плътно до бариерата и никога върху коловоза." },
    {
      n: 3,
      textBg:
        "Бариерата ще се вдигне, но спрелият отвъд релсите автомобил още стои. Вдигната бариера значи „разрешено е да преминеш“ — не значи „влез, пък ще видим“.",
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
      // TITLE-TRUTH (doc 86 D3, the cdb2f71 give-way remedy applied to the row
      // its net could not reach — that guard covers SCENARIO_TEMPLATES_RAIL and
      // this file is RAIL2). It read «Премини прелеза ЕДВА СЛЕД КАТО пътят
      // отвъд се е освободил», and „едва след като" is a claim about WHEN the
      // student entered, which one SimTick of position and speed cannot carry.
      //
      // MEASURED, on this template's own counter-demo: `mistake-stop-on-rails`
      // — the drive that followed the queue onto the коловоз and stood between
      // the rails, cited RAIL_CROSSING_VIOLATION — completes this gate at every
      // rung (t = 63.40 s at L1 against the shadow's 59.60 s; 43 / 36 / 29 / 29 /
      // 29 frames inside the disc). Of course it does: it entered too early,
      // waited on the track, and then drove on past this mark like everybody
      // else. The old comment („reachable only once the tail has actually rolled
      // away") was true and beside the point — what it proves is that the road
      // beyond is clear BY THE TIME YOU GET HERE, never that you waited for it
      // before you rolled onto the rails.
      //
      // So the title claims only the geometry. (RX_LANE, 178) is twelve metres
      // past the queue tail's rest pose at y = 166 and twenty-two past the far
      // rail, on the player's own lane: arrival means the band was crossed and
      // left behind. The duty keeps its grader — the rail block bills the
      // „stopped-on-track" arm as RAIL_CROSSING_VIOLATION (the demo above), чл.
      // 52–53 is spelled out in teach.whyBg, and instructions 3–4 still say
      // изчакай. Params untouched — `done` is bit-identical, nothing new can
      // fail, no THEO-4 card is owed.
      titleBg: "Премини прелеза и излез отвъд релсите",
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
      titleBg: "Спиране върху релсите зад спрелия автомобил",
      whatWentWrongBg:
        "Бариерата се вдигна, водачът тръгна напред — и спря върху коловоза, защото отпред нямаше място. Точно така умират хора на прелез: колата остава между релсите, влакът се появява след секунди, а спирачният му път е над километър — той нито ще спре, нито ще те заобиколи. Правилото няма изключения: навлизаш на прелеза само когато отсрещната страна е свободна и можеш да го преминеш без спиране (чл. 52–53).",
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

// ---------------------------------------------------------------------------
// 2. sc-rx-tram-stop-doors — „Трамвай на спирка без остров" (RX-04 INVERSE) on
//    rx-tram-stop-v1 (150 m 1+1 street, limit 40, marked door crossing @
//    y = 90, halted tram body center y = 97 on the southbound lane — its front
//    door at the zebra — NO island: the lane IS the spill area; the east-kerb
//    shelter marks the stop; tools/maps/gen_rx_tram_stop.mjs)
//
// THE INVERSE OF sc-rx-tram-island (the exam's favourite contrast): the island
// stop (RX-04, чл. 66, ал. 2) protects the passenger on a refuge, so the driver
// SLOWS and stops IF NEEDED; strip the island and чл. 66, ал. 1 makes the stop
// MANDATORY — passengers alight straight onto the carriageway and it is theirs
// until they reach the kerb. Same dart-out machinery as the island (the
// sc-vu-emergency-junction precedent: honest reuse of the pedestrian chain, no
// new codes — the teach copy carries the „няма остров = задължително спиране"
// lesson), one deletion (the platform) and one addition (the shelter).
// ---------------------------------------------------------------------------

/** rx-tram-stop-v1: the northbound player-lane center and the door crossing. */
const RTS_LANE = 4.06;
const RTS_CROSSING_Y = 90;
/** rx-tram-stop-v1: halted tram body center on the southbound lane (front door
 *  at the zebra); hold offsetM on the end→start path = lengthM − tramHoldY. */
const RTS_TRAM_HOLD_Y = 97;
const RTS_STREET_LENGTH_M = 150;

/**
 * The staged encounter: a HALTED tram at the no-island stop (a dart-out PROP —
 * the narrowMeeting-props recipe: staged held actor, cruise 0, never commanded,
 * profile "tram" renders the rig) + an ALIGHTING PASSENGER who steps off the
 * tram's front door STRAIGHT onto the player's lane (1.8 m/s — between the 1.4
 * walk and the 2.2 sprint) and crosses to the east kerb. With no island there
 * is no refuge: the passenger owns the whole lane from the door to the kerb.
 * Grading is 100% the shipped pedestrian chain: crossing occupancy →
 * PEDESTRIAN_NOT_YIELDED / PEDESTRIAN_YIELDED, contact → COLLISION.
 */
export const SC_RX_TRAM_STOP_EVENT: PedestrianDartOutSpec = {
  id: "sc-rts-passenger",
  kind: "pedestrianDartOut",
  crossingId: "rts-x-1",
  crossing: { x: 0, y: RTS_CROSSING_Y },
  // The tram's front door edge (southbound lane center −4.06 + half-width 1.15
  // = −2.91), crossing EAST across the player's lane toward the kerb.
  start: { x: -2.9, y: RTS_CROSSING_Y },
  dir: { x: 1, y: 0 },
  // A careful alighting step-down (1.2 m/s — slower than a mid-road darter):
  // the whole lane is theirs, and the long occupancy is the point.
  speedMps: 1.2,
  travelM: 12.7,
  // Steps straight onto the roadway (no refuge) → on the lane from s = 0 until
  // it clears the east road edge (x = 8.125 → s = 8.125 − (−2.9) = 11.03).
  roadFromM: 0,
  roadToM: 11.03,
  // Fires late (25 m out) so the door-side crossing lands right in the driver's
  // path — the „appears a stride from the bumper" reality of a no-island stop.
  triggerDistM: 25,
  minTriggerSpeedKmh: 10,
  props: [
    {
      // The halted tram on the southbound corridor: end → start path, body
      // center at y = 150 − 53 = 97 (nose at 90 — AT the door zebra, doors
      // toward the player's lane; the rx-tram-stop-v1 meta.scenario pins).
      pathNodes: ["rts-n-end", "rts-n-start"],
      hold: { nodeIndex: 0, offsetM: RTS_STREET_LENGTH_M - RTS_TRAM_HOLD_Y },
      colorIndex: 0,
      profile: "tram",
    },
  ],
};

/**
 * THE SECOND ALIGHTER (founder: „the question statements says … and in the map
 * engineering its only 1"). This drill's own objective says the tram „изсипва
 * пътнициТЕ направо на платното" and instruction 4 says «докато и последният
 * пътник не се прибере» — a sentence that is a lie against ONE staged figure:
 * with one walker the last passenger IS the first passenger, and the drill the
 * copy describes (wait out the whole flow, not the person you were watching)
 * was never staged.
 *
 * He steps off the SAME door a stride behind and slower (1.05 vs 1.2 m/s), so
 * the driver who moves the instant the first heel touches the kerb finds a
 * second body still in his lane. Same start x, same direction, same trigger —
 * the only deltas are +2.2 m north along the door line and the slower pace, so
 * the pair reads as one knot of people leaving one door.
 *
 * Mounted through `LevelSpec.stagedAdd` on EVERY rung, not `ScenarioSpec
 * .staged`: the trace recorder reads `spec.staged` (traces/scRxTramStopDoors
 * .ts), so all three committed recordings stay byte-identical and the §5/§9
 * trace gate does not have to be re-recorded (the SC_CROSSING_LET_PASS /
 * LET_PASS_PED_COMPANION precedent, templates-pe.ts:92-96).
 */
const RTS_SECOND_ALIGHTER: PedestrianDartOutSpec = {
  id: "sc-rts-passenger-2",
  kind: "pedestrianDartOut",
  crossingId: "rts-x-1",
  crossing: { x: 0, y: RTS_CROSSING_Y },
  start: { x: -2.9, y: RTS_CROSSING_Y + 2.2 },
  dir: { x: 1, y: 0 },
  speedMps: 1.05,
  travelM: 12.7,
  roadFromM: 0,
  roadToM: 11.03,
  triggerDistM: 25,
  minTriggerSpeedKmh: 10,
};

/**
 * L5 complication — a LATE RUNNER chasing the tram (the conditionsNote): a
 * third passenger SPRINTS the other way, from the east kerb toward the closing
 * doors, at 2.4 m/s. Added at L5 only (stagedAdd — the LevelSpec seam; the
 * template's own darter is never re-timed, the RXQ precedent) and paired with
 * rain + wet grip so the stop must be read late and braked long.
 */
const RTS_LATE_RUNNER: PedestrianDartOutSpec = {
  id: "sc-rts-runner",
  kind: "pedestrianDartOut",
  crossingId: "rts-x-1",
  crossing: { x: 0, y: RTS_CROSSING_Y },
  // East kerb, sprinting WEST toward the tram doors (a late boarder).
  start: { x: 9.73, y: RTS_CROSSING_Y },
  dir: { x: -1, y: 0 },
  speedMps: 2.4,
  travelM: 12.7,
  roadFromM: 1.6,
  roadToM: 12.6,
  triggerDistM: 40,
  minTriggerSpeedKmh: 12,
};

/** RX-04 обратен — трамвайна спирка БЕЗ остров (ЗДвП чл. 66, ал. 1: при спрял
 *  трамвай на спирка без островче за качване и слизане водачът СПИРА и не
 *  потегля, докато всички пътници не напуснат платното — платното е тяхно). */
export const SC_RX_TRAM_STOP: ScenarioSpec = {
  id: "sc-rx-tram-stop-doors",
  family: "rail",
  tagsBg: ["трамвай", "спирка без остров", "слизащи пътници", "задължително спиране"],
  titleBg: "Трамвай на спирка без остров",
  objectiveBg:
    "Трамвай е спрял на спирка без остров и изсипва пътници направо на платното. Спри зад отворените му врати и не потегляй, докато и последният пътник не се прибере — платното е тяхно, не твое.",
  archetypeIds: ["RX-04"],
  conceptIds: ["c-tram-priority", "c-crosswalk-yield", "c-pedestrian-rights-duties"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in rx-tram-stop-v1.json meta.scenario
    // .params (tools/maps/gen_rx_tram_stop.mjs).
    params: { crossings: 1, signalized: "no", approachM: 90, tramStop: "none" },
    districtId: "rx-tram-stop-v1",
  },
  start: {
    spawnPointId: "rts-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — вляво на спирка БЕЗ остров е спрял трамвай. Вали ли, включи късите светлини преди това (чл. 70): слизащите от трамвая пресичат платното ти и в дъжд решават да стъпят по това дали виждат фарове." },
    { n: 2, textBg: "Без остров пътниците слизат право на платното. Спрелият трамвай значи едно: хора пред теб. Вдигни крак от газта." },
    { n: 3, textBg: "Пътник слиза и тръгва през твоята лента към тротоара. Спри напълно зад трамвая — не се провирай покрай него." },
    { n: 4, textBg: "Изчакай платното да се освободи изцяло — платното е на пътниците, докато и последният се прибере на тротоара." },
    { n: 5, textBg: "Чак когато лентата е чиста, потегли спокойно покрай спрелия трамвай и продължи до края." },
  ],
  success: [
    {
      id: "sc-rts-approach",
      titleBg: "Приближи спирката с намалена скорост и готовност за спиране",
      params: { kind: "reachZone", x: RTS_LANE, y: 76, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-rts-clear",
      // TITLE-TRUTH — the give-way certificate cdb2f71 struck from
      // `sc-rxti-clear` («Премини покрай острова, пропуснал пресичащия пътник»),
      // surviving VERBATIM one file over because that change's drift net reads
      // SCENARIO_TEMPLATES_RAIL and this template lives in RAIL2. The wording is
      // the same, the geometry is the same, and so is the defect.
      //
      // `stepReachZone` is handed (params, prevState, tick) and nothing else:
      // SimTick carries position, speed, lane, indicator … and NO pedestrian
      // occupancy, no other actor's priority, no yield outcome. Measured on this
      // drill's own ❌ demo: `mistake-creep-through` — the drive whose copy reads
      // «пропълзя през пътеката, докато пътникът още пресичаше платното», cited
      // PEDESTRIAN_NOT_YIELDED — completes this gate at every rung (t = 26.65 s
      // at L1 against the shadow's 30.65 s; 142 / 126 / 109 / 109 / 109 frames
      // inside the disc). The crawl-through was being signed off as «пропуснал
      // слизащия пътник». (`mistake-thread-doors` never arrives — the collision
      // ends it 28 m short — so the crash fails the gate by accident of where it
      // stopped, not by anything the gate checked.)
      //
      // WHAT THE DISC ACTUALLY PROVES: (4.06, 122) is the player's own lane
      // centre 32 m past the door zebra at y = 90 and 25 m past the halted
      // tram's body centre at y = 97 on this 150 m street — arrival means the
      // stopped tram was driven past and the segment run out. That is what the
      // title says now. The duty keeps its grader: the pedestrian chain bills
      // PEDESTRIAN_NOT_YIELDED off crossing occupancy (both demos cite it), чл.
      // 66, ал. 1 is spelled out in teach.whyBg, and instructions 3–5 still say
      // спри напълно и изчакай. Params untouched — `done` is bit-identical,
      // nothing new can fail, no THEO-4 card is owed.
      titleBg: "Подмини спрелия трамвай и продължи до края на отсечката",
      params: { kind: "reachZone", x: RTS_LANE, y: 122, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRxTramStopDoors.ts; gates in traces/__tests__/sc-rx-tram-stop-
  // doors-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rx-tram-stop-doors/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-rx-tram-stop-doors/mistake-thread-doors.trace.json" },
      titleBg: "Провиране покрай отворените врати",
      whatWentWrongBg:
        "Колата се провря покрай спрелия трамвай, без да спре за слизащия пътник — премина през пътеката, докато той беше на платното, и го удари пред самите отворени врати. Спирка без остров значи пътници направо на платното: чл. 66, ал. 1 изисква да спреш зад отворените врати и да не потегляш, докато не се приберат. Провирането покрай отворени врати е класическата смъртоносна грешка на трамвайната спирка.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-rx-tram-stop-doors/mistake-creep-through.trace.json" },
      titleBg: "Пълзене през слизащите",
      whatWentWrongBg:
        "Водачът намали, но не спря: пропълзя през пътеката, докато пътникът още пресичаше платното към тротоара. Без остров пътникът няма къде да се скрие — платното е негово, докато не се прибере. „Бавно и внимателно“ покрай слизащи пътници не е пропускане: чл. 66, ал. 1 иска пълно спиране зад отворените врати, не пълзене под носа им.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "На всяка трамвайна спирка БЕЗ остров на платното — щом видиш спрял трамвай с отворени врати и няма очертан остров между релсите и тротоара, пътниците слизат право на платното. В София това е ежедневна картина по тесните трасета без островчета.",
    whyBg:
      "Спирката без остров е най-коварната: пътникът стъпва от вратата направо в лентата за движение, без никаква защита между него и колите. Той не гледа за коли — гледа да хване или да слезе от трамвая. Затова законът обръща учтивостта в задължение: при спирка без остров спираш и чакаш, докато платното се освободи изцяло. Провирането покрай отворени врати убива точно защото пътникът се появява внезапно, на крачка от бронята.",
    lawRef: "ЗДвП чл. 66, ал. 1",
    examinerBg:
      "Изпитващият следи поведението при спрял трамвай на спирка без остров: отчетливо намаляване, ПЪЛНО спиране зад отворените врати, реално изчакване на всички слизащи пътници и внимателно потегляне едва след като платното е чисто. Провиране покрай отворени врати е опасна грешка, удар — прекратяване.",
  },
  levels: [
    // The SECOND alighter rides on every played rung — the copy has always
    // promised пътнициТЕ in the plural (see RTS_SECOND_ALIGHTER).
    { level: 1, stagedAdd: [RTS_SECOND_ALIGHTER] },
    { level: 2, stagedAdd: [RTS_SECOND_ALIGHTER] },
    { level: 3, stagedAdd: [RTS_SECOND_ALIGHTER] },
    { level: 4, vehicleStart: "cold", stagedAdd: [RTS_SECOND_ALIGHTER] },
    // L5 — дъжд + закъснял пътник: the stop reads late through the rain, the
    // wet grip stretches the braking, and a third passenger sprints the other
    // way for the doors (stagedAdd — the RXQ LevelSpec precedent; the base
    // darter is never re-timed).
    {
      level: 5,
      conditions: { weather: "rain" },
      physics: { wetGrip: true },
      stagedAdd: [RTS_SECOND_ALIGHTER, RTS_LATE_RUNNER],
    },
  ],
  staged: [SC_RX_TRAM_STOP_EVENT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The RAIL-family wave-2 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_RAIL2: readonly ScenarioSpec[] = [SC_RX_QUEUE_CLEAR, SC_RX_TRAM_STOP];
