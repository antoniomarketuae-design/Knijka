/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, round 2) — THE STEP LOOP'S GRADE
 * FOLLOWS THE RENDER, AND RUNS BEFORE THE STEP'S INPUT IS READ.
 *
 * A frame that owes several physics steps grades point k before rapier takes
 * step k + 1 (so the road users' shells are posed from the world point k
 * left). Round 1 handed the function that does it to @react-three/rapier's
 * `useBeforePhysicsStep`. Two things were wrong with that, both found by the
 * round-1 verifier and neither visible to a source pin:
 *
 *   · @react-three/rapier keeps a before-step callback in a ref it re-points
 *     in a PASSIVE effect; R3F re-points a frame callback in a LAYOUT effect.
 *     A frame drawn between a commit and its passive flush would have graded
 *     its earlier points with the previous render's `paused` and props, and
 *     its last point with the new render's;
 *   · the function ran AFTER VehicleRig's own before-step callback had read
 *     the input of the coming step (two callbacks in one set, in the order
 *     their passive effects registered them).
 *
 * NOW: RuntimeDriver puts the function in `stepLoopGradeRef` from a layout
 * effect with no dependency list, and VehicleRig's before-step callback calls
 * that ref FIRST. This file EXECUTES both halves, cut out of the two source
 * files as syntax trees:
 *
 *   §1  RuntimeDriver's effect, run as a component under the reconciler the
 *       scene renders under (@react-three/fiber's bundled react-reconciler):
 *       re-rendered paused, and with another graded call, the function a
 *       physics step finds in the ref is the COMMITTED render's — already in
 *       the commit's layout phase, before any passive effect has run; emptied
 *       on unmount.
 *   §2  the function itself, against a REAL cabin and the real
 *       `updateCabinChannels`: the cabin's channels are refreshed BEFORE the
 *       graded call (the round-1 verifier's mutant V5 — a step loop that
 *       graded with the previous frame's stalk and belt — fails here by what
 *       the grade read, not by a statement list); and against a REAL
 *       `GradeGrid`: nothing while paused or with nothing owed, and after a
 *       pause every step still owed is graded, in order, before the next.
 *   §3  VehicleRig's before-step callback: the scene's turn is taken before
 *       the input is read — and when the rig has no sim.
 *
 * NOT CLAIMED: neither component is mounted whole (each needs a rapier world
 * and a canvas). That @react-three/rapier does not step a paused world is
 * read from its source (the last test), not driven.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, useEffect, useLayoutEffect, type FunctionComponent } from "react";
import { reconciler } from "@react-three/fiber";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import { CabinControls } from "@/modules/sim/scene/cabin";
import { GradeGrid, type GradeGridHooks, type GradeGridWorld } from "@/modules/sim/scene/gradeGrid";
import { createVehicleSample, updateCabinChannels } from "@/modules/sim/scene/vehicleSample";
import type { PhysicsStepSource } from "@/modules/sim/traffic";
import { FIXED_DT } from "@/modules/sim/vehicle/tuning";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(path.join(HERE, "..", f), "utf-8").replace(/\r\n/g, "\n");

const transpile = (text: string) =>
  ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;

function calls(file: string, pick: (callee: string, n: ts.CallExpression, sf: ts.SourceFile) => boolean): { sf: ts.SourceFile; found: ts.CallExpression[] } {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.CallExpression[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && pick(n.expression.getText(sf), n, sf)) found.push(n);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return { sf, found };
}

// ───────────────────────────────────────────────────────────────────────────
// The cut: RuntimeDriver's effect that fills `stepLoopGradeRef`
// ───────────────────────────────────────────────────────────────────────────

