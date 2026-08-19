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
import { SimHaptics, type SimInput } from "@/modules/sim/engine";
import type { VehicleSample } from "@/modules/sim/contracts";
import { surfacePatchGripAt, type SurfaceGripPatch } from "@/modules/sim/runtime";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import type { SimAudio } from "@/modules/sim/scene/simAudio";
import { updateVehicleSample } from "@/modules/sim/scene/vehicleSample";
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
// WINDSHIELD TINT PANE — its two ends are the cockpit-camera contract's own
// landmarks, so the glass and the camera that frames it cannot drift apart.
// The long argument (and the sweep-161 measurement that forced this) is at the
// mesh itself, further down; only the arithmetic lives here.
//
// vehicle/cockpit-camera-contract.test.ts LANDMARKS, chassis-local:
//   glassBase „windshield tint-plane base"  (y 0.436, z 0.920)
//   header    „v2 glass-top / header-strip front edge" (y 0.850, z 0.160)
// Kept as literals rather than imported: the contract file is a TEST, and a
// component must not import from one. `__tests__/windshieldPane.test.ts`
// reconstructs the pane's two ends from the constants the MESH renders with
// and checks them against those landmarks — so the duplication cannot rot
// without a red test, and the check is on the rendered geometry rather than on
// this comment.
const WINDSHIELD_BASE_Y = 0.436;
const WINDSHIELD_BASE_Z = 0.92;
const WINDSHIELD_TOP_Y = 0.85;
const WINDSHIELD_TOP_Z = 0.16;
/** Pane centre (chassis-local) and its length/rake, derived — never typed. A
 *  planeGeometry lies in local XY, so rotating about X by `rake` sends local
 *  +Y to (0, cos, sin): base → top is Δy up and Δz BACK, hence the atan2. */
export const WINDSHIELD_CENTRE_Y = (WINDSHIELD_BASE_Y + WINDSHIELD_TOP_Y) / 2;
export const WINDSHIELD_CENTRE_Z = (WINDSHIELD_BASE_Z + WINDSHIELD_TOP_Z) / 2;
export const WINDSHIELD_LENGTH_M = Math.hypot(
  WINDSHIELD_TOP_Y - WINDSHIELD_BASE_Y,
  WINDSHIELD_TOP_Z - WINDSHIELD_BASE_Z,
);
export const WINDSHIELD_RAKE_RAD = Math.atan2(
  WINDSHIELD_TOP_Z - WINDSHIELD_BASE_Z,
  WINDSHIELD_TOP_Y - WINDSHIELD_BASE_Y,
);
/**
 * Pane width (m). UNCHANGED at 1.5 and deliberately so: the sweep's own words
 * are that the quad starts „at the A-pillar", i.e. the side edge already dies
 * on the pillar and reads as part of it — it was only the TOP edge that ran
 * out into open sky. Widening this would push the edge outboard of the pillar
 * into the door glass for no defect anybody has photographed.
 */
export const WINDSHIELD_WIDTH_M = 1.5;

