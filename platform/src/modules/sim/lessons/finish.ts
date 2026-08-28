/**
 * ROUTE FINISH GATE — „стигнах до края, а изпитът не спира" (founder report,
 * 2026-07-28).
 *
 * THE BUG THIS EXISTS FOR. Objectives are strictly sequential (objectives.ts):
 * only the ACTIVE one advances, and the session used to end on exactly one
 * condition — `currentObjectiveIndex >= objectives.length`, i.e. EVERY
 * objective satisfied. An objective the student drove past therefore never
 * completes and never yields: the chain stalls on it forever, the guidance
 * ribbon keeps pointing BACK to it, and the drive cannot end. A student who
 * made mistakes had to re-drive the whole route correctly before he was
 * allowed to find out what the mistakes were. That is backwards — the debrief
 * IS the teaching, and it must be reachable by the student who needs it most.
 *
 * THE RULE. Reaching the end of the route ENDS the drive, driven well or
 * driven badly. This module derives WHERE that end is (the terminal target of
 * the LAST objective — the point the guidance ribbon ends at, see
 * scene/guidanceRoute.ts `guidanceGoalFor`) and folds the per-tick arrival
 * test that trips it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It does not touch grading. Nothing here emits, suppresses or reweights a
 *    single ScorableEvent; it decides WHEN the session stops, never WHAT
 *    counts as a fault. A drive that ends here ends with its objectives
 *    honestly marked incomplete — including the final one, which is ARRIVED
 *    AT, not performed (a car that rolls up beside the bay has not parked) —
 *    so `buildLessonResult` reports it as FINISHED-but-NOT-PASSED
 *    (completedAll === false ⇒ passed === false). Finishing and passing stay
 *    two different things.
 *  - It never arms while the chain is healthy. A run that progresses normally
 *    reaches the last objective and terminates through the pre-existing path,
 *    bit-identically: L7 still has to park, L3 still has to come out of the
 *    roundabout, a clean exam still ends on its own last objective.
 *
 * ---------------------------------------------------------------------------
 * 2026-07-30 — B1/B2/B3 (doc 86 §3). The gate shipped correct and INCOMPLETE:
 * three different causes still stranded students, and the founder's most
 * repeated complaint („the only solution was refreshing the entire webpage")
 * was all three at once. None of them is a bug in the rule above; each is a
 * place the rule was not reachable.
 *
 *  B1 — TEN routes had no anchor at all. `finishAnchor` returned a zone only
 *  for `parkInBay`; every other terminal maneuver returned null, so six
 *  roundabout drills and four turn drills had NO termination path whatsoever
 *  — not a hard one, none. The premise ("a maneuver target is where the WORK
 *  happens, so arriving there is not an ending") was right; the conclusion was
 *  wrong. The ending is not the island — it is having LEFT the island. Those
 *  anchors are now `mode: "outside"`: armed by reaching the ring/corridor,
 *  tripped by driving away from it. Standing still in the middle of the work
 *  can never end a drive, and finishing the work and leaving always can.
 *
 *  B2 — the rescue was disarmed on the FINAL objective (`engine.ts` consulted
 *  it only while `currentIndex < objectives.length - 1`), which is precisely
 *  where a student is most likely to be stuck: the last gate is the one with
 *  nothing after it to walk to. It is armed there now, through a SEPARATE
 *  derivation (`terminalRescueZone`) rather than the same zone, because the
 *  two situations need different evidence. A stalled chain is proven by the
 *  car being where the route ends. A stuck TERMINAL objective is proven by the
 *  car being there AND STANDING COMPLETELY STILL for FINISH_STUCK_S — the one
 *  signal no legitimate approach, creep, shuffle or red-light wait produces
 *  while it is still going somewhere. Without that distinction the rescue
 *  would eat the very lessons it is meant to save: a candidate lining up 10 m
 *  short of the exam bay, or a beginner pausing mid-park to think.
 *
 *  B3 — the rescue inherited the terminal objective's deliberately
 *  lane-exclusive radius. Templates author radius 4–6 so the gate is
 *  satisfiable only from the correct lane; the rescue copied that, so a car
 *  one lane over at the end of the route (8.13 m — the taught mistake of
 *  `sc-ln-boulevard-discipline` puts it exactly there) missed the escape by
 *  centimetres. The rescue radius now has a FLOOR of FINISH_LANE_FLOOR_M,
 *  applied before the half-distance clamp, and the terminal rescue skips the
 *  clamp entirely — by then every earlier leg is already complete, so there is
 *  no leg left for the finish to swallow.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18 — B1's SHAPE HAD A HOLE IN IT (sweep161, the 174-scenario audit).
 * B1 gave the maneuver anchors an "outside" face and got the two circles right
 * for both of them. The `passSignal` anchor, written to the same shape, ships
 * ONE radius and let `normalizeOutside` default the arming circle to it — so
 * its band is zero wide and „left the junction" means „one pose sample further
 * out than the sample that armed it". Five rungs measured (see
 * FINISH_OUTSIDE_ANNULUS_M), and on all five the junction's own graded stop
 * line falls INSIDE the arming circle, so the gate is armed by stopping
 * legally and tripped by hesitating a metre outside it — at a GREEN light,
 * where B15's freeze withholds nothing. The floor now lives in
 * `normalizeOutside`, where it is a property of the shape and not of any one
 * anchor.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-19 — WHAT THIS MODULE CANNOT END, MEASURED, so the next wave does not
 * spend itself re-deciding it. Thirteen of sweep161's twenty-two findings here
 * are one sentence — „the lesson never ends, the harness had to press «Прекрати
 * урока», and the debrief printed «Урокът беше прекъснат преди края» over a
 * scoreboard the student had not earned". EVERY gate in this file is anchored
 * at the END of the route, and the audited drives never got there:
 *
 *   sc-merge-accel-lane  terminal `reachZone` (0, 930) — 930 m of route against
 *                        a 55 s benchmark; all four lanes forced at 274–277 s.
 *   sc-ln-decisive-change  terminal (4.06, 355); mobile forced at 272 s.
 *   sc-junction-blind    the ego leaves the authored world after the impact —
 *                        `pc-right/04-t090s.png` is a featureless green plane —
 *                        and its run.log oscillates 0…14 км/ч for 209 s.
 *
 * That last number is the one that decides it. A GLOBAL IDLE bound would close
 * none of them: the speed traces of every stranded lane in the sweep oscillate
 * 0–20 км/ч, so no standstill bar at any duration is ever met. What ends those
 * drives is a SESSION-level budget or an off-network test (`SimTick.edgeId ===
 * null` is the existing channel for „off-road/unknown"), and both need an arm
 * in `engine.ts`, which is not this lane's file. Adding an unmeasured duration
 * cap here instead would end drives on a timer regardless of what the student
 * is doing — a false refusal manufactured to answer a missing ending, which is
 * the trade this module exists to refuse.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-19, LATER — THE ROW ABOVE IS RIGHT TO REFUSE AND ITS EVIDENCE IS TOO
 * WEAK TO BUILD ON. Re-measured before anything was changed, because a lane
 * that inherits a premise it did not check fixes nothing and reports that it
 * did. Two of the three drives it names are not this module's defect.
 *
 *  · THE SWEEP'S DRIVER CANNOT MEET ANY BAR IN THIS FILE. `lesson-audit.mjs` is
 *    a roll-then-stop phase machine: CRUISE_KMH 12 (:1109), ROLL_DISTANCE_M 15
 *    (:1129), STOP_MS 3000 (:1130), inside a 210 s wall-clock DRIVE_BUDGET_MS
 *    (:1074). Its stops are three seconds. Every standstill face here is 12 s
 *    (FINISH_STUCK_S), 25 s (bay) or 75 s (stranded), so NO drive it produces
 *    can ever trip one — not because the gate is missing but because the driver
 *    never stands still. Doc 88 §5 says the same of its speed.
 *  · AND ITS BUDGET IS SHORTER THAN SOME ROUTES ARE LONG. `sc-merge-accel-lane`
 *    is 930 m of route; at 12 км/ч that is ≥ 279 s of MOTION before its 24–26
 *    stops are paid for, against 210 s of budget. Its `pc-right` run.log spends
 *    the whole budget and reports „the drive stopped after 211 s without the
 *    session ending" at a top speed of 15 км/ч — it covered less than half the
 *    road. Nothing was stranded; the lesson was never driven to its end.
 *  · MEASURED OVER THE WHOLE SWEEP rather than over the three named lanes: of
 *    166 scenarios carrying a machine summary, EIGHT had no lane end by itself
 *    (`sc-ed-reverse-line`, `sc-merge-accel-lane`, `sc-merge-bus-pullout`,
 *    `sc-merge-motorway-exit`, `sc-ov-crest-curve`, `sc-park-gap-long`,
 *    `sc-park-parallel`, `sc-park-zebra`) and 56 more ended on some lanes and
 *    not others. Three of the eight end on a BAY, whose only escape is 25 s
 *    motionless in it — which is a bar a bot that stops for three seconds and
 *    cannot park will never meet on any build. „ended: false" in that corpus is
 *    therefore not by itself evidence that a lesson has no ending, and the
 *    eleven-lesson framing rests on it.
 *
 * WHAT SURVIVES THE RE-MEASUREMENT, and it is one class rather than eleven
 * lessons: A CAR THAT IS NO LONGER IN THE AUTHORED WORLD. `sc-junction-blind`
 * pc-right leaves it after the impact — `04-t090s.png` is a featureless green
 * plane, no road, no kerb, no buildings — and the session runs 146 s more with
 * the task chip still asking for a left turn out of a junction that is nowhere
 * on the screen. No gate in this file can see that, and none is defective for
 * failing to: every one is anchored on route geometry the car is no longer
 * near, and the crash pin is DISARMED by driving away from the impact, which is
 * exactly what driving off the map does. That drive would not have ended at any
 * duration, on any budget, however it was driven.
 *
 * WHAT WOULD CLOSE IT — BOTH HALVES NOW EXIST HERE, AND THE ARM STILL DOES NOT.
 * The evidence is `SimTick.edgeId === null` held continuously — the runtime's
 * own statement that the locator found no centreline within
 * OFF_ROAD_DISTANCE_M = 30 m (runtime/locator.ts; `worldRuntime.sample`
 * publishes it on every real tick, and `undefined` — a hand-built tick, a
 * recorded trace — must stay innocent). Never a speed test, for the reason the
 * row above gives. The two conditions that paragraph set have been met in this
 * file: the fold is `stepOffNetwork` and the sentence is
 * `offNetworkEndingCopy`, both measured and both tested in both directions
 * (`__tests__/off-network-ending.test.ts`). What is still outstanding is the one
 * thing that was never this file's to do — the ARM, which is three lines in
 * `lessons/engine.ts` plus one primitive field in `lessons/types.ts`, written
 * out verbatim at the end of the O22 block below. Until that lands, a car off
 * the map still cannot be ended on; nothing in this file's behaviour has
 * changed.
 *
 * THE ARM LANDED FIVE DAYS AFTER THAT PARAGRAPH WAS WRITTEN, AND IT NEVER SAID
 * SO — 7404468, 2026-08-19, „the car that drove off the world can be told so".
 * `engine.ts:1302` folds `stepOffNetwork` on every driving frame and pushes
 * `offNetworkEndingCopy` at the bar; `types.ts` carries `offNetworkSinceSec`.
 * The two paragraphs above are kept verbatim because they are the derivation of
 * OFF_NETWORK_STUCK_S and of the copy, and both are still load-bearing — but
 * „the ARM still does not [exist]" is now false, and a routing note that has
 * gone stale is worse than none: it sends the next reader to build a thing that
 * is already running. Found 2026-08-25 while adjudicating
 * sc-ov-oncoming-gap:83420a40 („the car can leave the road network entirely and
 * keep driving"), whose OWN answer is the mirror of this one and is recorded at
 * the O22 block below: on that lane the arm was armed and correctly silent — the
 * car never left the network. See there before re-filing this class.
 *
 * The false-refusal case the row said to measure FIRST has been measured, and
 * the margin is far thinner than „the authored targets are safe" suggested. That
 * sentence („the deepest parking bay in the lot districts sits 6.3 m from the
 * nearest centreline") described where lessons SEND a student. Where a car can
 * legally BE is 29.355 m — the kerbside parking band of `district-v1`'s
 * five-lane boulevard — leaving 0.645 m of headroom on a 30 m threshold. That
 * number, not the 6.3 m one, is what sets OFF_NETWORK_STUCK_S.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-22 — O30. EVERY ENDING AN ARRIVAL TERMINAL HAD WAS AN ARRIVAL, and
 * the class that survived the re-measurement above was not the only one left.
 * The 2026-08-19 row concluded that the stranded lanes were the harness's short
 * budget, and for the ones it named that is right; it did not look at what
 * happens to a car that DOES reach the end of the route and does not stop
 * there. `routeFinishZone` asks for presence and the engine withholds it on the
 * terminal objective; `terminalRescueZone` asks for a full standstill AT the
 * mark. A car that drives THROUGH the mark and carries on satisfies neither —
 * and on the 132 rungs whose terminal carries a SPEED CONTRACT it can no longer
 * satisfy the objective either WHILE HE KEEPS GOING, because `stepReachZone`
 * grades `done = reached && capMet` and one sweep of the disc over the cap
 * spends `capMet`. Nothing in this module is anchored anywhere that car still
 * is. It is NOT spent for good — see the O30 block for the drive that re-earns
 * it, which is why the arm written out there may not land as first specified.
 *
 * `terminalDepartureZone` is that ending — B1's own sentence („the ending is
 * not the island, it is having LEFT the island") pointed at a waypoint. See it
 * for the shape, the census, the nine compact drills it is deliberately
 * withheld from, why a bay never gets it, and why it is a THIRD zone rather
 * than a second face on the rescue (the module carries two faces per zone and
 * a terminal arrival needs three; the third needs one field this lane does not
 * own). `__tests__/terminal-departure.test.ts` drives it on shipped lessons and
 * ratchets the census; `routeDepartedEndingCopy` is the sentence it needs. The
 * ARM LANDED AND WAS DISARMED THE SAME DAY (2026-08-24), at a dwell re-sized
 * 20 → 75 s so the recorded return drive is not refused — see
 * FINISH_DEPARTED_S for the derivation, the arm block below for the two
 * options that were rejected instead, and the 2026-08-28 block for why this
 * sentence used to stop after the first four words.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-28 — WHAT THIS FILE CLAIMS TO SHIP AND WHAT IT ACTUALLY SHIPS.
 *
 * The paragraph above read „The ARM LANDED 2026-08-24 (engine.ts + one field in
 * types.ts)" and stopped there, and a reader who believed it — this lane did,
 * for the first half of an afternoon — would close the O30 class as done.
 * `lessons/engine.ts:1665` reads, at HEAD:
 *
 *     const departure: ReturnType<typeof terminalDepartureZone> = null;
 *
 * The TYPE is imported; the FUNCTION is called on no frame of any lesson. So
 * `terminalDepartureZone`, `FINISH_DEPARTED_S` and `routeDepartedEndingCopy`
 * are three exports of this file that no student has ever met, and the
 * `finishDepartureGate` branch in `engine.ts` is unreachable on every frame of
 * every drive. That is the same failure this file names two blocks up about the
 * off-network arm („a routing note that has gone stale is worse than none")
 * pointing the other way: that note UNDER-claimed a thing that was running,
 * this one OVER-claimed a thing that is not, which is the more expensive
 * direction because it retires a defect nobody fixed.
 *
 * The re-enable condition is stated at the pin and is unchanged: the region
 * dwell accumulates WHILE THE CAR IS DRIVING BACK, so it must accrue only while
 * the car is NOT CLOSING ON THE MARK, and neither the state that would carry
 * the previous range (`FinishGateState`, types.ts) nor the arm (engine.ts) is
 * this lane's to write. Nothing here is edited to pretend otherwise.
 *
 * AND THE „NEVER ENDS" CLASS IS REFUTED FOR A THIRD TIME, so the numbers live
 * here rather than in a report the next wave will not find. Six sweep161 rows
 * were re-filed against this file in wave 7; every one was re-driven at HEAD
 * (`.audit-frames/w14`, tree 6399a8de6e7c) and none of them is this module's:
 *
 *   sc-ac-aquaplane:517af4c5 — „five of seven cannot be finished by driving …
 *     the pass path exists in exactly one lesson out of seven". THREE of the
 *     five end BY THEMSELVES at HEAD (`endedNaturally: true · forcedBy: -`):
 *     sc-ac-ice (ИЗДЪРЖАН · 0 наказателни т. · ★★★), sc-ac-bridge-ice and
 *     sc-ac-wind-truck-pass. The three still forced hit the HARNESS'S OWN wall
 *     — «the drive stopped after 210s without the session ending (its whole
 *     210s budget)» — short of their own terminal marks. Spawn → terminal
 *     against the witness path each drive actually covered:
 *         sc-ac-aquaplane       (4.06,15)→(4.06,450)  435 m · drove 360.3 m —  75 m short
 *         sc-ac-night-overdrive (4.06,15)→(4.06,390)  375 m · drove 316.1 m —  59 m short
 *         sc-ac-truck-spray     (0,15)   →(0,860)     845 m · drove 364.7 m — 480 m short
 *     No gate here is anchored where those cars stopped, and none should be:
 *     they were never driven to the end of the route.
 *
 *   sc-ln-decisive-change:8a50a9f9 — „the lesson has no completion condition
 *     that fires". One fires on EVERY leg: w10-1, w11, w12 and w13 each record
 *     `ended: true · endedNaturally: true · forcedBy: -` on mobile/right. What
 *     never credits is objective 2, `sc-lndc-merged` — a 2 m acceptance disc in
 *     the LEFT lane (4.06) — on an instrument whose own caveat says it steers a
 *     road CENTRELINE and that „NO LANE-POSITION FINDING MAY BE DRAWN FROM THIS
 *     DRIVE". Objective 3 is sequential behind it. A template radius and an
 *     instrument limit, not a missing ending. (The 2026-08-19 row above lists
 *     this lesson as „mobile forced at 272 s"; that is sweep161 and it is now
 *     four waves stale.)
 *
 *   sc-junction-blind:c5ba8f17 — „the chip keeps demanding the turn while the
 *     car sits off-map". The sweep161 drive ran 209 s and was forced. At HEAD
 *     the same lane ends ITSELF at ≈79 s on the CRASH PIN, with the pin's own
 *     sentence on the glass — «След удара колата остана притисната на място и
 *     не може да продължи по маршрута — затова урокът приключва тук» — and its
 *     last drive frame is `04-t074s.png`. The 135 s of off-world driving that
 *     OFF_NETWORK_STUCK_S was sized against does not occur on this lane any
 *     more, because the pin fires long before the off-network bar does. The
 *     derivation stays: it is the only measurement of that class in hand.
 *
 * The other three rows (sc-sig-controller-live:bf4c6bab commendations,
 * sc-vu-pass-clearance:cb312a1b lesson length + stars, sc-jx-giveway-b1:cad64e2d
 * the one-star floor) name this file as the suspect and it grades nothing —
 * they are `rules/engine.ts` (`cleanDrivingDistanceM` 250 m against a 96.3 m
 * route), `rules/` conviction and `scenario/rubric.ts` + `hud/SessionEndScreen`
 * respectively. Recorded so the next wave routes them instead of re-filing.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-28, ROUND 14 — THE FOURTH RE-FILING OF THE „NEVER ENDS" CLASS, AND
 * THE ONE PIECE OF EVIDENCE THAT SETTLES THE JUNCTION HALF OF IT.
 *
 * Four more sweep161 rows arrived against this file and against the objective
 * evaluator. Every one was re-read at HEAD (`.audit-frames/w14`, and `w11`
 * where the decisive leg is) and none is this module's. What is new — and what
 * three previous waves did not have — is a POSITIVE control for the junction
 * family, so the next reader does not have to take „the disc is reachable" on
 * geometry alone:
 *
 *   `.audit-frames/w11/frames/sc-junction-rhr__pc-right/run.log`
 *       TRACKING: TRACKED · ribbon seen on 42/49 moving samples (86 %)
 *       ✓ Приближи кръстовището бавно и с готовност за спиране  1:05
 *       ✓ Завий наляво и излез от кръстовището на запад         1:43
 *
 * That is the ONLY leg in the whole corpus on which the harness's steering loop
 * stayed closed round the corner, and on it the west-arm exit gate ticks. The
 * three drills the rows are filed on author the SAME shape — a radius-9 disc on
 * the west-arm westbound lane centre, 50–55 m out (`sc-jrhr-cross` (−50, 4.06),
 * `sc-jblind-cross` (−50, 4.06), `sc-jleft-exit` (−55, 4.06)) — on west arms of
 * 150 m, 140 m and 160 m (`public/world/tj-*-v1.json`). Every leg that misses
 * it carries its own harness banner saying why: loop closed on 39–72 % of the
 * moving samples, i.e. «the car was steering blind for that part of the drive,
 * and where it went then is not evidence about the product».
 *
 *   sc-junction-left:2e42b935 — „objective 3 never ticks in any of the four
 *     runs; the lesson has no reachable end state". The shape that ticks in
 *     w11 is the shape this drill authors, and its own legs run at 39–60 %
 *     tracking. Not a missing end state — an unsteered approach.
 *
 *   sc-junction-rhr:83b4fd69 — „the correct drive is convicted, not credited:
 *     20 наказателни точки, 2 опасни грешки". At HEAD the „right" lane ends
 *     ITSELF (`endedNaturally: true · forcedBy: -`) on two graded collisions —
 *     «Удар в друго превозно средство» + «Удар в неподвижно препятствие» — at
 *     59 % tracking; the SAME lane at w11, tracked, returned ИЗДЪРЖАН with 3
 *     points. A collision is `rules/` conviction and nothing here or in
 *     `objectives.ts` bills it.
 *
 *   sc-junction-blind:c5ba8f17 — „the chip keeps demanding the turn while the
 *     car sits off-map". Re-measured at w14: the lane's LAST drive frame is
 *     `04-t074s.png`, it ends itself at ≈79 s on the CRASH PIN, and the frame
 *     carries the pin's own «ОПАСНА ГРЕШКА −10 · Удар в неподвижно
 *     препятствие» card. The 135 s of off-world driving the sweep161 frame
 *     shows (`04-t090s.png`, a green plane with no road in it) does not occur.
 *
 *   sc-ov-being-overtaken:3a244204 — „the drive cannot end on its own; the
 *     harness presses «Прекрати урока» at 205 s". Still `ended: false` at w14,
 *     and for the reason the three sc-ac rows above have: the car is nowhere
 *     near a gate. Spawn `ovg-spawn-start` is (4.06, 15) and the FIRST of the
 *     two marks is y = 380 — 365 m — against a witness path of 286.5 m net
 *     284 m in 211 s (23 full stops, top 49 км/ч). It stopped ~81 m short of
 *     objective 1 of 2. This leg is TRACKED 100 %, so unlike the junctions it
 *     is not steering: it is the audit program's 12 км/ч cruise against a 210 s
 *     budget, the same wall `sc-ac-truck-spray` hits 480 m short.
 *     WORTH THE FOUNDER'S ATTENTION, and it is a design question rather than a
 *     defect: that drive books FOUR collisions, the sheet terminates on the
 *     first, and the lesson runs on for the remaining ~140 s. The crash pin
 *     does not fire and should not — the car left every impact pose under its
 *     own power — and the debrief says the choice out loud («В симулатора
 *     продължихме за упражнение, но оценката отразява прекратяване»). Whether
 *     a terminated sheet should also end the DRIVE is an ADR, not a bug.
 *
 * Pure and deterministic, like every other fold in this module: no clock, no
 * randomness, same state + same tick ⇒ same output.
 */

