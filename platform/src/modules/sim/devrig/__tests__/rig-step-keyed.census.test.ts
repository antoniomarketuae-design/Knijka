/**
 * ADR-017 — THE DRIVE RIG IS REFERENCED TO THE PHYSICS STEP: the INPUT-COMMAND
 * CENSUS.
 *
 * WHAT WAS WRONG. The rig decided at every graded grid point (`onTick`, from
 * inside the grade loop) and its command was applied per DISPLAY FRAME: rapier
 * had already run the frame's n steps, so only the last point's decision
 * survived on the pad, from the NEXT frame. On the headless phone lens (frames
 * of 269–792 ms) that delayed a rig pedal by up to a frame and moved two
 * roundabout drives across a rule edge (sc-rb-busy-gap:7bbdd45e,
 * sc-roundabout-entry:08a0b701).
 *
 * WHAT IS MEASURED HERE, in process, no browser. The rig's REAL pad, the REAL
 * `stepDriveScript`, the REAL `SimInput` → `GatedSimInput` read (exported from
 * LessonScene for exactly this), the REAL `applyDifficulty`, the REAL
 * `VehicleSim` under headless rapier, the REAL `recordPhysicsStep` →
 * `PlayerStepTrackRecorder` and the REAL `SessionGridClock` — driven by a frame
 * model that is @react-three/rapier's stepper line for line (clamp 0.5 s,
 * accumulator, steps of 1/60 s, every before-step reading the input), with the
 * render-rate reads (VehicleRig's frame read, HeroCarBody, the cluster) after
 * the steps and the grade (`onTick` once per new grid point) after those. The
 * applied throttle / brake / steer is recorded at EVERY physics step, as the
 * product read it.
 *
 * THE CLAIMS (each one an assertion below, each one red under a sabotage):
 *   D-2  identical applied pedal/steer sequences on every cadence (60 Hz, 30 Hz,
 *        144 Hz, a desktop jitter, the recorded w69 phone deltas with their
 *        7.5 s stall, a 2 fps lens), and the car's states with them;
 *   D-2  EXACT: step k+1 applies the decision taken on the state after step k
 *        (an oracle recomputes every decision from the recorded states);
 *   ANCHOR at one step per frame, BIT-IDENTICAL to the pre-ADR-017 rig (its
 *        `advance()` transcribed below from rig.ts@59be0de:555-574);
 *   START a named start step makes the drive independent of WHEN the arming
 *        call lands, jittered across frames and inside one;
 *   GATE the rig's command cannot reach physics around GatedSimInput: the
 *        pre-drive gate zeroes it, the raw capture sees it, the latch fires,
 *        the reverse remap swaps it;
 *   A15 a pause, a hidden tab, a long stall and a window blur apply no input
 *        twice and move nothing;
 *   D-3 script KEY edges stay frame-timed — stated, and measured as such.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GatedSimInput } from "@/components/sim/LessonScene";
import { applyTick, createLessonSession } from "../../lessons/engine";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { PlayerStepTrackRecorder, recordPhysicsStep, SessionGridClock, type PhysicsStepState } from "../../traffic";
import { applyDifficulty, createDriveAssistState, DEFAULT_DIFFICULTY } from "../../vehicle/difficulty";
import { READY_DRIVELINE } from "../../vehicle/driveline";
import { FIXED_DT, GRAVITY } from "../../vehicle/tuning";
import { createHeadlessChassis, VehicleSim } from "../../vehicle/VehicleSim";
import { createDriveScript, stepDriveScript, type DriveCommand, type DriveScriptState, type DriveStep } from "../driveScript";
import { DriveRig, readRigStepSource, type DriveRigStart, type RigStepSource, type RigStepSourceHost } from "../rig";

// ---------------------------------------------------------------------------
// Cadences (frame deltas, s)
// ---------------------------------------------------------------------------

/** w69-h1-mob sc-roundabout-entry__mobile-right frame deltas, ms — the phone
 *  the rows were filed from, verbatim from
 *  lessons/scenario/__tests__/grade-grid-cadence.census.test.ts (a 7.5 s stall). */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);
/** A desktop jitter mix (w69 pc-right excerpt, a 983 ms hitch included). */
const PC_JITTER = [
  11, 17, 12, 20, 14, 33, 10, 35, 10, 17, 12, 19, 13, 36, 31, 44, 33, 14, 12, 34, 13, 21, 12, 20, 14, 20, 29,
  34, 161, 983,
].map((m) => m / 1000);

