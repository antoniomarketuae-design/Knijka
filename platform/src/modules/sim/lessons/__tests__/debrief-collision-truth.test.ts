/**
 * THE FOUR FALSE SENTENCES, IN ASSERTIONS — sc-hz-accident-scene at L3, the
 * tight-and-fast squeeze, measured 2026-08-18.
 *
 * The drive: the student strikes ONE VEHICLE and ONE PEDESTRIAN, 0.3 s apart.
 * The official verdict is 10 (`rules/scoring.ts` closes the ledger at the first
 * terminating опасна, Наредба № 38 чл. 48, ал. 3). What the debrief printed:
 *
 *   • Удар в друго превозно средство ×2 — опасна, 20 наказателни т. … повторна
 *     грешка ×1.5
 *   • Тренировъчен резултат: 25 наказателни т.
 *
 * Four claims, each contradicting a paragraph two lines above it:
 *   1. he hit two VEHICLES — he hit one vehicle and one PERSON;
 *   2. 20 points — the verdict on the same screen says 10;
 *   3. a REPEATED mistake — two victims in one crash are not a repeat of
 *      anything, and the coach only thought so because it saw a second event
 *      with the same code;
 *   4. a 25-point training total that appears on no other surface.
 * And «пешеходец» appeared ZERO times in the whole text, on the one lesson
 * whose entire subject is that people are standing in the road.
 *
 * NOTHING PINNED ANY OF IT — the official `score` is 10 on both engines, so the
 * corruption lived entirely in the prose and no scoring test could see it.
 * THEO-4 says this product is a virtual instructor that explains every decision;
 * a debrief that tells a seventeen-year-old he hit two cars, when he hit a car
 * and a person, teaches him the wrong lesson about the worst thing that can
 * happen on a road.
 *
 * EVERY CASE IS A PAIR, the discipline of `debrief-truthfulness.test.ts`: a
 * check that only asserts the new sentence would also pass a version printing
 * it unconditionally, so each is matched by a drive that must NOT get it.
 */

import { describe, expect, it } from "vitest";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";
import type { SimTick } from "../../rules";

const l0 = lessonById("l0-free-drive")!;

/** Fold ticks through the REAL live path — the coach runs, so escalations are real. */
function driveResult(ticks: SimTick[]): LessonResult {
  let s = createLessonSession(l0);
  for (const t of ticks) s = applyTick(s, t).state;
  return buildLessonResult(finishSession(s, 60));
}

/** The measured drive: a wrecked car at 13.13, the bystander at 13.43. */
const CAR_THEN_PERSON: SimTick[] = [
  makeTick({ t: 1, speedKmh: 46 }),
  makeTick({
    t: 13.13,
    speedKmh: 46,
    events: [{ kind: "collision", withWhat: "vehicle", actorId: "hzac-wreck-a" }],
  }),
  makeTick({
    t: 13.43,
    speedKmh: 45,
    events: [{ kind: "collision", withWhat: "pedestrian", actorId: "sc-hzac-bystander" }],
  }),
  makeTick({ t: 14, speedKmh: 40 }),
];

const carThenPerson = () => buildDebrief(l0, driveResult(CAR_THEN_PERSON)).text;

/**
 * THE CONTROL DRIVE: the same опасна committed twice, half a minute apart —
 * two zebras walked through with a pedestrian on them. PEDESTRIAN_NOT_YIELDED
 * carries no `terminateSession`, so nothing closes the ledger: both rows are
 * charged, they are one code and one act, and the second IS a repeat. Every
 * "other direction" assertion below runs on it, so a fix that answered the
 * collision case by suppressing grouping, points or escalation across the board
 * fails here instead.
 */
