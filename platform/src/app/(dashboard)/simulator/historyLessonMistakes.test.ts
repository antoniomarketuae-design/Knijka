/**
 * ADR-009 — what a past drive's row is allowed to SAY about the mistake that
 * cost it (doc 92 §5.8, lane F).
 *
 * THE ROW THIS FOLD EXISTS FOR. `sc-vu-pass-clearance@L3`, route finished, изпитен
 * лист clean, and the student squeezed past the cyclist — the one act the lesson
 * exists to teach. Stored: `passed: false`, no charged rule events. Rendered,
 * before this fold: a red «Неиздържан» pill, „0 наказателни точки", and in the
 * right-hand corner «без грешки».
 *
 * WHAT IS PINNED HERE, in both directions:
 *  1. the verdict follows the STORED ROWS (a catalogue rename cannot regrade a
 *     stored drive — doc 92 §6);
 *  2. the NAME follows the CATALOGUE (the column carries a code and an act
 *     selector, never a sentence — ADR-002), including the act-aware step;
 *  3. an abort stays an abort;
 *  4. a row with no hits is untouched, so every drive stored before 2026-09-18
 *     renders exactly as it did.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "@/modules/sim/rules";
import type { StoredLessonMistake } from "@/modules/sim/lessons/store";
import { historyLessonMistakeRowFields, historyLessonMistakeView } from "./historyLessonMistakes";

/** The squeeze, as `finishLessonAction` stores it: free, so never charged. */
const SQUEEZE: StoredLessonMistake = {
  code: "VULNERABLE_PASS_TOO_CLOSE",
  t: 20.9,
  charged: false,
};

describe("the verdict half", () => {
  it("says «не е взет» for a finished drive with a stored hit", () => {
    expect(historyLessonMistakeView([SQUEEZE], false).notTaken).toBe(true);
  });

  it("leaves an aborted drive as an abort", () => {
    // The student stopped before the end: he has no grade at all, and the end
    // screen's own note already says the lesson would not have counted either
    // way (§5.2's abort variant). Relabelling it here would claim a judgement
    // the drive never reached.
    expect(historyLessonMistakeView([SQUEEZE], true).notTaken).toBe(false);
  });

  it("says nothing at all for a row with no hits — every pre-ADR-009 drive", () => {
    for (const rows of [undefined, null, []] as const) {
      expect(historyLessonMistakeView(rows, false)).toEqual({
        notTaken: false,
        titlesBg: [],
        anyCharged: false,
      });
    }
  });

  it("still says «не е взет» when the act can no longer be NAMED", () => {
    // A code the catalogue has since dropped. The drive was still refused, and
    // letting the label follow the retitling would mean a rename in
    // `rules/catalog.ts` silently turning a not-taken row back into
    // «Неиздържан» — a stored row regraded by an edit somewhere else.
    const view = historyLessonMistakeView(
      [{ code: "NO_SUCH_CODE_ANY_MORE", t: 3, charged: false }],
      false,
    );
    expect(view.notTaken).toBe(true);
    expect(view.titlesBg).toEqual([]);
  });

  /**
   * THE FOURTH INPUT — the изпитен лист, which this fold used not to ask.
   *
   * MEASURED 2026-09-18 on the real chain over all 2,434 authored tape×rung
   * drives: 654 carry a hit, 558 of them with a clean лист and 96 with a failed
   * one (68 of the 96 a COLLISION, 10 т.). On those 96 the row said «Не е взет»
   * in warning tone while the result screen for the same drive said
   * «Неиздържан» in danger tone — and the row is the surface the student comes
   * back to. `SessionEndScreen.sessionVerdict` asks the sheet FIRST and calls it
   * «the only authority for „Неиздържан"»; this is that question, asked of the
   * one thing a stored row has to answer it with.
   */
  it("a FAILED изпитен лист keeps «Неиздържан» — the лист is asked first", () => {
    expect(historyLessonMistakeView([SQUEEZE], false, false).notTaken).toBe(false);
    // …and the cause is still carried: the row loses the word, not the reason.
    expect(historyLessonMistakeView([SQUEEZE], false, false).titlesBg).toEqual([
      VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
    ]);
  });

  it("a CLEAN изпитен лист still says «не е взет»", () => {
    expect(historyLessonMistakeView([SQUEEZE], false, true).notTaken).toBe(true);
  });

  it("an ABSENT sheet verdict dates the row instead of muting it", () => {
    // `sheetPassed` is written from 2026-09-18; every row stored before it has
    // none. `!== false` rather than `=== true`, so an old not-taken drive keeps
    // the label it was given on the day (doc 92 §6) — the alternative silently
    // regrades every pre-existing row to «Неиздържан».
    expect(historyLessonMistakeView([SQUEEZE], false, undefined).notTaken).toBe(true);
  });

  it("is total over its four inputs — and «Неиздържан» is what a failed лист reads", () => {
    // The fold is a pure function of (hits?, aborted, sheetPassed) and the word
    // is a pure function of its output plus the stored `passed`. The census
    // instrument doc 92 §9 names still does not exist (lane H), so the claim
    // «no drive with a hit can read the wrong word» is made the only way it can
    // be: exhaustively. 2 × 3 × 2 rows ARE all the shapes a stored row has.
    const seen: Record<string, boolean> = {};
    for (const aborted of [false, true]) {
      for (const sheetPassed of [true, false, undefined]) {
        for (const hits of [[SQUEEZE], []]) {
          const key = `${aborted ? "A" : "-"}${sheetPassed === undefined ? "?" : sheetPassed ? "P" : "F"}${hits.length > 0 ? "H" : "-"}`;
          seen[key] = historyLessonMistakeView(hits, aborted, sheetPassed).notTaken;
        }
      }
    }
    expect(seen).toEqual({
      "-PH": true, // the 558: clean лист, hit, finished → «Не е взет»
      "-P-": false,
      "-FH": false, // the 96: the лист failed → «Неиздържан», and it says why
      "-F-": false,
      "-?H": true, // stored before 2026-09-18 → the label it was given
      "-?-": false,
      APH: false, // an abort has no grade at all, on any лист
      "AP-": false,
      AFH: false,
      "AF-": false,
      "A?H": false,
      "A?-": false,
    });
  });
});

