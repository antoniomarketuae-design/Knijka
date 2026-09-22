/**
 * THE HUD DOES NOT READ `SimTick.sM` OR `SimTick.distM` EITHER.
 *
 * Founder RULING-2 (2026-09-22) publishes both for the audit harness only.
 * The rule-engine and lesson-engine halves of the proof are executed over real
 * drives in `modules/sim/runtime/__tests__/road-position-not-graded.test.ts`.
 * This closes the third surface, exactly as `edge-alignment-not-in-hud.test.ts`
 * does for its field: `snapshotOf` is the shell's own projection of (session,
 * lastTick) into the HUD and copies NAMED fields off the tick, so a slip that
 * added one of these would be invisible to both of the other folds.
 *
 * HOW IT FAILS. Read `tick.sM` or `tick.distM` anywhere in `snapshotOf` in a
 * way that reaches the returned snapshot, and a lying tick stops projecting
 * identically to a truthful one (or to one without the fields).
 *
 * A hand-built tick is enough here because `snapshotOf` is a pure function of
 * its arguments; that the RUNTIME publishes the fields truthfully is asserted
 * in `runtime/__tests__/road-position.test.ts`, on the real district.
 */
import { describe, expect, it } from "vitest";
import { snapshotOf } from "../LessonPlayShell";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  createLessonSession,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import type { SimTick } from "@/modules/sim/rules";

function session() {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
  expect(spec).toBeDefined();
  const s = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  expect(s.phase).toBe("driving");
  return s;
}

function tick(road?: { sM: number; distM: number }): SimTick {
  const t: SimTick = {
    t: 4,
    speedKmh: 28,
    maxSpeedKmh: 50,
    position: { x: 12, y: -3 },
    headingDeg: 180,
    laneOffsetM: 0.2,
    laneId: 0,
    laneCount: 1,
    edgeId: "e672186635.0",
    oneway: false,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    wrongWay: false,
    events: [],
  };
  if (road !== undefined) {
    t.sM = road.sM;
    t.distM = road.distM;
  }
  return t;
}

describe("snapshotOf ignores sM and distM", () => {
  it("publishes a snapshot at all (so a divergence would be visible)", () => {
    expect(snapshotOf(session(), tick({ sM: 73.5, distM: 1.6 }))).toBeTruthy();
  });

  it("a tick WITH the fields projects identically to one without them", () => {
    expect(snapshotOf(session(), tick({ sM: 73.5, distM: 1.6 }))).toEqual(snapshotOf(session(), tick()));
  });

  it("…and values on either side of any plausible threshold change nothing", () => {
    const base = snapshotOf(session(), tick({ sM: 73.5, distM: 1.6 }));
    expect(snapshotOf(session(), tick({ sM: -1e5, distM: -1e5 }))).toEqual(base);
    expect(snapshotOf(session(), tick({ sM: 1e5, distM: 1e5 }))).toEqual(base);
  });
});
