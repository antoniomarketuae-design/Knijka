/**
 * THE SCENE'S OWN GRADED CALL, CUT OUT OF ITS SOURCE — one cutter for every
 * harness that executes it (sc-roundabout-entry:08a0b701, lane npcstep).
 *
 * LessonScene's RuntimeDriver grades the physics steps rapier took through ONE
 * `gradeGrid.stepPhysics(…)` expression. Since this lane it has two callers:
 *
 *   · the frame — `gradeTakenSteps(steps, tRef.current, sample.mirrorGlance)`
 *     in RuntimeDriver's `useFrame` callback, after `const steps = …` and the
 *     session-clock line;
 *   · the physics step loop — the function RuntimeDriver's layout effect puts
 *     in `stepLoopGradeRef` (round 2; VehicleRig's before-step callback calls
 *     it first): before rapier takes a further step of the same frame, the
 *     step it has just taken is graded. (Round 1 handed that function to
 *     `useBeforePhysicsStep` itself; that shape is still read.)
 *
 * and the expression itself lives in the component-level function
 * `gradeTakenSteps`. This file cuts all three out of
 * components/sim/LessonScene.tsx as syntax trees and compiles them TOGETHER,
 * so a harness runs the scene's own statements — its hooks, its catch-up
 * condition, its cabin refresh — and re-implements none of them:
 *
 *   `frame(delta)` — THE FRAME CALLBACK, WHOLE (round 4): every statement of
 *                    RuntimeDriver's frame callback from its FIRST statement
 *                    through the `gradeTakenSteps(…)` statement, in order,
 *                    none skipped — the blocked-attempt latch, the dashboard
 *                    write, the `if (paused) return;` early-out, the
 *                    pre-drive block, the session clock, the reverse assist
 *                    and the two stuck watches. The call must be an
 *                    UNCONDITIONAL statement of the callback's body (the cut
 *                    refuses anything else), and running the callback must
 *                    reach it exactly once — else `frame` throws.
 *                    `frameRun(delta)` runs the same text and only REPORTS
 *                    how often the call was reached (a paused frame returns
 *                    before it; a test asserts on that). What the harness
 *                    runs after its model of rapier's stepper, once per
 *                    frame. Round 3 ran `const steps = …` through the call
 *                    only, and the round-3 verifier placed a clock skip (R1b)
 *                    and an early `return` (R1) one statement ABOVE that
 *                    region: both passed every test. Through round 2 only the
 *                    call EXPRESSION ran (G5b passed every test);
 *   `beforeStep()` — the scene's own step-loop grade (what the harness runs
 *                    before each `world.step`, BEFORE the step's input is
 *                    decided — VehicleRig's order), or NULL on a scene that
 *                    has none. Round 2's is obtained by RUNNING the scene's
 *                    layout effect on a fresh `stepLoopGradeRef` and taking
 *                    what it put there.
 *
 * THE BASE'S SHAPE IS READ TOO («inline»): through 8cb0707 the expression sat
 * directly in the frame callback, beside `const steps = …`, and nothing ran
 * before a step. The cut then is that statement and the expression, and
 * `beforeStep` is null — so a census written against the repair runs RED on
 * the base instead of not at all.
 *
 * UNREADABLE = RED (round 4). Every name the frame callback reads from outside
 * itself is listed by the cut from the syntax tree, and the cut THROWS,
 * naming them, if a name is neither declared by the callback, nor a
 * module-level declaration of LessonScene's (cut and compiled with it — the
 * pedal thresholds, `cabinPollBaseline`), nor in `SCENE_GRADE_NAMES`, nor a
 * JavaScript global. A name in a branch no harness takes is caught all the
 * same; through round 3 only a branch that RAN threw a ReferenceError.
 *
 * NO EARLY EXIT (round 5, integrator N11). The cut also REFUSES — from the
 * syntax tree, at any depth, in any branch — every `return` and `throw` in the
 * frame callback before its graded call except the one top-level
 * `if (paused) return;` (`FRAME_PAUSE_GUARD`), and the same in the step-loop
 * grade except `STEP_LOOP_GUARD`; see `earlyExitsOf` for nested functions and
 * `EXCEPTION_LIMIT` for what syntax cannot refuse. The round-4 verifier's
 * F1–F5 (an early return inside a branch no harness executed) passed every
 * test until this. `{ refuseEarlyExits: false }` lists instead of throwing —
 * for scene-frame-grade.execution only, to show its executed drives catch the
 * same texts; `{ probeBranches: true }` counts every branch entered (its §6c
 * branch census).
 *
 * NOTHING THE EXITS OR THE GRADED CALL READ IS WRITTEN (round 6, integrator
 * N14). The round-5 verifier ended frames with no `return` and no `throw`:
 * `paused = paused || …` above the pause guard (P1), `const taken = (…) ?
 * null : stepTrackRef.current;` in the step loop (P3), `gradeGrid.stepPhysics
 * = () => 0` as an expression (P7) — each passed every test. The cut now also
 * REFUSES (`guardInputsOf`): (a) any write to, or re-binding (a shadow) of, a
 * GUARDED name — every name the two allowed exits and the two pinned input
 * declarations read (`GUARDED_NAMES`, derived from their syntax) plus the
 * graded function and the step-loop ref; (b) any write to, `delete` of,
 * computed read of, or method call through a member of a guarded OBJECT
 * (`gradeGrid`, `stepTrackRef`, `stepLoopGradeRef`, `steps`, `taken`) but the
 * graded call; (c) a step-loop grade whose first statement is not
 * `STEP_LOOP_TAKEN` or a frame whose `steps` is not `FRAME_STEPS`, by exact
 * syntax; (e, own) a guarded object ESCAPING into an alias (a binding, an
 * assignment, another call's argument, a literal, a `return`, `||`/`&&`/`??`)
 * through which (a)/(b) could be written unseen — in the frame callback
 * WHOLE, the step-loop grade and `gradeTakenSteps` at any depth, nested
 * functions included, and for the props (`paused`, `gradeGrid`,
 * `stepTrackRef`, `stepLoopGradeRef`) in RuntimeDriver whole. (d) — the
 * grid's methods are non-writable on the instance — is the grid's own
 * (scene/gradeGrid.ts), pinned by scene/__tests__/grade-grid-clock-readonly
 * §4. What syntax cannot follow — a value READ off a guarded object and then
 * written (`const rec = stepTrackRef.current; rec.… = …`), a write inside a
 * procedure the callback calls — is stated, not refused (N17).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { sessionClockAdvance } from "@/components/sim/lesson-ui/sessionClock";
import { ReverseAssist } from "@/modules/sim/engine/reverseAssist";
import { ReverseStuckWatch } from "@/modules/sim/engine/reverseStuck";
import { StuckStartWatch } from "@/modules/sim/engine/stuckStart";
import { PhysicsSessionClock } from "@/modules/sim/traffic";
import { createDashboardStatus, writeDashboardStatus } from "@/modules/sim/hud/dashboardStatus";
import { createPreDriveSignalTracker, observeControlSignal, readyToMoveOff } from "@/modules/sim/procedures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../../..");

/**
 * Every name the scene's graded statements read from outside themselves — a
 * SUPERSET of what any one shape reads (an unused parameter is harmless; a
 * missing one throws). The set the CALL itself closes over is pinned outright
 * by scene/__tests__/live-grid-wiring.test.ts §3.
 */
