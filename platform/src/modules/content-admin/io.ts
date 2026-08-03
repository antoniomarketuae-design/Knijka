/**
 * Server-only filesystem layer for the content-review tool.
 *
 * Reads the versioned question JSON in /content FRESH on every call (never the
 * frozen build-time contentRepo) so the review page reflects on-disk edits
 * immediately, and writes decisions back safely:
 *   validate-before-write (zod) → house-style serialise → atomic temp+rename.
 *
 * SINCE THE LAW AUDIT (docs/education/90 §1) this layer also owns the honest
 * half of the story. Setting `"status": "approved"` on a row is no longer a
 * review — a generator did that 1,005 times. A review is a SIGNATURE in
 * content/review/approvals.json over the row's content hash, and it is minted
 * here, from the authenticated session, one row at a time. There is
 * deliberately no bulk path: a button that signs thirty rows nobody read is the
 * exact mechanism that produced the defect this file exists to fix.
 *
 * Every write refuses to run when NODE_ENV === "production". This tool edits
 * the product's source-of-truth content and must never be reachable in prod.
 */
import fs from "node:fs";
import path from "node:path";
import type { Question, Topic } from "@/lib/content/types";
import {
  approvalStateOf,
  indexLedger,
  makeSignature,
  readLedger,
  withSignature,
  writeLedgerAtomic,
} from "./approvals";
import {
  checkQuotedClaims,
  compareRisk,
  diffAgainstBaseline,
  lawEvidenceFor,
  loadDiffBaseline,
  repoRootFor,
  type DiffBaseline,
} from "./evidence";
import { hashQuestionContent } from "./hash";
import {
  applyDecision,
  detectLawRefsStyle,
  extractReviewNote,
  serializeQuestionsFile,
  stripReviewPrefix,
  validateQuestionsFile,
} from "./logic";
import type {
  ApprovalEntry,
  DecisionOutcome,
  FlaggedListResult,
  FlaggedQuestionDto,
  ReviewCensus,
  ReviewDecision,
  ReviewQueue,
  ReviewTopicSummary,
  RiskTally,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "modules/content-admin/io is server-only — import it from server code, never from a client component",
  );
}

/** Rows per page. Small enough that every card on screen is fully rendered
 *  (statute text and all) with no spinner between keystrokes. */
export const REVIEW_PAGE_SIZE = 20;

/** Hard gate: the file-writing paths must never execute in production. */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("content-admin write tools are disabled in production");
  }
}

// ---------------------------------------------------------------------------
// Content directory + reads
// ---------------------------------------------------------------------------

/**
 * /content lives at the repo root, one level above platform/. Next.js and
 * vitest run with cwd = platform/, repo tooling with cwd = repo root — probe
 * both (mirrors lib/content/loader.ts).
 */
function resolveContentDir(): string {
  const candidates = [
    path.join(process.cwd(), "content"),
    path.resolve(process.cwd(), "..", "content"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "topics.json"))) return dir;
  }
  throw new Error(
    `Content directory not found (cwd: ${process.cwd()}). Looked for topics.json in: ${candidates.join(", ")}`,
  );
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

function readTopics(dir: string): Topic[] {
  const topics = readJson(path.join(dir, "topics.json"));
  return (Array.isArray(topics) ? (topics as Topic[]) : []).slice().sort((a, b) => a.order - b.order);
}

function questionsFilePath(dir: string, slug: string): string {
  return path.join(dir, "questions", `${slug}.json`);
}

