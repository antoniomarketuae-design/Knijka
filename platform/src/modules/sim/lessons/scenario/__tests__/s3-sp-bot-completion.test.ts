/**
 * S3-B bot-completion proofs (doc 76 §10; the s3-pe-bot-completion mold) — the
 * three SPEED-MANAGEMENT templates (SP-01 / SP-02 / SP-04), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. Because SPEEDING_OVER_LIMIT and
 * SPEED_TOO_FAST_FOR_CONDITIONS are второстепенни (1 т.), a FIRST occurrence is
 * teach-first (coached, not scored — engine.ts), so `passed` can stay true for
 * those; the honest assertion for a minor fault is that the taught code
 * SURFACES through the live rules and the shadow's positive (CLEAN_DRIVING) is
 * ABSENT. The dangerous demo (SPEEDING_DANGEROUS, опасна) is graded on the spot,
 * so it also does NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScSpeedCreepDrive, type ScSpeedCreepTraceName } from "../../../traces/scSpeedCreep";
import { recordScSpeedDangerousDrive, type ScSpeedDangerousTraceName } from "../../../traces/scSpeedDanger";
import { recordScSpeedRainDrive, type ScSpeedRainTraceName } from "../../../traces/scSpeedRain";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_SPEED_CREEP, SC_SPEED_DANGEROUS, SC_SPEED_RAIN } from "../templates-sp";
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
    spec: SC_SPEED_CREEP,
    record: (d, onTick) => recordScSpeedCreepDrive(d, "shadow-correct" as ScSpeedCreepTraceName, { onTick }),
  },
  {
    spec: SC_SPEED_DANGEROUS,
    record: (d, onTick) => recordScSpeedDangerousDrive(d, "shadow-correct" as ScSpeedDangerousTraceName, { onTick }),
  },
  {
    spec: SC_SPEED_RAIN,
    record: (d, onTick) => recordScSpeedRainDrive(d, "shadow-correct" as ScSpeedRainTraceName, { onTick }),
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

describe("S3-B counter-proofs — speed mistakes grade through the live pipeline", () => {
  it("chasing the flow to 66: SPEEDING_DANGEROUS grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_SPEED_DANGEROUS, (d, onTick) =>
      recordScSpeedDangerousDrive(d, "mistake-chase-flow", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(outcome.result.passed).toBe(false);
  });

  it("pacing the flow at 58: SPEEDING_OVER_LIMIT surfaces (the band's other side), clean-driving absent", () => {
    const outcome = driveThroughSession(SC_SPEED_DANGEROUS, (d, onTick) =>
      recordScSpeedDangerousDrive(d, "mistake-pace-flow", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("creeping over: SPEEDING_OVER_LIMIT surfaces through the stack, the clean-driving positive is absent", () => {
    const outcome = driveThroughSession(SC_SPEED_CREEP, (d, onTick) =>
      recordScSpeedCreepDrive(d, "mistake-flow-along", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("SPEEDING_OVER_LIMIT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("creeping in the ZONE 30 of the P5 road: SPEEDING_OVER_LIMIT against the LOCAL 30, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_SPEED_CREEP, (d, onTick) =>
      recordScSpeedCreepDrive(d, "mistake-zone-creep", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("rain over-speed to 72: SPEEDING_DANGEROUS grades under rain+night (+22 past the В26-50), no minor or conditions code, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_SPEED_RAIN, (d, onTick) =>
      recordScSpeedRainDrive(d, "mistake-dry-speed", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    // 72 > graced 55 puts it out of the conditions code's at/under-graced range —
    // the wet envelope is proven by the „поток" demo below, not this one.
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(outcome.result.passed).toBe(false);
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("pacing the flow at 48 in the rain: SPEED_TOO_FAST_FOR_CONDITIONS surfaces (legal by the sign, too fast for the wet), no speeding code, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_SPEED_RAIN, (d, onTick) =>
      recordScSpeedRainDrive(d, "mistake-flow-along", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });
});
