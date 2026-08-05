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
  /** The edge is a motorway (MOTORWAY-SEGMENT slice — runtime/district.ts). */
  motorway?: boolean;
  /**
   * Opt this edge into the 4 m curbside PARKING band that
   * `PARKING_LANE_CLASSES` otherwise grants only to arterial classes
   * (founder item FR-21 — see `builders/network.edgeParkingBand` for the
   * measurement and for why this is a per-edge tag and not a class set).
   *
   * A street that carries a procedurally parked row (traffic/TrafficLayer
   * `PARK_CLASSES` — which includes `residential`, `living_street` and
   * `unclassified`) needs the band, or its cars stand on the pavement. Absent
   * ⇒ the class decides, i.e. every map written before the tag is unchanged.
   */
  parkingBand?: boolean;
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
  /**
   * AUTHORED BUILDING KIND. Absent = an ordinary block, byte-identical to
   * every footprint written before this key existed.
   *
   * `"school"` is the училище a school-zone lesson's copy promises. The
   * founder's item 61: „I see only Normal Buildings living/office building no
   * actual school when the question states there should be School … either
   * build schools and put and name them school, or find some solutions." He
   * named both halves — BUILD it and NAME it — so the kind drives three
   * passes: the facade prism paints it in the ochre/cream school palette
   * (builders/buildings.ts), the school pass hangs a «УЧИЛИЩЕ» name board over
   * its street frontage (builders/schools.ts), and the sign pass posts the
   * А19 „Деца" warning triangle on both approaches (builders/props.ts).
   *
   * It is NOT a grading input: the reduced limit still comes from the edge's
   * own `maxspeed` / `zone` tag, exactly as before. A building kind may dress
   * the world; it may never decide a fault.
   */
  kind?: "school";
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
 *  slice adds the curveAdvisory arc span; the motorway-segment slice adds the
 *  emergencyLane curb span; the surface-patch slice adds the waterPatch/
 *  icePatch grip spans consumed by the PHYSICS RIG — runtime/district.ts is
 *  the documented contract; this mirror keeps world-side loads typed). */
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
  /** waterPatch + icePatch only: surface grip inside the span, fraction of
   *  dry (surface-patch slice — runtime/district.ts). */
  patchGripFactor?: number;
  /** waterPatch only: float speed (km/h) the patch bites at/above. */
  aquaplaneAboveKmh?: number;
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

/**
 * Which kind of signal head stands at a placement.
 *
 * `"vehicle"` (the default, and the only value any placement carried before
 * doc 86 L3) is the three-lens head at a junction approach.
 *
 * `"pedestrian"` is the TWO-lens head that stands at the kerb of a signalized
 * `District.crossings` entry and shows the WALKER his phase. It is not a
 * decoration: `sc-pe-jaywalker` teaches „тя пресича на ЧЕРВЕНО за нея", and
 * until this variant existed the student was asked to read a red he could not
 * see anywhere on the map (founder item 29 / ledger L3). The lamp is driven off
 * the SAME signal node the walker's own gate reads — pedestrian green ⇔ vehicle
 * red at that node (traffic/pedestrians.crossingGateOpen) — so the head and the
 * figure crossing under it can never disagree.
 */
export type SignalHeadKind = "vehicle" | "pedestrian";

export interface TrafficLightPlacement extends StaticTransform {
  /**
   * Signal node id — key for WorldRuntime.signalLampState().
   *
   * For a `"pedestrian"` head this is the CROSSING id, which the runtime's
   * SignalController already registers as a signal node of its own
   * (runtime/signals.ts: `district.crossings` with `signalized: true`), grouped
   * on the axis of the edge the crossing sits on. It is deliberately NOT a road
   * node id, so no consumer that reasons about junction nodes (the
   * world-referent signal rule keys on route edge endpoints) can mistake a
   * pedestrian head for the vehicle heads a lesson is graded against.
   */
  nodeId: string;
  /**
   * Compass bearing (district space, 0 = north, clockwise) of travel INTO the
   * junction on the arm this head addresses. The lamp render callback passes
   * it to WorldRuntime.signalLampState so every head lights its OWN approach
   * axis-group — the phase the stop line on that arm grades — instead of the
   * node's single assigned group (doc 62 S1: heads on the cross street showed
   * the player's phase, and pinned rebases lit the wrong arm).
   *
   * On a pedestrian head this is the bearing of the VEHICLE travel the crossing
   * interrupts — the axis whose red is the walker's green.
   */
  approachBearingDeg: number;
  /** Absent = "vehicle", so every placement written before the pedestrian head
   *  existed stays byte-identical (no new key on a junction head). */
  head?: SignalHeadKind;
}

