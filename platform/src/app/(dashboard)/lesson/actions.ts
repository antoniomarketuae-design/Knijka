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
  getLessonProgressStore,
  gradeBeatAnswer,
  lessonById,
  resolveBeat,
  MAX_INTERRUPTION_LENGTH,
  MAX_MODEL_ASKS_PER_BEAT,
} from "@/modules/lesson";
import type {
  InterruptionAnswer,
  LessonQuizQuestion,
  LessonQuizVerdict,
  ResolvedBeat,
} from "@/modules/lesson";
import { FREE_TUTOR_LIFETIME_MESSAGES } from "@/modules/payments";
import { getThread } from "@/modules/tutor";
import { getTutorAccess } from "../tutor/trial";

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
 * What the Учител says when a free student's lifetime trial is spent and the
 * question needed the model.
 *
 * THEO-4 forbids a bare verdict, and „нямаш достъп" is exactly that in
 * different clothes. Three parts, the same shape as the engine's own
 * constructive refusal: name the boundary, say what IS still covered here (the
 * authored chips answer from the same reviewed material, for nothing, forever),
 * and offer a real destination.
 */
const TRIAL_SPENT_BODY_BG = `Това бяха безплатните ти ${FREE_TUTOR_LIFETIME_MESSAGES} свободни въпроса към мен. Бутоните под урока остават безплатни и продължават да отговарят от същия учебен материал — със закона до отговора. С пакет отговарям и на свободни въпроси без ограничение.`;

const TRIAL_SPENT_OFFER = { labelBg: "Виж плановете", href: "/pricing" } as const;

/**
 * Can this interruption possibly reach a model?
 *
 * A `board` chip („Покажи го пак", „Покажи правилното") is a player command:
 * `answerInterruption` returns it before anything else and it spends nothing,
 * so it must not pay for a quota read either — it is a button a student is
 * expected to press forty times.
 */
function couldSpendTokens(chips: readonly { id: string; kind: string }[], chipId: string | null): boolean {
  if (chipId === null) return true; // free text is the only always-billable path
  const chip = chips.find((c) => c.id === chipId);
  return chip === undefined || chip.kind !== "board";
}

/**
 * „Вдигам ръка." The student's question, answered in the context of the beat
 * they are looking at.
 *
 * THE GATE THIS FILE USED TO BE MISSING (audit: „free accounts can spend model
 * tokens through the classroom"). `FREE_TUTOR_LIFETIME_MESSAGES` was enforced
 * at exactly one call site — `/tutor` — and this action reached `askTutor`
 * through `answerInterruption` without ever asking. `checkTutorPackAllowance`
 * inside `askTutor` does not cover the hole either: it returns
 * „not applicable" for an account with no purchase, because it answers „has
 * this BUYER used up the pack?", not „may this NON-buyer ask at all?". So a
 * free account was bounded only by the tutor's own 30/day cost guard and the
 * global daily ceiling — and registration is free, so it multiplied by
 * accounts. Meanwhile /pricing sells „AI Учител — пълен достъп" in the €12.99
 * pack against a gate the classroom did not have.
 *
 * It is now the SAME decision as the tutor page and askTutorAction —
 * `getTutorAccess` (admin bypass + `checkTutorQuota`), counted from the
 * PERSISTED thread, never from the wire.
 *
 * WHY IT DOES NOT REFUSE OUTRIGHT. Two of the four interruption paths cost
 * nothing (a board command, and an authored answer read verbatim out of the
 * content bank), and they are where most presses land. Blocking those would
 * take the classroom away from every free student after five questions to save
 * $0. So the gate closes the MODEL path only: it hands the engine a spent
 * per-beat budget, which is the engine's own existing $0 seam — board commands
 * and authored answers still return before it, and the model is never reached.
 *
 * `modelAsksUsedInBeat` comes from the client's player state, so it is a hint,
 * not a security boundary — the ceilings that actually bound spend (burst,
 * daily, per-pack allowance, global kill-switch) are counted server-side. This
 * number only decides whether the teacher says „ще се върнем на това" earlier.
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

  const claimed =
    Number.isFinite(modelAsksUsedInBeat) && modelAsksUsedInBeat > 0
      ? Math.floor(modelAsksUsedInBeat)
      : 0;

  let trialSpent = false;
  if (couldSpendTokens(beat.chips, chipId)) {
    const thread = await getThread(user.id);
    const access = await getTutorAccess(user, thread.messages);
    trialSpent = !access.allowed;
  }

  const answer = await answerInterruption({
    userId: user.id,
    lessonId,
    beatId,
    questionBg,
    chipId,
    modelAsksUsedInBeat: trialSpent ? MAX_MODEL_ASKS_PER_BEAT : claimed,
    // The chips the SERVER resolved for this beat, not the ones the client
    // claims to be showing: a chip id is a promise about which material
    // answers it, and the client does not get to make that promise.
    chips: beat.chips,
  });

  // Say WHICH ceiling this was. The engine's `capped` copy is the per-beat one
  // („ще се върнем на това") and it is true when the budget resets next beat.
  // When the trial is gone it never resets, so the same sentence becomes a
  // promise the product cannot keep: the student presses again on the next
  // beat and is told the same untrue thing. If both are spent at once, the
  // trial is the one to name — it is the one that does not come back.
  if (trialSpent && answer.source === "capped") {
    return {
      source: "capped",
      bodyBg: TRIAL_SPENT_BODY_BG,
      citations: [],
      offer: { ...TRIAL_SPENT_OFFER },
      debited: false,
    };
  }
  return answer;
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

/**
 * „Продължи оттам." Move the student's bookmark in this lesson.
 *
 * Called by the room as each ENGINE beat completes (once per idea, not once
 * per sentence) and once more with `completed` at the end. Fire-and-forget on
 * the client: a bookmark that failed to save must never interrupt a lesson.
 *
 * THE INDEX IS RE-BOUNDED HERE, not trusted. A server action is a public POST
 * endpoint, so `beatIndex` arrives as an arbitrary number — the lesson's own
 * beat list is the only authority on how many beats it has, and an out-of-range
 * cursor would open the room on nothing.
 */
export async function saveLessonPosition(
  lessonId: string,
  beatIndex: number,
  completed: boolean,
): Promise<void> {
  const user = await requireUser();
  assertId(lessonId, "lessonId");

  const lesson = lessonById(lessonId);
  if (lesson === undefined) throw new Error("lesson action: unknown lesson");
  if (typeof completed !== "boolean") throw new Error("lesson action: invalid completed");

  const last = Math.max(0, lesson.beats.length - 1);
  const at = Number.isFinite(beatIndex) ? Math.floor(beatIndex) : 0;
  const bounded = Math.min(Math.max(at, 0), last);

  await getLessonProgressStore().save(user.id, lessonId, bounded, completed);
}
