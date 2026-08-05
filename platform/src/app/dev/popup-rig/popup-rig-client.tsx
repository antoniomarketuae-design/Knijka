"use client";

/**
 * Client half of the popup rig (rows A2 / A6). See page.tsx for what is real
 * here and what is not.
 *
 * Query params:
 *   ?state=column   the right-edge notification column with all four panels up
 *   ?state=end      the end-of-lesson debrief (A2: Space / the note / the
 *                   „не показвай автоматично" setting)
 *   ?compact=on     force the compact (phone) grammar without a coarse pointer
 */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlayAreaStyles } from "@/components/sim/lesson-ui/PlayAreaStyles";
import { BriefingCard } from "@/components/sim/lesson-ui/LessonPlayShell";
import { AdvisorCard } from "@/components/sim/lesson-ui/AdvisorCard";
import {
  HudStyles,
  HudToasts,
  ObjectiveBanner,
  SessionEndScreen,
  SimOverlay,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
  SESSION_END_AUTO_STORAGE_KEY,
  readStoredFlag,
  serializeFlag,
  type HudToast,
} from "@/modules/sim/hud";
import { buildSessionSummary, makeViolation } from "@/modules/sim/rules";
import type { LessonResult } from "@/modules/sim/lessons";

import { ROOMY_HUD_FLOOR_PX } from "@/components/sim/lesson-ui/immersive";

const BRIEFING = [
  { n: 1, textBg: "Провери огледалата и постави колана." },
  { n: 2, textBg: "Включи фаровете — вече е тъмно." },
  { n: 3, textBg: "Подай десен мигач и тръгни плавно." },
  { n: 4, textBg: "Спри плътно до бордюра след кръстовището." },
] as const;

function seededResult(): LessonResult {
  const events = [
    makeViolation("SPEEDING_OVER_LIMIT", 41.2),
    makeViolation("TURN_WITHOUT_INDICATOR", 63.8),
  ];
  const summary = buildSessionSummary(events);
  return {
    lessonId: "rig-lesson",
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 184,
  };
}