export const SCENE_GRADE_NAMES = [
  "gradeGrid",
  "stepTrackRef",
  "tRef",
  // The frame's sample: the frame's call reads its one-shot look; through
  // 8cb0707 the call's hooks read the cabin's channels off this name too.
  "sample",
  "runtime",
  "traffic",
  "director",
  "conditions",
  "inputRef",
  "hazardActiveRef",
  "telltaleLitRef",
  "onTelltale",
  // Through 8cb0707 the attempt recorder was a local of the frame callback.
  "recorder",
  "telltaleCautionLitRef",
  "onTelltaleCaution",
  "onStagedOutcome",
  "onTick",
  "onNearMiss",
  "cabinRef",
  "attemptFeedRef",
  "feedAttemptPoint",
  "simRef",
  "contactListenerRef",
  "NO_PHYSICS_STEPS",
  // Two names the call does NOT read today, handed over all the same: a scene
  // that went back to measuring the person in the path itself would reach for
  // exactly these, and should then fail on WHAT IT MEASURED.
  "vruAheadMeters",
  "directorContactCast",
  // Since lane npcstep: `gradeTakenSteps` reads the sample and the recorder
  // off their refs, hands every graded point to NpcColliders' pool, and the
  // before-step callback reads the pause and refreshes the cabin's channels.
  "sampleRef",
  "attemptRecorderRef",
  "npcShellsRef",
  "paused",
  "updateCabinChannels",
  // Round 3 — the frame's whole grading region (see the header): the session
  // clock it advances, and what the reverse assist and the two stuck watches
  // between `const steps` and the call read. `sceneFrameScope()` hands the
  // scene's own kinds of each.
  "sessionClock",
  "sessionClockAdvance",
  "reverseAssistEnabled",
  "driveLocked",
  "reverseAssist",
  "assistShiftingRef",
  "reverseStuck",
  "onReversePedalStuck",
  "stuckStart",
  "onStuckStart",
  // Round 4 — the frame callback WHOLE: what it reads before `const steps`
  // (the blocked-attempt latch, the dashboard write, the paused early-out,
  // the pre-drive block). `sceneFrameScope()` hands the scene's own kinds.
  "dashboardStatusRef",
  "dashScratchRef",
  "writeDashboardStatus",
  "createDashboardStatus",
  "tierCapKmh",
  "tierNameBg",
  "drivelineEventsRef",
  "glanceQueueRef",
  "prevLockedRef",
  "trackerRef",
  "createPreDriveSignalTracker",
  "pollRef",
  "onPreDriveStep",
  "observeControlSignal",
  "readyToMoveOff",
  "onBlockedDriveAttempt",
  "onDrivelineRejection",
  "onTransmissionChanged",
] as const;
export type SceneGradeName = (typeof SCENE_GRADE_NAMES)[number];

export interface SceneGradeBound {
  /** RuntimeDriver's frame callback, handed R3F's `delta`: every statement
   *  from its first through the graded call's statement. Returns what the
   *  call returned (the points the FRAME's call graded); throws when running
   *  the callback did not reach the call exactly once. */
  frame(delta: number): number;
  /** The same, reporting instead of throwing: `calls` — how often the
   *  graded call was reached (0 on a frame that returned before it, e.g. a
   *  paused one); `graded` — what the call returned (0 when not reached). */
  frameRun(delta: number): { calls: number; graded: number };
  /** How many times the frame's call has been made over this binding. */
  frameCalls(): number;
  /** RuntimeDriver's `useBeforePhysicsStep` callback — null: none registered. */
  beforeStep: (() => void) | null;
  /** N12 (round 5): how often each branch probe ran over this binding (by
   *  probe id; empty unless the cut was made with `probeBranches`). */
  branchHits(): Record<number, number>;
}

export interface SceneGradeCutOptions {
  /** N11 (round 5). Default TRUE: the cut THROWS on any statement that can
   *  end the frame callback (or the step-loop grade) before its graded call
   *  — see `earlyExitsOf`. FALSE only to show, in a test, that the executed
   *  drives catch the same text; the exits are then listed in `earlyExits`. */
  refuseEarlyExits?: boolean;
  /** N12 (round 5): compile the frame callback with a counter at the head of
   *  every branch before the graded call (`branchProbes`, `branchHits`). */
  probeBranches?: boolean;
}

export interface SceneGradeCut {
  /** "function": the expression lives in `gradeTakenSteps` (the repair);
   *  "inline": directly in the frame callback (through 8cb0707). */
  shape: "function" | "inline";
  /** The `gradeGrid.stepPhysics(…)` expression, as the scene spells it. */
  callText: string;
  /** The frame callback's `const steps = …` statement. */
  stepsDecl: string;
  /** The frame callback as run: every statement from its first through the
   *  call's statement (round 4; round 3 began at `const steps =`). */
  frameRegion: readonly string[];
  /** LessonScene's module-level declarations the frame callback reads,
   *  compiled with it (round 4). */
  frameModuleDecls: readonly string[];
  /** Every name the frame callback reads from outside itself and its module
   *  declarations, sorted (round 4) — each one supplied by the harness or a
   *  JavaScript global, else the cut throws. */
  frameFreeNames: readonly string[];
  /** "function" only: the frame's `gradeTakenSteps(…)` expression. */
  frameCallText: string | null;
  /** "function" only: the step-loop grade's source — round 2: the whole
   *  `useLayoutEffect(…)` call that fills `stepLoopGradeRef`; round 1: the
   *  callback handed to `useBeforePhysicsStep`. */
  beforeStepText: string | null;
  /** How the step loop reaches the grade: "layoutRef" (round 2), "rapierHook"
   *  (round 1), or null (none — the base). */
  stepLoopVia: "layoutRef" | "rapierHook" | null;
  /** N11 (round 5): what can end the frame callback or the step-loop grade
   *  before its graded call — always empty on a cut that was not refused. */
  earlyExits: readonly string[];
  /** N14 f (integration, V6-2): the refs the grading reads — every `X` that
   *  `gradeTakenSteps` (its hooks included) or the step-loop grade reads as
   *  `X.current`, DERIVED from their syntax (`gradedRefsOf`), sorted; empty
   *  on the base's shape. */
  guardedRefs: readonly string[];
  /** N12 (round 5): the branches probed (empty without `probeBranches`). */
  branchProbes: readonly BranchProbe[];
  bind(scope: Record<SceneGradeName, unknown>): SceneGradeBound;
}

let cache: SceneGradeCut | null = null;

const transpile = (text: string) =>
  ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;

/** The nearest enclosing function body (a block of an arrow or a function
 *  expression) of `n`. */
function enclosingBody(n: ts.Node): ts.Block | null {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isBlock(p) && (ts.isArrowFunction(p.parent) || ts.isFunctionExpression(p.parent))) return p;
  }
  return null;
}

/**
 * THE FRAME CALLBACK, WHOLE (round 4). `call` is the frame's graded call (the
 * repair's `gradeTakenSteps(…)`, the base's `gradeGrid.stepPhysics(…)`). It
 * must be the WHOLE expression of a statement that is itself a statement of
 * the frame callback's body — unconditional: no `if`, no loop, no nested
 * block, no `&&`, no assignment around it — and that callback must be the
 * function RuntimeDriver hands `useFrame`. The region is every statement of
 * that body from its FIRST through the call's statement.
 */