interface StepLoopScope {
  stepLoopGradeRef: { current: (() => void) | null };
  paused: boolean;
  stepTrackRef: { current: PhysicsStepSource | null };
  gradeGrid: { clock: { last: number } };
  simRef: { current: unknown };
  cabinRef: { current: unknown };
  sampleRef: { current: VehicleSample };
  inputRef: { current: { read(): unknown } | null };
  gradeTakenSteps: (steps: PhysicsStepSource, frameEndSec: number | null, frameGlance: unknown) => number;
}

/**
 * The scene's own effect call — whichever effect hook it is registered under
 * (so a scene that moved it to a passive effect is RUN and fails on what the
 * step loop then finds, instead of failing to be read) — as a component that
 * renders nothing. The names it reads are its props, React's two effect hooks
 * and the sample builder's `updateCabinChannels`.
 */
function stepLoopComponent(refresh: typeof updateCabinChannels = updateCabinChannels) {
  const { sf, found } = calls(
    "LessonScene.tsx",
    (callee, n, f) => (callee === "useLayoutEffect" || callee === "useEffect") && (n.arguments[0]?.getText(f).includes("stepLoopGradeRef.current =") ?? false),
  );
  if (found.length !== 1) throw new Error(`expected one effect filling stepLoopGradeRef in LessonScene, found ${found.length}`);
  const text = found[0].getText(sf);
  const js = transpile(
    `return function StepLoop({ stepLoopGradeRef, paused, stepTrackRef, gradeGrid, simRef, cabinRef, sampleRef, inputRef, gradeTakenSteps }) {\n${text};\nreturn null;\n};`,
  );
  const make = new Function("useLayoutEffect", "useEffect", "updateCabinChannels", `"use strict";\n${js}`) as (
    ...scope: unknown[]
  ) => FunctionComponent<StepLoopScope>;
  return { text, hook: found[0].expression.getText(sf), args: found[0].arguments.length, StepLoop: make(useLayoutEffect, useEffect, refresh) };
}

/** A root of the reconciler the scene renders under. `render` is one commit,
 *  layout effects included; passive effects are flushed by `flush`. */
function r3fRoot() {
  const r = reconciler as unknown as {
    createContainer(...args: unknown[]): unknown;
    updateContainerSync(element: unknown, container: unknown, parent: null, callback: null): void;
    flushSyncWork(): void;
    flushPassiveEffects(): boolean;
  };
  const errors: unknown[] = [];
  const onError = (e: unknown) => errors.push(e);
  const container = r.createContainer({}, 1, null, false, null, "", onError, onError, onError, null);
  return {
    errors,
    render(element: unknown) {
      r.updateContainerSync(element, container, null, null);
      r.flushSyncWork();
    },
    flush: () => void r.flushPassiveEffects(),
  };
}

const stepsAt = (n: { count: number }): PhysicsStepSource => ({
  get stepCount() {
    return n.count;
  },
  stateAtStep: (k, out) => {
    out.x = k;
    out.y = 0;
    out.speedKmh = k;
    out.headingDeg = 0;
    return k >= 1 && k <= n.count;
  },
});

function scope(over: Partial<StepLoopScope> = {}): StepLoopScope & { graded: string[]; taken: { count: number } } {
  const graded: string[] = [];
  const taken = { count: 0 };
  return {
    graded,
    taken,
    stepLoopGradeRef: { current: null },
    paused: false,
    stepTrackRef: { current: stepsAt(taken) },
    gradeGrid: { clock: { last: 0 } },
    simRef: { current: null },
    cabinRef: { current: null },
    sampleRef: { current: createVehicleSample() },
    inputRef: { current: null },
    gradeTakenSteps: (steps, frameEndSec, frameGlance) => {
      graded.push(`A ${steps.stepCount} ${frameEndSec} ${frameGlance}`);
      return 0;
    },
    ...over,
  };
}

