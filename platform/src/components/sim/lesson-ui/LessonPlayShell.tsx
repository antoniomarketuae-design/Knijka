"use client";

/**
 * Lesson play shell — owns one lesson session end to end:
 *
 *   SceneSlot (3D, integrator) ──onTick──▶ lesson engine (pure, in a ref)
 *        │                                        │
 *        └─onPreDriveStep──▶ pre-drive machine    ├─▶ HUD events → toasts/banner
 *                                                 └─▶ phase → end screen → server action
 *
 * Perf model (same as the old SimHud): the engine state lives in a ref and
 * advances at frame rate with ZERO re-renders; React snapshots it on a 150 ms
 * interval for the HUD readouts. Toasts/flashes re-render only when events
 * actually fire.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GearIndicatorCard,
  HudStyles,
  HudToasts,
  Minimap,
  ObjectiveBanner,
  PreDriveChecklist,
  SessionEndScreen,
  SpeedCard,
  useHudToastQueue,
  type MinimapFrame,
  type ObjectiveFlash,
} from "@/modules/sim/hud";
import {
  abortSession,
  applyNearMiss,
  applyPreDriveStep,
  applyStagedOutcome,
  applyTick,
  buildDebrief,
  buildLessonResult,
  createLessonSession,
  createQuizTriggerState,
  EXAM_TERMINATION_TEXT_BG,
  finishSession,
  isDriveLocked,
  observeQuizTick,
  serializeNearMisses,
  serializeRuleEvents,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
  type MicroQuizQuestion,
  type NearMissEvent,
  type QuizFrequency,
  type QuizTriggerState,
  type StagedEventOutcome,
  type TeachMoment,
  type TriggeredQuiz,
} from "@/modules/sim/lessons";
import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  preDriveStepKind,
  type PreDriveMode,
  type PreDriveStepId,
} from "@/modules/sim/procedures";
import { accumulateScore, type SimTick } from "@/modules/sim/rules";
import type { DrivelineSnapshot } from "@/modules/sim/vehicle";
import { finishLessonAction } from "@/app/(dashboard)/simulator/actions";
import {
  loadMicroQuizBank,
  submitMicroQuizAnswer,
} from "@/app/(dashboard)/simulator/micro-quiz-actions";
import { MicroQuizOverlay } from "./MicroQuizOverlay";
import { SceneSlot } from "./SceneSlot";
import { TeachMomentOverlay } from "./TeachMomentOverlay";
import {
  MICRO_QUIZ_FREQUENCIES,
  MICRO_QUIZ_STORAGE_KEY,
  type FinishLessonActionResult,
  type QualityPreset,
} from "./types";

const HUD_POLL_MS = 150;

/** QW10: min seconds between two "завърши подготовката" toasts. */
const BLOCKED_DRIVE_TOAST_COOLDOWN_S = 10;

/** A2 practice mode: seconds of pre-drive idling before a gentle hint. */
const PRACTICE_HINT_IDLE_S = 20;
/** How often the practice-idle watchdog checks (ms). */
const PRACTICE_HINT_POLL_MS = 2000;

interface HudSnapshot {
  phase: LessonSessionState["phase"];
  /** QW10: pre-drive phase — the scene keeps the vehicle stationary. */
  driveLocked: boolean;
  speedKmh: number;
  limitKmh: number;
  gear: number;
  indicator: SimTick["indicator"];
  headlights: SimTick["headlights"];
  seatbeltOn: boolean;
  /** A1: driveline telltales (ignition/selector/parking brake/hazards/fog/
   *  stall) — null until the scene emits the first snapshot. */
  driveline: DrivelineSnapshot | null;
  objectiveTitle: string | null;
  objectiveIndex: number;
  objectiveTotal: number;
  objectiveProgress: number | null;
  preDriveCompleted: PreDriveStepId[];
  preDriveWrongOrder: PreDriveStepId[];
  /** Canonical next pending step while in the pre-drive phase, else null. */
  preDriveNextStepId: PreDriveStepId | null;
  vehicle: { x: number; y: number; headingDeg: number } | null;
  /** A13: live official tally (exam sessions only, null otherwise). */
  examTally: { totalPoints: number; osnovniPoints: number; opasniCount: number } | null;
}

