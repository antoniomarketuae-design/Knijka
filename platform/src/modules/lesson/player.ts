/**
 * The lesson player — a PURE, DETERMINISTIC state machine.
 *
 * Zero DOM, zero network, zero database, zero randomness: same state + same
 * event ⇒ same next state. It is modelled on sim/lessons/quiz-trigger.ts for
 * exactly the reason that module gives — a student who retakes a lesson to fix
 * one thing must get the same lesson back — and it is node-testable without a
 * browser, which is what lets the interruption logic be pinned by tests rather
 * than by clicking.
 *
 * WHY INTERRUPTION IS A TRANSITION AND NOT A SPECIAL CASE. The founder's ask
 * („can with buttons stop ask, during the teacher explanations") is the whole
 * reason this is a state machine at all. A recording has one behaviour when a
 * hand goes up: it stops. A state machine has `held`, `thinking`, `answering`
 * and a resume that knows where it was — which is the difference between a
 * teacher and a video player, and it costs nothing to build once the lesson is
 * data instead of footage.
 *
 * TWO RULES THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 *  1. THE HAND GOES UP AT A SENTENCE BOUNDARY. HAND_RAISE while the teacher is
 *     mid-utterance sets `holdRequested` and the machine keeps speaking until
 *     UTTERANCE_END. Worst case the student waits one sentence — which is
 *     precisely what a real teacher finishing a thought does. Cutting mid-word
 *     is what makes software feel like software.
 *
 *  2. THE BOARD DIMS, IT DOES NOT CLEAR. Nothing in this machine discards the
 *     beat. `beatIndex` and `utteranceIndex` are untouched by the whole
 *     interruption cycle, so RESUME continues the sentence after the one the
 *     student stopped, with what they were looking at still on the board. They
 *     interrupted ABOUT something; destroying the referent forces them to
 *     describe what they were pointing at.
 */

import { MAX_MODEL_ASKS_PER_BEAT } from "./types";
import type { Beat, Lesson } from "./types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type LessonPhase =
  /** Before START — the „започни урока" screen. */
  | "ready"
  /** The teacher is delivering `utterances[utteranceIndex]`. */
  | "speaking"
  /** Every utterance of the beat is delivered; waiting for NEXT. */
  | "beat-end"
  /** The student raised their hand. The teacher is listening. */
  | "held"
  /** The question is sent; the answer is being resolved. */
  | "thinking"
  /** The answer is on screen; RESUME returns to the beat. */
  | "answering"
  /** A quiz beat is dealing questions. */
  | "quiz"
  /** The last beat is done. */
  | "finished";

/**
 * What the CLASSROOM LANE renders the teacher as. This is the seam between the
 * two lanes: the lesson engine owns the phase, the classroom owns the picture,
 * and `teacherStateOf` is the entire contract between them. A new teacher
 * presentation (text speech-area today, a voice later, a drawn body later
 * still) consumes this enum and nothing else from this file.
 */
export type TeacherState =
  | "speaking"
  | "listening"
  | "thinking"
  | "answering"
  | "quizzing"
  | "idle";

