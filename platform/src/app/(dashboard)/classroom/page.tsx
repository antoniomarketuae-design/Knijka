import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { getSectionOverview } from "@/modules/learning";
import {
  allLessons,
  courseCompletion,
  getLessonProgressStore,
  resolveBeat,
  resumePoint,
} from "@/modules/lesson";

/**
 * `/classroom` — the course as a PATH.
 *
 * WHAT THIS ROUTE USED TO BE. From 28 July until today it rendered ONE
 * hand-built demo lesson (`demoLesson.ts`, now deleted) and nothing linked to
 * it, so the founder spent two weeks believing we had built him a chat window.
 * It is now the index of all 54 lessons, and the room lives at
 * `/classroom/[lessonId]` — the seam the old page comment described.
 *
 * WHY AN INDEX AND NOT A REDIRECT INTO LESSON 1. Sixteen mastery gauges and a
 * practice button is a dashboard, not a curriculum; the thing a 17-year-old
 * actually wants from a study app is the next thing to press. 54 numbered
 * lessons is that, and it is the one shape the theory hub does not have.
 *
 * WHAT THE PROGRESS ON THIS PAGE MEANS — TWO DIFFERENT THINGS, ON PURPOSE.
 *
 * This comment used to say there was no lesson-progress table, that nothing
 * could say „изгледан", and that when a position row existed THIS was the one
 * place that had to change. `LessonProgress` exists now, and this is that
 * change.
 *
 *   ИЗГЛЕДАН / ПРОДЪЛЖИ — `LessonProgress`. One row per (student, lesson):
 *     where they stopped, and whether they reached the end. It is what
 *     „Продължи оттам" is computed from, and `courseCompletion` over the same
 *     rows is doc 84's gate U3 — which could not be evaluated at all before.
 *   УСВОЕНО — the per-concept `Progress` rows the quiz beats and the practice
 *     runner write. Kept, and still labelled „усвоено", because it answers a
 *     different question: watching a lesson is not knowing it, and a bar that
 *     filled up just because a video played to the end would be the exact lie
 *     this product exists not to tell.
 *
 * The resume card prefers the most recently touched UNFINISHED lesson over
 * course order — a student who jumped to the roundabout lesson because that is
 * what scares them wants that one back, not lesson 1 (see `resumePoint`).
 */

export const metadata: Metadata = {
  title: "Класна стая · Книжка.AI",
  description:
    "Целият курс с преподавател и дъска: правилното изпълнение и грешката, една до друга, с въпроси по всяко време.",
};

/** What the one big button calls itself, per `resumePoint` verdict. */
const RESUME_LABEL_BG: Record<"continue" | "start" | "restart", string> = {
  continue: "Продължи оттам",
  start: "Започни оттук",
  // Every lesson watched. There is no „finished" screen and inventing one would
  // be worse than saying plainly that the course can be walked again.
  restart: "Целият курс е изгледан · започни отначало",
};

