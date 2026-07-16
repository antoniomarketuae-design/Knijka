/**
 * S3-A bot-completion proofs (doc 76 §10; the s2-flow mold) — the three
 * PEDESTRIAN templates (PE-03 / PE-08 / PE-16), each shadow driven through the
 * FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same pipeline: the let-pass not-yielded, slow-crosser
 * too-fast and rain-sprint not-yielded demos each grade their taught fault
 * through the live rules and do NOT pass.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import {
  recordScCrossingLetPassDrive,
  type ScCrossingLetPassTraceName,
} from "../../../traces/scCrossingLetPass";
import {
  recordScCrossingSlowCrosserDrive,
  type ScCrossingSlowCrosserTraceName,
} from "../../../traces/scCrossingSlowCrosser";
import {
  recordScCrossingRainSprintDrive,
  type ScCrossingRainSprintTraceName,
} from "../../../traces/scCrossingRainSprint";
import { recordScCrossingBusShadowDrive } from "../../../traces/scCrossingBusShadow";
import { recordScCrossingChildBallDrive } from "../../../traces/scCrossingChildBall";
import { recordScCrossingWhiteCaneDrive } from "../../../traces/scCrossingWhiteCane";
import { recordScPeJaywalkerDrive } from "../../../traces/scPeJaywalker";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import {
  SC_CROSSING_BUS_SHADOW,
  SC_CROSSING_CHILD_BALL,
  SC_CROSSING_LET_PASS,
  SC_CROSSING_RAIN_SPRINT,
  SC_CROSSING_SLOW_CROSSER,
  SC_CROSSING_WHITE_CANE,
  SC_PE_JAYWALKER,
} from "../templates-pe";
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
  {
    spec: SC_CROSSING_LET_PASS,
    record: (d, onTick) =>
      recordScCrossingLetPassDrive(d, "shadow-correct" as ScCrossingLetPassTraceName, { onTick }),
  },
  {
    spec: SC_CROSSING_SLOW_CROSSER,
    record: (d, onTick) =>
      recordScCrossingSlowCrosserDrive(d, "shadow-correct" as ScCrossingSlowCrosserTraceName, { onTick }),
  },
  {
    spec: SC_CROSSING_RAIN_SPRINT,
    record: (d, onTick) =>
      recordScCrossingRainSprintDrive(d, "shadow-correct" as ScCrossingRainSprintTraceName, { onTick }),
  },
  {
    spec: SC_CROSSING_BUS_SHADOW,
    record: (d, onTick) => recordScCrossingBusShadowDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_CROSSING_CHILD_BALL,
    record: (d, onTick) => recordScCrossingChildBallDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_PE_JAYWALKER,
    record: (d, onTick) => recordScPeJaywalkerDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_CROSSING_WHITE_CANE,
    record: (d, onTick) => recordScCrossingWhiteCaneDrive(d, "shadow-correct", { onTick }),
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

describe("S3-A counter-proofs — pedestrian mistakes grade through the live pipeline", () => {
  it("let-pass squeeze: PEDESTRIAN_NOT_YIELDED grades through the stack, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_LET_PASS, (d, onTick) =>
      recordScCrossingLetPassDrive(d, "mistake-not-yielded", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(outcome.result.passed).toBe(false);
  });

  it("slow-crosser too-fast: PEDESTRIAN_CROSSING_TOO_FAST grades through the stack, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_SLOW_CROSSER, (d, onTick) =>
      recordScCrossingSlowCrosserDrive(d, "mistake-too-fast", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(outcome.result.passed).toBe(false);
  });

  it("rain-sprint not-yielded: PEDESTRIAN_NOT_YIELDED grades under rain+night, no collision, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_RAIN_SPRINT, (d, onTick) =>
      recordScCrossingRainSprintDrive(d, "mistake-not-yielded", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("bus-shadow strike: COLLISION grades through the stack, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_BUS_SHADOW, (d, onTick) =>
      recordScCrossingBusShadowDrive(d, "mistake-collision", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("child-ball too-fast: PEDESTRIAN_CROSSING_TOO_FAST grades, no collision, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_CHILD_BALL, (d, onTick) =>
      recordScCrossingChildBallDrive(d, "mistake-too-fast", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).not.toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("white-cane not-yielded: PEDESTRIAN_NOT_YIELDED grades, no collision, not passed", () => {
    const outcome = driveThroughSession(SC_CROSSING_WHITE_CANE, (d, onTick) =>
      recordScCrossingWhiteCaneDrive(d, "mistake-not-yielded", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });

  it("jaywalker my-green: PEDESTRIAN_NOT_YIELDED grades on a GREEN light, not passed", () => {
    const outcome = driveThroughSession(SC_PE_JAYWALKER, (d, onTick) =>
      recordScPeJaywalkerDrive(d, "mistake-my-green", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("COLLISION");
    expect(outcome.result.passed).toBe(false);
  });
});
