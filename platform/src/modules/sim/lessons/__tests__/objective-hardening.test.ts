/**
 * A10 objective hardening — ENGINE-LEVEL tests: the ctx hookup
 * (stagedOutcomes → objective, run-wide reds tally), detail propagation into
 * ObjectiveProgress / LessonResult, and the shipped-spec invariants that keep
 * specs.ts and the hardened parser in sync. Evaluator-level behavior lives in
 * objectives.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { LessonSpec, StagedEventOutcome } from "../../contracts";
import {
  applyStagedOutcome,
  applyTick,
  buildLessonResult,
  createLessonSession,
} from "../engine";
import { parseObjectiveParams } from "../objectives";
import { LESSONS, lessonById } from "../specs";
import type { LessonSessionState } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

// ---------------------------------------------------------------------------
// Shipped-spec invariants
// ---------------------------------------------------------------------------

describe("shipped lesson specs parse under the hardened evaluators", () => {
  it("every objective of every lesson parses", () => {
    for (const lesson of LESSONS) {
      for (const objective of lesson.objectives) {
        expect(() => parseObjectiveParams(objective)).not.toThrow();
      }
    }
  });

  it("L5's emergency stop is locked to a staged event that exists on the lesson", () => {
    const l5 = lessonById("l5-emergency-braking")!;
    const stop = l5.objectives.find((o) => o.id === "l5-emergency-stop")!;
    const params = parseObjectiveParams(stop);
    if (params.kind !== "completeManeuver" || params.maneuver !== "emergencyStop") {
      throw new Error("expected the emergencyStop maneuver");
    }
    expect(l5.stagedEvents?.some((e) => e.id === params.stagedEventId)).toBe(true);
  });

  it("L7's graded bay is the SAME rect the world paints (single source)", () => {
    const l7 = lessonById("l7-parking")!;
    const park = l7.objectives.find((o) => o.id === "l7-park")!;
    const params = parseObjectiveParams(park);
    if (params.kind !== "completeManeuver" || params.maneuver !== "parkInBay") {
      throw new Error("expected the parkInBay maneuver");
    }
    expect(params.bay).toEqual(l7.parkingBay);
  });

  it("L2's final light carries the requireRedMet gate; the earlier ones stay plain", () => {
    const l2 = lessonById("l2-intersections")!;
    const parsedById = new Map(
      l2.objectives.map((o) => [o.id, parseObjectiveParams(o)] as const),
    );
    const last = parsedById.get("l2-signal-2");
    expect(last).toMatchObject({ kind: "passSignal", requireRedMet: true });
    expect(parsedById.get("l2-signal-1")).not.toMatchObject({ requireRedMet: true });
    expect(parsedById.get("l2-stop-sign")).not.toMatchObject({ requireRedMet: true });
  });
});

// ---------------------------------------------------------------------------
// Engine hookup: applyStagedOutcome → ObjectiveContext → objective
// ---------------------------------------------------------------------------

const stopLesson: LessonSpec = {
  id: "t-emergency",
  order: 99,
  titleBg: "Тест аварийно",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [
    {
      id: "t-stop",
      titleBg: "Спри аварийно",
      kind: "completeManeuver",
      params: { maneuver: "emergencyStop", stagedEventId: "ev-lead" },
    },
  ],
};

const leadOutcome = (over: Partial<StagedEventOutcome> = {}): StagedEventOutcome => ({
  eventId: "ev-lead",
  kind: "brakingLeadCar",
  success: true,
  detail: "stoppedInTime",
  tSec: 9,
  reactionTimeSec: 0.7,
  stopGapM: 3.1,
  approachSpeedKmh: 47,
  ...over,
});

describe("stimulus-locked emergency stop through the engine (A10)", () => {
  it("a stimulus-free hard stop leaves the objective open (D4 cheat closed end-to-end)", () => {
    let s = createLessonSession(stopLesson);
    // The old completing profile: 45 km/h → 0 in 1 s.
    s = applyTick(s, makeTick({ t: 1, speedKmh: 45 })).state;
    s = applyTick(s, makeTick({ t: 2, speedKmh: 0 })).state;
    expect(s.phase).toBe("driving");
    expect(s.objectives[0].status).toBe("active");
    expect(s.objectives[0].detail).toMatchObject({ kind: "emergencyStop", outcome: "pending" });
  });

  it("completes from the recorded outcome on the next tick, detail into the result", () => {
    let s = createLessonSession(stopLesson);
    s = applyTick(s, makeTick({ t: 1, speedKmh: 45 })).state;
    s = applyStagedOutcome(s, leadOutcome());
    const r = applyTick(s, makeTick({ t: 9.5, speedKmh: 0 }));
    expect(r.state.phase).toBe("completed");
    expect(r.hudEvents).toContainEqual({ kind: "objectiveComplete", titleBg: "Спри аварийно" });

    const result = buildLessonResult(r.state);
    expect(result.completedAll).toBe(true);
    expect(result.objectives[0].detail).toMatchObject({
      kind: "emergencyStop",
      outcome: "stoppedInTime",
      reactionTimeSec: 0.7,
      band: "otlichen",
      stopGapM: 3.1,
    });
  });

  it("a failed outcome (hitLeadCar) keeps the objective open and cites the failure", () => {
    let s = createLessonSession(stopLesson);
    s = applyStagedOutcome(s, leadOutcome({ success: false, detail: "hitLeadCar", stopGapM: 0 }));
    s = applyTick(s, makeTick({ t: 10, speedKmh: 0 })).state;
    expect(s.phase).toBe("driving");
    expect(s.objectives[0].detail).toMatchObject({ kind: "emergencyStop", outcome: "hitLeadCar" });

    const result = buildLessonResult(s);
    expect(result.completedAll).toBe(false);
  });

  it("an outcome earned BEFORE the objective activates still counts when it does", () => {
    const twoStep: LessonSpec = {
      ...stopLesson,
      id: "t-emergency-2",
      objectives: [
        {
          id: "t-dist",
          titleBg: "Набери скорост",
          kind: "driveDistance",
          params: { meters: 100 },
        },
        ...stopLesson.objectives,
      ],
    };
    let s = createLessonSession(twoStep);
    // The staged encounter resolves at 70 m driven — before the odometer goal.
    s = applyTick(s, makeTick({ t: 1, position: { x: 0, y: 0 }, speedKmh: 50 })).state;
    s = applyTick(s, makeTick({ t: 2, position: { x: 40, y: 0 }, speedKmh: 50 })).state;
    s = applyStagedOutcome(s, leadOutcome());
    s = applyTick(s, makeTick({ t: 3, position: { x: 70, y: 0 }, speedKmh: 20 })).state;
    expect(s.objectives[0].status).toBe("active"); // 70 m < 100 m
    // Crossing 100 m completes the odometer AND the armed stop on one frame.
    s = applyTick(s, makeTick({ t: 4, position: { x: 110, y: 0 }, speedKmh: 30 })).state;
    expect(s.objectives[0].status).toBe("done");
    expect(s.objectives[1].status).toBe("done");
    expect(s.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Run-wide reds tally across sequential signal objectives
// ---------------------------------------------------------------------------

const signalsLesson: LessonSpec = {
  id: "t-signals",
  order: 99,
  titleBg: "Тест светофари",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [
    {
      id: "t-sig-1",
      titleBg: "Първи светофар",
      kind: "passSignal",
      params: { nodeId: "n1", x: 0, y: 100, radiusM: 30, control: "trafficLight" },
    },
    {
      id: "t-sig-2",
      titleBg: "Втори светофар",
      kind: "passSignal",
      params: {
        nodeId: "n2",
        x: 0,
        y: 300,
        radiusM: 30,
        control: "trafficLight",
        requireRedMet: true,
      },
    },
  ],
};

const crossAt = (t: number, y: number, lightState: "red" | "green", speedKmh = 25) =>
  tickWithEvents(t, [{ kind: "stopLineCrossed", control: "trafficLight", lightState }], {
    position: { x: 0, y },
    speedKmh,
  });

describe("L2-style met-red gate through the engine (A10)", () => {
  it("D4 cheat path: a greens-only run leaves the final signal objective open", () => {
    let s = createLessonSession(signalsLesson);
    s = applyTick(s, crossAt(1, 100, "green")).state; // luck: green, no stop
    expect(s.objectives[0].status).toBe("done"); // plain objective — progression
    s = applyTick(s, crossAt(2, 300, "green")).state; // luck again
    expect(s.objectives[1].status).toBe("active"); // gate unmet — stays open
    expect(s.phase).toBe("driving");
    expect(buildLessonResult(s).completedAll).toBe(false);

    // Recovery is always feasible (SIGNAL_TIMING: red 26 s of every 50 s):
    // stop at the line, wait the red out, cross on the next green.
    s = applyTick(s, makeTick({ t: 30, position: { x: 0, y: 295 }, speedKmh: 0 })).state;
    s = applyTick(s, crossAt(60, 300, "green")).state;
    expect(s.objectives[1].status).toBe("done");
    expect(s.phase).toBe("completed");
  });

  it("a red met at an EARLIER junction satisfies the later gate (reds tally is run-wide)", () => {
    let s: LessonSessionState = createLessonSession(signalsLesson);
    // Junction 1: stopped at the red, proceeded on green — the drilled sequence.
    s = applyTick(s, makeTick({ t: 1, position: { x: 0, y: 95 }, speedKmh: 0 })).state;
    s = applyTick(s, crossAt(20, 100, "green")).state;
    expect(s.objectives[0].status).toBe("done");
    expect(s.objectives[0].detail).toMatchObject({ kind: "passSignal", redMetHere: true });
    // Junction 2: green, no stop — fine, the run already met its red.
    s = applyTick(s, crossAt(40, 300, "green")).state;
    expect(s.objectives[1].status).toBe("done");
    expect(s.phase).toBe("completed");
  });

  it("running a red counts as met (progression) while the rule engine grades it", () => {
    let s = createLessonSession(signalsLesson);
    const r1 = applyTick(s, crossAt(1, 100, "red", 30));
    s = r1.state;
    // Objective done AND the 10-point опасна graded — two separate questions.
    expect(s.objectives[0].status).toBe("done");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED")).toBe(true);
    s = applyTick(s, crossAt(2, 300, "green")).state;
    expect(s.objectives[1].status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Park detail propagation
// ---------------------------------------------------------------------------

describe("park attempts/alignment surface in progress and result (A10)", () => {
  const parkLesson: LessonSpec = {
    id: "t-park",
    order: 99,
    titleBg: "Тест паркиране",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      {
        id: "t-bay",
        titleBg: "Паркирай",
        kind: "completeManeuver",
        params: {
          maneuver: "parkInBay",
          holdSec: 1.5,
          bay: { x: 0, y: 0, headingDeg: 0, widthM: 3, lengthM: 6.6 },
        },
      },
    ],
  };

  it("counts attempts across bay entries and reports final alignment in the result", () => {
    let s = createLessonSession(parkLesson);
    const tick = (t: number, x: number, y: number, speedKmh: number, gear: number) =>
      makeTick({ t, position: { x, y }, headingDeg: 0, speedKmh, gear });

    s = applyTick(s, tick(0, 0, 8, 10, 1)).state; // approach
    s = applyTick(s, tick(1, 0, 2, 5, -1)).state; // attempt 1 (reversed in)
    s = applyTick(s, tick(2, 0, 8, 10, 1)).state; // pulled out
    expect(s.objectives[0].detail).toMatchObject({ kind: "parkInBay", attempts: 1 });

    s = applyTick(s, tick(3, 0.2, 2, 5, -1)).state; // attempt 2
    s = applyTick(s, tick(4, 0.1, 0.1, 0, -1)).state; // at rest, centred
    s = applyTick(s, tick(6, 0.1, 0.1, 0, 0)).state; // held ≥ 1.5 s → done
    expect(s.phase).toBe("completed");

    const result = buildLessonResult(s);
    expect(result.objectives[0].done).toBe(true);
    expect(result.objectives[0].detail).toMatchObject({
      kind: "parkInBay",
      attempts: 2,
      inBay: true,
      alignment: "centered",
    });
  });
});
