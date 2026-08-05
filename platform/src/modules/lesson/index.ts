/**
 * lesson — „Класната стая". The SERVER/BUILD half of the public API
 * (docs/architecture/05). The browser half is `@/modules/lesson/client`.
 *
 * WHAT THIS MODULE IS. The founder's classroom: a student in front of a
 * teacher, a board behind showing the correct way and the wrong way, a
 * STOP/ASK button that works at any moment, and mini-quizzes that check
 * whether it landed — across the whole 16-topic course.
 *
 * WHAT IT IS BUILT OUT OF, and this is the point: almost nothing new. 152
 * concept summaries are the narration. 465 recorded traces are the board —
 * every one of the 155 scenario templates already has a shadow-correct beside
 * its mistakes, which is „the right way vs the wrong way" already recorded,
 * already reviewed, at 134 KB a side instead of 2.55 MB. The 1,089-question
 * bank is the quiz and its 326,036 characters of explanations are how the
 * teacher answers. The 58-entry rule catalogue is what the examiner counts it
 * as, what it costs, and what you should have done — which is also the only
 * place the teacher is allowed to have an opinion. The why-panel's wired
 * question → reel map picks the board. `submitAnswer` grades. `askTutor` is
 * the one budgeted model path.
 *
 * This module writes the sequencing, the interruption and the check. It
 * authors no Bulgarian about the road or the law at all (frames.ts holds the
 * classroom's stage directions and explains why they are safe).
 *
 * THE FOUR THINGS TO KNOW BEFORE CHANGING ANYTHING HERE:
 *
 *  1. `say` is a REFERENCE, never a sentence (types.ts) — AND A REFERENCE IS
 *     NOT A GATE. This line used to end „…which is how ADR-002 is satisfied on
 *     the whole playback path without a single runtime check", and that
 *     sentence is why nobody looked for four years' worth of first-aid
 *     instruction being read aloud unreviewed. A beat cannot HOLD an unchecked
 *     claim; it could happily POINT at one, and `concepts.json` has no status
 *     field to point at. clearance.ts is the runtime check that belief stood in
 *     for. Every string leaves through it.
 *  2. The board is TRACES, not video (resolve.ts). ~0.7 MB per lesson instead
 *     of ~5.3 MB, and it is the only version that fits on Bulgarian mobile
 *     data for all 54 lessons. Nothing here prefetches; a beat's media is
 *     fetched when the student reaches that beat.
 *  3. Interruption is a TRANSITION, not a special case (player.ts), and most
 *     interruptions never reach the model at all (interrupt.ts).
 *  4. Everything is DETERMINISTIC. Same lesson, same beat ⇒ same words, same
 *     board, same two questions. A student who retakes a lesson to fix one
 *     thing must be able to meet that thing again.
 */

// ---- The catalogue ---------------------------------------------------------
export {
  allLessons,
  lessonById,
  lessonForSection,
  lessonIdForSection,
  resetLessonCache,
} from "./compose";

// ---- Resolution: ids → the stored strings, one beat at a time --------------
export { resolveBeat, resolveBoard, resolveOutline } from "./resolve";