// ---------------------------------------------------------------------------
// WIPERS (founder review doc 62 #24: "the wiper button does nothing visible").
// Two blade meshes riding the chassis at the windshield plane's pose, so BOTH
// views see them: the cockpit looks through the glass at them, the chase view
// sees them on the car (the exterior shell hides in cockpit view, but these —
// like the windshield plane and the beam spots — live on the chassis group).
// Parked they rest near-horizontal at the cowl; while
// CabinControls.driveline.wipersOn they sweep a ~97° arc; switched off they
// finish the stroke and ease back to park (a real wiper relay). Render-only,
// zero-allocation: two rotation.z writes per frame, and only while the blades
// are away from park.
//
// REF 7 PARK POSE (2026-07-27) — „a dark bar floats over the road ahead,
// detached from the car". The parenting was never wrong: both blades are in
// the windshield plane's own frame on the chassis group. The PARK ANGLE was.
// Projecting the parked blade from COCKPIT_EYE (windshield frame pos
// (0, 0.66, 0.76), rot x −0.62; visible glass runs from sightline v −0.233 at
// the base to +0.203 at the header, horizon at 0):
//
//   park (rad)  1.15 (was)   1.30    1.38    1.44    1.50 (now)
//   blade tip        27.5%   18.1%   13.8%   10.6%    7.5%   up the visible glass
//   tilt above horiz  24.1°   15.5°   10.9°    7.5°     4.1°
//
// At 1.15 the parked blade stood a quarter of the way up the windshield, dead
// in the road sightline with the cowl far below it — hence "floating bar". At
// 1.50 it lies 4° off horizontal and hugs the glass base, where a parked wiper
// belongs. The pivots also drop 8 mm to the glass base (−0.268 of the plane's
// ±0.275 half-height). WIPER_TOP_RAD is unchanged, so the wiped arc still ends
// just past vertical — the sweep gets WIDER (77° → 97°, a normal car wiper
// arc), which only helps doc 62 #24's "make it visible".
//
// REF 8 PARK POSE (2026-07-27, R0 round 2) — REF 7 measured the blade against
// the WINDSHIELD PLANE and got the right answer to the wrong question. What
// actually decides whether a parked blade looks attached is the COWL
// SIGHTLINE: the ray from COCKPIT_EYE (0.24, 0.71, −0.255) over the dash top
// (chassis y 0.48 at z 0.70), i.e. y = 0.71 − 0.2408·(z + 0.255) — the same
// `cowl_ray` the interior author script uses. Anything ABOVE that ray is
// silhouetted against road and sky no matter how flat it lies.
//
// At REF 7's park the driver blade sat at chassis (x +0.30…−0.08, y 0.464,
// z 0.90). The ray allows y ≤ 0.432 there, so the blade cleared the dash by
// 32 mm and drew a hard black bar across the road — verified by projection
// (it lands at px 507…783, y 554 in a 1100×900 frame) and by eye in the
// rendered frame. Because the blade sits 200 mm FORWARD of the visible cowl
// edge and the cowl falls away with distance, a flatter angle could never fix
// it: only dropping the pivot can.
//
//   pivot y (plane-local)  −0.268 (REF 7)   −0.300   −0.322 (now)
//   blade chassis y             0.464        0.438     0.420
//   cowl-ray ceiling there      0.432        0.421     0.415
//   verdict                  32 mm PROUD    17 mm     flush with the cowl
//
// −0.322 with the park angle at a true π/2 puts the whole blade — top edge
// included — on the cowl line, where a parked wiper belongs: a hint of blade
// against the dash lip, nothing crossing the road. WIPER_TOP_RAD is untouched,
// so the wiped arc and doc 62 #24's visible sweep are unchanged; the blades
// still rise fully into the glass the moment the wipers run.
// ---------------------------------------------------------------------------
/** Full wipe cycle (park → up → park), seconds — the audio swish cadence. */
const WIPER_PERIOD_S = 1.3;
/** Blade angle at park (rad about the glass normal; +Z rotation maps blade-Y
 *  toward −X = the passenger side on this LHD car — lying along the cowl).
 *  π/2 = exactly horizontal in the glass plane, so the blade holds ONE height
 *  along its whole length and the REF 8 table above applies end to end. */
const WIPER_PARK_RAD = Math.PI / 2;
/** Blade angle at the top of the sweep (just past vertical, driver side). */
const WIPER_TOP_RAD = -0.2;
/**
 * The wiper frame, chassis-local. This USED to be „the same pose as the
 * windshield pane" and it is not any more: the pane was extended up to the
 * `header` landmark (see WINDSHIELD_* above), while REF 8 tuned the park angle
 * and the R0 round-3 by-eye verification against THIS origin and rake. Moving
 * the wipers with the glass would silently undo a park that was photographed
 * hidden behind the cowl, so the two poses are now separate and named.
 */
