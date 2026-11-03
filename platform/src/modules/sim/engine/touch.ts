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
 * ===========================================================================
 * 2026-11-01 — A SLIDING THUMB IS OBSERVED IN SAMPLES, NOT CROSSINGS.
 * ===========================================================================
 * sc-turn-left-oncoming:d0017a65, integrator rulings R7 / R8 / R9.
 *
 * The drive pad is a joystick: a thumb held below the middle brakes and the
 * middle 44 px command nothing, so a student brakes and lifts by SLIDING the
 * thumb, which the browser reports as `pointermove`. Browsers align
 * `pointermove` to the frame and coalesce it — one event per frame, carrying
 * the LAST digitizer sample's position and time — so a handler that reads only
 * the event sees one sample per frame, which is frame sampling again: a lift
 * or a press made and undone inside a frame is invisible, and the crossing
 * into the brake zone is stamped at the first sample AFTER it (round-2
 * verifier, F1: 0.12 s lifts armed the assist on 0.25–0.5 s frames).
 *
 * R7 — every sample the browser kept: `pointerSamples` hands back the
 * event's `getCoalescedEvents()` in order, each with its own `clientY` and
 * `timeStamp`, or the event itself where the list is empty or the method is
 * absent (not every browser or WebView implements it).
 *
 * R8 — a transition made by a SAMPLE happened somewhere after the previous
 * sample: `PadSampleClock.sample` stamps it as the interval [the previous
 * sample's time, this sample's] — the bound `pollPadPedals` already gives a
 * gamepad poll — so a lift is credited only what was observed of it (a lower
 * bound: release at the LATER end, the next press at the EARLIER end) and a
 * press likewise. A pointerdown / pointerup is a discrete event at its own
 * time and stays exact (`begin` / `end`) — so a press is exact when the
 * pointerdown MAKES it (the thumb put down inside the brake zone) and a release
 * when the pointerup makes it; a thumb put down in the neutral zone makes no
 * press, and the press it later slides into is a move (round 5, below). A
 * pointer the pad ADOPTS mid-slide
 * has no previous sample the pad saw: its first sample's interval is open
 * (−∞), which credits no lift before it.
 *
 * R9 — what this guarantees against a FALSE R: where the browser keeps
 * coalesced samples, every slid crossing is placed no earlier than what the
 * digitizer observed allows, so a lift is never over-credited — no lift
 * shorter than REVERSE_ASSIST_LIFT_S arms and no press shorter than
 * REVERSE_ASSIST_HOLD_S shifts, for every lift and press that spans a sample
 * (one briefer than a scan can fall between two samples unseen). Where
 * `getCoalescedEvents` is absent the slide is POLLED, like a gamepad: one
 * sample per event, conservative by the interval (one short lift or press is
 * never over-credited), but a lift and a press both made between two events
 * are not seen at all, so pumping near the frame period can read as one long
 * lift and one long press (ADR-017 «Update 2026-11-01»).
 *
 * ===========================================================================
 * 2026-11-01, ROUND 4 — A RESTING THUMB SENDS NOTHING (rulings R11–R13).
 * ===========================================================================
 * A digitizer scans at a fixed period P and the browser sends a sample only
 * when a scan saw a change, so a thumb resting still between two slides sends
 * no samples at all. R8's interval then reached back to the LAST sample of the
 * release slide, before the rest: a real 0.3 s lift ending in a 2 px rest
 * inside the middle was credited ≈ 0 s, and the ruled gesture slid that way
 * reached R in 9–10 of 40 phases (round-3 verifier F1). A press sample at T
 * after silence also says the scan at T − P saw NO change: the crossing came
 * after T − P.
 *
 * R11 — the pad learns P as the smallest POSITIVE spacing between two
 * consecutive samples INSIDE ONE coalesced list, for the session (never a
 * constant, never across events — across events a stamp may be a dispatch
 * time). Every spacing of one digitizer is a whole number of scans, so the
 * smallest seen is ≥ P and converges to it from above: using it can only
 * under-credit a lift — PROVIDED every sample in a list is a real scan (a
 * platform that appends a made-up, resampled sample can show a spacing below
 * P; round 5, R16) and the scan rate does not change during the session (a
 * digitizer that slows from 240 to 120 Hz keeps the faster P). A move-made
 * transition at sample time T is stamped [max(previous sample, T − P), T]
 * once P is known and the previous sample is a MOVE; after a pointerdown the
 * bound is not taken (the platform's touch slop can hold the first moves of a
 * touch back, so silence there does not prove the thumb was still — and this
 * has a cost, round 5, R15), and while P is unknown the previous sample.
 *
 * R12 — a coalesced sample whose stamp does not advance past the previous
 * sample's (a browser giving every coalesced sample the parent event's stamp:
 * the Pointer Events tests ask only that coalesced stamps never decrease) is
 * bounded by the last EARLIER distinct stamp — never the exact [T, T], which
 * over-credited the lift before it by up to a frame (round-3 verifier F2) —
 * and a list holding such a pair teaches no P at all.
 *
 * R13 — what this costs, said plainly. The bound against a false R rests on
 * two device facts: each coalesced sample carries its own scan time (else
 * R12), and the scan period does not change during the session. The gesture
 * side is bounded by ONE scan once P is learned — a slid crossing is seen up
 * to one scan late (so the slid +1-frame cell is bounded by one sample; the
 * ruled gesture is the +2-frame one) — but until P is learned, i.e. until a
 * coalesced list has held two distinct-time samples, a slid press after a
 * resting thumb is credited from the previous sample and the ruled gesture may
 * not reach R. That is the case on a device whose digitizer is no faster than
 * its frames (one sample per list, e.g. 60 Hz touch on a 60 Hz display: the
 * gesture reached R in 5–24 of 40 phases at 60 Hz in the round-4 probe, the
 * thumb resting 2–10 px inside the middle) and on
 * a browser that stamps a list alike. There the gesture made with the thumb
 * lifted off and put back down INSIDE THE BRAKE ZONE (the pointerdown is the
 * press: exact) and the keyboard are exact — not a thumb put back down in the
 * neutral zone and slid in, which round 5 found under-credited even once P is
 * learned (below; ADR-017 «Update 2026-11-01, round 4» and «…, round 5»).
 *
 * ===========================================================================
 * 2026-11-01, ROUND 5 — WHAT THE POINTERDOWN EXEMPTION COSTS (rulings
 * R15–R18). No timing code changed in round 5; these are its stated limits.
 * ===========================================================================
 * R15 — the exemption is KEPT. The ruled gesture made as «lift the thumb off
 * the brake (pointerup), put it back down just inside the NEUTRAL zone, rest,
 * slide into the brake» is credited only pointerdown − pointerup of lift,
 * because the first move after a pointerdown takes no T − P bound: with P
 * learned and a 120 Hz digitizer it reached R and moved the car in 9–10 of 40
 * phases with a 2 px rest and 23–24 of 40 with a 5 px rest, on all 8
 * cadences, whether the thumb was put back 0.02 or 0.2 s after the lift-off
 * (round-4 verifier F1). Taking the bound there would cure it (40/40, and 0
 * false R with no slop) — but a platform whose touch slop holds back the
 * moves within 8 px of a pointerdown would then credit those held-back moves
 * as lift: lifts of 0.24–0.2495 s armed in 245–980 of 980 sweeps at 0.5 px/ms
 * and up to 686 of 980 at 1 px/ms in the verifier's model. A false R is the
 * dangerous failure and a gesture that must be repeated the safe one, so the
 * exemption stays until the phone shows whether it delivers a touch's first
 * moves (R18); pinned by engine/__tests__/reverseAssist-cadence.test.ts
 * «R15 / R19» and components/sim/__tests__/pedalStampsOverlay.test.tsx.
 * R16 — the premise «the smallest in-list spacing is ≥ the scan period»
 * fails if the platform appends RESAMPLED samples to the list: in the
 * verifier's Android-style model (a sample interpolated at frame − 5 ms),
 * lifts of 0.245–0.2495 s armed in 1–4 of 980 sweeps. Chrome on Android
 * dispatches touch unbuffered by default and its coalesced events are the
 * raw ones, so this is accepted as the platform class of the dispatch-latency
 * tie, not a defect of the rule; a scan-rate change mid-session is an
 * assumption. The phone cell records which is true (R18).
 */

