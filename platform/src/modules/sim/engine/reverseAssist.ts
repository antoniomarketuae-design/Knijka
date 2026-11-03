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
 * ===========================================================================
 * 2026-08-19 — NO SWEEP FRAME IS EVIDENCE ABOUT THIS FILE. Read this before
 * acting on any audit finding routed here.
 * ===========================================================================
 * Doc 88's sweep routed two findings at this machine — sc-ed-reverse-line and
 * sc-ed-poligon-chain, „the gear indicator shows D while the task chip demands
 * reverse" — and both rest on drives that COULD NOT ENTER REVERSE by
 * construction. `tools/mobile/lesson-audit.mjs` sends exactly three keys in
 * its whole run: KeyW, KeyS and Escape. There is no `[` / `]`, no touch gear
 * sheet, no cockpit lever; and its `brake(on, kmh)` helper (:983-991) returns
 * early for ANY press at kmh ≤ 1 — which is precisely the standstill press
 * LAW 1 requires, and 1 ≥ REVERSE_ASSIST_STANDSTILL_KMH, so the refused band
 * covers this machine's whole standstill window with nothing left over.
 *
 * That refusal is correct and must not be deleted: the gesture it blocks is
 * the one that drove a car backwards into traffic at 16.8 км/ч. What is
 * missing from the harness is a DELIBERATE reverse gesture beside it — stop,
 * lift for > REVERSE_ASSIST_LIFT_S, press — issued only where the lesson asks
 * for R. Until it exists, every reverse drill in the sweep is unmeasured
 * rather than broken, and the four parking-depth rows nobody could pass are
 * unexplained rather than explained by this file.
 *
 * All of it is asserted, against the harness file itself, in
 * `__tests__/reverseAssist-audit-harness.test.ts` — including the mutation
 * that shows the same frames DO reach R once the standstill press is allowed
 * through, so the claim is about the instrument and not about a dead machine.
 * The day the harness gains a gear key or loosens the guard, that file fails
 * and the two findings become admissible again.
 *
 * Pure state machine — no DOM, no React, fully unit-testable in Node. The
 * live-scene glue (LessonScene's `reverseAssistFrameStart`, stepped at the
 * START of every render frame, before the frame's physics reads — see
 * 2026-10-19 below) feeds it the frame's FUNCTIONAL pedal state with the
 * source-timed transitions of its brake, and executes emitted commands
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
import { PedalLatch, spanReaches, TimedPedal, type PedalTiming, type PlacedStamp } from "./pedalTiming";

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
 * (devrig/driveScript.ts STANDSTILL_BRAKE_OFF_S = 0.12 s).
 *
 * CORRECTION 2026-10-18 / 2026-10-19 (sc-turn-left-oncoming:d0017a65): that
 * last sentence was true only at 60 Hz. Until 2026-10-18 the lift was credited
 * the WHOLE frame delta of every update that saw the pedal up, so on frames of
 * 0.25 s or longer (a 4 fps phone, a stall, a GC hitch) the rig's 0.12 s off
 * phase — sampled by one frame — counted as a lift of 0.25–0.5 s and DID arm:
 * measured at 219ac1e, 40/40 sampling phases put the car in R at 4 fps, 0.37 s
 * and 0.5 s frames, and the re-pressed brake drove it backwards. The round-1
 * repair (the span between two frames that both saw the lift) still armed it
 * on every frame from 0.26 to 0.45 s (verifier, F2): a frame's reads see only
 * its end state, so the rig's pad looked lifted from one frame to the next.
 * Since 2026-10-19 the lift is timed AT THE INPUT (engine/pedalTiming.ts); the
 * rig's step-keyed pad is stamped at the physics step it applies its change
 * at, so its 0.12 s lift is 0.12 s on every display and never arms.
 */
export const REVERSE_ASSIST_LIFT_S = 0.25;
/** Silence window (s) after any MANUAL selector shift ([ / ], touch sheet,
 *  cockpit hotspot) — the assist never fights explicit input. */
export const REVERSE_ASSIST_SUPPRESS_S = 2;
/** Ramped pedal value above which it counts as held (the keyboard ramps
 *  cross this ~25 ms after key-down — see input.ts BRAKE_ATTACK_S). */
export const REVERSE_ASSIST_PEDAL_ON = 0.1;

