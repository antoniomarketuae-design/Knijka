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

export {
  DrivelineState,
  READY_DRIVELINE,
  transmissionModeFor,
  hasDriveTraction,
  forwardForceScale,
  gearForSpeedKmh,
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
  loadDifficulty,
  storeDifficulty,
  // Domain-scaled governor (founder review R3 #37 — the motorway drill).
  governorCapKmh,
  NORMAL_CAP_MARGIN_KMH,
  BEGINNER_CAP_UNDER_KMH,
  DOMAIN_CAP_FLOOR_KMH,
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
} from "./difficulty";

export { clamp, lerp, approach, yawQuat, rotateInto, dot } from "./math";
export type { Vec3, Quat } from "./math";
