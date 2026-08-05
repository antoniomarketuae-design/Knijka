/**
 * sim/devrig — THE DRIVE RIG. Dev builds only.
 *
 * The one instrument that holds BOTH halves of a review row at the same
 * instant: the real lesson shell (so the fault cards render) and per-tick
 * telemetry (so the card can be checked against the car's actual speed,
 * position and objective state). See rig.ts for the full why.
 *
 * Consumed only by src/app/dev/drive-rig, which 404s in production.
 */

export {
  DEFAULT_DECEL_MS2,
  DEFAULT_STEP_TIMEOUT_S,
  DEFAULT_WITHIN_M,
  SPEED_DEADBAND_MS,
  STOP_HOLD_S,
  STOP_SPEED_MS,
  createDriveScript,
  currentStep,
  parseDriveScript,
  stepDriveScript,
  stepLabel,
  targetSpeedMs,
  type DriveCommand,
  type DriveSample,
  type DriveScriptState,
  type DriveStep,
  type DriveStepLogEntry,
  type WorldPoint,
} from "./driveScript";

export {
  DEFAULT_BUFFER,
  DRIVE_RIG_VERSION,
  DriveRig,
  type DriveRigDump,
  type DriveRigEvent,
  type DriveRigHandle,
  type DriveRigObjective,
  type DriveRigOptions,
  type DriveRigSample,
  type DriveRigStatus,
} from "./rig";