export interface LessonPlayerState {
  lessonId: string;
  phase: LessonPhase;
  /** 0-based beat cursor. */
  beatIndex: number;
  /** 0-based utterance cursor WITHIN the current beat. */
  utteranceIndex: number;
  /** A hand went up mid-sentence; the machine holds at the next boundary. */
  holdRequested: boolean;
  /** Budgeted (model) interruptions used in the CURRENT beat. */
  modelAsksInBeat: number;
  /** Interruptions of any kind in the current beat — drives the resume line. */
  asksInBeat: number;
  /** Total interruptions in the lesson (analytics + the founder's demo). */
  asksTotal: number;
  /** Quiz cursor within a quiz beat. */
  quizIndex: number;
  /** Quiz answers so far this lesson: correct / total. Feeds the recap. */
  quizCorrect: number;
  quizAnswered: number;
  /**
   * True for exactly one render after a RESUME that followed the FIRST
   * interruption of this beat. The classroom says the beat's resume line once
   * and then stops acknowledging (frames.ts explains why once, not always).
   */
  acknowledgeResume: boolean;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type LessonEvent =
  | { type: "START" }
  /** One utterance finished — the pause point. */
  | { type: "UTTERANCE_END" }
  /**
   * The student pressed СТОП.
   *
   * `atBoundary` says whether the current sentence has ALREADY been delivered.
   * A voiced teacher is mid-utterance when the hand goes up, so it finishes
   * the sentence and holds on UTTERANCE_END — that one-sentence wait is what a
   * real teacher finishing a thought does. A TEXT teacher has nothing in
   * flight: the sentence is fully on screen the instant it renders, so making
   * the student press „По-нататък" before being heard is not politeness, it is
   * a dead control. The caller knows which it is; the machine does not guess.
   */
  | { type: "HAND_RAISE"; atBoundary?: boolean }
  /** They changed their mind before typing anything. */
  | { type: "CANCEL_HAND" }
  /** A question was submitted (typed or a chip). */
  | { type: "ASK_SENT" }
  /**
   * The answer resolved. `debited` says whether it consumed the budgeted
   * model path — a board command or an authored answer does not, which is why
   * pressing „Покажи го пак" five times can never exhaust the beat's cap.
   */
  | { type: "ANSWER_READY"; debited: boolean }
  /** Back to the beat, from where it paused. */
  | { type: "RESUME" }
  /** Advance to the next beat (or finish). */
  | { type: "NEXT" }
  /** Step back one beat — a re-listen, not a restart of the lesson. */
  | { type: "BACK" }
  | { type: "QUIZ_ANSWERED"; correct: boolean }
  /** Dismiss the verdict; next quiz question or end of the quiz beat. */
  | { type: "QUIZ_NEXT" };

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createLessonPlayer(lessonId: string): LessonPlayerState {
  return {
    lessonId,
    phase: "ready",
    beatIndex: 0,
    utteranceIndex: 0,
    holdRequested: false,
    modelAsksInBeat: 0,
    asksInBeat: 0,
    asksTotal: 0,
    quizIndex: 0,
    quizCorrect: 0,
    quizAnswered: 0,
    acknowledgeResume: false,
  };
}

/** The beat the cursor is on, or null past the end. */
export function currentBeat(state: LessonPlayerState, lesson: Lesson): Beat | null {
  return lesson.beats[state.beatIndex] ?? null;
}

/**
 * May the student raise their hand right now? Everywhere except the quiz and
 * the two terminal screens. Deliberately permissive: „a clear STOP/ASK control
 * available at any moment during a beat" is the founder's requirement, and a
 * control that greys out mid-explanation is the one that will be complained
 * about. The quiz is the exception because the ДАИ exam is silent and a hint
 * mid-question is not a lesson, it is a leak.
 */
export function canRaiseHand(state: LessonPlayerState): boolean {
  return (
    (state.phase === "speaking" || state.phase === "beat-end") &&
    !state.holdRequested
  );
}

/** Has this beat spent its budgeted interruptions? */
export function modelAsksExhausted(state: LessonPlayerState): boolean {
  return state.modelAsksInBeat >= MAX_MODEL_ASKS_PER_BEAT;
}

export function teacherStateOf(state: LessonPlayerState): TeacherState {
  switch (state.phase) {
    case "speaking":
      return "speaking";
    case "held":
      return "listening";
    case "thinking":
      return "thinking";
    case "answering":
      return "answering";
    case "quiz":
      return "quizzing";
    case "ready":
    case "beat-end":
    case "finished":
      return "idle";
  }
}

/** 0..1 — how far through the lesson, for the progress rail. */
export function lessonProgress(state: LessonPlayerState, lesson: Lesson): number {
  if (lesson.beats.length === 0) return 1;
  if (state.phase === "finished") return 1;
  return Math.min(1, state.beatIndex / lesson.beats.length);
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

function enterBeat(
  state: LessonPlayerState,
  lesson: Lesson,
  index: number,
): LessonPlayerState {
  if (index >= lesson.beats.length) {
    return { ...state, phase: "finished", acknowledgeResume: false };
  }
  const beat = lesson.beats[index];
  return {
    ...state,
    beatIndex: index,
    utteranceIndex: 0,
    holdRequested: false,
    modelAsksInBeat: 0,
    asksInBeat: 0,
    quizIndex: 0,
    acknowledgeResume: false,
    // A quiz beat with no narration goes straight to the questions; one that
    // has a lead-in speaks it first and QUIZ is entered at beat-end → NEXT.
    phase: beat.say.length === 0 ? (beat.kind === "quiz" ? "quiz" : "beat-end") : "speaking",
  };
}

export function stepLesson(
  state: LessonPlayerState,
  event: LessonEvent,
  lesson: Lesson,
): LessonPlayerState {
  const beat = lesson.beats[state.beatIndex];

  switch (event.type) {
    case "START":
      if (state.phase !== "ready") return state;
      return enterBeat(state, lesson, 0);

    case "UTTERANCE_END": {
      if (state.phase !== "speaking" || beat === undefined) return state;
      // The hand went up mid-sentence: hold HERE, at the boundary, with the
      // cursor on the NEXT utterance so RESUME continues rather than repeats.
      const next = state.utteranceIndex + 1;
      if (state.holdRequested) {
        return {
          ...state,
          utteranceIndex: next,
          holdRequested: false,
          phase: "held",
          acknowledgeResume: false,
        };
      }
      if (next < beat.say.length) {
        return { ...state, utteranceIndex: next, acknowledgeResume: false };
      }
      return {
        ...state,
        utteranceIndex: next,
        acknowledgeResume: false,
        phase: beat.kind === "quiz" ? "quiz" : "beat-end",
      };
    }

    case "HAND_RAISE": {
      if (!canRaiseHand(state)) return state;
      // At a boundary already — beat-end, or a caller that has nothing in
      // flight — the teacher stops now; mid-sentence it finishes the sentence.
      if (state.phase === "beat-end" || event.atBoundary === true) {
        return { ...state, phase: "held", acknowledgeResume: false };
      }
      return { ...state, holdRequested: true };
    }

    case "CANCEL_HAND": {
      if (state.holdRequested && state.phase === "speaking") {
        return { ...state, holdRequested: false };
      }
      if (state.phase !== "held") return state;
      return resumeFrom(state, beat);
    }

    case "ASK_SENT":
      if (state.phase !== "held") return state;
      return { ...state, phase: "thinking" };

    case "ANSWER_READY": {
      if (state.phase !== "thinking") return state;
      return {
        ...state,
        phase: "answering",
        asksInBeat: state.asksInBeat + 1,
        asksTotal: state.asksTotal + 1,
        modelAsksInBeat: state.modelAsksInBeat + (event.debited ? 1 : 0),
      };
    }

    case "RESUME": {
      if (state.phase !== "answering" && state.phase !== "held") return state;
      return resumeFrom(state, beat);
    }

    case "NEXT": {
      if (
        state.phase === "ready" ||
        state.phase === "finished" ||
        state.phase === "thinking"
      ) {
        return state;
      }
      return enterBeat(state, lesson, state.beatIndex + 1);
    }

    case "BACK": {
      if (state.beatIndex === 0 || state.phase === "ready") return state;
      return enterBeat(state, lesson, state.beatIndex - 1);
    }

    case "QUIZ_ANSWERED": {
      if (state.phase !== "quiz") return state;
      return {
        ...state,
        quizAnswered: state.quizAnswered + 1,
        quizCorrect: state.quizCorrect + (event.correct ? 1 : 0),
      };
    }

    case "QUIZ_NEXT": {
      if (state.phase !== "quiz" || beat === undefined) return state;
      const next = state.quizIndex + 1;
      if (next < beat.questionCount) {
        return { ...state, quizIndex: next };
      }
      // The quiz never blocks: a wrong answer shows the why-panel and the
      // lesson continues (doc 84 §5.3). Gating progression on a correct answer
      // turns a lesson into an exam, and the product already has one of those.
      return { ...state, quizIndex: next, phase: "beat-end" };
    }
  }
}

function resumeFrom(
  state: LessonPlayerState,
  beat: Beat | undefined,
): LessonPlayerState {
  const delivered = beat === undefined || state.utteranceIndex >= beat.say.length;
  return {
    ...state,
    holdRequested: false,
    // Acknowledge ONCE per beat, after the FIRST answered question — see
    // frames.ts. A cancelled hand (asksInBeat 0) gets no line: nothing was
    // asked, so there is nothing to acknowledge.
    acknowledgeResume: state.asksInBeat === 1,
    phase: delivered ? (beat?.kind === "quiz" ? "quiz" : "beat-end") : "speaking",
  };
}
