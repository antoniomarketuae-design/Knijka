/**
 * SWEEP 161 · THE BADGE AND THE NUMBER, WHICH BOTH SAID THE SAME ONE BIT.
 *
 * Ten of the twenty-two BROKEN findings routed at `SessionEndScreen.tsx` are
 * one defect: a run that broke no rule on the изпитен лист and simply never
 * reached the end of the route was stamped НЕИЗДЪРЖАН. Three more are its twin
 * on the number above it — the score wearing the VERDICT's colour, so a red 0
 * sat under a red FAIL. The frames:
 *
 *   frame                                          what it showed
 *   ─────────────────────────────────────────────  ──────────────────────────
 *   sc-ov-being-overtaken/pc-wrong/08-debrief      „Опасни 0 0 · Основни 0 0 ·
 *                                                  Второстепенни 0 0 · Общо 0 0"
 *                                                  under a red НЕИЗДЪРЖАН with
 *                                                  no bullet under it, and
 *                                                  „+40 XP" beside it
 *   sc-lane-change/mobile-right/08-debrief         a 96 px „0" painted danger
 *                                                  red, „Урокът беше прекъснат
 *                                                  преди края."
 *   sc-zebra-approach/pc-right/08-debrief          THE SAME ZERO IN GREEN
 *   sc-ov-crest-curve (whole chunk)                28 of 28 runs НЕИЗДЪРЖАН,
 *                                                  six with zero mistakes
 *
 * WHAT THIS FILE IS FOR IS THE SECOND HALF OF EACH PAIR. The founder has been
 * burned by a false pass and by a false failure alike, so every case below has
 * a partner that must NOT move: a collision still reads НЕИЗДЪРЖАН, a run that
 * blew the allowance with the route finished still reads НЕИЗДЪРЖАН, and
 * `sessionVerdict` returns „passed" for exactly the results whose `passed` is
 * true — no wider.
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for the whole suite. The classes are read off the markup because the
 * defect IS a class — the sibling `session-end-numbers.test.tsx` precedent.
 *
 * MUTATION, run before this file was committed (each reverts one shipped line):
 *   · badge back to `result.passed ? "Издържан" : "Неиздържан"`
 *       → „the badge no longer convicts a drive the изпитен лист cleared" red
 *   · `sessionVerdict` returning "unfinished" whenever `!result.passed`
 *       → „THE OTHER DIRECTION: a collision is still НЕИЗДЪРЖАН" red
 *   · `pointsToneClass` back to `passed ? success : danger`
 *       → „a clean sheet is never painted in the failure colour" red
 *   · `xpChipBg` note hard-coding „Неиздържан"
 *       → „the XP apology names the badge the student can see" red
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation, type ScorableEvent } from "../../rules";
import type { LessonResult } from "../../lessons";
import {
  SessionEndScreen,
  pointsToneClass,
  sessionVerdict,
  unfinishedVerdictNoteBg,
  xpChipBg,
} from "../SessionEndScreen";

/** A real graded result: the summary is the ENGINE's, never hand-written. */
function resultOf(events: ScorableEvent[], over: Partial<LessonResult> = {}): LessonResult {
  const summary = buildSessionSummary(events);
  return {
    lessonId: "sc-test",
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
    ...over,
  };
}

function markupOf(result: LessonResult, xpEarned: number | null = null): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={xpEarned}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
    />,
  );
}

/** The verdict pill, as the student sees it: its word and its colour. */
function verdictPill(markup: string): { labelBg: string; className: string } {
  const m = markup.match(
    /<p class="rounded-full px-4 py-1\.5 text-sm font-black uppercase tracking-wide ([^"]*)">([^<]*)<\/p>/,
  );
  if (m === null) throw new Error("no verdict pill in the markup");
  return { className: m[1], labelBg: m[2] };
}

/** The 6xl headline number and the tone it is painted in. */
function headline(markup: string): { text: string; className: string } {
  const m = markup.match(/<span class="text-6xl font-black tabular-nums ([^"]*)">([^<]*)<\/span>/);
  if (m === null) throw new Error("no headline score in the markup");
  return { className: m[1], text: m[2] };
}

// The four shapes the sweep produced, each built from real engine events.
// TURN_WITHOUT_INDICATOR is основна (3 изпитни т.), COLLISION is опасна.
const CLEAN_AND_UNFINISHED = resultOf([], { completedAll: false, passed: false });
const CLEAN_AND_ABORTED = resultOf([], { aborted: true, passed: false });
const COLLIDED = resultOf([makeViolation("COLLISION", 22)], { completedAll: false });
const OVER_ALLOWANCE = resultOf(
  [10, 20, 30, 40].map((t) => makeViolation("TURN_WITHOUT_INDICATOR", t)),
);
const CLEAN_AND_PASSED = resultOf([]);
const PASSED_WITH_POINTS = resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)]);

