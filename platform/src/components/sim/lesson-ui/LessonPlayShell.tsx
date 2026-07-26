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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDashboardStatus,
  HudStyles,
  HudToasts,
  Minimap,
  ObjectiveBanner,
  PreDriveChecklist,
  SessionEndScreen,
  StatusDashboard,
  useHudToastQueue,
  type DashboardStatus,
  type MinimapFrame,
  type ObjectiveFlash,
} from "@/modules/sim/hud";
import {
  abortSession,
  ADVISOR_STORAGE_KEY,
  advisorPromptForSession,
  applyNearMiss,
  applyPreDriveStep,
  applyStagedOutcome,
  applyTick,
  buildDebrief,
  buildLessonResult,
  createLessonSession,
  createQuizTriggerState,
  defaultAdvisorEnabled,
  EXAM_TERMINATION_TEXT_BG,
  finishSession,
  isDriveLocked,
  MISTAKE_EXPERIENCE_DEMO_OFFER_SEC,
  observeQuizTick,
  parkingObservationFromTrace,
  parseMistakeExperienceLessonId,
  parseScenarioLessonId,
  parseStoredAdvisorSetting,
  resolveScenarioNextSteps,
  scenarioById,
  scoreRubric,
  serializeAdvisorSetting,
  serializeNearMisses,
  serializeRuleEvents,
  type AdvisorPrompt,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
  type MicroQuizQuestion,
  type MistakeDemo,
  type NearMissEvent,
  type QuizFrequency,
  type QuizTriggerState,
  type RubricObservationInput,
  type RubricScore,
  type ScenarioLevel,
  type ScenarioSpec,
  type StagedEventOutcome,
  type TeachMoment,
  type TriggeredQuiz,
} from "@/modules/sim/lessons";
import {
  compactTraceForStorage,
  createTraceRecorder,
  type LiveTraceRecorder,
} from "@/modules/sim/traces";
import {
  PRE_DRIVE_STEP_ORDER,
  PRE_DRIVE_STEPS,
  preDriveStepKind,
  type PreDriveMode,
  type PreDriveStepId,
} from "@/modules/sim/procedures";
import { accumulateScore, type SimTick } from "@/modules/sim/rules";
import type { DrivelineRejection, DrivelineSnapshot } from "@/modules/sim/vehicle";
import { finishLessonAction } from "@/app/(dashboard)/simulator/actions";
import {
  loadMicroQuizBank,
  submitMicroQuizAnswer,
} from "@/app/(dashboard)/simulator/micro-quiz-actions";
import { recordSelfPredictionAction } from "@/app/(dashboard)/simulator/calibration-actions";
// Deep import, like CalibrationGate's: the learning barrel carries the module's
// server half, and this is a client bundle (audit M-26).
import { isResultScreenHeld } from "@/modules/learning/calibration";
import { AdvisorCard } from "./AdvisorCard";
import { CalibrationGate, CalibrationPendingCard } from "./CalibrationGate";
import { MicroQuizOverlay } from "./MicroQuizOverlay";
import { MistakeConsequenceOverlay } from "./MistakeConsequenceOverlay";
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

/** Driveline-rejection hints: short control feedback, not an 8 s lesson. */
const REJECTION_TOAST_TTL_MS = 3500;
/** Min seconds between two hints for the SAME rejection (mashing [ or I
 *  keeps one toast on screen instead of stacking four). */
const REJECTION_TOAST_COOLDOWN_S = 3;

/**
 * Why the car refused a control action, in HUD grammar (founder bug
 * 2026-07-10: the start interlock and selector gate rejected SILENTLY — „I
 * doesn't start", „] doesn't go up"). The snapshot names the blocking state;
 * endOfGate needs it to tell "already in D" (the founder expecting numbered
 * gears on the automatic) from "already in P" / "top manual gear". No lawRef
 * — this is vehicle operation, not a graded rule.
 */
