/**
 * sim/runtime — public API (module-boundary barrel, docs/architecture/05).
 *
 * Implements the WorldRuntime contract from sim/contracts.ts over
 * content/world/district-v1.json. Pure TypeScript: no React/three/Rapier.
 */

export {
  createWorldRuntime,
  comfortableStopPossible,
  RAIL_APPROACH_M,
  AMBER_REACTION_SEC,
  AMBER_COMFORT_DECEL_MPS2,
  AMBER_STOP_MARGIN,
  LEFT_TURN_ONCOMING_RADIUS_M,
  LEFT_TURN_CONVICT_GAP_SEC,
  LEFT_TURN_GAP_ADVISORY_SEC,
  LEFT_TURN_GAP_SAFE_SEC,
  LEFT_TURN_CONVICT_RADIUS_M,
  LEFT_TURN_GAP_MEMORY_SEC,
  OVERTAKE_CONVICT_GAP_SEC,
  OVERTAKE_GAP_SAFE_SEC,
  OVERTAKE_ONCOMING_RADIUS_M,
  OVERTAKE_COMMIT_MIN_KMH,
  OVERTAKE_GAP_MEMORY_SEC,
  VULNERABLE_PASS_PROBE_RADIUS_M,
  VULNERABLE_PASS_BODY_ALLOWANCE_M,
  VULNERABLE_PASS_CONVICT_LATERAL_M,
  VULNERABLE_PASS_SAFE_LATERAL_M,
  VULNERABLE_PASS_ALONGSIDE_M,
  VULNERABLE_PASS_ARM_AHEAD_M,
  VULNERABLE_PASS_DONE_BEHIND_M,
  VULNERABLE_PASS_MIN_KMH,
  VULNERABLE_PASS_MIN_CLOSING_MPS,
  VULNERABLE_PASS_SWERVE_M,
  VULNERABLE_PASS_CONTACT_M,
  type CyclistConflict,
  type CyclistQuery,
  type DistrictWorldRuntime,
  type OncomingConflict,
  type OncomingQuery,
  type SignalPhaseInfo,
} from "./worldRuntime";
export {
  parseDistrict,
  BG_URBAN_DEFAULT_KMH,
  type District,
  type DistrictBounds,
  type DistrictCrossing,
  type DistrictEdge,
  type DistrictIntersection,
  type DistrictNode,
  type DistrictRoundabout,
  type DistrictSpawnPoint,
  type DistrictZone,
  type DistrictZoneKind,
  type EdgeZone,
  type RailBarrierTimetable,
  type RoadClass,
} from "./district";
export { LANE_WIDTH_M, OFF_ROAD_DISTANCE_M } from "./spatial";
export {
  SIGNAL_TIMING,
  phaseTimingInCycle,
  type SignalClusterInfo,
  type SignalClusterMode,
  type SignalControllerSchedule,
} from "./signals";
export { CROSSING_ZONE_RADIUS_M, type PedestrianQuery } from "./zones";
export { JUNCTION_AREA_RADIUS_M, TURN_THRESHOLD_DEG, TURN_WINDOW_SEC, TurnDetector } from "./turns";
export type { StopLine } from "./stoplines";
export {
  buildMinimap,
  fitViewport,
  followViewport,
  worldToCanvas,
  worldToCanvasX,
  worldToCanvasY,
  vehicleMarkerRotationRad,
  headingUpMapRotationRad,
  type BuildMinimapOptions,
  type MinimapData,
  type MinimapPoint,
  type MinimapRoad,
  type MinimapRoadGroup,
  type MinimapViewport,
} from "./minimap";
