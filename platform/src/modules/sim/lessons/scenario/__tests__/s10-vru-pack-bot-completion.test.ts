/**
 * N8 slice-1 bot-completion proof (doc 76 §10; the s3-vu-bot-completion mold)
 * — the VRU-interaction pack templates (VU-02 + VU-04), shadows driven through
 * the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → the trace script's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline:
 *  - VULNERABLE_PASS_TOO_CLOSE is основна (3 т.), teach-first at L3 (coached
 *    on first encounter — engine.ts), so the honest assertion is that the
 *    taught code SURFACES through the live rules and the shadow's
 *    YIELDED_TO_PRIORITY is ABSENT;
 *  - the door COLLISION (10 т. + terminate) and the swerve's
 *    CROSSED_SOLID_LINE (опасна, 10 т.) grade on the spot — those demos do
 *    NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScVuDoorDrive } from "../../../traces/scVuDoorZone";
import { recordScVuPassDrive } from "../../../traces/scVuPass";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VU_DOOR_ZONE, SC_VU_PASS_CLEARANCE } from "../templates-vru";
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

function assertWireRoundTrip(spec: ScenarioSpec, outcome: DriveOutcome): void {
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

describe("N8 bot completion — sc-vu-pass-clearance („Изпреварване на велосипедист“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
    recordScVuPassDrive(d, "shadow-correct", { onTick }),
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
    assertWireRoundTrip(SC_VU_PASS_CLEARANCE, outcome);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_PASS_CLEARANCE.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("N8 counter-proofs — the close passes grade through the live pipeline", () => {
  it("slow squeeze: VULNERABLE_PASS_TOO_CLOSE surfaces, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
      recordScVuPassDrive(d, "mistake-squeeze", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(driveViolationCodes(outcome)).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("fast late-dive pass: VULNERABLE_PASS_TOO_CLOSE surfaces, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
      recordScVuPassDrive(d, "mistake-fast-close", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });
});

describe("N8 bot completion — sc-vu-door-zone („Зоната на вратата“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
    recordScVuDoorDrive(d, "shadow-correct", { onTick }),
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
    assertWireRoundTrip(SC_VU_DOOR_ZONE, outcome);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_DOOR_ZONE.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("N8 counter-proofs — the door-zone mistakes grade through the live pipeline", () => {
  it("hugging the row: COLLISION (the door) grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
      recordScVuDoorDrive(d, "mistake-hug", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(driveViolationCodes(outcome)).not.toContain("CROSSED_SOLID_LINE");
    expect(outcome.result.passed).toBe(false);
  });

  it("the late dodge: CROSSED_SOLID_LINE grades on the spot, no collision, not passed", () => {
    const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
      recordScVuDoorDrive(d, "mistake-swerve", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("CROSSED_SOLID_LINE");
    expect(driveViolationCodes(outcome)).not.toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });
});
