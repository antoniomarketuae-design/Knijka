/**
 * THE SCREEN, NOT THE CARD — the ledger closure read where a student reads it.
 *
 * `FaultCard` learned Наредба № 38, чл. 48, ал. 3 on 2026-08-18: given
 * `examBilled={false}` it prints «без допълнителни изпитни точки» instead of
 * the catalogue base, and `fault-card-ledger-close.test.tsx` pins both
 * directions of that. IT PROVED IT BY RENDERING THE CARD ALONE, and the card
 * alone was never the defect. `SessionEndScreen.tsx` — the only surface in the
 * product that mounts this list — rendered
 *
 *     <FaultCard event={m} correctiveBg={…} atBg={…} billing={roadBilling[i]} />
 *
 * with no `examBilled` at all, and the prop defaults to `true` on purpose (an
 * unwired card must OVERSTATE a penalty, never hide one). So the fix landed in
 * a component nobody mounts directly and the screen went on printing the
 * catalogue base on every row, a dozen lines above a debrief saying the
 * opposite about the same fault. A test that renders the card alone re-earns
 * that green the same way it was earned the first time; this file therefore
 * renders THE SCREEN, and asks both halves of it the same question at once.
 *
 * MEASURED HERE, 2026-08-19, against the screen as it stood before this lane —
 * the sc-hz-accident-scene squeeze (a wrecked car struck at 13.13 s, a
 * bystander at 13.43 s; the drive `lessons/__tests__/debrief-collision-
 * truth.test.ts` is built from) rendered through `SessionEndScreen` with a REAL
 * `buildDebrief` beside it:
 *
 *   the score table          Опасни грешки … 1 · 10 · Общо (допустими 9) 2 10
 *   the fault rows           −10 изпитни т.  AND  −10 изпитни т.   ← Σ = 20
 *   the debrief, same screen «Удар в пешеходец — опасна, без допълнителни
 *                             точки — изпитът вече беше прекратен»
 *
 * Three surfaces, one drive, two different numbers. The ledger is the one that
 * is right: чл. 48, ал. 3 ends the practical sheet at the first terminating
 * опасна, so the second crash is taught and not charged (`rules/scoring.ts
 * ledgerBilling`).
 *
 * THE INVARIANT THIS FILE ENFORCES IS ONE LINE: THE EXAM MARKS PRINTED ON THE
 * FAULT ROWS SUM TO THE TOTAL THE SAME SCREEN SCORED. Not «the pedestrian row
 * is blank» — that is the one case, and a check shaped like the one case is how
 * a lane goes green without fixing anything. The sum is the property the screen
 * must have on every drive, closed ledger or not, and half the drives below are
 * ones where it has to come out FULL.
 *
 * BOTH DIRECTIONS, because a false refusal is the founder's own complaint. Two
 * missed zebras terminate nothing, so both of those rows must still cost 10
 * apiece: a screen that muted the mark whenever it felt unsure would hide
 * charges the ledger really made, and that is a fail quietly reshaped towards a
 * pass.
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for this whole suite (the `session-end-numbers.test.tsx` precedent).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDebrief, lessonById, type LessonResult } from "../../lessons";
import {
  buildSessionSummary,
  ledgerBilling,
  makeViolation,
  type ViolationEvent,
} from "../../rules";
import { SessionEndScreen } from "../SessionEndScreen";

const l0 = lessonById("l0-free-drive")!;

/** A real graded result: the summary is the ENGINE's, never hand-written. */
function resultOf(mistakes: ViolationEvent[]): LessonResult {
  const summary = buildSessionSummary(mistakes);
  return {
    lessonId: l0.id,
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 90,
  };
}

/**
 * The screen as the shell actually mounts it — with the REAL debrief beside the
 * list, because a screen rendered with `debriefText="разбор"` cannot contradict
 * itself and this entire defect is a screen contradicting itself.
 */
function screenMarkup(result: LessonResult): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Тестов урок"
      result={result}
      debriefText={buildDebrief(l0, result).text}
      concepts={[]}
      xpEarned={null}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
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
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One `<section aria-label="…">` of the screen, as text.
 *
 * IT THROWS RATHER THAN RETURNING "", and that is the whole point of it. Every
 * „0 defects" report in this project was an instrument that missed quietly, and
 * a probe that hands back an empty string turns „the mark is not on that row"
 * into a pass — the exact failure this file exists to catch. No fault section
 * contains a nested <section>, so the first closing tag is this one's own.
 */
