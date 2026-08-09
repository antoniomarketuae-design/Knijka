/**
 * THE ROW REACHES THE SCREEN — rendered, not assumed.
 *
 * `speed-band.test.ts` proves `deriveSpeedingBand` returns the right rung.
 * That is a guarantee about a FUNCTION, and the founder's defect was never in a
 * function: it was in what a seventeen-year-old actually reads. The card used
 * to render чл. 182's whole ladder and leave him to find himself in it, which
 * for a student who has just been told he drove 96 in a 50 is not an answer.
 *
 * So this file renders the real component with `react-dom/server` (no DOM
 * needed) and asserts on the markup:
 *
 *   - with the measurement on the event, his own rung is named, with the
 *     arithmetic that produced it and the tolerance rule that fed it;
 *   - the matching row of the table is marked, and only that row;
 *   - the tolerance NUMBER is on the card with its article — the blank that had
 *     gone stale;
 *   - and WITHOUT the measurement nothing is invented: the card falls back to
 *     the ladder exactly as it did before, with no „твоят случай" at all.
 *
 * Kept apart from `fault-card.test.tsx` deliberately: that file pins the three
 * point systems, this one pins the derivation, and they fail for different
 * reasons.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VIOLATIONS, encodeSpeedMeasurement, makeViolation, type ViolationCode } from "../../rules";
import { FaultCard } from "../FaultCard";

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

function cardText(code: ViolationCode, detail?: string): string {
  return textOf(
    <FaultCard
      event={makeViolation(code, 42, detail === undefined ? undefined : { detail })}
      correctiveBg={VIOLATIONS[code].correctiveBg}
      atBg="0:42"
    />,
  );
}

describe("the card points at the student's own rung", () => {
  it("96 in a 50 gets a row, not a table", () => {
    const card = cardText("SPEEDING_DANGEROUS", encodeSpeedMeasurement(96, 50));
    expect(card).toContain("Твоят случай");
    // The arithmetic, checkable against a real фиш line by line.
    expect(card).toContain("Измерено 96 km/h при ограничение 50 km/h");
    expect(card).toContain("минус максимално допустимата грешка на уреда 3 km/h");
    expect(card).toContain("превишаване с 43 km/h");
    // The rung, its article, and all three consequences of landing on it.
    expect(card).toContain("ЗДвП чл. 182, ал. 1, т. 5");
    expect(card).toContain("306,78 €"); // 600 лв. at the fixed 1,95583 rate
    expect(card).toContain("два месеца лишаване");
    expect(card).toContain("АУАН → наказателно постановление");
    // …and the row itself is marked in the ladder, exactly once.
    expect(card.match(/← твоето/g) ?? []).toHaveLength(1);
  });

  it("the founder's own ticket renders as money, and as his rung", () => {
    const card = cardText("SPEEDING_DANGEROUS", encodeSpeedMeasurement(78, 50));
    expect(card).toContain("превишаване с 25 km/h");
    expect(card).toContain("ЗДвП чл. 182, ал. 1, т. 3");
    expect(card).toContain("51,13 €"); // the amount his електронен фиш charged
    expect(card).toContain("без лишаване от право");
  });

  it("THE BLANK THAT WENT STALE: the tolerance number is on the card with its article", () => {
    // This used to read „…затова конкретната стойност на тази грешка не се
    // показва тук", because the two наредби were not in the corpus. They are.
    const card = cardText("SPEEDING_DANGEROUS", encodeSpeedMeasurement(78, 50));
    expect(card).toContain("± 3 km/h за скорости до 100 km/h");
    expect(card).toContain("± 3 % от измерената стойност за скорости над 100 km/h");
    expect(card).toContain("чл. 425, ал. 1, т. 2");
    expect(card).toContain("Наредба № 8121з-532, чл. 16, ал. 5");
    expect(card).toContain("ЗДвП чл. 165, ал. 3");
    expect(card).not.toContain("не се показва тук");
    // …and it is framed as the instrument's accuracy, not as free km/h.
    expect(card).toContain("не позволени километри");
  });

  it("above 100 km/h the card shows 3 %, not the folk 3", () => {
    const card = cardText("SPEEDING_DANGEROUS", encodeSpeedMeasurement(140, 90));
    expect(card).toContain("минус максимално допустимата грешка на уреда 4,2 km/h");
    expect(card).not.toContain("минус максимално допустимата грешка на уреда 3 km/h");
    // ал. 1 is the ladder on screen, so ал. 2's different answer is given too:
    // 45 over is 600 лв. + a ban in town, 400 лв. and no ban outside it.
    expect(card).toContain("Ако беше извън населено място");
    expect(card).toContain("ЗДвП чл. 182, ал. 2, т. 5");
  });

  it("and the direction of our own rounding is declared, because it is ours", () => {
    const card = cardText("SPEEDING_DANGEROUS", encodeSpeedMeasurement(140, 90));
    expect(card).toContain("законът не казва как се закръглява");
  });

  it("WITHOUT the measurement it invents nothing and behaves exactly as before", () => {
    const card = cardText("SPEEDING_DANGEROUS");
    expect(card).not.toContain("Твоят случай");
    expect(card).not.toContain("← твоето");
    expect(card).not.toContain("Измерено");
    // The ladder is still all there — the fallback is the old card, not a hole.
    expect(card).toContain("от 21 до 30 km/h");
    expect(card).toContain("51,13 €");
    expect(card).toContain("първото стъпало отпада");
  });

  it("a non-speeding detail cannot be read as a speed", () => {
    // FAILED_TO_YIELD rides „give-way" in the same field. It has no ladder, so
    // it must not acquire an arithmetic line from another code's plumbing.
    const card = cardText("FAILED_TO_YIELD", "give-way");
    expect(card).not.toContain("Твоят случай");
    expect(card).not.toContain("Измерено");
  });
});
