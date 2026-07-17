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
 * before sample(); the events drain into the next tick, in push order.
 *
 * Event order within one tick: collisions, mirrorGlance, stopLineCrossed,
 * turnStarted, crossing-zone events.
 *
 * Pure TypeScript — no React/three/Rapier imports (vitest-safe, ADR-002).
 */

import type { SignalPhase, SignalPlanSpec, VehicleSample, WorldRuntime } from "../contracts";
import type { SimTick, SimTickEvent } from "../rules/types";
import { BG_URBAN_DEFAULT_KMH, parseDistrict, type District } from "./district";
import { Locator } from "./locator";
import { DistrictIndex, makeEdgeHit, OFF_ROAD_DISTANCE_M } from "./spatial";
import { bearingDeg, signedDeltaDeg } from "./geometry";
import {
  SignalController,
  type SignalClusterInfo,
  type SignalClusterMode,
  type SignalControllerSchedule,
} from "./signals";
import { buildStopLines, type StopLine, type StopLineSet } from "./stoplines";
import { CrossingZoneTracker, type PedestrianQuery } from "./zones";
import { JUNCTION_AREA_RADIUS_M, TurnDetector } from "./turns";

/** A stop line can re-fire only after this long (jitter at the line must not
 * spam RED_LIGHT_CROSSED; a genuine re-approach takes longer anyway). */
const STOP_LINE_REFIRE_SEC = 5;

/** How far ahead on the current edge the next-stop-line context reaches, m. */
const NEXT_LINE_WATCH_M = 120;
/** Junction-proximity context radius (harsh-brake cause gate), m. */
const JUNCTION_CONTEXT_RADIUS_M = 80;
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
 * RAIL PACK slice 1 (ADR-006 stage 3a — doc 72 RX-01/RX-02/RX-03): how far
 * BEFORE the authored track band (travel direction) the "approach" phase of
 * tick.railCrossing reaches, meters. The reducer requires a seen approach
 * before it will adjudicate a band entry, so a vehicle materialising ON the
 * band (teleport/spawn) is structurally innocent. Exported for tests.
 */
export const RAIL_APPROACH_M = 30;

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
 *    (runner CYCLIST_CONTACT_M parity) — one act, one code;
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
/** At/under this center distance the act is a CONTACT — the collision
 * machinery's code (orchestrator CYCLIST_CONTACT_M parity), never this one, m. */
export const VULNERABLE_PASS_CONTACT_M = 2.2;

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
/** How far beyond a roundabout's ring the entry-yield decision zone reaches,
 * meters (entry mouths widened with the perceptual road scale). */
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

