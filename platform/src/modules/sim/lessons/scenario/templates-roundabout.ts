/**
 * Scenario templates — the ROUNDABOUT family, DATA ONLY in the templates.ts
 * mold: coordinates are denormalized from the committed district file
 * (rb-mini-v1) so nothing loads world JSON at runtime; the trace-gate
 * batteries assert every pinned value against the generated map.
 *
 * THE LEGAL BASIS, CORRECTED 2026-08-03. Every template on this shelf used to
 * cite „ЗДвП чл. 50а" for roundabout priority. чл. 50а (Нов - ДВ, бр. 51 от
 * 2007 г.) reads: „Забранено е навлизането в кръстовище дори и при разрешаващ
 * сигнал на светофара, ако обстановката в кръстовището ще принуди водача да
 * спре в кръстовището или да възпрепятства напречното движение." — the
 * BLOCKED-JUNCTION rule, not a word about roundabouts. There is no statutory
 * roundabout-priority rule in Bulgarian law: ЗДвП and ППЗДвП were both grepped
 * for „кръгов" and neither yields a priority rule. The duty is assembled from
 * the sign plus the ordinary priority article, and the theory bank now states
 * it in exactly these words:
 *
 *   Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5: „Пътен знак Б3 не може да
 *     се поставя на входовете на кръгово кръстовище."
 *   …чл. 61, ал. 2: „Пътищата без предимство, които пресичат пътя с предимство
 *     или се вливат в него, задължително се сигнализират с пътни знаци Б1 или
 *     Б2."
 *   ЗДвП чл. 50, ал. 1: „На кръстовище, на което единият от пътищата е
 *     сигнализиран като път с предимство, водачите на пътни превозни средства
 *     от другите пътища са длъжни да пропуснат пътните превозни средства,
 *     които се движат по пътя с предимство."
 *   ЗДвП чл. 28, ал. 1, т. 2: „десен пътепоказател… - за завиване надясно или
 *     за отклонение надясно." (излизането е отклонение надясно)
 *   ЗДвП чл. 25, ал. 2: „При извършване на маневра, която е свързана с
 *     навлизане изцяло или частично в съседна пътна лента, водачът е длъжен да
 *     пропусне пътните превозни средства, които се движат по нея."
 *   Наредба № РД-02-21-1 чл. 98, ал. 1: „Пътен знак Г12 „Кръгово движение" се
 *     поставя непосредствено преди кръстовище, в което движението е кръгово и
 *     се извършва само в указаната от стрелките посока." (посока, не предимство)
 *
 * The live entry template (sc-roundabout-entry, RB-01/RB-02) stays in
 * templates-flow.ts — it grades the ENTRY yield. This file opens the family's
 * own shelf with the complementary halves of that duty:
 *  - sc-rb-exit-signal „Изход от кръгово с десен мигач“ (RB-02/RB-06,
 *    rb-mini-v1) — EXIT discipline: circulate past the spokes that are not
 *    yours and announce the exit with the right indicator only AFTER the last
 *    approach before it.
 *  - sc-rb-circulate-priority „В кръга си с предимство“ (RB-03/OV-12,
 *    rb-mini-v1) — the INVERSE of the entry drill: once you are on the ring
 *    the priority is yours, and the cars standing at the mouths are waiting
 *    for YOU. Hold one line and one pace; do not brake for them.
 *  - sc-rb-busy-gap „Пролука в натоварено кръгово“ (RB-01, rb-mini-v1) — the
 *    entry drill's SECOND half: sc-roundabout-entry teaches THAT you yield to
 *    one circulator; this grades WHICH gap you then take out of two on offer,
 *    with a pair of cars in the ring.
 *  - sc-rb-lane-choice „Коя лента в двулентово кръгово“ (RB-04/RB-06,
 *    rb-2lane-v1 — a NEW district) — the question a single-lane ring cannot
 *    ask: the far exit needs the INNER lane, announced with a left indicator,
 *    and left again as a proper lane change before the exit.
 *
 * Every staged encounter uses EXISTING StagedEventSpec kinds and every
 * mistake demo cites EXISTING rules-catalog codes — verified by replaying the
 * committed traces through the production stack
 * (traces/__tests__/sc-rb-exit-signal-traces.test.ts,
 * traces/__tests__/sc-rb-circulate-priority-traces.test.ts and
 * traces/__tests__/sc-rb-busy-gap-traces.test.ts, the §5/§9 gates).
 *
 * Content provenance (доc 76 §9 stage 0 — original items, never listovki):
 * q-krastovishta-013 (влизане в интервал, чл. 50, ал. 1), q-krastovishta-015
 * (изход и предимство при смяна на лента, чл. 25, ал. 2 + чл. 28, ал. 1, т. 2),
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
 * RB-02/RB-06 — the exit half: the ring is left as a MANEUVER, and a maneuver
 * is announced (чл. 25, ал. 1; the right indicator itself is чл. 28, ал. 1,
 * т. 2 — „за завиване надясно или за отклонение надясно"). The timing is the
 * whole lesson:
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
    { n: 1, textBg: "Тръгни от юг и намали преди входа — в кръга има кола и тя е с предимство. Вали ли, включи късите светлини преди входа (чл. 70): движещият се в кръга те чете странично, през мокро стъкло — там фаровете ти са единственото, което казва „идва кола“." },
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
      //
      // enterRadiusM 24 (was 21) — founder R3 #6 geometry fix, applied
      // family-wide: the rb-mini drivable band reaches 18 + 4.06 = 22.06, so
      // a driver keeping right could never latch `entered` at 21 and the
      // objective was uncompletable on a legal line. Committed traces replay
      // identically at 21 and 24 (proven in the R3 W-FLOW pass) — see
      // sc-rb-ring in templates-flow.ts for the full derivation.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 24,
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
        "До изхода изобщо не се стигна: колата влезе в кръга с непроменена скорост пред автомобил, който вече се движеше в него. Влизащият НЯМА предимство — на входа стои Б1 или Б2, защото знакът „Път с предимство“ Б3 не може да се поставя там (Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), а от пътя без предимство пропускаш движещите се по пътя с предимство (ЗДвП чл. 50, ал. 1), дори това да значи пълно спиране на входа. „Пропусни“ не значи „чакай празен кръг“, а „не карай никого в кръга да намалява“.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово, на което твоят изход НЕ е първият: квартално кръгче с три изхода, голямо булевардно кръстовище, изпитният маршрут. Колкото повече подходи подминаваш, толкова по-важно е кога точно светва десният мигач.",
    whyBg:
      "Кръговото работи, защото чакащите на входовете четат намеренията на тези в кръга. Мигач, включен твърде рано, кара водача на следващия вход да потегли пред теб — и ти влизаш в него. Мигач, който изобщо не светва, замразява всички входове зад теб: колоната расте, някой губи търпение и влиза „на инат“. Едно движение на лоста след последния подход решава и двата проблема.",
    lawRef: "ЗДвП чл. 25, ал. 1; чл. 28, ал. 1, т. 2; чл. 50, ал. 1",
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
// sc-rb-circulate-priority — „В кръга си с предимство“ (RB-03 hesitation and
// the causeless stop inside the ring / OV-12 the wandering line) on rb-mini-v1
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
 * RB-03/RB-05 — the half of чл. 50, ал. 1 that the entry drill inverts. Every
 * learner is taught „пропусни движещите се в кръга"; the failure mode nobody teaches is
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
  // Doc-72 provenance: RB-03 („Колебание и спиране в кръга" — the needless stop
  // AND the hesitation that drives it: „crawling the ring at 5 km/h clear") +
  // OV-12 („Возене по линията" — sustained off-center lane keeping, the
  // POOR_LANE_KEEPING archetype the wandering-line mistake card grades).
  // NOT RB-05: that id is „Пешеходец на изхода на кръговото" and belongs to
  // sc-rb-ped-exit; this drill stages no pedestrian at all.
  archetypeIds: ["RB-03", "OV-12"],
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
      // enterRadiusM 24 (was 21) — R3 #6 family-wide geometry fix: the
      // drivable band reaches 22.06, so 21 could never latch `entered` on a
      // keep-right line. Traces replay identically (see sc-rb-ring).
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 24,
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
        "Кръгът беше празен. Колата на западния вход стоеше на място — чакаше. И въпреки това кракът скочи на спирачката 45 метра преди кръговото и закова колата насред правия участък. Спряла кола на входа не предявява никакво предимство: на нейния вход стои Б1 или Б2 (Б3 не се поставя на входовете на кръгово — Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), значи тя чака ТЕБ. А влезеш ли в кръга, ти си този, когото тя е длъжна да пропусне (ЗДвП чл. 50, ал. 1) — там спирачката заради чакащ е същата грешка, само че по-опасна, защото зад теб вече има кола. Кръговото не е „стоп“: то се влиза с преценка, не с паника.",
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
      "Кръговото има едно-единствено работещо правило и то не е отделен член „за кръговите“ — такъв в ЗДвП няма. То се сглобява от знака и от чл. 50: на входа стои Б1 или Б2, защото Б3 „Път с предимство“ не може да се поставя там (Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), а от пътя без предимство се пропускат движещите се по пътя с предимство (ЗДвП чл. 50, ал. 1). Оттам следва: влизащият пропуска, движещият се в кръга — не. То работи само ако и двамата го спазват. Спреш ли в пръстена, за да „пуснеш“ някого, ти отменяш правилото: чакащият не те очаква да спреш и не тръгва, колата зад теб не те очаква да спреш и се забива в теб, а кръгът, който изкарва по стотина коли на минута, спира. „Услугата“ на входа е най-честата причина за задръстване и за удар отзад в кръговите. Същото важи и за траекторията: който се лута в лентата, лишава останалите от единствената информация, по която те решават кога да тръгнат.",
    lawRef: "ЗДвП чл. 50, ал. 1; Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5",
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
    { n: 1, textBg: "Тръгни от юг и намали отрано: в кръга има ДВЕ коли и двете са с предимство пред теб. Вали ли, включи късите светлини още на подхода (чл. 70): в дъжд разстоянието до втората кола се преценява по светлините ѝ — и тя преценява твоето по твоите." },
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
      // enterRadiusM 24 (was 21) — R3 #6 family-wide geometry fix: the
      // drivable band reaches 22.06, so 21 could never latch `entered` on a
      // keep-right line. Traces replay identically (see sc-rb-ring).
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 24,
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
        "Колата дори не намали на входа: влезе в кръга с непроменена скорост пред първата циркулираща кола. Влизащият НЯМА предимство — на входа стои Б1 или Б2, защото Б3 „Път с предимство“ не може да се поставя там (Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), а от пътя без предимство пропускаш движещите се по пътя с предимство (ЗДвП чл. 50, ал. 1), дори това да значи пълно спиране на входа. Това е най-честата геометрия на удар в кръгово изобщо: влизащ, който е погледнал наляво късно или никак.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-busy-gap/mistake-short-gap.trace.json",
      },
      titleBg: "Влизане в твърде къса пролука",
      whatWentWrongBg:
        "Първата кола беше пропусната както трябва — и точно това приспа вниманието. Мигът след нея изглежда като пролука, но зад нея, на по-малко от три секунди, вече идваше втора. „Пропусни движещите се в кръга“ не значи „изчакай една кола“: значи влез само когато включването ти не принуждава НИКОГО в кръга да намалява или да спира (ЗДвП чл. 50, ал. 1 — от пътя без предимство пропускаш движещите се по пътя с предимство). От спряло положение ти трябват близо шест секунди, за да освободиш входа — затова тази пролука беше твърде къса и втората кола я нямаше къде да отиде.",
      codeRefs: ["FAILED_TO_YIELD", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово в час пик, където колите в пръстена вървят на върволица: булевардните кръгови в София, изпитният маршрут, всяко кръгче пред мол в събота. Точно там правилото „пропусни“ спира да е теоретично и става въпрос на преценка.",
    whyBg:
      "Правилото на входа е едно изречение — и то не е отделен член „за кръговите“, защото такъв в ЗДвП няма. Знакът Б3 „Път с предимство“ не може да се поставя на входовете на кръгово кръстовище (Наредба № РД-02-21-1/23.11.2023, чл. 61, ал. 5), затова там стои Б1 или Б2 и от пътя без предимство пропускаш движещите се по пътя с предимство (ЗДвП чл. 50, ал. 1). Това изречение има две половини и всички помнят само първата. „Пропусни движещите се в кръга“ НЕ значи „чакай празен кръг“ — празен кръг в час пик няма и чакането му запушва входа зад теб. И не значи „изчакай една кола“ — зад нея почти винаги има втора. Значи едно-единствено нещо: влизаш тогава, когато включването ти не принуждава никого в кръга да намалява или да спира. Затова пролуката се мери в СЕКУНДИ, не в метри: между две коли в пръстена трябва да остане толкова време, че втората да не пипне спирачката заради теб. Двете грешки в този урок са двата края на една и съща погрешна преценка — едната изобщо не гледа наляво, другата гледа, но брои до едно.",
    lawRef: "ЗДвП чл. 50, ал. 1; Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5",
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

// ---------------------------------------------------------------------------
// sc-rb-lane-choice — „Коя лента в двулентово кръгово“ (RB-04 wrong lane in a
// two-lane ring / RB-06 long circulation discipline) on the NEW rb-2lane-v1
// ---------------------------------------------------------------------------

/**
 * THE FIRST TEMPLATE ON A TWO-LANE RING. Everything above rides rb-mini-v1's
 * single-lane R = 18 ring, where "which lane" is not a question. This drill
 * needs a ring that HAS lanes, so it ships its own district
 * (tools/maps/gen_rb_2lane.mjs → rb-2lane-v1: R = 26, `lanes: 2` oneway ring
 * edges, 2×2-lane arms, arrows in meta.scenario.laneArrows). Doc 72 RB-04
 * called exactly that: „NEW: a multi-lane roundabout in the world … + lane-
 * tracked ring; grading then falls to existing lane-change + priority
 * vocabulary". It does — no engine change, and the vocabulary is the one the
 * doc predicted.
 *
 * THE LANE GEOMETRY IS DERIVED, NOT DECORATIVE. The locator centres `lanes`
 * procedural bands on a oneway edge's polyline, so on this ring laneId 0 (the
 * rightmost OF TRAVEL — the ring turns CCW, so right is outward) rides
 * r = 30.06 and laneId 1 rides r = 21.94. Those two numbers are the drill:
 * the shadow holds 21.94, both mistakes are measured against 30.06, and the
 * district battery asserts the pair against the generated file.
 *
 * WHY THE LEFT INDICATOR IS ON FOR HALF THE DRILL — and it is NOT a trick.
 * The Bulgarian canon for a two-lane roundabout is: далечен изход ⇒ вътрешна
 * лента ⇒ ЛЯВ мигач на входа и докато подминаваш чуждите изходи, десен чак
 * след последния подход преди твоя (чл. 25 — всяка маневра се обявява). The
 * engine agrees from the other side: NOT_KEEPING_RIGHT (чл. 15) grades any
 * sustained non-rightmost lane and exempts exactly one thing — a left
 * indicator. So the signal the law demands IS the detector's own exemption,
 * and a shadow that rides the inner lane silently convicts in 12 s (measured).
 * The two halves of чл. 25/чл. 15 meet on this drill; nothing was bent to make
 * them.
 */

