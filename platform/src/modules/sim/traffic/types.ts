/**
 * sim/traffic — public types.
 *
 * Scripted, deterministic ambient traffic: vehicle agents that follow
 * precomputed loops through the district road graph, and pedestrians that
 * walk sidewalk loops and use crossings. NOT a traffic AI — no planning, no
 * personalities, no lane changes (v1 scope: docs/simulation/15).
 *
 * All positions are district space (x = east, y = north, meters) — the same
 * frame as district-v1.json and `VehicleSample` in ../contracts. The
 * presentation layer maps (x, y) -> three.js (x, -z), y-up.
 */

import type { Obb2D } from "../collision";
import { PERCEPTUAL_ROAD_SCALE, type SignalPhase } from "../contracts";

// ---------------------------------------------------------------------------
// District input — structural subset of content/world/district-v1.json.
// The traffic system takes the parsed JSON; these types name only the fields
// it reads, so the real file and small test fixtures both satisfy them.
// ---------------------------------------------------------------------------

export interface DistrictNode {
  id: string;
  x: number;
  y: number;
}

export interface DistrictEdge {
  id: string;
  from: string;
  to: string;
  class: string;
  oneway: boolean;
  roundabout: boolean;
  lanes: number;
  maxspeed: number;
  length: number;
  /** Polyline [x, y][] from `from` to `to`, endpoints matching the nodes. */
  geometry: number[][];
  /**
   * Which kerb the procedural parked row stands on (doc 87 B50/B53/B54).
   * Absent ⇒ `"right"`, the pre-tag walk. See `TrafficLayer.parkedSideOf` for
   * the measurement that made it necessary. `parkingBand: false` still wins.
   */
  parkingSide?: "left" | "right" | "both";
  /**
   * WHAT KIND of vehicle stands at this kerb (doc 87 B50/B53/B54) — one of
   * `TrafficLayer.PARKED_MIXES` (`freight` | `compact` | `veteran`). Absent ⇒
   * the unbiased parked pool, i.e. every district written before this tag is
   * byte-identical. It selects among the SAME bodies at the SAME stations; it
   * never adds, removes or moves one.
   */
  parkingMix?: string;
  /** Curbside parking-band opt-in, mirrored from world/types (the curb pass
   *  reads it through `parkingOptedOut`). */
  parkingBand?: boolean;
}

export interface DistrictIntersection {
  id: string;
  x: number;
  y: number;
  degree: number;
  signalized: boolean;
}

export interface DistrictCrossing {
  id: string;
  x: number;
  y: number;
  kind: string;
  signalized: boolean;
  edgeId: string;
}

/** A stopping/parking ban span, as `District.zones` carries it (ADR-006 stage
 *  2a). The traffic system ignores these; the PARKED-CAR curb pass honours the
 *  stopping bans, so a В27 post is a fact about the street and not a decal (see
 *  TrafficLayer.computeParkedCars). Absent on every district written before. */
export interface TrafficDistrictZone {
  id: string;
  kind: string;
  edgeId: string;
  fromM: number;
  toM: number;
}

/** The slice of district-v1.json the traffic system consumes. */
export interface TrafficDistrict {
  roads: { nodes: DistrictNode[]; edges: DistrictEdge[] };
  intersections: DistrictIntersection[];
  crossings: DistrictCrossing[];
  zones?: TrafficDistrictZone[];
  /**
   * The district's own name (`meta.district` in the shipped file). The ONLY
   * thing the traffic layer reads it for is `TrafficLayer.districtParkedSalt`
   * — the parked row's model and paint. Without it two maps whose parked
   * segment lands on the same edge index get the same three cars in the same
   * order, which is measurable and was photographed on the PE family. Optional
   * so the small in-test fixtures stay valid; absent ⇒ the pre-salt look.
   */
  meta?: { district?: string };
}

// ---------------------------------------------------------------------------
// Agent state — read every frame by the presentation layer. The objects are
// allocated once at init and mutated in place (perf budget: zero per-frame
// allocations in the update path).
// ---------------------------------------------------------------------------