import type { SimTick } from "../rules";
import type {
  FinishGateState,
  ObjectiveParams,
  RouteFinishZone,
  YieldReason,
  YieldWaitState,
} from "./types";

/**
 * Arrival radius for a bay finish, meters — before the clamp below. A bay is a
 * point target: the painted L7/exam rect is 3.0 × 6.6 m, and a student who
 * rolls up beside it from the carriageway HAS reached the end of the route
 * even though his centre never entered the paint. 14 m is wider than any
 * carriageway on the shipped maps and far narrower than the gap to the
 * previous waypoint on a street route (the exam's last checkpoint sits 62 m
 * short of its bay).
 */
export const FINISH_BAY_RADIUS_M = 14;

/**
 * Radius floor, meters. Below this a "zone" is smaller than the car and the
 * gate would be unreachable noise — the route simply gets no automatic finish
 * and the sequential chain stays its only termination path.
 */
export const FINISH_MIN_RADIUS_M = 2.5;

/**
 * Continuous seconds inside a CROSSED finish (a waypoint) before it trips.
 * Not a dwell requirement — a glitch guard: one stray frame (a physics pop, a
 * respawn) must not end a session, while a car genuinely at the end of the
 * route is inside for far longer than this even at speed.
 */
export const FINISH_DWELL_S = 0.5;

/**
 * A bay finish is an ARRIVAL, not a crossing: it trips only after the car has
 * stood still (|v| ≤ FINISH_REST_KMH) inside the zone for FINISH_REST_S
 * continuous seconds.
 *
 * This is not caution for its own sake — the shipped parallel-park drill
 * proves it. Its route drives FORWARD PAST the bay at ~10 km/h to reach the
 * pull-up pose beside the lead car, and only then reverses in; the car is
 * within a few metres of the bay centre a full two seconds before it has even
 * reached the objective that precedes the park. Passing a bay is not arriving
 * at one. Standing still in it is. FINISH_REST_S is twice the authored park
 * hold (1.5 s), so a creep-and-shuffle inside the bay never reads as an end.
 */
export const FINISH_REST_KMH = 3;
export const FINISH_REST_S = 3;

/**
 * B3 — radius FLOOR of a rescue zone, meters. The lane pitch on every shipped
 * map is 8.125 m (LANE_WIDTH_M × the 2.5× perceptual exaggeration), so a
 * terminal objective authored at radius 4–6 is satisfiable only from ONE lane
 * — which is the point of the objective and the ruin of the rescue that
 * copied it. 9 m is the pitch plus 0.875 m of margin, deliberately not the
 * pitch itself: a car sitting in the adjacent lane is exactly 8.125 m away
 * and has to be strictly INSIDE the escape, not balanced on its edge.
 * (`sc-ln-decisive-change`'s final gate is radius 8 against that same pitch —
 * it missed by 0.13 m. `sc-ln-boulevard-discipline`'s taught left-lane hog
 * sits 8.13 m from a radius-4 gate.)
 *
 * The floor never loosens GRADING: the objective keeps its authored radius.
 * It only widens the door out of a lesson that is already unpassable.
 */
export const FINISH_LANE_FLOOR_M = 9;

/**
 * B2 — a TERMINAL objective is only proven stuck by a full standstill, held
 * this long. Anything shorter is a normal part of driving: a candidate lines
 * up for the exam bay, a beginner pauses mid-shuffle to work out the wheel, a
 * student stops to read the banner. Twelve seconds motionless at the end of
 * the route, with the task still not done, is not any of those.
 *
 * B15 CORRECTION (2026-08-04). The original of this comment ended „…and a
 * red-light wait ends by itself", and that sentence carried the whole weight
 * of the distinction. It is false at a GIVE-WAY line: nothing ends a wait for
 * a gap in circulating traffic except a gap, and the founder waited forty
 * seconds for one. A standstill is therefore no longer sufficient evidence of
 * being stuck by itself — see `stepYieldWait` below, which withholds the
 * evidence entirely while the standstill is the lawful thing to be doing.
 */
export const FINISH_STANDSTILL_KMH = 1;
export const FINISH_STUCK_S = 12;

/**
 * The same evidence, but for an anchor where MANEUVERING is the task — a
 * parking bay. Twelve seconds is unambiguous at a waypoint, where there is
 * nothing to do but arrive; it is not unambiguous beside a bay, where a
 * beginner works the wheel in stop-start shunts and an exam candidate stops
 * to plan the whole reverse before touching anything. Twenty-five seconds
 * completely motionless with the park still unfinished is not planning.
 *
 * The margin against a correct park is 16×: `parkInBay` completes after
 * `holdSec` (1.5 s default) at rest in the rect, so a student who is actually
 * parking always finishes first, by a wide margin, every time.
 */
export const FINISH_BAY_STUCK_S = 25;

/**
 * B1 — an "outside" (leave-the-work-site) finish trips after this many
 * continuous seconds away from the ring/corridor. It is long on purpose: an
 * unsignalled roundabout exit voids the traversal (objectives.ts), and the
 * student who realises it immediately must have room to swing back and redo
 * the ring rather than have the lesson closed under them. Twenty seconds is
 * ~150 m at drill speed — past that, the drive is over and the debrief is the
 * better use of the student's time.
 */
export const FINISH_LEAVE_S = 20;

