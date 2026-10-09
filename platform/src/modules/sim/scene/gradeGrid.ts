/**
 * sc-roundabout-entry:7b747c15 round 4 — THE WORLD AND THE GRADE RUN ON ONE
 * FIXED STEP.
 *
 * The graded chain of a live lesson — signals → traffic → contact → lead gap →
 * runtime.sample → scenario director → the lesson engine — runs once per
 * SESSION GRID POINT k·FIXED_DT (traffic/sessionGrid.ts), never once per render
 * frame, and every link of it reads the student AT that grid point:
 *
 *   · a frame that crosses no grid point (every other frame at 120 Hz) grades
 *     NOTHING; what it carried for the grader (a one-frame mirror glance, a
 *     physics contact queued into the runtime) is HELD and heard at the next
 *     grid point, in order, exactly once;
 *   · a long frame (a phone's 0.5 s = 30 points) is graded at EVERY grid point
 *     inside it, each with the student's own state there — so a stop held for
 *     a few tenths of a second inside one frame is a stop, and a car that
 *     passed a line mid-frame passed it mid-frame;
 *   · every interval the chain integrates is (k − kPrev)·FIXED_DT, never the
 *     frame's own length.
 *
 * Why (round 3's verifier, F1): with the world on the grid and the grade on
 * the frame, the rule engine paired the student at the frame end T with a
 * world at floor(T/H)·H. Whenever frame ends were not exactly k/60 — 120 Hz,
 * 144 Hz, 59.94 Hz, ±1 ms jitter, even 60 Hz with 0.2 µs timestamp noise — the
 * student-to-lead gap became a sawtooth and FOLLOWING_TOO_CLOSE (which refuses
 * to bill while the gap opens), YIELDED_TO_PRIORITY and OVERTAKING_AT_CROSSING
 * flipped. Feeding the student at the grid point made every one of those
 * splits vanish; this module makes that the product.
 *
 * At an exact 60 Hz cadence every frame ends ON its grid point, so each frame
 * runs this chain once, in the order it always ran, with dt = 1/60: the call
 * sequence LessonScene's RuntimeDriver made per frame since A8.
 *
 * ROUND 5 — ONE ORIGIN, ONE CLOCK. Grid point 0 is the session's origin and is
 * never graded; grid point k ≥ 1 is the state after the k-th physics step. The
 * FIRST frame brings every grid point inside it like any other frame (round 4
 * brought one, whatever its length, and left the world and the signal clock
 * behind the car and the session clock for the whole drive — 21 of 1,531
 * sheets after a 0.5 s first frame). Two callers, one chain:
 *
 *   · `stepPhysics` — the LIVE lesson. The grid is driven by the physics
 *     engine's own steps: a frame in which rapier took n steps brings exactly n
 *     grid points, and point k reads the car after step k, written here from
 *     the step source — the scene's hook supplies only the cabin's discrete
 *     channels, so there is no frame-end pose for the grade to read by mistake;
 *   · `stepFrame` — a caller with no physics engine (the replay harness): the
 *     grid points are the ones the session time has passed.
 *
 * ROUND 6 — NO POSE-CONSUMING HOOK. The person-in-path distance
 * (`SimTick.vruAheadM`, graded input: it acquits a stop made for a human
 * being) was measured by a hook the SCENE handed in, from whatever pose that
 * hook chose to read — and a scene that read its frame-end sample there passed
 * every test (round 5's verifier: the graded tick stream then differs between
 * cadences on 164 of 344 cells with a staged person). The grid now measures it
 * ITSELF, from the student at grid point k and the world's grid state there,
 * through the orchestrator's own `vruAheadMeters` — so the live lesson and the
 * replay harness publish the channel through one line, and the scene hands the
 * grid no function that is given, or needs, a pose.
 *
 * ROUND 7 — THE NEAR-MISS STAT IS THE GRID'S TOO. «Мина на косъм» scores
 * nothing, but its count and closest pass are SHOWN (the result screen's row,
 * the debrief sentence), and through round 6 the detector was stepped once per
 * render frame by NpcColliders from the frame's drawn chassis — so one drive
 * was told about a different number of near misses on a phone than on a PC
 * (the round-6 verifier's model: 15 of 503 committed demos on a phone's
 * cadence). It is stepped here now (scene/nearMissMeter.ts), from the student
 * at grid point k and the traffic system's state at k, and an encounter that
 * resolved at a point is handed to `hooks.nearMiss` after that point's tick
 * was delivered — a hook that is GIVEN the event and is handed no pose.
 *
 * ROUND 8 — EVERY LOOK IS HEARD: A QUEUE, NOT A SLOT. A mirror or shoulder
 * look reaches this module as the frame's one-shot `frameGlance` (the look
 * the VehicleSample builder took out of the cabin's queue this frame,
 * scene/cabin.ts). Rounds 4–7 kept ONE held glance and let the next frame's
 * overwrite it — so whenever the first of two consecutive frames took no
 * physics step (every other frame at 120 Hz), the first look was never
 * graded. Base graded every frame's look. The round-7
 * verifier, on the real fiber + rapier libraries: the first look of a two-key
 * press heard 14 of 14 times at 60 Hz, 25 of 48 at 120 Hz, 19 of 48 at 144 Hz;
 * on its tapes 26 of 481 cells got two sheets between 60 Hz and 120/144 Hz and
 * 15 flipped pass/fail (sc-jx-giveway-b1's CORRECT demo billed
 * JUNCTION_SCAN_INCOMPLETE on a 120 Hz display).
 *
 * The looks are a FIFO now, and the rule is the one a 60 Hz display has always
 * had: ONE LOOK PER GRID POINT, the oldest first, the rest wait their turn.
 * (The tick carries one glance — `VehicleSample.mirrorGlance` is a single
 * value and the runtime turns it into one `mirrorGlance` event — so two looks
 * cannot share a point, and at 60 Hz two looks on consecutive frames have
 * always been heard at consecutive points.) A look is therefore heard at the
 * first grid point graded at or after the frame that handed it over, plus one
 * point for every look still ahead of it.
 *
 * A FRAME HANDS OVER EVERY LOOK THE CABIN HOLDS, NOT ONE. The cabin's queue
 * was drained at one look per FRAME because, on base, a frame was a tick and
 * a tick carries one look. Left like that, the wait of a second look would be
 * counted in frames: 17 ms on a PC and half a second inside a phone's 0.5 s
 * frame (a burst of four keys: 1.5 s for the last) — a look made in time and
 * heard after the manoeuvre it was made for. So after the frame's glance the
 * grid asks `hooks.moreLooks` for the rest, oldest first, until the cabin has
 * none: looks pressed while one picture was on the glass are heard at
 * CONSECUTIVE GRID POINTS on every display. Where no frame is longer than a
 * step (a display of 60 Hz or faster, hitches aside) that is exactly what
 * one-look-per-frame gave — such a frame brings at most one point; it differs
 * only where a frame is longer than a step.
 *
 * HOW LONG A LOOK CAN WAIT — IN STEPS, ON EVERY DISPLAY. The queue drains at
 * one look per grid point, sixty a second, and the cabin's own queue holds
 * four. So a burst of four keys inside one frame is heard over four
 * consecutive points: the last one 3 steps (50 ms) after the first. To back up
 * further a driver would have to press more than sixty looks a second; the
 * queue is bounded anyway (`GRADE_GRID_LOOK_CAPACITY` = 8, worst wait 7
 * steps = 117 ms behind the point its frame reached), and a look that finds it
 * full is DROPPED AND COUNTED (`droppedLooks`) — the newest, as the cabin's
 * own queue drops past four. Nothing is ever heard twice.
 *
 * WHEN, EXACTLY: at the first grid point graded at or after the frame that
 * sampled the look. That is the first step of the world AFTER THE PICTURE THE
 * DRIVER WAS LOOKING AT when he pressed — and it is the step from which every
 * other control sampled by that frame acts (the pedals, the lever, the
 * stalk). It is NOT the instant of the press: the cabin is read once per
 * frame, so inside a 0.5 s frame a look can be heard up to 29 points before
 * the moment it was pressed, and on a 90 or 144 Hz display one point before
 * (a frame that brought a grid point and then sampled a press made after it).
 * No grid can undo that; it is the device sampling the driver.
 *
 * WHAT IS NOT HEARD, STATED: a look whose turn has not come when the session
 * ends (a second look pressed inside the last step before the ending tick) is
 * not graded — at 60 Hz it never was either: its tick came after the end.
 * `pendingLooks` says how many are waiting. And a respawn (`reset`) drops the
 * looks still waiting: a look made before it is not a look made after it.
 *
 * The `student` hook can no longer supply a look at all: the grid writes
 * `mirrorGlance` at every point AFTER the hook, from this queue, so a look
 * has ONE way in — the frame's glance and `moreLooks`, i.e. the cabin's
 * queue — for the live lesson and the replay harness alike (round 7's harness wrote the tape's looks straight into each
 * grid point, never passed a frame glance, and so no census cell ran the path
 * the defect was in).
 *
 * WHAT STAYS ON THE FRAME: everything the student SEES (the speedometer, the
 * HUD gap readouts, the drawn poses — `traffic.setRenderSessionTime`) and
 * every coaching hint that grades nothing (reverse-assist, stuck-start, the
 * «втори замах» cue). What is GRADED may not.
 */

