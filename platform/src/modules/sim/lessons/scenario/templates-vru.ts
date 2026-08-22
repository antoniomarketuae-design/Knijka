/**
 * Scenario templates — the VULNERABLE-ROAD-USER family, S3 batch 6 (doc 72 §7
 * „Family VU"): the one ✅ FULL, cleanly-gradable VRU archetype today, staged on
 * a purpose-built T-junction micro-map, DATA ONLY in the templates.ts mold
 * (coordinates denormalized from the committed district file so nothing loads
 * world JSON at runtime; the trace-gate battery asserts every pinned value
 * against the generated map):
 *
 *  - sc-vu-cyclist-hook  „Десен завой през велосипедист"  (VU-01, vu-cyclist-v1)
 *
 * It stages the SHIPPED `cyclistRightHook` kind — a narrow curb-riding
 * vehicle-agent (the honest v1 cyclist proxy, audit C3) travelling the DRIVER'S
 * OWN direction, so the runtime's conflictFromRight same-direction filter
 * correctly ignores it and the ONLY thing that grades the hook is the staged
 * director (orchestrator/runners.ts CyclistRightHookRunner). Each mistake demo
 * cites SHIPPED rules-catalog codes and grades EXACTLY them when replayed
 * through the production stack (the §5/§9 gate, traces/__tests__/
 * sc-vu-cyclist-hook-traces):
 *   - shadow → ZERO violations + YIELDED_TO_PRIORITY (waited the cyclist past
 *     the mouth, THEN turned right into the cleared gap);
 *   - „Завой пред велосипедиста" → EXACTLY FAILED_TO_YIELD (right turn started
 *     with the cyclist still alongside within the danger radius — the classic
 *     right hook; prioritySituation "cyclist-right-hook" violated);
 *   - „Удар във велосипедиста" → EXACTLY COLLISION (turned into the cyclist —
 *     contact through the existing collision(cyclist) reducer).
 *
 * The map carries NO signal, sign, crossing or roundabout, and control is
 * "none" (uncontrolled) so ZERO stop-line/priority code can pollute the demo;
 * every drive runs ambient traffic ZERO (seed 7): the ONLY actor is the cyclist
 * and the ONLY fault the rule engine can grade is how the driver treats it.
 *
 * Family: "vru" — the doc-76 §2 chip (already in ScenarioFamily/SCENARIO_FAMILIES
 * + FAMILY_ICONS 🚲); the id (sc-vu-*) matches the sc-<family>-<slug> standard.
 *
 * Doc-72 provenance: VU-01 is the single "Engine: ✅ FULL" archetype of Family
 * VU (the shipped cyclist proxy). ADR-006 stage 1b adds VU-09 („Линейка
 * отзад" — the emergency actor + yield adjudication, prioritySituation
 * "emergency" → EMERGENCY_NOT_YIELDED / YIELDED_TO_PRIORITY):
 *
 *  - sc-vu-emergency  „Линейка отзад"  (VU-09, ln-v1 — the 2+2 boulevard)
 *
 * ADR-006 stage 1c adds VU-10 („Линейка на кръстовището" — the junction EV
 * recipe on the shipped machinery):
 *
 *  - sc-vu-emergency-junction  „Линейка на кръстовището"  (VU-10, tj-rhr-v1)
 *
 * MECHANIC CHOICE (documented per the stage-1c mandate): the shipped
 * emergencyApproach adjudication arms strictly on BEHIND + CLOSING in the
 * player's frame (EM arm: behindM > 2 && ≤ armBehindM && actor faster) — a
 * CROSSING EV approaches from the side/ahead, so that runner structurally
 * cannot see it, and forking a second "emergency" adjudicator for crossing
 * geometry would be new grading, which VU-10 explicitly does not add (doc 72:
 * "extends VU-09's capability, no extra grading"). The clean, honest mechanic
 * is the existing junction-conflict machinery: the EV is staged as the
 * priorityFromRight crossing actor (profile "emergency" — the white rig +
 * blue light bar) through the UNCONTROLLED tj-rhr junction, arriving from the
 * player's right, so the runtime's own right-hand-rule tracker adjudicates:
 *   - barging in front of it grades EXACTLY FAILED_TO_YIELD (опасна, 10 т.) —
 *     on this junction the EV holds priority twice over (чл. 91 special
 *     regime AND чл. 50 право отдясно), so the junction-priority conviction
 *     is legally honest;
 *   - yielding earns YIELDED_TO_PRIORITY (the tracker's own commendation).
 * The чл. 91 make-way TEACHING lives in this template's copy (objective,
 * instructions, teach card) — the graded code stays a shipped one.
 *
 * VRU-INTERACTION pack slice 1 (doc 72 §15 item #8 / N8) adds VU-02 + VU-04
 * on two purpose-built straight streets (tools/maps/gen_vu_streets.mjs):
 *
 *  - sc-vu-pass-clearance  „Изпреварване на велосипедист"  (VU-02, vu-pass-v1)
 *    — the LATERAL-CLEARANCE duty (ЗДвП чл. 42). The staged actor REUSES the
 *    shipped cyclistRightHook kind as a plain curb-cruise recipe: the
 *    "junction" is the street's far end node, which the driver never turns
 *    right at, so the CyclistRightHookRunner only ever contributes its
 *    release choreography + the collision(cyclist) contact channel — the
 *    GRADING is the NEW runtime vulnerable-pass tracker (worldRuntime
 *    VULNERABLE_PASS_*: min lateral distance over the alongside phase;
 *    prioritySituation "vulnerable-pass" → VULNERABLE_PASS_TOO_CLOSE /
 *    YIELDED_TO_PRIORITY). NO new actor type (the N8 mandate).
 *
 *  - sc-vu-door-zone  „Зоната на вратата"  (VU-04, vu-door-v1) — the parked-
 *    row discipline (ЗДвП чл. 20; the opener's duty чл. 95 lives in the
 *    copy). The row is meta.scenario.bays (precise hittable cars in the
 *    scene, lotObstacleRects headless); the DOOR is a TIMED trace obstacle
 *    (ObstacleRect2D.trigger — arms on the player's approach, the telltale
 *    position-latch discipline). Mistake composition (documented ruling):
 *    hugging the row grades COLLISION (the door); the late dodge into the
 *    oncoming bank grades CROSSED_SOLID_LINE via the authored М1 span over
 *    the row — ONE honest code per demo, no staged oncoming needed. SCENE
 *    DESCOPE (honest): the live scene renders the parked row but NO door
 *    mesh/collider — the door ambush lives in the recorded demos + copy
 *    (annotations carry the beat); a swinging-door scene prop is a later
 *    polish item.
 *
 * NOTE on doc-72 numbering: the DOOR archetype is VU-04 („Вратата"); VU-03 is
 * the cyclist swerve-out, which slice 1 ships only as the vulnerable-pass
 * tracker's SWERVE STAND-DOWN (the margin lesson's honest half), not as a
 * scripted path-deviation actor.
 *
 * VU-05/06 stay 🟡 PARTIAL (recipe/world only) and VU-03 (scripted swerve
 * actor)/07/08/11/12/13/14 stay 🔴 NEW — later waves.
 *
 * ── 2026-08-17 · WHAT THE DEPLOYED BUILD ACTUALLY DID, MEASURED ─────────────
 *
 * The catalogue sweep drove all five of these on staging (tools/mobile/
 * lesson-audit.mjs, mobile + pc, a careful drive and a flat-out drive each) and
 * read the credit off the DEBRIEF. Four defects survived every test in this
 * repository because every test in this repository replays the AUTHORED ghost,
 * and an authored ghost does exactly what its author meant:
 *
 *  1. FIVE reachZone rows certified a fact `stepReachZone` cannot see. It is
 *     handed (params, prevState, tick) and SimTick carries position, speed,
 *     lane, indicator — and NOTHING about another road user. So «след като
 *     велосипедистът е преминал», «пропусни линейката», «след като линейката е
 *     преминала», «Изпревари велосипедиста» and «Подмини вратата» were all
 *     awarded for arriving at a coordinate. MEASURED: sc-vu-pass-clearance
 *     finished ИЗДЪРЖАН · 0 т. · ★★★ on BOTH drives — the flat-out 59 км/ч run
 *     ticked «Изпревари велосипедиста с широка дъга» at 0:47 and the careful
 *     run at 2:34 having never caught the rider at all. Same remedy as the
 *     junctions3/rail rows (commit cdb2f71): the title says what the disc
 *     measures, the duty keeps its grader in the rule engine.
 *  2. sc-vu-emergency handed the чл. 91 COMMENDATION to the drive that ignored
 *     the ambulance. MEASURED: «✓ Правилно отстъпено предимство» at 0:06 (pc)
 *     and 0:14 (mobile) on the run that held the throttle for 210 s and never
 *     braked. Cause + fix at EM_APPROACH.accelMps2 below.
 *  3. sc-vue-made-way's disc was r8 on a map whose lane pitch is 8.125 m, so
 *     „вдясно" rested on thirteen centimetres. Tightened to r4; see the row.
 *
 *     THE OTHER HALF OF THAT ENTRY WAS WRONG AND IS RECORDED HERE RATHER THAN
 *     DELETED (2026-08-18). It read: „`maxSpeedKmh: 55` on a road posted 50 is
 *     a cap nobody driving lawfully can fail, which nonetheless ARMS the
 *     evaluator's grace capsule and hands every student 5 extra metres —
 *     removed." Nobody driving LAWFULLY can fail it, and that is the point: the
 *     tier governor reaches 58–59 км/ч here, so the cap refused the unlawful
 *     run and printed the one teach card this row ever produced. And the
 *     capsule reaches only `capMet`, never `reached`, on a cap that is not a
 *     halt demand — so a capped zone accepts a strict subset of what the same
 *     zone without one accepts, and „it can only widen" is not something a cap
 *     is able to do. The cap is back at 55; the property is swept in
 *     objectives.test.ts.
 *  4. sc-vu-pass-clearance had no gradient at all: the lane centre itself
 *     landed inside the runtime's SILENT grace band, so a driver who never
 *     touched the wheel was neither convicted nor commended. Arithmetic and
 *     fix at VU_PASS_CYCLIST.
 *
 * WHAT THE SWEEP GOT WRONG, recorded here so it is not "fixed" again: it filed
 * „there is no ambulance" against sc-vu-emergency and sc-vu-emergency-junction.
 * The junction one is real — mobile-wrong books «Непропускане на ППС с
 * предимство» against it — and the frames DO under-sample: at 5–6 s spacing a
 * 3 s crossing is missed more often than caught.
 *
 * ── 2026-08-18 · THE SAME FRAMES (sweep161), OPENED AND READ AGAIN ──────────
 *
 * THE OTHER HALF OF THAT PARAGRAPH WAS WRONG. It used to go on: „There is. The
 * rear-view mirror of sc-vu-emergency/mobile-right carries the blue-lit rig at
 * t = 7 s and t = 12 s and the runner resolves at 0:14." Both proofs fail when
 * the crops are enlarged:
 *   · 04-t007s.png carries a SOLID BLUE car body in the mirror — the demo
 *     ghost's colour. The special-regime rig is a WHITE van with a blue bar
 *     (vehicleFleet EMERGENCY_MODEL_INDEX). 04-t012s.png carries only the ghost
 *     path's blue glow, and on the phone the coach tip covers half the mirror.
 *   · „the runner resolves at 0:14" IS the «✓ Правилно отстъпено предимство»
 *     entry 2 of this same header condemns as a false certificate. Citing it as
 *     evidence the actor exists is circular.
 * The desktop leg settles it without any cropping: sc-vu-emergency/pc-right at
 * t = 6 s and t = 12 s shows an EMPTY four-lane boulevard ahead AND an empty
 * mirror, on a drive that had barely left the spawn. Replayed here through the
 * production stack at that drive's own pace the EV is at y = 27 m (t = 6 s) and
 * y = 108 m (t = 12 s) with the player at y = 30 / 47 — i.e. filling the left
 * lane of the windscreen in both frames. The headless stack stages it, moves it
 * and grades against it; the DEPLOYED SCENE did not draw it. That is a
 * LessonScene/fleet question, not a number in this file, and it is the first
 * thing to check before anybody re-tunes anything below.
 *
 * FOUR MORE DEFECTS, measured the way the four above were: replayed
 * frame-by-frame through runtime → traffic → director → rules at the live hero
 * car's ramp (1.95 m/s²), against a CRAWL (10 км/ч — the sweep's careful bot,
 * 22–27 full stops in three minutes) and a FLAT-OUT (59 км/ч — the tier
 * governor's ceiling). Two (5 and 7) are decided inside a runner this template
 * only parameterises, and the dial each one exposes is measurably the wrong
 * lever. The other two (6 and 8) ARE this file's numbers. All four are replayed
 * as executable measurements in scenario/__tests__/vru-staged-encounter-reach
 * .test.ts — the three still open as TRIPWIRES that assert the DEFECT (green
 * while it is live, red the day its repair lands, each naming its own
 * replacement assertion in place). That convention is why a `describe(… —
 * TRIPWIRE: red is the goal)` passing is not good news; do not "fix" one by
 * deleting it. The measurement, the ladder and the change each one needs are
 * written at its own site:
 *
 *  5. sc-vu-cyclist-hook hands the чл. 25 COMMENDATION to a car that never
 *     turned right at all — see VU_CYCLIST. STILL OPEN (runner).
 *  6. sc-vu-emergency-junction cannot CONVICT the barge its own two mistake
 *     demos are about — see VU_EV_CROSSING (with the arm/hold ladder).
 *     STILL OPEN (needs traces/scVuEmergencyJunction.ts retimed + re-recorded).
 *  7. sc-vu-emergency commends a car that merely never got going — see
 *     EM_APPROACH. STILL OPEN (runner).
 *  8. sc-vu-pass-clearance's hold has never held — see VU_PASS_CYCLIST.
 *     CLOSED 2026-08-22, and the sentence that used to stand here — „NOT ONE of
 *     them can be closed inside this file" — was wrong about this one. It rested
 *     on a single sampled rung (`releaseDistM 295`, which does break the
 *     late-dive demo). Scanning the band instead of sampling it found a 20 m
 *     window (225–245 at hold −220) where all three committed demos still grade
 *     exactly their codeRefs and the recordings are byte-identical. Both open
 *     criticals on that lesson were this one bug; the arithmetic, the probe grid
 *     and the residue that is genuinely traffic/staged.ts's are at the site.
 *
 * AND THREE THAT ARE NOT THIS MODULE'S, recorded so the routing is not repeated:
 *  (a) tj-rhr-v1 has no north arm, so a student who does not turn left drives
 *      off the built tile and spends the rest of the session on a bare plane
 *      with the route ribbon still drawn ahead of him and the mirror still
 *      rendering the city behind (sc-vu-emergency-junction/pc-right/04-t049s
 *      .png, 160 s of it). A world-boundary / off-route-abort question.
 *  (b) the «Демонстрация» overlay runs its recorded annotations on its own 0:46
 *      loop, so «Линейката премина, пътят е чист — завиваме наляво уверено» is
 *      on screen at t = 40 s of a drive that has never met an ambulance and is
 *      collecting «Превишена скорост» (pc-wrong/04-t040s.png). The demo player
 *      must not speak in the coach's voice while it is out of phase with the
 *      live drive.
 *  (c) the ИНСТРУКЦИИ panel occupies the right third of the desktop viewport,
 *      which on sc-vu-emergency-junction is exactly the east arm instruction 2
 *      orders the student to look down (pc-right/04-t032s.png); on the phone
 *      the coach tip covers the mirror sc-vu-emergency's instruction 2 names.
 *
 * ── 2026-08-18 (THIRD READ) · THE LAST OF THAT PARAGRAPH GOES TOO ───────────
 *
 * „The junction one is real … and the frames DO under-sample: at 5–6 s spacing
 * a 3 s crossing is missed more often than caught" is the half nobody retracted,
 * and the number it rests on is off by six. Replayed here at the sweep's own
 * careful pace (2.8 m/s on the live hero ramp) the tj-rhr EV holds at x = 95
 * until t = 13.3 s and then runs the east arm in front of the climbing student:
 * x = 81 at t = 17 s · 58 at t = 22 · 20 at t = 27 · through the box at t ≈ 29.5
 * · past x = −30 at t = 32.0. EIGHTEEN AND A HALF SECONDS, inside 110 m of him
 * at every one of those marks, on a 150 m arm — and the sweep photographed FIVE
 * frames inside that window (t017, t022, t027, t032, t038). Five looks, no
 * ambulance. The cadence was never the explanation.
 *
 * WHAT THE FOUR STAGED VRU LESSONS ACTUALLY SHOW, and the one line between
 * them. Both cyclist lessons DRAW their actor: sc-vu-cyclist-hook/mobile-right/
 * 04-t061s.png carries the bicycle rig — frame, wheels, rider, helmet — at the
 * kerb, and sc-vu-pass-clearance/pc-wrong/04-t012s.png carries it ~70 m up the
 * street. Neither emergency lesson draws anything at all, on either platform,
 * in any frame. The difference is which rig the fleet is asked for, and THIS
 * FILE'S HALF OF THAT HANDOFF IS MET — measured through the production stack:
 *
 *   sc-vue-approach · sc-vuej-ev    → published profile "emergency"
 *                                   → modelForVehicle = EMERGENCY_MODEL_INDEX
 *   sc-vu-cyclist · sc-vup-cyclist  → published profile "cyclist"
 *                                   → modelForVehicle = CYCLIST_MODEL_INDEX
 *
 * …and the ambulance is not merely staged, it is IN SHOT. On sc-vu-emergency at
 * the sweep's careful pace it is 15.3 m BEHIND the player at t = 1 s, 3.0 m
 * behind at t = 6 s and 61 m AHEAD in the left lane at t = 12 s — the three
 * instants whose frames show an empty mirror (04-t001s, 04-t006s) and an empty
 * four-lane boulevard (04-t012s). So neither the numbers below nor the frame
 * spacing can account for it. The question is why EMERGENCY_MODEL_INDEX draws
 * nothing while CYCLIST_MODEL_INDEX draws, and it lives in traffic/
 * vehicleFleet.ts (buildEmergencyRig, and the `counts[m]` pass in
 * buildTrafficFleet that allocates no InstancedMesh for a model with zero
 * vehicles at build time) and in its callers TrafficLayer.tsx +
 * LessonScene.tsx. Both measurements above are executable in
 * scenario/__tests__/vru-actor-in-frame.test.ts, so the day this file's half of
 * the contract breaks, the routing goes red instead of quietly becoming true.
 *
 *  (d) AND sc-vu-cyclist-hook's OWN EVENT CANNOT HAPPEN UNDER THE SWEEP, which
 *      is not a fault of the lesson. tools/mobile/lesson-audit.mjs actuates two
 *      keys — hold KeyW, cap with KeyS — and NEVER STEERS. A lesson whose event
 *      IS a right turn therefore gets a car that goes straight, and both legs
 *      did: from vu-spawn-west (−115, −4.06) the through road runs out at the
 *      district's own maxX = 130, i.e. 245 m on, after which the car is off the
 *      built tile among backdrop geometry. Both ended «Пътнотранспортно
 *      произшествие» — 20 наказателни точки, НЕИЗДЪРЖАН, the careful leg and
 *      the flat-out leg alike (pc-right/04-t179s.png at t = 179 s and
 *      pc-wrong/04-t023s.png at t = 23 s are the same orange wall). Two
 *      questions, neither of them this file's: the harness needs a steering
 *      channel before any turning lesson can be judged by it, and — the same
 *      world-boundary question as (a) — leaving the built world must not be
 *      billed as a road-traffic accident. What IS this file's, the disc that
 *      grades the manoeuvre, is sound and now pinned in BOTH directions: the
 *      straight-through drive misses sc-vu-turned by 40.94 m of a 10 m disc,
 *      and the committed shadow, which turns, completes it.
 */

