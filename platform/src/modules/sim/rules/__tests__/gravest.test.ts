/**
 * THE ORDERING THAT REPLACED „WHOEVER WAS TYPED FIRST".
 *
 * `gravestViolation` exists because a card citing three codes was priced off
 * `codeRefs[0]`: `sc-pe-parked-row-scan / mistake-fast-row` ends with a child
 * under the bumper and badged «второстепенна грешка · −1 изпитна т.», because
 * SPEEDING_OVER_LIMIT is the fault its lesson opens with. Наредба № 38,
 * приложение № 5, т. 10 prices a fault by CLASS and чл. 48, ал. 3 ends the exam
 * for one of them; neither provision has an opinion about authoring order.
 *
 * The rules asserted here are the two the act supports and nothing more.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS, gravestViolation, severityRank } from "../index";
import type { ViolationCode } from "../types";

describe("class first — приложение № 5, т. 10", () => {
  it("ranks the three classes by the points the act attaches to them", () => {
    expect(severityRank("opasna")).toBe(10);
    expect(severityRank("osnovna")).toBe(3);
    expect(severityRank("vtorostepenna")).toBe(1);
  });

  it("THE DEFECT: the fast-row card's own code set no longer prices off the speeding", () => {
    // Exactly the list the template carries, in the template's order.
    const codes = ["SPEEDING_OVER_LIMIT", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"];
    expect(VIOLATIONS[codes[0] as ViolationCode].severityClass).toBe("vtorostepenna");
    const worst = gravestViolation(codes);
    expect(worst?.code).toBe("COLLISION");
    expect(worst?.spec.severityClass).toBe("opasna");
    expect(worst?.spec.points).toBe(10);
    expect(worst?.spec.terminateSession).toBe(true);
  });

  it("order of the input never changes the answer", () => {
    const codes = ["SPEEDING_OVER_LIMIT", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"];
    const reversed = [...codes].reverse();
    expect(gravestViolation(reversed)?.code).toBe(gravestViolation(codes)?.code);
    // …which is what makes the one card already „fixed" by reordering a no-op.
    expect(gravestViolation(["COLLISION", "POOR_LANE_KEEPING"])?.code).toBe("COLLISION");
    expect(gravestViolation(["POOR_LANE_KEEPING", "COLLISION"])?.code).toBe("COLLISION");
  });
});

describe("within a class, the fault that ENDS the exam wins — чл. 48, ал. 3", () => {
  it("COLLISION outranks an equally-priced опасна that only fails the sheet", () => {
    // Both cost 10 and both are опасни. Only one stops the exam, so only one
    // may print the rider on a card that shows a ПТП.
    expect(VIOLATIONS.FAILED_TO_YIELD.severityClass).toBe("opasna");
    expect(VIOLATIONS.FAILED_TO_YIELD.points).toBe(10);
    expect(VIOLATIONS.FAILED_TO_YIELD.terminateSession).toBeUndefined();
    expect(gravestViolation(["FAILED_TO_YIELD", "COLLISION"])?.code).toBe("COLLISION");
    expect(gravestViolation(["COLLISION", "FAILED_TO_YIELD"])?.code).toBe("COLLISION");
  });

  it("a terminating fault never outranks a graver class it does not belong to", () => {
    // Guard against „terminates" being read as a super-class. There is only one
    // terminating code today; the ordering must still be class-first.
    const terminating = (Object.keys(VIOLATIONS) as ViolationCode[]).filter(
      (c) => VIOLATIONS[c].terminateSession === true,
    );
    expect(terminating).toEqual(["COLLISION"]);
    for (const c of terminating) {
      expect(severityRank(VIOLATIONS[c].severityClass)).toBe(10);
    }
  });

  it("equal class and equal termination keeps the author's order", () => {
    expect(gravestViolation(["FAILED_TO_YIELD", "RED_LIGHT_CROSSED"])?.code).toBe("FAILED_TO_YIELD");
    expect(gravestViolation(["RED_LIGHT_CROSSED", "FAILED_TO_YIELD"])?.code).toBe("RED_LIGHT_CROSSED");
  });
});

describe("it refuses to invent a charge", () => {
  it("skips codes the catalogue does not price, and returns null when none resolve", () => {
    expect(gravestViolation([])).toBeNull();
    expect(gravestViolation(["NOT_A_CODE"])).toBeNull();
    expect(gravestViolation(["NOT_A_CODE", "SPEEDING_OVER_LIMIT"])?.code).toBe("SPEEDING_OVER_LIMIT");
  });

  it("every catalogue code resolves to itself", () => {
    for (const code of Object.keys(VIOLATIONS) as ViolationCode[]) {
      expect(gravestViolation([code])?.code, code).toBe(code);
    }
  });
});
