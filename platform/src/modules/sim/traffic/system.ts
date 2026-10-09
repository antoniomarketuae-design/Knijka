/**
 * TrafficSystem — owns all agents and advances them in ONE per-frame update.
 *
 * Update order inside a sub-step: pedestrians first (vehicles then react to
 * fresh crossing occupancy), then vehicles in fixed index order, then staged
 * actors. Pedestrian gap checks read vehicle poses from the previous sub-step
 * — one step of staleness is invisible at 60 Hz and keeps the pass order
 * simple.
 *
 * A frame longer than `MAX_SUBSTEP_SEC` runs that order several times rather
 * than once with a longer `dt`: the world owes the car a whole frame of time
 * and every body owes the collision clamps a short step. See
 * `MAX_FRAME_DT_SEC` for the fifth-pace defect this closes and the numbers
 * behind it.
 *
 * Determinism: (seed, district, config, dt sequence) fully determine the
 * playback. All randomness is drawn at init or from per-agent streams; the
 * update path allocates nothing and iterates in fixed order — the sub-step
 * loop adds no allocation and `trafficSubStepPlan` is pure.
 */

import {
  actorObb,
  obbSeparationM,
  playerObb,
  // NOT this file's `PLAYER_HALF_LENGTH_M`, and the two are three centimetres
  // apart on purpose. `./types` publishes 2.05 — half the 4.1 m FLEET car, the
  // length every point-based gap query subtracts. `../collision` publishes
  // `CHASSIS_HALF_EXTENTS.z` = 2.02, the rapier collider the student's car
  // actually contacts the world with. The static rear sweep below measures
  // body-to-body air, so it must use the body rapier moves; anything that
  // subtracts a nominal fleet length keeps the other one.
  PLAYER_HALF_LENGTH_M as PLAYER_CHASSIS_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M as PLAYER_CHASSIS_HALF_WIDTH_M,
  type Obb2D,
} from "../collision";
import { LANE_WIDTH_M } from "../world/builders/constants";
import { buildLaneGraph, type LaneGraph } from "./graph";
import {
  buildPedRoute,
  buildPedSidewalkRoute,
  createPedestrianAgent,
  footwaylessEdgeIds,
  SIDEWALK_MIN_EDGE_M,
  updatePedestrian,
  type PedestrianAgent,
  type PedestrianEnv,
} from "./pedestrians";
import { mulberry32, rngRange } from "./rng";
import { buildRoutes, DEFAULT_ROUTE_OPTIONS, type TrafficRoute } from "./routes";
import {
  applyStagedCommand,
  buildStagedPedPath,
  buildStagedVehiclePolylinePath,
  createStagedPedestrian,
  createStagedVehicle,
  resolveStagedVehiclePath,
  STAGED_STATE_ID_BASE,
  updateStagedPedestrian,
  updateStagedVehicle,
  type StagedEnv,
  type StagedPedestrianAgent,
  type StagedVehicleAgent,
} from "./staged";
import {
  createVehicleAgent,
  separateVehicleFrom,
  updateVehicle,
  type NodeReservation,
  type VehicleAgent,
  type VehicleEnv,
} from "./vehicles";
import {
  DEFAULT_TRAFFIC_CONFIG,
  PLAYER_HALF_LENGTH_M,
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type CirculatingReport,
  type CirculatingVehicle,
  type CyclistApproach,
  type DistrictEdge,
  type OncomingApproach,
  type RearBodyBehind,
  type SameDirVehicle,
  type StagedActorSpec,
  type StagedActorView,
  type StagedCommand,
  type StagedSubstepListener,
  type StagedSubstepPlayer,
  type TrafficRenderPose,
  type PlayerStepTrack,
  type TrafficConfig,
  type TrafficDistrict,
  type TrafficPedestrianState,
  type TrafficSystem,
  type TrafficSystemStats,
  type TrafficUpdateContext,
  type TrafficVehicleState,
  type VehicleProfile,
} from "./types";

/**
 * THE LARGEST STEP THE TRAFFIC INTEGRATOR IS EVER HANDED, s.
 *
 * This number is unchanged, and that is the point: nothing in `vehicles.ts`,
 * `pedestrians.ts` or `staged.ts` ever sees an interval bigger than the one it
 * has always seen. What changed is what happens to the REST of a longer frame —
 * see `MAX_FRAME_DT_SEC` and `update()`.
 */
const MAX_SUBSTEP_SEC = 0.1;
/**
 * THE MOST WORLD TIME ONE FRAME MAY CARRY, s — the ego car's own ceiling.
 *
 * `@react-three/rapier` discards everything past half a second before its
 * accumulator sees it (`clamp(dt, 0, 0.5)`), and since 2026-08-16 the lesson
 * clock advances by exactly that much (`lesson-ui/sessionClock.ts`
 * `PHYSICS_MAX_FRAME_DT`). Traffic must use the SAME ceiling or the two clocks
 * diverge again on the longest frames — `__tests__/substep.test.ts` reads the
 * literal out of that file so the pair cannot drift apart behind this one's
 * back, exactly as `sessionClock.test.ts` reads rapier's out of node_modules.
 *
 * MEASURED 2026-08-19 against the pre-fix build itself — `git show HEAD:` of
 * this file imported beside the new one — real district, seed 7, 20 s of
 * warm-up, then ONE frame (`__tests__/substep.test.ts` reproduces the run):
 *
 *   one update(0.5)   pre-fix   8.825 m of ambient travel, timeSec +0.1000
 *                     post-fix 44.109 m,                   timeSec +0.5000
 *                                                                    4.998×
 *
 * and on the pre-fix build `update(0.5)` was BIT-IDENTICAL to `update(0.1)`:
 * the old ceiling did not slow the world down, it threw the other 0.4 s away.
 * Meanwhile the car driving through that world gained the full 0.5 s. So below
 * 10 fps every yield, every gap judgement and every «пропусни пешеходеца» was
 * graded against a world running at a fifth of the student's own car.
 *
 * WHAT THAT COSTS A STUDENT, measured (same test): a staged pedestrian released
 * to cross 50 m ahead of a player at 50 km/h is 4.50 m along their path — well
 * onto the roadway span (1.2–18.3 m) — when the player's bumper reaches the
 * crossing at 60, 30 and 10 fps. At 2 fps they are 1.00 m along it, still on
 * the kerb, and `pedestrianOnCrossing("x1")` answers FALSE. The crossing reads
 * clear. Both crimes at once: the student who correctly stops is graded against
 * an empty road, and the student who drives straight through is not marked for
 * it.
 *
 * SUB-10-FPS IS NOT EXOTIC HERE, IT IS THE PHONE (docs/simulation/91_MOBILE_AUDIT):
 * §G5 the first six seconds of every session at phone dimensions run 1.2 fps,
 * 0.4 fps, 10.9 fps with individual frames of 3,218 ms and 4,234 ms (shader
 * compile + texture upload); §G1 tier medium p95 frame 250 ms, worst frame
 * 3.35 s; §G3 tier low under a 4× CPU throttle 7.4 fps / 116.6 ms p50.
 *
 * NOT A NEW TUNNELLING SURFACE. The frame is SUBDIVIDED, never widened: a
 * 0.5 s frame is five 0.1 s steps, so the largest interval any body integrates
 * is the one that shipped. Raising this clamp instead is the fix that was
 * refused — `__tests__/substep.test.ts` runs that mutation and shows what it
 * loses.
 */
export const MAX_FRAME_DT_SEC = 0.5;
export const TRAFFIC_MAX_SUBSTEP_SEC = MAX_SUBSTEP_SEC;

/** How one render frame of `dtSec` is cut up for the traffic integrator. */
export interface TrafficStepPlan {
  /** Number of sub-steps to run (0 = refuse the frame). */
  steps: number;
  /** Length of each sub-step, s. Always `<= MAX_SUBSTEP_SEC`. */
  dt: number;
}

/**
 * Cut a frame into sub-steps — a pure function so the arithmetic can be
 * asserted without spinning up a district (the shape `sessionClockAdvance` and
 * `qualityChoice` already establish: the decision is a tested function, not an
 * expression at a call site where nothing can check it).
 *
 * Three properties, all asserted in `__tests__/substep.test.ts`:
 *
 *  1. `steps * dt === frameDt` EXACTLY — no time is thrown away, which is the
 *     whole finding. Equal sub-steps rather than „0.1 until the remainder"
 *     because a trailing sliver is a second, differently-sized integration.
 *  2. `dt <= MAX_SUBSTEP_SEC` ALWAYS — no body is ever integrated over a
 *     longer interval than the one that shipped, so the tunnelling surface is
 *     unchanged by construction rather than by measurement.
 *  3. `dtSec <= MAX_SUBSTEP_SEC` ⇒ `{ steps: 1, dt: dtSec }` — the argument is
 *     passed through untouched, so above 10 fps every call is the call that
 *     was there before, in the order it was in.
 */
export function trafficSubStepPlan(dtSec: number): TrafficStepPlan {
  if (!(dtSec > 0)) return { steps: 0, dt: 0 };
  const frameDt = dtSec > MAX_FRAME_DT_SEC ? MAX_FRAME_DT_SEC : dtSec;
  const steps = frameDt > MAX_SUBSTEP_SEC ? Math.ceil(frameDt / MAX_SUBSTEP_SEC) : 1;
  return { steps, dt: frameDt / steps };
}

/**
 * THE LARGEST STEP A STAGED ACTOR IS EVER INTEGRATED OVER, s — the ego car's
 * own physics step (`vehicle/tuning.ts` FIXED_DT, rapier `timeStep`; pinned
 * equal by `__tests__/staged-substep-clock.test.ts`).
 *
 * sc-roundabout-entry:7b747c15 [major], MEASURED at 2127d8f (w80 judge, then
 * this lane's probe through liveChainReplay, sc-roundabout-entry L1–L5): the
 * same lineStop(45 s, 12 км/ч) tape passed at 0 points on 60 Hz and was
 * convicted of a COLLISION (10 т.) on a phone cadence, because the ring's
 * staged circulator ran its whole lap up to ~1 m away from where the 60 Hz run
 * put it at the same session time. Two clocks made that offset, and this
 * constant is half of the repair:
 *
 *   · the staged actors were integrated in the AMBIENT sub-steps (up to
 *     0.1 s): a car pulling away from a hold covers ½·v·dt more or less per
 *     accelerating step depending on how the frames fall;
 *   · the director that commands them (release, sync speed, lock) decided once
 *     per FRAME, so a 0.5 s frame released the car up to 0.5 s late.
 *
 * Staged actors are few (one to five per lesson), so stepping them at the
 * physics step costs nothing a frame can feel; the ambient fleet keeps its
 * 0.1 s plan (its cost is the reason for that plan). The other half — the
 * director deciding on this same clock — is `StagedSubstepListener`.
 */
export const STAGED_MAX_SUBSTEP_SEC = 1 / 60;

/**
 * Staged steps per ambient sub-step of `dt`: the fewest equal steps none of
 * which is longer than `STAGED_MAX_SUBSTEP_SEC`. The 1e-9 keeps an exact
 * 1/60 frame at ONE step (float division can land a hair above 1), so every
 * 60 Hz frame is the single call it always was.
 */
export function stagedSubStepsPer(dt: number): number {
  if (!(dt > 0)) return 0;
  return Math.max(1, Math.ceil(dt / STAGED_MAX_SUBSTEP_SEC - 1e-9));
}

/**
 * sc-roundabout-entry:7b747c15 round 2 — THE STAGED GRID IS THE SESSION'S.
 *
 * Round 1 cut each frame into equal staged steps of at most one physics step,
 * so every cadence integrated the staged world on its OWN grid: at 60 Hz on
 * k/60, on a phone's 0.277 s frame on 17 steps of 16.3 ms. Every trigger was
 * then met within one step — but each on a different grid, and a body whose
 * motion feeds back on itself (a matchPlayer lead closing on its station, a
 * tailgater latching when its gap first dips under a bar, a car braking to a
 * stop) integrates a slightly different curve on each. MEASURED with ambient
 * traffic off over every committed demo (staged-pose-cadence.census.test.ts,
 * full grid, before this constant existed): on a 0.25/0.4 s cadence — whose
 * frames all END on the 60 Hz grid — 0 of 1,531 cells left one physics step of
 * the 60 Hz staged poses; on the phone cadence, whose frames do not, 69 did (up
 * to 5.7 steps: the tailgater of sc-follow-tailgater mistake-brake-check L5).
 *
 * So when the caller says what session time the frame ends at
 * (`TrafficUpdateContext.sessionTimeSec`), the staged steps are cut at the
 * session's physics grid k·FIXED_DT — the same instants on every cadence — and
 * only the frame's own ends cut a step short. A boundary within this of a grid
 * point IS that grid point (Σ 1/60 drifts from k/60 in the 13th digit).
 *
 * ROUND 3 removed the last clause: a frame end no longer cuts a step at all
 * (`stepGrid`, the fixed-step accumulator) — its verifier measured what the
 * cut still did on frames SHORTER than a step or ending off the grid (120 Hz,
 * 144 Hz, a real desktop jitter). This tolerance now decides only whether a
 * frame end IS a grid point.
 */
const STAGED_GRID_EPS_SEC = 1e-7;

/** STAGED_GRID_EPS_SEC in units of grid steps (the accumulator's floor). */
const GRID_EPS_STEPS = STAGED_GRID_EPS_SEC / STAGED_MAX_SUBSTEP_SEC;
/** Most grid steps one frame may take: the 0.5 s session clamp is 30. */
const GRID_MAX_STEPS = 64;
/** A drawn segment longer than this between two grid states is a teleport
 *  (a re-entry, a retry), m: drawn where the body now is, never swept across. */
const RENDER_JUMP_M = 3;

/** Shortest-arc heading interpolation, degrees. */
function lerpHeadingDeg(from: number, to: number, f: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return from + d * f;
}

