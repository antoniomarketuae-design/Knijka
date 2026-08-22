/**
 * TWO THINGS THE DEBRIEF SAID ABOUT A DRIVE IT COULD NOT SUPPORT — both measured
 * on `.audit-frames/wave-c/frames/sc-mw-min-speed__pc-right/`, the drive the
 * audit filed as „THE TALLY DROPS FAULTS THE DRIVE BOOKED"
 * (finding sc-mw-min-speed:ed5a5b84) — plus, at the bottom, the commendation
 * rider that answers `sc-signal-flashing:fe1889f5` and that nothing pinned.
 *
 * WHAT THE FRAMES ACTUALLY SHOW, in order:
 *   04-t087s  «ОПАСНА ГРЕШКА −10 изпитни т. · Удар в друго превозно средство»
 *   04-t103s  «ВТОРОСТЕПЕННА −1 изпитна т. · Твърде бавно движение по автомагистрала»
 *   04-t178s  «ОСНОВНА ГРЕШКА −3 изпитни т. · Смяна на лента без проверка в огледалото»
 *   04-t183s  «ОПАСНА ГРЕШКА −10 изпитни т. · Движение по аварийната лента»
 *   04-t189s  the same card again
 *   08-debrief «Урокът беше прекъснат преди края.» · Опасни 1 / 10 · Основни 0 / 0
 *              · Второстепенни 0 / 0 · Общо (допустими 9) 1 / 10
 *
 * The collision is at t = 87, so the four cards that follow it are AFTER the
 * ledger closed (Наредба № 38, чл. 48, ал. 3) and the 1 / 10 table is arithmetic
 * rather than a bug. Nothing on that screen says so. The student was shown four
 * cards adding to 24 изпитни т. and then a total of 10, and this file is the one
 * surface that can reconcile them — so a debrief that leaves the gap unexplained
 * IS the defect, whatever the scorer did (THEO-4: explain every decision).
 *
 * 1. THE ABORT BRANCH THREW THE CRITERIA AWAY. `criteriaBroken` is built at the
 *    top of `buildDebrief` and the aborted branch never printed it — so the
 *    debrief for a drive that CRASHED opened «Нищо страшно». The file's own
 *    comment above `criteriaBroken` says why it was hoisted out of the last
 *    branch („a drive can break the sheet and the route at once"); the hoist
 *    reached the unfinished branch and not this one.
 *
 * 2. THE CLOSURE LINE STATED A RULE THAT IS NOT THE LAW. It read «Само първата
 *    опасна грешка влиза в точките: изпитът се прекратява при нея». Наредба № 38,
 *    чл. 48, ал. 3 ends the exam at a ПТП and at повторна намеса на комисията —
 *    NOT at any опасна: `rules/scoring.ts`' own header records that the product
 *    once told students otherwise and that it was wrong, and
 *    `debrief-collision-truth.test.ts` drives the counterexample (two missed
 *    zebras, both charged). On a drive with dangerous errors BEFORE the crash
 *    that sentence contradicts the rows printed two lines above it.
 *
 * EVERY CASE IS A PAIR — the discipline of `debrief-truthfulness.test.ts`: a
 * check that only asserts the new sentence would also pass a build printing it
 * unconditionally, so each is matched by a drive that must NOT get it.
 */

import { describe, expect, it } from "vitest";
import { makeCommendation, makeViolation, type ScorableEvent } from "../../rules";
import { buildDebrief } from "../debrief";
import {
  abortSession,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";

const l0 = lessonById("l0-free-drive")!;

/** Fold the given events through a real session, then abort or finish it. */
function drive(events: ScorableEvent[], opts: { aborted?: boolean } = {}): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  s = opts.aborted ? abortSession(s, 210) : finishSession(s, 210);
  return buildLessonResult(s);
}

/** The measured sc-mw-min-speed · pc · right drive, card for card. */
const MW_MIN_SPEED: ScorableEvent[] = [
  makeViolation("COLLISION", 87, { detail: "vehicle" }),
  makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 103),
  makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", 178),
  makeViolation("EMERGENCY_LANE_DRIVING", 183),
  makeViolation("EMERGENCY_LANE_DRIVING", 189),
];

