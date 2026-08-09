/**
 * The lev→euro renderer, and the one thing it must never do.
 *
 * Bulgaria is in the eurozone; every глоба in every act is still written in
 * лева. So both figures travel together — and the euro leads, because that is
 * the number on the фиш. What this file mostly guards is the REFUSAL: a лв.
 * figure inside „…“ is a verbatim quotation of a statute, and rewriting the
 * currency inside a quotation turns it into a paraphrase that still wears
 * quotation marks. That is the same class of defect as a truncated quote, and
 * it is the reason `withEurBg` is not a plain string replace.
 */
import { describe, expect, it } from "vitest";
import { BGN_PER_EUR, bgnWithEurBg, eurCentsFromBgn, formatEur, withEurBg } from "./money";

describe("the fixed rate", () => {
  it("is the irrevocable one and nothing else", () => {
    expect(BGN_PER_EUR).toBe(1.95583);
  });

  it("reproduces the founder's own ticket", () => {
    // 100 лв. under ЗДвП чл. 182, ал. 1, т. 3, billed at 51,13 EUR.
    expect(eurCentsFromBgn(100)).toBe(5113);
    expect(formatEur(eurCentsFromBgn(100))).toBe("51,13 €");
    // …and the 70 % early payment on the same фиш.
    expect(formatEur(eurCentsFromBgn(70))).toBe("35,79 €");
  });

  it("pads the cents and uses the Bulgarian decimal comma", () => {
    expect(formatEur(700)).toBe("7,00 €");
    expect(formatEur(1023)).toBe("10,23 €");
    expect(bgnWithEurBg(300)).toBe("153,39 € (300 лв.)");
  });
});

describe("withEurBg", () => {
  it("puts the euro beside a лв. figure in authored prose", () => {
    expect(withEurBg("глоба в размер 300 лв. и 10 контролни точки")).toBe(
      "глоба в размер 153,39 € (300 лв.) и 10 контролни точки",
    );
  });

  it("converts every figure in a sentence, not just the first", () => {
    const out = withEurBg("от 50 лв. до 700 лв.");
    expect(out).toContain("25,56 € (50 лв.)");
    expect(out).toContain("357,90 € (700 лв.)");
  });

  it("LEAVES A QUOTATION OF THE ACT EXACTLY AS THE ACT WROTE IT", () => {
    // This is the whole point. „…се наказва с глоба в размер 300 лв.," is a
    // verbatim fragment of ЗДвП чл. 179, ал. 2 and is re-cut from the statute by
    // `rules/__tests__/catalog-consequences.test.ts` on every run. Touch it and
    // the promise the quotation marks make becomes false.
    const prose =
      'На пътя това е чл. 179, ал. 2: „причини пътнотранспортно произшествие, се наказва с глоба в размер 300 лв.“ — тоест 300 лв.';
    const out = withEurBg(prose);
    expect(out).toContain("„причини пътнотранспортно произшествие, се наказва с глоба в размер 300 лв.“");
    // …and the figure OUTSIDE the quote still gets the euro.
    expect(out).toContain("тоест 153,39 € (300 лв.)");
  });

  it("does not double-convert a sentence already written in both", () => {
    const already = "глоба 51,13 € (100 лв.) по електронен фиш";
    expect(withEurBg(already)).toBe(already);
  });

  it("leaves prose with no money in it untouched", () => {
    const s = "Спирането е задължително на самата стоп-линия.";
    expect(withEurBg(s)).toBe(s);
  });
});
