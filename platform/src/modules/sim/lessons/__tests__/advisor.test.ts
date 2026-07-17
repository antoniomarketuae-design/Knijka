import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import { PRE_DRIVE_STEP_ORDER } from "../../procedures";
import {
  ADVISOR_STORAGE_KEY,
  advisorPromptForObjective,
  advisorPromptForPreDriveStep,
  advisorPromptForSession,
  defaultAdvisorEnabled,
  parseStoredAdvisorSetting,
  serializeAdvisorSetting,
} from "../advisor";
import { abortSession, applyPreDriveStep, applyTick, createLessonSession } from "../engine";
import { EXAM_LESSON, lessonById } from "../specs";
import type { ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function lesson(id: string): LessonSpec {
  const l = lessonById(id);
  if (l === undefined) throw new Error(`fixture lesson missing: ${id}`);
  return l;
}

/** Minimal single-objective lesson for driving-phase session tests. */
function objectiveLesson(objective: LessonSpec["objectives"][number]): LessonSpec {
  return {
    id: "t-advisor",
    order: 99,
    titleBg: "Тест съветник",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 100, y: 100 }, headingDeg: 0 },
    preDrive: false,
    objectives: [objective],
  };
}

describe("defaultAdvisorEnabled", () => {
  it("is ON for the beginner curriculum rungs (order ≤ 2, полигон slots included)", () => {
    expect(defaultAdvisorEnabled(lesson("l0-free-drive"))).toBe(true);
    expect(defaultAdvisorEnabled(lesson("l1-preparation"))).toBe(true);
    expect(defaultAdvisorEnabled(lesson("l2-intersections"))).toBe(true);
  });

  it("is OFF from curriculum level 3 up", () => {
    expect(defaultAdvisorEnabled(lesson("l3-roundabout"))).toBe(false);
    expect(defaultAdvisorEnabled(lesson("l7-parking"))).toBe(false);
  });

  it("reads the scenario rung from the @L<n> id, not the grid order", () => {
    const base = { ...objectiveLesson(lesson("l1-preparation").objectives[0]), order: 99 };
    expect(defaultAdvisorEnabled({ ...base, id: "sc-park-parallel@L1" })).toBe(true);
    expect(defaultAdvisorEnabled({ ...base, id: "sc-park-parallel@L2" })).toBe(true);
    expect(defaultAdvisorEnabled({ ...base, id: "sc-park-parallel@L3" })).toBe(false);
  });

  it("is OFF on exam sessions regardless of anything else", () => {
    expect(defaultAdvisorEnabled(EXAM_LESSON)).toBe(false);
  });
});

describe("persisted setting wire format", () => {
  it("has the versioned storage key", () => {
    expect(ADVISOR_STORAGE_KEY).toBe("aidrive.sim.advisor.v1");
  });

  it("round-trips on/off and rejects foreign values", () => {
    expect(parseStoredAdvisorSetting(serializeAdvisorSetting(true))).toBe(true);
    expect(parseStoredAdvisorSetting(serializeAdvisorSetting(false))).toBe(false);
    expect(parseStoredAdvisorSetting(null)).toBeNull();
    expect(parseStoredAdvisorSetting("banana")).toBeNull();
    expect(parseStoredAdvisorSetting(undefined)).toBeNull();
  });
});

describe("pre-drive prompts", () => {
  it("maps performed steps to their honest key caps", () => {
    expect(advisorPromptForPreDriveStep("fasten-seatbelt").keys).toEqual(["B"]);
    expect(advisorPromptForPreDriveStep("start-engine").keys).toEqual(["I"]);
    expect(advisorPromptForPreDriveStep("press-brake").keys).toEqual(["S"]);
    expect(advisorPromptForPreDriveStep("release-handbrake").keys).toEqual(["Space"]);
    expect(advisorPromptForPreDriveStep("adjust-mirrors").keys).toEqual(["Q", "E", "F"]);
    expect(advisorPromptForPreDriveStep("signal").keys).toEqual([","]);
    expect(advisorPromptForPreDriveStep("headlights-on").keys).toEqual(["L"]);
    expect(advisorPromptForPreDriveStep("select-gear").keys).toEqual(["]"]);
    expect(advisorPromptForPreDriveStep("move-off").keys).toEqual(["W"]);
  });

  it("gives info steps no key caps (confirm-by-click in the checklist)", () => {
    for (const stepId of ["adjust-seat", "check-surroundings", "check-dashboard"] as const) {
      expect(advisorPromptForPreDriveStep(stepId).keys).toEqual([]);
    }
  });

  it("has Bulgarian action text for every step in the canonical order", () => {
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      const p = advisorPromptForPreDriveStep(stepId);
      expect(p.textBg.length).toBeGreaterThan(5);
    }
  });

  it("advances with the REAL machine: next pending step drives the prompt", () => {
    let s = createLessonSession(lesson("l1-preparation"));
    expect(s.phase).toBe("preDrive");
    // First pending step: adjust-seat (info — no keys).
    expect(advisorPromptForSession(s)).toEqual({
      textBg: expect.stringContaining("седалката"),
      keys: [],
    });
    s = applyPreDriveStep(s, "adjust-seat", 1).state;
    // Next: mirrors — the Q/E/F glances.
    expect(advisorPromptForSession(s)?.keys).toEqual(["Q", "E", "F"]);
    s = applyPreDriveStep(s, "adjust-mirrors", 2).state;
    s = applyPreDriveStep(s, "check-surroundings", 3).state;
    // Next: seatbelt → B.
    const p = advisorPromptForSession(s);
    expect(p?.keys).toEqual(["B"]);
    expect(p?.textBg).toContain("колан");
  });
});

