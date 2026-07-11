/**
 * sim/runtime — district-v1.json types + parser.
 *
 * Mirrors the contract documented in docs/simulation/17_WORLD_GENERATION_AND_MAP_SYSTEM.md
 * (§3 "Data format"). Only the fields the runtime consumes are typed; the file
 * may carry more (buildings, meta provenance) which we pass through untouched.
 * Coordinates are local meters: x = east, y = north, around meta.center.
 */

export interface DistrictNode {
  id: string;
  x: number;
  y: number;
}

export type RoadClass =
  | "primary"
  | "secondary"
  | "secondary_link"
  | "tertiary"
  | "unclassified"
  | "residential"
  | "service";

/**
 * Per-edge legality-zone tag (doc 72 N3, B1a). "thirty" marks a signed
 * «Зона 30» section (OSM-verified maxspeed=30 tags in district-v1);
 * "school"/"residential" are reserved for the hand-polish overlay / future
 * districts (Д15/Д16 semantics). Additive — absent = untagged.
 */
export type EdgeZone = "school" | "residential" | "thirty";

export interface DistrictEdge {
  id: string;
  from: string;
  to: string;
  class: RoadClass;
  name?: string | null;
  oneway: boolean;
  roundabout: boolean;
  /** Total marked lanes (both directions on two-way roads). */
  lanes: number;
  /** Resolved legal limit, km/h (tag or BG urban default). */
  maxspeed: number;
  /** Polyline length, meters. */
  length: number;
  /** Polyline [x, y][] in local meters; endpoints coincide with from/to nodes. */
  geometry: [number, number][];
  // -- B1a additive legality tags (doc 72 N3). The parser is tolerant: all
  // three are optional and pass through untouched when absent.
  /** Legality-zone tag; the reduced speed (if any) lives in `maxspeed`. */
  zone?: EdgeZone;
  /** Overtaking banned on this edge (В24-class zone) — surface-only context. */
  noOvertake?: boolean;
  /** U-turn banned on this edge — surface-only context (doc 72 OV-17). */
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
  /** Host drivable edge, or null when the crossing sits on an excluded way. */
  edgeId: string | null;
}

export interface DistrictRoundabout {
  id: string;
  x: number;
  y: number;
  radius: number;
  edgeIds: string[];
}

export interface DistrictSpawnPoint {
  id: string;
  x: number;
  y: number;
  /** Degrees, 0 = north, clockwise. */
  heading: number;
  edgeId: string;
  name: string;
}

export interface DistrictBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface District {
  format: "district-v1";
  meta: {
    boundsLocalMeters: DistrictBounds;
    defaults?: { maxspeedUrbanKmh?: number };
    /** Extra meta (attribution, stats, projection…) passes through untyped. */
    [key: string]: unknown;
  };
  roads: {
    nodes: DistrictNode[];
    edges: DistrictEdge[];
  };
  intersections: DistrictIntersection[];
  crossings: DistrictCrossing[];
  roundabouts: DistrictRoundabout[];
  spawnPoints: DistrictSpawnPoint[];
}

/** BG urban default when an edge is unknown / vehicle is off-road (ЗДвП чл. 21). */
export const BG_URBAN_DEFAULT_KMH = 50;

/**
 * Structural validation of a parsed district JSON. Cheap by design — the build
 * pipeline (tools/osm/build.mjs) already self-validates deeply; this guards
 * against loading the wrong file, not against a corrupt build.
 */
export function parseDistrict(raw: unknown): District {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("district: expected an object");
  }
  const d = raw as Record<string, unknown>;
  if (d.format !== "district-v1") {
    throw new Error(`district: unsupported format ${String(d.format)} (want district-v1)`);
  }
  const roads = d.roads as { nodes?: unknown; edges?: unknown } | undefined;
  if (!roads || !Array.isArray(roads.nodes) || !Array.isArray(roads.edges)) {
    throw new Error("district: missing roads.nodes / roads.edges");
  }
  for (const key of ["intersections", "crossings", "roundabouts", "spawnPoints"]) {
    if (!Array.isArray(d[key])) throw new Error(`district: missing ${key}[]`);
  }
  const meta = d.meta as District["meta"] | undefined;
  if (!meta || typeof meta.boundsLocalMeters !== "object") {
    throw new Error("district: missing meta.boundsLocalMeters");
  }
  return raw as District;
}
