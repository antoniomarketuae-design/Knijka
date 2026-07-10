/**
 * A13 — exam session mode: always-grade + official termination.
 *
 * The exam bypasses the whole teach-first layer (doc 68 finding D6: a "pass"
 * built on coached first encounters is systematically easier than the real
 * exam) and restores the official protocol:
 *  - EVERY violation grades at catalog points from the first encounter — no
 *    teach moments, no warn-once, no ×1.5/×2.0 escalation;
 *  - the session TERMINATES the moment the official limits are crossed
 *    (any опасна / collision / > 9 total / > 6 from основни), pre-drive
 *    included — with the reason recorded for the examiner-style end framing;
 *  - the server grading path (wire) rederives the same termination from the
 *    rebuilt catalog events, never trusting the client.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { makeViolation } from "../../rules";
import { PRE_DRIVE_STEP_ORDER } from "../../procedures";
import { examTerminationFor } from "../exam";
import {
  applyPreDriveStep,
  applyTick,
  buildLessonResult,
  createLessonSession,
} from "../engine";
import { EXAM_LESSON } from "../specs";
import { gradeFinishWire } from "../wire";
import type { LessonSessionState, TeachMoment } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

/** Shared fixture base — one long objective so the phase stays driving. */
const baseLesson = {
  order: 99,
  titleBg: "Тест изпит",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [
    { id: "t-drive", titleBg: "Карай", kind: "driveDistance" as const, params: { meters: 100000 } },
  ],
};

/** Minimal exam-mode lesson. */
const examLesson: LessonSpec = { ...baseLesson, id: "t-exam", examMode: true };

/** The same lesson WITHOUT examMode — the teach-first control group. */
const trainingLesson: LessonSpec = { ...baseLesson, id: "t-training" };

function run(
  state: LessonSessionState,
  ticks: Parameters<typeof applyTick>[1][],
): { state: LessonSessionState; hud: HudEvent[]; taught: TeachMoment[] } {
  let s = state;
  const hud: HudEvent[] = [];
  const taught: TeachMoment[] = [];
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
    taught.push(...(r.teachMoments ?? []));
  }
  return { state: s, hud, taught };
}

/** One minor-speeding episode: 56 km/h in a 50 zone (fires at t0+2). */
function speedingEpisode(t0: number) {
  return [
    makeTick({ t: t0, speedKmh: 56 }),
    makeTick({ t: t0 + 1, speedKmh: 56 }),
    makeTick({ t: t0 + 2, speedKmh: 56 }),
    makeTick({ t: t0 + 3, speedKmh: 40 }), // back under the limit → re-arms
  ];
}

// ---------------------------------------------------------------------------
// Always-grade (coach OFF)
// ---------------------------------------------------------------------------

