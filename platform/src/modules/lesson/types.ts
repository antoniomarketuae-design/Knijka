/**
 * lesson — the classroom's DATA MODEL. Client-safe: pure types + constants,
 * zero imports from the content repo or the simulator.
 *
 * THE SHAPE OF A LESSON. A lesson is a sequence of BEATS. A beat is one
 * indivisible thing the teacher does: say a thing, put a thing on the board,
 * or check that it landed. The player (player.ts) walks the beats; the
 * classroom shell renders whatever the current beat resolved to.
 *
 * THE LOAD-BEARING RULE — `say` IS A REFERENCE, NEVER A SENTENCE.
 * A beat may not carry Bulgarian prose about the road or the law. It carries
 * ids into corpora that have already been through the content pipeline
 * (content/SCHEMA.md: draft → needs-review → approved, human-only). resolve.ts
 * turns those ids into the STORED string, verbatim. Three consequences:
 *
 *   1. It is structurally impossible for a lesson file to contain an
 *      unreviewed claim about Bulgarian law — there is nowhere to put one.
 *      IT IS NOT IMPOSSIBLE FOR A BEAT TO SPEAK ONE. A reference is a promise
 *      about where the words come from, not about whether anybody read them,
 *      and `concepts.json` carries no `status` at all (content/SCHEMA.md). The
 *      corpus is checked at resolution time by modules/lesson/clearance.ts;
 *      read that file before assuming this list is a safety argument.
 *   2. A content fix in concepts.json propagates to every lesson that cites
 *      it, with no lesson edit and no re-render.
 *   3. ADR-002 is satisfied by construction on the whole playback path: no
 *      model is in the loop while the teacher is talking.
 *
 * The ONE exception is `SayFrame` — the classroom's own connective copy
 * („Днес говорим за…", „Сега гледай дъската."). Those lines are authored
 * constants in frames.ts, they carry no rule, no number and no article, and
 * their only variable is a slot filled from a STORED title. They are UI copy
 * of exactly the kind the rest of this codebase already keeps in TS (see
 * TUTOR_LIMIT_REPLY_BG, CORRECT_LEAD_IN_BG). A frame line that ever needed to
 * state a rule would be a bug in the lesson, not a reason to widen the type.
 */

import type { LawRef, QuestionMedia, SignMediaRef } from "@/lib/content/types";

// ---------------------------------------------------------------------------
// Tone — what phase 3 will animate against
// ---------------------------------------------------------------------------

/**
 * The teacher's register for a beat. It drives speech-area styling today and
 * TTS prosody / a drawn character later (doc 84 §3.2). It is on the schema
 * from day one precisely so that adding a face changes no lesson data.
 */
export type Tone = "explain" | "warn" | "praise" | "ask";

// ---------------------------------------------------------------------------
// say — references into the authored corpora
// ---------------------------------------------------------------------------

/** Ids of the classroom's own connective lines (frames.ts). */
export type FrameLineId =
  | "lesson-open"
  | "board-lead-in"
  | "board-correct-lead-in"
  | "quiz-lead-in"
  | "recap"
  | "next-up"
  | "resume-1"
  | "resume-2"
  | "resume-3"
  | "resume-4"
  | "opinion-frame"
  | "opinion-turnback"
  | "refuse-boundary"
  | "refuse-nearby"
  | "refuse-offer"
  | "withheld";

/** Where a frame line's single `{{slot}}` gets its (stored) text. */
export interface FrameSlot {
  kind: "topic" | "section" | "concept" | "scenario";
  id: string;
}

export type SayRef =
  /** concepts.json → summaryBg. The narration spine. */
  | { src: "concept"; conceptId: string }
  /** questions/*.json → explanationBg. How a teacher answers. */
  | { src: "question"; questionId: string }
  /** ScenarioSpec.mistakes[i].whatWentWrongBg — the board's caption. */
  | { src: "mistake"; templateId: string; mistakeIndex: number }
  /** ScenarioSpec.teach → whenBg | whyBg | examinerBg. */
  | { src: "teach"; templateId: string; field: "when" | "why" | "examiner" }
  /** rules/catalog.ts VIOLATIONS[code] → explanationBg | correctiveBg. */
  | { src: "rule"; code: string; field: "explanation" | "corrective" }
  /** signs.json → meaningBg. */
  | { src: "sign"; signId: string }
  /** topics.json → descriptionBg. */
  | { src: "topic"; topicId: string }
  /** The classroom's own connective copy — frames.ts, never a rule. */
  | { src: "frame"; lineId: FrameLineId; slot?: FrameSlot };

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * What goes on the board behind the teacher.
 *
 * `compare` is the founder's „correct ways and mistake/wrong ways" — it names
 * a template's mistake demo AND the template's shadow-correct trace, which
 * exists for every one of the 155 templates without exception. Both halves
 * are 134 KB traces, not 2.55 MB reels: the default renderer is the 2D canvas
 * (MistakeReplay), and a rendered .webm is an upgrade the media layer applies
 * only where the manifest already has one (doc 84 §6.2).
 */
