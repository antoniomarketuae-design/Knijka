/**
 * Pure logic for the content-review tool — no filesystem, no side effects, so
 * every rule here is unit-tested in-memory (logic.test.ts).
 *
 * Responsibilities:
 *  - strip / extract the auditors' "[REVIEW: …]" note prepended to explanationBg
 *  - apply a review decision (approve / reject / edit) as a validated state
 *    transition on a Question, reusing the authoritative zod QuestionSchema
 *  - parse the untrusted /api/review request body
 *  - serialise a questions array back to the on-disk "house style" so writes
 *    produce minimal git diffs, with a verified fallback to plain pretty JSON
 */
import { z } from "zod";
import { QuestionSchema, QuestionsFileSchema } from "@/lib/content/schemas";
import type { Question } from "@/lib/content/types";
import type { ApplyResult, QuestionPatch, ReviewDecision } from "./types";

// ---------------------------------------------------------------------------
// [REVIEW: …] note handling
// ---------------------------------------------------------------------------

/**
 * Matches a leading `[REVIEW: …]` auditor note plus its trailing whitespace.
 * Non-greedy up to the first `]` — the notes never contain a nested `]`.
 */
export const REVIEW_PREFIX_RE = /^\s*\[REVIEW:([\s\S]*?)\]\s*/;

/** Remove a leading `[REVIEW: …]` note. Idempotent; a no-op when absent. */
export function stripReviewPrefix(text: string): string {
  return text.replace(REVIEW_PREFIX_RE, "");
}

/** The note text inside a leading `[REVIEW: …]`, trimmed, or null if absent. */
export function extractReviewNote(text: string): string | null {
  const match = REVIEW_PREFIX_RE.exec(text);
  return match ? match[1].trim() : null;
}

export function hasReviewPrefix(text: string): boolean {
  return REVIEW_PREFIX_RE.test(text);
}

// ---------------------------------------------------------------------------
// Validation + decision transitions
// ---------------------------------------------------------------------------

/**
 * Validate an unknown candidate as a full Question against the authoritative
 * zod schema (structural + cross-field rules: single = 1 correct, multi >= 2,
 * unique option ids, points ∈ {1,2,3}, …).
 */
export function validateQuestion(candidate: unknown): ApplyResult {
  const result = QuestionSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }
  return { ok: true, question: result.data };
}

/**
 * Merge the editable patch fields onto a question. Whitelists exactly the
 * fields the founder may change — id, conceptIds, points and media are never
 * touched, so cross-file referential integrity cannot break. Returns an
 * unvalidated candidate (validateQuestion is the gate before any write).
 */
function mergePatch(question: Question, patch: QuestionPatch): unknown {
  const next: Record<string, unknown> = { ...question };
  if (patch.textBg !== undefined) next.textBg = patch.textBg;
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.explanationBg !== undefined) next.explanationBg = patch.explanationBg;
  if (patch.options !== undefined) {
    // Option media (THEO-1 sign faces) is NOT founder-editable — like
    // question media it is preserved by id so an edit can never drop it.
    const mediaById = new Map(question.options.map((o) => [o.id, o.media]));
    next.options = patch.options.map((o) => {
      const media = mediaById.get(o.id);
      return media === undefined
        ? { id: o.id, textBg: o.textBg, correct: o.correct }
        : { id: o.id, textBg: o.textBg, correct: o.correct, media };
    });
  }
  if (patch.lawRefs !== undefined) {
    next.lawRefs = patch.lawRefs.map((l) => ({ act: l.act, ref: l.ref }));
  }
  // `sourceRefs` is deliberately NOT editable from the console and is carried
  // through untouched by the spread above. A non-statutory citation only means
  // anything because a builder cut its quote out of fetched bytes and a
  // verifier can re-check it; a free-text box in a review screen would let
  // someone type a source id that resolves to nothing, which is the exact
  // defect the field was added to end.
  return next;
}

/**
 * Pure state transition for one review decision. Produces the fully validated
 * next question, or an error. Never mutates the input.
 *
 *  - approve: status → "approved", strip the [REVIEW: …] prefix.
 *  - reject:  status → "draft" (kept out of exams; the note is preserved so
 *             whoever regenerates the item still sees why it was flagged).
 *  - edit:    apply the patch, strip the prefix, status → "approved".
 */
export function applyDecision(question: Question, decision: ReviewDecision): ApplyResult {
  if (decision.action === "reject") {
    return validateQuestion({ ...question, status: "draft" });
  }

  if (decision.action === "approve") {
    return validateQuestion({
      ...question,
      status: "approved",
      explanationBg: stripReviewPrefix(question.explanationBg),
    });
  }

  // edit — apply patch, then approve (clean explanation).
  const merged = mergePatch(question, decision.patch) as Record<string, unknown>;
  const explanation =
    typeof merged.explanationBg === "string" ? merged.explanationBg : question.explanationBg;
  return validateQuestion({
    ...merged,
    explanationBg: stripReviewPrefix(explanation),
    status: "approved",
  });
}

// ---------------------------------------------------------------------------
// Wire parsing for POST /api/review (untrusted input)
// ---------------------------------------------------------------------------

const QuestionPatchSchema = z.strictObject({
  textBg: z.string().min(1).optional(),
  type: z.enum(["single", "multi"]).optional(),
  explanationBg: z.string().min(1).optional(),
  options: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        textBg: z.string().min(1),
        correct: z.boolean(),
      }),
    )
    .min(2)
    .optional(),
  lawRefs: z
    .array(z.strictObject({ act: z.string().min(1), ref: z.string().min(1) }))
    .min(1)
    .optional(),
});

