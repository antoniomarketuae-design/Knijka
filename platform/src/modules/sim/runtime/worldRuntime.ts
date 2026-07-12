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
import { SignalController, type SignalClusterInfo } from "./signals";
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

/** Radius around a junction to look for conflicting priority traffic, meters.
 * Junction catchments grew with the perceptual road scale (mouths now sit
 * 17–43 m out) — exported for tests. */
export const PRIORITY_CONFLICT_RADIUS_M = 26;
/** Look-ahead for oncoming traffic when turning left, meters (scaled). */
export const LEFT_TURN_ONCOMING_RADIUS_M = 36;
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

/** Is there an oncoming vehicle ahead of the player (for turning left across it)? */
export type OncomingQuery = (
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
) => boolean;

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

  // Uncontrolled (right-hand-rule) junctions: real junctions (degree >= 3) that
  // are neither signalized nor guarded by any stop/give-way line → equal
  // junctions where you give way to the right.
  const guardedNodeIds = new Set(stopLines.all.map((l) => l.junctionNodeId));
  const uncontrolledJunctions = district.intersections
    .filter((it) => !it.signalized && it.degree >= 3 && !guardedNodeIds.has(it.id))
    .map((it) => ({ id: it.id, x: it.x, y: it.y }));
  const uncontrolledIds = new Set(uncontrolledJunctions.map((j) => j.id));
  const roundabouts = district.roundabouts;

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
        nextStopLineM = nextLineDistM;
        nextStopLineControl = line.control;
        if (line.control === "trafficLight") nextStopLineState = lightStateOf(line);
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
      // Turning left while oncoming traffic is approaching = failure to yield.
      for (let i = beforeTurns; i < events.length; i++) {
        const te = events[i];
        if (
          te.kind === "turnStarted" &&
          te.direction === "left" &&
          oncomingQuery(v.position.x, v.position.y, v.headingDeg, LEFT_TURN_ONCOMING_RADIUS_M)
        ) {
          events.push({ kind: "prioritySituation", situation: "left-turn", violated: true });
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

      // 4b. Right-hand rule: entering an uncontrolled junction's core while a
      // vehicle approaches from the right = failing to give way (once per
      // visit). Slowing for that same conflict and NOT barging in earns a
      // positive commendation, awarded on leaving the junction.
      if (nearestIx !== null && uncontrolledIds.has(nearestIx.id)) {
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
      // B1a additive world context (doc 72 capabilities 1 + N3): flows onto
      // the tick exactly the way maxSpeedKmh does — from the resolved edge.
      if (v.stalled !== undefined) tick.stalled = v.stalled;
      if (edgeRt !== null) {
        tick.oneway = edgeRt.edge.oneway;
        if (edgeRt.edge.zone !== undefined) tick.zone = edgeRt.edge.zone;
        if (edgeRt.edge.noOvertake !== undefined) tick.noOvertake = edgeRt.edge.noOvertake;
        if (edgeRt.edge.noUTurn !== undefined) tick.noUTurn = edgeRt.edge.noUTurn;
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
