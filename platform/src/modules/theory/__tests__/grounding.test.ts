/**
 * THE FIRST-AID GROUNDING GATE — against the REAL bank and the REAL registers.
 *
 * WHAT THIS CLOSES. docs/education/90 §14.5 Tier C: 29 first-aid questions
 * teaching compression depth, compression rate, a tourniquet position and a
 * breathing check, every one of them citing **ЗДвП чл. 123** — the duty to
 * stop and assist, which contains no clinical value at all. `content/medical/`
 * was then built to answer them (21 claims / 80 quotes, each cut from a fetched
 * guideline by a locator that throws on a miss), `sourceRefs` was added to
 * content/SCHEMA.md, and `claimsForQuestion()` was added to lib/content/sources
 * — and the rows themselves were never pointed at any of it.
 *
 * MEASURED by running this file against the bank at HEAD, before the rows were
 * regrounded — all three numbers are what the assertions below actually
 * printed, not estimates:
 *
 *     findGroundingGaps(repo.questions())  →  35 ungrounded (question, claim)
 *                                             pairs across 28 rows, every one
 *                                             of them "no-sourceRefs"
 *     the 29 quarantined rows              →  28 cited a statute and nothing
 *                                             else; only q-ptp-058 (the 112
 *                                             telecoms rule) carried a citation
 *     rows whose clinical answer rested
 *       on ЗДвП чл. 123 alone              →  18
 *
 * So `content/medical/claims.json` described the guidelines correctly and the
 * TUTOR still had only чл. 123 to retrieve, because the tutor grounds on what
 * the ROW cites. Both numbers below fail on that state and pass on this one.
 *
 * THE DIRECTION IS THE WHOLE POINT. The forbidden set is built FROM THE
 * REGISTER — the claims that say which questions they are about — and never
 * from the rows: a sweep that walked `sourceRefs` and checked they resolve
 * (which is all `validate-content.mjs` can do) reports a perfectly clean bank
 * the moment every row cites nothing. That is exactly the state this test was
 * written to catch, and it is the state the bank was in.
 *
 * Real content, real registers, nothing mocked.
 */

import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { resolveContentDir } from "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { getSourceRegistry } from "@/lib/content/sources";
import type { Question } from "@/lib/content/types";
import { approvalStateOf, indexLedger, readLedger } from "@/modules/content-admin";
import { findDanglingClaimRefs, findGroundingGaps, isCitableClaim } from "..";

/** The 29, exactly as docs/education/90 §14.5 Tier C names them. */
const QUARANTINED: string[] = [];
for (const [lo, hi] of [
  [13, 22],
  [33, 42],
  [56, 64],
] as const) {
  for (let n = lo; n <= hi; n++) QUARANTINED.push(`q-ptp-${String(n).padStart(3, "0")}`);
}

let questions: Question[] = [];

beforeAll(() => {
  questions = getContentRepo().questions();
});

describe("the theory bank and the source registers agree in BOTH directions", () => {
  it("the bank and the registers this test runs against are the real ones", () => {
    // Negative control first: every assertion below passes vacuously against an
    // empty bank or an unloaded register, which is the one way this file could
    // be green and worthless.
    expect(questions.length).toBeGreaterThan(1000);
    const { sources, claims } = getSourceRegistry();
    expect(sources.size).toBeGreaterThan(8);
    expect(claims.size).toBeGreaterThan(15);
    expect([...claims.values()].filter(isCitableClaim).length).toBeGreaterThan(15);
  });

  it("EVERY QUESTION A CLINICAL CLAIM IS ABOUT CITES THAT CLAIM BACK", () => {
    // 35 pairs before the first-aid regrounding; 0 after. The message carries
    // the pairs, because "35 gaps" is not actionable and „q-ptp-036 does not
    // cite med-cpr-depth" is.
    const gaps = findGroundingGaps(questions);
    const shown = gaps
      .slice(0, 20)
      .map((g) => `  ${g.questionId} does not cite ${g.claimId} (${g.reason})`)
      .join("\n");
    expect(gaps, `\n${gaps.length} ungrounded pair(s):\n${shown}\n`).toEqual([]);
  });

  it("no `claimId` points at a claim nobody wrote", () => {
    // validate-content.mjs checks that `claimId` is kebab-case and that
    // `sourceId` resolves — it never checks that the CLAIM exists, so a typo
    // ships as a citation and the review console shows the reviewer a MISS,
    // indistinguishable from a source that genuinely says nothing.
    const dangling = findDanglingClaimRefs(questions);
    expect(dangling, JSON.stringify(dangling, null, 2)).toEqual([]);
  });
});

