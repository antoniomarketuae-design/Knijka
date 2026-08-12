/**
 * Auto-reverse assist (founder report 2026-07-17: „стрелката надолу не кара
 * колата назад") — the genre convention: press the brake at a standstill in D
 * and the car shifts itself to R; while the selector is in R the pedals SWAP
 * (S/ArrowDown is the reverse accelerator, W/ArrowUp brakes) so "down =
 * backwards" is literally true; press the (remapped) brake at a standstill in
 * R and it shifts back toward D.
 *
 * ===========================================================================
 * 2026-08-05 — THE HELD BRAKE. Read this before re-tuning anything here.
 * ===========================================================================
 * As first written, the trigger was a brake HOLD: 0.35 s of continuous pedal
 * at a standstill in D shifted to R, and rule b then handed the very pedal
 * the driver was standing on to the reverse accelerator. Measured on
 * sc-junction-stop: gear 1 → −1 at t=40.363 s, brake input 1.00, the car
 * accelerated BACKWARDS to 16.8 km/h and hit the vehicle behind.
 *
 * The input that produced it is the single most correct thing a learner does:
 * holding the brake at a Б2 stop line. This product spends a whole lesson
 * teaching it. So the assist took the one behaviour it is trying to build and
 * turned it into a collision — and it did it silently, because the pedal that
 * meant STOP became the pedal that meant GO under a stationary foot.
 *
 * TWO LAWS now separate "I am stopping" from "I want to go backwards", and
 * both are enforced here rather than in the glue, because the glue is not the
 * only route into R (the [ / ] keys, the touch gear sheet and the cockpit
 * lever all reach it too, with a foot on the brake):
 *
 *  LAW 1 — the press that STOPS the car never toggles direction. A brake
 *    press only ARMS the toggle when the car is already stationary AND the
 *    pedal was genuinely lifted (REVERSE_ASSIST_LIFT_S) first. A pedal held
 *    from motion through the stop and onward — the Б2 hold, a red light, a
 *    give-way wait — can be held forever and nothing shifts. Reversing is a
 *    separate, deliberate act of the foot: stop, lift, press.
 *
 *  LAW 2 — a pedal that means stop must never mean go (ReversePedalMapper
 *    below). Whichever channel INHERITS the throttle role when the mapping
 *    flips was, one frame earlier, the brake. If a foot is on it, that foot
 *    pressed it to stop, so it keeps braking until it is lifted. It also means
 *    the shift can never leave a stopping car with no brakes at all.
 *
 * ===========================================================================
 * 2026-08-11 — AND WHY LAW 2 IS NOW SCOPED TO THE MANUAL ROUTES
 * ===========================================================================
 * Founder ruling, verbatim: „before when pressing S or Arrow Down it
 * automatically went to R and moved backwards and it has to stay like that
 * because thats automatic transmition."
 *
 * Driven on /dev/drive-rig (sc-junction-stop@L1, real keyboard channel):
 * pressing ↓ at a standstill took the selector to R in 0.43 s and the car then
 * sat at 0.001 km/h under his foot until he lifted and pressed AGAIN, whereupon
 * it reversed at 18.6 km/h. So LAW 2 on the assist route never PREVENTED that
 * reverse — it charged a second press for it, which is precisely the thing he
 * says an automatic does not do.
 *
 * It does not have to. LAW 1 already proves the assist's own trigger press was
 * never a braking press: to arm, the car must ALREADY be stationary AND the
 * pedal must have been fully lifted for REVERSE_ASSIST_LIFT_S at that
 * standstill. There is nothing left for such a press to stop. Disowning it is
 * therefore redundant on THAT route, and only on that route.
 *
 * On the OTHER routes into R — the [ / ] keys, the touch gear sheet, the
 * cockpit lever — nothing of the kind is known. A driver there may be standing
 * on the brake precisely to HOLD THE CAR STILL, and moves the selector with his
 * hand; that pedal really was a stop press, and handing it the throttle role is
 * the original 16.8 km/h defect. Driven on the same rig for all three: rolled
 * in at 22.8 / 43.6 / 22.1 km/h, braked to rest without lifting, shifted to R
 * by hand — 0.001 km/h under the held foot, every time. LAW 2 stays there,
 * unchanged, and so does its voice (engine/reverseStuck.ts).
 *
 * So the mapper is now TOLD which route flipped it (`ReverseShiftSource`), and
 * the invariant it carries becomes the exact one that is true:
 *   NO HELD BRAKE CAN BECOME THROTTLE — except the assist's own armed press,
 *   which by LAW 1 was never a brake.
 * LAW 1 does NOT move. A pedal held from a ROLL through the stop is the input
 * that drove the car backwards into traffic, and it still reaches nothing:
 * measured again 2026-08-11, 22.2 km/h in, ↓ held 9 s through the stop,
 * selector D throughout.
 *
 * WHAT IT COSTS, PLAINLY. Same gesture after the change: R at +0.43 s, moving
 * at +0.08 s after that, 25.1 km/h backwards in a 6 s press. What shrank is not
 * whether the car reverses — it always did, on the second press — but the
 * warning the student gets between the R telltale lighting and the car moving,
 * from „a deliberate lift and press" to eight hundredths of a second. A nervous
 * re-dab of the brake at a stop line therefore reverses NOW where it used to
 * reverse one press later. That is the founder's ruling working as ruled: on a
 * real automatic, selecting R and standing on the accelerator does exactly this.
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
/** Continuous functional-brake hold (s) that triggers a direction toggle,
 *  once the press has been ARMED (see REVERSE_ASSIST_LIFT_S). */
