/**
 * ADR-009 (founder Ruling A, 2026-09-17) · THE FOURTH VERDICT AND THE REASON
 * UNDER IT — doc 92 §5.1, §5.2, §5.3 and §5.7.
 *
 * WHAT WAS WRONG ON THE TREE THIS FILE WAS WRITTEN AGAINST, measured by driving
 * every authored tape × rung in-process (`tools/audit/inprocess-drive.mjs`'s
 * chain, re-run by this lane):
 *
 *   133 practice drives finished their route with a spotless изпитен лист,
 *   were REFUSED by Ruling A — and printed «Незавършен» over a note reading
 *   «зачита се само урок, изкаран докрай. Карай го отново и стигни до края, за
 *   да получиш оценка». The engine's `passed` had already gone false (lane C);
 *   `sessionVerdict` had three arms and a refused-but-clean drive fell through
 *   to `unfinished`. So the product refused the lesson and then told the
 *   student to go and reach a finish he had already reached.
 *
 * That is not a missing feature: it is a screen saying something false, and doc
 * 64 THEO-4 rates a bare or wrong verdict as itself the defect. THE WHOLE OF
 * THIS FILE IS THAT ONE SENTENCE'S TEST.
 *
 * HOW IT IS BUILT. Every fixture's `summary` is the ENGINE's
 * (`buildSessionSummary` over real `makeViolation` events), never hand-written,
 * and every hit's copy is the CATALOGUE's (`lessonMistakeCopy`) — so an
 * assertion here cannot pass against copy this screen invented. The one thing
 * spelled out as a literal is the composed prose the screen owns (the note, the
 * stake, the heading), because that is the text a 17-year-old reads and the
 * only way to catch it drifting is to write it down.
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for the whole suite — the sibling `session-end-verdict.test.tsx`
 * precedent.
 *
 * MUTATION TABLE — every break applied to a SCRATCH COPY of the source (never
 * the live file: other lanes and verifiers are measuring it), each run on its
 * own, with the case that went red:
 *
 *   1  `sessionVerdict`: drop the `lessonMistake` arm      → «the fourth verdict
 *      (back to three arms, the state falls to `unfinished`)   exists at all» +
 *                                                             the note cases
 *   2  `sessionVerdict`: drop `!result.aborted`            → «an aborted run
 *                                                             never reads Не е
 *                                                             взет»
 *   3  `sessionVerdict`: check hits BEFORE `summary.passed` → «a failed sheet is
 *                                                             still Неиздържан»
 *   4  `lessonMistakeReasonsBg`: `return []`               → every reason-block
 *                                                             case
 *   5  reason entry: drop `stakeBg`                        → «the first
 *                                                             occurrence says
 *                                                             it cost no
 *                                                             points»
 *   6  reason entry: use the not-charged stake for a repeat → «a repeat says
 *                                                             where the points
 *                                                             went»
 *   7  `lessonMistakeVerdictNoteBg`: return `sheetStandingBg` alone
 *                                                          → «the note names
 *                                                             the act, the
 *                                                             ruling and the
 *                                                             way out»
 *   8  abort variant: fall through to the shipped tail     → «an aborted run
 *                                                             with a hit is not
 *                                                             told to just
 *                                                             finish»
 *   9  `lessonMistakeReasonsBg`: drop the `copy === null` skip
 *                                                          → «an uncatalogued
 *                                                             code drops its
 *                                                             row» (throws)
 *
 * Each mutation's red case is named in `docs/simulation/92_…` terms in the lane
 * report; the pairs that must NOT move are in this file too, every one of them
 * a byte-identical assertion against the three verdicts that shipped.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation, type ScorableEvent } from "../../rules";
import { lessonMistakeCopy, type LessonMistakeHit, type LessonResult } from "../../lessons";
import {
  SessionEndScreen,
  lessonMistakeReasonsBg,
  lessonMistakeVerdictNoteBg,
  manoeuvreGradeReasonBg,
  sessionVerdict,
  unfinishedVerdictNoteBg,
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

/** A hit as `foldLessonMistakes` stamps one: title RETRIEVED, not invented. */
function hitOf(code: string, t: number, over: Partial<LessonMistakeHit> = {}): LessonMistakeHit {
  const copy = lessonMistakeCopy({ code, t });
  if (copy === null) throw new Error(`${code} is not in the catalogue`);
  return { code, t, charged: false, titleBg: copy.titleBg, ...over };
}

function markupOf(result: LessonResult, compact = false): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Изпреварване на велосипедист"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
      compact={compact}
    />,
  );
}

/** Markup with tags stripped — what a reader actually reads. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** The verdict pill, as the student sees it: its word and its colour. */
function verdictPill(markup: string): { labelBg: string; className: string } {
  const m = markup.match(
    /<p class="rounded-full px-4 py-1\.5 text-sm font-black uppercase tracking-wide ([^"]*)">([^<]*)<\/p>/,
  );
  if (m === null) throw new Error("no verdict pill in the markup");
  return { className: m[1], labelBg: m[2] };
}

/** The reason block's own subtree, addressed by the hook the shell can find. */
function reasonSection(markup: string): string | null {
  const at = markup.indexOf('data-hud="lesson-mistake-reason"');
  if (at === -1) return null;
  const open = markup.lastIndexOf("<section", at);
  const close = markup.indexOf("</section>", at);
  if (open === -1 || close === -1) throw new Error("the reason section is not a <section>");
  return markup.slice(open, close + "</section>".length);
}

