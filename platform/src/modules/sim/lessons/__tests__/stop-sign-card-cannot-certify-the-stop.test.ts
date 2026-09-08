/**
 * THE COACH MAY NOT CERTIFY THE ACT THE GRADER IS ABOUT TO BILL —
 * sc-merge-from-property:ab353b86, 2026-09-08.
 *
 * THE EVIDENCE. `.audit-frames/w27/frames/sc-merge-from-property__pc-right`
 * (target 85495fd, driven 2026-09-04) is the `right` leg of the drill whose
 * route stops the student twice: once before the тротоар for the walker, once
 * on the derived Б2 at the mouth. Frames `04-t021s` and `04-t027s` print, over
 * a car standing still and short of the paint:
 *
 *     Знак Б2: пълното спиране е задължително — И Е НАПРАВЕНО.
 *     Сега пропусни движещите се по пътя с предимство.
 *
 * and the same protocol's «Грешки (3)» then reads «Неспиране на знак Б2
 * „Спри!“ −10 изпитни т. ОПАСНА ГРЕШКА». The mobile leg carries the identical
 * card (`…__mobile-right/run.log:246`). One act, two channels, opposite
 * verdicts — with the coach's half spoken FIRST and its `longCardBg` closing
 * on «тръгвай сега», i.e. an instruction to commit the offence the sheet then
 * charges ten points for.
 *
 * WHY THE COPY COULD NOT BE TRUE. `advisorPromptForSession` and
 * `stepYieldVoice` are handed a reason and a speed and never a pose — the
 * limitation `advisor.ts` already states about the pedestrian copy and
 * `finish.ts` about the red-light copy — while the reason itself arms anywhere
 * within `YIELD_STOP_LINE_REACH_M` = 26 m of the line. So «направено» was a
 * claim about a graded fact from a module that cannot see it.
 *
 * WHAT THIS FILE PINS is therefore two things and no timing:
 *  §1 no stage of the Б2 wait asserts the stop has been made, and every stage
 *     says WHERE it is made instead (the rule catalog's own retrieved
 *     corrective for `STOP_SIGN_NO_FULL_STOP`: «Спри ДОКРАЙ на линията»);
 *  §2 a person on the crossing outranks an unsignalized line beyond her, so
 *     the wait this drill's own route task is grading («Спри пред тротоара и
 *     пропусни пешеходеца») is narrated as the pedestrian duty it is — while a
 *     red lamp keeps its precedence, because that is what legally holds a car
 *     at the line whatever else is in front of it.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_CARD_LONG_WAIT_S,
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  createYieldVoice,
  stepYieldVoice,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { YIELD_STOP_LINE_REACH_M, yieldReasonAt } from "../finish";
import { VIOLATIONS } from "../../rules/catalog";
import type { ObjectiveParams, YieldWaitState } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// §1 — the four things the Б2 wait says, and the claim none of them may make
// ---------------------------------------------------------------------------

const held = (sinceSec: number): YieldWaitState => ({
  holding: true,
  sinceSec,
  reason: "stopSign",
  pedestrianCrossingIds: [],
});

/** Every string a student can read during (and just after) a Б2 wait. */
function stopSignVoice(): string[] {
  const out: string[] = [
    yieldWaitAdvisorPrompt("stopSign").textBg,
    yieldWaitAdvisorPrompt("stopSign", YIELD_CARD_LONG_WAIT_S).textBg,
  ];
  let v = createYieldVoice();
  // Stand at the line long enough for the named card and the settled card…
  for (const t of [0, YIELD_VOICE_NAME_S, YIELD_VOICE_SETTLE_S]) {
    const step = stepYieldVoice(v, { t, speedKmh: 0, wait: held(0), violations: [] });
    v = step.state;
    for (const n of step.notices) {
      // HudEvent is a UNION (contracts.ts:1824) and only the violation and
      // lesson arms carry explanationBg — commendation, objectiveComplete and
      // quiz do not. Narrow rather than widen the type: this assertion is about
      // what a card SAYS, so a notice with no explanation contributes nothing.
      const title = "titleBg" in n ? n.titleBg : "";
      const why = "explanationBg" in n ? n.explanationBg : "";
      out.push(`${title} ${why}`);
    }
  }
  // …then pull away cleanly, so the verdict stage speaks too.
  const free: YieldWaitState = {
    holding: false,
    sinceSec: null,
    reason: null,
    pedestrianCrossingIds: [],
  };
  for (const t of [
    YIELD_VOICE_SETTLE_S + 1,
    YIELD_VOICE_SETTLE_S + 1 + YIELD_VOICE_VERDICT_S,
  ]) {
    const step = stepYieldVoice(v, { t, speedKmh: 12, wait: free, violations: [] });
    v = step.state;
    for (const n of step.notices) {
      // HudEvent is a UNION (contracts.ts:1824) and only the violation and
      // lesson arms carry explanationBg — commendation, objectiveComplete and
      // quiz do not. Narrow rather than widen the type: this assertion is about
      // what a card SAYS, so a notice with no explanation contributes nothing.
      const title = "titleBg" in n ? n.titleBg : "";
      const why = "explanationBg" in n ? n.explanationBg : "";
      out.push(`${title} ${why}`);
    }
  }
  return out;
}

