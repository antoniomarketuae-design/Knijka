/**
 * Retrieval layer for the AI tutor (ADR-002: the LLM NEVER free-recalls law —
 * every answer is grounded in material retrieved from OUR authored corpora).
 *
 * v1 is a pure keyword scorer: Cyrillic-normalized token overlap between the
 * student's question and the material text, with a title boost and a prefix
 * match to absorb Bulgarian inflection ("предимство" ↔ "предимството"). No
 * embeddings, no index — both corpora are a few hundred items, a linear scan
 * is instant.
 *
 * TWO corpora feed the same prompt (audit I-1):
 *  1. the ContentRepo — concepts, exam questions, road signs;
 *  2. the sim rule catalog — the 46 authored violation specs the rule engine
 *     grades with (see the second section below).
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import { VIOLATIONS, type SeverityClass } from "@/modules/sim/rules";

export interface RetrievedItem {
  kind: "concept" | "question" | "sign" | "rule";
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

// ---------------------------------------------------------------------------
// Second corpus: the sim rule catalog (audit I-1)
// ---------------------------------------------------------------------------

/**
 * The rule catalog answers a question the content bank structurally cannot:
 * "what does the examiner count this as, what does it cost me, and what was
 * the right action?". Every entry is authored by the rule engine — severity
 * class, official points, explanation, corrective and a law reference — so
 * it satisfies exactly the same ADR-002 contract as the content bank:
 * retrieved and cited, never recalled by the model.
 *
 * Only VIOLATIONS are grounding material. COMMENDATIONS carry no lawRef and
 * no corrective, so there is nothing in them the tutor could cite.
 *
 * Sim data crosses the module boundary only through the public sub-barrel
 * (docs/architecture/05) — the tutor never imports catalog.ts directly.
 */

/** How many catalog entries may join the grounding at most. */
export const MAX_RETRIEVED_RULES = 2;

/**
 * A single fuzzy prefix hit (0.7) is not enough evidence here. The catalog is
 * a small, broad-brush corpus — 46 entries covering the whole of driving — so
 * a weak match on one inflected word would let almost any question drag in a
 * rule. One full token's worth of overlap is the floor.
 */
const RULE_MIN_SCORE = EXACT_MATCH;

const SEVERITY_LABEL_BG: Record<SeverityClass, string> = {
  opasna: "опасна",
  osnovna: "основна",
  vtorostepenna: "второстепенна",
};

/**
 * Split "ЗДвП чл. 21" into the {act, ref} shape the citation whitelist works
 * on, at the first reference token (чл./ал./т./§/№).
 *
 * A trailing gloss in parentheses is dropped: "ППЗДвП чл. 63 (М1 — единична
 * непрекъсната линия)" is the rule engine's note to itself, not part of the
 * legal reference. Left in, it would turn a citation chip into a sentence and
 * make two entries citing the same наредба render as two different sources.
 *
 * A string with no reference token yields null — a bare act name is not a
 * citable reference, and manufacturing one is precisely what ADR-002 forbids.
 * The entry still grounds the answer; it just contributes no citation.
 */
const REF_TOKEN_RE = /\s(?=(?:чл\.|ал\.|т\.|§|№))/;

export function parseCatalogLawRef(raw: string): LawRef | null {
  const cleaned = raw
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const at = REF_TOKEN_RE.exec(cleaned);
  if (!at || at.index <= 0) return null;

  const act = cleaned.slice(0, at.index).trim();
  const ref = cleaned.slice(at.index + at[0].length).trim();
  if (act.length === 0 || ref.length === 0) return null;
  return { act, ref };
}

interface RuleCandidate extends Candidate {
  /**
   * The text the SCORER sees. The severity/points line that heads the display
   * body is deliberately left out of it: that line is near-identical across
   * all 46 entries, so scoring it would give every rule a free match on
   * "грешка"/"точки" and let a vague question pull in two arbitrary rules.
   */
  searchBodyBg: string;
}

/** Built once at module load — the catalog is a compile-time constant. */
const RULE_CANDIDATES: RuleCandidate[] = Object.entries(VIOLATIONS).map(
  ([code, spec]) => {
    const lawRef = parseCatalogLawRef(spec.lawRef);
    return {
      kind: "rule" as const,
      // Namespaced so a catalog id can never collide with a content-bank one.
      id: `rule:${code}`,
      titleBg: spec.titleBg,
      bodyBg: [
        `Класификация на изпита: ${SEVERITY_LABEL_BG[spec.severityClass]} грешка — ${spec.points} наказателни точки.`,
        spec.explanationBg,
        `Правилното действие: ${spec.correctiveBg}`,
      ].join(" "),
      searchBodyBg: `${spec.explanationBg} ${spec.correctiveBg}`,
      lawRefs: lawRef ? [lawRef] : [],
    };
  },
);

/** Rank the rule catalog against the student's question. */
export function retrieveRuleMaterials(
  question: string,
  limit: number = MAX_RETRIEVED_RULES,
): RetrievedItem[] {
  const queryTokens = tokenizeBg(question);
  if (queryTokens.length === 0) return [];

  return RULE_CANDIDATES.map((c) => ({
    ...c,
    score: scoreCandidate(queryTokens, { ...c, bodyBg: c.searchBodyBg }),
  }))
    .filter((c) => c.score >= RULE_MIN_SCORE)
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

/**
 * The tutor's full grounding: content bank + rule catalog.
 *
 * The two corpora are NOT ranked against each other — the rule slots are
 * reserved. They answer different questions ("what does the law say" vs.
 * "what does the examiner count it as and what should I have done"), so a
 * strong concept match must never crowd out the one catalog entry that tells
 * the student the mistake is опасна and ends the exam, and vice versa.
 */
export function retrieveGrounding(
  repo: ContentRepo,
  question: string,
): RetrievedItem[] {
  return [
    ...retrieveMaterials(repo, question),
    ...retrieveRuleMaterials(question),
  ];
}
