import { describe, expect, it } from "vitest";
import { coachSession, coachStep } from "./coach";
import { scenarioForCode } from "./mapping";

describe("catalog → scenario mapping", () => {
  it("maps driving codes to scenario events", () => {
    expect(scenarioForCode("SPEEDING_OVER_LIMIT")).toBe("ev-speed-limit");
    expect(scenarioForCode("RED_LIGHT_CROSSED")).toBe("ev-junction-signalized");
    expect(scenarioForCode("POOR_LANE_KEEPING")).toBe("ev-lane-discipline");
    expect(scenarioForCode("PREDRIVE_STEP_SKIPPED")).toBeNull();
  });
});

describe("teach-first-then-grade coach", () => {
  it("teaches a first minor mistake, then grades repeats", () => {
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
    ]);
    expect(seq[0]).toMatchObject({ mode: "teach", scored: false, showLesson: true });
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true });
    expect(seq[2]).toMatchObject({ mode: "grade", scored: true });
  });

  it("keys encounters by scenario, so both speeding codes share a counter", () => {
    // First minor speeding teaches; a later dangerous speeding still grades
    // (safety floor) and belongs to the same ev-speed-limit scenario.
    const seq = coachSession([
      { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" },
      { code: "SPEEDING_DANGEROUS", severityClass: "opasna" },
    ]);
    expect(seq[0].mode).toBe("teach");
    expect(seq[1]).toMatchObject({ mode: "grade", scored: true }); // опасна always grades
  });

  it("always grades dangerous mistakes from the first encounter (safety floor)", () => {
    const { decision } = coachStep({}, { code: "RED_LIGHT_CROSSED", severityClass: "opasna" });
    expect(decision).toMatchObject({ mode: "grade", scored: true, showLesson: true });
  });

  it("always grades a terminating collision even though it is not опасна-mapped", () => {
    const { decision } = coachStep(
      {},
      { code: "COLLISION", severityClass: "opasna", terminateSession: true },
    );
    expect(decision.scored).toBe(true);
  });

  it("teaches an unmapped minor code by its own key", () => {
    const first = coachStep({}, { code: "HANDBRAKE_LEFT_ON", severityClass: "vtorostepenna" });
    expect(first.decision).toMatchObject({ scenarioId: null, mode: "teach", scored: false });
    const second = coachStep(first.encounters, {
      code: "HANDBRAKE_LEFT_ON",
      severityClass: "vtorostepenna",
    });
    expect(second.decision.mode).toBe("grade");
  });
});