/** Raw questions of one topic file (already valid on disk), or [] if missing. */
function readQuestionsFile(dir: string, slug: string): Question[] {
  const file = questionsFilePath(dir, slug);
  if (!fs.existsSync(file)) return [];
  const data = readJson(file);
  return Array.isArray(data) ? (data as Question[]) : [];
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

function toDto(
  q: Question,
  topic: Pick<Topic, "slug" | "titleBg">,
  signature: ApprovalEntry | undefined,
  baseline: DiffBaseline,
): FlaggedQuestionDto {
  const explanationClean = stripReviewPrefix(q.explanationBg);
  const lawEvidence = lawEvidenceFor(q.lawRefs);
  return {
    id: q.id,
    topicSlug: topic.slug,
    topicTitleBg: topic.titleBg,
    conceptIds: q.conceptIds,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    options: q.options.map((o) => ({ id: o.id, textBg: o.textBg, correct: o.correct })),
    explanationBg: q.explanationBg,
    explanationClean,
    reviewNote: extractReviewNote(q.explanationBg),
    lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
    status: q.status,
    approval: approvalStateOf(q, signature),
    lawEvidence,
    quotedClaims: checkQuotedClaims(explanationClean, lawEvidence),
    diff: diffAgainstBaseline(q, baseline),
    contentHash: hashQuestionContent(q),
  };
}

interface QueuedRow {
  question: Question;
  topic: Topic;
}

/**
 * The two backlogs, and why there are two.
 *
 *  - `needs-review` — a person or an audit named a specific problem. Also holds
 *    rows whose signature went STALE (signed once, edited since): the row is
 *    quietly unapproved and has to be re-signed, which the reviewer must see.
 *  - `unsigned` — the 800-odd rows that say `approved` because a generator
 *    wrote it. They are the ones reaching students today on nobody's authority.
 */
function collectQueue(
  dir: string,
  topics: readonly Topic[],
  signatures: Map<string, ApprovalEntry>,
  queue: ReviewQueue,
): { rows: QueuedRow[]; census: ReviewCensus; summaries: ReviewTopicSummary[] } {
  const rows: QueuedRow[] = [];
  const summaries: ReviewTopicSummary[] = [];
  const census: ReviewCensus = {
    total: 0,
    draft: 0,
    machineChecked: 0,
    needsReview: 0,
    approved: 0,
    humanApproved: 0,
    unsignedApproved: 0,
    staleSignatures: 0,
    unsignedApprovedBaseline: 0,
  };

  for (const topic of topics) {
    let inQueue = 0;
    for (const q of readQuestionsFile(dir, topic.slug)) {
      census.total += 1;
      if (q.status === "draft") census.draft += 1;
      else if (q.status === "machine-checked") census.machineChecked += 1;
      else if (q.status === "needs-review") census.needsReview += 1;
      else if (q.status === "approved") census.approved += 1;

      const state = approvalStateOf(q, signatures.get(q.id));
      if (state.kind === "human-approved" && q.status === "approved") census.humanApproved += 1;
      if (state.kind === "unsigned-claim") census.unsignedApproved += 1;
      if (state.kind === "signature-stale") census.staleSignatures += 1;

      const belongs =
        queue === "needs-review"
          ? q.status === "needs-review" || state.kind === "signature-stale"
          : state.kind === "unsigned-claim";
      if (!belongs) continue;
      rows.push({ question: q, topic });
      inQueue += 1;
    }
    if (inQueue > 0) {
      summaries.push({ slug: topic.slug, titleBg: topic.titleBg, needsReviewCount: inQueue });
    }
  }

  return { rows, census, summaries };
}

export interface ListFlaggedOptions {
  queue?: ReviewQueue;
  page?: number;
  pageSize?: number;
}

const EMPTY_TALLY = (): RiskTally => ({
  "key-flip": 0,
  "answer-text": 0,
  stem: 0,
  explanation: 0,
  citation: 0,
  untouched: 0,
});

/**
 * One page of the review queue, RANKED BY RISK, with every piece of evidence
 * needed to clear a row already on it.
 *
 * WHY THE ORDER CHANGED. This used to hand back curriculum order, which is the
 * order the content was authored in and has nothing to do with what a reviewer
 * should look at first. Measured on this tree: of the 252 rows waiting, six
 * have a moved ANSWER KEY — and in curriculum order they sat at positions 150,
 * 154, 161, 171, 226 and 231, i.e. pages 8, 9, 9, 12, 12 and 12 of 13. The
 * founder had to clear 149 citation tidy-ups before meeting the first row that
 * could mark a right answer wrong. They are now the first six cards he sees.
 *
 * The cost of that: the diff must be computed for the WHOLE queue before paging
 * (a page slice cannot know about a key flip on page 12), so `loadDiffBaseline`
 * is asked for every topic that has a queued row instead of only the page's.
 * That is why the baseline is cached by resolved commit sha — see evidence.ts.
 * Law retrieval and the quote check still run for the page slice only.
 */
export async function listFlaggedQuestions(
  options: ListFlaggedOptions = {},
): Promise<FlaggedListResult> {
  const dir = resolveContentDir();
  const topics = readTopics(dir);
  const ledger = readLedger(dir);
  const signatures = indexLedger(ledger);
  const queue: ReviewQueue = options.queue === "unsigned" ? "unsigned" : "needs-review";
  const pageSize = Math.max(1, options.pageSize ?? REVIEW_PAGE_SIZE);

  const { rows, census, summaries } = collectQueue(dir, topics, signatures, queue);
  census.unsignedApprovedBaseline = ledger.unsignedApprovedBaseline;

  const baseline = loadDiffBaseline(
    repoRootFor(dir),
    rows.map((r) => r.topic.slug),
  );

  // Rank every queued row, then page. Ties keep curriculum order, so within a
  // band the queue still reads like the syllabus and a reviewer working
  // top-to-bottom stays inside one topic at a time.
  const risk = EMPTY_TALLY();
  const ranked = rows
    .map((r, index) => ({ ...r, index, diff: diffAgainstBaseline(r.question, baseline) }))
    .map((r) => {
      risk[r.diff.risk] += 1;
      return r;
    })
    .sort((a, b) => compareRisk(a.diff.risk, b.diff.risk) || a.index - b.index);

  const pageCount = Math.max(1, Math.ceil(ranked.length / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);
  const slice = ranked.slice((page - 1) * pageSize, page * pageSize);

  return {
    queue,
    flagged: slice.map((r) => toDto(r.question, r.topic, signatures.get(r.question.id), baseline)),
    topics: summaries,
    total: ranked.length,
    page,
    pageSize,
    pageCount,
    census,
    risk,
  };
}

// ---------------------------------------------------------------------------
// Atomic writes
// ---------------------------------------------------------------------------

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** rename can transiently EPERM on Windows (AV / indexer) — retry briefly. */
function renameWithRetry(from: string, to: string, attempts = 5): void {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      sleepSync(40);
    }
  }
}

