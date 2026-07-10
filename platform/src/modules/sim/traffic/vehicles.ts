/**
 * Vehicle agents — kinematic route followers with IDM-lite car following.
 *
 * Each agent tracks (routePos, s) along its precomputed loop. Per frame it
 * gathers the most restrictive interaction term from:
 *   - the nearest agent ahead on its current/next lane (following distance),
 *   - the player vehicle projected onto its heading (never drive through),
 *   - stop points ahead: red/yellow signals at lane ends, occupied pedestrian
 *     crossings, unsignalized-intersection slots it failed to reserve,
 * then integrates an IDM acceleration. Pure kinematics — agents are never
 * physics bodies and can never push the player (a hard post-integration
 * clamp guarantees they also never overlap the player or a leader).
 *
 * Zero per-frame allocations: agents and scratch objects live for the whole
 * session and are mutated in place.
 */

import type { SignalPhase } from "../contracts";
import { JUNCTION_TRIM_MAX_FRACTION, STOP_LINE_BEYOND_CUT_M } from "../world/builders/network";
import { sampleLane, type DirectedLane, type LaneGraph } from "./graph";
import type { TrafficRoute } from "./routes";
import type { TrafficConfig, TrafficVehicleState } from "./types";

export const VEHICLE_LENGTH_M = 4.3;
/** Half-length margin used for gap math (own half + obstacle half). */
const HALF_LEN = VEHICLE_LENGTH_M / 2;

export interface VehicleAgent {
  state: TrafficVehicleState;
  route: TrafficRoute;
  /** Index into route.laneIndices. */
  routePos: number;
  /** Arc length along the current lane. */
  s: number;
  segHint: number;
  /** Current speed, m/s (mirrored into state.speedMps). */
  speed: number;
  /** Desired-speed factor vs the legal limit (0.82..1.0 — role models). */
  desiredFactor: number;
  /** Signal node the agent committed to pass on yellow (no late braking). */
  committedSignalNode: string | null;
  /** Unsignalized intersection node currently reserved by this agent. */
  heldNode: string | null;
}

/** Time-slot reservation for one unsignalized intersection node. */
export interface NodeReservation {
  holder: number; // agent id, -1 = free
  renewedAt: number; // sim time of last renewal; stale slots are reclaimed
}

/** Everything updateVehicle reads — owned and refreshed by system.ts. */
export interface VehicleEnv {
  cfg: TrafficConfig;
  graph: LaneGraph;
  agents: VehicleAgent[];
  reservations: Map<string, NodeReservation>;
  /** crossingId -> pedestrians currently on the roadway span. */
  crossingCounts: Map<string, number>;
  signalPhase: (id: string) => SignalPhase;
  timeSec: number;
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedMps: number;
  playerDirX: number;
  playerDirY: number;
}

/** Braking headroom kept between the reservation attempt and the stop point. */
const RESERVE_AHEAD_M = 12;
const RESERVATION_STALE_SEC = 0.8;
/** Minimum arc past the node before a reservation releases (floor — raised
 *  to the junction radius so the box is actually clear before release). */
const HOLD_PAST_MIN_M = 8;
/** Stop-point floor before an unsignalized junction NODE center, meters. */
const UNSIGNALIZED_STOP_FLOOR_M = 6.5;
const IDM_DELTA = 4;

/**
 * Where this lane's junction stop point sits, measured back from the node:
 * the drawn junction mouth (graph.junctionRadiusM, clamped per lane exactly
 * like the world builder's ribbon trim) + the paint inset, floored by the
 * config offset. Keeps NPC noses OUTSIDE the scaled junction patch, on the
 * same line the player is graded against.
 */
function junctionStopOffsetM(graph: LaneGraph, lk: DirectedLane, floorM: number): number {
  const radius = graph.junctionRadiusM.get(lk.toNode) ?? 0;
  const cut = Math.min(radius, lk.length * JUNCTION_TRIM_MAX_FRACTION);
  return Math.max(floorM, cut + STOP_LINE_BEYOND_CUT_M);
}

