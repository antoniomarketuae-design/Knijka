/**
 * Scenario templates — the FOLLOWING & GAP-MANAGEMENT family, S3 batch 3 (doc
 * 72 §9 „Family FO"): two ✅ FULL gradable following archetypes staged on
 * purpose-built straight-street micro-maps, DATA ONLY in the templates.ts mold
 * (coordinates denormalized from the committed district files so nothing loads
 * world JSON at runtime; the trace-gate batteries assert every pinned value
 * against the generated maps):
 *
 *  - sc-follow-distance  „Дистанция на следване"  (FO-01, fo-follow-v1)
 *  - sc-follow-brake     „Внезапно спиране“        (FO-02, fo-brake-v1)
 *
 * Both stage the SHIPPED `brakingLeadCar` kind — a lead car that paces AHEAD in
 * the driver's own lane (positive followGapM, matchPlayer) — and each mistake
 * demo cites SHIPPED rules-catalog codes and grades EXACTLY them when replayed
 * through the production stack (the §5/§9 gates, traces/__tests__/fo-follow-*):
 *   - FO-01 → FOLLOWING_TOO_CLOSE (основна: под 2-секундната дистанция за
 *     скоростта; the 2-second-gap detector). The lead's slam tier is authored
 *     OUT of reach (slamAt far past the road end + minSlamSpeedKmh 250), so the
 *     encounter is pure gap-management: the shadow keeps a safe gap for its
 *     calm speed, the mistakes hold the SAME metric gap at a higher speed —
 *     under 1.3 s → tailgating.
 *   - FO-02 → COLLISION (опасна + прекратяване: rear-end on a lead brake-slam).
 *     The lead paces at a SAFE gap and then slams mid-street; the shadow reacts
 *     in time and stops WITHOUT contact, the two mistakes react late / not at
 *     all and rear-end it. All three approach at the SAME safe gap, so the
 *     collision demos grade ONLY COLLISION (never a following code as well).
 *
 * The maps carry NO crossing, junction, signal or sign; every drive runs
 * ambient traffic ZERO (seed 7): the ONLY actor is the lead car and the ONLY
 * fault the rule engine can grade is the driver's own gap / reaction against it.
 *
 * Family: "following" — the catalog chip added for the FO family (doc 72 §9);
 * the ids (sc-follow-*) match the sc-<family>-<slug> naming standard.
 *
 * Doc-72 provenance: FO-01 and FO-02 are the two "Engine: ✅ FULL" archetypes
 * with a CLEANLY GRADABLE following fault. FO-05 (queue harmonics) is ✅ FULL
 * but LEARN-ONLY (penalty-free — no shadow+2-graded-mistakes mold). Since
 * shipped here beyond the original batch: FO-08 (standstill-gap rule), FO-04
 * (rain-follow config drill), FO-06 (sc-follow-truck — the large-vehicle
 * actor PROFILE: the same brakingLeadCar staged kind with `profile: "truck"`,
 * rendered as the procedural box-truck rig; leadGap detector unchanged), and
 * the FO ACTOR PAIR on ln-v1 (needs the adjacent lane): FO-03 sc-follow-cutin
 * (the cutInLeadCar staged kind + the traffic port's laneShift command —
 * grading fully shipped: FOLLOWING_TOO_CLOSE with the recovery-rate innocence
 * guard) and FO-07 sc-follow-tailgater (the rearTailgater pressure actor,
 * learn-only — the mistakes grade the SHIPPED HARSH_BRAKING_NO_CAUSE /
 * SPEEDING_OVER_LIMIT off the player's own choices).
 */

/**
 * THE BRIEFING BUDGET — 2026-08-16. Every `instructionsBg` step in this file
 * was rewritten so that THE ACT IS THE FIRST WORD and no step exceeds 95
 * characters. The measurement that forced it, the per-character fold table it
 * is derived from and the one thing this lane could not fix are written out in
 * full at the top of `templates-flow.ts`; read that block before lengthening
 * anything here.
 *
 * This file's share of the defect, counted before the rewrite: 35 authored
 * steps, 21 of them past the 95-character band the compact card was sized
 * against, longest 269 characters (sc-follow-rain-gap step 1, 269 ch). On the
 * deployed build a step-1 past ~96 characters leaves ZERO characters of the
 * rest of the briefing above the fold — measured on an iPhone 16 in both
 * orientations, not inferred.
 */

import type {
  BrakingLeadCarSpec,
  CutInLeadCarSpec,
  OncomingStreamSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Wet, l5WetGrip } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated districts by value —