/**
 * ===========================================================================
 * 2026-10-19 — THE LIFT AND THE PRESS ARE TIMED AT THE INPUT. Read this, and
 * engine/pedalTiming.ts, before adding a clock here.
 * ===========================================================================
 * sc-turn-left-oncoming:d0017a65 (integrator rulings R1–R6, 2026-10-18/19).
 *
 * THE DEFECT. This machine is stepped once per RENDER frame with one pedal
 * sample — the frame's last `rawBrake` — and it used to add the whole frame
 * delta to whatever that sample showed: `liftS += dt` on a lifted frame,
 * `holdS += dt` on a pressed one, the press's own rising-edge frame included.
 * On a slow frame one sample of a 0.05–0.24 s lift at rest counted as a quarter
 * second of lift (LAW 1 armed) and one sample of the re-press as 0.35 s of
 * hold: D → N → R, labelled «assist», and the still-held brake became the
 * reverse accelerator. Measured at 219ac1e, a 0.12 s touch lift at rest: 0/40
 * phases R at 60/30/13/10/5 fps, 20/40 at 4 fps, 13/40 at 0.37 s frames, 10/40
 * at 0.5 s. One drive, a different car by display (ADR-014).
 *
 * ROUND 1 (2026-10-18) credited only the span between two updates that both
 * saw a state. That is still a rule about frames, and the verifier refuted it:
 * a frame's reads see only the input's state at the frame's end, so a lift
 * between two reads is invisible and a press can be counted whole — the rig's
 * 0.22 s on / 0.12 s off pulse reached R on every frame from 0.26 to 0.45 s,
 * and random touch pumping with every press and lift under 0.24 s reached R in
 * 460–627 of 960 drives.
 *
 * THE RULE NOW (R4). The ruled gesture is a lift and a press of the STUDENT'S
 * INPUT, so their lengths are times on the input's own clock. Every source
 * stamps every brake transition itself — touch and mouse pads with the
 * pointer event's timeStamp on a press and a release, the phone's drive pad
 * SLID by the thumb with every coalesced sample of the move at its own time,
 * each transition bounded by the sample before (round 3, R7 / R8), the
 * keyboard with the RAW key's keydown / keyup timeStamp (not the ramp's
 * output), a gamepad with the poll that saw it (bounded by the poll before),
 * the drive rig's step-keyed pad with the physics step it applies at — and
 * GatedSimInput keeps them as the FUNCTIONAL brake's log. This machine reads
 * the log since its last update: a lift is release → the next press, a press
 * is press → now, each a LOWER bound of the span the source observed
 * (engine/pedalTiming.ts says what each source observes). So for the pointer
 * press / release (on the drive pad, a press the pointerdown itself makes:
 * the thumb put down inside the brake zone), the keys and the rig's pad a
 * lift shorter than
 * REVERSE_ASSIST_LIFT_S never arms and a press shorter than
 * REVERSE_ASSIST_HOLD_S never shifts, on any frame length, jittered or
 * stalling; for a coalesced slide the same holds for every lift and press that
 * spans a sample (its crossings bounded by the scan period the pad learns from
 * its own coalesced lists, round 4 R11 / R12 — engine/touch.ts), while a slid
 * lift ending in a resting thumb can be UNDER-credited until that period is
 * learned, and a lift ended by putting the thumb back down in the NEUTRAL
 * zone and sliding in is credited only pointerdown − pointerup even once it is
 * (the pointerdown exemption, kept: round 5, R15 — the ruled gesture made that
 * way may not reach R); a POLLED source — a human's gamepad, a slide in a browser without
 * getCoalescedEvents — never over-credits one short lift or press, but can
 * miss a lift and a press both made between two polls (the stated limit,
 * ADR-017 «Update 2026-11-01»). Every event source is judged on the events
 * dispatched when the machine is stepped: a release still queued in the
 * browser is not yet known, so a press ending within that dispatch latency of
 * HOLD_S can still shift (the second stated limit, same ADR). The clock is this machine's own input
 * clock — the sum of the frame deltas it is stepped with — so a paused lesson,
 * which does not step it, accrues nothing, and a stall credits at most 0.5 s.
 *
 * ONE PRESS STILL MOVES THE CAR (R5, the 2026-08-11 ruling). The glue steps
 * this machine at the START of the frame, before the frame's physics reads, so
 * the frame on which a held press reaches REVERSE_ASSIST_HOLD_S is the frame
 * whose physics steps are handed reverse throttle (ReversePedalMapper, source
 * «assist»). It used to run after them, and with round 1's later shift a press
 * that ended before the next frame's reads left the car standing in R.
 *
 * …AND IT DECIDES ON BOTH PEDALS AS OF THAT INSTANT (R20, 2026-11-01 round 6).
 * Before the frame's reads, the last read()'s pedals are the PREVIOUS frame's.
 * Rounds 2–5 read the brake from its source-timed log but left the both-pedals
 * disarm on that stale throttle: after a render stall, W held one frame before
 * it read 0.02 (under PEDAL_ON) while S, pressed 0.05 s into a 0.45 s stall,
 * had already reached HOLD_S on its own key time — D → N → R with both pedals
 * down, at 60 Hz and 144 Hz alike (landing integrator and merge verifier). The
 * throttle is now the other pedal control's own source-timed log
 * (`throttleTiming`), read through a latch (engine/pedalTiming.ts PedalLatch:
 * down if it was down at ANY instant since the previous update), so a press the
 * throttle overlapped anywhere in a stall is disarmed by the update that sees
 * them, whatever the frame rate. The latch can disarm MORE than the overlap its
 * log records (a throttle lifted just before the brake went down inside one
 * interval also disarms it) — the safe side; it never disarms less than its
 * log says.
 *
 * …WHATEVER LAW 2 SAYS OF THAT CONTROL (R24, 2026-11-02 round 7). Round 6's log
 * left out a control while LAW 2 disowned it, and the disown is the LAST
 * read()'s verdict on the keyboard ramp — a frame old at the frame's start. So
 * after a hand-worked R → D shift with W held, W lifted, S pressed after a real
 * lift and W pressed again before any read saw its ramp fall to PEDAL_ON, W was
 * still «disowned» and not in the log: D → N → R with both keys down (60 Hz
 * with a 0.15–0.3 s stall 20 of 20 phases; fixed 5 fps 13 of 20; the round-6
 * verifier). W pressed again ALONE in such a stall shifted too. Two controls
 * down is never the reverse gesture, whatever role LAW 2 gives them, so the
 * log is the student's other pedal control as he holds it (LessonScene
 * GatedSimInput.refreshFunctionalBrake). LAW 2's own job is unchanged.
 *
 * WHAT IT COSTS, PLAINLY. A lift must really last REVERSE_ASSIST_LIFT_S on
 * every display (0.25 s, or longer on a stalling one, where a stall credits at
 * most 0.5 s). A press shifts on the first frame that STARTS at least
 * REVERSE_ASSIST_HOLD_S after it began, so a press of HOLD_S + one frame is
 * sure to shift and move the car on that press: 60 Hz 0.367 s, 0.37 s frames
 * 0.72 s, 0.5 s frames 0.85 s; the founder's gesture at HOLD_S + two frames has
 * a frame to spare. The keyboard's lift and press are now the KEY's: the brake
 * ramp no longer adds its 0.18 s release tail to the lift a key needs, nor its
 * 25 ms attack to the press.
 *
 * Without a log (`brakeTiming` omitted — tools/mobile's simulators, the older
 * unit tests) the machine is a polled source whose polls are its own updates:
 * the round-1 observed span, as the degenerate case of the same rule.
 *
 * `engine/stuckStart.ts` borrows LAW 1's lift for its brake channel through
 * the same TimedPedal on the same log, so the hint and the assist agree on what
 * a lift is (R3).
 */
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
   *  (both pedals down is ambiguous input; the assist stays out of it).
   *  Read only when `throttleTiming` is omitted: one sample per update. */
  throttlePedal: number;
  /** Wall-clock frame delta, s (the caller's clamped render dt). */
  dtSec: number;
  /**
   * The FUNCTIONAL brake's source-timed transitions (GatedSimInput.brakeTiming,
   * engine/pedalTiming.ts). When present the pedal is read from it and
   * `brakePedal` is not; when omitted, `brakePedal` is one sample per update.
   */
  brakeTiming?: PedalTiming | null;
  /**
   * The other pedal control's source-timed transitions (GatedSimInput.
   * throttleTiming, 2026-11-01 round 6, R20): the control that is not the
   * functional brake's own channel, as the student holds it — NOT gated by
   * LAW 2's disown (R24, round 7). When present the both-pedals disarm reads
   * the throttle from it — down if it was down at any instant since the
   * previous update (engine/pedalTiming.ts PedalLatch) — and `throttlePedal`
   * is not read, so the throttle the disarm sees is as of this update, exactly
   * as the brake is.
   */
  throttleTiming?: PedalTiming | null;
}

