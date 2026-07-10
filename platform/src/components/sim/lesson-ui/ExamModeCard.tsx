"use client";

/**
 * A13 — the „Изпитен режим" entry card on /simulator. The exam is THE product
 * promise (doc 68 finding D6: exam rehearsal), so this card is deliberately
 * NOT one more lesson tile: it sits under its own heading with accent
 * framing, states the official rules up front, and is gated behind the
 * spec's prerequisite (EXAM_LESSON.unlockAfterLessonId — passing it flips
 * `entry.unlocked`, computed server-side in page.tsx via isExamUnlocked).
 * Clicking through opens the examiner briefing (ExamBriefingCard), not the
 * session directly.
 */

import type { LessonEntryView } from "./types";

export function ExamModeCard({
  entry,
  prerequisiteTitleBg,
  onOpen,
}: {
  /** The exam spec + the student's progression on it (same view model as
   *  lesson cards — attempts/bestScore read from the same SimSessions). */
  entry: LessonEntryView;
  /** Title of the unlock prerequisite („Кръстовища и предимство"). */
  prerequisiteTitleBg: string | null;
  /** Open the pre-exam briefing (the protocol screen, not the session). */
  onOpen: () => void;
}) {
  const { lesson, unlocked, passed, attempts, bestScore } = entry;

  return (
    <section aria-labelledby="exam-mode-title" className="flex flex-col gap-3">
      <h2 id="exam-mode-title" className="text-lg font-black">
        Изпитен режим
      </h2>
      <article
        aria-label={lesson.titleBg}
        className={`card relative flex flex-col gap-3 border-accent/60 p-5 transition motion-reduce:transition-none ${
          unlocked ? "hover:border-accent hover:shadow-glow-sm" : "opacity-80"
        }`}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-accent">
              Официален формат · без подсказки
            </span>
            <h3 className="mt-0.5 text-lg font-extrabold leading-tight">{lesson.titleBg}</h3>
          </div>
          {passed ? (
            <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-success">
              Издържан
            </span>
          ) : !unlocked ? (
            <span
              aria-label="Заключен изпит"
              className="rounded-full border border-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted"
            >
              🔒 Заключен
            </span>
          ) : null}
        </header>

        <p className="text-sm leading-relaxed text-muted">{lesson.descriptionBg}</p>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <div className="flex items-baseline gap-1">
            <dt className="font-semibold">Маршрут:</dt>
            <dd className="font-black text-foreground">≈ 2,5 км · 10–15 мин</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="font-semibold">Лимити:</dt>
            <dd className="font-black text-foreground">9 т. общо · 6 т. основни · 0 опасни</dd>
          </div>
          {attempts > 0 ? (
            <div className="flex items-baseline gap-1">
              <dt className="font-semibold">Опити:</dt>
              <dd className="font-black tabular-nums text-foreground">{attempts}</dd>
            </div>
          ) : null}
          {bestScore !== null ? (
            <div className="flex items-baseline gap-1">
              <dt className="font-semibold">Най-добър:</dt>
              <dd className="font-black tabular-nums text-foreground">{bestScore} т. наказание</dd>
            </div>
          ) : null}
        </dl>

        {unlocked ? (
          <button type="button" className="btn-accent w-full" onClick={onOpen}>
            {attempts > 0 ? "Нов изпитен опит" : "Към изпита"}
          </button>
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-center text-xs font-semibold text-muted">
            Издържи урок {prerequisiteTitleBg !== null ? `„${prerequisiteTitleBg}“` : "с предимство"},
            за да се отключи изпитният режим.
          </p>
        )}
      </article>
    </section>
  );
}
