import { describe, expect, it } from "vitest";
import { applyPreDriveAction, createPreDriveMachine } from "../../procedures/machine";
import type { PreDriveStepId } from "../../procedures/types";
import { makeCommendation, makeViolation } from "../catalog";
import { buildSessionSummary } from "../summary";
import { isScorableEvent, type ScorableEvent } from "../types";

describe("buildSessionSummary", () => {
  it("splits mistakes and commendations, sorted chronologically", () => {
    const summary = buildSessionSummary([
      makeViolation("HANDBRAKE_LEFT_ON", 12),
      makeCommendation("FULL_STOP_AT_STOP_SIGN", 5),
      makeViolation("TURN_WITHOUT_INDICATOR", 3),
    ]);
    expect(summary.mistakes.map((m) => m.t)).toEqual([3, 12]);
    expect(summary.commendations.map((c) => c.code)).toEqual(["FULL_STOP_AT_STOP_SIGN"]);
    expect(summary.score.totalPoints).toBe(4);
    expect(summary.passed).toBe(true);
    expect(summary.failReasons).toEqual([]);
    expect(summary.terminated).toBe(false);
  });

  it("a clean session passes with zero points", () => {
    const summary = buildSessionSummary([makeCommendation("SAFE_LANE_CHANGE", 1)]);
    expect(summary.passed).toBe(true);
    expect(summary.mistakes).toEqual([]);
    expect(summary.conceptIds).toEqual([]);
  });

  it("an опасна mistake reports both the instant-fail and the points overflow", () => {
    const summary = buildSessionSummary([makeViolation("RED_LIGHT_CROSSED", 4)]);
    expect(summary.passed).toBe(false);
    expect(summary.failReasons).toContain("dangerous-mistake");
    expect(summary.failReasons).toContain("total-points-exceeded");
  });

  it("reports the основни cap as a distinct fail reason", () => {
    const summary = buildSessionSummary([
      makeViolation("SEATBELT_OFF_WHILE_MOVING", 1),
      makeViolation("TURN_WITHOUT_INDICATOR", 2),
      makeViolation("LANE_CHANGE_WITHOUT_INDICATOR", 3), // 9 т. основни: <= 9 total
    ]);
    expect(summary.score.totalPoints).toBe(9);
    expect(summary.failReasons).toEqual(["osnovni-points-exceeded"]);
    expect(summary.passed).toBe(false);
  });

  it("terminated is set exactly when a collision occurred", () => {
    const clean = buildSessionSummary([makeViolation("RED_LIGHT_CROSSED", 1)]);
    expect(clean.terminated).toBe(false);
    const crashed = buildSessionSummary([makeViolation("COLLISION", 9)]);
    expect(crashed.terminated).toBe(true);
  });

  it("collects unique concept ids from mistakes only, in first-occurrence order", () => {
    const summary = buildSessionSummary([
      makeViolation("SPEEDING_OVER_LIMIT", 1), // c-speed-limits
      makeViolation("SPEEDING_DANGEROUS", 5), // c-speed-limits (duplicate)
      makeViolation("SEATBELT_OFF_WHILE_MOVING", 7), // c-seatbelts
      makeCommendation("PEDESTRIAN_YIELDED", 8), // commendation concept NOT included
    ]);
    expect(summary.conceptIds).toEqual(["c-speed-limits", "c-seatbelts"]);
  });

  it("integrates pre-drive procedure events with driving events (full session)", () => {
    // pre-drive: everything right except the seatbelt
    const order: PreDriveStepId[] = [
      "adjust-seat",
      "adjust-mirrors",
      "check-surroundings",
      "check-dashboard",
      "start-engine",
      "press-brake",
      "select-gear",
      "release-handbrake",
      "final-mirror-check",
      "signal",
      "move-off",
    ];
    let machine = createPreDriveMachine({ isNight: false });
    const procedureEvents: ScorableEvent[] = [];
    order.forEach((stepId, i) => {
      const r = applyPreDriveAction(machine, stepId, i + 1);
      machine = r.machine;
      procedureEvents.push(...r.events.filter(isScorableEvent));
    });

    const summary = buildSessionSummary([
      ...procedureEvents, // PREDRIVE_SEATBELT_SKIPPED: основна, 3 т.
      makeViolation("RED_LIGHT_CROSSED", 40), // опасна, 10 т.
      makeViolation("SPEEDING_OVER_LIMIT", 55), // второстепенна, 1 т.
    ]);

    expect(summary.score.totalPoints).toBe(14);
    expect(summary.score.osnovniPoints).toBe(3);
    expect(summary.passed).toBe(false);
    expect(summary.failReasons).toEqual(["dangerous-mistake", "total-points-exceeded"]);
    expect(summary.conceptIds).toEqual([
      "c-seatbelts",
      "c-traffic-light-signals",
      "c-speed-limits",
    ]);
    expect(summary.terminated).toBe(false);
  });
});
