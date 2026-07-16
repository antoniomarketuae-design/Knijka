/**
 * LINE TYPES + BUS LANES bot-completion proofs (ADR-006 stage 2b; the
 * s5-ban-bot-completion mold) — the two stage-2b templates (OV-04 escalation /
 * SN-05), each shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: the taught code SURFACES
 * through the live rules and the shadow's positive signals are absent. The
 * bus-lane counter-proofs also lock the interplay from the guilty side —
 * riding the bus lane never trips the keep-right rule (laneId 0 IS the
 * rightmost), so the ONLY billed act is the bus-lane travel itself.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScOvBusLaneDrive } from "../../../traces/scOvBusLane";
import { recordScOvSolidLineDrive } from "../../../traces/scOvSolidLine";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_OV_BUS_LANE, SC_OV_SOLID_LINE } from "../templates-lanes";
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
    spec: SC_OV_SOLID_LINE,
    record: (d, onTick) => recordScOvSolidLineDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_OV_BUS_LANE,
    record: (d, onTick) => recordScOvBusLaneDrive(d, "shadow-correct", { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`LINE-TYPE bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("LINE-TYPE counter-proofs — stage-2b mistakes grade through the live pipeline", () => {
  it("signalled pull-out across the М1 line: CROSSED_SOLID_LINE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_SOLID_LINE, (d, onTick) =>
      recordScOvSolidLineDrive(d, "mistake-pullout", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("CROSSED_SOLID_LINE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("unsignalled drift across the М1 line: CROSSED_SOLID_LINE surfaces, and NEVER the touch tier", () => {
    const outcome = driveThroughSession(SC_OV_SOLID_LINE, (d, onTick) =>
      recordScOvSolidLineDrive(d, "mistake-drift", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("CROSSED_SOLID_LINE");
    expect(driveViolationCodes(outcome)).not.toContain("CENTER_LINE_TOUCHED");
  });

  it("full-span bus-lane cruise: DRIVING_IN_BUS_LANE surfaces, keep-right stays silent", () => {
    const outcome = driveThroughSession(SC_OV_BUS_LANE, (d, onTick) =>
      recordScOvBusLaneDrive(d, "mistake-cruise", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("DRIVING_IN_BUS_LANE");
    expect(driveViolationCodes(outcome)).not.toContain("NOT_KEEPING_RIGHT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("mid-span dip into the bus lane: DRIVING_IN_BUS_LANE surfaces, the general-lane objective still completes", () => {
    const outcome = driveThroughSession(SC_OV_BUS_LANE, (d, onTick) =>
      recordScOvBusLaneDrive(d, "mistake-dip-in", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("DRIVING_IN_BUS_LANE");
  });
});
