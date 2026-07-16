/**
 * S4 bot-completion proofs (doc 76 §10; the s3-sp-bot-completion mold) — the
 * three cockpit-channel templates (VP-02/VP-05 readiness, AC-01 night lights,
 * AC-02 rain lights), each shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: each mistake's cockpit fault
 * SURFACES through the live rules and the shadow's positive (CLEAN_DRIVING) is
 * ABSENT.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScVpReadinessDrive, type ScVpReadinessTraceName } from "../../../traces/scVpReadiness";
import { recordScAcNightLightsDrive, type ScAcNightLightsTraceName } from "../../../traces/scAcNightLights";
import { recordScAcRainLightsDrive, type ScAcRainLightsTraceName } from "../../../traces/scAcRainLights";
import { recordScAcHighbeamLeadDrive, type ScAcHighbeamLeadTraceName } from "../../../traces/scAcHighbeamLead";
import { recordScVpPoliceStopDrive, type ScVpPoliceStopTraceName } from "../../../traces/scVpPoliceStop";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VP_POLICE_STOP, SC_VP_READINESS } from "../templates-cockpit";
import { SC_AC_NIGHT_LIGHTS, SC_AC_RAIN_LIGHTS, SC_AC_HIGHBEAM_LEAD } from "../templates-conditions";
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
    spec: SC_VP_READINESS,
    record: (d, onTick) => recordScVpReadinessDrive(d, "shadow-correct" as ScVpReadinessTraceName, { onTick }),
  },
  {
    spec: SC_AC_NIGHT_LIGHTS,
    record: (d, onTick) => recordScAcNightLightsDrive(d, "shadow-correct" as ScAcNightLightsTraceName, { onTick }),
  },
  {
    spec: SC_AC_RAIN_LIGHTS,
    record: (d, onTick) => recordScAcRainLightsDrive(d, "shadow-correct" as ScAcRainLightsTraceName, { onTick }),
  },
  {
    spec: SC_AC_HIGHBEAM_LEAD,
    record: (d, onTick) => recordScAcHighbeamLeadDrive(d, "shadow-correct" as ScAcHighbeamLeadTraceName, { onTick }),
  },
  {
    // ADR-006 stage 1c — VP-11: the pull-over-and-stop completion drill (the
    // policeStop officer figure is scenery; the curb-side low-speed reachZone
    // IS the graded duty, so the compliant shadow COMPLETES at rest).
    spec: SC_VP_POLICE_STOP,
    record: (d, onTick) => recordScVpPoliceStopDrive(d, "shadow-correct" as ScVpPoliceStopTraceName, { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`S4 bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
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

describe("S4 counter-proofs — cockpit mistakes grade through the live pipeline", () => {
  it("no-belt: SEATBELT_OFF_WHILE_MOVING surfaces through the stack, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_VP_READINESS, (d, onTick) =>
      recordScVpReadinessDrive(d, "mistake-no-belt", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("SEATBELT_OFF_WHILE_MOVING");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("handbrake left on: HANDBRAKE_LEFT_ON surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_VP_READINESS, (d, onTick) =>
      recordScVpReadinessDrive(d, "mistake-handbrake", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("HANDBRAKE_LEFT_ON");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("night lights off: HEADLIGHTS_OFF_AT_NIGHT surfaces under night, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_AC_NIGHT_LIGHTS, (d, onTick) =>
      recordScAcNightLightsDrive(d, "mistake-never-on", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("rain lights off: HEADLIGHTS_OFF_IN_RAIN surfaces under day rain, no conditions-speed code, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_AC_RAIN_LIGHTS, (d, onTick) =>
      recordScAcRainLightsDrive(d, "mistake-never-on", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HEADLIGHTS_OFF_IN_RAIN");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("high beam behind the lead: HIGH_BEAM_NOT_DIPPED surfaces at night, no following code, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_AC_HIGHBEAM_LEAD, (d, onTick) =>
      recordScAcHighbeamLeadDrive(d, "mistake-highs-all-way", { onTick }),
    );
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("HIGH_BEAM_NOT_DIPPED");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  // ADR-006 stage 1c (VP-11) — the completion-drill counter-proofs: neither
  // wrong way reaches the curb-side stop zone, so the drill NEVER completes
  // (the honest capped outcome), and each grades its own shipped code.
  it("police stop / drive-past: NOT_KEEPING_RIGHT surfaces, stop objective unmet, not passed", () => {
    const outcome = driveThroughSession(SC_VP_POLICE_STOP, (d, onTick) =>
      recordScVpPoliceStopDrive(d, "mistake-drive-past", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("NOT_KEEPING_RIGHT");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-vpps-stop")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("police stop / panic in-lane slam: HARSH_BRAKING_NO_CAUSE surfaces, stop objective unmet, not passed", () => {
    const outcome = driveThroughSession(SC_VP_POLICE_STOP, (d, onTick) =>
      recordScVpPoliceStopDrive(d, "mistake-panic-stop", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("HARSH_BRAKING_NO_CAUSE");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-vpps-stop")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });
});
