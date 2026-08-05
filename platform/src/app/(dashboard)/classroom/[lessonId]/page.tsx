import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/lib/content/loader";
import { requireUser } from "@/modules/auth";
import {
  allLessons,
  getLessonProgressStore,
  lessonById,
  lessonsInPreparation,
  resumeBeatIndex,
} from "@/modules/lesson";
import { ClassroomRoom } from "../ClassroomRoom";
import { roomLessonFor } from "../lessonToRoom";
import { roomStartIndex } from "../resume";

/**
 * One lesson, in the room.
 *
 * This is the route the 28-July page comment promised („…and this route with
 * `/classroom/[lessonId]`"). It replaced nothing under `components/classroom/`:
 * the room still takes one `ClassroomLesson` and knows nothing about sections,
 * mastery or the content bank. `lessonToRoom.ts` is the whole adapter.
 *
 * WHY THE WHOLE LESSON SHIPS WITH THE PAGE, when the engine's own runner ships
 * one beat at a time. `ClassroomLesson` is a whole-lesson contract — the header
 * draws a pip per beat and the player estimates the lesson's length from the
 * sum of them, neither of which is expressible one beat at a time. What that
 * costs is the TEXT of one lesson: ~14 sentences of stored Bulgarian, a couple
 * of kB. What it does NOT ship is anything heavy — the traces are fetched by
 * the board of the beat the student is actually on, and a quiz beat's questions
 * are dealt by `loadBeat` when the student reaches it. The bandwidth promise
 * was never about the sentences.
 */

export const metadata: Metadata = {
  title: "Класната стая · Книжка.AI",
  description:
    "Урок с преподавател и дъска: правилното изпълнение и грешката, една до друга, с въпроси по всяко време.",
};

interface Props {
  params: Promise<{ lessonId: string }>;
}

export default async function ClassroomLessonPage({ params }: Props) {
  const user = await requireUser();
  const { lessonId } = await params;

  const lessons = allLessons();
  const room = roomLessonFor(lessonId, lessons.length);
  if (room === null) notFound();

  /**
   * THE SECOND DOOR INTO THE SAME ROOM.
   *
   * The hub stops offering an in-preparation lesson; this URL is still typed,
   * bookmarked, linked from an old resume row and reachable by editing the
   * address bar. A badge on the index that a direct link walks straight past is
   * decoration, and „one door was checked so the one beside it must be" is the
   * exact mistake that let `resolve.ts` speak the superseded recovery-position
   * instruction while everybody was looking at `narration.ts`.
   *
   * NOT `notFound()`. This lesson exists, it is in the syllabus, and a 404
   * would tell a student who came looking for first aid that we do not teach
   * it. The refusal is constructive, in the shape doc 84 §2.3 requires: name
   * the boundary, say what is true, offer a real destination.
   */
  // `room.lessonId` and not the raw param: that is the id the rest of this
  // route resolves against, and gating on a different string than the one the
  // player is handed is how a gate ends up covering a lesson nobody opens.
  const lesson = lessonById(room.lessonId);
  const inPreparation = lessonsInPreparation();
  if (inPreparation.has(room.lessonId)) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="hud-label">В подготовка</p>
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            {lesson?.titleBg ?? "Този урок"}
          </h1>
        </header>
        <section className="card framed flex flex-col gap-3 p-5">
          <p className="max-w-prose text-sm leading-relaxed text-foreground">
            Материалът за този урок още се проверява от преподавател, затова няма да ти го
            разказваме. По-добре да ти кажем „не знам сигурно“, отколкото да те научим на
            грешното — а после да го поправяш на пътя.
          </p>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            Урокът остава в курса и ще се отвори сам, щом съдържанието му е потвърдено. Дотогава
            другите уроци по темата вървят нормално.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/classroom" className="btn-accent px-5 py-2.5 text-sm font-bold">
              Обратно към курса
            </Link>
            <Link
              href="/theory"
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border-strong"
            >
              Към тренировката
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // The course, not a file. „Урок 21 от 54" is only true if there is a 22.
  //
  // SKIPS what the census will not open. The end-of-lesson „Следващ урок"
  // button is the third way into a room, after the index and the URL, and it
  // is the one a student presses without choosing a destination — landing them
  // on the refusal panel through no decision of their own. It walks forward to
  // the next lesson that can actually be taught.
  const index = lessons.findIndex((l) => l.id === room.lessonId);
  const after =
    index < 0 ? undefined : lessons.slice(index + 1).find((l) => !inPreparation.has(l.id));

  // WHERE THIS STUDENT LEFT OFF. The row stores an ENGINE beat index; the room
  // counts sentences, so it is converted here, on the server, once — see
  // `../resume.ts`. A lesson with no row (or a finished one) opens at 0.
  const engineBeatIds = (lesson?.beats ?? []).map((b) => b.id);
  const saved = await getLessonProgressStore().getOne(user.id, room.lessonId);
  const startBeatIndex = roomStartIndex(
    room.lesson.beats.map((b) => b.id),
    room.beatSource,
    engineBeatIds,
    resumeBeatIndex(saved, engineBeatIds.length),
  );

  return (
    <ClassroomRoom
      lesson={room.lesson}
      beatSource={room.beatSource}
      engineBeatIds={engineBeatIds}
      lessonId={room.lessonId}
      sectionId={room.sectionId}
      startBeatIndex={startBeatIndex}
      next={after === undefined ? null : { id: after.id, titleBg: after.titleBg }}
    />
  );
}
