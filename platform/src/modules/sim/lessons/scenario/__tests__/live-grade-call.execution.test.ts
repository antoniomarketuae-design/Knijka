/**
 * sc-roundabout-entry:7b747c15 round 6 — NO FRAME-END POSE REACHES THE GRADE,
 * SHOWN BY RUNNING THE SCENE'S OWN CALL.
 *
 * Round 5's verifier refuted the build on one ground (F1): in LessonScene the
 * `vruAheadM` hook handed to `GradeGrid.stepPhysics` measured the person in the
 * path, and changing the three numbers it measured from to this frame's
 * `sample.…` — the frame-end sample, as base spelled it — passed all 12
 * targeted test files and all 122 that mention LessonScene. `tick.vruAheadM` is
 * graded input (it acquits a stop made for a human being), and with that mutant
 * the graded tick stream differed between cadences on 164 of 344 cells with a
 * staged person. A second mutant of the verifier's (TICKPOSE: `onPoint` writes
 * the frame-end pose and speed into the tick before `onTick`) survived too.
 * And the replay harness never published the channel at all (F4), so no census
 * could see it.
 *
 * THE FIX IS STRUCTURAL: the grid measures the person in the path itself, from
 * the student at grid point k and the world's grid state there, for both of its
 * callers. The scene hands it no function that reads a pose.
 *
 * WHAT THIS FILE ADDS IS BEHAVIOUR, three ways:
 *
 *  §1 THE SCENE'S CALL, EXECUTED. The `gradeGrid.stepPhysics(…)` expression is
 *     cut out of components/sim/LessonScene.tsx as a tree (the house pattern —
 *     components/sim/__tests__/followHintRouteHold.test.ts runs the scene's own
 *     expression the same way), transpiled, and RUN against a real GradeGrid,
 *     the real world of a lesson with people standing in the road, and a
 *     physics-step record of that lesson's committed drive. The frame's
 *     `sample` it closes over is deliberately a pose the car is at on NO grid
 *     point. What `onTick` hears must be the car after step k, and the
 *     person-ahead distance measured from there — on 0.5 s phone frames, a
 *     phone's real cadence, 120 Hz and 60 Hz. This is the test that goes red
 *     for ANY hook or argument of that call that lets this frame's pose in,
 *     including one no source pin thought of.
 *
 *  §2 THE GRID'S MEASUREMENT. Through both entries (`stepPhysics`, the live
 *     lesson; `stepFrame`, the replay): the distance on the tick is the
 *     orchestrator's `vruAheadMeters` from the student AT the grid point, taken
 *     after the world moved to that point.
 *
 *  §3 THE HARNESS PUBLISHES IT (F4). `liveChainReplay` is the grid's other
 *     caller, so the committed census and its tick-stream digest now cover the
 *     channel: the distance at every grid point is the same on every cadence,
 *     and the one committed demo whose sheet the channel decides
 *     (sc-hz-accident-scene, a stop for a bystander under a В27) gets the
 *     product's sheet.
 *
 *  §4 THE NEAR-MISS STAT (round 7, the round-6 verifier's C1). «Мина на
 *     косъм» scores nothing but is shown (the result row, the debrief
 *     sentence), and it was stepped once per render frame by NpcColliders from
 *     the frame's drawn chassis. The grid measures it now. Shown three ways:
 *     the scene's call, executed, hands the shell's handler exactly the
 *     encounters an independent detector finds from the car after each step
 *     (and after that point's tick); the replay publishes the same encounters,
 *     result row and debrief sentence on every cadence; and a model of the old
 *     per-frame sampling on the same drives loses or changes them on a phone's
 *     frames — which is the defect.
 *
 *  §5 THE LOOKS, THE ATTEMPT TRACE, THE RESPAWN (round 8, the round-7
 *     verifier's F1 / C2 and the reset owed since round 6). The scene's call
 *     is run with a REAL cabin (`CabinControls`, keys pressed between frames):
 *     two keys inside one frame are both heard, in order, at consecutive grid
 *     points, at 60, 90, 120 and 144 Hz and on a phone's frames — through
 *     round 7 the grid kept one look and the next frame's erased it. The same
 *     run feeds a real attempt recorder through the scene's own feed call: one
 *     sample per graded point from the car after the step, the looks the
 *     grader heard. And the scene's `resetCar` is cut out and executed: a
 *     look or a near-miss window pending at key R is not heard after it.
 *
 * NOT CLAIMED: §1 runs the scene's call expression, not React. That the call
 * is reached once per frame after rapier's stepper is the wiring model's
 * (scene/__tests__/live-grid-wiring.test.ts), read from source and not driven
 * in a browser.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sessionClockAdvance } from "../../../../../components/sim/lesson-ui/sessionClock";
import { actorObb } from "../../../collision";
import type { LessonSpec, NearMissEvent, NearMissStats, VehicleSample } from "../../../contracts";
import { directorContactCast } from "../../../orchestrator/director";
import { vruAheadMeters } from "../../../orchestrator/contact";
import type { SimTick } from "../../../rules/types";
import { createAttemptFeedState, feedAttemptPoint } from "../../../scene/attemptFeed";
import { CabinControls } from "../../../scene/cabin";
import { createGradeGridSample, GradeGrid, type GradeGridHooks, type GradeGridWorld } from "../../../scene/gradeGrid";
import { createTraceRecorder } from "../../../traces/recorder";
import { parseScenarioTrace } from "../../../traces/parse";
import { sampleAt } from "../../../traces/sample";
import type { ScenarioTrace, TracePoint } from "../../../traces/types";
import {
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  NO_PHYSICS_STEPS,
  PhysicsSessionClock,
  PlayerStepTrackRecorder,
  stepNearMiss,
} from "../../../traffic";
import { CHASSIS_HALF_EXTENTS, FIXED_DT } from "../../../vehicle/tuning";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { buildLiveWorld, liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const SRC = path.resolve(HERE, "../../../../..");
const H = FIXED_DT;
const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };

/** w69-h1-mob sc-roundabout-entry__mobile-right frame deltas, ms (the phone
 *  the row was filed from). */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);
const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
  ["0.5 s", [0.5]],
  ["120 Hz", [1 / 120]],
  ["0.5 s first frame, then 60 Hz", [0.5, ...rep(60000, 1 / 60)]],
  ["0.25/0.4 s", [0.25, 0.4]],
];

interface Cell {
  key: string;
  lesson: LessonSpec;
  raw: unknown;
  trace: ScenarioTrace;
}

function cell(id: string, file: string, level: ScenarioLevel): Cell {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (!spec) throw new Error(`no template ${id}`);
  const trace = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")),
  );
  if (!trace) throw new Error(`unreadable trace ${id}/${file}`);
  return { key: `${id}/${file}/L${level}`, lesson: compileScenario(spec, level), raw: loadDistrict(spec.map.districtId), trace };
}

const newPoint = (): TracePoint => ({
  x: 0,
  y: 0,
  headingDeg: 0,
  steerRad: 0,
  speedKmh: 0,
  gear: 0,
  indicator: "off",
  brakeOn: false,
  throttleOn: false,
});

// ───────────────────────────────────────────────────────────────────────────
// §1 — the scene's own `gradeGrid.stepPhysics(…)` call, executed
// ───────────────────────────────────────────────────────────────────────────

/** Every name the scene's call reads from outside itself — pinned as a set by
 *  scene/__tests__/live-grid-wiring.test.ts §3; supplied here, in this order.
 *  ONE of them is not supplied as a value (round 7): `steps` is what the
 *  scene's own `const steps = …` statement makes of `stepTrackRef`, and that
 *  statement is cut out and executed in front of the call — so a scene that
 *  graded off anything but the recorder VehicleRig fills would run here too. */
const SCENE_NAMES = [
  "gradeGrid",
  "stepTrackRef",
  "tRef",
  "sample",
  "runtime",
  "traffic",
  "director",
  "conditions",
  "inputRef",
  "hazardActiveRef",
  "telltaleLitRef",
  "onTelltale",
  "recorder",
  "telltaleCautionLitRef",
  "onTelltaleCaution",
  "onStagedOutcome",
  "onTick",
  "onNearMiss",
  // Round 8: the cabin (every look it still holds), and the attempt trace's
  // feed — its state, the function, and the sim whose steering angle rides
  // along.
  "cabinRef",
  "attemptFeedRef",
  "feedAttemptPoint",
  "simRef",
] as const;

/** Two names the call does NOT read today, handed over all the same: a scene
 *  that went back to measuring the person in the path itself would reach for
 *  exactly these, and it should then fail on WHAT IT MEASURED, not on a
 *  missing name. */
const EXTRA_NAMES = ["vruAheadMeters", "directorContactCast"] as const;

type SceneCall = (...args: unknown[]) => unknown;

