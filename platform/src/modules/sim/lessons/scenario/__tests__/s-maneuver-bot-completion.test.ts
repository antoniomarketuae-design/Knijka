/**
 * S-maneuver bot-completion proof (doc 76 §10; the s2-parking-bot-completion
 * mold) — „Обратен завой в три точки" driven through the FULL production
 * pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordScManeuver3PointDrive's
 *   onTick feeds applyTick every production frame → session completes → wire
 *   serialization → gradeFinishWire RECOMPILES from the id and regrades →
 *   scoreRubric → 3★ (a clean three-point turn = 3 movements).
 *
 * Counter-proof: the too-wide swing mounts the far curb → COLLISION at creep
 * speed inside a LIVE session (collisionMinKmh 0), capping the rubric at 1★.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScManeuver3PointDrive } from "../../../traces/scManeuver3Point";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_MANEUVER_3POINT } from "../templates-maneuver";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

function driveThroughSession(name: Parameters<typeof recordScManeuver3PointDrive>[1]) {
  const lesson = compileScenario(SC_MANEUVER_3POINT, 3);
  let session = createLessonSession(lesson);
  const drive = recordScManeuver3PointDrive(loadDistrict("ov-narrow-v1"), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return { session, result: buildLessonResult(session), drive };
}

describe("S-maneuver bot completion — sc-maneuver-3point correct turn at L3", () => {
  const outcome = driveThroughSession("shadow-correct");

  it("completes the session: both objectives done, zero violations, passed", () => {
    expect(outcome.session.phase).toBe("completed");
    expect(outcome.result.completedAll).toBe(true);
    expect(outcome.result.passed).toBe(true);
    expect(outcome.result.score).toBe(0);
    const turn = outcome.result.objectives.find((o) => o.id === "sc-m3p-turn")!;
    expect(turn.done).toBe(true);
    expect(turn.detail?.kind).toBe("threePointTurn");
    // A clean three-point turn: reversed direction in exactly 3 movements.
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.movements).toBe(3);
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.reversals).toBe(2);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const { session, result } = outcome;
    const graded = gradeFinishWire({
      lessonId: "sc-maneuver-3point@L3",
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
    expect(graded.lesson.id).toBe("sc-maneuver-3point@L3");
    expect(graded.lesson).toEqual(scenarioLessonById("sc-maneuver-3point@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
    const turn = graded.result.objectives.find((o) => o.id === "sc-m3p-turn")!;
    // The threePointTurn detail (movements) survives the wire round-trip.
    expect(turn.detail?.kind).toBe("threePointTurn");
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.movements).toBe(3);
  });

  it("scores 3★ on economy (the 3-movement turn) — clean and legal", () => {
    const rubric = scoreRubric(outcome.result, SC_MANEUVER_3POINT.rubric!);
    expect(rubric.stars).toBe(3);
    const economy = rubric.breakdownBg.find((l) => l.id === "economy")!;
    expect(economy.measured).toBe(true);
    expect(economy.points).toBe(2);
    expect(economy.detailBg).toMatch(/[Ѐ-ӿ]/);
  });
});

describe("S-maneuver counter-proof — a curb contact grades through the live pipeline", () => {
  it("too-wide swing: COLLISION (staticObject) at creep speed, rubric capped at 1★", () => {
    const outcome = driveThroughSession("mistake-wide");
    const collisions = outcome.session.events.filter(
      (e) => e.kind === "violation" && e.code === "COLLISION",
    );
    expect(collisions.length).toBeGreaterThanOrEqual(1);
    expect(outcome.result.passed).toBe(false);
    expect(outcome.result.summary.terminated).toBe(true);
    expect(scoreRubric(outcome.result, SC_MANEUVER_3POINT.rubric!).stars).toBe(1);
  });
});
