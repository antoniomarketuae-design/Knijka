/**
 * sim/world — types for the district world renderer.
 *
 * `District*` types mirror content/world/district-v1.json (the data contract
 * from docs/simulation/17). `WorldGeometry` is the pure, renderer-agnostic
 * output of buildWorldGeometry() — plain typed arrays + placement lists that
 * the R3F components (and the rapier colliders) consume, and that vitest can
 * assert on without a GPU.
 *
 * Coordinate spaces:
 * - District space: meters, x = east, y = north (as in the JSON).
 * - World (three.js) space: y-up, district (x, y) -> (x, -z). All positions
 *   inside WorldGeometry are ALREADY in world space.
 */

// ---------------------------------------------------------------------------
// district-v1.json shapes
// ---------------------------------------------------------------------------

export type RoadClass =
  | "primary"
  | "primary_link"
  | "secondary"
  | "secondary_link"
  | "tertiary"
  | "tertiary_link"
  | "unclassified"
  | "residential"
  | "living_street"
  | "service";

export interface DistrictNode {
  id: string;
  x: number;
  y: number;
}

export interface DistrictEdge {
  id: string;
  from: string;
  to: string;
  class: RoadClass | string;
  name: string | null;
  oneway: boolean;
  roundabout: boolean;
  lanes: number;
  lanesSource: "tag" | "default";
  maxspeed: number;
  maxspeedSource: "tag" | "default";
  length: number;
  /** Polyline in district meters, [[x, y], ...], >= 2 points. */
  geometry: [number, number][];
}

export interface DistrictIntersection {
  id: string;
  x: number;
  y: number;
  degree: number;
  signalized: boolean;
}

export type CrossingKind = "signals" | "marked" | "unmarked" | "unknown";

export interface DistrictCrossing {
  id: string;
  x: number;
  y: number;
  kind: CrossingKind;
  signalized: boolean;
  edgeId: string | null;
}

export interface DistrictRoundabout {
  id: string;
  x: number;
  y: number;
  radius: number;
  edgeIds: string[];
}

export interface DistrictBuilding {
  id: string;
  height: number;
  heightSource: "height" | "levels" | "default";
  /** Simplified outer ring, unclosed (renderer closes it). */
  footprint: [number, number][];
}

export interface DistrictSpawnPoint {
  id: string;
  x: number;
  y: number;
  /** Degrees, 0 = north, clockwise. */
  heading: number;
  edgeId: string;
  name: string | null;
}

export interface DistrictMeta {
  district: string;
  label: string;
  boundsLocalMeters: { minX: number; minY: number; maxX: number; maxY: number };
  attribution: {
    text: string;
    license: string;
    licenseUrl: string;
    copyrightUrl: string;
    obligation?: string;
  };
  defaults?: { maxspeedUrbanKmh?: number };
  [key: string]: unknown;
}

export interface District {
  format: "district-v1";
  meta: DistrictMeta;
  roads: { nodes: DistrictNode[]; edges: DistrictEdge[] };
  intersections: DistrictIntersection[];
  crossings: DistrictCrossing[];
  roundabouts: DistrictRoundabout[];
  buildings: DistrictBuilding[];
  spawnPoints: DistrictSpawnPoint[];
}

/** Cheap structural guard for data loaded from JSON at the integration seam. */
export function assertDistrict(data: unknown): District {
  const d = data as District;
  if (
    !d ||
    d.format !== "district-v1" ||
    !d.roads ||
    !Array.isArray(d.roads.nodes) ||
    !Array.isArray(d.roads.edges) ||
    !Array.isArray(d.buildings) ||
    !d.meta?.attribution?.text
  ) {
    throw new Error("assertDistrict: data is not a district-v1 document");
  }
  return d;
}

// ---------------------------------------------------------------------------
// WorldGeometry — pure build output
// ---------------------------------------------------------------------------

export type Vec3Tuple = [number, number, number];

/** Indexed triangle mesh buffers, world space, ready for BufferGeometry. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Optional per-vertex RGB multipliers (building ground-floor band etc.). */
  colors?: Float32Array;
}

