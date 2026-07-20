/**
 * Staged (scripted) actors — the traffic side of the A8 scenario orchestrator.
 *
 * A staged actor is NOT an ambient agent: no IDM, no routes, no reservations.
 * It follows one pre-resolved path and executes one imperative command at a
 * time (hold / cruise / matchPlayer / brake / reset), so the orchestrator can
 * time a deterministic encounter to the player's approach. State publishes
 * into the same TrafficVehicleState / TrafficPedestrianState objects the
 * presentation layer and the rule-engine queries already read.
 *
 * Determinism: pure functions of (spec, command stream, player pose stream,
 * dt sequence) — staged actors draw no randomness at all. Zero allocations in
 * the per-frame update path; all buffers are built at stage() time.
 *
 * Honest v1 limitations (doc 68 A8 / audit C1+C3): ambient agents do not see
 * staged actors; "cyclists" are narrow scripted vehicle-agents rendered with
 * the car fleet; scripted actors obey their script, not signals/reservations
 * (the orchestrator's timing is responsible for plausibility).
 */

import { offsetPolyline, projectOntoPolyline, sampleLane, type LaneGraph } from "./graph";
import type {
  StagedCommand,
  StagedPedestrianSpec,
  StagedVehicleSpec,
  TrafficPedestrianState,
  TrafficVehicleState,
} from "./types";

const DEFAULT_ACCEL_MPS2 = 2.6;
const DEFAULT_DECEL_MPS2 = 4.5;
const DEFAULT_SLAM_DECEL_MPS2 = 7.5;
const HOLD_DECEL_MPS2 = 8;
/** Default laneShift glide duration, s (the FO-03 cut-in reads as one calm
 *  lane change at urban speed — ~8 m of lateral travel over 1.5 s). */
const DEFAULT_LANE_SHIFT_RAMP_SEC = 1.5;
/** Player-guard corridor: brake for a player within this far ahead, m. */
const GUARD_AHEAD_M = 16;
/** Player-guard lateral half-width, m (~car width + margin). */
const GUARD_LATERAL_M = 3.0;
/** Guard aims to stop this far short of the player, m. */
const GUARD_STOP_SHORT_M = 6;
/** matchPlayer proportional gain: m/s of speed delta per meter of gap error. */
const MATCH_GAIN = 0.55;
/** Numeric ids for published staged states (ambient ids are 0..count-1). */
export const STAGED_STATE_ID_BASE = 1000;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export interface StagedPath {
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  length: number;
  /** Arc position of each spec path node (vehicles; ends inclusive). */
  nodeS: number[];
}

/**
 * Resolve a node sequence into one concatenated lane-center polyline.
 * Consecutive pairs must be connected by a directed lane; a lateral jog
 * between lanes of different offsets becomes a real connector segment (the
 * actor drives smoothly through it instead of teleporting like ambient
 * agents do at lane boundaries). Returns null on any unresolvable hop.
 */
export function resolveStagedVehiclePath(
  graph: LaneGraph,
  pathNodes: readonly string[],
  extraRightOffsetM: number,
): StagedPath | null {
  if (pathNodes.length < 2) return null;
  const points: number[][] = [];
  const nodePointIdx: number[] = [0];

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const from = pathNodes[i];
    const to = pathNodes[i + 1];
    const out = graph.nodeOut.get(from);
    let laneIdx = -1;
    if (out) {
      for (const li of out) {
        if (graph.lanes[li].toNode === to) {
          laneIdx = li;
          break;
        }
      }
    }
    if (laneIdx === -1) return null;
    const lane = graph.lanes[laneIdx];
    // Lane polylines are already lane-center; apply the extra curb offset by
    // re-offsetting the lane points (stage-time allocation only).
    let lx = lane.px;
    let ly = lane.py;
    if (extraRightOffsetM !== 0) {
      const pts: number[][] = [];
      for (let p = 0; p < lane.px.length; p++) pts.push([lane.px[p], lane.py[p]]);
      const off = offsetPolyline(pts, extraRightOffsetM);
      lx = off.px;
      ly = off.py;
    }
    for (let p = 0; p < lx.length; p++) {
      const x = lx[p];
      const y = ly[p];
      const last = points[points.length - 1];
      // Dedupe near-coincident joints (equal-offset lanes share endpoints).
      if (last && Math.hypot(last[0] - x, last[1] - y) < 0.02) continue;
      points.push([x, y]);
    }
    nodePointIdx.push(points.length - 1);
  }
  if (points.length < 2) return null;

  const n = points.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const cum = new Float64Array(n);
  px[0] = points[0][0];
  py[0] = points[0][1];
  for (let i = 1; i < n; i++) {
    px[i] = points[i][0];
    py[i] = points[i][1];
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  const nodeS = nodePointIdx.map((idx) => cum[idx]);
  return { px, py, cum, length: cum[n - 1], nodeS };
}

