/**
 * Scenario templates — the FLOW families (pedestrians · roundabout · lanes),
 * DATA ONLY in the templates.ts mold: coordinates are denormalized from the
 * committed district files (zb-v1 / rb-mini-v1 / ln-v1) so nothing loads
 * world JSON at runtime; the trace-gate batteries assert every pinned value
 * against the generated maps.
 *
 * Three templates, one per family (doc 76 §2):
 *  - sc-zebra-approach   „Пешеходна пътека"  (PE-01/PE-02, zb-v1)
 *  - sc-roundabout-entry „Кръгово движение"  (RB-01/RB-02, rb-mini-v1)
 *  - sc-lane-change      „Смяна на лента"    (OV-01/OV-02, ln-v1)
 *
 * Every staged encounter uses EXISTING StagedEventSpec kinds and every
 * mistake demo cites EXISTING rules-catalog codes — verified by replaying
 * the committed traces through the production stack
 * (traces/__tests__/sc-*-traces.test.ts, the §5/§9 gates).
 */

import type {
  BrakingLeadCarSpec,
  PedestrianDartOutSpec,
  RoundaboutEntrySpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; each battery asserts the copies match the map files)
// ---------------------------------------------------------------------------

/** Drawn lane width at the perceptual road scale (contracts.ts × 3.25 m). */
const LANE_W = 8.125;
/** Right-lane center of a 1-lane-per-direction street (zb-v1 / rb arms). */
const LANE_2 = 4.06;
/** Right/left lane centers of the 2+2 boulevard (ln-v1 meta.scenario). */
const LN_RIGHT = 12.19;
const LN_LEFT = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-zebra-approach — „Пешеходна пътека" (PE-01 hot approach / PE-02
//    dart-out at a marked crossing) on zb-v1
// ---------------------------------------------------------------------------

/**
 * The staged SLOW CROSSER at zb-x-1 (0, 90): steps off the WEST curb at walk
 * speed (1.4 m/s — the slow-crosser tier of the dart-out spec; a runner would
 * be ~2.9) once the player closes within ~55 m at any driving speed. Curb
 * offset math is the L4 convention: half-carriageway 8.125 + 0.4 curb +
 * 1.2 stand-back = 9.725 m; road span on the walk = [1.6, 17.85] m.
 * triggerDistM 55 releases her EARLY — she is already ON the zebra while the
 * approaching car is still far enough to stop from any legal urban speed
 * (the PE-01 teaching moment, and what lets the too-fast demo grade ONLY
 * its approach-speed code).
 */
