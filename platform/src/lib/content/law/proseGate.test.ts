/**
 * THE PROSE GATE, RUN OVER EVERYTHING.
 *
 * `proseFigures.test.ts` proves the checker can fail. This runs it over the
 * real content and decides what the repo is allowed to ship.
 *
 * TWO REGIMES, because the two surfaces are in different states:
 *
 *   content/law/penalties.json  — CLOSED. Every numeral in every note is
 *     quoted from an article the entry cites, re-derived from numbers that
 *     are, or declared in `GROUNDING_LEDGER`. A new unaccounted number fails
 *     this suite. That is the whole point: the citation freeze cannot see
 *     inside a sentence, and now something can.
 *
 *   content/questions/*.json    — RATCHETED. 1,089 rows were written before
 *     any of this existed and hundreds of them teach a figure the law corpus
 *     does not carry — stopping distances, reaction times, blood-alcohol
 *     burn-off rates. Those are not all wrong; most are physics or coaching,
 *     which no статут will ever state. Failing the suite on day one would get
 *     the gate deleted, so the count is PINNED and may only go down. Nobody
 *     can add the 297th.
 *
 * THE REPORT IS PRINTED, not just counted. A number that says „296" teaches
 * nothing; the list is what a content reviewer works from.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listPenalties, resolveLawRef } from "./corpus";
import {
  GROUNDING_LEDGER,
  evidenceForLawRefs,
  penaltyProseRows,
  runProseGate,
  type ProseGateRow,
} from "./proseGate";
import { formatProblems } from "../proseFigures";
import type { LawRef } from "../types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

// ---------------------------------------------------------------------------
// 1. The penalty bank — closed
// ---------------------------------------------------------------------------

describe("every number in a penalty note is accounted for", () => {
  const rows = penaltyProseRows(listPenalties());
  const result = runProseGate(rows);

  it("the scan sees the bank (a probe that matches nothing passes everything)", () => {
    expect(rows.length).toBeGreaterThan(20);
    const numerals =
      result.counts.quoted +
      result.counts.derived +
      result.counts.stipulated +
      result.counts.constant +
      result.counts["digits-only"] +
      result.counts.refused;
    expect(numerals).toBeGreaterThan(50);
    // …and that it is masking citation coordinates rather than ignoring them.
    expect(result.counts.locator).toBeGreaterThan(100);
  });

  it("no note states a figure that is nowhere in the corpus", () => {
    expect(
      result.problems.length,
      result.problems.length === 0
        ? ""
        : `${result.problems.length} figure(s) in penalty prose cannot be checked ` +
            `against content/law:\n${formatProblems(result.problems)}\n\n` +
            `Fix by one of: quote the article that states it; declare it in ` +
            `GROUNDING_LEDGER (derived / stipulated / constant); or take the number ` +
            `out and keep the rule and the article, which is the founder's ruling.`,
    ).toBe(0);
  });

  it("the ledger is small, pinned, and every entry still applies", () => {
    // Adding a constant means asserting a number on our own authority. It has
    // to be a deliberate, reviewed act — so the set is written out here.
    const constants = Object.values(GROUNDING_LEDGER)
      .flatMap((d) => d.constants ?? [])
      .map((c) => c.valueBg)
      .sort();
    expect(constants).toEqual(["1,95583"]);
    // The one constant is the euro rate, and it is written down in three
    // places now: here as the Bulgarian string a note prints, and as a number
    // in `lib/content/money.ts` and `modules/sim/rules/consequences.ts`. Pin
    // the value so all three go red together if anyone ever "corrects" one.
    expect(Number(constants[0].replace(",", "."))).toBe(1.95583);
    expect(result.orphanDeclarations, result.orphanDeclarations.join("\n")).toEqual([]);
  });

  it("reports what it can see only weakly, rather than passing it in silence", () => {
    // A digits-only grounding means the number appears in a cited article and
    // its UNIT does not — „50" in „над 50 km/h" does not ground „50 лв.".
    // Pinned as a ceiling so the weak set cannot quietly grow either.
    const c = result.counts;
    console.log(
      `\n[prose gate] penalties.json — ${rows.length} fields; ` +
        `${c.quoted} quoted · ${c.derived} derived · ${c.stipulated} stipulated · ` +
        `${c.constant} constant · ${c["digits-only"]} digits-only · ${c.refused} refused ` +
        `(${c.locator} citation coordinates masked)` +
        (result.weak.length === 0 ? "" : `\n${formatProblems(result.weak)}`),
    );
    expect(result.weak.length).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// 2. The question bank — ratcheted
// ---------------------------------------------------------------------------

interface QuestionRow {
  id: string;
  explanationBg?: string;
  lawRefs?: LawRef[];
}

function questionRows(): { rows: ProseGateRow[]; total: number; noEvidence: number; deadRefs: number } {
  const dir = path.join(repoRoot, "content", "questions");
  const rows: ProseGateRow[] = [];
  let total = 0;
  let noEvidence = 0;
  let deadRefs = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const bank = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as QuestionRow[];
    for (const q of bank) {
      total += 1;
      const refs = q.lawRefs ?? [];
      const quotes = evidenceForLawRefs(refs);
      deadRefs += refs.filter((r) => !resolveLawRef(r).found).length;
      if (quotes.length === 0) noEvidence += 1;
      // Only the TEACHING prose is a claim. The stem poses a scenario („движиш
      // се с 80 км/ч") and three of the four options are deliberately WRONG
      // numbers — gating either would be a category error.
      if (typeof q.explanationBg !== "string" || !/\d/.test(q.explanationBg)) continue;
      rows.push({
        where: `${file}:${q.id}.explanationBg`,
        text: q.explanationBg,
        evidence: { quotes },
      });
    }
  }
  return { rows, total, noEvidence, deadRefs };
}

describe("the question bank's teaching prose, measured", () => {
  const { rows, total, noEvidence, deadRefs } = questionRows();
  const result = runProseGate(rows);

  it("the scan sees the whole bank", () => {
    expect(total).toBeGreaterThan(1000);
    expect(rows.length).toBeGreaterThan(900);
  });

  /**
   * THE RATCHET. This number is a debt, not a target. It may fall; it may not
   * rise. If this test fails with a HIGHER count, a new figure was written
   * into student-facing prose that no cited article states — quote the article
   * that states it, or take the number out.
   */
  it("no new ungrounded figure enters student-facing explanations", () => {
    console.log(
      `\n[prose gate] content/questions — ${result.problems.length} ungrounded figure(s) ` +
        `in ${rows.length} explanations; ${result.weak.length} grounded only by their digits; ` +
        `${noEvidence} rows whose lawRefs yield no usable text; ${deadRefs} lawRefs that do not resolve.\n` +
        formatProblems(result.problems.slice(0, 60)) +
        (result.problems.length > 60 ? `\n  …and ${result.problems.length - 60} more` : ""),
    );
    expect(
      result.problems.length,
      `The question bank's ungrounded-figure count moved. It is a ratchet: it may fall, never rise.`,
    ).toBeLessThanOrEqual(296);
  });
});
