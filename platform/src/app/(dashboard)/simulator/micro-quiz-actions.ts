"use server";

/**
 * Server actions for the in-sim micro-quiz (the theory↔driving closed loop).
 *
 * Two thin, guarded adapters over the learning + content modules — the same
 * trust model as the theory practice flow (theory/practice/actions.ts):
 *
 *  - loadMicroQuizBank: on lesson start, loads the concept-linked questions the
 *    quiz-trigger may pop, SANITIZED (no `correct` flags) so answers never
 *    reach the client. The pure trigger (modules/sim/lessons/quiz-trigger.ts)
 *    then decides when/which purely in the browser.
 *  - submitMicroQuizAnswer: grades one answer server-side and feeds mastery via
 *    learning.submitAnswer(context:"micro") — the SAME readiness signal as
 *    theory. Correct options + explanation + law refs only come back AFTER the
 *    student answers.
 */

import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { getSessionUser } from "@/modules/auth";
import { submitAnswer } from "@/modules/learning";
import {
  isQuizMediaRenderable,
  lessonById,
  QUIZ_TARGET_CONCEPT_IDS,
  toMicroQuizMedia,
  type MicroQuizQuestion,
} from "@/modules/sim/lessons";
import type { MicroQuizAnswerResult } from "@/components/sim/lesson-ui/types";
import { canDriveSimulator } from "./access";

const MAX_ID_LENGTH = 120;
const MAX_SELECTED_OPTIONS = 12;
/** Keep the bank small: a session shows at most ~4 quizzes (quiz-trigger cap). */
const MAX_PER_CONCEPT = 3;
const MAX_BANK = 16;

/**
 * Concept-linked question bank for a lesson's contextual quizzes. Concepts =
 * the lesson's own conceptIds ∪ the trigger's target concepts, so whatever the
 * road throws (crossing, stop line, turn, priority) has a question ready.
 * Returns [] on any failure — the trigger degrades to no quizzes.
 */
export async function loadMicroQuizBank(
  lessonId: string,
): Promise<MicroQuizQuestion[]> {
  // getSessionUser + [] rather than requireUser(), for the reason proxy.ts
  // states about /api routes: a LOAD must never answer with a navigation.
  // requireUser() calls redirect(), and Next turns a redirect thrown inside a
  // server action into a 303 that the ROUTER FOLLOWS — so an anonymous caller
  // did not get "no quizzes this session", it got the whole drive screen
  // replaced by /login, mid-mount, with no error anywhere. That is what made
  // every login-free harness (/dev/hud-ux, /dev/gw-shell) un-photographable:
  // three separate review lanes reported "the shell 303s to /login" and none
  // could produce a frame of the driving screen. Returning [] is exactly what
  // this function's contract above already promises for every other failure,
  // and it leaks nothing: an anonymous caller got no questions before either.
  // The mutation half (submitMicroQuizAnswer) refuses by THROWING, which is
  // also not a navigation — see its own note.
  const user = await getSessionUser();
  if (user === null) return [];

  // C-3: the micro-quiz is part of the drive, so it rides the simulator
  // entitlement. Degrades to an empty bank rather than throwing — the same
  // graceful "no quizzes this session" path every other failure takes.
  if (!(await canDriveSimulator(user))) return [];

  if (typeof lessonId !== "string" || lessonId.length === 0 || lessonId.length > MAX_ID_LENGTH) {
    return [];
  }
  const lesson = lessonById(lessonId);
  if (lesson === undefined) return [];

  try {
    const repo = getContentRepo();
    const conceptIds = [...new Set([...lesson.conceptIds, ...QUIZ_TARGET_CONCEPT_IDS])];

    const bank: MicroQuizQuestion[] = [];
    const seen = new Set<string>();
    for (const conceptId of conceptIds) {
      let takenForConcept = 0;
      for (const q of repo.questionsByConcept(conceptId)) {
        if (bank.length >= MAX_BANK) break;
        if (takenForConcept >= MAX_PER_CONCEPT) break;
        if (seen.has(q.id)) continue;
        // L1 GUARD — before `seen`/`taken`, so refusing an undrawable item
        // costs the concept nothing: it simply takes the next question instead.
        //
        // This sanitizer used to drop `q.media` and `o.media` silently, which
        // is how a sign-identification question reached the founder as four
        // captions reading „Знак 1 / Знак 2 / Знак 3 / Знак 4". Media now
        // travels (below) for every kind the overlay draws, and a question
        // carrying a kind it does NOT draw is not served at all. Never both:
        // either the picture is on the screen or the question is not.
        if (!isQuizMediaRenderable(q)) continue;
        seen.add(q.id);
        takenForConcept += 1;
        // Sanitize: strip the `correct` flag — grading is server-side only.
        // `media` carries no answer: on an identification question every
        // option is a sign face, and which one is right stays server-side.
        bank.push({
          id: q.id,
          conceptIds: q.conceptIds,
          type: q.type,
          textBg: q.textBg,
          points: q.points,
          media: toMicroQuizMedia(q.media),
          options: q.options.map((o) => {
            const media = toMicroQuizMedia(o.media);
            return media === null
              ? { id: o.id, textBg: o.textBg }
              : { id: o.id, textBg: o.textBg, media };
          }),
        });
      }
      if (bank.length >= MAX_BANK) break;
    }
    return bank;
  } catch {
    // Content repo unavailable — no quizzes this session (graceful).
    return [];
  }
}

