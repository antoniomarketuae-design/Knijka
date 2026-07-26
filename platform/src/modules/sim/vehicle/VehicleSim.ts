// VehicleSim — the ported spike physics core (spike/vehicle-feel/src/vehicle.ts),
// stripped of every rendering concern. Plain TS over rapier types:
//
//   - rapier DynamicRayCastVehicleController setup (incl. the misnamed
//     `setIndexForwardAxis` property-setter gotcha),
//   - speed-sensitive steering, brake-vs-reverse state machine,
//   - brake force → per-step impulse conversion,
//   - signed forward speed from body velocity (controller.currentVehicleSpeed()
//     spikes +250 km/h on suspension jolts — never use it),
//   - quadratic drag/downforce,
//   - lateral-accel → roll-torque coupling (raycast cars corner dead flat
//     without it),
//   - software anti-roll bars.
//
// The SAME class runs in the browser (bound to an @react-three/rapier
// `<RigidBody>` chassis) and in Node (harness.test.ts) — that equivalence is
// what makes the harness a meaningful CI gate for vehicle feel.
//
// NOTE ON CHASSIS CREATION: the chassis rigid-body/collider is created
// OUTSIDE this class — declaratively by R3F (see components/sim/VehicleRig)
// or by `createHeadlessChassis()` below for Node. Both paths read every
// number from tuning.ts; `chassisMassProperties()` is shared so mass/COM/
// inertia cannot drift between them.

import type {
  DynamicRayCastVehicleController,
  RigidBody,
  World,
} from "@dimforge/rapier3d-compat";
import type RAPIER_API from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import {
  engineBrakeDecelMs2,
  forwardForceScale,
  hasDriveTraction,
  PARKING_BRAKE_FORCE_N,
  READY_DRIVELINE,
  type DrivelinePhysicsInput,
} from "./driveline";
import {
  combinedGripUtilisation,
  deliveredGripUtilisation,
  demandedGripUtilisation,
  GRIP_SIGNAL_LP,
  GRIP_SIGNAL_MAX_ACCEL_MS2,
  GRIP_SIGNAL_MIN_KMH,
} from "./gripSignal";
import { ROAD_ROUGHNESS_MAX, roadRoughnessForceN } from "./roadNoise";
import { approach, clamp, dot, lerp, rotateInto, yawQuat, type Quat, type Vec3 } from "./math";

/** The rapier module object (default export of @dimforge/rapier3d-compat). */
export type RapierModule = typeof RAPIER_API;

/** Normalized driver input. Analog-shaped so gamepad/touch can plug in. */
export interface VehicleInput {
  /** 0..1 accelerator. */
  throttle: number;
  /** 0..1 brake pedal (doubles as reverse when stopped). */
  brake: number;
  /** -1..1 steering, POSITIVE = LEFT (positive yaw about +Y). */
  steer: number;
  handbrake: boolean;
}

export const IDLE_INPUT: Readonly<VehicleInput> = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
};

export interface VehicleDebugState {
  position: Vec3;
  rotation: Quat;
  suspensionLengths: number[];
  wheelsInContact: boolean[];
  steerRad: number;
}

/**
 * Optional per-session physics configuration (ADR-006 stage 4a). STRICTLY
 * ADDITIVE AND OPT-IN: omitting the object (or every field) is the dry
 * default and produces bit-identical dynamics — the CI harness baselines and
 * the wet-grip identity test are the proof.
 */
export interface VehicleSimOptions {
  /**
   * Surface grip factor: 1 = dry (today's tuning, byte-identical). Values
   * < 1 scale tyre μ (FRICTION_SLIP_FRONT/REAR — the lateral/side-impulse
   * clamp) AND the achievable service-brake + handbrake force, so braking
   * distance grows by ~1/gripFactor and cornering grip drops accordingly.
   * Wet lessons pass tuning.WET_GRIP_FACTOR (0.7 → ~1.4× braking distance).
   * The parking brake (a locked pawl at rest) and rolling resistance are
   * NOT grip-limited and stay unscaled.
   */
  gripFactor?: number;
  /**
   * CROSSWIND slice (doc 72 AC-12) — constant lateral wind force, newtons,
   * along the WORLD +X axis (district east; vehicleSample.ts maps district
   * x = world x, so a NEGATIVE value blows west). WORLD-frame by design: wind
   * blows from a compass direction, independent of the car's heading —
   * driving into it head-on feels nothing lateral, crossing an exposed
   * segment takes the full shove. Applied to the chassis every step exactly
   * like the aero forces (addForce, cleared by the per-step resetForces).
   * Crosswind lessons pass ±tuning.CROSSWIND_BRIDGE_N. Default 0 = the force
   * is NEVER applied (the branch is skipped, zero extra rapier calls) —
   * bit-identical dynamics, proven by the crosswind identity test and the
   * untouched CI harness baselines.
   */
  windLateralN?: number;
  /**
   * Optional deterministic gust envelope on top of windLateralN: a PURE SINE
   * (no RNG, no state beyond a clock that reset() rewinds), adding
   * amplitudeN · sin(2π·t/periodSec) to the constant term. Same world +X
   * axis and sign convention. Ignored unless periodSec > 0. Absent (or
   * amplitude 0) with windLateralN 0 = no wind code path at all.
   */
  windGust?: { periodSec: number; amplitudeN: number };
  /**
   * ENGINE BRAKING (doc 82 §4.2 F3) — OPT-IN. Absent/false (every existing
   * caller, the CI harness included) means the coast branch below is exactly
   * the pre-F3 rolling-resistance-only code and no engine-brake arithmetic
   * runs at all: bit-identical dynamics.
   *
   * True adds a selector- and gear-dependent coast decel through the DRIVEN
   * axle (driveline.engineBrakeDecelMs2 — ~1.0 m/s² in a low gear tapering to
   * 0.3 in top, zero in N/P and zero with the clutch down). This is a
   * BEHAVIOURAL change: lifting off in D no longer coasts like N, which is
   * the point, and which is why it may not be switched on globally without a
   * deliberate re-baseline of every recorded trace that depends on coast
   * distance.
   */
  engineBraking?: boolean;
  /**
   * ROAD-SURFACE VERTICAL MOTION (doc 82 §4.2 F2) — OPT-IN, 0..1. 0
   * (the default, every existing caller) means the excitation branch is never
   * entered and zero extra rapier calls are made: bit-identical dynamics.
   *
   * Above 0 each grounded wheel receives a small vertical impulse sampled
   * from deterministic 2-octave value noise AT ITS WORLD POSITION
   * (roadNoise.ts) — sub-centimetre travel at city speed, which is what makes
   * the suspension move in a straight line at all. Deterministic from
   * position, so replays and CI baselines stay reproducible.
   */
  roadRoughness?: number;
}