export type SignKind =
  | "stop"
  | "giveWay"
  | "roundabout"
  // -- В26 „Забранено е движението със скорост, по-висока от означената".
  //    ONE face per numeral, because a speed plate that does not state the
  //    limit the reducer grades is worse than no plate at all (doc 86 T4: 83
  //    of 154 scenarios wore a „50" on a 30/40/90/140 street). The faces are
  //    rasterised from content/signs/svg/v26.svg — the SAME law-cited artwork
  //    the theory question shows — with only the numeral swapped, so the В26
  //    in the simulator is the В26 in the exam.
  | "limit20"
  | "limit30"
  | "limit40"
  | "limit50"
  | "limit60"
  | "limit70"
  | "limit80"
  | "limit90"
  | "limit100"
  | "limit110"
  | "limit120"
  | "limit130"
  | "limit140"
  /** В33 „Край на забраната…" — the numeral it LIFTS lives in
   *  SignPlacement.speedKmh (one face per number, bucketed at render time). */
  | "limitEnd"
  // -- SIGN-ASSET drop: zone-driven posts (render-only — grading reads the
  //    District.zones spans, never these placements; builders/zoneSigns.ts).
  | "noOvertaking" // В24 (zones kind noOvertaking)
  | "noStopping" // В27 (zones kind noStopping)
  // -- В28 „Забранено е паркирането". `DistrictZoneKind` has carried
  //    `noParking` since the ban slice landed (its own docstring reads „В24/
  //    В27/В28 bans") and `pk-ban2-v1` authors one — but `ZONE_SIGN_KIND` had
  //    no entry for it, because there was no SignKind to map it to. So the one
  //    В28 span in the world posted NOTHING, while the parking-family lesson
  //    copy names В28 thirty-four times. Rides the В27 plate: the two source
  //    SVGs open with a byte-identical
  //    `<circle cx="100" cy="100" r="88" fill="#0057a8" stroke="#c1121f"
  //    stroke-width="20" data-plate="true"/>` and differ only in the face
  //    (В27's X vs В28's single bar) — the Г2/Г3-on-the-Г12-plate precedent.
  | "noParking" // В28 (zones kind noParking)
  | "slippery" // А15 (zones kinds waterPatch + icePatch)
  | "curve" // А1 (zones kind curveAdvisory — reuses sign_warning_bend.glb)
  | "railGuarded" // А32-style guarded rail warning (railCrossing + guarded)
  | "railUnguarded" // А33-style unguarded rail warning (railCrossing)
  | "railCross" // Андреевски кръст crossbuck at the line
  | "barrier" // striped barrier arm, static down (railCrossing + guarded)
  // -- junction-derived posts: the one-way mouth a driver may not enter, and
  //    its legal twin. NOT zone-driven — the rule lives in
  //    builders/network.onewayNoEntryArms, the same derivation the runtime's
  //    wrongWay grading follows.
  | "noEntry" // В1 „Забранено е влизането на пътни превозни средства"
  | "oneWay" // Д4 „Еднопосочно движение" (the legal mouth of the same arm)
  // -- Г2/Г3 „Движение само надясно / наляво след знака": the POSITIVE half of
  //    the same junction fact. В1 and Д4 both stand ON the cross street and
  //    therefore face along it, so a driver coming up the stem of a T reads
  //    them at 70–86° — a hairline (founder item 47: „there must be sign
  //    stating to go left or right, so we have missing Sign"). The mandatory
  //    plate stands on HIS arm, facing HIM, and states the manoeuvre instead of
  //    the prohibition. Derived, never authored: posted only where the node's
  //    one-way tags leave an incoming arm exactly one legal exit, which is the
  //    same derivation network.onewayNoEntryArms feeds the WRONG_WAY grading
  //    from. Г1 „само направо" has no face in the kit and no map that would
  //    place it, so a forced-straight arm places NOTHING rather than guess.
  | "mandatoryRight" // Г2
  | "mandatoryLeft" // Г3
  // -- previously orphaned kit faces (doc 86 D5): finished GLBs that shipped
  //    with no SignKind, so nothing could ever place them.
  // -- А19 „Деца": the warning triangle a school frontage MUST carry. Same
  //    triangular body as А18 (identical plate polygon in the source art), so
  //    it rides `sign_pedestrian.glb` with the a19.svg face swapped in — the
  //    Г2/Г3-on-the-Г12-plate precedent. Derived from a `kind: "school"`
  //    building, never authored per map.
  | "children" // А19
  | "pedestrianCrossing" // А18 „Пешеходна пътека" (warning, ahead of a zebra)
  | "priorityRoad" // Б3 „Път с предимство" (the жълт ромб on the major arm)
  | "settlement" // Д11 „Начало на населено място"
  | "fuel"; // Е7 „Бензиностанция"

