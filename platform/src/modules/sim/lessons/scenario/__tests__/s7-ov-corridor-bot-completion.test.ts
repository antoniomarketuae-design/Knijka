/**
 * OVERTAKE-CORRIDOR bot-completion proofs (doc 72 OV-05/OV-08; the
 * s5-line-bot-completion mold) — the two corridor templates
 * (sc-ov-oncoming-gap / sc-ov-abort), each shadow driven through the FULL
 * production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: OVERTAKE_INSUFFICIENT_GAP
 * surfaces through the live rules for every mistake demo, the head-on demo
 * additionally grades COLLISION, and the shadows' positives stay absent from
 * the guilty runs. The ABORT shadow completing with ZERO violations is the
 * discipline's own proof living in the pipeline: an aborted overtake never
 * convicts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScOvAbortDrive } from "../../../traces/scOvAbort";
import { recordScOvOncomingGapDrive } from "../../../traces/scOvOncomingGap";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_OV_ABORT, SC_OV_ONCOMING_GAP } from "../templates-lanes";
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
    spec: SC_OV_ONCOMING_GAP,
    record: (d, onTick) => recordScOvOncomingGapDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_OV_ABORT,
    record: (d, onTick) => recordScOvAbortDrive(d, "shadow-correct", { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`OV-corridor bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

    it("the staged oncoming resolved as a clean encounter (the choreography completed)", () => {
      expect(
        outcome.drive.outcomes.some((o) => o.kind === "oncomingStream" && o.detail === "clear"),
      ).toBe(true);
    });
  });
}

describe("OV-corridor counter-proofs — the mistakes grade through the live pipeline", () => {
  it("tight-gap pull-out: OVERTAKE_INSUFFICIENT_GAP surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_ONCOMING_GAP, (d, onTick) =>
      recordScOvOncomingGapDrive(d, "mistake-tight-gap", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("overstayed pass: OVERTAKE_INSUFFICIENT_GAP surfaces — same code, second flavor", () => {
    const outcome = driveThroughSession(SC_OV_ONCOMING_GAP, (d, onTick) =>
      recordScOvOncomingGapDrive(d, "mistake-overstay", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKE_INSUFFICIENT_GAP");
    // Never the head-on itself — the demo slots back with metres to spare.
    expect(driveViolationCodes(outcome)).not.toContain("COLLISION");
  });

  it("pushing on instead of aborting: OVERTAKE_INSUFFICIENT_GAP surfaces (the abort's guilty twin)", () => {
    const outcome = driveThroughSession(SC_OV_ABORT, (d, onTick) =>
      recordScOvAbortDrive(d, "mistake-push-on", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(driveViolationCodes(outcome)).not.toContain("COLLISION");
  });

  it("never aborting at all: the conviction AND the head-on COLLISION (session terminates)", () => {
    const outcome = driveThroughSession(SC_OV_ABORT, (d, onTick) =>
      recordScOvAbortDrive(d, "mistake-head-on", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });
});
