/**
 * THE TASK CEILING, ROUND 15 — A MARK CREDITED SHORT OF ITSELF IS DECIDED WHERE THE CAR CROSSES IT
 * (`LessonSessionState.taskCapMarkWatch`, `lessons/engine.ts stepTaskCapMarkWatch`).
 *
 * A flow-capped objective completes up to REACH_ZONE_GRACE_M (5 m) short of its mark, with the rung's ladder grace,
 * and the next objective becomes the active one. The car then crosses the mark itself; that crossing is the arrival
 * (founder ruling 2026-10-03 «LIKE A SPEED SIGN», and «the arrival is decided at the mark»):
 *   · credited at 28 under «≤30», then 40 across the mark — billed at the crossing (base 7c73590: nothing at all —
 *     the objective was credited, so nothing ever latched: the 4b342eee shape on a mark the evaluator credits);
 *   · credited at 28, then 30 across the mark — under the line (33): nothing;
 *   · credited, stopped short, BACKED out of the mark's neighbourhood (disc + 5 m) and only then driven across the
 *     mark at 40 — the watch was released when the car left: nothing (the glass has not shown that figure since the
 *     tick, and the car went away from the mark rather than through it).
 */
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const LESSON: LessonSpec = {
  id: "r15-watch",
  order: 1,
  titleBg: "Проба",
  descriptionBg: "",
  conceptIds: [],
  postedLimitKmh: 50,
  spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
  preDrive: false,
  vehicleStart: "ready",
  objectives: [
    { id: "r15-mark", titleBg: "Приближи мястото с готовност за спиране", kind: "reachZone", params: { x: 0, y: 100, radiusM: 10, maxSpeedKmh: 30 } },
    { id: "r15-finish", titleBg: "Стигни края", kind: "reachZone", params: { x: 0, y: 600, radiusM: 12 } },
  ],
};

/**
 * Legs of [toY, kmh, gear, toX?]: the car moves at `kmh` (0.1 s frames) until it reaches `toY`, backwards when gear < 0,
 * drifting sideways to `toX` over the leg when one is given.
 */
function drive(legs: Array<[number, number, number, number?]>) {
  let s: LessonSessionState = createLessonSession(LESSON);
  let t = 0;
  let y = 15;
  let x = 0;
  const creditedAt: number[] = [];
  for (const [toY, kmh, gear, toX] of legs) {
    const dir = gear < 0 ? -1 : 1;
    const y0 = y;
    const x0 = x;
    while (dir > 0 ? y < toY : y > toY) {
      t = Math.round((t + 0.1) * 100) / 100;
      y = dir > 0 ? Math.min(toY, y + (kmh / 3.6) * 0.1) : Math.max(toY, y - (kmh / 3.6) * 0.1);
      if (toX !== undefined) x = x0 + ((toX - x0) * (y - y0)) / (toY - y0);
      const before = s.objectives[0].status;
      s = applyTick(s, makeTick({ t, speedKmh: dir * kmh, gear, maxSpeedKmh: 50, position: { x, y }, headingDeg: 0 })).state;
      if (before !== "done" && s.objectives[0].status === "done") creditedAt.push(y);
    }
  }
  const r = buildLessonResult(s);
  return {
    s,
    creditedAt,
    task: [...(r.coachedMistakes ?? []).filter((c) => c.code === TASK).map((c) => c.t), ...r.summary.mistakes.filter((m) => m.code === TASK).map((m) => m.t)],
    breaches: r.taskCapBreaches ?? [],
  };
}

describe("a capped mark credited short of itself is decided where the car crosses it", () => {
  it("credited at 28 under «≤30» (5 m short), then 40 across the mark: billed at the crossing — one coached row, one breach row (base: nothing)", () => {
    const d = drive([[96, 28, 1], [130, 40, 1]]);
    expect(d.creditedAt).toHaveLength(1);
    expect(d.creditedAt[0]).toBeLessThan(100);
    expect(d.task).toHaveLength(1);
    expect(d.breaches.map((b) => b.objectiveId)).toEqual(["r15-mark"]);
  });
  it("GUARD — credited at 28, then 30 across the mark (under the line 33): nothing", () => {
    const d = drive([[96, 28, 1], [130, 30, 1]]);
    expect(d.creditedAt).toHaveLength(1);
    expect(d.task).toEqual([]);
    expect(d.breaches).toEqual([]);
  });
  it("credited, stopped short, BACKED out of the mark's neighbourhood (to 20 m short), then 40 across the mark: the watch was released when the car left — nothing", () => {
    const d = drive([[96, 28, 1], [97, 2, 1], [80, 5, -1], [130, 40, 1]]);
    expect(d.creditedAt).toHaveLength(1);
    expect(d.task).toEqual([]);
    expect(d.breaches).toEqual([]);
  });
  it("…and the same without leaving (stopped 3 m short, then 40 across the mark): billed", () => {
    const d = drive([[96, 28, 1], [97, 2, 1], [130, 40, 1]]);
    expect(d.task).toHaveLength(1);
  });
});

describe("a mark is crossed only INSIDE its disc", () => {
  it("entered the ring on the mark's axis, then swerved 14 m to the side (radius 10) and passed the mark's line there at 45: the mark was not crossed — nothing", () => {
    const d = drive([[86, 30, 1], [99, 45, 1, 14], [130, 45, 1]]);
    expect(d.task).toEqual([]);
    expect(d.breaches).toEqual([]);
  });
  it("…and the same line passed 4 m to the side, inside the disc, at 45: billed", () => {
    const d = drive([[86, 30, 1], [99, 45, 1, 4], [130, 45, 1]]);
    expect(d.task).toHaveLength(1);
  });
});