/**
 * Vehicle size/type profile (doc 72 §9 FO-06 — the large-vehicle actor
 * unlock). Data + presentation only: "van" renders the panel-van rig,
 * "truck" the box-truck rig (longer / wider / taller than any car — the
 * vision-blocking lead of „Зад камион"); "emergency" (doc 72 §15 N9, VU-09)
 * renders the procedural white special-regime rig with the blue light bar;
 * "tram" (doc 72 §12 RX-04/RX-05, ADR-006 stage 3b) renders the procedural
 * two-segment articulated tram rig (~14 m, pantograph hint) — a tram is a
 * PATH-LOCKED staged vehicle like every other actor; its "track" IS its
 * authored polyline (street-running rails share the traffic lane — no
 * separate rail physics exists, honestly); "bus" (doc 72 §15 VU-11 „Автобусът
 * потегля от спирката", ЗДвП чл. 67) renders the procedural CITY BUS rig — a
 * 12 m GLAZED passenger body with a route board and curb-side doors, which is
 * the whole point of its existence: чл. 67 is a duty owed to a ППС ОТ РЕДОВНА
 * ЛИНИЯ and nothing else, so a student who cannot tell a bus from a lorry at a
 * спирка cannot know the duty is armed. The box-truck rig is a windowless
 * cargo body and was standing in for it; "train" (RX-02/RX-01 „жп прелез")
 * renders the procedural MULTI-UNIT train rig (a locomotive + 2 cars, ~34 m)
 * that CROSSES the carriageway on an authored PERPENDICULAR rail polyline
 * (StagedVehicleSpec.railPath) over the rendered rail deck — same path-locked
 * point-geometry honesty; "cyclist" / "childCyclist" render
 * the procedural BICYCLE + RIDER rigs (adult / child size — the „дете с
 * колело" actor), closing audit C3's RENDER half: the v1 cyclist stays a
 * narrow curb-riding vehicle-agent for grading (the extraRightOffsetM tag and
 * every query are untouched), it just no longer wears a car body. All
 * liveries fictional (ADR-001 — no real insignia). Absent = "car" = the
 * pre-profile deterministic fleet
 * pick, byte-identical. HONEST LIMIT, corrected: the conflict/right-of-way
 * queries are still POINT-BASED around the vehicle center, but the LENGTH is
 * no longer cosmetic — since audit O31 the two tables below size the exact-OBB
 * contact box (collision/bodies.ts) and the kinematic shell rapier binds, and
 * `system.ts bumperSubtrahendM` subtracts the actor's own half-length from
 * every lead gap. So authoring a profile is a GRADING act: a 12 m bus really
 * does put its rear bumper 2.25 m closer than the 7.5 m box truck did.
 */
export type VehicleProfile =
  | "car"
  | "van"
  | "truck"
  | "bus"
  | "emergency"
  | "tram"
  | "train"
  | "cyclist"
  | "childCyclist"
  | "animal";

/**
 * Turn-indicator state of a vehicle (founder review item 43/44, ledger L6).
 *
 * Before this channel existed the renderer INFERRED the blinker from yaw rate
 * (`|steer| > 0.07`), and a staged `laneShift` is a lateral GLIDE whose heading
 * barely turns: an 8.125 m shift over 1.5 s at 11 m/s peaks the smoothed steer
 * at 0.0624 — under the arming threshold — so a cut-in NEVER signalled. The
 * founder could not anticipate the merge because the car genuinely never
 * signalled. This is now an explicit, commanded channel: staged actors publish
 * what they are ACTUALLY indicating, and the renderer reads it instead of
 * guessing. Ambient agents never set it (they never change lanes).
 */
export type VehicleIndicator = "left" | "right" | "off";

export interface TrafficVehicleState {
  id: number;
  /** Rear-to-front center of the car, district space. */
  x: number;
  y: number;
  /** Unit travel direction, district space. */
  dirX: number;
  dirY: number;
  speedMps: number;
  /** True while decelerating or held at a stop — drives brake lights. */
  braking: boolean;
  /** Body color variant index (presentation palette). */
  colorIndex: number;
  /** Size/type profile (staged actors only today). Absent = "car". */
  profile?: VehicleProfile;
  /**
   * Commanded turn indicator (staged actors only — see VehicleIndicator).
   * Absent on every ambient agent, so the pre-indicator published shape is
   * byte-identical for them; staged vehicles always publish it (default
   * "off"). The presentation layer MUST prefer this over any yaw-rate guess.
   */
  indicator?: VehicleIndicator;
}

/**
 * Body length of each vehicle profile, m — the SAME numbers the rigs are
 * modelled at (vehicleFleet.ts: TRUCK_DIMENSIONS 7.5, EMERGENCY 5.6, TRAM 14,
 * TRAIN_LENGTH_M 34.4). "car" keeps the historical 4.1 m fleet approximation
 * so every car-lead gap is byte-identical to the pre-profile constant.
 *
 * Used by the lead/rear gap queries: a following gap is bumper-to-bumper, so
 * the metres between two CENTRES must lose half of each body. Grading a 14 m
 * tram or a 34 m train as if it were a 4.1 m hatchback told the student they
 * had 10 more metres of road than exist — the ledger's T17(e).
 */
export const VEHICLE_PROFILE_LENGTH_M: Readonly<Record<VehicleProfile, number>> = {
  car: 4.1,
  van: 5.2,
  truck: 7.5,
  // 12 m is not a taste: it is the number sc-merge-bus-pullout's own copy
  // teaches out loud («Автобусът е дълъг 12 метра и завива с целия си корпус»)
  // and the standard rigid city-bus length BUS_DIMENSIONS is modelled at. It
  // was 7.5 while the drill borrowed the box-truck rig, i.e. the lesson said
  // twelve and the grader believed seven and a half.
  bus: 12,
  emergency: 5.6,
  tram: 14,
  train: 34.4,
  cyclist: 1.8,
  childCyclist: 1.5,
  animal: 1.4,
};

