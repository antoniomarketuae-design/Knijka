/**
 * Scenario templates — the PEDESTRIAN family, S3 batch 1 (doc 72 §6 „Family
 * PE"): three ✅ FULL crossing archetypes staged on purpose-built zebra-block
 * micro-maps, DATA ONLY in the templates.ts mold (coordinates denormalized
 * from the committed district files so nothing loads world JSON at runtime;
 * the trace-gate batteries assert every pinned value against the generated
 * maps):
 *
 *  - sc-crossing-let-pass    „Изчакай пътеката"  (PE-03, pe-clear-v1)
 *  - sc-crossing-slow-crosser „Бавен пешеходец"   (PE-08, pe-slow-v1)
 *  - sc-crossing-rain-sprint „Пътека в дъжд/нощ"  (PE-16, pe-rain-v1)
 *
 * Every staged encounter uses the SHIPPED StagedEventSpec kind
 * `pedestrianDartOut` and every mistake demo cites SHIPPED rules-catalog codes
 * (PEDESTRIAN_CROSSING_TOO_FAST / PEDESTRIAN_NOT_YIELDED) — verified by
 * replaying the committed traces through the production stack
 * (traces/__tests__/sc-crossing-*-traces.test.ts, the §5/§9 gates).
 *
 * Doc-72 provenance: all three archetypes are marked "Engine: ✅ FULL". PE-13
 * (jaywalker) was skipped this batch: it wants a signalized crossing, which
 * gen_zebra_street/gen_pe_crossings deliberately REJECTS (the runtime can only
 * adjudicate signals at INTERSECTIONS — a standalone signal zebra would paint
 * lamps the rule engine cannot grade).
 */

import type { PedestrianDartOutSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night, l5Wet, l5WetGrip } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the pe-districts battery asserts the copies match the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (pe-*-v1). */
const LANE_2 = 4.06;
/** L4 curb-start convention: half-carriageway 8.125 + 0.4 curb + 1.2
 *  stand-back = 9.725 m west of the centerline. */
const CURB_X = -9.73;
/** Road-occupancy span along the dart path (west edge → east edge across the
 *  16.25 m carriageway): 9.73 − 8.125 = 1.6 m in, 9.73 + 8.125 = 17.85 m out. */
const ROAD_FROM_M = 1.6;
const ROAD_TO_M = 17.85;
/** Curb → across the carriageway → a few metres of east walk-out. */
const TRAVEL_M = 23.45;

// ---------------------------------------------------------------------------
// CLEAR_TITLE_NOTE — why no gate in this file says «след като е свободна»
// (sweep 161, 2026-08-18)
// ---------------------------------------------------------------------------
//
// `.audit-frames/sweep161/sc-crossing-dart/mobile-wrong/08-debrief.png`:
//   «✓ Приближи пътеката с готовност за спиране 0:31»
//   «✓ Премини пътеката, след като е свободна   0:34»
// on a run the same screen scores НЕИЗДЪРЖАН — top speed 59 км/ч, ZERO full
// stops, ZERO lawful waits. The second tick is the sharper one: nothing in a
// `SimTick` carries another actor, `stepReachZone` is handed
// (params, prev, tick) and no `ObjectiveContext` at all, and the staged
// walker's `StagedEventOutcome` reaches only `completeManeuver/emergencyStop`.
// So „беше ли свободна пътеката" is not a fact this evaluator can be wrong
// about — it is a fact it cannot be asked. At radius 12, 38 m past the zebra,
// the gate credits anyone who drove that far up the road, which is exactly
// what the frame shows it doing.
//
// This is the catalogue rule `lessons/__tests__/stop-claim-gates.test.ts`
// already enforces (ACTOR_CLAIM), and the remedy is the one commit cdb2f71
// established for `sc-sfap-clear` and `sc-edpr-leftturn`: THE TITLE SAYS WHAT
// THE DISC MEASURES, and the duty keeps its own grader in the rule engine —
// PEDESTRIAN_NOT_YIELDED, which every template below already cites in its own
// `mistakes[]` and which the crossing-zone tracker feeds. NOT ONE PARAM MOVES,
// so `done` is bit-identical on every rung and THEO-4 owes no explaining card.
//
// WHY SIX SIBLINGS CHANGED AND ONLY ONE WAS AUDITED: ACTOR_CLAIM matches
// «когато е свободна» and does not match «СЛЕД КАТО е свободна», which is the
// wording seven rows of this family use — so the catalogue census read them as
// clean. The audit found one by its pixels; the other six are the same
// sentence about the same disc. Two more rows outside this file wear it and
// are named in the report rather than reached for: `sc-za-clear`
// (templates-flow.ts) and `sc-prs-clear` (templates-pe2.ts). `sc-jay-clear`
// below is left ALONE on purpose — it says «когато е свободна», so it is
// already a NAMED row in ACTOR_CLAIM_KNOWN_OPEN, and retiring it here would
// require deleting its entry from a test file this lane does not own.
//
// __tests__/pe-sweep161-truth.test.ts holds the rule for this file, with the
// «след като е свободна» wording ACTOR_CLAIM cannot see.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. sc-crossing-let-pass — „Изчакай пътеката" (PE-03: squeezing past a
//    pedestrian on the crossing) on pe-clear-v1 (crossing at y = 90)
// ---------------------------------------------------------------------------

/**
 * The staged NORMAL-PACE crosser at pe-x-1 (0, 90): steps off the WEST curb at
 * 1.4 m/s once the player closes within ~55 m, so she is already on the FAR
 * half of the zebra as the car arrives — the PE-03 „behind their back" trap.
 * triggerDistM 55 releases her early enough that a legal approach can still
 * stop, which lets the too-fast demo grade ONLY its approach-speed code.
 */
const LET_PASS_PED: PedestrianDartOutSpec = {
  id: "sc-clp-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: CURB_X, y: 90 },
  dir: { x: 1, y: 0 },
  speedMps: 1.4,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

/**
 * B45 (founder, doc 87 — „we must maybe add 1-2 more pedestrians"): the SECOND
 * crosser. One human being on the whole map is not a crossing; it is a prop.
 *
 * She steps off the SAME (west) curb on the same release, half a metre up the
 * zebra and a good deal slower — an older companion trailing the first. That
 * is the ordinary way a zebra is used, and it is also the harder lesson: the
 * driver who correctly waits out the first one and moves the instant her heel
 * leaves the tarmac finds the second one still on the carriageway. „Изчакай
 * пътеката да се освободи" means the CROSSING, not the person you were
 * watching.
 *
 * Deliberately NOT a near-side (east-curb) walker: `lane10-pe-vru-truth`'s G2
 * gate measured that version colliding at 1.38 m with a driver holding a
 * lawful 37 km/h — a dart across the driving line leaves no braking defence,
 * so staging one would have taught a 17-year-old that obeying the cap is not
 * enough. Same curb keeps her behind five seconds of visible warning, exactly
 * like the first.
 *
 * Mounted through `LevelSpec.stagedAdd`, not `ScenarioSpec.staged`, on purpose:
 * the trace recorder reads `spec.staged` (traces/scCrossingLetPass.ts:176), so
 * every committed recording stays byte-identical and the §5/§9 trace gate does
 * not have to be re-recorded from a lane that does not own it.
 */
const LET_PASS_PED_COMPANION: PedestrianDartOutSpec = {
  id: "sc-clp-ped-2",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: CURB_X, y: 91.5 },
  dir: { x: 1, y: 0 },
  speedMps: 1.15,
  // 21.7 m, not the 23.45 m the first walk uses: pe-clear-v1's pavement outer
  // edge is 12 m out, so the longer walk rests 1.7 m past the back of the
  // pavement on bare verge (doc 87 B14, the same residual on this family).
  travelM: 21.7,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
  // NO `variant`. The B45 fix ("we must maybe add 1-2 more pedestrians") first
  // shipped this companion as `variant: "elder"`, and TrafficLayer maps elder →
  // `pedCaneOn = 1` (TrafficLayer.tsx:1044-1048) — i.e. it put a WHITE CANE on
  // PE-03's second crosser. That is precisely what this file's own white-cane
  // rule forbids twenty lines further down: PE-08 "deliberately stays
  // variant-less: a white cane there would dilute PE-14's unique признак".
  // PE-14 (sc-crossing-white-cane, catalog 30) is a whole lesson whose only
  // признак is the cane, and the founder already complained that these drills
  // repeat each other. A second ordinary pedestrian is the ask; a second blind
  // pedestrian is a third lesson's content leaking into this one.
};

/** PE-03 — не заобикаляй пешеходеца на пътеката (ЗДвП чл. 119: пропусни
 *  стъпилите на пътеката пешеходци; изчакай, докато освободят платното). */