function sectionText(markup: string, ariaLabel: string): string {
  const open = markup.indexOf(`<section aria-label="${ariaLabel}"`);
  if (open < 0) throw new Error(`no <section aria-label="${ariaLabel}"> on the screen`);
  const close = markup.indexOf("</section>", open);
  if (close < 0) throw new Error(`unterminated <section aria-label="${ariaLabel}">`);
  const text = textOf(markup.slice(open, close));
  if (text === "") throw new Error(`<section aria-label="${ariaLabel}"> rendered empty`);
  return text;
}

/**
 * The Грешки section split into one string per fault, sliced at each row's OWN
 * `titleBg` scanning forward — so a drive carrying the same code twice does not
 * collapse its two rows onto one. Throws if a fault the summary holds is not on
 * the screen at all (same reason as `sectionText`: an instrument that misses
 * has to say so out loud).
 */
function faultRows(markup: string, mistakes: readonly ViolationEvent[]): string[] {
  const section = sectionText(markup, "Грешки");
  const starts: number[] = [];
  let cursor = 0;
  for (const m of mistakes) {
    const at = section.indexOf(m.titleBg, cursor);
    if (at < 0) throw new Error(`fault row missing from the screen: ${m.titleBg}`);
    starts.push(at);
    cursor = at + m.titleBg.length;
  }
  return starts.map((s, i) => section.slice(s, starts[i + 1] ?? section.length));
}

/**
 * Every exam deduction printed anywhere on the screen, in reading order.
 * `minusPointsBg("exam", …)` has exactly one call site under this screen
 * (`FaultCard.tsx:552`) — the score table writes a tariff („по 10 изпитни т.")
 * and bare tallies, never a minus — so these ARE the fault rows' marks.
 */
function examMarks(markup: string): number[] {
  return [...textOf(markup).matchAll(/−(\d+) изпитн[а-я]* т\./g)].map((m) => Number(m[1]));
}

const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// The drives
// ---------------------------------------------------------------------------

/** The measured squeeze: a wrecked car at 13.13, the bystander at 13.43. */
const CAR_THEN_PERSON: ViolationEvent[] = [
  makeViolation("COLLISION", 13.13, { detail: "vehicle" }),
  makeViolation("COLLISION", 13.43, { detail: "pedestrian" }),
];

/**
 * THE CLOSER IN THE MIDDLE — an основна at 4 s, the crash at 10 s, a second
 * основна at 20 s. `ledgerBilling` returns [true, true, false] here, so the
 * screen must print two marks and one closure note, and the sum lands on 13
 * rather than on 16.
 *
 * IT IS HERE FOR THE INDEX. The two-row drive above is satisfied by anything
 * that blanks „the last row" or „every row but the first"; a wiring that hands
 * `examBilled` the wrong element of the array, or that leans on row order
 * instead of on the ledger, survives that one and dies on this one.
 */
const OSNOVNA_CRASH_OSNOVNA: ViolationEvent[] = [
  makeViolation("TURN_WITHOUT_INDICATOR", 4),
  makeViolation("COLLISION", 10, { detail: "vehicle" }),
  makeViolation("LANE_CHANGE_WITHOUT_INDICATOR", 20),
];

/**
 * THE CONTROL DRIVE: two опасни that terminate NOTHING — two zebras walked
 * through with a pedestrian on them. `PEDESTRIAN_NOT_YIELDED` carries no
 * `terminateSession`, so the ledger never closes and BOTH rows are charged.
 */
const TWO_MISSED_ZEBRAS: ViolationEvent[] = [
  makeViolation("PEDESTRIAN_NOT_YIELDED", 4),
  makeViolation("PEDESTRIAN_NOT_YIELDED", 38),
];

