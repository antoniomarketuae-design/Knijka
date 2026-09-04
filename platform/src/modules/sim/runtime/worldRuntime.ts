/**
 * sim/runtime — WorldRuntime implementation over district-v1.json.
 *
 * The logic layer between the 3D scene and the pedagogical rule engine:
 * geometry adjudication (lane fix, stop lines, crossing zones, turns, signal
 * phases) happens here; law/pedagogy stays in rules/engine.ts.
 *
 * Scene-loop integration (per render frame):
 *   1. physics step (Rapier)                → VehicleSample
 *   2. runtime.update(dtSec)                → signal phases advance
 *   3. tick = runtime.sample(v, tSec, night)→ authoritative SimTick
 *   4. reduceTick(ruleState, tick)          → violations / commendations
 * `pushCollision` may be called by physics contact handlers at any point
 * before sample(); the events drain into the next tick, in push order, each
 * carrying the body id its reporter supplied (see `QueuedContact`).
 *
 * Event order within one tick: collisions, mirrorGlance, stopLineCrossed,
 * turnStarted, crossing-zone events.
 *
 * Pure TypeScript — no React/three/Rapier imports (vitest-safe, ADR-002).
 */

import type {
  SignalLampState,
  SignalPhase,
  SignalPlanSpec,
  VehicleSample,
  WorldRuntime,
} from "../contracts";
import type { SimTick, SimTickEvent } from "../rules/types";
import {
  BG_URBAN_DEFAULT_KMH,
  parseDistrict,
  worldEdgeClearanceM,
  type District,
} from "./district";
import { Locator } from "./locator";
import { DistrictIndex, makeEdgeHit, OFF_ROAD_DISTANCE_M } from "./spatial";
import { bearingDeg, signedDeltaDeg } from "./geometry";
import {
  SignalController,
  type ControllerFigureState,
  type SignalClusterInfo,
  type SignalClusterMode,
  type SignalControllerSchedule,
} from "./signals";
import {
  buildStopLines,
  roundaboutGiveWayReachM,
  type StopLine,
  type StopLineSet,
} from "./stoplines";
import { CrossingZoneTracker, type PedestrianQuery } from "./zones";
import { buildLaneArrowSpans, laneArrowAt } from "./laneArrows";
import { JUNCTION_AREA_RADIUS_M, TurnDetector } from "./turns";
import {
  makeSurfaceFix,
  resolveDistrictDrivableSurface,
  surfaceAt,
  OFF_CARRIAGEWAY_BODY_ALLOWANCE_M,
  type DrivableSurface,
  type SurfaceFix,
} from "./surface";
import type { District as WorldDistrict } from "../world/types";
// The PAINTER'S OWN gate, imported rather than mirrored — see
// `worldStatesOneWayStreets` below for why the detector has to ask it.
import { scenarioSignScale } from "../world/builders/zoneSigns";
// THE BELT'S OWN gate, imported for the same reason as the painter's above: the
// card the shell raises at the rim has to describe the world the builder
// actually built, not a world it was written against.
import { districtHasWorldRimBelt } from "../world/builders/worldRim";

/** A stop line can re-fire only after this long (jitter at the line must not
 * spam RED_LIGHT_CROSSED; a genuine re-approach takes longer anyway). */
const STOP_LINE_REFIRE_SEC = 5;

/** How far ahead on the current edge the next-stop-line context reaches, m. */
const NEXT_LINE_WATCH_M = 120;
/** Junction-proximity context radius (harsh-brake cause gate), m. */
const JUNCTION_CONTEXT_RADIUS_M = 80;

// ---------------------------------------------------------------------------
// THE SURFACE CONSULT (sweep161 — „the car left the road and nothing noticed")
// ---------------------------------------------------------------------------
//
// THE TWO FRAMES. Both were routed here, and they are ONE defect:
//   · sc-ov-oncoming-gap / mobile-wrong / 04-t146s.png — 97 км/ч on a
//     featureless grey plane, no road, marking or boundary anywhere, HUD still
//     asserting «90 · знакът важи». No off-route stop, no reset, no penalty.
//   · sc-ln-turn-lane-arrows / pc-right / 04-t064s.png — the ego on bare
//     ground with the junction's buildings floating at the far edge, while
//     01-arrival on the SAME run shows the district fully painted (lane lines,
//     М10 arrows, kerbs, pavements, a 50 sign). The map is not missing; the
//     car is off it, and again the sim says nothing.
//
// THE CAUSE — this runtime had no way to ask whether there is asphalt under
// the car. `locator.ts` calls 30 m from every CENTRELINE off-road, and that is
// a lock-ACQUISITION radius, not a kerb. Measured on the two frames' own maps:
//
//   ov-oncoming-v1  carriageway ends at |x| ≈ 12.1 m and at y = 900;
//                   (4.06, 902) is 2 m off the asphalt, (4.06, 929) is 29 m
//                   off — and the locator still hands back edge `ovg-e-road`,
//                   lane 0, maxspeed 90 and PAINTED markings for every one of
//                   those points.
//   ln-arrows-v1    (20.31, −152) — 2 m past the south arm's end — is already
//                   off the asphalt, same lock, same fabricated facts.
//
// So between the kerb and the 30 m ring the runtime states, as fact, that a car
// standing in a field is in a lane with paint around it, and the reducer bills
// «Неустойчиво движение в лентата» for drifting off the middle of a lane that
// is not there (the -1 второстепенна in the mobile-wrong debrief, t129s/t134s).
//
// WHAT CHANGES HERE. `runtime/surface.ts` (its own slice) reads the asphalt the
// world builder actually laid, triangle for triangle. sample() now consults it
// every frame and does exactly three things with the answer:
//   1. when the car's whole flank is past the kerb it publishes
//      centreLinePainted/laneLinesPainted = FALSE — the doc-86 T1 contract's
//      own polarity ("the world builder painted NOTHING here"), applied to the
//      one place where the answer is beyond argument;
//   2. it publishes `edgeId: null` — see the block below, which is the half
//      that reaches the student;
//   3. it exposes the measurement through `surfaceUnderCar` so the layer that
//      OWNS convictions can grade it.
//
// ---------------------------------------------------------------------------
// (2) THE ROAD-MEMBERSHIP CHANNEL IS ANSWERED BY THE ASPHALT — 2026-08-24
// ---------------------------------------------------------------------------
//
// WHY THE TWO FRAMES STAYED OPEN AFTER (1) AND (3) SHIPPED. The paint nulling
// closed the −1 «Неустойчиво движение в лентата» billed at t129s while the ego
// was INSIDE a roadside building — a wrongful conviction retired, and worth it.
// `surfaceUnderCar` closed nothing, because it is an imperative getter and,
// measured across the whole platform, its callers are: this file's own test.
// Neither touches what both findings actually say — «no off-route stop, no
// reset, no penalty», and «ended naturally with 0 of 3 objectives done» after
// a hundred-odd seconds on bare ground. The measurement was being made every
// frame and thrown away.
//
// THERE WAS ALREADY AN ENDING WAITING FOR IT, and it was waiting on the wrong
// witness. `lessons/finish.ts` `stepOffNetwork` + `offNetworkEndingCopy` close a
// drive that is off the network for OFF_NETWORK_STUCK_S = 75 s, and
// `lessons/engine.ts` folds them (armed 7404468). Its evidence is
// `SimTick.edgeId === null`, and until this change the ONLY thing that produced
// that null was `locator.ts`: further than OFF_ROAD_DISTANCE_M = 30 m from
// every road CENTRELINE. That is a lock-ACQUISITION radius. Measured on the two
// findings' own maps, on a 2 m grid over each district's bbox + 60 m:
//
//   ov-oncoming-v1  14,659 poses get an edge handed back; 8,796 of them (60.0%)
//                   have NO asphalt under them. Cross-section at y = 400: the
//                   carriageway ends at x = 12.125 m, footway to ≈ 14 m, verge
//                   beyond — and the locator answers `ovg-e-road`, lane 0,
//                   maxspeed 90 for every metre of it out to x = 30.
//   ln-arrows-v1    8,517 locked, 3,588 of them (42.1%) off the asphalt.
//
// So a car in the verge, on the footway, on a roundabout island or inside a
// roadside building is „on the network" for as long as it stays inside that
// skirt, the 75 s clock never starts, and the drive runs until the harness (or
// the student) gives up. That is finding B's whole shape: `sc-ln-turn-lane-
// arrows / pc-right` is painted road at t032s, bare ground at t064s, and still
// running at t172s against a wall with 0 of 3 objectives done.
//
// SO `edgeId` NOW MEANS WHAT ITS CONTRACT SAYS. `SimTick.edgeId` is documented
// „`null` means off-road/unknown", and `rules/engine.ts`'s act latch spells the
// same reading out — „`null` IS A SEGMENT ANSWER … i.e. „this car is nowhere"".
// The claim is unchanged; only the witness is better. `fix.edgeId` still governs
// everything the LANE FIX is for (see below) — this is one channel, and it is
// the one three consumers read as „is the car in the authored world".
//
// NOT THE SAME THING AS MAKING THE LOCATOR GO NULL, and the difference is the
// whole reason this is one line rather than a threshold change. `locator.ts`'s
// own header lists what goes quiet when the FIX goes null: `laneCount` → 1,
// `maxSpeedKmh` → the district default, `wrongWay` → false, no М10 arrow and no
// authored ban / paint / rail / curve span consulted at all. Off the asphalt
// that would be an amnesty — exactly the „fix that takes something away" this
// programme has already shipped once. The lane fix is left standing; only the
// membership answer is re-witnessed.
//
// THE FALSE-REFUSAL EXPOSURE IS SMALLER THAN THE ONE IT REPLACES, and that is
// the half that had to be measured before arming anything, because an ending
// that closes a correct drive is the founder's own complaint manufactured by an
// instrument. Swept on all 105 shipped districts:
//   · 57,000 travel-lane centres AND kerbside parking-band centres — worst
//     `outsideKerbM` 0.000 m. Not „under the bar": zero.
//   · all 248 authored spawn points — 0.000 m.
//   · all 117 authored parking BAY centres in every lot/pk/vu district
//     (the deepest is lot-par-v1's parallel slot at 6.28 m off the aisle
//     centreline) — 0.000 m, `under: "carriageway"`. A student who parks
//     perfectly and sits in the bay is on drawn asphalt, so the clock never
//     starts. This was the one way this change could have been catastrophic.
//   · 78,132 tightest-legal kerb-hug poses (body just inside the ribbon edge) —
//     3 read off-carriageway, all on ONE 4 m stretch of d2-v1 `e1056871739.1`,
//     worst 2.73 m. Isolated poses cannot make 75 CONTINUOUS seconds.
// Against that, the incumbent 30 m rule leaves 0.645 m of headroom along the
// entire kerb band of district-v1's five-lane boulevard
// (`__tests__/off-network-headroom.test.ts` measures it). The asphalt referent
// is strictly the safer of the two in the acquitting direction as well as the
// convicting one.
//
// WHAT THIS COSTS, NAMED RATHER THAN HIDDEN. `rules/engine.ts` suppresses a
// pedestrian-crossing pass when the crossing's `hostEdgeId` and `tick.edgeId`
// are two different STRINGS; a null is „unknown", so a car fully off the
// asphalt sweeping past a SIDE street's zebra is graded where it used to be
// acquitted. Narrow (the zebra on the car's own road matched already, so its
// behaviour is unchanged) and pointing at a conviction worth defending — a car
// on the pavement beside an occupied zebra. Named here because a fix that only
// counts what it adds is how round 1 deleted a commendation.
//
// WHAT DELIBERATELY DOES NOT CHANGE. `maxSpeedKmh`, `wrongWay`, `laneId`, the
// zone flags and every опасна channel stay exactly as shipped off the asphalt.
// Silencing them would trade a wrong charge for NO charge — the 97 км/ч in
// finding A's own frame must still be a conviction, not a shrug. The remaining
// replacement, an OFF_CARRIAGEWAY violation code that says so at the KERB
// instead of 75 s later, needs `rules/types.ts` + `rules/engine.ts` + the
// violation catalogue and is routed in the report accompanying this change.
//
// ── THAT REPLACEMENT LANDED, AND `wrongWay` IS NOW THE ONE EXCEPTION ────────
// 2026-08-31. `OFF_CARRIAGEWAY` exists (catalog + Н38 basis + the detector in
// `rules/engine.ts`, arming on the very `edgeId === null` this block ships), so
// the premise of the paragraph above — „a wrong charge or NO charge" — is no
// longer the choice on offer off the asphalt. `wrongWay` is carved out at the
// `const wrongWay` line below, with the measurements; everything else in the
// list stands exactly as written, because for the others the paragraph is still
// true. Read the two together: the ruling did not reverse, its premise expired.
//
// COST, measured on this box:
//   resolve  105 shipped districts in 320 ms total — median 0.4 ms, every
//            scenario micro-map ≤ 15 ms, and only the two OSM districts are
//            expensive (district-v1 86.6 ms, d2-v1 122.4 ms at ~20k asphalt
//            triangles). Once per runtime, lazily, on the first sample().
//   query    0.6 µs on the road, 2.4 µs out in the field, per tick.
// `setDrivableSurface` lets a caller that already built the world geometry
// (LessonScene builds it for the renderer anyway) hand the index over and skip
// the rebuild entirely.

/**
 * The car's centre this far past the kerb ⇒ the whole flank is off the road,
 * m. Not a new number: `surface.ts` derives it from the chassis half-width
 * plus the deliberately-drivable kerb, and states that the THRESHOLD belongs to
 * the consumer. This is that consumer, and it uses the number unchanged.
 */
const OFF_CARRIAGEWAY_M = OFF_CARRIAGEWAY_BODY_ALLOWANCE_M;

/**
 * Resolved surfaces, keyed on the district DOCUMENT. A lesson restart, a retry
 * and the whole runtime test suite hand the same parsed object to
 * `createWorldRuntime` again and again; without this each of them pays the
 * resolve (86 ms on district-v1) afresh. Weak, so a district that goes out of
 * scope takes its index with it. `null` is a cached FAILURE — a document the
 * builders cannot sweep must not be retried once per runtime either.
 */
const surfaceByDistrict = new WeakMap<object, DrivableSurface | null>();
/**
 * Amber adjudication (B1a, doc 72 JU-06): at the green→yellow flip the
 * runtime freezes the last green-frame snapshot (distance to line + speed);
 * a comfortable stop was possible iff the frozen distance exceeds
 * reaction distance + comfortable-brake distance, with a safety margin so
 * only clear gambles grade — the true dilemma zone stays innocent (A12).
 */
export const AMBER_REACTION_SEC = 1.0;
export const AMBER_COMFORT_DECEL_MPS2 = 3.0;
export const AMBER_STOP_MARGIN = 1.15;

/** Could the driver have stopped comfortably before the line? (exported for tests) */
export function comfortableStopPossible(distToLineM: number, speedKmh: number): boolean {
  const v = speedKmh / 3.6;
  const needed = (v * AMBER_REACTION_SEC + (v * v) / (2 * AMBER_COMFORT_DECEL_MPS2)) * AMBER_STOP_MARGIN;
  return distToLineM > needed;
}

/** Heading opposes the one-way's flow by more than this → wrong way. */
const WRONG_WAY_ANGLE_DEG = 120;

/**
 * DOES THE DRAWN WORLD STATE THIS DISTRICT'S ONE-WAY STREETS AT ALL?
 * (sc-ac-wind-truck-pass:71a28c54 — „the detector and the drawn world disagree
 * everywhere it fires".)
 *
 * THE ROW, AND WHY THE `offCarriageway` CARVE-OUT BELOW DID NOT CLOSE IT. That
 * line retired the bill on GRASS, and it was right to. But the row is a
 * CONSISTENCY row naming four lessons, and the two reproductions that survived
 * the w22 sweep are both on `d2-v1`, on drawn asphalt, where a carve-out keyed
 * on the kerb cannot reach: `sc-ed-d2-city-run / mobile-right` (run.log l.560,
 * −10 т., repeated in the debrief at l.1311) and `sc-ed-d2-priority-run /
 * pc-right` (l.614) — the second of them a MODEL drive convicted a 10-point
 * ОПАСНА, which on a 9-point sheet is an instant НЕИЗДЪРЖАН.
 *
 * MEASURED AT HEAD on the committed documents, by running the world builder
 * headlessly (`analyzeNetwork` + `buildProps`) over every district that has a
 * one-way street edge and counting the plates it actually posts:
 *
 *   district        one-way street edges   В1 / Д4 / Г2 / Г3 posted
 *   d2-v1                            125   0    0    0    0
 *   district-v1                      126   0    0    0    0
 *   the other nine (all scenario-*)   27   ≥ 1 В1 each; six also post a Д4
 *
 * and neither OSM district authors `meta.scenario.laneArrows`, so `laneArrows.ts`
 * resolves no М10 glyph there either. Driving 40 of d2-v1's one-way edges
 * against the flow at HEAD raises `wrongWay` on 40 of 40, on essentially every
 * tick, with `edgeId` non-null throughout. So on those two maps the runtime
 * fails a student for disobeying a statement the world never makes: no sign, no
 * arrow, nothing on the glass. That is the row, verbatim.
 *
 * THE WORLD'S SILENCE IS DELIBERATE AND IS NOT A BUG. `props.ts` gates its В1,
 * Д4 and Г2/Г3 passes on `scenarioSignScale` and says why in terms: „the OSM
 * city districts carry ~150 one-way mouths whose REAL signage the source data
 * never recorded, so posting there would trade a missing sign for an invented
 * one." Two producers, one fact, and only one of them held its tongue — the
 * audit C-4 shape exactly (`__tests__/priority-sign-agreement.test.ts`).
 *
 * SO THE DETECTOR ASKS THE PAINTER'S OWN QUESTION. This is the identical
 * `scenarioSignScale` call `props.ts:519` makes, imported rather than mirrored,
 * so the two cannot drift apart on the GATE. They could still drift if props
 * ever gained an UNgated one-way pass; the net for that is an agreement test in
 * the shape of C-4's, and it is routed with this change rather than written by
 * this lane.
 *
 * THEO-4 (doc 64) IS WHY THIS IS A DEFECT AND NOT A SCORING NIT. The card
 * explains «Движеше се срещу платното на еднопосочна улица» to a seventeen-year-
 * old who can look up and see no В1, no Д4 and no arrow anywhere on the street.
 * An explanation the student can refute out of the windscreen teaches him to
 * stop reading them — the identical argument the `offCarriageway` carve-out
 * below is built on, applied to the same code on the other side of the kerb.
 *
 * AND THE LAW NAMES THE SAME BOUNDARY (retrieved, not recalled — ADR-002; the
 * quotation `catalog.ts`/`n38.ts` already carry): Н38 прил. № 5, т. 10, б. „в"
 * bills the driver who „навлезе срещу движението на пътен възел или ПЪТ С
 * ЕДНОПОСОЧНО ДВИЖЕНИЕ". A street the world signs neither В1 nor Д4 nor an
 * arrow on has not been stated to be such a път to the person driving it.
 *
 * WHAT THIS COSTS, NAMED RATHER THAN HIDDEN, because an acquittal is a change
 * too. On `district-v1` and `d2-v1` a genuine wrong-way run up a one-way STREET
 * now bills nothing under this code — 251 edges of Sofia. Roughly half of them
 * (51/125 and 71/126, measured with props' own anti-parallel-twin test at 20 m)
 * are one carriageway of a DIVIDED road, where the median and the head-on
 * traffic DO state the direction even though no plate does, so the acquittal is
 * wider than the evidence that licenses it. That is the price of the two
 * producers agreeing at all, and the way to buy it back is to POST the plates,
 * not to grade harder: `oneway=yes` IS the source data's record of a real В1/Д4,
 * unlike the turn restrictions Г2/Г3 would need, so the props gate is arguably
 * over-broad for those two kinds. Routed to the props lane; not this file's.
 *
 * AND IF THAT LANE DOES UNGATE В1/Д4, COME BACK TO THIS FUNCTION — it reads the
 * GATE, not the placements, so it would go on acquitting a district that had
 * just started posting plates. That is the one direction this predicate can rot
 * in, it rots in the ACQUITTING direction, and it is written here rather than
 * hoped about: the fix is one line (ask `buildProps` for the district's plates,
 * as `surface.ts` already asks the road builders for its asphalt) and it costs
 * 60 ms on d2-v1, which is why it is not paid for a boolean today.
 *
 * ROUNDABOUT RINGS ARE EXCLUDED FROM THE STAND-DOWN, and the exclusion is
 * measured rather than defensive. `network.onewayNoEntryArms` and the Д4 pass
 * both skip `roundabout` edges by construction, so „this district posts no
 * one-way plate" says nothing whatever about a ring — and both OSM districts DO
 * sign theirs: one ring each, carrying 4 (d2-v1) and 2 (district-v1) Г12
 * «Кръгово движение» plates at its mouths, 49.3 m and 33.7 m from the centre.
 * A student sent the wrong way round a Sofia roundabout was told which way it
 * turns, so he keeps the conviction: those 12 + 6 ring edges still grade.
 *
 * A MOTORWAY CARVE-OUT WAS CONSIDERED AND DELIBERATELY NOT WRITTEN. Neither OSM
 * district has a single `motorway` edge (measured: 0 and 0), so it would have
 * been a branch no drive in the product can reach; and mw-v1, mw-entry-v1 and
 * mw-exit-v1 are scenario maps that post В1 at their mouths and pass this gate
 * on their own. The wrong way up an автомагистрала stays a conviction.
 *
 * WHAT DELIBERATELY DOES NOT CHANGE: `tick.oneway`. It is surface CONTEXT, and
 * `rules/engine.ts` arms the CROSSED_SOLID_LINE family on `tick.oneway === false`
 * — flipping it here would arm the осева detectors on one-way streets, which is
 * the „fix that takes something away" this programme has already shipped once.
 */
