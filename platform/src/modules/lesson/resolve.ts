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
import {
  conceptClearance,
  noteWithheld,
  questionClearance,
  signClearance,
  type Clearance,
  type WithheldReason,
} from "./clearance";
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

/**
 * What one `SayRef` resolved to.
 *
 * `withheld` is a THIRD outcome and it is not the same as `null`. Null means
 * the reference does not resolve — a concept was renamed, a template retired —
 * and the line simply disappears, which has always been correct. `withheld`
 * means the material EXISTS and this classroom is refusing to say it, and that
 * distinction is the whole point: the first is a broken id, the second is a
 * student who nearly heard something nobody has checked. They must be logged
 * differently and they must sound different to the student.
 */
type SayResolution =
  | { kind: "text"; textBg: string; lawRefs: LawRef[]; frame: boolean }
  | { kind: "withheld"; src: SayRef["src"]; id: string; reason: WithheldReason; expected?: string }
  | null;

/** Fold a clearance verdict into a resolution. The ONLY place text is released. */
function gated(
  clearance: Clearance,
  src: SayRef["src"],
  id: string,
  textBg: string,
  lawRefs: LawRef[],
): SayResolution {
  if (clearance.cleared) return { kind: "text", textBg, lawRefs, frame: false };
  return { kind: "withheld", src, id, reason: clearance.reason, expected: clearance.expected };
}

/** One `SayRef` → the stored text plus whatever citations ride with it. */
function resolveSay(ref: SayRef, lesson: Lesson): SayResolution {
  const repo = getContentRepo();

  switch (ref.src) {
    // --- class „carried" ---------------------------------------------------
    // concepts.json has no `status` field, so this is a pin against the frozen
    // carry (clearanceCarry.ts), not a status check. An edited or unfrozen
    // summary is withheld.
    case "concept": {
      const concept = repo.conceptById(ref.conceptId);
      if (concept === undefined) return null;
      return gated(
        conceptClearance(concept),
        "concept",
        concept.id,
        concept.summaryBg,
        concept.lawRefs,
      );
    }
    // --- class „signed" ----------------------------------------------------
    case "question": {
      const question = repo.questionById(ref.questionId);
      if (question === undefined) return null;
      return gated(
        questionClearance(question),
        "question",
        question.id,
        question.explanationBg,
        question.lawRefs,
      );
    }
    // --- class „catalogue" -------------------------------------------------
    // Founder-authored TypeScript in modules/sim. No status exists to check;
    // clearance.ts records that residual rather than pretending it is gated.
    case "mistake": {
      const spec = scenarioById(ref.templateId);
      const mistake = spec?.mistakes[ref.mistakeIndex];
      if (mistake === undefined) return null;
      return { kind: "text", textBg: mistake.whatWentWrongBg, lawRefs: NO_REFS, frame: false };
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
      return { kind: "text", textBg, lawRefs: catalogRefs(spec.teach.lawRef), frame: false };
    }
    case "rule": {
      const spec = Object.hasOwn(VIOLATIONS, ref.code)
        ? VIOLATIONS[ref.code as keyof typeof VIOLATIONS]
        : undefined;
      if (spec === undefined) return null;
      return {
        kind: "text",
        textBg: ref.field === "explanation" ? spec.explanationBg : spec.correctiveBg,
        lawRefs: catalogRefs(spec.lawRef),
        frame: false,
      };
    }
    // --- class „signed" ----------------------------------------------------
    case "sign": {
      const sign = signByCode(ref.signId);
      if (sign === undefined) return null;
      return gated(signClearance(sign), "sign", sign.code, sign.meaningBg, sign.lawRefs);
    }
    // --- class „agenda" ----------------------------------------------------
    // A topic's descriptionBg is the table of contents for the topic. It names
    // subjects and states no rule; clearance.test.ts holds it to that.
    case "topic": {
      const topic = repo.topics().find((t) => t.id === ref.topicId);
      if (topic === undefined) return null;
      return { kind: "text", textBg: topic.descriptionBg, lawRefs: NO_REFS, frame: false };
    }
    // --- class „frame" -----------------------------------------------------
    case "frame": {
      return {
        kind: "text",
        textBg: frameLine(ref.lineId, slotText(ref.slot, lesson)),
        lawRefs: NO_REFS,
        frame: true,
      };
    }
  }
}

