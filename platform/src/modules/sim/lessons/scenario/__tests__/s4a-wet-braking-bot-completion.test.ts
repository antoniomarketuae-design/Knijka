/**
 * Stage-4a bot-completion proof (doc 76 §10; the s4-ac-vp mold) —
 * sc-ac-wet-braking, the first OPT-IN wet-grip-physics template, driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScAcWetBrakingDrive's
 *   onTick feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * HONEST LIMIT OF THIS PROOF (state it, don't hide it): the bot's drive is
 * the KINEMATIC recorder (authored envelopes) — it never runs VehicleSim, so
 * completion here proves the LESSON pipeline (objectives, grading, wire),
 * not the wet vehicle feel. The live wet physics is validated by
 * vehicle/wet-grip.test.ts (bit-identity + 1.4× braking + reduced lateral
 * grip); the FEEL sign-off is the founder's manual drive (ADR-006's stage-4
 * acceptance gate). The demos stay honest because their braking envelopes are
 * authored at SCRIPT_DECEL × WET_GRIP_FACTOR — asserted in the trace gate.
 *
 * This file also pins the OPT-IN COMPILE PROPAGATION law: only a template
 * that AUTHORS physics.wetGrip compiles to LessonSpec.physics — a plain rain
 * template (sc-ac-rain-lights) must stay physics-free, or every shipped rain
 * lesson would silently change feel.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScAcWetBrakingDrive,
  type ScAcWetBrakingTraceName,
} from "../../../traces/scAcWetBraking";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_RAIN_LIGHTS, SC_AC_WET_BRAKING } from "../templates-conditions";
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

function driveThroughSession(name: ScAcWetBrakingTraceName): DriveOutcome {
  const lesson = compileScenario(SC_AC_WET_BRAKING, 3);
  let session = createLessonSession(lesson);
  const drive = recordScAcWetBrakingDrive(loadDistrict(SC_AC_WET_BRAKING.map.districtId), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

describe("stage 4a — the opt-in compile propagation law", () => {
  it("sc-ac-wet-braking compiles physics.wetGrip at EVERY authored level", () => {
    for (const l of SC_AC_WET_BRAKING.levels) {
      const lesson = compileScenario(SC_AC_WET_BRAKING, l.level as ScenarioLevel);
      expect(lesson.physics, `L${l.level}`).toEqual({ wetGrip: true });
      // Rain rides along as environment — but physics is the AUTHORED field.
      expect(lesson.environment?.rain, `L${l.level}`).toBe(true);
    }
  });

  it("a plain rain template does NOT acquire wet physics (no automatic coupling)", () => {
    for (const l of SC_AC_RAIN_LIGHTS.levels) {
      const lesson = compileScenario(SC_AC_RAIN_LIGHTS, l.level as ScenarioLevel);
      expect(lesson.environment?.rain, `L${l.level}`).toBe(true); // it IS a rain lesson…
      expect(lesson.physics, `L${l.level}`).toBeUndefined(); // …on DRY physics, as shipped
    }
  });

  it("the wire resolver recompiles the same physics field from the id alone", () => {
    expect(scenarioLessonById("sc-ac-wet-braking@L3")?.physics).toEqual({ wetGrip: true });
    expect(scenarioLessonById("sc-ac-rain-lights@L3")?.physics).toBeUndefined();
  });
});

describe("S4a bot completion — sc-ac-wet-braking („Спирачен път на мокро“) correct attempt at L3", () => {
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
      lessonId: "sc-ac-wet-braking@L3",
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
    expect(graded.lesson.id).toBe("sc-ac-wet-braking@L3");
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-wet-braking@L3"));
    expect(graded.lesson.physics).toEqual({ wetGrip: true }); // the slice survives the wire
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_AC_WET_BRAKING.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("S4a counter-proofs — the wet-distance mistakes through the live pipeline", () => {
  it("dry-habit braking point: COLLISION surfaces, the stop mark is never rested in, not passed", () => {
    const outcome = driveThroughSession("mistake-dry-point");
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(driveViolationCodes(outcome)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    // DOCUMENTED, not fought: the 267 m approach is fully lawful (that is the
    // POINT of this demo — speed correct, only the braking point wrong), so
    // the 250 m clean-driving streak legitimately fires BEFORE the crash.
    // What convicts the drive is the collision and the failed objectives.
    expect(driveCommendationCodes(outcome)).toContain("CLEAN_DRIVING");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acw-mark")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("dry-limit 50 in rain: COLLISION + conditions speed surface, neither objective's discipline met, not passed", () => {
    const outcome = driveThroughSession("mistake-dry-speed");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("COLLISION");
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    expect(outcome.result.completedAll).toBe(false);
    // At 50 km/h the approach zone's 42 km/h discipline is blown too.
    expect(outcome.result.objectives.find((o) => o.id === "sc-acw-approach")!.done).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acw-mark")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });
});