/** Ring centerline radius (rb-2lane-v1 meta.scenario.params.ringRadiusM). */
const RB2_R = 26;
/**
 * The INNER ring lane's centre radius (rb-2lane-v1 meta.scenario.ringLaneRadiiM
 * [1] — laneId 0 is the OUTER lane at r = 30.06, which the staged car rides and
 * both mistakes are measured against). This is the lane the drill is about.
 */
const RB2_LANE_INNER_R = 21.94;
/** The south arm's INNER inbound lane centre (meta.scenario.armLaneCentersM[1];
 *  laneId 0, the curb lane, sits at x = 12.19). The drill's start lane. */
const RB2_ARM_INNER_X = 4.06;

/**
 * The staged CIRCULATING CAR — and the lane it rides is the whole encounter.
 * `extraRightOffsetM` is left at the lane graph's own default (0), which on a
 * `lanes: 2` ONEWAY edge offsets the actor by ((lanes − 1) / 2) × laneWidth =
 * +4.06 m to the right of the ring centerline: r = 30.06, the OUTER lane,
 * bit-for-bit the same number the locator gives the player there. So the car
 * sits in the lane the drill is about — the one the shadow legitimately passes
 * on the inside, and the one mistake 2 turns across.
 *
 * cruiseSpeedMps 4.0 (14.4 km/h under the ring's 30 limit) is a MEASURED
 * choice, not the sibling drills' 2.9. It is fast enough that the car is still
 * a live conflict at the mouth when the shadow arrives, and slow enough in
 * ANGULAR terms — 4.0 m/s on r = 30.06 is 7.63 °/s against the player's 8.70
 * °/s at 12 km/h on r = 21.94 — that a driver holding the inner lane gradually
 * draws ahead of it and is clear of the outer lane long before the exit. That
 * angular gap IS the lesson's physics: the inner lane is the far-exit lane
 * because it is the faster arc.
 *
 * The sync is PINNED OUT (minSync = maxSync = cruise — the sc-rb-busy-gap
 * ruling): the runner would otherwise rubber-band the car to `conflictLeadM`
 * at the player's arrival, and every timing below is arithmetic on a metronome
 * instead. conflictLeadM stays DESCRIPTIVE — it records where the car actually
 * stands when the player reaches the line, rather than being left a dead zero.
 */