// the L7 pattern; the fo-districts battery asserts the copy matches the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (fo-*-v1). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-follow-distance — „Дистанция на следване" (FO-01) on fo-follow-v1
//    (360 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR on fo-follow-v1: drives the player's own northbound lane
 * (x = 4.06, extraRightOffsetM 0) at its own steady 7.2 m/s ≈ 26 km/h.
 *
 * LEDGER T17 + T18 (doc 86 §2) — WHAT CHANGED AND WHY IT HAD TO.
 *
 * This lead used to be `matchPlayer` with `followGapM: 13`. That command is a
 * rubber band — `target = playerSpeed + 0.55 × (gapM − gap)` has `gap = gapM`
 * as its stable fixed point — so the METRES between the two cars were frozen at
 * 13 whatever the student did. Two consequences, both fatal to the lesson:
 *
 *  T17. `FOLLOWING_TOO_CLOSE` is a TIME gap, so with the metres frozen the
 *  fault was a pure function of the speedometer, and the corrective action this
 *  drill exists to teach — ease off and let the gap grow — was PHYSICALLY
 *  IMPOSSIBLE: the lead slowed to close it again. The founder read this exactly
 *  right from the cockpit ("the truck is seeing what the user car km/h is and
 *  is accelerating proportionally… this is making the truck follow the user
 *  car"). A drill whose taught remedy does not work teaches helplessness.
 *
 *  T18. With `leadGapM = 13 − 4.1 = 8.9` frozen, the fire threshold was
 *  `8.9 / (0.7 × 1.8 / 3.6) = 25.4 km/h` on a street posted 50, under
 *  instructions that say «Карай спокойно». The shipped shadow drove 26 km/h —
 *  0.6 km/h of margin. Founder item 48: „I received an error I have been
 *  tailing him too close and in fact I wasn't". He was not.
 *
 * THE REPAIR, in three numbers:
 *  - `paceMode: "scheduledCruise"` + `paceSpeedMps: 7.2` (Lane 7's seam): the
 *    lead waits at its hold until the player closes to `followGapM + 12` m and
 *    then drives ITS OWN arc at a constant, lawful 25.9 km/h. Back off and the
 *    gap genuinely opens; close in and it genuinely shrinks. The student is now
 *    graded on a quantity they control.
 *  - `hold.offsetM: 40` — the spawn is (4.06, 15) and the edge arc is y, so the
 *    handover gap is 25 m of centres = 20.9 m of bumpers. At the lead's own
 *    26 km/h that is 2.9 s: comfortably over the taught two, which is what the
 *    shadow must be able to demonstrate.
 *  - the fire threshold at that handover gap is `20.9 / 0.35 = 59.7 km/h`,
 *    ABOVE the street's posted 50. So no lawful drive that simply follows can
 *    be convicted; only a driver who chooses to close on the lead can be, which
 *    is precisely чл. 23.
 *  - `followGapM: 22` is now only the release distance (22 + 12 = 34 m ≥ the
 *    25 m handover gap, so the lead pulls away on the player's first movement).
 *
 * The slam tier stays authored OUT of the play corridor (slamAt y = 520 on a
 * 360 m road; minSlamSpeedKmh 250): deterministic moving traffic, not a braking
 * drill.
 *
 * THE TWO MISTAKE DEMOS keep their own pinned clones (scFollowDistanceStaged in
 * traces/scFollowDistance.ts) — a recorded demo is a fixed input tape, and a
 * live lead that reacts to it would turn „лепене" into a rear-end. The clip
 * re-enactment uses the same hook (scFollowDistanceClipStaged +
 * clipStagedOverrideFor in traces/clipReplay.ts).
 */
const FD_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fd-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 48 }, // (4.06, 48) — 33 m of centres ahead of the spawn
    cruiseSpeedMps: 7.2, // 25.9 km/h — a lawful urban pace under the posted 50
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  paceMode: "scheduledCruise", // T17 — the lead drives its own arc, not the player's
  paceSpeedMps: 7.2,
  followGapM: 26, // scheduledCruise: the RELEASE distance is this + 12 = 38 m ≥ the 33 m handover
  maxMatchSpeedMps: 15, // unused under scheduledCruise; kept for the demo clones
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-01 — движение в колона на съобразена дистанция (ЗДвП чл. 23: водачът е
 *  длъжен да спазва достатъчна дистанция до движещото се пред него ППС). */
export const SC_FOLLOW_DISTANCE: ScenarioSpec = {
  id: "sc-follow-distance",
  family: "following",
  tagsBg: ["дистанция", "следване", "движение в колона", "градско каране"],
  titleBg: "Дистанция на следване",
  objectiveBg:
    "Следвай движещата се пред теб кола на дистанция, която ти дава време да спреш — правилото е 2 секунди при сухо време; колкото по-бързо караш, толкова повече метри искат тези 2 секунди.",
  archetypeIds: ["FO-01"],
  conceptIds: ["c-following-distance", "c-stopping-distance-total", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in fo-follow-v1.json meta.scenario.params
    // (tools/maps/gen_fo_follow.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // 206-character step 1: „потегли“ plus a conditional rain clause plus the
    // reason the rain clause exists. The two-second gap — the thing sc-fd-follow
    // actually grades — was buried at step 3 inside 113 characters.
    // 63 ch
    { n: 1, textBg: "Потегли след колата пред теб и остави поне 2 секунди дистанция." },
    // 69 ch
    { n: 2, textBg: "Измери я в секунди: щом предният подмине ориентир, брой „едно-и-две“." },
    // 64 ch
    { n: 3, textBg: "Стигнеш ли ориентира преди „две“ — твърде близо си, вдигни крак." },
    // 61 ch
    { n: 4, textBg: "Помни: 2 секунди са около една дължина кола на всеки 15 км/ч." },
    // 72 ch
    { n: 5, textBg: "Не залепвай, за да „не те засичат“ — по-бързо значи по-голяма дистанция." },
    // 51 ch
    { n: 6, textBg: "Задръж съобразената дистанция до края на отсечката." },
    // SWEEP 161 — A RAIN STEP IN A SCENARIO AUTHORED DRY. This step read
    // «Включи късите светлини в дъжд (чл. 70): мокрото платно гълта светлина.»
    // and was photographed on the L1 briefing card over a dry road in bright
    // daylight (mobile-right/02-briefing.png): `conditions.weather` is "dry" at
    // every rung the student can reach, so the step ordered an act the world
    // gave him no occasion for and spent one of eight lines doing it.
    //
    // THE CAUSE WAS THE RUNG BELOW IT, NOT THE LINE. The lamp duty is real —
    // but only on the rain rung, and this template's L5 was the bare
    // `{ level: 5, conditions: { weather: "rain" } }`: rain with no grip, no
    // complication card and therefore no instructor line naming светлини. That
    // is exactly the hole `l5Wet()` exists to fill (complications.ts: every
    // recipe whose environment sets rain NAMES светлини in its `coachBg`, and
    // `level-complication.test.ts` fails the build if it does not), so the
    // duty moves to the rung where it becomes gradeable and this step goes
    // back to the drill's own dry subject — the gap somebody else takes.
    // 75 ch — «Вдигни», not «Изостани»: the card's ACT_FIRST verb list
    // (briefing-card-budget.test.ts) is the vocabulary the compact card was
    // measured against, and a step that opens outside it reads as a condition.
    { n: 7, textBg: "Вдигни крак отново, ако някой се вклини пред теб — не връщай метрите с газ." },
    // 60 ch
    { n: 8, textBg: "Помни: предният те чете само по фаровете ти в огледалото си." },
  ],
  success: [
    {
      id: "sc-fd-follow",
      /**
       * TITLE-TRUTH + THE MISSING CAP (sweep 161, the D3 census this file was
       * left out of — templates-following2.ts `sc-fbc-read` carries the same
       * repair with its full reasoning).
       *
       * This read «Следвай на съобразена ДИСТАНЦИЯ» over a BARE reachZone: no
       * cap, no gap term, nothing but a coordinate. Photographed convicting and
       * crediting the same driver in the same drive — pc-wrong/04-t038s.png has
       * the chip already advanced to «ЗАДАЧА 2/2» (i.e. this objective ticked)
       * while «Пътнотранспортно произшествие · ОПАСНА ГРЕШКА −10» is on screen,
       * after «Несъобразена дистанция» fired at t = 17 s. A student saw a green
       * tick for the exact skill he had just failed.
       *
       * WHY NOT A GAP PARAM. `stepReachZone(params, prev, tick)` never reads a
       * gap, and the `minLeadGapM`/`minLeadGapSec` gate built for this very
       * family was dropped after two adversarial passes (cdb2f71): a flat metre
       * floor sat above the product's own taught two seconds and its any-frame
       * latch certified a whole tailgating pass off one qualifying frame. A
       * false refusal teaches as hard as a false certificate. So the title says
       * only what the gate can see — and the gate is given something to see.
       *
       * WHAT IT SEES, MEASURED on the three committed recordings at this circle
       * (y = 175 ± 10): the shadow holds 25.9 км/ч for all 56 of its in-zone
       * frames, and BOTH mistake demos hold 47.9 км/ч for all 30 of theirs. The
       * cap 32 is therefore not decoration: it is the first thing in this drill
       * that refuses the two recorded tailgaters, and it clears the shadow by
       * 6.1 км/ч. Posted here is 50, so the ladder's flat 5 км/ч speedometer
       * grace compiles it to 37 at L1 / 34.5 at L2, still under the sign (B58)
       * — which is why the title prints NO number: a title claiming «под 32»
       * over a gate that accepts 37 is the same defect one decimal smaller.
       *
       * The distance is not lost, it is billed where it always was: both
       * mistake demos cite FOLLOWING_TOO_CLOSE and instructions 1–4 teach it.
       */
      titleBg: "Следвай предната кола спокойно",
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10, maxSpeedKmh: 32 },
    },
    {
      id: "sc-fd-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  shadow: { path: "content/traces/sc-follow-distance/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-distance/mistake-tailgate.trace.json" },
      titleBg: "Лепене за предния",
      whatWentWrongBg:
        "Колата се движеше на около 48 км/ч само на половин дължина кола зад предния — под две десети от секундата дистанция. При тази скорост е нужна над десет пъти по-голяма дистанция; толкова близо няма никакъв шанс за спиране, ако предният забави. Несъобразената дистанция е основна грешка.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-distance/mistake-gap-melts.trace.json" },
      titleBg: "Дистанцията се топи с ускоряването",
      whatWentWrongBg:
        "Дистанцията беше добра на спокойни 26 км/ч, но с ускоряването до 48 км/ч същите метри вече значеха под секунда — метрите останаха същите, а нужната дистанция се удвои. Дистанцията се държи в секунди: ускоряваш ли, изостани още. На пътя това се случва точно така: предният си кара с неговата скорост, ти ускоряваш — и разстоянието, което не си пипнал, вече е недостатъчно.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение зад друга кола в града и извън него — в колона, на булевард, по правата отсечка. Дистанцията е първото нещо, което се топи, когато вниманието се отклони.",
    whyBg:
      "Ударът отзад е най-честият тип произшествие. Дистанцията е времето ти за реакция и спиране, ако предният спре внезапно — а при по-висока скорост спирачният път расте квадратично. Двете секунди не са прищявка: те са разстоянието, в което изобщо можеш да реагираш.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи дистанцията през целия маршрут: движение на по-малко от съобразената дистанция е грешка дори без злополука, а „много близка дистанция“ при по-висока скорост се третира като опасно поведение. Дръж поне 2 секунди до предния.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — was a bare `{ level: 5, conditions: { weather: "rain" } }`:
    // rain on the picture, dry tyres under the car, and NO complication card,
    // so the lamp duty had nowhere to be stated and ended up in the dry base
    // briefing instead (see instruction 7). `l5Wet()` is the same rain plus the
    // grip that goes with it plus the instructor's line that names светлини and
    // чистачки — the delta and its explanation authored together.
    l5Wet(),
  ],
  staged: [FD_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-follow-brake — „Внезапно спиране на предния" (FO-02) on fo-brake-v1
//    (420 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR on fo-brake-v1: paces the player's own lane at a SAFE
 * ~27 m ahead (positive followGapM, matchPlayer), then BRAKE-SLAMS when it
 * reaches y = 230 with the player still at cruise (minSlamSpeedKmh 25 — the
 * ~40 km/h approach clears it). The safe pace means the pre-slam gap never
 * trips FOLLOWING_TOO_CLOSE, so the collision demos grade ONLY COLLISION. The
 * shadow reacts and stops within the gap; the two mistakes react late / not
 * at all and rear-end the stopped lead.
 *
 * WHY 27 AND NOT 22 (doc 87 B69 — the drill taught the opposite of what it
 * graded). Instruction 1 of this lesson says, in one sentence: «Движи се
 * спокойно зад предната кола, около 40 км/ч, и дръж поне 2 секунди дистанция.»
 * At `followGapM: 22` the staged lead held **23.1 m of centres = 19.0 m of
 * bumpers invariantly**, which at the 40 км/ч the same sentence asks for is
 * **1.74–1.79 s — 12% UNDER the two seconds it demands**. And the student could
 * not obey both halves: `followGapM` is a DISTANCE and the lead `matchPlayer`s
 * it, re-establishing the same 23 m whatever he did, so the only way to reach
 * 2 s was to drop to ≤34 км/ч — i.e. to disobey «около 40 км/ч» in the same
 * instruction. It was innocent by the detector (`followSafeSeconds 1.8 ×
 * followFireRatio 0.7 = 1.26 s`), which is exactly why nobody had seen it: the
 * demonstration showed a sub-two-second gap and called it the correct approach.
 *
 * The arithmetic: 2 s at 40 км/ч (11.11 m/s) = 22.2 m of BUMPERS; the hero is
 * 4.1 m long, so 26.3 m of CENTRES. 27 would have been enough for ONE drive and
 * not for the lesson: `BrakingLeadCarRunner.arm` seeds the station as
 * `s.followGapM + (rng()·2 − 1)·2`, i.e. **±2 m of per-session jitter**, so a
 * 27 authored against the mean still demonstrates 1.88 s on an unlucky seed and
 * the row would have reopened on somebody else's drive. **29** is the smallest
 * value whose WORST seed clears two seconds: 29 − 2 = 27 m of centres = 22.9 m
 * of bumpers = **2.06 s**, and the luckiest seed gives 2.42 s. The hold moves
 * with it (40 → 45 m along the path = ~30 m ahead of the spawn) so the gap is
 * right from frame zero instead of being converged into over the first seconds
 * — a DEMONSTRATION is judged by what it shows, including at the start.
 *
 * The slam point (y = 230) is the LEAD's own position and is untouched, so the
 * two pinned COLLISION demos still rear-end the stopped lead: they drive to
 * fixed absolute y (238 / 244) past a lead that stops in the same place it
 * always did. Re-checked against `fo-follow-brake-traces.test.ts` and both
 * committed traces.
 */
const FB_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fb-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn (B69)
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 29, // pace ~29 m AHEAD — ≥2 s at the ~40 km/h approach on EVERY seed (B69)
  maxMatchSpeedMps: 13, // 47 km/h — holds the gap at the ~40 km/h cruise
  slamAt: { x: 4.06, y: 230 }, // the staged brake-slam point, mid-street
  slamRadiusM: 3,
  slamDecelMps2: 6.5, // a hard emergency slam
  /**
   * SWEEP 161 — THE DRILL'S OWN EVENT WAS GATED BEHIND A SPEED THE CAUTIOUS
   * LEARNER NEVER REACHES, AND 25 WAS THAT SPEED.
   *
   * The runner fires on `reachedSlamPoint && (speedKmh >= minSlamSpeedKmh ||
   * playerGap <= proximityFallbackM)` (runners.ts). Photographed on the careful
   * drive of this very lesson: pc-right ran 11 км/ч from t = 1 s to the 205 s
   * harness cap, the lead sat ~40 m ahead still rolling, and the brake-slam
   * NEVER FIRED — «Внезапно спиране на предния» presented no sudden stop, the
   * skill it names was never exercised, and the drive simply ran out of clock
   * (pc-right/04-t205s.png). The lesson is authored for the beginner rung; the
   * beginner is exactly the driver 25 км/ч locks out.
   *
   * 8 IS THE PRODUCT'S OWN LINE FOR „THIS CAR IS STOPPED" — `objectives.ts`
   * REACH_ZONE_HALT_CAP_KMH, the cap under which a waypoint stops being a flow
   * envelope and becomes «спри тук». Below it there is no drive to interrupt
   * and a slam is noise; above it there is, and the lesson is the same lesson
   * at a lower speed — this lead is `matchPlayer`, so it paces at the student's
   * own pace and a slam from 11 км/ч is a car in front stopping in front of
   * him, which is the entire subject. The gap is not the limiting factor at any
   * of these speeds: `followGapM` 29 of centres = 24.9 m of bumpers, which at
   * 11 км/ч (3.05 m/s) is 8.2 s of headway against a 6.5 m/s² slam.
   *
   * TRACE-NEUTRAL, AND CHECKED RATHER THAN ASSUMED. Measured on all three
   * committed recordings (traces/scFollowBrake.ts): each clears 8 км/ч at
   * t = 1.0 s (y = 16.2) and 25 км/ч at t = 3.1 s (y = 26.1), while the lead
   * only reaches y = 230 once the player is at ~y = 201, doing 39.9. So the
   * BINDING condition in that conjunction is `reachedSlamPoint` on every one of
   * them, and moving the other side of the `||` between 8 and 25 changes
   * nothing they do; `fo-follow-brake-traces.test.ts` re-asserts the recordings
   * byte-for-byte.
   */
  minSlamSpeedKmh: 8,
  proximityFallbackM: 0.5,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-02 — реакция при внезапно спиране на предния (ЗДвП чл. 23: достатъчната
 *  дистанция е именно тази, която позволява спиране, ако предният спре рязко). */
export const SC_FOLLOW_BRAKE: ScenarioSpec = {
  id: "sc-follow-brake",
  family: "following",
  tagsBg: ["дистанция", "аварийно спиране", "реакция", "удар отзад"],
  titleBg: "Внезапно спиране на предния",
  objectiveBg:
    "Следвай предната кола на дистанция, която ти позволява да спреш — и когато тя спре внезапно, реагирай навреме и спри напълно, без да я удариш отзад.",
  archetypeIds: ["FO-02"],
  conceptIds: ["c-following-distance", "c-reaction-time", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in fo-brake-v1.json meta.scenario.params.
    params: { lengthM: 420, maxspeedKmh: 50 },
    districtId: "fo-brake-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // STEP 1 IS DELIBERATELY UNTOUCHED, and it is the one step in these five files
    // that may not be re-worded freely: vehicle/tier-feasibility.test.ts pins
    // „sc-follow-brake [beginner] instruction 1: orders 40, sustainable 39.1“ as a
    // KNOWN shortfall, keyed by the instruction INDEX. Moving the imperative or
    // the number to another step silently re-labels that row and the pin goes red
    // against a defect that has not changed. It is 84 characters — inside the
    // budget — so there is nothing to fix here anyway.
    // …AND IT IS THE ONE LINE IN THESE FILES THAT COSTS THE BODY SOMETHING.
    // 84 characters puts the line in the 77–96 bucket, where the measurement
    // (brief-budget.mjs, both profiles) leaves only 68 characters of body above
    // the fold. Step 2 is therefore held to 65 + the „2. “ prefix, and the
    // reason it exists is step 3 — one line further down, still whole, still
    // authored. A 74-character step 2 here was the single case in all 33
    // templates where the second instruction did not survive the card.
    // 84 ch
    { n: 1, textBg: "Движи се спокойно зад предната кола, около 40 км/ч, и дръж поне 2 секунди дистанция." },
    // 58 ch
    { n: 2, textBg: "Гледай далеч напред — през и над предния, не в бронята му." },
    // 47 ch
    { n: 3, textBg: "Помни: така усещаш спирането възможно най-рано." },
    // 71 ch
    { n: 4, textBg: "Натисни пълна спирачка, ако предният спре внезапно — без волан встрани." },
    // 69 ch
    { n: 5, textBg: "Помни: дистанцията е точно разстоянието, в което имаш време да спреш." },
    // 65 ch
    { n: 6, textBg: "Спри напълно зад предния, изчакай и продължи, когато той потегли." },
  ],
  success: [
    {
      id: "sc-fb-approach",
      /**
       * TITLE-TRUTH (sweep 161). «Следвай СПОКОЙНО преди спирането» over a bare
       * reachZone at y = 120 — no cap, no gap term. Photographed ticked on the
       * WRONG drive (pc-wrong/04-t028s.png: the chip reads «ЗАДАЧА 2/2» with
       * four dangerous errors already on the sheet, the collision among them),
       * because both mistake demos take the same lawful 40 км/ч line past this
       * circle and only diverge 110 m later at the slam.
       *
       * AND A CAP CANNOT RESCUE IT HERE, which is why this row is a rename and
       * `sc-fd-follow` next door is not. Instruction 1 orders «около 40 км/ч»
       * and the street is posted 50; measured at this circle, the shadow holds
       * 39.9 км/ч for all 44 of its in-zone frames and so do both mistakes. Any
       * cap that clears the drill's own instructed pace is ≥ 40, compiles to
       * ≥ 45 at L1, prints «не по-бързо от 45» on the gate bar of a 50 street —
       * and still refuses nobody. A number that refuses nobody is not a check;
       * it is a second false certificate wearing a decimal.
       *
       * So the claim goes and the place stays. The following distance keeps its
       * grader — instruction 1 teaches the two seconds and FOLLOWING_TOO_CLOSE
       * bills it — and the STOP this drill is actually about is graded by the
       * staged encounter (`sc-fb-lead`, minSlamSpeedKmh above), which the two
       * COLLISION demos fail on the spot.
       */
      titleBg: "Стигни ориентира преди спирането",
      params: { kind: "reachZone", x: LANE_X, y: 120, radiusM: 12 },
    },
    {
      id: "sc-fb-finish",
      // «Продължи СЛЕД СПИРАНЕТО до края» asserted the stop happened; the gate
      // is a plain arrival at y = 390 and never asked. Same census row, one
      // objective later — trimmed to what it measures, matching every other
      // finish gate in this file. Nothing about `done` moves: params untouched.
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 390, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-brake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-brake/mistake-late-reaction.trace.json" },
      titleBg: "Закъсняла реакция",
      whatWentWrongBg:
        "Дистанцията беше добра, но реакцията закъсня — колата продължи напред секунда и половина, преди спирачката да задейства, и това стигна, за да удари спрелия отпред. При внезапно спиране всяка десета от секундата е метри: гледай далеч напред и реагирай веднага.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-brake/mistake-no-reaction.trace.json" },
      titleBg: "Без реакция — челен удар отзад",
      whatWentWrongBg:
        "Вниманието се отклони и предният спря незабелязано — колата така и не намали и се вряза в спрелия отпред. Дори перфектната дистанция не помага, ако очите не са на пътя: наблюдението изпреварва спирачката.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато следваш друга кола — предният може да спре внезапно за пешеходец, за спрял автомобил, за дупка, която ти не виждаш. Точно затова дистанцията съществува.",
    whyBg:
      "Ударът отзад при внезапно спиране е сред най-честите градски произшествия. Дистанцията ти дава време за реакция, а времето за реакция е това, което превръща едно рязко спиране пред теб в спокойно спиране, а не в удар. Гледаш далеч напред, за да го видиш рано.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият очаква съобразена дистанция и навременна реакция при спиране на движението пред теб. Удар в предната кола е пътнотранспортно произшествие — на изпита това прекратява изпита незабавно.",
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
  staged: [FB_LEAD_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-follow-standstill — „Дистанция при спиране в колона" (FO-08) on
//    fo-follow-v1 (reuses the 360 m straight street, limit 50)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-follow-standstill — the car that ARRIVES at the
 * back of the column, which the student has been following the whole way.
 *
 * B70 / FR-51 (founder item 40, doc 87). His sentence has two halves and only
 * one of them was answered. „the column is waiting at the end of the road" was
 * met by staging a real column (FS_QUEUE_AHEAD below). The other half —
 * **„the user just drives and nothing much happens until the very end"** —
 * was left open, and the register kept it open in its own words: *„nothing was
 * authored between spawn and the queue"*. It was not a matter of taste.
 * Measured on the shipped shadow: the drill's first THIRTY SECONDS are 266 m
 * of empty tarmac with the lead gap running 270.9 → 37.7 m and no other object
 * in the world. Thirty seconds of nothing, then one judgement, then the end.
 *
 * So the queue tail is no longer a prop parked at y = 290 with `armDistM: 3`
 * (a value chosen precisely so it could never move). It starts 33 m ahead of
 * the spawn, is released by the player's own first movement, drives its own
 * arc under T17's scheduled cruise with the B72 `paceProfile` varying it, eases
 * as the standing column comes into view, rolls up to the back of it and stops
 * — AT y = 290, the same metre it used to be parked at.
 *
 * WHY THE FINAL METRE IS THE DESIGN CONSTRAINT. Everything this drill grades
 * hangs off that number: the standstill gap is `290 − playerY − 4.1`, the
 * credited rest zone is y = 281 and the two mistake demos convict at y = 284.7.
 * The last two legs exist to land it there deterministically — 2.2 m/s from
 * arc 250 (a queue-speed roll, ~8 km/h) and 0 from arc 289.5, whose 4.5 m/s²
 * ramp costs 2.2²/(2×4.5) = 0.54 m of overshoot. Measured rest: y = 290.0.
 * The lesson's subject is unchanged; what changed is that the student now
 * spends the approach doing чл. 23 instead of waiting.
 *
 * The slam fields stay inert (`minSlamSpeedKmh 250`, `slamAt` past the road
 * end): this is deterministic moving traffic that comes to rest, not a braking
 * drill — the brake-slam belongs to sc-follow-brake and grading it here would
 * import a second subject.
 */
const FS_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fs-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 48 }, // (4.06, 48) — 33 m of centres ahead of the spawn
    cruiseSpeedMps: 5.6, // 20.2 km/h — a calm urban pace under the posted 50
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  paceMode: "scheduledCruise", // T17 — the lead drives its own arc, not the player's
  paceSpeedMps: 5.6,
  // B72 / FR-53 — the ease-and-resume that makes the 250 m before the queue a
  // following exercise, then the two legs that park it at the back of the
  // column. Arc metres are district y on this street.
  paceProfile: [
    { atS: 110, speedMps: 4.0 }, // 14.4 km/h — eases; the gap you were holding shrinks
    { atS: 150, speedMps: 6.0 }, // 21.6 km/h — and opens again, on its own business
    { atS: 215, speedMps: 4.4 }, // 15.8 km/h — the standing column is in view now
    { atS: 250, speedMps: 2.2 }, //  7.9 km/h — rolling up to the back of it
    { atS: 289.5, speedMps: 0 }, // the queue tail comes to rest at y = 290.0
  ],
  followGapM: 26, // scheduledCruise: the RELEASE distance is this + 12 = 38 m ≥ the 33 m handover
  maxMatchSpeedMps: 12, // unused under scheduledCruise
  slamAt: { x: 4.06, y: 520 }, // far past the road — the slam tier is inert
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250,
  proximityFallbackM: 0.3,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * B70 (founder, doc 87): „the column is waiting at the end of the road". He was
 * describing ONE car. The drill is called «Дистанция при спиране в КОЛОНА», its
 * objective names a колона and its instructions say the traffic ahead has
 * stopped in one — and the map staged a single vehicle standing by itself, so
 * the word „колона" was a claim the world did not keep. A queue of one is a
 * parked car.
 *
 * Two more standing vehicles ahead of the tail, spaced so a real stopped queue's
 * ≈ 3 m of clear tarmac sits between every pair of bumpers (the centres follow
 * from the bodies — see the sweep-161 block below, which re-spaced them when
 * they stopped being two more cars). `armDistM: 3` means they would only begin
 * to pace on bumper contact, i.e. never — so the column the tail rolls up to is
 * a fixed, fully deterministic backdrop and the graded standstill gap is still
 * measured against the tail's y = 290 rest pose.
 *
 * FR-51 note, because this comment used to say the opposite: these two are
 * mounted through `LevelSpec.stagedAdd` and are STILL invisible to the trace
 * recorder (it reads `spec.staged`), but the three committed recordings are no
 * longer byte-identical to their old selves — `spec.staged`'s own member, the
 * tail, is the thing that changed, so all three were re-recorded with the
 * approach they now depict.
 *
 * SWEEP 161 — THE COLUMN WAS STAGED AND COULD NOT BE SEEN, WHICH IS THE SAME
 * DEFECT B70 FIXED, ONE LAYER DOWN.
 *
 * The audit photographed the drill twice — pc-right/05-stopped.png and again at
 * t = 156 s, 25 m from the tail — and read the same thing off both: „the
 * player's lane holds a single vehicle roughly 40 m ahead, with nothing behind
 * it". The two props were there. They were behind the tail's roofline.
 *
 * THE ARITHMETIC, because „it looks empty" is not a bug report. Three 1.45 m
 * cars nose-to-tail on ONE straight lane, seen from a cockpit eye ~1.2 m up,
 * with the tail at rest at y = 290 and the student stopped at y = 281 — 25 m of
 * eye-to-roof. The sight line over the tail's roof climbs 0.25/25 = 0.010 m per
 * metre, so at the second car (y = 297, 32 m out) it is already at 1.52 m and at
 * the third (y = 304) at 1.59 m. Both roofs are 1.45 m. **Every car behind the
 * first was fully occluded, at every distance the drill is driven from** — the
 * lesson said «колона», the world staged a колона, and the cockpit rendered one
 * car. A lateral stagger cannot fix it either: 0.45 m of offset at 32 m is
 * 0.35° of sliver against the tail's own 2.1° silhouette.
 *
 * HEIGHT IS THE ONLY AXIS THAT CLEARS THE ROOFLINE, so the column is now what a
 * real stopped urban queue is — mixed: a panel van (the kargo_v rig, 5.2 m by
 * the length table) and behind it the box truck this catalogue already renders
 * for FO-06, whose own spec block records it as 7.5 × 2.4 × **3.1 m**. Against
 * the 1.59 m sight line computed above, that box stands 1.5 m clear at y = 307
 * — not a sliver, a silhouette. The van's rig height is a GLB this lane did not
 * measure, so it is not being claimed here; it is the truck that carries the
 * proof, and the van is the middle depth cue between them.
 *
 * Nothing about the grading moves — they are still props at `armDistM: 3` (arm
 * only on bumper contact, i.e. never), the graded standstill gap is still
 * measured against the TAIL's y = 290 rest pose, and `staged` — the only field
 * the trace recorder reads — is untouched.
 *
 * RE-SPACED FOR THE NEW LENGTHS, keeping the ≈ 3 m of clear tarmac a stopped
 * queue holds: tail (4.1 m) at 290 → van at 298 is 8 − 2.05 − 2.6 = 3.35 m of
 * clear air; van → truck at 307 is 9 − 2.6 − 3.75 = 2.65 m. Leaving them at the
 * old 7 m centres would have put 0.65 m between the van and the truck.
 */
const FS_QUEUE_AHEAD: BrakingLeadCarSpec[] = [
  { offsetM: 298, profile: "van" as const },
  { offsetM: 307, profile: "truck" as const },
].map(({ offsetM, profile }, i) => ({
  id: `sc-fs-queue-${i + 1}`,
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM },
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0,
    colorIndex: 3 + i,
    profile, // the roofline that makes the column a column — see the block above
  },
  followGapM: 14,
  maxMatchSpeedMps: 12,
  slamAt: { x: 4.06, y: 520 },
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250,
  proximityFallbackM: 0.3,
  // FR-51: these two are STILL PROPS and are written out in full rather than
  // spread from FS_LEAD_CAR, because the tail is no longer inert and spreading
  // it would hand the standing column the arriving car's scheduled cruise —
  // the whole column would drive off up the street. `armDistM: 3` means they
  // would only arm on bumper contact, i.e. never.
  armDistM: 3,
  triggersHazard: false,
  resumeAfterSec: 3,
}));

/** FO-08 — дистанция при пълно спиране в колона (ЗДвП чл. 23: дори при спиране
 *  се държи достатъчно разстояние до движещото се/спрялото пред теб ППС). */
export const SC_FOLLOW_STANDSTILL: ScenarioSpec = {
  id: "sc-follow-standstill",
  family: "following",
  tagsBg: ["дистанция", "спиране в колона", "движение в колона", "разстояние при спиране"],
  titleBg: "Дистанция при спиране в колона",
  objectiveBg:
    "Спри зад колата пред теб в колона с разумно разстояние — колкото да виждаш къде задните ѝ гуми опират в пътя (около два метра). Така имаш място за маневра и резерв, ако предният се върне назад.",
  archetypeIds: ["FO-08"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Step 4 was 204 characters: the stopping distance, the way to judge it and
    // two separate reasons for it. The act (stop two metres back) is now its own
    // step and each reason follows it.
    // 65 ch
    { n: 1, textBg: "Потегли след колата пред теб и я следвай на съобразена дистанция." },
    // 62 ch
    { n: 2, textBg: "Намалявай с нея веднага и връщай дистанцията плавно, не с газ." },
    // 65 ch
    { n: 3, textBg: "Помни: тя намалява и ускорява по своя си работа, а не заради теб." },
    // 71 ch
    { n: 4, textBg: "Гледай напред: там стои спряла колона и предният ще се нареди последен." },
    // 75 ch
    { n: 5, textBg: "Спри зад него на около два метра — колкото да виждаш къде гумите му опират." },
    // 74 ch
    { n: 6, textBg: "Помни: толкова стигат, за да заобиколиш и ако предният се върне по наклон." },
    // 68 ch
    { n: 7, textBg: "Изчакай спокойно зад него на тази дистанция до края на упражнението." },
  ],
  success: [
    {
      id: "sc-fs-approach",
      titleBg: "Следвай спокойно преди спирането",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 12 },
    },
    {
      id: "sc-fs-stopped",
      titleBg: "Спри зад колоната на разумно разстояние",
      /**
       * SWEEP 161 — «СПРИ … НА РАЗУМНО РАЗСТОЯНИЕ» AND THE GATE MEASURED
       * NEITHER WORD. This is the D3 census arm, and unlike its five siblings
       * in this file the claim here IS expressible, because this lead has a
       * deterministic resting place: `FS_LEAD_CAR`'s last `paceProfile` leg
       * parks it at y = 290.0 and every graded number on this drill hangs off
       * that metre. It simply was not being asked.
       *
       * MEASURED, by replaying the three committed recordings through
       * `stepObjective` on the compiled params (the probe is now
       * `__tests__/following-claim-gates.test.ts`). At `maxSpeedKmh: 6`:
       *
       *   drive                 ticked at   doing      distance to the queue
       *   shadow-correct        y = 273.0   6.0 км/ч   17 m — still rolling
       *   mistake-bumper-kiss   y = 278.4   6.0 км/ч   ticked, then hit 1.24 m
       *   mistake-creep-up      y = 273.0   6.0 км/ч   ticked, then crept in
       *
       * All three. „Спри" ticked green at 6 км/ч seventeen metres short of a
       * queue nobody had stopped behind yet — because `capMet` asks
       * `speedKmh <= cap` and a car rolling AT the cap satisfies it, and
       * `reached` latches off the authored disc's near edge (y = 281 − 8).
       * Rolling through at exactly the cap is not stopping, and the drill's own
       * `mistake-bumper-kiss` — whose copy reads «под метър и половина
       * разстояние» — was carrying the green tick for it.
       *
       * TWO CHANGES, ONE PER WORD OF THE TITLE.
       *  · «СПРИ» ⇒ `maxSpeedKmh: 1` = `STOPPED_SPEED_KMH` (objectives.ts), the
       *    product's own standstill line — the same number `halted` is tested
       *    against one branch away, so the word in the title now means exactly
       *    what the evaluator already means by „stopped". Still ≤
       *    REACH_ZONE_HALT_CAP_KMH, so it is still a HALT DEMAND: the grace
       *    capsule keeps crediting a student who comes to rest SHORT of the
       *    mark, at every rung, and the ladder never widens it (widenSpeedCap
       *    returns early under the halt cap — compiled 1 at L1 through L5).
       *    NOT the catalogue's other halt convention (cdb2f71 gave `sc-edpr-b2`
       *    a 3), because 3 is the defect one decimal smaller: this row's whole
       *    finding is that a car rolling AT the cap was credited with stopping,
       *    and 6 was refusing nobody for exactly that reason. The hero does not
       *    idle-creep (vehicle/difficulty.ts's „creep" is a throttle ceiling,
       *    not a torque), and all three recordings sit at 0.0 км/ч at rest, so
       *    1 is reachable by lifting off as well as by braking.
       *    NOTE for the guidance lane: `RouteGuidance.capLineBg` will render
       *    this as «спри — под 1 км/ч». Correct, and clumsier than it needs to
       *    be — a cap equal to the standstill constant could read «спри
       *    напълно». That string is not this lane's file.
       *  · «НА РАЗУМНО РАЗСТОЯНИЕ» ⇒ `acceptBeforeMarkM: -2.9`. The radius-8
       *    disc accepted out to y = 289 while the lead's REAR BUMPER is at
       *    290 − 2.05 = 287.95 — it reached 1.05 m past the car it claims to
       *    measure against. The taught gap is «около два метра» of bumpers, so
       *    the closest lawful rest pose is 290 − 2.05 − 2.05 − 2.0 = 283.9 and
       *    the mark sits 2.9 m short of it ⇒ −2.9 (NEGATIVE per B18/FR-24: the
       *    paint is AHEAD of the mark). Alone this parameter changes nothing —
       *    the latch fires on the way in, long before the far side matters —
       *    which is exactly why the cap has to come with it.
       *
       * RE-MEASURED with both in place, at every rung L1–L5:
       *   shadow-correct       ✓ done at y = 280.95, AT REST, 4.9 m of bumpers
       *                          behind the tail — the pose the copy describes
       *   mistake-bumper-kiss  ✗ REFUSED: it never drops under 6 км/ч until it
       *                          is at rest at y = 284.66, which is past the
       *                          2 m boundary. The tick it used to get is gone.
       *   mistake-creep-up     ✓ done at y = 280.95 — and rightly: it DID stop
       *                          at the reasonable distance and held it 2.5 s.
       *                          Its fault is the creep afterwards, a latched
       *                          waypoint cannot un-tick, and it does not have
       *                          to: STANDSTILL_GAP_TOO_CLOSE bills that creep
       *                          at y = 284.7 and the debrief says so.
       */
      params: {
        kind: "reachZone",
        x: LANE_X,
        y: 281,
        radiusM: 8,
        maxSpeedKmh: 1,
        acceptBeforeMarkM: -2.9,
      },
    },
  ],
  // FR-51: the approach is a following exercise now, not 235 m at 30 km/h down
  // an empty street — the shadow takes 71.7 s where it used to take 42.5.
  rubric: { parTimeSec: 100 },
  shadow: { path: "content/traces/sc-follow-standstill/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-standstill/mistake-bumper-kiss.trace.json" },
      titleBg: "Залепване за бронята при спиране",
      whatWentWrongBg:
        "Колата спря почти опряна в бронята на предната — под метър и половина разстояние. Толкова близо не виждаш гумите на предния, нямаш накъде да маневрираш и рискуваш удар, ако той се върне назад по наклон. При спиране в колона остави поне колкото да виждаш къде гумите му опират в пътя.",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-standstill/mistake-creep-up.trace.json" },
      titleBg: "Пълзене напред до бронята",
      whatWentWrongBg:
        "Колата спря на разумно разстояние, но после запълзя напред и се залепи за предната — „да не остане дупка“. Дистанцията при спиране не е дупка за запълване: тя е твоят резерв за маневра и за наклона. Спри веднъж на разумно място и стой там.",
      codeRefs: ["STANDSTILL_GAP_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато спираш зад друга кола — на светофар, на знак, в колона. Разстоянието при спиране е също толкова важно, колкото и в движение, а най-често се пренебрегва точно на спрелия автомобил.",
    whyBg:
      "Разумната дистанция при спиране ти оставя изход: място да заобиколиш, ако предният аварира или изгасне, и резерв, ако се върне назад по наклон. Залепването за бронята премахва всеки от тези изходи и превръща една дребна ситуация в удар. Правилото „да виждаш гумите на предния“ пази точно този резерв.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи разстоянието и при спиране: спиране прекалено близо до предната кола е второстепенна грешка. Спри така, че да виждаш къде задните ѝ гуми опират в пътя — това е достатъчно разстояние за маневра и за наклона.",
  },
  // B70: the rest of the column rides on every played rung (stagedAdd), so the
  // student meets a queue instead of one parked car, while `staged` — the only
  // field the trace recorder reads — stays exactly as recorded.
  levels: [
    { level: 1, stagedAdd: FS_QUEUE_AHEAD },
    { level: 2, stagedAdd: FS_QUEUE_AHEAD },
    { level: 3, stagedAdd: FS_QUEUE_AHEAD },
    { level: 4, vehicleStart: "cold", stagedAdd: FS_QUEUE_AHEAD },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  staged: [FS_LEAD_CAR],
  /**
   * FR-B5-QUEUE (doc 87 item 7 — his item 40). THE DRILL WAS UNSURVIVABLE AT
   * ITS OWN NOMINAL SPEED, AND SILENT WHILE IT KILLED YOU.
   *
   * Measured on this template before anything was changed, by driving the lane
   * at the staged lead's own cruise (20 km/h) without lifting:
   *
   *   t=13 lead 27.5 m · t=35 15.4 · t=39 10.8 · t=41 8.6 · t=43 2.7 · t=45 0.0
   *   rule events for the whole run: `+CLEAN_DRIVING@46.5`,
   *                                  `STANDSTILL_GAP_TOO_CLOSE@54.2`
   *
   * Not one distance fault, at any point, on a drive that ends inside the
   * queue — and a COMMENDATION on the way in. The founder's live version of the
   * same drive is the result screen «20 наказателни точки · НЕИЗДЪРЖАН ·
   * Опасни 2 · Основни 0 · Второстепенни 0»: he failed, twice, and was never
   * told what he did wrong. Under doc 64 THEO-4 that is the graver half.
   *
   * THE CHOICE, MADE AND WRITTEN DOWN. The register offered two: a gentler
   * final leg, or a closing-rate detector. This is the detector, for three
   * reasons and in that order.
   *
   *  1. A gentler leg makes this drill easier; it does not make it TEACH. The
   *     screenshot's defect is «Основни 0 · Второстепенни 0», and softening
   *     `paceProfile` leaves that exactly in place for the next student who
   *     closes one metre per second faster. The instrument is the fix; the
   *     tuning is a workaround for the missing instrument.
   *  2. The 20 km/h `followMinSpeedKmh` floor is RIGHT and stays. The register
   *     said so and the measurement agrees: this drill's subject is a queue at
   *     8 km/h, and grading a formation-rolling queue on distance is the
   *     genre's classic trust-killer. A closing-rate test is orthogonal to the
   *     floor — it asks whether the gap is COLLAPSING, which a formation queue's
   *     never is, so nothing that was innocent becomes guilty.
   *  3. The leg cannot be re-timed from this lane anyway. `FS_LEAD_CAR`'s final
   *     metre (rest at y = 290.0) is the constant every graded number here
   *     hangs off, and all three committed recordings under `content/traces/`
   *     depict it. Moving it means re-recording content this lane does not own,
   *     which is how a "curriculum call" becomes a cross-lane content change at
   *     two in the morning. The detector needs no trace to move.
   *
   * The drill is passable by someone driving it correctly BECAUSE the fire line
   * is the taught gap itself and only while it is shrinking: the shadow — which
   * slows with the lead, as instruction 2 says — never reaches it (the trace
   * gate re-asserts that), and the non-lifting drive is now told, with the
   * measured seconds in the card, while it still has room to stop.
   */
  ruleConfig: { leadClosingEnabled: true },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-follow-rain-gap — „Дистанция в дъжд" (FO-04) on fo-follow-v1 (reuses the
//    360 m straight street, limit 50) — the config-gated wet-following drill.
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-follow-rain-gap: drives the player's lane at its
 * own steady 7 m/s ≈ 25 km/h from 33 m of centres ahead of the spawn.
 *
 * LEDGER T17 + T18 (doc 86 §2) — THE WORST MEASURED CASE IN THIS FILE, and it
 * is not one the ledger listed.
 *
 * The rig used to be `matchPlayer` with `followGapM: 23` from a hold only 15 m
 * ahead of the spawn. The band opens the gap toward 23 m, but the player's car
 * out-accelerates the staged actor, so the gap DIPS on the way there. Measured
 * on the committed shadow through the production stack, the minimum time gap
 * was **1.30 s** — against a base fire line of 1.26 s (followSafeSeconds 1.8 ×
 * followFireRatio 0.7) and a WET fire line of 2.02 s (× followRainSecondsFactor
 * 1.6, which THIS template opts into). The demonstrated-correct drive of a
 * lesson that teaches «дръж поне 3 секунди при мокър път» was holding 1.30 s and
 * escaping conviction only because the dip was shorter than followSustainSec.
 * A student who reproduced the shadow a beat less tidily was billed for it —
 * founder item 48, in the drill least able to afford it.
 *
 * THE REPAIR: `paceMode: "scheduledCruise"` + `paceSpeedMps: 7` (25.2 km/h, the
 * pace the shadow drives) and `hold.offsetM: 48` — 33 m of centres = 28.9 m of
 * bumpers at handover, 4.1 s at 25 km/h. Both fire lines are cleared with room,
 * the taught 3 s is something the shadow can actually SHOW, and easing off now
 * opens the gap instead of dragging the lead back.
 *
 * Rides the config-gated FOLLOWING_TOO_CLOSE_FOR_RAIN detector (enabled
 * per-lesson; see rules/types.ts). Both mistake demos keep PINNED clones of the
 * historical 23 m rig (scFollowRainGapStaged) — they are recorded tapes.
 */
const FR_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-fr-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 48 }, // (4.06, 48) — 33 m of centres ahead of the spawn
    cruiseSpeedMps: 7, // 25.2 km/h — the calm wet pace the shadow drives
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  paceMode: "scheduledCruise", // T17 — the lead drives its own arc, not the player's
  paceSpeedMps: 7,
  followGapM: 26, // scheduledCruise: the RELEASE distance is this + 12 = 38 m ≥ the 33 m handover
  maxMatchSpeedMps: 13, // unused under scheduledCruise; kept for the demo clones
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-04 — увеличена дистанция при дъжд (ЗДвП чл. 23: дистанцията се съобразява
 *  с условията — при мокър път спирачният път нараства и 2-секундното правило
 *  става 3 и повече). */
export const SC_FOLLOW_RAIN_GAP: ScenarioSpec = {
  id: "sc-follow-rain-gap",
  family: "following",
  tagsBg: ["дистанция", "дъжд", "мокър път", "следване"],
  titleBg: "Дистанция в дъжд",
  objectiveBg:
    "Следвай колата пред теб в дъжд с УВЕЛИЧЕНА дистанция — при мокър път спирачният път нараства около един и половина пъти, затова правилото за 2 секунди става 3 и повече. Същите метри при по-висока скорост вече не стигат.",
  archetypeIds: ["FO-04"],
  conceptIds: ["c-following-distance", "c-rain-aquaplaning", "c-stopping-distance-total"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // 269 characters of step 1 — the longest in this file — and the act it exists
    // for („потегли“) was the LAST word of it. Rain is this template's own
    // environment at every rung, not a ladder complication, so the lamp step
    // stays first: it is the first thing the hands do. Ledger L10 reads it.
    // 71 ch
    // РЪЧНО is load-bearing and stays: the daytime running lamps come on by
    // themselves and leave the tail lamps dark, which is the whole point of the
    // step below it.
    { n: 1, textBg: "Включи късите светлини РЪЧНО — вали (чл. 70) — и потегли след предния." },
    // 69 ch
    { n: 2, textBg: "Дръж поне 3 секунди до предния — брой „едно-и-две-и-три“ по ориентир." },
    // 76 ch
    { n: 3, textBg: "Помни: дневните светят само напред и оставят габаритите ти тъмни в пръските." },
    // 81 ch
    { n: 4, textBg: "Увеличи дистанцията в дъжд: същите метри при по-висока скорост са по-малко време." },
    // 78 ch
    { n: 5, textBg: "Не карай „както при сухо“ — на мокро спирачният път е около половина по-дълъг." },
    // 50 ch
    { n: 6, textBg: "Задръж увеличената дистанция до края на отсечката." },
  ],
  success: [
    {
      id: "sc-fr-follow",
      /**
       * TITLE-TRUTH (sweep 161; the D3 census, same repair as `sc-fd-follow`).
       * This read «Следвай с увеличена за дъжда ДИСТАНЦИЯ» and the old comment
       * next to it said the split out loud — „the gap grading is the rule
       * engine's job". The HUD then printed the actual criterion underneath the
       * claim: pc-right/01-arrival.png shows the objective card reading
       * «Следвай с увеличена за дъжда дистанция — ДРЪЖ ПОД 35 КМ/Ч». A title
       * naming a distance over a criterion that is a speedometer reading is the
       * defect in one screenshot: two cars cross this circle at the same 30
       * км/ч, one at four seconds of headway and one at one, and both tick.
       *
       * So the title now claims only the calm the cap can prove. Measured at
       * this circle (y = 175 ± 10) on the committed recordings: the shadow holds
       * 24.9 км/ч for all 58 of its in-zone frames; `mistake-dry-habit` holds
       * 39.9 and `mistake-gap-melts` 38.5–39.9 for all 36 of theirs, so the cap
       * refuses both. No number in the title, deliberately — 30 authored is 35
       * on the L1 card (the ladder's 5 км/ч grace, bounded by the posted 50).
       *
       * The rain distance keeps its grader: this drill opts the
       * FOLLOWING_TOO_CLOSE_FOR_RAIN detector in (`ruleConfig` below), both
       * mistake demos cite it, and instruction 2 teaches the three seconds.
       */
      titleBg: "Следвай спокойно в дъжда",
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-fr-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-rain-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-rain-gap/mistake-dry-habit.trace.json" },
      titleBg: "Дистанция „за сухо“ в дъжд",
      whatWentWrongBg:
        "Валеше, а колата следваше предната на 40 км/ч само на около метри — дистанция, добра за сухо, но твърде малка за мокър път. На мокро спирачният път е с около половина по-дълъг, а секундата и половина дистанция не стига. В дъжд дръж 3 и повече секунди.",
      codeRefs: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-rain-gap/mistake-gap-melts.trace.json" },
      titleBg: "Дистанцията се топи с ускоряването",
      whatWentWrongBg:
        "На спокойни 25 км/ч дистанцията беше добра дори за дъжда, но с ускоряването до 40 км/ч същите метри вече значеха под две секунди — а на мокро трябват три. Метрите останаха същите, нужната дистанция порасна: ускоряваш ли в дъжд, изостани още.",
      codeRefs: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
    },
  ],
  teach: {
    whenBg:
      "При всеки дъжд, мокър път, сняг или лапавица. Дистанцията, която те пази при сухо, не стига на мокро — точно тогава, когато и без това е по-трудно да спреш.",
    whyBg:
      "На мокър път гумите зацепват по-слабо и спирачният път нараства около един и половина пъти. Двете секунди, които стигат при сухо, се превръщат в удар при дъжд — затова правилото става 3 и повече секунди. Дистанцията е единственото, което купуваш предварително срещу по-дългото спиране.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият очаква съобразена с условията дистанция: при дъжд и мокър път — осезаемо по-голяма, отколкото при сухо. Близка дистанция в дъжд се отчита като несъобразена — увеличи разстоянието до предния.",
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
  staged: [FR_LEAD_CAR],
  conditions: { weather: "rain" },
  // The rain-following detector is default-OFF (the exam bot holds a fixed
  // time-gap in rain and dry alike); this drill opts it in so the LIVE session
  // grades a student who keeps a dry-habit gap in the wet, matching the shadow.
  ruleConfig: { followRainAwareEnabled: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-follow-truck — „Зад камион" (FO-06) on fo-follow-v1 (reuses the 360 m
//    straight street, limit 50) — the large-vehicle actor-profile scenario.
// ---------------------------------------------------------------------------

/**
 * The staged LEAD TRUCK for sc-follow-truck: the SAME brakingLeadCar staged
 * kind as FO-01, with `profile: "truck"` — the doc 72 FO-06 unlock ("box
 * truck visual on the vehicle actor; leadGap detector unchanged"). Unlike
 * FO-01's car the lead is a 7.5 × 2.4 × 3.1 m box truck that blocks ALL
 * forward vision: the gap must buy the sight line you lost.
 *
 * LEDGER T17 + T18 (doc 86 §2), with an arithmetic CORRECTION to the ledger.
 *
 * The ledger's T18 table put this drill's graded gap at 12.9 m (fires above
 * 36.9 km/h), computed with the legacy flat 4.1 m subtrahend. That is no longer
 * the arithmetic: `bumperSubtrahendM` (traffic/system.ts, landed with T17(e))
 * now charges a truck its real half-length, `max(4.1, 2.05 + 3.75) = 5.8`. So
 * the pinned 17 m of centres was **11.2 m of bumpers, firing above 32.0 km/h** —
 * and this drill's own success gate caps the approach at **30 km/h**. The
 * obedient student drove 1.4 m from a conviction that the instructions
 * («дръж поне 3 секунди») say he is nowhere near. Meanwhile the copy asks for
 * 3 s, which at 20 km/h is 16.7 m — the drill was handing him 11.2.
 *
 * THE REPAIR mirrors sc-follow-distance:
 *  - `paceMode: "scheduledCruise"` + `paceSpeedMps: 5.6` (20.2 km/h): the truck
 *    drives its own arc at the pace the shadow demonstrates, so easing off
 *    genuinely opens the gap instead of making the truck ease off too;
 *  - `hold.offsetM: 45` — 30 m of centres from the (4.06, 15) spawn = 24.2 m of
 *    bumpers at handover, which is 4.4 s at 20 km/h (the copy asks 3) and puts
 *    the fire threshold at 69.1 km/h, above the street's posted 50;
 *  - `followGapM: 26` is now only the release distance (26 + 12 = 38 ≥ 30).
 *
 * The slam tier stays out of reach (slamAt past the road end, minSlamSpeedKmh
 * 250) — deterministic moving traffic, not a braking drill. The two mistake
 * demos keep PINNED clones of the historical 17 m rig (scFollowTruckStaged in
 * traces/scFollowTruck.ts): a recorded tape needs a lead that holds station.
 */
const FT_LEAD_TRUCK: BrakingLeadCarSpec = {
  id: "sc-ft-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // (4.06, 45) — 30 m of centres ahead of the spawn
    cruiseSpeedMps: 5.6, // 20.2 km/h — the calm blocked-vision pace the shadow drives
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
    profile: "truck", // FO-06: the box-truck rig — vision blocked
  },
  paceMode: "scheduledCruise", // T17 — the truck drives its own arc, not the player's
  paceSpeedMps: 5.6,
  // B72 / FR-53 — THE EASE AND RESUME. T17's single `paceSpeedMps` cured the
  // rubber band and, in the founder's own terms, made the drill worse: driven
  // and measured on 2026-08-03 the truck held 20.1–20.2 km/h over 341 samples
  // (sd 0.2) for the whole 360 m — «very boring», a metronome. The gap the
  // shadow keeps drifted 22.4 → 25.8 m across FIFTY-FIVE SECONDS at a constant
  // 19.9 km/h: nothing to read, nothing to do, a distance you set once.
  //
  // These four legs are the „slows a bit, speeds a bit" he asked for, keyed to
  // the ROAD (arc metres = district y here) and never to him — which is the
  // whole point: the reason the gap changes is visibly the truck's business,
  // so the student learns to read the box instead of the speedometer. The
  // first ease is the deep one (5.6 → 3.6 m/s = 20.2 → 13.0 km/h) because the
  // lesson is that you cannot see WHY a truck brakes; the second is softer.
  // Both resumes overshoot the base slightly so the gap the student re-opened
  // is handed back rather than banked.
  paceProfile: [
    { atS: 120, speedMps: 3.6 }, // 13.0 km/h — eases for something you cannot see past it
    { atS: 160, speedMps: 5.9 }, // 21.2 km/h — and picks back up, without warning either
    { atS: 235, speedMps: 4.3 }, // 15.5 km/h — a second, softer ease
    { atS: 275, speedMps: 6.1 }, // 22.0 km/h — pulls away over the closing stretch
  ],
  followGapM: 26, // scheduledCruise: the RELEASE distance is this + 12 = 38 m ≥ the 30 m handover
  maxMatchSpeedMps: 15, // unused under scheduledCruise; kept for the demo clones
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The ONCOMING counter-flow of sc-follow-truck (founder R3 #42, doc 62 —
 * „nothing stops you overtaking; the stay-behind has no taught reason"): six
 * cars southbound on the oncoming bank make overtaking the truck VISIBLY
 * insane — you cannot see past the box AND the opposite lane is occupied.
 * PRESSURE SCENERY under the learn-only policy (the runner emits nothing but
 * a contact collision; fo-follow-v1 carries no overtake-corridor data, so no
 * new grading path opens — the drill's graded fault stays FOLLOWING_TOO_CLOSE
 * and the shadow/mistake codes are unchanged). In INSTANT-CRUISE terms (the
 * OVG_STREAM note: a released car accelerating at the staged 2.6 m/s² loses
 * v²/2a ≈ 12.3 m against an instant clock at 8 m/s, so holds sit 12.3 m
 * lower): head instant-model y = 137, five more at +45 m headways (≈ 5.6 s —
 * every window far under an overtake around a 7.5 m truck). Against the
 * shadow's ~7 m/s follow (closing ≈ 15 m/s) the parade streams past from
 * t ≈ 8 s to t ≈ 23 s — bracketing the graded follow zone (y = 175); the
 * final stretch after the flow clears is where the drill already ends.
 * Hold feasibility: Σ gaps 225 ≤ head hold arc 235.3 (cars stay on-path).
 */
const FT_ONCOMING: OncomingStreamSpec = {
  id: "sc-ft-oncoming",
  kind: "oncomingStream",
  libraryEventId: "FO-06",
  actor: {
    pathNodes: ["fo-n-end", "fo-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 235.3 }, // y = 124.7 ⇒ instant model y 137
    cruiseSpeedMps: 8,
    colorIndex: 1,
  },
  count: 6,
  // `gapsM[i-1]` is the EXTRA hold arc of car i **vs car 0** (OncomingStreamSpec
  // — the runner does `hold.offsetM - gapsM[i-1]`, it does not accumulate). It
  // was authored as five repeated 45s, so cars 1-5 all resolved to the SAME arc
  // and stood in ONE spot: driven on 2026-08-03, the census read five vehicles
  // stacked at y = 169.7 and the „rolling counter-column" was a head plus a
  // clump that went by 2 s apart. Cumulative values are what every other stream
  // in the codebase authors (templates-merging [26,52], templates-parking2
  // [40,80]) and what this block's own arithmetic already assumed — «hold y
  // 169.7 … 349.7» and «Σ gaps 225 ≤ head hold arc 235.3».
  gapsM: [45, 90, 135, 180, 225], // hold y 169.7 / 214.7 / 259.7 / 304.7 / 349.7
  releaseKmh: 3,
};

/** FO-06 — следване зад камион със закрит обзор (ЗДвП чл. 23: дистанцията се
 *  съобразява и с видимостта — зад висок камион тя е нулева напред, затова
 *  дистанцията е по-голяма, не по-малка). */
export const SC_FOLLOW_TRUCK: ScenarioSpec = {
  id: "sc-follow-truck",
  family: "following",
  tagsBg: ["дистанция", "камион", "закрит обзор", "следване"],
  titleBg: "Зад камион",
  objectiveBg:
    "Следвай камиона пред теб на УВЕЛИЧЕНА дистанция — той закрива целия ти обзор напред и единственото, което виждаш, е неговата задна врата. Дистанцията купува видимостта, която камионът ти отне: дръж поне 3 секунди.",
  archetypeIds: ["FO-06"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-stopping-distance-total"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // 241-character step 1. The lamp clause keeps its place (rain is authored on
    // the template) but loses the 130-character explanation of itself, which is
    // now the last step — after the acts, where a reason belongs.
    // SWEEP 161 — the conditional lamp clause goes with step 8's spray cloud
    // (see there): this template is authored dry at every rung the student can
    // reach, and the rain rung now carries its own lamp line through `l5Wet()`.
    // 75 ch
    { n: 1, textBg: "Потегли спокойно зад камиона и остави разстояние, от което го виждаш целия." },
    // 69 ch
    { n: 2, textBg: "Дръж поне 3 секунди до камиона — брой „едно-и-две-и-три“ по ориентир." },
    // 84 ch
    { n: 3, textBg: "Помни: зад висок камион не виждаш нито пешеходци, нито спрели коли, нито защо спира." },
    // 74 ch
    { n: 4, textBg: "Не мисли за изпреварване — насрещното е заето, а зад камиона не го виждаш." },
    // 69 ch
    { n: 5, textBg: "Приеми, че оставането зад камиона тук е единственото разумно решение." },
    // 80 ch
    { n: 6, textBg: "Не се доближавай, „за да виждаш“ — колкото по-близо си, толкова ПО-МАЛКО виждаш." },
    // 50 ch
    { n: 7, textBg: "Задръж увеличената дистанция до края на отсечката." },
    // SWEEP 161 — CONDITIONS THE DRY SCENARIO DOES NOT HAVE. This step read
    // «Помни: в облака пръски габаритите ти са единственото, което те показва
    // отзад.» and was photographed on the L1 briefing over a dry road in bright
    // daylight (pc-right/01-arrival.png). There is no spray cloud: `conditions.
    // weather` is "dry" here and at L1–L4, and the step spent one of eight
    // lines describing weather the student was not in. Same cause as
    // sc-follow-distance step 7 — a rain rung with no complication card to put
    // the lamp duty on, now fixed at the rung (see `levels` below).
    //
    // What replaces it is the dry drill's own unteachable half: a student who
    // cannot see past the box also cannot be seen by the driver of it, and the
    // mirror test is the one rule that makes that checkable from the cockpit.
    // 70 ch
    { n: 8, textBg: "Помни: не виждаш ли огледалата на камиона, и шофьорът му не вижда теб." },
  ],
  success: [
    {
      id: "sc-ft-follow",
      /**
       * TITLE-TRUTH (sweep 161; the D3 census — `sc-fd-follow` carries the full
       * reasoning). «Следвай камиона с увеличена ДИСТАНЦИЯ» over a place and a
       * speed cap, and the HUD printed the split for the auditor to photograph:
       * pc-wrong/04-t018s.png reads «Следвай камиона с увеличена дистанция —
       * ДРЪЖ ПОД 35 КМ/Ч». Nothing measured the gap to the truck, which the
       * objectiveBg one screen earlier calls the entire skill.
       *
       * Measured at this circle (y = 175 ± 10): the shadow holds 20.8 км/ч for
       * all 70 of its in-zone frames; BOTH mistake demos hold 47.9 for all 30 of
       * theirs, so the cap refuses both. 30 authored compiles to 35 at L1 — the
       * number the card prints, and the reason the title prints none.
       *
       * The gap keeps its grader, and on this drill it needed one more thing to
       * be able to fire at all: `ruleConfig.followMinSpeedKmh` 10 below, without
       * which FOLLOWING_TOO_CLOSE was structurally silent at this lead's own
       * authored pace. Both mistake demos cite it; instruction 2 teaches it.
       */
      titleBg: "Следвай камиона спокойно",
      params: { kind: "reachZone", x: LANE_X, y: 175, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-ft-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 95 },
  /**
   * THE DRILL COULD NOT GRADE ITS OWN SUBJECT — measured 2026-08-04, drive-rig,
   * sc-follow-truck@L1, a closed-loop steady 20 km/h for 58 s.
   *
   * `followMinSpeedKmh` defaults to 20 (rules/types.ts) and exists for a good
   * reason: queue traffic legitimately rolls at 15–20 km/h with one-second gaps,
   * and grading that spams the genre's classic false positive (A12). But THIS
   * drill authors a lead that cruises at `paceSpeedMps` 5.6 m/s = **20.16 km/h**
   * and instructs the student to follow it. A student who obeys sits at
   * 19.6–20.2 km/h — ON the floor — and B72's first ease takes the truck to
   * 3.6 m/s = **12.96 km/h**, dragging the obedient student 7 km/h UNDER it.
   *
   * So `FOLLOWING_TOO_CLOSE` — this lesson's entire subject, the code both of
   * its mistake demos cite — was structurally unable to fire in the student's
   * own drive. Measured on that drive: the bumper gap fell 21.5 → **1.09 m
   * (0.20 s of headway)** at t = 27.7 s and stayed under 1.2 s of headway for
   * 16 s, INCLUDING the whole of the graded zone at y = 175, and the engine
   * said nothing. The first and only feedback the student got was a COLLISION
   * at t = 47.3 s. Meanwhile the mistake demo teaches the fault at 48 km/h,
   * where the floor is not in the way — the lesson demonstrates a fault it
   * cannot detect in the drive it then asks you to make.
   *
   * 10 km/h is chosen, not defaulted: it keeps genuine stop-and-go (a queue
   * roll, the standstill drill's own subject) exempt while covering the entire
   * band this lead is ever authored to drive — its slowest leg is 12.96 km/h.
   * Opt-in per the ruleConfig discipline: no other lesson's floor moves, and
   * `sc-follow-standstill` deliberately keeps the default, because a queue at
   * 8 km/h with a short gap is what THAT drill is about.
   */
  ruleConfig: { followMinSpeedKmh: 10 },
  shadow: { path: "content/traces/sc-follow-truck/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-truck/mistake-tailgate.trace.json" },
      titleBg: "Залепен зад камиона",
      whatWentWrongBg:
        "Колата се движеше на 48 км/ч на около една секунда зад камиона — при нулева видимост напред. Ако камионът спре рязко заради нещо, което ти не можеш да видиш, нямаш нито време, нито място: при закрит обзор дистанцията се увеличава, не се топи. Несъобразената дистанция е основна грешка.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-truck/mistake-peek.trace.json" },
      titleBg: "Доближаване „за да виждаш“",
      whatWentWrongBg:
        "Дистанцията беше добра, но колата ускори и се залепи зад камиона — уж за да „надникне“ напред. Точно обратното се случи: колкото по-близо до високата задна врата, толкова по-малко път се вижда и толкова по-малко време остава за реакция. Изостани — видимостта зад камион се купува само с дистанция.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато пред теб се движи камион, автобус или бус — в града, на булевард, на изхода от кръстовище. Високото превозно средство закрива всичко: пешеходци, светофари, спирачни светлини на колоните напред.",
    whyBg:
      "Зад камион губиш най-ценния си инструмент — погледа далеч напред. Не виждаш ЗАЩО камионът ще спре, затова научаваш за спирането едва от неговите стопове — със закъснение. Единственото, което връща това време, е по-голямата дистанция: тя е видимостта, която камионът ти отне.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият следи дистанцията особено внимателно зад високи превозни средства: близка дистанция при закрит обзор се третира като несъобразена. Дръж поне 3 секунди зад камион и не се доближавай, за да „виждаш по-добре“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — камион + дъжд, the spray-blind rung. Was a bare
    // `{ level: 5, conditions: { weather: "rain" } }`: rain on the picture, dry
    // tyres under the car and no complication card, so the lamp duty it implies
    // had nowhere to be said and had been written into the DRY base briefing
    // instead (old steps 1 and 8). `l5Wet()` carries rain + wetGrip + the
    // instructor's line that names светлини and чистачки.
    l5Wet(),
  ],
  staged: [FT_LEAD_TRUCK, FT_ONCOMING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-follow-cutin — „Вклиняване" (FO-03) on ln-v1 (the 400 m 2+2 boulevard,
//    limit 50 — reused: the cut-in needs an adjacent lane to cut FROM). The
//    FOLLOWING family's actor pair, part 1: the cut-in actor recipe.
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario; pinned by value — L7). */
const CUT_RIGHT = 12.19;
/** One drawn lane width on ln-v1 (3.25 m × perceptual scale 2.5), m — the
 *  laneShift distance between the two northbound lane centers. */
const CUT_LANE_SHIFT = 8.125;

/**
 * The staged CUT-IN CAR on ln-v1: paces the player from the LEFT lane
 * (extraRightOffsetM −8.125 → x ≈ 4.06) pinned ~12 m of centers ahead
 * (matchPlayer — slaved to the player's own progress), then at y = 150 locks
 * a plain 11 m/s cruise and laneShift-glides one lane RIGHT over 1.5 s,
 * landing in the player's lane ~8 m of bumpers ahead at ~40 km/h — the stolen
 * cushion (~0.7 s where 2 s belong). GRADING IS FULLY SHIPPED (doc 72 FO-03):
 * the recovery-rate guard keeps the stolen-gap phase innocent while the
 * driver lifts and re-opens it; HOLDING it grades exactly FOLLOWING_TOO_CLOSE.
 * The post-cut cruise is deliberately NOT matchPlayer — the player's lift
 * must genuinely rebuild the gap, and a panic-slam stays unbilled because the
 * cut-in itself is a forward cause in the harsh-brake ledger (A12, honest).
 */
const FC_CUTTER: CutInLeadCarSpec = {
  id: "sc-fc-cutter",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 30 }, // dormant ~15 m ahead-left of the spawn
    cruiseSpeedMps: 11,
    extraRightOffsetM: -CUT_LANE_SHIFT, // the LEFT lane (x ≈ 4.06)
    colorIndex: 1,
  },
  paceAheadM: 12, // ~12 m of centers ahead in the adjacent lane (± jitter)
  maxMatchSpeedMps: 15,
  cutAt: { x: 4.0625, y: 150 }, // on the ACTOR's (left-lane) path, mid-street
  cutRadiusM: 4,
  /**
   * SWEEP 161 — THE CUT-IN NEVER HAPPENED, AND THE DRILL AWARDED THREE STARS
   * FOR IT. Photographed across the whole 189 s right drive: the staged car
   * held station in the LEFT lane at the same screen position at t = 34, 87,
   * 130 and 189 s and never moved across (pc-right/04-t189s.png). The runner
   * fires on `(distToCut <= cutRadiusM || actorPastCutM > 0) && speedKmh >=
   * minCutSpeedKmh` (runners.ts); that drive ran 6–12 км/ч and 25 locked it out
   * of its own lesson.
   *
   * WHY 15 AND NOT 5. This floor is not a formality — below some speed the cut
   * is not a THEFT and staging it would teach a fiction. The manoeuvre lands the
   * actor `paceAheadM` 12 m of centres ahead = 7.9 m of bumpers, and 7.9 m IS
   * the taught two seconds at exactly 3.95 m/s = **14.2 км/ч**. Under that, the
   * cut-in leaves the student MORE than the cushion the lesson says was stolen,
   * the teach card would name a theft the geometry did not commit, and the
   * remedy («вдигни крак и остави дистанцията да се отвори») would be performed
   * by arithmetic rather than by him. 15 is the smallest whole number above
   * that line — so the gate now refuses only drives the encounter cannot be
   * honest about, instead of refusing two thirds of the beginners.
   *
   * WHAT THIS DOES NOT FIX, and must not be mistaken for fixing: the 6–12 км/ч
   * drive is still refused the event, and it was still credited ИЗДЪРЖАН with
   * three stars and +150 XP off three position gates. The runner ALREADY
   * reports that honestly — it resolves `notEncountered` once the player is 70 m
   * past the cut point (CUTIN_MISSED_PAST_M) — but no objective kind in
   * `lessons/objectives.ts` can consume a staged outcome other than
   * `emergencyStop`'s `stoppedInTime`, so the report has nowhere to land. The
   * credit half of this row is handled below (`sc-fc-rebuild`) as far as a
   * title can handle it, and named in the lane report as the objective-kind
   * change it actually needs.
   *
   * TRACE-NEUTRAL, measured on all three committed recordings: each clears
   * 25 км/ч at t = 3.1 s (y = 26.1) and is doing 29.1 / 39.9 / 44.2 км/ч when
   * the actor reaches its cut point at y = 150. The binding condition on every
   * recording is the geometry, not this number, so moving it between 15 and 25
   * changes nothing they do.
   */
  minCutSpeedKmh: 15,
  cutShiftM: CUT_LANE_SHIFT, // one lane RIGHT — into the player's lane
  cutRampSec: 1.5,
  cutSpeedMps: 11, // ~40 km/h locked cruise — the player's lift re-opens the gap
  clearAheadM: 45,
};

/** FO-03 — вклиняване и възстановяване на дистанцията (ЗДвП чл. 23: дистанцията
 *  се възстановява спокойно — открадната възглавница не се задържа). */
export const SC_FOLLOW_CUTIN: ScenarioSpec = {
  id: "sc-follow-cutin",
  family: "following",
  tagsBg: ["вклиняване", "дистанция", "възстановяване", "спокойна реакция"],
  titleBg: "Вклиняване",
  objectiveBg:
    "Кола от съседната лента се вклинява на метри пред теб и открадва 2-секундната ти дистанция — без ти да си виновен. Умението, което се оценява: възстанови възглавницата спокойно — вдигни газта и изостани, без да задържаш открадната дистанция и без наказваща спирачка.",
  archetypeIds: ["FO-03"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-reaction-time"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ln-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Nothing here was over 100 characters; the fault was ORDER. Step 2 opened
    // with the other driver's manoeuvre and step 5 with its own precondition.
    // 64 ch
    { n: 1, textBg: "Потегли по булеварда в дясната лента и наблюдавай колата отляво." },
    // 69 ch
    { n: 2, textBg: "Очаквай тя да се вклини на метри пред теб — това се случва всеки ден." },
    // 84 ch
    { n: 3, textBg: "Реагирай с газта, не със спирачката — вдигни крак и остави дистанцията да се отвори." },
    // 86 ch
    { n: 4, textBg: "Не затваряй дистанцията „за наказание“ и не я задържай „по инерция“ — двете са лепене." },
    // 73 ch
    { n: 5, textBg: "Продължи спокойно до края, щом възглавницата от 2 секунди е възстановена." },
  ],
  success: [
    {
      id: "sc-fc-approach",
      titleBg: "Установи се спокойно преди вклиняването",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 110, radiusM: 10 },
    },
    {
      id: "sc-fc-rebuild",
      /**
       * TITLE-TRUTH (sweep 161) — and this is the row the whole census exists
       * for, because one frame contains both halves of it. pc-wrong/04-t017s.png
       * carries a GREEN TICK against «Възстанови дистанцията след вклиняването»
       * at the same instant the engine's own teach card, three centimetres
       * below it, reads «Дистанция в момента: 0,0 с (0 м) — дръж поне 2 с.»
       * The tick is a position gate with a speed cap; the number beside it is
       * the truth, and they were both on screen, disagreeing.
       *
       * `stepReachZone` cannot see a gap and the `minLeadGapM` gate built for
       * this family was dropped for producing false refusals (cdb2f71), so the
       * claim goes and the cap keeps what it can prove. Measured at this circle
       * (y = 235 ± 10): the shadow holds 28.0 км/ч for all 52 of its in-zone
       * frames — the lifted-throttle posture — while `mistake-hold-gap` holds
       * 39.9 and `mistake-squeeze` 40.1 for all 36 of theirs, so the cap 34
       * refuses both recorded ways of keeping the stolen cushion.
       *
       * The rebuild keeps its grader: both mistake demos cite
       * FOLLOWING_TOO_CLOSE, the runtime's recovery-rate guard keeps the honest
       * lift innocent while the gap re-opens, and instructions 3–5 teach it.
       */
      titleBg: "Продължи спокойно след вклиняването",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 235, radiusM: 10, maxSpeedKmh: 34 },
    },
    {
      id: "sc-fc-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 340, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-follow-cutin/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-cutin/mistake-hold-gap.trace.json" },
      titleBg: "Лепене по инерция",
      whatWentWrongBg:
        "Колата се вклини на метри отпред, а водачът просто продължи с непроменена скорост — под секунда дистанция на 40 км/ч, километър след километър. Вклиняването не е по твоя вина, но задържането на открадната дистанция вече е: това е лепене като всяко друго. Вдигни газта и остави възглавницата да се възстанови.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-cutin/mistake-squeeze.trace.json" },
      titleBg: "Затваряне „за наказание“",
      whatWentWrongBg:
        "Вместо да отстъпи, водачът ускори след вклинилия се и затвори дистанцията още повече — броени метри броня в броня на 45 км/ч. „Наказателното“ лепене не връща нищо: то само залепя два автомобила без никакво време за реакция. Дистанцията се възстановява назад, не напред.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки булевард с две и повече ленти в посока: пред отбивки, преди завои, на всяко пренареждане. Вклиняването е ежедневие — въпросът не е дали ще ти се случи, а какво правиш в първите две секунди след него.",
    whyBg:
      "Открадната дистанция е най-честият невинен път към удар отзад: ти не си сгрешил, но караш с 0,7 секунди възглавница. Инстинктите предлагат две грешки — да не отстъпиш (лепене) или да набиеш спирачка (капан за движещия се зад теб). Правилният рефлекс е третият: вдигната газ и търпение — дистанцията се връща за секунди без нито едно рязко движение.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият гледа реакцията, не вклиняването: плавно вдигане на газта и възстановена дистанция е точното поведение; задържането на къса дистанция след вклиняване се отчита като несъобразена дистанция, а рязката спирачка без причина — като създаване на предпоставка за удар.",
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
  staged: [FC_CUTTER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-follow-tailgater — „Лепка отзад" (FO-07) on ln-v1 (reused 400 m 2+2
//    boulevard) — the FOLLOWING family's actor pair, part 2: the rear actor.
// ---------------------------------------------------------------------------

/**
 * The FRONT LEAD for sc-follow-tailgater: a constant-speed cruiser far ahead —
 * the shipped brakingLeadCar kind with the followGapM-ABOVE-ACTUAL trick
 * (followGapM 150 against an ~80 m real gap keeps the matchPlayer target
 * permanently above the cap, so the lead cruises at a CONSTANT 11.5 m/s and
 * never tracks the player). That constancy is the point: when the player
 * eases off, the FRONT gap genuinely grows — the taught FO-07 response made
 * visible on the leadGap telemetry — and at the mistake's brake-check moment
 * the lead sits ~90 m of bumpers ahead, far outside the harsh-brake ledger's
 * 45 m cause window (the slam has NO forward cause, honestly). The slam tier
 * is authored out of reach (slamAt past the road end, minSlamSpeedKmh 250).
 */
const FTG_LEAD: BrakingLeadCarSpec = {
  id: "sc-ftg-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 110 }, // dormant ~95 m ahead of the spawn
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound right, x ≈ 12.19)
    colorIndex: 2,
  },
  followGapM: 150, // ABOVE the real ~95 m gap → target always over the cap…
  maxMatchSpeedMps: 11.5, // …so the lead cruises at a constant 11.5 m/s (~41 km/h)
  slamAt: { x: 12.19, y: 520 }, // far past the 400 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap ≥ ~50 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The staged TAILGATER on ln-v1: released once the player pulls ~20 m ahead,
 * it matchPlayer-paces a NEGATIVE gap — ~9 m of centers (≈ 5 m of bumpers)
 * BEHIND the player in their OWN lane, the „лепка" pose (the emergencyApproach
 * rear-sync precedent without the offset path; playerGuard off — see the
 * RearTailgaterSpec doc, safety is the proportional law + a 12 m/s² decel cap
 * that out-brakes any player slam). PRESSURE SCENERY: the runner emits ZERO
 * events (learn-only policy, doc 72 FO-07) — the graded surfaces are the
 * player's own choices: the brake-check grades the SHIPPED
 * HARSH_BRAKING_NO_CAUSE (a rear car is not a forward cause), guilty speeding
 * grades SPEEDING_OVER_LIMIT, and the taught ease-off shows up as the growing
 * front gap. After ~12 s of pressure it laneShift-passes on the left.
 */
const FTG_TAILGATER: RearTailgaterSpec = {
  id: "sc-ftg-tail",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant ~13 m behind the spawn
    cruiseSpeedMps: 14,
    extraRightOffsetM: 0, // the player's OWN lane
    colorIndex: 3,
  },
  releaseGapM: 20,
  followBehindM: 9, // ~9 m of centers ≈ 5 m of bumpers — glued (± jitter)
  maxMatchSpeedMps: 18, // 65 km/h — the pressure keeps up even with a speeder
  pressureSec: 12,
  passShiftM: -CUT_LANE_SHIFT, // the pass runs one lane LEFT
  passSpeedMps: 17,
  passAheadM: 25,
  easeKmh: 8,
  // FR-56 — his lesson 44: „the car behind that is sticking to the user car is
  // sticking very late, it must be sticking much earlier." THIS is the drill
  // that teaches being tailgated, so this is where the rolling start belongs.
  // Set here rather than in the runner because eleven other templates borrow
  // `rearTailgater` as generic passing scenery, and making it unconditional
  // re-timed three of them out of their own choreography.
  rollingStart: true,
};

/** FO-07 — лепка отзад (ЗДвП чл. 23 — дистанцията НАПРЕД се увеличава, за да
 *  поеме и грешката на движещия се отзад; чл. 20, ал. 1 — водачът е длъжен да
 *  контролира превозното средство, а не да „възпитава“ със спирачката). */
export const SC_FOLLOW_TAILGATER: ScenarioSpec = {
  id: "sc-follow-tailgater",
  family: "following",
  tagsBg: ["лепка отзад", "дистанция", "спокойна реакция", "пропускане"],
  titleBg: "Лепка отзад",
  objectiveBg:
    "Агресивна кола се лепи на метри зад теб. Правилният отговор няма нищо общо с нея: вдигни газта, увеличи дистанцията НАПРЕД и я остави да те изпревари. Спирачният удар „за урок“ е точно обратното — предпоставка за удар отзад, в който пострадалият си ти.",
  archetypeIds: ["FO-07"],
  conceptIds: ["c-following-distance", "c-safety-space", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ln-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Step 2 stated a fact and a prohibition in 117 characters; the prohibition
    // is the instruction, so it gets its own step. Step 3 did the same with an
    // act and its reason.
    // 71 ch
    { n: 1, textBg: "Потегли по булеварда в дясната лента и се установи на спокойна скорост." },
    // 56 ch
    { n: 2, textBg: "Погледни в огледалото: кола е залепена на метри зад теб." },
    // 66 ch
    { n: 3, textBg: "Не решавай това със спирачка — не е приятно, но не е твой проблем." },
    // 49 ch
    { n: 4, textBg: "Вдигни газта плавно и увеличи дистанцията НАПРЕД." },
    // 62 ch
    { n: 5, textBg: "Помни: тя поема и твоето спиране, и грешката на лепката отзад." },
    // 83 ch
    { n: 6, textBg: "Не ускорявай гузно и не натискай спирачката „за урок“ — двете влошават положението." },
    // 80 ch
    { n: 7, textBg: "Дръж десния край на лентата и я остави да те изпревари — после продължи до края." },
  ],
  success: [
    {
      id: "sc-ftg-ease",
      /**
       * TITLE-TRUTH (sweep 161). «Успокой темпото И УВЕЛИЧИ ДИСТАНЦИЯТА НАПРЕД»
       * over a place and a speed cap — photographed as the card
       * «Успокой темпото и увеличи дистанцията напред — дръж под 41 км/ч»
       * (pc-right/01-arrival.png). The forward gap it names was never measured
       * and neither was any easing of the pressure from behind.
       *
       * HALF THIS TITLE WAS ALWAYS TRUE, so only the other half goes. A cap IS
       * a pace measurement, and on this drill it is the taught response itself:
       * `FTG_LEAD` cruises a constant 11.5 m/s = 41.4 км/ч, so a student held
       * under 36 is by construction one whose FRONT gap is opening. Measured at
       * this circle (y = 200 ± 10): the shadow holds 28.0 км/ч for all 51 of its
       * in-zone frames; `mistake-speed-up` holds 57.9 for all 25 of its and is
       * refused. (`mistake-brake-check` is not — it stands still in the zone, at
       * 0–33.4 км/ч over 118 frames; its fault is HARSH_BRAKING_NO_CAUSE and the
       * rule engine bills it. A cap cannot see a brake check and this title no
       * longer implies one is being watched.)
       *
       * The forward distance keeps its teaching in instructions 4–5 and its
       * evidence on the leadGap telemetry; what it does not keep is a green tick
       * that certified it.
       */
      titleBg: "Успокой темпото",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 200, radiusM: 10, maxSpeedKmh: 36 },
    },
    {
      id: "sc-ftg-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: CUT_RIGHT, y: 340, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-follow-tailgater/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-follow-tailgater/mistake-brake-check.trace.json" },
      titleBg: "Спирачен удар „за урок“",
      whatWentWrongBg:
        "С лепка на метри отзад водачът наби спирачките до дупка на празна улица — „да се научи“. Пред колата няма абсолютно нищо: това е рязко спиране без причина, което сам подготвя удара отзад и по закон е точно създаване на предпоставка за ПТП. Спирачката не е възпитателно средство — дистанцията напред е.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-follow-tailgater/mistake-speed-up.trace.json" },
      titleBg: "Гузно ускоряване",
      whatWentWrongBg:
        "Заради натиска отзад водачът вдигна над 55 км/ч в ограничение 50 — „да не пречи“. Лепката просто дойде със скоростта, а нарушението остана за теб: ограничението не се предоговаря от огледалото. Скоростта не решава лепката — решава я увеличената дистанция напред и пропускането.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато някой се залепи отзад — на булевард, по тъмно, в колона. Колкото по-агресивен е отзад, толкова по-спокоен трябва да си ти отпред: цялата ти защита е пространството ПРЕД теб.",
    whyBg:
      "При удар отзад тялото на предния поема камшичния удар — лепката е опасност преди всичко за теб. Спирачният удар „за урок“ е най-лошият възможен ход: превръща потенциален удар в почти сигурен и прехвърля вината върху теб. Увеличената предна дистанция ти дава мек спирачен профил — можеш да спреш плавно и лепката има време да реагира; пропускането решава проблема окончателно.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият не оценява чуждото лепене — оценява твоя отговор: запазено спокойствие, плавно увеличаване на дистанцията напред, десен край на лентата и пропускане. Рязко спиране без причина пред следващ те автомобил е опасно поведение; гузното превишаване е просто превишаване.",
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
  staged: [FTG_LEAD, FTG_TAILGATER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The following-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_FOLLOWING: readonly ScenarioSpec[] = [
  SC_FOLLOW_DISTANCE,
  SC_FOLLOW_BRAKE,
  SC_FOLLOW_STANDSTILL,
  SC_FOLLOW_RAIN_GAP,
  SC_FOLLOW_TRUCK,
  SC_FOLLOW_CUTIN,
  SC_FOLLOW_TAILGATER,
];