describe("exam mode grades every mistake from tick one", () => {
  it("a first второстепенна scores immediately — no teach moment, no lesson toast", () => {
    const r = run(createLessonSession(examLesson), speedingEpisode(0));
    expect(r.taught).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "lesson")).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "violation")).toHaveLength(1);
    expect(r.state.events).toHaveLength(1);
    expect(r.state.events[0]).toMatchObject({ code: "SPEEDING_OVER_LIMIT" });
    // Control: the SAME stream on a training lesson teaches instead.
    const c = run(createLessonSession(trainingLesson), speedingEpisode(0));
    expect(c.taught).toHaveLength(1);
    expect(c.state.events).toHaveLength(0);
  });

  it("repeats grade with NO escalation multiplier (training-only ladder)", () => {
    const r1 = run(createLessonSession(examLesson), speedingEpisode(0));
    const r2 = run(r1.state, speedingEpisode(60));
    const r3 = run(r2.state, speedingEpisode(120));
    expect(r3.state.events).toHaveLength(3);
    expect(r3.state.penaltyEscalations).toHaveLength(0);
    const result = buildLessonResult(r3.state);
    expect(result.score).toBe(3);
    expect(result.effectiveScore).toBe(3); // no ×1.5/×2.0 on exams
    expect(result.escalations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Termination fold (pure)
// ---------------------------------------------------------------------------

describe("examTerminationFor — the official limits", () => {
  // Catalog anchors (severity per rules/catalog.ts):
  //   SPEEDING_OVER_LIMIT второстепенна 1 т. · TURN_WITHOUT_INDICATOR
  //   основна 3 т. · RED_LIGHT_CROSSED опасна 10 т. · COLLISION опасна
  //   10 т. + terminateSession.
  const minor = (t: number) => makeViolation("SPEEDING_OVER_LIMIT", t);
  const major = (t: number) => makeViolation("TURN_WITHOUT_INDICATOR", t);

  it("stays null within the limits (9 total / 6 основни / no опасна)", () => {
    const nine = Array.from({ length: 9 }, (_, i) => minor(i));
    expect(examTerminationFor(nine)).toBeNull();
    expect(examTerminationFor([major(0), major(1), minor(2), minor(3), minor(4)])).toBeNull();
    expect(examTerminationFor([])).toBeNull();
  });

  it("> 9 total points terminates at the tripping event", () => {
    // 2 основни (6) + 4 второстепенни → 10 total while основни stay at 6.
    const events = [major(0), major(1), minor(2), minor(3), minor(4), minor(5)];
    expect(examTerminationFor(events)).toEqual({
      reason: "total-points-exceeded",
      tSec: 5,
    });
  });

  it("> 6 points from основни terminates even while the total is legal", () => {
    // 3 основни = 9 total (≤ 9) but 9 from основни (> 6).
    const events = [major(0), major(1), major(2)];
    expect(examTerminationFor(events)).toEqual({
      reason: "osnovni-points-exceeded",
      tSec: 2,
    });
  });

  it("any опасна terminates instantly; a collision names the collision", () => {
    expect(examTerminationFor([makeViolation("RED_LIGHT_CROSSED", 7)])).toEqual({
      reason: "dangerous-mistake",
      tSec: 7,
    });
    expect(examTerminationFor([makeViolation("COLLISION", 4)])).toEqual({
      reason: "collision",
      tSec: 4,
    });
  });
});

// ---------------------------------------------------------------------------
// Live termination through the session reducer
// ---------------------------------------------------------------------------

describe("exam sessions terminate live", () => {
  it("running a red ends the exam on the spot with the examiner reason", () => {
    const red = tickWithEvents(
      5,
      [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }],
      { speedKmh: 30 },
    );
    const r = run(createLessonSession(examLesson), [makeTick({ t: 1, speedKmh: 30 }), red]);
    expect(r.state.phase).toBe("completed");
    expect(r.state.examTermination).toEqual({ reason: "dangerous-mistake", tSec: 5 });
    expect(r.state.endedAtSec).toBe(5);

    const result = buildLessonResult(r.state);
    expect(result.examTermination).toEqual({ reason: "dangerous-mistake", tSec: 5 });
    expect(result.passed).toBe(false);

    // Ended means ended: later frames are no-ops.
    const after = applyTick(r.state, makeTick({ t: 6, speedKmh: 30 }));
    expect(after.state).toBe(r.state);
  });

  it("a collision terminates with the collision reason", () => {
    const crash = tickWithEvents(3, [{ kind: "collision", withWhat: "vehicle" }], {
      speedKmh: 25,
    });
    const r = run(createLessonSession(examLesson), [crash]);
    expect(r.state.phase).toBe("completed");
    expect(r.state.examTermination).toEqual({ reason: "collision", tSec: 3 });
  });

  it("the SAME опасна on a training lesson keeps the session driving", () => {
    const red = tickWithEvents(
      5,
      [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }],
      { speedKmh: 30 },
    );
    const r = run(createLessonSession(trainingLesson), [red]);
    expect(r.state.phase).toBe("driving");
    expect(r.state.examTermination).toBeUndefined();
  });

  it("crossing the limits during the ASSESS pre-drive terminates before moving off", () => {
    const preDriveExam: LessonSpec = {
      ...examLesson,
      id: "t-exam-predrive",
      preDrive: true,
      preDriveMode: "assess",
    };
    // 9 points already on the protocol; one more wrong-order step (1 т.,
    // scored live in assess mode) crosses the 9-point cap.
    const seeded: LessonSessionState = {
      ...createLessonSession(preDriveExam),
      events: Array.from({ length: 9 }, (_, i) => makeViolation("SPEEDING_OVER_LIMIT", i)),
    };
    const lateStep = PRE_DRIVE_STEP_ORDER[PRE_DRIVE_STEP_ORDER.length - 2]; // "signal"
    const r = applyPreDriveStep(seeded, lateStep, 12);
    expect(r.state.events.some((e) => e.code === "PREDRIVE_WRONG_ORDER")).toBe(true);
    expect(r.state.phase).toBe("completed");
    expect(r.state.examTermination).toEqual({ reason: "total-points-exceeded", tSec: 12 });
  });
});

// ---------------------------------------------------------------------------
// Server grading path (wire)
// ---------------------------------------------------------------------------

describe("gradeFinishWire rederives the exam termination", () => {
  const baseWire = {
    startedAtMs: 1_000,
    finishedAtMs: 400_000,
    aborted: false,
    microQuiz: { total: 0, correct: 0 },
  };

  it("accepts the real exam spec and derives the termination from catalog events", () => {
    const graded = gradeFinishWire({
      ...baseWire,
      lessonId: EXAM_LESSON.id,
      ruleEvents: [{ kind: "violation", code: "RED_LIGHT_CROSSED", t: 33 }],
      objectives: EXAM_LESSON.objectives.map((o) => ({
        id: o.id,
        done: false,
        completedAtSec: null,
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson.examMode).toBe(true);
    expect(graded.result.examTermination).toEqual({
      reason: "dangerous-mistake",
      tSec: 33,
    });
    expect(graded.result.passed).toBe(false);
  });

  it("never attaches a termination to training lessons", () => {
    const graded = gradeFinishWire({
      ...baseWire,
      lessonId: "l0-free-drive",
      ruleEvents: [{ kind: "violation", code: "RED_LIGHT_CROSSED", t: 33 }],
      objectives: [],
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.examTermination).toBeUndefined();
  });
});
