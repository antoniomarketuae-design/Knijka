/**
 * RAIL-PACK ACTOR-SLICE bot-completion proofs (ADR-006 stage 3b; the s8-rail
 * mold) — the two TRAM templates (RX-05 / RX-04), each shadow driven through
 * the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScRxTramDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: the cut across the tram grades
 * FAILED_TO_YIELD through the runtime's own N1 tracker (no tram-specific
 * code — honest reuse), the squeeze past the stop grades
 * PEDESTRIAN_NOT_YIELDED, and the shadows' positive signals are absent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScRxTramDrive, type ScRxTramTemplateId } from "../../../traces/scRxTram";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_RX_TRAM_ISLAND, SC_RX_TRAM_LEFT } from "../templates-rail";
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

const CORRECT: Array<{ spec: ScenarioSpec; templateId: ScRxTramTemplateId }> = [
  { spec: SC_RX_TRAM_LEFT, templateId: "sc-rx-tram-left" },
  { spec: SC_RX_TRAM_ISLAND, templateId: "sc-rx-tram-island" },
];

for (const { spec, templateId } of CORRECT) {
  describe(`TRAM bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
    const outcome = driveThroughSession(spec, (d, onTick) =>
      recordScRxTramDrive(d, templateId, "shadow-correct", { onTick }),
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

describe("TRAM counter-proofs — the mistakes grade through the live pipeline", () => {
  it("cut across the oncoming tram: FAILED_TO_YIELD surfaces, no yield commendation", () => {
    const outcome = driveThroughSession(SC_RX_TRAM_LEFT, (d, onTick) =>
      recordScRxTramDrive(d, "sc-rx-tram-left", "mistake-cut-tram", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("FAILED_TO_YIELD");
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("squeeze past the island stop: PEDESTRIAN_NOT_YIELDED surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_RX_TRAM_ISLAND, (d, onTick) =>
      recordScRxTramDrive(d, "sc-rx-tram-island", "mistake-squeeze-past", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(driveCommendationCodes(outcome)).not.toContain("PEDESTRIAN_YIELDED");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });
});