import type { NearMissEvent, NearMissStats, VehicleSample, WorldRuntime } from "@/modules/sim/contracts";
import {
  directorContactCast,
  vruAheadMeters,
  type DirectorStepResult,
  type ScenarioDirector,
} from "@/modules/sim/orchestrator";
import type { SimTick } from "@/modules/sim/rules";
import { GridNearMissMeter } from "./nearMissMeter";
import {
  SessionGridClock,
  type PhysicsStepSource,
  type PhysicsStepState,
  type SessionGridSpan,
  type TrafficSystem,
  type TrafficUpdateContext,
} from "@/modules/sim/traffic";

/** The world the chain advances — the live objects LessonScene builds. */
export interface GradeGridWorld {
  runtime: Pick<WorldRuntime, "update" | "sample" | "signalPhase">;
  traffic: Pick<
    TrafficSystem,
    | "update"
    | "leadGapMeters"
    | "setRenderSessionTime"
    | "staged"
    | "vehicles"
    | "pedestrians"
    | "vehicleCollisionKind"
  >;
  director: ScenarioDirector | null;
}

/** The lesson's weather / light — constant for a drive. */
export interface GradeGridConditions {
  isNight: boolean;
  rain: boolean;
  fog: boolean;
  snow: boolean;
}

/** One graded grid point, handed to `onPoint` (reused — copy what you keep). */
export interface GradeGridPoint {
  /** The grid index and its session time k·FIXED_DT. */
  k: number;
  tSec: number;
  /** Session time since the previous graded point: (k − kPrev)·FIXED_DT. */
  dtSec: number;
  /** The student's state the whole chain read at this point. */
  student: Readonly<VehicleSample>;
  leadGapM: number;
  /** The authoritative tick, the director's events already appended. */
  tick: SimTick;
  /** What the director returned (null: no staged events). */
  staged: DirectorStepResult | null;
}

