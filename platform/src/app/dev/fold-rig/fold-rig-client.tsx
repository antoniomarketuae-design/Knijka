"use client";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { PracticeSession } from "@/components/theory/PracticeSession";
import type { PracticeQuestionDto } from "@/components/theory/types";
import type { ExamQuestion } from "@/modules/exam";

/**
 * The rig's shell. It reproduces (dashboard)/layout.tsx + DashboardShell
 * EXACTLY — same scope attribute, same <main> class string — because the fold
 * is a property of the whole screen, not of the card. If those move, this has
 * to move with them; components/mobileFold.test.ts pins the pair.
 *
 * The DeckBackdrop is deliberately left out: it is a `fixed` element painting
 * behind everything and it costs nothing in layout, but it does cost a WebGL-
 * free canvas repaint per navigation, and this rig is walked question by
 * question by the measurement script.
 */
export function FoldRigClient({
  mode,
  timeLow,
  practice,
  exam,
  meta,
}: {
  mode: "practice" | "exam";
  timeLow: boolean;
  practice: PracticeQuestionDto;
  exam: ExamQuestion;
  meta: { id: string; family: string; rank: number; poolSize: number; ink: number };
}) {
  return (
    <div
      data-surface="cluster"
      data-fold-rig={meta.id}
      data-fold-rig-ink={meta.ink}
      data-fold-rig-rank={meta.rank}
      data-fold-rig-pool={meta.poolSize}
      className="isolate flex min-h-dvh flex-col bg-background text-foreground"
    >
      <DashboardShell>
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {mode === "practice" ? (
            // The practice route wraps the runner in a `flex flex-col gap-4`
            // with a phone-only header above it. Reproduced verbatim so the
            // rig's card sits at the same y as the real one.
            <div className="flex flex-col gap-2 sm:gap-8">
              <header className="flex items-baseline gap-3 sm:hidden">
                <span className="shrink-0 text-xs font-bold text-accent">← Теми</span>
                <h1 className="min-w-0 truncate font-display text-lg font-black tracking-tight">
                  Умна тренировка
                </h1>
              </header>
              <PracticeSession questions={[practice]} quota={{ usedToday: 4, limit: 40 }} />
            </div>
          ) : (
            <ExamRunner
              attemptId="fold-rig"
              questions={[exam]}
              durationSec={timeLow ? 240 : 2400}
              initialElapsedSec={0}
            />
          )}
        </main>
      </DashboardShell>
    </div>
  );
}
