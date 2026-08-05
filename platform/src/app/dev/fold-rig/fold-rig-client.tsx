"use client";

import { useEffect } from "react";
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
/**
 * THE PAPER IS 45 QUESTIONS, AND THE RIG WAS DEALING ONE.
 *
 * Every exam measurement this harness has ever taken mounted `questions={[q]}`,
 * so the runner's counter read „Въпрос 1/1", its navigator button read „0/1"
 * and its jump table had a single cell. The real paper is 45 (docs/education/32
 * — 45 questions / 97 points / 40 minutes, and that is law here), and the two
 * places the difference lands are exactly the two this row is about: the width
 * of the counters in the chrome, which is what decides whether the header wraps
 * to a second row on a 360px screen, and the size of the jump table, which was
 * IN FLOW below the card on a landscape phone before the previous change.
 *
 * So the rig deals a full paper and measures the first question of it. The 44
 * others are the same item under distinct ids — nothing about them is rendered
 * (the runner draws `questions[idx]` only), they exist to make the counters,
 * the navigator and every `questions.length` in the component honest.
 */
const EXAM_PAPER_SIZE = 45;

function deal(question: ExamQuestion): ExamQuestion[] {
  const paper: ExamQuestion[] = [question];
  for (let i = 1; i < EXAM_PAPER_SIZE; i += 1) {
    paper.push({ ...question, id: `${question.id}--filler-${i}` });
  }
  return paper;
}

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
  const paper = mode === "exam" ? deal(exam) : [];
  /**
   * THE HYDRATION FLAG, and it is the whole reason this rig can be trusted.
   * The artwork budget is a client effect. When a dev chunk times out under
   * load React never hydrates, the page still renders from the server, and a
   * measurement script happily reports that geometry as the product's. That
   * happened here and produced a full sweep of plausible, wrong numbers. The
   * sweep now refuses to measure a page without this attribute.
   */
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);

  return (
    <div
      data-surface="cluster"
      data-fold-rig={meta.id}
      data-fold-rig-ink={meta.ink}
      data-fold-rig-rank={meta.rank}
      data-fold-rig-pool={meta.poolSize}
      /* WHAT WAS ACTUALLY MOUNTED, not what the URL asked for. A sweep that
         records `mode` from its own loop variable cannot notice that a typo in
         the query string sent it to the OTHER runner — `?mode=exan` renders
         practice, silently, and 160 rows come back labelled „exam". These two
         attributes are read back by the sweep and compared with what it asked
         for, so a run that measured the wrong surface fails instead of
         publishing. Same reason `data-hydrated` exists. */
      data-fold-rig-mode={mode}
      data-fold-rig-paper={mode === "exam" ? paper.length : 1}
      data-fold-rig-timelow={timeLow ? "1" : "0"}
      className="isolate flex min-h-dvh flex-col bg-background text-foreground"
    >
      <DashboardShell>
        {/* BYTE-FOR-BYTE the (dashboard) layout's own <main> class string.
            It had drifted: this said `short:py-2` while the layout said
            `short:py-1`, so every landscape measurement taken through this rig
            was 8px pessimistic (4px of padding at each end) against the page a
            student actually gets. mobileFold.test.ts now compares the two
            strings, because a rig that is 8px wrong is worse than no rig. */}
        <main
          id="main-content"
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 short:py-1 sm:px-6 lg:px-8 lg:py-8"
        >
          {mode === "practice" ? (
            // The practice route wraps the runner in a flex column with a
            // phone-only header above it. Reproduced verbatim so the rig's card
            // sits at the same y as the real one — including `flex-1`, without
            // which the rig would measure a content-height card and the real
            // page a full-height one.
            <div className="flex flex-1 flex-col gap-2 short:gap-0 sm:gap-8">
              <header className="hidden items-baseline gap-2 narrow-tall:flex">
                <span className="shrink-0 text-xs font-bold text-accent">← Теми</span>
                {/* `text-sm`, matching the real page. It was `text-lg` here,
                    which put the rig's card 16px lower than the product's and
                    made every fold measurement pessimistic by that much. */}
                <h1 className="min-w-0 truncate font-display text-sm font-black tracking-tight">
                  Умна тренировка
                </h1>
              </header>
              {/* `ticket` is a measurement rig's stand-in, not a real one: this
                  page never submits (there is no session and no server action
                  behind it), and a forged ticket is refused server-side. It is
                  here because the prop is required, which is exactly how the
                  real runner is prevented from ever being mounted without one. */}
              <PracticeSession
                questions={[practice]}
                ticket="fold-rig"
                quota={{ usedToday: 4, limit: 40 }}
              />
            </div>
          ) : (
            <ExamRunner
              attemptId="fold-rig"
              questions={paper}
              durationSec={timeLow ? 240 : 2400}
              initialElapsedSec={0}
            />
          )}
        </main>
      </DashboardShell>
    </div>
  );
}
