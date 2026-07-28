/**
 * INTERRUPTION — „the student can interrupt the teacher and ask questions
 * about the topics, about his view, his own opinions, or to ask opinions of
 * the teacher."
 *
 * This is the founder's core ask and the thing a recording cannot do. Four
 * answer paths, tried in this order, and only the third costs money:
 *
 *  1. BOARD COMMAND — „Покажи го пак", „По-бавно". Not a question at all: a
 *     player command. $0, instant, no model, no debit, no cap. A student can
 *     press it forty times.
 *
 *  2. AUTHORED — the chip's intent picks an exact STORED material and the
 *     teacher reads it. „Какво трябваше да направя?" is answered by the rule
 *     catalogue's `correctiveBg`; „Какво ми струва на изпита?" by its severity
 *     and points; „Кой член го казва?" by the lawRefs already attached. This
 *     is $0, instant, ADR-002-clean BY CONSTRUCTION (no model is in the loop,
 *     so no model can free-recall Bulgarian law), and — the part that matters
 *     for shipping — IT WORKS WITH NO API KEY AT ALL. Most presses land here.
 *
 *  3. MODEL — genuinely new free text goes to `askTutor` with the beat's own
 *     materials injected as Tier 1. One budgeted path, all four existing
 *     ceilings (burst, daily, per-pack allowance, global kill-switch), the
 *     same citation whitelist. There is no second model client here and there
 *     must never be one, or the kill-switch stops protecting a real card.
 *
 *  4. CONSTRUCTIVE REFUSAL — nothing in scope covers it, or the beat's cap is
 *     spent. Never a bare „нямам материал": THEO-4 forbids bare verdicts and a
 *     bare refusal is the same failure in different clothes. Three parts —
 *     name the boundary, say what IS covered here, offer a real destination —
 *     and parts 1 and 3 are assembled by OUR code from ids, so the refusal
 *     path contains no free-recall surface at all.
 *
 * WHAT THE TEACHER MAY HAVE AN OPINION ABOUT. The founder asked for the
 * teacher's own view, and there is a real answer that is not a dodge: the
 * teacher may hold opinions about DRIVING and may not hold opinions about the
 * LAW. „Според мен този член значи…" is the ADR-002 failure in its worst form,
 * because it sounds like honest hedging. But „ако питаш мен, свали газта още
 * при знака" is a stance, it is authored, it is reviewed, and there are 52 of
 * them sitting in `correctiveBg` right now. So an opinion chip answers from
 * the corrective — and then hands the question back to the student, because
 * turning „а ти какво мислиш?" around is the technique, not an evasion.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import { VIOLATIONS } from "@/modules/sim/rules";
import {
  askTutor,
  isTutorEnabled,
  parseCatalogLawRef,
  ruleMaterial,
  type RetrievedItem,
  type TutorLessonContext,
} from "@/modules/tutor";
import { lessonById } from "./compose";
import { frameLine } from "./frames";
import { MAX_INTERRUPTION_LENGTH, MAX_MODEL_ASKS_PER_BEAT } from "./types";
import type { AskChip, Beat, ChipIntent, InterruptionAnswer, Lesson } from "./types";

// ---------------------------------------------------------------------------
// Tier 1 — the beat's own materials, injected
// ---------------------------------------------------------------------------

/**
 * The beat's materials, as tutor grounding items.
 *
 * These are INJECTED, not retrieved: no scoring, no ranking, no threshold. A
 * beat is the best-specified context this product will ever have — an author
 * decided these belong together — and when the materials are already exact,
 * the grounding is stronger AND the prompt is smaller AND the call is cheaper.
 */
