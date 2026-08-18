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
  /**
   * The edge is an АВТОМАГИСТРАЛА (MOTORWAY-SEGMENT slice, doc 72 SP-10).
   * Additive generator data (never OSM/heuristics in this slice): flows onto
   * SimTick.motorway and arms the motorway detectors. Absent (every pre-slice
   * map) = not a motorway — the detectors stay structurally silent.
   */
  motorway?: boolean;
  /** Curbside parking-band opt-in (doc 87 FR-21) — world/traffic read it. */
  parkingBand?: boolean;
  /** Which kerb the procedural parked row stands on; absent ⇒ `"right"`
   *  (doc 87 B50/B53/B54 — `traffic/TrafficLayer.parkedSideOf`). */
  parkingSide?: "left" | "right" | "both";
  /** What KIND of vehicle stands at that kerb; absent ⇒ the unbiased parked
   *  pool (doc 87 B50/B53/B54 — `traffic/TrafficLayer.PARKED_MIXES`). */
  parkingMix?: string;
}

export interface DistrictIntersection {
  id: string;
  x: number;
  y: number;
  degree: number;
  signalized: boolean;
}

export type CrossingKind = "signals" | "marked" | "unmarked" | "unknown";

/** Central refuge island / median nose at a crossing — mirrors
 *  world/types.DistrictCrossingIsland. The runtime does not consume it (the
 *  CrossingZoneTracker derives its zone from `x`/`y` alone); it is typed here
 *  so the parser passes it through instead of silently dropping it. */
export interface DistrictCrossingIsland {
  widthM: number;
  approachM: number;
  departM: number;
}

