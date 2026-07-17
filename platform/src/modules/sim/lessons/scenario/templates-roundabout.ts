/**
 * Scenario templates — the ROUNDABOUT family, DATA ONLY in the templates.ts
 * mold: coordinates are denormalized from the committed district file
 * (rb-mini-v1) so nothing loads world JSON at runtime; the trace-gate
 * batteries assert every pinned value against the generated map.
 *
 * The live entry template (sc-roundabout-entry, RB-01/RB-02) stays in
 * templates-flow.ts — it grades the ENTRY yield. This file opens the family's
 * own shelf with the complementary halves of чл. 50а:
 *  - sc-rb-exit-signal „Изход от кръгово с десен мигач“ (RB-02/RB-06,
 *    rb-mini-v1) — EXIT discipline: circulate past the spokes that are not
 *    yours and announce the exit with the right indicator only AFTER the last
 *    approach before it.
 *  - sc-rb-circulate-priority „В кръга си с предимство“ (RB-03/RB-05,
 *    rb-mini-v1) — the INVERSE of the entry drill: once you are on the ring
 *    the priority is yours, and the cars standing at the mouths are waiting
 *    for YOU. Hold one line and one pace; do not brake for them.
 *  - sc-rb-busy-gap „Пролука в натоварено кръгово“ (RB-01, rb-mini-v1) — the
 *    entry drill's SECOND half: sc-roundabout-entry teaches THAT you yield to
 *    one circulator; this grades WHICH gap you then take out of two on offer,
 *    with a pair of cars in the ring.
 *
 * Every staged encounter uses EXISTING StagedEventSpec kinds and every
 * mistake demo cites EXISTING rules-catalog codes — verified by replaying the
 * committed traces through the production stack
 * (traces/__tests__/sc-rb-exit-signal-traces.test.ts,
 * traces/__tests__/sc-rb-circulate-priority-traces.test.ts and
 * traces/__tests__/sc-rb-busy-gap-traces.test.ts, the §5/§9 gates).
 *
 * Content provenance (доc 76 §9 stage 0 — original items, never listovki):
 * q-krastovishta-013 (влизане в интервал, чл. 50а), q-krastovishta-015
 * (изход и предимство при смяна на лента, чл. 25 + чл. 50а),
 * q-krastovishta-050 + q-signs-046 (синият знак „Кръгово движение“ урежда
 * само посоката, не предимството), q-predimstvo-021 + q-predimstvo-022
 * (движещият се в кръга е с предимство пред влизащия),
 * q-krastovishta-012 (поведение в самия пръстен),
 * q-predimstvo-057 (в кръга предимство имат движещите се в него).
 */

import type { PriorityFromRightSpec, RoundaboutEntrySpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from rb-mini-v1 by value — the L7
// pattern; the trace/district batteries assert the copies match the map file)
// ---------------------------------------------------------------------------

/** Ring centerline radius (rb-mini-v1 meta.scenario.params.ringRadiusM). */
const RING_R = 18;
/** Arm right-lane center (rb-mini-v1 meta.scenario.laneCenterRightM) — the
 *  northbound lane of the south arm the player approaches and yields in. */
const X_ARM_LANE = 4.06;

// ---------------------------------------------------------------------------
// sc-rb-exit-signal — „Изход от кръгово с десен мигач“ (RB-02 exit without the
// right indicator / RB-06 full-circulation signalling discipline) on rb-mini-v1
// ---------------------------------------------------------------------------

/**
 * The staged CIRCULATING CAR on the rb-mini-v1 ring (CCW loop w → s → e → n →
 * w): the RoundaboutEntryRunner syncs it to sit `conflictLeadM` upstream of
 * the player's south entry at arrival — the "do I go or wait" moment — and the
 * runtime's own circulatingConflict tracker adjudicates the entry
 * (FAILED_TO_YIELD / yielded commendation).
 *
 * cruiseSpeedMps 2.9 is the timing dial and it is pinned to the SAME value
 * sc-roundabout-entry proved, because the ENTRY envelope is the tight one: a
 * faster car has swept onto the north-east arc — the driver's LEFT — by the
 * time the driver commits the entry chord, and the roundabout tracker convicts
 * an otherwise clean entry (measured: 3.35 m/s fires FAILED_TO_YIELD mid-
 * chord). A crawler stays on the driver's RIGHT until ring priority is won.
 * The cost lands on the EXIT half instead: this drill rides ~190° of ring
 * (south mouth → third/west exit), nearly twice the entry template's arc, so
 * the authored circulation matches the car's pace (~10.5 km/h) rather than the
 * entry template's brisker 12 — otherwise the driver reels it in and rear-ends
 * it at the exit. The shadow-trace gate proves the whole envelope.
 */
const RB_EXIT_CIRCULATING: RoundaboutEntrySpec = {
  id: "sc-rbx-circulating",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: RING_R,
  actor: {
    pathNodes: ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 }, // dormant on the far (west) arc
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -RING_R }, // the player's south entry mouth (rbm-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 14,
  armDistM: 60,
  minSyncSpeedMps: 2.5,
  maxSyncSpeedMps: 8.5,
};