/**
 * Grade one micro-quiz answer and feed mastery (context "micro"). Mirrors
 * submitPracticeAnswer: authenticate, validate the wire input, delegate all
 * grading to the learning module, and return only what the overlay renders.
 * NOTE: no practice-quota gate — micro-quizzes are part of the drive, not the
 * metered theory practice budget. That is only honest because the SIMULATOR
 * gate below is here: without it this endpoint would be an unmetered way for a
 * free account to answer graded questions and move mastery, i.e. a hole
 * straight through the 20/day theory cap.
 */
export async function submitMicroQuizAnswer(
  questionId: string,
  selectedOptionIds: string[],
): Promise<MicroQuizAnswerResult> {
  // THROW, never redirect. The note on loadMicroQuizBank above explains the
  // mechanism; what makes this one worse is WHEN it fires — mid-drive, while
  // the student is moving, from an overlay. requireUser() here meant an expired
  // session did not fail the question, it navigated the moving car to /login.
  // A thrown error stays inside the action's promise (the overlay already
  // catches it and shows a message — see its `catch` around onSubmit) and it is
  // exactly how this same function already refuses invalid input and missing
  // entitlement three lines down. Auth is unchanged: nothing is graded and no
  // mastery moves without a session.
  const user = await getSessionUser();
  if (user === null) {
    throw new Error("submitMicroQuizAnswer: not signed in");
  }

  if (!(await canDriveSimulator(user))) {
    throw new Error("submitMicroQuizAnswer: no simulator entitlement");
  }

  if (typeof questionId !== "string" || questionId.length === 0 || questionId.length > MAX_ID_LENGTH) {
    throw new Error("submitMicroQuizAnswer: invalid questionId");
  }
  if (
    !Array.isArray(selectedOptionIds) ||
    selectedOptionIds.length === 0 ||
    selectedOptionIds.length > MAX_SELECTED_OPTIONS ||
    !selectedOptionIds.every(
      (id): id is string => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH,
    )
  ) {
    throw new Error("submitMicroQuizAnswer: invalid selectedOptionIds");
  }

  const result = await submitAnswer(
    user.id,
    questionId,
    [...new Set(selectedOptionIds)],
    "micro",
  );

  return {
    correct: result.correct,
    correctOptionIds: result.correctOptionIds,
    explanationBg: result.explanationBg,
    lawRefs: result.lawRefs.map(({ act, ref }) => ({ act, ref })),
  };
}
