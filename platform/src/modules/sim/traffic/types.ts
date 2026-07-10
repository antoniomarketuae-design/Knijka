/**
 * sim/traffic — public types.
 *
 * Scripted, deterministic ambient traffic: vehicle agents that follow
 * precomputed loops through the district road graph, and pedestrians that
 * walk sidewalk loops and use crossings. NOT a traffic AI — no planning, no
 * personalities, no lane changes (v1 scope: docs/simulation/15).
 *
 * All positions are district space (x = east, y = north, meters) — the same
 * frame as district-v1.json and `VehicleSample` in ../contracts. The
 * presentation layer maps (x, y) -> three.js (x, -z), y-up.
 */

import { PERCEPTUAL_ROAD_SCALE, type SignalPhase } from "../contracts";

// ---------------------------------------------------------------------------
// District input — structural subset of content/world/district-v1.json.
// The traffic system takes the parsed JSON; these types name only the fields
// it reads, so the real file and small test fixtures both satisfy them.
// ---------------------------------------------------------------------------

export interface DistrictNode {
  id: string;
  x: number;
  y: number;
}

export interface DistrictEdge {
  id: string;
  from: string;
  to: string;
  class: string;
  oneway: boolean;
  roundabout: boolean;
  lanes: number;
  maxspeed: number;
  length: number;
  /** Polyline [x, y][] from `from` to `to`, endpoints matching the nodes. */
  geometry: number[][];
}

export interface DistrictIntersection {
  id: string;
  x: number;
  y: number;
  degree: number;
  signalized: boolean;
}

export interface DistrictCrossing {
  id: string;
  x: number;
  y: number;
  kind: string;
  signalized: boolean;
  edgeId: string;
}

/** The slice of district-v1.json the traffic system consumes. */
export interface TrafficDistrict {
  roads: { nodes: DistrictNode[]; edges: DistrictEdge[] };
  intersections: DistrictIntersection[];
  crossings: DistrictCrossing[];
}

// ---------------------------------------------------------------------------
// Agent state — read every frame by the presentation layer. The objects are
// allocated once at init and mutated in place (perf budget: zero per-frame
// allocations in the update path).
// ---------------------------------------------------------------------------

export interface TrafficVehicleState {
  id: number;
  /** Rear-to-front center of the car, district space. */
  x: number;
  y: number;
  /** Unit travel direction, district space. */
  dirX: number;
  dirY: number;
  speedMps: number;
  /** True while decelerating or held at a stop — drives brake lights. */
  braking: boolean;
  /** Body color variant index (presentation palette). */
  colorIndex: number;
}

export interface TrafficPedestrianState {
  id: number;
  x: number;
  y: number;
  /** Unit facing direction, district space. */
  dirX: number;
  dirY: number;
  speedMps: number;
  /** Accumulated walk-cycle phase (radians) for the bob animation. */
  walkPhase: number;
  /** True while the pedestrian is on the roadway span of a crossing. */
  onCrossing: boolean;
  colorIndex: number;
}

// ---------------------------------------------------------------------------
// Update context — what the integrator feeds the system each frame.
// ---------------------------------------------------------------------------

/** Same signature as WorldRuntime.signalPhase (../contracts). */
export type SignalPhaseFn = (signalNodeId: string) => SignalPhase;

