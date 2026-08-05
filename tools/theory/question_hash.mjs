#!/usr/bin/env node
/**
 * The canonical content hash of a theory question — the thing a human signs.
 *
 * WHY THIS EXISTS. `"status": "approved"` is a string a generator can type, and
 * for 1,005 of 1,089 questions that is exactly what happened: the flag recorded
 * that a generator ran, not that a person read the row (docs/education/90 §1).
 * A flag that cannot be falsified is not a record, it is a claim. So an approval
 * is no longer a status string — it is a signature in
 * `content/review/approvals.json` over THIS hash, and the hash covers every byte
 * of the row a student is taught or graded on. Change one option, one article
 * number, one word of the explanation, and the signature stops matching: the row
 * silently drops back to unapproved and `validate:content` says so loudly.
 *
 * WHAT IS COVERED. Everything the student sees or is graded on: the stem, every
 * option (id, text, correct flag, sign face), the explanation, the law refs, the
 * media, the type and the point weight.
 *
 * WHAT IS NOT. `status` itself — otherwise approving a row would invalidate the
 * signature it just created. And `conceptIds`, which is curriculum wiring, not
 * something a reviewer reads the row to check.
 *
 * LOCKSTEP. `platform/src/modules/content-admin/hash.ts` is a TypeScript mirror
 * of this file (the app writes signatures; this script verifies them, and the
 * two must never disagree). `hash.lockstep.test.ts` runs BOTH over the whole
 * real bank and fails on the first divergence.
 */
import { createHash } from "node:crypto";

/**
 * Deterministic projection of the graded content. Key order is fixed by this
 * object literal, not by whatever order the JSON file happens to use, so a
 * re-serialisation that reorders fields cannot change the hash.
 */
export function canonicalQuestionContent(q) {
  return {
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    options: (Array.isArray(q.options) ? q.options : []).map((o) => ({
      id: o.id,
      textBg: o.textBg,
      correct: o.correct === true,
      media: o.media ?? null,
    })),
    explanationBg: q.explanationBg,
    lawRefs: (Array.isArray(q.lawRefs) ? q.lawRefs : []).map((l) => ({
      act: l.act,
      ref: l.ref,
    })),
    // Non-statutory grounding (`sourceRefs`) is covered too — a first-aid row's
    // ERC citation is exactly what a reviewer is signing off on, so swapping it
    // after approval must break the signature. The key is EMITTED ONLY when the
    // row has one: always emitting it would rewrite all 1,089 existing hashes
    // for a schema change that touched none of their content.
    sourceRefs:
      Array.isArray(q.sourceRefs) && q.sourceRefs.length > 0
        ? q.sourceRefs.map((s) =>
            s.claimId === undefined
              ? { sourceId: s.sourceId, ref: s.ref }
              : { sourceId: s.sourceId, ref: s.ref, claimId: s.claimId },
          )
        : undefined,
    media: q.media ?? null,
  };
}

/** `sha256:<64 hex>` over the canonical projection, UTF-8. */
export function hashQuestionContent(q) {
  const json = JSON.stringify(canonicalQuestionContent(q));
  return `sha256:${createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex")}`;
}

/** Shape guard for a stored hash string (used by the validator). */
export const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