/** Explicit polyline (pedestrian paths are authored point lists). */
export function buildStagedPedPath(path: ReadonlyArray<{ x: number; y: number }>): StagedPath | null {
  if (path.length < 2) return null;
  const n = path.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const cum = new Float64Array(n);
  px[0] = path[0].x;
  py[0] = path[0].y;
  for (let i = 1; i < n; i++) {
    px[i] = path[i].x;
    py[i] = path[i].y;
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  if (!(cum[n - 1] > 0.2)) return null;
  return { px, py, cum, length: cum[n - 1], nodeS: [] };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** Internal command state (discriminant mirrors StagedCommand.type). */
interface CommandState {
  type: StagedCommand["type"];
  speedMps: number;
  gapM: number;
  maxSpeedMps: number;
  decelMps2: number;
}

/** Mutable view backing object — same identity for the actor's lifetime. */
interface MutableView {
  id: string;
  kind: "vehicle" | "pedestrian";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
  s: number;
  pathLengthM: number;
  nodeS: readonly number[];
  finished: boolean;
}

export interface StagedVehicleAgent {
  spec: StagedVehicleSpec;
  path: StagedPath;
  state: TrafficVehicleState;
  view: MutableView;
  command: CommandState;
  holdS: number;
  s: number;
  speed: number;
  segHint: number;
  playerSegHint: number;
  finished: boolean;
  /** Lateral channel (laneShift): current published offset right of the
   *  resolved path, m. 0 for every actor never commanded — byte-identical
   *  pre-laneShift publishing. */
  lat: number;
  /** laneShift target offset, m (== lat when no glide is running). */
  latTarget: number;
  /** Signed glide rate toward latTarget, m/s (0 = idle channel). */
  latRate: number;
}

export interface StagedPedestrianAgent {
  spec: StagedPedestrianSpec;
  path: StagedPath;
  state: TrafficPedestrianState;
  view: MutableView;
  walking: boolean;
  s: number;
  segHint: number;
  finished: boolean;
  /** Currently counted in the crossing occupancy map. */
  onRoad: boolean;
}

/** What staged updates read each frame — refreshed by system.ts. */
export interface StagedEnv {
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedMps: number;
  crossingCounts: Map<string, number>;
}

const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

function clampArc(path: StagedPath, s: number): number {
  return s < 0 ? 0 : s > path.length ? path.length : s;
}

export function createStagedVehicle(
  spec: StagedVehicleSpec,
  path: StagedPath,
  stateId: number,
): StagedVehicleAgent {
  const nodeIdx = Math.min(Math.max(spec.hold.nodeIndex, 0), path.nodeS.length - 1);
  const holdS = clampArc(path, path.nodeS[nodeIdx] + spec.hold.offsetM);
  const agent: StagedVehicleAgent = {
    spec,
    path,
    state: {
      id: stateId,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      braking: false,
      colorIndex: spec.colorIndex ?? 0,
      // FO-06 size/type profile — only present when the spec authors one, so
      // profile-less staged actors publish the exact pre-profile state shape.
      ...(spec.profile !== undefined ? { profile: spec.profile } : {}),
    },
    view: {
      id: spec.id,
      kind: "vehicle",
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      s: holdS,
      pathLengthM: path.length,
      nodeS: path.nodeS,
      finished: false,
    },
    command: { type: "hold", speedMps: 0, gapM: 0, maxSpeedMps: 0, decelMps2: 0 },
    holdS,
    s: holdS,
    speed: 0,
    segHint: 0,
    playerSegHint: 0,
    finished: false,
    lat: 0,
    latTarget: 0,
    latRate: 0,
  };
  publishVehicle(agent);
  return agent;
}

export function createStagedPedestrian(
  spec: StagedPedestrianSpec,
  path: StagedPath,
  stateId: number,
): StagedPedestrianAgent {
  const agent: StagedPedestrianAgent = {
    spec,
    path,
    state: {
      id: stateId,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      walkPhase: 0,
      onCrossing: false,
      colorIndex: spec.colorIndex ?? 0,
      // VP-11 standing pose — only present when the spec authors one, so
      // pose-less staged pedestrians publish the exact pre-pose state shape.
      ...(spec.pose !== undefined ? { pose: spec.pose } : {}),
      // R3 #25–28 body variant (child / elder+cane) — the same discipline:
      // only present when authored; variant-less actors publish the exact
      // pre-variant state shape. Visual only (TrafficLayer's rig mapping).
      ...(spec.variant !== undefined ? { variant: spec.variant } : {}),
    },
    view: {
      id: spec.id,
      kind: "pedestrian",
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      s: 0,
      pathLengthM: path.length,
      nodeS: path.nodeS,
      finished: false,
    },
    walking: false,
    s: 0,
    segHint: 0,
    finished: false,
    onRoad: false,
  };
  publishPedestrian(agent, 0);
  return agent;
}

export function applyStagedCommand(
  agent: StagedVehicleAgent | StagedPedestrianAgent,
  command: StagedCommand,
  env: StagedEnv,
): void {
  if (agent.view.kind === "vehicle") {
    const v = agent as StagedVehicleAgent;
    switch (command.type) {
      case "hold":
        v.command.type = "hold";
        break;
      case "cruise":
        v.command.type = "cruise";
        v.command.speedMps = command.speedMps ?? v.spec.cruiseSpeedMps;
        break;
      case "matchPlayer":
        v.command.type = "matchPlayer";
        v.command.gapM = command.gapM;
        v.command.maxSpeedMps = command.maxSpeedMps;
        break;
      case "brake":
        v.command.type = "brake";
        v.command.decelMps2 = command.decelMps2 ?? DEFAULT_SLAM_DECEL_MPS2;
        break;
      case "laneShift": {
        // Lateral channel only — the longitudinal command keeps driving speed.
        const ramp = command.rampSec ?? DEFAULT_LANE_SHIFT_RAMP_SEC;
        v.latTarget = command.toOffsetM;
        v.latRate = ramp > 0 ? (v.latTarget - v.lat) / ramp : 0;
        if (ramp <= 0) v.lat = v.latTarget; // degenerate ramp = instant
        break;
      }
      case "reset":
        v.command.type = "hold";
        v.s = v.holdS;
        v.speed = 0;
        v.segHint = 0;
        v.finished = false;
        v.lat = 0;
        v.latTarget = 0;
        v.latRate = 0;
        publishVehicle(v);
        break;
    }
    return;
  }
  const p = agent as StagedPedestrianAgent;
  switch (command.type) {
    case "cruise":
      p.walking = true;
      break;
    case "hold":
      p.walking = false;
      break;
    case "reset":
      p.walking = false;
      p.s = 0;
      p.segHint = 0;
      p.finished = false;
      setPedOnRoad(p, false, env.crossingCounts);
      publishPedestrian(p, 0);
      break;
    default:
      break; // matchPlayer / brake / laneShift are vehicle-only — ignore
  }
}

// ---------------------------------------------------------------------------
// Per-frame updates
// ---------------------------------------------------------------------------

export function updateStagedVehicle(agent: StagedVehicleAgent, dt: number, env: StagedEnv): void {
  const spec = agent.spec;
  const cmd = agent.command;
  const accel = spec.accelMps2 ?? DEFAULT_ACCEL_MPS2;
  const decel = spec.decelMps2 ?? DEFAULT_DECEL_MPS2;

  // 1) Target speed from the active command.
  let target = 0;
  let brakeCap = decel;
  switch (cmd.type) {
    case "hold":
      target = 0;
      brakeCap = HOLD_DECEL_MPS2;
      break;
    case "cruise":
      target = agent.finished ? 0 : cmd.speedMps;
      break;
    case "matchPlayer": {
      if (env.hasPlayer && !agent.finished) {
        const proj = projectOntoPolyline(
          agent.path.px,
          agent.path.py,
          agent.path.cum,
          env.playerX,
          env.playerY,
        );
        // Too little gap → pull away faster than the player; too much → ease
        // off and let them close in.
        const gap = agent.s - proj.s;
        target = env.playerSpeedMps + MATCH_GAIN * (cmd.gapM - gap);
        if (target > cmd.maxSpeedMps) target = cmd.maxSpeedMps;
        if (target < 0) target = 0;
      } else {
        target = 0;
      }
      break;
    }
    case "brake":
      target = 0;
      brakeCap = cmd.decelMps2;
      break;
    default:
      target = 0;
  }

  // 2) Player guard — never ram the player from behind (skip while slamming:
  //    a brake command is already the strongest stop available).
  if (cmd.type !== "brake" && (spec.playerGuard ?? true) && env.hasPlayer) {
    const relX = env.playerX - agent.state.x;
    const relY = env.playerY - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    if (along > 0 && along < GUARD_AHEAD_M && lateral < GUARD_LATERAL_M) {
      const guardTarget = Math.max(0, (along - GUARD_STOP_SHORT_M) * 0.8);
      if (guardTarget < target) {
        target = guardTarget;
        brakeCap = HOLD_DECEL_MPS2;
      }
    }
  }

  // 3) Integrate speed toward the target (asymmetric accel/brake ramps).
  if (agent.speed < target) {
    agent.speed = Math.min(target, agent.speed + accel * dt);
  } else if (agent.speed > target) {
    agent.speed = Math.max(target, agent.speed - brakeCap * dt);
  }
  agent.s += agent.speed * dt;

  // 4) Path end / loop wrap.
  if (spec.loop) {
    if (agent.s >= agent.path.length) {
      agent.s -= agent.path.length;
      agent.segHint = 0;
    }
  } else if (agent.s >= agent.path.length) {
    agent.s = agent.path.length;
    agent.speed = 0;
    agent.finished = true;
  }

  // 4b) Lateral glide (laneShift): pure dt integration toward the target,
  // clamped so the channel parks exactly on it (idle channel = zero work).
  if (agent.lat !== agent.latTarget && agent.latRate !== 0) {
    const next = agent.lat + agent.latRate * dt;
    agent.lat =
      (agent.latRate > 0 && next >= agent.latTarget) ||
      (agent.latRate < 0 && next <= agent.latTarget)
        ? agent.latTarget
        : next;
    if (agent.lat === agent.latTarget) agent.latRate = 0;
  }

  // Brake lights: an active slam, or actively slowing toward a lower target.
  agent.state.braking = cmd.type === "brake" || agent.speed > target + 0.3;

  publishVehicle(agent);
}

function publishVehicle(agent: StagedVehicleAgent): void {
  sampleLane(agent.path, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  // Lateral channel: offset the published pose to the RIGHT of travel
  // (right normal of (dx, dy) is (dy, -dx) — the offsetPolyline convention).
  // lat = 0 for every actor never laneShift-ed → byte-identical publishing.
  agent.state.x = samp.x + samp.dirY * agent.lat;
  agent.state.y = samp.y - samp.dirX * agent.lat;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    if (agent.latRate !== 0 && agent.lat !== agent.latTarget && agent.speed > 0.1) {
      // Mid-glide: publish the true velocity direction (path motion + the
      // sideways glide) so the rig visually noses into the lane change.
      const vx = samp.dirX * agent.speed + samp.dirY * agent.latRate;
      const vy = samp.dirY * agent.speed - samp.dirX * agent.latRate;
      const inv = 1 / Math.hypot(vx, vy);
      agent.state.dirX = vx * inv;
      agent.state.dirY = vy * inv;
    } else {
      agent.state.dirX = samp.dirX;
      agent.state.dirY = samp.dirY;
    }
  }
  agent.state.speedMps = agent.speed;
  const view = agent.view;
  view.x = agent.state.x;
  view.y = agent.state.y;
  view.dirX = agent.state.dirX;
  view.dirY = agent.state.dirY;
  view.speedMps = agent.speed;
  view.s = agent.s;
  view.finished = agent.finished;
}

function setPedOnRoad(
  agent: StagedPedestrianAgent,
  on: boolean,
  crossingCounts: Map<string, number>,
): void {
  const crossingId = agent.spec.crossingId;
  if (agent.onRoad === on || !crossingId) {
    agent.onRoad = on;
    agent.state.onCrossing = on && !!crossingId;
    return;
  }
  agent.onRoad = on;
  agent.state.onCrossing = on;
  const count = crossingCounts.get(crossingId) ?? 0;
  crossingCounts.set(crossingId, Math.max(0, count + (on ? 1 : -1)));
}

export function updateStagedPedestrian(
  agent: StagedPedestrianAgent,
  dt: number,
  env: StagedEnv,
): void {
  if (!agent.walking || agent.finished) {
    agent.state.speedMps = 0;
    agent.view.speedMps = 0;
    return;
  }
  const speed = agent.spec.speedMps;
  agent.s += speed * dt;
  agent.state.walkPhase += speed * dt * 2.4;
  if (agent.s >= agent.path.length) {
    agent.s = agent.path.length;
    agent.finished = true;
    agent.walking = false;
  }

  const roadFrom = agent.spec.roadFromM ?? Infinity;
  const roadTo = agent.spec.roadToM ?? -Infinity;
  setPedOnRoad(agent, agent.s >= roadFrom && agent.s <= roadTo, env.crossingCounts);

  publishPedestrian(agent, agent.finished ? 0 : speed);
}

function publishPedestrian(agent: StagedPedestrianAgent, speed: number): void {
  sampleLane(agent.path, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = speed;
  const view = agent.view;
  view.x = agent.state.x;
  view.y = agent.state.y;
  view.dirX = agent.state.dirX;
  view.dirY = agent.state.dirY;
  view.speedMps = speed;
  view.s = agent.s;
  view.finished = agent.finished;
}