export default async function ClassroomIndexPage() {
  const user = await requireUser();
  const lessons = allLessons();
  const sections = await getSectionOverview(user.id);
  const bySection = new Map(sections.map((s) => [s.sectionId, s]));

  const repo = getContentRepo();
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);

  // „Продължи оттам" — from the student's own position rows, not from a
  // mastery heuristic. One indexed read (userId), 54 ids compared in memory.
  const progressRows = await getLessonProgressStore().listForUser(user.id);
  const byLesson = new Map(progressRows.map((r) => [r.lessonId, r]));
  const resume = resumePoint(
    lessons.map((l) => l.id),
    progressRows,
  );
  const done = courseCompletion(
    lessons.map((l) => l.id),
    progressRows,
  );
  const next = lessons.find((l) => l.id === resume?.lessonId) ?? lessons[0];

  /**
   * Boards per lesson, counted the way the ROOM counts them.
   *
   * `beat.board !== null` is what the composer PICKED; `resolveBeat(...).board`
   * is what a student will actually see, and the two can differ — a template
   * whose trace has gone `pending` degrades to no board at render time. This
   * page states a number out loud („дъска има в 47 от 54 урока"), so it has to
   * be the second one. 516 in-memory resolves, no I/O.
   */
  const boardsByLesson = new Map<string, number>(
    lessons.map((l) => [
      l.id,
      l.beats.reduce(
        (n, b) => n + (resolveBeat(l.id, b.id)?.board != null ? 1 : 0),
        0,
      ),
    ]),
  );
  const boardLessons = [...boardsByLesson.values()].filter((n) => n > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="hud-label">Класна стая</p>
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Целият курс, с преподавател и дъска
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted">
          {lessons.length} урока по {topics.length} теми. Учителят обяснява, на дъската върви
          правилното изпълнение и грешката — една до друга, от един и същ запис. Може да го спреш
          по всяко време и да питаш.
        </p>
      </header>

      {next !== undefined && (
        <section className="card card-live framed flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="hud-label">{RESUME_LABEL_BG[resume?.kind ?? "start"]}</p>
            <p className="mt-1 truncate text-lg font-bold text-foreground">{next.titleBg}</p>
            <p className="mt-0.5 text-xs text-muted">
              {next.topicTitleBg} · урок {next.order} от {lessons.length}
              {/* Doc 84 gate U3, on the page rather than only in a query. */}
              {done.completed > 0 && ` · ${done.completed} завършени`}
            </p>
          </div>
          <Link href={`/classroom/${next.id}`} className="btn-accent shrink-0 px-5 py-2.5 text-sm font-bold">
            {resume?.kind === "continue" ? "Продължи урока" : "Влез в класната стая"}
          </Link>
        </section>
      )}

      <p className="text-[11px] leading-snug text-muted">
        Дъска с правилно и грешно има в {boardLessons} от {lessons.length} урока. В темите без
        записи (алкохол, документи, санкции) учителят обяснява с текст от закона и с въпроси —
        манёвра няма какво да се покаже там.
      </p>

      <div className="flex flex-col gap-4">
        {topics.map((topic) => {
          const group = lessons.filter((l) => l.topicId === topic.id);
          if (group.length === 0) return null;
          return (
            <section key={topic.id} className="card p-4">
              <h2 className="font-display text-sm font-extrabold text-foreground">
                {topic.titleBg}
              </h2>
              <span aria-hidden className="graticule -mt-0.5 mb-2 block w-16" />
              <ul className="flex flex-col gap-1.5">
                {group.map((lesson) => {
                  const overview = bySection.get(lesson.sectionId);
                  const mastery = Math.round((overview?.avgMastery ?? 0) * 100);
                  const boards = boardsByLesson.get(lesson.id) ?? 0;
                  const row = byLesson.get(lesson.id);
                  // Watched vs. known — the two bars mean different things and
                  // the row says which is which rather than blending them.
                  const watchedBg =
                    row === undefined
                      ? null
                      : row.completedAt !== null
                        ? "изгледан"
                        : "продължи";
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/classroom/${lesson.id}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-2.5 transition-colors hover:border-border-strong hover:bg-surface-2"
                      >
                        <span
                          className="metric grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-bold"
                          style={{
                            color:
                              row?.completedAt != null ? "var(--success)" : "var(--muted)",
                          }}
                        >
                          {row?.completedAt != null ? "✓" : lesson.order}
                        </span>
                        <span className="min-w-0 flex-1">
                          {/* NOT `truncate`. Measured at 390 px with the board
                              badge on the same row: „Пътят и участниците"
                              rendered as „Пътят и участни…" and „Задължения и
                              категории" as „Задължения и ка…" — a course index
                              whose lesson names are cut off is not an index.
                              The title wraps; the badge is what gives way. */}
                          <span className="block text-sm font-semibold leading-snug text-foreground">
                            {lesson.titleBg}
                          </span>
                          {/* The mastery bar. It is NOT „watched": watching is
                              the ✓ / „продължи" beside it, from LessonProgress;
                              this measures whether the concepts landed. Two
                              signals, never blended — see the header note. */}
                          <span className="mt-1 flex items-center gap-2">
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
                              <span
                                className="block h-full rounded-full bg-accent"
                                style={{ width: `${mastery}%` }}
                              />
                            </span>
                            <span className="shrink-0 font-mono text-[10px] font-bold text-muted">
                              {mastery}% усвоено
                              {watchedBg !== null && ` · ${watchedBg}`}
                            </span>
                          </span>
                        </span>
                        {boards > 0 && (
                          <span className="hud-label hidden shrink-0 rounded-full border border-hair px-2 py-0.5 text-[10px] sm:inline-flex">
                            {boards} на дъската
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