describe("the name half — retrieved, never stored", () => {
  it("retitles from the violation catalogue", () => {
    expect(historyLessonMistakeView([SQUEEZE], false).titlesBg).toEqual([
      VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
    ]);
  });

  it("prefers the ACT's own title over the pooled one", () => {
    // The same two steps `makeViolation` runs for a charged event. Without it
    // the row reads «Спиране в зона със забрана» over a drive that stopped
    // alongside a parked car with no sign in sight — the (code, act) defect
    // `historyMistakes.ts` was repaired of in w10-4.
    const pooled = VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.titleBg;
    const view = historyLessonMistakeView(
      [{ code: "ILLEGAL_STOP_IN_BAN_ZONE", t: 8, charged: false, detail: "law-alongside" }],
      false,
    );
    expect(view.titlesBg).toEqual(["Спиране до спряла кола"]);
    expect(view.titlesBg[0]).not.toBe(pooled);
  });

  it("ignores any title the stored payload tries to carry", () => {
    // The column has no `titleBg` field by design; this is the guard that the
    // fold cannot be taught to read one. A tampered row may LIST what happened,
    // never word it (ADR-002).
    const forged = {
      code: "VULNERABLE_PASS_TOO_CLOSE",
      t: 20.9,
      charged: false,
      titleBg: "Перфектно каране",
    } as unknown as StoredLessonMistake;
    const view = historyLessonMistakeView([forged], false);
    expect(view.titlesBg).toEqual([VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg]);
    expect(view.titlesBg).not.toContain("Перфектно каране");
  });

  it("keeps the order the student met them in, and names each act once", () => {
    const view = historyLessonMistakeView(
      [
        SQUEEZE,
        { code: "HARSH_BRAKING_NO_CAUSE", t: 31, charged: false },
        { ...SQUEEZE, t: 44 },
      ],
      false,
    );
    expect(view.titlesBg).toEqual([
      VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
      VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg,
    ]);
  });
});

