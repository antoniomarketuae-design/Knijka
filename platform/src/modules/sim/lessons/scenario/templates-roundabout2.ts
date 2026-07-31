/**
 * Scenario templates — the ROUNDABOUT family, shelf 2, DATA ONLY in the
 * templates.ts mold: coordinates are denormalized from the committed district
 * file (rb-ped-v1) so nothing loads world JSON at runtime; the trace-gate and
 * district batteries assert every pinned value against the generated map.
 *
 * Shelf 1 (templates-roundabout.ts) grades the ring itself: the entry yield,
 * the exit indicator, ring priority, the two-lane lane choice. This shelf opens
 * with the half of чл. 50а that all of them stop short of — WHAT IS ON THE
 * OTHER SIDE OF THE EXIT:
 *  - sc-rb-ped-exit „Пешеходец на изхода от кръговото“ (RB-05/RB-02,
 *    rb-ped-v1 — a NEW district) — the exit is a right turn INTO A STREET, and
 *    that street's zebra carries чл. 119 exactly like any other. The driver's
 *    attention is 100% on the circulating traffic behind them and 0% on the
 *    person already stepping off the curb ahead.
 *
 * WHY IT NEEDS ITS OWN MAP. rb-mini-v1 has no crossings at all. The teach is
 * not "there is a zebra" — it is the STOP POCKET: rb-ped-v1 puts the zebra 12 m
 * out from each exit's ring node, leaving 7.94 m of clear tarmac between the
 * circulatory carriageway and the crossing. One 4.3 m car fits and stops clear
 * of the ring; two do not. That single number is the entire lesson, and
 * tools/maps/gen_rb_ped.mjs enforces both of its walls (see the POCKET
 * INVARIANT there and the battery in world/__tests__/rb-ped-district.test.ts).
 *
 * Every staged encounter uses EXISTING StagedEventSpec kinds and every mistake
 * demo cites EXISTING rules-catalog codes — verified by replaying the committed
 * traces through the production stack
 * (traces/__tests__/sc-rb-ped-exit-traces.test.ts, the §5/§9 gates).
 *
 * Content provenance (doc 76 §9 stage 0 — original items, never listovki):
 * q-predimstvo-032 (завиваш надясно; пешеходец на пътеката на улицата, в която
 * НАВЛИЗАШ — чл. 119: the exact rule, one geometry away),
 * q-predimstvo-013 + q-krastovishta-030 (завой на кръстовище: пропускането на
 * пешеходците на изходящата пътека е част от завоя, не отделна услуга —
 * чл. 37 + чл. 119).
 */