/** One pointer sample: where the thumb was and when (the event's clock). */
export interface PointerSample {
  readonly clientY: number;
  readonly timeStamp: number;
}

/** The shape `pointerSamples` reads — a DOM PointerEvent, or a stand-in. */
export interface CoalescingPointerEvent extends PointerSample {
  getCoalescedEvents?: () => readonly PointerSample[];
}

/**
 * R7: every sample a pointer event carries, oldest first — its coalesced
 * list when the browser keeps one, else the event itself.
 */
export function pointerSamples(e: CoalescingPointerEvent): readonly PointerSample[] {
  const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
  if (list && list.length > 0) return list;
  return [e];
}

/** A pad transition's time on the event clock: `[sinceMs, atMs]`. Both are
 *  absent when the event carried no usable time (SimInput then stamps «now»). */
export interface PadSampleStamp {
  readonly atMs?: number;
  /** The earliest instant the change can have happened (= atMs for a
   *  discrete press / release; the previous sample for a slide). */
  readonly sinceMs?: number;
}

const usableMs = (ms: unknown): ms is number => typeof ms === "number" && Number.isFinite(ms);

/**
 * R8 / R11 / R12: the sample clock of ONE pad — the previous sample of its
 * current gesture, and the digitizer's scan period P learned for the session —
 * so a transition made by a move is stamped as the interval it can have
 * happened in, and never a millisecond earlier than what was observed allows.
 */