/**
 * Body WIDTH of each vehicle profile, m — the missing half of the table above,
 * and the reason a circle could ever be mistaken for a contact test.
 *
 * MEASURED, not assumed. The procedural rigs are read straight off
 * vehicleFleet.ts (TRUCK_DIMENSIONS.widthM 2.4, EMERGENCY 2.1, TRAM 2.3, TRAIN
 * 3.9, BICYCLE_DIMENSIONS.halfWidthM × 2 = 0.46, × CHILD_CYCLIST_SCALE 0.72 =
 * 0.331, ANIMAL_DIMENSIONS.halfWidthM × 2 = 0.56) and
 * collision/__tests__/bodies.test.ts asserts every one of them against the rig
 * constants, so a rig resize cannot silently outrun the grader.
 *
 * The two GLB-backed entries were measured from the shipped kit's own POSITION
 * accessors (body node, wheels excluded):
 *   · "car" 1.84 — the fleet body x-extents run 1.78 (vela_h3) to 1.83
 *     (corva_s); 1.84 is ALSO the width of the kinematic shell the player
 *     actually collides with in rapier (NpcColliders VEH_HALF_W 0.92 × 2), and
 *     a grading test that disagreed with the physics body would re-open the
 *     same false-verdict gap from the other side.
 *   · "van" 1.98 — kargo_v's body node measures 1.98 × 5.34; the length table
 *     above declares 5.2 for the same rig. Left alone deliberately: that number
 *     feeds every lead-gap grade and moving it is a grading change, not a
 *     geometry fix. Recorded here so the discrepancy is known, not lost.
 */
export const VEHICLE_PROFILE_WIDTH_M: Readonly<Record<VehicleProfile, number>> = {
  car: 1.84,
  van: 1.98,
  truck: 2.4,
  bus: 2.55, // BUS_DIMENSIONS.widthM — wider than the box truck's 2.4
  emergency: 2.1,
  tram: 2.3,
  train: 3.9,
  cyclist: 0.46,
  childCyclist: 0.331,
  animal: 0.56,
};

/** Half-length of the player's own car, m (half the 4.1 m fleet length). */
export const PLAYER_HALF_LENGTH_M = VEHICLE_PROFILE_LENGTH_M.car / 2;

/** Half-length of a published vehicle state, m. Absent profile = "car". */
export function vehicleHalfLengthM(profile?: VehicleProfile): number {
  return (VEHICLE_PROFILE_LENGTH_M[profile ?? "car"] ?? VEHICLE_PROFILE_LENGTH_M.car) / 2;
}

/** Half-width of a published vehicle state, m. Absent profile = "car". */
export function vehicleHalfWidthM(profile?: VehicleProfile): number {
  return (VEHICLE_PROFILE_WIDTH_M[profile ?? "car"] ?? VEHICLE_PROFILE_WIDTH_M.car) / 2;
}

/**
 * Presentation pose override for a STANDING pedestrian figure (staged actors
 * only today — doc 72 VP-11/JU-18): "stopSignal" renders one arm raised,
 * "directTraffic" one arm extended horizontally (the регулировчик gesture) —
 * both with hi-vis clothing (fictional officer figures, ADR-001 — no real
 * insignia). Visual only: no query or detector reads it.
 */
export type PedestrianPose = "stopSignal" | "directTraffic";

/**
 * Presentation BODY VARIANT for a pedestrian figure (staged actors only today
 * — founder R3 #25–28, doc 62 P6 „better NPC actors where the actor IS the
 * lesson"): "child" renders the small rig (~0.72 scale, bigger head ratio —
 * the CHILD_CYCLIST_SCALE precedent, vehicleFleet.ts), "elder" the slightly
 * stooped rig carrying the WHITE CANE (PE-14 „Пешеходец с бял бастун" — the
 * cane IS the recognition cue the drill teaches). Visual only: no query,
 * detector or update-path branch reads it; the walk/crossing machinery is
 * byte-identical with or without it.
 */
export type PedestrianVariant = "child" | "elder";

export interface TrafficPedestrianState {
  id: number;
  x: number;
  y: number;
  /** Unit facing direction, district space. */
  dirX: number;
  dirY: number;
  speedMps: number;
  /** Accumulated walk-cycle phase (radians) for the bob animation. */
  walkPhase: number;
  /** True while the pedestrian is on the roadway span of a crossing. */
  onCrossing: boolean;
  colorIndex: number;
  /** Standing pose override (see PedestrianPose). Absent = the normal
   *  walk/stand rig — ambient pedestrians publish the exact pre-pose shape. */
  pose?: PedestrianPose;
  /** Body variant (see PedestrianVariant). Absent = the adult rig — ambient
   *  pedestrians publish the exact pre-variant state shape. */
  variant?: PedestrianVariant;
}

/**
 * N1 (doc 72 JU-10) — one oncoming vehicle's approach telemetry, as returned
 * by TrafficSystem.oncomingNear. `closingMps` is the vehicle's speed component
 * toward the query point (its own motion only — the gap a WAITING driver
 * reads); time-to-arrival ≈ distM / closingMps. Structurally satisfies the
 * runtime's OncomingConflict (the query seam stays runtime-typed).
 */
