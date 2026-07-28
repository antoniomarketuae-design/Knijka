"use server";

/**
 * Server actions for the classroom — a thin, guarded adapter over
 * @/modules/lesson. All business logic (sequencing, grounding, grading) lives
 * in the module; this file authenticates, validates the wire input and shapes
 * the response.
 *
 * ONE BEAT PER CALL, ON PURPOSE. `loadBeat` is what makes the bandwidth
 * promise real: the page ships an outline (a list of ids) plus the first
 * beat, and every later beat — its Bulgarian, its two trace URLs, its quiz —
 * arrives when the student reaches it. Nothing here can return a whole
 * lesson's media, and nothing prefetches the next lesson. These are teenagers
 * on Bulgarian mobile data.
 */

import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { trackActivity } from "@/modules/gamification";
import {
  answerInterruption,
  dealBeatQuiz,
  gradeBeatAnswer,
  resolveBeat,
  MAX_INTERRUPTION_LENGTH,
} from "@/modules/lesson";
import type {
  InterruptionAnswer,
  LessonQuizQuestion,
  LessonQuizVerdict,
  ResolvedBeat,
} from "@/modules/lesson";

const MAX_ID_LENGTH = 120;
const MAX_SELECTED_OPTIONS = 12;

function assertId(value: unknown, what: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw new Error(`lesson action: invalid ${what}`);
  }
}

export interface BeatPayload {
  beat: ResolvedBeat;
  /** Empty unless this is a quiz beat. Dealt with the beat, never earlier. */
  quiz: LessonQuizQuestion[];
}

export async function loadBeat(
  lessonId: string,
  beatId: string,
): Promise<BeatPayload> {
  await requireUser();
  assertId(lessonId, "lessonId");
  assertId(beatId, "beatId");

  const beat = resolveBeat(lessonId, beatId);
  if (beat === null) throw new Error("lesson action: unknown beat");
  return { beat, quiz: beat.quiz ? dealBeatQuiz(lessonId, beatId) : [] };
}

/**
 * „Вдигам ръка." The student's question, answered in the context of the beat
 * they are looking at.
 *
 * `modelAsksUsedInBeat` comes from the client's player state, so it is a hint,
 * not a security boundary — and it does not need to be one: the ceilings that
 * actually bound spend (burst, daily, per-pack allowance, global kill-switch)
 * all live inside askTutor and are counted server-side from the student's own
 * thread. This number only decides whether the teacher says „ще се върнем на
 * това" a little earlier.
 */
export async function askTeacher(
  lessonId: string,
  beatId: string,
  questionBg: string,
  chipId: string | null,
  modelAsksUsedInBeat: number,
): Promise<InterruptionAnswer> {
  const user = await requireUser();
  assertId(lessonId, "lessonId");
  assertId(beatId, "beatId");
  if (
    typeof questionBg !== "string" ||
    questionBg.trim().length === 0 ||
    questionBg.length > MAX_INTERRUPTION_LENGTH
  ) {
    throw new Error("lesson action: invalid question");
  }
  if (chipId !== null) assertId(chipId, "chipId");

  const beat = resolveBeat(lessonId, beatId);
  if (beat === null) throw new Error("lesson action: unknown beat");

  return answerInterruption({
    userId: user.id,
    lessonId,
    beatId,
    questionBg,
    chipId,
    modelAsksUsedInBeat:
      Number.isFinite(modelAsksUsedInBeat) && modelAsksUsedInBeat > 0
        ? Math.floor(modelAsksUsedInBeat)
        : 0,
    // The chips the SERVER resolved for this beat, not the ones the client
    // claims to be showing: a chip id is a promise about which material
    // answers it, and the client does not get to make that promise.
    chips: beat.chips,
  });
}

export async function answerLessonQuiz(
  lessonId: string,
  beatId: string,
  questionId: string,
  selectedOptionIds: string[],
): Promise<LessonQuizVerdict> {
  const user = await requireUser();
  assertId(lessonId, "lessonId");
  assertId(beatId, "beatId");
  assertId(questionId, "questionId");
  if (
    !Array.isArray(selectedOptionIds) ||
    selectedOptionIds.length === 0 ||
    selectedOptionIds.length > MAX_SELECTED_OPTIONS ||
    !selectedOptionIds.every(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH,
    )
  ) {
    throw new Error("lesson action: invalid selectedOptionIds");
  }

  const verdict = await gradeBeatAnswer(
    user.id,
    lessonId,
    beatId,
    questionId,
    selectedOptionIds,
  );

  // A classroom answer counts exactly like a practice answer — same streak,
  // same activity ledger, same official weight. The lesson is an input to the
  // learning engine, not a display surface beside it.
  await trackActivity(user.id, {
    type: "practice_answer",
    correct: verdict.correct,
    points: getContentRepo().questionById(questionId)?.points ?? 1,
  });
  return verdict;
}
