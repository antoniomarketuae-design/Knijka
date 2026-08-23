/**
 * Scenario templates — the ROUNDABOUT family, shelf 2, DATA ONLY in the
 * templates.ts mold: coordinates are denormalized from the committed district
 * file (rb-ped-v1) so nothing loads world JSON at runtime; the trace-gate and
 * district batteries assert every pinned value against the generated map.
 *
 * Shelf 1 (templates-roundabout.ts) grades the ring itself: the entry yield,
 * the exit indicator, ring priority, the two-lane lane choice. This shelf opens
 * with the half of the roundabout duty that all of them stop short of — WHAT IS
 * ON THE OTHER SIDE OF THE EXIT.
 *
 * (Corrected 2026-08-03: this shelf used to cite „ЗДвП чл. 50а" for roundabout
 * priority. чл. 50а is the blocked-junction rule — „Забранено е навлизането в
 * кръстовище дори и при разрешаващ сигнал на светофара…" — and says nothing
 * about roundabouts; no statutory roundabout-priority rule exists in ЗДвП or
 * ППЗДвП. The entry duty comes from Наредба № РД-02-21-1/23.11.2023 чл. 61,
 * ал. 5 „Пътен знак Б3 не може да се поставя на входовете на кръгово
 * кръстовище" + ЗДвП чл. 50, ал. 1. See templates-roundabout.ts's header.)
 *
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
 * SWEEP 161, 2026-08-18 — WHAT THE FRAMES SAID, so the next reader does not
 * re-litigate this shelf from the verdict lines alone.
 *
 * THE HEADLINE IS NOT IN THIS FILE. Three BROKEN findings were routed here, two
 * critical, both of the shape „not one of the three tasks is ticked in any of
 * the four legs; the careful drive (7 full stops, 2 lawful waits) is stamped
 * НЕИЗДЪРЖАН 10 т. exactly like the 49 км/ч one". The cause is that the sweep's
 * driver HAS NO STEERING: tools/mobile/lesson-audit.mjs actuates
 * `page.keyboard[down|up]("KeyW")` and `…("KeyS")` and nothing else — a census
 * of the whole harness returns zero KeyA / KeyD / Arrow* tokens. So it leaves
 * the south arm and drives onto the central island, which is exactly what
 * mobile-right/04-t065s photographs: grass filling the windscreen, the coach
 * card reading «Интервалът беше добър · Изчака 24 с и влезе — и при влизането
 * не беше отчетено нарушение на предимството», and the collision billed five
 * seconds later. The signature is family-wide and file-independent, counted off
 * the sweep's own logs: 20 of 20 legs across the five roundabout drills that
 * have one collided, against 24 of 98 pc-right legs sweep-wide.
 * s-w6-bot-completion.test.ts is what says this drill grades — the authored
 * drive completes all three objectives through the real session with zero
 * violations at 3★.
 *
 * WHAT THE FRAMES DID EXPOSE HERE, fixed at the two `success` rows below and
 * held by roundabout2-title-truth.test.ts — both are the same crime in the two
 * directions the founder ranks equally: a gate that credits the act its own
 * title forbids.
 *   · sc-rbp-past-east sat ON the east mouth, so the car that TOOK the first
 *     exit collected «Подмини първия изход и остани в кръга»;
 *   · sc-rbp-pocket was authored for L3 and the L1/L2 ladder widened it out of
 *     the pocket at both ends — into the ring band and past the zebra.
 * Each row records its own arithmetic.
 *
 * REPORTED RATHER THAN TOUCHED (all outside this file):
 *  · The Part-G finding „no give-way markings, no roundabout sign, no lane
 *    arrows" is refuted by the frame it cites: mobile-right/04-t001s shows Б1
 *    (inverted triangle), the blue roundabout sign and the 40 limit on the
 *    south approach, with the broken give-way transverse across the mouth in
 *    04-t044s. What IS true is that the Б2-shaped triangle on the EAST arm
 *    renders untextured grey (same frame, right edge) — a scene/renderer row.
 *  · The lawful-wait card freezes its own text: mobile-right shows «Стоиш вече
 *    15 секунди» unchanged five seconds apart, and pc-right shows the identical
 *    «Чакаш правилно» card at t=22 s and t=92 s — 70 s later, with the car
 *    pinned after a collision. A stale card read as a live instruction is what
 *    made the harness hold for 90 s. That is advisor.ts / the HUD card queue.
 *
 * THE STEERED RE-DRIVE, 2026-08-22 (.audit-frames/rebase/frames/
 * sc-rb-ped-exit__{mobile,pc}-right, serving 70bcd1ba, tree clean) — the
 * paragraph above was an argument; this is the measurement, and it settles two
 * of the three rows.
 *
 *  · «no task ticked in any leg» IS the harness, and the frames now say so
 *    without inference. The wheel was live on both legs (mobile: left 152 px
 *    ≈5.3°, right −150 px ≈−5.2° against a 1.4° floor) and both legs still
 *    drove STRAIGHT: witness path 68.9 m net 68.6 m, straightness 0.996. The
 *    guidance samples end at (x −0.30, y −15.8) and stay there for ten seconds —
 *    r = 15.8 against an island kerb at r = 13.94, i.e. the car crossed the ring
 *    band without turning and put its nose into the mound. 04-t045s photographs
 *    it: grass filling the windscreen at 0 км/ч. «Удар в неподвижно
 *    препятствие» is the correct bill for that drive, and three unticked tasks
 *    are the correct sheet for a car that performed none of the three acts.
 *    What the sweep could NOT say and this file now can: the drill is passable
 *    and discriminating on EVERY rung, not only the L3 the bot-completion test
 *    drives — the committed shadow completes 3/3 with zero violations, passed,
 *    3★ at L1-L5 (measured 2026-08-23; the sweep's four legs are all L1).
 *  · «a stationary NPC parked across the exit never moves» is refuted at HEAD.
 *    The B15 stopped-witness release (RB_WITNESS_STOPPED_NEAR_M, runners.ts)
 *    landed after the sweep. pc-right/04-t049s has the circulator mid-ring on
 *    the left and 04-t054s, five seconds later, has an EMPTY ring; mobile-right
 *    entered on a real gap and was told «Интервалът беше добър · Изчака 10 с и
 *    влезе». What survives is only the card: «Чакаш правилно» stayed up for
 *    45 s after the ring had cleared, twice. That is the advisor row above, not
 *    a staging row — the car comes.
 *  · The Part-G row is refuted by its own frame in the re-drive too: 04-t001s
 *    shows the Б1 triangle and the blue roundabout disc textured and legible,
 *    with the arm's edge and centre lines painted; 04-t040s shows the broken
 *    give-way transverse across the mouth. Its last clause — „the pedestrian
 *    the lesson is named for is not visible" — is true of those frames for a
 *    trivial reason (the car never reached the ring, so she was never
 *    released), but chasing it is what found the defect this shelf DID fix:
 *    see RB_PED_CROSSER's `triggerEtaSec` note.
 *
 * AND THE SAME CLAUSE, CHASED ONE ROUND FURTHER, 2026-08-23. „She was never
 * released" turned out to be true of a real student too, not only of a harness
 * that never arrived. The release for anyone under `minTriggerSpeedKmh` is the
 * PRODUCT `floor × triggerEtaSec` metres, and at 8 × 10.0 that was 22.2 m — so
 * a student who idles up the exit spoke in D, with no throttle at all, reached
 * the pocket after she had crossed and stepped up, was credited «Спри в джоба»,
 * passed at 3★, and was told nothing, because nothing had happened. Both dials
 * are now sized against the gate the drill credits rather than inherited (10.0 m
 * for both walkers), which puts the whole creep band inside the covered range;
 * roundabout2-encounter-clock.test.ts §7 drives it at 2.6 / 3.0 / 4.0 км/ч and
 * is red on the shipped values. Each spec records its own arithmetic.
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
/** Half the drawn ring lane (8.125 / 2) — so the circulatory carriageway runs
 *  r ∈ [13.94, 22.06], the two edges world/__tests__/rb-ped-district.test.ts
 *  pins as RING_INNER/RING_OUTER_EDGE_M. */