export interface OncomingApproach {
  /** Center-to-center distance to the query point, m. */
  distM: number;
  /** Speed component toward the query point, m/s — can be ~0 for a mover
   * sliding past obliquely (the runtime's closing floor treats those as
   * making no arrival claim). */
  closingMps: number;
  /** The vehicle's own speed, m/s (>= the moving-conflict floor). */
  speedMps: number;
}

/**
 * VU-02 (doc 72 „Тясно изпреварване на колело") — one same-direction CYCLIST
 * PROXY's live pose, as returned by TrafficSystem.cyclistNear. The v1 cyclist
 * IS a narrow staged vehicle-agent riding the curb (audit C3; tagged by
 * `extraRightOffsetM > 0` at stage time — the vehicleCollisionKind marker,
 * reused), so the query surfaces only those states, same-direction filtered:
 * an ONCOMING cyclist is a different duty (meeting, not passing) and never
 * returns. Point telemetry only (the VehicleProfile point-geometry law): the
 * runtime's lateral-clearance tracker owns the half-width honesty.
 */
export interface CyclistApproach {
  /** Proxy center, district space. */
  x: number;
  y: number;
  /** Unit travel direction, district space. */
  dirX: number;
  dirY: number;
  /** The proxy's own speed, m/s. */
  speedMps: number;
}

// ---------------------------------------------------------------------------
// Update context — what the integrator feeds the system each frame.
// ---------------------------------------------------------------------------

/** Same signature as WorldRuntime.signalPhase (../contracts). */
export type SignalPhaseFn = (signalNodeId: string) => SignalPhase;