describe("the aborted verdict names the criteria the sheet already broke (sc-mw-min-speed · pc · right)", () => {
  it("does not open with «Нищо страшно» on a drive that crashed", () => {
    const r = drive(MW_MIN_SPEED, { aborted: true });
    // The frame's own figures, so the fixture is anchored rather than assumed.
    expect(r.aborted).toBe(true);
    expect(r.score).toBe(10);
    expect(r.summary.score.opasniCount).toBe(1);
    expect(r.summary.score.unscoredAfterClose).toBe(4);

    const text = buildDebrief(l0, r).text;
    expect(text).toContain("Прекъсна урока");
    // The sentence that shipped, on this drive: a crash met with reassurance.
    expect(text).not.toContain("Нищо страшно");
    // The criteria, by name — the dangerous act and the point rule.
    expect(text).toContain("допусната е опасна грешка: «Удар в друго превозно средство»");
    expect(text).toContain("10 наказателни точки от изпитния лист (допустими 9)");
    // …and why finishing the route would not have rescued it.
    expect(text).toContain("приложение № 5, т. 11");
    // Two criteria here, so the sentence agrees with two.
    expect(text).toContain("Всеки от тези критерии");
  });

  /**
   * ONE BROKEN CRITERION IS THE COMMON CASE, and «всеки от тези критерии» about
   * a single one is the „Обратен завой в 1 движения" defect wearing a different
   * hat — concatenation without agreement, in the sentence that carries the
   * verdict.
   */
  it("agrees with the number of criteria it just listed", () => {
    // Four основни: 12 points, over the 9 allowance, no опасна — exactly one
    // criterion broken (осн. 12 > 6 makes two; three of them keeps it at one).
    const r = drive(
      [
        makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", 20),
        makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", 40),
      ],
      { aborted: true },
    );
    expect(r.summary.score.hasDangerous).toBe(false);
    expect(r.summary.score.totalPoints).toBe(6);
    // 6 ≤ 9 and 6 ≤ 6 — nothing broken, so this drive takes the gentle branch.
    const gentle = buildDebrief(l0, r).text;
    expect(gentle).toContain("Нищо страшно");

    const overOnly = drive(
      [
        makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", 20),
        makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", 40),
        makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 60),
        makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 70),
        makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 80),
        makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 90),
      ],
      { aborted: true },
    );
    expect(overOnly.summary.score.totalPoints).toBe(10);
    expect(overOnly.summary.score.osnovniPoints).toBe(6);
    const text = buildDebrief(l0, overOnly).text;
    expect(text).toContain("10 наказателни точки от изпитния лист (допустими 9)");
    expect(text).toContain("Този критерий сам по себе си");
    expect(text).not.toContain("Всеки от тези критерии");
  });

  it("THE OTHER DIRECTION: an aborted CLEAN drive is still met gently", () => {
    const r = drive([], { aborted: true });
    expect(r.summary.mistakes).toHaveLength(0);
    const text = buildDebrief(l0, r).text;
    expect(text).toContain("Прекъсна урока");
    expect(text).toContain("Нищо страшно");
    expect(text).not.toContain("приложение № 5, т. 11");
  });
});

describe("the closure line states чл. 48, ал. 3 and not a rule of its own", () => {
  /**
   * TWO EMERGENCY-LANE опасни BEFORE the crash. Both are charged —
   * EMERGENCY_LANE_DRIVING carries no `terminateSession` — so the sheet reads
   * three опасни for 30, and the old sentence «Само първата опасна грешка влиза
   * в точките» sat directly under rows saying otherwise.
   */
  const THREE_DANGEROUS_ONE_CRASH: ScorableEvent[] = [
    makeViolation("EMERGENCY_LANE_DRIVING", 20),
    makeViolation("EMERGENCY_LANE_DRIVING", 40),
    makeViolation("COLLISION", 87, { detail: "vehicle" }),
    makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", 103),
  ];

  it("never claims only the first dangerous error is charged when three were", () => {
    const r = drive(THREE_DANGEROUS_ONE_CRASH);
    expect(r.summary.score.opasniCount).toBe(3);
    expect(r.summary.score.opasniPoints).toBe(30);
    expect(r.summary.score.unscoredAfterClose).toBe(1);

    const text = buildDebrief(l0, r).text;
    // The exact sentence that shipped, and it is false of this drive.
    expect(text).not.toContain("Само първата опасна грешка влиза в точките");
    // What the article actually says, and the act it actually applied to.
    expect(text).toContain("Изпитът е прекратен при «Удар в друго превозно средство»");
    expect(text).toContain("чл. 48, ал. 3");
    expect(text).toContain("не при всяка опасна грешка");
  });

  it("prints the points the closure withheld, so the table reads as a floor", () => {
    const r = drive(MW_MIN_SPEED);
    // 1 + 3 + 10 + 10 = 24 изпитни т. shown on cards and charged to nobody.
    expect(r.score).toBe(10);
    const text = buildDebrief(l0, r).text;
    expect(text).toContain("24 наказателни т.");
    expect(text).toContain("ДОЛНА ГРАНИЦА");
  });

  /**
   * VERIFIER'S ADDITION — the Σ has to be REACHABLE, not merely true.
   *
   * The test above pins «24 наказателни т.» and «ДОЛНА ГРАНИЦА», and both were
   * printed over four rows that each read «без допълнителни точки» and named no
   * figure at all: 10 + nothing + nothing + nothing, under a total of 24. That
   * is the same shape as the defect the block exists to close — a number a
   * seventeen-year-old cannot get to from what he was shown — one level down.
   * So each closed-over row now prints what it WOULD have cost, and this test
   * adds them up out of the rendered text rather than trusting the code that
   * wrote it.
   */
  it("…and the rows the closure covered each name their own price, so the Σ can be reached", () => {
    const text = buildDebrief(l0, drive(MW_MIN_SPEED)).text;
    const priced = [...text.matchAll(/иначе щеше да струва ([0-9]+(?:[.][0-9]+)?) наказателн/g)].map((m) =>
      Number(m[1]),
    );
    // Аварийна лента ×2 = 20, смяна на лента = 3, твърде бавно = 1.
    expect(priced.sort((a, b) => a - b)).toEqual([1, 3, 20]);
    expect(priced.reduce((a, b) => a + b, 0)).toBe(24);
    // …which is exactly the figure the floor sentence states.
    expect(text).toContain("щеше да струва още 24 наказателни т.");
    // And the clause two other surfaces are pinned to verbatim is untouched.
    expect(text).toContain("без допълнителни точки — изпитът вече беше прекратен");
  });

  it("THE OTHER DIRECTION: a charged row never says what it 'would have' cost", () => {
    // Two опасни, nothing terminating — every row is billed, so no row may
    // carry the counterfactual price; that clause belongs to closed rows only.
    const text = buildDebrief(
      l0,
      drive([
        makeViolation("EMERGENCY_LANE_DRIVING", 20),
        makeViolation("EMERGENCY_LANE_DRIVING", 40),
      ]),
    ).text;
    expect(text).not.toContain("иначе щеше да струва");
  });

  it("THE OTHER DIRECTION: a drive with no closure gets neither sentence", () => {
    const r = drive([
      makeViolation("EMERGENCY_LANE_DRIVING", 20),
      makeViolation("EMERGENCY_LANE_DRIVING", 40),
    ]);
    expect(r.summary.score.unscoredAfterClose).toBe(0);
    const text = buildDebrief(l0, r).text;
    expect(text).not.toContain("Изпитът е прекратен при");
    expect(text).not.toContain("ДОЛНА ГРАНИЦА");
    // …and the two dangerous rows are still summed, not closed over.
    expect(text).toContain("20 наказателни т.");
  });
});

