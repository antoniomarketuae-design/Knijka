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
  createPedestrianAgent,
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
  type CyclistApproach,
  type OncomingApproach,
  type StagedActorSpec,
  type StagedActorView,
  type StagedCommand,
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
  private readonly stagedEnv: StagedEnv;
  /** A11: state ids of staged cyclist proxies (extraRightOffsetM > 0). */
  private readonly cyclistStateIds = new Set<number>();
  /**
   * O59: the district's OCCUPIED PARKING BAYS as body boxes — the static half
   * of "what is behind me". Frozen at construction (bay occupancy is authored
   * map data, nothing moves it) and read only by `rearGapMeters`, which is a
   * HUD channel; no rule-engine query touches this array.
   */
  private readonly staticBodies: readonly Obb2D[];

  constructor(district: TrafficDistrict, cfg: TrafficConfig) {
    const rng = mulberry32(cfg.seed);
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
    const routeCount = Math.max(1, Math.ceil(cfg.vehicleCount / 2));
    this.routes = buildRoutes(
      this.graph,
      routeCount,
      rng,
      cfg.anchor
        ? { minWalkM: 200, maxWalkM: 480, minLoopM: 150 }
        : DEFAULT_ROUTE_OPTIONS,
      cfg.anchor
        ? { x: cfg.anchor.x, y: cfg.anchor.y, radiusM: cfg.anchorRadiusM ?? 260 }
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
    if (steps === 0) return;

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

    // The player pose above is set ONCE per frame and every sub-step reads the
    // same one: the caller sampled the car once and there is no intermediate
    // pose to interpolate from. That is the one-frame staleness the header
    // already documents, and it is unchanged — sub-stepping does not make it
    // worse, and the hard anti-overlap clamps in vehicles.ts / staged.ts
    // re-read the AGENT's own fresh pose on every sub-step, so the „never clip
    // the player" guarantee is re-asserted five times a frame instead of once.
    //
    // Staged actors last within each sub-step: they read the freshest player
    // pose and publish into the same state arrays; ambient agents never read
    // them (documented v1 limitation — see staged.ts header).
    for (let k = 0; k < steps; k++) {
      this.timeSec += dt;
      vEnv.timeSec = this.timeSec;
      for (let i = 0; i < this.pedestrianAgents.length; i++) {
        updatePedestrian(this.pedestrianAgents[i], dt, pEnv);
      }
      for (let i = 0; i < this.vehicleAgents.length; i++) {
        updateVehicle(this.vehicleAgents[i], dt, vEnv);
      }
      for (let i = 0; i < this.stagedVehicles.length; i++) {
        updateStagedVehicle(this.stagedVehicles[i], dt, sEnv);
      }
      for (let i = 0; i < this.stagedPeds.length; i++) {
        updateStagedPedestrian(this.stagedPeds[i], dt, sEnv);
      }
    }
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
      const agent = createStagedVehicle(spec, path, stateId);
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
    const moving = rearGapFor(this.vehicles, px, py, headingDeg);
    const parked = rearStaticGapFor(this.staticBodies, px, py, headingDeg);
    return moving < parked ? moving : parked;
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
  ): boolean {
    return conflictFromRightFor(this.vehicles, jx, jy, px, py, headingDeg, radiusM);
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
 * vehicle sits within the ring band AND to the driver's left — the driver must
 * give way to it.
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
  for (const v of vehicles) {
    const cdx = v.x - cx;
    const cdy = v.y - cy;
    if (cdx * cdx + cdy * cdy > r2) continue; // not in / near the ring
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue; // parked / creeping
    // …and near the DRIVER, not merely near the island (B15 — see
    // CIRCULATING_REACH_M). Being inside the band is a fact about the ring; a
    // give-way duty is a fact about the two of you.
    const pdx = v.x - px;
    const pdy = v.y - py;
    if (pdx * pdx + pdy * pdy > CIRCULATING_REACH_M * CIRCULATING_REACH_M) continue;
    if (pdx * lx + pdy * ly < RIGHT_MIN_M) continue; // not on the left
    return true;
  }
  return false;
}

/** Pure "vehicle approaching from the player's right near a junction" test. */
export function conflictFromRightFor(
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
  jx: number,
  jy: number,
  px: number,
  py: number,
  headingDeg: number,
  radiusM: number,
): boolean {
  const rad = (headingDeg * Math.PI) / 180;
  // Player's right vector = forward (sinH,cosH) rotated 90° clockwise = (cosH,-sinH).
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  const r2 = radiusM * radiusM;
  for (const v of vehicles) {
    const jdx = v.x - jx;
    const jdy = v.y - jy;
    if (jdx * jdx + jdy * jdy > r2) continue; // not near the junction
    if (v.speedMps < CONFLICT_MIN_SPEED_MPS) continue;
    if ((v.x - px) * rx + (v.y - py) * ry < RIGHT_MIN_M) continue; // not on the right
    const vBearing = (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
    const delta = Math.abs((((vBearing - headingDeg) % 360) + 540) % 360 - 180);
    if (delta < CONFLICT_SAME_DIR_DEG) continue; // same-direction → not a conflict
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
  vehicles: readonly { x: number; y: number; dirX: number; dirY: number; speedMps: number }[],
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
  const rad = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward x (0° = north = +y)
  const fy = Math.cos(rad); // forward y
  let best = Infinity;
  for (const v of vehicles) {
    const rx = v.x - px;
    const ry = v.y - py;
    const fwd = rx * fx + ry * fy;
    if (fwd >= 0) continue; // not behind
    const lat = Math.abs(rx * -fy + ry * fx); // perpendicular offset
    if (lat > LEAD_CORRIDOR_M) continue; // not in my lane/path
    const gap = -fwd - bumperSubtrahendM(v.profile);
    if (gap < best) best = gap;
  }
  return best === Infinity ? Infinity : Math.max(0, best);
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
 * STATED LIMIT, because it is the one number here that is an approximation.
 * `ScenarioObstacles` sizes each occupant's rapier cuboid from the GLB rig it
 * actually loads, and that measurement only exists in the browser after the
 * model resolves. `actorObb` sizes it from the fleet profile table — the same
 * table `collision/bodies.ts` grades every actor with — so a parked hatchback
 * is boxed a few centimetres long and a parked panel van a few centimetres
 * short. LessonScene already receives the exact extents (`ScenarioObstacles`
 * publishes `ObstacleColliderFootprint[]` upward for contact naming); handing
 * that array down to the traffic system would close the gap and would also
 * cover HELD SCENERY, which the district does not carry at all. That is one
 * wiring line in a file this lane does not own — routed, not smuggled.
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
