/**
 * S3-E bot-completion proofs (doc 76 §10; the s3-sp-bot-completion mold) — the
 * three LANE-DISCIPLINE templates (OV-11 / OV-12+OV-04 / OV-13), each shadow
 * driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. NOT_KEEPING_RIGHT, POOR_LANE_KEEPING
 * and CENTER_LINE_TOUCHED are второстепенни (1 т.), so a FIRST occurrence is
 * teach-first (coached, not scored — engine.ts): the honest assertion is that
 * the taught code SURFACES through the live rules and the shadow's positive
 * (CLEAN_DRIVING) is ABSENT. WRONG_WAY is опасна (10 т.), graded on the spot, so
 * that demo also does NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScOvKeepRightDrive, type ScOvKeepRightTraceName } from "../../../traces/scOvKeepRight";
import { recordScOvLaneKeepingDrive, type ScOvLaneKeepingTraceName } from "../../../traces/scOvLaneKeeping";
import { recordScOvOneWayDrive, type ScOvOneWayTraceName } from "../../../traces/scOvOneWay";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_OV_KEEP_RIGHT, SC_OV_LANE_KEEPING, SC_OV_ONEWAY } from "../templates-lanes";
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
  {
    spec: SC_OV_KEEP_RIGHT,
    record: (d, onTick) => recordScOvKeepRightDrive(d, "shadow-correct" as ScOvKeepRightTraceName, { onTick }),
  },
  {
    spec: SC_OV_LANE_KEEPING,
    record: (d, onTick) => recordScOvLaneKeepingDrive(d, "shadow-correct" as ScOvLaneKeepingTraceName, { onTick }),
  },
  {
    spec: SC_OV_ONEWAY,
    record: (d, onTick) => recordScOvOneWayDrive(d, "shadow-correct" as ScOvOneWayTraceName, { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`S3 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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
      const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
      expect(parTime.measured).toBe(true);
      expect(parTime.points).toBeNull();
    });
  });
}

describe("S3-E counter-proofs — lane-discipline mistakes grade through the live pipeline", () => {
  it("left-lane hog: NOT_KEEPING_RIGHT surfaces through the stack, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_KEEP_RIGHT, (d, onTick) =>
      recordScOvKeepRightDrive(d, "mistake-hog", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("NOT_KEEPING_RIGHT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("curb-edge straddle: POOR_LANE_KEEPING surfaces, no center-line code, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_LANE_KEEPING, (d, onTick) =>
      recordScOvLaneKeepingDrive(d, "mistake-straddle", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("center-line ride: CENTER_LINE_TOUCHED surfaces, no generic lane-keeping, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_LANE_KEEPING, (d, onTick) =>
      recordScOvLaneKeepingDrive(d, "mistake-center-line", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("wrong-way entry: WRONG_WAY grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_OV_ONEWAY, (d, onTick) =>
      recordScOvOneWayDrive(d, "mistake-wrong-way", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("WRONG_WAY");
    expect(outcome.result.passed).toBe(false);
  });
});
