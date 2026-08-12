/**
 * THE CAR THAT WILL NOT MOVE, AND WHY — the driving-phase twin of the QW10
 * pre-drive gate's explanation.
 *
 * ===========================================================================
 * THE HOLE, MEASURED
 * ===========================================================================
 * `LessonPlayShell.handleBlockedDriveAttempt` already says the right sentence
 * when a student presses the throttle on a car that is not ready — «Колата още
 * не е готова за потегляне» — but it is reachable only through
 * `GatedSimInput.driveLocked`, and that flag is `state.phase === "preDrive"`
 * (lessons/engine.ts `isDriveLocked`). Every compiled scenario rung sets
 * `preDrive: false` (lessons/scenario/compile.ts), so on a scenario the phase
 * is `driving` from frame one and the explanation is structurally unreachable.
 *
 * That would be harmless if scenario rungs always handed over a running car.
 * They do not. Measured by grep over `lessons/scenario/templates-*.ts`
 * (2026-08-11): **130 rungs declare `{ level: 4, vehicleStart: "cold" }`** —
 * the exam rung, where the advisor is switched off too — **and 31 templates
 * declare `vehicleStart: "cold"` on the template itself**, which is all five
 * of that template's rungs. A cold car is engine OFF, selector P, parking
 * brake ON (vehicle/driveline.ts constructor).
 *
 * Driven on /dev/drive-rig, `sc-junction-stop@L4`, real shell, real keyboard
 * (2026-08-11):
 *
 *   spawn                 phase "driving" · P · «Двигателят е изключен» · ръчна вдигната
 *   10 s of held throttle  0.00 km/h · 0 toasts · 0 events
 *   after I                engine running — still 0.00
 *   after ] ] ]            selector D     — still 0.00
 *   after Space            handbrake off  — and now 20.9 km/h
 *
 * Ten seconds of a floored pedal, three separate controls to find, and the
 * product said nothing at any point. That is the founder's own sentence about
 * the reverse defect — „did it break or ?" — wearing different clothes, and it
 * is the same THEO-4 violation: a silently refused input is a bare verdict.
 *
 * ===========================================================================
 * WHAT THIS MACHINE DOES, AND WHAT IT DELIBERATELY DOES NOT
 * ===========================================================================
 * It watches the FUNCTIONAL throttle (post rule-b remap, so R is covered) and
 * the live driveline, and names the FIRST thing standing between the pedal and
 * the road, in the order a driver has to fix them: engine → selector → parking
 * brake. Fixing one and pressing again produces the next sentence, so the
 * student is walked out rather than handed a list.
 *
 * IT CHANGES NOTHING ABOUT THE CAR. No interlock is relaxed, no force is
 * added, no state is written. `hasDriveTraction` (vehicle/driveline.ts) and
 * `PARKING_BRAKE_FORCE_N` are exactly as they were; this only reads them.
 *
 * ===========================================================================
 * 2026-08-11 — THE OTHER PEDAL. Read this before re-scoping the brake channel.
 * ===========================================================================
 * The machine above reads the THROTTLE only, and that left the founder's own
 * defect open on the tier that opted out of the reverse assist. Driven on
 * /dev/drive-rig (`sc-junction-stop@L1`, real shell, real click on the tier
 * pill, 2026-08-11):
 *
 *   click „Напреднал" on a standing car   selector D → N, 0 toasts, 0 events
 *   hold ↓ for 12.5 s                     0.00 km/h, 0 toasts, 0 events
 *   Z + [                                 N → R  (the car IS recoverable)
 *   [ with no clutch                      «Предавката не влезе» — it speaks
 *
 * Twelve and a half seconds of a held pedal on a car the product itself had
 * just put in neutral, and nothing said anything — because on that tier ↓ is
 * the BRAKE, and no watcher in this engine listens to the brake. The car is
 * not a dead end (Z + [ / Z + ] walk the gate normally), but the only way out
 * is a control the student has no reason to reach for, because nothing told
 * him his selector had moved.
 *
 * THE WORDS ALREADY EXISTED. `stuckStartHint("neutral", "manual")` has said
 * «Задръж съединителя и включи първа предавка (Z + ]) … В „Напреднал" колата
 * ти се подава именно на N» since it was written. The product knew exactly
 * what to say and was listening to the wrong pedal.
 *
 * SO THE BRAKE NOW COUNTS — UNDER THREE GATES THAT MAKE IT UNABLE TO NAG:
 *
 *  1. SELECTOR P OR N ONLY. Those are the two positions where the gearbox
 *     transmits nothing, so a brake there cannot be stopping anything. In
 *     D / M / R the brake channel is not read at all, which is why the Б2
 *     hold, the red light and the give-way wait are untouched BY
 *     CONSTRUCTION rather than by a timer.
 *  2. ENGINE RUNNING. It therefore can only ever produce "parked" or
 *     "neutral" — the two reasons whose sentences are pedal-agnostic. The
 *     "engineOff" / "stalled" copy names the throttle («затова газта не движи
 *     колата») and would be a lie about a brake press, so the brake can never
 *     reach it. A cold car is still fully covered by the throttle channel.
 *  3. AN ARMED PRESS — LAW 1's discipline, borrowed whole. The pedal must
 *     have been genuinely LIFTED at a standstill for `REVERSE_ASSIST_LIFT_S`
 *     before the press, exactly as `ReverseAssist` requires before it will
 *     read a brake as „I want to go the other way". A brake carried in from
 *     motion — including one carried through a shift INTO neutral, because
 *     the gate opening is not a rising edge — can be held forever and this
 *     stays silent. Nothing in engine/reverseAssist.ts is touched; its two
 *     exported constants are imported and its reasoning is reused.
 *
 * The brake press then serves the SAME `STUCK_START_HINT_S`, the same settle
 * beat and the same repeat cadence as the throttle, and produces the same
 * reasons — no new channel, no new copy, no new surface.
 *
 * THREE THINGS IT STAYS SILENT ABOUT, each for a reason:
 *
 *  · THE CLUTCH. On the manual tier a held clutch with the throttle down is
 *    not a stuck student, it is the clutch-control exercise that tier exists
 *    to teach. `clutchDown` is therefore never a reason — and because the
 *    reasons are checked in order, a manual student in M with the clutch in
 *    hears nothing at all.
 *  · A DISOWNED PEDAL. When LAW 2 disowns a channel (engine/reverseAssist.ts)
 *    the mapper zeroes the functional throttle, so this machine sees no pedal
 *    and stays quiet — `ReverseStuckWatch` owns that episode and says its own,
 *    more specific sentence. The two can never talk over each other, and the
 *    brake channel above cannot reach that episode either: LAW 2 only ever
 *    disowns in D or R, and the brake is not read there.
 *  · THE PRE-DRIVE PHASE. `driveLocked` resets the watch: the QW10 toast owns
 *    it there, the input gate zeroes the pedals anyway, and a held brake
 *    during the procedure IS a step.
 *
 * ===========================================================================
 * THE THREE NUMBERS
 * ===========================================================================
 * `STUCK_START_HINT_S` = 1.2 s of continuous, real throttle at a standstill.
 * The keyboard ramp reaches full pedal in `THROTTLE_ATTACK_S` = 0.35 s
 * (engine/input.ts), so this is ~3.4 ramps: long past a brush of the key,
 * comfortably short of the ten seconds measured above. It is the same number
 * `REACTION_BAND_GOOD_MAX_S` (lessons/objectives.ts) uses for „a person has
 * now had time to notice something", which is exactly the judgement being
 * made — reused rather than re-invented, and stated here so it is not a magic
 * constant.
 *
 * `STUCK_START_REPEAT_S` = 10 s, deliberately equal to
 * `BLOCKED_DRIVE_TOAST_COOLDOWN_S` in LessonPlayShell — the cadence its own
 * „завърши подготовката" hint already uses for this exact shape of problem.
 * The episode ends the moment the pedal lifts, the car moves, or the blocker
 * is cleared, and the next one counts from zero. A blocker the student has
 * just CLEARED is answered by the next one without serving that cooldown —
 * an instructor does not make you wait ten seconds to be told the next thing.
 *
 * `STUCK_START_SETTLE_S` = 0.8 s is what keeps that from becoming chatter; its
 * own measurement is on the constant.
 *
 * Standstill is `REVERSE_ASSIST_STANDSTILL_KMH` (0.6 km/h), reused rather than
 * re-derived: measured on the drive rig, eight seconds of full throttle against
 * the parking brake produced a maximum of **0.32 km/h**, so the one blocker
 * that lets the car move at all still sits at half the threshold.
 *
 * Pure state machine — no DOM, no React, no clock of its own (the caller feeds
 * its clamped render dt), exactly like `ReverseAssist` and `ReverseStuckWatch`
 * beside it.
 */