function frameRegionOf(
  call: ts.CallExpression,
  sf: ts.SourceFile,
  driver: ts.FunctionDeclaration | null,
): {
  stepsDecl: string;
  stepsStatement: ts.Statement;
  region: string[];
  nodes: ts.Statement[];
  fn: ts.ArrowFunction | ts.FunctionExpression;
  body: ts.Block;
} {
  const statement = call.parent;
  if (!ts.isExpressionStatement(statement) || statement.expression !== call) {
    throw new Error(`the frame's graded call is not a statement of its own: \`${statement.getText(sf).slice(0, 120)}\``);
  }
  const body = statement.parent;
  const fn = body.parent;
  if (!ts.isBlock(body) || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    throw new Error("the frame's graded call is not an unconditional statement of a function body (it sits in a nested block)");
  }
  const hook = fn.parent;
  if (!ts.isCallExpression(hook) || hook.expression.getText(sf) !== "useFrame" || hook.arguments[0] !== fn) {
    throw new Error("the function whose body makes the frame's graded call is not the callback handed to useFrame");
  }
  if (driver === null || hook.getStart(sf) < driver.getStart(sf) || hook.getEnd() > driver.getEnd()) {
    throw new Error("the frame callback that makes the graded call is not RuntimeDriver's");
  }
  // The callback's parameters: `(_, delta)` exactly — the callback is run as
  // a function of `delta`.
  const params = fn.parameters.map((p) => p.name.getText(sf));
  if (params.length !== 2 || params[1] !== "delta") throw new Error(`the frame callback's parameters are (${params.join(", ")}), not (_, delta)`);
  const statements = body.statements;
  const at = statements.indexOf(statement);
  const declares = (st: ts.Statement, name: string) =>
    ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.name.getText(sf) === name);
  const stepsAt = statements.findIndex((st) => declares(st, "steps"));
  if (stepsAt < 0) throw new Error("the frame callback declares no `steps`");
  if (statements.filter((st) => declares(st, "steps")).length !== 1) throw new Error("the frame callback declares `steps` more than once");
  if (stepsAt >= at) throw new Error("the frame callback makes its graded call before it declares `steps`");
  const nodes = statements.slice(0, at + 1);
  return {
    stepsDecl: statements[stepsAt].getText(sf),
    stepsStatement: statements[stepsAt],
    region: nodes.map((st) => st.getText(sf)),
    nodes,
    fn,
    body,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// N11 (round 5): «END THE FRAME EARLY» IS REFUSED BY STRUCTURE
// ───────────────────────────────────────────────────────────────────────────

/**
 * The ONE early exit the frame callback may take before its graded call,
 * matched by its exact syntax (whitespace aside): a TOP-LEVEL statement of the
 * callback's body, no `else`, no braces, no value. A paused frame grades
 * nothing (§4 of scene-frame-grade.execution executes what it does and does
 * not do). Not required — a callback without it is R3, which §4 kills by
 * execution — but at most one.
 */
export const FRAME_PAUSE_GUARD = "if (paused) return;";
/**
 * The ONE early exit the step-loop grade may take before its graded call
 * (exact syntax, a top-level statement of the function the layout effect puts
 * in `stepLoopGradeRef`): paused, no step recorder, or nothing owed.
 */
export const STEP_LOOP_GUARD = "if (paused || taken === null || taken.stepCount <= gradeGrid.clock.last) return;";

const flatText = (n: ts.Node, sf: ts.SourceFile) => n.getText(sf).replace(/\s+/g, " ");
const lineOf = (n: ts.Node, sf: ts.SourceFile) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** The nearest function-like node enclosing `n` (arrow, function expression
 *  or declaration, method, accessor, constructor). */
function ownerFunction(n: ts.Node): ts.Node | null {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
  return null;
}

/** How an exit is named: the `if` it is the bare branch of, whole; else the
 *  statement itself and the construct it sits in (the nearest `if` head or
 *  label inside `fn`). */
function exitText(n: ts.Statement, fn: ts.Node, sf: ts.SourceFile): string {
  const p = n.parent;
  if (ts.isIfStatement(p) && (p.thenStatement === n || p.elseStatement === n)) return `\`${flatText(p, sf).slice(0, 100)}\``;
  for (let q: ts.Node | undefined = p; q && q !== fn; q = q.parent) {
    if (ts.isIfStatement(q)) return `\`${flatText(n, sf).slice(0, 60)}\` in \`if (${flatText(q.expression, sf).slice(0, 80)})\``;
    if (ts.isLabeledStatement(q)) return `\`${flatText(n, sf).slice(0, 60)}\` in \`${q.label.text}: {\``;
  }
  return `\`${flatText(n, sf).slice(0, 100)}\``;
}

/**
 * Every statement in `before` (statements of `fn`'s body that come BEFORE the
 * graded call) that can end `fn` without reaching the call, at ANY depth, in
 * ANY branch:
 *   · a `return` whose function is `fn` itself — except `allowed`, exactly,
 *     as a top-level statement of `fn`'s body, at most once;
 *   · a `throw` ANYWHERE, nested function bodies included.
 * NESTED FUNCTION BODIES (a callback DEFINED inside `fn` — the pre-drive
 * `emit`, the assist's `step`): a `return` there leaves only that function,
 * never `fn`, so it cannot end the frame and is not refused whether or not the
 * function is invoked; a `throw` there propagates out of `fn` when the
 * function is invoked inline, and whether it is invoked before the call is
 * not decided here — it is refused wherever it is.
 * Also refused: a binding named `gradeTakenSteps` anywhere in `before` (a
 * shadow would make the call call something else). A `break`/`continue`
 * cannot leave `fn`; a labelled block cannot hold the call (the call must be
 * a top-level statement of the body — refused separately).
 * NOT refused, and cannot be by syntax: an exception raised while the
 * callback runs — inline, by one of its own expressions, or inside a
 * procedure it calls (see `EXCEPTION_LIMIT`).
 */
function earlyExitsOf(
  before: readonly ts.Statement[],
  fn: ts.Node,
  body: ts.Block,
  sf: ts.SourceFile,
  allowed: string | null,
  where: string,
): string[] {
  const found: string[] = [];
  let allowedSeen = 0;
  const walk = (n: ts.Node) => {
    if (ts.isReturnStatement(n) && ownerFunction(n) === fn) {
      const iff = n.parent;
      const isAllowed =
        allowed !== null &&
        n.expression === undefined &&
        ts.isIfStatement(iff) &&
        iff.thenStatement === n &&
        iff.elseStatement === undefined &&
        iff.parent === body &&
        flatText(iff, sf) === allowed;
      if (isAllowed) {
        allowedSeen++;
        if (allowedSeen > 1) found.push(`${where} line ${lineOf(n, sf)}: a second \`${allowed}\``);
      } else {
        found.push(`${where} line ${lineOf(n, sf)}: \`return\` before the graded call — ${exitText(n, fn, sf)}`);
      }
    }
    if (ts.isThrowStatement(n)) {
      found.push(`${where} line ${lineOf(n, sf)}: \`throw\` before the graded call — ${exitText(n, fn, sf)}`);
    }
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n)) && n.name && n.name.getText(sf) === "gradeTakenSteps") {
      found.push(`${where} line ${lineOf(n, sf)}: \`gradeTakenSteps\` re-declared before the graded call`);
    }
    ts.forEachChild(n, walk);
  };
  for (const st of before) walk(st);
  return found;
}

/**
 * THE LIMIT N11 STATES (wording corrected in round 6, integrator N15 / the
 * round-5 verifier's V5-3; checked against @react-three/fiber 9.6.1's loop,
 * dist/events-*.js `loop` / `update`): ANY exception raised while the frame
 * callback runs before its graded call — INLINE, by one of the callback's own
 * expressions (the verifier's P4: `void (… && (null as unknown as
 * { x: number }).x)` — no `throw`, no call), or INSIDE a procedure it calls —
 * is not refused here: no syntax names it. It is not a silent skip of the
 * kind refused above, but it is not caught either: R3F calls every
 * `useFrame` subscriber in a plain `for` loop with no try/catch, AFTER
 * `requestAnimationFrame(loop)` has already queued the next frame. A throw
 * therefore abandons the rest of that frame — the graded call, every later
 * subscriber, `gl.render` — and leaves the rAF callback as an UNCAUGHT error
 * (the browser console; Next's overlay in development; nothing the product
 * shows — the product registers no `error` listener). The loop runs on with
 * the next frame, whose step-loop grade then grades the abandoned point
 * before its first step: graded once, in order, but with no frame end and no
 * look (R1's effect, for one frame). No React error boundary sees it (it is
 * not thrown during a render). Executed: scene-frame-grade.execution §7 (a
 * procedure that throws; the verifier's P4 placed inline).
 */
export const EXCEPTION_LIMIT =
  "any exception raised while the frame callback runs before its graded call — inline in its own expressions or inside a procedure it calls — is not refused: it abandons the rest of that frame (R3F 9.6.1 runs the useFrame subscribers with no try/catch, after requesting the next frame), its graded call and its draw lost as an uncaught console error; the next frame's step loop grades the lost point once and in order, with no frame end and no look";

/**
 * N11 for the step loop: the function RuntimeDriver's layout effect puts in
 * `stepLoopGradeRef` must make its `gradeTakenSteps(…)` call as an
 * unconditional top-level statement of its own body, and before it may end
 * only through `STEP_LOOP_GUARD`, exactly.
 */
function stepLoopExitsOf(fill: ts.CallExpression, calls: readonly ts.CallExpression[], sf: ts.SourceFile): string[] {
  const inFill = calls.filter((c) => c.getStart(sf) >= fill.getStart(sf) && c.getEnd() <= fill.getEnd());
  if (inFill.length !== 1) return [`the step-loop grade makes ${inFill.length} gradeTakenSteps calls (one expected)`];
  const call = inFill[0];
  const statement = call.parent;
  if (!ts.isExpressionStatement(statement) || statement.expression !== call) {
    return [`the step-loop grade's call is not a statement of its own: \`${flatText(statement, sf).slice(0, 100)}\``];
  }
  const body = statement.parent;
  const fn = body.parent;
  if (!ts.isBlock(body) || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    return ["the step-loop grade's call is not an unconditional statement of a function body (it sits in a nested block)"];
  }
  const before = body.statements.slice(0, body.statements.indexOf(statement));
  const found = earlyExitsOf(before, fn, body, sf, STEP_LOOP_GUARD, "step-loop grade");
  // N14 (c): the guard's input is declared by its exact syntax, FIRST.
  const first = body.statements[0];
  if (first === undefined || first === statement || flatText(first, sf) !== STEP_LOOP_TAKEN) {
    found.push(
      `step-loop grade line ${lineOf(first ?? statement, sf)}: its first statement is not \`${STEP_LOOP_TAKEN}\` (N14c) — \`${flatText(first ?? statement, sf).slice(0, 100)}\``,
    );
  }
  return found;
}

// ───────────────────────────────────────────────────────────────────────────
// N14 (round 6): what the allowed exits and the graded call READ is not
// written — by structure
// ───────────────────────────────────────────────────────────────────────────

