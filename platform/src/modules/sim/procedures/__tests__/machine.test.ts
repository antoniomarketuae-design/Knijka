import { describe, expect, it } from "vitest";
import type { ViolationEvent } from "../../rules/types";
import { applyPreDriveAction, createPreDriveMachine, type PreDriveMachine } from "../machine";
import { PRE_DRIVE_STEP_ORDER, PRE_DRIVE_STEPS } from "../steps";
import type {
  PreDriveEvent,
  PreDriveStepId,
  ProcedureCompletedEvent,
  StepCompletedEvent,
} from "../types";

// -- helpers -----------------------------------------------------------------

function runSteps(
  machine: PreDriveMachine,
  stepIds: PreDriveStepId[],
  t0 = 1,
): { machine: PreDriveMachine; events: PreDriveEvent[] } {
  const events: PreDriveEvent[] = [];
  let m = machine;
  stepIds.forEach((stepId, i) => {
    const r = applyPreDriveAction(m, stepId, t0 + i);
    m = r.machine;
    events.push(...r.events);
  });
  return { machine: m, events };
}

const violations = (events: PreDriveEvent[]): ViolationEvent[] =>
  events.filter((e): e is ViolationEvent => e.kind === "violation");

const result = (events: PreDriveEvent[]): ProcedureCompletedEvent["result"] => {
  const done = events.find((e): e is ProcedureCompletedEvent => e.kind === "procedureCompleted");
  if (!done) throw new Error("procedure did not complete");
  return done.result;
};

/** Canonical full day order (headlights are a night step). */
const PERFECT_DAY: PreDriveStepId[] = [
  "adjust-seat",
  "adjust-mirrors",
  "check-surroundings",
  "fasten-seatbelt",
  "check-dashboard",
  "start-engine",
  "press-brake",
  "select-gear",
  "release-handbrake",
  "final-mirror-check",
  "signal",
  "move-off",
];

const PERFECT_NIGHT: PreDriveStepId[] = [
  "adjust-seat",
  "adjust-mirrors",
  "check-surroundings",
  "fasten-seatbelt",
  "check-dashboard",
  "headlights-on",
  "start-engine",
  "press-brake",
  "select-gear",
  "release-handbrake",
  "final-mirror-check",
  "signal",
  "move-off",
];

// -- tests ---------------------------------------------------------------------

describe("pre-drive machine — perfect runs", () => {
  it("the canonical day order completes with zero violations and the perfect commendation", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), PERFECT_DAY);
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "PREDRIVE_PERFECT")).toBe(true);
    const r = result(events);
    expect(r.perfect).toBe(true);
    expect(r.penaltyPoints).toBe(0);
    expect(r.skippedStepIds).toEqual([]);
    expect(r.wrongOrderStepIds).toEqual([]);
    expect(r.completedStepIds).toEqual(PERFECT_DAY);
  });

  it("the canonical night order (with headlights) is also perfect", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: true }), PERFECT_NIGHT);
    expect(violations(events)).toEqual([]);
    expect(result(events).perfect).toBe(true);
  });

  it("seatbelt and mirrors are swappable (documented instructor flexibility)", () => {
    const swapped: PreDriveStepId[] = [
      "adjust-seat",
      "fasten-seatbelt", // belt before mirrors — accepted
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
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), swapped);
    expect(violations(events)).toEqual([]);
    expect(result(events).perfect).toBe(true);
  });

  it("every step emits a stepCompleted event with its Bulgarian title", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), PERFECT_DAY);
    const completed = events.filter((e): e is StepCompletedEvent => e.kind === "stepCompleted");
    expect(completed).toHaveLength(PERFECT_DAY.length);
    for (const e of completed) {
      expect(e.titleBg).toBe(PRE_DRIVE_STEPS[e.stepId].titleBg);
    }
  });
});

describe("pre-drive machine — skipped steps", () => {
  it("skipping the seatbelt is ОСНОВНА (3 т.), everything else stays clean", () => {
    const withoutBelt = PERFECT_DAY.filter((s) => s !== "fasten-seatbelt");
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), withoutBelt);
    const v = violations(events);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: "PREDRIVE_SEATBELT_SKIPPED",
      severityClass: "osnovna",
      points: 3,
      detail: "fasten-seatbelt",
      conceptId: "c-seatbelts",
    });
    const r = result(events);
    expect(r.skippedStepIds).toEqual(["fasten-seatbelt"]);
    expect(r.penaltyPoints).toBe(3);
    expect(r.perfect).toBe(false);
  });

  it("skipping ordinary steps is второстепенна (1 т.) each", () => {
    const shortRun = PERFECT_DAY.filter(
      (s) => s !== "check-surroundings" && s !== "check-dashboard",
    );
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), shortRun);
    const v = violations(events);
    expect(v).toHaveLength(2);
    for (const violation of v) {
      expect(violation.code).toBe("PREDRIVE_STEP_SKIPPED");
      expect(violation.points).toBe(1);
    }
    expect(result(events).skippedStepIds).toEqual(["check-surroundings", "check-dashboard"]);
    expect(result(events).penaltyPoints).toBe(2);
  });

  it("headlights are required at night…", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: true }), PERFECT_DAY);
    const v = violations(events);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: "PREDRIVE_STEP_SKIPPED", detail: "headlights-on" });
  });

  it("…but not during the day", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), PERFECT_DAY);
    expect(violations(events)).toEqual([]);
  });

  it("moving off immediately bills every required step: 1 основна + 10 второстепенни = 13 т.", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), ["move-off"]);
    const v = violations(events);
    expect(v).toHaveLength(11); // 12 day-required steps minus move-off itself
    const r = result(events);
    expect(r.penaltyPoints).toBe(13);
    expect(r.perfect).toBe(false);
    expect(r.skippedStepIds).toHaveLength(11);
    // no wrong-order double counting on the move-off itself
    expect(r.wrongOrderStepIds).toEqual([]);
  });
});

