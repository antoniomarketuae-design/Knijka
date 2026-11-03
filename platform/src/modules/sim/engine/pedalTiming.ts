/**
 * ===========================================================================
 * 2026-10-19 — A PEDAL GESTURE IS TIMED AT THE INPUT, NOT BY THE FRAME.
 * ===========================================================================
 * sc-turn-left-oncoming:d0017a65 (integrator rulings R4 / R5, 2026-10-19).
 *
 * LAW 1's lift and the assist's hold (engine/reverseAssist.ts) are lengths of
 * the STUDENT'S INPUT: «lift the foot for a quarter second, then press for
 * 0.35 s». They used to be measured by the render frame: one pedal sample per
 * frame, credited the frame's whole delta (until 2026-10-18), then the span
 * between two frames that both saw the state (round 1). Both are rules about
 * frames. A frame's reads see only the input's state at the frame's END, so a
 * short lift between two reads was invisible and a short press could be
 * counted whole: on 0.26–0.45 s frames the drive rig's 0.12 s lift armed the
 * assist and a 0.0–0.2 s press shifted the car to R (verifier, round 1, F2/F3).
 *
 * So every transition of the brake is now recorded by the SOURCE that made it,
 * with its own time, and the machines measure the lift (release → the next
 * press) and the press (press → now) from those times:
 *
 *   touch / mouse pads  a pointerdown / pointerup: the event's `timeStamp`
 *                       — a discrete event at its own time       (exact)
 *                       (on the drive pad a press is the pointerdown's only
 *                       when the thumb is put down INSIDE the brake zone;
 *                       put down in the neutral zone, the press is a slide)
 *   the phone's drive   a SLIDE of the thumb (round 3, R7 / R8, 2026-11-01):
 *   pad, slid           every coalesced sample of a pointermove at its own
 *                       timeStamp, a transition stamped [earliest, at = the
 *                       sample that saw it]: earliest = the previous sample,
 *                       or — round 4, R11 — max(previous, at − P) once the
 *                       pad has learned the scan period P from its own
 *                       coalesced lists and the previous sample is a move
 *                       (never the first move after a pointerdown: round 5,
 *                       R15 — touch slop can hold those moves back); a
 *                       stamp that does not advance is bounded by the last
 *                       earlier distinct one (R12)  (bounded below by what
 *                       the digitizer observed); in a browser with no
 *                       getCoalescedEvents, one sample per event
 *                                                     (polled, like a gamepad)
 *   keyboard            the RAW key's keydown / keyup timeStamp — the pedal
 *                       the ramp makes of it is not the press   (exact)
 *   gamepad (a human)   the poll that saw the change; and because a poll only
 *                       says the change happened SINCE the previous poll, the
 *                       edge carries both: [earliest = the poll before, at =
 *                       the poll that saw it]                    (bounded)
 *   the drive rig's     the physics step it applies the change at
 *   step-keyed pad      (ADR-017), on the physics step clock    (exact)
 *
 * THE CLOCK each machine measures on is its OWN «input clock»: the sum of the
 * clamped frame deltas it is stepped with (LessonScene: `sessionClockAdvance`,
 * the same increments the session clock is advanced by). A paused lesson does
 * not step the machines, so a pause accrues nothing; a stalled frame credits
 * at most 0.5 s however long it lasted. An event stamped on the browser's
 * clock (performance.now) inside the interval between two updates is placed on
 * that interval by its distance from the update's own `nowMs`, capped at the
 * interval's credited length — so the placement never stretches a span: two
 * events 0.12 s apart are 0.12 s apart on the input clock, or closer (stall).
 * Step-keyed edges are measured on the step clock (steps × FIXED_DT) instead;
 * a span with one end on each clock is credited NOTHING (no source mixes them).
 *
 * CONSERVATIVE BY CONSTRUCTION — FOR WHAT WAS OBSERVED: a lift is credited
 * `press.earliest − release.at` and a press `now − press.at`. Both are lower
 * bounds of the span the source OBSERVED. For the exact sources (pointer
 * press / release, keys, the rig's pad) that is the true span, so a lift
 * shorter than REVERSE_ASSIST_LIFT_S never arms and a press shorter than
 * REVERSE_ASSIST_HOLD_S never shifts — on any frame length, jittered or
 * stalling. A slide with its coalesced samples: every crossing is placed no
 * earlier than the digitizer's observations allow, so the same holds for every
 * lift and press that spans a sample — provided each coalesced sample carries
 * its own scan time (a list stamped alike is R12's case), every sample in a
 * list is a real scan (a platform that appends a resampled sample can teach a
 * period below the true one: round 5, R16) and the scan period does not
 * change in the session. What a slide can lose is the OTHER side: a lift
 * ending in a resting thumb is under-credited by up to one scan period once P
 * is learned, and by up to the whole rest while it is unknown (no list has yet
 * held two distinct-time samples), so there the ruled gesture slid with a
 * resting thumb may not reach R; and a lift ended by putting the thumb back
 * down in the NEUTRAL zone and sliding in is credited only pointerdown −
 * pointerup, P learned or not (the pointerdown exemption, kept: round 5,
 * R15). The gesture made with the thumb put back down INSIDE the brake zone
 * (the pointerdown is the press) and the keys stay exact (ADR-017 «Update
 * 2026-11-01, round 4» and «…, round 5»).
 * A POLLED source (a human's gamepad; a slide in a browser without
 * getCoalescedEvents) sees one state per poll: one short lift or press is
 * never over-credited and never arms or shifts, but a lift and a press both
 * made between two polls are invisible, so pumping near the poll period can
 * read as one long lift and one long press — the stated limit (ADR-017
 * «Update 2026-11-01»). And for EVERY event source, a press is credited up to
 * the update on the evidence dispatched by then: a release the browser has
 * stamped but not yet dispatched is not known, so a press that ended within
 * that dispatch latency of HOLD_S can still shift (the second stated limit).
 *
 * Without a log (`timing` omitted — the audit tools' simulators, the older
 * unit tests) a machine behaves as a polled source whose polls are its own
 * updates: release at the first update that sees the pedal up, press between
 * the last update that saw it up and the first that sees it down. That is the
 * round-1 «observed span», kept as the degenerate case of the same rule.
 *
 * Pure TS, no DOM.
 */

