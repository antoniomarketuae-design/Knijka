/**
 * Signals-family bot-completion proof (doc 76 §10; the s3-vu-bot-completion
 * mold) — the dead/flashing-signal templates (JU-20), shadows driven through
 * the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScSignalDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * The capability is exercised live: the recorder dials sx-n-c DARK / flashing
 * amber, so the shadow gives way to the car from the right and completes with
 * ZERO violations. Counter-proofs ride the same live pipeline — FAILED_TO_YIELD
 * is опасна (10 т.), graded on the spot, so no mistake passes and the shadow's
 * YIELDED_TO_PRIORITY commendation is ABSENT from them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScSignalDrive,
  type ScSignalTemplateId,
  type ScSignalTraceName,
} from "../../../traces/scSignals";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_SIGNAL_DEAD, SC_SIGNAL_FLASHING } from "../templates-signals";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

type OnTick = (tick: Parameters<typeof applyTick>[1]) => void;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

function driveThroughSession(
  spec: ScenarioSpec,
  templateId: ScSignalTemplateId,
  name: ScSignalTraceName,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = recordScSignalDrive(loadDistrict(spec.map.districtId), templateId, name, {
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

const CASES: Array<{ spec: ScenarioSpec; id: ScSignalTemplateId }> = [
  { spec: SC_SIGNAL_DEAD, id: "sc-signal-dead" },
  { spec: SC_SIGNAL_FLASHING, id: "sc-signal-flashing" },
];

for (const { spec, id } of CASES) {
  describe(`signals bot completion — ${id} correct attempt at L3`, () => {
    const outcome = driveThroughSession(spec, id, "shadow-correct");

    it("completes the session: every objective done, zero violations, passed", () => {
      expect(outcome.session.phase).toBe("completed");
      expect(outcome.result.completedAll).toBe(true);
      expect(outcome.result.passed).toBe(true);
      expect(outcome.result.score).toBe(0);
      expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
      expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
      expect(driveCommendationCodes(outcome)).toContain("YIELDED_TO_PRIORITY");
    });

    it("the server regrades identically from the id alone (wire round-trip)", () => {
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
    });

    it("earns full stars from cleanliness (par time is informational only)", () => {
      const rubric = scoreRubric(outcome.result, spec.rubric!);
      expect(rubric.stars).toBe(3);
      const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
      expect(parTime.measured).toBe(true);
      expect(parTime.points).toBeNull();
    });
  });

  describe(`signals counter-proofs — ${id} mistakes grade through the live pipeline`, () => {
    for (const name of ["mistake-barge", "mistake-cut"] as const) {
      it(`${name}: FAILED_TO_YIELD surfaces, not passed, no yield commendation`, () => {
        const outcome = driveThroughSession(spec, id, name);
        expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
        expect(outcome.result.passed).toBe(false);
        expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
      });
    }
  });
}