export const REVERSE_ASSIST_HOLD_S = 0.35;
/**
 * LAW 1 — how long the functional brake must have been OFF, at a standstill,
 * immediately before a press for that press to count as "I want to go the
 * other way" rather than "I am stopping".
 *
 * A quarter second of a fully lifted pedal is not something a driver produces
 * by accident while coming to rest: the keyboard ramp alone takes 0.2 s to
 * fall from 1 to 0 (input.ts BRAKE_RELEASE_S), so this is a real foot leaving
 * a real pedal. It is also longer than the drive rig's standstill duty cycle
 * (devrig/driveScript.ts STANDSTILL_BRAKE_OFF_S = 0.12 s), so a scripted wait
 * cannot arm it either.
 */
export const REVERSE_ASSIST_LIFT_S = 0.25;
/** Silence window (s) after any MANUAL selector shift ([ / ], touch sheet,
 *  cockpit hotspot) — the assist never fights explicit input. */
export const REVERSE_ASSIST_SUPPRESS_S = 2;
/** Ramped pedal value above which it counts as held (the keyboard ramps
 *  cross this ~25 ms after key-down — see input.ts BRAKE_ATTACK_S). */
export const REVERSE_ASSIST_PEDAL_ON = 0.1;

export type ReverseAssistCommand = "shiftToR" | "shiftToD";

/**
 * WHICH ROUTE moved the selector — the one thing `ReversePedalMapper` needs to
 * know and never used to be told.
 *
 * "assist" is `ReverseAssist` below and nothing else: an armed press, i.e. a
 * press that BEGAN at a standstill after REVERSE_ASSIST_LIFT_S of fully lifted
 * pedal (LAW 1). "manual" is everything else — the [ / ] keys, the touch gear
 * sheet, the cockpit lever, and any future route — and is the DEFAULT, so a
 * caller that forgets gets the guard rather than the exemption.
 */