/** The step-loop grade's input, pinned by its exact syntax as the grade's
 *  FIRST statement (N14 c; the round-5 verifier's P3 re-declared it). */
export const STEP_LOOP_TAKEN = "const taken = stepTrackRef.current;";
/** The frame's input, pinned by its exact syntax as a top-level statement of
 *  the frame callback (tests pinned it since round 3; the cut since round 6). */
export const FRAME_STEPS = "const steps = stepTrackRef.current ?? NO_PHYSICS_STEPS;";

/** Every identifier a text reads or declares (property names excluded). */
function identifiersIn(text: string): string[] {
  const sf = ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true);
  const out = new Set<string>();
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) out.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return [...out];
}

/**
 * THE GUARDED NAMES (N14 a): every name the two allowed exits and the two
 * pinned input declarations read or declare — DERIVED from their syntax, so a
 * widened guard widens the set — and the grading machinery's own names (the
 * step-loop ref, the graded function). Today: `paused`, `taken`, `gradeGrid`,
 * `steps`, `stepTrackRef`, `NO_PHYSICS_STEPS`, `gradeTakenSteps`,
 * `stepLoopGradeRef`.
 */
export const GUARDED_NAMES: readonly string[] = [
  ...new Set([
    ...identifiersIn(FRAME_PAUSE_GUARD),
    ...identifiersIn(STEP_LOOP_GUARD),
    ...identifiersIn(FRAME_STEPS),
    ...identifiersIn(STEP_LOOP_TAKEN),
    "gradeTakenSteps",
    "stepLoopGradeRef",
  ]),
];
/** The guarded names that hold OBJECTS (the grid, the step record, its ref,
 *  the step-loop ref): no member of them is written, and the object itself
 *  never escapes into another binding, call or literal (N14 b). */
export const GUARDED_OBJECTS: readonly string[] = ["gradeGrid", "stepTrackRef", "stepLoopGradeRef", "steps", "taken"];

/**
 * N14 f (integration, the round-6 verifier's V6-2): THE REFS THE GRADING
 * READS. The verifier's NS1b emptied `npcShellsRef` — the ref the grid's
 * `shells` hook calls through — around the frame's graded call, written as an
 * expression; the cut accepted it, the fast set passed, and under the
 * product-input fuzz 173 of 200 drives took steps against stale shells. Every
 * `X` that `gradeTakenSteps` (its hooks included) or the step-loop grade reads
 * as `X.current`, and does not declare itself, is DERIVED here from their
 * syntax — a hook that starts reading another ref widens the set — less the
 * guarded objects (`stepTrackRef` keeps its stricter rule). In the frame
 * callback (whole) and the step-loop grade each such ref is a guarded NAME
 * (no write, no shadow) and its members are never written, deleted or read
 * computed, and the ref never escapes into an alias; in RuntimeDriver
 * elsewhere (the graded function itself excepted — its hooks keep their own
 * lamp and hazard state) no member of one is written. A METHOD called on a ref's
 * value (`inputRef.current?.read()`) is the scene's ordinary business and is
 * not refused; a write to the VALUE read off a ref is N17's stated limit.
 */
function gradedRefsOf(fns: readonly ts.Node[]): string[] {
  const out = new Set<string>();
  for (const fn of fns) {
    const declared = new Set<string>();
    const roots: string[] = [];
    const walk = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) {
        const ids: ts.Identifier[] = [];
        boundIdentifiers(n.name, ids);
        for (const id of ids) declared.add(id.text);
      }
      if (ts.isPropertyAccessExpression(n) && n.name.text === "current") {
        const x = stripped(n.expression);
        if (ts.isIdentifier(x)) roots.push(x.text);
      }
      ts.forEachChild(n, walk);
    };
    walk(fn);
    for (const r of roots) if (!declared.has(r) && !GUARDED_OBJECTS.includes(r)) out.add(r);
  }
  return [...out].sort();
}

/**
 * V6-1 (integration): THE STEP LOOP'S CALLER. VehicleRig's before-step
 * callback calls the scene's step-loop grade — and that caller was outside
 * the cut: the round-6 verifier's V1 put it behind «hazard lights on and the
 * brake pressed» and passed every test, restoring this row's defect on
 * multi-step frames. The callback's FIRST statement is pinned by its exact
 * syntax, as an unconditional statement of its body, and `stepLoopGradeRef`
 * is named nowhere else in the rig but the prop's declaration and the
 * component's destructured parameter. `sceneGradeCut()` refuses the scene's
 * cut when the rig does not hold to it.
 */
export const RIG_STEP_LOOP_CALL = "stepLoopGradeRef?.current?.();";

/** What keeps VehicleRig's before-step callback from running the scene's
 *  step-loop grade first and unconditionally on every physics step (V6-1) —
 *  empty when nothing does. */
export function rigStepLoopCallRefusals(rigText: string): string[] {
  const sf = ts.createSourceFile("VehicleRig.tsx", rigText.replace(/\r\n/g, "\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hooks: ts.CallExpression[] = [];
  const mentions: ts.Identifier[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "useBeforePhysicsStep") hooks.push(n);
    if (ts.isIdentifier(n) && n.text === "stepLoopGradeRef") mentions.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (hooks.length !== 1) return [`VehicleRig makes ${hooks.length} useBeforePhysicsStep calls, not one (V6-1)`];
  const fn = hooks[0].arguments[0];
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || !ts.isBlock(fn.body)) {
    return [`VehicleRig line ${lineOf(hooks[0], sf)}: useBeforePhysicsStep is not handed a function literal with a block body (V6-1)`];
  }
  const found: string[] = [];
  const first = fn.body.statements[0];
  const firstOk = first !== undefined && ts.isExpressionStatement(first) && flatText(first, sf) === RIG_STEP_LOOP_CALL;
  if (!firstOk) {
    found.push(
      `VehicleRig line ${lineOf(first ?? fn, sf)}: the before-step callback's first statement is not \`${RIG_STEP_LOOP_CALL}\`, unconditional (V6-1) — \`${first ? flatText(first, sf).slice(0, 160) : "(empty body)"}\``,
    );
  }
  for (const id of mentions) {
    if (firstOk && first !== undefined && id.getStart(sf) >= first.getStart(sf) && id.getEnd() <= first.getEnd()) continue;
    const p = id.parent;
    const declaredProp = ts.isPropertySignature(p) && p.name === id;
    const destructured = ts.isBindingElement(p) && p.name === id && p.propertyName === undefined && ts.isObjectBindingPattern(p.parent) && ts.isParameter(p.parent.parent);
    if (!declaredProp && !destructured) {
      found.push(`VehicleRig line ${lineOf(id, sf)}: \`stepLoopGradeRef\` is named outside its declaration and the before-step callback's first statement (V6-1) — \`${flatText(p, sf).slice(0, 160)}\``);
    }
  }
  return found;
}

/** `e` without parentheses, `!`, `as`, `satisfies` and `<T>` around it. */
function stripped(e: ts.Expression): ts.Expression {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    } else return e;
  }
}

/** The identifier an access chain `a.b[c]?.d` starts from (null: none), and
 *  whether there was at least one access. */
function accessRoot(e: ts.Expression): { root: ts.Identifier | null; member: boolean } {
  let x = stripped(e);
  let member = false;
  while (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) {
    member = true;
    x = stripped(x.expression);
  }
  return { root: ts.isIdentifier(x) ? x : null, member };
}

/** Every assignment TARGET in `target` — a plain target, or each one of a
 *  destructuring pattern (array / object literal on the left of `=`, or the
 *  initializer of a `for … of / in`), defaults and spreads included. */
function targetsOf(target: ts.Expression, out: ts.Expression[]): void {
  const t = stripped(target);
  if (ts.isArrayLiteralExpression(t)) {
    for (const el of t.elements) {
      if (ts.isOmittedExpression(el)) continue;
      if (ts.isSpreadElement(el)) targetsOf(el.expression, out);
      else if (ts.isBinaryExpression(el) && el.operatorToken.kind === ts.SyntaxKind.EqualsToken) targetsOf(el.left, out);
      else targetsOf(el, out);
    }
  } else if (ts.isObjectLiteralExpression(t)) {
    for (const p of t.properties) {
      if (ts.isShorthandPropertyAssignment(p)) out.push(p.name);
      else if (ts.isPropertyAssignment(p)) {
        const v = p.initializer;
        if (ts.isBinaryExpression(v) && v.operatorToken.kind === ts.SyntaxKind.EqualsToken) targetsOf(v.left, out);
        else targetsOf(v, out);
      } else if (ts.isSpreadAssignment(p)) targetsOf(p.expression, out);
    }
  } else out.push(t);
}