/** A player pose step longer than this (beyond what his speed explains) is a
 *  teleport, m — the director's own `PLAYER_JUMP_SLACK_M` (contact.ts). */
const STAGED_PLAYER_JUMP_SLACK_M = 2;

const VEHICLE_COLOR_VARIANTS = 4;
const PED_COLOR_VARIANTS = 4;
/** A vehicle counts as "ahead in my path" within this lateral corridor, meters.
 * ~Half the scaled lane: same-lane leaders register even off-center, while an
 * adjacent-lane car (one lane ≈ 8.1 m over) never does (perceptual scale). */
const LEAD_CORRIDOR_M = 4.0;
/**
 * Sum of the two half-lengths for a bumper-to-bumper gap, meters — the
 * CAR-vs-CAR case (2.05 + 2.05). Kept as the named legacy constant because
 * every car lead must stay byte-identical; a lead that publishes a bigger
 * profile now loses ITS OWN half-length instead (ledger T17(e)):
 * `gap = centres − (PLAYER_HALF_LENGTH_M + vehicleHalfLengthM(profile))`.
 * Grading a 14 m tram as a 4.1 m hatchback handed the student 5 m of road
 * that does not exist.
 */
const VEHICLE_LENGTH_M = 4.1;

/**
 * Bumper-to-bumper subtrahend for one published lead/follower, m.
 *
 * MONOTONE BY DESIGN — floored at the legacy car constant, so a profile can
 * only ever SHRINK the reported gap, never grow it. Two reasons, and the
 * second is a real bug this floor prevents:
 *
 *  1. Safety direction. A 7.5 m truck / 14 m tram / 34.4 m train really does
 *     put its rear bumper closer than a hatchback would, and the student must
 *     be graded against the metal that is actually there.
 *  2. A SHORT body must not buy slack. Unfloored, a 1.8 m cyclist proxy
 *     subtracted only 2.95 m instead of 4.1 and the reported gap GREW by
 *     1.15 m — which measurably stopped FOLLOWING_TOO_CLOSE firing on
 *     `sc-vu-cyclist-group`'s cut-in (s-w4-bot-completion.test.ts:447 caught
 *     it: the taught code flipped to VULNERABLE_PASS_TOO_CLOSE). Being more
 *     permissive about tailgating a cyclist is the opposite of the north
 *     star; a vulnerable road user earns a bigger buffer, never a smaller one.
 *
 * Invariant (asserted in lead-gap.test.ts): a car, a profile-less agent and
 * every sub-car body all return exactly VEHICLE_LENGTH_M, so nothing about the
 * pre-profile world moves.
 */
function bumperSubtrahendM(profile?: VehicleProfile): number {
  if (profile === undefined || profile === "car") return VEHICLE_LENGTH_M;
  return Math.max(VEHICLE_LENGTH_M, PLAYER_HALF_LENGTH_M + vehicleHalfLengthM(profile));
}
/** Below this speed a vehicle is stopped/parked and makes no priority claim, m/s. */
const CONFLICT_MIN_SPEED_MPS = 1;
/** Heading within this of your approach = same-direction traffic (not a conflict), deg. */
const CONFLICT_SAME_DIR_DEG = 50;
/** A vehicle heading more than this off yours (and ahead) counts as oncoming, deg. */
const ONCOMING_MIN_DEG = 130;
/** A vehicle must be at least this far to the player's right to count, meters. */
const RIGHT_MIN_M = 1.5;
/**
 * OWN-CARRIAGEWAY HALF WIDTH for the give-way predicate, m (doc 87 B5).
 *
 * `LANE_WIDTH_M` is the perceptually-scaled lane (3.25 m × 2.5 = 8.125), so on
 * the two-lane roads every give-way district is built from it is EXACTLY the
 * travel half-width: `network.travelHalfWidthM` = lanes × LANE_WIDTH_M / 2 =
 * 8.125, and jxg-giveway-v1's northbound lane centre sits at +4.0625, half of
 * it. An oncoming car inside ±8.125 of the approach axis is therefore in the
 * student's own carriageway.
 *
 * Why not something wider that would also cover a 4-lane boulevard: because
 * the two failure modes are not symmetric. Too narrow and the predicate keeps
 * TODAY's behaviour on a wide road (his complaint survives there — honest, and
 * recorded); too wide and it starts acquitting genuine priority traffic on a
 * skewed arm, which is the same defect mirrored and strictly worse. It errs
 * toward convicting, and one lane width is the width it can prove.
 */
const OWN_ROAD_HALF_W_M = LANE_WIDTH_M;
/**
 * CLEARED DISTANCE, m — how far past the node a DEPARTING vehicle must be
 * before it stops being a conflict (doc 87 B5, „I let everybody pass").
 *
 * Derived, not chosen: the carriageway it just crossed is OWN_ROAD_HALF_W_M
 * wide from the node, and a car is VEHICLE_LENGTH_M long, so once its centre
 * is 8.125 + 2.05 = 10.175 m out its TAIL is off that carriageway. Below it a
 * car straddling the mouth still counts, which is why the departing test alone
 * would be wrong: a van dead in front of the student at (4.06, 4.06) is
 * already "moving away from the node" at 5.75 m and is very much in his way.
 */
const CONFLICT_CLEARED_M = OWN_ROAD_HALF_W_M + VEHICLE_LENGTH_M / 2;
/**
 * RIGHT-HAND-RULE ARRIVAL WINDOW, s — how long after the student reaches the
 * conflict point a vehicle may still arrive and count as his to give way to.
 *
 * Not chosen freely: it is the engine's OWN conviction band for the identical
 * physics, one adjudicator over. `worldRuntime.LEFT_TURN_CONVICT_GAP_SEC` (2.0)
 * says a gap of two seconds or less means „the priority driver physically
 * cannot avoid braking for the turner" — which is exactly what чл. 50's duty
 * forbids — while 2–3 s is unsafe-but-legal and by founder ruling NEVER graded.
 * The quantity compared here is the same one: `vehicleTta − playerTta`, the
 * separation between the two arrivals at the shared point.
 *
 * Deliberately the CONVICT band and not the 4.0 s „clean" norm: the wider
 * number would acquit inside the band the engine already refuses to call safe,
 * and this clause is allowed to remove only convictions the product cannot
 * defend. It is the strictest value that still repairs the measured row.
 *
 * The number is duplicated rather than imported because `traffic/` sits BELOW
 * `runtime/` in the dependency order (the runtime injects its queries into this
 * module, never the reverse). `right-conflict.test.ts` asserts the identity
 * against the runtime's exported constant, so the two cannot drift in silence.
 */
export const RIGHT_ARRIVAL_LATE_SEC = 2.0;
/**
 * ROUNDABOUT REACH, m — how near a circulating car must actually be to the
 * DRIVER before it is a car he owes way to (doc 87 B15).
 *
 * The ring test used to be "in the band around the ring CENTRE, and somewhere
 * to my left". On `rb-mini-v1` the band is the 18 m ring radius plus the
 * runtime's 9 m of extra, so it enclosed the WHOLE roundabout: a car on the far
 * side, 36 m away and not remotely near the mouth, satisfied it. That is the
 * geometry behind the founder's frame — «Непропускане на пътно превозно
 * средство с предимство −10 т.» on a run in which, as the re-look put it, *no
 * circulating vehicle appears in ANY frame*. He was convicted for a car he
 * could not see because it was on the other side of the island.
 *
 * 26 m is the runtime's own PRIORITY_CONFLICT_RADIUS_M — the distance at which
 * every OTHER give-way duty in the engine says "this one is yours". On an 18 m
 * ring it still catches a car a full quarter-turn upstream (the 90° chord is
 * 25.5 m, about 3.6 s of circulation at 7 m/s), which is exactly the car you
 * wait for. It can only ever REMOVE a conviction, never add one.
 */
const CIRCULATING_REACH_M = 26;
/** VU-02 cyclist-pass query: a cyclist heading within this of the player's own
 * heading rides the SAME direction (the pass duty applies); anything wider is
 * crossing/oncoming — a different duty (meeting), never returned, deg. */
const CYCLIST_SAME_DIR_DEG = 60;

class TrafficSystemImpl implements TrafficSystem {
  readonly vehicles: TrafficVehicleState[] = [];
  readonly pedestrians: TrafficPedestrianState[] = [];
  readonly stats: TrafficSystemStats;
  timeSec = 0;