/**
 * Every SignKind, in a fixed order. Single source of truth for the stats
 * record, the renderer's per-kind instanced buckets and the sign batteries —
 * adding a kind must never again require hand-editing a Record literal.
 */
export const SIGN_KINDS: readonly SignKind[] = [
  "stop",
  "giveWay",
  "roundabout",
  "limit20",
  "limit30",
  "limit40",
  "limit50",
  "limit60",
  "limit70",
  "limit80",
  "limit90",
  "limit100",
  "limit110",
  "limit120",
  "limit130",
  "limit140",
  "limitEnd",
  "noOvertaking",
  "noStopping",
  "noParking",
  "slippery",
  "curve",
  "railGuarded",
  "railUnguarded",
  "railCross",
  "barrier",
  "noEntry",
  "oneWay",
  "mandatoryRight",
  "mandatoryLeft",
  "children",
  "pedestrianCrossing",
  "priorityRoad",
  "settlement",
  "fuel",
];

/** Numerals the В26 face set can state. A limit outside this list has NO
 *  truthful face, and the builders must place nothing rather than round it. */
export const SPEED_LIMIT_FACES_KMH: readonly number[] = [
  20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140,
];

const SPEED_LIMIT_KIND_BY_KMH = new Map<number, SignKind>(
  SPEED_LIMIT_FACES_KMH.map((v) => [v, `limit${v}` as SignKind]),
);
const SPEED_LIMIT_KMH_BY_KIND = new Map<SignKind, number>(
  SPEED_LIMIT_FACES_KMH.map((v) => [`limit${v}` as SignKind, v]),
);

/** The В26 kind that STATES `kmh`, or null when the kit has no such face. */
export function speedLimitSignKind(kmh: number | undefined): SignKind | null {
  if (kmh === undefined || !Number.isFinite(kmh)) return null;
  return SPEED_LIMIT_KIND_BY_KMH.get(kmh) ?? null;
}

/** The number a В26 kind states, or null for every non-В26 kind (В33 included
 *  — its numeral is per-placement, in SignPlacement.speedKmh). */
export function signKindSpeedKmh(kind: SignKind): number | null {
  return SPEED_LIMIT_KMH_BY_KIND.get(kind) ?? null;
}

export interface SignPlacement extends StaticTransform {
  kind: SignKind;
  /**
   * The number the face states, when the face has one: the limit for a В26
   * plate (mirrors the kind — carried explicitly so a reader never parses a
   * kind string), and for В33 the limit whose restriction ENDS here.
   */
  speedKmh?: number;
}

/**
 * Which authored tree model renders a placement (streetscape v2 mix).
 *
 * Species must be ones that ACTUALLY grow on a Sofia street: `linden` (липа —
 * the uniform boulevard row) plus the ordinary leafy/ornamental mix. Never a
 * palm: Sofia is humid-continental with snowy winters, so a palm on a Sofia
 * boulevard instantly reads as fake to the 17-year-old this product is for and
 * spends the credibility the whole visual program is buying. `TREE_KINDS`
 * below is the render order and is asserted palm-free by the builder tests.
 */
export type TreeKind = "linden" | "ornamental" | "leafyA" | "leafyB";

/** Every TreeKind, in render order (one instanced draw each). Single source of
 *  truth for the renderer's per-kind buckets and the builder tests. */
export const TREE_KINDS: readonly TreeKind[] = ["linden", "ornamental", "leafyA", "leafyB"];

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

/**
 * One school building, resolved to the things that make it READ as a school
 * from the driving seat (founder item 61 — „either build schools and put and
 * name them school").
 *
 * The BODY is not here: the footprint is already extruded by the ordinary
 * facade-prism pass, which is what makes this additive. What is here is
 * everything that says *училище* rather than *блок*:
 *  - `board` — the name board over the street frontage, carrying `labelBg`;
 *  - `railing` — the yard fence line along the frontage (a school yard in
 *    Bulgaria is fenced; the railing is also what tells a driver the children
 *    beside it are inside a yard and not on his carriageway);
 *  - `gate` — the centre gap in that railing, i.e. where children come OUT.
 *
 * All in world space, base at y = 0.
 */