const FL = 0;
const FR = 1;
const RL = 2;
const RR = 3;
const WHEEL_COUNT = 4;

/**
 * Chassis mass properties shared by BOTH chassis creation paths.
 * Box inertia scaled up (real cars are not uniform boxes), COM dropped to
 * sill height — the single most effective anti-flip measure.
 */
export function chassisMassProperties(): {
  mass: number;
  centerOfMass: Vec3;
  principalAngularInertia: Vec3;
  angularInertiaLocalFrame: Quat;
} {
  const m = T.CHASSIS_MASS;
  const ex = T.CHASSIS_HALF_EXTENTS.x * 2;
  const ey = T.CHASSIS_HALF_EXTENTS.y * 2;
  const ez = T.CHASSIS_HALF_EXTENTS.z * 2;
  return {
    mass: m,
    centerOfMass: { ...T.COM_OFFSET },
    principalAngularInertia: {
      x: (m / 12) * (ey * ey + ez * ez) * T.INERTIA_SCALE.pitch,
      y: (m / 12) * (ex * ex + ez * ez) * T.INERTIA_SCALE.yaw,
      z: (m / 12) * (ex * ex + ey * ey) * T.INERTIA_SCALE.roll,
    },
    angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
  };
}

/**
 * Create the chassis rigid-body + collider directly on a rapier world.
 * Node/harness path — the browser path is the declarative `<RigidBody>` in
 * components/sim/VehicleRig.tsx, configured from the same tuning constants.
 */
export function createHeadlessChassis(rapier: RapierModule, world: World): RigidBody {
  const spawnQ = yawQuat(T.SPAWN.yawRad);
  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(T.SPAWN.x, T.SPAWN.y, T.SPAWN.z)
    .setRotation(spawnQ)
    .setAngularDamping(T.CHASSIS_ANGULAR_DAMPING)
    .setLinearDamping(T.CHASSIS_LINEAR_DAMPING)
    .setCcdEnabled(true);
  const body = world.createRigidBody(bodyDesc);

  const mp = chassisMassProperties();
  const colliderDesc = rapier.ColliderDesc.cuboid(
    T.CHASSIS_HALF_EXTENTS.x,
    T.CHASSIS_HALF_EXTENTS.y,
    T.CHASSIS_HALF_EXTENTS.z,
  )
    .setMassProperties(
      mp.mass,
      mp.centerOfMass,
      mp.principalAngularInertia,
      mp.angularInertiaLocalFrame,
    )
    .setFriction(T.CHASSIS_FRICTION)
    .setRestitution(T.CHASSIS_RESTITUTION);
  world.createCollider(colliderDesc, body);
  return body;
}

export class VehicleSim {
  private readonly world: World;
  private readonly body: RigidBody;
  private readonly chassisColliderHandle: number;
  private readonly controller: DynamicRayCastVehicleController;