/** Is there a vehicle approaching from the player's right near a junction? */
export type RightConflictQuery = (
  jx: number,
  jy: number,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
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
  /** Physics layer reports a contact; drained into the next sample(). */
  pushCollision(withWhat: CollisionWith): void;
  /** Phase a driver approaching `signalNodeId` on `bearingDeg` sees (renderer helper). */
  signalPhaseForApproach(signalNodeId: string, bearingDeg: number): SignalPhase;
  readonly district: District;
  /** Introspection for tests/devtools. */
  debugStopLines(): readonly StopLine[];
  debugSignalClusters(): readonly SignalClusterInfo[];
  /** Uncontrolled (right-hand-rule) junction nodes with positions — devtools/tests. */
  debugUncontrolledJunctions(): ReadonlyArray<{ id: string; x: number; y: number }>;
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

  const lineLastFired = new Float64Array(stopLines.all.length).fill(-Infinity);
  const collisionQueue: CollisionWith[] = [];
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
  }

  // Uncontrolled (right-hand-rule) junctions: real junctions (degree >= 3) that
  // are neither signalized nor guarded by any stop/give-way line → equal
  // junctions where you give way to the right.
  const guardedNodeIds = new Set(stopLines.all.map((l) => l.junctionNodeId));
  const uncontrolledJunctions = district.intersections
    .filter((it) => !it.signalized && it.degree >= 3 && !guardedNodeIds.has(it.id))
    .map((it) => ({ id: it.id, x: it.x, y: it.y }));
  const uncontrolledIds = new Set(uncontrolledJunctions.map((j) => j.id));
  const roundabouts = district.roundabouts;

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
  let rbNode: string | null = null; // roundabout currently being approached
  let rbFired = false;
  let rbConflictSeen = false; // circulating traffic observed this approach
  let rbSlowed = false; // driver slowed to yield speed while it was circulating
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
      // reducer's giveWay branch grades nothing at the line itself). Byte-
      // identical for every shipped map: no Б1 node is authored, so line.control
      // is always "stopSign" in this branch.
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
    ): SimTick {
      const events: SimTickEvent[] = [];

      // 1. Collisions reported by physics since the last tick.
      while (collisionQueue.length > 0) {
        events.push({ kind: "collision", withWhat: collisionQueue.shift() as CollisionWith });
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
      turns.update(tSec, v.headingDeg, nearestIx !== null, events);
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
      if (nearestIx !== null && isUncontrolledJunction(nearestIx.id)) {
        if (rhrNode !== nearestIx.id) {
          rhrNode = nearestIx.id;
          rhrFired = false;
          rhrConflictSeen = false;
          rhrSlowed = false;
          rhrCondSince = null;
        }
        const rightConflict = rightConflictQuery(
          nearestIx.x,
          nearestIx.y,
          v.position.x,
          v.position.y,
          v.headingDeg,
          PRIORITY_CONFLICT_RADIUS_M,
        );
        if (rightConflict) {
          rhrConflictSeen = true;
          if (rhrCondSince === null) rhrCondSince = tSec; // conflict became visible
          if (v.speedKmh <= RHR_YIELD_KMH) rhrSlowed = true;
        } else {
          rhrCondSince = null;
        }
        const dx = nearestIx.x - v.position.x;
        const dy = nearestIx.y - v.position.y;
        const inCore = dx * dx + dy * dy <= RHR_CORE_RADIUS_M * RHR_CORE_RADIUS_M;
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
        const reach = rb.radius + ROUNDABOUT_ENTRY_MARGIN_M;
        if (d2 <= reach * reach && d2 < nearRbDist2) {
          nearRb = rb;
          nearRbDist2 = d2;
        }
      }
      if (nearRb !== null) {
        if (rbNode !== nearRb.id) {
          rbNode = nearRb.id;
          rbFired = false;
          rbConflictSeen = false;
          rbSlowed = false;
          rbAzPrevDeg = null;
          rbAzAccumDeg = 0;
          rbCondSince = null;
        }
        // Azimuth sweep this visit — ≥ RB_ON_RING_DEG means the vehicle is
        // CIRCULATING (holds ring priority); see the C1 note above.
        const azDeg = bearingDeg(v.position.x - nearRb.x, v.position.y - nearRb.y);
        if (rbAzPrevDeg !== null) rbAzAccumDeg += signedDeltaDeg(rbAzPrevDeg, azDeg);
        rbAzPrevDeg = azDeg;
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
          if (rbCondSince === null) rbCondSince = tSec; // conflict became visible
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
        // Left the roundabout vicinity: reward a correctly-yielded entry.
        if (rbNode !== null && rbConflictSeen && rbSlowed && !rbFired) {
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
      }

      // 5. Pedestrian-crossing zones.
      zones.update(v.position.x, v.position.y, v.headingDeg, fix.edgeIdx, pedQuery, events);

      const edgeRt = fix.edgeIdx >= 0 ? index.edgeRt(fix.edgeIdx) : null;
      const maxSpeedKmh = edgeRt ? edgeRt.edge.maxspeed : defaultLimit;
      const wrongWay =
        edgeRt !== null && edgeRt.edge.oneway
          ? isWrongWay(true, index.tangentAt(fix.edgeIdx, fix.sM), v.headingDeg)
          : false;

      const tick: SimTick = {
        t: tSec,
        speedKmh: v.speedKmh,
        maxSpeedKmh,
        position: { x: v.position.x, y: v.position.y },
        headingDeg: v.headingDeg,
        laneOffsetM: fix.laneOffsetM,
        laneId: fix.laneId,
        laneCount: edgeRt ? edgeRt.lanesPerDir : 1,
        // C1: the segment laneId is numbered against — the reducer only
        // grades laneId deltas within one segment (renumbering ≠ maneuver).
        edgeId: fix.edgeId,
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
      if (v.fogLightsOn !== undefined) tick.fogLightsOn = v.fogLightsOn;
      // B1a additive world context (doc 72 capabilities 1 + N3): flows onto
      // the tick exactly the way maxSpeedKmh does — from the resolved edge.
      if (v.stalled !== undefined) tick.stalled = v.stalled;
      if (edgeRt !== null) {
        tick.oneway = edgeRt.edge.oneway;
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
                tick.emergencyLaneRight = true;
              } else tick.busLaneRight = true;
            }
          }
        }
      }
      // 6. OVERTAKE-CORRIDOR tracker (doc 72 OV-05/OV-08) — runs on the
      // ASSEMBLED tick context (opposingBank + solidCenterLine are resolved
      // above; the director appends after sample(), so event order holds).
      // Bands, disciplines and exemptions documented at
      // OVERTAKE_CONVICT_GAP_SEC; state doc at the oc* declarations.
      const ocArmed =
        tick.opposingBank === true &&
        tick.solidCenterLine !== true && // М1 span = CROSSED_SOLID_LINE's act
        edgeRt !== null &&
        !edgeRt.edge.oneway &&
        edgeRt.edge.lanes >= 2 && // narrow two-way = the OV-14 runner's act
        nearestIx === null && // junction sweeps = the JU-10 tracker's act
        v.gear >= 0; // reverse maneuvering is exempt (A12)
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
      // OWN armed context (ocArmed above): the pass phases are watched during
      // the opposing-bank excursion, the single adjudication happens on the
      // frame the excursion ends as a COMMITTED RETURN to the own bank.
      // Bands + the reference-speed latch documented at
      // OVERTAKE_RETURN_CONVICT_GAP_SEC.
      if (ocArmed) {
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

    signalPhaseForApproach(signalNodeId: string, bearingDeg: number): SignalPhase {
      return signals.phaseForApproach(signalNodeId, bearingDeg);
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

    pushCollision(withWhat: CollisionWith): void {
      collisionQueue.push(withWhat);
    },

    debugStopLines(): readonly StopLine[] {
      return stopLines.all;
    },

    debugSignalClusters(): readonly SignalClusterInfo[] {
      return signals.clusters;
    },
  };

  return runtime;
}