/** One transition of a pedal channel, stamped by the source that made it. */
export interface PedalStamp {
  /** Input clock, ms (performance.now, or SimInput's injected clock): the
   *  LATEST instant the transition can have happened. */
  readonly atMs: number;
  /** …and the EARLIEST (= atMs for an event; the previous poll for a poll). */
  readonly earliestMs: number;
  /** Set only by a step-keyed source: the physics-step time (s, steps ×
   *  FIXED_DT) the change applies at. Exact; supersedes the two above. */
  readonly stepS?: number;
}

export interface PedalEdge extends PedalStamp {
  /** The channel's state AFTER the transition. */
  readonly down: boolean;
}

/** What a machine is handed each update to read the log. */
export interface PedalTiming {
  readonly log: PedalEdgeLog;
  /** The input clock at this update, ms (same clock as the stamps). */
  readonly nowMs: number;
  /** The physics-step clock at this update, s — the steps taken so far ×
   *  FIXED_DT — when the scene has one (LessonScene does). */
  readonly stepS?: number | null;
}

/**
 * The transitions of ONE channel (LessonScene: the FUNCTIONAL brake), kept for
 * several readers — each reads the edges since its own cursor, so the assist
 * (stepped at a frame's start) and the stuck-start watch (at its end) both see
 * every edge. A bounded ring: a reader that falls behind it is told so.
 */
export class PedalEdgeLog {
  static readonly CAPACITY = 256;
  private readonly ring: PedalEdge[] = [];
  /** Sequence number of ring[0]. */
  private head = 0;
  private state = false;

  push(edge: PedalEdge): void {
    if (edge.down === this.state) return;
    this.state = edge.down;
    this.ring.push(edge);
    if (this.ring.length > PedalEdgeLog.CAPACITY) {
      this.ring.shift();
      this.head++;
    }
  }

