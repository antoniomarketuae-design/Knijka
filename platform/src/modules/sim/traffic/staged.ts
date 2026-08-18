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
import { vehicleHalfLengthM } from "./types";
import type {
  StagedCommand,
  StagedPedestrianSpec,
  StagedVehicleSpec,
  TrafficPedestrianState,
  TrafficVehicleState,
  VehicleIndicator,
} from "./types";

const DEFAULT_ACCEL_MPS2 = 2.6;
const DEFAULT_DECEL_MPS2 = 4.5;
const DEFAULT_SLAM_DECEL_MPS2 = 7.5;
const HOLD_DECEL_MPS2 = 8;
/** A commanded target at/below this is „stand still", not „crawl" (B40 — the
 *  standing-hold brake lamps at the bottom of `stepStagedVehicle`). */
const HOLD_LIT_TARGET_MPS = 0.05;
/** …and the actor counts as stopped at/below this. Matches the ambient
 *  fleet's own `speed < 0.5` stopped bar in vehicles.ts, so the scripted and
 *  the background car light up at the same moment. */
const HOLD_LIT_SPEED_MPS = 0.5;
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
/**
 * FR-B5-EXIT (sweep161, 2026-08-18) — HOW FAR A RETIRING ACTOR DRIVES AWAY.
 *
 * A non-looping actor that ran out of path used to stop on the last metre of
 * it and stand there for the rest of the lesson. Doc 87 FR-B5-VAN named that
 * exact sentence as the defect ("a staged vehicle that runs out of path stops
 * on the last metre of it and never moves again (staged.ts `finished`)") and
 * then repaired it by lengthening ONE template's path. Every path is finite,
 * so the mechanism simply moved: measured on the sweep's own runs, at level 1,
 * with each scenario's compiled ambient count and a 210 s lesson —
 *
 *   sc-ln-decisive-change  `sc-lndc-target` at rest (4.06, 400.00) from
 *                          t ≈ 25 s → 185 s of a 210 s lesson with the LEFT
 *                          lane the briefing is about empty to the horizon;
 *   sc-merge-accel-lane    `sc-mrg-mainline` at rest (−8.13, 960.00) from
 *                          t ≈ 40 s → 170 s of empty motorway;
 *   sc-jx-giveway-b1       `sc-jxgb-conflict` at rest (−120.00, 154.06) — the
 *                          last metre of its path, in a live boulevard lane —
 *                          with ambient #2 dammed 6.2 m behind it and #0
 *                          12.5 m behind that.
 *
 * That last one is the whole finding. Driving the drill correctly and holding
 * at the Б1 line, EVERY body in the world covered **0.0 m** over t = 150…210 s.
 * The control settles it: with the staged actors not staged, the same two
 * ambient cars covered 562.7 m and 560.1 m over the same 60 s. The priority
 * stream the lesson asks the student to wait for never clears because the
 * lesson's own actor is parked across it.
 *
 * So a car that reaches the end of its path LEAVES, the way real traffic does,
 * instead of becoming scenery in a live lane. 70 m because the ambient fleet's
 * own corridor is `cfg.lookaheadM` 60 m (types.ts) plus a body length and a
 * margin — past this an ambient agent no longer sees the actor at all, which
 * is the property that has to hold, not the number.
 */
const EXIT_CLEAR_M = 70;
/**
 * …and the retirement run is driven at the speed the actor arrived with, so it
 * simply keeps going. The floor only covers an actor that crawls over its own
 * finish line: without it a car arriving at 0.2 m/s would take 350 s to clear
 * and would still be an obstacle for the whole lesson — the defect again,
 * slower. 4 m/s is a walking-pace pull-away, not a lurch.
 */
const EXIT_MIN_SPEED_MPS = 4;
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

/**
 * Explicit polyline path for a staged VEHICLE that rides an authored line
 * OUTSIDE the road graph (the RX „жп прелез" train on its perpendicular rail).
 * Identical geometry to buildStagedPedPath, but every vertex's arc is exposed
 * as a `nodeS` entry so `hold.nodeIndex`/`offsetM` index the polyline exactly
 * like a lane-graph path (createStagedVehicle reads path.nodeS[nodeIndex]).
 */
