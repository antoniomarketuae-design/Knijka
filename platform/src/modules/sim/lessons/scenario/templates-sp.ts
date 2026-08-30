/**
 * Scenario templates — the SPEED-MANAGEMENT family, S3 batch 2 (doc 72 §8
 * „Family SP"): three ✅ FULL overspeed archetypes staged on purpose-built
 * straight-street micro-maps, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district files so nothing loads world JSON at
 * runtime; the trace-gate batteries assert every pinned value against the
 * generated maps):
 *
 *  - sc-speed-creep     „Пълзящо превишаване"  (SP-01 + SP-03, sp-creep2-v1 —
 *    the founder R3 P5 redesign, doc 62 #30: a LONG 50→30 road, both caps
 *    signed by the world and both failable)
 *  - sc-speed-dangerous „Над +10 км/ч"         (SP-02 + SP-13, ov-keepright-v1
 *    REUSED — the founder R3 redesign, doc 62 #31: staged „поток" traffic at
 *    an illegal pace makes resisting the flow the actual drill)
 *  - sc-speed-rain      „Скорост в дъжд"        (SP-04, sp-rain-v1, ×N — the
 *    doc 62 #32 redesign: BOTH gates enforce the wet envelope, so the
 *    dry-legal pace fails the drill, which is the drill)
 *
 * Each mistake demo cites SHIPPED rules-catalog SPEED codes and grades EXACTLY
 * them, with NO extra codes, when replayed through the production stack (the
 * §5/§9 gates, traces/__tests__/sp-speed-*-traces.test.ts):
 *   - SP-01 → SPEEDING_OVER_LIMIT (второстепенна: graced-limit..+10 — on BOTH
 *     the 50 approach and the 30 zone of the P5 road);
 *   - SP-02 → SPEEDING_OVER_LIMIT vs SPEEDING_DANGEROUS (the BAND contrast —
 *     pacing the flow at 58 is второстепенна, chasing it at 66 ends the exam);
 *   - SP-04 → SPEEDING_DANGEROUS vs SPEED_TOO_FAST_FOR_CONDITIONS (the founder
 *     taste-pass contrast: blasting past the В26-50 at ~72 km/h in the rain is
 *     +22 over the limit → опасна, ends the exam; pacing the „поток" at 48 is
 *     the legal-but-imprudent wet envelope, the rain factor 0.85 × 50 =
 *     42.5 km/h. NB the engine's conditions code is capped at the graced limit,
 *     so the 72 demo grades SPEEDING_DANGEROUS ALONE, not both).
 *
 * Ambient traffic is ZERO in every drive (seed 7). sc-speed-creep and
 * sc-speed-rain carry no actor at all — the only gradable fault is the
 * driver's own speed. sc-speed-dangerous stages TWO flow actors (a runaway
 * pace car + an overtaking passer — the FTG_LEAD / rearTailgater precedents)
 * and sc-mw-discipline one, and NONE OF THEM EMITS AN EVENT, so the only
 * gradable fault in either drill is STILL the driver's own speed and lane.
 * „Emits no event" is NOT „cannot be hit", and the difference cost this file a
 * critical: a `brakingLeadCar` publishes a `contactCast` billed to the player,
 * and on a road short enough to lap it comes back BEHIND him. Both pace cars
 * therefore ride one lane pitch off the student's line — see THE LAP at
 * `SPD_FLOW_LEAD` and THE FLOW at `MWD_FLOW_LEAD`. The shadow drives
 * disciplined and clean and earns the family positive CLEAN_DRIVING.
 *
 * Family: "speed" — the catalog chip added for the SP family (doc 72 §8);
 * the ids (sc-speed-*) match the sc-<family>-<slug> naming standard.
 *
 * Doc-72 provenance: the batch-2 three are marked "Engine: ✅ FULL". Later
 * waves in this file: SP-03 (zone/transition — sc-speed-zone + sc-speed-
 * transition), SP-11/VP-09 (harsh brake — sc-sp-harsh-brake), SP-05
 * (curve envelope — sc-sp-curve on the rural-curve archetype + the
 * curveAdvisory zone layer) and SP-10 (the motorway-segment archetype —
 * sc-mw-discipline on mw-v1: the edge motorway tag arms the SP-10 crawl
 * detector, and OV-11's keep-right works at 130 with zero new code).
 * SP-06..SP-09 stay 🟡/🔴; SP-12 grades a crossing code (pedestrian family);
 * SP-13 needs ambient traffic set over the limit, which the determinism law
 * (ambient 0) forbids — left for later waves.
 */

import type {
  BrakingLeadCarSpec,
  PedestrianDartOutSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Wet, l5WetGrip } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value —
// the L7 pattern; the sp-districts / sp-transition / ov-keepright batteries
// assert the copies match the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (sp-*-v1). */
const LANE_X = 4.06;
/** ov-keepright-v1 (2+2 boulevard): right (cruise) / left (pass) centers. */
const KRD_RIGHT = 12.19;
const KRD_LEFT = 4.06;
/** One drawn lane of ov-keepright-v1, m — the staged actors' `extraRightOffsetM`
 *  step (negative = the lane to the LEFT of the student's own). */
const KRD_LANE_PITCH = KRD_RIGHT - KRD_LEFT; // 8.13

// ---------------------------------------------------------------------------
// 1. sc-speed-creep — „Пълзящо превишаване" (SP-01 + SP-03) on sp-creep2-v1:
//    the founder R3 P5 road (doc 62 #30 — „a LONG road: sign 50 → hold under
//    50 → sign 30 → drop to 30. Signed, staged, failable — not an empty
//    cap."). 400 m posted 50, then a 280 m zone 30 (per-edge maxspeed — the
//    runtime grades the LOCAL limit), В26-50 plate at the entry (props.ts
//    district-entry pass) and painted „30" road numerals through the zone
//    (markings.ts speed glyphs on the tagged school edge). BOTH caps are
//    failable: creeping over 50 on the approach and creeping over 30 in the
//    zone each grade SPEEDING_OVER_LIMIT against their own edge.
// ---------------------------------------------------------------------------

/** Transition Y of sp-creep2-v1 (= approachM); where the zone 30 begins. */
const CRP_TRANS_Y = 400;
/** Total length of sp-creep2-v1 (approachM + zoneM). */
const CRP_TOTAL_Y = 680;

/** SP-01 + SP-03 — движение над разрешената скорост в рамките на +10 км/ч
 *  (ЗДвП чл. 21: ограничението е таван, не цел) — по ДЪЛЪГ маршрут с два
 *  тавана (50, после зона 30), така че пълзенето на стрелката е грешка и в
 *  двата участъка. */
export const SC_SPEED_CREEP: ScenarioSpec = {
  id: "sc-speed-creep",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "зона 30", "градско каране", "самоконтрол"],
  titleBg: "Пълзящо превишаване на скоростта",
  objectiveBg:
    "Измини дългата улица с два тавана: дръж под 50 км/ч по целия подход, а на знака за зона 30 свали НАВРЕМЕ до под 30 и задръж до края. Скоростта пълзи неусетно — стрелката се проверява, не се усеща.",
  archetypeIds: ["SP-01", "SP-03"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-creep2-v1.json meta.scenario.params
    // (tools/maps/gen_sp_transition.mjs — the P5 long two-segment street).
    params: { approachM: 400, zoneM: 280, approachKmh: 50, zoneKmh: 30 },
    districtId: "sp-creep2-v1",
  },
  start: {
    spawnPointId: "sp-tr-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по дългата улица — знакът на входа казва 50 км/ч. Установи спокойни 46–48 и ги ЗАДРЪЖ." },
    { n: 2, textBg: "Поглеждай скоростомера на всеки няколко секунди: при дълго равномерно каране скоростта пълзи нагоре, без да усетиш." },
    { n: 3, textBg: "Напред започва зона 30 — цифрите „30“ са изписани на самото платно. Вдигни газта отрано и влез в зоната вече под 30." },
    { n: 4, textBg: "В зоната дръж 26–28 км/ч — и тук стрелката пълзи: същият навик, по-нисък таван." },
    { n: 5, textBg: "Задръж под 30 до края на зоната — двата тавана са един и същ урок: таванът е граница, не цел." },
  ],
  success: [
    {
      id: "sc-crp-approach",
      titleBg: "Мини подхода под 50 км/ч",
      // Cap just above the taught 46–48 cruise: a disciplined drive satisfies
      // it, a „с потока" speeder at 57 does not.
      params: { kind: "reachZone", x: LANE_X, y: 240, radiusM: 10, maxSpeedKmh: 52 },
    },
    {
      id: "sc-crp-zone",
      titleBg: "Мини зоната 30 под 30 км/ч",
      // Deep in the zone, cap = the graced 33: an adapted ~27 drive satisfies
      // it; a zone-creeper at 37 does not.
      params: { kind: "reachZone", x: LANE_X, y: 520, radiusM: 10, maxSpeedKmh: 33 },
    },
    {
      id: "sc-crp-finish",
      titleBg: "Стигни края на зоната, още под 30",
      params: { kind: "reachZone", x: LANE_X, y: 650, radiusM: 12, maxSpeedKmh: 33 },
    },
  ],
  rubric: { parTimeSec: 90 },
  shadow: { path: "content/traces/sc-speed-creep/shadow-correct.trace.json" },
  // MISTAKE ORDER IS A FRAMING DECISION (founder R0 on the produced clip:
  // „here totally not understandable … a car driving forward in a city street
  // nothing else"). The why-panel serves ev-speed-limit with mistake INDEX 0
  // (whyPanel DIRECT_SIM_REFS), and the clip rig frames a window around the
  // engine fault. A speeding clip only reads if the CAP is in the same frame
  // as the needle:
  //   - the APPROACH demo breaks the 50, whose only rendered face is the В26
  //     disc props.ts posts at the segment entry (y ≈ 14). The fault cannot be
  //     dragged back to it — the car starts at rest and needs ~85 m just to
  //     reach a sustained 57 — so that clip is structurally sign-less.
  //   - the ZONE demo breaks the 30, and the 30 is painted ON THE ROAD every
  //     120 m (markings.ts SPEED_GLYPH_* — 6 m numerals in the driver's own
  //     lane). The recorder authors the conviction ONTO one of those numerals,
  //     so the cap is under the ❌ and cannot leave the chase frame.
  // So the ZONE demo leads. Both are still shipped and still graded the same;
  // only the order (and therefore which one the clip pilot renders) changed.
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-zone-creep.trace.json" },
      titleBg: "Пълзене в зоната 30",
      whatWentWrongBg:
        "Подходът беше дисциплиниран и колата влезе в зоната правилно, с 27 км/ч — но без поглед към скоростомера стрелката изпълзя до 37. Усещането при 37 в зона 30 е „бавно“; присъдата е същата второстепенна грешка като 57 в зона 50. Навикът да проверяваш стрелката важи двойно там, където таванът е нисък.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-flow-along.trace.json" },
      titleBg: "Носене с потока по подхода",
      whatWentWrongBg:
        "По дългия подход колата задържа около 57 км/ч, защото „всички карат така“ — но 51–60 км/ч в зона 50 е второстепенна грешка. В зоната водачът намали правилно; грешката вече беше отбелязана: ограничението е таван за всеки поотделно, потокът не го вдига.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко продължително равномерно каране — по булеварди, прави отсечки и особено след преход към по-нисък таван (зона 30, жилищна зона): точно там пълзенето на стрелката е най-неусетно и най-скъпо.",
    whyBg:
      "Рискът от тежко нараняване при удар расте стръмно със скоростта — няколко километра в час над тавана свиват дистанцията за спиране и полето на видимост точно там, където се появяват пешеходци. Усещането за скорост се приспособява за минути; затова стрелката се ПРОВЕРЯВА периодично, а таванът е граница, под която си оставяш резерв.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през ЦЕЛИЯ маршрут — и на булеварда, и в зоната: движение над разрешеното е грешка дори без злополука, а над +10 км/ч е опасна грешка и прекратява изпита. Очаква се и навременно сваляне при влизане в зона с по-нисък таван.",
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
// 2. sc-speed-dangerous — „Над +10 км/ч" (SP-02 + SP-13) on ov-keepright-v1
//    (REUSED 360 m 2+2 boulevard, limit 50 — the map-reuse house pattern:
//    sc-sp-harsh-brake↔sp-creep-v1, sc-follow-tailgater↔ln-v1).
//
// FOUNDER R3 REDESIGN (doc 62 #31: „IDENTICAL to #30; if a user sees this he
// will start to feel the platform is a scam"). The drill's own concept — the
// +10 band — is a THRESHOLD, and a threshold is taught by CONTRAST plus the
// pressure that makes real drivers cross it: the flow. Doc 72's SP-13 („скорост
// на потока") was parked because AMBIENT traffic must stay zero; staged
// DETERMINISTIC actors are the honest unlock:
//   - the RUNAWAY PACE CAR ahead (brakingLeadCar with followGapM authored far
//     above the real gap — the FTG_LEAD constant-cruise trick) pulls away at
//     ~61 km/h: the carrot;
//   - the PASSER behind (rearTailgater — learn-only, emits ZERO events by its
//     runner contract) glues briefly, then overtakes on the left at the same
//     illegal pace: the push.
// The PASSER can grade nothing (empty `contactCast` by its runner's own
// policy). The PACE CAR is a solid body billed to the player, so its LANE is
// load-bearing — see THE LAP, below. The two mistakes demonstrate the BAND
// ITSELF:
// pacing the flow at ~58 grades второстепенна SPEEDING_OVER_LIMIT; chasing it
// at ~66 grades опасна SPEEDING_DANGEROUS — same road, same flow, 8 km/h
// apart, an exam continued vs an exam terminated. That contrast IS the +10
// lesson, and it is distinct from sc-speed-creep (zones, no actors) by both
// staging and graded band.
// ---------------------------------------------------------------------------