describe("the fixtures are the measured shapes, read from the engine", () => {
  it("sc-ov-being-overtaken: a clean sheet, an unfinished route", () => {
    expect(CLEAN_AND_UNFINISHED.summary.passed).toBe(true);
    expect(CLEAN_AND_UNFINISHED.summary.failReasons).toEqual([]);
    expect(CLEAN_AND_UNFINISHED.score).toBe(0);
    expect(CLEAN_AND_UNFINISHED.passed).toBe(false);
  });

  it("the partners really do fail the изпитен лист", () => {
    expect(COLLIDED.summary.passed).toBe(false);
    expect(COLLIDED.summary.score.hasDangerous).toBe(true);
    expect(OVER_ALLOWANCE.summary.passed).toBe(false);
    expect(OVER_ALLOWANCE.score).toBe(12);
    // …and this one finished its route, so only the sheet can be convicting it.
    expect(OVER_ALLOWANCE.completedAll).toBe(true);
  });

  it("a pass with points on the sheet exists too — 3 of the 9 allowed", () => {
    expect(PASSED_WITH_POINTS.passed).toBe(true);
    expect(PASSED_WITH_POINTS.score).toBe(3);
  });
});

describe("the badge no longer convicts a drive the изпитен лист cleared", () => {
  it("FAILS ON THE OLD MARKUP: an unfinished clean run reads „Незавършен“", () => {
    const pill = verdictPill(markupOf(CLEAN_AND_UNFINISHED));
    expect(pill.labelBg).toBe("Незавършен");
    expect(pill.labelBg).not.toBe("Неиздържан");
    // Unresolved, not condemned — and not the pass colour either.
    expect(pill.className).toContain("text-warning");
    expect(pill.className).not.toContain("text-danger");
    expect(pill.className).not.toContain("text-success");
  });

  it("an aborted clean run is the same state and reads the same word", () => {
    expect(verdictPill(markupOf(CLEAN_AND_ABORTED)).labelBg).toBe("Незавършен");
  });

  it("THE OTHER DIRECTION: a collision is still НЕИЗДЪРЖАН, in danger red", () => {
    const pill = verdictPill(markupOf(COLLIDED));
    expect(pill.labelBg).toBe("Неиздържан");
    expect(pill.className).toContain("text-danger");
  });

  it("THE OTHER DIRECTION: blowing the allowance with the route finished too", () => {
    // The route was completed; nothing but the sheet can be speaking here, and
    // it must still speak. This is the case a „be kinder to unfinished runs"
    // rewrite would quietly take with it.
    const pill = verdictPill(markupOf(OVER_ALLOWANCE));
    expect(pill.labelBg).toBe("Неиздържан");
  });

  it("THE OTHER DIRECTION: a pass is still „Издържан“ in success green", () => {
    const pill = verdictPill(markupOf(CLEAN_AND_PASSED));
    expect(pill.labelBg).toBe("Издържан");
    expect(pill.className).toContain("text-success");
  });

  it("„passed“ is returned for exactly the results whose `passed` is true", () => {
    // The anti-loosening invariant, as one loop: the new third state may only
    // ever split the FALSE branch of `result.passed`. Nothing here can widen a
    // pass, so no lesson can unlock on a run that did not earn it.
    for (const r of [
      CLEAN_AND_UNFINISHED,
      CLEAN_AND_ABORTED,
      COLLIDED,
      OVER_ALLOWANCE,
      CLEAN_AND_PASSED,
      PASSED_WITH_POINTS,
    ]) {
      expect(`${r.lessonId} ${sessionVerdict(r) === "passed"}`).toBe(`${r.lessonId} ${r.passed}`);
    }
  });

  it("and the run is still not credited: the warning lines stay exactly as they were", () => {
    expect(markupOf(CLEAN_AND_UNFINISHED)).toContain(
      "Не всички задачи от маршрута бяха изпълнени.",
    );
    expect(markupOf(CLEAN_AND_ABORTED)).toContain("Урокът беше прекъснат преди края.");
  });
});

describe("„Незавършен“ carries its own account — THEO-4 on the one badge without one", () => {
  it("FAILS ON THE OLD MARKUP: it says why it is neither word, and what to do", () => {
    const note = unfinishedVerdictNoteBg(CLEAN_AND_UNFINISHED) ?? "";
    expect(note).toContain("Изпитният лист остана чист");
    expect(note).toContain("няма нарушение");
    expect(note).toContain("изкаран докрай");
    expect(markupOf(CLEAN_AND_UNFINISHED)).toContain("Изпитният лист остана чист");
  });

  it("names the points when the sheet was not clean but was inside the allowance", () => {
    // 3 точки and an unfinished route: „чист" would be a lie, and a bare „3
    // точки" would read as контролни точки — the misreading pointScales exists
    // to stop.
    const unfinishedWithPoints = resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)], {
      completedAll: false,
      passed: false,
    });
    const note = unfinishedVerdictNoteBg(unfinishedWithPoints) ?? "";
    expect(note).toContain("3 наказателни точки");
    expect(note).not.toContain("остана чист");
  });

  it("THE OTHER DIRECTION: the other two verdicts get no such sentence", () => {
    // „Неиздържан" already has the failReasons list under it and „Издържан"
    // needs no defence. A third sentence on either is wallpaper.
    expect(unfinishedVerdictNoteBg(COLLIDED)).toBeNull();
    expect(unfinishedVerdictNoteBg(CLEAN_AND_PASSED)).toBeNull();
    expect(markupOf(COLLIDED)).not.toContain("Изпитният лист остана чист");
    expect(markupOf(CLEAN_AND_PASSED)).not.toContain("Изпитният лист остана чист");
  });
});

