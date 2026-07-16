/**
 * JU-18 регулировчик bot-completion proof (doc 76 §10; the s3-signals mold) —
 * sc-signal-controller's shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScSignalControllerDrive's
 *   onTick feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * The capability is exercised live: the staged trafficController event arms
 * cluster "controlled" + the authored timetable through the director's signal
 * port, the shadow waits out the halt at GREEN lamps and proceeds after the
 * flip on RED lamps with ZERO violations. Counter-proofs ride the same live
 * pipeline — CONTROLLER_SIGNAL_VIOLATED is опасна (10 т.), graded on the
 * spot, so neither mistake passes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScSignalControllerDrive,
  type ScSignalControllerTraceName,
} from "../../../traces/scSignalController";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_SIGNAL_CONTROLLER } from "../templates-signals";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
) as unknown;

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

function driveThroughSession(name: ScSignalControllerTraceName): DriveOutcome {
  const lesson = compileScenario(SC_SIGNAL_CONTROLLER, 3);
  let session = createLessonSession(lesson);
  const drive = recordScSignalControllerDrive(sxDistrict, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("signal-controller bot completion — correct attempt at L3", () => {
  const outcome = driveThroughSession("shadow-correct");

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("the staged controller resolves 'yielded' — the halt was waited out", () => {
    const staged = outcome.drive.outcomes.find((o) => o.eventId === "sc-sctrl-controller")!;
    expect(staged.success).toBe(true);
    expect(staged.detail).toBe("yielded");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const { session, result } = outcome;
    const graded = gradeFinishWire({
      lessonId: `${SC_SIGNAL_CONTROLLER.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_SIGNAL_CONTROLLER.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_SIGNAL_CONTROLLER.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_SIGNAL_CONTROLLER.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("signal-controller counter-proofs — mistakes grade through the live pipeline", () => {
  for (const name of ["mistake-run", "mistake-creep"] as const) {
    it(`${name}: CONTROLLER_SIGNAL_VIOLATED surfaces (опасна) and the attempt fails`, () => {
      const outcome = driveThroughSession(name);
      expect(driveViolationCodes(outcome)).toContain("CONTROLLER_SIGNAL_VIOLATED");
      expect(outcome.result.passed).toBe(false);
      const staged = outcome.drive.outcomes.find((o) => o.eventId === "sc-sctrl-controller")!;
      expect(staged.success).toBe(false);
      expect(staged.detail).toBe("violation");
    });
  }
});
