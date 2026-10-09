/**
 * sc-roundabout-entry:7b747c15 round 4 — THE SESSION GRID: one fixed step for
 * the world AND the grade.
 *
 * Round 3 put the world (staged + ambient actors, the director, the contact
 * sentinel) on the session's fixed-step grid k·FIXED_DT (system.ts `stepGrid`),
 * but the rule engine still graded once per RENDER FRAME, pairing the student
 * at the frame end T with a world that now sat at floor(T/H)·H. Its verifier
 * measured the sawtooth that made: on sc-follow-distance tailgate L4 the gap
 * rate the engine reads «opened» at ≥ 0.5 m/s on 627 of 1,257 frames at 120 Hz
 * and 313 of 630 at 60 Hz ± 0.2 µs (0 at 60 Hz, 0 on base), and the full sheet
 * census lost 30 cells at 60 Hz ± 0.2 µs, 28 at 120 Hz and 144 Hz, 30 at
 * 59.94 Hz (FOLLOWING_TOO_CLOSE lost and invented, YIELDED_TO_PRIORITY lost,
 * OVERTAKING_AT_CROSSING invented).
 *
 * So the grade moves onto the same grid. This clock says WHICH grid points a
 * frame brings; `scene/gradeGrid.ts` runs the whole graded chain (signals →
 * traffic → contact → lead gap → runtime.sample → director → the lesson
 * engine) once per grid point, reading the student AT that point. A frame
 * that crosses no grid point grades nothing; a long frame grades every point
 * inside it.
 *
 * The index is an INTEGER (never a running float sum): grid point k is session
 * time k·stepSec on every cadence, so a timer that compares a session time
 * against a bar meets it at the same k everywhere.
 */

import { FIXED_DT } from "../vehicle/tuning";

/** A frame end within this of a grid point IS that grid point, s (Σ 1/60
 *  drifts from k/60 in the 13th digit) — the traffic accumulator's own
 *  tolerance (system.ts STAGED_GRID_EPS_SEC). */
export const SESSION_GRID_EPS_SEC = 1e-7;

/** Most grid points one frame may bring: the session clock's 0.5 s ceiling
 *  is 30 of them; this is a guard against a corrupt clock, not a policy. */
export const SESSION_GRID_MAX_POINTS = 64;

/** The grid points one frame brings, `first … last` inclusive; `last < first`
 *  is none. Reused by the caller (zero allocation). */
export interface SessionGridSpan {
  first: number;
  last: number;
}

/**
 * ROUND 5 — ONE ORIGIN. Grid point 0 is the session's origin: session time 0,
 * the state before the physics engine has taken any step. It is never graded
 * (no step ended there). Grid point k ≥ 1 is the state after the k-th step, at
 * session time k·stepSec. A frame brings every grid point after the last one
 * handed out — THE FIRST FRAME INCLUDED: a first live frame of 0.5 s brings
 * points 1…30, exactly the steps the physics engine took in it
 * (`@react-three/rapier`'s stepper: `accumulator += clamp(delta, 0, 0.5)`
 * from 0, one step per whole `timeStep` in it).
 *
 * Round 4 handed out only the NEWEST point on the first frame, so after a
 * 0.5 s first frame the session clock and the student's car were 0.5 s in and
 * the world and the signal clock 0.0167 s in for the rest of the drive: its
 * verifier measured 21 of 1,531 sheets split against the same 60 Hz display
 * without the hitch (base: 2), the signal a tick reads different at up to 132
 * grid points, and no committed pin could see it because the replay harness
 * started every cadence at t = 0.
 */
export class SessionGridClock {
  readonly stepSec: number;
  private readonly epsSteps: number;
  /** The last grid point handed out; 0 is the origin (nothing handed out). */
  private lastK = 0;

  constructor(stepSec: number = FIXED_DT) {
    this.stepSec = stepSec;
    this.epsSteps = SESSION_GRID_EPS_SEC / stepSec;
  }

  /** The newest grid point at or before session time `tSec`. */
  indexAt(tSec: number): number {
    return Math.floor(tSec / this.stepSec + this.epsSteps);
  }

  /** Session time of grid point `k` — a product, never a sum. */
  timeOf(k: number): number {
    return k * this.stepSec;
  }

  /** The last grid point handed out (0: none yet — the origin). */
  get last(): number {
    return this.lastK;
  }

  /**
   * The grid points a frame ending at session time `endSec` brings, at most up
   * to `untilSec` (a replay's tail): every point after the last one handed
   * out, on the first frame as on every other. A clock that did not move, or
   * went backwards, brings none. For a caller with no physics engine to count
   * steps (the replay harness); the live lesson uses `advanceSteps`.
   */
  advance(endSec: number, out: SessionGridSpan, untilSec: number = Infinity): SessionGridSpan {
    if (!Number.isFinite(endSec)) {
      out.first = 0;
      out.last = -1;
      return out;
    }
    let kEnd = this.indexAt(endSec);
    if (untilSec < Infinity) kEnd = Math.min(kEnd, this.indexAt(untilSec));
    return this.handOut(kEnd, out);
  }