export class PadSampleClock {
  /** The latest sample time of the current gesture (null: no gesture, or an
   *  adopted pointer before its first sample). */
  private lastMs: number | null = null;
  /** The last stamp of the current gesture strictly EARLIER than `lastMs`
   *  (R12: what a sample whose stamp does not advance is bounded by). */
  private prevDistinctMs: number | null = null;
  /** Whether `lastMs` is a MOVE sample (not the gesture's pointerdown). */
  private lastIsMove = false;
  /** R11: the smallest positive spacing ever seen between two consecutive
   *  samples INSIDE ONE coalesced list, ms — ≥ the digitizer's scan period P
   *  and converging to it from above. +∞ until a list has held two
   *  distinct-time samples. Kept for the session: `end()` never resets it. */
  private periodMs = Number.POSITIVE_INFINITY;

  /** R11: the scan period learned so far, ms (+∞ while unknown). */
  get learnedPeriodMs(): number {
    return this.periodMs;
  }

  /** A discrete pointerdown at `atMs`: exact, and the gesture's first sample. */
  begin(atMs: number | undefined): PadSampleStamp {
    this.prevDistinctMs = null;
    this.lastIsMove = false;
    if (!usableMs(atMs)) {
      this.lastMs = null;
      return {};
    }
    this.lastMs = atMs;
    return { atMs, sinceMs: atMs };
  }

