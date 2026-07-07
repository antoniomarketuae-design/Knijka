"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { Group, Object3D } from "three";
import type { RigidBody as RapierBody, World as RapierWorld } from "@dimforge/rapier3d-compat";
import {
  chassisMassProperties,
  IDLE_INPUT,
  VehicleSim,
  CHASSIS_ANGULAR_DAMPING,
  CHASSIS_FRICTION,
  CHASSIS_HALF_EXTENTS,
  CHASSIS_LINEAR_DAMPING,
  CHASSIS_RESTITUTION,
  COCKPIT_EYE,
  FIXED_DT,
  KILL_PLANE_Y,
  SPAWN,
  STEERED_WHEELS,
  STEERING_WHEEL_VISUAL_RATIO,
  SUSPENSION_REST_LENGTH,
  WHEEL_POSITIONS,
  WHEEL_RADIUS,
  WHEEL_WIDTH,
} from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";

/**
 * R3F binding for the React-free VehicleSim physics core.
 *
 * The chassis is a declarative @react-three/rapier `<RigidBody>` so the
 * library owns its lifecycle AND applies render interpolation between fixed
 * 60 Hz physics steps (kills micro-stutter on 144 Hz displays). Every number
 * on the body/collider comes from tuning.ts — the same constants the headless
 * harness uses via createHeadlessChassis(), so browser and CI physics match.
 *
 * Zero physics logic lives here: this component only
 *  1. attaches VehicleSim to the chassis body,
 *  2. feeds it input once per fixed physics substep (useBeforePhysicsStep),
 *  3. mirrors suspension/steer/spin state onto placeholder visuals per frame.
 */
export function VehicleRig({
  simRef,
  chassisGroupRef,
  inputRef,
}: {
  simRef: RefObject<VehicleSim | null>;
  chassisGroupRef: RefObject<Group | null>;
  inputRef: RefObject<SimInput | null>;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const wheelPivots = useRef<(Object3D | null)[]>([null, null, null, null]);
  const wheelSpins = useRef<(Object3D | null)[]>([null, null, null, null]);
  const steeringWheelRef = useRef<Group>(null);

  // Stable identity so @react-three/rapier does not re-apply mass props.
  const massProperties = useMemo(() => chassisMassProperties(), []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // @react-three/rapier bundles its own pinned copy of
    // @dimforge/rapier3d-compat (0.19.2) while the platform tree has 0.19.3.
    // The classes are structurally identical, but TS compares their private
    // fields nominally, so the two Worlds "differ". Runtime is safe —
    // VehicleSim only calls public World/RigidBody methods on the instances
    // r3r created. Keep this cast as the ONLY seam between the copies.
    const sim = new VehicleSim(world as unknown as RapierWorld, body as unknown as RapierBody);
    simRef.current = sim;
    return () => {
      if (simRef.current === sim) simRef.current = null;
      sim.dispose();
    };
  }, [world, simRef]);

  // Runs once per fixed 60 Hz substep, right before world.step() — exactly
  // the contract VehicleSim.update() requires. Always the fixed dt.
  useBeforePhysicsStep(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.update(inputRef.current?.read() ?? IDLE_INPUT, FIXED_DT);
  });

  // Visual sync (render rate): wheels, steering wheel, kill-plane rescue.
  useFrame(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.positionY < KILL_PLANE_Y) sim.reset();

    for (let i = 0; i < WHEEL_POSITIONS.length; i++) {
      const pivot = wheelPivots.current[i];
      const spin = wheelSpins.current[i];
      const p = WHEEL_POSITIONS[i];
      if (!pivot || !spin || !p) continue;
      pivot.position.set(p.x, p.y - sim.wheelSuspensionLength(i), p.z);
      pivot.rotation.y = (STEERED_WHEELS as readonly number[]).includes(i) ? sim.steerRad : 0;
      // Rolling forward (+Z) is a negative rotation about the +X axle.
      spin.rotation.x = -sim.wheelRotationRad(i);
    }
    if (steeringWheelRef.current) {
      steeringWheelRef.current.rotation.z = -sim.steerRad * STEERING_WHEEL_VISUAL_RATIO;
    }
  });

  const h = CHASSIS_HALF_EXTENTS;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      ccd
      canSleep={false}
      position={[SPAWN.x, SPAWN.y, SPAWN.z]}
      rotation={[0, SPAWN.yawRad, 0]}
      angularDamping={CHASSIS_ANGULAR_DAMPING}
      linearDamping={CHASSIS_LINEAR_DAMPING}
    >
      <CuboidCollider
        args={[h.x, h.y, h.z]}
        friction={CHASSIS_FRICTION}
        restitution={CHASSIS_RESTITUTION}
        massProperties={massProperties}
      />
      {/* Placeholder visuals (boxes) — real glTF car later (ADR-005 assets). */}
      <group ref={chassisGroupRef}>
        {/* Body box matches the collider exactly (debugging aid). */}
        <mesh>
          <boxGeometry args={[h.x * 2, h.y * 2, h.z * 2]} />
          <meshStandardMaterial color="#2b7fd9" roughness={0.45} metalness={0.25} />
        </mesh>
        {/* Cabin (visual only). */}
        <mesh position={[0, h.y + 0.28, -0.35]}>
          <boxGeometry args={[1.44, 0.56, 1.9]} />
          <meshStandardMaterial color="#0e1319" roughness={0.2} metalness={0.6} />
        </mesh>
        {/* Head/tail markers so orientation is obvious (front = +Z, white). */}
        <mesh position={[0, 0.05, h.z + 0.03]}>
          <boxGeometry args={[1.4, 0.12, 0.06]} />
          <meshStandardMaterial color="#ffffff" emissive="#bbbbcc" emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0, 0.05, -h.z - 0.03]}>
          <boxGeometry args={[1.4, 0.12, 0.06]} />
          <meshStandardMaterial color="#991111" emissive="#aa1111" emissiveIntensity={0.7} />
        </mesh>
        {/* Wheels: pivot (steer yaw + suspension travel) → spin mesh (rolling). */}
        {WHEEL_POSITIONS.map((p, i) => (
          <group
            key={i}
            ref={(el) => {
              wheelPivots.current[i] = el;
            }}
            position={[p.x, p.y - SUSPENSION_REST_LENGTH, p.z]}
          >
            {/* Spin group gets rotation.x mutated per frame; the inner mesh
                carries the static axle alignment so React and useFrame never
                fight over the same Euler. */}
            <group
              ref={(el) => {
                wheelSpins.current[i] = el;
              }}
            >
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20]} />
                <meshStandardMaterial color="#14181d" roughness={0.85} />
              </mesh>
            </group>
          </group>
        ))}
        {/* Minimal cockpit: dashboard + steering wheel (seen from the eye cam). */}
        <mesh position={[0, 0.36, 0.62]}>
          <boxGeometry args={[1.5, 0.16, 0.3]} />
          <meshStandardMaterial color="#14181d" roughness={0.85} />
        </mesh>
        <group position={[COCKPIT_EYE.x, 0.3, 0.52]} rotation={[-0.45, 0, 0]}>
          <group ref={steeringWheelRef}>
            <mesh>
              <torusGeometry args={[0.19, 0.025, 10, 24]} />
              <meshStandardMaterial color="#14181d" roughness={0.85} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.34, 0.03, 0.02]} />
              <meshStandardMaterial color="#14181d" roughness={0.85} />
            </mesh>
          </group>
        </group>
      </group>
    </RigidBody>
  );
}
