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
import { DoubleSide, Object3D } from "three";
import type { Group, PointLight, SpotLight } from "three";
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
import { surfacePatchGripAt, type SurfaceGripPatch } from "@/modules/sim/runtime";
import type { CabinControls } from "./cabin";
import type { SimAudio } from "./simAudio";
import { updateVehicleSample } from "./vehicleSample";
import { INTERIOR_LAYER, VitokCockpit } from "./vitok/VitokCockpit";
import { HeroCarBody } from "./HeroCarBody";
import { readNpcColliderUserData } from "./NpcColliders";
import { loadQualityPreset } from "./lesson-ui/QualityPresetSelector";

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
 *  terminate the session). Real crashes into walls/vehicles are above it.
 *  This is the DEFAULT for street driving; scenario lessons can lower it via
 *  the `collisionMinKmh` prop (S0, doc 76 §0): a 2 km/h bumper touch on a
 *  parked car or cone IS the graded mistake in a parking task, while the
 *  street nudge-tolerance stays 10 everywhere else. */
export const COLLISION_MIN_KMH = 10;

/** Stable empty default for gripPatches — a shared frozen constant so the
 *  prop is value-stable across renders and the patch branch below never runs
 *  for the (default) patch-less lessons. */
const NO_GRIP_PATCHES: readonly SurfaceGripPatch[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// NIGHT headlight throw (founder report 2026-07-19: "the vehicle lights never
// actually turn on"). Two front SpotLights that pool real light on the road,
// driven by CabinControls.headlights. Cost discipline:
//  - mounted ONLY on night lessons (day = zero lights, zero shader delta);
//  - the LOW quality preset mounts a single centre beam (forward renderer:
//    every visible light adds per-fragment cost to every lit pixel);
//  - "off" drives intensity to 0 but keeps the light VISIBLE — a constant
//    light count means three.js never recompiles every material mid-drive
//    (the SimEnvironment structural-constancy rule);
//  - castShadow stays false, distance-limited falloff, no per-frame allocs
//    (state-keyed writes only on a headlight-mode change).
// Intensities are physical-ish candela (decay 2): pool brightness at range d
// ≈ intensity / d². Tune LOW_BEAM.intensity / HIGH_BEAM.intensity first if
// the founder wants more/less throw.
// ---------------------------------------------------------------------------
/** Low beam: warm, wide, aimed at the tarmac ~18 m out. */
const LOW_BEAM = { intensity: 400, angle: 0.5, penumbra: 0.45, distance: 60, color: 0xffe6b8, targetY: -0.35, targetZ: 18 } as const;
/** High beam: brighter AND whiter, tighter cone, aimed ~45 m out and flatter. */
const HIGH_BEAM = { intensity: 1500, angle: 0.36, penumbra: 0.35, distance: 120, color: 0xf2f6ff, targetY: -0.1, targetZ: 45 } as const;
/** Single-beam (low preset) intensity compensation. */
const SINGLE_BEAM_SCALE = 1.6;
/** DAY-RAIN beam scale (founder review doc 62 #41 — "turning lights ON
 *  changes nothing visually" in the rain drill): rain lessons now mount the
 *  same beam rig as night, dimmed so the pool reads as a subtle throw on the
 *  darkened wet scene instead of a night-strength cone under residual
 *  daylight. Night rain keeps the full night values (night wins). */
const RAIN_DAY_BEAM_SCALE = 0.45;

// ---------------------------------------------------------------------------
// WIPERS (founder review doc 62 #24: "the wiper button does nothing visible").
// Two blade meshes riding the chassis at the windshield plane's pose, so BOTH
// views see them: the cockpit looks through the glass at them, the chase view
// sees them on the car (the exterior shell hides in cockpit view, but these —
// like the windshield plane and the beam spots — live on the chassis group).
// Parked they rest near-horizontal at the cowl; while
// CabinControls.driveline.wipersOn they sweep a ~70° arc; switched off they
// finish the stroke and ease back to park (a real wiper relay). Render-only,
// zero-allocation: two rotation.z writes per frame, and only while the blades
// are away from park.
// ---------------------------------------------------------------------------
/** Full wipe cycle (park → up → park), seconds — the audio swish cadence. */
const WIPER_PERIOD_S = 1.3;
/** Blade angle at park (rad about the glass normal; +Z rotation maps blade-Y
 *  toward −X = the passenger side on this LHD car — lying along the cowl). */
const WIPER_PARK_RAD = 1.15;
/** Blade angle at the top of the sweep (just past vertical, driver side). */
const WIPER_TOP_RAD = -0.2;
/** Return-to-park rate when switched off mid-stroke (sweep fraction /s). */
const WIPER_PARK_RETURN_PER_S = 1.4;
/** Wiped-arc droplet clearing: ramp-in while wiping / creep-back after (1/s). */
const WIPER_CLEAR_IN_PER_S = 1.2;
const WIPER_CLEAR_OUT_PER_S = 0.15;

/** Ping-pong 0..1 over the wipe cycle from a running phase in [0, 1). */
function wiperSweep01(phase: number): number {
  const p = phase * 2;
  return p < 1 ? p : 2 - p;
}

/** Write one beam state to a spotlight (no-ops on null / day mount). */
function applyHeadlightBeam(spot: SpotLight | null, headKey: number, scale: number): void {
  if (!spot) return;
  if (headKey === 0) {
    spot.intensity = 0; // visible stays true — constant light count
    return;
  }
  const b = headKey === 2 ? HIGH_BEAM : LOW_BEAM;
  spot.intensity = b.intensity * scale;
  spot.angle = b.angle;
  spot.penumbra = b.penumbra;
  spot.distance = b.distance;
  spot.color.setHex(b.color);
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
  difficultyRef,
  lessonMaxLegalKmh,
  onCollision,
  collisionMinKmh = COLLISION_MIN_KMH,
  night = false,
  rain = false,
  wiperVisualRef,
  gripFactor = 1,
  gripPatches = NO_GRIP_PATCHES,
  windLateralN = 0,
  windGustAmplitudeN = 0,
  windGustPeriodSec = 0,
  telltaleLitRef,
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
  /** The lesson's speed DOMAIN (max legal speed anywhere on the loaded map,
   *  km/h) — scales the difficulty governor so Нормален can reach the АМ-140
   *  flow while still governing ~55–60 in a 50-city (founder review R3 #37;
   *  vehicle/difficulty.ts governorCapKmh). Absent = the preset's researched
   *  static caps, byte-identical legacy behavior. */
  lessonMaxLegalKmh?: number;
  /** Fired on a real (fast-enough) impact so the rule engine can grade it.
   *  A11: `withWhat` classifies the contact from the other body's NPC-shell
   *  userData tag — untagged bodies (world meshes) are static objects. */
  onCollision?: (impactKmh: number, withWhat: CollisionWithWhat) => void;
  /** Minimum impact speed (km/h) that grades as a collision. Defaults to the
   *  street nudge-tolerance COLLISION_MIN_KMH (10). Parking scenarios pass a
   *  low/zero threshold (S0 seam — see ScenarioObstacles) so ANY bumper
   *  contact registers as the mistake it is. The sub-threshold thump audio
   *  is unaffected. */
  collisionMinKmh?: number;
  /** Lesson night flag — raises the interior fill light's floor at dusk,
   *  mounts the headlight SpotLight throw (driven by CabinControls.headlights)
   *  and arms the exterior tail-lamp night glow (HeroCarBody). The cabin's own
   *  headlights / night-preview toggle also raise the fill, so the cabin
   *  never goes near-black even when this is left at its default. */
  night?: boolean;
  /** Lesson rain flag (doc 62 #41) — mounts the SAME beam SpotLight rig as
   *  night (dimmed by RAIN_DAY_BEAM_SCALE unless night is also set) and arms
   *  the exterior tail-lamp glow in rain, so switching the headlights ON in a
   *  rain lesson is VISIBLE. Fixed per lesson, so the mounted light count
   *  stays structurally constant for the session (the SimEnvironment rule). */
  rain?: boolean;
  /** Wiper visual channel (doc 62 #24) — this rig writes the live blade sweep
   *  (0 = parked … 1 = top of stroke) and whether the arc is being kept clear;
   *  WindshieldDroplets reads it to clear the wiped arc in cockpit view.
   *  Render-only, per-frame ref writes (never React state). */
  wiperVisualRef?: RefObject<{ sweep01: number; clearing: number }>;
  /** ADR-006 stage 4a — OPT-IN surface grip for the live physics car. 1
   *  (default, every existing lesson) = today's dry dynamics bit-identical;
   *  wet-grip lessons pass tuning.WET_GRIP_FACTOR (0.7) via
   *  LessonSpec.physics.wetGrip → ~1.4× braking distance; snow-grip lessons
   *  pass tuning.SNOW_GRIP_FACTOR (0.4, packed snow) via physics.snowGrip →
   *  ~2.5× braking distance, reduced lateral grip. Never derived from
   *  environment.rain/snow (shipped weather lessons were tuned dry — the
   *  flag is authored per scenario). */
  gripFactor?: number;
  /** SURFACE-PATCH slice (doc 72 AC-07-full aquaplane / AC-08 ice) — OPT-IN
   *  waterPatch/icePatch rects resolved by LessonScene from the district's
   *  authored zone spans (runtime resolveSurfaceGripPatches). Per physics
   *  substep the rig checks the chassis position against them
   *  (surfacePatchGripAt — the water rects are speed-gated) and feeds
   *  VehicleSim.setSurfaceGripFactor(MIN(gripFactor, patch)) — entering a
   *  patch drops the grip, leaving it restores the lesson base. Empty
   *  (default, every pre-slice map) = the branch below never runs and the
   *  setter is NEVER called — bit-identical dynamics (the wet-grip law;
   *  vehicle/surface-grip.test.ts is the proof). */
  gripPatches?: readonly SurfaceGripPatch[];
  /** CROSSWIND slice (doc 72 AC-12) — OPT-IN constant lateral wind force, N
   *  along WORLD +X (district east; negative = west). 0 (default, every
   *  existing lesson) = the wind branch never runs, bit-identical dynamics;
   *  crosswind lessons pass ±tuning.CROSSWIND_BRIDGE_N via
   *  LessonSpec.physics.crosswind. Never derived from weather (the wet-grip
   *  non-coupling law). Scalar props (not an options object) so the effect
   *  dependency stays value-stable across renders. */
  windLateralN?: number;
  /** Gust sine amplitude, N, on the same world axis (0 = constant-only). */
  windGustAmplitudeN?: number;
  /** Gust sine period, s (must be > 0 for the gust to arm). */
  windGustPeriodSec?: number;
  /** N11 (VP-06): director→cluster warning-lamp channel, threaded to
   *  VitokCockpit (the hazardActiveRef pattern — render-free ref, read per
   *  frame). Absent = the temperature telltale never lights. */
  telltaleLitRef?: RefObject<boolean>;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const assistRef = useRef(createDriveAssistState());
  // Interior fill light — driven per frame (never re-renders).
  const fillRef = useRef<PointLight>(null);
  // Night/rain headlight throw (see the module header block above).
  const spotLRef = useRef<SpotLight>(null);
  const spotRRef = useRef<SpotLight>(null);
  const beamStateRef = useRef(-1);
  // The beam rig mounts on night AND rain lessons (doc 62 #41) — fixed per
  // lesson, so the light count stays structurally constant for the session.
  const beamsMounted = night || rain;
  // Wiper blade pivots + animation state (doc 62 #24) — pure refs, written
  // only while the blades are away from park (zero cost with wipers off).
  const wiperLRef = useRef<Group>(null);
  const wiperRRef = useRef<Group>(null);
  const wiperAnimRef = useRef({ phase: 0, sweep: 0, clearing: 0, active: false });
  // LOW preset = one centre beam; med/high = the real pair. Fixed per session
  // (same one-time read as HeroCarBody's clearcoat gate).
  const spotCount = useMemo(() => (loadQualityPreset() === "low" ? 1 : 2), []);
  // Shared aim target for both beams (converging pools read fine) — mounted
  // into the chassis group via <primitive> so its matrix follows the car.
  const spotTarget = useMemo(() => {
    const o = new Object3D();
    o.position.set(0, LOW_BEAM.targetY, LOW_BEAM.targetZ);
    return o;
  }, []);

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
      // 4a: per-lesson surface grip. The default (1) constructs EXACTLY the
      // pre-4a car — the options object with gripFactor 1 is the identity.
      // AC-12: per-lesson crosswind. The defaults (0) keep the wind branch
      // dormant — same identity discipline as gripFactor.
      {
        gripFactor,
        windLateralN,
        ...(windGustAmplitudeN !== 0 && windGustPeriodSec > 0
          ? { windGust: { periodSec: windGustPeriodSec, amplitudeN: windGustAmplitudeN } }
          : {}),
      },
    );
    simRef.current = sim;
    return () => {
      if (simRef.current === sim) simRef.current = null;
      sim.dispose();
    };
  }, [world, simRef, spawn, gripFactor, windLateralN, windGustAmplitudeN, windGustPeriodSec]);

  // Runs once per fixed 60 Hz substep, right before world.step() — exactly
  // the contract VehicleSim.update() requires. Always the fixed dt.
  useBeforePhysicsStep(() => {
    const sim = simRef.current;
    if (!sim) return;
    // SURFACE-PATCH slice: modulate grip from the authored waterPatch/icePatch
    // rects BEFORE the step consumes it. District mapping (vehicleSample.ts):
    // district x = world x, district y = −world z. Composition: MIN(lesson
    // base, patch) — most restrictive wins; outside every rect the MIN is the
    // base and the setter's early return makes this a no-op. The whole branch
    // is skipped when no patches exist (every pre-slice lesson) — the setter
    // is then never called at all (the bit-identity law).
    if (gripPatches.length > 0) {
      const body = bodyRef.current;
      if (body) {
        const t = body.translation();
        const patchGrip = surfacePatchGripAt(gripPatches, t.x, -t.z, sim.speedKmh);
        sim.setSurfaceGripFactor(Math.min(gripFactor, patchGrip));
      }
    }
    const raw = inputRef.current?.read() ?? IDLE_INPUT;
    const mode = difficultyRef?.current ?? DEFAULT_DIFFICULTY;
    // Shape input for the learner mode (throttle/governor/steer smoothing) —
    // physics constants untouched, so the CI harness stays valid. The lesson
    // speed domain (when threaded) scales the governor cap (#37).
    const shaped = applyDifficulty(
      raw,
      mode,
      sim.speedKmh,
      FIXED_DT,
      assistRef.current,
      lessonMaxLegalKmh,
    );
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

    // Night/rain headlight throw — state-keyed: the beams are rewritten only
    // when the headlight mode changes (off/low/high). Dry day lessons mount no
    // spots, so this whole branch is two null checks. Day-rain lessons (doc 62
    // #41) run the same rig dimmed by RAIN_DAY_BEAM_SCALE; night keeps full
    // strength whether or not it also rains.
    if (beamsMounted) {
      const headKey = cabin?.headlights === "high" ? 2 : cabin?.headlights === "low" ? 1 : 0;
      if (headKey !== beamStateRef.current) {
        beamStateRef.current = headKey;
        const perLamp =
          (spotCount === 1 ? SINGLE_BEAM_SCALE : 1) * (night ? 1 : RAIN_DAY_BEAM_SCALE);
        applyHeadlightBeam(spotLRef.current, headKey, perLamp);
        applyHeadlightBeam(spotRRef.current, headKey, perLamp);
        const b = headKey === 2 ? HIGH_BEAM : LOW_BEAM;
        spotTarget.position.set(0, b.targetY, b.targetZ);
      }
    }

    // Wiper blades (doc 62 #24) — sweep from the driveline truth. ON advances
    // the ping-pong stroke; OFF eases the blades back to park and then stops
    // writing entirely (w.active latches false). The visual channel feeds the
    // cockpit droplet layer: `clearing` ramps while wiping so the wiped arc
    // stays clear, then droplets creep back after the wipers stop.
    {
      const w = wiperAnimRef.current;
      const on = cabin?.driveline.wipersOn ?? false;
      if (on || w.active || w.clearing > 0) {
        if (on) {
          w.phase = (w.phase + delta / WIPER_PERIOD_S) % 1;
          w.sweep = wiperSweep01(w.phase);
          w.active = true;
          w.clearing = Math.min(1, w.clearing + delta * WIPER_CLEAR_IN_PER_S);
        } else {
          w.sweep = Math.max(0, w.sweep - delta * WIPER_PARK_RETURN_PER_S);
          if (w.sweep === 0) {
            w.phase = 0;
            w.active = false;
          }
          w.clearing = Math.max(0, w.clearing - delta * WIPER_CLEAR_OUT_PER_S);
        }
        const angle = WIPER_PARK_RAD + (WIPER_TOP_RAD - WIPER_PARK_RAD) * w.sweep;
        if (wiperLRef.current) wiperLRef.current.rotation.z = angle;
        if (wiperRRef.current) wiperRRef.current.rotation.z = angle;
        const viz = wiperVisualRef?.current;
        if (viz) {
          viz.sweep01 = w.sweep;
          viz.clearing = w.clearing;
        }
      }
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
        if (impactKmh >= collisionMinKmh) {
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
        <HeroCarBody simRef={simRef} cabinRef={cabinRef} inputRef={inputRef} night={night} rain={rain} />
        <VitokCockpit
          simRef={simRef}
          inputRef={inputRef}
          cabinRef={cabinRef}
          telltaleLitRef={telltaleLitRef}
        />

        {/* NIGHT/RAIN headlight throw — real SpotLight pools on the road,
            visible from the cockpit too (the exterior shell hides in cockpit
            view but these live on the chassis). Mounted on night AND rain
            lessons (doc 62 #41 — lights ON must be visible in rain); "off"
            drives intensity 0 while keeping the light count constant (no
            material recompiles — see the module header block). Lamp height
            matches the GLB's drl bar (~0.59 m above tarmac = chassis y 0.24). */}
        {beamsMounted ? (
          <>
            <primitive object={spotTarget} />
            <spotLight
              ref={spotLRef}
              position={[spotCount === 1 ? 0 : 0.58, 0.24, 2.05]}
              target={spotTarget}
              intensity={0}
              angle={LOW_BEAM.angle}
              penumbra={LOW_BEAM.penumbra}
              distance={LOW_BEAM.distance}
              decay={2}
              color={LOW_BEAM.color}
              castShadow={false}
            />
            {spotCount === 2 ? (
              <spotLight
                ref={spotRRef}
                position={[-0.58, 0.24, 2.05]}
                target={spotTarget}
                intensity={0}
                angle={LOW_BEAM.angle}
                penumbra={LOW_BEAM.penumbra}
                distance={LOW_BEAM.distance}
                decay={2}
                color={LOW_BEAM.color}
                castShadow={false}
              />
            ) : null}
          </>
        ) : null}

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

        {/* Wiper blades (doc 62 #24) — two thin dark blades in the windshield
            plane's own frame (same pose as the glass above, nudged outward),
            parked at the cowl and swept by useFrame while the wipers run.
            Chassis-mounted, so the chase view sees them on the car and the
            cockpit sees them through the glass. Default layer 0: the A4 mirror
            cameras look backward and never frame the windshield. */}
        <group position={[0, 0.66, 0.76]} rotation={[-0.62, 0, 0]}>
          <group ref={wiperLRef} position={[0.3, -0.26, 0.02]} rotation={[0, 0, WIPER_PARK_RAD]}>
            <mesh position={[0, 0.19, 0]}>
              <boxGeometry args={[0.022, 0.38, 0.008]} />
              <meshStandardMaterial color="#23262b" roughness={0.7} metalness={0.25} />
            </mesh>
          </group>
          <group ref={wiperRRef} position={[-0.34, -0.26, 0.02]} rotation={[0, 0, WIPER_PARK_RAD]}>
            <mesh position={[0, 0.17, 0]}>
              <boxGeometry args={[0.022, 0.34, 0.008]} />
              <meshStandardMaterial color="#23262b" roughness={0.7} metalness={0.25} />
            </mesh>
          </group>
        </group>

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
