/**
 * Retrieval layer for the AI tutor (ADR-002: the LLM NEVER free-recalls law —
 * every answer is grounded in material retrieved from the content bank).
 *
 * v1 is a pure keyword scorer over the ContentRepo: Cyrillic-normalized
 * token overlap between the student's question and concept/question/sign
 * text, with a title boost and a prefix match to absorb Bulgarian
 * inflection ("предимство" ↔ "предимството"). No embeddings, no index —
 * the whole bank is a few hundred items, a linear scan is instant.
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";

export interface RetrievedItem {
  kind: "concept" | "question" | "sign";
  id: string;
  /** Display title used as the material heading in the prompt. */
  titleBg: string;
  /** Body text injected into the prompt (summary / explanation / meaning). */
  bodyBg: string;
  lawRefs: LawRef[];
  score: number;
}

/** How many materials are injected into the prompt at most. */
export const MAX_RETRIEVED_ITEMS = 6;

/** Weight multiplier for matches in the item's title vs. its body. */
const TITLE_WEIGHT = 3;
const EXACT_MATCH = 1;
const PREFIX_MATCH = 0.7;
/** Minimum shared length for a prefix match (absorbs noun inflection). */
const PREFIX_MIN_LENGTH = 4;

/**
 * Function words + question scaffolding that carry no retrieval signal.
 * Deliberately small — over-aggressive stopwording hurts short questions.
 */
const STOPWORDS_BG = new Set([
  "а", "аз", "ако", "але", "би", "бих", "ва", "вие", "във", "в", "го", "да",
  "дали", "де", "до", "е", "един", "една", "едно", "за", "защо", "значи", "и",
  "или", "им", "има", "имам", "как", "каква", "какви", "какво", "какъв", "ли",
  "кога", "кое", "кои", "кой", "колко", "коя", "къде", "ме", "ми", "мога",
  "на", "не", "него", "ни", "ние", "но", "нея", "от", "по", "при", "с", "са",
  "се", "си", "сме", "сте", "съм", "така", "тази", "те", "тези", "ти", "то",
  "това", "този", "той", "трябва", "тя", "че", "ще", "що", "я",
]);

/**
 * Cyrillic-friendly normalization: lowercase, fold ѝ→и and й-diacritics,
 * strip everything that is not a letter/digit into whitespace.
 */
export function normalizeBg(text: string): string {
  return text
    .toLowerCase()
    .replace(/ѝ/g, "и")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Normalized tokens with stopwords and single characters removed. */
export function tokenizeBg(text: string): string[] {
  return normalizeBg(text)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS_BG.has(t));
}

/** Match strength between a query token and a document token (0 = none). */
function tokenMatch(queryToken: string, docToken: string): number {
  if (queryToken === docToken) return EXACT_MATCH;
  const shared = Math.min(queryToken.length, docToken.length);
  if (shared < PREFIX_MIN_LENGTH) return 0;
  if (queryToken.startsWith(docToken) || docToken.startsWith(queryToken)) {
    return PREFIX_MATCH;
  }
  return 0;
}

/** Sum over query tokens of the best match found in the document tokens. */
function scoreTokens(queryTokens: string[], docTokens: string[]): number {
  let score = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const d of docTokens) {
      const m = tokenMatch(q, d);
      if (m > best) best = m;
      if (best === EXACT_MATCH) break;
    }
    score += best;
  }
  return score;
}

interface Candidate {
  kind: RetrievedItem["kind"];
  id: string;
  titleBg: string;
  bodyBg: string;
  lawRefs: LawRef[];
}

function scoreCandidate(queryTokens: string[], c: Candidate): number {
  return (
    TITLE_WEIGHT * scoreTokens(queryTokens, tokenizeBg(c.titleBg)) +
    scoreTokens(queryTokens, tokenizeBg(c.bodyBg))
  );
}

/**
 * Rank the whole content bank against the student's question and return the
 * top materials. Draft/needs-review items are included on purpose — the v1
 * bank is founder-authored and the tutor's grounding contract is "our
 * content only", not "approved content only".
 */
export function retrieveMaterials(
  repo: ContentRepo,
  question: string,
  limit: number = MAX_RETRIEVED_ITEMS,
): RetrievedItem[] {
  const queryTokens = tokenizeBg(question);
  if (queryTokens.length === 0) return [];

  const candidates: Candidate[] = [
    ...repo.concepts().map((c) => ({
      kind: "concept" as const,
      id: c.id,
      titleBg: c.titleBg,
      bodyBg: c.summaryBg,
      lawRefs: c.lawRefs,
    })),
    ...repo.questions().map((q) => ({
      kind: "question" as const,
      id: q.id,
      titleBg: q.textBg,
      bodyBg: q.explanationBg,
      lawRefs: q.lawRefs,
    })),
    ...repo.signs().map((s) => ({
      kind: "sign" as const,
      id: s.id,
      titleBg: `Знак ${s.code} „${s.nameBg}“`,
      bodyBg: s.meaningBg,
      lawRefs: s.lawRefs,
    })),
  ];

  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(queryTokens, c) }))
    .filter((c) => c.score >= PREFIX_MATCH)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ kind, id, titleBg, bodyBg, lawRefs, score }) => ({
      kind,
      id,
      titleBg,
      bodyBg,
      lawRefs,
      score,
    }));
}
