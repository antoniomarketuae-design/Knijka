/**
 * Scenario templates — the SPEED-MANAGEMENT family, waves 2 + 5 (doc 72 §8
 * „Family SP"): the SIGN-SCOPE rung and the MOTORWAY-FLOOR rung, DATA ONLY in
 * the templates.ts mold (coordinates denormalized from the committed district
 * file so nothing loads world JSON at runtime; the batteries assert every
 * pinned value against the generated map).
 *
 *  - sc-sp-limit-end       „Докъде важи ограничението"    (SP-03, sp-signs-v1)
 *  - sc-mw-min-speed       „Магистрален ритъм — не пълзи" (SP-10 + OV-11, mw-v1)
 *  - sc-sp-wet-limit-plate „Табела „при мокра настилка""  (SP-04, sp-rain-v1)
 *
 * templates-sp.ts already teaches where a В26 restriction STARTS
 * (sc-speed-transition: the 50→30 entry). This file opens the family's OTHER
 * half: where a restriction ENDS. Both halves ride the same shipped detectors —
 * the district's per-edge `maxspeed` surface IS the legal endpoint, so no new
 * engine capability is involved.
 *
 * The wave-5 addition turns the family's other axis: every other SP template
 * grades the CEILING (SPEEDING_*, the conditions envelope, the curve advisory).
 * sc-mw-min-speed is the one that grades the FLOOR, and it is the only template
 * that bills DRIVING_TOO_SLOW_FOR_MOTORWAY together with NOT_KEEPING_RIGHT on
 * one drive — the compound fault (see its own header).
 *
 * Family: "speed" — the existing catalog chip (doc 72 §8); the id follows the
 * sc-<family>-<slug> naming standard.
 */

import type { RearTailgaterSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Wet } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district BY VALUE — the
// L7 pattern; world/__tests__/sp-signs-district.test.ts asserts the copy
// matches tools/maps/gen_sp_signs.mjs)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (sp-signs-v1). */
const LANE_X = 4.06;
/** ENDPOINT 1 — the junction that cancels the first В26 span (meta.scenario). */
const JUNCTION_Y = 340;
/** ENDPOINT 2 — the end-of-restriction plate that cancels the second span. */
const END_SIGN_Y = 700;

// ---------------------------------------------------------------------------
// 1. sc-sp-limit-end — „Докъде важи ограничението" (SP-03) on sp-signs-v1: a
//    800 m street carrying TWO В26-40 spans with TWO DIFFERENT legal endpoints
//    — span 1 (y 100..340) dies at a junction, span 2 (y 460..700) dies at an
//    explicit end plate. The route reads 50 → 40 → 50 → 40 → 50, and the runtime
//    grades PER EDGE, so accelerating before EITHER endpoint fires the speeding
//    codes against the LOCAL 40, not against the 50 that is still ahead.
// ---------------------------------------------------------------------------

/**
 * SP-03 (the scope half) — обхватът на знака В26 (ЗДвП чл. 21; Наредба №
 * РД-02-21-1/2023). The distinct value vs sc-speed-transition (which teaches the
 * anticipatory lift AT the entry sign): here the taught fault is the opposite
 * instinct — cancelling the limit YOURSELF, early, because the road looks clear
 * or a junction is „basically here". ONE template, TWO DISTINCT codes against
 * the LOCAL 40 limit:
 *   - „Ускоряване 200 м преди края на зоната" (~48 km/h held to the junction) →
 *     SPEEDING_OVER_LIMIT (above the graced 44, under the dangerous 50 →
 *     второстепенна);
 *   - „Голямо превишение в зоната" (~57 km/h through span 2) →
 *     SPEEDING_DANGEROUS (> +10 = > 50 → опасна). The throttle carries the car
 *     across the 44–50 minor band in well under the 2 s sustain, so only the
 *     dangerous code arms (the sc-speed-dangerous „flooring" pattern).
 * Both detectors are default-ON and read only `tick.maxSpeedKmh`, so no
 * ruleConfig is needed — the LIVE student session grades the same two faults.
 */
