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

import type { ParkingBaySpec } from "../contracts";

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
  // -- B1a additive legality tags (doc 72 N3; runtime/district.ts mirrors).
  /** Legality-zone tag ("thirty" = signed «Зона 30»; school/residential
   *  reserved). The reduced limit itself lives in `maxspeed`. */
  zone?: "school" | "residential" | "thirty";
  /** Overtaking banned on this edge — surface-only context. */
  noOvertake?: boolean;
  /** U-turn banned on this edge — surface-only context. */
  noUTurn?: boolean;
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

/** ZONE-BAN data layer (ADR-006 stage 2a; stage 2b adds the line-type + bus
 *  vocabulary; stage 3a adds the railCrossing track band; the curve-envelope
 *  slice adds the curveAdvisory arc span — runtime/district.ts is the
 *  documented contract; this mirror keeps world-side loads typed). */
export type DistrictZoneKind =
  | "noStopping"
  | "noParking"
  | "noOvertaking"
  | "solidCenterLine"
  | "busLane"
  | "railCrossing"
  | "curveAdvisory";

/** One authored span along an edge's polyline arclength (В24/В27/В28 bans;
 *  stage 2b: М1 solid осева / BUS lane markings; stage 3a: the railCrossing
 *  track band with its optional guarded flag + barrier timetable; the
 *  curve-envelope slice: the curveAdvisory arc with its advisory speed). */
export interface DistrictZone {
  id: string;
  kind: DistrictZoneKind;
  edgeId: string;
  fromM: number;
  toM: number;
  signRef: string;
  /** railCrossing only: guarded (А34) vs unguarded (А35) — runtime/district.ts. */
  guarded?: boolean;
  /** railCrossing + guarded only: deterministic periodic barrier timetable. */
  barrier?: { cycleSec: number; downFromSec: number; downToSec: number };
  /** curveAdvisory only: posted advisory speed of the marked curve, km/h. */
  advisoryKmh?: number;
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
  /** OPTIONAL ban zones (ADR-006 stage 2a; absent = plain v1 — the builder
   *  passes them through untouched; only the runtime consumes them). Files
   *  carrying zones set meta.zonesVersion = 1 (see runtime/district.ts). */
  zones?: DistrictZone[];
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

/** Which authored tree model renders a placement (streetscape v2 mix). */
export type TreeKind = "palm" | "ornamental" | "leafyA" | "leafyB";

export interface TreePlacement extends StaticTransform {
  variant: 0 | 1 | 2;
  kind: TreeKind;
}

export type BillboardSize = "large" | "small";

/** Roadside advertising billboard on a pole (streetscape v2, REF 3). */
export interface BillboardPlacement extends StaticTransform {
  size: BillboardSize;
}

/**
 * One instanced glass-tower model. Non-uniform scale (unlike
 * StaticTransform's single scale) because footprints fit width/height/depth
 * independently. Base sits at world y=0.
 */
export interface BuildingInstancePlacement {
  /** District building id — links the instance to its footprint (the facade
   *  prism builder skips walls/roofs for these ids). */
  buildingId: string;
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
  /** Painted parking-bay U-shapes (lesson-authored, doc 68 A5). */
  parkingBays: number;
  /** Curbside parking bands on arterial edges (two per qualifying ribbon). */
  parkingLaneStrips: number;
  /** Batched road decals (one quad each; the whole batch is ONE draw call). */
  roadDecals: number;
  buildings: number;
  /** Instanced glass towers placed on tall, compact footprints. */
  buildingInstances: number;
  trafficLights: number;
  signs: Record<SignKind, number>;
  streetlights: number;
  trees: number;
  /** Roadside billboards on primary streets (streetscape v2). */
  billboards: number;
  /** Bus-stop shelters on primary/secondary sidewalks (streetscape v2). */
  busStops: number;
  /** Surface-parking dressing clusters (kiosk + barrier + wheel stops). */
  parkingKits: number;
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
  /** Tinted curbside parking bands on arterial edges (inside the ribbon
   *  width, drawn a hair above the asphalt — doc 68 QW3). */
  parkingLanes: MeshData;
  /** Batched road-decal quads (cracks/patches/oil/manholes/dirt) — one atlas,
   *  one draw call, co-planar with the asphalt (doc 71 §4.4). UVs address the
   *  procedural decal atlas (builders/decals.ts manifest). */
  roadDecals: MeshData;
  /** Open ground (grass): parks, verges, district edges. Subtle off-road relief. */
  terrain: MeshData;
  /** Paved ground (concrete): courtyards/parking in the built-up fabric.
   *  Co-planar with `terrain`, shares its vertex positions so there are no seams. */
  terrainPaved: MeshData;
  /** Building walls merged per facade palette variant (index = variant) —
   *  the mid-rise fabric, extruded at the district-data height (doc 68 QW3).
   *  Rendered by StaticWorld; excludes buildings drawn as tower instances. */
  buildingWalls: MeshData[];
  /** Flat roofs of the facade-prism buildings, merged. */
  buildingRoofs: MeshData;
  /** Instanced glass towers on the tall, compact footprints (CityBuildings). */
  buildingInstances: BuildingInstancePlacement[];
  trafficLights: TrafficLightPlacement[];
  signs: SignPlacement[];
  streetlights: StaticTransform[];
  trees: TreePlacement[];
  /** Roadside billboards along primary streets (streetscape v2, REF 3). */
  billboards: BillboardPlacement[];
  /** Bus-stop shelters on primary/secondary sidewalks near junction mouths. */
  busStops: StaticTransform[];
  /** Surface-parking dressing clusters (one transform per pre-merged kit). */
  parkingKits: StaticTransform[];
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
  /** Painted parking-bay rectangles (white U-shapes in the markings mesh).
   * Default: the lesson-authored bays (lessons/specs LESSON_PARKING_BAYS) —
   * pass [] to build a bare district. */
  parkingBays?: readonly ParkingBaySpec[];
}

export type WorldQuality = "low" | "med" | "high";
