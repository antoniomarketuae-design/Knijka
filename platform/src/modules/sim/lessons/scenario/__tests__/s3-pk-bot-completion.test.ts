/**
 * S3-F bot-completion proof (doc 76 §10; the s3-ov-bot-completion mold) — the
 * PK precision-stop template (PK-14), shadow driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScPkSmoothStopDrive's
 *   onTick feeds applyTick every production frame → session completes (approach
 *   zone + low-speed stop-mark zone) → wire serialization → gradeFinishWire
 *   RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. COLLISION is опасна (10 т.) +
 * terminating, so both overrun demos do NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScPkSmoothStopDrive, type ScPkSmoothStopTraceName } from "../../../traces/scPkSmoothStop";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_PK_SMOOTH_STOP } from "../templates-pk";
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

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

describe("S3 bot completion — sc-pk-smooth-stop („Плавно спиране на позиция“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_PK_SMOOTH_STOP, (d, onTick) =>
    recordScPkSmoothStopDrive(d, "shadow-correct" as ScPkSmoothStopTraceName, { onTick }),
  );

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const { session, result } = outcome;
    const graded = gradeFinishWire({
      lessonId: `${SC_PK_SMOOTH_STOP.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_PK_SMOOTH_STOP.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_PK_SMOOTH_STOP.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_PK_SMOOTH_STOP.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("S3-F counter-proofs — the overrun mistakes grade through the live pipeline", () => {
  it("late-brake overrun: COLLISION surfaces, not passed", () => {
    const outcome = driveThroughSession(SC_PK_SMOOTH_STOP, (d, onTick) =>
      recordScPkSmoothStopDrive(d, "mistake-overshoot", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("too-fast approach: COLLISION surfaces, not passed", () => {
    const outcome = driveThroughSession(SC_PK_SMOOTH_STOP, (d, onTick) =>
      recordScPkSmoothStopDrive(d, "mistake-too-fast", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });
});
