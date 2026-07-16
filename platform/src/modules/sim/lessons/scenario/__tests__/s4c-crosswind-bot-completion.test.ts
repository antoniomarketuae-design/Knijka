/**
 * Crosswind bot-completion proof (doc 76 §10; the s4a wet-braking mold) —
 * sc-ac-crosswind, the first OPT-IN crosswind-physics template, driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScAcCrosswindDrive's
 *   onTick feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * HONEST LIMIT OF THIS PROOF (state it, don't hide it): the bot's drive is
 * the KINEMATIC recorder (authored polylines) — it never runs VehicleSim, so
 * completion here proves the LESSON pipeline (objectives, grading, wire),
 * not the wind feel. The live wind physics is validated by
 * vehicle/crosswind.test.ts (bit-identity + the measured push + gust
 * determinism); the FEEL sign-off is the founder's manual drive (ADR-006's
 * stage-4 acceptance gate). The demos stay honest because the drift-and-
 * correct story is authored into their polylines, pinned against the
 * lane-detector band in the trace gate.
 *
 * This file also pins the OPT-IN COMPILE PROPAGATION law, wind edition:
 * only a template that AUTHORS physics.crosswind compiles it to
 * LessonSpec.physics — no weather tag implies wind (dry, rain, fog and snow
 * templates all stay wind-free), and the crosswind template acquires NO
 * environment coupling (wind is force, not weather render).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScAcCrosswindDrive,
  type ScAcCrosswindTraceName,
} from "../../../traces/scAcCrosswind";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import {
  SC_AC_CROSSWIND,
  SC_AC_RAIN_LIGHTS,
  SC_AC_SNOW,
  SC_AC_WET_BRAKING,
} from "../templates-conditions";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

function driveThroughSession(name: ScAcCrosswindTraceName): DriveOutcome {
  const lesson = compileScenario(SC_AC_CROSSWIND, 3);
  let session = createLessonSession(lesson);
  const drive = recordScAcCrosswindDrive(loadDistrict(SC_AC_CROSSWIND.map.districtId), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("crosswind — the opt-in compile propagation law (wind edition)", () => {
  it("sc-ac-crosswind compiles physics.crosswind at EVERY authored level — and NO environment", () => {
    for (const l of SC_AC_CROSSWIND.levels) {
      const lesson = compileScenario(SC_AC_CROSSWIND, l.level as ScenarioLevel);
      expect(lesson.physics, `L${l.level}`).toEqual({ crosswind: true });
      // Wind is FORCE, not weather: a dry-condition template acquires no
      // environment block — nothing couples the wind to a render tag.
      expect(lesson.environment, `L${l.level}`).toBeUndefined();
    }
  });

  it("no weather tag implies wind: rain/wet/snow templates stay crosswind-free", () => {
    expect(compileScenario(SC_AC_RAIN_LIGHTS, 3).physics).toBeUndefined();
    expect(compileScenario(SC_AC_WET_BRAKING, 3).physics).toEqual({ wetGrip: true });
    expect(compileScenario(SC_AC_SNOW, 3).physics).toEqual({ snowGrip: true });
  });

  it("the wire resolver recompiles the same physics field from the id alone", () => {
    expect(scenarioLessonById("sc-ac-crosswind@L3")?.physics).toEqual({ crosswind: true });
    expect(scenarioLessonById("sc-ac-rain-lights@L3")?.physics).toBeUndefined();
  });
});

describe("crosswind bot completion — sc-ac-crosswind („Страничен вятър“) correct attempt at L3", () => {
  const outcome = driveThroughSession("shadow-correct");

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const { session, result } = outcome;
    const graded = gradeFinishWire({
      lessonId: "sc-ac-crosswind@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson.id).toBe("sc-ac-crosswind@L3");
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-crosswind@L3"));
    expect(graded.lesson.physics).toEqual({ crosswind: true }); // the slice survives the wire
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_AC_CROSSWIND.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("crosswind counter-proofs — the wind mistakes through the live pipeline", () => {
  it("loose hands at 50: CENTER_LINE_TOUCHED surfaces, the prudent-speed zone objective fails", () => {
    const outcome = driveThroughSession("mistake-full-speed");
    expect(driveViolationCodes(outcome)).toContain("CENTER_LINE_TOUCHED");
    expect(driveViolationCodes(outcome)).not.toContain("POOR_LANE_KEEPING");
    expect(outcome.result.completedAll).toBe(false);
    // Blasts the exposed segment at 50 — the 40 km/h open-segment discipline
    // is blown; the drive still reaches the finish, so ONLY the taught duty
    // fails (an honest partial, not a cascade).
    expect(outcome.result.objectives.find((o) => o.id === "sc-acx-open")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("the second swerve: POOR_LANE_KEEPING surfaces, the zone objective fails at near-limit speed", () => {
    const outcome = driveThroughSession("mistake-overcorrect");
    expect(driveViolationCodes(outcome)).toContain("POOR_LANE_KEEPING");
    expect(driveViolationCodes(outcome)).not.toContain("CENTER_LINE_TOUCHED");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acx-open")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });
});