describe("pre-drive machine — wrong order", () => {
  it("mirrors before seat is второстепенна, immediately, and the step still counts", () => {
    const reordered: PreDriveStepId[] = [
      "adjust-mirrors", // before the seat — wrong order
      "adjust-seat",
      "check-surroundings",
      "fasten-seatbelt",
      "check-dashboard",
      "start-engine",
      "press-brake",
      "select-gear",
      "release-handbrake",
      "final-mirror-check",
      "signal",
      "move-off",
    ];
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), reordered);
    const v = violations(events);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: "PREDRIVE_WRONG_ORDER",
      severityClass: "vtorostepenna",
      points: 1,
      detail: "adjust-mirrors",
      t: 1, // emitted at the moment of the mistake, not at move-off
    });
    const r = result(events);
    expect(r.wrongOrderStepIds).toEqual(["adjust-mirrors"]);
    expect(r.skippedStepIds).toEqual([]); // done late != skipped (no double counting)
    expect(r.perfect).toBe(false);
    expect(r.penaltyPoints).toBe(1);
  });

  it("gear before brake breaks the driveaway chain", () => {
    const reordered = PERFECT_DAY.slice();
    const gi = reordered.indexOf("select-gear");
    const bi = reordered.indexOf("press-brake");
    [reordered[gi], reordered[bi]] = [reordered[bi], reordered[gi]];
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), reordered);
    const v = violations(events);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: "PREDRIVE_WRONG_ORDER", detail: "select-gear" });
  });

  it("releasing the handbrake before engaging a gear is wrong order (car can roll)", () => {
    const reordered = PERFECT_DAY.slice();
    const hi = reordered.indexOf("release-handbrake");
    const gi = reordered.indexOf("select-gear");
    [reordered[hi], reordered[gi]] = [reordered[gi], reordered[hi]];
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), reordered);
    expect(violations(events).map((v) => v.detail)).toEqual(["release-handbrake"]);
  });

  it("starting the engine before adjusting seat/mirrors is wrong order (belt is NOT required first — documented)", () => {
    const { events } = runSteps(createPreDriveMachine({ isNight: false }), [
      "start-engine", // nothing adjusted yet
      "adjust-seat",
      "adjust-mirrors",
      "fasten-seatbelt",
      "check-surroundings",
      "check-dashboard",
      "press-brake",
      "select-gear",
      "release-handbrake",
      "final-mirror-check",
      "signal",
      "move-off",
    ]);
    const v = violations(events);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: "PREDRIVE_WRONG_ORDER", detail: "start-engine" });
  });
});

describe("pre-drive machine — mechanics", () => {
  it("duplicate actions are idempotent no-ops", () => {
    const m0 = createPreDriveMachine({ isNight: false });
    const r1 = applyPreDriveAction(m0, "adjust-seat", 1);
    const r2 = applyPreDriveAction(r1.machine, "adjust-seat", 2);
    expect(r2.events).toEqual([]);
    expect(r2.machine).toBe(r1.machine);
  });

  it("actions after move-off are ignored", () => {
    const { machine } = runSteps(createPreDriveMachine({ isNight: false }), PERFECT_DAY);
    const r = applyPreDriveAction(machine, "signal", 99);
    expect(r.events).toEqual([]);
    expect(r.machine).toBe(machine);
  });

  it("applyPreDriveAction is pure — the previous machine is not mutated", () => {
    const m0 = createPreDriveMachine({ isNight: false });
    const snapshot = JSON.stringify(m0);
    applyPreDriveAction(m0, "adjust-mirrors", 1); // wrong order — would mutate if impure
    expect(JSON.stringify(m0)).toBe(snapshot);
  });

  it("PRE_DRIVE_STEP_ORDER covers every defined step exactly once", () => {
    const ids = Object.keys(PRE_DRIVE_STEPS).sort();
    expect([...PRE_DRIVE_STEP_ORDER].sort()).toEqual(ids);
    expect(new Set(PRE_DRIVE_STEP_ORDER).size).toBe(PRE_DRIVE_STEP_ORDER.length);
  });
});