export function buildStagedVehiclePolylinePath(
  path: ReadonlyArray<{ x: number; y: number }>,
): StagedPath | null {
  const base = buildStagedPedPath(path);
  if (!base) return null;
  return { ...base, nodeS: Array.from(base.cum) };
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
  indicator: VehicleIndicator;
  lateralOffsetM: number;
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
  /** Commanded turn indicator (ledger L6) — published, never inferred. */
  indicator: VehicleIndicator;
  /** FR-B5-EXIT: metres driven PAST the end of the path while retiring. 0 for
   *  every actor that never reaches its end — byte-identical publishing. */
  exitM: number;
  /** Speed of the retirement run, m/s (0 = not retiring; set once, at the
   *  frame the actor runs out of path, so the run is a constant coast). */
  exitSpeed: number;
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
  /**
   * The AMBIENT agents' published states — the other half of FR-27's honesty
   * fix. The header's v1 limitation ("ambient agents do not see staged
   * actors") cut both ways: a scripted actor also drove straight through an
   * ambient car. Measured on 2026-08-02 with 4 ambient agents on the
   * junction/signals/following districts: five templates put an ambient car
   * and a staged actor within **0.02–0.05 m of centres** — two bodies in the
   * same place. Not a theory; a photograph waiting to happen.
   *
   * Empty array = the pre-change behaviour, bit-identical.
   */
  ambient: readonly TrafficVehicleState[];
}

const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

function clampArc(path: StagedPath, s: number): number {
  return s < 0 ? 0 : s > path.length ? path.length : s;
}

/**
 * Would advancing `step` m along the published heading put this actor inside
 * an ambient body it is not already inside? The FR-B5-FREEZE rule, factored so
 * the on-path advance and the FR-B5-EXIT retirement run answer to one clamp:
 * refuse only a CLOSING step, because a step that grows the separation cannot
 * create an overlap the previous pose did not already have.
 */
function closesOnAmbient(agent: StagedVehicleAgent, env: StagedEnv, step: number): boolean {
  const nx = agent.state.x + agent.state.dirX * step;
  const ny = agent.state.y + agent.state.dirY * step;
  for (let i = 0; i < env.ambient.length; i++) {
    const a = env.ambient[i];
    if (a === agent.state) continue;
    const sep = vehicleHalfLengthM(agent.spec.profile) + vehicleHalfLengthM(a.profile) + 0.5;
    const dAfter = Math.hypot(a.x - nx, a.y - ny);
    if (dAfter >= sep) continue;
    const dBefore = Math.hypot(a.x - agent.state.x, a.y - agent.state.y);
    if (dAfter >= dBefore) continue; // moving away — never a reason to freeze
    return true;
  }
  return false;
}

/**
 * …AND THE SAME QUESTION ABOUT THE PLAYER — 2026-08-18, the gate pass.
 *
 * `closesOnAmbient` was factored out so „the on-path advance and the
 * FR-B5-EXIT retirement run answer to one clamp". Only HALF of the on-path
 * promise was carried over: step 2 above is the PLAYER guard, and it works by
 * lowering `target`, which the retirement branch does not read — it drives on
 * `exitSpeed`, fixed at the frame the path ran out. So a retiring actor was
 * held off every ambient body in the world and off nothing else.
 *
 * MEASURED with the player standing 20 m past the end of the path,
 * `playerGuard` defaulted: closest approach to the PLAYER 0.000 m at 10.0 m/s,
 * against 4.667 m for an ambient body in the identical geometry — and on the
 * pre-FR-B5-EXIT build the actor came to rest 20 m short of him. That is a
 * correct student, stopped where the drill asked him to stop, driven into from
 * behind and billed COLLISION −10 опасна by a car whose only remaining job is
 * to leave the scene. „A staged actor that runs out of path parks in a live
 * lane" is the defect FR-B5-EXIT exists to end; ending it by driving THROUGH
 * the student is not an improvement, it is the same lane's worse twin.
 *
 * Same shape as the ambient clamp — refuse only a CLOSING step, so an actor
 * that is already inside the standoff can still drive out of it — and the same
 * standoff the on-path guard aims for (`GUARD_STOP_SHORT_M`, from the player's
 * centre). Gated on `spec.playerGuard` exactly as step 2 is, so the handful of
 * actors authored to ignore the player (the staged collisions) keep ignoring
 * him here too.
 */
