/**
 * ADR-009 in the STORED ROW — `parseSimSessionEvents`' two new fields (doc 92
 * §5.8, §5.9; lane F).
 *
 * WHAT THE TWO FIELDS HAVE TO SURVIVE. The events column is the only record of
 * why a practice drive was refused: under founder Ruling A the first occurrence
 * of the lesson's own mistake is never charged, so on most of these rows the
 * rule-event log is EMPTY and `lessonMistakes` is the entire evidence. If the
 * parse drops it, the history screen is back to printing a red «Неиздържан»
 * beside „0 наказателни точки" and «без грешки» — a verdict with no reason,
 * which doc 64 THEO-4 counts as a defect in itself.
 *
 * AND WHY `sheetRoutePassed` IS TESTED AS HARD AS THE VERDICT ITSELF. It is the
 * pre-ADR-009 reading of `passed` (изпитен лист + route, no lesson rule), and
 * `modules/learning/calibrationStore.readSessionPassed` is what reads it. Lose
 * it here and self-calibration silently starts measuring a different thing than
 * the question it asks the student — see that file's own test.
 *
 * Every assertion below was mutation-checked against a scratch copy of
 * `store.ts`; the table is in the lane report.
 */

import { describe, expect, it } from "vitest";
import { parseSimSessionEvents } from "../store";

/** The shape every row shares — a finished practice drive with a clean sheet. */
function payload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    passed: false,
    aborted: false,
    terminated: false,
    completedAll: true,
    ruleEvents: [],
    objectives: [],
    ...extra,
  };
}

