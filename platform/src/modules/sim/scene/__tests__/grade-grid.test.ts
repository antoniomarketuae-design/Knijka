/**
 * sc-roundabout-entry:7b747c15 round 4 — THE WORLD AND THE GRADE RUN ON ONE
 * FIXED STEP (scene/gradeGrid.ts, traffic/sessionGrid.ts, the recorder's
 * grid read in traffic/playerTrack.ts).
 *
 * The contract, clause by clause, on fakes that record every call:
 *
 *  1. the chain runs once per session grid point k·FIXED_DT, at k·FIXED_DT,
 *     reading the student at THAT point — never at the frame end;
 *  2. a long frame is graded at EVERY grid point inside it;
 *  3. every interval the chain integrates is (k − kPrev)·FIXED_DT, never the
 *     frame's own length;
 *  4. a frame that crosses no grid point grades nothing, and the one-shot
 *     glance it carried is heard at the next grid point, exactly once — and
 *     (ROUND 8) so is every other look: the looks are a QUEUE, one heard per
 *     grid point, the oldest first, never one erased by the next frame's;
 *  5. per point, the order LessonScene always ran per frame: signals →
 *     traffic → contacts → lead gap → sample → director → onPoint;
 *  6. what is DRAWN is set from the frame end, whatever was graded;
 *  7. ROUND 5 — ONE ORIGIN: grid point 0 is the session's origin and is never
 *     graded; the FIRST frame brings every grid point inside it, like any
 *     other frame (a 0.5 s first frame = points 1…30), so the world and the
 *     signal clock have advanced exactly as far as the car and the session
 *     clock, whatever the first frame's length;
 *  8. ROUND 5 — ONE CLOCK: the live frame (`stepPhysics`) brings one grid
 *     point per step the physics engine took, and the grid writes the car's
 *     pose at point k from step k — whatever the scene's hook wrote.
 *  9. ROUND 7 — the near-miss stat («мина на косъм», unscored but shown) is
 *     stepped once per grid point too, after the world moved to it, from the
 *     student AT it; an encounter is handed over after the tick of the point
 *     it resolved at.
 *
 * 10. ROUND 8 — a respawn (`reset`) drops what was still pending: the looks
 *     waiting for their turn and the near-miss windows still open.
 *
 * The live wiring those two clauses rest on (rapier's accumulator, the
 * frame-hook order, LessonScene's own call) is modelled and source-pinned in
 * scene/__tests__/live-grid-wiring.test.ts.
 *
 * The real chain's agreement across cadences is pinned by
 * lessons/scenario/__tests__/grade-grid-cadence.census.test.ts.
 */

import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import type { DirectorInput, DirectorStepResult, ScenarioDirector } from "../../orchestrator";
import type { SimTick, SimTickEvent } from "../../rules";
import { NO_PHYSICS_STEPS, PhysicsSessionClock, PlayerStepTrackRecorder, SessionGridClock } from "../../traffic";
import { FIXED_DT } from "../../vehicle/tuning";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../collision";
import { GlanceSampleQueue } from "../cabin";
import { GRADE_GRID_LOOK_CAPACITY, GradeGrid, type GradeGridHooks, type GradeGridWorld } from "../gradeGrid";
import { NEAR_MISS_VEHICLE_HALF_LENGTH_M, NEAR_MISS_VEHICLE_HALF_WIDTH_M } from "../nearMissMeter";

const H = FIXED_DT;
const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };

interface Rec {
  calls: string[];
  updates: number[];
  trafficDt: number[];
  trafficT: number[];
  sampleT: number[];
  sampleX: number[];
  glances: Array<string | null>;
  directorDt: number[];
  directorT: number[];
  renderT: number[];
}

/** A world whose every link records what it was handed. The student's x is
 *  his session time ×10, so a pose read at the wrong instant is visible. */
function fakeWorld(): { world: GradeGridWorld; rec: Rec } {
  const rec: Rec = {
    calls: [],
    updates: [],
    trafficDt: [],
    trafficT: [],
    sampleT: [],
    sampleX: [],
    glances: [],
    directorDt: [],
    directorT: [],
    renderT: [],
  };
  const runtime = {
    update(dt: number) {
      rec.calls.push("update");
      rec.updates.push(dt);
    },
    sample(v: VehicleSample, t: number): SimTick {
      rec.calls.push("sample");
      rec.sampleT.push(t);
      rec.sampleX.push(v.position.x);
      rec.glances.push(v.mirrorGlance);
      return { t, position: { x: v.position.x, y: v.position.y }, events: [] as SimTickEvent[] } as unknown as SimTick;
    },
    signalPhase: () => "green" as const,
  };
  const traffic = {
    update(dt: number, ctx: { sessionTimeSec?: number }) {
      rec.calls.push("traffic");
      rec.trafficDt.push(dt);
      rec.trafficT.push(ctx.sessionTimeSec ?? NaN);
    },
    leadGapMeters() {
      rec.calls.push("leadGap");
      return 12;
    },
    setRenderSessionTime(t: number) {
      rec.calls.push("render");
      rec.renderT.push(t);
    },
    // The near-miss stat reads the published agent arrays (round 7): none here.
    vehicles: [],
    pedestrians: [],
    vehicleCollisionKind: () => "vehicle" as const,
  };
  const director = {
    step(input: DirectorInput): DirectorStepResult {
      rec.calls.push("director");
      rec.directorDt.push(input.dtSec);
      rec.directorT.push(input.tSec);
      return { events: [], outcomes: [] };
    },
  } as unknown as ScenarioDirector;
  return { world: { runtime, traffic, director } as unknown as GradeGridWorld, rec };
}

function hooks(rec: Rec, extra: Partial<GradeGridHooks> = {}): GradeGridHooks {
  return {
    student: (_k, tSec, out) => {
      out.position.x = tSec * 10;
      out.position.y = 0;
      out.headingDeg = 0;
      out.speedKmh = 30;
      return 0;
    },
    contacts: () => {
      rec.calls.push("contacts");
    },
    onPoint: () => {
      rec.calls.push("point");
    },
    ...extra,
  };
}

/** Drive `n` frames of the cycled deltas — LessonScene's clock: every
 *  frame's delta is added, the first frame's included — the frame glance set
 *  on the frames listed. Returns the frame-end session times. */
function drive(
  grid: GradeGrid,
  world: GradeGridWorld,
  h: GradeGridHooks,
  deltas: readonly number[],
  n: number,
  glanceOnFrames: ReadonlySet<number> = new Set(),
): number[] {
  let t = 0;
  const ends: number[] = [];
  for (let f = 0; f < n; f++) {
    t += deltas[f % deltas.length];
    ends.push(t);
    grid.stepFrame(t, glanceOnFrames.has(f) ? "left" : null, world, NO_WEATHER, h);
  }
  return ends;
}