const isAssignmentOp = (k: ts.SyntaxKind) => k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
const COMPARISON = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
]);

/** Every identifier a binding name declares. */
function boundIdentifiers(b: ts.BindingName, out: ts.Identifier[]): void {
  if (ts.isIdentifier(b)) out.push(b);
  else for (const e of b.elements) if (!ts.isOmittedExpression(e)) boundIdentifiers(e.name, out);
}

interface GuardScope {
  /** Where the findings are reported («frame callback», …). */
  where: string;
  /** The names no statement under `root` may write or re-bind. */
  names: ReadonlySet<string>;
  /** Of those, the objects: no member written, never escaping. */
  objects: ReadonlySet<string>;
  /** N14 f: the refs the grading reads — no member written, deleted or read
   *  computed, never escaping (when `escapes`); a method on a ref's value may
   *  be called. */
  refs?: ReadonlySet<string>;
  /** The declarations allowed to bind a guarded name (the pinned inputs,
   *  RuntimeDriver's parameters, `gradeTakenSteps`' own). */
  pinned: ReadonlySet<ts.Node>;
  /** The graded calls, whose ARGUMENTS may carry a guarded object. */
  gradedCalls: ReadonlySet<ts.Node>;
  /** Subtrees not checked by this scope (checked by a narrower one). */
  skip?: ReadonlySet<ts.Node>;
  /** Check that guarded objects do not escape (the three graded functions;
   *  RuntimeDriver-wide hands them as props and to the layout effect). */
  escapes: boolean;
}

/**
 * N14 — under `root`, at ANY depth (nested functions included), every:
 *   (a) WRITE to a guarded name — `=`, every compound assignment, `++`/`--`,
 *       a destructuring target, a `for … of / in` target — and every BINDING
 *       of one (var / let / const, parameter, binding element, function or
 *       class name, catch variable) but the pinned declarations: a shadow;
 *   (b) write to, or `delete` of, a MEMBER of a guarded object, computed
 *       members included (`gradeGrid["stepPhysics"] = …`);
 *   (e) ESCAPE of a guarded object — read other than as the object of a
 *       member read, an argument of a graded call, or an operand of a
 *       comparison: into a binding, an assignment, another call, a literal, a
 *       spread, a `return`, a logical `||`/`&&`/`??` — an alias through which
 *       (a)/(b) could be written unseen. (Own, round 6.)
 */
function guardWritesOf(root: ts.Node, sf: ts.SourceFile, g: GuardScope): string[] {
  const found: string[] = [];
  const at = (n: ts.Node) => `${g.where} line ${lineOf(n, sf)}`;
  const say = (n: ts.Node) => `\`${flatText(n, sf).slice(0, 110)}\``;
  const checkTarget = (t: ts.Expression, stmt: ts.Node, how: string) => {
    const { root: id, member } = accessRoot(t);
    if (id === null) return;
    if (!member && g.names.has(id.text)) found.push(`${at(stmt)}: ${how} \`${id.text}\`, which an allowed exit or the graded call reads (N14a) — ${say(stmt)}`);
    else if (member && g.objects.has(id.text)) found.push(`${at(stmt)}: ${how} a member of \`${id.text}\` (N14b) — ${say(stmt)}`);
    else if (member && g.refs?.has(id.text)) found.push(`${at(stmt)}: ${how} a member of \`${id.text}\`, a ref the grading reads (N14f) — ${say(stmt)}`);
  };
  const walk = (n: ts.Node) => {
    if (g.skip?.has(n)) return;
    if (ts.isBinaryExpression(n) && isAssignmentOp(n.operatorToken.kind)) {
      const ts_: ts.Expression[] = [];
      if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken) targetsOf(n.left, ts_);
      else ts_.push(n.left);
      for (const t of ts_) checkTarget(t, n, "writes");
    }
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) {
      checkTarget(n.operand, n, "writes");
    }
    if (ts.isDeleteExpression(n)) checkTarget(n.expression, n, "deletes");
    // (b) a COMPUTED member of a guarded object (`gradeGrid["gridClock"]` —
    // the round-4 verifier's R1c spelling), and a METHOD called through one
    // (`gradeGrid.x.advanceSteps(…)`, `stepTrackRef.current.record(…)`) but
    // the graded call.
    if (ts.isElementAccessExpression(n)) {
      const { root: id } = accessRoot(n);
      if (id && g.objects.has(id.text)) found.push(`${at(n)}: reads a computed member of \`${id.text}\` (N14b) — ${say(n)}`);
      else if (id && g.refs?.has(id.text)) found.push(`${at(n)}: reads a computed member of \`${id.text}\`, a ref the grading reads (N14f) — ${say(n)}`);
    }
    if (ts.isCallExpression(n) && !g.gradedCalls.has(n)) {
      const { root: id, member } = accessRoot(n.expression);
      if (id && member && g.objects.has(id.text)) found.push(`${at(n)}: calls a method through \`${id.text}\` (N14b) — ${say(n)}`);
    }
    if ((ts.isForOfStatement(n) || ts.isForInStatement(n)) && !ts.isVariableDeclarationList(n.initializer)) {
      const ts_: ts.Expression[] = [];
      targetsOf(n.initializer, ts_);
      for (const t of ts_) checkTarget(t, n.initializer, "writes");
    }
    // (a) bindings — a shadow of a guarded name.
    const binds: ts.Identifier[] = [];
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && !g.pinned.has(n)) boundIdentifiers(n.name, binds);
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassExpression(n)) && n.name) binds.push(n.name);
    for (const id of binds) {
      if (g.names.has(id.text) && !g.pinned.has(id)) found.push(`${at(id)}: binds \`${id.text}\` — a shadow of what an allowed exit or the graded call reads (N14a) — ${say(n).slice(0, 80)}`);
    }
    // (e) an escape of a guarded object.
    if (g.escapes && ts.isIdentifier(n) && (g.objects.has(n.text) || g.refs?.has(n.text) === true)) {
      let e: ts.Node = n;
      while (
        ts.isParenthesizedExpression(e.parent) ||
        ts.isNonNullExpression(e.parent) ||
        ts.isAsExpression(e.parent) ||
        ts.isTypeAssertionExpression(e.parent) ||
        ts.isSatisfiesExpression(e.parent)
      ) {
        e = e.parent;
      }
      const p = e.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === e) ||
        (ts.isPropertyAssignment(p) && p.name === e) ||
        ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === e) ||
        (ts.isBindingElement(p) && p.propertyName === e) ||
        ts.isTypeNode(p) ||
        ts.isTypeReferenceNode(p) ||
        ts.isQualifiedName(p);
      const ok =
        isName ||
        ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === e) ||
        (ts.isCallExpression(p) && g.gradedCalls.has(p) && p.arguments.includes(e as ts.Expression)) ||
        (ts.isBinaryExpression(p) && COMPARISON.has(p.operatorToken.kind)) ||
        // A write target is reported above, not as an escape.
        (ts.isBinaryExpression(p) && isAssignmentOp(p.operatorToken.kind) && p.left === e) ||
        ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && p.operand === e) ||
        ts.isShorthandPropertyAssignment(p) && ts.isObjectLiteralExpression(p.parent) && ts.isBinaryExpression(p.parent.parent) && p.parent.parent.left === p.parent;
      if (!ok) found.push(`${at(n)}: \`${n.text}\` escapes into ${say(p).slice(0, 90)} — an alias the cut cannot follow (${g.objects.has(n.text) ? "N14e" : "N14f"})`);
    }
    ts.forEachChild(n, walk);
  };
  walk(root);
  return found;
}

/**
 * N14 over the scene: the three functions that grade (the frame callback
 * WHOLE — a write after the call reaches the next frame's step loop through
 * the same binding —, the step-loop grade, `gradeTakenSteps`) and, for the
 * names RuntimeDriver receives as props, RuntimeDriver whole.
 */
