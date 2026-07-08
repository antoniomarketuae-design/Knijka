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
  finishSession,
  serializeRuleEvents,
  type LessonResult,
  type LessonSessionState,
  type LessonSpec,
} from "@/modules/sim/lessons";
import type { PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import { finishLessonAction } from "@/app/(dashboard)/simulator/actions";
import { SceneSlot } from "./SceneSlot";
import type { FinishLessonActionResult, QualityPreset } from "./types";

const HUD_POLL_MS = 150;

interface HudSnapshot {
  phase: LessonSessionState["phase"];
  speedKmh: number;
  limitKmh: number;
  gear: number;
  indicator: SimTick["indicator"];
  headlights: SimTick["headlights"];
  objectiveTitle: string | null;
  objectiveIndex: number;
  objectiveTotal: number;
  objectiveProgress: number | null;
  preDriveCompleted: PreDriveStepId[];
  preDriveWrongOrder: PreDriveStepId[];
  vehicle: { x: number; y: number; headingDeg: number } | null;
}

function snapshotOf(s: LessonSessionState, lastTick: SimTick | null): HudSnapshot {
  const active =
    s.currentObjectiveIndex < s.objectives.length
      ? s.objectives[s.currentObjectiveIndex]
      : null;
  return {
    phase: s.phase,
    speedKmh: lastTick?.speedKmh ?? 0,
    limitKmh: lastTick?.maxSpeedKmh ?? 50,
    gear: lastTick?.gear ?? 0,
    indicator: lastTick?.indicator ?? "off",
    headlights: lastTick?.headlights ?? "off",
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
        push(hudEvents.filter((e) => e.kind === "violation" || e.kind === "commendation"));
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }
      // prev was live (guard above), so "completed" here means: the route
      // finished on this very frame → grade and persist (finalize is guarded).
      if (state.phase === "completed") finalize(state);
    },
    [push, finalize],
  );

  const handlePreDriveStep = useCallback(
    (stepId: PreDriveStepId, tSec?: number) => {
      const { state, hudEvents } = applyPreDriveStep(
        sessionRef.current,
        stepId,
        tSec ?? nowSec(),
      );
      sessionRef.current = state;
      if (hudEvents.length > 0) {
        push(hudEvents.filter((e) => e.kind === "violation" || e.kind === "commendation"));
        const completed = hudEvents.find((e) => e.kind === "objectiveComplete");
        if (completed) {
          setFlash({ titleBg: completed.titleBg, key: ++flashKey.current });
        }
      }
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current));
    },
    [push, nowSec],
  );

  // -- HUD poll ------------------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap(snapshotOf(sessionRef.current, lastTickRef.current));
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
    setSnap(snapshotOf(sessionRef.current, null));
  };

  // Debrief: the template is deterministic — render it instantly client-side;
  // the server recomputes + stores the same text and adds the concept links.
  const debriefText = ended
    ? saveResult?.ok
      ? saveResult.debriefText
      : buildDebrief(lesson, result).text
    : null;

  return (
    <div className="flex flex-col gap-3">
      <HudStyles />

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onExitToSelect}>
          ← Всички уроци
        </button>
        <h1 className="text-lg font-extrabold">{lesson.titleBg}</h1>
        {!ended ? (
          <div className="ml-auto flex items-center gap-2">
            {lesson.objectives.length === 0 ? (
              <button type="button" className="btn-accent px-4 py-1.5 text-xs" onClick={finishNow}>
                Завърши сесията
              </button>
            ) : (
              <button type="button" className="btn-ghost px-4 py-1.5 text-xs" onClick={abortNow}>
                Прекрати урока
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Scene + HUD overlays */}
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-surface">
        <div className="aspect-video w-full">
          <SceneSlot
            lesson={lesson}
            quality={quality}
            paused={ended}
            onTick={handleTick}
            onPreDriveStep={handlePreDriveStep}
            onMinimapFrame={setMinimapFrame}
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

      {/* Footer: save state + ODbL attribution (required — district meta) */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {ended && saveResult && !saveResult.ok ? (
          <span className="font-semibold text-warning">
            Сесията не се записа ({saveResult.code}) — резултатът е само локален.
          </span>
        ) : null}
        <span className="ml-auto">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