/**
 * The RUNAWAY PACE CAR — „потокът" ahead. followGapM 400 on a 360 m road can
 * never be satisfied, so the matchPlayer controller pins the actor at its
 * maxMatchSpeedMps constantly (the FTG_LEAD documented precedent): a car
 * pulling away at ~61 km/h. Slam tier authored out of reach (slamAt past the
 * road end + minSlamSpeedKmh 250) — deterministic moving traffic, never a
 * braking drill. It starts ~55 m ahead and only GAINS distance on a lawful
 * player, so FOLLOWING_TOO_CLOSE structurally cannot arm even against the
 * 66 km/h chase demo (gap stays ≥ ~50 m).
 *
 * ---------------------------------------------------------------------------
 * THE LAP — why this car rides the LEFT lane and not the student's own
 * (finding sc-speed-dangerous:e8414c56, critical; frames
 * .audit-frames/wave-c/frames/sc-speed-dangerous__pc-right/08-debrief.png and
 * .audit-frames/proof/frames/sc-speed-dangerous__{pc,mobile}-right/).
 * ---------------------------------------------------------------------------
 *
 * WHAT THE FRAMES SHOW. A drive that held a cautious pace under the 50 while
 * the flow went by returns НЕИЗДЪРЖАН, 10 наказателни точки, ★☆☆ and exactly
 * one опасна грешка — «Удар в друго превозно средство» — on BOTH platforms,
 * with both route objectives ticked. The card blames the student for a
 * collision, and the debrief's own advice («дръж 2 секунди зад предния») is
 * advice about a car in FRONT of him. He was hit from BEHIND.
 *
 * THE MECHANISM, MEASURED through the production stack (runtime → traffic →
 * director → rules, __tests__/sp-flow-lead-lane.test.ts):
 *
 *  1. this actor is pinned at 17 m/s from the first second, so it covers the
 *     290 m from its hold to the end of a 360 m road in ~21 s and `finished`
 *     latches — long before a lesson whose drive budget is minutes;
 *  2. FR-B5-RETURN (traffic/staged.ts) then does the right thing for the wrong
 *     lane: rather than stand at the horizon it drives 70 m clear and RE-ENTERS
 *     at its own hold pose — which is BEHIND a student who has driven on —
 *     „under the command it left with". That command is `matchPlayer` with a
 *     station of 400 m, and the rubber band `player + 0.55 × (400 − gap)` is
 *     SIGN-BLIND: it commands maximum closing speed whether the actor is ahead
 *     of him or behind him. The trick that makes this car a carrot in front
 *     makes it a homing missile behind;
 *  3. the staged-traffic player guard cannot save him. It opens at
 *     GUARD_AHEAD_M 16 m, aims to stop GUARD_STOP_SHORT_M 6 m short and brakes
 *     at HOLD_DECEL_MPS2 8 m/s² — 10 m of working room, i.e. it can arrest
 *     √(2 × 8 × 10) ≈ 12.6 m/s. This car arrives at 17;
 *  4. `BrakingLeadCarRunner` publishes a `contactCast` billed to the player
 *     («closing: "player"»), so the touch is booked against HIM. Measured on
 *     the sweep's own stop-go control law: first contact t = 84.3 s, player at
 *     y = 155.4 doing 2.1 км/ч, actorId `sc-dng-flow-lead`, 44 overlap frames.
 *     The лепка behind him is innocent by construction (RearTailgaterRunner
 *     declares an EMPTY cast — „a rear-end by a car glued to your bumper is not
 *     the student's fault; billing it here would convict the victim"). This car
 *     did the same thing and was billed, because nothing had thought about what
 *     it becomes on its second lap.
 *
 * THE FIX IS ONE LANE, and it is the lane discipline the rest of the catalogue
 * already has: staged.ts states as measured fact that „every same-road actor in
 * the catalogue rides ONE LANE PITCH off the student's line by authored
 * construction (`extraRightOffsetM` ±8.125 / ±8.13)". These two flow actors
 * were the exception. With the pace car one pitch LEFT its separation from a
 * student who holds the right lane — the lane this drill's own objective pins,
 * radius 6 < the 8.13 m pitch — is 8.13 m on every frame of every run, scripted
 * or returning, so it cannot be the striker at any speed. Measured across
 * steady 20…47 км/ч and the stop-go law: contacts 44 → 0.
 *
 * AND IT COSTS THE DRILL NOTHING. The carrot is still ~55 m ahead, still
 * pulling away at ~61, still in the windscreen; instruction 2 still reads
 * «Колата пред теб … се отдалечава с над 60 — остави я», with the lane named so
 * the sentence matches the world (the sp-world-claims gate). It is also the
 * truer picture: a car doing 61 on a 50 boulevard belongs in the overtaking
 * lane, and putting it there makes the right-lane discipline this lesson grades
 * legible instead of incidental.
 *
 * NOT FIXED HERE, AND ROUTED: the passer re-enters the same way, in the
 * student's OWN lane (`rewindTo` zeroes the lateral channel, so the lane it
 * passed into is forgotten) at its 17 m/s pass cruise, and drives THROUGH him —
 * measured closest approach 0.004 m of centres. Nothing is billed (empty cast)
 * and nothing can be: it is the лепка's own contract. But a car passing through
 * the student is a defect of its own, and its lever is not in this file — a
 * returning actor needs either the lane it left with or a pace the guard can
 * arrest (traffic/staged.ts, FR-B5-RETURN's `rewindTo` / `reentryArc`).
 *
 * ── THE STRIKE DID NOT DIE, IT MOVED ONE LANE — re-measured 2026-08-30 ──────
 *
 * `e8414c56` came back with a judge's overturn of a w17 closure, and the
 * overturn is right about the thing it measured: `git diff 32505eb b7a321cd --
 * platform/src` is EMPTY, so the build that convicted this drive and the build
 * that passed it are the same product and no closure may rest on the pass. But
 * the overturn stops one step short, and this is the step. The lane repair
 * above landed in 6399a8d on 2026-08-27 — BEFORE both of those builds — so w15
 * was convicted WITH it. It therefore did not make the collision impossible; it
 * made it conditional on where the student is.
 *
 * MEASURED on the current tree, production stack (createWorldRuntime +
 * createTrafficSystem + director + rule engine, ov-keepright-v1, seed 7,
 * ambient 0, the shipped `staged` cast), sweeping the player's line laterally
 * under the sweep's own 12 км/ч stop-go law for 210 s:
 *
 *   player centre x     contacts   first
 *   12.19 … 6.0            0       —                    ← the taught lane
 *    5.86 … 2.26          43       sc-dng-flow-lead
 *                                  t = 84.3 s, y = 155.5
 *    2.0 … 0.0             0       —                    ← the road centreline
 *
 * The band is 4.06 ± 1.8 m — two half-widths either side of the OVERTAKING
 * lane centre, i.e. exactly the pace car's own lane and nothing else. At the
 * taught 46–48 км/ч and at every steady 20…45 км/ч, in the taught lane, the
 * sheet is still clean: zero contacts, zero violations (sp-flow-lead-lane
 * .test.ts §3, green).
 *
 * SO THE ROW IS NOT THIS FILE'S ANY MORE, and the two addresses are:
 *
 *  1. `traffic/staged.ts` — `reentryArc()` offers the AUTHORED HOLD (arc 70,
 *     y ≈ 70) to an actor whose player is at y ≈ 155, i.e. it re-admits the car
 *     ASTERN of him, „under the command it left with". That command is a
 *     `matchPlayer` band with `followGapM: 400` on a 360 m road, so the band is
 *     pinned at `maxMatchSpeedMps` in BOTH directions: it orders maximum
 *     closing speed from behind as readily as in front. The only brake is
 *     `closesOnPlayer`, which opens at 16 m aiming to stop 6 m short at
 *     8 m/s² — it can arrest ≈12.6 m/s and the car arrives at 17. The edit is
 *     one condition in `reentryArc`: it already computes `proj.s` (the player's
 *     own arc), so a same-road re-entry can be refused unless the candidate arc
 *     is AHEAD of him, and the actor waits off-scene one more beat instead.
 *  2. `orchestrator/runners.ts` + the collision rule — a contact in which the
 *     staged body closed on a stationary-or-slower player FROM ASTERN is billed
 *     to the player as «Удар в друго превозно средство», 10 наказателни точки,
 *     опасна грешка, and the debrief explains it as a following-distance
 *     failure («Между вас е имало точно толкова път, колкото ти е трябвал, за
 *     да спреш»). That sentence is FALSE of a rear-end from behind, which makes
 *     it a doc 64 THEO-4 defect on top of the false conviction.
 *
 * WHY IT CANNOT BE ANSWERED HERE, spelled out so the next lane does not try:
 * `extraRightOffsetM` is already one full pitch off his line and the next step
 * left is ONCOMING; dropping `maxMatchSpeedMps` to the ≈12.6 m/s the guard can
 * arrest puts „потокът" at 45 км/ч under a 50 limit and deletes the drill
 * (`objectiveBg`, instruction 2's «над 60», instruction 4's «+10» and both
 * mistake demos, 58 and 66, all rest on a flow ABOVE the cap); and
 * `paceMode: "scheduledCruise"` is what §2 of sp-flow-lead-lane.test.ts
 * deliberately pins AGAINST („the exposure is REAL and still happens").
 *
 * ONE MORE THING THE SWEEP CANNOT SEE, measured in the same run: in the TAUGHT
 * lane the passer above reaches 0.00 m of centre-to-centre separation with the
 * player and the session books NOTHING — no collision, no near miss, no code.
 * A car drives clean through a student and the product is silent. Same address
 * as the routed note above; the number is now 0.00 rather than 0.004.
 */
const SPD_FLOW_LEAD: BrakingLeadCarSpec = {
  id: "sc-dng-flow-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ov-kr-n-start", "ov-kr-n-end"],
    hold: { nodeIndex: 0, offsetM: 70 }, // dormant ~55 m ahead of the spawn
    cruiseSpeedMps: 17,
    // THE LEFT (overtaking) lane, x ≈ 4.06 — see THE LAP above. This is the
    // whole of finding sc-speed-dangerous:e8414c56's repair; the guard for it
    // is __tests__/sp-flow-lead-lane.test.ts, which drives the production
    // stack and fails the moment this returns to 0.
    extraRightOffsetM: -KRD_LANE_PITCH,
    colorIndex: 2,
  },
  followGapM: 400, // ABOVE any possible gap → constant maxMatchSpeedMps cruise
  maxMatchSpeedMps: 17, // ~61 km/h — the flow's illegal pace
  slamAt: { x: KRD_LEFT, y: 900 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The PASSER — „потокът" behind. The shipped rearTailgater actor (learn-only:
 * its runner emits ZERO SimTick events, the FO-07 contract), released once the
 * player pulls ~15 m ahead: it closes, sits ~10 m of centers behind for ~5 s,
 * then laneShift-passes on the LEFT at ~61 km/h and drives off — the driver
 * who „не издържа" and breaks the limit around you. Against the 66 km/h chase
 * demo its 16 m/s match cap simply leaves it behind — still zero events.
 */