// ---- THE GATE --------------------------------------------------------------
// Nothing this module says to a student leaves without passing clearance.ts.
// `courseClearance()` is the instrument: it answers „which lessons has the gate
// silenced, and do they still teach anything?" from the real resolver, and
// `recentWithheldSources()` names every source that was refused and why. Read
// them; a gate whose refusals nobody can see is a gate that will be removed by
// the next person who cannot explain why a lesson went quiet.
//
// `lessonsInPreparation()` is the half that was missing until now: the census
// existed and NOTHING OUTSIDE THIS MODULE CALLED IT, so a lesson the gate had
// reduced to four identical „под преглед" bubbles was still offered in the hub
// behind an ordinary link. Both surfaces that can open a lesson — the index and
// `/classroom/[lessonId]` — go through it.
export { courseClearance, lessonClearance, lessonsInPreparation } from "./resolve";
export type { LessonClearance, LessonOffer } from "./resolve";
export {
  CLAIM_FREE_CLASSES,
  GATED_CLASSES,
  SAY_CLASS,
  citationFingerprint,
  citationLine,
  conceptClearance,
  questionClearance,
  recentWithheldSources,
  resetWithheldSources,
  setWithheldSink,
  signClearance,
  summaryFingerprint,
} from "./clearance";
export type { Clearance, SayClass, WithheldReason, WithheldSource } from "./clearance";
// Two authorities, and the difference between them is the point:
// `CARRIED_CONCEPT_SUMMARIES` is a dated policy freeze that describes exactly
// the bytes of `CARRY_FROZEN_BLOB`, and `CLEARED_SINCE_FREEZE` is a person
// having read one sentence. Only the second can cover text written after the
// freeze — which is why the first must never be regenerated from the live file.
export {
  CARRIED_CONCEPT_SUMMARIES,
  CARRY_CEILING,
  CARRY_FROZEN_AT,
  CARRY_FROZEN_BLOB,
  CLEARED_SINCE_FREEZE,
  MACHINE_SIGNERS,
} from "./clearanceCarry";
export type { CarrySignature } from "./clearanceCarry";
// The citation half of the same utterance — what the room prints beside the
// sentence. Pinned separately because it is proved differently: the carry is
// signed by a person, this is re-proved against content/law on every test run.
export { CARRIED_CONCEPT_CITATIONS, CITATIONS_FROZEN_AT } from "./clearanceCitations";
// The same claim, made about the QUESTION bank — the door `status` was assumed
// to cover and never did. A question's `status` says a person approved the row;
// it says nothing about the article number printed beside it, and that number
// reaches a screen on five surfaces that never enter this module.
export {
  CARRIED_QUESTION_CITATIONS,
  QUESTION_CITATIONS_FROZEN_AT,
} from "./clearanceQuestionCitations";

// ---- The authored-lecture socket (docs/ai/85, content/lessons/*.json) ------
// The written lecture and the composed lesson are ONE engine with two sources
// of words. Register the corpus here and every approved beat speaks the
// author's paragraph instead of the composed line; everything else — the
// board, the interruption, the quiz, the state machine — is untouched.
export { lessonNarration, setLessonNarrationProvider } from "./narration";
export type { LessonNarration, LessonNarrationProvider } from "./narration";

// ---- The mini-quiz ---------------------------------------------------------
export { dealBeatQuiz, gradeBeatAnswer } from "./session";
export { isLessonEligible, pickBeatQuiz, quizSeed } from "./quiz";
export type { QuizPick } from "./quiz";

// ---- Interruption ----------------------------------------------------------
export {
  answerInterruption,
  authoredAnswer,
  beatCitations,
  beatMaterials,
  bestMaterialFor,
  constructiveRefusal,
  recentContentGaps,
  resetContentGaps,
  setContentGapSink,
} from "./interrupt";
export type { ContentGap, InterruptionRequest } from "./interrupt";

// ---- Where the student got to ----------------------------------------------
// The resume cursor (LessonProgress). Doc 84 gate U3 — completion per lesson —
// is `courseCompletion` and nothing else; before this row existed the gate
// could not be evaluated at all.
export {
  courseCompletion,
  getLessonProgressStore,
  InMemoryLessonProgressStore,
  resumeBeatIndex,
  resumePoint,
  setLessonProgressStore,
} from "./progress";
export type {
  CourseCompletion,
  CourseResume,
  LessonProgressRow,
  LessonProgressStore,
} from "./progress";

// ---- Shared with the browser half ------------------------------------------
// Re-exported here so server code has one import. Client code must use
// `@/modules/lesson/client`, which is guaranteed free of the simulator.
export type {
  AskChip,
  Beat,
  BeatKind,
  BoardCommand,
  BoardSpec,
  ChipIntent,
  InterruptionAnswer,
  InterruptionSource,
  Lesson,
  LessonOutline,
  LessonQuizQuestion,
  LessonQuizVerdict,
  ResolvedBeat,
  ResolvedBoard,
  ResolvedUtterance,
  SayRef,
  Tone,
} from "./types";
export {
  MAX_INTERRUPTION_LENGTH,
  MAX_MODEL_ASKS_PER_BEAT,
  QUIZ_QUESTIONS_PER_BEAT,
} from "./types";