describe("GradeGrid — the graded chain runs on the session grid", () => {
  it("grades at the grid point with the student AT it, never at the frame end (120 Hz, 144 Hz, 0.37 s, 60 Hz ± 0.2 µs)", () => {
    for (const [name, deltas] of [
      ["120 Hz", [1 / 120]],
      ["144 Hz", [1 / 144]],
      ["0.37 s", [0.37]],
      ["60 Hz ± 0.2 µs", [1 / 60 + 2e-7, 1 / 60 - 2e-7]],
    ] as const) {
      const { world, rec } = fakeWorld();
      const grid = new GradeGrid();
      drive(grid, world, hooks(rec), deltas, 200);
      expect(rec.sampleT.length, name).toBeGreaterThan(0);
      for (let i = 0; i < rec.sampleT.length; i++) {
        const k = Math.round(rec.sampleT[i] / H);
        // At the grid point's own time, k·H — a product, never a sum…
        expect(Object.is(rec.sampleT[i], k * H), `${name}: tick ${i} at ${rec.sampleT[i]}`).toBe(true);
        // …with the student read there: his x is 10·t at the grid point.
        expect(rec.sampleX[i], `${name}: student read at the grid point`).toBeCloseTo(k * H * 10, 12);
        // The world and the director stand at the same instant.
        expect(rec.trafficT[i], name).toBe(rec.sampleT[i]);
        expect(rec.directorT[i], name).toBe(rec.sampleT[i]);
      }
      // Consecutive grid points from the first one after the origin, none
      // skipped, none repeated.
      expect(Math.round(rec.sampleT[0] / H), `${name}: the first graded point`).toBe(1);
      for (let i = 1; i < rec.sampleT.length; i++) {
        expect(Math.round(rec.sampleT[i] / H) - Math.round(rec.sampleT[i - 1] / H), name).toBe(1);
      }
    }
  });

  it("a long frame is graded at EVERY grid point inside it (one 0.5 s frame = 30 points)", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    drive(grid, world, hooks(rec), [1 / 60], 600);
    expect(rec.sampleT.length).toBe(600);
    rec.sampleT.length = 0;
    const n = grid.stepFrame(10.5, null, world, NO_WEATHER, hooks(rec));
    expect(n).toBe(30);
    expect(rec.sampleT.map((t) => Math.round(t / H))).toEqual(Array.from({ length: 30 }, (_, i) => 601 + i));
  });

  it("ONE ORIGIN: the FIRST frame brings every grid point inside it — the world and the signal clock are as far in as the car (0.5 s, 0.25 s, 0.1 s, 2/60 s, 1/60 s, 1/144 s first frames)", () => {
    for (const first of [0.5, 0.25, 0.1, 2 / 60, 1 / 60, 1 / 144]) {
      const { world, rec } = fakeWorld();
      const grid = new GradeGrid();
      const name = `first frame ${first.toFixed(4)} s`;
      const expected = Math.floor(first / H + 1e-6);
      // The steps rapier takes in a first frame of that length.
      expect(grid.stepFrame(first, null, world, NO_WEATHER, hooks(rec)), name).toBe(expected);
      // Points 1 … n, never the origin, each one step of the signal clock,
      // the traffic world and the director, with the car read AT the point.
      expect(rec.sampleT.map((t) => Math.round(t / H)), name).toEqual(Array.from({ length: expected }, (_, i) => 1 + i));
      for (const dt of [...rec.updates, ...rec.trafficDt, ...rec.directorDt]) expect(dt, name).toBe(H);
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
      // After the first frame: the signal clock and the world have advanced
      // to the newest grid point at or before the session clock — never one
      // step, whatever the frame's length (round 4: 0.0167 s after 0.5 s).
      expect(sum(rec.updates), `${name}: signal clock`).toBeCloseTo(expected * H, 12);
      expect(sum(rec.trafficDt), `${name}: traffic clock`).toBeCloseTo(expected * H, 12);
      expect(first - sum(rec.updates), `${name}: the world is less than one step behind the session clock`).toBeLessThan(H + 1e-9);
      for (let i = 0; i < rec.sampleT.length; i++) expect(rec.sampleX[i], name).toBeCloseTo(rec.sampleT[i] * 10, 12);
      // …and one second in, every cadence stands at the same grid point
      // with the same world time.
      while (grid.clock.last < 60) grid.stepFrame(grid.clock.timeOf(grid.clock.last + 1), null, world, NO_WEATHER, hooks(rec));
      expect(sum(rec.updates), `${name}: signal clock at 1 s`).toBeCloseTo(1, 12);
      expect(rec.sampleT.length, `${name}: graded points at 1 s`).toBe(60);
    }
  });

  it("every interval is (k − kPrev)·FIXED_DT, never the frame's own length (0.37 s and 1/144 s frames)", () => {
    for (const deltas of [[0.37], [1 / 144], [0.123, 0.456]]) {
      const { world, rec } = fakeWorld();
      const grid = new GradeGrid();
      drive(grid, world, hooks(rec), deltas, 120);
      for (const dt of [...rec.updates, ...rec.trafficDt, ...rec.directorDt]) expect(dt).toBe(H);
    }
  });

  it("a frame that crosses no grid point grades nothing; its glance is heard at the next grid point exactly once (144 Hz)", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    // At 144 Hz some frame after the first graded one crosses no grid point
    // (frames end every 6.9 ms, grid points come every 16.7 ms)… find such a
    // frame and glance on it.
    const ends: number[] = [];
    let t = 0;
    for (let f = 0; f < 9; f++) {
      t += 1 / 144;
      ends.push(t);
    }
    const emptyFrame = ends.findIndex(
      (e, i) => i > 2 && Math.floor(e / H + 1e-6) === Math.floor(ends[i - 1] / H + 1e-6),
    );
    expect(emptyFrame).toBeGreaterThan(2);
    const before = new SessionGridClock();
    let points = 0;
    for (let f = 0; f < ends.length; f++) {
      const span = before.advance(ends[f], { first: 0, last: -1 });
      const graded = grid.stepFrame(ends[f], f === emptyFrame ? "left" : null, world, NO_WEATHER, hooks(rec));
      expect(graded).toBe(Math.max(0, span.last - span.first + 1));
      if (f === emptyFrame) expect(graded).toBe(0);
      points += graded;
    }
    expect(rec.glances.length).toBe(points);
    expect(rec.glances.filter((g) => g === "left")).toHaveLength(1);
    // …at the first grid point AFTER the frame that carried it.
    const heard = rec.glances.indexOf("left");
    expect(rec.sampleT[heard]).toBeGreaterThan(ends[emptyFrame]);
    // And the drawn pose still follows every frame end, graded or not.
    expect(rec.renderT).toEqual(ends);
  });

  it("per point, the order the live frame always ran: signals → traffic → contacts → lead gap → sample → director → point", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    drive(grid, world, hooks(rec), [1 / 60], 60);
    rec.calls.length = 0;
    grid.stepFrame(1 + 2 * H, null, world, NO_WEATHER, hooks(rec));
    const one = ["update", "traffic", "contacts", "leadGap", "sample", "director", "point"];
    expect(rec.calls).toEqual([...one, ...one, "render"]);
  });

  it("an exact 60 Hz frame is one grid point at its own end", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    const ends = drive(grid, world, hooks(rec), [1 / 60], 300);
    expect(rec.sampleT.length).toBe(ends.length);
    for (let i = 0; i < ends.length; i++) expect(Math.abs(rec.sampleT[i] - ends[i])).toBeLessThan(1e-9);
  });

  it("the session ending at a point stops the frame's grading there", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    // The origin itself is never graded: no step has ended there.
    expect(grid.stepFrame(0, null, world, NO_WEATHER, hooks(rec))).toBe(0);
    expect(rec.sampleT).toEqual([]);
    let seen = 0;
    const n = grid.stepFrame(0.5, null, world, NO_WEATHER, hooks(rec, { onPoint: () => ++seen === 7 }));
    expect(n).toBe(7);
  });
});