const ZEBRA_PED: PedestrianDartOutSpec = {
  id: "sc-za-ped",
  kind: "pedestrianDartOut",
  crossingId: "zb-x-1",
  crossing: { x: 0, y: 90 },
  start: { x: -9.73, y: 90 },
  dir: { x: 1, y: 0 },
  speedMps: 1.4,
  // 20.0 m, not 23.45 (doc 87 B14 — the residual doc 86 L9 noted and never
  // actioned). zb-v1's pavement spans x ∈ [8.53, 12.03] (half-carriageway 8.125
  // + 0.4 curb + SIDEWALK_WIDTH_M 3.5), and the old walk-out rested her at
  // x = +13.72 — 1.7 m PAST the back of the pavement, standing on bare verge at
  // the end of every run. 20.0 m lands her at x = +10.27, mid-pavement: clearly
  // off the carriageway, clearly ON the footway. The road span is untouched
  // (roadFromM/roadToM below still govern when she is clear of the road), so the
  // graded encounter and every committed recording are identical.
  travelM: 20.0, // curb → across the 16.25 m carriageway → 2.15 m onto the pavement
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

/**
 * PE-01/PE-02 — the marked-zebra approach (ЗДвП чл. 119: пропусни стъпилите
 * на пътеката; чл. 119 ал. 4 — приближавай със скорост, позволяваща спиране).
 */
export const SC_ZEBRA_APPROACH: ScenarioSpec = {
  id: "sc-zebra-approach",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "градско каране"],
  titleBg: "Пешеходна пътека",
  objectiveBg:
    "Приближи маркираната пешеходна пътека със скорост, която позволява спиране, пропусни пешеходеца на нея и премини едва когато пътеката е свободна.",
  // Doc-72 provenance: PE-01 (hot approach to an occupied zebra) + PE-02
  // (pedestrian appears at a marked crossing).
  archetypeIds: ["PE-01", "PE-02"],
  conceptIds: ["c-crosswalk-yield", "c-pedestrian-rights-duties", "c-speed-adaptation"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in zb-v1.json meta.scenario.params
    // (tools/maps/gen_zebra_street.mjs).
    params: { crossings: 2, signalized: "no", approachM: 90 },
    districtId: "zb-v1",
  },
  start: {
    spawnPointId: "zb-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles night and HEADLIGHTS_OFF_AT_NIGHT is an
    // основна fault armed with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Потегли по улицата и се движи спокойно в своята лента. По тъмно първо провери късите светлини (чл. 70): пред пешеходна пътека нощем те са и твоят поглед към тротоара, и знакът, по който пешеходецът решава дали да стъпи." },
    {
      n: 2,
      textBg:
        "Видиш ли пешеходната пътека, вдигни крака от газта и наблюдавай тротоарите от двете страни.",
    },
    {
      n: 3,
      textBg:
        "Стъпи ли пешеходец на пътеката, намали плавно и спри напълно на няколко метра преди нея.",
    },
    {
      n: 4,
      textBg: "Изчакай пешеходеца да освободи цялата пътека — не потегляй, докато е на платното.",
    },
    { n: 5, textBg: "Огледай се и премини спокойно, когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-za-approach",
      titleBg: "Приближи пътеката с готовност за спиране",
      // The pre-crossing checkpoint 12 m before zb-x-1: reaching it at a
      // speed that still allows a full stop is the PE-01 skill itself.
      params: { kind: "reachZone", x: LANE_2, y: 78, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-za-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 130, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scZebraApproach.ts; gates in traces/__tests__/
  // sc-zebra-approach-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-zebra-approach/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-zebra-approach/mistake-too-fast.trace.json",
      },
      titleBg: "Твърде бързо приближаване",
      whatWentWrongBg:
        "Колата навлезе в зоната на пътеката с непроменена висока скорост, докато пешеходката вече беше на платното. Дори спирането след това да успее, самото приближаване без готовност е опасната грешка — чл. 119 изисква скорост, позволяваща спиране.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: {
        path: "content/traces/sc-zebra-approach/mistake-not-yielded.trace.json",
      },
      titleBg: "Непропускане на пешеходец",
      whatWentWrongBg:
        "Водачът прецени, че „има място“, и мина през пътеката, докато пешеходката още пресичаше. Пешеходецът на пътеката има предимство по чл. 119 — пропускаш го, като при нужда спреш напълно, а не като се разминаваш с него.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "При всяка маркирана пешеходна пътека без светофар — пред училища, спирки и магазини. Пешеходецът, стъпил на пътеката, има предимство, а ти дължиш скорост, която позволява да спреш.",
    whyBg:
      "Ударите на пешеходни пътеки са сред най-тежките градски произшествия — пешеходецът няма ламарина около себе си. Разликата между 30 и 50 км/ч при удар е разликата между натъртване и живото­застрашаваща травма, затова законът изисква готовност за спиране още при приближаването.",
    lawRef: "ЗДвП чл. 119",
    examinerBg:
      "Изпитващият гледа три неща: отчетливо намаляване при приближаване към пътеката, пълно спиране при пешеходец на нея и потегляне едва когато пътеката е освободена. Преминаване, докато пешеходецът е на платното, е опасна грешка и прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      // Изпитни условия: full cold-start protocol (exam ladder default aids).
      vehicleStart: "cold",
    },
      { level: 5, conditions: { night: true } }, // L5: пътека нощем — късно разпознаване
  ],
  staged: [ZEBRA_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-roundabout-entry — „Кръгово движение" (RB-01 entry without yielding /
//    RB-02 exit without right indicator) on rb-mini-v1
// ---------------------------------------------------------------------------

/**
 * The staged CIRCULATING CAR on the rb-mini-v1 ring (CCW loop w → s → e →
 * n → w, cruise 6 m/s): the RoundaboutEntryRunner syncs it to sit
 * `conflictLeadM` upstream of the player's south entry at arrival — the
 * "do I go or wait" moment — and the runtime's own circulatingConflict
 * tracker adjudicates the entry (FAILED_TO_YIELD / yielded commendation).
 */
const RB_CIRCULATING: RoundaboutEntrySpec = {
  id: "sc-rb-circulating",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: 18,
  actor: {
    pathNodes: ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 }, // dormant on the far (west) arc
    // 2.5 m/s (9 km/h, the runner's minSyncSpeedMps floor) — the timing dial
    // that keeps the whole LAWFUL tail-the-gap drive conviction- AND
    // collision-free. Two windows must both stay closed and they pull opposite
    // ways on car speed:
    //  · ENTRY: the ~90° arm→ring merge must be SLOW (spread > 5 s so it never
    //    sums to the 55° turn threshold), which leaves the roundabout yield
    //    tracker open until the driver sweeps RB_ON_RING_DEG (35°). A slow
    //    circulator stays on the driver's RIGHT (east arc) through that merge,
    //    reaching the north/left band only after ring priority is held.
    //  · EXIT: the driver circulates the ring FASTER than the car, so a fast
    //    circulator would be caught and rear-ended at the north exit. At 2.5
    //    m/s the car is still on the SE/E arc (well behind) when the driver
    //    reaches the north exit — no catch-up.
    // The shadow-trace gate proves the whole envelope.
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -18 }, // the player's south entry mouth (rbm-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 14,
  armDistM: 60,
  minSyncSpeedMps: 2.5,
  maxSyncSpeedMps: 8.5,
};

