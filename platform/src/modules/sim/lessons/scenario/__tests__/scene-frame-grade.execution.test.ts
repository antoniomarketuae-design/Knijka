/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, rounds 3–4) — THE SCENE'S FRAME
 * CALLBACK, EXECUTED WHOLE: every graded point of a multi-step frame is graded
 * exactly once, in order, the step loop's points inside the frame and the
 * frame's last point at the frame's end; the road users' shells are posed at
 * every one of them; the frame's look is heard; and a PAUSED frame grades
 * nothing and moves nothing it should not.
 *
 * WHY THIS FILE. Since this lane the frame's last point is the FRAME
 * callback's job — the step loop grades every step but the frame's last
 * before rapier takes the next.
 *   · Round 2's verifier (V2-1): only the call EXPRESSION was run; G5b (the
 *     call behind a condition) passed every test.
 *   · Round 3 ran `const steps = …` through the call. Its verifier (V3-1)
 *     placed the same skip ONE STATEMENT ABOVE that region — R1b, a
 *     `gradeGrid.clock.advanceSteps(…)` on frames longer than 20 ms — and an
 *     early `return` there (R1); both passed every test. R3 (the
 *     `if (paused) return;` removed) died on a source pin only.
 *
 * ROUND 4 closes it twice:
 *   · BY CONSTRUCTION — the grid's clock is read-only to everyone but the grid
 *     (scene/gradeGrid.ts `GradeGridClock`; pinned by scene/__tests__/
 *     grade-grid-clock-readonly.test.ts): no statement can move the grid past
 *     a point without grading it, so R1b cannot be written to compile, and run
 *     anyway it throws;
 *   · BY EXECUTION — the cut (sceneGradeCut.ts) runs RuntimeDriver's frame
 *     callback from its FIRST statement through the graded call (the
 *     blocked-attempt latch, the dashboard write, the paused early-out, the
 *     pre-drive block, the session clock, the assist, both stuck watches), and
 *     refuses to cut a callback that reads a name no harness supplies.
 *
 *   §1 reads what the cut runs and what it refuses;
 *   §2 drives the scene's own frame callback AND step-loop grade against a
 *      REAL GradeGrid and a real step recorder on frames of 1, 3, 7 and 30
 *      steps and a mixed run, with a look on every frame;
 *   §3 shows the drive in §2 can fail, on altered texts of the scene placed
 *      ANYWHERE in the callback — the round-3 verifier's R1 and R1b, a skip in
 *      the step loop, and three placements of this round's own;
 *   §4 executes a PAUSED frame (the round-3 verifier's V3-3/R3) with a cabin
 *      and pedals that would make every branch of the callback run.
 *
 * ROUND 5 — the round-4 verifier (V4-1) put an early `return` inside branches
 * the harnesses compiled but never EXECUTED (F1–F5: the pre-drive block, the
 * assist's shift, either stuck watch firing, a driveline rejection); each
 * passed every test. Closed twice again:
 *   §5 BY STRUCTURE (integrator N11) — the cut refuses, from the syntax tree,
 *      any `return` or `throw` before the graded call, at any depth, in any
 *      branch, but the one top-level `if (paused) return;` (and, in the step
 *      loop, its one guard) — F1–F6 and this round's own placements die on
 *      the refusal's text;
 *   §6 BY EXECUTION (integrator N12) — every product-reachable branch runs
 *      on multi-step frames with a real CabinControls and the scene's own
 *      procedures, every point checked; §6b shows F1–F6 caught by those
 *      drives with the refusal off; §6c is a BRANCH CENSUS — all 34 branches
 *      before the call are entered on 3-step and on 30-step frames;
 *   §7 THE LIMIT — an exception raised inside a called procedure is not
 *      refused (no syntax names it): executed here, and the R3F loop that
 *      decides what it does is pinned.
 *
 * ROUND 6 — the round-5 verifier ended frames with no `return` and no
 * `throw`: P1 (`paused` reassigned above the pause guard), P3 (the step
 * loop's `const taken` nulled), P7 (`gradeGrid.stepPhysics` replaced), each
 * behind «hazard lights on, a long frame» — a cabin state no drive set.
 *   §5b BY STRUCTURE (integrator N14) — the cut refuses any write to (or
 *      shadow of) a name the allowed exits or the graded call read, any write
 *      / computed read / method call through the grading machinery, an
 *      escape of it into an alias, and pins `const taken = …` and
 *      `const steps = …` by their exact syntax: P1, P2, P3, P7, R1c and a
 *      variant of each of this round's own die on the refusal's text; the
 *      grid's methods themselves cannot be replaced (scene/gradeGrid.ts,
 *      pinned by grade-grid-clock-readonly §4);
 *   §6 N16 BY EXECUTION — every one of the 19 keys the cabin binds, through
 *      its own key handler, and its public controls, toggled DURING frames of
 *      1, 3, 7 and 30 steps and a mixed run, on a live and on a locked cabin:
 *      every point graded once and in order, every look heard;
 *   §6d P1, P3 and P7 executed on that drive with the refusal off: each is
 *      caught on multi-step frames with the hazards on;
 *   §7 the limit worded truly (N15): ANY exception — inline (the verifier's
 *      P4, executed here) or in a called procedure.
 *
 * The world is a recording stub (no traffic, no director): what is asserted is
 * WHEN and HOW OFTEN the scene's statements grade, which is the scene's; the
 * grade's content is the census's business (npc-contact-cadence.*).
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { SimTick } from "@/modules/sim/rules/types";
import { directorContactCast, vruAheadMeters } from "@/modules/sim/orchestrator";
import { createGradeGridSample, GradeGrid, type GradeGridWorld } from "@/modules/sim/scene/gradeGrid";
import { NO_PHYSICS_STEPS, PhysicsSessionClock, PlayerStepTrackRecorder } from "@/modules/sim/traffic";
import { FIXED_DT } from "@/modules/sim/vehicle/tuning";
import { CABIN_KEYS, CabinControls, DRIVELINE_KEYS, type CabinCallbacks } from "@/modules/sim/scene/cabin";
import type { DrivelineEvent } from "@/modules/sim/vehicle/driveline";
import type { ReverseAssist } from "@/modules/sim/engine/reverseAssist";
import type { ReverseStuckWatch } from "@/modules/sim/engine/reverseStuck";
import type { StuckStartWatch } from "@/modules/sim/engine/stuckStart";
import {
  EXCEPTION_LIMIT,
  FRAME_PAUSE_GUARD,
  FRAME_STEPS,
  GUARDED_NAMES,
  RIG_STEP_LOOP_CALL,
  rigStepLoopCallRefusals,
  SCENE_GRADE_NAMES,
  STEP_LOOP_GUARD,
  STEP_LOOP_TAKEN,
  sceneFrameScope,
  sceneGradeCut,
  sceneGradeCutOf,
  type SceneGradeBound,
  type SceneGradeCut,
  type SceneGradeName,
} from "./sceneGradeCut";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENE_TEXT = readFileSync(path.resolve(HERE, "../../../../../components/sim/LessonScene.tsx"), "utf-8").replace(/\r\n/g, "\n");
const H = FIXED_DT;

const FRAME_CALL = "    gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n";
const LOOP_CALL = "      gradeTakenSteps(taken, null, null);\n";
/** RuntimeDriver's frame early-out — anchored with the comment after it (the
 *  step-loop grade has an `if (paused …` line of its own). */
const PAUSE_LINE = "    if (paused) return;\n";
const AFTER_PAUSE = "\n    // ---- A2: performed pre-drive";
const PAUSE_AT = PAUSE_LINE + AFTER_PAUSE;
const FIRST_LINE = "    const blockedAttempt = inputRef.current?.consumeBlockedDriveAttempt() ?? false;\n";
const STEPS_LINE = "    const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;\n";
const DRAIN_LINE = "    drivelineEvents.length = 0;\n    glances.length = 0;\n";

/**
 * N11 (round 5): the cut REFUSES `text` — naming the early exit — and, cut
 * again with the refusal off, the SAME text is what the executed drive below
 * runs, so each placement dies twice: by structure and by execution.
 */
function refusedThenRun(text: string, why: string): SceneGradeCut {
  expect(() => sceneGradeCutOf(text)).toThrow(why);
  const cut = sceneGradeCutOf(text, { refuseEarlyExits: false });
  expect(cut.earlyExits.length).toBeGreaterThan(0);
  return cut;
}

/** The scene's text with one exact, unique piece replaced. */
function altered(from: string, to: string): string {
  const n = SCENE_TEXT.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor found ${n} times: ${from.slice(0, 80)}`);
  return SCENE_TEXT.replace(from, () => to);
}

// ───────────────────────────────────────────────────────────────────────────
// The rig: the scene's frame callback and step-loop grade on a real grid
// ───────────────────────────────────────────────────────────────────────────

interface Rig {
  scope: Record<SceneGradeName, unknown>;
  steps: PlayerStepTrackRecorder;
  gradeGrid: GradeGrid;
  tRef: { current: number };
  sample: VehicleSample;
  log: string[];
  wrong: string[];
  setCaller(c: "loop" | "frame"): void;
}

/** One rig — the objects a mounted scene holds; `bind` it as often as a
 *  re-render would (e.g. once paused, once not). `extra` overrides names. */
function rig(extra: Partial<Record<SceneGradeName, unknown>> = {}): Rig {
  const log: string[] = [];
  const wrong: string[] = [];
  const steps = new PlayerStepTrackRecorder();
  const gradeGrid = new GradeGrid();
  const tRef = { current: 0 };
  const sample: VehicleSample = createGradeGridSample();
  let caller: "loop" | "frame" = "frame";
  const world = {
    runtime: {
      update: () => {},
      signalPhase: () => "green",
      sample: (v: VehicleSample, t: number) => {
        if (v.mirrorGlance !== null) log.push(`look ${Math.round(t / H)} ${v.mirrorGlance}`);
        return { t, position: { x: v.position.x, y: v.position.y }, events: [] };
      },
    },
    traffic: {
      update: () => {},
      leadGapMeters: () => Infinity,
      setRenderSessionTime: (t: number) => void log.push(`drawn ${t.toFixed(6)}`),
      vehicles: [],
      pedestrians: [],
      vehicleCollisionKind: () => "vehicle",
      staged: () => null,
    },
    director: null,
  } as unknown as GradeGridWorld;
  let lastShell = 0;
  const npcShellsRef = {
    current: (k: number, student: { position: { x: number } }) => {
      log.push(`shells ${k}@${student.position.x}`);
      if (k !== lastShell + 1) wrong.push(`shells posed at point ${k} after point ${lastShell}`);
      if (student.position.x !== k) wrong.push(`shells at point ${k} posed from the car at x=${student.position.x}`);
      lastShell = k;
    },
  };
  let lastTick = 0;
  const onTick = (tick: SimTick) => {
    const k = Math.round(tick.t / H);
    log.push(`point ${k} ${caller}`);
    if (k !== lastTick + 1) wrong.push(`point ${k} graded after point ${lastTick}`);
    lastTick = k;
  };
  const noop = () => {};
  const scope: Record<SceneGradeName, unknown> = {
    gradeGrid,
    stepTrackRef: { current: steps },
    tRef,
    sample,
    sampleRef: { current: sample },
    attemptRecorderRef: { current: null },
    npcShellsRef,
    paused: false,
    updateCabinChannels: noop,
    runtime: world.runtime,
    traffic: world.traffic,
    director: null,
    conditions: { isNight: false, rain: false, fog: false, snow: false },
    inputRef: { current: null },
    hazardActiveRef: { current: false },
    telltaleLitRef: { current: false },
    onTelltale: noop,
    recorder: null,
    telltaleCautionLitRef: { current: false },
    onTelltaleCaution: noop,
    onStagedOutcome: noop,
    onTick,
    onNearMiss: noop,
    cabinRef: { current: null },
    attemptFeedRef: { current: null },
    feedAttemptPoint: noop,
    simRef: { current: null },
    contactListenerRef: { current: null },
    NO_PHYSICS_STEPS,
    vruAheadMeters,
    directorContactCast,
    ...sceneFrameScope(),
    ...extra,
  };
  expect(scope.sessionClock).toBeInstanceOf(PhysicsSessionClock);
  return { scope, steps, gradeGrid, tRef, sample, log, wrong, setCaller: (c) => void (caller = c) };
}

/** Take `n` physics steps the way VehicleRig's before-step callback does —
 *  the scene's turn FIRST — asserting no step is taken while its
 *  predecessor is ungraded or its shells stale. A throw is recorded. */
function takeSteps(r: Rig, scene: SceneGradeBound, n: number, checkGraded = true): void {
  for (let i = 0; i < n; i++) {
    r.setCaller("loop");
    try {
      scene.beforeStep?.();
    } catch (e) {
      r.wrong.push(`the step loop threw: ${(e as Error).message}`);
    }
    if (checkGraded && r.gradeGrid.clock.last !== r.steps.stepCount) {
      r.wrong.push(`step ${r.steps.stepCount + 1} taken with point ${r.steps.stepCount} ungraded (grid at ${r.gradeGrid.clock.last})`);
    }
    const shellsAt = [...r.log].reverse().find((l) => l.startsWith("shells "));
    const posed = shellsAt === undefined ? 0 : Number(shellsAt.split(" ")[1].split("@")[0]);
    if (checkGraded && posed !== r.steps.stepCount) r.wrong.push(`step ${r.steps.stepCount + 1} taken with the shells posed from point ${posed}`);
    const k = r.steps.stepCount + 1;
    r.steps.record(k, 0, 36, 0);
    r.log.push(`step ${k}`);
  }
}

/** One frame of the scene's callback; a throw is recorded, never raised. */
function runFrame(r: Rig, scene: SceneGradeBound, delta: number): { calls: number; graded: number } {
  r.setCaller("frame");
  try {
    return scene.frameRun(delta);
  } catch (e) {
    r.wrong.push(`the frame threw: ${(e as Error).message}`);
    return { calls: -1, graded: 0 };
  }
}

interface Drive {
  log: string[];
  wrong: string[];
  steps: number;
  /** Points the frame's call graded, per frame. */
  frameGraded: number[];
  /** The session clock after each frame (what the frame handed the grid). */
  frameEnd: number[];
}

const LOOKS = ["left", "right", "rear", "shoulder"] as const;

/**
 * N12 (round 5): what a drive does besides stepping — the cabin, the pedals,
 * the props a mounted scene would hold, and what the driver does with them
 * between frames. `before(f, tSec)` runs before frame `f`'s steps, at the
 * session time the frame begins (keys and pedals move only between frames —
 * ADR-017 D-1). A PAUSED frame takes no step (rapier's `<Physics paused>`)
 * and runs the scene's callback bound with `paused: true`.
 */
interface Scenario {
  scope?: Partial<Record<SceneGradeName, unknown>>;
  attach?(r: Rig): void;
  before?(f: number, tSec: number): void;
  pausedFrames?: ReadonlySet<number>;
  /** N16 (round 6): the look VehicleRig's sample builder takes for frame
   *  `f` — by default a fixed cycle; a scenario with a real cabin takes the
   *  cabin's own next look (`consumeGlanceSample`), as the product does. */
  frameLook?(f: number): VehicleSample["mirrorGlance"];
  /** N16: what VehicleRig's frame does after rapier's steps and before it
   *  takes the frame's look — `cabin.update(delta, steer)` (its blink, hold
   *  refresh and stalk clocks on the render delta). */
  afterSteps?(f: number, delta: number): void;
}

function drive(cut: SceneGradeCut, frames: readonly number[], sc: Scenario = {}): Drive & { scene: SceneGradeBound; pausedScene: SceneGradeBound } {
  const r = rig(sc.scope);
  sc.attach?.(r);
  const scene = cut.bind(r.scope);
  const pausedScene = cut.bind({ ...r.scope, paused: true });
  const frameGraded: number[] = [];
  const frameEnd: number[] = [];
  frames.forEach((n, f) => {
    const paused = sc.pausedFrames?.has(f) ?? false;
    if (paused && n !== 0) throw new Error(`frame ${f}: a paused frame takes no step`);
    sc.before?.(f, r.steps.stepCount * H);
    takeSteps(r, scene, n);
    sc.afterSteps?.(f, paused ? 0.1 : n * H);
    // VehicleRig's frame took one look out of the cabin for this frame.
    r.sample.mirrorGlance = sc.frameLook ? sc.frameLook(f) : LOOKS[f % LOOKS.length];
    const res = runFrame(r, paused ? pausedScene : scene, paused ? 0.1 : n * H);
    r.sample.mirrorGlance = null;
    const want = paused ? 0 : 1;
    if (res.calls !== want) r.wrong.push(`frame ${f} reached its graded call ${res.calls} times`);
    frameGraded.push(res.graded);
    frameEnd.push(r.tRef.current);
    if (r.gradeGrid.clock.last !== r.steps.stepCount) {
      r.wrong.push(`frame ${f} ended with point ${r.steps.stepCount} ungraded (grid at ${r.gradeGrid.clock.last})`);
    }
  });
  return { log: r.log, wrong: r.wrong, steps: r.steps.stepCount, frameGraded, frameEnd, scene, pausedScene };
}

/** What the drive's log must be for `frames`: a step loop grading every step
 *  but each frame's last before the next step; the frame grading its last
 *  step — hearing the frame's look there — and then positioning what is
 *  drawn. A stepless frame keeps its look waiting for the next point; a
 *  PAUSED frame hands no look over and positions nothing. */
function expectedLog(frames: readonly number[], frameEnd: readonly number[], pausedFrames: ReadonlySet<number> = new Set()): string[] {
  const out: string[] = [];
  let k = 0;
  const waiting: string[] = [];
  const point = (by: "loop" | "frame") => {
    if (waiting.length > 0) out.push(`look ${k} ${waiting.shift()}`);
    out.push(`point ${k} ${by}`, `shells ${k}@${k}`);
  };
  frames.forEach((n, f) => {
    if (pausedFrames.has(f)) return;
    for (let i = 0; i < n; i++) {
      if (i > 0) point("loop");
      k++;
      out.push(`step ${k}`);
    }
    waiting.push(LOOKS[f % LOOKS.length]);
    if (n > 0) point("frame");
    out.push(`drawn ${frameEnd[f].toFixed(6)}`);
  });
  return out;
}

const FRAME_RUNS: Array<{ name: string; frames: number[] }> = [
  { name: "one step per frame (60 Hz)", frames: Array(40).fill(1) },
  { name: "three steps per frame (20 fps)", frames: Array(20).fill(3) },
  { name: "seven steps per frame", frames: Array(10).fill(7) },
  { name: "thirty steps per frame (the 0.5 s phone frame)", frames: Array(5).fill(30) },
  { name: "mixed: 1, 3, 7, 30, a stepless frame, 2, 1, 30, 7, 3", frames: [1, 3, 7, 30, 0, 2, 1, 30, 7, 3] },
];

// ───────────────────────────────────────────────────────────────────────────
// §1 what the cut runs, and what it refuses
// ───────────────────────────────────────────────────────────────────────────

describe("§1 the frame callback is cut out WHOLE, every name it reads is accounted for, and only an unconditional call is accepted", () => {
  const cut = sceneGradeCut();

  it("the region is the callback from its FIRST statement through the call — the latch, the dashboard, the paused early-out, the pre-drive block, the session clock, the assist and both stuck watches", () => {
    expect(cut.shape).toBe("function");
    const flat = cut.frameRegion.map((s) => s.replace(/\s+/g, " "));
    expect(flat[0]).toBe(FIRST_LINE.trim());
    expect(flat[flat.length - 1]).toBe("gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);");
    // The paused early-out is a top-level statement of the region, before the
    // session clock moves.
    const pausedAt = flat.indexOf("if (paused) return;");
    expect(pausedAt).toBeGreaterThan(0);
    expect(pausedAt).toBeLessThan(flat.indexOf("const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;"));
    expect(flat.some((s) => s.startsWith("if (dashboardStatusRef && dashCabin) {"))).toBe(true);
    expect(flat).toContain("const cabin = cabinRef.current;");
    expect(flat).toContain("const input = inputRef.current;");
    expect(flat).toContain("const dt = sessionClockAdvance(delta);");
    expect(flat).toContain("tRef.current = sessionClock.frame(dt, steps.stepCount);");
    expect(flat.some((s) => s.startsWith("if (reverseAssistEnabled && !driveLocked && cabin) {"))).toBe(true);
    expect(flat.filter((s) => s.startsWith("if (driveLocked || !cabin || input === null) {")).length).toBe(2);
    // LessonScene's own module-level declarations it reads, compiled with it.
    expect(cut.frameModuleDecls.map((d) => d.split(/[ (=]/).slice(0, 2).join(" "))).toEqual([
      "const BRAKE_PRESS_THRESHOLD",
      "const BRAKE_REARM_THRESHOLD",
      "function cabinPollBaseline",
    ]);
    // Every other name it reads is one a harness supplies.
    for (const n of cut.frameFreeNames) expect(SCENE_GRADE_NAMES as readonly string[]).toContain(n);
    expect(cut.frameFreeNames).toContain("paused");
    expect(cut.frameFreeNames).toContain("dashboardStatusRef");
  });

  it("UNREADABLE = RED: a name no harness supplies — even in a branch no harness takes — refuses the cut", () => {
    const text = altered(PAUSE_AT, PAUSE_LINE + "    if (delta > 1e9) somethingNobodySupplies();\n" + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(text)).toThrow(/reads `somethingNobodySupplies`, which no harness supplies/);
  });

  it("REFUSED: the round-2 verifier's G5b (the call in an `if … else`), a bare guard, a nested block, a call that is not the whole statement, two calls", () => {
    const g5b = altered(
      FRAME_CALL,
      "    const __g = gradeGrid as unknown as { __prev?: number; clock: { advanceSteps(n: number, o: unknown): unknown } };\n" +
        "    const __prev = __g.__prev ?? 0;\n" +
        "    __g.__prev = steps.stepCount;\n" +
        "    if (steps.stepCount - __prev > 1) __g.clock.advanceSteps(steps.stepCount - gradeGrid.clock.last, { first: 0, last: -1 });\n" +
        "    else gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n",
    );
    expect(() => sceneGradeCutOf(g5b)).toThrow(/not an unconditional statement of a function body|not a statement of its own/);
    const guard = altered(FRAME_CALL, "    if (steps.stepCount > 0) gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n");
    expect(() => sceneGradeCutOf(guard)).toThrow(/nested block|not a statement of its own|not an unconditional/);
    const block = altered(FRAME_CALL, "    {\n      gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n    }\n");
    expect(() => sceneGradeCutOf(block)).toThrow(/nested block/);
    const andAnd = altered(FRAME_CALL, "    steps.stepCount < 2 && gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n");
    expect(() => sceneGradeCutOf(andAnd)).toThrow(/not a statement of its own/);
    const twice = altered(FRAME_CALL, FRAME_CALL + FRAME_CALL);
    expect(() => sceneGradeCutOf(twice)).toThrow(/expected one frame call of gradeTakenSteps, found 2/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 the drive, on the scene's own text
// ───────────────────────────────────────────────────────────────────────────

describe("§2 a REAL GradeGrid driven by the scene's own frame callback and step-loop grade: every point once, in order; the frame's last point at the frame end, hearing the frame's look; the shells posed at every point", () => {
  const cut = sceneGradeCut();

  for (const run of FRAME_RUNS) {
    it(run.name, () => {
      const d = drive(cut, run.frames);
      expect(d.wrong).toEqual([]);
      const total = run.frames.reduce((a, b) => a + b, 0);
      expect(d.steps).toBe(total);
      // The frame's call graded exactly the frame's last point (none on a
      // frame rapier took no step in) — every other point was the loop's.
      expect(d.frameGraded).toEqual(run.frames.map((n) => (n > 0 ? 1 : 0)));
      // The whole sequence, event by event.
      expect(d.log).toEqual(expectedLog(run.frames, d.frameEnd));
      // Every point graded once; every point's shells posed once; every look heard.
      const points = d.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
      expect(points).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      expect(d.log.filter((l) => l.startsWith("shells ")).length).toBe(total);
      expect(d.log.filter((l) => l.startsWith("look ")).length).toBe(run.frames.length - (run.frames[run.frames.length - 1] === 0 ? 1 : 0));
      // THE FRAME END is the session clock the callback itself advanced: the
      // frame's delta, clamped, against the steps counted.
      let fed = 0;
      run.frames.forEach((n, f) => {
        fed += Math.min(n * H, 0.5);
        expect(d.frameEnd[f]).toBeCloseTo(fed, 9);
      });
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §3 the same drive fails on altered texts of the scene
// ───────────────────────────────────────────────────────────────────────────

describe("§3 the drive above can fail: altered texts of the scene — anywhere in the callback — cut and run the same way", () => {
  const LONG = [3, 3, 7];

  it("the round-3 verifier's R1b (a clock skip above `const steps` on frames longer than 20 ms): the grid's clock has no advance to call — the frame throws and its last point is not graded at its end", () => {
    const r1b = altered(
      STEPS_LINE,
      "    if (delta > 0.02 && (stepTrackRef.current?.stepCount ?? 0) > gradeGrid.clock.last) gradeGrid.clock.advanceSteps((stepTrackRef.current?.stepCount ?? 0) - gradeGrid.clock.last, { first: 0, last: -1 } as never);\n" +
        STEPS_LINE,
    );
    // Round 6 (N14 b): refused by the cut too — a method called through the
    // grid that is not the graded call.
    const cut = refusedThenRun(r1b, "calls a method through `gradeGrid` (N14b)");
    const d = drive(cut, LONG);
    expect(d.wrong).toContain("the frame threw: gradeGrid.clock.advanceSteps is not a function");
    expect(d.wrong).toContain("frame 0 ended with point 3 ungraded (grid at 2)");
    expect(d.frameGraded).toEqual([0, 0, 0]);
    // …and at one step per frame it is invisible — the 60 Hz rows of every
    // census could not have caught it.
    expect(drive(cut, Array(10).fill(1)).wrong).toEqual([]);
  });

  it("the round-3 verifier's R1 (an early `return` above `const steps` on long frames): the frame's last point is left to the next frame's step loop — with no frame end and no look", () => {
    const r1 = altered(
      STEPS_LINE,
      "    if (delta > 0.02 && (stepTrackRef.current?.stepCount ?? 0) > gradeGrid.clock.last) return;\n" + STEPS_LINE,
    );
    const d = drive(refusedThenRun(r1, "`return` before the graded call — `if (delta > 0.02 && (stepTrackRef"), LONG);
    expect(d.wrong).toContain("frame 0 reached its graded call 0 times");
    expect(d.wrong).toContain("frame 0 ended with point 3 ungraded (grid at 2)");
    expect(d.log).not.toContain("look 3 left");
    expect(d.log.filter((l) => l.startsWith("drawn "))).toEqual([]);
  });

  it("OWN O1 — the callback's FIRST statement returns on a long frame (before the latch, the dashboard and the pause guard)", () => {
    const o1 = altered(FIRST_LINE, "    if (delta > 0.25) return;\n" + FIRST_LINE);
    const d = drive(refusedThenRun(o1, "`return` before the graded call — `if (delta > 0.25) return;`"), [30, 30, 1]);
    expect(d.wrong).toContain("frame 0 ended with point 30 ungraded (grid at 29)");
    expect(d.frameGraded).toEqual([0, 0, 1]);
  });

  it("OWN O2 — the frame's look dropped on long frames before the pause guard: every point is graded, but the look is never heard", () => {
    const o2 = altered(PAUSE_AT, "    if (delta > 0.02) sampleRef.current.mirrorGlance = null;\n" + PAUSE_AT);
    // Since integration (V6-2, N14 f) the cut also REFUSES it by structure —
    // a write through a ref the grading reads; run here with the refusal off.
    expect(() => sceneGradeCutOf(o2)).toThrow("writes a member of `sampleRef`, a ref the grading reads (N14f)");
    const d = drive(sceneGradeCutOf(o2, { refuseEarlyExits: false }), LONG);
    expect(d.wrong).toEqual([]);
    expect(d.log.filter((l) => l.startsWith("look "))).toEqual([]);
    expect(d.log).not.toEqual(expectedLog(LONG, d.frameEnd));
  });

  it("OWN O3 — the pause guard widened to «paused, or a frame longer than 0.1 s»: such a frame is treated as paused, its last point waits for the next frame and its session time is lost", () => {
    const o3 = altered(PAUSE_AT, "    if (paused || delta > 0.1) return;\n" + AFTER_PAUSE);
    const d = drive(refusedThenRun(o3, "`return` before the graded call — `if (paused || delta > 0.1) return;`"), LONG);
    expect(d.wrong).toContain("frame 2 reached its graded call 0 times");
    expect(d.wrong).toContain("frame 2 ended with point 13 ungraded (grid at 12)");
    expect(d.frameEnd[2]).toBe(d.frameEnd[1]);
  });

  it("THE STEP LOOP'S OWN SITE: a step loop that advances the clock instead of grading — no advance to call: it throws, and the steps between meet unposed shells", () => {
    const skip = altered(LOOP_CALL, "      gradeGrid.clock.advanceSteps(taken.stepCount - gradeGrid.clock.last, { first: 0, last: -1 });\n");
    const cut = refusedThenRun(skip, "N11): the step-loop grade makes 0 gradeTakenSteps calls");
    const d = drive(cut, [3]);
    expect(d.wrong).toContain("the step loop threw: gradeGrid.clock.advanceSteps is not a function");
    expect(d.wrong.some((w) => /step 2 taken with the shells posed from point 0/.test(w))).toBe(true);
    // …and at one step per frame the same mutant is invisible: the step loop
    // never owes a point there.
    expect(drive(cut, Array(10).fill(1)).wrong).toEqual([]);
  });

  it("THE STEP LOOP'S OWN SITE, compiling: a step loop that grades nothing — the frame grades the whole frame's points at its end, after the steps met stale shells", () => {
    const none = altered(LOOP_CALL, "");
    const d = drive(refusedThenRun(none, "N11): the step-loop grade makes 0 gradeTakenSteps calls"), [3]);
    expect(d.log.filter((l) => l.startsWith("point "))).toEqual(["point 1 frame", "point 2 frame", "point 3 frame"]);
    expect(d.wrong.some((w) => /step 2 taken with point 1 ungraded/.test(w))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §4 a PAUSED frame, executed
// ───────────────────────────────────────────────────────────────────────────

/** A cabin and pedals with which every branch of the callback would run if
 *  it were reached: an automatic box with the engine on (the assist), a
 *  live driveline (both stuck watches), a dashboard to write, a throttle
 *  press while locked (the latch), queued driveline events and looks. */
function liveCabin() {
  const driveline = {
    transmission: "automatic",
    engineOn: true,
    selector: "D",
    stalled: false,
    physicsInput: { engineOn: true, selector: "D", parkingBrake: false, clutch: 0, gear: 1, transmission: "automatic" },
    snapshot: () => ({}),
    gearUp: () => true,
    gearDown: () => true,
  };
  return {
    driveline,
    seatbeltOn: true,
    headlights: "off",
    indicator: "off",
    consumeGlanceSample: () => null,
  };
}

describe("§4 a PAUSED frame grades nothing, advances no clock and steps no coaching watch — executed, with a cabin that would make every branch run (the round-3 verifier's V3-3 / R3)", () => {
  /**
   * WHAT THE PRODUCT DOES ON A PAUSED FRAME, read from RuntimeDriver's frame
   * callback and pinned here by execution:
   *  · RUNS: the blocked-attempt latch is CONSUMED (so attempts made during a
   *    pause never queue up) but not surfaced; the status dashboard is WRITTEN
   *    (cabin keys still work during a pause and the bar mirrors them);
   *  · DOES NOT RUN (`if (paused) return;`): the pre-drive observer and the
   *    queue drains (driveline events and looks wait for the first live
   *    frame); the session clock (no session time passes); the reverse
   *    assist; both stuck watches (neither stepped nor reset); the graded call
   *    — no point is graded, even one a stepper took anyway, and the frame's
   *    look is not handed to the grid. (VehicleRig's own frame, which is not
   *    paused, takes the next frame's look over this one's: a look made
   *    during a pause is not heard. The world is not moving; that is not a
   *    driving decision.)
   * The step-loop grade is paused by the same prop (step-loop-grade.test.ts).
   */
  function pausedRun(text?: string) {
    const cut = text === undefined ? sceneGradeCut() : sceneGradeCutOf(text);
    const cabin = liveCabin();
    let blockedPresses = 0;
    const input = {
      rawBrake: 0,
      rawThrottle: 0.6,
      reversePedalDisowned: false,
      consumeBlockedDriveAttempt: () => ++blockedPresses > 0,
      read: () => null,
    };
    const dashboardWrites: number[] = [];
    const surfaced: string[] = [];
    const drivelineEvents: unknown[] = [];
    const glances: unknown[] = [];
    const r = rig({
      cabinRef: { current: cabin },
      inputRef: { current: input },
      dashboardStatusRef: { current: null },
      writeDashboardStatus: (scratch: unknown) => {
        dashboardWrites.push(blockedPresses);
        return scratch;
      },
      onBlockedDriveAttempt: () => void surfaced.push("blocked"),
      drivelineEventsRef: { current: drivelineEvents },
      glanceQueueRef: { current: glances },
    });
    const assist = r.scope.reverseAssist as ReverseAssist;
    const stuck = r.scope.reverseStuck as ReverseStuckWatch;
    const start = r.scope.stuckStart as StuckStartWatch;
    const calls = {
      assist: vi.spyOn(assist, "update"),
      stuckUpdate: vi.spyOn(stuck, "update"),
      stuckReset: vi.spyOn(stuck, "reset"),
      startUpdate: vi.spyOn(start, "update"),
      startReset: vi.spyOn(start, "reset"),
    };
    const counts = () => Object.fromEntries(Object.entries(calls).map(([k, s]) => [k, s.mock.calls.length]));
    const live = cut.bind(r.scope);
    const paused = cut.bind({ ...r.scope, paused: true });
    return { r, live, paused, counts, dashboardWrites, surfaced, drivelineEvents, glances, presses: () => blockedPresses };
  }

  it("live 3-step frames, then a paused frame in which a stepper took two steps anyway, then live again: the paused frame grades nothing and moves nothing; the owed steps are graded in order by the first live step", () => {
    const p = pausedRun();
    const { r } = p;
    // Two live frames of three steps.
    for (let f = 0; f < 2; f++) {
      takeSteps(r, p.live, 3);
      expect(runFrame(r, p.live, 3 * H)).toEqual({ calls: 1, graded: 1 });
    }
    expect(r.gradeGrid.clock.last).toBe(6);
    const before = { counts: p.counts(), t: r.tRef.current, session: (r.scope.sessionClock as PhysicsSessionClock).timeSec, log: r.log.length };
    expect(before.counts.assist).toBe(2);
    expect(before.counts.stuckUpdate).toBe(2);
    expect(before.counts.startUpdate).toBe(2);
    expect(p.surfaced).toEqual(["blocked", "blocked"]);

    // THE PAUSED FRAME. rapier's `<Physics paused>` takes no step — but a
    // stepper that took two anyway leaves them owed; the paused step loop
    // grades nothing either.
    takeSteps(r, p.paused, 2, false);
    p.drivelineEvents.push({ kind: "ignitionOn" });
    p.glances.push("left");
    r.sample.mirrorGlance = "right";
    const res = runFrame(r, p.paused, 0.25);
    r.sample.mirrorGlance = null;
    expect(r.wrong).toEqual([]);
    expect(res).toEqual({ calls: 0, graded: 0 });
    // No point graded; no look handed over; nothing drawn positioned.
    expect(r.gradeGrid.clock.last).toBe(6);
    expect(r.gradeGrid.pendingLooks).toBe(0);
    expect(r.log.slice(before.log)).toEqual(["step 7", "step 8"]);
    // No session time passed.
    expect(r.tRef.current).toBe(before.t);
    expect((r.scope.sessionClock as PhysicsSessionClock).timeSec).toBe(before.session);
    // Neither the assist nor either stuck watch was stepped or reset.
    expect(p.counts()).toEqual(before.counts);
    // The latch was consumed but not surfaced; the dashboard was written.
    expect(p.presses()).toBe(3);
    expect(p.surfaced).toEqual(["blocked", "blocked"]);
    expect(p.dashboardWrites).toEqual([1, 2, 3]);
    // The queues wait for the first live frame.
    expect(p.drivelineEvents.length).toBe(1);
    expect(p.glances.length).toBe(1);

    // LIVE AGAIN: the first step's turn grades the two owed points, in order,
    // before the step is taken; the frame grades its last.
    takeSteps(r, p.live, 3);
    expect(runFrame(r, p.live, 3 * H)).toEqual({ calls: 1, graded: 1 });
    expect(r.wrong).toEqual([]);
    const points = r.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
    expect(points).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.log.slice(before.log)).toEqual([
      "step 7",
      "step 8",
      "point 7 loop",
      "shells 7@7",
      "point 8 loop",
      "shells 8@8",
      "step 9",
      "point 9 loop",
      "shells 9@9",
      "step 10",
      "point 10 loop",
      "shells 10@10",
      "step 11",
      "point 11 frame",
      "shells 11@11",
      `drawn ${r.tRef.current.toFixed(6)}`,
    ]);
    expect(p.drivelineEvents.length).toBe(0);
    expect(p.glances.length).toBe(0);
    expect(p.counts().assist).toBe(3);
  });

  it("a paused frame on which rapier took no step (the ordinary pause) grades nothing and moves nothing either", () => {
    const p = pausedRun();
    const { r } = p;
    takeSteps(r, p.live, 1);
    runFrame(r, p.live, H);
    const before = { counts: p.counts(), t: r.tRef.current, last: r.gradeGrid.clock.last };
    for (let i = 0; i < 5; i++) expect(runFrame(r, p.paused, 0.1)).toEqual({ calls: 0, graded: 0 });
    expect(r.gradeGrid.clock.last).toBe(before.last);
    expect(r.tRef.current).toBe(before.t);
    expect(p.counts()).toEqual(before.counts);
    expect(r.wrong).toEqual([]);
  });

  it("R3 — the early-out removed: the paused frame advances the session clock, steps the assist and both watches, and reaches the graded call (which grades the owed steps)", () => {
    const p = pausedRun(altered(PAUSE_AT, AFTER_PAUSE));
    const { r } = p;
    takeSteps(r, p.live, 3);
    runFrame(r, p.live, 3 * H);
    const before = { counts: p.counts(), t: r.tRef.current };
    takeSteps(r, p.paused, 2, false);
    const res = runFrame(r, p.paused, 0.25);
    expect(res.calls).toBe(1);
    expect(r.gradeGrid.clock.last).toBe(5);
    expect(r.tRef.current).toBeGreaterThan(before.t);
    expect(p.counts().assist).toBe(before.counts.assist + 1);
    expect(p.counts().stuckUpdate).toBe(before.counts.stuckUpdate + 1);
    expect(p.counts().startUpdate).toBe(before.counts.startUpdate + 1);
    // …and §4's own pins say so: this is what the first test refuses.
    expect(p.drivelineEvents.length).toBe(0);
  });

  it("OWN — the early-out moved below the pre-drive block: a paused frame drains the queues and surfaces the blocked press", () => {
    const moved = altered(PAUSE_AT, AFTER_PAUSE).replace(DRAIN_LINE, () => DRAIN_LINE + PAUSE_LINE);
    const p = pausedRun(moved);
    const { r } = p;
    takeSteps(r, p.live, 1);
    runFrame(r, p.live, H);
    p.drivelineEvents.push({ kind: "ignitionOn" });
    runFrame(r, p.paused, 0.1);
    expect(p.surfaced).toEqual(["blocked", "blocked"]);
    expect(p.drivelineEvents.length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §5 N11 — «end the frame early» is refused by structure
// ───────────────────────────────────────────────────────────────────────────

/** The round-4 verifier's F1–F6 (scratch npcstep-verify/r4mut/extra.json),
 *  verbatim: an early `return` on frames longer than 20 ms inside a branch of
 *  the frame callback that no harness executed through round 4. */
const F_MUTANTS: Record<string, { from: string; to: string }> = {
  F1: {
    from: "    if (driveLocked && cabin) {\n      const tracker = trackerRef.current;",
    to: "    if (driveLocked && cabin) {\n      if (delta > 0.02) return;\n      const tracker = trackerRef.current;",
  },
  F2: { from: "        if (cmd) {\n", to: "        if (cmd) {\n          if (delta > 0.02) return;\n" },
  F3: {
    from: "      if (stuck !== null) onReversePedalStuck?.(stuck);",
    to: "      if (stuck !== null) { onReversePedalStuck?.(stuck); if (delta > 0.02) return; }",
  },
  F4: {
    from: "      if (blocked !== null) onStuckStart?.(blocked);",
    to: "      if (blocked !== null) { onStuckStart?.(blocked); if (delta > 0.02) return; }",
  },
  F5: {
    from: "          onDrivelineRejection(event, cabin.driveline.snapshot());",
    to: "          onDrivelineRejection(event, cabin.driveline.snapshot());\n          if (delta > 0.02) return;",
  },
  F6: {
    from: "    } else if (blockedAttempt) {\n      onBlockedDriveAttempt();\n",
    to: "    } else if (blockedAttempt) {\n      onBlockedDriveAttempt();\n      if (delta > 0.02) return;\n",
  },
};

const RETURN_REFUSED = "`return` before the graded call — `if (delta > 0.02) return;`";

describe("§5 N11 — the cut REFUSES, from the syntax tree, every `return` / `throw` that can end the frame callback (or the step-loop grade) before its graded call, at any depth, in any branch — except the one top-level `if (paused) return;`", () => {
  it("the scene as it stands: no early exit but the pause guard, exactly once, as a top-level statement before the session clock", () => {
    const cut = sceneGradeCut();
    expect(cut.earlyExits).toEqual([]);
    const flat = cut.frameRegion.map((s) => s.replace(/\s+/g, " "));
    expect(flat.filter((s) => s === FRAME_PAUSE_GUARD)).toHaveLength(1);
    expect(FRAME_PAUSE_GUARD).toBe(PAUSE_LINE.trim());
    expect(SCENE_TEXT.includes(`      ${STEP_LOOP_GUARD}\n`)).toBe(true);
  });

  for (const [id, m] of Object.entries(F_MUTANTS)) {
    it(`the round-4 verifier's ${id} is refused, naming the exit`, () => {
      const text = altered(m.from, m.to);
      expect(() => sceneGradeCutOf(text)).toThrow(RETURN_REFUSED);
      expect(sceneGradeCutOf(text, { refuseEarlyExits: false }).earlyExits).toHaveLength(1);
    });
  }

  it("OWN — a `throw` (top level, on long frames), a `return` in a nested block, a `return` in a labelled block: each refused", () => {
    const thrown = altered(FIRST_LINE, "    if (delta > 0.02) throw new Error(\"long frame\");\n" + FIRST_LINE);
    expect(() => sceneGradeCutOf(thrown)).toThrow("`throw` before the graded call — `if (delta > 0.02) throw new Error(\"long frame\");`");
    const nested = altered(PAUSE_AT, PAUSE_LINE + "    {\n      if (delta > 0.02) {\n        return;\n      }\n    }\n" + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(nested)).toThrow("`return` before the graded call — `return;` in `if (delta > 0.02)`");
    const labelled = altered(PAUSE_AT, PAUSE_LINE + "    longFrame: {\n      if (delta <= 0.02) break longFrame;\n      return;\n    }\n" + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(labelled)).toThrow("`return` before the graded call — `return;` in `longFrame: {`");
  });

  it("OWN — a labelled block that WRAPS the graded call and `break`s out of it on long frames: refused (the call is no longer a top-level statement)", () => {
    const wrapped = altered(
      FRAME_CALL,
      "    grading: {\n      if (delta > 0.02) break grading;\n  " + FRAME_CALL + "    }\n",
    );
    expect(() => sceneGradeCutOf(wrapped)).toThrow("nested block");
  });

  it("OWN — the pause guard spelled differently (braces), widened, or written twice: refused; it is matched by its exact syntax", () => {
    const braces = altered(PAUSE_AT, "    if (paused) {\n      return;\n    }\n" + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(braces)).toThrow("`return` before the graded call — `return;` in `if (paused)`");
    const widened = altered(PAUSE_AT, "    if (paused || delta > 0.1) return;\n" + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(widened)).toThrow("`return` before the graded call — `if (paused || delta > 0.1) return;`");
    const twice = altered(PAUSE_AT, PAUSE_LINE + PAUSE_LINE + AFTER_PAUSE);
    expect(() => sceneGradeCutOf(twice)).toThrow("a second `if (paused) return;`");
  });

  it("NESTED FUNCTIONS: a `throw` inside a callback defined in the frame callback is refused (invoked inline it ends the frame); a `return` there is not (it leaves only that callback) and the drive stays clean", () => {
    const nestedThrow = altered(
      "      const emit = (stepId: PreDriveStepId | null) => {\n",
      "      const emit = (stepId: PreDriveStepId | null) => {\n        if (stepId === \"check-mirrors\") throw new Error(\"x\");\n",
    );
    expect(() => sceneGradeCutOf(nestedThrow)).toThrow("`throw` before the graded call");
    const nestedReturn = altered(
      "      const emit = (stepId: PreDriveStepId | null) => {\n",
      "      const emit = (stepId: PreDriveStepId | null) => {\n        if (stepId === null) return;\n",
    );
    const cut = sceneGradeCutOf(nestedReturn);
    expect(cut.earlyExits).toEqual([]);
    expect(drive(cut, [3, 7, 1]).wrong).toEqual([]);
  });

  it("OWN — a shadow of `gradeTakenSteps` declared in the frame callback is refused", () => {
    const shadow = altered(STEPS_LINE, "    const gradeTakenSteps = (..._a: unknown[]) => 0;\n" + STEPS_LINE);
    expect(() => sceneGradeCutOf(shadow)).toThrow("`gradeTakenSteps` re-declared before the graded call");
  });

  it("THE STEP LOOP: the round-4 verifier's SL1 (a return while an indicator is on), a `throw`, and a widened guard — each refused; the guard is matched exactly", () => {
    const sl1 = altered(LOOP_CALL, "      if (cabin && cabin.indicator !== \"off\") return;\n" + LOOP_CALL);
    expect(() => sceneGradeCutOf(sl1)).toThrow("step-loop grade line");
    expect(() => sceneGradeCutOf(sl1)).toThrow("`return` before the graded call — `if (cabin && cabin.indicator !== \"off\") return;`");
    const thrown = altered(LOOP_CALL, "      if (taken.stepCount > 1e9) throw new Error(\"x\");\n" + LOOP_CALL);
    expect(() => sceneGradeCutOf(thrown)).toThrow("step-loop grade line");
    const widened = altered(`      ${STEP_LOOP_GUARD}\n`, `      ${STEP_LOOP_GUARD.replace("paused ||", "paused || taken.stepCount % 2 === 0 ||")}\n`);
    expect(() => sceneGradeCutOf(widened)).toThrow("`return` before the graded call — `if (paused || taken.stepCount % 2 === 0 ||");
  });

  it("ONLY THIS FILE may cut the scene with the refusal off (it does so to show the executed drives catch the same texts)", () => {
    const dir = HERE;
    const users = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "sceneGradeCut.ts" && readFileSync(path.join(dir, f), "utf-8").includes("refuseEarlyExits"));
    expect(users).toEqual(["scene-frame-grade.execution.test.ts"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §6 N12 — the product-reachable branches, EXECUTED on multi-step frames
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// §5b N14 (round 6) — what the exits and the graded call READ is not written
// ───────────────────────────────────────────────────────────────────────────

const HOLDER_AT = "    const sample = sampleRef.current;\n    const recorder = attemptRecorderRef?.current;\n    return gradeGrid.stepPhysics(";
const LAYOUT_AT = "  useLayoutEffect(() => {\n    const grade = () => {\n";
const GUARD_AT = `      ${STEP_LOOP_GUARD}\n`;

describe("§5b N14 (round 6) — the cut REFUSES any write to what an allowed exit or the graded call reads, any write through the grading machinery, and pins both input declarations by their exact syntax: the round-5 verifier's P1, P2, P3, P7 and R1c, and a variant of each of this round's own", () => {
  it("the guarded names are DERIVED from the two exits and the two pinned declarations (plus the graded function and the step-loop ref); the scene as it stands writes none of them", () => {
    expect([...GUARDED_NAMES].sort()).toEqual(
      ["NO_PHYSICS_STEPS", "gradeGrid", "gradeTakenSteps", "paused", "stepLoopGradeRef", "stepTrackRef", "steps", "taken"].sort(),
    );
    expect(sceneGradeCut().earlyExits).toEqual([]);
    expect(SCENE_TEXT.includes(`    ${FRAME_STEPS}\n`)).toBe(true);
    expect(SCENE_TEXT.includes(`      ${STEP_LOOP_TAKEN}\n${GUARD_AT}`)).toBe(true);
  });

  const cases: Array<{ id: string; text: () => string; why: string; listed?: false }> = [
    // ── P1 and its variants: the pause guard's input ───────────────────────
    { id: "P1 (the verifier's: `paused = paused || …` above the guard)", text: () => altered(P_MUTANTS.P1.from, P_MUTANTS.P1.to), why: "writes `paused`, which an allowed exit or the graded call reads (N14a)" },
    {
      id: "OWN P1-destructure (`({ paused } = { paused: … })`)",
      text: () => altered(PAUSE_AT, `    ({ paused } = { paused: paused || (delta > 0.02 && ${HZ}) });\n` + PAUSE_AT),
      why: "writes `paused`",
    },
    {
      id: "OWN P1-array (`[paused] = […]`)",
      text: () => altered(PAUSE_AT, `    [paused] = [paused || delta > 0.02];\n` + PAUSE_AT),
      why: "writes `paused`",
    },
    {
      id: "OWN P1-shadow (`const paused = …` in the callback, read by the guard)",
      text: () => altered(FIRST_LINE, `    const paused = delta > 0.02 && ${HZ};\n` + FIRST_LINE),
      why: "binds `paused` — a shadow",
    },
    {
      id: "OWN P1-var (a `var paused` hoisted out of a nested block)",
      text: () => altered(PAUSE_AT, `    if (delta > 0.02) {\n      var paused = true;\n    }\n` + PAUSE_AT),
      why: "binds `paused` — a shadow",
    },
    {
      id: "OWN P1-render (RuntimeDriver's render writes the prop before installing the step loop)",
      text: () => altered(LAYOUT_AT, "  paused = paused || false;\n" + LAYOUT_AT),
      why: "RuntimeDriver line",
    },
    // ── P2 / P3 and variants: the two input declarations ──────────────────
    { id: "P2 (the verifier's ternary in `const steps`)", text: () => altered(P_MUTANTS.P2.from, P_MUTANTS.P2.to), why: "`steps` is not declared as `const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;` (N14c)" },
    { id: "P3 (the verifier's ternary in `const taken`)", text: () => altered(P_MUTANTS.P3.from, P_MUTANTS.P3.to), why: "its first statement is not `const taken = stepTrackRef.current;` (N14c)" },
    {
      id: "OWN P3-let (`let taken`, then nulled while hazards are on)",
      text: () => altered(`      ${STEP_LOOP_TAKEN}\n`, `      let taken = stepTrackRef.current;\n      if (${HZ}) taken = null;\n`),
      why: "(N14c)",
    },
    {
      id: "OWN P3-member (the frame nulls the step record on long frames with hazards on)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02 && ${HZ}) stepTrackRef.current = null;\n` + STEPS_LINE),
      why: "writes a member of `stepTrackRef` (N14b)",
    },
    {
      id: "OWN P3-record (the step loop rewinds the record it grades)",
      text: () => altered(GUARD_AT, GUARD_AT + `      if (${HZ}) taken.stepCount = gradeGrid.clock.last;\n`),
      why: "writes a member of `taken` (N14b)",
    },
    // ── P7 and variants: the grading machinery ─────────────────────────────
    { id: "P7 (the verifier's `gradeGrid.stepPhysics = () => 0`)", text: () => altered(P_MUTANTS.P7.from, P_MUTANTS.P7.to), why: "writes a member of `gradeGrid` (N14b)" },
    {
      id: "OWN P7-computed (`gradeGrid[\"stepPhysics\"] = …`)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02 && ${HZ}) gradeGrid["stepPhysics"] = () => 0;\n` + STEPS_LINE),
      why: "writes a member of `gradeGrid` (N14b)",
    },
    {
      id: "OWN P7-alias (`const g = gradeGrid; g.stepPhysics = …`)",
      text: () => altered(STEPS_LINE, `    const g = gradeGrid;\n    if (delta > 0.02 && ${HZ}) g.stepPhysics = () => 0;\n` + STEPS_LINE),
      why: "`gradeGrid` escapes into",
    },
    {
      id: "OWN P7-assign (`Object.assign(gradeGrid, { stepPhysics })`)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02 && ${HZ}) Object.assign(gradeGrid, { stepPhysics: () => 0 });\n` + STEPS_LINE),
      why: "`gradeGrid` escapes into",
    },
    {
      id: "OWN P7-ref (the step-loop ref emptied from the frame on long frames)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02 && ${HZ}) stepLoopGradeRef.current = null;\n` + STEPS_LINE),
      why: "writes a member of `stepLoopGradeRef` (N14b)",
      // The frame callback never READS the step-loop ref, so no harness
      // supplies it: cut with the refusal off it is an unreadable name.
      listed: false,
    },
    {
      id: "the round-4 verifier's R1c (`gradeGrid[\"gridClock\"].advanceSteps(…)`)",
      text: () =>
        altered(
          STEPS_LINE,
          "    if (delta > 0.02 && (stepTrackRef.current?.stepCount ?? 0) > gradeGrid.clock.last) gradeGrid[\"gridClock\"].advanceSteps((stepTrackRef.current?.stepCount ?? 0) - gradeGrid.clock.last, { first: 0, last: -1 });\n" +
            STEPS_LINE,
        ),
      why: "reads a computed member of `gradeGrid` (N14b)",
    },
    // ── the graded function itself ────────────────────────────────────────
    {
      id: "OWN — `gradeTakenSteps` swaps its `steps` for nothing on every other in-loop call",
      text: () => altered(HOLDER_AT, "    if (frameEndSec === null && steps.stepCount % 2 === 0) steps = NO_PHYSICS_STEPS;\n" + HOLDER_AT),
      why: "gradeTakenSteps line",
    },
    {
      id: "OWN — `gradeTakenSteps` returns before its `stepPhysics` on every other in-loop call",
      text: () => altered(HOLDER_AT, "    if (frameEndSec === null && steps.stepCount % 2 === 0) return 0;\n" + HOLDER_AT),
      why: "gradeTakenSteps line",
    },
  ];
  for (const c of cases) {
    it(`${c.id}: refused`, () => {
      const text = c.text();
      expect(() => sceneGradeCutOf(text)).toThrow(c.why);
      if (c.listed === false) expect(() => sceneGradeCutOf(text, { refuseEarlyExits: false })).toThrow("reads `stepLoopGradeRef`, which no harness supplies");
      else expect(sceneGradeCutOf(text, { refuseEarlyExits: false }).earlyExits.length).toBeGreaterThan(0);
    });
  }

  it("NOT refused, and stated (N15): an exception raised INLINE (the verifier's P4) — no syntax names it; §7 executes what it does", () => {
    expect(sceneGradeCutOf(altered(P_MUTANTS.P4.from, P_MUTANTS.P4.to)).earlyExits).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §5c INTEGRATION (the round-6 verifier's V6-1 and V6-2) — the step loop's
// caller, and the refs the grading reads
// ───────────────────────────────────────────────────────────────────────────

const RIG_TEXT = readFileSync(path.resolve(HERE, "../../../../../components/sim/VehicleRig.tsx"), "utf-8").replace(/\r\n/g, "\n");
const RIG_FIRST = "    stepLoopGradeRef?.current?.();\n    const sim = simRef.current;\n";
/** The rig's text with one exact, unique piece replaced. */
function rigAltered(from: string, to: string): string {
  const n = RIG_TEXT.split(from).length - 1;
  if (n !== 1) throw new Error(`rig anchor found ${n} times: ${from.slice(0, 80)}`);
  return RIG_TEXT.replace(from, () => to);
}
/** «hazard lights on and the brake pressed» — the round-6 verifier's trigger. */
const HZ_BRAKE = "(cabinRef.current?.driveline.hazardsOn ?? false) && (inputRef.current?.rawBrake ?? 0) > 0.3";
const SHELLS_CALL = "    gradeTakenSteps(steps, tRef.current, sample.mirrorGlance);\n";

describe("§5c V6-1 — the step loop's CALLER: VehicleRig's before-step callback runs the scene's step-loop grade FIRST, as an unconditional statement, and names the ref nowhere else — the round-6 verifier's V1 dies on the refusal's text", () => {
  it("the rig as it stands: its before-step callback opens with exactly that statement, and the cut of the scene accepts it", () => {
    expect(RIG_STEP_LOOP_CALL).toBe("stepLoopGradeRef?.current?.();");
    expect(rigStepLoopCallRefusals(RIG_TEXT)).toEqual([]);
    expect(RIG_TEXT.split(RIG_FIRST).length - 1).toBe(1);
    expect(sceneGradeCut().stepLoopVia).toBe("layoutRef");
  });

  const cases: Array<{ id: string; text: () => string; why: string }> = [
    {
      id: "V1 (the round-6 verifier's: the call behind «hazard lights on and the brake pressed»)",
      text: () =>
        rigAltered(
          RIG_FIRST,
          "    if (!((cabinRef.current?.driveline.hazardsOn ?? false) && ((inputRef.current as unknown as { rawBrake?: number } | null)?.rawBrake ?? 0) > 0.3)) stepLoopGradeRef?.current?.();\n    const sim = simRef.current;\n",
        ),
      why: "the before-step callback's first statement is not `stepLoopGradeRef?.current?.();`, unconditional (V6-1) — `if (!(",
    },
    {
      id: "OWN V1-expression (`hazards || stepLoopGradeRef?.current?.();`)",
      text: () => rigAltered(RIG_FIRST, "    (cabinRef.current?.driveline.hazardsOn ?? false) || stepLoopGradeRef?.current?.();\n    const sim = simRef.current;\n"),
      why: "first statement is not `stepLoopGradeRef?.current?.();`, unconditional (V6-1)",
    },
    {
      id: "the round-2 verifier's M5 (the call moved below the `sim` guard)",
      text: () => rigAltered(RIG_FIRST + "    if (!sim) return;\n", "    const sim = simRef.current;\n    if (!sim) return;\n    stepLoopGradeRef?.current?.();\n"),
      why: "first statement is not `stepLoopGradeRef?.current?.();`",
    },
    {
      id: "R2 (the call removed)",
      text: () => rigAltered(RIG_FIRST, "    const sim = simRef.current;\n"),
      why: "first statement is not `stepLoopGradeRef?.current?.();`, unconditional (V6-1) — `const sim = simRef.current;`",
    },
    {
      id: "OWN — the call stays first, and the rig empties the ref later in the callback while hazards are on and the brake pressed",
      text: () => rigAltered(RIG_FIRST, RIG_FIRST + `    if (${HZ_BRAKE}) stepLoopGradeRef.current = null;\n`),
      why: "`stepLoopGradeRef` is named outside its declaration and the before-step callback's first statement (V6-1)",
    },
  ];
  for (const c of cases) {
    it(`${c.id}: refused`, () => {
      const found = rigStepLoopCallRefusals(c.text());
      expect(found.length).toBeGreaterThan(0);
      expect(found.join("; ")).toContain(c.why);
    });
  }
});

describe("§5c V6-2 — N14 f: the refs the grading reads are DERIVED from `gradeTakenSteps` (its hooks included) and the step-loop grade; the frame callback and the step loop never write, delete, read computed or alias them, nor RuntimeDriver write them — the round-6 verifier's NS1b dies on the refusal's text", () => {
  it("the derived set — a superset of the verifier's six — and the scene as it stands writes none of them", () => {
    const cut = sceneGradeCut();
    expect(cut.guardedRefs).toEqual([
      "attemptFeedRef",
      "attemptRecorderRef",
      "cabinRef",
      "contactListenerRef",
      "hazardActiveRef",
      "inputRef",
      "npcShellsRef",
      "sampleRef",
      "simRef",
      "telltaleCautionLitRef",
      "telltaleLitRef",
    ]);
    for (const r of ["npcShellsRef", "contactListenerRef", "cabinRef", "inputRef", "sampleRef", "attemptRecorderRef"]) expect(cut.guardedRefs).toContain(r);
    expect(cut.earlyExits).toEqual([]);
    // Derived, not listed: every one of them is read as `X.current` in the
    // graded function or the step-loop grade's text.
    const from = SCENE_TEXT.indexOf("  const gradeTakenSteps = (");
    const graded = SCENE_TEXT.slice(from, SCENE_TEXT.indexOf("  useFrame((_, delta) => {", from));
    expect(graded).toContain("stepLoopGradeRef.current = grade;");
    for (const r of cut.guardedRefs) expect(graded).toMatch(new RegExp(`\\b${r}\\??\\.current\\b`));
  });

  const cases: Array<{ id: string; text: () => string; why: string }> = [
    {
      id: "NS1b (the round-6 verifier's: `npcShellsRef` emptied around the frame's graded call, as an expression)",
      text: () =>
        altered(
          SHELLS_CALL,
          `    const zzShells = npcShellsRef.current;\n    void (delta > 0.02 && ${HZ_BRAKE} && (npcShellsRef.current = null));\n${SHELLS_CALL}    void (zzShells && (npcShellsRef.current = zzShells));\n`,
        ),
      why: "writes a member of `npcShellsRef`, a ref the grading reads (N14f)",
    },
    {
      id: "NS1 (the round-6 verifier's `if` spelling of the same)",
      text: () =>
        altered(
          SHELLS_CALL,
          `    const zzShells = npcShellsRef.current;\n    if (delta > 0.02 && ${HZ_BRAKE}) npcShellsRef.current = null;\n${SHELLS_CALL}    if (zzShells) npcShellsRef.current = zzShells;\n`,
        ),
      why: "writes a member of `npcShellsRef`, a ref the grading reads (N14f)",
    },
    {
      id: "OWN — `Object.defineProperty(npcShellsRef, \"current\", …)` on long frames (the verifier's P2v spelling)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02 && ${HZ_BRAKE}) Object.defineProperty(npcShellsRef, "current", { value: null, writable: true, configurable: true });\n` + STEPS_LINE),
      why: "`npcShellsRef` escapes into",
    },
    {
      id: "OWN — an alias (`const shells = npcShellsRef; shells.current = null`)",
      text: () => altered(STEPS_LINE, `    const shells = npcShellsRef;\n    if (delta > 0.02) shells.current = null;\n` + STEPS_LINE),
      why: "`npcShellsRef` escapes into",
    },
    {
      id: "OWN — a computed write (`npcShellsRef[\"current\"] = null`)",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02) npcShellsRef["current"] = null;\n` + STEPS_LINE),
      why: "a member of `npcShellsRef`, a ref the grading reads (N14f)",
    },
    {
      id: "OWN — the step loop empties the chassis' contact ear while hazards are on and the brake pressed",
      text: () => altered(GUARD_AT, GUARD_AT + `      if (${HZ_BRAKE}) contactListenerRef.current = null;\n`),
      why: "step-loop grade line",
    },
    {
      id: "OWN — the frame deletes the cabin from its ref on long frames",
      text: () => altered(STEPS_LINE, `    if (delta > 0.02) delete (cabinRef as { current?: unknown }).current;\n` + STEPS_LINE),
      why: "deletes a member of `cabinRef`, a ref the grading reads (N14f)",
    },
    {
      id: "OWN — RuntimeDriver's render empties the shells hook before installing the step loop",
      text: () => altered(LAYOUT_AT, "  npcShellsRef.current = null;\n" + LAYOUT_AT),
      why: "RuntimeDriver line",
    },
  ];
  for (const c of cases) {
    it(`${c.id}: refused`, () => {
      const text = c.text();
      expect(() => sceneGradeCutOf(text)).toThrow(c.why);
      expect(sceneGradeCutOf(text, { refuseEarlyExits: false }).earlyExits.join("; ")).toContain(c.why);
    });
  }

  it("NOT refused: a METHOD called on a ref's value (as the scene's own `inputRef.current?.read()` and `cabinRef.current?.consumeGlanceSample()`) — a write to the VALUE read off a ref stays N17's stated limit", () => {
    const text = altered(STEPS_LINE, "    void inputRef.current?.read();\n" + STEPS_LINE);
    expect(sceneGradeCutOf(text).earlyExits).toEqual([]);
  });
});

/** A real CabinControls needs a window to bind its key listeners to. */
function withWindow<T>(fn: () => T): T {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const prev = g.window;
  g.window = { addEventListener() {}, removeEventListener() {} };
  try {
    return fn();
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

interface Pedals {
  rawBrake: number;
  rawThrottle: number;
  reversePedalDisowned: boolean;
  pendingBlocked: boolean;
  consumeBlockedDriveAttempt(): boolean;
  read(): null;
}

interface Made {
  sc: Scenario;
  /** What the branches DID — collected through the scene's own callbacks. */
  ev: Record<string, unknown[]>;
  done(): void;
}

interface ScenarioSpec {
  /** The cabin at hand-over: «cold» (engine off, P, parking brake) or «ready» (D). */
  start: "cold" | "ready";
  driveLocked: boolean;
  durationSec: number;
  recorder?: boolean;
  /** Frames (by index) rendered while the scene is paused. */
  pausedFrames?: number[];
  /** What the driver does before a frame that begins at `t` s. */
  act?(
    t: number,
    cabin: CabinControls,
    pedals: Pedals,
    once: (key: string, when: boolean, fn: () => void) => void,
    glances: string[],
  ): void;
  /** Evidence every drive of this scenario must leave, on every cadence. */
  expect: Record<string, unknown[]>;
  /** N16: callbacks the cabin is built with besides the glance queue. */
  cabinCallbacks?: CabinCallbacks;
}

/**
 * One scenario, mounted the way LessonScene mounts its cabin: a REAL
 * `CabinControls` (and so a real `DrivelineState`) whose `onGlance` feeds the
 * glance queue, and the scene's driveline subscription — the event queue, and
 * `reverseAssist.noteManualShift()` on a shift the assist did not make
 * (LessonScene's `cabin.driveline.subscribe`, transcribed: two lines). The
 * branches under test are the scene's own statements, run by the cut with the
 * scene's own procedures (`sceneFrameScope`: the real ReverseAssist, both real
 * watches, the real pre-drive tracker, `observeControlSignal`,
 * `readyToMoveOff`, `writeDashboardStatus`); nothing of a branch is stubbed.
 */
function scenarioOf(spec: ScenarioSpec): Made {
  const ev: Record<string, unknown[]> = {
    preDrive: [],
    blocked: [],
    rejections: [],
    transmission: [],
    reverseStuck: [],
    stuckStart: [],
    assistShifts: [],
    recorded: [],
  };
  const glances: string[] = [];
  const events: DrivelineEvent[] = [];
  const cabin = withWindow(() => new CabinControls({ ...spec.cabinCallbacks, onGlance: (m) => void glances.push(m) }, spec.start, "off"));
  const pedals: Pedals = {
    rawBrake: 0,
    rawThrottle: 0,
    reversePedalDisowned: false,
    pendingBlocked: false,
    consumeBlockedDriveAttempt() {
      const b = this.pendingBlocked;
      this.pendingBlocked = false;
      return b;
    },
    read: () => null,
  };
  const dashboard = { current: null as unknown };
  const done = new Set<string>();
  const once = (key: string, when: boolean, fn: () => void) => {
    if (when && !done.has(key)) {
      done.add(key);
      fn();
    }
  };
  let unsubscribe = () => {};
  const sc: Scenario = {
    scope: {
      cabinRef: { current: cabin },
      inputRef: { current: pedals },
      driveLocked: spec.driveLocked,
      dashboardStatusRef: dashboard,
      drivelineEventsRef: { current: events },
      glanceQueueRef: { current: glances },
      onPreDriveStep: (id: string) => void ev.preDrive.push(id),
      onBlockedDriveAttempt: () => void ev.blocked.push("blocked"),
      onDrivelineRejection: (e: DrivelineEvent) =>
        void ev.rejections.push(e.kind === "startRejected" || e.kind === "shiftRejected" ? `${e.kind}:${e.reason}` : e.kind),
      onTransmissionChanged: (t: string, sel: string) => void ev.transmission.push(`${t}:${sel}`),
      onReversePedalStuck: (d: string) => void ev.reverseStuck.push(d),
      onStuckStart: (r: string) => void ev.stuckStart.push(r),
      attemptRecorderRef: {
        current: spec.recorder
          ? { addEvent: (kind: string, _t: number, _text?: string, detail?: string) => void ev.recorded.push(`${kind}:${detail}`) }
          : null,
      },
    },
    attach: (r) => {
      const shifting = r.scope.assistShiftingRef as { current: boolean };
      const assist = r.scope.reverseAssist as ReverseAssist;
      unsubscribe = cabin.driveline.subscribe((e) => {
        events.push(e);
        if (e.kind === "selectorChanged") {
          if (shifting.current) ev.assistShifts.push(e.selector);
          else assist.noteManualShift();
        }
      });
    },
    before: (_f, t) => spec.act?.(t, cabin, pedals, once, glances),
    pausedFrames: new Set(spec.pausedFrames ?? []),
  };
  return {
    sc,
    ev,
    done: () => {
      unsubscribe();
      withWindow(() => cabin.dispose());
      if (dashboard.current === null) throw new Error("the dashboard was never written");
    },
  };
}

const PRE_DRIVE = "pre-drive (driveLocked, a cold cabin: belt, lights, stalk, a look, a brake press and release, a refused move-off, ignition, the gate to D, the parking brake, a ready move-off)";
const ASSIST = "the reverse assist commands both shifts (two armed brake presses at a standstill, D → R → D)";
const REVERSE_STUCK = "the reverse-stuck watch fires (R, a disowned pedal, a standstill)";
const STUCK_START = "the stuck-start watch fires (engine off, throttle held), and a blocked press outside the pre-drive is surfaced";
const REJECTIONS = "driveline rejections, a tier switch that moves the lever, and the attempt recorder streaming driveline events";

const SCENARIOS: Record<string, ScenarioSpec> = {
  // The pre-drive branch — product-reachable: physicsPaused is
  // `paused || menuPaused`, so physics steps are taken and points graded
  // while the drive is locked.
  [PRE_DRIVE]: {
    start: "cold",
    driveLocked: true,
    // Every dependent action at least 0.6 s after the one it depends on, so
    // no frame (≤ 30 steps = 0.5 s) merges two of them on any cadence.
    durationSec: 4.0,
    act: (t, c, p, once, glances) => {
      once("belt", t >= 0.1, () => c.toggleSeatbelt());
      once("lights", t >= 0.2, () => c.cycleHeadlights());
      once("stalk", t >= 0.3, () => c.indicateLeft());
      once("look", t >= 0.4, () => void glances.push("left"));
      p.rawBrake = t >= 0.5 && t < 1.2 ? 1 : 0;
      once("blocked-not-ready", t >= 1.3, () => void (p.pendingBlocked = true));
      once("ignition", t >= 1.9, () => void c.driveline.toggleEngine());
      once("gate", t >= 2.5, () => {
        c.driveline.gearUp();
        c.driveline.gearUp();
        c.driveline.gearUp();
      });
      once("parking-brake", t >= 3.1, () => c.toggleParkingBrake());
      once("blocked-ready", t >= 3.7, () => void (p.pendingBlocked = true));
    },
    expect: { blocked: ["blocked"] },
  },
  [ASSIST]: {
    start: "ready",
    driveLocked: false,
    durationSec: 2.6,
    act: (t, _c, p) => {
      p.rawBrake = (t >= 0.5 && t < 1.2) || (t >= 1.7 && t < 2.4) ? 1 : 0;
    },
    expect: { assistShifts: ["N", "R", "N", "D"] },
  },
  [REVERSE_STUCK]: {
    start: "ready",
    driveLocked: false,
    durationSec: 2.2,
    act: (_t, c, p, once) => {
      once("to-R", true, () => {
        c.driveline.gearDown();
        c.driveline.gearDown();
      });
      p.reversePedalDisowned = true;
    },
    expect: { reverseStuck: ["backward"] },
  },
  [STUCK_START]: {
    start: "cold",
    driveLocked: false,
    durationSec: 2.0,
    act: (t, _c, p, once) => {
      p.rawThrottle = 0.6;
      once("blocked", t >= 0.5, () => void (p.pendingBlocked = true));
    },
    expect: { stuckStart: ["engineOff"], blocked: ["blocked"] },
  },
  [REJECTIONS]: {
    start: "ready",
    driveLocked: false,
    durationSec: 1.8,
    recorder: true,
    act: (t, c, _p, once) => {
      once("end-of-gate", t >= 0.2, () => void c.driveline.gearUp());
      once("tier", t >= 0.6, () => c.driveline.update(0, { speedKmh: 0, throttle: 0, transmission: "manual" }));
      once("clutch", t >= 1.0, () => void c.driveline.gearUp());
      once("start-rejected", t >= 1.4, () => {
        c.driveline.toggleEngine();
        c.driveline.gearUp();
        c.driveline.toggleEngine();
      });
    },
    expect: {
      rejections: ["shiftRejected:endOfGate", "shiftRejected:clutch", "startRejected:clutch"],
      transmission: ["manual:N"],
    },
  },
};

/** Frames of `n` steps for `sec` seconds (one more for the last action). */
const framesFor = (n: number, sec: number) => Array<number>(Math.ceil(sec / (n * H)) + 1).fill(n);
const MIXED = [1, 3, 7, 30, 0, 2, 1, 30, 7, 3];
const mixedFor = (sec: number) => {
  const out: number[] = [];
  while (out.reduce((a, b) => a + b, 0) * H < sec + 0.5) out.push(...MIXED);
  return out;
};
const SIZES: Array<{ name: string; frames: (sec: number) => number[] }> = [
  { name: "1 step per frame", frames: (s) => framesFor(1, s) },
  { name: "3 steps per frame", frames: (s) => framesFor(3, s) },
  { name: "7 steps per frame", frames: (s) => framesFor(7, s) },
  { name: "30 steps per frame", frames: (s) => framesFor(30, s) },
  { name: "mixed 1,3,7,30,0,2,1,30,7,3", frames: mixedFor },
];

function runScenario(cut: SceneGradeCut, spec: ScenarioSpec, frames: readonly number[]) {
  const made = scenarioOf(spec);
  const d = drive(cut, frames, made.sc);
  made.done();
  return { d, ev: made.ev };
}

describe("§6 N12 — every product-reachable branch of the frame callback runs on frames of 1, 3, 7 and 30 steps and a mixed run, with the scene's own procedures: every point graded once, in order, the frame's last at the frame end hearing the frame's look", () => {
  const cut = sceneGradeCut();
  for (const [name, spec] of Object.entries(SCENARIOS)) {
    describe(name, () => {
      const evidence: Array<Record<string, unknown[]>> = [];
      for (const size of SIZES) {
        it(size.name, () => {
          const frames = size.frames(spec.durationSec);
          const { d, ev } = runScenario(cut, spec, frames);
          expect(d.wrong).toEqual([]);
          expect(d.log).toEqual(expectedLog(frames, d.frameEnd));
          expect(d.frameGraded).toEqual(frames.map((n) => (n > 0 ? 1 : 0)));
          // THE FRAME END handed over is the session clock the callback
          // advanced — whatever branch ran before the call.
          let fed = 0;
          frames.forEach((n, f) => {
            fed += Math.min(n * H, 0.5);
            expect(d.frameEnd[f]).toBeCloseTo(fed, 9);
          });
          // The branch ran and did what it does.
          for (const [k, v] of Object.entries(spec.expect)) expect(ev[k]).toEqual(v);
          evidence.push(ev);
        });
      }
      it("the branch's effects are the same on every cadence", () => {
        expect(evidence.length).toBe(SIZES.length);
        for (const ev of evidence) expect(ev).toEqual(evidence[0]);
      });
    });
  }

  it("the pre-drive scenario performs procedure steps (the observer emitted) and the recorder scenario streamed the driveline", () => {
    const pre = runScenario(cut, SCENARIOS[PRE_DRIVE], framesFor(3, 4.0)).ev;
    expect(pre.preDrive.length).toBeGreaterThanOrEqual(4);
    const rec = runScenario(cut, SCENARIOS[REJECTIONS], framesFor(3, 1.8)).ev;
    expect(rec.recorded).toContain("driveline:transmissionChanged");
  });

  it("a paused frame between live ones, with the cabin live: nothing graded in it, its look not heard, the run otherwise exact", () => {
    const spec: ScenarioSpec = { start: "ready", driveLocked: false, durationSec: 0.5, pausedFrames: [2, 5], expect: {} };
    const frames = [3, 3, 0, 3, 7, 0, 3];
    const made = scenarioOf(spec);
    const d = drive(cut, frames, made.sc);
    made.done();
    expect(d.wrong).toEqual([]);
    expect(d.frameGraded).toEqual([1, 1, 0, 1, 1, 0, 1]);
    expect(d.log).toEqual(expectedLog(frames, d.frameEnd, new Set([2, 5])));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §6 N16 (round 6) — the product's INPUTS, executed: every control the cabin
// exposes, toggled DURING multi-step frames
// ───────────────────────────────────────────────────────────────────────────

/** Press / release a key through the cabin's OWN key handlers (the listeners
 *  its constructor binds to `window`): the product's input path, not a
 *  method call. Node has no HTMLElement; the handler's text-input check reads
 *  it, so a stand-in class is supplied for the call. */
function key(cabin: CabinControls, code: string, down: boolean): void {
  const g = globalThis as { HTMLElement?: unknown };
  const had = "HTMLElement" in g;
  if (!had) g.HTMLElement = class {};
  try {
    const h = cabin as unknown as { onKeyDown(e: unknown): void; onKeyUp(e: unknown): void };
    (down ? h.onKeyDown : h.onKeyUp)({ code, repeat: false, target: null });
  } finally {
    if (!had) delete g.HTMLElement;
  }
}

/** Every key the cabin binds — CABIN_KEYS and DRIVELINE_KEYS, all 19. */
const ALL_KEYS = [...Object.values(CABIN_KEYS), ...Object.values(DRIVELINE_KEYS)];

/**
 * THE CONTROLS TIMELINE: every key the cabin binds, through its key handler,
 * at its own time; every held key released ≥ 0.6 s later; a press that
 * depends on another ≥ 0.6 s after it — so no frame (≤ 30 steps = 0.5 s)
 * merges a press with its release on any cadence. The hazard lights are ON
 * from 0.4 s to 4.4 s (the round-5 verifier's P1/P3/P7 condition), the
 * indicators, the lamps, the wipers, the fog lights, the horn, the clutch (in
 * manual — the tier switch at 1.45 s), the night preview, the mute key, the
 * parking brake, the selector both ways, the ignition off and on, the four
 * mirrors; then the cabin's public methods (cycleIndicator, glance,
 * indicateLeft twice, forgetPendingGlances).
 */
const CONTROL_TIMELINE: Array<[number, string, "down" | "up" | "press"]> = [
  [0.1, CABIN_KEYS.indicatorLeft, "press"],
  [0.2, CABIN_KEYS.headlights, "press"],
  [0.3, CABIN_KEYS.seatbelt, "press"],
  [0.4, DRIVELINE_KEYS.hazards, "press"],
  [0.5, CABIN_KEYS.glanceLeft, "down"],
  [1.15, CABIN_KEYS.glanceLeft, "up"],
  [0.6, DRIVELINE_KEYS.wipers, "press"],
  [0.7, DRIVELINE_KEYS.fogLights, "press"],
  [0.8, DRIVELINE_KEYS.horn, "down"],
  [1.45, DRIVELINE_KEYS.horn, "up"],
  [0.9, CABIN_KEYS.nightPreview, "press"],
  [1.0, CABIN_KEYS.muteAudio, "press"],
  [1.3, CABIN_KEYS.indicatorRight, "press"],
  [2.1, DRIVELINE_KEYS.clutch, "down"],
  [2.75, DRIVELINE_KEYS.clutch, "up"],
  [1.7, CABIN_KEYS.glanceRight, "down"],
  [2.35, CABIN_KEYS.glanceRight, "up"],
  [2.9, CABIN_KEYS.glanceRear, "down"],
  [3.55, CABIN_KEYS.glanceRear, "up"],
  [3.6, CABIN_KEYS.glanceShoulder, "down"],
  [4.25, CABIN_KEYS.glanceShoulder, "up"],
  [1.8, DRIVELINE_KEYS.parkingBrake, "press"],
  [2.45, DRIVELINE_KEYS.parkingBrake, "press"],
  [3.0, DRIVELINE_KEYS.gearDown, "press"],
  [3.65, DRIVELINE_KEYS.gearUp, "press"],
  [3.7, DRIVELINE_KEYS.engine, "press"],
  [4.35, DRIVELINE_KEYS.engine, "press"],
  [4.4, DRIVELINE_KEYS.hazards, "press"],
  [4.5, DRIVELINE_KEYS.wipers, "press"],
  [4.6, DRIVELINE_KEYS.fogLights, "press"],
  [4.7, CABIN_KEYS.indicatorRight, "press"],
  [4.8, CABIN_KEYS.headlights, "press"],
  [5.45, CABIN_KEYS.headlights, "press"],
  [5.0, CABIN_KEYS.seatbelt, "press"],
  [5.1, CABIN_KEYS.nightPreview, "press"],
  [5.2, CABIN_KEYS.muteAudio, "press"],
];

/** A snapshot of every control the cabin exposes. */
function controlsOf(c: CabinControls, mutes: number): string {
  const d = c.driveline;
  return [
    `ind=${c.indicator}`,
    `lamps=${c.headlights}`,
    `belt=${c.seatbeltOn}`,
    `night=${c.nightPreview}`,
    `mute=${mutes}`,
    `tier=${d.transmission}`,
    `engine=${d.engineOn}`,
    `sel=${d.selector}`,
    `gear=${d.manualGear}`,
    `clutch=${d.clutchDown}`,
    `pbrake=${d.parkingBrakeOn}`,
    `hazards=${d.hazardsOn}`,
    `wipers=${d.wipersOn}`,
    `fog=${d.fogLightsOn}`,
    `horn=${d.hornOn}`,
  ].join(" ");
}

interface ControlsRun {
  made: Made;
  /** Every distinct controls snapshot, in order (the evidence). */
  trace: string[];
  /** The looks the cabin handed out (the rig's frame look + the scene's
   *  `moreLooks`), in order. */
  consumed: string[];
  pressed: Set<string>;
}

/** The controls scenario on a cold, locked cabin (the pre-drive) or a ready,
 *  live one. Pedals stay off: what is exercised is the cabin's controls. */
function controlsScenario(start: "cold" | "ready", driveLocked: boolean): ControlsRun {
  let mutes = 0;
  const trace: string[] = [];
  const consumed: string[] = [];
  const pressed = new Set<string>();
  let cab: CabinControls | null = null;
  /** A snapshot after every ACTION (never per frame: a frame may hold several). */
  const snap = (c: CabinControls, what: string) => {
    const now = `${what}: ${controlsOf(c, mutes)}`;
    trace.push(now);
  };
  const spec: ScenarioSpec = {
    start,
    driveLocked,
    durationSec: 6.6,
    expect: {},
    cabinCallbacks: { onToggleMute: () => void mutes++ },
    act: (t, c, _p, once) => {
      if (cab === null) {
        cab = c;
        // Every look the cabin hands out is recorded — by the rig's frame
        // look (VehicleRig's sample builder) and by the scene's `moreLooks`.
        const take = c.consumeGlanceSample.bind(c);
        c.consumeGlanceSample = () => {
          const m = take();
          if (m !== null) consumed.push(m);
          return m;
        };
      }
      // One list, in TIME order (stable): a long frame performs the actions
      // it spans in the order a short one would.
      const actions: Array<{ at: number; name: string; fn: () => void }> = [
        ...CONTROL_TIMELINE.map(([at, code, how], i) => ({
          at,
          name: `${how} ${code} #${i}`,
          fn: () => {
            pressed.add(code);
            if (how === "down" || how === "press") key(c, code, true);
            if (how === "up" || how === "press") key(c, code, false);
          },
        })),
        { at: 1.45, name: "tier-manual", fn: () => c.driveline.update(0, { speedKmh: 0, throttle: 0, transmission: "manual" }) },
        { at: 5.5, name: "cycleIndicator", fn: () => c.cycleIndicator() },
        { at: 5.6, name: "glance", fn: () => c.glance("rear") },
        { at: 5.7, name: "indicateLeft", fn: () => c.indicateLeft() },
        { at: 6.35, name: "indicateLeft-off", fn: () => c.indicateLeft() },
        { at: 6.4, name: "forget", fn: () => c.forgetPendingGlances() },
      ];
      actions
        .map((a, i) => ({ ...a, i }))
        .sort((x, y) => x.at - y.at || x.i - y.i)
        .forEach((a) =>
          once(a.name, t >= a.at, () => {
            a.fn();
            snap(c, a.name);
          }),
        );
    },
  };
  const made = scenarioOf(spec);
  // VehicleRig's frame, in its order: the cabin's clocks stepped on the
  // render delta (blink, hold refresh, stalk auto-cancel) AFTER rapier's
  // steps, then the frame's one look taken out of the cabin
  // (scene/vehicleSample.ts `updateVehicleSample`).
  made.sc.afterSteps = (_f, delta) => cab?.update(delta, 0);
  made.sc.frameLook = () => (cab === null ? null : cab.consumeGlanceSample());
  return { made, trace, consumed, pressed };
}

function runControls(cut: SceneGradeCut, start: "cold" | "ready", driveLocked: boolean, frames: readonly number[]) {
  const run = controlsScenario(start, driveLocked);
  const d = drive(cut, frames, run.made.sc);
  run.made.done();
  return { d, ...run };
}

/** What a controls drive must leave: every point once and in order; the
 *  frame's call reaching its point on every stepping frame; every frame end
 *  the session clock; every look the cabin handed out HEARD, once, in order. */
function expectControlsDrive(r: ReturnType<typeof runControls>, frames: readonly number[]): void {
  const { d } = r;
  expect(d.wrong).toEqual([]);
  expect(d.frameGraded).toEqual(frames.map((n) => (n > 0 ? 1 : 0)));
  const points = d.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
  expect(points).toEqual(Array.from({ length: d.steps }, (_, i) => i + 1));
  // Each point graded by the step loop, but the frame's last by the frame.
  let k = 0;
  const by: string[] = [];
  for (const n of frames) for (let i = 0; i < n; i++) by.push(`point ${++k} ${i === n - 1 ? "frame" : "loop"}`);
  expect(d.log.filter((l) => l.startsWith("point "))).toEqual(by);
  let fed = 0;
  frames.forEach((n, f) => {
    fed += Math.min(n * H, 0.5);
    expect(d.frameEnd[f]).toBeCloseTo(fed, 9);
  });
  const heard = d.log.filter((l) => l.startsWith("look ")).map((l) => l.split(" ")[2]);
  expect(heard.length).toBeGreaterThan(0);
  expect(r.consumed.slice(0, heard.length)).toEqual(heard);
  // A look not yet heard waits for the next point (at most the last frame's).
  expect(r.consumed.length - heard.length).toBeLessThanOrEqual(1);
}

describe("§6 N16 (round 6) — the product's INPUTS, executed: every key the cabin binds (19) through its own key handler, and its public controls, toggled DURING frames of 1, 3, 7 and 30 steps and a mixed run — every point graded once and in order, every look the cabin hands out heard", () => {
  const cut = sceneGradeCut();
  for (const [start, locked] of [
    ["ready", false],
    ["cold", true],
  ] as const) {
    describe(`${start} cabin, ${locked ? "the drive LOCKED (the pre-drive)" : "the drive live"}`, () => {
      const traces: string[][] = [];
      const looks: string[][] = [];
      for (const size of SIZES) {
        it(size.name, () => {
          const frames = size.frames(6.6);
          const r = runControls(cut, start, locked, frames);
          expectControlsDrive(r, frames);
          expect([...r.pressed].sort()).toEqual([...ALL_KEYS].sort());
          traces.push(r.trace);
          looks.push(r.consumed);
        });
      }
      it("the controls moved — every one of them — and identically on every cadence", () => {
        expect(traces.length).toBe(SIZES.length);
        for (const t of traces) expect(t).toEqual(traces[0]);
        // WHICH looks the cabin hands out is the same on every cadence; HOW
        // MANY a held mirror yields is not — a hold is refreshed by
        // `cabin.update` on the render delta (ADR-014: «the moment a look is
        // sampled» stays frame-timed). Every one handed out is heard (above).
        for (const l of looks) expect(new Set(l)).toEqual(new Set(looks[0]));
        if (process.env.N16_LOOKS_OUT) appendFileSync(process.env.N16_LOOKS_OUT, `${start}/${locked}: ${looks.map((l) => l.join(",")).join(" | ")}
`);
        const seen = (field: string, value: string) => traces[0].some((s) => s.split(": ")[1].split(" ").includes(`${field}=${value}`));
        for (const [f, v] of [
          ["ind", "left"],
          ["ind", "right"],
          ["lamps", "low"],
          ["belt", String(start === "cold")],
          ["night", "true"],
          ["mute", "2"],
          ["tier", "manual"],
          ["clutch", "true"],
          ["pbrake", "true"],
          ["pbrake", "false"],
          ["hazards", "true"],
          ["hazards", "false"],
          ["wipers", "true"],
          ["fog", "true"],
          ["horn", "true"],
          ["horn", "false"],
          ["engine", "false"],
          // A ready car's ignition goes off and on again; a cold one in the
          // manual tier with the clutch up is REFUSED a start (a driveline
          // rejection — the branch the scene reports) and stays off.
          ...(start === "ready" ? [["engine", "true"]] : []),
        ]) {
          expect(seen(f, v), `${f}=${v}`).toBe(true);
        }
        expect(new Set(looks[0])).toEqual(new Set(["left", "right", "rear", "shoulder"]));
      });
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §6d N14 — the round-5 verifier's P1, P3, P7, executed with the refusal off
// on the controls drive (the hazard lights on): each is caught by the drive,
// on multi-step frames; inert at one step per frame
// ───────────────────────────────────────────────────────────────────────────

const HZ = "(cabinRef.current?.driveline.hazardsOn ?? false)";
/** The round-5 verifier's P1–P4 and P7 (scratch npcstep-verify/r5mut/
 *  extra.json), verbatim. */
const P_MUTANTS: Record<string, { from: string; to: string }> = {
  P1: { from: PAUSE_AT, to: `    paused = paused || (delta > 0.02 && ${HZ});\n` + PAUSE_AT },
  P2: {
    from: STEPS_LINE,
    to: `    const steps = (delta > 0.02 && ${HZ} ? null : stepTrackRef.current) ?? NO_PHYSICS_STEPS;\n`,
  },
  P3: {
    from: "      const taken = stepTrackRef.current;\n      if (paused || taken === null",
    to: `      const taken = ${HZ} ? null : stepTrackRef.current;\n      if (paused || taken === null`,
  },
  P4: {
    from: "    const cabin = cabinRef.current;\n    const input = inputRef.current;\n    const drivelineEvents",
    to: `    const cabin = cabinRef.current;\n    void (delta > 0.02 && ${HZ} && (null as unknown as { x: number }).x);\n    const input = inputRef.current;\n    const drivelineEvents`,
  },
  P7: { from: STEPS_LINE, to: `    void (delta > 0.02 && ${HZ} && (gradeGrid.stepPhysics = () => 0));\n` + STEPS_LINE },
};

describe("§6d N14 — the round-5 verifier's P1, P3 and P7 BY EXECUTION (cut with the refusal off) on the controls drive: on multi-step frames with the hazard lights on each loses or stales a point; at one step per frame P1 and P3 are inert", () => {
  const frames3 = framesFor(3, 6.6);
  it("P1 (the pause guard's input reassigned): from the first long frame with hazards on the frame never reaches its graded call — and the step loop, closing over the same binding, stops too", () => {
    const cut = sceneGradeCutOf(altered(P_MUTANTS.P1.from, P_MUTANTS.P1.to), { refuseEarlyExits: false });
    expect(cut.earlyExits.some((e) => e.includes("writes `paused`"))).toBe(true);
    const { d } = runControls(cut, "ready", false, frames3);
    expect(d.wrong.some((w) => w.includes("reached its graded call 0 times"))).toBe(true);
    expect(d.wrong.some((w) => / ended with point \d+ ungraded/.test(w))).toBe(true);
    expect(runControls(cut, "ready", false, framesFor(1, 6.6)).d.wrong).toEqual([]);
  });
  it("P3 (the step loop's `taken` nulled while hazards are on): a step is taken with its predecessor ungraded and the shells stale — this row's own defect", () => {
    const cut = sceneGradeCutOf(altered(P_MUTANTS.P3.from, P_MUTANTS.P3.to), { refuseEarlyExits: false });
    expect(cut.earlyExits.some((e) => e.includes("(N14c)"))).toBe(true);
    const { d } = runControls(cut, "ready", false, frames3);
    expect(d.wrong.some((w) => /taken with point \d+ ungraded/.test(w))).toBe(true);
    expect(d.wrong.some((w) => /taken with the shells posed from point/.test(w))).toBe(true);
    expect(runControls(cut, "ready", false, framesFor(1, 6.6)).d.wrong).toEqual([]);
  });
  it("P7 (the grid's grading method replaced): the grid refuses the assignment (N14 d) — the frame throws a TypeError and its point is left to the next frame's step loop; the method is still the grid's", () => {
    const cut = sceneGradeCutOf(altered(P_MUTANTS.P7.from, P_MUTANTS.P7.to), { refuseEarlyExits: false });
    expect(cut.earlyExits.some((e) => e.includes("writes a member of `gradeGrid`"))).toBe(true);
    const { d } = runControls(cut, "ready", false, frames3);
    expect(d.wrong.some((w) => /the frame threw: .*(read only|read-only|not extensible|Cannot assign)/i.test(w))).toBe(true);
    // Every point is still graded once and in order — the grid's own method
    // kept grading.
    const points = d.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
    expect(points).toEqual(Array.from({ length: d.steps }, (_, i) => i + 1));
  });
});

describe("§6b the same branches catch the round-4 verifier's F1–F6 BY EXECUTION (cut with the refusal off): on frames longer than 20 ms the frame's last point is left to the next frame's step loop — and at one step per frame each is invisible", () => {
  const WHERE: Record<string, string> = { F1: PRE_DRIVE, F2: ASSIST, F3: REVERSE_STUCK, F4: STUCK_START, F5: REJECTIONS, F6: STUCK_START };
  for (const [id, m] of Object.entries(F_MUTANTS)) {
    it(id, () => {
      const cut = sceneGradeCutOf(altered(m.from, m.to), { refuseEarlyExits: false });
      expect(cut.earlyExits).toHaveLength(1);
      const spec = SCENARIOS[WHERE[id]];
      const frames = framesFor(3, spec.durationSec);
      const { d } = runScenario(cut, spec, frames);
      expect(d.wrong.some((w) => w.includes("reached its graded call 0 times"))).toBe(true);
      expect(d.wrong.some((w) => / ended with point \d+ ungraded/.test(w))).toBe(true);
      // Every point is still graded once and in order — by the next frame's
      // step loop, with no frame end and no look: the defect is WHEN.
      const points = d.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
      expect(points).toEqual(Array.from({ length: points.length }, (_, i) => i + 1));
      expect(d.log).not.toEqual(expectedLog(frames, d.frameEnd));
      // At 60 Hz (a 16.7 ms frame) the same text is inert.
      expect(runScenario(cut, spec, framesFor(1, spec.durationSec)).d.wrong).toEqual([]);
    });
  }
});

describe("§6c BRANCH CENSUS — every branch of the frame callback before its graded call is entered by an executed drive, on 3-step AND on 30-step frames", () => {
  it("no branch of the region is left unexecuted", () => {
    const cut = sceneGradeCutOf(SCENE_TEXT, { probeBranches: true });
    expect(cut.earlyExits).toEqual([]);
    expect(cut.branchProbes.length).toBeGreaterThanOrEqual(30);
    const missing: string[] = [];
    for (const n of [3, 30]) {
      const hits = new Map<number, number>();
      const add = (b: SceneGradeBound) => {
        for (const [id, c] of Object.entries(b.branchHits())) hits.set(Number(id), (hits.get(Number(id)) ?? 0) + c);
      };
      const runs: Array<{ spec: ScenarioSpec; frames: number[] }> = Object.values(SCENARIOS).map((spec) => ({
        spec,
        frames: framesFor(n, spec.durationSec),
      }));
      // …and a paused frame, for the pause guard's own branch.
      runs.push({ spec: { start: "ready", driveLocked: false, durationSec: 0, pausedFrames: [1], expect: {} }, frames: [n, 0, n] });
      for (const { spec, frames } of runs) {
        const made = scenarioOf(spec);
        const d = drive(cut, frames, made.sc);
        made.done();
        expect(d.wrong).toEqual([]);
        add(d.scene);
        add(d.pausedScene);
      }
      for (const p of cut.branchProbes) if (!hits.get(p.id)) missing.push(`${n}-step frames: line ${p.line} ${p.what}`);
    }
    expect(missing).toEqual([]);
  });

  it("the probes see the branches they claim: the census run with the pre-drive scenario removed misses the pre-drive branches", () => {
    const cut = sceneGradeCutOf(SCENE_TEXT, { probeBranches: true });
    const made = scenarioOf(SCENARIOS[ASSIST]);
    const d = drive(cut, framesFor(3, 2.6), made.sc);
    made.done();
    const hits = d.scene.branchHits();
    const preDrive = cut.branchProbes.filter((p) => p.what.startsWith("if (driveLocked && cabin) → then"));
    expect(preDrive).toHaveLength(1);
    expect(hits[preDrive[0].id]).toBeUndefined();
    const assist = cut.branchProbes.filter((p) => p.what.startsWith("if (cmd) → then"));
    expect(assist).toHaveLength(1);
    expect(hits[assist[0].id]).toBe(2);
  });
});

describe("§7 THE STATED LIMIT (N11; worded by N15, round 6): ANY exception raised while the frame callback runs before its graded call — inline in its own expressions or inside a procedure it calls — is not refused; it abandons the rest of that frame, and the next frame's step loop grades the lost point once and in order, with no frame end and no look — executed, and the R3F loop it rests on", () => {
  it("the cut accepts the scene; a procedure that throws abandons that frame (no graded call, nothing drawn, its look lost), and the next frame's step loop grades the abandoned point — once, in order, with no frame end", () => {
    let calls = 0;
    const made = scenarioOf({ start: "ready", driveLocked: false, durationSec: 0.3, expect: {} });
    made.sc.scope = {
      ...made.sc.scope,
      writeDashboardStatus: (scratch: unknown) => {
        if (++calls === 2) throw new Error("a procedure failed");
        return scratch;
      },
    };
    const cut = sceneGradeCut();
    expect(cut.earlyExits).toEqual([]);
    const d = drive(cut, [3, 3, 3], made.sc);
    expect(d.wrong).toContain("the frame threw: a procedure failed");
    expect(d.wrong).toContain("frame 1 ended with point 6 ungraded (grid at 5)");
    expect(d.log).toContain("point 6 loop");
    expect(d.log).not.toContain("look 6 right");
    expect(d.log.filter((l) => l.startsWith("drawn "))).toHaveLength(2);
    const points = d.log.filter((l) => l.startsWith("point ")).map((l) => Number(l.split(" ")[1]));
    expect(points).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("INLINE — the round-5 verifier's P4 (`void (… && (null as unknown as { x: number }).x)`: no `throw`, no call) on the controls drive with the hazard lights on: the cut accepts it; each long frame with hazards on throws a TypeError, its point is graded by the NEXT frame's step loop — once, in order, with no frame end and no look; at one step per frame it is inert", () => {
    const cut = sceneGradeCutOf(altered(P_MUTANTS.P4.from, P_MUTANTS.P4.to));
    expect(cut.earlyExits).toEqual([]);
    const frames = framesFor(3, 6.6);
    const { d } = runControls(cut, "ready", false, frames);
    const threw = d.wrong.filter((w) => w.startsWith("the frame threw: Cannot read properties of null"));
    expect(threw.length).toBeGreaterThan(10);
    // Only the throws, their frames' missing calls and their lost frame ends —
    // never a point out of order, twice, or a step met with its predecessor
    // ungraded.
    const other = d.wrong.filter(
      (w) => !w.startsWith("the frame threw: ") && !/^frame \d+ (ended with point \d+ ungraded|reached its graded call -1 times)/.test(w),
    );
    expect(other).toEqual([]);
    const points = d.log.filter((l) => l.startsWith("point "));
    expect(points.map((l) => Number(l.split(" ")[1]))).toEqual(Array.from({ length: d.steps }, (_, i) => i + 1));
    // A lost frame end: that frame's last point is graded by the next
    // frame's step loop.
    const first = d.wrong.find((w) => / ended with point \d+ ungraded/.test(w)) ?? "";
    const lostAt = Number(/ended with point (\d+) ungraded/.exec(first)?.[1]);
    expect(points).toContain(`point ${lostAt} loop`);
    expect(d.frameGraded.filter((g) => g === 0).length).toBe(threw.length);
    expect(runControls(cut, "ready", false, framesFor(1, 6.6)).d.wrong).toEqual([]);
  });

  it("@react-three/fiber's loop (every dist build): the next frame is requested FIRST, and every useFrame subscriber is called with no try/catch — a throw abandons the rest of that frame and leaves the rAF callback uncaught; the product registers no window `error` listener", () => {
    const dist = path.resolve(HERE, "../../../../../../node_modules/@react-three/fiber/dist");
    const builds = readdirSync(dist).filter((f) => /^events-.*\.js$/.test(f));
    expect(builds.length).toBeGreaterThanOrEqual(2);
    for (const f of builds) {
      const src = readFileSync(path.join(dist, f), "utf-8");
      const loop = src.slice(src.indexOf("function loop(timestamp) {"));
      expect(loop.indexOf("requestAnimationFrame(loop)")).toBeGreaterThan(0);
      expect(loop.indexOf("requestAnimationFrame(loop)")).toBeLessThan(loop.indexOf("update(timestamp, state)"));
      const update = src.slice(src.indexOf("function update(timestamp, state, frame) {"), src.indexOf("function loop(timestamp) {"));
      expect(update).toContain("subscription.ref.current(subscription.store.getState(), delta, frame);");
      expect(update).not.toMatch(/\btry\b|\bcatch\b/);
      expect(loop.slice(0, loop.indexOf("// Run after-effects"))).not.toMatch(/\btry\b|\bcatch\b/);
    }
    const pkg = JSON.parse(readFileSync(path.join(dist, "..", "package.json"), "utf-8")) as { version: string };
    expect(pkg.version).toBe("9.6.1");
    expect(EXCEPTION_LIMIT).toContain("R3F 9.6.1");
    expect(EXCEPTION_LIMIT).toContain("inline in its own expressions or inside a procedure it calls");
    expect(EXCEPTION_LIMIT).toContain("the next frame's step loop grades the lost point once and in order, with no frame end and no look");
    // No `error` / `unhandledrejection` listener anywhere in the product.
    const listeners: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__" && e.name !== "node_modules") walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const t = readFileSync(p, "utf-8");
          if (/addEventListener\(\s*["'](error|unhandledrejection)["']|window\.onerror/.test(t)) listeners.push(p);
        }
      }
    };
    walk(path.resolve(HERE, "../../../../.."));
    expect(listeners).toEqual([]);
  });
});