  private readonly graph: LaneGraph;
  private readonly routes: TrafficRoute[];
  private readonly vehicleAgents: VehicleAgent[] = [];
  private readonly pedestrianAgents: PedestrianAgent[] = [];
  private readonly crossingCounts = new Map<string, number>();
  private readonly reservations = new Map<string, NodeReservation>();
  private readonly vehicleEnv: VehicleEnv;
  private readonly pedestrianEnv: PedestrianEnv;
  // A8 staged actors — scripted, orchestrator-commanded (staged.ts).
  private readonly stagedVehicles: StagedVehicleAgent[] = [];
  /** The staged vehicles' published states, in stage() order — handed to the
   *  ambient env so ambient agents can SEE scripted actors (FR-27). Same
   *  objects as the entries this.vehicles carries; never re-allocated. */
  private readonly stagedStates: TrafficVehicleState[] = [];
  /** The AMBIENT agents' published states — handed to the staged env so
   *  scripted actors can SEE ambient cars (FR-27, the mirror half). Frozen
   *  after construction; ambient agents are only ever created there. */
  private readonly ambientStates: TrafficVehicleState[] = [];
  private readonly stagedPeds: StagedPedestrianAgent[] = [];
  private readonly stagedById = new Map<string, StagedVehicleAgent | StagedPedestrianAgent>();
  /** circulatingTraffic's reused answer (one report, one row pool — the
   *  per-frame roundabout query allocates nothing after warm-up). */
  private readonly circulatingRows: CirculatingVehicle[] = [];
  private readonly circulatingReport: { conflict: boolean; vehicles: CirculatingVehicle[] } = {
    conflict: false,
    vehicles: this.circulatingRows,
  };
  private readonly stagedEnv: StagedEnv;
  /** sc-roundabout-entry:7b747c15 — see `StagedSubstepListener`. */
  private stagedListener: StagedSubstepListener | null = null;
  /** The player pose the PREVIOUS update() was given (the interpolation's
   *  start); `prevPlayerValid` false = none yet, or he left the world. */
  private prevPlayerValid = false;
  private prevPlayerX = 0;
  private prevPlayerY = 0;
  private prevPlayerKmh = 0;
  private prevPlayerHeadingDeg = 0;
  /** Reused per sub-step (the frame-loop zero-allocation law). */
  private readonly subPlayer: StagedSubstepPlayer = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };
  /** This frame's per-physics-step student track (`PlayerStepTrack`), or null
   *  = interpolate along the chord; and the frame length it is measured in. */
  private track: PlayerStepTrack | null = null;
  private trackFrameSec = 0;
  /** Round 3 — the fixed-step accumulator (stepGrid): the INTEGER index of
   *  the last session grid point the world reached, and the session time the
   *  last update ended at. */
  private gridInit = false;
  private gridK = 0;
  private gridLastT = 0;
  /** Round 3 — what is drawn (renderFraction): the poses before the last grid
   *  step ([x, y, dirX, dirY] per published state) and the fraction of a step
   *  the frame end lies past the newest grid state. */
  private renderLerp = false;
  private renderAlpha = 1;
  private renderPrevVeh = new Float64Array(0);
  private renderPrevVehCount = 0;
  private renderPrevPed = new Float64Array(0);
  private renderPrevPedCount = 0;
  /** The drawn lane width every lane of this system was resolved with — handed
   *  to each staged vehicle so its pass guard (and the runner reading its view)
   *  measure „in the lane" against the lane the product built. */
  private readonly laneWidthM: number;
  /** A11: state ids of staged cyclist proxies (extraRightOffsetM > 0). */
  private readonly cyclistStateIds = new Set<number>();
  /**
   * O59/O62: the STATIC half of "what is behind me", as body boxes. Read only
   * by `rearGapMeters`, which is a HUD channel; no rule-engine query touches
   * this array.
   *
   * Seeded from the district's OCCUPIED PARKING BAYS (bay occupancy is
   * authored map data, nothing moves it) so any consumer that never wires a
   * scene — the clip-capture rig, the trace recorder — still gets O59's
   * answer. A scene that KNOWS what it mounted replaces the whole array
   * through `setRearStaticBodies`; see that method for why replace and not
   * append.
   */
  private staticBodies: readonly Obb2D[];

  constructor(district: TrafficDistrict, cfg: TrafficConfig) {
    const rng = mulberry32(cfg.seed);
    this.laneWidthM = cfg.laneWidthM;
    this.staticBodies = occupiedBayBodies(district);
    this.graph = buildLaneGraph(district, {
      laneWidthM: cfg.laneWidthM,
      excludedRoadClasses: cfg.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });

    // Reservation slots for every unsignalized intersection.
    for (const ix of district.intersections) {
      if (!ix.signalized && ix.degree >= 3) {
        this.reservations.set(ix.id, { holder: -1, renewedAt: -Infinity });
      }
    }
    for (const crossing of district.crossings) {
      this.crossingCounts.set(crossing.id, 0);
    }

    // --- Vehicles: a few loops, agents spread around each loop. When an
    // anchor is set, seed loops near it (and keep them shorter) so cars stay
    // where the driver is rather than orbiting the far side of the district.
    //
    // A CORRIDOR GETS ONE LOOP PER CAR. Two cars sharing a loop is fine around
    // a single anchor — whatever the loop wanders off to do, it does it where
    // the driver is standing. Spread over four stations it stops being fine:
    // each station then owns ONE loop, that loop spends most of its lap
    // somewhere else, and which somewhere is a coin toss on the lesson seed.
    // Measured on sc-ed-d2-priority-run over its committed shadow drive, four
    // shared loops left the longest stretch with no ambient car inside 150 m at
    // 0 s on one rung and 21 s on another; one loop per car it is 0 s on three
    // rungs and 17 s at the worst — against 89 s for the same eight cars
    // without a corridor. Gated on `anchorPath`, so nothing without one moves.
    const routeCount =
      (cfg.anchorPath?.length ?? 0) > 0
        ? Math.max(1, cfg.vehicleCount)
        : Math.max(1, Math.ceil(cfg.vehicleCount / 2));
    this.routes = buildRoutes(
      this.graph,
      routeCount,
      rng,
      cfg.anchor
        ? { minWalkM: 200, maxWalkM: 480, minLoopM: 150 }
        : DEFAULT_ROUTE_OPTIONS,
      cfg.anchor
        ? {
            x: cfg.anchor.x,
            y: cfg.anchor.y,
            radiusM: cfg.anchorRadiusM ?? 260,
            // …and the rest of the lesson's route, when it has one. Undefined
            // for every caller that does not author a corridor, which keeps
            // their routes bit-identical (routes.ts `RoutePreference`).
            alongPath: cfg.anchorPath,
          }
        : undefined,
    );
    if (this.routes.length > 0) {
      const perRoute = new Map<number, number>();
      for (let i = 0; i < cfg.vehicleCount; i++) {
        perRoute.set(i % this.routes.length, (perRoute.get(i % this.routes.length) ?? 0) + 1);
      }
      const placed = new Map<number, number>();
      for (let i = 0; i < cfg.vehicleCount; i++) {
        const ri = i % this.routes.length;
        const route = this.routes[ri];
        const n = perRoute.get(ri) ?? 1;
        const k = placed.get(ri) ?? 0;
        placed.set(ri, k + 1);
        // Even spacing around the loop + a little seeded jitter.
        const loopS =
          ((route.totalLength * k) / n + rngRange(rng, 0, Math.min(15, route.totalLength / (n * 4)))) %
          route.totalLength;
        const agent = createVehicleAgent(
          i,
          route,
          loopS,
          rngRange(rng, 0.82, 1.0),
          Math.floor(rng() * VEHICLE_COLOR_VARIANTS),
        );
        this.vehicleAgents.push(agent);
        this.vehicles.push(agent.state);
        this.ambientStates.push(agent.state);
      }
    }

    // --- Pedestrians: loops anchored on seeded-shuffled crossings.
    const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
    const candidates = [...district.crossings].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (cfg.anchor) {
      // Nearest crossings first so pedestrians populate around the driver.
      const ax = cfg.anchor.x;
      const ay = cfg.anchor.y;
      candidates.sort(
        (a, b) => Math.hypot(a.x - ax, a.y - ay) - Math.hypot(b.x - ax, b.y - ay),
      );
    } else {
      // Fisher-Yates with the master stream.
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }
    }
    let pedId = 0;
    for (let pass = 0; pass < 2 && pedId < cfg.pedestrianCount; pass++) {
      for (const crossing of candidates) {
        if (pedId >= cfg.pedestrianCount) break;
        const edge = edgeById.get(crossing.edgeId);
        if (!edge) continue;
        const route = buildPedRoute(crossing, edge, cfg.laneWidthM, rng);
        if (!route) continue;
        const agent = createPedestrianAgent(
          pedId,
          route,
          mulberry32(cfg.seed ^ (0x9e3779b9 + pedId * 0x85ebca6b)),
          Math.floor(rng() * PED_COLOR_VARIANTS),
          cfg,
        );
        this.pedestrianAgents.push(agent);
        this.pedestrians.push(agent.state);
        pedId++;
      }
    }

    // --- Ambient PAVEMENT walkers: the population the crossing loop above
    // cannot reach, because 84 of the 105 committed districts declare no
    // crossing at all. Same agent, same update, same lateral geometry — a
    // route with no `cross` segment, so `crossingCounts` (and through it every
    // rule-engine crossing duty) is untouched. The reasoning in full is the
    // „SIDEWALK-ONLY WALKERS" block in pedestrians.ts.
    //
    // The ids CONTINUE `pedId` rather than restarting: `TrafficPedestrianState
    // .id` is what `NpcColliders` reports a near-miss under and what
    // `worldLabel` bubbles hang off, and two agents sharing one id is a defect
    // that only shows up as a mislabelled person.
    if (cfg.sidewalkPedestrianCount > 0) {
      // The SAME predicate the budget is sized from — a count that says 2 and a
      // filter that still offers a motorway ramp is how the ramp got populated.
      const footwayless = footwaylessEdgeIds(
        district.roads.edges,
        cfg.footwaylessRoadClasses,
        cfg.laneWidthM,
      );
      const walkable = district.roads.edges.filter(
        (e) => !footwayless.has(e.id) && e.geometry.length >= 2 && e.length >= SIDEWALK_MIN_EDGE_M,
      );
      if (cfg.anchor) {
        // Nearest edge midpoint first — people where the driver is, the same
        // rule the crossing loop and `buildRoutes` already follow.
        const ax = cfg.anchor.x;
        const ay = cfg.anchor.y;
        const midDist = (e: DistrictEdge): number => {
          const g = e.geometry[Math.floor(e.geometry.length / 2)];
          return Math.hypot(g[0] - ax, g[1] - ay);
        };
        walkable.sort((a, b) => midDist(a) - midDist(b));
      } else {
        walkable.sort((a, b) => (a.id < b.id ? -1 : 1));
      }
      // Two passes so a one-edge map (ln-v1, vu-door-v1, every ov-* street)
      // still gets both of its pavements populated instead of one walker.
      let placed = 0;
      for (let pass = 0; pass < 4 && placed < cfg.sidewalkPedestrianCount; pass++) {
        for (const edge of walkable) {
          if (placed >= cfg.sidewalkPedestrianCount) break;
          // Alternate sides so the two pavements fill evenly, and spread the
          // beats along the edge rather than stacking them on one spot.
          const side: 1 | -1 = placed % 2 === 0 ? 1 : -1;
          const anchorS = edge.length * ((pass + 0.5) / 4 + rngRange(rng, -0.12, 0.12));
          const route = buildPedSidewalkRoute(edge, cfg.laneWidthM, side, anchorS, rng);
          if (!route) continue;
          const agent = createPedestrianAgent(
            pedId,
            route,
            mulberry32(cfg.seed ^ (0x7f4a7c15 + pedId * 0xc2b2ae35)),
            Math.floor(rng() * PED_COLOR_VARIANTS),
            cfg,
          );
          this.pedestrianAgents.push(agent);
          this.pedestrians.push(agent.state);
          pedId++;
          placed++;
        }
      }
    }

    this.vehicleEnv = {
      cfg,
      graph: this.graph,
      agents: this.vehicleAgents,
      reservations: this.reservations,
      crossingCounts: this.crossingCounts,
      signalPhase: () => "green",
      timeSec: 0,
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedMps: 0,
      playerDirX: 0,
      playerDirY: 1,
      staged: this.stagedStates,
    };
    this.pedestrianEnv = {
      cfg,
      graph: this.graph,
      vehicles: this.vehicleAgents,
      crossingCounts: this.crossingCounts,
      signalPhase: () => "green",
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedKmh: 0,
    };

    this.stagedEnv = {
      hasPlayer: false,
      playerX: 0,
      playerY: 0,
      playerSpeedMps: 0,
      crossingCounts: this.crossingCounts,
      // FR-27, the mirror half: scripted actors see ambient cars. The array is
      // the ambient agents' own state objects (staged states are NOT in it).
      ambient: this.ambientStates,
      // FR-B5-REACH: …and, on their UNSCRIPTED return laps only, each other.
      // Held by reference like the array above, so an actor staged later is
      // seen from the frame it arrives on. Read by staged.ts step 3c and by
      // nothing else — see the `staged` field's doc for why it is not merged
      // into `ambient`.
      staged: this.stagedStates,
    };

    // Publish initial poses (dt = 0 moves nothing, only samples polylines).
    for (const agent of this.pedestrianAgents) updatePedestrian(agent, 0, this.pedestrianEnv);
    for (const agent of this.vehicleAgents) updateVehicle(agent, 0, this.vehicleEnv);

    this.stats = {
      vehicleCount: this.vehicleAgents.length,
      pedestrianCount: this.pedestrianAgents.length,
      routeCount: this.routes.length,
      laneCount: this.graph.lanes.length,
    };
  }

  /**
   * Advance the whole world by `dtSec`, in sub-steps of at most
   * `MAX_SUBSTEP_SEC`.
   *
   * `!(dtSec > 0)` catches zero, negatives AND NaN in one predicate — the same
   * three cases, with the same answers, the old `dt` expression produced
   * (`NaN > 0.1` is false, so `dt` was NaN, so `!(dt > 0)` returned). It is
   * also `sessionClockAdvance`'s NaN ruling: a NaN clock stops the world
   * silently and forever, so refusing the frame is the honest match.
   *
   * BIT-IDENTICAL BELOW 10 FPS. At `dtSec <= MAX_SUBSTEP_SEC` this is one step
   * of exactly `dtSec` — same call, same argument, same order — so every test
   * that drives at 1/60 or 1/20 sees the byte it always saw. Above it the
   * steps are EQUAL (`dtSec / n`), not "0.1 until the remainder": a trailing
   * sliver step is a second, differently-sized integration nobody measured.
   *
   * Cost: at most five sub-steps, because `MAX_FRAME_DT_SEC / MAX_SUBSTEP_SEC`
   * is five. That bound matters on exactly the frames this fix is for — a
   * phone already 3 s behind must not be handed thirty times the traffic work
   * to catch up, which is how a stall becomes a spiral. MEASURED on this box,
   * real district, 2,000 warmed frames each:
   *
   *   population      update(1/60)   update(0.1)   update(0.5)
   *   10 cars  8 peds     10.7 µs        5.7 µs       22.9 µs
   *   24 cars 20 peds     16.8 µs       21.4 µs       62.9 µs
   *
   * The worst row is 63 µs of work inside a frame that is, by definition,
   * 500,000 µs long — 0.013 % of it, and 42 µs more than the truncated version
   * it replaces. The spiral is not reachable from here; the frame's own cost is
   * three.js and the render graph (docs/simulation/91_MOBILE_AUDIT §G2: our own
   * app code is 2–5 % of CPU self time, rapier 0.2–0.5 %).
   */
  update(dtSec: number, ctx: TrafficUpdateContext): void {
    const { steps, dt } = trafficSubStepPlan(dtSec);
    if (steps === 0) {
      this.stagedListener?.frameEnd();
      return;
    }

    const vEnv = this.vehicleEnv;
    const pEnv = this.pedestrianEnv;
    vEnv.signalPhase = ctx.signalPhase;
    pEnv.signalPhase = ctx.signalPhase;
    if (ctx.playerPos) {
      vEnv.hasPlayer = true;
      pEnv.hasPlayer = true;
      vEnv.playerX = ctx.playerPos.x;
      vEnv.playerY = ctx.playerPos.y;
      pEnv.playerX = ctx.playerPos.x;
      pEnv.playerY = ctx.playerPos.y;
      const kmh = ctx.playerSpeedKmh ?? 50; // unknown speed = assume moving
      vEnv.playerSpeedMps = kmh / 3.6;
      pEnv.playerSpeedKmh = kmh;
      if (ctx.playerHeadingDeg !== undefined) {
        const rad = (ctx.playerHeadingDeg * Math.PI) / 180;
        vEnv.playerDirX = Math.sin(rad); // 0 deg = north (+y), cw positive
        vEnv.playerDirY = Math.cos(rad);
      } else {
        vEnv.playerDirX = 0;
        vEnv.playerDirY = 0; // no heading -> never "aligned", treated static
      }
    } else {
      vEnv.hasPlayer = false;
      pEnv.hasPlayer = false;
    }

    const sEnv = this.stagedEnv;
    sEnv.hasPlayer = vEnv.hasPlayer;
    sEnv.playerX = vEnv.playerX;
    sEnv.playerY = vEnv.playerY;
    sEnv.playerSpeedMps = vEnv.playerSpeedMps;

    // Without the session clock (`sessionTimeSec` absent: the recorder, the
    // clip feed, unit fixtures) the AMBIENT agents read the player pose above,
    // set ONCE per frame, on every ambient sub-step (the one-frame staleness the
    // header documents) and staged actors read a pose interpolated from the
    // previous update's. With it (LessonScene, the replay harness), every body
    // advances in whole steps at the session's grid points and reads his pose
    // AT the grid point its step ends on (`stepGrid`, sc-roundabout-entry:
    // 7b747c15 round 3). The
    // hard anti-overlap clamps in vehicles.ts / staged.ts
    // re-read the AGENT's own fresh pose on every sub-step, so the „never clip
    // the player" guarantee is re-asserted five times a frame instead of once.
    //
    // Staged actors last within each sub-step: they read the freshest player
    // pose and publish into the same state arrays; ambient agents never read
    // them (documented v1 limitation — see staged.ts header).
    //
    // sc-roundabout-entry:7b747c15 — THE STAGED WORLD RUNS ON THE PHYSICS STEP.
    // Within each ambient sub-step the staged actors take `per` equal steps of
    // at most STAGED_MAX_SUBSTEP_SEC, and on a frame that has more than one of
    // them the player's pose is interpolated across the frame instead of being
    // held at its end — what the staged actors' guards read, and what the
    // listener (the director) decides on between two steps. With one staged
    // step in the frame (every 60 Hz frame) the end pose is used, no listener
    // call is made, and the frame is the exact call sequence it always was.
    const per = stagedSubStepsPer(dt);
    const hS = dt / per;
    const frameSec = steps * dt;
    // With the session clock known the world runs on the FIXED-STEP GRID
    // (`stepGrid`, round 3); otherwise into `per` equal steps per ambient
    // sub-step, as round 1 did.
    const sessionEnd = ctx.sessionTimeSec;
    const aligned = sessionEnd !== undefined && Number.isFinite(sessionEnd);
    const endX = sEnv.playerX;
    const endY = sEnv.playerY;
    const endMps = sEnv.playerSpeedMps;
    const endKmh = endMps * 3.6;
    const endHeading = ctx.playerHeadingDeg ?? this.prevPlayerHeadingDeg;
    // Interpolate only across continuous motion: a pose step longer than the
    // faster of the two speeds can carry in this frame (+ slack) is a respawn
    // or a retry, and a drive across it never happened.
    const continuous =
      sEnv.hasPlayer &&
      this.prevPlayerValid &&
      Math.hypot(endX - this.prevPlayerX, endY - this.prevPlayerY) <=
        (Math.max(Math.abs(endKmh), Math.abs(this.prevPlayerKmh)) / 3.6) * frameSec +
          STAGED_PLAYER_JUMP_SLACK_M;
    // C1 (round 2): where the vehicle simulation handed over the states it
    // actually integrated inside this frame, the sub-steps read THOSE instead
    // of the chord (see `PlayerStepTrack`) — and then nothing is being
    // invented, so a pose step the speeds cannot explain is no reason to stop
    // reading them: the jump sits between two real samples. MEASURED on
    // sc-rb-ped-exit shadow-correct L2 at 0.25/0.4 s: the committed drive moves
    // 4.48 m in the 0.4 s frame ending 31.6 s while its speed field reads
    // 12 км/ч, so the chord test called it a teleport, the frame ran no
    // sub-step, and the crosser was released at the frame end, 317 ms after the
    // 60 Hz release — on a frame grid that is the 60 Hz grid exactly.
    const tr = ctx.playerTrack;
    const tracked = tr != null && tr.count > 0 && sEnv.hasPlayer && this.prevPlayerValid;
    const readable = continuous || tracked;
    this.track = readable && tracked ? tr : null;
    this.trackFrameSec = frameSec;
    const sp = this.subPlayer;
    if (aligned) {
      this.stepGrid(sessionEnd as number, frameSec, readable, ctx, endX, endY, endMps, endHeading);
    } else {
      const total = steps * per;
      const interp = total > 1 && readable;
      const listener = interp ? this.stagedListener : null;
      // No fixed grid without the session clock: what is drawn is what is
      // simulated (`renderFraction` 1).
      this.renderLerp = false;
      for (let k = 0; k < steps; k++) {
        this.timeSec += dt;
        vEnv.timeSec = this.timeSec;
        for (let i = 0; i < this.pedestrianAgents.length; i++) {
          updatePedestrian(this.pedestrianAgents[i], dt, pEnv);
        }
        for (let i = 0; i < this.vehicleAgents.length; i++) {
          updateVehicle(this.vehicleAgents[i], dt, vEnv);
        }
        for (let m = 0; m < per; m++) {
          const j = k * per + m;
          if (listener !== null && j > 0) {
            this.playerAt(j / total, endX, endY, endKmh, endHeading, sp);
            listener.substep(j * hS, hS, frameSec, sp);
          }
          if (interp) {
            // The guards integrate over [j, j+1]: they read the pose at its end,
            // as the single-step frame reads the frame's end.
            this.playerAt((j + 1) / total, endX, endY, endKmh, endHeading, sp);
            sEnv.playerX = sp.x;
            sEnv.playerY = sp.y;
            sEnv.playerSpeedMps = sp.speedKmh / 3.6;
          }
          for (let i = 0; i < this.stagedVehicles.length; i++) {
            updateStagedVehicle(this.stagedVehicles[i], hS, sEnv);
          }
          for (let i = 0; i < this.stagedPeds.length; i++) {
            updateStagedPedestrian(this.stagedPeds[i], hS, sEnv);
          }
        }
      }
      this.stagedListener?.frameEnd();
    }
    sEnv.playerX = endX;
    sEnv.playerY = endY;
    sEnv.playerSpeedMps = endMps;
    this.prevPlayerValid = sEnv.hasPlayer;
    this.prevPlayerX = endX;
    this.prevPlayerY = endY;
    this.prevPlayerKmh = endKmh;
    this.prevPlayerHeadingDeg = endHeading;
  }

  /**
   * sc-roundabout-entry:7b747c15 round 3 — THE FIXED-STEP ACCUMULATOR.
   *
   * The world (ambient fleet, staged actors), the director's runners and the
   * contact sentinel advance ONLY at the session's grid points k·FIXED_DT, and
   * `gridK` — an INTEGER — is the index of the last one reached. A frame ending
   * at session time T takes exactly `floor(T / FIXED_DT) − gridK` steps of
   * exactly FIXED_DT, each reading the student's state AT the grid point it
   * ends on; a frame that crosses no grid point advances nothing. So every
   * cadence integrates the same sequence of identical steps, and nothing
   * accumulates in floating point between them (`gridK · FIXED_DT` is the
   * clock, not a running sum).
   *
   * Round 2 had cut a step at every frame end instead. MEASURED by its verifier
   * over every committed demo with ambient off: steady 120 Hz put 75 cells more
   * than one physics step off the 60 Hz staged poses, 144 Hz 99, a real desktop
   * jitter (PC_JITTER_MS) 40 cells up to 7.5 steps (2.47 m) — the director ran
   * every 7–17 ms there and a student-distance latch fired 25–33 ms late.
   *
   * The director decides once per grid point, on the state the step left: after
   * every step whose grid point lies inside the frame (listener `substep`,
   * handed the grid time), and — when the frame ends ON a grid point, as every
   * 60 Hz replay frame does — in its own frame step, which is then the exact
   * call sequence it always was (`frameEnd(true)`). `frameEnd(false)` tells it
   * the frame end is not a grid point: nothing is decided there.
   *
   * The student is integrated by rapier at the same FIXED_DT (LessonScene
   * `<Physics timeStep={FIXED_DT}>`), on its own accumulator; his per-step
   * states (`PlayerStepTrack`) are read at the grid points. What is DRAWN is
   * interpolated between the last two grid states (`renderFraction`), exactly
   * as rapier draws his car: one step behind the frame end, never off the
   * segment between two simulated states.
   */
  private stepGrid(
    sessionEnd: number,
    frameSec: number,
    readable: boolean,
    ctx: TrafficUpdateContext,
    endX: number,
    endY: number,
    endMps: number,
    endHeading: number,
  ): void {
    const H = STAGED_MAX_SUBSTEP_SEC;
    const vEnv = this.vehicleEnv;
    const pEnv = this.pedestrianEnv;
    const sEnv = this.stagedEnv;
    const sp = this.subPlayer;
    const endKmh = endMps * 3.6;
    const frameStart = sessionEnd - frameSec;
    const target = Math.floor(sessionEnd / H + GRID_EPS_STEPS);
    // First frame (or a clock that went backwards): the grid starts at the
    // frame's start, so this frame takes the steps inside it and no more.
    if (!this.gridInit || sessionEnd < this.gridLastT - STAGED_GRID_EPS_SEC) {
      this.gridK = Math.min(target, Math.floor(frameStart / H + GRID_EPS_STEPS));
      this.gridInit = true;
    }
    this.gridLastT = sessionEnd;
    let n = target - this.gridK;
    if (n > GRID_MAX_STEPS) {
      // Never reached through the 0.5 s session clamp; a guard, not a policy.
      this.gridK = target - GRID_MAX_STEPS;
      n = GRID_MAX_STEPS;
    }
    const endOnGrid = Math.abs(sessionEnd - target * H) <= STAGED_GRID_EPS_SEC;
    // Decisions inside the frame need the student's state inside it; across a
    // teleport there is none, and the director decides at the frame end.
    const listener = readable ? this.stagedListener : null;
    for (let i = 1; i <= n; i++) {
      const k = this.gridK + 1;
      const atEnd = i === n && endOnGrid;
      const tau = atEnd ? frameSec : k * H - frameStart;
      if (atEnd || !readable) {
        sp.x = endX;
        sp.y = endY;
        sp.speedKmh = endKmh;
        sp.headingDeg = endHeading;
      } else {
        this.playerAtTau(tau, endX, endY, endKmh, endHeading, sp);
      }
      sEnv.playerX = sp.x;
      sEnv.playerY = sp.y;
      sEnv.playerSpeedMps = sp.speedKmh / 3.6;
      vEnv.playerX = sp.x;
      vEnv.playerY = sp.y;
      vEnv.playerSpeedMps = sp.speedKmh / 3.6;
      pEnv.playerX = sp.x;
      pEnv.playerY = sp.y;
      pEnv.playerSpeedKmh = sp.speedKmh;
      if (ctx.playerHeadingDeg !== undefined) {
        const rad = (sp.headingDeg * Math.PI) / 180;
        vEnv.playerDirX = Math.sin(rad);
        vEnv.playerDirY = Math.cos(rad);
      }
      // What is drawn between this step and the next frame's: the pose before
      // the frame's LAST step (`renderFraction`).
      if (i === n) this.snapshotRender();
      this.timeSec += H;
      vEnv.timeSec = this.timeSec;
      for (let a = 0; a < this.pedestrianAgents.length; a++) {
        updatePedestrian(this.pedestrianAgents[a], H, pEnv);
      }
      for (let a = 0; a < this.vehicleAgents.length; a++) {
        updateVehicle(this.vehicleAgents[a], H, vEnv);
      }
      for (let a = 0; a < this.stagedVehicles.length; a++) {
        updateStagedVehicle(this.stagedVehicles[a], H, sEnv);
      }
      for (let a = 0; a < this.stagedPeds.length; a++) {
        updateStagedPedestrian(this.stagedPeds[a], H, sEnv);
      }
      this.gridK = k;
      // The director decides on the state this step left, at this grid point —
      // here when the point is inside the frame, in its own frame step when it
      // is the frame's end.
      if (listener !== null && !atEnd) listener.substep(tau, H, frameSec, sp, k * H);
    }
    // The frame's own pose, for every reader after the frame.
    vEnv.playerX = endX;
    vEnv.playerY = endY;
    vEnv.playerSpeedMps = endMps;
    pEnv.playerX = endX;
    pEnv.playerY = endY;
    pEnv.playerSpeedKmh = endKmh;
    if (ctx.playerHeadingDeg !== undefined) {
      const rad = (ctx.playerHeadingDeg * Math.PI) / 180;
      vEnv.playerDirX = Math.sin(rad);
      vEnv.playerDirY = Math.cos(rad);
    }
    this.renderLerp = true;
    this.renderAlpha = Math.min(1, Math.max(0, (sessionEnd - this.gridK * H) / H));
    if (endOnGrid) this.renderAlpha = 0;
    this.stagedListener?.frameEnd(endOnGrid || !readable, H);
  }

  /** Copy every published pose: the start of the segment `renderFraction`
   *  interpolates along. */
  private snapshotRender(): void {
    const nv = this.vehicles.length;
    if (this.renderPrevVeh.length < nv * 4) this.renderPrevVeh = new Float64Array(nv * 8);
    for (let i = 0; i < nv; i++) {
      const v = this.vehicles[i];
      const o = i * 4;
      this.renderPrevVeh[o] = v.x;
      this.renderPrevVeh[o + 1] = v.y;
      this.renderPrevVeh[o + 2] = v.dirX;
      this.renderPrevVeh[o + 3] = v.dirY;
    }
    this.renderPrevVehCount = nv;
    const np = this.pedestrians.length;
    if (this.renderPrevPed.length < np * 4) this.renderPrevPed = new Float64Array(np * 8);
    for (let i = 0; i < np; i++) {
      const p = this.pedestrians[i];
      const o = i * 4;
      this.renderPrevPed[o] = p.x;
      this.renderPrevPed[o + 1] = p.y;
      this.renderPrevPed[o + 2] = p.dirX;
      this.renderPrevPed[o + 3] = p.dirY;
    }
    this.renderPrevPedCount = np;
  }

  /**
   * Round 4 — the frame end, for what is DRAWN, when the caller advanced the
   * world one grid point per `update(FIXED_DT, { sessionTimeSec: k·FIXED_DT })`
   * call (scene/gradeGrid.ts): every such call ends ON its grid point
   * (`renderFraction` 0), so the frame end past the newest one — or a frame
   * that crossed no grid point at all, and made no call — is handed over
   * here. Exactly `stepGrid`'s fraction: the frame end's distance past the
   * newest grid state, in steps; nothing simulated moves.
   */
  setRenderSessionTime(sessionTimeSec: number): void {
    if (!this.gridInit || !Number.isFinite(sessionTimeSec)) return;
    const H = STAGED_MAX_SUBSTEP_SEC;
    const past = sessionTimeSec - this.gridK * H;
    this.renderLerp = true;
    this.renderAlpha = Math.abs(past) <= STAGED_GRID_EPS_SEC ? 0 : Math.min(1, Math.max(0, past / H));
  }

  get renderFraction(): number {
    return this.renderLerp ? this.renderAlpha : 1;
  }

  vehicleRenderPose(i: number, out: TrafficRenderPose): TrafficRenderPose {
    return this.renderPose(this.vehicles[i], i, this.renderPrevVeh, this.renderPrevVehCount, out);
  }

  pedestrianRenderPose(i: number, out: TrafficRenderPose): TrafficRenderPose {
    return this.renderPose(this.pedestrians[i], i, this.renderPrevPed, this.renderPrevPedCount, out);
  }

  private renderPose(
    s: { x: number; y: number; dirX: number; dirY: number } | undefined,
    i: number,
    prev: Float64Array,
    count: number,
    out: TrafficRenderPose,
  ): TrafficRenderPose {
    if (s === undefined) return out;
    out.x = s.x;
    out.y = s.y;
    out.dirX = s.dirX;
    out.dirY = s.dirY;
    if (!this.renderLerp || i >= count) return out;
    const o = i * 4;
    const px = prev[o];
    const py = prev[o + 1];
    // A teleport (a re-entry, a retry) is not a drive: draw where it now is.
    if (Math.hypot(s.x - px, s.y - py) > RENDER_JUMP_M) return out;
    const a = this.renderAlpha;
    out.x = px + (s.x - px) * a;
    out.y = py + (s.y - py) * a;
    out.dirX = prev[o + 2] + (s.dirX - prev[o + 2]) * a;
    out.dirY = prev[o + 3] + (s.dirY - prev[o + 3]) * a;
    return out;
  }

  /** The player's pose a fraction `f` of the way through this frame: on the
   *  vehicle simulation's own per-step states when the frame carries them
   *  (`PlayerStepTrack`, linear between two physics steps), else on the chord
   *  between the previous frame's pose and this one. */
  private playerAt(
    f: number,
    endX: number,
    endY: number,
    endKmh: number,
    endHeading: number,
    out: StagedSubstepPlayer,
  ): void {
    this.playerAtTau(f * this.trackFrameSec, endX, endY, endKmh, endHeading, out);
  }

  /** …the same, `tau` seconds into the frame. A track sample within 1 ns of
   *  `tau` IS the state there (the replay samples the drive at the grid
   *  points themselves; float noise must not blend it with its neighbour). */
  private playerAtTau(
    tau: number,
    endX: number,
    endY: number,
    endKmh: number,
    endHeading: number,
    out: StagedSubstepPlayer,
  ): void {
    const tr = this.track;
    const frameSec = this.trackFrameSec;
    if (tr === null) {
      const f = frameSec > 0 ? tau / frameSec : 1;
      out.x = this.prevPlayerX + (endX - this.prevPlayerX) * f;
      out.y = this.prevPlayerY + (endY - this.prevPlayerY) * f;
      out.speedKmh = this.prevPlayerKmh + (endKmh - this.prevPlayerKmh) * f;
      out.headingDeg = lerpHeadingDeg(this.prevPlayerHeadingDeg, endHeading, f);
      return;
    }
    let ta = 0;
    let ax = this.prevPlayerX;
    let ay = this.prevPlayerY;
    let ak = this.prevPlayerKmh;
    let ah = this.prevPlayerHeadingDeg;
    let tb = frameSec;
    let bx = endX;
    let by = endY;
    let bk = endKmh;
    let bh = endHeading;
    for (let k = 0; k < tr.count; k++) {
      const tk = tr.tSec[k];
      if (!(tk > 1e-9) || !(tk < frameSec - 1e-9)) continue;
      if (tk <= tau + 1e-9) {
        ta = tk;
        ax = tr.x[k];
        ay = tr.y[k];
        ak = tr.speedKmh[k];
        ah = tr.headingDeg[k];
      } else {
        tb = tk;
        bx = tr.x[k];
        by = tr.y[k];
        bk = tr.speedKmh[k];
        bh = tr.headingDeg[k];
        break;
      }
    }
    const g = tau <= ta + 1e-9 ? 0 : tb > ta ? Math.min(1, (tau - ta) / (tb - ta)) : 1;
    out.x = ax + (bx - ax) * g;
    out.y = ay + (by - ay) * g;
    out.speedKmh = ak + (bk - ak) * g;
    out.headingDeg = lerpHeadingDeg(ah, bh, g);
  }

  setStagedSubstepListener(listener: StagedSubstepListener | null): void {
    this.stagedListener = listener;
  }

  stage(spec: StagedActorSpec): StagedActorView | null {
    if (this.stagedById.has(spec.id)) return null;
    const stateId = STAGED_STATE_ID_BASE + this.stagedById.size;
    if (spec.kind === "vehicle") {
      // A railPath (the RX train's authored line) bypasses the road graph;
      // otherwise resolve the ordinary lane-graph path from pathNodes.
      const path =
        spec.railPath && spec.railPath.length >= 2
          ? buildStagedVehiclePolylinePath(spec.railPath)
          : resolveStagedVehiclePath(this.graph, spec.pathNodes, spec.extraRightOffsetM ?? 0);
      if (!path) return null;
      const agent = createStagedVehicle(spec, path, stateId, this.laneWidthM);
      this.stagedVehicles.push(agent);
      this.vehicles.push(agent.state);
      // FR-27: the ambient env holds this array by reference, so every agent
      // sees the actor from the frame it is staged on.
      this.stagedStates.push(agent.state);
      // …and no ambient car may already BE where the actor was just placed.
      // Ambient agents are seeded at construction and staged actors arrive
      // afterwards, so the two can start inside each other; a running clamp
      // cannot repair an overlap that exists on frame zero.
      const sep = vehicleHalfLengthM(spec.profile) + vehicleHalfLengthM() + 0.5;
      for (let i = 0; i < this.vehicleAgents.length; i++) {
        separateVehicleFrom(
          this.vehicleAgents[i],
          agent.state.x,
          agent.state.y,
          sep,
          this.vehicleEnv,
        );
      }
      this.stagedById.set(spec.id, agent);
      // A11: the curb offset is the staged spec's cyclist marker (audit C3 —
      // v1 "cyclists" are narrow curb-riding vehicle proxies).
      if ((spec.extraRightOffsetM ?? 0) > 0) this.cyclistStateIds.add(stateId);
      return agent.view;
    }
    const path = buildStagedPedPath(spec.path);
    if (!path) return null;
    const agent = createStagedPedestrian(spec, path, stateId);
    this.stagedPeds.push(agent);
    this.pedestrians.push(agent.state);
    this.stagedById.set(spec.id, agent);
    return agent.view;
  }

  stagedCommand(id: string, command: StagedCommand): void {
    const agent = this.stagedById.get(id);
    if (agent) applyStagedCommand(agent, command, this.stagedEnv);
  }

  staged(id: string): StagedActorView | null {
    return this.stagedById.get(id)?.view ?? null;
  }

  vehicleCollisionKind(stateId: number): "vehicle" | "cyclist" {
    return this.cyclistStateIds.has(stateId) ? "cyclist" : "vehicle";
  }

  pedestrianOnCrossing(crossingId: string): boolean {
    return (this.crossingCounts.get(crossingId) ?? 0) > 0;
  }

  leadGapMeters(px: number, py: number, headingDeg: number): number {
    return leadGapFor(this.vehicles, px, py, headingDeg);
  }

  /**
   * O59: ONE answer over BOTH kinds of body behind the player — the moving
   * agents in `this.vehicles` (unchanged, `rearGapFor` is byte-identical) and
   * the district's parked bay occupants. Which array a body was put in is not
   * a fact about the student's mirror.
   */
  rearGapMeters(px: number, py: number, headingDeg: number): number {
    return this.rearBodyBehind(px, py, headingDeg)?.gapM ?? Infinity;
  }

  /**
   * …AND WHAT KIND OF BODY THAT NUMBER IS ABOUT (sc-vu-cyclist-hook, 2026-09-04).
   *
   * `rearGapMeters` above now DELEGATES here rather than sweeping again, so the
   * metres on the badge and the noun beside them are one fact. The tie goes to
   * the parked body exactly as the old `moving < parked` expression decided it,
   * so no shipped distance moves by a float.
   *
   * The kind is `vehicleCollisionKind` — the SAME A11 marker `NpcColliders`
   * tags the rapier shell with and the contact naming bills «Удар във
   * велосипедист» from. There is no second definition of „is this a cyclist" in
   * the product and this does not add one.
   *
   * The STATIC half is „vehicle" and that is not a shrug: `staticBodies` is the
   * occupied parking bays plus the scene's held vehicle scenery
   * (`LessonScene.rearStaticBodiesFrom`), which `RearProximityCue.tsx`'s header
   * records as deliberately vehicles-only — a wall is kept out of this channel
   * precisely so the badge cannot say something false about it.
   */
  rearBodyBehind(px: number, py: number, headingDeg: number): RearBodyBehind | null {
    const moving = rearNearestFor(this.vehicles, px, py, headingDeg);
    const parked = rearStaticGapFor(this.staticBodies, px, py, headingDeg);
    if (moving !== null && moving.gapM < parked) {
      return {
        gapM: moving.gapM,
        kind: this.vehicleCollisionKind(this.vehicles[moving.index].id),
      };
    }
    return Number.isFinite(parked) ? { gapM: parked, kind: "vehicle" } : null;
  }

  /**
   * O62: hand the rear channel the bodies the SCENE actually mounted.
   *
   * REPLACES rather than appends, and that is the load-bearing half. The
   * scene's list is a strict superset built from the same recipe the colliders
   * come from (`scene/lessonWorldRecipe.buildLessonWorldCore`: the occupied
   * bays PLUS `heldSceneryFor`), so appending would sweep every bay twice —
   * once boxed from the district by `occupiedBayBodies` and once boxed from
   * the rig the renderer measured — and „one body, two arrays, two answers" is
   * the exact defect `collision/bodies.ts` records twice already. It also
   * closes a hazard the district source cannot: `buildLessonWorldCore` mounts
   * obstacles only for a SCENARIO lesson id, so a hand-authored lesson on one
   * of the sixteen bay-carrying districts sees PAINTED bays with no cars in
   * them — the district set would have warned about bodies that are not there,
   * and an empty replacement is the honest answer for that lesson.
   *
   * AND THE CALLER IS NOW TESTED, WHICH IT WAS NOT (2026-08-20). This method is
   * the RECEIVER; whether anything calls it is a separate fact, and for a day
   * it was an unmeasured one — a refuter deleted BOTH call sites from
   * `components/sim/LessonScene.tsx` and 11,696 tests stayed green, because
   * nothing in the repo renders that component and the test covering this array
   * calls this setter itself. `components/sim/__tests__/rearStaticBodiesSeam
   * .test.tsx` closes that by mounting the real scene and reading the
   * publication off the rendered tree. A second scene that owns a traffic
   * system needs its own such test: a receiver cannot tell whether it was fed.
   *
   * The `sixteen bay-carrying districts` above is also worth reading precisely
   * — measured 2026-08-20, none of the 8 hand-authored `lessons/specs.LESSONS`
   * loads one today, so that hazard is a guard against an authoring decision
   * rather than a live defect in a shipped lesson.
   */
  setRearStaticBodies(bodies: readonly Obb2D[]): void {
    this.staticBodies = bodies;
  }

  conflictNear(x: number, y: number, radiusM: number, approachBearingDeg: number): boolean {
    return conflictNearFor(this.vehicles, x, y, radiusM, approachBearingDeg);
  }

  oncomingNear(px: number, py: number, headingDeg: number, radiusM: number): OncomingApproach | null {
    return oncomingApproachFor(this.vehicles, px, py, headingDeg, radiusM);
  }

  conflictFromRight(
    jx: number,
    jy: number,
    px: number,
    py: number,
    headingDeg: number,
    radiusM: number,
    playerSpeedKmh?: number,
  ): boolean {
    return conflictFromRightFor(
      this.vehicles,
      jx,
      jy,
      px,
      py,
      headingDeg,
      radiusM,
      playerSpeedKmh,
    );
  }

  circulatingConflict(
    cx: number,
    cy: number,
    px: number,
    py: number,
    headingDeg: number,
    bandRadiusM: number,
  ): boolean {
    return circulatingConflictFor(this.vehicles, cx, cy, px, py, headingDeg, bandRadiusM);
  }

  circulatingTraffic(
    cx: number,
    cy: number,
    px: number,
    py: number,
    headingDeg: number,
    bandRadiusM: number,
  ): CirculatingReport {
    // Ambient agents first, staged after — the order `this.vehicles` publishes
    // them in, so the report is deterministic and matches the presence scan.
    const rows = this.circulatingRows;
    let n = circulatingRowsFor(this.vehicleAgents, cx, cy, px, py, headingDeg, bandRadiusM, rows, 0);
    n = circulatingRowsFor(this.stagedVehicles, cx, cy, px, py, headingDeg, bandRadiusM, rows, n);
    rows.length = n;
    const report = this.circulatingReport;
    report.conflict = circulatingConflictFor(this.vehicles, cx, cy, px, py, headingDeg, bandRadiusM);
    return report;
  }

  cyclistNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null {
    return cyclistNearFor(
      this.vehicles,
      (stateId) => this.cyclistStateIds.has(stateId),
      px,
      py,
      headingDeg,
      radiusM,
    );
  }

  overtakenNear(px: number, py: number, headingDeg: number, radiusM: number): CyclistApproach | null {
    return sameDirVehicleNearFor(
      this.vehicles,
      (stateId) => this.cyclistStateIds.has(stateId),
      px,
      py,
      headingDeg,
      radiusM,
    );
  }

  sameDirVehiclesNear(px: number, py: number, headingDeg: number, radiusM: number): readonly SameDirVehicle[] {
    return sameDirVehiclesWithinFor(
      this.vehicles,
      (stateId) => this.cyclistStateIds.has(stateId),
      px,
      py,
      headingDeg,
      radiusM,
    );
  }
}

