/**
 * THE TRAINING TOTAL MUST SPEND EACH ESCALATION RECORD ONCE — measured 2026-08-19.
 *
 * `debrief.ts` re-derives the «Тренировъчен резултат» line rather than printing
 * `result.effectiveScore`, so the figure can never disagree with the list of
 * rows it closes. That is right. The first version of it derived the weights
 * from `escalationAt`, the MAX-per-(code, t) map built for the row NOTE —
 * and `applyEscalations` (escalation.ts) does something else entirely: it
 * queues the records per (code, t) and `shift()`s one per matching event, so
 * each record is spent exactly once.
 *
 * The two agree until TWO BILLED ROWS SHARE A (code, t). That is not a
 * hand-built fixture — it comes out of the ordinary tick path, because one tick
 * may carry two occupied `crossingPassed` events, and both land at the same `t`
 * under the same code. Measured on the drive below:
 *
 *   applyEscalations   10 + 15 + 20 = 45   ← what BOTH builders compute, what
 *                                            actions.ts persists as
 *                                            effectiveScore, what the session
 *                                            history badges
 *   max map            10 + 20 + 20 = 50   ← what the student was shown
 *
 * 50 appeared on no other surface and could not be reached from the rows above
 * it — the exact complaint this block's own header raises about the shipped 25.
 * A sheet that re-derives has to re-derive the SAME arithmetic.
 *
 * PAIRED, per the discipline of `debrief-truthfulness.test.ts`: the case that
 * must print the honest total is matched by one that must still print an
 * escalation at all, so a "fix" that simply stopped escalating cannot pass.
 */

import { describe, expect, it } from "vitest";
import { buildDebrief } from "../debrief";
import { applyEscalations } from "../escalation";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";
import type { SimTick } from "../../rules";

const l0 = lessonById("l0-free-drive")!;

function driveResult(ticks: SimTick[]): LessonResult {
  let s = createLessonSession(l0);
  for (const t of ticks) s = applyTick(s, t).state;
  return buildLessonResult(finishSession(s, 60));
}

/** Walk an occupied crossing. Each one grades PEDESTRIAN_NOT_YIELDED. */
function walkThrough(t: number, id: string): SimTick {
  return makeTick({
    t,
    speedKmh: 30,
    events: [{ kind: "crossingPassed", crossingId: id, pedestrianOnCrossing: true }],
  });
}

/**
 * Two occupied crossings closed in the SAME tick — the collision case, one
 * surface over. The third offence is a genuine repeat of the first two, so the
 * coach escalates it; the point is which arithmetic prices it.
 */
const TWO_IN_ONE_TICK: SimTick[] = [
  makeTick({ t: 1, speedKmh: 30 }),
  walkThrough(6, "x-1"),
  makeTick({
    t: 40,
    speedKmh: 30,
    events: [
      { kind: "crossingPassed", crossingId: "x-2", pedestrianOnCrossing: true },
      { kind: "crossingPassed", crossingId: "x-3", pedestrianOnCrossing: true },
    ],
  }),
  makeTick({ t: 41, speedKmh: 20 }),
];

function trainingTotalIn(text: string): number | null {
  const m = /Тренировъчен резултат: (\d+(?:[.,]\d+)?)/.exec(text);
  return m ? Number(m[1]!.replace(",", ".")) : null;
}

describe("the training total is consumed, not maxed", () => {
  const result = driveResult(TWO_IN_ONE_TICK);
  const text = buildDebrief(l0, result).text;

  it("the drive really does put two billed rows on one (code, t) — else this file proves nothing", () => {
    // NON-VACUITY, and it earned its place: the first draft of this file read
    // `result.mistakes` (there is no such field — they live on `summary`) and
    // every assertion below "passed" against undefined. Without this check the
    // file would have shipped proving nothing, which is the exact class of
    // defect it exists to guard.
    const billed = result.summary.mistakes.filter((m) => m.points > 0);
    expect(billed.length).toBeGreaterThan(2);
    const keys = billed.map((m) => `${m.code}@${m.t}`);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes.length).toBeGreaterThan(0);
    // …and more than one record must be queued on that key with DIFFERENT
    // multipliers, or max and shift agree and the divergence cannot appear.
    const shared = dupes[0]!;
    const onKey = result.escalations.filter((e) => `${e.code}@${e.t}` === shared);
    expect(onKey.length).toBeGreaterThan(1);
    expect(new Set(onKey.map((e) => e.multiplier)).size).toBeGreaterThan(1);
  });

  it("prints the number the product persists and badges, not a larger one", () => {
    // Measured: mistakes @6/@40/@40, records [×1.5@40, ×2@40].
    //   consumed → 10 + 15 + 20 = 45   ← effectiveScore, persisted, badged
    //   maxed    → 10 + 20 + 20 = 50   ← what the student was shown
    // Every row here is billed, so the sheet's total and the stored total must
    // be the same number. (They may legitimately differ only when the ledger
    // closes over a row — see debrief-collision-truth.test.ts.)
    expect(result.summary.mistakes.every((m) => m.points > 0)).toBe(true);
    expect(trainingTotalIn(text)).toBe(result.effectiveScore);
  });

  it("agrees with escalation.ts's own fold, not merely with itself", () => {
    // The independent check: run the real consumer over the same inputs. If the
    // debrief ever re-derives differently again, this fails even if the number
    // happens to match `effectiveScore` for an unrelated reason.
    const { effectiveTotalPoints } = applyEscalations(result.summary.mistakes, result.escalations);
    expect(trainingTotalIn(text)).toBe(effectiveTotalPoints);
  });

  it("THE OTHER DIRECTION: a genuine repeat still escalates and still says so", () => {
    // A fix that stopped escalating would satisfy every assertion above. This
    // one fails unless the ladder is still running.
    expect(result.escalations.length).toBeGreaterThan(0);
    expect(result.escalations.some((e) => e.multiplier > 1)).toBe(true);
    expect(text).toMatch(/повторена|повторна грешка|повторените грешки/);
  });

  it("THE OTHER DIRECTION: a drive with no repeat prints no training line at all", () => {
    const clean = driveResult([makeTick({ t: 1, speedKmh: 30 }), walkThrough(6, "only-one")]);
    const cleanText = buildDebrief(l0, clean).text;
    expect(clean.escalations.filter((e) => e.multiplier > 1)).toEqual([]);
    expect(trainingTotalIn(cleanText)).toBeNull();
  });
});
