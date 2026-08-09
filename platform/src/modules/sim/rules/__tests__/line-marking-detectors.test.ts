/**
 * LINE TYPES + BUS LANES detector pack (ADR-006 stage 2b — authored М1/BUS
 * district zones) — true-positive coverage + the STRUCTURAL innocent sides.
 * The taxonomy archetypes:
 *   CROSSED_SOLID_LINE   OV-04/SN-03 escalation  основна (3) — was опасна (10)
 *                                                until the Н38 grounding pass
 *   DRIVING_IN_BUS_LANE  SN-05                   основна (3)
 *
 * The stage-2a discipline holds: both flags are authored data only
 * (tick.solidCenterLine / tick.busLaneRight from district `zones` spans),
 * and every legal-shaped pattern is structurally innocent — the mere touch
 * keeps its own second-degree code, the right-turn transit never convicts,
 * and correctly AVOIDING the bus lane never grades NOT_KEEPING_RIGHT (the
 * keep-right interplay). The A12 whole-drive cases also live in
 * false-positives.test.ts (the contract).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, ViolationEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

describe("CROSSED_SOLID_LINE (OV-04/SN-03 — пресичане на непрекъсната осева)", () => {
  it("fully crossing the solid осева (opposing bank, in-span) grades основна (3) once", () => {
    // RE-BASELINED 2026-08-09 — the charge moved, the DETECTION did not. This
    // code charged 10 under Наредба № 38 приложение № 5, т. 10, б. „в“, whose
    // six cases it matched none of: case 2 is expressly one-way roads and
    // junctions („път с еднопосочно движение“) while this detector requires
    // `oneway: false`, and case 5 („създаде предпоставка за допускане на ПТП“)
    // asks for a danger this detector never establishes — as the fixture below
    // shows, it convicts with no other road user anywhere in the tick. See
    // `rules/n38.ts` → N38_BASIS.CROSSED_SOLID_LINE for the full argument and
    // `naredba-38-classification.test.ts` for the pin that now guards it.
    const { events } = drive([
      tick(0, { speedKmh: 30, oneway: false, solidCenterLine: true }),
      ...cruise(1, 5, { speedKmh: 30, oneway: false, solidCenterLine: true, opposingBank: true }),
    ]);
    const v = violationsOf(events, "CROSSED_SOLID_LINE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
  });

  it("an indicator does NOT exempt — a signalled overtake across solid still convicts", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, oneway: false, solidCenterLine: true, indicator: "left" }),
      ...cruise(1, 5, {
        speedKmh: 30,
        oneway: false,
        solidCenterLine: true,
        opposingBank: true,
        indicator: "left",
      }),
    ]);
    expect(violationsOf(events, "CROSSED_SOLID_LINE")).toHaveLength(1);
  });

  it("a MERE touch (own bank, riding the line band) stays CENTER_LINE_TOUCHED — never the опасна", () => {
    const { events } = drive([
      // One frame inside his own lane first: CENTER_LINE_TOUCHED grades the
      // DEPARTURE onto the paint, and doc 87 B23's spawn-pose latch needs to
      // see where he started. This is also what a real drive looks like.
      tick(0, { speedKmh: 30, oneway: false, solidCenterLine: true, laneId: 0, laneCount: 1 }),
      ...cruise(1, 7, {
        speedKmh: 30,
        oneway: false,
        solidCenterLine: true,
        laneId: 0,
        laneCount: 1,
        laneOffsetM: 3.6,
      }),
    ]);
    expect(codes(events)).toContain("CENTER_LINE_TOUCHED");
    expect(codes(events)).not.toContain("CROSSED_SOLID_LINE");
  });

  it("a crossing suppresses the touch + lane-keep codes for the SAME excursion (one act, one code)", () => {
    // Band transit (off > touch threshold) → fully across → band transit back:
    // one excursion, exactly one CROSSED_SOLID_LINE, no second bill.
    const { events } = drive([
      tick(0, { speedKmh: 30, oneway: false, solidCenterLine: true }),
      // entering the line band on the own bank (off 3.6 — the touch band)
      tick(1, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 3.6 }),
      tick(2, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 4.0 }),
      // fully across (bank flip; laneOffset is now measured in the ONCOMING lane)
      ...cruise(3, 7, {
        speedKmh: 30,
        oneway: false,
        solidCenterLine: true,
        opposingBank: true,
        laneOffsetM: 1.0,
      }),
      // returning through the band
      tick(8, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 4.0 }),
      tick(9, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 3.6 }),
      ...cruise(10, 14, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 0 }),
    ]);
    expect(violationsOf(events, "CROSSED_SOLID_LINE")).toHaveLength(1);
    expect(codes(events)).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes(events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("returning and crossing AGAIN re-arms (two excursions, two bills)", () => {
    const excursion = (t0: number) => [
      ...cruise(t0, t0 + 2, {
        speedKmh: 30,
        oneway: false,
        solidCenterLine: true,
        opposingBank: true,
      }),
      // genuinely back in the own lane (own bank, clear of the band)
      ...cruise(t0 + 3, t0 + 5, { speedKmh: 30, oneway: false, solidCenterLine: true, laneOffsetM: 0 }),
    ];
    const { events } = drive([...excursion(0), ...excursion(6)]);
    expect(violationsOf(events, "CROSSED_SOLID_LINE")).toHaveLength(2);
  });

  it("the opposing bank WITHOUT a solid span never fires (dashed осева — legal overtake country)", () => {
    const { events } = drive(
      cruise(0, 6, { speedKmh: 40, oneway: false, opposingBank: true, indicator: "left" }),
    );
    expect(codes(events)).not.toContain("CROSSED_SOLID_LINE");
  });

  it("a solid span WITHOUT the opposing bank never fires (clean in-lane drive)", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 40, oneway: false, solidCenterLine: true }));
    expect(codes(events)).not.toContain("CROSSED_SOLID_LINE");
  });

  it("paint-jitter flicker (sub-sustain flips) never fires", () => {
    // The car's center dances ON the paint: the flag flips every other frame
    // and can never hold the 0.6 s sustain (A12 — the jitter case).
    const ticks = [];
    for (let i = 0; i <= 20; i++) {
      ticks.push(
        tick(i * 0.25, {
          speedKmh: 25,
          oneway: false,
          solidCenterLine: true,
          ...(i % 2 === 0 ? { opposingBank: true } : {}),
        }),
      );
    }
    const { events } = drive(ticks);
    expect(codes(events)).not.toContain("CROSSED_SOLID_LINE");
  });

  it("reverse maneuvering across the line never fires (parking, not a crossing)", () => {
    const { events } = drive(
      cruise(0, 6, {
        speedKmh: 6,
        gear: -1,
        oneway: false,
        solidCenterLine: true,
        opposingBank: true,
      }),
    );
    expect(codes(events)).not.toContain("CROSSED_SOLID_LINE");
  });
});

describe("DRIVING_IN_BUS_LANE (SN-05 — движение в бус лента)", () => {
  it("a sustained cruise in the bus lane grades основна (3) once", () => {
    const { events } = drive(
      cruise(0, 8, { speedKmh: 40, laneId: 0, laneCount: 2, busLaneRight: true }),
    );
    const v = violationsOf(events, "DRIVING_IN_BUS_LANE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
  });

  it("a brief ≤3 s transit (crossing to the curb) never fires — under the sustain", () => {
    const { events } = drive([
      ...cruise(0, 2, { speedKmh: 25, laneId: 1, laneCount: 2, busLaneRight: true }),
      ...cruise(3, 5, { speedKmh: 25, laneId: 0, laneCount: 2, busLaneRight: true }), // 2 s in the lane
      ...cruise(6, 8, { speedKmh: 15, laneId: 0, laneCount: 2 }), // …and off the span (turned off)
    ]);
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("a declared RIGHT-turn/parking entry (right indicator) never fires, even held longer", () => {
    const { events } = drive(
      cruise(0, 8, {
        speedKmh: 25,
        laneId: 0,
        laneCount: 2,
        busLaneRight: true,
        indicator: "right",
      }),
    );
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("leaving and re-entering the bus lane re-arms (two cruises, two bills)", () => {
    const { events } = drive([
      ...cruise(0, 6, { speedKmh: 40, laneId: 0, laneCount: 2, busLaneRight: true }),
      ...cruise(7, 9, { speedKmh: 40, laneId: 1, laneCount: 2, busLaneRight: true }),
      ...cruise(10, 16, { speedKmh: 40, laneId: 0, laneCount: 2, busLaneRight: true }),
    ]);
    expect(violationsOf(events, "DRIVING_IN_BUS_LANE")).toHaveLength(2);
  });

  it("a degenerate single-lane span never convicts (no general lane to teach)", () => {
    const { events } = drive(
      cruise(0, 10, { speedKmh: 40, laneId: 0, laneCount: 1, busLaneRight: true }),
    );
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("the curb lane WITHOUT a bus span never fires (absent = innocent, the v1 world)", () => {
    const { events } = drive(cruise(0, 12, { speedKmh: 40, laneId: 0, laneCount: 2 }));
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("reverse maneuvering in the lane never fires (curb parking)", () => {
    const { events } = drive(
      cruise(0, 8, { speedKmh: 5, gear: -1, laneId: 0, laneCount: 2, busLaneRight: true }),
    );
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });
});

describe("keep-right ↔ bus-lane interplay (SN-05 — the exemption)", () => {
  it("cruising the GENERAL (left) lane through a bus-lane span never grades NOT_KEEPING_RIGHT", () => {
    // 18 s in laneId 1 — far past the 12 s sustain — but the rightmost lane
    // is a bus lane, so laneId 1 IS the rightmost required lane.
    const { events } = drive(
      cruise(0, 18, { speedKmh: 40, laneId: 1, laneCount: 2, busLaneRight: true }),
    );
    expect(codes(events)).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes(events)).not.toContain("DRIVING_IN_BUS_LANE");
  });

  it("control: the same cruise WITHOUT the span still grades NOT_KEEPING_RIGHT", () => {
    const { events } = drive(cruise(0, 18, { speedKmh: 40, laneId: 1, laneCount: 2 }));
    expect(codes(events)).toContain("NOT_KEEPING_RIGHT");
  });

  it("on a 3-lane bank, hogging the FAR-LEFT lane past a bus span still grades (only the bus lane is excused)", () => {
    const { events } = drive(
      cruise(0, 18, { speedKmh: 40, laneId: 2, laneCount: 3, busLaneRight: true }),
    );
    expect(codes(events)).toContain("NOT_KEEPING_RIGHT");
  });
});
