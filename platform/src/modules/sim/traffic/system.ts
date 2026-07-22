/**
 * TrafficSystem — owns all agents and advances them in ONE per-frame update.
 *
 * Update order inside a frame: pedestrians first (vehicles then react to
 * fresh crossing occupancy), then vehicles in fixed index order. Pedestrian
 * gap checks read vehicle poses from the previous frame — one frame of
 * staleness is invisible at 60 Hz and keeps the pass order simple.
 *
 * Determinism: (seed, district, config, dt sequence) fully determine the
 * playback. All randomness is drawn at init or from per-agent streams; the
 * update path allocates nothing and iterates in fixed order.
 */

import { buildLaneGraph, type LaneGraph } from "./graph";
import {
  buildPedRoute,
  createPedestrianAgent,
  updatePedestrian,
  type PedestrianAgent,
  type PedestrianEnv,
} from "./pedestrians";
import { mulberry32, rngRange } from "./rng";
import { buildRoutes, DEFAULT_ROUTE_OPTIONS, type TrafficRoute } from "./routes";
import {
  applyStagedCommand,
  buildStagedPedPath,
  buildStagedVehiclePolylinePath,
  createStagedPedestrian,
  createStagedVehicle,
  resolveStagedVehiclePath,
  STAGED_STATE_ID_BASE,
  updateStagedPedestrian,
  updateStagedVehicle,
  type StagedEnv,
  type StagedPedestrianAgent,
  type StagedVehicleAgent,
} from "./staged";
import {
  createVehicleAgent,
  updateVehicle,
  type NodeReservation,
  type VehicleAgent,
  type VehicleEnv,
} from "./vehicles";
import {
  DEFAULT_TRAFFIC_CONFIG,
  type CyclistApproach,
  type OncomingApproach,
  type StagedActorSpec,
  type StagedActorView,
  type StagedCommand,
  type TrafficConfig,
  type TrafficDistrict,
  type TrafficPedestrianState,
  type TrafficSystem,
  type TrafficSystemStats,
  type TrafficUpdateContext,
  type TrafficVehicleState,
} from "./types";

const MAX_DT_SEC = 0.1;
const VEHICLE_COLOR_VARIANTS = 4;
const PED_COLOR_VARIANTS = 4;
/** A vehicle counts as "ahead in my path" within this lateral corridor, meters.
 * ~Half the scaled lane: same-lane leaders register even off-center, while an
 * adjacent-lane car (one lane ≈ 8.1 m over) never does (perceptual scale). */
const LEAD_CORRIDOR_M = 4.0;
/** Approx sum of the two half-lengths, for a bumper-to-bumper gap, meters. */
const VEHICLE_LENGTH_M = 4.1;
/** Below this speed a vehicle is stopped/parked and makes no priority claim, m/s. */
const CONFLICT_MIN_SPEED_MPS = 1;
/** Heading within this of your approach = same-direction traffic (not a conflict), deg. */
const CONFLICT_SAME_DIR_DEG = 50;
/** A vehicle heading more than this off yours (and ahead) counts as oncoming, deg. */
const ONCOMING_MIN_DEG = 130;
/** A vehicle must be at least this far to the player's right to count, meters. */
const RIGHT_MIN_M = 1.5;
/** VU-02 cyclist-pass query: a cyclist heading within this of the player's own
 * heading rides the SAME direction (the pass duty applies); anything wider is
 * crossing/oncoming — a different duty (meeting), never returned, deg. */
const CYCLIST_SAME_DIR_DEG = 60;

class TrafficSystemImpl implements TrafficSystem {
  readonly vehicles: TrafficVehicleState[] = [];
  readonly pedestrians: TrafficPedestrianState[] = [];
  readonly stats: TrafficSystemStats;
  timeSec = 0;

  private readonly graph: LaneGraph;
  private readonly routes: TrafficRoute[];
  private readonly vehicleAgents: VehicleAgent[] = [];
  private readonly pedestrianAgents: PedestrianAgent[] = [];
  private readonly crossingCounts = new Map<string, number>();
  private readonly reservations = new Map<string, NodeReservation>();
  private readonly vehicleEnv: VehicleEnv;
  private readonly pedestrianEnv: PedestrianEnv;
  // A8 staged actors — scripted, orchestrator-commanded (staged.ts).
  private readonly stagedVehicles: StagedVehicleAgent[] = [];
  private readonly stagedPeds: StagedPedestrianAgent[] = [];
  private readonly stagedById = new Map<string, StagedVehicleAgent | StagedPedestrianAgent>();
  private readonly stagedEnv: StagedEnv;
  /** A11: state ids of staged cyclist proxies (extraRightOffsetM > 0). */
  private readonly cyclistStateIds = new Set<number>();

