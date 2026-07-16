/**
 * Bot-completion proof (doc 76 §10; the s-sp-curve-bot-completion mold) — the
 * MOTORWAY-SEGMENT templates sc-mw-discipline (SP-10 + OV-11 at speed) and
 * sc-mw-emergency-lane (чл. 58, т. 3), their shadows driven through the FULL
 * production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScMw*Drive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: each taught code SURFACES
 * through the live rules, and the mistake drives fail the success contract
 * (the lane-pinned control zones / the unreached finish).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScMwDisciplineDrive } from "../../../traces/scMwDiscipline";
import { recordScMwEmergencyLaneDrive } from "../../../traces/scMwEmergencyLane";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_MW_DISCIPLINE } from "../templates-sp";
import { SC_MW_EMERGENCY_LANE } from "../templates-lanes";
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

function expectCleanCompletion(spec: ScenarioSpec, outcome: DriveOutcome): void {
  expect(outcome.session.phase).toBe("completed");
  expect(outcome.result.completedAll).toBe(true);
  expect(outcome.result.passed).toBe(true);
  expect(outcome.result.score).toBe(0);
  expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
  expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);

  // Wire round-trip: the server regrades identically from the id alone.
  const graded = gradeFinishWire({
    lessonId: `${spec.id}@L3`,
    startedAtMs: 1_000,
    finishedAtMs: 1_000 + Math.round(outcome.result.durationSec * 1000),
    aborted: false,
    ruleEvents: serializeRuleEvents(outcome.session.events),
    objectives: outcome.result.objectives.map((o) => ({
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

  // Full stars from cleanliness (par time is informational only).
  const rubric = scoreRubric(outcome.result, spec.rubric!);
  expect(rubric.stars).toBe(3);
  const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
  expect(parTime.measured).toBe(true);
  expect(parTime.points).toBeNull();
}

describe("bot completion — sc-mw-discipline („Дисциплина на магистралата“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_MW_DISCIPLINE, (d, onTick) =>
    recordScMwDisciplineDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session, regrades over the wire and earns 3★", () => {
    expectCleanCompletion(SC_MW_DISCIPLINE, outcome);
  });
});

describe("bot completion — sc-mw-emergency-lane („Аварийната лента“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_MW_EMERGENCY_LANE, (d, onTick) =>
    recordScMwEmergencyLaneDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session, regrades over the wire and earns 3★", () => {
    expectCleanCompletion(SC_MW_EMERGENCY_LANE, outcome);
  });
});

describe("counter-proofs — the motorway faults grade through the live pipeline", () => {
  it("the 130 left-lane hog: NOT_KEEPING_RIGHT surfaces, the lane-pinned zone fails, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_MW_DISCIPLINE, (d, onTick) =>
      recordScMwDisciplineDrive(d, "mistake-left-hog", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("SPEEDING_DANGEROUS"); // 130 < 140: the speed is legal
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    const laneObjective = outcome.result.objectives.find((o) => o.id === "sc-mwd-lane");
    expect(laneObjective).toBeDefined();
    expect(laneObjective!.done).toBe(false); // the radius-6 zone pins the CRUISE lane
    expect(outcome.result.completedAll).toBe(false);
  });

  it("the causeless 40 crawl: DRIVING_TOO_SLOW_FOR_MOTORWAY surfaces and the segment is never finished", () => {
    const outcome = driveThroughSession(SC_MW_DISCIPLINE, (d, onTick) =>
      recordScMwDisciplineDrive(d, "mistake-crawl", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    const finish = outcome.result.objectives.find((o) => o.id === "sc-mwd-finish");
    expect(finish).toBeDefined();
    expect(finish!.done).toBe(false);
    expect(outcome.result.completedAll).toBe(false);
  });

  it("the signalled undertake: EMERGENCY_LANE_DRIVING surfaces through the live rules (the indicator does not exempt)", () => {
    const outcome = driveThroughSession(SC_MW_EMERGENCY_LANE, (d, onTick) =>
      recordScMwEmergencyLaneDrive(d, "mistake-undertake", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("EMERGENCY_LANE_DRIVING");
    expect(codes).not.toContain("COLLISION"); // the demo teaches the ban, not a crash
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR"); // both drifts signalled
    expect(outcome.result.completedAll).toBe(false); // ends short of the finish zone
  });
});
