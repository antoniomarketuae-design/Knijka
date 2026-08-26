/**
 * sim/traffic — public API.
 *
 * Scripted, deterministic ambient traffic (docs/simulation/15): vehicle
 * agents on precomputed road-graph loops + pedestrians on sidewalk/crossing
 * loops, and an instanced R3F presentation layer.
 *
 * Integration (order matters, once per frame):
 *   1. runtime.update(dt)                      — signals advance
 *   2. traffic.update(dt, { signalPhase: id => runtime.signalPhase(id),
 *        playerPos, playerSpeedKmh, playerHeadingDeg })
 *   3. runtime.setPedestrianQuery(id => traffic.pedestrianOnCrossing(id))
 *      (once at setup) so SimTick crossing events see real pedestrians.
 * `<TrafficLayer system={...} runtime={...} playerRef={...} />` can run
 * step 2 itself when you don't need explicit ordering.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO SWEEP-161 FINDINGS WERE ROUTED TO THIS BARREL. IT IS A BARREL — 2026-08-20.
 *
 * There is no logic below this comment: every line is a re-export. Neither
 * finding can be answered by editing this file, and both were opened, driven
 * back to the frames, and given an owner rather than dropped.
 *
 * ── 1 · sc-ac-truck-spray/pc-right/04-t102s.png — REFUTED ON THE FRAMES ─────
 *   „The truck is stationary and unreachable. At t011, t102 and t204 (3.5
 *    minutes apart) it occupies the identical screen position and size, sitting
 *    astride the centre line rather than in the right lane … which is why both
 *    objectives never fire in any run."
 *
 *   THE TRUCK MOVED; THE WORLD PROVES IT. Between 04-t011s and 04-t204s the
 *   background changes completely — bare motorway becomes buildings, poles and
 *   the green route-end marker — so the ego covered ground (≈370 m at the
 *   sampled speeds). The truck stayed the same size THROUGH that, which is what
 *   a lead vehicle matching your speed looks like, not a parked one. And it is
 *   authored to do exactly that: `SC_AC_TRUCK_SPRAY.staged` is a `cutInLeadCar`
 *   with `hold: { offsetM: 79 }` and `maxMatchSpeedMps: 33`, whose own comment
 *   says „pinning the gap so the lesson isolates one variable".
 *
 *   NOR IS IT ASTRIDE THE CENTRE LINE. On 04-t011s the dashed lane divider runs
 *   to the truck's LEFT and the solid edge line plus hard shoulder to its
 *   RIGHT: it is in the right-hand lane the briefing places it in, with the ego
 *   behind it in the same lane.
 *
 *   WHY THE OBJECTIVES NEVER FIRED is a fact about the instrument, not the
 *   lesson: they are reachZones at y = 450 and y = 860, and the sweep's „right"
 *   drive is a closed-loop control law holding `CRUISE_KMH = 12`
 *   (`tools/mobile/lesson-audit.mjs`). 15 км/ч top, 28 full stops, 209 s — it
 *   physically could not reach y = 450. See the corpus measurement recorded in
 *   `traces/scMergeLaneEnd.ts`.
 *
 * ── 2 · sc-ed-d2-city-run/pc-right/06-waited.png — REAL, AND NOT HERE ───────
 *   „zero pedestrians, zero moving traffic and zero cross traffic … Briefing
 *    line 1 tells the student that on this boulevard the pedestrians and the
 *    drivers all read his headlights and indicators; there is nobody there."
 *
 *   Confirmed on the frame: a working red/green junction on бул. „Драган
 *   Цанков" with nothing at all passing through it. The emptiness is DECIDED,
 *   and not here:
 *     · `lessons/scenario/compile.ts` — `SCENARIO_DEFAULT_TRAFFIC` is
 *       `{ vehicleCount: 0, pedestrianCount: 0 }`, and
 *       `SCENARIO_FAMILY_TRAFFIC_BASELINE` lifts only `junction` and `signals`.
 *       This lesson's family is `exam-drills`, which is in neither, and that
 *       file's own comment pins `pedestrianCount` at 0 for EVERY family.
 *     · `lessons/scenario/templates-exam.ts` — sc-ed-d2-city-run authors
 *       `traffic: { vehicleCount: 8, pedestrianCount: 4 }` on its L5 rung ONLY.
 *       The sweep drove „Ниво 1", where the count is 0.
 *   So the same lesson one rung up has the boulevard the copy describes. The
 *   fix is a rung/family authoring decision in those two files; this module
 *   renders whatever count it is handed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export { createTrafficSystem } from "./system";
// Shared HERO car-paint recipes (player car + premium boxy SUV): clearcoat at
// high, glossy MeshStandard fallback on med/low (docs/simulation/71 §4.8).
export { carPaintMaterial, carPaintStandardMaterial } from "./vehicleFleet";
export type { CarPaintOptions, BuildTrafficFleetOptions } from "./vehicleFleet";
// S0 scenario obstacles (doc 76 §0): the instanced-fleet machinery + measured
// per-model rigs, additively exposed so components/sim/ScenarioObstacles can
// render PRECISE hittable parked cars over the same GLB kit (its colliders
// are cuboids matched to each rig's measured bbox — never a generic shell).
export {
  assignCivilianModel,
  // Hero boxy-SUV population caps — the shipped ≤2 and the tier-`low` 0
  // (doc 82 §2.3). TrafficLayer picks between them from the render tier.
  BOXY_MAX_INSTANCES,
  BOXY_MAX_INSTANCES_LOW,
  // Quadruped hazard rig (doc 72 §HZ „животно на пътя"): ScenarioObstacles
  // mounts the SAME geometry TrafficLayer renders, so the animal can stand as
  // held scenery (sc-animal-hazard) instead of a recorder-less dart trigger.
  buildAnimalRig,
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET,
  FLEET_URLS,
  // R3 #26 bus stopgap: the procedural box-truck slot, so ScenarioObstacles
  // can stage the large occluder body ("box_truck") through the same parked
  // pass until a real bus rig exists.
  TRUCK_MODEL_INDEX,
} from "./vehicleFleet";
export type { ModelRig, ParkedPlacement, TrafficFleet } from "./vehicleFleet";
export { mulberry32 } from "./rng";
export type { Rng } from "./rng";
export { computeParkedCars, TrafficLayer } from "./TrafficLayer";
export type {
  ControllerFigureRead,
  ParkedCar,
  ParkedClearZoneLike,
  TrafficLayerProps,
} from "./TrafficLayer";
export { DEFAULT_TRAFFIC_CONFIG } from "./types";
// AMBIENT PAVEMENT POPULATION — how many walkers a district's own kerb length
// supports. Published because the LIVE scene is the only caller that may ask
// for them (`TrafficConfig.sidewalkPedestrianCount` defaults to 0 so recorded
// traces and clip feeds stay byte-identical); the four empty-pavement rows and
// the crossing-anchoring measurement behind it are in `pedestrians.ts`.
export {
  ambientSidewalkBudget,
  SIDEWALK_BUDGET_MAX,
  SIDEWALK_METRES_PER_WALKER,
  SIDEWALK_MIN_EDGE_M,
} from "./pedestrians";
// A11 hittable traffic — pure proximity/near-miss helpers for the physics
// shell pool (components/sim/NpcColliders binds them to rapier).
export {
  assignPool,
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  resetNearMissTracker,
  selectNearest,
  stepNearMiss,
} from "./proximity";
export type {
  AgentPoint,
  NearMissAgent,
  NearMissConfig,
  NearMissPlayer,
  NearMissTracker,
} from "./proximity";
export type {
  CyclistApproach,
  DistrictCrossing,
  DistrictEdge,
  DistrictIntersection,
  DistrictNode,
  OncomingApproach,
  PedestrianVariant,
  SignalPhaseFn,
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
  StagedPedestrianSpec,
  StagedVehicleSpec,
  TrafficConfig,
  TrafficDistrict,
  TrafficPedestrianState,
  TrafficSystem,
  TrafficSystemStats,
  TrafficUpdateContext,
  TrafficVehicleState,
  VehicleIndicator,
  VehicleProfile,
} from "./types";
// L6 / T17(e): the indicator channel's vocabulary + the profile body lengths
// the lead/rear gap queries subtract (TrafficLayer reads the first, the rule
// engine's follow channel the second).
export {
  PLAYER_HALF_LENGTH_M,
  VEHICLE_PROFILE_LENGTH_M,
  vehicleHalfLengthM,
} from "./types";
