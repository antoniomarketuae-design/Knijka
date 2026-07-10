/**
 * Pre-drive step → cabin-state effects (QW5, doc 68 Phase 0 / findings A6+A7).
 *
 * The 13-step checklist is answered by clicking (interim until Phase 1 A2
 * replaces it with performed controls). Honesty rule: when the student is told
 * "done", every state the sim actually tracks must agree — otherwise the rule
 * engine fines a student for skipping something the product just confirmed
 * (e.g. checklist "belt ✓" while `cabin.seatbeltOn` stays false →
 * SEATBELT_OFF_WHILE_MOVING at move-off).
 *
 * Full 13-step map (steps without a line here have NO underlying vehicle
 * state yet — they stay informational, scored by the procedure machine only):
 *
 *  | Step                | Cabin effect                       | Why not more |
 *  |---------------------|------------------------------------|--------------|
 *  | adjust-seat         | — (no seat state)                  | Phase 1 A1   |
 *  | adjust-mirrors      | — (no mirror-adjust state)         | Phase 1 A4   |
 *  | check-surroundings  | — (purely observational)           | —            |
 *  | fasten-seatbelt     | seatbeltOn := true                 |              |
 *  | check-dashboard     | — (purely observational)           | —            |
 *  | headlights-on       | headlights := "low" (only if off)  | never downgrades an already-on setting |
 *  | start-engine        | — (no engine state yet)            | Phase 1 A1   |
 *  | press-brake         | — (momentary pedal, no state)      | Phase 1 A1   |
 *  | select-gear         | — (gearbox is cosmetic)            | Phase 1 A1   |
 *  | release-handbrake   | — (no parking-brake state)         | Phase 1 A1   |
 *  | final-mirror-check  | — (a glance is a one-frame event, not state; faking one would lie to the mirror detector) | Phase 1 A4 |
 *  | signal              | indicator := "left" (step text: „Подай ляв мигач") |  |
 *  | move-off            | — (phase transition, lessons/)     | —            |
 *
 * Pure and framework-free so it is testable here; CabinControls
 * (src/components/sim/cabin.ts) is the single consumer and applies the result
 * to the live cabin.
 */

import type { PreDriveStepId } from "./types";

/** The slice of CabinControls state the pre-drive steps may touch.
 *  Structurally matches cabin.ts (IndicatorSetting/HeadlightSetting). */
export interface PreDriveCabinState {
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
  indicator: "off" | "left" | "right";
}

/** Steps that set real cabin state when completed in the checklist. */
export const PRE_DRIVE_CABIN_EFFECT_STEPS: readonly PreDriveStepId[] = [
  "fasten-seatbelt",
  "headlights-on",
  "signal",
];

export function hasPreDriveCabinEffect(stepId: PreDriveStepId): boolean {
  return PRE_DRIVE_CABIN_EFFECT_STEPS.includes(stepId);
}

/**
 * Apply one completed checklist step to the cabin state. Idempotent and
 * conservative: returns the SAME object when nothing changes (so callers can
 * cheaply detect no-ops), never downgrades a state the student already set
 * themselves (e.g. high beams stay high).
 */
export function applyPreDriveStepToCabin(
  stepId: PreDriveStepId,
  s: PreDriveCabinState,
): PreDriveCabinState {
  switch (stepId) {
    case "fasten-seatbelt":
      return s.seatbeltOn ? s : { ...s, seatbeltOn: true };
    case "headlights-on":
      // Step text asks for low beams; if the student already turned lights on
      // (low or high) via the real L key, respect their setting.
      return s.headlights === "off" ? { ...s, headlights: "low" } : s;
    case "signal":
      return s.indicator === "left" ? s : { ...s, indicator: "left" };
    default:
      // Informational step — no vehicle state exists behind it yet.
      return s;
  }
}