// Scratch for polyline sampling — module-level, update() is single-threaded.
const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

export function createVehicleAgent(
  id: number,
  route: TrafficRoute,
  loopS: number,
  desiredFactor: number,
  colorIndex: number,
): VehicleAgent {
  // Map a loop-space arc length to (routePos, s).
  let routePos = 0;
  while (
    routePos < route.laneIndices.length - 1 &&
    loopS >= route.laneStartS[routePos + 1]
  ) {
    routePos++;
  }
  return {
    state: {
      id,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      braking: false,
      colorIndex,
    },
    route,
    routePos,
    s: loopS - route.laneStartS[routePos],
    segHint: 0,
    speed: 0,
    desiredFactor,
    committedSignalNode: null,
    heldNode: null,
  };
}

function lane(env: VehicleEnv, agent: VehicleAgent, offset: number): DirectedLane {
  const idxs = agent.route.laneIndices;
  return env.graph.lanes[idxs[(agent.routePos + offset) % idxs.length]];
}

/** IDM interaction term (sStar/gap)^2 for an obstacle at gap with speed vLead. */
function idmTerm(cfg: TrafficConfig, v: number, gap: number, vLead: number): number {
  const g = gap < 0.01 ? 0.01 : gap;
  const sStar =
    cfg.minGapM +
    Math.max(
      0,
      v * cfg.headwaySec +
        (v * (v - vLead)) / (2 * Math.sqrt(cfg.accelMps2 * cfg.comfortDecelMps2)),
    );
  const r = sStar / g;
  return r * r;
}