function snapshotOf(
  s: LessonSessionState,
  lastTick: SimTick | null,
  driveline: DrivelineSnapshot | null = null,
): HudSnapshot {
  const active =
    s.currentObjectiveIndex < s.objectives.length
      ? s.objectives[s.currentObjectiveIndex]
      : null;
  const preDrive = s.preDrive;
  return {
    phase: s.phase,
    driveLocked: isDriveLocked(s),
    speedKmh: lastTick?.speedKmh ?? 0,
    limitKmh: lastTick?.maxSpeedKmh ?? 50,
    gear: lastTick?.gear ?? 0,
    indicator: lastTick?.indicator ?? "off",
    headlights: lastTick?.headlights ?? "off",
    seatbeltOn: lastTick?.seatbeltOn ?? false,
    driveline,
    objectiveTitle: s.phase === "driving" && active ? active.spec.titleBg : null,
    objectiveIndex: s.currentObjectiveIndex + 1,
    objectiveTotal: s.objectives.length,
    objectiveProgress:
      active && (active.params.kind === "driveDistance" || active.params.kind === "completeManeuver")
        ? active.progress
        : null,
    preDriveCompleted: preDrive ? [...preDrive.completedStepIds] : [],
    preDriveWrongOrder: preDrive ? [...preDrive.wrongOrderStepIds] : [],
    preDriveNextStepId:
      s.phase === "preDrive" && preDrive
        ? PRE_DRIVE_STEP_ORDER.find((id) => !preDrive.completedStepIds.includes(id)) ?? null
        : null,
    vehicle: lastTick
      ? {
          x: lastTick.position.x,
          y: lastTick.position.y,
          headingDeg: lastTick.headingDeg,
        }
      : null,
    // A13: the live protocol tally — folded from the session's scored events
    // per the official taxonomy (rules/scoring.ts). Exam sessions only.
    examTally:
      s.lesson.examMode === true
        ? (() => {
            const score = accumulateScore(s.events);
            return {
              totalPoints: score.totalPoints,
              osnovniPoints: score.osnovniPoints,
              opasniCount: score.opasniCount,
            };
          })()
        : null,
  };
}

const DEFAULT_QUIZ_FREQUENCY: QuizFrequency = "occasional";

function isQuizFrequency(v: unknown): v is QuizFrequency {
  return v === "off" || v === "occasional" || v === "frequent";
}

function readStoredQuizFrequency(): QuizFrequency {
  // Safe as a lazy useState initializer: this shell mounts client-side only
  // (after the student picks a lesson), so there is no SSR/hydration pass to
  // mismatch — no effect + setState dance needed.
  if (typeof window === "undefined") return DEFAULT_QUIZ_FREQUENCY;
  try {
    const stored = window.localStorage.getItem(MICRO_QUIZ_STORAGE_KEY);
    return isQuizFrequency(stored) ? stored : DEFAULT_QUIZ_FREQUENCY;
  } catch {
    return DEFAULT_QUIZ_FREQUENCY;
  }
}

/** Persisted micro-quiz difficulty (localStorage). */
function useQuizFrequency(): [QuizFrequency, (f: QuizFrequency) => void] {
  const [freq, setFreq] = useState<QuizFrequency>(readStoredQuizFrequency);
  const update = (f: QuizFrequency) => {
    setFreq(f);
    try {
      window.localStorage.setItem(MICRO_QUIZ_STORAGE_KEY, f);
    } catch {
      // Private mode etc. — the in-memory value still applies this session.
    }
  };
  return [freq, update];
}

function QuizFrequencySelector({
  value,
  onChange,
}: {
  value: QuizFrequency;
  onChange: (f: QuizFrequency) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Въпроси по време на карането"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      title="Колко често изникват учебни въпроси по време на карането"
    >
      <span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
        Въпроси
      </span>
      {MICRO_QUIZ_FREQUENCIES.map((f) => {
        const active = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition motion-reduce:transition-none ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {f.labelBg}
          </button>
        );
      })}
    </div>
  );
}