  /**
   * ROUND 5 — ONE CLOCK. The grid points a frame brings when the physics
   * engine took `steps` steps in it: exactly that many, the next ones. The
   * live lesson's grid is DRIVEN by the engine's own steps (grid point k is
   * the car's k-th step), never re-derived from the session time — two
   * accumulators fed the same deltas cross a step on different frames whenever
   * a frame end lands within float noise of a grid point (every 0.1 s on a
   * browser whose timestamps are 0.1 ms), and round 4's repair of that
   * (lowering an offset) graded one state twice and read the car a step stale
   * from then on.
   */
  advanceSteps(steps: number, out: SessionGridSpan): SessionGridSpan {
    const n = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;
    return this.handOut(this.lastK + n, out);
  }

  private handOut(kEnd: number, out: SessionGridSpan): SessionGridSpan {
    out.first = this.lastK + 1;
    out.last = kEnd;
    if (out.last - out.first + 1 > SESSION_GRID_MAX_POINTS) {
      out.first = out.last - SESSION_GRID_MAX_POINTS + 1;
    }
    if (out.last >= out.first) this.lastK = out.last;
    return out;
  }

  /** Back to the origin (a new session). */
  reset(): void {
    this.lastK = 0;
  }
}

/**
 * ROUND 5 — ONE ORIGIN, for the live lesson's session clock.
 *
 * The session clock is the sum of the frames' clamped deltas — the very
 * numbers `@react-three/rapier` feeds its accumulator, on the very frames
 * (LessonScene's RuntimeDriver and `<Physics>` are paused by one prop). So
 * (session time) − (steps taken)·stepSec IS the engine's accumulator: what the
 * frame end lies past the newest grid point, always in [0, stepSec). That is
 * the fraction everything DRAWN is interpolated by.
 *
 * Two things this class adds to a bare `t += dt`:
 *  · the clock STANDS AT ITS ORIGIN until the engine has taken its first
 *    counted step (nothing has moved; there is no grid point to be past);
 *  · steps the engine took before anything could count them (rapier registers
 *    a step listener in a passive effect, which may flush after the first
 *    animation frame) are not session time: on the frame the first counted
 *    step arrives, the uncounted steps are dropped from the clock, once.
 *    After that the clock is a pure sum again and never corrected.
 *
 * ROUND 6 — HOW MANY WERE UNCOUNTED IS COUNTED, NOT GUESSED. Round 5 read it
 * off the remainder (`past >= H + eps` → drop floor(past/H) steps), and a
 * remainder of exactly one step is ambiguous: it is either one uncounted step
 * with the accumulator at 0, or no uncounted step with the accumulator a float
 * hair under H. Round 5 always took the second reading, so when the listener
 * arrived a frame late and the first counted frame ended exactly on a grid
 * point the clock stayed ONE WHOLE STEP AHEAD of the engine for the session
 * (50 of the round-5 verifier's 709 model sessions; drawn poses only — the
 * actors drawn at their newest state while the car is drawn a step behind
 * it). An eps-biased floor always takes the first reading instead, and leaves
 * the clock a whole step BEHIND in the mirror case (a first frame of
 * 2/60 s − 1 ulp with the listener on time). So until the origin is fixed
 * this class RUNS THE ENGINE'S ACCUMULATOR ITSELF — the same three lines, on
 * the same clamped deltas, on the same frames — and so knows exactly how many
 * steps the engine has taken and what its accumulator holds. On the origin
 * frame: uncounted = (steps the engine took) − (steps counted); if that is
 * not zero the clock is set to (steps counted)·H + (the accumulator), which is
 * in [0, H) past the newest grid point by construction. With nothing
 * uncounted — the ordinary case — the clock is untouched: the bare sum.
 */
export class PhysicsSessionClock {
  readonly stepSec: number;
  /** Σ clamped deltas since the first live frame, less the uncounted steps. */
  private fed = 0;
  private originFixed = false;
  /** Until the origin is fixed: the physics engine's own accumulator, run here
   *  on the deltas it is fed, and the steps it has therefore taken. */
  private acc = 0;
  private engineSteps = 0;

  constructor(stepSec: number = FIXED_DT) {
    this.stepSec = stepSec;
  }

  /** Session time at the end of the newest frame, s. */
  get timeSec(): number {
    return this.originFixed ? this.fed : 0;
  }

  /**
   * One live frame: `dtSec` is its clamped delta (`sessionClockAdvance`),
   * `stepCount` the physics steps counted since the origin, this frame's
   * included. Returns the frame-end session time.
   */
  frame(dtSec: number, stepCount: number): number {
    this.fed += dtSec;
    if (!this.originFixed) {
      const H = this.stepSec;
      // The engine's stepper, line for line (@react-three/rapier:
      // `accumulator += clampedDelta; while (accumulator >= timeStep) { step;
      // accumulator -= timeStep }` — pinned out of the installed bundle by
      // scene/__tests__/live-grid-wiring.test.ts §1).
      this.acc += dtSec;
      while (this.acc >= H) {
        this.engineSteps++;
        this.acc -= H;
      }
      if (!(stepCount > 0)) return 0;
      this.originFixed = true;
      const uncounted = this.engineSteps - stepCount;
      if (uncounted !== 0) this.fed = stepCount * H + this.acc;
    }
    return this.fed;
  }
}