describe("driving prompts (objective-driven)", () => {
  it("speed-capped reachZone advises the cap", () => {
    const p = advisorPromptForObjective("Стигни до кръговото", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      maxSpeedKmh: 30,
    });
    expect(p.textBg).toContain("дръж под 30 км/ч");
    expect(p.keys).toEqual([]);
  });

  it("plain reachZone falls back to the objective's own title", () => {
    const p = advisorPromptForObjective("Стигни зоната", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
    });
    expect(p).toEqual({ textBg: "Стигни зоната", keys: [] });
  });

  it("stop sign → full stop with the brake key", () => {
    const p = advisorPromptForObjective("Премини кръстовището със знак „Стоп“", {
      kind: "passSignal",
      nodeId: "n1",
      x: 0,
      y: 0,
      radiusM: 20,
      control: "stopSign",
    });
    expect(p.textBg).toContain("Спри напълно");
    expect(p.keys).toEqual(["S"]);
  });

  it("requireRedMet traffic light → stop at the line and wait out the red", () => {
    const p = advisorPromptForObjective("Премини светофара", {
      kind: "passSignal",
      nodeId: "n1",
      x: 0,
      y: 0,
      radiusM: 20,
      control: "trafficLight",
      requireRedMet: true,
    });
    expect(p.textBg).toContain("изчакай");
    expect(p.keys).toEqual(["S"]);
    // Without the gate there is no clean mapping — fall back to the title.
    const plain = advisorPromptForObjective("Премини светофара", {
      kind: "passSignal",
      nodeId: "n1",
      x: 0,
      y: 0,
      radiusM: 20,
      control: "trafficLight",
    });
    expect(plain).toEqual({ textBg: "Премини светофара", keys: [] });
  });

  it("driveDistance keeps the title and advises the throttle", () => {
    const p = advisorPromptForObjective("Измини 300 метра", {
      kind: "driveDistance",
      meters: 300,
    });
    expect(p).toEqual({ textBg: "Измини 300 метра", keys: ["W"] });
  });

  it("smoothStop / emergencyStop advise the brake", () => {
    const smooth = advisorPromptForObjective("Спри плавно", {
      kind: "completeManeuver",
      maneuver: "smoothStop",
      minApproachKmh: 20,
      maxDecelMs2: 3.5,
    });
    expect(smooth.textBg).toContain("плавно");
    expect(smooth.keys).toEqual(["S"]);
    const emergency = advisorPromptForObjective("Спри аварийно — рязко и докрай", {
      kind: "completeManeuver",
      maneuver: "emergencyStop",
      stagedEventId: "ev1",
    });
    expect(emergency).toEqual({ textBg: "Спри аварийно — рязко и докрай", keys: ["S"] });
  });

  it("parkInBay advises the entry gear per the authored variant", () => {
    const bayParams: ObjectiveParams = {
      kind: "completeManeuver",
      maneuver: "parkInBay",
      holdSec: 1.5,
      bay: { x: 0, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5 },
      centerTolM: 0.5,
      headingTolDeg: 10,
    };
    expect(advisorPromptForObjective("Паркирай", bayParams).keys).toEqual(["["]);
    expect(
      advisorPromptForObjective("Паркирай", { ...bayParams, entry: "forward" }).keys,
    ).toEqual(["]"]);
  });

  it("roundabout: title before entering, right-indicator hint once inside (real eval state)", () => {
    const spec = objectiveLesson({
      id: "o-rb",
      titleBg: "Премини през кръговото",
      kind: "completeManeuver",
      params: { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 10, exitRadiusM: 30 },
    });
    let s = createLessonSession(spec);
    expect(advisorPromptForSession(s)).toEqual({
      textBg: "Премини през кръговото",
      keys: [],
    });
    // Drive into the ring — the evaluator flips `entered`.
    s = applyTick(s, makeTick({ t: 1, speedKmh: 20, position: { x: 5, y: 0 } })).state;
    const p = advisorPromptForSession(s);
    expect(p?.textBg).toContain("десен мигач");
    expect(p?.keys).toEqual(["."]);
  });
});

describe("session-level gating", () => {
  it("is null on exam sessions (inert entirely)", () => {
    const s = createLessonSession(EXAM_LESSON);
    expect(s.lesson.examMode).toBe(true);
    expect(advisorPromptForSession(s)).toBeNull();
  });

  it("is null on free drive (no objectives) and after the session ends", () => {
    const free = createLessonSession(lesson("l0-free-drive"));
    expect(free.phase).toBe("driving");
    expect(advisorPromptForSession(free)).toBeNull();

    const aborted = abortSession(
      createLessonSession(objectiveLesson({
        id: "o-dist",
        titleBg: "Измини 20 метра",
        kind: "driveDistance",
        params: { meters: 20 },
      })),
      5,
    );
    expect(advisorPromptForSession(aborted)).toBeNull();
  });
});
