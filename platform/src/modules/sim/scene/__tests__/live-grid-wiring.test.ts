/**
 * sc-roundabout-entry:7b747c15 round 5 — THE LIVE WIRING OF THE SESSION GRID.
 *
 * The replay harness (lessons/scenario/__tests__/liveChainReplay.ts) has no
 * rapier in it, so everything the census pins prove about the grid they prove
 * for a grid derived from the session time. The PRODUCT's grid is driven by
 * the physics engine's own steps, through three seams no replay can see:
 *
 *   rapier's stepper  (node_modules/@react-three/rapier — its accumulator, its
 *                      0.5 s clamp, where it sits in <Physics>)
 *   VehicleRig        (records the car after every step into the
 *                      PlayerStepTrackRecorder)
 *   RuntimeDriver     (LessonScene: PhysicsSessionClock.frame, then
 *                      GradeGrid.stepPhysics off that recorder)
 *
 * Round 4's verifier refuted the build on exactly these seams (F1 the first
 * live frame, F2 the offset lowering that repeated a state, F3 nothing pinned
 * the scene's read or the hook order it depends on). So this file is two
 * things:
 *
 *  A. A MODEL of the wiring made of the REAL classes — PlayerStepTrackRecorder,
 *     PhysicsSessionClock, GradeGrid, sessionClockAdvance — around a copy of
 *     rapier's accumulator, whose every line is pinned against the installed
 *     bundle (§1) so the copy cannot drift from what the browser runs. Driven
 *     over 26 cadences × 120 s: every physics step is graded exactly once, in
 *     order, in the frame it was taken in, with the car read AT that step; the
 *     world's clocks stand at k·FIXED_DT at grid point k; the session clock is
 *     the accumulator's remainder past the newest step. The same model with
 *     the frame hooks in the OPPOSITE order fails those assertions — which is
 *     what makes the order a dependency worth pinning.
 *
 *  B. SOURCE PINS of the seams themselves: the scene's graded block calls
 *     `stepPhysics` with the recorder and writes no pose of its own, the
 *     session clock is fed the same clamped delta, RuntimeDriver is mounted
 *     inside <Physics> after VehicleRig with no frame priority anywhere, and
 *     VehicleRig records in `useAfterPhysicsStep`.
 *
 * ROUND 6 (the round-5 verifier's F1 and F2).
 *  · B stopped one hook short: the scene's `vruAheadM` hook could measure the
 *    person in the path from the frame-end sample and nothing here saw it. The
 *    grid measures that distance itself now, and §3 reads the WHOLE
 *    `stepPhysics` call as a syntax tree: every read of the frame's sample is
 *    one of ten named cabin channels, the names the call closes over are
 *    listed outright, the tick is handed on unwritten. (The same call is cut
 *    out and EXECUTED in lessons/scenario/__tests__/
 *    live-grade-call.execution.test.ts.)
 *  · A admitted a session clock one whole step ahead of the engine when the
 *    step listener arrived late and the first counted frame ended exactly on a
 *    grid point (50 of the verifier's 709 sessions; what is drawn, not what is
 *    graded). §2 now holds the claim itself — (session clock − steps·H) IS
 *    rapier's accumulator, to 1 ns, on every frame — on the 26 cadences, on
 *    those 709 sessions, and on the mirror case an epsilon-floor repair would
 *    have broken.
 *
 * ROUND 7 (the round-6 verifier's F1). B's pin of VehicleRig's after-step
 * record was the TEXT of one line, `rec.record(t.x, -t.z, sim.speedKmh,
 * headingDeg)`: a rig that filled `t` from `sampleRef.current` (RECALIAS), or
 * took the speed from the sample through a local named `sim` (RECSPEED),
 * passed this file and every other with that line untouched, and nothing ever
 * RAN the callback. The read is now a function of the rapier body and the
 * vehicle sim only (traffic/playerTrack.ts `recordPhysicsStep`), VehicleRig's
 * callback is that one call, and §4 executes both: the function against a body
 * and a sim, and the rig's own callback — cut out of VehicleRig.tsx as a tree
 * and run under a copy of rapier's stepper, registered under whichever hook
 * the source registers it — against a body and a sim that differ from the
 * frame's sample on every step.
 *
 * NOT CLAIMED: this is a model and a reading of the source, not a browser
 * drive. What a real device's first live frame is, and whether React flushes
 * rapier's passive-effect listeners before the first animation frame, are
 * owed to a drive of the real page.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Euler, Group, Quaternion } from "three";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sessionClockAdvance } from "../../../../components/sim/lesson-ui/sessionClock";
import type { VehicleSample } from "../../contracts";
import type { SimTick, SimTickEvent } from "../../rules";
import {
  PhysicsSessionClock,
  PlayerStepTrackRecorder,
  recordPhysicsStep,
  SessionGridClock,
  type PhysicsStepState,
} from "../../traffic";
import { recordPhysicsStep as recordPhysicsStepInItsModule } from "../../traffic/playerTrack";
import { createVehicleSample, updateVehicleSample } from "../vehicleSample";
import { FIXED_DT } from "../../vehicle/tuning";
import { GradeGrid, type GradeGridHooks, type GradeGridWorld } from "../gradeGrid";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "../../../../..");
const SRC = path.join(PLATFORM, "src");
const H = FIXED_DT;
const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };

const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf-8").replace(/\r\n/g, "\n");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ───────────────────────────────────────────────────────────────────────────
// §1 — what rapier's stepper actually does, read out of the installed bundle
// ───────────────────────────────────────────────────────────────────────────

const RAPIER = readFileSync(
  path.join(PLATFORM, "node_modules/@react-three/rapier/dist/react-three-rapier.esm.js"),
  "utf-8",
).replace(/\r\n/g, "\n");

describe("§1 rapier's stepper, as installed — the model below copies exactly this", () => {
  it("the accumulator starts at 0, is fed clamp(dt, 0, 0.5), and takes one step per whole timeStep in it", () => {
    // `const [steppingState] = useState({ previousState: {}, accumulator: 0 });`
    expect(RAPIER).toMatch(/useState\(\{\s*previousState: \{\},\s*accumulator: 0\s*\}\)/);
    expect(RAPIER).toContain("const clampedDelta = MathUtils.clamp(dt, 0, 0.5);");
    expect(RAPIER).toContain("steppingState.accumulator += clampedDelta;");
    expect(RAPIER).toContain("while (steppingState.accumulator >= timeStep) {");
    expect(RAPIER).toContain("steppingState.accumulator -= timeStep;");
    // The step listeners run inside the loop, once per step, after world.step.
    const loop = RAPIER.slice(RAPIER.indexOf("const stepWorld = delta => {"), RAPIER.indexOf("const interpolationAlpha"));
    expect(loop.indexOf("world.step(")).toBeGreaterThan(0);
    expect(loop.indexOf("afterStepCallbacks.forEach(")).toBeGreaterThan(loop.indexOf("world.step("));
    expect(loop.indexOf("stepWorld(timeStep);")).toBeGreaterThan(loop.indexOf("while (steppingState.accumulator >= timeStep) {"));
    // What is drawn of the car: the accumulator's remainder.
    expect(RAPIER).toContain("steppingState.accumulator / timeStep");
  });

  it("a paused <Physics> neither steps nor accumulates", () => {
    expect(RAPIER).toMatch(/const stepCallback = useCallback\(delta => \{\s*if \(!paused\) \{\s*step\(delta\);\s*\}\s*\}, \[paused, step\]\);/);
  });

  it("the stepper is the FIRST child of <Physics>, before `children`, on useFrame at the caller's priority", () => {
    // `createElement(rapierContext.Provider, { value }, createElement(FrameStepper$1, …), debug && …, children)`
    const ret = RAPIER.slice(RAPIER.lastIndexOf("React.createElement(rapierContext.Provider"));
    const stepper = ret.indexOf("React.createElement(FrameStepper$1");
    const children = ret.indexOf("children);");
    expect(stepper).toBeGreaterThan(0);
    expect(children).toBeGreaterThan(stepper);
    expect(RAPIER).toMatch(/useFrame\(\(_, dt\) => \{\s*onStep\(dt\);\s*\}, updatePriority\);/);
    // A step listener is registered in a PASSIVE effect: steps taken before
    // it flushes cannot be counted (PhysicsSessionClock's origin rule).
    expect(RAPIER).toMatch(/const useAfterPhysicsStep = callback => \{[\s\S]{0,200}?useEffect\(\(\) => \{\s*afterStepCallbacks\.add\(ref\);/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 — the model: the real classes around rapier's accumulator
// ───────────────────────────────────────────────────────────────────────────

/** The round-2 verifier's seeded LCG in [0, 1), verbatim. */
function lcg(seed: number, n: number, map: (u: number) => number): number[] {
  let x = seed;
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    o.push(map(x / 2147483648));
  }
  return o;
}
/** w69-h1-mob sc-roundabout-entry__mobile-right frame deltas, ms. */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);
const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
/** A first live frame of `first` seconds, then a 60 Hz display. */
const hitch = (first: number) => [first, ...rep(20000, 1 / 60)];

/** The round-4 verifier's 21 model cadences, plus the first-frame hitches. */
export const WIRING_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["120 Hz", [1 / 120]],
  ["144 Hz", [1 / 144]],
  ["59.94 Hz", [1 / 59.94]],
  ["90 Hz", [1 / 90]],
  ["30 Hz", [1 / 30]],
  ["60 Hz ± 0.2 µs", [1 / 60 + 2e-7, 1 / 60 - 2e-7]],
  ["60 Hz − 90 ns", [1 / 60 - 9e-8]],
  ["60 Hz + 90 ns", [1 / 60 + 9e-8]],
  ["60 Hz ± 1 ms", lcg(777, 5000, (u) => 1 / 60 - 0.001 + u * 0.002)],
  ["1/60–1/20 s", lcg(12345, 5000, (u) => 1 / 60 + u * (1 / 20 - 1 / 60))],
  ["phone A", W69],
  ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
  ["0.25/0.4 s", [0.25, 0.4]],
  ["0.37 s", [0.37]],
  ["0.5 s", [0.5]],
  ["1–600 ms", lcg(4242, 5000, (u) => 0.001 + u * 0.599)],
  ["1 kHz", [0.001]],
  ["16.6 ms (0.1 ms timestamps)", [0.0166]],
  ["16.7 ms (0.1 ms timestamps)", [0.0167]],
  ["144 Hz with hitches", lcg(99, 5000, (u) => (u < 0.9 ? 1 / 144 : 0.25 + u))],
  ["0.5 s first frame, then 60 Hz", hitch(0.5)],
  ["0.25 s first frame, then 60 Hz", hitch(0.25)],
  ["0.1 s first frame, then 60 Hz", hitch(0.1)],
  ["2/60 s first frame, then 60 Hz", hitch(2 / 60)],
  ["7 s first frame, then 144 Hz", [7, ...rep(40000, 1 / 144)]],
];

