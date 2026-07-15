/**
 * S2-A bot-completion proofs (doc 76 §10; the s1-bot-completion mold) — the
 * three parking-wave templates, each driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric ≥ 2★.
 *
 * Counter-proofs ride the same pipeline: the narrow wide-swing and the 45°
 * corner-cut demos grade COLLISION at walking speed inside a live session
 * (collisionMinKmh 0 — the parking threshold), capping the rubric at 1★.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScPark45Drive } from "../../../traces/scPark45";
import { recordScParkNarrowDrive } from "../../../traces/scParkNarrow";
import { recordScParkParallelDrive } from "../../../traces/scParkParallel";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { parkingObservationFromTrace } from "../observation";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_PARK_45, SC_PARK_NARROW, SC_PARK_PARALLEL } from "../templates-parking";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

/** Drive one authored script through a REAL lesson session at L3. */
function driveThroughSession(
  spec: ScenarioSpec,
  record: (district: unknown, onTick: (tick: Parameters<typeof applyTick>[1]) => void) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = record(loadDistrict(spec.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return { session, result: buildLessonResult(session), drive };
}

/** The prototype's wire round-trip: the server regrades from the id alone. */
function expectWireRoundTrip(spec: ScenarioSpec, outcome: DriveOutcome, parkObjectiveId: string): void {
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
  const park = graded.result.objectives.find((o) => o.id === parkObjectiveId)!;
  expect(park.detail?.kind).toBe("parkInBay");
}

describe("S2 bot completion — sc-park-parallel correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_PARK_PARALLEL, (d, onTick) =>
    recordScParkParallelDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session: both objectives done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    const park = outcome.result.objectives.find((o) => o.id === "sc-ppl-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind).toBe("parkInBay");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_PARK_PARALLEL, outcome, "sc-ppl-park");
  });

  it("scores ≥ 2★ with placement, economy AND observation measured", () => {
    const observation = parkingObservationFromTrace(
      outcome.drive.trace,
      SC_PARK_PARALLEL.rubric!.observation!.moments,
    );
    expect(observation).not.toBeNull();
    expect(observation!.observedMomentIds).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
    const rubric = scoreRubric(outcome.result, SC_PARK_PARALLEL.rubric!, observation!);
    expect(rubric.stars).toBeGreaterThanOrEqual(2);
    for (const id of ["placement", "economy", "observation"] as const) {
      const line = rubric.breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(true);
      expect(line.points, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("S2 bot completion — sc-park-45 correct FORWARD attempt at L3", () => {
  const outcome = driveThroughSession(SC_PARK_45, (d, onTick) =>
    recordScPark45Drive(d, "shadow-correct", { onTick }),
  );

  it("completes the session via the forward-entry gate (entry \"forward\")", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    const park = outcome.result.objectives.find((o) => o.id === "sc-p45-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind).toBe("parkInBay");
    // The drive NEVER reversed — the completion is the S2 forward gate.
    expect(outcome.drive.trace.samples.some((s) => s.gear < 0)).toBe(false);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_PARK_45, outcome, "sc-p45-park");
  });

  it("scores ≥ 2★ on placement + economy (no observation channel by design)", () => {
    expect(SC_PARK_45.rubric!.observation).toBeUndefined();
    const rubric = scoreRubric(outcome.result, SC_PARK_45.rubric!);
    expect(rubric.stars).toBeGreaterThanOrEqual(2);
    for (const id of ["placement", "economy"] as const) {
      const line = rubric.breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(true);
      expect(line.points, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("S2 bot completion — sc-park-narrow correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_PARK_NARROW, (d, onTick) =>
    recordScParkNarrowDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session under the TIGHTER narrow rubric (0.35 m / 7°)", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    const park = outcome.result.objectives.find((o) => o.id === "sc-pnr-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind).toBe("parkInBay");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    expectWireRoundTrip(SC_PARK_NARROW, outcome, "sc-pnr-park");
  });

  it("scores ≥ 2★ with every channel measured", () => {
    const observation = parkingObservationFromTrace(
      outcome.drive.trace,
      SC_PARK_NARROW.rubric!.observation!.moments,
    );
    expect(observation).not.toBeNull();
    expect(observation!.observedMomentIds).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
    const rubric = scoreRubric(outcome.result, SC_PARK_NARROW.rubric!, observation!);
    expect(rubric.stars).toBeGreaterThanOrEqual(2);
    for (const id of ["placement", "economy", "observation"] as const) {
      const line = rubric.breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(true);
      expect(line.points, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("S2 counter-proofs — parking contacts grade through the live pipeline", () => {
  it("narrow wide-swing: COLLISION (vehicle) at walking speed, rubric capped at 1★", () => {
    const outcome = driveThroughSession(SC_PARK_NARROW, (d, onTick) =>
      recordScParkNarrowDrive(d, "mistake-wide-swing", { onTick }),
    );
    const collisions = outcome.session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(outcome.result.passed).toBe(false);
    expect(outcome.result.summary.terminated).toBe(true);
    expect(scoreRubric(outcome.result, SC_PARK_NARROW.rubric!).stars).toBe(1);
  });

  it("45° corner-cut: a FORWARD-gear graze grades COLLISION at creep speed", () => {
    const outcome = driveThroughSession(SC_PARK_45, (d, onTick) =>
      recordScPark45Drive(d, "mistake-corner-cut", { onTick }),
    );
    const collisions = outcome.session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(outcome.result.passed).toBe(false);
    expect(scoreRubric(outcome.result, SC_PARK_45.rubric!).stars).toBe(1);
  });
});
