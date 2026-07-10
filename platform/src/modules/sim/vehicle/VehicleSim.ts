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
  forwardForceScale,
  hasDriveTraction,
  PARKING_BRAKE_FORCE_N,
  READY_DRIVELINE,
  type DrivelinePhysicsInput,
} from "./driveline";
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
  /** Low-passed lateral acceleration (m/s², car-local, + = left). */
  private aLatSmooth = 0;
  private readonly prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly spawnRotation: Quat;
  private readonly spawnTranslation: Vec3;
  private disposed = false;

  // Scratch objects (no per-frame allocation).
  private readonly tmpV: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmpV2: Vec3 = { x: 0, y: 0, z: 0 };

  /**
   * @param world The rapier world (raw `World` — from `useRapier()` in R3F).
   * @param body  The chassis rigid-body with its cuboid collider ALREADY
   *              attached (collider 0 is assumed to be the chassis box).
   */
  constructor(
    world: World,
    body: RigidBody,
    spawn: { x: number; y: number; z: number; yawRad: number } = T.SPAWN,
  ) {
    this.world = world;
    this.body = body;
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
      c.setWheelFrictionSlip(i, isFront ? T.FRICTION_SLIP_FRONT : T.FRICTION_SLIP_REAR);
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
   * freewheels, and the stateful parking brake drags the rear axle. It
   * DEFAULTS to READY_DRIVELINE (engine on, D, brake released) so callers
   * that predate A1 — the CI harness above all — keep today's behavior
   * bit-for-bit, including the brake-at-standstill reverse overload in D.
   */
  update(
    input: VehicleInput,
    dt: number,
    driveline: DrivelinePhysicsInput = READY_DRIVELINE,
  ): void {
    if (this.disposed) return;
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
    // drive position is engaged (D / M with clutch up / R). The default
    // READY_DRIVELINE keeps the pre-A1 machine (harness-gated) unchanged.
    const traction = hasDriveTraction(driveline);
    let engineTotal = 0; // N, split across driven wheels
    let brakePedal = 0; // 0..1
    if (driveline.selector === "R") {
      // Proper reverse: THROTTLE drives backward (capped), brake brakes.
      if (input.throttle > 0) {
        if (speedMs > 0.5) {
          brakePedal = input.throttle; // still rolling forwards: stop first
        } else if (traction && speedKmh > -T.REVERSE_MAX_KMH) {
          engineTotal = -T.REVERSE_FORCE_N * input.throttle;
        }
      } else if (input.brake > 0) {
        brakePedal = input.brake;
      }
    } else if (input.throttle > 0) {
      if (speedMs < -0.5) {
        brakePedal = input.throttle; // rolling backwards: throttle stops first
      } else if (traction) {
        engineTotal =
          forwardForceScale(driveline, absKmh) * T.engineForceAt(absKmh) * input.throttle;
      }
    } else if (input.brake > 0) {
      if (speedMs > 0.5) {
        brakePedal = input.brake; // moving forwards: brake pedal brakes
      } else if (
        traction &&
        driveline.selector === "D" &&
        speedKmh > -T.REVERSE_MAX_KMH
      ) {
        // Legacy arcade overload, kept ONLY in D for back-compat (the
        // harness envelope asserts it): brake at standstill = reverse.
        // Deliberate reverse is the R position above.
        engineTotal = -T.REVERSE_FORCE_N * input.brake;
      } else {
        brakePedal = input.brake; // no drive available: the pedal just brakes
      }
    }

    const perWheelEngine = engineTotal / T.DRIVEN_WHEELS.length;
    for (let i = 0; i < WHEEL_COUNT; i++) {
      c.setWheelEngineForce(i, (T.DRIVEN_WHEELS as readonly number[]).includes(i) ? perWheelEngine : 0);
    }

    // --- Brakes: rapier wants IMPULSE per step, so convert N → N·s ----------
    let frontBrakeN = (brakePedal * T.BRAKE_FORCE_N * T.BRAKE_BIAS_FRONT) / 2;
    let rearBrakeN = (brakePedal * T.BRAKE_FORCE_N * (1 - T.BRAKE_BIAS_FRONT)) / 2;
    if (engineTotal === 0 && brakePedal === 0) {
      // Coast-down rolling resistance.
      frontBrakeN = Math.max(frontBrakeN, T.ROLLING_RESISTANCE_N / 4);
      rearBrakeN = Math.max(rearBrakeN, T.ROLLING_RESISTANCE_N / 4);
    }
    let rearGrip = T.SIDE_FRICTION_STIFFNESS;
    if (input.handbrake) {
      rearBrakeN = Math.max(rearBrakeN, T.HANDBRAKE_FORCE_N / 2);
      rearGrip = T.HANDBRAKE_REAR_GRIP; // rear breaks loose → handbrake slide
    }
    if (driveline.parkingBrakeOn) {
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

    // --- Body-roll coupling (see tuning.ts: rapier suppresses roll torque) --
    this.applyRollCoupling(dt);

    // --- Software anti-roll bars ---------------------------------------------
    this.applyAntiRollAxle(FL, FR, T.ANTI_ROLL_FRONT, dt);
    this.applyAntiRollAxle(RL, RR, T.ANTI_ROLL_REAR, dt);

    // --- Suspension raycasts + wheel impulses (skip our own chassis) --------
    c.updateVehicle(dt, undefined, undefined, (col) => col.handle !== this.chassisColliderHandle);
  }

  /** Teleport back to spawn with zeroed velocities/forces/filters. */
  reset(): void {
    if (this.disposed) return;
    this.body.setTranslation(this.spawnTranslation, true);
    this.body.setRotation(this.spawnRotation, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.steer = 0;
    this.aLatSmooth = 0;
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
    let aLat = dot(this.tmpV, left);
    aLat = clamp(aLat, -T.ROLL_COUPLING_MAX_LAT, T.ROLL_COUPLING_MAX_LAT);
    this.aLatSmooth += (aLat - this.aLatSmooth) * Math.min(1, T.ROLL_COUPLING_LP * dt);

    // Torque about the forward axis: accel to the left (+) → lean right (out).
    const magnitude = T.CHASSIS_MASS * this.aLatSmooth * T.ROLL_COUPLING_ARM * dt;
    const fwd = rotateInto(r, 0, 0, 1, this.tmpV);
    this.body.applyTorqueImpulse(
      { x: fwd.x * magnitude, y: fwd.y * magnitude, z: fwd.z * magnitude },
      true,
    );
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
