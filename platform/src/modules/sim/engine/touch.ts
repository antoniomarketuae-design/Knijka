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
 *
 * LEGACY, and deliberately kept: the phone overlay no longer sizes its steer
 * range off the zone (see TOUCH_STEER_RANGE_PX below), but a proportional
 * range is still the right answer for a wide desktop-touch zone, and the
 * constant is part of the engine's public surface.
 */
export const TOUCH_STEER_RANGE_FRACTION = 0.5;

/**
 * FULL LOCK IN PIXELS, NOT IN PERCENT OF THE SCREEN — the founder's bug,
 * stated as a number.
 *
 * The old overlay's steer zone was `clamp(11rem, 34vw, 20rem)` wide and its
 * full-lock travel was half of that. Two consequences, both measured: on his
 * 852-px landscape iPhone the zone alone painted 290 × 80 px (5.5 % of the
 * screen), and because 34vw is A PROPORTION OF THE SCREEN, every bigger phone
 * got a bigger obstruction and a *different* steering feel from the same
 * thumb movement.
 *
 * A thumb is the same size on every phone. So the travel is now a fixed 84 px
 * — roughly the comfortable arc of a thumb pivoting at the base, measured
 * against the 44 px touch-target floor (a target is ~44, a comfortable swing
 * is about two of them) — and the zone that captures it is invisible, so it
 * can be as generous as the corner allows without costing a pixel of road.
 */
export const TOUCH_STEER_RANGE_PX = 84;

/**
 * Full pedal in pixels, for the single vertical drivetrain axis. Shorter than
 * the steer travel on purpose: steering wants resolution across its whole
 * range, while throttle and brake are mostly used near the extremes, and a
 * short throw is what makes "one thumb, one axis" reachable without the hand
 * leaving the corner.
 */
export const TOUCH_DRIVE_RANGE_PX = 64;

/**
 * Dead zone (px) around the drivetrain axis' centre. A spring-centred control
 * a thumb is RESTING on must read as neutral; without this, the weight of a
 * stationary hand is a permanent 3 % throttle. Steering has no dead zone — the
 * expo curve already makes the centre soft, and a dead zone there would feel
 * like play in the wheel.
 */
export const TOUCH_DRIVE_DEADZONE_PX = 6;

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
 * ONE AXIS FOR THE WHOLE DRIVETRAIN — „there can be only 1 slider: up is
 * forward, middle is stop, down is backwards" (founder, 2026-07-28).
 *
 * `dyPx` is vertical pointer travel since the gesture start (+y = drag DOWN,
 * screen space). The return is signed: **positive = throttle, negative =
 * brake**, magnitude 0..1, with the same expo curve the wheel uses so the
 * middle of the throw is feathering and the ends are commitment.
 *
 * WHY THIS IS ALSO THE REVERSE CONTROL, WITH NO GEAR CHANGE IN IT. Pushing
 * DOWN is the brake. Holding the brake at a standstill is exactly what
 * ReverseAssist (engine/reverseAssist.ts) already watches for: after
 * REVERSE_ASSIST_HOLD_S it steps the real selector D→N→R through the same
 * DrivelineState API the [ / ] keys use, and `applyReversePedalRemap` then
 * SWAPS the two channels — so once the car is in R, "down" is the reverse
 * accelerator and "up" is the brake. The founder's sentence becomes literally
 * true on one axis, held by one thumb, and not one line of grading, procedure
 * observation or trace recording had to learn about phones to make it so.
 *
 * Pure — unit-tested.
 */
export function driveAxisFromDrag(
  dyPx: number,
  rangePx: number,
  deadZonePx = TOUCH_DRIVE_DEADZONE_PX,
): number {
  if (rangePx <= 0) return 0;
  const dead = Math.max(0, deadZonePx);
  const magnitude = Math.abs(dyPx) - dead;
  if (magnitude <= 0) return 0;
  // Re-normalize past the dead zone so the FULL remaining travel still reaches
  // 1: a dead zone that just shifted the curve would cost the top of the range.
  const span = Math.max(1, rangePx - dead);
  const linear = Math.min(1, magnitude / span);
  const curved = Math.pow(linear, TOUCH_STEER_EXPO);
  // Screen y grows DOWNWARD; drag up (negative dy) must mean throttle.
  return dyPx < 0 ? curved : -curved;
}

/**
 * Pointer y → pedal value 0..1 on a vertical strip: strip bottom = 0 (foot
 * off), strip top = 1 (floored). Position IS the pressure — the analog
 * equivalent of the QW8 keyboard ramps' intent (partial pedal is a value the
 * student holds, not a filter artifact); like a gamepad trigger it bypasses
 * the ramps because it is genuinely analog. Pure — unit-tested.
 *
 * Kept for the absolute-position strip idiom (a gamepad-trigger-shaped
 * control); the phone overlay itself now drives on `driveAxisFromDrag`.
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