  private steer = 0;
  /** CURRENT surface grip factor (1 = dry; see VehicleSimOptions.gripFactor).
   *  Mutable ONLY through setSurfaceGripFactor (the surface-patch slice) —
   *  callers that never touch the setter keep the constructor value for the
   *  sim's whole life, bit-identically. */
  private gripFactor: number;
  /** The LESSON-BASE grip the constructor resolved — what reset() restores
   *  after a patch diverged the current factor (surface-patch slice). */
  private readonly baseGripFactor: number;
  /** Constant lateral wind, N along world +X (0 = no wind code path). */
  private readonly windLateralN: number;
  /** Gust sine amplitude, N (0 = constant-only wind). */
  private readonly windGustAmplitudeN: number;
  /** Gust sine period, s (guarded > 0 in the constructor). */
  private readonly windGustPeriodSec: number;
  /** True when ANY wind term is non-zero — the single gate on the wind path. */
  private readonly windActive: boolean;
  /** Wind clock (s) for the deterministic gust sine; reset() rewinds it. */
  private windClockSec = 0;
  /** Low-passed lateral acceleration (m/s², car-local, + = left). */
  private aLatSmooth = 0;
  /** F3 gate: true only when a caller opted into engine braking. */
  private readonly engineBraking: boolean;
  /** F2 gate: 0 (every default caller) = the road-excitation branch is dead. */
  private readonly roadRoughness: number;
  /** GRIP-LOSS READ CHANNEL (F1) — the same measured acceleration as
   *  aLatSmooth but clamped an order higher (the roll clamp sits BELOW the
   *  grip ceiling and would cap utilisation at 0.87). Written every step,
   *  read by nothing that touches rapier. */
  private aLatGripSmooth = 0;
  private aLongGripSmooth = 0;
  private readonly prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly spawnRotation: Quat;
  private readonly spawnTranslation: Vec3;
  private disposed = false;

  // Scratch objects (no per-frame allocation).
  private readonly tmpV: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmpV2: Vec3 = { x: 0, y: 0, z: 0 };
  /** Third scratch — the grip channel needs the car's forward axis while
   *  tmpV still holds the measured acceleration vector. */
  private readonly tmpV3: Vec3 = { x: 0, y: 0, z: 0 };

