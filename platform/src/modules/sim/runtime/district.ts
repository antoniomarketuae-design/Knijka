/**
 * sim/runtime — district-v1.json types + parser.
 *
 * Mirrors the contract documented in docs/simulation/17_WORLD_GENERATION_AND_MAP_SYSTEM.md
 * (§3 "Data format"). Only the fields the runtime consumes are typed; the file
 * may carry more (buildings, meta provenance) which we pass through untouched.
 * Coordinates are local meters: x = east, y = north, around meta.center.
 */

import { TERRAIN_MARGIN_M } from "../world/builders/constants";

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

// ---------------------------------------------------------------------------
// THE DISTRICT'S EDGE — where the authored world stops existing.
//
// A district-v1 document declares `meta.boundsLocalMeters` and nothing else
// about its own extent, and every consumer that needs "how big is this world"
// re-derives it privately from those four numbers:
//
//   world/builders/terrain.ts   ground quad     = bounds ± TERRAIN_MARGIN_M
//   world/builders/props.ts     prop keep-in    = bounds ± TERRAIN_MARGIN_M ∓ inset
//   runtime/spatial.ts          uniform grid    = bounds − CELL_M, cols from the span
//   runtime/minimap.ts          the drawn frame = bounds verbatim
//
// So the COLLIDABLE, DRAWN world is exactly `bounds ± TERRAIN_MARGIN_M` and not
// one metre more. (`environment/groundBackdropShader.ts` continues it VISUALLY
// with a 480 m camera-following disc — one draw call, no colliders, no props,
// no road. That disc is the "featureless grey/green plane" in the audit
// frames: it is the horizon, not the world.)
//
// ── WHAT MARKS THAT LINE, since 2026-08-27 ─────────────────────────────────
//
// This block used to open „NOTHING MARKS THAT LINE, and nothing can, because
// until this block existed no module could name it", and close by saying it
// „draws nothing and ends nothing" because the consumers were another lane's.
// Half of that is now out of date and is struck rather than left standing.
//
// `world/builders/worldRim.ts` belts every AUTHORED MICRO-MAP — the 102
// `scenario-*` documents and `poligon-v1`, all 103 that declare a `meta.mapKind`
// — with a contiguous row of building masses just inside this rectangle. It is
// built through the same `extraVolumes` seam as the terminus closure, so it
// costs no draw call and its walls are in `colliders.buildings`: a student who
// drives off the carriageway now meets a city edge instead of an empty plane,
// and cannot pass it. Its near face stands 37–43 m past the declared bounds,
// i.e. `worldEdgeClearanceM` reads 17–23 m where the wall is — so
// WORLD_EDGE_WARN_M below fires 12–18 m before a car reaches it, and the wall
// itself is visible from anywhere on the map, which is the part a card cannot
// do. The census that follows is unchanged and is what SIZED that belt.
//
// TWO THINGS IT DELIBERATELY DOES NOT DO, so this block is not read as more
// than it says. It does not move this rectangle: the GROUND still ends at
// `bounds ± TERRAIN_MARGIN_M` and every number below still stands. And it is
// not built on `district-v1` / `d2-v1` — those two are Sofia under an ODbL
// notice and their box is a cut through a city whose streets genuinely
// continue, so they keep the defect and a city edge stays an open question
// (`worldRim.ts`'s gate carries the reasoning).
//
// MEASURED over all 105 committed district-v1 documents
// in content/world, taking the closest any drivable centreline comes to it:
//
//   64 districts   60.000 m   — the declared box IS the network's bounding box,
//                               so the margin is the whole of the world past
//                               the last road (every t-junction, x-junction,
//                               car-park and полигон map is in this bucket)
//   41 districts   66.000 – 78.125 m
//   worst case     78.125 m   (pe-clear-v1)
//
// A learner therefore reaches the end of the authored world 60–78 m past the
// last road on EVERY map in the product. `tj-rhr-v1` (sc-junction-rhr) and
// `tj-stop-v1` (sc-junction-stop) and `tj-scan-v1` (sc-junction-scan) are the
// cheapest example:
// their T-junction node `tj-n-c` sits at (0, 0) and the box's `maxY` IS 0, so
// the graded junction is 60 m from the rim, in the direction a student who does
// not turn drives.
//
// THAT NUMBER IS MEASURED FROM THE COMMITTED DOCUMENTS AND STANDS ON ITS OWN,
// which is as well, because no drive in the tree can carry it. The void frames
// these findings were filed from —
// `.audit-frames/proof/frames/sc-junction-rhr__pc-right/04-t070s.png`, the car
// at 6 км/ч on a featureless plane with the junction only in the mirror, and
// 04-t202s.png, the same void 132 s later at 0 км/ч with «Завий наляво и излез
// от кръстовището на запад» still on the glass and the task chip still reading
// ЗАДАЧА 2/2 — come from a drive its OWN run.log marks BLIND: the guidance
// ribbon was visible on 63 of 137 moving samples (46%, against a 50% floor),
// and the log says it in terms — «THIS DRIVE WAS NOT STEERED … Treat it as an
// unsteered drive.» BOTH pc-right drives of this lesson (proof/, rebase/) carry
// that banner, and the only tracked drive on this map,
// proof/frames/sc-junction-rhr__mobile-right (ribbon 23/23, straightness
// 0.967), travelled 96.5 m from a spawn 105 m south of the junction — it never
// reached the rim, so it cannot photograph the void either way. Nor can
// `sc-junction-gap:75918e40` (~80 s at 58–65 км/ч for 216 наказателни точки):
// that drive predates the steering work and its log carries no TRACKING line at
// all.
//
// So the geometry above is this block's evidence, and a STEERED drive that
// photographs the rim is still owed. What a steered drive cannot change is the
// document: `maxY` IS 0 and the graded node IS at (0, 0) on all three maps.
//
// WHAT THIS BLOCK IS AND IS NOT. It is the MEASURE — the one place that answers
// "how much authored world is left in front of this car", so the drawn barrier,
// the instructor's warning and the ending gate all read the same number instead
// of each re-deriving it. It still draws nothing itself: the barrier is
// `world/builders/worldRim.ts` (above) and the warning is
// `components/sim/lesson-ui/LessonPlayShell.tsx`, which consumes
// `worldEdgeWarning` at the tick. IT STILL ENDS NOTHING — no lesson terminates
// on a clearance, and a car that stops against the belt is simply a car that
// has stopped. That consumer is `lessons/finish.ts`, which this lane does not
// own, and it is not written.
//
// ONE STRING GOES STALE WITH THIS AND IS NOT THIS FILE'S TO FIX. The rim card
// LessonPlayShell puts on the glass says «Оттук нататък няма нито път, нито
// сграда — теренът просто свършва.» On the 103 belted maps there is now a
// сграда, and the copy should say so — it is a virtual instructor's sentence
// (THEO-4) and it is currently telling the student something the windscreen
// contradicts. Routed, not edited.
// ---------------------------------------------------------------------------