const SPD_FLOW_PASSER: RearTailgaterSpec = {
  id: "sc-dng-flow-passer",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["ov-kr-n-start", "ov-kr-n-end"],
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant ~13 m behind the spawn
    cruiseSpeedMps: 15,
    extraRightOffsetM: 0, // the player's own (right) lane
    colorIndex: 4,
  },
  releaseGapM: 15,
  followBehindM: 10, // ~10 m of centers ≈ 6 m of bumpers — pressure, not лепка
  maxMatchSpeedMps: 16, // ~58 km/h — keeps the pressure on a flow-pacing player
  pressureSec: 5,
  passShiftM: -8.125, // one drawn lane LEFT — the legal-side pass
  passSpeedMps: 17, // ~61 km/h — the flow's pace again
  passAheadM: 30,
  easeKmh: 8,
};

/** SP-02 + SP-13 — превишаване с повече от 10 км/ч под натиска на потока
 *  (ЗДвП чл. 21; doc 32: опасна грешка — изпитът се прекратява; чл. 20 ал. 1:
 *  скоростта е твое решение, не на колоната). */
export const SC_SPEED_DANGEROUS: ScenarioSpec = {
  id: "sc-speed-dangerous",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "скорост на потока", "опасна грешка", "изпит"],
  titleBg: "Превишаване над +10 км/ч",
  objectiveBg:
    "Потокът по булеварда лети с над 60 км/ч — една кола пред теб в лявата лента се отдалечава, друга те притиска отзад и после те изпреварва отляво. Задачата е да НЕ тръгнеш с тях: дръж 46–48 км/ч в дясната лента. 51–60 е второстепенна грешка; над 60 (+10) е опасна и на изпита значи директно отпадане.",
  archetypeIds: ["SP-02", "SP-13"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-keepright-v1.json
    // meta.scenario.params (tools/maps/gen_ov_keepright.mjs; map REUSED).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ov-keepright-v1",
  },
  start: {
    spawnPointId: "ov-kr-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента — ограничението е 50 км/ч, а потокът около теб няма да го спазва." },
    // THE LANE IS NAMED BECAUSE THE CAR IS IN IT (finding sc-speed-dangerous:
    // e8414c56 — see THE LAP at SPD_FLOW_LEAD). The pace car now rides the
    // LEFT lane, so the sentence says so: a briefing that points at a car in
    // „твоята лента" while the world puts it one lane over is the same crime
    // this file already struck twice (the school on sp-trans-v1, the мантинела
    // on mw-v1). Everything the line taught is intact — it is still «Колата
    // пред теб», it still «се отдалечава с над 60», and the moral is still
    // that the needle is read off the plate and the speedometer rather than
    // off the back of the car in front.
    { n: 2, textBg: "Колата пред теб в ЛЯВАТА лента се отдалечава с над 60 — остави я. Скоростта се чете от знака и скоростомера, не от гърба на предния." },
    { n: 3, textBg: "В огледалото се появява кола, която те притиска и после те изпреварва отляво. Нейната грешка е нейна — не я прави своя." },
    { n: 4, textBg: "Помни границата: 55–60 е второстепенна грешка, а НАД 60 км/ч (+10) е опасна — на изпита това е директно отпадане." },
    { n: 5, textBg: "Задръж 46–48 км/ч до края на отсечката — да те изпреварват е нормално; да отпаднеш от изпита не е." },
  ],
  success: [
    {
      id: "sc-dng-hold",
      titleBg: "Задръж под 50, докато потокът те подминава",
      // Radius 6 < the 8.125 m lane pitch: satisfiable ONLY from the RIGHT
      // lane, at a lawful pace — resisting the flow IS the drill.
      params: { kind: "reachZone", x: KRD_RIGHT, y: 200, radiusM: 6, maxSpeedKmh: 52 },
    },
    {
      id: "sc-dng-finish",
      titleBg: "Стигни края на отсечката, още под тавана",
      params: { kind: "reachZone", x: KRD_RIGHT, y: 330, radiusM: 6, maxSpeedKmh: 52 },
    },
  ],
  rubric: { parTimeSec: 55 },
  shadow: { path: "content/traces/sc-speed-dangerous/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-pace-flow.trace.json" },
      titleBg: "Със скоростта на потока — 58",
      whatWentWrongBg:
        "Водачът се лепна за потока и задържа около 58 км/ч, „за да не пречи“. 51–60 км/ч в зона 50 е второстепенна грешка — коригируема, но записана. Потокът не вдига тавана: той просто кара сбъркано пред свидетел.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-chase-flow.trace.json" },
      titleBg: "Гонене на потока — 66",
      whatWentWrongBg:
        "Отдалечаващата се кола „дръпна“ и водачът я подгони до около 66 км/ч — над +10 км/ч над ограничението. Само 8 км/ч делят тази присъда от предишната: 58 беше второстепенна грешка, 66 е опасна и на практическия изпит значи незабавно отпадане. Границата +10 не е буфер, а ръбът на изпита.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "Винаги, когато потокът кара над ограничението — по булеварди, при „дърпащ“ преден автомобил и при натиск отзад. Точно там се решава дали скоростомерът ти се управлява от теб или от колоната.",
    whyBg:
      "Наредба № 38 дели превишаването на две присъди с граница +10 км/ч: до нея грешката е второстепенна, над нея — опасна, с прекратен изпит. Границата е рязка, а натискът на потока е точно силата, която неусетно те прекарва през нея: няколко секунди „в крак с другите“ струват колкото цял изпит — а на улицата спирачен път, който вече не стига.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият вижда потока около теб и точно затова гледа ТВОЯ скоростомер: движение „със потока“ над ограничението е грешка, а едно-единствено превишаване с повече от 10 км/ч прекратява изпита на място. Спокойното изоставане от потока се брои за зрялост, не за колебание.",
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
  staged: [SPD_FLOW_LEAD, SPD_FLOW_PASSER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-speed-rain — „Скорост в дъжд през нощта" (SP-04, ×N) on sp-rain-v1
//    (360 m straight street, limit 50, recorded at night in the rain)
// ---------------------------------------------------------------------------

/** SP-04 — несъобразена с дъжда/нощта скорост (ЗДвП чл. 20: скорост, при която
 *  водачът може да спре в рамките на видимото платно). */
export const SC_SPEED_RAIN: ScenarioSpec = {
  id: "sc-speed-rain",
  family: "speed",
  tagsBg: ["скорост", "дъжд", "нощно каране", "съобразена скорост"],
  titleBg: "Скорост в дъжд през нощта",
  objectiveBg:
    "Знакът остава 50, но тази вечер той ЛЪЖЕ: в дъжд и тъмнина съобразената скорост е около 38 км/ч, и карането „законно по знак“ с 48–50 тук се брои за грешка. Урокът е точно този — под ограничението НЕ значи безопасно; спираш в рамките на видимото платно.",
  archetypeIds: ["SP-04"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-rain-aquaplaning", "c-night-visibility"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-rain-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-rain-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица в дъжд и тъмнина. Знакът казва 50 — но знакът е писан за сух ден." },
    { n: 2, textBg: "Тук е разликата от урока „Пълзящо превишаване“: там таваните бяха на знаците; тук таванът го смъква НЕБЕТО. Свали до около 38 км/ч." },
    { n: 3, textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг, а фаровете осветяват само няколко метра напред." },
    { n: 4, textBg: "Карай така, че да можеш да спреш в рамките на осветеното платно — с 48 „под знака“ това вече е невъзможно и се брои за грешка." },
    { n: 5, textBg: "Задръж намалената за условията скорост ДО КРАЯ — дъждът не спира на контролната зона." },
  ],
  success: [
    {
      id: "sc-rn-adapted",
      titleBg: "Мини контролната зона със съобразена за дъжда скорост",
      // Cap 42 km/h sits just under the rain envelope (0.85 × 50 = 42.5): the
      // adapted ~38 km/h drive satisfies it; a dry-speed 50 km/h does not —
      // the „legal by the sign" pace FAILS this gate, which is the lesson.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 42 },
    },
    {
      id: "sc-rn-finish",
      titleBg: "Стигни края на отсечката, още под мокрия таван",
      // The wet cap holds to the END (doc 62 #32): sprinting to 50 after the
      // first gate is the same fault — the envelope is the road's, not a
      // checkpoint's.
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12, maxSpeedKmh: 42 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-rain/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-dry-speed.trace.json" },
      titleBg: "Като на сухо — 72 при знак 50 в дъжда",
      whatWentWrongBg:
        "Колата подмина знака В26 „50“ и ускори до около 72 км/ч, все едно е сух, открит път. 72 при ограничение 50 е над +10 км/ч — това е ОПАСНА грешка, която на изпита прекратява явяването на място (Наредба № 38). А тук грешката е двойна: мокрият и тъмен път искат скорост ЧУВСТВИТЕЛНО ПОД знака (около 38 км/ч, чл. 20), не над него. Знакът е таван за идеални условия — не покана да го надскочиш.",
      codeRefs: ["SPEEDING_DANGEROUS", "SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-flow-along.trace.json" },
      titleBg: "Каране с потока в дъжда",
      whatWentWrongBg:
        "Около 48 км/ч „с потока“ — под знака, но твърде бързо за мокрия път и слабата видимост. Съобразената скорост не се чете от знака, а от условията: намали до около 38 км/ч.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
  ],
  teach: {
    whenBg:
      "При дъжд, мокър път, мъгла или тъмнина — тогава разрешеното по знак вече не е съобразеното. Видимостта и сцеплението падат, а с тях трябва да падне и скоростта.",
    whyBg:
      "На мокър и тъмен път спирачният път нараства около 1,4 пъти, а фаровете осветяват само няколко метра — карането на „сухата“ скорост означава да летиш към участък, който още не виждаш. Съобразената скорост връща и разстоянието за спиране, и времето за реакция.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият очаква видимо намаляване за условията — не просто спазен знак. Несъобразената с дъжда/нощта скорост се отбелязва като грешка; съобразена е тази, при която спираш в рамките на видимото платно.",
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
  conditions: { weather: "rain", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-speed-zone — „Зона 30 (училище/жилищна)" (SP-03 / PE-07) on
//    sp-zone30-v1 (360 m straight street posted 30 — the whole street IS the
//    zone; the map's own maxspeed grades it, no zone map layer needed)
// ---------------------------------------------------------------------------

/**
 * SP-03 / PE-07 — съобразяване с по-ниско ограничение в зона 30 (ЗДвП чл. 21).
 * ONE template, TWO DISTINCT codes (the sc-vp-readiness / sc-ov-lane-keeping
 * precedent): the SAME 50 км/ч, законна по булевард, в зона 30 е ОПАСНА грешка.
 *   - „Скорост от булеварда" (~37 км/ч) → SPEEDING_OVER_LIMIT (31–40 в зона 30
 *     → второстепенна; над грациозния 33, под опасния праг 40);
 *   - „Пълни 50 през зоната" (~50 км/ч) → SPEEDING_DANGEROUS (> +10 = > 40 →
 *     опасна). Колата минава лентата 33–40 за под 2 s (движещ праг), затова
 *     второстепенният код не се арма — точно като sc-speed-dangerous „flooring".
 */
// ---------------------------------------------------------------------------
// THE SCHOOLYARD (founder register items 60 + 61, doc 87 B60/B61)
// ---------------------------------------------------------------------------
//
// He played this exact lesson and wrote two things:
//   „the question is stating School zone, but in fact no kids are playing on
//    the sidewalks and we should do that it will attract the user to watch
//    closely"
//   „I see only Normal Buildings living/office building no actual school when
//    the question states there should be School, weak map engineering"
//
// Both halves are now built. The BUILDING is authored in the map
// (sp-zone30-v1 `sp-b-school`, `kind: "school"` — the УЧИЛИЩЕ name board, the
// yard railing and the А19 „Деца" posts derive from it in world/builders).
// The CHILDREN are here, because actors are scenario data, not map data.
//
// WHY THEY ARE `pedestrianDartOut` AND WHY THEY NEVER TOUCH THE ROAD.
// The ambient pedestrian system anchors every walker on a CROSSING
// (traffic/pedestrians.ts), and this street deliberately has none — it is the
// pure-overspeed archetype. So ambient `pedestrianCount` on this map produces
// exactly what the founder saw: nobody. Staged walkers are the only mechanism
// that puts a figure on this pavement.
//
// They are staged so they CANNOT change one point of grading:
//   * every path lies wholly on the EAST PAVEMENT (x ∈ [+8.1, +11.6] plus the
//     yard strip behind it) — the driver's own kerb, since he drives north in
//     the right lane. The carriageway edge is x = +8.125, and the
//     nearest any child comes to it is 2.0 m — well outside
//     PEDESTRIAN_CONTACT_M (1.5), so the collision branch cannot fire against a
//     car that stays on the road;
//   * `roadFromM`/`roadToM` are placed BEYOND the walk, so `onRoad` is false on
//     every frame and no crossing-occupancy count is ever incremented. There is
//     no crossing on this district anyway, so PEDESTRIAN_* stays structurally
//     inert exactly as it was before they existed;
//   * they release at spawn (`triggerDistM` spans the street, speed floor 0),
//     so the „encounter cancelled" branch — which fires only while an event is
//     still ARMED — can never mark them „не се случи". They are scenery with a
//     pulse, and they resolve `clear` when they finish their walk.
//
// This is the honest version of what he asked for: a reason to lift off that a
// 17-year-old can SEE, without inventing a чл. 119 duty on a street whose whole
// lesson is the number on the plate.

/** East pavement centre line (carriageway edge +8.125, pavement 3.5 m deep). */
const SCHOOL_WALK_X = 9.9;
/** The yard gate, on the railing line derived by world/builders/schools.ts
 *  (school centre 30.12 − half-depth 8 − RAILING_OFFSET_M 5.5 = 16.62). */
const SCHOOL_GATE_X = 16.6;

/** Shared shape: released at once, never on the roadway, never resolved late. */
const yardChild = (
  id: string,
  start: { x: number; y: number },
  dir: { x: number; y: number },
  speedMps: number,
  travelM: number,
  /**
   * Release radius, m. The WALKERS keep 400 — the whole street — because a
   * walker released at the first tick is still walking when he arrives.
   *
   * A RUNNER released at the first tick is not: doc 87 B60 asked for children
   * playing, and a child at 2.6 m/s covers his whole 90 m of pavement in 35 s
   * — before a lawful 27 km/h drive reaches the school at all. Measured on
   * this drive: the scene clock is ~16 s old before the car leaves y = 15, so
   * a first-tick runner is a STATUE by the time he is looked at, which is
   * exactly the failure the row already records („they walk", and now „they
   * stand"). Handing the runners a release radius instead ties their clock to
   * HIS position rather than to the scene's, so the chase is under way in the
   * window he is driving through, on any rung and at any approach speed.
   */
  triggerDistM = 400,
): PedestrianDartOutSpec => ({
  id,
  kind: "pedestrianDartOut",
  // No crossing exists on sp-zone30-v1; the id is inert (occupancy is only
  // counted while `onRoad`, which these never are) and is kept distinct so a
  // future crossing on this map can never be driven by a yard child.
  crossingId: "sp-schoolyard",
  crossing: { x: start.x, y: start.y },
  start,
  dir,
  speedMps,
  travelM,
  // Beyond the walk: `onRoad` is false on every frame, by construction.
  roadFromM: travelM + 100,
  roadToM: travelM + 200,
  // Scenery with a teaching job, not a hazard — the founder asked for children
  // on the pavement outside the school „it will attract the user to watch
  // closely". The encounter battery must therefore NOT demand they be met;
  // instead it proves they can never reach the carriageway at any speed, which
  // the two lines above already guarantee by construction.
  ambient: true,
  triggerDistM,
  minTriggerSpeedKmh: 0,
  variant: "child",
});

/**
 * Children in front of the school — and since doc 87 B60, children who are
 * PLAYING rather than commuting.
 *
 * His sentence is „no kids are playing on the sidewalks and we should do that
 * it will attract the user to watch closely." Four children existed, and the
 * 2026-08-02 re-look answered him plainly: **they walk.** 0.85–1.15 m/s,
 * single file, all four on their own errand. Nothing in that picture makes a
 * seventeen-year-old lift off.
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT.
 * Three of the six now RUN — 2.4–2.9 m/s, which is a child's jog, not a
 * sprint — and their paths CONVERGE on the stretch the driver is looking at:
 * two chase each other north up the pavement while a third runs south to meet
 * them. Movement that crosses is what reads as a game from a moving car;
 * everything else reads as a queue. The two walkers stay, because a schoolyard
 * with nobody merely walking is a cartoon.
 *
 * TIMING IS THE WHOLE TRICK, and it is arithmetic, not taste — and the first
 * cut of this got it wrong, which is worth writing down. Yard children were
 * released at the FIRST TICK (`triggerDistM` 400). That is right for a walker
 * and fatal for a runner: measured on the rendered drive, the scene clock is
 * ~16 s old before the car leaves the spawn and the school is not reached
 * until t ≈ 42 s, by which time a 2.6 m/s child has run out his whole path
 * and is STANDING — „they walk" would simply have become „they stand".
 * The three runners therefore release on a RADIUS (70 m) instead: their clock
 * starts from HIS position, ~9–12 s before he is level with them, so the chase
 * is always under way in the window he is driving through — at any approach
 * speed, on any rung, with no dependence on how long the scene was warm.
 *
 * The safety construction is unchanged and is what lets these be `ambient`:
 * every path is a straight line at constant x on the EAST pavement, the
 * nearest point of any of them is 1.78 m from the carriageway edge (x =
 * +8.125) against a `PEDESTRIAN_CONTACT_M` of 1.5, and `roadFromM`/`roadToM`
 * still sit beyond the walk so `onRoad` is false on every frame. The
 * encounter battery's ambient invariant — „never reaches the carriageway at
 * ANY speed" — is satisfied by construction for the new three exactly as it
 * was for the old four.
 */
const SCHOOL_YARD_CHILDREN: PedestrianDartOutSpec[] = [
  yardChild("sc-zn-kid-1", { x: SCHOOL_WALK_X, y: 198 }, { x: 0, y: 1 }, 1.0, 26),
  yardChild("sc-zn-kid-2", { x: SCHOOL_WALK_X + 1.2, y: 238 }, { x: 0, y: -1 }, 1.15, 30),
  // Out of the gate and TOWARD the kerb — the child who stops one pace short
  // of the carriageway. He is the reason for the 30, and he is the figure the
  // instruction text has always described. He walks west (toward the road) and
  // halts at x = 10.1, i.e. 2.0 m from the asphalt.
  yardChild("sc-zn-kid-3", { x: SCHOOL_GATE_X, y: 216 }, { x: -1, y: 0 }, 0.9, 6.5),
  // THE CHASE. kid-4 runs, kid-5 runs after him one pace of pavement over and
  // six metres back, and they stay a stride apart the whole way — the two
  // figures the driver sees moving fastest, on the kerb he is driving along.
  yardChild("sc-zn-kid-4", { x: SCHOOL_WALK_X + 0.5, y: 176 }, { x: 0, y: 1 }, 2.6, 70, 70),
  yardChild("sc-zn-kid-5", { x: SCHOOL_WALK_X + 1.4, y: 170 }, { x: 0, y: 1 }, 2.9, 74, 70),
  // …and the one running the other way, so the paths CROSS in front of him
  // instead of all drifting the same direction with the traffic. He is
  // released at y ≈ 192 — i.e. running TOWARD the windscreen, not away from it.
  yardChild("sc-zn-kid-6", { x: SCHOOL_WALK_X + 1.0, y: 262 }, { x: 0, y: -1 }, 2.4, 62, 70),
];

export const SC_SPEED_ZONE: ScenarioSpec = {
  id: "sc-speed-zone",
  family: "speed",
  tagsBg: ["скорост", "зона 30", "училищна зона", "жилищна зона"],
  titleBg: "Зона 30 — училище и жилищен квартал",
  objectiveBg:
    "Измини улицата в зона 30, като държиш скоростта под 30 км/ч през цялото време — там, където има деца и пешеходци, същите 50 км/ч, законни по булеварда, стават опасна грешка.",
  archetypeIds: ["SP-03", "PE-07"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-zone30-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 30 },
    districtId: "sp-zone30-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влизаш в зона 30 — училище и жилищен квартал. Ограничението тук е 30 км/ч, не 50." },
    { n: 2, textBg: "Свали скоростта осезаемо още на знака А19 „Деца“ и установи спокойни около 26–28 км/ч." },
    // Doc 87 B60 — the world now shows children RUNNING and the copy has to
    // say so: an instruction that describes a picture the student is not
    // looking at is worse than no instruction.
    { n: 3, textBg: "Вдясно напред е УЧИЛИЩЕТО: пред оградата му деца ТИЧАТ и се гонят по тротоара, а едно излиза от портата към бордюра. Гледай тях, не километража — тичащо дете не гледа пътя и всеки момент някое може да стъпи на платното." },
    { n: 4, textBg: "Не пренасяй „скоростта от булеварда“ в зоната: 50 км/ч тук е над +10 км/ч, тоест опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-zn-under-limit",
      titleBg: "Мини контролната зона под 30 км/ч",
      // Cap 33 (= graced limit) sits just above the taught ~27 cruise: a
      // disciplined drive satisfies it, a 37+ speeder does not.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 33 },
    },
    {
      id: "sc-zn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-zone/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-boulevard-speed.trace.json" },
      titleBg: "Скорост от булеварда в зона 30",
      whatWentWrongBg:
        "Колата задържа около 37 км/ч — нормална за булевард, но в зона 30 това е превишаване. 31–40 км/ч тук е второстепенна грешка; знакът смени тавана, скоростта трябваше да го последва.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-full-speed.trace.json" },
      titleBg: "Пълни 50 през зоната",
      whatWentWrongBg:
        "Колата премина зоната с около 50 км/ч, все едно е булевард. В зона 30 това е над +10 км/ч — опасна грешка, която на изпита означава отпадане, а на улицата е разликата между спиране и прегазено дете.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При всяка зона 30 — пред училища, детски градини, в жилищни квартали и там, където знакът В26 или табелата „Зона 30“ смъква тавана. Ниският лимит не е формалност: той е избран заради децата и пешеходците.",
    whyBg:
      "При 30 км/ч спирачният път и тежестта на удара са в пъти по-малки, отколкото при 50 — затова зоните 30 се поставят точно там, където пешеходец изскача без предупреждение. Пренасянето на булевардната скорост в зоната заличава цялото предимство, за което зоната съществува.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците: при влизане в зона с по-ниско ограничение очаква видимо и навременно намаляване. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
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
  // The schoolyard children. In `staged`, not `stagedAdd`: this drill has no
  // committed recording that could be perturbed (its traces are speed scripts
  // on an empty street and the walkers emit no event on any of them), and the
  // founder's ask was that the school zone LOOK like one at every rung, not
  // only at L5.
  staged: SCHOOL_YARD_CHILDREN,
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// THE 210 s SWEEP BUDGET IS NOT A ROUTE LENGTH — measured, because the obvious
// „fix" is the wrong one and someone will reach for it.
//
// sweep161 filed four SP lessons as „the right drive cannot finish": creep on
// BOTH legs, and zone / rain / dangerous on the phone leg only. NONE of it is
// route length. The audit harness's `right` mode (tools/mobile/lesson-audit.mjs)
// is a CAUTIOUS-DRIVER control law — CRUISE_KMH 12, ROLL_DISTANCE_M 15, then a
// full 3 s standstill — deliberately scenario-independent, and its drives are
// capped at DRIVE_BUDGET_MS = 210 s of wall clock.
//   · MEASURED from the run logs: sc-speed-creep/pc-right ticked objective 1
//     (y = 240) at 2:42, i.e. 225 m in 162 s = 1.39 m/s mean — 26 full stops.
//     680 m of route at that pace is ~490 s. On the 360 m maps the same law
//     finishes at 3:32–3:41 of scene clock (zone / rain / dangerous, pc, all
//     ИЗДЪРЖАН, 3 stars) and the phone leg — same data, same route, ~10 %
//     slower scene clock — was cut with roughly a third of the road left.
//   · At the pace THIS LESSON TEACHES the same road takes 400 m ÷ 46 км/ч +
//     280 м ÷ 27 км/ч ≈ 68 s of driving, against rubric.parTimeSec 90; the
//     product prints „Ориентировъчно време … спокойно, точността е преди
//     скоростта" and imposes no cutoff at all.
// So SHORTENING these routes, or lifting the 30-zone caps so a 12 км/ч creep
// can finish sooner, would trade a real lesson for a harness constant. If the
// sweep is to answer completability, the budget has to follow the ROUTE
// (lesson-audit.mjs already has the SLOW_DRIVE_BUDGET_MS precedent — it just
// keys off tick cost, not metres). Routed there; nothing to change here.

// ---------------------------------------------------------------------------
// 5. sc-speed-transition — „Преход 50→30 (навлизане в зона 30)" (SP-03) on
//    sp-trans-v1: a street built from TWO segments — a 160 m approach posted 50
//    then a 200 m zone posted 30 — so the limit DROPS mid-route. The runtime
//    grades PER EDGE (each segment carries its own maxspeed), so keeping the
//    approach speed past the transition sign fires the speeding codes against
//    the LOCAL 30, not the 50 the driver just left.
// ---------------------------------------------------------------------------

/** Transition Y of sp-trans-v1 (= approachM); the В26 „Зона 30" sign line. */
const TRANS_Y = 160;

/**
 * SP-03 — „Преходът на зони / Zone-transition blindness (50→30)" (ЗДвП чл. 21).
 * The distinct value vs sc-speed-zone (a homogeneous 30-street): here the limit
 * actually CHANGES mid-route, so the taught fault is the missing anticipatory
 * lift at the sign. ONE template, TWO DISTINCT codes against the LOCAL 30 limit:
 *   - „Само наполовина намалена" (~37 km/h) → SPEEDING_OVER_LIMIT (31–40 in the
 *     30 zone → второстепенна);
 *   - „Скоростта от преди зоната" (~48 km/h carried straight through) →
 *     SPEEDING_DANGEROUS (> +10 = > 40 → опасна). The speed stays above 40
 *     across the sign, so it never dwells in the 33–40 minor band — only the
 *     dangerous code arms (the sc-speed-dangerous „flooring" pattern). Neither
 *     fault grades on the 50 APPROACH: 48 < the graced 55 there.
 */
export const SC_SPEED_TRANSITION: ScenarioSpec = {
  id: "sc-speed-transition",
  family: "speed",
  // „училищна зона" REMOVED — sweep161 sc-speed-transition/pc-right/04-t076s.
  // The tag (and instruction 2, below) promised a school this map has never
  // carried; see the measurement at the instruction. „жилищна зона" is the tag
  // sp-trans-v1 actually earns: BOTH its edges are class `residential`.
  tagsBg: ["скорост", "зона 30", "преход на зони", "навлизане в зона", "жилищна зона"],
  titleBg: "Преход 50→30 — навлизане в зона 30",
  objectiveBg:
    "Намали НАВРЕМЕ на знака за зона 30: улицата минава от 50 на 30 км/ч в средата на маршрута, а скоростта трябва да падне заедно със знака — пренесеш ли скоростта от преди зоната, тя става грешка още с влизането.",
  archetypeIds: ["SP-03"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-trans-v1.json meta.scenario.params
    // (tools/maps/gen_sp_transition.mjs): 160 m @ 50 → 200 m @ 30.
    params: { approachM: 160, zoneM: 200, approachKmh: 50, zoneKmh: 30 },
    districtId: "sp-trans-v1",
  },
  start: {
    spawnPointId: "sp-tr-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — тук ограничението все още е 50 км/ч." },
    // THE SCHOOL THIS STREET NEVER HAD (sweep161, sc-speed-transition/pc-right/
    // 04-t076s.png). The line used to read „знак за зона 30 (училище/жилищна)".
    // MEASURED against the district the lesson loads: content/world/
    // sp-trans-v1.json carries 7 buildings and NOT ONE of them has
    // `kind: "school"` — the only thing that puts a school on any map
    // (world/builders/schools.ts derives the УЧИЛИЩЕ board, the yard railing
    // and the А19 „Деца" posts from that kind alone). It also stages no
    // children, so the frame at t=076s is what the founder already objected to
    // in doc 87 B61 on the OTHER 30-street: office/apartment blocks, lamps and
    // a rank of parked cars, with the red 30 disc the one true thing in it.
    //
    // sc-speed-zone is the lesson that MAY say школа: sp-zone30-v1 authors
    // `sp-b-school` and six staged yard children. This one may not, and asking
    // a student to lift off for a building that is not out the windscreen is
    // the exact judgement this drill claims to teach.
    //
    // …AND THE SENTENCE WAS ONE MISSING FIELD FROM BEING TRUE (measured
    // 2026-08-23, and routed rather than done here because the file is not this
    // lane's). content/world/sp-trans-v1.json carries SEVEN buildings and the
    // FIRST OF THEM IS ALREADY CALLED `sp-tr-b-school`. It has no `kind`. The
    // map's author put a school on this street and the one field that turns a
    // footprint into a school — `kind: "school"`, which world/builders/
    // schools.ts reads to derive the УЧИЛИЩЕ board, the yard railing and the
    // А19 „Деца" posts — was never set, so the builder skips it and the student
    // sees another anonymous block. That is why the copy promised a school it
    // could not show: the promise was written against the intent, and the
    // intent never reached the world.
    //
    // THE FIX IS ONE KEY, in tools/maps/gen_sp_transition.mjs and the committed
    // district it writes, and NOTHING here has to change to accept it: the
    // claim gate asks the district (`buildings.some(b => b.kind === "school")`,
    // __tests__/sp-world-claims.test.ts), so the day that field is authored the
    // school sentence becomes legal on this map by itself — and §3 of that file
    // already proves the same sentence is ACCEPTED on sp-zone30-v1, which is
    // the same predicate answering yes.
    //
    // Until then the copy stays as it is, and the remaining half of finding
    // sc-speed-transition:f9e554fb — „no pedestrians … no residential cue" — is
    // the streetscape complaint routed at sc-sp-curve below (both edges here
    // ARE class `residential`; the dressing is what does not say so). Staged
    // walkers would answer the „no pedestrians" half from THIS file, on the
    // SCHOOL_YARD_CHILDREN pattern above, and that is the next change this
    // lesson wants — it is left undone rather than done unverified, because
    // this template's three committed recordings would have to be re-verified
    // against the new cast in the same change.
    //
    // What is left is what the map really is, and it is enough: the В26 disc at
    // y = 160 and a `residential` street behind it. The zone-transition IS the
    // lesson (see the header above) — the school was never carrying it.
    // The claim gate: __tests__/sp-world-claims.test.ts.
    { n: 2, textBg: "Напред следва знак за зона 30 — жилищна улица. Забележи го отрано: намаляването започва преди знака, не след него." },
    { n: 3, textBg: "Вдигни крака от газта навреме и влез в зоната вече под 30 км/ч — около 26–28 км/ч." },
    { n: 4, textBg: "Не пренасяй скоростта от преди зоната: същите 50 км/ч, законни допреди малко, в зоната са над +10 км/ч — опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-trn-approach",
      titleBg: "Измини подхода спокойно до знака за зоната",
      // On the 50 approach — reach it under a relaxed cap (a normal ~46 drive).
      params: { kind: "reachZone", x: LANE_X, y: 120, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-trn-in-zone",
      titleBg: "Влез в зона 30 вече под ограничението",
      // Deep in the 30 zone with a cap just above the taught ~27 cruise: an
      // anticipating driver satisfies it; one who carried 37+ km/h does not.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, maxSpeedKmh: 33 },
    },
    {
      id: "sc-trn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 345, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-transition/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-carry-speed.trace.json" },
      titleBg: "Скоростта от преди зоната",
      whatWentWrongBg:
        "Колата пренесе около 48 км/ч право през знака в зона 30 — законна допреди метри, тук над +10 км/ч. Знакът смени тавана на 30; неснижаването е опасна грешка, а не продължение на подхода.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-half-slow.trace.json" },
      titleBg: "Само наполовина намалена",
      whatWentWrongBg:
        "Скоростта падна, но само до около 37 км/ч — все още над 30. Намаляването закъсня и остана недостатъчно: 31–40 км/ч в зона 30 е второстепенна грешка. Целѝ под тавана, не към него.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко влизане в зона с по-ниско ограничение — знак В26 „Зона 30“, училищна или жилищна зона, край на населено място наопаки. Ключът е преходът: таванът пада на знака, а с него трябва да падне и скоростта.",
    whyBg:
      "Проучванията за зони 30 показват типичната грешка: водачът „не регистрира“ прехода и влиза в зоната със старата скорост, като адаптацията закъснява със стотина метра — точно там, където живее по-ниският лимит заради децата. Навременното вдигане на газта на знака връща цялото предимство на зоната.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през целия маршрут и очаква видимо, НАВРЕМЕННО намаляване при прехода към по-ниско ограничение. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
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
// 6. sc-sp-harsh-brake — „Рязко спиране без причина" (SP-11 / VP-09) on
//    sp-creep-v1 (map REUSED; rides the recorder's maxDecelMps2 override —
//    the hard-brake capability unlock)
// ---------------------------------------------------------------------------

/**
 * SP-11 / VP-09 — рязко спиране без причина (Наредба № 38: „много рязко
 * спиране, което създава предпоставка за ПТП" is an explicit BG examiner fail
 * cause — phantom braking is graded, not just collisions). Rides the
 * recorder's drive.maxDecelMps2 override: the default 4.6 m/s² stop envelope
 * sits under the HARSH_BRAKING_NO_CAUSE threshold (7 m/s², emergency-grade),
 * so only an authored ≥ 10 override can slam. The street is EMPTY (ambient 0,
 * no crossing/junction/signal), so every cause in the detector's ledger is
 * positively absent — the slam grades EXACTLY the phantom-brake code. The
 * shadow demonstrates the correct habit: the same stop, planned early and
 * braked progressively (~3.2 m/s²), grades nothing. Detector is default-ON
 * (no ruleConfig needed): the LIVE student session grades the same fault.
 */
export const SC_SP_HARSH_BRAKE: ScenarioSpec = {
  id: "sc-sp-harsh-brake",
  family: "speed",
  tagsBg: ["рязко спиране", "плавно спиране", "предвиждане", "удар отзад"],
  titleBg: "Рязко спиране без причина",
  objectiveBg:
    "Спирай планирано и плавно: вдигни газта рано и намалявай постепенно, така че движещите се зад теб да разберат намерението ти — рязкото забиване на спирачките без опасност пред колата е предпоставка за удар отзад и се брои като грешка.",
  archetypeIds: ["SP-11", "VP-09"],
  conceptIds: ["c-general-care-duty", "c-speed-adaptation"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-speed-creep — mirrored in sp-creep-v1.json
    // meta.scenario.params (tools/maps/gen_sp_speed.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-creep-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  // Founder R3 #35 (doc 62 — „braking with no visible reason"): the CALL here
  // is honest framing, NOT a staged obstacle. The drill's whole point is the
  // HARSH_BRAKING_NO_CAUSE detector — „рязко спиране БЕЗ причина": the street
  // must stay positively empty (the detector's cause ledger and both mistake
  // demos narrate exactly that emptiness), so a staged hazard would contradict
  // the graded code and the demos. Instead the copy now names the REASON the
  // planned stop exists (your own errand — спирка/адрес) and points at the
  // on-screen zone marker, so the stop is motivated without inventing danger.
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и установи спокойна скорост около 45 км/ч. Улицата е празна — никаква опасност: спирането тук е ТВОЕ решение, не реакция." },
    // B64. This line used to end „…представи си, че това е твоята спирка или
    // адрес", and the founder answered „the question states stopping out of
    // nowhere, but why?". It said IMAGINE because there was nothing to look at:
    // the map authored a canopy, a shop and a neighbour block, and a building
    // with no kind renders as a grey extruded box. `sp-b-stop-canopy` is now
    // `kind: "busStop"` and the world builds the shelter on the pavement beside
    // the graded zone (world/builders/props.ts), so the copy can stop asking him
    // to imagine and start telling him where to look.
    {
      n: 2,
      textBg:
        "Напред ВДЯСНО, до тротоара, има автобусна спирка — навесът се вижда отдалеч. Това е твоята спирка: там слизаш. Светещият маркер на пътя показва точно къде да спреш. Реши да спреш ОТРАНО, не в последния момент.",
    },
    { n: 3, textBg: "Вдигни газта първо и остави колата да губи скорост, после спирай постепенно и равномерно до пълен покой в зоната." },
    { n: 4, textBg: "Силната спирачка е само за истинска опасност: на празна улица рязкото забиване изненадва движещите се зад теб — точно това се брои за грешка." },
    { n: 5, textBg: "Потегли отново плавно и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-shb-stop",
      // THE CHIP TOLD HIM TO DRIVE THROUGH IT AND THE BRIEFING TOLD HIM TO STOP
      // IN IT — w10-4/w10-3, finding sc-sp-harsh-brake:543539f6. One
      // photograph, `.audit-frames/w10-3/frames/sc-sp-harsh-brake__pc-right/
      // 01-arrival.png`, carries both: «ЗАДАЧА 1/2 · Мини контролната зона с
      // планирано, плавно спиране · дръж под 50 км/ч» in the right column and,
      // an inch away in the ИНСТРУКЦИИ card, step 3 — «…спирай постепенно и
      // равномерно ДО ПЪЛЕН ПОКОЙ В ЗОНАТА». „Мини" is минавам: pass through.
      // The two sentences ask for opposite things about the same twelve metres.
      //
      // THE GATE IS NOT WHAT MOVED, and deliberately. This is a `reachZone` with
      // a 52 ceiling: reaching the zone at rest satisfies it, so the student who
      // obeyed the BRIEFING was never refused and no drive changes verdict here.
      // What was wrong is the sentence, and a sentence is what the student
      // obeys. The title now claims exactly what the gate measures — arrive in
      // the zone, already slowed — and the full stop stays where the lesson
      // teaches it, in step 3. Claiming the stop in the title instead would be
      // the parking3 defect in reverse (a chip promising a duty nothing
      // measures); that file's header records the five titles retired for it.
      titleBg: "Стигни контролната зона с планирано, плавно спиране",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-shb-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpHarshBrake.ts; gates in traces/__tests__/sp-harsh-brake-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-harsh-brake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-phantom-stop.trace.json" },
      titleBg: "Фантомно спиране",
      whatWentWrongBg:
        "На съвсем празна улица колата заби спирачките до пълен покой — „стори ми се, че нещо мръдна“. Пред нея нямаше нищо: нито пешеходец, нито кола, нито знак. Рязкото спиране без причина е точно грешката, която изпитващите описват като „предпоставка за ПТП“ — движещият се отзад няма как да го очаква.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-stab-crawl.trace.json" },
      titleBg: "Рязък натиск до пълзене",
      whatWentWrongBg:
        "Паническо набиване на спирачката от 47 км/ч до пълзене — заради сянка между паркираните коли, без реална опасност на пътя. Дори без пълно спиране внезапното силно забавяне е същата грешка: този зад теб вижда стоповете късно и разстоянието се топи. Съмняваш ли се — вдигни газта и намали плавно, не забивай.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране, което можеш да предвидиш — автобусна спирка, адрес, място за паркиране, край на отсечка. Решението за спиране се взима рано и се съобщава на другите с постепенно, равномерно спиране; резкият крак е запазен само за истинска опасност.",
    whyBg:
      "Ударът отзад е сред най-честите катастрофи в града и в около една трета от случаите го „поръчва“ спиращият — с внезапна, необяснима за другите спирачка. Плавното, планирано спиране дава на движещия се зад теб време да реагира и запазва управлението на колата; рязкото без причина е грешка дори когато нищо не се удари.",
    lawRef: "Наредба № 38 (рязко спиране — предпоставка за ПТП)",
    examinerBg:
      "Изпитващият следи как спираш през целия маршрут: „много рязко спиране, което създава предпоставка за ПТП“ е изрично посочена грешка. Очаква се ранно вдигане на газта, постепенно спиране и пълен контрол — силната спирачка е оправдана само при реална опасност пред колата.",
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
// 7. sc-sp-curve — „Скорост в завой" (SP-05) on sp-curve-v1: the FIRST
//    rural-curve map (gen_rural_curve.mjs) — an extra-urban 1+1 road posted 90
//    with a marked 90° arc (R 170) carrying the first curveAdvisory zone span
//    (advisory 50, знак А1 + табела). Sustained speed above the advisory
//    INSIDE the arc grades the CURVE-ENVELOPE основна SPEED_TOO_FAST_FOR_CURVE
//    (чл. 20 ал. 2); the approach and exit stay governed by the posted 90.
// ---------------------------------------------------------------------------

/** Inside-lane arc midpoint of sp-curve-v1 (meta.scenario.laneCurveMid). */
const CURVE_MID = { x: 52.66, y: 337.34 };
/** Exit-leg lane center of sp-curve-v1 (meta.scenario.exitLaneY). */
const CURVE_EXIT_Y = 385.94;

/**
 * SP-05 — несъобразена скорост в завой (ЗДвП чл. 20, ал. 2; SWOV: загубата на
 * контрол В ЗАВОЙ е НАЙ-свръхпредставената грешка на начинаещите — влизане
 * ~10 км/ч по-бързо, паническо спиране в дъгата, поднасяне/излизане от пътя).
 * The taught discipline: brake BEFORE the curve, never in it. Detector is
 * default-ON and structurally data-armed (only an authored curveAdvisory span
 * sets the tick field), so no ruleConfig is needed — the LIVE student session
 * grades the same fault.
 */
export const SC_SP_CURVE: ScenarioSpec = {
  id: "sc-sp-curve",
  family: "speed",
  tagsBg: ["скорост", "завой", "извънградско", "препоръчителна скорост", "знак А1"],
  titleBg: "Скорост в завой",
  objectiveBg:
    "Мини обозначения завой безопасно: свали скоростта до препоръчителните 50 км/ч ПРЕДИ завоя, дръж я равномерно през дъгата и ускорявай чак на излизане — спирачките работят на правата, не в завоя.",
  archetypeIds: ["SP-05"],
  conceptIds: ["c-speed-adaptation", "c-speed-limits", "c-general-care-duty"],
  map: {
    archetype: "rural-curve",
    // The generator recipe — mirrored in sp-curve-v1.json meta.scenario.params
    // (tools/maps/gen_rural_curve.mjs).
    params: { approachM: 220, radiusM: 170, sweepDeg: 90, exitM: 200, maxspeedKmh: 90, advisoryKmh: 50 },
    districtId: "sp-curve-v1",
  },
  start: {
    spawnPointId: "spc-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // „ИЗВЪНГРАДСКИЯТ ПЪТ" LOOKS LIKE A CITY, AND THE COPY IS THE HALF THAT IS
    // RIGHT (sweep161, sc-sp-curve/pc-right/01-arrival.png: five-storey blocks
    // both sides, street lamps, kerbs, a continuous rank of parked cars — the
    // rural road only appears after the first minute). This line stays as it
    // is: the district IS an extra-urban 90 road (content/world/sp-curve-v1
    // .json — one edge, maxspeed 90, one building, a barn) and the А1 + 90 disc
    // are posted correctly in the frame. Rewriting the copy to say „city" would
    // make the lesson legally wrong (90 км/ч inside a built-up area is not a
    // thing) — the DRESSING is what lies, not the sentence.
    // MEASURED cause, routed out of this file: the streetscape builders key off
    // edge CLASS, and gen_rural_curve.mjs authors this rural road as
    // `unclassified`, which world/builders/props.ts treats as residential-ish
    // (lamps, parapets, the tree pass at props.ts's `cls !== "residential" &&
    // cls !== "unclassified" && cls !== "living_street"` gate, props.ts:1615),
    // and TrafficLayer parks its procedural row along it.
    //
    // RE-MEASURED 2026-08-23 against the committed district, because one clause
    // of the routing above was wrong and would have sent the receiving lane to
    // the wrong file: content/world/sp-curve-v1.json holds ONE edge
    // (`spc-e-road`, class `unclassified`, maxspeed 90, 687 m), ONE building
    // (`spc-b-barn`, no `kind`) and one `curveAdvisory` zone. So the five-storey
    // blocks in the frame are NOT cityBuildings.ts — that builder places the kit
    // onto REAL footprints and this district has one, a barn. Whatever
    // synthesises the roadside blocks for a district with no footprints is the
    // thing to find; the frame
    // (.audit-frames/proof/frames/sc-sp-curve__pc-right/01-arrival.png) shows
    // blocks, lamps, a left-verge parapet and a full rank of parked cars beside
    // a correctly posted 90 disc.
    //
    // FOUND, 2026-08-27, AND IT IS NAMED HERE SO NOBODY HUNTS IT A THIRD TIME.
    // `world/builders/worldRim.ts`, added by the wave-3 repair (bbf1223) for
    // „the world simply runs out and the car keeps going".
    // `buildWorldGeometry.ts:472` calls `buildWorldRim` on EVERY district whose
    // `meta.mapKind` is a string — 102 `scenario-*` maps plus poligon-v1, i.e.
    // every map this file ships on — and it emits a CONTIGUOUS belt of building
    // masses on all four sides, handed to `buildBuildings(..., extraVolumes)`,
    // which pushes them through the same walls / roofs / collider accumulators
    // and the same `facadeVariant` hash as an authored блок. Read off
    // `builders/constants.ts`: the faces stand 43 m (inner) to 57 m (outer)
    // outside the declared box — TERRAIN_MARGIN_M 60 − WORLD_RIM_TERRAIN_INSET_M
    // 3, less TERMINUS_CLOSE_DEPTH_M 14, a mass stepping in by up to
    // WORLD_RIM_STEP_M 6 more — and are clamped to 9…22 m tall
    // (TERMINUS_CLOSE_MIN/MAX_HEIGHT_M). sp-curve-v1's box is −36.12…376 ×
    // −6…404.13, so the belt runs the whole length of the drill on both
    // shoulders. It reads `district.meta`, `district.buildings` and the road
    // POLYLINES; it never reads `edge.class`, so a 90 km/h извънградски път and
    // a residential street get the identical wall. That is the missing half of
    // the routing above — props.ts explains the lamps, the parapet and the
    // parked rank; worldRim explains the five-storey blocks.
    //
    // Still no scenario-side lever, and the exact edits (put the district in the
    // rim mass id so the belt stops repeating; make the belt's KIND follow
    // `edge.class`) plus the graded side effect are measured in
    // `environment/weather.ts` §2c.
    //
    // There is still no scenario-side lever: the spec carries no streetscape
    // field, and sp-curve-v1's only other spawn (`spc-spawn-exit`, x = 355,
    // y = 385.94) is PAST the curve, so it cannot be used to skip the dressed
    // approach without deleting the 220 m the drill brakes over.
    //
    // THE DISPOSITION IS MISROUTED, NOT REFUTED — 2026-08-30, and the word
    // matters because a judge reopened `sc-sp-curve:6079dfb1` on exactly that
    // distinction. An earlier pass filed this row REFUTED on the reading that
    // the frame «shows the opposite»; the judge re-opened the same PNG at 2.6×,
    // found the block on the LEFT and a nose-to-tail rank of parked cars down
    // the RIGHT kerb, and observed that REFUTED retires a row as never having
    // been a defect. It IS a defect: the world contradicts the copy. It is just
    // not one this file can hold, and the only clause of the finding that is
    // loose («blocks on BOTH sides») is an overstatement of the near field, not
    // a false premise. So: no code here, and the address below re-verified
    // against the CURRENT tree rather than quoted from the block above —
    //   · `buildWorldGeometry.ts:472` calls `buildWorldRim` unconditionally,
    //     and `worldRim.ts:180` admits any district whose `meta.mapKind` is a
    //     string. sp-curve-v1's is `"scenario-street"`, so the belt of
    //     building masses is still built on this map today.
    //   · `props.ts:1805` still runs the residential dressing pass for
    //     `cls === "unclassified"`, and sp-curve-v1's ONE edge (`spc-e-road`,
    //     maxspeed 90, 687 m) is `unclassified` — so the lamps, the kerbs and
    //     the parked rank are still authored onto a 90 км/ч rural road.
    // Neither file is this lane's, and neither reads anything a template can
    // set. The sentence stays as it is, for the reason given at the top of this
    // block: naming the road urban would make its own 90 км/ч illegal.
    { n: 1, textBg: "Потегли по извънградския път — тук ограничението е 90 км/ч и правата е свободна." },
    { n: 2, textBg: "Напред следва знак А1 „Опасен завой надясно“ с табела „50“ — препоръчителната скорост за завоя." },
    { n: 3, textBg: "Свали скоростта ПРЕДИ завоя: вдигни газта отрано и спри намаляването около 45–50 км/ч още на правата." },
    { n: 4, textBg: "Дръж скоростта равномерна през цялата дъга — без спирачки и без газ в завоя; гледай към изхода му." },
    { n: 5, textBg: "Щом воланът започне да се изправя, ускори плавно обратно към скоростта за правата." },
  ],
  success: [
    {
      id: "sc-spcv-approach",
      titleBg: "Измини подхода с разрешената скорост",
      // On the 90 approach — a normal ~85 rural cruise satisfies it.
      params: { kind: "reachZone", x: LANE_X, y: 170, radiusM: 12, maxSpeedKmh: 92 },
    },
    {
      id: "sc-spcv-curve",
      // THE TITLE DEFERRED TO A NUMBER AND THE CARD ANSWERED WITH A DIFFERENT
      // ONE — w10-4, finding sc-sp-curve:289575d7. On
      // `.audit-frames/w10-4/frames/sc-sp-curve__mobile-right/04-t113s.png` the
      // chip reads «ЗАДАЧА 2/3 · Мини средата на завоя с препоръчителната
      // скорост» and the cockpit strip under it «задачата иска ≤55», while
      // instruction 3 of the same briefing says «спри намаляването около 45–50
      // км/ч», instruction 2 names the табела „50", and the А1 plate in the
      // world posts 50. The task deferred to „the recommended speed" and the
      // only figure the student was held to was 55 — five above the one thing
      // in this lesson that recommends anything.
      //
      // READ THE FRAME CAREFULLY, THOUGH — the disc visible on 04-t113s.png is
      // the В26 regulatory limit and it reads 90. The 50 is the А1 ADVISORY,
      // and the two are different scales and different articles (чл. 21 vs
      // чл. 20, ал. 2), which is exactly why this repair is worth making
      // carefully. The 50 is verifiable in this file rather than on that photo:
      // the map recipe below is `maxspeedKmh: 90, advisoryKmh: 50`, and the new
      // gate binds this title's figure to `map.params.advisoryKmh`, not to
      // whatever number happens to be painted on a disc in shot.
      //
      // WHY THE TITLE AND NOT THE GATE. 55 is authored: „the adapted 48 passes,
      // the 70 hold does not", and the curve fault itself
      // (SPEED_TOO_FAST_FOR_CURVE) grades off the advisory + grace independently
      // of this waypoint. Tightening 55 to 50 would refuse drives this rung
      // currently credits — the one direction a repair may never move — so the
      // gate is untouched and the SENTENCE is corrected. `advisor.ts
      // titleCapKmh` takes the strictest figure the author put in the title and
      // `Math.min`s it against the gate, so the card now says 50 and a student
      // who obeys 50 still clears 55 with room. Two numbers became one, and it
      // is the one the табела posts.
      titleBg: "Мини средата на завоя с препоръчителните 50 км/ч",
      // Mid-arc control zone (meta.scenario.laneCurveMid), cap just above the
      // advisory + grace: the adapted 48 passes, the 70 hold does not.
      params: { kind: "reachZone", x: CURVE_MID.x, y: CURVE_MID.y, radiusM: 12, maxSpeedKmh: 55 },
    },
    {
      id: "sc-spcv-finish",
      titleBg: "Излез от завоя и продължи по правата",
      params: { kind: "reachZone", x: 330, y: CURVE_EXIT_Y, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpCurve.ts; gates in traces/__tests__/sc-sp-curve-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-curve/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-hold-speed.trace.json" },
      titleBg: "Със скоростта от правата в завоя",
      whatWentWrongBg:
        "Колата влезе в обозначения завой с около 70 км/ч — цели 20 над препоръчителните 50 от табелата. В дъгата гумите нямат резерв за нищо друго: една дупка, мокро петно или по-остър радиус и колата излиза от пътя. Точно тази грешка е най-честата причина начинаещи да катастрофират сами, без никой друг на пътя.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-brake-late.trace.json" },
      titleBg: "Спиране В завоя вместо преди него",
      whatWentWrongBg:
        "Намаляването започна чак В дъгата — колата влезе с ~85 и спирачките работиха в самия завой, а скоростта така и не слезе под препоръчителната. Спирането в завой краде от сцеплението за завиване и е рецептата за поднасяне: цялото намаляване се прави на правата, преди волана да се завърти.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
  ],
  teach: {
    whenBg:
      "При всеки обозначен завой извън населено място — знак А1/А2, често с табела с препоръчителна скорост. Ограничението 90 важи за правата; завоят има собствена безопасна скорост и тя се чете от знака и от геометрията на пътя.",
    whyBg:
      "Изследванията на SWOV показват: загубата на контрол в завой е НАЙ-типичната самостоятелна катастрофа на начинаещия водач — влизане само с 10 км/ч повече, паника, спирачка в дъгата, поднасяне. Гумите имат едно сцепление и то се дели между завиване и спиране: свалиш ли скоростта преди завоя, цялото сцепление остава за завиването.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият очаква видимо, навременно намаляване ПРЕДИ завоя — не спирачки в дъгата. Несъобразената с пътните условия скорост е грешка дори в рамките на общото ограничение; равномерното преминаване и плавното ускоряване на излизане показват контрол.",
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
// 8. sc-mw-discipline — „Дисциплина на магистралата" (SP-10 + OV-11) on mw-v1:
//    the FIRST motorway-segment map (gen_motorway.mjs) — a divided 2+2
//    motorway posted the honest АМ 140, each carriageway carrying an
//    emergency curb lane (an authored "emergencyLane" zone span + the
//    edge-level motorway tag). TWO DISTINCT lane/speed faults, one template
//    (the sc-speed-zone precedent):
//      - „Висене в лявата лента при 130" → NOT_KEEPING_RIGHT (the shipped
//        keep-right detector at motorway speed — the ln-v1 precedent needed
//        ZERO new code; the emergencyLaneRight seam makes laneId 1 the
//        rightmost REQUIRED lane);
//      - „Пълзене с 40 без причина" → DRIVING_TOO_SLOW_FOR_MOTORWAY (the
//        SP-10 crawl detector this slice ships — второстепенна on the
//        VERIFIED чл. 22, ал. 1 basis; NO general BG motorway minimum exists, see
//        rules/catalog.ts).
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario — the L7 copy truth). */
const MW_X_CRUISE = 0;
/** …and its OVERTAKING lane centre (meta.scenario.laneLeftX). The flow rides
 *  here; see THE FLOW below for why the lane is the whole of the design. */
const MW_X_LEFT = -8.12;
/**
 * …and the lane a staged actor lands in on this edge with NO offset
 * (meta.scenario.laneEmergencyX).
 *
 * MEASURED, because guessing it put the flow car in the student's own lane and
 * billed the shadow drive FOLLOWING_TOO_CLOSE. `resolveStagedVehiclePath`
 * (traffic/system.ts) places an actor in the RIGHTMOST lane of its edge and
 * then applies `extraRightOffsetM`; `mw-e-nb` is authored `lanes: 3` — the two
 * travel lanes PLUS the emergency lane — so the rightmost lane is the
 * EMERGENCY one, not the cruise lane the student drives. The player's own
 * grading uses the `emergencyLaneRight` seam to make laneId 1 the rightmost
 * REQUIRED lane; the staged path resolver does not, and nothing reconciles
 * them. So an actor's offset on THIS map is measured from +8.13, not from 0.
 *
 * Watched: `extraRightOffsetM: MW_X_LEFT − MW_X_CRUISE` (= −8.12) put the car
 * at x = +0.01, i.e. exactly on the student's line, and the shadow's leadGap
 * fell to 17.7 m at 125 км/ч — the trace gate's zero-violation assertion went
 * red with FOLLOWING_TOO_CLOSE. That is what a lane guessed rather than
 * measured costs, and it is the same defect class as the one being repaired.
 */
const MW_X_STAGED_DEFAULT = 8.13;

/**
 * The flow's pace, m/s — 36.0, i.e. ~129.6 км/ч.
 *
 * IT IS A CEILING, NOT A TASTE. `sim/collision/__tests__/index.test.ts` walks
 * every authored `cruiseSpeedMps` in the catalogue and budgets the CONTACT
 * SWEEP against the fastest of them: the worst frame the physics clock can
 * produce is (PLAYER_TERMINAL_MPS 46.78 + fastest) × the 0.5 s rapier clamp,
 * plus the rotation term, against `SWEEP_FRAME_TRAVEL_M` = 60 m — past which
 * `ContactProbe` stops treating an interval as motion at all and the geometry
 * BLANKS. The catalogue's fastest car is 36.0 (sc-merge-motorway-exit's rear
 * tailgater) and the budget is measured from it: 41.39 m of translation,
 * 55.33 m of ceiling, 8.4 % of headroom on the binding row.
 *
 * Authored at 38 (the first cut of this actor, ~137 км/ч) that becomes 42.39 /
 * 56.33 and the headroom falls to 6.5 % — a real safety margin spent on 7 км/ч
 * of scenery. So the flow rides at the ceiling the catalogue already carries.
 *
 * IT IS STILL THE FLOW, and it is arguably the better teaching object at 130
 * than at 137: instruction 2 asks him to settle at «120–130 км/ч — със
 * скоростта на потока», so a car doing 130 is the flow EXACTLY. Drive 120 and
 * it pulls away from you; drive 130 and you hold station with it. What it may
 * never be is SLOWER than any leg this lesson ships, because the whole safety
 * argument for a solid body here is that the gap only ever opens — and it is
 * not: the left-lane hog demo, the fastest of the three, drives 130 км/ч =
 * 36.11 m/s and starts 135 m astern, so it closes at 0.11 m/s and would need
 * 20 minutes to arrive on a 26 s route. Guarded in
 * __tests__/sp-mw-flow-visible.test.ts §2.
 */
const MW_FLOW_MPS = 36;

/**
 * THE FLOW — one car in the OVERTAKING lane, doing the speed the briefing
 * names (finding sc-mw-discipline:3bec2af1, major; frame
 * .audit-frames/sweep161/sc-mw-discipline/pc-right/04-t103s.png and every
 * frame of all four legs: not one other vehicle anywhere).
 *
 * THE COMPLAINT. Instruction 2 is «установи се около 120–130 км/ч — на
 * магистрала се кара със скоростта на потока» and instruction 4 grades crawling
 * far below that flow. Both are judgements about traffic the student cannot
 * see. A drill that asks a seventeen-year-old to match a flow, and then grades
 * him against it on an empty road, is teaching him to read a number off the
 * HUD — which is the opposite of the habit («скоростта се чете от пътя, не от
 * километража») this family exists to build.
 *
 * WHY A LEAD IN THE LEFT LANE AND NOT A PASSER BEHIND. The passer is the more
 * vivid picture and it is the shape sc-speed-dangerous uses, but this template
 * is different in one decisive way: its OWN mistake demo puts the student in
 * the LEFT lane for a kilometre («Висене в лявата лента при 130»), and its
 * other one crawls him along the CRUISE lane at 40. A `rearTailgater` closing
 * from astern therefore ends up inside one of the two shipped recordings
 * whichever lane it is given — it stages `playerGuard: false` by design (its
 * sub-6 m лепка pose needs that) and its `passSpeedMps` is above what any
 * guard could arrest anyway. It would not GRADE anything (its `contactCast` is
 * empty by policy), which is exactly what makes it dangerous here: it would
 * simply drive THROUGH the student in a demo the product renders as a clip.
 *
 * A lead that is always FASTER than the student cannot do that. This one holds
 * 285 m up the overtaking lane, arms when he is within 200 m and then cruises
 * its own arc at ~137 км/ч under `scheduledCruise` — faster than the 125 the
 * shadow drives, faster than the 130 the hog drives, and immeasurably faster
 * than the 40 the crawl drives. Every leg the gap OPENS, so the one solid body
 * in this lesson can never be reached from behind, in any lane, on any rung.
 *
 * AND THE LANE IS LOAD-BEARING FOR A SECOND REASON — the one this file learned
 * on sc-speed-dangerous (see THE LAP): a `brakingLeadCar` publishes a
 * `contactCast` billed to the player, and FR-B5-RETURN re-enters a retired
 * actor at its hold pose, behind him, under the command it left with. In the
 * student's own lane that is a rear-end billed to the victim. One lane pitch
 * over it is a car going past, which is what it always should have been.
 *
 * WHY NOT AMBIENT TRAFFIC, still. `spec.traffic.vehicleCount` would break the
 * determinism law (ambient 0, seed 7) AND buy a false pass: the crawl detector
 * exempts a car that is merely stuck behind someone, so an ambient car that
 * happened to be in the CRUISE lane ahead could turn a real 40 км/ч crawl into
 * a clean sheet. A staged actor in the OVERTAKING lane is not a lead in his
 * lane and cannot be mistaken for a queue — which the trace gate now proves
 * rather than assumes: «Пълзене с 40» still grades exactly
 * DRIVING_TOO_SLOW_FOR_MOTORWAY with the flow car staged.
 *
 * SLAM TIER AUTHORED OUT OF REACH (slamAt past the 2600 m road end,
 * minSlamSpeedKmh 250, proximityFallbackM 0.3 unreachable): deterministic
 * moving traffic, never a braking drill.
 */
const MWD_FLOW_LEAD: BrakingLeadCarSpec = {
  id: "sc-mwd-flow-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    // ~135 m up the road from the spawn: ~4 s of headway at the taught 125 —
    // near enough to READ as a car rather than a dot on a 2600 m straight —
    // and it is the buffer the „only ever opens" argument spends, because at
    // MW_FLOW_MPS the fastest leg (the 130 км/ч hog) closes at 0.11 m/s.
    hold: { nodeIndex: 0, offsetM: 150 },
    cruiseSpeedMps: MW_FLOW_MPS,
    // The OVERTAKING lane, x ≈ −8.12 — measured from the EMERGENCY lane this
    // edge's rightmost lane actually is (see MW_X_STAGED_DEFAULT), not from
    // the cruise lane the student drives.
    extraRightOffsetM: MW_X_LEFT - MW_X_STAGED_DEFAULT,
    colorIndex: 5,
  },
  // Under `scheduledCruise` this is only the release distance's fallback — the
  // authored `armDistM` below is what actually releases it. It is kept at a
  // motorway-plausible station so a future switch back to the band would not
  // silently pin the actor at max speed (the sc-speed-dangerous trap).
  followGapM: 90,
  maxMatchSpeedMps: MW_FLOW_MPS,
  paceMode: "scheduledCruise",
  paceSpeedMps: MW_FLOW_MPS,
  // > the 135 m it holds ahead of the spawn, so it is ROLLING FROM THE FRAME HE
  // IS. Authored, not defaulted, and the reason is a picture: `scheduledCruise`
  // waits at its hold until this distance, and any smaller number leaves a car
  // STANDING STILL in the overtaking lane of a motorway while he closes on it
  // at 125 км/ч. A stopped car in the fast lane is an emergency, not потокът —
  // measured at a 285 m hold and armDistM 200 it stood there for the first ~9 s
  // and the student then closed to 22 m of it. Released with him, it only pulls away.
  armDistM: 320,
  slamAt: { x: MW_X_LEFT, y: 4000 }, // far past the 2600 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // …the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * SP-10 — скорост на потока + дръж вдясно на автомагистрала (ЗДвП чл. 15,
 * чл. 21, чл. 22, ал. 1; motorway speed-differential crash studies — the far-below-
 * flow car is a mobile chicane). Detectors are default-ON and structurally
 * data-armed (edge motorway tag + emergencyLane span — no other map carries
 * them), so no ruleConfig is needed — the LIVE student session grades both.
 * RE-VERIFIED 2026-08-18 against the shipped defaults: rules/types.ts
 * `motorwayMinSpeedEnabled: true` and `keepRightSustainSec: 12`.
 *
 * THE MISSING „ПОТОК" (sweep161 — sc-mw-discipline/pc-right/04-t103s.png and
 * every frame of all four legs: not one other vehicle anywhere). The concept
 * this lesson names is the speed of the flow, and there was no flow to read.
 * CLOSED by `MWD_FLOW_LEAD` above — one staged car in the OVERTAKING lane at
 * ~137 км/ч, which is the flow, seen from the lane the drill asks him to hold.
 * The design note there explains why it is a lead in the LEFT lane and not the
 * passer sc-speed-dangerous uses (this template's own mistake demos put the
 * student in BOTH lanes, so an actor that closes from astern ends up inside a
 * shipped recording), and why AMBIENT traffic stays refused — it would break
 * the determinism law AND could buy a false pass, because the crawl detector
 * exempts a car merely stuck behind someone (`leadGapM >
 * cfg.motorwaySlowQueueGapM`, rules/engine.ts). The trace gate now measures
 * that rather than assuming it: with the flow staged, «Пълзене с 40» still
 * grades exactly DRIVING_TOO_SLOW_FOR_MOTORWAY, once.
 * The wrong-drive column of that same sweep leg is NOT evidence of a hole here:
 * pc-wrong held the throttle, ran 136 км/ч in the cruise lane and passed with
 * 0 errors — which is the correct verdict, because on a 140 motorway that IS a
 * lawful drive. The two faults this lesson grades are both proven reachable by
 * the trace gate above.
 */
export const SC_MW_DISCIPLINE: ScenarioSpec = {
  id: "sc-mw-discipline",
  family: "speed",
  tagsBg: ["магистрала", "скорост на потока", "дръж вдясно", "лентова дисциплина"],
  titleBg: "Дисциплина на магистралата",
  objectiveBg:
    "Измини магистралния участък като част от потока: установи се в ДЯСНАТА лента за движение с около 120–130 км/ч и я дръж — лявата е само за изпреварване, а пълзенето далеч под потока е също толкова грешно, колкото и превишаването.",
  archetypeIds: ["SP-10", "OV-11"],
  conceptIds: ["c-motorway-rules", "c-speed-limits", "c-lane-choice"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params
    // (tools/maps/gen_motorway.mjs).
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
    // THE МАНТИНЕЛА THAT IS NOT THERE (sweep161, sc-mw-discipline/mobile-right/
    // 04-t208s.png — and every other frame of all four legs). The line used to
    // read „платното е разделено с мантинела". MEASURED: nothing in this
    // product can build a median crash barrier. `DistrictZone.barrier`
    // (world/types.ts) is the railCrossing BOOM timetable, not a guard rail;
    // the only railing props.ts builds is the pavement parapet (RAILING_*),
    // which stands at the back of a KERB, takes the LEFT verge first and
    // `continue`s outright when the verge is bare — and a motorway median is
    // exactly a bare verge. So the sentence could never have been true on any
    // map, and on mw-v1 the student looks at a grey strip with grass.
    //
    // What IS authored stays said: mw-v1's meta.scenario.params.medianM is 6
    // and the two carriageways really do sit apart (nb x = 0, sb x = -30.37),
    // so „отделни платна, разделени с ивица" is a fact the world renders. The
    // claim gate: __tests__/sp-world-claims.test.ts — and it fails the moment
    // any SP briefing names a мантинела again, until a builder exists to draw
    // one (routed: world/builders/props.ts + a district-schema feature).
    //
    // AND THE TWO LINES HE ACTUALLY READS NOW END ON A FULL STOP — 2026-08-30,
    // finding sc-mw-discipline:b080a007. On the phone the briefing arrives as
    // the notify column's PEEK, and on an iPhone 16 sideways that peek is two
    // line boxes tall: `.audit-frames/wave-c/frames/sc-mw-discipline__mobile-
    // right/01-arrival.png` shows «Потегли по магистралата —» / «ограничението
    // е 140 км/ч, а», then «↓ ОЩЕ 20 РЕДА», then ПРОЧЕТИ and РАЗБРАХ side by
    // side. A seventeen-year-old can dismiss that card having read a clause
    // that stops on a dangling conjunction.
    //
    // THE HEIGHT IS NOT THIS FILE'S and is not touched here: the peek's ceiling
    // is SimOverlay.tsx's inline `maxHeight` against notifyColumn.ts's
    // `NOTIFY_COLUMN_MAX_STAGE_FRACTION`, which resolves to 95.75 px on the
    // 852 × 393 stage this catalogue is shot at — the arithmetic and the route
    // are already written out in PlayAreaStyles.tsx («the measurable part of
    // the w12 rows that photograph two lines of a 26-line briefing»). The
    // mid-WORD half of the filing is likewise already closed elsewhere:
    // `SimOverlay.foldWindowPx` masks the window to the LINE GRID at both ends,
    // so a line is whole or absent rather than inked to its waist.
    //
    // WHAT IS THIS FILE'S is which words land in those two boxes, and the comma
    // splice put a conjunction there. Greedy-wrapping at 26 characters — the
    // width that reproduces the photographed badge EXACTLY (5 steps → 22 lines
    // → «ОЩЕ 20») — the sentence below now breaks «Потегли по магистралата —» /
    // «ограничението е 140 км/ч.» and the second box ends the sentence. Same
    // claims, same 5 steps, same line count, and the sp-world-claims gate's
    // /отделни платна|раздел/ still matches the half that moved into its own
    // sentence. This MITIGATES the row; it does not close it — 24 lines are
    // still behind the fold, and that is the ceiling's to answer.
    //
    // MEASURED WHILE HERE, because it is this file's doing: instruction 2 grew
    // from 98 to 215 characters when finding 3bec2af1 was repaired, so the same
    // wrap now gives 26 lines and the badge reads «ОЩЕ 24», worse than the 20
    // in the photograph. The tail «— караш ли 120, тя бавно ти се отдалечава»
    // is the cheapest 2 lines in the briefing, but it is another lane's
    // deliberate teaching and is left alone rather than quietly undone.
    { n: 1, textBg: "Потегли по магистралата — ограничението е 140 км/ч. Двете посоки вървят по отделни платна, разделени с ивица по средата." },
    // THE FLOW IS NOW OUT THE WINDSCREEN (finding sc-mw-discipline:3bec2af1 —
    // see THE FLOW at MWD_FLOW_LEAD). The line used to ask the student to match
    // „потока" on a road with not one other vehicle on it; it now points at the
    // car that IS the flow, so the number he is asked to hold has something to
    // be read against. The claim gate: __tests__/sp-world-claims.test.ts.
    { n: 2, textBg: "Погледни колата в лявата лента напред — тя се движи с потока, около 130 км/ч. Ускорявай уверено и се установи около 120–130 км/ч: на магистрала се кара със скоростта на потока — караш ли 120, тя бавно ти се отдалечава." },
    { n: 3, textBg: "Дръж ДЯСНАТА лента за движение: лявата е само за изпреварване, а аварийната вдясно не е лента за движение изобщо." },
    { n: 4, textBg: "Не пълзи: трайно движение далеч под потока (под 50 км/ч без причина) прави от колата ти подвижно препятствие." },
    { n: 5, textBg: "Задръж скоростта и лентата до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwd-lane",
      titleBg: "Мини контролната зона в дясната лента за движение",
      // Radius 6 pins the CRUISE lane (lane centers sit 8.12–8.13 m apart):
      // the left-lane hog and an emergency-lane rider both miss it.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 520, radiusM: 6, maxSpeedKmh: 140 },
    },
    {
      id: "sc-mwd-finish",
      titleBg: "Стигни края на участъка",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 940, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMwDiscipline.ts; gates in traces/__tests__/sc-mw-discipline-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mw-discipline/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-left-hog.trace.json" },
      titleBg: "Висене в лявата лента при 130",
      whatWentWrongBg:
        "Колата се настани в ЛЯВАТА лента и остана там с километри, без да изпреварва никого. И на магистрала важи чл. 15: движиш се във възможно най-дясната свободна лента за движение — лявата се освобождава за по-бързите, иначе целият поток се подрежда зад теб.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-crawl.trace.json" },
      titleBg: "Пълзене с 40 по магистралата",
      whatWentWrongBg:
        "Колата запълзя трайно с около 40 км/ч по свободна магистрала — без задръстване, без повреда. Потокът тук се движи със 120–140: разликата от 80–100 км/ч прави пълзящата кола подвижно препятствие, което всички трябва да заобикалят. Магистралата изобщо допуска само превозни средства, способни на повече от 50 км/ч.",
      codeRefs: ["DRIVING_TOO_SLOW_FOR_MOTORWAY"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение по автомагистрала и скоростен път — от включването до напускането. Двете дисциплини вървят заедно: скорост, близка до потока, и възможно най-дясната свободна лента за движение.",
    whyBg:
      "Катастрофите на магистрала се раждат от РАЗЛИКИ в скоростта, не от самата скорост: кола с 40 км/ч в поток от 130 се приближава със 90 км/ч — колкото челен удар в града. Затова и пълзенето, и висенето в лявата лента са грешки: и двете карат потока да маневрира около теб, точно там, където маневрите са най-скъпи.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият очаква уверено движение със скоростта на потока в дясната лента за движение: трайното движение в лява лента без изпреварване е грешка, а пълзенето далеч под потока без причина — също. Лентите се сменят само с огледало и мигач, с ясна причина.",
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
  // THE FLOW (finding sc-mw-discipline:3bec2af1). In `staged`, not `stagedAdd`:
  // the concept the lesson grades — «скоростта на потока» — is not a level-5
  // complication, it is the lesson, and a student on any rung has to be able to
  // SEE it. All three committed recordings were re-verified against this cast
  // (traces/__tests__/sc-mw-discipline-traces.test.ts §5/§9).
  staged: [MWD_FLOW_LEAD],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The speed-management templates, in catalog order (registered in
 *  templates.ts).
 *
 *  sc-speed-rain is registered FIRST on purpose (founder ruling): the why-panel
 *  rep is derived deterministically as the FIRST mistake in SCENARIO_TEMPLATES
 *  order whose codeRefs match an event's codes (whyPanel.ts buildSimRefIndex).
 *  sc-speed-rain__m0 grades SPEEDING_DANGEROUS → ev-speed-limit; placing rain
 *  ahead of sc-speed-creep (SPEEDING_OVER_LIMIT, also ev-speed-limit) makes the
 *  founder-locked ~72 km/h rain-night blast the SERVED clip for the
 *  dangerous-speeding question — and mistake[1] (48 km/h „поток") remains the
 *  ev-speed-for-conditions rep. Reordering here is the whole mechanism; no
 *  other event's rep changes (verified in whyPanel/clipPilot gates). */
export const SCENARIO_TEMPLATES_SP: readonly ScenarioSpec[] = [
  SC_SPEED_RAIN,
  SC_SPEED_CREEP,
  SC_SPEED_DANGEROUS,
  SC_SPEED_ZONE,
  SC_SPEED_TRANSITION,
  SC_SP_HARSH_BRAKE,
  SC_SP_CURVE,
  SC_MW_DISCIPLINE,
];
