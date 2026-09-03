/**
 * sc-rb-busy-gap / sc-rbg-past-east — the gate stands ON THE RING, and a car
 * that takes the FIRST exit cannot collect it. Audit row
 * sc-rb-busy-gap:5ee56710.
 *
 * WHAT WENT WRONG. The row is titled «Подмини първия изход (изток), без да
 * излизаш от кръга» and it was authored as a disc centred on the east NODE
 * (18, 0) — which is exactly the place a car TAKING the east exit must drive
 * through. The clause the title makes its point with was the one clause nothing
 * read. The aided rung made it worse rather than different: `params.ts
 * widenRadius` multiplies a waypoint by the rung's tolerance (×1.5 at L1), so
 * the authored 6 compiled to 9 and the disc reached 27 m from the island —
 * three metres PAST the drill's own boundary of «в кръга», the maneuver row's
 * `enterRadiusM` of 24.
 *
 * The remedy is the one this file's shelf already ships one exit later
 * (EXIT_APPROACH_LEAD_DEG): put the claim where a gate can see it. The disc now
 * stands 20° further round the ring, at (16.91, 6.16).
 *
 * The three assertions below are the three halves of that, and each of them can
 * only be broken by moving the gate back:
 *   (a) CONTAINMENT — on every authored rung the compiled disc reaches no
 *       further from the island than `enterRadiusM`. This is the same ceiling
 *       EXIT_APPROACH_LEAD_DEG spells out, and it was the one the old gate
 *       failed.
 *   (b) THE BAIL-OUT IS REFUSED — driven through the production stack, a car
 *       that comes up the south arm, halts at the give-way line and then leaves
 *       by the FIRST exit collects the yield row and NOT this one.
 *   (c) AND A LAWFUL CIRCULATION IS NOT — the same drive, continuing round the
 *       ring instead, collects it; and so does one riding the OUTER edge of the
 *       ring rather than its centerline, which is what «keep right» looks like
 *       on a one-way ring (`edgeTravelHalfWidth`: one `roundabout` lane at
 *       LANE_WIDTH_M 8.125 ⇒ a drivable half-width of 4.06 m). Refusing a
 *       lawful drive is the failure this repair must not buy.
 */

import { describe, expect, it } from "vitest";
import { applyTick, createLessonSession } from "../../engine";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import type { ScenarioLevel } from "../types";
import { SC_RB_BUSY_GAP } from "../templates-roundabout";

/** Ring centerline radius of rb-mini-v1 — the value the template pins. */
const RING_R = 18;
/** Right-lane centre of an arm (rb-mini-v1 meta.scenario.laneCenterRightM). */
const ARM_LANE = 4.06;

type Zone = { x: number; y: number; radiusM: number; maxSpeedKmh?: number };

function zoneOf(level: ScenarioLevel, objectiveId: string): Zone {
  const lesson = compileScenario(SC_RB_BUSY_GAP, level);
  const o = lesson.objectives.find((x) => x.id === objectiveId)!;
  return o.params as unknown as Zone;
}

function enterRadiusOf(level: ScenarioLevel): number {
  const lesson = compileScenario(SC_RB_BUSY_GAP, level);
  const o = lesson.objectives.find((x) => x.id === "sc-rbg-exit")!;
  return (o.params as unknown as { enterRadiusM: number }).enterRadiusM;
}

const LEVELS = SC_RB_BUSY_GAP.levels.map((l) => l.level);

const statusOf = (
  s: ReturnType<typeof createLessonSession>,
  objectiveId: string,
): string => s.objectives.find((o) => o.spec.id === objectiveId)!.status;

/** The approach every drive below shares: up the south arm, halt on the line. */
function haltedAtTheLine(level: ScenarioLevel): ReturnType<typeof createLessonSession> {
  let s = createLessonSession(compileScenario(SC_RB_BUSY_GAP, level));
  const line = zoneOf(level, "sc-rbg-yield-line");
  s = applyTick(s, makeTick({ t: 0, position: { x: ARM_LANE, y: -93 }, speedKmh: 0 })).state;
  s = applyTick(s, makeTick({ t: 4, position: { x: ARM_LANE, y: -50 }, speedKmh: 14 })).state;
  s = applyTick(s, makeTick({ t: 9, position: { x: line.x, y: line.y }, speedKmh: 0 })).state;
  expect(statusOf(s, "sc-rbg-yield-line")).toBe("done");
  return s;
}

describe("(a) the east gate never reaches past the drill's own «в кръга» boundary", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      const gate = zoneOf(level, "sc-rbg-past-east");
      const centreR = Math.hypot(gate.x, gate.y);
      // The gate sits ON the ring centerline…
      expect(centreR).toBeCloseTo(RING_R, 1);
      // …and its furthest point from the island is inside `enterRadiusM`, so no
      // pose that has left the roundabout can satisfy it.
      expect(centreR + gate.radiusM).toBeLessThanOrEqual(enterRadiusOf(level));
    });
  }
});

describe("(b) the first-exit bail-out is refused the row that certifies it did not bail", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      let s = haltedAtTheLine(level);
      // Into the ring, round to the east mouth, and straight out the east arm
      // keeping right — the mistake instruction 5 exists to prevent.
      s = applyTick(s, makeTick({ t: 14, position: { x: 12.9, y: -11.2 }, speedKmh: 12 })).state;
      s = applyTick(s, makeTick({ t: 17, position: { x: 17.7, y: -3.4 }, speedKmh: 12 })).state;
      s = applyTick(s, makeTick({ t: 19, position: { x: 19, y: -ARM_LANE }, speedKmh: 12 })).state;
      s = applyTick(s, makeTick({ t: 21, position: { x: 26, y: -ARM_LANE }, speedKmh: 14 })).state;
      s = applyTick(s, makeTick({ t: 24, position: { x: 40, y: -ARM_LANE }, speedKmh: 14 })).state;

      expect(statusOf(s, "sc-rbg-past-east")).not.toBe("done");
    });
  }
});

describe("(c) a car still circulating collects it — on the centerline and on the outer edge", () => {
  /** Ring point at circulation angle φ (0 = south node, CCW through east). */
  function ring(phiDeg: number, radius: number): { x: number; y: number } {
    const a = (phiDeg * Math.PI) / 180;
    return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
  }

  for (const level of LEVELS) {
    // The centerline drive is the committed shadow's own line (it passes the
    // gate's centre at 0.04 m); the outer drive is a car whose FULL WIDTH is
    // still on the asphalt — half-width 4.06 m less half a 1.8 m car.
    for (const [what, radius] of [
      ["centerline", RING_R],
      ["outer keep-right line", RING_R + 4.06 - 0.9],
    ] as const) {
      it(`L${level} · ${what}`, () => {
        let s = haltedAtTheLine(level);
        let t = 12;
        for (const phi of [30, 60, 80, 95, 105, 110, 115, 125]) {
          const p = ring(phi, radius);
          s = applyTick(s, makeTick({ t, position: p, speedKmh: 12 })).state;
          t += 2;
        }
        expect(statusOf(s, "sc-rbg-past-east")).toBe("done");
      });
    }
  }
});
