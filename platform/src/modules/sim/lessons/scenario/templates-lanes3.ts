/**
 * Scenario templates — the LANE-DISCIPLINE family, wave 8 (doc 76 §2; the
 * templates-flow.ts sc-lane-change deepened). DATA ONLY in the templates.ts
 * mold: coordinates are denormalized from the committed ln-v1 district so
 * nothing loads world JSON at runtime; ln-decisive-districts.test.ts asserts
 * every pinned value against the generated map.
 *
 *  - sc-ln-decisive-change  „Решително престрояване в поток" (OV-01/OV-02,
 *                           ln-v1 REUSED — the sc-lane-change map)
 *
 * WHAT THIS ADDS OVER sc-lane-change (mechanics → JUDGEMENT). sc-lane-change
 * teaches the RITUAL (огледало → мигач → рамо → маневра) against a pace car
 * pinned 24 m behind — a car that never actually forces a decision. This
 * template keeps the ritual and adds the thing a real merge is really about:
 * GAP SELECTION UNDER PRESSURE. A car rides the TARGET (left) lane, draws
 * LEVEL with the player, and passes; the drill is to WAIT for it, read the
 * real gap it opens BEHIND itself, and move into that gap DECISIVELY — no
 * half-commit that makes anyone brake, and never onto the car while it is
 * still in the blind spot. The positive signal is SAFE_LANE_CHANGE; the two
 * failures are the two ways the judgement goes wrong.
 *
 * WHY THE MISTAKES GRADE WHAT THEY GRADE (all on SHIPPED codes, no new
 * detector — the sc-vu-blindspot-moto precedent on the same map):
 *   - „Престрояване върху колата в мъртвата зона": mirror channel is
 *     DIRECTION-keyed, so a rear-view glance never clears the LEFT blind spot;
 *     the wheel goes over while the target-lane car is alongside →
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK, and the authored contact (the
 *     rearTailgater runner emits ZERO SimTick events by contract — pressure
 *     scenery, doc 72 FO-07) grades COLLISION.
 *   - „Половинчато вмъкване, което кара другия да спира": the car IS seen (left
 *     glance present) but the move is unannounced (no indicator) and never
 *     committed — the player hovers on the lane divider (x = 7.8, laneOffsetM
 *     ≈ −3.74, past laneKeepMaxOffsetM 3.25 toward the divider, so the
 *     center-line condition never arms) → LANE_CHANGE_WITHOUT_INDICATOR +
 *     POOR_LANE_KEEPING. A half-taken lane forces the driver already in it to
 *     guess and brake — decisiveness is the safety, not the aggression.
 *
 * Family: "lanes" — the existing catalog chip (doc 76 §2). ЗДвП чл. 25.
 */

import type { BrakingLeadCarSpec, RearTailgaterSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from ln-v1 by value — the L7 pattern;
// ln-decisive-districts.test.ts asserts the copies match the map)
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario — laneId 0 = curb/right lane,
 *  laneId 1 = the target/left lane) and the drawn boundary between them. */
const LN_RIGHT = 12.19; // laneId 0 — the player's cruise lane
const LN_LEFT = 4.06; // laneId 1 — the target lane (and the passed car's lane)
const LN_SPLIT = 8.125; // the drawn lane boundary — the laneId frontier

/**
 * The staged TARGET-LANE CAR on ln-v1: the shipped rearTailgater actor offset
 * onto the LEFT lane center (extraRightOffsetM −8.13 off the graph's curb lane
 * ⇒ x = 4.06 — the same offset the live sc-lane-change pace car rides). Held
 * dormant 15 m behind the spawn, released once the player is genuinely up the
 * boulevard; it closes to a blind-spot gap, holds it through the pressure
 * window, then passes at ~55 km/h and STAYS in the left lane (passShiftM 0):
 * the very lane the player is about to take, with a real gap opening behind it.
 *
 * PRESSURE SCENERY (doc 72 FO-07, A12): the runner emits ZERO SimTick events —
 * no violation and no collision can grade from it. The collision demo's contact
 * is therefore an AUTHORED beat (DriveStep.collision), honest only because the
 * geometry agrees (the car is still alongside when the wheel goes over — the
 * trace gate asserts the crossing precedes the pass).
 */
