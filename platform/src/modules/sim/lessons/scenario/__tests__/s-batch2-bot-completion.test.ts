/**
 * Batch-2 bot-completion proofs (doc 76 §10; the s-maneuver / s3-sp mold) — the
 * three NEW templates driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 *   - sc-maneuver-uturn: the shadow completes the threePointTurn in ONE movement
 *     (wide-street single arc) → 3★ economy; the too-wide arc mounts the far
 *     curb → COLLISION at creep speed inside a LIVE session → 1★.
 *   - sc-speed-transition: the shadow completes clean → 3★; the carried speed
 *     grades SPEEDING_DANGEROUS past the transition (against 30) → not passed.
 *   - sc-hazard-obstacle: the shadow clears the obstacle → 3★; holding the line
 *     grades COLLISION → not passed, 1★.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScManeuverUturnDrive } from "../../../traces/scManeuverUturn";
import { recordScSpeedTransitionDrive } from "../../../traces/scSpeedTransition";
import { recordScHazardObstacleDrive } from "../../../traces/scHazardObstacle";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_MANEUVER_UTURN } from "../templates-maneuver";
import { SC_SPEED_TRANSITION } from "../templates-sp";
import { SC_HAZARD_OBSTACLE } from "../templates-hazards";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-maneuver-uturn — the wide-street single-arc U-turn
// ---------------------------------------------------------------------------

describe("batch-2 bot completion — sc-maneuver-uturn single-arc turn at L3", () => {
  const lesson = compileScenario(SC_MANEUVER_UTURN, 3);
  let session = createLessonSession(lesson);
  const drive = recordScManeuverUturnDrive(loadDistrict("wb-boulevard-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both objectives done, zero violations, the turn is ONE movement", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    const turn = result.objectives.find((o) => o.id === "sc-utn-turn")!;
    expect(turn.done).toBe(true);
    expect(turn.detail?.kind).toBe("threePointTurn");
    // A wide-street U-turn: reversed direction in a single forward arc.
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.movements).toBe(1);
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.reversals).toBe(0);
    void drive;
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-maneuver-uturn@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-maneuver-uturn@L3"));
    expect(graded.result.passed).toBe(true);
    const turn = graded.result.objectives.find((o) => o.id === "sc-utn-turn")!;
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.movements).toBe(1);
  });

  it("scores 3★ on economy (the 1-movement turn)", () => {
    const rubric = scoreRubric(result, SC_MANEUVER_UTURN.rubric!);
    expect(rubric.stars).toBe(3);
    const economy = rubric.breakdownBg.find((l) => l.id === "economy")!;
    expect(economy.measured).toBe(true);
    expect(economy.points).toBe(2);
  });

  it("counter-proof: the too-wide arc grades COLLISION and caps the rubric at 1★", () => {
    let s = createLessonSession(compileScenario(SC_MANEUVER_UTURN, 3));
    recordScManeuverUturnDrive(loadDistrict("wb-boulevard-v1"), "mistake-wide", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_MANEUVER_UTURN.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-speed-transition — the 50→30 zone transition (per-edge grading)
// ---------------------------------------------------------------------------

describe("batch-2 bot completion — sc-speed-transition at L3", () => {
  const lesson = compileScenario(SC_SPEED_TRANSITION, 3);
  let session = createLessonSession(lesson);
  recordScSpeedTransitionDrive(loadDistrict("sp-trans-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_SPEED_TRANSITION.rubric!).stars).toBe(3);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-speed-transition@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-speed-transition@L3"));
    expect(graded.result.passed).toBe(true);
  });

  it("counter-proof: carrying the approach speed grades SPEEDING_DANGEROUS in the zone, not passed", () => {
    let s = createLessonSession(compileScenario(SC_SPEED_TRANSITION, 3));
    recordScSpeedTransitionDrive(loadDistrict("sp-trans-v1"), "mistake-carry-speed", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("SPEEDING_DANGEROUS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-hazard-obstacle — the obstacle swerve
// ---------------------------------------------------------------------------

describe("batch-2 bot completion — sc-hazard-obstacle at L3", () => {
  const lesson = compileScenario(SC_HAZARD_OBSTACLE, 3);
  let session = createLessonSession(lesson);
  recordScHazardObstacleDrive(loadDistrict("hz-obstacle-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_HAZARD_OBSTACLE.rubric!).stars).toBe(3);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-hazard-obstacle@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-hazard-obstacle@L3"));
    expect(graded.result.passed).toBe(true);
  });

  it("counter-proof: holding the line grades COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_HAZARD_OBSTACLE, 3));
    recordScHazardObstacleDrive(loadDistrict("hz-obstacle-v1"), "mistake-hold-line", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_HAZARD_OBSTACLE.rubric!).stars).toBe(1);
  });
});
