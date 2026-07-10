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

/**
 * A2 lesson modes (doc 68 §5 — aviation Instruction→Practice→Assess ladder):
 *  - "instruction": guided — the pending step is prompted and its cockpit
 *    hotspot highlighted; wrong order is COACHED (stepOutOfOrder event, not
 *    scored), so the student can explore the sequence safely.
 *  - "practice":    recall — no highlights, order-tolerant (wrong order is
 *    tracked but not scored); the shell offers a gentle hint after idling.
 *  - "assess":      exam-strict — wrong order is graded exactly like the
 *    official protocol (PREDRIVE_WRONG_ORDER, второстепенна).
 * Skipping a REQUIRED step before move-off is scored in every mode — an
 * omission is an omission; only the order tolerance varies.
 */
export type PreDriveMode = "instruction" | "practice" | "assess";

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

/**
 * A step performed out of order in a NON-assess mode: coached, not scored.
 * Carries the same authored texts as the PREDRIVE_WRONG_ORDER violation so
 * the HUD can teach (kind:"lesson" toast) with the law citation — the
 * teach-first-then-grade pattern applied to the procedure.
 */
export interface StepOutOfOrderEvent {
  kind: "stepOutOfOrder";
  stepId: PreDriveStepId;
  t: number;
  titleBg: string;
  explanationBg: string;
  lawRef?: string;
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
  | StepOutOfOrderEvent
  | ProcedureCompletedEvent
  | ViolationEvent
  | CommendationEvent;
