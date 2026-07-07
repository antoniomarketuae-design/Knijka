/**
 * sim/procedures — public surface of the pre-drive procedure subpackage.
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05). When the sim module barrel is
 * assembled it should re-export from here; other modules must never import
 * sim internals directly.
 */

export { createPreDriveState, PRE_DRIVE_STEP_ORDER, PRE_DRIVE_STEPS } from "./steps";

export {
  applyPreDriveAction,
  createPreDriveMachine,
  type PreDriveActionResult,
  type PreDriveMachine,
} from "./machine";

export type {
  PreDriveEvent,
  PreDriveResult,
  PreDriveState,
  PreDriveStepId,
  PreDriveStepSpec,
  ProcedureCompletedEvent,
  StepCompletedEvent,
} from "./types";