  /** The channel's state now (after every logged edge). */
  get down(): boolean {
    return this.state;
  }

  /** Sequence number the NEXT edge will get. */
  get seq(): number {
    return this.head + this.ring.length;
  }

  /** Every edge from sequence number `seq` on; `lost` when some fell out of
   *  the ring before they were read. */
  since(seq: number): { edges: readonly PedalEdge[]; lost: boolean } {
    if (seq < this.head) return { edges: this.ring.slice(), lost: true };
    return { edges: this.ring.slice(Math.min(seq - this.head, this.ring.length)), lost: false };
  }
}

export type PedalClock = "input" | "step";

/**
 * Float noise on a clock that is a running SUM of frame deltas: 6.35 − 6.10
 * is 0.2499999999999991 in binary floating point. A span compared with a
 * threshold is therefore allowed this nanosecond of noise — it is arithmetic,
 * not tolerance: no gesture is a nanosecond long.
 */
export const PEDAL_CLOCK_EPS_S = 1e-9;

/** Has `spanS` reached `thresholdS` (within the clock's float noise)? */
export function spanReaches(spanS: number, thresholdS: number): boolean {
  return spanS >= thresholdS - PEDAL_CLOCK_EPS_S;
}

/** A transition placed on one of the two clocks a machine measures on, s. */
export interface PlacedStamp {
  readonly clock: PedalClock;
  readonly at: number;
  readonly earliest: number;
}

export interface TimedPedalStep {
  /** The update's credited delta, s (the caller's clamped frame dt). */
  dtSec: number;
  /** Is the car at a standstill at this update? */
  stopped: boolean;
  /** The pedal as one sample at this update — read only without `timing`. */
  sampledDown: boolean;
  /** The source-timed log — when present, the pedal is read from it. */
  timing?: PedalTiming | null;
}

/** Update anchors kept to place a stamp that predates the latest interval. */
const ANCHORS = 4;

/**
 * One machine's view of one pedal: its input clock, the edges it has read, the
 * standstill it has observed, and the lift that preceded the current press.
 * `engine/reverseAssist.ts` (LAW 1 + the hold) and `engine/stuckStart.ts` (the
 * P/N hint's armed brake) each own one, on the same log, so the assist and the
 * hint agree on what a lift is (integrator ruling R3).
 */
export class TimedPedal {
  /** The input clock: the sum of every dtSec this pedal was stepped with. */
  private inS = 0;
  /** The step clock at the last update, when the caller has one. */
  private stepNowS: number | null = null;
  /** (nowMs, inS, dtSec) of the last few updates, newest last. */
  private readonly anchors: Array<{ ms: number; s: number; dt: number }> = [];
  private log: PedalEdgeLog | null = null;
  private cursor = 0;
  private isDown = false;
  /** The last release (where a lift begins), null before the first. */
  private release: PlacedStamp | null = null;
  /** Standstill as first observed (at an update) on each clock, or null. */
  private still: { input: number; step: number | null } | null = null;
  /** A lift may not count time before this (a manual shift's silence, a gate). */
  private floor: { input: number; step: number | null } | null = null;
  private press: PlacedStamp | null = null;
  private pressLift = 0;
  private pressedNow = false;
  private releasedNow = false;

  /** Advance one update: read the edges since the last one, in order. */
  step(f: TimedPedalStep): void {
    const prevIn = this.inS;
    const dt = Math.max(0, f.dtSec);
    this.inS += dt;
    this.pressedNow = false;
    this.releasedNow = false;
    const timing = f.timing ?? null;
    if (timing) {
      if (timing.stepS !== undefined && timing.stepS !== null) this.stepNowS = timing.stepS;
      this.anchors.push({ ms: timing.nowMs, s: this.inS, dt });
      if (this.anchors.length > ANCHORS) this.anchors.shift();
      if (this.log !== timing.log) {
        // First read of this log: its state is known from now, no earlier.
        this.log = timing.log;
        this.cursor = timing.log.seq;
        this.forget(timing.log.down);
      } else {
        const { edges, lost } = timing.log.since(this.cursor);
        this.cursor = timing.log.seq;
        if (lost) this.forget(timing.log.down);
        else for (const e of edges) this.apply(e.down, this.place(e, prevIn));
      }
    } else if (f.sampledDown !== this.isDown) {
      // A sample says the state is new since the previous update, no more.
      this.apply(f.sampledDown, { clock: "input", at: this.inS, earliest: prevIn });
    }
    // Standstill as observed at THIS update — after the edges, which happened
    // before it.
    if (!f.stopped) this.still = null;
    else if (this.still === null) this.still = { input: this.inS, step: this.stepNowS };
  }

