/**
 * B1a Wave-2 detector pack (doc 72 capability 1 — small-rule detectors on
 * EXISTING telemetry) — true-positive coverage. Each detector's guilty pattern
 * per its taxonomy archetype:
 *   STANDSTILL_GAP_TOO_CLOSE  FO-08  второстепенна (1)
 *   HIGH_BEAM_NOT_DIPPED      AC-04  второстепенна (1)
 *   OVERTAKING_AT_CROSSING    OV-07  опасна (10)
 * The innocent side of each lives in false-positives.test.ts (the contract).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTickEvent, ViolationEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({ kind: "mirrorGlance", mirror });
const zoneEntered = (ped: boolean, crossingId = "x1"): SimTickEvent => ({
  kind: "crossingZoneEntered",
  crossingId,
  pedestrianOnCrossing: ped,
});

describe("STANDSTILL_GAP_TOO_CLOSE (FO-08 — дистанция при спиране в колона)", () => {
  it("bumper-kissing at a full stop behind a stopped lead grades второстепенна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 8, leadGapM: 6 }),
      ...cruise(1, 6, { speedKmh: 0.4, leadGapM: 1.1 }),
    ]);
    const v = violationsOf(events, "STANDSTILL_GAP_TOO_CLOSE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
    expect(v[0].points).toBe(1);
  });

  it("moving off then bumper-kissing at the next stop re-arms (two bills)", () => {
    const { events } = drive([
      ...cruise(0, 3, { speedKmh: 0.4, leadGapM: 1.0 }),
      tick(4, { speedKmh: 20, leadGapM: 20 }), // pulls away
      ...cruise(5, 9, { speedKmh: 0.4, leadGapM: 1.0 }), // stops close again
    ]);
    expect(violationsOf(events, "STANDSTILL_GAP_TOO_CLOSE")).toHaveLength(2);
  });

  it("never fires while the queue is still ROLLING (that is the following family)", () => {
    // A moving queue at 18 km/h a car-length apart is FOLLOWING_TOO_CLOSE's
    // business (with its own queue exemption) — the standstill code only judges
    // v ≈ 0, so it stays silent here.
    const { events } = drive(cruise(0, 8, { speedKmh: 18, leadGapM: 1.2 }));
    expect(codes(events)).not.toContain("STANDSTILL_GAP_TOO_CLOSE");
  });
});

describe("HIGH_BEAM_NOT_DIPPED (AC-04 — дълги светлини зад кола)", () => {
  it("long beam left on behind a lead at night grades второстепенна", () => {
    const { events } = drive(
      cruise(0, 5, { speedKmh: 45, isNight: true, headlights: "high", leadGapM: 40 }),
    );
    const v = violationsOf(events, "HIGH_BEAM_NOT_DIPPED");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
  });

  it("dipping then catching a NEW lead on high beam re-arms (two bills)", () => {
    const { events } = drive([
      ...cruise(0, 4, { speedKmh: 45, isNight: true, headlights: "high", leadGapM: 40 }),
      ...cruise(5, 7, { speedKmh: 45, isNight: true, headlights: "low", leadGapM: 40 }), // dipped
      ...cruise(8, 13, { speedKmh: 45, isNight: true, headlights: "high", leadGapM: 40 }), // back on high
    ]);
    expect(violationsOf(events, "HIGH_BEAM_NOT_DIPPED")).toHaveLength(2);
  });

  it("high beam with NO lead ahead never fires (open-road beam is correct)", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 60, isNight: true, headlights: "high" }));
    expect(codes(events)).not.toContain("HIGH_BEAM_NOT_DIPPED");
  });
});

describe("OVERTAKING_AT_CROSSING (OV-07 — изпреварване на пътека)", () => {
  it("overtaking a lead inside an armed crossing zone grades опасна (10)", () => {
    // Signalled + mirrored, so the ONLY violation is the illegal LOCATION —
    // proving the code charges the crossing overtake, not the signalling.
    const { events } = drive([
      tick(0, {
        speedKmh: 40,
        leadGapM: 18,
        indicator: "left",
        events: [glance("left"), zoneEntered(false)],
      }),
      tick(1, { speedKmh: 40, leadGapM: 18, indicator: "left", laneId: 1 }),
    ]);
    const v = violationsOf(events, "OVERTAKING_AT_CROSSING");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("opasna");
    expect(v[0].points).toBe(10);
    // the correct signalling still earns its commendation — distinct acts
    expect(codes(events)).toContain("SAFE_LANE_CHANGE");
  });

  it("fires exactly once per pass", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, leadGapM: 18, events: [zoneEntered(false)] }),
      tick(1, { speedKmh: 40, leadGapM: 18, laneId: 1 }),
      tick(2, { speedKmh: 40, leadGapM: 18, laneId: 1 }),
    ]);
    expect(violationsOf(events, "OVERTAKING_AT_CROSSING")).toHaveLength(1);
  });
});
