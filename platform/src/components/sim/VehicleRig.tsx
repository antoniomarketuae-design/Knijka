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
import type { Group } from "three";
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
  FIXED_DT,
  KILL_PLANE_Y,
  SPAWN,
} from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { CabinControls } from "./cabin";
import type { SimAudio } from "./simAudio";
import { updateVehicleSample } from "./vehicleSample";
import { VitokCockpit } from "./vitok/VitokCockpit";
import { VitokExterior } from "./vitok/VitokExterior";
import { VitokWheels } from "./vitok/VitokWheels";

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
 *  3. mounts the „Виток" visuals (exterior / wheels / cockpit — they animate
 *     themselves from simRef/cabinRef), and per render frame advances the
 *     cabin clocks, publishes the VehicleSample for the rule engine, and
 *     feeds the audio layer.
 */
/** Where the chassis body starts (three.js meters + yaw). Defaults to the
 *  test-track SPAWN; lessons pass their district spawn point converted here. */
export interface VehicleSpawn {
  x: number;
  y: number;
  z: number;
  yawRad: number;
}

export function VehicleRig({
  simRef,
  chassisGroupRef,
  inputRef,
  cabinRef,
  audioRef,
  sampleRef,
  paused,
  spawn = SPAWN,
}: {
  simRef: RefObject<VehicleSim | null>;
  chassisGroupRef: RefObject<Group | null>;
  inputRef: RefObject<SimInput | null>;
  cabinRef: RefObject<CabinControls | null>;
  audioRef: RefObject<SimAudio | null>;
  sampleRef: RefObject<VehicleSample>;
  paused: boolean;
  spawn?: VehicleSpawn;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);

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
    const sim = new VehicleSim(
      world as unknown as RapierWorld,
      body as unknown as RapierBody,
      spawn,
    );
    simRef.current = sim;
    return () => {
      if (simRef.current === sim) simRef.current = null;
      sim.dispose();
    };
  }, [world, simRef, spawn]);

  // Runs once per fixed 60 Hz substep, right before world.step() — exactly
  // the contract VehicleSim.update() requires. Always the fixed dt.
  useBeforePhysicsStep(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.update(inputRef.current?.read() ?? IDLE_INPUT, FIXED_DT);
  });

  // Render-rate glue: kill-plane rescue, cabin clocks (blink/glance),
  // rule-engine sample, engine/indicator audio. The Vitok visual components
  // run their own useFrame for meshes/lamps/instruments.
  useFrame((_, delta) => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.positionY < KILL_PLANE_Y) sim.reset();

    const cabin = cabinRef.current;
    const input = inputRef.current?.read() ?? null;
    if (cabin) {
      cabin.update(delta, sim.steerRad);
      const chassis = chassisGroupRef.current;
      if (chassis) updateVehicleSample(sampleRef.current, sim, chassis, cabin, input);
    }
    audioRef.current?.update({
      speedKmh: sim.speedKmh,
      throttle: input?.throttle ?? 0,
      indicatorActive: (cabin?.indicator ?? "off") !== "off",
      blinkOn: cabin?.blinkOn ?? false,
      paused,
    });
  });

  const h = CHASSIS_HALF_EXTENTS;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      ccd
      canSleep={false}
      position={[spawn.x, spawn.y, spawn.z]}
      rotation={[0, spawn.yawRad, 0]}
      angularDamping={CHASSIS_ANGULAR_DAMPING}
      linearDamping={CHASSIS_LINEAR_DAMPING}
      onCollisionEnter={() => {
        const speed = Math.abs(simRef.current?.speedKmh ?? 0);
        audioRef.current?.thump(Math.min(1, speed / 50 + 0.15));
      }}
    >
      <CuboidCollider
        args={[h.x, h.y, h.z]}
        friction={CHASSIS_FRICTION}
        restitution={CHASSIS_RESTITUTION}
        massProperties={massProperties}
      />
      {/* „Виток" visuals — everything inside follows the interpolated body. */}
      <group ref={chassisGroupRef}>
        <VitokExterior simRef={simRef} inputRef={inputRef} cabinRef={cabinRef} />
        <VitokWheels simRef={simRef} />
        <VitokCockpit simRef={simRef} inputRef={inputRef} cabinRef={cabinRef} />
      </group>
    </RigidBody>
  );
}