describe("the charged half — what reached the изпитен лист", () => {
  it("is false when every occurrence was taught for free", () => {
    expect(historyLessonMistakeView([SQUEEZE], false).anyCharged).toBe(false);
  });

  it("is true when any hit carries a charged repeat", () => {
    const view = historyLessonMistakeView(
      [SQUEEZE, { code: "HARSH_BRAKING_NO_CAUSE", t: 31, charged: true }],
      false,
    );
    expect(view.anyCharged).toBe(true);
  });

  it("is read off the rows, not off the first one", () => {
    // The row the student was taught at is the EARLIEST, and on a target it is
    // precisely the one that was NOT charged — so reading the flag off row 0
    // would say «нищо не влезе в точките» on a drive whose repeat had just
    // cost three of them.
    expect(historyLessonMistakeView([SQUEEZE, { ...SQUEEZE, t: 44, charged: true }], false)
      .anyCharged).toBe(true);
  });
});

/**
 * THE WIRING, WHICH IS WHERE THE WHOLE LANE WAS SWITCHED OFF.
 *
 * These four expressions used to live inside `page.tsx buildHistoryEntries`,
 * which no test can import. Lane F's verifier reverted each of them there in
 * turn — the corner override, `notTaken: false` for every row, empty titles,
 * the abort flag inverted — and every one stayed GREEN: 72 in the lane's own
 * suite, and 3,088 across `simulator`, `hud`, `learning` and `lessons` with the
 * lane off for every student. The fold was tested; the four lines that carry it
 * were not. They are here now, and this is what refuses them.
 */
describe("the row fields — the wire between the fold and the screen", () => {
  const ev = (over: Record<string, unknown> = {}) =>
    ({ lessonMistakes: [SQUEEZE], aborted: false, sheetPassed: true, ...over }) as never;

  it("hands the screen the lesson's own act as the corner, on a not-taken row", () => {
    // X-1: revert this to «the gravest charged fault» and the corner goes back
    // to «без грешки» on a drive that was refused — the row this ADR is about
    // has no charged fault at all.
    const f = historyLessonMistakeRowFields(ev(), null);
    expect(f.topMistakeTitleBg).toBe(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg);
    expect(f.notTaken).toBe(true);
    expect(f.lessonMistakeTitlesBg).toEqual([VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg]);
    expect(f.lessonMistakeCharged).toBe(false);
  });

  it("…and the CHARGED fault's title on a row the изпитен лист failed", () => {
    // The pill reads «Неиздържан» there, and the corner has to be about the
    // same thing the pill is. The lesson's act is named in the panel below.
    const f = historyLessonMistakeRowFields(
      ev({ sheetPassed: false }),
      "Удар в друго превозно средство",
    );
    expect(f.topMistakeTitleBg).toBe("Удар в друго превозно средство");
    expect(f.notTaken).toBe(false);
    expect(f.lessonMistakeTitlesBg).toEqual([VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg]);
  });

  it("carries the abort flag, and the charged flag, to the screen unchanged", () => {
    // X-4: invert `aborted` at the call and an abandoned drive starts claiming
    // a judgement it never reached.
    expect(historyLessonMistakeRowFields(ev({ aborted: true }), null).notTaken).toBe(false);
    expect(
      historyLessonMistakeRowFields(ev({ lessonMistakes: [{ ...SQUEEZE, charged: true }] }), null)
        .lessonMistakeCharged,
    ).toBe(true);
  });

  it("a row with no hits is the pre-ADR-009 row, byte for byte", () => {
    // Every drive stored before 2026-09-18, and every clean one since.
    expect(historyLessonMistakeRowFields({ aborted: false }, "Превишена скорост")).toEqual({
      topMistakeTitleBg: "Превишена скорост",
      notTaken: false,
      lessonMistakeTitlesBg: [],
      lessonMistakeCharged: false,
    });
    expect(historyLessonMistakeRowFields(null, null)).toEqual({
      topMistakeTitleBg: null,
      notTaken: false,
      lessonMistakeTitlesBg: [],
      lessonMistakeCharged: false,
    });
  });

  it("an unnameable act still refuses «без грешки» in the corner", () => {
    // The corner falls back to the charged fault — here there is none — and the
    // screen's «без грешки» branch is gated on `lessonMistakeTitlesBg` as well,
    // so the row says nothing rather than something false.
    const f = historyLessonMistakeRowFields(
      ev({ lessonMistakes: [{ code: "NO_SUCH_CODE_ANY_MORE", t: 3, charged: false }] }),
      null,
    );
    expect(f.notTaken).toBe(true);
    expect(f.topMistakeTitleBg).toBeNull();
    expect(f.lessonMistakeTitlesBg).toEqual([]);
  });
});
