"use client";

/**
 * Client half of the popup rig (rows A2 / A6). See page.tsx for what is real
 * here and what is not.
 *
 * Query params:
 *   ?state=column   the right-edge notification column with all four panels up
 *   ?state=end      the end-of-lesson debrief (A2: Space / the note / the
 *                   „не показвай автоматично" setting), WITH the manoeuvre
 *                   rubric mounted — the fourth scale, on the same screen as
 *                   the наказателни точки headline
 *   ?state=scales   every OTHER surface that prints a scored number, in one
 *                   scrollable column, so „which points?" can be photographed
 *                   instead of argued about (see the block below)
 *   ?compact=on     force the compact (phone) grammar without a coarse pointer
 */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlayAreaStyles } from "@/components/sim/lesson-ui/PlayAreaStyles";
import { BriefingCard } from "@/components/sim/lesson-ui/LessonPlayShell";
import { AdvisorCard } from "@/components/sim/lesson-ui/AdvisorCard";
import { CalibrationGate } from "@/components/sim/lesson-ui/CalibrationGate";
import { ExamBriefingCard } from "@/components/sim/lesson-ui/ExamBriefingCard";
import { ExamModeCard } from "@/components/sim/lesson-ui/ExamModeCard";
import { LessonCard } from "@/components/sim/lesson-ui/LessonCard";
import { TeachMomentOverlay } from "@/components/sim/lesson-ui/TeachMomentOverlay";
import type { LessonEntryView } from "@/components/sim/lesson-ui/types";
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
import { buildSessionSummary, makeViolation, pointsBg } from "@/modules/sim/rules";
import type { LessonResult, LessonSpec, RubricScore, TeachMoment } from "@/modules/sim/lessons";

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

// ---------------------------------------------------------------------------
// ?state=scales — WHICH POINTS? Every surface that prints a scored number.
//
// The founder drove the simulator, met „−10 т." and read it as his DRIVING
// LICENCE being docked. The result screen was repaired first; the same bare
// unit was still live on thirteen other surfaces, and the worst of them is the
// one he meets MINUTES EARLIER in the same drive. His complaint came from
// looking at a screen, so it has to close on screens: this column mounts the
// real components with realistic props, in one frame, so the four scales can be
// read side by side and checked for the OTHER failure — labelling them all
// „изпитни точки", which is exactly as wrong as labelling none of them.
// ---------------------------------------------------------------------------

/** His own drive: over the limit in town, first encounter, t = 22 s. */
const TEACH_SPEEDING: TeachMoment = {
  code: "SPEEDING_DANGEROUS",
  scenarioId: null,
  titleBg: "Превишена скорост",
  explanationBg:
    "Превиши разрешената скорост с повече от 10 km/h. Спирачният път расте с квадрата на скоростта — при 68 km/h вместо 50 km/h спираш около 15 метра по-късно.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  severity: "opasna",
  points: 10,
  t: 22,
};

/** The manoeuvre rubric — the fourth scale, 0..2 and EARNED. */
const RIG_RUBRIC: RubricScore = {
  stars: 2,
  breakdownBg: [
    {
      id: "placement",
      labelBg: "Точност на паркирането",
      detailBg: "Приемливо: 0,34 м от центъра, 4° отклонение от линията на мястото.",
      points: 1,
      measured: true,
    },
    {
      id: "economy",
      labelBg: "Икономия на движения",
      detailBg: "Едно влизане, без корекции.",
      points: 2,
      measured: true,
    },
    {
      id: "observation",
      labelBg: "Наблюдение",
      detailBg: "Няма записани погледи за тази маневра.",
      points: null,
      measured: false,
    },
  ],
};

function rigEntry(over: Partial<LessonEntryView> = {}): LessonEntryView {
  return {
    lesson: {
      id: "rig-exam",
      order: 7,
      titleBg: "Изпитен маршрут — градски",
      descriptionBg: "Официалният формат: 2–4 км, без насочваща линия, без подсказки.",
      conceptIds: ["c-priority", "c-speed"],
      objectives: [{}, {}, {}],
    } as unknown as LessonSpec,
    unlocked: true,
    passed: false,
    attempts: 3,
    bestScore: 12,
    ...over,
  };
}

