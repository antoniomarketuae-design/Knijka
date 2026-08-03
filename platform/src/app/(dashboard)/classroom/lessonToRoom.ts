import "server-only";

/**
 * THE SEAM, CASHED IN.
 *
 * `app/(dashboard)/classroom/page.tsx` carried this note from 28 July:
 *
 *   „the lesson lane will replace `buildDemoLesson()` with a real authored
 *    lesson (and this route with `/classroom/[lessonId]`) without touching a
 *    single component under `components/classroom/`."
 *
 * This file is that replacement. It maps the lesson engine's output
 * (`@/modules/lesson` — 54 composed lessons, one per section, over all 16
 * topics) onto the room's contract (`components/classroom/types.ts`). Not one
 * component under `components/classroom/` changed shape to make it fit, which
 * is the property the two lanes were built for.
 *
 * WHAT IT DOES NOT DO, AND WHY THAT MATTERS MORE THAN WHAT IT DOES. It writes
 * no Bulgarian. Every sentence the teacher says here came out of `resolveBeat`,
 * which reads it verbatim from `content/concepts.json`, the scenario templates,
 * the rule catalogue or `frames.ts`. The mapping below moves strings; it never
 * makes one. That is the whole reason the room can be pointed at real content
 * on a Sunday afternoon without a content review.
 *
 * THE ONE STRUCTURAL DIFFERENCE BETWEEN THE TWO MODELS, and it is the reason
 * this file exists at all rather than being a type cast:
 *
 *   lesson engine   a beat has N UTTERANCES; an interruption lands on an
 *                   utterance boundary (types.ts: „one entry = one utterance =
 *                   one pause point").
 *   the room        a beat has ONE `sayBg`; the transcript prints it and the
 *                   player estimates its duration from its length.
 *
 * So one engine beat becomes N room beats — the pause points survive, the beat
 * pips in the header become the sentence count (which is what a student
 * actually wants to see moving), and a board beat's three sentences all keep
 * the SAME board object, so the replay is not remounted between them:
 * `LessonBoard` keys its canvas on the trace path, and the trace path does not
 * change. The teacher keeps talking while the board keeps playing, which is the
 * behaviour a classroom has and a slideshow does not.
 */

import {
  lessonById,
  resolveBeat,
  type AskChip as LessonAskChip,
  type Beat as LessonBeat,
  type BeatKind as LessonBeatKind,
  type Lesson,
  type ResolvedBeat,
  type ResolvedBoard,
  type Tone,
} from "@/modules/lesson";
import { scenarioById } from "@/modules/sim/lessons";
import type {
  AskChip,
  BeatTone,
  ClassroomBeat,
  ClassroomBoard,
  ClassroomLesson,
} from "@/components/classroom/types";

/**
 * Which engine beat each room beat came from.
 *
 * The room's handlers get a `ClassroomBeat`; the server actions
 * (`askTeacher`, `loadBeat`, `answerLessonQuiz`) want the ENGINE's beat id.
 * Rather than encoding one inside the other and parsing it back — a string
 * format is a contract nobody writes a test for — the mapping is returned
 * beside the lesson as data.
 */
export interface RoomLesson {
  lesson: ClassroomLesson;
  /** room beat id → engine beat id. */
  beatSource: Record<string, string>;
  /** Engine ids, for the actions. */
  lessonId: string;
  sectionId: string;
  order: number;
  totalLessons: number;
  topicTitleBg: string;
}

// ---------------------------------------------------------------------------
// Small, total mappings
// ---------------------------------------------------------------------------

/**
 * `praise` is the engine's recap register; the room's equivalent is
 * `reassure`. `ask` (a quiz lead-in) is delivered flat, not as a warning —
 * a quiz that arrives in the „Внимание" colour reads as a punishment, which is
 * the exact feeling THEO-4 exists to keep out of this product.
 */
const TONE: Record<Tone, BeatTone> = {
  explain: "explain",
  warn: "warn",
  praise: "reassure",
  ask: "explain",
};

