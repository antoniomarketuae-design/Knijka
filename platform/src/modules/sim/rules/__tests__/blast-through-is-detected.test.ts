/**
 * «0 ТОЧКИ, 0 ГРЕШКИ» ON A BLAST-THROUGH IS NOT THIS ENGINE'S DOING — the five
 * sweep-161 findings routed at `platform/src/modules/sim/rules`, measured
 * rather than argued, so the next lane fixes the thing that is actually broken.
 *
 * WHAT WAS PHOTOGRAPHED (`.audit-frames/findings`, chunk-5):
 *  · sc-hz-accident-scene · both platforms · wrong — «59 км/ч in a posted 50
 *    zone, past a crash scene with people in the road, produces 0 опасни,
 *    0 основни, 0 второстепенни грешки and 0 наказателни точки. The only reason
 *    given for failing is that route tasks were not finished.» (critical)
 *  · sc-hazard-obstacle · pc · wrong — a live НАУЧИ card reading «Превишена
 *    скорост … ЗДвП чл. 21, ал. 1» fires against a 50 disc and a 59 speedo, and
 *    the final protocol for the SAME drive records 0 второстепенни and 0 points.
 *    «The live coach convicts an offence the examiner's sheet then denies.»
 *  · sc-fo-motorway-gap · pc · right — «the graded drive runs the whole motorway
 *    section at 11-15 км/ч and is scored 0 mistakes. There is no minimum-speed
 *    rule and no objection to crawling on a motorway.» (critical)
 *  · and the inconsistency that ties them together: the same 59-in-a-50 is
 *    invisible on those two lessons while 145-in-a-140 books FOUR counts on
 *    sc-hz-breakdown-pulloff.
 *
 * THE MEASUREMENT (this file). The detectors fire, on the nose, every time:
 * a sustained 59-in-a-50 bills at t = 2, 22 and 42 s (one rung per
 * `speedingRepeatSec`), and a 13 км/ч crawl on a `motorway: true` edge bills
 * DRIVING_TOO_SLOW_FOR_MOTORWAY at t = 4. So «there is no minimum-speed rule» is
 * false and «the sheet denies it» is not a scoring bug.
 *
 * WHERE THE ZERO COMES FROM, measured through the live path on the same ticks
 * (`lessons/engine.ts` → `scenarios/coach.ts`): over 60 s the coach TEACHES the
 * first rung and SCORES the other two — 2 points. Over the first 15 s it teaches
 * the one rung there was and scores nothing: 0 наказателни точки for a whole leg
 * held at 59 in a 50. That is `teach-first-then-grade` (A12, doc 65 §5) working
 * exactly as specified, and it is why the SAME offence is convicted on a long
 * motorway lesson and invisible on a short urban one — the drive either outlives
 * the 20 s repeat cadence or it does not. A fault a lesson can only produce ONCE
 * is always a first encounter, so a lesson built around one such fault cannot
 * fail anybody.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not loosen a detector, and it
 * does not undo teach-first from a rules lane. Withholding the charge from a
 * first encounter is a founder-ratified ruling with a real reason — a
 * seventeen-year-old punished for a rule nobody taught him is the trust failure
 * the policy exists to prevent — and whether a lesson whose entire subject is an
 * offence should still teach-first on that offence is that ruling's owner's
 * call, not a side effect of a speeding test. What this file does is make the
 * measurement permanent, so nobody answers those findings by widening a band
 * (`speedingGraceRatio`, `motorwayMinFlowKmh`) that was never the cause.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_RULE_CONFIG, type RuleEvent, type SimTick } from "../types";
import { drive, tick } from "./fixtures";

/** A leg held at one speed, sampled at 4 Hz like the live loop. */
function held(seconds: number, over: Partial<SimTick>): SimTick[] {
  const out: SimTick[] = [];
  for (let t = 0; t <= seconds + 1e-9; t += 0.25) out.push(tick(Number(t.toFixed(2)), over));
  return out;
}

const violations = (events: RuleEvent[]) =>
  events.filter((e) => e.kind === "violation").map((e) => [e.code, Number(e.t.toFixed(1))]);

describe("the detectors DO fire on the drives the sweep called silent", () => {
  it("59 км/ч in a posted 50 bills at 2 s, and again every repeat cadence", () => {
    // grace = min(50 × 0.1, 5) = 5, so the graded band opens at 55 and the
    // опасна band at 60 — 59 is второстепенна, sustained 2 s, repeating at 20.
    expect(violations(drive(held(60, { speedKmh: 59, maxSpeedKmh: 50 })).events)).toEqual([
      ["SPEEDING_OVER_LIMIT", 2],
      ["SPEEDING_OVER_LIMIT", 22],
      ["SPEEDING_OVER_LIMIT", 42],
    ]);
    expect(DEFAULT_RULE_CONFIG.speedingRepeatSec).toBe(20);
  });

  it("a 13 км/ч crawl on a motorway edge bills — «no minimum-speed rule» is false", () => {
    expect(violations(drive(held(40, { speedKmh: 13, maxSpeedKmh: 130, motorway: true })).events)).toEqual([
      ["DRIVING_TOO_SLOW_FOR_MOTORWAY", 4],
    ]);
  });

  it("…and the SAME crawl on an untagged edge bills nothing — the rule is map-fed", () => {
    /**
     * THE OTHER DIRECTION, and it is where the sc-fo-motorway-gap finding could
     * still be a real defect: `tick.motorway` is authored world data, so a
     * lesson whose district forgot the tag has no motorway rule at all. mw-v1's
     * two edges DO carry `motorway: true` and `maxspeed: 140`, so that lesson is
     * not the untagged case — but a future district can be, silently, and this
     * pins the dependency rather than leaving it to be rediscovered from a
     * screenshot.
     */
    expect(violations(drive(held(40, { speedKmh: 13, maxSpeedKmh: 130 })).events)).toEqual([]);
  });

  it("the lawful side of both bands stays innocent", () => {
    // The control that stops any of the above being answered by widening a band:
    // 54 in a 50 (inside the grace) and 90 on a motorway must still cost nothing.
    expect(violations(drive(held(60, { speedKmh: 54, maxSpeedKmh: 50 })).events)).toEqual([]);
    expect(violations(drive(held(40, { speedKmh: 90, maxSpeedKmh: 130, motorway: true })).events)).toEqual([]);
  });
});