export interface TrafficUpdateContext {
  /**
   * Phase lookup for signal node ids. The traffic system queries it with
   * signalized intersection node ids from district `intersections[]`
   * (vehicles) and with the signal node mapped to a signalized crossing
   * (pedestrians). Unknown ids should return a sane default ("green" keeps
   * traffic flowing; "red" holds it).
   */
  signalPhase: SignalPhaseFn;
  /** Player vehicle position, district space. null = no player in world. */
  playerPos: { x: number; y: number } | null;
  /** Player speed; used by pedestrian gap logic. Missing = assume moving. */
  playerSpeedKmh?: number;
  /** Player heading (0 = north, cw). Lets agents follow a moving player. */
  playerHeadingDeg?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TrafficConfig {
  /** Master seed — same seed + same dt sequence = identical playback. */
  seed: number;
  vehicleCount: number;
  pedestrianCount: number;
  /**
   * Ambient PAVEMENT walkers — people on the footway who never step onto the
   * carriageway. See the „SIDEWALK-ONLY WALKERS" block in `pedestrians.ts` for
   * the four rows this closes and, more importantly, for why raising
   * `pedestrianCount` instead would have spawned nobody: 84 of the 105
   * committed districts declare zero crossings, and every crossing walker is
   * anchored on one.
   *
   * DEFAULT 0, DELIBERATELY, and it is the one thing about this field that
   * must not change casually. Every recorded trace, every clip-capture feed
   * and ~50 unit fixtures build their traffic system through this same config;
   * a non-zero default would put people into all of them at once and break the
   * recorded-trace byte-identity contract. The LIVE lesson path
   * (`components/sim/LessonScene`) is the only caller that passes a number.
   */
  sidewalkPedestrianCount: number;
  laneWidthM: number;
  /** Road classes vehicle routes never use (parking aisles look wrong). */
  excludedRoadClasses: string[];
  /**
   * Road classes that carry no footway, so no ambient pavement walker is ever
   * seeded on them. A motorway with people on the verge is a worse lie than a
   * motorway with nobody on it — `sc-mw-emergency-lane` and
   * `sc-fo-motorway-gap` both drive `mw-v1`, which is `motorway` end to end.
   */
  footwaylessRoadClasses: string[];
  /** Concentrate traffic near this district point (usually the player spawn)
   *  so agents are visible where the driver actually is. Omit to scatter
   *  routes across the whole district (legacy behaviour). */
  anchor?: { x: number; y: number };
  /** Seed routes + pedestrians within this radius of `anchor`, meters. */
  anchorRadiusM?: number;
  /**
   * FURTHER anchor stations along the lesson's own route, in route order — for
   * a lesson that TRAVELS, where one point cannot describe where the driver
   * will be. Vehicle loops are dealt evenly across `[anchor, ...anchorPath]`
   * instead of all being seeded at the spawn; see the `RoutePreference` block
   * in `routes.ts` for the measurement that made this necessary.
   *
   * Absent (every caller but the live lesson scene) ⇒ one station ⇒ routes are
   * bit-identical to before. Pedestrians ignore it: they are anchored on
   * crossings and pavements, which the corridor does not re-sort.
   */
  anchorPath?: readonly { x: number; y: number }[];

  // Vehicle behavior (IDM-lite)
  /** Gentle acceleration, m/s^2. */
  accelMps2: number;
  /** Comfortable deceleration, m/s^2. */
  comfortDecelMps2: number;
  /** Emergency deceleration cap, m/s^2. */
  hardDecelMps2: number;
  /** Standstill gap to the obstacle ahead, meters. */
  minGapM: number;
  /** Desired time headway to the leader, seconds. */
  headwaySec: number;
  /** Absolute speed cap regardless of edge maxspeed, m/s. */
  maxSpeedMps: number;
  /** Stop-line distance before a signalized node center, meters. FLOOR —
   *  raised per junction to the drawn junction mouth (vehicles.ts). */
  signalStopOffsetM: number;
  /** Stop distance before an occupied pedestrian crossing, meters. */
  crossingStopOffsetM: number;
  /** Lookahead horizon for stop constraints, meters. */
  lookaheadM: number;
  /** Lateral half-width for treating the player as in-lane, meters. */
  playerLateralM: number;

  // Pedestrians
  pedSpeedMps: number;
  /** Wait at the curb before checking the crossing gate: base + jitter. */
  pedWaitMinSec: number;
  pedWaitMaxSec: number;
  /** Unsignalized gate: min time-to-arrival of any vehicle, seconds. */
  pedGapSec: number;
  /** Unsignalized gate: keep-out radius around a moving player, meters. */
  pedPlayerGapM: number;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = {
  seed: 1,
  vehicleCount: 10,
  pedestrianCount: 8,
  // 0 — see the field's own comment. The live scene opts in; nothing else does.
  sidewalkPedestrianCount: 0,
  // MUST match the world/runtime lane width (3.25 m × perceptual road scale)
  // or NPC lane centers drift off the painted lanes.
  laneWidthM: 3.25 * PERCEPTUAL_ROAD_SCALE,
  excludedRoadClasses: ["service"],
  footwaylessRoadClasses: ["motorway", "motorway_link", "trunk", "trunk_link", "service"],

  accelMps2: 1.8,
  comfortDecelMps2: 2.2,
  hardDecelMps2: 5.5,
  minGapM: 2.0,
  headwaySec: 1.4,
  maxSpeedMps: 50 / 3.6,
  // Stop-offset FLOORS — vehicles.ts raises both to the junction mouth
  // (nodeOpenRadiusM) per node so NPCs never halt inside the scaled junction.
  signalStopOffsetM: 18,
  crossingStopOffsetM: 8,
  lookaheadM: 60,
  // Half the scaled lane (~4.1 m) + car half-width: a player anywhere in the
  // NPC's lane must register, an adjacent-lane car (8.1 m off) must not.
  playerLateralM: 5.0,

  pedSpeedMps: 1.25,
  pedWaitMinSec: 1.0,
  pedWaitMaxSec: 2.0,
  pedGapSec: 3.0,
  pedPlayerGapM: 22,
};

// ---------------------------------------------------------------------------
// Staged actors (A8 scenario orchestrator) — the NARROW imperative seam.
//
// A staged actor is a scripted agent the orchestrator deploys for ONE
// deterministic encounter: it follows a fixed path (resolved from the lane
// graph for vehicles, an explicit polyline for pedestrians), holds a dormant
// pose until commanded, and executes exactly one behavior command at a time.
// Staged actors publish into the same `vehicles` / `pedestrians` state arrays
// (and crossing occupancy) as ambient agents, so the presentation layer and
// every existing rule-engine query (leadGapMeters, conflictFromRight,
// circulatingConflict, pedestrianOnCrossing, …) see them with zero new
// grading plumbing.
//
// Honest v1 limitations (doc 68 A8):
//  - Staged actors are INVISIBLE to ambient agents (ambient car-following
//    only scans route lanes), so an ambient car may overlap a staged one.
//  - There is no cyclist actor type (audit C3): a "cyclist" is a narrow
//    scripted vehicle-agent rendered with the car fleet.
//  - Scripted actors obey only their script — signals/reservations are the
//    orchestrator's responsibility via timing, not simulated compliance.
// ---------------------------------------------------------------------------

export interface StagedVehicleSpec {
  kind: "vehicle";
  /** Orchestrator handle — unique per session. */
  id: string;
  /**
   * District node ids the actor drives through, in order. Every consecutive
   * pair must be connected by a directed lane in the road graph (same lanes
   * ambient traffic drives), or stage() returns null. Ignored (may be empty)
   * when `railPath` is supplied.
   */
  pathNodes: string[];
  /**
   * Explicit district-space polyline the actor rides, BYPASSING the lane graph
   * (the pedestrian-path precedent for vehicles — the RX „жп прелез" TRAIN
   * crosses on an authored rail line that is NOT a road edge). When present it
   * REPLACES pathNodes for path resolution; the arc of each vertex becomes a
   * pathNode arc so `hold.nodeIndex` still indexes it. Absent = the ordinary
   * lane-graph path, byte-identical for every existing staged actor.
   */
  railPath?: ReadonlyArray<{ x: number; y: number }>;
  /** Dormant hold pose: arc of pathNodes[nodeIndex] + offsetM (may be
   *  negative = before the node) along the resolved path. */
  hold: { nodeIndex: number; offsetM: number };
  /** Default target speed for `cruise` commands, m/s. */
  cruiseSpeedMps: number;
  /** Acceleration toward a higher target, m/s² (default 2.6). */
  accelMps2?: number;
  /** Deceleration toward a lower target, m/s² (default 4.5). */
  decelMps2?: number;
  /** Extra rightward offset from the lane center, m — cyclists ride the curb. */
  extraRightOffsetM?: number;
  /** Loop the path (roundabout circulation) instead of finishing at its end. */
  loop?: boolean;
  /** Presentation palette index. */
  colorIndex?: number;
  /**
   * Size/type profile published on the actor's TrafficVehicleState (doc 72
   * FO-06): "truck"/"van" renders the large-vehicle rig. Default "car".
   * Visual + data only — see VehicleProfile for the point-geometry caveat.
   */
  profile?: VehicleProfile;
  /**
   * Emergency-brake when the player is directly ahead in the path corridor
   * (default true) — a staged actor must never ram the player from behind;
   * the PLAYER driving into a staged actor stays possible (that consequence
   * is the point). An active `brake` command overrides the guard.
   */
  playerGuard?: boolean;
}

export interface StagedPedestrianSpec {
  kind: "pedestrian";
  id: string;
  /** Explicit district-space polyline (e.g. curb -> across the road -> out). */
  path: ReadonlyArray<{ x: number; y: number }>;
  /** Walk speed once released, m/s (a dart-out runs at ~2.9). */
  speedMps: number;
  /** Crossing whose occupancy this actor drives while on the roadway span. */
  crossingId?: string;
  /** Roadway span along the path (arc range counting as on-crossing), m. */
  roadFromM?: number;
  roadToM?: number;
  colorIndex?: number;
  /** Standing pose published on the actor's TrafficPedestrianState (doc 72
   *  VP-11 — the roadside officer figure). Visual only; default absent. */
  pose?: PedestrianPose;
  /** Body variant published on the actor's TrafficPedestrianState (founder
   *  R3 #25–28 — child rig / elder-with-white-cane rig). Visual only;
   *  default absent = the adult rig. */
  variant?: PedestrianVariant;
}

export type StagedActorSpec = StagedVehicleSpec | StagedPedestrianSpec;

/** One behavior at a time — the orchestrator re-commands as the scene evolves. */
export type StagedCommand =
  /** Freeze (brake to 0, stand still). Pedestrians stop walking. */
  | { type: "hold" }
  /** Follow the path at `speedMps` (default: spec cruise speed). Releases a
   *  dormant pedestrian into its walk. */
  | { type: "cruise"; speedMps?: number }
  /**
   * Vehicles only: regulate speed to hold `gapM` meters ahead of the player
   * (projected onto the actor's path). NEGATIVE gapM paces BEHIND the player
   * (doc 72 FO-07 — the rear-tailgater recipe; same proportional law).
   *
   * `seedSpeedMps` is a ROLLING START: the actor's speed jumps to at least
   * this on the frame the command lands, instead of accelerating from its
   * dormant standstill. Absent = the historical behaviour, bit-identical.
   *
   * Why it exists (doc 87 FR-56 — „it must be sticking much earlier"). A
   * dormant actor released behind a moving player has to (a) accelerate from
   * 0 and (b) then close the gap that opened WHILE it accelerated, at a
   * closing speed of only `maxSpeedMps − playerSpeed`. Measured on the shipped
   * лепка at a constant player speed: glued at 7.4 s at 30 km/h, 9.1 s at 40,
   * **13.7 s at 50**. The founder is describing arithmetic, not a bug in the
   * controller. A real tailgater is a car that was ALREADY TRAVELLING when it
   * appeared in your mirror; parking it at the kerb first is the artificial
   * part, and the seed removes it.
   */
  | { type: "matchPlayer"; gapM: number; maxSpeedMps: number; seedSpeedMps?: number }
  /** Vehicles only: brake-slam at `decelMps2` (default 7.5) to a stop; holds
   *  the stop and suppresses the player guard (already braking). */
  | { type: "brake"; decelMps2?: number }
  /**
   * Vehicles only: the staged LANE-CHANGE mechanic (doc 72 FO-03 cut-in /
   * FO-07 tailgater pass — the "small traffic-port addition"). Ramps the
   * actor's PUBLISHED lateral offset (m, positive = right of its resolved
   * path) linearly to `toOffsetM` over `rampSec` (default 1.5 s). This is a
   * separate LATERAL channel: the active longitudinal command (cruise /
   * matchPlayer / brake) keeps governing speed while the glide runs, so
   * "cruise + laneShift" IS the cut-in. Deterministic (pure dt integration,
   * no RNG); `reset` clears it with the rest of the pose. Pedestrians ignore
   * it (like matchPlayer/brake).
   */
  | { type: "laneShift"; toOffsetM: number; rampSec?: number }
  /**
   * Vehicles only: set the actor's TURN INDICATOR (ledger L6). A separate
   * channel from `laneShift` on purpose — the exam's own «своевременно»
   * requires the lamp to be ON *before* the wheel moves, so the runner arms
   * this ≥ 3 s ahead of the glide and the two commands are never coincident.
   * The published `TrafficVehicleState.indicator` is what the renderer must
   * read; deriving a blinker from yaw rate provably never armed for a lateral
   * glide. Pedestrians ignore it. `reset` returns it to "off".
   */
  | { type: "setIndicator"; indicator: VehicleIndicator }
  /** Teleport back to the dormant hold pose (re-stage on retry). */
  | { type: "reset" };

/** Live read-only view of a staged actor (object identity stable per actor). */
export interface StagedActorView {
  readonly id: string;
  readonly kind: "vehicle" | "pedestrian";
  /** District-space pose — mirrors the published agent state. */
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly speedMps: number;
  /** Arc position along the resolved path, m. */
  readonly s: number;
  readonly pathLengthM: number;
  /** Arc position of each spec pathNode along the resolved path (vehicles;
   *  empty for pedestrians) — the orchestrator's timing reference. */
  readonly nodeS: readonly number[];
  /** True once a non-loop path is fully traversed (actor parked at its end). */
  readonly finished: boolean;
  /**
   * Commanded turn indicator, mirroring the published state (ledger L6).
   * Optional so pre-indicator fake ports in tests stay structurally valid;
   * the real TrafficSystem always publishes it for vehicles.
   */
  readonly indicator?: VehicleIndicator;
  /**
   * Published lateral offset right of the resolved path, m — the live
   * `laneShift` channel (0 = on the path). The encounter battery reads it to
   * time "the first lateral metre" against the indicator. Optional for the
   * same fake-port reason.
   */
  readonly lateralOffsetM?: number;
  /**
   * How many times FR-B5-RETURN has sent this actor back to the start of its
   * own path (0 = still on the run its runner staged). Published so a RUNNER
   * can tell an unscripted second pass from the one it choreographed: the
   * re-entry is a traffic-layer decision the orchestrator otherwise cannot
   * observe, and a resolved runner would keep its LAST command on a car that
   * is about to drive the whole encounter again. Optional for the same
   * fake-port reason as the two fields above; absent reads as 0.
   */
  readonly returns?: number;
}

// ---------------------------------------------------------------------------
// System handle
// ---------------------------------------------------------------------------

export interface TrafficSystemStats {
  vehicleCount: number;
  pedestrianCount: number;
  routeCount: number;
  laneCount: number;
}

export interface TrafficSystem {
  /**
   * Advance all agents. Call ONCE per render frame, after WorldRuntime.update
   * (signals must be fresh) and before sampling/rendering. dt is clamped to
   * 100 ms internally.
   */
  update(dtSec: number, ctx: TrafficUpdateContext): void;
  readonly vehicles: readonly TrafficVehicleState[];
  readonly pedestrians: readonly TrafficPedestrianState[];
  /**
   * True while any pedestrian is on the roadway span of the crossing.
   * Wire into the runtime: `runtime.setPedestrianQuery(id => traffic.pedestrianOnCrossing(id))`
   * so SimTick crossing events carry real pedestrian state.
   */
  pedestrianOnCrossing(crossingId: string): boolean;
  /**
   * Gap in meters (bumper-to-bumper approx) to the nearest vehicle ahead of the
   * player within a lane-width corridor, or Infinity when the road ahead is
   * clear. Player pose in district space; headingDeg 0 = north, clockwise.
   */
  leadGapMeters(px: number, py: number, headingDeg: number): number;
  /**
   * Gap in meters (bumper-to-bumper approx) to the nearest vehicle BEHIND the
   * player within the same lane-width corridor, or Infinity when nothing is
   * behind — leadGapMeters mirrored. HUD-ONLY channel (the PROX rear-proximity
   * cue): no rule-engine detector reads it, so it changes no grading. Player
   * pose in district space; headingDeg 0 = north, clockwise.
   */
  rearGapMeters(px: number, py: number, headingDeg: number): number;
  /**
   * O62: hand `rearGapMeters` the STATIC bodies the scene actually mounted, as
   * oriented boxes in district space — the held scenery and hittable obstacles
   * `scene/lessonWorldRecipe` built and `components/sim/ScenarioObstacles`
   * gave colliders to. REPLACES the district-derived default (the occupied
   * parking bays) rather than adding to it; the reasoning is at the
   * implementation. HUD-only, like `rearGapMeters` itself: no rule-engine
   * detector reads these bodies and setting them changes no grading.
   */
  setRearStaticBodies(bodies: readonly Obb2D[]): void;
  /**
   * True when a moving vehicle is within `radiusM` of (x,y) on a CONFLICTING
   * path relative to `approachBearingDeg` (your approach direction at the
   * give-way line). Used to grade failing to give way at a junction. District
   * space; bearings 0 = north, clockwise.
   *
   * Not a conflict (doc 87 B5): same-direction traffic; ONCOMING traffic inside
   * your own carriageway (the opposite flow of YOUR road — a Б1/Б2 line does
   * not ask you to yield to it, and a left turn across it is graded by
   * `oncomingNear` instead); and a vehicle that has already CLEARED, i.e. is
   * heading away from the node and far enough past it that its tail is off the
   * carriageway it crossed. What remains is crossing traffic still coming.
   */
  conflictNear(x: number, y: number, radiusM: number, approachBearingDeg: number): boolean;
  /**
   * The most urgent MOVING oncoming vehicle ahead of the player within
   * `radiusM` (heading roughly toward them), or null when the way is clear —
   * used to grade turning left across oncoming traffic. N1 (doc 72 JU-10):
   * the return carries distance + closing speed so the runtime adjudicates
   * the ACCEPTED GAP in seconds instead of mere presence (a 36 m queue-creep
   * at 1 m/s is a 30+ second gap, not a conflict). Falsy-compatible: callers
   * that used the old boolean form (`if (oncomingNear(...))`) behave
   * identically, and the runtime's OncomingQuery accepts both shapes.
   * District space; headingDeg 0 = north, clockwise.
   */
  oncomingNear(px: number, py: number, headingDeg: number, radiusM: number): OncomingApproach | null;
  /**
   * True when a moving vehicle near the junction (jx,jy) is on the player's
   * RIGHT and not travelling the player's own direction — used to grade the
   * give-way-to-the-right rule at uncontrolled junctions. District space.
   *
   * `playerSpeedKmh` (optional) turns presence into ARRIVAL: with it the
   * predicate compares the two arrivals at the node and drops a vehicle that
   * clears before the student gets there or arrives long after he is through.
   * Omit it and the answer is the legacy presence-only one, unchanged — see
   * `conflictFromRightFor` for the measurement that added the clause.
   */
  conflictFromRight(
    jx: number,
    jy: number,
    px: number,
    py: number,
    headingDeg: number,
    radiusM: number,
    playerSpeedKmh?: number,
  ): boolean;
  /**
   * True when a moving vehicle already circulating a roundabout (centre cx,cy,
   * within `bandRadiusM`) is on the player's LEFT — the driver must give way
   * before entering. District space; headingDeg 0 = north, clockwise.
   */
  circulatingConflict(
    cx: number,
    cy: number,
    px: number,
    py: number,
    headingDeg: number,
    bandRadiusM: number,
  ): boolean;
  /**
   * The nearest SAME-DIRECTION cyclist proxy within `radiusM` of the player,
   * or null (VU-02 — the lateral-clearance duty; doc 72 §7). Only staged
   * curb-riding cyclist proxies qualify (the vehicleCollisionKind tag);
   * oncoming cyclists are heading-filtered out (a meeting is not a pass).
   * Wire into the runtime: `runtime.setCyclistQuery((px, py, h, r) =>
   * traffic.cyclistNear(px, py, h, r))`. District space; headingDeg 0 =
   * north, clockwise.
   */
  cyclistNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null;
  /**
   * The nearest SAME-DIRECTION vehicle within `radiusM` of the player, or
   * null (OV-09 — the overtake-return duty; doc 72 §10). The cyclistNear
   * shape with the proxy filter INVERTED: cyclist proxies never qualify
   * (their pass duty is VU-02's act — one act, one code), oncoming/crossing
   * traffic is heading-filtered out, and there is deliberately NO
   * ahead/behind or speed filter — the runtime's return tracker reads the
   * overtaken mate through the whole pass (ahead → alongside → behind) and
   * past a guard rescue. Wire into the runtime:
   * `runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px,
   * py, h, r))`. District space; headingDeg 0 = north, clockwise.
   */
  overtakenNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null;
  /**
   * Deploy a scripted actor, dormant at its hold pose (A8). MUST be called
   * before the presentation layer mounts — TrafficLayer sizes its instanced
   * buffers from the agent arrays at mount. Returns null when the spec cannot
   * resolve (unknown/unconnected path nodes, duplicate id, degenerate path).
   */
  stage(spec: StagedActorSpec): StagedActorView | null;
  /** Command a staged actor (no-op for unknown ids). Takes effect on the next
   *  update() — one frame of latency, invisible at 60 Hz. */
  stagedCommand(id: string, command: StagedCommand): void;
  /** Live view of a staged actor, or null. */
  staged(id: string): StagedActorView | null;
  /**
   * A11: how a published VEHICLE state should read in a collision
   * (`SimTickEvent` collision `withWhat`). Staged curb-riding cyclist proxies
   * report "cyclist", every other vehicle state "vehicle". The v1 cyclist IS
   * a narrow staged vehicle-agent riding the curb (audit C3) — its defining
   * trait in the staged spec is `extraRightOffsetM > 0`, which is what tags
   * it here. `stateId` is TrafficVehicleState.id (staged ids >= 1000).
   */
  vehicleCollisionKind(stateId: number): "vehicle" | "cyclist";
  readonly timeSec: number;
  readonly stats: TrafficSystemStats;
}
