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

import type { HudEvent, LessonSpec, StagedEventOutcome } from "../contracts";
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
import { applyEscalations, type PenaltyEscalation } from "./escalation";
import type {
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveProgress,
  ObjectiveOutcome,
  TeachMoment,
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
    // A2: the lesson default is "instruction" (guided first contact); specs
    // opt into "practice"/"assess" via the additive preDriveMode field.
    preDrive: lesson.preDrive
      ? createPreDriveMachine({ isNight, mode: lesson.preDriveMode ?? "instruction" })
      : null,
    rules: createRuleEngine(opts.ruleConfig),
    objectives,
    evalStates: objectives.map((o) => createEvalState(o.params)),
    currentObjectiveIndex: 0,
    events: [],
    scenarioEncounters: {},
    penaltyEscalations: [],
    lastTeachMomentAtSec: null,
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
  /**
   * A9: first-encounter teach moments the shell must PAUSE for (freeze
   * physics, show the mini-lesson card, resume on acknowledgment). Additive:
   * only applyTick produces them; several in one result merge into a single
   * pause (the shell queues the cards).
   */
  teachMoments?: TeachMoment[];
}

/**
 * A9 rate limit: minimum sim-seconds between two teach-moment PAUSES. Teach
 * moments landing on the SAME tick still all emit (they merge into one pause);
 * a later one inside this window downgrades to the classic non-blocking
 * lesson toast, so a mistake cluster never chains modal interruptions. Sim
 * time freezes during the pause itself, so the window is measured in actual
 * driving time.
 */
export const TEACH_PAUSE_MIN_GAP_S = 15;

/** Map rule-engine output onto the HUD event contract (toasts). */
function toHudEvents(events: ReadonlyArray<RuleEvent>): HudEvent[] {
  return events.map((e) =>
    e.kind === "violation"
      ? {
          kind: "violation" as const,
          titleBg: e.titleBg,
          explanationBg: e.explanationBg,
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
 * Apply one PERFORMED (or info-confirmed) pre-drive step. No-op outside the
 * preDrive phase. Since A2 the caller is the 3D scene's transition observer
 * (procedures/performedSteps.ts) for performed steps and the read-only
 * checklist's confirm button for info steps — never a click-to-complete
 * path. Completing "move-off" finishes the procedure and unlocks driving.
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

  // A2 teach-first: an out-of-order step in instruction/practice mode is
  // coached (lesson toast with the authored law-cited WHY), never scored.
  for (const e of events) {
    if (e.kind === "stepOutOfOrder") {
      hudEvents.push({
        kind: "lesson",
        titleBg: e.titleBg,
        explanationBg: e.explanationBg,
        lawRef: e.lawRef,
      });
    }
  }

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

/**
 * QW10 drive gate: while the pre-drive procedure is still running the 3D
 * scene zeroes the drive inputs into the physics and explains why on the
 * first premature throttle attempt. Since A1+A2 the gate is mostly a
 * backstop — ignition/selector/parking brake are REAL now, so completing the
 * procedure genuinely readies the car, and the throttle press that performs
 * "move-off" is the same press that rolls it once this unlocks.
 */
export function isDriveLocked(state: LessonSessionState): boolean {
  return state.phase === "preDrive";
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

  // Coach the violations: teach-first-then-grade. A first, teachable mistake
  // PAUSES the sim with a mini-lesson card (A9, doc 65 §5) and does NOT count
  // toward the score; repeats — and any dangerous/terminating error — are
  // graded, repeats harder (escalation ×1.5/×2.0 on the training score).
  let encounters = prev.scenarioEncounters;
  let escalations = prev.penaltyEscalations;
  let lastTeachAt = prev.lastTeachMomentAtSec;
  const hudEvents: HudEvent[] = [];
  const scoredEvents: ScorableEvent[] = [];
  const teachMoments: TeachMoment[] = [];
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
      // Graded — QW7 explaining toast, deliberately NON-blocking. This covers
      // every repeat AND every опасна/terminating mistake: a safety event
      // (red light run, collision course, missed yield) must never pop a
      // modal mid-drive — the student may be mid-braking/evasive maneuver,
      // and interrupting the handling would teach the wrong reflex. The
      // pause-card treatment is reserved for first-encounter teach moments.
      hudEvents.push({
        kind: "violation",
        titleBg: e.titleBg,
        explanationBg: e.explanationBg,
        points: e.points,
        severity: e.severityClass,
        lawRef: e.lawRef,
      });
      scoredEvents.push(e);
      if (step.decision.penaltyMultiplier > 1) {
        // Repeat mistake — record the escalation; buildLessonResult folds it
        // into the effective (training) score. Official points stay as-is.
        const rec: PenaltyEscalation = {
          code: e.code,
          t: e.t,
          multiplier: step.decision.penaltyMultiplier,
        };
        escalations = [...escalations, rec];
      }
    } else if (step.decision.mode === "teach") {
      // First teachable encounter → pause + card, rate-limited: same-tick
      // moments all emit (the shell merges them into ONE pause with queued
      // cards); a moment inside the min-gap window after the previous pause
      // downgrades to the classic lesson toast instead of chaining pauses.
      const canPause =
        lastTeachAt === null ||
        lastTeachAt === tick.t ||
        tick.t - lastTeachAt >= TEACH_PAUSE_MIN_GAP_S;
      if (canPause) {
        teachMoments.push({
          code: e.code,
          scenarioId: step.decision.scenarioId,
          titleBg: e.titleBg,
          explanationBg: e.explanationBg,
          lawRef: e.lawRef,
          severity: e.severityClass,
          points: e.points,
          t: e.t,
        });
        lastTeachAt = tick.t;
      } else {
        hudEvents.push({
          kind: "lesson",
          titleBg: e.titleBg,
          explanationBg: e.explanationBg,
          lawRef: e.lawRef,
        });
      }
    } else {
      // learn-only scenarios stay ambient: surfaced as a toast, never scored,
      // never interrupting.
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
      penaltyEscalations: escalations,
      lastTeachMomentAtSec: lastTeachAt,
      lastT: Math.max(prev.lastT, tick.t),
    },
    hudEvents,
    teachMoments,
  };
}

// ---------------------------------------------------------------------------
// Staged-encounter outcomes (A8 — additive)
// ---------------------------------------------------------------------------

/**
 * Record one resolved staged encounter on the session (A8). Pure/additive:
 * the GRADED consequences of the encounter arrived through applyTick already
 * (the orchestrator emits only existing SimTick vocabulary) — this only
 * accumulates the measurement record (reaction time, stop gap, …) that A10
 * locks objectives to and the debrief will cite.
 */
export function applyStagedOutcome(
  prev: LessonSessionState,
  outcome: StagedEventOutcome,
): LessonSessionState {
  return { ...prev, stagedOutcomes: [...(prev.stagedOutcomes ?? []), outcome] };
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

  // A9: fold the coach's repeat escalations into the training-layer score.
  // The official verdict below stays on official base points (see
  // escalation.ts header for the rationale).
  const { effectiveTotalPoints, escalated } = applyEscalations(
    summary.mistakes,
    state.penaltyEscalations,
  );

  return {
    lessonId: state.lesson.id,
    summary,
    objectives,
    completedAll,
    aborted,
    passed: summary.passed && completedAll && !aborted,
    score: summary.score.totalPoints,
    effectiveScore: effectiveTotalPoints,
    escalations: escalated,
    durationSec: state.endedAtSec ?? state.lastT,
  };
}