  /** Is the pedal down now (after this update's edges)? */
  get down(): boolean {
    return this.isDown;
  }

  /** Did the CURRENT press begin within this update? */
  get pressedThisUpdate(): boolean {
    return this.pressedNow && this.isDown;
  }

  /** Did any release happen within this update? */
  get releasedThisUpdate(): boolean {
    return this.releasedNow;
  }

  /** The lift at a standstill that ended in the current press, s (0 if none). */
  get pressLiftS(): number {
    return this.isDown ? this.pressLift : 0;
  }

  /** The current press's own stamp (null while lifted). */
  get pressStamp(): PlacedStamp | null {
    return this.isDown ? this.press : null;
  }

  /** «Now» on `clock`, s — null for the step clock when the caller gives none. */
  now(clock: PedalClock): number | null {
    return clock === "input" ? this.inS : this.stepNowS;
  }

  /** The lift at a standstill so far, s (0 while pressed). */
  get liftS(): number {
    if (this.isDown) return 0;
    const clock = this.release?.clock ?? "input";
    const now = this.now(clock);
    return now === null ? 0 : this.liftUntil(clock, now);
  }

  /** From this update on: a lift may not count any time before now. */
  floorNow(): void {
    this.floor = { input: this.inS, step: this.stepNowS };
  }

  private forget(down: boolean): void {
    // State known only from now: a press starts now with no lift behind it, a
    // lift starts now.
    this.isDown = down;
    const nowStamp: PlacedStamp = { clock: "input", at: this.inS, earliest: this.inS };
    this.press = down ? nowStamp : null;
    this.pressLift = 0;
    this.release = down ? null : nowStamp;
    this.floorNow();
  }

  private apply(down: boolean, stamp: PlacedStamp): void {
    if (down === this.isDown) return;
    this.isDown = down;
    if (!down) {
      this.release = stamp;
      this.press = null;
      this.releasedNow = true;
      return;
    }
    this.pressLift = this.liftUntil(stamp.clock, stamp.earliest);
    this.press = stamp;
    this.pressedNow = true;
  }

  /** The lift at a standstill from the last release to `end` on `clock`. */
  private liftUntil(clock: PedalClock, end: number): number {
    if (this.still === null) return 0;
    const still = clock === "input" ? this.still.input : this.still.step;
    if (still === null) return 0;
    let start = still;
    if (this.floor !== null) {
      const floor = clock === "input" ? this.floor.input : this.floor.step;
      if (floor === null) return 0;
      start = Math.max(start, floor);
    }
    if (this.release !== null) {
      if (this.release.clock !== clock) return 0; // one end on each clock
      start = Math.max(start, this.release.at);
    }
    return Math.max(0, end - start);
  }

  /** Place a logged edge on this machine's clocks. */
  private place(e: PedalEdge, prevIn: number): PlacedStamp {
    if (e.stepS !== undefined) return { clock: "step", at: e.stepS, earliest: e.stepS };
    // `at` is where a lift or a press BEGINS: placing it later is safe (the
    // span only shrinks), so the upper bound is taken and it is never placed
    // before the previous update.
    const at = Math.max(prevIn, this.placeMs(e.atMs, false));
    // `earliest` is where a lift ENDS: placing it EARLIER is safe, so the lower
    // bound is taken — −∞ (no lift credited) for a stamp older than the
    // anchors can place.
    const earliest = Math.min(at, this.placeMs(e.earliestMs, true));
    return { clock: "input", at, earliest };
  }