const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["30 Hz", [1 / 30]],
  ["144 Hz", [1 / 144]],
  ["desktop jitter", PC_JITTER],
  ["w69 phone A", W69],
  ["w69 phone B", [...W69.slice(61), ...W69.slice(0, 61)]], // the 7.5 s stall first
  ["2 fps lens", [0.5]],
];

// ---------------------------------------------------------------------------
// A browser, as far as SimInput and the rig touch one
// ---------------------------------------------------------------------------

const g = globalThis as unknown as Record<string, unknown>;
const nav = globalThis.navigator as unknown as Record<string, unknown>;
let priorWindow: unknown;
let priorKeyboardEvent: unknown;
let priorGetGamepads: unknown;

class StubKeyboardEvent extends Event {
  readonly code: string;
  readonly key: string;
  readonly repeat = false;
  constructor(type: string, init: { code: string; key?: string }) {
    super(type);
    this.code = init.code;
    this.key = init.key ?? "";
  }
}

beforeAll(async () => {
  await RAPIER.init();
  priorWindow = g.window;
  priorKeyboardEvent = g.KeyboardEvent;
  priorGetGamepads = nav.getGamepads;
  g.KeyboardEvent = StubKeyboardEvent;
  // No real pad: the platform's getGamepads, as the rig finds it.
  Object.defineProperty(nav, "getGamepads", { configurable: true, writable: true, value: () => [] });
});

afterAll(() => {
  g.window = priorWindow;
  g.KeyboardEvent = priorKeyboardEvent;
  if (priorGetGamepads === undefined) delete nav.getGamepads;
  else Object.defineProperty(nav, "getGamepads", { configurable: true, writable: true, value: priorGetGamepads });
});

// ---------------------------------------------------------------------------
// The lesson the ticks are graded against (no pre-drive; nowhere to arrive)
// ---------------------------------------------------------------------------

const LESSON: LessonSpec = {
  id: "t-rig-step-keyed",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [{ id: "o-far", titleBg: "Далеч", kind: "reachZone", params: { x: 99999, y: 99999, radiusM: 5 } }],
};

function tickAt(t: number, st: PhysicsStepState): SimTick {
  return {
    t,
    speedKmh: st.speedKmh,
    maxSpeedKmh: 90,
    position: { x: st.x, y: st.y },
    headingDeg: st.headingDeg,
    laneOffsetM: 0,
    laneId: 0,
    edgeId: null,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
  };
}

// ---------------------------------------------------------------------------
// The pre-ADR-017 rig, for the anchor — `advance()` transcribed from
// rig.ts@59be0de:555-574 and `SyntheticPad.set` from :332-344. It decides in
// the grade loop, per point, and the pad holds the last decision.
// ---------------------------------------------------------------------------

class BaseRig {
  private script: DriveScriptState | null = null;
  command: DriveCommand = { throttle: 0, brake: 0, steer: 0 };
  readonly buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  readonly axes = [0, 0, 0, 0];
  readonly pad = {
    id: "base",
    index: 0,
    connected: true,
    mapping: "standard" as const,
    timestamp: 0,
    axes: this.axes,
    buttons: this.buttons,
  };
  private pendingAutorun: readonly DriveStep[] | null = null;
  lastT: number | null = null;
  /** The sample columns the old rig recorded at each point (command before advance). */
  readonly cols: DriveCommand[] = [];

  autorun(steps: readonly DriveStep[]): void {
    this.pendingAutorun = steps;
  }
  run(steps: readonly DriveStep[], tSec?: number): void {
    this.script = createDriveScript(steps, tSec ?? this.lastT ?? 0);
    this.set({ throttle: 0, brake: 0, steer: 0 });
  }
  onTick(tick: SimTick): void {
    this.cols.push({ ...this.command });
    this.lastT = tick.t;
    if (this.pendingAutorun !== null) {
      const s = this.pendingAutorun;
      this.pendingAutorun = null;
      this.run(s, tick.t);
    }
    if (this.script === null) return;
    const res = stepDriveScript(this.script, { t: tick.t, speedKmh: tick.speedKmh, x: tick.position.x, y: tick.position.y });
    this.script = res.state;
    this.set(res.state.finished ? { throttle: 0, brake: 0, steer: 0 } : res.command);
  }
  private set(cmd: DriveCommand): void {
    this.command = cmd;
    this.buttons[7]!.value = cmd.throttle;
    this.buttons[7]!.pressed = cmd.throttle > 0.05;
    this.buttons[6]!.value = cmd.brake;
    this.buttons[6]!.pressed = cmd.brake > 0.05;
    this.axes[0] = cmd.steer === 0 ? 0 : -Math.sign(cmd.steer) * Math.max(0.13, Math.abs(cmd.steer));
  }
}