import type { DrivelinePhysicsInput } from "../vehicle";
import { REVERSE_ASSIST_LIFT_S, REVERSE_ASSIST_STANDSTILL_KMH } from "./reverseAssist";

/** Continuous seconds of real throttle, at a standstill, on a car that cannot
 *  move, before the cockpit says anything. See the measurement above. */
export const STUCK_START_HINT_S = 1.2;

/** …and how long before it says it again while the student keeps pressing.
 *  Deliberately equal to LessonPlayShell's BLOCKED_DRIVE_TOAST_COOLDOWN_S. */
export const STUCK_START_REPEAT_S = 10;

/**
 * How long a blocker must be the CURRENT one before it is worth a sentence.
 *
 * Without this the machine is chatty in exactly the situation it exists to
 * help. Measured on the drive rig before it was added: a student who floors the
 * throttle and then walks the gate P → R → N → D collected three cards in
 * 2.5 s — «ръчната спирачка», «лостът е на N», «ръчната спирачка» — each true
 * at the instant it appeared and all three useless, because the selector was
 * still moving under them. The founder's standing note about overlays is that a
 * warning which keeps popping „only makes the user nervous".
 *
 * 0.8 s is under `STUCK_START_HINT_S`, so it never delays the FIRST sentence of
 * an episode (the blocker is stable from frame one on a car nobody is touching)
 * and it is longer than a gate step a hand makes without stopping to read.
 */
