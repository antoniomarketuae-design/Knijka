import Link from "next/link";
import type { ContinueLesson } from "@/components/dashboard/data";
import { IconPlay } from "@/components/icons";

/**
 * Hero card: continue where you left off. Falls back to a "start your first
 * lesson" state when the student hasn't opened the curriculum yet.
 */
export function ContinueLessonCard({ lesson }: { lesson: ContinueLesson | null }) {
  if (!lesson) {
    return (
      <section
        aria-labelledby="continue-title"
        className="card relative overflow-hidden p-6 sm:p-8"
      >
        <GlowBackdrop />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">
            Първи стъпки
          </p>
          <h2 id="continue-title" className="mt-2 text-2xl font-black sm:text-3xl">
            Започни първия си урок
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            Ще тръгнем от основите — кой кой е на пътя и златните правила на
            движението.
          </p>
          <Link href="/theory" className="btn-accent mt-6">
            <IconPlay className="h-4 w-4" />
            Започни урока
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="continue-title"
      className="card relative overflow-hidden p-6 sm:p-8"
    >
      <GlowBackdrop />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">
            Продължи урока
          </p>
          <h2 id="continue-title" className="mt-2 text-2xl font-black sm:text-3xl">
            {lesson.conceptTitleBg}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Тема {lesson.topic.order}: {lesson.topic.titleBg}
          </p>
          <div className="mt-4 max-w-sm">
            <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
              <span>Напредък по темата</span>
              <span className="tabular-nums">{lesson.progressPct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Напредък по темата „${lesson.topic.titleBg}“`}
              aria-valuenow={lesson.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-soft"
                style={{ width: `${lesson.progressPct}%` }}
              />
            </div>
          </div>
        </div>
        <Link href={lesson.href} className="btn-accent shrink-0">
          <IconPlay className="h-4 w-4" />
          Продължи
        </Link>
      </div>
    </section>
  );
}

function GlowBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-60"
      style={{
        background:
          "radial-gradient(closest-side, var(--glow) 0%, transparent 100%)",
      }}
    />
  );
}
