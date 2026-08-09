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
 *  2. the sim rule catalog — the 52 authored violation specs the rule engine
 *     grades with (see the second section below).
 *
 * THE THIRD DOOR — and why this file has a gate now.
 *
 * `modules/lesson/clearance.ts` is the classroom's gate: a concept summary is
 * spoken only if the exact sentence is pinned in the carry, a question or a
 * sign only if its own `status` is `approved`. Two doors had already been found
 * and closed there — narration.ts gated its authored text; resolve.ts did not,
 * and spoke a first-aid instruction ERC 2025 now reverses. This file was the
 * third, and it was found the same way: by RUNNING it, not by reading it.
 *
 * MEASURED, against the real bank, before the filter below existed:
 *
 *   „Как се мести пострадал в безсъзнание след катастрофа?"
 *      → q-ptp-063 (10.70, needs-review), c-victim-handling (10.00, NOT
 *        carried), q-ptp-037, q-ptp-022, q-ptp-061, q-ptp-034 — six materials,
 *        six ungated. `c-victim-handling` is the exact concept the classroom
 *        now refuses to speak, because its summary taught the reversal.
 *   „Как се спира силно кръвотечение?" → c-bleeding-control (8.10, not carried)
 *   „Кога се прави сърдечен масаж?"    → c-cpr-basics (6.00, not carried)
 *
 * AND IT LEAKED BACK INTO THE CLASSROOM. `interrupt.ts beatMaterials` gates
 * Tier 1 properly; `service.ts lessonGrounding` then WIDENED with
 * `retrieveMaterialsInTopic`, which did not. Measured over the six beats of
 * `l-accidents-first-aid`: tier1 = 0 on every one of them (correctly withheld),
 * room = 6, tier2 = 6 — so the classroom refused to say it out loud and handed
 * the same rows to the model as grounding. Gating the candidate list closes
 * both paths at once, because both paths build their candidates here.
 *
 * IT WAS INERT ONLY BECAUSE `isTutorEnabled()` RETURNS FALSE WITHOUT AN API
 * KEY. A config flag standing in for a gate is precisely the shape of the
 * original defect, and it stops standing in the moment a key is pasted.
 *
 * WHY THE SAME THREE FUNCTIONS AND NOT A COPY. A second implementation of
 * „may this be spoken" is how the neighbouring door gets missed again: the two
 * drift, and nothing in the tree tells you which one you are looking at. They
 * come through `@/modules/lesson`'s public barrel (docs/architecture/05) — the
 * lesson module already imports this one for `ruleMaterial`, so the two names
 * each other's public API and neither reaches into the other's internals.
 *
 * WHAT THE GATE COSTS, measured (retrieval.test.ts prints it): the whole
 * first-aid corpus goes dark for the tutor, and so does every road sign (0 of
 * 77 are `approved` today). That is the correct trade and it is the one the
 * classroom already made — the student gets a refusal that names the boundary
 * instead of a confident paragraph with a law citation stapled to unreviewed
 * clinical instruction.
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import {
  conceptClearance,
  questionClearance,
  signClearance,
  type Clearance,
  type WithheldReason,
} from "@/modules/lesson";
import { VIOLATIONS, parseRuleLawRef, type SeverityClass } from "@/modules/sim/rules";

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

