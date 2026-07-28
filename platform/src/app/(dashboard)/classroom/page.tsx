import type { Metadata } from "next";
import "@/lib/content/loader";
import ClassroomScene from "@/components/classroom/ClassroomScene";
import { buildDemoLesson } from "./demoLesson";

/**
 * `/classroom` — „Класната стая".
 *
 * A server component whose entire job is to hand one `ClassroomLesson` to the
 * room. That is the seam: the lesson lane will replace `buildDemoLesson()`
 * with a real authored lesson (and this route with `/classroom/[lessonId]`)
 * without touching a single component under `components/classroom/`.
 *
 * The content bank is imported for its side effect, exactly as every other
 * server surface that reads it does — the demo lesson quotes approved concept
 * summaries and scenario teach cards rather than writing its own.
 */

export const metadata: Metadata = {
  title: "Класната стая",
  description:
    "Урок с преподавател и дъска: правилното изпълнение и грешката, една до друга, с въпроси по всяко време.",
};

export default function ClassroomPage() {
  const lesson = buildDemoLesson();

  if (!lesson) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold text-foreground">Класната стая</h1>
        <p className="mt-2 text-sm text-muted">
          Урокът не може да бъде сглобен: липсва съдържание или запис, който той цитира. Класната
          стая никога не показва измислен текст — затова тук няма нищо, вместо да има нещо
          съчинено.
        </p>
      </div>
    );
  }

  return <ClassroomScene lesson={lesson} />;
}
