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

import type {
  HudEvent,
  LessonSpec,
  NearMissEvent,
  StagedEventOutcome,
} from "../contracts";
import {
  buildSessionSummary,
  createRuleEngine,
  isScorableEvent,
  reduceTick,
  type RuleEngineConfig,
  type RuleEvent,
  type ScorableEvent,
  type SimTick,
  type ViolationEvent,
} from "../rules";
import { coachStep } from "../scenarios";
import {
  applyPreDriveAction,
  createPreDriveMachine,
  type PreDriveStepId,
} from "../procedures";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
} from "./objectives";
import { applyEscalations, type PenaltyEscalation } from "./escalation";
import { examTerminationFor } from "./exam";
import type {
  EventPosition,
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveEvalState,
  ObjectiveProgress,
  ObjectiveOutcome,
  SessionNearMiss,
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
    // The compiled lesson's ruleConfig (scenario drills for config-gated
    // detectors) is the base; explicit opts win over it.
    rules: createRuleEngine({ ...lesson.ruleConfig, ...opts.ruleConfig }),
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

/**
 * SPD (founder review R3 #39/#48 — „distance warnings while visibly far"):
 * the FOLLOWING_TOO_CLOSE family is TIME-GAP math (the 2-second rule), and at
 * street speed its fire threshold is 14–17 METERS — a gap that genuinely
 * reads "far" through a windshield. The math was verified correct (fires
 * only under ~0.7 × the taught gap, sustained, while not recovering), so the
 * detector stays untouched; what was missing is the WHY. This appends the
 * MEASURED gap at warning time — „Дистанция в момента: 1,4 с (16 м) — дръж
 * поне 2 с." — to the DISPLAY text (HUD toast + teach card) only. The scored
 * ScorableEvent, the wire serialization and the server grade keep the
 * catalog's fixed copy byte-identically (ADR-002: authored text + measured
 * numbers, never free text). Targets derive from the session's own rule
 * config (ceil(1.8) = 2 dry; ceil(1.8 × 1.6) = 3 rain — exactly the numbers
 * the catalog copy teaches), so per-lesson overrides stay honest.
 */
function withFollowingGapDetail(
  e: ViolationEvent,
  tick: SimTick,
  cfg: RuleEngineConfig,
): string {
  if (e.code !== "FOLLOWING_TOO_CLOSE" && e.code !== "FOLLOWING_TOO_CLOSE_FOR_RAIN") {
    return e.explanationBg;
  }
  const gapM = tick.leadGapM;
  const mps = tick.speedKmh / 3.6;
  if (gapM === undefined || !Number.isFinite(gapM) || mps <= 0.5) return e.explanationBg;
  const gapSec = gapM / mps;
  const targetSec = Math.ceil(
    cfg.followSafeSeconds *
      (e.code === "FOLLOWING_TOO_CLOSE_FOR_RAIN" ? cfg.followRainSecondsFactor : 1),
  );
  const gapTxt = gapSec.toFixed(1).replace(".", ",");
  return `${e.explanationBg} Дистанция в момента: ${gapTxt} с (${Math.round(gapM)} м) — дръж поне ${targetSec} с.`;
}

/**
 * Run-wide met-reds tally (A10): completed passSignal objectives keep their
 * final eval state, so a red met at an earlier junction satisfies a later
 * requireRedMet gate (L2 — the run must include at least one handled red,
 * not every junction).
 */
function countRedsMet(evalStates: ReadonlyArray<ObjectiveEvalState>): number {
  let n = 0;
  for (const s of evalStates) {
    if (s.type === "passSignal" && s.redMet) n += 1;
  }
  return n;
}

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

  const allEvents = scorable.length > 0 ? [...prev.events, ...scorable] : prev.events;

  // A13: the exam is graded from the first second — the pre-drive procedure
  // included (assess mode scores wrong order live, skips at move-off). A
  // candidate who blows past the official limits before even driving is
  // terminated on the spot, exactly like on the road.
  let examTermination = prev.examTermination;
  let phase: LessonPhase = finished ? "driving" : prev.phase;
  let endedAtSec = prev.endedAtSec;
  if (
    prev.lesson.examMode === true &&
    examTermination === undefined &&
    scorable.some((e) => e.kind === "violation")
  ) {
    const trip = examTerminationFor(allEvents);
    if (trip !== null) {
      examTermination = trip;
      phase = "completed";
      endedAtSec = tSec;
    }
  }

  return {
    state: {
      ...prev,
      preDrive: machine,
      phase,
      endedAtSec,
      events: allEvents,
      lastT: Math.max(prev.lastT, tSec),
      ...(examTermination !== undefined ? { examTermination } : {}),
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

  // A13: exam sessions bypass the whole teach-first layer — see coach.ts.
  const examMode = prev.lesson.examMode === true;
  const coachOpts = examMode ? { examMode: true } : undefined;
  // S1 pauseOnError (doc 76 §7 L1 „Пълна помощ"): in a guided scenario drill
  // EVERY graded violation ALSO freezes into a teach card — including codes
  // the coach normally only toasts (опасна/terminating like COLLISION: at
  // walking speed in a parking lot the freeze IS the lesson, unlike street
  // incidents where a modal would interrupt evasive handling). Scoring is
  // UNCHANGED — the aid adds the pause, never touches points. Inert when the
  // flag is absent (every curriculum lesson).
  const pauseOnError = prev.lesson.aids?.pauseOnError === true;

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
    // SPD #39/#48: DISPLAY text only — the FOLLOWING family carries the
    // measured time-gap readout; every other code passes through unchanged.
    // The scored event (scoredEvents/state.events/wire) keeps catalog copy.
    const explanationBg = withFollowingGapDetail(e, tick, prev.rules.config);
    const step = coachStep(
      encounters,
      {
        code: e.code,
        severityClass: e.severityClass,
        terminateSession: e.terminateSession,
      },
      coachOpts,
    );
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
        explanationBg,
        points: e.points,
        severity: e.severityClass,
        lawRef: e.lawRef,
      });
      scoredEvents.push(e);
      // S1 pauseOnError: the scored violation ADDITIONALLY pauses with the
      // teach card (rate-limited like every pause; same-tick moments merge).
      if (pauseOnError) {
        const canPause =
          lastTeachAt === null ||
          lastTeachAt === tick.t ||
          tick.t - lastTeachAt >= TEACH_PAUSE_MIN_GAP_S;
        if (canPause) {
          teachMoments.push({
            code: e.code,
            scenarioId: null,
            titleBg: e.titleBg,
            explanationBg,
            lawRef: e.lawRef,
            severity: e.severityClass,
            points: e.points,
            t: e.t,
          });
          lastTeachAt = tick.t;
        }
      }
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
          explanationBg,
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
          explanationBg,
          lawRef: e.lawRef,
        });
      }
    } else {
      // learn-only scenarios stay ambient: surfaced as a toast, never scored,
      // never interrupting.
      hudEvents.push({
        kind: "lesson",
        titleBg: e.titleBg,
        explanationBg,
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
      // A10 objective context: staged-encounter outcomes recorded so far
      // (applyStagedOutcome) + the run-wide met-reds tally. Rebuilt per
      // iteration — a red met by the objective that just completed must be
      // visible to the next one on the same frame.
      const ctx: ObjectiveContext = {
        stagedOutcomes: prev.stagedOutcomes ?? [],
        redsMetInRun: countRedsMet(evalStates),
      };
      const step = stepObjective(current.params, evalStates[currentIndex], tick, ctx);
      evalStates[currentIndex] = step.evalState;

      if (!step.done) {
        objectives[currentIndex] = {
          ...current,
          status: "active",
          progress: step.progress,
          ...(step.detail !== undefined ? { detail: step.detail } : {}),
        };
        break;
      }

      objectives[currentIndex] = {
        ...current,
        status: "done",
        progress: 1,
        completedAtSec: tick.t,
        ...(step.detail !== undefined ? { detail: step.detail } : {}),
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

  // A13: exam sessions TERMINATE the moment the official limits are crossed
  // (any опасна / collision / > 9 total / > 6 from основни) — the fold runs
  // only on frames that scored a violation, and it wins over a same-frame
  // route completion (a route finished ON the tripping mistake is still a
  // terminated exam). Training lessons keep driving (rules/scoring.ts).
  let examTermination = prev.examTermination;
  if (
    examMode &&
    examTermination === undefined &&
    scoredEvents.some((e) => e.kind === "violation")
  ) {
    const trip = examTerminationFor([...prev.events, ...scoredEvents]);
    if (trip !== null) {
      examTermination = trip;
      phase = "completed";
      endedAtSec = tick.t;
    }
  }

  // A15: record WHERE each scored event happened — the tick in hand at
  // emission time is the only moment the position is knowable, and the rule
  // engine deliberately stays position-free (law, not geometry). Paired back
  // to events by (kind, code, t), same scheme as PenaltyEscalation.
  let eventPositions = prev.eventPositions;
  if (scoredEvents.length > 0) {
    const recs: EventPosition[] = scoredEvents.map((e) => ({
      kind: e.kind,
      code: e.code,
      t: e.t,
      x: tick.position.x,
      y: tick.position.y,
    }));
    eventPositions = [...(eventPositions ?? []), ...recs];
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
      ...(eventPositions !== undefined ? { eventPositions } : {}),
      ...(examTermination !== undefined ? { examTermination } : {}),
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
 * (the orchestrator emits only existing SimTick vocabulary) — this
 * accumulates the measurement record (reaction time, stop gap, …) that A10
 * locks objectives to (via ObjectiveContext on the next applyTick — e.g.
 * L5's emergencyStop completes from the l5-braking-lead-car outcome) and
 * the debrief will cite.
 */
export function applyStagedOutcome(
  prev: LessonSessionState,
  outcome: StagedEventOutcome,
): LessonSessionState {
  return { ...prev, stagedOutcomes: [...(prev.stagedOutcomes ?? []), outcome] };
}

// ---------------------------------------------------------------------------
// Near-miss encounters (A11 stat → A15 mistake map; additive)
// ---------------------------------------------------------------------------

/**
 * Record one resolved near-miss encounter (A15). Pure/additive, mirror of
 * applyStagedOutcome: NOTHING here is graded (a near-miss is deliberately not
 * a ViolationCode — the contact case already grades as COLLISION); this is
 * the measurement channel the end-screen mistake map plots as hollow "мина на
 * косъм" rings. `playerPos` is the shell's last-tick position at resolution —
 * clearance is sub-meter, so it stands in for the encounter location; null
 * (no tick yet) keeps the stat but drops the marker.
 */
export function applyNearMiss(
  prev: LessonSessionState,
  event: NearMissEvent,
  playerPos: { x: number; y: number } | null,
): LessonSessionState {
  const rec: SessionNearMiss = {
    tSec: event.tSec,
    kind: event.kind,
    clearanceM: event.clearanceM,
    relSpeedMps: event.relSpeedMps,
    x: playerPos?.x ?? null,
    y: playerPos?.y ?? null,
  };
  return { ...prev, nearMisses: [...(prev.nearMisses ?? []), rec] };
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
    ...(o.detail !== undefined ? { detail: o.detail } : {}),
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
    // A15: the mistake-map channels ride into the result untouched.
    ...(state.eventPositions !== undefined ? { eventPositions: state.eventPositions } : {}),
    ...(state.nearMisses !== undefined ? { nearMisses: state.nearMisses } : {}),
    // A13: the exam-termination record (examMode sessions only).
    ...(state.examTermination !== undefined ? { examTermination: state.examTermination } : {}),
  };
}
