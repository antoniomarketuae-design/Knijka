/**
 * RAIL PACK slice-1 bot-completion proofs (ADR-006 stage 3a; the s5-ban mold)
 * — the two rail-crossing templates (RX-02 / RX-01), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScRx*Drive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: the опасна
 * RAIL_CROSSING_VIOLATION surfaces through the live rules, the shadow's
 * positive signals are absent, and the stop/wait objective (completable only
 * at near-stop speed at the line) stays incomplete on the blast-through
 * demos.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScRxGuardedDrive } from "../../../traces/scRxGuarded";
import { recordScRxUnguardedDrive } from "../../../traces/scRxUnguarded";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_RX_GUARDED, SC_RX_UNGUARDED } from "../templates-rail";
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
    spec: SC_RX_UNGUARDED,
    record: (d, onTick) => recordScRxUnguardedDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_RX_GUARDED,
    record: (d, onTick) => recordScRxGuardedDrive(d, "shadow-correct", { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`RAIL bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("RAIL counter-proofs — crossing mistakes grade through the live pipeline", () => {
  it("unguarded roll-through: RAIL_CROSSING_VIOLATION surfaces, the stop objective stays incomplete", () => {
    const outcome = driveThroughSession(SC_RX_UNGUARDED, (d, onTick) =>
      recordScRxUnguardedDrive(d, "mistake-roll-through", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("RAIL_CROSSING_VIOLATION");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    const stopObjective = outcome.result.objectives.find((o) => o.id === "sc-rxu-stop")!;
    expect(stopObjective.done).toBe(false);
  });

  it("mid-band freeze: RAIL_CROSSING_VIOLATION surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_RX_UNGUARDED, (d, onTick) =>
      recordScRxUnguardedDrive(d, "mistake-stop-on-track", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("RAIL_CROSSING_VIOLATION");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("barred blast-through: RAIL_CROSSING_VIOLATION surfaces, the wait objective stays incomplete", () => {
    const outcome = driveThroughSession(SC_RX_GUARDED, (d, onTick) =>
      recordScRxGuardedDrive(d, "mistake-run-barrier", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("RAIL_CROSSING_VIOLATION");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    const waitObjective = outcome.result.objectives.find((o) => o.id === "sc-rxg-wait")!;
    expect(waitObjective.done).toBe(false);
  });

  it("polite-stop-then-creep: RAIL_CROSSING_VIOLATION surfaces through the live rules", () => {
    const outcome = driveThroughSession(SC_RX_GUARDED, (d, onTick) =>
      recordScRxGuardedDrive(d, "mistake-creep-barred", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("RAIL_CROSSING_VIOLATION");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });
});
