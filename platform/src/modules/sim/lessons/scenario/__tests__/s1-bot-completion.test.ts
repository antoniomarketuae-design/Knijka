/**
 * S1 bot-completion proof (doc 76 §10 P0 — the engine-level stand-in for a
 * hidden-window WebGL drive): the scripted CORRECT attempt runs through the
 * FULL production pipeline —
 *
 *   compileScenario(L3) → createLessonSession → recordScriptedDrive's onTick
 *   feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES the lesson from the id and
 *   regrades → scoreRubric ≥ 2★ with zero violations.
 *
 * And the counter-proof: the CLIPPING attempt (the wide-approach mistake
 * script) grades COLLISION at walking speed through the same pipeline.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  recordScParkPerpRevDrive,
  type ScParkPerpRevTraceName,
} from "../../../traces/scParkPerpRev";
import type { RecordedDrive } from "../../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { parkingObservationFromTrace } from "../observation";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_PARK_PERP_REV } from "../templates";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const district: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-perp-v1.json"), "utf-8"),
);

/** Drive one authored script through a REAL lesson session at the given level. */
function driveThroughSession(
  name: ScParkPerpRevTraceName,
  level: 1 | 2 | 3 | 4 | 5,
): { session: LessonSessionState; result: LessonResult; drive: RecordedDrive } {
  const lesson = compileScenario(SC_PARK_PERP_REV, level);
  let session = createLessonSession(lesson);
  const drive = recordScParkPerpRevDrive(district, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

describe("S1 bot completion — the scripted CORRECT attempt at L3", () => {
  const { session, result, drive } = driveThroughSession("shadow-correct", 3);

  it("completes the session: both objectives done, zero violations, passed", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.summary.mistakes).toEqual([]);
    const park = result.objectives.find((o) => o.id === "sc-ppr-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind).toBe("parkInBay");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-park-perp-rev@L3",
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
    expect(graded.lesson.id).toBe("sc-park-perp-rev@L3");
    // The server-side lesson is a fresh compile of the pure template.
    expect(graded.lesson).toEqual(scenarioLessonById("sc-park-perp-rev@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
    // The validated measurement detail rode through for the rubric.
    const park = graded.result.objectives.find((o) => o.id === "sc-ppr-park")!;
    expect(park.detail?.kind).toBe("parkInBay");
  });

  it("scores ≥ 2★ on the rubric with every channel MEASURED", () => {
    const observation = parkingObservationFromTrace(
      drive.trace,
      SC_PARK_PERP_REV.rubric!.observation!.moments,
    );
    expect(observation).not.toBeNull();
    // The shadow demonstrates the full ritual — all three moments covered.
    expect(observation!.observedMomentIds).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
    const rubric = scoreRubric(result, SC_PARK_PERP_REV.rubric!, observation!);
    expect(rubric.stars).toBeGreaterThanOrEqual(2);
    for (const id of ["placement", "economy", "observation"] as const) {
      const line = rubric.breakdownBg.find((l) => l.id === id)!;
      expect(line.measured, id).toBe(true);
      expect(line.points, id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("S1 bot counter-proof — the clipping attempt grades COLLISION at walking speed", () => {
  const { session, result, drive } = driveThroughSession("mistake-wide-approach", 3);

  it("grades COLLISION (vehicle) through the live session pipeline", () => {
    const collisions = session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(result.passed).toBe(false);
    expect(result.summary.terminated).toBe(true);
    // …at walking speed: the parking threshold (collisionMinKmh 0) grades a
    // ~2 km/h touch the street tolerance would swallow.
    const t = collisions[0].t;
    const near = drive.trace.samples.reduce((best, s) =>
      Math.abs(s.tSec - t) < Math.abs(best.tSec - t) ? s : best,
    );
    expect(Math.abs(near.speedKmh)).toBeGreaterThan(0.5);
    expect(Math.abs(near.speedKmh)).toBeLessThan(5);
  });

  it("the rubric caps a terminated attempt at 1★ (legality outranks quality)", () => {
    const rubric = scoreRubric(result, SC_PARK_PERP_REV.rubric!);
    expect(rubric.stars).toBe(1);
  });
});