/**
 * The rectangle past which the district has no ground, no props and no road.
 *
 * The declared box padded by `TERRAIN_MARGIN_M` — the SAME constant the ground
 * quad is built from, imported rather than mirrored so the two cannot drift
 * (`world/builders/terrain.ts` `buildTerrain`, which is where this rectangle
 * physically comes from).
 *
 * NORMALISED, and deliberately. `parseDistrict` accepts an INVERTED box on a
 * measurement — the spatial index shares one `cellOf` between insert and query,
 * so a negative column count is self-consistent and locates 323/323. Padding an
 * inverted box literally would produce a rectangle with negative span, on which
 * every pose in the world reads as outside — a false alarm on a document the
 * parser has already ruled harmless. So min/max are ordered first.
 */
export function districtWorldEdge(district: District): DistrictBounds {
  const b = district.meta.boundsLocalMeters;
  return {
    minX: Math.min(b.minX, b.maxX) - TERRAIN_MARGIN_M,
    minY: Math.min(b.minY, b.maxY) - TERRAIN_MARGIN_M,
    maxX: Math.max(b.minX, b.maxX) + TERRAIN_MARGIN_M,
    maxY: Math.max(b.minY, b.maxY) + TERRAIN_MARGIN_M,
  };
}

/**
 * Signed clearance of a pose against `districtWorldEdge`, meters.
 *
 *   > 0  INSIDE  — metres of authored world left before the nearest rim
 *   = 0           — on the rim
 *   < 0  OUTSIDE — metres already past it (Euclidean, so a corner overshoot is
 *                  not under-reported the way a per-axis test would)
 *
 * ONE SIGNED NUMBER RATHER THAN AN `isOutside` PREDICATE, because the three
 * things this defect needs are three different thresholds on the same measure
 * and a boolean can only serve the last of them: a fence/treeline is drawn at a
 * fixed inset from the rim, a virtual instructor has to speak BEFORE the rim is
 * crossed (THEO-4 — a student who is told only after he is in the void is told
 * a verdict, not a reason), and an ending fires some distance past it. Two of
 * those three are positive-side questions that no "am I out?" flag can answer.
 *
 * It is NOT the off-network test. `SimTick.edgeId === null` (locator.ts,
 * OFF_ROAD_DISTANCE_M = 30 m) says "no centreline within 30 m" — a car on the
 * verge of its own street, which is a driving fault. This says "there is no
 * more world", which is not a driving fault at all and must never be graded as
 * one. A car can be off-network with 200 m of clearance (the полигон), and — on
 * a wide arterial's kerbside parking band, where the measured headroom is
 * 0.645 m — on-network with clearance to spare. The two channels answer
 * different questions and neither substitutes for the other.
 */