/**
 * Pure "EVERY same-direction vehicle near the player" query — the lane-entry
 * adjudicator's seam (founder ruling 2026-09-30, «bill the forced braking»;
 * sc-merge-lane-end:0487bcec round 3). `sameDirVehicleNearFor`'s filter
 * exactly — cyclist proxies never qualify (their pass is VU-02's act), a
 * vehicle heading more than the same-direction cone off the player's own
 * heading is oncoming/crossing traffic and never returns — but every vehicle
 * inside the radius rather than the nearest: which one a lane entry is judged
 * against (behind him, in the lane he entered) is the runtime's to decide on
 * the road it knows. Published order is state order, deterministic.
 */
export function sameDirVehiclesWithinFor(
  vehicles: readonly {
    id: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
    profile?: VehicleProfile;
  }[],
  isCyclist: (stateId: number) => boolean,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): SameDirVehicle[] {
  const r2 = radiusM * radiusM;
  const out: SameDirVehicle[] = [];
  for (const v of vehicles) {
    if (isCyclist(v.id)) continue; // the cyclist pass is VU-02's act
    const dx = v.x - px;
    const dy = v.y - py;
    if (dx * dx + dy * dy > r2) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    // Folded angular difference, 0 = same direction … 180 = head-on oncoming.
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta > CYCLIST_SAME_DIR_DEG) continue; // oncoming/crossing → not in his stream
    out.push({
      id: v.id,
      x: v.x,
      y: v.y,
      dirX: v.dirX,
      dirY: v.dirY,
      speedMps: v.speedMps,
      halfLengthM: vehicleHalfLengthM(v.profile),
    });
  }
  return out;
}

