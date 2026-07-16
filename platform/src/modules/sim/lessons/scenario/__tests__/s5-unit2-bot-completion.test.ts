/**
 * S5 bot-completion proofs (doc 76 §10; the s4-ac-vp mold) — detector pack
 * unit 2's four templates, each shadow driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the RECORDER's rule channel (drive.ruleEvents): each
 * mistake's fault SURFACES through the production stack with its exact code —
 * for the config-gated drills (JU-23, FO-04) via the recorder's ruleConfig
 * opt-in, exactly as the live lesson would enable them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScFollowStandstillDrive, type ScFollowStandstillTraceName } from "../../../traces/scFollowStandstill";
import { recordScOvCrossingOvertakeDrive, type ScOvCrossingOvertakeTraceName } from "../../../traces/scOvCrossingOvertake";
import { recordScJunctionScanDrive, type ScJunctionScanTraceName } from "../../../traces/scJunctionScan";
import { recordScFollowRainGapDrive, type ScFollowRainGapTraceName } from "../../../traces/scFollowRainGap";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_FOLLOW_STANDSTILL, SC_FOLLOW_RAIN_GAP } from "../templates-following";
import { SC_OV_CROSSING_OVERTAKE } from "../templates-lanes";
import { SC_JUNCTION_SCAN } from "../templates-junctions";
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
   *  student session grades the drill's fault, not only the recorded shadow. */
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
  // Scored violations (repeats/dangerous) land in session.events.
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

const CORRECT: Array<{ spec: ScenarioSpec; record: (d: unknown, onTick: OnTick) => RecordedDrive }> = [
  {
    spec: SC_FOLLOW_STANDSTILL,
    record: (d, onTick) => recordScFollowStandstillDrive(d, "shadow-correct" as ScFollowStandstillTraceName, { onTick }),
  },
  {
    spec: SC_OV_CROSSING_OVERTAKE,
    record: (d, onTick) => recordScOvCrossingOvertakeDrive(d, "shadow-correct" as ScOvCrossingOvertakeTraceName, { onTick }),
  },
  {
    spec: SC_JUNCTION_SCAN,
    record: (d, onTick) => recordScJunctionScanDrive(d, "shadow-correct" as ScJunctionScanTraceName, { onTick }),
  },
  {
    spec: SC_FOLLOW_RAIN_GAP,
    record: (d, onTick) => recordScFollowRainGapDrive(d, "shadow-correct" as ScFollowRainGapTraceName, { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`S5 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("S5 counter-proofs — unit-2 mistakes grade through the production stack", () => {
  it("standstill bumper-kiss: STANDSTILL_GAP_TOO_CLOSE surfaces, no COLLISION", () => {
    const outcome = driveThroughSession(SC_FOLLOW_STANDSTILL, (d, onTick) =>
      recordScFollowStandstillDrive(d, "mistake-bumper-kiss", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("STANDSTILL_GAP_TOO_CLOSE");
    expect(codes).not.toContain("COLLISION");
  });

  it("crossing overtake-in-zone: OVERTAKING_AT_CROSSING surfaces, no lane-change violation", () => {
    const outcome = driveThroughSession(SC_OV_CROSSING_OVERTAKE, (d, onTick) =>
      recordScOvCrossingOvertakeDrive(d, "mistake-overtake-in-zone", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("OVERTAKING_AT_CROSSING");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });

  it("junction no-scan: JUNCTION_SCAN_INCOMPLETE grades in the LIVE session via the drill's ruleConfig", () => {
    const outcome = driveThroughSession(SC_JUNCTION_SCAN, (d, onTick) =>
      recordScJunctionScanDrive(d, "mistake-no-scan", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("JUNCTION_SCAN_INCOMPLETE");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    // The FIX: the compiled lesson carries ruleConfig, so the LIVE student
    // session detects the taught fault too — on a first encounter it surfaces
    // as a teach-first mini-lesson (not scored), which is the drill's point.
    expect(outcome.liveReactionCodes).toContain("JUNCTION_SCAN_INCOMPLETE");
  });

  it("rain dry-habit gap: FOLLOWING_TOO_CLOSE_FOR_RAIN grades in the LIVE session via the drill's ruleConfig", () => {
    const outcome = driveThroughSession(SC_FOLLOW_RAIN_GAP, (d, onTick) =>
      recordScFollowRainGapDrive(d, "mistake-dry-habit", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(outcome.liveReactionCodes).toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
  });
});