export function worldEdgeClearanceM(district: District, x: number, y: number): number {
  const e = districtWorldEdge(district);
  const dx = Math.max(e.minX - x, x - e.maxX);
  const dy = Math.max(e.minY - y, y - e.maxY);
  // Inside on both axes: the clearance is the distance to the NEAREST side.
  // `+ 0` normalises the exactly-on-the-rim case, where negating a zero yields
  // -0: a consumer comparing with Object.is / JSON-round-tripping the number
  // would otherwise see a rim reading that is neither inside nor outside.
  if (dx <= 0 && dy <= 0) return -Math.max(dx, dy) + 0;
  return -Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/**
 * HOW CLOSE TO THE RIM IS CLOSE ENOUGH TO SAY SOMETHING — and the two numbers
 * are chosen from the census in the block above, not from taste.
 *
 * That census measured all 105 committed districts: 64 declare a box that IS
 * the road network's bounding box, so the whole margin is TERRAIN_MARGIN_M
 * (60.000 m) of authored-but-roadless ground; the other 41 run 66.000–78.125 m.
 * A clearance of 35 m therefore means the car is at least 25 m BEYOND the last
 * road on the tightest map in the product, and further on every other one. It
 * cannot fire on a student who is still on the taught route, which matters more
 * than firing early: this programme's standing crime is the false alarm.
 *
 * RE-ARM IS HIGHER THAN WARN, deliberately. A single threshold on a car
 * wandering along the rim re-fires every time the number crosses it, and a
 * warning that repeats is a warning that gets ignored. 50 m is far enough back
 * that the student has demonstrably returned toward the world, not merely
 * jittered.
 */
export const WORLD_EDGE_WARN_M = 35;
export const WORLD_EDGE_REARM_M = 50;

/**
 * Edge-triggered: has the car just entered the rim band?
 *
 * `armed` is the caller's latch — true when a warning is available to fire.
 * Returns the NEXT latch state and whether to speak now, so the caller keeps no
 * rule of its own and two consumers cannot drift apart.
 *
 * NaN IS NEVER A WARNING, the same ruling the touch-hint and controls-legend
 * lifetimes carry: a clearance that cannot be read is not evidence the student
 * has left the world, and an unreadable number must not be able to put a card
 * on the glass. It leaves the latch exactly as it found it.
 */
export function worldEdgeWarning(
  clearanceM: number,
  armed: boolean,
): { armed: boolean; speak: boolean } {
  if (!Number.isFinite(clearanceM)) return { armed, speak: false };
  if (armed && clearanceM <= WORLD_EDGE_WARN_M) return { armed: false, speak: true };
  if (!armed && clearanceM >= WORLD_EDGE_REARM_M) return { armed: true, speak: false };
  return { armed, speak: false };
}

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