function RigSection({ titleBg, children }: { titleBg: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-3">
      <h2 className="text-[10px] font-black uppercase tracking-widest text-accent">{titleBg}</h2>
      {children}
    </section>
  );
}

function ScalesGallery({ compact }: { compact: boolean }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-background/95 p-3">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <p className="rounded-xl border border-accent/50 bg-accent/10 p-3 text-xs leading-relaxed">
          <strong>Коя точка?</strong> Четири различни броячи се показват в този
          продукт: наказателни (изпитни) точки по Наредба № 38, контролни точки по
          книжката, точки за изпълнение на маневрата (не са закон) и точки от
          теоретичния изпит. Всяко число тук трябва да носи името на своята скала.
        </p>

        <RigSection titleBg="1 · Учебен момент — екранът, който вижда пръв (t=22)">
          {/* Tall enough for the WHOLE card. At 26rem the frame cut the
              „оценка: Наредба № 38…" chip off the bottom — i.e. the rig hid the
              exact thing it was built to photograph. */}
          <div className="relative h-[46rem] overflow-hidden rounded-lg border border-border">
            <TeachMomentOverlay
              moment={TEACH_SPEEDING}
              remaining={0}
              onAcknowledge={() => undefined}
            />
          </div>
        </RigSection>

        <RigSection titleBg="2 · Учебен момент — компактният лист (телефон), разгънат">
          <div
            className="relative h-64 overflow-hidden rounded-lg border border-border"
            style={{ ["--sim-vh" as string]: "24rem" }}
          >
            <TeachMomentOverlay
              moment={TEACH_SPEEDING}
              remaining={2}
              onAcknowledge={() => undefined}
              compact
            />
          </div>
        </RigSection>

        <RigSection titleBg="3 · Изпитният брифинг — скалата, преди първото число">
          <ExamBriefingCard
            variantId="EX-7K2M"
            variantDescriptionBg="Градски маршрут · дневна светлина · умерен трафик"
            onStart={() => undefined}
            onBack={() => undefined}
          />
        </RigSection>

        <RigSection titleBg="4 · Входните карти — изпитен режим и урок">
          <ExamModeCard entry={rigEntry()} prerequisiteTitleBg={null} onOpen={() => undefined} />
          <LessonCard
            entry={rigEntry({ bestScore: 4, attempts: 2 })}
            onStart={() => undefined}
          />
        </RigSection>

        <RigSection titleBg="5 · „Позна ли се?“ — двете плочки пред резултата">
          <CalibrationGate
            lessonTitleBg="Изпитен маршрут — градски"
            onSubmit={async () => ({
              predictedPoints: 6,
              predictedPass: true,
              actualPoints: 20,
              actualPass: false,
              errorPoints: -14,
              verdict: "overconfident",
              verdictAgreed: false,
              titleBg: "Подценил си грешките си",
              bodyBg:
                "Мислеше, че си направил 6, а протоколът записа 20. На пътя това е разликата между „мина ми“ и катастрофа — инструкторът на изпита вижда всичко, което ти пропусна.",
            })}
            onResolved={() => undefined}
          />
        </RigSection>

        {compact ? null : (
          <p className="pb-6 text-[10px] text-muted">
            Резултатният екран и рубриката на маневрата са на ?state=end; тостът в
            движение е на ?state=column.
          </p>
        )}
      </div>
    </div>
  );
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
                // THE FOURTH SCALE, ON THE SAME SCREEN AS THE HEADLINE. „1 / 2 т."
                // sits under „наказателни точки" and is neither — it is the
                // product's own quality grade, and it runs the other way.
                rubric={RIG_RUBRIC}
                onSkip={compact ? null : () => setSkipped(true)}
                autoOpen={autoOpen}
                onAutoOpenChange={compact ? null : setAutoOpenPersisted}
              />
            </div>
          </div>
        ) : null}

        {state === "scales" ? <ScalesGallery compact={compact} /> : null}

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
                {/* Same vocabulary as the product; a rig that prints a different
                    string than the shell is a rig that lies about the shell. */}
                {pointsBg("exam", result.score)}
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