// ---------------------------------------------------------------------------
// THE FIXTURES — the four shapes the census measured, plus the partners that
// must NOT move.
// ---------------------------------------------------------------------------

const SQUEEZE = hitOf("VULNERABLE_PASS_TOO_CLOSE", 20.9);
const PANIC = hitOf("HARSH_BRAKING_NO_CAUSE", 41);
const NO_SIGNAL = hitOf("TURN_WITHOUT_INDICATOR", 63.4);
const CENTRE_LINE = hitOf("CENTER_LINE_TOUCHED", 77);

/** THE 133: route finished, sheet spotless, refused by the lesson rule. */
const CLEAN_ROUTE_REFUSED = resultOf([], { passed: false, lessonMistakes: [SQUEEZE] });
/** The same, with a genuine repeat on the sheet (founder answer F1). */
const REPEAT_CHARGED = resultOf([makeViolation("VULNERABLE_PASS_TOO_CLOSE", 61)], {
  passed: false,
  lessonMistakes: [hitOf("VULNERABLE_PASS_TOO_CLOSE", 20.9, { charged: true })],
});
/** A hit on a drive the sheet ALSO convicted — the block must still render. */
const FAILED_SHEET_WITH_HIT = resultOf(
  [10, 20, 30, 40].map((t) => makeViolation("TURN_WITHOUT_INDICATOR", t)),
  { passed: false, lessonMistakes: [SQUEEZE] },
);
/** Abandoned with a hit: «Незавършен», and the note says both halves. */
const ABORTED_WITH_HIT = resultOf([], {
  aborted: true,
  passed: false,
  lessonMistakes: [SQUEEZE],
});
/** The three shipped verdicts, unchanged, as the anti-drift partners. */
const CLEAN_AND_UNFINISHED = resultOf([], { completedAll: false, passed: false });
const CLEAN_AND_ABORTED = resultOf([], { aborted: true, passed: false });
const COLLIDED = resultOf([makeViolation("COLLISION", 22)], { completedAll: false });
const CLEAN_AND_PASSED = resultOf([]);