describe("lessonMistakes — the reason the row is not a pass", () => {
  it("keeps a well-formed row, with its act", () => {
    const parsed = parseSimSessionEvents(
      payload({
        lessonMistakes: [
          { code: "ILLEGAL_STOP_IN_BAN_ZONE", t: 20.9, charged: false, detail: "law-alongside" },
        ],
      }),
    );

    expect(parsed?.lessonMistakes).toEqual([
      { code: "ILLEGAL_STOP_IN_BAN_ZONE", t: 20.9, charged: false, detail: "law-alongside" },
    ]);
  });

  it("keeps `charged: true` as itself — it is what a repeat looks like", () => {
    // Not a cosmetic flag: the expanded history row points at the изпитен лист
    // below it only when some occurrence actually reached the лист, and under
    // ADR-009 only a genuine repeat can (founder answer F1).
    const parsed = parseSimSessionEvents(
      payload({ lessonMistakes: [{ code: "SPEEDING_OVER_LIMIT", t: 4, charged: true }] }),
    );
    expect(parsed?.lessonMistakes?.[0].charged).toBe(true);
    expect(parsed?.lessonMistakes?.[0].detail).toBeUndefined();
  });

  it("drops malformed ENTRIES and keeps the good ones", () => {
    const parsed = parseSimSessionEvents(
      payload({
        lessonMistakes: [
          null,
          "SPEEDING_OVER_LIMIT",
          { t: 1, charged: false }, // no code
          { code: "", t: 1, charged: false }, // empty code
          { code: "A", t: "1", charged: false }, // t not a number
          { code: "B", t: Number.NaN, charged: false }, // t not finite
          { code: "C", t: 1 }, // no charged flag
          { code: "D", t: 1, charged: "yes" }, // charged not a boolean
          { code: "VULNERABLE_PASS_TOO_CLOSE", t: 20.9, charged: false, detail: 7 },
        ],
      }),
    );

    // The one survivor keeps its code and loses only the non-string detail.
    expect(parsed?.lessonMistakes).toEqual([
      { code: "VULNERABLE_PASS_TOO_CLOSE", t: 20.9, charged: false },
    ]);
  });

  it("never refuses the whole payload over a bad entry", () => {
    // The alternative punishes the student twice: one corrupt row would take
    // the mistake list, the near-miss stat and the training score with it.
    const parsed = parseSimSessionEvents(
      payload({ lessonMistakes: [null], effectiveScore: 4.5, nearMisses: [] }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.effectiveScore).toBe(4.5);
    expect(parsed?.lessonMistakes).toBeUndefined();
  });

  it("is ABSENT, never [], when nothing survived or nothing was written", () => {
    // «[]» would read as a measured fact — «we looked and there were none» —
    // and every reader would then have to tell it from «this row predates the
    // ADR». Both arrive as an absent field instead.
    expect(parseSimSessionEvents(payload())?.lessonMistakes).toBeUndefined();
    expect(parseSimSessionEvents(payload({ lessonMistakes: [] }))?.lessonMistakes).toBeUndefined();
    expect(
      parseSimSessionEvents(payload({ lessonMistakes: [{ code: "X" }] }))?.lessonMistakes,
    ).toBeUndefined();
    expect(
      parseSimSessionEvents(payload({ lessonMistakes: "ILLEGAL_STOP_IN_BAN_ZONE" }))
        ?.lessonMistakes,
    ).toBeUndefined();
  });
});

describe("sheetRoutePassed — the exam verdict, kept apart from the lesson one", () => {
  it("keeps both boolean states", () => {
    // TRUE beside `passed: false` is the whole point: a clean изпитен лист, the
    // route finished, and the lesson still not taken.
    expect(parseSimSessionEvents(payload({ sheetRoutePassed: true }))?.sheetRoutePassed).toBe(true);
    expect(parseSimSessionEvents(payload({ sheetRoutePassed: false }))?.sheetRoutePassed).toBe(
      false,
    );
  });

  it("stays absent on a row written before ADR-009, and on a non-boolean", () => {
    // Absent has a meaning of its own — `readSessionPassed` falls back to
    // `passed`, which on those rows IS this expression. A coerced `false` here
    // would tell the trend page that every old drive failed the exam.
    expect(parseSimSessionEvents(payload())?.sheetRoutePassed).toBeUndefined();
    expect(parseSimSessionEvents(payload({ sheetRoutePassed: "true" }))?.sheetRoutePassed).toBe(
      undefined,
    );
    expect(parseSimSessionEvents(payload({ sheetRoutePassed: 1 }))?.sheetRoutePassed).toBe(
      undefined,
    );
  });

  it("…and `sheetPassed`, the лист ALONE, is a third answer and not a copy", () => {
    // The history row asks «„Не е взет" or „Неиздържан"?», and neither field
    // above can answer it: `passed` is the LESSON verdict and
    // `sheetRoutePassed` folds the route. 425 of the 654 hit drives on this
    // tree are hit + clean лист + route unfinished, where the two differ.
    const both = parseSimSessionEvents(payload({ sheetRoutePassed: false, sheetPassed: true }));
    expect(both?.sheetRoutePassed).toBe(false);
    expect(both?.sheetPassed).toBe(true);
    expect(parseSimSessionEvents(payload({ sheetPassed: false }))?.sheetPassed).toBe(false);
    // Absent on every row written before 2026-09-18, and never coerced — the
    // fold reads `!== false`, so a coerced value would regrade stored history.
    expect(parseSimSessionEvents(payload())?.sheetPassed).toBeUndefined();
    expect(parseSimSessionEvents(payload({ sheetPassed: "true" }))?.sheetPassed).toBeUndefined();
    expect(parseSimSessionEvents(payload({ sheetPassed: 1 }))?.sheetPassed).toBeUndefined();
  });

  it("does not disturb the fields that were already there", () => {
    const parsed = parseSimSessionEvents(
      payload({
        passed: false,
        sheetRoutePassed: true,
        sheetPassed: true,
        rubricStars: 1,
        examMode: true,
        lessonMistakes: [{ code: "HARSH_BRAKING_NO_CAUSE", t: 12, charged: false }],
      }),
    );
    expect(parsed?.passed).toBe(false);
    expect(parsed?.rubricStars).toBe(1);
    expect(parsed?.examMode).toBe(true);
    expect(parsed?.sheetRoutePassed).toBe(true);
    expect(parsed?.sheetPassed).toBe(true);
  });
});
