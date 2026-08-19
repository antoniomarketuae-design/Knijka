/**
 * THE COPY THE STUDENT ACTUALLY READS — `sc-hz-accident-scene` L3, re-measured
 * 2026-08-19 after the client-side repair.
 *
 * `LessonPlayShell.tsx:2683` renders `saveResult.debriefText` whenever the save
 * succeeds and only falls back to `buildDebrief(lesson, result)` when it fails.
 * So the text that ships is built on the SERVER, from `wire.ts gradeFinishWire`
 * — and the previous lane repaired the CLIENT fold (`engine.ts
 * buildLessonResult`) alone. On the same drive, the same one-car-one-person
 * crash 0.3 s apart:
 *
 *   CLIENT  score=10  effective=10  escalations=[]
 *   SERVER  score=10  effective=25  escalations=[COLLISION @13.43 ×1.5]
 *
 * and the server's sheet carried, verbatim:
 *
 *   • Удар в пешеходец — опасна, без допълнителни точки — изпитът вече беше
 *     прекратен (…) — повторна грешка ×1.5
 *   • Тренировъчен резултат: 25 наказателни т. … Официалният резултат остава 10
 *
 * The first row states both halves of a contradiction in one sentence: no
 * points were charged, and the points that were not charged were multiplied by
 * 1.5. The second is a figure that appears on no other surface and cannot be
 * reached from any line above it — and `actions.ts` persisted the same 25, so
 * session-history's „официален vs тренировъчен" badge repeated it afterwards.
 *
 * AND THE HONEST BUILD WENT SILENT. Pricing the collision by the ledger (10 for
 * the car, 0 for the man the closure covered) dropped both rows below four ties
 * at 10 points, and `MAX_MISTAKE_LINES = 4` then cut them off a busy sheet
 * entirely: «Удар в пешеходец» absent, «Удар в друго превозно средство» absent,
 * «…и още 2 вида нарушения». On that input the truthful debrief said LESS about
 * the man in the road than the broken one did.
 *
 * EVERY CASE IS A PAIR — the discipline of `debrief-collision-truth.test.ts`
 * and `debrief-truthfulness.test.ts`. A check that only asserts a sentence is
 * gone would pass on a build that never prints it, and a debrief that hides a
 * real repeat is the same crime as one that invents a fake one. So each case
 * below is matched by the drive that MUST still get what this one must not.
 */

import { describe, expect, it } from "vitest";
import { makeViolation, type ScorableEvent, type SimTick } from "../../rules";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { gradeFinishWire, serializeRuleEvents } from "../wire";
import { makeTick } from "./fixtures";

const l0 = lessonById("l0-free-drive")!;

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

/**
 * THE CONTROL DRIVE, and it is the same one `debrief-collision-truth.test.ts`
 * uses: two pedestrians missed half a minute apart. PEDESTRIAN_NOT_YIELDED
 * carries no `terminateSession`, so nothing closes the ledger — both rows are
 * charged, they are one code and one act, and the second genuinely IS a repeat.
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

/**
 * Drive it once and grade it BOTH ways, exactly as the product does: the client
 * folds `buildLessonResult`, then `LessonPlayShell` serializes the same session
 * (`serializeRuleEvents(state.events, state.penaltyEscalations, …)` — the RAW
 * escalation list, which is how the false record reached the server at all) and
 * the action regrades it through `gradeFinishWire`.
 */
function bothPaths(ticks: SimTick[], endAtSec: number) {
  let s = createLessonSession(l0);
  for (const t of ticks) s = applyTick(s, t).state;
  s = finishSession(s, endAtSec);
  const client = buildLessonResult(s);
  const graded = gradeFinishWire({
    lessonId: l0.id,
    startedAtMs: 0,
    finishedAtMs: endAtSec * 1000,
    aborted: false,
    ruleEvents: serializeRuleEvents(s.events, s.penaltyEscalations, []),
    objectives: [],
  });
  if (graded.status !== "ok") throw new Error(`gradeFinishWire: ${graded.status}`);
  return { client, server: graded.result };
}

/** Free drive that "experienced" the given events, then folds — sweep161's idiom. */
function resultWithEvents(events: ScorableEvent[]): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  return buildLessonResult(finishSession(s, 99));
}

/** The bulleted rows of the sheet — what the student's eye actually lands on. */
const bullets = (text: string): string[] =>
  text.split("\n").filter((l) => l.startsWith("• "));