describe("SessionGridClock", () => {
  it("ONE ORIGIN: every frame — the first included — brings every point after the last one handed out, by an integer index", () => {
    const c = new SessionGridClock();
    const s = { first: 0, last: -1 };
    // The origin is not a graded point, and a frame that has not reached the
    // first grid point brings none.
    expect(c.last).toBe(0);
    expect(c.advance(0, s)).toEqual({ first: 1, last: 0 });
    expect(c.advance(0.9 * H, s)).toEqual({ first: 1, last: 0 });
    // A first frame of 0.05 s brings points 1, 2, 3 — not «the newest only».
    expect(c.advance(0.05, s)).toEqual({ first: 1, last: 3 });
    expect(c.advance(0.051, s)).toEqual({ first: 4, last: 3 });
    expect(c.advance(0.1, s)).toEqual({ first: 4, last: 6 });
    // Σ(1/60) drifts in the 13th digit; the point is still the point.
    let t = 0;
    const d = new SessionGridClock();
    for (let k = 1; k <= 3600; k++) {
      t += 1 / 60;
      expect(d.advance(t, s)).toEqual({ first: k, last: k });
    }
    expect(c.advance(10, s, 0.2)).toEqual({ first: 7, last: 12 });
    c.reset();
    // A 0.5 s first frame: thirty points, the steps rapier takes in it.
    expect(c.advance(0.5, s)).toEqual({ first: 1, last: 30 });
    c.reset();
    expect(c.advance(1, s)).toEqual({ first: 1, last: 60 });
    // A grid point is graded only once the session clock has REACHED it —
    // never on the frame before (rounding would grade a state not yet stepped).
    expect(c.advance(1 + 1.56 * H, s)).toEqual({ first: 61, last: 61 });
    expect(c.advance(1 + 1.99 * H, s)).toEqual({ first: 62, last: 61 });
    expect(c.advance(1 + 2 * H, s)).toEqual({ first: 62, last: 62 });
  });

  it("ONE CLOCK: advanceSteps brings exactly the steps the physics engine took — no session time involved", () => {
    const c = new SessionGridClock();
    const s = { first: 0, last: -1 };
    expect(c.advanceSteps(0, s)).toEqual({ first: 1, last: 0 });
    expect(c.advanceSteps(30, s)).toEqual({ first: 1, last: 30 });
    expect(c.advanceSteps(1, s)).toEqual({ first: 31, last: 31 });
    expect(c.advanceSteps(0, s)).toEqual({ first: 32, last: 31 });
    expect(c.advanceSteps(2, s)).toEqual({ first: 32, last: 33 });
    expect(c.last).toBe(33);
    // A negative or broken count brings nothing and moves nothing.
    expect(c.advanceSteps(-3, s)).toEqual({ first: 34, last: 33 });
    expect(c.advanceSteps(Number.NaN, s)).toEqual({ first: 34, last: 33 });
    expect(c.last).toBe(33);
  });
});

describe("PhysicsSessionClock — the session clock shares its origin with the physics engine's first counted step", () => {
  it("is the plain sum of the clamped deltas once the engine steps — the frame end lies the accumulator's remainder past the newest step", () => {
    for (const deltas of [[1 / 60], [1 / 144], [0.5], [0.25, 0.4], [0.0166], [0.0167]]) {
      const clock = new PhysicsSessionClock();
      let acc = 0;
      let steps = 0;
      let sum = 0;
      for (let f = 0; f < 400; f++) {
        const d = deltas[f % deltas.length];
        // rapier's stepper, then the driver's clock.
        acc += d;
        while (acc >= H) {
          steps++;
          acc -= H;
        }
        sum += d;
        const t = clock.frame(d, steps);
        if (steps === 0) {
          expect(t).toBe(0);
          continue;
        }
        expect(Object.is(t, sum), `Σδ at frame ${f}`).toBe(true);
        expect(t - steps * H).toBeGreaterThan(-1e-9);
        expect(t - steps * H).toBeLessThan(H + 1e-9);
      }
    }
  });

  it("stands at its origin until the first counted step, and drops whole steps nothing could count — once", () => {
    const clock = new PhysicsSessionClock();
    // Frame 0: 0.3 s — the engine took 18 steps before any listener was
    // registered (rapier registers a step listener in a passive effect).
    expect(clock.frame(0.3, 0)).toBe(0);
    expect(clock.timeSec).toBe(0);
    // Frame 1: 20 ms, one step counted. The accumulator holds 0.3 + 0.02 −
    // 19 steps = 3.33 ms; the session is one step and that remainder in.
    const t1 = clock.frame(0.02, 1);
    expect(t1).toBeCloseTo(H + (0.32 - 19 * H), 12);
    expect(t1 - 1 * H).toBeGreaterThanOrEqual(0);
    expect(t1 - 1 * H).toBeLessThan(H);
    // From here it is a pure sum again: no second correction, whatever the
    // step count says (a frame the engine did not step in).
    const t2 = clock.frame(0.5, 1);
    expect(t2).toBeCloseTo(t1 + 0.5, 12);
    expect(clock.timeSec).toBe(t2);
  });
});

describe("PlayerStepTrackRecorder — the physics engine's steps, numbered for the life of the scene", () => {
  it("step n is step n: nothing is pinned to the session time, nothing is lowered, nothing is reset", () => {
    const r = new PlayerStepTrackRecorder();
    const out = { x: -1, y: -1, speedKmh: -1, headingDeg: -1 };
    expect(r.stepCount).toBe(0);
    expect(r.stateAtStep(1, out)).toBe(false);
    expect(out.x).toBe(-1);
    // Step n leaves the car at x = n.
    for (let n = 1; n <= 5; n++) r.record(n, 2 * n, 10 + n, 90);
    expect(r.stepCount).toBe(5);
    for (let n = 1; n <= 5; n++) {
      expect(r.stateAtStep(n, out)).toBe(true);
      expect(out).toEqual({ x: n, y: 2 * n, speedKmh: 10 + n, headingDeg: 90 });
    }
    // Not taken yet, and before the first: not held.
    expect(r.stateAtStep(6, out)).toBe(false);
    expect(r.stateAtStep(0, out)).toBe(false);
    // The ring holds the newest 64; older steps are not held, the numbering
    // runs on.
    for (let n = 6; n <= 200; n++) r.record(n, 0, 0, 0);
    expect(r.stepCount).toBe(200);
    expect(r.stateAtStep(200, out) && out.x).toBe(200);
    expect(r.stateAtStep(137, out) && out.x).toBe(137);
    expect(r.stateAtStep(136, out)).toBe(false);
    // There is no syncGrid, no offset and no reset to call (round 4's offset
    // lowering repeated a state and read the car a step stale).
    expect(Object.getOwnPropertyNames(PlayerStepTrackRecorder.prototype).sort()).toEqual(
      ["constructor", "record", "stateAtStep", "stepCount"].sort(),
    );
  });
});

