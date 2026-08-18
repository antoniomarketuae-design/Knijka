/**
 * SWEEP 161 · THE THREE NUMBERS THE RESULT SCREEN CONTRADICTED.
 *
 * Every case below was read off a drive of the shipped build through
 * `tools/mobile/lesson-audit.mjs`, and the frame is named on the test. The
 * point of the file is the pair: each defect gets an assertion that FAILS on
 * the old markup and one for the opposite direction, because a screen that
 * explains a cap on every run explains nothing — a sentence that is always
 * printed is wallpaper, and a sentence that is never printed is the bug.
 *
 *   frame                                     what it showed
 *   ────────────────────────────────────────  ────────────────────────────────
 *   sc-vu-cyclist-hook/pc/wrong 08-debrief    „ЕДНА опасна грешка: 10 изпитни
 *                                             т." between a 20-point headline
 *                                             and a row reading „… 2 20"
 *   sc-rb-exit-signal/mobile/right 08-debrief „НЕИЗДЪРЖАН" and „+40 XP" ~60 px
 *                                             apart on one card
 *   sc-ed-reverse-line pc/right vs pc/wrong   0 points and 100 points, the SAME
 *                                             „Оценка на маневрата ★☆☆"
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for the whole suite, and the three questions here are about what the
 * markup SAYS. The `fault-card.test.tsx` precedent.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSessionSummary,
  makeViolation,
  type ScorableEvent,
} from "../../rules";
import { scoreRubric, type LessonResult, type RubricScore } from "../../lessons";
import {
  SessionEndScreen,
  collisionTotalReconcileBg,
  manoeuvreGradeReasonBg,
  xpChipBg,
} from "../SessionEndScreen";

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

/** A real graded result: the summary is the ENGINE's, never hand-written. */
function resultOf(
  events: ScorableEvent[],
  over: Partial<LessonResult> = {},
): LessonResult {
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

const COLLISION = "COLLISION";
const RUBRIC_1_STAR: RubricScore = { stars: 1, breakdownBg: [] };
const RUBRIC_3_STARS: RubricScore = { stars: 3, breakdownBg: [] };

function screenText(result: LessonResult, over: Partial<Parameters<typeof SessionEndScreen>[0]> = {}) {
  return textOf(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
      {...over}
    />,
  );
}

// ---------------------------------------------------------------------------
// 1 · „ЕДНА опасна грешка: 10 изпитни т." over a table that counts two
// ---------------------------------------------------------------------------

describe("the collision paragraph is reconciled with the table under it", () => {
  // THE FIXTURE IS NOT THE PHOTOGRAPHED EVENT LIST, AND THE REASON MATTERS.
  // The drive behind the frame hit TWICE in the same right turn — both marks
  // stamped 0:22 — and `.audit-frames/sweep161/sc-vu-cyclist-hook/pc-wrong/
  // log.txt` records the table it produced: «Опасни грешки 2 20 · Общо 2 20».
  // That exact event list can no longer reach two: the ledger landed in this
  // same wave (rules/scoring.ts, 2026-08-17) closes the exam at the first
  // terminating опасна and bills the closer ONCE, so 2 × ПТП now scores 10 and
  // the contradiction the frame photographed is gone by that road.
  //
  // The contradiction is NOT gone from the product, which is why this screen
  // fix stands. Наредба № 38 чл. 48 ал. 3 terminates for ПТП and NOT for a red
  // light, so an опасна that does not terminate is still billed beside the
  // collision: red light at 0:12 + ПТП at 0:22 = «2 20» over a paragraph that
  // accounts for 10. That is the live shape, and it is the fixture.
  const twoOpasni = resultOf(
    [makeViolation("RED_LIGHT_CROSSED", 12), makeViolation(COLLISION, 22)],
    { completedAll: false },
  );
  const oneCollision = resultOf([makeViolation(COLLISION, 22)], { completedAll: false });

  it("proves the fixture is the measured one: 2 × опасна = 20", () => {
    expect(twoOpasni.summary.terminated).toBe(true);
    expect(twoOpasni.summary.score.opasniCount).toBe(2);
    expect(twoOpasni.summary.score.opasniPoints).toBe(20);
    expect(twoOpasni.score).toBe(20);
  });

  it("pins the ledger interaction so the old fixture cannot come back", () => {
    // The photographed event list itself. If a later change reopens the ledger
    // this goes red HERE, next to the sentence that depends on it, instead of
    // silently restoring a table this screen would then have to explain again.
    const twoCollisions = resultOf(
      [makeViolation(COLLISION, 22), makeViolation(COLLISION, 22)],
      { completedAll: false },
    );
    expect(twoCollisions.summary.score.opasniCount).toBe(1);
    expect(twoCollisions.summary.score.opasniPoints).toBe(10);
    expect(twoCollisions.summary.score.unscoredAfterClose).toBe(1);
    // …and with only one billed опасна the reconciling sentence stays away.
    expect(screenText(twoCollisions)).not.toContain("Числото горе е за целия урок");
  });

  it("FAILS ON THE OLD MARKUP: the 20 above is accounted for, not just the 10", () => {
    const text = screenText(twoOpasni);
    // The ruled copy is still there, unedited.
    expect(text).toContain("Това е ЕДНА опасна грешка");
    // …and it no longer stands alone against a headline it does not explain.
    expect(text).toContain("Числото горе е за целия урок: 2 опасни грешки");
    expect(text).toContain("правят 20 изпитни т.");
    expect(text).toContain("сблъсъкът е една от тях");
  });

  it("THE OTHER DIRECTION: one collision gets no reconciling sentence", () => {
    // „ЕДНА … 10" IS the whole account when опасни = 1. A sentence here would
    // restate the table and teach nothing — the exact wallpaper this file exists
    // to refuse.
    const text = screenText(oneCollision);
    expect(text).toContain("Това е ЕДНА опасна грешка");
    expect(text).not.toContain("Числото горе е за целия урок");
    expect(collisionTotalReconcileBg(1, 10)).toBeNull();
    expect(collisionTotalReconcileBg(0, 0)).toBeNull();
  });

  it("counts in the engine's own tariff rather than a retyped 10", () => {
    // 3 × опасна must say 30, not a hard-coded product of a literal.
    expect(collisionTotalReconcileBg(3, 30)).toContain("3 опасни грешки по 10 изпитни т.");
    expect(collisionTotalReconcileBg(3, 30)).toContain("правят 30 изпитни т.");
  });
});

// ---------------------------------------------------------------------------
// 2 · „+40 XP" directly under „НЕИЗДЪРЖАН"
// ---------------------------------------------------------------------------

describe("the XP chip says what the XP is for when the verdict disagrees", () => {
  const failed = resultOf([makeViolation(COLLISION, 20)], { completedAll: false });
  const clean = resultOf([]);

  it("proves the fixture: the run the frame came from did not pass", () => {
    expect(failed.passed).toBe(false);
    expect(clean.passed).toBe(true);
  });

  it("FAILS ON THE OLD MARKUP: a failed run does not get a bare +40 XP chip", () => {
    const text = screenText(failed, { xpEarned: 40 });
    expect(text).toContain("Неиздържан");
    expect(text).toContain("+40 XP за завършеното каране");
    expect(text).toContain("XP се дава за времето зад волана, не за резултата");
  });

  it("THE OTHER DIRECTION: a pass keeps the plain chip and gets no apology", () => {
    const text = screenText(clean, { xpEarned: 150 });
    expect(text).toContain("+150 XP");
    expect(text).not.toContain("за завършеното каране");
    expect(text).not.toContain("не за резултата");
    // The chip takes the VERDICT since the badge became three-way — a run that
    // merely never finished must not be apologised to with „Неиздържан".
    expect(xpChipBg(150, "passed").noteBg).toBeNull();
  });

  it("says nothing at all when no XP was awarded (an aborted session)", () => {
    const text = screenText(resultOf([], { aborted: true, passed: false }), { xpEarned: null });
    expect(text).not.toContain("XP");
  });
});

// ---------------------------------------------------------------------------
// 3 · one star for a flawless drive and one star for a catastrophic one
// ---------------------------------------------------------------------------

describe("the manoeuvre grade says WHY it landed there", () => {
  // The two sc-ed-reverse-line runs, reduced to what separates them: „0
  // наказателни точки · Общо 0" against „100 наказателни точки · Опасни грешки
  // 10 100". Ten опасни and not ten collisions — a collision closes the ledger
  // (rules/scoring.ts), so ten of those would have scored 10, not 100.
  const flawlessButUnfinished = resultOf([], { completedAll: false, passed: false });
  const catastrophic = resultOf(
    Array.from({ length: 10 }, (_, i) => makeViolation("RED_LIGHT_CROSSED", 10 + i)),
    { completedAll: false, passed: false },
  );

  it("proves the fixtures are the measured pair: 0 points vs 100", () => {
    expect(flawlessButUnfinished.score).toBe(0);
    expect(catastrophic.score).toBe(100);
    expect(catastrophic.summary.score.opasniCount).toBe(10);
  });

  it("FAILS ON THE OLD MARKUP: the two ★☆☆ cards no longer read identically", () => {
    const clean = screenText(flawlessButUnfinished, { rubric: RUBRIC_1_STAR });
    const wrecked = screenText(catastrophic, { rubric: RUBRIC_1_STAR });
    expect(clean).toContain("остана неизпълнена задача от маршрута");
    expect(clean).not.toContain("има опасна грешка");
    expect(wrecked).toContain("има опасна грешка");
    // The whole finding, as one assertion: the same star count, different cards.
    expect(clean).not.toEqual(wrecked);
  });

  it("names a collision as a collision rather than twice as an опасна", () => {
    const collided = resultOf([makeViolation(COLLISION, 22)], { completedAll: false });
    const reason = manoeuvreGradeReasonBg(collided) ?? "";
    expect(reason).toContain("има сблъсък");
    expect(reason).not.toContain("има опасна грешка");
  });

  it("THE OTHER DIRECTION: a floored-by-nothing run gets no cap sentence", () => {
    // Completed, zero points: the breakdown rows are the explanation and a
    // „закован на дъното" line would be a lie about a three-star run.
    const green = resultOf([]);
    expect(manoeuvreGradeReasonBg(green)).toBeNull();
    const text = screenText(green, { rubric: RUBRIC_3_STARS });
    expect(text).not.toContain("Само една звезда");
    expect(text).not.toContain("Най-много две звезди");
  });

  it("explains the two-star ceiling separately from the one-star floor", () => {
    const oneMinor = resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 12)]);
    expect(oneMinor.completedAll).toBe(true);
    expect(oneMinor.score).toBeGreaterThan(0);
    expect(manoeuvreGradeReasonBg(oneMinor)).toContain("Най-много две звезди");
  });

  // -------------------------------------------------------------------------
  // THE NOTE MUST NOT OUTLIVE THE CAP IT EXPLAINS.
  //
  // `manoeuvreGradeReasonBg` restates a rule that lives in another module. The
  // way that goes wrong is silently: doc 76 §6 gets revised, `scoreRubric`
  // stops flooring one of the four cases, and this screen keeps printing „Само
  // една звезда, защото …" beside three stars. So the real scorer is driven and
  // the two answers are compared, not trusted.
  // -------------------------------------------------------------------------
  it("agrees with scoreRubric about which runs are floored at one star", () => {
    const cases: Array<[string, LessonResult]> = [
      ["collision", catastrophic],
      ["unfinished", flawlessButUnfinished],
      ["aborted", resultOf([], { aborted: true, passed: false })],
      ["dangerous, route finished", resultOf([makeViolation("RED_LIGHT_CROSSED", 30)])],
      ["clean and finished", resultOf([])],
      ["one minor, finished", resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 12)])],
    ];
    for (const [label, result] of cases) {
      const stars = scoreRubric(result, {}).stars;
      const reason = manoeuvreGradeReasonBg(result);
      const claimsFloor = reason !== null && reason.startsWith("Само една звезда");
      expect(`${label}: floored=${claimsFloor}`).toBe(`${label}: floored=${stars === 1}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 · the star row's TEXT carried three stars on a one-star run
// ---------------------------------------------------------------------------

describe("the star row carries its grade in glyphs, not only in colour", () => {
  const result = resultOf([], { completedAll: false, passed: false });

  /** The glyphs, in row order — one `<span>` each, so counted on the markup. */
  function starGlyphs(rubric: RubricScore, over: Partial<LessonResult> = {}): string {
    const markup = renderToStaticMarkup(
      <SessionEndScreen
        lessonTitleBg="Тестов урок"
        result={resultOf([], { completedAll: false, passed: false, ...over })}
        debriefText="разбор"
        concepts={[]}
        xpEarned={null}
        onRetry={() => undefined}
        onExit={() => undefined}
        nextLessonTitleBg={null}
        onNextLesson={null}
        rubric={rubric}
      />,
    );
    return (markup.match(/[★☆]/g) ?? []).join("");
  }

  it("FAILS ON THE OLD MARKUP: one star prints one filled glyph and two hollow", () => {
    // WAS „★★★" on every run, at every grade — the count lived in the inline
    // `color` and nowhere else, so the audit ledger that reads text (and a
    // student reading a phone in sun) was handed three stars for the worst
    // drive in the sweep.
    expect(starGlyphs(RUBRIC_1_STAR)).toBe("★☆☆");
    expect(starGlyphs({ stars: 2, breakdownBg: [] })).toBe("★★☆");
  });

  it("THE OTHER DIRECTION: three stars still print three filled glyphs", () => {
    expect(starGlyphs(RUBRIC_3_STARS, { completedAll: true, passed: true })).toBe("★★★");
  });

  it("keeps the spoken count, which was already right", () => {
    const markup = renderToStaticMarkup(
      <SessionEndScreen
        lessonTitleBg="Тестов урок"
        result={result}
        debriefText="разбор"
        concepts={[]}
        xpEarned={null}
        onRetry={() => undefined}
        onExit={() => undefined}
        nextLessonTitleBg={null}
        onNextLesson={null}
        rubric={RUBRIC_1_STAR}
      />,
    );
    expect(markup).toContain('aria-label="1 от 3 звезди"');
  });
});