export function LessonPlayShell({
  lesson,
  quality,
  nextLesson,
  onExitToSelect,
  onStartLesson,
}: {
  lesson: LessonSpec;
  quality: QualityPreset;
  /** The following lesson in the curriculum (for „Следващ урок“); null on L4. */
  nextLesson: { id: string; titleBg: string } | null;
  onExitToSelect: () => void;
  onStartLesson: (lessonId: string) => void;
}) {
  // Engine state: ref-resident, frame-rate mutations, zero re-renders.
  const [initialSession] = useState(() => createLessonSession(lesson));
  const sessionRef = useRef<LessonSessionState>(initialSession);
  const finalizedRef = useRef(false);
  const lastTickRef = useRef<SimTick | null>(null);
  // A1: latest driveline snapshot from the scene (a few Hz) — ref-resident,
  // folded into the HUD snapshot by the regular poll below.
  const drivelineRef = useRef<DrivelineSnapshot | null>(null);
  const handleDriveline = useCallback((snap: DrivelineSnapshot) => {
    drivelineRef.current = snap;
  }, []);
  // Clocks are set in a mount effect (render must stay pure per lint rules).
  const startedAtMsRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtMsRef.current ??= Date.now();
    mountedAtRef.current ??= performance.now();
  }, []);

  const [snap, setSnap] = useState<HudSnapshot>(() => snapshotOf(initialSession, null));
  const [flash, setFlash] = useState<ObjectiveFlash | null>(null);
  const flashKey = useRef(0);
  const [minimapFrame, setMinimapFrame] = useState<MinimapFrame | null>(null);
  const [result, setResult] = useState<LessonResult | null>(null);
  const [saveResult, setSaveResult] = useState<FinishLessonActionResult | null>(null);
  const { toasts, push, clear } = useHudToastQueue();

  // -- QW1: fullscreen (immersive) mode ----------------------------------------
  // The fullscreen ELEMENT is the shell root (not just the canvas): the
  // browser then hides all surrounding dashboard chrome for free, while the
  // slim top bar (abort/finish, quiz frequency) stays reachable inside.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement;
      setIsFullscreen(fs !== null && fs === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        // Denied (permissions policy / lost activation) — letterboxed play
        // still works; the ⛶ button and X remain available.
      });
    }
  }, []);

  // Enter fullscreen on lesson start: this shell mounts synchronously from
  // the start click on the select screen, so the transient user-activation
  // window of that gesture is still open when this mount effect runs
  // (Chrome/Firefox). Stricter browsers reject → we stay letterboxed,
  // no error surfaced (Esc always exits; fullscreenchange syncs state).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || document.fullscreenElement) return;
    void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, []);

  // X toggles fullscreen (F is taken by the rear-mirror glance). Listed in
  // the controls legend (LessonScene ControlsHelp).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyX" && !e.repeat) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  // A13: exam session — teach/quiz/guidance machinery OFF, examiner framing
  // ON. The always-grade + termination behavior lives in the engine (it reads
  // lesson.examMode itself); the shell only adapts the presentation.
  const examMode = lesson.examMode === true;

  // A2: pre-drive mode (Instruction→Practice→Assess). The machine applies the
  // matching order-scoring; the shell derives the presentation from it.
  const preDriveMode: PreDriveMode = lesson.preDriveMode ?? "instruction";
  // Session time of the last completed step — the practice-idle hint reads it.
  const lastPreDriveStepAtRef = useRef(0);

  // -- micro-quiz: the theory↔driving closed loop ------------------------------
  // The pure trigger lives in a ref (frame-rate, zero re-renders); an active
  // quiz is React state (it pauses the drive + renders the overlay).
  const [quizFreq, setQuizFreq] = useQuizFrequency();
  const quizFreqRef = useRef<QuizFrequency>(quizFreq);
  const quizBankRef = useRef<MicroQuizQuestion[]>([]);
  const quizTriggerRef = useRef<QuizTriggerState | null>(null);
  const quizStatsRef = useRef<{ total: number; correct: number }>({ total: 0, correct: 0 });
  const [activeQuiz, setActiveQuiz] = useState<TriggeredQuiz | null>(null);

  // Load the concept-linked question bank once per lesson (server-sanitized),
  // then build the pure trigger from it. No bank ⇒ no quizzes (graceful).
  // A13: exam sessions never quiz — the bank is not even fetched, so the
  // trigger stays null and observeQuizTick is never armed.
  useEffect(() => {
    if (examMode) return;
    let cancelled = false;
    void loadMicroQuizBank(lesson.id).then(
      (bank) => {
        if (cancelled) return;
        quizBankRef.current = bank;
        quizTriggerRef.current = createQuizTriggerState(quizFreqRef.current, bank);
      },
      () => {
        /* bank load failed — leave the trigger null */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lesson.id, examMode]);

  // Frequency changes apply immediately, keeping the session's counters.
  useEffect(() => {
    quizFreqRef.current = quizFreq;
    if (quizTriggerRef.current) {
      quizTriggerRef.current = { ...quizTriggerRef.current, frequency: quizFreq };
    }
  }, [quizFreq]);

  const handleQuizDone = useCallback((correct: boolean) => {
    quizStatsRef.current = {
      total: quizStatsRef.current.total + 1,
      correct: quizStatsRef.current.correct + (correct ? 1 : 0),
    };
    setActiveQuiz(null); // resume the drive
  }, []);

  // -- A9: teach-moment pause queue ---------------------------------------------
  // First-encounter teachable mistakes PAUSE the sim with a mini-lesson card
  // (doc 65 §5). The engine rate-limits pauses (TEACH_PAUSE_MIN_GAP_S) and a
  // same-batch cluster lands here as several moments at once — they merge
  // into ONE pause: the overlay pages through the queue, and the drive
  // resumes only when the last card is acknowledged. Physics freezing uses
  // the same `paused` mechanism as the micro-quiz overlay.
  const [teachQueue, setTeachQueue] = useState<TeachMoment[]>([]);
  const handleTeachAcknowledged = useCallback(() => {
    setTeachQueue((q) => q.slice(1));
  }, []);

  /** Session clock: prefer the runtime's tick time; wall clock before ticks flow. */
  const nowSec = useCallback((): number => {
    const t = lastTickRef.current?.t ?? 0;
    const mountedAt = mountedAtRef.current ?? performance.now();
    return Math.max(t, (performance.now() - mountedAt) / 1000);
  }, []);

  // -- finalize: fold + persist ------------------------------------------------
  const finalize = useCallback(
    (state: LessonSessionState) => {
      if (finalizedRef.current) return; // exactly one grade + one save per session
      finalizedRef.current = true;
      sessionRef.current = state;
      const r = buildLessonResult(state);
      setResult(r);

      void finishLessonAction({
        lessonId: lesson.id,
        startedAtMs: startedAtMsRef.current ?? Date.now(),
        finishedAtMs: Date.now(),
        aborted: r.aborted,
        // A9: escalation multipliers ride along so the authoritative server
        // grade/debrief carries the same „повторна грешка ×1.5" annotations
        // (validated server-side; official score stays catalog-rebuilt).
        // A15: event positions ride the same refs (validated server-side,
        // display metadata only); near-misses go as the additive session stat.
        ruleEvents: serializeRuleEvents(
          state.events,
          state.penaltyEscalations,
          state.eventPositions ?? [],
        ),
        objectives: r.objectives.map((o) => ({
          id: o.id,
          done: o.done,
          completedAtSec: o.completedAtSec,
        })),
        microQuiz: { ...quizStatsRef.current },
        nearMisses: serializeNearMisses(state.nearMisses ?? []),
      }).then(setSaveResult, () => setSaveResult({ ok: false, code: "SAVE_FAILED" }));
    },
    [lesson.id],
  );

  // -- SceneSlot callbacks -------------------------------------------------------
  const handleTick = useCallback(
    (tick: SimTick) => {
      const prev = sessionRef.current;
      if (prev.phase === "completed" || prev.phase === "aborted") return;
      const { state, hudEvents, teachMoments } = applyTick(prev, tick);
      sessionRef.current = state;
      lastTickRef.current = tick;

      if (hudEvents.length > 0) {
        push(
          hudEvents.filter(
            (e) => e.kind === "violation" || e.kind === "commendation" || e.kind === "lesson",
          ),
        );
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }

      // A9 teach moments → pause + card. Appending (not replacing) merges a
      // cluster — and the odd frame that slips in before `paused` propagates
      // to the scene — into the one already-open pause session.
      if (teachMoments !== undefined && teachMoments.length > 0) {
        setTeachQueue((q) => [...q, ...teachMoments]);
      }

      // Contextual micro-quiz: feed the SAME tick the rules saw to the pure
      // trigger. Only while driving and not already quizzing or teaching; the
      // rate limit + the pause (which stops onTick) prevent stacking. When
      // one fires we surface it as React state → overlay + pause.
      if (
        state.phase === "driving" &&
        activeQuiz === null &&
        teachQueue.length === 0 &&
        quizTriggerRef.current
      ) {
        const q = observeQuizTick(quizTriggerRef.current, tick);
        quizTriggerRef.current = q.state;
        if (q.quiz) setActiveQuiz(q.quiz);
      }

      // prev was live (guard above), so "completed" here means: the route
      // finished on this very frame → grade and persist (finalize is guarded).
      if (state.phase === "completed") finalize(state);
    },
    [push, finalize, activeQuiz, teachQueue],
  );

  // A8/A15 measurement channels — ref-resident like the tick path (no
  // re-render): staged-encounter outcomes feed A10's objective locks +
  // the end-screen reaction readout; near-misses feed the mistake map
  // (session stat, never graded). The player's last-tick position stands in
  // for the near-miss location (clearance is sub-meter).
  const handleStagedOutcome = useCallback((outcome: StagedEventOutcome) => {
    if (finalizedRef.current) return;
    sessionRef.current = applyStagedOutcome(sessionRef.current, outcome);
  }, []);
  const handleNearMiss = useCallback((event: NearMissEvent) => {
    if (finalizedRef.current) return;
    sessionRef.current = applyNearMiss(
      sessionRef.current,
      event,
      lastTickRef.current?.position ?? null,
    );
  }, []);

  // A2: the ONLY sink for pre-drive completions. Performed steps arrive from
  // the scene's transition observer (keyboard or cockpit hotspot — same
  // path); info steps arrive from the read-only checklist's confirm button.
  const handlePreDriveStep = useCallback(
    (stepId: PreDriveStepId, tSec?: number) => {
      const t = tSec ?? nowSec();
      const prev = sessionRef.current;
      const { state, hudEvents } = applyPreDriveStep(prev, stepId, t);
      sessionRef.current = state;
      lastPreDriveStepAtRef.current = Math.max(lastPreDriveStepAtRef.current, t);

      // A13: an exam can terminate DURING the pre-drive (assess mode scores
      // live; crossing the official limits before even moving off ends the
      // exam on the spot). Training lessons never complete from this path.
      if (state.phase === "completed") finalize(state);

      if (hudEvents.length > 0) {
        push(
          hudEvents.filter(
            (e) => e.kind === "violation" || e.kind === "commendation" || e.kind === "lesson",
          ),
        );
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current));
    },
    [push, nowSec, finalize],
  );

  // -- QW10: blocked-drive explanation ------------------------------------------
  // Throttle attempt during the pre-drive phase while the car is NOT yet
  // genuinely ready (engine off / P / parking brake on) → one teaching toast
  // explaining WHY it stays put; a cooldown keeps repeat presses silent. Once
  // the driveline IS ready, the same press performs "move-off" instead.
  const blockedToastAtSecRef = useRef(Number.NEGATIVE_INFINITY);
  const handleBlockedDriveAttempt = useCallback(() => {
    const t = nowSec();
    if (t - blockedToastAtSecRef.current < BLOCKED_DRIVE_TOAST_COOLDOWN_S) return;
    blockedToastAtSecRef.current = t;
    push([
      {
        kind: "lesson",
        titleBg: "Колата още не е готова за потегляне",
        explanationBg:
          "Работи с истинските контроли: запали двигателя (I), включи предавка с ], освободи ръчната спирачка (Space). Списъкът вляво се отмята сам, докато го правиш — потегляш с газта, когато колата наистина може да тръгне.",
      },
    ]);
  }, [nowSec, push]);

  // -- A2 practice mode: gentle hint after ~20 s of pre-drive idling ------------
  useEffect(() => {
    if (preDriveMode !== "practice") return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      const preDrive = s.preDrive;
      if (s.phase !== "preDrive" || preDrive === null || finalizedRef.current) return;
      const now = nowSec();
      if (now - lastPreDriveStepAtRef.current < PRACTICE_HINT_IDLE_S) return;
      lastPreDriveStepAtRef.current = now; // re-arm — next hint in another 20 s
      const nextId = PRE_DRIVE_STEP_ORDER.find((id) => !preDrive.completedStepIds.includes(id));
      if (!nextId) return;
      push([
        {
          kind: "lesson",
          titleBg: `Подсказка: ${PRE_DRIVE_STEPS[nextId].titleBg.toLowerCase()}`,
          explanationBg: PRE_DRIVE_STEPS[nextId].instructionBg,
        },
      ]);
    }, PRACTICE_HINT_POLL_MS);
    return () => window.clearInterval(id);
  }, [preDriveMode, nowSec, push]);

  // -- HUD poll ------------------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current));
    }, HUD_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // -- manual endings --------------------------------------------------------------
  const ended = result !== null;
  const finishNow = () => finalize(finishSession(sessionRef.current, nowSec()));
  const abortNow = () => finalize(abortSession(sessionRef.current, nowSec()));

  const retry = () => {
    sessionRef.current = createLessonSession(lesson);
    finalizedRef.current = false;
    lastTickRef.current = null;
    startedAtMsRef.current = Date.now();
    mountedAtRef.current = performance.now();
    setResult(null);
    setSaveResult(null);
    setFlash(null);
    clear();
    // Fresh pre-drive: the scene's observer re-baselines on the driveLocked
    // rising edge (a car left running/belted by the previous run never
    // auto-completes steps — the student re-performs the transitions); the
    // idle-hint clock and the blocked-drive toast cooldown restart here.
    lastPreDriveStepAtRef.current = 0;
    blockedToastAtSecRef.current = Number.NEGATIVE_INFINITY;
    // Fresh micro-quiz session: reset the tally + rebuild the trigger from the
    // already-loaded bank. Teach-moment queue starts empty too (the fresh
    // engine state re-teaches first encounters from scratch).
    quizStatsRef.current = { total: 0, correct: 0 };
    setActiveQuiz(null);
    setTeachQueue([]);
    quizTriggerRef.current =
      quizBankRef.current.length > 0
        ? createQuizTriggerState(quizFreqRef.current, quizBankRef.current)
        : null;
    // The cabin/driveline keeps its physical state across a retry (the car
    // does not teleport or reset) — keep showing the live telltales.
    setSnap(snapshotOf(sessionRef.current, null, drivelineRef.current));
  };

  // Debrief: the template is deterministic — render it instantly client-side;
  // the server recomputes + stores the same text and adds the concept links.
  // Client-side fallback debrief (shown only until the server's richer text
  // arrives, or if the save fails). The authoritative server debrief carries
  // the micro-quiz tally, prior-best comparison and concept titles; this
  // transient fallback stays deterministic and reads no refs during render.
  const debriefText = ended
    ? saveResult?.ok
      ? saveResult.debriefText
      : buildDebrief(lesson, result).text
    : null;

  return (
    <div
      ref={rootRef}
      className={
        // Fullscreen: the UA sizes this element to the viewport — become a
        // padded column so the scene (flex-1) absorbs all remaining height.
        isFullscreen
          ? "flex h-full flex-col gap-2 overflow-hidden bg-background p-2"
          : "flex flex-col gap-3"
      }
    >
      <HudStyles />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onExitToSelect}>
          ← Всички уроци
        </button>
        <h1 className="text-lg font-extrabold">{lesson.titleBg}</h1>
        {/* A13: unmistakable exam framing — this is a protocol, not a lesson. */}
        {examMode ? (
          <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-danger">
            Изпит
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!ended ? (
            <>
              {/* A13: no micro-quizzes on an exam — the selector disappears. */}
              {!examMode ? <QuizFrequencySelector value={quizFreq} onChange={setQuizFreq} /> : null}
              {lesson.objectives.length === 0 ? (
                <button type="button" className="btn-accent px-4 py-1.5 text-xs" onClick={finishNow}>
                  Завърши сесията
                </button>
              ) : (
                <button type="button" className="btn-ghost px-4 py-1.5 text-xs" onClick={abortNow}>
                  {/* A13: no mid-exam restart — leaving = abort, next try is a
                      fresh attempt from the briefing. */}
                  {examMode ? "Прекрати изпита" : "Прекрати урока"}
                </button>
              )}
            </>
          ) : null}
          {/* QW1: fullscreen toggle — the same control exits (Esc works too). */}
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Изход от цял екран (X или Esc)" : "Цял екран (X)"}
          >
            <span aria-hidden>⛶</span> {isFullscreen ? "Изход" : "Цял екран"}
          </button>
        </div>
      </div>

      {/* Scene + HUD overlays */}
      <div
        className={`relative w-full overflow-hidden bg-surface ${
          isFullscreen
            ? "min-h-0 flex-1 rounded-lg"
            : "rounded-xl border border-border"
        }`}
      >
        <div className={isFullscreen ? "h-full w-full" : "aspect-video w-full"}>
          <SceneSlot
            lesson={lesson}
            quality={quality}
            paused={ended || activeQuiz !== null || teachQueue.length > 0}
            driveLocked={snap.driveLocked && !ended}
            preDriveHighlightStepId={
              // Instruction mode only: pulse the pending step's hotspot(s).
              preDriveMode === "instruction" && !ended ? snap.preDriveNextStepId : null
            }
            // A7: snapshotOf stores currentObjectiveIndex + 1 — undo the +1 so
            // the scene's in-world route guidance gets the engine's 0-based
            // index (=== objectives.length once all are done → guidance hides).
            // A13: exam sessions pass the all-done index UNCONDITIONALLY — the
            // ghost route / turn arrows / markers never render; the student
            // navigates by the objective banner's examiner instructions.
            activeObjectiveIndex={
              examMode ? lesson.objectives.length : snap.objectiveIndex - 1
            }
            onTick={handleTick}
            onPreDriveStep={handlePreDriveStep}
            onBlockedDriveAttempt={handleBlockedDriveAttempt}
            onMinimapFrame={setMinimapFrame}
            onDriveline={handleDriveline}
            // P1: the touch overlay's ⛶ button — same QW1 toggle as key X.
            onToggleFullscreen={toggleFullscreen}
            // A8/A15: measurement channels (staged outcomes + near-misses).
            onStagedOutcome={handleStagedOutcome}
            onNearMiss={handleNearMiss}
          />
        </div>

        {/* Objective banner — top center */}
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <ObjectiveBanner
            titleBg={snap.objectiveTitle}
            index={Math.min(snap.objectiveIndex, Math.max(1, snap.objectiveTotal))}
            total={snap.objectiveTotal}
            progress={snap.objectiveProgress}
            flash={flash}
          />
        </div>

        {/* Toasts — right side */}
        <div className="absolute right-3 top-3">
          <HudToasts toasts={toasts} />
        </div>

        {/* Speed + gear — bottom left */}
        {!ended ? (
          <div className="absolute bottom-3 left-3 flex items-end gap-2">
            <SpeedCard speedKmh={snap.speedKmh} limitKmh={snap.limitKmh} />
            <GearIndicatorCard
              gear={snap.gear}
              indicator={snap.indicator}
              headlights={snap.headlights}
              seatbeltOn={snap.seatbeltOn}
              driveline={snap.driveline}
            />
          </div>
        ) : null}

        {/* Minimap — bottom right */}
        {!ended ? (
          <div className="absolute bottom-3 right-3">
            <Minimap
              polylines={minimapFrame?.polylines ?? []}
              transform={
                minimapFrame?.transform ?? {
                  centerX: snap.vehicle?.x ?? 0,
                  centerY: snap.vehicle?.y ?? 0,
                  pxPerMeter: 1.1,
                }
              }
              vehicle={snap.vehicle}
            />
          </div>
        ) : null}

        {/* A13: live protocol tally — the exam's honest scoreboard (official
            taxonomy: total / основни / опасни against the doc-32 limits). */}
        {examMode && snap.examTally !== null && snap.phase === "driving" && !ended ? (
          <div className="absolute left-3 top-3">
            <div
              aria-label="Протокол — наказателни точки"
              className="rounded-xl border border-border bg-surface/90 px-3 py-2 text-xs backdrop-blur"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-muted">
                Протокол
              </p>
              <p className="mt-0.5 flex items-baseline gap-1 font-black tabular-nums">
                <span
                  className={
                    snap.examTally.totalPoints > 9 ? "text-danger" : "text-foreground"
                  }
                >
                  {snap.examTally.totalPoints}
                </span>
                <span className="font-semibold text-muted">/ 9 т.</span>
              </p>
              <p className="text-[10px] font-semibold tabular-nums text-muted">
                основни {snap.examTally.osnovniPoints} / 6
                {snap.examTally.opasniCount > 0 ? " · опасна!" : ""}
              </p>
            </div>
          </div>
        ) : null}

        {/* Pre-drive progress — READ-ONLY panel (A2): rows tick as the student
            performs the steps on real controls; only info steps confirm here. */}
        {snap.phase === "preDrive" && !ended ? (
          <div className="absolute left-3 top-3 max-h-[calc(100%-1.5rem)] overflow-y-auto">
            <PreDriveChecklist
              completedStepIds={snap.preDriveCompleted}
              wrongOrderStepIds={snap.preDriveWrongOrder}
              mode={preDriveMode}
              onConfirmStep={(stepId) => {
                // Defense in depth: performable steps NEVER complete by click.
                if (preDriveStepKind(stepId) === "info") handlePreDriveStep(stepId);
              }}
            />
          </div>
        ) : null}

        {/* Micro-quiz — overlay (pauses the drive). Hidden once the session
            ends so the end screen never competes with it. */}
        {activeQuiz && !ended ? (
          <MicroQuizOverlay
            quiz={activeQuiz}
            onSubmit={submitMicroQuizAnswer}
            onDone={handleQuizDone}
          />
        ) : null}

        {/* A9 teach moment — pause + mini-lesson card. A quiz that fired first
            keeps priority; the teach card shows right after it closes (both
            hold `paused`, so no drive time passes in between). */}
        {teachQueue.length > 0 && !activeQuiz && !ended ? (
          <TeachMomentOverlay
            moment={teachQueue[0]}
            remaining={teachQueue.length - 1}
            onAcknowledge={handleTeachAcknowledged}
          />
        ) : null}

        {/* Session end — overlay. A13: exam sessions get the examiner-protocol
            framing ABOVE the official verdict card — „Изпитът се прекратява"
            with the reason when the limits ended it mid-route; the A15
            mistake map + correctives below stay (learning continues after
            the verdict). */}
        {ended && result ? (
          <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6">
            <div className="flex w-full max-w-2xl flex-col gap-3">
              {examMode ? (
                <section
                  aria-label="Протокол на изпитващия"
                  className={`card border p-4 ${
                    result.examTermination !== undefined
                      ? "border-danger/60"
                      : result.passed
                        ? "border-success/60"
                        : "border-warning/60"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted">
                    Пробен практически изпит · протокол
                  </p>
                  {result.examTermination !== undefined ? (
                    <p className="mt-1 text-sm font-bold text-danger">
                      Изпитът се прекратява:{" "}
                      {EXAM_TERMINATION_TEXT_BG[result.examTermination.reason]}.
                    </p>
                  ) : result.aborted ? (
                    <p className="mt-1 text-sm font-bold text-warning">
                      Изпитът беше прекъснат — опитът не се зачита за издържан.
                    </p>
                  ) : result.passed ? (
                    <p className="mt-1 text-sm font-bold text-success">
                      Маршрутът е завършен в допустимите граници.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-warning">
                      Маршрутът приключи извън изискванията за издържан изпит.
                    </p>
                  )}
                </section>
              ) : null}
              <SessionEndScreen
                lessonTitleBg={lesson.titleBg}
                result={result}
                debriefText={debriefText}
                concepts={saveResult?.ok ? saveResult.concepts : []}
                xpEarned={saveResult?.ok ? saveResult.xpEarned : null}
                onRetry={retry}
                nextLessonTitleBg={nextLesson?.titleBg ?? null}
                onNextLesson={
                  nextLesson && result.passed ? () => onStartLesson(nextLesson.id) : null
                }
                // A15 mistake map: the last live minimap frame carries the FULL
                // district polylines (LessonScene builds them once) — a static
                // fit-to-route view needs nothing else.
                mapPolylines={minimapFrame?.polylines ?? null}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer: save state + ODbL attribution (required — district meta).
          Hidden while fullscreen (immersive chrome-free layout, QW1) UNLESS a
          save failed — that warning must never be suppressed. Attribution
          remains visible in every letterboxed state around the session. */}
      <div
        className={`flex flex-wrap items-center gap-3 text-xs text-muted ${
          isFullscreen && !(ended && saveResult && !saveResult.ok) ? "hidden" : ""
        }`}
      >
        {ended && saveResult && !saveResult.ok ? (
          <span className="font-semibold text-warning">
            Сесията не се записа ({saveResult.code}) — резултатът е само локален.
          </span>
        ) : null}
        {/* The CC-BY roadster is gone — all vehicles are now self-authored
            (ADR-001). OSM attribution stays: the district IS OSM-derived. */}
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