/** Cut the call out of the scene as a tree, and compile it. */
function sceneGradeCall(): { text: string; stepsDecl: string; run: SceneCall } {
  const source = readFileSync(path.join(SRC, "components/sim/LessonScene.tsx"), "utf-8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile("LessonScene.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "gradeGrid.stepPhysics") calls.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (calls.length !== 1) throw new Error(`expected one gradeGrid.stepPhysics call in LessonScene, found ${calls.length}`);
  const text = calls[0].getText(sf);
  // The statement that makes `steps`, in the same function body as the call
  // (RuntimeDriver's frame callback), and everything else that body does to
  // `steps` before the call: none may exist but the declaration and reads.
  let body: ts.Block | null = null;
  for (let p: ts.Node | undefined = calls[0].parent; p; p = p.parent) {
    if (ts.isBlock(p) && (ts.isArrowFunction(p.parent) || ts.isFunctionExpression(p.parent))) {
      body = p;
      break;
    }
  }
  if (!body) throw new Error("the stepPhysics call is not inside a function body");
  const decls = body.statements.filter(
    (st): st is ts.VariableStatement =>
      ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.name.getText(sf) === "steps"),
  );
  if (decls.length !== 1) throw new Error(`expected one \`steps\` declaration beside the call, found ${decls.length}`);
  const stepsDecl = decls[0].getText(sf);
  const js = ts.transpileModule(`${stepsDecl}\nreturn (${text});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return {
    text,
    stepsDecl,
    run: new Function(...SCENE_NAMES, "NO_PHYSICS_STEPS", ...EXTRA_NAMES, `"use strict";\n${js}`) as SceneCall,
  };
}

interface Heard {
  k: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  vru: number;
}

/** One resolved near miss, as a comparable line. */
interface Near {
  k: number;
  id: number;
  kind: string;
  clearanceM: number;
  relSpeedMps: number;
}

/** The near-miss stat's body envelopes, taken here from their sources (the
 *  chassis collider; the CAR profile off `actorObb`; the pedestrian margin) —
 *  not from the module under test. */
const NEAR_PLAYER = { halfWidthM: CHASSIS_HALF_EXTENTS.x, halfLengthM: CHASSIS_HALF_EXTENTS.z };
const NEAR_CAR = actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 });
const NEAR_PED_M = 0.35;

type LiveTraffic = ReturnType<typeof buildLiveWorld>["traffic"];
/** The agents a detector pass looks at: where they stand, who they are. */
interface AgentSnap {
  id: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
}
const snapAgents = (agents: readonly AgentSnap[]): AgentSnap[] =>
  agents.map((a) => ({ id: a.id, x: a.x, y: a.y, dirX: a.dirX, dirY: a.dirY, speedMps: a.speedMps }));

/** An independent near-miss detector over a traffic system: the pure
 *  `stepNearMiss`, stepped by the test from a pose the TEST chooses, against
 *  the live agent arrays or a snapshot of them the test took. */
function nearMissProbe(traffic: LiveTraffic) {
  const veh = createNearMissTracker(traffic.vehicles.length);
  const ped = createNearMissTracker(traffic.pedestrians.length);
  const found: Near[] = [];
  return {
    found,
    step(
      k: number,
      dtSec: number,
      x: number,
      y: number,
      headingDeg: number,
      speedKmh: number,
      vehicles: readonly AgentSnap[] = traffic.vehicles,
      pedestrians: readonly AgentSnap[] = traffic.pedestrians,
    ) {
      const player = { x, y, headingDeg, speedMps: speedKmh / 3.6, ...NEAR_PLAYER };
      stepNearMiss(veh, dtSec, player, vehicles, NEAR_CAR.halfWidthM, NEAR_CAR.halfLengthM, DEFAULT_NEAR_MISS_CONFIG, (i, c, rel) => {
        const id = vehicles[i].id;
        found.push({ k, id, kind: traffic.vehicleCollisionKind(id), clearanceM: c, relSpeedMps: rel });
      });
      stepNearMiss(ped, dtSec, player, pedestrians, NEAR_PED_M, NEAR_PED_M, DEFAULT_NEAR_MISS_CONFIG, (i, c, rel) => {
        found.push({ k, id: pedestrians[i].id, kind: "pedestrian", clearanceM: c, relSpeedMps: rel });
      });
    },
  };
}

/**
 * One session of LessonScene's graded frame, for real: rapier's stepper (the
 * accumulator the wiring model pins) records the car after every step from
 * the committed drive; then RuntimeDriver's two lines — the session clock, and
 * the scene's own call. `frameSample` is what `sampleRef.current` holds when
 * the call runs: by construction a pose the car has at NO grid point.
 */
function driveSceneCall(c: Cell, deltas: readonly number[], run: SceneCall) {
  const { runtime, traffic, director } = buildLiveWorld(c.lesson, c.raw);
  const cast = directorContactCast(director);
  const gradeGrid = new GradeGrid();
  const steps = new PlayerStepTrackRecorder();
  const sessionClock = new PhysicsSessionClock();
  const tRef = { current: 0 };
  const sample: VehicleSample = createGradeGridSample();
  sample.seatbeltOn = true;
  const p = newPoint();
  const states: Array<{ x: number; y: number; headingDeg: number; speedKmh: number }> = [{ x: 0, y: 0, headingDeg: 0, speedKmh: 0 }];
  const heard: Heard[] = [];
  const wrong: string[] = [];
  let finite = 0;
  /** Points at which measuring from the frame's sample would have given a
   *  different person-ahead distance — what the test has to tell apart. */
  let frameWouldDiffer = 0;
  let poseWouldDiffer = 0;
  let gapFinite = 0;
  let gapWouldDiffer = 0;
  // THE NEAR-MISS STAT, three ways: what the shell's handler was handed by the
  // scene's call; what an independent detector finds from the car after each
  // step against the world at that step; and what the frame's sample would
  // have found, stepped once per frame (NpcColliders' way until round 7).
  const nearHeard: Near[] = [];
  const nearWrong: string[] = [];
  const nearDue = nearMissProbe(traffic);
  const nearFromFrame = nearMissProbe(traffic);
  let lastTickK = 0;
  const onNearMiss = (e: NearMissEvent, stats: NearMissStats) => {
    const k = Math.round(e.tSec / H);
    nearHeard.push({ k, id: e.npcId, kind: e.kind, clearanceM: e.clearanceM, relSpeedMps: e.relSpeedMps });
    // Stamped with the grid point's own session time, and handed over AFTER
    // that point's tick (the shell pins the encounter at its last tick).
    if (Math.abs(e.tSec - k * H) > 1e-9) nearWrong.push(`near miss stamped ${e.tSec}, no grid point`);
    if (k !== lastTickK) nearWrong.push(`near miss of point ${k} handed over when the last tick heard was point ${lastTickK}`);
    if (stats.count !== nearHeard.length) nearWrong.push(`running count ${stats.count} after ${nearHeard.length} near misses`);
  };
  const onTick = (tick: SimTick) => {
    const k = Math.round(tick.t / H);
    const st = states[k];
    lastTickK = k;
    if (st !== undefined) nearDue.step(k, H, st.x, st.y, st.headingDeg, st.speedKmh);
    const vru = tick.vruAheadM ?? Infinity;
    heard.push({ k, x: tick.position.x, y: tick.position.y, headingDeg: tick.headingDeg, speedKmh: tick.speedKmh, vru });
    if (st === undefined) {
      wrong.push(`tick at t=${tick.t} is no physics step`);
      return;
    }
    if (tick.position.x !== st.x || tick.position.y !== st.y || tick.headingDeg !== st.headingDeg || tick.speedKmh !== Math.abs(st.speedKmh)) {
      if (wrong.length < 5) {
        wrong.push(
          `point ${k}: the tick says (${tick.position.x.toFixed(3)}, ${tick.position.y.toFixed(3)}) ${tick.headingDeg.toFixed(2)}° ${tick.speedKmh.toFixed(2)} km/h; the car after step ${k} is at (${st.x.toFixed(3)}, ${st.y.toFixed(3)}) ${st.headingDeg.toFixed(2)}° ${st.speedKmh.toFixed(2)} km/h`,
        );
      }
    }
    // The person in the path, measured independently: the orchestrator's own
    // function, the car after step k, the staged people where the world's
    // step k left them (nothing has moved them since).
    const due = vruAheadMeters(cast, traffic, st.x, st.y, st.headingDeg);
    if (Number.isFinite(due)) finite++;
    if (!Object.is(vru, due) && wrong.length < 5) {
      wrong.push(`point ${k}: tick.vruAheadM ${vru} vs ${due} measured from the car after step ${k}`);
    }
    const fromFrame = vruAheadMeters(cast, traffic, sample.position.x, sample.position.y, sample.headingDeg);
    if (!Object.is(fromFrame, due)) frameWouldDiffer++;
    // The lead gap is the grid's too: the car after step k against the world
    // at k (a pure query of the traffic system).
    const gapDue = traffic.leadGapMeters(st.x, st.y, st.headingDeg);
    const gap = tick.leadGapM ?? Infinity;
    if (Number.isFinite(gapDue)) gapFinite++;
    if (!Object.is(gap, gapDue) && wrong.length < 5) {
      wrong.push(`point ${k}: tick.leadGapM ${gap} vs ${gapDue} measured from the car after step ${k}`);
    }
    if (!Object.is(traffic.leadGapMeters(sample.position.x, sample.position.y, sample.headingDeg), gapDue)) gapWouldDiffer++;
    if (sample.position.x !== st.x || sample.position.y !== st.y) poseWouldDiffer++;
  };
  const noop = () => {};
  const args: Record<(typeof SCENE_NAMES)[number], unknown> = {
    gradeGrid,
    // The ref VehicleRig records into — the scene's own statement turns it
    // into the step source the call grades off.
    stepTrackRef: { current: steps },
    tRef,
    sample,
    runtime,
    traffic,
    director,
    conditions: NO_WEATHER,
    inputRef: { current: { rawBrake: 0 } },
    hazardActiveRef: { current: false },
    telltaleLitRef: { current: false },
    onTelltale: noop,
    recorder: null,
    telltaleCautionLitRef: { current: false },
    onTelltaleCaution: noop,
    onStagedOutcome: noop,
    onTick,
    onNearMiss,
    // No cabin, no attempt recorder in this section (§5 runs both for real).
    cabinRef: { current: null },
    attemptFeedRef: { current: createAttemptFeedState() },
    feedAttemptPoint,
    simRef: { current: null },
  };
  const ordered = [...SCENE_NAMES.map((n) => args[n]), NO_PHYSICS_STEPS, vruAheadMeters, directorContactCast];
  const dur = c.trace.meta.durationSec;
  let accumulator = 0;
  let frames = 0;
  let gradedByCall = 0;
  while (steps.stepCount * H < dur) {
    const delta = deltas[frames % deltas.length];
    frames++;
    // rapier's stepper: `accumulator += clamp(dt, 0, 0.5); while (accumulator
    // >= timeStep) { step; accumulator -= timeStep }` — VehicleRig records the
    // car after each step.
    accumulator += Math.min(Math.max(delta, 0), 0.5);
    while (accumulator >= H) {
      const n = steps.stepCount + 1;
      sampleAt(c.trace, Math.min(n * H, dur), p);
      steps.record(p.x, p.y, p.speedKmh, p.headingDeg);
      states[n] = { x: p.x, y: p.y, headingDeg: p.headingDeg, speedKmh: p.speedKmh };
      accumulator -= H;
    }
    // What the rig left in `sampleRef.current` this frame: the interpolated
    // chassis. Here: where the car will be 0.8 s on, pushed 2 m sideways and
    // turned 20° — on the road, near the people, and on no grid point.
    sampleAt(c.trace, Math.min(steps.stepCount * H + 0.8, dur), p);
    sample.position.x = p.x + 2;
    sample.position.y = p.y - 2;
    sample.headingDeg = p.headingDeg + 20;
    sample.speedKmh = p.speedKmh + 17;
    sample.indicator = p.indicator;
    sample.gear = p.gear;
    // RuntimeDriver: the clock line, then the call.
    tRef.current = sessionClock.frame(sessionClockAdvance(delta), steps.stepCount);
    gradedByCall += run(...ordered) as number;
    // NpcColliders until round 7: once per frame, after RuntimeDriver, from
    // the frame's sample, dt capped at 0.1 s.
    nearFromFrame.step(steps.stepCount, Math.min(delta, 0.1), sample.position.x, sample.position.y, sample.headingDeg, sample.speedKmh);
  }
  return {
    heard,
    wrong,
    finite,
    frameWouldDiffer,
    poseWouldDiffer,
    gapFinite,
    gapWouldDiffer,
    steps: steps.stepCount,
    frames,
    gradedByCall,
    nearHeard,
    nearDue: nearDue.found,
    nearFromFrame: nearFromFrame.found,
    nearWrong,
  };
}