import type { PedestrianDartOutSpec, RoundaboutEntrySpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from rb-ped-v1 by value — the L7 pattern;
// the trace/district batteries assert the copies match the map file)
// ---------------------------------------------------------------------------

/** Ring centerline radius (rb-ped-v1 meta.scenario.params.ringRadiusM). */
const RING_R = 18;
/** Arm right-lane center (rb-ped-v1 meta.scenario.laneCenterRightM) — the
 *  northbound lane of the south arm the player approaches and yields in, and
 *  the outbound lane of the north arm they exit into. */
const X_ARM_LANE = 4.06;
/** The exit zebra (rb-ped-v1 rbp-x-n) on the north arm's centerline. */
const Y_CROSSING = 30;
/**
 * The crosser's curb start, m west of the north arm's centerline. The pe-family
 * L4 convention: half-carriageway 8.125 + 0.4 curb + 1.2 stand-back = 9.725.
 */
const CURB_X = -9.73;
/** Road-occupancy span along the dart path (west edge → east edge across the
 *  16.25 m carriageway): 9.73 − 8.125 = 1.6 m in, 9.73 + 8.125 = 17.85 m out. */
const ROAD_FROM_M = 1.6;
const ROAD_TO_M = 17.85;
/** Curb → across the carriageway → a few metres of east walk-out. */
const TRAVEL_M = 23.45;

// ---------------------------------------------------------------------------
// sc-rb-ped-exit — „Пешеходец на изхода от кръговото“ (RB-05 pedestrian at the
// roundabout exit / RB-02 exit signalling discipline) on rb-ped-v1
// ---------------------------------------------------------------------------

/**
 * The staged CIRCULATING CAR on the rb-ped-v1 ring (CCW loop w → s → e → n →
 * w): the RoundaboutEntryRunner syncs it to sit `conflictLeadM` upstream of the
 * player's south entry at arrival — the "do I go or wait" moment — and the
 * runtime's own circulatingConflict tracker adjudicates the entry
 * (FAILED_TO_YIELD / yielded commendation).
 *
 * It is not scenery: it is the ATTENTION TAX that makes RB-05 the archetype it
 * is. The driver spends the entry and the whole east arc reading this car —
 * and the person on the exit zebra steps off the curb while they are still
 * doing it. Remove the car and the crosser is trivially obvious; that is a
 * different, easier lesson.
 *
 * cruiseSpeedMps 2.9 is pinned to the value sc-roundabout-entry and
 * sc-rb-exit-signal both proved: the ENTRY envelope is the tight one (a faster
 * car has swept onto the driver's LEFT by the time the entry chord is
 * committed, and the tracker convicts an otherwise clean entry).
 */
const RB_PED_CIRCULATING: RoundaboutEntrySpec = {
  id: "sc-rbp-circulating",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: RING_R,
  actor: {
    pathNodes: ["rbp-n-w", "rbp-n-s", "rbp-n-e", "rbp-n-n", "rbp-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 }, // dormant on the far (west) arc
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -RING_R }, // the player's south entry mouth (rbp-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 14,
  armDistM: 60,
  minSyncSpeedMps: 2.5,
  maxSyncSpeedMps: 8.5,
};

/**
 * THE CROSSER at rbp-x-n (0, 30) — the second half of the drill, and every
 * number in it is a timing dial measured against the ring, not a guess.
 *
 * She steps off the WEST curb (x = −9.73) walking EAST at 1.2 m/s, so she must
 * cross 12.2 m of tarmac to reach the player's outbound lane (x = +4.06): the
 * player who peels off the ring meets her mid-carriageway, coming AT their
 * lane. Walking the other way would put her in the player's half instantly and
 * out of it just as fast — a flash, not a yield.
 *
 * triggerDistM 30 is the whole encounter's clock. The runner releases her when
 * the player is within 30 m of the crossing and still approaching it, which on
 * this geometry is the ring's φ ≈ 105° — the driver is committed to the ring,
 * still reading the circulating car, and has NOT yet peeled off. She is on the
 * carriageway ~1.3 s later, in the player's lane at ~10 s, clear at ~13 s.
 *
 * WHY NOT AN EARLIER RELEASE. The RoundaboutEntryRunner's approach is ~48 m of
 * ring from the south mouth to this crossing, so a pe-family trigger (55 m)
 * would release her on the SOUTH ARM and she would be long gone before the exit
 * — the encounter would silently never happen. WHY NOT LATER: PedestrianDartOut
 * cancels itself if the crossing ever falls behind the player while still
 * `armed` (runners.ts: d < 60 and aheadOfPlayerM < −5). On the south → north
 * exit line the north zebra stays AHEAD of the driver at every ring angle, so
 * 30 is safely inside the live window — but a west-exit drill on this same map
 * could not use this dial.
 */
const RB_PED_CROSSER: PedestrianDartOutSpec = {
  id: "sc-rbp-crosser",
  kind: "pedestrianDartOut",
  crossingId: "rbp-x-n",
  crossing: { x: 0, y: Y_CROSSING },
  start: { x: CURB_X, y: Y_CROSSING },
  dir: { x: 1, y: 0 },
  speedMps: 1.2,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 30,
  minTriggerSpeedKmh: 8, // ring pace is ~12 km/h — a 10 km/h floor would misfire
};

/**
 * L5 „Усложнени“ — the SPRINTING crosser (the backlog's conditionsNote), and
 * she is a SECOND person on the same zebra rather than a replacement for the
 * first. That is a deliberate reading of the rung, forced by an honest
 * constraint and improved by it:
 *
 *  · FORCED: LevelSpec offers `stagedAdd` only — there is no `stagedReplace`
 *    (types.ts), and compile.ts concatenates (`[...spec.staged, ...stagedAdd]`).
 *    A rung cannot swap an actor out. Adding a field to that shared type to
 *    swap one pedestrian is not worth the blast radius.
 *  · IMPROVED: two people on one crossing is the harder and truer lesson.
 *    traffic/system.ts counts occupancy per crossing (crossingCounts), so the
 *    zebra reads OCCUPIED until the LAST of them is clear — which is exactly
 *    the real killer at crossings: the driver who waits for the person they saw,
 *    then moves off into the one they did not. Released at 18 m (φ ≈ 145°, just
 *    as the exit peel starts) at 2.1 m/s, she overtakes the walker and reaches
 *    the player's lane FIRST, ~9.6 s after the walker's release.
 *
 * Physics stays dry (ADR-006 opt-in discipline): the authored ghost envelope is
 * dry-tuned, and `conditions.weather` dresses the scene without re-tuning it.
 */
const RB_PED_CROSSER_SPRINT: PedestrianDartOutSpec = {
  ...RB_PED_CROSSER,
  id: "sc-rbp-crosser-sprint",
  speedMps: 2.1,
  triggerDistM: 18,
};

/**
 * RB-05/RB-02 — the archetype the roundabout family is built around and the one
 * every ring drill walks past: „zebra 5 m after the exit mouth; driver's
 * attention is 100% on circulating traffic, zero on the crossing" (doc 72).
 *
 * The exit of a roundabout is not the end of the roundabout. It is a RIGHT TURN
 * INTO A STREET, and чл. 119 governs that street's crossing exactly as it
 * governs the one in q-predimstvo-032's right-turn-on-green. The two duties
 * stack, and they stack in a fixed order: indicator first (чл. 25 — it is what
 * lets the mouths behind you move), pedestrian second (чл. 119 — it is what
 * decides whether you move). Neither replaces the other.
 */
export const SC_RB_PED_EXIT: ScenarioSpec = {
  id: "sc-rb-ped-exit",
  family: "roundabout",
  tagsBg: ["кръгово движение", "пешеходци", "пешеходна пътека", "изход", "мигачи"],
  titleBg: "Пешеходец на изхода от кръговото",
  objectiveBg:
    "Изходът от кръга е и десен завой: сигнализирай, и пропусни пешеходеца на пътеката върху изходния лъч.",
  // Doc-72 provenance: RB-05 (пешеходец на изхода на кръговото — the attention-
  // tunnel archetype, verbatim) + RB-02 (the exit's right indicator).
  archetypeIds: ["RB-05", "RB-02"],
  conceptIds: [
    "c-roundabout-rules", // „Кръгово движение: кой е с предимство“
    "c-roundabout-behavior", // „Движение и излизане от кръговото“
    "c-crosswalk-yield", // чл. 119 — the duty the exit hides
    "c-pedestrian-rights-duties",
    "c-driver-signals", // чл. 25 — the indicator half
    "c-hazard-perception", // the attention switch: vehicles → people
  ],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-ped-v1.json meta.scenario.params
    // (tools/maps/gen_rb_ped.mjs). NEW map: the ring needed exit zebras and a
    // measured stop pocket, which rb-mini-v1 has neither of.
    params: {
      ringRadiusM: RING_R,
      arms: 4,
      armLengthM: 90,
      entryArm: "south",
      crossingOffsetM: 12,
      ringSpeedKmh: 30,
      armSpeedKmh: 40,
    },
    districtId: "rb-ped-v1",
  },
  start: {
    spawnPointId: "rbp-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни от юг и намали преди входа — в кръга има кола и тя е с предимство. Пропусни я. Вали ли, включи късите светлини преди входа (чл. 70): на изхода те чака пешеходна пътека, а в дъжд пешеходецът тръгва по това дали вижда фарове да се приближават." },
    {
      n: 2,
      textBg:
        "Влез след нея и се движи по кръга обратно на часовниковата стрелка. Твоят изход е вторият — северният.",
    },
    {
      n: 3,
      textBg:
        "Подмини първия изход (изток) мълчаливо, после подай десен мигач. Дотук е обикновено кръгово — но сега вдигни очи от колата в кръга и погледни НАПРЕД, към пътеката на изхода.",
    },
    {
      n: 4,
      textBg:
        "На пътеката слиза пешеходец. Спри МЕЖДУ пръстена и пътеката — там има място точно за една кола. Не спирай в пръстена: там ще запушиш кръга за всички зад теб.",
    },
    {
      n: 5,
      textBg:
        "Изчакай човека да освободи ЦЯЛОТО платно, чак тогава тръгни и изключи мигача. Изходът е завой в улица — пътеката в нея е като всяка друга.",
    },
  ],
  success: [
    {
      id: "sc-rbp-past-east",
      titleBg: "Подмини първия изход и остани в кръга",
      // The east mouth on the ring centerline (rb-ped-v1: R = 18 around (0, 0);
      // the east node sits at (18, 0)). maxSpeedKmh 20 is the ring's own
      // envelope on R = 18 (a brisker circulation trips the turn detector — see
      // the trace script's window arithmetic), not a slow-down demand.
      params: { kind: "reachZone", x: RING_R, y: 0, radiusM: 6, maxSpeedKmh: 20 },
    },
    {
      id: "sc-rbp-pocket",
      titleBg: "Спри в джоба между кръга и пътеката",
      // THE POCKET, gated as an objective: rb-ped-v1's clear span runs from the
      // circulatory carriageway's outer edge (r = 22.06) to the zebra (r = 30).
      // The zone is centred at y = 26 — the pocket's middle — with radiusM 3.6
      // so it cannot be satisfied from inside the ring band NOR from beyond the
      // crossing. maxSpeedKmh 6: this rung is passed by STOPPING there, which
      // is the sentence the whole template teaches.
      params: { kind: "reachZone", x: X_ARM_LANE, y: 26, radiusM: 3.6, maxSpeedKmh: 6 },
    },
    {
      id: "sc-rbp-exit",
      titleBg: "Излез на северния изход с включен десен мигач",
      // The L3 roundabout contract (A10): exit ONLY under a right indicator —
      // an unsignalled departure voids the traversal (the evaluator resets
      // `entered`) and the student must come back for it.
      //
      // WHY enterRadiusM IS 29 AND NOT THE FAMILY'S USUAL 21. Objectives are
      // SEQUENTIAL (engine.ts: only objectives[currentObjectiveIndex] is
      // evaluated per frame), so this one does not begin evaluating until
      // sc-rbp-pocket completes — and by then the car is STOPPED IN THE POCKET
      // at r ≈ 27.3, having already left the ring. At the sibling templates' 21
      // the `entered` latch (d <= enterRadiusM) could never fire again and the
      // objective would be structurally uncompletable — the ring is behind the
      // student by the time it is asked about.
      //
      // 29 is chosen against the geometry, not by taste: above the pocket stop
      // (27.3) so the latch arms during the wait, and below the zebra (30) so it
      // arms INSIDE the pocket rather than at or past the paint. The ring
      // traversal itself is not lost — sc-rbp-past-east already gated it, at
      // (18, 0) ON the ring. So this rung grades exactly what its title says:
      // the departure from the pocket, announced.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 29,
        exitRadiusM: 34,
      },
    },
  ],
  // Informational only (doc 76 §6 — par time never hard-fails). The authored
  // shadow rides the whole drill in ~52 s, most of it the entry yield and the
  // wait in the pocket; 75 leaves room for an L1 crawl.
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRbPedExit.ts; gates in traces/__tests__/sc-rb-ped-exit-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rb-ped-exit/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-rb-ped-exit/mistake-exit-through-ped.trace.json",
      },
      titleBg: "Изход през пешеходеца",
      whatWentWrongBg:
        "Входът беше чист, мигачът светна навреме — и точно затова грешката е толкова честа: всичко „по кръговото“ беше вярно. Но очите останаха върху колата в пръстена, а кракът натисна газта на изхода. Човекът беше стъпил на пътеката ПРЕДИ колата да завие. Изходът от кръга не е край на кръговото — той е завой в улица, а пътеката в тази улица се подчинява на чл. 119 като всяка друга: пропускаш стъпилите на нея пешеходци. Точно тук загиват пешеходци на кръгови кръстовища — не на входа, а на изхода, под колелата на водач, който все още гледа назад.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-ped-exit/mistake-panic-brake.trace.json",
      },
      /**
       * HONEST SCOPE — read this before re-titling it back.
       *
       * The backlog asked for this demo to stop INSIDE the ring („Спиране В
       * пръстена заради пътеката"). It cannot be graded there, and the reason
       * is structural, not a tuning miss: HARSH_BRAKING_NO_CAUSE's own
       * false-positive armor treats junction proximity as a braking cause and
       * clears only when nextJunctionM > 35 (harshBrakeJunctionClearM). Every
       * point of an R = 18 ring is within 2·R·sin(22.5°) = 13.8 m of a mouth,
       * so the armor is permanently on inside the ring — proven directly in
       * world/__tests__/rb-ped-district.test.ts ("inside the ring, nextJunctionM
       * never clears the harsh-brake armor"). The onset floor rules it out
       * twice over: the detector needs ≥ 35 km/h (harshBrakeMinSpeedKmh) and the
       * ring's turn-detector ceiling is ~20 km/h. sc-rb-circulate-priority hit
       * the identical wall and took the identical route.
       *
       * So the phantom brake is DEMONSTRATED on the approach arm, where the
       * cause ledger is genuinely clear (y ≈ −68 is 50 m from the south node,
       * and rb-ped-v1 deliberately carries no zebra on the entry arm — the
       * detector also gates on `s.crossing === null`). The card copy carries the
       * whole arc, because the arc is the lesson: the brake that is merely
       * useless here is a ring-blocker thirty metres later.
       */
      titleBg: "Заковаване на спирачката заради пътеката",
      whatWentWrongBg:
        "Пешеходецът на изхода се вижда отдалеч — и кракът скочи на спирачката още на подхода, петдесет метра преди кръговото, заковавайки колата насред правия участък. Пътеката не е твоя проблем, докато не си в изходния лъч: спирането заради нея на подхода е излишно, изненадва движещия се зад теб и е предпоставка за удар отзад. И е репетиция за по-лошото: същата спирачка в САМИЯ пръстен запушва кръга — там нямаш право да спираш заради пътека, до която още не си стигнал, защото зад теб цялото кръгово спира. Правилното място за спиране е едно-единствено: джобът между пръстена и пътеката, дълъг точно колкото една кола. Гледай далеч напред, слез от газта рано — и спри ТАМ, не по-рано и не в кръга.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изход от кръгово в град — квартално кръгче, булевардно кръстовище, изпитният маршрут. Пътеката е почти винаги на няколко метра след устието на изхода, точно там, където току-що си престанал да гледаш напред.",
    whyBg:
      "Кръговото поглъща вниманието наляво: цялата подготовка, целият вход и половината пръстен са „гледай колата в кръга“. Точно затова изходът е капан — в мига, в който предимството е спечелено и кракът търси газта, погледът все още е назад-наляво, а пешеходецът е напред-надясно. Затова седемдесет процента от градските загинали са уязвими участници, и затова на кръговите те загиват на ИЗХОДА, не на входа. Спасява те едно съзнателно превключване: щом мигачът светне, очите отиват напред, към пътеката. И едно място за спиране: джобът между пръстена и пътеката — там чакаш човека, без да блокираш кръга. Спреш ли в пръстена, спасяваш пешеходеца и същевременно спираш цялото кръстовище зад себе си; минеш ли през пътеката, спасяваш кръстовището и убиваш човек. Джобът е отговорът и на двете.",
    lawRef: "ЗДвП чл. 50а; чл. 119",
    examinerBg:
      "Изпитващият следи изхода в този ред: десен мигач след последния подход преди твоя, после ЯВНО пренасочване на погледа напред към пътеката, после спиране между пръстена и пътеката, ако там има човек. Непропускане на пешеходец на пътеката е основна грешка и на изпита се отбелязва веднага. Спиране в самия пръстен се отбелязва като „закъснели действия“ / създаване на пречка — обяснението „но аз пропусках пешеходец“ не го отменя: правилното място за същото спиране е с една кола по-нататък.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
    },
    {
      // L5: дъжд + ВТОРИ пешеходец, който тича по пътеката и стига до твоята
      // лента пръв. Изчакал си единия — а платното още не е свободно.
      // Physics stays dry (ADR-006 opt-in).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [RB_PED_CROSSER_SPRINT],
    },
  ],
  staged: [RB_PED_CIRCULATING, RB_PED_CROSSER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The ROUNDABOUT family's shelf-2 templates (spread into SCENARIO_TEMPLATES
 *  by templates.ts — the integration seam). */
export const SCENARIO_TEMPLATES_ROUNDABOUT2: readonly ScenarioSpec[] = [SC_RB_PED_EXIT];
