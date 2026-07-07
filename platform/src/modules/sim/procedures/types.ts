/**
 * sim/procedures — types for the pre-drive procedure state machine.
 *
 * The vision (docs/00_PRODUCT_VISION.md) mandates real driving procedure
 * scoring: seat → mirrors → surroundings → belt → dashboard → (lights) →
 * engine → brake → gear → handbrake → mirror check → signal → move off.
 * Doc 32: the examiner quizzes the candidate on pre-drive checks — this
 * machine is that feature, scored with the official severity classes.
 */

import type { CommendationEvent, ViolationEvent } from "../rules/types";

export type PreDriveStepId =
  | "adjust-seat"
  | "adjust-mirrors"
  | "check-surroundings"
  | "fasten-seatbelt"
  | "check-dashboard"
  | "headlights-on"
  | "start-engine"
  | "press-brake"
  | "select-gear"
  | "release-handbrake"
  | "final-mirror-check"
  | "signal"
  | "move-off";

/**
 * Observable cockpit state the step validation predicates read. Each step,
 * when performed, sets its flag; `validate` predicates express the partial
 * order (what must already be true for the step to be in correct order).
 */
export interface PreDriveState {
  isNight: boolean;
  seatAdjusted: boolean;
  mirrorsAdjusted: boolean;
  surroundingsChecked: boolean;
  seatbeltOn: boolean;
  dashboardChecked: boolean;
  headlightsOn: boolean;
  engineRunning: boolean;
  brakePressed: boolean;
  gearSelected: boolean;
  handbrakeReleased: boolean;
  mirrorsRechecked: boolean;
  indicatorOn: boolean;
  movedOff: boolean;
}

export interface PreDriveStepSpec {
  id: PreDriveStepId;
  titleBg: string;
  instructionBg: string;
  /** True when performing the step NOW respects the required partial order. */
  validate: (s: PreDriveState) => boolean;
  /** Whether the step is required before moving off in this session. */
  required: (s: PreDriveState) => boolean;
  /** Mark the step as done. Returns a NEW state. */
  apply: (s: PreDriveState) => PreDriveState;
  /** Penalty class if the step was never performed before move-off. */
  skipSeverity: "osnovna" | "vtorostepenna";
}

export interface StepCompletedEvent {
  kind: "stepCompleted";
  stepId: PreDriveStepId;
  t: number;
  titleBg: string;
}

export interface PreDriveResult {
  completedStepIds: PreDriveStepId[];
  skippedStepIds: PreDriveStepId[];
  wrongOrderStepIds: PreDriveStepId[];
  penaltyPoints: number;
  perfect: boolean;
}

export interface ProcedureCompletedEvent {
  kind: "procedureCompleted";
  t: number;
  result: PreDriveResult;
}

export type PreDriveEvent =
  | StepCompletedEvent
  | ProcedureCompletedEvent
  | ViolationEvent
  | CommendationEvent;