/**
 * Pure "nearest same-direction cyclist proxy near the player" query (VU-02 —
 * the lateral-clearance duty's telemetry seam). Only states the caller tags as
 * cyclists qualify (the vehicleCollisionKind marker: staged curb-riding
 * proxies, extraRightOffsetM > 0 at stage time); a cyclist heading more than
 * CYCLIST_SAME_DIR_DEG off the player's own heading is crossing/oncoming — a
 * MEETING, not a pass — and never returns (the oncoming bank is exempt by
 * construction). Standing cyclists still return (a pass past a waiting rider
 * carries the same clearance duty); the runtime's tracker owns every further
 * bias (closing arm, speed floor, junction gate, swerve stand-down).
 */
export function cyclistNearFor(
  vehicles: readonly {
    id: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
  }[],
  isCyclist: (stateId: number) => boolean,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): CyclistApproach | null {
  const r2 = radiusM * radiusM;
  let best: CyclistApproach | null = null;
  let bestD2 = Infinity;
  for (const v of vehicles) {
    if (!isCyclist(v.id)) continue;
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 >= bestD2) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    // Folded angular difference, 0 = same direction … 180 = head-on oncoming.
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta > CYCLIST_SAME_DIR_DEG) continue; // oncoming/crossing → a meeting, not a pass
    bestD2 = d2;
    best = { x: v.x, y: v.y, dirX: v.dirX, dirY: v.dirY, speedMps: v.speedMps };
  }
  return best;
}