export function beatMaterials(beat: Beat): RetrievedItem[] {
  const repo = getContentRepo();
  const materials: RetrievedItem[] = [];

  for (const id of beat.conceptIds) {
    const concept = repo.conceptById(id);
    if (concept === undefined) continue;
    materials.push({
      kind: "concept",
      id: concept.id,
      titleBg: concept.titleBg,
      bodyBg: concept.summaryBg,
      lawRefs: concept.lawRefs,
      score: 0,
    });
  }
  for (const id of beat.questionIds) {
    const question = repo.questionById(id);
    if (question === undefined) continue;
    materials.push({
      kind: "question",
      id: question.id,
      titleBg: question.textBg,
      bodyBg: question.explanationBg,
      lawRefs: question.lawRefs,
      score: 0,
    });
  }
  for (const code of beat.ruleCodes) {
    const material = ruleMaterial(code);
    if (material !== null) materials.push(material);
  }
  for (const code of beat.signIds) {
    const sign = repo.signs().find((s) => s.code === code);
    if (sign === undefined) continue;
    materials.push({
      kind: "sign",
      id: sign.id,
      titleBg: `Знак ${sign.code} „${sign.nameBg}“`,
      bodyBg: sign.meaningBg,
      lawRefs: sign.lawRefs,
      score: 0,
    });
  }
  return materials;
}

