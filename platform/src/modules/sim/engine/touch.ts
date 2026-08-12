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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ABSOLUTE PAD — founder ruling 2026-08-11, and the reversal of a design
 * decision this file used to defend.
 * ─────────────────────────────────────────────────────────────────────────────
 * „up is forward, middle is stop, down is backwards" was implemented as a
 * RELATIVE drag: the origin was wherever the thumb landed, so a tap produced
 * exactly 0 and a motionless press produced exactly 0 for as long as it was
 * held. Measured (doc 91 §T4, WebKit, iPhone 16 landscape): 3 taps and
 * 3 × 1500 ms motionless holds all returned `translateY(0px)`, neutral border,
 * 0.00 km/h, WITH the sim clock running — i.e. nothing was paused and nothing
 * was broken. It was the control answering exactly as designed, and the design
 * is what he was reporting as „the forward GAS and Backwards is not working".
 *
 * So POSITION is now the axis. Three bands, each exactly the 44 px touch floor
 * this project enforces on every other control, because „middle is stop" is a
 * target a thumb has to be able to find on purpose:
 *
 *      ┌──────────────┐  ← pad centre − 66 px   FULL THROTTLE
 *      │   forward    │     44 px of modulation
 *      ├──────────────┤  ← pad centre − 22 px
 *      │  ▓▓ STOP ▓▓  │     44 px, both pedals released
 *      ├──────────────┤  ← pad centre + 22 px
 *      │  brake/back  │     44 px of modulation
 *      └──────────────┘  ← pad centre + 66 px   FULL BRAKE
 *
 * 132 px of travel, centred on the pad box, and the smallest pad box in the
 * device ladder is 152 px tall — so the whole control is reachable inside its
 * own hit area on every phone we ship to (asserted for the whole device ladder
 * in components/sim/touchArc.test.ts — there is no padGeometry.test.ts, which
 * is what this line used to name).
 *
 * WHAT WAS LOST, stated so it can be overturned rather than discovered: the
 * comment this replaced said „RELATIVE, not absolute: the gesture starts
 * wherever the thumb landed, so the student never has to find a 26 px dot".
 * That forgiveness is real and it is gone on this pad — an imprecise first
 * contact now MEANS something. The 44 px stop band is what buys most of it
 * back: a thumb landing anywhere near the middle still commands nothing. The
 * STEERING pad keeps the relative idiom untouched; the ruling was about the gas.
 */

/** Half the neutral band, px — so the „stop" zone is a 44 px target. */
export const TOUCH_DRIVE_NEUTRAL_HALF_PX = 22;

/**
 * Distance from the pad's centre to full pedal, px. Neutral half-band plus one
 * 44 px touch floor, so throttle and brake each get a full-sized zone to
 * modulate in and the three bands tile the pad without overlapping.
 */
export const TOUCH_DRIVE_ABSOLUTE_RANGE_PX = TOUCH_DRIVE_NEUTRAL_HALF_PX + 44;

/**
 * Pointer y → the signed drivetrain axis, measured from the pad's own centre
 * rather than from where the gesture began. **Positive = throttle, negative =
 * brake**, magnitude 0..1.
 *
 * Deliberately delegates to `driveAxisFromDrag` instead of restating the curve:
 * the expo, the dead-zone re-normalisation and the screen-y sign convention are
 * one implementation with one set of tests, and „absolute" is a statement about
 * the ORIGIN and nothing else. Pure — unit-tested.
 */
export function driveAxisFromPadY(
  clientY: number,
  padCentreY: number,
  rangePx: number = TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  neutralHalfPx: number = TOUCH_DRIVE_NEUTRAL_HALF_PX,
): number {
  return driveAxisFromDrag(clientY - padCentreY, rangePx, neutralHalfPx);
}