// ---------------------------------------------------------------------------
// The frame model — @react-three/rapier's stepper, line for line
// ---------------------------------------------------------------------------

interface Applied {
  /** What GatedSimInput.read() returned to the before-step (after the gate). */
  throttle: number;
  brake: number;
  steer: number;
  /** GatedSimInput's raw capture on that read (after the remap, before the gate). */
  rawThrottle: number;
  rawBrake: number;
  rawSteer: number;
}

interface KeyEdge {
  type: string;
  code: string;
  /** The grid point being graded when it was dispatched (-1: outside the grade). */
  gradingK: number;
  /** Physics steps already taken when it was dispatched. */
  stepCount: number;
}

interface DriveOpts {
  frames: readonly number[];
  steps: readonly DriveStep[];
  /** Total physics steps to run. */
  totalSteps: number;
  /** The rig under test, or the pre-ADR-017 one. */
  rig: "new" | "base";
  /** How the script is armed. */
  arm:
    | { kind: "autorun"; start?: DriveRigStart }
    | { kind: "call"; start: DriveRigStart; afterFrame: number; phase?: "between" | "afterSteps" | "afterRenderReads" };
  /** Render-rate reads per frame (VehicleRig + HeroCarBody + cluster = 3). */
  renderReads?: (frame: number) => number;
  /** Physics steps during which GatedSimInput.driveLocked is set. */
  lockedSteps?: (step: number) => boolean;
  /** Physics steps (1-based) during which the reverse remap is on, source "assist". */
  remapSteps?: (step: number) => boolean;
  /** Frames (indices) that are PAUSED: render reads only, no steps, no grade. */
  pausedFrames?: (frame: number) => boolean;
  /** Dispatch a window blur before this frame. */
  blurBeforeFrame?: number;
}

interface DriveResult {
  applied: Applied[];
  states: PhysicsStepState[];
  /** Rig sample pedal columns per graded point (new rig: dump; base: its cols). */
  cols: DriveCommand[];
  keyEdges: KeyEdge[];
  startStep: number | null;
  lateDecisions: number;
  readErrors: number;
  blocked: boolean[];
  /** The script's transition log (why each step ended). */
  log: { label: string; reason: string; endedAtSec: number }[];
}

const H = FIXED_DT;