/** `open` is an explain beat that happens to be first. The room has no fifth. */
const KIND: Record<LessonBeatKind, ClassroomBeat["kind"]> = {
  open: "explain",
  explain: "explain",
  board: "board",
  quiz: "quiz",
  recap: "recap",
};

/**
 * Engine chip → room chip.
 *
 * The two enums differ because they were designed for different jobs: the
 * engine says WHAT a chip means (`board` + `command`), the room says what
 * pressing it DOES to the room (`board-correct`). The id is carried through
 * untouched, because the id is what `askTeacher` resolves server-side to
 * decide which authored material answers it — a chip id is a promise about
 * grounding, and rewriting it would break the promise silently.
 *
 * `free` is dropped: `AskBar` already owns the free-text affordance
 * („Питай нещо друго…") and rendering a second one beside it is two buttons
 * for one action.
 */
function toRoomChip(chip: LessonAskChip): AskChip | null {
  if (chip.kind === "free") return null;
  if (chip.kind === "ask") {
    return { id: chip.id, labelBg: chip.labelBg, kind: "ask" };
  }
  switch (chip.command) {
    case "replay":
      return { id: chip.id, labelBg: chip.labelBg, kind: "board-replay" };
    case "show-correct":
      return { id: chip.id, labelBg: chip.labelBg, kind: "board-correct" };
    case "show-mistake":
      return { id: chip.id, labelBg: chip.labelBg, kind: "board-mistake" };
    // `slower` is in the engine's contract and is deliberately never emitted
    // (chips.ts explains: the canvas replay exposes no rate). If it ever is,
    // the room must grow a rate control before it grows a button for one.
    default:
      return null;
  }
}