describe("the result SCREEN prices its fault rows off the ledger", () => {
  it("Σ of the marks on the rows is the total the same screen scored — it was 20 over a 10", () => {
    const result = resultOf(CAR_THEN_PERSON);
    const markup = screenMarkup(result);
    const marks = examMarks(markup);
    // The closed sheet charges the crash that closed it, once.
    expect(result.summary.score.totalPoints).toBe(10);
    // One mark on the screen, not two — and the COUNT is asserted beside the
    // sum, so an extractor that matched nothing could never pass by landing on
    // 0 against a drive that happens to score 0.
    expect(marks).toEqual([10]);
    expect(sum(marks)).toBe(result.summary.score.totalPoints);
  });

  it("both halves of the ONE screen say it, and say the same thing", () => {
    const result = resultOf(CAR_THEN_PERSON);
    const markup = screenMarkup(result);
    const screen = textOf(markup);
    const [car, person] = faultRows(markup, result.summary.mistakes);
    // The charged row is untouched: the crash that ended the exam costs 10.
    expect(car).toContain("−10 изпитни т.");
    // The covered row carries no exam figure — not the base, and not a „0"
    // either, which beside «Удар в пешеходец» would read „this did not matter".
    expect(person).not.toMatch(/−\d+ изпитн/);
    expect(person).not.toMatch(/\b0 изпитни т\./);
    expect(person).toContain("без допълнителни изпитни точки");
    expect(person).toContain("Наредба № 38, чл. 48, ал. 3");
    // …and the DEBRIEF, a dozen lines below on this same rendered screen, is
    // the surface that used to disagree with it. The pin is the clause the two
    // share verbatim, so editing either wording alone fails this file.
    const SHARED = "изпитът вече беше прекратен";
    expect(buildDebrief(l0, result).text).toContain(`без допълнителни точки — ${SHARED}`);
    expect(screen.toLowerCase()).toContain(SHARED);
    // One screen, one number: the debrief's charge agrees with the rows' Σ, and
    // the doubled figure the frames photographed is nowhere on it.
    expect(screen).toContain("10 наказателни т. по изпитния лист");
    expect(screen).not.toMatch(/20 наказателни т/);
  });

  it("the closure is read per ROW, not per position — основна, crash, основна", () => {
    const result = resultOf(OSNOVNA_CRASH_OSNOVNA);
    const markup = screenMarkup(result);
    const billed = ledgerBilling(result.summary.mistakes);
    expect(billed).toEqual([true, true, false]);
    expect(result.summary.score.totalPoints).toBe(13);
    // 3 + 10, in reading order — the ARRAY and not the sum, so a screen that
    // reached the right total by charging the wrong rows still fails.
    expect(examMarks(markup)).toEqual([3, 10]);
    const [signal, crash, laneChange] = faultRows(markup, result.summary.mistakes);
    expect(signal).toContain("−3 изпитни т.");
    expect(signal).not.toContain("без допълнителни");
    expect(crash).toContain("−10 изпитни т.");
    expect(crash).not.toContain("без допълнителни");
    expect(laneChange).toContain("без допълнителни изпитни точки");
    expect(laneChange).not.toMatch(/−\d+ изпитн/);
  });

  it("THE OTHER DIRECTION: with no closure every row keeps its mark", () => {
    // Nothing terminates here, so blanking either row would hide a charge the
    // ledger really made — the founder's own complaint pointing the other way.
    // This case doubles as the extractor's self-check: a regex that matched
    // nothing would return [] and fail against [10, 10].
    const result = resultOf(TWO_MISSED_ZEBRAS);
    const markup = screenMarkup(result);
    expect(result.summary.score.totalPoints).toBe(20);
    expect(examMarks(markup)).toEqual([10, 10]);
    for (const row of faultRows(markup, result.summary.mistakes)) {
      expect(row).toContain("−10 изпитни т.");
      expect(row).not.toContain("без допълнителни");
      expect(row).not.toContain("Изпитът вече беше прекратен");
    }
  });

  it("THE OTHER DIRECTION: a clean drive prints no mark and no closure note", () => {
    // The drive where a suppression bug would be invisible, asserted so that
    // „no marks" here is known to mean „no faults" and not „the instrument
    // stopped looking".
    const result = resultOf([]);
    const markup = screenMarkup(result);
    expect(examMarks(markup)).toEqual([]);
    expect(markup).not.toContain('<section aria-label="Грешки"');
    expect(textOf(markup)).not.toContain("без допълнителни изпитни точки");
  });
});
