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
import { vehicleHalfLengthM, type TrafficConfig, type TrafficVehicleState } from "./types";

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
  /**
   * Sim time this agent stopped making progress toward `heldNode` while still
   * SHORT of it, or null while it is moving (or has no slot). Drives the
   * forfeit below — see RESERVATION_STALL_GRACE_SEC.
   */
  heldStalledSinceSec: number | null;
  /**
   * Sim time until which this agent may not TAKE a junction slot while it is
   * still stalled — set when it forfeits one, so the slot it just gave back
   * cannot be re-grabbed by the same stalled agent on its very next frame.
   */
  reserveCooldownUntilSec: number;
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
  /**
   * The STAGED (scripted) actors currently published by the system, so an
   * ambient agent treats each one exactly the way it treats the player: an
   * obstacle it slows for and can never drive through.
   *
   * Why this exists (doc 87 FR-27). `staged.ts` shipped an honest v1
   * limitation — *"ambient agents do not see staged actors"* — which was
   * harmless only while every scenario lesson ran with `vehicleCount: 0`. The
   * moment the yielding families carry an ambient baseline, that limitation
   * becomes the founder's own complaint at car scale: he watched a pedestrian
   * walk *through* a parked car (items 22/23/24) and called it, correctly,
   * visually unacceptable. A boulevard car sliding through the very car the
   * lesson is about would be the same defect, bigger.
   *
   * Empty array = the pre-change behaviour, bit-identical.
   */
  staged: readonly TrafficVehicleState[];
}

/** Braking headroom kept between the reservation attempt and the stop point. */
const RESERVE_AHEAD_M = 12;
const RESERVATION_STALE_SEC = 0.8;
/**
 * FR-B5-DEADLOCK (doc 87, 2026-08-05) — A SLOT A CAR CANNOT USE IS A SLOT IT
 * MUST GIVE BACK.
 *
 * The stale-reclaim above only reclaims a slot nobody is RENEWING, and the
 * lifecycle below renewed unconditionally for as long as the holder's current
 * lane still pointed at the node. So an agent that took the slot on approach
 * and was then stopped by something else — the commonest something else being
 * THE PLAYER, halted at a give-way line because the lesson told him to — kept
 * the junction reserved forever without ever entering it. Every other agent
 * was denied, stopped, and stayed stopped.
 *
 * Measured on `jxg-giveway-v1` with the junction family's ambient baseline
 * (4 cars) and the player parked at the mouth-2 Б1 line: agent 3 takes
 * `jxg-n-j2` and halts at (4.06, 111.70) at t = 31.6 s; the reservation reads
 * `holder 3, renewed 240.0` at the end of a 240 s run; ALL SIX bodies (4
 * ambient + both staged) are motionless by t = 71.7 s and none of them ever
 * moves again. That is the frozen queue with the brake bars lit that the
 * founder photographed, and it is a stationary obstacle wherever it happens to
 * freeze — including the lane the student is about to drive up.
 *
 * The rule: an agent still SHORT of the box forfeits the slot after this many
 * continuous seconds without progress. Two seconds is longer than any
 * stop-and-go dip a moving queue produces and far shorter than a wait behind a
 * stopped player. An agent already INSIDE the box (`fromNode === heldNode`)
 * never forfeits — a car standing in a junction must keep the box to itself,
 * which is the safe direction and the whole point of the slot.
 */