  constructor(district: TrafficDistrict, cfg: TrafficConfig) {
    const rng = mulberry32(cfg.seed);
    this.graph = buildLaneGraph(district, {
      laneWidthM: cfg.laneWidthM,
      excludedRoadClasses: cfg.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });

    // Reservation slots for every unsignalized intersection.
    for (const ix of district.intersections) {
      if (!ix.signalized && ix.degree >= 3) {
        this.reservations.set(ix.id, { holder: -1, renewedAt: -Infinity });
      }
    }
    for (const crossing of district.crossings) {
      this.crossingCounts.set(crossing.id, 0);
    }

    // --- Vehicles: a few loops, agents spread around each loop. When an
    // anchor is set, seed loops near it (and keep them shorter) so cars stay
    // where the driver is rather than orbiting the far side of the district.
    const routeCount = Math.max(1, Math.ceil(cfg.vehicleCount / 2));
    this.routes = buildRoutes(
      this.graph,
      routeCount,
      rng,
      cfg.anchor
        ? { minWalkM: 200, maxWalkM: 480, minLoopM: 150 }
        : DEFAULT_ROUTE_OPTIONS,
      cfg.anchor
        ? { x: cfg.anchor.x, y: cfg.anchor.y, radiusM: cfg.anchorRadiusM ?? 260 }
        : undefined,
    );
    if (this.routes.length > 0) {
      const perRoute = new Map<number, number>();
      for (let i = 0; i < cfg.vehicleCount; i++) {
        perRoute.set(i % this.routes.length, (perRoute.get(i % this.routes.length) ?? 0) + 1);
      }
      const placed = new Map<number, number>();
      for (let i = 0; i < cfg.vehicleCount; i++) {
        const ri = i % this.routes.length;
        const route = this.routes[ri];
        const n = perRoute.get(ri) ?? 1;
        const k = placed.get(ri) ?? 0;
        placed.set(ri, k + 1);
        // Even spacing around the loop + a little seeded jitter.
        const loopS =
          ((route.totalLength * k) / n + rngRange(rng, 0, Math.min(15, route.totalLength / (n * 4)))) %
          route.totalLength;
        const agent = createVehicleAgent(
          i,
          route,
          loopS,
          rngRange(rng, 0.82, 1.0),
          Math.floor(rng() * VEHICLE_COLOR_VARIANTS),
        );
        this.vehicleAgents.push(agent);
        this.vehicles.push(agent.state);
      }
    }

    // --- Pedestrians: loops anchored on seeded-shuffled crossings.
    const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
    const candidates = [...district.crossings].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (cfg.anchor) {
      // Nearest crossings first so pedestrians populate around the driver.
      const ax = cfg.anchor.x;
      const ay = cfg.anchor.y;
      candidates.sort(
        (a, b) => Math.hypot(a.x - ax, a.y - ay) - Math.hypot(b.x - ax, b.y - ay),
      );
    } else {
      // Fisher-Yates with the master stream.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }
    }
    let pedId = 0;
    for (let pass = 0; pass < 2 && pedId < cfg.pedestrianCount; pass++) {
      for (const crossing of candidates) {
        if (pedId >= cfg.pedestrianCount) break;
        const edge = edgeById.get(crossing.edgeId);
        if (!edge) continue;
        const route = buildPedRoute(crossing, edge, cfg.laneWidthM, rng);
        if (!route) continue;
        const agent = createPedestrianAgent(
          pedId,
          route,
          mulberry32(cfg.seed ^ (0x9e3779b9 + pedId * 0x85ebca6b)),
          Math.floor(rng() * PED_COLOR_VARIANTS),
          cfg,
        );
        this.pedestrianAgents.push(agent);
        this.pedestrians.push(agent.state);
        pedId++;
      }
    }

    this.vehicleEnv = {
      cfg,
      graph: this.graph,
      agents: this.vehicleAgents,
      reservations: this.reservations,
      crossingCounts: this.crossingCounts,
      signalPhase: () => "green",
      timeSec: 0,
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedMps: 0,
      playerDirX: 0,
      playerDirY: 1,
    };
    this.pedestrianEnv = {
      cfg,
      graph: this.graph,
      vehicles: this.vehicleAgents,
      crossingCounts: this.crossingCounts,
      signalPhase: () => "green",
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedKmh: 0,
    };

    this.stagedEnv = {
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedMps: 0,
      crossingCounts: this.crossingCounts,
    };

    // Publish initial poses (dt = 0 moves nothing, only samples polylines).
    for (const agent of this.pedestrianAgents) updatePedestrian(agent, 0, this.pedestrianEnv);
    for (const agent of this.vehicleAgents) updateVehicle(agent, 0, this.vehicleEnv);

    this.stats = {
      vehicleCount: this.vehicleAgents.length,
      pedestrianCount: this.pedestrianAgents.length,
      routeCount: this.routes.length,
      laneCount: this.graph.lanes.length,
    };
  }

