/**
 * doc 87, item 5 of the 2026-08-05 gate's open list — „The scan fault tells him
 * he crossed «знак Б2» — in the lesson titled «Б1 не значи спри винаги»."
 *
 * Photographed at `newdef/b5gw-card-t24.4.png`: the title bar reads «Б1 не
 * значи спри винаги» directly above a fault card reading «Премина стоп-линията
 * на знак Б2». `engine.ts` arms JUNCTION_SCAN_INCOMPLETE at a Б1 give-way line
 * deliberately and correctly — the fresh ляво-дясно scan is the crux of that
 * lesson — but the catalogue carries one string per code and it named Б2
 * unconditionally.
 *
 * The three things this locks:
 *   1. the CATALOGUE string names NEITHER sign (it is the one text both
 *      controls have to be true of, and `correctiveBg` has no per-event
 *      channel, so it must stay control-neutral forever);
 *   2. a give-way crossing produces a card that says Б1 — and never Б2;
 *   3. a stop-sign crossing still says Б2, with the full-stop fault beside it.
 */

import { describe, expect, it } from "vitest";

import { VIOLATIONS } from "../catalog";
import { createRuleEngine, reduceTick } from "../engine";
import type { RuleEngineState, SimTick, ViolationEvent } from "../index";

function tickAt(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
    speedKmh: 12,
    maxSpeedKmh: 50,
    position: { x: 0, y: 0 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    gear: 1,
    seatbeltOn: true,
    handbrakeOn: false,
    headlights: "off",
    isNight: false,
    indicator: "off",
    events: [],
    ...over,
  } as SimTick;
}

function crossLine(control: "giveWay" | "stopSign"): ViolationEvent[] {
  // The drill's own opt-in: the detector is default-OFF everywhere else.
  let s: RuleEngineState = createRuleEngine({ junctionScanObservationEnabled: true });
  const out: ViolationEvent[] = [];
  // No glance in the lookback at all → the scan fault is owed at either sign.
  for (const t of [0, 1]) {
    const r = reduceTick(s, tickAt(t));
    s = r.state;
  }
  const r = reduceTick(
    s,
    tickAt(2, { events: [{ kind: "stopLineCrossed", control }] } as Partial<SimTick>),
  );
  for (const e of r.events) if (e.kind === "violation") out.push(e);
  return out;
}

describe("JUNCTION_SCAN_INCOMPLETE names the sign the student actually crossed", () => {
  it("the CATALOGUE string names neither Б1 nor Б2 — it is armed at both", () => {
    const spec = VIOLATIONS.JUNCTION_SCAN_INCOMPLETE;
    for (const text of [spec.titleBg, spec.explanationBg, spec.correctiveBg]) {
      expect(text, text).not.toMatch(/Б2/);
      expect(text, text).not.toMatch(/Б1/);
    }
    // …and the corrective must not smuggle in the full-stop demand either: it
    // is shown for the Б1 case too, where «спри» is the myth the lesson kills.
    expect(spec.correctiveBg).not.toMatch(/спри/i);
  });

  it("a Б1 give-way crossing produces a card that says Б1 and never Б2", () => {
    const v = crossLine("giveWay");
    const scan = v.find((e) => e.code === "JUNCTION_SCAN_INCOMPLETE");
    expect(scan, "the give-way branch must still grade the missing scan").toBeDefined();
    expect(scan!.titleBg).toMatch(/Б1/);
    expect(scan!.explanationBg).toMatch(/Б1/);
    expect(scan!.titleBg).not.toMatch(/Б2/);
    expect(scan!.explanationBg).not.toMatch(/Б2/);
    // Б1 is not „Спри!" — ЗДвП чл. 50. The scan fault must never imply it is.
    expect(v.map((e) => e.code)).not.toContain("STOP_SIGN_NO_FULL_STOP");
    // Severity/points/law are catalogue-owned and the override channel must not
    // touch them.
    expect(scan!.severityClass).toBe(VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.severityClass);
    expect(scan!.points).toBe(VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.points);
    expect(scan!.lawRef).toBe(VIOLATIONS.JUNCTION_SCAN_INCOMPLETE.lawRef);
  });

  it("a Б2 stop-line crossing still says Б2, beside the full-stop fault", () => {
    const v = crossLine("stopSign");
    const scan = v.find((e) => e.code === "JUNCTION_SCAN_INCOMPLETE");
    expect(scan).toBeDefined();
    expect(scan!.titleBg).toMatch(/Б2/);
    expect(scan!.explanationBg).toMatch(/Б2/);
    expect(scan!.explanationBg).not.toMatch(/Б1/);
    expect(v.map((e) => e.code)).toContain("STOP_SIGN_NO_FULL_STOP");
  });
});
