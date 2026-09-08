/**
 * THE WITHHELD SPEEDING CHARGE, SETTLED WHEN THE DRIVE ENDS — the guard on
 * `settleUnpaidSpeedingTeach` (finding `sc-signal-flashing:0d68b149`, critical).
 *
 * ── WHAT WAS PHOTOGRAPHED ────────────────────────────────────────────────────
 * `.audit-frames/sweep161/sc-signal-flashing/mobile-wrong/04-t012s.png` and
 * that leg's `audit.log`: the HUD raised «Превишена скорост» over a cluster
 * reading 59 км/ч under a 50 badge, and the debrief four screens later read
 * «SCORE: 0 наказателни точки · MISTAKES (0)» under, verbatim, «чисто каране
 * без нито едно нарушение — задръж това ниво».
 *
 * `SPEED_REGRADE_SEC` was written for exactly that shape and bills a continuing
 * overspeed a second time six accrued driving seconds after the card. It cannot
 * reach a drive that ENDS first, and `signals-sweep161.test.ts` §7 measured this
 * drill: reducer bill at ≈8,9 s, re-grade at ≈14,9 s, ROUTE ENDS at ≈12,6 s.
 * The settlement is the fourth member of that family — the last tick is the
 * last moment anything can ask.
 *
 * ── THE FOUR ACQUITTALS ARE THE POINT OF THIS FILE ───────────────────────────
 * A conviction test alone would pass on a function that returns a bill for
 * everybody. Each negative below is a driver this must NOT charge, and each one
 * is a different guard: never billed at all, corrected, already re-graded, and
 * the опасна band (which grades on its own first bill and has no withheld
 * charge to settle). A12 — nothing innocent moves.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../catalog";
import { parseSpeedMeasurement } from "../consequences";
import { settleUnpaidSpeedingTeach } from "../engine";
import type { SimTick } from "../types";
import { drive, tick } from "./fixtures";

/** The posted limit on the boulevard the audit filmed. */
const LIMIT = 50;
/** speedingBands(50): 50 + min(50 × 0,10 · 5) = 55 graded, 50 + 10 = 60 опасна. */
const GRACED = 55;
const DANGEROUS = 60;

/** Fold 0,1 s frames from 0 to `endT` at `kmh(t)`, and hand back the LAST tick
 *  — the frame a session end would be settled against. */
function run(endT: number, kmh: (t: number) => number) {
  const ticks: SimTick[] = [];
  for (let i = 0; i <= Math.round(endT * 10); i += 1) {
    const t = i / 10;
    ticks.push(tick(t, { speedKmh: kmh(t), maxSpeedKmh: LIMIT }));
  }
  const { state, events } = drive(ticks);
  return { state, events, last: ticks[ticks.length - 1] };
}

const speedingCodes = (events: ReadonlyArray<{ code: string }>): string[] =>
  events.filter((e) => e.code.startsWith("SPEEDING")).map((e) => e.code);

describe("settleUnpaidSpeedingTeach — the charge the free mini-lesson consumed", () => {
  it("the bands this file reasons against are the engine's own", () => {
    // The control: if the grace or the опасна line moves, every case below is
    // about a different drive and must be re-read rather than staying green.
    expect(run(3, () => GRACED).events).toEqual([]);
    expect(speedingCodes(run(3, () => GRACED + 1).events)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(speedingCodes(run(3, () => DANGEROUS + 1).events)).toContain("SPEEDING_DANGEROUS");
  });

  it("CONVICTS: billed, never corrected, and the drive ends while still over", () => {
    // 59 in a 50 held for five seconds — the reducer bills at ≈2 s (the teach
    // spends it) and the six-second re-grade would land at ≈8 s, after the end.
    const { state, events, last } = run(5, () => 59);
    expect(speedingCodes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
    const settled = settleUnpaidSpeedingTeach(state, last);
    expect(settled).not.toBeNull();
    expect(settled!.code).toBe("SPEEDING_OVER_LIMIT");
    // Marked as the same breach, not a new act — this is the field
    // `lessons/engine.ts` reads to drop it wherever the code was already
    // charged, which is what keeps exam mode byte-identical.
    expect(settled!.regrade).toBe(true);
    expect(settled!.t).toBe(last.t);
    // ADR-002 — every word and the citation come off the catalogue row, never
    // from this function: nothing here composes law.
    expect(settled!.lawRef).toBe(VIOLATIONS.SPEEDING_OVER_LIMIT.lawRef);
    expect(settled!.titleBg).toBe(VIOLATIONS.SPEEDING_OVER_LIMIT.titleBg);
    expect(settled!.explanationBg).toBe(VIOLATIONS.SPEEDING_OVER_LIMIT.explanationBg);
    expect(settled!.severityClass).toBe("vtorostepenna");
    // …and it carries the student's OWN two numbers, so the debrief can price
    // his rung on the чл. 182 ladder instead of printing the whole table.
    const m = parseSpeedMeasurement(settled!.detail);
    expect(m).not.toBeNull();
    expect(Math.round(m!.measuredKmh)).toBe(59);
    expect(m!.limitKmh).toBe(LIMIT);
  });

  it("ACQUITS a driver who was never billed: nothing was withheld from him", () => {
    // Over the graced limit for 1,5 s — under `speedingMinorSustainSec` (2 s),
    // so no card was ever shown. Settling here would be a first-encounter
    // charge with no teach in front of it, i.e. the A12 ruling inverted.
    const { state, events, last } = run(1.5, () => 59);
    expect(events).toEqual([]);
    expect(settleUnpaidSpeedingTeach(state, last)).toBeNull();
  });

  it("ACQUITS a driver who CORRECTED — one frame at the limit closes the episode", () => {
    // Billed at ≈2 s, then back to 48 for the last second of the drive.
    const { state, events, last } = run(5, (t) => (t < 4 ? 59 : 48));
    expect(speedingCodes(events)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(settleUnpaidSpeedingTeach(state, last)).toBeNull();
  });

  it("ACQUITS a drive the six-second re-grade already reached — never a third bill", () => {
    // Long enough to contain the window: the re-grade lands at ≈8 s, and this
    // is the drive `lessons/__tests__/exam-mode.test.ts` describes as „TEACHES
    // once and then CHARGES once".
    const { state, events, last } = run(12, () => 59);
    expect(speedingCodes(events)).toEqual(["SPEEDING_OVER_LIMIT", "SPEEDING_OVER_LIMIT"]);
    expect(events.filter((e) => e.code === "SPEEDING_OVER_LIMIT").at(-1)).toMatchObject({
      regrade: true,
    });
    expect(settleUnpaidSpeedingTeach(state, last)).toBeNull();
  });

  it("ACQUITS in the ОПАСНА band, which has no withheld charge to settle", () => {
    // 66 in a 50 is `SPEEDING_DANGEROUS` — опасна, so `policyForViolation`
    // returns „always-grade" and its FIRST bill IS the charge. The второстепенна
    // episode's condition is false up there, so nothing is open to settle.
    const { state, events, last } = run(5, () => 66);
    expect(speedingCodes(events)).toContain("SPEEDING_DANGEROUS");
    expect(settleUnpaidSpeedingTeach(state, last)).toBeNull();
  });

  it("ACQUITS a driver who ends UNDER the limit after a long overspeed", () => {
    // The pair to the correction case, at the other end: he was billed, he came
    // all the way back to 40, and the drive then ended. Nothing to settle.
    const { state, last } = run(8, (t) => (t < 3 ? 59 : 40));
    expect(settleUnpaidSpeedingTeach(state, last)).toBeNull();
  });
});
