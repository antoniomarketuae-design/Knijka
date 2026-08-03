/**
 * The classroom contract — „Учителят в класната стая" (docs/ai/84).
 *
 * THIS FILE IS THE SEAM between the two lanes building the AI teacher:
 *
 *   • the LESSON lane produces a `ClassroomLesson` (beats, board picks,
 *     resolved Bulgarian copy, question chips, and — later — the tutor answer
 *     path and the mini-quiz);
 *   • the CLASSROOM lane (this folder) consumes one and renders the room:
 *     the teacher slot, the board behind them, the transcript, the ask bar.
 *
 * Nothing in `src/components/classroom/` may reach past this file for lesson
 * data. Nothing outside it needs to know how the room is laid out. If the two
 * lanes disagree, they disagree HERE, in one file, in types — not at runtime.
 *
 * THREE RULES THE TYPES ENFORCE, all inherited and none negotiable:
 *
 * 1. **`sayBg` is stored copy, verbatim.** Doc 84 §5.2's rule is „`sayRef` is
 *    an id, never a string" — a beat must not be able to carry an unreviewed
 *    Bulgarian sentence. The surface, however, has to PRINT the sentence (the
 *    transcript is the whole reason this works before a voice exists), so the
 *    resolution is: the lesson lane resolves the id against the content bank
 *    on the server and hands the room the resolved text plus its provenance
 *    id. `sayBg` MUST be a verbatim string from `content/` or
 *    `modules/sim/rules/catalog.ts`; `sayRef` MUST say where it came from.
 *    The room never generates, never paraphrases, never truncates it.
 *
 * 2. **A citation is a feature, not a gate.** Where a beat states a rule of
 *    Bulgarian law and the content bank already carries the reference, it
 *    travels on the beat as `lawRefBg` („ЗДвП чл. 119") and the room prints
 *    it next to the teacher. Absent = printed nothing. Never invented.
 *
 * 3. **The board is a PAIR.** `ClassroomBoard` always names both the correct
 *    line and the mistake, because the founder's board is „correct ways and
 *    mistake/wrong ways" shown together — never two unrelated clips. Every
 *    one of the 155 scenario templates has a `shadow-correct.trace.json`, so
 *    the pair is always constructible; a board that cannot name both sides is
 *    not a board and the type refuses to describe one.
 */

// ---------------------------------------------------------------------------
// The teacher
// ---------------------------------------------------------------------------

/**
 * What the teacher is doing right now. The founder's design has the student
 * stopping the teacher mid-explanation, so „being interrupted" is a state the
 * figure is IN, not an event that happens to a video element.
 *
 *   idle       — the lesson has not started, or it has finished.
 *   speaking   — delivering the current beat.
 *   listening  — the student raised their hand; the teacher has stopped at the
 *                end of the sentence and is waiting. The board DIMS but never
 *                clears (doc 84 §5.1: the student interrupted about something).
 *   thinking   — a question is in flight.
 *   answering  — delivering the answer to the interruption.
 *   resuming   — the half-second of picking the thread back up before
 *                `speaking` continues from where it paused. It exists as its
 *                own state because a cut straight from an answer back to the
 *                lecture is the thing that makes a recording feel like a file.
 *   quizzing   — a mini-question is up and the teacher is waiting on the
 *                STUDENT. It was missing, and the caption under the figure
 *                therefore read „Обяснява" while a question sat on the board
 *                and the lesson clock was stopped: the room was describing a
 *                teacher who was talking, over a silent room with a form in
 *                it. The engine already had the state (`quiz` beats hold the
 *                room until they are answered); this enum did not.
 */
export type TeacherState =
  | "idle"
  | "speaking"
  | "listening"
  | "thinking"
  | "answering"
  | "resuming"
  | "quizzing";

/**
 * Where the teacher's picture comes from — deliberately swappable, because at
 * the time this room was built nobody had shot a frame of footage yet.
 *
 *   placeholder — a wireframe stand-in that is UNMISTAKABLY unfinished. This
 *                 is the shipping default and it must never be mistaken for a
 *                 finished teacher, so it is drawn as an outline with a label
 *                 on it, not as a nice illustration of a person.
 *   video       — one short loop per state (the sourcing lane's output: a
 *                 rendered/filmed presenter, lip-synced to Bulgarian audio).
 *                 Loops are per-STATE, not per-lesson: a talking loop, an
 *                 attentive listening loop, a beat of resuming.
 *   frames      — the same states as still-image sequences, for the case where
 *                 video-per-state is too heavy for Bulgarian mobile data.
 *
 * Every variant carries `posterSrc`: the frame painted before anything loads.
 */
export type TeacherSource =
  | { kind: "placeholder" }
  | {
      kind: "video";
      /** Per-state loop. A missing state falls back to `idle`, then poster. */
      loops: Partial<Record<TeacherState, string>>;
      posterSrc?: string;
      /** Human-readable provenance, printed in the dev banner. */
      creditBg?: string;
    }
  | {
      kind: "frames";
      /** Per-state frame list, played at `fps`. Missing state ⇒ `idle`. */
      sequences: Partial<Record<TeacherState, readonly string[]>>;
      fps: number;
      posterSrc?: string;
      creditBg?: string;
    };

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/** Which half of the pair the board is showing. */
export type BoardSide = "correct" | "mistake";

/** One half of the pair: a recorded trace, its title, and its stored caption. */
export interface ClassroomBoardTake {
  /**
   * PUBLIC url of the recorded trace, e.g.
   * "/traces/sc-zebra-approach/shadow-correct.trace.json".
   * Use `traceUrlForRepoPath` (`@/modules/clips/view`) to convert the
   * repo-relative `content/traces/…` path the scenario spec carries.
   */
  tracePath: string;
  /** Short label on the board tab, e.g. „Така е правилно". */
  titleBg: string;
  /**
   * The stored explanation for THIS take, verbatim — for the mistake side that
   * is the spec's `whatWentWrongBg`; for the correct side, the spec's
   * `objectiveBg` or the concept summary. Never generated.
   */
  captionBg: string;
}