const LN_TARGET_CAR: RearTailgaterSpec = {
  id: "sc-lndc-target",
  kind: "rearTailgater",
  libraryEventId: "ev-lane-change",
  actor: {
    // ln-v1 is one edge: start → end, northbound. The graph lane rides the
    // curb lane (x = 12.19); −8.13 lands the car on the LEFT lane center 4.06.
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind ln-spawn-start
    cruiseSpeedMps: 11,
    extraRightOffsetM: LN_LEFT - LN_RIGHT, // −8.13 → the target lane
    colorIndex: 2,
  },
  releaseGapM: 20, // the player is ~20 m up the boulevard before it rolls
  followBehindM: 11, // ~7 m of bumpers — the blind-spot pose
  maxMatchSpeedMps: 16,
  pressureSec: 3,
  passShiftM: 0, // stays in the LEFT lane — the gap opens BEHIND it, not beside
  passSpeedMps: 15, // ~54 km/h — it draws level and passes decisively
  passAheadM: 35,
  easeKmh: 5,
};

/**
 * The L5 tightener: a SECOND target-lane car AHEAD (a plain brakingLeadCar with
 * its slam authored out of the play corridor — deterministic moving traffic,
 * the LN_TARGET_LANE_CAR mold from sc-lane-change). It rides the left lane in
 * front, so the gap the player must thread is bounded on BOTH ends (this car
 * ahead, the passing rearTailgater behind): „tighter target-lane spacing".
 * Only staged at L5 (stagedAdd), so it never touches the recorded ghosts or the
 * base-rung sessions.
 */
const LN_TARGET_CAR_AHEAD_L5: BrakingLeadCarSpec = {
  id: "sc-lndc-lead-l5",
  kind: "brakingLeadCar",
  libraryEventId: "ev-lane-change",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 55 }, // ~40 m ahead of the spawn, left lane
    cruiseSpeedMps: 11,
    extraRightOffsetM: LN_LEFT - LN_RIGHT, // −8.13 → the target lane
    colorIndex: 4,
  },
  followGapM: 22, // paces ahead — matchPlayer, the tight front of the gap
  maxMatchSpeedMps: 14,
  slamAt: { x: LN_LEFT, y: 395 }, // far road end — outside the play corridor
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.5, // …and the proximity fallback cannot occur pre-contact
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * OV-01/OV-02 — the mirror → signal → move lane change taken to its real test:
 * the DECISIVE merge into a chosen gap (ЗДвП чл. 25: преди маневра водачът се
 * убеждава, че няма да създаде опасност за движещите се по платното, в което
 * навлиза, и подава сигнал; той извършва маневрата плавно и решително, без да
 * принуждава другите да намаляват рязко). Bank-grounded: q-manevri-006/007/044
 * on the lane-change duty + smooth execution, q-vehicle-034 the shoulder-glance
 * duty, q-predimstvo-035 the „не отнемай предимство при престрояване" rule.
 */
