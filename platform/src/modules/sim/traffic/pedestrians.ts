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
import { edgeParkingWidthM } from "../world/builders/network";
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

// ---------------------------------------------------------------------------
// Where a pedestrian walks, laterally — founder item B14/B46/B49, the CAUSE.
//
// HIS SENTENCE, three lessons running: „the Pedestrian at the end when he
// leaves the Zebra, he goes trough a car", „he passes like a ghost trough some
// car", „ghost crossing trough stopped car".
//
// It was never a rendering or a collision bug. It is two constants that were
// written years apart and have overlapped by construction ever since:
//
//   • this file put the sidewalk at `travelHalf + 0.4 + 1.2 = travelHalf + 1.6`,
//     a number from before the 4 m curbside parking band and before the
//     procedural parked row existed;
//   • `TrafficLayer` seats every parked body at `travelHalf + PARK_BAND_CENTER_M`
//     (2.0) with a half-width of 0.95, i.e. spanning
//     `travelHalf + 1.05 … travelHalf + 2.95`.
//
// travelHalf + 1.6 is 0.55 m INSIDE the near flank of every parked car in the
// district. Not sometimes — always, on every street the pass parks. Measured
// over the 100 committed districts before this change: **19 of 121 pedestrian
// walk loops on 11 districts pass through a parked body, up to 1.25 m deep**
// (zb-v1 — the lesson he was looking at — 2 of 2; rb-ped-v1 3 of 3;
// pe-school-v1, pe-zone-v1, ov-crossing-v1, pk-banx-v1, rx-tram-stop-v1,
// rx-tram-island-v1 all 1 of 1).
//
// The SECOND half of the same mistake, and the one FR-21's fix created: the
// offset was measured from the TRAVEL lanes, not from the kerb. Where a street
// declares `parkingBand` the world moves its kerb out 4 m — and the walk did
// not move with it, so the pedestrian was left walking down the middle of the
// parking lane, on the carriageway. Measured: **50 crossing-edges on 5
// districts had their walk line inside the kerb.**
//
// So the offset is now derived from the same geometry the world draws the kerb
// with and the parking pass seats bodies in:
//
//   • no procedural row on the footway (a declared band puts the row inside
//     the carriageway, or the street parks nobody) — walk `PED_STAND_BACK_M`
//     past the KERB, mid-pavement, exactly as before but from the right datum;
//   • row standing ON the footway (the FR-21 budget: a class the pass parks but
//     the world draws no band for) — walk `PED_KERB_WALK_M` past the kerb, i.e.
//     BETWEEN the kerb and the cars. It is tight, because a 1.9 m car parked in
//     the middle of a 3.5 m pavement genuinely leaves 1.05 m at the kerb and
//     0.55 m at the wall. Kerbside and not wallside on purpose: a walker behind
//     the row is hidden from the driver, and the whole lesson is about seeing
//     her.
// ---------------------------------------------------------------------------

/** Walker half-width (shoulders), m — what must clear a parked body's flank. */
export const PED_SHOULDER_HALF_M = 0.25;
/** Stand-back from the kerb on a clear pavement, m (the historic 1.6 measured
 *  from the travel lanes, now measured from the kerb). */
export const PED_STAND_BACK_M = 1.6;
/** Stand-back where the procedural parked row stands on the footway, m.
 *  Bounded on both sides and there is no slack in it:
 *    ≥ SIDEWALK_SKIRT_M 0.35 + shoulders 0.25 = 0.60 (fully off the kerb face)
 *    ≤ (PARK_BAND_CENTER_M 2.0 − PARKED_HALF_W_M 0.95) − 0.25 = 0.80 (clear of
 *      the nearest body's flank). */
export const PED_KERB_WALK_M = 0.7;
/** Lead-in each side of the carriageway that still counts as "on the crossing"
 *  for `crossingCounts` / the rule engine — a pedestrian who has stepped off
 *  the kerb is already «стъпил на пътеката» (ЗДвП чл. 119).
 *
 *  1.1 m is not a new number: it is what today's geometry implied (a 1.6 m
 *  stand-back with a 0.5 m margin), reproduced exactly so that moving the WALK
 *  LINE can never shrink a graded window. Where the walk is pulled in to the
 *  kerb the margin clamps at 0 and the window only grows. */
const CROSSING_LEAD_IN_M = 1.1;

/**
 * Lateral offset of the sidewalk this edge's walkers use, measured from the
 * road centre line. `laneWidthM` is the runtime's lane width (the world's
 * LANE_WIDTH_M); the parking band comes from the same `edgeParkingWidthM` the
 * kerb, the ribbon, the colliders and the FR-21 footway ledger all use, so the
 * walk and the kerb can never disagree again.
 */
export function pedSidewalkOffsetM(edge: DistrictEdge, laneWidthM: number): number {
  const travelHalf = (Math.max(1, edge.lanes) * laneWidthM) / 2;
  const bandM = edgeParkingWidthM(edge);
  const kerb = travelHalf + bandM;
  // A row on the FOOTWAY is exactly the case `parked-on-footway.test.ts`
  // budgets: the pass parks this class, and the world draws it no band. An
  // explicit `parkingBand: false` says the street parks nobody at all.
  const rowOnFootway = bandM === 0 && (edge as { parkingBand?: unknown }).parkingBand !== false;
  return kerb + (rowOnFootway ? PED_KERB_WALK_M : PED_STAND_BACK_M);
}

/** Carriageway half width (kerb line) — the span a crossing walk grades over. */
export function pedCarriagewayHalfM(edge: DistrictEdge, laneWidthM: number): number {
  return (Math.max(1, edge.lanes) * laneWidthM) / 2 + edgeParkingWidthM(edge);
}

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

  // B14 — kerb line and walking line from the same geometry the world uses.
  const halfRoad = pedCarriagewayHalfM(edge, laneWidthM);
  const sideOff = pedSidewalkOffsetM(edge, laneWidthM);
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
  // Roadway span within the cross segment: the carriageway itself, opened by
  // CROSSING_LEAD_IN_M each side so a walker who has stepped off the kerb
  // already counts as on the crossing.
  const margin = Math.max(0, (crossLen - 2 * halfRoad) / 2 - CROSSING_LEAD_IN_M);
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
