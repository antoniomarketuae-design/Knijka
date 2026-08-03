import "@/lib/content/loader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { roomLessonFor } from "@/app/(dashboard)/classroom/lessonToRoom";
import { allLessons, dealBeatQuiz } from "@/modules/lesson";
import { ClassroomQuizRigClient } from "./classroom-quiz-client";

export const metadata: Metadata = {
  title: "Classroom quiz rig · вътрешно",
  robots: { index: false, follow: false },
};

/**
 * THE CLASSROOM MINI-QUIZ, ON ONE QUESTION YOU CHOOSE — DEV BUILDS ONLY.
 *
 * The twin of `/dev/micro-quiz`, and it exists for the same reason that one
 * does: the DTO behind a quiz dropped its pictures, and NOTHING IN THE TEST
 * SUITE COULD SEE IT, because nothing rendered it. The sim's version of this
 * defect (L1) was found by a founder being asked «Кой от показаните знаци
 * ПРЕДУПРЕЖДАВА…» over four captions reading „Знак 1 / Знак 2 / Знак 3 / Знак
 * 4"; the classroom's version (doc 91 S2) was the same question, in the room.
 *
 * Reaching it by hand is the problem this route removes. A sign question lives
 * in ONE quiz beat of ONE of fifty-four lessons, behind a login, an entitlement
 * and a teacher who speaks its lesson a sentence at a time. Five of the 184
 * questions the lessons deal carry artwork. So this mounts the REAL
 * `ClassroomScene` — real room, real board column, real teacher inset, which is
 * what actually decides whether four sign tiles fit — opened directly on the
 * quiz beat, with the question dealt by the REAL `dealBeatQuiz`.
 *
 *   /dev/classroom-quiz                       the four-sign comparison
 *   /dev/classroom-quiz?lesson=l-speed-limits&beat=b1-quiz
 *   /dev/classroom-quiz?i=1                   the beat's second question
 *   /dev/classroom-quiz?list=1                every artwork question the
 *                                             lessons actually deal
 *
 * WHAT IT IS NOT: a session. There is no user and no attempt row behind it, so
 * pressing „Отговори" fails — exactly as `/dev/fold-rig` says of itself.
 * Everything before the submit is the real component with the real content,
 * and everything this route exists to look at happens before the submit.
 */

/** The item the founder was shown blind: four sign faces, four bare captions. */
const DEFAULT_LESSON = "l-vulnerable-zones";
const DEFAULT_BEAT = "b1-quiz";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function ClassroomQuizRigPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;

  const lessons = allLessons();

  // `?list=1` — every dealt question that has something to look at, so the next
  // person does not have to guess which beat to open.
  if (one(params.list) !== undefined) {
    const rows: string[] = [];
    for (const lesson of lessons) {
      for (const beat of lesson.beats) {
        if (beat.kind !== "quiz") continue;
        dealBeatQuiz(lesson.id, beat.id).forEach((q, i) => {
          const faces = q.options.flatMap((o) => (o.media ? [o.media.signRef] : []));
          const art =
            q.media !== null && "kind" in q.media
              ? q.media.kind === "sign"
                ? `sign ${q.media.signRef}`
                : q.media.kind
              : faces.length > 0
                ? `${faces.length} sign options: ${faces.join(" ")}`
                : "";
          if (art !== "") {
            rows.push(`?lesson=${lesson.id}&beat=${beat.id}&i=${i}   ${q.questionId}   ${art}`);
          }
        });
      }
    }
    return (
      <pre className="overflow-x-auto p-6 font-mono text-xs leading-relaxed">
        {rows.join("\n")}
      </pre>
    );
  }

  const lessonId = one(params.lesson) ?? DEFAULT_LESSON;
  const beatId = one(params.beat) ?? DEFAULT_BEAT;
  const raw = one(params.i);
  const index = raw === undefined ? Number.NaN : Number(raw);

  const room = roomLessonFor(lessonId, lessons.length);
  if (room === null) notFound();

  const questions = dealBeatQuiz(lessonId, beatId);
  // With no `?i=`, open on the first question of the beat that has something to
  // LOOK at — the whole reason to come here. (In the default beat that is the
  // second question, and a rig whose default URL showed the first one would
  // have been a rig that shows a text question to someone checking pictures.)
  const fallback = Math.max(
    0,
    questions.findIndex((q) => q.media !== null || q.options.some((o) => o.media)),
  );
  const question = questions[Number.isFinite(index) ? index : fallback];
  if (question === undefined) notFound();

  // The room counts SENTENCES; the engine counts beats. Open on the first room
  // beat that came from this engine beat, so the rig lands on the quiz rather
  // than on the sentence before it.
  const startBeatIndex = Math.max(
    0,
    room.lesson.beats.findIndex((b) => room.beatSource[b.id] === beatId),
  );

  return (
    <ClassroomQuizRigClient
      lesson={room.lesson}
      lessonId={lessonId}
      beatId={beatId}
      question={question}
      startBeatIndex={startBeatIndex}
    />
  );
}
