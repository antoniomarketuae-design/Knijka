/**
 * Auto-reverse assist (founder report 2026-07-17: „стрелката надолу не кара
 * колата назад") — the genre convention: hold the brake at a standstill in D
 * and the car shifts itself to R; while the selector is in R the pedals SWAP
 * (S/ArrowDown is the reverse accelerator, W/ArrowUp brakes) so "down =
 * backwards" is literally true; hold the (remapped) brake at a standstill in
 * R and it shifts back toward D.
 *
 * Pure state machine — no DOM, no React, fully unit-testable in Node. The
 * live-scene glue (LessonScene's RuntimeDriver) feeds it one frame of
 * FUNCTIONAL pedal state per render frame and executes emitted commands
 * through the SAME DrivelineState API as the [ / ] keys (gearUp/gearDown,
 * one gate step at a time: D→N→R / R→N→D), so interlocks, DrivelineEvents,
 * the HUD telltales and the attempt recorder all see canonical selector
 * transitions — the assist is a phantom hand on the real lever, never a
 * physics side door.
 *
 * "FUNCTIONAL" pedals: the values AFTER the rule-b remap below — in D the
 * brake is the S/Down channel; in R it is the W/Up channel. That makes the
 * two hold rules one symmetric law: "brake held at a standstill for
 * REVERSE_ASSIST_HOLD_S toggles the direction of travel".
 *
 * Enablement is the GLUE's job, not this machine's: never in examMode
 * lessons (the exam grades the real selector procedure), never during the
 * pre-drive gate (a held brake there IS a procedure step), only on the
 * automatic box (the manual tier keeps real R semantics: clutch + gate) and
 * only with the engine running. Headless paths (recorder, exam bots, FP
 * battery) never construct SimInput and never see any of this.
 */

import type { VehicleInput, SelectorPosition, TransmissionMode } from "../vehicle";

/** |speed| below this (km/h) counts as a standstill for the hold rules. */
export const REVERSE_ASSIST_STANDSTILL_KMH = 0.6;
/** Continuous functional-brake hold (s) that triggers a direction toggle. */
export const REVERSE_ASSIST_HOLD_S = 0.35;
/** Silence window (s) after any MANUAL selector shift ([ / ], touch sheet,
 *  cockpit hotspot) — the assist never fights explicit input. */
export const REVERSE_ASSIST_SUPPRESS_S = 2;
/** Ramped pedal value above which it counts as held (the keyboard ramps
 *  cross this ~25 ms after key-down — see input.ts BRAKE_ATTACK_S). */
export const REVERSE_ASSIST_PEDAL_ON = 0.1;

export type ReverseAssistCommand = "shiftToR" | "shiftToD";

export interface ReverseAssistFrame {
  /** Signed or unsigned — only |speed| is read. */
  speedKmh: number;
  selector: SelectorPosition;
  /** FUNCTIONAL brake pedal 0..1 (post-remap: S/Down in D, W/Up in R). */
  brakePedal: number;
  /** FUNCTIONAL throttle pedal 0..1 — held throttle vetoes the toggle
   *  (both pedals down is ambiguous input; the assist stays out of it). */
  throttlePedal: number;
  /** Wall-clock frame delta, s (the caller's clamped render dt). */
  dtSec: number;
}

export class ReverseAssist {
  private holdS = 0;
  private suppressS = 0;

  /** A MANUAL selector shift happened (any non-assist gearUp/gearDown —
   *  keys [ / ], the touch gear sheet, a cockpit hotspot): stay silent for
   *  REVERSE_ASSIST_SUPPRESS_S and drop any accumulated hold. */
  noteManualShift(): void {
    this.suppressS = REVERSE_ASSIST_SUPPRESS_S;
    this.holdS = 0;
  }

  /**
   * Advance one frame. Returns a command at most once per completed hold:
   *  - selector D, standstill, brake held ≥ HOLD_S  → "shiftToR" (rule a)
   *  - selector R, standstill, brake held ≥ HOLD_S  → "shiftToD" (rule c)
   * Anything else (moving, other selector, throttle down, pedal released,
   * manual-shift silence) resets the hold timer.
   */
  update(f: ReverseAssistFrame): ReverseAssistCommand | null {
    if (this.suppressS > 0) {
      this.suppressS = Math.max(0, this.suppressS - f.dtSec);
      this.holdS = 0;
      return null;
    }
    const holding =
      (f.selector === "D" || f.selector === "R") &&
      Math.abs(f.speedKmh) < REVERSE_ASSIST_STANDSTILL_KMH &&
      f.brakePedal > REVERSE_ASSIST_PEDAL_ON &&
      f.throttlePedal <= REVERSE_ASSIST_PEDAL_ON;
    if (!holding) {
      this.holdS = 0;
      return null;
    }
    this.holdS += f.dtSec;
    if (this.holdS < REVERSE_ASSIST_HOLD_S) return null;
    this.holdS = 0;
    return f.selector === "D" ? "shiftToR" : "shiftToD";
  }
}

/**
 * Rule b — the in-R pedal swap, applied in place on the merged VehicleInput
 * (GatedSimInput.read() calls this AFTER keyboard∪gamepad∪touch merge and
 * BEFORE the QW10 gate / raw capture), so EVERY consumer — physics step,
 * difficulty shaping, audio revs, the A2 observers and the recorder — sees
 * the FUNCTIONAL pedals: S/Down accelerates backward, W/Up brakes.
 */
export function applyReversePedalRemap(input: VehicleInput): void {
  const throttle = input.throttle;
  input.throttle = input.brake;
  input.brake = throttle;
}

/**
 * The remap applies only while the selector is in R on the AUTOMATIC box —
 * the manual tier („Напреднал") keeps real reverse semantics (clutch +
 * accelerator), exactly what that difficulty opted into. The examMode gate
 * is lesson-static and lives in the scene glue.
 */
export function shouldRemapReversePedals(
  selector: SelectorPosition,
  transmission: TransmissionMode,
): boolean {
  return selector === "R" && transmission === "automatic";
}