/**
 * THE RIDER THAT WAS SHIPPED AND NEVER PINNED — finding
 * `sc-signal-flashing:fe1889f5`, «The same drive is convicted of failing to give
 * way AND commended for giving way correctly», mobile-right: «✗ Непропускане на
 * пътно превозно средство с предимство −10 изпитни т.» and «★ ✓ Правилно
 * отстъпено предимство 1:23» side by side with nothing reconciling them.
 *
 * `debrief.ts` answers it with `COMMENDATION_CONTRADICTED_BG`, keyed on the
 * `conceptId` both catalogue rows share (`c-priority-concept`). Grepped across
 * `src/`, NOTHING asserted that string — and round 1 of this programme already
 * lost a commendation to a fix that closed a rule act „forever". An unpinned
 * rider is the next lane's deletion, so it is pinned here, in the file that
 * owns it, in both directions.
 */
describe("a commendation the same drive convicted says so (sc-signal-flashing:fe1889f5)", () => {
  const RIDER = "но не всеки път: същото умение е и сред грешките в този урок";

  it("rides the praise when the SAME skill is also among the faults", () => {
    const r = drive([
      makeCommendation("YIELDED_TO_PRIORITY", 20),
      makeViolation("FAILED_TO_YIELD", 60),
    ]);
    const text = buildDebrief(l0, r).text;
    // The credit is NOT deleted — the good act happened and is owed.
    expect(text).toContain("Правилно отстъпено предимство");
    expect(text).toContain(RIDER);
  });

  it("THE OTHER DIRECTION: praise for a skill this drive never faulted stands alone", () => {
    const r = drive([
      makeCommendation("YIELDED_TO_PRIORITY", 20),
      // A fault on a completely different concept must not contaminate it.
      makeViolation("HANDBRAKE_LEFT_ON", 60),
    ]);
    const text = buildDebrief(l0, r).text;
    expect(text).toContain("Правилно отстъпено предимство");
    expect(text).not.toContain(RIDER);
  });

  /**
   * AND THE ONE COMMENDATION WITH NO CONCEPT STAYS CLEAN. CLEAN_DRIVING is
   * awarded for a measured violation-free STRETCH; a fault elsewhere in the
   * drive does not retract it, and keying the rider on „any fault at all" is
   * precisely how a blanket suppressor would pass the first case above.
   */
  it("never riders CLEAN_DRIVING, which is awarded for a stretch and not a skill", () => {
    const r = drive([
      makeCommendation("CLEAN_DRIVING", 20),
      makeViolation("FAILED_TO_YIELD", 60),
    ]);
    const text = buildDebrief(l0, r).text;
    expect(text).not.toContain(RIDER);
  });
});
