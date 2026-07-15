/**
 * S3 batch-4 bot-completion proofs (doc 76 §10; the s2-junction mold) — the
 * two NEW junction/priority templates, each shadow driven through the FULL
 * production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScJunction2Drive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same pipeline: the cut-gap demo grades FAILED_TO_YIELD
 * through the live give-way check and the no-look demo drives a live COLLISION
 * (session terminated, rubric 1★) — proof the mistakes are real faults, not
 * replay artifacts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScJunction2Drive,
  type ScJunction2TemplateId,
  type ScJunction2TraceName,
} from "../../../traces/scJunctions2";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_JUNCTION_GAP, SC_JUNCTION_BLIND } from "../templates-junctions2";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

/** Drive one authored junction script through a REAL lesson session at L3. */
function driveThroughSession(
  spec: ScenarioSpec,
  templateId: ScJunction2TemplateId,
  name: ScJunction2TraceName,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = recordScJunction2Drive(loadDistrict(spec.map.districtId), templateId, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

/** The prototype's wire round-trip: the server regrades from the id alone. */
function expectWireRoundTrip(spec: ScenarioSpec, outcome: DriveOutcome): void {
  const { session, result } = outcome;
  const graded = gradeFinishWire({
    lessonId: `${spec.id}@L3`,
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
  expect(graded.lesson.id).toBe(`${spec.id}@L3`);
  expect(graded.lesson).toEqual(scenarioLessonById(`${spec.id}@L3`));
  expect(graded.result.passed).toBe(true);
  expect(graded.result.score).toBe(0);
}

const CORRECT: Array<{ spec: ScenarioSpec; templateId: ScJunction2TemplateId; titleBg: string }> = [
  { spec: SC_JUNCTION_GAP, templateId: "sc-junction-gap", titleBg: SC_JUNCTION_GAP.titleBg },
  { spec: SC_JUNCTION_BLIND, templateId: "sc-junction-blind", titleBg: SC_JUNCTION_BLIND.titleBg },
];

for (const { spec, templateId, titleBg } of CORRECT) {
  describe(`S3 bot completion — ${templateId} („${titleBg}“) correct attempt at L3`, () => {
    const outcome = driveThroughSession(spec, templateId, "shadow-correct");

    it("completes the session: every objective done, zero violations, passed", () => {
      expect(outcome.session.phase).toBe("completed");
      expect(outcome.result.completedAll).toBe(true);
      expect(outcome.result.passed).toBe(true);
      expect(outcome.result.score).toBe(0);
      expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
      const violations = outcome.session.events.filter((e) => e.kind === "violation");
      expect(violations).toEqual([]);
    });

    it("the server regrades identically from the id alone (wire round-trip)", () => {
      expectWireRoundTrip(spec, outcome);
    });

    it("earns full stars from cleanliness (no measured channel; par time is informational)", () => {
      const rubric = scoreRubric(outcome.result, spec.rubric!);
      expect(rubric.stars).toBe(3);
      const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
      expect(parTime.measured).toBe(true);
      expect(parTime.points).toBeNull();
    });
  });
}

/** Violation codes graded by the production stack for a driven mistake. */
function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("S3 batch-4 counter-proofs — junction mistakes grade through the live pipeline", () => {
  it("sc-junction-gap cut-gap: FAILED_TO_YIELD grades through the give-way stack, not passed", () => {
    const outcome = driveThroughSession(SC_JUNCTION_GAP, "sc-junction-gap", "mistake-cut-gap");
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(driveViolationCodes(outcome)).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(outcome.result.passed).toBe(false);
    expect(scoreRubric(outcome.result, SC_JUNCTION_GAP.rubric!).stars).toBeLessThanOrEqual(2);
  });

  it("sc-junction-blind no-look: a live COLLISION terminates the session, rubric 1★", () => {
    const outcome = driveThroughSession(SC_JUNCTION_BLIND, "sc-junction-blind", "mistake-no-look");
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    const collisions = outcome.session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(outcome.result.passed).toBe(false);
    expect(outcome.result.summary.terminated).toBe(true);
    expect(scoreRubric(outcome.result, SC_JUNCTION_BLIND.rubric!).stars).toBe(1);
  });
});