  /**
   * @param world The rapier world (raw `World` — from `useRapier()` in R3F).
   * @param body  The chassis rigid-body with its cuboid collider ALREADY
   *              attached (collider 0 is assumed to be the chassis box).
   */
  constructor(
    world: World,
    body: RigidBody,
    spawn: { x: number; y: number; z: number; yawRad: number } = T.SPAWN,
    options?: VehicleSimOptions,
  ) {
    this.world = world;
    this.body = body;
    // Grip is clamped to a sane band; 1 (the default) is EXACTLY the pre-4a
    // dry car: every use below multiplies by 1.0, which is the IEEE-754
    // identity, so the dry path stays bit-identical (harness-proven).
    this.gripFactor = clamp(options?.gripFactor ?? 1, 0.3, 1);
    this.baseGripFactor = this.gripFactor;
    // Crosswind (AC-12): defaults keep windActive FALSE, so the update loop
    // never enters the wind branch — the dry/calm path stays bit-identical
    // (no extra rapier calls, no clock advance; crosswind.test.ts is the proof).
    this.windLateralN = options?.windLateralN ?? 0;
    const gust = options?.windGust;
    this.windGustAmplitudeN = gust !== undefined && gust.periodSec > 0 ? gust.amplitudeN : 0;
    this.windGustPeriodSec = gust !== undefined && gust.periodSec > 0 ? gust.periodSec : 1;
    this.windActive = this.windLateralN !== 0 || this.windGustAmplitudeN !== 0;
    // F2/F3 (doc 82 §4.2): both default to "no code path", the same additive
    // law as gripFactor and the wind above — an omitted option constructs
    // EXACTLY the pre-F car, which is what keeps every committed trace and
    // every graded verdict valid.
    this.engineBraking = options?.engineBraking === true;
    this.roadRoughness = clamp(options?.roadRoughness ?? 0, 0, ROAD_ROUGHNESS_MAX);
    this.spawnRotation = yawQuat(spawn.yawRad);
    this.spawnTranslation = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.chassisColliderHandle = body.collider(0).handle;

    // --- Raycast vehicle controller -----------------------------------------
    const c = world.createVehicleController(body);
    this.controller = c;
    c.indexUpAxis = 1; // +Y
    // rapier.js quirk: the forward-axis setter is misnamed `setIndexForwardAxis`
    // (it's a property setter, not a method) — assigning to `indexForwardAxis`
    // does nothing because that name only has a getter, and the default forward
    // axis is X, which silently breaks the whole sign convention.
    c.setIndexForwardAxis = 2; // +Z

    const suspensionDir = { x: 0, y: -1, z: 0 };
    // Axle -X with +Z forward ⇒ positive engine force pushes the car forward
    // (Bullet convention: forward = contactNormal × axle).
    const axle = { x: -1, y: 0, z: 0 };

    for (let i = 0; i < WHEEL_COUNT; i++) {
      const p = T.WHEEL_POSITIONS[i];
      if (!p) continue;
      c.addWheel({ x: p.x, y: p.y, z: p.z }, suspensionDir, axle, T.SUSPENSION_REST_LENGTH, T.WHEEL_RADIUS);
    }
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const isFront = i === FL || i === FR;
      c.setWheelSuspensionStiffness(i, T.SUSPENSION_STIFFNESS);
      c.setWheelSuspensionCompression(i, T.SUSPENSION_DAMPING_COMPRESSION);
      c.setWheelSuspensionRelaxation(i, T.SUSPENSION_DAMPING_RELAXATION);
      c.setWheelMaxSuspensionTravel(i, T.SUSPENSION_MAX_TRAVEL);
      c.setWheelMaxSuspensionForce(i, T.SUSPENSION_MAX_FORCE);
      // Tyre μ × surface grip (4a): frictionSlip clamps the side impulse
      // (cheat-sheet point 5), so scaling it IS the lateral wet-grip loss.
      // gripFactor 1 multiplies by 1.0 — exact identity, dry unchanged.
      c.setWheelFrictionSlip(
        i,
        (isFront ? T.FRICTION_SLIP_FRONT : T.FRICTION_SLIP_REAR) * this.gripFactor,
      );
      c.setWheelSideFrictionStiffness(i, T.SIDE_FRICTION_STIFFNESS);
    }
  }

  /**
   * Per-physics-step update. Call BEFORE world.step() — in R3F wire it into
   * `useBeforePhysicsStep` (fires once per fixed substep), in Node call it
   * right before `world.step()`. Always pass the fixed timestep.
   *
   * `driveline` (A1) gates the drivetrain: engine off / P / N transmit no
   * force, R drives backward (proper reverse), a clutch-down manual box
   * freewheels, and the stateful parking brake drags the rear axle. When it
   * is OMITTED the sim runs the LEGACY pre-A1 machine (READY_DRIVELINE +
   * the arcade brake-at-standstill-reverses overload in D + full-force
   * stop-first braking) so callers that predate A1 — the CI harness above
   * all — keep today's behavior bit-for-bit.
   *
   * S0 parking honesty: callers that DO pass a driveline (every cabin
   * session) get the honest low-speed machine instead —
   *  - brake in D at a standstill HOLDS the car (no silent backward creep at
   *    the 0-crossing; deliberate reverse is the R position),
   *  - wrong-direction throttle stops the car at STOP_FIRST_BRAKE (~0.5 g)
   *    rather than a full 0.9 g slam before the direction change.
   */
  update(
    input: VehicleInput,
    dt: number,
    driveline?: DrivelinePhysicsInput,
  ): void {
    if (this.disposed) return;
    // Legacy machine = the pre-A1 arcade contract, selected by OMITTING the
    // argument (the CI harness / spike-era callers). An explicitly passed
    // driveline — even one equal to READY_DRIVELINE — is the honest machine.
    const legacyArcade = driveline === undefined;
    const dl: DrivelinePhysicsInput = driveline ?? READY_DRIVELINE;
    const c = this.controller;
    // Forward speed from the body velocity (controller.currentVehicleSpeed()
    // uses |linvel| and spikes on suspension jolts — measured +250 km/h
    // single-frame glitches in the spike harness).
    const speedMs = this.forwardSpeedMs();
    const speedKmh = speedMs * 3.6;
    const absKmh = Math.abs(speedKmh);

    // --- Steering: speed-sensitive limit + rate-limited wheel ---------------
    const range = T.STEER_MIN_SPEED_KMH - T.STEER_FULL_SPEED_KMH;
    const f = clamp((absKmh - T.STEER_FULL_SPEED_KMH) / range, 0, 1);
    const maxSteer = lerp(T.STEER_MAX_ANGLE, T.STEER_MIN_ANGLE, f);
    const steerTarget = clamp(input.steer, -1, 1) * maxSteer;
    const returning = Math.abs(steerTarget) < Math.abs(this.steer);
    const rate = returning ? T.STEER_RETURN_SPEED : T.STEER_SPEED;
    this.steer = approach(this.steer, steerTarget, rate * dt);
    for (const i of T.STEERED_WHEELS) c.setWheelSteering(i, this.steer);

    // --- Throttle / brake / reverse state machine ---------------------------
    // Driveline gating (A1): force flows only when the engine runs AND a
    // drive position is engaged (D / M with clutch up / R). The legacy
    // machine (no driveline argument) keeps the pre-A1 behavior bit-for-bit.
    const traction = hasDriveTraction(dl);
    // S0: wrong-direction throttle stops the car before the direction change.
    // Honest machine: a firm ~0.5 g (torque-converter fight), not the legacy
    // full-brake slam — the 0-crossing must not snap heads in a parking bay.
    const stopFirst = legacyArcade ? 1 : T.STOP_FIRST_BRAKE;
    let engineTotal = 0; // N, split across driven wheels
    let brakePedal = 0; // 0..1
    if (dl.selector === "R") {
      // Proper reverse: THROTTLE drives backward (capped), brake brakes.
      if (input.throttle > 0) {
        if (speedMs > 0.5) {
          brakePedal = input.throttle * stopFirst; // rolling forwards: stop first
        } else if (traction && speedKmh > -T.REVERSE_MAX_KMH) {
          engineTotal = -T.REVERSE_FORCE_N * input.throttle;
        }
      } else if (input.brake > 0) {
        brakePedal = input.brake;
      }
    } else if (input.throttle > 0) {
      if (speedMs < -0.5) {
        brakePedal = input.throttle * stopFirst; // rolling backwards: stop first
      } else if (traction) {
        engineTotal =
          forwardForceScale(dl, absKmh) * T.engineForceAt(absKmh) * input.throttle;
      }
    } else if (input.brake > 0) {
      if (speedMs > 0.5) {
        brakePedal = input.brake; // moving forwards: brake pedal brakes
      } else if (
        legacyArcade &&
        traction &&
        dl.selector === "D" &&
        speedKmh > -T.REVERSE_MAX_KMH
      ) {
        // Legacy arcade overload, ONLY on the legacy machine (the harness
        // envelope asserts it): brake at standstill = reverse. On the honest
        // machine the brake pedal HOLDS a stopped car (S0 parking fix —
        // students braking to a precise stop in D must not glide backward);
        // deliberate reverse is the R position above.
        engineTotal = -T.REVERSE_FORCE_N * input.brake;
      } else {
        brakePedal = input.brake; // brake pedal brakes — at rest it holds
      }
    }

    const perWheelEngine = engineTotal / T.DRIVEN_WHEELS.length;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      c.setWheelEngineForce(i, (T.DRIVEN_WHEELS as readonly number[]).includes(i) ? perWheelEngine : 0);
    }

    // --- Brakes: rapier wants IMPULSE per step, so convert N → N·s ----------
    // Surface grip (4a): the service brake and handbrake are TYRE-limited, so
    // they scale with gripFactor (0.7 wet ⇒ ~0.64 g peak ⇒ ~1.4× distance).
    // Rolling resistance and the parking pawl are not grip-limited. With the
    // default gripFactor 1 every product below is the exact dry value.
    const brakeForceN = T.BRAKE_FORCE_N * this.gripFactor;
    let frontBrakeN = (brakePedal * brakeForceN * T.BRAKE_BIAS_FRONT) / 2;
    let rearBrakeN = (brakePedal * brakeForceN * (1 - T.BRAKE_BIAS_FRONT)) / 2;
    if (engineTotal === 0) {
      if (brakePedal === 0) {
        // Coast-down rolling resistance.
        frontBrakeN = Math.max(frontBrakeN, T.ROLLING_RESISTANCE_N / 4);
        rearBrakeN = Math.max(rearBrakeN, T.ROLLING_RESISTANCE_N / 4);
      }
      // ENGINE BRAKING (F3, opt-in): compression drag arrives through the
      // DRIVEN axle, so it rides the front wheels on this FWD car. Safe next
      // to the engine force above only because we are inside the branch where
      // engineTotal is 0 — rapier ignores brake on a wheel that also carries
      // engine force (tuning.ts cheat-sheet point 4). Gate off (the default)
      // = not even the decel lookup runs.
      //
      // It sits OUTSIDE the `brakePedal === 0` test on purpose. A closed
      // throttle keeps the engine on the overrun whether or not the foot has
      // moved to the brake, so a floor that vanished the instant the pedal was
      // BRUSHED would make a 0.05 pedal decelerate LESS than lifting off
      // (measured: 0.59 vs 1.00 m/s² in gear 1) — the car surging forward as
      // the learner first touches the brake. `Math.max` keeps it a floor, so
      // once the pedal outranks it the service brake alone decides the stop
      // and F3 still cannot mask a graded braking mistake.
      if (this.engineBraking) {
        const decel = engineBrakeDecelMs2(dl, absKmh);
        if (decel > 0) {
          frontBrakeN = Math.max(frontBrakeN, (decel * T.CHASSIS_MASS) / 2);
        }
      }
    }
    let rearGrip = T.SIDE_FRICTION_STIFFNESS;
    if (input.handbrake) {
      rearBrakeN = Math.max(rearBrakeN, (T.HANDBRAKE_FORCE_N * this.gripFactor) / 2);
      rearGrip = T.HANDBRAKE_REAR_GRIP; // rear breaks loose → handbrake slide
    }
    if (dl.parkingBrakeOn) {
      // Stateful parking brake (A1): a locked rear axle the engine cannot
      // out-pull — WITHOUT the momentary handbrake's grip loss (this is a
      // parking pawl feel, not a drift assist).
      rearBrakeN = Math.max(rearBrakeN, PARKING_BRAKE_FORCE_N / 2);
    }
    c.setWheelBrake(FL, frontBrakeN * dt);
    c.setWheelBrake(FR, frontBrakeN * dt);
    c.setWheelBrake(RL, rearBrakeN * dt);
    c.setWheelBrake(RR, rearBrakeN * dt);
    c.setWheelSideFrictionStiffness(RL, rearGrip);
    c.setWheelSideFrictionStiffness(RR, rearGrip);

    // --- Aero: quadratic drag + a pinch of downforce ------------------------
    this.body.resetForces(true);
    const vel = this.body.linvel();
    const v = Math.hypot(vel.x, vel.y, vel.z);
    if (v > 0.1) {
      const k = T.AERO_DRAG * v;
      this.body.addForce(
        { x: -vel.x * k, y: -vel.y * k - T.AERO_DOWNFORCE * v * v, z: -vel.z * k },
        true,
      );
    }

    // --- Crosswind (AC-12, opt-in): world-frame lateral force ----------------
    // Constant + optional pure-sine gust along world +X (see the options doc).
    // Applied like the aero forces above (accumulates onto the same per-step
    // force reset). Gate: windActive is false on every default construction,
    // so calm sessions never touch this branch — bit-identity preserved.
    if (this.windActive) {
      this.windClockSec += dt;
      let windN = this.windLateralN;
      if (this.windGustAmplitudeN !== 0) {
        windN +=
          this.windGustAmplitudeN *
          Math.sin((2 * Math.PI * this.windClockSec) / this.windGustPeriodSec);
      }
      this.body.addForce({ x: windN, y: 0, z: 0 }, true);
    }

    // --- Body-roll coupling (see tuning.ts: rapier suppresses roll torque) --
    this.applyRollCoupling(dt);

    // --- Software anti-roll bars ---------------------------------------------
    this.applyAntiRollAxle(FL, FR, T.ANTI_ROLL_FRONT, dt);
    this.applyAntiRollAxle(RL, RR, T.ANTI_ROLL_REAR, dt);

    // --- Road-surface vertical motion (F2, opt-in) ---------------------------
    // roadRoughness 0 on every default construction, so this is one numeric
    // compare on the shipped path and the branch below never runs.
    if (this.roadRoughness > 0) this.applyRoadRoughness(speedKmh, dt);

    // --- Suspension raycasts + wheel impulses (skip our own chassis) --------
    c.updateVehicle(dt, undefined, undefined, (col) => col.handle !== this.chassisColliderHandle);
  }

  /**
   * SURFACE-PATCH slice (doc 72 AC-07-full aquaplane float / AC-08 ice band):
   * modulate the surface grip at RUNTIME as the chassis crosses an authored
   * waterPatch/icePatch span. VehicleRig calls this per physics substep with
   * MIN(lesson base, patch factor) — entering a span applies the patch grip,
   * leaving it passes the base back (min(base, 1) = base), and the early
   * return below turns that steady state into zero rapier calls.
   *
   * Re-applies EXACTLY the constructor's grip term set and nothing else:
   *  - per-wheel frictionSlip (FRICTION_SLIP_FRONT/REAR × factor) here;
   *  - the service-brake and handbrake forces in update() read the SAME
   *    mutated field every step (BRAKE_FORCE_N / HANDBRAKE_FORCE_N ×
   *    gripFactor), so they follow automatically;
   *  - the parking pawl and rolling resistance stay unscaled — they are not
   *    tyre-limited (the constructor contract, unchanged).
   *
   * ADDITIVE LAW: never called (every pre-slice caller — the CI harness, all
   * shipped lessons) = the field never changes and no code here runs, so the
   * dynamics stay bit-identical; calling it with the CURRENT value (an
   * explicit 1 on the dry car, the wet 0.7 base after leaving a patch)
   * returns BEFORE any rapier call — the same identity. Both are proven by
   * lock-step trajectory equality in vehicle/surface-grip.test.ts.
   *
   * The clamp band [0.05, 1] is DELIBERATELY deeper than the constructor's
   * 0.3 floor: a whole SESSION below 0.3 grip is undrivable (the constructor
   * guards that), but a LOCALIZED patch must express standing water / glare
   * ice honestly — ~0.1–0.2 of dry grip (tuning.AQUAPLANE_PATCH_GRIP_FACTOR /
   * ICE_PATCH_GRIP_FACTOR run 0.15; measurements in their tuning note).
   */
  setSurfaceGripFactor(factor: number): void {
    if (this.disposed) return;
    const f = clamp(factor, 0.05, 1);
    if (f === this.gripFactor) return;
    this.gripFactor = f;
    this.applyWheelGrip(f);
  }

  /** The CURRENT surface grip factor (test/HUD readout; 1 = dry). */
  get surfaceGripFactor(): number {
    return this.gripFactor;
  }

  // --- GRIP-LOSS READ CHANNEL (doc 82 §4.2 F1) -------------------------------
  // Read once per RENDER frame by the rig (audio + haptics + HUD), never by
  // the physics. See gripSignal.ts for why there are two halves.

  /** Friction-circle magnitude of the acceleration the tyres DELIVERED, over
   *  the current surface's grip ceiling. Saturates just below 1. */
  get deliveredGripUtilisation(): number {
    if (Math.abs(this.speedKmh) < GRIP_SIGNAL_MIN_KMH) return 0;
    return deliveredGripUtilisation(
      this.aLatGripSmooth,
      this.aLongGripSmooth,
      this.gripFactor,
    );
  }

  /** Lateral acceleration the steering angle is ASKING for at this speed,
   *  over the same ceiling. This is the half that exceeds 1 in a slide. */
  get demandedGripUtilisation(): number {
    const speedMs = this.forwardSpeedMs();
    if (Math.abs(speedMs) * 3.6 < GRIP_SIGNAL_MIN_KMH) return 0;
    return demandedGripUtilisation(speedMs, this.steer, this.gripFactor);
  }

  /** The single number the tyre-protest audio layer and the debrief read:
   *  the worse of delivered and demanded. 0.85 ≈ scrub, > 1 ≈ real screech. */
  get gripUtilisation(): number {
    return combinedGripUtilisation(
      this.deliveredGripUtilisation,
      this.demandedGripUtilisation,
    );
  }

  /** Re-apply tyre μ for a grip factor — the constructor's exact per-wheel
   *  frictionSlip term (surface-patch slice; see setSurfaceGripFactor). */
  private applyWheelGrip(f: number): void {
    const c = this.controller;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const isFront = i === FL || i === FR;
      c.setWheelFrictionSlip(
        i,
        (isFront ? T.FRICTION_SLIP_FRONT : T.FRICTION_SLIP_REAR) * f,
      );
    }
  }

  /** Teleport back to spawn with zeroed velocities/forces/filters. */
  reset(): void {
    if (this.disposed) return;
    // Surface-patch slice: an attempt restart also rewinds the surface state
    // to the lesson base — GUARDED so untouched rigs (every pre-slice caller)
    // make zero extra rapier calls here (the bit-identity law).
    if (this.gripFactor !== this.baseGripFactor) {
      this.gripFactor = this.baseGripFactor;
      this.applyWheelGrip(this.baseGripFactor);
    }
    this.body.setTranslation(this.spawnTranslation, true);
    this.body.setRotation(this.spawnRotation, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.steer = 0;
    this.aLatSmooth = 0;
    this.aLatGripSmooth = 0; // F1: the tyre stops protesting on a restart
    this.aLongGripSmooth = 0;
    this.windClockSec = 0; // gust sine restarts with the attempt (determinism)
    this.prevVel.x = 0;
    this.prevVel.y = 0;
    this.prevVel.z = 0;
  }

  /**
   * Release the vehicle controller. Call from React cleanup — the chassis
   * body itself is owned by whoever created it (`<RigidBody>` unmount in R3F,
   * `world.free()` in the harness).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.world.removeVehicleController(this.controller);
    } catch {
      // World may already be tearing down (route leave) — nothing to release.
    }
  }

  /** Signed speed in km/h (+ forward). Use this for HUD and engine lookup. */
  get speedKmh(): number {
    return this.forwardSpeedMs() * 3.6;
  }

  /** Current road-wheel steering angle (rad, + = left). */
  get steerRad(): number {
    return this.steer;
  }

  /** Chassis centre height (m) — kill-plane checks. */
  get positionY(): number {
    return this.body.translation().y;
  }

  /** Cosmetic automatic gearbox for the HUD. */
  get gear(): string {
    const v = this.speedKmh;
    if (v < -0.8) return "R";
    if (v < 0.8) return "N";
    let g = 1;
    for (const threshold of T.GEAR_UPSHIFT_KMH) {
      if (v > threshold) g++;
    }
    return String(g);
  }

  /** Current suspension length of wheel i (m) — visual wheel placement. */
  wheelSuspensionLength(i: number): number {
    return this.controller.wheelSuspensionLength(i) ?? T.SUSPENSION_REST_LENGTH;
  }

  /** Accumulated rolling rotation of wheel i (rad). */
  wheelRotationRad(i: number): number {
    return this.controller.wheelRotation(i) ?? 0;
  }

  /** Narrow debug readout (numeric harness + future debug HUD). */
  debugState(): VehicleDebugState {
    const t = this.body.translation();
    const r = this.body.rotation();
    const suspensionLengths: number[] = [];
    const wheelsInContact: boolean[] = [];
    for (let i = 0; i < WHEEL_COUNT; i++) {
      suspensionLengths.push(this.wheelSuspensionLength(i));
      wheelsInContact.push(this.controller.wheelIsInContact(i));
    }
    return {
      position: { x: t.x, y: t.y, z: t.z },
      rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
      suspensionLengths,
      wheelsInContact,
      steerRad: this.steer,
    };
  }

  // ---------------------------------------------------------------------------

  /** Signed forward speed (m/s): body velocity projected on the +Z axis. */
  private forwardSpeedMs(): number {
    const v = this.body.linvel();
    const r = this.body.rotation();
    const fwd = rotateInto(r, 0, 0, 1, this.tmpV);
    return fwd.x * v.x + fwd.y * v.y + fwd.z * v.z;
  }

  /**
   * Lateral-force → roll-torque coupling. Measures lateral acceleration
   * (finite difference, low-passed), then applies τ = m · aLat · arm about
   * the forward axis. Restores the body lean that rapier's side-impulse
   * placement suppresses; springs/dampers/ARBs then fight it realistically.
   */
  private applyRollCoupling(dt: number): void {
    const vel = this.body.linvel();
    const r = this.body.rotation();

    // Measured acceleration over the previous step, projected on car left (+X).
    this.tmpV.x = (vel.x - this.prevVel.x) / dt;
    this.tmpV.y = (vel.y - this.prevVel.y) / dt;
    this.tmpV.z = (vel.z - this.prevVel.z) / dt;
    this.prevVel.x = vel.x;
    this.prevVel.y = vel.y;
    this.prevVel.z = vel.z;
    const left = rotateInto(r, 1, 0, 0, this.tmpV2);
    const aLatRaw = dot(this.tmpV, left);
    const aLat = clamp(aLatRaw, -T.ROLL_COUPLING_MAX_LAT, T.ROLL_COUPLING_MAX_LAT);
    this.aLatSmooth += (aLat - this.aLatSmooth) * Math.min(1, T.ROLL_COUPLING_LP * dt);

    // GRIP-LOSS READ CHANNEL (F1) — the SAME acceleration vector, taken here
    // because tmpV still holds it and tmpV2 still holds the left axis. Two
    // separate smoothed fields rather than reusing aLatSmooth: the roll
    // clamp (12 m/s²) sits BELOW the ~14 m/s² grip ceiling, so utilisation
    // read off aLatSmooth could never reach 1. Pure read — no force, no
    // torque, no impulse follows from either field (gripSignal.ts header).
    const fwdAxis = rotateInto(r, 0, 0, 1, this.tmpV3);
    const gripLp = Math.min(1, GRIP_SIGNAL_LP * dt);
    this.aLatGripSmooth +=
      (clamp(aLatRaw, -GRIP_SIGNAL_MAX_ACCEL_MS2, GRIP_SIGNAL_MAX_ACCEL_MS2) -
        this.aLatGripSmooth) *
      gripLp;
    this.aLongGripSmooth +=
      (clamp(dot(this.tmpV, fwdAxis), -GRIP_SIGNAL_MAX_ACCEL_MS2, GRIP_SIGNAL_MAX_ACCEL_MS2) -
        this.aLongGripSmooth) *
      gripLp;

    // Torque about the forward axis: accel to the left (+) → lean right (out).
    const magnitude = T.CHASSIS_MASS * this.aLatSmooth * T.ROLL_COUPLING_ARM * dt;
    const fwd = rotateInto(r, 0, 0, 1, this.tmpV);
    this.body.applyTorqueImpulse(
      { x: fwd.x * magnitude, y: fwd.y * magnitude, z: fwd.z * magnitude },
      true,
    );
  }

  /**
   * ROAD-SURFACE VERTICAL MOTION (doc 82 §4.2 F2, opt-in via roadRoughness).
   *
   * NOT displaced geometry — that would break colliders, markings, decals and
   * every world builder. Instead each GROUNDED wheel gets a small vertical
   * impulse at its own world position, sampled from deterministic 2-octave
   * value noise (roadNoise.ts). Applying it at the wheel point, exactly like
   * the anti-roll bar below, is what makes it read as a road: uncorrelated
   * corners produce the small roll/pitch tremble of a real surface rather
   * than a lift of the whole car.
   *
   * DETERMINISM: the noise is a function of world XZ only — no clock, no RNG,
   * no accumulated state — so a replayed trace re-drives the same bumps and
   * the CI baselines stay reproducible. AMPLITUDE: ~5 mm of travel at city
   * speed (roadNoise.ts header). Anything bigger is sim sickness, not feel.
   */
  private applyRoadRoughness(speedKmh: number, dt: number): void {
    const c = this.controller;
    const t = this.body.translation();
    const r = this.body.rotation();
    for (let i = 0; i < WHEEL_COUNT; i++) {
      if (!c.wheelIsInContact(i)) continue; // an airborne wheel rides nothing
      const p = T.WHEEL_POSITIONS[i];
      if (!p) continue;
      const w = rotateInto(r, p.x, p.y, p.z, this.tmpV);
      const wx = t.x + w.x;
      const wz = t.z + w.z;
      const forceN = roadRoughnessForceN(wx, wz, speedKmh, this.roadRoughness);
      if (forceN === 0) continue;
      this.body.applyImpulseAtPoint(
        { x: 0, y: forceN * dt, z: 0 },
        { x: wx, y: t.y + w.y, z: wz },
        true,
      );
    }
  }

  /**
   * Anti-roll bar: push the chassis up on the compressed side, pull it down
   * on the extended side, proportional to the compression difference. This is
   * how you keep raycast cars flat-ish in corners WITHOUT killing all lean.
   */
  private applyAntiRollAxle(left: number, right: number, stiffness: number, dt: number): void {
    const c = this.controller;
    if (!c.wheelIsInContact(left) || !c.wheelIsInContact(right)) return;
    const rest = T.SUSPENSION_REST_LENGTH;
    const compL = rest - (c.wheelSuspensionLength(left) ?? rest);
    const compR = rest - (c.wheelSuspensionLength(right) ?? rest);
    const force = (compL - compR) * stiffness;
    if (Math.abs(force) < 1) return;

    const t = this.body.translation();
    const r = this.body.rotation();

    const pL = T.WHEEL_POSITIONS[left];
    const pR = T.WHEEL_POSITIONS[right];
    if (!pL || !pR) return;

    const wL = rotateInto(r, pL.x, pL.y, pL.z, this.tmpV);
    this.body.applyImpulseAtPoint(
      { x: 0, y: force * dt, z: 0 },
      { x: t.x + wL.x, y: t.y + wL.y, z: t.z + wL.z },
      true,
    );
    const wR = rotateInto(r, pR.x, pR.y, pR.z, this.tmpV);
    this.body.applyImpulseAtPoint(
      { x: 0, y: -force * dt, z: 0 },
      { x: t.x + wR.x, y: t.y + wR.y, z: t.z + wR.z },
      true,
    );
  }
}