export const SC_LN_DECISIVE_CHANGE: ScenarioSpec = {
  id: "sc-ln-decisive-change",
  family: "lanes",
  tagsBg: ["смяна на лента", "преценка на пролука", "огледала", "мигачи", "решителност"],
  titleBg: "Решително престрояване в поток",
  objectiveBg:
    "Огледало → рамо → мигач → плавно и РЕШИТЕЛНО: изчакай реална пролука в съседната лента и се премести без колебание и без да караш някого да спира.",
  archetypeIds: ["OV-01", "OV-02"],
  conceptIds: ["c-lane-change", "c-mirrors-blind-spots", "c-driver-signals", "c-lane-choice"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ln-v1.json meta.scenario.params
    // (tools/maps/gen_two_lane_road.mjs; map REUSED from sc-lane-change).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain and HEADLIGHTS_OFF_IN_RAIN grades
    // with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Установи се стабилно в дясната лента с постоянна скорост и наблюдавай съседната лента. Вали ли, включи късите светлини преди това (чл. 70): престрояването се вижда от съседната лента по мигача и по светлините ти — на мокър булевард тъмната кола просто я няма в чуждото огледало." },
    { n: 2, textBg: "В лявата лента идва кола — провери лявото огледало и прецени скоростта ѝ. Не се хвърляй пред нея." },
    { n: 3, textBg: "Изчакай я да те изравни и да отмине — тогава зад нея се отваря реалната пролука за теб." },
    { n: 4, textBg: "Ляв мигач, после бърз поглед през рамо към мъртвата зона — огледалото не показва всичко." },
    { n: 5, textBg: "Влез в пролуката плавно и РЕШИТЕЛНО, в една линия — без половинчато колебание, което кара другите да спират." },
    { n: 6, textBg: "Центрирай се в лявата лента, изключи мигача и продължи." },
  ],
  success: [
    {
      id: "sc-lndc-wait",
      titleBg: "Изчакай колата в съседната лента, вместо да се хвърлиш пред нея",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the RIGHT
      // lane. Reaching it at flow pace IS „изчака реалната пролука" — a driver
      // who lunged left early is at x ≈ 4.06 here and misses it.
      params: { kind: "reachZone", x: LN_RIGHT, y: 175, radiusM: 4, maxSpeedKmh: 48 },
    },
    {
      id: "sc-lndc-merged",
      // TITLE-TRUTH (doc 86 D3, the reachZone census after cdb2f71) — the one
      // row of the census that carried NOTHING: no cap, no constraint, a bare
      // presence check under «Влез РЕШИТЕЛНО в ПРОЛУКАТА зад отминалата кола».
      // Both promised words were unmeasured, and the comment that stood here
      // („not straddling the divider") was measurably false at EVERY rung.
      //
      // IT CERTIFIED ITS OWN COUNTER-DEMO. `mistake-half-merge` — the drive
      // whose own copy reads «увисна на границата между двете ленти, нито в
      // едната, нито в другата» — parks at x = 7.50 (the paint is at 8.125) and
      // stands there. Its distance to this mark can never be less than
      // |7.50 − 4.06| = 3.44 m, and the authored r4 admitted it: replayed
      // through the production evaluator it completed at L1, L2, L3, L4 AND L5
      // (47 / 43 / 38 / 38 / 38 frames inside the disc). The ladder made the
      // aided rungs worse still — r4 widens to 6 at L1 and 5 at L2 (params.ts
      // widenRadius; the chain budget against sc-lndc-finish was 21.5 m then and
      // is 22.5 m now, so only the 5 m grace ceiling has ever bound here),
      // reaching x = −1.94 and −0.94, i.e. back into the RIGHT lane the student
      // is supposed to have left.
      //
      // THE RADIUS NOW MEANS THE LANE. r2 compiles to 3.0 / 2.5 / 2.0 / 2.0 /
      // 2.0 across the ladder — every rung inside the 4.0625 m half-pitch (so
      // only the TARGET lane reaches the mark, which is what the old comment
      // claimed and could not deliver) and every rung short of the 3.44 m
      // straddle, by 0.44 m at the widest. Measured on the shipped shadow,
      // which arcs through this mark at x = 5.43–5.86 (closest approach 1.22 m,
      // 33.9 км/ч): it holds 12 / 9 / 7 / 7 / 7 frames inside the compiled disc
      // at L1…L5, where the authored r4 gave it 25 / 21 / 16. `mistake-half-
      // merge` holds ZERO at every rung, and `mistake-blind-spot` never arrives
      // at all (the crash ends it at y = 190, 110 m short).
      //
      // AND THE TITLE NOW CLAIMS ONLY THAT. «пролука» is a gap and no readable
      // field carries one — `stepReachZone` sees one SimTick and never reads
      // even `leadGapM` (a tick carrying 0.2 m of bumper still completes a
      // zone). «решително» is worse: a student who crawls into the same place
      // at 5 км/ч performs the opposite of the lesson and no param can tell.
      // Both go rather than stay as false certificates. Neither is lost: they
      // keep being taught (instruction 5, in capitals) and keep being graded
      // where they always were — LANE_CHANGE_WITHOUT_INDICATOR and
      // POOR_LANE_KEEPING, the two codes this drill's own half-merge demo
      // cites. What replaces them is what the disc now measures: the target
      // lane, in the middle of it, behind the car that has gone by.
      titleBg: "Заеми лявата лента зад отминалата кола, в средата ѝ",
      params: { kind: "reachZone", x: LN_LEFT, y: 300, radiusM: 2 },
    },
    {
      id: "sc-lndc-finish",
      titleBg: "Центрирай се и продължи до края на отсечката",
      params: { kind: "reachZone", x: LN_LEFT, y: 355, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-lndc-glance-mirror", titleBg: "Ляво огледало — прецени колата в съседната лента" },
        { id: "sc-lndc-glance-shoulder", titleBg: "Поглед през рамо в мъртвата зона, преди волана" },
      ],
    },
    parTimeSec: 60,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLnDecisiveChange.ts; the §5 gate (shadow replays with ZERO
  // violations + SAFE_LANE_CHANGE) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ln-decisive-change-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ln-decisive-change/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ln-decisive-change/mistake-blind-spot.trace.json" },
      titleBg: "Престрояване върху колата в мъртвата зона",
      whatWentWrongBg:
        "Водачът погледна в огледалото за обратно виждане, видя „чисто“ и зави наляво — с мигач, но без нито един поглед към лявата мъртва зона. А колата в съседната лента беше точно там, изравнена с него, в единствения сектор, който огледалото не покрива. Огледалото за обратно виждане не е проверка на страничната мъртва зона: чл. 25 иска да се УБЕДИШ, че не застрашаваш движещите се в лентата, а не да предположиш. Огледало и поглед през рамо — и двете, преди волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ln-decisive-change/mistake-half-merge.trace.json" },
      titleBg: "Половинчато вмъкване, което кара другия да спира",
      whatWentWrongBg:
        "Този път водачът се огледа и ВИДЯ колата, изчака я — но после тръгна наляво без мигач и увисна на границата между двете ленти, нито в едната, нито в другата. Половинчатото престрояване е опасно по два начина: без мигач движещият се зад теб не може да предвиди намерението ти, а увисналата насред маркировката кола принуждава водача в съседната лента да гадае и да спира. Престрояването се обявява с мигач и се извършва плавно и решително — в една линия до средата на новата лента (чл. 25).",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "При всяко престрояване в движещ се поток — преди изпреварване, преди ляв завой, при вливане в по-бързата лента. Не когато „изглежда, че има място“, а когато си изчакал и си видял реалната пролука: зад колата, която току-що те отмина, не пред нея.",
    whyBg:
      "Страничните удари в града стават при две грешки, които изглеждат безобидни: хвърляне пред кола в мъртвата зона и половинчато вмъкване, при което две коли делят една лента. Решителността не е агресия — тя е безопасност: колебанието насред маневрата е това, което обърква другите и ги кара да спрат рязко. Изчакай пролуката, обяви я с мигач, провери мъртвата зона през рамо и я заеми в едно плавно движение.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият следи преценката и изпълнението: проверка на огледалото И осезаем поглед през рамо, навременен мигач ПРЕДИ маневрата, избор на реална пролука без да отнемаш предимство, и плавно, решително навлизане до средата на новата лента — без да принуждаваш другите да намаляват. Престрояване без поглед през рамо или без мигач е основна грешка; отрязването на движещ се в лентата — опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: rain + tighter target-lane spacing — a second car AHEAD in the left
    // lane bounds the gap on both ends (stagedAdd LN_TARGET_CAR_AHEAD_L5),
    // while the passing car still defines its back. Deliberately NO
    // physics.wetGrip: the authored ghost envelope is dry-tuned (ADR-006 stage
    // 4a) — the taught delta here is READING a tighter gap through a wet
    // windscreen, not braking distance.
    { level: 5, conditions: { weather: "rain" }, stagedAdd: [LN_TARGET_CAR_AHEAD_L5] },
  ],
  staged: [LN_TARGET_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The wave-8 lane-discipline templates, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_LANES3: readonly ScenarioSpec[] = [SC_LN_DECISIVE_CHANGE];
