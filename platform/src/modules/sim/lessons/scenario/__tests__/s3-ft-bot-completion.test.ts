/**
 * FO-06 bot-completion proof (doc 76 §10; the s3-pk-bot-completion mold) — the
 * sc-follow-truck template (the large-vehicle actor profile), shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScFollowTruckDrive's
 *   onTick feeds applyTick every production frame → session completes (calm
 *   blocked-vision follow + finish zone) → wire serialization → gradeFinishWire
 *   RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the recorder's rule channel: both tuck-in mistakes
 * surface EXACTLY FOLLOWING_TOO_CLOSE through the production stack — the
 * FO-06 promise ("box truck visual; leadGap detector unchanged, zero grading
 * change") holds end to end.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScFollowTruckDrive, type ScFollowTruckTraceName } from "../../../traces/scFollowTruck";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_FOLLOW_TRUCK } from "../templates-following";
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

describe("FO-06 bot completion — sc-follow-truck („Зад камион“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_FOLLOW_TRUCK, (d, onTick) =>
    recordScFollowTruckDrive(d, "shadow-correct" as ScFollowTruckTraceName, { onTick }),
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
      lessonId: `${SC_FOLLOW_TRUCK.id}@L3`,
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
    expect(graded.lesson.id).toBe(`${SC_FOLLOW_TRUCK.id}@L3`);
    expect(graded.lesson).toEqual(scenarioLessonById(`${SC_FOLLOW_TRUCK.id}@L3`));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_FOLLOW_TRUCK.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("FO-06 counter-proofs — the tuck-in mistakes grade through the live pipeline", () => {
  it("steady tailgate at 48 km/h: FOLLOWING_TOO_CLOSE surfaces, nothing else", () => {
    const outcome = driveThroughSession(SC_FOLLOW_TRUCK, (d, onTick) =>
      recordScFollowTruckDrive(d, "mistake-tailgate", { onTick }),
    );
    const codes = [...new Set(driveViolationCodes(outcome))];
    expect(codes).toEqual(["FOLLOWING_TOO_CLOSE"]);
  });

  it("closing in „to see past the truck“: FOLLOWING_TOO_CLOSE surfaces, nothing else", () => {
    const outcome = driveThroughSession(SC_FOLLOW_TRUCK, (d, onTick) =>
      recordScFollowTruckDrive(d, "mistake-peek", { onTick }),
    );
    const codes = [...new Set(driveViolationCodes(outcome))];
    expect(codes).toEqual(["FOLLOWING_TOO_CLOSE"]);
  });
});