export type ReverseShiftSource = "assist" | "manual";

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
  /** Seconds the functional brake has been OFF while the car stood still. */
  private liftS = 0;
  /** Was the functional brake down last frame? (rising-edge detection) */
  private pedalDown = false;
  /** LAW 1: may THIS press toggle direction? Set once, at the press, and
   *  cleared by anything that makes the press mean something else. */
  private armed = false;

  /** A MANUAL selector shift happened (any non-assist gearUp/gearDown —
   *  keys [ / ], the touch gear sheet, a cockpit hotspot): stay silent for
   *  REVERSE_ASSIST_SUPPRESS_S and drop any accumulated hold. */
  noteManualShift(): void {
    this.suppressS = REVERSE_ASSIST_SUPPRESS_S;
    this.holdS = 0;
    this.armed = false;
    this.liftS = 0;
  }

  /**
   * Advance one frame. Returns a command at most once per ARMED press:
   *  - selector D, standstill, armed press held ≥ HOLD_S → "shiftToR" (rule a)
   *  - selector R, standstill, armed press held ≥ HOLD_S → "shiftToD" (rule c)
   *
   * A press is ARMED only if the car was already stationary when it went down
   * and the pedal had been lifted for REVERSE_ASSIST_LIFT_S first (LAW 1). So
   * the brake that brings the car to rest — and then goes on being held, which
   * is the correct thing to do at a Б2 sign, a red light or a give-way line —
   * is never a request for reverse, however long it is held.
   *
   * Anything else (moving, other selector, throttle down, pedal released,
   * manual-shift silence) resets the hold timer; moving or an ambiguous
   * both-pedals frame also disarms the press outright, so it cannot resume.
   * Emitting disarms too: one gesture of the foot toggles direction once.
   */
  update(f: ReverseAssistFrame): ReverseAssistCommand | null {
    const stopped = Math.abs(f.speedKmh) < REVERSE_ASSIST_STANDSTILL_KMH;
    const down = f.brakePedal > REVERSE_ASSIST_PEDAL_ON;

    if (this.suppressS > 0) {
      this.suppressS = Math.max(0, this.suppressS - f.dtSec);
      this.holdS = 0;
      this.liftS = 0;
      this.armed = false;
      this.pedalDown = down; // a press spanning the silence stays unarmed
      return null;
    }

    if (!down) {
      // Pedal off. Time spent lifted AT A STANDSTILL is what earns the right
      // to toggle on the next press; lifting it while still rolling does not.
      this.liftS = stopped ? this.liftS + f.dtSec : 0;
      this.holdS = 0;
      this.armed = false;
      this.pedalDown = false;
      return null;
    }

    if (!this.pedalDown) {
      // Rising edge — the one instant at which a press can be armed.
      this.armed = stopped && this.liftS >= REVERSE_ASSIST_LIFT_S;
      this.holdS = 0;
    }
    this.pedalDown = true;
    this.liftS = 0;

    // Moving, or both pedals down: this press is not (or is no longer) an
    // unambiguous request for the other direction. Disarm — a press that has
    // once meant "stop the car" must not become a shift when the car stops.
    if (!stopped || f.throttlePedal > REVERSE_ASSIST_PEDAL_ON) {
      this.armed = false;
      this.holdS = 0;
      return null;
    }
    if (!this.armed || (f.selector !== "D" && f.selector !== "R")) {
      this.holdS = 0;
      return null;
    }

    this.holdS += f.dtSec;
    if (this.holdS < REVERSE_ASSIST_HOLD_S) return null;
    this.holdS = 0;
    this.armed = false; // one press, one toggle — a fresh lift is required
    return f.selector === "D" ? "shiftToR" : "shiftToD";
  }
}

/**
 * Rule b — the in-R pedal swap, applied in place on the merged VehicleInput
 * AFTER the keyboard∪gamepad∪touch merge and BEFORE the QW10 gate / raw
 * capture, so EVERY consumer — physics step, difficulty shaping, audio revs,
 * the A2 observers and the recorder — sees the FUNCTIONAL pedals: S/Down
 * accelerates backward, W/Up brakes.
 *
 * THE SWAP ALONE IS NOT SAFE. Live callers must go through ReversePedalMapper
 * below, which applies this and then enforces LAW 2; GatedSimInput.read() does.
 * This bare function stays exported because it is what rule b IS, and the
 * mapper's tests need to be able to say what the guard changed.
 */
export function applyReversePedalRemap(input: VehicleInput): void {
  const throttle = input.throttle;
  input.throttle = input.brake;
  input.brake = throttle;
}