describe("the fixtures are real: engine summary, catalogue copy", () => {
  it("THE 133 shape — the изпитен лист cleared this drive and the route finished", () => {
    expect(CLEAN_ROUTE_REFUSED.summary.passed).toBe(true);
    expect(CLEAN_ROUTE_REFUSED.summary.failReasons).toEqual([]);
    expect(CLEAN_ROUTE_REFUSED.score).toBe(0);
    expect(CLEAN_ROUTE_REFUSED.completedAll).toBe(true);
    expect(CLEAN_ROUTE_REFUSED.aborted).toBe(false);
    // …and `passed` is false only because of the hit — lane C's fold.
    expect(CLEAN_ROUTE_REFUSED.passed).toBe(false);
  });

  it("the hit's title is the CATALOGUE's, not this file's", () => {
    expect(SQUEEZE.titleBg).toBe("Тясно изпреварване на велосипедист");
  });

  it("the repeat really reached the изпитен лист", () => {
    expect(REPEAT_CHARGED.score).toBeGreaterThan(0);
    expect(REPEAT_CHARGED.lessonMistakes?.[0].charged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1 · THE FOURTH VERDICT
// ---------------------------------------------------------------------------

describe("«Не е взет» — the verdict the 133 drives were missing", () => {
  it("FAILS ON THE OLD SCREEN: the fourth verdict exists at all", () => {
    expect(sessionVerdict(CLEAN_ROUTE_REFUSED)).toBe("lessonMistake");
    const pill = verdictPill(markupOf(CLEAN_ROUTE_REFUSED));
    expect(pill.labelBg).toBe("Не е взет");
    // Warning, not danger: the изпитен лист cleared this drive. `--danger` is
    // what «Неиздържан» means on this screen and may not be borrowed.
    expect(pill.className).toContain("text-warning");
    expect(pill.className).not.toContain("text-danger");
    expect(pill.className).not.toContain("text-success");
  });

  it("FAILS ON THE OLD SCREEN: it no longer tells him to reach the end he reached", () => {
    // THE DEFECT, as one assertion. The old screen printed this instruction to
    // a student who had completed every objective on the route.
    const text = textOf(markupOf(CLEAN_ROUTE_REFUSED));
    expect(text).not.toContain("стигни до края");
    expect(text).not.toContain("Незавършен");
    expect(text).not.toContain("зачита се само урок, изкаран докрай");
  });

  it("an aborted run with a hit is NOT told «Не е взет»", () => {
    // Graft 5 (doc 92 §5.1): an abandoned run was not driven to the end, so it
    // has no verdict to give. It keeps «Незавършен» — and gets both halves of
    // its account from the note instead (below).
    expect(sessionVerdict(ABORTED_WITH_HIT)).toBe("unfinished");
    expect(verdictPill(markupOf(ABORTED_WITH_HIT)).labelBg).toBe("Незавършен");
  });

  it("THE OTHER DIRECTION: a failed изпитен лист is still «Неиздържан», hit or not", () => {
    // The sheet is consulted FIRST and stays the only authority for that word.
    // This is the assertion a «be kinder to lesson mistakes» rewrite would take
    // with it: 25 hit drives per practice rung read «Неиздържан» by design.
    expect(sessionVerdict(FAILED_SHEET_WITH_HIT)).toBe("failed");
    expect(verdictPill(markupOf(FAILED_SHEET_WITH_HIT)).labelBg).toBe("Неиздържан");
    expect(sessionVerdict(COLLIDED)).toBe("failed");
  });

  it("THE OTHER DIRECTION: the three shipped verdicts are byte-identical", () => {
    expect(sessionVerdict(CLEAN_AND_PASSED)).toBe("passed");
    expect(sessionVerdict(CLEAN_AND_UNFINISHED)).toBe("unfinished");
    expect(sessionVerdict(CLEAN_AND_ABORTED)).toBe("unfinished");
    expect(verdictPill(markupOf(CLEAN_AND_PASSED)).labelBg).toBe("Издържан");
    expect(verdictPill(markupOf(CLEAN_AND_UNFINISHED)).labelBg).toBe("Незавършен");
  });

  it("nothing here can widen a pass — the anti-loosening loop", () => {
    for (const r of [
      CLEAN_ROUTE_REFUSED,
      REPEAT_CHARGED,
      FAILED_SHEET_WITH_HIT,
      ABORTED_WITH_HIT,
      CLEAN_AND_UNFINISHED,
      CLEAN_AND_ABORTED,
      COLLIDED,
      CLEAN_AND_PASSED,
    ]) {
      expect(`${sessionVerdict(r) === "passed"}`).toBe(`${r.passed}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · THE NOTE UNDER THE PILL
// ---------------------------------------------------------------------------

describe("the note under «Не е взет» — THEO-4 on a refusal", () => {
  const note = lessonMistakeVerdictNoteBg(CLEAN_ROUTE_REFUSED) ?? "";

  it("FAILS ON THE OLD SCREEN: the note names the act, the ruling and the way out", () => {
    // The four questions the student has, in order: why not «Неиздържан», what
    // happened, does the first time count, and what now.
    expect(note).toBe(
      "Изпитният лист остана чист, затова тук не пише „Неиздържан“. " +
        "Но „Тясно изпреварване на велосипедист“ е грешката, която този урок учи — " +
        "щом тя се случи, урокът не се зачита, дори първия път. " +
        "Защо е грешка и как се прави правилно — по-долу, в „Грешката на този урок“. " +
        "Карай урока отново: ще го вземеш, когато мине без нея.",
    );
    expect(textOf(markupOf(CLEAN_ROUTE_REFUSED))).toContain(note);
  });

  it("FAILS ON THE SPEC'S OWN COPY: an unfinished route is asked for BOTH things", () => {
    // MEASURED on this tree over all 2,434 authored drives: of the 558 that now
    // read «Не е взет», only 133 finished their route — 425 did not. Doc 92
    // §5.2's closing clause («ще го вземеш, когато мине без нея») names ONE
    // condition, and on those 425 that is necessary-but-not-sufficient: exactly
    // the shape of wrongness this lane removed from the other direction.
    const unfinished = resultOf([], {
      passed: false,
      completedAll: false,
      lessonMistakes: [SQUEEZE],
    });
    expect(sessionVerdict(unfinished)).toBe("lessonMistake");
    const n = lessonMistakeVerdictNoteBg(unfinished) ?? "";
    expect(n).toContain("Карай урока отново — до края и без нея.");
    expect(n).not.toContain("ще го вземеш, когато мине без");
    // …and the finished-route drive keeps the promise it can keep.
    expect(lessonMistakeVerdictNoteBg(CLEAN_ROUTE_REFUSED)).toContain(
      "ще го вземеш, когато мине без нея.",
    );
    // Plural, both ways.
    expect(
      lessonMistakeVerdictNoteBg(
        resultOf([], { passed: false, completedAll: false, lessonMistakes: [SQUEEZE, PANIC] }),
      ),
    ).toContain("до края и без тях.");
    // The route fact is on the card in its own words too — the note does not
    // replace it, it stops contradicting it.
    expect(textOf(markupOf(unfinished))).toContain(
      "Не всички задачи от маршрута бяха изпълнени.",
    );
  });

  it("it points at the section by the name the section actually prints", () => {
    // DOC 92 §5.2 authors this clause as «веднага отдолу». MEASURED on the
    // shipping CSS at 360 px: the reason block's top is 256 px below this
    // note's last line, with the whole 195 px «Разбивка на наказателните точки»
    // table between them — «веднага» is not true, so the note names the
    // landmark instead. That only helps if the two strings cannot drift, which
    // is what this case is: the note's quoted name must be the heading the
    // block renders, at BOTH cardinalities.
    for (const hits of [[SQUEEZE], [SQUEEZE, PANIC]]) {
      const r = resultOf([], { passed: false, lessonMistakes: hits });
      const quoted = /по-долу, в „([^“”]+)“/.exec(lessonMistakeVerdictNoteBg(r) ?? "");
      expect(quoted, `no section name in the note for ${hits.length} hits`).not.toBeNull();
      const section = reasonSection(markupOf(r)) ?? "";
      expect(textOf(section).startsWith(quoted![1])).toBe(true);
    }
    // …and it is the PLURAL heading that gets cited when there are two.
    expect(lessonMistakeVerdictNoteBg(resultOf([], {
      passed: false,
      lessonMistakes: [SQUEEZE, PANIC],
    }))).toContain("„Грешките на този урок“");
  });

  it("names the points when the sheet was not clean but was inside the allowance", () => {
    // A bare „3 точки" reads as КОНТРОЛНИ точки — the licence — which is the
    // misreading `pointScales` exists to stop. Same clause as «Незавършен» uses.
    const withPoints = resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)], {
      passed: false,
      lessonMistakes: [SQUEEZE],
    });
    const n = lessonMistakeVerdictNoteBg(withPoints) ?? "";
    expect(n).toContain("3 наказателни точки — в допустимото по изпитния лист");
    expect(n).not.toContain("остана чист");
  });

  it("two hits: the sentence is plural all the way through", () => {
    const two = resultOf([], { passed: false, lessonMistakes: [SQUEEZE, PANIC] });
    const n = lessonMistakeVerdictNoteBg(two) ?? "";
    expect(n).toContain("„Тясно изпреварване на велосипедист“ и „Рязко спиране без причина“");
    expect(n).toContain("са грешките, които този урок учи");
    expect(n).toContain("щом някоя от тях се случи");
    expect(n).toContain("когато мине без тях");
    // …and not one clause left in the singular.
    expect(n).not.toContain("е грешката, която");
    expect(n).not.toContain("без нея");
  });

  it("three hits — THE MEASURED MAXIMUM on the committed tapes — reads as prose", () => {
    // MEASURED by driving all 2,434 tapes × rungs on this tree: 619 hit drives
    // carry one hit, 31 carry two, 4 carry three, and none carries four. So
    // this is the widest state a student can actually reach, and the case below
    // it (four) is headroom rather than an observed drive.
    const three = resultOf([], { passed: false, lessonMistakes: [SQUEEZE, PANIC, NO_SIGNAL] });
    const n = lessonMistakeVerdictNoteBg(three) ?? "";
    expect(n).toContain(
      "„Тясно изпреварване на велосипедист“, „Рязко спиране без причина“ и още 1",
    );
    expect(n).toContain("са грешките, които този урок учи");
    // …and all three are explained in full one section down, so «и още 1»
    // hides nothing.
    expect(lessonMistakeReasonsBg(three).map((r) => r.code)).toEqual([
      "VULNERABLE_PASS_TOO_CLOSE",
      "HARSH_BRAKING_NO_CAUSE",
      "TURN_WITHOUT_INDICATOR",
    ]);
  });

  it("four hits: the phrase shortens, and the full list is one surface away", () => {
    // `lessonMistakeNamesBg` stops at two names on purpose — this sentence is
    // already at the phone's budget with one act in it. The reason block below
    // prints all four with their explanations, which is what the note points at
    // («веднага отдолу»), so nothing is hidden.
    const four = resultOf([], {
      passed: false,
      lessonMistakes: [SQUEEZE, PANIC, NO_SIGNAL, CENTRE_LINE],
    });
    const n = lessonMistakeVerdictNoteBg(four) ?? "";
    expect(n).toContain("и още 2");
    expect(n).toContain("са грешките, които този урок учи");
    expect(n).toContain("по-долу, в „Грешките на този урок“");
    expect(lessonMistakeReasonsBg(four)).toHaveLength(4);
  });

  it("THE OTHER DIRECTION: the other three verdicts get no such sentence", () => {
    expect(lessonMistakeVerdictNoteBg(CLEAN_AND_PASSED)).toBeNull();
    expect(lessonMistakeVerdictNoteBg(COLLIDED)).toBeNull();
    expect(lessonMistakeVerdictNoteBg(CLEAN_AND_UNFINISHED)).toBeNull();
    expect(lessonMistakeVerdictNoteBg(ABORTED_WITH_HIT)).toBeNull();
    // …and the two notes are mutually exclusive, so no drive gets both.
    for (const r of [CLEAN_ROUTE_REFUSED, ABORTED_WITH_HIT, CLEAN_AND_UNFINISHED, COLLIDED]) {
      const both =
        (lessonMistakeVerdictNoteBg(r) === null ? 0 : 1) +
        (unfinishedVerdictNoteBg(r) === null ? 0 : 1);
      expect(both).toBeLessThanOrEqual(1);
    }
  });
});

describe("the abort variant — the one state where both accounts are true", () => {
  it("FAILS ON THE OLD SCREEN: an aborted run with a hit is not told to just finish", () => {
    const note = unfinishedVerdictNoteBg(ABORTED_WITH_HIT) ?? "";
    expect(note).toBe(
      "Изпитният лист остана чист, затова тук не пише „Неиздържан“; " +
        "прекъсна урока преди края, затова няма и оценка. " +
        "Но и изкаран докрай, урокът нямаше да се зачете: " +
        "„Тясно изпреварване на велосипедист“ е грешката, която той учи. " +
        "Карай го отново — до края и без нея.",
    );
    // The shipped tail asked for the ONE thing that would not have been enough.
    expect(note).not.toContain("стигни до края, за да получиш оценка");
    expect(textOf(markupOf(ABORTED_WITH_HIT))).toContain(note);
  });

  it("THE OTHER DIRECTION: without a hit the «Незавършен» note is byte-identical", () => {
    // Both arms of it — the aborted run and the unfinished route — and the
    // coached-mistakes branch inside it, which ADR-009 does not touch.
    expect(unfinishedVerdictNoteBg(CLEAN_AND_ABORTED)).toBe(
      "Изпитният лист остана чист, затова тук не пише „Неиздържан“: " +
        "няма нарушение в изпитния лист, което да го отсъди. " +
        "Не пише и „Издържан“ — зачита се само урок, изкаран докрай. " +
        "Карай го отново и стигни до края, за да получиш оценка.",
    );
    expect(unfinishedVerdictNoteBg(CLEAN_AND_UNFINISHED)).toBe(
      unfinishedVerdictNoteBg(CLEAN_AND_ABORTED),
    );
  });
});

// ---------------------------------------------------------------------------
// 3 · THE REASON BLOCK
// ---------------------------------------------------------------------------

describe("«Грешката на този урок» — the block that makes the refusal readable", () => {
  it("FAILS ON THE OLD SCREEN: the catalogue explanation, corrective and law chip", () => {
    const section = reasonSection(markupOf(CLEAN_ROUTE_REFUSED));
    expect(section).not.toBeNull();
    const text = textOf(section ?? "");
    const copy = lessonMistakeCopy(SQUEEZE);
    if (copy === null) throw new Error("fixture is uncatalogued");
    // Every one of these is RETRIEVED (ADR-002) — the assertion compares the
    // screen against the rule catalogue, not against a string in this file.
    expect(text).toContain(`✗ ${copy.titleBg}`);
    expect(text).toContain(copy.explanationBg);
    expect(text).toContain(`✔ Правилното действие: ${copy.correctiveBg}`);
    expect(text).toContain(`правило: ${copy.lawRef}`);
    // …and the moment it happened, so he can find it in the reel.
    expect(text).toContain("· 0:20");
  });

  it("the heading pluralises while the landmark label does not", () => {
    const one = reasonSection(markupOf(CLEAN_ROUTE_REFUSED)) ?? "";
    const two =
      reasonSection(markupOf(resultOf([], { passed: false, lessonMistakes: [SQUEEZE, PANIC] }))) ??
      "";
    expect(textOf(one)).toContain("Грешката на този урок");
    expect(textOf(two)).toContain("Грешките на този урок");
    // A screen reader's landmark list must not change shape with the count.
    expect(one).toContain('aria-label="Грешката на този урок"');
    expect(two).toContain('aria-label="Грешката на този урок"');
  });

  it("FAILS ON THE OLD SCREEN: the first occurrence says it cost no points", () => {
    const text = textOf(reasonSection(markupOf(CLEAN_ROUTE_REFUSED)) ?? "");
    expect(text).toContain(
      "При първа поява тази грешка не влиза в наказателните точки. " +
        "Но урокът съществува, за да научи точно нея — затова не се зачита, " +
        "докато не го изкараш без нея.",
    );
    // «наказателните», never a bare „точките": to a Bulgarian reader an
    // unqualified „точки" is КОНТРОЛНИ точки, the licence budget.
    expect(text).not.toMatch(/не влиза в точките/);
  });

  it("FAILS ON THE OLD SCREEN: a repeat says where the points went instead", () => {
    const text = textOf(reasonSection(markupOf(REPEAT_CHARGED)) ?? "");
    expect(text).toContain(
      "Първия път не влезе в наказателните точки; повторението ѝ влезе в " +
        "изпитния лист — виж „Грешки“ по-долу. Урокът не се зачита, защото това е " +
        "грешката, която той учи.",
    );
    // The first-occurrence sentence would be FALSE here — it claims the act
    // took no points, and on this drive one occurrence of it did.
    expect(text).not.toContain("При първа поява тази грешка не влиза");
    // …and «виж „Грешки“ по-долу» must point at a section that is ON THE PAGE.
    // That list is guarded by `summary.mistakes.length > 0`, so a stake sentence
    // citing it on a drive with an empty ledger would send the student to a
    // heading that does not exist — the shape this lane exists to remove.
    const markup = markupOf(REPEAT_CHARGED);
    expect(markup).toContain('<section aria-label="Грешки"');
    expect(REPEAT_CHARGED.summary.mistakes.length).toBeGreaterThan(0);
    // The charged stake is only ever composed for a hit that reached the sheet,
    // and `foldLessonMistakes` sets `charged` from a ledger event — so the two
    // cannot come apart. Asserted as the invariant, over every fixture here.
    for (const r of [CLEAN_ROUTE_REFUSED, REPEAT_CHARGED, FAILED_SHEET_WITH_HIT, ABORTED_WITH_HIT]) {
      const citesTheList = lessonMistakeReasonsBg(r).some((e) =>
        e.stakeBg.includes("виж „Грешки“ по-долу"),
      );
      if (citesTheList) expect(r.summary.mistakes.length).toBeGreaterThan(0);
    }
  });

  it("names the demonstration when exactly one demo of the lesson teaches the act", () => {
    // `foldLessonMistakes` stamps `demoTitleBg` only when the code is cited by
    // ONE authored demo (graft 19) — so both branches of this really render.
    const named = resultOf([], {
      passed: false,
      lessonMistakes: [hitOf("HARSH_BRAKING_NO_CAUSE", 41, { demoTitleBg: "Паническо спиране" })],
    });
    expect(textOf(reasonSection(markupOf(named)) ?? "")).toContain(
      "Това е грешката от демонстрацията „Паническо спиране“.",
    );
    // …and stays silent when two demos cite it, rather than guessing one.
    expect(textOf(reasonSection(markupOf(CLEAN_ROUTE_REFUSED)) ?? "")).not.toContain(
      "от демонстрацията",
    );
    expect(lessonMistakeReasonsBg(CLEAN_ROUTE_REFUSED)[0].demoLineBg).toBeNull();
  });

  it("FAILS ON THE OLD SCREEN: it renders on a failed sheet and on an abort too", () => {
    // A target's first occurrence is ALWAYS coached, so no FaultCard below ever
    // explains it. On these two drives the lesson rule would otherwise be the
    // only thing on the screen with no account anywhere.
    expect(reasonSection(markupOf(FAILED_SHEET_WITH_HIT))).not.toBeNull();
    expect(reasonSection(markupOf(ABORTED_WITH_HIT))).not.toBeNull();
    expect(textOf(reasonSection(markupOf(ABORTED_WITH_HIT)) ?? "")).toContain(
      "Тясно изпреварване на велосипедист",
    );
  });

  it("THE OTHER DIRECTION: no hits, or a pass, renders nothing at all", () => {
    for (const r of [CLEAN_AND_PASSED, CLEAN_AND_UNFINISHED, COLLIDED, CLEAN_AND_ABORTED]) {
      expect(lessonMistakeReasonsBg(r)).toEqual([]);
      expect(reasonSection(markupOf(r))).toBeNull();
    }
    // …and the guard against a pass carrying a hit, which lane C's fold makes
    // impossible — asserted so a later change to `passed` cannot make the
    // reason block appear under «Издържан».
    expect(
      lessonMistakeReasonsBg(resultOf([], { passed: true, lessonMistakes: [SQUEEZE] })),
    ).toEqual([]);
  });

  it("an uncatalogued code drops its row, and an empty list renders no heading", () => {
    // A stored drive can name a code this catalogue no longer carries. A blank
    // bullet under a heading promising an explanation is the bare verdict
    // THEO-4 forbids — worse than the row being absent.
    const ghost: LessonMistakeHit = {
      code: "NO_SUCH_CODE_EVER",
      t: 12,
      charged: false,
      titleBg: "нещо от миналото",
    };
    expect(lessonMistakeReasonsBg(resultOf([], { passed: false, lessonMistakes: [ghost] }))).toEqual(
      [],
    );
    expect(
      reasonSection(markupOf(resultOf([], { passed: false, lessonMistakes: [ghost] }))),
    ).toBeNull();
    // …and a mixed list keeps the row it can explain.
    const mixed = resultOf([], { passed: false, lessonMistakes: [ghost, SQUEEZE] });
    expect(lessonMistakeReasonsBg(mixed).map((r) => r.code)).toEqual([
      "VULNERABLE_PASS_TOO_CLOSE",
    ]);
  });

  /**
   * …AND THE NOTE ABOVE MUST NOT GO ON POINTING AT WHAT THE DROP TOOK AWAY.
   *
   * The two cases the drop creates, and the note was wrong in both: it
   * pluralised and pointed on `hits.length` while the heading — and the
   * section's existence — run on the rows that survive `lessonMistakeCopy`.
   * Latent (a target must be in the catalogue to compile) and live for a drive
   * stored across a catalogue change, which is the case the drop is FOR.
   */
  it("the note's pointer follows the rows the block will really render", () => {
    const ghost: LessonMistakeHit = {
      code: "NO_SUCH_CODE_EVER",
      t: 12,
      charged: false,
      titleBg: "нещо от миналото",
    };
    // (a) Ghost only: no section is rendered, so the note promises no section —
    // and still names the act, the ruling and the way out.
    const ghostOnly = resultOf([], { passed: false, lessonMistakes: [ghost] });
    expect(reasonSection(markupOf(ghostOnly))).toBeNull();
    const ghostNote = lessonMistakeVerdictNoteBg(ghostOnly) ?? "";
    expect(ghostNote).not.toContain("по-долу, в");
    expect(ghostNote).toContain("нещо от миналото");
    expect(ghostNote).toContain("урокът не се зачита, дори първия път.");
    expect(ghostNote).toContain("Карай урока отново");
    // (b) Ghost + a live code: ONE row renders, so the note cites the SINGULAR
    // heading — the one the `<h3>` above the block actually prints.
    const mixed = resultOf([], { passed: false, lessonMistakes: [ghost, SQUEEZE] });
    const mixedNote = lessonMistakeVerdictNoteBg(mixed) ?? "";
    const quoted = /по-долу, в „([^“”]+)“/.exec(mixedNote);
    expect(quoted, "the mixed note points at no section").not.toBeNull();
    expect(textOf(reasonSection(markupOf(mixed)) ?? "").startsWith(quoted![1])).toBe(true);
    // The names clause still speaks of BOTH acts: the ghost happened, and only
    // its explanation is missing.
    expect(mixedNote).toContain("са грешките, които");
  });

  it("nothing on the block is a raw code — it reads as prose, at 2 and at 4 hits", () => {
    // The founder's standing complaint about this product's judgements is a
    // verdict with a code in it. Every entry is a title, an explanation and an
    // action; the CODE only ever appears as a React key.
    for (const hits of [
      [SQUEEZE, PANIC],
      [SQUEEZE, PANIC, NO_SIGNAL, CENTRE_LINE],
    ]) {
      const text = textOf(reasonSection(markupOf(resultOf([], { passed: false, lessonMistakes: hits }))) ?? "");
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      for (const hit of hits) {
        const copy = lessonMistakeCopy(hit);
        if (copy === null) throw new Error("fixture is uncatalogued");
        expect(text).toContain(copy.explanationBg);
        expect(text).toContain(copy.correctiveBg);
      }
    }
  });

  it("A DRIVE THAT REALLY HAPPENS: sc-sig-green-wave/mistake-sprint at L3", () => {
    // Not a hand-built shape. MEASURED on this tree by driving every committed
    // tape × rung: this one drive carries TWO hits, both demo-named, one of
    // them charged (a genuine repeat), 2 наказателни точки inside the
    // allowance, and an unfinished route — so it exercises the plural note, the
    // two-entry block, both stake sentences, the demo line and the
    // unfinished-route ask at once. It is the widest single state a student
    // reaches, and it was «Незавършен» before this lane.
    const drive = resultOf([makeViolation("HARSH_BRAKING_NO_CAUSE", 74)], {
      passed: false,
      completedAll: false,
      lessonMistakes: [
        hitOf("SPEEDING_OVER_LIMIT", 31, { demoTitleBg: "Спринт към зеления" }),
        hitOf("HARSH_BRAKING_NO_CAUSE", 62, {
          charged: true,
          demoTitleBg: "Спиране на червено в последния момент",
        }),
      ],
    });
    expect(sessionVerdict(drive)).toBe("lessonMistake");
    // Points on the sheet AND inside the allowance — the engine's numbers, not
    // this file's. (The census drive reads 2 т.; the repeat here is billed on
    // HARSH_BRAKING_NO_CAUSE at 3, which changes nothing this case is about.)
    expect(drive.score).toBeGreaterThan(0);
    expect(drive.summary.passed).toBe(true);
    const text = textOf(reasonSection(markupOf(drive)) ?? "");
    expect(textOf(markupOf(drive))).toContain("Грешките на този урок");
    // Both demo lines.
    expect(text).toContain("Това е грешката от демонстрацията „Спринт към зеления“.");
    expect(text).toContain(
      "Това е грешката от демонстрацията „Спиране на червено в последния момент“.",
    );
    // …and the two DIFFERENT stakes, on one card, in hit order.
    expect(text).toContain("При първа поява тази грешка не влиза в наказателните точки.");
    expect(text).toContain("повторението ѝ влезе в изпитния лист");
    expect(text.indexOf("При първа поява")).toBeLessThan(text.indexOf("повторението ѝ влезе"));
    // The note names both acts and asks for the route as well.
    const n = lessonMistakeVerdictNoteBg(drive) ?? "";
    expect(n).toContain(`${drive.score} наказателни точки — в допустимото по изпитния лист`);
    expect(n).toContain("до края и без тях.");
  });

  it("the block renders the same on the phone layout as on the roomy one", () => {
    // `compact` changes the shell's chrome, never the reason; a student on a
    // 360 px screen must not get the refusal with the reason stripped out.
    const phone = textOf(reasonSection(markupOf(CLEAN_ROUTE_REFUSED, true)) ?? "");
    const roomy = textOf(reasonSection(markupOf(CLEAN_ROUTE_REFUSED, false)) ?? "");
    expect(phone).toBe(roomy);
    expect(phone).toContain("✔ Правилното действие:");
  });
});

// ---------------------------------------------------------------------------
// 4 · THE STAR FLOOR'S SENTENCE (doc 92 §5.7 — the cap itself is rubric.ts's)
// ---------------------------------------------------------------------------

describe("the star card explains the ADR-009 floor rather than borrowing another", () => {
  it("FAILS ON THE OLD SCREEN: the only floor names itself, and not „закона“", () => {
    // These drives are «в допустимото» on the изпитен лист — that is why the
    // verdict reads «Не е взет» and not «Неиздържан» — so «не може да надскочи
    // закона» would be explaining this floor by naming a different one.
    const reason = manoeuvreGradeReasonBg(CLEAN_ROUTE_REFUSED) ?? "";
    expect(reason).toBe(
      "Само една звезда, защото допусна „Тясно изпреварване на велосипедист“ — " +
        "грешката, която този урок учи. " +
        "Звездите не могат да кажат „взето“ за урок, който не е взет.",
    );
    expect(reason).not.toContain("не може да надскочи закона");
    expect(textOf(markupOf(CLEAN_ROUTE_REFUSED))).not.toContain("не може да надскочи закона");
  });

  it("with a law floor beside it, the clause joins the list and keeps the tail", () => {
    const both = resultOf([makeViolation("COLLISION", 22)], {
      passed: false,
      lessonMistakes: [SQUEEZE],
    });
    const reason = manoeuvreGradeReasonBg(both) ?? "";
    expect(reason).toContain("има сблъсък");
    expect(reason).toContain("допусна „Тясно изпреварване на велосипедист“");
    expect(reason).toContain("не може да надскочи закона");
  });

  it("THE OTHER DIRECTION: the four shipped floors are byte-identical", () => {
    expect(manoeuvreGradeReasonBg(COLLIDED)).toBe(
      "Само една звезда, защото има сблъсък, остана неизпълнена задача от маршрута. " +
        "Оценката на маневрата не може да надскочи закона: докато това е в сила, " +
        "тя стои на дъното, колкото и чисто да е било останалото каране.",
    );
    expect(manoeuvreGradeReasonBg(CLEAN_AND_UNFINISHED)).toBe(
      "Само една звезда, защото остана неизпълнена задача от маршрута. " +
        "Оценката на маневрата не може да надскочи закона: докато това е в сила, " +
        "тя стои на дъното, колкото и чисто да е било останалото каране.",
    );
    expect(manoeuvreGradeReasonBg(CLEAN_AND_PASSED)).toBeNull();
  });

  it("the claim still starts with the phrase the agreement loop reads", () => {
    // `session-end-numbers.test.tsx` drives the real `scoreRubric` and compares
    // „does this note claim a floor" with „is the drive actually floored". Both
    // arms of the ADR-009 branch must keep that prefix or that check goes blind
    // instead of red.
    for (const r of [
      CLEAN_ROUTE_REFUSED,
      resultOf([makeViolation("COLLISION", 22)], { passed: false, lessonMistakes: [SQUEEZE] }),
    ]) {
      expect(manoeuvreGradeReasonBg(r)?.startsWith("Само една звезда")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 · VOCABULARY — every added sentence, against the rules doc 92 §5.0 sets
// ---------------------------------------------------------------------------

describe("every sentence this lane added obeys the points vocabulary", () => {
  /** Each composed string the screen owns, over every fixture that shows it. */
  const composed: string[] = [
    lessonMistakeVerdictNoteBg(CLEAN_ROUTE_REFUSED) ?? "",
    lessonMistakeVerdictNoteBg(resultOf([], { passed: false, lessonMistakes: [SQUEEZE, PANIC] })) ??
      "",
    lessonMistakeVerdictNoteBg(
      resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)], {
        passed: false,
        lessonMistakes: [SQUEEZE],
      }),
    ) ?? "",
    unfinishedVerdictNoteBg(ABORTED_WITH_HIT) ?? "",
    manoeuvreGradeReasonBg(CLEAN_ROUTE_REFUSED) ?? "",
    ...lessonMistakeReasonsBg(CLEAN_ROUTE_REFUSED).map((r) => r.stakeBg),
    ...lessonMistakeReasonsBg(REPEAT_CHARGED).map((r) => r.stakeBg),
  ];

  it("no sentence is empty — the fixtures really do exercise all of them", () => {
    expect(composed).toHaveLength(7);
    for (const s of composed) expect(s.length).toBeGreaterThan(20);
  });

  it("every mention of points is QUALIFIED, never a bare „точки“", () => {
    // MEASURED DEFECT CLASS: to a Bulgarian reader an unqualified „точки" is
    // КОНТРОЛНИ точки — the 39-point licence budget — and the founder read
    // exactly that off a teach card. A regex with \b cannot be used here: JS
    // word boundaries are ASCII-only, so `\bточки\b` never matches Cyrillic at
    // all (doc 92's own spec shipped that mistake). So the check is positional:
    // every occurrence of „точк…" must be preceded by one of the qualifiers.
    const QUALIFIED = [
      "наказателни точки",
      "наказателните точки",
      "наказателна точка",
      "изпитни т.",
      "изпитна т.",
    ];
    for (const s of composed) {
      let from = 0;
      for (;;) {
        const at = s.indexOf("точк", from);
        if (at === -1) break;
        const window = s.slice(Math.max(0, at - 20), at + 20);
        expect(
          `${QUALIFIED.some((q) => window.includes(q))} :: ${window}`,
          `a bare „точк…" in: ${s}`,
        ).toBe(`true :: ${window}`);
        from = at + 4;
      }
    }
  });

  it("no sentence states law: no article number, no Наредба, no ЗДвП", () => {
    // ADR-002: the legal basis is RETRIEVED and cited by the catalogue's own
    // `lawRef` chip. A composed sentence naming a clause is an invented one.
    for (const s of composed) {
      expect(s).not.toMatch(/чл\.|ал\.|ЗДвП|Наредба|приложение/);
    }
  });

  it("no sentence is a bare verdict — each carries a reason or an action", () => {
    // THEO-4, as the one property that can be checked mechanically: the
    // sentence must contain a „because" or an instruction, not only a label.
    const REASON_OR_ACTION = [
      "защото",
      "затова",
      "щом",
      "за да",
      "Карай",
      "съществува, за да научи",
      "виж",
    ];
    for (const s of composed) {
      expect(`${REASON_OR_ACTION.some((w) => s.includes(w))} :: ${s.slice(0, 40)}`).toBe(
        `true :: ${s.slice(0, 40)}`,
      );
    }
  });
});
