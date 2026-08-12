/**
 * THE DISOWNED PEDAL, SAID OUT LOUD — the missing half of LAW 2.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 * `ReversePedalMapper` (reverseAssist.ts, LAW 2): whichever pedal channel
 * INHERITS the throttle role at a HAND-WORKED selector flip was the BRAKE one
 * frame earlier, so if a foot is on it that foot pressed it to STOP — the
 * channel is DISOWNED and contributes zero throttle until it is genuinely
 * released. That guard is what makes „the 16.8 km/h reverse into traffic"
 * arithmetically impossible from the [ / ] keys, the touch gear sheet and the
 * cockpit lever. (2026-08-11: the ASSIST route is exempt — LAW 1 proves its
 * trigger press was never a brake — so it never reaches this machine at all.
 * See the founder-ruling note at the top of reverseAssist.ts.)
 *
 * What it never had is a MOUTH. The founder, 2026-08-09, holding ↓ at a
 * standstill: the assist shifted the selector to R, the cluster showed R, his
 * foot was down — and nothing moved. His words: „it turns to R (reverse) but
 * the car does not move did it break or ?" `isDisowned` was exposed on the
 * mapper and read by NOTHING in the product; the cockpit refused an input in
 * silence. THEO-4 (requirement zero, founder-ratified) forbids exactly that: a
 * silent refusal is a bare verdict, and the student is owed the reasoning.
 * His route is now fixed at the source rather than explained (ruling
 * 2026-08-11, „thats automatic transmition"); this machine keeps the mouth for
 * the three routes where the refusal is still real and still right.
 *
 * So this machine watches the mapper and decides ONE thing: is the driver
 * genuinely STUCK, or is this an ordinary shift that will clear itself?
 *
 * ===========================================================================
 * WHY A THRESHOLD, AND WHY 1.5 s — MEASURED, NOT PICKED
 * ===========================================================================
 * DISOWNED IS THE NORMAL CASE, not the exception. [ / ], the touch gear sheet
 * and the cockpit lever are all worked with the brake down, because that is how
 * an automatic is meant to be shifted — so a message on every flip would fire
 * on every correct hand-worked reverse in the product, which is noise. Only a
 * LONG disowned state is confusion.
 *
 * (2026-08-11: the ASSIST route no longer disowns at all — LAW 1 proves its
 * trigger press was never a brake, so it carries through as reverse throttle
 * and this machine is never fed a disowned frame from it. That does not change
 * a number below; it removes the noisiest source of them. The 1.5 s was
 * measured on the assist route because that was the only route a script could
 * drive at the time, and the state it measured — a pedal held through a flip at
 * a standstill — is identical whichever hand moved the selector.)
 *
 * Measured on /dev/drive-rig (sc-junction-stop@L1, real shell, real keyboard
 * channel, 2026-08-11 — the numbers are in the row's report):
 *
 *   · the pedal ramp alone. `SimInput` releases the brake channel over
 *     BRAKE_RELEASE_S = 0.2 s, and the guard clears on VALUE at
 *     REVERSE_ASSIST_PEDAL_ON = 0.1 — so a driver who lifts THE INSTANT the
 *     selector flips is still disowned for 0.180 s. Measured 0.183 s (the
 *     frame quantum). That is the FLOOR: no threshold below it can exist.
 *   · an ordinary shift, lifting on seeing R. This product already states
 *     what „reacting to something on screen" costs: `REACTION_BAND_GOOD_MAX_S`
 *     = 1.2 s is the boundary below which a reaction is still graded „добър"
 *     (lessons/objectives.ts). 1.2 + 0.18 = 1.38 s of disowned pedal from a
 *     driver doing nothing wrong. Driven at 0.4 / 0.8 / 1.2 s of hold after
 *     the flip: 0.58 / 0.98 / 1.38 s disowned, and the car reversed normally
 *     in all three.
 *   · genuinely stuck. Holding through, the founder's case: unbounded. 5.0 s
 *     of hold measured 5.0 s of disowned pedal and 0.0 km/h throughout.
 *
 * 1.5 s is therefore the first tenth above the slowest ORDINARY shift this
 * project is willing to call ordinary, and it is 8.3× the floor. Below 1.4 it
 * starts talking over a „бавен" but perfectly correct driver; far above it and
 * the founder stares at a dead car for longer than he already did.
 *
 * ===========================================================================
 * AND WHY IT REPEATS
 * ===========================================================================
 * The state can outlive any toast: a driver holding the key down is stuck for
 * as long as he holds it. `REVERSE_STUCK_REPEAT_S` = 10 s is not a new
 * convention — it is `BLOCKED_DRIVE_TOAST_COOLDOWN_S` in LessonPlayShell, the
 * cadence the QW10 „завърши подготовката" hint already uses for the same shape
 * of problem (an input refused for a reason the student cannot see, repeated
 * while the student keeps making it). It can only repeat while the pedal is
 * still down, at a standstill, in a remapped selector — the instant the foot
 * lifts, the episode ends and the counter resets.
 *
 * Pure state machine — no DOM, no React, no clock of its own (the caller feeds
 * its clamped render dt), exactly like `ReverseAssist` beside it.
 */

