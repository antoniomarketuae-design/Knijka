// Touch input source — P1 (plan doc 68, audit E1: phones were refused
// outright; ADR-005 demands a mid-range phone can drive).
//
// Plain TS, no React/DOM: the overlay component (components/sim/
// TouchControls.tsx) translates pointer gestures into the setters below, and
// SimInput.read() merges the result into the SAME VehicleInput pipeline the
// keyboard and gamepad feed — so difficulty shaping, the QW10 drive gate and
// the A2 raw-pedal observers all apply to touch unchanged.
//
// MERGE POLICY — "touch active → touch wins": while a finger owns an axis,
// its value REPLACES that axis outright (it is not maxed against the other
// devices). A held key must never shout over a feathered touch pedal, and a
// drifting gamepad axis must never fight the steer slider. When the finger
// lifts, the axis is released and keyboard/gamepad control returns instantly.
//
// STEERING: slider (drag), not device tilt. Tilt was considered and rejected
// for the default because (a) iOS requires a DeviceOrientation permission
// prompt mid-flow (and only over HTTPS), (b) tilt breaks under the landscape
// orientation lock and on tablets propped on a desk, and (c) a slider is
// deterministic in the rule engine's eyes — same input, same trace. The A/B
// seam stays open via the TouchControls steer-mode setting flag (defaults to
// "slider"); a tilt source would simply be another caller of setSteer().

import type { VehicleInput } from "../vehicle";

/**
 * Exponent applied to the normalized steer drag (>1 = softer around centre).
 * Lane-keeping needs fine small corrections far more often than full lock;
 * the expo gives the middle of the drag range that precision while a full
 * drag still reaches full lock.
 */
export const TOUCH_STEER_EXPO = 1.5;

/**
 * Fraction of the steer-zone width one must drag for FULL lock. 0.5 = drag
 * half the zone width. Kept < 1 so full lock is reachable without the thumb
 * leaving the zone it started in.
 */
export const TOUCH_STEER_RANGE_FRACTION = 0.5;

/**
 * Drag offset → VehicleInput.steer (-1..1, POSITIVE = LEFT).
 * `dxPx` is pointer travel since the gesture start (+x = drag right, screen
 * space), `rangePx` the travel that means full lock. Pure — unit-tested.
 */
export function steerFromDrag(dxPx: number, rangePx: number): number {
  if (rangePx <= 0) return 0;
  const linear = Math.min(1, Math.max(-1, dxPx / rangePx));
  const curved = Math.sign(linear) * Math.pow(Math.abs(linear), TOUCH_STEER_EXPO);
  // Screen drag RIGHT must steer RIGHT; VehicleInput steer is +1 = LEFT.
  // (The ternary keeps centre at +0, not -0.)
  return curved === 0 ? 0 : -curved;
}

/**
 * Pointer y → pedal value 0..1 on a vertical strip: strip bottom = 0 (foot
 * off), strip top = 1 (floored). Position IS the pressure — the analog
 * equivalent of the QW8 keyboard ramps' intent (partial pedal is a value the
 * student holds, not a filter artifact); like a gamepad trigger it bypasses
 * the ramps because it is genuinely analog. Pure — unit-tested.
 */
export function pedalFromPointerY(
  clientY: number,
  zoneTopPx: number,
  zoneHeightPx: number,
): number {
  if (zoneHeightPx <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (clientY - zoneTopPx) / zoneHeightPx));
}

/**
 * Mutable touch axis state, merged into SimInput.read() (attachTouch).
 * One instance per scene; the overlay writes, the input pipeline reads.
 * mergeInto mutates the caller's reusable output object — zero allocation
 * on the per-physics-step path.
 */
export class TouchInputSource {
  private steerActive = false;
  private steerValue = 0;
  private throttleActive = false;
  private throttleValue = 0;
  private brakeActive = false;
  private brakeValue = 0;

  /** Steer axis, VehicleInput convention (-1..1, +1 = LEFT). */
  setSteer(value: number): void {
    this.steerActive = true;
    this.steerValue = Math.min(1, Math.max(-1, value));
  }

  /** Finger left the steer zone — the wheel springs back to keyboard/gamepad. */
  releaseSteer(): void {
    this.steerActive = false;
    this.steerValue = 0;
  }

  setThrottle(value: number): void {
    this.throttleActive = true;
    this.throttleValue = Math.min(1, Math.max(0, value));
  }

  releaseThrottle(): void {
    this.throttleActive = false;
    this.throttleValue = 0;
  }

  setBrake(value: number): void {
    this.brakeActive = true;
    this.brakeValue = Math.min(1, Math.max(0, value));
  }

  releaseBrake(): void {
    this.brakeActive = false;
    this.brakeValue = 0;
  }

  /** Overlay hidden/unmounted (pause, quiz, teach card, keyboard takeover) —
   *  nothing may stay held down. */
  releaseAll(): void {
    this.releaseSteer();
    this.releaseThrottle();
    this.releaseBrake();
  }

  /**
   * Fold the touch axes into an already keyboard∪gamepad-merged input.
   * Active axes REPLACE (priority merge — see header); inactive axes leave
   * the other devices untouched. Called inside SimInput.read(), BEFORE the
   * QW10 gate wrapper and the difficulty shaping — both apply unchanged.
   */
  mergeInto(out: VehicleInput): void {
    if (this.steerActive) out.steer = this.steerValue;
    if (this.throttleActive) out.throttle = this.throttleValue;
    if (this.brakeActive) out.brake = this.brakeValue;
  }
}