function worldStatesOneWayStreets(district: District): boolean {
  // `parseDistrict` returns the raw document unchanged, so this IS the
  // builder's own input — the same cast `drivableSurface()` makes below.
  return scenarioSignScale(district as unknown as WorldDistrict) !== undefined;
}

/**
 * RAIL PACK slice 1 (ADR-006 stage 3a — doc 72 RX-01/RX-02/RX-03): how far
 * BEFORE the authored track band (travel direction) the "approach" phase of
 * tick.railCrossing reaches, meters. The reducer requires a seen approach
 * before it will adjudicate a band entry, so a vehicle materialising ON the
 * band (teleport/spawn) is structurally innocent. Exported for tests.
 */
export const RAIL_APPROACH_M = 30;

/** railBarrierDownAt nearest-match radius: the arm prop stands ~3 m before
 *  the band + the curb offset (~9 m lateral); crossings on distinct maps sit
 *  hundreds of meters apart, so 60 m is unambiguous and forgiving. */
const RAIL_BARRIER_MATCH_M = 60;

/** Radius around a junction to look for conflicting priority traffic, meters.
 * Junction catchments grew with the perceptual road scale (mouths now sit
 * 17–43 m out) — exported for tests. */
export const PRIORITY_CONFLICT_RADIUS_M = 26;
/** Look-ahead for oncoming traffic when turning left, meters (scaled). */
export const LEFT_TURN_ONCOMING_RADIUS_M = 36;
/**
 * N1 left-turn-across-path adjudication (doc 72 JU-10 — „ляв завой срещу
 * насрещните", the top-ranked missing capability). The graded quantity is the
 * ACCEPTED GAP: seconds until the oncoming vehicle arrives, measured at the
 * player's turn commit. JU-10's evidence bar: turning across an oncoming
 * vehicle < 4 s away is THE taught mistake, and the fatal misjudgement is
 * "arrival by 1–2 s". Bands (A12 — err innocent):
 *  - gap ≤ CONVICT (2.0 s): the oncoming physically cannot avoid braking for
 *    the turner → FAILED_TO_YIELD („опасна", Н38 W:5). A left turn across
 *    takes ~2–3 s of the oncoming's lane, so a sub-2 s gap is a forced
 *    conflict, not a judgment call.
 *  - gap < ADVISORY (3.0 s): unsafe-but-legal — surfaced through the gapSec
 *    measurement channel for scenario rubrics, NEVER graded (founder ruling
 *    in the N1 build order).
 *  - gap ≥ SAFE (4.0 s): the JU-10 textbook norm — clean.
 */
export const LEFT_TURN_CONVICT_GAP_SEC = 2.0;
export const LEFT_TURN_GAP_ADVISORY_SEC = 3.0;
export const LEFT_TURN_GAP_SAFE_SEC = 4.0;
/**
 * Legacy-wiring fallback: when the installed OncomingQuery returns only a
 * boolean (no gap telemetry), conviction requires presence within this tight
 * radius instead — ≈ the sub-2 s band at archetypal urban closing speeds
 * (20 m at 36–50 km/h ≈ 1.4–2.0 s). Gap-aware wiring supersedes it.
 */
export const LEFT_TURN_CONVICT_RADIUS_M = 20;
/**
 * A convict-tight gap observed while the player was MOVING convicts a commit
 * within this many seconds (the oncoming may have emergency-braked or been
 * guard-stopped by the moment the 55° heading sweep registers the turn — the
 * examiner grades the cut, not the victim's rescue). Short enough that a
 * WAITING driver whose conflict passes nose-to-nose stays innocent: from
 * rest, building a 55° sweep takes well over 1.5 s.
 */
export const LEFT_TURN_GAP_MEMORY_SEC = 1.5;
/** Below this closing speed an "oncoming" makes no arrival claim (stopped at
 * ITS red / queue creep / turning away — all A12-innocent), m/s. */
const LEFT_TURN_MIN_CLOSING_MPS = 1.0;
/**
 * OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — „изпреварване срещу
 * насрещен", the head-on family; the N1 oncoming machinery composed with the
 * stage-2b bank-flip channel). The graded act: COMMITTED occupancy of the
 * opposing bank of a TWO-WAY road (tick.opposingBank — the locator's denoised
 * bank fix) while an oncoming vehicle's measured arrival gap is inside the
 * convict band. Gap = distM / closingMps of the most urgent oncoming (the
 * left-turn adjudicator's own quantity): seconds until the oncoming reaches
 * the player's position. NOTE the honest asymmetry: the player is ALSO
 * closing, so a measured 4 s is ≈ 2 s to the actual meeting at comparable
 * speeds — which is exactly why the overtake band sits at DOUBLE the JU-10
 * left-turn convict bar (2 s): the same physical margin, measured one-sided.
 * Bands (A12 — err innocent):
 *  - gap ≤ CONVICT (4.0 s) while committed at speed → OVERTAKE_INSUFFICIENT_GAP
 *    (опасна, Н38 „намеса"). A pass of a slow lead needs 6-10 s in the
 *    oncoming lane; being out with the oncoming under 4 measured seconds is
 *    the head-on gamble, not a judgment call.
 *  - 4-7 s: the advisory band — surfaced through the gapSec measurement
 *    channel for scenario rubrics, NEVER graded (the JU-10 founder ruling).
 *  - gap ≥ SAFE (7.0 s): clean — the textbook window.
 * THE ABORT IS SACRED (OV-08): a driver BRAKING out of the excursion within
 * the bounded reaction window (the C1/D1 yield discipline), or one who
 * returns to the own bank before the sustain matures, NEVER convicts — the
 * abort is the taught response, and grading it would teach „push on".
 * Structural exemptions:
 *  - solidCenterLine spans: the corridor lives on DASHED segments — inside an
 *    authored М1 span the act is CROSSED_SOLID_LINE's (one act, one code);
 *  - narrow two-way roads (≤ 1 marked lane): no marked banks exist — the
 *    narrow-meeting runner adjudicates who yields there (OV-14);
 *  - junction areas: a left turn sweeps the crossing road's opposing bank by
 *    geometry — that conflict is the JU-10 left-turn tracker's (OV-08's real
 *    junction-overtake case is deliberately out of scope this slice);
 *  - empty road (no oncoming inside the probe radius) = clean by silence.
 */
export const OVERTAKE_CONVICT_GAP_SEC = 4.0;
export const OVERTAKE_GAP_SAFE_SEC = 7.0;
/** Oncoming probe reach for the corridor, m — sized so the convict band is
 * detectable against fast rural oncoming (4 s × 25 m/s = 100 m ≪ 150). */
export const OVERTAKE_ONCOMING_RADIUS_M = 150;
/** Below this speed the driver is not COMMITTED (creeping/aborting/stopped on
 * the bank reads as anything but a pressed pass — err innocent), km/h. */
export const OVERTAKE_COMMIT_MIN_KMH = 20;
/**
 * Gap-memory latch (the JU-10 discipline, verbatim): a convict-tight
 * observation survives this long after the live query dissolves — the staged
 * oncoming may be GUARD-STOPPED by the player's own incursion (its closing
 * speed collapses under the arrival-claim floor), and the examiner grades the
 * gamble, not the victim's rescue.
 */
export const OVERTAKE_GAP_MEMORY_SEC = 1.5;
/**
 * OVERTAKE-RETURN adjudication (doc 72 §10 OV-09 — „ранно прибиране пред
 * изпреварения", the brake-forcing cut back: FO-03's cut-in, committed BY the
 * student). The graded act: the player completes a genuine PASS of a
 * same-direction vehicle during an opposing-bank excursion (saw the mate
 * genuinely AHEAD, then genuinely BEHIND — the VU-02 episode shape) and then
 * RETURNS to the own bank landing so close in front of it that the return
 * forces the mate's brake. The graded quantity is the LANDING GAP in seconds:
 * bumper distance behind the player / the mate's REFERENCE speed — the time
 * the overtaken driver has before reaching the returning car's position.
 * ЗДвП чл. 42 (bank-verified, manevri-i-izprevarvane: „връщаш се вдясно, БЕЗ
 * ДА ЗАСИЧАШ изпреварения — виждаш го целия в огледалото"; ал. 2 exists in
 * the law but is NOT bank-confirmable, so the honest cite stays чл. 42).
 * Bands (A12 — err innocent):
 *  - gap < CONVICT (1.0 s) at the return commit → OVERTAKE_RETURN_TOO_EARLY
 *    (основна): landing under a second in front of the overtaken vehicle IS
 *    the brake-forcing cut, not a judgment call;
 *  - 1.0–2.0 s: the honest TEACH band — under the taught mirror norm but
 *    graded silent (the VU-02 teach-band ruling: the grace is real, the copy
 *    teaches the norm);
 *  - gap ≥ SAFE (2.0 s): the textbook return — clean by silence.
 * THE REFERENCE-SPEED LATCH (the JU-10 "grade the gamble, never the victim's
 * rescue" discipline, pointed backwards): the mate's speed is LIVE-TRACKED
 * until the player's cut first enters the FORCING WINDOW (ahead of the mate
 * within FORCE_AHEAD, laterally inside FORCE_LATERAL — the staged
 * playerGuard's own geometry, widened so the latch always precedes the
 * guard's brake), then FROZEN:
 *  - a mate braking BECAUSE of the cut cannot acquit the cutter (the live
 *    dist/speed measure balloons mid-rescue; the frozen reference keeps the
 *    conviction honest);
 *  - a mate that slowed ON ITS OWN before any convergence keeps LOWERING the
 *    reference, which WIDENS the measured gap — the doc's named FP („the
 *    overtaken car slowing on its own must not convict") is structurally
 *    innocent.
 * Structural innocence:
 *  - no pass, no bill: an abort (never got ahead) produces no return event
 *    at all — the OV-08 sacred-abort shape, inherited;
 *  - the excursion dissolving for ANY reason other than a committed return
 *    to the own bank (junction area, edge loss, solid-span handoff, reverse)
 *    discards the episode silently;
 *  - a creeping return (at/under the corridor commit bar) never grades;
 *  - a mate under the arrival-claim floor makes no claim (parked/crawling —
 *    the LEFT_TURN_MIN_CLOSING discipline);
 *  - cyclist proxies never qualify (excluded at the traffic query — the
 *    cyclist pass duty is VU-02's lateral-clearance act; one act, one code);
 *  - ONE ACT, ONE CODE (the CROSSED_SOLID_LINE ruling): an excursion the
 *    corridor has ALREADY billed (OVERTAKE_INSUFFICIENT_GAP emitted) never
 *    re-bills at the return — the tight slot-back after a convicted gamble
 *    is the same act's tail (the sc-ov-abort demos' „metres to spare"), and
 *    the Н38 examiner marks the неправилно изпреварване once.
 * One bill per overtake: the adjudication is the episode's single terminal
 * event; a fresh excursion + pass + return is a fresh act and bills again.
 */
export const OVERTAKE_RETURN_CONVICT_GAP_SEC = 1.0;
export const OVERTAKE_RETURN_SAFE_GAP_SEC = 2.0;
/** Probe reach for the overtaken-mate query, m — covers the safe band at
 * rural speeds (2 s × 25 m/s = 50 m) with slack. */
export const OVERTAKE_RETURN_PROBE_RADIUS_M = 60;
/** Center-to-center body allowance converting to a bumper gap, m (hero half
 * length 2.02 + mate half ≈ 2.05 — the VU-02 point-geometry honesty). */
export const OVERTAKE_RETURN_BODY_M = 4.1;
/** Forcing window, mate frame: the player AHEAD of the mate within this… */
export const OVERTAKE_RETURN_FORCE_AHEAD_M = 20;
/** …and laterally inside this = any braking now answers the cut. Strictly
 * wider than the staged guard corridor (16 m / 3.0 m), so the latch always
 * fires before a guard rescue can taint the reference. */
export const OVERTAKE_RETURN_FORCE_LATERAL_M = 4.0;
/** Seen ahead/behind by at least this much (centers) = a genuine phase, m. */
const OVERTAKE_RETURN_PASS_MARGIN_M = 2;
/** Below this reference speed the mate makes no arrival claim, m/s. */
const OVERTAKE_RETURN_MIN_REF_MPS = 1.0;
/**
 * VULNERABLE-PASS tracker (doc 72 §7 VU-02 „Тясно изпреварване на колело" —
 * ЗДвП чл. 42: изпреварване на велосипедист само с ДОСТАТЪЧНА СТРАНИЧНА
 * ДИСТАНЦИЯ; the BG/EU taught norm ≈ 1.5 m of open air between bodies). The
 * graded act: the player OVERTAKES a same-direction cyclist proxy (closes from
 * behind, draws alongside within the longitudinal window, leaves it behind) and
 * the MINIMUM lateral distance during the alongside phase sits under the
 * convict bar — one bill per pass, adjudicated at pass completion.
 *
 * GEOMETRY HONESTY (the VehicleProfile point-based law): both the player and
 * the proxy are POINTS in this telemetry, so every threshold below is
 * CENTER-TO-CENTER lateral distance. The documented body allowance converts:
 * hero half-width 0.85 m (vehicle/tuning CHASSIS_HALF_EXTENTS.x) + an honest
 * ~0.4 m cyclist half-width (handlebar) = 1.25 m of bodies inside any
 * center-to-center measure. Bands (A12 — err innocent, doc 72: Н38 основна):
 *  - center < CONVICT (2.45 m ≈ 1.2 m of air) while passing at speed →
 *    VULNERABLE_PASS_TOO_CLOSE — genuinely squeezing, under every norm;
 *  - 2.45–2.75 m (≈ 1.2–1.5 m of air): the honest TEACH band — under the
 *    taught 1.5 m but graded silent (the JU-10 advisory-band ruling: the
 *    grace is real, the copy teaches the norm);
 *  - center ≥ SAFE (2.75 m ≈ 1.5 m of air): the textbook pass — earns the
 *    yielded commendation when a genuine alongside happened.
 * Structural innocence:
 *  - the traffic query is SAME-DIRECTION only (an oncoming cyclist is a
 *    meeting — different duty, never returned) and only staged cyclist
 *    proxies qualify (no shipped ambient agent can arm this);
 *  - junction areas disarm AND discard the episode (nearestIx gate — the
 *    right-hook family is the CyclistRightHookRunner's act, VU-01);
 *  - creeping/standing is exempt: only alongside frames at/above the pass
 *    floor record, and arming needs genuine closing from behind;
 *  - THE SWERVE STAND-DOWN: if the cyclist's OWN line drifts toward the
 *    player beyond the allowance mid-pass (pothole dodge — doc 72 VU-03's
 *    reality), the episode stands down entirely — the margin the driver SET
 *    is what's graded, never the margin the cyclist consumed;
 *  - a pass that got inside the contact bar is the collision machinery's act
 *    (VULNERABLE_PASS_CONTACT_M — one act, one code);
 *  - reverse maneuvering discards (A12).
 */
export const VULNERABLE_PASS_PROBE_RADIUS_M = 30;
export const VULNERABLE_PASS_BODY_ALLOWANCE_M = 1.25; // 0.85 hero + 0.4 proxy (doc above)
export const VULNERABLE_PASS_CONVICT_LATERAL_M = 2.45; // ≈ 1.2 m edge-to-edge
export const VULNERABLE_PASS_SAFE_LATERAL_M = 2.75; // ≈ 1.5 m edge-to-edge (the norm)
/** |forward offset| at/under which the pass is ALONGSIDE (bodies overlap:
 * hero half-length 2.02 + bike half-length ~1 + slack), m. */
export const VULNERABLE_PASS_ALONGSIDE_M = 5.5;
/** Cyclist ahead within this (and closing) arms the pass episode, m. */
export const VULNERABLE_PASS_ARM_AHEAD_M = 25;
/** Cyclist this far behind = the pass is complete → adjudicate once, m. */
export const VULNERABLE_PASS_DONE_BEHIND_M = 8;
/** Below this the player is creeping/queueing, not passing at speed — no
 * alongside frame records and nothing can convict, km/h. */
export const VULNERABLE_PASS_MIN_KMH = 15;
/** Arming needs the player genuinely closing from behind, m/s. */
export const VULNERABLE_PASS_MIN_CLOSING_MPS = 1.0;
/** The cyclist's OWN lateral drift toward the player (vs its line frozen at
 * arm) that stands the episode down — the VU-03 swerve reality, m. */