import type {
  CyclistRightHookSpec,
  EmergencyApproachSpec,
  PriorityFromRightSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night, l5Wet } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from vu-cyclist-v1 by value — the L7
// pattern; the vu-cyclist-district battery asserts the copies match the map)
// ---------------------------------------------------------------------------

/** Eastbound lane center of the W–E through road (centerline y = 0, drawn
 *  lane 8.125 m → right-of-travel/south center y = −4.06). */
const THROUGH_LANE_Y = -4.06;
/** Southbound lane center of the south stem (centerline x = 0 → right-of-
 *  travel/west center x = −4.06) — where the right turn lands. */
const STEM_LANE_X = -4.06;

/**
 * The staged CYCLIST on vu-cyclist-v1: rides the through road's SOUTH curb
 * eastbound (the driver's own direction), holding ~38 m short of the junction
 * until the driver closes within releaseDistM, then cruising straight through
 * the mouth. extraRightOffsetM 2.6 places it curb-side of the eastbound lane
 * (y ≈ −6.66). The CyclistRightHookRunner adjudicates the driver's right turn
 * across it (prioritySituation "cyclist-right-hook" / collision(cyclist)); the
 * numbers mirror the shipped exam-bank cyclistRightHookAtT config.
 */
const VU_CYCLIST: CyclistRightHookSpec = {
  id: "sc-vu-cyclist",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vu-n-c", x: 0, y: 0 },
  actor: {
    // Eastbound through the junction: vu-n-w → vu-n-c → vu-n-e.
    pathNodes: ["vu-n-w", "vu-n-c", "vu-n-e"],
    hold: { nodeIndex: 1, offsetM: -30 }, // waits curb-side, 30 m short of vu-n-c
    // A slow city cyclist (~11 km/h): the driver can close and pass it BELOW
    // the follow-grading speed floor (20 km/h), so the collision demo can hit
    // it cleanly without a spurious FOLLOWING_TOO_CLOSE, and it lingers at the
    // mouth long enough that the hook/yield windows are stable.
    cruiseSpeedMps: 3.0,
    extraRightOffsetM: 2.6, // rides the curb of the scaled eastbound lane
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 70,
  dangerRadiusM: 9,
  // Widened from the exam-bank's 20: on this micro-map the yield drive brakes
  // to a stop at the mouth while the released cyclist is already easing past,
  // so the closest centre-to-centre gap sits ~22 m — 25 lets that count as the
  // "a real conflict existed" gate for the YIELDED_TO_PRIORITY commendation
  // (it gates ONLY the yield credit; the hook uses dangerRadiusM).
  //
  // DEFECT 5 (2026-08-18) — AND WHY THIS NUMBER IS NOT THE CURE. The commendation
  // this window gates is being paid to the drive that does the OPPOSITE of the
  // lesson. MEASURED on staging (sweep161 debriefs): pc-wrong and mobile-wrong —
  // 59 км/ч, ZERO full stops, TWO «Пътнотранспортно произшествие», 20 наказателни
  // точки, НЕИЗДЪРЖАН — both carry «★ ✓ Правилно отстъпено предимство» (0:37 and
  // 0:44), while pc-right and mobile-right, which stopped 23 and 24 times, carry
  // none. Reproduced here through the production stack: a car held at 59 км/ч
  // straight EAST along y = −4.06, never indicating, never turning, comes back
  // ["violation:SPEEDING_OVER_LIMIT", "commendation:YIELDED_TO_PRIORITY"] with
  // outcome "yielded".
  //   CyclistRightHookRunner pays the credit on three facts —
  //   `minPlayerJunctionM < HOOK_PASS_NEAR_M` (16) once, `dPJ > HOOK_PASS_FAR_M`
  //   (22) again, and `conflictExisted` — and `conflictExisted` is only
  //   „the rider was ever inside conflictWindowM while I was inside 45 m".
  //   NOTHING in it asks whether the driver turned right, slowed, or left the
  //   rider ahead. On this map the through road runs straight on past the mouth,
  //   so DRIVING PAST AT SPEED satisfies all three.
  //   Tightening this window cannot help and would only take the credit off the
  //   yielding student too: the flat-out car passes the rider at dPC ≈ 3.7 m,
  //   inside ANY upper bound. The fix belongs where the credit is decided —
  //   orchestrator/runners.ts CyclistRightHookRunner: the "yielded" branch must
  //   require the turn the lesson is about (a `turnStarted`/`direction: "right"`
  //   seen while armed) AND the rider clear (`cyclistArc >= CYCLIST_CLEAR_ARC_M`)
  //   at resolution; a straight-through pass resolves "clear", which is what it
  //   is. The three demos keep citing FAILED_TO_YIELD and are unaffected: all
  //   three DO turn right.
  conflictWindowM: 25,
};

/**
 * VU-01 — десен завой през велосипедист.
 *
 * CITATION CORRECTED 2026-08-03: this cited „чл. 119а", which does not exist —
 * ЗДвП has чл. 119 and nothing suffixed after it. The duty is:
 *   чл. 25, ал. 1: водачът, който ще предприеме маневра… „преди да започне
 *     маневрата, трябва да се убеди, че няма да създаде опасност за участниците
 *     в движението, които се движат след него, преди него или минават покрай
 *     него";
 *   чл. 35, ал. 2: завиващият надясно „е длъжен да пропусне пътните превозни
 *     средства, преминаващи от дясната му страна";
 *   чл. 5, ал. 2, т. 1: водачът е длъжен „да бъде внимателен и предпазлив към
 *     уязвимите участници в движението, каквито са пешеходците и водачите на
 *     двуколесни пътни превозни средства".
 * Same three the content bank uses (q-predimstvo-062, q-uyazvimi-011/063).
 */
export const SC_VU_CYCLIST_HOOK: ScenarioSpec = {
  id: "sc-vu-cyclist-hook",
  family: "vru",
  tagsBg: ["велосипедист", "десен завой", "мъртва зона", "уязвими участници"],
  titleBg: "Десен завой през велосипедист",
  objectiveBg:
    "Преди десен завой провери огледалото и мъртвата зона отдясно: движещият се покрай бордюра велосипедист продължава направо и има предимство — пропусни го и завий чак когато е преминал.",
  archetypeIds: ["VU-01"],
  conceptIds: ["c-cyclists", "c-priority-concept", "c-mirrors-blind-spots"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in vu-cyclist-v1.json meta.scenario.params
    // (tools/maps/gen_vu_cyclist.mjs).
    params: { control: "none", throughArmM: 130, stemArmM: 90, throughMaxKmh: 50, stemMaxKmh: 50 },
    districtId: "vu-cyclist-v1",
  },
  start: {
    spawnPointId: "vu-spawn-west",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента по правата улица към кръстовището." },
    {
      n: 2,
      textBg:
        "Ще завиваш надясно по страничната улица. Още преди завоя провери дясното огледало и погледни през дясното рамо в мъртвата зона.",
    },
    {
      n: 3,
      textBg:
        "Покрай бордюра се движи велосипедист, който продължава направо — той има предимство. Намали и го пропусни да отмине устието на кръстовището.",
    },
    {
      n: 4,
      textBg:
        "Завий надясно едва когато велосипедистът е преминал и е чист — не завивай пред него и не се опитвай да го изпревариш в завоя.",
    },
    { n: 5, textBg: "Влез плавно в страничната улица и продължи по нея." },
  ],
  success: [
    {
      id: "sc-vu-approach",
      titleBg: "Приближи завоя с готовност да пропуснеш",
      // Pre-junction checkpoint on the eastbound lane, ~22 m before vu-n-c:
      // arriving slowly is the yield-setup skill (VU-01).
      params: { kind: "reachZone", x: -22, y: THROUGH_LANE_Y, radiusM: 9, maxSpeedKmh: 35 },
    },
    {
      id: "sc-vu-turned",
      // WAS «Завий надясно, след като велосипедистът е преминал» — a certificate
      // for the rider's progress, issued by a disc that has never heard of him.
      // `stepReachZone` is handed (params, prevState, tick); SimTick carries no
      // staged actor, no arc, no yield outcome, so „е преминал" was decided by
      // the car's own coordinate and nothing else. The hook demo that turns
      // ACROSS the rider (mistakes[2], graded FAILED_TO_YIELD) lands in this
      // same stem and would tick it.
      // WHAT THE DISC DOES PROVE: (−4.06, −45) r10 is the south stem's
      // west-of-travel lane centre, 45 m down an arm reachable ONLY from a
      // completed right turn (a car continuing east never nears y = −45). So
      // the title claims the manoeuvre and the arm, which are the two things
      // measured. The rider's priority keeps its teeth where it always had
      // them: all three mistake demos cite FAILED_TO_YIELD and the
      // CyclistRightHookRunner convicts it live (prioritySituation
      // "cyclist-right-hook"), and instructions 3–4 + teach.examinerBg say the
      // duty in words. Params untouched — `done` is bit-identical, so nothing
      // new can fail and no THEO-4 card is owed.
      //
      // THE „ONLY FROM A COMPLETED RIGHT TURN" CLAIM ABOVE IS NOW MEASURED
      // rather than asserted in prose (2026-08-18): a car holding the through
      // lane from vu-spawn-west at any speed passes 40.94 m from this 10 m
      // disc — four radii — and the committed shadow, which turns, completes
      // it. Both directions in vru-actor-in-frame.test.ts §4, which is also
      // where the sweep's own drive is written down: its bot never steers, so
      // it went straight past the mouth and off the tile (header item (d)).
      titleBg: "Завий надясно и продължи по страничната улица",
      params: { kind: "reachZone", x: STEM_LANE_X, y: -45, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED (S3 batch 6): committed deterministic recordings of the authored
  // scripts in traces/scVuCyclist.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vu-cyclist-hook-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-cyclist-hook/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-hook.trace.json" },
      titleBg: "Завой пред велосипедиста",
      whatWentWrongBg:
        "Колата зави надясно точно докато велосипедистът беше плътно вдясно и още не беше преминал — класическият „десен капан“. Велосипедистът, който се движи направо покрай бордюра, има предимство; завиването пред него е непропускане на участник с предимство.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-no-look.trace.json" },
      titleBg: "Завой без оглеждане на мъртвата зона",
      whatWentWrongBg:
        "Водачът зави надясно само с поглед в огледалото за обратно виждане — дясната мъртва зона остана непроверена, а точно там се движеше велосипедистът, и колата му отряза пътя. Велосипедистът направо има предимство; един поглед през дясното рамо преди завоя предотвратява десния капан.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      // THE PICTURE-TRUE right hook (founder brief, 2026-07-28). Demos 0 and 1
      // grade the fault correctly but, measured against the staged rider, pass
      // BEHIND it: the cyclist is 5–7 m ahead through the whole turn and holds a
      // flat 3.00 m/s from release to the last frame — nothing on screen argues
      // the lesson. This demo cuts ACROSS the rider's line and lands in front of
      // it, so playerGuard brakes the cyclist from 3.00 m/s to a standstill with
      // 4.26 m of clearance still between them (no contact — the founder's
      // near-miss-over-crash ruling, the train-reel precedent). Same single
      // graded code as its siblings; the trace gate pins the braking.
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-forced-brake.trace.json" },
      titleBg: "Отрязване на велосипедиста в завоя",
      whatWentWrongBg:
        "Колата застигна велосипедиста и вместо да го изчака, зави надясно пред него — отряза пътя му точно преди устието на кръстовището. Велосипедистът, който се движи направо, трябваше да спре рязко, за да не се удари в завиващата кола. Праволинейно движещият се велосипедист има предимство: десният завой се прави чак след като той премине.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "При всеки десен завой в града, където покрай бордюра може да има велосипедист — на кръстовище, на изход от булевард, покрай велоалея. Велосипедистът често е точно в мъртвата зона отдясно.",
    whyBg:
      "Десният завой през велосипедист е сред най-честите и най-тежките градски произшествия с уязвими участници — колелото няма ламарина около себе си. Велосипедистът, който се движи направо, е бърз и нисък и лесно изчезва в мъртвата зона; един поглед през рамото преди завоя го спасява.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа: проверка на дясното огледало и рамо преди десен завой, осезаемо намаляване и пропускане на движещия се направо велосипедист, завиване едва когато е чист. Завиване пред велосипедиста или контакт с него е опасна грешка.",
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
  staged: [VU_CYCLIST],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-vu-emergency — „Линейка отзад" (VU-09) on ln-v1 (400 m 2+2 boulevard,
//    limit 50 — the sc-lane-change map, reused: a plain straight multi-lane
//    street is exactly where the rear siren drill lives)
// ---------------------------------------------------------------------------

/** ln-v1 lane centers (meta.scenario; pinned by value — the L7 pattern). */
const EM_RIGHT = 12.19;

/**
 * The staged EMERGENCY VEHICLE on ln-v1: holds at the road start (15 m behind
 * the spawn), RELEASES the moment the ghost pulls its 15 m lead (releaseGapM
 * 14) and runs the boulevard northbound up to ~68 km/h (special-regime
 * exemption) DEAD-CENTRE in the LEFT lane — x = 4.06 (right lane − 8.125 m, the
 * exact one-drawn-lane offset validated by world/__tests__/ln-district.test.ts).
 * The left lane IS the EV's чл. 91 corridor: the shadow driver keeps to the
 * RIGHT lane (out of it) and the mistake ghosts sit IN it, so the ambulance is
 * visibly blocked behind an unyielding car in its OWN lane (founder taste-pass,
 * doc 66 R0).
 *
 * RENDER TASTE-PASS (founder round: „the ambulance is nowhere near the car").
 * The old releaseGapM 38 held the EV dormant until the ghost was 38 m ahead,
 * then launched it from a standstill while the ghost was already at cruise — so
 * the gap BLEW OUT to ~68 m before the EV could close, and the clip opened on a
 * distant speck that read as an empty road. Release at 14 m pins it to the
 * ghost's tail instead: the EV rolls the instant the ghost takes its lead and
 * never falls back.
 *
 * …AND THE RAMP THAT WAS SUPPOSED TO GO WITH IT WAS SET AGAINST THE WRONG CAR
 * (2026-08-17, measured on staging). The paragraph that used to stand here
 * diagnosed the trap exactly right — „an EV that out-accelerates the still-slow
 * ghost arms the yield duty while the ghost is under the make-way threshold,
 * and the runner reads the slow launch as a yield" — and then chose 2.2 m/s²,
 * the RECORDER's SCRIPT_ACCEL. The recorder is not the product. The live hero
 * car launches at ~1.9-2.0 m/s² (17 км/ч at t = 1 s, 52 км/ч at t = 6 s, read
 * off the sweep's own speed probe), so an EV at 2.2 still out-accelerates it,
 * still becomes „closing" at t ≈ 3 s with the student at ~22 км/ч, and
 * `sawYield` latches PERMANENTLY on that one frame because `slowedKeepingRight`
 * only asks „is the car at or under 38 км/ч" — which every car is, on its way
 * up from zero.
 *
 * MEASURED CONSEQUENCE: the drive that held the throttle for the whole session
 * and never once touched the brake finished with «✓ Правилно отстъпено
 * предимство» at 0:06 (pc) / 0:14 (mobile). The lesson congratulated a student
 * for making way while he was accelerating past the ambulance.
 *
 * 1.5 m/s² is BELOW the hero car's launch ramp, which is what „held to the
 * player's pace" was always meant to mean. The EV can then only out-SPEED the
 * player once the player has stopped accelerating — i.e. once he is at cruise,
 * in the corridor, and his speed is a DECISION rather than a stage of the
 * launch. Worked through at the посочените 50 км/ч: the player caps at ~16.4
 * m/s around t = 8.5 s; the EV passes his speed + EM_CLOSING_MIN_KMH at
 * t ≈ 11.5 s with ~35 m still behind him (inside armBehindM 60), so the duty
 * arms at 59 км/ч, `sawYield` does NOT latch, and responseWindowSec expires
 * into EMERGENCY_NOT_YIELDED. A student who slows or pulls right inside those
 * 7 s latches it and keeps the commendation. The picture survives too: the gap
 * peaks at ~35 m instead of the old ~15 m — a light bar filling the mirror
 * rather than a speck at 68 m — and playerGuard still pins the EV behind an
 * un-yielding car in its own lane.
 *
 * The EmergencyApproachRunner adjudicates (prioritySituation "emergency"): a
 * rightward shift ≥ 0.8 m, slowing to ≤ 38 km/h while keeping right, or
 * standing inside the generous 7 s window = made way; a window that expires
 * with the car still in the corridor at speed = EMERGENCY_NOT_YIELDED.
 */
const EM_APPROACH: EmergencyApproachSpec = {
  id: "sc-vue-approach",
  kind: "emergencyApproach",
  libraryEventId: "ev-emergency-vehicle",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind ln-spawn-start
    cruiseSpeedMps: 19, // ~68 km/h: the EV runs above the 50 limit (чл. 91)
    // BELOW the live hero car's ~1.9-2.0 m/s² launch ramp — see the block
    // comment above. Was 2.2 (the RECORDER's SCRIPT_ACCEL), which let the EV
    // out-accelerate the launching student and latched the yield at ~22 км/ч.
    accelMps2: 1.5,
    extraRightOffsetM: -8.125, // dead-centre the LEFT lane (x = 4.06) — the EV's own corridor
    colorIndex: 0,
    // white rig + blue light bar (ADR-001 fictional). NOT decoration: this
    // string is the whole of `modelForVehicle`'s decision, so deleting it turns
    // the чл. 91 lesson's ambulance into an ordinary fleet hatchback. Pinned,
    // together with the resulting EMERGENCY_MODEL_INDEX, in
    // scenario/__tests__/vru-actor-in-frame.test.ts §1 — and see the header's
    // third-read section for why that test exists: the deployed scene drew
    // nothing here even though this half of the contract is met.
    profile: "emergency",
  },
  // Roll the instant the ghost takes its 15 m lead — no dormant blow-out.
  // MEASURED (2026-08-18): ln-spawn-start is y = 15 and the hold is y = 0, so
  // `behindM` is already 15 on frame one and the release is immediate for every
  // draw of the ±4 jitter below 15. That is harmless BECAUSE `accelMps2` 1.5 is
  // under the hero car's 1.95 — the ambulance launches with the student and
  // falls back before closing — but it means the choreography never has a
  // "waiting ambulance" phase, and a later hand raising this number would give
  // it one at the cost of the recorded demos on ln-v1.
  releaseGapM: 14,
  armBehindM: 60,
  responseWindowSec: 7,
  yieldShiftM: 0.8,
  // DEFECT 7 (2026-08-18) — THE FIX ABOVE CLOSED ONE DOOR AND THIS THRESHOLD IS
  // THE OTHER. `accelMps2: 1.5` fixed the case it was measured against — the EV
  // out-accelerating a LAUNCHING student — and the flat-out drive now convicts
  // (replayed here: 59 км/ч in the right lane comes back
  // ["violation:SPEEDING_OVER_LIMIT", "violation:EMERGENCY_NOT_YIELDED"], and
  // the make-way drive keeps its commendation; both directions are pinned in
  // vru-title-truth-and-encounter.test.ts). What it does NOT reach is the
  // student who was never going fast in the first place. MEASURED here at the
  // sweep's careful pace: a car held at a flat 10 км/ч in the right lane, no
  // brake, no shift, no indicator, comes back with a bare
  // ["commendation:YIELDED_TO_PRIORITY"] and outcome "yielded" — the whole
  // encounter decided by t ≈ 2 s, which is the 0:06 (pc) / 0:14 (mobile) stamp
  // the sweep photographed on BOTH careful legs.
  //   `slowedKeepingRight` asks an ABSOLUTE question — „is this car at or under
  //   38 км/ч while keeping right" — and a car that has never been over it
  //   answers yes forever. Lowering this number cannot fix that and would start
  //   refusing the student who lawfully slows to 30: чл. 91 is satisfied by
  //   slowing OR pulling right, and a false refusal teaches the wrong thing
  //   exactly as hard as a false certificate (the ruling already recorded at
  //   sc-vue-made-way). The fix is a DELTA, not a level, and it lives in
  //   orchestrator/runners.ts EmergencyApproachRunner: latch the slow half only
  //   on a measured drop after the duty arms (speed at arm − current ≥ a real
  //   margin, or the existing `yieldShiftM` lateral move), so „made way" means
  //   the driver did something. Leave this at 38: it is the level a genuine
  //   yielder has to reach, and it is correct.
  yieldSlowKmh: 38, // ~12 under the posted 50
  passAheadM: 18,
  clearSpeedMps: 21,
};

/**
 * VU-09 — линейка отзад (ЗДвП чл. 91: при подадени светлинен и звуков сигнал
 * от автомобил със специален режим на движение водачите са длъжни незабавно
 * да му направят път — отдръпване вдясно и при нужда намаляване/спиране, без
 * блокиране на коридора му).
 */
export const SC_VU_EMERGENCY: ScenarioSpec = {
  id: "sc-vu-emergency",
  family: "vru",
  tagsBg: ["линейка", "специален режим", "направи път", "огледала"],
  titleBg: "Линейка отзад",
  objectiveBg:
    "Зад теб приближава автомобил със специален режим — синя лампа и сирена. Направи му път незабавно: провери огледалото, мигач надясно, отдръпни се към десния край и намали, докато премине. Не спирай рязко в лентата и не блокирай коридора му.",
  archetypeIds: ["VU-09"],
  conceptIds: ["c-emergency-priority", "c-special-regime-vehicles", "c-mirrors-blind-spots"],
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
    { n: 1, textBg: "Потегли по булеварда в дясната лента и се установи на спокойна скорост." },
    {
      n: 2,
      textBg:
        "Поглеждай периодично в огледалото за обратно виждане — синята лампа се вижда там, преди сирената да е оглушителна.",
    },
    {
      n: 3,
      textBg:
        "Зад теб приближава линейка. Мигач надясно и плавно се отдръпни към десния край на лентата — коридорът ѝ минава отляво.",
    },
    {
      n: 4,
      textBg:
        "Намали, докато премине — без рязко спиране в лентата. Не ускорявай и не се мести наляво: това блокира пътя ѝ.",
    },
    { n: 5, textBg: "Щом линейката отмине, върни се плавно в средата на лентата и продължи." },
  ],
  success: [
    {
      id: "sc-vue-made-way",
      /**
       * THE ROW THE SWEEP CAUGHT TWICE (2026-08-17). It read
       * «Отдръпни се вдясно и пропусни линейката», params
       * `(12.19, 180) r8, ≤55` — and it ticked at 2:23 on the mobile run, i.e.
       * TWO MINUTES AND NINE SECONDS after the ambulance had passed and the
       * encounter had resolved (the commendation is stamped 0:14). Nothing
       * about the ambulance could have been in that tick, because
       * `stepReachZone` never sees one.
       *
       * ‣ THE CAP, AND THE HALF OF THIS ROW THE FIRST FIX GOT BACKWARDS. It was
       *   removed on 2026-08-17 as „a constraint that cannot bind and can only
       *   forgive": `maxSpeedKmh: 55` sits above the road's posted 50, so no
       *   LAWFUL drive can fail it, while carrying it arms `inGraceRing` in
       *   objectives.ts and stretches the acceptance 5 m back down the approach.
       *
       *   NEITHER CLAUSE SURVIVES BEING MEASURED, and the removal cost this row
       *   its only teaching.
       *
       *   „Cannot bind": the tier governor reaches 58–59 км/ч on this 400 m
       *   boulevard, so the cap was refusing the UNLAWFUL run and saying why —
       *   sweep log t = 17 s, «Задачата иска да си тук с не повече от 55 км/ч,
       *   а в момента караш 59 км/ч…» (lessons/engine.ts `objectiveNotice`,
       *   THEO-4's own shape: what was observed, what is wanted, what to do
       *   about it). That card is the ONLY thing this row has ever said out
       *   loud, and deleting the cap both silenced it and credited the 59 км/ч
       *   run the row used to refuse.
       *
       *   „Can only widen": arithmetically impossible. The grace capsule
       *   reaches `capMet` and never `reached` unless the cap is a HALT demand
       *   (`REACH_ZONE_HALT_CAP_KMH`), so a capped `done` is a strict SUBSET of
       *   the uncapped one — a cap can refuse, and can credit nobody the
       *   capless row did not already credit. `objectives.test.ts` sweeps that
       *   as a property over seven drives rather than trusting this paragraph,
       *   and objectives.ts states it beside `inGraceRing` so the next sweep
       *   does not delete another cap for it.
       *
       *   So the cap comes back, at the same 55 every sibling row in this
       *   library carries on a road posted 50 (templates-cockpit.ts,
       *   templates-conditions.ts).
       *
       *   IT IS A LAWFULNESS GATE AND NOT THE чл. 91 DUTY, which is why the
       *   title does not name it: чл. 91 is satisfied by pulling right OR by
       *   slowing, and the EmergencyApproachRunner grades both (`yieldShiftM`
       *   0.8, `yieldSlowKmh` 38). A gate demanding the slow half would refuse
       *   the student who lawfully chose the other, and a false refusal teaches
       *   the wrong thing exactly as hard as a false certificate.
       * ‣ THE RADIUS THAT COULD NOT PROVE THE LANE. ln-v1's lane pitch is
       *   8.125 m: right-lane centre 12.19, LEFT-lane centre 4.06, divider
       *   8.125. r8 accepts x ≥ 4.19 — it stopped 0.13 m short of the EV's own
       *   corridor centre, so „вдясно" rested on thirteen centimetres. r4
       *   accepts x ∈ [8.19, 16.19]: left bound the divider itself, right bound
       *   the far kerb. Now the disc IS the right lane, the mistake ghosts'
       *   left-lane line (x = 4.06) is 8.13 m outside it, and no student
       *   holding his own lane is refused. Tightening only — this can credit
       *   nobody it did not credit before.
       *
       * The make-way DUTY keeps its grader: both mistake demos cite
       * EMERGENCY_NOT_YIELDED, the EmergencyApproachRunner convicts it live,
       * and instructions 3–4 + teach.examinerBg carry it in words.
       */
      // The second clause is a fact about the MAP, not about the run — ln-v1's
      // left lane is the EV's чл. 91 corridor on every drive, whatever the
      // student does — so it explains the ask (THEO-4) without certifying that
      // anything was yielded to. The tick says one thing and one thing only:
      // at the mid-boulevard mark this car was in the right lane.
      titleBg: "Мини средата на отсечката в дясната лента — лявата е коридорът на линейката",
      params: { kind: "reachZone", x: EM_RIGHT, y: 180, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vue-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: EM_RIGHT, y: 355, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED (ADR-006 stage 1b): committed deterministic recordings of the
  // authored scripts in traces/scVuEmergency.ts; the §5 gate (shadow replays
  // with ZERO violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vu-emergency-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-emergency/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-emergency/mistake-block.trace.json" },
      titleBg: "Блокиране на линейката",
      whatWentWrongBg:
        "Колата остана в лявата лента — точно в коридора на линейката — с непроменена скорост, докато линейката висеше плътно зад нея, в същата лента, със сирена. Законът е категоричен: при специален режим си длъжен НЕЗАБАВНО да направиш път — прибиране вдясно и намаляване. Оставането в коридора ѝ е непропускане на автомобил със специален режим (чл. 91).",
      codeRefs: ["EMERGENCY_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-emergency/mistake-speed-up.trace.json" },
      titleBg: "Ускоряване пред линейката",
      whatWentWrongBg:
        "Вместо да се прибере вдясно, водачът даде газ и остана в лявата лента — „да избяга напред“ пред линейката. Точно обратното на дълга: лявата лента Е коридорът на линейката, а надбягването с нея само удължава блокирането. Прави се път вдясно, с намаляване — не се бяга напред (чл. 91).",
      codeRefs: ["EMERGENCY_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато чуеш сирена или видиш синя/червена лампа в огледалото — линейка, пожарна, полиция. Дългът е един и същ навсякъде: в града, на булевард, на кръстовище — незабавно освобождаваш коридора им.",
    whyBg:
      "Всяка секунда закъснение на линейката е секунда от нечий живот. Паникьосаното рязко спиране в лентата е също толкова опасно, колкото и инатливото блокиране — линейката разчита на предвидимо, решително отдръпване вдясно. Немската „спасителна алея“ е същият рефлекс, издигнат в система.",
    lawRef: "ЗДвП чл. 91",
    examinerBg:
      "Изпитващият гледа: навременно забелязване (огледала), решително и плавно отдръпване към десния край с мигач, намаляване без рязко спиране и продължаване чак след като автомобилът със специален режим премине. Блокирането на коридора му е опасна грешка.",
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
  staged: [EM_APPROACH],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-vu-emergency-junction — „Линейка на кръстовището" (VU-10) on tj-rhr-v1
//    (the sc-junction-rhr uncontrolled T, reused: the header documents WHY the
//    crossing EV rides the priorityFromRight machinery, not emergencyApproach)
// ---------------------------------------------------------------------------

/** tj-rhr-v1 drawn lane-center offset from the road centerline, m. */
const VUEJ_LANE = 4.0625;

/**
 * The staged EMERGENCY VEHICLE on tj-rhr-v1: holds on the east arm, then
 * crosses the equal T-junction from the player's RIGHT (east arm → west arm,
 * straight through), timed by the priorityFromRight runner against the
 * player's approach up the stem — the sc-junction-rhr recipe (negative
 * leadSec: the EV reaches the node ~3.5 s AFTER the player's projected
 * line-crossing, so a barging player crosses its path with the conflict still
 * inbound, while a yielding player watches it flash through). profile
 * "emergency" renders the white special-regime rig with the blue light bar
 * (ADR-001 fictional); junctionControl "uncontrolled" — the runtime's OWN
 * right-hand-rule tracker adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY),
 * the runner only records the outcome. Faster than the JU-01 civilian
 * (cruise 10 m/s, clear sprint 14) — an EV moves with urgency.
 *
 * DEFECT 6 (2026-08-18) — THE BARGE IS NEVER CONVICTED, AND THE ARITHMETIC IS
 * WHY. Both mistake demos below are about entering the box in front of the
 * ambulance, and both cite FAILED_TO_YIELD. A live student who does exactly
 * that is charged with nothing of the sort. MEASURED on staging: pc-wrong ran
 * the stem at 60 км/ч and came back with TWELVE «Превишена скорост» and NO
 * чл. 91 conviction at all (only mobile-wrong, whose slower legs re-timed the
 * sync, booked «Непропускане на ППС с предимство»). Reproduced here through the
 * production stack — a car held flat out up the stem crosses y = 0 at
 * t ≈ 10.5 s and the EV is still 70 m out on the east arm; it reaches the node
 * at t ≈ 17.5 s, seven seconds and 115 m behind him, and the runner resolves
 * "clear".
 *
 * The EV cannot get there, and the two numbers that decide it are `armDistM`
 * and the hold:
 *   armDistM 70 − lineDistM 18 = 52 m of approach after the sync starts;
 *   at the tier governor's 16.4 m/s that is 3.2 s, and with leadSec −3.5 the
 *   EV has 6.7 s to be at the box. From 95 m at cruise 10 m/s its own transit
 *   is ≥ 9.5 s before the sync's speed cap is even considered. It is four
 *   seconds short by construction, and no live drive can make that up.
 *
 * MEASURED LADDER (flat-out 59 км/ч; „EV x" is how far out on the east arm the
 * ambulance still is around the player's crossing, read off a 2 s probe grid —
 * the two rungs the battery pins carry their exact crossing-FRAME figures,
 * 68.1 m shipped and 18.1 m at hold −45. The CRAWL leg was re-measured at every
 * rung and does not move: the EV crosses at t ≈ 30.4 s with the student still
 * ~23 m short of the mouth, watching it flash through, exactly as authored):
 *
 *   hold −95, arm  70  (shipped)  EV 70 m out   →  no conviction · "clear"
 *   hold −60, arm  70             EV 35 m out   →  no conviction · "clear"
 *   hold −45, arm  70             EV 24 m out   →  FAILED_TO_YIELD
 *   hold −40, arm  70             EV 19 m out   →  FAILED_TO_YIELD
 *   hold −35, arm  70             EV 14 m out   →  FAILED_TO_YIELD + COLLISION
 *   hold −95, arm 110             EV 27 m out   →  FAILED_TO_YIELD
 *   hold −95, arm  90             EV 53 m out   →  no conviction · "clear"
 *
 * — so the two honest repairs are `hold −45` (the widest that convicts, with
 * −40 measured below it as margin against the −35 rung where the barge starts
 * HITTING the ambulance and the „exactly FAILED_TO_YIELD" gate would break), or
 * `armDistM 110` (the spawn sits 105 m from the node, so the ambulance is
 * already rolling while the student sets off — which is what an emergency
 * vehicle already en route actually does).
 *
 * AND THE SECOND RUNG NOW BUYS TWO THINGS, not one (2026-08-18, third read).
 * `armDistM 110` also lengthens the only window in which this lesson's actor is
 * on screen at all: today the EV is dormant at x = 95 for the first 13.3 s of a
 * careful approach and only then starts its 18.6 s run (header, third-read
 * section). Rolling from the spawn makes the blue lamp part of the approach the
 * copy describes rather than something that appears once the student is already
 * at the mouth. It does NOT explain the sweep's empty frames — measured, the EV
 * is inside 110 m of the player at t = 17/22/27 s and the frames at those exact
 * marks contain no vehicle — but when the render defect is fixed this is the
 * rung that makes the lesson read the way its instructions promise.
 *
 * WHY NEITHER IS APPLIED HERE. Both were applied and measured, and both turn
 * the §5/§9 gate red — not because the world got worse but because the three
 * committed demos were choreographed against the broken timing:
 *   hold −45  → shadow loses YIELDED_TO_PRIORITY, mistake-barge loses
 *               FAILED_TO_YIELD, mistake-race loses COLLISION;
 *   arm 110   → the same three, same direction (the EV now crosses before the
 *               authored slow approach arrives).
 * The change is therefore a COORDINATED one and this file owns only its third:
 * retime the authored drives in traces/scVuEmergencyJunction.ts so each still
 * meets the EV where its copy says it does, re-record with RECORD_TRACES=1
 * (content/traces/sc-vu-emergency-junction/ + platform/public/traces/…), and
 * only then move the number below. Do not move it alone.
 */
const VU_EV_CROSSING: PriorityFromRightSpec = {
  id: "sc-vuej-ev",
  kind: "priorityFromRight",
  libraryEventId: "ev-emergency-vehicle",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 10, // ~36 km/h through the box — EV urgency, still plausible
    colorIndex: 0,
    // white rig + blue light bar (ADR-001 fictional) — the same load-bearing
    // string as EM_APPROACH's, pinned in vru-actor-in-frame.test.ts §1.
    profile: "emergency",
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  lineDistM: 18,
  clearSpeedMps: 14,
};

/**
 * VU-10 — линейка през кръстовището (ЗДвП чл. 91: при светлинен и звуков
 * сигнал от автомобил със специален режим водачите са ДЛЪЖНИ да го пропуснат
 * — включително когато иначе биха имали предимство; тук, на равнозначно
 * кръстовище, линейката идва и отдясно, чл. 50 — двойно нейното предимство).
 */
export const SC_VU_EMERGENCY_JUNCTION: ScenarioSpec = {
  id: "sc-vu-emergency-junction",
  family: "vru",
  tagsBg: ["линейка", "специален режим", "кръстовище", "направи път"],
  titleBg: "Линейка на кръстовището",
  objectiveBg:
    "Пропусни линейката със специален режим, която пресича кръстовището пред теб: чуеш ли сирена или видиш ли синя лампа, спри преди кръстовището и я изчакай да премине изцяло — линейката минава първа ВИНАГИ, независимо кой е с предимство.",
  archetypeIds: ["VU-10"],
  conceptIds: ["c-emergency-priority", "c-special-regime-vehicles", "c-priority-concept"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in tj-rhr-v1.json meta.scenario.params
    // (tools/maps/gen_t_junction.mjs; map REUSED from sc-junction-rhr).
    params: {
      control: "none",
      priorityArmM: 150,
      minorArmM: 120,
      lanes: 2,
      priorityMaxKmh: 40,
      minorMaxKmh: 40,
    },
    districtId: "tj-rhr-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица към кръстовището и намали отрано — ще завиваш наляво." },
    {
      n: 2,
      textBg:
        "Огледай пресечните посоки: отдясно приближава линейка със синя лампа — автомобил със специален режим.",
    },
    {
      n: 3,
      textBg:
        "Линейката минава първа — винаги. Дори светофар да ти дава зелено или пътят да е твой, чл. 91 е над реда на кръстовището.",
    },
    { n: 4, textBg: "Спри преди кръстовището и я изчакай да премине ИЗЦЯЛО — без да навлизаш и без да ѝ режеш коридора." },
    { n: 5, textBg: "Щом линейката е преминала и пътят е чист, завий наляво и продължи." },
  ],
  success: [
    {
      id: "sc-vuej-approach",
      titleBg: "Приближи кръстовището бавно и с готовност за спиране",
      // Stem lane center, just before the junction area (the JU-01 geometry).
      params: { kind: "reachZone", x: VUEJ_LANE, y: -30, radiusM: 8, maxSpeedKmh: 25 },
    },
    {
      id: "sc-vuej-cross",
      // WAS «Премини кръстовището, след като линейката е преминала» — the same
      // unissuable certificate as sc-vu-turned and sc-vue-made-way: the disc
      // reads one SimTick, which carries no staged actor and no yield outcome,
      // so „след като линейката е преминала" was decided by a coordinate. The
      // barge demo — the drive whose own copy says the car entered the box with
      // the ambulance inbound — completes the left turn and would tick it.
      // WHAT THE DISC PROVES: (−50, 4.0625) r9 is the west arm's westbound lane
      // centre 50 m out, so arrival means the left turn was completed and the
      // 40 m junction area cleared. It does NOT prove the lane — r9 on the
      // 8.125 m pitch reaches the oncoming centre — so the title claims the
      // manoeuvre and the compass arm and nothing else. The чл. 91 duty keeps
      // its grader: both mistakes cite FAILED_TO_YIELD, convicted live by the
      // runtime's own right-hand-rule tracker against the crossing EV, and
      // instructions 2–4 + teach.examinerBg say it in words. Params untouched —
      // `done` is bit-identical.
      titleBg: "Завий наляво и излез от кръстовището на запад",
      params: { kind: "reachZone", x: -50, y: VUEJ_LANE, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (ADR-006 stage 1c): committed deterministic recordings of the
  // authored scripts in traces/scVuEmergencyJunction.ts; the §5 gate (shadow
  // replays with ZERO violations + YIELDED_TO_PRIORITY) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-emergency-junction-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-emergency-junction/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-emergency-junction/mistake-barge.trace.json" },
      titleBg: "Навлизане пред линейката",
      whatWentWrongBg:
        "Колата навлезе в кръстовището с непроменена скорост, докато отдясно приближаваше линейка със сирена и синя лампа. Автомобилът със специален режим минава първи — задължението по чл. 91 е абсолютно, а тук линейката идва и отдясно. Навлизането пред нея е отнето предимство — опасна грешка, която на изпита прекратява всичко.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-emergency-junction/mistake-race.trace.json" },
      titleBg: "Надбягване със сирената",
      whatWentWrongBg:
        "Водачът чу сирената, прецени „ще мина преди нея“ и даде газ през кръстовището. Точно обратното на дълга: при сигнал от специален режим се спира и се чака, а не се спринтира — секундата, която „печелиш“, кара линейката да спира заради теб. Пресичането на пътя ѝ е непропускане на автомобил с предимство (чл. 91).",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище, когато чуеш сирена или видиш синя/червена лампа — линейка, пожарна, полиция. Правилото не зависи от реда на кръстовището: и на зелено, и с предимство, автомобилът със специален режим минава пръв.",
    whyBg:
      "Кръстовището е най-честото място за удар с линейка: водачът гледа „своя“ ред — светофара, знака, дясното — и изключва ушите си. Сирената се чува секунди преди лампата да се види; който при сирена автоматично сваля газта и оглежда пресечните посоки, никога не се среща с линейка в кръстовището.",
    lawRef: "ЗДвП чл. 91",
    examinerBg:
      "Изпитващият гледа: реакция на сирената още при приближаването (намаляване, оглеждане), решително спиране преди кръстовището, изчакване линейката да премине изцяло и чак тогава продължаване. Навлизане пред автомобил със специален режим е опасна грешка.",
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
  staged: [VU_EV_CROSSING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-vu-pass-clearance — „Изпреварване на велосипедист" (VU-02) on
//    vu-pass-v1 (360 m junction-free 1+1 street; the header documents WHY the
//    staged cyclist rides the cyclistRightHook kind as a plain cruise recipe)
// ---------------------------------------------------------------------------

/** vu-pass-v1 northbound lane center (0.5 drawn lane east — the L7 pattern). */
const VUP_LANE_X = 4.06;
/**
 * The cyclist's curb line: lane center + extraRightOffsetM → x = 6.16.
 *
 * THE LESSON HAD NO GRADIENT AT ALL, AND THE ARITHMETIC IS WHY (2026-08-17).
 * The runtime bands are centre-to-centre with a ~1.25 m body allowance
 * (worldRuntime VULNERABLE_PASS_BODY_ALLOWANCE_M): convict below 2.45 m of
 * centres (≈ 1.2 m of air), commend at or above 2.75 m (≈ 1.5 m — the taught
 * norm), SILENT in between. At the old curb line x = 6.66 those bands fell on
 * the car's lane position like this:
 *
 *   commend   x ≤ 3.91   ·   SILENT 3.91 < x ≤ 4.21   ·   convict x > 4.21
 *
 * and the northbound lane CENTRE is 4.06 — dead inside the silent band. So the
 * clearance grader, the one thing this lesson is about, could not speak about a
 * student who never touched the wheel, and the „осезаемо отместване" the copy
 * demands was worth FIFTEEN CENTIMETRES.
 *
 * MEASURED on staging: both sweep drives finished ИЗДЪРЖАН · 0 наказателни
 * точки · ★★★ · +100 XP, byte-identical — the 59 км/ч flat-out run passed the
 * rider at 2.60 m of centres (1.35 m of air, 0.15 m inside the grace band) and
 * the lesson said nothing at all. MEASURED again here, off the production stack
 * at the recorder's calmer 45 км/ч, which is where the shape is clearest —
 * the whole ladder of lines a student can take, before and after:
 *
 *   line x   6.66 (shipped)                    6.35 (this file)
 *   4.06     FOLLOWING_TOO_CLOSE               FOLLOWING + VULNERABLE_PASS ✔
 *   3.50     FOLLOWING · commended             FOLLOWING · commended
 *   2.60     clean · commended                 FOLLOWING · commended
 *   2.20     clean · commended                 clean · commended
 *
 * — i.e. the un-shifted line went from „graded on the wrong subject" to „graded
 * on this lesson's subject", the shadow's authored line stayed clean, and the
 * commendation kept costing the same real shift.
 *
 * The tell was in this file already: both mistake demos squeeze at x = 4.3,
 * „a hand's width off the lane center" (traces/scVuPass.ts), and convict — so
 * the entire distance between the taught fault and no fault at all was the
 * 24 cm between 4.06 and 4.3. That is not a lesson, it is a coin.
 *
 * THE CORRECTION IS BOXED IN BY A FOURTH THRESHOLD, AND THE FIRST ATTEMPT HIT
 * IT. Moving the rider to 6.16 made the do-nothing line convict — and put the
 * shadow's own wide line 4 cm inside `LEAD_CORRIDOR_M` (traffic/system.ts, 4.0
 * m of lateral), so the demonstration of the CORRECT pass came back billed
 * «Несъобразена дистанция» at t = 13.48 s, two metres behind the rider it was
 * about to overtake. Measured, not reasoned: the shadow gate went red and named
 * the code. So the rider's curb line has to satisfy both at once —
 *
 *   convict the un-shifted line   →   x_cyclist <  4.06 + 2.45 = 6.51
 *   keep the taught line off the follow corridor
 *                                 →   x_cyclist ≥  2.20 + 4.00 = 6.20
 *
 * — a THIRTY-ONE-CENTIMETRE window, and 6.35 is its middle: 0.16 m of margin
 * under the convict threshold, 0.15 m clear of the follow corridor.
 * extraRightOffsetM 2.6 → 2.29 puts the rider there and moves the bands onto
 * the acts they are named for:
 *
 *   commend   x ≤ 3.60   ·   silent 3.60 < x ≤ 3.90   ·   convict x > 3.90
 *
 *   · the DO-NOTHING line (lane centre 4.06) now gives 2.29 m of centres
 *     ≈ 1.04 m of air and CONVICTS — a squeeze, which is what passing a
 *     curb-rider without changing your line is;
 *   · the commendation costs a real 0.46 m of lateral shift, still entirely
 *     inside the student's own lane (the М1 осева is at x = 0);
 *   · the committed demos are unaffected in KIND: shadow x 2.2 → 4.15 m of
 *     centres ≈ 2.90 m of air, still ≥ the norm and still outside the follow
 *     corridor; squeeze/fast-close x 4.3 → 2.05 m ≈ 0.80 m of air, still
 *     convicting and still 0.80 m clear of VULNERABLE_PASS_CONTACT_M (1.25 m of
 *     centres), so the „exactly VULNERABLE_PASS_TOO_CLOSE, never COLLISION"
 *     gate holds.
 *
 * The rider ends up 1.78 m off the 8.125 m half-carriageway's kerb line, which
 * is where a city cyclist actually rides on a lane this wide — clear of the
 * drains and the door zone he is elsewhere in this file taught to fear.
 *
 * WHAT THIS DOES NOT FIX, stated so nobody „fixes" it by widening a band:
 * VULNERABLE_PASS_SAFE_LATERAL_M (2.75) sits BELOW LEAD_CORRIDOR_M (4.0), so a
 * student who leaves exactly the taught metre and a half is inside the
 * following detector's corridor while he overtakes, on this street and on every
 * other. That contradiction is in the runtime, not in this template's numbers,
 * and squeezing this constant further would only move which of the two lessons
 * lies.
 */
const VUP_CYCLIST_X = 6.35;

/**
 * The staged CYCLIST on vu-pass-v1: rides the east curb northbound at a
 * city-cyclist ~11 km/h. REUSED cyclistRightHook kind (NO new actor type — the
 * N8 mandate): the "junction" is the far end node the driver never turns right
 * at, so the runner contributes only the release choreography + the
 * collision(cyclist) contact channel. The GRADING is the runtime's
 * vulnerable-pass tracker.
 *
 * DEFECT 8 (2026-08-18) — THE HOLD HAD NEVER HELD, AND THE FIELD DESCRIBED A
 * HOLD THIS STREET HAD NEVER HAD. `releaseDistM` means „release when the driver
 * is this close to the path's far node"; the far node is (0, 360) and the spawn
 * is (4.06, 15), i.e. 345.02 m away — so the shipped 360 was satisfied on the
 * first frame the car rolled. The rider ran the moment the lesson did, from
 * 95 m ahead, at 3.0 m/s, and a driver slower than 3.0 m/s never closed: over
 * 40 s at the sweep's careful pace the gap GREW from 95 m to 103 m and the
 * drive came back with ZERO rule events and ZERO staged outcomes — the lesson's
 * only actor and its only grader both silent. That is the ИЗДЪРЖАН · 0
 * наказателни точки · ★★★ the sweep photographed on both careful legs, and it
 * is what the two open criticals on this lesson are: „the cyclist never
 * appears" (fc987070) is the symptom of NEVER MET.
 *
 * AND THE SECOND CRITICAL IS THE SAME BUG'S SECOND HALF, WHICH THE OLD NOTE
 * HERE DID NOT KNOW ABOUT (2026-08-22, measured). 953fbed1 read „the rider is
 * real … he is never once in front of the car: the first sight of him anywhere
 * is already in the mirror". Replayed through the production stack at the
 * sweep's own stop-and-go pace, that is exactly what the shipped numbers
 * produce, and the mechanism is `traffic/staged.ts` FR-B5-RETURN. Probe grid,
 * a 360 m drive to the finish gate, shipped numbers:
 *
 *   pace                closest while AHEAD   closest overall   first astern
 *   stop-go 4/4 @16     92.1 m                61.5 m            t = 101 s
 *   stop-go 5/3 @11     95.0 m                19.4 m            t = 101 s
 *   stop-go 3/5 @25     92.4 m                 6.7 m            t = 101 s
 *
 * — the closest the rider ever comes IS from astern, and the t = 101 s in all
 * three is one event: he reaches y = 360 at t ≈ 83 s, drives EXIT_CLEAR_M (70)
 * past the end, and `canReturnToHold` then REWINDS him to his hold pose, which
 * by then is 200 m BEHIND the student. Still under the „cruise" command he left
 * with, he rides the street a second time and overtakes a student who is slower
 * than he is. That is the rider in the mirror at t136/141/146/152/157/163/168 of
 * .audit-frames/wave-c/frames/sc-vu-pass-clearance__pc-right.
 *
 * THE REPAIR, AND WHY IT IS THIS FILE'S AFTER ALL. The old note here said the
 * cure was `hold −230 / releaseDistM 295` and that it could not be applied
 * because the LATE-DIVE demo goes red. Both halves are measured facts — 295 is
 * outside the demo-safe band — but „the fix needs traces/scVuPass.ts retimed"
 * was a conclusion drawn from ONE sample. The band was never scanned. It is now
 * (scenario/__tests__ replays the three authored scripts against each rung):
 *
 *   releaseDistM at hold −220:  225 ✓  230 ✓  235 ✓  240 ✓  245 ✓  250 ✗  255 ✓
 *
 * — a contiguous 20 m window in which all three committed demos still grade
 * EXACTLY their codeRefs, and the recordings are byte-identical (the scripted
 * ghost's poses do not depend on where the rider is, so `serializeScenarioTrace`
 * is unchanged and the determinism gate never sees this edit). 235 is that
 * window's centre, which matters because the runner jitters the release by
 * ±5 m (`releaseDistM + (rng()*2−1)*5`) and the draw changes with the retry
 * count — so the WHOLE reachable band has to be green, not one draw of it.
 *
 * So: `hold.offsetM −250 → −220` (the rider waits at y = 140 instead of y = 110)
 * and `releaseDistM 360 → 235` (he sets off when the driver reaches y ≈ 125,
 * ~15 m behind him). What that buys, same probe, same drives:
 *
 *   pace              closest while AHEAD   closest overall   first astern
 *   50 km/h steady     2.3 m                 2.3 m            t = 13 s (passed)
 *   30 km/h steady     2.3 m                 2.3 m            t = 18 s (passed)
 *   20 km/h steady     2.3 m                 2.3 m            t = 25 s (passed)
 *   stop-go 4/4 @16    6.8 m                 6.8 m            never
 *   stop-go 5/3 @11    8.6 m                 8.6 m            never
 *   stop-go 6/6 @16    7.1 m                 7.1 m            never
 *
 * — every pace now MEETS him, and on every pace in that table the close
 * approach happens with him AHEAD.
 *
 * TWO THINGS THAT TABLE DOES NOT SAY, both measured on the shipped numbers by
 * the adversarial verifier of this repair (2026-08-22), both pinned executably
 * in the TRIPWIRE at the bottom of vru-staged-encounter-reach.test.ts:
 *
 *  (i) THE „AHEAD" PROPERTY HOLDS OVER A PACE BAND, NOT OVER ALL PACES — and
 *      the six rows above are inside it. Extending the same probe down the duty
 *      cycle, still stopping at the finish gate (y = 291), still inside the
 *      sweep's own „22–27 full stops in three minutes":
 *        stop-go 3/8 @16   closest AHEAD 7.9 m   closest overall 6.4 m
 *        stop-go 2/6 @16   closest AHEAD 9.7 m   closest overall 6.5 m
 *      — i.e. below roughly 1.5 m/s of made-good speed FR-B5-RETURN fires with
 *      lesson still to run, and the rider's closest approach is once again from
 *      ASTERN, which is 953fbed1's own sentence. This does NOT reopen the
 *      critical: at those paces he is also met AHEAD at 6–10 m an entire minute
 *      earlier, so „the first sight of him anywhere is already in the mirror" is
 *      false on the repaired build at every pace probed. It is the residue
 *      below, bounded. Whoever adds the StagedVehicleSpec opt-out closes it.
 *      The lesson the old note taught applies to itself: a property measured on
 *      a handful of sampled profiles is not a property of the band.
 *
 * (ii) THE RIDER NOW STANDS STILL, AND THE COPY SAYS HE IS RIDING. A hold is a
 *      standing pose, and this one is 125 m up an open street in the student's
 *      windscreen rather than off-scene the way FR-B5-RETURN's own note assumes
 *      hold poses are („the one place on these maps that is off-scene by
 *      construction"). Seconds the bicycle is motionless before release,
 *      measured, same probe:
 *        59 км/ч  ~8 s   ·  30 км/ч  ~14 s  ·  20 км/ч  22 s  ·  10 км/ч  42 s
 *        stop-go 4/4 @16  59 s  ·  4/6 @16  73 s  ·  3/6 @16  93 s
 *        stop-go 3/8 @16 113 s  ·  2/6 @16 154 s
 *      Against objectiveBg „Покрай десния бордюр СЕ ДВИЖИ велосипедист" and
 *      instruction 2 „покрай десния бордюр КАРА велосипедист", the careful
 *      student — the one the sweep photographed — spends 40–75 % of the lesson
 *      looking at a bicycle that is not moving, and the shipped build had no
 *      standstill at all (the rider rolled from frame one; that was the bug,
 *      but it was not THIS artefact). It is a straight trade, taken knowingly:
 *      an encounter that happens against copy that is briefly wrong beats no
 *      encounter at all, and a rider pushing off from the kerb 15 m ahead is a
 *      real road event. It is written down because the next reader must not
 *      have to re-measure it, and because the honest closes are elsewhere —
 *      copy that says he is waiting at the kerb, or a hold that idles the rig
 *      instead of freezing it. Neither is a number in this file.
 *
 * The steady drives are unchanged where it counts: the un-shifted lane-centre
 * line still convicts VULNERABLE_PASS_TOO_CLOSE at 2.29 m of centres and the
 * wide line still earns the commendation (that is VUP_CYCLIST_X's arithmetic,
 * untouched here). A student below the rider's own 3.0 m/s no longer overtakes
 * him — he trails him at 7–9 m, which is what those two speeds actually mean on
 * a road, and which is the state instruction 2 («Не се залепяй зад него») is
 * about.
 *
 * WHAT THIS DOES NOT FIX, stated so it is not mistaken for closed: FR-B5-RETURN
 * itself. It is a global rewind with no per-spec opt-out, and on a long enough
 * drive it will still recycle this rider — measured, at the very tail (t ≈ 159 s
 * of a 169 s drive on the slowest profile), i.e. after the encounter has already
 * happened rather than instead of it. Making it never fire from here would need
 * the hold at y > 221 (RETURN_CLEAR_M is 70 and the finish gate is y = 300 r9),
 * and a rider held that late is PAST the shadow demo's wide line (y 75→195, back
 * in lane from y = 215) — so the CORRECT drive would be passing him at the lane
 * centre. Measured, holds at y = 200 / 220 / 230 with a matched release:
 *   y = 200 → shadow VULNERABLE_PASS_TOO_CLOSE
 *   y = 220 → shadow VULNERABLE_PASS_TOO_CLOSE + FOLLOWING_TOO_CLOSE
 *   y = 230 → the same pair
 * — i.e. buying the rewind off costs the §5 gate and convicts the demonstration
 * of doing it right. A `loop`/`retire`-style opt-out on StagedVehicleSpec is
 * traffic/staged.ts's to add, not this file's to fake.
 *
 * AND ONE MAINTENANCE FLAG, CARRIED FORWARD (it was raised by the note this one
 * replaced and must not be lost with it): the header of `traces/scVuPass.ts` —
 * a file this lane does not own — describes a world that no longer exists, now
 * in THREE places. It says the curb line is x = 6.6625 and the clean line
 * 4.46 m of centres (stale since extraRightOffsetM went to 2.29; the live
 * values are 6.35 and 4.15), and it says „Cyclist released at t = 0
 * (releaseDistM exceeds the spawn distance) from y = 110 at 3 m/s", which this
 * repair has just made false in every clause: he is released when the driver
 * reaches y ≈ 125, from y = 140. The three recorded traces are unaffected —
 * re-recorded and diffed byte-for-byte against the committed files — so this is
 * a comment fix in someone else's file, not a re-record.
 */
const VU_PASS_CYCLIST: CyclistRightHookSpec = {
  id: "sc-vup-cyclist",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vup-n-end", x: 0, y: 360 },
  actor: {
    pathNodes: ["vup-n-start", "vup-n-end"],
    // y = 140 — he WAITS at the kerb 125 m ahead of the spawn until the driver
    // is ~15 m behind him, then rides. Was −250 (y = 110) with a release that
    // fired on frame one; see DEFECT 8 above for the two criticals that bought.
    hold: { nodeIndex: 1, offsetM: -220 },
    cruiseSpeedMps: 3.0,
    // The curb line (tags the proxy as a cyclist, A11). 2.6 → 2.29: see
    // VUP_CYCLIST_X for the band arithmetic this number decides — at 2.6 the
    // do-nothing lane-centre line landed inside the runtime's SILENT band and
    // the lesson graded neither direction; below 2.14 the taught line falls
    // inside the following detector's corridor and the CORRECT pass is billed.
    extraRightOffsetM: 2.29,
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  // Release when the driver is 235 m from vup-n-end (0, 360) — i.e. at y ≈ 125,
  // ~15 m short of the held rider. Was 360, which EXCEEDS the 345.02 m from the
  // spawn to that node and therefore fired on frame one (DEFECT 8). 235 is the
  // centre of the 225–245 window in which all three committed demos still grade
  // exactly their codeRefs, which is what makes it survive the runner's ±5 m
  // jitter on every retry draw.
  releaseDistM: 235,
  dangerRadiusM: 9, // inert here — no right turn exists on this street
  conflictWindowM: 25,
};

/**
 * VU-02 — тясно изпреварване на колело (ЗДвП чл. 42: изпреварваш велосипедист
 * само с достатъчно СТРАНИЧНО РАЗСТОЯНИЕ и намалена скорост; учи се ~1,5 м
 * въздух — bank-verified: q-uyazvimi-010/012/045 ground the duty at чл. 42).
 * Graded by the runtime vulnerable-pass tracker: convict < ~1.2 m of air,
 * teach band 1.2–1.5 m (silent — honest grace), ≥ 1.5 m earns the yielded
 * commendation.
 */
export const SC_VU_PASS_CLEARANCE: ScenarioSpec = {
  id: "sc-vu-pass-clearance",
  family: "vru",
  tagsBg: ["велосипедист", "странична дистанция", "изпреварване", "уязвими участници"],
  titleBg: "Изпреварване на велосипедист",
  objectiveBg:
    "Покрай десния бордюр се движи велосипедист. Изпревари го с широка дъга — поне метър и половина въздух между вас: огледало, мигач наляво, отмести се осезаемо и се прибери чак когато е далеч зад теб.",
  archetypeIds: ["VU-02"],
  conceptIds: ["c-cyclists", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-pass-v1.json meta.scenario.params
    // (tools/maps/gen_vu_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50, variant: "pass" },
    districtId: "vu-pass-v1",
  },
  start: {
    spawnPointId: "vup-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и се установи на спокойна градска скорост." },
    {
      n: 2,
      textBg:
        "Пред теб, покрай десния бордюр, кара велосипедист. Не се залепяй зад него — прецени отрано откъде ще минеш.",
    },
    {
      n: 3,
      textBg:
        "Огледало, мигач наляво и се отмести осезаемо наляво — целта е поне метър и половина въздух между теб и колелото.",
    },
    {
      n: 4,
      textBg:
        "Подмини го спокойно, без да ускоряваш рязко до него — велосипедистът може да се отклони внезапно заради дупка или вятър.",
    },
    { n: 5, textBg: "Прибери се плавно вдясно чак когато велосипедистът е изцяло зад теб, и продължи." },
  ],
  success: [
    {
      id: "sc-vup-pass",
      // WAS «Изпревари велосипедиста с широка дъга» — a certificate for a
      // MANOEUVRE AGAINST ANOTHER ACTOR, issued by a disc 195 m up an empty
      // street. `stepReachZone` sees one SimTick: position, speed, lane,
      // indicator. It cannot know whether a rider was passed, let alone how
      // wide. MEASURED on staging: the careful drive ticked this at 2:34 with
      // the cyclist STILL AHEAD of the car (the rider cruises 3.0 m/s and a
      // creeping student never closes), and the flat-out drive ticked it at
      // 0:47 having buzzed him at 1.35 m of air. Three stars, both times.
      // WHAT THE DISC PROVES: (4.06, 210) r9 is the northbound lane centre 195 m
      // up a junction-free street — the car came back to its lane and carried
      // on. That is a real, teachable half of the manoeuvre (the copy's step 5,
      // „прибери се плавно вдясно"), and it is all this row may claim.
      // The CLEARANCE half is graded where it can be measured: the runtime's
      // vulnerable-pass tracker, which after the VUP_CYCLIST_X correction above
      // convicts VULNERABLE_PASS_TOO_CLOSE on the un-shifted line and awards
      // YIELDED_TO_PRIORITY on the taught one. Params untouched — `done` is
      // bit-identical.
      titleBg: "Прибери се в лентата и продължи по улицата",
      params: { kind: "reachZone", x: VUP_LANE_X, y: 210, radiusM: 9 },
    },
    {
      id: "sc-vup-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: VUP_LANE_X, y: 300, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (N8 slice 1): committed deterministic recordings of the authored
  // scripts in traces/scVuPass.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY from the clean pass) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-pass-clearance-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-pass-clearance/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-pass-clearance/mistake-squeeze.trace.json" },
      titleBg: "Провиране покрай велосипедиста",
      whatWentWrongBg:
        "Колата се провря покрай велосипедиста на около метър въздух, без изобщо да смени линията си. Законът изисква ДОСТАТЪЧНА странична дистанция (чл. 42) — учи се метър и половина: на метър всяко клатушкане на колелото е сблъсък, а велосипедистът се отклонява без предупреждение.",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-pass-clearance/mistake-fast-close.trace.json" },
      titleBg: "Бързо изпреварване с късно отместване",
      whatWentWrongBg:
        "Водачът се отмести едва в последния миг и профуча плътно покрай велосипедиста с непроменена скорост. Дъгата се строи ОТРАНО — късното отместване оставя същия половин метър въздух, само че при два пъти по-висока скорост: по-малко време за реакция и по-силен въздушен тласък върху колелото (чл. 42).",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато изпреварваш велосипедист, тротинетка или каруца в града и извън него — включително когато „само ще го подминеш“ в собствената си лента. Широката дъга важи и при пресичане на осевата, ако е прекъсната и насрещното е чисто.",
    whyBg:
      "Притиснатият велосипедист няма ламарина и няма втори шанс: дупка, шахта или порив на вятъра го отклоняват с метър встрани за миг. Дистанцията, която оставяш, е точно резервът за това отклонение — затова се учи метър и половина, а не „колкото се събере“.",
    lawRef: "ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа: навременна преценка (без залепяне зад колелото), огледало и мигач преди отместването, осезаема широка дъга с намалена скорост и плавно прибиране чак след като велосипедистът е чист. Провирането на по-малко от метър е грешка.",
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
  staged: [VU_PASS_CYCLIST],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-vu-door-zone — „Зоната на вратата" (VU-04) on vu-door-v1 (300 m 1+1
//    street + occupied parallel row on the east curb + М1 span over the row;
//    the header documents the door's timed-obstacle design + scene descope)
// ---------------------------------------------------------------------------

/** vu-door-v1 northbound lane center. */
const VUD_LANE_X = 4.06;
/** The door-zone DISCIPLINE line: ~1.2 m west of the lane center — the car's
 *  right flank rides ≈ 2.3 m off the parked row (a full door width + margin).
 *  Pinned with the row (bays x 6.75, parked-rect flank x 5.85) by the
 *  vu-streets district battery. */
const VUD_CLEAR_X = 2.6;

/**
 * VU-04 — вратата / the door zone (driver side: ЗДвП чл. 20 — контрол и
 * готовност за спиране покрай редица паркирани коли; bank-verified:
 * q-uyazvimi-056 grounds exactly the parked-row precautions at чл. 20. The
 * OPENER's duty — чл. 95, не отваряй врата, ако застрашаваш някого — lives in
 * the copy: the graded lesson is the DRIVER's positioning). The door itself
 * is a TIMED trace obstacle (ObstacleRect2D.trigger, pinned in
 * traces/scVuDoorZone.ts); the live scene mounts the hittable parked row from
 * meta.scenario.bays but NO door prop (documented descope — the demos and the
 * copy carry the ambush).
 */
export const SC_VU_DOOR_ZONE: ScenarioSpec = {
  id: "sc-vu-door-zone",
  family: "vru",
  tagsBg: ["паркирани коли", "врата", "странична дистанция", "градско каране"],
  titleBg: "Зоната на вратата",
  objectiveBg:
    "Минаваш покрай плътна редица паркирани коли. Дръж поне една отворена врата разстояние от тях и намали — вратата се отваря без предупреждение, а между колите може да излезе пешеходец.",
  archetypeIds: ["VU-04"],
  conceptIds: ["c-general-care-duty", "c-leaving-vehicle-safely"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-door-v1.json meta.scenario.params
    // (tools/maps/gen_vu_streets.mjs).
    params: {
      lengthM: 300,
      maxspeedKmh: 40,
      variant: "door",
      banFromM: 90,
      banToM: 240,
      parkedRowXM: 6.75,
    },
    districtId: "vu-door-v1",
  },
  start: {
    spawnPointId: "vud-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред вдясно започва дълга редица паркирани коли." },
    {
      n: 2,
      textBg:
        "Още преди редицата се отмести наляво в своята лента: дръж поне една отворена врата разстояние от паркираните коли.",
    },
    // STEPS 3–4, MADE HONEST ABOUT THIS STREET (2026-08-17). The scene descope
    // documented in the header — the row is mounted from meta.scenario.bays,
    // the DOOR is a timed obstacle that exists only inside the recorded demos —
    // has a cost the copy was not paying. Step 3 read „крака под браниците,
    // сенки между колите, светнали стопове, глава зад волана", four cues to
    // hunt for; the live row is a line of sealed, unoccupied, unlit shells and
    // the student hunts 300 m of nothing. Step 4 read „Ако врата се отвори пред
    // теб…", promising an event no live drive can produce. Copy that describes
    // a world the student is not in teaches him to distrust the copy.
    //
    // The TEACHING is not cut — cutting it would trade a false promise for a
    // silent gap, and the four telltales are the whole skill (THEO-4: the
    // student is owed the reason). It is re-voiced as what it is: the habit he
    // is building here and will need on a real street, with this street's own
    // discipline — the line — as the thing he is actually doing right now.
    {
      n: 3,
      textBg:
        "Намали и се научи да гледаш КРАЙ колите, не само пътя. На улицата издайниците са четири: крака под браниците, сенки между колите, светнали стопове, глава зад волана. Тук редицата е празна — упражняваш самото оглеждане.",
    },
    {
      n: 4,
      textBg:
        "Дръж линията си докрай, без да я поправяш в последния момент. Отвори ли се врата — тук или на истинска улица — спасението е дистанцията, която ВЕЧЕ си взел; рязкото свиване в насрещното е по-големият риск.",
    },
    { n: 5, textBg: "След края на редицата се върни плавно към средата на лентата и продължи." },
  ],
  success: [
    {
      id: "sc-vud-row",
      /**
       * …AND THEN THE TITLE NAMED THE ONE THING ON THIS STREET THAT ISN'T THERE
       * (2026-08-17). The doc-87 pass below moved this gate onto the door's y
       * and shrank it to the lateral band — good work, and the params keep it —
       * but it left the row called «Подмини ВРАТАТА по своята линия». The live
       * scene mounts no door (the descope in this file's header), so on every
       * real drive that sentence is a task the student cannot perform and a
       * tick he cannot connect to anything he saw. MEASURED on staging: the
       * mistake drive — two collisions, 20 наказателни точки, НЕИЗДЪРЖАН —
       * carries «✓ Подмини вратата…» at 0:44 on its own verdict screen.
       *
       * The word goes; the measurement does not move. What the disc proves is
       * the LINE at the door's own y, and that is what it now says. The door
       * keeps its teaching in briefing step 4, in teach.whyBg (чл. 95 and чл.
       * 20 together) and in the mistake demo that hits it — all places that do
       * not promise the student he will meet one.
       */
      titleBg: "Мини покрай редицата по своята линия — без да излизаш в насрещното",
      /**
       * THE GATE THAT MEASURES WHAT ITS TITLE PROMISES (doc 87, 2026-08-09).
       *
       * This was `(2.6, 175) r 6, ≤40` and it was titled „премини покрай
       * редицата с дистанция от вратите". It measured neither half of that.
       * A radius-6 disc on an 8.125 m lane accepts x ∈ [−3.4, 8.6]: the whole
       * carriageway, the ONCOMING bank past the М1, and the door swing itself.
       * And it sat at y = 175 — nineteen metres PAST the door at y = 156,
       * which is the one place on this street where the student's line is the
       * lesson.
       *
       * It was found by the Наредба № 38 re-baseline: `CROSSED_SOLID_LINE` was
       * carrying an unlawful 10-point опасна charge, and when that came off,
       * the „рязко избягване през непрекъснатата линия" mistake demo PASSED
       * the drill — it dives to x = −1.2 across the осева, comes back, and
       * ticks every gate the template authored. The severity had been doing
       * the objectives' job; the drill never encoded „не пресичай осевата" at
       * all. `s10-vru-pack-bot-completion.test.ts` pinned that hole on purpose
       * so that closing it would go red here.
       *
       * Closed by moving the gate ONTO the door and shrinking it to the band
       * the lesson actually teaches. At (2.6, 156) r 2.2 the acceptance is
       * x ∈ [0.4, 4.8]:
       *   left bound  — right of the М1 осева at x = 0: the swerve is out.
       *   right bound — 1.05 m clear of the parked flank at x = 5.85: the hug
       *                 line at 4.6 is still inside (it fails on the door it
       *                 hits, which is ITS honest code), but a car any further
       *                 over is in the swing.
       * Measured against the three committed drives at y = 156: shadow 0.00 m
       * off centre, hug 2.00, swerve 3.7+ — and the L1 ladder widens 2.2 to
       * 3.3, still short of the swerve. No `maxSpeedKmh`: a cap would arm the
       * evaluator's grace CAPSULE, and this gate is about lateral position, the
       * one thing a capsule stretched down the approach must not forgive. The
       * pace contract moved to the finish gate below, where it costs nothing.
       */
      params: { kind: "reachZone", x: VUD_CLEAR_X, y: 156, radiusM: 2.2 },
    },
    {
      id: "sc-vud-finish",
      titleBg: "Върни се плавно в средата на лентата и продължи до края",
      // The row's pace contract lives here now (see sc-vud-row): past the row
      // the street is straight and empty, so a cap is a pace check rather than
      // a position trap, and the terminal gate is where the evaluator's grace
      // capsule is designed to be forgiving.
      params: { kind: "reachZone", x: VUD_LANE_X, y: 270, radiusM: 9, maxSpeedKmh: 40 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (N8 slice 1): committed deterministic recordings of the authored
  // scripts in traces/scVuDoorZone.ts; the §5 gate (shadow replays with ZERO
  // violations while the door opens harmlessly beside it) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-door-zone-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-door-zone/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-door-zone/mistake-hug.trace.json" },
      titleBg: "Каране плътно до паркираните коли",
      whatWentWrongBg:
        "Колата се движеше на педя от паркираната редица и когато врата се отвори пред нея, нямаше нито време, нито място — удар. „Зоната на вратата“ е около метър от всяка паркирана кола: който кара в нея, залага на това, че никой няма да отвори. Дистанцията се държи ПРЕДВАРИТЕЛНО (чл. 20).",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-door-zone/mistake-swerve.trace.json" },
      titleBg: "Рязко избягване през непрекъснатата линия",
      whatWentWrongBg:
        "Водачът караше плътно до редицата и когато вратата се отвори, сви рязко в насрещната лента — през непрекъснатата осева линия. Избегна вратата, но размени един риск за по-голям: насрещното платно зад М1 не е изход. Правилният отговор се взема ПРЕДИ редицата — дистанция, която прави маневрата излишна (чл. 20).",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
  ],
  teach: {
    whenBg:
      "По всяка градска улица с паркирани коли покрай бордюра — особено до училища, магазини и вечер, когато хората се прибират по колите си. Същата дисциплина пази и велосипедистите: те загиват точно в зоната на вратата.",
    whyBg:
      "Вратата се отваря за половин секунда и спира кола, дете или велосипедист. Никаква реакция не компенсира липсващия метър — единствената работеща защита е позицията: една отворена врата разстояние от редицата и намалена скорост. Затова водачът, който слиза, е длъжен да огледа (чл. 95), а водачът, който минава — да е извън обсега на вратата (чл. 20).",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият гледа: навременно отместване от паркираната редица (без да пресичаш непрекъснатата осева), намалена скорост и активно наблюдение на колите — стопове, глави, движение между браниците. Каране на педя от редицата е рискова позиция.",
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
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The VRU-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU: readonly ScenarioSpec[] = [
  SC_VU_CYCLIST_HOOK,
  SC_VU_EMERGENCY,
  SC_VU_EMERGENCY_JUNCTION,
  SC_VU_PASS_CLEARANCE,
  SC_VU_DOOR_ZONE,
];