  /**
   * performance-clock ms → input-clock s, through the update anchors. Inside
   * update i's interval (after update i−1's nowMs) the stamp is placed at
   * s_i − min(age, dt_i): its true distance from update i, capped at what that
   * update credited — exact on a frame of ≤ 0.5 s, compressed on a stall.
   * At or before the oldest anchor kept only a bound is known: `lower` asks
   * for the lower one (−∞), otherwise the upper one.
   */
  private placeMs(ms: number, lower: boolean): number {
    const n = this.anchors.length;
    if (n === 0) return lower ? Number.NEGATIVE_INFINITY : this.inS;
    const newest = this.anchors[n - 1]!;
    if (ms >= newest.ms) return newest.s; // a stamp at or after `now` is `now`
    for (let i = n - 1; i >= 0; i--) {
      const a = this.anchors[i]!;
      if (ms === a.ms) return a.s; // exactly at an update
      if (i >= 1 && ms > this.anchors[i - 1]!.ms) return a.s - Math.min((a.ms - ms) / 1000, a.dt);
    }
    // Its true place is at most s_0 − min(age, dt_0): it may lie in an
    // interval no longer kept.
    if (lower) return Number.NEGATIVE_INFINITY;
    const a = this.anchors[0]!;
    return a.s - Math.min((a.ms - ms) / 1000, a.dt);
  }
}

/**
 * ===========================================================================
 * 2026-11-01, ROUND 6 (R20) — THE OTHER PEDAL IS READ AS OF THE DECISION TOO.
 * ===========================================================================
 * The assist's both-pedals disarm («held throttle vetoes the toggle»,
 * engine/reverseAssist.ts) used to read the throttle as ONE SAMPLE: the value
 * the previous frame's last `read()` left behind. Since R5 the assist decides
 * at the START of a frame, before this frame's reads, so after a render stall
 * that value is a whole stall old while the brake beside it is read from its
 * source-timed log as of now: W held one frame before a 0.45 s stall read
 * 0.02 (the ramp's first frame), S pressed 0.05 s into the stall had reached
 * HOLD_S by the first update after it, and the car shifted to R with both
 * pedals down (landing integrator and merge verifier, 2026-11-01).
 *
 * So the throttle the disarm reads is the student's other pedal control's own
 * source-timed log (LessonScene GatedSimInput.throttleLog — the same channel
 * stamps as the brake's: the raw key, the pointer event, the pad poll, the
 * rig's step), read through this latch: at an update the channel counts as
 * DOWN if it was down when the previous update read it, went down at any
 * instant since, or is down now. The latch never says «up» for an interval in
 * which the LOG says the throttle was down at any instant, so it can only
 * disarm MORE than the overlap the log records — the safe side: a false R is
 * the dangerous failure, a gesture repeated is the safe one (round 5). It
 * needs no times, only the order of the log; a lost ring reads as down.
 *
 * The latch is only as true as its log (R24, 2026-11-02 round 7). Round 6's
 * log left out a control LAW 2 disowned, on the disown the LAST read() took —
 * a frame old here — so a disowned W pressed again beside S was not in it, and
 * the disarm saw less than the student's true overlap (round-6 verifier, F1).
 * The log now holds the other pedal control as the student holds it, whatever
 * LAW 2 says of it.
 *
 * Without a log (`timing` omitted) it is the sample it is handed, as before.
 */
export class PedalLatch {
  private log: PedalEdgeLog | null = null;
  private cursor = 0;
  /** The channel's state when the previous update read the log. */
  private wasDown = false;

  /** Advance one update: was the channel down at any instant since the
   *  previous update, or is it down now? */
  step(timing: PedalTiming | null | undefined, sampledDown: boolean): boolean {
    if (!timing) return sampledDown;
    const log = timing.log;
    let any: boolean;
    if (this.log !== log) {
      // First read of this log: its state is known from now, no earlier.
      this.log = log;
      any = log.down;
    } else {
      const { edges, lost } = log.since(this.cursor);
      any = this.wasDown || lost || log.down || edges.some((e) => e.down);
    }
    this.cursor = log.seq;
    this.wasDown = log.down;
    return any;
  }
}