interface WiringReport {
  frames: number;
  steps: number;
  graded: number;
  /** A grid point that read the same step as the one before it. */
  repeated: number;
  /** A grid point that read a step more than one after the one before it. */
  skipped: number;
  /** A grid point that read an EARLIER step than the one before it. */
  backward: number;
  /** A grid point k that did not read the car after step k. */
  wrongStep: number;
  /** Steps taken and not yet graded when a frame's driver had run — min, max. */
  unheard: [number, number];
  /** (session clock − newest graded grid time) / H after a frame — min, max. */
  pastSteps: [number, number];
  /** Grid points at which the signal clock or the traffic clock was not k·H. */
  worldClockOff: number;
  /** The session clock went backwards. */
  clockBackward: number;
  /** Frames (after the first graded point) on which (session clock − newest
   *  grid time) was not the engine's accumulator, to 1 ns — what everything
   *  DRAWN is interpolated by. Meaningful with the stepper first. */
  pastVsAcc: number;
  /** The engine's accumulator after the first counted frame's steps, s. */
  accAtOrigin: number;
  /** The first frames on which it was not. */
  clockFirst: string[];
  first: string[];
}

/**
 * One session of the live wiring. `order` is the order the two frame hooks
 * run in: rapier's stepper then RuntimeDriver (the product), or the reverse.
 * `listenerFromFrame`: the frame from which VehicleRig's step listener is
 * registered (0: from the start; rapier registers it in a passive effect).
 */
function runWiring(
  deltas: readonly number[],
  seconds: number,
  order: "stepperFirst" | "driverFirst",
  listenerFromFrame = 0,
): WiringReport {
  const recorder = new PlayerStepTrackRecorder();
  const clock = new PhysicsSessionClock();
  const grid = new GradeGrid();
  const rep_: WiringReport = {
    frames: 0,
    steps: 0,
    graded: 0,
    repeated: 0,
    skipped: 0,
    backward: 0,
    wrongStep: 0,
    unheard: [Infinity, -Infinity],
    pastSteps: [Infinity, -Infinity],
    worldClockOff: 0,
    clockBackward: 0,
    pastVsAcc: 0,
    accAtOrigin: NaN,
    clockFirst: [],
    first: [],
  };
  const note = (s: string) => {
    if (rep_.first.length < 4) rep_.first.push(s);
  };
  // The world: clocks that only add what they are handed.
  let signalClock = 0;
  let trafficClock = 0;
  const world = {
    runtime: {
      update(dt: number) {
        signalClock += dt;
      },
      sample(v: VehicleSample, t: number): SimTick {
        return { t, position: { x: v.position.x, y: v.position.y }, events: [] as SimTickEvent[] } as unknown as SimTick;
      },
      signalPhase: () => "green" as const,
    },
    traffic: {
      update(dt: number) {
        trafficClock += dt;
      },
      leadGapMeters: () => Infinity,
      setRenderSessionTime() {},
      vehicles: [],
      pedestrians: [],
      vehicleCollisionKind: () => "vehicle" as const,
    },
    director: null,
  } as unknown as GradeGridWorld;
  let prevStep = 0;
  const hooks: GradeGridHooks = {
    // LessonScene's hook: discrete channels only — and, like a scene that had
    // gone back to the frame-end sample, a pose the grid must overwrite.
    student: (_k, _t, out) => {
      out.position.x = -1;
      out.speedKmh = -1;
      return 0;
    },
    onPoint: (p) => {
      rep_.graded++;
      // Step n leaves the car at x = n.
      const step = p.student.position.x;
      if (step !== p.k) {
        rep_.wrongStep++;
        note(`point ${p.k} read step ${step}`);
      }
      const d = step - prevStep;
      if (d === 0) rep_.repeated++;
      else if (d < 0) rep_.backward++;
      else if (d > 1) rep_.skipped++;
      prevStep = step;
      if (Math.abs(signalClock - p.k * H) > 1e-9 || Math.abs(trafficClock - p.k * H) > 1e-9) {
        rep_.worldClockOff++;
        note(`point ${p.k}: signal clock ${signalClock.toFixed(4)} traffic ${trafficClock.toFixed(4)} vs ${(p.k * H).toFixed(4)}`);
      }
    },
  };
  // rapier's stepper — §1, line for line.
  let accumulator = 0;
  let engineSteps = 0;
  let listening = false;
  const stepper = (dt: number) => {
    const clampedDelta = Math.min(Math.max(dt, 0), 0.5);
    accumulator += clampedDelta;
    while (accumulator >= H) {
      engineSteps++;
      // VehicleRig's useAfterPhysicsStep: the car after this step.
      if (listening) recorder.record(recorder.stepCount + 1, 0, recorder.stepCount + 1, 0);
      accumulator -= H;
    }
  };
  // LessonScene's RuntimeDriver frame — the two lines the source pin holds.
  let t = 0;
  const driver = (delta: number) => {
    const dt = sessionClockAdvance(delta);
    const tNext = clock.frame(dt, recorder.stepCount);
    if (tNext < t) rep_.clockBackward++;
    t = tNext;
    grid.stepPhysics(recorder, t, null, world, NO_WEATHER, hooks);
  };
  let wall = 0;
  while (wall < seconds) {
    const d = deltas[rep_.frames % deltas.length];
    if (rep_.frames >= listenerFromFrame) listening = true;
    if (order === "stepperFirst") {
      stepper(d);
      driver(d);
    } else {
      driver(d);
      stepper(d);
    }
    // A zero or negative delta (clamped to 0 by both hooks) still ends.
    wall += Math.min(Math.max(d, 0), 0.5) || 1e-4;
    rep_.frames++;
    const unheard = recorder.stepCount - grid.clock.last;
    rep_.unheard[0] = Math.min(rep_.unheard[0], unheard);
    rep_.unheard[1] = Math.max(rep_.unheard[1], unheard);
    if (grid.clock.last > 0) {
      if (Number.isNaN(rep_.accAtOrigin)) rep_.accAtOrigin = accumulator;
      const past = (t - grid.clock.timeOf(grid.clock.last)) / H;
      rep_.pastSteps[0] = Math.min(rep_.pastSteps[0], past);
      rep_.pastSteps[1] = Math.max(rep_.pastSteps[1], past);
      // THE CLAIM the drawn poses rest on: (session clock − steps·H) IS
      // rapier's accumulator.
      if (Math.abs(t - grid.clock.last * H - accumulator) > 1e-9) {
        rep_.pastVsAcc++;
        if (rep_.clockFirst.length < 3) {
          rep_.clockFirst.push(`frame ${rep_.frames - 1}: clock is ${((t - grid.clock.last * H) / H).toFixed(6)} steps past the newest grid point, the engine's accumulator ${(accumulator / H).toFixed(6)}`);
        }
      }
    }
  }
  rep_.steps = engineSteps;
  return rep_;
}

