/**
 * Scenario templates — the JUNCTION/PRIORITY family, S3 batch-4 wave. DATA
 * ONLY (the templates.ts law): coordinates are denormalized from the committed
 * district files (content/world/tj-emerge-v1.json, tj-occluded-v1.json —
 * tools/maps/gen_ju_junctions2.mjs) so nothing loads world JSON at runtime;
 * the tj-junctions2 battery asserts every pinned value against the generated
 * files, and the sc-ju2 trace gate replays the drives through the production
 * stack.
 *
 * Two NEW junction archetypes, both grading the SAME priority vocabulary the
 * shipped four already prove — but sited so ONLY ONE adjudicator fires:
 *
 *   sc-junction-gap  (JU-04) — Б2 „Спри!" + a car on the priority road. The
 *     student stops (theatre), then emerges into the car → give-way
 *     conflictNear at the stop-line grades FAILED_TO_YIELD. The full stop
 *     itself earns FULL_STOP_AT_STOP_SIGN, so the Б2 adjudicator NEVER
 *     double-grades the emerge fault: rolling the line is not the lesson here,
 *     the gap misjudgment is.
 *   sc-junction-blind (JU-17) — equal T with a SE corner building walling off
 *     the view to the RIGHT. IDENTICAL grading to sc-junction-rhr (the RHR
 *     tracker on the uncontrolled node), the occlusion is world dressing.
 *
 * Shared geometry truths (battery: tj-junctions2-districts.test.ts):
 *   - drawn lane centers sit ±4.0625 m off the road centerline;
 *   - the Б2 line on tj-emerge's 100 m stem sits 27.725 m out (y = −27.725);
 *   - tj-occluded derives NO control at all → right-hand rule at tj-n-c.
 */

import type { ScenarioSpec } from "./types";
import type { PriorityFromRightSpec } from "../../contracts";
import { l5BusyStreet } from "./complications";

/** Drawn lane-center offset from the road centerline on every junction map, m. */
export const JUNCTION2_LANE_CENTER_M = 4.0625;
/** Derived Б2 setback from the junction node on tj-emerge's stem, m. */
export const JUNCTION2_STOP_LINE_M = 27.725;

