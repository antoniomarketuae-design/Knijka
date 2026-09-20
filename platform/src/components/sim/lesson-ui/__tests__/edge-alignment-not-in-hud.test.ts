/**
 * THE HUD DOES NOT READ `SimTick.edgeAlignment` EITHER.
 *
 * `edgeAlignment` is an OBSERVATION published for the audit harness, and the
 * constraint it shipped under is that it changes nothing the student sees or
 * is graded on. The rule engine and the lesson engine halves of that proof are
 * executed in `modules/sim/runtime/__tests__/edge-alignment-not-graded.test.ts`,
 * over a real drive. This file closes the third surface: `snapshotOf` is the
 * shell's own projection of (session, lastTick) into the HUD, and it copies
 * NAMED fields off the tick — so a slip that added this one would be invisible
 * to both of the other folds.
 *
 * HOW IT FAILS. Read `tick.edgeAlignment` anywhere in `snapshotOf` in a way
 * that reaches the returned snapshot, and the corrupted projection stops being
 * deep-equal to the published one.
 *
 * WHY A HAND-BUILT TICK IS ENOUGH HERE, AND ONLY HERE. `snapshotOf` is a pure
 * function of its arguments; nothing about the world runtime is in question on
 * this surface. That the RUNTIME publishes this record truthfully, on every
 * tick, is asserted where it belongs — `runtime/__tests__/edge-alignment.test.ts`,
 * driving the real district.
 */
import { describe, expect, it } from "vitest";
import { snapshotOf } from "../LessonPlayShell";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  createLessonSession,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import type { EdgeAlignment, SimTick } from "@/modules/sim/rules";

function session() {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
  expect(spec).toBeDefined();
  const s = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  expect(s.phase).toBe("driving");
  return s;
}

/** The runtime's own shape, for a car circulating a ring 12° off the flow. */
const ALIGNED: EdgeAlignment = {
  deg: 12,
  wrongWayArmed: true,
  edgeId: "e925166131.0",
  offCarriageway: false,
  travelDir: 1,
  roundabout: true,
};

function tick(edgeAlignment?: EdgeAlignment): SimTick {
  const t: SimTick = {
    t: 4,
    speedKmh: 28,
    maxSpeedKmh: 50,
    position: { x: 12, y: -3 },
    headingDeg: 180,
    laneOffsetM: 0.2,
    laneId: 0,
    laneCount: 1,
    edgeId: "e925166131.0",
    oneway: true,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    wrongWay: false,
    events: [],
  };
  if (edgeAlignment !== undefined) t.edgeAlignment = edgeAlignment;
  return t;
}

describe("snapshotOf ignores edgeAlignment", () => {
  it("publishes a snapshot at all (so a divergence would be visible)", () => {
    expect(snapshotOf(session(), tick(ALIGNED))).toBeTruthy();
  });

  it("a tick WITH the record projects identically to one without it", () => {
    expect(snapshotOf(session(), tick(ALIGNED))).toEqual(snapshotOf(session(), tick()));
  });

  it("…and flipping its sign, its arming and its ring flag changes nothing", () => {
    const lying: EdgeAlignment = {
      ...ALIGNED,
      deg: -ALIGNED.deg!,
      wrongWayArmed: false,
      roundabout: false,
      travelDir: -1,
    };
    expect(snapshotOf(session(), tick(lying))).toEqual(snapshotOf(session(), tick(ALIGNED)));
  });

  it("…and a NOT-MEASURABLE record is not read as anything either", () => {
    const nowhere: EdgeAlignment = {
      deg: null,
      reason: "no-edge-fix",
      wrongWayArmed: false,
      edgeId: null,
      offCarriageway: true,
    };
    expect(snapshotOf(session(), tick(nowhere))).toEqual(snapshotOf(session(), tick(ALIGNED)));
  });
});