function guardInputsOf(
  sf: ts.SourceFile,
  driver: ts.FunctionDeclaration | null,
  frameFn: ts.Node,
  stepsDeclStatement: ts.Statement,
  frameGradedCall: ts.CallExpression,
  loop: { fn: ts.Node; takenStatement: ts.Statement | null; call: ts.CallExpression; fill: ts.Node } | null,
  holder: { fn: ts.ArrowFunction | ts.FunctionExpression; call: ts.CallExpression; statement: ts.Statement } | null,
  refs: ReadonlySet<string> = new Set(),
): string[] {
  const found: string[] = [];
  const names = new Set(GUARDED_NAMES);
  const objects = new Set(GUARDED_OBJECTS);
  // N14 f: in the two CALLERS the refs the grading reads are guarded names too.
  const callerNames = new Set([...names, ...refs]);
  const declOf = (st: ts.Statement | null): ts.Node[] => {
    if (st === null || !ts.isVariableStatement(st)) return [];
    const d = st.declarationList.declarations[0];
    return [d, ...(ts.isIdentifier(d.name) ? [d.name] : [])];
  };
  // FRAME_STEPS by its exact syntax (N14 c, the frame's half).
  if (flatText(stepsDeclStatement, sf) !== FRAME_STEPS) {
    found.push(`frame callback line ${lineOf(stepsDeclStatement, sf)}: \`steps\` is not declared as \`${FRAME_STEPS}\` (N14c) — ${`\`${flatText(stepsDeclStatement, sf).slice(0, 100)}\``}`);
  }
  found.push(
    ...guardWritesOf(frameFn, sf, {
      where: "frame callback",
      names: callerNames,
      objects,
      refs,
      pinned: new Set(declOf(stepsDeclStatement)),
      gradedCalls: new Set([frameGradedCall]),
      escapes: true,
    }),
  );
  if (loop) {
    found.push(
      ...guardWritesOf(loop.fn, sf, {
        where: "step-loop grade",
        names: callerNames,
        objects,
        refs,
        pinned: new Set(declOf(loop.takenStatement)),
        gradedCalls: new Set([loop.call]),
        escapes: true,
      }),
    );
  }
  if (holder) {
    // `gradeTakenSteps`: its own parameters are guarded inside it too.
    const own = new Set(names);
    const pinned = new Set<ts.Node>([holder.statement, ...((holder.statement as ts.VariableStatement).declarationList?.declarations ?? [])]);
    for (const p of holder.fn.parameters) {
      const ids: ts.Identifier[] = [];
      boundIdentifiers(p.name, ids);
      for (const id of ids) {
        own.add(id.text);
        pinned.add(p);
        pinned.add(id);
      }
    }
    const holderObjects = new Set([...objects, "steps"]);
    found.push(...guardWritesOf(holder.fn, sf, { where: "gradeTakenSteps", names: own, objects: holderObjects, pinned, gradedCalls: new Set([holder.call]), escapes: true }));
    // …and no exit before its stepPhysics call (N11 for the graded function).
    const st = holder.call.parent;
    if (ts.isReturnStatement(st) && st.parent === holder.fn.body && ts.isBlock(holder.fn.body)) {
      const body = holder.fn.body;
      found.push(...earlyExitsOf(body.statements.slice(0, body.statements.indexOf(st)), holder.fn, body, sf, null, "gradeTakenSteps"));
    } else {
      found.push(`gradeTakenSteps line ${lineOf(holder.call, sf)}: its \`gradeGrid.stepPhysics(…)\` is not the expression of a top-level \`return\` of its body`);
    }
  }
  if (driver) {
    // RuntimeDriver whole, for the PROPS and the graded function: bound only
    // by RuntimeDriver's parameters (and `const gradeTakenSteps = …`), never
    // written; no member of the grid or the step record written anywhere in
    // it; the step-loop ref's member written only by the layout effect that
    // fills it, outside the grade it installs.
    const props = new Set(["paused", "gradeGrid", "stepTrackRef", "stepLoopGradeRef", "gradeTakenSteps"]);
    const pinned = new Set<ts.Node>();
    const param = driver.parameters[0];
    if (param) {
      const ids: ts.Identifier[] = [];
      boundIdentifiers(param.name, ids);
      for (const id of ids) pinned.add(id);
      pinned.add(param);
      const mark = (n: ts.Node) => {
        if (ts.isBindingElement(n)) pinned.add(n);
        ts.forEachChild(n, mark);
      };
      mark(param.name);
    }
    if (holder) {
      pinned.add(holder.statement);
      for (const d of (holder.statement as ts.VariableStatement).declarationList.declarations) {
        pinned.add(d);
        if (ts.isIdentifier(d.name)) pinned.add(d.name);
      }
    }
    const skip = new Set<ts.Node>([frameFn, ...(loop ? [loop.fn] : []), ...(holder ? [holder.fn] : [])]);
    const all = guardWritesOf(driver, sf, {
      where: "RuntimeDriver",
      names: props,
      objects: new Set(["gradeGrid", "stepTrackRef", "stepLoopGradeRef"]),
      // N14 f: no member of a ref the grading reads is written anywhere in
      // RuntimeDriver but inside the graded function itself.
      refs,
      pinned,
      gradedCalls: new Set(),
      skip,
      escapes: false,
    });
    // The layout effect's own two writes of `stepLoopGradeRef.current` (fill
    // and cleanup) are its job.
    for (const f of all) {
      if (loop && /a member of `stepLoopGradeRef`/.test(f)) {
        const line = Number(/line (\d+)/.exec(f)?.[1]);
        const a = lineOf(loop.fill, sf);
        const b = sf.getLineAndCharacterOfPosition(loop.fill.getEnd()).line + 1;
        if (line >= a && line <= b) continue;
      }
      found.push(f);
    }
  }
  return found;
}

// ───────────────────────────────────────────────────────────────────────────
// N12 (round 5): branch probes — which branches of the frame callback ran
// ───────────────────────────────────────────────────────────────────────────

export interface BranchProbe {
  id: number;
  /** LessonScene.tsx line of the branch's statement. */
  line: number;
  /** The construct whose branch it is (condition / loop head), flattened. */
  what: string;
}

/**
 * `st`'s text with a `__hit(id)` at the head of every branch inside it — the
 * `then` and `else` of every `if` (an `else if` is probed through its own
 * `then`), every loop body — at any depth, nested function bodies included.
 * A probe only counts; the statements run as the scene spells them.
 */
function probedStatementText(st: ts.Statement, sf: ts.SourceFile, probes: BranchProbe[]): string {
  const start = st.getStart(sf);
  const text = st.getText(sf);
  const edits: Array<{ at: number; text: string; order: number }> = [];
  let depth = 0;
  const probe = (branch: ts.Statement, owner: ts.Node, label: string) => {
    const id = probes.length;
    const head = ts.isIfStatement(owner)
      ? `if (${flatText(owner.expression, sf)})`
      : flatText(owner, sf).split("{")[0].trim();
    probes.push({ id, line: lineOf(branch, sf), what: `${head} ${label}`.slice(0, 120) });
    const a = branch.getStart(sf) - start;
    const b = branch.getEnd() - start;
    if (ts.isBlock(branch)) {
      edits.push({ at: a + 1, text: ` __hit(${id});`, order: depth });
    } else {
      // Opens: inner after outer at one position; closes: inner before outer.
      edits.push({ at: a, text: `{ __hit(${id}); `, order: depth });
      edits.push({ at: b, text: " }", order: -depth });
    }
  };
  const walk = (n: ts.Node) => {
    depth++;
    if (ts.isIfStatement(n)) {
      probe(n.thenStatement, n, "→ then");
      if (n.elseStatement && !ts.isIfStatement(n.elseStatement)) probe(n.elseStatement, n, "→ else");
    } else if (ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)) {
      probe(n.statement, n, "→ body");
    }
    ts.forEachChild(n, walk);
    depth--;
  };
  walk(st);
  // Apply from the end; at one position, the edit to come FIRST in the text
  // is applied LAST.
  edits.sort((x, y) => (y.at - x.at) || (y.order - x.order));
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at);
  return out;
}

/** JavaScript globals a scene statement may read without the harness. */
const JS_GLOBALS = new Set([
  "undefined",
  "NaN",
  "Infinity",
  "Math",
  "Number",
  "Object",
  "Array",
  "JSON",
  "Error",
  "String",
  "Boolean",
  "Set",
  "Map",
  "WeakMap",
  "Symbol",
  "console",
  "globalThis",
]);

/** The names `nodes` read and do not declare (syntax only: a name declared
 *  anywhere in them counts as declared; property names, object keys, labels
 *  and everything inside a type are not reads). */
function freeNamesOf(nodes: readonly ts.Node[], sf: ts.SourceFile, alsoDeclared: Iterable<string> = []): Set<string> {
  const declared = new Set<string>(alsoDeclared);
  const reads = new Set<string>();
  const inType = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p && !ts.isSourceFile(p); p = p.parent) {
      if (ts.isTypeNode(p)) return true;
      if (ts.isStatement(p)) return false;
    }
    return false;
  };
  const bindNames = (b: ts.BindingName) => {
    if (ts.isIdentifier(b)) declared.add(b.text);
    else for (const e of b.elements) if (!ts.isOmittedExpression(e)) bindNames(e.name);
  };
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) bindNames(n.name);
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) declared.add(n.name.text);
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const notARead =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isMethodDeclaration(p) && p.name === n) ||
        ((ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === n) ||
        ts.isLabeledStatement(p) ||
        ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === n) ||
        ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        ((ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p)) && p.name === n) ||
        ((ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p)) && p.name === n) ||
        inType(n);
      if (!notARead) reads.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  for (const n of nodes) walk(n);
  for (const d of declared) reads.delete(d);
  return reads;
}