/**
 * Pure "nearest same-direction VEHICLE near the player" query (OV-09 — the
 * overtake-return duty's telemetry seam; the cyclistNearFor mold with the
 * cyclist filter INVERTED). Any published vehicle state qualifies EXCEPT
 * cyclist proxies (their pass duty is VU-02's lateral-clearance act — one
 * act, one code); a vehicle heading more than the same-direction cone off
 * the player's own heading is oncoming/crossing traffic — a different duty,
 * never returned. Deliberately NO ahead/behind or speed filter: the runtime's
 * return tracker reads the mate through the whole pass (ahead → alongside →
 * behind), and a guard-stopped victim must still be returned at the landing
 * (the reference-speed latch owns the rescue honesty). Nearest wins.
 */
export function sameDirVehicleNearFor(
  vehicles: readonly {
    id: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
  }[],
  isCyclist: (stateId: number) => boolean,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): CyclistApproach | null {
  const r2 = radiusM * radiusM;
  let best: CyclistApproach | null = null;
  let bestD2 = Infinity;
  for (const v of vehicles) {
    if (isCyclist(v.id)) continue; // the cyclist pass is VU-02's act
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 >= bestD2) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    // Folded angular difference, 0 = same direction … 180 = head-on oncoming.
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta > CYCLIST_SAME_DIR_DEG) continue; // oncoming/crossing → a meeting
    bestD2 = d2;
    best = { x: v.x, y: v.y, dirX: v.dirX, dirY: v.dirY, speedMps: v.speedMps };
  }
  return best;
}

/**
 * Pure "circulating vehicle approaching from the driver's left" test for a
 * roundabout entry. Right-hand traffic circles counter-clockwise, so a car
 * already on the ring reaches your entry from the LEFT. True when a moving
 * vehicle sits within the ring band AND to the driver's left — a car he should
 * be watching.
 *
 * WHAT IT IS FOR NOW (founder ruling 2026-10-05, «bill forced braking»). This
 * is PRESENCE, and presence no longer convicts anybody: a roundabout entry is
 * FAILED_TO_YIELD when a circulating car has to brake because of it, or is
 * touched (`circulatingRowsFor` below carries each car's own account to the
 * runtime's tracker). What still asks «is a car there»: the yield COMMENDATION
 * (he held back for a car that was coming) and a driver-bot deciding whether to
 * wait at the line. The history that follows is why the predicate has the
 * clauses it has; where it says a driver «was billed», read «was billed by the
 * grader of the day».
 *
 * THE QUESTION IT USED NOT TO ASK: HAS THAT CAR ALREADY GONE PAST MY ENTRY.
 *
 * Presence on the left is not priority. The left half-plane ROTATES with the
 * driver's heading, so as an entry chord turns towards the direction of
 * circulation the cars he is FOLLOWING — cars that have already passed his
 * mouth and are pulling away round the ring — swing into it. MEASURED on
 * sc-rb-busy-gap (the full live chain, L1): a driver who waits 11, 12, 14 or
 * 15 s at the line — one to five seconds longer than the lesson's own shadow —
 * and merges BEHIND the platoon was billed FAILED_TO_YIELD («опасна», 10 т.,
 * НЕИЗДЪРЖАН) while every circulating car was 46°–108° of ring DOWNSTREAM of
 * him and nothing was upstream. Waiting a little longer cost him the lesson —
 * the founder's «scoring punishes patience», word for word. A car that has
 * passed the point where he joins can never be made to slow by his joining
 * (ЗДвП чл. 50, ал. 1 is a duty not to force the priority driver to change
 * speed or direction); following it is a following-distance matter, which
 * this predicate does not grade.
 *
 * So the sibling's clause (5) of `conflictFromRightFor`, on the ring:
 *
 *  (R) DEPARTING AND CLEAR. The conflict point is the place on the car's OWN
 *      circle at the driver's azimuth about the centre — where his entry meets
 *      that car's path. A car whose angular motion about the centre has
 *      already carried it PAST that azimuth (less than half a lap past, in its
 *      own direction of travel — i.e. it will not reach his entry again until
 *      it has driven round the island) AND whose centre is more than
 *      CONFLICT_CLEARED_M (straight line) beyond that point has left the
 *      conflict point. Below that distance a car straddling his mouth still
 *      counts, exactly as on the junction twin.
 *
 *  Every car still APPROACHING his azimuth from upstream is untouched — the
 *  short gap (entering between the lead and the follower) is still billed by
 *  the follower behind him. A car whose motion is purely radial (no angular
 *  direction to read), or a driver standing on the centre, keeps the old
 *  presence-only behaviour. The clause can only ever REMOVE a conviction.
 *
 * There is deliberately NO arrival-time clause (the sibling's (6)): the query
 * is given no driver speed, and an ETA comparison is the clause that can
 * acquit an UPSTREAM car — the short-gap conviction this lesson teaches.
 */
export function circulatingConflictFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  cx: number,
  cy: number,
  px: number,
  py: number,
  headingDeg: number,
  bandRadiusM: number,
): boolean {
  const rad = (headingDeg * Math.PI) / 180;
  // Driver's LEFT vector = forward (sinH,cosH) rotated 90° CCW = (-cosH, sinH).
  const lx = -Math.cos(rad);
  const ly = Math.sin(rad);
  const r2 = bandRadiusM * bandRadiusM;
  // The driver's azimuth about the ring centre — where his entry meets the ring.
  const pcx = px - cx;
  const pcy = py - cy;
  const pRadM = Math.hypot(pcx, pcy);
  for (const v of vehicles) {
    if (circulatingPresenceOf(v, cx, cy, px, py, lx, ly, r2, pcx, pcy, pRadM) !== 0) return true;
  }
  return false;
}

/**
 * ONE vehicle's presence answer for `circulatingConflictFor` — the body of its
 * loop, shared with the circulating report so the two can never disagree:
 *
 *   0  not a conflict (outside the band, stopped, out of reach, not on his
 *      left, or DEPARTED AND CLEAR — clause (R));
 *   1  a conflict that has already gone past his azimuth but is still
 *      straddling his mouth (inside CONFLICT_CLEARED_M of it);
 *   2  a conflict still COMING to his azimuth — or one whose geometry cannot
 *      say (purely radial motion, a driver on the centre), which keeps the
 *      old presence answer.
 */
function circulatingPresenceOf(
  v: { x: number; y: number; dirX: number; dirY: number; speedMps: number },
  cx: number,
  cy: number,
  px: number,
  py: number,
  lx: number,
  ly: number,
  r2: number,
  pcx: number,
  pcy: number,
  pRadM: number,
): 0 | 1 | 2 {
  const cdx = v.x - cx;
  const cdy = v.y - cy;
  if (cdx * cdx + cdy * cdy > r2) return 0; // not in / near the ring
  if (v.speedMps < CONFLICT_MIN_SPEED_MPS) return 0; // parked / creeping
  // …and near the DRIVER, not merely near the island (B15 — see
  // CIRCULATING_REACH_M). Being inside the band is a fact about the ring; a
  // give-way duty is a fact about the two of you.
  const pdx = v.x - px;
  const pdy = v.y - py;
  if (pdx * pdx + pdy * pdy > CIRCULATING_REACH_M * CIRCULATING_REACH_M) return 0;
  if (pdx * lx + pdy * ly < RIGHT_MIN_M) return 0; // not on the left
  const past = pastEntryM(cdx, cdy, v.dirX, v.dirY, pcx, pcy, pRadM);
  if (past === null) return 2; // geometry cannot answer: still a conflict
  if (past > CONFLICT_CLEARED_M) return 0; // (R) departed and clear
  return past > 0 ? 1 : 2;
}

/**
 * THE CIRCULATING REPORT'S ROWS (founder ruling 2026-10-05, «bill forced
 * braking» — see CirculatingReport). Every agent whose body is within the band
 * of the ring, moving or not, written into `out` from index `from`; returns the
 * next free index. Rows are created once and reused. Pure: the agents are read
 * and never touched.
 *
 * NOT filtered by speed, reach or side, on purpose. Those are the PRESENCE
 * filters, and presence is exactly what a conviction may no longer rest on: a
 * car the student has just brought to a standstill is doing 0 m/s, and a car
 * braking behind him is on nobody's left. What the runtime needs from here is
 * what each car in the band has had to do — `playerShedMps`, the agent's own
 * account — and where its body is.
 */
export function circulatingRowsFor(
  agents: readonly {
    state: {
      id: number;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      speedMps: number;
      profile?: VehicleProfile;
    };
    playerShedMps: number;
  }[],
  cx: number,
  cy: number,
  px: number,
  py: number,
  headingDeg: number,
  bandRadiusM: number,
  out: CirculatingVehicle[],
  from: number,
): number {
  const rad = (headingDeg * Math.PI) / 180;
  const lx = -Math.cos(rad);
  const ly = Math.sin(rad);
  const r2 = bandRadiusM * bandRadiusM;
  const pcx = px - cx;
  const pcy = py - cy;
  const pRadM = Math.hypot(pcx, pcy);
  let n = from;
  for (const a of agents) {
    const v = a.state;
    const cdx = v.x - cx;
    const cdy = v.y - cy;
    if (cdx * cdx + cdy * cdy > r2) continue; // not in / near the ring
    let row = out[n];
    if (row === undefined) {
      row = {
        id: 0,
        x: 0,
        y: 0,
        dirX: 0,
        dirY: 0,
        speedMps: 0,
        halfLengthM: 0,
        halfWidthM: 0,
        approaching: false,
        pastEntry: false,
        playerShedMps: 0,
      };
      out[n] = row;
    }
    row.id = v.id;
    row.x = v.x;
    row.y = v.y;
    row.dirX = v.dirX;
    row.dirY = v.dirY;
    row.speedMps = v.speedMps;
    row.halfLengthM = vehicleHalfLengthM(v.profile);
    row.halfWidthM = vehicleHalfWidthM(v.profile);
    row.approaching = circulatingPresenceOf(v, cx, cy, px, py, lx, ly, r2, pcx, pcy, pRadM) === 2;
    const past = pastEntryM(cdx, cdy, v.dirX, v.dirY, pcx, pcy, pRadM);
    row.pastEntry = past !== null && past > 0;
    row.playerShedMps = a.playerShedMps;
    n++;
  }
  return n;
}

/**
 * Clause (R) of `circulatingConflictFor`: how far PAST the driver's entry has
 * this circulating car already gone — the straight line from the conflict
 * point (the place on the car's own circle at his azimuth) to its centre, m.
 * All vectors are relative to the ring centre.
 *
 *   > 0   it is past his azimuth, by this much (the car is departed and clear
 *         once this exceeds CONFLICT_CLEARED_M);
 *   0     it is still coming (upstream of his azimuth, or level with it);
 *   null  the geometry cannot answer — a driver or car on the centre, or purely
 *         radial motion with no angular direction to read. The caller keeps
 *         counting such a car.
 */
function pastEntryM(
  cdx: number,
  cdy: number,
  dirX: number,
  dirY: number,
  pcx: number,
  pcy: number,
  pRadM: number,
): number | null {
  const vRadM = Math.hypot(cdx, cdy);
  if (pRadM < 1e-6 || vRadM < 1e-6) return null;
  // Its angular direction about the centre: +1 counter-clockwise, −1 clockwise.
  const cross = cdx * dirY - cdy * dirX;
  if (Math.abs(cross) < 1e-9) return null; // purely radial: no direction to read
  const sense = cross > 0 ? 1 : -1;
  // Signed angle FROM the driver's azimuth TO the car, in the car's own
  // direction of travel: (0, π) = it is already past his azimuth (downstream),
  // (−π, 0) = it is still coming (upstream).
  const pastRad = sense * Math.atan2(pcx * cdy - pcy * cdx, pcx * cdx + pcy * cdy);
  if (!(pastRad > 0)) return 0; // upstream (or level): still a conflict
  // The conflict point on the car's own circle at his azimuth, and how far the
  // car's centre already is beyond it (straight line, like clause (5)).
  const ex = (pcx / pRadM) * vRadM;
  const ey = (pcy / pRadM) * vRadM;
  return Math.hypot(cdx - ex, cdy - ey);
}