/**
 * Pointer y → pedal value 0..1 on a vertical strip: strip bottom = 0 (foot
 * off), strip top = 1 (floored). Position IS the pressure — the analog
 * equivalent of the QW8 keyboard ramps' intent (partial pedal is a value the
 * student holds, not a filter artifact); like a gamepad trigger it bypasses
 * the ramps because it is genuinely analog. Pure — unit-tested.
 *
 * Kept for the single-pedal strip idiom (a gamepad-trigger-shaped control);
 * the phone overlay's one signed axis uses `driveAxisFromPadY` above.
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
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH FINGER OWNS ONE PAD — and the reason this is an object in the engine
 * instead of two `useRef`s in the component.
 *
 * THE DEFECT IT EXISTS TO END (doc 91 §C1/§D1, measured 2026-08-11, three
 * probe lanes, A/B one variable): hold the throttle, let a teach card pause
 * the sim, and the drive pad is dead FOR THE REST OF THE SESSION. Not the
 * steering pad — only the pad whose finger was down. The chain was:
 *
 *   the overlay hid itself by returning `null`, but the component INSTANCE
 *   survived (LessonScene renders it under a `touchCapable` flag that never
 *   changes), so every ref survived with it → the node was detached, so the
 *   `pointerup` that clears the owning id never arrived → the pad believed a
 *   long-gone finger still owned it → and the first line of the press handler
 *   („one finger owns this pad") refused every future touch, silently.
 *
 * A lane proved it by sweeping synthetic `pointerup` ids 1..24 against the
 * dead pad: ids 1–3 changed nothing, ID 4 BROUGHT IT BACK — exactly the
 * pointerId the browser had given the thumb that was on the throttle when the
 * sim paused. Nothing but clearing that one id revives the control.
 *
 * The component already had an effect for exactly this ("any hide releases
 * held axes") and it released the AXES and not the OWNERSHIP. That omission
 * is the whole bug, and it was invisible in review because the two halves of
 * "let go of everything" were written in two different vocabularies — one a
 * method call, one a bare assignment to a ref.
 *
 * So ownership becomes a named thing with a `release()` on it, `abandon()` is
 * the word for "the pad lost its node", and `releaseTouchControls()` below is
 * the single call that means "let go of everything" — one list, impossible to
 * do half of. Plain TS with no DOM in it, so the chain that used to need a
 * phone and a stopwatch is now three lines of a unit test.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export class PadPointer {
  private owner: number | null = null;

  /** The pointerId currently driving this pad, or null when it is free. */
  get pointerId(): number | null {
    return this.owner;
  }

  /** True while `pointerId` is the finger this pad is following. */
  owns(pointerId: number): boolean {
    return this.owner === pointerId;
  }

  /**
   * A press. ONE FINGER OWNS ONE PAD: a second thumb landing on the throttle
   * must not fight the first for the axis, so the claim is refused while the
   * pad is owned. Returns whether this pointer now owns the pad.
   */
  claim(pointerId: number): boolean {
    if (this.owner !== null) return false;
    this.owner = pointerId;
    return true;
  }

  /**
   * A release from `pointerId` — `pointerup`, `pointercancel`, lost capture.
   * Returns false (and changes nothing) for any pointer that did not own the
   * pad, which is what keeps a second finger's lift from springing the first
   * finger's axis back to centre.
   */
  release(pointerId: number): boolean {
    if (this.owner !== pointerId) return false;
    this.owner = null;
    return true;
  }

  /**
   * The pad lost its interaction entirely — hidden behind a card, paused,
   * unmounted, keyboard takeover. Ownership is dropped UNCONDITIONALLY and
   * without an id, because the whole point is that the event which would have
   * carried that id is never coming.
   */
  abandon(): void {
    this.owner = null;
  }
}

/**
 * EVERYTHING A HIDE MUST LET GO OF, as one call.
 *
 * The axes, so a thumb resting on the throttle cannot keep driving a frozen
 * scene (this half always worked, and it is why the car correctly STOPS when
 * a card arrives instead of running away), AND the pads' pointer ownership,
 * so the finger that is still on the glass does not lock its pad forever
 * (doc 91 §C1 — the half that was missing).
 *
 * Callers pass their pads; nothing here knows what a pad is attached to.
 */
export function releaseTouchControls(touch: TouchInputSource, ...pads: PadPointer[]): void {
  touch.releaseAll();
  for (const pad of pads) pad.abandon();
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
