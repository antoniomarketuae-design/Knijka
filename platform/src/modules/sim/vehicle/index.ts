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
export type { VehicleInput, VehicleDebugState, RapierModule } from "./VehicleSim";

export * from "./tuning";

export {
  applyDifficulty,
  createDriveAssistState,
  DIFFICULTY_PRESETS,
  DIFFICULTY_ORDER,
  DEFAULT_DIFFICULTY,
} from "./difficulty";
export type {
  DifficultyMode,
  DifficultyPreset,
  DriveAssistState,
} from "./difficulty";

export { clamp, lerp, approach, yawQuat, rotateInto, dot } from "./math";
export type { Vec3, Quat } from "./math";