/**
 * The sentences that assert the graded act. Each was live copy on 2026-09-07
 * and is quoted here so a re-authoring that reintroduces one fails rather than
 * being photographed on a phone three waves later.
 */
const CERTIFYING = [
  /е\s+направено/i,
  /е\s+изпълнено/i,
  /Спрял\s+си\s+правилно/i,
  /Спря\s+(?:напълно|докрай)/i,
];

describe("the Б2 wait card states the duty and never certifies it", () => {
  it("finds every stage — the corpus is not empty", () => {
    // ANTI-VACUITY: opening card, long card, named, settled, verdict.
    expect(stopSignVoice().length).toBe(5);
  });

  it("no stage claims the full stop has been made", () => {
    const offenders = stopSignVoice().filter((s) => CERTIFYING.some((rx) => rx.test(s)));
    expect(offenders).toEqual([]);
  });

  it("every stage says WHERE the stop is made instead", () => {
    for (const s of stopSignVoice()) expect(s, s.slice(0, 40)).toMatch(/лини/i);
  });

  it("and it says it in the grader's own words, not a second derivation", () => {
    // ADR-002: the coach quotes the catalogue row the engine bills, so the two
    // channels cannot teach two different placements of the same stop.
    expect(VIOLATIONS.STOP_SIGN_NO_FULL_STOP.correctiveBg).toContain("на линията");
  });

  it("the long card still names the act that ends the wait", () => {
    // The contract `advisor-yield-long-wait.test.ts` holds every look-and-go
    // reason to; restated here so this file's rewrite cannot quietly drop it.
    expect(yieldWaitAdvisorPrompt("stopSign", YIELD_CARD_LONG_WAIT_S).textBg).toContain(
      "тръгвай сега",
    );
  });
});

// ---------------------------------------------------------------------------
// §2 — who the student is actually waiting for
// ---------------------------------------------------------------------------

const NOWHERE: ObjectiveParams[] = [{ kind: "reachZone", x: 0, y: 400, radiusM: 9 }];
const CTX = { params: NOWHERE, currentIndex: 0 };

/** mg-property-v1: the graded тротоар at x = 34, the derived Б2 at x = 27.73. */
const MFP_WALK_TO_LINE_M = 34 - 27.73;

describe("a person on the crossing outranks the unsignalized line beyond her", () => {
  it("the drill's own geometry puts that pose inside the line's reach window", () => {
    // Which is why the sign used to win: the pedestrian clause was unreachable.
    expect(MFP_WALK_TO_LINE_M).toBeGreaterThan(0);
    expect(MFP_WALK_TO_LINE_M).toBeLessThan(YIELD_STOP_LINE_REACH_M);
  });

  it("a Б2 line ahead no longer swallows the walker in front of the bonnet", () => {
    const tick = makeTick({
      nextStopLineM: MFP_WALK_TO_LINE_M + 3,
      nextStopLineControl: "stopSign",
    });
    expect(yieldReasonAt(tick, CTX, [])).toBe("stopSign");
    expect(yieldReasonAt(tick, CTX, ["mgp-x-walk"])).toBe("pedestrian");
  });

  it("…and neither does a Б1", () => {
    const tick = makeTick({ nextStopLineM: 4, nextStopLineControl: "giveWay" });
    expect(yieldReasonAt(tick, CTX, [])).toBe("giveWayLine");
    expect(yieldReasonAt(tick, CTX, ["x-1"])).toBe("pedestrian");
  });

  it("but a red lamp keeps precedence — it is what holds the car at the line", () => {
    const red = makeTick({
      nextStopLineM: 2,
      nextStopLineControl: "trafficLight",
      nextStopLineState: "red",
    });
    expect(yieldReasonAt(red, CTX, ["x-1"])).toBe("redLight");
  });

  it("a green lamp was never a wait, with or without a pedestrian", () => {
    const green = makeTick({
      nextStopLineM: 2,
      nextStopLineControl: "trafficLight",
      nextStopLineState: "green",
    });
    expect(yieldReasonAt(green, CTX, [])).toBeNull();
    // …and the pedestrian clause still answers for it, as it always did.
    expect(yieldReasonAt(green, CTX, ["x-1"])).toBe("pedestrian");
  });
});
