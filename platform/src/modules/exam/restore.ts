/**
 * Restoring an in-progress attempt — the READ path for a paper already dealt.
 *
 * WHY THIS EXISTS (audit H-7). The attempt page used to re-run `buildExam(seed)`
 * on every render. The builder's output depends on the *current* bank, so a
 * single `needs-review → approved` promotion between two renders deals a
 * different paper for the same seed — the audit measured 38 of 45 questions
 * swapped. Grading, meanwhile, uses the ids persisted at start, and
 * `gradeExam()` silently ignores answers for any other id: a perfect candidate
 * scored 20/97 and nothing anywhere reported an error. The page's `try/catch`
 * on ExamError could not help — a *different but valid* rebuild throws nothing.
 *
 * So: never rebuild. The attempt row already stores the dealt `questionIds`;
 * this module renders exactly those, in exactly that order.
 *
 * ELIGIBILITY POLICY (the rule this file enforces): exam eligibility is decided
 * ONCE, when the paper is dealt. A question that was legal to deal at start
 * stays part of that candidate's paper until they submit — whatever the
 * founder's /review tool does to its status in the meantime. Re-checking
 * `isExamEligible()` here would reintroduce H-7 through the back door.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question } from "../../lib/content/types";
import { createRng, deriveSeed, shuffle } from "./rng";
import type { ExamQuestion } from "./types";

/**
 * Outcome of restoring a paper. `missingIds` is the honest failure: a dealt
 * question has been deleted from the bank outright, so this attempt can no
 * longer be rendered faithfully.
 */
export type RestoredPaper =
  | { ok: true; questions: ExamQuestion[] }
  | { ok: false; missingIds: string[] };

/**
 * Resolve the dealt question ids into safe candidate-facing views.
 *
 * All-or-nothing on purpose: `maxScore` was frozen at 97 when the attempt was
 * created, so rendering 44 of 45 questions would hand the candidate a paper
 * they mathematically cannot pass. Better to stop and say so.
 */
export function restorePaper(
  questionIds: readonly string[],
  seed: number,
): RestoredPaper {
  const repo = getContentRepo();
  const resolved: Question[] = [];
  const missingIds: string[] = [];

  for (const id of questionIds) {
    const q = repo.questionById(id);
    // NB: no isExamEligible() check — see ELIGIBILITY POLICY above.
    if (q === undefined) missingIds.push(id);
    else resolved.push(q);
  }
  if (missingIds.length > 0) return { ok: false, missingIds };

  return { ok: true, questions: resolved.map((q) => toSafeView(q, seed)) };
}

/**
 * Safe view of one question: no `correct` flags, no `explanationBg`, no
 * `lawRefs`. Option media (THEO-1 sign faces) carries only a sign code and is
 * passed through.
 *
 * The option order comes from a seed derived per question (see deriveSeed), so
 * it is identical on the first paint and on every later resume, on any device,
 * regardless of what changed in the bank meanwhile.
 *
 * NOTE: builder.ts materializes its own copy of this projection from its RNG
 * stream. Both must stay leak-free; startExam() renders through THIS one so
 * that what the candidate first sees is byte-identical to what a resume shows.
 */
function toSafeView(q: Question, seed: number): ExamQuestion {
  const rng = createRng(deriveSeed(seed, q.id));
  return {
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    media: q.media,
    options: shuffle(q.options, rng).map((o) =>
      o.media === undefined
        ? { id: o.id, textBg: o.textBg }
        : { id: o.id, textBg: o.textBg, media: o.media },
    ),
  };
}