/**
 * L5 „Усложнени“ — a SECOND circulating car so the ring never empties and the
 * exit must be announced into live company. Same runner kind, own id and own
 * ring loop (starting at the east node): two RoundaboutEntryRunners share one
 * ring deterministically.
 *
 * The phase offset is authored through conflictLeadM: the runner syncs each
 * car to sit `nodeS[entryNodeIndex] − conflictLeadM` when the player reaches
 * the mouth. On this loop nodeS[3] (rbm-n-s) = 84.8 m, so 70 parks car 2 at
 * s ≈ 14.8 m — the north-east arc, roughly HALF A RING from car 1's 14 m-
 * before-the-south-mouth station. One car is always in sight from the ring.
 */
const RB_EXIT_CIRCULATING_2: RoundaboutEntrySpec = {
  ...RB_EXIT_CIRCULATING,
  id: "sc-rbx-circulating-2",
  actor: {
    pathNodes: ["rbm-n-e", "rbm-n-n", "rbm-n-w", "rbm-n-s", "rbm-n-e"],
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 2,
  },
  entryNodeIndex: 3, // rbm-n-s on THIS loop's node order
  conflictLeadM: 70, // ≈ half a ring behind car 1 (see above)
};

/**
 * RB-02/RB-06 — the exit half of чл. 50а: the ring is left as a MANEUVER, and
 * a maneuver is announced (чл. 25). The signal timing is the whole lesson:
 * announced too early it reads as "I leave at the next mouth" and stalls the
 * drivers waiting there; never announced, nobody at the mouths can move at all.
 */