function closesOnPlayer(agent: StagedVehicleAgent, env: StagedEnv, step: number): boolean {
  if (!env.hasPlayer || (agent.spec.playerGuard ?? true) === false) return false;
  const nx = agent.state.x + agent.state.dirX * step;
  const ny = agent.state.y + agent.state.dirY * step;
  const dAfter = Math.hypot(env.playerX - nx, env.playerY - ny);
  if (dAfter >= GUARD_STOP_SHORT_M) return false;
  const dBefore = Math.hypot(env.playerX - agent.state.x, env.playerY - agent.state.y);
  return dAfter < dBefore;
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
      // L6: every staged VEHICLE carries the indicator channel from birth, so
      // the renderer never has to guess. Ambient agents still publish no key.
      indicator: "off",
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
      indicator: "off",
      lateralOffsetM: 0,
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
    indicator: "off",
    exitM: 0,
    exitSpeed: 0,
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
      // Pedestrians have no indicator / lateral channel — the view fields
      // exist only so one MutableView shape backs both actor kinds.
      indicator: "off",
      lateralOffsetM: 0,
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
        // FR-56 rolling start: the actor enters the mirror ALREADY TRAVELLING
        // rather than launching from the kerb. Never slows an actor that is
        // already faster, and never exceeds the command's own cap.
        if (command.seedSpeedMps !== undefined) {
          const seed = Math.min(command.seedSpeedMps, command.maxSpeedMps);
          if (v.speed < seed) v.speed = seed;
        }
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
      case "setIndicator":
        // L6: an explicit, commanded lamp. Published immediately (not on the
        // next integration step) so «мигачът светна» is true from this frame —
        // the ≥ 3 s lead the runners assert is measured from here.
        v.indicator = command.indicator;
        v.state.indicator = command.indicator;
        v.view.indicator = command.indicator;
        break;
      case "reset":
        v.command.type = "hold";
        v.s = v.holdS;
        v.speed = 0;
        v.segHint = 0;
        v.finished = false;
        v.lat = 0;
        v.latTarget = 0;
        v.latRate = 0;
        v.indicator = "off";
        v.exitM = 0;
        v.exitSpeed = 0;
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
      break; // matchPlayer / brake / laneShift / setIndicator are vehicle-only
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

  // 2b) AMBIENT guard — never drive through an ambient car either (FR-27).
  //      Deliberately NOT gated on `spec.playerGuard`: that flag exists so the
  //      лепка can hold a sub-6 m pose behind the STUDENT, and nothing is ever
  //      authored to tailgate a boulevard car. Same corridor as the player
  //      guard, but a same-direction ambient car is a LEADER, not a wall — the
  //      gap term is added to its speed, so a staged actor keeps its pace
  //      behind traffic moving at its own speed and only ever loses time to a
  //      car genuinely slower than the script.
  if (cmd.type !== "brake" && env.ambient.length > 0) {
    for (let i = 0; i < env.ambient.length; i++) {
      const a = env.ambient[i];
      if (a === agent.state) continue;
      const relX = a.x - agent.state.x;
      const relY = a.y - agent.state.y;
      const along = relX * agent.state.dirX + relY * agent.state.dirY;
      if (along <= 0 || along >= GUARD_AHEAD_M) continue;
      const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
      if (lateral >= GUARD_LATERAL_M) continue;
      const aligned = a.dirX * agent.state.dirX + a.dirY * agent.state.dirY > 0.7;
      const lead = aligned ? a.speedMps : 0;
      const guardTarget = lead + Math.max(0, (along - GUARD_STOP_SHORT_M) * 0.8);
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
  const sBefore = agent.s;
  agent.s += agent.speed * dt;

  // 3b) Hard anti-overlap vs ambient cars, from ANY angle. The corridor guard
  //     in 2b handles same-lane following; it cannot see a car crossing the
  //     junction box at 90°, which is exactly where the measurement found the
  //     remaining clips. The arc advance is simply refused when it would put
  //     two bodies inside each other: the previous pose was clear by
  //     induction, so rolling back to it is always safe.
  //
  //     FR-B5-FREEZE (doc 87, 2026-08-05): …but ONLY when the step CLOSES on
  //     that body. Measured from any angle this also caught a car BEHIND the
  //     actor, and the ambient side of the same clamp (vehicles.ts) caught the
  //     actor behind IT — so two bodies 3 m apart froze each other for good.
  //     On `jxg-giveway-v1` that pair came to rest ON the second junction's
  //     node, in the student's own lane, and the correctly-driven drill ended
  //     in a 10-point collision with it. Refusing only a CLOSING step keeps the
  //     „never clip" guarantee exactly (a step that grows the separation cannot
  //     create an overlap) and lets a boxed-in actor drive out.
  if (env.ambient.length > 0 && agent.s > sBefore) {
    if (closesOnAmbient(agent, env, agent.s - sBefore)) {
      agent.s = sBefore;
      agent.speed = 0;
    }
  }

  // 4) Path end / loop wrap / retirement run.
  if (spec.loop) {
    if (agent.s >= agent.path.length) {
      agent.s -= agent.path.length;
      agent.segHint = 0;
    }
  } else if (agent.s >= agent.path.length) {
    // FR-B5-EXIT (see EXIT_CLEAR_M): the actor has run out of road, so it
    // DRIVES AWAY instead of parking on the last metre of a live lane.
    //
    // `finished` still latches on exactly the frame it used to, and `agent.s`
    // stays pinned to `path.length` — every runner that reads `actor.finished`
    // or `actor.s` sees the identical number on the identical frame. What
    // changes is only where the BODY is: it keeps going in its final direction
    // until it is EXIT_CLEAR_M past the end, then comes to rest off-scene.
    agent.s = agent.path.length;
    if (!agent.finished) {
      agent.finished = true;
      agent.exitSpeed = Math.max(agent.speed, EXIT_MIN_SPEED_MPS);
    }
    if (agent.exitM < EXIT_CLEAR_M) {
      // The retirement run is held to the SAME promise as the on-path advance
      // above — it is still a body moving through a world with other bodies in
      // it, and „never clip" does not lapse because the path did. BOTH halves
      // of that promise: the ambient fleet (step 2b) and the player (step 2).
      // See `closesOnPlayer` for what the missing half measured.
      const step = Math.min(agent.exitSpeed * dt, EXIT_CLEAR_M - agent.exitM);
      if (
        (env.ambient.length > 0 && closesOnAmbient(agent, env, step)) ||
        closesOnPlayer(agent, env, step)
      ) {
        agent.speed = 0;
      } else {
        agent.exitM += step;
        agent.speed = agent.exitM >= EXIT_CLEAR_M ? 0 : agent.exitSpeed;
      }
    } else {
      agent.speed = 0;
    }
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

  // Brake lights: an active slam, actively slowing toward a lower target —
  // or STANDING STILL ON A COMMANDED HOLD.
  //
  // That last clause is doc 87 B40, and it is a legibility defect, not a
  // cosmetic one. A staged actor asked to wait — the car pinned short of a
  // junction box, the колона standing at the end of the street, the
  // регулировчик drill's queue, and above all `sc-shes-sleeper`, the car
  // asleep on green that the whole lesson «Спане на зелено» is about — sat
  // there with UNLIT tail lamps, because `speed > target + 0.3` is false when
  // both are zero. Measured from the seat at the pose the lesson's own card
  // points at (y = −33.1, 57 m out), the sleeper was „a ~30 px dark shape
  // among other stationary vehicles" and the student could not tell it was
  // facing him, let alone that it was standing on a line.
  //
  // Two lit lamps is what a driver actually reads a stopped car by, and it is
  // the truth: a car held at a stop line has its foot on the brake. The
  // AMBIENT fleet already does exactly this (`vehicles.ts` — `term > 0.8 &&
  // speed < 0.5`), so this also ends a split where the scripted car and the
  // background car behaved differently while doing the same thing.
  //
  // `finished` is excluded on purpose: an actor that has run out of path is
  // parked, not waiting, and a parked car with its brake lights on is a lie
  // in the other direction.
  //
  // FR-B5-EXIT adds one more exclusion, for the same reason in the same
  // direction: an actor on its retirement run is DRIVING AWAY at a constant
  // coast while `target` is 0 (a finished cruise targets 0), so the middle
  // clause would light both lamps on a car that is accelerating out of the
  // scene. Lit brake lights on a departing car is the same lie as unlit ones
  // on a waiting one.
  const retiring = agent.finished && agent.exitM < EXIT_CLEAR_M && agent.speed > 0;
  const holding = target <= HOLD_LIT_TARGET_MPS && agent.speed <= HOLD_LIT_SPEED_MPS;
  agent.state.braking =
    !retiring &&
    (cmd.type === "brake" || agent.speed > target + 0.3 || (holding && !agent.finished));

  publishVehicle(agent);
}

function publishVehicle(agent: StagedVehicleAgent): void {
  sampleLane(agent.path, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  // Lateral channel: offset the published pose to the RIGHT of travel
  // (right normal of (dx, dy) is (dy, -dx) — the offsetPolyline convention).
  // lat = 0 for every actor never laneShift-ed → byte-identical publishing.
  //
  // FR-B5-EXIT: …and the retirement run rides straight on past the end of the
  // polyline along its final direction. exitM = 0 for every actor that never
  // reaches its end, so this term likewise changes nothing for them.
  agent.state.x = samp.x + samp.dirY * agent.lat + samp.dirX * agent.exitM;
  agent.state.y = samp.y - samp.dirX * agent.lat + samp.dirY * agent.exitM;
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
  agent.state.indicator = agent.indicator;
  const view = agent.view;
  view.x = agent.state.x;
  view.y = agent.state.y;
  view.dirX = agent.state.dirX;
  view.dirY = agent.state.dirY;
  view.speedMps = agent.speed;
  view.s = agent.s;
  view.finished = agent.finished;
  view.indicator = agent.indicator;
  view.lateralOffsetM = agent.lat;
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