export interface GradeGridHooks {
  /**
   * Write the student's state at grid point `k` (session time `tSec`) into
   * `out`: every discrete channel (indicator, gear, belt, …) and — for
   * `stepFrame` only — position, heading and speed AT that point. Under
   * `stepPhysics` the pose and speed are written by the grid itself, from the
   * physics step, AFTER this hook: whatever the hook put there is overwritten.
   * `out.mirrorGlance` is NOT the hook's to write (round 8): the grid writes it
   * after the hook, at every point, from its own queue of looks — the oldest
   * look not yet heard, or null. A look enters through the frame's glance and
   * `moreLooks` only.
   * Returns the raw brake pedal 0..1 the director's reaction clocks read.
   */
  student(k: number, tSec: number, out: VehicleSample): number;
  /**
   * EVERY OTHER LOOK THE CABIN STILL HOLDS (round 8): asked once per frame,
   * after the frame's own glance has joined the queue, again and again until
   * it returns null — each call takes the cabin's next latched look, oldest
   * first (`CabinControls.consumeGlanceSample`). Without it the cabin drains
   * at one look per FRAME and a second look pressed inside a 0.5 s frame waits
   * half a second for its turn; with it the wait is one grid point on every
   * display. Omitted = the frame's glance is the frame's only look.
   */
  moreLooks?(): GradeGridLook | null;
  /** Speed the traffic agents read (default: the student's own signed number). */
  trafficSpeedKmh?(student: Readonly<VehicleSample>): number;
  /** Contacts a physics reporter must queue into the runtime at this point,
   *  after the world moved and before the tick is sampled (the replay's
   *  stand-in for rapier's NpcColliders). */
  contacts?(tSec: number, student: Readonly<VehicleSample>): void;
  /** The graded point. Return true to stop grading this frame (the session
   *  ended on it). */
  onPoint(point: GradeGridPoint): boolean | void;
  /**
   * A near miss that RESOLVED at this grid point (the bodies separated), with
   * the running session aggregate — the unscored «мина на косъм» stat, measured
   * by the grid from the student at the point and the traffic state there.
   * Called after `onPoint` of the same point (the shell places the encounter
   * at the tick it has just been handed), also when that `onPoint` ended the
   * session. Omitted = the stat is still tracked, just unreported.
   */
  nearMiss?(event: NearMissEvent, stats: NearMissStats): void;
}

