/**
 * The teaching fingerprint — a LEAF module on purpose.
 *
 * `grader.ts` stamps this on every graded row (door 6, docs/education/92
 * §10.3) and `review.ts` compares it at read time. It lives in its own file
 * because those two have very different weights: `review.ts` imports
 * `@/modules/lesson` for the clearance gate, and `grader.ts` is documented as
 * „pure functions only (no repo, no store, no clock)" and is imported by every
 * exam path there is. Putting the hash in review.ts pulled the whole classroom
 * barrel into the grader's module graph and pushed two lifecycle tests past
 * their 5 s budget on load alone — measured, not guessed.
 *
 * Nothing here reads content, a clock, or a store. It hashes the object it is
 * handed.
 */

import { createHash } from "node:crypto";
import type { Question } from "../../lib/content/types";

/**
 * sha256-16 of EXACTLY the bytes a review teaches from — the stem, the option
 * texts, WHICH options are correct, the explanation and the citation lines.
 *
 * Not the whole `Question`: `status`, `conceptIds`, `points` and the media
 * fields are governed elsewhere (`questionClearance`, `maxPoints`), and hashing
 * them would make an editorial retag look like a changed answer key — which
 * trains everyone to ignore the notice. What is hashed is what a candidate
 * reads.
 *
 * The citation line is „`${act} ${ref}`", the same string
 * `modules/lesson/clearance.ts citationLine` hashes, so „the citation moved" is
 * one fact in this repo rather than two definitions of it.
 */
export function teachingPin(q: Question): string {
  const body = [
    q.textBg,
    q.type,
    ...q.options.map((o) => `${o.id}|${o.correct ? 1 : 0}|${o.textBg}`),
    q.explanationBg,
    ...q.lawRefs.map((l) => `${l.act} ${l.ref}`),
  ].join("\n");
  return createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex").slice(0, 16);
}
