/**
 * Audit M-17 — the turn's two ungraded duties.
 *
 * (a) LANE INTENT. `meta.scenario.laneArrows` has been painted, taught and
 *     demoed since the SN-04 pack, and no rule read it: „ляв завой от лента
 *     „само направо"" reached the student's debrief as TURN_WITHOUT_INDICATOR
 *     — the right severity attached to the wrong law, which requirement-zero
 *     forbids outright. WRONG_LANE_FOR_DIRECTION grades the act itself.
 * (b) OBSERVATION. A turn is a manoeuvre under чл. 25, ал. 1 exactly as a lane
 *     change is; the lane-change path has graded the mirror since v1 and the
 *     turn path never did. Config-gated OFF like every other observation
 *     check, so no shipped drive changes verdict by default.
 *
 * The innocence half matters as much: no arrows, an unreadable glyph, a stale
 * memory or a reverse manoeuvre must all grade nothing.
 */

import { describe, expect, it } from "vitest";
import type { SimTick, SimTickEvent } from "../types";
import { DEFAULT_RULE_CONFIG } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

const turn = (direction: "left" | "right"): SimTickEvent => ({ kind: "turnStarted", direction });
const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({ kind: "mirrorGlance", mirror });

/** Approach over an arrow span, then start a turn `afterSec` later. */
function approachAndTurn(
  arrow: SimTick["laneArrow"],
  direction: "left" | "right",
  afterSec = 1,
  over: Partial<SimTick> = {},
): SimTick[] {
  const approach = cruise(0, 3, { speedKmh: 40, indicator: direction, laneArrow: arrow, ...over });
  const between = cruise(4, 3 + afterSec, { speedKmh: 30, indicator: direction, ...over });
  return [
    ...approach,
    ...between,
    tick(4 + afterSec, { speedKmh: 30, indicator: direction, events: [turn(direction)], ...over }),
  ];
}

describe("M-17a — WRONG_LANE_FOR_DIRECTION (М10 lane arrows)", () => {
  it("turning left out of a „само направо“ lane grades the marking, not the signal", () => {
    const { events } = drive(approachAndTurn("through", "left"));
    expect(codes(events)).toEqual(["WRONG_LANE_FOR_DIRECTION"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", points: 3, lawRef: "ЗДвП чл. 6, т. 1" });
  });

  it("turning left out of the „само наляво“ lane grades nothing", () => {
    expect(codes(drive(approachAndTurn("left", "left")).events)).toEqual([]);
  });

  it("a combined ↑→ glyph permits the right turn and forbids the left", () => {
    expect(codes(drive(approachAndTurn("throughRight", "right")).events)).toEqual([]);
    expect(codes(drive(approachAndTurn("throughRight", "left")).events)).toEqual([
      "WRONG_LANE_FOR_DIRECTION",
    ]);
  });

  it("an unmarked approach grades nothing — absent marking is innocent", () => {
    expect(codes(drive(approachAndTurn(undefined, "left")).events)).toEqual([]);
  });

  it("the arrow keeps governing across the junction it led into", () => {
    // The glyph is painted on the approach and the turn is adjudicated inside
    // the junction, several seconds and a lane fix later — without the memory
    // the detector could never fire on a real drive.
    const { events } = drive(approachAndTurn("through", "left", 4));
    expect(codes(events)).toEqual(["WRONG_LANE_FOR_DIRECTION"]);
  });

  it("a stale arrow cannot convict a later junction", () => {
    const stale = DEFAULT_RULE_CONFIG.laneArrowMemorySec + 2;
    expect(codes(drive(approachAndTurn("through", "left", stale)).events)).toEqual([]);
  });

  it("one approach convicts at most one turn (the memory is spent)", () => {
    const { events } = drive([
      ...cruise(0, 3, { speedKmh: 40, indicator: "left", laneArrow: "through" }),
      tick(4, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
      tick(5, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
    ]);
    expect(codes(events)).toEqual(["WRONG_LANE_FOR_DIRECTION"]);
  });

  it("reverse maneuvering over an arrow is never a wrong-lane turn", () => {
    const { events } = drive([
      ...cruise(0, 3, { speedKmh: 6, gear: -1, indicator: "left", laneArrow: "through" }),
      tick(4, { speedKmh: 6, gear: -1, indicator: "left", events: [turn("left")] }),
    ]);
    expect(codes(events)).not.toContain("WRONG_LANE_FOR_DIRECTION");
  });
});

describe("M-17b — TURN_WITHOUT_OBSERVATION (config-gated)", () => {
  const on = { turnObservationEnabled: true };

  it("is silent by default — no shipped drive changes verdict", () => {
    const { events } = drive([
      ...cruise(0, 3, { speedKmh: 30, indicator: "left" }),
      tick(4, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
    ]);
    expect(codes(events)).toEqual([]);
  });

  it("grades a turn taken without a mirror glance to the turn's side", () => {
    const { events } = drive(
      [
        ...cruise(0, 3, { speedKmh: 30, indicator: "left" }),
        tick(4, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
      ],
      on,
    );
    expect(codes(events)).toEqual(["TURN_WITHOUT_OBSERVATION"]);
    expect(events[0]).toMatchObject({ severityClass: "osnovna", lawRef: "ЗДвП чл. 25, ал. 1" });
  });

  it("a fresh glance to the turn's side clears it", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 30, indicator: "left", events: [glance("left")] }),
        ...cruise(1, 3, { speedKmh: 30, indicator: "left" }),
        tick(4, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
      ],
      on,
    );
    expect(codes(events)).toEqual([]);
  });

  it("the WRONG side's mirror does not count", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 30, indicator: "left", events: [glance("right")] }),
        ...cruise(1, 3, { speedKmh: 30, indicator: "left" }),
        tick(4, { speedKmh: 30, indicator: "left", events: [turn("left")] }),
      ],
      on,
    );
    expect(codes(events)).toEqual(["TURN_WITHOUT_OBSERVATION"]);
  });

  it("the observation fault is distinct from the signal fault (both can fire)", () => {
    const { events } = drive(
      [...cruise(0, 3, { speedKmh: 30 }), tick(4, { speedKmh: 30, events: [turn("left")] })],
      on,
    );
    expect(codes(events).sort()).toEqual(["TURN_WITHOUT_INDICATOR", "TURN_WITHOUT_OBSERVATION"]);
  });
});