describe("GradeGrid.stepPhysics — the live frame: one grid point per physics step, the car read AT that step", () => {
  /** Step n leaves the car at x = 1000 + n, speed n. */
  const takeSteps = (r: PlayerStepTrackRecorder, m: number) => {
    for (let i = 0; i < m; i++) {
      const n = r.stepCount + 1;
      r.record(1000 + n, -n, n, (n * 7) % 360);
    }
  };
  /** A scene hook that — wrongly — writes the frame-end sample's pose. */
  const frameEndHook = (rec: Rec, frameEnd: { x: number }): GradeGridHooks =>
    hooks(rec, {
      student: (_k, _t, out) => {
        out.position.x = frameEnd.x;
        out.position.y = 777;
        out.headingDeg = 123;
        out.speedKmh = 999;
        out.indicator = "left";
        return 0.4;
      },
    });

  it("brings exactly the steps taken since the last frame — the first frame's thirty included — and none when the engine did not step", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    const r = new PlayerStepTrackRecorder();
    // A 0.5 s first live frame: rapier took 30 steps before the driver ran.
    takeSteps(r, 30);
    expect(grid.stepPhysics(r, 0.5, null, world, NO_WEATHER, hooks(rec))).toBe(30);
    expect(rec.sampleT.map((t) => Math.round(t / H))).toEqual(Array.from({ length: 30 }, (_, i) => 1 + i));
    for (const dt of [...rec.updates, ...rec.trafficDt, ...rec.directorDt]) expect(dt).toBe(H);
    // A 120 Hz frame in which the engine did not step: nothing graded.
    expect(grid.stepPhysics(r, 0.5 + 1 / 120, null, world, NO_WEATHER, hooks(rec))).toBe(0);
    takeSteps(r, 1);
    expect(grid.stepPhysics(r, 0.5 + 2 / 120, null, world, NO_WEATHER, hooks(rec))).toBe(1);
    takeSteps(r, 2);
    expect(grid.stepPhysics(r, 0.5 + 6 / 120, null, world, NO_WEATHER, hooks(rec))).toBe(2);
    expect(rec.sampleT.map((t) => Math.round(t / H))).toEqual(Array.from({ length: 33 }, (_, i) => 1 + i));
    // Every tick stands at k·H — a product — whatever the frame end was.
    for (const t of rec.sampleT) expect(Object.is(t, Math.round(t / H) * H)).toBe(true);
    // What is drawn follows the frame end.
    expect(rec.renderT).toEqual([0.5, 0.5 + 1 / 120, 0.5 + 2 / 120, 0.5 + 6 / 120]);
    // No physics source, no grade.
    const idle = fakeWorld();
    expect(new GradeGrid().stepPhysics(NO_PHYSICS_STEPS, 3, null, idle.world, NO_WEATHER, hooks(idle.rec))).toBe(0);
    expect(idle.rec.sampleT).toEqual([]);
  });

  it("grid point k reads the car after step k — the grid writes the pose, so a hook that hands over the frame-end sample cannot reach the grade", () => {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    const r = new PlayerStepTrackRecorder();
    const frameEnd = { x: 0 };
    const seen: Array<{ k: number; x: number; y: number; speed: number; heading: number; indicator: string }> = [];
    const h = frameEndHook(rec, frameEnd);
    h.onPoint = (p) => {
      seen.push({
        k: p.k,
        x: p.student.position.x,
        y: p.student.position.y,
        speed: p.student.speedKmh,
        heading: p.student.headingDeg,
        indicator: p.student.indicator,
      });
    };
    for (const m of [30, 0, 1, 2, 1, 0, 7]) {
      takeSteps(r, m);
      // The frame-end sample: the newest state (what the scene's interpolated
      // chassis would show) — NOT what points before the newest must read.
      frameEnd.x = 1000 + r.stepCount + 0.5;
      grid.stepPhysics(r, r.stepCount * H, null, world, NO_WEATHER, h);
    }
    expect(seen.length).toBe(41);
    for (let i = 0; i < seen.length; i++) {
      const k = i + 1;
      expect(seen[i], `grid point ${k}: the car after step ${k}`).toEqual({
        k,
        x: 1000 + k,
        y: -k,
        speed: k,
        heading: (k * 7) % 360,
        // The cabin's discrete channels ARE the hook's.
        indicator: "left",
      });
    }
    // The runtime sampled the same states (what becomes the tick).
    expect(rec.sampleX).toEqual(seen.map((s) => s.x));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ROUND 7 — the near-miss stat («мина на косъм») is stepped on the grid
// ───────────────────────────────────────────────────────────────────────────

describe("GradeGrid — the near-miss stat is measured at every grid point, from the student AT it and the traffic state there", () => {
  const V = 10; // m/s, each way: the student north along x = 0, an oncoming car south beside him
  const START_Y = 30;
  /** The oncoming car's lane: `clearanceM` of air between the two bodies. */
  const laneX = (clearanceM: number) => PLAYER_HALF_WIDTH_M + NEAR_MISS_VEHICLE_HALF_WIDTH_M + clearanceM;

  interface Heard {
    k: number;
    tSec: number;
    kind: string;
    npcId: number;
    clearanceM: number;
    relSpeedMps: number;
    count: number;
    /** The newest point `onPoint` had delivered when the near miss arrived. */
    afterPoint: number;
  }

  /** A world whose only inhabitant is one oncoming car, moved by
   *  `traffic.update` to where session time `sessionTimeSec` puts it. */
  function passWorld(clearanceM: number, periodSec = Infinity) {
    const car = { id: 7, x: laneX(clearanceM), y: START_Y, dirX: 0, dirY: -1, speedMps: V };
    const updatesAtRead: number[] = [];
    let updates = 0;
    const vehicles = new Proxy([car], {
      get(target, prop, recv) {
        if (prop === "0") updatesAtRead.push(updates);
        return Reflect.get(target, prop, recv);
      },
    });
    const world = {
      runtime: {
        update() {},
        sample: (v: VehicleSample, t: number): SimTick =>
          ({ t, position: { x: v.position.x, y: v.position.y }, events: [] as SimTickEvent[] }) as unknown as SimTick,
        signalPhase: () => "green" as const,
      },
      traffic: {
        update(_dt: number, ctx: { sessionTimeSec?: number }) {
          updates++;
          const t = ctx.sessionTimeSec ?? NaN;
          // With a period the same car comes past again every `periodSec`.
          car.y = START_Y - V * (Number.isFinite(periodSec) ? t % periodSec : t);
        },
        leadGapMeters: () => Infinity,
        setRenderSessionTime() {},
        staged: () => null,
        vehicles,
        pedestrians: [],
        vehicleCollisionKind: () => "cyclist" as const,
      },
      director: null,
    } as unknown as GradeGridWorld;
    return { world, updatesAtRead, updates: () => updates };
  }

  function pass(
    deltas: readonly number[],
    clearanceM: number,
    opts: { endAt?: number; noHook?: boolean; frameEndStudent?: boolean; periodSec?: number; seconds?: number; reversing?: boolean } = {},
  ) {
    const { world, updatesAtRead, updates } = passWorld(clearanceM, opts.periodSec);
    const grid = new GradeGrid();
    const heard: Heard[] = [];
    let lastPoint = 0;
    let frameEndSec = 0;
    const h: GradeGridHooks = {
      student: (_k, tSec, out) => {
        // The drive AT the grid point — or, for the teeth of the test, where
        // the car is at the frame's END (what a per-frame sampler reads).
        out.position.x = 0;
        const at = opts.frameEndStudent ? frameEndSec : tSec;
        out.position.y = V * (opts.periodSec !== undefined ? at % opts.periodSec : at);
        out.headingDeg = 0;
        // A reversing car reports a NEGATIVE speed (the sim's signed number).
        out.speedKmh = (opts.reversing ? -1 : 1) * V * 3.6;
        return 0;
      },
      onPoint: (p) => {
        lastPoint = p.k;
        return opts.endAt !== undefined && p.k >= opts.endAt;
      },
      ...(opts.noHook
        ? {}
        : {
            nearMiss: (e, stats) => {
              heard.push({
                k: Math.round(e.tSec / H),
                tSec: e.tSec,
                kind: e.kind,
                npcId: e.npcId,
                clearanceM: e.clearanceM,
                relSpeedMps: e.relSpeedMps,
                count: stats.count,
                afterPoint: lastPoint,
              });
            },
          }),
    };
    let graded = 0;
    for (let f = 0; frameEndSec < (opts.seconds ?? 3) && !(opts.endAt !== undefined && lastPoint >= opts.endAt); f++) {
      frameEndSec += deltas[f % deltas.length];
      graded += grid.stepFrame(frameEndSec, null, world, NO_WEATHER, h);
    }
    return { heard, graded, updatesAtRead, updates: updates() };
  }
  const core = (hs: Heard[]) => hs.map((e) => ({ ...e, afterPoint: 0 }));

  // The two cars are alongside while |30 − 20·t| < 2.02 + the car's half
  // length: the window opens at the first grid point past 1.2965 s (k = 78)
  // and the encounter RESOLVES at the first one past 1.7035 s — k = 103.
  const half = PLAYER_HALF_LENGTH_M + NEAR_MISS_VEHICLE_HALF_LENGTH_M;
  const K_RESOLVED = Math.floor((START_Y + half) / (2 * V) / H) + 1;

  it("one pass at 0.3 m is one near miss, resolved at the same grid point with the same numbers on every cadence — a 0.5 s frame included", () => {
    expect(K_RESOLVED).toBe(103);
    const ref = pass([1 / 60], 0.3);
    expect(ref.heard.length).toBe(1);
    const e = ref.heard[0];
    expect(e.k).toBe(K_RESOLVED);
    // Stamped with the grid point's own session time (a product, k·H).
    expect(Object.is(e.tSec, K_RESOLVED * H)).toBe(true);
    expect(e.kind).toBe("cyclist");
    expect(e.npcId).toBe(7);
    expect(e.clearanceM).toBeCloseTo(0.3, 5);
    expect(e.relSpeedMps).toBeCloseTo(2 * V, 5);
    expect(e.count).toBe(1);
    for (const [name, deltas] of [
      ["0.5 s", [0.5]],
      ["0.37 s", [0.37]],
      ["0.25/0.4 s", [0.25, 0.4]],
      ["144 Hz", [1 / 144]],
      ["120 Hz", [1 / 120]],
      ["a 0.5 s first frame, then 60 Hz", [0.5, ...Array.from({ length: 400 }, () => 1 / 60)]],
    ] as const) {
      expect(core(pass(deltas, 0.3).heard), name).toEqual(core(ref.heard));
    }
  });

  it("it is stepped once per grid point, AFTER the world moved to that point — thirty times inside a 0.5 s frame", () => {
    const r = pass([0.5], 0.3);
    // One look at the car per graded point, each made after that point's own
    // world update (the k-th look after the k-th update), none before it.
    // (The one extra look is the resolved encounter reading the car it names.)
    expect(r.updatesAtRead.length).toBe(r.graded + r.heard.length);
    expect([...new Set(r.updatesAtRead)]).toEqual(Array.from({ length: r.graded }, (_, i) => i + 1));
    expect(r.graded).toBe(r.updates);
    expect(r.graded).toBe(180);
  });

  it("the student it measures from is the one AT the grid point: with the frame's end pose on 0.5 s frames the same pass is not this near miss", () => {
    // Teeth. With the car where the FRAME ends for all thirty points of a
    // frame, the two bodies are seen alongside at other points, or never.
    const wrongPose = pass([0.5], 0.3, { frameEndStudent: true });
    const right = pass([0.5], 0.3);
    expect(right.heard.length).toBe(1);
    expect(core(wrongPose.heard)).not.toEqual(core(right.heard));
  });

  it("a near miss is handed over AFTER the tick of the point it resolved at — also when that point ended the session", () => {
    const r = pass([0.5], 0.3);
    expect(r.heard.map((e) => [e.k, e.afterPoint])).toEqual([[K_RESOLVED, K_RESOLVED]]);
    // The session ends ON the point the encounter resolves at: grading stops
    // there (no further point), and the near miss of that point still arrives.
    const ended = pass([0.5], 0.3, { endAt: K_RESOLVED });
    expect(ended.graded).toBe(K_RESOLVED);
    expect(ended.heard.map((e) => [e.k, e.afterPoint])).toEqual([[K_RESOLVED, K_RESOLVED]]);
    // …and a session that ended before it resolved never hears it.
    expect(pass([0.5], 0.3, { endAt: K_RESOLVED - 1 }).heard).toEqual([]);
  });

  it("the re-arm delay runs on the grid's own interval, (k − kPrev)·FIXED_DT: the same car passing again inside 2 s of session time is not a second near miss, on any cadence", () => {
    // The car comes past every 1.9 s: passes around 1.5 s, 3.4 s and 5.3 s. The
    // first resolves at 1.717 s and re-arms 2 s later, at 3.717 s — after the
    // second pass has come and gone — so the stat counts the first and third.
    const ref = pass([1 / 60], 0.3, { periodSec: 1.9, seconds: 6 });
    expect(ref.heard.map((e) => e.k)).toEqual([103, 331]);
    expect(ref.heard.map((e) => e.count)).toEqual([1, 2]);
    for (const [name, deltas] of [
      ["0.5 s", [0.5]],
      ["0.25/0.4 s", [0.25, 0.4]],
      ["144 Hz", [1 / 144]],
    ] as const) {
      expect(core(pass(deltas, 0.3, { periodSec: 1.9, seconds: 6 }).heard), name).toEqual(core(ref.heard));
    }
  });

  it("the thresholds are the detector's own: 0.3 m is a near miss, 0.8 m of air is not; with no hook the stat is still stepped", () => {
    expect(pass([1 / 60], 0.8).heard).toEqual([]);
    expect(pass([0.5], 0.8).heard).toEqual([]);
    const silent = pass([0.5], 0.3, { noHook: true });
    expect(silent.heard).toEqual([]);
    // …and it reads the student's SIGNED speed, as it always did: the same
    // squeeze made in reverse is below the detector's «the player is moving»
    // floor and is no near miss (parking manoeuvres beside moving traffic).
    expect(pass([1 / 60], 0.3, { reversing: true }).heard).toEqual([]);
    expect(new Set(silent.updatesAtRead).size).toBe(silent.graded);
  });
});

describe("GradeGrid.stepPhysics — EVERY reader of the car inside the chain is handed the car after step k (round 7: the chain, hop by hop)", () => {
  it("the traffic agents, the lead-gap query, the runtime's sample and the scenario director all get step k's position, heading and speed — never what the hook wrote", () => {
    interface Read {
      who: string;
      k: number;
      x: number;
      y: number;
      heading: number;
      speed: number;
    }
    const reads: Read[] = [];
    let k = 0;
    const world = {
      runtime: {
        update() {
          k++;
        },
        sample(v: VehicleSample, t: number): SimTick {
          reads.push({ who: "sample", k, x: v.position.x, y: v.position.y, heading: v.headingDeg, speed: v.speedKmh });
          return { t, position: { x: v.position.x, y: v.position.y }, events: [] as SimTickEvent[] } as unknown as SimTick;
        },
        signalPhase: () => "green" as const,
      },
      traffic: {
        update(
          _dt: number,
          ctx: { playerPos: { x: number; y: number }; playerSpeedKmh: number; playerHeadingDeg: number },
        ) {
          reads.push({ who: "traffic", k, x: ctx.playerPos.x, y: ctx.playerPos.y, heading: ctx.playerHeadingDeg, speed: ctx.playerSpeedKmh });
        },
        leadGapMeters(x: number, y: number, heading: number) {
          reads.push({ who: "leadGap", k, x, y, heading, speed: k });
          return Infinity;
        },
        setRenderSessionTime() {},
        staged: () => null,
        vehicles: [],
        pedestrians: [],
        vehicleCollisionKind: () => "vehicle" as const,
      },
      director: {
        step(input: DirectorInput): DirectorStepResult {
          reads.push({ who: "director", k, x: input.x, y: input.y, heading: input.headingDeg, speed: input.speedKmh });
          return { events: [], outcomes: [] };
        },
      } as unknown as ScenarioDirector,
    } as unknown as GradeGridWorld;
    const grid = new GradeGrid();
    const r = new PlayerStepTrackRecorder();
    const h: GradeGridHooks = {
      // A scene gone back to the frame's sample: a pose and a speed that are
      // the car's on no step.
      student: (_k, _t, out) => {
        out.position.x = -4000;
        out.position.y = 777;
        out.headingDeg = 123;
        out.speedKmh = 999;
        return 0;
      },
      onPoint: (p) => {
        reads.push({ who: "point", k, x: p.student.position.x, y: p.student.position.y, heading: p.student.headingDeg, speed: p.student.speedKmh });
      },
    };
    // The recorder's steps are numbered; step n is (1000 + n, −n), n·7°, n km/h.
    for (const m of [30, 0, 1, 2, 18]) {
      for (let i = 0; i < m; i++) {
        const n = r.stepCount + 1;
        r.record(1000 + n, -n, n, (n * 7) % 360);
      }
      grid.stepPhysics(r, r.stepCount * H, null, world, NO_WEATHER, h);
    }
    expect(k).toBe(51);
    const wrong = reads.filter((x) => x.x !== 1000 + x.k || x.y !== -x.k || x.heading !== (x.k * 7) % 360 || x.speed !== x.k);
    expect(wrong.slice(0, 5), "readers that were not handed the car after their own step").toEqual([]);
    // All five readers, at every one of the 51 points.
    for (const who of ["traffic", "leadGap", "sample", "director", "point"]) {
      expect(reads.filter((x) => x.who === who).length, who).toBe(51);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ROUND 8 — the looks are a QUEUE: every look of every frame is heard, in
// order, exactly once, one per grid point (the round-7 verifier's F1)
// ───────────────────────────────────────────────────────────────────────────

describe("GradeGrid — every look is heard: a queue, one look per grid point, the oldest first", () => {
  type Look = "left" | "right" | "rear" | "shoulder";
  interface HeardLook {
    k: number;
    look: Look;
  }
  /** A grid on the fake world that records which look each point heard. */
  function lookGrid(extra: Partial<GradeGridHooks> = {}) {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    const heard: HeardLook[] = [];
    const h = hooks(rec, {
      onPoint: (p) => {
        if (p.student.mirrorGlance !== null) heard.push({ k: p.k, look: p.student.mirrorGlance });
      },
      ...extra,
    });
    return { world, rec, grid, heard, h };
  }

  it("two looks on CONSECUTIVE FRAMES, the first on a frame that brought no grid point: both are heard, in order, at consecutive points (120 Hz) — the second frame's look does not erase the first", () => {
    const { world, rec, grid, heard, h } = lookGrid();
    // 120 Hz: frames 1, 3, 5 … bring no grid point; frames 2, 4, 6 … bring one.
    const glanceOn: Record<number, Look> = { 3: "left", 4: "right" };
    const graded: number[] = [];
    for (let f = 1; f <= 12; f++) graded.push(grid.stepFrame(f / 120, glanceOn[f] ?? null, world, NO_WEATHER, h));
    expect(graded).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
    // Frame 3 graded nothing: its look waited. Frame 4 brought point 2 and its
    // own look: point 2 hears the OLDER look, point 3 the newer one.
    expect(heard).toEqual([
      { k: 2, look: "left" },
      { k: 3, look: "right" },
    ]);
    // Each look reached the runtime's sample (what becomes the tick) once.
    expect(rec.glances.filter((g) => g !== null)).toEqual(["left", "right"]);
    expect(grid.pendingLooks).toBe(0);
    expect(grid.droppedLooks).toBe(0);
  });

  it("ONE LOOK PER GRID POINT: three looks handed over by one frame are heard at three consecutive points — never two at one point, never one twice", () => {
    for (const [name, firstFrame] of [
      ["a 60 Hz frame", 1 / 60],
      ["a 0.5 s frame", 0.5],
    ] as const) {
      const more: Look[] = ["right", "rear"];
      const { world, rec, grid, heard, h } = lookGrid({ moreLooks: () => more.shift() ?? null });
      grid.stepFrame(firstFrame, "left", world, NO_WEATHER, h);
      for (let k = grid.clock.last + 1; k <= 120; k++) grid.stepFrame(k * H, null, world, NO_WEATHER, h);
      expect(heard, name).toEqual([
        { k: 1, look: "left" },
        { k: 2, look: "right" },
        { k: 3, look: "rear" },
      ]);
      // 120 points graded; three of them carried a look, each look once.
      expect(rec.glances.length, name).toBe(120);
      expect(rec.glances.filter((g) => g !== null), name).toEqual(["left", "right", "rear"]);
    }
  });

  it("the frame's glance goes first and `moreLooks` is drained behind it, oldest first, until it is empty — also on a frame that brings no grid point", () => {
    const more: Look[] = [];
    let asked = 0;
    const { world, grid, heard, h } = lookGrid({
      moreLooks: () => {
        asked++;
        return more.shift() ?? null;
      },
    });
    const r = new PlayerStepTrackRecorder();
    // A frame in which the engine did not step: the cabin is drained all the same.
    more.push("right", "shoulder");
    expect(grid.stepPhysics(r, 1 / 120, "left", world, NO_WEATHER, h)).toBe(0);
    expect(asked).toBe(3); // two looks, then null
    expect(more).toEqual([]);
    expect(grid.pendingLooks).toBe(3);
    // A frame with nothing in the cabin asks once.
    grid.stepPhysics(r, 2 / 120, null, world, NO_WEATHER, h);
    expect(asked).toBe(4);
    for (let i = 0; i < 5; i++) {
      r.record(0, 0, 0, 0);
      grid.stepPhysics(r, r.stepCount * H, null, world, NO_WEATHER, h);
    }
    expect(heard).toEqual([
      { k: 1, look: "left" },
      { k: 2, look: "right" },
      { k: 3, look: "shoulder" },
    ]);
  });

  it("a look has ONE way in: what the student hook writes into `mirrorGlance` is not heard", () => {
    const { world, rec, grid, heard } = lookGrid();
    const h = hooks(rec, {
      // A caller that writes a look straight into every grid point's sample
      // (round 7's replay harness did).
      student: (_k, tSec, out) => {
        out.position.x = tSec * 10;
        out.mirrorGlance = "rear";
        return 0;
      },
      onPoint: (p) => {
        if (p.student.mirrorGlance !== null) heard.push({ k: p.k, look: p.student.mirrorGlance });
      },
    });
    grid.stepFrame(0.5, null, world, NO_WEATHER, h);
    expect(rec.glances.length).toBe(30);
    expect(heard, "looks heard that no frame handed over").toEqual([]);
    grid.stepFrame(0.5 + H, "left", world, NO_WEATHER, h);
    expect(heard).toEqual([{ k: 31, look: "left" }]);
  });

  it("the queue is bounded and says so: the ninth look waiting is dropped and COUNTED, the eight ahead of it are heard in order", () => {
    expect(GRADE_GRID_LOOK_CAPACITY).toBe(8);
    const { world, grid, heard, h } = lookGrid();
    const r = new PlayerStepTrackRecorder();
    const pressed: Look[] = ["left", "right", "rear", "shoulder", "left", "rear", "right", "shoulder", "left"];
    // Nine frames in which the engine never stepped (a source no driver is).
    pressed.forEach((look, i) => grid.stepPhysics(r, (i + 1) / 1000, look, world, NO_WEATHER, h));
    expect(grid.pendingLooks).toBe(8);
    expect(grid.droppedLooks).toBe(1);
    for (let i = 0; i < 12; i++) {
      r.record(0, 0, 0, 0);
      grid.stepPhysics(r, 1, null, world, NO_WEATHER, h);
    }
    expect(heard.map((x) => x.look)).toEqual(pressed.slice(0, 8));
    expect(heard.map((x) => x.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(grid.pendingLooks).toBe(0);
    expect(grid.droppedLooks).toBe(1);
  });

  it("the session ending on a point: a look whose turn had not come is NOT graded, and is still counted as waiting (the stated loss)", () => {
    const more: Look[] = ["right"];
    const { world, rec, grid, heard } = lookGrid();
    const seen: HeardLook[] = [];
    const h = hooks(rec, {
      moreLooks: () => more.shift() ?? null,
      // The session ends on the first point of this frame — the one that
      // hears the first look.
      onPoint: (p) => {
        if (p.student.mirrorGlance !== null) seen.push({ k: p.k, look: p.student.mirrorGlance });
        return true;
      },
    });
    expect(grid.stepFrame(0.5, "left", world, NO_WEATHER, h)).toBe(1);
    expect(seen).toEqual([{ k: 1, look: "left" }]);
    expect(heard).toEqual([]);
    // The second look was made, was not heard, and the grid says so.
    expect(grid.pendingLooks, "looks still waiting when the session ended").toBe(1);
    expect(grid.droppedLooks).toBe(0);
  });

  it("a RESPAWN drops what was pending: a look still waiting is not heard after `reset`", () => {
    const { world, grid, heard, h } = lookGrid();
    const r = new PlayerStepTrackRecorder();
    // Two looks on frames in which the engine did not step.
    grid.stepPhysics(r, 1 / 240, "left", world, NO_WEATHER, h);
    grid.stepPhysics(r, 2 / 240, "right", world, NO_WEATHER, h);
    expect(grid.pendingLooks).toBe(2);
    grid.reset();
    expect(grid.pendingLooks).toBe(0);
    for (let i = 0; i < 10; i++) {
      r.record(0, 0, 0, 0);
      grid.stepPhysics(r, r.stepCount * H, null, world, NO_WEATHER, h);
    }
    expect(heard, "looks made before the respawn, heard after it").toEqual([]);
    // The control: without the reset both are heard, at points 1 and 2.
    const c = lookGrid();
    const rc = new PlayerStepTrackRecorder();
    c.grid.stepPhysics(rc, 1 / 240, "left", c.world, NO_WEATHER, c.h);
    c.grid.stepPhysics(rc, 2 / 240, "right", c.world, NO_WEATHER, c.h);
    for (let i = 0; i < 10; i++) {
      rc.record(0, 0, 0, 0);
      c.grid.stepPhysics(rc, rc.stepCount * H, null, c.world, NO_WEATHER, c.h);
    }
    expect(c.heard).toEqual([
      { k: 1, look: "left" },
      { k: 2, look: "right" },
    ]);
    // The grid index runs on through a respawn: it is the session's.
    expect(grid.clock.last).toBe(10);
  });

  it("a RESPAWN drops what was pending: a near-miss window open when the car is put back on its spawn point does not resolve as a pass", () => {
    const V = 10;
    const laneX = PLAYER_HALF_WIDTH_M + NEAR_MISS_VEHICLE_HALF_WIDTH_M + 0.3;
    /** The student drives north along x = 0 past an oncoming car 0.3 m away;
     *  at grid point `respawnAt` he is put back on a spawn point far away. */
    function squeeze(respawnAt: number, reset: boolean, opts: { stay?: boolean; periodSec?: number; points?: number } = {}) {
      const car = { id: 7, x: laneX, y: 30, dirX: 0, dirY: -1, speedMps: V };
      /** With a period the same car comes past again every `periodSec`. */
      const lap = (t: number) => (opts.periodSec !== undefined ? t % opts.periodSec : t);
      const world = {
        runtime: {
          update() {},
          sample: (v: VehicleSample, t: number): SimTick =>
            ({ t, position: { x: v.position.x, y: v.position.y }, events: [] as SimTickEvent[] }) as unknown as SimTick,
          signalPhase: () => "green" as const,
        },
        traffic: {
          update(_dt: number, ctx: { sessionTimeSec?: number }) {
            car.y = 30 - V * lap(ctx.sessionTimeSec ?? NaN);
          },
          leadGapMeters: () => Infinity,
          setRenderSessionTime() {},
          staged: () => null,
          vehicles: [car],
          pedestrians: [],
          vehicleCollisionKind: () => "vehicle" as const,
        },
        director: null,
      } as unknown as GradeGridWorld;
      const grid = new GradeGrid();
      const events: Array<{ k: number; count: number }> = [];
      const h: GradeGridHooks = {
        student: (k, tSec, out) => {
          // `stay`: the car is put back where it already is (a respawn that
          // moves nothing) — what is left is the reset itself.
          const lifted = k >= respawnAt && opts.stay !== true;
          out.position.x = lifted ? 500 : 0;
          out.position.y = lifted ? 500 : V * lap(tSec);
          out.headingDeg = 0;
          out.speedKmh = V * 3.6;
          return 0;
        },
        onPoint: () => {},
        nearMiss: (e, stats) => events.push({ k: Math.round(e.tSec / H), count: stats.count }),
      };
      for (let k = 1; k <= (opts.points ?? 200); k++) {
        // The respawn happens between two frames, before the point that first
        // reads the car at the spawn point (LessonScene `resetCar`).
        if (reset && k === respawnAt) grid.reset();
        grid.stepFrame(k * H, null, world, NO_WEATHER, h);
      }
      return events;
    }
    // The two bodies are alongside from point 78 to point 102 (the round-7
    // tests above); point 90 is in the middle of the squeeze.
    // Without the reset the teleport «separates» the bodies and the open
    // window resolves — as a near miss the student never completed.
    expect(squeeze(90, false)).toEqual([{ k: 90, count: 1 }]);
    // With it the window is forgotten: nothing is reported, then or later.
    expect(squeeze(90, true), "an encounter pending at the respawn, reported after it").toEqual([]);
    // …and a pass that RESOLVED before the respawn stays in the session's
    // aggregate: the respawn is not a new session.
    expect(squeeze(150, true)).toEqual([{ k: 103, count: 1 }]);
    // The session's running aggregate RUNS ON through the respawn: the next
    // near miss after it is the session's second, not a first again. (The same
    // car comes past every 1.9 s; with no respawn the pass at 3.4 s falls
    // inside the detector's 2 s re-arm and the session counts passes 1 and 3.
    // The respawn forgets the re-arm with the rest of what was pending.)
    const laps = { stay: true, periodSec: 1.9, points: 400 };
    expect(squeeze(150, false, laps).map((e) => e.count)).toEqual([1, 2]);
    const after = squeeze(150, true, laps);
    expect(after[0]).toEqual({ k: 103, count: 1 });
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(after.map((e) => e.count), "the session's near-miss count across a respawn").toEqual(after.map((_, i) => i + 1));
    expect(after[1].k).toBeGreaterThan(150);
  });
});

describe("the looks through the LIVE entry, modelled: the cabin's own queue, rapier's accumulator, the grid — on 14 display cadences", () => {
  type Look = "left" | "right" | "rear" | "shoulder";
  const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
  const CADENCES: Array<[string, number[]]> = [
    ["60 Hz", [1 / 60]],
    ["60 Hz ± 1 ms", [1 / 60 + 0.001, 1 / 60 - 0.001]],
    ["59.94 Hz", [1 / 59.94]],
    ["75 Hz", [1 / 75]],
    ["90 Hz", [1 / 90]],
    ["120 Hz", [1 / 120]],
    ["144 Hz", [1 / 144]],
    ["165 Hz", [1 / 165]],
    ["240 Hz", [1 / 240]],
    ["16.6/16.7/16.7 ms", [0.0166, 0.0167, 0.0167]],
    ["30 Hz", [1 / 30]],
    ["0.25/0.4 s", [0.25, 0.4]],
    ["0.5 s", [0.5]],
    ["a 0.5 s first frame, then 144 Hz", [0.5, ...rep(40000, 1 / 144)]],
  ];

  /**
   * LessonScene's frame, modelled with the product's own classes: presses made
   * since the last frame are latched in the cabin's queue (`GlanceSampleQueue`);
   * rapier's stepper runs its accumulator and the rig records a step each;
   * VehicleRig's sample builder takes ONE look (`sample.mirrorGlance`);
   * RuntimeDriver calls `stepPhysics` with it and the `moreLooks` hook the
   * scene passes. `presses` are bursts: at frame `f`, the looks listed.
   */
  function live(deltas: readonly number[], frames: number, burstAt: (f: number) => Look[] | null, oneLookPerFrame = false) {
    const { world, rec } = fakeWorld();
    const grid = new GradeGrid();
    const cabin = new GlanceSampleQueue();
    const r = new PlayerStepTrackRecorder();
    const heard: Array<{ k: number; look: Look; id: number }> = [];
    /** Every look handed to the grid, in order, with the first grid point not
     *  yet graded when its frame ran. */
    const handed: Array<{ id: number; look: Look; firstUngraded: number; burst: number }> = [];
    const inCabin: Array<{ id: number; burst: number }> = [];
    let pressed = 0;
    let droppedByCabin = 0;
    let acc = 0;
    let t = 0;
    let frame = 0;
    const note = (look: Look) => {
      const meta = inCabin.shift() as { id: number; burst: number };
      handed.push({ id: meta.id, look, firstUngraded: grid.clock.last + 1, burst: meta.burst });
    };
    const h = hooks(rec, {
      ...(oneLookPerFrame
        ? {}
        : {
            moreLooks: () => {
              const more = cabin.take();
              if (more !== null) note(more);
              return more;
            },
          }),
      onPoint: (p) => {
        if (p.student.mirrorGlance !== null) heard.push({ k: p.k, look: p.student.mirrorGlance, id: -1 });
      },
    });
    for (frame = 0; frame < frames; frame++) {
      const burst = burstAt(frame);
      if (burst) {
        for (const look of burst) {
          const before = cabin.length;
          cabin.push(look);
          if (cabin.length > before) inCabin.push({ id: pressed, burst: frame });
          else droppedByCabin++;
          pressed++;
        }
      }
      const d = Math.min(deltas[frame % deltas.length], 0.5);
      acc += d;
      t += d;
      while (acc >= H) {
        r.record(t, 0, 30, 0);
        acc -= H;
      }
      const frameGlance = cabin.take();
      if (frameGlance !== null) note(frameGlance);
      grid.stepPhysics(r, t, frameGlance, world, NO_WEATHER, h);
    }
    return { heard, handed, pressed, droppedByCabin, grid, cabinLeft: cabin.length };
  }

  it("2,000 two-key presses inside one frame: on every cadence both looks are heard, in order, exactly once, at CONSECUTIVE grid points starting at the first point not yet graded when their frame ran", () => {
    for (const [name, deltas] of CADENCES) {
      const long = deltas[deltas.length - 1] > 0.2;
      // A press every 37 frames (every 5th on the long-frame cadences).
      const every = long ? 5 : 37;
      const frames = every * 2000 + 3 * every;
      const r = live(deltas, frames, (f) => (f % every === 2 && f < every * 2000 ? ["left", "right"] : null));
      expect(r.pressed, name).toBe(4000);
      expect(r.droppedByCabin, name).toBe(0);
      expect(r.grid.droppedLooks, name).toBe(0);
      expect(r.grid.pendingLooks + r.cabinLeft, `${name}: looks never heard`).toBe(0);
      expect(r.heard.length, `${name}: looks heard`).toBe(4000);
      let wrongOrder = 0;
      let notConsecutive = 0;
      let notFirstPoint = 0;
      for (let i = 0; i < 2000; i++) {
        const a = r.heard[2 * i];
        const b = r.heard[2 * i + 1];
        if (a.look !== "left" || b.look !== "right") wrongOrder++;
        if (b.k !== a.k + 1) notConsecutive++;
        if (a.k !== r.handed[2 * i].firstUngraded) notFirstPoint++;
      }
      expect({ wrongOrder, notConsecutive, notFirstPoint }, name).toEqual({ wrongOrder: 0, notConsecutive: 0, notFirstPoint: 0 });
    }
  });

  it("a burst of FOUR keys inside one frame is heard over four consecutive grid points on every cadence — the last 3 steps after the first, a phone's 0.5 s frame included", () => {
    for (const [name, deltas] of CADENCES) {
      const r = live(deltas, 400, (f) => (f % 40 === 7 ? ["left", "right", "rear", "shoulder"] : null));
      expect(r.heard.length, name).toBe(r.pressed);
      expect(r.pressed, name).toBe(40);
      const waits: number[] = [];
      for (let i = 0; i < r.heard.length; i += 4) {
        expect(r.heard.slice(i, i + 4).map((x) => x.look), name).toEqual(["left", "right", "rear", "shoulder"]);
        waits.push(r.heard[i + 3].k - r.heard[i].k);
      }
      expect([...new Set(waits)], `${name}: steps between the first and the last look of a burst`).toEqual([3]);
    }
  });

  it("WHY the frame hands over every look: drained at one look per FRAME, the last look of that burst is heard 90 steps (1.5 s) late on a 0.5 s frame — and exactly as with `moreLooks` on every display of 60 Hz or faster", () => {
    const burst = (f: number): Look[] | null => (f % 40 === 7 ? ["left", "right", "rear", "shoulder"] : null);
    const perFrame = live([0.5], 400, burst, true);
    expect(perFrame.heard.length).toBe(40);
    expect(perFrame.heard[3].k - perFrame.heard[0].k).toBe(90);
    for (const [name, deltas] of CADENCES) {
      if (deltas.some((d) => d > H + 1e-9)) continue; // a frame longer than a step
      const one = live(deltas, 2000, burst, true);
      const all = live(deltas, 2000, burst, false);
      expect(one.heard.length, name).toBeGreaterThan(0);
      expect(one.heard.map((x) => `${x.look}@${x.k}`), `${name}: one look per frame vs every look`).toEqual(
        all.heard.map((x) => `${x.look}@${x.k}`),
      );
    }
  });

  it("a driver who never stops pressing (a look on EVERY frame at 240 Hz — 240 a second, four times what the grid hears) fills the queue to its bound and no further; what is lost is counted", () => {
    const kinds: Look[] = ["left", "right", "rear", "shoulder"];
    const r = live([1 / 240], 2400, (f) => [kinds[f % 4]]);
    expect(r.pressed).toBe(2400);
    expect(r.grid.pendingLooks).toBeLessThanOrEqual(GRADE_GRID_LOOK_CAPACITY);
    // Sixty looks a second are heard — one per grid point, none twice.
    expect(r.heard.length).toBe(r.grid.clock.last);
    expect(r.heard.length + r.grid.droppedLooks + r.grid.pendingLooks + r.cabinLeft + r.droppedByCabin).toBe(2400);
    expect(r.grid.droppedLooks).toBeGreaterThan(1500);
  });
});