  /**
   * Every sample of ONE pointer event, oldest first (its coalesced list, or
   * the event alone — `pointerSamples`): one stamp per sample, in order.
   * Only spacings between two samples of THIS list teach P (R11), and only
   * when every stamp in it advances (R12: a list with an equal or a
   * backwards pair is not on the digitizer's clock, so it teaches nothing).
   */
  sampleList(samples: readonly PointerSample[]): PadSampleStamp[] {
    let onScanClock = true;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!.timeStamp;
      const b = samples[i]!.timeStamp;
      if (!usableMs(a) || !usableMs(b) || !(b > a)) onScanClock = false;
    }
    // The spacing taught is the list's OWN: this sample against the one
    // before it in the same list — never against a sample of an earlier event.
    return samples.map((s, i) =>
      this.sampleAt(s.timeStamp, onScanClock && i > 0 ? s.timeStamp - samples[i - 1]!.timeStamp : null),
    );
  }

  /** The gesture ended (pointerup / cancel / lost capture / hide). The
   *  learned scan period is the device's, not the gesture's: it stays. */
  end(): void {
    this.lastMs = null;
    this.prevDistinctMs = null;
    this.lastIsMove = false;
  }

  /**
   * A move sample at `atMs`. `listGapMs`: its spacing from the sample before
   * it in the same coalesced list, when that list is on the scan clock (else
   * null) — the only spacing that teaches P.
   *
   * - No previous sample (an ADOPTED pointer): the interval is open (−∞).
   * - R12, a stamp that does not advance past the previous sample's: bounded
   *   by the last EARLIER distinct stamp (−∞ if none) — never the exact
   *   [T, T], which over-credits the lift before it by up to a frame when a
   *   browser gives every coalesced sample the parent event's stamp.
   * - Otherwise round 3's interval, the previous sample — and R11: once P is
   *   known and the previous sample is a move, max(previous, T − P). The
   *   digitizer reports a scan only when it saw a change, so a sample at T
   *   after silence also says the scan at T − P saw none: the crossing came
   *   after T − P. P is never below the true period while every listed
   *   sample is a real scan and the scan rate holds (R16), so this can only
   *   under-credit a lift. After a pointerdown the bound is not taken: the
   *   first moves of a touch can be held back by the platform's touch slop,
   *   so silence there does not prove the thumb was still (R15: kept, at the
   *   cost of a re-touch in neutral then a slide being under-credited).
   */
  private sampleAt(atMs: number | undefined, listGapMs: number | null): PadSampleStamp {
    if (!usableMs(atMs)) return {};
    if (this.lastMs === null) {
      this.lastMs = atMs;
      this.prevDistinctMs = null;
      this.lastIsMove = true;
      return { atMs, sinceMs: Number.NEGATIVE_INFINITY };
    }
    if (!(atMs > this.lastMs)) {
      const bound = this.prevDistinctMs ?? Number.NEGATIVE_INFINITY;
      this.lastIsMove = true;
      return { atMs, sinceMs: Math.min(bound, atMs) };
    }
    if (listGapMs !== null && listGapMs > 0) this.periodMs = Math.min(this.periodMs, listGapMs);
    let since = this.lastMs;
    if (this.lastIsMove && Number.isFinite(this.periodMs)) since = Math.max(since, atMs - this.periodMs);
    this.prevDistinctMs = this.lastMs;
    this.lastMs = atMs;
    this.lastIsMove = true;
    return { atMs, sinceMs: since };
  }
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

  /**
   * R4 (2026-10-19, sc-turn-left-oncoming:d0017a65): told of every pedal
   * write, with the pointer event's own `timeStamp` when the overlay passes
   * one, so SimInput can stamp the brake / throttle CHANNEL transitions at the
   * input rather than at the next frame that happens to read them
   * (engine/pedalTiming.ts). Set by SimInput.attachTouch.
   *
   * `sinceMs` (R8, 2026-11-01): when the write comes from a pointer SAMPLE
   * rather than a discrete event (a slide of the drive pad's thumb), the
   * transition happened somewhere after the previous sample — the overlay
   * passes that sample's time and the stamp becomes the interval
   * [sinceMs, atMs] (`PadSampleClock` below). Omitted for a press / release.
   */
  onPedalChange: ((atMs?: number, sinceMs?: number) => void) | null = null;

  /** The throttle axis while a finger owns it, else null. */
  get throttleAxis(): number | null {
    return this.throttleActive ? this.throttleValue : null;
  }

  /** The brake axis while a finger owns it, else null. */
  get brakeAxis(): number | null {
    return this.brakeActive ? this.brakeValue : null;
  }

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

  /** `atMs`: the pointer event's `timeStamp` (R4) — omitted off an event.
   *  `sinceMs`: the previous pointer sample's, when this write is a sample
   *  of a moving thumb (R8) — omitted for a discrete press / release. */
  setThrottle(value: number, atMs?: number, sinceMs?: number): void {
    this.throttleActive = true;
    this.throttleValue = Math.min(1, Math.max(0, value));
    this.onPedalChange?.(atMs, sinceMs);
  }

  releaseThrottle(atMs?: number, sinceMs?: number): void {
    this.throttleActive = false;
    this.throttleValue = 0;
    this.onPedalChange?.(atMs, sinceMs);
  }

  setBrake(value: number, atMs?: number, sinceMs?: number): void {
    this.brakeActive = true;
    this.brakeValue = Math.min(1, Math.max(0, value));
    this.onPedalChange?.(atMs, sinceMs);
  }

  releaseBrake(atMs?: number, sinceMs?: number): void {
    this.brakeActive = false;
    this.brakeValue = 0;
    this.onPedalChange?.(atMs, sinceMs);
  }

  /** Overlay hidden/unmounted (pause, quiz, teach card, keyboard takeover) —
   *  nothing may stay held down. */
  releaseAll(atMs?: number): void {
    this.releaseSteer();
    this.releaseThrottle(atMs);
    this.releaseBrake(atMs);
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