  update(dtSec: number, ctx: TrafficUpdateContext): void {
    const dt = dtSec > MAX_DT_SEC ? MAX_DT_SEC : dtSec;
    if (!(dt > 0)) return;
    this.timeSec += dt;

    const vEnv = this.vehicleEnv;
    const pEnv = this.pedestrianEnv;
    vEnv.signalPhase = ctx.signalPhase;
    pEnv.signalPhase = ctx.signalPhase;
    vEnv.timeSec = this.timeSec;
    if (ctx.playerPos) {
      vEnv.hasPlayer = true;
      pEnv.hasPlayer = true;
      vEnv.playerX = ctx.playerPos.x;
      vEnv.playerY = ctx.playerPos.y;
      pEnv.playerX = ctx.playerPos.x;
      pEnv.playerY = ctx.playerPos.y;
      const kmh = ctx.playerSpeedKmh ?? 50; // unknown speed = assume moving
      vEnv.playerSpeedMps = kmh / 3.6;
      pEnv.playerSpeedKmh = kmh;
      if (ctx.playerHeadingDeg !== undefined) {
        const rad = (ctx.playerHeadingDeg * Math.PI) / 180;
        vEnv.playerDirX = Math.sin(rad); // 0 deg = north (+y), cw positive
        vEnv.playerDirY = Math.cos(rad);
      } else {
        vEnv.playerDirX = 0;
        vEnv.playerDirY = 0; // no heading -> never "aligned", treated static
      }
    } else {
      vEnv.hasPlayer = false;
      pEnv.hasPlayer = false;
    }

    for (let i = 0; i < this.pedestrianAgents.length; i++) {
      updatePedestrian(this.pedestrianAgents[i], dt, pEnv);
    }
    for (let i = 0; i < this.vehicleAgents.length; i++) {
      updateVehicle(this.vehicleAgents[i], dt, vEnv);
    }

    // Staged actors last: they read the freshest player pose and publish into
    // the same state arrays; ambient agents never read them (documented v1
    // limitation — see staged.ts header).
    const sEnv = this.stagedEnv;
    sEnv.hasPlayer = vEnv.hasPlayer;
    sEnv.playerX = vEnv.playerX;
    sEnv.playerY = vEnv.playerY;
    sEnv.playerSpeedMps = vEnv.playerSpeedMps;
    for (let i = 0; i < this.stagedVehicles.length; i++) {
      updateStagedVehicle(this.stagedVehicles[i], dt, sEnv);
    }
    for (let i = 0; i < this.stagedPeds.length; i++) {
      updateStagedPedestrian(this.stagedPeds[i], dt, sEnv);
    }
  }

