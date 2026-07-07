// The car: Rapier DynamicRayCastVehicleController + placeholder visuals.
// Pattern follows the official three.js "physics rapier vehicle controller"
// example (raycast suspension, per-wheel engine/brake/steer), extended with:
// speed-sensitive steering, brake-vs-reverse logic, software anti-roll bars,
// quadratic drag/downforce, and a lowered centre of mass.
//
// Everything physics-side is plain TS on rapier types — no React, no three.js
// dependency in the physics path except math helpers — so it can be ported
// into the platform (R3F) behind a hook without rewriting.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {
  Collider,
  DynamicRayCastVehicleController,
  RigidBody,
  World,
} from '@dimforge/rapier3d-compat';
import * as T from './tuning';
import type { VehicleInput } from './input';

const FL = 0;
const FR = 1;
const RL = 2;
const RR = 3;
const WHEEL_COUNT = 4;

const UP = new THREE.Vector3(0, 1, 0);

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export class Vehicle {
  /** Visual root, synced from the rigid body every frame. */
  readonly root = new THREE.Group();
  /** Attach the cockpit camera here (already at driver eye height). */
  readonly cockpitAnchor = new THREE.Object3D();

  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: DynamicRayCastVehicleController;

  private readonly wheelPivots: THREE.Object3D[] = []; // steer yaw + suspension travel
  private readonly wheelSpins: THREE.Object3D[] = []; // rolling rotation
  private steeringWheel: THREE.Object3D | null = null;

  private steer = 0;

  // Scratch objects (no per-frame allocation).
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly spawnRotation: THREE.Quaternion;

  constructor(world: World, scene: THREE.Scene) {
    this.spawnRotation = new THREE.Quaternion().setFromAxisAngle(UP, T.SPAWN.yawRad);

    // --- Rigid body ---------------------------------------------------------
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(T.SPAWN.x, T.SPAWN.y, T.SPAWN.z)
      .setRotation({
        x: this.spawnRotation.x,
        y: this.spawnRotation.y,
        z: this.spawnRotation.z,
        w: this.spawnRotation.w,
      })
      .setAngularDamping(T.CHASSIS_ANGULAR_DAMPING)
      .setLinearDamping(T.CHASSIS_LINEAR_DAMPING)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    // Box inertia scaled up (real cars are not uniform boxes), COM dropped to
    // sill height — the single most effective anti-flip measure.
    const m = T.CHASSIS_MASS;
    const ex = T.CHASSIS_HALF_EXTENTS.x * 2;
    const ey = T.CHASSIS_HALF_EXTENTS.y * 2;
    const ez = T.CHASSIS_HALF_EXTENTS.z * 2;
    const inertia = {
      x: (m / 12) * (ey * ey + ez * ez) * T.INERTIA_SCALE.pitch,
      y: (m / 12) * (ex * ex + ez * ez) * T.INERTIA_SCALE.yaw,
      z: (m / 12) * (ex * ex + ey * ey) * T.INERTIA_SCALE.roll,
    };
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      T.CHASSIS_HALF_EXTENTS.x,
      T.CHASSIS_HALF_EXTENTS.y,
      T.CHASSIS_HALF_EXTENTS.z,
    )
      .setMassProperties(m, T.COM_OFFSET, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.5)
      .setRestitution(0.05);
    this.collider = world.createCollider(colliderDesc, this.body);

    // --- Raycast vehicle controller -----------------------------------------
    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1; // +Y
    // rapier.js quirk: the forward-axis setter is misnamed `setIndexForwardAxis`
    // (it's a property setter, not a method) — assigning to `indexForwardAxis`
    // does nothing because that name only has a getter.
    this.controller.setIndexForwardAxis = 2; // +Z

    const suspensionDir = new RAPIER.Vector3(0, -1, 0);
    // Axle -X with +Z forward ⇒ positive engine force pushes the car forward
    // (Bullet convention: forward = contactNormal × axle).
    const axle = new RAPIER.Vector3(-1, 0, 0);

    for (let i = 0; i < WHEEL_COUNT; i++) {
      const p = T.WHEEL_POSITIONS[i];
      if (!p) continue;
      this.controller.addWheel(
        new RAPIER.Vector3(p.x, p.y, p.z),
        suspensionDir,
        axle,
        T.SUSPENSION_REST_LENGTH,
        T.WHEEL_RADIUS,
      );
    }
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const isFront = i === FL || i === FR;
      this.controller.setWheelSuspensionStiffness(i, T.SUSPENSION_STIFFNESS);
      this.controller.setWheelSuspensionCompression(i, T.SUSPENSION_DAMPING_COMPRESSION);
      this.controller.setWheelSuspensionRelaxation(i, T.SUSPENSION_DAMPING_RELAXATION);
      this.controller.setWheelMaxSuspensionTravel(i, T.SUSPENSION_MAX_TRAVEL);
      this.controller.setWheelMaxSuspensionForce(i, T.SUSPENSION_MAX_FORCE);
      this.controller.setWheelFrictionSlip(i, isFront ? T.FRICTION_SLIP_FRONT : T.FRICTION_SLIP_REAR);
      this.controller.setWheelSideFrictionStiffness(i, T.SIDE_FRICTION_STIFFNESS);
    }

    this.buildVisuals();
    scene.add(this.root);
  }

  // ---------------------------------------------------------------------------
  // Per-physics-step update. Call BEFORE world.step().
  // ---------------------------------------------------------------------------
  update(input: VehicleInput, dt: number): void {
    const c = this.controller;
    const speedMs = c.currentVehicleSpeed(); // m/s, signed (+ forward)
    const speedKmh = speedMs * 3.6;
    const absKmh = Math.abs(speedKmh);

    // --- Steering: speed-sensitive limit + rate-limited wheel ---------------
    const range = T.STEER_MIN_SPEED_KMH - T.STEER_FULL_SPEED_KMH;
    const f = THREE.MathUtils.clamp((absKmh - T.STEER_FULL_SPEED_KMH) / range, 0, 1);
    const maxSteer = THREE.MathUtils.lerp(T.STEER_MAX_ANGLE, T.STEER_MIN_ANGLE, f);
    const steerTarget = input.steer * maxSteer;
    const returning = Math.abs(steerTarget) < Math.abs(this.steer);
    const rate = returning ? T.STEER_RETURN_SPEED : T.STEER_SPEED;
    this.steer = approach(this.steer, steerTarget, rate * dt);
    for (const i of T.STEERED_WHEELS) c.setWheelSteering(i, this.steer);

    // --- Throttle / brake / reverse state machine ---------------------------
    let engineTotal = 0; // N, split across driven wheels
    let brakePedal = 0; // 0..1
    if (input.throttle > 0) {
      if (speedMs < -0.5) {
        brakePedal = input.throttle; // rolling backwards: throttle stops first
      } else {
        engineTotal = T.engineForceAt(absKmh) * input.throttle;
      }
    } else if (input.brake > 0) {
      if (speedMs > 0.5) {
        brakePedal = input.brake; // moving forwards: brake pedal brakes
      } else if (speedKmh > -T.REVERSE_MAX_KMH) {
        engineTotal = -T.REVERSE_FORCE_N * input.brake; // stopped: reverse
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

    // --- Software anti-roll bars ---------------------------------------------
    this.applyAntiRollAxle(FL, FR, T.ANTI_ROLL_FRONT, dt);
    this.applyAntiRollAxle(RL, RR, T.ANTI_ROLL_REAR, dt);

    // --- Suspension raycasts + wheel impulses (skip our own chassis) --------
    c.updateVehicle(dt, undefined, undefined, (col) => col.handle !== this.collider.handle);
  }

  /** Copy physics state into the three.js visuals. Call once per frame. */
  syncVisuals(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.set(r.x, r.y, r.z, r.w);

    for (let i = 0; i < WHEEL_COUNT; i++) {
      const pivot = this.wheelPivots[i];
      const spin = this.wheelSpins[i];
      const p = T.WHEEL_POSITIONS[i];
      if (!pivot || !spin || !p) continue;
      const susp = this.controller.wheelSuspensionLength(i) ?? T.SUSPENSION_REST_LENGTH;
      pivot.position.set(p.x, p.y - susp, p.z); // suspension dir is (0,-1,0)
      pivot.rotation.y = i === FL || i === FR ? this.steer : 0;
      // Rolling forward (+Z) is a negative rotation about the +X axle.
      spin.rotation.x = -(this.controller.wheelRotation(i) ?? 0);
    }
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -this.steer * T.STEERING_WHEEL_VISUAL_RATIO;
    }
  }

  reset(): void {
    this.body.setTranslation({ x: T.SPAWN.x, y: T.SPAWN.y, z: T.SPAWN.z }, true);
    this.body.setRotation(
      {
        x: this.spawnRotation.x,
        y: this.spawnRotation.y,
        z: this.spawnRotation.z,
        w: this.spawnRotation.w,
      },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.steer = 0;
  }

  /** Signed speed in km/h (+ forward). */
  get speedKmh(): number {
    return this.controller.currentVehicleSpeed() * 3.6;
  }

  /** Narrow debug readout (numeric tuning harness + future debug HUD). */
  debugState(): {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    suspensionLengths: number[];
    wheelsInContact: boolean[];
    steerRad: number;
  } {
    const t = this.body.translation();
    const r = this.body.rotation();
    const suspensionLengths: number[] = [];
    const wheelsInContact: boolean[] = [];
    for (let i = 0; i < WHEEL_COUNT; i++) {
      suspensionLengths.push(this.controller.wheelSuspensionLength(i) ?? T.SUSPENSION_REST_LENGTH);
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

  /** Cosmetic automatic gearbox for the HUD. */
  get gear(): string {
    const v = this.speedKmh;
    if (v < -0.8) return 'R';
    if (v < 0.8) return 'N';
    let g = 1;
    for (const threshold of T.GEAR_UPSHIFT_KMH) {
      if (v > threshold) g++;
    }
    return String(g);
  }

  // ---------------------------------------------------------------------------

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
    this.tmpQ.set(r.x, r.y, r.z, r.w);

    const pL = T.WHEEL_POSITIONS[left];
    const pR = T.WHEEL_POSITIONS[right];
    if (!pL || !pR) return;

    this.tmpV.set(pL.x, pL.y, pL.z).applyQuaternion(this.tmpQ);
    this.body.applyImpulseAtPoint(
      { x: 0, y: force * dt, z: 0 },
      { x: t.x + this.tmpV.x, y: t.y + this.tmpV.y, z: t.z + this.tmpV.z },
      true,
    );
    this.tmpV.set(pR.x, pR.y, pR.z).applyQuaternion(this.tmpQ);
    this.body.applyImpulseAtPoint(
      { x: 0, y: -force * dt, z: 0 },
      { x: t.x + this.tmpV.x, y: t.y + this.tmpV.y, z: t.z + this.tmpV.z },
      true,
    );
  }

  private buildVisuals(): void {
    const h = T.CHASSIS_HALF_EXTENTS;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f6fbd, roughness: 0.45, metalness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1319, roughness: 0.2, metalness: 0.6 });

    // Body box matches the collider exactly (debugging aid).
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), bodyMat);
    bodyMesh.castShadow = true;
    this.root.add(bodyMesh);

    // Cabin (visual only). FrontSide culling ⇒ invisible from the cockpit cam.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.56, 1.9), glassMat);
    cabin.position.set(0, h.y + 0.28, -0.35);
    cabin.castShadow = true;
    this.root.add(cabin);

    // Head/tail markers so orientation is obvious (front = +Z, white).
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbbbbcc, emissiveIntensity: 0.7 }),
    );
    front.position.set(0, 0.05, h.z + 0.03);
    this.root.add(front);
    const rear = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x991111, emissive: 0xaa1111, emissiveIntensity: 0.7 }),
    );
    rear.position.set(0, 0.05, -h.z - 0.03);
    this.root.add(rear);

    // Wheels: pivot (steer yaw + suspension travel) → spin mesh (rolling).
    const wheelGeo = new THREE.CylinderGeometry(T.WHEEL_RADIUS, T.WHEEL_RADIUS, T.WHEEL_WIDTH, 20);
    wheelGeo.rotateZ(Math.PI / 2); // cylinder axis Y → X (axle direction)
    for (let i = 0; i < WHEEL_COUNT; i++) {
      const p = T.WHEEL_POSITIONS[i];
      if (!p) continue;
      const pivot = new THREE.Object3D();
      pivot.position.set(p.x, p.y - T.SUSPENSION_REST_LENGTH, p.z);
      const spin = new THREE.Mesh(wheelGeo, darkMat);
      spin.castShadow = true;
      pivot.add(spin);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelSpins.push(spin);
    }

    // Minimal cockpit: dashboard + steering wheel (visible from the eye cam).
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.3), darkMat);
    dash.position.set(0, 0.36, 0.62);
    this.root.add(dash);
    const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 10, 24), darkMat);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02), darkMat);
    wheelRim.add(spoke);
    const wheelPivot = new THREE.Object3D();
    wheelPivot.position.set(T.COCKPIT_EYE.x, 0.3, 0.52);
    wheelPivot.rotation.x = -0.45; // column rake
    wheelPivot.add(wheelRim);
    this.root.add(wheelPivot);
    this.steeringWheel = wheelRim;

    // Cockpit camera anchor at driver eye height (LHD → +X side).
    this.cockpitAnchor.position.set(T.COCKPIT_EYE.x, T.COCKPIT_EYE.y, T.COCKPIT_EYE.z);
    this.root.add(this.cockpitAnchor);
  }
}