/** „ЗДвП чл. 50а" from the first citation the utterance carries, or null. */
function lawRefBgOf(beat: ResolvedBeat, index: number): string | null {
  const refs = beat.utterances[index]?.lawRefs ?? [];
  const first = refs[0];
  return first === undefined ? null : `${first.act} ${first.ref}`;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * The engine's board → the room's PAIR.
 *
 * `ClassroomBoard` refuses to describe a one-sided board (its own doc comment:
 * „a board that cannot name both sides is not a board"). The engine's
 * `ResolvedBoard` is happy to be one-sided — `mode: "mistake"` is what it
 * degrades to when a template's shadow trace has not been recorded. Those two
 * positions are both right, and this is where they meet: a one-sided board
 * becomes NO board, and the beat plays as an explain beat with the sentence
 * still spoken. The student loses a diagram; they never see half a comparison
 * captioned as if it were one.
 *
 * In today's catalogue this branch is never taken — all 107 board beats across
 * the 54 lessons resolve to a full pair — but „never today" is not „never".
 */
function toRoomBoard(resolved: ResolvedBoard | null, raw: LessonBeat): ClassroomBoard | null {
  if (resolved === null) return null;
  // A sign board has no trace pair at all. compose.ts never emits one today;
  // when it does, the room needs a sign renderer, not a fabricated pair.
  if (resolved.mode === "sign") return null;
  const wrong = resolved.wrong;
  const right = resolved.right;
  if (wrong === undefined || right === undefined) return null;

  // The correct side's caption. `ResolvedTrace` carries only a title, so the
  // sentence under the right-hand take comes from the template's own stored
  // objective — the same field the demo lesson used, and the same one the
  // simulator briefs the drill with. Never composed here.
  const templateId =
    raw.board !== null && raw.board.mode !== "sign" ? raw.board.templateId : resolved.drill?.templateId;
  const spec = templateId === undefined ? undefined : scenarioById(templateId);

  return {
    templateId: templateId ?? "",
    districtId: wrong.districtId,
    correct: {
      tracePath: right.tracePath,
      titleBg: "Правилното изпълнение",
      captionBg: spec?.objectiveBg ?? right.titleBg,
    },
    mistake: {
      tracePath: wrong.tracePath,
      titleBg: wrong.titleBg,
      captionBg: wrong.whatWentWrongBg,
    },
    // THE BOARD OPENS ON THE MISTAKE, and that is not a taste call — it is
    // what the teacher just said. `frames.ts` „board-lead-in" is: „Сега гледай
    // дъската. Първо как се обърква — после натисни „Покажи правилното“." A
    // room that opened on the correct line would be contradicting the sentence
    // printed above it, and the chip the teacher tells the student to press
    // („Покажи правилното") is already on the ask bar.
    opensOn: "mistake",
    lawRefBg: spec?.teach.lawRef ?? null,
  };
}

// ---------------------------------------------------------------------------
// The lesson
// ---------------------------------------------------------------------------

/**
 * One engine lesson → one room lesson.
 *
 * Returns null when the id is unknown or when nothing in the lesson resolves,
 * so the route can 404 rather than render an empty room. A lesson whose
 * individual beats fail to resolve simply gets shorter: `resolveBeat` drops a
 * line whose id has moved rather than printing an empty bubble, and this
 * mapping inherits that.
 */
export function roomLessonFor(lessonId: string, totalLessons: number): RoomLesson | null {
  const lesson: Lesson | undefined = lessonById(lessonId);
  if (lesson === undefined) return null;

  const beats: ClassroomBeat[] = [];
  const beatSource: Record<string, string> = {};

  for (const raw of lesson.beats) {
    const resolved = resolveBeat(lesson.id, raw.id);
    if (resolved === null) continue;

    const board = toRoomBoard(resolved.board, raw);
    const chips = resolved.chips
      .map(toRoomChip)
      .filter((c): c is AskChip => c !== null)
      // A board chip on a beat whose pair did not survive `toRoomBoard` would
      // be a button pointing at nothing.
      .filter((c) => board !== null || c.kind === "ask");

    // A quiz beat with no sentences still has to exist — it is where the
    // questions are asked. Every other empty beat is dropped.
    const utterances =
      resolved.utterances.length > 0
        ? resolved.utterances
        : resolved.quiz
          ? [{ id: `${raw.id}:0`, textBg: "", lawRefs: [], frame: true }]
          : [];

    utterances.forEach((utterance, i) => {
      const id = `${raw.id}~${i}`;
      beatSource[id] = raw.id;
      beats.push({
        id,
        kind: KIND[resolved.kind],
        tone: TONE[resolved.tone],
        sayBg: utterance.textBg,
        sayRef: utterance.id,
        lawRefBg: lawRefBgOf(resolved, i),
        conceptIds: raw.conceptIds,
        board,
        // EVERY sentence carries the beat's chips, not just the last one.
        // „СТОП е жив във всеки момент на всеки такт" is the founder's whole
        // interruption model, and a student who raises their hand on sentence
        // one of three would otherwise get an ask bar with no questions on it.
        // There is no repetition cost: `AskBar` shows chips only once the hand
        // is actually up, so they are never on screen twice.
        ask: chips,
      });
    });
  }

  if (beats.length === 0) return null;

  return {
    lesson: {
      id: lesson.id,
      sectionId: lesson.sectionId,
      topicId: lesson.topicId,
      titleBg: lesson.titleBg,
      kickerBg: `${lesson.topicTitleBg} · урок ${lesson.order} от ${totalLessons}`,
      beats,
      // The sourcing lane has still not delivered a frame of footage (doc 84
      // §4.3). The room draws an unmistakable wireframe and says so on the
      // header; anything nicer here would be a lie with a face on it.
      teacher: { kind: "placeholder" },
      // NOT a placeholder any more: this lesson is composed from the same
      // reviewed corpus the practice runner and the exam grade against.
      isPlaceholder: false,
    },
    beatSource,
    lessonId: lesson.id,
    sectionId: lesson.sectionId,
    order: lesson.order,
    totalLessons,
    topicTitleBg: lesson.topicTitleBg,
  };
}