export function updateVehicle(agent: VehicleAgent, dt: number, env: VehicleEnv): void {
  const cfg = env.cfg;
  const cur = lane(env, agent, 0);
  const v = agent.speed;
  const distEnd = cur.length - agent.s;

  // --- Free-road target: legal limit scaled by temperament, capped, and
  // shaped down when approaching a sharp turn onto the next lane.
  let v0 = Math.min((cur.maxspeedKmh / 3.6) * agent.desiredFactor, cfg.maxSpeedMps);
  const next = lane(env, agent, 1);
  const turnCap = turnSpeedCap(cur, next);
  if (turnCap < v0) {
    const allowed = Math.sqrt(
      turnCap * turnCap + 2 * cfg.comfortDecelMps2 * Math.max(0, distEnd),
    );
    if (allowed < v0) v0 = allowed;
  }
  if (v0 < 0.5) v0 = 0.5;

  // --- Most restrictive obstacle term.
  let term = 0;

  // 1) Nearest agent ahead on the current or next lane of the route.
  const curLaneIdx = agent.route.laneIndices[agent.routePos];
  const nextLaneIdx = agent.route.laneIndices[(agent.routePos + 1) % agent.route.laneIndices.length];
  let leaderDs = Infinity;
  let leaderV = 0;
  for (let j = 0; j < env.agents.length; j++) {
    const other = env.agents[j];
    if (other === agent) continue;
    const otherLane = other.route.laneIndices[other.routePos];
    let ds = Infinity;
    if (otherLane === curLaneIdx && other.s > agent.s) {
      ds = other.s - agent.s;
    } else if (otherLane === nextLaneIdx) {
      ds = distEnd + other.s;
    }
    if (ds < leaderDs) {
      leaderDs = ds;
      leaderV = other.speed;
    }
  }
  if (leaderDs < 70) {
    const t = idmTerm(cfg, v, leaderDs - VEHICLE_LENGTH_M, leaderV);
    if (t > term) term = t;
  }

  // 2) Player ahead in lane (heading projection; conservative and O(1)).
  if (env.hasPlayer) {
    const relX = env.playerX - agent.state.x;
    const relY = env.playerY - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    if (along > -2 && along < cfg.lookaheadM && lateral < cfg.playerLateralM) {
      // Follow the player only if they move roughly our way; else treat static.
      const aligned =
        env.playerDirX * agent.state.dirX + env.playerDirY * agent.state.dirY > 0.7;
      const vLead = aligned ? env.playerSpeedMps : 0;
      const t = idmTerm(cfg, v, along - 2 * HALF_LEN, vLead);
      if (t > term) term = t;
    }
  }

  // 3) Stop points ahead: signals, occupied crossings, unreserved junctions.
  term = Math.max(term, stopPointTerm(agent, env, cur, v));

  // --- IDM integration.
  const acc = clampAcc(
    cfg.accelMps2 * (1 - Math.pow(v / v0, IDM_DELTA) - term),
    cfg,
  );
  const sBefore = agent.s;
  agent.speed = Math.max(0, v + acc * dt);
  agent.s += agent.speed * dt;

  // Hard anti-overlap clamp vs the player (kinematic guarantee: never clip).
  if (env.hasPlayer) {
    // Re-check with the pre-integration frame direction — cheap and safe.
    const relX = env.playerX - agent.state.x;
    const relY = env.playerY - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    const moved = agent.speed * dt;
    const minSep = 2 * HALF_LEN + 0.8;
    if (lateral < cfg.playerLateralM - 0.3 && along > 0 && along - moved < minSep) {
      const allowedMove = Math.max(0, along - minSep);
      agent.s -= moved - allowedMove;
      if (agent.s < 0) agent.s = 0;
      agent.speed = 0;
    }
  }
  // Same guarantee vs the leader agent (leader treated at its pre-move pose).
  if (leaderDs < Infinity) {
    const gapNow = leaderDs - (agent.s - sBefore) - VEHICLE_LENGTH_M;
    if (gapNow < 0.4) {
      agent.s -= 0.4 - gapNow;
      if (agent.s < sBefore) agent.s = sBefore;
      agent.speed = Math.min(agent.speed, leaderV);
    }
  }

  agent.state.braking = acc < -0.5 || (term > 0.8 && agent.speed < 0.5);

  // --- Lane transitions (may cross several short lanes in one frame).
  let curLane = lane(env, agent, 0);
  while (agent.s >= curLane.length) {
    agent.s -= curLane.length;
    const passedNode = curLane.toNode;
    agent.routePos = (agent.routePos + 1) % agent.route.laneIndices.length;
    agent.segHint = 0;
    if (agent.committedSignalNode === passedNode) agent.committedSignalNode = null;
    curLane = lane(env, agent, 0);
  }

  // Reservation lifecycle: renew while relevant, release once passed.
  if (agent.heldNode) {
    const r = env.reservations.get(agent.heldNode);
    const holdPastM = Math.max(
      HOLD_PAST_MIN_M,
      (env.graph.junctionRadiusM.get(agent.heldNode) ?? 0) + STOP_LINE_BEYOND_CUT_M,
    );
    if (curLane.toNode === agent.heldNode) {
      if (r) r.renewedAt = env.timeSec; // still approaching / traversing
    } else if (curLane.fromNode === agent.heldNode && agent.s <= holdPastM) {
      if (r) r.renewedAt = env.timeSec; // clearing the (scaled) junction box
    } else {
      if (r && r.holder === agent.state.id) r.holder = -1;
      agent.heldNode = null;
    }
  }

  // --- Publish pose.
  sampleLane(curLane, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = agent.speed;
}

function clampAcc(acc: number, cfg: TrafficConfig): number {
  if (acc > cfg.accelMps2) return cfg.accelMps2;
  if (acc < -cfg.hardDecelMps2) return -cfg.hardDecelMps2;
  return acc;
}

/** Speed cap for the junction between two lanes based on turn sharpness. */
function turnSpeedCap(cur: DirectedLane, next: DirectedLane): number {
  const cos = cur.endDirX * next.startDirX + cur.endDirY * next.startDirY;
  if (cos < -0.17) return 2.5; // > ~100°: near U-turn
  if (cos < 0.57) return 4.0; // > ~55°: proper turn
  if (cos < 0.9) return 7.0; // > ~25°: bend
  return Infinity;
}

/**
 * Scan up to `lookaheadM` along the route (crossing lane boundaries) for
 * stop constraints; return the strongest IDM term. Also drives the
 * yellow-light commit latch and junction slot reservation.
 */
function stopPointTerm(
  agent: VehicleAgent,
  env: VehicleEnv,
  cur: DirectedLane,
  v: number,
): number {
  const cfg = env.cfg;
  let term = 0;
  let acc = -agent.s; // stop point at arc x on lane k sits at distance acc + x
  let blocked = false;

  for (let k = 0; k < 3 && !blocked; k++) {
    const lk = lane(env, agent, k);
    if (k > 0 && acc > cfg.lookaheadM) break;

    // Occupied pedestrian crossings on this lane.
    for (let c = 0; c < lk.crossings.length; c++) {
      const cross = lk.crossings[c];
      const d = acc + cross.s;
      if (d < 0.5 || d > cfg.lookaheadM) continue;
      if ((env.crossingCounts.get(cross.crossingId) ?? 0) > 0) {
        const t = idmTerm(cfg, v, d - cfg.crossingStopOffsetM - HALF_LEN, 0);
        if (t > term) term = t;
      }
    }

    const dEnd = acc + lk.length;

    // Signalized lane end — stop at the junction mouth, not the node center.
    const signalOffsetM = lk.endSignalNodeId
      ? junctionStopOffsetM(env.graph, lk, cfg.signalStopOffsetM)
      : 0;
    if (lk.endSignalNodeId && dEnd < cfg.lookaheadM + signalOffsetM) {
      const stopAt = dEnd - signalOffsetM - HALF_LEN;
      if (stopAt > 0.3 && agent.committedSignalNode !== lk.endSignalNodeId) {
        const phase = env.signalPhase(lk.endSignalNodeId);
        let mustStop = phase === "red" || phase === "redYellow";
        if (phase === "yellow") {
          const canStop = (v * v) / (2 * cfg.hardDecelMps2) < stopAt;
          if (canStop) mustStop = true;
          else agent.committedSignalNode = lk.endSignalNodeId;
        }
        if (mustStop) {
          const t = idmTerm(cfg, v, stopAt, 0);
          if (t > term) term = t;
          blocked = true; // nothing beyond a red line matters
        }
      }
    }

    // Unsignalized junction: time-slot reservation. Stop point and reserve
    // distance both track the drawn junction mouth so agents neither halt
    // inside the box nor discover a denied slot with no room left to brake.
    if (!blocked && lk.endYieldDegree >= 3 && dEnd < cfg.lookaheadM) {
      const stopOffsetM = junctionStopOffsetM(env.graph, lk, UNSIGNALIZED_STOP_FLOOR_M);
      const stopAt = dEnd - stopOffsetM - HALF_LEN;
      const reserveDistM = stopOffsetM + HALF_LEN + RESERVE_AHEAD_M;
      if (agent.heldNode === lk.toNode) {
        // already ours — proceed
      } else if (dEnd < reserveDistM && agent.heldNode === null) {
        const r = env.reservations.get(lk.toNode);
        if (r) {
          const stale = env.timeSec - r.renewedAt > RESERVATION_STALE_SEC;
          if (r.holder === -1 || r.holder === agent.state.id || stale) {
            r.holder = agent.state.id;
            r.renewedAt = env.timeSec;
            agent.heldNode = lk.toNode;
          } else if (stopAt > 0.3) {
            const t = idmTerm(cfg, v, stopAt, 0);
            if (t > term) term = t;
            blocked = true;
          }
        }
      } else if (dEnd < reserveDistM && agent.heldNode !== null && stopAt > 0.3) {
        // Holding a different node — wait here until it is released.
        const t = idmTerm(cfg, v, stopAt, 0);
        if (t > term) term = t;
        blocked = true;
      }
    }

    acc += lk.length;
  }
  return term;
}
