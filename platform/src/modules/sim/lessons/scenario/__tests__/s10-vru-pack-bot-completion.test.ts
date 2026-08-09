/**
 * N8 slice-1 bot-completion proof (doc 76 §10; the s3-vu-bot-completion mold)
 * — the VRU-interaction pack templates (VU-02 + VU-04), shadows driven through
 * the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → the trace script's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline:
 *  - VULNERABLE_PASS_TOO_CLOSE is основна (3 т.), teach-first at L3 (coached
 *    on first encounter — engine.ts), so the honest assertion is that the
 *    taught code SURFACES through the live rules and the shadow's
 *    YIELDED_TO_PRIORITY is ABSENT;
 *  - the door COLLISION (10 т. + terminate) grades on the spot — that demo does
 *    NOT pass;
 *  - the swerve's CROSSED_SOLID_LINE is основна (3 т.) since the Наредба № 38
 *    grounding pass (it used to be опасна, 10, on no clause of б. „в“), so it
 *    is teach-first like the code above it — see that test for the drill gap
 *    the correction exposed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../../../rules";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScVuDoorDrive } from "../../../traces/scVuDoorZone";
import { recordScVuPassDrive } from "../../../traces/scVuPass";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VU_DOOR_ZONE, SC_VU_PASS_CLEARANCE } from "../templates-vru";
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

function assertWireRoundTrip(spec: ScenarioSpec, outcome: DriveOutcome): void {
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

describe("N8 bot completion — sc-vu-pass-clearance („Изпреварване на велосипедист“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
    recordScVuPassDrive(d, "shadow-correct", { onTick }),
  );

  it("completes the session: every objective done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
    expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(driveCommendationCodes(outcome)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    assertWireRoundTrip(SC_VU_PASS_CLEARANCE, outcome);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_PASS_CLEARANCE.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("N8 counter-proofs — the close passes grade through the live pipeline", () => {
  it("slow squeeze: VULNERABLE_PASS_TOO_CLOSE surfaces, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
      recordScVuPassDrive(d, "mistake-squeeze", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(driveViolationCodes(outcome)).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("fast late-dive pass: VULNERABLE_PASS_TOO_CLOSE surfaces, no yield commendation", () => {
    const outcome = driveThroughSession(SC_VU_PASS_CLEARANCE, (d, onTick) =>
      recordScVuPassDrive(d, "mistake-fast-close", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(driveCommendationCodes(outcome)).not.toContain("YIELDED_TO_PRIORITY");
  });
});

describe("N8 bot completion — sc-vu-door-zone („Зоната на вратата“) correct attempt at L3", () => {
  const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
    recordScVuDoorDrive(d, "shadow-correct", { onTick }),
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
    assertWireRoundTrip(SC_VU_DOOR_ZONE, outcome);
  });

  it("earns full stars from cleanliness (par time is informational only)", () => {
    const rubric = scoreRubric(outcome.result, SC_VU_DOOR_ZONE.rubric!);
    expect(rubric.stars).toBe(3);
  });
});

describe("N8 counter-proofs — the door-zone mistakes grade through the live pipeline", () => {
  it("hugging the row: COLLISION (the door) grades on the spot, not passed", () => {
    const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
      recordScVuDoorDrive(d, "mistake-hug", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("COLLISION");
    expect(driveViolationCodes(outcome)).not.toContain("CROSSED_SOLID_LINE");
    expect(outcome.result.passed).toBe(false);
  });

  it("the late dodge: CROSSED_SOLID_LINE surfaces as основна — and exposes a gap in this drill's objectives", () => {
    // RE-BASELINED 2026-08-09 (Наредба № 38 grounding pass), and this is the one
    // re-baseline that costs something, so it is written down instead of tidied.
    //
    // CROSSED_SOLID_LINE was опасна (10). It had no basis: приложение № 5,
    // т. 10, б. „в" is a CLOSED list of six cases and this act is none of them
    // (see rules/n38.ts). It is основна (3) now, teach-first like every other
    // основна — exactly the ladder this file already documents two describes
    // above for VULNERABLE_PASS_TOO_CLOSE.
    //
    // WHAT THAT UNCOVERED: this demo used to fail on the 10 points alone. Strip
    // the unlawful charge and it PASSES — because the swerve completes every
    // objective the drill authored. The drill never encoded „не пресичай
    // осевата" as a gate at all; the severity was doing the objectives' job.
    // That is a scenario-authoring gap in templates-vru.ts, filed for the
    // lesson lane, and it is asserted here rather than hidden so the next
    // person reads it as a known hole and not as a passing mistake demo.
    // Driven with the teach channel captured, because that is where the
    // teaching now lives (the helper above discards it).
    const lesson = compileScenario(SC_VU_DOOR_ZONE, 3);
    let session = createLessonSession(lesson);
    const taught: string[] = [];
    const drive = recordScVuDoorDrive(loadDistrict(SC_VU_DOOR_ZONE.map.districtId), "mistake-swerve", {
      onTick: (tick) => {
        const step = applyTick(session, tick);
        session = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const result = buildLessonResult(session);
    const ruleCodes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);

    // The rule engine convicts on exactly the same frame as before — only the
    // charge moved.
    expect(ruleCodes).toContain("CROSSED_SOLID_LINE");
    expect(ruleCodes).not.toContain("COLLISION");
    expect(VIOLATIONS.CROSSED_SOLID_LINE.severityClass).toBe("osnovna");
    expect(VIOLATIONS.CROSSED_SOLID_LINE.points).toBe(3);

    // The teaching that survives: the student is stopped and shown the card.
    expect(taught).toContain("CROSSED_SOLID_LINE");

    // …and the teaching that does NOT. A first-encounter основна is taught, not
    // scored, so it never reaches the sheet or the theory recommender's concept
    // list. Shipped A12 behaviour for the whole основна class, pinned here
    // because this drill is where it bites hardest.
    expect(result.score).toBe(0);
    expect(result.summary.mistakes).toEqual([]);

    // ── THE HOLE IS CLOSED (2026-08-09) ──────────────────────────────────
    // It used to say `objectives.every(done) === true` and `passed === true`,
    // pinned so that closing it would come here first. `sc-vud-row` now sits
    // ON the door at (2.6, 156) with r 2.2 instead of 19 m past it with r 6,
    // so the gate measures the line the лесson names: the swerve is at
    // x ≈ −1.2 across the М1 when it should be at 2.6, misses the zone, and
    // the drill is not completed. It fails for LEAVING ITS LANE AT THE DOOR —
    // the thing the demo demonstrates — instead of on a points charge Наредба
    // № 38 does not support.
    const row = result.objectives.find((o) => o.id === "sc-vud-row")!;
    expect(row.done, "the door-line gate must be the one that fails").toBe(false);
    expect(result.passed).toBe(false);
    expect(result.completedAll).toBe(false);

    // …and it is a POSITION failure, not a side effect of the collision the
    // sibling demo has. This drive never touches anything.
    expect(ruleCodes).not.toContain("COLLISION");
  });

  it("the correct line clears that same gate — the door gate is not simply unpassable", () => {
    // The counter-proof the tightened radius owes: a 2.2 m disc is only a fair
    // gate if the drill's own demonstrated-correct drive rides through it. The
    // shadow holds x = 2.60 from y 80 to 220, so it passes the door dead
    // centre. (The full „every objective done / zero violations" assertion for
    // the shadow is the describe above; this one names the gate.)
    const outcome = driveThroughSession(SC_VU_DOOR_ZONE, (d, onTick) =>
      recordScVuDoorDrive(d, "shadow-correct", { onTick }),
    );
    const row = outcome.result.objectives.find((o) => o.id === "sc-vud-row")!;
    expect(row.done).toBe(true);
  });
});