/**
 * Pure "vehicle approaching from the player's right near a junction" test.
 *
 * THE QUESTION IT USED NOT TO ASK: WILL THE TWO OF US MEET.
 *
 * Until now this predicate tested presence and nothing else — inside `radiusM`
 * of the node, `speedMps ≥ 1`, on the player's right, bearing off his own. It
 * never asked whether the vehicle had CLEARED the conflict point, nor whether
 * it would still be there when the student arrived. Its sibling
 * `conflictNearFor` was given the first of those in doc 87 B5 („it said that I
 * didnt let the traffic cars to pass, when in Fact I let everybody pass") and
 * this one was left behind.
 *
 * MEASURED on `sc-junction-blind` (the row that sent this here), driving the
 * lesson's OWN model line — creep to (4.06, −19.5), eight seconds on the brake,
 * then the authored left turn — through `compileScenario` → `createLessonSession`
 * → `applyTick` at the ambient count each rung actually compiles to:
 *
 *   L1 n=4 → 10/20 seeds · L3 n=5 → 11/20 · L5 n=6 → 11/20, every one of them
 *   FAILED_TO_YIELD, «опасна», НЕИЗДЪРЖАН — and 0/20 on all three with the
 *   ambient bodies removed.
 *
 * The convicting vehicle, dumped at the conviction frame, is never one the
 * student obstructs. Two shapes, both of them "we are never in the box
 * together":
 *
 *   · seed 0/1/5/9/…: a car 6–16 m from the node closing at 6.5–10.7 m/s —
 *     ~1.2 s from the node, while the student is 15.4 m back needing ~3.5 s.
 *     It is 23 m GONE by the time he arrives. He is billed for the car he just
 *     spent eight seconds letting through.
 *   · seed 7/11/18/…: a car 20–24 m out crawling at 1.1–1.5 m/s — 16 to 22
 *     SECONDS from the node — while the student is already inside the junction
 *     and leaving it.
 *
 * So the clauses below, both of which can only ever REMOVE a conviction:
 *
 *  (5) DEPARTING AND CLEAR. A vehicle whose heading carries it away from the
 *      node and which is already CONFLICT_CLEARED_M past it has left the
 *      conflict point — `conflictNearFor`'s clause (2), verbatim, on the twin
 *      it was never applied to. Below that distance a car straddling the mouth
 *      still counts.
 *  (6) ARRIVAL, NOT PRESENCE. When the caller supplies the student's own
 *      approach speed, both arrivals at the node are compared. The vehicle is
 *      NOT a conflict when it will be more than CONFLICT_CLEARED_M past the
 *      node by the time he gets there (it clears first), nor when its own
 *      along-path run to the node ends more than RIGHT_ARRIVAL_LATE_SEC after
 *      he is CLEAR of the point (he is through first).
 *      Callers that pass no speed — every legacy 6-argument wiring — keep the
 *      old presence-only behaviour exactly.
 *
 * Requirement-zero (doc 64 THEO-4) is why this is not a scoring quibble: the
 * card that followed the conviction printed «✔ Правилното действие: … потегли
 * само когато никой не приближава» to a student who had crept, looked and
 * stood eight seconds on the brake. A verdict whose explanation describes a
 * different drive than the one the student drove is the thing this product
 * exists not to do.
 */
export function conflictFromRightFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  jx: number,
  jy: number,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
  playerSpeedKmh?: number,
): boolean {
  const rad = (headingDeg * Math.PI) / 180;
  // Player's right vector = forward (sinH,cosH) rotated 90° clockwise = (cosH,-sinH).
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  const r2 = radiusM * radiusM;
  // The student's own occupancy of the conflict point: he REACHES it at
  // `playerTtaSec` and is CLEAR of it CONFLICT_CLEARED_M later — his own tail
  // off the carriageway he crossed, the same length that decides when a
  // vehicle has cleared. Both are Infinity when he is standing or creeping
  // below the floor a VEHICLE needs to make a priority claim, which stands the
  // whole clause down rather than acquitting on an ETA that is known to lie
  // for slow approaches (the witness gate's own lesson, doc 62 S2).
  const playerMps = ((playerSpeedKmh ?? 0) * 1000) / 3600;
  const playerNodeDistM = Math.hypot(px - jx, py - jy);
  const playerTtaSec =
    playerMps >= CONFLICT_MIN_SPEED_MPS ? playerNodeDistM / playerMps : Infinity;
  const playerClearSec =
    playerMps >= CONFLICT_MIN_SPEED_MPS
      ? (playerNodeDistM + CONFLICT_CLEARED_M) / playerMps
      : Infinity;
  for (const v of vehicles) {
    const jdx = v.x - jx;
    const jdy = v.y - jy;
    const jd2 = jdx * jdx + jdy * jdy;
    if (jd2 > r2) continue; // not near the junction
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    if ((v.x - px) * rx + (v.y - py) * ry < RIGHT_MIN_M) continue; // not on the right
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta < CONFLICT_SAME_DIR_DEG) continue; // same-direction → not a conflict
    // How much of its own path the vehicle still has to run before it draws
    // level with the node (>0 = still coming, <0 = already past), and the rate
    // at which its straight-line distance to the node is shrinking.
    const jd = Math.sqrt(jd2);
    const alongToNodeM = -(jdx * v.dirX + jdy * v.dirY);
    const closingMps = jd > 0 ? alongToNodeM * (v.speedMps / jd) : v.speedMps;
    // (5) Already past and gone.
    if (closingMps <= 0) {
      if (jd > CONFLICT_CLEARED_M) continue;
      return true;
    }
    // (6) Still coming — but does it still matter when HE gets there?
    if (playerTtaSec !== Infinity) {
      // Where it will be, relative to the node, at the moment he reaches it:
      // >0 still short of it, <0 that many metres past it. Straight-line, like
      // clause (5) and like `conflictNearFor`'s own cleared test, so a path
      // that passes the node at an OFFSET (a cycle track 8 m off the mouth)
      // never reads as "gone" merely because it is abeam.
      const arcAtHisArrivalM = jd - closingMps * playerTtaSec;
      if (arcAtHisArrivalM < -CONFLICT_CLEARED_M) continue; // clears before he arrives
      // …and the other end: it arrives so long after he is CLEAR of the point
      // that he never made it change speed.
      //
      // Two things this line is measured against, and both were learned the
      // hard way on the way in. `playerClearSec` rather than his arrival,
      // because a driver at the mouth has a tiny time-to-node and several
      // seconds of crossing still ahead of him. And the vehicle's time is its
      // ALONG-PATH run to the node, not `jd / closingMps`: for a rider on a
      // track that passes the mouth 8 m to the side, the closing rate collapses
      // toward zero exactly when it is nearest, and the straight-line form
      // reports it as minutes away — which acquitted `sc-vu-bikelane-turn`'s
      // right-hook demo one frame before it drove into the rider.
      if (alongToNodeM / v.speedMps > playerClearSec + RIGHT_ARRIVAL_LATE_SEC) continue;
    }
    return true;
  }
  return false;
}

/**
 * Pure "most urgent oncoming vehicle ahead" query (district space; see the
 * TrafficSystem.oncomingNear doc). N1: among all moving oncoming vehicles
 * ahead within the radius, returns the one with the SMALLEST time-to-arrival
 * (distM / closingMps) — that is the gap the left-turn adjudicator must
 * grade. Null when the way is clear.
 */
export function oncomingApproachFor(
  vehicles: readonly {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
    /** Read ONLY to answer «релсово ли е» (OncomingApproach.rail). Absent =
     *  "car" on every ambient agent and on every legacy caller's fixture. */
    profile?: VehicleProfile;
  }[],
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): OncomingApproach | null {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad);
  const r2 = radiusM * radiusM;
  let best: OncomingApproach | null = null;
  let bestTta = Infinity;
  for (const v of vehicles) {
    const dx = v.x - px;
    const dy = v.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (dx * fx + dy * fy <= 0) continue; // must be ahead of the player
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta <= ONCOMING_MIN_DEG) continue; // not heading roughly opposite
    const distM = Math.sqrt(d2);
    // Closing speed: the vehicle's velocity component toward the query point
    // (unit vector vehicle → player is (-dx, -dy) / distM).
    const closingMps = distM > 0 ? (v.dirX * -dx + v.dirY * -dy) * (v.speedMps / distM) : v.speedMps;
    const tta = closingMps > 0.1 ? distM / closingMps : Infinity;
    if (tta < bestTta || (best === null && tta === Infinity)) {
      bestTta = tta;
      best = { distM, closingMps, speedMps: v.speedMps };
      // Additive, and only in the true direction: a car publishes the exact
      // pre-rail shape (`rail` absent), so no existing consumer sees a change.
      if (v.profile === "tram" || v.profile === "train") best.rail = true;
    }
  }
  return best;
}

/** Boolean form of oncomingApproachFor (legacy tests / presence checks). */
export function oncomingNearFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): boolean {
  return oncomingApproachFor(vehicles, px, py, headingDeg, radiusM) !== null;
}

/**
 * Pure "conflicting vehicle near a point" test (district space; see interface).
 *
 * THE THREE QUESTIONS IT USED NOT TO ASK (doc 87 B5 — „it said that I didnt let
 * the traffic cars to pass, when in Fact I let everybody pass").
 *
 * Until now this predicate tested exactly three things: inside `radiusM` of the
 * junction node, `speedMps ≥ 1`, and a travel bearing ≥ CONFLICT_SAME_DIR_DEG
 * off the approach. It never asked which SIDE the vehicle was on, which road
 * had PRIORITY, or whether the vehicle had already CLEARED. At Δ = 180° that
 * made **an oncoming car on the student's own road** a give-way conflict, and a
 * car that had just finished crossing in front of him stayed one for as long as
 * it took to drive 26 m. Those are the two shapes of his complaint.
 *
 * The frame it reasons in is the give-way line's own: the node (x,y) plus
 * `approachBearingDeg`, the direction the student travels as he crosses the
 * line. Forward `f = (sin b, cos b)`, right `r = (cos b, −sin b)`.
 *
 *  1. WHICH ROAD (and therefore which has PRIORITY). The single caller is
 *     `worldRuntime.fireLine` at a Б1/Б2 line, and a give-way line only ever
 *     stands on the MINOR arm — so the priority road is the CROSSING one and
 *     the student's own carriageway is not. Same-direction traffic was already
 *     excluded; a vehicle in the ONCOMING bearing band whose lateral offset
 *     from the approach axis is inside the student's own carriageway is the
 *     opposite flow of HIS road, holds no priority at this line, and is graded
 *     — where it genuinely matters, on a left turn across it — by the separate
 *     `oncomingApproachFor` channel (`worldRuntime.ts:1244`). Excluded here.
 *     The corridor gate is deliberately narrow (see OWN_ROAD_HALF_W_M): where
 *     it cannot tell, it keeps the old behaviour rather than acquit.
 *  2. HAS IT CLEARED. A vehicle whose heading carries it AWAY from the node and
 *     which is already CONFLICT_CLEARED_M past it has left the conflict point;
 *     it is the car he waited for, not the car he cut up.
 *  3. WHICH SIDE. Falls out of 1 and 2: what survives is crossing traffic from
 *     the left or the right that is still coming. `conflictFromRightFor` remains
 *     the separate, stricter right-hand-rule test — this line never called it.
 *
 * Direction of travel: every clause can only REMOVE a conviction, never add
 * one. A crossing car still approaching the mouth convicts exactly as before —
 * that half is gated by conflict.test.ts, which asserts both directions.
 */
export function conflictNearFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  x: number,
  y: number,
  radiusM: number,
  approachBearingDeg: number,
): boolean {
  const rad = (approachBearingDeg * Math.PI) / 180;
  // Right of the approach axis = forward (sin b, cos b) rotated 90° clockwise.
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  const r2 = radiusM * radiusM;
  for (const v of vehicles) {
    const dx = v.x - x;
    const dy = v.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    // Bearing of the vehicle's travel (0 = north, clockwise).
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - approachBearingDeg) % 360) + 540) % 360 - 180);
    if (delta < CONFLICT_SAME_DIR_DEG) continue; // same-direction → not a conflict
    // (1) Oncoming INSIDE my own carriageway = the opposite flow of MY road,
    // which the Б1/Б2 line does not ask me to yield to. Applied only in the
    // oncoming band, so a car merely CROSSING the axis is untouched.
    if (delta > ONCOMING_MIN_DEG && Math.abs(dx * rx + dy * ry) <= OWN_ROAD_HALF_W_M) continue;
    // (2) Already cleared: heading away from the node AND far enough past it
    // that its tail is off the carriageway it crossed.
    if (dx * v.dirX + dy * v.dirY > 0 && d2 > CONFLICT_CLEARED_M * CONFLICT_CLEARED_M) continue;
    return true;
  }
  return false;
}

/**
 * Pure gap-to-nearest-vehicle-ahead helper (district space; headingDeg 0 = north,
 * clockwise). A vehicle counts only when ahead and within a lane-width corridor;
 * returns bumper-to-bumper metres, or Infinity when the road ahead is clear.
 *
 * T17(e): the subtrahend is now the LEAD'S OWN profile length, not one fixed
 * car constant. A `car` (or a profile-less ambient agent) subtracts exactly the
 * historical 4.1 m, so every pre-profile gap is unchanged to the bit; a truck
 * loses 3.75 m of its own half instead of 2.05, a tram 7, a train 17.2 — which
 * is the honest bumper the student is actually approaching.
 */
export function leadGapFor(
  vehicles: readonly { x: number; y: number; profile?: VehicleProfile }[],
  px: number,
  py: number,
  headingDeg: number,
): number {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  let best = Infinity;
  for (const v of vehicles) {
    const rx = v.x - px;
    const ry = v.y - py;
    const fwd = rx * fx + ry * fy;
    if (fwd <= 0) continue; // not ahead
    const lat = Math.abs(rx * -fy + ry * fx); // perpendicular offset
    if (lat > LEAD_CORRIDOR_M) continue; // not in my lane/path
    const gap = fwd - bumperSubtrahendM(v.profile);
    if (gap < best) best = gap;
  }
  return best === Infinity ? Infinity : Math.max(0, best);
}

