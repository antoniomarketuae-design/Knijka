/**
 * sim/traffic — public API.
 *
 * Scripted, deterministic ambient traffic (docs/simulation/15): vehicle
 * agents on precomputed road-graph loops + pedestrians on sidewalk/crossing
 * loops, and an instanced R3F presentation layer.
 *
 * Integration (order matters, once per frame):
 *   1. runtime.update(dt)                      — signals advance
 *   2. traffic.update(dt, { signalPhase: id => runtime.signalPhase(id),
 *        playerPos, playerSpeedKmh, playerHeadingDeg })
 *   3. runtime.setPedestrianQuery(id => traffic.pedestrianOnCrossing(id))
 *      (once at setup) so SimTick crossing events see real pedestrians.
 * `<TrafficLayer system={...} runtime={...} playerRef={...} />` can run
 * step 2 itself when you don't need explicit ordering.
 */

export { createTrafficSystem } from "./system";
// Shared HERO clearcoat car-paint recipe (player car + premium boxy SUV).
export { carPaintMaterial } from "./vehicleFleet";
export type { CarPaintOptions } from "./vehicleFleet";
export { mulberry32 } from "./rng";
export type { Rng } from "./rng";
export { TrafficLayer } from "./TrafficLayer";
export type { TrafficLayerProps } from "./TrafficLayer";
export { DEFAULT_TRAFFIC_CONFIG } from "./types";
// A11 hittable traffic — pure proximity/near-miss helpers for the physics
// shell pool (components/sim/NpcColliders binds them to rapier).
export {
  assignPool,
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  resetNearMissTracker,
  selectNearest,
  stepNearMiss,
} from "./proximity";
export type {
  AgentPoint,
  NearMissAgent,
  NearMissConfig,
  NearMissPlayer,
  NearMissTracker,
} from "./proximity";
export type {
  DistrictCrossing,
  DistrictEdge,
  DistrictIntersection,
  DistrictNode,
  SignalPhaseFn,
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
  StagedPedestrianSpec,
  StagedVehicleSpec,
  TrafficConfig,
  TrafficDistrict,
  TrafficPedestrianState,
  TrafficSystem,
  TrafficSystemStats,
  TrafficUpdateContext,
  TrafficVehicleState,
} from "./types";
