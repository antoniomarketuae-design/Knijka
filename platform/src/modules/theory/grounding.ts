/**
 * THE TWO-WAY CHECK between the question bank and the non-statutory source
 * registers — the half of ADR-002 that nothing was enforcing.
 *
 * WHAT WAS ACTUALLY BROKEN. `content/medical/` was built to close the audit's
 * worst finding: twenty-nine first-aid questions teaching compression depth,
 * compression rate and a breathing check while citing **ЗДвП чл. 123**, the
 * duty to stop and assist — an article that contains no clinical value of any
 * kind (docs/education/90 §14.5, Tier C). The register landed. `sourceRefs`
 * landed in content/SCHEMA.md. `claimsForQuestion()` landed in
 * lib/content/sources. And then the two halves were never joined: measured on
 * this bank before this module existed, **the register named 28 first-aid rows
 * across 35 (question, claim) pairs and not one of those rows cited a claim
 * back** — 2 of 1,089 rows in the whole repo carried any `sourceRefs` at all.
 *
 * That is a worse state than the original defect rather than a better one, and
 * for a reason worth naming: the register made the product LOOK grounded to
 * anyone who opened `content/medical/claims.json`, while the tutor — which
 * grounds on what the ROW cites — still had nothing but чл. 123 to retrieve.
 *
 * WHY A CHECKER AND NOT A LINT RULE. `platform/scripts/validate-content.mjs`
 * already checks that a `sourceRefs[].sourceId` resolves in a register. It
 * cannot check the direction that matters: whether a row that a clinical claim
 * is ABOUT actually points at it. Only the register knows which questions a
 * claim covers, so the check has to be a join, and a join has to live where
 * both sides can be read.
 *
 * WHAT IT DELIBERATELY DOES NOT REQUIRE. A claim with no citable quote cannot
 * be cited — `med-impaled-object` records that no source we hold says anything
 * about leaving an impaled object in a wound, and it carries zero quotes on
 * purpose so that finding one breaks the build. Demanding a `sourceRef` for it
 * would force a citation to a source that does not exist, which is the exact
 * failure mode this file was written to end. Same for `med-legal-duty`, whose
 * every quote is ЗДвП: that belongs in `lawRefs` and already is.
 */

import { getSourceRegistry, type SourceClaim } from "@/lib/content/sources";
import type { Question } from "@/lib/content/types";

/** A claim is citable when at least one of its quotes names a REGISTERED source. */
export function isCitableClaim(claim: SourceClaim): boolean {
  const quotes = [
    claim.authoritative,
    ...claim.corroborating,
    ...claim.conflicts.filter((c): c is Exclude<typeof c, string> => typeof c !== "string"),
  ].filter((q): q is NonNullable<typeof q> => q != null);
  return quotes.some((q) => q.sourceId.startsWith("src-"));
}

export interface GroundingGap {
  questionId: string;
  claimId: string;
  /** Why the row fails: it cites nothing non-statutory, or not THIS claim. */
  reason: "no-sourceRefs" | "claim-not-cited";
}

/**
 * Every (question, claim) pair where the register says a non-statutory source
 * settles part of the answer and the row does not say so.
 *
 * Direction matters: this walks the REGISTER and looks for the row, never the
 * other way round. A sweep that walked the rows would report a clean bank the
 * moment the rows stopped citing anything at all.
 */
export function findGroundingGaps(questions: readonly Question[]): GroundingGap[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const gaps: GroundingGap[] = [];

  for (const claim of getSourceRegistry().claims.values()) {
    if (!isCitableClaim(claim)) continue;
    for (const questionId of claim.questionIds) {
      const question = byId.get(questionId);
      // A claim may name a row that has since left the bank. That is a stale
      // register, not an ungrounded question, and it is not this check's job.
      if (!question) continue;
      const refs = question.sourceRefs ?? [];
      if (refs.length === 0) {
        gaps.push({ questionId, claimId: claim.id, reason: "no-sourceRefs" });
        continue;
      }
      if (!refs.some((r) => r.claimId === claim.id)) {
        gaps.push({ questionId, claimId: claim.id, reason: "claim-not-cited" });
      }
    }
  }
  return gaps;
}

export interface DanglingRef {
  questionId: string;
  sourceId: string;
  claimId: string;
}

/**
 * Rows whose `claimId` names a claim that does not exist.
 *
 * `validate-content.mjs` checks the SHAPE of `claimId` (kebab-case) and the
 * existence of `sourceId`, and stops there — so a citation pointing at a claim
 * nobody wrote passes the content gate today. The review console would render
 * it as a MISS, i.e. the reviewer sees "no quote" and cannot tell a typo from
 * a source that genuinely says nothing.
 */
export function findDanglingClaimRefs(questions: readonly Question[]): DanglingRef[] {
  const { claims } = getSourceRegistry();
  const out: DanglingRef[] = [];
  for (const q of questions) {
    for (const ref of q.sourceRefs ?? []) {
      if (ref.claimId && !claims.has(ref.claimId)) {
        out.push({ questionId: q.id, sourceId: ref.sourceId, claimId: ref.claimId });
      }
    }
  }
  return out;
}