describe("§2 the live wiring — rapier's stepper, then RuntimeDriver: every physics step graded once, in its own frame, the car read AT it", () => {
  it(`${WIRING_CADENCES.length} cadences × 120 s: 0 repeated, 0 skipped, 0 backward states; nothing left unheard; the session clock is the accumulator's remainder past the newest step`, () => {
    expect(WIRING_CADENCES.length).toBeGreaterThanOrEqual(21);
    for (const [name, deltas] of WIRING_CADENCES) {
      const r = runWiring(deltas, 120, "stepperFirst");
      expect(r.graded, `${name}: graded points`).toBeGreaterThan(7000);
      // Every step the engine took was graded, exactly once, in order…
      expect(
        { repeated: r.repeated, skipped: r.skipped, backward: r.backward, wrongStep: r.wrongStep, first: r.first },
        `${name}: grid point k reads the car after step k`,
      ).toEqual({ repeated: 0, skipped: 0, backward: 0, wrongStep: 0, first: [] });
      expect(r.graded, `${name}: one graded point per physics step`).toBe(r.steps);
      // …in the frame it was taken in (a constant lag of zero steps)…
      expect(r.unheard, `${name}: steps taken and not graded when the frame's driver had run`).toEqual([0, 0]);
      // …with the world's own clocks at k·H at grid point k…
      expect(r.worldClockOff, `${name}: signal / traffic clock at a grid point`).toBe(0);
      // …and the frame end the accumulator's remainder past the newest step:
      // in [0, 1) steps (float noise at an exact grid landing).
      expect(r.pastSteps[0], `${name}: frame end before the newest grid point, steps`).toBeGreaterThan(-1e-6);
      expect(r.pastSteps[1], `${name}: frame end past the newest grid point, steps`).toBeLessThan(1 + 1e-6);
      // …which IS the engine's accumulator, to 1 ns, on every frame (round 6).
      expect(
        { off: r.pastVsAcc, first: r.clockFirst },
        `${name}: (session clock − steps·H) is rapier's accumulator`,
      ).toEqual({ off: 0, first: [] });
      expect(r.clockBackward, `${name}: session clock went backwards`).toBe(0);
    }
  });

  it("ONE ORIGIN: after a first live frame of any length the world, the signal clock and the car are the same number of steps in", () => {
    for (const first of [0.5, 0.25, 0.1, 2 / 60, 1 / 60, 1 / 144, 7]) {
      const r = runWiring([first, ...rep(600, 1 / 60)], Math.min(first, 0.5) - 1e-9, "stepperFirst");
      const expected = Math.floor(Math.min(first, 0.5) / H + 1e-9);
      expect(r.frames, `first frame ${first}`).toBe(1);
      // The engine took `expected` steps in that frame, and the grade heard
      // every one of them in it — round 4 heard one.
      expect({ steps: r.steps, graded: r.graded, worldClockOff: r.worldClockOff, wrongStep: r.wrongStep }).toEqual({
        steps: expected,
        graded: expected,
        worldClockOff: 0,
        wrongStep: 0,
      });
    }
  });

  it("steps the engine took before its listener was registered are not session time: the clock starts with the first counted step and never runs backwards", () => {
    for (const [name, deltas] of [
      ["0.3 s first frame, listener from frame 1", [0.3, ...rep(20000, 1 / 60)]],
      ["three 0.2 s frames, listener from frame 3", [0.2, 0.2, 0.2, ...rep(20000, 1 / 144)]],
    ] as const) {
      const late = name.includes("frame 3") ? 3 : 1;
      const r = runWiring(deltas, 60, "stepperFirst", late);
      expect(r.steps, name).toBeGreaterThan(r.graded);
      expect(
        { repeated: r.repeated, skipped: r.skipped, backward: r.backward, wrongStep: r.wrongStep, unheard: r.unheard },
        name,
      ).toEqual({ repeated: 0, skipped: 0, backward: 0, wrongStep: 0, unheard: [0, 0] });
      expect(r.worldClockOff, name).toBe(0);
      expect(r.pastSteps[0], name).toBeGreaterThan(-1e-6);
      expect(r.pastSteps[1], name).toBeLessThan(1 + 1e-6);
      expect(r.clockBackward, name).toBe(0);
    }
  });

  // ROUND 6 — the round-5 verifier's F2. With the listener a frame late and
  // the first counted frame ending exactly on a grid point, round 5's origin
  // rule (`past >= H + eps` → drop floor(past/H) steps) kept one whole
  // uncounted step, and the session clock stayed a step ahead of the engine
  // for the session: 50 of the verifier's 709 model sessions (its
  // probes-r5/tmp-rbv5-rig.test.ts, ported here cadence for cadence). Graded
  // nothing wrong — the grid is counted off the steps — but everything DRAWN
  // is interpolated by that remainder: the actors were drawn at their newest
  // grid state while the car was drawn up to a step behind it.
  /** A display at `hz` whose rAF timestamps are rounded to `res` seconds. */
  const rounded = (hz: number, res: number, n: number) => {
    const o: number[] = [];
    let prev = 0;
    for (let i = 1; i <= n; i++) {
      const tt = Math.round(i / hz / res) * res;
      o.push(tt - prev);
      prev = tt;
    }
    return o;
  };
  /** The verifier's own 34 cadences, listener on time. */
  const VERIFIER_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
    ["hz60", [1 / 60]],
    ["hz75", [1 / 75]],
    ["hz165", [1 / 165]],
    ["hz240", [1 / 240]],
    ["hz50", [1 / 50]],
    ["hz100", [1 / 100]],
    ["hz5988", [1 / 59.88]],
    ["hz6002", [1 / 60.02]],
    ["hz24", [1 / 24]],
    ["r60_100us", rounded(60, 1e-4, 20000)],
    ["r60_1ms", rounded(60, 1e-3, 20000)],
    ["r60_5us", rounded(60, 5e-6, 20000)],
    ["r144_100us", rounded(144, 1e-4, 20000)],
    ["r120_1ms", rounded(120, 1e-3, 20000)],
    ["r5994_100us", rounded(59.94, 1e-4, 20000)],
    ["alt", [0.25, 0.4]],
    ["alt4", [0.4, 0.25]],
    ["phC", [...W69.slice(31), ...W69.slice(0, 31)]],
    ["stallodd", [...rep(713, 1 / 90), 2.0, ...rep(40000, 1 / 90)]],
    ["stall7", [...rep(1291, 1 / 144), 7.0, ...rep(90000, 1 / 144)]],
    ["thr", lcg(31337, 5000, (u) => (u < 0.5 ? 1 / 60 : u < 0.8 ? 2 / 60 : u < 0.95 ? 3 / 60 : 0.3))],
    ["irr", [Math.SQRT2 / 100, Math.PI / 100, Math.E / 400]],
    ["zeros", [0, 1 / 60, 0, 0, 1 / 30, -0.004, 1 / 120]],
    ["rndall", lcg(2024, 9000, (u) => u * u * 0.7)],
    ["h30", [0.3, ...rep(20000, 1 / 60)]],
    ["h49", [0.49, ...rep(20000, 1 / 60)]],
    ["hsub", [0.008, ...rep(20000, 1 / 60)]],
    ["h2x", [0.5, 0.5, ...rep(20000, 1 / 60)]],
    ["h3x", [0.011, 0.5, 0.004, ...rep(20000, 1 / 60)]],
    ["h0", [0, ...rep(20000, 1 / 60)]],
    ["h1s144", [1.0, ...rep(40000, 1 / 144)]],
    ["hpi", [Math.PI / 10, ...rep(20000, 1 / 59.94)]],
    ["h120", [0.2, ...rep(40000, 1 / 120)]],
    ["hphC", [0.123, ...W69.slice(31), ...W69.slice(0, 31), ...rep(2000, 0.31)]],
  ];

  it("LATE LISTENER (round 5's F2): on the verifier's 709 sessions the session clock is never a whole step ahead — it is the engine's accumulator past the newest counted step", () => {
    const sessions: Array<[string, readonly number[], number, number]> = [];
    for (const [name, d] of VERIFIER_CADENCES) sessions.push([name, d, 60, 0]);
    for (const first of [1 / 60, 1 / 30, 0.05, 0.1, 0.123, 0.15, 0.2, 0.25, 0.3, 0.45, 0.49, 0.5, 2.0, 1 / 144, 0.004]) {
      for (const from of [1, 2, 3]) {
        for (const [fn, tail] of [
          ["60", rep(9000, 1 / 60)],
          ["144", rep(9000, 1 / 144)],
          ["120", rep(9000, 1 / 120)],
          ["r60", rounded(60, 1e-4, 9000)],
          ["0.37", rep(900, 0.37)],
        ] as Array<[string, number[]]>) {
          for (const mid of [first, first / 2, 1 / 60]) {
            sessions.push([
              `late first=${first.toFixed(4)} mid=${mid.toFixed(4)} then ${fn}, listener from frame ${from}`,
              [first, mid, first, ...tail],
              30,
              from,
            ]);
          }
        }
      }
    }
    expect(sessions.length).toBe(709);
    const ahead: string[] = [];
    const off: string[] = [];
    let lateWithUncounted = 0;
    let landedOnGrid = 0;
    for (const [name, deltas, seconds, from] of sessions) {
      const r = runWiring(deltas, seconds, "stepperFirst", from);
      expect(r.graded, `${name}: graded`).toBeGreaterThan(0);
      if (r.steps > r.graded) lateWithUncounted++;
      // The ambiguous landing: uncounted steps AND the accumulator within
      // float noise of 0 on the first counted frame — where round 5 was a
      // whole step ahead.
      if (r.steps > r.graded && r.accAtOrigin < 1e-9) landedOnGrid++;
      if (r.pastSteps[1] >= 1 - 1e-9 && r.pastVsAcc > 0) {
        ahead.push(`${name}: clock ${r.pastSteps[0].toFixed(6)}…${r.pastSteps[1].toFixed(6)} steps past the newest grid point`);
      }
      if (r.pastVsAcc > 0 || r.pastSteps[0] < -1e-6 || r.pastSteps[1] >= 1 + 1e-6 || r.clockBackward > 0) {
        off.push(`${name}: ${r.pastVsAcc} frames off the accumulator (${r.clockFirst[0] ?? "—"}), past ${r.pastSteps[0].toFixed(6)}…${r.pastSteps[1].toFixed(6)}`);
      }
      expect(
        { repeated: r.repeated, skipped: r.skipped, backward: r.backward, wrongStep: r.wrongStep, unheard: r.unheard, worldClockOff: r.worldClockOff },
        name,
      ).toEqual({ repeated: 0, skipped: 0, backward: 0, wrongStep: 0, unheard: [0, 0], worldClockOff: 0 });
    }
    // The sweep has teeth: most late sessions have uncounted steps, and
    // dozens land the first counted frame exactly on a grid point.
    expect(lateWithUncounted).toBeGreaterThan(400);
    expect(landedOnGrid).toBeGreaterThan(40);
    expect(ahead, "sessions with the session clock a whole step ahead of the engine").toEqual([]);
    expect(off, "sessions whose clock is not the engine's accumulator past the newest counted step").toEqual([]);
  });

  it("…and never a whole step BEHIND: an accumulator left one ulp under a whole step is not an uncounted step (why the repair counts steps instead of flooring the remainder)", () => {
    // The mirror case. A first frame of 2/60 s − 1 ulp, listener on time: the
    // engine takes ONE step and its accumulator holds a step less 7e-18 s. An
    // origin rule that floors (remainder / H + eps) reads that remainder as a
    // second, uncounted step and drops it — and the clock then sits a whole
    // step behind the accumulator for the session (actors drawn a step behind
    // the car).
    const buf = new Float64Array([2 * H]);
    const lowWord = new Uint32Array(buf.buffer);
    expect(lowWord[0]).toBeGreaterThan(0); // little-endian low word: no borrow
    lowWord[0] -= 1;
    const first = buf[0];
    expect(first).toBeLessThan(2 * H);
    expect(2 * H - first).toBeLessThan(1e-16);
    const r = runWiring([first, ...rep(20000, 1 / 60)], 60, "stepperFirst", 0);
    // Teeth: nothing was uncounted, and the accumulator really is a hair
    // under one step when the origin is fixed.
    expect(r.steps).toBe(r.graded);
    expect(r.accAtOrigin).toBeGreaterThan(H - 1e-12);
    expect(r.accAtOrigin).toBeLessThan(H);
    expect(
      { off: r.pastVsAcc, first: r.clockFirst },
      "2/60 s − 1 ulp first frame: (session clock − steps·H) is rapier's accumulator",
    ).toEqual({ off: 0, first: [] });
    // The clock PhysicsSessionClock hands back is still the bare sum here.
    const clock = new PhysicsSessionClock();
    expect(Object.is(clock.frame(first, 1), first)).toBe(true);
  });

  it("THE ORDER IS A DEPENDENCY: with RuntimeDriver's hook BEFORE rapier's stepper the grade runs a frame behind the car", () => {
    // The same model, hooks reversed. Nothing is repeated or skipped (the grid
    // is driven by the steps, so it cannot be), but a frame's steps are graded
    // one frame late: the world the student is shown and graded against is a
    // whole frame — up to 0.5 s — older than the car he is driving.
    for (const [name, deltas] of WIRING_CADENCES) {
      const r = runWiring(deltas, 30, "driverFirst");
      expect(r.unheard[1], `${name}: steps left ungraded when the frame ended`).toBeGreaterThan(0);
      expect({ repeated: r.repeated, skipped: r.skipped, backward: r.backward }, name).toEqual({
        repeated: 0,
        skipped: 0,
        backward: 0,
      });
    }
    // On a phone cadence that is not a subtlety: half a second of steps.
    expect(runWiring([0.5], 30, "driverFirst").unheard[1]).toBe(30);
  });

  it("a grid derived from the session time is NOT this clock: at 144 Hz and on 0.1 ms timestamps it asks for a step rapier has not taken (round 4's F2)", () => {
    // Why the product's grid is driven by the steps. The session-time index
    // floor(T/H) and rapier's own step count are two accumulators fed the same
    // deltas; they cross a step on different frames whenever a frame end lands
    // within float noise of a grid point.
    for (const [name, deltas, differs] of [
      ["144 Hz", [1 / 144], true],
      ["16.7 ms (0.1 ms timestamps)", [0.0167], true],
      // An exact 60 Hz is the one cadence on which the two never part.
      ["60 Hz", [1 / 60], false],
    ] as const) {
      const byTime = new SessionGridClock();
      let acc = 0;
      let steps = 0;
      let t = 0;
      let ahead = 0;
      let behind = 0;
      for (let f = 0; f < 144 * 120; f++) {
        const d = deltas[f % deltas.length];
        acc += d;
        while (acc >= H) {
          steps++;
          acc -= H;
        }
        t += d;
        const k = byTime.indexAt(t);
        if (k > steps) ahead++;
        if (k < steps) behind++;
      }
      expect(ahead + behind > 0, `${name}: frames on which floor(T/H) ≠ rapier's step count: ${ahead} ahead, ${behind} behind`).toBe(differs);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §3 — the seams themselves: LessonScene and VehicleRig as the browser runs them
// ───────────────────────────────────────────────────────────────────────────

describe("§3 the scene's own lines — what the model assumes, pinned at its address", () => {
  const sceneRaw = read("components/sim/LessonScene.tsx");
  const scene = stripComments(sceneRaw);
  const rig = stripComments(read("components/sim/VehicleRig.tsx"));
  const driverFrom = scene.indexOf("function RuntimeDriver({");
  const driver = scene.slice(driverFrom, scene.indexOf("\n}\n", scene.indexOf("return null;", driverFrom)) + 3);

  it("the walk is looking at the real files", () => {
    expect(scene.length).toBeGreaterThan(50_000);
    expect(driver.length).toBeGreaterThan(5_000);
    expect(rig.length).toBeGreaterThan(10_000);
  });

  it("RuntimeDriver feeds the session clock the frame's clamped delta against the recorder's step count, then grades off the recorder", () => {
    const stepsLine = "const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;";
    const dtLine = "const dt = sessionClockAdvance(delta);";
    const clockLine = "tRef.current = sessionClock.frame(dt, steps.stepCount);";
    for (const line of [stepsLine, dtLine, clockLine]) {
      expect(driver.split(line).length - 1, line).toBe(1);
    }
    expect(driver.indexOf(stepsLine)).toBeLessThan(driver.indexOf(clockLine));
    expect(driver.indexOf(dtLine)).toBeLessThan(driver.indexOf(clockLine));
    // The session clock is written nowhere else (a bare `tRef.current += dt`
    // beside it would be a second origin).
    expect(driver).not.toMatch(/tRef\.current\s*(\+=|-=)/);
    expect(driver.split(/(?<![A-Za-z])tRef\.current =(?!=)/).length - 1).toBe(1);
    expect(driver).toContain("const sessionClock = useMemo(() => new PhysicsSessionClock(), []);");
    // The grade: the live entry, off the same step source, at the same clock.
    expect(driver).toMatch(/gradeGrid\.stepPhysics\(\s*steps,\s*tRef\.current,\s*sample\.mirrorGlance,/);
    expect(driver.split(".stepPhysics(").length - 1).toBe(1);
    expect(driver.indexOf(clockLine)).toBeLessThan(driver.indexOf(".stepPhysics("));
    // …and never the session-time entry (the harness's): in the scene it is a
    // second clock beside rapier's — round 4's F2.
    expect(scene).not.toContain(".stepFrame(");
    expect(scene).not.toContain("syncGrid");
    expect(scene).not.toContain("stateAtGrid");
  });

  it("the scene's student hook writes NO pose: the car's position, heading and speed at a grid point come from the physics step, never from the frame-end sample", () => {
    const call = driver.slice(driver.indexOf(".stepPhysics("));
    const hook = call.slice(call.indexOf("student:"), call.indexOf("onPoint:"));
    expect(call.indexOf("student:")).toBeGreaterThan(0);
    expect(call.indexOf("onPoint:")).toBeGreaterThan(call.indexOf("student:"));
    expect(hook.length).toBeGreaterThan(200);
    // What it does write: the cabin's discrete channels.
    for (const ch of ["indicator", "headlights", "seatbeltOn", "handbrakeOn", "gear", "stalled", "fogLightsOn"]) {
      expect(hook, ch).toContain(`out.${ch} = sample.${ch};`);
    }
    // What it may not: any of the four graded kinematic fields, from anywhere.
    expect(hook).not.toMatch(/out\.position/);
    expect(hook).not.toMatch(/out\.headingDeg/);
    expect(hook).not.toMatch(/out\.speedKmh/);
    expect(hook).not.toMatch(/sample\.(position|headingDeg|speedKmh)/);
  });

  // ROUND 6 — the round-5 verifier's F1. The pin above stopped where the next
  // hook began: a `vruAheadM` hook measuring the person in the path from
  // `sample.position` (the frame-end sample, as base spelled it) passed this
  // file and the 121 others that read LessonScene, and so did an `onPoint`
  // that wrote the frame-end pose into the tick before handing it on. So the
  // call is now read AS A TREE, whole: every argument, every hook body.
  describe("NO POSE-CONSUMING HOOK: nothing in the `stepPhysics` call reads this frame's pose, heading or speed", () => {
    const sf = ts.createSourceFile("LessonScene.tsx", sceneRaw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const calls: ts.CallExpression[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "gradeGrid.stepPhysics") calls.push(n);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    const call = calls[0];
    /** Every node inside the call, the callee included. */
    const nodes: ts.Node[] = [];
    const walk = (n: ts.Node) => {
      nodes.push(n);
      ts.forEachChild(n, walk);
    };
    if (call) walk(call);
    /** What the cabin and the pedals say — read per frame, graded as the
     *  frame's value at every grid point inside it (disclosed). */
    const CABIN_CHANNELS = [
      "engineOn",
      "fogLightsOn",
      "gear",
      "handbrakeOn",
      "headlights",
      "indicator",
      "mirrorGlance",
      "seatbeltOn",
      "stalled",
      "throttlePedal",
    ];

    it("there is exactly one such call, in RuntimeDriver, with the six arguments the grid's live entry takes", () => {
      expect(calls.length).toBe(1);
      let fn: string | null = null;
      for (let p: ts.Node | undefined = call.parent; p; p = p.parent) {
        if (ts.isFunctionDeclaration(p) && p.name) {
          fn = p.name.text;
          break;
        }
      }
      expect(fn).toBe("RuntimeDriver");
      const flat = (n: ts.Node) => n.getText(sf).replace(/\s+/g, " ").trim();
      expect(call.arguments.slice(0, 5).map(flat)).toEqual([
        "steps",
        "tRef.current",
        "sample.mirrorGlance",
        "{ runtime, traffic, director }",
        "conditions",
      ]);
      expect(call.arguments.length).toBe(6);
      // The hooks: the cabin's channels, (round 8) the rest of the cabin's
      // looks, the delivery of the graded point, and (round 7) the sink of the
      // near-miss stat. No `vruAheadM` (the grid measures the person in the
      // path itself), no `contacts`, no `trafficSpeedKmh` — nothing that is
      // handed a pose to answer with.
      const hooks = call.arguments[5];
      expect(ts.isObjectLiteralExpression(hooks)).toBe(true);
      const props = (hooks as ts.ObjectLiteralExpression).properties;
      expect(props.map((p) => p.name?.getText(sf))).toEqual(["student", "moreLooks", "onPoint", "nearMiss"]);
      // EVERY LOOK THE CABIN STILL HOLDS (round 8): the hook is the cabin's own
      // `consumeGlanceSample`, called through — one look per call, null when
      // the cabin has none — and nothing else. Without it a second look
      // pressed inside one 0.5 s frame waits a whole frame for its turn.
      const moreLooks = props[1];
      expect(ts.isPropertyAssignment(moreLooks) && ts.isArrowFunction(moreLooks.initializer)).toBe(true);
      const flatMore = (moreLooks as ts.PropertyAssignment).initializer.getText(sf).replace(/\s+/g, " ");
      expect(flatMore).toBe("() => cabinRef.current?.consumeGlanceSample() ?? null");
      // The near-miss sink is NOT a function of this file: it is the shell's
      // handler, handed on by name. The grid measures the stat (from the car
      // at the grid point) and calls it with the finished event; a scene-side
      // function here could measure something of its own instead.
      const nearMiss = props[3];
      expect(ts.isPropertyAssignment(nearMiss) && ts.isIdentifier(nearMiss.initializer)).toBe(true);
      expect((nearMiss as ts.PropertyAssignment).initializer.getText(sf)).toBe("onNearMiss");
    });

    it("every read of the frame's `sample` inside the call is one of the cabin's ten channels — never position, heading or speed", () => {
      const reads = new Set<string>();
      const bare: string[] = [];
      for (const n of nodes) {
        if (!ts.isIdentifier(n) || n.text !== "sample") continue;
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === n) reads.add(p.name.text);
        // `sample` handed on whole, spread, destructured, indexed, aliased:
        // any use that is not `sample.<channel>` could carry the pose out.
        else bare.push(p.getText(sf).slice(0, 80));
      }
      expect(bare, "`sample` used other than as `sample.<channel>`").toEqual([]);
      const got = [...reads].sort();
      for (const k of ["position", "headingDeg", "speedKmh"]) {
        expect(got, `the call reads the frame-end sample.${k}`).not.toContain(k);
      }
      expect(got).toEqual(CABIN_CHANNELS);
    });

    it("…and it closes over nothing else that knows where the car is this frame: the names the call reads from outside itself, all of them", () => {
      // An alias made above the call (`const fx = sample.position.x`) and used
      // inside it would pass the test above. So the call's free names are
      // pinned outright: a new one fails here and is looked at.
      const declared = new Set<string>();
      for (const n of nodes) {
        if ((ts.isParameter(n) || ts.isVariableDeclaration(n)) && ts.isIdentifier(n.name)) declared.add(n.name.text);
        // No destructuring inside the call: a pattern could rename a field.
        expect(ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n), n.getText(sf).slice(0, 60)).toBe(false);
        // No computed member access either (`sample["position"]`).
        if (ts.isElementAccessExpression(n)) {
          expect(n.expression.getText(sf), "computed access inside the call").not.toMatch(/sample|simRef|sampleRef/);
        }
      }
      const free = new Set<string>();
      for (const n of nodes) {
        if (!ts.isIdentifier(n)) continue;
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.name === n) continue; // a.b — b
        if (ts.isPropertyAssignment(p) && p.name === n) continue; // { b: … }
        if ((ts.isParameter(p) || ts.isVariableDeclaration(p)) && p.name === n) continue;
        if (declared.has(n.text)) continue;
        free.add(n.text);
      }
      expect([...free].sort()).toEqual([
        "attemptFeedRef",
        "cabinRef",
        "conditions",
        "director",
        "feedAttemptPoint",
        "gradeGrid",
        "hazardActiveRef",
        "inputRef",
        "onNearMiss",
        "onStagedOutcome",
        "onTelltale",
        "onTelltaleCaution",
        "onTick",
        "recorder",
        "runtime",
        "sample",
        "simRef",
        "steps",
        "tRef",
        "telltaleCautionLitRef",
        "telltaleLitRef",
        "traffic",
      ]);
      // Three of those are objects that DO know where the car is, or what the
      // driver is doing, this frame. What the call reads off each, all of it:
      // the cabin's next latched look; the wheel's angle (drawn in the replay
      // of the attempt, scored by nothing); the two pedals.
      const readsOff = (ref: string): string[] => {
        const out = new Set<string>();
        for (const n of nodes) {
          if (!ts.isIdentifier(n) || n.text !== ref) continue;
          // ref.current?.<member> — anything else is listed as it is written.
          const cur = n.parent;
          const member = cur.parent;
          if (ts.isPropertyAccessExpression(cur) && cur.name.text === "current" && ts.isPropertyAccessExpression(member)) {
            out.add(member.name.text);
          } else out.add(`!${cur.getText(sf).slice(0, 60)}`);
        }
        return [...out].sort();
      };
      expect(readsOff("cabinRef")).toEqual(["consumeGlanceSample"]);
      expect(readsOff("simRef")).toEqual(["steerRad"]);
      expect(readsOff("inputRef")).toEqual(["rawBrake", "rawThrottle"]);
      // The session clock is the second argument and nothing else in the call
      // (a hook stamps with the grid point's own `pt.tSec`).
      expect(nodes.filter((n) => ts.isIdentifier(n) && n.text === "tRef").length).toBe(1);
      // The grader's handler is handed the grid's tick, untouched: `onTick` is
      // called once, with `pt.tick`, and the tick is written nowhere in the
      // call.
      const onTickCalls = nodes.filter(
        (n): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === "onTick",
      );
      expect(onTickCalls.map((c) => c.arguments.map((a) => a.getText(sf)))).toEqual([["pt.tick"]]);
      const writes = nodes.filter(
        (n) =>
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          n.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          /^pt\b/.test(n.left.getText(sf)),
      );
      expect(writes.map((w) => w.getText(sf).slice(0, 80)), "the call writes into the graded point").toEqual([]);
    });

    it("…and the tick goes on to the shell through a tap that only looks: the scene's `onTick` wrapper assigns nothing and reads no pose of its own", () => {
      // RuntimeDriver's `onTick` is `onTickWithGlancePings` (the glance-ping
      // overlay's read-only observer, then the shell's handler). It is the one
      // function of this file between the grid and the lesson engine.
      expect(scene).toMatch(/<RuntimeDriver[\s\S]*?onTick=\{onTickWithGlancePings\}/);
      let wrapper: ts.Node | null = null;
      const find = (n: ts.Node) => {
        if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "onTickWithGlancePings") wrapper = n.initializer ?? null;
        ts.forEachChild(n, find);
      };
      find(sf);
      expect(wrapper, "onTickWithGlancePings").not.toBeNull();
      const inside: ts.Node[] = [];
      const collect = (n: ts.Node) => {
        inside.push(n);
        ts.forEachChild(n, collect);
      };
      collect(wrapper!);
      // It hands the tick on, whole, to the shell's handler…
      const handed = inside.filter(
        (n): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === "onTickCb",
      );
      expect(handed.map((c) => c.arguments.map((a) => a.getText(sf)))).toEqual([["t"]]);
      // …assigns nothing (no write into the tick, or anywhere)…
      const assigns = inside.filter(
        (n) =>
          (ts.isBinaryExpression(n) &&
            n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
          ts.isPrefixUnaryExpression(n) ||
          ts.isPostfixUnaryExpression(n) ||
          ts.isDeleteExpression(n),
      );
      expect(assigns.map((a) => a.getText(sf).slice(0, 80))).toEqual([]);
      // …and knows nothing about where the car is this frame.
      const names = new Set(inside.filter(ts.isIdentifier).map((n) => n.text));
      for (const banned of ["sample", "sampleRef", "simRef"]) expect(names.has(banned), banned).toBe(false);
    });
  });

  // ROUND 8 — the attempt trace (what the rubric's observation moments are
  // scored from) is fed inside the call, per graded point; the frame feeds it
  // no more. And the respawn resets the grid.
  describe("ROUND 8: the attempt trace is fed from the graded point, a look has one way into the grade, and a respawn resets the grid", () => {
    const sf = ts.createSourceFile("LessonScene.tsx", sceneRaw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const flat = (n: ts.Node) => n.getText(sf).replace(/\s+/g, " ").trim();
    const all: ts.Node[] = [];
    const walkAll = (n: ts.Node) => {
      all.push(n);
      ts.forEachChild(n, walkAll);
    };
    walkAll(sf);
    const gradeCall = all.find(
      (n): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === "gradeGrid.stepPhysics",
    ) as ts.CallExpression;
    const within = (n: ts.Node, root: ts.Node) => n.getStart(sf) >= root.getStart(sf) && n.getEnd() <= root.getEnd();

    it("`feedAttemptPoint` is called once in the whole scene — inside `onPoint`, AFTER `onTick(pt.tick)`, with the grid point's time and student and the frame's three controls", () => {
      const feeds = all.filter(
        (n): n is ts.CallExpression => ts.isCallExpression(n) && n.expression.getText(sf) === "feedAttemptPoint",
      );
      expect(feeds.length).toBe(1);
      const feed = feeds[0];
      const hooks = gradeCall.arguments[5] as ts.ObjectLiteralExpression;
      const onPoint = hooks.properties.find((p) => p.name?.getText(sf) === "onPoint") as ts.PropertyAssignment;
      expect(within(feed, onPoint), "the feed is inside the call's onPoint").toBe(true);
      expect(feed.arguments.map(flat)).toEqual([
        "recorder",
        "attemptFeedRef.current",
        "pt.tSec",
        "pt.student",
        "simRef.current?.steerRad ?? 0",
        "(inputRef.current?.rawBrake ?? 0) > 0.15",
        "(inputRef.current?.rawThrottle ?? 0) > 0.15",
      ]);
      // After the tick was delivered: the tick that ends the session closes
      // the trace before its own point is pushed (as the frame feed did).
      const onTickCall = all.find(
        (n): n is ts.CallExpression =>
          ts.isCallExpression(n) && n.expression.getText(sf) === "onTick" && within(n, onPoint),
      ) as ts.CallExpression;
      expect(onTickCall.getEnd()).toBeLessThan(feed.getStart(sf));
      // …and at the top level of onPoint's body, guarded only by «is there a
      // recorder»: never inside the `if (director && pt.staged)` block.
      const guard = feed.parent.parent.parent; // call → statement → block → if
      expect(ts.isIfStatement(guard) && flat(guard.expression)).toBe("recorder");
      const body = (onPoint.initializer as ts.ArrowFunction).body as ts.Block;
      expect(body.statements.includes(guard as ts.Statement), "the feed's guard is a top-level statement of onPoint").toBe(true);
    });

    it("RuntimeDriver feeds the attempt trace NOWHERE ELSE: no `recorder.push`, no `glance-` or `signal-` event of its own, and the frame's one-shot glance is read once — as the call's third argument", () => {
      expect(driver).not.toMatch(/recorder\??\.push\(/);
      expect(scene).not.toMatch(/\.push\(\{\s*tSec:/);
      expect(driver).not.toContain("glance-");
      expect(driver).not.toContain("signal-on");
      expect(driver).not.toContain("signal-off");
      // What the driver still writes into the trace itself: the cabin's
      // driveline events and narration lines — sparse, read by no score.
      const kinds = [...driver.matchAll(/recorder\??\.addEvent\(\s*"([a-z-]+)"/g)].map((m) => m[1]).sort();
      expect([...new Set(kinds)]).toEqual(["annotation", "driveline"]);
      expect(driver.split("sample.mirrorGlance").length - 1).toBe(1);
      expect(scene.split("sample.mirrorGlance").length - 1).toBe(1);
      expect(scene.split("mirrorGlance").length - 1).toBe(1);
    });

    it("a look has one way from the cabin to the grade: `consumeGlanceSample` is called by the sample builder and by the call's `moreLooks` — nowhere else in the product", () => {
      const product: string[] = [];
      const walkDir = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name !== "__tests__" && name !== "node_modules") walkDir(full);
          } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) product.push(full);
        }
      };
      walkDir(path.join(SRC, "components"));
      walkDir(path.join(SRC, "modules"));
      expect(product.length).toBeGreaterThan(300);
      const users: string[] = [];
      for (const file of product) {
        const text = stripComments(readFileSync(file, "utf-8").replace(/\r\n/g, "\n"));
        const n = text.split("consumeGlanceSample(").length - 1;
        if (n > 0) users.push(`${path.relative(SRC, file).replace(/\\/g, "/")}:${n}`);
      }
      expect(users.sort()).toEqual([
        "components/sim/LessonScene.tsx:1",
        "modules/sim/scene/cabin.ts:1",
        "modules/sim/scene/vehicleSample.ts:1",
      ]);
    });

    it("the grid belongs to LessonScene — one per mounted scene — and `resetCar` resets it and the cabin's latched looks; the shell's «Повтори» remounts the scene", () => {
      expect(scene.split("new GradeGrid(").length - 1).toBe(1);
      expect(scene).toContain("const [gradeGrid] = useState(() => new GradeGrid());");
      expect(driver).not.toContain("new GradeGrid(");
      expect(scene.split("gradeGrid={gradeGrid}").length - 1).toBe(1);
      const resets = all.filter(
        (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && n.name.getText(sf) === "resetCar",
      );
      expect(resets.length).toBe(1);
      const init = resets[0].initializer as ts.CallExpression;
      expect(init.expression.getText(sf)).toBe("useCallback");
      const body = (init.arguments[0] as ts.ArrowFunction).body as ts.Block;
      expect(body.statements.map(flat)).toEqual([
        "simRef.current?.reset();",
        "directorRef.current?.reset();",
        "cabinRef.current?.forgetPendingGlances();",
        "gradeGrid.reset();",
      ]);
      // Both callers of a respawn go through it: key R and the touch sheet.
      expect(scene.split("onReset: resetCar").length - 1).toBe(1);
      expect(scene.split("onReset={resetCar}").length - 1).toBe(1);
      // A NEW ATTEMPT is a new scene, so a new grid: the shell keys the scene
      // on its epoch and bumps it in `retry`.
      const shell = stripComments(read("components/sim/lesson-ui/LessonPlayShell.tsx"));
      expect(shell).toMatch(/<SceneSlot\s+key=\{sceneEpoch\}/);
      // …and SceneSlot is what mounts LessonScene (so its key remounts the
      // grid's owner, the step record's and the cabin's).
      const slot = stripComments(read("components/sim/lesson-ui/SceneSlot.tsx"));
      expect(slot.split("return <LessonScene {...props} />;").length - 1).toBe(1);
      const retry = shell.slice(shell.indexOf("const retry = () => {"));
      expect(retry.slice(0, retry.indexOf("\n  };"))).toContain("setSceneEpoch((e) => e + 1);");
    });
  });

  it("…and the shell's handler grades the tick it is handed: `applyTick(prev, tick)` first, in a file that knows neither the frame's sample nor the sim", () => {
    // The last hop of the chain (round 7's walk): RuntimeDriver → onTick →
    // LessonPlayShell.handleTick → the lesson engine.
    const shell = stripComments(read("components/sim/lesson-ui/LessonPlayShell.tsx"));
    const slot = stripComments(read("components/sim/lesson-ui/SceneSlot.tsx"));
    for (const banned of ["sampleRef", "simRef", "stepTrackRef"]) {
      expect(shell.includes(banned), `LessonPlayShell names ${banned}`).toBe(false);
    }
    const handler = shell.slice(shell.indexOf("const handleTick = useCallback("));
    expect(handler.slice(0, handler.indexOf("sessionRef.current = state;"))).toMatch(
      /\(tick: SimTick\) => \{\s*const prev = sessionRef\.current;\s*if \(prev\.phase === "completed" \|\| prev\.phase === "aborted"\) return;\s*const step = applyTick\(prev, tick\);/,
    );
    expect(shell.split("onTick={handleTick}").length - 1).toBe(1);
    // SceneSlot hands the shell's handler to the scene as it is.
    expect(slot).not.toMatch(/onTick=\{\s*\(/);
  });

  it("the recorder is made once with the scene, handed to both VehicleRig and RuntimeDriver, and never reset", () => {
    expect(scene).toContain("if (stepTrackRef.current === null) stepTrackRef.current = new PlayerStepTrackRecorder();");
    expect(scene.split("stepTrackRef={stepTrackRef}").length - 1).toBe(2);
    expect(scene.split("new PlayerStepTrackRecorder()").length - 1).toBe(1);
    expect(scene).not.toMatch(/stepTrackRef\.current\??\.reset\(/);
    // VehicleRig records the car after EVERY physics step — what that callback
    // IS, and what it records, is §4 (round 7: executed, not read).
    expect(rig.split("useAfterPhysicsStep(").length - 1).toBe(1);
    expect(rig).not.toContain(".seal(");
  });

  it("THE FRAME-HOOK ORDER: RuntimeDriver is mounted INSIDE <Physics>, after VehicleRig, and no frame priority reorders it — so rapier's stepper runs first", () => {
    const open = scene.indexOf("<Physics");
    const close = scene.indexOf("</Physics>");
    const rigAt = scene.indexOf("<VehicleRig");
    const driverAt = scene.indexOf("<RuntimeDriver");
    expect(open).toBeGreaterThan(0);
    expect(scene.split("<Physics").length - 1).toBe(1);
    expect(scene.split("<RuntimeDriver").length - 1).toBe(1);
    expect(scene.split("<VehicleRig").length - 1).toBe(1);
    // <Physics> … <VehicleRig> … <RuntimeDriver> … </Physics>
    expect(rigAt).toBeGreaterThan(open);
    expect(driverAt).toBeGreaterThan(rigAt);
    expect(close).toBeGreaterThan(driverAt);
    // One fixed step for the engine and the grid, stepped on R3F's frame
    // loop at the default priority, paused by the SAME prop as the driver.
    const physicsTag = scene.slice(open, scene.indexOf(">", open));
    expect(physicsTag).toContain("timeStep={FIXED_DT}");
    expect(physicsTag).toContain('updateLoop="follow"');
    expect(physicsTag).toContain("paused={physicsPaused}");
    expect(physicsTag).not.toContain("updatePriority");
    const driverTag = scene.slice(driverAt, scene.indexOf("/>", driverAt));
    expect(driverTag).toContain("paused={physicsPaused}");
    // RuntimeDriver's one frame hook: no priority argument (it closes `});`).
    expect(driver.split("useFrame(").length - 1).toBe(1);
    expect(driver).toMatch(/useFrame\(\(_, delta\) => \{/);
    expect(driver).toMatch(/\n  \}\);\s*\n\s*return null;\n\}\s*$/);
    // …and it stops with the engine: nothing is added to the clock or graded
    // on a paused frame (the early-out sits above the clock line).
    expect(driver.indexOf("if (paused) return;")).toBeGreaterThan(0);
    expect(driver.indexOf("if (paused) return;")).toBeLessThan(driver.indexOf("sessionClock.frame("));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §4 — THE AFTER-STEP RECORD (round 7): the one place the graded car comes from
// ───────────────────────────────────────────────────────────────────────────

/** The car a physics step leaves, in rapier's own terms. */
interface BodyState {
  t: { x: number; y: number; z: number };
  q: { x: number; y: number; z: number; w: number };
  speedKmh: number;
}

/** The car after engine step `n`: moving, turning, pitching a little — every
 *  number distinct from every other step's and from anything a sample holds. */
function bodyAfterStep(n: number): BodyState {
  const q = new Quaternion().setFromEuler(
    new Euler(0.02 * Math.sin(n / 7), (10 + 0.7 * n) * (Math.PI / 180), 0.015 * Math.cos(n / 5), "YXZ"),
  );
  return {
    t: { x: 3 + 0.21 * n, y: 0.4, z: -(5 + 0.13 * n) },
    q: { x: q.x, y: q.y, z: q.z, w: q.w },
    speedKmh: 20 + 0.3 * n,
  };
}

/** What that step must be recorded as — computed NOT by the function under
 *  test but by the frame sample's own mapping (scene/vehicleSample.ts
 *  `updateVehicleSample`: district x = world x, y = −world z, heading 0 =
 *  north, clockwise) from a drawn group placed exactly on the body. */
function dueRecord(b: BodyState): PhysicsStepState {
  const group = new Group();
  group.position.set(b.t.x, b.t.y, b.t.z);
  group.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
  group.updateMatrixWorld(true);
  const out = createVehicleSample();
  const cabin = {
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    consumeGlanceSample: () => null,
    driveline: {
      parkingBrakeOn: false,
      selector: "D",
      manualGear: 1,
      stalled: false,
      fogLightsOn: false,
      engineOn: true,
    },
  };
  updateVehicleSample(
    out,
    { speedKmh: b.speedKmh, gear: "1" } as never,
    group,
    cabin as never,
    null,
  );
  return { x: out.position.x, y: out.position.y, speedKmh: out.speedKmh, headingDeg: out.headingDeg };
}

const readStep = (rec: PlayerStepTrackRecorder, n: number): PhysicsStepState | null => {
  const out: PhysicsStepState = { x: NaN, y: NaN, speedKmh: NaN, headingDeg: NaN };
  return rec.stateAtStep(n, out) ? out : null;
};

const closeState = (a: PhysicsStepState | null, b: PhysicsStepState): boolean =>
  a !== null &&
  Math.abs(a.x - b.x) < 1e-9 &&
  Math.abs(a.y - b.y) < 1e-9 &&
  Math.abs(a.speedKmh - b.speedKmh) < 1e-9 &&
  Math.abs(((a.headingDeg - b.headingDeg + 540) % 360) - 180) < 1e-6;

const fmtState = (a: PhysicsStepState | null) =>
  a === null ? "nothing" : `(${a.x.toFixed(3)}, ${a.y.toFixed(3)}) ${a.headingDeg.toFixed(2)}° ${a.speedKmh.toFixed(2)} km/h`;

describe("§4 THE AFTER-STEP RECORD — the car at every graded grid point comes from here and from nowhere else", () => {
  describe("recordPhysicsStep: a function of the rapier body and the vehicle sim, executed", () => {
    it("records the BODY's translation and rotation and the SIM's speed, in the frame sample's own mapping", () => {
      const rec = new PlayerStepTrackRecorder();
      for (let n = 1; n <= 40; n++) {
        const b = bodyAfterStep(n);
        const took = recordPhysicsStep(rec, { translation: () => b.t, rotation: () => b.q }, { speedKmh: b.speedKmh });
        expect(took).toBe(true);
        expect(rec.stepCount).toBe(n);
        const got = readStep(rec, n);
        const due = dueRecord(b);
        expect(closeState(got, due), `step ${n}: recorded ${fmtState(got)}, the body is at ${fmtState(due)}`).toBe(true);
      }
      // The mapping, in plain numbers (not through three.js): a body at world
      // (7, ·, −11) facing world +X at 36 km/h is district (7, 11), 90°, 36.
      const east = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
      const one = new PlayerStepTrackRecorder();
      recordPhysicsStep(
        one,
        { translation: () => ({ x: 7, y: 0.4, z: -11 }), rotation: () => ({ x: east.x, y: east.y, z: east.z, w: east.w }) },
        { speedKmh: 36 },
      );
      const st = readStep(one, 1)!;
      expect(st.x).toBe(7);
      expect(st.y).toBe(11);
      expect(st.speedKmh).toBe(36);
      expect(st.headingDeg).toBeCloseTo(90, 9);
      // A reversing car's speed is recorded signed, as the sim reports it.
      recordPhysicsStep(one, { translation: () => ({ x: 0, y: 0, z: 0 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) }, { speedKmh: -4.5 });
      expect(readStep(one, 2)!.speedKmh).toBe(-4.5);
      // An unrotated body faces world +Z, which is district south: 180°.
      expect(readStep(one, 2)!.headingDeg).toBeCloseTo(180, 9);
    });

    it("a rig mid-mount (no recorder, no body or no sim) records nothing — and says so", () => {
      const rec = new PlayerStepTrackRecorder();
      const b = bodyAfterStep(3);
      const body = { translation: () => b.t, rotation: () => b.q };
      const sim = { speedKmh: b.speedKmh };
      expect(recordPhysicsStep(null, body, sim)).toBe(false);
      expect(recordPhysicsStep(undefined, body, sim)).toBe(false);
      expect(recordPhysicsStep(rec, null, sim)).toBe(false);
      expect(recordPhysicsStep(rec, body, null)).toBe(false);
      expect(rec.stepCount).toBe(0);
    });

    it("it is the ONLY writer of the step record in the product, and VehicleRig its only caller", () => {
      const track = stripComments(read("modules/sim/traffic/playerTrack.ts"));
      // Inside the recorder's module: one `.record(` call, in recordPhysicsStep.
      expect(track.split(".record(").length - 1).toBe(1);
      const fn = track.slice(track.indexOf("export function recordPhysicsStep("));
      expect(fn).toContain("rec.record(t.x, -t.z, sim.speedKmh, headingDeg);");
      // The function's module knows no frame sample: it imports types only.
      expect(track.match(/^import .*$/gm)).toEqual(['import type { PlayerStepTrack } from "./types";']);
      const rig = stripComments(read("components/sim/VehicleRig.tsx"));
      const scene = stripComments(read("components/sim/LessonScene.tsx"));
      expect(rig.split("recordPhysicsStep(").length - 1).toBe(1);
      expect(rig).not.toMatch(/\.record\(/);
      expect(scene).not.toContain("recordPhysicsStep");
      expect(scene).not.toMatch(/stepTrackRef\.current\??\.record\(|steps\.record\(/);
      // …said without naming a spelling: in the whole product (components/ and
      // modules/sim/, tests aside) NO file calls a `.record(` method but the
      // recorder's own module, and none but VehicleRig calls the function.
      // (`(steps as PlayerStepTrackRecorder).record(sample.…)` in the scene
      // would add a step the engine never took, with the frame's pose.)
      const product: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name);
          if (statSync(full).isDirectory()) {
            if (name !== "__tests__" && name !== "node_modules") walk(full);
          } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) product.push(full);
        }
      };
      walk(path.join(SRC, "components"));
      walk(path.join(SRC, "modules", "sim"));
      expect(product.length).toBeGreaterThan(300);
      const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");
      const recordCallers: string[] = [];
      const fnCallers: string[] = [];
      for (const f of product) {
        const src = stripComments(readFileSync(f, "utf-8").replace(/\r\n/g, "\n"));
        if (/\.record\(/.test(src)) recordCallers.push(rel(f));
        if (/(?<!function )\brecordPhysicsStep\(/.test(src)) fnCallers.push(rel(f));
      }
      expect(recordCallers).toEqual(["modules/sim/traffic/playerTrack.ts"]);
      expect(fnCallers).toEqual(["components/sim/VehicleRig.tsx"]);
    });
  });

  describe("VehicleRig's own callback — cut out of VehicleRig.tsx and RUN", () => {
    const rigRaw = read("components/sim/VehicleRig.tsx");
    const sf = ts.createSourceFile("VehicleRig.tsx", rigRaw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const all: ts.Node[] = [];
    const collect = (n: ts.Node) => {
      all.push(n);
      ts.forEachChild(n, collect);
    };
    collect(sf);
    /** Every call in the rig that writes a physics step into a recorder. */
    const writers = all.filter(
      (n): n is ts.CallExpression =>
        ts.isCallExpression(n) &&
        ((ts.isIdentifier(n.expression) && n.expression.text === "recordPhysicsStep") ||
          (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "record")),
    );
    /** The React / rapier hook call a node sits in (nearest `use…(` ancestor). */
    const hookOf = (n: ts.Node): ts.CallExpression | null => {
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && /^use[A-Z]/.test(p.expression.text)) return p;
      }
      return null;
    };
    const writer = writers[0];
    const hook = writer ? hookOf(writer) : null;
    const hookName = hook ? (hook.expression as ts.Identifier).text : "(none)";
    const callback = hook ? hook.arguments[0] : undefined;

    /** The names the rig's callback may read from outside itself. */
    const RIG_NAMES = ["recordPhysicsStep", "stepTrackRef", "bodyRef", "simRef"] as const;
    /** Names it must NOT need, handed over all the same — each one holding a
     *  DIFFERENT car — so a callback that went back to reading the frame's
     *  sample fails on WHAT IT RECORDED, not on a missing name. */
    const TRAP_NAMES = ["sampleRef", "sample", "chassisGroupRef", "cabinRef", "inputRef", "assistRef"] as const;

    it("the step record is written in ONE place in the rig: `useAfterPhysicsStep`, never before the step, never on the frame", () => {
      expect(writers.map((w) => w.expression.getText(sf))).toEqual(["recordPhysicsStep"]);
      expect(hookName, "the hook the step record is written in").toBe("useAfterPhysicsStep");
      expect(all.filter((n) => ts.isCallExpression(n) && n.expression.getText(sf) === "useAfterPhysicsStep").length).toBe(1);
      // WHAT THE NAMES ARE BOUND TO — the one thing the executed callback
      // below cannot show (it is handed the real function and stand-in refs).
      // Read off the tree, not a spelling: each of the two functions is
      // imported ONCE, under its own name (no `as`), from its own package…
      const imports: Array<{ name: string; from: string; aliasOf: string | null }> = [];
      for (const n of all) {
        if (!ts.isImportSpecifier(n)) continue;
        const decl = n.parent.parent.parent;
        imports.push({
          name: n.name.text,
          from: (decl.moduleSpecifier as ts.StringLiteral).text,
          aliasOf: n.propertyName ? n.propertyName.text : null,
        });
      }
      const boundTo = (name: string) => imports.filter((i) => i.name === name || i.aliasOf === name);
      expect(boundTo("useAfterPhysicsStep")).toEqual([{ name: "useAfterPhysicsStep", from: "@react-three/rapier", aliasOf: null }]);
      expect(boundTo("recordPhysicsStep")).toEqual([{ name: "recordPhysicsStep", from: "@/modules/sim/traffic", aliasOf: null }]);
      // …the traffic barrel's `recordPhysicsStep` IS playerTrack's function
      // (the very object the tests above execute), not a wrapper of it…
      expect(recordPhysicsStep).toBe(recordPhysicsStepInItsModule);
      // …and nothing in the rig DECLARES any of the four names again, in any
      // scope and by any kind of declaration (a shadow would re-point the
      // callback with its text untouched).
      const declared = all
        .filter(
          (n) =>
            ts.isVariableDeclaration(n) ||
            ts.isFunctionDeclaration(n) ||
            ts.isParameter(n) ||
            ts.isBindingElement(n) ||
            ts.isClassDeclaration(n) ||
            ts.isFunctionExpression(n) ||
            ts.isClassExpression(n) ||
            ts.isEnumDeclaration(n) ||
            ts.isModuleDeclaration(n) ||
            ts.isImportClause(n) ||
            ts.isNamespaceImport(n) ||
            ts.isImportEqualsDeclaration(n),
        )
        .map((n) => {
          const name = (n as { name?: ts.Node }).name;
          return name && ts.isIdentifier(name) ? name.text : "";
        });
      expect(declared.filter((d) => d === "recordPhysicsStep")).toEqual([]);
      expect(declared.filter((d) => d === "useAfterPhysicsStep")).toEqual([]);
      expect(declared.filter((d) => d === "bodyRef").length, "declarations of bodyRef").toBe(1);
      expect(declared.filter((d) => d === "simRef").length, "declarations of simRef (the rig's prop)").toBe(1);
      expect(declared.filter((d) => d === "stepTrackRef").length, "declarations of stepTrackRef (the rig's prop)").toBe(1);
    });

    it("the callback is that one call and nothing else: `() => recordPhysicsStep(stepTrackRef?.current, bodyRef.current, simRef.current)`", () => {
      expect(callback && ts.isArrowFunction(callback)).toBe(true);
      const arrow = callback as ts.ArrowFunction;
      expect(arrow.parameters.length).toBe(0);
      // An expression body that IS the writer call — no block, no locals, so
      // there is no `t`, `sim` or `headingDeg` of the rig's to fill from
      // somewhere else.
      expect(arrow.body === writer, "the callback's body is the recordPhysicsStep call itself").toBe(true);
      expect(writer.arguments.map((a) => a.getText(sf))).toEqual(["stepTrackRef?.current", "bodyRef.current", "simRef.current"]);
      // The names it reads from outside itself, all of them.
      const inside: ts.Node[] = [];
      const walk = (n: ts.Node) => {
        inside.push(n);
        ts.forEachChild(n, walk);
      };
      walk(arrow);
      const free = new Set<string>();
      for (const n of inside) {
        if (!ts.isIdentifier(n)) continue;
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.name === n) continue;
        free.add(n.text);
      }
      expect([...free].sort()).toEqual([...RIG_NAMES].sort());
    });

    it("`bodyRef` is the chassis rigid body and `simRef` the vehicle sim built on that body — neither is ever pointed at anything else", () => {
      const rig = stripComments(rigRaw);
      expect(rig).toContain("const bodyRef = useRef<RapierRigidBody>(null);");
      // One <RigidBody> in the rig, and it carries the ref.
      expect(rig.split("<RigidBody").length - 1).toBe(1);
      expect(rig.split("ref={bodyRef}").length - 1).toBe(1);
      const tag = rig.slice(rig.indexOf("<RigidBody"));
      expect(tag.slice(0, tag.indexOf(">"))).toContain("ref={bodyRef}");
      expect(rig).not.toMatch(/bodyRef\.current\s*=(?!=)/);
      // (the one `bodyRef =` in the rig is its declaration)
      expect(rig.match(/(?<![A-Za-z.])bodyRef\s*=(?!=)/g)).toEqual(["bodyRef ="]);
      // The sim: built on `bodyRef.current`, published once, cleared on unmount.
      const make = rig.slice(rig.indexOf("const sim = new VehicleSim("));
      expect(rig.split("new VehicleSim(").length - 1).toBe(1);
      expect(make.slice(0, make.indexOf("spawn,"))).toMatch(/world as unknown as RapierWorld,\s*body as unknown as RapierBody,/);
      const effect = rig.slice(0, rig.indexOf("const sim = new VehicleSim("));
      expect(effect.slice(effect.lastIndexOf("useEffect(() => {"))).toContain("const body = bodyRef.current;");
      const simWrites = rig.match(/simRef\.current\s*=(?!=)\s*[^;]+;/g) ?? [];
      expect(simWrites.map((w) => w.replace(/\s+/g, " "))).toEqual(["simRef.current = sim;", "simRef.current = null;"]);
      expect(rig).not.toMatch(/stepTrackRef\.current\s*=(?!=)/);
      // …and the scene, which owns the ref object, never writes the sim into it.
      expect(stripComments(read("components/sim/LessonScene.tsx"))).not.toMatch(/simRef\.current\s*=(?!=)/);
    });

    /**
     * rapier's stepper around the rig's callback: per frame the accumulator is
     * fed, and per whole step — [before-step hooks] → the body moves → [after-
     * step hooks]. The callback is registered under the hook the SOURCE
     * registers it under. Then the rig's `useFrame` runs and refreshes the
     * frame sample — so during a frame's steps `sampleRef.current` is what the
     * PREVIOUS frame drew, which is exactly what a rig reading it would record.
     */
    function runRig(deltas: readonly number[], seconds: number) {
      const text = callback ? callback.getText(sf) : "() => undefined";
      const js = ts.transpileModule(`return (${text});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText;
      const rec = new PlayerStepTrackRecorder();
      let body = bodyAfterStep(0);
      const bodyRef = { current: { translation: () => body.t, rotation: () => body.q } };
      const simRef = {
        current: {
          get speedKmh() {
            return body.speedKmh;
          },
        },
      };
      const stepTrackRef = { current: rec };
      // What the frame drew last: a different car (position, heading, speed).
      const sample = createVehicleSample();
      const sampleRef = { current: sample };
      const drawn = new Group();
      const chassisGroupRef = { current: drawn };
      const trap = { current: null };
      const make = new Function(...RIG_NAMES, ...TRAP_NAMES, `"use strict";\n${js}`) as (...a: unknown[]) => () => unknown;
      const cb = make(recordPhysicsStep, stepTrackRef, bodyRef, simRef, sampleRef, sample, chassisGroupRef, trap, trap, trap);
      const refresh = (b: BodyState) => {
        const d = dueRecord(b);
        sample.position.x = d.x;
        sample.position.y = d.y;
        sample.headingDeg = d.headingDeg;
        sample.speedKmh = d.speedKmh;
        drawn.position.set(b.t.x, b.t.y, b.t.z);
        drawn.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
        drawn.updateMatrixWorld(true);
      };
      refresh(body);
      const wrong: string[] = [];
      let steps = 0;
      let before = 0;
      let stale = 0;
      let sampleDiffers = 0;
      let accumulator = 0;
      for (let f = 0, t = 0; t < seconds; f++) {
        const delta = deltas[f % deltas.length];
        t += delta;
        accumulator += Math.min(Math.max(delta, 0), 0.5);
        while (accumulator >= H) {
          if (hookName === "useBeforePhysicsStep") cb();
          steps++;
          body = bodyAfterStep(steps);
          if (hookName === "useAfterPhysicsStep") cb();
          accumulator -= H;
          const got = readStep(rec, steps);
          const due = dueRecord(body);
          if (!closeState(got, due)) {
            if (closeState(got, dueRecord(bodyAfterStep(steps - 1)))) before++;
            else stale++;
            if (wrong.length < 4) wrong.push(`step ${steps}: recorded ${fmtState(got)}; the body after the step is at ${fmtState(due)}`);
          }
          if (!closeState({ x: sample.position.x, y: sample.position.y, speedKmh: sample.speedKmh, headingDeg: sample.headingDeg }, due)) sampleDiffers++;
        }
        // The rig's useFrame, after the stepper: the drawn chassis, one step
        // behind the body (rapier draws interpolated) — the frame's sample.
        refresh(bodyAfterStep(Math.max(0, steps - 1)));
      }
      return { steps, recorded: rec.stepCount, wrong, before, stale, sampleDiffers };
    }

    for (const [name, deltas] of [
      ["60 Hz", [1 / 60]],
      ["0.25/0.4 s", [0.25, 0.4]],
      ["0.37 s", [0.37]],
      ["0.5 s", [0.5]],
      ["120 Hz", [1 / 120]],
    ] as ReadonlyArray<readonly [string, readonly number[]]>) {
      it(`${name}: every physics step is recorded once, as the BODY after that step and the SIM's speed — whatever the frame's sample holds`, () => {
        const r = runRig(deltas, 30);
        // The test can tell the two apart: the frame's sample was a different
        // car on (nearly) every step.
        expect(r.sampleDiffers).toBeGreaterThan(r.steps * 0.9);
        expect(r.recorded, "steps recorded vs steps the engine took").toBe(r.steps);
        expect(r.before, "steps recorded as the car BEFORE the step (the record ran in a before-step hook)").toBe(0);
        expect(r.stale, "steps recorded as something other than the body after the step").toBe(0);
        expect(r.wrong, "what was recorded vs the body").toEqual([]);
      });
    }

    it("…and the model can see the two ways a rig gets it wrong: a record made before the step, and one read off the frame's sample", () => {
      // The same stepper, with a stand-in callback each time — so the
      // assertions above are known to be able to fail.
      const rec = new PlayerStepTrackRecorder();
      let body = bodyAfterStep(0);
      const sample = createVehicleSample();
      let beforeWrong = 0;
      let sampleRepeats = 0;
      let prev: PhysicsStepState | null = null;
      let steps = 0;
      let accumulator = 0;
      const rec2 = new PlayerStepTrackRecorder();
      for (let f = 0; f < 60; f++) {
        accumulator += f % 2 === 0 ? 0.25 : 0.4;
        while (accumulator >= H) {
          // (a) a before-step record
          recordPhysicsStep(rec, { translation: () => body.t, rotation: () => body.q }, { speedKmh: body.speedKmh });
          steps++;
          body = bodyAfterStep(steps);
          accumulator -= H;
          if (!closeState(readStep(rec, steps), dueRecord(body))) beforeWrong++;
          // (b) a record read off the frame's sample (RECALIAS + RECSPEED)
          rec2.record(sample.position.x, sample.position.y, sample.speedKmh, sample.headingDeg);
          const got = readStep(rec2, steps)!;
          if (prev && got.x === prev.x && got.y === prev.y) sampleRepeats++;
          prev = { ...got };
        }
        const d = dueRecord(bodyAfterStep(Math.max(0, steps - 1)));
        sample.position.x = d.x;
        sample.position.y = d.y;
        sample.headingDeg = d.headingDeg;
        sample.speedKmh = d.speedKmh;
      }
      expect(beforeWrong).toBe(steps);
      // On 0.25/0.4 s frames all but one step per frame repeat the previous
      // car state (the round-6 verifier measured 3,699 of 3,899 on the real
      // libraries).
      expect(sampleRepeats).toBeGreaterThan(steps * 0.9);
    });
  });
});
