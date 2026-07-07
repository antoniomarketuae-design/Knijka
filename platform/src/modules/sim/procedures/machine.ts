/**
 * Pre-drive procedure state machine — a pure reducer over pre-drive actions.
 *
 * Scoring model (documented decisions):
 *  - Performing a step whose prerequisites are missing => PREDRIVE_WRONG_ORDER
 *    (второстепенна) emitted immediately; the step still counts as done.
 *  - A required step never performed before move-off => skip violation at
 *    move-off: второстепенна each, seatbelt => ОСНОВНА (3 т.).
 *  - No double counting: a step done late is only a wrong-order mistake (on
 *    the step that jumped ahead of it), never also a skip; move-off itself is
 *    never wrong-order.
 *  - Duplicate actions are idempotent no-ops; actions after move-off are
 *    ignored (the machine is finished).
 *  - A run with zero violations earns the PREDRIVE_PERFECT commendation.
 *
 * Note: if the student moves off unbelted, the DRIVING rule engine will also
 * flag SEATBELT_OFF_WHILE_MOVING once the car is moving. That is intentional:
 * the procedure penalty grades the preparation, the driving violation grades
 * the driving — two different facts, matching how an examiner logs them.
 */

import { makeCommendation, makeViolation } from "../rules/catalog";
import { createPreDriveState, PRE_DRIVE_STEP_ORDER, PRE_DRIVE_STEPS } from "./steps";
import type {
  PreDriveEvent,
  PreDriveResult,
  PreDriveState,
  PreDriveStepId,
} from "./types";

export interface PreDriveMachine {
  state: PreDriveState;
  completedStepIds: PreDriveStepId[];
  wrongOrderStepIds: PreDriveStepId[];
  violationCount: number;
  penaltyPoints: number;
  finished: boolean;
}

export function createPreDriveMachine(opts: { isNight: boolean }): PreDriveMachine {
  return {
    state: createPreDriveState(opts),
    completedStepIds: [],
    wrongOrderStepIds: [],
    violationCount: 0,
    penaltyPoints: 0,
    finished: false,
  };
}

export interface PreDriveActionResult {
  machine: PreDriveMachine;
  events: PreDriveEvent[];
}

/**
 * Apply one student action (performing a step) at session time `t`.
 * Pure: returns a new machine, never mutates the input.
 */
export function applyPreDriveAction(
  prev: PreDriveMachine,
  stepId: PreDriveStepId,
  t: number,
): PreDriveActionResult {
  if (prev.finished || prev.completedStepIds.includes(stepId)) {
    return { machine: prev, events: [] };
  }

  const spec = PRE_DRIVE_STEPS[stepId];
  const events: PreDriveEvent[] = [];
  const machine: PreDriveMachine = {
    ...prev,
    completedStepIds: [...prev.completedStepIds, stepId],
    wrongOrderStepIds: [...prev.wrongOrderStepIds],
    state: spec.apply(prev.state),
  };

  const inOrder = spec.validate(prev.state);
  events.push({ kind: "stepCompleted", stepId, t, titleBg: spec.titleBg });
  if (!inOrder) {
    machine.wrongOrderStepIds.push(stepId);
    const v = makeViolation("PREDRIVE_WRONG_ORDER", t, {
      titleBg: `Нарушен ред: ${spec.titleBg.toLowerCase()}`,
      detail: stepId,
    });
    machine.violationCount += 1;
    machine.penaltyPoints += v.points;
    events.push(v);
  }

  if (stepId === "move-off") {
    finishProcedure(machine, t, events);
  }

  return { machine, events };
}

function finishProcedure(machine: PreDriveMachine, t: number, events: PreDriveEvent[]): void {
  machine.finished = true;

  const skipped = PRE_DRIVE_STEP_ORDER.filter((id) => {
    if (id === "move-off") return false;
    const spec = PRE_DRIVE_STEPS[id];
    return spec.required(machine.state) && !machine.completedStepIds.includes(id);
  });

  for (const id of skipped) {
    const spec = PRE_DRIVE_STEPS[id];
    const v =
      id === "fasten-seatbelt"
        ? makeViolation("PREDRIVE_SEATBELT_SKIPPED", t, { detail: id })
        : makeViolation("PREDRIVE_STEP_SKIPPED", t, {
            titleBg: `Пропусната стъпка: ${spec.titleBg.toLowerCase()}`,
            detail: id,
          });
    machine.violationCount += 1;
    machine.penaltyPoints += v.points;
    events.push(v);
  }

  const perfect = machine.violationCount === 0;
  if (perfect) events.push(makeCommendation("PREDRIVE_PERFECT", t));

  const result: PreDriveResult = {
    completedStepIds: [...machine.completedStepIds],
    skippedStepIds: skipped,
    wrongOrderStepIds: [...machine.wrongOrderStepIds],
    penaltyPoints: machine.penaltyPoints,
    perfect,
  };
  events.push({ kind: "procedureCompleted", t, result });
}