/**
 * A correct/wrong pair on the board, both drawn from the SAME scenario
 * template so they are the same road, the same junction, the same camera —
 * which is the only way the comparison teaches anything.
 */
export interface ClassroomBoard {
  /** Scenario template id, e.g. "sc-zebra-approach". */
  templateId: string;
  /** District under `public/world/`, e.g. "zb-v1" — both takes share it. */
  districtId: string;
  correct: ClassroomBoardTake;
  mistake: ClassroomBoardTake;
  /** Which side the beat opens on. A teacher usually shows right, then wrong. */
  opensOn: BoardSide;
  /** e.g. „ЗДвП чл. 119". Absent when the bank has no reference. */
  lawRefBg?: string | null;
}

// ---------------------------------------------------------------------------
// The lesson
// ---------------------------------------------------------------------------

/**
 * What the beat is for. Drives the room's composition, not just its colour:
 * an `explain` beat gives the teacher the stage and shrinks the board, a
 * `board` beat does the opposite.
 */
export type BeatKind = "explain" | "board" | "quiz" | "recap";

/** Delivery colour. Styling today; prosody, and later a face, tomorrow. */
export type BeatTone = "explain" | "warn" | "reassure";

/**
 * One authored question chip. `kind` decides whether pressing it costs money:
 * `board` chips are pure UI (replay it, show me the correct line) and never
 * reach a model; `ask` chips go to the tutor lane's grounded path.
 */
export interface AskChip {
  id: string;
  labelBg: string;
  kind: "ask" | "board-replay" | "board-correct" | "board-mistake";
}

/** A beat: the unit the teacher speaks, and the unit an interruption pauses. */
export interface ClassroomBeat {
  id: string;
  kind: BeatKind;
  tone: BeatTone;
  /** RULE 1 above: verbatim stored Bulgarian. The transcript prints this. */
  sayBg: string;
  /** Provenance of `sayBg` — e.g. "c-crosswalk-yield:summaryBg". */
  sayRef?: string;
  /** RULE 2 above: printed when present, never invented. */
  lawRefBg?: string | null;
  conceptIds?: readonly string[];
  /** RULE 3 above: present on `board` beats, null everywhere else. */
  board?: ClassroomBoard | null;
  /** Authored chips for THIS beat (doc 84 §5.1: 2–4, written for the beat). */
  ask?: readonly AskChip[];
  /**
   * How long the teacher takes over this beat, seconds. The lesson lane
   * computes it from the TTS manifest once audio exists; before that the room
   * estimates it from the text (see `beatDurationSec`).
   */
  estSec?: number;
}

/** A section-sized lesson — doc 84 §5.4: 54 of these, not 16. */
export interface ClassroomLesson {
  id: string;
  sectionId: string;
  topicId: string;
  titleBg: string;
  /** e.g. „Уязвими участници · урок 3 от 54". */
  kickerBg?: string;
  beats: readonly ClassroomBeat[];
  teacher: TeacherSource;
  /**
   * True while the lesson is a hand-built demo rather than authored content.
   * The room prints a visible banner when set — a placeholder that does not
   * announce itself is a lie waiting to reach a founder review.
   */
  isPlaceholder?: boolean;
}

// ---------------------------------------------------------------------------
// What the room asks of the lesson lane
// ---------------------------------------------------------------------------

/** The answer to an interruption, resolved by the tutor lane. */
export interface AskAnswer {
  /** Grounded answer text. Stored or model-rephrased-over-retrieval only. */
  bodyBg: string;
  /** Citation chips, e.g. ["ЗДвП чл. 119"]. Whitelisted upstream. */
  citationsBg?: readonly string[];
  /**
   * „А ти как би постъпил?" — the teacher handing the question back after an
   * opinion. The founder asked for the teacher to have a view BY NAME, and the
   * turn-back is the technique that keeps it teaching instead of pronouncing
   * (doc 84 §2.4). It is a separate field rather than two sentences glued into
   * `bodyBg` because it is delivered differently: it is the teacher looking up
   * from the board, and the room paints it as such.
   */
  turnBackBg?: string | null;
  /**
   * A real destination offered when the teacher cannot answer inside this
   * lesson. THEO-4 forbids a bare verdict; „не знам" with nowhere to go is a
   * bare verdict about the product instead of about the student.
   */
  offer?: { labelBg: string; href: string } | null;
}

/**
 * Everything the room needs that it does not own. All optional: the room is
 * fully operable — and screenshot-able — with none of it wired, which is the
 * property that let the two lanes ship in parallel.
 */
export interface ClassroomHandlers {
  /**
   * Answer an interruption. Absent ⇒ the ask bar still works and the teacher
   * still transitions speaking → listening → resuming, but the answer panel
   * says plainly that the tutor is not connected yet.
   *
   * `chipId` is the id of the chip that was pressed, or null for free text.
   * It is not a convenience: a chip id is a PROMISE about which authored
   * material answers it, resolved server-side (`chips.ts`), and an answer that
   * arrives without one has to be routed by matching the label — which is how
   * a $0 authored answer quietly becomes a billed model call.
   */
  onAsk?: (
    question: string,
    beat: ClassroomBeat,
    chipId: string | null,
  ) => Promise<AskAnswer>;
  /** Progress reporting (mastery, „урок 3 от 54"). */
  onBeatComplete?: (beatId: string, index: number) => void;
  onLessonComplete?: (lessonId: string) => void;
}
