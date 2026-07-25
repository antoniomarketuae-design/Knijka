import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { PRE_DRIVE_STEP_ORDER } from "../../procedures";
import {
  abortSession,
  applyPreDriveStep,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
  isDriveLocked,
} from "../engine";
import { lessonById } from "../specs";
import type { LessonSessionState } from "../types";
import { createStubWorldRuntime, makeTick, tickWithEvents } from "./fixtures";

/** Minimal controllable lesson: 20 m odometer, then a zone at x=100. */
const microLesson: LessonSpec = {
  id: "t-micro",
  order: 99,
  titleBg: "Микроурок",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-dist", titleBg: "Измини 20 метра", kind: "driveDistance", params: { meters: 20 } },
    { id: "o-zone", titleBg: "Стигни зоната", kind: "reachZone", params: { x: 100, y: 0, radiusM: 10 } },
  ],
};

function driveEastwards(state: LessonSessionState, fromT: number, positions: number[]) {
  let s = state;
  const hud: HudEvent[] = [];
  let t = fromT;
  for (const x of positions) {
    const r = applyTick(s, makeTick({ t: t++, speedKmh: 36, position: { x, y: 0 } }));
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return { state: s, hudEvents: hud };
}

describe("lesson lifecycle without pre-drive", () => {
  it("starts in the driving phase and completes objectives in order", () => {
    let s = createLessonSession(microLesson);
    expect(s.phase).toBe("driving");
    expect(s.objectives[0].status).toBe("active");
    expect(s.objectives[1].status).toBe("pending");

    // 10 m steps: odometer objective (20 m) completes on the 3rd frame.
    const r1 = driveEastwards(s, 0, [0, 10, 20]);
    s = r1.state;
    expect(s.objectives[0].status).toBe("done");
    expect(s.objectives[1].status).toBe("active");
    expect(r1.hudEvents).toContainEqual({
      kind: "objectiveComplete",
      titleBg: "Измини 20 метра",
    });
    expect(s.phase).toBe("driving");

    // Reach the zone => last objective done => session completes itself.
    const r2 = driveEastwards(s, 3, [50, 95]);
    s = r2.state;
    expect(s.phase).toBe("completed");
    expect(s.endedAtSec).not.toBeNull();

    const result = buildLessonResult(s);
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
  });

  it("accumulates rule-engine violations and maps them to HUD toasts", () => {
    let s = createLessonSession(microLesson);
    const r = applyTick(
      s,
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    );
    s = r.state;

    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ kind: "violation", code: "RED_LIGHT_CROSSED" });
    expect(r.hudEvents[0]).toMatchObject({
      kind: "violation",
      severity: "opasna",
      points: 10,
      lawRef: "ППЗДвП чл. 31",
    });
    // QW7: the violation toast must carry the catalog's authored WHY — the
    // law-cited explanation is the teaching moment, not just the title.
    const hudViolation = r.hudEvents[0];
    if (hudViolation.kind !== "violation") throw new Error("expected a violation hud event");
    expect(hudViolation.explanationBg.length).toBeGreaterThan(10);

    const result = buildLessonResult(finishSession(s, 2));
    expect(result.passed).toBe(false);
    expect(result.summary.failReasons).toContain("dangerous-mistake");
  });

  it("grades a collision as a terminated session", () => {
    let s = createLessonSession(microLesson);
    s = applyTick(s, tickWithEvents(1, [{ kind: "collision", withWhat: "staticObject" }])).state;
    const result = buildLessonResult(finishSession(s, 2));
    expect(result.summary.terminated).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("ignores ticks after completion and abort", () => {
    let s = createLessonSession(microLesson);
    s = abortSession(s, 5);
    expect(s.phase).toBe("aborted");
    const after = applyTick(s, makeTick({ t: 6, speedKmh: 200, maxSpeedKmh: 50 }));
    expect(after.state).toBe(s);
    expect(after.hudEvents).toHaveLength(0);

    const result = buildLessonResult(s);
    expect(result.aborted).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe("teach-first-then-grade coaching", () => {
  const speeding = (t: number) => makeTick({ t, speedKmh: 56 }); // 56 in a 50 zone → minor

  it("teaches a first minor mistake as a PAUSE card (not scored), then grades the repeat", () => {
    let s = createLessonSession(microLesson);
    const hud1: HudEvent[] = [];
    const taught = [];
    for (const t of [0, 1, 2, 3]) {
      const r = applyTick(s, speeding(t));
      s = r.state;
      hud1.push(...r.hudEvents);
      taught.push(...(r.teachMoments ?? []));
    }
    // First episode → taught: a teach-moment PAUSE card (A9) — no drive-by
    // lesson toast, no violation, nothing scored.
    expect(taught).toHaveLength(1);
    expect(taught[0]).toMatchObject({
      code: "SPEEDING_OVER_LIMIT",
      scenarioId: "ev-speed-limit",
      severity: "vtorostepenna",
      points: 1,
    });
    expect(taught[0].explanationBg.length).toBeGreaterThan(10);
    expect(hud1.some((e) => e.kind === "lesson")).toBe(false);
    expect(hud1.some((e) => e.kind === "violation")).toBe(false);
    expect(s.events.some((e) => e.kind === "violation")).toBe(false);

    // End the episode, then speed again → now graded. M-16: the episode
    // re-arms only after the limit has been HELD for speedingRearmSec, so the
    // legal stretch has to be a real one — a one-frame dip is the same
    // offence being corrected, not a second encounter.
    for (const t of [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]) {
      s = applyTick(s, makeTick({ t, speedKmh: 40 })).state;
    }
    const hud2: HudEvent[] = [];
    for (const t of [9, 10, 11, 12]) {
      const r = applyTick(s, speeding(t));
      s = r.state;
      hud2.push(...r.hudEvents);
      taught.push(...(r.teachMoments ?? []));
    }
    expect(taught).toHaveLength(1); // teach moment fires ONCE per scenario
    expect(hud2.some((e) => e.kind === "violation")).toBe(true);
    expect(
      s.events.some((e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT"),
    ).toBe(true);
  });

  it("grades a dangerous mistake from the very first encounter (safety floor)", () => {
    const s = createLessonSession(microLesson);
    const r = applyTick(
      s,
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    );
    expect(r.hudEvents.some((e) => e.kind === "violation" && e.severity === "opasna")).toBe(true);
    expect(
      r.state.events.some((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED"),
    ).toBe(true);
    // A9 safety floor: опасна never pauses mid-drive — the student may be
    // mid-evasive-maneuver; it keeps the non-blocking toast.
    expect(r.teachMoments ?? []).toHaveLength(0);
  });
});

describe("lesson lifecycle with pre-drive (L1 spec)", () => {
  const l1 = lessonById("l1-preparation")!;

  it("runs the 13-step machine, then unlocks driving", () => {
    let s = createLessonSession(l1);
    expect(s.phase).toBe("preDrive");
    expect(s.preDrive).not.toBeNull();

    // Ticks are reduced (law applies) but objectives do not advance yet.
    s = applyTick(s, makeTick({ t: 0.5, position: { x: 0, y: 0 } })).state;
    expect(s.objectives[0].progress).toBe(0);

    const hud: HudEvent[] = [];
    let t = 1;
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      const r = applyPreDriveStep(s, stepId, t++);
      s = r.state;
      hud.push(...r.hudEvents);
    }

    expect(s.phase).toBe("driving");
    // Perfect run => commendation accumulated + procedure banner event.
    expect(s.events.some((e) => e.kind === "commendation" && e.code === "PREDRIVE_PERFECT")).toBe(true);
    expect(hud).toContainEqual({ kind: "objectiveComplete", titleBg: "Подготовка за потегляне" });
  });

  it("scores skipped steps and folds them into the final summary", () => {
    let s = createLessonSession(l1);
    // Student slams it into gear and drives off: only move-off performed.
    s = applyPreDriveStep(s, "move-off", 1).state;
    expect(s.phase).toBe("driving");

    const result = buildLessonResult(abortSession(s, 2));
    // Day lesson: 11 required steps skipped (headlights only required at night),
    // one of them the seatbelt (основна, 3 т.) => 10 × 1 + 3 = 13 points.
    expect(result.summary.score.totalPoints).toBe(13);
    expect(result.summary.score.osnovniPoints).toBe(3);
    expect(result.passed).toBe(false);
  });

  it("applyPreDriveStep is a no-op once driving", () => {
    const s = createLessonSession(microLesson); // preDrive: false
    const r = applyPreDriveStep(s, "adjust-seat", 1);
    expect(r.state).toBe(s);
    expect(r.hudEvents).toHaveLength(0);
  });
});

describe("drive lock during pre-drive (QW10)", () => {
  const l1 = lessonById("l1-preparation")!;

  it("locks the vehicle for the whole checklist and unlocks exactly at move-off", () => {
    let s = createLessonSession(l1);
    expect(isDriveLocked(s)).toBe(true);

    // Ticks may flow (rules run from second zero) — the lock must hold.
    s = applyTick(s, makeTick({ t: 0.5 })).state;
    expect(isDriveLocked(s)).toBe(true);

    let t = 1;
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      const lockedBefore = isDriveLocked(s);
      s = applyPreDriveStep(s, stepId, t++).state;
      if (stepId !== "move-off") {
        expect(lockedBefore).toBe(true);
        expect(isDriveLocked(s)).toBe(true);
      }
    }
    expect(s.phase).toBe("driving");
    expect(isDriveLocked(s)).toBe(false);
  });

  it("never locks lessons without a pre-drive procedure", () => {
    const s = createLessonSession(microLesson); // preDrive: false
    expect(isDriveLocked(s)).toBe(false);
    expect(isDriveLocked(applyTick(s, makeTick({ t: 1, speedKmh: 30 })).state)).toBe(false);
  });

  it("stays unlocked after the session ends", () => {
    let s = createLessonSession(l1);
    s = applyPreDriveStep(s, "move-off", 1).state; // skip everything → driving
    s = abortSession(s, 2);
    expect(isDriveLocked(s)).toBe(false);
  });
});

describe("free drive (L0 spec)", () => {
  const l0 = lessonById("l0-free-drive")!;

  it("has no objectives and passes on a clean manual finish", () => {
    let s = createLessonSession(l0);
    expect(s.phase).toBe("driving");

    s = applyTick(s, makeTick({ t: 1, speedKmh: 40 })).state;
    expect(s.phase).toBe("driving"); // zero objectives never auto-complete

    const result = buildLessonResult(finishSession(s, 60));
    expect(result.completedAll).toBe(true); // vacuously
    expect(result.passed).toBe(true);
    expect(result.durationSec).toBe(60);
  });
});

describe("stub WorldRuntime (contract fixture)", () => {
  it("produces rule-engine-ready ticks from vehicle samples", () => {
    const runtime = createStubWorldRuntime({ speedLimitKmh: 30 });
    const tick = runtime.sample(
      {
        position: { x: 5, y: 6 },
        headingDeg: 90,
        speedKmh: 25,
        indicator: "left",
        headlights: "low",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 2,
        mirrorGlance: null,
      },
      12.5,
      false,
    );
    expect(tick).toMatchObject({ t: 12.5, speedKmh: 25, maxSpeedKmh: 30, laneId: 0 });

    // And the lesson engine consumes them directly.
    let s = createLessonSession(microLesson);
    s = applyTick(s, tick).state;
    expect(s.lastT).toBe(12.5);
  });
});
