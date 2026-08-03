/**
 * TypeScript mirror of `tools/theory/question_hash.mjs` — the canonical content
 * hash a human signs when they approve a question.
 *
 * Two implementations exist because the two callers cannot share one file: the
 * validator is a dependency-free `.mjs` script that runs in CI, this one runs
 * inside Next's server bundle. `hash.lockstep.test.ts` imports BOTH and asserts
 * they agree on every question in the real bank, so the duplication cannot rot.
 *
 * Read the .mjs for the reasoning. In one line: `"status": "approved"` is a
 * string a generator can type, a signature over this hash is not — and it stops
 * matching the moment anyone edits the row, which is precisely the property the
 * flag was missing.
 */
import { createHash } from "node:crypto";
import type { Question } from "@/lib/content/types";

/** The part of a question a reviewer is signing off on. */
export interface CanonicalQuestionContent {
  id: string;
  type: Question["type"];
  points: Question["points"];
  textBg: string;
  options: { id: string; textBg: string; correct: boolean; media: unknown }[];
  explanationBg: string;
  lawRefs: { act: string; ref: string }[];
  media: unknown;
}

/**
 * Deterministic projection of the graded content. Key order is fixed by this
 * object literal, so re-serialising the file cannot change the hash.
 *
 * Excludes `status` (otherwise approving would invalidate its own signature)
 * and `conceptIds` (curriculum wiring, not something a reviewer reads the row
 * to check).
 */
export function canonicalQuestionContent(q: Question): CanonicalQuestionContent {
  return {
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    options: q.options.map((o) => ({
      id: o.id,
      textBg: o.textBg,
      correct: o.correct === true,
      media: o.media ?? null,
    })),
    explanationBg: q.explanationBg,
    lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
    media: q.media ?? null,
  };
}

/** `sha256:<64 hex>` over the canonical projection, UTF-8. */
export function hashQuestionContent(q: Question): string {
  const json = JSON.stringify(canonicalQuestionContent(q));
  return `sha256:${createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex")}`;
}

/** Shape guard for a stored hash string. */
export const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