/**
 * Replace a topic's questions file atomically. Validates the WHOLE array first
 * (never persist content we cannot re-validate), serialises to house style,
 * writes a sibling temp file, then renames over the target (atomic on the same
 * volume). On any failure the temp file is cleaned up and the original is
 * left untouched.
 */
function writeQuestionsFileAtomic(dir: string, slug: string, questions: Question[]): void {
  assertNotProduction();

  const validated = validateQuestionsFile(questions);
  if (!validated.ok) {
    throw new Error(`Отказан запис — невалидно съдържание:\n${validated.error}`);
  }

  const target = questionsFilePath(dir, slug);
  // Preserve the file's existing lawRefs formatting so untouched questions
  // don't reflow (patni-znatsi writes lawRefs one-per-line; the rest inline).
  const style = fs.existsSync(target) ? detectLawRefsStyle(fs.readFileSync(target, "utf8")) : "inline";
  const serialized = serializeQuestionsFile(validated.questions, style);
  const tmp = path.join(dir, "questions", `.${slug}.json.tmp-${process.pid}-${Date.now()}`);

  fs.writeFileSync(tmp, serialized, "utf8");
  try {
    renameWithRetry(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * Apply one decision to a single question, persist the row, and — this is the
 * part that makes the word "approved" mean something — record WHO decided it,
 * WHEN, and over WHICH exact text.
 *
 * `reviewer` comes from the server session. It is never accepted from the wire:
 * a signature a caller can name themselves is the same worthless flag we are
 * replacing.
 */
export async function applyReviewDecision(
  questionId: string,
  decision: ReviewDecision,
  reviewer: string,
): Promise<DecisionOutcome> {
  assertNotProduction();
  const dir = resolveContentDir();
  const ledger = readLedger(dir);
  const signatures = indexLedger(ledger);

  for (const topic of readTopics(dir)) {
    const questions = readQuestionsFile(dir, topic.slug);
    const idx = questions.findIndex((q) => q.id === questionId);
    if (idx === -1) continue;

    const current = questions[idx];
    // The only thing that blocks a decision is a decision already on record for
    // this exact text — anything else (needs-review, an unsigned `approved`
    // claim, a stale signature) is precisely what the reviewer is here to fix.
    if (approvalStateOf(current, signatures.get(questionId)).kind === "human-approved") {
      return {
        ok: false,
        code: "already_signed",
        error: `Въпрос „${questionId}“ вече е подписан от човек в този си вид.`,
      };
    }

    const applied = applyDecision(current, decision);
    if (!applied.ok) {
      return { ok: false, code: "validation_failed", error: applied.error };
    }

    const next = [...questions];
    next[idx] = applied.question;
    try {
      writeQuestionsFileAtomic(dir, topic.slug, next);
    } catch (err) {
      return { ok: false, code: "write_failed", error: (err as Error).message };
    }

    // Sign AFTER the row is on disk, over the row as written — so the hash can
    // never describe a version that failed to persist.
    const signature = makeSignature(
      applied.question,
      decision.action === "reject" ? "rejected" : "approved",
      reviewer,
    );
    try {
      writeLedgerAtomic(dir, withSignature(ledger, signature));
    } catch (err) {
      return { ok: false, code: "write_failed", error: (err as Error).message };
    }

    return { ok: true, questionId, newStatus: applied.question.status, signature };
  }

  return { ok: false, code: "not_found", error: `Въпрос „${questionId}“ не е намерен.` };
}