export const STUCK_START_SETTLE_S = 0.8;

/**
 * Functional throttle above which the pedal counts as pressed. The same
 * `REVERSE_ASSIST_PEDAL_ON` value the reverse laws use — one definition of
 * „a foot is on it" in this engine.
 */
export const STUCK_START_PEDAL_ON = 0.1;

/**
 * What is standing between the pedal and the road, in the order a driver has
 * to clear them. `stalled` is split from `engineOff` because the cockpit says
 * different things about them (a stall is something that HAPPENED; an engine
 * that was never started is something not yet DONE) and because the restart
 * needs different keys on the manual tier.
 */
export type StuckStartReason = "engineOff" | "stalled" | "parked" | "neutral" | "parkingBrake";

export interface StuckStartFrame {
  /** FUNCTIONAL throttle 0..1 — post rule-b remap and post LAW 2, i.e. the
   *  value the physics is actually being given (LessonScene's rawThrottle). */
  throttlePedal: number;
  /**
   * FUNCTIONAL brake 0..1 (LessonScene's rawBrake). Read ONLY in P/N with the
   * engine running, and only as an ARMED press — see the three gates in the
   * header. Optional so every existing caller and test is unchanged: an
   * omitted brake is a lifted brake, which is what those callers meant.
   */
  brakePedal?: number;
  /** Signed or unsigned — only |speed| is read. */
  speedKmh: number;
  /** The live driveline, read straight off DrivelineState.physicsInput. */
  driveline: DrivelinePhysicsInput;
  /** Engine cut by a stall rather than switched off (DrivelineState.stalled). */
  stalled: boolean;
  /** Wall-clock frame delta, s (the caller's clamped render dt). */
  dtSec: number;
}

/**
 * The first blocker, or null when the car can move. Order is the fix order:
 * an engine that is not running makes the selector irrelevant, and a selector
 * in P makes the parking brake irrelevant.
 *
 * The clutch is never a blocker here — see the header.
 */
export function stuckStartReason(
  d: DrivelinePhysicsInput,
  stalled: boolean,
): StuckStartReason | null {
  if (!d.engineOn) return stalled ? "stalled" : "engineOff";
  if (d.selector === "P") return "parked";
  if (d.selector === "N") return "neutral";
  if (d.parkingBrakeOn) return "parkingBrake";
  return null;
}

export class StuckStartWatch {
  /** Seconds the pedal has been down at a standstill on a car that cannot move. */
  private heldS = 0;
  /** Seconds since the last thing we said, within the SAME episode. */
  private sinceSaidS = 0;
  /** Seconds the CURRENT blocker has been the current one (the settle clock). */
  private settleS = 0;
  /** The blocker seen last frame — changes restart the settle clock. */
  private lastReason: StuckStartReason | null = null;
  /** The reason we last spoke about. A NEW settled reason speaks without
   *  waiting out the repeat cooldown: it means the student just cleared the
   *  previous blocker and is owed the next step now, not in ten seconds. */
  private saidReason: StuckStartReason | null = null;
  /** Seconds the brake has been OFF at a standstill inside the P/N gate — what
   *  earns the right to count the NEXT press (LAW 1's discipline). */
  private brakeLiftS = 0;
  /** Was the brake down last frame? (rising-edge detection) */
  private brakeDown = false;
  /** May THIS brake press count as „I am asking the car to move"? */
  private brakeArmed = false;

