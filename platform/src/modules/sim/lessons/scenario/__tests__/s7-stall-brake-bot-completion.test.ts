/**
 * Capability-batch-2 bot-completion proofs (doc 76 §10; the s5-unit2 mold) —
 * the two templates riding the recorder's stall + hard-brake channels
 * (sc-vp-stall VP-04, sc-sp-harsh-brake SP-11/VP-09), each shadow driven
 * through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the RECORDER's rule channel (drive.ruleEvents) AND the
 * LIVE session (liveReactionCodes): both detectors are default-ON (no
 * ruleConfig opt-in needed), so the student's own stall / phantom slam must
 * surface as a teach-first mini-lesson exactly like the recorded demo grades.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScVpStallDrive, type ScVpStallTraceName } from "../../../traces/scVpStall";
import { recordScSpHarshBrakeDrive, type ScSpHarshBrakeTraceName } from "../../../traces/scSpHarshBrake";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VP_STALL } from "../templates-cockpit";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
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
  /** Every code the LIVE session reacted to — teach-first mini-lessons (a
   *  first mistake) AND scored HUD violations (a repeat). Proves the live
   *  student session grades the drill's fault, not only the recorded demo. */
  liveReactionCodes: string[];
}

function driveThroughSession(
  spec: ScenarioSpec,
  record: (district: unknown, onTick: OnTick) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const liveReactionCodes: string[] = [];
  const drive = record(loadDistrict(spec.map.districtId), (tick) => {
    const step = applyTick(session, tick);
    session = step.state;
    for (const m of step.teachMoments ?? []) liveReactionCodes.push(m.code);
  });
  for (const e of session.events) if (e.kind === "violation") liveReactionCodes.push(e.code);
  return { session, result: buildLessonResult(session), drive, liveReactionCodes };
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
    spec: SC_VP_STALL,
    record: (d, onTick) => recordScVpStallDrive(d, "shadow-correct" as ScVpStallTraceName, { onTick }),
  },
  {
    spec: SC_SP_HARSH_BRAKE,
    record: (d, onTick) => recordScSpHarshBrakeDrive(d, "shadow-correct" as ScSpHarshBrakeTraceName, { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`S7 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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
    });
  });
}

describe("S7 counter-proofs — stall/hard-brake mistakes grade through the production stack", () => {
  it("stall at move-off: ENGINE_STALLED surfaces AND the LIVE session reacts (teach moment)", () => {
    const outcome = driveThroughSession(SC_VP_STALL, (d, onTick) =>
      recordScVpStallDrive(d, "mistake-stall-once", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toEqual(["ENGINE_STALLED"]);
    // NOTE: no CLEAN_DRIVING-absence assert here — the stall lands on the
    // FIRST metres, and the 330 m recovery drive afterwards legitimately
    // re-earns the streak commendation (clean distance resets on the
    // violation and re-accumulates; that is the engine's law, not a leak).
    // Default-ON detector: the live student session teaches the same fault.
    expect(outcome.liveReactionCodes).toContain("ENGINE_STALLED");
  });

  it("repeated stalls: TWO ENGINE_STALLED (the restart re-arms the episode)", () => {
    const outcome = driveThroughSession(SC_VP_STALL, (d, onTick) =>
      recordScVpStallDrive(d, "mistake-stall-repeat", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toEqual(["ENGINE_STALLED", "ENGINE_STALLED"]);
    expect(outcome.liveReactionCodes.filter((c) => c === "ENGINE_STALLED").length).toBeGreaterThanOrEqual(2);
  });

  it("phantom slam: HARSH_BRAKING_NO_CAUSE surfaces AND the LIVE session reacts, no speed code", () => {
    const outcome = driveThroughSession(SC_SP_HARSH_BRAKE, (d, onTick) =>
      recordScSpHarshBrakeDrive(d, "mistake-phantom-stop", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
    expect(outcome.liveReactionCodes).toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("panic stab to a crawl: HARSH_BRAKING_NO_CAUSE surfaces without a full stop", () => {
    const outcome = driveThroughSession(SC_SP_HARSH_BRAKE, (d, onTick) =>
      recordScSpHarshBrakeDrive(d, "mistake-stab-crawl", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(outcome.liveReactionCodes).toContain("HARSH_BRAKING_NO_CAUSE");
  });
});