/** Every citation in scope for this beat, deduplicated, in material order. */
export function beatCitations(materials: RetrievedItem[]): LawRef[] {
  const seen = new Set<string>();
  const refs: LawRef[] = [];
  for (const material of materials) {
    for (const ref of material.lawRefs) {
      const key = `${ref.act}|${ref.ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// The authored answers
// ---------------------------------------------------------------------------

function firstRule(beat: Beat): { code: string; spec: (typeof VIOLATIONS)[keyof typeof VIOLATIONS] } | null {
  for (const code of beat.ruleCodes) {
    if (Object.hasOwn(VIOLATIONS, code)) {
      return { code, spec: VIOLATIONS[code as keyof typeof VIOLATIONS] };
    }
  }
  return null;
}

function firstConceptSummary(beat: Beat): { textBg: string; lawRefs: LawRef[] } | null {
  const repo = getContentRepo();
  for (const id of beat.conceptIds) {
    const concept = repo.conceptById(id);
    if (concept !== undefined && concept.summaryBg.trim().length > 0) {
      return { textBg: concept.summaryBg, lawRefs: [...concept.lawRefs] };
    }
  }
  return null;
}

/**
 * Answer a chip from AUTHORED material. Returns null when this beat has
 * nothing that answers that intent — the caller then falls through, rather
 * than serving an adjacent material under a question it does not answer.
 */
export function authoredAnswer(
  beat: Beat,
  intent: ChipIntent,
): InterruptionAnswer | null {
  const rule = firstRule(beat);
  const ruleRefs = rule === null ? [] : catalogRefs(rule.spec.lawRef);

  switch (intent) {
    case "why": {
      const concept = firstConceptSummary(beat);
      if (concept !== null) {
        return authored(concept.textBg, concept.lawRefs);
      }
      if (rule !== null) return authored(rule.spec.explanationBg, ruleRefs);
      return null;
    }
    case "how": {
      if (rule !== null) return authored(rule.spec.correctiveBg, ruleRefs);
      return null;
    }
    case "exam": {
      if (rule === null) return null;
      // The catalogue's own composed body: classification + points first, then
      // why, then the corrective. Built by the tutor so a lesson and the chat
      // quote the exam consequence with identical wording.
      const material = ruleMaterial(rule.code);
      if (material === null) return null;
      return authored(material.bodyBg, material.lawRefs);
    }
    case "law": {
      const refs = beatCitations(beatMaterials(beat));
      if (refs.length === 0) return null;
      // The body is the list itself: the citations ARE the answer, and the
      // classroom renders them as chips. No sentence is composed around them,
      // because a sentence about what an article says would be exactly the
      // free-recall this whole layer exists to prevent.
      return {
        source: "authored",
        bodyBg: refs.map((r) => `${r.act} ${r.ref}`.trim()).join(" · "),
        citations: refs,
        debited: false,
      };
    }
    case "opinion": {
      if (rule === null) return null;
      return {
        source: "authored",
        bodyBg: `${frameLine("opinion-frame")} ${rule.spec.correctiveBg}`,
        citations: ruleRefs,
        turnBackBg: frameLine("opinion-turnback"),
        debited: false,
      };
    }
  }
}

function authored(bodyBg: string, citations: LawRef[]): InterruptionAnswer {
  return { source: "authored", bodyBg, citations, debited: false };
}

function catalogRefs(raw: string): LawRef[] {
  const parsed = parseCatalogLawRef(raw);
  return parsed === null ? [] : [parsed];
}

// ---------------------------------------------------------------------------
// The constructive refusal
// ---------------------------------------------------------------------------

/**
 * Parts 1 and 3 are template strings assembled by OUR code from ids; only the
 * middle names a material, and it names it by its stored title. The whole
 * refusal path is therefore free of free-recall — which matters, because the
 * refusal is the path a student hits when the model would have been most
 * tempted to invent something.
 */
export function constructiveRefusal(
  lesson: Lesson,
  beat: Beat,
  capped: boolean,
): InterruptionAnswer {
  const repo = getContentRepo();
  const concept = beat.conceptIds
    .map((id) => repo.conceptById(id))
    .find((c) => c !== undefined);
  const nearby =
    concept === undefined ? "" : ` ${frameLine("refuse-nearby", concept.titleBg)}`;

  return {
    source: capped ? "capped" : "refusal",
    bodyBg: `${frameLine("refuse-boundary")}${nearby} ${frameLine("refuse-offer")}`.trim(),
    citations: [],
    offer: {
      labelBg: "Тренировка по темата",
      href: `/theory/practice?section=${encodeURIComponent(lesson.sectionId)}`,
    },
    debited: false,
  };
}

// ---------------------------------------------------------------------------
// The content-gap log
// ---------------------------------------------------------------------------

/**
 * Every refusal is a content gap somebody can close.
 *
 * This is the only mechanism in the product that tells the founder what
 * 17-year-olds actually want to know and the bank does not cover. It is
 * cheap and it is worth more than any dashboard.
 *
 * PRIVACY: NO USER ID, ever. Under ADR-004 these are minors, and there is no
 * product reason to know WHO asked — the gap is the artifact, not the child.
 * The store is process-local and bounded; `setContentGapSink` is the seam for
 * a persistent one, and whatever is put behind it must keep this property.
 */
export interface ContentGap {
  lessonId: string;
  beatId: string;
  questionBg: string;
  ts: number;
}

const GAP_RING_SIZE = 200;
const gapRing: ContentGap[] = [];
let gapSink: ((gap: ContentGap) => void) | null = null;

export function setContentGapSink(sink: ((gap: ContentGap) => void) | null): void {
  gapSink = sink;
}

export function recentContentGaps(): readonly ContentGap[] {
  return gapRing;
}

export function resetContentGaps(): void {
  gapRing.length = 0;
}

function logContentGap(gap: ContentGap): void {
  gapRing.push(gap);
  if (gapRing.length > GAP_RING_SIZE) gapRing.shift();
  if (gapSink !== null) {
    try {
      gapSink(gap);
    } catch {
      // A logging failure must never cost the student their answer.
    }
  }
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

export interface InterruptionRequest {
  userId: string;
  lessonId: string;
  beatId: string;
  /** What the student typed, or the chip's own label. */
  questionBg: string;
  /** The chip they pressed, if any. Free text leaves this null. */
  chipId?: string | null;
  /**
   * Budgeted interruptions already spent in THIS beat (player state). Board
   * commands and authored answers never increment it — only the model path
   * does, which is why the cap is felt by nobody who is using the chips.
   */
  modelAsksUsedInBeat: number;
  /** The chips this beat offers — the caller resolved them already. */
  chips: readonly AskChip[];
}

export async function answerInterruption(
  request: InterruptionRequest,
): Promise<InterruptionAnswer> {
  const question = request.questionBg.trim();
  const lesson = lessonById(request.lessonId);
  const beat = lesson?.beats.find((b) => b.id === request.beatId);
  if (lesson === undefined || beat === undefined) {
    throw new Error("answerInterruption: unknown lesson or beat");
  }
  if (question.length === 0 || question.length > MAX_INTERRUPTION_LENGTH) {
    throw new Error("answerInterruption: invalid question");
  }

  const chip =
    request.chipId == null
      ? undefined
      : request.chips.find((c) => c.id === request.chipId);

  // 1. Board control — a player command, not a question.
  if (chip !== undefined && chip.kind === "board") {
    return {
      source: "board",
      bodyBg: "",
      citations: [],
      boardCommand: chip.command,
      debited: false,
    };
  }

  // 2. Authored — the chip's intent picks an exact stored material.
  if (chip !== undefined && chip.kind === "ask") {
    const answer = authoredAnswer(beat, chip.intent);
    if (answer !== null) return answer;
  }

  // 3. Model — genuinely new free text, inside the beat's cap.
  if (request.modelAsksUsedInBeat >= MAX_MODEL_ASKS_PER_BEAT) {
    return constructiveRefusal(lesson, beat, true);
  }

  const materials = beatMaterials(beat);
  if (isTutorEnabled()) {
    const context: TutorLessonContext = {
      kind: "lesson",
      lessonId: lesson.id,
      beatId: beat.id,
      topicId: lesson.topicId,
      materials,
    };
    const result = await askTutor(request.userId, question, context);
    // The tutor's own refusal string is correct for free chat and wrong for a
    // classroom, where the teacher knows exactly where the student is
    // standing. Swap it for the constructive one and record the gap. `limited`
    // (a ceiling was hit, no call was made) keeps the tutor's own message —
    // that one is about the student's allowance, not about the material.
    if (!result.limited && looksLikeRefusal(result.reply)) {
      logContentGap({
        lessonId: lesson.id,
        beatId: beat.id,
        questionBg: question,
        ts: Date.now(),
      });
      return constructiveRefusal(lesson, beat, false);
    }
    return {
      source: "model",
      bodyBg: result.reply,
      citations: result.citations.map(({ act, ref }) => ({ act, ref })),
      debited: !result.limited,
    };
  }

  // 3b. NO MODEL AVAILABLE (no ANTHROPIC_API_KEY — the state this repo is in
  // today). The classroom does not degrade to broken: a free-text question
  // that overlaps a Tier-1 material is answered from that material, verbatim.
  // It is a narrower answer than the model would give, but it is never a
  // wrong one, and it is the difference between a teacher who says „нямам
  // ключ" and one who points at the page.
  const matched = bestMaterialFor(question, materials);
  if (matched !== null) {
    return authored(matched.bodyBg, [...matched.lawRefs]);
  }

  logContentGap({
    lessonId: lesson.id,
    beatId: beat.id,
    questionBg: question,
    ts: Date.now(),
  });
  return constructiveRefusal(lesson, beat, false);
}

/** The tutor's exact refusal, however the model punctuated it. */
function looksLikeRefusal(reply: string): boolean {
  return reply.toLowerCase().includes("нямам материал за това");
}

/**
 * The best Tier-1 material for a free-text question, by shared-token overlap.
 *
 * Deliberately crude and deliberately strict: it requires at least two content
 * words in common, so „а какво става с трамваите" does not get answered with
 * whatever material happened to share the word „път". Below the floor it
 * returns null and the caller refuses — a refusal the student can act on beats
 * a confident paragraph about something else.
 */
export function bestMaterialFor(
  question: string,
  materials: readonly RetrievedItem[],
): RetrievedItem | null {
  const query = contentTokens(question);
  if (query.size < 2) return null;

  let best: { material: RetrievedItem; overlap: number } | null = null;
  for (const material of materials) {
    const tokens = contentTokens(`${material.titleBg} ${material.bodyBg}`);
    let overlap = 0;
    for (const token of query) if (tokens.has(token)) overlap += 1;
    if (overlap >= 2 && (best === null || overlap > best.overlap)) {
      best = { material, overlap };
    }
  }
  return best === null ? null : best.material;
}

/** Words of 4+ letters, lowercased. Short words in Bulgarian are glue. */
function contentTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length >= 4) tokens.add(raw.slice(0, 6));
  }
  return tokens;
}
