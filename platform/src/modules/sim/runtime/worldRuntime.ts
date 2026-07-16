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

import type { SignalPhase, VehicleSample, WorldRuntime } from "../contracts";
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
    | "railCrossing";
  const KNOWN_ZONE_KINDS = new Set<string>([
    "noStopping",
    "noParking",
    "noOvertaking",
    "solidCenterLine",
    "busLane",
    "railCrossing",
  ]);
  interface ZoneSpan {
    kind: KnownZoneKind;
    fromM: number;
    toM: number;
    /** railCrossing only (stage 3a): guarded flag + validated timetable. */
    railGuarded: boolean;
    railBarrier: { cycleSec: number; downFromSec: number; downToSec: number } | null;
  }
  const banZonesByEdge = new Map<number, ZoneSpan[]>();
  for (const z of district.zones ?? []) {
    if (!KNOWN_ZONE_KINDS.has(z.kind)) continue;
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM < z.toM)) continue;
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
      events.push({ kind: "stopLineCrossed", control: "stopSign" });
      // Give-way/stop: crossing into the junction while conflicting traffic is
      // present now = failing to yield (graded FAILED_TO_YIELD by the reducer).
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
      let nextStopLineControl: "stopSign" | "trafficLight" | undefined;
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
      // untouched; the fog-lamp channel rides along the same way.
      if (fog) tick.fog = true;
      if (v.fogLightsOn !== undefined) tick.fogLightsOn = v.fogLightsOn;
      // B1a additive world context (doc 72 capabilities 1 + N3): flows onto
      // the tick exactly the way maxSpeedKmh does — from the resolved edge.
      if (v.stalled !== undefined) tick.stalled = v.stalled;
      if (edgeRt !== null) {
        tick.oneway = edgeRt.edge.oneway;
        if (edgeRt.edge.zone !== undefined) tick.zone = edgeRt.edge.zone;
        if (edgeRt.edge.noOvertake !== undefined) tick.noOvertake = edgeRt.edge.noOvertake;
        if (edgeRt.edge.noUTurn !== undefined) tick.noUTurn = edgeRt.edge.noUTurn;
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
              else tick.busLaneRight = true;
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