export const SC_SP_LIMIT_END: ScenarioSpec = {
  id: "sc-sp-limit-end",
  family: "speed",
  tagsBg: ["скорост", "знак В26", "обхват на знака", "край на ограничението", "кръстовище"],
  titleBg: "Докъде важи ограничението",
  objectiveBg:
    "Знак В26 важи до знака за край или до следващото кръстовище — ускорявай чак след тях, не когато „пътят се оправи“.",
  archetypeIds: ["SP-03"],
  conceptIds: ["c-sign-scope", "c-speed-signs-zone", "c-speed-limits", "c-prohibition-signs"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-signs-v1.json meta.scenario.params
    // (tools/maps/gen_sp_signs.mjs): 100 @ 50 → 240 @ 40 → [кръстовище] →
    // 120 @ 50 → 240 @ 40 → [знак за край] → 100 @ 50.
    params: {
      approachM: 100,
      limit1M: 240,
      betweenM: 120,
      limit2M: 240,
      tailM: 100,
      baseKmh: 50,
      limitKmh: 40,
      sideArmM: 60,
    },
    districtId: "sp-signs-v1",
  },
  start: {
    spawnPointId: "sp-sg-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — тук ограничението все още е 50 км/ч." },
    { n: 2, textBg: "Напред следва знак В26 „40“. Свали скоростта преди знака и влез в зоната вече около 37–38 км/ч." },
    { n: 3, textBg: "Дръж 40 до самото кръстовище: то е краят на тази зона. Не ускорявай, защото „пътят се отваря“ — знакът важи до последния метър." },
    { n: 4, textBg: "СЛЕД кръстовището ограничението е отменено — там вече можеш да се върнеш към 50 км/ч." },
    { n: 5, textBg: "Втори знак В26 „40“: тази зона свършва при знака за край на забраната, не при кръстовище. Дръж 40 до самата табела." },
    { n: 6, textBg: "След знака за край ускори плавно обратно към 50 км/ч и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-sple-hold-to-junction",
      titleBg: "Стигни кръстовището, още в зоната и под 40 км/ч",
      // 30 m short of ENDPOINT 1, deep inside span 1. Cap 43 sits just under the
      // graced limit (44): the disciplined ~37 drive satisfies it; the demo that
      // accelerated 200 m early (~48) is over the cap and misses the gate.
      params: { kind: "reachZone", x: LANE_X, y: JUNCTION_Y - 30, radiusM: 12, maxSpeedKmh: 43 },
    },
    {
      id: "sc-sple-hold-to-sign",
      titleBg: "Стигни знака за край, още в зоната и под 40 км/ч",
      // The same discipline at ENDPOINT 2 — the OTHER scope rule, same cap.
      params: { kind: "reachZone", x: LANE_X, y: END_SIGN_Y - 30, radiusM: 12, maxSpeedKmh: 43 },
    },
    {
      id: "sc-sple-finish",
      titleBg: "Стигни края на отсечката след знака за край",
      params: { kind: "reachZone", x: LANE_X, y: 780, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 105 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpLimitEnd.ts; gates in traces/__tests__/sc-sp-limit-end-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-limit-end/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-limit-end/mistake-early-accel.trace.json" },
      titleBg: "Ускоряване 200 м преди края на зоната",
      whatWentWrongBg:
        "Колата видя кръстовището напред и си отмени знака сама: 200 метра преди края на зоната кракът натисна и скоростта се качи на около 48 км/ч. Знакът В26 обаче важи ДО кръстовището, а не „почти до него“ — тези 200 метра са си зона 40 и 48 км/ч в тях е второстепенна грешка.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-limit-end/mistake-big-overspeed.trace.json" },
      titleBg: "Голямо превишение в зоната",
      whatWentWrongBg:
        "Във втората зона колата подмина знака В26 „40“ и вдигна около 57 км/ч — „нали скоро свършва“. Свършва при табелата за край, до която има още стотици метри: 57 в зона 40 е над +10 км/ч, тоест опасна грешка и отпадане от изпита. Краят на зоната се чете от знака, не от усещането.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При всеки знак В26 — щом го подминеш, въпросът вече не е „колко“, а „докога“. Отговорът е само два: до знака за край на забраната или до следващото кръстовище. Всичко останало — че пътят се разширява, че къщите свършват, че отдавна караш бавно — не отменя нищо.",
    whyBg:
      "Ограничението стои заради нещо, което често не се вижда от колата: изход на двор, спирка, тесен тротоар, деца зад завой. Затова законът дава на зоната ТОЧНИ краища — знак или кръстовище — вместо да я оставя на преценка. Водачът, който си я отменя 200 метра по-рано, ускорява точно в частта от зоната, която още пази някого; а на изпита същите метри са грешка независимо дали нещо се е случило.",
    lawRef: "ЗДвП чл. 21; Наредба № РД-02-21-1/2023",
    examinerBg:
      "Изпитващият знае къде свършва всяка зона по маршрута и следи скоростта спрямо знаците през целия път. Ранното ускоряване в края на зоната е грешка, а превишаването с повече от 10 км/ч в нея е опасна грешка и прекратява изпита. Дръж ограничението до знака за край или до кръстовището — и чак тогава ускорявай.",
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
// 2. sc-mw-min-speed — „Магистрален ритъм — не пълзи" (SP-10 + OV-11) on the
//    committed mw-v1 motorway (divided 2+2 posted 140, each carriageway an
//    emergency curb lane + 2 travel lanes). The family's FLOOR rung.
//
//    WHY IT IS NOT sc-mw-discipline (templates-sp.ts), which rides the same
//    map: that template pairs the two motorway faults as SEPARATE demos — a
//    130 km/h left-lane hog (NOT_KEEPING_RIGHT alone) and a 40 km/h crawl in
//    the right lane (DRIVING_TOO_SLOW_FOR_MOTORWAY alone). This one holds the
//    speed FIXED at the crawl and moves only the LANE, so the two demos differ
//    by exactly one variable and the second one bills BOTH codes at once. That
//    compound conviction — the crawler who is also in the overtaking lane — is
//    the drill: it exists nowhere else in the catalog, and it is the shape the
//    fault actually takes on a real motorway.
//
//    THE STAGED FLOW CAR is what makes the WHY physical rather than narrated:
//    a car travelling at motorway pace catches the player and is FORCED down
//    to the player's speed. That is чл. 22, ал. 1's harm in one picture — your crawl
//    becomes everyone's crawl — and in the left-lane demo the drill ends with
//    the flow car still trapped behind, because a crawler in the overtaking
//    lane is a crawler nobody can get past.
// ---------------------------------------------------------------------------

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth;
 *  world/__tests__/mw-district.test.ts asserts these against the generator). */
const MWM_X_EMERG = 8.13; // laneId 0 — лентата за принудително спиране
const MWM_X_CRUISE = 0; // laneId 1 — the right TRAVEL lane (the rightmost REQUIRED one)
// (laneId 2, the overtaking lane at x = −8.12, is pinned in traces/scMwMinSpeed.ts —
//  no graded zone of this template lives there.)
/** mw-v1 lane pitch (gen_motorway.mjs SCALED_LANE_W = 3.25 × 2.5). */
const MWM_LANE_PITCH = 8.125;

/**
 * ПОТОКЪТ — the shipped rearTailgater actor as the car that arrives at
 * motorway pace and has to deal with you. PRESSURE SCENERY under the
 * learn-only policy: the runner emits ZERO SimTick events, so no violation and
 * no collision can ever grade from it (doc 72 FO-07 / A12). Everything graded
 * here is the player's own channel — the crawl detector and keep-right, both
 * default-ON and structurally data-armed by mw-v1's edge `motorway` tag +
 * emergencyLane span. Hence no ruleConfig: the LIVE student session grades the
 * same two faults the trace gate asserts.
 *
 * The lane arithmetic (the sc-merge-accel-lane precedent): the traffic graph
 * lays ONE lane down the middle of a oneway edge's marked width, which on this
 * 3-lane carriageway lands on the EMERGENCY lane (x ≈ +8.13). extraRightOffsetM
 * = −MWM_X_EMERG walks it one lane left onto the cruise lane (x ≈ 0), and
 * passShiftM = −MWM_LANE_PITCH runs the pass one lane left again, into the
 * overtaking lane. So the actor never uses a lane it is not entitled to.
 *
 * THE TIMING, stated because it is load-bearing (see traces/scMwMinSpeed.ts):
 * releaseGapM 8 is under the actor's 13 m standing lead-in behind the spawn, so
 * the run releases on frame 1 and the latch (behindM ≤ followBehindM + 4) lands
 * immediately — pressureSec is therefore measured from the session start in
 * every drive, which makes the pass commit at a SHARED, deterministic t ≈ 22 s.
 * The two long demos (shadow, right-lane crawl) run past it and the pass plays;
 * the left-lane demo is authored to END before it, so the actor is never
 * commanded into the lane the player is occupying. easeKmh is vestigial under
 * this timing (the latch speed is 0, so „yielded" can never latch) — the
 * outcome is measurement-only and nothing grades off it.
 */
const MWM_FLOW_CAR: RearTailgaterSpec = {
  id: "sc-mwms-flow-car",
  kind: "rearTailgater",
  libraryEventId: "ev-speed-limit",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"], // northbound — the player's own carriageway
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant at (0, 2) — 13 m behind the spawn
    cruiseSpeedMps: 33, // ~119 km/h — its own pace before it meets you
    extraRightOffsetM: -MWM_X_EMERG, // graph lane rides the curb lane; step one left ⇒ x ≈ 0
    colorIndex: 2,
  },
  releaseGapM: 8,
  followBehindM: 26, // ~22 m of bumpers — a car that has had to lift, not a лепка
  maxMatchSpeedMps: 36, // 130 km/h — it keeps station behind even a brisk player
  // 28 s of patience. MEASURED, not guessed: with pressureSec 22 the actor
  // finished its lane shift into the left lane at t ≈ 23.5 and drew level with
  // a left-lane player at t ≈ 25.8 — only ~3 s clear of the left-lane demo's
  // 20.5 s runtime. 28 moves the commit to t ≈ 28 and the arrival to t ≈ 32,
  // giving that demo ~9 s of headroom while both long demos (43 s / 43.8 s)
  // still play the pass out in full.
  pressureSec: 28,
  passShiftM: -MWM_LANE_PITCH, // the pass runs one lane LEFT (never through the player)
  passSpeedMps: 38, // ~137 km/h — under the posted 140: the flow car is never the lawbreaker
  passAheadM: 45,
  easeKmh: 6,
};

