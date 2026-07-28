/**
 * The player state machine — the founder's „can with buttons stop ask, during
 * the teacher explanations", pinned.
 *
 * Every assertion here is about a behaviour a PRE-RECORDED teacher cannot
 * have. A recording stops; this holds at a sentence boundary, keeps the board,
 * remembers the cursor, answers, and continues from the next sentence. That
 * difference is the whole reason the lesson is data and not footage, so it is
 * the thing that must never silently regress.
 */
import { describe, expect, it } from "vitest";
import {
  canRaiseHand,
  createLessonPlayer,
  currentBeat,
  lessonProgress,
  modelAsksExhausted,
  stepLesson,
  teacherStateOf,
  type LessonEvent,
  type LessonPlayerState,
} from "../player";
import { MAX_MODEL_ASKS_PER_BEAT } from "../types";
import type { Beat, Lesson } from "../types";

function beat(id: string, kind: Beat["kind"], lines: number, questionCount = 0): Beat {
  return {
    id,
    kind,
    tone: "explain",
    say: Array.from({ length: lines }, (_, i) => ({
      src: "concept" as const,
      conceptId: `c-${id}-${i}`,
    })),
    conceptIds: [`c-${id}`],
    questionIds: [],
    ruleCodes: [],
    signIds: [],
    board: null,
    questionCount,
  };
}

const LESSON: Lesson = {
  id: "l-test",
  sectionId: "s-test",
  topicId: "t-test",
  order: 1,
  titleBg: "Тест",
  topicTitleBg: "Тема",
  beats: [
    beat("b-open", "open", 1),
    beat("b1-explain", "explain", 3),
    beat("b1-quiz", "quiz", 1, 2),
    beat("b-recap", "recap", 1),
  ],
};

function run(events: LessonEvent[], from?: LessonPlayerState): LessonPlayerState {
  return events.reduce(
    (state, event) => stepLesson(state, event, LESSON),
    from ?? createLessonPlayer(LESSON.id),
  );
}

const START: LessonEvent[] = [{ type: "START" }];
/** Walk to the middle of the 3-line explain beat. */
const MID_EXPLAIN: LessonEvent[] = [
  ...START,
  { type: "UTTERANCE_END" }, // finishes b-open
  { type: "NEXT" },
  { type: "UTTERANCE_END" }, // finishes line 0 of b1-explain
];

describe("sequencing", () => {
  it("starts on the first beat and ends on the last", () => {
    const state = run(START);
    expect(state.phase).toBe("speaking");
    expect(currentBeat(state, LESSON)?.id).toBe("b-open");

    const done = run([
      ...START,
      { type: "NEXT" },
      { type: "NEXT" },
      { type: "NEXT" },
      { type: "NEXT" },
    ]);
    expect(done.phase).toBe("finished");
    expect(lessonProgress(done, LESSON)).toBe(1);
  });

  it("delivers a beat one utterance at a time and then waits", () => {
    let state = run(MID_EXPLAIN);
    expect(state.utteranceIndex).toBe(1);
    state = run([{ type: "UTTERANCE_END" }, { type: "UTTERANCE_END" }], state);
    expect(state.phase).toBe("beat-end");
  });

  it("enters the quiz when a quiz beat's lead-in is delivered", () => {
    const state = run([
      ...MID_EXPLAIN,
      { type: "UTTERANCE_END" },
      { type: "UTTERANCE_END" },
      { type: "NEXT" }, // → b1-quiz
      { type: "UTTERANCE_END" }, // the lead-in
    ]);
    expect(state.phase).toBe("quiz");
    expect(teacherStateOf(state)).toBe("quizzing");
  });

  it("steps BACK a beat without restarting the lesson", () => {
    const state = run([...MID_EXPLAIN, { type: "BACK" }]);
    expect(currentBeat(state, LESSON)?.id).toBe("b-open");
    expect(state.utteranceIndex).toBe(0);
  });
});