describe("the 29 quarantined first-aid rows (docs/education/90 §14.5 Tier C)", () => {
  it("all 29 are still in the bank under the ids the audit recorded", () => {
    const missing = QUARANTINED.filter((id) => !questions.some((q) => q.id === id));
    expect(missing, `renamed or deleted: ${missing.join(" ")}`).toEqual([]);
    expect(QUARANTINED).toHaveLength(29);
  });

  it("NOT ONE OF THEM RESTS ITS CLINICAL ANSWER ON A STATUTE ALONE", () => {
    // This is the Tier C defect stated as an assertion. Before the regrounding
    // exactly ONE of the 29 (q-ptp-058, the 112 telecoms rule) carried any
    // non-statutory citation; the other 28 carried чл. 123 and nothing else.
    const bare = QUARANTINED.filter((id) => {
      const q = questions.find((x) => x.id === id);
      return !q || (q.sourceRefs ?? []).length === 0;
    });
    expect(bare, `rows citing only statute: ${bare.join(" ")}`).toEqual([]);
  });

  it("чл. 123 is never the sole basis of a row a clinical claim covers", () => {
    // The precise sentence from the audit: „Citing ЗДвП чл. 123 for a
    // compression depth is how 29 questions came to point students at an
    // article that cannot answer them" (content/SCHEMA.md, generator rule 2).
    const registry = getSourceRegistry();
    const covered = new Set(
      [...registry.claims.values()]
        .filter(isCitableClaim)
        .flatMap((c) => c.questionIds),
    );
    const offenders = questions
      .filter((q) => covered.has(q.id))
      .filter((q) => q.lawRefs.some((r) => r.ref.startsWith("чл. 123")))
      .filter((q) => (q.sourceRefs ?? []).length === 0)
      .map((q) => q.id);
    expect(offenders, `clinical answer grounded on the duty to stop: ${offenders.join(" ")}`).toEqual([]);
  });

  it("every citation they carry resolves to a source and a quote we hold", () => {
    // ADR-002 end to end: not „a citation exists" but „the citation opens".
    const registry = getSourceRegistry();
    const broken: string[] = [];
    for (const id of QUARANTINED) {
      const q = questions.find((x) => x.id === id);
      if (!q) continue;
      for (const ref of q.sourceRefs ?? []) {
        if (!registry.sources.has(ref.sourceId)) {
          broken.push(`${id}: unknown sourceId ${ref.sourceId}`);
          continue;
        }
        if (!ref.claimId) continue;
        const claim = registry.claims.get(ref.claimId);
        if (!claim) {
          broken.push(`${id}: unknown claimId ${ref.claimId}`);
          continue;
        }
        if (!claim.questionIds.includes(id)) {
          // A row citing a claim that does not name it back is a citation
          // chosen by hand rather than derived from the register — the way
          // чл. 123 got onto 29 rows in the first place.
          broken.push(`${id}: cites ${ref.claimId}, which does not name it`);
        }
      }
    }
    expect(broken, broken.join("\n")).toEqual([]);
  });

  it("not one of them says `approved` without a human's signature behind it", () => {
    // The gate the founder has to open, asserted so a GENERATOR cannot open it
    // instead. content/SCHEMA.md rule 0b: „Never write `status: approved` —
    // that word is a person's." `isExamEligible` and `isLessonEligible` both
    // key on that exact string, so this is what stands between an automated
    // wave and a 17-year-old being taught first aid nobody read.
    //
    // Note what is asserted and what is NOT. „None of the 29 is approved" is
    // the state today, and writing THAT would make this test fail the moment
    // the founder legitimately signs — a test that punishes the correct action
    // is worse than no test. The invariant is `approved ⇒ signed`, which is
    // true today (0 approved, 0 signatures) and stays true afterwards.
    const ledger = indexLedger(readLedger(resolveContentDir()));
    const unsigned = QUARANTINED.map((id) => questions.find((x) => x.id === id))
      .filter((q): q is Question => q !== undefined)
      .filter((q) => approvalStateOf(q, ledger.get(q.id)).kind === "unsigned-claim")
      .map((q) => q.id);
    expect(
      unsigned,
      `„approved" with nobody's name on it in content/review/approvals.json: ${unsigned.join(" ")}`,
    ).toEqual([]);
  });
});
