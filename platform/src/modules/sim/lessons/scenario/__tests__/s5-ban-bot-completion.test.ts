/**
 * ZONE-BAN bot-completion proofs (ADR-006 stage 2a; the s3-ov-bot-completion
 * mold) — the two ban-zone templates (OV-06 / PK-06), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline. Both codes are основни (3 т.)
 * mapped to teach-first-then-grade scenario events (ev-overtake /
 * ev-illegal-stop-zone), so a FIRST occurrence is coached, not scored — the
 * honest assertion is that the taught code SURFACES through the live rules
 * and the shadow's positive signals are absent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScOvBanOvertakeDrive } from "../../../traces/scOvBanOvertake";
import { recordScPkBanStopDrive } from "../../../traces/scPkBanStop";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_OV_BAN_OVERTAKE } from "../templates-lanes";
import { SC_PK_BAN_STOP } from "../templates-pk";
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
    spec: SC_OV_BAN_OVERTAKE,
    record: (d, onTick) => recordScOvBanOvertakeDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_PK_BAN_STOP,
    record: (d, onTick) => recordScPkBanStopDrive(d, "shadow-correct", { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`ZONE-BAN bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("ZONE-BAN counter-proofs — ban-zone mistakes grade through the live pipeline", () => {
  it("in-zone overtake: OVERTAKING_IN_BAN_ZONE surfaces through the stack, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_BAN_OVERTAKE, (d, onTick) =>
      recordScOvBanOvertakeDrive(d, "mistake-overtake-in-zone", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKING_IN_BAN_ZONE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("early-jump overtake: OVERTAKING_IN_BAN_ZONE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_BAN_OVERTAKE, (d, onTick) =>
      recordScOvBanOvertakeDrive(d, "mistake-early-jump", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("OVERTAKING_IN_BAN_ZONE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("mid-zone rest: ILLEGAL_STOP_IN_BAN_ZONE surfaces, the legal-stop objective stays incomplete", () => {
    const outcome = driveThroughSession(SC_PK_BAN_STOP, (d, onTick) =>
      recordScPkBanStopDrive(d, "mistake-stop-in-zone", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(outcome.result.completedAll).toBe(false);
  });

  it("edge-of-zone rest: ILLEGAL_STOP_IN_BAN_ZONE surfaces through the live rules", () => {
    const outcome = driveThroughSession(SC_PK_BAN_STOP, (d, onTick) =>
      recordScPkBanStopDrive(d, "mistake-stop-at-edge", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });
});
