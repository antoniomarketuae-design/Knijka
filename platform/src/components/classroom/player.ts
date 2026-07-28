/**
 * The classroom player — pure logic for „who is talking, for how long, and
 * what happens when the student raises their hand".
 *
 * No React, no DOM, no timers. Every rule the founder's description implies is
 * a function here so it can be argued with in a test instead of in a
 * component: the teacher pauses at a boundary rather than mid-word, the board
 * dims rather than clears, an interruption RESUMES the beat instead of
 * restarting it.
 */

import type { BeatTone, ClassroomBeat, TeacherState } from "./types";

// ---------------------------------------------------------------------------
// How long a beat takes
// ---------------------------------------------------------------------------

/**
 * Bulgarian speech rate used across the tutor docs: ~1,000 characters per
 * minute of narration (doc 84 §5.4 sizes the whole course with it).
 */
export const BG_CHARS_PER_MINUTE = 1000;

/** Nothing is on screen for less than this, however short the sentence. */
export const MIN_BEAT_SEC = 6;

/**
 * Nor for longer than this without the student being able to feel progress.
 * A board beat that outlives its 12-second reel by a minute reads as frozen.
 */
export const MAX_BEAT_SEC = 75;

/**
 * How long the teacher takes over a beat.
 *
 * `estSec` from the lesson lane wins when present — once the TTS manifest
 * exists the real audio duration is known and guessing from text is strictly
 * worse. Before that, the estimate is the text length at the documented
 * Bulgarian speech rate, plus a beat of dwell on the board so the student can
 * actually look at what is being talked about.
 */
export function beatDurationSec(beat: ClassroomBeat): number {
  if (typeof beat.estSec === "number" && Number.isFinite(beat.estSec) && beat.estSec > 0) {
    return clamp(beat.estSec, MIN_BEAT_SEC, MAX_BEAT_SEC);
  }
  const spoken = (beat.sayBg.length / BG_CHARS_PER_MINUTE) * 60;
  // A board beat is watched as well as heard: the reels average 12.2 s and the
  // trace replays loop, so give the eye a window that outlives one pass.
  const dwell = beat.board ? 8 : 0;
  return clamp(spoken + dwell, MIN_BEAT_SEC, MAX_BEAT_SEC);
}

/** Total lesson length, for the „≈ 5 мин" line on the header. */
export function lessonDurationSec(beats: readonly ClassroomBeat[]): number {
  return beats.reduce((sum, b) => sum + beatDurationSec(b), 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// Pausing at a sentence boundary
// ---------------------------------------------------------------------------

/**
 * Sentence boundaries within a beat, as fractions of its duration.
 *
 * Doc 84 §5.1 rule 1: *pause at the sentence boundary, not instantly*. Cutting
 * mid-word is what makes software feel like software. Until real per-utterance
 * audio exists, „the end of the sentence" is estimated the same way its
 * duration is — proportionally to the characters spoken so far.
 *
 * Returns fractions in (0, 1]; the final entry is always exactly 1.
 */
export function sentenceBoundaries(text: string): number[] {
  const total = text.length;
  if (total === 0) return [1];
  const out: number[] = [];
  // Bulgarian sentence enders, plus the ellipsis that the content bank uses.
  const re = /[.!?…](?:\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const frac = (m.index + 1) / total;
    if (frac > 0 && frac < 1) out.push(frac);
  }
  out.push(1);
  return out;
}

/**
 * The longest a raised hand may go unanswered while the teacher finishes the
 * sentence. Doc 84 §5.1: „worst case the student waits ~4 seconds — which is
 * exactly what a real teacher finishing a sentence does." Past that it stops
 * being politeness and starts being an unresponsive button.
 */
export const MAX_BOUNDARY_WAIT_SEC = 4.5;

/**
 * Where playback should actually stop, given the student raised their hand at
 * `atFrac` through a beat of `durationSec`.
 *
 * Never earlier than where they are (you cannot un-say a sentence) and never
 * more than `maxWaitSec` of wall clock away. The budget is in SECONDS, not in
 * fractions, because that is what the student feels: the same 20% of a beat is
 * a polite half-sentence in a 10-second beat and an ignored button in a
 * 60-second one.
 */
export function pauseAtBoundary(
  text: string,
  atFrac: number,
  durationSec: number,
  maxWaitSec = MAX_BOUNDARY_WAIT_SEC,
): number {
  const here = clamp(atFrac, 0, 1);
  const span = durationSec > 0 ? durationSec : MIN_BEAT_SEC;
  const maxWaitFrac = maxWaitSec / span;
  for (const b of sentenceBoundaries(text)) {
    if (b >= here) return b - here <= maxWaitFrac ? b : here;
  }
  return here;
}

// ---------------------------------------------------------------------------
// The teacher state machine
// ---------------------------------------------------------------------------

export type TeacherAction =
  | { type: "start" }
  | { type: "raise-hand" }
  | { type: "submit-question" }
  | { type: "answer-ready" }
  | { type: "resume" }
  | { type: "resumed" }
  | { type: "finish" };

/**
 * The transition table straight out of doc 84 §5.1, with one addition the doc
 * implies but does not draw: `resuming`, a short beat between the answer and
 * the lecture. It is not decoration — it is the difference between a teacher
 * picking the thread back up and a video file seeking.
 *
 * Unknown transitions are IDENTITY, never a throw: a double-tapped button must
 * not be able to break a lesson.
 */
export function teacherTransition(state: TeacherState, action: TeacherAction): TeacherState {
  switch (action.type) {
    case "start":
      return state === "idle" ? "speaking" : state;
    case "raise-hand":
      // Interruptible from anywhere the teacher holds the floor. Already
      // listening ⇒ stay listening (the hand is already up).
      return state === "speaking" || state === "answering" || state === "resuming"
        ? "listening"
        : state;
    case "submit-question":
      return state === "listening" ? "thinking" : state;
    case "answer-ready":
      return state === "thinking" ? "answering" : state;
    case "resume":
      return state === "listening" || state === "answering" ? "resuming" : state;
    case "resumed":
      return state === "resuming" ? "speaking" : state;
    case "finish":
      return "idle";
    default:
      return state;
  }
}

/** Is the lesson clock running? Only while the teacher actually lectures. */
export function isBeatAdvancing(state: TeacherState): boolean {
  return state === "speaking";
}

/**
 * Does the board dim? Doc 84 §5.1 rule 2: it dims but does NOT clear — the
 * student interrupted *about something*, and clearing it destroys the referent.
 */
export function isBoardDimmed(state: TeacherState): boolean {
  return state === "listening" || state === "thinking" || state === "answering";
}

/** Can the student type/tap a question right now? */
export function canAsk(state: TeacherState): boolean {
  return state !== "thinking" && state !== "idle";
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The state caption under the teacher. Deliberately terse and deliberately
 * NOT „както казвах" — doc 84: a synthetic acknowledgement said in the same
 * voice every single time is the fastest way to make a warm feature canned.
 */
export const TEACHER_STATE_BG: Record<TeacherState, string> = {
  idle: "Готов за урок",
  speaking: "Обяснява",
  listening: "Слуша те",
  thinking: "Мисли",
  answering: "Отговаря",
  resuming: "Продължава",
};

export const TONE_BG: Record<BeatTone, string> = {
  explain: "Обяснение",
  warn: "Внимание",
  reassure: "Спокойно",
};

/** Progress label — the thing the theory hub does not have today: a path. */
export function beatProgressBg(index: number, total: number): string {
  return `Част ${Math.min(index + 1, total)} от ${total}`;
}