/**
 * THE MISTAKE ROW for a title, and it is `• `-anchored on purpose.
 *
 * A plain „first line containing the title" finds the VERDICT header instead —
 * «допуснати са 2 опасни грешки, най-тежката «Непропускане на пешеходец»» — and
 * that header never carries an escalation note under any build, so
 * `expect(row).not.toMatch(/повторна грешка/)` would have passed on the broken
 * file and on every future one. It is the same shape as the four instrument
 * bugs in this project's audit: a probe that cannot fail, reading reassuringly.
 * Written the loose way first, and it did exactly that here before the
 * `startsWith` was added.
 *
 * SELF-CHECKING: it throws unless the row it returns is a PRICED mistake row
 * (every one cites приложение № 5), so a title that stops appearing on the
 * sheet fails the test rather than silently satisfying a `not.toMatch`.
 */
const mistakeRow = (text: string, titleBg: string): string => {
  const row = bullets(text).find((l) => l.startsWith(`• ${titleBg}`));
  if (row === undefined || !row.includes("приложение № 5")) {
    throw new Error(`no priced mistake row for «${titleBg}» in:\n${bullets(text).join("\n")}`);
  }
  return row;
};

describe("the server debrief and the client debrief are the same debrief", () => {
  it("one crash, two victims: the server printed a repeat and a 25 the client never did", () => {
    const { client, server } = bothPaths(CAR_THEN_PERSON, 60);

    // The raw record the coach made and the client sent is unchanged — this is
    // not fixed by refusing to transmit it, but by refusing to CHARGE it.
    expect(client.score).toBe(10);
    expect(server.score).toBe(10);
    expect(server.effectiveScore).toBe(client.effectiveScore);
    expect(server.effectiveScore).toBe(10);
    expect(server.escalations).toEqual(client.escalations);
    expect(server.escalations).toEqual([]);

    // …and therefore the two texts are one text. The strongest form of the
    // assertion: not „both lack the bad sentence" but „they cannot differ".
    const clientText = buildDebrief(l0, client).text;
    const serverText = buildDebrief(l0, server).text;
    expect(serverText).toBe(clientText);

    // The four sentences, named.
    expect(serverText).not.toMatch(/повторна грешка/);
    expect(serverText).not.toMatch(/Тренировъчен резултат/);
    expect(serverText).not.toMatch(/25 наказателни т/);
    expect(serverText).not.toMatch(/20 наказателни т/);
    // The man in the road is still on the sheet, in his own words.
    expect(serverText).toMatch(/Удар в пешеходец —/);
    expect(serverText).toMatch(/Удари човек/);
  });

  it("THE OTHER DIRECTION: a genuine repeat still escalates ON THE SERVER too", () => {
    /**
     * Answering the false repeat by never folding escalations server-side would
     * be the same defect pointing at a false acquittal: the student who really
     * did run the same опасна twice would read a debrief that never says so.
     * Two missed zebras, nothing terminating, both rows charged.
     */
    const { client, server } = bothPaths(TWO_MISSED_ZEBRAS, 45);
    expect(server.score).toBe(20);
    expect(server.effectiveScore).toBe(25);
    expect(server.effectiveScore).toBe(client.effectiveScore);
    expect(server.escalations.map((e) => e.multiplier)).toEqual([1.5]);

    const serverText = buildDebrief(l0, server).text;
    expect(serverText).toBe(buildDebrief(l0, client).text);
    expect(serverText).toMatch(/повторна грешка ×1[,.]5/);
    expect(serverText).toMatch(/Тренировъчен резултат: 25 наказателни т/);
  });
});

describe("a row the exam never charged cannot be a «повторна грешка»", () => {
  /**
   * THE SAME DEFECT, PINNED WHERE IT IS RENDERED rather than where it was
   * folded. The fixture is the server's own output as measured before the wire
   * fix — captured here so the guard survives a regression in ANY builder of a
   * LessonResult, present or future. `buildDebrief` computes `ledgerBilling`
   * for itself; a multiplier weights a price, and a row whose price чл. 48,
   * ал. 3 withheld has no price to weight.
   */
  const corruptedByABuilder = (): LessonResult => {
    const { client } = bothPaths(CAR_THEN_PERSON, 60);
    const person = client.summary.mistakes.find((m) => m.detail === "pedestrian")!;
    return {
      ...client,
      effectiveScore: 25,
      escalations: [
        {
          code: person.code,
          t: person.t,
          titleBg: person.titleBg,
          basePoints: person.points,
          multiplier: 1.5,
          effectivePoints: 15,
        },
      ],
    };
  };

  it("no note, and no total, even when the result handed in claims both", () => {
    const text = buildDebrief(l0, corruptedByABuilder()).text;

    const personLine = mistakeRow(text, "Удар в пешеходец");
    expect(personLine).toMatch(/без допълнителни точки — изпитът вече беше прекратен/);
    expect(personLine).not.toMatch(/повторна грешка/);
    // Nor may it migrate to the row that WAS charged.
    expect(mistakeRow(text, "Удар в друго превозно средство")).not.toMatch(/повторна грешка/);

    // The training total is the sheet's own arithmetic: Σ over the rows it
    // priced. Nothing was escalated among them, so there is nothing to print.
    expect(text).not.toMatch(/Тренировъчен резултат/);
    expect(text).not.toMatch(/25 наказателни т/);
  });

  it("THE OTHER DIRECTION: the note lands, and the total is printed, on a real repeat", () => {
    const { client } = bothPaths(TWO_MISSED_ZEBRAS, 45);
    const text = buildDebrief(l0, client).text;
    expect(mistakeRow(text, "Непропускане на пешеходец")).toMatch(/повторна грешка ×1[,.]5/);
    expect(text).toMatch(/Тренировъчен резултат: 25 наказателни т/);
  });

  it("THE OTHER DIRECTION: a handed-in total is not obeyed when the ledger disagrees UPWARD either", () => {
    /**
     * The re-derivation must not be a one-way suppressor. Two charged rows, the
     * second a real ×1.5 — hand the debrief an `effectiveScore` of 20 (the
     * unescalated sum, i.e. a builder that dropped the escalation) and the sheet
     * must still print the 25 its own rows add up to, because its own rows are
     * what the student can check.
     */
    const { client } = bothPaths(TWO_MISSED_ZEBRAS, 45);
    const text = buildDebrief(l0, { ...client, effectiveScore: 20 }).text;
    expect(text).toMatch(/Тренировъчен резултат: 25 наказателни т/);
    expect(text).not.toMatch(/Тренировъчен резултат: 20/);
  });
});