function drive(o: DriveOpts): DriveResult {
  // -- the browser
  // rapier's wasm-bindgen glue reads `window.performance` once a `window` exists.
  const win = Object.assign(new EventTarget(), { performance: globalThis.performance }) as EventTarget & RigStepSourceHost;
  g.window = win;
  const keyEdges: KeyEdge[] = [];
  let gradingK = -1;

  // -- the world: VehicleSim on headless rapier, the step record, the grid clock
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = H;
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body);
  const rec = new PlayerStepTrackRecorder();
  const clock = new SessionGridClock();
  // The view LessonScene publishes (a READ view: no record, no advance).
  const source: RigStepSource = {
    steps: { get stepCount() { return rec.stepCount; }, stateAtStep: (n, out) => rec.stateAtStep(n, out) },
    clock: { timeOf: (k) => clock.timeOf(k), indexAt: (t) => clock.indexAt(t), stepSec: clock.stepSec },
  };
  win.__rigStepSource = source;

  // -- the rig
  const base = o.rig === "base" ? new BaseRig() : null;
  const rig =
    o.rig === "new"
      ? new DriveRig({
          lessonId: LESSON.id,
          lessonTitleBg: LESSON.titleBg,
          ...(o.arm.kind === "autorun" ? { autorun: o.steps, autorunStart: o.arm.start ?? 1 } : {}),
        })
      : null;
  if (base !== null) {
    Object.defineProperty(nav, "getGamepads", { configurable: true, writable: true, value: () => [base.pad] });
    if (o.arm.kind === "autorun") base.autorun(o.steps);
  }
  if (rig !== null) rig.publish();

  // -- the input, as LessonScene makes it
  const input = new GatedSimInput();
  win.addEventListener("keydown", (e) =>
    keyEdges.push({ type: "keydown", code: (e as StubKeyboardEvent).code, gradingK, stepCount: rec.stepCount }),
  );
  win.addEventListener("keyup", (e) =>
    keyEdges.push({ type: "keyup", code: (e as StubKeyboardEvent).code, gradingK, stepCount: rec.stepCount }),
  );
  const assist = createDriveAssistState();

  let session = createLessonSession(LESSON);
  const applied: Applied[] = [];
  const states: PhysicsStepState[] = [];
  const blocked: boolean[] = [];
  const span = { first: 0, last: -1 };
  let acc = 0;
  let startStep: number | null = null;
  const scratch: PhysicsStepState = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };

  const armNow = () => {
    if (o.arm.kind !== "call") return;
    if (rig !== null) startStep = rig.handle.run(o.steps, { startAt: o.arm.start }).startStep;
    else if (base !== null) base.run(o.steps);
  };

  for (let f = 0; rec.stepCount < o.totalSteps; f++) {
    if (o.arm.kind === "call" && o.arm.afterFrame === f && (o.arm.phase ?? "between") === "between") armNow();
    if (o.blurBeforeFrame === f) win.dispatchEvent(new Event("blur"));
    const delta = o.frames[f % o.frames.length]!;
    const paused = o.pausedFrames?.(f) === true;
    if (!paused) {
      // rapier: clampedDelta = clamp(dt, 0, 0.5); accumulator += …; while (acc >= timeStep) stepWorld
      acc += Math.min(Math.max(delta, 0), 0.5);
      while (acc >= H && rec.stepCount < o.totalSteps) {
        const stepNo = rec.stepCount + 1;
        input.driveLocked = o.lockedSteps?.(stepNo) === true;
        const remap = o.remapSteps?.(stepNo) === true;
        if (remap !== input.reversePedalRemap) {
          input.reversePedalRemapSource = "assist";
          input.reversePedalRemap = remap;
        }
        // VehicleRig useBeforePhysicsStep: read → applyDifficulty → sim.update
        const raw = input.read();
        applied.push({
          throttle: raw.throttle,
          brake: raw.brake,
          steer: raw.steer,
          rawThrottle: input.rawThrottle,
          rawBrake: input.rawBrake,
          rawSteer: input.rawSteer,
        });
        blocked.push(input.consumeBlockedDriveAttempt());
        const shaped = applyDifficulty(raw, DEFAULT_DIFFICULTY, sim.speedKmh, H, assist);
        sim.update(shaped, H, READY_DRIVELINE);
        world.step();
        // VehicleRig useAfterPhysicsStep
        recordPhysicsStep(rec, body, sim);
        rec.stateAtStep(rec.stepCount, scratch);
        states.push({ ...scratch });
        acc -= H;
      }
    }
    if (o.arm.kind === "call" && o.arm.afterFrame === f && o.arm.phase === "afterSteps") armNow();
    // Render-rate reads: VehicleRig's frame read, HeroCarBody, the cluster.
    const reads = o.renderReads?.(f) ?? 3;
    for (let i = 0; i < reads; i++) input.read();
    if (o.arm.kind === "call" && o.arm.afterFrame === f && o.arm.phase === "afterRenderReads") armNow();
    if (paused) continue;
    // RuntimeDriver: gradeGrid.stepPhysics — one point per new step, after the steps.
    clock.advanceSteps(rec.stepCount - clock.last, span);
    for (let k = span.first; k <= span.last; k++) {
      if (!rec.stateAtStep(k, scratch)) throw new Error(`step ${k} not held`);
      const tick = tickAt(clock.timeOf(k), scratch);
      const step = applyTick(session, tick);
      session = step.state;
      gradingK = k;
      if (rig !== null) rig.onTick(tick, step);
      if (base !== null) base.onTick(tick);
      gradingK = -1;
    }
  }

  const status = rig?.handle.status();
  const log = (status?.log ?? []).map((l) => ({ label: l.label, reason: l.reason, endedAtSec: l.endedAtSec }));
  const cols = rig !== null ? rig.handle.dump().samples.map((s) => ({ throttle: s.throttle, brake: s.brake, steer: s.steer })) : base!.cols;
  rig?.dispose();
  input.dispose();
  world.free();
  Object.defineProperty(nav, "getGamepads", { configurable: true, writable: true, value: () => [] });
  return {
    applied,
    states,
    cols,
    keyEdges,
    startStep: startStep ?? status?.startStep ?? null,
    lateDecisions: status?.lateDecisions ?? 0,
    readErrors: status?.readErrors ?? 0,
    blocked,
    log,
  };
}

/** The first step at which two applied sequences differ, in words; null if none. */
function firstDiff(a: readonly Applied[], b: readonly Applied[], n: number): string | null {
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return `step ${i + 1}: missing (${a.length} vs ${b.length} steps)`;
    if (x.throttle !== y.throttle || x.brake !== y.brake || x.steer !== y.steer) {
      return `step ${i + 1}: applied ${JSON.stringify([x.throttle, x.brake, x.steer])} vs ${JSON.stringify([y.throttle, y.brake, y.steer])}`;
    }
  }
  return null;
}