const ReviewRequestSchema = z.discriminatedUnion("action", [
  z.object({ questionId: z.string().min(1), action: z.literal("approve") }),
  z.object({ questionId: z.string().min(1), action: z.literal("reject") }),
  z.object({ questionId: z.string().min(1), action: z.literal("edit"), patch: QuestionPatchSchema }),
]);

/** Parse the POST body; returns a typed decision or null (→ 400). */
export function parseReviewRequest(
  body: unknown,
): { questionId: string; decision: ReviewDecision } | null {
  const result = ReviewRequestSchema.safeParse(body);
  if (!result.success) return null;
  const value = result.data;
  if (value.action === "edit") {
    return { questionId: value.questionId, decision: { action: "edit", patch: value.patch } };
  }
  return { questionId: value.questionId, decision: { action: value.action } };
}

// ---------------------------------------------------------------------------
// House-style serialisation (minimal git diffs) with a verified fallback
// ---------------------------------------------------------------------------

/** Some files write lawRefs on one line, one file (patni-znatsi) one-per-line. */
export type LawRefsStyle = "inline" | "block";

/** Detect the lawRefs formatting a file already uses, to preserve it on write. */
export function detectLawRefsStyle(fileText: string): LawRefsStyle {
  return /"lawRefs":\s*\[\s*\n/.test(fileText) ? "block" : "inline";
}

function j(value: unknown): string {
  return JSON.stringify(value);
}

function renderLawRefs(
  lawRefs: { act: string; ref: string }[],
  indent: string,
  style: LawRefsStyle,
): string {
  if (lawRefs.length === 0) return "[]";
  const objs = lawRefs.map((l) => `{ "act": ${j(l.act)}, "ref": ${j(l.ref)} }`);
  if (style === "inline") return `[${objs.join(", ")}]`;
  const inner = `${indent}  `;
  return `[\n${objs.map((o) => inner + o).join(",\n")}\n${indent}]`;
}

/**
 * `sourceRefs` one object per line, and only when the row has any — the key
 * must not appear on the 1,089 rows that do not, or a review of one first-aid
 * question would rewrite every file it touches.
 */
function renderSourceRefs(sourceRefs: NonNullable<Question["sourceRefs"]>, indent: string): string {
  const inner = `${indent}  `;
  const objs = sourceRefs.map(
    (s) =>
      `${inner}{ "sourceId": ${j(s.sourceId)}, "ref": ${j(s.ref)}${
        s.claimId !== undefined ? `, "claimId": ${j(s.claimId)}` : ""
      } }`,
  );
  return `[\n${objs.join(",\n")}\n${indent}]`;
}

function renderScalarArray(values: string[]): string {
  return `[${values.map(j).join(", ")}]`;
}

function renderOptions(options: Question["options"], indent: string): string {
  const inner = `${indent}  `;
  const body = options
    .map(
      (o) =>
        `${inner}{ "id": ${j(o.id)}, "textBg": ${j(o.textBg)}, "correct": ${j(o.correct)}${
          o.media !== undefined ? `, "media": ${j(o.media)}` : ""
        } }`,
    )
    .join(",\n");
  return `[\n${body}\n${indent}]`;
}

function renderQuestion(q: Question, indent: string, style: LawRefsStyle): string {
  const f = `${indent}  `;
  const lines = [
    `${f}"id": ${j(q.id)}`,
    `${f}"conceptIds": ${renderScalarArray(q.conceptIds)}`,
    `${f}"type": ${j(q.type)}`,
    `${f}"points": ${j(q.points)}`,
    `${f}"textBg": ${j(q.textBg)}`,
    `${f}"options": ${renderOptions(q.options, f)}`,
    `${f}"explanationBg": ${j(q.explanationBg)}`,
    `${f}"lawRefs": ${renderLawRefs(q.lawRefs, f, style)}`,
    ...(q.sourceRefs && q.sourceRefs.length > 0
      ? [`${f}"sourceRefs": ${renderSourceRefs(q.sourceRefs, f)}`]
      : []),
    `${f}"media": ${j(q.media)}`,
    `${f}"status": ${j(q.status)}`,
  ];
  return `${indent}{\n${lines.join(",\n")}\n${indent}}`;
}

function renderQuestionsHouseStyle(questions: Question[], style: LawRefsStyle): string {
  if (questions.length === 0) return "[]\n";
  return `[\n${questions.map((q) => renderQuestion(q, "  ", style)).join(",\n")}\n]\n`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    if (ak.length !== Object.keys(bo).length) return false;
    return ak.every(
      (k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]),
    );
  }
  return false;
}

/**
 * Serialise a questions array to the on-disk house style (2-space indent,
 * scalar arrays inline, one option object per line; lawRefs inline or one per
 * line per `lawRefsStyle`, matching the file's existing convention → zero-diff
 * writes for untouched questions). Verified by a parse-back deep-equality
 * check: any divergence falls back to standard pretty JSON so a serialiser bug
 * can never corrupt or drop content — correctness over aesthetics. The array
 * must already be schema-valid.
 */
export function serializeQuestionsFile(
  questions: Question[],
  lawRefsStyle: LawRefsStyle = "inline",
): string {
  const house = renderQuestionsHouseStyle(questions, lawRefsStyle);
  try {
    if (deepEqual(JSON.parse(house), questions)) return house;
  } catch {
    /* fall through to the safe encoder */
  }
  return `${JSON.stringify(questions, null, 2)}\n`;
}

/**
 * Validate a whole questions file (every item) before it is written. A guard
 * for callers that assemble the array from disk + one changed item — we never
 * persist a file we cannot fully re-validate.
 */
export function validateQuestionsFile(
  questions: unknown,
): { ok: true; questions: Question[] } | { ok: false; error: string } {
  const result = QuestionsFileSchema.safeParse(questions);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }
  return { ok: true, questions: result.data };
}
