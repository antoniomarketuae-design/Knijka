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
 *
 * THE TWO THINGS THIS FILE GOT WRONG, and they were independent.
 *
 * 1. THE DEAL HAD NO STATUS FILTER. It walked `questionsByConcept` and took
 *    what it found. Measured over every quizzable lesson on 2026-08-04: 98
 *    distinct rows dealt, 23 of them `needs-review`. A student mid-drive was
 *    being shown unreviewed questions and then their unreviewed explanations —
 *    on a surface where the drive is PAUSED and the card's whole job is to be
 *    read. Every other student-facing surface in this product already gates on
 *    `approved`: narration.ts:87, lesson/clearance.ts, lesson/quiz.ts:43,
 *    exam/builder.ts:120, tutor/retrieval.ts. This one did not, and nobody
 *    noticed because all of its neighbours did.
 *
 * 2. THE SUBMIT HALF DID NOT BIND THE QUESTION TO A DEAL. It validated the
 *    id's type and length, then handed the id to submitAnswer, which answered
 *    with `correctOptionIds`, `explanationBg` and `lawRefs` — for ANY of the
 *    1,089 rows in the bank. Verified by running it: `q-ptp-009`
 *    (`needs-review`, hit-and-run, cites НК чл. 140) came back keyed, explained
 *    and cited, from a user who had never been dealt it, with no ticket of any
 *    kind. That is audit M-10's answer-key oracle exactly, one door along: it
 *    was written up as a practice defect, practice was fixed by wiring
 *    issuePracticeTicket, and this neighbour kept the shape.
 *
 *    Worse than the cheating, and the same sentence practice/actions.ts already
 *    carries: every forged answer wrote a QuestionAttempt and moved mastery
 *    (measured: 0 → 0.35 on c-hit-and-run, reps 1, dueAt +1d), so the readiness
 *    score — the one dataset that could ever show this product makes safer
 *    drivers — was client-writable through here.
 *
 * Both are closed the way the neighbours close them: the deal filters on
 * `status === "approved"`, and it signs the bank it dealt (issuePracticeTicket)
 * so the submit half only honours a question this student was actually offered.
 */

import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { getSessionUser } from "@/modules/auth";
import { issuePracticeTicket, submitAnswer } from "@/modules/learning";
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
/** Comfortably above a real ticket (16 ids, a signature), far below a DoS. */
const MAX_TICKET_LENGTH = 4096;

/**
 * What a lesson start gets: the sanitized bank AND the capability to answer it.
 *
 * The ticket is signed over exactly these ids, for this user, for one sitting.
 * It is a capability, not a secret — it says "these questions, this user, until
 * then" and nothing else — so shipping it to the browser costs nothing, which
 * is the same reasoning the practice page's own `ticket` prop carries.
 *
 * It rides alongside the questions rather than on each `MicroQuizQuestion`
 * because that type belongs to modules/sim/lessons (the pure trigger's input),
 * and a session capability is not a property of a question.
 *
 * An empty bank ships an empty ticket: no questions dealt, no capability
 * granted. A "" ticket verifies as MISSING, never as valid.
 */
export interface MicroQuizBank {
  questions: MicroQuizQuestion[];
  ticket: string;
}

const EMPTY_BANK: MicroQuizBank = { questions: [], ticket: "" };

/**
 * Concept-linked question bank for a lesson's contextual quizzes. Concepts =
 * the lesson's own conceptIds ∪ the trigger's target concepts, so whatever the
 * road throws (crossing, stop line, turn, priority) has a question ready.
 * Returns an empty bank on any failure — the trigger degrades to no quizzes.
 */
export async function loadMicroQuizBank(
  lessonId: string,
): Promise<MicroQuizBank> {
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
  if (user === null) return EMPTY_BANK;

  // C-3: the micro-quiz is part of the drive, so it rides the simulator
  // entitlement. Degrades to an empty bank rather than throwing — the same
  // graceful "no quizzes this session" path every other failure takes.
  if (!(await canDriveSimulator(user))) return EMPTY_BANK;

  if (typeof lessonId !== "string" || lessonId.length === 0 || lessonId.length > MAX_ID_LENGTH) {
    return EMPTY_BANK;
  }
  const lesson = lessonById(lessonId);
  if (lesson === undefined) return EMPTY_BANK;

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
        // STATUS GATE — before `seen`/`taken`, for the same reason the L1 media
        // guard below is: refusing an item costs the concept nothing, it simply
        // takes the next question instead.
        //
        // This is `narration.ts:87`, `lesson/clearance.ts:242`,
        // `lesson/quiz.ts:43` and `exam/builder.ts:120` — the check every other
        // student-facing surface already makes, and the one this file did not.
        // Without it the deal handed a driver 23 `needs-review` rows across the
        // quizzable lessons, question AND explanation, mid-drive.
        //
        // `draft` is refused too, not just `needs-review`. Practice
        // deliberately deals `draft` (session.ts) because practice is where
        // unreviewed material earns its review; a paused drive is not — the
        // student is here to drive, the quiz interrupts them, and an interrupt
        // has to be worth the interruption.
        if (q.status !== "approved") continue;
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
    // AUDIT M-10, on this door. Signed over EXACTLY the ids this call dealt, to
    // THIS user, for one sitting. submitAnswer refuses any question that is not
    // on it, so the 45 ids in the DOM of a mock exam in another tab — or any of
    // the 1,089 rows typed into a fetch by hand — buy nothing here: they were
    // never dealt. An empty bank grants nothing (see MicroQuizBank).
    return {
      questions: bank,
      ticket: bank.length === 0 ? "" : issuePracticeTicket(user.id, bank.map((q) => q.id)),
    };
  } catch {
    // Content repo unavailable — no quizzes this session (graceful).
    return EMPTY_BANK;
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
 *
 * `ticket` is the capability loadMicroQuizBank issued for this drive. It is
 * passed to the learning module UNVALIDATED beyond a length bound, on purpose:
 * verification belongs to practiceTicket.ts, which owns the signing key and
 * throws BEFORE anything is read, graded or written — so a submission we are
 * not going to honour never touches mastery and, above all, is never answered
 * with the key.
 */
export async function submitMicroQuizAnswer(
  questionId: string,
  selectedOptionIds: string[],
  ticket: string,
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
  if (typeof ticket !== "string" || ticket.length > MAX_TICKET_LENGTH) {
    throw new Error("submitMicroQuizAnswer: invalid ticket");
  }

  const result = await submitAnswer(
    user.id,
    questionId,
    [...new Set(selectedOptionIds)],
    "micro",
    new Date(),
    { ticket },
  );

  return {
    correct: result.correct,
    correctOptionIds: result.correctOptionIds,
    explanationBg: result.explanationBg,
    lawRefs: result.lawRefs.map(({ act, ref }) => ({ act, ref })),
  };
}