export interface SchoolPlacement {
  /** District building id this dressing belongs to. */
  buildingId: string;
  /** What the board says. Bulgarian, rendered as text (never an icon). */
  labelBg: string;
  /** Name board: centre of the panel, its facing yaw and its panel size. */
  board: { position: Vec3Tuple; yaw: number; widthM: number; heightM: number };
  /** Yard railing: the frontage line the fence runs along, world space. */
  railing: { from: Vec3Tuple; to: Vec3Tuple; heightM: number; gateHalfM: number };
  /** Centre of the gate gap (where the children stand), world space. */
  gate: Vec3Tuple;
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
  /** Batched road decals (one quad each; the whole batch is ONE draw call).
   *  Ribbon pass + junction pass — `roadDecals * 4` is the batch's vertex
   *  count, which several district suites assert against the buffer. */
  roadDecals: number;
  /** How many of `roadDecals` sit INSIDE junction patches (doc 82 V4). Before
   *  V4 this was structurally 0: ribbons are trimmed to the approach cuts, so
   *  the busiest asphalt in the world carried no wear at all. */
  junctionDecals: number;
  /** Standing-water quads over waterPatch spans (aquaplane visibility slice;
   *  icePatch spans stay invisible BY DESIGN — black ice is the lesson). */
  waterDecals: number;
  /** Rail-track deck quads over railCrossing spans (ballast band + sleeper
   *  ties + the two steel rails); 0 on every map without a railCrossing zone. */
  railTrackQuads: number;
  /** Kerbed central islands actually drawn (doc 87 FR-22). Lower than
   *  `roundabouts` exactly when a registration's interior is not free — see
   *  builders/roundabout.ts on why a token disc over a live carriageway is a
   *  worse answer than none. */
  roundaboutIslands: number;
  /** Registered roundabouts on this district, drawn or refused. */
  roundabouts: number;
  /** Dashes of the circular ring lane divider (0 on single-lane rings — there
   *  is no boundary there and inventing one would be a new falsehood). */
  ringDividerQuads: number;
  /** FR-22, the outer half: mouth-free arcs of the ring's OUTER kerb swept as a
   *  circle. 0 means the per-edge junction-trimmed stubs are still standing —
   *  which on a four-arm ring is 2.8 m of kerb per quarter, i.e. not a circle. */
  ringKerbRuns: number;
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
  /** Glossy standing-water sheets over the waterPatch zone spans, merged into
   *  ONE mesh (builders/waterDecals.ts). Empty on every map without live
   *  water spans — the additive/bit-identity contract. */
  waterDecals: MeshData;
  /** Railway level-crossing track deck over every railCrossing zone span
   *  (builders/railTrack.ts): `deck` = the dark ballast band + sleeper ties
   *  (vertex-coloured, matte), `rails` = the two raised steel rails running
   *  across the carriageway (metallic). BOTH empty on every map without a
   *  railCrossing zone — the additive/bit-identity contract. */
  railTracks: { deck: MeshData; rails: MeshData };
  /** Open ground (grass): parks, verges, district edges. Subtle off-road relief. */
  terrain: MeshData;
  /** Paved ground (concrete): courtyards/parking in the built-up fabric.
   *  Co-planar with `terrain`, shares its vertex positions so there are no seams. */
  terrainPaved: MeshData;
  /**
   * PLANTED CROWNS of the roundabout central islands: the mounded earth inside
   * the kerb plus its shrubs (builders/roundabout.ts). Empty on every district
   * without a drawn ring, so those maps add no mesh and no draw call.
   *
   * Its OWN mesh rather than part of `terrain`: the terrain contract holds
   * every ground vertex at or below 0.3 m so relief never pokes through the
   * flat physics plane you drive on, and a central island is furniture that
   * must stand ABOVE that. The kerb itself is not here — it lives in
   * `sidewalks`, which is also the collider, so a car cannot mount the island.
   */
  roundaboutIslands: MeshData;
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
  /** Name boards + railings of every `kind: "school"` building (schools.ts).
   *  Empty on every district that authors no school — the additive contract. */
  schools: SchoolPlacement[];
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
