import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/lib/content/loader";
import { requireUser } from "@/modules/auth";
import {
  allLessons,
  getLessonProgressStore,
  lessonById,
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

  // The course, not a file. „Урок 21 от 54" is only true if there is a 22.
  const index = lessons.findIndex((l) => l.id === room.lessonId);
  const after = index >= 0 ? lessons[index + 1] : undefined;

  // WHERE THIS STUDENT LEFT OFF. The row stores an ENGINE beat index; the room
  // counts sentences, so it is converted here, on the server, once — see
  // `../resume.ts`. A lesson with no row (or a finished one) opens at 0.
  const engineBeatIds = (lessonById(room.lessonId)?.beats ?? []).map((b) => b.id);
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