  stage(spec: StagedActorSpec): StagedActorView | null {
    if (this.stagedById.has(spec.id)) return null;
    const stateId = STAGED_STATE_ID_BASE + this.stagedById.size;
    if (spec.kind === "vehicle") {
      // A railPath (the RX train's authored line) bypasses the road graph;
      // otherwise resolve the ordinary lane-graph path from pathNodes.
      const path =
        spec.railPath && spec.railPath.length >= 2
          ? buildStagedVehiclePolylinePath(spec.railPath)
          : resolveStagedVehiclePath(this.graph, spec.pathNodes, spec.extraRightOffsetM ?? 0);
      if (!path) return null;
      const agent = createStagedVehicle(spec, path, stateId);
      this.stagedVehicles.push(agent);
      this.vehicles.push(agent.state);
      this.stagedById.set(spec.id, agent);
      // A11: the curb offset is the staged spec's cyclist marker (audit C3 —
      // v1 "cyclists" are narrow curb-riding vehicle proxies).
      if ((spec.extraRightOffsetM ?? 0) > 0) this.cyclistStateIds.add(stateId);
      return agent.view;
    }
    const path = buildStagedPedPath(spec.path);
    if (!path) return null;
    const agent = createStagedPedestrian(spec, path, stateId);
    this.stagedPeds.push(agent);
    this.pedestrians.push(agent.state);
    this.stagedById.set(spec.id, agent);
    return agent.view;
  }

  stagedCommand(id: string, command: StagedCommand): void {
    const agent = this.stagedById.get(id);
    if (agent) applyStagedCommand(agent, command, this.stagedEnv);
  }

  staged(id: string): StagedActorView | null {
    return this.stagedById.get(id)?.view ?? null;
  }

  vehicleCollisionKind(stateId: number): "vehicle" | "cyclist" {
    return this.cyclistStateIds.has(stateId) ? "cyclist" : "vehicle";
  }

  pedestrianOnCrossing(crossingId: string): boolean {
    return (this.crossingCounts.get(crossingId) ?? 0) > 0;
  }

  leadGapMeters(px: number, py: number, headingDeg: number): number {
    return leadGapFor(this.vehicles, px, py, headingDeg);
  }

  rearGapMeters(px: number, py: number, headingDeg: number): number {
    return rearGapFor(this.vehicles, px, py, headingDeg);
  }

  conflictNear(x: number, y: number, radiusM: number, approachBearingDeg: number): boolean {
    return conflictNearFor(this.vehicles, x, y, radiusM, approachBearingDeg);
  }

  oncomingNear(px: number, py: number, headingDeg: number, radiusM: number): OncomingApproach | null {
    return oncomingApproachFor(this.vehicles, px, py, headingDeg, radiusM);
  }

  conflictFromRight(
    jx: number,
    jy: number,
    px: number,
    py: number,
    headingDeg: number,
    radiusM: number,
  ): boolean {
    return conflictFromRightFor(this.vehicles, jx, jy, px, py, headingDeg, radiusM);
  }

  circulatingConflict(
    cx: number,
    cy: number,
    px: number,
    py: number,
    headingDeg: number,
    bandRadiusM: number,
  ): boolean {
    return circulatingConflictFor(this.vehicles, cx, cy, px, py, headingDeg, bandRadiusM);
  }

  cyclistNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null {
    return cyclistNearFor(
      this.vehicles,
      (stateId) => this.cyclistStateIds.has(stateId),
      px,
      py,
      headingDeg,
      radiusM,
    );
  }

  overtakenNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null {
    return sameDirVehicleNearFor(
      this.vehicles,
      (stateId) => this.cyclistStateIds.has(stateId),
      px,
      py,
      headingDeg,
      radiusM,
    );
  }
}

/**
 * Pure "nearest same-direction cyclist proxy near the player" query (VU-02 —
 * the lateral-clearance duty's telemetry seam). Only states the caller tags as
 * cyclists qualify (the vehicleCollisionKind marker: staged curb-riding
 * proxies, extraRightOffsetM > 0 at stage time); a cyclist heading more than
 * CYCLIST_SAME_DIR_DEG off the player's own heading is crossing/oncoming — a
 * MEETING, not a pass — and never returns (the oncoming bank is exempt by
 * construction). Standing cyclists still return (a pass past a waiting rider
 * carries the same clearance duty); the runtime's tracker owns every further
 * bias (closing arm, speed floor, junction gate, swerve stand-down).
 */
export function cyclistNearFor(
  vehicles: readonly {
    id: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
  }[],
  isCyclist: (stateId: number) => boolean,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): CyclistApproach | null {
  const r2 = radiusM * radiusM;
  let best: CyclistApproach | null = null;
  let bestD2 = Infinity;
  for (const v of vehicles) {
    if (!isCyclist(v.id)) continue;
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 >= bestD2) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    // Folded angular difference, 0 = same direction … 180 = head-on oncoming.
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta > CYCLIST_SAME_DIR_DEG) continue; // oncoming/crossing → a meeting, not a pass
    bestD2 = d2;
    best = { x: v.x, y: v.y, dirX: v.dirX, dirY: v.dirY, speedMps: v.speedMps };
  }
  return best;
}