describe("the score wears the number's colour, not the verdict's", () => {
  it("FAILS ON THE OLD MARKUP: a clean sheet is never painted in the failure colour", () => {
    const h = headline(markupOf(CLEAN_AND_UNFINISHED));
    expect(h.text).toBe("0");
    expect(h.className).toBe("text-success");
  });

  it("…and the „Общо (допустими 9)“ cell agrees with it on the same number", () => {
    // The frames show both: a red 96 px 0 AND a red 0 in the total row.
    expect(markupOf(CLEAN_AND_UNFINISHED)).toContain(
      '<td class="py-2 text-right font-black tabular-nums text-success">0</td>',
    );
  });

  it("closes the cross-lesson contradiction: the same 0 is the same colour", () => {
    // sc-zebra-approach/pc-right printed a GREEN 0 and sc-lane-change/
    // mobile-right a RED one, for the same number with the same meaning.
    expect(headline(markupOf(CLEAN_AND_PASSED)).className).toBe(
      headline(markupOf(CLEAN_AND_UNFINISHED)).className,
    );
  });

  it("THE OTHER DIRECTION: points inside the allowance are amber, not green", () => {
    // A pass with 3 of the 9 allowed is not a clean sheet, and this is where a
    // „paint zero green" change would slide into painting everything green.
    const h = headline(markupOf(PASSED_WITH_POINTS));
    expect(h.text).toBe("3");
    expect(h.className).toBe("text-warning");
  });

  it("THE OTHER DIRECTION: a failed sheet is still danger red", () => {
    expect(headline(markupOf(COLLIDED)).className).toBe("text-danger");
    expect(headline(markupOf(OVER_ALLOWANCE)).className).toBe("text-danger");
  });

  it("the bands, stated once on the helper", () => {
    expect(pointsToneClass(0, true)).toBe("text-success");
    expect(pointsToneClass(3, true)).toBe("text-warning");
    expect(pointsToneClass(9, true)).toBe("text-warning");
    expect(pointsToneClass(12, false)).toBe("text-danger");
    expect(pointsToneClass(10, false)).toBe("text-danger");
  });
});

describe("the XP apology names the badge the student can see", () => {
  it("FAILS ON THE OLD MARKUP: an unfinished run is not told it is „Неиздържан“", () => {
    // sc-ov-being-overtaken/pc-wrong is exactly this: 0 точки, 0 of 2
    // objectives, +40 XP. The chip's note used to name the wrong word.
    const chip = xpChipBg(40, "unfinished");
    expect(chip.labelBg).toBe("+40 XP за завършеното каране");
    expect(chip.noteBg).toContain("„Незавършен“");
    expect(chip.noteBg).not.toContain("„Неиздържан“");
    const markup = markupOf(CLEAN_AND_UNFINISHED, 40);
    expect(markup).toContain("XP се дава за времето зад волана, не за резултата");
    expect(markup).toContain("„Незавършен“");
  });

  it("THE OTHER DIRECTION: a failed run keeps the word it earned", () => {
    expect(xpChipBg(40, "failed").noteBg).toContain("„Неиздържан“");
  });

  it("THE OTHER DIRECTION: a pass keeps the plain chip and gets no apology", () => {
    expect(xpChipBg(150, "passed")).toEqual({
      labelBg: "+150 XP",
      noteBg: null,
      chipClass: "bg-accent/15 text-accent",
    });
  });

  it("FAILS ON THE OLD MARKUP: the chip stops wearing the accent on a non-pass", () => {
    // sc-park-van/mobile-right: an accent pill the same shape and weight as the
    // НЕИЗДЪРЖАН pill 45 px above it, over a collision.
    expect(xpChipBg(40, "failed").chipClass).not.toContain("accent");
    expect(xpChipBg(40, "unfinished").chipClass).not.toContain("accent");
    expect(markupOf(COLLIDED, 40)).toContain(
      '<p class="rounded-full px-3 py-1 text-xs font-black border border-border text-muted">',
    );
  });

  it("THE OTHER DIRECTION: a pass still gets the accent chip it earned", () => {
    expect(markupOf(CLEAN_AND_PASSED, 100)).toContain(
      '<p class="rounded-full px-3 py-1 text-xs font-black bg-accent/15 text-accent">',
    );
  });
});