export const VULNERABLE_PASS_SWERVE_M = 0.6;
/**
 * At/under this centre distance the act is a CONTACT — the collision
 * machinery's code, never this one, m.
 *
 * WAS 2.2, "orchestrator CYCLIST_CONTACT_M parity". That parity was with an
 * isotropic 2.2 m circle, and when the orchestrator's contact test became exact
 * body geometry (2026-08-10, sim/collision) the two stopped meaning the same
 * thing: real bodies touch at 1.25 m of centres (the BODY_ALLOWANCE above —
 * 0.85 hero + 0.4 proxy), so a 2.2 m bar handed 0.95 m of genuine clear air to
 * a collision detector that — correctly — now says nothing about it. The worst
 * passes in the product would have graded SILENT.
 *
 * So the bar is the body allowance itself: zero air between bodies. The three
 * bands now read as edge-to-edge air end to end — 0 m contact, 1.2 m convict,
 * 1.5 m safe — instead of two of them meaning air and the third meaning a
 * circle. A squeeze at 1.9 m of centres is 0.65 m of air: it is
 * VULNERABLE_PASS_TOO_CLOSE, and it is not a «Пътнотранспортно произшествие».
 */
export const VULNERABLE_PASS_CONTACT_M = VULNERABLE_PASS_BODY_ALLOWANCE_M;

/** Distance to the junction node within which the right-hand-rule check arms,
 * meters (2× — the junction box itself is 2.5× wider). */
export const RHR_CORE_RADIUS_M = 18;
/** Above this speed the driver counts as entering (not creeping/yielding), km/h. */
const RHR_MOVING_KMH = 3;
/** At/below this speed while a conflict is present, the driver is yielding, km/h. */
const RHR_YIELD_KMH = 8;
/** Deceleration (m/s²) at/above which the driver counts as actively yielding
 * to a priority conflict — no violation fires mid-braking-response (C1). */
const YIELD_BRAKE_RESPONSE_MPS2 = 2.5;
/** D1 revision — the braking-response immunity is a REACTION window, not a
 * transit pass: it only suppresses conviction within this many seconds of
 * the conflict becoming visible. Any lawful urban speed (≤ 52 km/h) brakes
 * to a stop inside 3 s at the band's own threshold response (≥ 4.8 m/s² is
 * an ordinary firm stop; the C1 innocent shells brake harder still), so a
 * driver STILL moving through the conflict zone this long after seeing the
 * conflict is crossing it, not yielding — the D1 probe convicted a barger
 * riding a steady 3 m/s² brake clean across the core under C1's unbounded
 * band (right-hand-rule.test.ts / roundabout.test.ts D1 guard-rails). */
const YIELD_BRAKE_RESPONSE_MAX_SEC = 3.0;
/** Seconds a barge condition must hold before it convicts — staged "late"/
 * "tight" conflicts can be BORN with the driver already in the zone at
 * speed; a human needs reaction time before the brake shows (C1). A real
 * barger holds the condition far longer than this while crossing. */
const YIELD_CONVICT_SUSTAIN_SEC = 0.9;
/** Azimuth sweep around the roundabout centre that marks the vehicle as
 * circulating (ring priority) — entry grading stands down after this (C1). */
const RB_ON_RING_DEG = 35;
/**
 * How far beyond a roundabout's ring a driver counts as COMMITTED to entering,
 * meters (entry mouths widened with the perceptual road scale).
 *
 * This is the CONVICTION geometry and nothing else: inside it a barge can be
 * billed and the sustain clock may start; outside it the tracker watches and
 * says nothing. It is deliberately still bolted to the ring rather than to the
 * paint — the observation zone moved out to the give-way marking (see
 * `roundaboutGiveWayReachM`) and widening the place a driver can be CONVICTED
 * along with it would have manufactured exactly the fault that fix repairs: a
 * driver still braking toward the line, forty metres out, convicted because the
 * clock had been running since before he could see the ring.
 */
const ROUNDABOUT_ENTRY_MARGIN_M = 12;
/** Extra reach beyond the ring for the circulating-traffic band, meters —
 * circulating NPCs now ride lane centers ~4 m off the ring centerline. */
const ROUNDABOUT_BAND_EXTRA_M = 9;
/**
 * Minimum inward component of the driver's heading (unit) to count as ENTERING
 * rather than circulating tangentially — guards against flagging a driver who
 * already holds priority on the ring.
 */
const ROUNDABOUT_INWARD_MIN = 0.3;

/**
 * True when a vehicle heads against a one-way street's flow. `tangent` is the
 * geometry-forward unit direction at the vehicle's position (index.tangentAt);
 * headingDeg is 0 = north, clockwise. Two-way edges never flag (overtaking into
 * the oncoming bank is legal there).
 */
export function isWrongWay(
  oneway: boolean,
  tangent: readonly [number, number],
  headingDeg: number,
): boolean {
  if (!oneway) return false;
  const forwardDeg = bearingDeg(tangent[0], tangent[1]);
  return Math.abs(signedDeltaDeg(headingDeg, forwardDeg)) > WRONG_WAY_ANGLE_DEG;
}

type CollisionWith = "vehicle" | "pedestrian" | "cyclist" | "staticObject";

/**
 * ONE QUEUED CONTACT REPORT — the category AND, when the reporter knows it,
 * the BODY.
 *
 * `bodyId` is the whole reason this is a record rather than a bare string.
 * The queue used to carry only the category, so every contact that arrived
 * through the live physics channel reached the rule engine anonymous, and the
 * engine's per-body episode key had nothing to key on: it fell back to a
 * per-KIND latch and two different bodies struck inside
 * `collisionSeparationSec` billed once. MEASURED on the shipped reducer
 * (fixtures at 45.9 км/ч, `COLLISION` rows counted off the debrief):
 *
 *   two ANONYMOUS vehicle reports 1.0 s apart …… 1 bill   ← the defect
 *   the same two, NAMED wreck-a / wreck-b …………… 2 bills
 *   thirteen NAMED reports on ONE body over 6 s … 1 bill  ← still one accident
 *   a clean drive ………………………………………………………………… 0
 *
 * `undefined` therefore means «this reporter cannot name what it hit», not
 * «nothing was named»: it keeps the per-category behaviour byte-identically,
 * which errs toward ONE bill (A12) rather than toward a false second.
 */
interface QueuedContact {
  readonly withWhat: CollisionWith;
  readonly bodyId: string | undefined;
}

/** Is there a conflicting (crossing/oncoming) moving vehicle near (x,y)? */
export type JunctionConflictQuery = (
  x: number,
  y: number,
  radiusM: number,
  approachBearingDeg: number,
) => boolean;

/**
 * N1 (doc 72 JU-10): approach telemetry of the most urgent oncoming vehicle —
 * distance + closing speed, so the left-turn adjudicator grades the accepted
 * gap in SECONDS. Structurally satisfied by the traffic module's
 * OncomingApproach without a cross-module type import.
 */
export interface OncomingConflict {
  distM: number;
  closingMps: number;
  /**
   * Is it a RAIL vehicle (tram/train in the carriageway)? Structurally the
   * traffic module's `OncomingApproach.rail`. Read ONLY to publish
   * `SimTick.oncomingRailGapSec` — the N1 adjudication below is identical for
   * a tram and a car, because чл. 37, ал. 1 already convicts the cut; what
   * changes is what the INSTRUCTOR may say while the student is standing there
   * (ЗДвП чл. 8, ал. 2 — a rail vehicle is let through, not gapped past).
   */
  rail?: boolean;
}

/**
 * Is there an oncoming vehicle ahead (for turning left across it)? The N1
 * tracker probes in the CONFLICT FRAME: (px, py) is the junction node and
 * headingDeg the player's approach heading frozen at visit start, so the
 * returned distance/closing measure the oncoming's arrival at the conflict
 * point regardless of how far the player's nose has swept into the turn.
 * Rich return (`OncomingConflict` / null) enables gap-in-seconds
 * adjudication; the legacy boolean form stays accepted — presence-only, with
 * conviction falling back to the tight-radius probe (see
 * LEFT_TURN_CONVICT_RADIUS_M).
 */
export type OncomingQuery = (
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
) => boolean | OncomingConflict | null;

/**
 * Is there a vehicle approaching from the player's right near a junction?
 *
 * `playerSpeedKmh` is the student's own approach speed, and it is what lets the
 * answer be about a MEETING rather than mere presence: a wiring that forwards
 * it drops vehicles that clear the node before he arrives, or arrive long after
 * he is through. A wiring that ignores it (the parameter is optional, so a
 * six-argument lambda still type-checks) gets the presence-only answer — see
 * `traffic/system.ts conflictFromRightFor` clause (6).
 */
export type RightConflictQuery = (
  jx: number,
  jy: number,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
  playerSpeedKmh?: number,
) => boolean;

/** Is a vehicle already circulating a roundabout (approaching entry from the left)? */
export type CirculatingQuery = (
  cx: number,
  cy: number,
  px: number,
  py: number,
  headingDeg: number,
  bandRadiusM: number,
) => boolean;

/**
 * VU-02 (doc 72 §7): the nearest SAME-DIRECTION cyclist proxy near the player
 * — live pose telemetry for the vulnerable-pass lateral tracker. Structurally
 * satisfied by the traffic module's CyclistApproach without a cross-module
 * type import (the OncomingConflict discipline).
 */
export interface CyclistConflict {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
}

/** The nearest same-direction cyclist proxy within radiusM, or null. */
export type CyclistQuery = (
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
) => CyclistConflict | null;

/** Phase + seconds-to-change read model (B1a N2 director API). */
export interface SignalPhaseInfo {
  phase: SignalPhase;
  timeToChangeSec: number;
}

export interface DistrictWorldRuntime extends WorldRuntime {
  /**
   * B1a N2 — signal-phase director API. `signalPhaseInfo` reads phase +
   * time-to-change for the lamps facing `approachBearingDeg` (omit for the
   * node's own axis-group); `setSignalClusterOffset` pins a cluster's phase
   * offset (staged exams at session start, the amber runner on approach);
   * `signalOffsetForPhaseStart` computes the offset that makes `phase` start
   * in `inSec` seconds for that approach.
   */
  signalPhaseInfo(signalNodeId: string, approachBearingDeg?: number): SignalPhaseInfo;
  setSignalClusterOffset(signalNodeId: string, offsetSec: number): void;
  signalOffsetForPhaseStart(
    signalNodeId: string,
    approachBearingDeg: number,
    phase: SignalPhase,
    inSec: number,
  ): number;
  /**
   * Set a signal cluster's control MODE (doc 72 JU-09/JU-20 — the sibling of
   * setSignalClusterOffset). "dark"/"flashingAmber" make the junction behave as
   * UNCONTROLLED: no signal codes fire on its stop lines, and the right-hand-
   * rule tracker governs it. Deterministic session-start dial; "live" (default)
   * = the shipped signalized behavior exactly.
   */
  setSignalClusterMode(signalNodeId: string, mode: SignalClusterMode): void;
  /**
   * Post / recall a traffic CONTROLLER at a signal cluster (doc 72 JU-18 —
   * регулировчик). A schedule dials the cluster to mode "controlled": the
   * lamps keep cycling (misleading-but-visible), but every stop line of the
   * cluster adjudicates against the controller's per-approach permission —
   * crossing while your approach is HALTED grades the dedicated
   * CONTROLLER_SIGNAL_VIOLATED; crossing while PERMITTED is innocent even on a
   * red lamp (сигналите на регулировчика са над светофара, ЗДвП чл. 7).
   * Deterministic session-start dial like setSignalClusterMode; null recalls
   * the controller (back to "live"). Default absent = today's behavior.
   */
  setSignalClusterController(signalNodeId: string, schedule: SignalControllerSchedule | null): void;
  /**
   * JU-18 officer-FIGURE read model (render seam, doc 72 регулировчик): the
   * posted controller's live truth — which axis he halts right now + seconds
   * to the single authored flip — written into `out` (the caller reuses one
   * record; the frame loop must not allocate). Same schedule + same clock the
   * stop-line adjudication reads (controllerPermission), so the posed figure
   * can never disagree with the grading. Returns false when no controller is
   * posted anywhere (out untouched). Nothing grades this.
   */
  signalControllerFigure(out: ControllerFigureState): boolean;
  /**
   * Arm the lesson's approach-relative SIGNAL PLAN (LessonSpec.signalPlan —
   * founder bug 2026-07-17: wall-clock phases made the arrival phase
   * arbitrary after a 20–40 s pre-drive). A ONE-SHOT pin: the first sample()
   * frame that finds the player within plan.triggerM of the plan's cluster
   * rebases that cluster's offset so the phase facing the player's OWN
   * approach heading starts exactly then — "greenFresh" = a full green
   * begins, "redFresh" = a full red begins (wait → redYellow → green, the
   * taught arc). Single fire, then the normal cycle continues from the
   * rebased clock; later pins (amberDilemma, controller) land over it like
   * they land over the natural offset. Deterministic — a pure function of
   * the player's own trajectory. Cluster resolution: plan.clusterId
   * (cluster id or any member node id) when given, else the cluster nearest
   * `near` (the lesson spawn), else a lone cluster if the district has
   * exactly one. Unresolvable/invalid plans arm nothing (fail-innocent).
   * Re-arming replaces the previous plan and resets the latch. LIVE
   * sessions only by construction: the trace recorder never arms a plan, so
   * recorded traces keep their authored signalOffsets byte-identically.
   */
  armSignalPlan(plan: SignalPlanSpec, near?: { x: number; y: number }): void;
  /**
   * THE DRIVABLE SURFACE under the car at the LAST GRADED frame — what it
   * stood on (`carriageway` / `footway` / `island` / `verge`) and how far its
   * CENTRE was from the nearest asphalt. Written into `out` (caller-owned
   * slot, the `signalControllerFigure` discipline — the frame loop must not
   * allocate).
   *
   * Returns FALSE — leaving `out` untouched — when this district's asphalt
   * could not be indexed, or when sample() has not run yet. That is not
   * pedantry: `makeSurfaceFix()` reads "nowhere near a road", so a caller who
   * mistook an unbuilt index for an answer would convict every student on the
   * map. Unknown must stay unknown (A12).
   *
   * Read from the SAME query sample() graded on, at the same frame — the
   * `railBarrierDownAt` rule: no consumer runs a second clock.
   */
  surfaceUnderCar(out: SurfaceFix): boolean;
  /**
   * Hand over an already-resolved drivable surface (`resolveDrivableSurface`
   * over the `WorldGeometry` the renderer builds anyway) instead of letting
   * this runtime rebuild it. Pure optimisation — the lazy self-resolve costs
   * 0.4 ms on a median district and 122 ms on the largest OSM one. `null`
   * clears an injected index and restores the lazy path.
   */
  setDrivableSurface(surface: DrivableSurface | null): void;
  /** Install the traffic module's pedestrian lookup (default: nobody anywhere). */
  setPedestrianQuery(fn: PedestrianQuery | null): void;
  /** Install the traffic module's junction-conflict lookup (default: none). */
  setJunctionConflictQuery(fn: JunctionConflictQuery | null): void;
  /** Install the traffic module's oncoming-vehicle lookup (default: none). */
  setOncomingQuery(fn: OncomingQuery | null): void;
  /** Install the traffic module's from-the-right lookup (default: none). */
  setRightConflictQuery(fn: RightConflictQuery | null): void;
  /** Install the traffic module's roundabout-circulation lookup (default: none). */
  setCirculatingQuery(fn: CirculatingQuery | null): void;
  /** Install the traffic module's same-direction cyclist lookup (default: none —
   *  the vulnerable-pass tracker stays structurally silent). */
  setCyclistQuery(fn: CyclistQuery | null): void;
  /** Install the traffic module's same-direction VEHICLE lookup for the
   *  overtake-return tracker (doc 72 OV-09; the CyclistQuery shape, reused —
   *  cyclist proxies excluded at the source). Default: none — the tracker
   *  stays structurally silent. */
  setOvertakenQuery(fn: CyclistQuery | null): void;
  /**
   * Physics layer reports a contact; drained into the next sample().
   *
   * `bodyId` NAMES the body that was struck and travels through to the tick
   * event's `actorId`, which is what the rule engine keys its contact episode
   * on. Supply it whenever the caller can resolve WHICH body this was — two
   * different bodies struck seconds apart must bill two accidents, and without
   * a name they bill one (see `QueuedContact` for the measurement). Omit it
   * only when no identity exists (world geometry) or when naming would be a
   * guess; the per-category fallback is unchanged and errs innocent.
   */
  pushCollision(withWhat: CollisionWith, bodyId?: string): void;
  /** Phase a driver approaching `signalNodeId` on `bearingDeg` sees (renderer helper). */
  signalPhaseForApproach(signalNodeId: string, bearingDeg: number): SignalPhase;
  /**
   * Rail-barrier ARM state for the guarded crossing nearest (x, y) (district
   * meters — the world prop's own position): true = down/barred. Read-only
   * render seam (the animated arm), evaluated from the SAME validated
   * timetable sample() grades, at the LAST GRADED clock (the tSec of the most
   * recent sample()) — the renderer never runs a second clock, so the arm and
   * tick.railBarred can never disagree. No guarded crossing within the match
   * radius, or guarded without a valid timetable (never barred = open,
   * innocent, A12) = false (up).
   */
  railBarrierDownAt(x: number, y: number): boolean;
  readonly district: District;
  /** Introspection for tests/devtools. */
  debugStopLines(): readonly StopLine[];
  debugSignalClusters(): readonly SignalClusterInfo[];
  /** Uncontrolled (right-hand-rule) junction nodes with positions — devtools/tests. */
  debugUncontrolledJunctions(): ReadonlyArray<{ id: string; x: number; y: number }>;
  /**
   * Per-roundabout entry radii, metres — the OBSERVATION reach (out at the
   * give-way paint) and the COMMIT reach (where a violation may fire). Exposed
   * so a test can assert that the instrument is armed where the road is
   * painted, instead of asserting a constant back at itself (doc 87 B15).
   */
  debugRoundaboutZones(): ReadonlyArray<{
    id: string;
    watchReachM: number;
    commitReachM: number;
  }>;
}