/**
 * ADMISSION FLOOR: what fraction of the student's content words a material must
 * actually contain before it may be called grounding. Ranking is a separate
 * question — this decides whether an item is in the room at all.
 *
 * WHY IT EXISTS, and it is a consequence of the clearance filter above rather
 * than an independent idea. Before the filter, the score floor was one fuzzy
 * prefix hit (0.7), and it survived only because the on-topic rows crowded the
 * junk out of six slots. Withhold the on-topic rows and the junk is all that is
 * left. MEASURED, immediately after the gate went in:
 *
 *   „Как се спира силно кръвотечение?" → c-stopping-standing-rules („Как се
 *   спира и престоява правилно"), q-vehicle-011 (brakes), q-speed-034, two
 *   motorway rows — six approved materials, every one about stopping a CAR,
 *   under a question about arterial bleeding.
 *   „Кога се прави сърдечен масаж?" → six rows about overtaking, ambulances
 *   and left turns.
 *
 * That is worse than the refusal it replaced, and it is worse in the ADR-002
 * direction specifically: the model is handed six REVIEWED rows carrying real
 * lawRefs, and rule 3 of the system prompt tells it to cite what it uses. A
 * confident citation of чл. 98 under a first-aid question is a fabrication with
 * a whitelist-approved chip on it — the citation validator cannot catch it,
 * because the reference really was injected.
 *
 * WHY A FRACTION AND NOT A HIGHER SCORE. The score is a SUM, so it grows with
 * question length: a floor that silences „Кога мога да изпреварвам?" (1 content
 * token) lets a six-word question through on two stray matches. The fraction
 * asks the question that actually matters — „how much of what the student asked
 * is in this material" — and it is length-invariant.
 *
 * WHY 0.5, measured over 12 questions the bank genuinely covers and 6 it does
 * not (the sweep is reproduced in retrieval.test.ts):
 *
 *   floor   answerable questions left with nothing   uncovered questions still grounded
 *   0.00    0 / 12                                   5 / 6
 *   0.34    0 / 12                                   2 / 6
 *   0.50    0 / 12                                   1 / 6   ← and that one is a TRUE hit
 *   0.60    2 / 12                                   1 / 6
 *   0.67    5 / 12                                   1 / 6
 *
 * 0.5 is the knee: it costs nothing the bank can answer and removes almost
 * everything it cannot. (The survivor at 0.5 is „Как се сменя гума?", which
 * lands on q-vehicle-046 „Сменяш спукана гума…" at 0.85 — the question set was
 * wrong about that one, not the floor.) Above the knee the cost is immediate
 * and real: at 0.6 „Кога трябва да пропусна пешеходец?" goes dark.
 */
export const MIN_QUESTION_COVERAGE = 0.5;

/** Weight multiplier for matches in the item's title vs. its body. */
const TITLE_WEIGHT = 3;
const EXACT_MATCH = 1;
const PREFIX_MATCH = 0.7;
/** Minimum shared length for a prefix match (absorbs noun inflection). */
const PREFIX_MIN_LENGTH = 4;

/**
 * Function words + question scaffolding that carry no retrieval signal.
 * Deliberately small — over-aggressive stopwording hurts short questions.
 *
 * THE SECOND GROUP is imperative scaffolding, and it was added when
 * MIN_QUESTION_COVERAGE made the DENOMINATOR matter. Before the coverage floor
 * a junk token was merely harmless — it scored nothing and the sum ignored it.
 * Now it dilutes: „Обясни ми предимството" is two tokens, only one of which any
 * material can contain, so a perfect hit on „предимство" scores coverage 0.35
 * and the tutor refuses the single most natural thing a student types at a
 * teacher. „Обясни" and „кажи" are how a 17-year-old addresses a person; they
 * are not what they are asking about.
 *
 * The bar for membership is the one this list already had: the word must be
 * scaffolding in EVERY question, not merely common. That is why „пешеходец",
 * „знак" and „спира" are absent however often they appear — each of them is
 * the subject of some question.
 */
