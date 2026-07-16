/**
 * SNOW-unlock bot-completion proof (doc 76 §10; the s4a-wet-braking mold) —
 * sc-ac-snow, the template that COMPOSES the two shipped seams (fog's render
 * path × the opt-in grip physics), driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScAcSnowDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * HONEST LIMIT OF THIS PROOF (the s4a note, verbatim law): the bot's drive is
 * the KINEMATIC recorder (authored envelopes) — it never runs VehicleSim, so
 * completion here proves the LESSON pipeline (objectives, grading, wire), not
 * the snow vehicle feel. The live snow physics is validated by
 * vehicle/wet-grip.test.ts (default bit-identity + the ~2.5× snow braking
 * band); the FEEL sign-off is the founder's manual drive (ADR-006's stage-4
 * acceptance gate). The demos stay honest because their braking envelopes are
 * authored at SCRIPT_DECEL × SNOW_GRIP_FACTOR — asserted in the trace gate.
 *
 * This file also pins the SNOW COMPILE PROPAGATION laws: weather "snow"
 * compiles environment.snow at every level; only a template that AUTHORS
 * physics.snowGrip compiles to LessonSpec.physics — the snow WEATHER alone
 * never flips grip (sc-ac-fog's weather-only compile is the counter-pin).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScAcSnowDrive, type ScAcSnowTraceName } from "../../../traces/scAcSnow";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_FOG, SC_AC_SNOW } from "../templates-conditions";
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

function driveThroughSession(name: ScAcSnowTraceName): DriveOutcome {
  const lesson = compileScenario(SC_AC_SNOW, 3);
  let session = createLessonSession(lesson);
  const drive = recordScAcSnowDrive(loadDistrict(SC_AC_SNOW.map.districtId), name, {
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

describe("snow unlock — the compile propagation laws", () => {
  it("sc-ac-snow compiles environment.snow AND physics.snowGrip at EVERY authored level", () => {
    for (const l of SC_AC_SNOW.levels) {
      const lesson = compileScenario(SC_AC_SNOW, l.level as ScenarioLevel);
      // The render/grading flag comes from the weather tag…
      expect(lesson.environment?.snow, `L${l.level}`).toBe(true);
      // …the physics from the AUTHORED opt-in field (the wet precedent).
      expect(lesson.physics, `L${l.level}`).toEqual({ snowGrip: true });
    }
  });

  it("snow WEATHER alone does NOT acquire snow physics (no automatic coupling)", () => {
    // sc-ac-fog authors no physics; give its clone the snow weather — it must
    // compile the render flag and stay on dry physics.
    const clone = JSON.parse(JSON.stringify(SC_AC_FOG)) as typeof SC_AC_FOG;
    clone.conditions = { weather: "snow" };
    const lesson = compileScenario(clone, 3);
    expect(lesson.environment).toEqual({ snow: true });
    expect(lesson.physics).toBeUndefined();
  });

  it("the wire resolver recompiles the same environment + physics from the id alone", () => {
    const lesson = scenarioLessonById("sc-ac-snow@L3");
    expect(lesson?.environment).toEqual({ snow: true });
    expect(lesson?.physics).toEqual({ snowGrip: true });
  });
});

describe("S4b bot completion — sc-ac-snow („Сняг“) correct attempt at L3", () => {
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
      lessonId: "sc-ac-snow@L3",
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
    expect(graded.lesson.id).toBe("sc-ac-snow@L3");
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-snow@L3"));
    expect(graded.lesson.physics).toEqual({ snowGrip: true }); // the slice survives the wire
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_AC_SNOW.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("S4b counter-proofs — the winter mistakes through the live pipeline", () => {
  it("dry-habit 40 in snow: conditions speed surfaces, the winter approach is blown, not passed", () => {
    const outcome = driveThroughSession("mistake-dry-speed");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("COLLISION"); // the early stop rests short of the van
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    expect(outcome.result.completedAll).toBe(false);
    // At 40 km/h the approach zone's 25 km/h winter discipline is blown.
    expect(outcome.result.objectives.find((o) => o.id === "sc-acs-approach")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("dry-point braking: COLLISION surfaces, the stop mark is never rested in, not passed", () => {
    const outcome = driveThroughSession("mistake-late-brake");
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(driveViolationCodes(outcome)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    // DOCUMENTED, not fought (the s4a dry-point ruling): the ~280 m approach
    // is fully winter-lawful (that is the POINT of this demo — speed correct,
    // only the braking point wrong), so the 250 m clean-driving streak
    // legitimately fires BEFORE the crash. What convicts the drive is the
    // collision and the failed objectives.
    expect(driveCommendationCodes(outcome)).toContain("CLEAN_DRIVING");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acs-mark")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });
});
