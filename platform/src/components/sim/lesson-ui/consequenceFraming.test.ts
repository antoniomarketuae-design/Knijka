import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VIOLATIONS, examMarkFor, type ViolationCode } from "@/modules/sim/rules";

/**
 * „КОЯ ГРЕШКА НАИСТИНА СПИРА ИЗПИТА" — the second points question, guarded.
 *
 * ── The defect this file is shaped around ───────────────────────────────────
 *
 * The founder asked, for the second time in two days, whether a points figure
 * on his screen was real: a ПТП, „−10", and the sentence „реалният изпит се
 * прекратява незабавно". The first time he asked, he was right and we were
 * wrong — „−10 т." for speeding was a MONEY penalty wearing the exam sheet's
 * unit. This time the number was lawful and the SENTENCES around it were not
 * grounded, in two different ways:
 *
 *  1. NOTHING CITED THE ENDING. приложение № 5, т. 10, б. „в“ sets the 10; it
 *     says not one word about stopping an exam. The provision that does is
 *     чл. 48, ал. 3, and before 2026-08-10 the string „чл. 48" did not occur
 *     anywhere in this product.
 *  2. THE CLASS-LEVEL CARD OVERSTATED IT. `CONSEQUENCE_FRAMING_BG.opasna` —
 *     printed on EVERY опасна грешка, all fifteen codes — read „Опасна грешка
 *     — на изпита прекратява изпита на място." чл. 48, ал. 3 reaches повторна
 *     намеса на комисията and допускане на ПТП and nothing else. Not stopping
 *     at a Б2 is an опасна грешка; it costs 10, and т. 11 allows 9, so it makes
 *     the exam НЕИЗДЪРЖАН. It does not stop the car. „You have failed" and „the
 *     commission ended the exam" are different facts from different provisions,
 *     and telling a 17-year-old the second when the act only supports the first
 *     is the same class of error as calling наказателни точки контролни.
 *
 * ── Why the guard is here and shaped like this ──────────────────────────────
 *
 * The framing record is keyed by SEVERITY CLASS, so it structurally cannot know
 * which code it is describing — which is exactly how the over-claim got in. The
 * test therefore asserts the shape of the fix rather than the wording of it:
 * no class-level string may claim the exam stops, because no class does; the
 * claim is per-code, derived from the catalogue's own `terminateSession` flag
 * through `examMarkFor()`, and today exactly one code carries it.
 *
 * `MistakeConsequenceOverlay.tsx` had no test of any kind before this file.
 */

const OVERLAY = join(__dirname, "MistakeConsequenceOverlay.tsx");

/** Comments out — a header that RECOUNTS the old wording must stay writable. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** The severity-framing record, read out of the source it is declared in. */
function framingStrings(): string[] {
  const src = code(readFileSync(OVERLAY, "utf8"));
  const block = /CONSEQUENCE_FRAMING_BG[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  expect(block, "CONSEQUENCE_FRAMING_BG literal not found").not.toBeNull();
  return [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("the mistake card never claims a whole CLASS stops the exam", () => {
  it("declares one framing per official class", () => {
    expect(framingStrings()).toHaveLength(3);
  });

  it("no class-level framing says the exam is stopped", () => {
    // „прекратява"/„спира изпита" is a чл. 48, ал. 3 claim and чл. 48, ал. 3 is
    // about a FAULT, not a class. Fifteen опасни codes shared this sentence and
    // it was true of one of them.
    for (const s of framingStrings()) {
      expect(s, s).not.toMatch(/прекратява/);
      expect(s, s).not.toMatch(/спира\s+(и\s+)?(самия\s+)?изпит/);
    }
  });

  it("the опасна framing still states the real consequence — 10 against a ceiling of 9", () => {
    const [opasna] = framingStrings();
    expect(opasna).toContain("10 наказателни точки");
    expect(opasna).toContain("неиздържан");
  });
});

describe("stopping the exam is a per-CODE fact, and it is cited", () => {
  const codes = Object.keys(VIOLATIONS) as ViolationCode[];

  it("exactly one fault in the catalogue stops the exam, and it is the ПТП", () => {
    expect(codes.filter((c) => examMarkFor(c).terminatesExam)).toEqual(["COLLISION"]);
  });

  it("every terminating fault quotes чл. 48, ал. 3 — and no other fault does", () => {
    for (const c of codes) {
      const mark = examMarkFor(c);
      if (mark.terminatesExam) {
        expect(mark.terminationCitationBg, c).toBe("Наредба № 38, чл. 48, ал. 3");
        expect(mark.terminationQuoteBg, c).toContain("Практическият изпит се прекратява");
        expect(mark.terminationQuoteBg, c).toContain("при допускане на ПТП");
      } else {
        expect(mark.terminationQuoteBg, c).toBeNull();
        expect(mark.terminationCitationBg, c).toBeNull();
      }
    }
  });

  it("the two provisions stay separate — the mark is not the ending", () => {
    // Reading them off one field is how they got conflated in prose. The clause
    // that sets the 10 must never be the one presented as ending the exam.
    const mark = examMarkFor("COLLISION");
    expect(mark.citationBg).toContain("приложение № 5, т. 10");
    expect(mark.citationBg).not.toContain("чл. 48");
    expect(mark.terminationCitationBg).not.toContain("приложение");
  });

  it("the card renders the rider only where the mark says so", () => {
    // The JSX gate is the whole of the fix on this surface: a class-derived
    // condition here would reinstate the over-claim with new wording.
    const src = code(readFileSync(OVERLAY, "utf8"));
    expect(src).toMatch(/terminatesExam\s*\?/);
    expect(src).toMatch(/terminateSession\s*===\s*true/);
    // …and never off the severity class.
    expect(src).not.toMatch(/severity\s*===\s*"opasna"/);
  });
});
