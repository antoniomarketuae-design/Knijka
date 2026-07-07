/**
 * sim/world — public API.
 *
 * Renders content/world/district-v1.json as the drivable district:
 * procedural road network, buildings, props, terrain and static colliders.
 *
 * Layers:
 * - buildWorldGeometry(district, options) — PURE builder (node-safe, unit
 *   tested): typed-array meshes + prop placements + collider data.
 * - <DistrictWorld/> — R3F component consuming the builder (client-only;
 *   mount inside <Canvas> / <Physics>).
 * - <OsmAttribution/> — DOM element for the HUD; legally required wherever
 *   the district is shown (ODbL, docs/simulation/17 §5).
 *
 * Signal phases, zones and speed-limit queries are sim/runtime's job — the
 * world only *displays* phase via the getSignalPhase callback.
 */

export { buildWorldGeometry, DEFAULT_SEED } from "./builders/buildWorldGeometry";
export { analyzeNetwork } from "./builders/network";
export {
  LANE_WIDTH_M,
  ROAD_Y,
  CURB_HEIGHT_M,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
} from "./builders/constants";

export { DistrictWorld } from "./components/DistrictWorld";
export type { DistrictWorldProps } from "./components/DistrictWorld";
export { WorldColliders } from "./components/WorldColliders";
export { OsmAttribution } from "./components/OsmAttribution";
export { QUALITY_PRESETS } from "./components/quality";
export type { QualityPreset } from "./components/quality";

export { assertDistrict } from "./types";
export type {
  BuildWorldOptions,
  ColliderMesh,
  District,
  DistrictBuilding,
  DistrictCrossing,
  DistrictEdge,
  DistrictIntersection,
  DistrictNode,
  DistrictRoundabout,
  DistrictSpawnPoint,
  MeshData,
  SignKind,
  SignPlacement,
  StaticTransform,
  TrafficLightPlacement,
  TreePlacement,
  WorldColliderSet,
  WorldGeometry,
  WorldQuality,
  WorldStats,
} from "./types";