const RING_LANE_HALF_M = 4.06;
/**
 * The ring point halfway between the exit that is SKIPPED (east, ring angle 0°)
 * and the exit that is TAKEN (north, 90°) — 12.73, 12.73, i.e. 13.78 m of chord
 * from each mouth. The east gate lives here; see the row for why it may not
 * live on the mouth itself.
 */
const MID_ARC_X = 12.7279;
const MID_ARC_Y = 12.7279;
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
 * triggerDistM 30 is the OUTER bound of the release — never earlier than this.
 * The runner fires when the player is within 30 m of the crossing (euclidean,
 * runners.ts `dist`) and still approaching it, which measured off the committed
 * shadow is ring angle φ = 20.5° at t = 31.45 s: just past the east mouth, the
 * driver committed to the ring, still reading the circulating car, and NOT yet
 * peeled off. (It used to say φ ≈ 105° here. That number was wrong by 84° of
 * ring and the direction of the error mattered — it made the encounter look
 * four times tighter than it is, which is exactly the reading under which the
 * dial below looks unnecessary. roundabout2-encounter-clock.test.ts now
 * measures the release angle off the recording instead of asserting it.) She is
 * on the carriageway 1.33 s later, in the player's lane at 11.5 s, clear of it
 * at 14.9 s.
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
 *
 * ── AND METRES ALONE ARE NOT A CLOCK (2026-08-23) ─────────────────────────────
 *
 * `triggerEtaSec` is the shipped fix for a hazard that CAREFUL DRIVING
 * SUPPRESSES (contracts.ts; sc-zebra-approach in templates-flow.ts took it
 * first, after the founder photographed the end state — a car stopped at 0 км/ч
 * in front of an empty zebra with the coach card congratulating him for
 * yielding to nobody). 30 m is a DISTANCE and her walk is a CLOCK: she needs
 * 14.9 s to clear the carriageway at 1.2 m/s, so on the raw gate the slower the
 * student drives the less of the hazard he gets. This drill is the worst
 * geometry in the catalog for that and was never opted in:
 *
 *  · every instruction in it asks for LESS speed — «намали преди входа», the
 *    ring's turn-detector envelope, and a bar the world prints across the lane
 *    reading «задачата иска ≤20»;
 *  · the taught act is exactly the drive encounter-battery.test.ts calls „the
 *    founder's photograph" — ease down, STOP SHORT of the paint, and wait;
 *  · and the stop is short BY DESIGN: `sc-rbp-pocket`'s own centre is
 *    hypot(4.06, 4) = 5.70 m from the paint and the L1 disc reaches 9.30 m out,
 *    while the below-floor backstop (`DART_CREEP_RELEASE_M`) is a flat 8 m. So
 *    a student who crawled the ring under the 8 km/h floor could collect «Спри
 *    в джоба между кръга и пътеката», sit at 0 км/ч, and watch nothing happen —
 *    with no fault, no commendation and nothing for the debrief to explain.
 *
 * 10.0 s is chosen from the PICTURE it guarantees, and every number in it is
 * this spec's own:
 *   · she is `speedMps × 10` = 12.0 m along the walk when the car reaches the
 *     paint, whatever speed it came in at ON [8, 10.8) km/h — the band where
 *     the seconds actually bind. From start.x −9.73 that is x = +2.27
 *     — INSIDE the student's own outbound lane (x 0…8.125), 1.8 m short of the
 *     line his bonnet tracks. Not „somewhere on the paint": in his path.
 *   · 30 / 10 = 10.8 km/h is where the two gates cross. AT OR ABOVE it the
 *     authored 30 m still binds, so the committed shadow (12 km/h ring pace,
 *     8.72 s from the paint when it reaches the gate) and both mistake demos
 *     release exactly where they always did and every recording is byte-
 *     identical. BELOW it the seconds bind — and that is precisely the band
 *     this briefing asks him to drive in.
 *   · under the 8 km/h floor the same rule at the floor speed gives
 *     2.222 × 10 = 22.2 m of release radius. That number has to beat one
 *     specific distance: the far edge of the compiled pocket gate, 9.30 m from
 *     the paint at L1 (8.10 at L3-L5). 22.2 > 9.30, so a crawling student is
 *     released while the pocket is still AHEAD of him instead of behind.
 *
 * WHAT THIS DOES NOT CLOSE — stated here because the first draft of this note
 * claimed it did („no longer any way to be credited with the pocket, however
 * timidly, including creeping the whole ring and stopping dead, without meeting
 * her"). That sentence was false, and false in the reassuring direction.
 *
 * Below the floor `dartFloorReleaseM` evaluates the horizon at the FLOOR speed
 * rather than at the player's, so the release becomes a FIXED radius again and
 * the metres-versus-clock arithmetic restarts with a bigger number. At the
 * shipped floor of 8 km/h that radius was 2.222 × 10 = 22.2 m, and driven
 * against the real runner and the committed district — at rest inside the
 * compiled L1 pocket — she was still on the carriageway only down to roughly:
 *     · 3.4 km/h at the pocket's ring-side edge (y 22.4, 8.62 m from the paint)
 *     · 4.3 km/h at its centre                  (y 26.0, 5.70 m)
 *     · 5.2 km/h at its zebra-side edge         (y 29.6, 4.08 m)
 * and below that she had finished and stepped up before he came to rest — the
 * founder's photograph again, one gear slower.
 *
 * THAT HOLE IS NOT A CORNER CASE, and the product says so itself: `vehicle/
 * difficulty.ts` holds the beginner throttle ceiling in full below
 * `CREEP_CAP_FULL_KMH` = 4 km/h and fades it out by 12, i.e. 0-4 км/ч is the
 * band the sim's own vehicle model calls a CREEP — the speed a student reaches
 * by taking his foot off everything and letting the automatic idle him forward.
 * The whole of it sat inside the hole, on the one approach whose briefing
 * spends two sentences telling him to slow down and whose HUD prints
 * «задачата иска ≤20» across the lane.
 *
 * ── AND THE FLOOR IS THE OTHER HALF OF THE DIAL (2026-08-23) ─────────────────
 *
 * The paragraph above used to end „AND NO VALUE OF THIS FIELD CAN [close it],
 * which is why the row is filed rather than re-tuned", and it argued the walls
 * correctly for `triggerEtaSec` ALONE: the crossover 30/eta × 3.6 must stay
 * under the 12 km/h ring pace to keep the recordings byte-identical, so
 * eta > 9.0 s, so the below-floor radius ≥ 2.222 × 9 = 20 m — and a LARGER
 * radius releases her EARLIER, the wrong direction for a crawler.
 *
 * What that argument never examined is the 2.222, which is
 * `minTriggerSpeedKmh` in m/s. The below-floor radius is a PRODUCT of the two
 * authored fields, and 22.2 m was nobody's decision — it fell out of a floor
 * chosen against the ring pace multiplied by a horizon chosen against the
 * carriageway. Size it deliberately and the hole closes from this file:
 *
 *   floor 3.6 km/h × 10.0 s = EXACTLY 10.0 m of below-floor release radius.
 *
 * 10 m is the smallest radius that still covers the gate this drill credits.
 * The far edge of the compiled pocket is 9.30 m from the paint at L1 (8.70 at
 * L2, 8.10 at L3-L5), and a student halted anywhere inside that disc must have
 * somebody to wait for, so the radius may not go under it; every metre above it
 * is a metre of head start she does not need. 10.0 leaves 0.70 m of margin and
 * nothing else. Measured at the worst credited stop — the zebra-side edge of
 * the L1 disc, y 29.6, where he travels furthest from the release radius before
 * coming to rest — she is now on the carriageway down to 2.11 km/h instead of
 * 5.19 (1.97 at L2, 1.82 at L3-L5): the whole throttle-free creep band is
 * inside the covered range, with 2.8 s to spare at its 2.6 km/h bottom.
 *
 * WHAT LOWERING THE FLOOR DOES NOT DO, checked in both directions:
 *   · it cannot move a committed recording. Branch 1 of the release ANDs
 *     `speedKmh >= minTriggerSpeedKmh`, so LOWERING it can only ever admit
 *     drives that were previously excluded — and the shadow and both mistake
 *     demos are at ring pace (12 km/h) when they first come inside the 30 m
 *     gate, above the old floor and the new one alike. Branch 2's radius
 *     shrinks 22.2 → 10.0, which can only release LATER, and no recording
 *     reaches the crossing under 8 km/h. The trace gate proves it.
 *   · it does not weaken the „nothing steps out in front of a parked car"
 *     property the contract names: that is the 10 m radius, and the give-way
 *     line this drill starts from is 66 m from this crossing (the ring's south
 *     mouth alone is 48), and the spawn 123.
 *   · it takes nothing from the fast half of the band. At and above the
 *     10.8 km/h crossover the authored 30 m still fires, unchanged.
 *
 * WHAT IT COSTS. Between 3.6 and 8 km/h she is now released on the player's own
 * speed (branch 1) instead of on the flat 22.2 m — later, and proportionally,
 * which is the whole point of the field. And a student who comes to rest
 * BETWEEN 10 m and 22.2 m of the paint — i.e. stopped in the ring band, the
 * fault instruction 4 exists to name — no longer gets her released while he
 * sits there. He gets her the moment he moves on into the pocket, which is
 * where the lesson wanted the encounter in the first place.
 *
 * WHAT IS STILL NOT CLOSED, stated because the first draft of the note above
 * over-claimed and that is how the residue survived a round. `dartFloorReleaseM`
 * is still speed-BLIND below the floor: a fixed radius, so the covered range
 * still has a bottom (2.11 km/h here) rather than none. That bottom is now
 * under the whole 0-4 км/ч band the vehicle model calls a creep, so it is no
 * longer reachable by driving carefully — but the general row is
 * unchanged and remains an orchestrator/runners.ts one: the below-floor branch
 * wants a radius tied to the hazard's own walk, not to the speed floor.
 *
 * The claims above are measured in roundabout2-encounter-clock.test.ts §7,
 * driven through the real `PedestrianDartOutRunner` against the real committed
 * district at 2.6 / 3.0 / 4.0 km/h — all three of which are RED on the shipped
 * floor of 8. The shared encounter battery still probes at
 * `minTriggerSpeedKmh × 0.8`, which is why it never showed this: that formula
 * follows the floor down and can never sit outside the covered band.
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
  // The floor is HALF the below-floor release radius (see the note above):
  // 3.6 km/h = 1.0 m/s exactly, so radius = 1.0 × triggerEtaSec = 10.0 m —
  // 0.70 m outside the widest compiled pocket gate and not a metre more. It
  // must stay under the ~12 km/h ring pace (a floor above it would misfire on
  // the taught drive) and above 3.35 km/h (below that the radius stops
  // covering the L1 pocket and a credited stop can meet nobody).
  minTriggerSpeedKmh: 3.6,
  triggerEtaSec: 10.0,
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
 *    then moves off into the one they did not. Released at 18 m — measured on
 *    the shadow's ring line that is φ ≈ 56°, on the north-east arc as the exit
 *    peel begins (the old note said φ ≈ 145°, the same 84°-class arithmetic
 *    error the walker's note carried) — at 2.1 m/s she overtakes the walker and
 *    reaches the player's lane FIRST, ~9.6 s after the walker's release.
 *
 * SHE NEEDS HER OWN CLOCK, and it is not the walker's. `triggerEtaSec` is
 * inherited by the spread above, and the horizon is a distance ONLY once it is
 * multiplied by a speed — hers is 2.1 m/s against the walker's 1.2, so the same
 * seconds buy a different picture. On the walker's 10.0 s she is
 * 2.1 × 10 = 21.0 m along her walk when the car reaches the paint, against a
 * roadway that ENDS at `roadToM` 17.85: she has stepped up onto the far
 * pavement and the crossing reads clear, which is the sc-zebra-approach defect
 * verbatim — a dial that is present, documented, and delivers an empty zebra.
 * That is the wall `roundabout2-encounter-clock.test.ts` §3 measures, and it is
 * what picks her value.
 *
 * (Until 2026-08-23 this paragraph argued from a different wall — that the
 * walker's floor-speed radius, then 2.222 × 10 = 22.2 m, overshot her own 18 m
 * `triggerDistM` and collapsed the dial back onto raw metres. True at the time
 * and false now: the walker's floor is 3.6 km/h, so her inherited radius would
 * be 10.0 m, well inside 18. Both walls picked 6.0 s; only the one above still
 * stands, and a note that keeps a retired argument is a note that will be
 * trusted for the wrong reason.)
 *
 * 6.0 s puts her crossover at 18 / 6 = 10.8 km/h — the same speed as the
 * walker's, so both stay purely additive above the taught ring pace and both
 * bind together below it. At the paint she is 2.1 × 6 = 12.6 m along her walk,
 * x = +2.87: in the student's own lane, like the walker, but arriving there
 * sooner.
 *
 * AND SHE NEEDS HER OWN FLOOR TOO, for the same reason and by the same
 * arithmetic. `minTriggerSpeedKmh` is spread in from the walker, and the
 * below-floor release radius is `max(DART_CREEP_RELEASE_M, floor × eta)`: the
 * walker's 3.6 km/h against her SHORTER 6.0 s horizon gives a PRODUCT of 6.0 m,
 * which the runner's 8 m creep backstop then clamps UP to 8.0 — still INSIDE
 * the 9.30 m far edge of the compiled L1 pocket, so a student halted at the
 * ring end of the pocket would wait for a sprinter who never starts. (Corrected
 * 2026-08-24: the clamp is `Math.max(DART_CREEP_RELEASE_M, …)` in runners.ts,
 * so 8.0 m is the number the runner uses, not the bare 6.0 m product an earlier
 * draft of this paragraph asserted. The conclusion is unchanged — both are
 * under 9.30 — but a note that states a radius the code does not use is a note
 * the next round will re-derive from and get wrong.)  6.0 km/h × 6.0 s puts her
 * back on the same deliberately-sized 10.0 m radius the walker uses, still well
 * inside her own 18 m outer gate, so the dial is not decoration on the one rung
 * whose whole subject is a second person he did not see.
 *
 * AND THE TRADE IS REAL, so it is stated rather than implied: on the inherited
 * floor her clamped 8.0 m radius would cover a LOWER creep band than her own
 * 10.0 m does (~2.75 km/h at L1 against 3.70), because a nearer release is a
 * later one. What it would NOT cover is the far end of the pocket the drill
 * credits — 9.30 m — so the student who does exactly what «Спри в джоба» asks,
 * at its ring-side edge, would meet nobody at all. A gate the drill credits may
 * not be a gate the hazard skips; that is the wall, and it costs the bottom
 * ~0.95 km/h of her band to honour it.
 *
 * WHAT THAT BUYS AND WHAT IT DOES NOT. She is quick — clear of the carriageway
 * 17.85 / 2.1 = 8.5 s after release against the walker's 14.9 — so the crawl
 * band she covers is necessarily narrower: driven at rest at the pocket's
 * zebra-side edge she is on the carriageway down to ~3.7 km/h (was ~5.2 on the
 * inherited floor). Below that the L5 student meets the WALKER instead, who is
 * staged at every rung and covered to 2.11 km/h — so he never arrives at a bare
 * zebra, he only loses the second-person twist. That is the honest claim, it is
 * the one roundabout2-encounter-clock.test.ts §7 asserts, and 9.30 m is the
 * wall that stops the radius going lower to close the rest.
 *
 * Physics stays dry (ADR-006 opt-in discipline): the authored ghost envelope is
 * dry-tuned, and `conditions.weather` dresses the scene without re-tuning it.
 */
const RB_PED_CROSSER_SPRINT: PedestrianDartOutSpec = {
  ...RB_PED_CROSSER,
  id: "sc-rbp-crosser-sprint",
  speedMps: 2.1,
  triggerDistM: 18,
  // NOT inherited: the below-floor release radius is
  // max(DART_CREEP_RELEASE_M 8, floor × eta), and the walker's 3.6 against this
  // shorter horizon gives a 6.0 m product that the backstop clamps up to 8.0 —
  // still inside the 9.30 m pocket the drill credits. 6.0 × 6.0 s = 10.0 m.
  minTriggerSpeedKmh: 6.0,
  triggerEtaSec: 6.0,
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
      // ── THE GATE USED TO SIT ON THE MOUTH THE TITLE FORBIDS TAKING ────────
      //
      // Shipped as a disc at the east node (18, 0) r6, and both clauses of the
      // sentence were collectable by the drive that did neither, because
      // `stepReachZone` credits a PATH THAT CROSSES the disc (the swept
      // waypoint test, objectives.ts) — and a car peeling off down the east arm
      // crosses the east mouth at exactly the ring pace the car staying in the
      // ring does. Taking the first exit is not an exotic cheat: it is THE
      // classic roundabout error, the one instruction 3 spends a sentence
      // forbidding («Подмини първия изход (изток) мълчаливо»). Driven at all
      // five rungs in roundabout2-title-truth.test.ts („the first exit taker
      // does not collect the rung that forbids taking it"), which is red on the
      // shipped params and green on these.
      //
      // 45° OF RING IS WHAT MAKES THE SENTENCE MEASURABLE, and the arithmetic
      // is the whole of the choice. Both arms are 16.25 m wide, so each mouth's
      // opening in the ring's outer edge ends at atan2(8.125, √(22.06² −
      // 8.125²)) = ±21.6° of ring angle. A disc centred at 45° with r = 4.06
      // spans 45 ± asin(4.06/18) = 32.0°..58.0°: clear of the east opening by
      // 10.4° and of the north one by the same, so the only way through it is
      // to have stayed on the carriageway between the two exits. The peel-off
      // drive's closest approach to it is 13.54 m — three discs away.
      //
      // AND r = 4.06 IS THE RING LANE'S OWN HALF-WIDTH, which makes the second
      // clause literally true at the graded rungs: 18 ± 4.06 = [13.94, 22.06]
      // is the circulatory carriageway exactly, so the disc IS a slice of the
      // ring — inscribed, touching both kerbs, favouring no line. A learner
      // hugging the outer edge (r = 21) and one cutting the island (r = 15) are
      // both 3.0 m from the centre and both credited; that pair is driven in
      // the same file so no future tightening can manufacture a false failure
      // out of a legal lane position. (The L1/L2 ladder multiplies the radius
      // by 1.5/1.25 — `DEFAULT_LEVEL_TOLERANCE` — so the aided rungs spill up
      // to 2.03 m onto verge and island kerb at 45°. There is no exit and no
      // lane there, and the mouth clearance above survives the widening with
      // 3.6° to spare, which is the property the test asserts per rung.)
      //
      // maxSpeedKmh 20 is unchanged: the ring's own envelope on R = 18 (a
      // brisker circulation trips the turn detector — see the trace script's
      // window arithmetic), not a slow-down demand.
      params: {
        kind: "reachZone",
        x: MID_ARC_X,
        y: MID_ARC_Y,
        radiusM: RING_LANE_HALF_M,
        maxSpeedKmh: 20,
      },
    },
    {
      id: "sc-rbp-pocket",
      titleBg: "Спри в джоба между кръга и пътеката",
      // THE POCKET, gated as an objective: rb-ped-v1's clear span runs from the
      // circulatory carriageway's outer edge (r = 22.06) to the zebra (y = 30).
      // The zone is centred at (4.06, 26) — the pocket's middle on the outbound
      // lane, r = 26.32 from the island — so it cannot be satisfied from inside
      // the ring band NOR from beyond the crossing. maxSpeedKmh 6: this rung is
      // passed by STOPPING there, which is the sentence the whole template
      // teaches, and 6 is at or under REACH_ZONE_HALT_CAP_KMH (8), the band
      // `params.ts widenSpeedCap` refuses to widen on any rung.
      //
      // ── THE RADIUS IS AUTHORED FOR L1, NOT FOR L3 — sweep 161 ─────────────
      //
      // It shipped as 3.6, which fits the pocket at the rungs that compile it
      // unchanged and NOWHERE ELSE. `params.ts widenRadius` multiplies an
      // authored radius by `DEFAULT_LEVEL_TOLERANCE` (L1 1.5, L2 1.25) under a
      // budget that only ever looks at the NEXT ZONE — it knows nothing of
      // kerbs or paint — so 3.6 became 5.4 at L1, and the disc then reached
      // r = 20.92 (1.14 m INTO the ring band) and y = 31.4 (1.4 m PAST the
      // zebra). On the beginner rung, therefore:
      //   · a car stopped in the ring — the fault instruction 4, the teach text
      //     and the examiner note all name («там ще запушиш кръга за всички зад
      //     теб») — collected «Спри в джоба между кръга и пътеката»;
      //   · so did a car stopped BEYOND the crossing, i.e. the drive the
      //     mistake demo below bills as PEDESTRIAN_NOT_YIELDED.
      // Both are driven at L1 in roundabout2-title-truth.test.ts and are red on
      // 3.6.
      //
      // 2.4 is the largest authored radius whose WIDEST rung still fits: L1
      // compiles it back to exactly the 3.6 disc that shipped — 26.32 − 3.6 =
      // 22.72 ≥ 22.06 and 26 + 3.6 = 29.6 ≤ 30 — and L3-L5 grade on 2.4, which
      // is 0.66 m of margin to the ring and 1.6 m to the paint. Nothing
      // legitimate is refused by the tighter disc: a 4.3 m car whose tail is
      // clear of the ring band and whose nose is short of the paint has its
      // centre in y ∈ [23.83, 27.85], and the 2.4 disc covers y ∈ [23.6, 28.4]
      // on this lane — the whole legal window, with the committed shadow's own
      // stop (4.1, 27.0) sitting 1.0 m from the centre. That direction is
      // driven too, at every rung, in the same file.
      //
      // …AND THE RADIUS ALONE IS NOT ENOUGH, because a halt gate is not just
      // its disc. `stepReachZone` concedes an arrival to a car HALTED anywhere
      // in the capsule stretched radius + REACH_ZONE_GRACE_M (5 m) back down
      // the approach — „stopping short of a mark is stopping there, done
      // earlier", which is right nearly everywhere and wrong HERE: five metres
      // short of this pocket is inside the roundabout. That is why the stop at
      // (4.06, 20.6) was credited at L1 even after the radius was fixed.
      //
      // `acceptBeforeMarkM` is the shipped lever for exactly this, and its
      // documented sign convention states the geometry outright: it is the
      // SIGNED offset from the PAINT to the authored mark, and the paint here
      // is the exit zebra 4 m ahead of the mark ⇒ −4. It does two things at
      // once and the ladder carries it through untouched at every rung
      // (params.ts: „an aided rung forgives a student who stops early; no rung
      // forgives one who stops past the line"):
      //   · the far side is cut AT THE ZEBRA — stated rather than left to the
      //     radius arithmetic, which at L1 clears the paint by only 0.4 m;
      //   · the capsule keeps its length and SLIDES forward, so its back end
      //     comes to radius + 1 m instead of radius + 5. Driven down the taught
      //     exit line, the stop at (4.06, 20.6) — a car half in the ring, its
      //     nose barely past the band's outer edge — measures 4.87 m back along
      //     the capsule axis against bounds of 3.4 m at L3-L5 and 4.6 m at L1:
      //     refused on every rung, by 1.47 m at the graded ones and 0.27 m on
      //     the aided one.
      //
      // WHAT IS LEFT, and it is not this file's to close. The capsule is
      // radius + 5 m long against a pocket 7.94 m deep, so its worst-case reach
      // behind the mark on a TILTED approach is √(r² + (r + 1)²) — 4.16 m at
      // the graded rungs, but 5.84 m once L1 multiplies the radius by 1.5,
      // which is 1.5 m inside the ring band. No authored radius closes that
      // without also refusing a car that stopped correctly two metres off the
      // lane centre (driven, both directions, in the same file). The remainder
      // is an objectives.ts row: the grace capsule cannot see the kerb it is
      // reaching over.
      params: {
        kind: "reachZone",
        x: X_ARM_LANE,
        y: 26,
        radiusM: 2.4,
        maxSpeedKmh: 6,
        acceptBeforeMarkM: -4,
      },
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
    lawRef: "ЗДвП чл. 119, ал. 1; чл. 50, ал. 1; чл. 28, ал. 1, т. 2",
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