export function createWorldRuntime(districtJson: District | unknown): DistrictWorldRuntime {
  const district = parseDistrict(districtJson);
  const index = new DistrictIndex(district);
  const signals = new SignalController(district, index);
  const stopLines: StopLineSet = buildStopLines(district, index, signals);
  const zones = new CrossingZoneTracker(district, index);
  const turns = new TurnDetector();
  const locator = new Locator(index);
  const defaultLimit = district.meta.defaults?.maxspeedUrbanKmh ?? BG_URBAN_DEFAULT_KMH;
  /** Whether the drawn world states this map's one-way STREETS — a property of
   *  the document, so it is resolved once here rather than per tick. One field
   *  read through the painter's own gate; no builder is run (see
   *  `worldStatesOneWayStreets`). */
  const oneWayStreetsStated = worldStatesOneWayStreets(district);
  /** Whether the end of this world is a WALL (the rim belt / an authored
   *  streetwall) or the bare edge of the ground — a property of the document
   *  too, resolved once here beside the one-way gate. See the field's note in
   *  rules/types.ts for the sentence that was wrong without it. */
  const worldEdgeIsWalled = districtHasWorldRimBelt(district);

  // THE SURFACE CONSULT (see the header block). Lazy: a runtime that is never
  // sampled — the content tools, the catalogue tests — pays nothing, and a
  // caller with the geometry already in hand can inject it instead.
  let drivable: DrivableSurface | null = null;
  let drivableResolved = false;
  let drivableInjected = false;
  /** Per-tick scratch (zero allocation on the sample path). */
  const surfaceFix = makeSurfaceFix();
  /** Did the LAST sample() get a real answer? Until then `surfaceUnderCar`
   *  reports unknown rather than the "nowhere near a road" default. */
  let surfaceKnown = false;

  function drivableSurface(): DrivableSurface | null {
    if (!drivableResolved) {
      drivableResolved = true;
      const cached = surfaceByDistrict.get(district);
      if (cached !== undefined) return (drivable = cached);
      try {
        // parseDistrict returns the raw document unchanged, so this IS the
        // builder's own input; the runtime's District type merely omits the
        // keys (buildings) that the road/junction sweep never reads.
        const s = resolveDistrictDrivableSurface(district as unknown as WorldDistrict);
        // An index with NO asphalt in it is not the statement "this district
        // is one big field" — it is the statement "the sweep produced
        // nothing", which every hand-built test fixture in this repo can
        // trigger. Treated as unknown, because the alternative is a runtime
        // that reports every point of every such map off-road.
        drivable = s.counts.carriageway > 0 ? s : null;
      } catch {
        // A fixture the world builders cannot sweep must not take the drive
        // down with it (the curveAdvisory tolerance discipline, A12).
        drivable = null;
      }
      surfaceByDistrict.set(district, drivable);
    }
    return drivable;
  }

  const lineLastFired = new Float64Array(stopLines.all.length).fill(-Infinity);
  const collisionQueue: QueuedContact[] = [];
  let pedQuery: PedestrianQuery = () => false;
  let conflictQuery: JunctionConflictQuery = () => false;
  let oncomingQuery: OncomingQuery = () => false;
  let rightConflictQuery: RightConflictQuery = () => false;
  let circulatingQuery: CirculatingQuery = () => false;
  let cyclistQuery: CyclistQuery = () => null;
  let overtakenQuery: CyclistQuery = () => null;

  // Junction node positions (district space) for priority conflict lookups.
  const nodePos = new Map<string, { x: number; y: number }>();
  for (const n of district.roads.nodes) nodePos.set(n.id, { x: n.x, y: n.y });

  // М10 lane-intent arrows (audit M-17): the SAME authored meta the painter
  // consumes, indexed for per-frame resolution off the committed lane fix.
  // Empty on every district without arrows — the tick then gains nothing.
  const laneArrowsByEdge = buildLaneArrowSpans(district, index);

  // ZONE-BAN data layer (ADR-006 stage 2a — doc 72 PK-06/OV-06; stage 2b adds
  // the LINE TYPES + BUS LANES vocabulary — doc 72 OV-04/SN-03/SN-05):
  // authored В24/В27/В28/М1/BUS spans, resolved per frame from the SAME
  // committed lane fix maxspeed uses (edge + sM membership — no radius
  // geometry, no tracker). Tolerant by construction: unknown edge ids,
  // unknown kinds and degenerate spans are inert; a v1 file without `zones`
  // builds an empty map and the sample() below adds NOTHING to the tick
  // (byte-identical v1 behavior).
  type KnownZoneKind =
    | "noStopping"
    | "noParking"
    | "noOvertaking"
    | "solidCenterLine"
    | "busLane"
    | "railCrossing"
    | "curveAdvisory"
    | "emergencyLane";
  const KNOWN_ZONE_KINDS = new Set<string>([
    "noStopping",
    "noParking",
    "noOvertaking",
    "solidCenterLine",
    "busLane",
    "railCrossing",
    "curveAdvisory",
    "emergencyLane",
  ]);
  interface ZoneSpan {
    kind: KnownZoneKind;
    fromM: number;
    toM: number;
    /** railCrossing only (stage 3a): guarded flag + validated timetable. */
    railGuarded: boolean;
    railBarrier: { cycleSec: number; downFromSec: number; downToSec: number } | null;
    /** curveAdvisory only (curve-envelope slice): validated advisory, km/h. */
    advisoryKmh: number;
  }
  const banZonesByEdge = new Map<number, ZoneSpan[]>();
  // Render seam (railBarrierDownAt): one entry per GUARDED railCrossing span,
  // at the band start (the zoneSigns arm stands 3 m before it + the curb
  // offset — the nearest-match radius covers both). cycleSec 0 = guarded but
  // never barred (invalid/absent timetable) — the arm renders UP (open, A12).
  const railBarrierProps: {
    x: number;
    y: number;
    cycleSec: number;
    downFromSec: number;
    downToSec: number;
  }[] = [];
  for (const z of district.zones ?? []) {
    if (!KNOWN_ZONE_KINDS.has(z.kind)) continue;
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM < z.toM)) continue;
    // Curve-envelope slice: a curveAdvisory span without a valid advisory
    // speed is dropped WHOLE — with no envelope there is nothing to grade
    // (a data slip must never convict; the rail-timetable discipline, A12).
    if (
      z.kind === "curveAdvisory" &&
      !(Number.isFinite(z.advisoryKmh) && (z.advisoryKmh as number) > 0)
    ) {
      continue;
    }
    const host = index.edgeRtById(z.edgeId);
    if (host === null) continue;
    let list = banZonesByEdge.get(host.idx);
    if (!list) banZonesByEdge.set(host.idx, (list = []));
    // Stage 3a rail fields — tolerant by construction: a malformed timetable
    // is dropped (guarded-but-never-barred = open = innocent, A12); non-rail
    // kinds carry neutral values.
    const guarded = z.kind === "railCrossing" && z.guarded === true;
    const b = z.barrier;
    const barrierValid =
      guarded &&
      b !== undefined &&
      Number.isFinite(b.cycleSec) &&
      b.cycleSec > 0 &&
      Number.isFinite(b.downFromSec) &&
      Number.isFinite(b.downToSec) &&
      b.downFromSec >= 0 &&
      b.downFromSec < b.downToSec &&
      b.downToSec <= b.cycleSec;
    list.push({
      kind: z.kind as KnownZoneKind,
      fromM: z.fromM,
      toM: z.toM,
      railGuarded: guarded,
      railBarrier: barrierValid
        ? { cycleSec: b.cycleSec, downFromSec: b.downFromSec, downToSec: b.downToSec }
        : null,
      advisoryKmh: z.kind === "curveAdvisory" ? (z.advisoryKmh as number) : 0,
    });
    if (guarded) {
      const [bx, by] = index.pointAt(host.idx, z.fromM);
      railBarrierProps.push(
        barrierValid
          ? {
              x: bx,
              y: by,
              cycleSec: b.cycleSec,
              downFromSec: b.downFromSec,
              downToSec: b.downToSec,
            }
          : { x: bx, y: by, cycleSec: 0, downFromSec: 0, downToSec: 0 },
      );
    }
  }

  // Uncontrolled (right-hand-rule) junctions: real junctions (degree >= 3) that
  // are neither signalized nor guarded by any stop/give-way line → equal
  // junctions where you give way to the right.
  const guardedNodeIds = new Set(stopLines.all.map((l) => l.junctionNodeId));
  /**
   * The nodes a roundabout's ring edges touch — every ring MOUTH (doc 87 B15).
   *
   * These stay in `uncontrolledJunctions` above: on a two-lane ring the
   * right-hand-rule tracker is what bills a driver who leaves the INNER lane
   * straight across an occupied outer lane (sc-rb-lane-choice's чл. 25, ал. 2
   * demo grades FAILED_TO_YIELD from it by design). What must never happen is
   * that it speaks to a driver still on an ARM, approaching the mouth — see
   * the gate at §4b.
   */
  const roundaboutNodeIds = new Set<string>();
  for (const e of district.roads.edges) {
    if (!e.roundabout) continue;
    roundaboutNodeIds.add(e.from);
    roundaboutNodeIds.add(e.to);
  }
  const uncontrolledJunctions = district.intersections
    .filter((it) => !it.signalized && it.degree >= 3 && !guardedNodeIds.has(it.id))
    .map((it) => ({ id: it.id, x: it.x, y: it.y }));
  const uncontrolledIds = new Set(uncontrolledJunctions.map((j) => j.id));
  /**
   * Roundabouts, each carrying its TWO entry radii (doc 87 B15, second half):
   *
   *  - `watchReach2` — where the give-way instrument OPENS ITS EYES. Derived
   *    from the М7/М18 paint at this ring's own mouths, so wherever the road
   *    says „wait", the grader is live. Floored at the legacy ring-relative
   *    reach: no roundabout's zone shrinks, on any map, ever.
   *  - `commitReach2` — where a driver counts as ENTERING, and therefore the
   *    only place a violation may fire or its sustain clock may start.
   *    Unchanged, so this whole change is additive on the conviction side: no
   *    drive that was innocent yesterday can be billed today.
   *
   * Both are squared — the per-frame proximity scan stays sqrt-free.
   */
  const roundabouts = district.roundabouts.map((rb) => {
    const commitReach = rb.radius + ROUNDABOUT_ENTRY_MARGIN_M;
    const watchReach = Math.max(commitReach, roundaboutGiveWayReachM(district, index, rb));
    return {
      id: rb.id,
      x: rb.x,
      y: rb.y,
      radius: rb.radius,
      watchReach2: watchReach * watchReach,
      commitReach2: commitReach * commitReach,
    };
  });

  // Junctions that behave as UNCONTROLLED right now (doc 72 JU-09/JU-20): the
  // structurally uncontrolled nodes above, PLUS any signalized junction whose
  // cluster has been dialed DARK / flashing amber — its lamps carry no phase,
  // so the right-hand-rule tracker governs it. Degree >= 3 mirrors the
  // uncontrolledJunctions gate (a dark mid-block pedestrian signal is not a
  // give-way junction). Absent any dark cluster this equals uncontrolledIds.
  const intersectionDegree = new Map(district.intersections.map((it) => [it.id, it.degree]));
  const isUncontrolledJunction = (nodeId: string): boolean => {
    if (uncontrolledIds.has(nodeId)) return true;
    const clusterIdx = signals.clusterIdxForNode(nodeId);
    return (
      clusterIdx >= 0 &&
      signals.isClusterUncontrolled(clusterIdx) &&
      (intersectionDegree.get(nodeId) ?? 0) >= 3
    );
  };

  // Right-hand-rule visit tracker (one violation per junction entry).
  let rhrNode: string | null = null;
  let rhrFired = false;
  let rhrConflictSeen = false; // a right-conflict was observed this visit
  let rhrSlowed = false; // driver slowed to yield speed while that conflict held
  /**
   * COMMITMENT (see §4b's "entered clear" block). `rhrApproachYielded` is set
   * the moment the driver is inside the observation zone, still OUTSIDE the
   * core, at or below the yield floor — he came in prepared to stop.
   * `rhrEnteredCore` latches his first moving tick inside the core, and
   * `rhrEnteredClear` records whether that commitment was made with the way
   * genuinely clear. Reset with the rest of the visit state.
   */
  let rhrApproachYielded = false;
  let rhrEnteredCore = false;
  let rhrEnteredClear = false;
  let rbNode: string | null = null; // roundabout currently being approached
  let rbFired = false;
  let rbConflictSeen = false; // circulating traffic observed this approach
  let rbSlowed = false; // driver slowed to yield speed while it was circulating
  /**
   * The entry-yield COMMENDATION is awarded when the driver leaves the COMMIT
   * radius having been inside it — not when he leaves the (now much wider)
   * observation zone. Two reasons, and the first is the honest one:
   *
   *  - the award means „this entry is finished and it was done right", and the
   *    entry finishes at the ring, not thirty metres back down the exit arm;
   *  - it keeps the award WHERE IT ALREADY WAS. The staged roundabout runner
   *    resolves its own encounter „clear" at ringRadius + 30 m and listens for
   *    this event to say „yielded" instead. Moving the award out with the
   *    observation zone lost that race on rb-2lane-v1 (award at 60.25 m, runner
   *    already resolved at 56) and turned a shadow drive that demonstrates a
   *    yield into one that demonstrates an empty ring. Widening the grader's
   *    EYES must not move its VERDICTS, in either direction.
   */
  let rbCommittedSeen = false; // has been inside the commit radius this visit
  let rbYieldAwarded = false; // the commendation already fired this visit
  // C1 revision — yield-adjudication tolerance bands (A12 discipline):
  //  - Braking response: a driver DECELERATING hard toward the conflict is
  //    yielding, not barging — staged conflicts can materialise inside the
  //    physical braking distance ("late"/"tight" tiers), and convicting the
  //    correct reaction mid-brake was a 10-point FP (C1 exam-bank bot,
  //    shells F/G). Mirrors the crossingBrakeResponseMps2 band.
  //  - Ring-transit latch: the ring polyline is polygonal, so a vehicle
  //    ALREADY CIRCULATING points "inward" ≥ the entry threshold at every
  //    corner; once the azimuth around the centre has swept ≥ RB_ON_RING_DEG
  //    this visit, the vehicle holds ring priority and entry grading stands
  //    down (C1 FP: graded as a barging entry 70 m PAST a lawful entry).
  let prevYieldSpeedKmh: number | null = null;
  let prevYieldT = 0;
  let rbAzPrevDeg: number | null = null;
  let rbAzAccumDeg = 0;
  let rhrCondSince: number | null = null; // conflict-visible onset (reaction window)
  let rbCondSince: number | null = null;

  // N1 left-turn-across-path tracker (doc 72 JU-10) — one adjudication per
  // junction visit, same visit/latch shape as the RHR tracker above. All the
  // house disciplines apply: conflict-visible minimum (YIELD_CONVICT_SUSTAIN),
  // braking-response stand-down bounded by the D1 reaction window, and the
  // gap-memory latch (LEFT_TURN_GAP_MEMORY_SEC) so a guard-stopped/emergency-
  // braking victim still convicts the cutter while a waiting yielder whose
  // conflict passed stays innocent.
  // The probe runs in the CONFLICT FRAME: centred on the junction node with
  // the player's approach heading FROZEN at visit start — the accepted gap is
  // the oncoming's time to the conflict point (the node), and it must not
  // dissolve just because the player's nose has already swept 55° into the
  // turn (the bearing-opposition filter would drop a still-arriving car).
  let ltNode: string | null = null; // junction currently visited (any control)
  let ltApproachHeading = 0; // player heading frozen at visit start
  let ltAdjudicated = false; // one grade per visit
  let ltConflictSeen = false; // a REAL closing conflict (gap ≤ safe band) seen
  let ltSlowed = false; // player held yield speed while that conflict existed
  let ltCondSince: number | null = null; // current visibility episode onset
  let ltOnsetT = -Infinity; // onset of the most recent episode (stand-down base)
  let ltSustainedRecentT = -Infinity; // last frame with ≥ sustain visibility
  let ltLastTightT = -Infinity; // last convict-tight observation while moving
  let ltTightGapSec: number | undefined; // gap recorded at that observation

  // OVERTAKE-CORRIDOR tracker (doc 72 OV-05/OV-08) — one adjudication per
  // opposing-bank EXCURSION (the solidCross excursion discipline), with the
  // JU-10 house rules: conflict-visible sustain, D1-bounded braking-response
  // stand-down (the abort), and the gap-memory latch (guard-stopped victims
  // still convict the gambler). Constants & bands documented at
  // OVERTAKE_CONVICT_GAP_SEC.
  let ocExcursion = false; // currently on the opposing bank (armed context)
  let ocEmitted = false; // one bill per excursion
  let ocTightSince: number | null = null; // current tight episode onset
  let ocTightOnsetT = -Infinity; // stand-down window base (episode onset)
  let ocLastTightT = -Infinity; // last tight observation (memory latch)
  let ocTightGapSec: number | undefined; // gap recorded at that observation

  // OVERTAKE-RETURN tracker (doc 72 OV-09) — one adjudication per completed
  // overtake (excursion + pass + committed return); bands, the reference-
  // speed latch and the structural-innocence list documented at
  // OVERTAKE_RETURN_CONVICT_GAP_SEC.
  let orExcursion = false; // mirrors the corridor's armed context
  let orSawAhead = false; // the mate was seen genuinely AHEAD this excursion
  let orPassed = false; // …and then genuinely BEHIND — the pass completed
  let orForced = false; // the cut has entered the forcing window
  let orRefSpeedMps = 0; // live-tracked until forced, then frozen
  let orCorridorBilled = false; // corridor billed THIS excursion → stand down

  const orReset = () => {
    orExcursion = false;
    orSawAhead = false;
    orPassed = false;
    orForced = false;
    orRefSpeedMps = 0;
    orCorridorBilled = false;
  };

  // VULNERABLE-PASS tracker (doc 72 VU-02) — one adjudication per completed
  // pass of a same-direction cyclist proxy; constants + bands + stand-downs
  // documented at VULNERABLE_PASS_PROBE_RADIUS_M.
  let vpActive = false; // pass episode armed (closing from behind)
  let vpMinLateralM = Infinity; // tightest |lateral| while ALONGSIDE at speed
  let vpSawAlongside = false; // a genuine alongside frame at speed happened
  let vpSwerve = false; // the cyclist's own line drifted toward the player
  let vpSideSign = 0; // player's side of the cyclist's frozen line at arm
  let vpC0x = 0; // cyclist line anchor at arm…
  let vpC0y = 0;
  let vpD0x = 0; // …and its unit direction at arm
  let vpD0y = 1;

  const vpReset = () => {
    vpActive = false;
    vpMinLateralM = Infinity;
    vpSawAlongside = false;
    vpSwerve = false;
    vpSideSign = 0;
  };

  // Previous-frame tracking for line-crossing detection.
  let prevEdgeIdx = -1;
  let prevS = 0;
  let lastMoveSign: 1 | -1 | 0 = 0;

  // Amber decision watch (B1a JU-06): while the next signalized line ahead
  // shows green, keep a fresh {distance, speed} snapshot; the green→yellow
  // flip freezes it — that frozen snapshot IS the state "at the flip", and
  // adjudicates `stoppable` when the line later fires on yellow. One watched
  // line at a time (the vehicle is on one approach); anything unknown leaves
  // `stoppable` unset and the reducer silent (A12).
  let amberLineIdx = -1;
  let amberGreenDistM = -1;
  let amberGreenSpeedKmh = 0;
  let amberFrozen = false;

  // SIGNAL-PLAN one-shot pin state (armSignalPlan — LessonSpec.signalPlan).
  // Null until armed; `fired` latches after the single rebase. The check
  // lives in sample() because the LIVE session is the only caller that
  // feeds player positions here every frame — the trace recorder never
  // arms a plan (its signal truth is the authored signalOffsets).
  let signalPlanPin: {
    /** Any member node id — setClusterOffset addresses the whole cluster. */
    nodeId: string;
    x: number;
    y: number;
    /** triggerM², so the per-frame check stays sqrt-free. */
    trigger2: number;
    arm: "greenFresh" | "redFresh";
    fired: boolean;
  } | null = null;

  const speedLimitHit = makeEdgeHit();

  /** Lamp state of a signalized line's approach group — redYellow is its own
   * state now (JU-08 grades the creep as основна, not as the 10-point red). */
  function lightStateOf(line: StopLine): SignalPhase {
    return signals.phaseForClusterGroup(line.clusterIdx, line.group ?? "ns");
  }

  function fireLine(line: StopLine, lineIdx: number, tSec: number, events: SimTickEvent[]): void {
    if (tSec - lineLastFired[lineIdx] < STOP_LINE_REFIRE_SEC) return;
    lineLastFired[lineIdx] = tSec;
    if (line.control === "trafficLight") {
      // Dark / flashing-amber cluster: the lamps carry no phase, so this line
      // is not a controlled stop line — no signal code fires (the junction is
      // uncontrolled; the right-hand-rule tracker adjudicates). doc 72 JU-09/20.
      if (signals.isClusterUncontrolled(line.clusterIdx)) return;
      // Traffic controller posted (JU-18): the CONTROLLER's permission for
      // this approach is the effective signal — the event carries BOTH the
      // lamp truth (lightState — the hierarchy proof: green lamps do not
      // acquit) and the permission; the reducer grades ONLY the permission.
      const controllerPerm = signals.controllerPermission(line.clusterIdx, line.group ?? "ns");
      if (controllerPerm !== null) {
        events.push({
          kind: "stopLineCrossed",
          control: "trafficLight",
          lightState: lightStateOf(line),
          controller: controllerPerm,
        });
        return;
      }
      const state = lightStateOf(line);
      const ev: Extract<SimTickEvent, { kind: "stopLineCrossed" }> = {
        kind: "stopLineCrossed",
        control: "trafficLight",
        lightState: state,
      };
      if (state === "yellow" && amberFrozen && amberLineIdx === lineIdx && amberGreenDistM >= 0) {
        ev.stoppable = comfortableStopPossible(amberGreenDistM, amberGreenSpeedKmh);
      }
      events.push(ev);
    } else {
      // Non-signal line: emit the sign kind the geometry carries. Б2 „Стоп"
      // (stopSign) demands a full stop at the line; Б1 „Пропусни движението"
      // (giveWay) demands only the yield below — no full stop (ЗДвП чл. 50; the
      // reducer's giveWay branch grades nothing at the line itself). Which of
      // the two arrives here is the world builder's own sign rule (audit C-4,
      // network.junctionPriorityControls), so the grade always matches the
      // triangle or octagon the student is looking at.
      events.push({ kind: "stopLineCrossed", control: line.control });
      // Give-way / stop: crossing into the junction while conflicting priority
      // traffic is present = failing to yield — graded FAILED_TO_YIELD (detail
      // "give-way") by the reducer's prioritySituation handler. This is the ONLY
      // grade a clear-mouth Б1 escapes and a conflicted Б1 earns.
      const node = nodePos.get(line.junctionNodeId);
      if (node && conflictQuery(node.x, node.y, PRIORITY_CONFLICT_RADIUS_M, line.approachBearingDeg)) {
        events.push({ kind: "prioritySituation", situation: "give-way", violated: true });
      }
    }
  }

  /** Fire every line on `edgeIdx` crossed by moving s0 → s1 (direction-aware). */
  function sweepLines(edgeIdx: number, s0: number, s1: number, tSec: number, events: SimTickEvent[]): void {
    if (s0 === s1) return;
    const lineIdxs = stopLines.byEdge[edgeIdx];
    for (let i = 0; i < lineIdxs.length; i++) {
      const li = lineIdxs[i];
      const line = stopLines.all[li];
      if (s1 > s0) {
        if (line.dirSign === 1 && line.sM > s0 && line.sM <= s1) fireLine(line, li, tSec, events);
      } else {
        if (line.dirSign === -1 && line.sM < s0 && line.sM >= s1) fireLine(line, li, tSec, events);
      }
    }
  }

  function detectStopLines(edgeIdx: number, sM: number, tSec: number, events: SimTickEvent[]): void {
    if (edgeIdx >= 0 && prevEdgeIdx === edgeIdx) {
      const ds = sM - prevS;
      if (ds !== 0) {
        sweepLines(edgeIdx, prevS, sM, tSec, events);
        lastMoveSign = ds > 0 ? 1 : -1;
      }
      return;
    }

    // Edge transition. 1) finish the old edge in the last known direction…
    if (prevEdgeIdx >= 0 && lastMoveSign !== 0) {
      const oldLen = index.edgeRt(prevEdgeIdx).totalLen;
      sweepLines(prevEdgeIdx, prevS, lastMoveSign > 0 ? oldLen : 0, tSec, events);
    }
    // …2) then enter the new edge from the shared node (skip on teleports —
    // no shared node means the vehicle did not drive across the boundary).
    if (edgeIdx >= 0 && prevEdgeIdx >= 0) {
      const oldEdge = index.edgeRt(prevEdgeIdx).edge;
      const newRt = index.edgeRt(edgeIdx);
      const oldEnd = lastMoveSign > 0 ? oldEdge.to : lastMoveSign < 0 ? oldEdge.from : null;
      if (oldEnd !== null && (newRt.edge.from === oldEnd || newRt.edge.to === oldEnd)) {
        const entryS = newRt.edge.from === oldEnd ? 0 : newRt.totalLen;
        sweepLines(edgeIdx, entryS, sM, tSec, events);
        lastMoveSign = sM > entryS ? 1 : sM < entryS ? -1 : lastMoveSign;
      } else {
        lastMoveSign = 0;
      }
    } else {
      lastMoveSign = 0;
    }
  }

  // The last clock sample() graded with — railBarrierDownAt evaluates the
  // barrier timetable at exactly this time (render/grading lockstep).
  let lastSampleTSec = 0;

  const runtime: DistrictWorldRuntime = {
    district,

    update(dtSec: number): void {
      signals.update(dtSec);
    },

    sample(
      v: VehicleSample,
      tSec: number,
      isNight: boolean,
      rain = false,
      leadGapM = Infinity,
      fog = false,
      snow = false,
      vruAheadM = Infinity,
    ): SimTick {
      lastSampleTSec = tSec; // the barrier prop reads THIS clock (see getter)
      const events: SimTickEvent[] = [];

      // 1. Collisions reported by physics since the last tick.
      //
      // This queue is a raw CONTACT STREAM, not a list of accidents, and it
      // deliberately stays that way: everything pushed since the last sample
      // is handed on verbatim. Turning contact into „one encounter" is the
      // reducer's job (rules/engine.ts, the `collision` case) because every
      // other contact source funnels through the same event.
      //
      // MEASURED, because the queue is the natural first suspect when one
      // touch bills nine times: it does NOT bypass the reducer's guard. Nine
      // entries drained here arrive as nine events on ONE tick, at one
      // timestamp, and the reducer bills them once. What the founder's nine
      // came from was the reducer's old 3 s rate limit re-billing a contact
      // that kept being re-reported over half a minute.
      //
      // The name travels with the report. An UNNAMED contact still emits the
      // exact pre-`bodyId` event shape — the key is omitted rather than set to
      // undefined — so every `toEqual` in the suite, and the engine's
      // per-category fallback, see byte-identical input.
      while (collisionQueue.length > 0) {
        const c = collisionQueue.shift() as QueuedContact;
        events.push(
          c.bodyId === undefined
            ? { kind: "collision", withWhat: c.withWhat }
            : { kind: "collision", withWhat: c.withWhat, actorId: c.bodyId },
        );
      }

      // 2. Mirror glance passthrough (input layer sets it on the glance frame).
      if (v.mirrorGlance !== null) {
        events.push({ kind: "mirrorGlance", mirror: v.mirrorGlance });
      }

      // 2b. SIGNAL-PLAN one-shot pin (armSignalPlan): the first frame inside
      // the trigger ring rebases the cluster so the phase facing THIS
      // approach heading starts now — before any stop-line / next-line read
      // of this frame, so the very tick that fires already sees the fresh
      // phase. Latch first: the rebase must happen exactly once.
      if (signalPlanPin !== null && !signalPlanPin.fired) {
        const pdx = v.position.x - signalPlanPin.x;
        const pdy = v.position.y - signalPlanPin.y;
        if (pdx * pdx + pdy * pdy <= signalPlanPin.trigger2) {
          signalPlanPin.fired = true;
          signals.setClusterOffset(
            signalPlanPin.nodeId,
            signals.offsetForPhaseStart(
              signalPlanPin.nodeId,
              v.headingDeg,
              signalPlanPin.arm === "greenFresh" ? "green" : "red",
              0,
            ),
          );
        }
      }

      // 3. Lane fix (committed hysteresis, heading-gated lock stealing) +
      // stop-line crossings.
      const fix = locator.track(v.position.x, v.position.y, v.headingDeg);
      detectStopLines(fix.edgeIdx, fix.sM, tSec, events);
      prevEdgeIdx = fix.edgeIdx;
      prevS = fix.sM;

      // 3b. Next-stop-line context (B1a): the nearest line AHEAD on the
      // current edge in the travel direction, within the watch window. Runs
      // AFTER detectStopLines so a yellow crossing this frame reads the
      // PREVIOUS frames' amber snapshot (state at the flip), then updates.
      let nextLineIdx = -1;
      let nextLineDistM = Infinity;
      if (fix.edgeIdx >= 0) {
        const [tx, ty] = index.tangentAt(fix.edgeIdx, fix.sM);
        const travelSign: 1 | -1 =
          Math.abs(signedDeltaDeg(v.headingDeg, bearingDeg(tx, ty))) <= 90 ? 1 : -1;
        const lineIdxs = stopLines.byEdge[fix.edgeIdx];
        for (let i = 0; i < lineIdxs.length; i++) {
          const line = stopLines.all[lineIdxs[i]];
          if (line.dirSign !== travelSign) continue;
          const d = (line.sM - fix.sM) * travelSign;
          if (d >= 0 && d < nextLineDistM) {
            nextLineDistM = d;
            nextLineIdx = lineIdxs[i];
          }
        }
        if (nextLineDistM > NEXT_LINE_WATCH_M) nextLineIdx = -1;
      }
      let nextStopLineM: number | undefined;
      let nextStopLineControl: "stopSign" | "trafficLight" | "giveWay" | undefined;
      let nextStopLineState: SignalPhase | undefined;
      if (nextLineIdx >= 0) {
        const line = stopLines.all[nextLineIdx];
        // A dark / flashing-amber trafficLight line is not a controlled stop
        // line — surface no stop-line context at all (the junction is
        // uncontrolled), so no signal-context detector reads a phantom phase.
        const darkLine =
          line.control === "trafficLight" && signals.isClusterUncontrolled(line.clusterIdx);
        if (!darkLine) {
          nextStopLineM = nextLineDistM;
          nextStopLineControl = line.control;
          if (line.control === "trafficLight") {
            // JU-18: with a controller posted, the surfaced state is the
            // EFFECTIVE signal, not the lamp — a HALTED approach reads "red"
            // (so waiting at green lamps is never HESITATION_AT_GREEN and
            // braking for the halt always has a cause); a PERMITTED approach
            // reads the live lamp state.
            const perm = signals.controllerPermission(line.clusterIdx, line.group ?? "ns");
            nextStopLineState = perm === "halt" ? "red" : lightStateOf(line);
          }
        }
      }

      // Amber decision watch update (green snapshot / flip freeze).
      if (nextLineIdx !== amberLineIdx) {
        amberLineIdx = nextLineIdx;
        amberGreenDistM = -1;
        amberGreenSpeedKmh = 0;
        amberFrozen = false;
      }
      if (nextLineIdx >= 0 && nextStopLineState !== undefined) {
        if (nextStopLineState === "green") {
          amberGreenDistM = nextLineDistM;
          amberGreenSpeedKmh = v.speedKmh;
          amberFrozen = false;
        } else if (nextStopLineState === "yellow") {
          amberFrozen = amberGreenDistM >= 0;
        } else {
          amberGreenDistM = -1;
          amberFrozen = false;
        }
      }

      // 3c. Junction-proximity context (harsh-brake cause gate).
      const nearJunction = index.nearestIntersection(
        v.position.x,
        v.position.y,
        JUNCTION_CONTEXT_RADIUS_M,
      );
      const nextJunctionM =
        nearJunction !== null
          ? Math.hypot(nearJunction.x - v.position.x, nearJunction.y - v.position.y)
          : undefined;

      // 4. Turns (only inside junction areas).
      const nearestIx = index.nearestIntersection(
        v.position.x,
        v.position.y,
        JUNCTION_AREA_RADIUS_M,
      );
      const beforeTurns = events.length;
      turns.update(tSec, v.headingDeg, nearestIx !== null, events, v.speedKmh);
      // Left-turn commit this frame? Adjudicated by the N1 tracker below
      // (after the braking-response band is known — see 4a').
      let leftTurnCommitted = false;
      for (let i = beforeTurns; i < events.length; i++) {
        const te = events[i];
        if (te.kind === "turnStarted" && te.direction === "left") {
          leftTurnCommitted = true;
          break;
        }
      }

      // 4b'. Yield braking-response band (C1): decelerating hard toward the
      // conflict = actively yielding; the trackers below never convict
      // mid-response. A barger who releases the brake still grades.
      const yieldDecelMps2 =
        prevYieldSpeedKmh !== null && tSec > prevYieldT
          ? (prevYieldSpeedKmh - v.speedKmh) / 3.6 / (tSec - prevYieldT)
          : 0;
      const brakingResponse = yieldDecelMps2 >= YIELD_BRAKE_RESPONSE_MPS2;
      prevYieldSpeedKmh = v.speedKmh;
      prevYieldT = tSec;

      // RX-05 (sc-rx-tram-left:07c63b97) — the tracker's own probe, published.
      // The N1 block below already measures, every frame, how many seconds the
      // oncoming is from this junction; it then throws that number away unless
      // the player COMMITS a turn. So a student standing at the mouth while a
      // tram bears down on him was, to every surface outside this file, a car
      // stopped in front of nothing: `yieldReasonAt` had no clause that could
      // see it and the wait was not a wait. Set only when the most urgent
      // oncoming is a RAIL vehicle making a real arrival claim — absent on
      // every other frame in the product, so no existing drive changes shape.
      let oncomingRailGapSec: number | undefined;

      // 4a'. N1 left-turn-across-path tracker (doc 72 JU-10). Runs at EVERY
      // junction (signalized or not — the чл. 37 oncoming duty is universal);
      // constants & bands documented at LEFT_TURN_CONVICT_GAP_SEC.
      if (nearestIx !== null) {
        if (ltNode !== nearestIx.id) {
          ltNode = nearestIx.id;
          ltApproachHeading = v.headingDeg;
          ltAdjudicated = false;
          ltConflictSeen = false;
          ltSlowed = false;
          ltCondSince = null;
          ltOnsetT = -Infinity;
          ltSustainedRecentT = -Infinity;
          ltLastTightT = -Infinity;
          ltTightGapSec = undefined;
        }
        const probe = oncomingQuery(
          nearestIx.x,
          nearestIx.y,
          ltApproachHeading,
          LEFT_TURN_ONCOMING_RADIUS_M,
        );
        // Normalize the probe: rich telemetry → gap in seconds; legacy
        // boolean → presence with unknown gap (conviction via tight radius).
        let present = false;
        let gapSec: number | undefined;
        if (typeof probe === "object" && probe !== null) {
          if (probe.closingMps >= LEFT_TURN_MIN_CLOSING_MPS) {
            present = true;
            gapSec = probe.distM / probe.closingMps;
            // The rail half of the same measurement. The legacy boolean wiring
            // cannot answer „релсово ли е" at all, so it publishes nothing —
            // absence stays UNKNOWN everywhere, never „no tram".
            if (probe.rail === true) oncomingRailGapSec = gapSec;
          }
        } else if (probe === true) {
          present = true;
        }
        if (present) {
          if (ltCondSince === null) {
            ltCondSince = tSec;
            ltOnsetT = tSec;
          }
          if (tSec - ltCondSince >= YIELD_CONVICT_SUSTAIN_SEC) ltSustainedRecentT = tSec;
          // A REAL conflict (within the graded band, or unknown-gap presence):
          // arms the yielded-commendation eligibility.
          if (gapSec === undefined || gapSec <= LEFT_TURN_GAP_SAFE_SEC) {
            ltConflictSeen = true;
            if (v.speedKmh <= RHR_YIELD_KMH) ltSlowed = true;
          }
          // Convict-tight observation — only while the player is MOVING into
          // it (a stopped/creeping waiter reads tight gaps as every oncoming
          // passes nose-to-nose; those are innocent by definition).
          if (v.speedKmh > RHR_YIELD_KMH) {
            const tight =
              gapSec !== undefined
                ? gapSec <= LEFT_TURN_CONVICT_GAP_SEC
                : !!oncomingQuery(
                    nearestIx.x,
                    nearestIx.y,
                    ltApproachHeading,
                    LEFT_TURN_CONVICT_RADIUS_M,
                  );
            if (tight) {
              ltLastTightT = tSec;
              ltTightGapSec = gapSec;
            }
          }
        } else {
          ltCondSince = null;
        }
        if (leftTurnCommitted && !ltAdjudicated) {
          const commitGap = gapSec ?? ltTightGapSec;
          const tightRecent = tSec - ltLastTightT <= LEFT_TURN_GAP_MEMORY_SEC;
          const visibleLongEnough = tSec - ltSustainedRecentT <= LEFT_TURN_GAP_MEMORY_SEC;
          const standDown =
            brakingResponse && tSec - ltOnsetT <= YIELD_BRAKE_RESPONSE_MAX_SEC;
          if (tightRecent && visibleLongEnough && !standDown) {
            const ev: Extract<SimTickEvent, { kind: "prioritySituation" }> = {
              kind: "prioritySituation",
              situation: "left-turn-oncoming",
              violated: true,
            };
            if (commitGap !== undefined) ev.gapSec = commitGap;
            events.push(ev);
            ltAdjudicated = true;
          } else if (ltConflictSeen && ltSlowed) {
            // Waited for the gap, then turned — the JU-10 correct resolution.
            const ev: Extract<SimTickEvent, { kind: "prioritySituation" }> = {
              kind: "prioritySituation",
              situation: "left-turn-oncoming",
              violated: false,
              yielded: true,
            };
            if (gapSec !== undefined) ev.gapSec = gapSec;
            events.push(ev);
            ltAdjudicated = true;
          }
        }
      } else if (ltNode !== null) {
        ltNode = null;
        ltAdjudicated = false;
        ltConflictSeen = false;
        ltSlowed = false;
        ltCondSince = null;
        ltOnsetT = -Infinity;
        ltSustainedRecentT = -Infinity;
        ltLastTightT = -Infinity;
        ltTightGapSec = undefined;
      }

      // 4b. Right-hand rule: entering an uncontrolled junction's core while a
      // vehicle approaches from the right = failing to give way (once per
      // visit). Slowing for that same conflict and NOT barging in earns a
      // positive commendation, awarded on leaving the junction.
      // B15 — THE RIGHT-HAND RULE DOES NOT REACH UP A ROUNDABOUT'S ARM.
      //
      // A ring mouth is degree 3, unsignalized, and `buildStopLines` skips
      // roundabout nodes on purpose, so every mouth lands in
      // `uncontrolledJunctions` — „equal junction, give way to the RIGHT".
      // For a driver ALREADY ON THE RING that is load-bearing (it is what
      // bills the чл. 25, ал. 2 cut across an occupied outer lane in
      // sc-rb-lane-choice). For a driver still on an ARM it is simply the
      // wrong law: Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5 forbids Б3 at
      // a ring entry, so ал. 2 posts Б1/Б2 there, and ЗДвП чл. 50, ал. 1 makes
      // the duty „пропусни движещите се по пътя с предимство" — the ring,
      // which on a CCW roundabout is on your LEFT. §4c adjudicates exactly
      // that, and it is the only tracker an approaching driver should meet.
      //
      // The founder's row, measured: he stops on the М8 paint at
      // (4.06, −36.92) on rb-mini-v1 — 18.9 m out, on `rbm-e-arm-s` — waits
      // 4 s, 8 s, 40 s, sixty, then pulls away, and is billed ОПАСНА
      // «Непропускане» 0.800 s after the wheels turn, at y = −35.50: the FIRST
      // tick inside RHR_CORE_RADIUS_M. The same 0.800 s at every wait length,
      // because it is not a reaction window, it is the time to roll 1.4 m. The
      // vehicle he is convicted for is the circulator that has already crossed
      // in front of him and is LEAVING up the east arc — on his right, and so
      // under чл. 47 his to yield to. The card even printed the wrong law back
      // at him: „На кръстовище без светофар пропускаш идващите отдясно."
      // Eight mouths of the real Лозенец district (d2-v1) carried it too.
      //
      // „On the ring" is read off the lane fix, not guessed from geometry: the
      // ring edges are the ones flagged `roundabout` in the district, which is
      // the same fact `buildStopLines` keys on.
      const onRoundaboutEdge =
        fix.edgeIdx >= 0 && index.edgeRt(fix.edgeIdx).edge.roundabout;
      const approachingRingMouth =
        nearestIx !== null && roundaboutNodeIds.has(nearestIx.id) && !onRoundaboutEdge;
      if (nearestIx !== null && !approachingRingMouth && isUncontrolledJunction(nearestIx.id)) {
        if (rhrNode !== nearestIx.id) {
          rhrNode = nearestIx.id;
          rhrFired = false;
          rhrConflictSeen = false;
          rhrSlowed = false;
          rhrCondSince = null;
          rhrApproachYielded = false;
          rhrEnteredCore = false;
          rhrEnteredClear = false;
        }
        // TWO QUESTIONS, NOT ONE — and they were being answered by one call.
        //
        // «Did I see a car coming from the right, and did I slow for it?» is a
        // question about PRESENCE, and it is what earns «Правилно отстъпено
        // предимство» on leaving the junction. «Did I pull out in front of one?»
        // is a question about a MEETING. Asking presence for both is what
        // convicted the model line of `sc-junction-blind` on 10-11 of 20 ambient
        // seeds — for cars 23 m gone before he arrived, or 16-22 s away crawling
        // (the measurement is at `conflictFromRightFor`). Asking the meeting for
        // both would be the mirror mistake: a student who correctly waits out a
        // car that then clears would stop being credited for waiting.
        //
        // So: the commendation channel keeps the presence answer, byte for byte
        // what it always got; the conviction clock and the verdict read the
        // arrival-aware one, which can only ever be a subset of it.
        const rightPresence = rightConflictQuery(
          nearestIx.x,
          nearestIx.y,
          v.position.x,
          v.position.y,
          v.headingDeg,
          PRIORITY_CONFLICT_RADIUS_M,
        );
        const rightConflict =
          rightPresence &&
          rightConflictQuery(
            nearestIx.x,
            nearestIx.y,
            v.position.x,
            v.position.y,
            v.headingDeg,
            PRIORITY_CONFLICT_RADIUS_M,
            Math.abs(v.speedKmh),
          );
        if (rightPresence) {
          rhrConflictSeen = true;
          if (v.speedKmh <= RHR_YIELD_KMH) rhrSlowed = true;
        }
        const dx = nearestIx.x - v.position.x;
        const dy = nearestIx.y - v.position.y;
        const inCore = dx * dx + dy * dy <= RHR_CORE_RADIUS_M * RHR_CORE_RADIUS_M;
        // ── COMMITMENT: A DUTY THAT ATTACHES ON APPROACH CANNOT BE BILLED
        //    AGAINST A CAR THAT ARRIVES AFTER YOU ARE IN THE BOX ────────────
        //
        // `sc-junction-blind:dea35510` („the lesson's own CORRECT line is not
        // survivable"), measured on the shipped model line — creep to
        // (4.06, −19.5), eight seconds on the brake, then the authored left
        // turn — replayed at the ambient count each rung compiles to. Three of
        // twenty L1 seeds still convicted, and the tick log says why:
        //
        //   seed 6  enters the core at t=30.75, y=−17.5, conf=0 — the way is
        //           CLEAR. A conflict first appears at t=31.62, y=−14.2, and
        //           he is billed «Непропускане» 0.9 s later at y=−10.2.
        //   seed 7  same shape: clear at entry, conflict born at y=−10.8 with
        //           the car already turning, billed at y=−6.9 — mid-junction.
        //
        // He is inside the junction, past the point where stopping is the safe
        // act, and the card then prints «✔ потегли само когато никой не
        // приближава» to a student who did exactly that. Requirement-zero (doc
        // 64 THEO-4) is the reason this is a defect and not a tuning argument.
        //
        // So the clock may not START once he is committed — but ONLY when the
        // commitment was itself lawful, which is two facts and not one:
        //
        //   · he came in prepared to stop (`rhrApproachYielded`: at or below
        //     RHR_YIELD_KMH inside the observation zone while still outside the
        //     core — the same floor the commendation channel already calls
        //     „yielding"), and
        //   · the way was clear at the instant he committed (no `rightConflict`
        //     on the first moving tick inside the core).
        //
        // BOTH HALVES ARE LOAD-BEARING, and the same tick log is what proves
        // it. `mistake-barge` is convicted in EXACTLY the shape acquitted
        // above — it enters the core at t=17.63 with conf=0 and meets the car
        // at y=−11.6 — so an immunity resting on „he was already inside" alone
        // would acquit the barge and delete this lesson's own counter-example.
        // What separates them is the approach: the barge holds 20-22 км/ч from
        // 40 m out and never drops to the yield floor, so it never earns the
        // first half. Nor does a driver who pulls out in front of a car he can
        // already see: that conflict arms the clock BEFORE the core, and
        // `rhrEnteredClear` is false at his commitment tick (seed 13, the one
        // seed of twenty that still convicts here — the car appears 0.7 s after
        // he releases the brake, while he is still outside the core at 5 км/ч
        // and stopping is still the right answer).
        if (!inCore) {
          if (Math.abs(v.speedKmh) <= RHR_YIELD_KMH) rhrApproachYielded = true;
        } else if (!rhrEnteredCore && v.speedKmh > RHR_MOVING_KMH) {
          rhrEnteredCore = true;
          rhrEnteredClear = rhrApproachYielded && !rightConflict;
        }
        const rhrCommittedClear = rhrEnteredCore && rhrEnteredClear;
        if (rightConflict && !rhrCommittedClear) {
          // B15's staleness, in the tracker it was NOT fixed in. The identical
          // repair shipped one block below for `rbCondSince` (see §4c) and its
          // twin was left here, where the same driver meets the same sentence
          // at every ordinary crossroads: the stamp is taken the first tick the
          // conflict is visible and cleared only when the conflict is GONE, so
          // a driver who does the lawful thing and STANDS STILL banks the whole
          // wait. After sixty seconds the 0.9 s reaction window and the 3.0 s
          // braking-response band are fifty-nine seconds expired, the only live
          // gate left is `speedKmh > RHR_MOVING_KMH`, and he is billed on the
          // tick the wheels turn — with waiting LONGER making it worse.
          // Measured on rb-mini-v1 before the fix: conviction 0.800 s after the
          // wheels turned after a 4 s wait, and 0.800 s after a 60 s wait —
          // the same 1.4 m of rolling, not a window.
          //
          // RHR_MOVING_KMH is the right floor and not a new one: it is the same
          // threshold the conviction test itself uses, so the clock can never
          // bank time the verdict would refuse to act on.
          if (v.speedKmh <= RHR_MOVING_KMH) rhrCondSince = null;
          else if (rhrCondSince === null) rhrCondSince = tSec; // conflict became visible
        } else {
          rhrCondSince = null;
        }
        // C1: convict only when the conflict has been VISIBLE for at least
        // the reaction window (measured from the conflict's onset — staged
        // "late" arrivals can be born with the driver already at the core)
        // and the driver is not actively braking for it. D1: the braking
        // immunity expires after YIELD_BRAKE_RESPONSE_MAX_SEC — a driver
        // still moving through the core that long after the conflict
        // appeared is crossing, not stopping.
        if (
          !rhrFired &&
          inCore &&
          v.speedKmh > RHR_MOVING_KMH &&
          rightConflict &&
          rhrCondSince !== null &&
          tSec - rhrCondSince >= YIELD_CONVICT_SUSTAIN_SEC &&
          !(brakingResponse && tSec - rhrCondSince <= YIELD_BRAKE_RESPONSE_MAX_SEC)
        ) {
          events.push({ kind: "prioritySituation", situation: "right-hand-rule", violated: true });
          rhrFired = true;
        }
      } else {
        // Just left an uncontrolled junction: reward a correctly-yielded
        // conflict (saw a car from the right, slowed for it, never barged in).
        if (rhrNode !== null && rhrConflictSeen && rhrSlowed && !rhrFired) {
          events.push({
            kind: "prioritySituation",
            situation: "right-hand-rule",
            violated: false,
            yielded: true,
          });
        }
        rhrNode = null;
        rhrFired = false;
        rhrConflictSeen = false;
        rhrSlowed = false;
        rhrCondSince = null;
        rhrApproachYielded = false;
        rhrEnteredCore = false;
        rhrEnteredClear = false;
      }

      // 4c. Roundabout entry: entering the ring (heading inward, at speed) while
      // a vehicle already circulates from the left = failing to give way. Once
      // per approach; slowing to let it pass and not barging in is commended on
      // leaving. Mirrors the right-hand-rule tracker (roundabouts turn CCW, so
      // the driver with priority is on your left).
      let nearRb: (typeof roundabouts)[number] | null = null;
      let nearRbDist2 = Infinity;
      for (const rb of roundabouts) {
        const dx = rb.x - v.position.x;
        const dy = rb.y - v.position.y;
        const d2 = dx * dx + dy * dy;
        // The OBSERVATION zone — out at the give-way paint, not at a constant
        // bolted to the ring (roundaboutGiveWayReachM). Where the road says
        // wait, the instrument is awake.
        if (d2 <= rb.watchReach2 && d2 < nearRbDist2) {
          nearRb = rb;
          nearRbDist2 = d2;
        }
      }
      if (nearRb !== null) {
        // COMMITTED = inside the ring-relative entry radius. Everything that
        // can cost the student points is gated on this and only this; the band
        // between it and the paint is for WATCHING (his stop, his wait, the
        // circulator he let past), which is exactly the evidence the old
        // 30-metre keyhole threw away.
        const committed = nearRbDist2 <= nearRb.commitReach2;
        if (rbNode !== nearRb.id) {
          rbNode = nearRb.id;
          rbFired = false;
          rbConflictSeen = false;
          rbSlowed = false;
          rbAzPrevDeg = null;
          rbAzAccumDeg = 0;
          rbCondSince = null;
          rbCommittedSeen = false;
          rbYieldAwarded = false;
        }
        // The entry is FINISHED the moment he leaves the commit radius having
        // been inside it — that is where the commendation belongs and where it
        // has always fired (see the rbCommittedSeen note above).
        if (committed) rbCommittedSeen = true;
        else if (rbCommittedSeen && !rbYieldAwarded && rbConflictSeen && rbSlowed && !rbFired) {
          events.push({
            kind: "prioritySituation",
            situation: "roundabout",
            violated: false,
            yielded: true,
          });
          rbYieldAwarded = true;
        }
        // Azimuth sweep this visit — ≥ RB_ON_RING_DEG means the vehicle is
        // CIRCULATING (holds ring priority); see the C1 note above. Measured
        // only inside the commit radius, so the latch means the same number of
        // degrees it always did: an arm that does not point at the centre
        // sweeps a few degrees of its own on the long approach, and a sweep
        // budget spent out there would stand entry grading down for a driver
        // who has not entered anything.
        if (!committed) rbAzPrevDeg = null; // re-seed on the next committed frame
        const azDeg = bearingDeg(v.position.x - nearRb.x, v.position.y - nearRb.y);
        if (committed) {
          if (rbAzPrevDeg !== null) rbAzAccumDeg += signedDeltaDeg(rbAzPrevDeg, azDeg);
          rbAzPrevDeg = azDeg;
        }
        const onRing = Math.abs(rbAzAccumDeg) >= RB_ON_RING_DEG;
        const band = nearRb.radius + ROUNDABOUT_BAND_EXTRA_M;
        const circulating = circulatingQuery(
          nearRb.x,
          nearRb.y,
          v.position.x,
          v.position.y,
          v.headingDeg,
          band,
        );
        if (circulating) {
          rbConflictSeen = true;
          // B15 — „I waited for the traffic car 3-4 seconds, than I waited it
          // for twice more and it still stated the error."
          //
          // The sustain clock below is a REACTION window and the braking band
          // is a RESPONSE window; both are measured from `rbCondSince`. Stamped
          // at the conflict's onset and cleared only when the conflict is gone,
          // that stamp goes stale under a driver who does the lawful thing and
          // STANDS STILL: after a 46 s wait the 0.9 s window and the 3.0 s band
          // are 45 s expired, so the only live gate left is `speedKmh >
          // RHR_MOVING_KMH` and he is convicted on the tick the wheels turn —
          // with waiting LONGER making it worse, which is his complaint word
          // for word. Two constants already shipped for this row
          // (RB_WITNESS_STOPPED_NEAR_M, CIRCULATING_REACH_M) are upstream of
          // here and cannot reach it.
          //
          // A stationary driver is not entering anything: he has already made
          // the correct decision, and pulling away afterwards is a NEW act that
          // deserves its own window. Holding the clock at null below the
          // conviction floor makes `tSec - rbCondSince` mean what every gate
          // downstream already reads it as — continuous seconds spent MOVING
          // into a visible conflict. RHR_MOVING_KMH is the right threshold and
          // not an arbitrary new one: it is the same floor the conviction test
          // itself uses, so the clock can never accumulate time the verdict
          // would refuse to act on (a 2 km/h creep must not bank a window it
          // then spends on one jab of throttle).
          //
          // …and the clock only STARTS once he is committed. The observation
          // zone now reaches the give-way paint, tens of metres further out
          // than the ring-relative entry radius; a stamp out there would hand
          // the conviction gates a window that had already expired by the time
          // he arrived, which is the same wrongful conviction this block exists
          // to prevent, wearing a longer approach. Clearing is unconditional on
          // purpose — mercy applies wherever the tracker can see.
          if (v.speedKmh <= RHR_MOVING_KMH) rbCondSince = null;
          else if (rbCondSince === null && committed) rbCondSince = tSec; // conflict became visible
          if (v.speedKmh <= RHR_YIELD_KMH) rbSlowed = true;
        } else {
          rbCondSince = null;
        }
        // Inward component of the heading: >0 means driving into the ring (entering),
        // ~0 means going around it (already has priority) → don't flag.
        const cdx = nearRb.x - v.position.x;
        const cdy = nearRb.y - v.position.y;
        const dist = Math.sqrt(nearRbDist2);
        const rad = (v.headingDeg * Math.PI) / 180;
        const inward = dist > 0 ? (cdx * Math.sin(rad) + cdy * Math.cos(rad)) / dist : 0;
        // C1: reaction window from the conflict's onset + braking-response
        // band + ring-transit latch — as in the RHR tracker above. D1: the
        // braking immunity expires after YIELD_BRAKE_RESPONSE_MAX_SEC.
        if (
          !rbFired &&
          committed &&
          circulating &&
          inward >= ROUNDABOUT_INWARD_MIN &&
          v.speedKmh > RHR_MOVING_KMH &&
          !onRing &&
          rbCondSince !== null &&
          tSec - rbCondSince >= YIELD_CONVICT_SUSTAIN_SEC &&
          !(brakingResponse && tSec - rbCondSince <= YIELD_BRAKE_RESPONSE_MAX_SEC)
        ) {
          events.push({ kind: "prioritySituation", situation: "roundabout", violated: true });
          rbFired = true;
        }
      } else {
        // Left the roundabout vicinity entirely. The award normally landed at
        // the commit radius on the way out; this is the backstop for a visit
        // that ended without ever crossing back out of it — a teleport, a
        // respawn, or a drive that ends on the ring.
        //
        // `rbCommittedSeen` is the guard the wider observation zone makes
        // necessary: the zone now reaches tens of metres up every arm, so a
        // driver merely crawling PAST a roundabout in traffic could satisfy
        // "saw a circulator" and "was under the yield speed" without ever
        // approaching the thing. Praise for a yield he never made is a smaller
        // lie than a conviction he never earned, but it is the same lie.
        if (
          rbNode !== null &&
          rbCommittedSeen &&
          !rbYieldAwarded &&
          rbConflictSeen &&
          rbSlowed &&
          !rbFired
        ) {
          events.push({
            kind: "prioritySituation",
            situation: "roundabout",
            violated: false,
            yielded: true,
          });
        }
        rbNode = null;
        rbFired = false;
        rbConflictSeen = false;
        rbSlowed = false;
        rbAzPrevDeg = null;
        rbAzAccumDeg = 0;
        rbCondSince = null;
        rbCommittedSeen = false;
        rbYieldAwarded = false;
      }

      // 5. Pedestrian-crossing zones.
      zones.update(v.position.x, v.position.y, v.headingDeg, fix.edgeIdx, pedQuery, events);

      // 5b. THE SURFACE CONSULT (see the header block). One query per frame,
      // against the asphalt the world builder actually laid — the lane fix
      // above answers "which edge is nearest", which is a different question
      // and, past the kerb, a fabricated answer.
      const surface = drivableSurface();
      surfaceKnown = surface !== null;
      const offCarriageway =
        surface !== null &&
        surfaceAt(surface, v.position.x, v.position.y, surfaceFix).outsideKerbM >
          OFF_CARRIAGEWAY_M;

      const edgeRt = fix.edgeIdx >= 0 ? index.edgeRt(fix.edgeIdx) : null;
      const maxSpeedKmh = edgeRt ? edgeRt.edge.maxspeed : defaultLimit;
      // WRONG WAY IS A CLAIM ABOUT A ROAD, SO IT STANDS DOWN WHERE THE WORLD
      // DRAWS NO ROAD (sc-ac-wind-truck-pass:71a28c54 — „the detector and the
      // drawn world disagree everywhere it fires"). The one channel carved out
      // of the surface-consult header's „WHAT DELIBERATELY DOES NOT CHANGE",
      // and the carve-out is narrow on purpose: `!offCarriageway` is FALSE
      // wherever `surfaceAt` reports the car within OFF_CARRIAGEWAY_M of drawn
      // asphalt, so nothing on a carriageway can be acquitted by this line.
      //
      // WHAT THE TICK USED TO SAY IN ONE BREATH. `edgeId` above is already
      // `null` past the kerb — the contract's own words, „this car is nowhere" —
      // and this expression published `wrongWay: true` on the SAME tick, off the
      // same lane fix, because the fix survives the kerb out to the locator's
      // 30 m lock radius. MEASURED on `mw-v1` (the row's own wind lesson), car
      // heading due north, i.e. the lawful northbound direction:
      //   · x = −15,5 … −17,0 — the 6 m MEDIAN between the two carriageways,
      //     `under: "verge"`, 1,18–2,68 m past both kerbs — `edgeId: null` and
      //     `wrongWay: true` together, because the nearest centreline happens to
      //     be the SOUTHBOUND one.
      //   · the crosswind trajectory itself (spawn `mw-spawn-approach`, blown
      //     left at 0,6 m/s while driving 60 км/ч): x = −43,6 → −60,5, twenty-
      //     eight seconds and up to 17,9 m past the far kerb, `edgeId: null` and
      //     `wrongWay: true` on every frame until the lock falls away 30 m out.
      // THROUGH THE REAL REDUCER, a car driving north at 50 км/ч along x = −46 —
      // 3,44 m past the southbound kerb, never on any asphalt at any instant of
      // the run — was billed WRONG_WAY at t = 1,6 s: a 10-point ОПАСНА, an
      // instant НЕИЗДЪРЖАН on a 9-point sheet, for driving on grass. THEO-4
      // (doc 64) is what makes that a defect rather than a scoring nit: the card
      // explains «Движеше се срещу посоката на ПЛАТНОТО на автомагистрала» to a
      // seventeen-year-old who can see there is no платно under him, and an
      // explanation the student can refute out of the windscreen teaches him to
      // stop reading them.
      //
      // AND THE LAW NAMES THE SAME BOUNDARY (retrieved, not recalled — ADR-002,
      // `content/law/acts/zdvp.json`, the same two quotations `catalog.ts`
      // already carries for OFF_CARRIAGEWAY). Н38 прил. № 5, т. 10, б. „в" bills
      // the driver who „навлезе срещу движението на пътен възел или ПЪТ С
      // ЕДНОПОСОЧНО ДВИЖЕНИЕ" — an entry into a road; § 6, т. 4 defines
      // „граница на платното за движение" as the line „която отделя платното за
      // движение от другите конструктивни елементи на пътното платно - банкет,
      // тротоар, лента за принудително спиране и други". Past that line there is
      // no платно, so there is no посока на платното to breach.
      //
      // NOT AN AMNESTY, because the act is charged — by the code written for it.
      // The same verge run bills OFF_CARRIAGEWAY at t = 2,2 s, and the same
      // crosswind drift still bills WRONG_WAY at t = 51,2 s, x = −30,8,
      // `under: "carriageway"` — on the OPPOSING asphalt, which is the drive
      // this conviction exists for and the one frame of it that shows a road.
      // What this line removes is only the bill the runtime itself contradicts.
      //
      // …AND IT STANDS DOWN AGAIN WHERE THE WORLD DRAWS NO ONE-WAY EITHER, which
      // is the same row's other half and the half the kerb carve-out above could
      // not reach: both surviving w22 reproductions are on `d2-v1`, on asphalt,
      // on one of the 125 one-way edges that map posts not a single В1, Д4, Г2,
      // Г3 or М10 arrow for. The measurement, the law, the named cost and the
      // roundabout exception are all at `worldStatesOneWayStreets` above.
      const wrongWay =
        edgeRt !== null &&
        edgeRt.edge.oneway &&
        !offCarriageway &&
        (oneWayStreetsStated || edgeRt.edge.roundabout)
          ? isWrongWay(true, index.tangentAt(fix.edgeIdx, fix.sM), v.headingDeg)
          : false;

      const tick: SimTick = {
        t: tSec,
        speedKmh: v.speedKmh,
        maxSpeedKmh,
        position: { x: v.position.x, y: v.position.y },
        headingDeg: v.headingDeg,
        laneOffsetM: fix.laneOffsetM,
        // The rim, measured every tick beside the lane fix — see the field's
        // note in rules/types.ts for why it travels rather than being looked
        // up. Four max() and one hypot() on numbers already in hand; the
        // district is captured once at construction.
        worldEdgeClearanceM: worldEdgeClearanceM(district, v.position.x, v.position.y),
        worldEdgeIsWalled,
        laneId: fix.laneId,
        laneCount: edgeRt ? edgeRt.lanesPerDir : 1,
        // C1: the segment laneId is numbered against — the reducer only
        // grades laneId deltas within one segment (renumbering ≠ maneuver).
        //
        // …AND THE ASPHALT OVERRULES THE LOCK RING (surface-consult block (2)).
        // `fix.edgeId` is the nearest CENTRELINE within 30 m, and on the two
        // findings' own districts 60.0% / 42.1% of the ground it hands an edge
        // back for has no asphalt on it at all. Off the carriageway this
        // channel now says what its contract says it means — „this car is
        // nowhere" — so `lessons/finish.ts`'s off-network ending
        // can start its clock at the KERB instead of one lock-radius past it.
        // Everything else on this tick still rides `fix`: the lane fix stays a
        // lane fix, and only the road-MEMBERSHIP question is re-answered.
        edgeId: offCarriageway ? null : fix.edgeId,
        indicator: v.indicator,
        headlights: v.headlights,
        seatbeltOn: v.seatbeltOn,
        handbrakeOn: v.handbrakeOn,
        gear: v.gear,
        isNight,
        rain,
        leadGapM,
        wrongWay,
        events,
      };
      // FOG condition (doc 72 AC-03) — flows onto the tick exactly like rain,
      // but stays ADDITIVE (set only when on) so pre-fog tick shapes are
      // untouched; the fog-lamp channel rides along the same way. SNOW
      // (doc 72 AC-08 winter grip) is the same seam again.
      if (fog) tick.fog = true;
      if (snow) tick.snow = true;
      // RX-05 — the oncoming RAIL vehicle's arrival gap (see the local above),
      // on the same additive seam: absent on every frame that has no tram
      // bearing down on the junction, which is every frame of every other
      // lesson in the catalogue.
      if (oncomingRailGapSec !== undefined) tick.oncomingRailGapSec = oncomingRailGapSec;
      // THE PERSON IN THE PATH (`SimTick.vruAheadM`) — additive, and published
      // ONLY when a body was actually measured, so every drive, trace and
      // fixture that has no staged pedestrian grades byte-identically to
      // before. `Infinity` is not „nobody at 0 m", it is „this reporter cannot
      // answer", and the rule engine reads an absent field and an infinite one
      // the same way: it convicts. The channel only ever ACQUITS, and it had no
      // writer at all until this line — see `orchestrator/contact.ts
      // vruAheadMeters` for the frames.
      if (Number.isFinite(vruAheadM)) tick.vruAheadM = vruAheadM;
      if (v.fogLightsOn !== undefined) tick.fogLightsOn = v.fogLightsOn;
      // THE PEDAL (SimTick.throttlePedal) — the same additive seam: published
      // only by a rig that HAS an accelerator channel, so every recorded trace
      // and every hand-built sample leaves the tick exactly as it shipped.
      if (v.throttlePedal !== undefined) tick.throttlePedal = v.throttlePedal;
      // …and the IGNITION, on the same seam and for the same detector: the
      // parking brake is only a blocker on a car whose engine is running.
      if (v.engineOn !== undefined) tick.engineOn = v.engineOn;
      // B1a additive world context (doc 72 capabilities 1 + N3): flows onto
      // the tick exactly the way maxSpeedKmh does — from the resolved edge.
      if (v.stalled !== undefined) tick.stalled = v.stalled;
      if (edgeRt !== null) {
        tick.oneway = edgeRt.edge.oneway;
        // PAINTED LANE MARKINGS (doc 86 T1) — the world builder's own answer,
        // resolved by the committed lane fix exactly the way maxSpeedKmh is.
        // Published ONLY in the disarming direction (see SimTick.centreLinePainted):
        // a road that IS painted leaves the tick byte-identical to before.
        if (!fix.centreLinePainted) tick.centreLinePainted = false;
        if (!fix.laneLinesPainted) tick.laneLinesPainted = false;
        if (edgeRt.edge.zone !== undefined) tick.zone = edgeRt.edge.zone;
        if (edgeRt.edge.noOvertake !== undefined) tick.noOvertake = edgeRt.edge.noOvertake;
        if (edgeRt.edge.noUTurn !== undefined) tick.noUTurn = edgeRt.edge.noUTurn;
        // MOTORWAY-SEGMENT slice (doc 72 SP-10): the authored edge tag flows
        // onto the tick exactly like the other surface tags — data, never a
        // heuristic; absent (every pre-slice map) sets nothing.
        if (edgeRt.edge.motorway !== undefined) tick.motorway = edgeRt.edge.motorway;
        // N1 (doc 72 OV-14): one marked lane TOTAL on a two-way road = the
        // narrow-street-meeting context. Surface-only (see SimTick doc).
        if (!edgeRt.edge.oneway && edgeRt.edge.lanes <= 1) tick.narrowTwoWay = true;
        // Stage 2b — opposing-bank world context (the CROSSED_SOLID_LINE
        // channel): on a TWO-WAY edge, the committed lane fix's bank has a
        // nominal travel direction (fix.travelDir); a vehicle whose heading
        // opposes its occupied bank sits fully past the осева, on the
        // oncoming half. Set only when true (legal over a dashed line — the
        // reducer grades it exclusively inside authored М1 spans). The same
        // adjudication channel wrongWay rides for one-ways, off the SAME
        // committed fix — no extra geometry, no heuristics.
        if (!edgeRt.edge.oneway) {
          const [otx, oty] = index.tangentAt(fix.edgeIdx, fix.sM);
          const headingSign: 1 | -1 =
            Math.abs(signedDeltaDeg(v.headingDeg, bearingDeg(otx, oty))) <= 90 ? 1 : -1;
          if (headingSign !== fix.travelDir) tick.opposingBank = true;
        }
      }
      // PAST THE KERB THERE IS NO PAINT (the surface consult, header block).
      // The two paint flags above are resolved from `laneMarkingAt`, which
      // answers for the EDGE — it is a function of arclength, not of whether
      // the car is on the roadway at all — so within the locator's 30 m lock
      // ring a car standing in a field inherits the road's markings and the
      // lane detectors grade it against them. Overrides the block above
      // deliberately: this is the same T1 question ("does the world draw a
      // line where the car is") answered by the strictly better referent.
      //
      // ONE-SIDED, and only in the direction the evidence supports: a car on
      // the asphalt is byte-identical to before (`offCarriageway` false ⇒ this
      // block never runs), so nothing here can acquit a student on the road.
      // The false-conviction sweep in drivable-surface.test.ts — every lane
      // centre of every drawn ribbon on all 105 shipped districts, 86,907
      // points — is what licenses that claim.
      if (offCarriageway) {
        tick.centreLinePainted = false;
        tick.laneLinesPainted = false;
      }
      // М10 lane-intent arrow of the lane the car is actually in (M-17) —
      // resolved from the committed fix like every other authored span, and
      // set only when a readable glyph governs this lane (absent = innocent).
      // `!offCarriageway` for the same reason the two paint flags above are
      // cleared and the emergencyLane/busLane flags below are withheld: an
      // arrow is PAINT ON A LANE, and past the kerb the world draws neither.
      // Absent = innocent, so this can only ever acquit.
      if (fix.edgeIdx >= 0 && !offCarriageway) {
        const arrow = laneArrowAt(
          laneArrowsByEdge.get(fix.edgeIdx),
          fix.sM,
          fix.laneId,
          fix.travelDir,
        );
        if (arrow !== undefined) tick.laneArrow = arrow;
      }
      // ZONE-BAN membership (ADR-006 stage 2a; stage 2b vocabulary; stage 3a
      // rail): flags flow onto the tick exactly the way maxSpeedKmh does —
      // from the resolved edge + the lane fix's arclength. Absent zones
      // (every shipped v1 file) sets nothing.
      if (fix.edgeIdx >= 0) {
        const spans = banZonesByEdge.get(fix.edgeIdx);
        if (spans !== undefined) {
          // Rail phase needs the travel direction (which side of the band
          // lies AHEAD) — the same committed-fix tangent test the
          // next-stop-line context runs. Computed lazily: only frames on a
          // rail-carrying edge OUTSIDE the band pay for it.
          let railTravelSign: 1 | -1 | 0 = 0;
          for (let i = 0; i < spans.length; i++) {
            const z = spans[i];
            if (z.kind === "railCrossing") {
              // RAIL PACK slice 1 (doc 72 RX-01/02/03): the span IS the track
              // band; the phase is "on" inside it, "approach" within
              // RAIL_APPROACH_M before it in the travel direction, absent
              // otherwise (absent = innocent — the reducer's contract).
              let phase: "approach" | "on" | null =
                fix.sM >= z.fromM && fix.sM <= z.toM ? "on" : null;
              if (phase === null) {
                if (railTravelSign === 0) {
                  const [rtx, rty] = index.tangentAt(fix.edgeIdx, fix.sM);
                  railTravelSign =
                    Math.abs(signedDeltaDeg(v.headingDeg, bearingDeg(rtx, rty))) <= 90 ? 1 : -1;
                }
                if (railTravelSign > 0 && fix.sM >= z.fromM - RAIL_APPROACH_M && fix.sM < z.fromM) {
                  phase = "approach";
                } else if (railTravelSign < 0 && fix.sM > z.toM && fix.sM <= z.toM + RAIL_APPROACH_M) {
                  phase = "approach";
                }
              }
              if (phase !== null) {
                // "on" dominates an overlapping span's "approach".
                if (phase === "on" || tick.railCrossing === undefined) tick.railCrossing = phase;
                if (z.railGuarded) tick.railGuarded = true;
                // Deterministic barrier timetable: barred exactly when the
                // session clock sits in the authored down-window (periodic —
                // same session, same phases, always). Guarded without a valid
                // timetable = never barred (open — innocent, A12).
                if (z.railBarrier !== null) {
                  const b = z.railBarrier;
                  const cyclePos = tSec % b.cycleSec;
                  if (cyclePos >= b.downFromSec && cyclePos < b.downToSec) tick.railBarred = true;
                }
              }
              continue;
            }
            if (fix.sM >= z.fromM && fix.sM <= z.toM) {
              if (z.kind === "noStopping") tick.noStopZone = true;
              else if (z.kind === "noParking") tick.noParkZone = true;
              else if (z.kind === "noOvertaking") tick.noOvertakeZone = true;
              else if (z.kind === "solidCenterLine") tick.solidCenterLine = true;
              else if (z.kind === "curveAdvisory") {
                // Curve-envelope slice (doc 72 SP-05): the advisory speed of
                // the marked arc, resolved like maxspeed — from the committed
                // lane fix. Overlapping spans compose by MIN (the most
                // restrictive envelope governs, the condition-factor law).
                if (tick.curveAdvisoryKmh === undefined || z.advisoryKmh < tick.curveAdvisoryKmh) {
                  tick.curveAdvisoryKmh = z.advisoryKmh;
                }
              } else if (z.kind === "emergencyLane") {
                // Motorway-segment slice (doc 72 SP-10): the curb lane of this
                // span is the лента за принудително спиране — the busLaneRight
                // seam, mirrored (the flag names the LANE's legality; the
                // reducer's laneId gate decides the fault).
                //
                // …AND A LANE-IDENTITY CLAIM STANDS DOWN WHERE THE WORLD DRAWS
                // NO LANE — the second channel carved out of the surface
                // consult, on the same predicate and for the same reason
                // wrongWay was (sc-ac-truck-spray:7e53374c). This block is gated
                // on the locator's 30 m LOCK RADIUS while `edgeId` and the paint
                // flags are measured at the KERB, so on mw-v1
                // `emergencyLaneRight` was published 17.8 m past both kerbs, and
                // a car 17.44 m into the grass was billed OFF_CARRIAGEWAY at
                // t = 2 s and then EMERGENCY_LANE_DRIVING — 10 точки, ОПАСНА —
                // at t = 3 s, for a refuge lane it was seventeen metres from.
                // ONE-SIDED: both flags only RAISE a required lane index or arm
                // a fault, so withholding them can acquit and never convict, and
                // on the asphalt `offCarriageway` is false and this is
                // byte-identical. Measurements + both directions:
                // `__tests__/off-carriageway-lane-identity.test.ts`.
                if (!offCarriageway) tick.emergencyLaneRight = true;
              } else if (!offCarriageway) tick.busLaneRight = true;
            }
          }
        }
      }
      // 6. OVERTAKE-CORRIDOR tracker (doc 72 OV-05/OV-08) — runs on the
      // ASSEMBLED tick context (opposingBank + solidCenterLine are resolved
      // above; the director appends after sample(), so event order holds).
      // Bands, disciplines and exemptions documented at
      // OVERTAKE_CONVICT_GAP_SEC; state doc at the oc* declarations.
      //
      // THE М1 SEAM, 2026-08-09 — the corridor now measures INSIDE solid spans.
      // -----------------------------------------------------------------------
      // This predicate used to carry `tick.solidCenterLine !== true`, on the
      // stage-2b reading that an М1 span "is CROSSED_SOLID_LINE's act". While
      // that code billed опасна (10) the omission was invisible: the geometry
      // charge stood in for the danger. The 2026-08-09 Наредба № 38 review
      // demoted CROSSED_SOLID_LINE to основна (3) — correctly, because the
      // detector establishes no предпоставка — and that made the omission the
      // whole exposure: nothing measured oncoming traffic exactly where sight
      // distance is worst, so a head-on gamble across a solid line billed 3
      // unless it ended in a collision. A single continuous overtake also
      // LOST its accumulated tight-gap episode the frame it touched the paint
      // (the else-branch below clears ocTightSince/ocEmitted), so driving
      // deeper into the dangerous half actively acquitted the driver.
      //
      // Two acts, two laws, two lessons — the catalogue's own stage-2b ruling,
      // and the SPEED_TOO_FAST_FOR_CURVE precedent: crossing the paint is
      // Наредба № 2/2001 М1 (knowledge — б. „а"), gambling against a closing
      // oncoming car is ЗДвП чл. 42, ал. 1 („свободен път на разстояние,
      // достатъчно за маневрата"). Where both happen, both grade.
      //
      // WHAT IS DELIBERATELY *NOT* CHANGED: the OV-09 RETURN tracker below
      // keeps the seam byte-for-byte (`orArmed`). Its adjudication fires on
      // the frame the excursion ends as a committed return, and its own exit
      // test already requires `solidCenterLine !== true`; sc-ov-solid-return's
      // whole pedagogy is that an excursion which lands inside the span is
      // CROSSED_SOLID_LINE's alone. Widening the corridor is a measurement;
      // widening the return would be a second charge for the same landing.
      const ocBase =
        tick.opposingBank === true &&
        edgeRt !== null &&
        !edgeRt.edge.oneway &&
        edgeRt.edge.lanes >= 2 && // narrow two-way = the OV-14 runner's act
        nearestIx === null && // junction sweeps = the JU-10 tracker's act
        v.gear >= 0; // reverse maneuvering is exempt (A12)
      /** Head-on measurement: armed on dashed AND solid осева alike. */
      const ocArmed = ocBase;
      /** OV-09 return adjudication: the М1 seam, exactly as shipped. */
      const orArmed = ocBase && tick.solidCenterLine !== true;
      if (ocArmed) {
        ocExcursion = true;
        const committed = v.speedKmh > OVERTAKE_COMMIT_MIN_KMH;
        // Rich telemetry only: a legacy boolean probe carries no gap, and the
        // corridor NEVER convicts on presence alone (err innocent — contrast
        // the left-turn tight-radius fallback, whose conflict frame is a
        // fixed node; here the frame travels with the player).
        const probe = oncomingQuery(
          v.position.x,
          v.position.y,
          v.headingDeg,
          OVERTAKE_ONCOMING_RADIUS_M,
        );
        let gapSec: number | undefined;
        if (typeof probe === "object" && probe !== null) {
          if (probe.closingMps >= LEFT_TURN_MIN_CLOSING_MPS) {
            gapSec = probe.distM / probe.closingMps;
          }
        }
        if (committed && gapSec !== undefined && gapSec <= OVERTAKE_CONVICT_GAP_SEC) {
          if (ocTightSince === null) {
            ocTightSince = tSec;
            ocTightOnsetT = tSec;
          }
          ocLastTightT = tSec;
          ocTightGapSec = gapSec;
        } else if (ocTightSince !== null && tSec - ocLastTightT > OVERTAKE_GAP_MEMORY_SEC) {
          // The tight episode genuinely dissolved (oncoming passed/turned off,
          // or the driver eased under the commit bar) — beyond the memory
          // latch that keeps a guard-stopped victim's claim alive.
          ocTightSince = null;
        }
        // THE ABORT (OV-08 — sacred): braking out of the excursion within the
        // D1-bounded reaction window stands the conviction down; returning to
        // the own bank resets the excursion below. A gambler who neither
        // brakes nor returns holds the condition through the sustain.
        const standDown =
          brakingResponse && tSec - ocTightOnsetT <= YIELD_BRAKE_RESPONSE_MAX_SEC;
        if (
          !ocEmitted &&
          ocTightSince !== null &&
          committed &&
          tSec - ocTightSince >= YIELD_CONVICT_SUSTAIN_SEC &&
          !standDown
        ) {
          const ev: Extract<SimTickEvent, { kind: "prioritySituation" }> = {
            kind: "prioritySituation",
            situation: "overtake-oncoming",
            violated: true,
          };
          if (ocTightGapSec !== undefined) ev.gapSec = ocTightGapSec;
          events.push(ev);
          ocEmitted = true;
        }
      } else if (ocExcursion) {
        ocExcursion = false;
        ocEmitted = false;
        ocTightSince = null;
        ocTightOnsetT = -Infinity;
        ocLastTightT = -Infinity;
        ocTightGapSec = undefined;
      }
      // 6a'. OVERTAKE-RETURN tracker (doc 72 OV-09) — rides the corridor's
      // OWN armed context, MINUS the М1 span (`orArmed` above): the pass
      // phases are watched during the opposing-bank excursion, the single
      // adjudication happens on the frame the excursion ends as a COMMITTED
      // RETURN to the own bank. Bands + the reference-speed latch documented
      // at OVERTAKE_RETURN_CONVICT_GAP_SEC.
      if (orArmed) {
        orExcursion = true;
        // One act, one code: the corridor billing this same excursion stands
        // the return adjudication down (read while still armed — the oc
        // else-branch clears ocEmitted before the return frame runs).
        if (ocEmitted) orCorridorBilled = true;
        const mate = overtakenQuery(
          v.position.x,
          v.position.y,
          v.headingDeg,
          OVERTAKE_RETURN_PROBE_RADIUS_M,
        );
        if (mate !== null) {
          const orRad = (v.headingDeg * Math.PI) / 180;
          const orFx = Math.sin(orRad);
          const orFy = Math.cos(orRad);
          const along =
            (mate.x - v.position.x) * orFx + (mate.y - v.position.y) * orFy;
          if (along > OVERTAKE_RETURN_PASS_MARGIN_M) orSawAhead = true;
          else if (orSawAhead && along < -OVERTAKE_RETURN_PASS_MARGIN_M) orPassed = true;
          // Forcing window, MATE frame (the staged playerGuard's geometry,
          // widened): once the player's cut is what any braking answers, the
          // reference speed freezes — the rescue can no longer acquit.
          const mLen = Math.hypot(mate.dirX, mate.dirY);
          const mDx = mLen > 0 ? mate.dirX / mLen : orFx;
          const mDy = mLen > 0 ? mate.dirY / mLen : orFy;
          const relAlong =
            (v.position.x - mate.x) * mDx + (v.position.y - mate.y) * mDy;
          const relLat = Math.abs(
            (v.position.x - mate.x) * mDy - (v.position.y - mate.y) * mDx,
          );
          if (
            relAlong > 0 &&
            relAlong < OVERTAKE_RETURN_FORCE_AHEAD_M &&
            relLat < OVERTAKE_RETURN_FORCE_LATERAL_M
          ) {
            orForced = true;
          }
          if (!orForced) orRefSpeedMps = mate.speedMps;
        }
      } else if (orExcursion) {
        // The excursion ended THIS frame. A COMMITTED RETURN is the one exit
        // where every other corridor condition still holds and only the bank
        // flipped home — anything else (junction area, solid span, edge loss,
        // reverse, narrow road) discards the episode silently (A12).
        const returned =
          tick.opposingBank !== true &&
          tick.solidCenterLine !== true &&
          edgeRt !== null &&
          !edgeRt.edge.oneway &&
          edgeRt.edge.lanes >= 2 &&
          nearestIx === null &&
          v.gear >= 0 &&
          v.speedKmh > OVERTAKE_COMMIT_MIN_KMH;
        if (returned && orPassed && !orCorridorBilled) {
          const mate = overtakenQuery(
            v.position.x,
            v.position.y,
            v.headingDeg,
            OVERTAKE_RETURN_PROBE_RADIUS_M,
          );
          if (mate !== null) {
            const orRad = (v.headingDeg * Math.PI) / 180;
            const orFx = Math.sin(orRad);
            const orFy = Math.cos(orRad);
            const along =
              (mate.x - v.position.x) * orFx + (mate.y - v.position.y) * orFy;
            // The landing frame is itself forcing geometry when the player
            // has arrived inside the mate's window — latch BEFORE any
            // reference update, so a rescue landing on the very frame of the
            // bank flip still cannot acquit the cut (the sharpest case; in
            // continuous motion the excursion frames latch earlier).
            const mLen = Math.hypot(mate.dirX, mate.dirY);
            const mDx = mLen > 0 ? mate.dirX / mLen : orFx;
            const mDy = mLen > 0 ? mate.dirY / mLen : orFy;
            const relAlong =
              (v.position.x - mate.x) * mDx + (v.position.y - mate.y) * mDy;
            const relLat = Math.abs(
              (v.position.x - mate.x) * mDy - (v.position.y - mate.y) * mDx,
            );
            if (
              relAlong > 0 &&
              relAlong < OVERTAKE_RETURN_FORCE_AHEAD_M &&
              relLat < OVERTAKE_RETURN_FORCE_LATERAL_M
            ) {
              orForced = true;
            }
            // A final un-forced frame keeps the reference honest (a mate that
            // slowed on its own keeps lowering it right up to the landing).
            if (!orForced) orRefSpeedMps = mate.speedMps;
            if (along < -OVERTAKE_RETURN_PASS_MARGIN_M) {
              const bumperM = Math.max(0, -along - OVERTAKE_RETURN_BODY_M);
              if (orRefSpeedMps >= OVERTAKE_RETURN_MIN_REF_MPS) {
                const gapSec = bumperM / orRefSpeedMps;
                if (gapSec < OVERTAKE_RETURN_CONVICT_GAP_SEC) {
                  events.push({
                    kind: "prioritySituation",
                    situation: "overtake-return",
                    violated: true,
                    gapSec,
                  });
                }
                // 1.0–2.0 s: the teach band — silent; ≥ 2 s: clean by silence.
              }
            }
          }
        }
        orReset();
      }
      // 6b. VULNERABLE-PASS tracker (doc 72 VU-02 — bands/stand-downs at
      // VULNERABLE_PASS_PROBE_RADIUS_M). Mid-block only: a junction area
      // DISCARDS the episode wholesale — the right-hook family there is the
      // CyclistRightHookRunner's act (VU-01), and a turn's rotating frame
      // would read as a phantom "pass". Reverse maneuvering discards (A12).
      if (nearestIx !== null || v.gear < 0) {
        if (vpActive) vpReset();
      } else {
        const cyc = cyclistQuery(
          v.position.x,
          v.position.y,
          v.headingDeg,
          VULNERABLE_PASS_PROBE_RADIUS_M,
        );
        if (cyc === null) {
          // Left the probe without completing (player stopped short / turned
          // away) — no pass happened; discard, never bill.
          if (vpActive) vpReset();
        } else {
          const vpRad = (v.headingDeg * Math.PI) / 180;
          const vpFx = Math.sin(vpRad);
          const vpFy = Math.cos(vpRad);
          const vpDx = cyc.x - v.position.x;
          const vpDy = cyc.y - v.position.y;
          const alongM = vpDx * vpFx + vpDy * vpFy;
          const lateralM = Math.abs(vpDx * vpFy - vpDy * vpFx);
          const playerMps = Math.abs(v.speedKmh) / 3.6;
          if (
            !vpActive &&
            alongM > VULNERABLE_PASS_ALONGSIDE_M &&
            alongM <= VULNERABLE_PASS_ARM_AHEAD_M &&
            v.speedKmh > VULNERABLE_PASS_MIN_KMH &&
            playerMps - cyc.speedMps >= VULNERABLE_PASS_MIN_CLOSING_MPS
          ) {
            // ARM: cyclist AHEAD in the window, the player at pass speed and
            // genuinely CLOSING from behind (a cyclist overtaking a slower
            // player never arms — err innocent). Freeze the cyclist's line.
            vpActive = true;
            vpMinLateralM = Infinity;
            vpSawAlongside = false;
            vpSwerve = false;
            vpC0x = cyc.x;
            vpC0y = cyc.y;
            const dLen = Math.hypot(cyc.dirX, cyc.dirY);
            vpD0x = dLen > 0 ? cyc.dirX / dLen : vpFx;
            vpD0y = dLen > 0 ? cyc.dirY / dLen : vpFy;
            const side = vpD0x * (v.position.y - cyc.y) - vpD0y * (v.position.x - cyc.x);
            vpSideSign = side >= 0 ? 1 : -1;
          }
          if (vpActive) {
            // Swerve stand-down: the cyclist's OWN drift off its frozen line,
            // toward the player's side (the VU-03 pothole-dodge reality) —
            // graded is the margin the driver SET, never what the cyclist
            // consumed. Curved-road drift also lands here: it biases toward
            // standing down, the A12 direction.
            const drift = vpD0x * (cyc.y - vpC0y) - vpD0y * (cyc.x - vpC0x);
            if (drift * vpSideSign >= VULNERABLE_PASS_SWERVE_M) vpSwerve = true;
            if (
              Math.abs(alongM) <= VULNERABLE_PASS_ALONGSIDE_M &&
              v.speedKmh >= VULNERABLE_PASS_MIN_KMH
            ) {
              vpSawAlongside = true;
              if (lateralM < vpMinLateralM) vpMinLateralM = lateralM;
            }
            if (alongM <= -VULNERABLE_PASS_DONE_BEHIND_M) {
              // Pass complete — adjudicate ONCE, then re-arm for the next.
              if (vpSawAlongside && !vpSwerve) {
                if (
                  vpMinLateralM < VULNERABLE_PASS_CONVICT_LATERAL_M &&
                  vpMinLateralM > VULNERABLE_PASS_CONTACT_M
                ) {
                  events.push({
                    kind: "prioritySituation",
                    situation: "vulnerable-pass",
                    violated: true,
                  });
                } else if (vpMinLateralM >= VULNERABLE_PASS_SAFE_LATERAL_M) {
                  events.push({
                    kind: "prioritySituation",
                    situation: "vulnerable-pass",
                    violated: false,
                    yielded: true,
                  });
                }
                // 2.45–2.75 m: the honest teach band — silent (doc above);
                // ≤ the contact bar: the collision machinery's act.
              }
              vpReset();
            }
          }
        }
      }
      if (nextStopLineM !== undefined) {
        tick.nextStopLineM = nextStopLineM;
        tick.nextStopLineControl = nextStopLineControl;
        if (nextStopLineState !== undefined) tick.nextStopLineState = nextStopLineState;
      }
      if (nextJunctionM !== undefined) tick.nextJunctionM = nextJunctionM;
      return tick;
    },

    signalPhase(signalNodeId: string): SignalPhase {
      return signals.phase(signalNodeId);
    },

    signalLampState(signalNodeId: string, approachBearingDeg?: number): SignalLampState {
      return signals.lampState(signalNodeId, approachBearingDeg);
    },

    signalPhaseForApproach(signalNodeId: string, bearingDeg: number): SignalPhase {
      return signals.phaseForApproach(signalNodeId, bearingDeg);
    },

    railBarrierDownAt(x: number, y: number): boolean {
      let best = -1;
      let bestD2 = RAIL_BARRIER_MATCH_M * RAIL_BARRIER_MATCH_M;
      for (let i = 0; i < railBarrierProps.length; i++) {
        const p = railBarrierProps[i];
        const dx = p.x - x;
        const dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (best < 0) return false; // no guarded crossing near = nothing barred
      const p = railBarrierProps[best];
      if (p.cycleSec <= 0) return false; // guarded-but-never-barred = open (A12)
      const cyclePos = lastSampleTSec % p.cycleSec;
      return cyclePos >= p.downFromSec && cyclePos < p.downToSec;
    },

    signalPhaseInfo(signalNodeId: string, approachBearingDeg?: number): SignalPhaseInfo {
      return signals.phaseInfo(signalNodeId, approachBearingDeg);
    },

    setSignalClusterOffset(signalNodeId: string, offsetSec: number): void {
      signals.setClusterOffset(signalNodeId, offsetSec);
    },

    setSignalClusterMode(signalNodeId: string, mode: SignalClusterMode): void {
      signals.setClusterMode(signalNodeId, mode);
    },

    setSignalClusterController(
      signalNodeId: string,
      schedule: SignalControllerSchedule | null,
    ): void {
      signals.setClusterController(signalNodeId, schedule);
    },

    signalControllerFigure(out: ControllerFigureState): boolean {
      return signals.figureState(out);
    },

    signalOffsetForPhaseStart(
      signalNodeId: string,
      approachBearingDeg: number,
      phase: SignalPhase,
      inSec: number,
    ): number {
      return signals.offsetForPhaseStart(signalNodeId, approachBearingDeg, phase, inSec);
    },

    armSignalPlan(plan: SignalPlanSpec, near?: { x: number; y: number }): void {
      signalPlanPin = null;
      // Fail-innocent on malformed data: no pin beats a wrong pin (A12).
      if (plan.arm !== "greenFresh" && plan.arm !== "redFresh") return;
      if (!(Number.isFinite(plan.triggerM) && plan.triggerM > 0)) return;
      const clusters = signals.clusters;
      let target: SignalClusterInfo | null = null;
      if (plan.clusterId !== undefined) {
        const wanted = plan.clusterId;
        target = clusters.find((c) => c.id === wanted || c.memberNodeIds.includes(wanted)) ?? null;
      } else if (near !== undefined) {
        let best = Infinity;
        for (const c of clusters) {
          const d2 = (c.x - near.x) * (c.x - near.x) + (c.y - near.y) * (c.y - near.y);
          if (d2 < best) {
            best = d2;
            target = c;
          }
        }
      } else if (clusters.length === 1) {
        target = clusters[0];
      }
      if (target === null) return;
      signalPlanPin = {
        nodeId: target.memberNodeIds[0],
        x: target.x,
        y: target.y,
        trigger2: plan.triggerM * plan.triggerM,
        arm: plan.arm,
        fired: false,
      };
    },

    speedLimitAt(pos: { x: number; y: number }): number {
      if (index.nearestEdge(pos.x, pos.y, OFF_ROAD_DISTANCE_M, speedLimitHit)) {
        return index.edgeRt(speedLimitHit.edgeIdx).edge.maxspeed;
      }
      return defaultLimit;
    },

    locate(pos: { x: number; y: number }): { edgeId: string | null; laneId: number; laneOffsetM: number } {
      const fix = locator.peek(pos.x, pos.y);
      return { edgeId: fix.edgeId, laneId: fix.laneId, laneOffsetM: fix.laneOffsetM };
    },

    surfaceUnderCar(out: SurfaceFix): boolean {
      if (!surfaceKnown) return false;
      out.under = surfaceFix.under;
      out.outsideKerbM = surfaceFix.outsideKerbM;
      return true;
    },

    setDrivableSurface(surface: DrivableSurface | null): void {
      if (surface === null) {
        // Clearing an injection must not leave the lazy path believing it has
        // already resolved — otherwise a null hand-over permanently blinds the
        // consult.
        if (drivableInjected) {
          drivableInjected = false;
          drivable = null;
          drivableResolved = false;
        }
        return;
      }
      drivableInjected = true;
      drivableResolved = true;
      // Same guard as the lazy path: an index with no asphalt is "unknown",
      // never "the whole world is off-road".
      drivable = surface.counts.carriageway > 0 ? surface : null;
    },

    setPedestrianQuery(fn: PedestrianQuery | null): void {
      pedQuery = fn ?? (() => false);
    },

    setJunctionConflictQuery(fn: JunctionConflictQuery | null): void {
      conflictQuery = fn ?? (() => false);
    },

    setOncomingQuery(fn: OncomingQuery | null): void {
      oncomingQuery = fn ?? (() => false);
    },

    setRightConflictQuery(fn: RightConflictQuery | null): void {
      rightConflictQuery = fn ?? (() => false);
    },

    setCirculatingQuery(fn: CirculatingQuery | null): void {
      circulatingQuery = fn ?? (() => false);
    },

    setCyclistQuery(fn: CyclistQuery | null): void {
      cyclistQuery = fn ?? (() => null);
    },

    setOvertakenQuery(fn: CyclistQuery | null): void {
      overtakenQuery = fn ?? (() => null);
    },

    debugUncontrolledJunctions() {
      return uncontrolledJunctions;
    },

    pushCollision(withWhat: CollisionWith, bodyId?: string): void {
      collisionQueue.push({ withWhat, bodyId });
    },

    debugStopLines(): readonly StopLine[] {
      return stopLines.all;
    },

    debugSignalClusters(): readonly SignalClusterInfo[] {
      return signals.clusters;
    },

    debugRoundaboutZones() {
      return roundabouts.map((rb) => ({
        id: rb.id,
        watchReachM: Math.sqrt(rb.watchReach2),
        commitReachM: Math.sqrt(rb.commitReach2),
      }));
    },
  };

  return runtime;
}