export interface DistrictCrossing {
  id: string;
  x: number;
  y: number;
  kind: CrossingKind;
  signalized: boolean;
  /** Host drivable edge, or null when the crossing sits on an excluded way. */
  edgeId: string | null;
  // -- doc 87 B50/B53/B54 crossing FURNITURE (mirrors world/types). All
  //    optional, none of them read by any detector: the graded crossing zone
  //    is derived from `x`/`y`, which none of these fields touches.
  island?: DistrictCrossingIsland;
  tableRampM?: number;
  staggerM?: number;
  skewDeg?: number;
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

/**
 * The district's box in local meters. NOT decoration: `DistrictIndex`
 * (runtime/spatial.ts) derives its uniform-grid ORIGIN and column count from
 * these four numbers, and the world layer pads them (`TERRAIN_MARGIN_M`) into
 * the drawn ground. A document that does not carry all four as finite numbers
 * therefore does not merely look wrong — it cannot be located on. See the
 * measurement at `parseDistrict`.
 */
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
 * CURVE-ENVELOPE slice (rural-curve archetype — same shape, new kind, so
 * meta.zonesVersion stays 1; doc 72 §8 SP-05 „Скорост в завой"):
 *  - "curveAdvisory"   — the marked CURVE of the host edge (the span IS the
 *                        arc), carrying the posted advisory speed
 *                        (`advisoryKmh` — the Т-table under the А1/А2 warning
 *                        sign). Sustained speed above the advisory inside the
 *                        span grades the основна SPEED_TOO_FAST_FOR_CURVE
 *                        (ЗДвП чл. 20, ал. 2). A span whose advisoryKmh is
 *                        absent/malformed is INERT (tolerant, A12).
 * MOTORWAY-SEGMENT slice (motorway-segment archetype — same shape, new kind,
 * so meta.zonesVersion stays 1; doc 72 §8 SP-10 „Магистрала"):
 *  - "emergencyLane"   — the CURB lane (laneId 0 of the vehicle's bank) of
 *                        this span is the лента за принудително спиране
 *                        (bounded by the wide solid edge line, М2): sustained
 *                        DRIVING in it grades the опасна
 *                        EMERGENCY_LANE_DRIVING (ЗДвП чл. 58, т. 4), and the
 *                        keep-right detector stops requiring that lane (the
 *                        busLane seam, mirrored).
 * SURFACE-PATCH slice (AQUAPLANE + ICE — same shape, new kinds, so
 * meta.zonesVersion stays 1; doc 72 §13 AC-07-full standing water / AC-08 ice
 * band). UNLIKE every kind above, these are consumed by the PHYSICS RIG, not
 * the rule-engine tick: worldRuntime deliberately does NOT know them (its
 * unknown-kind tolerance keeps them inert there — no tick channel exists),
 * while LessonScene resolves them to district-space rects
 * (resolveSurfaceGripPatches, runtime/surface.ts) and VehicleRig modulates
 * the LIVE car's grip as the chassis crosses them (VehicleSim
 * .setSurfaceGripFactor — MIN with the lesson base grip). Grading needs no
 * new rule code: the physical outcome (a blown stop objective, a collision,
 * a drift over the осева) is graded by the shipped machinery.
 *  - "waterPatch" — STANDING WATER across the span (дълбока вода на
 *                   платното). SPEED-GATED: bites only at/above
 *                   `aquaplaneAboveKmh` (above ~65 km/h the tyre stops
 *                   evacuating the water and floats; below, grip returns —
 *                   the doc-72 lesson is slow down BEFORE the water).
 *                   Requires `patchGripFactor` + `aquaplaneAboveKmh`;
 *                   either absent/malformed = the span is INERT (A12).
 *  - "icePatch"   — ICE on the exposed span (лед по моста) — constant
 *                   near-zero grip at ANY speed. Requires `patchGripFactor`;
 *                   absent/malformed = INERT (A12).
 * Consumers MUST ignore zones with unknown kinds/edge ids (forward compat).
 */
export type DistrictZoneKind =
  | "noStopping"
  | "noParking"
  | "noOvertaking"
  | "solidCenterLine"
  | "busLane"
  | "railCrossing"
  | "curveAdvisory"
  | "emergencyLane"
  | "waterPatch"
  | "icePatch";

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
  /**
   * curveAdvisory only (curve-envelope slice): the posted advisory speed of
   * the marked curve, km/h (the Т-table under А1/А2 — doc 72 SP-05). REQUIRED
   * for the span to grade: absent or malformed (non-finite, <= 0) makes the
   * whole span inert (tolerant, A12 — a data slip must never convict). Other
   * kinds ignore the field.
   */
  advisoryKmh?: number;
  /**
   * waterPatch + icePatch only (surface-patch slice): the surface grip factor
   * INSIDE the span, as a fraction of dry (tuning.AQUAPLANE_PATCH_GRIP_FACTOR
   * / ICE_PATCH_GRIP_FACTOR = 0.15 — the values live in the map, the
   * constants stay the documented truth the batteries pin). REQUIRED for the
   * span to resolve: absent or malformed (non-finite, <= 0, >= 1) makes the
   * whole span inert (the advisoryKmh tolerance discipline). Other kinds
   * ignore the field.
   */
  patchGripFactor?: number;
  /**
   * waterPatch only (surface-patch slice): the aquaplane float speed, km/h —
   * the patch bites at/above it and is INERT below (the tyre evacuates the
   * water again; tuning.AQUAPLANE_ABOVE_KMH = 65). REQUIRED for a waterPatch
   * to resolve: absent/malformed = the span is inert. icePatch (constant
   * grip at any speed) and every other kind ignore the field.
   */
  aquaplaneAboveKmh?: number;
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
   *  - a shipped v1 file gains the layer only through a POST-PASS that leaves
   *    the rest of the document byte-identical, never through a re-cut. The two
   *    OSM districts took that route in audit M-15
   *    (tools/maps/gen_exam_district_zones.mjs, which re-serializes the base
   *    builder's own layout and appends `zones` + `meta.zonesVersion`); the
   *    base builders still emit no zone key, so the generator has to be re-run
   *    after any rebuild of district-v1 / d2-v1.
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
  // THE BOUNDS GATE — the one check in this file whose failure is SILENT.
  //
  // `typeof meta.boundsLocalMeters !== "object"` was the whole test, and
  // `typeof null === "object"`, so `boundsLocalMeters: null` and `{}` both
  // walked through the wrong-file guard this function exists to be. What they
  // walk into is DistrictIndex's constructor, which reads
  // `minX/minY - CELL_M` and `ceil((maxX - minX) / CELL_M)` straight out of
  // this object: absent numbers make every cell index NaN, `for (cx = c0x;
  // cx <= c1x; cx++)` never iterates, and the spatial grid is built EMPTY.
  //
  // Measured against the committed maps, sampling the midpoint of every edge —
  // points that are on the carriageway by construction:
  //
  //   district-v1  healthy bounds  323/323 located, 0 on the wrong edge
  //   district-v1  bounds {}         0/323 located, NOTHING thrown
  //   tj-rhr-v1    bounds {}         0/3   located, NOTHING thrown
  //   *            bounds null       raw TypeError from spatial.ts, not from
  //                                  the parser that was asked to vet the file
  //
  // Zero located means the car is off-road on its own street for the whole
  // lesson: no edge, no lane, no `maxspeed`, and every road-referent objective
  // and detector stands down without a word. So the four numbers are checked
  // here, where a bad file is still a file and the error can still name it.
  //
  // ONLY finiteness is checked. An INVERTED box (min/max swapped) was measured
  // too and located 323/323 correctly on district-v1 and 3/3 on tj-rhr-v1 —
  // the insert and the query share `cellOf`, so a negative column count is
  // self-consistent. It is not rejected, because a check nothing can be shown
  // to need is a false failure waiting to happen.
  //
  // Verified across all 210 committed district-v1 documents (content/world +
  // platform/public/world): zero fail this gate.
  const bounds = meta?.boundsLocalMeters as Partial<DistrictBounds> | null | undefined;
  if (!meta || typeof bounds !== "object" || bounds === null) {
    throw new Error("district: missing meta.boundsLocalMeters");
  }
  for (const key of ["minX", "minY", "maxX", "maxY"] as const) {
    const v = bounds[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(
        `district: meta.boundsLocalMeters.${key} must be a finite number (got ${String(v)})`,
      );
    }
  }
  // ZONE-BAN layer (ADR-006 stage 2a): OPTIONAL — absent is plain v1; when
  // present it must at least be an array (wrong-file guard, same bar as the
  // checks above; per-zone tolerance lives at the consumer).
  if (d.zones !== undefined && !Array.isArray(d.zones)) {
    throw new Error("district: zones must be an array when present");
  }
  return raw as District;
}