/** The first step whose car state differs; null if none. */
function firstStateDiff(a: readonly PhysicsStepState[], b: readonly PhysicsStepState[], n: number): string | null {
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.x !== y.x || x.y !== y.y || x.speedKmh !== y.speedKmh || x.headingDeg !== y.headingDeg) {
      return `step ${i + 1}: car ${JSON.stringify(x)} vs ${JSON.stringify(y)}`;
    }
  }
  return null;
}

/** The pad mapping SimInput applies to a command (deadzone push, sign flip twice). */
const padSteer = (s: number): number => (s === 0 ? 0 : Math.sign(s) * Math.max(0.13, Math.abs(s)));

/**
 * THE ORACLE — D-2 written as arithmetic: from the recorded car states, the
 * decision at every count c ≥ the start, taken ONCE, in order; step c+1 must
 * apply exactly that (before the gate: the raw capture). Before the start the
 * pad is idle.
 */
function oracleMismatch(r: DriveResult, steps: readonly DriveStep[], start: number): string | null {
  let st = createDriveScript(steps, start * H);
  for (let i = 0; i < r.applied.length; i++) {
    const stepNo = i + 1;
    const c = stepNo - 1; // the count step `stepNo` read the pad at
    let want: DriveCommand = { throttle: 0, brake: 0, steer: 0 };
    if (c >= start && c >= 1) {
      const s = r.states[c - 1]!;
      const res = stepDriveScript(st, { t: c * H, speedKmh: s.speedKmh, x: s.x, y: s.y });
      st = res.state;
      want = res.state.finished ? { throttle: 0, brake: 0, steer: 0 } : res.command;
    }
    const a = r.applied[i]!;
    if (a.rawThrottle !== want.throttle || a.rawBrake !== want.brake || a.rawSteer !== padSteer(want.steer)) {
      return (
        `step ${stepNo} applied ${JSON.stringify([a.rawThrottle, a.rawBrake, a.rawSteer])} but the decision ` +
        `from the state after step ${c} is ${JSON.stringify([want.throttle, want.brake, padSteer(want.steer)])}`
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The script — closed loop, every controller branch, the aliasing pulse
// ---------------------------------------------------------------------------

/** Where the car is after 3 s of „go" at 60 Hz, and which way it faces —
 *  so the stop point is COPIED from the product car, not guessed. */
function stopPoint(): { x: number; y: number } {
  const probe = drive({
    frames: [1 / 60],
    steps: [{ label: "go", speedKmh: 30, forSec: 3 }],
    totalSteps: 181,
    rig: "new",
    arm: { kind: "autorun", start: 1 },
  });
  const s = probe.states[180]!;
  const rad = (s.headingDeg * Math.PI) / 180;
  return { x: s.x + Math.sin(rad) * 18, y: s.y + Math.cos(rad) * 18 };
}

let SCRIPT: DriveStep[] = [];
const TOTAL = 60 * 13;

beforeAll(() => {
  SCRIPT = [
    { label: "go", speedKmh: 30, forSec: 3 },
    { label: "stop at", speedKmh: 30, stopAt: stopPoint(), withinM: 2 },
    // A pulsed wait: ON 0.22 s / OFF 0.12 s — shorter than a phone frame.
    { label: "wait", speedKmh: 0, forSec: 1.6 },
    { label: "turn", speedKmh: 15, forSec: 2.5, steer: 0.4, keys: ["KeyQ"] },
    { label: "halt", speedKmh: 0, forSec: 1, holdBrake: true },
  ];
});

// ---------------------------------------------------------------------------

describe("ADR-017 D-2 — the rig's applied command is a function of the physics step only", () => {
  it("identical applied pedal/steer at every physics step on every cadence (a named start at step 1), and the car with it", () => {
    const runs = CADENCES.map(([name, frames]) => [
      name,
      drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } }),
    ] as const);
    const ref = runs[0]![1];
    expect(ref.applied.length).toBe(TOTAL);
    // The drive is a DRIVE: it moved, braked, pulsed and steered.
    expect(ref.applied.some((a) => a.throttle > 0.3)).toBe(true);
    expect(ref.applied.some((a) => a.brake === 1)).toBe(true);
    expect(ref.applied.some((a) => a.steer > 0.3)).toBe(true);
    // …and it ended every step the way the script says: the stop by STOPPING
    // at the point, not by its timeout.
    expect(ref.log.map((l) => `${l.label}:${l.reason}`)).toEqual([
      "go:forSec",
      "stop at:stopped",
      "wait:forSec",
      "turn:forSec",
      "halt:forSec",
    ]);
    expect(Math.max(...ref.states.map((x) => x.speedKmh))).toBeGreaterThan(25);
    for (const [name, r] of runs) {
      expect({ cadence: name, diff: firstDiff(r.applied, ref.applied, TOTAL) }).toEqual({ cadence: name, diff: null });
      expect({ cadence: name, car: firstStateDiff(r.states, ref.states, TOTAL) }).toEqual({ cadence: name, car: null });
      expect({ cadence: name, late: r.lateDecisions, readErrors: r.readErrors }).toEqual({ cadence: name, late: 0, readErrors: 0 });
      expect({ cadence: name, log: r.log }).toEqual({ cadence: name, log: ref.log });
    }
  }, 240_000);

  it("EXACT: on every cadence step k+1 applies the decision taken on the state after step k — once per count, in order", () => {
    for (const [name, frames] of CADENCES) {
      const r = drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });
      expect({ cadence: name, oracle: oracleMismatch(r, SCRIPT, 1) }).toEqual({ cadence: name, oracle: null });
    }
  }, 240_000);

  it("read order and read count cannot move it: 0, 1, 3 or 7 render reads per frame give one sequence", () => {
    const frames = W69;
    const ref = drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });
    for (const reads of [0, 1, 7]) {
      const r = drive({
        frames,
        steps: SCRIPT,
        totalSteps: TOTAL,
        rig: "new",
        arm: { kind: "autorun", start: 1 },
        renderReads: (f) => (f % 2 === 0 ? reads : 3),
      });
      expect({ reads, diff: firstDiff(r.applied, ref.applied, TOTAL) }).toEqual({ reads, diff: null });
    }
  }, 240_000);

  it("the rig's sample pedal columns ARE the applied command: point k carries what step k read", () => {
    for (const [name, frames] of [CADENCES[0]!, CADENCES[4]!, CADENCES[6]!]) {
      const r = drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });
      expect(r.cols.length).toBe(TOTAL);
      let bad: string | null = null;
      for (let k = 1; k <= TOTAL && bad === null; k++) {
        const col = r.cols[k - 1]!;
        const a = r.applied[k - 1]!;
        if (col.throttle !== a.rawThrottle || col.brake !== a.rawBrake || padSteer(col.steer) !== a.rawSteer) {
          bad = `point ${k}: columns ${JSON.stringify(col)} vs applied ${JSON.stringify([a.rawThrottle, a.rawBrake, a.rawSteer])}`;
        }
      }
      expect({ cadence: name, bad }).toEqual({ cadence: name, bad: null });
    }
  }, 240_000);
});

