/**
 * Pedestrian agents — sidewalk out-and-back loops anchored on a crossing.
 *
 * Each pedestrian owns a precomputed loop of segments:
 *   walk sidewalk A -> [wait, cross] -> walk sidewalk B out -> walk B back ->
 *   [wait, cross back] -> walk A back -> repeat
 * Before every "cross" segment the agent waits 1-2 s at the curb, then polls
 * a gate each frame:
 *   - signalized crossing: go when the VEHICLE phase for the mapped signal
 *     node is "red" (that is the pedestrian green),
 *   - unsignalized: go when no traffic vehicle is within the safe time gap on
 *     the crossing's lanes AND the player is not bearing down on it (a
 *     player STOPPED near the crossing does not block — that is the yield
 *     teaching moment).
 *
 * While a pedestrian is on the roadway span of a crossing the system's
 * crossingCounts map is incremented — that feeds TrafficSystem.pedestrianOnCrossing
 * (and through the runtime's setPedestrianQuery hook, the rule engine).
 */

import type { SignalPhase } from "../contracts";
import { offsetPolyline, projectOntoPolyline, sampleLane, type LaneGraph } from "./graph";
import { rngRange, type Rng } from "./rng";
import type { VehicleAgent } from "./vehicles";
import type { DistrictCrossing, DistrictEdge, TrafficConfig, TrafficPedestrianState } from "./types";

export interface PedSegment {
  kind: "walk" | "cross";
  crossingId: string | null;
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  length: number;
  /** Roadway span of a cross segment (arc range that counts as on-crossing). */
  roadFrom: number;
  roadTo: number;
  /** Crossing center — used by the unsignalized player-gap check. */
  crossX: number;
  crossY: number;
}

export interface PedRoute {
  segments: PedSegment[];
}

export type PedMode = "walking" | "waiting";

export interface PedestrianAgent {
  state: TrafficPedestrianState;
  route: PedRoute;
  segIdx: number;
  s: number;
  segHint: number;
  mode: PedMode;
  waitLeft: number;
  /** Per-agent rng stream (wait-time jitter) — keeps determinism local. */
  rng: Rng;
  baseSpeed: number;
  /** Whether this agent currently counts toward its crossing's occupancy. */
  onRoad: boolean;
}

export interface PedestrianEnv {
  cfg: TrafficConfig;
  graph: LaneGraph;
  vehicles: VehicleAgent[];
  crossingCounts: Map<string, number>;
  signalPhase: (id: string) => SignalPhase;
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedKmh: number;
}

const SIDEWALK_MARGIN_M = 1.2;

const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

// ---------------------------------------------------------------------------
// Route construction
// ---------------------------------------------------------------------------

function makeSegment(
  kind: "walk" | "cross",
  crossingId: string | null,
  pts: number[][],
  roadFrom: number,
  roadTo: number,
  crossX: number,
  crossY: number,
): PedSegment {
  const off = offsetPolyline(pts, 0);
  return {
    kind,
    crossingId,
    px: off.px,
    py: off.py,
    cum: off.cum,
    length: off.length,
    roadFrom,
    roadTo,
    crossX,
    crossY,
  };
}

/** Slice of a polyline between arc lengths s0 < s1 (as point list). */
function subPolyline(
  px: Float64Array,
  py: Float64Array,
  cum: Float64Array,
  s0: number,
  s1: number,
): number[][] {
  const pts: number[][] = [];
  const evalAt = (s: number): [number, number] => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const segLen = cum[i + 1] - cum[i];
    const t = segLen > 0 ? (s - cum[i]) / segLen : 0;
    return [px[i] + (px[i + 1] - px[i]) * t, py[i] + (py[i + 1] - py[i]) * t];
  };
  pts.push(evalAt(s0));
  for (let i = 0; i < cum.length; i++) {
    if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) pts.push([px[i], py[i]]);
  }
  pts.push(evalAt(s1));
  return pts;
}

/**
 * Build a pedestrian loop anchored on `crossing`. Returns null when the
 * crossing's edge is degenerate (too short to host a walk).
 */
export function buildPedRoute(
  crossing: DistrictCrossing,
  edge: DistrictEdge,
  laneWidthM: number,
  rng: Rng,
): PedRoute | null {
  if (edge.geometry.length < 2) return null;
  const center = offsetPolyline(edge.geometry, 0);
  if (center.length < 10) return null;

  const proj = projectOntoPolyline(center.px, center.py, center.cum, crossing.x, crossing.y);
  const sC = Math.min(Math.max(proj.s, 1), center.length - 1);

  const halfRoad = (edge.lanes * laneWidthM) / 2 + 0.4;
  const sideOff = halfRoad + SIDEWALK_MARGIN_M;
  const back = Math.min(rngRange(rng, 25, 60), sC);
  const fwd = Math.min(rngRange(rng, 25, 60), center.length - sC);

  // Sidewalk sub-polylines around the crossing, offset each side of the road.
  const approachPts = subPolyline(center.px, center.py, center.cum, sC - back, sC);
  const awayPts = subPolyline(center.px, center.py, center.cum, sC, sC + fwd);
  const sideA = offsetPolyline(approachPts, sideOff); // right of edge direction
  const sideB = offsetPolyline(awayPts, -sideOff); // left of edge direction

  const toPts = (o: { px: Float64Array; py: Float64Array }, reverse: boolean): number[][] => {
    const pts: number[][] = [];
    for (let i = 0; i < o.px.length; i++) pts.push([o.px[i], o.py[i]]);
    if (reverse) pts.reverse();
    return pts;
  };

  const aEnd: number[] = [sideA.px[sideA.px.length - 1], sideA.py[sideA.py.length - 1]];
  const bStart: number[] = [sideB.px[0], sideB.py[0]];
  const crossLen = Math.hypot(bStart[0] - aEnd[0], bStart[1] - aEnd[1]);
  if (crossLen < 2) return null;
  // Roadway span within the cross segment (with a step margin each side).
  const margin = Math.max(0.3, (crossLen - 2 * halfRoad) / 2 - 0.7);
  const roadFrom = margin;
  const roadTo = crossLen - margin;

  const segments: PedSegment[] = [
    makeSegment("walk", null, toPts(sideA, false), 0, 0, 0, 0),
    makeSegment("cross", crossing.id, [aEnd, bStart], roadFrom, roadTo, crossing.x, crossing.y),
    makeSegment("walk", null, toPts(sideB, false), 0, 0, 0, 0),
    makeSegment("walk", null, toPts(sideB, true), 0, 0, 0, 0),
    makeSegment("cross", crossing.id, [bStart, aEnd], roadFrom, roadTo, crossing.x, crossing.y),
    makeSegment("walk", null, toPts(sideA, true), 0, 0, 0, 0),
  ];
  for (const seg of segments) if (!(seg.length > 0.2)) return null;
  return { segments };
}

