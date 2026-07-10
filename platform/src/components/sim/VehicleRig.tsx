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
import { DoubleSide } from "three";
import type { Group, PointLight } from "three";
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
  applyDifficulty,
  createDriveAssistState,
  DEFAULT_DIFFICULTY,
  transmissionModeFor,
  type DifficultyMode,
} from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { CabinControls } from "./cabin";
import type { SimAudio } from "./simAudio";
import { updateVehicleSample } from "./vehicleSample";
import { INTERIOR_LAYER, VitokCockpit } from "./vitok/VitokCockpit";
import { HeroCarBody } from "./HeroCarBody";
import { readNpcColliderUserData } from "./NpcColliders";

/** Contact classification (mirrors SimTickEvent collision `withWhat`). */
export type CollisionWithWhat = "vehicle" | "pedestrian" | "cyclist" | "staticObject";

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

/** A contact below this impact speed (km/h) is treated as a gentle nudge /
 *  curb touch — audible thump only, NOT graded as a collision (which would
 *  terminate the session). Real crashes into walls/vehicles are above it. */
const COLLISION_MIN_KMH = 10;

export function VehicleRig({
  simRef,
  chassisGroupRef,
  inputRef,
  cabinRef,
  audioRef,
  sampleRef,
  paused,
  spawn = SPAWN,
  difficultyRef,
  onCollision,
  night = false,
}: {
  simRef: RefObject<VehicleSim | null>;
  chassisGroupRef: RefObject<Group | null>;
  inputRef: RefObject<SimInput | null>;
  cabinRef: RefObject<CabinControls | null>;
  audioRef: RefObject<SimAudio | null>;
  sampleRef: RefObject<VehicleSample>;
  paused: boolean;
  spawn?: VehicleSpawn;
  /** Current driving-assist mode (Beginner/Normal/Advanced). Read each step. */
  difficultyRef?: RefObject<DifficultyMode>;
  /** Fired on a real (fast-enough) impact so the rule engine can grade it.
   *  A11: `withWhat` classifies the contact from the other body's NPC-shell
   *  userData tag — untagged bodies (world meshes) are static objects. */
  onCollision?: (impactKmh: number, withWhat: CollisionWithWhat) => void;
  /** Lesson night flag — raises the interior fill light's floor at dusk. The
   *  cabin's own headlights / night-preview toggle also raise it, so the cabin
   *  never goes near-black even when this is left at its default. */
  night?: boolean;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const assistRef = useRef(createDriveAssistState());
  // Interior fill light — driven per frame (never re-renders).
  const fillRef = useRef<PointLight>(null);

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
    const raw = inputRef.current?.read() ?? IDLE_INPUT;
    const mode = difficultyRef?.current ?? DEFAULT_DIFFICULTY;
    // Shape input for the learner mode (throttle/governor/steer smoothing) —
    // physics constants untouched, so the CI harness stays valid.
    const shaped = applyDifficulty(raw, mode, sim.speedKmh, FIXED_DT, assistRef.current);
    // A1: the driveline gates traction (ignition/selector/clutch/parking
    // brake). Without a cabin (headless/legacy) the default keeps the car
    // permanently ready-to-drive — exactly the pre-A1 behavior.
    const driveline = cabinRef.current?.driveline.physicsInput;
    sim.update(shaped, FIXED_DT, driveline);
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
      // A1: advance the driveline (stall grace timer + difficulty-driven
      // transmission mode). Render rate is plenty for a 0.7 s stall window.
      cabin.driveline.update(delta, {
        speedKmh: sim.speedKmh,
        throttle: input?.throttle ?? 0,
        transmission: transmissionModeFor(difficultyRef?.current ?? DEFAULT_DIFFICULTY),
      });
      const chassis = chassisGroupRef.current;
      if (chassis) updateVehicleSample(sampleRef.current, sim, chassis, cabin, input);
    }

    // Interior fill: a soft floor so the cabin isn't near-black in daytime
    // shadow, rising at dusk (lesson night / N preview) and again when the
    // driver switches the headlights on — so the dash reads at night.
    const fill = fillRef.current;
    if (fill) {
      const lightsOn = (cabin?.headlights ?? "off") !== "off";
      const dusk = night || (cabin?.nightPreview ?? false);
      const target = (dusk ? 0.55 : 0.12) + (lightsOn ? 0.7 : 0);
      fill.intensity += (target - fill.intensity) * Math.min(1, delta * 6);
    }
    audioRef.current?.update({
      speedKmh: sim.speedKmh,
      throttle: input?.throttle ?? 0,
      brake: input?.brake ?? 0,
      indicatorActive:
        (cabin?.indicator ?? "off") !== "off" || (cabin?.driveline.hazardsOn ?? false),
      blinkOn: (cabin?.blinkOn ?? false) || (cabin?.hazardBlinkOn ?? false),
      // A1 driveline truth: the engine voice dies with the ignition/stall,
      // wipers swish from real state, the horn sounds while held.
      engineOn: cabin?.driveline.engineOn ?? true,
      wipersOn: cabin?.driveline.wipersOn ?? false,
      hornOn: cabin?.driveline.hornOn ?? false,
      paused,
      // rain + nearestNpcM arrive via audio.setEnvironment (LessonScene's
      // frame loop).
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
      onCollisionEnter={(payload) => {
        // A11: classify the contact — NPC shells carry a userData tag
        // (NpcColliders); anything untagged (world meshes, props, kerbs)
        // stays a static object.
        const tag = readNpcColliderUserData(payload.other.rigidBody?.userData);
        // Impact severity = RELATIVE speed: a moving NPC striking a stopped
        // player is still a real crash. Static geometry has zero velocity,
        // so the pre-A11 own-speed behavior is preserved there.
        const pv = payload.target.rigidBody?.linvel();
        const ov = payload.other.rigidBody?.linvel();
        const impactKmh =
          pv && ov
            ? Math.hypot(pv.x - ov.x, pv.y - ov.y, pv.z - ov.z) * 3.6
            : Math.abs(simRef.current?.speedKmh ?? 0);
        audioRef.current?.thump(Math.min(1, impactKmh / 50 + 0.15));
        if (impactKmh >= COLLISION_MIN_KMH) {
          onCollision?.(impactKmh, tag?.kind ?? "staticObject");
        }
      }}
    >
      <CuboidCollider
        args={[h.x, h.y, h.z]}
        friction={CHASSIS_FRICTION}
        restitution={CHASSIS_RESTITUTION}
        massProperties={massProperties}
      />
      {/* Vehicle visuals — everything inside follows the interpolated body.
          Hero "Aurelis GT-E" exterior (Draco glTF, chase view) + the authored
          GT-E interior via VitokCockpit (cockpit view, A3). */}
      <group ref={chassisGroupRef}>
        <HeroCarBody simRef={simRef} />
        <VitokCockpit simRef={simRef} inputRef={inputRef} cabinRef={cabinRef} />

        {/* Windshield glass — a faint cool-tinted, low-roughness plane raked
            through the A3 interior's windshield opening (the interior GLB has
            frame/pillars but no glass surface, and the exterior's opaque glass
            hides in cockpit view — this plane is the only "glass" the driver
            looks through). Refit to the GLB aperture: cowl ~y0.5/z0.9 up to
            the header ~y0.85/z0.55. depthWrite off so it never occludes the
            world; INTERIOR_LAYER so the A4 mirror cameras never see it. */}
        <mesh
          position={[0, 0.66, 0.76]}
          rotation={[-0.62, 0, 0]}
          onUpdate={(m) => m.layers.set(INTERIOR_LAYER)}
        >
          <planeGeometry args={[1.5, 0.55]} />
          <meshStandardMaterial
            color="#243040"
            transparent
            opacity={0.14}
            roughness={0.06}
            metalness={0.1}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Interior fill light — soft, cabin-local (short range so it doesn't
            leak onto the street); intensity is animated in useFrame. */}
        <pointLight
          ref={fillRef}
          position={[0, 0.58, 0.05]}
          color="#ffd9a8"
          intensity={0.12}
          distance={2.4}
          decay={2}
          castShadow={false}
        />
      </group>
    </RigidBody>
  );
}
