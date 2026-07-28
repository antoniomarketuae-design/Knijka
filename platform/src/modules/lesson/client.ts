/**
 * lesson — the BROWSER half of the public API (docs/architecture/05).
 *
 * Guaranteed free of the content repo, the scenario catalogue, the rule
 * catalogue, Prisma and the simulator: everything here is pure types, pure
 * copy and a pure reducer. Client components — including everything the
 * classroom lane builds — import THIS, never `@/modules/lesson`, for the same
 * reason `@/modules/clips/view` exists: a re-export is a static edge whether
 * or not the symbol is called, and the classroom must not drag the simulator
 * into a phone's first paint.
 *
 * THE SEAM BETWEEN THE TWO LANES IS EXACTLY THIS FILE. The lesson engine owns
 * the beats, the phases and the rules; the classroom lane owns the teacher,
 * the board and the room. `TeacherState` is the whole contract between them:
 * the classroom renders a teacher for each of six states and never needs to
 * know what a beat is.
 */

export type {
  AskChip,
  Beat,
  BeatKind,
  BoardCommand,
  BoardSpec,
  ChipIntent,
  FrameLineId,
  FrameSlot,
  InterruptionAnswer,
  InterruptionSource,
  Lesson,
  LessonOutline,
  LessonQuizQuestion,
  LessonQuizVerdict,
  ResolvedBeat,
  ResolvedBoard,
  ResolvedTrace,
  ResolvedUtterance,
  SayRef,
  Tone,
} from "./types";

export {
  MAX_INTERRUPTION_LENGTH,
  MAX_MODEL_ASKS_PER_BEAT,
  QUIZ_QUESTIONS_PER_BEAT,
} from "./types";

// The player — pure, deterministic, node-testable.
export {
  canRaiseHand,
  createLessonPlayer,
  currentBeat,
  lessonProgress,
  modelAsksExhausted,
  stepLesson,
  teacherStateOf,
} from "./player";
export type { LessonEvent, LessonPhase, LessonPlayerState, TeacherState } from "./player";

// The classroom's own connective copy + the ask-chip labels.
export { CHIP_LABEL_BG, frameLine, resumeLineFor } from "./frames";

// Chip construction is pure, so a client surface can rebuild a beat's chips
// without a round trip (the server sends them on the resolved beat anyway).
export { chipsForBeat } from "./chips";
export type { ChipScope } from "./chips";
