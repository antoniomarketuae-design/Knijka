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
  applyPreDriveStep,
  applyTick,
  buildDebrief,
  buildLessonResult,
  createLessonSession,
  createQuizTriggerState,
  finishSession,
  isDriveLocked,
  observeQuizTick,
  serializeRuleEvents,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
  type MicroQuizQuestion,
  type QuizFrequency,
  type QuizTriggerState,
  type TriggeredQuiz,
} from "@/modules/sim/lessons";
import { hasPreDriveCabinEffect, type PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { DrivelineSnapshot } from "@/modules/sim/vehicle";
import { finishLessonAction } from "@/app/(dashboard)/simulator/actions";
import {
  loadMicroQuizBank,
  submitMicroQuizAnswer,
} from "@/app/(dashboard)/simulator/micro-quiz-actions";
import { MicroQuizOverlay } from "./MicroQuizOverlay";
import { SceneSlot } from "./SceneSlot";
import {
  MICRO_QUIZ_FREQUENCIES,
  MICRO_QUIZ_STORAGE_KEY,
  type FinishLessonActionResult,
  type QualityPreset,
} from "./types";

const HUD_POLL_MS = 150;

/** QW10: min seconds between two "завърши подготовката" toasts. */
const BLOCKED_DRIVE_TOAST_COOLDOWN_S = 10;

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
  vehicle: { x: number; y: number; headingDeg: number } | null;
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
    preDriveCompleted: s.preDrive ? [...s.preDrive.completedStepIds] : [],
    preDriveWrongOrder: s.preDrive ? [...s.preDrive.wrongOrderStepIds] : [],
    vehicle: lastTick
      ? {
          x: lastTick.position.x,
          y: lastTick.position.y,
          headingDeg: lastTick.headingDeg,
        }
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

  // QW5: checklist completions that carry a real cabin effect (belt/lights/
  // indicator), in completion order. Append-only per session run — the scene
  // applies them idempotently to CabinControls so the rule engine + telltales
  // agree with what the student was just told they did.
  const [preDriveCabinSteps, setPreDriveCabinSteps] = useState<PreDriveStepId[]>([]);

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
  useEffect(() => {
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
  }, [lesson.id]);

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
        ruleEvents: serializeRuleEvents(state.events),
        objectives: r.objectives.map((o) => ({
          id: o.id,
          done: o.done,
          completedAtSec: o.completedAtSec,
        })),
        microQuiz: { ...quizStatsRef.current },
      }).then(setSaveResult, () => setSaveResult({ ok: false, code: "SAVE_FAILED" }));
    },
    [lesson.id],
  );

  // -- SceneSlot callbacks -------------------------------------------------------
  const handleTick = useCallback(
    (tick: SimTick) => {
      const prev = sessionRef.current;
      if (prev.phase === "completed" || prev.phase === "aborted") return;
      const { state, hudEvents } = applyTick(prev, tick);
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

      // Contextual micro-quiz: feed the SAME tick the rules saw to the pure
      // trigger. Only while driving and not already quizzing; the rate limit +
      // the pause (which stops onTick) prevent stacking. When one fires we
      // surface it as React state → overlay + pause.
      if (state.phase === "driving" && activeQuiz === null && quizTriggerRef.current) {
        const q = observeQuizTick(quizTriggerRef.current, tick);
        quizTriggerRef.current = q.state;
        if (q.quiz) setActiveQuiz(q.quiz);
      }

      // prev was live (guard above), so "completed" here means: the route
      // finished on this very frame → grade and persist (finalize is guarded).
      if (state.phase === "completed") finalize(state);
    },
    [push, finalize, activeQuiz],
  );

  const handlePreDriveStep = useCallback(
    (stepId: PreDriveStepId, tSec?: number) => {
      const prev = sessionRef.current;
      const { state, hudEvents } = applyPreDriveStep(prev, stepId, tSec ?? nowSec());
      sessionRef.current = state;

      // QW5: a step that newly completed AND has a real cabin state behind it
      // (belt / low beams / left indicator) is forwarded to the scene, which
      // sets that state on CabinControls — the checklist must never claim
      // something the car doesn't reflect.
      const newlyCompleted =
        state.preDrive !== null &&
        state.preDrive.completedStepIds.includes(stepId) &&
        !(prev.preDrive?.completedStepIds.includes(stepId) ?? false);
      if (newlyCompleted && hasPreDriveCabinEffect(stepId)) {
        setPreDriveCabinSteps((steps) => [...steps, stepId]);
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
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current));
    },
    [push, nowSec],
  );

  // -- QW10: blocked-drive explanation ------------------------------------------
  // First throttle attempt during the pre-drive phase → one teaching toast
  // explaining WHY the car stays put; a cooldown keeps repeat presses silent
  // instead of spamming the queue.
  const blockedToastAtSecRef = useRef(Number.NEGATIVE_INFINITY);
  const handleBlockedDriveAttempt = useCallback(() => {
    const t = nowSec();
    if (t - blockedToastAtSecRef.current < BLOCKED_DRIVE_TOAST_COOLDOWN_S) return;
    blockedToastAtSecRef.current = t;
    push([
      {
        kind: "lesson",
        titleBg: "Завърши подготовката преди потегляне",
        explanationBg:
          "Колата остава на място, докато проверките не са готови — колан, огледала, двигател. Мини през стъпките в списъка вляво и завърши с „Потегляне“.",
      },
    ]);
  }, [nowSec, push]);

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
    // Fresh pre-drive: the checklist restarts, so the cabin-effect feed and
    // the blocked-drive toast cooldown restart with it. (The cabin itself
    // keeps whatever state the previous run set — the student re-confirms it
    // step by step, idempotently.)
    setPreDriveCabinSteps([]);
    blockedToastAtSecRef.current = Number.NEGATIVE_INFINITY;
    // Fresh micro-quiz session: reset the tally + rebuild the trigger from the
    // already-loaded bank.
    quizStatsRef.current = { total: 0, correct: 0 };
    setActiveQuiz(null);
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!ended ? (
            <>
              <QuizFrequencySelector value={quizFreq} onChange={setQuizFreq} />
              {lesson.objectives.length === 0 ? (
                <button type="button" className="btn-accent px-4 py-1.5 text-xs" onClick={finishNow}>
                  Завърши сесията
                </button>
              ) : (
                <button type="button" className="btn-ghost px-4 py-1.5 text-xs" onClick={abortNow}>
                  Прекрати урока
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
            paused={ended || activeQuiz !== null}
            driveLocked={snap.driveLocked && !ended}
            preDriveCabinSteps={preDriveCabinSteps}
            onTick={handleTick}
            onPreDriveStep={handlePreDriveStep}
            onBlockedDriveAttempt={handleBlockedDriveAttempt}
            onMinimapFrame={setMinimapFrame}
            onDriveline={handleDriveline}
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

        {/* Pre-drive checklist — left panel during the preparation phase */}
        {snap.phase === "preDrive" && !ended ? (
          <div className="absolute left-3 top-3 max-h-[calc(100%-1.5rem)] overflow-y-auto">
            <PreDriveChecklist
              completedStepIds={snap.preDriveCompleted}
              wrongOrderStepIds={snap.preDriveWrongOrder}
              onStep={handlePreDriveStep}
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

        {/* Session end — overlay */}
        {ended && result ? (
          <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6">
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
            />
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