function rejectionHint(
  rejection: DrivelineRejection,
  snap: DrivelineSnapshot,
): { key: string; titleBg: string; explanationBg: string } {
  if (rejection.kind === "startRejected") {
    return rejection.reason === "clutch"
      ? {
          key: "start-clutch",
          titleBg: "Двигателят не запали",
          explanationBg:
            "Натисни и задръж съединителя (Z) — или премести лоста в P или N — и опитай пак с I.",
        }
      : {
          key: "start-selector",
          titleBg: "Двигателят не запали",
          explanationBg: "Постави скоростния лост в P или N (клавиш [), за да запалиш с I.",
        };
  }
  switch (rejection.reason) {
    case "speed":
      return {
        key: "shift-speed",
        titleBg: "Скоростта е твърде висока",
        explanationBg: "Спри напълно, за да включиш R или P.",
      };
    case "clutch":
      return {
        key: "shift-clutch",
        titleBg: "Предавката не влезе",
        explanationBg: "Натисни и задръж съединителя (Z), докато местиш лоста.",
      };
    case "endOfGate":
      if (snap.selector === "D") {
        return {
          key: "gate-d",
          titleBg: "Лостът вече е в D",
          explanationBg:
            "Автоматичната кутия сменя предавките сама — напред няма ръчни степени. С [ връщаш към N.",
        };
      }
      if (snap.selector === "M") {
        return {
          key: "gate-m",
          titleBg: `Това е последната предавка (M${snap.manualGear})`,
          explanationBg: "Нагоре няма повече предавки.",
        };
      }
      return {
        key: "gate-p",
        titleBg: "Лостът вече е в P",
        explanationBg: "Назад няма повече позиции — с ] тръгваш към R, N и D.",
      };
  }
}

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
  /** „Съветник": the next expected action (pure advisor.ts derivation). */
  advisorPrompt: AdvisorPrompt | null;
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
    advisorPrompt: advisorPromptForSession(s),
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

/**
 * Persisted „Съветник" preference; nothing stored → the lesson-level default
 * (ON for beginner rungs, OFF for level 3+ — advisor.ts). Same lazy-init
 * safety as readStoredQuizFrequency: this shell mounts client-side only.
 */
