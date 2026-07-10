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

export interface DistrictWorldRuntime extends WorldRuntime {
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

  // Previous-frame tracking for line-crossing detection.
  let prevEdgeIdx = -1;
  let prevS = 0;
  let lastMoveSign: 1 | -1 | 0 = 0;

  const speedLimitHit = makeEdgeHit();

  function lightStateOf(line: StopLine): "red" | "yellow" | "green" {
    const phase = signals.phaseForClusterGroup(line.clusterIdx, line.group ?? "ns");
    // red+yellow legally still forbids entry — graded as red.
    return phase === "redYellow" ? "red" : phase;
  }

  function fireLine(line: StopLine, lineIdx: number, tSec: number, events: SimTickEvent[]): void {
    if (tSec - lineLastFired[lineIdx] < STOP_LINE_REFIRE_SEC) return;
    lineLastFired[lineIdx] = tSec;
    if (line.control === "trafficLight") {
      events.push({ kind: "stopLineCrossed", control: "trafficLight", lightState: lightStateOf(line) });
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

      // 3. Lane fix (committed hysteresis) + stop-line crossings.
      const fix = locator.track(v.position.x, v.position.y);
      detectStopLines(fix.edgeIdx, fix.sM, tSec, events);
      prevEdgeIdx = fix.edgeIdx;
      prevS = fix.sM;

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
          if (v.speedKmh <= RHR_YIELD_KMH) rhrSlowed = true;
        }
        const dx = nearestIx.x - v.position.x;
        const dy = nearestIx.y - v.position.y;
        const inCore = dx * dx + dy * dy <= RHR_CORE_RADIUS_M * RHR_CORE_RADIUS_M;
        if (!rhrFired && inCore && v.speedKmh > RHR_MOVING_KMH && rightConflict) {
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
        }
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
          if (v.speedKmh <= RHR_YIELD_KMH) rbSlowed = true;
        }
        // Inward component of the heading: >0 means driving into the ring (entering),
        // ~0 means going around it (already has priority) → don't flag.
        const cdx = nearRb.x - v.position.x;
        const cdy = nearRb.y - v.position.y;
        const dist = Math.sqrt(nearRbDist2);
        const rad = (v.headingDeg * Math.PI) / 180;
        const inward = dist > 0 ? (cdx * Math.sin(rad) + cdy * Math.cos(rad)) / dist : 0;
        if (
          !rbFired &&
          circulating &&
          inward >= ROUNDABOUT_INWARD_MIN &&
          v.speedKmh > RHR_MOVING_KMH
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
      }

      // 5. Pedestrian-crossing zones.
      zones.update(v.position.x, v.position.y, v.headingDeg, fix.edgeIdx, pedQuery, events);

      const edgeRt = fix.edgeIdx >= 0 ? index.edgeRt(fix.edgeIdx) : null;
      const maxSpeedKmh = edgeRt ? edgeRt.edge.maxspeed : defaultLimit;
      const wrongWay =
        edgeRt !== null && edgeRt.edge.oneway
          ? isWrongWay(true, index.tangentAt(fix.edgeIdx, fix.sM), v.headingDeg)
          : false;

      return {
        t: tSec,
        speedKmh: v.speedKmh,
        maxSpeedKmh,
        position: { x: v.position.x, y: v.position.y },
        headingDeg: v.headingDeg,
        laneOffsetM: fix.laneOffsetM,
        laneId: fix.laneId,
        laneCount: edgeRt ? edgeRt.lanesPerDir : 1,
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
    },

    signalPhase(signalNodeId: string): SignalPhase {
      return signals.phase(signalNodeId);
    },

    signalPhaseForApproach(signalNodeId: string, bearingDeg: number): SignalPhase {
      return signals.phaseForApproach(signalNodeId, bearingDeg);
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
