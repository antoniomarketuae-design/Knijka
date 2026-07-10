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
 *  | Step                | Effect (cabin / driveline)         | Why not more |
 *  |---------------------|------------------------------------|--------------|
 *  | adjust-seat         | — (no seat state)                  | Phase 1 A3   |
 *  | adjust-mirrors      | — (no mirror-adjust state)         | Phase 1 A4   |
 *  | check-surroundings  | — (purely observational)           | —            |
 *  | fasten-seatbelt     | seatbeltOn := true                 |              |
 *  | check-dashboard     | — (purely observational)           | —            |
 *  | headlights-on       | headlights := "low" (only if off)  | never downgrades an already-on setting |
 *  | start-engine        | driveline: engineOn := true (A1)   |              |
 *  | press-brake         | — (momentary pedal, no state)      | —            |
 *  | select-gear         | driveline: selector := D / M (A1)  |              |
 *  | release-handbrake   | driveline: parkingBrakeOn := false (A1) |         |
 *  | final-mirror-check  | — (a glance is a one-frame event, not state; faking one would lie to the mirror detector) | Phase 1 A4 |
 *  | signal              | indicator := "left" (step text: „Подай ляв мигач") |  |
 *  | move-off            | — (phase transition, lessons/)     | —            |
 *
 * Pure and framework-free so it is testable here; CabinControls
 * (src/components/sim/cabin.ts) is the single consumer: it applies the cabin
 * slice via `applyPreDriveStepToCabin` and the driveline slice (A1 vehicle
 * state machine) via `drivelineEffectOf` → DrivelineState force-setters.
 */

import type { PreDriveStepId } from "./types";

/** The slice of CabinControls state the pre-drive steps may touch.
 *  Structurally matches cabin.ts (IndicatorSetting/HeadlightSetting). */
export interface PreDriveCabinState {
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
  indicator: "off" | "left" | "right";
}

/** Steps that set real cabin "electrics" state when completed. */
export const PRE_DRIVE_CABIN_EFFECT_STEPS: readonly PreDriveStepId[] = [
  "fasten-seatbelt",
  "headlights-on",
  "signal",
];

/**
 * Driveline effects (A1 vehicle state machine): what a completed checklist
 * step must force on the DrivelineState so the machine agrees with what the
 * student was told they did — without these, "start-engine ✓" would leave the
 * car dead after move-off (the A6 contradiction class, in reverse).
 */
export type PreDriveDrivelineEffect =
  | "engine-on"
  | "select-forward"
  | "parking-brake-off";

/** Steps that set real driveline state when completed in the checklist. */
export const PRE_DRIVE_DRIVELINE_EFFECT_STEPS: readonly PreDriveStepId[] = [
  "start-engine",
  "select-gear",
  "release-handbrake",
];

/** The driveline effect a completed step carries, or null (pure map). */
export function drivelineEffectOf(
  stepId: PreDriveStepId,
): PreDriveDrivelineEffect | null {
  switch (stepId) {
    case "start-engine":
      return "engine-on";
    case "select-gear":
      return "select-forward";
    case "release-handbrake":
      return "parking-brake-off";
    default:
      return null;
  }
}

/** True when the step carries ANY real vehicle-state effect (cabin electrics
 *  or driveline) — the shell forwards exactly these to the 3D scene. */
export function hasPreDriveCabinEffect(stepId: PreDriveStepId): boolean {
  return (
    PRE_DRIVE_CABIN_EFFECT_STEPS.includes(stepId) ||
    PRE_DRIVE_DRIVELINE_EFFECT_STEPS.includes(stepId)
  );
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