/** LessonScene's module-level `const`/`function` declarations, by name. */
function moduleDeclsOf(sf: ts.SourceFile): Map<string, ts.Statement> {
  const out = new Map<string, ts.Statement>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) out.set(st.name.text, st);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.set(d.name.text, st);
    }
  }
  return out;
}

/**
 * What the frame callback reads, resolved (round 4): the module-level
 * declarations of LessonScene it reaches (transitively — `cabinPollBaseline`
 * reads the press threshold), compiled with it; and every remaining name,
 * which must be supplied by the harness (`SCENE_GRADE_NAMES`), be compiled
 * beside it (`compiledBeside`), or be a JavaScript global — else THROW, naming
 * it.
 */
function resolveFrameNames(
  nodes: readonly ts.Statement[],
  sf: ts.SourceFile,
  compiledBeside: readonly string[],
): { moduleDecls: string[]; free: string[] } {
  const decls = moduleDeclsOf(sf);
  const taken: ts.Statement[] = [];
  const supplied = new Set<string>([...SCENE_GRADE_NAMES, ...compiledBeside]);
  let pending = freeNamesOf(nodes, sf, ["delta"]);
  const seen = new Set<string>();
  const free = new Set<string>();
  while (pending.size > 0) {
    const next = new Set<string>();
    for (const name of pending) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (JS_GLOBALS.has(name)) continue;
      if (compiledBeside.includes(name)) continue;
      if (supplied.has(name)) {
        free.add(name);
        continue;
      }
      const decl = decls.get(name);
      if (decl) {
        if (!taken.includes(decl)) {
          taken.push(decl);
          for (const n of freeNamesOf([decl], sf)) next.add(n);
        }
        continue;
      }
      throw new Error(
        `the frame callback reads \`${name}\`, which no harness supplies (not in SCENE_GRADE_NAMES, not a module-level declaration of LessonScene, not a JavaScript global)`,
      );
    }
    pending = next;
  }
  // Source order, so a declaration precedes its readers as in the module.
  taken.sort((a, b) => a.getStart(sf) - b.getStart(sf));
  return { moduleDecls: taken.map((st) => st.getText(sf)), free: [...free].sort() };
}

/**
 * The frame callback compiled as `__frameRun(delta)` and `__frame(delta)`:
 * every statement as the scene spells it, and the call's statement with the
 * call's value counted — the one rewrite, made to a statement the cut has
 * just proved is exactly `<call>;`.
 */
function frameFunctionText(region: readonly string[], callText: string): string {
  const last = region[region.length - 1];
  if (last.replace(/\s+/g, " ") !== `${callText.replace(/\s+/g, " ")};`) {
    throw new Error("the region's last statement is not the graded call");
  }
  return [
    "const __hits = new Map();",
    "const __hit = (id) => void __hits.set(id, (__hits.get(id) ?? 0) + 1);",
    "let __frameCalls = 0;",
    "const __frameRun = (delta) => {",
    "let __callsHere = 0;",
    "let __graded = 0;",
    // The callback in a function of its own, so a `return` inside it ends the
    // callback as it would in the scene — and is then counted below.
    "(() => {",
    ...region.slice(0, -1),
    `__callsHere++; __frameCalls++; __graded = (${callText});`,
    "})();",
    "return { calls: __callsHere, graded: __graded };",
    "};",
    "const __frame = (delta) => {",
    "const r = __frameRun(delta);",
    "if (r.calls !== 1) throw new Error(`the frame callback made its graded call ${r.calls} times`);",
    "return r.graded;",
    "};",
  ].join("\n");
}

/** The frame callback's names, set as the scene sets them: a fresh session
 *  clock, the frame's delta clamp, the reverse assist and both stuck watches
 *  — real instances — and the pre-drive and dashboard state a mounted
 *  RuntimeDriver starts with (the scene's own `createPreDriveSignalTracker`,
 *  `observeControlSignal`, `readyToMoveOff`, `writeDashboardStatus`; empty
 *  event queues; no shell dashboard). With no cabin (every harness here) the
 *  assist and the pre-drive block are skipped and both watches reset, exactly
 *  as in the scene. */
export function sceneFrameScope(): Pick<
  Record<SceneGradeName, unknown>,
  | "sessionClock"
  | "sessionClockAdvance"
  | "reverseAssistEnabled"
  | "driveLocked"
  | "reverseAssist"
  | "assistShiftingRef"
  | "reverseStuck"
  | "onReversePedalStuck"
  | "stuckStart"
  | "onStuckStart"
  | "dashboardStatusRef"
  | "dashScratchRef"
  | "writeDashboardStatus"
  | "createDashboardStatus"
  | "tierCapKmh"
  | "tierNameBg"
  | "drivelineEventsRef"
  | "glanceQueueRef"
  | "prevLockedRef"
  | "trackerRef"
  | "createPreDriveSignalTracker"
  | "pollRef"
  | "onPreDriveStep"
  | "observeControlSignal"
  | "readyToMoveOff"
  | "onBlockedDriveAttempt"
  | "onDrivelineRejection"
  | "onTransmissionChanged"
> {
  return {
    sessionClock: new PhysicsSessionClock(),
    sessionClockAdvance,
    reverseAssistEnabled: true,
    driveLocked: false,
    reverseAssist: new ReverseAssist(),
    assistShiftingRef: { current: false },
    reverseStuck: new ReverseStuckWatch(),
    onReversePedalStuck: undefined,
    stuckStart: new StuckStartWatch(),
    onStuckStart: undefined,
    dashboardStatusRef: undefined,
    dashScratchRef: { current: null },
    writeDashboardStatus,
    createDashboardStatus,
    tierCapKmh: undefined,
    tierNameBg: undefined,
    drivelineEventsRef: { current: [] },
    glanceQueueRef: { current: [] },
    prevLockedRef: { current: false },
    trackerRef: { current: createPreDriveSignalTracker() },
    createPreDriveSignalTracker,
    // The scene's `cabinPollBaseline(null, 0)`.
    pollRef: { current: { seatbeltOn: false, headlights: "off", indicator: "off", brakeArmed: false } },
    onPreDriveStep: () => {},
    observeControlSignal,
    readyToMoveOff,
    onBlockedDriveAttempt: () => {},
    onDrivelineRejection: undefined,
    onTransmissionChanged: undefined,
  };
}

/** Cut the scene's graded statements out of LessonScene.tsx and compile them. */
export function sceneGradeCut(): SceneGradeCut {
  if (cache) return cache;
  const cut = sceneGradeCutOf(readFileSync(path.join(SRC, "components/sim/LessonScene.tsx"), "utf-8"));
  // V6-1 (integration): the scene's step-loop grade is only as good as its
  // caller — VehicleRig's before-step callback, which must run it FIRST and
  // unconditionally on every physics step.
  if (cut.stepLoopVia === "layoutRef") {
    const rig = rigStepLoopCallRefusals(readFileSync(path.join(SRC, "components/sim/VehicleRig.tsx"), "utf-8"));
    if (rig.length > 0) throw new Error(`the rig does not run the scene's step-loop grade first and unconditionally before every physics step (V6-1): ${rig.join("; ")}`);
  }
  cache = cut;
  return cache;
}

/** The same cut of ANY text of LessonScene.tsx — the scene's own (above), or a
 *  test's altered copy, to show what the cut refuses and what an altered
 *  region does when it runs. Not cached. */