const RB2_CIRCULATING: RoundaboutEntrySpec = {
  id: "sc-rb2-circulating",
  kind: "roundaboutEntry",
  center: { x: 0, y: 0 },
  ringRadiusM: RB2_R,
  actor: {
    pathNodes: ["rb2-n-w", "rb2-n-s", "rb2-n-e", "rb2-n-n", "rb2-n-w"],
    hold: { nodeIndex: 0, offsetM: 0 }, // the west node (φ = 270°) — see the trace header
    cruiseSpeedMps: 4.0,
    loop: true,
    colorIndex: 0,
  },
  entry: { x: 0, y: -RB2_R }, // the player's south entry mouth (rb2-n-s)
  entryNodeIndex: 1,
  conflictLeadM: 12, // descriptive: ~12 m short of the mouth as the player settles
  armDistM: 60,
  minSyncSpeedMps: 4.0, // = maxSync = cruise: the sync is pinned out (see above)
  maxSyncSpeedMps: 4.0,
};

/**
 * L5 „Усложнени“ — a SECOND car in the OTHER ring lane (the INNER one, the
 * player's own), authored with `extraRightOffsetM: −8.125` = one drawn lane
 * left of the graph's default ⇒ r = 21.94. Held half a ring away
 * (conflictLeadM 94 ≈ half of the 187.3 m outer lap) so the rung is harder in
 * the honest way — the far-exit lane is no longer empty and the driver must
 * read TWO lanes — instead of unwinnable.
 */
