/**
 * THE TASK CEILING, ROUND 12 — C-UNWRITTEN (the round-11 verifier's condition): two constants the lane's census reads
 * from the same CONFIG it checks, so no census built on them can catch a change to them. Where a constant is a ruled
 * or documented value it is pinned here with a LITERAL taken from that source of truth, and the source is named; where
 * it is a tuning value, the test says so.
 *
 *  · UW3 — `ESCALATION_MULTIPLIERS` (`lessons/escalation.ts`), the repeat ladder above base. RULED/DOCUMENTED: the
 *    founder's answer F1 (2026-09-17, quoted at `scenarios/coach.ts`: «a genuine repeat costs points on the ×1.5/×2
 *    ladder exactly as today») and `scenarios/policy.ts` («Grade escalation: 1st graded = 1.0, then +0.5 per repeat,
 *    capped at 2.0»). Pinned by the literal [1.5, 2] AND by the ladder the coach actually produces, so the exported
 *    list, the wire validator and the coach cannot drift apart.
 *  · UW7 — `curveSpeedGraceKmh` (`rules/types.ts`, the SP-05 curve-envelope slice). A TUNING value, documented where it
 *    is declared: «a speedometer's worth of slack (+5 on a 50 advisory) keeps the at-the-advisory drive … structurally
 *    clear of the threshold (A12)». It is not a legal figure; the pin guards the documented +5 so a change to it is a
 *    visible, deliberate edit (this file), never a silent one.
 */
import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, type RuleEvent, type SimTick } from "../../rules";
import { tick } from "../../rules/__tests__/fixtures";
import { coachStep } from "../../scenarios";
import { ESCALATION_MULTIPLIERS, isEscalationMultiplier } from "../escalation";

describe("UW3 · the repeat ladder is the ruled ×1.5 / ×2", () => {
  it("ESCALATION_MULTIPLIERS is exactly [1.5, 2] — founder answer F1 (2026-09-17) and policy.ts's «+0.5 per repeat, capped at 2.0»", () => {
    expect([...ESCALATION_MULTIPLIERS]).toEqual([1.5, 2]);
  });
  it("…and it is exactly the set of multipliers above ×1.0 the coach produces on repeat after repeat of one graded mistake, which the wire validator accepts and nothing else", () => {
    let enc: Record<string, number> = {};
    const seen = new Set<number>();
    for (let k = 0; k < 8; k++) {
      const step = coachStep(enc, { code: "SPEEDING_DANGEROUS", severityClass: "opasna" });
      enc = step.encounters;
      if (step.decision.penaltyMultiplier > 1) seen.add(step.decision.penaltyMultiplier);
    }
    expect([...seen].sort()).toEqual([...ESCALATION_MULTIPLIERS]);
    for (const m of ESCALATION_MULTIPLIERS) expect(isEscalationMultiplier(m)).toBe(true);
    for (const m of [1, 1.25, 1.75, 2.5, 3]) expect(isEscalationMultiplier(m)).toBe(false);
  });
});

describe("UW7 · the bend's grace is the documented +5 km/h over the advisory (a tuning value, documented in rules/types.ts)", () => {
  const bendDrive = (v: number): RuleEvent[] => {
    let s = createRuleEngine();
    const out: RuleEvent[] = [];
    for (let i = 0; i < 100; i++) {
      const r = reduceTick(s, tick(i / 10, { speedKmh: v, maxSpeedKmh: 70, curveAdvisoryKmh: 50 } as Partial<SimTick>));
      s = r.state;
      out.push(...r.events);
    }
    return out;
  };
  const curveBills = (ev: RuleEvent[]) => ev.filter((e) => e.kind === "violation" && e.code === "SPEED_TOO_FAST_FOR_CURVE").length;
  it("the literal: curveSpeedGraceKmh is 5", () => {
    expect(createRuleEngine().config.curveSpeedGraceKmh).toBe(5);
  });
  it("its meaning on the road: 55 held through a 50 bend for 10 s never arms the code; 55.5 held bills it once", () => {
    expect(curveBills(bendDrive(55))).toBe(0);
    expect(curveBills(bendDrive(55.5))).toBe(1);
  });
});
