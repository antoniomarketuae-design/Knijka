/**
 * WHAT THE STUDENT ACTUALLY SEES — rendered, not assumed.
 *
 * `consequences.test.ts` proves every figure is a sentence out of a statute.
 * That is a guarantee about the DATA, and the founder's defect was not in the
 * data: the marking was correct and the act was correct. The defect was in what
 * reached the screen — „−10 т." with no unit, and no word anywhere about what
 * the street does — so a test that never renders the card cannot see it.
 *
 * This renders the real component with `react-dom/server` (no DOM needed) and
 * asserts on the markup:
 *
 *   - the number carries its unit and its act;
 *   - the word „контролни" appears only where it means the LICENCE, and the
 *     card says outright that the exam mark is not that;
 *   - the road half is present, in EUR, with the instrument named;
 *   - and for a code we have not retrieved, there is NO number of any kind.
 *
 * The last one is the one worth having. „Show the rule and the article with no
 * number" is easy to write into a data file and easy to undo in a template.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VIOLATIONS, makeViolation, roadConsequenceFor, type ViolationCode } from "../../rules";
import { FaultCard, ThreeSystemsNote } from "../FaultCard";

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cardText(code: ViolationCode): string {
  return textOf(
    <FaultCard
      event={makeViolation(code, 42)}
      correctiveBg={VIOLATIONS[code].correctiveBg}
      atBg="0:42"
    />,
  );
}

describe("the fault card names which point system it is talking about", () => {
  const speeding = cardText("SPEEDING_DANGEROUS");

  it("puts the unit on the number the founder misread", () => {
    // WAS: „−10 т." — and „точки" with no qualifier means КОНТРОЛНИ точки.
    expect(speeding).toContain("−10 изпитни т.");
    expect(speeding).not.toMatch(/−\d+ т\./);
  });

  it("agrees with the noun at one point (точка is feminine singular)", () => {
    // A qualifier bolted on ungrammatically („−1 изпитни т.") reads as a
    // machine, and this product's whole claim is that it reads as an instructor.
    expect(cardText("ENGINE_STALLED")).toContain("−1 изпитна т.");
    expect(cardText("HANDBRAKE_LEFT_ON")).toContain("−1 изпитна т.");
    expect(cardText("TURN_WITHOUT_INDICATOR")).toContain("−3 изпитни т.");
  });

  it("names the class and the clause the 10 comes out of", () => {
    expect(speeding).toContain("опасна грешка");
    expect(speeding).toContain("наказателни точки по изпитния лист");
    expect(speeding).toContain("Наредба № 38 приложение № 5, т. 10, б. „в“");
  });

  it("says out loud that this is not the licence", () => {
    const note = textOf(<ThreeSystemsNote />);
    expect(note).toContain("НЕ са контролни точки");
    expect(note).toContain("39");
    expect(note).toContain("26");
    expect(note).toContain("Наредба № Iз-2539");
  });
});

describe("the fault card shows what happens on the street", () => {
  it("the founder's own tier is on the card, in euro", () => {
    const speeding = cardText("SPEEDING_DANGEROUS");
    expect(speeding).toContain("На пътя");
    // 25 km/h over a 50 limit → чл. 182, ал. 1, т. 3 → 100 лв. → 51,13 €,
    // which is what his електронен фиш actually charged him.
    expect(speeding).toContain("от 21 до 30 km/h");
    expect(speeding).toContain("51,13 €");
    // …and the row above and below it, because the ladder is the teaching.
    expect(speeding).toContain("25,56 €");
    expect(speeding).toContain("204,52 €");
    // The rung where the licence starts to go.
    expect(speeding).toContain("18 к.т.");
    expect(speeding).toContain("два месеца лишаване");
    expect(speeding).toContain("в населено място");
  });

  it("names the instrument, including the one that caught him", () => {
    const speeding = cardText("SPEEDING_DANGEROUS");
    expect(speeding).toContain("електронен фиш");
    expect(speeding).toContain("АУАН → наказателно постановление");
  });

  it("says which rungs this fault can actually reach", () => {
    // The card shows the act's whole ladder, including a 20 лв. rung this
    // detector's own threshold puts out of reach. Without this line the
    // student reads the wrong floor for the mistake he just made.
    expect(cardText("SPEEDING_DANGEROUS")).toContain("първото стъпало отпада");
    expect(cardText("SPEEDING_OVER_LIMIT")).toContain("В РАМКИТЕ на 10 km/h");
  });

  it("a single-tier offence shows глоба, instrument and контролни точки apart", () => {
    const red = cardText("RED_LIGHT_CROSSED");
    expect(red).toContain("Глоба: 76,69 € (150 лв. по текста на закона)");
    expect(red).toContain("Как пристига: фиш от контролен орган");
    expect(red).toContain("Книжка: 10 контролни точки от книжката");
    expect(red).toContain("ЗДвП чл. 183, ал. 5, т. 1");
    // The chip names the EDITION. The corpus holds Наредба № Iз-2539 twice and
    // the 2025 photograph has a vendor page footer inside чл. 6, so a citation
    // that does not say which text it means is not checkable — see
    // `rules/__tests__/citation-version.test.ts`.
    expect(red).toContain("Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1, т. 20");
  });

  it("an offence deliberately absent from the list shows the 0 and why", () => {
    const stop = cardText("STOP_SIGN_NO_FULL_STOP");
    expect(stop).toContain("0 контролни точки — не е в списъка");
    expect(stop).toContain("изчерпателния списък");
  });
});

describe("where nothing has been retrieved, the card shows no number", () => {
  it("renders the rule and the articles, and not one figure", () => {
    const blank = (Object.keys(VIOLATIONS) as ViolationCode[]).find(
      (c) => roadConsequenceFor(c).kind === "unknown",
    );
    if (blank === undefined) return; // every code grounded — nothing left to guard
    const road = cardText(blank);
    expect(road).toContain("още не е извлечена дословно от закона");
    expect(road).toContain("чл. 186, ал. 1");
    // No money and no точки count anywhere on the card.
    expect(road).not.toMatch(/\d+\s*€/);
    expect(road).not.toMatch(/\d+\s*лв\./);
    expect(road).not.toMatch(/\d+\s*контролни точки/);
  });

  it("…and the exam mark is still fully labelled on that same card", () => {
    // The blank is about the ROAD half only. Losing the label with the figure
    // would trade one silent card for another.
    const stalled = cardText("ENGINE_STALLED");
    expect(stalled).toContain("−1 изпитна т.");
    expect(stalled).toContain("Наредба № 38 приложение № 5");
  });
});