export class ReverseAssist {
  /** The functional brake as this machine reads it: its own input clock, the
   *  edges since its last update, the standstill lift behind the press. */
  private readonly pedal = new TimedPedal();
  /** …and the other pedal control, as the student holds it whatever LAW 2's disown says (R24), for the both-pedals disarm (R20). */
  private readonly throttle = new PedalLatch();
  /** Where THIS armed press's hold is counted from — the press's own stamp,
   *  or the update that resumed it (a gate reopened) — null when none. */
  private holdFrom: PlacedStamp | null = null;
  private suppressS = 0;
  /** LAW 1: may THIS press toggle direction? Set once, at the press, and
   *  cleared by anything that makes the press mean something else. */
  private armed = false;

  /** The arm readout, read off the machine by the audit tools
   *  (tools/mobile/lib/disarm-sim.mjs, path-follow.test.mjs T6.7b) and by
   *  telemetry: the hold of the current armed press as of the last update, s. */
  get holdS(): number {
    if (this.holdFrom === null) return 0;
    const now = this.pedal.now(this.holdFrom.clock);
    return now === null ? 0 : Math.max(0, now - this.holdFrom.at);
  }

  /** …and the lift at a standstill so far, s. */
  get liftS(): number {
    return this.pedal.liftS;
  }