/**
 * THE ANNULUS — the band between "you have been here" and "you have left", m.
 *
 * Every "outside" gate has two circles: `armWithinM`, which records that the
 * car reached the work site, and `radiusM`, past which it has left. The band
 * between them is NEITHER, and it is what makes the gate mean anything:
 * shuffling at the corner of a turn box, hovering at the mouth of a junction
 * or being nudged back a metre in a queue must never read as a departure.
 * Collapse the band to nothing and "left" degrades into "one frame further out
 * than the frame that armed it", which one pose sample can satisfy without the
 * car going anywhere.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18 — GENERALISED FROM THE TURN BOX, because a gate shipped without a
 * band. This constant used to be `FINISH_CORRIDOR_MARGIN_M`, added to a
 * `threePointTurn` corridor's circumradius and used nowhere else; the
 * roundabout got its band for free (`enterRadiusM` < `exitRadiusM`) and the
 * `passSignal` anchor got none at all — it published a single radius, so
 * `normalizeOutside` defaulted `armWithinM` to that same number and the two
 * circles coincided.
 *
 * MEASURED over the compiled catalogue (808 rungs, all 167 templates × their
 * authored levels): of the 108 "outside" zones `routeFinishZone` and
 * `terminalRescueZone` hand out, exactly FIVE had a zero-width band —
 * `sc-sig-green-wave` L1–L5, radius 40 m, arm 40 m, the only `passSignal`
 * TERMINAL in the catalogue.
 *
 * WHY THAT IS REACHABLE RATHER THAN THEORETICAL. A signalized approach's
 * graded line is derived at the JUNCTION MOUTH, and with the 2.5× road scale
 * those mouths land 17–43 m from the node (runtime/stoplines.ts; the shipped
 * micro-districts measure 27.7 m, JUNCTION_STOP_LINE_M). Every value in that
 * band is INSIDE a 40 m arming circle — so on this lesson a car stopped
 * legally AT THE PAINT is what arms the gate, and a car that then holds a few
 * metres further back — 41 m from the node, one metre into "left the
 * junction", still short of the line it has not crossed — spends
 * FINISH_LEAVE_S there and the drive is declared finished with the third lamp
 * never passed. The lesson is a GREEN wave, so the lamp the student is
 * hesitating at is green, B15's lawful-wait freeze withholds nothing, and the
 * gate spends every one of those twenty seconds. That is precisely the harm
 * the `passSignal` anchor's own comment calls „the worst failure this module
 * can produce".
 *
 * The floor is applied in `normalizeOutside`, so it is a property of the SHAPE
 * rather than of any one anchor — the next authored maneuver cannot reinvent
 * the defect. It widens the departure circle rather than narrowing the arming
 * one, which is the only safe direction: narrowing the arm would stop drives
 * ARMING and could withhold an ending, while widening the departure can only
 * ask a car that is genuinely leaving to travel eight more metres (~1 s at
 * drill speed).
 *
 * 2026-08-19 — THE CENSUS SENTENCE THAT CLOSED THAT PARAGRAPH WAS WRONG, and
 * doc 88 R2 has carried it open across two waves („nobody corrected the
 * census"). It read „the roundabout (26 → 45 m, band 19 m) and the turn box
 * (band ≥ this margin by construction) are unchanged, bit for bit". The turn
 * box is indeed unchanged by construction. The roundabout is NOT — a ring
 * whose AUTHORED band is narrower than one margin is widened like anything
 * else, and one is. Re-measured over the compiled catalogue: TEN zones move
 * under this floor, not five.
 *      sc-sig-green-wave  L1–L5  passSignal  arm 40 · radius 40 → 48 (band 0 → 8)
 *      sc-rb-ped-exit     L1–L5  roundabout  arm 29 · radius 34 → 37 (band 5 → 8)
 * The FIVE above is still right about what IT claims — five zones shipped with
 * a ZERO-width band and all five are `sc-sig-green-wave`. What was wrong is
 * the claim that nothing else moved, and `sc-rb-ped-exit` is a lesson where
 * the student stops for a pedestrian ON THE EXIT, i.e. inside the three metres
 * this floor added.
 *
 * WHY EIGHT. It is the number the turn box already carried for exactly this
 * job, and it is one lane pitch — 8.125 m, LANE_WIDTH_M × the 2.5×
 * perceptual exaggeration, the same pitch FINISH_LANE_FLOOR_M is derived from
 * — rounded down: a car that has genuinely left a work site is at least a lane
 * clear of it, and a car being shuffled about at its edge is not.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18, LATER THE SAME DAY — „~1 s AT DRILL SPEED" ASSUMED A DRILL SPEED.
 * The paragraph above costs a car that is genuinely leaving eight metres, and
 * that is true of every car that is still moving. A car that has STOPPED in
 * the band travels them never, and the band is then not a delay but a wall.
 *
 * MEASURED by driving the compiled `sc-sig-green-wave` L1 (the same five rungs
 * this constant was written for) through `applyTick`, stopping the car a swept
 * distance past its terminal node and holding it there 200 s. Stops at 0, 10,
 * 20, 30, 36, 39, 41, 42, 44 and 46 m past tl3 all ran the full 200 s of
 * standstill ticks with the phase still "driving" and 0 of 3 objectives
 * ticked; the stop at 48 m ended at 95.3 s. With the band at zero the
 * departure circle is the arming circle, so every one of those rests from
 * 41 m out is in the region and trips on FINISH_LEAVE_S instead — this
 * constant turned a working ending into a trap for a car resting in 40–48 m.
 *
 * FINISH_OUTSIDE_STUCK_S below closes that band. It does NOT close the 0–40 m
 * disc inside the arming circle, which never had an ending either and is B1's
 * deliberate ruling rather than this constant's doing; see that constant for
 * what remains open there and why widening into it is a different decision.
 */
export const FINISH_OUTSIDE_ANNULUS_M = 8;

/**
 * THE STRANDED FACE of an "outside" gate — seconds at a FULL STANDSTILL in the
 * ANNULUS before the drive is closed where it stands.
 *
 * WHY IT HAS TO EXIST AT ALL. The band above is a margin, not a place: it is
 * neither the work site (which B1 protects, and still does — the arming
 * circle's interior is untouched by this) nor the far side. A car MOVING
 * through it is doing exactly what the band was drawn for and is left alone.
 * A car that STOPS in it has no exit at all: it is not in the region, so the
 * departure dwell never runs, and it is not moving, so the region never
 * arrives. Every other anchor in the file has a standstill face —
 * FINISH_STUCK_S at a waypoint, FINISH_BAY_STUCK_S beside a bay — because
 * every other anchor can be stood in. This is that face for the one shape that
 * shipped without one, and the bar is what separates „paused" from „not going
 * anywhere".
 *
 * MEASURED AGAINST REAL DRIVES, not against the shadow tapes — the tapes are
 * ideal and would only prove that an ideal driver never pauses. Every run.log
 * of the sweep161 audit (332 lanes, 174 scenarios, 7,398 speed samples at a
 * 5.2 s cadence) was walked for maximal runs of |v| ≤ FINISH_STANDSTILL_KMH
 * that the drive RESUMED from — i.e. pauses a real student took and then drove
 * on out of, which is exactly the thing this bar may not cut short. Of 1,569
 * such pauses:
 *      longest   69 s  sc-ed-d2-priority-run · mobile · right (t 65 → 134)
 *      next four 45 / 43 / 43 / 43 s — sc-ed-d2-priority-run,
 *                sc-merge-from-property and two roundabout give-way waits
 *                (sc-rb-circulate-priority, sc-rb-ped-exit)
 *      p99 21 s · p95 6 s · median 0 s
 * 69 s is a SAMPLED length, so the true pause is at most one cadence longer:
 * 69 + 5.2 = 74.2 ⇒ 75. Above the longest standstill any of the 332 audited
 * drives ever resumed from, and 1.7× the worst roundabout give-way wait in the
 * set — which is the case this bar is most likely to meet, because B15's
 * lawful-wait window opens at `enterRadiusM` and a car nosed INSIDE it gets no
 * hold (`yieldReasonAt` case 5, `d > p.enterRadiusM`).
 *
 * Deliberately NOT applied to "inside" zones: they already have their own
 * standstill faces and their own measured bars, and every one of them stays
 * bit-identical. B15's freeze applies here exactly as it does to the rest of
 * the module — a lawful wait is evidence of nothing, and the engine drops the
 * partial dwell on every frame of one, so a wait cannot be banked toward this.
 *
 * 2026-08-19 — WHERE THE BAND STARTS WAS WRONG FOR ONE OF THE THREE SHAPES.
 * „past `armWithinM`" was read as „past the work site", which is true of a
 * `passSignal` and a `roundabout` and false of a turn box, whose arm is the
 * INSCRIBED circle of its corridor. This bar was therefore spent on students
 * paused INSIDE an authored manoeuvre box. The inner edge now has its own
 * derivation — see `strandedBeyondM` for the two refuting poses, the census of
 * what moved, and why C7's own 41–47 m closure is bit-identical under it.
 *
 * WHAT IS STILL OPEN, AND IS NOT THIS BAND'S TO CLOSE. The work site's
 * INTERIOR has no automatic ending either, and never had one — that is B1's
 * ruling and its own test. It costs nothing on a roundabout (a 24 m ring the
 * student is working) or a turn box (the corridor he is turning in), but
 * `passSignal` arms on the objective's GRADING radius rather than on a work
 * site, so on
 * `sc-sig-green-wave` the ending-free disc is 40 m in every direction from the
 * node — measured above: a car resting 0–40 m past tl3 still runs out the
 * capture with the drive live. Closing that means giving the `passSignal`
 * anchor an arm that describes the junction instead of the acceptance ring,
 * which changes when drives ARM and is a founder-visible call, not a widening.
 */
export const FINISH_OUTSIDE_STUCK_S = 75;

// ---------------------------------------------------------------------------
// FR-B5-JAM (doc 87, 2026-08-05) — THE CRASH PIN
// ---------------------------------------------------------------------------
//
// Both gates above are ANCHORED AT THE END OF THE ROUTE, because that is where
// the three stranded-student reports of July came from. A fourth way to be
// stranded was found by driving on 2026-08-05 and it is nowhere near the end:
// `sc-jx-giveway-b1@L1`, driven correctly — stop at the Б1 line, wait, then
// „щом пътят е чист, потегляш" — ended in a 10-point COLLISION with a car
// standing in the second junction's mouth at y = 146.00, and after it the car
// was **held at full throttle for 40 s** with the third objective 32 m ahead
// and unreachable. The obstacle itself is fixed elsewhere (templates-junctions
// + the traffic clamps). This is the other half, and it is the more dangerous
// one, because it does not need THAT obstacle: pin a car against ANY solid
// thing anywhere on a route and the same nothing happens forever.
//
// The evidence has to separate „pinned" from every legitimate standstill, and
// a standstill alone cannot do it — B15 taught that lesson at a give-way line.
// So the pin needs all three of:
//
//   1. a graded COLLISION has happened (the catalog's `terminateSession` flag —
//      the only code that carries it). Nothing else arms this;
//   2. the car has not left the place it hit (within CRASH_PIN_RADIUS_M of the
//      collision pose). Drive away and the arm is dropped — a student who
//      reverses out and carries on is not stuck, and must never be closed down;
//   3. it has then stood completely still for CRASH_PIN_STUCK_S, with the
//      lawful-wait freeze applying exactly as it does to the other two gates.
//
// Nothing here grades. Like every other finish gate it decides WHEN the drive
// stops, never WHAT counts as a fault: the collision keeps its 10 points, the
// unreached objectives stay honestly unreached, and `buildLessonResult` reports
// finished-and-not-passed. The alternative — teleporting the car free — was
// rejected: it would invent a driving outcome the student did not drive, and
// the debrief is the thing he actually needs after a crash he cannot undo.

/** How far from the impact pose still counts as „pinned against it", m. A car
 *  length and a half: enough that a shunt or a shuffle does not disarm the
 *  rescue, small enough that anyone who has genuinely driven away has. */
export const CRASH_PIN_RADIUS_M = 6;

/**
 * Seconds motionless against what you hit before the drive is closed for you.
 *
 * Shorter than FINISH_STUCK_S (12) on purpose: at the end of a route a
 * standstill is ambiguous (lining up, thinking, reading the banner), and after
 * an impact it is not — the student has already been given the fault card and
 * has either reversed out or cannot. Ten seconds is longer than any recovery
 * shunt and a quarter of the forty the founder's drive spent going nowhere.
 * NOTE the pause aid: at L1/L2 a graded fault freezes physics behind a teach
 * card and sim time does not advance, so the card can never spend this clock.
 *
 * OPEN, AND NOT THIS LANE'S TO CLOSE (recorded 2026-08-16 while widening
 * YIELD_STOP_LINE_REACH_M below). `engine.ts` drops this pin's partial dwell on
 * every frame `yieldWait.holding` is true, on the argument that „B15's freeze
 * applies here for the same reason it applies to the other two gates". That
 * reason does not transfer. The other two gates read only position and speed,
 * which is why a lawful standstill is invisible to them; THIS one has already
 * been handed independent evidence that the standstill is involuntary — a
 * graded collision, and a car that has not left the pose it hit in. A pinned
 * car is not waiting for the light, it is unable to move, and freezing its
 * rescue postpones the drive's end to YIELD_WAIT_MAX_S + CRASH_PIN_STUCK_S ≈
 * 190 s instead of 10. The interaction predates this file's widening — it is
 * already live for a rear-ender into the back of a queue at the line, which is
 * the likeliest place to have one — and 12 → 26 m widens the band it can
 * happen in. The fix is one condition in `engine.ts` (exempt the crash pin from
 * the freeze), which is another lane's file.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-17 — TWO MORE, MEASURED, AND THE FIRST ONE VOIDS THE PIN OUTRIGHT.
 * Driven on staging with the shipped harness (`tools/mobile/lesson-audit.mjs`,
 * sc-follow-distance · mobile · wrong). Recorded here because the pin's
 * EVIDENCE MODEL is specified in this file; both defects are in `engine.ts`'s
 * fold of it, so neither is this lane's to close either.
 *
 *  P1 — THE RE-ARM WIPES THE CLOCK, so the pin cannot fire in the one case it
 *  was written for. `engine.ts` re-arms on every graded collision
 *  („the pose that matters is the LAST one") and that re-arm sets
 *  `stillSinceSec: null`. But a collision is NOT a one-shot event against a
 *  thing you stay in contact with: `rules/engine.ts` reopens one every
 *  COLLISION_REOPEN_TRAVEL_M = 2 m of travel since the last report. So a car in
 *  sustained contact emits a fresh COLLISION every 2 m — MEASURED at 65 of them
 *  in a single 177 s drive, i.e. ~130 m spent pushing the thing it hit — and
 *  each one resets the ten-second clock that was supposed to end the drive.
 *  The dwell can only ever accumulate for a car that travels LESS than 2 m in
 *  CRASH_PIN_STUCK_S, which is the one pin that would also have satisfied the
 *  speed test anyway. Grinding forward against an obstacle — the founder's
 *  „held at full throttle" — defeats the pin twice over and always has.
 *  The fix is to re-arm the POSE without clearing `stillSinceSec` (the pose is
 *  what „did not leave the spot" is measured from; the clock is what „has not
 *  moved" is measured with, and a re-report is not evidence of movement — the
 *  `awayM > CRASH_PIN_RADIUS_M` test already carries that).
 *
 *  P2 — THE STANDSTILL TEST IS UNSIGNED, alone in this module. `engine.ts`
 *  reads `tick.speedKmh > FINISH_STANDSTILL_KMH`; every other speed test on
 *  this side of the wall compares the MAGNITUDE — `stepYieldWait` and
 *  `stepFinishGate`, the latter carrying the reason in as many words
 *  („Reverse reads negative — compare the magnitude"). Reverse reads negative,
 *  so a student backing out of what he hit at −20 km/h scores −20 > 1 = false
 *  and is counted as STANDING STILL, banking dwell toward having his lesson
 *  closed for him. He is saved only once he clears CRASH_PIN_RADIUS_M, so the
 *  exposure is the first 6 m of the one manoeuvre this gate's own comment
 *  promises never to punish („drove away — not stuck, and never closed down").
 */
export const CRASH_PIN_STUCK_S = 10;