const RESERVATION_STALL_GRACE_SEC = 2;
/** Below this the agent counts as making no progress toward its slot, m/s. */
const RESERVATION_PROGRESS_MPS = 0.3;
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
    heldStalledSinceSec: null,
    reserveCooldownUntilSec: -Infinity,
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

  // 2b) STAGED actors ahead in lane — the same treatment as the player, for
  //     the same reason: an ambient agent must never drive through the car the
  //     lesson is about. Held (speed 0) actors read as stationary obstacles,
  //     which is what a car halted in your lane IS. O(agents × staged) with
  //     staged ≤ ~4 per lesson; zero allocations.
  let stagedAlong = Infinity;
  let stagedMinSep = 0;
  for (let j = 0; j < env.staged.length; j++) {
    const st = env.staged[j];
    if (st === agent.state) continue; // a staged actor never follows itself
    const relX = st.x - agent.state.x;
    const relY = st.y - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    if (along <= -2 || along >= cfg.lookaheadM || lateral >= cfg.playerLateralM) continue;
    // Closing speed only when it travels roughly our way; a crossing or
    // oncoming actor is treated as static, which is the conservative read.
    const aligned = st.dirX * agent.state.dirX + st.dirY * agent.state.dirY > 0.7;
    const vLead = aligned ? st.speedMps : 0;
    const halfSum = HALF_LEN + vehicleHalfLengthM(st.profile);
    const t = idmTerm(cfg, v, along - halfSum, vLead);
    if (t > term) term = t;
    if (along < stagedAlong) {
      stagedAlong = along;
      stagedMinSep = halfSum + 0.8;
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
  // Same guarantee vs the nearest staged actor ahead (pre-move pose, exactly
  // like the player clamp above): the kinematic promise „never clip" now
  // covers scripted actors too, so no ambient car can pass through one.
  if (stagedAlong < Infinity && stagedAlong > 0) {
    const moved = agent.speed * dt;
    if (stagedAlong - moved < stagedMinSep) {
      const allowedMove = Math.max(0, stagedAlong - stagedMinSep);
      agent.s -= moved - allowedMove;
      if (agent.s < sBefore) agent.s = sBefore;
      if (agent.s < 0) agent.s = 0;
      agent.speed = 0;
    }
  }
  // …and from ANY angle, not just along the lane: a staged actor crossing the
  // junction box is lateral to this agent until the last metre, so the
  // corridor test above cannot catch it.
  //
  // FR-B5-FREEZE (doc 87, 2026-08-05) — ONLY REFUSE A STEP THAT CLOSES.
  //
  // This test used to be "is anything within `sep` of my NEXT pose", measured
  // from any angle — which includes a body BEHIND me. Two cars 3 m apart
  // therefore froze each other permanently: the leader would not advance
  // because its follower was inside the radius, and the follower would not
  // advance because the leader was. Measured on `jxg-giveway-v1` at L3:
  // ambient id0 stopped ON the node jxg-n-j2 at (−0.10, 154.06) and the staged
  // priority car pinned 2.98 m behind it at (2.88, 154.06), BOTH motionless
  // from t = 41 s to the end of a 140 s run — 1.18 m off the student's lane
  // centre, in the mouth he is told to drive through. That pair IS the founder's
  // „stationary box van standing in the student's own lane"
  // (`newdef/ZOOM-b5gw-junction-t58.png`) and the 10-point COLLISION at
  // y = 146.00 on a correctly-driven run.
  //
  // The repair is one clause and it strictly WEAKENS the clamp in the only
  // direction that is safe: a step is refused only when it would leave the two
  // bodies CLOSER than they already are. A step that increases the separation
  // can never create an overlap the previous pose did not already have, so the
  // „never clip" guarantee is untouched — and a car with something parked
  // behind it can drive away, which is what breaks the lock.
  if (env.staged.length > 0 && agent.s > sBefore) {
    const step = agent.s - sBefore;
    const nx = agent.state.x + agent.state.dirX * step;
    const ny = agent.state.y + agent.state.dirY * step;
    for (let j = 0; j < env.staged.length; j++) {
      const st = env.staged[j];
      if (st === agent.state) continue;
      const sep = HALF_LEN + vehicleHalfLengthM(st.profile) + 0.5;
      const dAfter = Math.hypot(st.x - nx, st.y - ny);
      if (dAfter >= sep) continue;
      const dBefore = Math.hypot(st.x - agent.state.x, st.y - agent.state.y);
      if (dAfter >= dBefore) continue; // moving away — never a reason to freeze
      agent.s = sBefore;
      agent.speed = 0;
      break;
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

  // Reservation lifecycle: renew while relevant, release once passed — and
  // FORFEIT while held without progress (see RESERVATION_STALL_GRACE_SEC).
  if (agent.heldNode) {
    const r = env.reservations.get(agent.heldNode);
    const holdPastM = Math.max(
      HOLD_PAST_MIN_M,
      (env.graph.junctionRadiusM.get(agent.heldNode) ?? 0) + STOP_LINE_BEYOND_CUT_M,
    );
    if (curLane.toNode === agent.heldNode) {
      // Still APPROACHING the box. Renew only while actually closing on it;
      // a holder that has been standing still for the grace gives the slot
      // back so the junction can serve somebody who can use it.
      if (agent.speed > RESERVATION_PROGRESS_MPS) {
        agent.heldStalledSinceSec = null;
        if (r) r.renewedAt = env.timeSec;
      } else {
        if (agent.heldStalledSinceSec === null) agent.heldStalledSinceSec = env.timeSec;
        if (env.timeSec - agent.heldStalledSinceSec < RESERVATION_STALL_GRACE_SEC) {
          if (r) r.renewedAt = env.timeSec;
        } else {
          if (r && r.holder === agent.state.id) r.holder = -1;
          agent.heldNode = null;
          agent.heldStalledSinceSec = null;
          agent.reserveCooldownUntilSec = env.timeSec + RESERVATION_STALL_GRACE_SEC;
        }
      }
    } else if (curLane.fromNode === agent.heldNode && agent.s <= holdPastM) {
      // INSIDE / clearing the (scaled) junction box — never forfeited, at any
      // speed: a car standing in the box owns the box until it is out of it.
      agent.heldStalledSinceSec = null;
      if (r) r.renewedAt = env.timeSec;
    } else {
      if (r && r.holder === agent.state.id) r.holder = -1;
      agent.heldNode = null;
      agent.heldStalledSinceSec = null;
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

/**
 * Push an ambient agent forward along its OWN arc until its published pose is
 * at least `minSepM` from (obsX, obsY), and re-publish. Returns true when it
 * cleared.
 *
 * Why (doc 87 FR-27): ambient agents are seeded at construction, staged actors
 * are staged afterwards, so a scripted actor can be placed on top of a
 * boulevard car that is already there. Measured on three templates — 0.52 m,
 * 0.99 m and 1.46 m of CENTRES, all at t = 0.0 s. No running clamp can undo
 * that: both bodies start inside each other, so neither is "advancing into"
 * the other, and the overlap simply persists into the first frame the student
 * sees. The seed has to be repaired once, at stage time.
 *
 * Forward, never backward: the lane-transition loop below handles an arc that
 * runs past the end of the current lane, so a forward push is always legal,
 * while a negative `s` is not representable.
 */
export function separateVehicleFrom(
  agent: VehicleAgent,
  obsX: number,
  obsY: number,
  minSepM: number,
  env: VehicleEnv,
): boolean {
  for (let i = 0; i < 8; i++) {
    const d = Math.hypot(agent.state.x - obsX, agent.state.y - obsY);
    if (d >= minSepM) return true;
    agent.s += minSepM - d + 0.25;
    updateVehicle(agent, 0, env);
  }
  return Math.hypot(agent.state.x - obsX, agent.state.y - obsY) >= minSepM;
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
          // A stalled agent that JUST forfeited this slot may not take it
          // straight back — otherwise the forfeit frees the junction for
          // exactly one frame and the deadlock re-forms. An agent that has
          // started moving again is never held off (the cooldown is ANDed
          // with "still not making progress").
          const cooling =
            v <= RESERVATION_PROGRESS_MPS && env.timeSec < agent.reserveCooldownUntilSec;
          if (cooling) {
            if (stopAt > 0.3) {
              const t = idmTerm(cfg, v, stopAt, 0);
              if (t > term) term = t;
            }
            blocked = true;
          } else if (r.holder === -1 || r.holder === agent.state.id || stale) {
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