// ---------------------------------------------------------------------------
// sc-junction-gap — „Спрях, но потеглих в дупка, която я няма" (JU-04)
// on tj-emerge-v1
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car travels the priority road from the player's LEFT
 * (west → east, straight through the junction), timed by the priorityFromRight
 * runner against the player's arrival at the Б2 line. junctionControl
 * "stopLine": the runtime's give-way check (conflictNear at the stop-line
 * crossing) adjudicates — the runner emits the yielded commendation itself
 * (the RHR/roundabout trackers commend on their own; the stop-line give-way
 * case is the orchestrator's to commend, doc 72 N-notes). leadSec is NEGATIVE
 * (the car reaches the node ~3.5 s AFTER the player's projected crossing), so
 * an emerging player who does NOT wait meets the car still in the box.
 * witnessArm (doc 62 S2): the release is gated on the player's true arrival
 * (raw ETA ≤ 8 s or within 6 m of the Б2 line), so a hesitant live student
 * still MEETS the car at the line instead of finding an empty junction; the
 * recorded drives commit on the same frame (≥ ~12 km/h at the 22 m gate).
 */
export const SC_JUNCTION_GAP_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jgap-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"],
    hold: { nodeIndex: 1, offsetM: -60 }, // 60 m west of the junction
    cruiseSpeedMps: 6.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 92,
  leadSec: -3.5,
  lineDistM: 27.73,
  clearSpeedMps: 7,
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

export const SC_JUNCTION_GAP: ScenarioSpec = {
  id: "sc-junction-gap",
  family: "junction",
  tagsBg: ["кръстовище", "знак Стоп", "Б2", "предимство", "интервал"],
  titleBg: "Стоп и преценка на интервала",
  objectiveBg:
    "Спри напълно на знака Б2, после потегли ЕДВА когато интервалът стига: кола по пътя с предимство на по-малко от три-четири секунди означава изчакване, не спринт през кръстовището.",
  archetypeIds: ["JU-04"],
  conceptIds: ["c-give-way-stop-behavior", "c-priority-concept", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-emerge-v1.json meta.scenario.params.
    params: {
      control: "stop",
      priorityArmM: 160,
      minorArmM: 100,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-emerge-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица — напред е път с предимство и знак Б2 „Спри!“." },
    { n: 2, textBg: "Намали отрано и пусни десен мигач — ще завиваш надясно по главния път." },
    {
      n: 3,
      textBg:
        "Спри НАПЪЛНО преди стоп-линията. Спирането обаче е само половината — сега идва преценката на интервала.",
    },
    {
      n: 4,
      textBg:
        "Гледай приближаващата кола по главния път и брой в секунди: под 3–4 секунди до теб е твърде близо. Изчакай я да премине.",
    },
    { n: 5, textBg: "Чак когато пътят е чист, потегли и завий надясно, плавно и уверено." },
  ],
  success: [
    {
      id: "sc-jgap-approach",
      // ONE JUNCTION UNDER TWO NAMES, the last pair (w10-2,
      // sc-junction-gap:73564f66, 2026-08-25). `one-junction-three-names
      // .test.ts` closed sc-junction-stop and sc-junction-scan against each
      // other and against this drill, and left ONE row on its §2 ratchet:
      // «sc-junction-gap ~ sc-junction-left» — junctions2 ~ junctions3, sharing
      // these two chips word for word. Both are Б2 approaches, so the route
      // cannot separate them and the chips are the only surface that can tell a
      // student which drill he is in. This one is about READING THE INTERVAL
      // (its own objectiveBg: „кола на по-малко от три-четири секунди означава
      // изчакване"); sc-junction-left is about the left turn across the
      // priority road. The chips now say so.
      //
      // NO NUMBER, deliberately — §3 of that file: a banner that names N км/ч
      // must sit on a gate that really caps at N, and the interval is counted
      // in SECONDS, which no chip here measures.
      titleBg: "Приближи знака Б2 бавно — интервалът се чете отдалеч",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jgap-line",
      // …AND IT NO LONGER CERTIFIES THE GAP. The old chip read «…след пълно
      // спиране И ПРОПУСНАТ ИНТЕРВАЛ», which is the very claim the note on
      // `sc-jgap-exit` below spends a paragraph refusing: a `passSignal` gate
      // witnesses the full stop and the crossing, and nothing at all about the
      // interval the student took (SimTick carries no other actor's priority,
      // no yield outcome). The gap misjudgment is graded where it is really
      // measured — the give-way check at the line → FAILED_TO_YIELD, on both
      // mistake demos. What follows the dash is a pointer to the drill, not a
      // certificate about it.
      titleBg: "Премини стоп-линията след пълно спиране — оттук нататък решава интервалът",
      // Founder R3 #14 (doc 62 — „stop marker wrong"): the guidance pillar
      // stands at THIS point (guidanceGoalFor renders passSignal x/y), so it
      // is pinned to the Б2 stop line in the player's lane (lane center
      // 4.0625, line at y = −27.725 — JUNCTION2_STOP_LINE_M), NOT the
      // junction node center: the marker must say „спри ТУК", never mid-box.
      // Completion is unchanged: the zone (r 45) still covers both the line
      // crossing and the node.
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 4.06, y: -27.73, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jgap-exit",
      titleBg: "Завий надясно и излез от кръстовището на изток",
      // TITLE-TRUTH WAVE (the full argument lives on sc-jrhr-cross in
      // templates-junctions.ts). It read «Завий надясно и ПРОДЪЛЖИ ПО ПЪТЯ С
      // ПРЕДИМСТВО»: the turn is measured, but „предимство" is the one word
      // here a student can read as „the app confirmed the gap I took" — and
      // the gap is exactly what a reachZone tick cannot see (SimTick carries
      // no other actor's priority, no yield outcome; `stepReachZone` gets no
      // ObjectiveContext). The gap misjudgment is graded where it is really
      // measured: the stop-line give-way check → FAILED_TO_YIELD (both
      // mistake demos below), with steps 3–5 and `teach` saying it in words.
      //
      // East-arm eastbound lane center, 55 m out on tj-emerge-v1's 160 m east
      // arm, past the junction area. From the south-stem spawn (4.06, −85)
      // only the completed right turn reaches it, so «надясно» and «на изток»
      // are both measured. Lane NOT named — r 9 covers the opposite centre on
      // the 8.125 m pitch. Params untouched: `done` is bit-identical, so no
      // drive that passed yesterday fails today and no THEO-4 card is owed.
      params: { kind: "reachZone", x: 55, y: -4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-junction-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-gap/mistake-cut-gap.trace.json" },
      titleBg: "Потегляне в тесен интервал",
      whatWentWrongBg:
        "Колата спря на Б2, но потегли пред приближаващ автомобил на около секунда и половина — интервал, в който той няма как да не намали заради теб. Спирането не дава предимство; то се дава чак когато пуснеш идващия с предимство да премине.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-gap/mistake-creep-out.trace.json" },
      titleBg: "Пълзящо навлизане в пътя с предимство",
      whatWentWrongBg:
        "След спирането колата запълзя навътре в кръстовището, докато колата с предимство още приближаваше — носът навлезе в нейната лента и я принуди да реагира. Бавното навлизане също е отнемане на предимство: важна е позицията, не скоростта.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "Тук кръстовището е с Б2 „Спри!“ — знакът, който виждаш на подхода, и единственият, който този път носи. Същата преценка обаче важи и там, където вместо него стои Б1 „Пропусни движението“: разликата е само че при Б1 не си длъжен да спреш, а при Б2 си. Спирането е първата стъпка; истинската задача и на двата знака е да прецениш дали идващият е достатъчно далеч.",
    whyBg:
      "Най-честият сблъсък на такова кръстовище не е от неспиране, а от подценен интервал: водачът спира, „вижда“ колата, но не изчислява скоростта ѝ и потегля пред нея. Три-четири секунди резерв е разликата между уверено потегляне и отнето предимство.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: пълно спиране преди линията, реална преценка на приближаващите по главния път и потегляне само в достатъчен интервал. Потегляне пред кола с предимство — дори след коректно спиране — е тежка грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
      { level: 5, traffic: { vehicleCount: 6 } }, // L5: живо движение по пътя с предимство
  ],
  staged: [SC_JUNCTION_GAP_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-blind — „Т-образно с ограничена видимост" (JU-17)
// on tj-occluded-v1
// ---------------------------------------------------------------------------

/*
 * SWEEP 161 — «THE LESSON'S OWN CORRECT LINE IS NOT SURVIVABLE»: REFUTED.
 *
 * The sweep filed one BROKEN critical here: „the right drive is convicted of
 * two dangerous errors — «Непропускане на ППС с предимство» and «ПТП» — 20
 * наказателни точки, НЕИЗДЪРЖАН, on BOTH platforms. A student who does exactly
 * what the briefing says still crashes into the priority car."
 * (`sweep161/sc-junction-blind/pc-right/08-debrief.png`.)
 *
 * The debrief is real. The drive behind it is not the briefing's line. This
 * drill's second objective is a LEFT turn out of the south stem — instruction
 * 5 «завий наляво и продължи на запад», disc `sc-jblind-cross` at (−50, 4.06)
 * on the west arm — and `tools/mobile/lesson-audit.mjs`'s `right` mode had, AT
 * THAT REVISION, no steering input at all: its whole keyboard vocabulary was
 * KeyW / KeyS / Escape. (That clause has since EXPIRED; it is left standing
 * only because it is what the sweep-161 drive actually was. Do not lean on it
 * — the w17 block below carries the refutation now.) So it went north through
 * an equal junction it never yielded at, and
 * `04-t209s.png` shows where it stopped — 3 км/ч, gear D, standing in an empty
 * green field off the network, task 2/2 still asking for the left turn.
 *
 * MEASURED rather than argued, in `__tests__/pk-junctions2-sweep161-truth.test
 * .ts` §2: the committed shadow driven through the production session
 * (compileScenario → createLessonSession → applyTick every frame) completes
 * both objectives with ZERO violations and ИЗДЪРЖАН on all five rungs, while
 * the harness's own law re-authored in the recorder's vocabulary earns
 * objective 1 and cannot reach objective 2's disc. The counter-proof rides the
 * same pipeline: mistake-barge still grades FAILED_TO_YIELD and mistake-no-look
 * still grades COLLISION, so the pass is not a suite that stopped grading.
 *
 * W17 RE-JUDGEMENT — `sc-junction-blind:dea35510`, re-driven 2026-08-29 at
 * attested commit bc7d43f and judged STILL. REFUTED AGAIN — same conclusion,
 * NEW evidence, because the old evidence had rotted. The harness steers now:
 * `lesson-audit.mjs` holds KeyA/KeyD from a vision loop that reads the
 * RouteGuidance ribbon off the windscreen (`guidance.wired: true`, 48 scans on
 * the pc leg), and the shadow tape it follows supplies SPEED only
 * (`guidance.alignment.note`: „it did not steer, aim or index anything on this
 * drive"). A refutation resting on „the recorder cannot turn" was one harness
 * release away from being thrown out whole — which is precisely what happened
 * here. So pin it to the TRACK, which no harness upgrade can move:
 *
 *   `w17/frames/sc-junction-blind__pc-right/_audit-status.json`,
 *   `guidance.samples` — one row per ~1 s, wz = −y:
 *     (4.06, −85) → (−1.9, −9) → (−2.3, +5) → (−3.45, +41), then standing
 *   126 m of northing, 7.5 m of lateral drift end to end, not one metre west.
 *   The mobile leg is the same shape: (4.06, −83) → (−12.0, +41).
 *
 * tj-occluded-v1 is a THREE-node T (`roads.nodes`: W −140, C 0, E +140,
 * S −130 — THERE IS NO NORTH ARM), so both drives ran off the far side of the
 * crossbar and died ~40 m out in the field. That is what «Удар в неподвижно
 * препятствие» names — a бордюр/стълб/ограда charge, explicitly NOT the
 * priority car the finding says the student crashes into — and what „колата
 * остана притисната на място" in the debrief describes. Objective 2's disc is
 * at (−50, +4.06) r 9: the pc leg never came within ~48 m of it, the mobile
 * leg ~45 m. The give-way charge is earned too — the car rolled into the 18 m
 * right-hand-rule core at ~10 км/ч WITHOUT EVER STOPPING while the priority
 * car was visible from the right (`runtime/worldRuntime.ts`
 * RHR_CORE_RADIUS_M = 18, conviction gated on `speedKmh > RHR_MOVING_KMH`),
 * then re-accelerated 2 → 14 км/ч across the node. The shadow halts at
 * y = −19.5, OUTSIDE that core, and holds 8 s. Two different drives; only one
 * of them is the briefing's.
 *
 * And the row is UNSETTLEABLE by the `-right` driver as built, not merely
 * unproven by it: on both legs the ribbon goes unseen (`seen: false`) from
 * ~5 m short of the node to the end of the run, so the loop has nothing to
 * steer to through the turn and holds straight ahead. Whether this lesson's
 * correct line survives is a question only the §2 shadow replay can answer —
 * a windscreen-following recorder cannot reach the west arm to ask it.
 *
 * ── THE HALF THE ANSWER ABOVE LEFT OPEN (w18, 2026-08-30) ──────────────────
 *
 * The block above answers the PC leg — «Удар в неподвижно препятствие», a
 * бордюр/стълб charge out in the field, „explicitly NOT the priority car".
 * That is true of the pc leg and of nothing else, and the judge who re-read
 * this row did not quote the pc leg. He quoted the MOBILE one, where the
 * second charge really is a car: «Удар в друго превозно средство» −10. A
 * refutation with a hole at the exact sentence the next reader will press on
 * is not a refutation, so — from the same tapes, `mobile-right`:
 *
 *   `_audit-debrief.json` bills THREE errors, in this order: «Непропускане…»
 *   −10 at 1:04, «Удар в друго ППС» −10 at 1:09, and «Удар в неподвижно
 *   препятствие» at 1:25 «без допълнителни изпитни точки» — the card explains
 *   itself: „Изпитът вече беше прекратен". Objective 1 ticks at 0:54 and the
 *   tape first sits inside its r 8 disc at y = −29.2, so `guidance.samples`
 *   runs ~32 s behind the lesson clock: 1:09 → y ≈ +2, 1:25 → y ≈ +37. The
 *   tape corroborates the first without the arithmetic — 13 км/ч at y = −1.4
 *   collapses to 0 км/ч at y = +3.5, which is the WESTBOUND lane centre
 *   (+4.06), the lane the crossbar's traffic occupies and the only lane a
 *   northbound car crosses on its way off the end of the road.
 *
 * So the mobile drive did hit a car — square in the lane it had been convicted
 * of not yielding to nine seconds earlier, while driving STRAIGHT NORTH off a
 * road that ends at y = 0. That is the barge `mistake-barge` and
 * `mistake-no-look` exist to teach against; the briefing's line yields FIRST
 * and then turns left, and never stands in that lane while it is occupied.
 * And the «автомобил — на 0.2 м / 0.5 м» the finding reads as the crash is not
 * a conviction at all: it sits under «Разминавания на косъм», whose own first
 * line is «Не се броят като грешки — нищо не се удари».
 *
 * WHAT §2 STILL DOES NOT COVER, stated rather than hidden. The replay grades
 * the STAGED conflict and the authored geometry — `recordScJunction2Drive`
 * is handed `stagedEvents` and nothing else. The live rung is not so empty:
 * this template authors no `traffic`, so it inherits the family baseline
 * (`compile.ts` SCENARIO_FAMILY_TRAFFIC_BASELINE.junction = 5, L1 ladder ×0.5
 * → 2.5, lifted to SCENARIO_FAMILY_TRAFFIC_FLOOR = 4), and `LessonScene.tsx`
 * hands that count to `createTrafficSystem` as four COLLIDING bodies. Whether
 * the briefing's line survives THOSE is not what §2 measured and not what this
 * row asked — but it is what a re-drive of the correct line would really be
 * testing, and the next lane to open this lesson should say so out loud.
 *
 * ── W21 (2026-08-31) · THE OPEN HALF, DRIVEN — AND THE ROW IS CONFIRMED ────
 *
 * Said out loud, because it is not the answer the three blocks above expect:
 * THE MODEL LINE DOES NOT SURVIVE THE LIVE RUNG'S TRAFFIC. Every refutation
 * on this row — sweep 161, w17, w18 — is true only at `vehicleCount: 0`, and
 * that is a configuration no student has ever played.
 *
 * MEASURED through the production session (`compileScenario` →
 * `createLessonSession` → `applyTick` every frame), driving the shadow's own
 * geometry — approach at 20 км/ч, creep to (4.06, −19.5) at 9, hold 8 s on the
 * brake, then the R = 18 quarter-arc left turn out to the west arm — and
 * handing `recordScriptedDrive` the count the RUNG COMPILES TO instead of the
 * recorder's default 0:
 *
 *   sc-junction-blind  L1 n=4 · L3 n=5 · L5 n=6  → convicted on 11 of 20 seeds
 *   sc-junction-rhr    L1 n=4 · L3 n=5 · L5 n=8  → convicted on  6 of 20 (L5 7)
 *   both of them with the ambient agents removed → convicted on  0 of 20
 *
 * The conviction is the finding's sentence verbatim — «Непропускане на пътно
 * превозно средство с предимство», опасна, 10 наказателни точки, НЕИЗДЪРЖАН.
 * On L1 seed 7 it fires at t = 31.12 s at (4.06, −16.4) doing 13.3 км/ч: 1.7 s
 * after the car pulls away from a COMPLETED eight-second yield, against a
 * conflict that does not exist on the same seed with the ambient bodies gone
 * (an ambient car down the crossbar, or the staged one held up by one — the
 * control cannot tell them apart and does not need to). Wait 4 s and the line
 * passes; wait the 8 s the demo waits and it fails; wait 14 s or 20 s and it
 * passes again. And the card then explains to a student who did wait that he
 * did not — a false «правилното действие», which is requirement-zero's own
 * crime rather than a scoring quibble.
 *
 * WHY IT IS NOT REPAIRED IN THIS FILE, measured rather than deferred:
 *
 *  · IT IS NOT THIS TEMPLATE'S DEFECT. `sc-junction-rhr` (templates-junctions
 *    .ts, tj-rhr-v1, no occluding building anywhere) fails the same line the
 *    same way at roughly half the rate. The corner building makes it worse; it
 *    does not make it. A repair here closes one row and leaves the family up.
 *  · THE TEMPLATE-LEVEL LEVER IS A TRAP, not merely insufficient. Authoring
 *    `traffic: { vehicleCount: n }` on the spec would silence it — and
 *    `traffic/__tests__/ambient-presence.test.ts` builds its SUBJECTS as „has
 *    a family baseline AND `t.traffic === undefined`", so the key does not turn
 *    that gate red, it DELETES this drill from it. That is the same opt-out
 *    wave 8 unwound for `sc-junction-scan` (templates-junctions.ts, the B28
 *    block), and it would trade the founder's dead-street row for this one.
 *  · NOTHING IN THE SUITE COULD SEE IT. `recordScriptedDrive` defaults
 *    `vehicleCount: 0` (traces/recorder.ts) and the junction recorders pass
 *    none — `recordScJunction2Drive` takes `Pick<…, "onTick">` and nothing
 *    else — so §2 above, the sc-ju2 trace gate and every committed ghost
 *    certify the model line on an empty street. The product has never measured
 *    its own model answer against the traffic it ships with the lesson.
 *
 * THE THREE ADDRESSES, for the lanes that own them. (1) `runtime/worldRuntime
 * .ts` §4b: `rightConflictQuery` is PRIORITY_CONFLICT_RADIUS_M = 26 m of pure
 * geometry — no occlusion, no conflicting-course test — so any ambient body on
 * the crossbar is a priority conflict the moment the wheels turn. (2) `traffic
 * /system.ts` + the orchestrator: hold ambient agents out of the graded node's
 * conflict window while a STAGED encounter owns it, which is the only reading
 * under which „пропусни идващия отдясно" and „the street is alive" are both
 * true. (3) Whichever gate certifies a shadow: replay it at the rung's
 * compiled count, not at 0 — otherwise the next round refutes this row for the
 * fourth time on the same empty street, exactly as the last three did.
 *
 * ── W22 (2026-09-02) · RE-MEASURED, AND ONE CORRECTION TO THE BLOCK ABOVE ──
 *
 * The row came back with a split judgement — «mobile-right now passes cleanly,
 * pc-right is still convicted 23 points with 2 dangerous errors led by failure
 * to yield» — so both halves were driven again against the CURRENT tree. The
 * confirmed half is real and reproduces. The cited frame is not evidence for
 * it, and w21's own explanation of it is wrong in a way that would misdirect
 * the repair.
 *
 * THE FRAME THE JUDGE QUOTED, opened. `w22/frames/sc-junction-blind__pc-right/
 * _audit-debrief.json` bills THREE errors, in this order: «Непропускане на
 * пътно превозно средство с предимство» −10 at 1:54, «Излизане от платното за
 * движение» −3 at 2:17, «Удар в неподвижно препятствие» −10 at 2:23. The
 * finding's own sentence — «Пътнотранспортно произшествие … crashes into the
 * priority car» — appears nowhere; the second dangerous error is the бордюр /
 * стълб / ограда charge, and the error immediately before it says why. The
 * track agrees: `guidance.samples` (78 rows, wz = −y) runs (4.06, −113.9) →
 * (−2.45, −0.4) at 24 км/ч → standing at (−1.4, +40.3). tj-occluded-v1 still
 * has NO north arm (`roads.nodes`: W −140, C 0, E +140, S −130 — re-read, not
 * inherited), so the leg crossed the crossbar and died 40 m out in the field,
 * 63 m from objective 2's disc at (−50, 4.06) r 9. Third wave running, same
 * shape: the windscreen-following driver never turns. The mobile leg is the
 * counter-sample — ИЗДЪРЖАН, 0 наказателни точки, ★★★, both objectives at 0:46
 * and 1:27, «Похвали ✓ Правилно отстъпено предимство 1:28» — which is what the
 * SAME lesson does when the drive is the briefing's.
 *
 * THE CONFIRMED HALF REPRODUCES, on today's tree, same method as w21 (the
 * shadow's geometry through `compileScenario` → `createLessonSession` →
 * `applyTick`, handed the count the rung compiles to):
 *
 *   sc-junction-blind  L1 n=4 · L3 n=5 · L5 n=6  → 11 / 11 / 11 of 20 seeds
 *   the same three rungs at vehicleCount 0       →  0 /  0 /  0 of 20
 *   sc-junction-rhr    L1 n=4 · L3 n=5 · L5 n=8  →  6 /  6 /  7 of 20
 *
 * every conviction FAILED_TO_YIELD. The family half of w21 holds by
 * measurement and not by argument: a template that hosts no occluding building
 * at all, in another file, on another district, fails the same line at better
 * than half this rate. The address is still not here.
 *
 * THE CORRECTION, and it changes what the owning lane should build. W21 wrote:
 * „Wait 4 s and the line passes; wait the 8 s the demo waits and it fails;
 * wait 14 s or 20 s and it passes again." That is true of seed 7 and of
 * nothing wider. Swept across the same 20 seeds at L1 n = 4, holding the brake
 * at the shadow's own yield point (4.06, −19.5) for 0 / 2 / 4 / 6 / 8 / 10 /
 * 14 / 20 s, the convictions are 13 / 5 / 8 / 13 / 11 / 7 / 5 / 6 out of 20.
 * There is no wait length that clears the line, and waiting LONGER is neither
 * better nor worse — seeds 10, 11, 13, 15, 16 and 18 convict at almost every
 * one of them. So the sentence to hand the lane that owns the predicate is not
 * „the release timing is a few seconds out"; it is „the predicate never reads
 * the student's yield at all". A repair aimed at the clock passes seed 7 and
 * changes nothing a student would feel.
 *
 * WHICH PREDICATE, by name, so the fix lands the first time. The live binding
 * is `scene/lessonWorldRecipe.ts` `wireTrafficQueries` →
 * `setRightConflictQuery` → `traffic/system.ts conflictFromRightFor`, and that
 * function asks exactly four questions: within `radiusM` of the NODE, moving
 * above CONFLICT_MIN_SPEED_MPS, on the player's right past RIGHT_MIN_M, and
 * bearing at least CONFLICT_SAME_DIR_DEG off his own. It never asks whether
 * the vehicle has CLEARED the conflict point. Its sibling `conflictNearFor`
 * was given that clause in doc 87 B5 („it said that I didnt let the traffic
 * cars to pass, when in Fact I let everybody pass") and the right-hand-rule
 * twin was left behind — which is the same shape of asymmetry, and the same
 * founder sentence, one adjudicator over.
 *
 * WHY THIS IS A REQUIREMENT-ZERO ROW AND NOT A SCORING ONE (doc 64 THEO-4).
 * The card that follows the conviction prints «✔ Правилното действие:
 * … потегли само когато никой не приближава» — to a student who did precisely
 * that, having crept, looked and stood eight seconds on the brake. A verdict
 * that is merely harsh is a tuning argument; a verdict whose explanation
 * describes a different drive than the one the student drove is the crime this
 * product exists to not commit.
 *
 * NOTHING IN THIS FILE WAS CHANGED FOR IT — and the reasons are w21's two,
 * both re-verified rather than inherited: `traffic/__tests__/ambient-presence
 * .test.ts:209` still builds SUBJECTS as „a family baseline AND `t.traffic ===
 * undefined`", so authoring a count here DELETES this drill from the dead-street
 * gate instead of turning it red; and `recordScJunction2Drive`
 * (traces/scJunctions2.ts) still takes `Pick<…, "onTick">`, so every gate that
 * certifies this shadow still certifies it at 0.
 */

/**
 * The staged conflict: a car crosses the equal T-junction from the player's
 * RIGHT (east → west), timed by the priorityFromRight runner against the
 * player's approach. junctionControl "uncontrolled": the runtime's own
 * right-hand-rule tracker adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY)
 * — the SE corner building only HIDES the car until late (world dressing, zero
 * grading change). This mirrors SC_JUNCTION_RHR_CONFLICT verbatim except for
 * the host district; the near-node dynamics are arm-independent.
 */
export const SC_JUNCTION_BLIND_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jblind-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-17",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  lineDistM: 18,
  clearSpeedMps: 11.5,
  // Doc 62 S2 (founder R3 #15): release only on the player's true arrival —
  // a creeping student behind the corner building still meets the car.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

export const SC_JUNCTION_BLIND: ScenarioSpec = {
  id: "sc-junction-blind",
  family: "junction",
  tagsBg: ["кръстовище", "ограничена видимост", "предимство", "дясното правило"],
  titleBg: "Кръстовище с ограничена видимост",
  objectiveBg:
    "Излез от равнозначното кръстовище, чиято видимост надясно е закрита от сграда: приближи с готовност за спиране, изпълзи внимателно докато видиш, и пропусни идващия отдясно, преди да завиеш.",
  archetypeIds: ["JU-17", "JU-23"],
  conceptIds: ["c-right-hand-rule", "c-equal-junction", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-occluded-v1.json meta.scenario.params.
    params: {
      control: "none",
      priorityArmM: 140,
      minorArmM: 130,
      lanes: 2,
      priorityMaxKmh: 40,
      minorMaxKmh: 40,
    },
    districtId: "tj-occluded-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица към равнозначното кръстовище — сграда на ъгъла закрива гледката надясно." },
    { n: 2, textBg: "Намали много отрано и пусни ляв мигач — ще завиваш наляво по главното направление." },
    {
      n: 3,
      textBg:
        "Видимостта надясно е лоша: приближи почти до спиране и изпълзи внимателно, докато очите наистина видят зад сградата.",
    },
    { n: 4, textBg: "Кола отдясно има предимство по правилото на дясното — спри и я изчакай да премине изцяло." },
    { n: 5, textBg: "Щом пътят е чист, завий наляво и продължи на запад." },
  ],
  success: [
    {
      id: "sc-jblind-approach",
      titleBg: "Приближи кръстовището бавно, с готовност за спиране",
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 22 },
    },
    {
      id: "sc-jblind-cross",
      titleBg: "Завий наляво и излез от кръстовището на запад",
      // TITLE-TRUTH WAVE (see sc-jrhr-cross in templates-junctions.ts). It
      // read «Премини наляво, СЛЕД КАТО ПРОПУСНЕШ идващия отдясно» — a
      // certified yield on a drill whose whole point is that the car is
      // HIDDEN until late. The tick cannot see the yield (no priority, no
      // outcome on SimTick), so the disc credited the blind barge and the
      // careful crawl on the same frame; the tracker is what actually convicts
      // (FAILED_TO_YIELD / COLLISION on the two mistake demos, and the
      // approach's own ≤ 22 km/h cap grades the crawl).
      //
      // West-arm westbound lane center, 50 m out on tj-occluded-v1's 140 m
      // west arm, past the 40 m junction area — from the south-stem spawn
      // (4.06, −115) reachable only by completing the left turn. Params
      // untouched, `done` bit-identical, no THEO-4 card owed.
      params: { kind: "reachZone", x: -50, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-junction-blind/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-blind/mistake-barge.trace.json" },
      titleBg: "Изскачане иззад сградата",
      whatWentWrongBg:
        "Колата навлезе в кръстовището без да намали, точно там, където сградата крие идващите отдясно — а отдясно приближаваше автомобил с предимство. При закрита видимост скоростта убива времето за реакция: тук се пълзи, не се нахлува.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-blind/mistake-no-look.trace.json" },
      titleBg: "Навлизане без оглеждане зад сградата",
      whatWentWrongBg:
        "Водачът се вмъкна в кръстовището, без изобщо да изчака да види зад сградата — колата с предимство остана скрита до самия удар. При ограничена видимост единствената защита е да изпълзиш, докато погледът стигне отвъд ъгъла.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На квартални кръстовища, където сграда, ограда или паркирани коли крият идващите — особено на равнозначни улици, където предимството е на този отдясно. Видиш ли, че не виждаш, приемаш, че идва някой.",
    whyBg:
      "„Погледнах, но не видях“ е най-честата причина за страничен сблъсък на кръстовище. Когато ъгълът е закрит, високата скорост означава, че виждаш опасността едва когато е върху теб. Пълзенето и вторият поглед превръщат невъзможната преценка във възможна.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване далеч преди кръстовището, внимателно изпълзяване до точката на видимост, оглеждане наляво-надясно и реално пропускане на идващия отдясно. Нахлуване на сляпо е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_JUNCTION_BLIND_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-junction-left — „Ляв завой от Б2 през пътя с предимство" (JU-04 applied to
// the LEFT turn — the harder emergence: the car crosses the near carriageway
// AND merges into the far one) on tj-emerge-v1 (map REUSED from sc-junction-gap;
// distinct maneuver + a conflict car from the player's RIGHT)
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car travels the priority road from the player's RIGHT
 * (east → west, straight through the junction), timed by the priorityFromRight
 * runner against the player's arrival at the Б2 line. junctionControl
 * "stopLine": the runtime's give-way check (conflictNear at the stop-line
 * crossing) adjudicates — the runner emits the yielded commendation itself. The
 * left-turning player must CROSS this car's lane, so pulling out in front of it
 * is отнемане на предимство (FAILED_TO_YIELD). Timing values mirror
 * SC_JUNCTION_GAP_CONFLICT verbatim (same map, same stem approach) — only the
 * actor's direction and the player's turn differ.
 */
export const SC_JUNCTION_LEFT_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jleft-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -60 }, // 60 m east of the junction
    cruiseSpeedMps: 6.5,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 92,
  leadSec: -3.5,
  lineDistM: 27.73,
  clearSpeedMps: 7,
  // Doc 62 S2 (founder R3 #16 „колата минава преди да стигна знака"): the
  // release waits for the player's true arrival at the Б2 line, any pace.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

export const SC_JUNCTION_LEFT: ScenarioSpec = {
  id: "sc-junction-left",
  family: "junction",
  tagsBg: ["кръстовище", "ляв завой", "знак Стоп", "Б2", "предимство"],
  titleBg: "Ляв завой от Б2 през пътя с предимство",
  objectiveBg:
    "Спри напълно на знака Б2 и завий наляво едва когато пътят е чист в ДВЕТЕ посоки: левият завой пресича насрещната лента и се влива в отсрещната — кола с предимство отдясно означава изчакване, не потегляне пред нея.",
  archetypeIds: ["JU-04"],
  conceptIds: ["c-give-way-stop-behavior", "c-priority-concept", "c-junction-approach"],
  map: {
    archetype: "t-junction",
    // Map REUSED from sc-junction-gap — mirrored in tj-emerge-v1.json params.
    params: {
      control: "stop",
      priorityArmM: 160,
      minorArmM: 100,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-emerge-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица — напред е път с предимство и знак Б2 „Спри!“. Ще завиваш НАЛЯВО." },
    { n: 2, textBg: "Намали отрано и пусни ляв мигач." },
    {
      n: 3,
      textBg:
        "Спри НАПЪЛНО преди стоп-линията. Левият завой е по-опасен: пресичаш едната лента и се вливаш в другата.",
    },
    {
      n: 4,
      textBg:
        "Огледай и в двете посоки. Кола с предимство отдясно, която ще пресечеш, на по-малко от 3–4 секунди означава изчакване.",
    },
    { n: 5, textBg: "Чак когато пътят е чист и в двете посоки, завий наляво плавно и уверено." },
  ],
  success: [
    {
      id: "sc-jleft-approach",
      titleBg: "Приближи знака Б2 с контролирана скорост",
      params: { kind: "reachZone", x: 4.06, y: -45, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-jleft-line",
      // THE SAME UNWITNESSABLE CERTIFICATE, ON THE TWIN — verifier pass on
      // sc-junction-gap:73564f66, 2026-08-25. The gap drill's chip stopped
      // claiming «и пропуснат интервал» twenty lines up; this one, 309 lines
      // below it in the SAME file, on the same map (tj-emerge-v1), through the
      // same `passSignal`/`stopSign` gate, went on claiming it. Retiring a
      // false certificate on one drill and leaving it standing on the drill it
      // was being separated FROM is not a repair, it is a relabelling.
      //
      // What this gate really witnesses is written out at `stepPassSignal`
      // (objectives.ts, „Б2 Е СТОП, НЕ Е МЯСТО, КРАЙ КОЕТО СЕ МИНАВА"): the
      // full stop at the line, and the crossing. It has no channel for another
      // vehicle's priority and none for the seconds the student let pass —
      // that judgement is graded where it is really measured, at the give-way
      // check (FAILED_TO_YIELD, which is what BOTH mistake demos below bill).
      // So the chip names the act it can certify and then points at the drill.
      //
      // AND IT STILL SEPARATES THE TWO DRILLS, which is the row this file was
      // opened for: the gap drill's chip ends «оттук нататък решава интервалът»
      // (counting the gap), this one ends «левият завой започва оттук»
      // (turning across the priority road). Nothing the student is taught is
      // lost — инструкция 4 still says the 3–4 seconds in full, and `teach.
      // whyBg` below calls the underestimated interval the commonest mistake.
      titleBg: "Премини стоп-линията след пълно спиране — левият завой започва оттук",
      params: { kind: "passSignal", nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" },
    },
    {
      id: "sc-jleft-exit",
      titleBg: "Завий наляво и излез от кръстовището на запад",
      // TITLE-TRUTH WAVE (see sc-jrhr-cross in templates-junctions.ts). Same
      // rewrite as sc-jgap-exit on the same map: «…и ПРОДЪЛЖИ ПО ПЪТЯ С
      // ПРЕДИМСТВО» let the word „предимство" stand in a sentence the
      // objective settles by geometry alone. The left turn here crosses one
      // carriageway and merges into the other — two priority questions, both
      // adjudicated by the stop-line give-way check (FAILED_TO_YIELD on both
      // mistake demos), none of them visible to a reachZone tick.
      //
      // West-arm westbound lane center, 55 m out on tj-emerge-v1's 160 m west
      // arm, past the junction area; from the south-stem spawn (4.06, −85)
      // only the completed left turn reaches it. Params untouched, `done`
      // bit-identical, no THEO-4 card owed.
      params: { kind: "reachZone", x: -55, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-junction-left/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-junction-left/mistake-cut-gap.trace.json" },
      titleBg: "Ляв завой в тесен интервал",
      whatWentWrongBg:
        "Колата спря на Б2, но потегли наляво пред приближаваща отдясно кола с предимство — на около секунда и половина. Левият завой пресича нейната лента; тя трябваше да намали заради теб. Спирането не дава предимство — интервалът го дава.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-junction-left/mistake-creep-out.trace.json" },
      titleBg: "Пълзящо навлизане в пътя с предимство",
      whatWentWrongBg:
        "След спирането колата запълзя навътре в кръстовището, докато колата с предимство приближаваше — носът навлезе в лентата, която левият завой трябва да пресече. Бавното навлизане също е отнемане на предимство: важна е позицията, не скоростта.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "Тук завиваш наляво от улица с Б2 „Спри!“ — това е знакът на този подход. Същото важи и на кръстовище с Б1 „Пропусни движението“, само че там спираш само ако иначе би засякъл някого. Левият завой е сред най-опасните маневри при всеки от двата знака: колата ти стои напречно, пресича едната лента и се влива в другата — трябва да е чисто и от двете страни.",
    whyBg:
      "Левият завой отнема повече време и излага колата ти на трафик от двете посоки едновременно. Най-честата грешка не е неспирането, а подцененият интервал към приближаващата с предимство кола, чиято лента ще пресечеш. Три-четири секунди резерв са разликата между уверен завой и отнето предимство.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: пълно спиране преди линията, реална преценка на приближаващите по главния път в ДВЕТЕ посоки и завиване наляво само в достатъчен интервал. Потегляне пред кола с предимство — дори след коректно спиране — е тежка грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_JUNCTION_LEFT_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION/PRIORITY S3 batch-4 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS2: readonly ScenarioSpec[] = [
  SC_JUNCTION_GAP,
  SC_JUNCTION_BLIND,
  SC_JUNCTION_LEFT,
];
