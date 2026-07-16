/**
 * S6 breadth bot-completion proofs (doc 76 §10; the s3-*-bot-completion mold) —
 * the four SCENARIO-BREADTH templates, each shadow driven through the FULL
 * production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: each mistake's taught code
 * SURFACES through the live rules, and the shadow's positive is ABSENT. опасни
 * codes (FAILED_TO_YIELD / PEDESTRIAN_NOT_YIELDED / COLLISION / SPEEDING_DANGEROUS)
 * are graded on the spot, so those attempts also do NOT pass; the second-degree
 * SPEEDING_OVER_LIMIT is teach-first, so only the positive's absence is asserted.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScSpeedZoneDrive } from "../../../traces/scSpeedZone";
import { recordScCrossingDartDrive } from "../../../traces/scCrossingDart";
import { recordScJunctionLeftDrive } from "../../../traces/scJunctions3";
import { recordScOvNarrowDrive } from "../../../traces/scOvNarrow";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_CROSSING_DART } from "../templates-pe";
import { SC_SPEED_ZONE } from "../templates-sp";
import { SC_JUNCTION_LEFT } from "../templates-junctions2";
import { SC_OV_NARROW } from "../templates-lanes";
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
  record: (district: unknown, onTick: OnTick) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = record(loadDistrict(spec.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return { session, result: buildLessonResult(session), drive };
}

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

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const CORRECT: Array<{ spec: ScenarioSpec; record: (d: unknown, onTick: OnTick) => RecordedDrive }> = [
  { spec: SC_SPEED_ZONE, record: (d, onTick) => recordScSpeedZoneDrive(d, "shadow-correct", { onTick }) },
  { spec: SC_CROSSING_DART, record: (d, onTick) => recordScCrossingDartDrive(d, "shadow-correct", { onTick }) },
  { spec: SC_JUNCTION_LEFT, record: (d, onTick) => recordScJunctionLeftDrive(d, "shadow-correct", { onTick }) },
  { spec: SC_OV_NARROW, record: (d, onTick) => recordScOvNarrowDrive(d, "shadow-correct", { onTick }) },
];

for (const { spec, record } of CORRECT) {
  describe(`S6 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
    const outcome = driveThroughSession(spec, record);

    it("completes the session: every objective done, zero violations, passed", () => {
      expect(outcome.session.phase).toBe("completed");
      expect(outcome.result.completedAll).toBe(true);
      expect(outcome.result.passed).toBe(true);
      expect(outcome.result.score).toBe(0);
      expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
      expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
    });

    it("the server regrades identically from the id alone (wire round-trip)", () => {
      expectWireRoundTrip(spec, outcome);
    });

    it("earns full stars from cleanliness (par time is informational only)", () => {
      const rubric = scoreRubric(outcome.result, spec.rubric!);
      expect(rubric.stars).toBe(3);
    });
  });
}

describe("S6 counter-proofs — breadth mistakes grade through the live pipeline", () => {
  it("зона 30 boulevard speed: SPEEDING_OVER_LIMIT surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_SPEED_ZONE, (d, onTick) =>
      recordScSpeedZoneDrive(d, "mistake-boulevard-speed", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("SPEEDING_OVER_LIMIT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("зона 30 full 50: SPEEDING_DANGEROUS grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_SPEED_ZONE, (d, onTick) =>
      recordScSpeedZoneDrive(d, "mistake-full-speed", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(outcome.result.passed).toBe(false);
  });

  it("dart-out drive-through: PEDESTRIAN_NOT_YIELDED grades, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_DART, (d, onTick) =>
      recordScCrossingDartDrive(d, "mistake-not-yielded", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(outcome.result.passed).toBe(false);
  });

  it("dart-out strike: COLLISION grades, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_DART, (d, onTick) =>
      recordScCrossingDartDrive(d, "mistake-collision", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("left-turn cut-gap: FAILED_TO_YIELD grades, not passed", () => {
    const outcome = driveThroughSession(SC_JUNCTION_LEFT, (d, onTick) =>
      recordScJunctionLeftDrive(d, "mistake-cut-gap", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
  });

  it("narrow-meeting barge: FAILED_TO_YIELD grades, not passed", () => {
    const outcome = driveThroughSession(SC_OV_NARROW, (d, onTick) =>
      recordScOvNarrowDrive(d, "mistake-barge", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
  });
});