export const SC_RB_EXIT_SIGNAL: ScenarioSpec = {
  id: "sc-rb-exit-signal",
  family: "roundabout",
  tagsBg: ["кръгово движение", "мигачи", "изход", "маневри"],
  titleBg: "Изход от кръгово с десен мигач",
  objectiveBg:
    "Обиколи кръговото и подай десен мигач след последния подход преди твоя изход, за да пуснеш чакащите да влязат.",
  // Doc-72 provenance: RB-02 (exit without the right indicator) + RB-06 (long
  // circulation past several mouths, signalling ONLY at the final exit).
  archetypeIds: ["RB-02", "RB-06"],
  conceptIds: [
    "c-roundabout-rules",
    "c-roundabout-behavior",
    "c-driver-signals",
    "c-maneuver-principles",
  ],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-mini-v1.json meta.scenario.params
    // (tools/maps/gen_mini_roundabout.mjs). REUSED map: this template adds no
    // district file.
    params: { ringRadiusM: RING_R, arms: 4, armLengthM: 90, ringSpeedKmh: 30, armSpeedKmh: 40 },
    districtId: "rb-mini-v1",
  },
  start: {
    spawnPointId: "rbm-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни от юг и намали преди входа — в кръга има кола и тя е с предимство." },
    {
      n: 2,
      textBg:
        "Влез в реален интервал след нея и се движи по кръга обратно на часовниковата стрелка, без мигач — още не излизаш.",
    },
    {
      n: 3,
      textBg:
        "Подмини първия изход (изток) и втория (север). Мигач сега би излъгал чакащите на тези входове, че напускаш.",
    },
    {
      n: 4,
      textBg:
        "Чак СЛЕД като подминеш северния подход — последния преди твоя — включи десния мигач. Това е сигналът, който пуска чакащите на запад да потеглят.",
    },
    { n: 5, textBg: "Излез на третия изход (запад) с включен мигач и го изключи веднага след изхода." },
  ],
  success: [
    {
      id: "sc-rbx-past-spokes",
      titleBg: "Подмини първите два изхода и остани в кръга",
      // The north mouth on the ring centerline (rb-mini-v1: R = 18 around
      // (0, 0); the north node sits at (0, 18)). Reaching it AT ring pace is
      // the RB-06 setup: two spokes passed, still circulating, still silent.
      params: { kind: "reachZone", x: 0, y: RING_R, radiusM: 6, maxSpeedKmh: 30 },
    },
    {
      id: "sc-rbx-exit",
      titleBg: "Излез на третия изход с включен десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator — an unsignalled exit voids the traversal and the
      // student must go round again.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 21,
        exitRadiusM: 34,
      },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRbExitSignal.ts; gates in traces/__tests__/
  // sc-rb-exit-signal-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rb-exit-signal/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-rb-exit-signal/mistake-exit-no-signal.trace.json",
      },
      titleBg: "Изход без мигач",
      whatWentWrongBg:
        "Входът беше чист, обиколката също — но колата напусна кръга мълчаливо. Чакащите на западния вход виждаха само една кола, която обикаля, и нямаха причина да потеглят: изходът е маневра и се обявява с десен мигач ПРЕДИ него (чл. 25). Точно този пропуск задръства кръговите в час пик.",
      codeRefs: ["TURN_WITHOUT_INDICATOR"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-exit-signal/mistake-barge-entry.trace.json",
      },
      titleBg: "Нахлуване в кръга пред циркулираща кола",
      whatWentWrongBg:
        "До изхода изобщо не се стигна: колата влезе в кръга с непроменена скорост пред автомобил, който вече се движеше в него. Влизащият НЯМА предимство — чл. 50а изисква да пропуснеш движещите се в кръга, дори това да значи пълно спиране на входа. „Пропусни“ не значи „чакай празен кръг“, а „не карай никого в кръга да намалява“.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово, на което твоят изход НЕ е първият: квартално кръгче с три изхода, голямо булевардно кръстовище, изпитният маршрут. Колкото повече подходи подминаваш, толкова по-важно е кога точно светва десният мигач.",
    whyBg:
      "Кръговото работи, защото чакащите на входовете четат намеренията на тези в кръга. Мигач, включен твърде рано, кара водача на следващия вход да потегли пред теб — и ти влизаш в него. Мигач, който изобщо не светва, замразява всички входове зад теб: колоната расте, някой губи търпение и влиза „на инат“. Едно движение на лоста след последния подход решава и двата проблема.",
    lawRef: "ЗДвП чл. 25; чл. 50а",
    examinerBg:
      "Изпитващият гледа три неща на изхода: мигачът да светва СЛЕД подхода преди твоя (не по-рано), колата да държи една траектория в пръстена без колебания и мигачът да се изключи веднага след напускането на кръга. Изход без мигач се отбелязва като второстепенна грешка; ранният мигач се отбелязва като подвеждащ сигнал.",
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
      // L5: втора кола в кръга + дъжд — пръстенът не се изпразва и изходът се
      // обявява в жива компания. Physics stays dry (the authored ghost
      // envelope is dry-tuned — ADR-006 opt-in discipline).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [RB_EXIT_CIRCULATING_2],
    },
  ],
  staged: [RB_EXIT_CIRCULATING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-rb-circulate-priority — „В кръга си с предимство“ (RB-03 causeless stop
// inside the ring / RB-05 wandering line in the ring) on rb-mini-v1
// ---------------------------------------------------------------------------

/**
 * The staged WAITING CAR at the WEST mouth — the car whose presence tempts a
 * learner to give away a priority that is already theirs.
 *
 * It is a PriorityFromRightRunner actor parked in the runner's own documented
 * „staged and waiting" state: while the player is inside `armDistM` of the
 * junction but still further than PRIORITY_COMMIT_PLAYER_M (22 m) from it, and
 * the car sits within PRIORITY_COMMIT_CAR_M + 3 (28 m) of its node, the runner
 * commands `cruise speedMps: 0` every tick — a car standing at its give-way
 * line making no priority claim. `hold.offsetM` 78 on the 90 m west arm parks
 * it 12 m short of the ring node: inside the 28 m hold window from the first
 * armed tick, so it never rolls.
 *
 * WHY THE WEST MOUTH AND NOT THE ONE THE DRIVER RIDES PAST. The runner is
 * built for the opposite lesson — it COMMITS its car through the junction the
 * moment the player closes within 22 m of it, which is exactly what a driver
 * circulating past that mouth does (the ring node IS the junction node, so the
 * distance goes to zero). On rb-mini's R = 18 ring the mouths sit 25.5 m apart,
 * so the only mouth a south-entry → north-exit drive never comes within 22 m of
 * is the west one — measured closest approach ≈ 31 m, at the φ = 150° exit peel.
 * That 9 m of margin is what keeps the car standing. A car waiting at a mouth
 * the driver rides PAST is not expressible with today's runners; see the
 * template's note in the wave report.
 */
const RB_CIRC_WAITER: PriorityFromRightSpec = {
  id: "sc-rbc-waiter",
  kind: "priorityFromRight",
  junction: { nodeId: "rbm-n-w", x: -RING_R, y: 0 },
  // Roundabout mouths are give-way, not stop-line controlled: "uncontrolled"
  // keeps the runner from ever emitting a stop-line give-way commendation on
  // an encounter the driver is not supposed to resolve at all.
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["rbm-n-w-out", "rbm-n-w", "rbm-n-s", "rbm-n-e"],
    hold: { nodeIndex: 0, offsetM: 78 }, // 12 m short of the ring node
    cruiseSpeedMps: 6,
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  armDistM: 60,
  // Unused on this encounter (the carDist hold branch short-circuits before the
  // arrival sync and the runner never reaches its triggered phase) — authored
  // at plausible urban values rather than left as dead zeros.
  leadSec: 2,
  lineDistM: 0,
  clearSpeedMps: 8,
};

/**
 * RB-03/RB-05 — the half of чл. 50а that the entry drill inverts. Every learner
 * is taught „пропусни движещите се в кръга"; the failure mode nobody teaches is
 * the SAME sentence read from inside the ring, where it means the opposite: the
 * cars at the mouths are waiting for you, and stopping to „let one in" turns
 * the ring's one working rule into a jam.
 */
export const SC_RB_CIRCULATE_PRIORITY: ScenarioSpec = {
  id: "sc-rb-circulate-priority",
  family: "roundabout",
  tagsBg: ["кръгово движение", "предимство", "равномерна скорост", "траектория"],
  titleBg: "В кръга си с предимство",
  objectiveBg:
    "Докато си вътре в кръговото, дръж равномерна скорост и НЕ спирай заради чакащите на входовете — предимството е твое.",
  // Doc-72 provenance: RB-03 (causeless stop inside the ring) + RB-05 (the
  // wandering, hesitant line in the ring).
  archetypeIds: ["RB-03", "RB-05"],
  conceptIds: [
    "c-roundabout-rules", // „Кръгово движение: кой е с предимство“ — the core
    "c-roundabout-behavior", // „Движение и излизане от кръговото“
    "c-priority-concept", // „Какво означава предимство“ — the inverted reading
    "c-speed-adaptation", // „Съобразена скорост“ — the panic brake's home
  ],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-mini-v1.json meta.scenario.params
    // (tools/maps/gen_mini_roundabout.mjs). REUSED map: this template adds no
    // district file.
    params: { ringRadiusM: RING_R, arms: 4, armLengthM: 90, ringSpeedKmh: 30, armSpeedKmh: 40 },
    districtId: "rb-mini-v1",
  },
  start: {
    spawnPointId: "rbm-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни от юг. Погледни напред: кръгът е празен, а на западния вход стои кола и чака." },
    {
      n: 2,
      textBg:
        "Празен кръг не се чака. Намали до скорост, от която можеш да спреш, но НЕ спирай на входа — влез плавно.",
    },
    {
      n: 3,
      textBg:
        "В пръстена дръж една линия по средата на лентата и една скорост, около 12 км/ч. Колебливото криволичене е също толкова опасно, колкото и спирането.",
    },
    {
      n: 4,
      textBg:
        "Чакащата кола на запад ще потегли, след като ти освободиш кръга — това е нейното задължение, не твоето. Не ѝ „правѝ услуга“ със спирачката.",
    },
    { n: 5, textBg: "Подмини източния изход, подай десен мигач и излез на северния. Изключи мигача веднага след изхода." },
  ],
  success: [
    {
      id: "sc-rbc-past-east",
      titleBg: "Подмини източния изход, без да спираш в кръга",
      // The east mouth on the ring centerline (rb-mini-v1: R = 18 around
      // (0, 0); the east node sits at (18, 0)). maxSpeedKmh 20 is the ring's
      // own envelope (a faster circulation on R = 18 trips the turn detector
      // — see the trace script's window arithmetic), not a slow-down demand.
      params: { kind: "reachZone", x: RING_R, y: 0, radiusM: 6, maxSpeedKmh: 20 },
    },
    {
      id: "sc-rbc-exit",
      titleBg: "Излез на северния изход с включен десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator — an unsignalled exit voids the traversal.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 21,
        exitRadiusM: 34,
      },
    },
  ],
  // Informational only (doc 76 §6 — par time never hard-fails). The authored
  // shadow rides the whole drill in ~38 s; 50 leaves room for an L1 crawl while
  // still reading as „a stop in the ring costs you the par".
  rubric: { parTimeSec: 50 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRbCirculatePriority.ts; gates in traces/__tests__/
  // sc-rb-circulate-priority-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rb-circulate-priority/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-rb-circulate-priority/mistake-panic-brake.trace.json",
      },
      // HONEST SCOPE (see the wave report): the taught error is the phantom
      // brake for a car that is standing still and has no priority over you.
      // It is DEMONSTRATED on the approach arm rather than inside the ring
      // because HARSH_BRAKING_NO_CAUSE is structurally unable to fire inside
      // any roundabout — the detector's own FP armor treats junction proximity
      // (≤ 35 m from an intersection node) as a braking cause, and every point
      // of an R = 18 ring is within 13.8 m of a mouth. The card copy carries
      // the whole arc: before the ring AND in it, that car is not your problem.
      titleBg: "Паническо спиране заради чакащия на входа",
      whatWentWrongBg:
        "Кръгът беше празен. Колата на западния вход стоеше на място — чакаше. И въпреки това кракът скочи на спирачката 45 метра преди кръговото и закова колата насред правия участък. Спряла кола на входа не предявява никакво предимство: тя чака ТЕБ. А влезеш ли в кръга, предимството е твое по чл. 50а — там спирачката заради чакащ е същата грешка, само че по-опасна, защото зад теб вече има кола. Кръговото не е „стоп“: то се влиза с преценка, не с паника.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-circulate-priority/mistake-wandering-line.trace.json",
      },
      titleBg: "Колебливо криволичене в пръстена",
      whatWentWrongBg:
        "Входът беше чист, но в пръстена колата така и не намери линия: колебанието „да го пусна ли“ я изнесе към външния ръб на лентата и я задържа там през половин кръг. В кръговото другите четат намеренията ти по траекторията и по мигача — кола, която се лута в лентата, не казва нищо и на всички е пречка. Една линия по средата на лентата и една скорост: това е целият пръстен.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово, в мига, в който колелата ти вече са в пръстена: квартално кръгче, голямо булевардно кръстовище, изпитният маршрут. Особено когато на някой вход стои кола и те гледа.",
    whyBg:
      "Кръговото има едно-единствено работещо правило: влизащият пропуска, движещият се в кръга — не. То работи само ако и двамата го спазват. Спреш ли в пръстена, за да „пуснеш“ някого, ти отменяш правилото: чакащият не те очаква да спреш и не тръгва, колата зад теб не те очаква да спреш и се забива в теб, а кръгът, който изкарва по стотина коли на минута, спира. „Услугата“ на входа е най-честата причина за задръстване и за удар отзад в кръговите. Същото важи и за траекторията: който се лута в лентата, лишава останалите от единствената информация, по която те решават кога да тръгнат.",
    lawRef: "ЗДвП чл. 50а",
    examinerBg:
      "Изпитващият следи три неща в самия пръстен: равномерна скорост без излишни спирания, една ясна траектория в лентата и десен мигач преди изхода. Спиране в кръга без причина се отбелязва като основна грешка („рязко спиране“ / „закъснели действия“), а лутането в лентата — като второстепенна. Пропускането на чакащ на входа НЕ се отчита като любезност: то е грешка в преценката на предимството.",
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
  staged: [RB_CIRC_WAITER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-rb-busy-gap — „Пролука в натоварено кръгово“ (RB-01 entry without
// yielding, graded as GAP SELECTION) on rb-mini-v1
// ---------------------------------------------------------------------------

/**
 * THE PLATOON — a LEAD and a FOLLOWER on one ring, a RIGID 26° (≈ 8.2 m, ≈ 2.8 s
 * at ring pace) apart. Two RoundaboutEntryRunners, and the offset between them
 * is the whole content: it manufactures the two gaps the drill is about.
 *
 *   · the SHORT gap — the 2.8 s between lead and follower. It is the tempting
 *     one (the lead is past, the mouth "looks open") and it is far below any
 *     real critical gap: a car leaving a standstill needs most of six seconds
 *     to clear the mouth, so taking it lands square across the follower's nose.
 *     That is mistake demo 2, and the runtime convicts it mid-chord and then
 *     puts the two cars in the same place.
 *   · the REAL gap — behind the FOLLOWER. You slot in ~3.5 s after its tail
 *     clears the mouth. That is the shadow.
 *
 * WHY THE SYNC IS PINNED OUT (minSync = maxSync = cruise). The runner's sync
 * rubber-bands ITS OWN car to sit `conflictLeadM` upstream of the mouth at the
 * player's arrival. That is exactly right for a one-car drill and exactly wrong
 * here: two independently rubber-banding cars have no fixed offset, and the
 * offset IS the lesson (measured: under the stock 2.5/8.5 clamp the two cars
 * closed different arcs before the runner's entry lock froze them, the platoon
 * opened to 75°, and the drill stopped being about a platoon at all). Clamping
 * the sync band shut at the cruise speed makes each car a metronome from the
 * moment the player arms it, so the phase is authored ONCE, in `hold`, and the
 * platoon is rigid. conflictLeadM is then DESCRIPTIVE, not active — it records
 * where each car actually stands when the player reaches the yield line, rather
 * than being left as a dead zero.
 *
 * cruiseSpeedMps 2.9 is inherited from sc-roundabout-entry and is not a style
 * choice: at 3.35 m/s a circulator has swept into the driver's rotating LEFT
 * band by the time the entry chord commits, and the roundabout tracker convicts
 * an otherwise clean entry. Every number here is arithmetic on that pace; the
 * trace script's header carries the full derivation (including the measured
 * ±6° walls this phasing is centred between) and the trace gate proves it.
 */
const RB_GAP_LEAD: RoundaboutEntrySpec = {
  id: "sc-rbg-lead",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: RING_R,
  actor: {
    // nodeS = [0 (w), 28.2 (s), 56.4 (e), 84.6 (n), 112.8] — one 112.8 m lap.
    // hold = the WEST node itself (φ = 270°): the phase that walks the lead
    // through the player's mouth 3.6 s after the car settles on the line.
    pathNodes: ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -RING_R }, // the player's south entry mouth (rbm-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 10, // descriptive: ~10 m short of the mouth when the player lines up
  armDistM: 60,
  minSyncSpeedMps: 2.9, // = maxSync = cruise: the sync is pinned out (see above)
  maxSyncSpeedMps: 2.9,
};

/**
 * THE FOLLOWER — the car the short gap belongs to, and the whole point of the
 * drill. Own rotation of the loop so `hold` can name its phase directly:
 * nodeS = [0 (n), 28.2 (w), 56.4 (s), 84.6 (e), 112.8], and station 20.04 ⇒
 * φ = 244°, a rigid 26° behind the lead.
 */
const RB_GAP_FOLLOWER: RoundaboutEntrySpec = {
  ...RB_GAP_LEAD,
  id: "sc-rbg-follower",
  actor: {
    pathNodes: ["rbm-n-n", "rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n"],
    hold: { nodeIndex: 0, offsetM: 20.04 },
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 2,
  },
  entryNodeIndex: 2, // rbm-n-s on THIS loop's node order
  conflictLeadM: 18, // descriptive: 8.2 m (26°) of ring behind the lead
};

/**
 * L5 „Усложнени“ — a THIRD car, authored as the platoon's TAIL rather than as a
 * car somewhere else on the ring. That choice is deliberate and it is the only
 * one that keeps the rung winnable: the single clean gap on this district is the
 * one behind the LAST car of the platoon (see the trace header's wall
 * arithmetic), so a third car parked half a ring away would simply be on the
 * driver's left during every possible entry chord and L5 would be a rung nobody
 * can pass. As the tail it makes the rung harder in the honest way — one more
 * car to read, one more „is it over yet?", a longer wait before the same single
 * gap — instead of impossible.
 *
 * Own rotation again: nodeS = [0 (e), 28.2 (n), 56.4 (w), 84.6 (s), 112.8], and
 * station 40.09 ⇒ φ = 218°, a rigid 26° behind the follower.
 */
const RB_GAP_THIRD: RoundaboutEntrySpec = {
  ...RB_GAP_LEAD,
  id: "sc-rbg-third",
  actor: {
    pathNodes: ["rbm-n-e", "rbm-n-n", "rbm-n-w", "rbm-n-s", "rbm-n-e"],
    hold: { nodeIndex: 0, offsetM: 40.09 },
    cruiseSpeedMps: 2.9,
    loop: true,
    colorIndex: 4,
  },
  entryNodeIndex: 3, // rbm-n-s on THIS loop's node order
  conflictLeadM: 27, // descriptive: 8.2 m (26°) of ring behind the follower
};

/**
 * RB-01 read one level deeper than the live entry template. sc-roundabout-entry
 * answers „кой е с предимство" with ONE circulator: wait, then go. This one
 * assumes that answer and asks the question the exam and the street actually
 * ask — WHICH gap. q-krastovishta-013 states the rule in one sentence and it is
 * this template's whole text: пропускането „не значи да чакаш празен кръг —
 * влизаш тогава, когато включването ти не принуждава никого в кръга да намалява
 * или да спира". Two gaps are on offer; one of them forces exactly that.
 */
export const SC_RB_BUSY_GAP: ScenarioSpec = {
  id: "sc-rb-busy-gap",
  family: "roundabout",
  tagsBg: ["кръгово движение", "предимство", "пролука", "преценка"],
  titleBg: "Пролука в натоварено кръгово",
  objectiveBg:
    "Изчакай реална пролука между циркулиращите коли и влез решително — без нахлуване, но и без вечно колебание на входа.",
  // Doc-72 provenance: RB-01 (entry without yielding to circulating traffic) —
  // the archetype both mistake demos grade. Cited alone on purpose: the
  // decisiveness half of the objective („без вечно колебание") is coached by
  // the par time and the card copy, and no detector grades hesitation at a
  // roundabout mouth today, so claiming RB-03 here would overstate the drill.
  archetypeIds: ["RB-01"],
  conceptIds: [
    "c-roundabout-rules", // „Кръгово движение: кой е с предимство“ — the core
    "c-roundabout-behavior", // „Движение и излизане от кръговото“
    "c-priority-concept", // „Какво означава предимство“ — пропускане ≠ празен кръг
    "c-junction-approach", // „Приближаване към кръстовище“ — the yield-line judgment
  ],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-mini-v1.json meta.scenario.params
    // (tools/maps/gen_mini_roundabout.mjs). REUSED map: this template adds no
    // district file.
    params: { ringRadiusM: RING_R, arms: 4, armLengthM: 90, ringSpeedKmh: 30, armSpeedKmh: 40 },
    districtId: "rb-mini-v1",
  },
  start: {
    spawnPointId: "rbm-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни от юг и намали отрано: в кръга има ДВЕ коли и двете са с предимство пред теб." },
    {
      n: 2,
      textBg:
        "Спри на линията за пропускане и гледай наляво. Първата кола минава пред теб — не тръгвай след нея.",
    },
    {
      n: 3,
      textBg:
        "Зад първата идва втора, на по-малко от три секунди. Пролуката между тях е примамлива, но е твърде къса: влезеш ли в нея, втората кола ще трябва да спира заради теб.",
    },
    {
      n: 4,
      textBg:
        "Пропусни и втората. Пролуката ЗАД нея е истинската — щом задницата ѝ отмине входа, влизаш решително и без колебание.",
    },
    {
      n: 5,
      textBg:
        "В кръга дръж около 12 км/ч и една линия. Подмини първия изход (изток), подай десен мигач и излез на втория (север).",
    },
  ],
  success: [
    {
      id: "sc-rbg-yield-line",
      titleBg: "Спри на линията за пропускане и изчакай пролука",
      // The patience gate, and it has teeth: radius 3 m around the yield line
      // on the south arm's northbound lane, capped at 6 km/h. Only a car that
      // actually came down to yield speed AT the mouth satisfies it — the barge
      // demo rides through here at ~22 km/h and misses it outright.
      params: { kind: "reachZone", x: X_ARM_LANE, y: -26, radiusM: 3, maxSpeedKmh: 6 },
    },
    {
      id: "sc-rbg-past-east",
      titleBg: "Влез в истинската пролука и подмини първия изход",
      // The east mouth on the ring centerline (rb-mini-v1: R = 18 around
      // (0, 0); the east node sits at (18, 0)). maxSpeedKmh 20 is the ring's
      // own envelope (a faster circulation on R = 18 trips the turn detector —
      // see the trace script's window arithmetic), not a slow-down demand.
      params: { kind: "reachZone", x: RING_R, y: 0, radiusM: 6, maxSpeedKmh: 20 },
    },
    {
      id: "sc-rbg-exit",
      titleBg: "Излез на втория изход с включен десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator — an unsignalled exit voids the traversal.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 21,
        exitRadiusM: 34,
      },
    },
  ],
  // Informational only (doc 76 §6 — par time never hard-fails), but here it is
  // the ONLY channel that speaks to the „без вечно колебание" half of the
  // objective: the authored shadow waits the pair out and still finishes in
  // ~50 s, so a driver who lets the real gap go by and waits for the lead to
  // come round again (~39 s of ring cycle) reads it immediately.
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRbBusyGap.ts; gates in traces/__tests__/sc-rb-busy-gap-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rb-busy-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-rb-busy-gap/mistake-barge-lead.trace.json",
      },
      titleBg: "Нахлуване пред циркулиращата кола",
      whatWentWrongBg:
        "Колата дори не намали на входа: влезе в кръга с непроменена скорост пред първата циркулираща кола. Влизащият НЯМА предимство — чл. 50а изисква да пропуснеш всички, които вече се движат в кръга, дори това да значи пълно спиране на входа. Това е най-честата геометрия на удар в кръгово изобщо: влизащ, който е погледнал наляво късно или никак.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-busy-gap/mistake-short-gap.trace.json",
      },
      titleBg: "Влизане в твърде къса пролука",
      whatWentWrongBg:
        "Първата кола беше пропусната както трябва — и точно това приспа вниманието. Мигът след нея изглежда като пролука, но зад нея, на по-малко от три секунди, вече идваше втора. „Пропусни движещите се в кръга“ не значи „изчакай една кола“: значи влез само когато включването ти не принуждава НИКОГО в кръга да намалява или да спира (чл. 50а). От спряло положение ти трябват близо шест секунди, за да освободиш входа — затова тази пролука беше твърде къса и втората кола я нямаше къде да отиде.",
      codeRefs: ["FAILED_TO_YIELD", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово в час пик, където колите в пръстена вървят на върволица: булевардните кръгови в София, изпитният маршрут, всяко кръгче пред мол в събота. Точно там правилото „пропусни“ спира да е теоретично и става въпрос на преценка.",
    whyBg:
      "Правилото на чл. 50а е едно изречение, но то има две половини и всички помнят само първата. „Пропусни движещите се в кръга“ НЕ значи „чакай празен кръг“ — празен кръг в час пик няма и чакането му запушва входа зад теб. И не значи „изчакай една кола“ — зад нея почти винаги има втора. Значи едно-единствено нещо: влизаш тогава, когато включването ти не принуждава никого в кръга да намалява или да спира. Затова пролуката се мери в СЕКУНДИ, не в метри: между две коли в пръстена трябва да остане толкова време, че втората да не пипне спирачката заради теб. Двете грешки в този урок са двата края на една и съща погрешна преценка — едната изобщо не гледа наляво, другата гледа, но брои до едно.",
    lawRef: "ЗДвП чл. 50а",
    examinerBg:
      "Изпитващият гледа входа като едно цяло: намаляване отрано и поглед наляво ПРЕДИ линията, спиране само ако е нужно, и после решително влизане в първата достатъчна пролука. Влизане, което кара кола в кръга да намали, се отбелязва като опасна грешка (непропускане на предимство). Но и обратното се отбелязва: изпуснати една след друга годни пролуки минават за „закъснели действия“ — на кръговото се чака пролука, а не празен кръг.",
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
      // L5: трета кола в кръга + дъжд — пръстенът вече не се изпразва изобщо и
      // пролуката се чете в поток. Physics stays dry (the authored ghost
      // envelope is dry-tuned — ADR-006 opt-in discipline).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [RB_GAP_THIRD],
    },
  ],
  staged: [RB_GAP_LEAD, RB_GAP_FOLLOWER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The roundabout-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_ROUNDABOUT: readonly ScenarioSpec[] = [
  SC_RB_EXIT_SIGNAL,
  SC_RB_CIRCULATE_PRIORITY,
  SC_RB_BUSY_GAP,
];
