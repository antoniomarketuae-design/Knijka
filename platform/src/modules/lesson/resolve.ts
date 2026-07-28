/**
 * Beat ids → the STORED strings, verbatim.
 *
 * This is the file where the „`say` is a reference, never a sentence" rule is
 * cashed in. Every branch below is a lookup into a corpus that went through
 * content/SCHEMA.md's draft → needs-review → approved pipeline (or, for the
 * scenario and rule catalogues, through the founder review that authored
 * them). Nothing here paraphrases, summarises, joins or rewrites: the string
 * that comes out is the string that was reviewed. The one exception is
 * frames.ts, and frames.ts explains at length why it is allowed to exist.
 *
 * It is also the BANDWIDTH boundary. `resolveBeat` returns exactly one beat.
 * The lesson's outline (`resolveOutline`) is a list of ids and kinds and
 * weighs almost nothing; the beat payload — a couple of hundred characters of
 * Bulgarian plus two trace URLs — is fetched when the student reaches it and
 * never before. Nothing in this module returns a whole lesson's media, and
 * nothing prefetches the next lesson. These are teenagers on Bulgarian mobile
 * data and the bytes per lesson are the number that decides the design.
 *
 * SERVER/BUILD ONLY (content repo + scenario catalogue + rule catalogue).
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef, Sign } from "@/lib/content/types";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import { scenarioById } from "@/modules/sim/lessons";
import { VIOLATIONS } from "@/modules/sim/rules";
import { parseCatalogLawRef } from "@/modules/tutor";
import { chipsForBeat } from "./chips";
import { allLessons, lessonById } from "./compose";
import { frameLine } from "./frames";
import { lessonNarration } from "./narration";
import { beatQuizCount } from "./session";
import type {
  Beat,
  FrameSlot,
  Lesson,
  LessonOutline,
  ResolvedBeat,
  ResolvedBoard,
  ResolvedUtterance,
  SayRef,
} from "./types";

const NO_REFS: LawRef[] = [];

function signByCode(code: string): Sign | undefined {
  return getContentRepo()
    .signs()
    .find((s) => s.code === code);
}

/**
 * „ЗДвП чл. 40" → [{act, ref}], or [] when the string carries no reference
 * token. The parse is the TUTOR's (parseCatalogLawRef), deliberately: a
 * citation chip in a lesson and a citation chip in the chat must resolve one
 * article to one source, and the way to guarantee that is to have one parser.
 */
function catalogRefs(raw: string): LawRef[] {
  const parsed = parseCatalogLawRef(raw);
  return parsed === null ? NO_REFS : [parsed];
}

/** One `SayRef` → the stored text plus whatever citations ride with it. */
function resolveSay(
  ref: SayRef,
  lesson: Lesson,
): { textBg: string; lawRefs: LawRef[]; frame: boolean } | null {
  const repo = getContentRepo();

  switch (ref.src) {
    case "concept": {
      const concept = repo.conceptById(ref.conceptId);
      if (concept === undefined) return null;
      return { textBg: concept.summaryBg, lawRefs: concept.lawRefs, frame: false };
    }
    case "question": {
      const question = repo.questionById(ref.questionId);
      if (question === undefined) return null;
      return { textBg: question.explanationBg, lawRefs: question.lawRefs, frame: false };
    }
    case "mistake": {
      const spec = scenarioById(ref.templateId);
      const mistake = spec?.mistakes[ref.mistakeIndex];
      if (mistake === undefined) return null;
      return { textBg: mistake.whatWentWrongBg, lawRefs: NO_REFS, frame: false };
    }
    case "teach": {
      const spec = scenarioById(ref.templateId);
      if (spec === undefined) return null;
      const textBg =
        ref.field === "when"
          ? spec.teach.whenBg
          : ref.field === "why"
            ? spec.teach.whyBg
            : spec.teach.examinerBg;
      return { textBg, lawRefs: catalogRefs(spec.teach.lawRef), frame: false };
    }
    case "rule": {
      const spec = Object.hasOwn(VIOLATIONS, ref.code)
        ? VIOLATIONS[ref.code as keyof typeof VIOLATIONS]
        : undefined;
      if (spec === undefined) return null;
      return {
        textBg: ref.field === "explanation" ? spec.explanationBg : spec.correctiveBg,
        lawRefs: catalogRefs(spec.lawRef),
        frame: false,
      };
    }
    case "sign": {
      const sign = signByCode(ref.signId);
      if (sign === undefined) return null;
      return { textBg: sign.meaningBg, lawRefs: sign.lawRefs, frame: false };
    }
    case "topic": {
      const topic = repo.topics().find((t) => t.id === ref.topicId);
      if (topic === undefined) return null;
      return { textBg: topic.descriptionBg, lawRefs: NO_REFS, frame: false };
    }
    case "frame": {
      return {
        textBg: frameLine(ref.lineId, slotText(ref.slot, lesson)),
        lawRefs: NO_REFS,
        frame: true,
      };
    }
  }
}

function slotText(slot: FrameSlot | undefined, lesson: Lesson): string | undefined {
  if (slot === undefined) return undefined;
  const repo = getContentRepo();
  switch (slot.kind) {
    case "section":
      return repo.sectionById?.(slot.id)?.titleBg ?? lesson.titleBg;
    case "topic":
      return repo.topics().find((t) => t.id === slot.id)?.titleBg;
    case "concept":
      return repo.conceptById(slot.id)?.titleBg;
    case "scenario":
      return scenarioById(slot.id)?.titleBg;
  }
}