/** Minimal buffers for a static rapier trimesh collider. */
export interface ColliderMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface StaticTransform {
  position: Vec3Tuple;
  /** Rotation about +Y (radians). Object convention: +Z is the facing side. */
  yaw: number;
  scale?: number;
}

export interface TrafficLightPlacement extends StaticTransform {
  /** Signal node id — key for WorldRuntime.signalPhase(). */
  nodeId: string;
}

export type SignKind = "stop" | "giveWay" | "limit50" | "roundabout";

export interface SignPlacement extends StaticTransform {
  kind: SignKind;
}

export interface TreePlacement extends StaticTransform {
  variant: 0 | 1 | 2;
}

/**
 * One instanced Kenney building module. Non-uniform scale (unlike
 * StaticTransform's single scale) because footprints fit width/height/depth
 * independently. Base sits at world y=0.
 */
export interface BuildingInstancePlacement {
  /** Index into CITY_MODELS / the loaded geometry list. */
  model: number;
  position: Vec3Tuple;
  /** Rotation about +Y (radians); model local +X runs along the footprint's long axis. */
  yaw: number;
  /** Fit scale as [width (x), height (y), depth (z)]. */
  scale: Vec3Tuple;
}

export interface WorldColliderSet {
  /** One flat box under the whole district (roads drive on its top face). */
  ground: { halfExtents: Vec3Tuple; position: Vec3Tuple };
  /** Sidewalks + curbs (12 cm, drivable-over per vehicle harness). */
  sidewalks: ColliderMesh;
  /** Building walls. */
  buildings: ColliderMesh;
}

export interface WorldStats {
  edges: number;
  ribbons: number;
  skippedRibbons: number;
  junctionPatches: number;
  sidewalkStrips: number;
  markingQuads: number;
  stopLines: number;
  zebraCrossings: number;
  buildings: number;
  /** Instanced Kenney building modules placed on the footprints. */
  buildingInstances: number;
  trafficLights: number;
  signs: Record<SignKind, number>;
  streetlights: number;
  trees: number;
  vertices: number;
  triangles: number;
  /** Rough render draw-call estimate for DistrictWorld (no shadows). */
  drawCallEstimate: number;
}

export interface WorldGeometry {
  /** Asphalt ribbons (edge polylines swept to lane-count width). */
  roadSurface: MeshData;
  /** Junction fill polygons (fan patches at every node of degree >= 2). */
  junctionSurface: MeshData;
  /** Raised sidewalks incl. curb faces and junction corner aprons. */
  sidewalks: MeshData;
  /** All white paint: lane separators, edge lines, stop lines, zebras. */
  markings: MeshData;
  /** Open ground (grass): parks, verges, district edges. Subtle off-road relief. */
  terrain: MeshData;
  /** Paved ground (concrete): courtyards/parking in the built-up fabric.
   *  Co-planar with `terrain`, shares its vertex positions so there are no seams. */
  terrainPaved: MeshData;
  /** Building walls merged per facade palette variant (index = variant).
   *  Kept as data + collider source; the renderer draws `buildingInstances`. */
  buildingWalls: MeshData[];
  /** All flat roofs merged. Kept as data; not drawn when city models load. */
  buildingRoofs: MeshData;
  /** Kenney building modules placed on the footprints (the drawn buildings). */
  buildingInstances: BuildingInstancePlacement[];
  trafficLights: TrafficLightPlacement[];
  signs: SignPlacement[];
  streetlights: StaticTransform[];
  trees: TreePlacement[];
  colliders: WorldColliderSet;
  /** ODbL attribution text from meta — must stay user-visible. */
  attribution: { text: string; copyrightUrl: string };
  stats: WorldStats;
}

/** Tunables the hand-polish pass (doc 17 §6) can override per junction. */
export interface BuildWorldOptions {
  /** Extra junction-open-area radius per node id (meters, replaces default). */
  junctionRadiusOverrides?: Record<string, number>;
  /** 0..1 multiplier on tree spawn density (default 1). */
  treeDensity?: number;
  /** Deterministic seed for all procedural jitter (default 1337). */
  seed?: number;
}

export type WorldQuality = "low" | "med" | "high";