describe("ADR-017 — THE REGRESSION ANCHOR: one step per frame is bit-identical to the pre-ADR-017 rig", () => {
  it("autorun from the first tick: the same applied command at every step, the same car, the same sample columns", () => {
    const now = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });
    const was = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "base", arm: { kind: "autorun" } });
    expect(firstDiff(now.applied, was.applied, TOTAL)).toBeNull();
    expect(firstStateDiff(now.states, was.states, TOTAL)).toBeNull();
    expect(now.cols).toEqual(was.cols);
  }, 120_000);

  it("run() called between frames (the old wall-timed start, kept as \"next\"): bit-identical too", () => {
    for (const afterFrame of [0, 7, 41]) {
      const now = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "call", start: "next", afterFrame } });
      const was = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "base", arm: { kind: "call", start: "next", afterFrame } });
      expect({ afterFrame, diff: firstDiff(now.applied, was.applied, TOTAL) }).toEqual({ afterFrame, diff: null });
      expect({ afterFrame, cols: now.cols }).toEqual({ afterFrame, cols: was.cols });
    }
  }, 120_000);

  it("…and the anchor has teeth: on the phone lens the pre-ADR-017 rig does NOT match its own 60 Hz drive", () => {
    const was60 = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "base", arm: { kind: "autorun" } });
    const wasPhone = drive({ frames: W69, steps: SCRIPT, totalSteps: TOTAL, rig: "base", arm: { kind: "autorun" } });
    expect(firstDiff(wasPhone.applied, was60.applied, TOTAL)).not.toBeNull();
  }, 120_000);
});

