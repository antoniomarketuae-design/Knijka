import { describe, expect, it } from "vitest";
import {
  buildHazardFeedback,
  hazardRuleCitation,
  hazardVerdictFor,
  hazardVerdictLineBg,
  parseHazardLawRef,
} from "../feedback";
import { scoreHazardItem } from "../scoring";
import type { HazardItemScore } from "../types";
import { makeBank, makeItemSource } from "./fixtures";

const item = makeBank([makeItemSource("hz-a")]).byId("hz-a")!;
const scoreAt = (presses: number[]) => scoreHazardItem(item.id, item.window, presses);

describe("hazardVerdictFor", () => {
  it.each([
    [4.1, "excellent"], // band 0
    [5, "excellent"], // band 1
    [6, "good"], // band 2
    [6.8, "good"], // band 3
    [7.5, "late"], // band 4
  ])("maps a press at %ss to '%s'", (t, verdict) => {
    expect(hazardVerdictFor(scoreAt([t]))).toBe(verdict);
  });

  it("keeps 'early' distinct from 'missed' — they are different mistakes", () => {
    expect(hazardVerdictFor(scoreAt([2]))).toBe("early");
    expect(hazardVerdictFor(scoreAt([]))).toBe("missed");
  });

  it("voids a gamed clip", () => {
    expect(hazardVerdictFor(scoreAt([0.5, 1.7, 2.9, 4.1, 5.3]))).toBe("void");
  });

  it("never returns a verdict without a line to say (no bare score, ever)", () => {
    for (const presses of [[4.1], [6], [7.5], [2], [], [0.5, 1.7, 2.9, 4.1, 5.3]]) {
      expect(hazardVerdictLineBg(hazardVerdictFor(scoreAt(presses))).length).toBeGreaterThan(20);
    }
  });

  it("degrades a corrupt score to 'missed' rather than crashing", () => {
    const broken = { ...scoreAt([]), outcome: "scored", band: null } as HazardItemScore;
    expect(hazardVerdictFor(broken)).toBe("missed");
  });
});

describe("parseHazardLawRef", () => {
  it("splits an act from its reference", () => {
    expect(parseHazardLawRef("ЗДвП чл. 119")).toEqual({ act: "ЗДвП", ref: "чл. 119" });
  });

  it("drops the rule engine's parenthetical note to itself", () => {
    expect(parseHazardLawRef("ППЗДвП чл. 63 (М1 — единична непрекъсната линия)")).toEqual({
      act: "ППЗДвП",
      ref: "чл. 63",
    });
  });

  it("returns null rather than manufacturing a citation from a bare act name", () => {
    expect(parseHazardLawRef("ЗДвП")).toBeNull();
    expect(parseHazardLawRef("")).toBeNull();
  });
});

describe("hazardRuleCitation", () => {
  it("retrieves the corrective and the citation from the catalog, verbatim", () => {
    const citation = hazardRuleCitation(item);
    expect(citation.code).toBe("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(citation.lawRef).toBe(item.lawRefEcho);
    expect(citation.severityClass).toBe("opasna");
    expect(citation.conceptId).toBe("c-crosswalk-yield");
    expect(citation.correctiveBg.length).toBeGreaterThan(0);
  });
});

describe("buildHazardFeedback", () => {
  it("reveals the window and the fault only in the graded payload", () => {
    const feedback = buildHazardFeedback(item, scoreAt([5]));
    expect(feedback).toMatchObject({
      verdict: "excellent",
      points: 4,
      maxPoints: 5,
      reactionAtSec: 5,
      windowStartSec: 4,
      windowEndSec: 8,
      hazardAtSec: 8,
      hazardBg: item.hazardBg,
      developingBg: item.developingBg,
    });
    expect(feedback.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 119, ал. 1" }]);
  });

  it("copies its prose — nothing on the payload is composed at request time", () => {
    const feedback = buildHazardFeedback(item, scoreAt([]));
    expect(feedback.hazardBg).toBe(item.hazardBg);
    expect(feedback.developingBg).toBe(item.developingBg);
    expect(feedback.correctiveBg).toBe(hazardRuleCitation(item).correctiveBg);
  });
});