export interface TrafficUpdateContext {
  /**
   * Phase lookup for signal node ids. The traffic system queries it with
   * signalized intersection node ids from district `intersections[]`
   * (vehicles) and with the signal node mapped to a signalized crossing
   * (pedestrians). Unknown ids should return a sane default ("green" keeps
   * traffic flowing; "red" holds it).
   */
  signalPhase: SignalPhaseFn;
  /** Player vehicle position, district space. null = no player in world. */
  playerPos: { x: number; y: number } | null;
  /** Player speed; used by pedestrian gap logic. Missing = assume moving. */
  playerSpeedKmh?: number;
  /** Player heading (0 = north, cw). Lets agents follow a moving player. */
  playerHeadingDeg?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TrafficConfig {
  /** Master seed — same seed + same dt sequence = identical playback. */
  seed: number;
  vehicleCount: number;
  pedestrianCount: number;
  laneWidthM: number;
  /** Road classes vehicle routes never use (parking aisles look wrong). */
  excludedRoadClasses: string[];
  /** Concentrate traffic near this district point (usually the player spawn)
   *  so agents are visible where the driver actually is. Omit to scatter
   *  routes across the whole district (legacy behaviour). */
  anchor?: { x: number; y: number };
  /** Seed routes + pedestrians within this radius of `anchor`, meters. */
  anchorRadiusM?: number;

  // Vehicle behavior (IDM-lite)
  /** Gentle acceleration, m/s^2. */
  accelMps2: number;
  /** Comfortable deceleration, m/s^2. */
  comfortDecelMps2: number;
  /** Emergency deceleration cap, m/s^2. */
  hardDecelMps2: number;
  /** Standstill gap to the obstacle ahead, meters. */
  minGapM: number;
  /** Desired time headway to the leader, seconds. */
  headwaySec: number;
  /** Absolute speed cap regardless of edge maxspeed, m/s. */
  maxSpeedMps: number;
  /** Stop-line distance before a signalized node center, meters. FLOOR —
   *  raised per junction to the drawn junction mouth (vehicles.ts). */
  signalStopOffsetM: number;
  /** Stop distance before an occupied pedestrian crossing, meters. */
  crossingStopOffsetM: number;
  /** Lookahead horizon for stop constraints, meters. */
  lookaheadM: number;
  /** Lateral half-width for treating the player as in-lane, meters. */
  playerLateralM: number;

  // Pedestrians
  pedSpeedMps: number;
  /** Wait at the curb before checking the crossing gate: base + jitter. */
  pedWaitMinSec: number;
  pedWaitMaxSec: number;
  /** Unsignalized gate: min time-to-arrival of any vehicle, seconds. */
  pedGapSec: number;
  /** Unsignalized gate: keep-out radius around a moving player, meters. */
  pedPlayerGapM: number;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = {
  seed: 1,
  vehicleCount: 10,
  pedestrianCount: 8,
  // MUST match the world/runtime lane width (3.25 m × perceptual road scale)
  // or NPC lane centers drift off the painted lanes.
  laneWidthM: 3.25 * PERCEPTUAL_ROAD_SCALE,
  excludedRoadClasses: ["service"],

  accelMps2: 1.8,
  comfortDecelMps2: 2.2,
  hardDecelMps2: 5.5,
  minGapM: 2.0,
  headwaySec: 1.4,
  maxSpeedMps: 50 / 3.6,
  // Stop-offset FLOORS — vehicles.ts raises both to the junction mouth
  // (nodeOpenRadiusM) per node so NPCs never halt inside the scaled junction.
  signalStopOffsetM: 18,
  crossingStopOffsetM: 8,
  lookaheadM: 60,
  // Half the scaled lane (~4.1 m) + car half-width: a player anywhere in the
  // NPC's lane must register, an adjacent-lane car (8.1 m off) must not.
  playerLateralM: 5.0,

  pedSpeedMps: 1.25,
  pedWaitMinSec: 1.0,
  pedWaitMaxSec: 2.0,
  pedGapSec: 3.0,
  pedPlayerGapM: 22,
};

// ---------------------------------------------------------------------------
// Staged actors (A8 scenario orchestrator) — the NARROW imperative seam.
//
// A staged actor is a scripted agent the orchestrator deploys for ONE
// deterministic encounter: it follows a fixed path (resolved from the lane
// graph for vehicles, an explicit polyline for pedestrians), holds a dormant
// pose until commanded, and executes exactly one behavior command at a time.
// Staged actors publish into the same `vehicles` / `pedestrians` state arrays
// (and crossing occupancy) as ambient agents, so the presentation layer and
// every existing rule-engine query (leadGapMeters, conflictFromRight,
// circulatingConflict, pedestrianOnCrossing, …) see them with zero new
// grading plumbing.
//
// Honest v1 limitations (doc 68 A8):
//  - Staged actors are INVISIBLE to ambient agents (ambient car-following
//    only scans route lanes), so an ambient car may overlap a staged one.
//  - There is no cyclist actor type (audit C3): a "cyclist" is a narrow
//    scripted vehicle-agent rendered with the car fleet.
//  - Scripted actors obey only their script — signals/reservations are the
//    orchestrator's responsibility via timing, not simulated compliance.
// ---------------------------------------------------------------------------

export interface StagedVehicleSpec {
  kind: "vehicle";
  /** Orchestrator handle — unique per session. */
  id: string;
  /**
   * District node ids the actor drives through, in order. Every consecutive
   * pair must be connected by a directed lane in the road graph (same lanes
   * ambient traffic drives), or stage() returns null.
   */
  pathNodes: string[];
  /** Dormant hold pose: arc of pathNodes[nodeIndex] + offsetM (may be
   *  negative = before the node) along the resolved path. */
  hold: { nodeIndex: number; offsetM: number };
  /** Default target speed for `cruise` commands, m/s. */
  cruiseSpeedMps: number;
  /** Acceleration toward a higher target, m/s² (default 2.6). */
  accelMps2?: number;
  /** Deceleration toward a lower target, m/s² (default 4.5). */
  decelMps2?: number;
  /** Extra rightward offset from the lane center, m — cyclists ride the curb. */
  extraRightOffsetM?: number;
  /** Loop the path (roundabout circulation) instead of finishing at its end. */
  loop?: boolean;
  /** Presentation palette index. */
  colorIndex?: number;
  /**
   * Emergency-brake when the player is directly ahead in the path corridor
   * (default true) — a staged actor must never ram the player from behind;
   * the PLAYER driving into a staged actor stays possible (that consequence
   * is the point). An active `brake` command overrides the guard.
   */
  playerGuard?: boolean;
}

export interface StagedPedestrianSpec {
  kind: "pedestrian";
  id: string;
  /** Explicit district-space polyline (e.g. curb -> across the road -> out). */
  path: ReadonlyArray<{ x: number; y: number }>;
  /** Walk speed once released, m/s (a dart-out runs at ~2.9). */
  speedMps: number;
  /** Crossing whose occupancy this actor drives while on the roadway span. */
  crossingId?: string;
  /** Roadway span along the path (arc range counting as on-crossing), m. */
  roadFromM?: number;
  roadToM?: number;
  colorIndex?: number;
}

export type StagedActorSpec = StagedVehicleSpec | StagedPedestrianSpec;

/** One behavior at a time — the orchestrator re-commands as the scene evolves. */
export type StagedCommand =
  /** Freeze (brake to 0, stand still). Pedestrians stop walking. */
  | { type: "hold" }
  /** Follow the path at `speedMps` (default: spec cruise speed). Releases a
   *  dormant pedestrian into its walk. */
  | { type: "cruise"; speedMps?: number }
  /** Vehicles only: regulate speed to hold `gapM` meters ahead of the player
   *  (projected onto the actor's path). */
  | { type: "matchPlayer"; gapM: number; maxSpeedMps: number }
  /** Vehicles only: brake-slam at `decelMps2` (default 7.5) to a stop; holds
   *  the stop and suppresses the player guard (already braking). */
  | { type: "brake"; decelMps2?: number }
  /** Teleport back to the dormant hold pose (re-stage on retry). */
  | { type: "reset" };

/** Live read-only view of a staged actor (object identity stable per actor). */
export interface StagedActorView {
  readonly id: string;
  readonly kind: "vehicle" | "pedestrian";
  /** District-space pose — mirrors the published agent state. */
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly speedMps: number;
  /** Arc position along the resolved path, m. */
  readonly s: number;
  readonly pathLengthM: number;
  /** Arc position of each spec pathNode along the resolved path (vehicles;
   *  empty for pedestrians) — the orchestrator's timing reference. */
  readonly nodeS: readonly number[];
  /** True once a non-loop path is fully traversed (actor parked at its end). */
  readonly finished: boolean;
}

// ---------------------------------------------------------------------------
// System handle
// ---------------------------------------------------------------------------

export interface TrafficSystemStats {
  vehicleCount: number;
  pedestrianCount: number;
  routeCount: number;
  laneCount: number;
}

export interface TrafficSystem {
  /**
   * Advance all agents. Call ONCE per render frame, after WorldRuntime.update
   * (signals must be fresh) and before sampling/rendering. dt is clamped to
   * 100 ms internally.
   */
  update(dtSec: number, ctx: TrafficUpdateContext): void;
  readonly vehicles: readonly TrafficVehicleState[];
  readonly pedestrians: readonly TrafficPedestrianState[];
  /**
   * True while any pedestrian is on the roadway span of the crossing.
   * Wire into the runtime: `runtime.setPedestrianQuery(id => traffic.pedestrianOnCrossing(id))`
   * so SimTick crossing events carry real pedestrian state.
   */
  pedestrianOnCrossing(crossingId: string): boolean;
  /**
   * Gap in meters (bumper-to-bumper approx) to the nearest vehicle ahead of the
   * player within a lane-width corridor, or Infinity when the road ahead is
   * clear. Player pose in district space; headingDeg 0 = north, clockwise.
   */
  leadGapMeters(px: number, py: number, headingDeg: number): number;
  /**
   * True when a moving vehicle is within `radiusM` of (x,y) on a CONFLICTING
   * path — i.e. crossing/oncoming relative to `approachBearingDeg` (your
   * approach direction), not same-direction traffic. Used to grade failing to
   * give way at a junction. District space; bearings 0 = north, clockwise.
   */
  conflictNear(x: number, y: number, radiusM: number, approachBearingDeg: number): boolean;
  /**
   * True when a moving vehicle is AHEAD of the player within `radiusM` and
   * heading roughly toward them (oncoming) — used to grade turning left across
   * oncoming traffic. District space; headingDeg 0 = north, clockwise.
   */
  oncomingNear(px: number, py: number, headingDeg: number, radiusM: number): boolean;
  /**
   * True when a moving vehicle near the junction (jx,jy) is on the player's
   * RIGHT and not travelling the player's own direction — used to grade the
   * give-way-to-the-right rule at uncontrolled junctions. District space.
   */
  conflictFromRight(
    jx: number,
    jy: number,
    px: number,
    py: number,
    headingDeg: number,
    radiusM: number,
  ): boolean;
  /**
   * True when a moving vehicle already circulating a roundabout (centre cx,cy,
   * within `bandRadiusM`) is on the player's LEFT — the driver must give way
   * before entering. District space; headingDeg 0 = north, clockwise.
   */
  circulatingConflict(
    cx: number,
    cy: number,
    px: number,
    py: number,
    headingDeg: number,
    bandRadiusM: number,
  ): boolean;
  /**
   * Deploy a scripted actor, dormant at its hold pose (A8). MUST be called
   * before the presentation layer mounts — TrafficLayer sizes its instanced
   * buffers from the agent arrays at mount. Returns null when the spec cannot
   * resolve (unknown/unconnected path nodes, duplicate id, degenerate path).
   */
  stage(spec: StagedActorSpec): StagedActorView | null;
  /** Command a staged actor (no-op for unknown ids). Takes effect on the next
   *  update() — one frame of latency, invisible at 60 Hz. */
  stagedCommand(id: string, command: StagedCommand): void;
  /** Live view of a staged actor, or null. */
  staged(id: string): StagedActorView | null;
  readonly timeSec: number;
  readonly stats: TrafficSystemStats;
}
