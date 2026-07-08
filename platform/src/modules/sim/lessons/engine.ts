/**
 * Lesson session engine — the pure lifecycle reducer of a driving lesson:
 *
 *   create → [preDrive machine, if the spec enables it] → driving
 *          → objectives complete in order → completed
 *   (finishSession = manual end for free drive / early exit;
 *    abortSession   = student quit, graded as not passed)
 *
 * It owns NOTHING the lower layers already own: law adjudication lives in
 * rules/ (reduceTick), the pre-drive choreography in procedures/ — this file
 * only orchestrates them, advances objectives (objectives.ts) and accumulates
 * every scorable event for the final buildSessionSummary fold.
 *
 * Everything is pure & immutable: same state + same input => same output.
 * The React shell keeps the state in a ref and re-renders from snapshots.
 */

import type { HudEvent, LessonSpec } from "../contracts";
import {
  buildSessionSummary,
  createRuleEngine,
  isScorableEvent,
  reduceTick,
  type RuleEngineConfig,
  type RuleEvent,
  type ScorableEvent,
  type SimTick,
} from "../rules";
import { coachStep } from "../scenarios";
import {
  applyPreDriveAction,
  createPreDriveMachine,
  type PreDriveStepId,
} from "../procedures";
import { createEvalState, parseObjectiveParams, stepObjective } from "./objectives";
import type {
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveProgress,
  ObjectiveOutcome,
} from "./types";

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface LessonEngineOptions {
  /** Night flag for the pre-drive machine + rule engine (headlights). */
  isNight?: boolean;
  ruleConfig?: Partial<RuleEngineConfig>;
}

export function createLessonSession(
  lesson: LessonSpec,
  opts: LessonEngineOptions = {},
): LessonSessionState {
  const isNight = opts.isNight ?? lesson.environment?.timeOfDay === "night";

  const objectives: ObjectiveProgress[] = lesson.objectives.map((spec, i) => ({
    spec,
    params: parseObjectiveParams(spec),
    status: i === 0 ? "active" : "pending",
    progress: 0,
    completedAtSec: null,
  }));

  return {
    lesson,
    phase: lesson.preDrive ? "preDrive" : "driving",
    isNight,
    preDrive: lesson.preDrive ? createPreDriveMachine({ isNight }) : null,
    rules: createRuleEngine(opts.ruleConfig),
    objectives,
    evalStates: objectives.map((o) => createEvalState(o.params)),
    currentObjectiveIndex: 0,
    events: [],
    scenarioEncounters: {},
    lastT: 0,
    endedAtSec: null,
  };
}

// ---------------------------------------------------------------------------
// Step results — every transition returns the new state + HUD events to show
// ---------------------------------------------------------------------------

export interface LessonStepResult {
  state: LessonSessionState;
  hudEvents: HudEvent[];
}

/** Map rule-engine output onto the HUD event contract (toasts). */
function toHudEvents(events: ReadonlyArray<RuleEvent>): HudEvent[] {
  return events.map((e) =>
    e.kind === "violation"
      ? {
          kind: "violation" as const,
          titleBg: e.titleBg,
          points: e.points,
          severity: e.severityClass,
          lawRef: e.lawRef,
        }
      : { kind: "commendation" as const, titleBg: e.titleBg },
  );
}

// ---------------------------------------------------------------------------
// Pre-drive phase
// ---------------------------------------------------------------------------

/**
 * Apply one pre-drive checklist action. No-op outside the preDrive phase.
 * Completing "move-off" finishes the procedure and unlocks the driving phase.
 */
export function applyPreDriveStep(
  prev: LessonSessionState,
  stepId: PreDriveStepId,
  tSec: number,
): LessonStepResult {
  if (prev.phase !== "preDrive" || prev.preDrive === null) {
    return { state: prev, hudEvents: [] };
  }

  const { machine, events } = applyPreDriveAction(prev.preDrive, stepId, tSec);
  const scorable = events.filter(isScorableEvent);
  const hudEvents = toHudEvents(scorable);

  const finished = events.some((e) => e.kind === "procedureCompleted");
  if (finished) {
    hudEvents.push({ kind: "objectiveComplete", titleBg: "Подготовка за потегляне" });
  }

  return {
    state: {
      ...prev,
      preDrive: machine,
      phase: finished ? "driving" : prev.phase,
      events: scorable.length > 0 ? [...prev.events, ...scorable] : prev.events,
      lastT: Math.max(prev.lastT, tSec),
    },
    hudEvents,
  };
}

// ---------------------------------------------------------------------------
// Driving phase
// ---------------------------------------------------------------------------

/**
 * Advance the session by one SimTick frame. Runs the rule engine in every
 * live phase (the law applies from second zero); objectives advance only
 * while driving. When the last objective completes the session completes.
 */
