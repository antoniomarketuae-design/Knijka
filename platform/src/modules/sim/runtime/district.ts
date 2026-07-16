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

/**
 * ZONE-BAN data layer (ADR-006 stage 2a; doc 72 N3 — PK-06/PK-07/OV-06,
 * SN-02/03/04 ban signs). Kind vocabulary of the first slice:
 *  - "noStopping"   — В27 „Забранени са престоят и паркирането" span;
 *  - "noParking"    — В28 „Забранено е паркирането" span (surface-only
 *                     context in this slice: престоят под В28 е разрешен, а
 *                     паркиране vs престой не се различава с текущата
 *                     телеметрия — the same A12 structural-innocence bar as
 *                     the deferred illegal-stop finding);
 *  - "noOvertaking" — В24 „Забранено е изпреварването" span.
 * Stage 2b (LINE TYPES + BUS LANES — same shape, new vocabulary, so
 * meta.zonesVersion stays 1; doc 72 OV-04/SN-03/SN-05):
 *  - "solidCenterLine" — the осева along this span is a SOLID М1 line
 *                        (единична непрекъсната): fully crossing it grades
 *                        the опасна CROSSED_SOLID_LINE; a mere touch keeps
 *                        grading the second-degree CENTER_LINE_TOUCHED;
 *  - "busLane"         — the CURB lane (laneId 0 of the vehicle's bank) of
 *                        this span is a bus lane (BUS маркировка): sustained
 *                        car travel in it grades DRIVING_IN_BUS_LANE, and the
 *                        keep-right detector stops requiring that lane.
 * Stage 3a (RAIL PACK slice 1 — same shape, new kind, so meta.zonesVersion
 * stays 1; doc 72 §12 RX-01/RX-02/RX-03):
 *  - "railCrossing"    — the TRACK BAND of a railway crossing across the host
 *                        edge (the span IS the rails ± clearance). Optional
 *                        `guarded` + `barrier` author the RX-01 variant; an
 *                        unguarded span (guarded absent/false) is the RX-02
 *                        mandatory-stop crossing (ЗДвП чл. 51–53). Grades the
 *                        опасна RAIL_CROSSING_VIOLATION.
 * Consumers MUST ignore zones with unknown kinds/edge ids (forward compat).
 */
export type DistrictZoneKind =
  | "noStopping"
  | "noParking"
  | "noOvertaking"
  | "solidCenterLine"
  | "busLane"
  | "railCrossing";

/**
 * Deterministic barrier timetable of a GUARDED rail crossing (railCrossing +
 * guarded — doc 72 RX-01). Periodic over session time, the signalOffsets /
 * controller-schedule discipline: barred (barriers down / РЖ flashing red)
 * exactly when (tSec mod cycleSec) ∈ [downFromSec, downToSec) — same session,
 * same map, same phases, always. A malformed/absent timetable on a guarded
 * span means NEVER barred (open — structurally innocent, A12).
 */
export interface RailBarrierTimetable {
  /** Full cycle length, seconds (> 0). */
  cycleSec: number;
  /** Barred window start within the cycle, seconds (0 <= from < to <= cycle). */
  downFromSec: number;
  /** Barred window end within the cycle, seconds. */
  downToSec: number;
}

/**
 * One authored ban zone: a span [fromM, toM] of arclength along the host
 * edge's polyline (the same s-measure the Locator's `sM` reports), so the
 * runtime resolves membership exactly the way it resolves `maxspeed` — from
 * the committed lane fix, no extra geometry.
 */
export interface DistrictZone {
  id: string;
  kind: DistrictZoneKind;
  /** Host drivable edge (roads.edges id). Unknown ids are inert (tolerant). */
  edgeId: string;
  /** Span along the edge polyline, meters; requires 0 <= fromM < toM. */
  fromM: number;
  toM: number;
  /** The posting sign/marking of the span ("В24" / "В27" / "В28"; stage 2b:
   *  "М1" for solidCenterLine, "BUS" for busLane — Наредба № 2 markings;
   *  stage 3a: "А34" guarded / "А35" unguarded rail crossing) — provenance +
   *  (future) rendering; the runtime grades off `kind` alone. */
  signRef: string;
  /**
   * railCrossing only (stage 3a): true = GUARDED crossing (barriers/РЖ lamps
   * — doc 72 RX-01). Legal asymmetry (ЗДвП чл. 51–53): an UNGUARDED crossing
   * (absent/false — the author's explicit declaration, RX-02) carries the
   * mandatory full-stop duty; a guarded crossing carries NO stop duty while
   * open — only the barred-entry ban. Other kinds ignore the field.
   */
  guarded?: boolean;
  /**
   * railCrossing + guarded only: the deterministic barrier timetable. Absent
   * or malformed = never barred (open, structurally innocent — A12).
   */
  barrier?: RailBarrierTimetable;
}

export interface District {
  format: "district-v1";
  meta: {
    boundsLocalMeters: DistrictBounds;
    defaults?: { maxspeedUrbanKmh?: number };
    /** ZONE-BAN schema marker: files that carry `zones` set 1 (ADR-006 stage
     *  2a version contract — see the `zones` field note). Absent = plain v1. */
    zonesVersion?: number;
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
  /**
   * ZONE-BAN data layer (ADR-006 stage 2a) — OPTIONAL and additive. The
   * version contract:
   *  - `format` stays "district-v1": every v1 consumer keeps working, and a
   *    file WITHOUT `zones` is byte-identical in meaning to before this field
   *    existed (the runtime adds nothing to the tick).
   *  - a file that DOES carry zones also sets `meta.zonesVersion: 1` so the
   *    data generation lineage is explicit; parsers must not require it.
   *  - shipped v1 files are NEVER regenerated for this field.
   */
  zones?: DistrictZone[];
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
  // ZONE-BAN layer (ADR-006 stage 2a): OPTIONAL — absent is plain v1; when
  // present it must at least be an array (wrong-file guard, same bar as the
  // checks above; per-zone tolerance lives at the consumer).
  if (d.zones !== undefined && !Array.isArray(d.zones)) {
    throw new Error("district: zones must be an array when present");
  }
  return raw as District;
}