// ---------------------------------------------------------------------------
// O22 (2026-08-19) — THE CAR THAT IS NO LONGER IN THE AUTHORED WORLD
// ---------------------------------------------------------------------------
//
// THE ONE CLASS THAT SURVIVED THE RE-MEASUREMENT. The header block above
// („WHAT THIS MODULE CANNOT END") refused a duration cap and was right to. It
// also named the survivor and left it open: a car off the road network has NO
// gate in this file that can see it, because every gate here is anchored on
// route geometry the car is no longer near, and the crash pin is DISARMED by
// travelling away from the impact — which is exactly what being launched off
// the map does.
//
// THE CENSUS, RE-RUN over EVERY log convention in the sweep rather than the two
// the row was filed against (`run.log`, `log.txt`, `RUN.log`, `audit.log`,
// `harness.log`, `drive.log`, `_run.log`): 166 scenario directories, 653 lane
// directories, 544 lanes carrying a machine summary, 145 scenarios with at
// least one. FOURTEEN scenarios had no lane end at all; 68 more ended on some
// lanes and not others. The fourteen: sc-ed-reverse-line,
// sc-hz-breakdown-pulloff, sc-junction-blind, sc-junction-gap, sc-junction-left,
// sc-merge-accel-lane, sc-merge-bus-pullout, sc-merge-motorway-exit,
// sc-ov-crest-curve, sc-ov-lane-keeping, sc-park-gap-long, sc-park-parallel,
// sc-park-zebra, sc-vu-emergency-junction. (The earlier count of EIGHT read the
// directory count as the summary count and dropped six, the junction family and
// the row's own exhibit among them. It is fourteen, and that is MORE than the
// figure the audit was quoting, not fewer.)
//
// ALL FOURTEEN CARRY `inside` ZONES — eleven terminal `reachZone`, three
// terminal `parkInBay`, measured by compiling every rung of all fourteen. So
// `workSiteRadiusM` and `strandedBeyondM`, which are consulted only for
// `mode: "outside"`, cannot help ANY of them, and O23's ring work (48 of 58
// ring zones moved) touched none of them by construction.
//
// AND „FOURTEEN DRIVES THAT CANNOT BE ENDED" IS STILL TOO STRONG — the last
// frame of each was read BY EYE rather than derived, and they are at least four
// different things:
//   · OFF THE AUTHORED WORLD — `sc-junction-blind` pc/right t090s+t208s,
//     `sc-junction-left` pc/right t208s, `sc-vu-emergency-junction` pc/right
//     t205s: a featureless green plane, no road, no kerb, no buildings, with the
//     task chip still asking for a turn out of a junction that is nowhere on
//     screen. THIS class, and only this one, is what has no ending.
//   · LAWFULLY WAITING — `sc-junction-gap` pc/right t206s is stopped at its own
//     Б2 line at 0 км/ч with «Чакането Е маневрата» on screen. B15's freeze is
//     holding that drive open ON PURPOSE. Ending it would be the founder's own
//     complaint.
//   · THE HARNESS BUDGET, not the gate — `sc-merge-accel-lane` pc/right t210s is
//     on the motorway ramp at 6 км/ч, `sc-ov-lane-keeping` pc/right t210s is on
//     its street at 1 км/ч. 930 m of route against a 210 s budget at CRUISE_KMH
//     12; the lesson was never driven to its end.
//   · THE PAGE ITSELF FELL OVER — `sc-park-parallel` pc/right t207s is the
//     «Нещо се обърка» error card, and it is the one lane in the whole sweep
//     whose summary records no `forcedBy` at all. Nothing about endings.
//
// SO THIS FOLD ANSWERS THE FIRST BULLET AND NOTHING ELSE. It is deliberately
// not a duration cap, not a speed test and not a standstill test:
// `sc-vu-emergency-junction` is off the world at 11 км/ч in gear D, so any bar
// that required the car to be stopped would miss the very frame it was written
// for.
//
// THE EVIDENCE is `SimTick.edgeId === null` held continuously — the runtime's
// own statement that the locator found no centreline within
// OFF_ROAD_DISTANCE_M = 30 m (runtime/locator.ts). `undefined` must stay
// innocent: a hand-built tick and a recorded trace do not report the channel at
// all, and reading „absent" as „nowhere" would end every replay.
//
// AND THE CHANNEL IS TIGHTER THAN THE ROW ASSUMED — MEASURED, because arming an
// ending on a signal nobody had measured is how this programme has shipped four
// instrument bugs. Swept the FULL drivable half-width (travel lanes AND the
// kerbside parking band) of every drawn ribbon on all 105 shipped districts,
// 96,908 poses: ZERO read off-network, and the worst is 29.355 m — the centre of
// the kerbside parking band of `district-v1`'s five-lane бул. Свети Климент
// Охридски at (467.8, −169.8). That leaves **0.645 m** between a car parked
// legally at that kerb and the runtime declaring it no longer in the world.
// (`ln-arrows-v1` is second at 28.375 m; all 248 authored spawn points are
// inside 20.310 m.) The measurement is pinned by
// `runtime/__tests__/off-network-headroom.test.ts` so the next authored arterial
// cannot widen past it in silence — see that file for what else goes quiet when
// a fix goes null.
// ---------------------------------------------------------------------------

/**
 * Continuous seconds off the road network before the drive is closed, s.
 *
 * FORCED FROM BOTH SIDES, which is the only thing that makes it a derivation
 * rather than a round number wearing one.
 *
 * FROM BELOW — the false refusal, and it is the whole reason this is not five
 * seconds. The measurement above says the exposure is a 0.645 m band past the
 * outermost LEGAL pose on one district: to spend this bar a car has to stay
 * within two thirds of a metre of a boulevard's outer kerb line, without once
 * coming back inside 29.355 m of any centreline, for the whole duration. The
 * bar therefore has to exceed the longest state a real audited drive is known
 * to have come back from, and this module has already measured that number for
 * FINISH_OUTSIDE_STUCK_S: over the sweep161 corpus (332 lanes, 7,398 speed
 * samples at a 5.2 s cadence) the longest pause a drive RESUMED from was 69 s
 * sampled, 74.2 s true, ⇒ 75. Reusing it rather than inventing a second number
 * is deliberate: it is the same claim („past this, the car is not coming back")
 * measured on the same corpus, and two different numbers for one claim rot
 * apart.
 *
 * FROM ABOVE — it has to actually CLOSE the exhibit, or it is a constant that
 * only looks safe. `sc-junction-blind` pc/right leaves the authored world
 * between t = 63 s (04-t063s.png: still on its street) and t = 74 s
 * (04-t074s.png: the plane, 10 км/ч, the −10 card up) and the session then runs
 * to t = 209 s — at least 135 s off the world, and at most 146 s at the frame
 * cadence. Seventy-five seconds fires at t ≈ 139–149 s, sixty to seventy
 * seconds before the harness gave up and pressed «Прекрати урока». A bar of 150
 * would not have fired inside that drive at all.
 *
 * NO SPEED TEST AND NO LAWFUL-WAIT FREEZE, and both omissions are load-bearing.
 * The speed test is out because the third confirmed frame is off the world at
 * 11 км/ч. The freeze (B15) is out because it exists to stop a STANDSTILL being
 * read as evidence, and there is no standstill in this evidence — and because
 * every clause of `yieldReasonAt` is unreachable here anyway: cases 1–3 need
 * `nextStopLineM`, which the runtime publishes only from a resolved edge; case 5
 * needs the car within one approach of a ring the route has not finished, which
 * a car 30 m from every centreline is not. Adding the freeze „for symmetry"
 * would hand an off-map drive a 180 s reprieve for a wait it is not having.
 */
export const OFF_NETWORK_STUCK_S = 75;

/** One frame of the off-network fold. */
export interface OffNetworkFold {
  /**
   * Session time the CURRENT continuous off-network run began, or null when the
   * car is on the network / the tick does not report the channel. Carry this
   * one number in session state and hand it back next frame.
   */
  sinceSec: number | null;
  /** The bar was met ON THIS FRAME — end the drive, with `offNetworkEndingCopy`. */
  ended: boolean;
}

/**
 * Advance the off-network fold by one frame. Pure and deterministic like every
 * other fold here: no clock, no randomness, same input ⇒ same output.
 *
 * `posed` is the caller's frame-zero pose guard (engine.ts `posedAtSec !==
 * undefined`) and it is a PARAMETER rather than the caller's business on
 * purpose: the scene ticks the session with a placeholder pose at the district
 * ORIGIN before the chassis publishes (scene/vehicleSample.ts), and a drive that
 * has not begun cannot have left anywhere. B-NEW-1 is the standing proof of what
 * happens when a gate reads that pose — one placeholder frame armed the
 * roundabout finish and ended untouched sessions at ~40 s. Requiring it here
 * means the arm cannot forget it.
 *
 * THE CLOCK RESETS on every frame the car is back on the network, and it never
 * banks in instalments — deliberately the opposite of `stepFinishGate`'s two
 * accumulators. There, two visits to the same face are one car sitting in one
 * place; here, two separate excursions are two recoveries the student DROVE
 * back from, and adding them together would close a lesson on a driver who
 * returned to the road twice.
 */
export function stepOffNetwork(
  prevSinceSec: number | null | undefined,
  tick: SimTick,
  posed: boolean,
): OffNetworkFold {
  // Absent channel = innocent. A hand-built tick, a recorded trace and every
  // legacy engine omit `edgeId`; only an explicit null is the runtime SAYING
  // there is no road here.
  if (!posed || tick.edgeId !== null) return { sinceSec: null, ended: false };

  const prev = prevSinceSec ?? null;
  // A non-monotonic frame (a seek, a resumed tab handing back an older stamp)
  // restarts the run rather than producing a negative elapsed.
  const sinceSec = prev !== null && tick.t >= prev ? prev : tick.t;
  return { sinceSec, ended: tick.t - sinceSec >= OFF_NETWORK_STUCK_S };
}

/**
 * WHAT THE STUDENT IS TOLD — and this half is not decoration, it is the reason
 * the previous lane routed the ending instead of shipping it.
 *
 * Both endings `engine.ts` can currently speak say «край на маршрута», which is
 * true of every gate in this file and FALSE of a car that drove off the map
 * halfway through one. THEO-4 (doc 64, founder-ratified) forbids a bare verdict,
 * and «Урокът беше прекъснат преди края» with no reason IS a bare verdict —
 * but so is a sentence that gives the WRONG reason, which is a bare verdict
 * wearing a costume. So the fold that ends the drive owns the words that
 * explain it.
 *
 * Kept inside the violation catalogue's own length band (median 186 chars, max
 * 319) like the other two endings: this is a HUD toast on a 390 px phone, and
 * the detail belongs in the debrief that opens a second later. It claims
 * nothing the debrief does not deliver — the unfinished tasks and the mistakes,
 * both of which `buildLessonResult` already prints.
 */
export function offNetworkEndingCopy(examMode: boolean): {
  kind: "lesson";
  titleBg: string;
  explanationBg: string;
} {
  return {
    kind: "lesson",
    titleBg: examMode ? "Край на изпита — колата е извън пътя" : "Край на урока — колата е извън пътя",
    explanationBg: examMode
      ? "Колата вече не е на нито една улица от маршрута и остава извън пътната мрежа повече от минута, затова изпитът приключва тук. Част от задачите останаха неизпълнени и изпитът не е издържан — разборът показва всяка от тях и всяка допусната грешка."
      : "Колата вече не е на нито една улица от урока и остава извън пътната мрежа повече от минута — няма маршрут, по който да продължи. Затова урокът приключва тук, вместо да те държи блокиран. Разборът показва всяка неизпълнена задача и всяка допусната грешка.",
  };
}

// ---------------------------------------------------------------------------
// THE ARM IS NOT IN THIS FILE — AND IT LANDED ON 2026-08-19 (7404468), EXACTLY
// AS THE WORK ORDER BELOW SPECIFIES IT. `engine.ts:1302` folds this fold before
// the finish gates and pushes `offNetworkEndingCopy` at the bar;
// `types.ts` carries `offNetworkSinceSec`. The order is kept below because it
// is the audit trail of what was asked for and what shipped, not because
// anything is owed.
//
// WHAT THE ARM DOES **NOT** COVER, MEASURED 2026-08-25 ON THE ROW THAT LOOKS
// LIKE ITS EXHIBIT. sc-ov-oncoming-gap:83420a40 photographs
// `.audit-frames/w10-1/frames/sc-ov-oncoming-gap__mobile-wrong/04-t060s.png`:
// 104 км/ч, the whole windscreen one featureless grey plane, «Следвай синята
// линия» over no blue line and no road — and files it as „the car can leave the
// road network entirely and keep driving … no off-route stop, no boundary".
// The arm was armed on that drive and was RIGHT to stay silent. Its own
// run.log: «ended: true · endedNaturally: true · forcedBy: -», «Задачите от
// маршрута са изпълнени», НЕИЗДЪРЖАН on the exam sheet and not on the route.
// The car completed every objective, so it was never off the network at all —
// `tick.edgeId` was non-null throughout and this fold correctly never armed.
// What the frame shows is a car ON a centreline the world DREW NOTHING AROUND.
// That is a render-extent row and it belongs to the world/scene layer, not to
// any gate in this file: no ending, however sensitive, may fire on a drive that
// is completing its route, and one that did would be the false refusal this
// module's every constant is sized to avoid.
//
// `lessons/engine.ts` is where every gate in this module is folded and where
// the session's `phase` is set; it is owned by another lane, so this was routed
// rather than edited — the same call the previous pass made, for the same
// reason, and now with the fold and the copy already written so the routed
// change is small enough to audit at a glance:
//
//   1. `lessons/types.ts` — one primitive field on LessonSessionState:
//          /** O22: session time the current off-network run began (finish.ts). */
//          offNetworkSinceSec?: number | null;
//      A number rather than an object, so nothing here has to be imported there.
//
//   2. `lessons/engine.ts` — folded on every driving frame, BEFORE the finish
//      gates (it is not anchored on route geometry, so no gate's arming state is
//      involved), and written back unconditionally like `crashPin` because it
//      must be able to go back to absent:
//          const offNet = stepOffNetwork(prev.offNetworkSinceSec, tick, posedAtSec !== undefined);
//          if (phase === "driving" && prev.phase === "driving" && offNet.ended) {
//            phase = "completed";
//            endedAtSec = tick.t;
//            hudEvents.push(offNetworkEndingCopy(examMode));
//          }
//      …and `offNetworkSinceSec: offNet.sinceSec` in the returned state.
//
// It grades nothing, exactly like the rest of this file: no ScorableEvent is
// emitted, suppressed or reweighted, the unreached objectives stay honestly
// unreached, and `buildLessonResult` reports finished-and-not-passed. What it
// must NOT do is borrow either existing ending's copy — that is the whole point
// of `offNetworkEndingCopy`.
// ---------------------------------------------------------------------------

/**
 * WHAT THE STUDENT IS TOLD WHEN HE HAS DRIVEN PAST THE END OF THE ROUTE (O30).
 *
 * IT MAY NOT BORROW EITHER SENTENCE THE ENGINE CAN ALREADY SPEAK, and that is
 * not tidiness. `engine.ts` picks between them on `stoppedStuck`, and both are
 * false here: «Спря в края на маршрута» is false of a car that did not stop,
 * and «Стигна края на маршрута, затова урокът приключва тук» reads as an
 * arrival on a drive whose whole defect is that the arrival never happened.
 * THEO-4 (doc 64, founder-ratified) counts a sentence that gives the WRONG
 * reason as a bare verdict wearing a costume — the same argument
 * `offNetworkEndingCopy` was written under, and the reason the fold that ends a
 * drive owns the words that explain it.
 *
 * Kept inside the violation catalogue's own length band (median 186 chars, max
 * 319) like the other endings: this is a HUD toast on a 390 px phone, and the
 * detail belongs in the debrief a second later. It claims nothing the debrief
 * does not deliver — the unfinished tasks and the mistakes, both of which
 * `buildLessonResult` already prints.
 */
export function routeDepartedEndingCopy(examMode: boolean): {
  kind: "lesson";
  titleBg: string;
  explanationBg: string;
} {
  return {
    kind: "lesson",
    titleBg: examMode ? "Край на изпита — мина покрай края" : "Край на урока — мина покрай края",
    explanationBg: examMode
      ? "Стигна мястото, където свършва изпитният маршрут, но задачата там не се отчете и колата продължи покрай него. Оттук нататък няма маршрут за каране, затова изпитът приключва — разборът показва какво остана неизпълнено и всяка допусната грешка."
      : "Стигна мястото, където свършва маршрутът, но задачата там не се отчете и колата продължи покрай него. По-нататък няма какво да се кара, а задачата не се наваксва с продължаване — затова урокът приключва тук. Разборът показва какво точно остана неизпълнено и как се прави следващия път.",
  };
}