describe("a crash is never the row that truncation drops", () => {
  /**
   * Four charged опасни and then the crash. Every row here is опасна and every
   * one is a catalog 10, so no ordering key can separate them — severity ties,
   * shown points tie, billed points put the two collision rows LAST (10 for the
   * car by insertion order, 0 for the man the closure covered). That is not an
   * accident of this drive: the closure zeroes precisely the rows that FOLLOW
   * the gravest event, so a price-ordered sheet buries the worst thing that
   * happened whenever it happened late.
   */
  const BUSY_THEN_CRASH: ScorableEvent[] = [
    makeViolation("FAILED_TO_YIELD", 2),
    makeViolation("PEDESTRIAN_NOT_YIELDED", 4),
    makeViolation("WRONG_WAY", 6),
    makeViolation("RED_LIGHT_CROSSED", 8),
    makeViolation("COLLISION", 13.13, { detail: "vehicle" }),
    makeViolation("COLLISION", 13.43, { detail: "pedestrian" }),
  ];

  it("both bodies of the crash are on a sheet already full of dangerous errors", () => {
    const r = resultWithEvents(BUSY_THEN_CRASH);
    // The premise: the crash really is last by every ordering key available.
    expect(r.score).toBe(50);
    expect(r.summary.score.unscoredAfterClose).toBe(1);

    const text = buildDebrief(l0, r).text;
    expect(text).toMatch(/• Удар в друго превозно средство —/);
    expect(text).toMatch(/• Удар в пешеходец —/);
    // …and with its teaching, which is the whole reason the row must be here.
    expect(text).toMatch(/Удари човек/);
    expect(text).toMatch(/Спира самия изпит/);
  });

  it("THE OTHER DIRECTION: without a crash the cap still bites at four", () => {
    /**
     * The exemption must not become „print everything". Six опасни, none
     * terminating: four rows and an honest remainder, exactly as before.
     */
    const text = buildDebrief(
      l0,
      resultWithEvents([
        makeViolation("FAILED_TO_YIELD", 2),
        makeViolation("PEDESTRIAN_NOT_YIELDED", 4),
        makeViolation("WRONG_WAY", 6),
        makeViolation("RED_LIGHT_CROSSED", 8),
        makeViolation("EMERGENCY_NOT_YIELDED", 10),
        makeViolation("CONTROLLER_SIGNAL_VIOLATED", 12),
      ]),
    ).text;
    const rows = bullets(text).filter((l) => l.includes("наказателни т."));
    expect(rows).toHaveLength(4);
    expect(text).toMatch(/…и още 2 вида нарушения/);
  });

  it("the remainder count is what was actually withheld, not a constant", () => {
    /**
     * The cap stretches for the exempt rows, so „и още N" can no longer be
     * `groups.length − 4`. Six groups, two of them the crash: four printed rows
     * plus the two collision rows would be six — the two lowest-priced
     * non-crash rows are the ones withheld, and the count has to say 2, not 0
     * and not 4.
     */
    const text = buildDebrief(l0, resultWithEvents(BUSY_THEN_CRASH)).text;
    const rows = bullets(text).filter((l) => l.includes("приложение № 5"));
    expect(rows).toHaveLength(4);
    expect(text).toMatch(/…и още 2 вида нарушения/);
  });
});