function readStoredAdvisorOn(lesson: LessonSpec): boolean {
  if (typeof window === "undefined") return defaultAdvisorEnabled(lesson);
  try {
    const stored = parseStoredAdvisorSetting(window.localStorage.getItem(ADVISOR_STORAGE_KEY));
    return stored ?? defaultAdvisorEnabled(lesson);
  } catch {
    return defaultAdvisorEnabled(lesson);
  }
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
  onStartScenario,
}: {
  lesson: LessonSpec;
  quality: QualityPreset;
  /** The following lesson in the curriculum (for „Следващ урок“); null on L4. */
  nextLesson: { id: string; titleBg: string } | null;
  onExitToSelect: () => void;
  onStartLesson: (lessonId: string) => void;
  /**
   * S1 „Следващ сценарий": launch another scenario rung. Same (templateId,
   * level) shape the catalog's own picker uses (ScenarioCatalog onStart) —
   * the owner compiles and remounts. Absent on curriculum sessions ⇒ no CTA.
   */
  onStartScenario?: (templateId: string, level: ScenarioLevel) => void;
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
  // Status dashboard channel: the scene MUTATES this shared object per frame
  // (real blink clock, driveline, speed); the StatusDashboard bar samples it
  // on its own low-Hz interval (hud/dashboardStatus.ts perf grammar).
  const dashboardStatusRef = useRef<DashboardStatus>(createDashboardStatus());
  // Rejected driveline actions (start interlock / selector gate) → visible
  // feedback: gear-telltale flash + a short hint toast (handler below, after
  // nowSec/push exist). The counter keys the one-shot CSS flash.
  const [gearRejectFlash, setGearRejectFlash] = useState(0);
  const rejectionToastAtRef = useRef<Record<string, number>>({});
  // Clocks are set in a mount effect (render must stay pure per lint rules).
  const startedAtMsRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtMsRef.current ??= Date.now();
    mountedAtRef.current ??= performance.now();
  }, []);

  const [snap, setSnap] = useState<HudSnapshot>(() => snapshotOf(initialSession, null));
  // R3 #22: the scene's remount key — „Повтори" bumps it so the 3D world
  // restarts from spawn (fresh physics, re-armed staged encounters) exactly
  // like a first mount. The shell itself stays mounted (its owner keys it on
  // the lesson id, which does not change on a retry).
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [flash, setFlash] = useState<ObjectiveFlash | null>(null);
  const flashKey = useRef(0);
  const [minimapFrame, setMinimapFrame] = useState<MinimapFrame | null>(null);
  const [result, setResult] = useState<LessonResult | null>(null);
  const [saveResult, setSaveResult] = useState<FinishLessonActionResult | null>(null);
  // I1 „Позна ли се?" (doc 82 §5.3): null = the gate has not resolved yet and
  // the end screen stays hidden behind it. Reset on every retry with the rest
  // of the end-screen state, so a second run asks again.
  const [calibrationDone, setCalibrationDone] = useState(false);
  // I2 „Твоят дубъл": did this attempt actually upload a trace? Only then does
  // the replay route have something to load.
  const [traceUploaded, setTraceUploaded] = useState(false);
  const { toasts, push, clear } = useHudToastQueue();

  // -- S1: scenario sessions (<templateId>@L<n>) --------------------------------
  // The template (rubric + teach copy), a live ATTEMPT recorder the scene
  // streams into (glances feed the observation stars), and the rubric result
  // for the end screen. All null/inert on curriculum lessons.
  const scenarioRef = useMemo(() => parseScenarioLessonId(lesson.id), [lesson.id]);
  const scenarioSpec: ScenarioSpec | null = useMemo(
    () => (scenarioRef ? scenarioById(scenarioRef.templateId) : undefined) ?? null,
    [scenarioRef],
  );
  const [attemptRecorder] = useState<LiveTraceRecorder | null>(() =>
    parseScenarioLessonId(lesson.id) !== null
      ? createTraceRecorder({ scenarioId: lesson.id, kind: "attempt" })
      : null,
  );
  const attemptRecorderRef = useRef<LiveTraceRecorder | null>(attemptRecorder);
  const [rubric, setRubric] = useState<RubricScore | null>(null);

  // -- THEO-3: mistake-experience sessions (<templateId>@L<n>~m<i>) -------------
  // The sandbox where the student performs the wrong action ON PURPOSE.
  // Resolution mirrors the scenarioRef block (scenarioRef itself stays null —
  // the `~m` id is foreign to the rung namespace, so no rubric, no recorder,
  // no next-scenario CTAs). The engine's suppression + one-shot moment are
  // driven by lesson.mistakeExperience; the shell only presents.
  const mistakeRef = useMemo(() => parseMistakeExperienceLessonId(lesson.id), [lesson.id]);
  const mistakeSpec: ScenarioSpec | null = useMemo(
    () => (mistakeRef !== null ? scenarioById(mistakeRef.templateId) ?? null : null),
    [mistakeRef],
  );
  const mistakeDemo: MistakeDemo | null =
    lesson.mistakeExperience !== undefined && mistakeRef !== null && mistakeSpec !== null
      ? mistakeSpec.mistakes[mistakeRef.mistakeIndex] ?? null
      : null;
  const mistakeMode = mistakeDemo !== null;
  // The consequence pause: the live moment, or null-moment = „Виж
  // демонстрацията" (the fallback after the generous no-mistake window).
  const [consequence, setConsequence] = useState<{ moment: TeachMoment | null } | null>(null);
  const [demoOffered, setDemoOffered] = useState(false);

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

  // „Съветник" (advisor) toggle: persisted preference wins; otherwise ON for
  // the beginner rungs, OFF from level 3 up. Hidden & inert entirely on exam
  // sessions (the pure module also returns null there — defense in depth).
  const [advisorOn, setAdvisorOn] = useState<boolean>(() => readStoredAdvisorOn(lesson));
  const toggleAdvisor = useCallback(() => {
    setAdvisorOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(ADVISOR_STORAGE_KEY, serializeAdvisorSetting(next));
      } catch {
        // Private mode etc. — the in-memory value still applies this session.
      }
      return next;
    });
  }, []);

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
  // THEO-3: the mistake-experience sandbox never quizzes either — the one
  // assignment is the mistake; a quiz pause would fight the consequence pause.
  useEffect(() => {
    if (examMode || lesson.mistakeExperience !== undefined) return;
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
  }, [lesson.id, lesson.mistakeExperience, examMode]);

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

  // A rejected driveline action must never be silent (founder bug
  // 2026-07-10): flash the gear telltale on every refused shift and show the
  // WHY as a short hint toast (kind "lesson" body, 3.5 s TTL, no law-ref),
  // rate-limited per reason so key-mashing keeps one toast, not four.
  const handleDrivelineRejection = useCallback(
    (rejection: DrivelineRejection, snap: DrivelineSnapshot) => {
      if (finalizedRef.current) return;
      if (rejection.kind === "shiftRejected") setGearRejectFlash((k) => k + 1);
      const hint = rejectionHint(rejection, snap);
      const t = nowSec();
      const last = rejectionToastAtRef.current[hint.key] ?? Number.NEGATIVE_INFINITY;
      if (t - last < REJECTION_TOAST_COOLDOWN_S) return;
      rejectionToastAtRef.current[hint.key] = t;
      push(
        [{ kind: "lesson", titleBg: hint.titleBg, explanationBg: hint.explanationBg }],
        REJECTION_TOAST_TTL_MS,
      );
    },
    [nowSec, push],
  );

  // -- finalize: fold + persist ------------------------------------------------
  const finalize = useCallback(
    (state: LessonSessionState) => {
      if (finalizedRef.current) return; // exactly one grade + one save per session
      finalizedRef.current = true;
      sessionRef.current = state;
      const r = buildLessonResult(state);
      setResult(r);

      // The recorded attempt, closed ONCE here: finish() rebases and allocates
      // the whole sample array, and both consumers below (the rubric's glance
      // mapping and the persisted trace) must read the SAME drive.
      const trace = attemptRecorderRef.current?.finish() ?? null;

      // S1 scenario rubric (doc 76 §6): observation from the recorded
      // attempt's glance events (honest measured:false when no trace), the
      // stars from the pure scorer. Display here; the SERVER recomputes the
      // persisted stars from the same validated wire channels.
      let observedMomentIds: string[] | undefined;
      if (scenarioSpec?.rubric !== undefined) {
        let observation: RubricObservationInput | undefined;
        const moments = scenarioSpec.rubric.observation?.moments;
        if (trace !== null && moments !== undefined && moments.length > 0) {
          const mapped = parkingObservationFromTrace(trace, moments);
          if (mapped !== null) {
            observation = mapped;
            observedMomentIds = [...mapped.observedMomentIds];
          }
        }
        setRubric(scoreRubric(r, scenarioSpec.rubric, observation));
      }

      // THEO-3: a mistake-experience session is a SANDBOX — never persisted
      // (no attempt rows, no stars, no XP; the wire refuses the foreign `~m`
      // id anyway). The graded retry that follows persists normally.
      if (lesson.mistakeExperience !== undefined) return;

      // I-2 „Твоят дубъл": the drive itself rides along, REDUCED here rather
      // than server-side so a 4G phone uploads ~87 KB of 10 Hz kinematics for a
      // 60 s drill instead of the 250 KB of raw float64 it recorded. Display
      // data — the server validates it and drops it silently if it is anything
      // but this session's own attempt.
      const storedTrace = trace !== null ? compactTraceForStorage(trace) : null;
      // …and whether it did decides whether the result screen may offer
      // „Виж своя дубъл". A curriculum lesson records no attempt trace, so the
      // link must not appear there — a dead link on the result screen is worse
      // than no link.
      setTraceUploaded(storedTrace !== null);

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
        // S1: the A10 measurement detail rides along (validated server-side;
        // rubric/display metadata — never the official score).
        objectives: r.objectives.map((o) => ({
          id: o.id,
          done: o.done,
          completedAtSec: o.completedAtSec,
          ...(o.detail !== undefined ? { detail: o.detail } : {}),
        })),
        microQuiz: { ...quizStatsRef.current },
        nearMisses: serializeNearMisses(state.nearMisses ?? []),
        ...(observedMomentIds !== undefined ? { observedMomentIds } : {}),
        ...(storedTrace !== null ? { attemptTrace: storedTrace } : {}),
      }).then(setSaveResult, () => setSaveResult({ ok: false, code: "SAVE_FAILED" }));
    },
    [lesson.id, lesson.mistakeExperience, scenarioSpec],
  );

  // -- SceneSlot callbacks -------------------------------------------------------
  const handleTick = useCallback(
    (tick: SimTick) => {
      const prev = sessionRef.current;
      if (prev.phase === "completed" || prev.phase === "aborted") return;
      const { state, hudEvents, teachMoments, mistakeMoment } = applyTick(prev, tick);
      sessionRef.current = state;
      lastTickRef.current = tick;

      // THEO-3: the targeted wrong action fired — pause into the consequence
      // overlay (one-shot; the functional update keeps an already-open card).
      if (mistakeMoment !== undefined) {
        setConsequence((c) => c ?? { moment: mistakeMoment });
      }
      // THEO-3 fallback: a generous window without the mistake → offer the
      // recorded demonstration instead (never a dead end). Idempotent set.
      if (
        mistakeMode &&
        state.mistakeExperienceHitAtSec === undefined &&
        state.phase === "driving" &&
        tick.t >= MISTAKE_EXPERIENCE_DEMO_OFFER_SEC
      ) {
        setDemoOffered(true);
      }

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
    [push, finalize, activeQuiz, teachQueue, mistakeMode],
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
    // I1: a fresh attempt is a fresh prediction — the gate asks again.
    setCalibrationDone(false);
    setTraceUploaded(false);
    setFlash(null);
    clear();
    // S1: a fresh attempt records a fresh trace + rubric.
    attemptRecorderRef.current?.reset();
    setRubric(null);
    // Fresh pre-drive: the scene's observer re-baselines on the driveLocked
    // rising edge (a car left running/belted by the previous run never
    // auto-completes steps — the student re-performs the transitions); the
    // idle-hint clock and the blocked-drive toast cooldown restart here.
    lastPreDriveStepAtRef.current = 0;
    blockedToastAtSecRef.current = Number.NEGATIVE_INFINITY;
    // Rejection-hint cooldowns are keyed by the session clock, which resets
    // with the retry — clear them so the first refusal explains again.
    rejectionToastAtRef.current = {};
    // Fresh micro-quiz session: reset the tally + rebuild the trigger from the
    // already-loaded bank. Teach-moment queue starts empty too (the fresh
    // engine state re-teaches first encounters from scratch).
    quizStatsRef.current = { total: 0, correct: 0 };
    setActiveQuiz(null);
    setTeachQueue([]);
    // THEO-3: a fresh sandbox pass re-arms the one-shot moment (the fresh
    // engine state above dropped the latch) and the demo offer window.
    setConsequence(null);
    setDemoOffered(false);
    quizTriggerRef.current =
      quizBankRef.current.length > 0
        ? createQuizTriggerState(quizFreqRef.current, quizBankRef.current)
        : null;
    // Founder R3 #22 („Повтори" does not restart): the engine state above is
    // fresh, but the SCENE used to survive the retry — the car stayed parked
    // at the END of the route with the staged encounters already consumed, so
    // the "restarted" drill was undrivable. The scene mounts on `sceneEpoch`;
    // bumping it remounts SceneSlot exactly like entering the drill from the
    // catalog: car at lesson.spawn, staged events re-armed, shadow clock at 0.
    // The per-scene channels reset with it so no stale frame data leaks in.
    setSceneEpoch((e) => e + 1);
    drivelineRef.current = null;
    dashboardStatusRef.current = createDashboardStatus();
    setMinimapFrame(null);
    setSnap(snapshotOf(sessionRef.current, null, null));
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

  // I1 „Позна ли се?" (doc 82 §5.3) — the self-assessment calibration gate.
  //
  // It exists only when there is something to be wrong ABOUT: a session that
  // actually persisted (so the SERVER owns the official score it will reveal —
  // the client's own number is never the one being predicted) and that was not
  // aborted (guessing the points of a drive you quit measures nothing). On a
  // failed save the student goes straight to the result, because the trend has
  // nowhere to be written anyway.
  const savedSessionId = ended && saveResult?.ok ? saveResult.sessionId : null;
  const calibrationGate =
    savedSessionId !== null && result !== null && !result.aborted ? (
      <CalibrationGate
        lessonTitleBg={lesson.titleBg}
        onSubmit={async (predictedPoints, predictedPass) => {
          const answer = await recordSelfPredictionAction(savedSessionId, {
            predictedPoints,
            predictedPass,
          });
          return answer.ok ? answer : null;
        }}
        onResolved={() => setCalibrationDone(true)}
      />
    ) : null;

  // …and it has to be up BEFORE the score is. `result` lands synchronously
  // when the drive ends; `saveResult` lands one POST later. Rendering the end
  // screen in between would show the student „7 точки" and then ask them to
  // predict it — the mechanic would measure reading, not judgement. So the
  // hold starts with the drive and ends with the answer (isResultScreenHeld),
  // and the waiting card carries its own skip so a hung save cannot trap
  // anyone behind a mechanic.
  const resultHeld = isResultScreenHeld({
    ended,
    aborted: result?.aborted ?? false,
    // THEO-3 sandbox runs never persist, so they would wait for a save that
    // is never made.
    persists: lesson.mistakeExperience === undefined,
    saved: saveResult === null ? null : saveResult.ok,
    resolved: calibrationDone,
  });
  const calibrationSlot =
    calibrationGate ??
    (resultHeld ? (
      <CalibrationPendingCard onSkip={() => setCalibrationDone(true)} />
    ) : null);

  // S1 (founder 2026-07-17: „the button for next lesson goes to stage 2 of
  // the same lesson — we also have to add a button that switches to the NEXT
  // LESSON"). GREEN = the official verdict passed AND every objective done.
  // BOTH targets — one rung up this ladder, and the next card in catalog
  // order — plus the doc 76 §8 star gate that can withhold the rung, are the
  // pure resolver's call; this component only renders the answer.
  const scenarioGreen =
    scenarioRef !== null && result !== null && result.passed && result.completedAll;
  const nextScenario = useMemo(
    () =>
      scenarioRef !== null && result !== null && scenarioGreen
        ? resolveScenarioNextSteps({
            templateId: scenarioRef.templateId,
            level: scenarioRef.level,
            passed: result.passed,
            allObjectivesPassed: result.completedAll,
            // The client's rubric mirrors the server's recompute; unknown
            // (no rubric yet) leaves the gate to the server.
            stars: rubric?.stars ?? null,
          })
        : { level: null, template: null },
    [scenarioRef, result, scenarioGreen, rubric],
  );

  // Each target → a labelled launcher, or null. Same (templateId, level) seam
  // the catalog's own picker uses; absent onStartScenario (curriculum
  // sessions) means nothing to launch into, so no button.
  const scenarioTarget = useCallback(
    (step: { templateId: string; level: ScenarioLevel; titleBg: string } | null) =>
      step !== null && onStartScenario !== undefined
        ? {
            labelBg: `${step.titleBg} · Ниво ${step.level}`,
            onStart: () => onStartScenario(step.templateId, step.level),
          }
        : null,
    [onStartScenario],
  );

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
        {/* THEO-3: unmistakable sandbox framing — nothing here is graded. */}
        {mistakeMode ? (
          <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-danger">
            Пясъчник — не се оценява
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!ended ? (
            <>
              {/* „Съветник": show/hide the next-action prompt card. Hidden on
                  exams — the advisor is a training aid, not the car — and in
                  the THEO-3 sandbox, where prompting the CORRECT next action
                  would fight the „направи грешката" assignment. */}
              {!examMode && !mistakeMode ? (
                <button
                  type="button"
                  aria-pressed={advisorOn}
                  onClick={toggleAdvisor}
                  title="Съветник: показва следващото действие и клавиша за него"
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
                    advisorOn
                      ? "border-accent-2/60 bg-accent-2/15 text-accent-2"
                      : "border-border bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  Съветник {advisorOn ? "вкл." : "изкл."}
                </button>
              ) : null}
              {/* A13: no micro-quizzes on an exam — the selector disappears.
                  THEO-3: none in the sandbox either (the bank never loads). */}
              {!examMode && !mistakeMode ? (
                <QuizFrequencySelector value={quizFreq} onChange={setQuizFreq} />
              ) : null}
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
            key={sceneEpoch}
            lesson={lesson}
            quality={quality}
            paused={
              ended || activeQuiz !== null || teachQueue.length > 0 || consequence !== null
            }
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
            onDrivelineRejection={handleDrivelineRejection}
            // P1: the touch overlay's ⛶ button — same QW1 toggle as key X.
            onToggleFullscreen={toggleFullscreen}
            // A8/A15: measurement channels (staged outcomes + near-misses).
            onStagedOutcome={handleStagedOutcome}
            onNearMiss={handleNearMiss}
            // S1: scenario sessions record the student's attempt (glances →
            // observation stars; the future compare-vs-shadow view).
            attemptRecorderRef={attemptRecorderRef}
            // Car status dashboard: the scene writes the live cabin state
            // (blink clock included) into this shared per-frame channel.
            dashboardStatusRef={dashboardStatusRef}
          />
        </div>

        {/* Objective banner — top center; the advisor prompt stacks under it
            (during pre-drive the banner is empty, so the advisor card stands
            alone). The advisor hides while a pause overlay (quiz/teach) is up
            — it must never compete with a modal card. */}
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {mistakeMode ? (
            // THEO-3: the sandbox's ONE instruction replaces the objective
            // banner — the assignment is the mistake (fixed lead-in + the
            // STORED mistake title, compiled into descriptionBg).
            !ended ? (
              <div className="max-w-md rounded-2xl border border-danger/60 bg-background/85 px-4 py-2.5 text-center backdrop-blur">
                <p className="text-[10px] font-black uppercase tracking-wider text-danger">
                  Преживей грешката
                </p>
                <p className="mt-0.5 text-xs font-bold leading-snug">{lesson.descriptionBg}</p>
                {demoOffered && consequence === null ? (
                  <button
                    type="button"
                    onClick={() => setConsequence({ moment: null })}
                    className="btn-ghost mt-1.5 px-3 py-1 text-[11px]"
                  >
                    Не се получава? Виж демонстрацията
                  </button>
                ) : null}
              </div>
            ) : null
          ) : (
            <ObjectiveBanner
              titleBg={snap.objectiveTitle}
              index={Math.min(snap.objectiveIndex, Math.max(1, snap.objectiveTotal))}
              total={snap.objectiveTotal}
              progress={snap.objectiveProgress}
              flash={flash}
            />
          )}
          {advisorOn &&
          !examMode &&
          !mistakeMode &&
          !ended &&
          activeQuiz === null &&
          teachQueue.length === 0 &&
          snap.advisorPrompt !== null ? (
            <AdvisorCard prompt={snap.advisorPrompt} />
          ) : null}
        </div>

        {/* Toasts — right side */}
        <div className="absolute right-3 top-3">
          <HudToasts toasts={toasts} />
        </div>

        {/* Car status dashboard — bottom center, THE visual anchor (founder
            2026-07-17: „табло като на кола"). Replaces the old bottom-left
            SpeedCard + GearIndicatorCard pair; reads the scene's per-frame
            status channel so the ◀ ▶ arrows blink on the real cabin clock.
            Stays up in exam mode — it is the car's own instrument panel,
            not a training aid. */}
        {!ended ? (
          <div className="absolute bottom-2 left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center">
            <StatusDashboard
              statusRef={dashboardStatusRef}
              limitKmh={snap.limitKmh}
              rejectFlashKey={gearRejectFlash}
            />
          </div>
        ) : null}

        {/* R3 #15: the two in-world lines finally get names. On L1/L2 scenario
            rungs BOTH ribbons render at once — the BLUE one is the shadow
            car's recorded demonstration (ShadowCar KIND_TINT.shadow #3f8cff)
            and the TEAL one is the live route guidance to the next objective
            (RouteGuidance --accent-2, what the founder read as „зелена"). The
            shadow ribbon ends where the recording ends, so mid-route the
            colors visibly hand over with zero explanation — this small legend
            is the honest fix (unifying the colors would hide WHICH line is
            teachware and which is wayfinding). */}
        {!ended &&
        (lesson.aids?.shadowCar === true || lesson.aids?.pathRibbon === true) &&
        lesson.objectives.length > 0 ? (
          <div className="absolute bottom-[6.75rem] left-3 flex flex-col gap-0.5 rounded-lg border border-border bg-surface/80 px-2 py-1.5 text-[10px] font-semibold leading-tight text-muted backdrop-blur">
            <span>
              <span
                aria-hidden
                className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                style={{ background: "#3f8cff" }}
              />
              синя — пътят на колата-сянка
            </span>
            <span>
              <span
                aria-hidden
                className="mr-1 inline-block h-1.5 w-3.5 rounded-full align-middle"
                style={{ background: "var(--accent-2)" }}
              />
              зелена — маршрутът до целта
            </span>
          </div>
        ) : null}

        {/* Minimap — bottom right, RAISED above the status-bar strip (the
            centered bar can reach the right edge on laptop widths). */}
        {!ended ? (
          <div className="absolute bottom-[6.75rem] right-3">
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

        {/* THEO-3 consequence — pause + the „Какво направи" card: stored
            what-went-wrong copy + lawRef + the recorded red-ghost replay,
            then „Сега опитай правилно" restarts the SAME rung graded (the
            onStartScenario seam — the same remount path as „Следващ
            сценарий"). Sandbox sessions never queue teach moments or
            quizzes, so this pause never competes with them. */}
        {mistakeMode && mistakeDemo !== null && consequence !== null && !ended ? (
          <MistakeConsequenceOverlay
            demo={mistakeDemo}
            districtId={mistakeSpec!.map.districtId}
            moment={consequence.moment}
            onRetryCorrect={
              onStartScenario !== undefined && mistakeRef !== null
                ? () => onStartScenario(mistakeRef.templateId, mistakeRef.level)
                : null
            }
            onDismiss={() => setConsequence(null)}
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
              {/* I1: the protocol card states the verdict in words, so it is
                  part of what the calibration gate holds back — otherwise the
                  student reads „Маршрутът е завършен в допустимите граници"
                  and then „predicts" that they passed. */}
              {examMode && !resultHeld ? (
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
                // S1: scenario rubric stars + breakdown (additive section;
                // official points stay the primary verdict).
                rubric={rubric}
                debriefText={debriefText}
                // I1: while the gate is unresolved the end screen renders ONLY
                // it — the score must not leak into a prediction about itself.
                calibrationGate={calibrationSlot}
                calibrationLocked={resultHeld}
                // I2: the drive is already stored — this is the only place a
                // student would think to look for it.
                myDriveHref={
                  savedSessionId !== null && traceUploaded
                    ? `/review/my-drive/${savedSessionId}`
                    : null
                }
                concepts={saveResult?.ok ? saveResult.concepts : []}
                xpEarned={saveResult?.ok ? saveResult.xpEarned : null}
                onRetry={retry}
                // R3 #5/#23: „Назад към таблото" = the same client-side exit
                // as „← Всички уроци" — back to the catalog (anchored at this
                // template by the owner), never a /dashboard route hop.
                onExit={onExitToSelect}
                nextLessonTitleBg={nextLesson?.titleBg ?? null}
                onNextLesson={
                  nextLesson && result.passed ? () => onStartLesson(nextLesson.id) : null
                }
                // S1: the green-run CTAs — „Следващо ниво" (this maneuver, one
                // rung harder; withheld while star-locked) and „Следващ
                // сценарий" (the next card). At the end of the library, a
                // closing line instead of a dead button. All null on
                // curriculum lessons.
                nextScenarioLevel={scenarioTarget(nextScenario.level)}
                nextScenarioTemplate={scenarioTarget(nextScenario.template)}
                catalogCompleteBg={
                  scenarioGreen &&
                  nextScenario.level === null &&
                  nextScenario.template === null
                    ? "Това беше последният сценарий в библиотеката — премина целия каталог. Браво!"
                    : null
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