// ---------------------------------------------------------------------------
// THE ARM LANDED AND WAS DISARMED THE SAME DAY — 2026-08-24, the round the
// sweep161 findings on this file were routed back to it. READ THE LAST
// PARAGRAPH OF THIS BLOCK BEFORE THE REST OF IT: everything between here and
// there is written in the past tense of a thing that ran for one commit and
// does not run now. The block below used to hold the arm verbatim as a
// routed work order plus one warning, and the warning was the whole reason it
// had not landed: at FINISH_LEAVE_S the gate refused the recorded
// overshoot-and-return drive 41.3 s before the student finished it. That
// warning named three ways out and said none was decided. ONE NOW IS — the
// first: the dwell is sized against the recorded return manoeuvre, and the
// derivation is FINISH_DEPARTED_S above (75 s clears the 94.5 s completion by
// 13.7 s and still closes the straight-on exhibit at ≈ entry + 75 s). The
// other two options are recorded as rejected here so the next lane does not
// re-litigate them: withholding while the terminal is re-earnable withholds
// forever (`contractEarned` re-earns on ANY later compliant frame, so every
// reachZone terminal is always re-earnable), and softening the copy would fix
// the sentence while leaving the refusal.
//
// WHAT LANDED, exactly as the work order specified (engine.ts, beside the
// other two gates; types.ts, one field):
//   · `finishDepartureGate?: FinishGateState` on LessonSessionState;
//   · stepped in the SAME `else` branch as the other two gates, so B15's
//     freeze — which clears the partial dwell of every gate in the branch
//     above it — covers this one too: a student stopped at a red just past the
//     end of the route spends nothing;
//   · the termination test guarded by `phase !== "completed"`, because the
//     block above it already sets `phase` from `finishGate`/`stoppedStuck` and
//     a frame on which both latch must not push two contradicting toasts;
//   · `routeDepartedEndingCopy` as the sentence, never either existing one.
//
// The ledger test that was written to convict the arm's absence
// (`__tests__/terminal-departure.test.ts`, „STILL OWED") flipped the day this
// landed, exactly as its comment said it would; the drive it steps now ends
// with the departure copy, and a second end-to-end test pins the return drive
// the old dwell refused.
//
// It grades nothing, exactly like the rest of this file: no ScorableEvent is
// emitted, suppressed or reweighted, the unreached objectives stay honestly
// unreached, and `buildLessonResult` reports finished-and-not-passed. What it
// must NOT do is fold this zone into `finishRescueGate` — the two zones are
// different shapes on the same mark and one gate state cannot hold both, which
// is the whole reason this is a third zone.
//
// ── AND NONE OF THE ABOVE IS RUNNING — verified at HEAD, 2026-08-28 ──────────
//
// `lessons/engine.ts:1665` pins `const departure: ReturnType<typeof
// terminalDepartureZone> = null;`, so the `if (departure !== null)` step below
// it never executes, `finishDepartureGate` is never written, and the
// `phase !== "completed" && finishDepartureGate?.reachedAtSec != null` branch is
// unreachable on every frame of every drive. `terminalDepartureZone`,
// FINISH_DEPARTED_S and `routeDepartedEndingCopy` are therefore computed by
// tests and read by no student. The end-to-end test this block credits above is
// `__tests__/terminal-departure.test.ts` line 539, and its own first line is
// „SKIPPED 2026-08-24 — THE ARM IS DISARMED, AND THIS TEST IS ITS SPEC."
//
// The disarm was correct and is not being revisited here: the region dwell
// accrues WHILE THE CAR IS DRIVING BACK, so a student who pauses and then takes
// a long return is refused after the arm and completed before it, which is the
// false refusal this module exists to avoid. What was wrong is that three
// paragraphs of this file described the armed build as the shipped one. The
// re-enable condition, unchanged and stated at the pin: accrue only while the
// car is NOT CLOSING ON THE MARK. That needs one range field on
// `FinishGateState` (types.ts) and the two-line unpin in `engine.ts`; neither
// file is this lane's, and this comment is not a licence to write the predicate
// here and leave it dead — the zone already is one.
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

/** Where an objective happens, for any objective that happens SOMEWHERE. */
function targetPoint(params: ObjectiveParams): Point | null {
  switch (params.kind) {
    case "reachZone":
    case "passSignal":
      return { x: params.x, y: params.y };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (params.maneuver) {
        case "parkInBay":
          return { x: params.bay.x, y: params.bay.y };
        case "roundabout":
          return { x: params.x, y: params.y };
        case "threePointTurn":
          return { x: params.corridor.x, y: params.corridor.y };
        case "smoothStop":
        case "emergencyStop":
          return null;
      }
  }
}

/**
 * The terminal objective's zone BEFORE clamping — null only when the route
 * genuinely ends nowhere (a distance to cover, a stop to perform anywhere).
 *
 * `forRescue` asks for the anchor's OTHER face: the same place, but with the
 * evidence a stuck TERMINAL objective needs instead of the evidence a stalled
 * chain needs (see `terminalRescueZone`). The flag does nothing for an
 * "outside" anchor, and that is a fact about WHERE the second face lives
 * rather than about it having none: an outside zone carries both faces at once
 * (departure, and the FINISH_OUTSIDE_STUCK_S standstill), and `stepFinishGate`
 * picks between them from the pose. It cannot be split into two zones here —
 * the engine consults the stalled-chain zone only while the chain is NOT on
 * its terminal objective, so a rescue zone that dropped the departure face
 * would silently delete the ending of every drive that reaches the last gate.
 */
function finishAnchor(params: ObjectiveParams, forRescue = false): RouteFinishZone | null {
  switch (params.kind) {
    case "reachZone":
      // A waypoint is CROSSED, on exactly the terms it was authored with: the
      // gate mirrors the objective's own ARRIVAL criteria (its radius and, when
      // the author demanded one, its arrival speed cap) and drops only the work
      // that would have to happen afterwards. sc-fo-motorway-gap is why the cap
      // matters — its terminal waypoint says „спри зад спирачещия" at ≤ 8 km/h,
      // and a car still doing 130 through it has not arrived, it is about to
      // crash into the lead car. Ending there would have erased the ПТП.
      return {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        dwellSec: forRescue ? FINISH_STUCK_S : FINISH_DWELL_S,
        terminalRescue: true,
        ...(forRescue
          ? { maxSpeedKmh: FINISH_STANDSTILL_KMH }
          : params.maxSpeedKmh !== undefined
            ? { maxSpeedKmh: params.maxSpeedKmh }
            : {}),
      };
    case "passSignal":
      // A junction is passed THROUGH, not stopped at — so the end of a route
      // that finishes on one is the far side of it, not the box. The shape
      // matters for more than tidiness: an inside-zone here would trip while a
      // student sits at a red he is legally required to wait out, and closing
      // a lesson on a driver doing exactly the right thing is the worst
      // failure this module can produce.
      //
      // `requireRedMet` junctions (l2-intersections) opt OUT of the terminal
      // rescue entirely: that gate is designed to be retried on the spot —
      // every light shows red 26 s of every 50 s, so re-approaching and
      // waiting one out always works (objectives.ts stepPassSignal), and a
      // rescue would close the lesson during the retry it prescribes.
      //
      // ARMED BY THE OBJECTIVE'S OWN ACCEPTANCE RING, and left one annulus
      // beyond it. Naming `armWithinM` here is not decoration: this anchor
      // published one radius and let `normalizeOutside` default the arm to it,
      // which collapsed the band (see FINISH_OUTSIDE_ANNULUS_M for the five
      // rungs that measured). The arm is the objective's own statement of
      // „the car was at this junction"; the departure circle is that plus the
      // band, and `normalizeOutside` is what guarantees the second one.
      //
      // O23 — and the WORK SITE is that same ring. A junction is the only one
      // of the three outside shapes with no authored extent in its params: the
      // node is a point, the mouths are derived per node at runtime
      // (runtime/stoplines.ts, 17–43 m out), and this anchor has no district
      // in hand. The acceptance ring is the best statement available of „the
      // car was at this junction", which is exactly what the arm already says
      // — so stating it keeps C7's 41–47 m closure BIT-IDENTICAL while making
      // the claim explicit instead of inferred.
      return {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        armWithinM: params.radiusM,
        workSiteRadiusM: params.radiusM,
        dwellSec: FINISH_LEAVE_S,
        mode: "outside",
        terminalRescue: params.requireRedMet !== true,
      };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (params.maneuver) {
        case "parkInBay":
          // The bay is the one maneuver target that IS the end of the road:
          // every route ending in a park ends AT it (L7, the полигон drill,
          // every exam-bank shell). Its rescue face is the strictest one in
          // the module — FINISH_BAY_STUCK_S motionless — because this is the
          // anchor where being present, slow and unfinished is what CORRECT
          // driving looks like for the whole minute before the park lands.
          return {
            x: params.bay.x,
            y: params.bay.y,
            radiusM: FINISH_BAY_RADIUS_M,
            dwellSec: forRescue ? FINISH_BAY_STUCK_S : FINISH_REST_S,
            maxSpeedKmh: forRescue ? FINISH_STANDSTILL_KMH : FINISH_REST_KMH,
            terminalRescue: true,
          };
        case "roundabout":
          // B1. Six drills ended here with no finish at all. The route does
          // not end at the island — it ends when the ring is BEHIND you.
          // Armed by entering (`enterRadiusM`, the objective's own threshold),
          // tripped by being clear of `exitRadiusM` for FINISH_LEAVE_S. A car
          // circulating, hesitating or stopped on the ring can never trip it.
          //
          // O23 — THE WORK SITE IS THE ARMING CIRCLE, and saying so is the
          // whole fix. `enterRadiusM` is a circle CONTAINING the ring (the
          // shipped rb-mini ring is r 18 inside a 24 m arm), so everything
          // past it is approach road rather than work — and a car resting on
          // approach road is the case B15's lawful wait covers for 180 s and
          // then hands over. Until this field the inner edge was INFERRED as
          // `radiusM − FINISH_OUTSIDE_ANNULUS_M`, which is further out than
          // the arm on every ring whose authored band exceeds one margin: 48
          // of 58 zones, up to 5.0 m (`sc-rb-lane-choice`, enter 33 / exit
          // 46), and every metre of it had NO ending at any duration.
          return {
            x: params.x,
            y: params.y,
            radiusM: params.exitRadiusM,
            armWithinM: params.enterRadiusM,
            workSiteRadiusM: params.enterRadiusM,
            dwellSec: FINISH_LEAVE_S,
            mode: "outside",
            terminalRescue: true,
          };
        case "threePointTurn": {
          // B1, same shape: four turn drills had no finish. The corridor is
          // the work box; the route ends when the car has driven out of it,
          // turn completed or turn abandoned. Circumradius so leaving in ANY
          // direction counts, plus a margin so a shunt at the box corner does
          // not read as departure.
          //
          // O23 — and the two circles are the ONLY pair in the module where
          // the arm is smaller than the work site, which is why the work site
          // has to be stated. The arm is the INSCRIBED circle (conservative
          // evidence that the car was genuinely in the box); the box's outer
          // bound is the CIRCUMradius, up to 10.0 m further out
          // (`sc-mv-uturn-ban`, corridor 30 × 40 m: arm 15, circum 25). The
          // ring between them is authored corridor, and reading it as margin
          // is what closed a lesson on a student paused inside the box.
          const { corridor } = params;
          const circumM = Math.hypot(corridor.halfWidthM, corridor.halfLengthM);
          return {
            x: corridor.x,
            y: corridor.y,
            radiusM: circumM + FINISH_OUTSIDE_ANNULUS_M,
            armWithinM: Math.min(corridor.halfWidthM, corridor.halfLengthM),
            workSiteRadiusM: circumM,
            dwellSec: FINISH_LEAVE_S,
            mode: "outside",
            terminalRescue: true,
          };
        }
        case "smoothStop":
        case "emergencyStop":
          // Genuinely placeless: „stop smoothly" and „stop for the hazard"
          // happen wherever the road puts them. No anchor is derivable and
          // inventing one would end drives at an arbitrary coordinate.
          return null;
      }
  }
}

/**
 * Give an "outside" anchor its two circles, and guarantee the band between
 * them. The arm is clamped into the zone (you cannot be asked to reach further
 * out than the place you are leaving), and the departure circle is then pushed
 * out until at least FINISH_OUTSIDE_ANNULUS_M separates the two — see that
 * constant for the five rungs that shipped with the circles coincident and
 * what a car standing at a green light one metre outside them cost.
 *
 * Both operations are one-way: the arm can only shrink to the zone it belongs
 * to, and the region can only grow. THAT IS NOT THE SAME AS SAFE, and the
 * sentence that used to stand here („no drive that ends today stops ending —
 * a car that has genuinely left the work site simply travels the band before
 * it counts") was false for the only car that matters: one that has stopped.
 * Growing the region moved 40–48 m out of „left" and into „neither", and a car
 * resting there travels nothing, ever — measured on `sc-sig-green-wave` L1 at
 * FINISH_OUTSIDE_ANNULUS_M. The band is honest; what it needed was a floor in
 * TIME as well as one in distance, and that is FINISH_OUTSIDE_STUCK_S in
 * `stepFinishGate`.
 */