  /**
   * Advance one frame. Returns a reason exactly on the frames where the
   * cockpit should speak — once when `STUCK_START_HINT_S` is crossed, again
   * whenever the blocker CHANGES and settles, and otherwise every
   * `STUCK_START_REPEAT_S` while the student keeps pressing — and null on
   * every other frame.
   */
  update(f: StuckStartFrame): StuckStartReason | null {
    const stopped = Math.abs(f.speedKmh) < REVERSE_ASSIST_STANDSTILL_KMH;
    // Stepped FIRST and on every frame, including the frames that end the
    // episode: the lift is accumulated while the pedal is OFF, which is
    // exactly when the episode is not running.
    const brakeAsking = this.stepBrakeArming(f, stopped);
    const pressing = f.throttlePedal > STUCK_START_PEDAL_ON || brakeAsking;
    const reason = stuckStartReason(f.driveline, f.stalled);
    if (!pressing || !stopped || reason === null) {
      this.resetEpisode();
      return null;
    }

    this.heldS += f.dtSec;
    if (reason !== this.lastReason) {
      this.lastReason = reason;
      this.settleS = 0;
    } else {
      this.settleS += f.dtSec;
    }
    if (this.saidReason !== null) this.sinceSaidS += f.dtSec;

    // A blocker the student is still moving through is not worth a sentence.
    if (this.settleS < STUCK_START_SETTLE_S) return null;
    if (this.saidReason === null) {
      if (this.heldS < STUCK_START_HINT_S) return null;
    } else if (reason === this.saidReason && this.sinceSaidS < STUCK_START_REPEAT_S) {
      return null;
    }
    this.saidReason = reason;
    this.sinceSaidS = 0;
    return reason;
  }

  /**
   * Is this frame's brake an ARMED press inside the P/N gate — i.e. the one
   * thing a held brake can mean when the gearbox is transmitting nothing?
   *
   * The gate closing (any selector but P/N, or an engine that is not running)
   * does NOT clear `brakeDown`: it records it. That single line is what makes
   * „roll to a stop in D, clutch, shift to N, keep standing on the pedal"
   * silent forever — when the gate opens the pedal is already down, so there
   * is no rising edge and the press can never be armed. Arming requires a foot
   * that genuinely left the pedal, at a standstill, inside the gate.
   */
  private stepBrakeArming(f: StuckStartFrame, stopped: boolean): boolean {
    const down = (f.brakePedal ?? 0) > STUCK_START_PEDAL_ON;
    const inGate =
      f.driveline.engineOn &&
      (f.driveline.selector === "P" || f.driveline.selector === "N");
    if (!inGate) {
      this.brakeLiftS = 0;
      this.brakeArmed = false;
      this.brakeDown = down; // a press spanning the gate stays unarmed
      return false;
    }
    if (!down) {
      this.brakeLiftS = stopped ? this.brakeLiftS + f.dtSec : 0;
      this.brakeArmed = false;
      this.brakeDown = false;
      return false;
    }
    if (!this.brakeDown) {
      this.brakeArmed = stopped && this.brakeLiftS >= REVERSE_ASSIST_LIFT_S;
    }
    this.brakeDown = true;
    this.brakeLiftS = 0;
    if (!stopped) this.brakeArmed = false; // it became a stopping input
    return this.brakeArmed;
  }

  /** End the episode — the scene calls this when the drive is not live. */
  reset(): void {
    this.resetEpisode();
    this.brakeLiftS = 0;
    this.brakeDown = false;
    this.brakeArmed = false;
  }

  /** End the SPEAKING episode without forgetting the pedal history — the
   *  internal path, taken on every frame nobody is asking for anything. */
  private resetEpisode(): void {
    this.heldS = 0;
    this.sinceSaidS = 0;
    this.settleS = 0;
    this.lastReason = null;
    this.saidReason = null;
  }

  /** Telemetry/test read: how long the current episode has run, s. */
  get heldSec(): number {
    return this.heldS;
  }
}
