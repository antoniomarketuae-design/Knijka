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
// One continuous breach, ONE charge — the standing-duty re-grade guard
// ---------------------------------------------------------------------------

/** Night cruise at 30 км/ч, one tick per second, [t0, t1] inclusive. */
function nightCruise(t0: number, t1: number, headlights: "off" | "low") {
  const out = [];
  for (let t = t0; t <= t1; t += 1) {
    out.push(makeTick({ t, speedKmh: 30, isNight: true, headlights }));
  }
  return out;
}

const lampCharges = (s: LessonSessionState) =>
  s.events.filter((e) => e.kind === "violation" && e.code === "HEADLIGHTS_OFF_AT_NIGHT");

describe("a standing duty held in breach is CHARGED once, however long it runs", () => {
  // WHY THIS EXISTS. `rules/engine.ts` bills a one-switch duty TWICE per
  // episode (`STANDING_DUTY_REGRADE_SEC`), because in training the first bill
  // is spent by the teach-first free mini-lesson — without a second one an
  // entire lesson driven unlit reaches its debrief as «чисто каране по изпитния
  // лист». In the EXAM there is no teach pass: `coach.ts` scores from tick one,
  // so both bills would grade and one continuous breach would cost twice its
  // base. HEADLIGHTS_OFF_AT_NIGHT is основна/3, the gates are `osnovniPoints >
  // 6` and `totalPoints > 9`, and `examBank.ts` ships night variants — so an
  // unmarked re-grade is a FALSE FAIL on the изпит, not a rounding error.
  // The reducer marks the second bill `regrade`; `engine.ts` drops it when the
  // code has already been charged.

  it("EXAM: 30 s unlit at night = ONE charge, not two", () => {
    const r = run(createLessonSession(examLesson), nightCruise(0, 30, "off"));
    expect(lampCharges(r.state)).toHaveLength(1);
    expect(r.taught).toHaveLength(0); // no teach pass in the exam
    // …and the HUD said it exactly once too: a dropped re-grade toasts nothing.
    expect(r.hud.filter((e) => e.kind === "violation")).toHaveLength(1);
  });

  it("TRAINING: the same drive TEACHES once and then charges once", () => {
    const c = run(createLessonSession(trainingLesson), nightCruise(0, 30, "off"));
    // The teach is never suppressed — requirement-zero: the student is shown
    // the rule before he is docked for it.
    expect(c.taught.map((m) => m.code)).toEqual(["HEADLIGHTS_OFF_AT_NIGHT"]);
    // …and the re-grade lands, because the teach left the ledger empty. This
    // is the whole repair: `mistakes.length === 0` is now false, so debrief.ts
    // cannot print «чисто каране» over a lesson driven in the dark.
    expect(lampCharges(c.state)).toHaveLength(1);
  });

  it("a genuine correction, then a SECOND omission, costs two charges — not four", () => {
    // The reducer emits four bills here (two episodes × two). Two of them are
    // re-grades of a breach already charged, and both are dropped: the price is
    // one charge per offence, in both modes.
    const stream = [
      ...nightCruise(0, 20, "off"),
      ...nightCruise(21, 30, "low"), // lamps on — a real correction, episode ends
      ...nightCruise(31, 55, "off"), // …and off again: a second offence
    ];
    expect(lampCharges(run(createLessonSession(examLesson), stream).state)).toHaveLength(2);
    const training = run(createLessonSession(trainingLesson), stream);
    expect(training.taught).toHaveLength(1); // taught once, then charged twice
    expect(lampCharges(training.state)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// …and the same guard on a continuing OVERSPEED (w11 · SPEED_REGRADE_SEC)
// ---------------------------------------------------------------------------

/** A continuous 56 км/ч in a 50 zone, one tick per second, [t0, t1] inclusive. */
function overspeedCruise(t0: number, t1: number) {
  const out = [];
  for (let t = t0; t <= t1; t += 1) out.push(makeTick({ t, speedKmh: 56 }));
  return out;
}

const speedCharges = (s: LessonSessionState) =>
  s.events.filter((e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT");

describe("a continuing OVERSPEED is charged once, and is no longer charged nothing", () => {
  // WHY THIS EXISTS, and it is the lamps' argument on the code the audit
  // photographed most. `SPEEDING_OVER_LIMIT` re-bills on `speedingRepeatSec`
  // (20 s) — longer than the drive on most of the catalogue's lessons — so the
  // single bill a short leg produced was the FIRST encounter of its topic and
  // the teach-first free mini-lesson spent it. `.audit-frames/w11` has seven
  // legs of it: 57–59 км/ч under a posted 50 for the whole section, «Опасни 0 0
  // · Основни 1 3 · Второстепенни 0 0», ИЗДЪРЖАН, +100 XP, and the single
  // основна is the harness's own unbuckled belt. `SPEED_REGRADE_SEC` reaches
  // the charge the teach consumed; `regrade` keeps it from ever being a second
  // charge.

  it("EXAM: 15 s at 56 in a 50 = ONE charge, not two", () => {
    const r = run(createLessonSession(examLesson), overspeedCruise(0, 15));
    expect(speedCharges(r.state)).toHaveLength(1);
    expect(r.taught).toHaveLength(0); // no teach pass in the exam
    expect(r.hud.filter((e) => e.kind === "violation")).toHaveLength(1);
  });

  it("TRAINING: the same drive TEACHES once and then CHARGES once — it used to charge nothing", () => {
    const c = run(createLessonSession(trainingLesson), overspeedCruise(0, 15));
    // Requirement-zero holds: the card comes before the mark.
    expect(c.taught.map((m) => m.code)).toEqual(["SPEEDING_OVER_LIMIT"]);
    // …and this is the repair. Before it, `speedCharges` was EMPTY here — a
    // whole section held over the limit reached the debrief with «Второстепенни
    // 0 0» and a pass.
    expect(speedCharges(c.state)).toHaveLength(1);
    expect(buildLessonResult(c.state).score).toBe(1);
    // The teach is first and the charge is SPEED_REGRADE_SEC of driving later —
    // not grade-on-sight.
    expect(speedCharges(c.state)[0]!.t).toBeGreaterThan(c.taught[0]!.t + 5.9);
  });

  it("a genuine correction, then a SECOND stint, costs two charges — not four", () => {
    // Same shape as the lamps' counterpart: two episodes × two bills, and both
    // re-grades of an already-charged code are dropped.
    const stream = [
      ...overspeedCruise(0, 15),
      ...Array.from({ length: 10 }, (_, i) => makeTick({ t: 16 + i, speedKmh: 40 })),
      ...overspeedCruise(26, 41),
    ];
    expect(speedCharges(run(createLessonSession(examLesson), stream).state)).toHaveLength(2);
    const training = run(createLessonSession(trainingLesson), stream);
    expect(training.taught).toHaveLength(1);
    expect(speedCharges(training.state)).toHaveLength(2);
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

  it("C3: the Wave-1 основни count toward the > 6 fold like any other основна", () => {
    // Three of the NEW основни (3 т. each): 9 total (≤ 9) but 9 from основни
    // (> 6) → the third one trips the основни cap.
    const events = [
      makeViolation("YELLOW_LIGHT_NOT_STOPPED", 10),
      makeViolation("RED_YELLOW_CROSSED", 20),
      makeViolation("HARSH_BRAKING_NO_CAUSE", 30),
    ];
    expect(examTerminationFor(events)).toEqual({
      reason: "osnovni-points-exceeded",
      tSec: 30,
    });
  });

  it("C3: the Wave-1 второстепенни count toward the > 9 total fold", () => {
    // 2 new основни (6) + 3 new второстепенни (3) = 9 → legal; a 4th
    // второстепенна (10 total) trips the total cap.
    const events = [
      makeViolation("YELLOW_LIGHT_NOT_STOPPED", 1),
      makeViolation("RED_YELLOW_CROSSED", 2),
      makeViolation("ENGINE_STALLED", 3),
      makeViolation("STOP_LINE_OVERSHOOT", 4),
      makeViolation("HESITATION_AT_GREEN", 5),
    ];
    expect(examTerminationFor(events)).toBeNull();
    expect(examTerminationFor([...events, makeViolation("CENTER_LINE_TOUCHED", 6)])).toEqual({
      reason: "total-points-exceeded",
      tSec: 6,
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
