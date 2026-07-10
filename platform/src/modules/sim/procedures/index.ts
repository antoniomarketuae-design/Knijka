/**
 * sim/procedures — public surface of the pre-drive procedure subpackage.
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05). When the sim module barrel is
 * assembled it should re-export from here; other modules must never import
 * sim internals directly.
 */

export { createPreDriveState, PRE_DRIVE_STEP_ORDER, PRE_DRIVE_STEPS } from "./steps";

// A2 performed pre-drive: real transitions → steps (+ the doc-69 hotspot
// naming contract, which is load-bearing between the cockpit and this module).
export {
  COCKPIT_HOTSPOT_NAMES,
  createPreDriveSignalTracker,
  hotspotsForStep,
  isCockpitHotspotName,
  observeControlSignal,
  PRE_DRIVE_INFO_STEPS,
  PRE_DRIVE_STEP_CONTROLS,
  preDriveStepKind,
  readyToMoveOff,
  resolveHotspotName,
  type CockpitHotspotName,
  type NamedNode,
  type PreDriveControlSignal,
  type PreDriveSignalTracker,
  type PreDriveStepControl,
  type PreDriveStepKind,
} from "./performedSteps";

export {
  applyPreDriveAction,
  createPreDriveMachine,
  type PreDriveActionResult,
  type PreDriveMachine,
} from "./machine";

export type {
  PreDriveEvent,
  PreDriveMode,
  PreDriveResult,
  PreDriveState,
  PreDriveStepId,
  PreDriveStepSpec,
  ProcedureCompletedEvent,
  StepCompletedEvent,
  StepOutOfOrderEvent,
} from "./types";
