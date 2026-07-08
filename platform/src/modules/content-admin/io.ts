/**
 * Server-only filesystem layer for the content-review tool.
 *
 * Reads the versioned question JSON in /content FRESH on every call (never the
 * frozen build-time contentRepo) so the review page reflects on-disk edits
 * immediately, and writes decisions back safely:
 *   validate-before-write (zod) → house-style serialise → atomic temp+rename.
 *
 * Every write refuses to run when NODE_ENV === "production". This tool edits
 * the product's source-of-truth content and must never be reachable in prod.
 */
import fs from "node:fs";
import path from "node:path";
import type { Question, Topic } from "@/lib/content/types";
import {
  applyDecision,
  detectLawRefsStyle,
  extractReviewNote,
  serializeQuestionsFile,
  stripReviewPrefix,
  validateQuestionsFile,
} from "./logic";
import type {
  BulkApproveOutcome,
  DecisionOutcome,
  FlaggedListResult,
  FlaggedQuestionDto,
  ReviewDecision,
  ReviewTopicSummary,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "modules/content-admin/io is server-only — import it from server code, never from a client component",
  );
}

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

function toDto(q: Question, topic: Pick<Topic, "slug" | "titleBg">): FlaggedQuestionDto {
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
    explanationClean: stripReviewPrefix(q.explanationBg),
    reviewNote: extractReviewNote(q.explanationBg),
    lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
  };
}

/** All needs-review questions, in curriculum (topic order, then file) order. */
export async function listFlaggedQuestions(): Promise<FlaggedListResult> {
  const dir = resolveContentDir();
  const topics = readTopics(dir);

  const flagged: FlaggedQuestionDto[] = [];
  const topicSummaries: ReviewTopicSummary[] = [];

  for (const topic of topics) {
    const needs = readQuestionsFile(dir, topic.slug).filter((q) => q.status === "needs-review");
    if (needs.length === 0) continue;
    topicSummaries.push({
      slug: topic.slug,
      titleBg: topic.titleBg,
      needsReviewCount: needs.length,
    });
    for (const q of needs) flagged.push(toDto(q, topic));
  }

  return { flagged, topics: topicSummaries, total: flagged.length };
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

/** Apply one decision to a single question and persist it. */
export async function applyReviewDecision(
  questionId: string,
  decision: ReviewDecision,
): Promise<DecisionOutcome> {
  assertNotProduction();
  const dir = resolveContentDir();

  for (const topic of readTopics(dir)) {
    const questions = readQuestionsFile(dir, topic.slug);
    const idx = questions.findIndex((q) => q.id === questionId);
    if (idx === -1) continue;

    const current = questions[idx];
    if (current.status !== "needs-review") {
      return {
        ok: false,
        code: "not_needs_review",
        error: `Въпрос „${questionId}“ вече не чака преглед (статус: ${current.status}).`,
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

    return { ok: true, questionId, newStatus: applied.question.status };
  }

  return { ok: false, code: "not_found", error: `Въпрос „${questionId}“ не е намерен.` };
}

/** Approve every remaining needs-review question in one topic (spot-check aid). */
export async function bulkApproveTopic(slug: string): Promise<BulkApproveOutcome> {
  assertNotProduction();
  const dir = resolveContentDir();

  const topic = readTopics(dir).find((t) => t.slug === slug);
  if (!topic) return { ok: false, error: `Тема „${slug}“ не е намерена.` };

  const questions = readQuestionsFile(dir, slug);
  let approved = 0;
  try {
    const next = questions.map((q) => {
      if (q.status !== "needs-review") return q;
      const applied = applyDecision(q, { action: "approve" });
      if (!applied.ok) throw new Error(`Въпрос „${q.id}“: ${applied.error}`);
      approved += 1;
      return applied.question;
    });

    if (approved === 0) return { ok: true, approved: 0 };
    writeQuestionsFileAtomic(dir, slug, next);
    return { ok: true, approved };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