describe("ADR-017 — the START is referenced to a step, not to the call that armed it", () => {
  const START = 120;
  it("a named start step: the arming call jittered over every frame boundary before it, and inside a frame, gives one drive on every cadence", () => {
    const ref = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "call", start: START, afterFrame: 3 } });
    expect(ref.startStep).toBe(START);
    expect(oracleMismatch(ref, SCRIPT, START)).toBeNull();
    for (const [name, frames] of CADENCES) {
      // Every frame whose end is still at or before the start step.
      const ends: number[] = [];
      let acc = 0;
      let steps = 0;
      for (let f = 0; steps <= START && f < 10_000; f++) {
        acc += Math.min(Math.max(frames[f % frames.length]!, 0), 0.5);
        while (acc >= H) {
          steps++;
          acc -= H;
        }
        if (steps <= START) ends.push(f);
      }
      const picks = [...new Set([0, ends[Math.floor(ends.length / 2)]!, ends[ends.length - 1]!])];
      for (const afterFrame of picks) {
        for (const phase of ["between", "afterSteps", "afterRenderReads"] as const) {
          const r = drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "call", start: START, afterFrame, phase } });
          expect({ cadence: name, afterFrame, phase, diff: firstDiff(r.applied, ref.applied, TOTAL) }).toEqual({
            cadence: name,
            afterFrame,
            phase,
            diff: null,
          });
        }
      }
    }
  }, 600_000);

  it("a start step that has passed is REFUSED, never moved", () => {
    expect(() =>
      drive({ frames: [0.5], steps: SCRIPT, totalSteps: 200, rig: "new", arm: { kind: "call", start: 10, afterFrame: 2 } }),
    ).toThrow(/start step 10 has passed/);
  });

  it("\"drive\" on a lesson with no pre-drive starts at the first grid point; where that point's frame already took steps, their decisions are LATE (counted) — the stated limit", () => {
    const at60 = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: 300, rig: "new", arm: { kind: "autorun", start: "drive" } });
    const at2 = drive({ frames: [0.5], steps: SCRIPT, totalSteps: 300, rig: "new", arm: { kind: "autorun", start: "drive" } });
    expect(at60.startStep).toBe(1);
    expect(at2.startStep).toBe(1);
    expect(at60.lateDecisions).toBe(0);
    // The first 0.5 s frame took steps 1–30 before the grade could see the
    // phase: the decisions for counts 1–29 are computed (the script's state)
    // and never applied, and the pad was idle for steps 2–30.
    expect(at2.lateDecisions).toBe(29);
    expect(at2.applied.slice(1, 30).every((a) => a.rawThrottle === 0 && a.rawBrake === 0)).toBe(true);
    expect(at60.applied.slice(1, 30).some((a) => a.rawThrottle > 0)).toBe(true);
    // From the step after that frame on, step c+1 applies decision c again.
    expect(at2.applied[30]!.rawThrottle).toBeGreaterThan(0);
  }, 120_000);
});

