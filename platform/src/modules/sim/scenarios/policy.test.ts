import { describe, expect, it } from "vitest";
import {
  VTOROSTEPENNA_DEFAULT_POLICY,
  policyForViolation,
  recordEncounter,
  resolveEncounter,
} from "./policy";

describe("teach-first-then-grade policy", () => {
  // ev-speed-limit defaults to teach-first-then-grade.
  it("teaches the first encounter, then grades repeats harder", () => {
    const first = resolveEncounter("ev-speed-limit", 0);
    expect(first.mode).toBe("teach");
    expect(first.penaltyMultiplier).toBe(0);
    expect(first.showLesson).toBe(true);

    const second = resolveEncounter("ev-speed-limit", 1);
    expect(second.mode).toBe("grade");
    expect(second.penaltyMultiplier).toBe(1);
    expect(second.showLesson).toBe(false);

    expect(resolveEncounter("ev-speed-limit", 2).penaltyMultiplier).toBe(1.5);
    expect(resolveEncounter("ev-speed-limit", 3).penaltyMultiplier).toBe(2);
  });

  it("caps the escalating penalty", () => {
    expect(resolveEncounter("ev-speed-limit", 10).penaltyMultiplier).toBe(2);
    expect(resolveEncounter("ev-speed-limit", 100).penaltyMultiplier).toBe(2);
  });

  it("grades always-grade events from the first encounter", () => {
    // ev-sign-prohibitory (wrong-way) is safety-critical → always graded.
    const first = resolveEncounter("ev-sign-prohibitory", 0);
    expect(first.mode).toBe("grade");
    expect(first.penaltyMultiplier).toBe(1);
    expect(first.showLesson).toBe(true); // still teach the lesson the first time
    expect(resolveEncounter("ev-sign-prohibitory", 1).penaltyMultiplier).toBe(1.5);
  });

  it("never penalises learn-only events", () => {
    const o = resolveEncounter("ev-collision", 5);
    expect(o.mode).toBe("learn");
    expect(o.penaltyMultiplier).toBe(0);
    expect(o.showLesson).toBe(true);
  });

  it("honours a per-lesson policy override", () => {
    const forced = resolveEncounter("ev-speed-limit", 0, "always-grade");
    expect(forced.mode).toBe("grade");
    expect(forced.penaltyMultiplier).toBe(1);
  });

  it("defaults unknown events to teach-first-then-grade", () => {
    expect(resolveEncounter("ev-unknown-xyz", 0).mode).toBe("teach");
    expect(resolveEncounter("ev-unknown-xyz", 1).mode).toBe("grade");
  });

  it("records encounters immutably", () => {
    const a = {};
    const b = recordEncounter(a, "ev-speed-limit");
    const c = recordEncounter(b, "ev-speed-limit");
    expect(a).toEqual({});
    expect(b).toEqual({ "ev-speed-limit": 1 });
    expect(c).toEqual({ "ev-speed-limit": 2 });
  });
});

describe("A12 severity policy floor (policyForViolation)", () => {
  it("unmapped второстепенни get the explicit teach-first default, not a fallback accident", () => {
    expect(policyForViolation("vtorostepenna", false, undefined)).toBe(
      VTOROSTEPENNA_DEFAULT_POLICY,
    );
    expect(VTOROSTEPENNA_DEFAULT_POLICY).toBe("teach-first-then-grade");
  });

  it("второстепенна mapped to an always-grade scenario STILL warns once (regardless of mapping)", () => {
    // No 1-point slip is a safety floor — even if its scenario event is ever
    // marked always-grade, the driver gets one warning toast first.
    expect(policyForViolation("vtorostepenna", false, "always-grade")).toBe(
      "teach-first-then-grade",
    );
  });

  it("a learn-only mapping stays learn-only (more lenient than warn-once)", () => {
    expect(policyForViolation("vtorostepenna", false, "learn-only")).toBeUndefined();
  });

  it("основна defers to the scenario mapping (behaviour unchanged)", () => {
    expect(policyForViolation("osnovna", false, undefined)).toBeUndefined();
    expect(policyForViolation("osnovna", false, "always-grade")).toBeUndefined();
  });

  it("опасна and session-terminating always grade (safety floor beats everything)", () => {
    expect(policyForViolation("opasna", false, undefined)).toBe("always-grade");
    expect(policyForViolation("opasna", false, "learn-only")).toBe("always-grade");
    expect(policyForViolation("vtorostepenna", true, "learn-only")).toBe("always-grade");
  });
});
