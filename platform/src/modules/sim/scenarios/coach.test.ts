import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../rules";
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

describe("A12 warn-once floor for второстепенни", () => {
  it("EVERY второстепенна catalog code teaches exactly once, then grades — mapped or not", () => {
    // The whole-catalog sweep: if a new 1-point detector lands without a
    // scenario mapping (or mapped to a stricter scenario), this test is what
    // guarantees the driver still gets one warning toast before losing points.
    const secondDegree = Object.entries(VIOLATIONS)
      .filter(([, spec]) => spec.severityClass === "vtorostepenna")
      .map(([code]) => code);
    expect(secondDegree.length).toBeGreaterThanOrEqual(7);
    for (const code of secondDegree) {
      const first = coachStep({}, { code, severityClass: "vtorostepenna" });
      expect(first.decision.mode, `${code}: first encounter must warn, not grade`).toBe("teach");
      expect(first.decision.scored, `${code}: first encounter must not score`).toBe(false);
      expect(first.decision.showLesson, `${code}: the warning carries the lesson`).toBe(true);
      const second = coachStep(first.encounters, { code, severityClass: "vtorostepenna" });
      expect(second.decision.mode, `${code}: repeat must grade`).toBe("grade");
      expect(second.decision.scored, `${code}: repeat must score`).toBe(true);
    }
  });

  it("основна and опасна behaviour is unchanged by the floor", () => {
    // основна: still teach-first via its scenario mapping.
    const osnovna = coachStep({}, { code: "TURN_WITHOUT_INDICATOR", severityClass: "osnovna" });
    expect(osnovna.decision.mode).toBe("teach");
    // опасна: still graded from the very first encounter.
    const opasna = coachStep({}, { code: "WRONG_WAY", severityClass: "opasna" });
    expect(opasna.decision).toMatchObject({ mode: "grade", scored: true });
  });
});

describe("A13 exam mode — coach OFF, always-grade", () => {
  it("EVERY catalog code, EVERY severity grades from the first encounter at ×1.0", () => {
    // The whole-catalog sweep, exam edition: no teach, no warn-once, no
    // lesson card, official base points only — if a new detector lands, this
    // is what guarantees the exam still grades it from tick one.
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      const first = coachStep(
        {},
        {
          code,
          severityClass: spec.severityClass,
          terminateSession: spec.terminateSession === true,
        },
        { examMode: true },
      );
      expect(first.decision.mode, `${code}: exam must grade the first encounter`).toBe("grade");
      expect(first.decision.scored, `${code}: exam must score`).toBe(true);
      expect(first.decision.penaltyMultiplier, `${code}: no multiplier on exams`).toBe(1);
      expect(first.decision.showLesson, `${code}: no mini-lesson mid-exam`).toBe(false);

      // Repeats stay at ×1.0 — the escalation ladder is training-only.
      const second = coachStep(
        first.encounters,
        { code, severityClass: spec.severityClass },
        { examMode: true },
      );
      expect(second.decision.mode, `${code}: repeat grades`).toBe("grade");
      expect(second.decision.penaltyMultiplier, `${code}: repeat stays ×1.0`).toBe(1);
    }
  });

  it("without the flag the coach is untouched (teach-first survives)", () => {
    const first = coachStep({}, { code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" });
    expect(first.decision.mode).toBe("teach");
  });
});
