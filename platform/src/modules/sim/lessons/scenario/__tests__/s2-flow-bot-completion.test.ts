/**
 * S2-C bot-completion proofs (doc 76 §10; the s2-junction mold) — the three
 * FLOW templates (pedestrians · roundabout · lanes), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same pipeline: the zebra not-yielded, roundabout
 * barge and lane no-indicator demos each grade their taught fault through the
 * live rules and do NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScZebraApproachDrive, type ScZebraApproachTraceName } from "../../../traces/scZebraApproach";
import { recordScRoundaboutEntryDrive, type ScRoundaboutEntryTraceName } from "../../../traces/scRoundaboutEntry";
import { recordScLaneChangeDrive, type ScLaneChangeTraceName } from "../../../traces/scLaneChange";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_LANE_CHANGE, SC_ROUNDABOUT_ENTRY, SC_ZEBRA_APPROACH } from "../templates-flow";
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

const CORRECT: Array<{ spec: ScenarioSpec; record: (d: unknown, onTick: OnTick) => RecordedDrive }> = [
  { spec: SC_ZEBRA_APPROACH, record: (d, onTick) => recordScZebraApproachDrive(d, "shadow-correct" as ScZebraApproachTraceName, { onTick }) },
  { spec: SC_ROUNDABOUT_ENTRY, record: (d, onTick) => recordScRoundaboutEntryDrive(d, "shadow-correct" as ScRoundaboutEntryTraceName, { onTick }) },
  { spec: SC_LANE_CHANGE, record: (d, onTick) => recordScLaneChangeDrive(d, "shadow-correct" as ScLaneChangeTraceName, { onTick }) },
];

for (const { spec, record } of CORRECT) {
  describe(`S2 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("S2-C counter-proofs — flow mistakes grade through the live pipeline", () => {
  it("zebra not-yielded: PEDESTRIAN_NOT_YIELDED grades through the stack, not passed", () => {
    const outcome = driveThroughSession(SC_ZEBRA_APPROACH, (d, onTick) =>
      recordScZebraApproachDrive(d, "mistake-not-yielded", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(outcome.result.passed).toBe(false);
  });

  it("roundabout barge: FAILED_TO_YIELD grades through the stack, not passed", () => {
    const outcome = driveThroughSession(SC_ROUNDABOUT_ENTRY, (d, onTick) =>
      recordScRoundaboutEntryDrive(d, "mistake-barge-entry", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
  });

  it("lane no-indicator: grades LANE_CHANGE_WITHOUT_INDICATOR instead of the clean shadow's commendation", () => {
    const outcome = driveThroughSession(SC_LANE_CHANGE, (d, onTick) =>
      recordScLaneChangeDrive(d, "mistake-no-indicator", { onTick }),
    );
    // The taught fault grades through the full production stack — and unlike
    // the shadow, this drive does NOT earn SAFE_LANE_CHANGE (a missing
    // indicator is a minor, non-failing fault surfaced in the debrief).
    expect(driveViolationCodes(outcome)).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    const commendations = outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commendations).not.toContain("SAFE_LANE_CHANGE");
  });
});