export const SC_CROSSING_LET_PASS: ScenarioSpec = {
  id: "sc-crossing-let-pass",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "предимство", "градско каране"],
  titleBg: "Изчакай пътеката да се освободи",
  objectiveBg:
    "Пропусни пешеходеца на пешеходната пътека, като изчакаш да освободи ЦЯЛОТО платно — не се промъквай зад гърба му, дори да изглежда, че има място.",
  archetypeIds: ["PE-03"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-clear-v1.json meta.scenario.params
    // (tools/maps/gen_pe_crossings.mjs).
    params: { crossings: 1, signalized: "no", approachM: 90 },
    districtId: "pe-clear-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и се движи спокойно в своята лента." },
    {
      n: 2,
      textBg:
        "Видиш ли пешеходната пътека, вдигни крака от газта и наблюдавай пешеходеца, който вече пресича.",
    },
    {
      n: 3,
      textBg: "Намали плавно и спри напълно на няколко метра преди пътеката — не навлизай в нея.",
    },
    {
      n: 4,
      textBg:
        "Изчакай пешеходеца да измине ЦЯЛАТА пътека, включително твоята половина — не се провирай зад него.",
    },
    { n: 5, textBg: "Огледай се и премини едва когато пътеката е напълно свободна." },
  ],
  success: [
    {
      id: "sc-clp-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 78, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-clp-clear",
      // WAS «Премини пътеката, след като е свободна» — CLEAR_TITLE_NOTE at the
      // top of this file. Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 128, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-let-pass/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-let-pass/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата навлезе в зоната на пътеката с непроменена висока скорост, докато пешеходецът вече пресичаше. Дори спирането след това да успее, самото приближаване без готовност е опасната грешка — чл. 119 изисква скорост, позволяваща спиране.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-let-pass/mistake-not-yielded.trace.json" },
      titleBg: "Промъкване зад гърба на пешеходеца",
      whatWentWrongBg:
        "Водачът прецени, че „има място“, и мина зад гърба на пешеходеца, докато той още беше на отсрещната половина. Пешеходецът на пътеката има предимство по чл. 119 — изчакваш го да освободи цялото платно, не се разминаваш с него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При всяка маркирана пешеходна пътека, на която пешеходец вече пресича. Предимството е негово, докато не слезе напълно от платното — включително от отсрещната лента.",
    whyBg:
      "Промъкването зад гърба на пешеходеца е класически капан: той може да спре, да се върне или да ускори, а зад него от другата лента може да се появи втори пешеходец, когото не виждаш. Изчакването на чиста пътека струва няколко секунди; ударът — цял живот.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква отчетливо намаляване при приближаване, пълно спиране преди пътеката и потегляне едва след като пешеходецът е освободил цялото платно. Разминаване с пешеходец на пътеката е опасна грешка и прекратява изпита.",
  },
  // B45: the second crosser rides on EVERY played rung (stagedAdd), so the
  // student always meets the two-body trap the teach text describes, while
  // `staged` — the only field the trace recorder reads — stays as recorded.
  levels: [
    { level: 1, stagedAdd: [LET_PASS_PED_COMPANION] },
    { level: 2, stagedAdd: [LET_PASS_PED_COMPANION] },
    { level: 3, stagedAdd: [LET_PASS_PED_COMPANION] },
    { level: 4, vehicleStart: "cold", stagedAdd: [LET_PASS_PED_COMPANION] },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  staged: [LET_PASS_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-crossing-slow-crosser — „Бавен пешеходец" (PE-08: the slow/elderly
//    crosser) on pe-slow-v1 (crossing at y = 85, a calmer 40 km/h street)
// ---------------------------------------------------------------------------

/**
 * The staged SLOW crosser at pe-x-1 (0, 85): 0.8 m/s (an elderly pedestrian —
 * the occupancy just lasts ~20 s longer than the walk-pace tier). The lesson
 * is patience: creeping into the crossing to pressure them, or rolling before
 * they clear, is the graded fault. Same occupancy span, longer dwell.
 */
const SLOW_PED: PedestrianDartOutSpec = {
  id: "sc-scr-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 85 },
  start: { x: CURB_X, y: 85 },
  dir: { x: 1, y: 0 },
  speedMps: 0.8,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

/** PE-08 — бавният пешеходец (ЗДвП чл. 119: изчакай пешеходеца да освободи
 *  пътеката, без да го притискаш с настъпване). */
export const SC_CROSSING_SLOW_CROSSER: ScenarioSpec = {
  id: "sc-crossing-slow-crosser",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "търпение", "възрастен пешеходец"],
  titleBg: "Бавен пешеходец на пътеката",
  objectiveBg:
    "Спри пред пътеката и изчакай бавно пресичащия пешеходец да я освободи напълно — без да настъпваш и без да потегляш, докато е на платното.",
  archetypeIds: ["PE-08"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-slow-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 85 },
    districtId: "pe-slow-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се движи спокойно — улицата е квартална, с ограничение 40 км/ч." },
    {
      n: 2,
      textBg: "Забележиш ли бавно пресичащ пешеходец, вдигни газта рано и се готви за пълно спиране.",
    },
    { n: 3, textBg: "Спри напълно преди пътеката и изчакай търпеливо — не настъпвай, за да го подканиш." },
    {
      n: 4,
      textBg: "Дай му цялото време да измине платното; бавният пешеходец има нужда от повече секунди.",
    },
    { n: 5, textBg: "Потегли едва когато е слязъл напълно от пътеката, и премини спокойно." },
  ],
  success: [
    {
      id: "sc-scr-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 73, radiusM: 10, maxSpeedKmh: 35 },
    },
    {
      id: "sc-scr-clear",
      // WAS «Премини пътеката, след като е свободна» — CLEAR_TITLE_NOTE at the
      // top of this file. Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 122, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 100 },
  shadow: { path: "content/traces/sc-crossing-slow-crosser/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-slow-crosser/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата задържа 40 км/ч към пътеката, докато бавният пешеходец вече беше на платното. Пред пешеходна пътека със стъпил пешеходец скоростта трябва да позволява спиране — чл. 119; дори при законно ограничение приближаването без готовност е опасната грешка.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-slow-crosser/mistake-not-yielded.trace.json" },
      titleBg: "Потегляне, преди пешеходецът да слезе",
      whatWentWrongBg:
        "Водачът не изчака и потегли през пътеката, докато бавният пешеходец още я пресичаше. Пешеходецът има предимство до пълното освобождаване на платното — нетърпението тук е опасна грешка.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При деца, възрастни хора и хора с намалена подвижност на пешеходната пътека — те се движат по-бавно и имат нужда от повече време. Предимството е тяхно до последната крачка от платното.",
    whyBg:
      "Настъпването и потеглянето „под носа“ на бавен пешеходец е сред нещата, които изпитващите наказват веднага, защото плаши най-уязвимите участници. Търпението пред пътеката е белег на владеене на колата, не на слабост.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият следи за пълно спиране без настъпване, спокойно изчакване и потегляне едва след пълното освобождаване на платното. Настъпване или преминаване през пешеходец на пътеката е опасна грешка.",
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
  staged: [SLOW_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-crossing-rain-sprint — „Пътека в дъжд през нощта" (PE-16: the rain
//    sprinter, night ×R) on pe-rain-v1 (crossing at y = 95)
// ---------------------------------------------------------------------------

/**
 * The staged SPRINTER at pe-x-1 (0, 95): 2.2 m/s — a pedestrian hurrying across
 * for cover in the rain, distinctly faster than the 1.4 m/s walk (and the dart)
 * profile. The crossing is driven at NIGHT in the RAIN, so the braking distance
 * is longer AND the sightline is short: the shadow's answer is a decisively
 * lower approach speed. triggerDistM 40 times her onto the zebra as the car
 * closes — late enough that the not-yielded demo meets her on the WEST half
 * (a cut-across-in-front, no contact), not head-on in the driving lane.
 */
const RAIN_SPRINT_PED: PedestrianDartOutSpec = {
  id: "sc-crs-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 95 },
  start: { x: CURB_X, y: 95 },
  dir: { x: 1, y: 0 },
  speedMps: 2.2,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 40,
  minTriggerSpeedKmh: 10,
};

/** PE-16 — спринтьорът в дъжда (ЗДвП чл. 119 + съобразена скорост чл. 20:
 *  при дъжд и нощ спирачният път расте, а пешеходецът се появява по-бързо). */
export const SC_CROSSING_RAIN_SPRINT: ScenarioSpec = {
  id: "sc-crossing-rain-sprint",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "дъжд", "нощно каране"],
  titleBg: "Пътека в дъжд през нощта",
  objectiveBg:
    "Приближи пешеходната пътека в дъжд и тъмнина с чувствително по-ниска скорост, пропусни припряно пресичащия пешеходец и премини едва когато е слязъл от платното.",
  archetypeIds: ["PE-16"],
  conceptIds: ["c-crosswalk-yield", "c-speed-adaptation", "c-rain-aquaplaning", "c-night-visibility"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-rain-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 95 },
    districtId: "pe-rain-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Нощ е и вали. Провери, че късите светлини са включени, ПРЕДИ да потеглиш — в дъжд през нощта те не са само за да виждаш ти, а за да те види мокрият, забързан пешеходец иззад чадъра си.",
    },
    { n: 2, textBg: "Движи се със съобразена скорост — в дъжд и тъмнина спирачният път е около 1,4 пъти по-дълъг." },
    {
      n: 3,
      textBg: "Пред пътеката намали още повече от обичайното — фаровете осветяват само няколко метра напред.",
    },
    {
      n: 4,
      textBg: "Появи ли се пешеходец, който тича към отсрещния тротоар, спри плавно и напълно преди зебрата.",
    },
    { n: 5, textBg: "Изчакай го да освободи цялото платно — при дъжд той бърза и вижда по-трудно." },
    { n: 6, textBg: "Премини спокойно, след като пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-crs-approach",
      titleBg: "Приближи пътеката с намалена за условията скорост",
      params: { kind: "reachZone", x: LANE_2, y: 83, radiusM: 10, maxSpeedKmh: 35 },
    },
    {
      id: "sc-crs-clear",
      // WAS «Премини пътеката, след като е свободна» — CLEAR_TITLE_NOTE at the
      // top of this file. Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 132, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-rain-sprint/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-too-fast.trace.json" },
      titleBg: "Суха скорост в дъжд",
      whatWentWrongBg:
        "Колата приближи пътеката със сухо-дневна скорост, докато пешеходецът вече тичаше по зебрата. При дъжд и нощ скоростта пред пътека със стъпил пешеходец трябва да е още по-ниска — чл. 119 иска готовност за спиране, а мокрият път я отнема.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-not-yielded.trace.json" },
      titleBg: "Непропускане на пешеходеца",
      whatWentWrongBg:
        "Водачът мина през пътеката, докато пешеходецът още пресичаше в дъжда. Дори когато пешеходецът бърза непредпазливо, предимството е негово — задължението за спиране остава на водача.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      // doc 86 L10: this drill compiles NIGHT + RAIN on all four rungs, so both
      // headlight faults are armed against it unconditionally — and until this
      // demo it had five instruction steps, none of which told the student to
      // switch the lamps on, and no lights code in mistakes[]. The student
      // could collect an основна fault for a duty the lesson never stated.
      traceRef: { path: "content/traces/sc-crossing-rain-sprint/mistake-lights-off.trace.json" },
      titleBg: "Дъждовна нощ без светлини",
      whatWentWrongBg:
        "Скоростта беше премерена, но колата пое по мократа тъмна улица с изгасени светлини. Отсъжда се като „късите светлини не са включени по тъмно“ — по-тежкото от двете задължения, което поглъща дъждовното (в дъжд светлините са задължителни и през деня; нощем те така или иначе трябва да светят). Двете причини обаче са различни и двете важат тук: без къси светлини ТИ не виждаш пътеката на 40 метра, а мокрият асфалт отразява толкова, че тъмна кола без светлини изчезва и за пешеходеца иззад чадъра му. Затова редът е: първо светлините при запалването, чак после разговорът за скорост.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
  ],
  teach: {
    whenBg:
      "При пешеходни пътеки в дъжд, мъгла или тъмнина — тогава пешеходецът често тича за прикритие, вижда те по-трудно (чадър, качулка), а твоят спирачен път е чувствително по-дълъг.",
    whyBg:
      "Комбинацията мокър път + слаба видимост + бързащ пешеходец е сред най-смъртоносните за пешеходци в България. Единственият надежден отговор е предварително намалената скорост: тя връща и разстоянието за спиране, и времето за реакция.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква видимо по-ниска скорост за условията при приближаване, пълно спиране пред пътеката и потегляне след освобождаването ѝ. Преминаване през пешеходец на пътеката е опасна грешка независимо от времето.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5WetGrip(),
  ],
  staged: [RAIN_SPRINT_PED],
  conditions: { weather: "rain", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-crossing-dart — „Внезапен пешеходец на пътеката" (PE-02 dart-out at a
//    MARKED crossing) on pe-dart-v1 (crossing at y = 80) — the reaction
//    emergency, not the patience test.
//
// ⚠ THE OCCLUSION THIS SECTION USED TO PROMISE IS NOT IN THE MAP (sweep 161,
//   `.audit-frames/sweep161/sc-crossing-dart/mobile-right/04-t013s.png` and
//   `04-t028s.png`: the west approach is open ground, iron railings, and a
//   block set well back — the walker's pavement is in view the whole way, and
//   a figure is plainly visible standing on it two frames before the zebra).
//
//   MEASURED against the shipped district (content/world/pe-dart-v1.json):
//   the authored corner volume `pe-b-corner` is 9 m tall and spans
//   x ∈ [−32.0, −16.6], y ∈ [50.0, 78.5]. Its `meta.scenario.streetscapeNoteBg`
//   claims it is «изнесена до самия бордюр 1,5 м преди зебрата» — the LENGTH
//   half is true (it ends 1.5 m short of the zebra) and the WIDTH half is not:
//   the west kerb is at x = −8.125 and the back of the 3.5 m footway at
//   −11.625, so the volume stands 8.5 m off the kerb and 5.0 m behind the
//   pavement. The sightline from the right-lane centre (x = 4.06) to the
//   walker's start (−9.73, 80) never reaches west of −9.73, so a volume that
//   begins at −16.6 is a BACKDROP behind her, not an occluder in front of her.
//   Probable cause, for the lane that owns the generator: the plot was cleared
//   against the WIDEST carriageway segment on this street (the bay pocket,
//   `curbToCurbM` 24.25 over y ∈ [18, 50] ⇒ 12.125 + 3.5 + 1.5 ≈ 17.1 m), and
//   the street necks back to 16.25 m exactly where the zebra is.
//
//   The COPY below therefore no longer certifies a blocked view — the
//   bus-shadow precedent one section down («камион», not «автобус»): the world
//   decides what the copy may claim. __tests__/pe-sweep161-truth.test.ts §3
//   pins the 8.5 m and fails the build if the claim comes back without the
//   geometry. When the generator lane DOES push the volume onto the kerb line
//   its own note describes, that test starts passing WITH the old copy, and
//   restoring it is then the right move — the rule is „claim it only if it is
//   there", never „never claim it".
//
//   NOTHING GRADED CHANGES: the occlusion was always „world dressing, zero
//   grading change" — the drill's delta is SUDDENNESS (26 m / 2.5 m/s), which
//   the world does deliver.
// ---------------------------------------------------------------------------

/**
 * The staged DART at pe-x-1 (0, 80): a pedestrian BOLTS off the WEST curb at
 * 2.5 m/s — faster than the 2.2 m/s rain sprinter, a genuine step-off-and-go —
 * and only when the player closes within ~26 m (± the seeded 3 m jitter).
 * Founder R3 #25 ruling: the old 40 m / 1.6 m/s tuning made this drill „95%
 * identical to the basic zebra" — the trigger fired so early and the walk was
 * so calm that a live player experienced the same long-approach patience test
 * as sc-crossing-let-pass. Now the figure appears ~2.5 s before a 40 km/h
 * arrival: still stoppable at the graded 40 km/h approach cap (≈ 20 m
 * reaction + braking), but ONLY with an immediate brake — the reaction
 * emergency the PE-02 archetype is. (This paragraph used to end „the corner
 * shop … hides the curb until the last moment"; it does not — see the section
 * header for the 8.5 m measurement. NOT PE-04 either: that archetype is an
 * unmarked mid-block child behind PARKED CARS, sc-hz-emergency-stop's drill.)
 * Delta discipline vs the siblings: let-pass 55 m/1.4 (patience), night-unlit
 * 30 m/1.4 (visibility), THIS 26 m/2.5 (suddenness) — and suddenness is the
 * half the world really does deliver, with or without the corner.
 */
const DART_PED: PedestrianDartOutSpec = {
  id: "sc-drt-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 80 },
  start: { x: CURB_X, y: 80 },
  dir: { x: 1, y: 0 },
  speedMps: 2.5,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 26,
  minTriggerSpeedKmh: 10,
};

/** PE-02 — внезапна поява на пешеходец на пътеката (ЗДвП чл. 119 + чл. 20:
 *  скорост и внимание, позволяващи спиране при внезапна поява). */
export const SC_CROSSING_DART: ScenarioSpec = {
  id: "sc-crossing-dart",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "внезапна поява", "реакция"],
  titleBg: "Внезапен пешеходец на пътеката",
  // WAS «…изскача иззад ъгъла…». There is no corner to come out from: the
  // section header has the 8.5 m measurement off pe-dart-v1.json. What the
  // world does stage is the SUDDENNESS (release at 26 m, 2.5 m/s), and that is
  // what the copy now promises.
  objectiveBg:
    "Приближи пешеходната пътека с готовност за спиране: пешеходец стъпва на зебрата в последния момент — реагирай навреме, спри и го пропусни, вместо да минеш през него.",
  archetypeIds: ["PE-02"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-dart-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 80 },
    districtId: "pe-dart-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и приближавай пешеходната пътека с готовност за спиране — кракът над спирачката." },
    // WAS «Ъгловият магазин вляво крие тротоара — не разчитай, че щом не
    // виждаш никого, няма никой.» The pavement is NOT hidden (section header,
    // 8.5 m). The lesson keeps its point by telling the truth about it: seeing
    // the pavement is not protection, because one step is all the warning
    // there is. 92 chars — inside the 95 the compact card can show.
    { n: 2, textBg: "Тротоарът вляво се вижда — но една крачка стига: човек стъпва на зебрата без предупреждение." },
    { n: 3, textBg: "Пешеходец изскача на пътеката точно когато наближаваш. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и го изчакай да освободи цялото платно." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-drt-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      // ⚠ 40 → 30 — the sc-bsh-approach repair one section down, on the drill
      // the sweep actually caught. `.audit-frames/sweep161/sc-crossing-dart/
      // mobile-wrong/08-debrief.png`: «✓ Приближи пътеката с готовност за
      // спиране 0:31» printed one panel above «✗ Твърде бързо приближаване към
      // пешеходна пътека −10 изпитни т. ОПАСНА ГРЕШКА», on a run with a 59 км/ч
      // top and 0 full stops. The two panels were both right about their own
      // number and the pair was a lie: the rule engine bills
      // PEDESTRIAN_CROSSING_TOO_FAST above `DEFAULT_RULE_CONFIG
      // .crossingApproachMaxKmh` = 30 (rules/types.ts) with a pedestrian on the
      // crossing, and this gate certified «готовност за спиране» up to 40.
      // A gate 10 км/ч above the law the same drill enforces teaches the
      // offence it is about to convict.
      //
      // It costs the student nothing he was not already doing: the three
      // committed drives hold 26 km/h and their scripts call 30 „the approach
      // cap" in their own headers (traces/scCrossingDart.ts). It cannot make
      // the drill unstoppable either — 30 km/h is 8.33 m/s, and reaction 1.0 s
      // + 7 m/s² braking is 8.33 + 4.96 = 13.3 m against a release at 26 m
      // (± the director's 3 m jitter). Both halves are asserted in
      // __tests__/pe-sweep161-truth.test.ts.
      params: { kind: "reachZone", x: LANE_2, y: 68, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-drt-clear",
      // WAS «Премини пътеката, след като е свободна» — see CLEAR_TITLE_NOTE at
      // the top of this file. Arrival 38 m past the zebra proves the crossing
      // was PASSED; чл. 119 keeps its grader in PEDESTRIAN_NOT_YIELDED
      // (mistakes[] below). Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 118, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-crossing-dart/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-dart/mistake-not-yielded.trace.json" },
      titleBg: "Преминаване през пешеходеца",
      whatWentWrongBg:
        "Водачът не реагира на внезапната поява и мина през пътеката, докато пешеходецът още пресичаше. Дори когато пешеходецът изскача изненадващо, предимството е негово — задължението за спиране остава на водача (чл. 119).",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-dart/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца",
      whatWentWrongBg:
        "Погледът беше другаде и колата изобщо не спря — блъсна стъпилия на пътеката пешеходец. Пред пешеходна пътека скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    // WAS «На всяка пешеходна пътека, чиято гледка е закрита от сграда…» —
    // written as if THIS map were the occluded case, which it is not (section
    // header, 8.5 m). The transfer is still true and is now stated as a
    // transfer: every zebra, and worst where the view is short.
    whenBg:
      "На всяка пешеходна пътека в града: пешеходец може да стъпи на зебрата без предупреждение — а най-зле е там, където гледката е къса (сграда на ъгъла, паркирани коли, спрял автобус).",
    whyBg:
      "Внезапната поява на пешеходец е защитаваната урбанистична спешност за начинаещите: секунда закъсняла реакция при 50 км/ч е близо 14 метра слепешком. Единствената защита е приближаване с готовност за спиране — вдигнат газ, крак над спирачката — и незабавна реакция със спирачка, не със завиване встрани.",
    lawRef: "ЗДвП чл. 119",
    // …and «при приближаване към закрита пътека» → the cap this drill actually
    // grades, which is also the law's own number (crossingApproachMaxKmh 30).
    examinerBg:
      "Изпитващият очаква намалена скорост и готовност за спиране при приближаване към пътеката, отчетлива реакция при появата на пешеходец и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
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
  staged: [DART_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-crossing-bus-shadow — „Пешеходци иззад спрял камион" (PE-10, the
//    stopped-large-vehicle kill zone) on pe-bus-v1 (crossing at y = 88). A
//    large stopped vehicle occupies the NEAR (east) curb south of the zebra: a
//    pedestrian cuts in front of it and crosses toward the far curb — emerging
//    into the player's lane from behind it, the „shadow". Graded as a
//    trace-side obstacle rect (scCrossingBusShadow.ts BUS_OBSTACLE), clear of
//    the driving lane; the shadow drive proves the car never touches it. LIVE
//    play shows the occluder too (founder R3 #26 „NO BUS AT ALL" ruling): the
//    procedural BOX TRUCK body stands at the BUS_OBSTACLE rect via the
//    heldSceneryFor dressing channel (sim/scene/scenarioSceneryProps.ts)
//    — the audit's costed stopgap until a real bus rig exists. The COPY is
//    honest about it („камион", not „автобус"); a future bus rig restores the
//    original bus-stop framing. Template id stays sc-crossing-bus-shadow
//    (trace paths + claims are keyed on it).
// ---------------------------------------------------------------------------

/** East (near-side) curb of a 1-lane-per-direction street (= −CURB_X): the
 *  bus stands here and the passenger steps off it. */
const EAST_CURB_X = 9.73;

/**
 * The staged NEAR-SIDE crosser at pe-x-1 (0, 88): steps off the EAST curb in
 * front of the stopped truck at 1.4 m/s, heading WEST across the carriageway,
 * once the player closes within ~44 m. Because she emerges from the truck's
 * shadow she is already in the player's lane by the time the sightline clears
 * — the PE-10 kill zone. The road-occupancy span is symmetric about the
 * centerline, so ROAD_FROM_M / ROAD_TO_M / TRAVEL_M are byte-identical to the
 * west-curb crossers; only the start point and direction flip.
 */
const BUS_SHADOW_PED: PedestrianDartOutSpec = {
  id: "sc-bsh-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 88 },
  start: { x: EAST_CURB_X, y: 88 },
  dir: { x: -1, y: 0 },
  speedMps: 1.4,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  // ⚠ 44 → 48 (doc 86, the T11 inversion found in this family by the lane-10
  // gradient sweep — NOT in the ledger's list). This is the family's only
  // NEAR-SIDE adult crosser: 5.67 m from the east curb to the driving line, so
  // at 1.4 m/s she needs 5.12 s to clear the 1.5 m contact band. With the old
  // 40 km/h approach gate a driver holding EXACTLY the graded cap arrived after
  // 3.94 s — measured closest approach 0.16–0.53 m across the trigger jitter,
  // i.e. a COLLISION for obeying the objective — while 60 km/h cleared at
  // 1.73–2.24 m. The approach gate below drops to 30 km/h (which is what the
  // copy has always said and what all three recorded drives already do) and the
  // release moves out to 48: closest approach at the cap is now 1.83–2.83 m and
  // contact starts at 32–36 km/h, i.e. only ABOVE the cap.
  triggerDistM: 48,
  minTriggerSpeedKmh: 10,
};

/**
 * THE SECOND FIGURE (doc 86 D2 — „plural copy against a singular staged
 * actor"). The lesson is titled «ПешеходцИ иззад спрял камион» and its teach
 * card describes „бързащите хора" in the plural, but the drill staged exactly
 * one walker. A second passenger steps out of the same shadow a stride further
 * north (the zebra is 6 m long, y ∈ [85, 91] — 89.6 is on the paint) at a
 * slightly quicker pace, so what the student sees behind the truck is a small
 * knot of people, not a single figure.
 *
 * The northward offset is the SAFE one: measured constant-speed closest
 * approach at the 30 km/h cap is 2.10–3.10 m across the jitter (the lead
 * walker's own is 1.83–2.83), so the not-yielded demo at 24 km/h and the
 * collision demo at 28 km/h keep grading exactly their authored codes.
 */
const BUS_SHADOW_PED_2: PedestrianDartOutSpec = {
  ...BUS_SHADOW_PED,
  id: "sc-bsh-ped2",
  start: { x: EAST_CURB_X, y: 89.6 },
  speedMps: 1.5,
};

/** PE-10 — пешеходци иззад спряло голямо превозно средство (ЗДвП чл. 119 +
 *  чл. 20: спрелият до пътеката камион крие гледката; приближавай с готовност
 *  за спиране и пропусни изскочилия пешеходец). Copy says КАМИОН — that is
 *  what the world stages today (the R3 #26 truck stopgap; see the section
 *  header). */
export const SC_CROSSING_BUS_SHADOW: ScenarioSpec = {
  id: "sc-crossing-bus-shadow",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "спрял камион", "закрита гледка"],
  titleBg: "Пешеходци иззад спрял камион",
  objectiveBg:
    "Приближавай спрелия до пътеката камион с готовност за спиране — иззад него на пътеката може да излезе пешеходец, когото не виждаш. Пропусни го и премини едва когато пътеката е свободна.",
  archetypeIds: ["PE-10"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-bus-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 88 },
    districtId: "pe-bus-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата и приближавай спрелия вдясно камион с готовност за спиране — под 30 км/ч, кракът над спирачката." },
    { n: 2, textBg: "Камионът крие тротоара пред себе си — не разчитай, че щом не виждаш никого, няма никой." },
    { n: 3, textBg: "Иззад камиона на пътеката излизат ДВАМА пешеходци, един след друг. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и ги изчакай да освободят цялото платно — вторият винаги е този, когото не си видял." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-bsh-approach",
      titleBg: "Приближи камиона и пътеката с готовност за спиране",
      // 40 → 30 (doc 86, the near-side inversion above): 40 km/h past a large
      // vehicle stopped AT a zebra is not «готовност за спиране» in any reading
      // of чл. 119, all three recorded drives already hold 24–28, and the
      // trace scripts themselves call 30 „the approach cap". The gate now says
      // what the lesson has always taught.
      params: { kind: "reachZone", x: LANE_2, y: 76, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-bsh-clear",
      // WAS «Премини пътеката, след като е свободна» — CLEAR_TITLE_NOTE at the
      // top of this file. Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 126, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-crossing-bus-shadow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-bus-shadow/mistake-not-yielded.trace.json" },
      titleBg: "Преминаване покрай камиона без пропускане",
      whatWentWrongBg:
        "Водачът подмина спрелия камион, без да пропусне излезлия иззад него пешеходец, и мина през заетата пътека. Спрялото до пътеката голямо превозно средство е предупреждение — пешеходецът на пътеката има предимство по чл. 119, дори да се появява внезапно иззад него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-bus-shadow/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца иззад камиона",
      whatWentWrongBg:
        "Колата подмина камиона със скорост и без готовност — и блъсна изскочилия иззад него пешеходец на самата пътека. При закрита от спряло превозно средство гледка скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спряло до пътеката голямо превозно средство — камион, автобус на спирка, бус — там пешеходец може да излезе иззад него без предупреждение точно преди зебрата. Класическата „сляпа зона“ зад голямото превозно средство е сред най-честите места за прегазване в града.",
    whyBg:
      "Голямото превозно средство закрива и пешеходеца от теб, и теб от пешеходеца — а бързащите хора пресичат точно отпред. Единствената защита е предварително намалената скорост и готовността за спиране: изскочи ли човек иззад него, имаш части от секундата за реакция със спирачка, не със завиване.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква видимо намалена скорост и готовност за спиране при подминаване на спрял камион или автобус до пътека, отчетлива реакция при появата на пешеходец и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
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
  staged: [BUS_SHADOW_PED, BUS_SHADOW_PED_2],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-crossing-child-ball — „Дете тича след топка" (PE-02 dart at a MARKED
//    crossing + PE-04 child-after-ball anticipation stimulus)
//    on pe-child-v1 (crossing at y = 78, a calm 40 km/h residential street). A
//    child runs onto the crossing after a ball — FAST (2.6 m/s, faster than the
//    rain sprinter) and from the residential frontage the generator's corner
//    shop stands in for. This is the emergency-brake / anticipation lesson: the
//    graded faults are approaching a residential crossing too fast to stop, and
//    striking the child.
// ---------------------------------------------------------------------------

/**
 * The staged RUNNING CHILD at pe-x-1 (0, 78): bolts off the WEST curb at
 * 2.6 m/s — a small child chasing a ball, distinctly faster than any adult
 * walk profile — only when the player closes within ~38 m (LATE: a reaction
 * emergency, not a long approach). The staged dart at a MARKED crossing is the
 * PE-02 mechanic; the child-after-ball is the PE-04 anticipation stimulus (the
 * canonical hazard-perception clip). The corner shop just west of the zebra
 * hides the frontage until the last moment (occlusion world dressing, zero
 * grading change). The occupancy span is the shared symmetric road window.
 *
 * Founder R3 #27 („no kid, no ball; completely wrong"): the figure now
 * RENDERS as a child (`variant: "child"` — the small rig, 0.72 scale, bigger
 * head, bright jacket), and the BALL leads it: at the trigger the template's
 * `hazard` ball (below) rolls out across the zebra, and the child follows
 * `ballLeadSec` 0.5 s behind — the ball IS the warning cue the anticipation
 * lesson teaches (see a ball → expect a child). The reaction stopwatch arms
 * at the ball. 0.5 s (not more): the ball launches faster (4.5 vs 2.6 m/s),
 * so the visual lead keeps growing across the road — while the child still
 * reaches the roadway early enough that the too-fast demo's 38 km/h hold
 * meets a genuinely occupied zebra (the crossingTooFastSustainSec = 1 s
 * window; probed against the seeded choreography).
 */
const CHILD_BALL_PED: PedestrianDartOutSpec = {
  id: "sc-cbl-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 78 },
  start: { x: CURB_X, y: 78 },
  dir: { x: 1, y: 0 },
  speedMps: 2.6,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 38,
  minTriggerSpeedKmh: 10,
  variant: "child",
  ballLeadSec: 0.5,
};

/** PE-02 / PE-04 — дете тича след топка на пътеката (ЗДвП чл. 119 + чл. 20: в
 *  жилищна зона с деца скоростта и вниманието трябва да позволяват спиране при
 *  внезапна поява). PE-02 = дартът на маркирана пътека; PE-04 = стимулът
 *  „дете след топка" (класическото разпознаване на опасност). */
export const SC_CROSSING_CHILD_BALL: ScenarioSpec = {
  id: "sc-crossing-child-ball",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "дете", "жилищна зона"],
  titleBg: "Дете тича след топка на пътеката",
  objectiveBg:
    "В квартална улица приближавай пътеката бавно и с готовност за спиране — дете може да изскочи след топка си на платното. Реагирай навреме, спри и го пропусни.",
  archetypeIds: ["PE-02", "PE-04"],
  conceptIds: ["c-crosswalk-yield", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-child-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 78 },
    districtId: "pe-child-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Улицата е квартална, с ограничение 40 км/ч — карай спокойно и наблюдавай тротоарите и дворовете." },
    { n: 2, textBg: "Пред пътеката намали още повече и дръж крака над спирачката — тук играят деца." },
    { n: 3, textBg: "Дете изтичва след топка си на пътеката. Реагирай веднага: спирачка, без да завиваш встрани." },
    { n: 4, textBg: "Спри напълно преди зебрата и изчакай детето да освободи цялото платно." },
    { n: 5, textBg: "Премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-cbl-approach",
      titleBg: "Приближи пътеката бавно, с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 66, radiusM: 10, maxSpeedKmh: 32 },
    },
    {
      id: "sc-cbl-clear",
      // WAS «Премини пътеката, след като е свободна» — CLEAR_TITLE_NOTE at the
      // top of this file. Params untouched ⇒ `done` is bit-identical.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 116, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-crossing-child-ball/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-child-ball/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване към детето",
      whatWentWrongBg:
        "Колата приближи кварталната пътека с непроменена скорост, докато детето вече беше на платното. Пред пътека с дете скоростта трябва да позволява спиране — чл. 119; дори при законно ограничение приближаването без готовност е опасната грешка, защото детето е малко, бързо и непредвидимо.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-child-ball/mistake-collision.trace.json" },
      titleBg: "Удар в детето",
      whatWentWrongBg:
        "Погледът беше другаде и колата изобщо не спря — блъсна изтичалото след топката дете на самата пътека. В квартална зона с деца скоростта и вниманието трябва да позволяват спиране при внезапна поява (чл. 20). Ударът прекратява изпита.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка квартална и жилищна зона, около училища, площадки и паркирани коли, иззад които може да изскочи дете. Появи ли се топка, ролер или тичащо дете — това е сигнал да си готов за пълно спиране.",
    whyBg:
      "Детето не преценява разстояния и скорости и тича право след топката, без да гледа. То е ниско и се появява внезапно иззад коли и огради. Единствената надеждна защита е предварително ниската скорост: при 30 км/ч спираш за метри, при 50 — прегазваш. Секунда закъсняла реакция струва живот.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква явно ниска скорост и готовност за спиране при приближаване към квартална пътека, незабавна реакция при появата на детето и пълно спиране преди зебрата. Преминаване през пешеходец е опасна грешка, а удар — прекратяване на изпита.",
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
  staged: [CHILD_BALL_PED],
  // R3 #27 — the BALL: the lesson's ballDartOut visual (TrafficLayer's L5
  // ball, reused) rolls from the same west curb across the zebra at 4.5 m/s
  // the moment the encounter triggers; the child follows 0.5 s later
  // (CHILD_BALL_PED.ballLeadSec). travelM 20.5 carries it across the 16.25 m
  // carriageway and onto the far curb, where it rests. Render-only — the
  // recorded traces and the grading never read it.
  hazard: {
    kind: "ballDartOut",
    x: CURB_X,
    y: 78,
    dirX: 1,
    dirY: 0,
    speedMps: 4.5,
    travelM: 20.5,
  },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-crossing-white-cane — „Пешеходец с бял бастун" (PE-14) on pe-cane-v1
//    (crossing at y = 92, a 50 km/h urban street). A blind pedestrian signals
//    with a white cane and crosses very slowly (0.75 m/s): absolute, everywhere
//    priority (ЗДвП). The lesson is RECOGNITION — the cane is an unconditional
//    stop command; you cannot rely on eye contact and must never creep or press.
//    Distinct map/geometry + faster street than the elderly slow-crosser (PE-08).
// ---------------------------------------------------------------------------

/**
 * The staged WHITE-CANE crosser at pe-x-1 (0, 92): steps off the WEST curb at
 * 0.75 m/s — a blind pedestrian tapping across, even slower than the elderly
 * profile, so the carriageway stays occupied ~22 s. Released early (within
 * ~56 m) so a correct approach spots the cane far ahead and stops; the lesson
 * is the absolute yield, not a reaction sprint.
 *
 * Founder R3 #28 („same adult, no cane, just slower; useless"): the figure
 * now RENDERS as the elder-with-white-cane rig (`variant: "elder"` — slight
 * stoop, right arm extended, the thin white cane sweeping the tarmac ahead).
 * The cane IS the recognition cue this drill grades the response to — which
 * is also why the PE-08 slow crosser (sc-crossing-slow-crosser) deliberately
 * stays variant-less: a white cane there would dilute PE-14's unique признак.
 */
const WHITE_CANE_PED: PedestrianDartOutSpec = {
  id: "sc-wcn-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: 92 },
  start: { x: CURB_X, y: 92 },
  dir: { x: 1, y: 0 },
  speedMps: 0.75,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 56,
  minTriggerSpeedKmh: 10,
  variant: "elder",
};

/** PE-14 — пешеходец с бял бастун (ЗДвП чл. 119: незрящият пешеходец с бял
 *  бастун има безусловно предимство навсякъде; спираш напълно и изчакваш). */
export const SC_CROSSING_WHITE_CANE: ScenarioSpec = {
  id: "sc-crossing-white-cane",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "бял бастун", "незрящ пешеходец"],
  titleBg: "Пешеходец с бял бастун",
  objectiveBg:
    "Разпознай белия бастун — незрящият пешеходец има безусловно предимство. Спри напълно преди пътеката, без да настъпваш, и го изчакай да я освободи целия, без да разчиташ, че те вижда.",
  archetypeIds: ["PE-14"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-cane-v1.json meta.scenario.params.
    params: { crossings: 1, signalized: "no", approachM: 92 },
    districtId: "pe-cane-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в своята лента и наблюдавай пешеходната пътека напред." },
    { n: 2, textBg: "Пешеходец с бял бастун стъпва на пътеката — това е незрящ човек с безусловно предимство. Намали рано." },
    { n: 3, textBg: "Спри напълно преди зебрата, без да настъпваш — той не може да те види и се ориентира по слуха." },
    { n: 4, textBg: "Изчакай търпеливо да измине ЦЯЛОТО платно; движи се бавно и има нужда от много време." },
    { n: 5, textBg: "Потегли едва когато е слязъл напълно от пътеката, и премини спокойно." },
  ],
  // B54 (founder, doc 87): „absolutely same as question 23 — slow pedestrian,
  // just … changed the visualisation". He was right about the DRILL: PE-08 and
  // PE-14 both asked for one capped approach and one clear-the-crossing
  // waypoint, so the only difference a student could feel was the mesh.
  //
  // The two lessons are not the same lesson and the tasks now say so. PE-08
  // grades PATIENCE with someone who is slow: approach, then wait them out.
  // PE-14 grades the ABSOLUTE yield to the white cane, and its middle act is
  // the one PE-08 never demands — a FULL STOP, wheels stationary, before the
  // zebra. A blind pedestrian navigates by the sound of a stopped engine and
  // cannot read a rolling creep as „he is letting me go", so „почти спрях" is
  // not a smaller version of the right thing here; it is the wrong thing.
  // Three tasks, and the middle one is the лесson.
  //
  // Geometry pinned to the committed shadow (content/traces/…/shadow-correct):
  // it holds 26 km/h through y = 62 and comes to a complete stop at y = 85.45
  // where it waits 22 s — so the recognition gate and the halt gate are the
  // demonstrated drive, measured, not invented.
  success: [
    {
      id: "sc-wcn-approach",
      titleBg: "Разпознай белия бастун отдалеч и намали още преди пътеката",
      params: { kind: "reachZone", x: LANE_2, y: 62, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-wcn-halt",
      titleBg: "Спри НАПЪЛНО преди зебрата — не настъпвай, той се ориентира по слуха",
      params: { kind: "reachZone", x: LANE_2, y: 85.5, radiusM: 6, maxSpeedKmh: 6 },
    },
    {
      id: "sc-wcn-clear",
      // WAS «Потегли чак когато е слязъл от цялото платно» — the same
      // certificate as the six «след като е свободна» rows above, worded round
      // the person instead of the paint (CLEAR_TITLE_NOTE). „Слязъл ли е" is a
      // fact about the walker; the disc sees a place. The halt gate above is
      // the measurable half of the duty and keeps its 6 км/ч; the rest is
      // PEDESTRIAN_NOT_YIELDED's, in mistakes[] below. Params untouched.
      titleBg: "Подмини пътеката и продължи по улицата",
      params: { kind: "reachZone", x: LANE_2, y: 130, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 100 },
  shadow: { path: "content/traces/sc-crossing-white-cane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-crossing-white-cane/mistake-too-fast.trace.json" },
      titleBg: "Твърде бързо приближаване към незрящия",
      whatWentWrongBg:
        "Колата задържа висока скорост към пътеката, докато незрящият пешеходец с бял бастун вече пресичаше. Пред пешеходна пътека със стъпил пешеходец скоростта трябва да позволява спиране — чл. 119; при незрящ човек, който не може да реагира на теб, готовността за спиране е още по-задължителна.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-crossing-white-cane/mistake-not-yielded.trace.json" },
      titleBg: "Непропускане на незрящия пешеходец",
      whatWentWrongBg:
        "Водачът мина през пътеката, докато незрящият пешеходец още я пресичаше. Белият бастун означава безусловно предимство — незрящият не може да те види, да прецени скоростта ти или да отстъпи. Задължението да спреш и да изчакаш е изцяло твое.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато пешеходец сигнализира с бял бастун — на пътека, на кръстовище, навсякъде. Белият бастун е знак за незрящ човек с безусловно предимство; разпознаването му е самата задача.",
    whyBg:
      "Незрящият пешеходец не може да разчита на зрителен контакт, да прецени скоростта ти или да отскочи в последния момент — цялата отговорност е твоя. Настъпването „под носа“ му е особено опасно, защото го дезориентира. Затова спираш напълно, рано и спокойно, и го изчакваш докрай.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият очаква разпознаване на белия бастун, отчетливо намаляване и пълно спиране без настъпване, и потегляне едва след пълното освобождаване на платното. Преминаване през незрящ пешеходец е опасна грешка.",
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
  staged: [WHITE_CANE_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 8. sc-pe-jaywalker — „Пешеходец на червено" (PE-13) on pe-jay-v1
// ---------------------------------------------------------------------------

/**
 * PE-13 — the jaywalker against red at a SIGNALIZED junction (ЗДвП чл. 120:
 * грижата към пешеходеца на платното не зависи от неговото нарушение). The
 * batch-1 header's skip note is now RESOLVED: pe-jay-v1 (gen_pe_jaywalk.mjs)
 * reuses the signal-x builder — a real signalized INTERSECTION the runtime
 * adjudicates — with ONE post-processed crossing (pej-x-1, north exit arm,
 * y = 34, signalized: true — glued to the junction cluster). The STAGED
 * walker ignores the red pedestrian phase by design: that IS the jaywalk.
 * The crossing-zone grading arms on OCCUPANCY, not phase — the driver's
 * green never suspends the duty of care. Trigger 55 m releases her as the
 * player crosses the stop line on green (natural phases in live play only
 * admit a line crossing on green, so the story holds structurally; the
 * recorded ghosts pin the canonical green via signalOffsets).
 *
 * ── A SWEEP-161 FINDING THAT IS REFUTED, WRITTEN DOWN SO IT IS NOT „FIXED" ──
 * The audit filed, against this template: „the vehicle signal facing the player
 * reads RED while the lesson is about a pedestrian who crosses against HIS
 * signal — the world's signal phase contradicts the lesson's own premise",
 * quoting „red aspect lit on both near-side heads" off
 * `.audit-frames/sweep161/sc-pe-jaywalker/mobile-right/04-t092s.png`.
 *
 * Those two heads are the WALKER'S, not the driver's. `world/builders/props.ts`
 * places one PEDESTRIAN head per kerb at every `crossings[].signalized` (doc 86
 * L3 / founder item 29) — a two-lens housing, red over green — and
 * `WorldProps.pedLampColors` lights its RED whenever the vehicle phase is
 * anything but red. Enlarging the frame settles it: the near-side pair are
 * TWO-lens housings with the top lens lit, and the three-lens VEHICLE head
 * beside the right one is showing GREEN on its bottom lens.
 *
 * So the frame the finding cites is a picture of the premise HOLDING: driver
 * green, pedestrian red, the woman on the zebra anyway — «Пешеходец на
 * червено», exactly as authored. Nothing here is to be „corrected": inverting
 * this phase would delete the lesson. The finding's SIBLING — the red the
 * student really was convicted at, 60 m earlier at the stop line — is real and
 * is closed at `signalPlan` below.
 */
/**
 * ── AND SHE HAD FINISHED CROSSING BEFORE HE GOT THERE ─────────────────────
 *    (wave 5, 2026-08-27 — found while settling the signal half of
 *    sc-pe-jaywalker:7746da56, on the same drive.)
 *
 * `.audit-frames/w12/frames/sc-pe-jaywalker__mobile-right`, whole sheet:
 * ИЗДЪРЖАН, both objectives ticked (0:56 and 2:02), COMMENDATIONS (0), no
 * «Разминавания на косъм» section at all, and not one pedestrian event in
 * 112 s. «Пешеходец на червено» was passed clean with no пешеходец in it.
 *
 * THE ARITHMETIC, and it is `triggerDistM`'s standing one — metres against a
 * clock. She is released 55 m out and needs 1.07 s to reach the carriageway
 * and 11.9 s to clear it (16.25 m at 1.5 m/s). That leg's mean pace was
 * ≈ 1.4 m/s, so those 55 m took ≈ 39 s: she stepped off the west kerb, crossed
 * the whole street and stood on the east pavement more than twenty seconds
 * before the car arrived at a bare zebra. It is the founder's own
 * sc-zebra-approach photograph — «Чакаш правилно» in front of nobody — one
 * lesson to the left, and `contracts.ts` documents `triggerEtaSec` as its fix.
 *
 * 9.0 s is the sibling value `templates-flow.ts` sc-za-ped already ships on the
 * identical geometry (55 m, floor 10, a 1+1 street), and it lands where this
 * drill needs her: 1.5 × 9.0 = 13.5 m along a walk that starts at x = −9.73, so
 * she is at x = 3.77 — inside the player's own lane (LANE_2 = 4.06) — at the
 * moment he arrives, at every pace below the (55/9)×3.6 = 22 км/ч crossover.
 * Above it the authored 55 m still governs, so the shadow and the „аз съм на
 * зелено" demo (both a flat 28 км/ч over the release point) are untouched and
 * the committed recordings replay byte for byte; the collision demo's strike is
 * an AUTHORED `{ kind: "collision" }` step, not a simulated one, so its verdict
 * cannot move with her either. The trace gate re-checks all three.
 *
 * The floor stays 10: 10 × KMH_TO_MPS × 9.0 = 25 m ≥ DART_CREEP_RELEASE_M, so
 * the release is continuous across it (the discontinuity that number has to
 * clear is written out at SC_HZ_EMERGENCY_STOP_DART in templates-hazards2.ts).
 */
const JAY_PED: PedestrianDartOutSpec = {
  id: "sc-jay-ped",
  kind: "pedestrianDartOut",
  crossingId: "pej-x-1",
  crossing: { x: 0, y: 34 },
  start: { x: CURB_X, y: 34 },
  dir: { x: 1, y: 0 },
  speedMps: 1.5,
  travelM: 23.45, // curb → across the 16.25 m carriageway → 5.6 m walk-out
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
  triggerEtaSec: 9.0,
};

export const SC_PE_JAYWALKER: ScenarioSpec = {
  id: "sc-pe-jaywalker",
  family: "pedestrians",
  tagsBg: ["пешеходци", "светофар", "зелено", "грижа"],
  titleBg: "Пешеходец на червено",
  // Founder R3 #29 (doc 62 — „zebra placement dubious"): the crossing pej-x-1
  // sits ~34 m past the junction node (a real Sofia pattern: пътека на
  // изхода, не на самото кръстовище), so the copy says „малко след", not
  // „веднага след". The „no traffic light" half of #29 is the lamp-render
  // path (W-SIG): pe-jay-v1 IS signalized (sx-n-c signalized: true,
  // pej-x-1 signalized: true) — the map needs no reuse swap.
  objectiveBg:
    "Премини светофарното кръстовище на зелено — и спри за пешеходеца, който пресича на своето червено на пътеката малко след него. Зеленото разрешава на теб, но не отменя грижата към човека на платното.",
  archetypeIds: ["PE-13"],
  conceptIds: ["c-pedestrian-rights-duties", "c-crosswalk-yield", "c-traffic-light-signals"],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in pe-jay-v1.json meta.scenario.params
    // (tools/maps/gen_pe_jaywalk.mjs: buildSignalXDistrict + the one
    // post-processed crossing).
    params: {
      armNorthM: 120,
      armSouthM: 120,
      armEastM: 90,
      armWestM: 90,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "pe-jay-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни на север — напред е светофарно кръстовище, а малко след него има пешеходна пътека." },
    // ── «СВЕТОФАРЪТ ЗА ТЕБ Е ЗЕЛЕН» WAS PRESENT TENSE, AND FOR THE FIRST 22 s
    //    OF EVERY SESSION IT WAS FALSE (sc-pe-jaywalker:7746da56, wave 5).
    //
    // The row was filed as „the vehicle signal facing the player reads RED",
    // reopened from CLOSED on a pixel count, and the useful thing to say about
    // it is neither of those: the LAMP IS RIGHT AND THE SENTENCE IS WRONG, and
    // both halves are measured rather than argued.
    //
    // MEASURED on `createWorldRuntime("pe-jay-v1")` with this template's own
    // `signalPlan` armed from the spawn — the phase of cluster `sx-n-c`, which
    // is the head this approach reads, over the first two minutes:
    //
    //     0.0 red · 22.0 redYellow · 23.0 green · 43.0 yellow · 46.0 red
    //             · 72.0 redYellow · 73.0 green · 93.0 yellow · 96.0 red
    //
    // So the lamp a student is looking at while he acknowledges «Разбрах» is
    // RED, and stays red for 22 s; on the 77.3 m approach it is red for 26 of
    // every 50 s. `signalPlan.greenFresh` (below) owns only the last 10.1 m —
    // it pins a fresh 20 s green the moment he enters the ring, which is why
    // the G8 gate and §4 of pe-sweep161-truth both find GREEN AT THE LINE at
    // every pace, and why re-probing it here at burst-23-with-dwell profiles
    // out to a 40 s dwell per cycle, and at a flat 3.85 км/ч crawl, returns
    // green at the line every time. The pin is not broken. The claim about the
    // other 67 m is.
    //
    // WHAT IT COST, on `.audit-frames/w12/frames/sc-pe-jaywalker__mobile-right`:
    // «Защо чакаш: червен сигнал · Спрял си пред стоп-линията и на червено това
    // е правилното» at t035/t040/t045, «the lawful wait was withdrawn after 10s»,
    // 1 lawful wait honoured (10 s) — a student stopped at red for ten seconds
    // on a lesson whose briefing had told him, flatly, that his light was green.
    // The verdict was ИЗДЪРЖАН and the jaywalk still happened, so nothing here
    // is a grading defect; what it teaches is that the briefing may be ignored,
    // which is the one lesson this product cannot afford to give.
    //
    // The sentence now says what the world does: the lamp cycles while you
    // approach, it will be green when you arrive, and you do not chase it. That
    // last clause is the better teaching anyway (чл. 20 ал. 2 — a green read
    // from 70 m is a green you may not still have), and it makes the lawful
    // 10 s wait a thing the drill predicted instead of a thing it denied.
    {
      n: 2,
      textBg:
        "Отдалече лампата сменя фазите — не гони зеленото. На кръстовището за теб ще е зелено: премини с готовност, гледай пътеката отвъд него.",
    },
    {
      n: 3,
      textBg:
        "Пешеходец пресича на своето червено! Твоето зелено не отменя грижата — намали и спри преди пътеката.",
    },
    { n: 4, textBg: "Изчакай го да освободи платното напълно — не се разминавай с него „на косъм“." },
    { n: 5, textBg: "Продължи на север, когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-jay-approach",
      titleBg: "Приближи кръстовището с премерена скорост",
      params: { kind: "reachZone", x: LANE_2, y: -45, radiusM: 8, maxSpeedKmh: 45 },
    },
    {
      id: "sc-jay-clear",
      titleBg: "Премини пътеката след кръстовището, когато е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 70, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-pe-jaywalker/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-jaywalker/mistake-my-green.trace.json" },
      titleBg: "„Аз съм на зелено“",
      whatWentWrongBg:
        "Колата премина през заетата пътека, защото „светофарът е зелен“. Зеленото разрешава преминаването през кръстовището — но пешеходецът, стъпил на платното, е защитен от чл. 120 дори в нарушение: пропускаш го, а простъпката му я отбелязва законът, не бронята ти.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-jaywalker/mistake-collision.trace.json" },
      titleBg: "Удар в пешеходеца",
      whatWentWrongBg:
        "Погледът остана върху зеления светофар, а не върху пътеката зад него — и колата удари пресичащия. Ударът в пешеходец прекратява изпита независимо чий сигнал е бил зелен: грижата по чл. 120 е абсолютна.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко светофарно кръстовище с пътека след него — особено в града, където пешеходци дотичват „на червено“. Твоето зелено е разрешение да преминеш, не имунитет срещу човека на платното.",
    whyBg:
      "Най-тежките удари с пешеходци стават точно на зелено за колата: водачът гледа светофара, не пътеката, и скоростта е висока. Чл. 120 е категоричен — пешеходецът на платното се пропуска дори когато пресича неправилно, защото той губи живота, а ти само секунди.",
    lawRef: "ЗДвП чл. 120",
    examinerBg:
      "Изпитващият гледа: премереното преминаване на зелено С наблюдение на пътеката отвъд, отчетливо спиране при пешеходец на платното (независимо от сигнала му) и потегляне едва на чиста пътека. Преминаване покрай пресичащ пешеходец е опасна грешка.",
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
  staged: [JAY_PED],
  /**
   * ⚠ doc 86 T10 — THE PROMISED GREEN WAS DELIVERED AS RED. Instruction 2 says
   * «Светофарът за теб е зелен», but the drill authored neither `signalPlan`
   * nor `signalModes`, so the lamp ran on the wall clock. On pe-jay-v1 the
   * junction node sx-n-c (0, 0) and the signalized crossing pej-x-1 (0, 34) are
   * 34 m apart — inside `CLUSTER_LINK_M` 40 — so they merge into ONE cluster
   * keyed „pej-x-1", whose deterministic offset is `fnv1a("pej-x-1") % 50` =
   * 27 s. With SIGNAL_TIMING = 20 green / 3 yellow / 26 red / 1 redYellow that
   * puts the NS axis on RED for t = 0 … 21.9 s. The player spawns at
   * sx-spawn-south (0, −105), 77.3 m short of the derived stop line at
   * y = −27.7, and reaches it at t ≈ 6.2 s (45 km/h) to 13.9 s (20 km/h) —
   * the WHOLE plausible arrival window sits inside the red. `RED_LIGHT_CROSSED`
   * (опасна, session-terminating at L4) was fully armed against a lesson whose
   * own copy told the student the light was green, and the red stall then held
   * the driver until the staged walker had finished crossing, so the jaywalk
   * encounter never happened either.
   *
   * `greenFresh` pins a full 20 s green the first frame the player enters the
   * ring. The cluster centroid is (0, 17), the midpoint of the junction node
   * and the crossing, so `triggerM` is measured from there. clusterId names the
   * junction node explicitly rather than relying on the cluster's id being the
   * alphabetically-first member. The trace recorder never reads signalPlan, so
   * the committed ghosts keep their authored signalOffsets byte-identically
   * (contracts.ts:223).
   *
   * ── ⚠ 90 → 55: A 20 s GREEN IS A DISTANCE BUDGET, AND 90 SPENT IT ON THE
   *    APPROACH (sweep 161, 2026-08-18) ───────────────────────────────────────
   *
   * The T10 fix above reasoned from „even a 15 km/h crawl covers 45.3 m in
   * 10.9 s". Nobody drives this lesson at a constant 15. The sweep drove it
   * twice, correctly, on both platforms — and the SAME script came out
   * ИЗДЪРЖАН · 0 наказателни точки on pc and НЕИЗДЪРЖАН · 10 т. on a phone,
   * the phone billed «Преминаване на червен сигнал» (опасна). Both drives were
   * stop-and-go: `pc-right` top 15 км/ч with 13 full stops and objective 1
   * ticked at 0:49 (52 m in 49 s ≈ 1.06 m/s ≈ 3.8 км/ч mean), `mobile-right`
   * top 19 км/ч, 13 full stops, objective 1 at 0:59. The pc run survived only
   * by stopping at the red it met and waiting it out — its «1 lawful wait
   * (27 s)» IS the red. The phone kept rolling and was convicted. That is not
   * two different drives; it is one drive against a coin.
   *
   * triggerM 90 put the ring at y = −72.9 and the line 45.2 m further on, so
   * the promised green only survived an approach averaging ≥ 45.2/20 = 2.26 m/s
   * = 8.1 км/ч. MEASURED on `createWorldRuntime(pe-jay-v1)` by replaying the
   * harness's own 5 s-throttle / 5 s-coast-to-rest profile — the phase the
   * runtime reports AT y = −27.725:
   *
   *      profile          triggerM 90     triggerM 55
   *      const  4 км/ч       RED             green
   *      const  8 км/ч       YELLOW          green
   *      burst peak  8       RED             green
   *      burst peak 11       RED             green   ← pc-right's own top
   *      burst peak 15       YELLOW          green
   *      burst peak 20       green           green
   *
   * 55 puts the ring at y = 17 − √(55² − 4.06²) = −37.85, i.e. 10.1 m short of
   * the line: 20 s of green covers it down to 0.5 m/s. It is the LARGEST value
   * that is green across the whole swept grid (constant 2…50 км/ч and burst
   * peaks 4…45), which is how the number was chosen rather than picked — going
   * further out starts failing the slow end again (58 loses const 2, 62 loses
   * burst 6, 64 loses const 3), and going nearer only buys crawls nobody
   * drives at the cost of the warning distance. 10.1 m is ~9 s of green in
   * hand at the pace this drill's own copy invites, and the lamp stands 37.9 m
   * ahead of the ring, well inside reading range.
   *
   * The spawn stays outside the ring as the contract requires (122.1 m from the
   * centroid), and no staged runner on this map pins a signal, so nothing has
   * to fire second. A student who genuinely STOPS DEAD for 20 s inside the ring
   * and then drives over without looking is still convicted — that one is a red
   * light run, and the gate must keep saying so.
   */
  signalPlan: { arm: "greenFresh", triggerM: 55, clusterId: "sx-n-c" },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The pedestrian-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_PE: readonly ScenarioSpec[] = [
  SC_CROSSING_LET_PASS,
  SC_CROSSING_SLOW_CROSSER,
  SC_CROSSING_RAIN_SPRINT,
  SC_CROSSING_DART,
  SC_CROSSING_BUS_SHADOW,
  SC_CROSSING_CHILD_BALL,
  SC_CROSSING_WHITE_CANE,
  SC_PE_JAYWALKER,
];
