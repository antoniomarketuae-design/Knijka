import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { requireUser } from "@/modules/auth";
import { allLessons } from "@/modules/lesson";

export const metadata: Metadata = {
  title: "Класна стая · Книжка.AI",
  description: "54 урока — целият курс, с учител, дъска и мини-въпроси.",
};

/**
 * The course, as a PATH.
 *
 * This is the thing the theory hub does not have today: sixteen gauges and a
 * practice button are a dashboard, not a curriculum. 54 numbered lessons give
 * a 17-year-old the one thing they actually want from a study app — the next
 * thing to press.
 */
export default async function LessonIndexPage() {
  await requireUser();
  const lessons = allLessons();

  const byTopic = lessons.reduce<Map<string, typeof lessons>>((map, lesson) => {
    const list = map.get(lesson.topicTitleBg);
    if (list) list.push(lesson);
    else map.set(lesson.topicTitleBg, [lesson]);
    return map;
  }, new Map());

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 py-5">
      <h1 className="text-xl font-bold text-foreground">Класна стая</h1>
      <p className="mt-1 text-sm text-muted">
        {lessons.length} урока · целият курс. Всеки е 4–6 минути и може да бъде
        прекъснат по всяко време.
      </p>

      <div className="mt-5 flex flex-col gap-5">
        {[...byTopic.entries()].map(([topicTitleBg, group]) => (
          <section key={topicTitleBg}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {topicTitleBg}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {group.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/lesson/${lesson.id}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-muted">
                      {lesson.order}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-foreground">
                      {lesson.titleBg}
                    </span>
                    <span className="text-xs text-muted">
                      {lesson.beats.filter((b) => b.board !== null).length > 0
                        ? "с дъска"
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
