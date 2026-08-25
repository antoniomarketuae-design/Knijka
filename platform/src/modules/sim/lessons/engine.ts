/**
 * Lesson session engine — the pure lifecycle reducer of a driving lesson:
 *
 *   create → [preDrive machine, if the spec enables it] → driving
 *          → objectives complete in order → completed
 *          → OR the end of the route is reached → completed (finish.ts)
 *   (finishSession = manual end for free drive / early exit;
 *    abortSession   = student quit, graded as not passed)
 *
 * FINISHING ≠ PASSING. Every path above only sets `phase`. The verdict is
 * folded separately by buildLessonResult: `passed` still demands the official
 * score AND every objective done AND not aborted, so a drive that ended at
 * the finish with tasks skipped ends REPORTED AS FAILED — it just ends.
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
  personContactVoidsObjective,
  stepObjective,
  type ObjectiveContext,
} from "./objectives";
import { stepYieldVoice } from "./advisor";
import { foldTrainingScore, type PenaltyEscalation } from "./escalation";
import { examTerminationFor } from "./exam";
import {
  CRASH_PIN_RADIUS_M,
  CRASH_PIN_STUCK_S,
  FINISH_STANDSTILL_KMH,
  ROUTE_RUNOUT_MAX_S,
  createFinishGate,
  routeDepartedEndingCopy,
  routeEndMark,
  routeFinishZone,
  offNetworkEndingCopy,
  routeRunOutArrived,
  stepOffNetwork,
  stepFinishGate,
  stepYieldWait,
  terminalDepartureZone,
  terminalRescueZone,
} from "./finish";
import type {
  CoachedMistake,
  EventPosition,
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveEvalState,
  ObjectiveParams,
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
    coachedMistakes: [],
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
  /**
   * THEO-3 (lesson.mistakeExperience sessions only): the targeted wrong
   * action just fired — the ONE-SHOT consequence moment. The shell pauses on
   * it and shows the consequence overlay (red-ghost replay + the stored
   * whatWentWrongBg + the lawRef citation) instead of the teach card. At
   * most one per session (state.mistakeExperienceHitAtSec latches); the same
   * TeachMoment shape rides catalog copy only (ADR-002).
   */
  mistakeMoment?: TeachMoment;
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
 * Cap on the shown-but-not-charged record (CoachedMistake) — the same
 * discipline as every additive channel (wire.ts MAX_NEAR_MISSES): a continuing
 * offence re-raised every few seconds for an hour must not grow the state or
 * the finish payload without bound. 100 distinct display moments is far past
 * anything a real drive produces (the deepest queue measured was eight).
 */
export const MAX_COACHED_MISTAKES = 100;

/**
 * Frame-zero pose guard (doc 87 B3/B10/B11 — see
 * LessonSessionState.posedAtSec). A tick "describes the vehicle" unless it is
 * the scene's placeholder: `scene/vehicleSample.ts createVehicleSample()`
 * publishes EXACTLY the district origin at EXACTLY zero speed, and the scene
 * ticks this engine with it for the frames before the chassis writes its first
 * pose. Not one of the 90 committed districts places a spawn point at (0, 0)
 * — measured over content/world/*.json — so the origin at a standstill is the
 * placeholder and nothing else. A drill that ever did spawn there would simply
 * start grading on its first metre of movement.
 */
