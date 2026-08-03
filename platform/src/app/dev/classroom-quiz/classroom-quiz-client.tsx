"use client";

/**
 * The rig's client half: the REAL <ClassroomScene> with the REAL <QuizQuestion>
 * in its quiz slot.
 *
 * The only thing replaced is `loadBeat` — the server action that deals the
 * questions, and the one piece of the path that needs a signed-in user. The
 * question it would have returned is dealt on the server by this route's own
 * page, by the same `dealBeatQuiz`, so what is on screen is what a student
 * sees: same component, same DTO, same room geometry.
 *
 * The type of `question` is taken from the component itself rather than
 * imported from `@/modules/lesson/client` on purpose —
 * `lesson/one-front-door.test.ts` counts every .tsx that reaches for the lesson
 * client or the lesson actions, and this rig is not a second front door.
 */

import { type ComponentProps, useState } from "react";
import { QuizQuestion } from "@/app/(dashboard)/classroom/ClassroomRoom";
import ClassroomScene from "@/components/classroom/ClassroomScene";
import type { ClassroomLesson } from "@/components/classroom/types";

type Question = ComponentProps<typeof QuizQuestion>["question"];

export function ClassroomQuizRigClient({
  lesson,
  lessonId,
  beatId,
  question,
  startBeatIndex,
}: {
  lesson: ClassroomLesson;
  lessonId: string;
  beatId: string;
  question: Question;
  startBeatIndex: number;
}) {
  const [done, setDone] = useState(false);

  return (
    <div className="p-2">
      <ClassroomScene
        lesson={lesson}
        startBeatIndex={startBeatIndex}
        renderQuiz={({ dense, onDone }) =>
          done ? null : (
            <section
              aria-label="Мини-тест"
              className="flex flex-1 flex-col rounded-2xl border border-accent-2/40 bg-surface/85 p-3"
            >
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wide text-accent-2">
                Проверка · въпрос 1 от 1
              </p>
              <QuizQuestion
                lessonId={lessonId}
                beatId={beatId}
                question={question}
                dense={dense}
                onNext={() => {
                  setDone(true);
                  onDone();
                }}
              />
            </section>
          )
        }
      />
      <p className="mt-2 px-1 font-mono text-[10px] text-muted">
        dev rig · няма сесия зад него, „Отговори&ldquo; ще гръмне · ?list=1 за всички
      </p>
    </div>
  );
}
