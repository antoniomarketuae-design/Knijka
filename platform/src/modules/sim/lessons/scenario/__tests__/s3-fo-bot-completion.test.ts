/**
 * S3-C bot-completion proofs (doc 76 §10; the s3-sp-bot-completion mold) — the
 * two FOLLOWING & GAP-MANAGEMENT templates (FO-01 / FO-02), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. FOLLOWING_TOO_CLOSE is основна
 * (3 т.) — a FIRST occurrence is teach-first (coached, not scored — coach.ts),
 * so the honest assertion for the tailgating demo is that the taught code
 * SURFACES through the live rules and the shadow's positive (CLEAN_DRIVING) is
 * ABSENT. COLLISION is опасна + terminating, graded on the spot, so the brake-
 * slam collision demo also does NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScFollowDistanceDrive, type ScFollowDistanceTraceName } from "../../../traces/scFollowDistance";
import { recordScFollowBrakeDrive, type ScFollowBrakeTraceName } from "../../../traces/scFollowBrake";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_FOLLOW_DISTANCE, SC_FOLLOW_BRAKE } from "../templates-following";
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
    spec: SC_FOLLOW_DISTANCE,
    record: (d, onTick) => recordScFollowDistanceDrive(d, "shadow-correct" as ScFollowDistanceTraceName, { onTick }),
  },
  {
    spec: SC_FOLLOW_BRAKE,
    record: (d, onTick) => recordScFollowBrakeDrive(d, "shadow-correct" as ScFollowBrakeTraceName, { onTick }),
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

describe("S3-C counter-proofs — following mistakes grade through the live pipeline", () => {
  it("tailgating: FOLLOWING_TOO_CLOSE surfaces through the stack, the clean-driving positive is absent", () => {
    const outcome = driveThroughSession(SC_FOLLOW_DISTANCE, (d, onTick) =>
      recordScFollowDistanceDrive(d, "mistake-tailgate", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("gap melts with speed: FOLLOWING_TOO_CLOSE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_FOLLOW_DISTANCE, (d, onTick) =>
      recordScFollowDistanceDrive(d, "mistake-gap-melts", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("late reaction to the slam: COLLISION grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_FOLLOW_BRAKE, (d, onTick) =>
      recordScFollowBrakeDrive(d, "mistake-late-reaction", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("COLLISION");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(outcome.result.passed).toBe(false);
  });

  it("no reaction to the slam: COLLISION grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_FOLLOW_BRAKE, (d, onTick) =>
      recordScFollowBrakeDrive(d, "mistake-no-reaction", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("COLLISION");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(outcome.result.passed).toBe(false);
  });
});