export const POSE_MOTION_KMH = 0.5;

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
  if (
    e.code !== "FOLLOWING_TOO_CLOSE" &&
    e.code !== "FOLLOWING_TOO_CLOSE_FOR_RAIN" &&
    // FO-08: the closing code is the same duty measured while it collapses —
    // it needs the number MORE than the other two, because „намали с нея" is
    // meaningless without knowing how much room is left.
    e.code !== "CLOSING_ON_LEAD_TOO_FAST"
  ) {
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
 * THE TWO SILENCES (doc 86 B4/B5/B6 — founder, 2026-07-30).
 *
 * Two objective states used to produce NOTHING on screen, and both read to the
 * student as a broken simulator rather than as feedback:
 *
 *  1. «Another Major error I am stopping on top of the green cyrcle and
 *     nothing happens.» He was on the mark. The objective carried an
 *     unpublished arrival speed cap and he was over it, so the gate stayed
 *     shut and said nothing. 178 waypoints across 137 templates carry one.
 *  2. An unsignalled roundabout exit voided the traversal invisibly: the ring
 *     drill simply stopped responding, with no way to know a rule had been
 *     applied, let alone which.
 *
 * Both now speak, once each, at the moment they happen. THEO-4: never a bare
 * verdict — each card says what the simulator observed, what the task wants
 * instead, and what to do about it; the roundabout one cites the article the
 * catalog cites for the same duty (ADR-002: retrieved, never free-recalled).
 * Neither touches scoring: these are `lesson` toasts, the coach's channel for
 * things that are taught and not billed.
 */
function objectiveNotice(
  params: ObjectiveParams,
  before: ObjectiveEvalState,
  after: ObjectiveEvalState,
  tick: SimTick,
): HudEvent | null {
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    (before.type !== "reachZone" || !before.overCapNoted) &&
    after.overCapNoted &&
    params.maxSpeedKmh !== undefined
  ) {
    return {
      kind: "lesson",
      titleBg: "Стигна точката, но твърде бързо",
      // Accurate about the mechanism, deliberately: slowing down WHILE still
      // on the mark completes it, slowing down after passing it does not (see
      // REACH_ZONE_GRACE_M — the grace reaches back toward the driver, never
      // forward past the mark, because on a stop drill the overshoot is the
      // graded failure). Telling him otherwise would be its own falsehood.
      explanationBg: `Задачата иска да си тук с не повече от ${params.maxSpeedKmh} км/ч, а в момента караш ${Math.round(Math.abs(tick.speedKmh))} км/ч — затова още не се отчита. Намали СЕГА, докато си върху точката. Ако я подминеш с тази скорост, задачата остава неизпълнена, но урокът продължава и разборът я показва накрая.`,
    };
  }
  if (
    params.kind === "completeManeuver" &&
    params.maneuver === "roundabout" &&
    after.type === "roundabout" &&
    before.type === "roundabout" &&
    after.voidedExits > before.voidedExits
  ) {
    return {
      kind: "lesson",
      titleBg: "Излезе от кръговото без десен мигач",
      explanationBg:
        "Излизането от кръгово е маневра надясно и се сигнализира — мигачът казва на колите зад теб и на чакащите на изхода, че напускаш кръга. Задачата остава отворена: върни се в кръговото и излез с пуснат десен мигач. Ако продължиш напред, урокът приключва и разборът показва точно това място.",
      lawRef: "ЗДвП чл. 25",
    };
  }
  return null;
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

/**
 * Did this scored event record contact with a HUMAN BODY? (round 10,
 * 2026-08-24 — `objectives.ts vruWaitHonoured` holds the frame.)
 *
 * `detail` is the struck body kind the contact episode already stamps on every
 * bill (`rules/engine.ts`, `COLLISION_CONTACT_COPY`'s four keys), so this reads
 * the discriminator rather than inventing one. A cyclist counts: чл. 42's
 * clearance duty and чл. 119's yield duty protect the same unarmoured body, and
 * a banner that says «изчакай» about either is falsified by hitting them.
 * Vehicles and static objects do NOT count — those are the rule engine's to
 * grade and say nothing about whether a person was let through.
 */
function isPersonContact(e: ScorableEvent): boolean {
  return (
    e.kind === "violation" &&
    e.code === "COLLISION" &&
    (e.detail === "pedestrian" || e.detail === "cyclist")
  );
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
  // THEO-3: mistake-experience sessions ride the coach's learn-only
  // suppression channel instead — the sandbox where the wrong action is the
  // assignment, so nothing scores and nothing terminates (coach.ts learnOnly).
  const examMode = prev.lesson.examMode === true;
  const mistakeXp = examMode ? undefined : prev.lesson.mistakeExperience;
  const coachOpts = examMode
    ? { examMode: true }
    : mistakeXp !== undefined
      ? { learnOnly: true }
      : undefined;
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
  let mistakeHitAt = prev.mistakeExperienceHitAtSec;
  let mistakeMoment: TeachMoment | undefined;
  const hudEvents: HudEvent[] = [];
  const scoredEvents: ScorableEvent[] = [];
  const teachMoments: TeachMoment[] = [];
  /**
   * SHOWN-BUT-NOT-CHARGED, RECORDED WHERE THE DECISION IS MADE. Every unscored
   * arm below still DISPLAYS the violation — the teach pause, its rate-limited
   * toast downgrade, the THEO-3 consequence moment and the learn-only ambient
   * toast — and until this record existed, nothing downstream could tell such
   * a drive from a clean one: `DebriefContext.coachedMistakes` had NO live
   * producer, so the debrief wrote «чисто каране без нито едно нарушение»
   * over drives whose own HUD had said «Превишена скорост» twice (sweep161
   * `sc-signal-flashing`/mobile-wrong 04-t012s: 59 км/ч, 50 badge, «(+1)»;
   * findings ef1eb9cf · a448e5f0 · 0fde4ec0 · faae7057). The UI teachQueue
   * cannot substitute: it sees only the pause arm. Capped like every additive
   * channel — a stuck-throttle drive re-raising one code every few seconds
   * must not grow the state without bound; the debrief dedups by title anyway.
   */
  const coachedNew: CoachedMistake[] = [];
  // `?? []`: the field is required on the type, but vitest transpiles without
  // typechecking and older hand-built state fixtures predate it.
  const coachedPrev = prev.coachedMistakes ?? [];
  let coachedCount = coachedPrev.length;
  const recordCoached = (e: { code: string; titleBg: string; t: number }): void => {
    if (coachedCount >= MAX_COACHED_MISTAKES) return;
    coachedNew.push({ code: e.code, titleBg: e.titleBg, t: e.t });
    coachedCount += 1;
  };
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
        // THE FIELD `coach.ts` WAS GIVEN AND NEVER FED. `encounterKey` reads
        // `detail` so that two DIFFERENT victims of one crash stop counting as
        // a repeat of each other — but this literal is the production caller,
        // and without this line the whole mechanism is a comment. Measured
        // before adding it: the canonical wrong drive still printed «повторна
        // грешка ×1.5» for a mistake made once.
        detail: e.detail,
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
      // Both arms display and neither charges → both are coached (the record
      // the debrief's honesty rests on — see recordCoached above).
      recordCoached(e);
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
      // Unscored and shown (consequence overlay or ambient toast) → coached.
      recordCoached(e);
      // THEO-3: the targeted wrong action just happened — latch the one-shot
      // consequence moment (the shell pauses on it) and swallow the ambient
      // toast: the consequence overlay presents the same catalog copy.
      if (
        mistakeXp !== undefined &&
        mistakeHitAt === undefined &&
        mistakeXp.codes.includes(e.code)
      ) {
        mistakeHitAt = tick.t;
        mistakeMoment = {
          code: e.code,
          scenarioId: step.decision.scenarioId,
          titleBg: e.titleBg,
          explanationBg,
          lawRef: e.lawRef,
          severity: e.severityClass,
          points: e.points,
          t: e.t,
        };
        continue;
      }
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

  // A STRUCK PERSON, READ OFF THE LEDGER THIS FRAME ALREADY WROTE
  // (round 10, 2026-08-24 — `objectives.ts vruWaitHonoured` carries the frame
  // and the derivation). `prev.events` is the run's scored ledger and
  // `scoredEvents` is what THIS tick just added — both are needed: a car that
  // reaches the child on the frame it also completes the waypoint must not be
  // certified by a ledger one frame stale. Session-monotone, so it is computed
  // once, here, rather than per objective.
  //
  // FOLDED ABOVE BOTH READERS, and the second one is why (2026-08-25). It feeds
  // the objective context below AND the finish gate further down, because a
  // demand that can no longer be met changes two questions at once: whether the
  // certificate is issued, and whether the drive can still end by itself.
  const struckAPersonInRun =
    prev.events.some(isPersonContact) || scoredEvents.some(isPersonContact);

  let objectives = prev.objectives;
  let evalStates = prev.evalStates;
  let currentIndex = prev.currentObjectiveIndex;
  let phase: LessonPhase = prev.phase;
  let endedAtSec = prev.endedAtSec;
  // THE RUN-OUT (finish.ts). `undefined` = the chain has not finished yet;
  // an object = running out to the mark; `null` = the chain finished on a
  // route that ends nowhere, which terminates on the spot exactly as it always
  // did. Folded after the lawful-wait below, because two of its three exits
  // must not be allowed to spend a second the student is right to be standing
  // still for.
  let runOut: LessonSessionState["routeRunOut"] | null | undefined = prev.routeRunOut;

  // FRAME-ZERO POSE GUARD (doc 87 B3/B10/B11). The chain does not advance
  // until a tick has described the vehicle: motion, or a position other than
  // the one the session opened on. The scene ticks this engine with a
  // placeholder pose at the district ORIGIN for the frames before the chassis
  // publishes (scene/vehicleSample.ts), and four drills author their first
  // waypoint within a car length of that origin — so their first task was
  // credited to a car that was not there. An objective is earned by driving;
  // nothing has been driven yet. See LessonSessionState.posedAtSec.
  let posedAtSec = prev.posedAtSec;
  if (posedAtSec === undefined) {
    const atOrigin = tick.position.x === 0 && tick.position.y === 0;
    if (!atOrigin || Math.abs(tick.speedKmh) > POSE_MOTION_KMH) posedAtSec = tick.t;
  }

  if (prev.phase === "driving" && posedAtSec !== undefined && currentIndex < objectives.length) {
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
        ...(struckAPersonInRun ? { struckAPersonInRun: true } : {}),
      };
      const before = evalStates[currentIndex];
      const step = stepObjective(current.params, before, tick, ctx);
      evalStates[currentIndex] = step.evalState;
      const notice = objectiveNotice(current.params, before, step.evalState, tick);
      if (notice !== null) hudEvents.push(notice);

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

    // All objectives done => the lesson's TASKS are complete. Where the DRIVE
    // stops is a second question, and it used to be answered by accident: this
    // branch fired on the frame the terminal `reachZone` was entered, i.e. one
    // whole tolerance radius short of the mark the author placed (mean 10.03 m
    // over 674 authored rungs; 17 m on `sc-zebra-approach` L1, whose three
    // committed recordings all stop at y = 113 against a mark at y = 130). See
    // finish.ts „THE RUN-OUT" for the census and for why the low rungs — the
    // forgiving ones — were the ones cut shortest.
    //
    // So: arm the run-out and let him drive to the end. If the route ends
    // nowhere, or he is already at the mark, this is bit-identical to the line
    // it replaces — it terminates below, on this same frame.
    if (currentIndex >= objectives.length && objectives.length > 0) {
      if (runOut === undefined) {
        const mark = routeEndMark(objectives.map((o) => o.params));
        runOut =
          mark === null
            ? null
            : {
                markX: mark.x,
                markY: mark.y,
                fromX: tick.position.x,
                fromY: tick.position.y,
                elapsedSec: 0,
              };
      }
    }
  }

  // ROUTE FINISH (founder 2026-07-28 — „стигнах до края, а изпитът не спира"):
  // reaching the end of the route ENDS the drive, driven well or driven badly.
  // Until this gate existed the ONLY route termination was "every objective
  // satisfied", so an objective the student drove past stalled the sequential
  // chain forever: the ribbon pointed back, the drive never ended, and the
  // debrief — the entire teaching payload — was reachable only by re-driving
  // the route CORRECTLY first. A student who must perform perfectly to learn
  // what he did imperfectly quits.
  //
  // B2 (doc 86 §3, 2026-07-30): the gate used to be consulted ONLY while the
  // chain had not yet reached the final objective — i.e. everywhere except the
  // one place with nothing after it to walk to. It is armed on the terminal
  // objective now, but through a DIFFERENT derivation, because the two
  // situations are proven by different evidence:
  //
  //   stalled chain  → routeFinishZone: the car is where the route ends. The
  //                    tasks it skipped are behind it and cannot be redone by
  //                    standing here, so arriving is enough.
  //   stuck terminal → terminalRescueZone: the car is where the route ends AND
  //                    standing completely still for twelve seconds with the
  //                    task still open. Nothing a student legitimately does at
  //                    the end of a route looks like that — an approach moves,
  //                    a creep moves, a park shuffle moves, and a red-light
  //                    wait ends. Using the stalled-chain zone here instead
  //                    would close the exam on a candidate lining up for the
  //                    bay, which is a worse bug than the one being fixed.
  //
  // A healthy run still terminates through the objective branch above,
  // bit-identically — L7 still has to park, L3 still has to come out of the
  // roundabout, a clean exam still ends on its own last objective. Nothing
  // here is graded: `objectives` keep their honest status, so buildLessonResult
  // reports this as finished-and-failed, never as passed.
  //
  // ---------------------------------------------------------------------
  // B-NEW-1 (doc 87:229, 2026-07-30) — „the session ends itself ~40 s after
  // load while the car is parked at spawn, untouched." REPRODUCED, cause
  // found, and it is one missing word in the condition below: `posedAtSec`.
  //
  // The frame-zero pose guard above already knows that the scene ticks this
  // engine with a PLACEHOLDER pose — the district origin at zero speed
  // (scene/vehicleSample.ts `createVehicleSample`) — for the frames before
  // the chassis publishes. That guard was wired to the objective chain only.
  // The finish gates were left reading the placeholder, and one frame of it
  // is all an "outside" gate needs: `rb-mini-v1` puts its ring centre at
  // EXACTLY (0, 0), the placeholder therefore lands inside `armWithinM` = 24
  // and ARMS the leave-the-work-site gate. From the next frame on the car —
  // sitting untouched at its spawn 93 m south — is "away from the ring", the
  // FINISH_LEAVE_S dwell runs uninterrupted, and 20 s later the engine
  // declares the route finished. Add the scene's own load time and that is
  // the founder's ~40 s. Measured in __tests__/route-finish.test.ts: one
  // placeholder frame ⇒ `completed` at t = 20.07 s on sc-roundabout-entry
  // L1 and L3; with the guard, 120 s parked and still driving.
  //
  // The rule is the same one the objective chain already obeys, and it is a
  // rule about driving, not about a glitch: A DRIVE THAT HAS NOT BEGUN
  // CANNOT END. Nothing about a route can be behind you before the first
  // frame that describes where you are. It costs a real drive exactly one
  // frame — every gate below arms and trips from the first honest pose.

  // ---------------------------------------------------------------------
  // B15 — THE LAWFUL WAIT (founder: „I waited about 40 seconds" at the
  // give-way line, and the session ended itself at 20). Folded BEFORE the
  // gates and on every driving frame, because two of its inputs are stateful:
  // the pedestrian latch rides discrete events, and the hold's own clock has
  // to survive frames on which no gate is consulted at all. See finish.ts
  // `stepYieldWait` for what counts as a yield and why each case is there.
  //
  // The pose guard applies here for the same reason it applies to the gates: a
  // drive that has not begun is not waiting for anything.
  let yieldWait = prev.yieldWait;
  let yieldWaitSec = prev.yieldWaitSec;
  if (prev.phase === "driving" && posedAtSec !== undefined) {
    yieldWait = stepYieldWait(prev.yieldWait, tick, {
      params: objectives.map((o) => o.params),
      currentIndex,
    });
    if (yieldWait.holding) {
      // Sim-seconds since the previous frame, clamped: a backgrounded tab can
      // hand this engine a multi-second jump, and inflating the measured wait
      // with time nobody spent waiting would corrupt the par-time line below.
      const dt = Math.min(Math.max(tick.t - prev.lastT, 0), 1);
      yieldWaitSec = (yieldWaitSec ?? 0) + dt;
    }
  }

  // THE RUN-OUT'S THREE EXITS (finish.ts). The tasks are done; this decides
  // where the DRIVE stops. `null` is a route that ends nowhere — it stops here,
  // which is the behaviour this branch always had.
  if (phase === "driving" && runOut !== undefined) {
    if (runOut === null) {
      phase = "completed";
      endedAtSec = tick.t;
    } else {
      const here = { x: tick.position.x, y: tick.position.y };
      const mark = { x: runOut.markX, y: runOut.markY };
      const from = { x: runOut.fromX, y: runOut.fromY };
      // ARRIVED — at the mark, or past it. Checked before the freeze, because
      // getting there is a fact about the road and not about the clock.
      if (routeRunOutArrived(mark, from, here)) {
        phase = "completed";
        endedAtSec = tick.t;
      } else if (yieldWait?.holding === true) {
        // B15's freeze, for the third time in this file and for the third time
        // for the same reason: a student stopped at the very end of the route
        // because a pedestrian is still on the paint is doing the lesson, not
        // finishing it. Neither exit below may spend this second.
      } else if (Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH) {
        // AT REST — every task is done and the car has stopped. Wherever he
        // chose to stop IS the end of his drive; nothing is served by making
        // him roll the last few metres.
        phase = "completed";
        endedAtSec = tick.t;
      } else {
        const dt = Math.min(Math.max(tick.t - prev.lastT, 0), 1);
        const elapsedSec = runOut.elapsedSec + dt;
        runOut = { ...runOut, elapsedSec };
        // SPENT — the backstop. A run-out cannot be long (the car started
        // inside the terminal ring), so this only ever catches a car going
        // nowhere in particular, and it ends the drive rather than holding it.
        if (elapsedSec >= ROUTE_RUNOUT_MAX_S) {
          phase = "completed";
          endedAtSec = tick.t;
        }
      }
    }
  }

  // B15-VOICE (2026-08-05) — REQUIREMENT ZERO AT THE GIVE-WAY LINE.
  //
  // The fold above made the lawful wait SURVIVABLE. It is still SILENT: for
  // the whole minute the student waits correctly, nothing is said on the rule
  // surface, on the card or here on the teach channel, and the first thing the
  // product ever says to him about the priority car is „−10". Doc 64 THEO-4,
  // ratified by the founder, forbids exactly that — every feature must act as
  // a virtual instructor that EXPLAINS EVERY DECISION, and a bare verdict
  // delivered by silence is still a bare verdict. It is also backwards as
  // teaching: the minute he is doing the right thing is the minute an
  // instructor talks.
  //
  // The voice rides the SAME channel the B4/B5/B6 objective notices ride —
  // `lesson` HUD events, the coach's line for what is taught and never billed.
  // Nothing here emits, suppresses or reweights a ScorableEvent; the graded
  // codes are read (to mute a congratulation the same screen is penalising)
  // and never written. And it is folded from the ALREADY-GRADED `ruleEvents`
  // of this very tick, so the mute can never lag the fault it answers to.
  //
  // EXAM SESSIONS ARE EXCLUDED, on the advisor's own distinction rather than a
  // new one: `advisorPromptForSession` opens with the same unconditional
  // `examMode` gate, and for the same reason — telling a candidate who has
  // priority mid-assessment is telling him the answer.
  let yieldVoice = prev.yieldVoice;
  if (!examMode && prev.phase === "driving" && posedAtSec !== undefined && yieldWait !== undefined) {
    const voice = stepYieldVoice(prev.yieldVoice, {
      t: tick.t,
      speedKmh: tick.speedKmh,
      wait: yieldWait,
      violations: scoredEvents.filter((e) => e.kind === "violation").map((e) => e.code),
    });
    yieldVoice = voice.state;
    for (const n of voice.notices) hudEvents.push(n);
  }

  let finishGate = prev.finishGate;
  let finishRescueGate = prev.finishRescueGate;
  let finishDepartureGate = prev.finishDepartureGate;
  let stoppedStuck = false;
  if (
    prev.phase === "driving" &&
    phase === "driving" &&
    posedAtSec !== undefined &&
    objectives.length > 0 &&
    currentIndex < objectives.length
  ) {
    const params = objectives.map((o) => o.params);
    const onTerminal = currentIndex === objectives.length - 1;

    if (yieldWait?.holding === true) {
      // B15 — THE FREEZE. This frame is a student standing still because the
      // road told him to, so it is evidence of nothing and neither gate may
      // spend it. Arming is left alone (it is pure geometry and cannot end a
      // session on its own); the partial dwell is DROPPED, so the seconds he
      // spends waiting can never be credited to a gate the moment the wait
      // ends — the dwell restarts from the first frame he is free to move
      // again. Without that drop, freezing would merely defer the same 20 s
      // verdict to the instant the gap appeared.
      // BOTH ACCUMULATORS TOO, not just the running visit. Each finish face
      // banks the seconds spent on it (types.ts FinishGateState), and a lawful
      // wait must be spendable on neither — clearing only `insideSinceSec`
      // would leave the banked seconds behind and let the freeze be defeated by
      // waiting in two instalments. This is the one line the lane that built
      // the accumulators could not reach: it owned finish.ts and types.ts, and
      // the freeze lives here, so it shipped a single clock with a hole rather
      // than a second field that would escape this drop.
      if (
        finishGate?.insideSinceSec != null ||
        finishGate?.regionDwellSec ||
        finishGate?.strandedDwellSec
      ) {
        finishGate = {
          ...finishGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
      if (
        finishRescueGate?.insideSinceSec != null ||
        finishRescueGate?.regionDwellSec ||
        finishRescueGate?.strandedDwellSec
      ) {
        finishRescueGate = {
          ...finishRescueGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
      // O30's gate is in this branch for the same reason the other two are:
      // a student stopped at a red just past the end of the route is doing the
      // lesson, and neither the departure dwell nor its stranded face may
      // spend one second of that wait.
      if (
        finishDepartureGate?.insideSinceSec != null ||
        finishDepartureGate?.regionDwellSec ||
        finishDepartureGate?.strandedDwellSec
      ) {
        finishDepartureGate = {
          ...finishDepartureGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
    } else {
      // Gate 1 — the stalled chain. Presence-based and generous, and it stays
      // off the terminal objective, where every correct final approach would
      // satisfy it.
      //
      // ── …UNLESS THERE IS NO CORRECT FINAL APPROACH LEFT (2026-08-25) ───────
      //
      // The person-contact refusal above (`objectives.ts vruWaitHonoured`) is
      // session-monotone: once a pedestrian or a cyclist has been struck, a
      // `requireVruUntouched` gate can never complete again. When that gate is
      // the LAST objective, the chain stops advancing, `currentIndex` never
      // reaches `objectives.length`, the run-out is never armed — and the drive
      // no longer ends by itself. Measured through `applyTick` on the same tick
      // stream with one `{kind:"collision", withWhat:"pedestrian"}` as the only
      // difference: CLEAN → `phase: completed`; STRUCK → still `driving` sixty
      // ticks later. The other exits do not cover it — `stepOffNetwork` needs
      // the car off the carriageway, the crash pin needs CRASH_PIN_STUCK_S of
      // standstill against what he hit, gate 2 needs a full standstill AT the
      // mark, and the exam termination needs `examMode`. So a student who ran
      // the child over could reach the protocol that convicts him — the −10
      // «Удар в пешеходец» card and its чл. 48, ал. 3 corrective, which is the
      // entire teaching payload of that lesson — only by quitting, and quitting
      // costs the attempt its XP and its calibration (`aborted`).
      //
      // A REFUSAL MUST NOT DOUBLE AS A TRAP. The reason gate 1 is withheld here
      // is that a correct approach would satisfy it; when the demand is already
      // unsatisfiable that reason has evaporated, and this is the exact case
      // gate 1 was built for — a chain that has stalled with the car at the end
      // of the route. Nothing is graded by it: the objective keeps its honest
      // `active` status and `buildLessonResult` reports finished-and-failed, so
      // the certificate is still refused. Only the strand goes.
      const terminalUnearnable =
        onTerminal && personContactVoidsObjective(params[currentIndex], struckAPersonInRun);
      if (!onTerminal || terminalUnearnable) {
        const zone = routeFinishZone(params);
        if (zone !== null) {
          finishGate = stepFinishGate(finishGate ?? createFinishGate(), zone, tick);
        }
      }
      // Gate 2 — simply stuck. Runs on EVERY frame regardless of which objective
      // is active, because the state it detects does not care: a car standing
      // completely motionless at the end of the route, for twelve seconds at a
      // waypoint or twenty-five beside a bay, with the route unfinished, is not
      // going anywhere on its own. Gate 1 cannot cover it — on a compact route
      // (a lot where the pull-up pose is 10 m from the bay) its half-distance
      // clamp shrinks the zone below one lane, so a car parked three metres off
      // the end satisfied neither gate and had no way out at all.
      const rescue = terminalRescueZone(params);
      if (rescue !== null) {
        finishRescueGate = stepFinishGate(finishRescueGate ?? createFinishGate(), rescue, tick);
      }
      // Gate 3 — O30, the departure (2026-08-24; finish.ts owns the zone, the
      // dwell derivation and the copy). A car that drove THROUGH the end of
      // the route and kept going satisfies neither gate above: gate 1 is
      // withheld on the terminal objective and gate 2 needs a standstill AT
      // the mark. This one is armed by having BEEN at the end of the route
      // (the acceptance ring floored to one lane) and latches after
      // FINISH_DEPARTED_S beyond it — sized so the recorded
      // overshoot-and-return drive completes 13.7 s before it could fire.
      // Stepped on every frame like gate 2: the stalled-chain case (a car past
      // the end with EARLIER tasks open) is usually gate 1's in 0.5 s, but a
      // route whose gate-1 zone is clamped away has only this ending.
      // ── ARM DISARMED 2026-08-24, BEFORE IT EVER SHIPPED ────────────────────
      //
      // Its own verifier proved a FALSE REFUSAL with a probe drive. The bar is
      // FINISH_DEPARTED_S of dwell inside the departure region, and that dwell
      // accumulates WHILE THE CAR IS DRIVING BACK. A student who pauses and then
      // takes a long return — pause + travel > 75 s — completed before this arm
      // and is refused after it. A false refusal is the crime this programme
      // exists to end, and it does not ship to buy a session-end.
      //
      // Gating the dwell on speed does NOT fix it: a car driving steadily AWAY
      // must still accumulate, or the never-ends defect this arm was built for
      // returns. The honest fix is to accumulate only while the car is NOT
      // CLOSING ON THE MARK — and the finish state carries no previous distance
      // to compare against (types.ts has dwellFace / regionDwellSec /
      // strandedDwellSec and no range). That is a new field on a per-frame path
      // and it must be proved by driving the overshoot-and-return case, which
      // this box could not do at the moment the patch landed.
      //
      // So the arm is DISARMED rather than half-fixed, and every other repair
      // the round earned is kept. Re-enable only together with a test that
      // drives the return and proves the dwell does not accrue while closing.
      const departure: ReturnType<typeof terminalDepartureZone> = null;
      if (departure !== null) {
        finishDepartureGate = stepFinishGate(
          finishDepartureGate ?? createFinishGate(),
          departure,
          tick,
        );
      }
    }

    stoppedStuck =
      finishGate?.reachedAtSec == null && finishRescueGate?.reachedAtSec != null;
    if (finishGate?.reachedAtSec != null || stoppedStuck) {
      phase = "completed";
      endedAtSec = tick.t;
      // THEO-4: never a bare verdict. Say WHAT stopped the drive and WHY
      // stopping is the right thing here — the debrief then walks every
      // skipped task and every mistake, which is what the student came for.
      // Kept inside the violation catalog's own length band (median 186
      // chars, max 319): this is a HUD toast on a 390 px phone, and the
      // detail belongs in the debrief that opens a second later.
      hudEvents.push({
        kind: "lesson",
        titleBg: examMode ? "Край на изпитния маршрут" : "Край на маршрута",
        explanationBg: examMode
          ? "Стигна края на маршрута, затова изпитът приключва тук. Част от задачите останаха неизпълнени и изпитът не е издържан — разборът показва всяка от тях и всяка допусната грешка."
          : stoppedStuck
            // B2/B3: the car has been standing still at the end of the route
            // with the task open. Say that plainly — the student has been
            // sitting there wondering what the simulator wants, and the honest
            // answer is that it did not register and he is not trapped here.
            ? "Спря в края на маршрута, но задачата тук не се отчете — затова урокът приключва, вместо да те държи на място. Разборът показва какво точно остана неизпълнено и как да го направиш следващия път."
            : "Стигна края на маршрута, затова урокът приключва тук. Част от задачите останаха неизпълнени — разборът показва всяка от тях и всяка грешка, вместо да те връща да караш маршрута отново.",
      });
    }
    // O30's own termination, with its own sentence — never either of the two
    // above, both of which claim an arrival that did not happen (THEO-4 counts
    // a wrong reason as a bare verdict in a costume). The `phase !==
    // "completed"` guard is not decoration: the block above already sets
    // `phase` from `finishGate`/`stoppedStuck`, and a frame on which both
    // latch must not push two ending toasts that contradict each other.
    if (phase !== "completed" && finishDepartureGate?.reachedAtSec != null) {
      phase = "completed";
      endedAtSec = tick.t;
      hudEvents.push(routeDepartedEndingCopy(examMode));
    }
  }

  // ---------------------------------------------------------------------
  // FR-B5-JAM — THE CRASH PIN (finish.ts, see its block for the measurement)
  //
  // A car pressed against what it just hit is stuck in a way NEITHER gate
  // above can see: both are anchored at the END of the route, and the founder's
  // drive was pinned 32 m short of it — throttle held, nothing moving, forty
  // seconds, lesson unfinishable. This is the third gate, anchored on the
  // impact instead of on the route: collision → did not leave the spot → stood
  // completely still for CRASH_PIN_STUCK_S. It grades nothing; the collision
  // keeps its ten points and every unreached objective stays unreached.
  // ---------------------------------------------------------------------
  let crashPin = prev.crashPin;
  {
    const crashed = scoredEvents.some(
      (e) => e.kind === "violation" && e.terminateSession === true,
    );
    if (crashed) {
      // Re-arm on every impact: the pose that matters is the LAST one.
      crashPin = { atSec: tick.t, x: tick.position.x, y: tick.position.y, stillSinceSec: null };
    } else if (crashPin !== undefined) {
      const awayM = Math.hypot(tick.position.x - crashPin.x, tick.position.y - crashPin.y);
      if (awayM > CRASH_PIN_RADIUS_M) {
        crashPin = undefined; // drove away — not stuck, and never closed down
      } else if (yieldWait?.holding === true || tick.speedKmh > FINISH_STANDSTILL_KMH) {
        // Moving, or lawfully waiting (B15's freeze applies here for the same
        // reason it applies to the other two gates: that second is evidence of
        // nothing). Drop the partial dwell rather than bank it.
        if (crashPin.stillSinceSec !== null) crashPin = { ...crashPin, stillSinceSec: null };
      } else if (crashPin.stillSinceSec === null) {
        crashPin = { ...crashPin, stillSinceSec: tick.t };
      }
    }
  }
  /**
   * O22/O29 — THE CAR IS NO LONGER IN THE AUTHORED WORLD.
   *
   * Folded before the finish gates on purpose: this ending is not anchored on
   * route geometry, so no gate's arming state is involved, and a car off the
   * network cannot be reasoned about by anything that measures distance to a
   * zone. Written back unconditionally, like `crashPin`, because it must be
   * able to return to absent — every frame back on a road resets it, and two
   * separate excursions are two recoveries the student DROVE back from rather
   * than one long strand.
   *
   * `stepOffNetwork` shipped built and tested and folded by NOTHING, because
   * the lane that wrote it owned `finish.ts` and this file was not its to
   * touch. That is the same routing debt that produced the straddle regression
   * one round earlier; this is the edit that spends it.
   */
  const offNet = stepOffNetwork(prev.offNetworkSinceSec, tick, posedAtSec !== undefined);
  if (phase === "driving" && prev.phase === "driving" && offNet.ended) {
    phase = "completed";
    endedAtSec = tick.t;
    // THEO-4: never a bare verdict, and never borrowed copy. Both endings this
    // file could already speak say «край на маршрута», which is exactly what
    // has NOT happened here — telling a student he reached the end of a route
    // he drove off is the false sentence this ending exists to avoid.
    hudEvents.push(offNetworkEndingCopy(examMode));
  }
  if (
    phase === "driving" &&
    prev.phase === "driving" &&
    posedAtSec !== undefined &&
    crashPin?.stillSinceSec != null &&
    tick.t - crashPin.stillSinceSec >= CRASH_PIN_STUCK_S
  ) {
    phase = "completed";
    endedAtSec = tick.t;
    // THEO-4: never a bare verdict. Name what happened, say why the drive is
    // being closed rather than left running, and hand him to the debrief —
    // where the collision's own explanation and corrective already live.
    hudEvents.push({
      kind: "lesson",
      titleBg: examMode ? "Край на изпита след удара" : "Край на упражнението след удара",
      explanationBg: examMode
        ? "След удара колата остана притисната на място и маршрутът не може да продължи, затова изпитът приключва тук. Разборът показва удара, всяка останала задача и какво трябваше да се направи преди него."
        : "След удара колата остана притисната на място и не може да продължи по маршрута — затова урокът приключва тук, вместо да те държи блокиран. Разборът показва как се стига до такъв удар и какво го предотвратява: по-ранно намаляване и достатъчна дистанция до всичко неподвижно напред.",
    });
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
      coachedMistakes: coachedNew.length > 0 ? [...coachedPrev, ...coachedNew] : coachedPrev,
      lastT: Math.max(prev.lastT, tick.t),
      ...(posedAtSec !== undefined ? { posedAtSec } : {}),
      ...(eventPositions !== undefined ? { eventPositions } : {}),
      ...(examTermination !== undefined ? { examTermination } : {}),
      ...(finishGate !== undefined ? { finishGate } : {}),
      ...(finishRescueGate !== undefined ? { finishRescueGate } : {}),
      ...(finishDepartureGate !== undefined ? { finishDepartureGate } : {}),
      ...(yieldWait !== undefined ? { yieldWait } : {}),
      ...(yieldWaitSec !== undefined ? { yieldWaitSec } : {}),
      ...(yieldVoice !== undefined ? { yieldVoice } : {}),
      // The run-out's `null` (a route that ends nowhere) is a decision, not a
      // state to carry: it terminated the session on the frame it was taken, so
      // only the live object is ever written back.
      ...(runOut !== undefined && runOut !== null ? { routeRunOut: runOut } : {}),
      // FR-B5-JAM: the one field that must be able to go BACK to absent (the
      // student reversed out and drove away), which the additive spread above
      // cannot express over `...prev` — so it is written unconditionally.
      crashPin,
      // Same reason, same shape: every frame back on a road must clear it, and
      // `...prev` cannot express a field returning to null.
      offNetworkSinceSec: offNet.sinceSec,
      ...(mistakeHitAt !== undefined ? { mistakeExperienceHitAtSec: mistakeHitAt } : {}),
    },
    hudEvents,
    teachMoments,
    ...(mistakeMoment !== undefined ? { mistakeMoment } : {}),
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

  /**
   * A9: fold the coach's repeat escalations into the training-layer score. The
   * official verdict below stays on official base points (see escalation.ts's
   * header for the rationale).
   *
   * OVER THE ROWS THE LEDGER CHARGED, AND NO OTHERS — and that filter is NOT
   * applied here. `foldTrainingScore` applies it, `wire.ts gradeFinishWire`
   * calls the same function, and that is the entire fix: this file and that one
   * each owned a copy, they were repaired in separate lanes, and in between
   * them the server's sheet — the one the student reads — printed a
   * «Тренировъчен резултат» the client never computed. escalation.ts's header
   * carries the drive and the numbers.
   */
  const { effectiveTotalPoints, escalated } = foldTrainingScore(
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
    // B15: of that duration, the seconds spent lawfully stationary at a yield.
    // Carried so the rubric's par-time line can stop calling a correct wait
    // slowness; it never reaches a point, a star or the verdict.
    ...(state.yieldWaitSec !== undefined ? { yieldWaitSec: state.yieldWaitSec } : {}),
    // A15: the mistake-map channels ride into the result untouched.
    ...(state.eventPositions !== undefined ? { eventPositions: state.eventPositions } : {}),
    ...(state.nearMisses !== undefined ? { nearMisses: state.nearMisses } : {}),
    // A13: the exam-termination record (examMode sessions only).
    ...(state.examTermination !== undefined ? { examTermination: state.examTermination } : {}),
    // The shown-but-not-charged record — the debrief's coached channel finally
    // has a producer (see LessonSessionState.coachedMistakes). `?? []` for the
    // same fixture reason recordCoached states.
    ...((state.coachedMistakes ?? []).length > 0
      ? { coachedMistakes: state.coachedMistakes }
      : {}),
  };
}
