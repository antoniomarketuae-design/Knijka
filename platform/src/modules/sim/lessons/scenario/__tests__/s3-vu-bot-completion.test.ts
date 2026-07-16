/**
 * S3-F bot-completion proof (doc 76 §10; the s3-ov-bot-completion mold) — the
 * VRU template (VU-01), shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScVuCyclistDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. FAILED_TO_YIELD is опасна (10 т.),
 * graded on the spot, so both hook demos do NOT pass and the shadow's
 * YIELDED_TO_PRIORITY commendation is ABSENT from them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScVuCyclistDrive, type ScVuCyclistTraceName } from "../../../traces/scVuCyclist";
import { recordScVuEmergencyDrive } from "../../../traces/scVuEmergency";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VU_CYCLIST_HOOK, SC_VU_EMERGENCY } from "../templates-vru";
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
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

describe("S3 bot completion — sc-vu-cyclist-hook („Десен завой през велосипедист“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_CYCLIST_HOOK, (d, onTick) =>
    recordScVuCyclistDrive(d, "shadow-correct" as ScVuCyclistTraceName, { onTick }),
  );

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
      lessonId: `${SC_VU_CYCLIST_HOOK.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_VU_CYCLIST_HOOK.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_VU_CYCLIST_HOOK.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_CYCLIST_HOOK.rubric!);
    expect(rubric.stars).toBe(3);
    const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
    expect(parTime.measured).toBe(true);
    expect(parTime.points).toBeNull();
  });
});

describe("S3-F counter-proofs — the right-hook mistakes grade through the live pipeline", () => {
  it("gap-misjudge hook: FAILED_TO_YIELD surfaces, not passed, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_CYCLIST_HOOK, (d, onTick) =>
      recordScVuCyclistDrive(d, "mistake-hook", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("no-blind-spot-check hook: FAILED_TO_YIELD surfaces, not passed", () => {
    const outcome = driveThroughSession(SC_VU_CYCLIST_HOOK, (d, onTick) =>
      recordScVuCyclistDrive(d, "mistake-no-look", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ADR-006 stage 1b — sc-vu-emergency („Линейка отзад", VU-09) rides the same
// live-pipeline proof: the make-way shadow completes at L3 and regrades
// identically over the wire; both refusal demos convict EMERGENCY_NOT_YIELDED
// (опасна, 10 т.) on the spot and do NOT pass.
// ---------------------------------------------------------------------------

describe("S3 bot completion — sc-vu-emergency („Линейка отзад“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_EMERGENCY, (d, onTick) =>
    recordScVuEmergencyDrive(d, "shadow-correct", { onTick }),
  );

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
      lessonId: `${SC_VU_EMERGENCY.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_VU_EMERGENCY.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_VU_EMERGENCY.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_EMERGENCY.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("ADR-006 counter-proofs — refusing the emergency vehicle grades through the live pipeline", () => {
  it("lane-center block: EMERGENCY_NOT_YIELDED surfaces, not passed, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_EMERGENCY, (d, onTick) =>
      recordScVuEmergencyDrive(d, "mistake-block", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("EMERGENCY_NOT_YIELDED");
    expect(driveViolationCodes(outcome)).not.toContain("FAILED_TO_YIELD");
    expect(outcome.result.passed).toBe(false);
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("speed-up / drift-left: EMERGENCY_NOT_YIELDED surfaces, not passed", () => {
    const outcome = driveThroughSession(SC_VU_EMERGENCY, (d, onTick) =>
      recordScVuEmergencyDrive(d, "mistake-speed-up", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("EMERGENCY_NOT_YIELDED");
    expect(outcome.result.passed).toBe(false);
  });
});