/**
 * RB-01/RB-02 — single-lane roundabout entry + signalled exit (ЗДвП чл. 50а:
 * влизащият пропуска движещите се в кръга; изходът се обявява с десен мигач).
 */
export const SC_ROUNDABOUT_ENTRY: ScenarioSpec = {
  id: "sc-roundabout-entry",
  family: "roundabout",
  tagsBg: ["кръгово движение", "предимство", "мигачи"],
  titleBg: "Кръгово движение",
  objectiveBg:
    "Приближи кръговото с готовност за спиране, пропусни движещите се в кръга, влез в подходящ интервал и излез на втория изход с включен десен мигач.",
  // Doc-72 provenance: RB-01 (entry without yielding to the ring) + RB-02
  // (exit without the right indicator).
  archetypeIds: ["RB-01", "RB-02"],
  conceptIds: ["c-roundabout-rules", "c-roundabout-behavior", "c-driver-signals"],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-mini-v1.json meta.scenario.params
    // (tools/maps/gen_mini_roundabout.mjs).
    params: { ringRadiusM: 18, arms: 4, armLengthM: 90, ringSpeedKmh: 30, armSpeedKmh: 40 },
    districtId: "rb-mini-v1",
  },
  start: {
    spawnPointId: "rbm-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Приближи кръговото спокойно и намали още преди знака „Пропусни движението“." },
    {
      n: 2,
      textBg:
        "Гледай наляво: движещите се в кръга са с предимство. Има ли кола в кръга — спри на линията и я пропусни.",
    },
    { n: 3, textBg: "Влез плавно в подходящ интервал и се движи по кръга обратно на часовниковата стрелка." },
    {
      n: 4,
      textBg: "Подмини първия изход. Преди твоя изход — вторият, направо на север — включи десния мигач.",
    },
    { n: 5, textBg: "Излез от кръга с включен десен мигач и продължи по улицата на север." },
  ],
  success: [
    {
      id: "sc-rb-approach",
      titleBg: "Приближи кръга с готовност за спиране",
      // The yield-line checkpoint just outside the decision zone (ring 18 m +
      // 12 m entry margin): arriving slowly is the RB-01 setup skill.
      //
      // doc 87 B18 („the green circle is put AFTER the give-way line") took
      // two passes, and this is the second one.
      //
      // The DRAWN marker was fixed in scene/guidanceRoute.ts: it is clamped to
      // a gate bar 0.80 m on the approach side of the М8 bars at y = −35.725,
      // and guidance-geometry.test.ts pins that. The anchor below deliberately
      // stays at y = −34 — the clamp only fires on a waypoint authored PAST
      // the line, so moving it back would silently delete the bar and put the
      // circle back.
      //
      // What was still wrong is the half the founder actually feels: the
      // GRADE. A radius-9 circle centred 1.725 m inside the mouth credits a
      // car stopped anywhere from 7.3 m past the paint backwards, so „stop at
      // the give-way line" was ticked off by a driver sitting in the ring —
      // and the L1/L2 tolerance ladder widened that forwards too.
      // `acceptBeforeMarkM` cuts the acceptance at the paint itself: 1.725 m
      // is the exact authored-mark → М8-bar distance (asserted against the
      // district's own stop line in guidance-geometry.test.ts, so a map change
      // cannot leave this number lying). Stopping SHORT still counts, at every
      // rung, with every metre the ladder adds; stopping past the bars never
      // does. „I have to stop before the line not after it."
      params: {
        kind: "reachZone",
        x: LANE_2,
        y: -34,
        radiusM: 9,
        maxSpeedKmh: 25,
        acceptBeforeMarkM: 1.725,
      },
    },
    {
      id: "sc-rb-ring",
      titleBg: "Премини през кръговото и излез с десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator — an unsignalled exit voids the traversal.
      //
      // enterRadiusM 24, AGAINST THE GEOMETRY (founder R3 #6: „reaching the
      // end did not end the lesson"). The rb-mini ring polyline sits at r=18,
      // but the drivable band is 18 ± LANE_WIDTH_M/2 = 18 ± 4.06 — a live
      // driver keeping honestly right circulates at r ≈ 20–22 and at the old
      // 21 the `entered` latch (d <= enterRadiusM) could NEVER fire, leaving
      // the objective structurally uncompletable on a legal line. 24 covers
      // the outer drivable edge (22.06) + margin, and stays inside the exit
      // window's start so mid-ring wobble cannot bank a false exit signal.
      // All three committed traces replay IDENTICALLY at 21 and 24 (shadow
      // dips to d=17.9; the no-signal demo still voids) — traces untouched.
      params: { kind: "completeManeuver", maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 24, exitRadiusM: 34 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRoundaboutEntry.ts; gates in traces/__tests__/
  // sc-roundabout-entry-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-roundabout-entry/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-roundabout-entry/mistake-barge-entry.trace.json",
      },
      titleBg: "Влизане без пропускане",
      whatWentWrongBg:
        "Колата навлезе в кръга с непроменена скорост точно пред движещия се в него автомобил. Влизащият НЯМА предимство — чл. 50а изисква да пропуснеш всички, които вече се движат по кръговото, дори това да значи пълно спиране на входа.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: {
        path: "content/traces/sc-roundabout-entry/mistake-exit-no-signal.trace.json",
      },
      titleBg: "Излизане без десен мигач",
      whatWentWrongBg:
        "Изходът от кръга беше взет рязко и без десен мигач — никой около кръга не знаеше, че колата напуска. Излизането е маневра: обявява се с десен мигач преди изхода, иначе чакащите на входовете и пешеходците край тях гадаят.",
      codeRefs: ["TURN_WITHOUT_INDICATOR"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово кръстовище — от малките квартални кръгчета до големите булевардни. Правилото е едно: движещите се в кръга са с предимство, влизащият изчаква интервал.",
    whyBg:
      "Кръговото е по-безопасно от обикновеното кръстовище само когато всички спазват реда на пропускане — влизане „на инат“ пред кола в кръга е сред най-честите причини за странични удари. А мигачът на изхода е това, което позволява на чакащите по входовете изобщо да потеглят.",
    lawRef: "ЗДвП чл. 50а",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване преди входа, поглед наляво и пропускане на движещите се в кръга, плавно влизане в реален интервал и десен мигач преди изхода. Влизане пред кола в кръга е опасна грешка; изход без мигач също се отбелязва.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
      { level: 5, traffic: { vehicleCount: 4 } }, // L5: живо кръгово
  ],
  staged: [RB_CIRCULATING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-lane-change — „Смяна на лента" (OV-01 no mirror / OV-02 no indicator)
//    on ln-v1
// ---------------------------------------------------------------------------

/**
 * The staged TARGET-LANE traffic: a pace car in the LEFT (target) lane that
 * arms on the player's first movement and then match-follows ~24 m BEHIND
 * the player's arc (negative followGapM — the blind-spot position the mirror
 * check exists for). HONEST AUTHORING NOTE: the brakingLeadCar runner is the
 * only staged kind that can hold a lane-locked pace relative to the player;
 * its slam tier is authored OUT of the play corridor (slamAt at the far road
 * end + minSlamSpeedKmh 250 + proximityFallbackM 0.5), so the encounter
 * never resolves and never grades — the actor is deterministic moving
 * traffic, not a braking drill. extraRightOffsetM −8.125 = one drawn lane to
 * the LEFT of the traffic graph's curb-lane centerline (the ln battery
 * proves the offset lands on x = 4.06).
 */
const LN_TARGET_LANE_CAR: BrakingLeadCarSpec = {
  id: "sc-lc-blindspot",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 20 },
    cruiseSpeedMps: 9,
    extraRightOffsetM: -8.125,
    colorIndex: 2,
  },
  followGapM: -24, // pace ~24 m BEHIND the player, in the target lane
  maxMatchSpeedMps: 12,
  slamAt: { x: 4.06, y: 395 }, // far road end — outside the play corridor
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.5, // …and the proximity fallback cannot occur pre-contact
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * OV-01/OV-02 — the mirror → signal → move lane change (ЗДвП чл. 25: преди
 * маневра водачът се убеждава, че няма да създаде опасност, и я обявява).
 */
export const SC_LANE_CHANGE: ScenarioSpec = {
  id: "sc-lane-change",
  family: "lanes",
  tagsBg: ["смяна на лента", "огледала", "мигачи"],
  titleBg: "Смяна на лента",
  objectiveBg:
    "Смени лентата надясно-наляво по учебния ред: огледало, мигач, поглед през рамо и плавно преместване — без да изненадаш движещите се в съседната лента.",
  // Doc-72 provenance: OV-01 (lane change without mirror) + OV-02 (lane
  // change without indicator).
  archetypeIds: ["OV-01", "OV-02"],
  conceptIds: ["c-lane-change", "c-mirrors-blind-spots", "c-driver-signals"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ln-v1.json meta.scenario.params
    // (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain AND night — both headlight faults
    // are armed with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Потегли и се установи стабилно в дясната лента с постоянна скорост. По тъмно или в дъжд включи първо късите светлини (чл. 70): престрояването зависи изцяло от това дали колата в съседната лента те вижда в огледалото си." },
    { n: 2, textBg: "Провери лявото огледало — има кола в лявата лента зад теб. Прецени скоростта ѝ." },
    { n: 3, textBg: "Включи левия мигач и задръж — сигналът винаги предхожда маневрата." },
    { n: 4, textBg: "Бърз поглед през рамо към мъртвата зона — огледалото не показва всичко." },
    { n: 5, textBg: "Премести се плавно и по диагонал в лявата лента и изключи мигача." },
  ],
  success: [
    {
      id: "sc-lc-cruise",
      titleBg: "Установи се в дясната лента",
      // Radius 4 < the 8.125 m lane pitch: the zone is satisfiable ONLY from
      // the right lane center — the setup half of the drill.
      params: { kind: "reachZone", x: LN_RIGHT, y: 150, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-lc-change",
      titleBg: "Премини в лявата лента след огледало и мигач",
      params: { kind: "reachZone", x: LN_LEFT, y: 260, radiusM: 4 },
    },
  ],
  rubric: { parTimeSec: 50 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLaneChange.ts; gates in traces/__tests__/
  // sc-lane-change-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-lane-change/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-lane-change/mistake-no-indicator.trace.json",
      },
      titleBg: "Престрояване без мигач",
      whatWentWrongBg:
        "Колата се премести в лявата лента, без да подаде ляв мигач — движещият се отзад в нея нямаше как да предвиди маневрата. Сигналът се подава преди преместването, не по време на него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: {
        path: "content/traces/sc-lane-change/mistake-no-mirror.trace.json",
      },
      titleBg: "Престрояване без проверка в огледалото",
      whatWentWrongBg:
        "Мигачът светна, но воланът тръгна без поглед в лявото огледало и през рамо — а точно там, в мъртвата зона, се движеше кола. Редът е железен: огледало → мигач → рамо → маневра.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK"],
    },
  ],
  teach: {
    whenBg:
      "При всяко престрояване по многолентов булевард — преди изпреварване, преди ляв завой, при освобождаване на бус-лента. Редът е винаги един и същ: огледало, мигач, рамо, маневра.",
    whyBg:
      "В мъртвата зона на огледалото се скрива цял автомобил. Престрояване „на сляпо“ е сред най-честите причини за странични удари в градския поток — а те стават точно при скоростите, при които изглеждат безобидни. Проверката отнема секунда и половина; ударът отнема месеци.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият следи реда на действията: поглед в огледалото от страната на маневрата, навременен мигач (2–3 секунди преди преместването), контролен поглед към мъртвата зона и плавна диагонална траектория без застрашаване на движещите се в лентата.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
      { level: 5, conditions: { weather: "rain", night: true } }, // L5: престрояване в дъжд нощем
  ],
  staged: [LN_TARGET_LANE_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The flow-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_FLOW: readonly ScenarioSpec[] = [
  SC_ZEBRA_APPROACH,
  SC_ROUNDABOUT_ENTRY,
  SC_LANE_CHANGE,
];

// LANE_W documents the derivation of the pinned lane centers above; keep the
// constant referenced so the derivation survives refactors.
void LANE_W;
