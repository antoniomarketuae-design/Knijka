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

// ---------------------------------------------------------------------------
// THE BOUNDARY THIS FILE MUST NOT BE "FIXED" ACROSS (sweep161,
// `sc-follow-cutin/mobile-wrong/08-debrief.png`).
//
// The audit filed a debrief reading „0 наказателни точки · 0 опасни · 0
// основни" on a drive that did 59 in a posted 50 and drew a «Превишена
// скорост» card, suspect-file `rules/summary.ts`. The card was a TEACH moment
// — first-encounter policy, `teach-first-then-grade` — so it never entered the
// scored stream, and 0 is the honest total of what this reducer was handed.
//
// The pull that creates is obvious and wrong: make the number stop lying by
// folding teach moments into `mistakes`. That charges a seventeen-year-old for
// a rule nobody has taught him yet, which is the exact trust failure A12 exists
// to prevent — a false certificate repaired with a false conviction. The
// truthful repair is downstream, on the debrief's own unscored channel
// (`lessons/debrief.ts DebriefContext.coachedMistakes`), which is written and
// tested and which no production caller feeds; see the ruling in summary.ts.
//
// So these pin the contract in BOTH directions: everything scored is counted,
// and nothing unscored is — including the specific code that was photographed.
// ---------------------------------------------------------------------------
describe("the scored/taught boundary", () => {
  it("a drive whose ONLY fault was taught summarises to a clean sheet", () => {
    // What the reducer sees when the engine routed the speeding to the teach
    // arm: literally nothing. The debrief cannot learn about it from here, and
    // that is the fact the caller has to make up for.
    const summary = buildSessionSummary([]);
    expect(summary.score.totalPoints).toBe(0);
    expect(summary.mistakes).toEqual([]);
    expect(summary.conceptIds).toEqual([]);
    expect(summary.passed).toBe(true);
  });

  it("NON-VACUITY: the same code, once SCORED, is counted in full", () => {
    // The other direction — without this the test above is satisfied by a
    // reducer that counts nothing at all.
    const summary = buildSessionSummary([makeViolation("SPEEDING_OVER_LIMIT", 12)]);
    expect(summary.mistakes.map((m) => m.code)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(summary.score.totalPoints).toBeGreaterThan(0);
    expect(summary.conceptIds).toEqual(["c-speed-limits"]);
  });

  it("every scored violation reaches the score — the reducer drops nothing", () => {
    // The guard against closing the finding by filtering here instead. If a
    // „teach-like" exclusion is ever added to this loop, a charged code stops
    // being charged and the sheet under-reports a real fault.
    const events: ScorableEvent[] = [
      makeViolation("SPEEDING_OVER_LIMIT", 5),
      makeViolation("TURN_WITHOUT_INDICATOR", 9),
      makeViolation("RED_LIGHT_CROSSED", 14),
    ];
    const summary = buildSessionSummary(events);
    expect(summary.mistakes).toHaveLength(3);
    expect(summary.score.totalPoints).toBe(
      events.reduce((n, e) => n + (e.kind === "violation" ? e.points : 0), 0),
    );
  });
});