export const WIPER_FRAME_Y = 0.66;
export const WIPER_FRAME_Z = 0.76;
export const WIPER_FRAME_RAKE_RAD = -0.62;
/** Blade pivot height in the WIPER frame (m) — REF 8: low enough that the
 *  parked blade lies ON the cowl sightline instead of above it. Below the
 *  −0.275 that was the old pane's bottom edge, on purpose: wipers park on the
 *  cowl, under the glass, not on it. (That −0.275 is now a historical
 *  reference point, not a live edge — the pane's base sits at chassis
 *  y 0.436 / z 0.920 either way, which is the number REF 8 actually meant.) */
const WIPER_PIVOT_Y = -0.322;
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
  lessonRequiredKmh,
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
  engineBraking = false,
  roadRoughness = 0,
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
  /** A speed the LESSON ITSELF requires the student to drive (km/h) — today
   *  the district's `meta.scenario.wave.speedKmh` (doc 86 B7). It FLOORS the
   *  tier's governor cap at `required + REQUIRED_SPEED_HEADROOM_KMH`, because
   *  a tier may be slower than the road but never slower than the lesson:
   *  `sc-sig-green-wave` on Начинаещ governed at 40 km/h against a wave tuned
   *  to 50 and was unwinnable on every rung. Absent = the domain rule alone,
   *  byte-identical behaviour. */
  lessonRequiredKmh?: number;
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
  /** ENGINE BRAKING (doc 82 §4.2 F3) — OPT-IN. false (default, every shipped
   *  lesson) constructs the pre-F3 car and no engine-brake code runs at all:
   *  lifting off in D still coasts exactly as it does today, so no committed
   *  trace and no graded verdict moves. True gives the honest gear-dependent
   *  coast decel (~1.0 m/s² low gear → 0.3 top, zero in N/P and clutch-down).
   *  Deliberately NOT derived from anything: like wetGrip and crosswind it is
   *  authored per lesson, and turning it on globally is a decision that owes
   *  a deliberate re-baseline. */
  engineBraking?: boolean;
  /** ROAD-SURFACE VERTICAL MOTION (doc 82 §4.2 F2) — OPT-IN 0..1. 0 (default,
   *  every shipped lesson) never enters the excitation branch: bit-identical
   *  dynamics. Above 0 each grounded wheel rides deterministic 2-octave value
   *  noise sampled at its WORLD position (~5 mm at city speed), so the tuned
   *  suspension finally moves in a straight line — and replays stay
   *  reproducible because the bumps are a function of place, not of time. */
  roadRoughness?: number;
  /** N11 (VP-06): director→cluster warning-lamp channel, threaded to
   *  VitokCockpit (the hazardActiveRef pattern — render-free ref, read per
   *  frame). Absent = the temperature telltale never lights. */
  telltaleLitRef?: RefObject<boolean>;
}) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const assistRef = useRef(createDriveAssistState());
  // F5 haptics (doc 82 §4.3) — one instance per session. Inert by
  // construction on any device without navigator.vibrate (all of iOS Safari)
  // and behind the persisted opt-out, which is why every event it fires is
  // also carried by an audio or visual cue.
  const hapticsRef = useRef<SimHaptics | null>(null);
  if (hapticsRef.current === null) hapticsRef.current = new SimHaptics();
  useEffect(() => {
    const haptics = hapticsRef.current;
    return () => haptics?.cancel(); // never leave a motor running on unmount
  }, []);
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
      // F2/F3 (doc 82 §4.2): the same identity discipline again — false / 0
      // are the pre-F defaults and construct the pre-F car exactly.
      {
        gripFactor,
        windLateralN,
        engineBraking,
        roadRoughness,
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
  }, [
    world,
    simRef,
    spawn,
    gripFactor,
    windLateralN,
    windGustAmplitudeN,
    windGustPeriodSec,
    engineBraking,
    roadRoughness,
  ]);

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
    // speed domain (when threaded) scales the governor cap (#37), and a speed
    // the lesson REQUIRES floors it (doc 86 B7).
    const shaped = applyDifficulty(
      raw,
      mode,
      sim.speedKmh,
      FIXED_DT,
      assistRef.current,
      lessonMaxLegalKmh,
      lessonRequiredKmh,
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
    // F1 (doc 82 §4.2): the grip-loss channel — the ONE quantity the sim was
    // already computing every physics step and throwing away. Read once here
    // and spent twice: the tyre-protest audio layer (the cue that carries it)
    // and the threshold-braking haptic tap (redundant with the brake hiss).
    // Pure read — VehicleSim applies no force from either getter.
    const gripUtil = sim.gripUtilisation;
    if (!paused) hapticsRef.current?.brakePedal(input?.brake ?? 0, sim.speedKmh);

    audioRef.current?.update({
      speedKmh: sim.speedKmh,
      throttle: input?.throttle ?? 0,
      brake: input?.brake ?? 0,
      gripUtil,
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
          // F5: the graded-collision pattern, redundant with the thump above
          // and with the terminating „опасна" verdict on screen.
          hapticsRef.current?.collision(impactKmh);
        } else {
          // Sub-threshold contact — a kerb scuff or a bumper nudge. One short
          // tap, redundant with the same thump. NOT graded, and this call
          // cannot make it graded: nothing here feeds the rule engine.
          hapticsRef.current?.curb();
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
            looks through). depthWrite off so it never occludes the world;
            INTERIOR_LAYER so the A4 mirror cameras never see it.

            THE PANE NOW REACHES THE HEADER, AND THAT IS THE WHOLE FIX (sweep
            161, sc-ac-wind-truck-pass/mobile-wrong/04-t034s.png and the same
            artifact in truck-spray + city-run): „a large untextured
            translucent grey quad hangs across the upper half of the view …
            extending far into the sky over the fields".

            It was this pane, and the old comment named the reason without
            noticing it: it claimed a refit „cowl ~y0.5/z0.9 up to the header
            ~y0.85/z0.55", but the header is at z 0.16, not 0.55. The pane
            stopped 0.44 m of chassis-z SHORT of the rail it is supposed to die
            behind, so its top edge ended in mid-air over the bonnet and drew a
            hard tint step across open sky.

            MEASURED, not reasoned. Projecting the old corners through the
            shipped cockpit camera (the composition
            vehicle/cockpit-camera-contract.test.ts pins) put the top edge at
            frame height fy 0.889 at the iPhone-16 landscape aspect; scanning
            that frame's own sky for the luminance step finds it at y 132 of
            1179, i.e. fy 0.888. Three decimals, and it is present on EVERY
            aspect (fy 0.819 at 16:9, 0.787 at 1.6) — never a phone-only bug.
            (At 112 km/h the speed-widen carries it to fy 0.845; measured 0.845.)

            The two ends are the cockpit contract's OWN landmarks, so the pane
            can no longer disagree with the camera that frames it:
              glassBase (y 0.436, z 0.920) → header (y 0.850, z 0.160)
            which is centre (0, 0.643, 0.540), length 0.8654 m, rake −1.0724 rad.
            The top edge then projects to fy 1.085 on the phone (off-frame, no
            edge at all) and to the header landmark itself at 16:9/1.6, where
            the rail's own opaque geometry covers it.

            COST: the same one draw call and the same material. The tinted area
            grows by the sky band between fy 0.889 and the header — pixels that
            were previously UNtinted although the driver is looking through
            glass at them. Over sky (L≈192) the wash takes them to L≈172, the
            same wash the rest of the aperture already carries.

            ONE CONSEQUENCE, recorded because it is a real cost and it has an
            owner elsewhere: the interior mirror node sits at chassis y 0.908,
            i.e. ABOVE this glass's own top edge (y 0.850), so the sightline to
            it now crosses the pane at z 0.199 and the mirror picks up the same
            14 % wash. That is a symptom of the B58 mirror-station raise having
            lifted the mirror out through the header — the same root as the
            sweep's „the interior rear-view mirror floats detached in open sky"
            (sc-park-van). It disappears by itself the moment the mirror is
            lowered back under the glass line; do NOT re-shorten this pane to
            hide it, which is how the sky edge comes back. */}
        <mesh
          position={[0, WINDSHIELD_CENTRE_Y, WINDSHIELD_CENTRE_Z]}
          rotation={[WINDSHIELD_RAKE_RAD, 0, 0]}
          onUpdate={(m) => m.layers.set(INTERIOR_LAYER)}
        >
          <planeGeometry args={[WINDSHIELD_WIDTH_M, WINDSHIELD_LENGTH_M]} />
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

        {/* Wiper blades (doc 62 #24) — in the windshield plane's ORIGINAL frame.
            It used to be literally the same pose as the glass above; since the
            glass was extended to the header they are separate poses, and this
            one is the one that must not move: REF 8 tuned the park angle
            against THIS origin and rake, and the R0 round-3 verification
            photographed the parked blades hidden by the cowl from it. Nudged
            20 mm along its +Z, i.e. OUTSIDE the glass, where a wiper lives;
            parked on the cowl line
            (REF 8) and swept by useFrame while the wipers run. Chassis-
            mounted, so the chase view sees them on the car and the cockpit
            sees them through the glass. Default layer 0: the A4 mirror cameras
            look backward and never frame the windshield.

            GEOMETRY (REF 8): each blade is now an ARM plus a BLADE rather than
            one 380 mm slab. The slab was what made the parked wiper read as an
            abstract bar: a real wiper is a slim tapered arm that only becomes
            a rubber blade past its knuckle. Same pivot, same angles, same
            reach — the arc, the sweep phase and the droplet-clearing channel
            are untouched.

            R0 ROUND 3 — MASS AND TONE ONLY. The round-2 review called two
            near-black girders across the mirror "the ugliest thing in the
            frame" and read them as these wipers. They are not: raycasting
            those exact pixels put both bars on the interior GLB's mirror stalk
            and on the cockpit's own mirror fairing, ~400 px away from here
            (see VitokCockpit's MIRROR POD block), and in the same rendered
            frames the PARKED blades are invisible — the cowl hides them
            completely at 1100×900 and at 1440×900, which is the REF 8 park
            working as intended and must stay.
            What is fair in that complaint is the RUNNING sweep: mid-stroke a
            blade does cross sky, and at #191c21/#23262b it was the darkest
            thing in the upper frame. So the sections come down ~20 % (arm
            14 → 11 mm, blade 19 → 16 mm wide / 7 → 6 mm thick) and the albedos
            move off near-black to satin-graphite arm + dark-rubber blade. The
            blade still measures ~10 px across at 1440×900 mid-sweep, so doc 62
            #24 ("the wiper button does nothing visible") stays fixed. PIVOTS,
            REACH, WIPER_PARK_RAD, WIPER_TOP_RAD, the period and the phase are
            all untouched. */}
        <group
          position={[0, WIPER_FRAME_Y, WIPER_FRAME_Z]}
          rotation={[WIPER_FRAME_RAKE_RAD, 0, 0]}
        >
          <group
            ref={wiperLRef}
            position={[0.3, WIPER_PIVOT_Y, 0.02]}
            rotation={[0, 0, WIPER_PARK_RAD]}
          >
            {/* arm: pivot → knuckle */}
            <mesh position={[0, 0.085, 0.004]}>
              <boxGeometry args={[0.011, 0.17, 0.011]} />
              <meshStandardMaterial color="#23272d" roughness={0.5} metalness={0.55} />
            </mesh>
            {/* blade: knuckle → tip (reach unchanged at 0.38) */}
            <mesh position={[0, 0.275, 0]}>
              <boxGeometry args={[0.016, 0.21, 0.006]} />
              <meshStandardMaterial color="#2d3138" roughness={0.85} metalness={0.05} />
            </mesh>
          </group>
          <group
            ref={wiperRRef}
            position={[-0.34, WIPER_PIVOT_Y, 0.02]}
            rotation={[0, 0, WIPER_PARK_RAD]}
          >
            <mesh position={[0, 0.075, 0.004]}>
              <boxGeometry args={[0.011, 0.15, 0.011]} />
              <meshStandardMaterial color="#23272d" roughness={0.5} metalness={0.55} />
            </mesh>
            <mesh position={[0, 0.245, 0]}>
              <boxGeometry args={[0.016, 0.19, 0.006]} />
              <meshStandardMaterial color="#2d3138" roughness={0.85} metalness={0.05} />
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
