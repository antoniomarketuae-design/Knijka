/**
 * A2 integration: REAL vehicle transitions drive the pre-drive procedure in
 * all three modes (Instruction→Practice→Assess, doc 68 §5).
 *
 * The chain under test mirrors the scene wiring exactly:
 *   DrivelineState commands → subscribe events ┐
 *   cabin-electrics edges / glances / pedals   ├→ observeControlSignal
 *                                              ┘        │ (performedSteps)
 *                                        resolved stepId ▼
 *                                        applyPreDriveStep (lessons engine)
 *
 * There is NO click path for performable steps — every completion below
 * comes from a state transition; only the three info steps confirm directly.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import {
  createPreDriveSignalTracker,
  observeControlSignal,
  PRE_DRIVE_INFO_STEPS,
  readyToMoveOff,
  type PreDriveControlSignal,
  type PreDriveMode,
} from "../../procedures";
import { DrivelineState } from "../../vehicle/driveline";
import { applyPreDriveStep, createLessonSession, isDriveLocked } from "../engine";
import { lessonById } from "../specs";
import type { LessonSessionState } from "../types";

function preDriveLesson(mode?: PreDriveMode): LessonSpec {
  return {
    id: `t-predrive-${mode ?? "default"}`,
    order: 90,
    titleBg: "Тест подготовка",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: true,
    ...(mode ? { preDriveMode: mode } : {}),
    objectives: [],
  };
}

/**
 * Perform the full canonical day procedure through REAL transitions: a cold
 * DrivelineState for ignition/selector/parking brake, signal edges for the
 * cabin electrics/glances/pedals — resolving steps through the tracker and
 * applying them to the session, exactly like RuntimeDriver does per frame.
 */
function performCanonicalRun(initial: LessonSessionState) {
  let s = initial;
  const hud: HudEvent[] = [];
  let t = 1;

  const driveline = new DrivelineState("cold"); // engine OFF, P, parking brake ON
  const queue: PreDriveControlSignal[] = [];
  driveline.subscribe((event) => queue.push({ kind: "driveline", event }));
  const tracker = createPreDriveSignalTracker();

  const feed = (signal: PreDriveControlSignal) => {
    const stepId = observeControlSignal(tracker, signal);
    if (!stepId) return;
    const r = applyPreDriveStep(s, stepId, t++);
    s = r.state;
    hud.push(...r.hudEvents);
  };
  const drain = () => {
    for (const signal of queue.splice(0)) feed(signal);
  };
  const confirmInfo = (stepId: (typeof PRE_DRIVE_INFO_STEPS)[number]) => {
    const r = applyPreDriveStep(s, stepId, t++);
    s = r.state;
    hud.push(...r.hudEvents);
  };

  // 1 seat (info) · 2 mirrors (three real glances) · 3 surroundings (info)
  confirmInfo("adjust-seat");
  feed({ kind: "glance", mirror: "left" });
  feed({ kind: "glance", mirror: "right" });
  feed({ kind: "glance", mirror: "rear" });
  confirmInfo("check-surroundings");
  // 4 belt (real cabin edge) · 5 dashboard (info)
  feed({ kind: "seatbelt", on: true });
  confirmInfo("check-dashboard");
  // 7..10: the real driveaway chain on the driveline
  driveline.toggleEngine();
  drain();
  feed({ kind: "brakePressed" }); // raw brake pedal edge
  driveline.gearUp(); // P → R
  driveline.gearUp(); // R → N
  driveline.gearUp(); // N → D
  drain();
  driveline.toggleParkingBrake(); // released
  drain();
  // 11 final mirror check (one more real glance) · 12 signal (left edge)
  feed({ kind: "glance", mirror: "left" });
  feed({ kind: "indicator", setting: "left" });
  // 13 move-off: throttle on a genuinely ready driveline
  expect(readyToMoveOff(driveline.physicsInput)).toBe(true);
  feed({ kind: "moveOffAttempt" });

  return { state: s, hud };
}