  /** A MANUAL selector shift happened (any non-assist gearUp/gearDown —
   *  keys [ / ], the touch gear sheet, a cockpit hotspot): stay silent for
   *  REVERSE_ASSIST_SUPPRESS_S and drop any accumulated hold. */
  noteManualShift(): void {
    this.suppressS = REVERSE_ASSIST_SUPPRESS_S;
    this.holdFrom = null;
    this.armed = false;
    this.pedal.floorNow();
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
   * Both lengths are timed at the input (see the 2026-10-19 note above).
   */
  update(f: ReverseAssistFrame): ReverseAssistCommand | null {
    const stopped = Math.abs(f.speedKmh) < REVERSE_ASSIST_STANDSTILL_KMH;
    this.pedal.step({
      dtSec: f.dtSec,
      stopped,
      sampledDown: f.brakePedal > REVERSE_ASSIST_PEDAL_ON,
      timing: f.brakeTiming,
    });
    const down = this.pedal.down;
    // Stepped on EVERY update, the silence included, so its cursor is never
    // behind: was the throttle down at any instant since the last update (R20)?
    const throttleDown = this.throttle.step(f.throttleTiming, f.throttlePedal > REVERSE_ASSIST_PEDAL_ON);

    if (this.suppressS > 0) {
      this.suppressS = Math.max(0, this.suppressS - f.dtSec);
      // No lift counts time spent in the silence, and a press spanning it
      // stays unarmed (it has no press edge after the silence).
      this.pedal.floorNow();
      this.holdFrom = null;
      this.armed = false;
      return null;
    }

    if (this.pedal.releasedThisUpdate || !down) {
      // Pedal off (or off and on again within this frame): whatever press was
      // armed is over. Time spent lifted AT A STANDSTILL is what earns the
      // right to toggle on the next press; lifting it while rolling does not.
      this.holdFrom = null;
      this.armed = false;
    }
    if (!down) return null;

    if (this.pedal.pressedThisUpdate) {
      // The press began since the last update — the one moment it can be
      // armed, on the lift that really preceded it.
      this.armed = stopped && spanReaches(this.pedal.pressLiftS, REVERSE_ASSIST_LIFT_S);
      this.holdFrom = this.armed ? this.pedal.pressStamp : null;
    }

    // Moving, or both pedals down: this press is not (or is no longer) an
    // unambiguous request for the other direction. Disarm — a press that has
    // once meant "stop the car" must not become a shift when the car stops.
    if (!stopped || throttleDown) {
      this.armed = false;
      this.holdFrom = null;
      return null;
    }
    if (!this.armed || (f.selector !== "D" && f.selector !== "R")) {
      this.holdFrom = null;
      return null;
    }

    // Counted from the press's own instant — or, if a gate interrupted the
    // count, from the first update it resumed at (only time watched counts).
    const clock = this.pedal.pressStamp?.clock ?? "input";
    if (this.holdFrom === null) {
      const now = this.pedal.now(clock);
      if (now === null) return null;
      this.holdFrom = { clock, at: now, earliest: now };
    }
    if (!spanReaches(this.holdS, REVERSE_ASSIST_HOLD_S)) return null;
    this.holdFrom = null;
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
