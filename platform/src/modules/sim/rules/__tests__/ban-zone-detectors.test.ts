/**
 * ZONE-BAN detector pack (ADR-006 stage 2a — authored В24/В27 district zones)
 * — true-positive coverage + the STRUCTURAL innocent sides. The taxonomy
 * archetypes:
 *   ILLEGAL_STOP_IN_BAN_ZONE  PK-06  основна (3)
 *   OVERTAKING_IN_BAN_ZONE    OV-06  основна (3)
 *
 * The deferred-illegal-stop FP finding („a legal red-light/yield stop near a
 * junction looks identical to an illegal one") is the design constraint this
 * file enforces from BOTH sides: the zone flag is authored data only, and a
 * queue/signal/crossing stop INSIDE a zone must never convict. The A12
 * whole-drive cases also live in false-positives.test.ts (the contract).
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

describe("ILLEGAL_STOP_IN_BAN_ZONE (PK-06 — спиране в забранена зона, В27)", () => {
  it("a casual rest inside a В27 zone grades основна (3) once", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25, noStopZone: true }),
      ...cruise(1, 7, { speedKmh: 0, noStopZone: true }),
    ]);
    const v = violationsOf(events, "ILLEGAL_STOP_IN_BAN_ZONE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
  });

  it("driving on and resting AGAIN inside the zone re-arms (two bills)", () => {
    const { events } = drive([
      ...cruise(0, 5, { speedKmh: 0, noStopZone: true }),
      tick(6, { speedKmh: 20, noStopZone: true }), // drives on (reset)
      ...cruise(7, 12, { speedKmh: 0, noStopZone: true }),
    ]);
    expect(violationsOf(events, "ILLEGAL_STOP_IN_BAN_ZONE")).toHaveLength(2);
  });

  it("a brief 2 s traffic stop inside the zone never fires (under the sustain)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25, noStopZone: true }),
      ...cruise(1, 3, { speedKmh: 0, noStopZone: true }), // 2 s at rest
      ...cruise(4, 8, { speedKmh: 25, noStopZone: true }),
    ]);
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a QUEUE stop inside the zone (lead at rest ahead) never fires — structurally innocent", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 0, noStopZone: true, leadGapM: 6 }));
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a RED-LIGHT stop inside the zone (forbidding effective signal ahead) never fires", () => {
    const { events } = drive(
      cruise(0, 10, {
        speedKmh: 0,
        noStopZone: true,
        nextStopLineM: 60,
        nextStopLineControl: "trafficLight",
        nextStopLineState: "red",
      }),
    );
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a stop at a Б2 line inside the zone (stop line within the clear window) never fires", () => {
    const { events } = drive(
      cruise(0, 10, {
        speedKmh: 0,
        noStopZone: true,
        nextStopLineM: 4,
        nextStopLineControl: "stopSign",
      }),
    );
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a stop inside an ARMED CROSSING ZONE never fires (yielding country)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, noStopZone: true, events: [zoneEntered(true)] }),
      ...cruise(1, 10, { speedKmh: 0, noStopZone: true }),
    ]);
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a reverse-gear rest inside the zone never fires (maneuvering, not престой)", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 0, gear: -1, noStopZone: true }));
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a rest in a В28 no-PARKING zone never fires (престоят под В28 е разрешен)", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 0, noParkZone: true }));
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("a long rest with NO zone context never fires (absent = innocent, the v1 world)", () => {
    const { events } = drive(cruise(0, 15, { speedKmh: 0 }));
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });

  it("config-gated: banZoneStopEnabled=false silences the code entirely", () => {
    const { events } = drive(cruise(0, 10, { speedKmh: 0, noStopZone: true }), {
      banZoneStopEnabled: false,
    });
    expect(codes(events)).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
  });
});

describe("OVERTAKING_IN_BAN_ZONE (OV-06 — изпреварване при забрана, В24)", () => {
  it("a lane change past a lead inside a В24 zone grades основна (3)", () => {
    // Signalled + mirrored, so the ONLY violation is the illegal LOCATION —
    // the code charges the ban-zone overtake, not the signalling.
    const { events } = drive([
      tick(0, {
        speedKmh: 40,
        leadGapM: 18,
        indicator: "left",
        noOvertakeZone: true,
        events: [glance("left")],
      }),
      tick(1, { speedKmh: 40, leadGapM: 18, indicator: "left", laneId: 1, noOvertakeZone: true }),
    ]);
    const v = violationsOf(events, "OVERTAKING_IN_BAN_ZONE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
    // the correct signalling still earns its commendation — distinct acts
    expect(codes(events)).toContain("SAFE_LANE_CHANGE");
  });

  it("fires exactly once per pass", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, leadGapM: 18, noOvertakeZone: true }),
      tick(1, { speedKmh: 40, leadGapM: 18, laneId: 1, noOvertakeZone: true }),
      tick(2, { speedKmh: 40, leadGapM: 18, laneId: 1, noOvertakeZone: true }),
    ]);
    expect(violationsOf(events, "OVERTAKING_IN_BAN_ZONE")).toHaveLength(1);
  });

  it("a lane change with NO lead inside the zone is a reposition — never fires", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, noOvertakeZone: true }),
      tick(1, { speedKmh: 40, laneId: 1, noOvertakeZone: true }),
    ]);
    expect(codes(events)).not.toContain("OVERTAKING_IN_BAN_ZONE");
  });

  it("a lane change past a lead OUTSIDE the zone never fires", () => {
    const { events } = drive([
      tick(0, { speedKmh: 40, leadGapM: 18 }),
      tick(1, { speedKmh: 40, leadGapM: 18, laneId: 1 }),
    ]);
    expect(codes(events)).not.toContain("OVERTAKING_IN_BAN_ZONE");
  });

  it("the legacy WHOLE-EDGE noOvertake surface tag never arms it (zones only)", () => {
    // Shipped maps may carry edge-level noOvertake hints; only the bounded,
    // sign-posted zone span (noOvertakeZone) convicts.
    const { events } = drive([
      tick(0, { speedKmh: 40, leadGapM: 18, noOvertake: true }),
      tick(1, { speedKmh: 40, leadGapM: 18, laneId: 1, noOvertake: true }),
    ]);
    expect(codes(events)).not.toContain("OVERTAKING_IN_BAN_ZONE");
  });
});