describe("A2 transition-driven completion per mode", () => {
  for (const mode of ["instruction", "practice", "assess"] as const) {
    it(`${mode}: the canonical performed run completes clean and unlocks driving`, () => {
      const s0 = createLessonSession(preDriveLesson(mode));
      expect(isDriveLocked(s0)).toBe(true);

      const { state, hud } = performCanonicalRun(s0);
      expect(state.phase).toBe("driving");
      expect(isDriveLocked(state)).toBe(false);
      // 12 of 13: headlights-on is the night step — not performed by day,
      // not required by day either, so the run is still perfect.
      expect(state.preDrive?.completedStepIds).toHaveLength(12);
      expect(state.preDrive?.penaltyPoints).toBe(0);
      expect(
        state.events.some((e) => e.kind === "commendation" && e.code === "PREDRIVE_PERFECT"),
      ).toBe(true);
      expect(hud).toContainEqual({ kind: "objectiveComplete", titleBg: "Подготовка за потегляне" });
    });
  }

  it("instruction (the L1 default): out-of-order transition is coached as a lesson toast, not scored", () => {
    let s = createLessonSession(preDriveLesson()); // no explicit mode → instruction
    expect(s.preDrive?.mode).toBe("instruction");

    // Student starts the engine FIRST (real transition, nothing adjusted yet).
    const driveline = new DrivelineState("cold");
    const tracker = createPreDriveSignalTracker();
    const signals: PreDriveControlSignal[] = [];
    driveline.subscribe((event) => signals.push({ kind: "driveline", event }));
    driveline.toggleEngine();
    const stepId = observeControlSignal(tracker, signals[0]);
    expect(stepId).toBe("start-engine");
    if (stepId === null) throw new Error("observer did not resolve the transition");

    const r = applyPreDriveStep(s, stepId, 1);
    s = r.state;
    // Coached: a teach toast with the law-cited WHY; zero scored events.
    expect(r.hudEvents.some((e) => e.kind === "lesson")).toBe(true);
    expect(r.hudEvents.some((e) => e.kind === "violation")).toBe(false);
    expect(s.events).toHaveLength(0);
    expect(s.preDrive?.wrongOrderStepIds).toEqual(["start-engine"]);
  });

  it("assess: the same out-of-order transition is graded PREDRIVE_WRONG_ORDER", () => {
    let s = createLessonSession(preDriveLesson("assess"));
    const r = applyPreDriveStep(s, "start-engine", 1);
    s = r.state;
    expect(r.hudEvents.some((e) => e.kind === "violation")).toBe(true);
    expect(
      s.events.some((e) => e.kind === "violation" && e.code === "PREDRIVE_WRONG_ORDER"),
    ).toBe(true);
    expect(s.preDrive?.penaltyPoints).toBe(1);
  });

  it("L1 ships with instruction mode (doc 68: default lesson 1 to Instruction)", () => {
    const l1 = lessonById("l1-preparation");
    expect(l1?.preDriveMode).toBe("instruction");
    const s = createLessonSession(l1!);
    expect(s.preDrive?.mode).toBe("instruction");
  });

  it("practice: wrong order never adds points but still costs the perfect commendation", () => {
    const s0 = createLessonSession(preDriveLesson("practice"));
    // Belt before seat adjustment is FINE (documented flexibility)… but
    // mirrors before seat is wrong order.
    let s = applyPreDriveStep(s0, "adjust-mirrors", 1).state;
    s = applyPreDriveStep(s, "adjust-seat", 2).state;
    expect(s.preDrive?.wrongOrderStepIds).toEqual(["adjust-mirrors"]);
    expect(s.preDrive?.penaltyPoints).toBe(0);
    // Finish everything in canonical order from here.
    for (const id of [
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
    ] as const) {
      s = applyPreDriveStep(s, id, 3).state;
    }
    expect(s.phase).toBe("driving");
    expect(s.preDrive?.penaltyPoints).toBe(0);
    expect(s.events.some((e) => e.kind === "commendation")).toBe(false); // not perfect
  });
});
