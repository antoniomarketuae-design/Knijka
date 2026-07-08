/**
 * In-sim micro-quiz trigger — the pure decision layer of the theory↔driving
 * closed loop (our wedge). While the student drives, the WORLD emits discrete
 * SimTickEvents (rules/types.ts): approaching a pedestrian crossing, crossing a
 * stop line, committing to a turn, an adjudicated priority situation. This
 * module maps those situations to a KNOWLEDGE-GRAPH CONCEPT and, subject to a
 * rate limit, picks a concept-linked question the student hasn't just seen —
 * so the drive quizzes the exact rule the road is testing right now, graded
 * against the SAME content + mastery as the theory app (learning.submitAnswer,
 * context "micro").
 *
 * PURE + DETERMINISTIC — zero DOM/DB/3D/randomness. Same state + same tick =>
 * same decision (mirrors the rule engine, ADR-002). The React shell keeps the
 * state in a ref, feeds it ticks, and shows the returned question in the
 * MicroQuiz overlay (pausing physics while it's up). The QUESTION BANK is
 * loaded once, server-side, from the content repo (see
 * src/app/(dashboard)/simulator/micro-quiz-actions.ts) and injected here —
 * this module never touches the repo, so it unit-tests against a synthetic bank.
 */

import type { SimTick, SimTickEvent } from "../rules";

// ---------------------------------------------------------------------------
// Difficulty setting — the student-facing quiz frequency
// ---------------------------------------------------------------------------

export type QuizFrequency = "off" | "occasional" | "frequent";

/** Rate-limit tuning per frequency. Determinism: no probability, just a gap. */
export interface QuizTuning {
  /** Minimum drive-seconds between two quizzes. */
  minGapSec: number;
  /** Hard cap on quizzes per session (keeps the drive a drive, not a test). */
  maxPerSession: number;
}

export const QUIZ_TUNING: Record<Exclude<QuizFrequency, "off">, QuizTuning> = {
  // "occasional" simply waits longer, so it deterministically fires on fewer of
  // the eligible situations — no randomness needed to feel less frequent.
  occasional: { minGapSec: 45, maxPerSession: 2 },
  frequent: { minGapSec: 25, maxPerSession: 4 },
};

// ---------------------------------------------------------------------------
// Question bank — the client-safe slice of a content Question (no `correct`
// flags; grading happens server-side via learning.submitAnswer, exactly like
// the theory practice flow, so answers never travel to the client).
// ---------------------------------------------------------------------------

export interface MicroQuizOption {
  id: string;
  textBg: string;
}

export interface MicroQuizQuestion {
  id: string;
  /** Knowledge-graph concepts this question exercises. */
  conceptIds: string[];
  type: "single" | "multi";
  textBg: string;
  options: MicroQuizOption[];
  /** Official exam weight (1|2|3). */
  points: 1 | 2 | 3;
}

/** A picked quiz, tagged with the concept the road situation targeted. */
export interface TriggeredQuiz extends MicroQuizQuestion {
  /** The knowledge-graph concept the triggering situation mapped to. */
  conceptId: string;
}

// ---------------------------------------------------------------------------
// Situation → concept mapping (the pedagogical heart of the closed loop)
// ---------------------------------------------------------------------------

/**
 * The concepts a road situation can quiz. Kept in one place so the server
 * action knows which questions to preload (union with the lesson's own
 * conceptIds). Every id here is a real content/concepts.json concept that owns
 * questions in /content/questions.
 */
export const QUIZ_TARGET_CONCEPT_IDS: readonly string[] = [
  "c-crosswalk-yield", // pedestrian crossings
  "c-give-way-stop-behavior", // stop sign / give way
  "c-traffic-light-signals", // signalized junctions
  "c-driver-signals", // turning / signalling
  "c-priority-concept", // right-of-way situations
];

/**
 * Map one discrete world event to the concept a contextual quiz should test.
 * The vision: "You are approaching this crossing — who has priority?" fires on
 * ZONE ENTRY (~25–30 m ahead), so the student answers while still deciding.
 * Returns null for events that carry no teachable priority/duty (collision,
 * mirror glances).
 */
export function conceptForEvent(event: SimTickEvent): string | null {
  switch (event.kind) {
    case "crossingZoneEntered":
    case "crossingPassed":
      return "c-crosswalk-yield";
    case "stopLineCrossed":
      return event.control === "stopSign"
        ? "c-give-way-stop-behavior"
        : "c-traffic-light-signals";
    case "turnStarted":
      return "c-driver-signals";
    case "prioritySituation":
      return "c-priority-concept";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Trigger state (pure, ref-resident in the shell)
// ---------------------------------------------------------------------------

export interface QuizTriggerState {
  frequency: QuizFrequency;
  /** Injected once; the trigger only reads it. */
  bank: readonly MicroQuizQuestion[];
  /** Quizzes shown so far this session. */
  shownCount: number;
  /** Drive-time of the last shown quiz; gates the min-gap rate limit. */
  lastQuizAtSec: number | null;
  /** Question ids already shown — never repeat within a session. */
  seenQuestionIds: readonly string[];
}

export function createQuizTriggerState(
  frequency: QuizFrequency,
  bank: readonly MicroQuizQuestion[],
): QuizTriggerState {
  return {
    frequency,
    bank,
    shownCount: 0,
    lastQuizAtSec: null,
    seenQuestionIds: [],
  };
}

export interface QuizTriggerResult {
  state: QuizTriggerState;
  /** The quiz to pop now (pause + overlay), or null if nothing should fire. */
  quiz: TriggeredQuiz | null;
}

/** First unseen question that exercises `conceptId`. Keeps quizzes on-topic. */
function pickQuestion(
  bank: readonly MicroQuizQuestion[],
  conceptId: string,
  seen: readonly string[],
): MicroQuizQuestion | null {
  const seenSet = new Set(seen);
  return (
    bank.find((q) => !seenSet.has(q.id) && q.conceptIds.includes(conceptId)) ?? null
  );
}

/**
 * Observe one SimTick and decide whether to pop a micro-quiz.
 *
 * Order of the gates (all deterministic):
 *  1. frequency "off"                    → never.
 *  2. session cap reached                → never again this session.
 *  3. inside the min-gap since last quiz → wait (rate limit).
 *  4. first tick event that maps to a concept WITH an unseen linked question
 *     → fire that question; advance the state (count++, gap clock, seen id).
 *  5. otherwise                          → nothing.
 *
 * The shell must not feed ticks while a quiz overlay is up (physics is paused),
 * so a fired quiz cannot re-fire on the same situation.
 */
export function observeQuizTick(
  state: QuizTriggerState,
  tick: SimTick,
): QuizTriggerResult {
  if (state.frequency === "off") return { state, quiz: null };
  const tuning = QUIZ_TUNING[state.frequency];

  if (state.shownCount >= tuning.maxPerSession) return { state, quiz: null };
  if (
    state.lastQuizAtSec !== null &&
    tick.t - state.lastQuizAtSec < tuning.minGapSec
  ) {
    return { state, quiz: null };
  }

  for (const event of tick.events) {
    const conceptId = conceptForEvent(event);
    if (conceptId === null) continue;
    const question = pickQuestion(state.bank, conceptId, state.seenQuestionIds);
    if (question === null) continue; // no on-topic unseen question — stay silent

    return {
      state: {
        ...state,
        shownCount: state.shownCount + 1,
        lastQuizAtSec: tick.t,
        seenQuestionIds: [...state.seenQuestionIds, question.id],
      },
      quiz: { ...question, conceptId },
    };
  }

  return { state, quiz: null };
}