const TWO_MISSED_ZEBRAS: SimTick[] = [
  makeTick({ t: 1, speedKmh: 30 }),
  makeTick({
    t: 4,
    speedKmh: 30,
    events: [{ kind: "crossingZoneEntered", crossingId: "z1", pedestrianOnCrossing: true }],
  }),
  makeTick({
    t: 6,
    speedKmh: 30,
    events: [{ kind: "crossingPassed", crossingId: "z1", pedestrianOnCrossing: true }],
  }),
  makeTick({
    t: 38,
    speedKmh: 30,
    events: [{ kind: "crossingZoneEntered", crossingId: "z2", pedestrianOnCrossing: true }],
  }),
  makeTick({
    t: 40,
    speedKmh: 30,
    events: [{ kind: "crossingPassed", crossingId: "z2", pedestrianOnCrossing: true }],
  }),
  makeTick({ t: 45, speedKmh: 30 }),
];

describe("the debrief names WHAT was struck (THEO-4)", () => {
  it("says «пешеходец» when a person was hit — it said it zero times", () => {
    const text = carThenPerson();
    expect(text).toMatch(/пешеходец/);
    // The authored per-body explanation, not just the title: COLLISION_CONTACT_COPY
    // was reaching the event and being discarded before the student saw it.
    expect(text).toMatch(/Удари човек/);
  });

  it("never renders the two victims as «×2» of the vehicle row", () => {
    const text = carThenPerson();
    // The exact sentence that shipped.
    expect(text).not.toMatch(/Удар в друго превозно средство ×2/);
    // …and no ×N at all here: each body is its own single row.
    expect(text).not.toMatch(/×2/);
    expect(text).toMatch(/Удар в друго превозно средство —/);
    expect(text).toMatch(/Удар в пешеходец —/);
  });

  it("THE OTHER DIRECTION: two of the SAME code really are one «×2» row", () => {
    // Two missed zebras are two of ONE mistake, and the drive must still say so —
    // splitting every code would be the same defect pointing the other way.
    const text = buildDebrief(
      l0,
      driveResult(TWO_MISSED_ZEBRAS),
    ).text;
    expect(text).toMatch(/×2/);
  });
});

describe("the numbers agree with the verdict", () => {
  it("the mistake rows total what the ledger charged — it printed 20 against a verdict of 10", () => {
    const r = driveResult(CAR_THEN_PERSON);
    expect(r.score).toBe(10);
    expect(r.summary.score.unscoredAfterClose).toBe(1);
    const text = buildDebrief(l0, r).text;
    expect(text).not.toMatch(/20 наказателни т/);
    // The charged row prints its charge; the row the closure covered says WHY
    // it is free instead of printing a bare zero next to «Удар в пешеходец».
    expect(text).toMatch(/10 наказателни т\. по изпитния лист/);
    expect(text).toMatch(/без допълнителни точки — изпитът вече беше прекратен/);
    // …and the reconciliation is stated rather than left to the student: the
    // ACT that closed the exam, the article that closes one, and the price the
    // closure withheld — so the verdict's «10» is checkable against the rows.
    expect(text).toMatch(/Изпитът е прекратен при «Удар в друго превозно средство»/);
    expect(text).toMatch(/чл\. 48, ал\. 3/);
    expect(text).toMatch(/ДОЛНА ГРАНИЦА/);
    expect(text).toMatch(/щеше да струва още 10 наказателни т\./);
    /**
     * AND NEVER AS A RULE OF ITS OWN. The sentence that used to stand here read
     * «Само първата опасна грешка влиза в точките», which чл. 48, ал. 3 does not
     * say — the drive directly below (two missed zebras, two опасни, both
     * charged) is the counterexample, and a drive with dangerous errors BEFORE
     * the crash had it contradicting the rows two lines above it. Pinned in
     * `debrief-abort-and-closure-truth.test.ts`.
     */
    expect(text).not.toMatch(/Само първата опасна грешка влиза в точките/);
  });

  it("THE OTHER DIRECTION: with no closure, group points are still SUMMED", () => {
    // Two опасни, nothing terminating: the row must read the SUM, 20, not 10.
    const text = buildDebrief(
      l0,
      driveResult(TWO_MISSED_ZEBRAS),
    ).text;
    expect(text).not.toMatch(/Изпитът е прекратен при/);
    expect(text).not.toMatch(/ДОЛНА ГРАНИЦА/);
    expect(text).toMatch(/×2 — опасна, 20 наказателни т/);
  });

  it("a ×N row says how many of the N were charged", () => {
    /**
     * THE REAL L3 SQUEEZE: two wrecked cars (y = 150 and y = 162) and the
     * bystander between them. The vehicle row is one act struck twice, so it
     * groups as «×2» — and the ledger charged one of the two, so the row reads
     * the same «10» a single crash reads. Unqualified that is a figure a reader
     * cannot check; the clause is what makes «×2 … 10» arithmetic instead of a
     * riddle.
     */
    const text = buildDebrief(
      l0,
      driveResult([
        ...CAR_THEN_PERSON,
        makeTick({
          t: 14.23,
          speedKmh: 42,
          events: [{ kind: "collision", withWhat: "vehicle", actorId: "hzac-wreck-b" }],
        }),
        makeTick({ t: 15, speedKmh: 30 }),
      ]),
    ).text;
    expect(text).toMatch(/×2 — опасна, 10 наказателни т\. по изпитния лист \(от тях 1 влиза в точките\)/);
    // THE OTHER DIRECTION: a fully-charged group carries no such clause.
    expect(buildDebrief(l0, driveResult(TWO_MISSED_ZEBRAS)).text).not.toMatch(/влиза в точките/);
  });

  it("the road fine is quoted once for one crash, not once per victim", () => {
    // Both rows share a code, and `roadLines` is keyed by code — printed on
    // both they read 153,39 € twice, i.e. 306,78 € for one impact.
    const text = carThenPerson();
    expect(text.match(/глоба 153,39 €/g) ?? []).toHaveLength(1);
    expect(text).toMatch(/не я броим втори път тук/);
  });
});

