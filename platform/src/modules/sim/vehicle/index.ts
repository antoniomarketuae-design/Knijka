/**
 * sim/vehicle — public API of the vehicle physics core.
 *
 * React-independent: plain TS over rapier types. Consumed by the R3F binding
 * (src/components/sim), the sim engine (input contract), and the headless
 * harness (harness.test.ts — the CI gate for vehicle feel).
 */

export {
  VehicleSim,
  createHeadlessChassis,
  chassisMassProperties,
  IDLE_INPUT,
} from "./VehicleSim";
export type {
  VehicleInput,
  VehicleDebugState,
  VehicleSimOptions,
  RapierModule,
} from "./VehicleSim";

export * from "./tuning";

// doc 82 §4.2 F1 — the grip-loss read channel (pure; no physics effect).
export {
  combinedGripUtilisation,
  deliveredGripUtilisation,
  demandedGripUtilisation,
  gripCeilingMs2,
  GRIP_SIGNAL_LP,
  GRIP_SIGNAL_MAX_ACCEL_MS2,
  GRIP_SIGNAL_MIN_KMH,
  GRIP_SIGNAL_MU,
  GRIP_SIGNAL_WHEELBASE_M,
  GRIP_UTILISATION_MAX,
} from "./gripSignal";

// doc 82 §4.2 F2 — deterministic road-surface excitation (opt-in).
export {
  roadNoiseAt,
  roadRoughnessForceN,
  roadRoughnessSpeedScale,
  ROAD_NOISE_OCTAVE2_GAIN,
  ROAD_NOISE_OCTAVE2_SCALE,
  ROAD_NOISE_WAVELENGTH_M,
  ROAD_ROUGHNESS_FORCE_N,
  ROAD_ROUGHNESS_FULL_KMH,
  ROAD_ROUGHNESS_MAX,
  ROAD_ROUGHNESS_MIN_KMH,
} from "./roadNoise";

export {
  DrivelineState,
  READY_DRIVELINE,
  transmissionModeFor,
  hasDriveTraction,
  forwardForceScale,
  gearForSpeedKmh,
  // doc 82 §4.2 F3 — engine braking (opt-in via VehicleSimOptions).
  engineBrakeDecelMs2,
  ENGINE_BRAKE_DECEL_MS2,
  ENGINE_BRAKE_FULL_KMH,
  ENGINE_BRAKE_MIN_KMH,
  MANUAL_GEAR_COUNT,
  MANUAL_GEAR_MAX_KMH,
  PARKING_BRAKE_FORCE_N,
  SELECTOR_ENGAGE_MAX_KMH,
  STALL_BELOW_KMH,
  STALL_GRACE_S,
  STALL_MIN_THROTTLE,
} from "./driveline";
export type {
  DrivelineEvent,
  DrivelineListener,
  DrivelinePhysicsInput,
  DrivelineRejection,
  DrivelineSnapshot,
  SelectorPosition,
  TransmissionMode,
  VehicleStartState,
} from "./driveline";

export {
  applyDifficulty,
  createDriveAssistState,
  DIFFICULTY_PRESETS,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_STORAGE_KEY,
  parseDifficultyMode,
  storeDifficulty,
  // Domain-scaled governor (founder review R3 #37 — the motorway drill).
  governorCapKmh,
  // …and the two the HUD needs to SAY the cap out loud (2026-08-11).
  GOVERNOR_BAND_KMH,
  governorIsEasing,
  NORMAL_CAP_MARGIN_KMH,
  BEGINNER_CAP_UNDER_KMH,
  DOMAIN_CAP_FLOOR_KMH,
  // Tier feasibility (doc 86 B7 + L17) — the cap floors at a speed the lesson
  // itself requires, and `tierFeasibility` answers „can this tier drive this
  // lesson at all" against BOTH the cap and the tractive equilibrium.
  NORMAL_CAP_FLOOR_KMH,
  REQUIRED_SPEED_HEADROOM_KMH,
  THROTTLE_AUTHORITY_FADE_FROM_KMH,
  THROTTLE_AUTHORITY_FADE_TO_KMH,
  tierTopSpeedKmh,
  tierFeasibility,
  // S0 low-speed maneuvering bands (parking envelope, doc 76 §0/§12).
  CREEP_CAP_FULL_KMH,
  CREEP_CAP_END_KMH,
  CRAWL_BRAKE_FULL_KMH,
  CRAWL_BRAKE_END_KMH,
  FULL_LOCK_BELOW_KMH,
  FULL_LOCK_FADE_END_KMH,
  PARKING_STEER_TAU_S,
} from "./difficulty";
export type {
  DifficultyMode,
  DifficultyPreset,
  DriveAssistState,
  TierFeasibility,
} from "./difficulty";

export { clamp, lerp, approach, yawQuat, rotateInto, dot } from "./math";
export type { Vec3, Quat } from "./math";