/**
 * Pure "nearest same-direction VEHICLE near the player" query (OV-09 — the
 * overtake-return duty's telemetry seam; the cyclistNearFor mold with the
 * cyclist filter INVERTED). Any published vehicle state qualifies EXCEPT
 * cyclist proxies (their pass duty is VU-02's lateral-clearance act — one
 * act, one code); a vehicle heading more than the same-direction cone off
 * the player's own heading is oncoming/crossing traffic — a different duty,
 * never returned. Deliberately NO ahead/behind or speed filter: the runtime's
 * return tracker reads the mate through the whole pass (ahead → alongside →
 * behind), and a guard-stopped victim must still be returned at the landing
 * (the reference-speed latch owns the rescue honesty). Nearest wins.
 */
export function sameDirVehicleNearFor(
  vehicles: readonly {
    id: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
  }[],
  isCyclist: (stateId: number) => boolean,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): CyclistApproach | null {
  const r2 = radiusM * radiusM;
  let best: CyclistApproach | null = null;
  let bestD2 = Infinity;
  for (const v of vehicles) {
    if (isCyclist(v.id)) continue; // the cyclist pass is VU-02's act
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 >= bestD2) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    // Folded angular difference, 0 = same direction … 180 = head-on oncoming.
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta > CYCLIST_SAME_DIR_DEG) continue; // oncoming/crossing → a meeting
    bestD2 = d2;
    best = { x: v.x, y: v.y, dirX: v.dirX, dirY: v.dirY, speedMps: v.speedMps };
  }
  return best;
}

/**
 * Pure "circulating vehicle approaching from the driver's left" test for a
 * roundabout entry. Right-hand traffic circles counter-clockwise, so a car
 * already on the ring reaches your entry from the LEFT. True when a moving
 * vehicle sits within the ring band AND to the driver's left — the driver must
 * give way to it.
 */
export function circulatingConflictFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  cx: number,
  cy: number,
  px: number,
  py: number,
  headingDeg: number,
  bandRadiusM: number,
): boolean {
  const rad = (headingDeg * Math.PI) / 180;
  // Driver's LEFT vector = forward (sinH,cosH) rotated 90° CCW = (-cosH, sinH).
  const lx = -Math.cos(rad);
  const ly = Math.sin(rad);
  const r2 = bandRadiusM * bandRadiusM;
  for (const v of vehicles) {
    const cdx = v.x - cx;
    const cdy = v.y - cy;
    if (cdx * cdx + cdy * cdy > r2) continue; // not in / near the ring
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue; // parked / creeping
    if ((v.x - px) * lx + (v.y - py) * ly < RIGHT_MIN_M) continue; // not on the left
    return true;
  }
  return false;
}

/** Pure "vehicle approaching from the player's right near a junction" test. */
export function conflictFromRightFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  jx: number,
  jy: number,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): boolean {
  const rad = (headingDeg * Math.PI) / 180;
  // Player's right vector = forward (sinH,cosH) rotated 90° clockwise = (cosH,-sinH).
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  const r2 = radiusM * radiusM;
  for (const v of vehicles) {
    const jdx = v.x - jx;
    const jdy = v.y - jy;
    if (jdx * jdx + jdy * jdy > r2) continue; // not near the junction
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    if ((v.x - px) * rx + (v.y - py) * ry < RIGHT_MIN_M) continue; // not on the right
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta < CONFLICT_SAME_DIR_DEG) continue; // same-direction → not a conflict
    return true;
  }
  return false;
}

/**
 * Pure "most urgent oncoming vehicle ahead" query (district space; see the
 * TrafficSystem.oncomingNear doc). N1: among all moving oncoming vehicles
 * ahead within the radius, returns the one with the SMALLEST time-to-arrival
 * (distM / closingMps) — that is the gap the left-turn adjudicator must
 * grade. Null when the way is clear.
 */