/**
 * UNGATED ON PURPOSE, and this is the one place that deserves saying out loud:
 * every branch here returns a TITLE. „Кога и как се мести пострадал" is the
 * name of a subject, not a claim about it — a withheld concept's title can be
 * spoken („Днес взимаме…") while its summary cannot, and that is the whole
 * difference between a table of contents and a lesson. frames.ts already
 * depends on this: a `{{slot}}` is defined as a STORED TITLE.
 */
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
export function resolveBoard(beat: Beat, lessonId = ""): ResolvedBoard | null {
  if (beat.board === null) return null;

  if (beat.board.mode === "sign") {
    const sign = signByCode(beat.board.signId);
    if (sign === undefined) return null;
    // A sign board SPEAKS: `meaningBg` is a sentence about what a driver must
    // do. It goes through the same gate as a spoken sign line, or the board
    // degrades to no board at all — the same shape the pending-trace guard
    // below uses. No composed beat carries a sign board today; this is the
    // door, not a change in behaviour.
    const clearance = signClearance(sign);
    if (!clearance.cleared) {
      noteWithheld({
        lessonId,
        beatId: beat.id,
        src: "sign",
        id: sign.code,
        reason: clearance.reason,
      });
      return null;
    }
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

/**
 * Does anything in this beat's Tier-1 scope carry a citation?
 *
 * CLEARED material only, and that is not pedantry: this answer decides whether
 * the „Кой член го казва?" chip is offered, and the chip is answered from
 * `beatMaterials`, which now drops withheld sources. Counting a withheld
 * concept's lawRef here would put a button on the screen whose only possible
 * outcome is a refusal — which is how a classroom teaches a 17-year-old that
 * its buttons lie.
 */
function beatHasLaw(beat: Beat): boolean {
  const repo = getContentRepo();
  if (beat.ruleCodes.length > 0) return true;
  for (const id of beat.conceptIds) {
    const concept = repo.conceptById(id);
    if (concept === undefined || !conceptClearance(concept).cleared) continue;
    if (concept.lawRefs.length > 0) return true;
  }
  for (const id of beat.questionIds) {
    const question = repo.questionById(id);
    if (question === undefined || !questionClearance(question).cleared) continue;
    if (question.lawRefs.length > 0) return true;
  }
  return false;
}

/** Concepts of this beat whose summary may actually be spoken. */
function clearedConceptIds(beat: Beat): string[] {
  const repo = getContentRepo();
  return beat.conceptIds.filter((id) => {
    const concept = repo.conceptById(id);
    return concept !== undefined && conceptClearance(concept).cleared;
  });
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
  let withheld = 0;
  let substantive = 0;
  beat.say.forEach((ref, i) => {
    const resolved = resolveSay(ref, lesson);
    if (resolved === null) return;
    if (resolved.kind === "withheld") {
      withheld += 1;
      noteWithheld({
        lessonId: lesson.id,
        beatId: beat.id,
        src: resolved.src,
        id: resolved.id,
        reason: resolved.reason,
        expected: resolved.expected,
      });
      return;
    }
    if (resolved.textBg.trim().length === 0) return;
    if (!resolved.frame) substantive += 1;
    utterances.push({
      id: `${beat.id}:${i}`,
      textBg: resolved.textBg,
      lawRefs: [...resolved.lawRefs],
      frame: resolved.frame,
    });
  });

  // THE BEAT THAT LOST EVERYTHING IT HAD TO TEACH. Not silence: silence is a
  // beat the player skips and a student who never learns that the classroom
  // stopped itself. One claim-free line, said once however many sources were
  // withheld, and the lesson keeps walking. A beat that still has something
  // substantive to say says it and does not announce the missing part — the
  // student cannot miss a sentence they were never promised, and the record in
  // `recentWithheldSources()` is what tells US.
  if (withheld > 0 && substantive === 0) {
    utterances.push({
      id: `${beat.id}:withheld`,
      textBg: frameLine("withheld"),
      lawRefs: [],
      frame: true,
    });
  }
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
    board: resolveBoard(beat, lesson.id),
    chips: chipsForBeat({
      beatId: beat.id,
      // „Защо е така?" is answered from a concept summary (interrupt.ts). If
      // every concept on this beat is withheld, the chip has no answer and is
      // not offered — the beat keeps whatever chips its rule catalogue earns.
      hasConcept: clearedConceptIds(beat).length > 0,
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

// ---------------------------------------------------------------------------
// The census — what the gate costs, counted rather than assumed
// ---------------------------------------------------------------------------

/**
 * Whether the hub should put this lesson in front of a student.
 *
 * „open" is not a promise that the lesson is complete — most lessons lose the
 * odd source and are still worth an hour. „in-preparation" is the narrow case
 * where opening it is a worse experience than being told the truth.
 */
export type LessonOffer = "open" | "in-preparation";

export interface LessonClearance {
  lessonId: string;
  titleBg: string;
  /** Beats that exist to TEACH something (not open/recap/quiz framing). */
  teachingBeats: number;
  /** Of those, how many still say something substantive. */
  speaking: number;
  /** Of those, how many were reduced to the „under review" line. */
  withheld: number;
  /** Questions the whole lesson will actually deal. */
  quizDealt: number;
  /** What the hub does with it. See `offerFor`. */
  offer: LessonOffer;
}

/**
 * THE THRESHOLD, and why it is where it is.
 *
 * The per-BEAT behaviour of the gate is right: a beat that lost every source
 * says one claim-free line instead of vanishing, because a skipped beat is a
 * bare verdict delivered by absence (THEO-4). The per-LESSON behaviour was
 * missing entirely. `l-accidents-first-aid` is what that looks like from a
 * student's chair: one opening line, FOUR CONSECUTIVE IDENTICAL „Тази част още
 * се проверява от преподавател" bubbles, a recap, and zero questions. Every
 * individual decision on that path is correct and the sum of them is a lesson
 * that wastes somebody's evening.
 *
 * Two conditions, and both are about the same thing — is there anything here.
 *
 *   speaking === 0 && quizDealt === 0
 *       Nothing to say and nothing to ask. Unarguable, and today it selects
 *       exactly one lesson out of 54 (first aid). This is the floor.
 *
 *   quizDealt === 0 && withheld > speaking
 *       More holes than lesson, with no question bank underneath to carry it.
 *       This selects ZERO lessons today — which is the reason to write it now
 *       rather than the day it first bites, the same argument `signClearance`
 *       makes about a sign catalogue no beat speaks yet. The measured
 *       distribution it was chosen against: 50 lessons withheld=0, three at
 *       withheld=1 (each keeping 2–3 speaking beats and 2–3 questions), one at
 *       withheld=4/speaking=0.
 *
 * A QUIZ RESCUES A LESSON and that is deliberate, not a loophole: a quiz beat
 * deals approved questions and every one of them carries its stored
 * explanation, so a lesson that asks is still a lesson that teaches. What it
 * must never do is ask about a beat that was withheld — and it cannot, because
 * `isLessonEligible` requires `approved` and the withheld beats' questions are
 * the ones under review. That consistency is what makes the rescue honest.
 */
function offerFor(input: Omit<LessonClearance, "offer">): LessonOffer {
  if (input.speaking === 0 && input.quizDealt === 0) return "in-preparation";
  if (input.quizDealt === 0 && input.withheld > input.speaking) return "in-preparation";
  return "open";
}

/**
 * What one lesson can still teach.
 *
 * This exists because „the gate is on" is not a fact anybody can act on and
 * „l-accidents-first-aid teaches 0 of its 4 beats and asks 0 questions" is. It
 * is the number that should decide whether that lesson is in front of students
 * at all, and it is derived from the real resolver rather than from the content
 * — a lesson is muted when the CLASSROOM goes quiet, not when a status flips.
 */
export function lessonClearance(lessonId: string): LessonClearance | null {
  const lesson = lessonById(lessonId);
  if (lesson === undefined) return null;

  let teachingBeats = 0;
  let speaking = 0;
  let withheld = 0;
  let quizDealt = 0;

  for (const beat of lesson.beats) {
    quizDealt += beatQuizCount(lesson.id, beat);
    if (beat.kind === "open" || beat.kind === "recap" || beat.kind === "quiz") continue;
    teachingBeats += 1;
    const utterances = utterancesOf(beat, lesson);
    if (utterances.some((u) => !u.frame)) speaking += 1;
    else withheld += 1;
  }

  const counted = {
    lessonId: lesson.id,
    titleBg: lesson.titleBg,
    teachingBeats,
    speaking,
    withheld,
    quizDealt,
  };
  return { ...counted, offer: offerFor(counted) };
}

/** Every lesson the gate touches, worst first. Empty means nothing is muted. */
export function courseClearance(): LessonClearance[] {
  return allLessons()
    .map((l) => lessonClearance(l.id))
    .filter((c): c is LessonClearance => c !== null && c.withheld > 0)
    .sort((a, b) => b.withheld - a.withheld || a.speaking - b.speaking);
}

/**
 * The lessons the hub must not open. One pass over the whole course.
 *
 * THIS IS THE FUNCTION THAT DID NOT EXIST, and its absence is the whole of the
 * second finding: `courseClearance()` and `recentWithheldSources()` were
 * exported from `index.ts` with a comment telling the reader to consult them,
 * and a grep across all of `src/` found no caller outside this module. The
 * number that should decide whether to offer a lesson was computed, exported,
 * documented — and read by nobody, while the lesson it described sat in the
 * hub behind a normal-looking link.
 *
 * Returned as a Set rather than a list because both callers (the index and the
 * room) ask the same membership question, and a page that renders 54 rows must
 * not run the census once per row.
 */
export function lessonsInPreparation(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const lesson of allLessons()) {
    if (lessonClearance(lesson.id)?.offer === "in-preparation") out.add(lesson.id);
  }
  return out;
}