const STOPWORDS_BG = new Set([
  "а", "аз", "ако", "але", "би", "бих", "ва", "вие", "във", "в", "го", "да",
  "дали", "де", "до", "е", "един", "една", "едно", "за", "защо", "значи", "и",
  "или", "им", "има", "имам", "как", "каква", "какви", "какво", "какъв", "ли",
  "кога", "кое", "кои", "кой", "колко", "коя", "къде", "ме", "ми", "мога",
  "на", "не", "него", "ни", "ние", "но", "нея", "от", "по", "при", "с", "са",
  "се", "си", "сме", "сте", "съм", "така", "тази", "те", "тези", "ти", "то",
  "това", "този", "той", "трябва", "тя", "че", "ще", "що", "я",
  // Imperative scaffolding — „ask the teacher" verbs, not subjects.
  "гледам", "искам", "казва", "кажеш", "кажи", "може", "нещо", "обясни",
  "обясниш", "означава", "питам", "прави", "правя", "разкажи", "става",
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

// ---------------------------------------------------------------------------
// The withheld log — the part that makes a refusal visible to US
// ---------------------------------------------------------------------------

/**
 * One content row retrieval refused to hand a model.
 *
 * SEPARATE FROM THE CLASSROOM'S RING (lesson/clearance.ts `WithheldSource`) on
 * purpose, and the difference is the whole reason it is worth having: that one
 * records „lesson L, beat B would not say row R", which is a fact about a
 * lesson. This one records „row R is not available to the tutor at all", which
 * is a fact about the CORPUS. A retrieval refusal has no beat to name — free
 * chat has no beat — and reporting it under a fabricated one would make the
 * gap look like a lesson defect somebody could fix by editing a lesson.
 *
 * PRIVACY (ADR-004, these are minors): a record names a CONTENT ROW and never
 * a user, a thread or a question. What was asked is a content gap and
 * `interrupt.ts` already logs those, also without a user id.
 */
export interface WithheldMaterial {
  kind: "concept" | "question" | "sign";
  id: string;
  reason: WithheldReason;
  ts: number;
}

const WITHHELD_RING_SIZE = 200;
const withheldRing: WithheldMaterial[] = [];
let withheldSink: ((record: WithheldMaterial) => void) | null = null;

/** Seam for a persistent sink (logging, an admin page). Never given a user id. */
export function setWithheldMaterialSink(
  next: ((record: WithheldMaterial) => void) | null,
): void {
  withheldSink = next;
}

export function recentWithheldMaterials(): readonly WithheldMaterial[] {
  return withheldRing;
}

export function resetWithheldMaterials(): void {
  withheldRing.length = 0;
}

/**
 * Deduplicated on (kind, id): a scan of the whole bank refuses the same 361
 * rows on every single question, so counting presses would bury the artifact
 * within one conversation. WHICH rows are dark is the artifact; how often a
 * scorer walked past them is noise.
 */
function noteWithheldFromRetrieval(record: Omit<WithheldMaterial, "ts">): void {
  const key = `${record.kind}|${record.id}`;
  if (withheldRing.some((r) => `${r.kind}|${r.id}` === key)) return;
  const full: WithheldMaterial = { ...record, ts: Date.now() };
  withheldRing.push(full);
  if (withheldRing.length > WITHHELD_RING_SIZE) withheldRing.shift();
  if (withheldSink !== null) {
    try {
      withheldSink(full);
    } catch {
      // A logging failure must never take the tutor down with it.
    }
  }
}

/**
 * How well a material answers this question, on two independent axes.
 *
 * `score` RANKS (title-weighted, unbounded, the v1 scorer unchanged).
 * `coverage` ADMITS: the fraction of the student's content words that appear
 * anywhere in the material, in [0, 1]. Title and body are pooled for coverage
 * because a word the student used is evidence wherever it sits; the title boost
 * is a ranking opinion and has no business in an admission test.
 *
 * Both come from ONE tokenization of each field, so the extra pass costs a
 * third `scoreTokens` walk and no re-tokenization.
 */
function judgeCandidate(
  queryTokens: string[],
  c: Candidate,
  bodyForSearch: string = c.bodyBg,
): { score: number; coverage: number } {
  const titleTokens = tokenizeBg(c.titleBg);
  const bodyTokens = tokenizeBg(bodyForSearch);
  return {
    score:
      TITLE_WEIGHT * scoreTokens(queryTokens, titleTokens) +
      scoreTokens(queryTokens, bodyTokens),
    coverage:
      scoreTokens(queryTokens, [...titleTokens, ...bodyTokens]) /
      queryTokens.length,
  };
}

/**
 * Rank the CLEARED part of the content bank against the student's question and
 * return the top materials.
 *
 * This doc comment used to read „Draft/needs-review items are included on
 * purpose — the tutor's grounding contract is «our content only», not
 * «approved content only»". That sentence was the charter for the defect: the
 * bank is not one corpus with one trust level. 290 of its 1,089 questions are
 * `needs-review`, 71 of 77 signs are `draft`, and 29 first-aid rows were
 * regrounded on ERC 2025 / RCUK 2025 with several answers REVERSED. „Our
 * content" and „content a person has checked" stopped being the same claim on
 * the day the second one started to matter.
 */
export function retrieveMaterials(
  repo: ContentRepo,
  question: string,
  limit: number = MAX_RETRIEVED_ITEMS,
): RetrievedItem[] {
  return rankMaterials(repo, question, limit, null);
}

/**
 * The same ranking, RESTRICTED TO ONE TOPIC — the lesson classroom's Tier-2
 * (doc 84 §2.2).
 *
 * A lesson creates a failure mode free chat does not have: a WARM question
 * with strong context. The student has just watched the right-of-way board and
 * asks „а ако другият е трамвай?" — the model then has six retrieved
 * materials, a plausible topic and conversational momentum, which is the exact
 * situation in which a model invents an article number. Not when it knows
 * nothing; when it NEARLY knows.
 *
 * So a lesson's retrieval is narrower than free chat's, not wider. If the
 * student is in the pedestrians lesson and asks about motorway lane
 * discipline, the honest answer is „different lesson" — not a confident
 * paragraph assembled from the far side of the bank. Narrow retrieval produces
 * more refusals and fewer inventions, and in a product for minors that is the
 * correct trade.
 *
 * Signs are topic-less in the bank, so they are excluded here rather than
 * guessed at: a sign that matters to a lesson is already named in the beat's
 * Tier-1 `signIds`.
 */
export function retrieveMaterialsInTopic(
  repo: ContentRepo,
  question: string,
  topicId: string,
  limit: number = MAX_RETRIEVED_ITEMS,
): RetrievedItem[] {
  return rankMaterials(repo, question, limit, topicId);
}

/**
 * THE GATE, and the only place a content-bank row becomes a candidate.
 *
 * Both ranked paths — free chat and the classroom's Tier 2 — go through this
 * one function, so there is exactly one line to read to know what the model may
 * see. `withheld` is called for every refusal, which is what makes a silent
 * corpus visible to US rather than only to the student who got a refusal.
 *
 * A withheld row is DROPPED, not substituted and not summarised. There is
 * nothing honest to substitute with: a sentence about first aid that we wrote
 * to fill the gap is the very thing this gate exists to prevent, and a title
 * without its body is a heading over an answer the model would then supply
 * from memory — ADR-002's exact failure.
 */
function clearedCandidates(
  repo: ContentRepo,
  topicId: string | null,
): Candidate[] {
  const inTopic = new Set<string>(
    topicId === null
      ? []
      : repo
          .concepts()
          .filter((c) => c.topicId === topicId)
          .map((c) => c.id),
  );

  const candidates: Candidate[] = [];

  for (const c of repo.concepts()) {
    if (topicId !== null && c.topicId !== topicId) continue;
    if (!cleared("concept", c.id, conceptClearance(c))) continue;
    candidates.push({
      kind: "concept",
      id: c.id,
      titleBg: c.titleBg,
      bodyBg: c.summaryBg,
      lawRefs: c.lawRefs,
    });
  }

  for (const q of repo.questions()) {
    if (topicId !== null && !q.conceptIds.some((id) => inTopic.has(id))) continue;
    if (!cleared("question", q.id, questionClearance(q))) continue;
    candidates.push({
      kind: "question",
      id: q.id,
      titleBg: q.textBg,
      bodyBg: q.explanationBg,
      lawRefs: q.lawRefs,
    });
  }

  // Signs are topic-less in the bank, so a topic-scoped retrieval excludes them
  // rather than guessing (see retrieveMaterialsInTopic). A sign that matters to
  // a lesson is already named in the beat's Tier-1 `signIds`, where
  // `beatMaterials` applies this same check.
  if (topicId === null) {
    for (const s of repo.signs()) {
      if (!cleared("sign", s.id, signClearance(s))) continue;
      candidates.push({
        kind: "sign",
        id: s.id,
        titleBg: `Знак ${s.code} „${s.nameBg}“`,
        bodyBg: s.meaningBg,
        lawRefs: s.lawRefs,
      });
    }
  }

  return candidates;
}

function cleared(
  kind: "concept" | "question" | "sign",
  id: string,
  clearance: Clearance,
): boolean {
  if (clearance.cleared) return true;
  noteWithheldFromRetrieval({ kind, id, reason: clearance.reason });
  return false;
}

function rankMaterials(
  repo: ContentRepo,
  question: string,
  limit: number,
  topicId: string | null,
): RetrievedItem[] {
  const queryTokens = tokenizeBg(question);
  if (queryTokens.length === 0) return [];

  return clearedCandidates(repo, topicId)
    .map((c) => ({ ...c, ...judgeCandidate(queryTokens, c) }))
    .filter((c) => c.coverage >= MIN_QUESTION_COVERAGE && c.score >= PREFIX_MATCH)
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
 * a small, broad-brush corpus — 52 violation entries covering the whole of
 * driving — so a weak match on one inflected word would let almost any
 * question drag in a rule. One full token's worth of overlap is the floor.
 *
 * IT WAS NOT ENOUGH ON ITS OWN, and the same measurement that produced
 * MIN_QUESTION_COVERAGE showed it: „Кога се прави сърдечен масаж?" dragged in
 * RAIL_CROSSING_VIOLATION (2.80) and „Как се мести пострадал…" dragged in
 * STOP_LINE_OVERSHOOT (3.00) — because one absolute token of overlap is easy
 * to reach and says nothing about whether the entry is ABOUT the question. The
 * coverage floor below is the same admission test the content bank now gets,
 * and it is the one that removes those two.
 */
const RULE_MIN_SCORE = EXACT_MATCH;

const SEVERITY_LABEL_BG: Record<SeverityClass, string> = {
  opasna: "опасна",
  osnovna: "основна",
  vtorostepenna: "второстепенна",
};

/**
 * Split "ЗДвП чл. 21" into the {act, ref} shape the citation whitelist works
 * on.
 *
 * A trailing gloss in parentheses is dropped: "ППЗДвП надлъжна пътна
 * маркировка (М1 — единична непрекъсната линия)" is the rule engine's note to
 * itself, not part of the legal reference. Left in, it would turn a citation
 * chip into a sentence and make two entries citing the same наредба render as
 * two different sources.
 *
 * THE SPLIT MOVED FROM THE REF TO THE ACT (2026-08-09) and lives in
 * `@/modules/sim/rules parseRuleLawRef`, which is also what
 * `modules/hazard/feedback.ts` now calls — the two were hand-copies, and both
 * copies split at the first reference token, so „Наредба № РД-02-21-1…" split
 * inside the act's own designation and a subject-level citation with no number
 * („ППЗДвП светлинни сигнали за регулиране на движението", the shape every
 * ППЗДвП entry now has after the article numbers came off acts the repo does
 * not hold) produced no citation at all.
 *
 * Still returns null for an unrecognised act — a bare act name is not a citable
 * reference, and manufacturing one is precisely what ADR-002 forbids. The entry
 * still grounds the answer; it just contributes no citation.
 */
export function parseCatalogLawRef(raw: string): LawRef | null {
  return parseRuleLawRef(raw);
}

interface RuleCandidate extends Candidate {
  /**
   * The text the SCORER sees. The severity/points line that heads the display
   * body is deliberately left out of it: that line is near-identical across
   * every entry, so scoring it would give every rule a free match on
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

/**
 * ONE catalogue entry as a grounding material, by code — the injected (Tier-1)
 * counterpart of the ranked lookup below.
 *
 * A lesson beat names its rule codes, so it does not need to search for them;
 * it needs them shaped exactly the way the ranked path shapes them, so that a
 * lesson answer and a chat answer about the same fault quote the same
 * classification line, the same corrective and the same citation. Building
 * that body in a second place is how those two drift apart.
 *
 * `score` is 0: nothing ranked it, an author named it.
 */
export function ruleMaterial(code: string): RetrievedItem | null {
  const candidate = RULE_CANDIDATES.find((c) => c.id === `rule:${code}`);
  if (candidate === undefined) return null;
  const { kind, id, titleBg, bodyBg, lawRefs } = candidate;
  return { kind, id, titleBg, bodyBg, lawRefs, score: 0 };
}

/** Rank the rule catalog against the student's question. */
export function retrieveRuleMaterials(
  question: string,
  limit: number = MAX_RETRIEVED_RULES,
): RetrievedItem[] {
  const queryTokens = tokenizeBg(question);
  if (queryTokens.length === 0) return [];

  return RULE_CANDIDATES.map((c) => ({
    ...c,
    ...judgeCandidate(queryTokens, c, c.searchBodyBg),
  }))
    .filter(
      (c) => c.coverage >= MIN_QUESTION_COVERAGE && c.score >= RULE_MIN_SCORE,
    )
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

/**
 * Grounding for one turn OF A CONVERSATION (doc 81 §1.4, D2).
 *
 * „А защо?" — the second thing a Bulgarian teenager says in almost every
 * exchange — tokenizes to NOTHING: „а" and „защо" are both function words in
 * STOPWORDS_BG. Retrieval returned [], the prompt said „(няма намерени
 * материали по този въпрос)", and rule 2 of the system prompt then FORCED the
 * refusal „Нямам материал за това". The tutor refused the most natural
 * follow-up there is, deterministically, on nearly every conversation.
 *
 * The repair is deliberately narrow. The previous question is folded in ONLY
 * when the current one carries no retrievable token at all — i.e. when it is
 * pure conversational glue that can only mean „about what we were just
 * discussing". A question that HAS content tokens and still matches nothing is
 * a genuinely new topic our corpora do not cover, and it must keep refusing:
 * widening the fallback there would let the previous topic's materials sit
 * under an answer they do not support, which is exactly the ADR-002 failure
 * this whole layer exists to prevent.
 *
 * Only the student's own previous QUESTION is reused, never the tutor's
 * answer. Model output must never get a vote in what counts as grounding.
 */
export function retrieveGroundingForTurn(
  repo: ContentRepo,
  question: string,
  previousQuestionBg?: string | null,
): RetrievedItem[] {
  if (tokenizeBg(question).length > 0 || !previousQuestionBg) {
    return retrieveGrounding(repo, question);
  }
  // The follow-up still joins the query: it contributes no tokens today, but
  // it is what the student actually asked, and a future stopword edit must not
  // silently turn this into "retrieve the previous question" instead.
  return retrieveGrounding(repo, `${previousQuestionBg} ${question}`);
}