/**
 * SP-10 (the floor half) + OV-11 — ритъмът на потока и дясната лента на
 * автомагистрала (ЗДвП чл. 22, ал. 1: „не трябва да се движи без основателна
 * причина с твърде ниска скорост, когато по този начин пречи на движението на
 * другите"; чл. 55, ал. 1: магистралата е отворена само за ПС, чиято
 * конструктивна максимална скорост надвишава 70 km/h; чл. 15: движение във
 * възможно най-дясната свободна лента).
 *
 * LAW HONESTY (the catalog's own verification note, rules/catalog.ts
 * DRIVING_TOO_SLOW_FOR_MOTORWAY, grounded on q-magistrali-i-izvangradsko-026):
 * Bulgaria has NO general mandatory motorway minimum. A minimum binds only
 * under the mandatory sign; чл. 55, ал. 1 bars vehicles whose CONSTRUCTIVE max
 * does not exceed 70 km/h — a condition on the VEHICLE, not a floor for the
 * driver. (CORRECTED 2026-08-03: this shelf cited „чл. 54" and „50 км/ч".
 * чл. 54 is the rail-crossing forced-stop article and the figure is 70.) Every
 * card below therefore teaches „ритъм на потока", anchored on чл. 22, ал. 1 —
 * never „законът ти забранява под 50".
 * The backlog brief's phrasing („долна граница … не се движи под 50") is the
 * phantom-minimum claim the content bank explicitly marks WRONG, so it is not
 * repeated here.
 *
 * TWO DEMOS, ONE VARIABLE — both crawl at ~40 km/h, and only the lane moves:
 *   - „Пълзене с 40 в активната лента" → DRIVING_TOO_SLOW_FOR_MOTORWAY alone;
 *   - „Пълзене с 40, и то в лявата лента" → DRIVING_TOO_SLOW_FOR_MOTORWAY +
 *     NOT_KEEPING_RIGHT — the compound bill (the emergencyLaneRight seam makes
 *     laneId 1 the rightmost REQUIRED lane, so laneId 2 hogs with no excuse).
 * Both detectors read only data mw-v1 already carries, so no ruleConfig and no
 * physics override: the student's own attempt grades identically.
 */