function normalizeOutside(zone: RouteFinishZone): RouteFinishZone {
  const armWithinM = Math.min(zone.armWithinM ?? zone.radiusM, zone.radiusM);
  const radiusM = Math.max(zone.radiusM, armWithinM + FINISH_OUTSIDE_ANNULUS_M);
  // O23 NOTE, so the next reader does not add it back. A second floor was
  // written here — `radiusM ≥ workSiteRadiusM + margin` — and then removed,
  // because no input can reach it: every anchor states a work site at or
  // inside its own arm except the turn box, which authors `radiusM` as
  // circum + margin and therefore clears it by construction. A guarantee
  // nothing can exercise is not guarded by anything and quietly rots. The
  // invariants it was meant to protect are enforced where the band is READ
  // instead (`strandedBeyondM`'s clamp), which no caller can bypass and which
  // a hand-built zone CAN reach — and does, by test.
  return { ...zone, armWithinM, radiusM };
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Where this route ENDS, or null when it has no automatic finish.
 *
 * Null happens for three honest reasons: a single-objective route (the
 * objective IS the route — there is no earlier task to stall on), a terminal
 * objective with nowhere to arrive (drive N metres, stop smoothly, brake for
 * the hazard, work the roundabout), or a route so compact that the clamp below
 * leaves no usable zone.
 *
 * THE CLAMP is what makes one rule fit both a 2.5 km exam route and a 20 m
 * parking-lot drill. The zone is shrunk to at most HALF the distance to every
 * earlier located waypoint, so a finish can never swallow the leg before it:
 * on the city exam nothing binds (the nearest earlier waypoint is 62 m away,
 * half of that is 31 m, the bay radius stays 14 m), while in the parallel-park
 * lot — pull-up pose at (0, 6), bay at (6.28, 0), 8.7 m apart — the same rule
 * tightens the finish to 4.3 m, i.e. essentially "in the bay". Self-tuning,
 * with no per-lesson authoring and no map knowledge.
 */
export function routeFinishZone(objectives: readonly ObjectiveParams[]): RouteFinishZone | null {
  if (objectives.length < 2) return null;

  const anchor = finishAnchor(objectives[objectives.length - 1]);
  if (anchor === null) return null;

  // An "outside" anchor is a departure threshold, not an arrival circle:
  // shrinking it would make leaving EASIER, which is backwards, and there is
  // no earlier leg for it to swallow because it is satisfied by being away
  // from the route's end rather than at it. It ships unclamped.
  if (anchor.mode === "outside") return normalizeOutside(anchor);

  // B3: floor first, clamp second — the order matters and is the whole fix.
  // Flooring after the clamp would let a compact route re-narrow the escape;
  // flooring before it means the escape is one lane wide wherever the route
  // has room for it, and the clamp only bites where the previous waypoint is
  // genuinely close (where a wrong-lane car cannot be hiding anyway).
  let radiusM = Math.max(anchor.radiusM, FINISH_LANE_FLOOR_M);
  for (let i = 0; i < objectives.length - 1; i++) {
    const prev = targetPoint(objectives[i]);
    if (prev === null) continue;
    radiusM = Math.min(radiusM, dist(anchor, prev) / 2);
  }
  if (radiusM < FINISH_MIN_RADIUS_M) return null;
  return { ...anchor, radiusM };
}

/**
 * B2 — the escape for a student stuck ON the terminal objective, where the
 * `routeFinishZone` above deliberately does not reach (it exists to end a
 * chain stalled on an EARLIER task, and its evidence — "the car is where the
 * route ends" — is satisfied by every normal final approach).
 *
 * Null when the anchor opts out (`terminalRescue: false`) — today that is a
 * `requireRedMet` junction, whose retry is designed and feasible on the spot
 * and whose student is legitimately stationary while he waits the red out.
 *
 * For an "inside" anchor the rescue is the anchor with two changes:
 *  - the half-distance clamp is DROPPED. Every earlier leg is complete by
 *    definition here, so there is nothing left for the finish to swallow —
 *    which is what lets the FINISH_LANE_FLOOR_M floor survive on a compact
 *    route, and the floor is the entire point (B3);
 *  - presence is replaced by a full STANDSTILL, held FINISH_STUCK_S at a
 *    waypoint and FINISH_BAY_STUCK_S beside a bay. That is the only
 *    observable that separates "stuck" from "still driving this": an
 *    approach, a creep toward the mark and a park shuffle all keep moving,
 *    and a red-light wait ends by itself.
 *
 * An "outside" anchor needs neither change: leaving the work site already
 * means the work is over, and the standstill evidence the other two anchors
 * get from this function it gets from `stepFinishGate` instead
 * (FINISH_OUTSIDE_STUCK_S), on the same zone, because this zone is also the
 * only one the engine consults on the terminal objective.
 */
export function terminalRescueZone(
  objectives: readonly ObjectiveParams[],
): RouteFinishZone | null {
  if (objectives.length < 1) return null;

  const terminal = objectives[objectives.length - 1];
  const anchor = finishAnchor(terminal, true);
  if (anchor === null || anchor.terminalRescue !== true) return null;
  if (anchor.mode === "outside") return normalizeOutside(anchor);

  return { ...anchor, radiusM: Math.max(anchor.radiusM, FINISH_LANE_FLOOR_M) };
}

// ---------------------------------------------------------------------------
// O30 (2026-08-22) — THE END OF THE ROUTE IS BEHIND YOU AND THE DRIVE IS STILL
// RUNNING.
// ---------------------------------------------------------------------------
//
// EVERY ENDING AN ARRIVAL TERMINAL HAS IS AN ARRIVAL. `routeFinishZone` asks
// for presence and the engine withholds it on the terminal objective („every
// correct final approach would satisfy it"); `terminalRescueZone` asks for a
// full standstill AT the mark. A car that drives THROUGH the mark and keeps
// going satisfies neither — and on a terminal carrying a SPEED CONTRACT it can
// no longer satisfy the OBJECTIVE either WHILE HE KEEPS GOING: `stepReachZone`
// grades `done = reached && capMet`, so a car that swept the disc at 40 km/h
// against a 6 km/h cap has latched `reached` and spent `capMet`. Nothing in
// this module is anchored anywhere the car still is, and the drive runs until
// somebody presses «Прекрати урока».
//
// CORRECTED 2026-08-22 BY THE VERIFIER, because the sentence this block first
// carried — „spent `capMet` for good … a gate that driving on cannot re-earn"
// — is FALSE, and a false root cause is how a lane ships the wrong fix.
// `capMet` is `(st.capMet && !capSpent) || contractEarned` (objectives.ts
// ~1600) and `contractEarned` re-earns it on any later frame inside the
// acceptance disc at or under the cap. Driven end-to-end through `applyTick`
// on the exhibit itself: 40 km/h straight through `sc-ac-aquaplane`@L1's
// terminal, 200 m on, then back onto the mark under 6 km/h — 2/2 objectives
// done, `phase === "completed"` at t = 94.5 s. The same drive on
// `sc-ac-night-overdrive`@L1 also completes; `sc-ac-truck-spray` and
// `sc-ac-wind-truck-pass` (uncapped r-17 terminals) complete on the straight
// drive alone, without turning back at all. So the finding's „the pass path
// exists in exactly one lesson out of seven" does not survive being driven.
// WHAT IS TRUE is narrower and still worth an ending: a car that keeps going
// FORWARD never ends, because no fold is anchored where it is.
//
// MEASURED over the compiled catalogue (808 rungs): 674 end on a `reachZone`
// and 132 of those carry a speed contract — every «спри точно на позицията» /
// «мини с намалена скорост» terminal in the product. Two are sweep161 exhibits
// on this file, `sc-ac-aquaplane` and `sc-ac-night-overdrive` (both «Спри точно
// на позицията…», the finding sc-ac-aquaplane:517af4c5 — „five of the seven
// lessons cannot be finished by driving … the pass path exists in exactly one
// lesson out of seven"). Both re-drove for 258 s WITH STEERING
// (.audit-frames/rebase, commit 70bcd1b) with the terminal task unticked and no
// ending offered.
//
// THE SHAPE IS B1's OWN SENTENCE POINTED AT A WAYPOINT — „the ending is not the
// island, it is having LEFT the island". A car a lane clear of the end of the
// route and still going is not going to complete a task that happens back
// there, and the debrief is the better use of his time.
//
// WHY IT IS A THIRD ZONE AND NOT A SECOND FACE ON THE RESCUE. It was written
// that way first and the module refused it, for a reason worth recording so the
// next lane does not spend a round rediscovering it: `stepFinishGate` carries
// exactly two faces per zone (the region, and the standstill band around it),
// and a terminal ARRIVAL needs both a standstill AT the mark (B2, inside the
// arming circle) and a departure BEYOND it. An "outside" zone cannot give the
// first — `strandedBeyondM`'s clamp floors the band at `armWithinM`, which is
// B1's ground and is pinned by `finish-work-site-band.test.ts` in three places.
// Carrying both would need one more field on `FinishGateState` (types.ts) or
// one more gate state in `engine.ts`, and neither file is this lane's. So the
// zone is derived, measured and tested HERE, and the arm is six lines THERE,
// written out verbatim below `routeDepartedEndingCopy`.
//
// WITHHELD ON A ROUTE TOO COMPACT TO MEAN IT, which is `routeFinishZone`'s
// half-distance clamp pointed the other way. If a waypoint the route sends the
// student to EARLIER lies inside the departure circle, then „you have left the
// end of the route" and „you are back at the checkpoint before it" are the same
// pose, and a manoeuvring drill retried from its own approach pose would be
// closed mid-retry. Measured: 9 of the 674 rungs — `sc-park-parallel-exit`
// L1–L5 (previous waypoint 12.77 m out) and `sc-ed-reverse-line` L1–L4
// (10.00 m) — and both are exactly that shape. ZERO rungs have an earlier
// waypoint inside the ARM, so no route can arm this from a leg of itself;
// `__tests__/terminal-departure.test.ts` ratchets both counts.
//
// A BAY NEVER GETS IT, and its own anchor says why: beside a bay „being
// present, slow and unfinished is what CORRECT driving looks like for the whole
// minute before the park lands", and a park retried by pulling forward and
// lining up again is a departure this face cannot tell from an abandonment.
// A `passSignal`, a ring and a turn box never get it either — they already
// depart, through `terminalRescueZone`'s own "outside" face.
//
// THE BAND IS EXACTLY ONE MARGIN (`workSiteRadiusM === armWithinM`), so every
// invariant `finish-work-site-band.test.ts` states about an "outside" zone
// holds here unchanged: the band never reaches inside the arm, it is never
// zero-width, and it is never wider than FINISH_OUTSIDE_ANNULUS_M.
/**
 * Seconds past the departure circle before a drive that went PAST the end of
 * the route is closed — the O30 zone's region dwell.
 *
 * NOT FINISH_LEAVE_S, and the change is the decision the O30 warning block
 * demanded before the arm was allowed to land. Twenty seconds is right for a
 * maneuver work site, where being outside means the work is provably over; it
 * is WRONG here, measured on the recorded overshoot-and-return drive
 * (sc-ac-aquaplane@L1, the O30 block): at 20 s the gate latches at t = 53.25 s
 * and the student completes the lesson at t = 94.5 s — a correct drive refused
 * 41.3 s before it finished, which objectives.ts calls the failure the founder
 * ranks worst.
 *
 * FORCED FROM BOTH SIDES, like every bar in this file:
 *
 * FROM BELOW — it may not refuse a return the product allows. Two bounds, and
 * the larger wins:
 *   · the recorded return manoeuvre: region entry at t ≈ 33.0 s, completion at
 *     t = 94.5 s ⇒ the gate may not latch inside 61.5 s of region time;
 *   · a car that STOPS beyond the circle mid-return. This face carries no
 *     speed test (a departing car is the moving case), so its bar must also
 *     exceed the longest standstill any audited drive ever resumed from —
 *     which is FINISH_OUTSIDE_STUCK_S's own measurement (69 s sampled over 332
 *     lanes / 7,398 samples, 74.2 s true, ⇒ 75).
 * The second bound contains the first, so this is DEFINED AS that constant
 * rather than as a second 75 — one claim („past this, the car is not coming
 * back"), one number, the same rule OFF_NETWORK_STUCK_S already follows.
 *
 * FROM ABOVE — it must still close the exhibit. The straight-on drive
 * (40 km/h through the terminal and away, the flipped test) now ends at
 * ≈ region entry + 75 s, inside every budget the audit ran, instead of never.
 * B15's freeze still withholds every second of a lawful wait beyond the
 * circle, so a red light past the end of the route spends nothing.
 */
export const FINISH_DEPARTED_S = FINISH_OUTSIDE_STUCK_S;

export function terminalDepartureZone(
  objectives: readonly ObjectiveParams[],
): RouteFinishZone | null {
  if (objectives.length < 1) return null;
  const terminal = objectives[objectives.length - 1];
  if (terminal.kind !== "reachZone") return null;

  // The arm is the objective's own acceptance radius, floored to one lane —
  // B3's floor, for B3's reason: a car one lane wide of the gate is where the
  // taught mistake of `sc-ln-boulevard-discipline` puts it (8.13 m), and it has
  // been at the end of the route just as surely as a car in the right lane.
  const armWithinM = Math.max(terminal.radiusM, FINISH_LANE_FLOOR_M);
  const radiusM = armWithinM + FINISH_OUTSIDE_ANNULUS_M;
  for (let i = 0; i < objectives.length - 1; i++) {
    const prev = targetPoint(objectives[i]);
    if (prev !== null && dist(terminal, prev) <= radiusM) return null;
  }
  return normalizeOutside({
    x: terminal.x,
    y: terminal.y,
    radiusM,
    armWithinM,
    workSiteRadiusM: armWithinM,
    dwellSec: FINISH_DEPARTED_S,
    mode: "outside",
    terminalRescue: true,
  });
}

// ---------------------------------------------------------------------------
// THE RUN-OUT — B-NEW-1/zebra (founder: «the session ended itself»), measured
// 2026-08-16 on `sc-zebra-approach` L1.
//
// TOLERANCE IS FORGIVENESS FOR THE TASK. IT IS NOT A RELOCATION OF THE FINISH
// LINE — and until this block the engine spent it twice.
//
// A `reachZone` completes on ENTERING its acceptance ring (objectives.ts
// `stepReachZone`: `inZone = d <= radiusM`). On the TERMINAL objective that
// same frame also ended the session (engine.ts, the chain-complete branch), so
// the drive stopped one whole radius SHORT of the mark the author placed —
// short of the very point the guidance ribbon had been pointing at all along
// (`guidanceGoalFor`, cited in this file's own header).
//
// MEASURED, on the shipped catalogue rather than argued:
//   · 674 authored rungs end on a `reachZone`. Mean radius 10.03 m, so the mean
//     drive is cut TEN METRES short of its own end; the worst is
//     `sc-fo-motorway-gap` L1 at 23 m.
//   · `sc-zebra-approach` L1: mark (4.06, 130), radius 12 → 17 after the L1
//     ladder. All three COMMITTED recordings — shadow-correct,
//     mistake-not-yielded, mistake-too-fast — end at y = 113.0…113.1. The
//     authored end of that route is 17 m further on, and the crossing the
//     lesson exists to teach is at y = 90: the founder's drive closed 23 m and
//     3.0 s after driving through an occupied zebra.
//   · AND THE LADDER IS UPSIDE DOWN. `toleranceScale` (compile.ts) widens the
//     acceptance at the LOW rungs so a beginner is not failed for stopping a
//     few metres off. Because the same number ended the drive, the kinder the
//     rung the SHORTER the road: mean terminal radius L1 12.67 m vs L5 8.91 m,
//     and on 119 of 140 templates L1 loses more road than L5. On the zebra the
//     beginner got 4.6 m less street than the expert, on the same street, for
//     the same drive. Nobody chose that; it fell out of one number doing two
//     jobs.
//
// SO THE RUN-OUT SEPARATES THE TWO JOBS. The objective is still awarded on
// EXACTLY the frame it is awarded today — nothing here grades, credits or
// withholds anything, and no student gains or loses a tick — but the DRIVE
// carries on to the mark, and ends when the car has actually got there.
//
// It is bounded three ways, because a drive that cannot end is the worse bug
// (the whole completability battery exists for it):
//   ARRIVED — within FINISH_MIN_RADIUS_M of the mark, or past it along the
//     approach (the same „along the axis" convention `stepReachZone` uses for
//     its capsule, so the two halves of the module agree about „beyond").
//   AT REST — a full standstill. A student who has finished every task and
//     stopped HAS finished the drive, wherever he stopped.
//   SPENT — ROUTE_RUNOUT_MAX_S, the backstop that makes hanging impossible.
// The lawful-wait freeze (B15) applies to the last two for the same reason it
// applies to the finish gates: a second spent stopped because the road said so
// is evidence of nothing, and closing the drive on a student yielding correctly
// at the very end would be B15 all over again.
// ---------------------------------------------------------------------------

/**
 * How close to the mark counts as ARRIVED, meters.
 *
 * Deliberately this file's own FINISH_MIN_RADIUS_M rather than a new number:
 * that constant is already the module's statement of the smallest zone it is
 * honest to draw („below this a zone is smaller than the car"). It is only a
 * tolerance for a car that comes to rest ON the mark — a car that drives
 * through is caught by the past-the-mark half, which no frame rate can miss.
 */
export const ROUTE_RUNOUT_ARRIVE_M = FINISH_MIN_RADIUS_M;

/**
 * The ceiling on a run-out, seconds. Past it the drive ends where it stands.
 *
 * IT IS NOT A SESSION BACKSTOP, and the block above says „the backstop that
 * makes hanging impossible" about a great deal less than it sounds like.
 * Asked (2026-08-18) why this did not save the car stranded 42–48 m past
 * `sc-sig-green-wave`'s terminal node, the answer is two independent noes and
 * neither is a defect in the run-out:
 *   1. IT IS NEVER ARMED FOR A STRANDED DRIVE. `engine.ts` arms it in the
 *      `currentIndex >= objectives.length` branch — i.e. only once every task
 *      is DONE. A car stranded with its terminal objective open has a chain
 *      that never completes, so this clock never starts. The run-out bounds
 *      the drive AFTER the tasks, and nothing else;
 *   2. even armed, `routeEndMark` is null for a `passSignal` terminal (see it
 *      for why), and a null mark terminates on the spot rather than counting.
 * The only thing that can end a stranded drive is a finish gate, which is why
 * the fix for that car is FINISH_OUTSIDE_STUCK_S and not a number here.
 *
 * Derived from the run-out's own worst case, which is bounded by construction:
 * the car starts inside the terminal ring, so it is at most that radius from
 * the mark, and the widest terminal ring in the catalogue is 23 m
 * (`sc-fo-motorway-gap` L1). Twenty seconds covers 23 m at anything above
 * 4.1 km/h; below that a car is either stopping — where the standstill exit
 * takes over within a second or two — or crawling nowhere, which is what a
 * ceiling is for. It can only ever ADD road to a drive that used to end
 * instantly, never withhold an ending.
 */
export const ROUTE_RUNOUT_MAX_S = 20;

/**
 * Where the route's last task was authored to happen, or null when running on
 * to it makes no sense.
 *
 * Null on purpose for everything that is not an ARRIVAL WAYPOINT:
 *  - a placeless terminal (drive N metres, stop smoothly, brake for the
 *    hazard) has no mark to run to;
 *  - a MANEUVER terminal ends by DEPARTURE, not arrival — finish.ts already
 *    models the roundabout and the turn box as `mode: "outside"`, and running
 *    a finished student back toward the island he has just left would be
 *    absurd. A `parkInBay` is excluded for the opposite reason: it completes
 *    with the car at rest inside the rect, i.e. already at the mark and
 *    already at a standstill, so a run-out has nothing to add;
 *  - a `passSignal` terminal is excluded because its defect was NOT measured.
 *    Its mark is the node while its completion is the painted line at the
 *    junction MOUTH, so it plausibly loses road the same way — but the mouth
 *    setback is derived per node (runtime/stoplines.ts) and can put the node
 *    inside the box, and this pass is not going to guess at junction geometry
 *    it has not driven.
 * What is left is `reachZone`, which is the class the 674-rung census above
 * actually measured.
 */
export function routeEndMark(objectives: readonly ObjectiveParams[]): Point | null {
  if (objectives.length < 1) return null;
  const terminal = objectives[objectives.length - 1];
  if (terminal.kind !== "reachZone") return null;
  return { x: terminal.x, y: terminal.y };
}

/**
 * Has the car got to the end of the route? True on arrival at the mark and on
 * passing it — `from` is where the run-out began, which is inside the terminal
 * ring and therefore always on the approach side of the mark.
 */
export function routeRunOutArrived(
  mark: Point,
  from: Point,
  here: Point,
): boolean {
  if (dist(here, mark) <= ROUTE_RUNOUT_ARRIVE_M) return true;
  const ax = mark.x - from.x;
  const ay = mark.y - from.y;
  const m = Math.hypot(ax, ay);
  if (m < 1e-6) return true; // began ON the mark — there is nowhere to run to
  // + = beyond the mark, the sign convention of stepReachZone's capsule.
  return ((here.x - mark.x) * ax + (here.y - mark.y) * ay) / m > 0;
}

// ---------------------------------------------------------------------------
// THE LAWFUL WAIT — B15 (founder, „Кръгово движение"): «the roundabout convicts
// me the instant the wheels turn after I have waited properly at the give-way
// line. I waited about 40 seconds.»
//
// THAT ROW WAS UNPHOTOGRAPHABLE, and this file is why. Three separate runs
// tried to hold the frame: at roughly twenty seconds of standing still the
// session handed itself a result screen («0 наказателни точки · НЕИЗДЪРЖАН ·
// Ориентировъчно време 20 с») and the keyboard stopped mattering. Twenty
// seconds is FINISH_LEAVE_S, and the gate that spends it is the one directly
// above — leave-the-work-site.
//
// THE GEOMETRY, measured on the shipped drill rather than argued
// (b15-lawful-wait.test.ts pins every number):
//   sc-roundabout-entry  ring (0,0) · enterRadiusM 24 · exitRadiusM 34
//   the painted М8 give-way bars on the south arm:  (4.06, −35.725)
//   ⇒ a car stopped ON THE PAINT is 35.96 m out — 1.96 m INSIDE the region
//     this gate calls „you have left the roundabout", which starts at 34 m.
// The gate arms on one frame within 24 m. So every student who has been at the
// ring and is then stationary where the lesson TELLS him to stand („спри на
// линията и я пропусни", instruction 2) is inside an armed finish, counting
// down, and at twenty seconds his lesson is over. Driven and confirmed live:
// the arming flips at 22.1 m from the centre, and the raw gate latches
// `reachedAtSec` exactly FINISH_LEAVE_S after the first frame on the paint.
//
// The gate fires because the ONLY thing it can read is „the car is not at the
// ring and is not moving", which is equally true of a tab someone walked away
// from and of a student doing the single most important thing a learner does
// at a junction.
//
// THE GATES ARE NOT WRONG TO EXIST. An idle tab must not hold a lesson open
// forever, and a car standing in the middle of nowhere with nothing pending is
// genuinely finished with the route. What was missing is the DISTINCTION, and
// it is not a longer timeout — a longer timeout only moves the number at which
// the product fails him. It is: while the scenario is EXPECTING a yield, a
// standstill is not evidence of anything except obedience, so it must not
// count toward the idle finish at all.
//
// WHAT COUNTS AS „expecting a yield", and why each one is here:
//  · a Б1 give-way line or a Б2 stop sign within reach ahead — the tick's own
//    `nextStopLineControl`/`nextStopLineM` (worldRuntime publishes both);
//  · a red / red-amber / amber light at that line — waiting it out is the law;
//  · a pedestrian on a crossing whose approach zone the car is inside — the
//    tick reports this as an EVENT, so it is latched (see YieldWaitState);
//  · a ROUNDABOUT this route has not finished, with the car stopped within one
//    approach of it. This one cannot be read off the stop line at all:
//    `stoplines.ts` skips every junction touching a roundabout edge
//    (`incident.some(roundabout) ⇒ continue`), so rb-mini-v1's give-way arm
//    publishes NO stop-line context whatsoever — the М8 paint and its Б1 are
//    drawn, the graded line is not. Confirmed on the live drive: the telemetry
//    reads `nextStopLineControl = null` on every frame of the approach. His
//    exact case therefore has to come from the ROUTE — a roundabout objective
//    the sequential chain has not passed yet, and a car at a standstill within
//    one approach of it.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not grade — nothing here emits,
// suppresses or reweights a ScorableEvent, exactly like the rest of this file.
// It does not touch the objective chain: a wait completes no task. And it does
// not hold a session open forever — YIELD_WAIT_MAX_S below is the point past
// which even a lawful-looking standstill is an abandoned tab.
// ---------------------------------------------------------------------------

/**
 * How close ahead a controlled line has to be for a standstill to read as
 * waiting AT it, meters. The runtime watches 120 m of road (NEXT_LINE_WATCH_M)
 * — far too generous here: a car stopped 80 m short of a give-way line is
 * stopped in open road, not at the line.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-16 — 12 → 26. THE CLIFF AT A METRE AND A HALF (founder, driven on
 * staging, `sc-signal-response@L1`, three runs of the SAME junction):
 *   · stopped 10.6 m short of the paint (PC) — the whole arc fires: the
 *     «Чакаш правилно на червено» card, «Защо чакаш: червен сигнал»,
 *     «Чакането Е маневрата», and «Изчака сигнала и тръгна чисто» after green.
 *   · stopped 12.5 m short (phone) — NOTHING, for seventy-five seconds. The
 *     only thing on the screen for the whole wait was «Кола отзад · 2 м».
 * The difference between the two drives is 1.9 m, and the MORE cautious one is
 * the one the product went silent on. Twelve was the whole reason.
 *
 * THE OLD NUMBER'S OWN JUSTIFICATION WAS THE ERROR. It read „the shipped
 * junction-mouth setback (STOP_LINE_BEYOND_CUT_M band) plus a car length and
 * change" — but STOP_LINE_BEYOND_CUT_M is 0.6 m (world/builders/network.ts), so
 * that sentence describes ~5 m, not 12. Twelve was never derived from anything;
 * it was a round number wearing a derivation.
 *
 * WHAT IT IS DERIVED FROM NOW — the queue the line itself creates, in the
 * numbers the shipped traffic actually forms with:
 *     VEHICLE_LENGTH_M 4.1 (traffic/system.ts) + minGapM 2.0 (traffic/types.ts
 *     DEFAULT_TRAFFIC_CONFIG) = 6.1 m per stopped car, centre to centre;
 *     the leader's own centre rests 1.78 m short of the paint — not a guess,
 *     it is the pose the shipped shadow drives hold (traces/scSignals.ts
 *     YIELD_Y −29.5 against the sx-v1 line at −27.725).
 *   ⇒ 1.78 + 4 × 6.1 = 26.18 m is the FIFTH car in a stopped queue.
 *
 * AND IT IS FORCED FROM ABOVE AND BELOW, which is what stops it being taste:
 *
 *   FROM BELOW — a lesson may not refuse to recognise the pose it sends the
 *   student to. FOUR shipped drills park their approach checkpoint one lane off
 *   the axis, 45 m from the node, r 8 — far edge 53 m out against a line
 *   27.725 m out (JUNCTION_STOP_LINE_M), i.e. 25.28–25.46 m short of the paint:
 *   `sc-sig-approach` (светофар), `sc-jstop-approach` and `sc-jscan-approach`
 *   (both control stopSign — so this is not a traffic-light quirk) and
 *   `sc-ltap-approach`, all in templates-junctions.ts. At 12 m the window
 *   covered 2.7 m of a 16 m zone the lesson's OWN objective tells him to stop
 *   in. 26 contains all of it, with 0.5 m to spare — deliberately tight, so
 *   that authoring a gate further out has to be a decision rather than a
 *   regression (`__tests__/signal-stop-line-window.test.ts` fails on it).
 *
 *   FROM ABOVE — the founder's own line, and the trap this fix had to avoid:
 *   „a student who stops 40 m short has NOT stopped at the line and must not be
 *   told he did". 26 < 40, with the fifth-car derivation as the reason rather
 *   than the gap. Beyond it the hold is withheld, the finish gates resume, and
 *   the drive ends with the objectives honestly unticked.
 *
 * WHAT WIDENING THIS CAN AND CANNOT COST. It grades nothing (the contract this
 * whole section opens with): its only two effects are that the idle finish may
 * not spend these seconds, and that the instructor is allowed to speak. The
 * price is that a tab abandoned within 26 m of a controlled line is held for
 * YIELD_WAIT_MAX_S instead of FINISH_STUCK_S — bounded, and the same trade B15
 * already made at 12.
 */
export const YIELD_STOP_LINE_REACH_M = 26;

/**
 * How far SHORT of a ring the car may stand and still read as waiting to enter
 * it, meters beyond the objective's own `enterRadiusM`.
 *
 * Measured against the shipped case rather than guessed: on `rb-mini-v1` the
 * ring is r=18, the objective's enterRadiusM is 24, and the painted М8
 * give-way bars sit 18.2 m out from the entry mouth — i.e. ~36 m from the ring
 * centre, 12 m beyond the arming circle. Twenty metres covers that with room
 * for the car behind him in a queue, and excludes the spawn (93 m out), which
 * must keep ending the session when a tab is abandoned there.
 */
export const YIELD_ROUNDABOUT_APPROACH_M = 20;

/**
 * The ceiling. Past this many CONTINUOUS seconds of lawful-looking standstill
 * the hold stops being honoured and the finish gates resume — because at some
 * point „waiting for a gap" and „closed the laptop" become indistinguishable
 * again, and the gate's legitimate purpose is the second one.
 *
 * Three minutes is deliberately far past any real wait. The founder's was 40 s;
 * the roundabout drill's circulator comes round every ~40 s; the longest
 * signalized red on the shipped maps is 26 s of a 50 s cycle. It is 4.5× his
 * wait and 3× the sixty-second proof this row is closed with, and it still
 * bounds an abandoned tab to three minutes.
 */
export const YIELD_WAIT_MAX_S = 180;

/**
 * Why this frame is a lawful wait — for the instructor's voice, tests and
 * telemetry, never for grading. The union itself moved to `./types` when
 * `YieldWaitState` started carrying one (B15-VOICE); re-exported here so every
 * existing `from "./finish"` import is unchanged.
 */
export type { YieldReason };

/** Fresh hold: not waiting, nothing latched. */
export function createYieldWait(): YieldWaitState {
  return { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds: [] };
}

/** The route context the roundabout reason needs (engine-side session state). */
export interface YieldWaitContext {
  /** Every objective's params, in route order. */
  params: readonly ObjectiveParams[];
  /**
   * Index of the ACTIVE objective; >= params.length ⇒ the chain is done.
   * Objectives BEFORE it are complete by construction (the chain is strictly
   * sequential), which is exactly how „a roundabout this route still has to
   * do" is expressed below — no extra state, and it stays true across a
   * voided traversal, which is when a student is most likely to be sitting at
   * the line again.
   */
  currentIndex: number;
}

/** Fold this frame's crossing events into the latched pedestrian set. */
function stepPedestrianCrossings(
  prev: readonly string[],
  tick: SimTick,
): readonly string[] {
  let next = prev;
  const drop = (id: string): void => {
    if (next.includes(id)) next = next.filter((x) => x !== id);
  };
  for (const e of tick.events) {
    switch (e.kind) {
      case "crossingZoneEntered":
        // Re-emitted whenever the flag changes, so it both arms and disarms.
        if (e.pedestrianOnCrossing) {
          if (!next.includes(e.crossingId)) next = [...next, e.crossingId];
        } else drop(e.crossingId);
        break;
      case "crossingPassed":
      case "crossingZoneExited":
        drop(e.crossingId);
        break;
      default:
        break;
    }
  }
  return next;
}

/**
 * Is the scenario expecting a yield HERE? Null = no; a reason otherwise.
 * Speed is NOT considered — the caller owns the standstill test, so this stays
 * a pure statement about the world and the route.
 */
export function yieldReasonAt(
  tick: SimTick,
  ctx: YieldWaitContext,
  pedestrianCrossingIds: readonly string[],
): YieldReason | null {
  // 1-3. A controlled line the runtime can see, within reach AHEAD.
  //
  // ONE-SIDED, AND DELIBERATELY SO — the third of the founder's three runs is
  // this side of the same junction: stopped 8.5 m PAST the line, inside the
  // mouth, seventy-five seconds, and the same total silence. `nextStopLineM`
  // is published only for a line ahead in the travel direction (worldRuntime
  // `d >= 0`), so a car that has crossed reports no line at all and falls out
  // of this clause however wide the window gets.
  //
  // That silence is a real defect and it is NOT this function's to fix. A car
  // standing inside a junction is not lawfully waiting for anything: it must
  // get no hold (its session has to be allowed to end so the student reaches
  // the debrief that explains the overshoot) and no reason (every line of copy
  // keyed to `redLight` opens with «Спрял си ПРЕД стоп-линията», which is the
  // one thing that is not true of him). Both of those are already what happens
  // — the widening above must not quietly change it, so the past-the-line pose
  // is pinned by test rather than merely left alone. What is owed to that
  // student is a FAULT and a card, and both live outside this module: the
  // STOP_LINE_OVERSHOOT detector can only see a nose over the paint while the
  // centre is still short of it (rules/engine.ts, `nextStopLineM <=
  // stopOvershootCenterM`), and there is no reason in the `YieldReason` union
  // for „stopped in the junction" to be said with.
  const lineM = tick.nextStopLineM;
  if (lineM !== undefined && lineM <= YIELD_STOP_LINE_REACH_M) {
    if (tick.nextStopLineControl === "giveWay") return "giveWayLine";
    if (tick.nextStopLineControl === "stopSign") return "stopSign";
    if (
      tick.nextStopLineControl === "trafficLight" &&
      tick.nextStopLineState !== undefined &&
      tick.nextStopLineState !== "green"
    ) {
      return "redLight";
    }
  }

  // 4. A pedestrian on a crossing this car is in the approach zone of.
  if (pedestrianCrossingIds.length > 0) return "pedestrian";

  // 5. A ring this route has NOT finished yet, with the car stopped within one
  // approach of it. The annulus is deliberately symmetric — it is not worth
  // guessing from a heading whether a stationary car 30 m out is arriving or
  // has just been told to come back (which is precisely what the voided-exit
  // card says: „върни се в кръговото и излез с пуснат десен мигач"). Inside
  // the ring is excluded by `d > enterRadiusM`, and the ring being BEHIND you
  // is excluded by the objective being done, so what is left is a car that
  // still has this roundabout to do and is not moving toward it.
  for (let i = Math.max(0, ctx.currentIndex); i < ctx.params.length; i++) {
    const p = ctx.params[i];
    if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") continue;
    const d = dist(tick.position, p);
    if (d > p.enterRadiusM && d <= p.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M) {
      return "roundaboutEntry";
    }
  }

  return null;
}

/**
 * Advance the lawful-wait hold by one frame.
 *
 * `holding` is true only while the car is at a FULL standstill
 * (FINISH_STANDSTILL_KMH — the same bar the stuck-rescue uses, so the two
 * cannot disagree about what „not moving" means) AND a reason above applies
 * AND the hold has not run past YIELD_WAIT_MAX_S. The engine freezes both
 * finish gates on exactly those frames.
 */
export function stepYieldWait(
  prev: YieldWaitState | undefined,
  tick: SimTick,
  ctx: YieldWaitContext,
): YieldWaitState {
  const base = prev ?? createYieldWait();
  const pedestrianCrossingIds = stepPedestrianCrossings(base.pedestrianCrossingIds, tick);

  const stationary = Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH;
  const reason = stationary ? yieldReasonAt(tick, ctx, pedestrianCrossingIds) : null;
  if (reason === null) {
    return { holding: false, sinceSec: null, reason: null, pedestrianCrossingIds };
  }

  const sinceSec = base.sinceSec ?? tick.t;
  // Past the ceiling the hold is spent: the gates resume and an abandoned tab
  // still ends. `sinceSec` is kept so the hold does not silently re-arm on the
  // next frame — only moving away from the yield (above) clears it.
  const holding = tick.t - sinceSec <= YIELD_WAIT_MAX_S;
  // The reason is published on every qualifying frame, INCLUDING the ones past
  // the ceiling: it states what the world is, and the world does not change
  // because a timer expired. Only `holding` is the gate — so the instructor's
  // voice, which reads `holding`, falls silent at exactly the moment the finish
  // gates resume and the session is on its way to ending.
  return { holding, sinceSec, reason, pedestrianCrossingIds };
}

/** Fresh gate: disarmed, outside, untripped. */
export function createFinishGate(): FinishGateState {
  return { armed: false, insideSinceSec: null, reachedAtSec: null };
}

/**
 * Where the WORK SITE stops and the band begins, meters — the inner edge of
 * the stranded face below.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-19 — `armWithinM` WAS DOING TWO JOBS, and it is only right for one.
 * C7 (FINISH_OUTSIDE_STUCK_S) read the band as everything past `armWithinM`,
 * on the reading that the arming circle IS the work site. That is true of the
 * two anchors it was measured on and FALSE of the third:
 *
 *   · `passSignal`  arm = the objective's acceptance ring (a circle CONTAINING
 *     the junction), radius = arm + FINISH_OUTSIDE_ANNULUS_M. Band = the
 *     margin exactly.
 *   · `roundabout`  arm = `enterRadiusM` (a circle CONTAINING the ring — the
 *     shipped rb-mini ring is r 18 inside a 24 m arm). Band = (enter, exit],
 *     authored, and wider than one margin.
 *   · `threePointTurn`  arm = `Math.min(halfWidthM, halfLengthM)` — the
 *     INSCRIBED circle of the corridor, the only anchor whose arm is smaller
 *     than its own work site. The box's outer bound is the CIRCUMradius, which
 *     is what `finishAnchor` builds `radiusM` from. So the ring between the
 *     inscribed and circumscribed circles is AUTHORED CORRIDOR that C7 read as
 *     margin, and a student who paused there had his lesson closed at 75 s.
 *
 * MEASURED (doc 88 §4 N3, reproduced here over the compiled catalogue —
 * `sc-maneuver-3point@L1` corridor 8 × 12, arm 8, radius 22.422): a pose at
 * (0, 71.5) is d = 11.5 from the corridor centre and |dx| 0 ≤ 8, |dy| 11.5 ≤ 12
 * — INSIDE the authored box — and C7 ended the drive on it. `sc-maneuver-uturn
 * @L1` (15 × 14, arm 14) the same at (14.5, 76), d = 14.5 inside a halfWidth of
 * 15. Both are the exact refutation of the sentence „the arming circle's
 * interior is untouched, so B1 holds exactly as written".
 *
 * THE FIX IS TO SEPARATE THE JOBS, not to redefine either circle — the same
 * move the RUN-OUT block above had to make when one radius both awarded a
 * waypoint and ended a drive. `armWithinM` keeps its job (you cannot leave
 * somewhere you never reached, and the inscribed circle is the right
 * CONSERVATIVE evidence that a car was genuinely in the box). The band's inner
 * edge becomes its own statement.
 *
 * CENSUS over the compiled catalogue (808 rungs; the 108 "outside" zones
 * `routeFinishZone` + `terminalRescueZone` hand out):
 *      passSignal        10 zones,  0 changed — C7's 41–47 m closure is
 *                                   BIT-IDENTICAL (arm 40, radius 48,
 *                                   48 − 8 = 40). It is not being undone.
 *      threePointTurn    40 zones, 40 changed, inner edge +10.0 m worst
 *                                   (`sc-mv-uturn-ban`, corridor 30 × 40 m:
 *                                   arm 15 → circum 25) — the defect above.
 *      roundabout        58 zones, 48 changed, inner edge +5.0 m worst.
 *
 * (The turn-box row read „+6.4 m worst (8 → 14.422)" until 2026-08-19. That is
 * `sc-maneuver-3point`, the drill the two refuting poses came from — not the
 * worst rung in the catalogue. Re-measured over all 40 zones the worst is
 * +10.0 m, and it is written here as a number that was counted rather than the
 * one that happened to be in hand. Doc 88 R2 stands open against this file for
 * exactly that failure mode in the constant above; see it.)
 *
 * ---------------------------------------------------------------------------
 * 2026-08-19, O23 — AND THE INFERENCE ITSELF WAS THE REMAINING HOLE.
 *
 * „Never more than one margin deep into the region" is a BOUND on the work
 * site, not a statement of it, and using a bound where a fact belongs costs
 * exactly where the two differ: a `roundabout`'s authored band (enterRadiusM,
 * exitRadiusM] is wider than one margin on 48 of its 58 zones, so the inferred
 * inner edge `radiusM − 8` sat OUTSIDE the arm and handed (enterRadiusM,
 * radiusM − 8] — up to 5.0 m, `sc-rb-lane-choice` L1–L5 at enter 33 / exit 46
 * — back to no automatic ending at all. A car resting there is in neither
 * state: not in the region, so the departure dwell never runs; not in the
 * band, so the stranded face never runs. Its drive could not be closed by
 * anything in this module at any duration. All four roundabout lessons in the
 * sweep161 audit are among the drives that had to be ended with «Прекрати
 * урока».
 *
 * The zone now CARRIES its work-site bound (`RouteFinishZone.workSiteRadiusM`,
 * stated by each anchor, floored in `normalizeOutside`), and this function
 * reads it instead of inferring. The inference remains as the fallback for a
 * zone that does not carry one, so every hand-built zone and every recorded
 * session is bit-identical.
 *
 * WHAT CLOSING IT COSTS A STUDENT WHO IS STILL DRIVING — nothing, and that is
 * measured rather than argued. The reclaimed sliver is approach road short of
 * a ring the route has not finished, which is precisely `yieldReasonAt` case
 * 5's window: `d ∈ (enterRadiusM, enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M]`
 * returns `roundaboutEntry`, and over the compiled catalogue ZERO of the 58
 * ring zones have a departure circle outside that window — so every metre of
 * every ring band is inside B15's freeze. A student waiting for a gap is
 * therefore held for YIELD_WAIT_MAX_S (180 s) before this bar may start at
 * all, and the drive ends at 180 + 75 = 255 s of unbroken standstill instead
 * of never. The founder's own wait was 40 s.
 *
 * STILL OPEN, and B1's ruling rather than this function's doing: the work
 * site's INTERIOR has no automatic ending. It costs nothing on a ring (24 m
 * the student is working) or a turn box (the corridor he is turning in), and
 * on `sc-sig-green-wave` it is a 40 m disc, because `passSignal` has no
 * authored extent to state — see FINISH_OUTSIDE_STUCK_S.
 */
export function strandedBeyondM(zone: RouteFinishZone): number {
  const armWithinM = zone.armWithinM ?? zone.radiusM;
  const inner =
    zone.workSiteRadiusM ??
    Math.max(armWithinM, zone.radiusM - FINISH_OUTSIDE_ANNULUS_M);
  // Clamped in both directions, so a stated work site cannot break either
  // invariant this band rests on: never inside the arming circle (B1 — the
  // interior of the work never ends a drive), never outside the departure one
  // (a band wider than the region would delete the stranded face entirely).
  return Math.min(Math.max(inner, armWithinM), zone.radiusM);
}

/**
 * Advance the gate by one frame.
 *
 * ARMING. A lesson may SPAWN inside its own finish zone (a lot drill can begin
 * a few metres from the bay it ends in). The gate therefore stays disarmed
 * until the vehicle has been observed on the OTHER side of the threshold at
 * least once — you cannot arrive somewhere you never left, and you cannot
 * leave somewhere you never reached. Arming is geometry only, at any speed.
 * For an "inside" zone that means one frame outside `radiusM`; for an
 * "outside" zone, one frame within `armWithinM`.
 *
 * TRIPPING. Once armed, `zone.dwellSec` continuous seconds of QUALIFYING
 * presence in the finish region — and at/below `zone.maxSpeedKmh` when the
 * zone demands a stop — latch `reachedAtSec`. Any disqualifying frame restarts
 * the count. The latch is permanent: the engine ends the session on that same
 * frame, and nothing can un-finish a finished drive.
 *
 * STRANDED (2026-08-18). An "outside" zone has a SECOND qualifying state, and
 * it is the one it shipped without: armed, at a full standstill, and IN THE
 * ANNULUS — past the arming circle, short of the departure one. That is a car
 * that has reached the work site, left it, and then stopped in the margin this
 * module draws around it; it will never reach the region, because reaching the
 * region is what it has stopped doing. It counts against FINISH_OUTSIDE_STUCK_S
 * instead of `zone.dwellSec`; see that constant for the audit the bar is
 * measured from. Motion in the band still qualifies for nothing at all — every
 * shuffle, hover and queue-nudge the band exists for is unaffected — and the
 * WORK SITE's interior is untouched, so B1's „standing still in the middle of
 * the work can never end a drive" holds exactly as written. (That sentence
 * used to say „the arming circle's interior", which doc 88 §4 N3 refuted for
 * the turn box, whose arm is inside its own corridor. `strandedBeyondM` is the
 * bound now and the zone states it — O23.)
 */
export function stepFinishGate(
  prev: FinishGateState,
  zone: RouteFinishZone,
  tick: SimTick,
): FinishGateState {
  if (prev.reachedAtSec !== null) return prev;

  const d = dist(tick.position, zone);
  const outsideMode = zone.mode === "outside";
  // The finish REGION, and the arming side of the threshold. For an "inside"
  // zone the two are exact complements (the shipped behaviour, unchanged);
  // for an "outside" zone the arming circle sits strictly within the region's
  // boundary, so the annulus between them is neither — passing through it
  // neither arms nor counts, which is what makes "entered the ring" mean it.
  const inRegion = outsideMode ? d > zone.radiusM : d <= zone.radiusM;
  const arming = outsideMode ? d <= (zone.armWithinM ?? zone.radiusM) : d > zone.radiusM;
  const armed = prev.armed || arming;

  // The stranded face, above — THE BAND ONLY, never the work site it guards.
  // B1's rule there is not being amended: standing still in the middle of the
  // work still cannot end a drive, at any duration (`route-finish.test.ts`
  // pins two motionless minutes on the ring). The band is not the work site —
  // it is the margin this module draws around it — and a car resting in a
  // margin is the one case with nowhere to go. `strandedBeyondM` is where the
  // work site stops; see it for why that is not `armWithinM`.
  //
  // The two dwells are geometrically exclusive but ADJACENT at `radiusM`, and
  // one clock times both — so the FACE the clock belongs to is remembered
  // (`dwellFace`) and a change of face restarts it. Until 2026-08-19 it did
  // not: the sentence here read „a clock could in principle be carried across
  // it, but only by a car that crosses the whole band without once exceeding
  // FINISH_STANDSTILL_KMH … and would have spent this bar where it stood",
  // and both halves of that are wrong. A car does not have to CROSS the band
  // to carry the clock — it only has to have stood in it and then leave, and
  // it has not spent this bar, because the bar it was spending is 75 s while
  // the one it arrives with is 20. Concretely: stand still just inside the
  // departure circle for FINISH_LEAVE_S, then drive out, and the drive ends on
  // the frame the circle is crossed rather than FINISH_LEAVE_S after it — the
  // twenty seconds B1 gives a student to notice an unsignalled roundabout exit
  // and swing back in, spent before he leaves. Doc 88 §4 N3 carried this as
  // „one class of drive ending 20 s early" with the replay not in hand; it is
  // the class, and `dwellFace` is what removes it. See types.ts for why the
  // fix is a label rather than a second clock (B15's freeze clears exactly one
  // field, and a second clock would escape it).
  const stranded =
    outsideMode &&
    armed &&
    !inRegion &&
    d > strandedBeyondM(zone) &&
    Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH;

  if (!inRegion && !stranded) {
    // Outside the finish region entirely — moving, or beyond both faces. Clears
    // the running visit AND both accumulators: this is the pose that says the
    // student is driving again, and neither bar should remember anything.
    return armed === prev.armed &&
      prev.insideSinceSec === null &&
      !prev.regionDwellSec &&
      !prev.strandedDwellSec
      ? prev
      : { armed, insideSinceSec: null, reachedAtSec: null };
  }

  if (!armed) return prev; // still sitting where the drive started

  // In the region, but rolling through one that asks to be stopped in:
  // present, not arrived. (Reverse reads negative — compare the magnitude.)
  if (zone.maxSpeedKmh !== undefined && Math.abs(tick.speedKmh) > zone.maxSpeedKmh) {
    return prev.insideSinceSec === null && prev.armed === armed
      ? prev
      : { armed, insideSinceSec: null, reachedAtSec: null };
  }

  const dwellFace: "region" | "stranded" = inRegion ? "region" : "stranded";
  const dwellSec = inRegion ? zone.dwellSec : FINISH_OUTSIDE_STUCK_S;

  // TWO ACCUMULATORS, ONE RUNNING VISIT. Each face banks the seconds actually
  // spent on it; `insideSinceSec` times only the visit in progress. A face
  // change BANKS the visit that just ended and starts the other face's visit at
  // this frame — so a car straddling the departure circle accumulates on both
  // and reaches a bar, instead of resetting the single clock forever, and a car
  // that leaves a face and returns much later resumes from what it earned
  // rather than from the wall clock. See types.ts for the pose that measured it.
  const sameFace = prev.dwellFace === dwellFace;
  const runningSince = sameFace ? prev.insideSinceSec : null;
  const closedVisit =
    !sameFace && prev.insideSinceSec !== null ? Math.max(0, tick.t - prev.insideSinceSec) : 0;
  const bankedRegion = (prev.regionDwellSec ?? 0) + (dwellFace === "stranded" ? closedVisit : 0);
  const bankedStranded = (prev.strandedDwellSec ?? 0) + (dwellFace === "region" ? closedVisit : 0);
  const bankedHere = dwellFace === "region" ? bankedRegion : bankedStranded;

  const since = runningSince ?? tick.t;
  const elapsedHere = bankedHere + (tick.t - since);
  const next = {
    armed,
    insideSinceSec: since,
    dwellFace,
    regionDwellSec: bankedRegion,
    strandedDwellSec: bankedStranded,
  };
  if (elapsedHere >= dwellSec) {
    return { ...next, reachedAtSec: tick.t };
  }
  // Identity when genuinely nothing moved, so the caller's `=== prev` checks
  // still short-circuit on the common frame.
  return sameFace &&
    runningSince !== null &&
    prev.armed === armed &&
    (prev.regionDwellSec ?? 0) === bankedRegion &&
    (prev.strandedDwellSec ?? 0) === bankedStranded
    ? prev
    : { ...next, reachedAtSec: null };
}