export function oncomingApproachFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): OncomingApproach | null {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad);
  const r2 = radiusM * radiusM;
  let best: OncomingApproach | null = null;
  let bestTta = Infinity;
  for (const v of vehicles) {
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (dx * fx + dy * fy <= 0) continue; // must be ahead of the player
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta <= ONCOMING_MIN_DEG) continue; // not heading roughly opposite
    const distM = Math.sqrt(d2);
    // Closing speed: the vehicle's velocity component toward the query point
    // (unit vector vehicle → player is (-dx, -dy) / distM).
    const closingMps = distM > 0 ? (v.dirX * -dx + v.dirY * -dy) * (v.speedMps / distM) : v.speedMps;
    const tta = closingMps > 0.1 ? distM / closingMps : Infinity;
    if (tta < bestTta || (best === null && tta === Infinity)) {
      bestTta = tta;
      best = { distM, closingMps, speedMps: v.speedMps };
    }
  }
  return best;
}

/** Boolean form of oncomingApproachFor (legacy tests / presence checks). */
export function oncomingNearFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): boolean {
  return oncomingApproachFor(vehicles, px, py, headingDeg, radiusM) !== null;
}

/** Pure "conflicting vehicle near a point" test (district space; see interface). */
export function conflictNearFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  x: number,
  y: number,
  radiusM: number,
  approachBearingDeg: number,
): boolean {
  const r2 = radiusM * radiusM;
  for (const v of vehicles) {
    const dx = v.x - x;
    const dy = v.y - y;
    if (dx * dx + dy * dy > r2) continue;
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    // Bearing of the vehicle's travel (0 = north, clockwise).
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - approachBearingDeg) % 360) + 540) % 360 - 180);
    if (delta < CONFLICT_SAME_DIR_DEG) continue; // same-direction → not a conflict
    return true;
  }
  return false;
}

/**
 * Pure gap-to-nearest-vehicle-ahead helper (district space; headingDeg 0 = north,
 * clockwise). A vehicle counts only when ahead and within a lane-width corridor;
 * returns bumper-to-bumper metres, or Infinity when the road ahead is clear.
 */
export function leadGapFor(
  vehicles: readonly { x: number; y: number }[],
  px: number,
  py: number,
  headingDeg: number,
): number {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  let best = Infinity;
  for (const v of vehicles) {
    const rx = v.x - px;
    const ry = v.y - py;
    const fwd = rx * fx + ry * fy;
    if (fwd <= 0) continue; // not ahead
    const lat = Math.abs(rx * -fy + ry * fx); // perpendicular offset
    if (lat > LEAD_CORRIDOR_M) continue; // not in my lane/path
    const gap = fwd - VEHICLE_LENGTH_M;
    if (gap < best) best = gap;
  }
  return best === Infinity ? Infinity : Math.max(0, best);
}

/**
 * Pure gap-to-nearest-vehicle-BEHIND helper — leadGapFor with the forward test
 * flipped (same corridor, same bumper constant). HUD-ONLY channel (the PROX
 * rear-proximity cue reads it at ~5 Hz); no rule-engine detector consumes it,
 * so adding it changes no grading. Returns Infinity when nothing is behind —
 * the cue's honesty contract (no vehicle ⇒ no badge) rests on that.
 */
export function rearGapFor(
  vehicles: readonly { x: number; y: number }[],
  px: number,
  py: number,
  headingDeg: number,
): number {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  let best = Infinity;
  for (const v of vehicles) {
    const rx = v.x - px;
    const ry = v.y - py;
    const fwd = rx * fx + ry * fy;
    if (fwd >= 0) continue; // not behind
    const lat = Math.abs(rx * -fy + ry * fx); // perpendicular offset
    if (lat > LEAD_CORRIDOR_M) continue; // not in my lane/path
    const gap = -fwd - VEHICLE_LENGTH_M;
    if (gap < best) best = gap;
  }
  return best === Infinity ? Infinity : Math.max(0, best);
}

/**
 * Build the scripted traffic for a district. Do it once per session (route
 * precomputation walks the whole road graph); the returned system is then
 * O(agents) per frame with zero allocations.
 */
export function createTrafficSystem(
  district: TrafficDistrict,
  config?: Partial<TrafficConfig>,
): TrafficSystem {
  return new TrafficSystemImpl(district, { ...DEFAULT_TRAFFIC_CONFIG, ...config });
}
