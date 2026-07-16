/**
 * SURFACE-PATCH bot-completion proof (doc 76 §10; the s4a/s4b mold) — the
 * AQUAPLANE + ICE slice's two templates driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScAc*Drive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric = 3★.
 *
 * HONEST LIMIT OF THIS PROOF (the s4a note, verbatim law): the bot's drive is
 * the KINEMATIC recorder (authored envelopes) — it never runs VehicleSim, so
 * completion here proves the LESSON pipeline (objectives, grading, wire), not
 * the float/ice vehicle feel. The live surface physics is validated by
 * vehicle/surface-grip.test.ts (setter bit-identity + the measured ≈5.5×
 * patch braking / ≈0.14× steering) and the span→rig seam by
 * runtime/__tests__/surface-patches.test.ts (incl. the water speed gate);
 * the FEEL sign-off is the founder's manual drive (ADR-006's stage-4
 * acceptance gate). The demos stay honest because their envelopes are
 * authored from the SAME tuning constants (the trace gates assert it).
 *
 * This file also pins the slice's COMPILE PROPAGATION laws:
 *  - sc-ac-aquaplane: weather "rain" compiles environment.rain AND the
 *    authored physics.wetGrip compiles to LessonSpec.physics at every level
 *    (the wet precedent) — the waterPatch itself NEVER appears on the
 *    LessonSpec: it is district data (the map is the second opt-in);
 *  - sc-ac-ice: NO environment and NO physics compile AT ALL — the first
 *    template whose entire hazard arrives through the district's icePatch
 *    span (resolveSurfaceGripPatches is the seam; pinned here against the
 *    committed map).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecordedDrive } from "../../../traces/recorder";
import { recordScAcAquaplaneDrive, type ScAcAquaplaneTraceName } from "../../../traces/scAcAquaplane";
import { recordScAcIceDrive, type ScAcIceTraceName } from "../../../traces/scAcIce";
import { resolveSurfaceGripPatches, type SurfacePatchSource } from "../../../runtime";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_AQUAPLANE, SC_AC_ICE } from "../templates-conditions";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

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
  record: (districtRaw: unknown, onTick: (tick: Parameters<typeof applyTick>[1]) => void) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = record(loadDistrict(spec.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return { session, result: buildLessonResult(session), drive };
}

function aquaOutcome(name: ScAcAquaplaneTraceName): DriveOutcome {
  return driveThroughSession(SC_AC_AQUAPLANE, (raw, onTick) =>
    recordScAcAquaplaneDrive(raw, name, { onTick }),
  );
}
function iceOutcome(name: ScAcIceTraceName): DriveOutcome {
  return driveThroughSession(SC_AC_ICE, (raw, onTick) => recordScAcIceDrive(raw, name, { onTick }));
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

describe("surface-patch slice — the compile propagation laws", () => {
  it("sc-ac-aquaplane compiles environment.rain AND physics.wetGrip at EVERY authored level — never the patch", () => {
    for (const l of SC_AC_AQUAPLANE.levels) {
      const lesson = compileScenario(SC_AC_AQUAPLANE, l.level as ScenarioLevel);
      expect(lesson.environment, `L${l.level}`).toEqual({ rain: true });
      expect(lesson.physics, `L${l.level}`).toEqual({ wetGrip: true });
      // The waterPatch NEVER rides the LessonSpec: it is district data —
      // LessonScene resolves it from the loaded map (the second opt-in).
      expect("gripPatches" in lesson).toBe(false);
    }
  });

  it("sc-ac-ice compiles NO environment and NO physics at ANY level — the map data is the whole hazard", () => {
    for (const l of SC_AC_ICE.levels) {
      const lesson = compileScenario(SC_AC_ICE, l.level as ScenarioLevel);
      expect(lesson.environment, `L${l.level}`).toBeUndefined();
      expect(lesson.physics, `L${l.level}`).toBeUndefined();
    }
  });

  it("the committed districts carry exactly the patches the templates narrate (the map-data seam)", () => {
    const aqua = resolveSurfaceGripPatches(
      loadDistrict(SC_AC_AQUAPLANE.map.districtId) as SurfacePatchSource,
    );
    expect(aqua).toHaveLength(1);
    expect(aqua[0].aquaplaneAboveKmh).toBeGreaterThan(0); // speed-gated water
    const ice = resolveSurfaceGripPatches(
      loadDistrict(SC_AC_ICE.map.districtId) as SurfacePatchSource,
    );
    expect(ice).toHaveLength(1);
    expect(ice[0].aquaplaneAboveKmh).toBeUndefined(); // ice bites at any speed
  });

  it("the wire resolver recompiles the same environment + physics from the id alone", () => {
    const aqua = scenarioLessonById("sc-ac-aquaplane@L3");
    expect(aqua?.environment).toEqual({ rain: true });
    expect(aqua?.physics).toEqual({ wetGrip: true });
    const ice = scenarioLessonById("sc-ac-ice@L3");
    expect(ice?.environment).toBeUndefined();
    expect(ice?.physics).toBeUndefined();
  });
});

for (const [label, spec, correct] of [
  ["sc-ac-aquaplane („Аквапланинг“)", SC_AC_AQUAPLANE, () => aquaOutcome("shadow-correct")],
  ["sc-ac-ice („Лед по моста“)", SC_AC_ICE, () => iceOutcome("shadow-correct")],
] as const) {
  describe(`S4d bot completion — ${label} correct attempt at L3`, () => {
    const outcome = correct();

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

describe("S4d counter-proofs — the surface mistakes through the live pipeline", () => {
  it("aquaplane 85-in-rain: conditions speed + the crash surface; the pre-water zone is blown, not passed", () => {
    const outcome = aquaOutcome("mistake-full-speed");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).toContain("COLLISION");
    expect(outcome.result.completedAll).toBe(false);
    // At 85 the pre-water zone's 58 km/h discipline is blown.
    expect(outcome.result.objectives.find((o) => o.id === "sc-acq-before")!.done).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acq-mark")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("aquaplane «lawful» 72-float: the осева drift convicts; never a speed code; not passed", () => {
    const outcome = aquaOutcome("mistake-float-drift");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // 72 < 76.5 — the point
    expect(codes).not.toContain("COLLISION"); // the panic stop rests short of the van
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-acq-before")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("ice brake-on-the-ice: COLLISION surfaces; the mark is never rested in; not passed", () => {
    const outcome = iceOutcome("mistake-brake-on-ice");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("COLLISION");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS"); // dry day — no envelope
    // DOCUMENTED, not fought (the s4a/s4b dry-point ruling): the ~270 m
    // approach at the posted 50 on a dry street is fully lawful — that is
    // the POINT of this demo (speed legal, surface unread) — so the 250 m
    // clean-driving streak legitimately fires BEFORE the slide. What
    // convicts the drive is the collision and the failed objectives.
    expect(driveCommendationCodes(outcome)).toContain("CLEAN_DRIVING");
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-aci-before")!.done).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-aci-mark")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });

  it("ice harsh-steer: POOR_LANE_KEEPING surfaces; the crawl zone is blown; not passed", () => {
    const outcome = iceOutcome("mistake-harsh-steer");
    const codes = driveViolationCodes(outcome);
    expect(codes).toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("COLLISION"); // squeezes past the stalled car
    expect(outcome.result.completedAll).toBe(false);
    expect(outcome.result.objectives.find((o) => o.id === "sc-aci-before")!.done).toBe(false);
    expect(outcome.result.passed).toBe(false);
  });
});
