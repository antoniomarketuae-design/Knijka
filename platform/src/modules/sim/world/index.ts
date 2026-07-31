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
// The roundabout derivation (doc 87 FR-22): island radius, refusal reason and
// the ring's own metrics. Public because the dev scene-still route draws the
// SAME islands the sim does — one derivation, never two that drift.
export { analyzeRoundabouts } from "./builders/roundabout";
export type { RoundaboutRing } from "./builders/roundabout";
export {
  LANE_WIDTH_M,
  ROAD_Y,
  CURB_HEIGHT_M,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
} from "./builders/constants";

export { DistrictWorld } from "./components/DistrictWorld";
export type { DistrictWorldProps } from "./components/DistrictWorld";
export { LaneSignalGantry, laneGantryOf } from "./components/LaneSignalGantry";
export type { LaneGantrySpec } from "./components/LaneSignalGantry";
export { WorldColliders } from "./components/WorldColliders";
export { OsmAttribution } from "./components/OsmAttribution";
export { QUALITY_PRESETS } from "./components/quality";
export type { QualityPreset } from "./components/quality";
// The DOWNLOAD tier (audit H-11): what each quality level actually fetches.
// Public because the IBL mount lives outside this module (LessonScene) and must
// read the same ruling the texture loaders do.
export { TEXTURE_BUDGETS, groundMapsOf, facadeMapsOf } from "./textures/textureBudget";
export type { TextureBudget, GroundMapsMode } from "./textures/textureBudget";

export { assertDistrict } from "./types";
export type {
  BillboardPlacement,
  BillboardSize,
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
  TreeKind,
  TreePlacement,
  WorldColliderSet,
  WorldGeometry,
  WorldQuality,
  WorldStats,
} from "./types";