export const SC_MW_MIN_SPEED: ScenarioSpec = {
  id: "sc-mw-min-speed",
  family: "speed",
  tagsBg: ["магистрала", "скорост на потока", "твърде бавно", "дръж вдясно", "лентова дисциплина"],
  titleBg: "Магистрален ритъм — не пълзи",
  objectiveBg:
    "Измини магистралния участък с ритъма на потока в дясната лента за движение: общ задължителен минимум няма, но кола, която пълзи с 40 в поток от 130, е подвижно препятствие — а пълзене в лявата лента е двойна грешка.",
  archetypeIds: ["SP-10", "OV-11"],
  conceptIds: ["c-motorway-rules", "c-motorway-prohibitions", "c-speed-adaptation", "c-lane-choice"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params
    // (tools/maps/gen_motorway.mjs). REUSED, not regenerated: the district is
    // already exactly the segment this drill needs.
    // doc 87 B67: mw-v1 grew 1000 -> 2600 m per carriageway (the posted 140 was
    // unreachable inside 1000 m). This object MIRRORS the generator recipe and is
    // asserted equal to the shipped meta.scenario.params, so it moves with it.
    params: { lengthM: 2600, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по магистралата — ограничението е 140 км/ч, а двете посоки са на отделни платна с разделителна ивица." },
    { n: 2, textBg: "Ускорявай уверено и се установи около 110 км/ч в ДЯСНАТА лента за движение: това е ритъмът на потока тук." },
    { n: 3, textBg: "Погледни в огледалото за задно виждане. Колата зад теб се движи с магистрална скорост — дръж своя ритъм и я остави спокойно да те изпревари отляво." },
    { n: 4, textBg: "Не сваляй скоростта без причина. Продължително пълзене далеч под потока (тук около 40 км/ч) превръща колата ти в подвижно препятствие, което всички трябва да заобикалят." },
    { n: 5, textBg: "Лявата лента е само за изпреварване, а аварийната вдясно не е лента за движение изобщо — дръж дясната до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwms-join",
      titleBg: "Влез в ритъма на потока в дясната лента за движение",
      // Radius 6 pins the CRUISE lane (lane centers sit 8.12–8.13 m apart):
      // the left-lane crawler misses it, the right-lane crawler makes it — that
      // asymmetry IS the two demos' difference, made visible on the end screen.
      params: { kind: "reachZone", x: MWM_X_CRUISE, y: 300, radiusM: 6, maxSpeedKmh: 140 },
    },
    {
      id: "sc-mwms-hold",
      titleBg: "Задръж лентата и ритъма през средата на участъка",
      params: { kind: "reachZone", x: MWM_X_CRUISE, y: 640, radiusM: 6, maxSpeedKmh: 140 },
    },
    {
      id: "sc-mwms-finish",
      titleBg: "Стигни края на участъка",
      // Neither crawl demo gets here: at 40 km/h the kilometre is a 90-second
      // drive, and both demos end long before it. The crawler does not merely
      // score badly — he never finishes the road (rubric.parTimeSec tells the
      // rest of the story: 110 covers this in ~40 s).
      params: { kind: "reachZone", x: MWM_X_CRUISE, y: 940, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMwMinSpeed.ts; gates in traces/__tests__/sc-mw-min-speed-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mw-min-speed/shadow-correct.trace.json" },
  staged: [MWM_FLOW_CAR],
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mw-min-speed/mistake-crawl-right.trace.json" },
      titleBg: "Пълзене с 40 в активната лента",
      whatWentWrongBg:
        "Колата запълзя с около 40 км/ч в дясната лента за движение по свободна магистрала — без задръстване, без повреда, без причина. Лентата е вярната, скоростта не е: потокът тук се движи със 120–140 и те застига с 80–100 км/ч разлика. Виж какво стана зад теб — колата, която идваше с магистрална скорост, трябваше да свали до твоите 40 и после да излиза отляво, за да се измъкне. Общ задължителен минимум наистина няма — законът обаче забранява движение без основателна причина с твърде ниска скорост, когато с това пречиш на другите (ЗДвП чл. 22, ал. 1); а самата магистрала е отворена само за коли, чиято конструктивна максимална скорост надвишава 70 км/ч (чл. 55, ал. 1), точно защото по-бавното тук е препятствие.",
      codeRefs: ["DRIVING_TOO_SLOW_FOR_MOTORWAY"],
    },
    {
      traceRef: { path: "content/traces/sc-mw-min-speed/mistake-crawl-left.trace.json" },
      titleBg: "Пълзене с 40, и то в лявата лента",
      whatWentWrongBg:
        "Същите 40 км/ч, но този път в ЛЯВАТА лента — и сметката е двойна. Първо, пълзенето: далеч под потока, без причина. Второ, лентата: и на магистрала важи чл. 15 — движиш се във възможно най-дясната свободна лента за движение, а дясната беше празна през цялото време. Резултатът се вижда зад теб: колата, която те застигна, остана заклещена там до края. Пълзящият в лявата лента не просто пречи — той спира изпреварването изобщо, защото никой не може законно да го подмине.",
      codeRefs: ["DRIVING_TOO_SLOW_FOR_MOTORWAY", "NOT_KEEPING_RIGHT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение по автомагистрала и скоростен път — и особено в момента, в който нещо те кара да свалиш скоростта: навигация, несигурност, разсейване, „не бързам никъде“. Въпросът тогава е един: движа ли се с ритъма на останалите, или ги карам да ме заобикалят?",
    whyBg:
      "Катастрофите на магистрала се раждат от РАЗЛИКИТЕ в скоростта, не от самата скорост. Кола с 40 км/ч в поток от 130 се приближава с 90 км/ч — колкото челен удар в града — и всеки зад нея трябва или да спира рязко, или да сменя лента. Затова законът не пуска на магистралата превозни средства, чиято конструктивна максимална скорост не надвишава 70 км/ч (чл. 55, ал. 1): по-бавното тук е препятствие по конструкция. Общ задължителен минимум обаче няма — минимална скорост важи само там, където знак я въвежда. Правилата, които те пазят, са две: чл. 22, ал. 1 — да не се движиш без основателна причина с твърде ниска скорост, когато пречиш на другите; и чл. 20, ал. 2 — съобразявай се. А пълзенето в ЛЯВАТА лента събира двете грешки в една: бавен си И заемаш лентата, през която единствено могат да те подминат.",
    lawRef: "ЗДвП чл. 22, ал. 1; чл. 55, ал. 1; чл. 15",
    examinerBg:
      "Изпитващият очаква уверено движение със скоростта на потока в дясната лента за движение. Продължителното движение далеч под потока без причина е грешка (второстепенна — закъснели, нерешителни действия), а трайното висене в лявата лента без изпреварване е отделна грешка към нея. Ако не можеш или не искаш да поддържаш магистрален ритъм, магистралата не е твоят път — изборът на успореден републикански път е част от преценката.",
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
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-sp-wet-limit-plate — „Табела „при мокра настилка"" (SP-04) on sp-rain-v1
//    (the SAME 360 m / limit-50 street sc-speed-rain rides, REUSED — map.reuse).
//    The drill is the CONDITIONAL PLATE: a допълнителна табела „при мокра
//    настилка" under the speed sign is a CONDITION, not a second number. Dry it
//    sleeps and the base 50 applies; wet it binds a lower ceiling (~40, sitting
//    under the 0.85 × 50 = 42.5 km/h conditions envelope). The template
//    ALTERNATES the ladder — L1–L2 run the street DRY (the plate sleeps, the
//    full 50 is lawful), L3–L5 run it WET with REAL reduced grip (physics
//    .wetGrip on those rungs ONLY, ADR-006 stage 4a) — and the CONTRAST across
//    the rungs IS the lesson.
//
//    WHY IT IS NOT sc-speed-rain (templates-sp.ts, same district): that template
//    is rain+night at EVERY rung and teaches the generic „намали за дъжд/нощ"
//    with render-only weather. Here the axis is the PLATE (the same road, dry
//    vs wet), the grip is physically real on the wet rungs, and the wet mistake
//    reaches the SPEEDING band the rain template never touches.
//
//    FEASIBILITY — documented deviation from the backlog brief (the notes' own
//    fallback, taken honestly): the brief asked for a PER-RUNG posted-limit swap
//    (90 dry / 60 wet plate) plus a protected curve with an aquaplaning
//    SPEED_TOO_FAST_FOR_CURVE mistake. sp-rain-v1 is map.reuse — a flat 50 km/h
//    street with NO curveAdvisory span — and ScenarioSpec carries NO speed-span
//    override (the posted limit is district edge data). Both the limit swap and
//    the curve arm are therefore unreachable without editing the map / compile /
//    types (owned elsewhere), so the brief's stated fallback („else split into a
//    wet-only template") is used: the plate is realised on the honest 50/40
//    numbers of this street, graded by the conditions envelope + real wetGrip.
// ---------------------------------------------------------------------------

/**
 * SP-04 (the conditional-plate half) — табелата „при мокра настилка" под знака
 * за скорост (ЗДвП чл. 21 — знакът; чл. 20, ал. 2 — съобразената скорост). TWO
 * DISTINCT codes, both against the WET rungs' rain envelope (the sc-speed-rain /
 * sc-speed-zone precedent — one template, distinct code SETS):
 *   - „Сухата скорост под мократа табела" (~50 held in the rain, the plate
 *     ignored) → SPEED_TOO_FAST_FOR_CONDITIONS ALONE (50 > 42.5 envelope, ≤ 55
 *     graced ⇒ NOT speeding: lawful by the base sign, wrong under the plate);
 *   - „Пълно превишение в дъжда" (~57, over even the base 50) →
 *     SPEEDING_OVER_LIMIT ALONE (> 55 graced, ≤ 60 ⇒ второстепенна; above the
 *     graced limit the conditions episode stands down BY BAND — speed > graced
 *     clears its accumulator — so it never double-bills).
 * Both detectors read only tick.maxSpeedKmh + tick.rain, so NO ruleConfig — the
 * LIVE student session grades the same two faults. Success gates are POSITION-
 * only (no maxSpeedKmh cap) on purpose: a speed cap is template-wide, so it
 * would fail a LAWFUL dry 50 drive on L1–L2 and break the very contrast the
 * template teaches; the wet ceiling is carried by the conditions detector
 * (teach-first coaching), not by an objective gate.
 */
export const SC_SP_WET_LIMIT_PLATE: ScenarioSpec = {
  id: "sc-sp-wet-limit-plate",
  family: "speed",
  tagsBg: ["скорост", "мокра настилка", "допълнителна табела", "съобразена скорост", "дъжд"],
  titleBg: "Табела „при мокра настилка“",
  objectiveBg:
    "Табелата под знака е условие: на сухо важи основното ограничение, но щом настилката е мокра — по-ниският таван е твой, без изпитващият да ти напомня.",
  archetypeIds: ["SP-04"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-rain-aquaplaning", "c-speed-signs-zone"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-rain-v1.json meta.scenario.params
    // (tools/maps/gen_sp_speed.mjs). REUSED, not regenerated: the district is
    // already exactly the 360 m / limit-50 straight street this drill needs.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-rain-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // THE BRIEFING THAT WAS TRUE ON THREE RUNGS OUT OF FIVE (sweep161,
    // sc-sp-wet-limit-plate/pc-right/01-arrival.png and every frame of both
    // drives on both platforms: dry grey road, clear sky, wipers off).
    //
    // The template ALTERNATES its ladder on purpose — L1–L2 dry, L3–L5 rain +
    // wetGrip (see `levels` below) — and the contrast IS the lesson. But
    // `LevelSpec` (types.ts) has no instruction override: `toleranceScale`,
    // `aids`, `traffic`, `conditions`, `physics`, `vehicleStart`, `examMode`,
    // `stagedAdd`, `rubric`, `ruleConfig`, `complication` — and nothing else.
    // So `instructionsBg` is ONE text shipped to all five rungs, and it flatly
    // asserted „Днес обаче вали и настилката е мокра" to a Ниво-1 student
    // looking at a dry street, then ordered him to 38 км/ч on it.
    //
    // BOTH DIRECTIONS WERE WRONG. A student who obeys the text on L1 drives 38
    // where 50 is lawful and correct — a lesson teaching him to misread a
    // sleeping plate. A student who reads the ROAD on L1 and holds 50 is
    // contradicting his own briefing while doing exactly the right thing.
    //
    // THE FIX IS TO STOP TELLING HIM THE WEATHER AND MAKE HIM READ IT — which
    // is the skill the plate exists to teach and which the old text did his
    // homework on. Every line below is true on a dry rung AND on a wet one, so
    // the ladder's contrast is finally carried by the copy instead of being
    // contradicted by it. Nothing is weakened: the wet ceiling is graded by
    // SPEED_TOO_FAST_FOR_CONDITIONS exactly as before, and on the dry rungs
    // SPEEDING_OVER_LIMIT still holds the base 50.
    //
    // A rung-aware `instructionsBg` would be the stronger fix and is ROUTED,
    // not taken here: it is a `LevelSpec` key + a compileScenario merge, i.e.
    // types.ts and compile.ts, which this lane does not own.
    // Gate: __tests__/lane-world-claims.test.ts §4.
    { n: 1, textBg: "Потегли по улицата. Основното ограничение е 50 км/ч, а под знака виси допълнителна табела „при мокра настилка — 40“. Щом настилката е мокра, включи и късите светлини (чл. 70) — същият дъжд, който сваля тавана до 40, сваля и видимостта, а дневните светлини оставят задните ти габарити тъмни." },
    { n: 2, textBg: "На сухо табелата спи: важи основното ограничение и 50 км/ч е напълно законно." },
    { n: 3, textBg: "Затова първо погледни настилката, не текста: мокра ли е, табелата важи и таванът ти става 40 км/ч; суха ли е, тя мълчи." },
    { n: 4, textBg: "Мокро ли е, влез в зоната на табелата вече около 38 км/ч и задръж под 40 по цялата отсечка — без да чакаш някой да ти го каже." },
    { n: 5, textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг; съобразената скорост връща разстоянието и времето за реакция." },
    { n: 6, textBg: "Задръж тавана, който настилката ти е дала, до края на отсечката." },
  ],
  success: [
    {
      id: "sc-swp-past-plate",
      titleBg: "Подмини табелата „при мокра настилка“",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10 },
    },
    {
      id: "sc-swp-finish",
      titleBg: "Стигни края на отсечката, задържал мокрия таван",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 72 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpWetLimitPlate.ts; gates in traces/__tests__/
  // sc-sp-wet-limit-plate-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-wet-limit-plate/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-wet-limit-plate/mistake-dry-speed-in-wet.trace.json" },
      titleBg: "Сухата скорост под мократа табела",
      whatWentWrongBg:
        "Колата държа 50 км/ч „по знака“, все едно настилката е суха. Основното ограничение наистина е 50, но допълнителната табела „при мокра настилка“ въведе по-нисък таван, а вали: 50 в дъжда е над съобразената скорост (чл. 20, ал. 2) — второстепенна грешка. При мокро таванът тук е около 40; над 42–43 км/ч вече караш несъобразено.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-wet-limit-plate/mistake-over-limit-in-wet.trace.json" },
      titleBg: "Пълно превишение в дъжда",
      whatWentWrongBg:
        "Тук колата дори не спази основния знак: около 57 км/ч по улица с ограничение 50, и то в дъжд. Това е превишаване над самото ограничение (второстепенна грешка), а на мокра настилка е двойно безотговорно — табелата искаше 40, а стрелката показа 57. Първо се спазва знакът, после и табелата под него.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всеки знак за скорост с допълнителна табела „при мокра настилка“ (или „при дъжд“, „при сняг“) — и изобщо винаги, щом завали. Табелата не е втора цифра „за всеки случай“: тя е условие, което ту важи, ту не, според настилката под гумите.",
    whyBg:
      "Ограничението на такава табела пази точно там, където мокрото е най-опасно — завой, наклон, износена настилка. На сухо рискът го няма и основното ограничение стига; на мокро сцеплението пада, спирачният път нараства около 1,4 пъти и същата скорост вече не спира колата в нужното разстояние. Затова законът връзва по-ниския таван за УСЛОВИЕТО, а не за час от денонощието: водачът сам разпознава кога важи и не чака знак да му светне.",
    lawRef: "ЗДвП чл. 21; чл. 20, ал. 2",
    examinerBg:
      "Изпитващият няма да ти напомни, че вали — очаква сам да приложиш табелата. Каране на „сухата“ скорост в дъжда се отбелязва като несъобразена скорост, а превишаването над самото ограничение е отделна грешка към него. Разпознай условието и дръж по-ниския таван, докато настилката е мокра.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3, conditions: { weather: "rain" }, physics: { wetGrip: true } },
    { level: 4, conditions: { weather: "rain" }, physics: { wetGrip: true }, vehicleStart: "cold" },
    { level: 5, conditions: { weather: "rain", night: true }, physics: { wetGrip: true } },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The wave-2 + wave-5 + wave-9 speed templates, in catalog order (registered
 *  in templates.ts). */
export const SCENARIO_TEMPLATES_SPEED2: readonly ScenarioSpec[] = [
  SC_SP_LIMIT_END,
  SC_MW_MIN_SPEED,
  SC_SP_WET_LIMIT_PLATE,
];