/** A mirror or shoulder look (never null). */
export type GradeGridLook = NonNullable<VehicleSample["mirrorGlance"]>;

/**
 * Most looks the grid holds for their turn (round 8). The cabin's own queue
 * holds four and hands one over per frame; the grid hears one per grid point.
 * Eight is the cabin's four twice over — a bound on a stuck or scripted input,
 * not a policy a driver can reach. See the header for what happens past it.
 */
export const GRADE_GRID_LOOK_CAPACITY = 8;

export function createGradeGridSample(): VehicleSample {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 0,
    speedKmh: 0,
    indicator: "off",
    headlights: "off",
    seatbeltOn: false,
    handbrakeOn: false,
    gear: 0,
    mirrorGlance: null,
    stalled: false,
    fogLightsOn: false,
  };
}

export class GradeGrid {
  readonly clock: SessionGridClock;
  private readonly span: SessionGridSpan = { first: 0, last: -1 };
  private readonly student: VehicleSample = createGradeGridSample();
  /** The looks not yet heard by a grid point, oldest first (round 8: a FIFO —
   *  rounds 4–7 kept one slot and the next frame's look overwrote it). */
  private readonly looks: GradeGridLook[] = [];
  private dropped = 0;
  /** The last graded grid index; 0 is the session's origin (none yet). */
  private prevK = 0;
  /** The car at a physics step (scratch). */
  private readonly stepState: PhysicsStepState = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };
  /** The near-miss stat (round 7): stepped once per grid point, below. */
  private readonly nearMisses = new GridNearMissMeter();
  /** Encounters that resolved at the point being graded (scratch). */
  private readonly resolved: NearMissEvent[] = [];
  private readonly point: GradeGridPoint = {
    k: 0,
    tSec: 0,
    dtSec: 0,
    student: this.student,
    leadGapM: Infinity,
    tick: undefined as unknown as SimTick,
    staged: null,
  };

  constructor(clock: SessionGridClock = new SessionGridClock()) {
    this.clock = clock;
  }

  /** Looks handed over and not yet heard by a grid point. */
  get pendingLooks(): number {
    return this.looks.length;
  }

  /** Looks that found the queue full and were dropped (0 in any drive a
   *  person can make — see `GRADE_GRID_LOOK_CAPACITY`). */
  get droppedLooks(): number {
    return this.dropped;
  }

  /**
   * Grade the grid points a frame ending at session time `endSec` brings (at
   * most up to `untilSec`) — every point the session time has passed since the
   * last one graded, the first frame's included. `frameGlance` is the frame's
   * one-shot mirror glance: it joins the queue of looks and is heard at its
   * turn, one look per grid point (round 8). For a caller
   * with no physics engine (the replay harness): `hooks.student` supplies the
   * car's state at each point. Returns how many points were graded.
   */
  stepFrame(
    endSec: number,
    frameGlance: VehicleSample["mirrorGlance"],
    world: GradeGridWorld,
    conditions: GradeGridConditions,
    hooks: GradeGridHooks,
    untilSec: number = Infinity,
  ): number {
    return this.run(this.clock.advance(endSec, this.span, untilSec), endSec, null, frameGlance, world, conditions, hooks);
  }

  /**
   * ROUND 5 — the LIVE lesson's frame. `steps` is the physics engine's own
   * step record (VehicleRig → `PlayerStepTrackRecorder`), read AFTER the
   * engine stepped this frame: the frame brings one grid point per step taken
   * since the last call — none on a frame the engine did not step in, thirty on
   * a 0.5 s frame, the first frame's like any other — and grid point k reads
   * the car after step k. `frameEndSec` is the session clock at the frame end
   * (`PhysicsSessionClock`), used only for what is DRAWN.
   */
  stepPhysics(
    steps: PhysicsStepSource,
    frameEndSec: number,
    frameGlance: VehicleSample["mirrorGlance"],
    world: GradeGridWorld,
    conditions: GradeGridConditions,
    hooks: GradeGridHooks,
  ): number {
    const span = this.clock.advanceSteps(steps.stepCount - this.clock.last, this.span);
    return this.run(span, frameEndSec, steps, frameGlance, world, conditions, hooks);
  }

  private run(
    span: SessionGridSpan,
    frameEndSec: number,
    steps: PhysicsStepSource | null,
    frameGlance: VehicleSample["mirrorGlance"],
    world: GradeGridWorld,
    conditions: GradeGridConditions,
    hooks: GradeGridHooks,
  ): number {
    // THE ONE WAY IN FOR A LOOK (round 8): the frame's glance joins the queue
    // behind the looks still waiting. Never a slot the next frame overwrites.
    if (frameGlance !== null) this.hear(frameGlance);
    // …and every look the cabin still holds behind it (see the header). The
    // cabin's queue holds four; the bound is a guard against a source that
    // never runs dry, not a quota.
    if (hooks.moreLooks) {
      for (let i = 0; i < GRADE_GRID_LOOK_CAPACITY; i++) {
        const more = hooks.moreLooks();
        if (more === null) break;
        this.hear(more);
      }
    }
    const H = this.clock.stepSec;
    const { runtime, traffic, director } = world;
    // The staged people the person-in-path distance is measured to: the
    // director's own contact cast (empty with no director, or none staged).
    const cast = directorContactCast(director);
    const s = this.student;
    let graded = 0;
    for (let k = span.first; k <= span.last; k++) {
      const tSec = this.clock.timeOf(k);
      const dtSec = (k - this.prevK) * H;
      this.prevK = k;
      s.mirrorGlance = null;
      const brakePedal = hooks.student(k, tSec, s);
      if (steps !== null && steps.stateAtStep(k, this.stepState)) {
        s.position.x = this.stepState.x;
        s.position.y = this.stepState.y;
        s.headingDeg = this.stepState.headingDeg;
        s.speedKmh = this.stepState.speedKmh;
      }
      // ONE LOOK PER GRID POINT, THE OLDEST FIRST (round 8) — written after
      // the hook, so the queue is the only source of a look and a point that
      // has none says so.
      s.mirrorGlance = this.looks.length > 0 ? (this.looks.shift() as GradeGridLook) : null;
      runtime.update(dtSec);
      const ctx: TrafficUpdateContext = {
        signalPhase: (id) => runtime.signalPhase(id),
        playerPos: { x: s.position.x, y: s.position.y },
        playerSpeedKmh: hooks.trafficSpeedKmh ? hooks.trafficSpeedKmh(s) : s.speedKmh,
        playerHeadingDeg: s.headingDeg,
        playerTrack: null,
        sessionTimeSec: tSec,
      };
      traffic.update(dtSec, ctx);
      // THE NEAR-MISS STAT (round 7): the student at this grid point against
      // the traffic state the world's step k has just left — the pose and the
      // world everything below grades. Never the frame's drawn chassis.
      this.resolved.length = 0;
      this.nearMisses.step(tSec, dtSec, s, traffic, this.resolved);
      hooks.contacts?.(tSec, s);
      const leadGapM = traffic.leadGapMeters(s.position.x, s.position.y, s.headingDeg);
      // THE PERSON IN THE PATH, measured HERE (round 6): from the student at
      // this grid point to the staged people where the world's step k left
      // them. No hook — nothing outside the grid chooses the pose it is
      // measured from. An empty cast yields Infinity, which leaves the tick
      // exactly as it is for every lesson that stages no one.
      const vru = vruAheadMeters(cast, traffic, s.position.x, s.position.y, s.headingDeg);
      const tick = runtime.sample(
        s,
        tSec,
        conditions.isNight,
        conditions.rain,
        leadGapM,
        conditions.fog,
        conditions.snow,
        vru,
      );
      let staged: DirectorStepResult | null = null;
      if (director) {
        staged = director.step({
          tSec,
          dtSec,
          x: s.position.x,
          y: s.position.y,
          speedKmh: s.speedKmh,
          headingDeg: s.headingDeg,
          brakePedal,
          tickEvents: tick.events,
        });
        for (const e of staged.events) tick.events.push(e);
      }
      graded++;
      const p = this.point;
      p.k = k;
      p.tSec = tSec;
      p.dtSec = dtSec;
      p.leadGapM = leadGapM;
      p.tick = tick;
      p.staged = staged;
      const ended = hooks.onPoint(p) === true;
      if (hooks.nearMiss) {
        for (let i = 0; i < this.resolved.length; i++) hooks.nearMiss(this.resolved[i], this.nearMisses.stats);
      }
      if (ended) break;
    }
    traffic.setRenderSessionTime(frameEndSec);
    return graded;
  }

  /** A look joins the queue behind the looks still waiting — or, past the
   *  queue's bound, is dropped and counted. */
  private hear(look: GradeGridLook): void {
    if (this.looks.length < GRADE_GRID_LOOK_CAPACITY) this.looks.push(look);
    else this.dropped++;
  }

  /**
   * A RESPAWN (key R, the touch sheet's «Рестарт» — LessonScene `resetCar`):
   * what was still PENDING belongs to the drive before it and is dropped — the
   * looks waiting for their turn, and every near-miss encounter still open (a
   * car put back on its spawn point out of a squeeze has not «passed» anyone).
   * The session clock — and so the grid index — runs on through a respawn, as
   * does the session's running near-miss aggregate: the lesson session is not
   * over. A NEW session is a new GradeGrid (the shell remounts the scene on
   * «Повтори»).
   */
  reset(): void {
    this.looks.length = 0;
    this.nearMisses.reset();
  }
}
