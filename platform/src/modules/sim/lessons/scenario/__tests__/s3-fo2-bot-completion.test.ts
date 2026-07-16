/**
 * FO-pair bot-completion proofs (doc 76 §10; the s3-fo-bot-completion mold) —
 * the FOLLOWING family's actor pair (doc 72 FO-03 cut-in / FO-07 tailgater),
 * each shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. FOLLOWING_TOO_CLOSE (основна)
 * and HARSH_BRAKING_NO_CAUSE / SPEEDING_OVER_LIMIT surface through the live
 * rules; the shadow's positive (CLEAN_DRIVING) is ABSENT on every mistake.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScFollowCutinDrive, type ScFollowCutinTraceName } from "../../../traces/scFollowCutin";
import {
  recordScFollowTailgaterDrive,
  type ScFollowTailgaterTraceName,
} from "../../../traces/scFollowTailgater";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_FOLLOW_CUTIN, SC_FOLLOW_TAILGATER } from "../templates-following";
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
    spec: SC_FOLLOW_CUTIN,
    record: (d, onTick) => recordScFollowCutinDrive(d, "shadow-correct" as ScFollowCutinTraceName, { onTick }),
  },
  {
    spec: SC_FOLLOW_TAILGATER,
    record: (d, onTick) =>
      recordScFollowTailgaterDrive(d, "shadow-correct" as ScFollowTailgaterTraceName, { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`FO-pair bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("FO-pair counter-proofs — the mistakes grade through the live pipeline", () => {
  it("holding the stolen gap: FOLLOWING_TOO_CLOSE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_FOLLOW_CUTIN, (d, onTick) =>
      recordScFollowCutinDrive(d, "mistake-hold-gap", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("squeezing the cutter: FOLLOWING_TOO_CLOSE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_FOLLOW_CUTIN, (d, onTick) =>
      recordScFollowCutinDrive(d, "mistake-squeeze", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("the brake-check: HARSH_BRAKING_NO_CAUSE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_FOLLOW_TAILGATER, (d, onTick) =>
      recordScFollowTailgaterDrive(d, "mistake-brake-check", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("HARSH_BRAKING_NO_CAUSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("guilty speeding: SPEEDING_OVER_LIMIT surfaces (never the dangerous tier)", () => {
    const outcome = driveThroughSession(SC_FOLLOW_TAILGATER, (d, onTick) =>
      recordScFollowTailgaterDrive(d, "mistake-speed-up", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });
});