export function createPedestrianAgent(
  id: number,
  route: PedRoute,
  rng: Rng,
  colorIndex: number,
  cfg: TrafficConfig,
): PedestrianAgent {
  const startS = rng() * route.segments[0].length * 0.9;
  return {
    state: {
      id,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      walkPhase: rng() * Math.PI * 2,
      onCrossing: false,
      colorIndex,
    },
    route,
    segIdx: 0,
    s: startS,
    segHint: 0,
    mode: "walking",
    waitLeft: 0,
    rng,
    baseSpeed: cfg.pedSpeedMps * rngRange(rng, 0.85, 1.15),
    onRoad: false,
  };
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------

/** May the pedestrian start (or keep) crossing `crossingId`? */
export function crossingGateOpen(
  crossingId: string,
  crossX: number,
  crossY: number,
  env: PedestrianEnv,
): boolean {
  const signalNode = env.graph.crossingSignalNode.get(crossingId);
  if (signalNode) {
    // Vehicle red = pedestrian green.
    return env.signalPhase(signalNode) === "red";
  }
  // Unsignalized: require a safe gap to every traffic vehicle approaching
  // the crossing on any lane it spans.
  const refs = env.graph.crossingLanes.get(crossingId);
  if (refs) {
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      for (let j = 0; j < env.vehicles.length; j++) {
        const veh = env.vehicles[j];
        if (veh.route.laneIndices[veh.routePos] !== ref.laneIndex) continue;
        if (veh.s > ref.s + 2) continue; // already past the crossing
        const dist = ref.s - veh.s;
        if (dist < 12) return false;
        if (dist / Math.max(veh.speed, 0.3) < env.cfg.pedGapSec) return false;
      }
    }
  }
  // Player gap: a MOVING player nearby blocks; a stopped one yields.
  if (env.hasPlayer && env.playerSpeedKmh > 5) {
    const dx = env.playerX - crossX;
    const dy = env.playerY - crossY;
    if (dx * dx + dy * dy < env.cfg.pedPlayerGapM * env.cfg.pedPlayerGapM) return false;
  }
  return true;
}

function setOnRoad(agent: PedestrianAgent, crossingId: string | null, on: boolean, env: PedestrianEnv): void {
  if (agent.onRoad === on || !crossingId) return;
  agent.onRoad = on;
  agent.state.onCrossing = on;
  const count = env.crossingCounts.get(crossingId) ?? 0;
  env.crossingCounts.set(crossingId, Math.max(0, count + (on ? 1 : -1)));
}

export function updatePedestrian(agent: PedestrianAgent, dt: number, env: PedestrianEnv): void {
  const segments = agent.route.segments;
  let seg = segments[agent.segIdx];

  if (agent.mode === "waiting") {
    agent.state.speedMps = 0;
    if (agent.waitLeft > 0) {
      agent.waitLeft -= dt;
    } else if (crossingGateOpen(seg.crossingId as string, seg.crossX, seg.crossY, env)) {
      agent.mode = "walking";
    }
    return; // stands at the curb (pose already published on arrival)
  }

  const speed = seg.kind === "cross" ? agent.baseSpeed * 1.25 : agent.baseSpeed;
  agent.s += speed * dt;
  agent.state.walkPhase += speed * dt * 2.4;

  // On-crossing bookkeeping for the roadway span.
  if (seg.kind === "cross") {
    setOnRoad(agent, seg.crossingId, agent.s >= seg.roadFrom && agent.s <= seg.roadTo, env);
  }

  // Segment transitions (a frame never spans two segments at walking speed).
  if (agent.s >= seg.length) {
    if (seg.kind === "cross") setOnRoad(agent, seg.crossingId, false, env);
    agent.segIdx = (agent.segIdx + 1) % segments.length;
    agent.s = 0;
    agent.segHint = 0;
    seg = segments[agent.segIdx];
    if (seg.kind === "cross") {
      agent.mode = "waiting";
      agent.waitLeft = rngRange(agent.rng, env.cfg.pedWaitMinSec, env.cfg.pedWaitMaxSec);
    }
  }

  // Publish pose.
  sampleLane(seg, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = speed;
}