/**
 * The nearest body BEHIND the player, as an INDEX into the swept array plus the
 * gap — the one sweep `rearGapFor` and `rearBodyBehind` both read.
 *
 * WHY THE INDEX AND NOT JUST THE NUMBER (sc-vu-cyclist-hook, 2026-09-04). The
 * badge this feeds prints «Кола отзад · X м» — *a car* behind — and
 * `RearProximityCue.tsx`'s own header already refuses to feed it a wall for
 * exactly that reason („«Кола отзад · 1 м» about a concrete wall is the badge
 * stating something false"). The moving half never got that care: `this.vehicles`
 * holds the STAGED actors too, and a v1 cyclist is a narrow curb-riding vehicle
 * agent in that same array. On `sc-vu-cyclist-hook` — ambient traffic 0, no
 * bays, no held scenery — the staged rider is the ONLY body the sweep can ever
 * return, and the badge called it a car; `.audit-frames/sweep161/
 * sc-vu-cyclist-hook/mobile-right/04-t184s.png` photographs «Кола отзад · 12 м»
 * in a district that contains no car at all. In the one lesson about the right
 * hook, that is the product pointing a student's mirror at the wrong hazard.
 *
 * ONE SWEEP, NOT TWO. `rearGapFor` is this function with the index dropped, so
 * the number the badge shows and the kind it names can never come from two
 * different passes — the „one body, two arrays, two answers" failure
 * `collision/bodies.ts` records twice.
 */
export function rearNearestFor(
  vehicles: readonly { x: number; y: number; profile?: VehicleProfile }[],
  px: number,
  py: number,
  headingDeg: number,
): { index: number; gapM: number } | null {
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  let best = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const rx = v.x - px;
    const ry = v.y - py;
    const fwd = rx * fx + ry * fy;
    if (fwd >= 0) continue; // not behind
    const lat = Math.abs(rx * -fy + ry * fx); // perpendicular offset
    if (lat > LEAD_CORRIDOR_M) continue; // not in my lane/path
    const gap = -fwd - bumperSubtrahendM(v.profile);
    if (gap < best) {
      best = gap;
      bestIndex = i;
    }
  }
  return bestIndex < 0 ? null : { index: bestIndex, gapM: Math.max(0, best) };
}

/**
 * Pure gap-to-nearest-vehicle-BEHIND helper — leadGapFor with the forward test
 * flipped (same corridor, same bumper constant). HUD-ONLY channel (the PROX
 * rear-proximity cue reads it at ~5 Hz); no rule-engine detector consumes it,
 * so adding it changes no grading. Returns Infinity when nothing is behind —
 * the cue's honesty contract (no vehicle ⇒ no badge) rests on that.
 */
export function rearGapFor(
  vehicles: readonly { x: number; y: number; profile?: VehicleProfile }[],
  px: number,
  py: number,
  headingDeg: number,
): number {
  return rearNearestFor(vehicles, px, py, headingDeg)?.gapM ?? Infinity;
}

// ---------------------------------------------------------------------------
// O59 — THE STATIC HALF OF "WHAT IS BEHIND ME"
//
// `rearGapFor` above sweeps `this.vehicles`, which holds exactly two kinds of
// body: ambient agents seeded on the road graph, and `stage()`d actors. A
// PARKED BAY OCCUPANT is neither. It is authored in the district
// (`meta.scenario.bays[].occupied`), turned into a hittable
// `ScenarioObstacleSpec` by `scene/lessonWorldRecipe.buildLessonWorldCore`, and
// mounted by `components/sim/ScenarioObstacles` with its own cuboid collider.
// It is a body the student can hit; it was not a body the rear cue could see.
//
// MEASURED BEFORE ANY OF THIS WAS WRITTEN, by replaying the SHIPPED traces of
// the parking family through the pre-fix `rearGapMeters` (every recorded drive
// under content/traces/sc-park-*, 51 traces, 36,367 samples across 11 lot
// districts): FINITE READS = 0. Not "rarely", not "only on the hard rung" —
// the entire parking family reversed with the rear channel reporting Infinity
// from the first frame to the last, and `stepRearCue` maps Infinity to null in
// every state. The one rear instrument a low-tier phone has was silent for the
// whole of the only manoeuvre that is performed backwards, while
// `sc-park-narrow` step 4 tells the student «следи двете съседни коли» — a cue
// the world would not give him. Silence on the sole rear instrument reads as
// "clear behind".
//
// THIS IS THE SAME SHAPE AS THE TWO DEFECTS `collision/bodies.ts` records: one
// body, two arrays, two answers. The rule that came out of them is that the
// physics body and the graded body are ONE FACT, so the sweep below does not
// invent a second geometry. It builds each occupant with `actorObb` — the very
// function that sizes the kinematic shell rapier binds — and measures with
// `obbSeparationM`, the signed separation the contact grader itself reports.
//
// WHY IT IS NOT SIMPLY "PASS A SECOND ARRAY TO rearGapFor", which is what the
// routing note in `hud/RearProximityCue.tsx` proposed and which was tried
// first. `rearGapFor` is a POINT query with a road-scale corridor
// (LEAD_CORRIDOR_M 4.0 m, half a perceptually-scaled lane) and one fleet-car
// bumper subtrahend. A parking bay row is 2.5 m wide. Fed the four occupied
// bays of lot-narrow-v1 at the pose the correct drive FINISHES on — the student
// perfectly parked in bay 3, 0.73 m of air to each neighbour — that query
// returns 0.04 m of "fwd" for both neighbours, inside a 4.0 m corridor, and
// after the 4.1 m subtrahend clamps to **0**. The badge would have read
// «Кола отзад · 0 м» at the moment the manoeuvre was done correctly. That is
// the false-refusal direction, and a cue that fires while you are parked is
// wallpaper for every case where it is real.
// ---------------------------------------------------------------------------

/**
 * How far back the static rear sweep looks, m.
 *
 * Derived, not chosen: the ONE consumer of `rearGapMeters` is the PROX badge,
 * which drops any read past its own `REAR_CUE_EXIT_M` (16 m, the outer band
 * plus a metre of hysteresis — `hud/rearProximity.ts`). Past that distance a
 * static body cannot become a displayed number, so reaching further only costs
 * SAT tests. 20 m keeps four metres of headroom over the badge's own outer
 * edge; `__tests__/rear-static-gap.test.ts` reads `REAR_CUE_EXIT_M` out of that
 * file and fails if the pair ever crosses, the same way `substep.test.ts` reads
 * the physics clamp out of `lesson-ui/sessionClock.ts`.
 */
export const REAR_STATIC_REACH_M = 20;

/**
 * The occupied parking bays a district authors, as BODY BOXES.
 *
 * `TrafficDistrict` types only the slice this module consumed before today, so
 * the read is structural and every field is checked: a bay contributes a body
 * only when it is flagged `occupied` AND its pose is finite. A malformed entry
 * is skipped rather than turned into a phantom car behind a student.
 *
 * ONE SOURCE, DELIBERATELY. This is the same array
 * `scene/lessonWorldRecipe.ts` filters (`scenarioBays.filter(b => b.occupied)`)
 * to build the hittable `ScenarioObstacleSpec` list, so the cue can only ever
 * warn about a body the scene also mounts. Census over `content/world`
 * (2026-08-20): 16 districts author bays; the 14 `scenario-lot` maps carry 3–9
 * occupants each, `pk-double-v1` 27 and `vu-door-v1` 10. That set matters
 * because `buildLessonWorldCore` mounts the obstacles only for a SCENARIO
 * lesson id, so a hand-authored lesson on one of these maps would see painted
 * bays with no cars in them and a cue warning about bodies that are not there.
 * Checked the same day: none of the sixteen district ids appears anywhere under
 * `modules/sim/lessons/` outside the scenario templates.
 *
 * STATED LIMIT, AND IT IS NOW THE FALLBACK RATHER THAN THE ANSWER (O62,
 * 2026-08-20). `ScenarioObstacles` sizes each occupant's rapier cuboid from the
 * GLB rig it actually loads, and that measurement only exists in the browser
 * after the model resolves. `actorObb` sizes it from the fleet profile table —
 * the same table `collision/bodies.ts` grades every actor with — so a parked
 * hatchback is boxed a few centimetres long and a parked panel van a good half
 * metre short. `LessonScene.rearStaticBodiesFrom` now hands the real extents
 * down through `setRearStaticBodies` as soon as the rigs report them, and the
 * same wiring covers HELD SCENERY, which the district does not carry at all.
 * What is left here is the pre-scene default: the honest answer for a consumer
 * that never mounts a scene, and the first 200 ms of one that does.
 */
export function occupiedBayBodies(district: TrafficDistrict): Obb2D[] {
  const bays = (
    district as {
      meta?: {
        scenario?: {
          bays?: readonly { x: number; y: number; headingDeg: number; occupied?: boolean }[];
        };
      };
    }
  ).meta?.scenario?.bays;
  if (!Array.isArray(bays)) return [];
  const out: Obb2D[] = [];
  for (const bay of bays) {
    if (bay?.occupied !== true) continue;
    if (!Number.isFinite(bay.x) || !Number.isFinite(bay.y) || !Number.isFinite(bay.headingDeg)) {
      continue;
    }
    const rad = (bay.headingDeg * Math.PI) / 180;
    // actorObb takes a travel DIRECTION (it is the staged-actor body builder);
    // a parked car's "direction" is the heading it is standing on.
    out.push(actorObb({ x: bay.x, y: bay.y, dirX: Math.sin(rad), dirY: Math.cos(rad) }));
  }
  return out;
}

/**
 * Gap in metres from the player's own body to the nearest STATIC body behind
 * it, or Infinity when nothing static is back there.
 *
 * The test is a REVERSE CORRIDOR: the box the student's car would sweep if it
 * kept going straight back — same width as the chassis, starting at its rear
 * face, `REAR_STATIC_REACH_M` long. A body counts when it INTRUDES into that
 * corridor (exact rectangle-vs-rectangle SAT, `obbSeparationM <= 0`), and the
 * number reported is then the signed separation between the two REAL bodies,
 * clamped at 0 — never the corridor's.
 *
 * Both halves of that are load-bearing, and each was measured. They are NOT
 * equally load-bearing, and the difference is stated because the first draft of
 * this comment credited the wrong one and the mutation run caught it:
 *
 *  · THE CORRIDOR IS EXACTLY CHASSIS-WIDE — no comfort margin — AND THIS IS THE
 *    HALF THAT KEEPS THE CUE HONEST. Adding a margin is the wallpaper trap and
 *    it is not hypothetical: at +0.5 m the badge starts firing at 0.44–0.49 m on
 *    the CORRECT drives of sc-park-night, sc-park-judge, sc-park-zebra and
 *    sc-park-gap-long, all of them at 8–10 km/h FORWARD, i.e. while driving past
 *    a legally parked row. At +1.0 m it fires on 248 of 361 poses driving the
 *    lane of vu-door-v1 and 283 of 361 on pk-double-v1 — a permanent «Кола
 *    отзад» over two lessons whose subject is something else entirely. At 0 m
 *    both street rows fire ZERO times, and it is also this band, not the rear
 *    face below, that keeps the badge silent on the pose sc-park-narrow's
 *    correct drive finishes on (the 2.5 m neighbours are 0.73 m clear of the
 *    chassis flanks).
 *  · THE CORRIDOR STARTS AT THE REAR FACE, and that buys less than it looks
 *    like it should — MEASURED against the same corridor started at the car's
 *    CENTRE, over all 51 recorded parking drives: they disagree on 448 of
 *    36,367 samples, in 10 drives, and every one of those poses is either at the
 *    far reach edge or one where the two bodies are already INTERPENETRATING.
 *    So what it actually says is the narrow thing: a body you are already
 *    inside is not "a gap behind you" — that contact belongs to the collision
 *    channel — and `REAR_STATIC_REACH_M` means twenty metres of road behind the
 *    bumper rather than twenty from the middle of the car.
 *
 * Cost: two SAT evaluations per body, over ≤27 bodies, at the badge's 5 Hz.
 * Allocation is two boxes per call (the player's and the corridor's) — the
 * per-frame zero-allocation rule governs `update()`, and this is not on it.
 */
export function rearStaticGapFor(
  bodies: readonly Obb2D[],
  px: number,
  py: number,
  headingDeg: number,
): number {
  if (bodies.length === 0) return Infinity;
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  const me = playerObb(px, py, headingDeg);
  // The swept corridor: same heading and half-width as the chassis, its near
  // face flush with the chassis's rear face, REAR_STATIC_REACH_M long.
  const backM = PLAYER_CHASSIS_HALF_LENGTH_M + REAR_STATIC_REACH_M / 2;
  const corridor: Obb2D = {
    x: px - fx * backM,
    y: py - fy * backM,
    headingDeg,
    halfLengthM: REAR_STATIC_REACH_M / 2,
    halfWidthM: PLAYER_CHASSIS_HALF_WIDTH_M,
  };
  let best = Infinity;
  for (const body of bodies) {
    if (obbSeparationM(corridor, body) > 0) continue; // not in the path behind
    const sep = obbSeparationM(me, body);
    if (sep < best) best = sep;
  }
  return best === Infinity ? Infinity : Math.max(0, best);
}

/**
 * Build the scripted traffic for a district. Do it once per session (route
 * precomputation walks the whole road graph); the returned system is then
 * O(agents) per frame with zero allocations.
 */
export function createTrafficSystem(
  district: TrafficDistrict,
  config?: Partial<TrafficConfig>,
): TrafficSystem {
  return new TrafficSystemImpl(district, { ...DEFAULT_TRAFFIC_CONFIG, ...config });
}
