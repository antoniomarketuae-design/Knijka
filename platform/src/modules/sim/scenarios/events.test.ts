import { describe, expect, it } from "vitest";
import {
  SCENARIO_EVENTS,
  SCENARIO_ROADMAP,
  SCENARIO_TOTALS,
  getScenarioEvent,
  liveScenarioEvents,
} from "./events";
import type { GradingPolicy, SafetyWeight, ScenarioStatus } from "./types";

const POLICIES: GradingPolicy[] = ["teach-first-then-grade", "always-grade", "learn-only"];
const STATUSES: ScenarioStatus[] = ["built", "partial", "new"];
const SAFETY: SafetyWeight[] = ["critical", "high", "medium", "low"];

describe("scenario event registry", () => {
  it("loads the full library (45 events, unique ids)", () => {
    expect(SCENARIO_EVENTS.length).toBe(45);
    const ids = new Set(SCENARIO_EVENTS.map((e) => e.id));
    expect(ids.size).toBe(SCENARIO_EVENTS.length);
    expect(SCENARIO_TOTALS.eventCount).toBe(45);
    expect(SCENARIO_TOTALS.questionsCovered).toBe(585);
  });

  it("every event is well-formed", () => {
    for (const e of SCENARIO_EVENTS) {
      expect(e.id, e.id).toMatch(/^ev-[a-z-]+$/);
      expect(e.name.length, e.id).toBeGreaterThan(0);
      expect(e.feedback.length, e.id).toBeGreaterThan(0);
      expect(e.success.length, e.id).toBeGreaterThan(0);
      expect(POLICIES, e.id).toContain(e.policyDefault);
      expect(STATUSES, e.id).toContain(e.status);
      expect(SAFETY, e.id).toContain(e.safety);
      expect(e.examPointsCovered, e.id).toBeGreaterThan(0);
      expect(Array.isArray(e.worldPrimitives), e.id).toBe(true);
    }
  });

  it("is ordered by exam-point coverage, highest first", () => {
    for (let i = 1; i < SCENARIO_EVENTS.length; i++) {
      expect(SCENARIO_EVENTS[i - 1]!.examPointsCovered).toBeGreaterThanOrEqual(
        SCENARIO_EVENTS[i]!.examPointsCovered,
      );
    }
  });

  it("getScenarioEvent looks up by id", () => {
    expect(getScenarioEvent("ev-speed-limit")?.status).toBe("built");
    expect(getScenarioEvent("does-not-exist")).toBeUndefined();
  });

  it("exposes the already-built events as live", () => {
    const live = new Set(liveScenarioEvents().map((e) => e.id));
    for (const id of ["ev-speed-limit", "ev-stop-sign", "ev-seatbelt", "ev-collision"]) {
      expect(live, id).toContain(id);
    }
  });

  it("has a phased build roadmap", () => {
    expect(SCENARIO_ROADMAP.length).toBeGreaterThanOrEqual(3);
    expect(SCENARIO_ROADMAP[0]!.events.length).toBeGreaterThan(0);
  });

  // The examiner's legal corrections must be baked into the shipped library.
  it("carries the corrected law citations", () => {
    expect(getScenarioEvent("ev-roundabout")?.lawRef).toContain("50а");
    expect(getScenarioEvent("ev-bus-pullout")?.lawRef).toContain("67");
    const cyclist = getScenarioEvent("ev-cyclist")!;
    expect(cyclist.lawRef).toContain("42");
    expect(cyclist.lawRef).not.toContain("чл. 40");
    expect(getScenarioEvent("ev-uturn-reverse")?.lawRef).toContain("38");
    expect(getScenarioEvent("ev-lights-usage")?.lawRef).toContain("74");
    expect(getScenarioEvent("ev-zone-regime")?.lawRef).toContain("62");
  });
});
