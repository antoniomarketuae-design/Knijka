/**
 * =============================================================================
 * THE CHROME NOBODY COUNTED — `briefingCardCeilingPx`, w44, 2026-09-14.
 * =============================================================================
 *
 * Repair wave 44 wrote exactly one behavioural change across thirty lanes, and
 * it shipped without a test. This is that test, added by the integrator rather
 * than the lane, and the omission is recorded rather than tidied away: an
 * exported function with a live call site and no coverage is a repair that
 * survives until the next person edits near it.
 *
 * WHAT IT DOES. `briefingRoadCeilingPx` answers «where does the road begin, in
 * the LIST's coordinates». The card, however, holds more than the list — a
 * counter row and its padding sit below it — so a list sized exactly to the
 * ceiling puts the CARD 22 px into the band the rule exists to clear. This
 * subtracts that chrome.
 *
 * THE THREE REFUSALS BELOW ARE THE POINT, and each picks the same direction:
 * when the measurement is unavailable, behave exactly as the product behaved
 * before this function existed. jsdom measures 0 for every rect and a card with
 * no parent element measures nothing; neither may become the reason a
 * seventeen-year-old is shown less of the briefing.
 */
import { describe, expect, it } from "vitest";

import {
  BRIEFING_ROAD_MIN_LIST_PX,
  briefingCardCeilingPx,
} from "../LessonPlayShell";

describe("briefingCardCeilingPx · the card owes the band more than the list does", () => {
  it("subtracts the chrome that sits below the list", () => {
    // The worked case from the function's own docblock: a 467 px list ceiling
    // on a card carrying 22 px of counter row below it clears the band at 445.
    expect(briefingCardCeilingPx(467, 22)).toBe(445);
  });

  it("is the identity when there is no chrome to subtract", () => {
    expect(briefingCardCeilingPx(467, 0)).toBe(467);
  });

  it("passes through «there is no ceiling» rather than inventing one", () => {
    // MUTATION WATCHED: returning 0 or the floor here would impose a ceiling on
    // every lesson that has none — the В27 shape, a header and a counter with
    // nothing between them, arriving through the function meant to prevent it.
    expect(briefingCardCeilingPx(null, 22)).toBeNull();
    expect(briefingCardCeilingPx(null, 0)).toBeNull();
  });

  it("treats an unreadable chrome as zero, i.e. as today's behaviour", () => {
    // jsdom measures 0 for every rect and a card with no parent measures
    // nothing. MUTATION WATCHED: let NaN through the arithmetic and the ceiling
    // becomes NaN, which `Math.max` propagates — the list then sizes to
    // whatever a NaN ceiling means downstream, silently, on every test render.
    expect(briefingCardCeilingPx(467, Number.NaN)).toBe(467);
    expect(briefingCardCeilingPx(467, Number.POSITIVE_INFINITY)).toBe(467);
  });

  it("never lets a negative chrome ENLARGE the budget", () => {
    // A rect that measures backwards must not hand the list more room than the
    // road rule allows — that is the failure this whole cluster is about,
    // arriving from the other side.
    expect(briefingCardCeilingPx(467, -50)).toBe(467);
  });

  it("clamps to the floor, because a ceiling that reaches zero is a delete", () => {
    // 40 px of ceiling against 300 px of chrome is arithmetically −260.
    expect(briefingCardCeilingPx(40, 300)).toBe(BRIEFING_ROAD_MIN_LIST_PX);
    // …and the floor is the SAME floor the sibling function uses, borrowed
    // rather than re-decided. MUTATION WATCHED: a second, local constant here
    // would drift from `briefingRoadCeilingPx`'s and the two paths would size
    // the same card differently.
    expect(BRIEFING_ROAD_MIN_LIST_PX).toBe(38);
  });

  it("is monotone in the chrome, above the floor", () => {
    // More chrome can only mean less list. A repair that got the sign wrong
    // would pass the worked case above and fail here.
    const a = briefingCardCeilingPx(467, 10) as number;
    const b = briefingCardCeilingPx(467, 40) as number;
    expect(a).toBeGreaterThan(b);
  });
});