export function sceneGradeCutOf(text: string, options: SceneGradeCutOptions = {}): SceneGradeCut {
  const refuse = options.refuseEarlyExits ?? true;
  const probes: BranchProbe[] = [];
  /** The region as compiled: each statement as the scene spells it, or with
   *  branch probes (never the graded call's own statement). */
  const compiledRegion = (nodes: readonly ts.Statement[]) =>
    nodes.map((st, i) => (options.probeBranches && i < nodes.length - 1 ? probedStatementText(st, sf, probes) : st.getText(sf)));
  /** N11: refuse — or, on request, list — every early exit. */
  const exitsChecked = (found: string[]): string[] => {
    if (found.length > 0 && refuse) {
      const n14 = found.filter((f) => f.includes("(N14"));
      const n11 = found.filter((f) => !f.includes("(N14"));
      const parts: string[] = [];
      if (n11.length > 0) parts.push(`the scene can end a frame before its graded call (N11): ${n11.join("; ")}`);
      if (n14.length > 0) parts.push(`the scene can write what its exits or its graded call read (N14): ${n14.join("; ")}`);
      throw new Error(parts.join(" | "));
    }
    return found;
  };
  const source = text.replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile("LessonScene.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [];
  const frameCalls: ts.CallExpression[] = [];
  const beforeSteps: ts.CallExpression[] = [];
  const layoutFills: ts.CallExpression[] = [];
  let driver: ts.FunctionDeclaration | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "RuntimeDriver") driver = n;
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      if (callee === "gradeGrid.stepPhysics") calls.push(n);
      else if (callee === "gradeTakenSteps") frameCalls.push(n);
      else if (callee === "useBeforePhysicsStep") beforeSteps.push(n);
      else if (callee === "useLayoutEffect" && n.arguments[0]?.getText(sf).includes("stepLoopGradeRef.current =")) layoutFills.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (calls.length !== 1) throw new Error(`expected one gradeGrid.stepPhysics call in LessonScene, found ${calls.length}`);
  const call = calls[0];
  const callText = call.getText(sf);
  const body = enclosingBody(call);
  if (!body) throw new Error("the stepPhysics call is not inside a function body");
  const names = [...SCENE_GRADE_NAMES];
  const d = driver as ts.FunctionDeclaration | null;

  // ── the repair's shape: the expression lives in `gradeTakenSteps` ────────
  const holder = body.parent.parent;
  if (ts.isVariableDeclaration(holder) && holder.name.getText(sf) === "gradeTakenSteps") {
    const holderStatement = holder.parent.parent;
    if (!ts.isVariableStatement(holderStatement)) throw new Error("`gradeTakenSteps` is not a plain `const … = (…) => {…}` statement");
    const inDriver = (n: ts.Node) => d !== null && n.getStart(sf) >= d.getStart(sf) && n.getEnd() <= d.getEnd();
    if (!inDriver(holderStatement)) throw new Error("`gradeTakenSteps` is not declared in RuntimeDriver");
    // Its callers: one in the frame callback (beside `const steps = …`), and
    // any inside the before-step callback.
    const before = beforeSteps.filter(inDriver);
    if (before.length > 1) throw new Error(`expected at most one useBeforePhysicsStep in RuntimeDriver, found ${before.length}`);
    const beforeFn = before.length === 1 ? before[0].arguments[0] : null;
    if (beforeFn && !(ts.isArrowFunction(beforeFn) || ts.isFunctionExpression(beforeFn))) {
      throw new Error("RuntimeDriver's useBeforePhysicsStep is not handed a function literal");
    }
    // Round 2: the step-loop grade is put in `stepLoopGradeRef` by a layout
    // effect of RuntimeDriver's.
    const fills = layoutFills.filter(inDriver);
    if (fills.length > 1) throw new Error(`expected at most one layout effect filling stepLoopGradeRef in RuntimeDriver, found ${fills.length}`);
    if (fills.length === 1 && beforeFn) throw new Error("RuntimeDriver both fills stepLoopGradeRef and registers a useBeforePhysicsStep");
    const fill = fills.length === 1 ? fills[0] : null;
    const within = (n: ts.Node, root: ts.Node) => n.getStart(sf) >= root.getStart(sf) && n.getEnd() <= root.getEnd();
    const inFrame = frameCalls.filter((c) => !(beforeFn && within(c, beforeFn)) && !(fill && within(c, fill)));
    if (inFrame.length !== 1) throw new Error(`expected one frame call of gradeTakenSteps, found ${inFrame.length}`);
    const frameCallText = inFrame[0].getText(sf);
    const { stepsDecl, region, nodes, fn, body: frameBody, stepsStatement } = frameRegionOf(inFrame[0], sf, d);
    // N14: the step-loop grade's function, its first statement and its call.
    const loopCalls = fill ? frameCalls.filter((c) => within(c, fill)) : [];
    const loopCall = loopCalls.length === 1 ? loopCalls[0] : null;
    const loopBody = loopCall?.parent.parent;
    const loopFn = loopBody?.parent;
    const loop =
      fill && loopCall && loopBody && ts.isBlock(loopBody) && loopFn && (ts.isArrowFunction(loopFn) || ts.isFunctionExpression(loopFn))
        ? { fn: loopFn, takenStatement: loopBody.statements[0] ?? null, call: loopCall, fill }
        : null;
    const holderFn = holder.initializer;
    // N14 f (V6-2): the refs the grading reads, derived from its syntax.
    const guardedRefs = gradedRefsOf([...(holderFn ? [holderFn] : []), ...(loop ? [loop.fn] : [])]);
    const earlyExits = exitsChecked([
      ...earlyExitsOf(nodes.slice(0, -1), fn, frameBody, sf, FRAME_PAUSE_GUARD, "frame callback"),
      ...(fill ? stepLoopExitsOf(fill, frameCalls, sf) : []),
      ...guardInputsOf(
        sf,
        d,
        fn,
        stepsStatement,
        inFrame[0],
        loop,
        holderFn && (ts.isArrowFunction(holderFn) || ts.isFunctionExpression(holderFn)) ? { fn: holderFn, call, statement: holderStatement } : null,
        new Set(guardedRefs),
      ),
    ]);
    const { moduleDecls, free } = resolveFrameNames(nodes, sf, ["gradeTakenSteps"]);
    const beforeStepText = fill ? fill.getText(sf) : beforeFn ? beforeFn.getText(sf) : null;
    const js = transpile(
      [
        ...moduleDecls,
        holderStatement.getText(sf),
        fill
          ? // The scene's own effect, run once on a fresh ref: what it leaves
            // there is what VehicleRig's before-step callback would call.
            [
              "const stepLoopGradeRef = { current: null };",
              "const useLayoutEffect = (effect) => void effect();",
              `${beforeStepText};`,
              "const __beforeStep = stepLoopGradeRef.current;",
              'if (typeof __beforeStep !== "function") throw new Error("the layout effect of the scene left no function in stepLoopGradeRef");',
            ].join("\n")
          : `const __beforeStep = ${beforeStepText ?? "null"};`,
        frameFunctionText(compiledRegion(nodes), frameCallText),
        "return { frame: __frame, frameRun: __frameRun, frameCalls: () => __frameCalls, beforeStep: __beforeStep, branchHits: () => Object.fromEntries(__hits) };",
      ].join("\n"),
    );
    const make = new Function(...names, `"use strict";\n${js}`) as (...scope: unknown[]) => SceneGradeBound;
    const cut: SceneGradeCut = {
      shape: "function",
      callText,
      stepsDecl,
      frameRegion: region,
      frameModuleDecls: moduleDecls,
      frameFreeNames: free,
      frameCallText,
      beforeStepText,
      stepLoopVia: fill ? "layoutRef" : beforeFn ? "rapierHook" : null,
      earlyExits,
      guardedRefs,
      branchProbes: probes,
      bind: (scope) => make(...names.map((n) => scope[n])),
    };
    return cut;
  }

  // ── the base's shape: the expression sits in the frame callback ──────────
  const { stepsDecl, region, nodes, fn, body: frameBody, stepsStatement } = frameRegionOf(call, sf, d);
  const earlyExits = exitsChecked([
    ...earlyExitsOf(nodes.slice(0, -1), fn, frameBody, sf, FRAME_PAUSE_GUARD, "frame callback"),
    ...guardInputsOf(sf, d, fn, stepsStatement, call, null, null),
  ]);
  const { moduleDecls, free } = resolveFrameNames(nodes, sf, []);
  const js = transpile(
    [
      ...moduleDecls,
      frameFunctionText(compiledRegion(nodes), callText),
      "return { frame: __frame, frameRun: __frameRun, frameCalls: () => __frameCalls, beforeStep: null, branchHits: () => Object.fromEntries(__hits) };",
    ].join("\n"),
  );
  const make = new Function(...names, `"use strict";\n${js}`) as (...scope: unknown[]) => SceneGradeBound;
  const cut: SceneGradeCut = {
    shape: "inline",
    callText,
    stepsDecl,
    frameRegion: region,
    frameModuleDecls: moduleDecls,
    frameFreeNames: free,
    frameCallText: null,
    beforeStepText: null,
    stepLoopVia: null,
    earlyExits,
    guardedRefs: [],
    branchProbes: probes,
    bind: (scope) => make(...names.map((n) => scope[n])),
  };
  return cut;
}
