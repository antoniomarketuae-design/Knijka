"use client";

/**
 * Lesson hero card for the select screen: title, description, progression
 * state (locked / open / passed), best score and concept count. L0 gets the
 * quick-start accent treatment ("Свободно каране").
 */

import type { LessonEntryView } from "./types";

export function LessonCard({
  entry,
  prerequisiteTitleBg = null,
  onStart,
}: {
  entry: LessonEntryView;
  /** Title of the lesson that unlocks this one — shown on locked cards. */
  prerequisiteTitleBg?: string | null;
  onStart: (lessonId: string) => void;
}) {
  const { lesson, unlocked, passed, attempts, bestScore } = entry;
  const isFreeDrive = lesson.objectives.length === 0;
  // Полигон entries sit OUTSIDE the numbered curriculum chain (their order is
  // only a grid-sort key) — badge them as the training ground, not „Урок N".
  const onPoligon = lesson.world?.districtId === "poligon-v1";
  const badge = isFreeDrive ? "Без задачи" : onPoligon ? "Площадка" : `Урок ${lesson.order}`;

  return (
    <article
      aria-label={`${badge}: ${lesson.titleBg}`}
      className={`card relative flex flex-col gap-3 p-5 transition motion-reduce:transition-none ${
        unlocked ? "hover:border-border-strong hover:shadow-glow-sm" : "opacity-70"
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted">
            {badge}
          </span>
          <h3 className="mt-0.5 text-lg font-extrabold leading-tight">{lesson.titleBg}</h3>
        </div>
        {passed ? (
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-success">
            Издържан
          </span>
        ) : !unlocked ? (
          <span
            aria-label="Заключен урок"
            className="rounded-full border border-border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted"
          >
            🔒 Заключен
          </span>
        ) : null}
      </header>

      <p className="text-sm leading-relaxed text-muted">{lesson.descriptionBg}</p>

      <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <div className="flex items-baseline gap-1">
          <dt className="font-semibold">Теми:</dt>
          <dd className="font-black tabular-nums text-foreground">{lesson.conceptIds.length}</dd>
        </div>
        {!isFreeDrive ? (
          <div className="flex items-baseline gap-1">
            <dt className="font-semibold">Задачи:</dt>
            <dd className="font-black tabular-nums text-foreground">{lesson.objectives.length}</dd>
          </div>
        ) : null}
        {lesson.preDrive ? (
          <div>
            <dd className="font-semibold">+ подготовка (13 стъпки)</dd>
          </div>
        ) : null}
        {attempts > 0 ? (
          <div className="flex items-baseline gap-1">
            <dt className="font-semibold">Най-добър:</dt>
            <dd className="font-black tabular-nums text-foreground">
              {bestScore} т. наказание
            </dd>
          </div>
        ) : null}
      </dl>

      {unlocked ? (
        <button
          type="button"
          className={isFreeDrive ? "btn-accent w-full" : "btn-ghost w-full"}
          onClick={() => onStart(lesson.id)}
        >
          {isFreeDrive ? "Карай свободно" : attempts > 0 ? "Карай отново" : "Започни урока"}
        </button>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-center text-xs font-semibold text-muted">
          {prerequisiteTitleBg !== null
            ? `Издържи „${prerequisiteTitleBg}“, за да се отключи.`
            : "Издържи предишния урок, за да се отключи."}
        </p>
      )}
    </article>
  );
}