export type BoardSpec =
  | {
      mode: "compare";
      templateId: string;
      mistakeIndex: number;
    }
  | {
      mode: "mistake";
      templateId: string;
      mistakeIndex: number;
    }
  | { mode: "sign"; signId: string };

/** A board-control chip is a player command. It never costs a model call. */
export type BoardCommand = "replay" | "slower" | "show-correct" | "show-mistake";

// ---------------------------------------------------------------------------
// Ask chips — the founder's „with buttons stop ask"
// ---------------------------------------------------------------------------

/**
 * What a chip is asking for. The intent picks the AUTHORED material that
 * answers it, deterministically and with no model call (interrupt.ts):
 *
 *   why      → the concept summary / the rule's explanation — „защо е така"
 *   how      → the rule's correctiveBg — „какво трябваше да направя"
 *   exam     → the rule's severity + points — „какво ти струва на изпита"
 *   law      → the material's lawRefs — „кой член го казва"
 *   opinion  → the founder's explicit ask: the teacher's own view. Answered
 *              from correctiveBg (an authored stance about DRIVING) inside an
 *              opinion frame, and it hands the question back to the student.
 *              Never a stance about the LAW — see interrupt.ts.
 */
export type ChipIntent = "why" | "how" | "exam" | "law" | "opinion";

export type AskChip =
  | { kind: "ask"; id: string; labelBg: string; intent: ChipIntent }
  | { kind: "board"; id: string; labelBg: string; command: BoardCommand }
  | { kind: "free"; id: string; labelBg: string };

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

export type BeatKind = "open" | "explain" | "board" | "quiz" | "recap";

export interface Beat {
  id: string;
  kind: BeatKind;
  tone: Tone;
  /**
   * What the teacher says, in order. One entry = one utterance = one pause
   * point. Interruption lands on an utterance BOUNDARY, never mid-sentence
   * (player.ts) — which is what a real teacher finishing a sentence does.
   */
  say: SayRef[];
  /** Knowledge-graph concepts in scope. Drives quiz scope AND Tier-1 grounding. */
  conceptIds: string[];
  /** Questions whose stored explanations are Tier-1 material for this beat. */
  questionIds: string[];
  /** Rule-catalog ViolationCodes in scope (the authored „opinions"). */
  ruleCodes: string[];
  /** Sign codes in scope. */
  signIds: string[];
  board: BoardSpec | null;
  /** How many bank questions this beat deals. 0 for non-quiz beats. */
  questionCount: number;
}

export interface Lesson {
  /** "l-" + the section id's stem, e.g. "l-basics-safety". */
  id: string;
  sectionId: string;
  topicId: string;
  /** 1-based position in the whole 54-lesson course. */
  order: number;
  /** STORED section title (sections.json) — a heading, not narration. */
  titleBg: string;
  /** STORED topic title (topics.json). */
  topicTitleBg: string;
  beats: Beat[];
}

// ---------------------------------------------------------------------------
// Resolved payloads — the contract with the classroom shell
// ---------------------------------------------------------------------------

/** One utterance, resolved to the stored string it references. */
export interface ResolvedUtterance {
  /** Stable id: `${beatId}:${index}`. */
  id: string;
  /** The STORED text, verbatim (or a frames.ts line). */
  textBg: string;
  /** Citations attached to the material this line came from. */
  lawRefs: LawRef[];
  /** True for frames.ts connective copy — never a claim about the road. */
  frame: boolean;
}

export interface ResolvedTrace {
  /** Public URL under /traces/… (traceUrlForRepoPath). */
  tracePath: string;
  /** District under public/world/ — the canvas replay's home map. */
  districtId: string;
  titleBg: string;
}

export interface ResolvedBoard {
  mode: BoardSpec["mode"];
  /** The demonstrated WRONG way. Absent for `sign`. */
  wrong?: ResolvedTrace & { whatWentWrongBg: string };
  /**
   * The shadow-correct trace — the RIGHT way. Present for `compare` only.
   * Every template has one; that is what makes „correct vs wrong" affordable.
   */
  right?: ResolvedTrace;
  sign?: {
    code: string;
    nameBg: string;
    meaningBg: string;
    svgFile: string;
    lawRefs: LawRef[];
  };
  /** „Виж го в симулатора" target, when the board is a scenario. */
  drill?: { templateId: string; level: number; titleBg: string };
}

/** Everything the classroom needs to render ONE beat. Fetched per beat. */
export interface ResolvedBeat {
  lessonId: string;
  beatId: string;
  /** 0-based index in the lesson. */
  index: number;
  kind: BeatKind;
  tone: Tone;
  utterances: ResolvedUtterance[];
  board: ResolvedBoard | null;
  chips: AskChip[];
  /** True when this beat deals quiz questions (fetched separately). */
  quiz: boolean;
}

/**
 * The lesson's skeleton: tiny (ids and counts, no Bulgarian, no media), safe
 * to send with the page.
 *
 * `sayCount` and `questionCount` are here because the PLAYER needs them and
 * the player runs on the client. A reducer that does not know how many
 * sentences the next beat has cannot know whether entering it means „start
 * speaking" or „this beat has nothing to say" — and a client that guesses
 * zero silently skips beats. Two integers per beat buy the state machine the
 * truth without shipping a single character of the lesson ahead of time.
 */