/**
 * The board, resolved to the two trace URLs the canvas replay needs.
 *
 * Both halves are TRACES, not video. A correct/wrong pair delivered as traces
 * is ~270 KB; the same pair as rendered .webm is ~5.1 MB — 19× more, against a
 * public-asset budget with room for about thirteen more reels in total. So the
 * board's default renderer is the 2D canvas, and a rendered reel is an upgrade
 * the media component applies where the manifest already has one and the
 * connection is not saveData/2g. That inversion is the only way „correct way
 * vs wrong way, for the whole course" fits on Bulgarian mobile data at all.
 */
export function resolveBoard(beat: Beat): ResolvedBoard | null {
  if (beat.board === null) return null;

  if (beat.board.mode === "sign") {
    const sign = signByCode(beat.board.signId);
    if (sign === undefined) return null;
    return {
      mode: "sign",
      sign: {
        code: sign.code,
        nameBg: sign.nameBg,
        meaningBg: sign.meaningBg,
        svgFile: sign.svgFile,
        lawRefs: [...sign.lawRefs],
      },
    };
  }

  const spec = scenarioById(beat.board.templateId);
  const mistake = spec?.mistakes[beat.board.mistakeIndex];
  if (spec === undefined || mistake === undefined) return null;
  // The pending-trace guard, again: a demo whose file has not been recorded
  // degrades the beat to text rather than pointing the student at a replay
  // that 404s. whyPanel.ts applies the same rule at pick time; this is the
  // render-time backstop for a trace that goes pending after composition.
  if (mistake.traceRef.pending === true) return null;

  const board: ResolvedBoard = {
    mode: beat.board.mode,
    wrong: {
      tracePath: traceUrlForRepoPath(mistake.traceRef.path),
      districtId: spec.map.districtId,
      titleBg: mistake.titleBg,
      whatWentWrongBg: mistake.whatWentWrongBg,
    },
    drill: {
      templateId: spec.id,
      level: spec.levels.reduce<number>(
        (min, rung) => Math.min(min, rung.level),
        spec.levels[0].level,
      ),
      titleBg: spec.titleBg,
    },
  };

  if (beat.board.mode === "compare" && spec.shadow.pending !== true) {
    board.right = {
      tracePath: traceUrlForRepoPath(spec.shadow.path),
      districtId: spec.map.districtId,
      titleBg: spec.titleBg,
    };
  } else {
    board.mode = "mistake";
  }
  return board;
}

/** Does anything in this beat's Tier-1 scope carry a citation? */
function beatHasLaw(beat: Beat): boolean {
  const repo = getContentRepo();
  if (beat.ruleCodes.length > 0) return true;
  for (const id of beat.conceptIds) {
    if ((repo.conceptById(id)?.lawRefs.length ?? 0) > 0) return true;
  }
  for (const id of beat.questionIds) {
    if ((repo.questionById(id)?.lawRefs.length ?? 0) > 0) return true;
  }
  return false;
}

/**
 * A beat's utterances, in order.
 *
 * A reference that no longer resolves (a concept renamed, a template retired)
 * DROPS ITS LINE rather than rendering an empty bubble. The beat still plays;
 * a lesson does not break because one id moved. That is also why the outline
 * counts through this function rather than counting `say` — the player must be
 * told how many sentences will actually arrive, not how many were authored.
 */
function utterancesOf(beat: Beat, lesson: Lesson): ResolvedUtterance[] {
  // THE AUTHORED LECTURE WINS, when there is one and it has been approved
  // (narration.ts). Same beat, same board, same quiz, better words — and the
  // beat still carries no prose of its own, only the (lessonId, beatId) that
  // names the entry. A composed line is the floor, not the ceiling.
  const authored = lessonNarration(lesson.id, beat.id);
  if (authored !== null) {
    return [
      {
        id: `${beat.id}:authored`,
        textBg: authored.textBg,
        lawRefs: [...authored.lawRefs],
        frame: false,
      },
    ];
  }

  const utterances: ResolvedUtterance[] = [];
  beat.say.forEach((ref, i) => {
    const resolved = resolveSay(ref, lesson);
    if (resolved === null || resolved.textBg.trim().length === 0) return;
    utterances.push({
      id: `${beat.id}:${i}`,
      textBg: resolved.textBg,
      lawRefs: [...resolved.lawRefs],
      frame: resolved.frame,
    });
  });
  return utterances;
}

/** Everything the classroom needs to render ONE beat. */
export function resolveBeat(lessonId: string, beatId: string): ResolvedBeat | null {
  const lesson = lessonById(lessonId);
  if (lesson === undefined) return null;
  const index = lesson.beats.findIndex((b) => b.id === beatId);
  if (index < 0) return null;
  const beat = lesson.beats[index];
  const utterances = utterancesOf(beat, lesson);

  return {
    lessonId: lesson.id,
    beatId: beat.id,
    index,
    kind: beat.kind,
    tone: beat.tone,
    utterances,
    board: resolveBoard(beat),
    chips: chipsForBeat({
      beatId: beat.id,
      hasConcept: beat.conceptIds.length > 0,
      hasRule: beat.ruleCodes.length > 0,
      hasLaw: beatHasLaw(beat),
      board: beat.board,
    }),
    quiz: beat.kind === "quiz" && beat.questionCount > 0,
  };
}

/** The lesson skeleton — tiny, safe to send with the page. */
export function resolveOutline(lessonId: string): LessonOutline | null {
  const lesson = lessonById(lessonId);
  if (lesson === undefined) return null;
  return {
    lessonId: lesson.id,
    titleBg: lesson.titleBg,
    topicTitleBg: lesson.topicTitleBg,
    sectionId: lesson.sectionId,
    order: lesson.order,
    totalLessons: allLessons().length,
    beats: lesson.beats.map((b) => ({
      id: b.id,
      kind: b.kind,
      tone: b.tone,
      sayCount: utterancesOf(b, lesson).length,
      questionCount: beatQuizCount(lesson.id, b),
    })),
  };
}
