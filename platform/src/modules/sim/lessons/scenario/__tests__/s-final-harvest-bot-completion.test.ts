/**
 * Final-harvest bot-completion proofs (doc 76 §10; the s4-ac-vp / s-maneuver
 * mold) — the final tractable-pool scenarios, each shadow driven through the
 * FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 * Counter-proofs ride the same live pipeline: each mistake's fault SURFACES
 * through the live rules (for the config-gated move-off drill, that is the
 * compiled lesson.ruleConfig reaching createLessonSession) and the shadow's
 * positive is ABSENT.
 *
 *   - sc-pk-move-off       (PK-05) MOVE_OFF_WITHOUT_OBSERVATION — config-gated
 *   - sc-pk-driveway       (PK-11) parkInBay + COLLISION (reverse into driveway)
 *   - sc-signal-hesitation (JU-09) HESITATION_AT_GREEN (freeze on a live green)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScPkMoveOffDrive } from "../../../traces/scPkMoveOff";
import { recordScPkDrivewayDrive } from "../../../traces/scPkDriveway";
import { recordScSignalHesitationDrive } from "../../../traces/scSignalHesitation";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { parkingObservationFromTrace } from "../observation";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_PK_MOVE_OFF } from "../templates-cockpit";
import { SC_PK_DRIVEWAY } from "../templates-pk";
import { SC_SIGNAL_HESITATION } from "../templates-signals";
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

function sessionViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.session.events.filter((e) => e.kind === "violation").map((e) => e.code);
}
// The raw rule-engine log (the recorder's grader, run under the same
// ruleConfig the compiled lesson carries). The LIVE session applies teach-
// first-then-grade — a first mistake becomes a TEACH moment, not a scored
// session event — so counter-proofs read the raw grading here, exactly like
// the s4-ac-vp / s3 config-gated mold.
function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

// ---------------------------------------------------------------------------
// sc-pk-move-off (PK-05) — the config-gated move-off-observation drill
// ---------------------------------------------------------------------------

describe("final harvest bot completion — sc-pk-move-off correct move-off at L3", () => {
  const outcome = driveThroughSession(SC_PK_MOVE_OFF, (d, onTick) =>
    recordScPkMoveOffDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(sessionViolationCodes(outcome)).toEqual([]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_PK_MOVE_OFF, outcome);
  });

  it("earns full stars from cleanliness (par time informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_PK_MOVE_OFF.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("final harvest counter-proof — the config-gated drill grades through the live pipeline", () => {
  it("move-off blind: MOVE_OFF_WITHOUT_OBSERVATION surfaces (compiled lesson.ruleConfig enables it), no speed/lane leak", () => {
    const outcome = driveThroughSession(SC_PK_MOVE_OFF, (d, onTick) =>
      recordScPkMoveOffDrive(d, "mistake-no-look", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    // The fault is a one-time move-off event (not a sustained state), so the
    // rest of the drive is clean — but nothing else grades.
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
  });

  it("curb-only glance: MOVE_OFF_WITHOUT_OBSERVATION surfaces through the raw grader", () => {
    const outcome = driveThroughSession(SC_PK_MOVE_OFF, (d, onTick) =>
      recordScPkMoveOffDrive(d, "mistake-curb-glance", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("MOVE_OFF_WITHOUT_OBSERVATION");
  });
});

// ---------------------------------------------------------------------------
// sc-pk-driveway (PK-11) — reverse into a driveway (parkInBay + COLLISION)
// ---------------------------------------------------------------------------

describe("final harvest bot completion — sc-pk-driveway correct reverse at L3", () => {
  const outcome = driveThroughSession(SC_PK_DRIVEWAY, (d, onTick) =>
    recordScPkDrivewayDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session: both objectives done, zero violations, passed, parked via reverse", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    const park = outcome.result.objectives.find((o) => o.id === "sc-pkd-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind).toBe("parkInBay");
    expect(outcome.drive.trace.samples.some((s) => s.gear < 0)).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_PK_DRIVEWAY, outcome);
    const graded = gradeFinishWire({
      lessonId: `${SC_PK_DRIVEWAY.id}@L3`,
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
    const park = graded.result.objectives.find((o) => o.id === "sc-pkd-park")!;
    expect(park.detail?.kind).toBe("parkInBay");
  });

  it("scores ≥ 2★ with placement, economy AND observation measured", () => {
    const observation = parkingObservationFromTrace(
      outcome.drive.trace,
      SC_PK_DRIVEWAY.rubric!.observation!.moments,
    );
    expect(observation).not.toBeNull();
    const rubric = scoreRubric(outcome.result, SC_PK_DRIVEWAY.rubric!, observation!);
    expect(rubric.stars).toBeGreaterThanOrEqual(2);
    for (const id of ["placement", "economy", "observation"] as const) {
      const line = rubric.breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(true);
      expect(line.points, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("final harvest counter-proof — a driveway wall contact grades through the live pipeline", () => {
  it("wide swing: COLLISION (staticObject) at creep speed inside a LIVE session, rubric capped at 1★", () => {
    const outcome = driveThroughSession(SC_PK_DRIVEWAY, (d, onTick) =>
      recordScPkDrivewayDrive(d, "mistake-wide", { onTick }),
    );
    const collisions = outcome.session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(outcome.result.passed).toBe(false);
    expect(scoreRubric(outcome.result, SC_PK_DRIVEWAY.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-signal-hesitation (JU-09) — freeze on a live green (HESITATION_AT_GREEN)
// ---------------------------------------------------------------------------

describe("final harvest bot completion — sc-signal-hesitation correct pass on green at L3", () => {
  const outcome = driveThroughSession(SC_SIGNAL_HESITATION, (d, onTick) =>
    recordScSignalHesitationDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(sessionViolationCodes(outcome)).toEqual([]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_SIGNAL_HESITATION, outcome);
  });

  it("earns full stars from cleanliness (par time informational only)", () => {
    expect(scoreRubric(outcome.result, SC_SIGNAL_HESITATION.rubric!).stars).toBe(3);
  });
});

describe("final harvest counter-proof — the green-hesitation fault grades through the pipeline", () => {
  it("freeze on green: HESITATION_AT_GREEN surfaces through the raw grader, no priority/overshoot leak", () => {
    const outcome = driveThroughSession(SC_SIGNAL_HESITATION, (d, onTick) =>
      recordScSignalHesitationDrive(d, "mistake-freeze", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HESITATION_AT_GREEN");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("STOP_LINE_OVERSHOOT");
  });

  it("green-filter dither: HESITATION_AT_GREEN surfaces through the raw grader", () => {
    const outcome = driveThroughSession(SC_SIGNAL_HESITATION, (d, onTick) =>
      recordScSignalHesitationDrive(d, "mistake-filter", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("HESITATION_AT_GREEN");
  });
});