export function PopupRigClient() {
  const params = useSearchParams();
  const state = params.get("state") ?? "column";
  const compact = params.get("compact") === "on";

  const [toasts, setToasts] = useState<HudToast[]>(() => [
    {
      id: 1,
      event: {
        kind: "violation",
        titleBg: "Превишена скорост",
        explanationBg:
          "Караш с 68 km/h там, където ограничението е 50 km/h. В населено място спирачният път при 68 km/h е с около 15 метра по-дълъг.",
        points: 5,
        severity: "opasna",
        lawRef: "ЗДвП чл. 21",
      },
    },
    {
      id: 2,
      event: {
        kind: "lesson",
        titleBg: "Мигач преди завой",
        explanationBg:
          "Подай мигача поне 30 метра преди завоя, за да те разберат другите участници навреме.",
        lawRef: "ЗДвП чл. 25",
      },
    },
  ]);
  const [advisorUp, setAdvisorUp] = useState(true);
  const [briefingUp, setBriefingUp] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const [autoOpen, setAutoOpen] = useState(() =>
    readStoredFlag(SESSION_END_AUTO_STORAGE_KEY, true),
  );

  const result = useMemo(seededResult, []);
  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );
  const setAutoOpenPersisted = useCallback((next: boolean) => {
    setAutoOpen(next);
    try {
      window.localStorage.setItem(SESSION_END_AUTO_STORAGE_KEY, serializeFlag(next));
    } catch {
      /* private mode — the rig is not the place to complain about it */
    }
  }, []);

  const columnTop = compact ? NOTIFY_COLUMN_TOP_CSS_COMPACT : NOTIFY_COLUMN_TOP_CSS_ROOMY;
  const columnWidth = compact
    ? NOTIFY_COLUMN_WIDTH_CSS_COMPACT
    : NOTIFY_COLUMN_WIDTH_CSS_ROOMY;

  return (
    <div
      data-surface="cluster"
      data-sim-shell=""
      data-sim-compact={compact ? "on" : undefined}
      className="flex h-dvh w-full flex-col bg-background p-0"
    >
      <HudStyles />
      <PlayAreaStyles />
      <div
        data-sim-stage=""
        className="relative mx-auto min-h-0 w-full flex-1 overflow-hidden bg-surface"
        style={{
          // A stand-in for the road: a horizon band, so a panel's contrast can
          // be judged against something other than a flat page background.
          background:
            "linear-gradient(180deg, #2b3a4d 0%, #4a5b6e 46%, #6b6f6a 47%, #3c3f3b 100%)",
        }}
      >
        {state === "column" ? (
          <div
            data-hud="notify-column"
            data-rig-column=""
            className="pointer-events-none absolute z-30 flex flex-col items-stretch gap-1.5 overflow-hidden"
            style={{
              top: columnTop,
              right: NOTIFY_COLUMN_RIGHT_CSS,
              width: columnWidth,
              maxHeight: `calc(100% - ${ROOMY_HUD_FLOOR_PX}px - 3.5rem)`,
            }}
          >
            <ObjectiveBanner
              titleBg="Спри плътно до бордюра след кръстовището"
              index={2}
              total={3}
              progress={0.45}
              flash={null}
            />
            {advisorUp ? (
              <AdvisorCard
                prompt={{
                  textBg: "Премести лоста на R и погледни през дясното рамо.",
                  keys: ["S", "Q"],
                }}
                onDismiss={() => setAdvisorUp(false)}
              />
            ) : null}
            {briefingUp ? (
              <BriefingCard steps={BRIEFING} onClose={() => setBriefingUp(false)} />
            ) : null}
            {/* Parity with the shell: it renders `{compact ? null : <HudToasts/>}`
                because a 240 px toast card does not belong in a 141 px column —
                compact feeds the same events through the overlay queue instead.
                Without this line the rig would paint an overflowing card the
                product never paints, and a rig that invents a defect is worse
                than no rig. */}
            {compact ? null : (
              <HudToasts
                toasts={toasts}
                quiet={false}
                onDismiss={dismissToast}
                onDismissAll={() => setToasts([])}
              />
            )}
          </div>
        ) : null}

        {/* ?state=overlay — THE COMPACT PATH, exactly as the shell mounts it.
            This is the surface the founder's own phone gets: on a coarse-pointer
            393 px viewport `isCompactViewport` is true, the column above is
            `hidden`, and `SimOverlay` speaks instead. It is here so the phone
            half of row A6 can be MEASURED rather than argued about — the item
            below is non-blocking and carries no detail, which is the ordinary
            case (a task line, a guidance line), and `interactive` is false for
            exactly that case. */}
        {state === "overlay" ? (
          <SimOverlay
            item={{
              id: "rig-overlay",
              kind: "task",
              tone: "neutral",
              chipBg: "ЗАДАЧА 2/3",
              lineBg: "Спри плътно до бордюра след кръстовището.",
            }}
            queued={1}
            frozen={false}
            onOpenChange={() => undefined}
            renderDetail={() => null}
          />
        ) : null}

        {state === "end" && !skipped ? (
          <div
            data-hud="end-screen"
            data-hud-keep=""
            className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6"
          >
            <div className="flex w-full max-w-2xl flex-col gap-3">
              <SessionEndScreen
                lessonTitleBg="Вклиняване между два автомобила"
                result={result}
                debriefText="Задръж по-голяма дистанция преди маневрата — тя ти дава времето да подадеш мигач навреме."
                concepts={[]}
                xpEarned={null}
                onRetry={() => undefined}
                onExit={() => undefined}
                nextLessonTitleBg={null}
                onNextLesson={null}
                onSkip={compact ? null : () => setSkipped(true)}
                autoOpen={autoOpen}
                onAutoOpenChange={compact ? null : setAutoOpenPersisted}
              />
            </div>
          </div>
        ) : null}

        {state === "end" && skipped ? (
          <div
            data-rig-skipped=""
            className="absolute inset-x-0 z-30 flex justify-center px-4"
            style={{ bottom: "0.75rem" }}
          >
            <div
              role="status"
              className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-warning/60 bg-background/90 px-4 py-2.5 backdrop-blur"
            >
              <span className="text-sm font-black text-warning">Неиздържан</span>
              <span className="text-xs font-bold tabular-nums text-muted">
                {result.score} нак. точки
              </span>
              <button
                type="button"
                className="btn-accent px-4 py-1.5 text-xs"
                onClick={() => setSkipped(false)}
              >
                Виж разбора
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