export function applyTick(prev: LessonSessionState, tick: SimTick): LessonStepResult {
  if (prev.phase === "completed" || prev.phase === "aborted") {
    return { state: prev, hudEvents: [] };
  }

  const { state: rules, events: ruleEvents } = reduceTick(prev.rules, tick);

  // Coach the violations: teach-first-then-grade. A first, teachable mistake is
  // shown live as a lesson (with its law citation) but does NOT count toward the
  // score; repeats — and any dangerous/terminating error — are graded.
  let encounters = prev.scenarioEncounters;
  const hudEvents: HudEvent[] = [];
  const scoredEvents: ScorableEvent[] = [];
  for (const e of ruleEvents) {
    if (e.kind === "commendation") {
      hudEvents.push({ kind: "commendation", titleBg: e.titleBg });
      scoredEvents.push(e);
      continue;
    }
    const step = coachStep(encounters, {
      code: e.code,
      severityClass: e.severityClass,
      terminateSession: e.terminateSession,
    });
    encounters = step.encounters;
    if (step.decision.scored) {
      hudEvents.push({
        kind: "violation",
        titleBg: e.titleBg,
        points: e.points,
        severity: e.severityClass,
        lawRef: e.lawRef,
      });
      scoredEvents.push(e);
    } else {
      hudEvents.push({
        kind: "lesson",
        titleBg: e.titleBg,
        explanationBg: e.explanationBg,
        lawRef: e.lawRef,
      });
    }
  }

  let objectives = prev.objectives;
  let evalStates = prev.evalStates;
  let currentIndex = prev.currentObjectiveIndex;
  let phase: LessonPhase = prev.phase;
  let endedAtSec = prev.endedAtSec;

  if (prev.phase === "driving" && currentIndex < objectives.length) {
    objectives = [...objectives];
    evalStates = [...evalStates];

    // Advance sequentially: a completing objective activates the next, which
    // may complete on the very same frame (e.g. adjacent zones).
    let guard = objectives.length;
    while (currentIndex < objectives.length && guard-- > 0) {
      const current = objectives[currentIndex];
      const step = stepObjective(current.params, evalStates[currentIndex], tick);
      evalStates[currentIndex] = step.evalState;

      if (!step.done) {
        objectives[currentIndex] = {
          ...current,
          status: "active",
          progress: step.progress,
        };
        break;
      }

      objectives[currentIndex] = {
        ...current,
        status: "done",
        progress: 1,
        completedAtSec: tick.t,
      };
      hudEvents.push({ kind: "objectiveComplete", titleBg: current.spec.titleBg });
      currentIndex += 1;
      if (currentIndex < objectives.length) {
        objectives[currentIndex] = { ...objectives[currentIndex], status: "active" };
      }
    }

    // All objectives done => the lesson route is complete.
    if (currentIndex >= objectives.length && objectives.length > 0) {
      phase = "completed";
      endedAtSec = tick.t;
    }
  }

  return {
    state: {
      ...prev,
      rules,
      objectives,
      evalStates,
      currentObjectiveIndex: currentIndex,
      phase,
      endedAtSec,
      events: scoredEvents.length > 0 ? [...prev.events, ...scoredEvents] : prev.events,
      scenarioEncounters: encounters,
      lastT: Math.max(prev.lastT, tick.t),
    },
    hudEvents,
  };
}

// ---------------------------------------------------------------------------
// Manual endings
// ---------------------------------------------------------------------------

/**
 * End the session deliberately (free drive has no objectives; a student may
 * also park and finish early). Objectives left open simply stay incomplete.
 */
export function finishSession(prev: LessonSessionState, tSec: number): LessonSessionState {
  if (prev.phase === "completed" || prev.phase === "aborted") return prev;
  return { ...prev, phase: "completed", endedAtSec: tSec, lastT: Math.max(prev.lastT, tSec) };
}

/** Quit without finishing — the attempt is recorded but can never pass. */
export function abortSession(prev: LessonSessionState, tSec: number): LessonSessionState {
  if (prev.phase === "completed" || prev.phase === "aborted") return prev;
  return { ...prev, phase: "aborted", endedAtSec: tSec, lastT: Math.max(prev.lastT, tSec) };
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------

/**
 * Fold the whole session into the official-style result: score breakdown per
 * severity class, pass/fail per the exam rule, objective outcomes and the
 * lesson verdict (official pass AND route completed AND not aborted).
 */
export function buildLessonResult(state: LessonSessionState): LessonResult {
  const summary = buildSessionSummary(state.events);

  const objectives: ObjectiveOutcome[] = state.objectives.map((o) => ({
    id: o.spec.id,
    titleBg: o.spec.titleBg,
    done: o.status === "done",
    completedAtSec: o.completedAtSec,
  }));

  const completedAll = objectives.every((o) => o.done);
  const aborted = state.phase === "aborted";

  return {
    lessonId: state.lesson.id,
    summary,
    objectives,
    completedAll,
    aborted,
    passed: summary.passed && completedAll && !aborted,
    score: summary.score.totalPoints,
    durationSec: state.endedAtSec ?? state.lastT,
  };
}