import type { SelectorPosition } from "../vehicle";
import { REVERSE_ASSIST_STANDSTILL_KMH } from "./reverseAssist";

/**
 * Continuous seconds of a disowned pedal, at a standstill, before the cockpit
 * says anything. See the measurement above — this is the number that separates
 * „an ordinary shift" from „this student thinks the product is broken".
 */
export const REVERSE_STUCK_HINT_S = 1.5;

/**
 * …and how long before it says it AGAIN, while the driver is still stuck.
 * Deliberately equal to LessonPlayShell's BLOCKED_DRIVE_TOAST_COOLDOWN_S.
 */
export const REVERSE_STUCK_REPEAT_S = 10;

/**
 * Which way the car is refusing to go — the shell needs it to name the right
 * direction, because both flips disown (LAW 2 guards the way OUT of R too:
 * ↑/W was the brake there and becomes the throttle in D).
 */
export type ReverseStuckDirection = "backward" | "forward";

export interface ReverseStuckFrame {
  /** `ReversePedalMapper.isDisowned` for THIS frame, read after apply(). */
  disowned: boolean;
  /** The live selector — the machine only speaks for R (backward) and D. */
  selector: SelectorPosition;
  /** Signed or unsigned — only |speed| is read. */
  speedKmh: number;
  /** Wall-clock frame delta, s (the caller's clamped render dt). */
  dtSec: number;
}

export class ReverseStuckWatch {
  /** Seconds the pedal has been disowned at a standstill in D or R. */
  private heldS = 0;
  /** Seconds since the last thing we said, within the SAME episode. */
  private sinceSaidS = 0;
  /** Have we spoken at all in this episode? */
  private said = false;

  /**
   * Advance one frame. Returns a direction exactly on the frames where the
   * cockpit should speak — once when `REVERSE_STUCK_HINT_S` is crossed, then
   * every `REVERSE_STUCK_REPEAT_S` while the driver stays stuck — and null on
   * every other frame.
   *
   * Anything that ends the confusion ends the episode: the foot lifting (the
   * guard clears itself on value), the car moving, a selector that is neither
   * D nor R. The next stuck episode starts its count from zero.
   */
  update(f: ReverseStuckFrame): ReverseStuckDirection | null {
    const stopped = Math.abs(f.speedKmh) < REVERSE_ASSIST_STANDSTILL_KMH;
    const speaks = f.selector === "R" || f.selector === "D";
    if (!f.disowned || !stopped || !speaks) {
      this.reset();
      return null;
    }

    this.heldS += f.dtSec;
    if (this.said) {
      this.sinceSaidS += f.dtSec;
      if (this.sinceSaidS < REVERSE_STUCK_REPEAT_S) return null;
    } else if (this.heldS < REVERSE_STUCK_HINT_S) {
      return null;
    }
    this.said = true;
    this.sinceSaidS = 0;
    return f.selector === "R" ? "backward" : "forward";
  }

  /** End the episode — the scene calls this when the drive is not live. */
  reset(): void {
    this.heldS = 0;
    this.sinceSaidS = 0;
    this.said = false;
  }

  /** Telemetry/test read: how long the current episode has run, s. */
  get heldSec(): number {
    return this.heldS;
  }
}