describe("ADR-017 — the command travels the WHOLE product path: GatedSimInput cannot be bypassed", () => {
  it("the pre-drive gate zeroes the rig's pedals, the raw capture sees them, the blocked-throttle latch fires", () => {
    const LOCK_UNTIL = 200;
    const r = drive({
      frames: W69,
      steps: SCRIPT,
      totalSteps: 400,
      rig: "new",
      arm: { kind: "autorun", start: 1 },
      lockedSteps: (s) => s <= LOCK_UNTIL,
    });
    const locked = r.applied.slice(0, LOCK_UNTIL);
    expect(locked.some((a) => a.rawThrottle > 0.3), "the rig pressed the throttle under the lock").toBe(true);
    const leaked = locked.findIndex((a) => a.throttle !== 0 || a.brake !== 0);
    expect(leaked, "the pre-drive gate must zero every rig pedal while locked").toBe(-1);
    expect(r.blocked.slice(0, LOCK_UNTIL).some(Boolean), "the blocked-throttle latch must see the rig's press").toBe(true);
    // Steering stays live under the lock, exactly as for a human (LessonScene QW10).
    expect(locked.every((a) => a.steer === a.rawSteer)).toBe(true);
    // The car did not move under the lock.
    expect(Math.abs(r.states[LOCK_UNTIL - 1]!.speedKmh)).toBeLessThan(0.5);
    // After the lock the pedals pass.
    expect(r.applied.slice(LOCK_UNTIL).some((a) => a.throttle > 0.3)).toBe(true);
  }, 120_000);

  it("the reverse remap swaps the rig's pedals (raw capture after the remap), as for every device", () => {
    const r = drive({
      frames: [1 / 60],
      steps: [{ label: "go", speedKmh: 30, forSec: 3 }],
      totalSteps: 120,
      rig: "new",
      arm: { kind: "autorun", start: 1 },
      remapSteps: (s) => s > 60,
    });
    const before = r.applied.slice(10, 60);
    const after = r.applied.slice(70, 120);
    expect(before.every((a) => a.throttle > 0 && a.brake === 0)).toBe(true);
    // Remapped: the pad's throttle arrives as BRAKE.
    expect(after.every((a) => a.throttle === 0 && a.brake > 0 && a.rawBrake === a.brake)).toBe(true);
  }, 120_000);

  it("the rig's only ways into the product are the gamepad shim and synthetic key events (source census)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(path.resolve(__dirname, "../rig.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const forbidden of [
      "inputRef",
      "VehicleSim",
      "applyDifficulty",
      "useBeforePhysicsStep",
      "rawThrottle",
      "rawBrake",
      "driveLocked",
      ".update(",
      "record(",
    ]) {
      expect({ forbidden, present: src.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
    expect(src.match(/Object\.defineProperty\(navigator, "getGamepads"/g)?.length).toBe(2); // install + restore
  });
});

describe("ADR-017 / attack A15 — pause, a hidden tab, a long stall, a blur", () => {
  const ref = () => drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });

  it("a pause (render reads, no steps, no grade) then a 2 s resume frame: nothing applied twice, nothing moved", () => {
    const base = ref();
    const r = drive({
      frames: [...Array.from({ length: 300 }, () => 1 / 60), ...Array.from({ length: 40 }, () => 1 / 60), 2.0, ...Array.from({ length: 2000 }, () => 1 / 60)],
      steps: SCRIPT,
      totalSteps: TOTAL,
      rig: "new",
      arm: { kind: "autorun", start: 1 },
      pausedFrames: (f) => f >= 300 && f < 340,
      renderReads: (f) => (f >= 300 && f < 340 ? 5 : 3),
    });
    expect(firstDiff(r.applied, base.applied, TOTAL)).toBeNull();
    expect(oracleMismatch(r, SCRIPT, 1)).toBeNull();
  }, 120_000);

  it("a hidden tab (one 6 s frame, clamped to 0.5 s = 30 steps) and the w69 7.5 s stall: one sequence", () => {
    const base = ref();
    const hidden = drive({
      frames: [...Array.from({ length: 400 }, () => 1 / 60), 6.0, ...Array.from({ length: 2000 }, () => 1 / 60)],
      steps: SCRIPT,
      totalSteps: TOTAL,
      rig: "new",
      arm: { kind: "autorun", start: 1 },
    });
    expect(firstDiff(hidden.applied, base.applied, TOTAL)).toBeNull();
  }, 120_000);

  it("a window blur mid-drive clears the keyboard, not the rig's pad", () => {
    const base = ref();
    const r = drive({ frames: [1 / 60], steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 }, blurBeforeFrame: 250 });
    expect(firstDiff(r.applied, base.applied, TOTAL)).toBeNull();
  }, 120_000);
});

describe("ADR-017 D-3 — script KEY edges stay frame-timed (stated, measured)", () => {
  it("a step's keys go down at the grid point whose decision entered the step — the same point on every cadence — but only after that frame's steps have run", () => {
    const edges = CADENCES.map(([name, frames]) => {
      const r = drive({ frames, steps: SCRIPT, totalSteps: TOTAL, rig: "new", arm: { kind: "autorun", start: 1 } });
      const down = r.keyEdges.find((e) => e.type === "keydown" && e.code === "KeyQ");
      const up = r.keyEdges.find((e) => e.type === "keyup" && e.code === "KeyQ");
      return { name, down, up };
    });
    const ref = edges[0]!;
    expect(ref.down).toBeDefined();
    for (const e of edges) {
      // The same GRID POINT (the transition is a decision, and decisions are per step)…
      expect({ cadence: e.name, k: e.down?.gradingK, upK: e.up?.gradingK }).toEqual({
        cadence: e.name,
        k: ref.down!.gradingK,
        upK: ref.up!.gradingK,
      });
    }
    // …dispatched from the grade loop, so the physics steps of that frame have
    // ALREADY run: on a long frame the edge reaches SimInput / the cabin
    // several steps after its point. That is D-3's frame-timed limit.
    const phone = edges.find((e) => e.name === "2 fps lens")!;
    expect(phone.down!.stepCount).toBeGreaterThan(phone.down!.gradingK);
    expect(ref.down!.stepCount).toBe(ref.down!.gradingK);
  }, 240_000);
});

describe("ADR-017 — the dev-only step reference", () => {
  it("the rig reads the source LessonScene publishes on window.__rigStepSource, and nothing when there is none", () => {
    g.window = {} as RigStepSourceHost;
    expect(readRigStepSource()).toBeNull();
    const fake: RigStepSource = {
      steps: { stepCount: 0, stateAtStep: () => false },
      clock: { timeOf: (k) => k * H, indexAt: (t) => Math.floor(t / H), stepSec: H },
    };
    (g.window as RigStepSourceHost).__rigStepSource = fake;
    expect(readRigStepSource()).toBe(fake);
    delete g.window;
    expect(readRigStepSource()).toBeNull();
  });
});