/**
 * LAW 2 — rule b WITH the guard that makes „a pedal that means stop must never
 * mean go" a property of the input path rather than a hope about the trigger.
 *
 * Rule b swaps what the two pedal channels MEAN. Look at which channel takes
 * the throttle role each way round:
 *
 *      D:  ↑/W = throttle   ↓/S = brake
 *      R:  ↓/S = throttle   ↑/W = brake
 *
 * Both flips hand the throttle role to the channel that was the BRAKE one
 * frame earlier. So if a foot is on it at the moment of the flip, that foot
 * pressed it to STOP — under no circumstances may the swap read it as GO.
 *
 * …UNLESS THE FLIP WAS THE ASSIST'S OWN ARMED PRESS. That is the whole content
 * of `source` (see ReverseShiftSource and the 2026-08-11 note at the top of
 * this file). LAW 1 will not arm a press unless the car was ALREADY stopped and
 * the pedal had been fully lifted for a quarter second at that standstill — so
 * that particular press cannot have been the press that stopped anything, and
 * treating it as a stop press costs the founder a second press for a reverse
 * that happens either way. Every other route says nothing about the foot, so
 * every other route is guarded exactly as before.
 *
 * On a guarded flip the channel is DISOWNED and stays disowned until it is
 * genuinely released: while disowned it contributes ZERO throttle and goes on
 * braking with the value the driver is applying. Two consequences, both wanted:
 *
 *  - the 16.8 km/h reverse into traffic is unreachable from a hand-worked
 *    selector — not "unlikely", not "the trigger no longer fires", but
 *    arithmetically impossible ([ / ], touch gear sheet, cockpit lever);
 *  - the shift never strips a stopping car of its brakes. Handing the brake
 *    role to a channel nobody is touching would otherwise leave a car that
 *    the driver believes is braked rolling on whatever the gradient gives it.
 *    (On the assist route the car is at a standstill BY CONSTRUCTION and the
 *    driver is asking for the other direction, so there is no stop to protect.)
 *
 * Releasing is judged on VALUE, not time, so the guard is idempotent: read()
 * runs several times per frame (physics step, render glue, cabin visuals) and
 * every call sees freshly re-derived pedal values.
 *
 * The reverse direction needs no guard: a held pedal may always GAIN the
 * brake role. Gaining "stop" is safe; gaining "go" is the whole defect.
 */
export class ReversePedalMapper {
  private remapped = false;
  private disowned = false;

  /**
   * Apply rule b in place when `remap` is on, then enforce LAW 2. Call once
   * per read with the CURRENT remap flag (selector × transmission × lesson —
   * see shouldRemapReversePedals); flips are detected here.
   *
   * `source` describes WHICH ROUTE produced the value of `remap` being passed
   * in, and it must therefore be recorded by the caller AT THE MOMENT the flag
   * changes, not guessed later — the caller's `read()` runs several times per
   * frame and in no fixed order relative to the assist's own step. It defaults
   * to "manual": an unlabelled flip is a guarded flip.
   */
  apply(input: VehicleInput, remap: boolean, source: ReverseShiftSource = "manual"): void {
    if (remap !== this.remapped) {
      this.remapped = remap;
      // Assignment, not `||=`: an assist flip can only follow a genuine lift
      // (LAW 1), and a lift has already cleared any earlier disown on value —
      // so there is never a live guard here for this to drop.
      this.disowned = source !== "assist";
    }
    if (remap) applyReversePedalRemap(input);
    if (!this.disowned) return;
    if (input.throttle <= REVERSE_ASSIST_PEDAL_ON) {
      this.disowned = false; // lifted — the channel belongs to the driver again
      return;
    }
    input.brake = Math.max(input.brake, input.throttle);
    input.throttle = 0;
  }

  /**
   * Is a pedal currently being held through a flip?
   *
   * THIS IS ALSO THE PRODUCT'S ONLY WARNING THAT A DRIVER IS STUCK. For as
   * long as it was read by nothing but this file's own tests, the cockpit
   * showed R, kept the car braked and said nothing — founder, 2026-08-09:
   * „it turns to R (reverse) but the car does not move did it break or ?".
   * `reverseStuck.ts` decides when a disowned pedal has lasted long enough to
   * be confusion rather than an ordinary shift; do not delete this getter
   * thinking it is telemetry.
   */
  get isDisowned(): boolean {
    return this.disowned;
  }
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