describe("§1 the scene's own graded call, EXECUTED: the grader hears the car after step k and the person ahead measured from there — whatever this frame's sample says", () => {
  const scene = sceneGradeCall();
  // People standing in the road for the whole drive, the car moving past them.
  const c = cell("sc-hz-accident-scene", "mistake-gawk-stop.trace.json", 1);

  it("the call was found, compiles, and names nothing this file does not hand it", () => {
    expect(scene.text.startsWith("gradeGrid.stepPhysics(")).toBe(true);
    // The step source is the recorder itself, or — with none handed in — a
    // source that never steps (nothing is graded): the scene's own statement.
    expect(scene.stepsDecl.replace(/\s+/g, " ")).toBe("const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;");
    expect(scene.text.length).toBeGreaterThan(1500);
    // A name the scene's call reads and this file does not supply would throw
    // a ReferenceError inside the run; say so as an assertion instead.
    let thrown: unknown = null;
    try {
      driveSceneCall(c, [1 / 60], scene.run);
    } catch (e) {
      thrown = e;
    }
    expect(thrown, "the scene's stepPhysics call must run on the names SCENE_NAMES supplies").toBeNull();
  });

  for (const [name, deltas] of CADENCES) {
    it(`${name}: every tick the grader hears is the car after its own physics step, and the person-ahead distance is measured from that car`, () => {
      const r = driveSceneCall(c, deltas, scene.run);
      // One graded point per physics step, in order, each heard once.
      expect(r.gradedByCall, `${name}: points the call graded`).toBe(r.steps);
      expect(r.heard.length, `${name}: ticks the grader heard`).toBe(r.steps);
      expect(r.heard.map((h) => h.k)).toEqual(Array.from({ length: r.steps }, (_, i) => i + 1));
      // The test can tell the two poses apart on (nearly) every point…
      expect(r.poseWouldDiffer, `${name}: points at which the frame's sample is not the car after the step`).toBe(r.steps);
      expect(r.finite, `${name}: points with a person in the path`).toBeGreaterThan(800);
      expect(r.frameWouldDiffer, `${name}: points at which the frame's sample would have measured a different distance`).toBeGreaterThan(800);
      // …and the grader heard the step's, on all of them.
      expect(r.wrong, `${name}: what the grader heard vs the car at the grid point`).toEqual([]);
    });
  }

  it("…and so is the lead gap: on the lesson's correct drive (a car ahead for seconds) the gap on the tick is the one from the car after the step, on 0.5 s frames and at 120 Hz", () => {
    const lead = cell("sc-hz-accident-scene", "shadow-correct.trace.json", 1);
    for (const [name, deltas] of [CADENCES[2], CADENCES[3], CADENCES[0]]) {
      const r = driveSceneCall(lead, deltas, scene.run);
      expect(r.gradedByCall, name).toBe(r.steps);
      expect(r.gapFinite, `${name}: points with a car ahead`).toBeGreaterThan(100);
      expect(r.gapWouldDiffer, `${name}: points at which the frame's sample would have measured a different gap`).toBeGreaterThan(100);
      expect(r.finite, `${name}: points with a person in the path`).toBeGreaterThan(500);
      expect(r.wrong, `${name}: what the grader heard vs the car at the grid point`).toEqual([]);
    }
  });

  it("the same ticks on every cadence: position, heading, speed and the person-ahead distance at grid point k do not depend on the frame it fell in", () => {
    const ref = driveSceneCall(c, [1 / 60], scene.run);
    for (const [name, deltas] of CADENCES.slice(1)) {
      const r = driveSceneCall(c, deltas, scene.run);
      // The 60 Hz run may end a frame's worth of steps earlier or later.
      const n = Math.min(r.heard.length, ref.heard.length);
      expect(n, name).toBeGreaterThan(1200);
      const firstDiff = r.heard.slice(0, n).findIndex((h, i) => {
        const g = ref.heard[i];
        return h.k !== g.k || h.x !== g.x || h.y !== g.y || h.headingDeg !== g.headingDeg || h.speedKmh !== g.speedKmh || !Object.is(h.vru, g.vru);
      });
      expect(
        firstDiff < 0 ? "same" : `${name}: point ${r.heard[firstDiff].k}: ${JSON.stringify(r.heard[firstDiff])} vs 60 Hz ${JSON.stringify(ref.heard[firstDiff])}`,
      ).toBe("same");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 — the grid's own measurement, through both of its entries
// ───────────────────────────────────────────────────────────────────────────

describe("§2 GradeGrid measures the person in the path itself — from the student AT the grid point, after the world moved to it", () => {
  // People who MOVE (they walk to the tram island across the car's path).
  const c = cell("sc-rx-tram-island", "mistake-squeeze-past.trace.json", 1);

  function drive(entry: "stepPhysics" | "stepFrame", deltas: readonly number[]) {
    const { runtime, traffic, director } = buildLiveWorld(c.lesson, c.raw);
    const cast = directorContactCast(director);
    expect(cast.some((m) => m.body === "disc")).toBe(true);
    // The grid's view of the traffic port, counting: which world step each
    // pose lookup the MEASUREMENT makes was made after (the director holds
    // the real port, so only the grid's lookups pass through here).
    let updates = 0;
    const lookupsAt: number[] = [];
    const world: GradeGridWorld = {
      runtime,
      director,
      traffic: {
        update: (dt, ctx) => {
          updates++;
          traffic.update(dt, ctx);
        },
        leadGapMeters: (x, y, h) => traffic.leadGapMeters(x, y, h),
        setRenderSessionTime: (t) => traffic.setRenderSessionTime(t),
        staged: (id) => {
          lookupsAt.push(updates);
          return traffic.staged(id);
        },
        vehicles: traffic.vehicles,
        pedestrians: traffic.pedestrians,
        vehicleCollisionKind: (id) => traffic.vehicleCollisionKind(id),
      },
    };
    const grid = new GradeGrid();
    const steps = new PlayerStepTrackRecorder();
    const p = newPoint();
    const dur = c.trace.meta.durationSec;
    const wrong: string[] = [];
    let points = 0;
    let finite = 0;
    let changed = 0;
    let prev = NaN;
    let seen = 0;
    const hooks: GradeGridHooks = {
      student: (_k, tk, out) => {
        if (entry === "stepFrame") {
          // The replay's hook: the drive AT the grid point.
          sampleAt(c.trace, Math.min(tk, dur), p);
          out.position.x = p.x;
          out.position.y = p.y;
          out.headingDeg = p.headingDeg;
          out.speedKmh = p.speedKmh;
        } else {
          // A scene gone back to a frame-end sample: a pose the grid must
          // overwrite before it measures anything.
          out.position.x = -5000;
          out.position.y = -5000;
          out.headingDeg = 123;
          out.speedKmh = 99;
        }
        out.seatbeltOn = true;
        return 0;
      },
      onPoint: (pt) => {
        points++;
        sampleAt(c.trace, Math.min(pt.k * H, dur), p);
        const due = vruAheadMeters(cast, traffic, p.x, p.y, p.headingDeg);
        const got = pt.tick.vruAheadM ?? Infinity;
        if (Number.isFinite(due)) finite++;
        if (!Object.is(due, prev)) changed++;
        prev = due;
        if (!Object.is(got, due) && wrong.length < 5) wrong.push(`point ${pt.k}: tick.vruAheadM ${got} vs ${due} from the student at the grid point`);
        // Every pose lookup this point's measurement made came after the
        // world's update for THIS point (the k-th), never before it.
        const mine = lookupsAt.slice(seen);
        seen = lookupsAt.length;
        if (mine.length === 0 && wrong.length < 5) wrong.push(`point ${pt.k}: the grid looked no staged person up`);
        if (mine.some((u) => u !== points) && wrong.length < 5) {
          wrong.push(`point ${pt.k}: the person was looked up after world step ${mine.find((u) => u !== points)}, not ${points}`);
        }
      },
    };
    let t = 0;
    let acc = 0;
    let frames = 0;
    while (points * H < dur) {
      const d = Math.min(Math.max(deltas[frames % deltas.length], 0), 0.5);
      frames++;
      t += d;
      if (entry === "stepPhysics") {
        acc += d;
        while (acc >= H) {
          sampleAt(c.trace, Math.min((steps.stepCount + 1) * H, dur), p);
          steps.record(p.x, p.y, p.speedKmh, p.headingDeg);
          acc -= H;
        }
        grid.stepPhysics(steps, t, null, world, NO_WEATHER, hooks);
      } else {
        grid.stepFrame(t, null, world, NO_WEATHER, hooks);
      }
    }
    return { wrong, points, finite, changed };
  }

  for (const entry of ["stepPhysics", "stepFrame"] as const) {
    for (const [name, deltas] of [CADENCES[0], CADENCES[2], CADENCES[3]]) {
      it(`${entry}, ${name}: the distance on the tick is vruAheadMeters(student at k, world at k)`, () => {
        const r = drive(entry, deltas);
        expect(r.points).toBeGreaterThan(900);
        // Teeth: the people are in the path for seconds, and the distance
        // moves from point to point (a stale pose or a stale world shows).
        expect(r.finite, "points with a person in the path").toBeGreaterThan(100);
        expect(r.changed, "points at which the distance changed").toBeGreaterThan(100);
        expect(r.wrong).toEqual([]);
      });
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §3 — the replay harness publishes the channel (round 5's F4)
// ───────────────────────────────────────────────────────────────────────────

describe("§3 the replay harness publishes the person-ahead distance — the census sees the channel the product grades on", () => {
  interface Run {
    sheet: string;
    vru: Map<number, number>;
    finite: number;
    wrong: string[];
  }
  function replay(c: Cell, deltas: readonly number[], silence = false): Run {
    const vru = new Map<number, number>();
    const wrong: string[] = [];
    let finite = 0;
    const out = liveChainReplay({
      lesson: c.lesson,
      districtRaw: c.raw,
      trace: c.trace,
      frameDeltas: deltas,
      beforeApply: ({ tick }) => {
        // What the harness did before round 6: nobody answered.
        if (silence) delete tick.vruAheadM;
      },
      afterApply: ({ t, tick, traffic, director }) => {
        const got = tick.vruAheadM ?? Infinity;
        vru.set(Math.round(t / H), got);
        if (silence) return;
        if (Number.isFinite(got)) finite++;
        const due = vruAheadMeters(directorContactCast(director), traffic, tick.position.x, tick.position.y, tick.headingDeg);
        if (!Object.is(got, due) && wrong.length < 5) wrong.push(`t=${t.toFixed(4)}: tick.vruAheadM ${got} vs ${due}`);
      },
    });
    const r = out.result;
    return {
      sheet: `${out.violationCodes.join("+") || "—"} · ${r.score} т. · ${r.passed ? "passed" : "failed"} · praise ${out.commendationCodes.join("+") || "—"}`,
      vru,
      finite,
      wrong,
    };
  }

  const cells: ReadonlyArray<readonly [string, string, ScenarioLevel, number]> = [
    // [lesson, demo, rung, graded points with a person in the path at 60 Hz ≥]
    ["sc-hz-accident-scene", "mistake-gawk-stop.trace.json", 4, 1000],
    ["sc-zebra-approach", "shadow-correct.trace.json", 1, 90],
    ["sc-rx-tram-island", "mistake-squeeze-past.trace.json", 1, 150],
    ["sc-rb-ped-exit", "shadow-correct.trace.json", 5, 150],
  ];

  for (const [id, file, level, atLeast] of cells) {
    it(`${id} ${file.replace(".trace.json", "")} L${level}: published at every grid point with a person in the path, the same number on ${CADENCES.length - 1} cadences as at 60 Hz, one sheet`, () => {
      const c = cell(id, file, level);
      const ref = replay(c, CADENCES[0][1]);
      expect(ref.finite, "graded points carrying a person-ahead distance at 60 Hz").toBeGreaterThanOrEqual(atLeast);
      expect(ref.wrong).toEqual([]);
      for (const [name, deltas] of CADENCES.slice(1)) {
        const r = replay(c, deltas);
        expect(r.wrong, name).toEqual([]);
        expect(r.sheet, `${name}: sheet`).toBe(ref.sheet);
        expect(r.vru.size, `${name}: graded points`).toBe(ref.vru.size);
        let diff = "same";
        for (const [k, v] of ref.vru) {
          if (!Object.is(r.vru.get(k), v)) {
            diff = `${name}: grid point ${k}: ${r.vru.get(k)} vs 60 Hz ${v}`;
            break;
          }
        }
        expect(diff).toBe("same");
      }
    });
  }

  it("the sheet the channel decides: a stop for a bystander under the В27 is acquitted, as in the product — and billed 3 т. only when nobody publishes the distance (the harness before round 6)", () => {
    const c = cell("sc-hz-accident-scene", "mistake-gawk-stop.trace.json", 4);
    for (const [name, deltas] of CADENCES) {
      const now = replay(c, deltas);
      expect(now.sheet, name).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
      expect(now.sheet, name).toContain(" 0 т. ");
    }
    const silent = replay(c, CADENCES[0][1], true);
    expect(silent.sheet).toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(silent.sheet).toContain(" 3 т. ");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §4 — the near-miss stat is the grid's (round 7, the round-6 verifier's C1)
// ───────────────────────────────────────────────────────────────────────────

const nearLine = (n: Near) => `point ${n.k}: ${n.kind} #${n.id} at ${n.clearanceM.toFixed(3)} m, ${n.relSpeedMps.toFixed(2)} m/s`;

describe("§4 the near-miss stat («мина на косъм») is measured by the grid — from the car at the grid point, not the frame's drawn chassis", () => {
  const scene = sceneGradeCall();

  it("the scene hands the grid the shell's handler by name and steps no detector of its own (NpcColliders does not either)", () => {
    expect(scene.text).toMatch(/nearMiss: onNearMiss,\s*\}\s*,?\s*\)$/);
    const strip = (rel: string) =>
      readFileSync(path.join(SRC, rel), "utf-8")
        .replace(/\r\n/g, "\n")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const npc = strip("components/sim/NpcColliders.tsx");
    const sceneSrc = strip("components/sim/LessonScene.tsx");
    for (const src of [npc, sceneSrc]) {
      expect(src).not.toContain("stepNearMiss");
      expect(src).not.toContain("createNearMissTracker");
      expect(src).not.toContain("GridNearMissMeter");
    }
    expect(npc).not.toContain("onNearMiss");
    // The scene's own mentions of the handler: its two prop declarations, the
    // two destructurings, the hand-over to RuntimeDriver, and the hook.
    expect(sceneSrc.match(/onNearMiss=\{onNearMiss\}/g)).toEqual(["onNearMiss={onNearMiss}"]);
    expect(sceneSrc).toMatch(/<RuntimeDriver[\s\S]*?onNearMiss=\{onNearMiss\}[\s\S]*?\/>/);
    expect(sceneSrc).not.toMatch(/<NpcColliders[^>]*onNearMiss/);
    // …and the one stepper in the product is the grid's meter.
    const grid = strip("modules/sim/scene/gradeGrid.ts");
    expect(grid.split("this.nearMisses.step(").length - 1).toBe(1);
    expect(grid).toMatch(/traffic\.update\(dtSec, ctx\);\s*this\.resolved\.length = 0;\s*this\.nearMisses\.step\(tSec, dtSec, s, traffic, this\.resolved\);/);
  });

  // [lesson, demo, rung, what it is]
  const cells: ReadonlyArray<readonly [string, string, ScenarioLevel, string]> = [
    ["sc-turn-left-oncoming", "mistake-cut-gap.trace.json", 3, "an oncoming car, 0.72 m"],
    ["sc-crossing-rain-sprint", "mistake-not-yielded.trace.json", 3, "a pedestrian, 0.60 m"],
    ["sc-hz-accident-scene", "mistake-squeeze.trace.json", 3, "two bystanders"],
    ["sc-vu-cyclist-hook", "mistake-hook.trace.json", 3, "a cyclist and a pedestrian"],
  ];

  for (const [id, file, level, what] of cells) {
    it(`the scene's call, EXECUTED — ${id} ${file.replace(".trace.json", "")} L${level} (${what}): the handler hears the encounters measured from the car after each step, on every cadence`, () => {
      const c = cell(id, file, level);
      let ref: Near[] | null = null;
      for (const [name, deltas] of CADENCES) {
        const r = driveSceneCall(c, deltas, scene.run);
        expect(r.gradedByCall, name).toBe(r.steps);
        expect(r.nearDue.length, `${name}: near misses on this drive`).toBeGreaterThan(0);
        expect(r.nearWrong, name).toEqual([]);
        expect(r.nearHeard.map(nearLine), `${name}: what the shell's handler heard vs the car at the grid point`).toEqual(r.nearDue.map(nearLine));
        // Teeth: stepped once per frame from the frame's sample (a different
        // pose), the detector finds something else.
        expect(r.nearFromFrame.map(nearLine), `${name}: the frame's sample would have found the same`).not.toEqual(r.nearDue.map(nearLine));
        if (ref === null) ref = r.nearHeard;
        else expect(r.nearHeard.map(nearLine), `${name} vs 60 Hz`).toEqual(ref.map(nearLine));
      }
    });
  }

  interface NearRun {
    events: string[];
    kept: number;
    sentence: string;
    perFrame: string[];
  }
  /** The replay, plus a model of the old sampling on the same drive: the
   *  detector stepped once per RENDER FRAME at the frame's last graded point
   *  (within one step of the frame's drawn chassis), dt = min(frame, 0.1 s). */
  function replayNear(c: Cell, deltas: readonly number[]): NearRun {
    let probe: ReturnType<typeof nearMissProbe> | null = null;
    // The newest graded point of the frame in progress, with the agents where
    // the world's step left them at it (the world moves on before the next
    // frame is known to have begun, so they are copied).
    let held: { wall: number; k: number; x: number; y: number; h: number; v: number; veh: AgentSnap[]; ped: AgentSnap[] } | null = null;
    let prevWall = 0;
    const flush = () => {
      if (!held || !probe) return;
      probe.step(held.k, Math.min(held.wall - prevWall, 0.1), held.x, held.y, held.h, held.v, held.veh, held.ped);
      prevWall = held.wall;
    };
    const out = liveChainReplay({
      lesson: c.lesson,
      districtRaw: c.raw,
      trace: c.trace,
      frameDeltas: deltas,
      afterApply: ({ t, tick, traffic, wallSec }) => {
        probe ??= nearMissProbe(traffic);
        // A new frame began: the point held was the last of the frame before.
        if (held && wallSec !== held.wall) flush();
        held = {
          wall: wallSec,
          k: Math.round(t / H),
          x: tick.position.x,
          y: tick.position.y,
          h: tick.headingDeg,
          v: tick.speedKmh,
          veh: snapAgents(traffic.vehicles),
          ped: snapAgents(traffic.pedestrians),
        };
      },
    });
    flush();
    // Every sentence of the debrief that speaks of a near miss (the verdict card reservation, or the «Разминавания на косъм: N — …» paragraph).
    return {
      events: out.nearMisses.map((e) => nearLine({ k: Math.round(e.tSec / H), id: e.npcId, kind: e.kind, clearanceM: e.clearanceM, relSpeedMps: e.relSpeedMps })),
      kept: out.result.nearMisses?.length ?? 0,
      sentence: (out.debrief.match(/[Рр]азминаван[^ ]* на косъм[^.]*/g) ?? []).join(" | "),
      perFrame: (probe as ReturnType<typeof nearMissProbe> | null)?.found.map(nearLine) ?? [],
    };
  }

  for (const [id, file, level, what] of cells) {
    it(`the replay — ${id} ${file.replace(".trace.json", "")} L${level} (${what}): the same near misses, result row and debrief sentence on ${CADENCES.length - 1} cadences as at 60 Hz`, () => {
      const c = cell(id, file, level);
      const ref = replayNear(c, CADENCES[0][1]);
      expect(ref.events.length, "near misses at 60 Hz").toBeGreaterThan(0);
      expect(ref.kept, "near misses in result.nearMisses").toBeGreaterThan(0);
      expect(ref.sentence, "the debrief's near-miss sentence").toMatch(/азминаван/);
      for (const [name, deltas] of CADENCES.slice(1)) {
        const r = replayNear(c, deltas);
        expect(r.events, `${name}: near misses`).toEqual(ref.events);
        expect(r.kept, `${name}: result.nearMisses`).toBe(ref.kept);
        expect(r.sentence, `${name}: the debrief sentence`).toBe(ref.sentence);
      }
    });
  }

  it("what it was: the detector stepped once per render frame — on the same four drives a phone's frames and a steady 0.5 s find different near misses than 60 Hz does", () => {
    const changed: string[] = [];
    for (const [id, file, level] of cells) {
      const c = cell(id, file, level);
      const at60 = replayNear(c, CADENCES[0][1]).perFrame;
      // At 60 Hz every frame is one grid point: the old sampling and the grid
      // see the same thing.
      expect(at60, `${id}: per-frame model at 60 Hz vs the grid`).toEqual(replayNear(c, CADENCES[0][1]).events);
      for (const [name, deltas] of [CADENCES[1], CADENCES[2]]) {
        const was = replayNear(c, deltas).perFrame;
        if (JSON.stringify(was.map((l) => l.replace(/^point \d+: /, ""))) !== JSON.stringify(at60.map((l) => l.replace(/^point \d+: /, "")))) {
          changed.push(`${id} ${name}: ${was.length} vs ${at60.length} at 60 Hz`);
        }
      }
    }
    // Every one of the four changed on at least one of the two long cadences.
    expect(new Set(changed.map((c) => c.split(" ")[0])).size, changed.join(" | ")).toBe(cells.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §5 — ROUND 8: the looks, the attempt trace and the respawn, through the
// scene's own code, executed
// ───────────────────────────────────────────────────────────────────────────

/** `const resetCar = useCallback(() => { … }, […])` cut out of LessonScene as a
 *  tree: the arrow function itself, compiled. */
function sceneResetCar(): { text: string; run: (...args: unknown[]) => () => void } {
  const source = readFileSync(path.join(SRC, "components/sim/LessonScene.tsx"), "utf-8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile("LessonScene.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.ArrowFunction[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(sf) === "resetCar" &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(sf) === "useCallback" &&
      ts.isArrowFunction(n.initializer.arguments[0])
    ) {
      found.push(n.initializer.arguments[0] as ts.ArrowFunction);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found.length !== 1) throw new Error(`expected one resetCar = useCallback(() => …) in LessonScene, found ${found.length}`);
  const text = found[0].getText(sf);
  const js = ts.transpileModule(`return (${text});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return { text, run: new Function(...RESET_NAMES, `"use strict";\n${js}`) as (...args: unknown[]) => () => void };
}
/** Every name the scene's `resetCar` reads from outside itself. */
const RESET_NAMES = ["simRef", "directorRef", "cabinRef", "gradeGrid"] as const;

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

type LookKind = "left" | "right" | "rear" | "shoulder";

interface LookRun {
  /** Every look the grader's tick carried: the grid point and the mirror. */
  heard: Array<{ k: number; look: LookKind }>;
  pressed: number;
  /** For each press burst: the first grid point not yet graded when the frame
   *  that sampled it ran. */
  firstUngraded: number[];
  steps: number;
  frames: number;
  /** The student's attempt trace as the recorder closed it. */
  trace: ScenarioTrace | null;
  /** The car after each physics step (index = step number). */
  states: Array<{ x: number; y: number; headingDeg: number; speedKmh: number; gear: number; indicator: string }>;
  pendingAtEnd: number;
  /** What the scene's `resetCar`, when it ran, found and left. */
  respawn: {
    pendingBefore: number;
    pendingAfter: number;
    cabinAfter: LookKind | null;
    simResets: number;
    directorResets: number;
    /** The last grid point graded before key R (C-RESETPREVK). */
    lastGraded: number;
  } | null;
}

/**
 * LessonScene's frame with a REAL cabin: presses land in `CabinControls`
 * between frames (the key handlers' `glanceStart`), rapier's stepper records
 * the car, VehicleRig's sample builder takes ONE look
 * (`out.mirrorGlance = cabin.consumeGlanceSample()` — scene/vehicleSample.ts,
 * pinned below), RuntimeDriver runs the clock line and the scene's own call,
 * which is handed the real cabin, a real attempt recorder and the scene's own
 * feed function. `pressBefore(frame)` returns the looks pressed since the
 * previous frame. `respawnBefore` = a frame before which key R is pressed (the
 * scene's own `resetCar`, executed).
 */
function driveLooks(
  c: Cell,
  deltas: readonly number[],
  run: SceneCall,
  pressBefore: (frame: number, stepsSoFar: number) => LookKind[] | null,
  opts: {
    seconds?: number;
    respawnBefore?: number;
    resetCar?: (...args: unknown[]) => () => void;
    /** The shell finalizing inside `onTick`: at this grid point's tick the
     *  attempt trace is closed (`finishTrace`), as `finalizeLessonSession` does. */
    finalizeAtK?: number;
    /** Handed the live world before the first frame; what it returns is told
     *  every grid point's index at that point's tick (C-RESETPREVK). */
    watch?: (world: ReturnType<typeof buildLiveWorld>) => (k: number) => void;
  } = {},
): LookRun {
  return withWindow(() => {
    const world = buildLiveWorld(c.lesson, c.raw);
    const { runtime, traffic, director } = world;
    const watchPoint = opts.watch ? opts.watch(world) : null;
    const gradeGrid = new GradeGrid();
    const steps = new PlayerStepTrackRecorder();
    const sessionClock = new PhysicsSessionClock();
    const cabin = new CabinControls({}, "ready", "off");
    const recorder = createTraceRecorder({ scenarioId: c.lesson.id, kind: "attempt" });
    const tRef = { current: 0 };
    const sample: VehicleSample = createGradeGridSample();
    sample.seatbeltOn = true;
    const p = newPoint();
    const states: LookRun["states"] = [{ x: 0, y: 0, headingDeg: 0, speedKmh: 0, gear: 0, indicator: "off" }];
    const heard: LookRun["heard"] = [];
    const firstUngraded: number[] = [];
    let pressed = 0;
    let closedInTick: ScenarioTrace | null = null;
    const onTick = (tick: SimTick) => {
      const k = Math.round(tick.t / H);
      for (const e of tick.events) if (e.kind === "mirrorGlance") heard.push({ k, look: e.mirror as LookKind });
      if (k === opts.finalizeAtK) closedInTick = recorder.finish();
      watchPoint?.(k);
    };
    const noop = () => {};
    const sim = { steerRad: 0.125, resets: 0, reset() { this.resets++; } };
    const directorRef = { current: { resets: 0, reset() { this.resets++; } } };
    const args: Record<(typeof SCENE_NAMES)[number], unknown> = {
      gradeGrid,
      stepTrackRef: { current: steps },
      tRef,
      sample,
      runtime,
      traffic,
      director,
      conditions: NO_WEATHER,
      inputRef: { current: { rawBrake: 0.9, rawThrottle: 0 } },
      hazardActiveRef: { current: false },
      telltaleLitRef: { current: false },
      onTelltale: noop,
      recorder,
      telltaleCautionLitRef: { current: false },
      onTelltaleCaution: noop,
      onStagedOutcome: noop,
      onTick,
      onNearMiss: noop,
      cabinRef: { current: cabin },
      attemptFeedRef: { current: createAttemptFeedState() },
      feedAttemptPoint,
      simRef: { current: sim },
    };
    const ordered = [...SCENE_NAMES.map((n) => args[n]), NO_PHYSICS_STEPS, vruAheadMeters, directorContactCast];
    const resetCar = opts.resetCar ? opts.resetCar(args.simRef, directorRef, args.cabinRef, gradeGrid) : null;
    let respawn: LookRun["respawn"] = null;
    const dur = Math.min(c.trace.meta.durationSec, opts.seconds ?? Infinity);
    let accumulator = 0;
    let frames = 0;
    while (steps.stepCount * H < dur) {
      const delta = deltas[frames % deltas.length];
      // Between two frames: the key handlers.
      const burst = pressBefore(frames, steps.stepCount);
      if (burst) {
        for (const look of burst) {
          cabin.glanceStart(look);
          cabin.glanceEnd(look);
          pressed++;
        }
      }
      if (resetCar && frames === opts.respawnBefore) {
        const pendingBefore = gradeGrid.pendingLooks;
        const lastGraded = gradeGrid.clock.last;
        resetCar();
        respawn = {
          pendingBefore,
          pendingAfter: gradeGrid.pendingLooks,
          cabinAfter: null,
          simResets: sim.resets,
          directorResets: directorRef.current.resets,
          lastGraded,
        };
        // What the cabin would hand the next frame's sample builder.
        respawn.cabinAfter = cabin.consumeGlanceSample();
      }
      frames++;
      accumulator += Math.min(Math.max(delta, 0), 0.5);
      while (accumulator >= H) {
        const n = steps.stepCount + 1;
        sampleAt(c.trace, Math.min(n * H, c.trace.meta.durationSec), p);
        steps.record(p.x, p.y, p.speedKmh, p.headingDeg);
        states[n] = { x: p.x, y: p.y, headingDeg: p.headingDeg, speedKmh: p.speedKmh, gear: p.gear, indicator: p.indicator };
        accumulator -= H;
      }
      // VehicleRig's frame: the sample builder. A pose the car has on NO grid
      // point (as in §1), the tape's lever and stalk, and ONE look out of the
      // cabin's queue.
      sampleAt(c.trace, Math.min(steps.stepCount * H, c.trace.meta.durationSec), p);
      sample.position.x = p.x + 2;
      sample.position.y = p.y - 2;
      sample.headingDeg = p.headingDeg + 20;
      sample.speedKmh = p.speedKmh + 17;
      sample.indicator = p.indicator;
      sample.gear = p.gear;
      sample.mirrorGlance = cabin.consumeGlanceSample();
      if (burst && burst.length > 0) firstUngraded.push(gradeGrid.clock.last + 1);
      // RuntimeDriver: the clock line, then the call.
      tRef.current = sessionClock.frame(sessionClockAdvance(delta), steps.stepCount);
      run(...ordered);
    }
    return {
      heard,
      pressed,
      firstUngraded,
      steps: steps.stepCount,
      frames,
      trace: opts.finalizeAtK !== undefined ? closedInTick : recorder.finish(),
      states,
      pendingAtEnd: gradeGrid.pendingLooks,
      respawn,
    };
  });
}

describe("§5 ROUND 8 — the scene's own call, EXECUTED with a real cabin: every look is heard, in order, once, one per grid point, on every display", () => {
  const scene = sceneGradeCall();
  const c = cell("sc-jx-giveway-b1", "shadow-correct.trace.json", 1);
  const LOOK_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
    ["60 Hz", [1 / 60]],
    ["120 Hz", [1 / 120]],
    ["144 Hz", [1 / 144]],
    ["90 Hz", [1 / 90]],
    ["60 Hz ± 1 ms", [1 / 60 + 0.001, 1 / 60 - 0.001]],
    ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
    ["0.5 s", [0.5]],
  ];

  it("the sample builder still takes ONE look per frame out of the cabin's queue — the line this section replays", () => {
    const builder = readFileSync(path.join(SRC, "modules/sim/scene/vehicleSample.ts"), "utf-8");
    expect(builder.split("out.mirrorGlance = cabin.consumeGlanceSample();").length - 1).toBe(1);
    expect(builder.split("consumeGlanceSample").length - 1).toBe(1);
  });

  for (const [name, deltas] of LOOK_CADENCES) {
    it(`${name}: two keys pressed inside one frame — both looks reach the grader's ticks, left then right, at consecutive grid points starting at the first point not yet graded`, () => {
      // A two-key press before every 11th frame (every 3rd on a phone's cadence).
      const every = deltas[0] > 0.2 ? 3 : 11;
      const r = driveLooks(c, deltas, scene.run, (f) => (f % every === 2 ? ["left", "right"] : null), { seconds: 12 });
      expect(r.pressed, name).toBeGreaterThanOrEqual(16);
      const bursts = r.pressed / 2;
      // A burst pressed before the last frame may still be waiting; every one
      // before it must have been heard in full.
      expect(r.heard.length + r.pendingAtEnd, `${name}: looks heard + still waiting`).toBe(r.pressed);
      expect(r.pendingAtEnd, name).toBeLessThanOrEqual(1);
      let wrong = 0;
      const complete = Math.floor(r.heard.length / 2);
      expect(complete, name).toBeGreaterThanOrEqual(bursts - 1);
      for (let i = 0; i < complete; i++) {
        const a = r.heard[2 * i];
        const b = r.heard[2 * i + 1];
        if (a.look !== "left" || b.look !== "right" || b.k !== a.k + 1 || a.k !== r.firstUngraded[i]) wrong++;
      }
      expect(wrong, `${name}: two-key presses not heard as left@k, right@k+1 at the first ungraded point`).toBe(0);
    });
  }

  it("four keys inside one frame: heard over four consecutive grid points on a 0.5 s frame as at 60 Hz (the cabin is drained by the frame, not one look per frame)", () => {
    for (const [name, deltas] of [LOOK_CADENCES[0], LOOK_CADENCES[1], LOOK_CADENCES[6], LOOK_CADENCES[5]]) {
      const r = driveLooks(c, deltas, scene.run, (f) => (f === 4 ? ["left", "right", "rear", "shoulder"] : null), { seconds: 12 });
      expect(r.heard.map((x) => x.look), name).toEqual(["left", "right", "rear", "shoulder"]);
      const k0 = r.heard[0].k;
      expect(r.heard.map((x) => x.k - k0), `${name}: grid points after the first look`).toEqual([0, 1, 2, 3]);
    }
  });
});

describe("§5 ROUND 8 — the attempt trace is fed by the scene's call, once per graded grid point, from the car after the step", () => {
  const scene = sceneGradeCall();
  // A reverse park: the rubric's observation moments are scored from this trace.
  const c = cell("sc-park-perp-rev", "shadow-correct.trace.json", 1);
  const press = (f: number, stepsSoFar: number): LookKind[] | null => {
    void f;
    // A look at the tape's own instants (on the grid), pressed in the frame
    // that reaches them — see `looksOfTape`.
    return looksDue(stepsSoFar);
  };
  let due: Array<{ k: number; look: LookKind }> = [];
  let dueIdx = 0;
  /** The tape's looks whose grid point the engine has reached (the press is
   *  made «before the frame after» that step — a 60 Hz driver's timing). */
  function looksDue(stepsSoFar: number): LookKind[] | null {
    const out: LookKind[] = [];
    while (dueIdx < due.length && due[dueIdx].k <= stepsSoFar + 1) out.push(due[dueIdx++].look);
    return out.length > 0 ? out : null;
  }
  function run(deltas: readonly number[]) {
    due = c.trace.events
      .filter((e) => e.kind.startsWith("glance-"))
      .map((e) => ({ k: Math.round(e.tSec / H), look: e.kind.slice("glance-".length) as LookKind }));
    dueIdx = 0;
    return driveLooks(c, deltas, scene.run, press);
  }

  it("60 Hz: one sample per grid point decimated to 20 Hz, stamped k·FIXED_DT, at the car AFTER the step — never this frame's sample — with the lever and the stalk the grader read there", () => {
    const r = run([1 / 60]);
    expect(r.trace, "the scene's call fed the attempt trace").not.toBeNull();
    const trace = r.trace as ScenarioTrace;
    // The ring keeps every third grid point: 1, 4, 7, …; the trace is rebased
    // on its first sample (grid point 1).
    expect(trace.samples.length).toBeGreaterThan(300);
    let offGrid = 0;
    let notTheStep = 0;
    let notEveryThird = 0;
    for (let i = 0; i < trace.samples.length; i++) {
      const s = trace.samples[i];
      const k = Math.round((s.tSec + H) / H);
      if (Math.abs(s.tSec + H - k * H) > 1e-9) offGrid++;
      if (k !== 1 + 3 * i) notEveryThird++;
      const st = r.states[k];
      if (!st || s.x !== st.x || s.y !== st.y || s.headingDeg !== st.headingDeg || s.speedKmh !== st.speedKmh || s.gear !== st.gear || s.indicator !== st.indicator) notTheStep++;
    }
    expect({ offGrid, notEveryThird, notTheStep }).toEqual({ offGrid: 0, notEveryThird: 0, notTheStep: 0 });
    // The frame's controls ride along: the steering angle and the pedal flags.
    expect(new Set(trace.samples.map((s) => `${s.steerRad}|${s.brakeOn}|${s.throttleOn}`))).toEqual(new Set(["0.125|true|false"]));
    // The looks in the trace are the looks the grader heard, at the grid point
    // that heard them.
    const glances = trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(glances.map((e) => `${e.kind.slice(7)}@${Math.round((e.tSec + H) / H)}`)).toEqual(r.heard.map((h) => `${h.look}@${h.k}`));
    expect(r.heard.length).toBe(r.pressed);
    expect(r.heard.length).toBeGreaterThanOrEqual(3);
  });

  it("the tick that ENDS the session closes the trace before its own point is pushed (the shell finalizes inside `onTick`): the trace closed at tick k ends on the kept sample before k, on every cadence", () => {
    // Grid point 601 is one the ring keeps (1, 4, 7, …). Base fed the recorder
    // at the end of the frame, after the tick; the grid feed keeps that order
    // per point — a feed made BEFORE the tick would put point 601 itself into
    // the trace of a session that ended on it.
    for (const [name, deltas] of [
      ["60 Hz", [1 / 60]],
      ["120 Hz", [1 / 120]],
      ["0.5 s", [0.5]],
    ] as const) {
      due = [];
      dueIdx = 0;
      const r = driveLooks(c, deltas, scene.run, () => null, { seconds: 12, finalizeAtK: 601 });
      expect(r.trace, name).not.toBeNull();
      const samples = (r.trace as ScenarioTrace).samples;
      const lastK = Math.round((samples[samples.length - 1].tSec + H) / H);
      expect(lastK, `${name}: the last grid point in a trace closed by the tick of point 601`).toBe(598);
      expect(samples.length, name).toBe(200);
    }
  });

  it("the SAME trace on every display of 60 Hz or faster, sample for sample and look for look; on a phone's frames the samples are still the same grid points with the car where its step left it", () => {
    const ref = run([1 / 60]).trace as ScenarioTrace;
    // On a long frame the lever and the stalk are the FRAME's at every point
    // inside it (the cabin is read once per frame — disclosed); the car is not.
    const line = (t: ScenarioTrace, cabin: boolean) =>
      t.samples.map((s) => `${s.tSec.toFixed(9)}|${s.x}|${s.y}|${s.headingDeg}|${s.speedKmh}${cabin ? `|${s.gear}|${s.indicator}` : ""}`);
    const looks = (t: ScenarioTrace) => t.events.filter((e) => e.kind.startsWith("glance-")).map((e) => `${e.kind}@${e.tSec.toFixed(9)}`);
    const signals = (t: ScenarioTrace) => t.events.filter((e) => e.kind.startsWith("signal-")).map((e) => `${e.kind}:${e.detail ?? ""}@${e.tSec.toFixed(9)}`);
    for (const [name, deltas, sameLooks] of [
      ["120 Hz", [1 / 120], true],
      ["144 Hz", [1 / 144], true],
      ["90 Hz", [1 / 90], true],
      ["0.5 s", [0.5], false],
      ["phone B", [...W69.slice(7), ...W69.slice(0, 7)], false],
    ] as const) {
      const t = run(deltas).trace as ScenarioTrace;
      expect(t, name).not.toBeNull();
      // The run stops on the frame that reaches the tape's end, so a long
      // frame may carry a few more points: compare what both have.
      const n = Math.min(t.samples.length, ref.samples.length);
      expect(n, name).toBeGreaterThan(300);
      const a = line(t, sameLooks).slice(0, n);
      const b = line(ref, sameLooks).slice(0, n);
      const firstDiff = a.findIndex((x, i) => x !== b[i]);
      expect(firstDiff < 0 ? "same" : `${name}: sample ${firstDiff}: ${a[firstDiff]} vs 60 Hz ${b[firstDiff]}`).toBe("same");
      if (sameLooks) {
        expect(signals(t), `${name}: indicator edges`).toEqual(signals(ref));
        expect(looks(t), `${name}: the looks in the trace`).toEqual(looks(ref));
      } else expect(looks(t).length, `${name}: every look is in the trace`).toBe(looks(ref).length);
    }
  });
});

describe("§5 ROUND 8 — a respawn: the scene's own `resetCar`, EXECUTED — nothing pending crosses it", () => {
  const scene = sceneGradeCall();
  const reset = sceneResetCar();
  const c = cell("sc-jx-giveway-b1", "shadow-correct.trace.json", 1);

  it("`resetCar` was found, and reads only the four things this file hands it", () => {
    expect(reset.text.startsWith("() => {")).toBe(true);
    expect(reset.text).toContain("gradeGrid.reset()");
    let thrown: unknown = null;
    try {
      withWindow(() => {
        const cabin = new CabinControls({}, "ready", "off");
        reset.run({ current: { reset() {} } }, { current: { reset() {} } }, { current: cabin }, new GradeGrid())();
        reset.run({ current: null }, { current: null }, { current: null }, new GradeGrid())();
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown, "the scene's resetCar must run on the names RESET_NAMES supplies").toBeNull();
  });

  it("looks pressed BEFORE key R — two already in the grid's queue, two still in the cabin — are not heard after it; the car and the staged cast are reset as before", () => {
    // 240 Hz: three frames in four bring no grid point (frames 40, 41, 42 here;
    // frame 43 brings point 11). A look before frame 41, one before frame 42,
    // two keys before frame 43 — and key R right behind them, before frame 43.
    const press = (f: number): LookKind[] | null =>
      f === 41 ? ["left"] : f === 42 ? ["right"] : f === 43 ? ["rear", "shoulder"] : null;
    const control = driveLooks(c, [1 / 240], scene.run, press, { seconds: 3 });
    // Without a respawn all four are heard, in order, at points 11 … 14.
    expect(control.heard).toEqual([
      { k: 11, look: "left" },
      { k: 12, look: "right" },
      { k: 13, look: "rear" },
      { k: 14, look: "shoulder" },
    ]);
    const r = driveLooks(c, [1 / 240], scene.run, press, { seconds: 3, respawnBefore: 43, resetCar: reset.run });
    expect(r.respawn).not.toBeNull();
    // Teeth: at the respawn the grid really was holding looks, and the cabin
    // really did have one it had not handed over.
    expect(r.respawn!.pendingBefore, "looks waiting in the grid at the respawn").toBe(2);
    expect(r.respawn!.pendingAfter, "looks waiting in the grid after `resetCar`").toBe(0);
    expect(r.respawn!.cabinAfter, "a look still latched in the cabin after `resetCar`").toBeNull();
    expect({ sim: r.respawn!.simResets, director: r.respawn!.directorResets }).toEqual({ sim: 1, director: 1 });
    // None of the four — all pending at the respawn — is heard in the drive after.
    expect(r.heard, "looks made before the respawn, heard after it").toEqual([]);
    // A look made AFTER the respawn is heard as ever.
    const after = driveLooks(c, [1 / 240], scene.run, (f) => press(f) ?? (f === 60 ? ["rear"] : null), {
      seconds: 3,
      respawnBefore: 43,
      resetCar: reset.run,
    });
    expect(after.heard.map((x) => x.look)).toEqual(["rear"]);
  });

  it("a near-miss window open at key R is forgotten by the scene's `resetCar`: the squeeze the car was lifted out of is not reported as a pass", () => {
    const V = 10;
    const car = { id: 7, x: CHASSIS_HALF_EXTENTS.x + NEAR_CAR.halfWidthM + 0.3, y: 30, dirX: 0, dirY: -1, speedMps: V };
    function squeeze(useReset: boolean) {
      car.y = 30;
      const world = {
        runtime: {
          update() {},
          sample: (v: VehicleSample, t: number): SimTick =>
            ({ t, position: { x: v.position.x, y: v.position.y }, events: [] }) as unknown as SimTick,
          signalPhase: () => "green" as const,
        },
        traffic: {
          update(_dt: number, ctx: { sessionTimeSec?: number }) {
            car.y = 30 - V * (ctx.sessionTimeSec ?? NaN);
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
      const resetCar = reset.run({ current: { reset() {} } }, { current: null }, { current: null }, grid);
      const events: number[] = [];
      const RESPAWN = 90;
      const hooks: GradeGridHooks = {
        student: (k, tSec, out) => {
          out.position.x = k >= RESPAWN ? 500 : 0;
          out.position.y = k >= RESPAWN ? 500 : V * tSec;
          out.headingDeg = 0;
          out.speedKmh = V * 3.6;
          return 0;
        },
        onPoint: () => {},
        nearMiss: (e) => events.push(Math.round(e.tSec / H)),
      };
      for (let k = 1; k <= 200; k++) {
        if (useReset && k === RESPAWN) resetCar();
        grid.stepFrame(k * H, null, world, NO_WEATHER, hooks);
      }
      return events;
    }
    // Lifted out of the squeeze with no reset, the open window «resolves».
    expect(squeeze(false)).toEqual([90]);
    expect(squeeze(true), "a near miss reported for an encounter that was pending at the respawn").toEqual([]);
  });

  it("C-RESETPREVK — the grade's step memory runs ON through a respawn: the first grid point after the scene's `resetCar` is one step after the last one (dtSec = 1/60), and the signal clock, the traffic and the director advance by that one step — the same world, point for point, as the same drive with no respawn", () => {
    /** What the world was handed and where it stood at one grid point. */
    interface WorldAt {
      k: number;
      /** The dt each clock was advanced by for this point: the signal
       *  controller (`runtime.update`), the traffic agents
       *  (`traffic.update`) and the director's reaction clocks
       *  (`director.step`). */
      dt: { signal: number; traffic: number; director: number };
      /** Every signal cluster's phase and time to change — read off the
       *  runtime's own signal clock, not summed from the dts above. */
      signals: string;
      /** Every vehicle and pedestrian, staged ones included: id, pose, speed. */
      agents: string;
    }
    const watchWorld = (out: WorldAt[]) => (w: ReturnType<typeof buildLiveWorld>) => {
      const { runtime, traffic, director } = w;
      if (director === null) throw new Error("the cell must stage actors: the director's clock is watched");
      const nodes = runtime.debugSignalClusters().map((cl) => cl.memberNodeIds[0]);
      if (nodes.length === 0) throw new Error("the cell's district must have signals: the signal clock is watched");
      const dt = { signal: NaN, traffic: NaN, director: NaN };
      const update = runtime.update.bind(runtime);
      runtime.update = (d: number) => {
        dt.signal = d;
        update(d);
      };
      const trafficUpdate = traffic.update.bind(traffic);
      traffic.update = (d: number, ctx: Parameters<typeof trafficUpdate>[1]) => {
        dt.traffic = d;
        trafficUpdate(d, ctx);
      };
      const directorStep = director.step.bind(director);
      director.step = (input: Parameters<typeof directorStep>[0]) => {
        dt.director = input.dtSec;
        return directorStep(input);
      };
      return (k: number) => {
        out.push({
          k,
          dt: { ...dt },
          signals: nodes
            .map((n) => {
              const info = runtime.signalPhaseInfo(n);
              return `${info.phase}:${info.timeToChangeSec.toFixed(9)}`;
            })
            .join(" "),
          agents: JSON.stringify([snapAgents(traffic.vehicles), snapAgents(traffic.pedestrians)]),
        });
      };
    };
    // [cadence, frame deltas, the frame before which key R is pressed]: on
    // each, well into the session (more than half a second graded).
    const RESPAWN_CADENCES: ReadonlyArray<readonly [string, readonly number[], number]> = [
      ["60 Hz", [1 / 60], 90],
      ["120 Hz", [1 / 120], 180],
      ["0.5 s", [0.5], 3],
      ["phone B", [...W69.slice(7), ...W69.slice(0, 7)], 3],
    ];
    // A lesson with a signal (its plan armed) and two staged actors, so every
    // clock the grade's step memory drives is there to be watched.
    const sig = cell("sc-turn-left-oncoming", "shadow-correct.trace.json", 1);
    const noLooks = () => null;
    for (const [name, fd, before] of RESPAWN_CADENCES) {
      const control: WorldAt[] = [];
      driveLooks(sig, fd, scene.run, noLooks, { seconds: 4, watch: watchWorld(control) });
      const respawned: WorldAt[] = [];
      const r = driveLooks(sig, fd, scene.run, noLooks, {
        seconds: 4,
        respawnBefore: before,
        resetCar: reset.run,
        watch: watchWorld(respawned),
      });
      // Teeth: key R really was pressed, with half a second of the session
      // graded before it, and points were graded after it.
      expect(r.respawn, `${name}: the respawn ran`).not.toBeNull();
      const last = r.respawn!.lastGraded;
      expect(last, `${name}: grid points graded before key R`).toBeGreaterThan(30);
      const firstAfter = respawned.find((w) => w.k > last);
      expect(firstAfter, `${name}: a grid point graded after key R`).toBeDefined();
      // THE FIRST POINT AFTER THE RESPAWN: the next grid index, one step of
      // every clock — never the session so far.
      expect(
        { k: firstAfter!.k, dt: firstAfter!.dt },
        `${name}: the first grid point after key R (the last graded before it was ${last})`,
      ).toEqual({ k: last + 1, dt: { signal: H, traffic: H, director: H } });
      // …and every point of the drive: one step each, the same signal clock
      // and the same traffic as the drive with no respawn (`resetCar` drops
      // what was pending; it moves no clock).
      expect(respawned.map((w) => w.k), `${name}: the grid points graded`).toEqual(control.map((w) => w.k));
      const notOneStep = respawned.filter((w) => w.dt.signal !== H || w.dt.traffic !== H || w.dt.director !== H);
      expect(notOneStep.map((w) => `point ${w.k}: ${JSON.stringify(w.dt)}`), `${name}: points whose clocks did not advance by one step`).toEqual([]);
      const firstDiff = respawned.findIndex((w, i) => w.signals !== control[i].signals || w.agents !== control[i].agents);
      expect(
        firstDiff < 0 ? null : `point ${respawned[firstDiff].k}: signals ${respawned[firstDiff].signals} vs ${control[firstDiff].signals} with no respawn`,
        `${name}: the first grid point whose signal clock or traffic differs from the drive with no respawn`,
      ).toBeNull();
    }
  });
});
