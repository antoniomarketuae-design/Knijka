import { describe, expect, it } from "vitest";
import { recordEncounter, resolveEncounter } from "./policy";

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