describe("§1 the step loop's grade follows the render — RuntimeDriver's own effect, executed under R3F's reconciler", () => {
  const { text, hook, args, StepLoop } = stepLoopComponent();

  it("the cut is the scene's whole effect call; mounted, a physics step finds a function in the ref; unmounted, nothing", () => {
    expect(text.startsWith(`${hook}(`)).toBe(true);
    const root = r3fRoot();
    const s = scope();
    root.render(createElement(StepLoop, s));
    expect(root.errors).toEqual([]);
    expect(typeof s.stepLoopGradeRef.current, "the effect left no function in stepLoopGradeRef").toBe("function");
    // Nothing owed: the frame's own call graded the last step.
    s.stepLoopGradeRef.current!();
    expect(s.graded).toEqual([]);
    // A step taken and not graded: graded now, with no frame end and no look.
    s.taken.count = 1;
    s.stepLoopGradeRef.current!();
    expect(s.graded).toEqual(["A 1 null null"]);
    root.render(null);
    expect(s.stepLoopGradeRef.current, "the ref is emptied on unmount").toBeNull();
  });

  it("THE RENDER IS THE COMMITTED ONE — in the commit's own layout phase: a sibling's layout effect, which runs before any passive effect, already finds the new render's `paused` and the new render's graded call", () => {
    // What a frame drawn right after the commit would run: R3F installs the
    // frame callback in a layout effect, so the step loop of that frame must
    // find THIS render in the ref by then. The probe reads the ref from a
    // layout effect of a component rendered AFTER the driver's.
    const seenInLayout: string[] = [];
    const seenInPassive: string[] = [];
    const s = scope();
    s.taken.count = 1;
    const Probe: FunctionComponent<{ tag: string }> = ({ tag }) => {
      useLayoutEffect(() => {
        const before = s.graded.length;
        s.stepLoopGradeRef.current?.();
        seenInLayout.push(`${tag}: ${s.graded.slice(before).join("|") || "nothing"}`);
      });
      useEffect(() => {
        seenInPassive.push(tag);
      });
      return null;
    };
    const root = r3fRoot();
    const tree = (p: StepLoopScope, tag: string) => [createElement(StepLoop, { ...p, key: "driver" }), createElement(Probe, { tag, key: "probe" })];
    root.render(tree(s, "first"));
    // Re-render PAUSED: the step loop grades nothing, though a step is owed.
    root.render(tree({ ...s, paused: true }, "paused"));
    // Re-render with ANOTHER graded call (LessonScene re-renders RuntimeDriver
    // with new props — a new `runtime`, `onTick`, `conditions` — and
    // `gradeTakenSteps` is a new closure on every render).
    const second: StepLoopScope["gradeTakenSteps"] = (steps, frameEndSec, frameGlance) => {
      s.graded.push(`B ${steps.stepCount} ${frameEndSec} ${frameGlance}`);
      return 0;
    };
    root.render(tree({ ...s, gradeTakenSteps: second }, "second"));
    root.flush();
    expect(root.errors).toEqual([]);
    expect(
      seenInLayout,
      "the step loop ran a render that is not the committed one — a frame drawn after this commit grades its earlier points with stale props",
    ).toEqual(["first: A 1 null null", "paused: nothing", "second: B 1 null null"]);
    expect(seenInPassive.length).toBeGreaterThan(0);
  });

  it("the effect has NO dependency list and is a layout effect: React re-points the ref on every commit (pinned beside the execution above, which is what fails when either is not so)", () => {
    expect(hook).toBe("useLayoutEffect");
    expect(args).toBe(1);
  });

  it("an older mount's cleanup never empties a ref a newer mount has filled (the scene remounts the driver under a new key)", () => {
    const root = r3fRoot();
    const s = scope();
    root.render(createElement(StepLoop, { ...s, key: "a" }));
    const first = s.stepLoopGradeRef.current;
    root.render(createElement(StepLoop, { ...s, key: "b" }));
    expect(typeof s.stepLoopGradeRef.current).toBe("function");
    expect(s.stepLoopGradeRef.current).not.toBe(first);
    expect(root.errors).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 the function itself
// ───────────────────────────────────────────────────────────────────────────

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

describe("§2 what the step loop's grade does — executed against a real cabin and a real grid", () => {
  const { StepLoop } = stepLoopComponent();

  it("THE CABIN IS REFRESHED BEFORE THE POINT IS GRADED: a stalk moved and a pedal pressed since the frame's sample was built are what the graded call reads (the verifier's mutant V5 read the previous frame's)", () => {
    withWindow(() => {
      const cabin = new CabinControls({}, "ready", "off");
      const sample = createVehicleSample();
      // The frame's sample as VehicleRig built it LAST frame: stalk off, no pedal.
      updateCabinChannels(sample, { speedKmh: 0, gear: "1" } as never, cabin, { throttle: 0, brake: 0, steer: 0, handbrake: false });
      sample.position.x = 11;
      sample.speedKmh = 44;
      sample.mirrorGlance = "rear";
      expect([sample.indicator, sample.throttlePedal, sample.seatbeltOn]).toEqual(["off", 0, cabin.seatbeltOn]);
      const beltWas = cabin.seatbeltOn;
      // Since then (a key pressed before this frame; the dev rig's key edge at
      // the previous grid point): the left stalk, the belt, the accelerator.
      cabin.indicateLeft();
      cabin.toggleSeatbelt();
      const reads: string[] = [];
      const seen: Array<Record<string, unknown>> = [];
      const s = scope({
        simRef: { current: { speedKmh: 99, gear: "1" } },
        cabinRef: { current: cabin },
        sampleRef: { current: sample },
        inputRef: {
          current: {
            read: () => {
              reads.push("read");
              return { throttle: 0.6, brake: 0, steer: 0, handbrake: false };
            },
          },
        },
        gradeTakenSteps: () => {
          reads.push("grade");
          // What the graded call's `student` hook copies off the frame's sample.
          seen.push({ indicator: sample.indicator, seatbeltOn: sample.seatbeltOn, throttlePedal: sample.throttlePedal });
          return 1;
        },
      });
      s.taken.count = 1;
      const root = r3fRoot();
      root.render(createElement(StepLoop, s));
      s.stepLoopGradeRef.current!();
      expect(reads, "the input is read and the cabin refreshed BEFORE the graded call").toEqual(["read", "grade"]);
      expect(seen, "the point was graded with the previous frame's cabin").toEqual([{ indicator: "left", seatbeltOn: !beltWas, throttlePedal: 0.6 }]);
      // Never the pose, the speed or the look: the grid writes the car from the
      // step record, and takes the cabin's looks itself.
      expect([sample.position.x, sample.speedKmh, sample.mirrorGlance]).toEqual([11, 44, "rear"]);
      root.render(null);
      cabin.dispose();
    });
  });

  it("with no sim or no cabin mounted the point is graded all the same, and no input is read for it", () => {
    const reads: string[] = [];
    const s = scope({ inputRef: { current: { read: () => void reads.push("read") } } });
    s.taken.count = 2;
    const root = r3fRoot();
    root.render(createElement(StepLoop, s));
    s.stepLoopGradeRef.current!();
    expect(s.graded).toEqual(["A 2 null null"]);
    expect(reads).toEqual([]);
  });

  // A grid, a world that records, and RuntimeDriver's graded call reduced to
  // the grid's live entry — the pause is the scene's, the grading the grid's.
  function gridWorld() {
    const log: string[] = [];
    const world = {
      runtime: { update: () => {}, sample: (v: VehicleSample, t: number) => ({ t, position: { ...v.position }, events: [] }), signalPhase: () => "green" },
      traffic: { update: () => {}, leadGapMeters: () => Infinity, setRenderSessionTime: (t: number) => void log.push(`drawn@${t.toFixed(3)}`), vehicles: [], pedestrians: [], vehicleCollisionKind: () => "vehicle", staged: () => null },
      director: null,
    } as unknown as GradeGridWorld;
    const grid = new GradeGrid();
    const hooks: GradeGridHooks = {
      student: () => 0,
      onPoint: (p) => void log.push(`point ${p.k}`),
      shells: (k, student, respawned) => void log.push(`shells ${k}@${student.position.x}${respawned ? " respawn" : ""}`),
    };
    const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };
    const grade: StepLoopScope["gradeTakenSteps"] = (steps, frameEndSec, frameGlance) =>
      grid.stepPhysics(steps, frameEndSec, frameGlance as null, world, NO_WEATHER, hooks);
    return { log, grid, grade };
  }

  it("A PAUSED DRIVER GRADES NOTHING, and what a stepper took all the same stays owed: the first call after the pause grades every such step, in order, the shells posed from each — before any further step", () => {
    const g = gridWorld();
    const s = scope({ gradeGrid: g.grid, gradeTakenSteps: g.grade });
    const root = r3fRoot();
    const render = (paused: boolean) => root.render(createElement(StepLoop, { ...s, paused }));
    render(false);
    // A frame of three steps: the loop grades 1 and 2, the frame's end 3.
    s.taken.count = 1;
    s.stepLoopGradeRef.current!();
    s.taken.count = 2;
    s.stepLoopGradeRef.current!();
    s.taken.count = 3;
    g.grade(s.stepTrackRef.current!, 3 * FIXED_DT, null);
    expect(g.log).toEqual(["point 1", "shells 1@1", "point 2", "shells 2@2", "point 3", "shells 3@3", "drawn@0.050"]);
    g.log.length = 0;
    // The pause commits. A step loop that runs now (a stepper that stepped
    // once more) finds a paused driver: nothing is graded, nothing posed.
    render(true);
    s.taken.count = 5;
    s.stepLoopGradeRef.current!();
    expect(g.log).toEqual([]);
    expect(g.grid.clock.last).toBe(3);
    // Resume: before the next step is taken, the two owed points are graded.
    render(false);
    s.stepLoopGradeRef.current!();
    expect(g.log).toEqual(["point 4", "shells 4@4", "point 5", "shells 5@5"]);
    // …and a call with nothing owed (the usual case: a paused world took no
    // step at all) grades nothing.
    g.log.length = 0;
    s.stepLoopGradeRef.current!();
    expect(g.log).toEqual([]);
    expect(root.errors).toEqual([]);
  });

  it("A RESPAWN WITH THE DRIVER MOUNTED: the grid's reset reaches the shells at the first point graded after it — from the step loop as from the frame", () => {
    const g = gridWorld();
    const s = scope({ gradeGrid: g.grid, gradeTakenSteps: g.grade });
    const root = r3fRoot();
    root.render(createElement(StepLoop, s));
    s.taken.count = 1;
    g.grade(s.stepTrackRef.current!, FIXED_DT, null);
    g.grid.reset(); // LessonScene.resetCar, between two frames
    s.taken.count = 2;
    s.stepLoopGradeRef.current!(); // the next frame owes two steps
    s.taken.count = 3;
    g.grade(s.stepTrackRef.current!, 3 * FIXED_DT, null);
    expect(g.log.filter((l) => l.startsWith("shells"))).toEqual(["shells 1@1", "shells 2@2 respawn", "shells 3@3"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §3 VehicleRig's before-step callback
// ───────────────────────────────────────────────────────────────────────────

describe("§3 VehicleRig's before-step callback takes the scene's turn FIRST — the callback cut out of the rig and run", () => {
  const { sf, found } = calls("VehicleRig.tsx", (callee) => callee === "useBeforePhysicsStep");

  function beforeStep(scopeOver: Record<string, unknown>) {
    if (found.length !== 1) throw new Error(`expected one useBeforePhysicsStep in VehicleRig, found ${found.length}`);
    const names = [
      "stepLoopGradeRef",
      "simRef",
      "gripPatches",
      "bodyRef",
      "surfacePatchGripAt",
      "gripFactor",
      "windShelter",
      "inputRef",
      "IDLE_INPUT",
      "difficultyRef",
      "DEFAULT_DIFFICULTY",
      "applyDifficulty",
      "FIXED_DT",
      "assistRef",
      "lessonMaxLegalKmh",
      "lessonRequiredKmh",
      "cabinRef",
    ];
    const js = transpile(`return (${found[0].arguments[0].getText(sf)});`);
    const make = new Function(...names, `"use strict";\n${js}`) as (...a: unknown[]) => () => void;
    const log: string[] = [];
    const base: Record<string, unknown> = {
      stepLoopGradeRef: { current: () => void log.push("grade") },
      simRef: { current: { speedKmh: 0, update: () => void log.push("sim.update"), setSurfaceGripFactor: () => {} } },
      gripPatches: [],
      bodyRef: { current: null },
      surfacePatchGripAt: () => 1,
      gripFactor: 1,
      windShelter: { step: () => void log.push("lee") },
      inputRef: { current: { read: () => (log.push("read"), { throttle: 0, brake: 0, steer: 0, handbrake: false }) } },
      IDLE_INPUT: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      difficultyRef: { current: undefined },
      DEFAULT_DIFFICULTY: "learner",
      applyDifficulty: (raw: unknown) => raw,
      FIXED_DT,
      assistRef: { current: {} },
      lessonMaxLegalKmh: undefined,
      lessonRequiredKmh: undefined,
      cabinRef: { current: null },
      ...scopeOver,
    };
    return { run: make(...names.map((n) => base[n])), log };
  }

  it("the step before is graded, THEN the input of the step about to be taken is read, then the sim is fed — the order a frame of one step always had", () => {
    const b = beforeStep({});
    b.run();
    expect(b.log).toEqual(["grade", "lee", "read", "sim.update"]);
  });

  it("a rig with no sim yet still takes the scene's turn (the grade owes nothing to the rig's sim); a rig handed no ref, or an empty one, feeds its sim as before", () => {
    const noSim = beforeStep({ simRef: { current: null } });
    noSim.run();
    expect(noSim.log).toEqual(["grade"]);
    const noRef = beforeStep({ stepLoopGradeRef: undefined });
    noRef.run();
    expect(noRef.log).toEqual(["lee", "read", "sim.update"]);
    const empty = beforeStep({ stepLoopGradeRef: { current: null } });
    empty.run();
    expect(empty.log).toEqual(["lee", "read", "sim.update"]);
  });
});

describe("a paused world takes no step — @react-three/rapier's own gate, read where the scene relies on it", () => {
  it("<Physics paused> does not call its stepper, and its stepper is an R3F frame callback (re-pointed in a layout effect, like the scene's)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const rapier = readFileSync(path.resolve(here, "../../../../node_modules/@react-three/rapier/dist/react-three-rapier.esm.js"), "utf-8").replace(/\r\n/g, "\n");
    expect(rapier).toMatch(/const stepCallback = useCallback\(delta => \{\s*if \(!paused\) \{\s*step\(delta\);\s*\}\s*\}, \[paused, step\]\);/);
    expect(rapier).toMatch(/useFrame\(\(_, dt\) => \{\s*onStep\(dt\);\s*\}, updatePriority\);/);
    // …and every before-step callback runs before the world steps, in the
    // set's order — the one callback the scene's grade now rides on.
    expect(rapier).toMatch(/beforeStepCallbacks\.forEach\(callback => \{\s*callback\.current\(world\);\s*\}\);\s*world\.timestep = delta;/);
    const scene = read("LessonScene.tsx");
    const open = scene.indexOf("<Physics");
    expect(scene.slice(open, scene.indexOf(">", open))).toContain("paused={physicsPaused}");
  });
});
