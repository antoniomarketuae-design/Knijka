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
// Shared HERO car-paint recipes (player car + premium boxy SUV): clearcoat at
// high, glossy MeshStandard fallback on med/low (docs/simulation/71 §4.8).
export { carPaintMaterial, carPaintStandardMaterial } from "./vehicleFleet";
export type { CarPaintOptions, BuildTrafficFleetOptions } from "./vehicleFleet";
// S0 scenario obstacles (doc 76 §0): the instanced-fleet machinery + measured
// per-model rigs, additively exposed so components/sim/ScenarioObstacles can
// render PRECISE hittable parked cars over the same GLB kit (its colliders
// are cuboids matched to each rig's measured bbox — never a generic shell).
export {
  assignCivilianModel,
  // Hero boxy-SUV population caps — the shipped ≤2 and the tier-`low` 0
  // (doc 82 §2.3). TrafficLayer picks between them from the render tier.
  BOXY_MAX_INSTANCES,
  BOXY_MAX_INSTANCES_LOW,
  // Quadruped hazard rig (doc 72 §HZ „животно на пътя"): ScenarioObstacles
  // mounts the SAME geometry TrafficLayer renders, so the animal can stand as
  // held scenery (sc-animal-hazard) instead of a recorder-less dart trigger.
  buildAnimalRig,
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET,
  FLEET_URLS,
  // R3 #26 bus stopgap: the procedural box-truck slot, so ScenarioObstacles
  // can stage the large occluder body ("box_truck") through the same parked
  // pass until a real bus rig exists.
  TRUCK_MODEL_INDEX,
} from "./vehicleFleet";
export type { ModelRig, ParkedPlacement, TrafficFleet } from "./vehicleFleet";
export { mulberry32 } from "./rng";
export type { Rng } from "./rng";
export { computeParkedCars, TrafficLayer } from "./TrafficLayer";
export type {
  ControllerFigureRead,
  ParkedCar,
  ParkedClearZoneLike,
  TrafficLayerProps,
} from "./TrafficLayer";
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
  CyclistApproach,
  DistrictCrossing,
  DistrictEdge,
  DistrictIntersection,
  DistrictNode,
  OncomingApproach,
  PedestrianVariant,
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
  VehicleIndicator,
  VehicleProfile,
} from "./types";
// L6 / T17(e): the indicator channel's vocabulary + the profile body lengths
// the lead/rear gap queries subtract (TrafficLayer reads the first, the rule
// engine's follow channel the second).
export {
  PLAYER_HALF_LENGTH_M,
  VEHICLE_PROFILE_LENGTH_M,
  vehicleHalfLengthM,
} from "./types";