describe("the hand goes up at a sentence boundary", () => {
  it("keeps speaking until the current sentence ends", () => {
    // The interruption is requested mid-utterance. A real teacher finishes the
    // sentence; cutting mid-word is what makes software feel like software.
    let state = run([...MID_EXPLAIN, { type: "HAND_RAISE" }]);
    expect(state.phase).toBe("speaking");
    expect(state.holdRequested).toBe(true);
    expect(teacherStateOf(state)).toBe("speaking");

    state = run([{ type: "UTTERANCE_END" }], state);
    expect(state.phase).toBe("held");
    expect(teacherStateOf(state)).toBe("listening");
  });

  it("stops immediately when the caller has nothing in flight", () => {
    // The TEXT teacher: the sentence is fully on screen the instant it
    // renders, so there is nothing to finish. Making the student press
    // „По-нататък" before being heard would be a dead control, not politeness.
    const state = run([...MID_EXPLAIN, { type: "HAND_RAISE", atBoundary: true }]);
    expect(state.phase).toBe("held");
    expect(state.holdRequested).toBe(false);
  });

  it("stops immediately when the beat is already at a boundary", () => {
    const state = run([
      ...MID_EXPLAIN,
      { type: "UTTERANCE_END" },
      { type: "UTTERANCE_END" }, // → beat-end
      { type: "HAND_RAISE" },
    ]);
    expect(state.phase).toBe("held");
  });

  it("does not discard the beat — RESUME continues from the NEXT sentence", () => {
    // „The board dims but does not clear." Nothing in the interruption cycle
    // touches beatIndex; utteranceIndex only advances past the sentence that
    // was actually delivered.
    const before = run([...MID_EXPLAIN, { type: "HAND_RAISE" }, { type: "UTTERANCE_END" }]);
    expect(before.utteranceIndex).toBe(2);

    const after = run(
      [{ type: "ASK_SENT" }, { type: "ANSWER_READY", debited: true }, { type: "RESUME" }],
      before,
    );
    expect(after.phase).toBe("speaking");
    expect(after.beatIndex).toBe(before.beatIndex);
    expect(after.utteranceIndex).toBe(2);
  });

  it("acknowledges the FIRST interruption of a beat and then stops", () => {
    const first = run(
      [
        ...MID_EXPLAIN,
        { type: "HAND_RAISE" },
        { type: "UTTERANCE_END" },
        { type: "ASK_SENT" },
        { type: "ANSWER_READY", debited: false },
        { type: "RESUME" },
      ],
    );
    expect(first.acknowledgeResume).toBe(true);

    const second = run(
      [
        { type: "HAND_RAISE" },
        { type: "UTTERANCE_END" },
        { type: "ASK_SENT" },
        { type: "ANSWER_READY", debited: false },
        { type: "RESUME" },
      ],
      first,
    );
    expect(second.asksInBeat).toBe(2);
    expect(second.acknowledgeResume).toBe(false);
  });

  it("says nothing on a cancelled hand — nothing was asked", () => {
    const state = run([
      ...MID_EXPLAIN,
      { type: "HAND_RAISE" },
      { type: "UTTERANCE_END" },
      { type: "CANCEL_HAND" },
    ]);
    expect(state.phase).toBe("speaking");
    expect(state.acknowledgeResume).toBe(false);
    expect(state.asksInBeat).toBe(0);
  });

  it("refuses the hand during a quiz — the exam is silent", () => {
    const state = run([
      ...MID_EXPLAIN,
      { type: "UTTERANCE_END" },
      { type: "UTTERANCE_END" },
      { type: "NEXT" },
      { type: "UTTERANCE_END" },
    ]);
    expect(state.phase).toBe("quiz");
    expect(canRaiseHand(state)).toBe(false);
    expect(stepLesson(state, { type: "HAND_RAISE" }, LESSON)).toBe(state);
  });
});

describe("the per-beat interruption cap", () => {
  const ask = (debited: boolean): LessonEvent[] => [
    { type: "HAND_RAISE" },
    { type: "UTTERANCE_END" },
    { type: "ASK_SENT" },
    { type: "ANSWER_READY", debited },
    { type: "RESUME" },
  ];

  it("counts only the BUDGETED path — chips and board commands are free", () => {
    // Pressing „Покажи го пак" ten times must never exhaust the cap: it is a
    // player command, not a question, and it costs nothing to serve.
    let state = run(MID_EXPLAIN);
    for (let i = 0; i < 6; i++) state = run(ask(false), state);
    expect(state.asksInBeat).toBe(6);
    expect(state.modelAsksInBeat).toBe(0);
    expect(modelAsksExhausted(state)).toBe(false);
  });

  it("exhausts after MAX_MODEL_ASKS_PER_BEAT budgeted questions", () => {
    let state = run(MID_EXPLAIN);
    for (let i = 0; i < MAX_MODEL_ASKS_PER_BEAT; i++) state = run(ask(true), state);
    expect(modelAsksExhausted(state)).toBe(true);
  });

  it("resets on the next beat — the cap is per beat, not per lesson", () => {
    let state = run(MID_EXPLAIN);
    for (let i = 0; i < MAX_MODEL_ASKS_PER_BEAT; i++) state = run(ask(true), state);
    state = run([{ type: "NEXT" }], state);
    expect(state.modelAsksInBeat).toBe(0);
    expect(state.asksTotal).toBe(MAX_MODEL_ASKS_PER_BEAT);
  });
});

describe("the quiz never blocks", () => {
  const toQuiz: LessonEvent[] = [
    ...MID_EXPLAIN,
    { type: "UTTERANCE_END" },
    { type: "UTTERANCE_END" },
    { type: "NEXT" },
    { type: "UTTERANCE_END" },
  ];

  it("continues the lesson after a WRONG answer", () => {
    // Gating progression on a correct answer turns a lesson into an exam, and
    // the product already has one of those — 45 questions, 97 points, 40
    // minutes, defined by law.
    let state = run([...toQuiz, { type: "QUIZ_ANSWERED", correct: false }, { type: "QUIZ_NEXT" }]);
    expect(state.phase).toBe("quiz");
    expect(state.quizIndex).toBe(1);
    state = run([{ type: "QUIZ_ANSWERED", correct: false }, { type: "QUIZ_NEXT" }], state);
    expect(state.phase).toBe("beat-end");
    expect(state.quizAnswered).toBe(2);
    expect(state.quizCorrect).toBe(0);
  });
});

describe("determinism", () => {
  it("same state + same event ⇒ same next state", () => {
    const events: LessonEvent[] = [
      ...MID_EXPLAIN,
      { type: "HAND_RAISE" },
      { type: "UTTERANCE_END" },
      { type: "ASK_SENT" },
      { type: "ANSWER_READY", debited: true },
      { type: "RESUME" },
      { type: "NEXT" },
    ];
    expect(run(events)).toEqual(run(events));
  });

  it("ignores events that do not apply, rather than half-applying them", () => {
    const fresh = createLessonPlayer(LESSON.id);
    expect(stepLesson(fresh, { type: "RESUME" }, LESSON)).toBe(fresh);
    expect(stepLesson(fresh, { type: "UTTERANCE_END" }, LESSON)).toBe(fresh);
    expect(stepLesson(fresh, { type: "QUIZ_ANSWERED", correct: true }, LESSON)).toBe(fresh);
    expect(stepLesson(fresh, { type: "BACK" }, LESSON)).toBe(fresh);
  });
});