export interface LessonOutline {
  lessonId: string;
  titleBg: string;
  topicTitleBg: string;
  sectionId: string;
  order: number;
  totalLessons: number;
  beats: Array<{
    id: string;
    kind: BeatKind;
    tone: Tone;
    /** Utterances this beat will resolve to — the pause points. */
    sayCount: number;
    /** Questions this beat will actually deal (0 for non-quiz beats). */
    questionCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Quiz payloads
// ---------------------------------------------------------------------------

/**
 * A quiz question as the client may see it — no `correct` flags, ever.
 *
 * THE MEDIA FIELDS ARE LOAD-BEARING, NOT DECORATION (THEO-1).
 *
 * This DTO used to be `{questionId, conceptId, type, points, textBg, options:
 * Array<{id, textBg}>}` and nothing else, and the two things it left out are
 * the two things eighty-one bank questions ARE:
 *
 *  - `media` — the sign face or the scene still the question is asking about
 *    („Кой е знакът на снимката?", „На схемата кой минава пръв?"). Dropping it
 *    leaves a question about a picture with no picture.
 *  - `options[].media` — the „Кой от показаните знаци…" comparison shape, where
 *    the ordered set of signs IS the option list (content/SCHEMA.md). The four
 *    captions are „Знак 1 / Знак 2 / Знак 3 / Знак 4"; without the faces they
 *    are interchangeable and the question is not hard, it is unanswerable.
 *
 * This is the SAME defect the simulator's micro-quiz had (L1, quiz-trigger.ts
 * `isQuizMediaRenderable`) and the exam DTO already avoids (ExamQuestion /
 * ExamQuestionOption). A sign CODE leaks nothing — it is what the student is
 * being asked to look at — so carrying it costs no answer safety.
 */
export interface LessonQuizQuestion {
  questionId: string;
  conceptId: string;
  type: "single" | "multi";
  points: 1 | 2 | 3;
  textBg: string;
  /** The artwork the question is ABOUT, drawn above its text. */
  media: QuestionMedia | null;
  /** In THIS beat's deterministic order. Resolve answers by id, never index. */
  options: Array<{ id: string; textBg: string; media?: SignMediaRef }>;
}

/**
 * The verdict. THEO-4: there is no bare „грешно" anywhere in this shape —
 * `explanationBg` is the question's stored explanation and `board` is the
 * wired mistake replay, which is where a wrong answer sends the student
 * instead of a re-explanation (doc 84 §5.3).
 */
export interface LessonQuizVerdict {
  questionId: string;
  correct: boolean;
  correctOptionIds: string[];
  explanationBg: string;
  lawRefs: LawRef[];
  /** Per-option rationale where the bank has it (QuestionOption.whyWrongBg). */
  optionWhyBg: Array<{ optionId: string; whyBg: string }>;
  board: ResolvedBoard | null;
  masteryBefore: number;
  masteryAfter: number;
}

// ---------------------------------------------------------------------------
// Interruption payloads
// ---------------------------------------------------------------------------

/**
 * Where an answer came from. This is a product-visible distinction, not an
 * implementation detail:
 *
 *   board      — a player command. $0, instant, no model, no debit.
 *   authored   — a STORED material served verbatim inside a frame. $0,
 *                instant, ADR-002-clean by construction, and it works with no
 *                API key at all. Most chip presses land here.
 *   model      — the one budgeted path (tutor.askTutor), with the beat's own
 *                materials injected as Tier-1 grounding.
 *   refusal    — nothing in scope covers it. Constructive, never bare (§2.3).
 *   capped     — the per-beat interruption ceiling. Also constructive.
 */
export type InterruptionSource =
  | "board"
  | "authored"
  | "model"
  | "refusal"
  | "capped";

export interface InterruptionAnswer {
  source: InterruptionSource;
  /** What the teacher says back. Stored material or authored frame copy. */
  bodyBg: string;
  citations: LawRef[];
  /** Set when the answer is a board command rather than speech. */
  boardCommand?: BoardCommand;
  /**
   * „А ти какво мислиш?" — the teacher handing the question back. Present on
   * opinion answers, because turning it around is the technique, not a dodge
   * (doc 84 §2.4).
   */
  turnBackBg?: string;
  /** A real destination the student can press when we cannot answer. */
  offer?: { labelBg: string; href: string };
  /** True when this interruption consumed one of the student's questions. */
  debited: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Interruptions per BEAT, not per lesson (doc 84 §6.4). A per-beat cap is
 * pedagogically honest — a student stuck on beat 2 for ten questions needs a
 * different lesson, not more answers — where a per-lesson cap is just a wall.
 * Board commands and authored answers do NOT count against it; only the
 * budgeted model path does.
 */
export const MAX_MODEL_ASKS_PER_BEAT = 3;

/** Max characters accepted for a typed interruption. Matches the tutor's. */
export const MAX_INTERRUPTION_LENGTH = 500;

/** Questions a quiz beat deals. Two is a check; five is an exam. */
export const QUIZ_QUESTIONS_PER_BEAT = 2;