describe("two victims are not a repeated mistake", () => {
  it("no «повторна грешка ×1.5» and no inflated training total", () => {
    const r = driveResult(CAR_THEN_PERSON);
    // The coach saw a second event with the same code and graded it a repeat;
    // the record is now refused because the ledger never charged that row.
    expect(r.escalations).toEqual([]);
    expect(r.effectiveScore).toBe(r.score);
    const text = buildDebrief(l0, r).text;
    expect(text).not.toMatch(/повторна грешка/);
    expect(text).not.toMatch(/Тренировъчен резултат/);
    expect(text).not.toMatch(/25 наказателни т/);
  });

  it("THE OTHER DIRECTION: a genuine repeat still escalates and still says so", () => {
    /**
     * The A9 channel must survive intact — answering the false repeat by
     * deleting repeats would be the false-acquittal crime this lane exists to
     * repair. Two missed zebras, nothing terminating, so both rows are charged
     * and the second is graded ×1.5.
     */
    const r = driveResult(TWO_MISSED_ZEBRAS);
    expect(r.escalations.map((e) => e.multiplier)).toEqual([1.5]);
    expect(r.effectiveScore).toBeGreaterThan(r.score);
    const text = buildDebrief(l0, r).text;
    expect(text).toMatch(/повторна грешка ×1,5|повторна грешка ×1\.5/);
    expect(text).toMatch(/Тренировъчен резултат/);
  });

  it("a repeat's note lands on the ACT that earned it, not on its code's other row", () => {
    /**
     * With one row per act a code can own two groups, so an escalation keyed by
     * CODE alone prints on whichever row sorts first. Here the repeat is earned
     * by the PEDESTRIAN row (a second person struck after the exam has already
     * been closed by a car — so it is billed nothing, and the note must not
     * migrate to the vehicle row that WAS billed).
     */
    const text = buildDebrief(
      l0,
      driveResult([
        ...CAR_THEN_PERSON,
        makeTick({
          t: 45,
          speedKmh: 40,
          events: [{ kind: "collision", withWhat: "pedestrian", actorId: "second-walker" }],
        }),
        makeTick({ t: 46, speedKmh: 20 }),
      ]),
    ).text;
    const vehicleLine = text.split("\n").find((l) => l.includes("Удар в друго превозно средство"))!;
    expect(vehicleLine).not.toMatch(/повторна грешка/);
  });
});
