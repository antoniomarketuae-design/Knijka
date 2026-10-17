/**
 * Vehicle agents — kinematic route followers with IDM-lite car following.
 *
 * Each agent tracks (routePos, s) along its precomputed loop — `s` is the arc on
 * its current lane up to the junction cut (`LaneConnector.exitS`) and, beyond
 * it, the arc along the connector onto the next lane (graph.ts `laneConnector`:
 * the pose never hops a lane seam). Per frame it
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
import { laneConnector, sampleLane, type DirectedLane, type LaneConnector, type LaneGraph } from "./graph";
import type { TrafficRoute } from "./routes";
import {
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type AmbientSignalFn,
  type TrafficConfig,
  type TrafficVehicleState,
  type VehicleProfile,
} from "./types";

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
  /**
   * SPEED THIS AGENT HAS SHED BECAUSE OF THE PLAYER, m/s, cumulative and
   * monotone for the agent's life (founder ruling 2026-10-05, «bill forced
   * braking» at a roundabout entry — see `playerShedThisStep` below and
   * `traffic/system.ts circulatingReportFor`). Nothing in this file reads it:
   * it is the agent's own account of what the student cost it, published
   * through the traffic system's circulating report.
   */
  playerShedMps: number;
  /**
   * Sim time since which this car has been held AT ITS LINE for a student who is standing still (the left-turner's
   * and the U-turner's yield below), or null while it is not so held. Drives the patience bound — see
   * AMBIENT_YIELD_PATIENCE_SEC.
   */
  playerYieldSinceSec: number | null;
  /**
   * The signalised junction this car was let into because the student on the opposite arm was WAITING for the
   * oncoming stream (round 5, D1 — `studentWaiting`), or null. Such a car keeps deciding inside the box up to its
   * waiting point (D3, `waitingPointArc`); set and cleared at its line by `stopPointTerm`, cleared when it leaves the lane.
   */
  releasedNode: string | null;
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
  /**
   * The signal THIS car obeys on its own approach (sc-sig-controller-postures:5ee4301e;
   * `AmbientSignalFn`). null = not wired (bench harnesses): `signalPhase(node)` is read instead.
   */
  ambientSignal: AmbientSignalFn | null;
  timeSec: number;
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedMps: number;
  playerDirX: number;
  playerDirY: number;
  /**
   * The student's turn signal — what he says he will do next (protocol P3, `studentHoldsBox`). Absent = "off".
   */
  playerIndicator?: "off" | "left" | "right";
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
  /**
   * Sim time since which each staged vehicle (same index as `staged`) has been at rest, NaN while it moves — kept by
   * `trackStagedRest`, read by the junction-box protocol (`stagedStandsForGood`). Absent in a bench env: rest is rest.
   */
  stagedRestSinceSec?: Float64Array;
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
    playerShedMps: 0,
    playerYieldSinceSec: null,
    releasedNode: null,
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
  const next = lane(env, agent, 1);
  // How this car gets onto its next lane (graph.ts `laneConnector`): it leaves the lane line at `exitS`, the junction
  // cut, and reaches the next lane at arc `entryS` after `conn.length` m of curve. `distNext` is what is left before
  // the next lane, and `distApex` what is left before the MIDDLE of the turn — the connector's counterpart of the node
  // the turn used to be made at, which is where the turn speed below has to be reached and from where the car
  // accelerates out again (slow in, fast out — the speed profile it always had, on the path it now really drives).
  const conn = laneConnector(env.graph, cur, next);
  const v = agent.speed;
  const distNext = conn.exitS + conn.length - agent.s;
  const distApex = distNext - conn.length / 2;
  // Protocol P2: the junction box this car is in (0 none · 1 unsignalised · 2 signalised), and whether it is across
  // the bows of a student who is coming at it — at a signalised box only (see `acrossBows`, `acrossStudentBows`).
  // Round 5, D3: a car let in for a WAITING student that can no longer stop short of his lane (`committedPastWaitingPoint`)
  // clears it and does not brake for him either — only a step INTO him is refused, as across his bows.
  const box = boxOf(agent, env, cur);
  const studentBows =
    box === 2 && (acrossStudentBows(agent, env) || committedPastWaitingPoint(agent, env, cur, next, conn, v));

  // --- Free-road target: legal limit scaled by temperament, capped, and
  // shaped down when approaching a sharp turn onto the next lane.
  let v0 = Math.min((cur.maxspeedKmh / 3.6) * agent.desiredFactor, cfg.maxSpeedMps);
  const turnCap = turnSpeedCap(cur, next);
  if (turnCap < v0 && distApex >= 0) {
    const allowed = Math.sqrt(turnCap * turnCap + 2 * cfg.comfortDecelMps2 * distApex);
    if (allowed < v0) v0 = allowed;
  }
  if (v0 < 0.5) v0 = 0.5;

  // --- Most restrictive obstacle term.
  let term = 0;
  // The same maximum with the PLAYER left out, and the player's own term — the
  // two numbers `playerShedThisStep` needs to say how much of this step's
  // braking is his (founder ruling 2026-10-05). Neither feeds the motion.
  let termOther = 0;
  let playerTerm = 0;

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
      // Along the path this car drives: the rest of its connector, then the next lane from where the connector
      // joins it. A car on that lane short of the join that this car will reach it BEFORE (ds < 0) is behind it
      // in the merge — it came straight through the box on the lane line — and is not its leader.
      ds = distNext + other.s - conn.entryS;
      if (ds < 0) ds = Infinity;
    }
    if (ds < leaderDs) {
      leaderDs = ds;
      leaderV = other.speed;
    }
  }
  if (leaderDs < 70) {
    const t = idmTerm(cfg, v, leaderDs - VEHICLE_LENGTH_M, leaderV);
    if (t > term) term = t;
    if (t > termOther) termOther = t;
  }

  // 2) Player ahead in lane (heading projection; conservative and O(1)). Not while this car is across his bows in a
  //    box (P2): it is the one further through, and braking there is stopping in his lane.
  if (env.hasPlayer && !studentBows) {
    const relX = env.playerX - agent.state.x;
    const relY = env.playerY - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    // In a signalised box a student who is MOVING and behind this car's own centre is following it out, not ahead
    // of it (P2): the 2 m of slop below is for a body beside a car on the open road, and here it braked a car for
    // the student it had just turned in ahead of — in his lane, into his bonnet.
    const behindM = box === 2 && env.playerSpeedMps > RESERVATION_PROGRESS_MPS ? 0 : -2;
    if (along > behindM && along < cfg.lookaheadM && lateral < cfg.playerLateralM) {
      // Follow the player only if they move roughly our way; else treat static.
      const aligned =
        env.playerDirX * agent.state.dirX + env.playerDirY * agent.state.dirY > 0.7;
      const vLead = aligned ? env.playerSpeedMps : 0;
      const t = idmTerm(cfg, v, along - 2 * HALF_LEN, vLead);
      if (t > term) term = t;
      playerTerm = t;
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
    // P2: across this staged car's bows in a box, this car is the one further through — the staged car holds for it
    // (staged.ts 2b / 3b), so it must not hold for the staged car: no term, no corridor clamp (overlap only, below).
    if (
      box !== 0 &&
      Math.abs(agent.state.dirX * st.dirX + agent.state.dirY * st.dirY) < 0.9 &&
      acrossBows(
        agent.state.x,
        agent.state.y,
        st.x,
        st.y,
        st.dirX,
        st.dirY,
        stagedBowsM(st, cfg),
        HALF_LEN + vehicleHalfLengthM(st.profile) + 0.5,
      )
    ) {
      continue;
    }
    // Closing speed only when it travels roughly our way; a crossing or
    // oncoming actor is treated as static, which is the conservative read.
    const aligned = st.dirX * agent.state.dirX + st.dirY * agent.state.dirY > 0.7;
    const vLead = aligned ? st.speedMps : 0;
    const halfSum = HALF_LEN + vehicleHalfLengthM(st.profile);
    const t = idmTerm(cfg, v, along - halfSum, vLead);
    if (t > term) term = t;
    if (t > termOther) termOther = t;
    if (along < stagedAlong) {
      stagedAlong = along;
      stagedMinSep = halfSum + 0.8;
    }
  }

  // 3) Stop points ahead: signals, occupied crossings, unreserved junctions.
  const stopTerm = stopPointTerm(agent, env, cur, v);
  term = Math.max(term, stopTerm);
  termOther = Math.max(termOther, stopTerm);

  // --- IDM integration.
  const acc = clampAcc(
    cfg.accelMps2 * (1 - Math.pow(v / v0, IDM_DELTA) - term),
    cfg,
  );
  const sBefore = agent.s;
  agent.speed = Math.max(0, v + acc * dt);
  agent.s += agent.speed * dt;
  // What this agent would be doing after this step if the student were not in
  // its path: the same law on the same road with his term left out.
  const playerBinding = playerTerm > termOther;
  const speedWithoutPlayer = playerBinding
    ? Math.max(
        0,
        v + clampAcc(cfg.accelMps2 * (1 - Math.pow(v / v0, IDM_DELTA) - termOther), cfg) * dt,
      )
    : agent.speed;
  let playerClamped = false;

  // Hard anti-overlap clamp vs the player (kinematic guarantee: never clip).
  if (env.hasPlayer && !studentBows) {
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
      if (agent.speed > 0) playerClamped = true;
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
    // P2 reads the pose this step will PUBLISH (on a curve the straight line along the heading is not it).
    let wx = nx;
    let wy = ny;
    let wdx = agent.state.dirX;
    let wdy = agent.state.dirY;
    if (box !== 0) {
      walkedPose(agent, env, cur, conn);
      wx = samp.x;
      wy = samp.y;
      if (samp.dirX !== 0 || samp.dirY !== 0) {
        wdx = samp.dirX;
        wdy = samp.dirY;
      }
    }
    for (let j = 0; j < env.staged.length; j++) {
      const st = env.staged[j];
      if (st === agent.state) continue;
      const sep = HALF_LEN + vehicleHalfLengthM(st.profile) + 0.5;
      if (box !== 0) {
        const bowsM = stagedBowsM(st, cfg);
        if (
          Math.abs(agent.state.dirX * st.dirX + agent.state.dirY * st.dirY) < 0.9 &&
          acrossBows(agent.state.x, agent.state.y, st.x, st.y, st.dirX, st.dirY, bowsM, sep)
        ) {
          // FURTHER THROUGH: the staged car is the one that waits. Only a step into its body is refused.
          if (
            Math.hypot(st.x - wx, st.y - wy) < Math.hypot(st.x - agent.state.x, st.y - agent.state.y) &&
            bodiesOverlap(
              wx,
              wy,
              wdx,
              wdy,
              vehicleHalfLengthM(agent.state.profile),
              vehicleHalfWidthM(agent.state.profile),
              st.x,
              st.y,
              st.dirX,
              st.dirY,
              vehicleHalfLengthM(st.profile),
              vehicleHalfWidthM(st.profile),
              BODY_GAP_M,
            )
          ) {
            agent.s = sBefore;
            agent.speed = 0;
            break;
          }
          continue;
        }
        // NOT YET ACROSS (round 5, D4): the staged car was decided at the line (P1, `boxGate`) and at the waiting
        // point (D3). What is left here is BOUNDED by construction (`stagedArrivesFirst`): the car does not step onto
        // the line of a staged car that is MOVING towards the crossing and, at the speed it has NOW, will be at it
        // before the car is off it again — the one case no line can see, a staged car re-entering or running its own
        // red after the car's last decision (round 5, early-stop band held open: without it ambient 4 and staged 1001
        // locked in the box for 46 s). A staged car at rest is never waited for here, nor one that is not going to be
        // there first: round 4 waited for one that «could» arrive — earliest reach — and for one its guard had
        // stopped, and stood ambient car 3 in the box for 6.1 / 6.4 s on the lesson's own left turn (verifier R4-F2).
        if (
          !acrossBows(agent.state.x, agent.state.y, st.x, st.y, st.dirX, st.dirY, Infinity, sep) &&
          acrossBows(wx, wy, st.x, st.y, st.dirX, st.dirY, Infinity, sep) &&
          stagedArrivesFirst(agent, env, cur, conn, st, sep)
        ) {
          agent.s = sBefore;
          agent.speed = 0;
          break;
        }
      }
      const dAfter = Math.hypot(st.x - nx, st.y - ny);
      if (dAfter >= sep) continue;
      const dBefore = Math.hypot(st.x - agent.state.x, st.y - agent.state.y);
      if (dAfter >= dBefore) continue; // moving away — never a reason to freeze
      agent.s = sBefore;
      agent.speed = 0;
      break;
    }
  }
  // …AND THE SAME ANY-ANGLE GUARANTEE FOR THE PLAYER, who had only the corridor
  // clamp above. `sc-junction-blind:dea35510` (« … still crashes into the
  // priority car»): the corridor clamp asks `along > 0 && lateral < …`, i.e. „is
  // he ahead of me IN MY OWN LANE", which is exactly the question that cannot see
  // a car STANDING IN THE JUNCTION BOX while this agent turns through it — the
  // case the staged clause above was written for, on the one body it was never
  // applied to.
  //
  // MEASURED on tj-occluded-v1 with the player parked motionless at the pose the
  // w26 mobile-right leg actually stood at, (−1.14, −6.47), 90 s per run:
  // ambient cars reached 2.67–2.74 m of CENTRES on seeds 3, 4, 6 and 7 at every
  // compiled count (n = 4/5/6) — two 4.1 m cars interpenetrating by ~1.4 m. The
  // student was then billed «Удар в друго превозно средство» −10 ОПАСНА,
  // НЕИЗДЪРЖАН, under a card reading «Между вас е имало точно толкова път,
  // колкото ти е трябвал, за да спреш» — a braking-distance explanation handed to
  // a car sitting at 0 км/ч. Requirement-zero (doc 64 THEO-4) is why that is a
  // defect and not a scoring quibble.
  //
  // AND THE STEP IT HAS TO CATCH IS NOT A SMOOTH ONE, which is why this looks up
  // the pose it will PUBLISH instead of extrapolating along `dirX/dirY` the way
  // the staged clause can afford to. Traced on seed 4, published poses at 1/30 s:
  // the agent runs the stem to (4.06, −0.42) heading north and the NEXT pose is
  // (0.12, −4.06) heading east — 5.36 m of travel in a step worth 0.55 m, because
  // the lane graph trims both lanes back from the node and `s` carries the
  // remainder straight into the next one. Nothing crosses the box; the pose hops
  // it. A straight-line extrapolation therefore reports the car as moving AWAY
  // on the last frame before it lands on top of him, and only the lane-walked
  // pose sees the landing.
  //
  // (That hop is gone — sc-sig-controller-postures:5ee4301e round 2, graph.ts
  // `laneConnector`: the car now drives a curve through the box. The pose it
  // will publish is still looked up rather than extrapolated, because on a
  // curve the straight line along `dirX/dirY` is not where the next step ends.)
  //
  // Same closing-only shape as FR-B5-FREEZE above, so it can neither deadlock nor
  // acquit: the step is refused ONLY when it would leave the two bodies closer
  // than they already are, so a student who drives into traffic still closes the
  // gap himself and is still billed for it, and a frozen agent moves again the
  // moment he clears. The radius is the corridor clamp's own separation less its
  // margin (4.80 m vs 5.10 m of centres), which keeps this backstop inside the
  // range that clamp already refuses in-lane and well under the 8.12 m between
  // opposing lane centres, so a car merely passing him never trips it.
  if (env.hasPlayer && agent.s > sBefore) {
    walkedPose(agent, env, cur, conn);
    const sep = 2 * HALF_LEN + 0.5;
    const dAfter = Math.hypot(env.playerX - samp.x, env.playerY - samp.y);
    const dBefore = Math.hypot(env.playerX - agent.state.x, env.playerY - agent.state.y);
    // P2: across the bows of a student who is coming at it, the car is refused only a step INTO him — it drives on
    // out of his lane (round 3 froze it there: verifier R3-F1). Everywhere else, the clamp as it was.
    const refused = studentBows
      ? dAfter < dBefore &&
        bodiesOverlap(
          samp.x,
          samp.y,
          samp.dirX !== 0 || samp.dirY !== 0 ? samp.dirX : agent.state.dirX,
          samp.dirX !== 0 || samp.dirY !== 0 ? samp.dirY : agent.state.dirY,
          vehicleHalfLengthM(agent.state.profile),
          vehicleHalfWidthM(agent.state.profile),
          env.playerX,
          env.playerY,
          env.playerDirX,
          env.playerDirY,
          vehicleHalfLengthM(),
          vehicleHalfWidthM(),
          BODY_GAP_M,
        )
      : dAfter < sep && dAfter < dBefore;
    if (refused) {
      agent.s = sBefore;
      if (agent.speed > 0) playerClamped = true;
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

  // The student's share of this step's slow-down (see playerShedThisStep):
  // his following term was the binding one, or a hard clamp against HIS body
  // took the speed off. Any other step accounts nothing.
  if (playerBinding || playerClamped) {
    agent.playerShedMps += playerShedThisStep(v, agent.speed, speedWithoutPlayer);
  }

  // --- Lane transitions (may cross several short lanes in one frame).
  //     A lane is left at the END OF ITS CONNECTOR and the next one is joined at the connector's `entryS`, never at
  //     arc 0: the box between the two cuts is driven on the curve, not hopped.
  let curLane = cur;
  let curConn = conn;
  while (agent.s >= curConn.exitS + curConn.length) {
    agent.s += curConn.entryS - (curConn.exitS + curConn.length);
    const passedNode = curLane.toNode;
    agent.routePos = (agent.routePos + 1) % agent.route.laneIndices.length;
    agent.segHint = 0;
    if (agent.committedSignalNode === passedNode) agent.committedSignalNode = null;
    if (agent.releasedNode === passedNode) agent.releasedNode = null;
    curLane = lane(env, agent, 0);
    curConn = laneConnector(env.graph, curLane, lane(env, agent, 1));
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
  if (samplePose(curLane, curConn, agent.s, agent.segHint)) agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = agent.speed;
}

/**
 * The pose this car will PUBLISH for its present arc (or for `arc`, further along its route), into `samp` — walked
 * along its lanes and connectors (an arc that has run past the end of the current connector lands on the next lane),
 * without touching the agent.
 */
function walkedPose(
  agent: VehicleAgent,
  env: VehicleEnv,
  cur: DirectedLane,
  conn: LaneConnector,
  arc: number = agent.s,
): void {
  let ls = arc;
  let lpos = agent.routePos;
  let lhint = agent.segHint;
  let lcur = cur;
  let lconn = conn;
  const lanes = agent.route.laneIndices;
  for (let hops = 0; ls >= lconn.exitS + lconn.length && hops < 8; hops++) {
    ls += lconn.entryS - (lconn.exitS + lconn.length);
    lpos = (lpos + 1) % lanes.length;
    lhint = 0;
    lcur = env.graph.lanes[lanes[lpos]];
    lconn = laneConnector(env.graph, lcur, env.graph.lanes[lanes[(lpos + 1) % lanes.length]]);
  }
  samplePose(lcur, lconn, ls, lhint);
}

/**
 * The pose at arc `s` of lane `lk` whose connector onto the next lane is `conn`, into `samp`: on the lane line up to
 * the junction cut, on the connector's curve beyond it. Returns true when the pose is on the lane line (the caller
 * may then keep `samp.segHint` as the lane's hint; a connector is short and is searched from its start).
 */
function samplePose(lk: DirectedLane, conn: LaneConnector, s: number, segHint: number): boolean {
  if (conn.length > 0 && s > conn.exitS) {
    sampleLane(conn, s - conn.exitS, 0, samp);
    return false;
  }
  sampleLane(lk, s, segHint, samp);
  return true;
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

/**
 * HOW MUCH SPEED A VEHICLE LOST THIS STEP BECAUSE OF THE STUDENT, m/s — the one
 * arithmetic both traffic models (this file's following law and staged.ts's
 * player guard) account their braking with. Founder ruling 2026-10-05, «bill
 * forced braking»: at a roundabout entry FAILED_TO_YIELD is judged by what the
 * circulating car ACTUALLY HAD TO DO, read from the car's own model — never
 * predicted from where it was.
 *
 * `before` is its speed entering the step, `after` the speed it left with, and
 * `withoutPlayer` the speed the SAME law would have left it with had the
 * student not been in its path (his term dropped from the maximum here; his
 * guard target dropped from the minimum in staged.ts). The loss that is his is
 * the part of a real slow-down that would not have happened anyway:
 *
 *   · it must be a SLOW-DOWN — a car that merely accelerates less hard is not
 *     braking, so the reference is capped at `before`;
 *   · and it must be HIS — a car already slowing for a red light, a bend or
 *     another car sheds that speed with him or without him, so only what lies
 *     below `withoutPlayer` counts.
 *
 * STEP BY STEP, on purpose: the reference is rebuilt each step from the speed
 * the vehicle actually has, so a car that brakes HARDER for him than it was
 * already braking for something else is charged that difference as it happens
 * (and all of whatever it then loses below where the other thing would have
 * left it). It is never charged the part its own law was taking off anyway.
 *
 * A vehicle whose binding obstacle is not the student never calls this, so a
 * platoon nobody disturbs accounts exactly 0: the floor of this channel is not
 * small, it is nil (measured — see traffic/circulating.test.ts).
 */
export function playerShedThisStep(before: number, after: number, withoutPlayer: number): number {
  const reference = Math.min(before, withoutPlayer);
  return reference > after ? reference - after : 0;
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
 * What a car on lane `lk` stops for at its signalised end — sc-sig-controller-postures:5ee4301e.
 *
 * THE CAUSE. This used to be `env.signalPhase(lk.endSignalNodeId)`: the NODE's own axis-group
 * (runtime/signals.ts `nodeGroup` — on a single-node junction, the axis of its highest-class edge),
 * read for EVERY approach. On sx-v1 that is the N-S boulevard's group, so the east-west street
 * stopped on the boulevard's red and drove on its green — the student's green — against its own
 * lamp, and drove through the регулировчик's halt because nothing here read him at all. Measured
 * at base on the committed catalogue: 11 signalised districts, every one with approaches whose
 * own axis differs from the node's.
 *
 * NOW the car asks for ITS approach: bearing = the lane's end direction (the axis of the bearing at
 * the stop line the grader paints on the same edge — they agree on every non-interior signal lane
 * of the catalogue), and the lane's start node, so a link inside one signal complex gets no line,
 * as the student's car gets none (stoplines.ts C1). null = no line here.
 */
function laneEndSignal(env: VehicleEnv, lk: DirectedLane): SignalPhase | null {
  const node = lk.endSignalNodeId as string;
  if (env.ambientSignal === null) return env.signalPhase(node);
  const bearing = ((Math.atan2(lk.endDirX, lk.endDirY) * 180) / Math.PI + 360) % 360;
  return env.ambientSignal(node, bearing, lk.fromNode);
}

// =====================================================================================================================
// THE JUNCTION-BOX PROTOCOL — sc-sig-controller-postures:5ee4301e, round 4 (integrator decision 2026-10-12).
//
// Rounds 1–3 each added one clause about how an ambient car shares a junction box with the student or a staged car
// (`owesOncomingPlayer`, `uTurnOwesPlayer`, `boxHeldByStaged`, `yieldWaived`). Each was true where it was measured and
// each was refuted one grid step beside it: a turner that waited for a student «at his line» started together with one
// standing 3 m short of it; a student at rest was «more than 4 s away» at his present speed; a turner released by the
// patience bound entered while he set off and FROZE IN HIS LANE; a staged car that had guard-stopped for his turn was
// «standing for good», so a turner drove into the box it then re-entered and the two held each other. They are replaced
// by one protocol with three rules:
//
//   P1  ALL YIELDING HAPPENS AT THE LINE (`boxGate`). At its stop point a car decides whether to enter: only if its
//       whole path through the box — the connector, and the half car length beyond it its centre must travel for the
//       tail to be out — will be clear of the student and of every staged vehicle for the time it needs to clear it.
//   P2  A CAR THAT HAS ENTERED CLEARS (`boxOf`, `acrossBows` in `updateVehicle`). Past its line nothing above is asked
//       again. Inside the box the anti-overlap clamps are DIRECTIONAL — who is further through: a car that is across
//       another body's bows is never held there by that body (only a step that would put the two bodies into each other
//       is refused), and a car that is not may not put itself across the bows of a staged car that can still move.
//   P3  THE OTHER VEHICLE IS PREDICTED BY WHAT IT CAN DO NEXT (`earliestReachM`). The student is where he could be at
//       the EARLIEST: pulling away from his present speed at his car's own launch acceleration, from wherever he
//       stands, whenever his signal (or the officer) lets him go. A staged car likewise, until it has been at rest for
//       the patience bound.
//
// WHAT IT DOES NOT TOUCH. No graded rule, threshold or staged actor. Where no signal settles who goes first (an
// unsignalised junction, a roundabout, a dark or flashing cluster) the student is predicted for a car that is turning
// round only, exactly the scope round 2 gave `uTurnOwesPlayer`: priority there is the student's to work out and the
// rule engine's to grade (and the circulating report bills a roundabout entry by what the ring car had to do — a new
// hold at a line there would be a new rule). Ambient cars among themselves keep the signal, the leader term and the
// junction slots.
// =====================================================================================================================

/**
 * The taught left-turn norm, s: an oncoming vehicle less than this far away means WAIT (runtime/worldRuntime.ts
 * LEFT_TURN_GAP_SAFE_SEC, «the JU-10 textbook norm»; the sc-turn-left-oncoming briefing: «насрещен на по-малко от 4
 * секунди означава чакане»). In the protocol it is the MARGIN (P3): the student must not be able to reach the car's
 * path until this long after the car has cleared it. Copied by value — the traffic module does not import the runtime
 * — and pinned equal by traffic/__tests__/ambient-own-approach-signal.test.ts.
 */
export const AMBIENT_LEFT_TURN_GAP_SEC = 4.0;

/**
 * THE PATIENCE BOUND, s — round 3 (integrator decision D6), kept under the protocol.
 *
 * THE NUMBER IS THE PRODUCT'S OWN: `hesitationSustainSec` (rules/types.ts DEFAULT_RULE_CONFIG, 5 s) — the time after
 * which the rule engine itself says of a student standing at a way that is open to him that he is not taking it
 * (HESITATION_AT_GREEN). Copied by value and pinned equal by traffic/__tests__/ambient-yield-patience.test.ts.
 *
 * WHAT IT BUYS NOW. A car that has held its way open for a student AT REST for the whole bound drops the taught
 * margin above — and nothing else: it goes only if it can clear the box before the earliest he could reach its path
 * were he to pull away the instant it commits (P1 with P3). If it cannot, it keeps waiting. Round 3 let it go on the
 * clock alone, and at go = flip + patience + 1 s it met him in the box (verifier R3-F1, 7 cells).
 *
 * THE CLOCK counts only time the car itself was held for him while he stood (≤ RESERVATION_PROGRESS_MPS): a red lamp
 * or the officer's halt does not run it, it dies the step he moves, and a staged car that also holds the box neither
 * starts nor stops it (round 3 reset it on every such step, so a lapping staged car restarted the bound for good —
 * verifier R3-F4). The same bound is how long a STAGED vehicle must have been at rest before it is read as standing
 * rather than as about to pull away (`trackStagedRest`).
 */
export const AMBIENT_YIELD_PATIENCE_SEC = 5.0;

/**
 * THE STUDENT'S LAUNCH, m/s² (P3): the most his car can do from rest — the tractive plateau over the mass
 * (vehicle/tuning.ts ENGINE_FORCE_CURVE 4800 N up to 30 km/h, CHASSIS_MASS 1220 kg = 3.93 m/s²; no difficulty tier
 * multiplies the force above 1, and the measured 0→30 km/h of the raw tier is 2.35 s = 3.55 m/s²). An upper bound on
 * purpose: the prediction is the EARLIEST he could be anywhere. Copied by value — the traffic module does not import
 * the vehicle — and pinned equal by traffic/__tests__/junction-box-protocol.test.ts, which also pins that no staged
 * actor in the catalogue is authored to pull away harder (staged.ts default 2.6 m/s²).
 */
export const PLAYER_LAUNCH_ACCEL_MPS2 = 4800 / 1220;

/**
 * THE STUDENT AT REST, m/s (round 5, D1): the product's own standing threshold — rules/types.ts DEFAULT_RULE_CONFIG
 * `fullStopMaxSpeedKmh` (1 km/h), «speed at or under which the vehicle counts as fully stopped», the number every
 * full-stop and standstill rule of the engine reads (it absorbs the solver's sub-1 km/h creep of a car held on the
 * brake). At or under it his car is at rest; over it, it is moving. Copied by value — the traffic module does not
 * import the rules — and pinned equal by traffic/__tests__/junction-box-protocol.test.ts.
 */
export const PLAYER_STANDING_MAX_MPS = 1 / 3.6;

/**
 * How far ahead of itself a staged vehicle brakes for an ambient body in its corridor, m — staged.ts GUARD_AHEAD_M,
 * copied by value (staged.ts imports this file) and pinned equal by traffic/__tests__/junction-box-protocol.test.ts.
 * It is the least length of a staged car's «bows» (`acrossBows`).
 */
export const STAGED_GUARD_AHEAD_M = 16;

/**
 * P3 — how far a vehicle doing `v0` could be `sec` from now AT THE EARLIEST: full launch up to `capMps` (never below
 * the speed it already has), then held. Never «its present speed held constant»: a car at rest is not far away.
 */
export function earliestReachM(v0: number, sec: number, capMps: number): number {
  if (sec <= 0) return 0;
  const cap = capMps > v0 ? capMps : v0;
  const ramp = (cap - v0) / PLAYER_LAUNCH_ACCEL_MPS2;
  if (sec <= ramp) return v0 * sec + 0.5 * PLAYER_LAUNCH_ACCEL_MPS2 * sec * sec;
  return v0 * ramp + 0.5 * PLAYER_LAUNCH_ACCEL_MPS2 * ramp * ramp + cap * (sec - ramp);
}

const nodeLimitCache = new WeakMap<LaneGraph, Map<string, number>>();
/** The highest legal speed on any lane into `node`, m/s — the cap a lawful approach is predicted up to (P3). */
function nodeLimitMps(graph: LaneGraph, node: string): number {
  let byNode = nodeLimitCache.get(graph);
  if (!byNode) nodeLimitCache.set(graph, (byNode = new Map()));
  let limit = byNode.get(node);
  if (limit === undefined) {
    limit = 0;
    for (let i = 0; i < graph.lanes.length; i++) {
      const l = graph.lanes[i];
      if (l.toNode === node && l.maxspeedKmh / 3.6 > limit) limit = l.maxspeedKmh / 3.6;
    }
    byNode.set(node, limit);
  }
  return limit;
}

/**
 * Keep `env.stagedRestSinceSec` — the sim time since which each staged vehicle has been at rest
 * (≤ RESERVATION_PROGRESS_MPS), NaN while it moves. Called by the traffic system once per step, before the fleet.
 * Why a clock and not the speed: a staged car that has just stopped for the student (its player guard) restarts the
 * moment he is clear. Round 3 read 0 km/h as «standing for good» and released a turner into the box that car then
 * re-entered (verifier R3-F2: 22.6 s at rest in the box, 63.7 s with the lesson held open).
 */
export function trackStagedRest(env: VehicleEnv): void {
  const st = env.staged;
  let since = env.stagedRestSinceSec;
  if (since === undefined || since.length < st.length) {
    const grown = new Float64Array(Math.max(8, st.length * 2)).fill(Number.NaN);
    if (since !== undefined) grown.set(since);
    env.stagedRestSinceSec = since = grown;
  }
  for (let j = 0; j < st.length; j++) {
    if (st[j].speedMps > RESERVATION_PROGRESS_MPS) since[j] = Number.NaN;
    else if (Number.isNaN(since[j])) since[j] = env.timeSec;
  }
}

/** Has staged vehicle `j` stood for the patience bound? Without a clock (a bench env that feeds none) rest is rest. */
function stagedStandsForGood(env: VehicleEnv, j: number): boolean {
  if (env.staged[j].speedMps > RESERVATION_PROGRESS_MPS) return false;
  const since = env.stagedRestSinceSec;
  if (since === undefined || j >= since.length) return true;
  return env.timeSec - since[j] >= AMBIENT_YIELD_PATIENCE_SEC;
}

/** Scratch: the junction node `laneEndNode` last found. */
const nodeXY = { x: 0, y: 0 };
/**
 * The junction NODE at the end of `lk`, into `nodeXY`: midway between this lane's end and the start of the same
 * edge's other direction — the two lane centres straddle the node, half a carriageway each — or the lane's own end on a
 * one-way edge. (The lane graph keeps no node positions; stop lines are measured from the node.)
 */
function laneEndNode(graph: LaneGraph, lk: DirectedLane): void {
  const e = lk.px.length - 1;
  if (lk.reverse >= 0) {
    const r = graph.lanes[lk.reverse];
    nodeXY.x = (lk.px[e] + r.px[0]) / 2;
    nodeXY.y = (lk.py[e] + r.py[0]) / 2;
  } else {
    nodeXY.x = lk.px[e];
    nodeXY.y = lk.py[e];
  }
}

/**
 * Is this staged vehicle held by its OWN signal at the junction whose lamps are `signalNodeId`? — on an arm whose lamp
 * (or officer) reads red, outside the junction's drawn radius, and either standing or still able to stop before its
 * line at the fleet's hard braking. Such a car is not about to cross the box: predicting it across would hold the cross street at its own green for every staged
 * car that pulls up to a red. One that is past its line, or can no longer stop — a staged red-light runner — IS
 * predicted. Where the lamps carry no phase of their own (a dark or flashing cluster, an unsignalised junction)
 * nothing is held by them. (`nodeX`, `nodeY`) is the junction's node and `radius` its drawn radius: the lines are
 * STOP_LINE_BEYOND_CUT_M outside it.
 */
function stagedHeldByItsSignal(
  env: VehicleEnv,
  st: TrafficVehicleState,
  signalNodeId: string | null,
  nodeX: number,
  nodeY: number,
  radius: number,
): boolean {
  if (signalNodeId === null || env.ambientSignal === null) return false;
  const bearing = ((Math.atan2(st.dirX, st.dirY) * 180) / Math.PI + 360) % 360;
  const phase = env.ambientSignal(signalNodeId, bearing, "");
  if (phase !== "red" && phase !== "redYellow") return false;
  if (Math.hypot(nodeX - st.x, nodeY - st.y) < radius) return false;
  if (st.speedMps <= RESERVATION_PROGRESS_MPS) return true;
  const toLine =
    (nodeX - st.x) * st.dirX + (nodeY - st.y) * st.dirY - (radius + STOP_LINE_BEYOND_CUT_M) - vehicleHalfLengthM(st.profile);
  return (st.speedMps * st.speedMps) / (2 * env.cfg.hardDecelMps2) <= toLine;
}

/** Scratch: did the gate this step hold the car for a student who is standing (the patience clock's input)? */
const yieldScratch = { heldForStandingPlayer: false };

/** The path through a box is read at points no further apart than this, m (a connector is cut finer). */
const BOX_PATH_STEP_M = 2;
/**
 * THE CLEARANCE A PATH THROUGH THE BOX IS READ AT FOR THE STUDENT, m (round 7, E5 — named here, its value unchanged since
 * round 4): his body and a fleet car's (2 × HALF_LEN) + the clamps' 0.5 m + half the step the path is read at. Every
 * question `studentHoldsBox` asks of him is asked at this distance, so it is also the RESTART DISTANCE of a car holding at
 * its waiting point (D3) for him: it goes again on the first step at which no point of the rest of its path lies within
 * this distance of him (behind him or beside him), nor ahead of him within it of his line as far as he could reach before
 * the car is past. 5.8 m. Instruments read it from here (junction-box-clears.census, the E2/E5 pins).
 */
export const STUDENT_PATH_SEP_M = 2 * HALF_LEN + 0.5 + BOX_PATH_STEP_M / 2;

/** The same clearance for a staged vehicle of `profile` — what `boxGate` asks a staged car at (its restart distance). */
export function stagedPathSepM(profile?: VehicleProfile): number {
  return HALF_LEN + vehicleHalfLengthM(profile) + 0.5 + BOX_PATH_STEP_M / 2;
}

/** A path along two lanes that meet end to start: up to 62 m of box at that step (+ the point beyond). */
const BOX_LINE_POINTS = 64;
/**
 * The path `boxPath` last built: its points, and `arc[i]` = metres along it from where it begins (the junction cut
 * on the car's own lane) to point i. Grown once to the longest connector met, then reused.
 */
const boxPts = {
  px: new Float64Array(BOX_LINE_POINTS + 2),
  py: new Float64Array(BOX_LINE_POINTS + 2),
  arc: new Float64Array(BOX_LINE_POINTS + 2),
};

/**
 * The path a car on `lk` drives through the box at its end onto `nk`, into `boxPts`; returns the point count. It is
 * the connector's own points, or — for lanes that meet end to start — the two lanes from cut to cut, read every
 * BOX_PATH_STEP_M; then one point `beyondM` down `nk` past the box (where the car's centre is when its tail has just
 * left it).
 */
function boxPath(env: VehicleEnv, lk: DirectedLane, nk: DirectedLane, ck: LaneConnector, beyondM: number): number {
  let n = 0;
  let endS: number;
  if (ck.length > 0) {
    const m = ck.px.length;
    if (boxPts.px.length < m + 1) {
      boxPts.px = new Float64Array(m + 1);
      boxPts.py = new Float64Array(m + 1);
      boxPts.arc = new Float64Array(m + 1);
    }
    for (let i = 0; i < m; i++, n++) {
      boxPts.px[n] = ck.px[i];
      boxPts.py[n] = ck.py[i];
      boxPts.arc[n] = ck.cum[i];
    }
    endS = ck.entryS;
  } else {
    const radius = env.graph.junctionRadiusM.get(lk.toNode) ?? 0;
    const cutA = Math.min(radius, lk.length * JUNCTION_TRIM_MAX_FRACTION);
    const cutB = Math.min(radius, nk.length * JUNCTION_TRIM_MAX_FRACTION);
    endS = cutB;
    const stepsA = Math.min(BOX_LINE_POINTS / 2 - 1, Math.ceil(cutA / BOX_PATH_STEP_M));
    for (let i = 0; i <= stepsA; i++, n++) {
      const a = (cutA * i) / Math.max(1, stepsA);
      sampleLane(lk, lk.length - cutA + a, lk.px.length - 2, samp);
      boxPts.px[n] = samp.x;
      boxPts.py[n] = samp.y;
      boxPts.arc[n] = a;
    }
    const stepsB = Math.min(BOX_LINE_POINTS / 2 - 1, Math.ceil(cutB / BOX_PATH_STEP_M));
    for (let i = 1; i <= stepsB; i++, n++) {
      const b = (cutB * i) / stepsB;
      sampleLane(nk, b, 0, samp);
      boxPts.px[n] = samp.x;
      boxPts.py[n] = samp.y;
      boxPts.arc[n] = cutA + b;
    }
  }
  sampleLane(nk, Math.min(nk.length, endS + beyondM), 0, samp);
  boxPts.px[n] = samp.x;
  boxPts.py[n] = samp.y;
  boxPts.arc[n] = boxPts.arc[n - 1] + beyondM;
  return n + 1;
}

/**
 * Drop from the path in `boxPts` (`n` points) everything a car `intoM` m along it has already driven: the car's own
 * pose (x, y) becomes point 0 at arc `intoM`, followed by the points beyond it. Returns the new count (≥ 2 — the point
 * beyond the box is always kept).
 */
function trimBoxPath(n: number, intoM: number, x: number, y: number): number {
  let i0 = 0;
  while (i0 < n - 2 && boxPts.arc[i0] <= intoM) i0++;
  let m = 0;
  boxPts.px[m] = x;
  boxPts.py[m] = y;
  boxPts.arc[m] = intoM;
  m++;
  for (let i = i0; i < n; i++, m++) {
    boxPts.px[m] = boxPts.px[i];
    boxPts.py[m] = boxPts.py[i];
    boxPts.arc[m] = boxPts.arc[i] < intoM ? intoM : boxPts.arc[i];
  }
  return m;
}

/** Is any of the first `n` points of `boxPts` within `sep` of the segment from (ox, oy) `reach` m along (dx, dy)? */
function pathWithin(n: number, ox: number, oy: number, dx: number, dy: number, reach: number, sep: number): boolean {
  const bx = boxPts.px;
  const by = boxPts.py;
  for (let i = 0; i < n; i++) {
    const rx = bx[i] - ox;
    const ry = by[i] - oy;
    let along = rx * dx + ry * dy;
    along = along < 0 ? 0 : along > reach ? reach : along;
    if (Math.hypot(rx - dx * along, ry - dy * along) < sep) return true;
  }
  return false;
}

/**
 * Is the BODY at (x, y) within `sep` of the path in `boxPts` — the polyline through its first `n` points, measured to
 * the line between them, so the clamp's own separation can be asked exactly: a car that would pass 5.3 m beside a
 * standing body is not held for it (the clamp stops it at 4.8 m), one that would pass at 4.7 m is.
 */
function pathNearBody(n: number, x: number, y: number, sep: number): boolean {
  const bx = boxPts.px;
  const by = boxPts.py;
  for (let i = 0; i + 1 < n; i++) {
    const sx = bx[i + 1] - bx[i];
    const sy = by[i + 1] - by[i];
    const len2 = sx * sx + sy * sy;
    let t = len2 > 0 ? ((x - bx[i]) * sx + (y - by[i]) * sy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x - bx[i] - sx * t, y - by[i] - sy * t) < sep) return true;
  }
  return false;
}

/**
 * THE CAR'S OWN RUN THROUGH THE BOX, sampled: `run.s[k]` = metres its centre has covered k·RUN_DT_SEC from now, by
 * the law `updateVehicle` integrates on an empty road — the fleet's acceleration towards the lane's speed, shaped
 * down to the turn's cap at the apex (the middle of the connector) and released after it, the next lane's speed once
 * it has joined that lane. `blocked` = something of the fleet stands on the path, so the run will not be made as
 * sampled: the car's time to anywhere along it is then unknown — read as never.
 */
const RUN_DT_SEC = 0.1;
const RUN_STEPS = 600;
const run = { s: new Float64Array(RUN_STEPS + 1), n: 0, blocked: false };

function sampleBoxRun(
  agent: VehicleAgent,
  env: VehicleEnv,
  lk: DirectedLane,
  nk: DirectedLane,
  toCutM: number,
  boxLenM: number,
  v: number,
): void {
  const cfg = env.cfg;
  const vLane = Math.min((lk.maxspeedKmh / 3.6) * agent.desiredFactor, cfg.maxSpeedMps);
  const vNext = Math.min((nk.maxspeedKmh / 3.6) * agent.desiredFactor, cfg.maxSpeedMps);
  const cap = turnSpeedCap(lk, nk);
  const apexM = toCutM + boxLenM / 2;
  const joinM = toCutM + boxLenM;
  const endM = joinM + HALF_LEN;
  let s = 0;
  let sp = v;
  let k = 0;
  run.s[0] = 0;
  while (k < RUN_STEPS && s < endM) {
    let v0 = s < joinM ? vLane : vNext;
    if (cap < v0 && s <= apexM) {
      const allowed = Math.sqrt(cap * cap + 2 * cfg.comfortDecelMps2 * (apexM - s));
      if (allowed < v0) v0 = allowed;
    }
    if (v0 < 0.5) v0 = 0.5;
    sp = Math.max(0, sp + clampAcc(cfg.accelMps2 * (1 - Math.pow(sp / v0, IDM_DELTA)), cfg) * RUN_DT_SEC);
    s += sp * RUN_DT_SEC;
    run.s[++k] = s;
  }
  run.n = k;
}

/** Seconds until the sampled run has covered `d` m — Infinity when it is blocked or never gets there. */
function runSecTo(d: number): number {
  if (run.blocked) return Infinity;
  if (d <= 0) return 0;
  const s = run.s;
  for (let k = 1; k <= run.n; k++) {
    if (s[k] >= d) return (k - 1 + (d - s[k - 1]) / (s[k] - s[k - 1])) * RUN_DT_SEC;
  }
  return Infinity;
}

/**
 * P1's clock for one other body: how long until this car's centre has PASSED the last point of its path that lies
 * within `sep` of that body's line of travel — from (ox, oy) on along (dx, dy), as far as it likes. That stretch is
 * the only part of the box the body could ever come to; once the car is past it — or has finished its turn onto that
 * very line — the two cannot meet in this box.
 * −1 = no point of the path is on that line at all. `toCutM` is what the car still has to its junction cut.
 */
function secToPassLine(n: number, toCutM: number, ox: number, oy: number, dx: number, dy: number, sep: number): number {
  const bx = boxPts.px;
  const by = boxPts.py;
  let last = -1;
  for (let i = 0; i < n; i++) {
    const rx = bx[i] - ox;
    const ry = by[i] - oy;
    let along = rx * dx + ry * dy;
    if (along < 0) along = 0;
    if (Math.hypot(rx - dx * along, ry - dy * along) < sep) last = i;
  }
  if (last < 0) return -1;
  // A path that ENDS on that line (the car joins the lane the body travels) is never «past» it: the car has then
  // finished its turn ahead of the body, which is a leader's place — the corridor terms' from there on.
  return runSecTo(toCutM + boxPts.arc[last + 1 < n ? last + 1 : last]);
}

/**
 * P1 — MAY THIS CAR ENTER THE BOX AT THE END OF `lk`? true = NO: it holds at its line this step.
 *
 * Asked only while the car can still stop at that line; a car that cannot has entered (P2). `linePhase` is the lamp
 * (or the officer's permission) this lane end obeys, null where it has none.
 *
 * THE QUESTION is the same for every other body: can it come within the clamp separation of this car's path through
 * the box before this car has passed the stretch of that path it could come to (`secToPassLine`)? The path is the
 * connector — for lanes that meet end to start, cut to cut along them — and the half car length beyond it the centre
 * must travel for the tail to be out; the car's own time is its own run (`sampleBoxRun`); the other body's reach is
 * the EARLIEST it could be there (P3, `earliestReachM`). The separation is the clamps': the summed half lengths +
 * 0.5 m, + half the step the path is read at.
 *
 * AGAINST A STAGED VEHICLE (every box: signalised, or an unsignalised junction of three arms or more):
 *   · one that has stood for the patience bound is a standing body — the box is held while it is within the
 *     separation of the path (the car would be frozen against it, vehicles.ts and staged.ts 3b);
 *   · any other is predicted (P3) along its heading. A staged car that has only just stopped — its guard, for the
 *     student — is in this class: it will restart;
 *   · one moving this car's own way is a leader or a follower, the corridor terms' business, as before;
 *   · one held by its OWN red on a crossing arm is not predicted across the box (`stagedHeldByItsSignal`).
 * A staged actor is the lesson's subject and is timed to the student; the ambient car is the one that can wait, and
 * its line is the place (what the catalogue teaches the student for the same situation, sc-jx-blocked-exit).
 *
 * AGAINST THE STUDENT: `studentHoldsBox`.
 */
function boxGate(
  agent: VehicleAgent,
  env: VehicleEnv,
  lk: DirectedLane,
  nk: DirectedLane,
  ck: LaneConnector,
  dEnd: number,
  v: number,
  linePhase: SignalPhase | null,
  inBox = false,
): boolean {
  const cfg = env.cfg;
  gateScratch.waived = false;
  gateScratch.heldFor.length = 0;
  const radius = env.graph.junctionRadiusM.get(lk.toNode) ?? 0;
  const cutA = ck.length > 0 ? lk.length - ck.exitS : Math.min(radius, lk.length * JUNCTION_TRIM_MAX_FRACTION);
  let toCutM = Math.max(0, dEnd - cutA);
  let n = boxPath(env, lk, nk, ck, HALF_LEN);
  // D3 — asked from INSIDE the box (a car on its connector short of its waiting point): the path is what is left of it
  // from the car's own pose on, and every time is counted from there (`toCutM` = minus the metres already driven).
  if (inBox && agent.s > ck.exitS) {
    const intoM = agent.s - ck.exitS;
    n = trimBoxPath(n, intoM, agent.state.x, agent.state.y);
    toCutM = -intoM;
  }
  sampleBoxRun(agent, env, lk, nk, toCutM, boxPts.arc[n - 2], v);
  // A car of the fleet standing on the path: this car would stop in the box behind it — its run is not the sampled one.
  run.blocked = false;
  for (let j = 0; j < env.agents.length && !run.blocked; j++) {
    const o = env.agents[j];
    if (o === agent || o.speed > RESERVATION_PROGRESS_MPS) continue;
    if (pathNearBody(n, o.state.x, o.state.y, VEHICLE_LENGTH_M)) run.blocked = true;
  }
  const e = lk.px.length - 1;
  laneEndNode(env.graph, lk);
  const nodeX = nodeXY.x;
  const nodeY = nodeXY.y;
  let held = false;
  for (let j = 0; j < env.staged.length && !held; j++) {
    const st = env.staged[j];
    if (st === agent.state) continue;
    const sep = stagedPathSepM(st.profile);
    const moving = st.speedMps > RESERVATION_PROGRESS_MPS;
    const myWay = st.dirX * lk.endDirX + st.dirY * lk.endDirY > 0.7;
    if (moving && myWay) continue;
    // Coming AT this car along one of its own lanes (a staged car against the flow): no line it could wait at gets
    // either of them past the other — the corridor terms' business too, as it always was.
    if (againstOnLane(st, lk.px[e], lk.py[e], lk.endDirX, lk.endDirY, cfg) || againstOnLane(st, nk.px[0], nk.py[0], nk.startDirX, nk.startDirY, cfg)) {
      continue;
    }
    let reach = 0;
    if (inBox) {
      // D4 at the waiting point — the car is already in the box: a staged car is waited for only as `stagedArrivesFirst`
      // waits for one, MOVING and there first at the speed it has NOW (one at rest that has stood for the patience bound,
      // or stands outside the junction, holds it only with its body on the rest of the path, below; round 8: one
      // standing in the junction short of that bound is read by its room, as the student is). Predicted by its earliest reach (P3) here, a staged car crawling up to its own line
      // 44 m off stood a car caught in the box by the cross street's green at its waiting point for 15.5–17.9 s
      // (early-stop band, phone-L3/pc-L3 at 59.5–61 m / 30 s; round-5 measurement).
      if (moving && !myWay) {
        const sec = secToPassLine(n, toCutM, st.x, st.y, st.dirX, st.dirY, sep);
        if (sec < 0) continue;
        reach = st.speedMps * sec;
      } else if (!moving && !myWay && !stagedStandsForGood(env, j) && Math.hypot(st.x - nodeX, st.y - nodeY) < radius) {
        // ROUND 8 (E9 for a staged car): one STANDING in the junction — inside the drawn radius — that has not stood for
        // the patience bound (P3: it will restart) is read like the student standing there, by its ROOM: the car goes
        // only if it could pass the stretch of its path that staged car's line comes to before that car could reach it
        // from rest at the fleet's gentle acceleration (`gentleReachM`, cfg.accelMps2). Once it has stood for the bound
        // it is a standing body (its body on the rest of the path, below), as at the line. So the wait is bounded by
        // that rest clock (AMBIENT_YIELD_PATIENCE_SEC); it is not excused by the census as the student's is (E10).
        const sec = secToPassLine(n, toCutM, st.x, st.y, st.dirX, st.dirY, sep);
        if (sec < 0) continue;
        reach = Number.isFinite(sec) ? gentleReachM(0, sec, nodeLimitMps(env.graph, lk.toNode), cfg.accelMps2) : Number.MAX_VALUE;
      }
    } else if (
      !myWay &&
      !stagedStandsForGood(env, j) &&
      !stagedHeldByItsSignal(env, st, lk.endSignalNodeId, nodeX, nodeY, radius)
    ) {
      const sec = secToPassLine(n, toCutM, st.x, st.y, st.dirX, st.dirY, sep);
      if (sec < 0) continue;
      reach = earliestReachM(st.speedMps, sec, cfg.maxSpeedMps);
    }
    if (
      reach > 0
        ? pathWithin(n, st.x, st.y, st.dirX, st.dirY, reach, sep)
        : pathNearBody(n, st.x, st.y, HALF_LEN + vehicleHalfLengthM(st.profile) + 0.5)
    ) {
      held = true;
      gateScratch.heldFor.push(st.id);
    }
  }
  // The student's half is always asked, held by a staged car or not: the patience clock is his, and a staged car
  // lapping through the box must not restart it (verifier R3-F4).
  if ((!inBox || agent.releasedNode === lk.toNode) && studentHoldsBox(agent, env, lk, nk, ck, n, toCutM, linePhase, inBox)) {
    held = true;
    gateScratch.heldFor.push(WAITING_HOLD_STUDENT);
  }
  return held;
}

/** Is this staged vehicle ON the lane through (x, y) along (dx, dy) — within half its width of the line — heading against it? */
function againstOnLane(st: TrafficVehicleState, x: number, y: number, dx: number, dy: number, cfg: TrafficConfig): boolean {
  return (
    st.dirX * dx + st.dirY * dy < -0.7 && Math.abs((st.x - x) * dy - (st.y - y) * dx) < cfg.laneWidthM / 4
  );
}

/**
 * P1 against the STUDENT, with P3. true = the box is held for him.
 *
 * WHERE. At a lane end with a lamp or an officer (`linePhase`), and for a car turning ROUND at any junction (whoever
 * turns round gives way to everybody — round 2's rule, kept).
 *
 * HIS BODY. Wherever he is, a car does not enter while he is within the clamp separation of its path through the box
 * or of the half length beyond it: it would be stopped inside against him. No clock lifts this.
 *
 * WHERE HE COULD BE (P3). He is «coming» when
 *   · he travels AGAINST this approach — the opposite arm, whose signal is this car's own, so it lets him go — and
 *     the car is turning across that arm (the law the product teaches him for the same turn: the left-turner gives
 *     way to oncoming traffic going straight or right). NOT while he is WAITING for the oncoming stream himself
 *     (`studentWaiting`, round 6 E1: his left indicator on AND his car at rest — wherever he stands — or still able
 *     to stop short of his own line at the fleet's comfortable deceleration) and his own left turn runs clear of this
 *     car's (`opposingLeftsClear`): two opposing left turns pass each other, and an ambient driver does not wait for a
 *     student who is waiting for him. Once he can no longer give way the release is gone, whatever he signals: he is
 *     then predicted along the path his car is on — his heading — and the indicator never moves that prediction onto
 *     the turn. A car let in like this
 *     keeps asking until its waiting point (D3, `stopPointTerm`);
 *   · or he is on a CROSSING arm of a junction whose lamps or officer are working — his own reads red — and he is
 *     inside the junction's drawn radius, or moving and unable to stop before his line at the fleet's hard braking
 *     (already past it included): he entered on his own permission and is finishing. A student standing at his red,
 *     or still able to stop for it, is not coming: his signal does not let him;
 *   · or the car is turning round where no signal rules and his car is moving.
 * Then he is predicted along his heading as far as `earliestReachM` puts him by the time the car has passed the
 * stretch of its path he could come to PLUS the taught margin — from wherever he stands, at his line or short of it
 * — and the box is held while that reach comes within the separation of the path. A car turning round is also held
 * while he is MOVING at the junction itself (inside its drawn radius or within a car's length of its lines), whatever
 * his heading: he may be turning. Standing there he is predicted along his heading like anyone else (round 5, R4-F5:
 * a U-turner on sc-junction-rhr stood 36.6–37.8 s for a student at rest 19 m off its path).
 *
 * FROM INSIDE THE BOX (`inBox`, D3 — a car let in for a waiting student, short of its waiting point): a student who is
 * COMING holds it as above, and one still WAITING by E1 while he moves releases it as above; one AT REST holds it only
 * as `studentLeavesRoom` says (round 9, E13, amending round 8's E9): WAITING by E1 — wherever he stands, at his line
 * or inside the junction — he is read as at his line and the car goes; NOT waiting (indicator off or right, or changed
 * away from left while he stands) he is read by his ROOM, and protected for as long as he stands. No patience clock
 * runs there.
 *
 * PATIENCE. Held like that for a student AT REST for the whole bound, the car asks again without the margin: with
 * him pulling away the instant it commits, will it have passed before the earliest he could reach its path? Only
 * then does it go.
 */
function studentHoldsBox(
  agent: VehicleAgent,
  env: VehicleEnv,
  lk: DirectedLane,
  nk: DirectedLane,
  ck: LaneConnector,
  n: number,
  toCutM: number,
  linePhase: SignalPhase | null,
  inBox: boolean,
): boolean {
  if (!env.hasPlayer) return false;
  const cfg = env.cfg;
  const uTurn = nk.index === lk.reverse;
  const signalled = lk.endSignalNodeId !== null && linePhase !== null;
  if (!signalled && !uTurn) return false;
  const e = lk.px.length - 1;
  const relX = env.playerX - lk.px[e];
  const relY = env.playerY - lk.py[e];
  const heading = env.playerDirX * lk.endDirX + env.playerDirY * lk.endDirY;
  // In this car's own lane short of the junction and travelling its way: its leader or its follower.
  if (
    heading > 0.7 &&
    relX * lk.endDirX + relY * lk.endDirY < 0 &&
    Math.abs(relX * lk.endDirY - relY * lk.endDirX) < cfg.laneWidthM / 2
  ) {
    return false;
  }
  const sep = STUDENT_PATH_SEP_M;
  const px = env.playerX;
  const py = env.playerY;
  if (pathNearBody(n, px, py, 2 * HALF_LEN + 0.5)) return true;
  const v = env.playerSpeedMps;
  const atRest = v <= PLAYER_STANDING_MAX_MPS;
  // ROUND 9 (E13). From inside the box a student AT REST holds the car only as `studentLeavesRoom` says: E1 first —
  // WAITING (left indicator, against this approach) he is read as at his line and the car goes — his room second, for
  // one who is not waiting. A MOVING student is read below, exactly as at the line: still waiting by E1 (able to stop
  // short of his line) he releases it; otherwise he is coming.
  if (inBox && atRest) return !studentLeavesRoom(env, lk, n, toCutM);

  const radius = env.graph.junctionRadiusM.get(lk.toNode) ?? 0;
  let coming: boolean;
  if (uTurn && !signalled) {
    // Where no signal rules nothing «lets him go»: he is coming when his car moves (D2), and at rest only his body on
    // the path holds the car (above) — round 4 predicted him launching from anywhere at the junction and stood a
    // U-turner 36.6–37.8 s for a student at rest 19 m off its path (sc-junction-rhr, verifier R4-F5).
    coming = !atRest;
  } else if (heading < -0.7) {
    const cos = lk.endDirX * nk.startDirX + lk.endDirY * nk.startDirY;
    const cross = lk.endDirX * nk.startDirY - lk.endDirY * nk.startDirX;
    coming = cos < -0.17 || (cos < 0.57 && cross > 0); // turnSpeedCap's U-turn / proper-turn bands, to the left
    if (coming && studentWaiting(env, lk) && opposingLeftsClear(env.graph, lk, nk, ck)) {
      coming = false;
      gateScratch.waived = true;
    }
  } else if (heading > 0.7 || env.ambientSignal === null) {
    coming = false;
  } else {
    const bearing = ((Math.atan2(env.playerDirX, env.playerDirY) * 180) / Math.PI + 360) % 360;
    const his = env.ambientSignal(lk.endSignalNodeId as string, bearing, "");
    if (his !== "red" && his !== "redYellow") {
      coming = false; // no lamp of his own to finish on: an uncontrolled cluster — priority there is graded
    } else {
      laneEndNode(env.graph, lk);
      const toLine =
        (nodeXY.x - env.playerX) * env.playerDirX +
        (nodeXY.y - env.playerY) * env.playerDirY -
        (radius + STOP_LINE_BEYOND_CUT_M) -
        HALF_LEN;
      // Standing at his line — even with his nose a hand's breadth over it — he is waiting, not finishing.
      coming =
        Math.hypot(nodeXY.x - env.playerX, nodeXY.y - env.playerY) < radius ||
        (!atRest && (env.playerSpeedMps * env.playerSpeedMps) / (2 * cfg.hardDecelMps2) > toLine);
    }
  }
  const atJunction = uTurn && !atRest && Math.hypot(relX, relY) < radius + STOP_LINE_BEYOND_CUT_M + VEHICLE_LENGTH_M;
  const dx = env.playerDirX;
  const dy = env.playerDirY;
  const sec = coming ? secToPassLine(n, toCutM, px, py, dx, dy, sep) : -1;
  const limit = nodeLimitMps(env.graph, lk.toNode);
  // Inside the box (D3) the taught margin is not added: the car is clearing a box it is already in, and going ahead of a
  // student who cannot reach its path before it has passed is what it owes — round 4's own rule for the in-box staged
  // decision. Kept, the margin stood a released turner 6.6 s at its waiting point for a student setting off 60 m out.
  const margin = inBox ? 0 : AMBIENT_LEFT_TURN_GAP_SEC;
  const withMargin =
    atJunction || (sec >= 0 && pathWithin(n, px, py, dx, dy, earliestReachM(v, sec + margin, limit), sep));
  if (!withMargin) return false;
  if (inBox || !atRest) return true;
  yieldScratch.heldForStandingPlayer = true;
  if (agent.playerYieldSinceSec === null || env.timeSec - agent.playerYieldSinceSec < AMBIENT_YIELD_PATIENCE_SEC) {
    return true;
  }
  return sec >= 0 && pathWithin(n, px, py, dx, dy, earliestReachM(v, sec, limit), sep);
}

/**
 * E1 (round 6; amends round 5's D2) — IS THE STUDENT WAITING FOR THE ONCOMING STREAM at the end of `lk`? The fact is
 * whether he can still give way. He is WAITING when he travels against this car's approach (the opposite arm), his
 * left indicator is on, AND either
 *   · his car is at rest — the product's own standing threshold (`PLAYER_STANDING_MAX_MPS` = the rule engine's
 *     `fullStopMaxSpeedKmh`), wherever he stands: short of his line, at it, or inside the junction (D1); or
 *   · his car can still stop short of HIS OWN stop line at the fleet's comfortable deceleration
 *     (`cfg.comfortDecelMps2`, `DEFAULT_TRAFFIC_CONFIG` 2.2 m/s² — the braking every ambient driver itself uses to stop
 *     at a line, so it judges him by the figure it drives by). His line is read like the fleet's own: the junction
 *     node along his heading, less the node's cut radius, `STOP_LINE_BEYOND_CUT_M` and half a car.
 * (Round 9, E14: at a junction whose lamps are dark or flashing the indicator keeps this meaning — round 8 dropped it
 * there and brought the round-4 mutual wait back, 53–90 s at 13 of 15 dark / flashing rungs, verifier R8-C1.)
 * He is COMING otherwise: once he can no longer stop short of his line at that deceleration, or he is past it and
 * moving. The indicator alone never releases a car into the path of a student who can no longer give way; a coming
 * student is predicted along his heading (P1/P3), and a car let in while he was waiting holds at its waiting point
 * (D3) if he becomes coming before it gets there.
 */
export function studentWaiting(env: VehicleEnv, lk: DirectedLane): boolean {
  if (env.playerIndicator !== "left") return false;
  if (env.playerDirX * lk.endDirX + env.playerDirY * lk.endDirY >= -0.7) return false;
  const v = env.playerSpeedMps;
  if (v <= PLAYER_STANDING_MAX_MPS) return true;
  return (v * v) / (2 * env.cfg.comfortDecelMps2) <= studentToOwnLineM(env, lk);
}

/**
 * How far the student's nose still has to HIS OWN stop line at the junction `lk` ends at, m (negative = he is past
 * it) — read like the fleet reads its own line: the junction node along his heading, less the node's cut radius,
 * `STOP_LINE_BEYOND_CUT_M` and half a car. Read by E1 (`studentWaiting`).
 */
function studentToOwnLineM(env: VehicleEnv, lk: DirectedLane): number {
  laneEndNode(env.graph, lk);
  const radius = env.graph.junctionRadiusM.get(lk.toNode) ?? 0;
  return (
    (nodeXY.x - env.playerX) * env.playerDirX +
    (nodeXY.y - env.playerY) * env.playerDirY -
    (radius + STOP_LINE_BEYOND_CUT_M) -
    HALF_LEN
  );
}

/**
 * ROUND 9, E13 (amends round 8's E9) — DOES THE STUDENT AT REST LEAVE A CAR IN THE BOX ROOM TO GO ON? Asked by a car
 * inside the box short of its waiting point, let in for a student who was waiting (D1/D3), whenever that student is AT
 * REST (a moving one is read by `studentHoldsBox` as at the line). true = it may go on. E1 first, his room second:
 *
 *   · WAITING by E1 (`studentWaiting`: his left indicator on, travelling against this car's approach, at rest) — at
 *     his line, short of it or INSIDE the junction — he is read exactly as at his line: he is waiting for the oncoming
 *     stream, and the car goes. Round 8 read him by his room inside the junction and held the car at its waiting point,
 *     which lies in that car's OWN approach lane: the straight stream he waits for stalled behind it (verifier R8-F1,
 *     deep boxwait 77 of 120 heads over the bound, staged follow car 0 of 25 from 11 m in).
 *   · NOT waiting — indicator off or right, or changed away from left while he stands — he cannot be told apart from
 *     one about to drive straight on (R7-F1: with his indicator cancelled a released car struck him), so the car goes
 *     only if it could pass the stretch of its path his straight-on line comes to (`secToPassLine`, its own run from
 *     where it is) before he could reach that stretch from where he stands: from his present speed at the fleet's own
 *     «Gentle acceleration» (`cfg.accelMps2`, DEFAULT_TRAFFIC_CONFIG 1.8 m/s², traffic/types.ts) up to the node's
 *     limit — nothing new derived. A run that cannot be made as sampled (one of the fleet standing on its path) leaves
 *     no room. Short of that it holds at its waiting point, clear of his lane (D3), for as long as he stands within
 *     reach (E10: such a wait is bounded by his standing, not a freeze). From his line his reach is long, so there in
 *     practice the car goes.
 *
 * The one class this leaves (founder question 7, open): a student who signals LEFT, stands inside the junction and then
 * drives straight on into the turner his signal released.
 *
 * Why no release rule can do better while he stands there (round 7's frontier, physics corrected by the verifier's
 * R7-C3): on sx-v1 the oncoming left-turner standing at its waiting point (−1.69, 15.19) needs 15.10 m — 4.10 s at the
 * fleet's 1.8 m/s² — to get its body out of his straight-on corridor; the lowest point of that body in his corridor is
 * y = 3.34, which a student standing at y = −4 / −7 / −10 / −14 / −20 reaches in 2.28 / 2.86 / 3.34 / 3.90 / 4.63 s at
 * 2 m/s² (1.63 / 2.05 / 2.40 / 2.79 / 3.30 s at 3.9 m/s²). Released while he stands there, it can be struck whenever
 * he sets off; so it is not released while he stands within reach.
 */
export function studentLeavesRoom(env: VehicleEnv, lk: DirectedLane, n: number, toCutM: number): boolean {
  if (studentWaiting(env, lk)) return true;
  const sep = STUDENT_PATH_SEP_M;
  const sec = secToPassLine(n, toCutM, env.playerX, env.playerY, env.playerDirX, env.playerDirY, sep);
  if (sec < 0) return true;
  if (!Number.isFinite(sec)) return false;
  const reach = gentleReachM(env.playerSpeedMps, sec, nodeLimitMps(env.graph, lk.toNode), env.cfg.accelMps2);
  return !pathWithin(n, env.playerX, env.playerY, env.playerDirX, env.playerDirY, reach, sep);
}

/** How far a vehicle doing `v0` gets in `sec` pulling away at `accel` up to `capMps` (never below `v0`), then held. */
function gentleReachM(v0: number, sec: number, capMps: number, accel: number): number {
  if (sec <= 0) return 0;
  const cap = capMps > v0 ? capMps : v0;
  const ramp = (cap - v0) / accel;
  if (sec <= ramp) return v0 * sec + 0.5 * accel * sec * sec;
  return v0 * ramp + 0.5 * accel * ramp * ramp + cap * (sec - ramp);
}

/**
 * Scratch of the last `boxGate`: `waived` — did it let the car in only because the student on the opposite arm was
 * waiting (D1)? `heldFor` — the bodies it held the car for (staged ids, WAITING_HOLD_STUDENT for the student).
 */
const gateScratch = { waived: false, heldFor: [] as number[] };

/** The student, in `waitingPointHoldFor`'s answer (ambient ids count from 0, staged from STAGED_STATE_ID_BASE). */
export const WAITING_HOLD_STUDENT = -1;
const waitingHolds = new WeakMap<TrafficVehicleState, number[]>();
/**
 * ROUND 7 (E6) — WHOM IS THIS CAR HOLDING AT ITS WAITING POINT FOR, this step? The bodies the D3 hold in
 * `stopPointTerm` was decided for — the student (WAITING_HOLD_STUDENT) and/or staged vehicle ids — or null when the
 * car is not held at its waiting point. Read-only, for instruments (the census reads it as it reads the published
 * pose); written once per step by the decision itself, so it is the decision's own reason, not a guess from outside.
 */
export function waitingPointHoldFor(state: TrafficVehicleState): readonly number[] | null {
  return waitingHolds.get(state) ?? null;
}

const opposingLeftsCache = new WeakMap<LaneGraph, Map<number, boolean>>();
/**
 * DO TWO OPPOSING LEFT TURNS PASS EACH OTHER HERE? — this car's, from `lk` onto `nk`, and the one a vehicle on the
 * opposite arm would make. True when this is a proper left turn (not a turn round), the opposite arm has a left turn
 * of its own, and the two connectors — the paths the fleet itself drives — stay the clamp separation (+ the step
 * both are read at) apart everywhere. On sx-v1 they are 14.9 m apart; at a small junction they cross, and there a
 * left-signalling student is still waited for. Built once per movement, cached on the graph.
 */
function opposingLeftsClear(graph: LaneGraph, lk: DirectedLane, nk: DirectedLane, ck: LaneConnector): boolean {
  let byPair = opposingLeftsCache.get(graph);
  if (!byPair) opposingLeftsCache.set(graph, (byPair = new Map()));
  const key = lk.index * graph.lanes.length + nk.index;
  let clear = byPair.get(key);
  if (clear !== undefined) return clear;
  clear = false;
  const cosMine = lk.endDirX * nk.startDirX + lk.endDirY * nk.startDirY;
  if (ck.length > 0 && nk.index !== lk.reverse && cosMine >= -0.17) {
    let opp: DirectedLane | null = null;
    let oppDot = -0.7;
    for (let i = 0; i < graph.lanes.length; i++) {
      const l = graph.lanes[i];
      if (l.toNode !== lk.toNode) continue;
      const d = l.endDirX * lk.endDirX + l.endDirY * lk.endDirY;
      if (d < oppDot) {
        oppDot = d;
        opp = l;
      }
    }
    if (opp !== null) {
      let exit: DirectedLane | null = null;
      let exitCross = 0;
      for (let i = 0; i < graph.lanes.length; i++) {
        const l = graph.lanes[i];
        if (l.fromNode !== lk.toNode || l.index === opp.reverse) continue;
        const cos = opp.endDirX * l.startDirX + opp.endDirY * l.startDirY;
        const cross = opp.endDirX * l.startDirY - opp.endDirY * l.startDirX;
        if (cos < 0.57 && cos >= -0.17 && cross > exitCross) {
          exitCross = cross;
          exit = l;
        }
      }
      if (exit !== null) {
        const co = laneConnector(graph, opp, exit);
        if (co.length > 0) {
          const sep = 2 * HALF_LEN + 0.5 + BOX_PATH_STEP_M;
          clear = true;
          for (let i = 0; i < ck.px.length && clear; i++) {
            for (let j = 0; j < co.px.length; j++) {
              if (Math.hypot(ck.px[i] - co.px[j], ck.py[i] - co.py[j]) < sep) {
                clear = false;
                break;
              }
            }
          }
        }
      }
    }
  }
  byPair.set(key, clear);
  return clear;
}

/**
 * D3 — THE WAITING POINT of the movement from `lk` onto `nk` through `ck`: how far along its connector (m from
 * `ck.exitS`) the car's centre can go with NO part of its body in a lane a student on the opposite arm could drive
 * through straight on — the last place a car let in for a waiting student (D1) can still hold short of his lane.
 * Read off the built geometry: the connector the fleet drives, the car's own body (`vehicleHalfLengthM` ×
 * `vehicleHalfWidthM`), and every opposite-arm lane of the junction carried straight on through it at the system's
 * lane width. Sampled every WAITING_POINT_STEP_M; the answer is the last sample before the first one that touches.
 *   −Infinity = there is none: the body is already in his lane at its stop point (the car decides at its line only);
 *   +Infinity = its path never comes into his lane (there is nothing to hold short of);
 *   NaN       = not a movement this applies to (no connector, or no opposite arm).
 * Cached per movement on the graph.
 */
export function waitingPointArc(graph: LaneGraph, cfg: TrafficConfig, lk: DirectedLane, nk: DirectedLane): number {
  let byPair = waitingPointCache.get(graph);
  if (!byPair) waitingPointCache.set(graph, (byPair = new Map()));
  const key = lk.index * graph.lanes.length + nk.index;
  const known = byPair.get(key);
  if (known !== undefined) return known;
  let w = Number.NaN;
  const ck = laneConnector(graph, lk, nk);
  const strips: DirectedLane[] = [];
  for (let i = 0; i < graph.lanes.length; i++) {
    const l = graph.lanes[i];
    if (l.toNode === lk.toNode && l.endDirX * lk.endDirX + l.endDirY * lk.endDirY < -0.7) strips.push(l);
  }
  if (ck.length > 0 && strips.length > 0) {
    const hl = vehicleHalfLengthM();
    const hw = vehicleHalfWidthM();
    const half = cfg.laneWidthM / 2;
    const touches = (x: number, y: number, dx: number, dy: number): boolean => {
      for (const l of strips) {
        const e = l.px.length - 1;
        // The strip's normal is (−endDirY, endDirX); the body's extent across it, from its heading and its side.
        const nx = -l.endDirY;
        const ny = l.endDirX;
        const lat = (x - l.px[e]) * nx + (y - l.py[e]) * ny;
        const extent = hl * Math.abs(dx * nx + dy * ny) + hw * Math.abs(-dy * nx + dx * ny);
        if (Math.abs(lat) < half + extent) return true;
      }
      return false;
    };
    // Its stop point: the car's centre with its nose on the line, heading along its lane.
    const stopS = lk.length - junctionStopOffsetM(graph, lk, cfg.signalStopOffsetM) - HALF_LEN;
    const p = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
    sampleLane(lk, Math.max(0, stopS), 0, p);
    if (touches(p.x, p.y, lk.endDirX, lk.endDirY)) {
      w = -Infinity;
    } else {
      w = Infinity;
      p.segHint = 0;
      for (let a = 0; a <= ck.length; a += WAITING_POINT_STEP_M) {
        sampleLane(ck, a, p.segHint, p);
        if (touches(p.x, p.y, p.dirX, p.dirY)) {
          w = a - WAITING_POINT_STEP_M;
          break;
        }
      }
    }
  }
  byPair.set(key, w);
  return w;
}
const waitingPointCache = new WeakMap<LaneGraph, Map<number, number>>();
/** The waiting point is looked for every this many metres of connector, m. */
const WAITING_POINT_STEP_M = 0.25;

/**
 * D3 — is this car, let in for a waiting student (`releasedNode`), past the last point at which it could still stop
 * short of his lane (its waiting point, at the fleet's hard braking)? Then it CLEARS: it does not brake for him (P2,
 * amended: a vehicle never stops in a lane another stream drives through). A movement without a waiting point
 * (`waitingPointArc` −Infinity) is past it from its line.
 */
function committedPastWaitingPoint(
  agent: VehicleAgent,
  env: VehicleEnv,
  cur: DirectedLane,
  next: DirectedLane,
  conn: LaneConnector,
  v: number,
): boolean {
  if (agent.releasedNode === null || agent.releasedNode !== cur.toNode || conn.length <= 0) return false;
  const w = waitingPointArc(env.graph, env.cfg, cur, next);
  if (Number.isNaN(w) || w === Infinity) return false;
  if (w === -Infinity) return true;
  const dW = conn.exitS + w - agent.s;
  return dW <= 0 || (v * v) / (2 * env.cfg.hardDecelMps2) >= dW;
}

/**
 * P2 — WHICH BOX IS THIS CAR IN? 0 = none; 1 = an unsignalised junction's; 2 = a signalised one's. A car is in the box
 * from the step it can no longer be asked at its line (its nose is within 0.3 m of the stop point, `stopPointTerm`)
 * until its tail is out on the far side (its centre half a car length past the cut of the lane it left by).
 */
function boxOf(agent: VehicleAgent, env: VehicleEnv, cur: DirectedLane): number {
  const g = env.graph;
  if (cur.endSignalNodeId !== null || cur.endYieldDegree >= 3) {
    const off = junctionStopOffsetM(
      g,
      cur,
      cur.endSignalNodeId !== null ? env.cfg.signalStopOffsetM : UNSIGNALIZED_STOP_FLOOR_M,
    );
    if (cur.length - agent.s - off - HALF_LEN <= 0.3) {
      return cur.endSignalNodeId !== null ? 2 : 1;
    }
  }
  const idxs = agent.route.laneIndices;
  const prev = g.lanes[idxs[(agent.routePos + idxs.length - 1) % idxs.length]];
  if (prev !== cur && prev.toNode === cur.fromNode && (prev.endSignalNodeId !== null || prev.endYieldDegree >= 3)) {
    const cut = Math.min(g.junctionRadiusM.get(cur.fromNode) ?? 0, cur.length * JUNCTION_TRIM_MAX_FRACTION);
    if (agent.s < Math.max(cut, laneConnector(g, prev, cur).entryS) + HALF_LEN) {
      return prev.endSignalNodeId !== null ? 2 : 1;
    }
  }
  return 0;
}

/**
 * P2 — IS THE POINT (x, y) ACROSS THE BOWS OF THE BODY AT (bx, by) HEADING (bdx, bdy)? Ahead of its centre by less than
 * `aheadM` and less than `halfWidthM` off its line of travel.
 *
 * WHY THE CLAMPS ARE DIRECTIONAL. Each anti-overlap clamp here and in staged.ts (3b) refuses any step that CLOSES on
 * the other body inside the summed half lengths + 0.5 m, from any angle. Two bodies whose paths cross therefore stop
 * each other for good — and the place an ambient car froze was across the other's lane: in the student's (verifier
 * R3-F1: at (4.4, 5.7) in the northbound lane, hit at 30 km/h) or in a staged car's, which then could not advance
 * either (R3-F2). «Who is further through» is read off the geometry the staged guards themselves use: a staged car
 * holds for an ambient body inside its corridor (staged.ts 2b: GUARD_AHEAD_M ahead, GUARD_LATERAL_M 3.0 m to a side)
 * or inside the clamp separation of its next pose (3b) — both inside the strip `aheadM` × the clamp separation ahead
 * of it. So:
 *   · a car INSIDE that strip is further through: the other body is, or is about to be, held by it. Nothing may hold
 *     it there but a step that would put the two bodies into each other (`bodiesOverlap`) — it drives on and clears;
 *   · a car OUTSIDE it is held by the clamps as before, where the other body is free to leave — and its step INTO
 *     the strip of a staged car that can still move is refused, so it never comes to rest where that car's own guards
 *     would hold the car for it.
 * NO PAIR CAN HOLD EACH OTHER: an ambient car at rest because of a staged car is either outside the strip — then no
 * guard of the staged car reads it — or inside it and physically against that car's body; the second is reachable
 * only across the bows of a staged car that had stood for the bound with the path clear of its body, or by a car that
 * could not have stopped. For the student the same strip is his lane ahead: a car across it keeps moving out of it.
 */
function acrossBows(
  x: number,
  y: number,
  bx: number,
  by: number,
  bdx: number,
  bdy: number,
  aheadM: number,
  halfWidthM: number,
): boolean {
  const rx = x - bx;
  const ry = y - by;
  const along = rx * bdx + ry * bdy;
  return along > 0 && along < aheadM && Math.abs(rx * bdy - ry * bdx) < halfWidthM;
}

/**
 * Would two car bodies overlap — rectangles of half length `la`/`lb` and half width `wa`/`wb` centred at (ax, ay) and
 * (bx, by) along their headings, with `gapM` of air demanded between them? Separating axes of two rectangles.
 */
function bodiesOverlap(
  ax: number,
  ay: number,
  adx: number,
  ady: number,
  la: number,
  wa: number,
  bx: number,
  by: number,
  bdx: number,
  bdy: number,
  lb: number,
  wb: number,
  gapM: number,
): boolean {
  const rx = bx - ax;
  const ry = by - ay;
  const c = Math.abs(adx * bdx + ady * bdy);
  const s = Math.abs(adx * bdy - ady * bdx);
  if (Math.abs(rx * adx + ry * ady) >= la + lb * c + wb * s + gapM) return false;
  if (Math.abs(rx * ady - ry * adx) >= wa + lb * s + wb * c + gapM) return false;
  if (Math.abs(rx * bdx + ry * bdy) >= lb + la * c + wa * s + gapM) return false;
  if (Math.abs(rx * bdy - ry * bdx) >= wb + la * s + wa * c + gapM) return false;
  return true;
}
/**
 * Air demanded between two BODIES by the directional clamp, m — the bodies the fleet publishes (4.1 × 1.84 m for a
 * car, `vehicleHalfLengthM` / `vehicleHalfWidthM`), not the 4.3 m this file follows at. Less than the least air the
 * staged clamp itself can leave between two cars it holds 4.60 m apart (4.60 − two half diagonals of 2.25 m =
 * 0.11 m), so a car the staged car is holding for is never refused the step past its nose; more than nothing, so the
 * two never touch.
 */
const BODY_GAP_M = 0.1;


/**
 * P2, round 5 — WILL THIS STAGED CAR BE AT THE CROSSING BEFORE THE CAR STEPPING ONTO ITS LINE IS OFF IT AGAIN, AT THE
 * SPEED IT HAS NOW? Only a staged car that is MOVING (over RESERVATION_PROGRESS_MPS) is asked about. The car is one step
 * from being within `sep` of the staged car's line of travel; its own path is walked on from there (`walkedPose`,
 * every CROSSING_STEP_M) until it is `sep` clear of that line on the far side — or has left the strip the way it came,
 * or has run CROSSING_LOOK_M along it (it is joining that lane, not crossing it): that is what it has to drive, at the
 * fleet's own acceleration from the speed it has. The staged car covers its PRESENT speed × that time; if that brings
 * it within a separation of the nearest point of the crossing, the car waits.
 * WHY THIS IS BOUNDED: the staged car is then within (the car's crossing time × its own speed) of the crossing and
 * moving — it is through within that time, or it slows; and the moment it stands (its guard, a script hold) nothing
 * here holds the car any more: across a standing car's bows the car is the one further through (P2).
 */
function stagedArrivesFirst(
  agent: VehicleAgent,
  env: VehicleEnv,
  cur: DirectedLane,
  conn: LaneConnector,
  st: TrafficVehicleState,
  sep: number,
): boolean {
  if (st.speedMps <= RESERVATION_PROGRESS_MPS) return false;
  const cfg = env.cfg;
  let side = 0;
  let nearest = Infinity;
  let crossM = CROSSING_LOOK_M;
  for (let d = CROSSING_STEP_M; d <= CROSSING_LOOK_M; d += CROSSING_STEP_M) {
    walkedPose(agent, env, cur, conn, agent.s + d);
    const rx = samp.x - st.x;
    const ry = samp.y - st.y;
    const along = rx * st.dirX + ry * st.dirY;
    const lat = rx * st.dirY - ry * st.dirX;
    if (Math.abs(lat) < sep) {
      if (side === 0) side = lat < 0 ? -1 : 1;
      if (along < nearest) nearest = along;
    } else if (side !== 0 || d > 2 * sep) {
      // Off the strip again — across it, or back out the way it came (or it never entered it within reach).
      crossM = d;
      break;
    }
  }
  if (nearest === Infinity || nearest < -sep) return false;
  const v = agent.speed;
  const sec = (Math.sqrt(v * v + 2 * cfg.accelMps2 * crossM) - v) / cfg.accelMps2;
  return st.speedMps * sec > nearest - sep;
}
/** How far along its own route a car's crossing of a staged car's line is looked for, and at what step, m. */
const CROSSING_LOOK_M = 60;
const CROSSING_STEP_M = 1;

/**
 * How far ahead of itself a staged car's «bows» reach, m: as far as its own guards read (STAGED_GUARD_AHEAD_M),
 * or — if longer — as far as it could be within the taught gap, pulling away as hard as it can (P3). Not its present
 * speed held: a staged car that had slowed for the student let a turner creep up to its line and then drove on
 * (measured on sc-turn-left-oncoming, early stop 59.5 m / 30 s, the lesson held open: 64.5 s nose to flank).
 */
function stagedBowsM(st: TrafficVehicleState, cfg: TrafficConfig): number {
  return Math.max(STAGED_GUARD_AHEAD_M, earliestReachM(st.speedMps, AMBIENT_LEFT_TURN_GAP_SEC, cfg.maxSpeedMps));
}

/**
 * P2 for the STUDENT — is this car across HIS bows, and further through than he is? He is moving, the car's body
 * lies on his line of travel ahead of him (its centre nearer that line than the two bodies' lateral reach at their
 * angle), the car is crossing that line, not driving along it (more than a bend apart — `turnSpeedCap`'s 0.9) — and
 * AT THE SPEEDS THE TWO HAVE the car will be off his line before he is at it. Only then is stopping the one thing it
 * must not do: it is in his lane and it is the one that can get out. A car that would NOT be out first is held by
 * the clamp as it always was — its nose on his line with him four metres off is not «further through», it is in his
 * way (measured in the round-4 search on a dark junction, sc-signal-dead L5: a car from his left, exempted the
 * moment its nose reached his line, drove on in front of him).
 */
function acrossStudentBows(agent: VehicleAgent, env: VehicleEnv): boolean {
  if (!env.hasPlayer || env.playerSpeedMps <= RESERVATION_PROGRESS_MPS) return false;
  const rx = agent.state.x - env.playerX;
  const ry = agent.state.y - env.playerY;
  const along = rx * env.playerDirX + ry * env.playerDirY;
  if (along <= 0 || along >= env.cfg.lookaheadM) return false;
  const c = Math.abs(agent.state.dirX * env.playerDirX + agent.state.dirY * env.playerDirY);
  if (c >= 0.9) return false;
  const cross = agent.state.dirX * env.playerDirY - agent.state.dirY * env.playerDirX;
  const s = Math.abs(cross);
  const halfLen = vehicleHalfLengthM(agent.state.profile);
  const halfWid = vehicleHalfWidthM(agent.state.profile);
  const reach = vehicleHalfWidthM() + halfLen * s + halfWid * c;
  const lat = rx * env.playerDirY - ry * env.playerDirX;
  if (Math.abs(lat) >= reach) return false;
  // The car leaves his line on the side it is heading for: `reach` beyond it, at its own lateral speed.
  const outSec = (reach - lat * Math.sign(cross)) / Math.max(1e-6, agent.speed * s);
  // He reaches the car's flank when the air between the two bodies along his line is gone.
  const himSec = (along - vehicleHalfLengthM() - (halfLen * c + halfWid * s)) / env.playerSpeedMps;
  return outSec < himSec;
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
  yieldScratch.heldForStandingPlayer = false;
  waitingHolds.delete(agent.state);

  for (let k = 0; k < 3 && !blocked; k++) {
    const lk = lane(env, agent, k);
    if (k > 0 && acc > cfg.lookaheadM) break;
    const nk = lane(env, agent, k + 1);
    const ck = laneConnector(env.graph, lk, nk);

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
    // The lamp (or the officer) this lane end obeys — null where it has no line; read once, for the stop and the gate.
    const linePhase = lk.endSignalNodeId ? laneEndSignal(env, lk) : null;
    if (lk.endSignalNodeId && dEnd < cfg.lookaheadM + signalOffsetM) {
      const stopAt = dEnd - signalOffsetM - HALF_LEN;
      if (stopAt > 0.3 && agent.committedSignalNode !== lk.endSignalNodeId) {
        const phase = linePhase;
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

    // THE JUNCTION BOX (protocol P1): all yielding happens here, at the line, while the car can still stop at it —
    // it enters only a box it will clear (see boxGate). A car past this point has entered and is never asked again.
    if (!blocked && (lk.endSignalNodeId !== null || lk.endYieldDegree >= 3)) {
      const stopOffsetM = junctionStopOffsetM(
        env.graph,
        lk,
        lk.endSignalNodeId !== null ? cfg.signalStopOffsetM : UNSIGNALIZED_STOP_FLOOR_M,
      );
      const stopAt = dEnd - stopOffsetM - HALF_LEN;
      if (
        stopAt > 0.3 &&
        dEnd < cfg.lookaheadM + stopOffsetM &&
        (v * v) / (2 * cfg.hardDecelMps2) < stopAt &&
        (env.staged.length > 0 || env.hasPlayer)
      ) {
        const held = boxGate(agent, env, lk, nk, ck, dEnd, v, linePhase);
        // D1 bookkeeping: let in because the student on the opposite arm was waiting — from then on, until it has left
        // this lane, it keeps asking (D3). Never unset here: a car released and then held for him as he sets off may
        // still roll over its line, and it must not enter as one that was never released.
        if (!held && gateScratch.waived) agent.releasedNode = lk.toNode;
        if (held) {
          const t = idmTerm(cfg, v, stopAt, 0);
          if (t > term) term = t;
          blocked = true;
        }
      } else if (
        k === 0 &&
        lk.endSignalNodeId !== null &&
        ck.length > 0 &&
        (env.staged.length > 0 || (env.hasPlayer && agent.releasedNode === lk.toNode))
      ) {
        // D3 — past its line, a car let in for a waiting student keeps deciding up to its WAITING POINT: while it can
        // still stop short of his lane it holds there if he has become COMING, and goes again by the same test. D4 —
        // the waiting point is also the one place after the line where ANY car that has one decides about a staged car
        // (P1 from its own pose): a staged car that ran its own red is not left to meet it in the box.
        const w = waitingPointArc(env.graph, cfg, lk, nk);
        const dW = ck.exitS + w - agent.s;
        if (
          w > -Infinity &&
          w < Infinity &&
          dW > 0 &&
          (v * v) / (2 * cfg.hardDecelMps2) < dW &&
          boxGate(agent, env, lk, nk, ck, dEnd, v, linePhase, true)
        ) {
          const t = idmTerm(cfg, v, dW, 0);
          if (t > term) term = t;
          blocked = true;
          waitingHolds.set(agent.state, gateScratch.heldFor.slice());
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

    // On to the next lane: the rest of this lane's line, its connector, less the arc the next lane is joined at —
    // `acc` stays „the distance to arc 0 of lane k", so every stop point above is still at `acc + its arc`.
    acc += ck.exitS + ck.length - ck.entryS;
  }
  // The patience clock (AMBIENT_YIELD_PATIENCE_SEC): running while the gate above held this car for a student who is
  // standing, dead on any step it did not (he moved, he is no longer in its way, or a red lamp holds the car).
  agent.playerYieldSinceSec = yieldScratch.heldForStandingPlayer ? (agent.playerYieldSinceSec ?? env.timeSec) : null;
  return term;
}