const RB2_CIRCULATING_INNER: RoundaboutEntrySpec = {
  ...RB2_CIRCULATING,
  id: "sc-rb2-circulating-inner",
  actor: {
    pathNodes: ["rb2-n-e", "rb2-n-n", "rb2-n-w", "rb2-n-s", "rb2-n-e"],
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: 4.0,
    loop: true,
    colorIndex: 2,
    extraRightOffsetM: -8.125, // one drawn lane LEFT of the outer lane ⇒ the inner ring lane
  },
  entryNodeIndex: 3, // rb2-n-s on THIS loop's node order
  conflictLeadM: 94, // ≈ half a ring behind car 1
};

/**
 * RB-04 + RB-06 — the question a single-lane ring cannot ask. „Пропусни
 * движещите се в кръга" is settled by the three drills above; this one starts
 * where they stop, at the two-lane ring every Sofia boulevard has, and asks
 * the thing the exam and the crash statistics both ask: WHICH LANE. The answer
 * is decided on the approach, not in the ring — which is why both mistakes are
 * already lost before the wheels touch the circle.
 */
export const SC_RB_LANE_CHOICE: ScenarioSpec = {
  id: "sc-rb-lane-choice",
  family: "roundabout",
  tagsBg: ["кръгово движение", "двулентово кръгово", "избор на лента", "мигачи"],
  titleBg: "Коя лента в двулентово кръгово",
  objectiveBg:
    "Външната лента е за първите изходи, вътрешната — за далечния: избери лентата ПРЕДИ кръга и я дръж до изхода си.",
  // Doc-72 provenance: RB-04 (wrong lane in a two-lane roundabout — the
  // exiting-circulating crash geometry) + RB-06 (the long circulation past
  // three mouths, holding one lane and signalling only at the final exit).
  archetypeIds: ["RB-04", "RB-06"],
  conceptIds: [
    "c-roundabout-rules", // „Кръгово движение: кой е с предимство“
    "c-roundabout-behavior", // „Движение и излизане от кръговото“
    "c-lane-choice", // „Избор на лента“ — the drill's core
    "c-driver-signals", // „Светлинни сигнали“ — ляв на входа, десен на изхода
  ],
  map: {
    archetype: "roundabout",
    // The generator recipe — mirrored in rb-2lane-v1.json meta.scenario.params
    // (tools/maps/gen_rb_2lane.mjs). NEW map: this template ships it.
    params: {
      ringRadiusM: RB2_R,
      ringLanes: 2,
      arms: 4,
      armLengthM: 90,
      armLanes: 4,
      ringSpeedKmh: 30,
      armSpeedKmh: 50,
      arrowsFromM: 60,
    },
    districtId: "rb-2lane-v1",
  },
  start: {
    // The INNER approach lane (x = 4.06) — the drill starts you where the
    // arrows say the third exit begins. Choosing it is the lesson; the
    // district also publishes rb2-spawn-south-outer for the near-exit story.
    spawnPointId: "rb2-spawn-south-inner",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Твоят изход е ТРЕТИЯТ (западният). Стрелките на платното казват: външната лента води към първите изходи, вътрешната — към далечните. Затова тръгваш от вътрешната лента. Вали ли, включи късите светлини преди входа (чл. 70): в двулентов кръг съседът отдясно решава дали да излезе по това дали те вижда — на мокро без светлини не те вижда.",
    },
    {
      n: 2,
      textBg:
        "Подай ЛЯВ мигач още на подхода. Той казва на всички: „минавам покрай първите изходи, оставам в кръга“ — и е задължителен, докато си във вътрешната лента.",
    },
    {
      n: 3,
      textBg:
        "Намали до линията за пропускане и погледни наляво. В кръга има кола по външната лента — тя е с предимство. Изчакай я да мине и влез след нея.",
    },
    {
      n: 4,
      textBg:
        "В кръга дръж вътрешната лента: една линия, около 12 км/ч, ляв мигач. Подминаваш първия изход (изток) и втория (север) — не са твои.",
    },
    {
      n: 5,
      textBg:
        "СЛЕД северния подход — последния преди твоя — огледало, десен мигач и чак тогава плавно във външната лента. Излизаш на третия изход (запад) и изключваш мигача.",
    },
  ],
  success: [
    {
      id: "sc-rb2-inner-lane",
      titleBg: "Заеми вътрешната лента преди кръга",
      // The lane gate, and it has teeth: radius 3.5 m (< the 8.125 m lane
      // pitch) on the inner approach lane's centre, 8 m before the ring's
      // reach. A car in the curb lane (x = 12.19) misses it by 8.13 m — the
      // objective IS „take the lane your arrow commands", exactly the
      // sc-ln-turn-lane-arrows ruling (no detector reads a painted arrow).
      params: { kind: "reachZone", x: RB2_ARM_INNER_X, y: -46, radiusM: 3.5, maxSpeedKmh: 50 },
    },
    {
      id: "sc-rb2-past-north",
      titleBg: "Подмини първите два изхода по вътрешната лента",
      // The north mouth ON THE INNER LANE (r = 21.94 at φ = 180 ⇒ (0, 21.94)).
      // radiusM 3.5 is under half the lane pitch, so riding the OUTER lane
      // round (mistake 1's line, r = 30.06 ⇒ (0, 30.06)) misses it by 8.12 m.
      params: { kind: "reachZone", x: 0, y: RB2_LANE_INNER_R, radiusM: 3.5, maxSpeedKmh: 20 },
    },
    {
      id: "sc-rb2-exit",
      titleBg: "Излез на третия изход с включен десен мигач",
      // The L3 roundabout contract (A10): enter the ring, exit ONLY under a
      // right indicator. enterRadiusM 33 admits the whole two-lane band (the
      // outer lane rides 30.06); exitRadiusM 46 sits clear of it.
      params: {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 0,
        y: 0,
        enterRadiusM: 33,
        exitRadiusM: 46,
      },
    },
  ],
  // Informational only (doc 76 §6 — par time never hard-fails). The authored
  // shadow waits the circulator out at the line and still rides ~240° of a
  // 26 m ring in ~69 s; 85 leaves room for an L1 crawl.
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scRbLaneChoice.ts; gates in traces/__tests__/
  // sc-rb-lane-choice-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-rb-lane-choice/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-rb-lane-choice/mistake-outer-lane-far-exit.trace.json",
      },
      titleBg: "Обикаляне по външната до далечния изход",
      whatWentWrongBg:
        "Входът беше изряден — колата пропусна циркулиращата и влезе чисто. Само че влезе във ВЪНШНАТА лента, а изходът ѝ беше третият. Външната лента е лентата на първите изходи: тя изкарва от кръга на всеки подход. Тръгнеш ли по нея към далечен изход, три четвърти от кръга караш в лента, която иска да те изведе — и линията ти го показва: колата се залепи за разделителната линия и остана там през два подхода, нито в едната лента, нито в другата. За чакащите на входовете и за колата зад теб това не е траектория, а гатанка. Лентата се избира ПРЕДИ кръга, по стрелките на платното.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: {
        path: "content/traces/sc-rb-lane-choice/mistake-exit-across-outer.trace.json",
      },
      titleBg: "Изход направо през външната кола",
      whatWentWrongBg:
        "Вътрешната лента беше правилният избор и до последния подход всичко беше наред. После волът тръгна направо навън — през външната лента, без огледало, без десен мигач и без да пропусне колата, която се движеше в нея. Това е най-честият удар в двулентово кръгово в света: излизащ отвътре срещу циркулиращ отвън. Едно движение на волана наруши целия чл. 25 наведнъж — маневрата не беше обявена, огледалото не беше погледнато и предимството на движещия се в съседната лента не беше зачетено. Изходът от вътрешната лента не е завой, а ПРЕСТРОЯВАНЕ и после завой: огледало, десен мигач, плавно във външната лента след последния подход — и чак тогава навън.",
      codeRefs: [
        "FAILED_TO_YIELD",
        "LANE_CHANGE_WITHOUT_INDICATOR",
        "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
        "TURN_WITHOUT_INDICATOR",
        "COLLISION",
      ],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръгово с повече от една лента: булевардните кръгови в София, големите кръстовища на околовръстното, изпитният маршрут. Правилото важи от мига, в който видиш стрелките на платното — тоест преди кръга, не в него.",
    whyBg:
      "Двулентовото кръгово има едно допълнително правило над еднолентовото и то е цялото в стрелките на платното: външната лента е за първите изходи, вътрешната — за далечните и за обратния завой (ЗДвП чл. 15 — движение по определената лента; а самото престрояване между лентите на пръстена е маневра по чл. 25, ал. 2: „водачът е длъжен да пропусне пътните превозни средства, които се движат по нея“). Причината не е бюрократична, а геометрична. Външната лента пресича всеки изход: който тръгне по нея към далечен изход, блокира всички, които наистина излизат, и стои в чужда лента три четвърти от кръга. А който влезе вътре и после излезе НАПРАВО през външната, прави точно обратното — пресича лентата на човек, който има предимство пред него. Това е доминиращата геометрия на удара в двулентовите кръгови по света: излизащ отвътре срещу циркулиращ отвън. И двете грешки имат един и същи корен и едно и също лекарство: лентата се избира ПРЕДИ кръга и се напуска като всяко друго престрояване — с огледало и мигач, след последния подход преди твоя изход.",
    lawRef: "ЗДвП чл. 15; чл. 25, ал. 2; чл. 50, ал. 1",
    examinerBg:
      "Изпитващият чете двулентовото кръгово на три такта: заета ли е правилната лента ПРЕДИ входа според стрелките, обявена ли е с ляв мигач, ако е вътрешната, и напусната ли е като престрояване — огледало, десен мигач, след последния подход. Грешна лента за изхода се отбелязва като второстепенна; изход от вътрешната лента през външната пред движеща се кола е основна, а при принудено спиране или контакт — опасна.",
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
      // L5: втора кола в ДРУГАТА лента на пръстена (вътрешната — твоята) +
      // дъжд. Physics stays dry (the authored ghost envelope is dry-tuned —
      // ADR-006 opt-in discipline).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [RB2_CIRCULATING_INNER],
    },
  ],
  staged: [RB2_CIRCULATING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The roundabout-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_ROUNDABOUT: readonly ScenarioSpec[] = [
  SC_RB_EXIT_SIGNAL,
  SC_RB_CIRCULATE_PRIORITY,
  SC_RB_BUSY_GAP,
  SC_RB_LANE_CHOICE,
];
