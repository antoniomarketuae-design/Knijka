/**
 * Bot-completion proof (doc 76 §10; the s3-sp-bot-completion mold) — the
 * CURVE-ENVELOPE template sc-sp-curve (SP-05 on the rural-curve archetype),
 * its shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScSpCurveDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proof rides the same live pipeline. SPEED_TOO_FAST_FOR_CURVE is
 * основна and unmapped-to-always-grade, so a FIRST occurrence is teach-first
 * (coached, not scored); the honest assertions for the guilty drive are that
 * the taught code SURFACES through the live rules, the shadow's positive
 * (CLEAN_DRIVING) is ABSENT, and the mid-curve control objective (cap 55)
 * does NOT complete at 70 km/h.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScSpCurveDrive } from "../../../traces/scSpCurve";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_SP_CURVE } from "../templates-sp";

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
  record: (district: unknown, onTick: OnTick) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(SC_SP_CURVE, 3);
  let session = createLessonSession(lesson);
  const drive = record(loadDistrict(SC_SP_CURVE.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return { session, result: buildLessonResult(session), drive };
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

describe("bot completion — sc-sp-curve („Скорост в завой“) correct attempt at L3", () => {
  const outcome = driveThroughSession((d, onTick) =>
    recordScSpCurveDrive(d, "shadow-correct", { onTick }),
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
      lessonId: `${SC_SP_CURVE.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_SP_CURVE.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_SP_CURVE.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_SP_CURVE.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("counter-proof — the curve overspeed grades through the live pipeline", () => {
  it("holding ~70 through the arc: SPEED_TOO_FAST_FOR_CURVE surfaces, clean-driving absent, the curve objective fails", () => {
    const outcome = driveThroughSession((d, onTick) =>
      recordScSpCurveDrive(d, "mistake-hold-speed", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 85 < 90: the approach is legal
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR"); // the interplay proof, live
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    const curveObjective = outcome.result.objectives.find((o) => o.id === "sc-spcv-curve");
    expect(curveObjective).toBeDefined();
    expect(curveObjective!.done).toBe(false); // 70 km/h can never tick the cap-55 control zone
    expect(outcome.result.completedAll).toBe(false);
  });
});
