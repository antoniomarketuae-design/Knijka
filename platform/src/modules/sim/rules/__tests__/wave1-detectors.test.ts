/**
 * B1a Wave-1 detector pack (doc 72 capability 1 + N2) — true-positive
 * coverage. Every detector's guilty pattern per its taxonomy archetype:
 *   ENGINE_STALLED               VP-04  второстепенна (1)
 *   MOVE_OFF_WITHOUT_OBSERVATION PK-05  основна (3)  — config-gated
 *   STOP_LINE_OVERSHOOT          JU-15  второстепенна (1)
 *   CENTER_LINE_TOUCHED          SN-03  второстепенна (1)
 *   HARSH_BRAKING_NO_CAUSE       SP-11  основна (3)
 *   HESITATION_AT_GREEN          JU-09  второстепенна (1)
 *   YELLOW_LIGHT_NOT_STOPPED     JU-06  основна (3)
 *   RED_YELLOW_CROSSED           JU-08  основна (3)
 * The innocent side of each lives in false-positives.test.ts (the contract).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTick, ViolationEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

describe("ENGINE_STALLED (VP-04 — загасване)", () => {
  it("fires once per stall episode, второстепенна 1 т.", () => {
    const { events } = drive([
      tick(0, { speedKmh: 0 }),
      tick(1, { speedKmh: 3, stalled: true }), // stall latches
      tick(2, { speedKmh: 0, stalled: true }), // still latched — no double bill
      tick(3, { speedKmh: 0, stalled: true }),
    ]);
    const stalls = violationsOf(events, "ENGINE_STALLED");
    expect(stalls).toHaveLength(1);
    expect(stalls[0].severityClass).toBe("vtorostepenna");
    expect(stalls[0].points).toBe(1);
  });

  it("a restart re-arms: a second stall is a second второстепенна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 2, stalled: true }),
      tick(1, { speedKmh: 0, stalled: false }), // restarted
      tick(2, { speedKmh: 3, stalled: false }),
      tick(3, { speedKmh: 1, stalled: true }), // stalled again
    ]);
    expect(violationsOf(events, "ENGINE_STALLED")).toHaveLength(2);
  });

  it("C3 ruling: three stalls in a move-off practice drill are three второстепенни", () => {
    // Deliberate restart practice still bills each stall — Наредба № 38
    // counts every загасване. The trust story lives one layer up: the code
    // is второстепенна, so the A12 warn-once floor teaches the FIRST stall
    // free (coach.test.ts sweeps that for every 1-point code).
    const { events } = drive([
      tick(0, { speedKmh: 2, stalled: true }),
      tick(2, { speedKmh: 0, stalled: false }),
      tick(4, { speedKmh: 3, stalled: true }),
      tick(6, { speedKmh: 0, stalled: false }),
      tick(8, { speedKmh: 2, stalled: true }),
    ]);
    expect(violationsOf(events, "ENGINE_STALLED")).toHaveLength(3);
  });
});

describe("MOVE_OFF_WITHOUT_OBSERVATION (PK-05 — потегляне без оглеждане)", () => {
  const enabled = { moveOffObservationEnabled: true } as const;

  it("first move-off from rest with zero mirror evidence grades основна", () => {
    const { events } = drive(
      [tick(0, { speedKmh: 0 }), tick(2, { speedKmh: 0 }), tick(3, { speedKmh: 12 })],
      enabled,
    );
    const v = violationsOf(events, "MOVE_OFF_WITHOUT_OBSERVATION");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
  });

  it("only the session's FIRST move-off is graded (queue move-offs are not)", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 0 }),
        tick(1, { speedKmh: 12 }), // first move-off — graded
        tick(5, { speedKmh: 0.5 }), // red light stop
        tick(9, { speedKmh: 12 }), // queue move-off — NOT graded
      ],
      enabled,
    );
    expect(violationsOf(events, "MOVE_OFF_WITHOUT_OBSERVATION")).toHaveLength(1);
  });

  it("stays silent under the default config (shipped flagged off)", () => {
    const { events } = drive([tick(0, { speedKmh: 0 }), tick(2, { speedKmh: 12 })]);
    expect(codes(events)).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
  });
});

describe("STOP_LINE_OVERSHOOT (JU-15 — спиране след линията)", () => {
  const overLine: Partial<SimTick> = {
    speedKmh: 0.5,
    nextStopLineM: 0.8,
    nextStopLineControl: "trafficLight",
    nextStopLineState: "red",
  };

  it("halting with the nose past the line at red fires once, второстепенна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 15, nextStopLineM: 12, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(1, 10, overLine),
    ]);
    const v = violationsOf(events, "STOP_LINE_OVERSHOOT");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
  });

  it("also fires on the red+yellow combination (entry still forbidden)", () => {
    const { events } = drive([
      ...cruise(0, 3, { ...overLine, nextStopLineState: "redYellow" }),
    ]);
    expect(violationsOf(events, "STOP_LINE_OVERSHOOT")).toHaveLength(1);
  });

  it("C3: one stranding across two red cycles bills exactly once", () => {
    // Guilty arrival at red fires once; the green cycle passing over the
    // still-stranded car must not re-arm a second bill on the next red (and
    // the green presence marks it lawfully-arrived from then on).
    const { events } = drive([
      tick(0, { speedKmh: 20, nextStopLineM: 15, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(1, 6, { speedKmh: 0.5, nextStopLineM: 0.8, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(7, 12, { speedKmh: 0.5, nextStopLineM: 0.8, nextStopLineControl: "trafficLight", nextStopLineState: "green", leadGapM: 4 }),
      ...cruise(13, 20, { speedKmh: 0.5, nextStopLineM: 0.8, nextStopLineControl: "trafficLight", nextStopLineState: "red", leadGapM: 4 }),
    ]);
    expect(violationsOf(events, "STOP_LINE_OVERSHOOT")).toHaveLength(1);
  });

  it("C3 ruling: creeping past the line AT RED after a proper stop is still guilty", () => {
    // Stopping correctly and then creeping the nose over the paint while the
    // light is still red is exactly what examiners mark — the lawful-presence
    // latch only protects arrivals under green.
    const { events } = drive([
      tick(0, { speedKmh: 15, nextStopLineM: 10, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(1, 3, { speedKmh: 0.5, nextStopLineM: 2.5, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      tick(4, { speedKmh: 3, nextStopLineM: 1.5, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
      ...cruise(5, 8, { speedKmh: 0.5, nextStopLineM: 0.9, nextStopLineControl: "trafficLight", nextStopLineState: "red" }),
    ]);
    expect(violationsOf(events, "STOP_LINE_OVERSHOOT")).toHaveLength(1);
  });
});

describe("CENTER_LINE_TOUCHED (SN-03 — настъпване на осева линия)", () => {
  const riding: Partial<SimTick> = {
    speedKmh: 40,
    oneway: false,
    laneCount: 1,
    laneId: 0,
    laneOffsetM: 3.5,
  };
  /** In his own lane — the frame every real drive starts from, and the one the
   *  spawn-pose latch (doc 87 B23) needs before a DEPARTURE can be graded. */
  const inLane = (t: number, over: Partial<SimTick> = {}) =>
    tick(t, { speedKmh: 40, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0, ...over });

  it("sustained unsignalled ride on the center line fires второстепенна", () => {
    const { events } = drive([inLane(0), ...cruise(1, 5, riding)]);
    const v = violationsOf(events, "CENTER_LINE_TOUCHED");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
  });

  it("the specific code SUPPRESSES generic POOR_LANE_KEEPING (no double bill)", () => {
    const { events } = drive([inLane(0), ...cruise(1, 9, riding)]);
    expect(codes(events)).toContain("CENTER_LINE_TOUCHED");
    expect(codes(events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("the generic lane-keeping code still owns one-way / rightward drifts", () => {
    const drift: Partial<SimTick> = {
      speedKmh: 40,
      oneway: true,
      laneCount: 2,
      laneId: 1,
      laneOffsetM: 3.5,
    };
    const { events } = drive([
      inLane(0, { oneway: true, laneCount: 2, laneId: 1 }),
      ...cruise(1, 6, drift),
    ]);
    expect(codes(events)).toContain("POOR_LANE_KEEPING");
    expect(codes(events)).not.toContain("CENTER_LINE_TOUCHED");
  });

  // -- doc 87 B23/B26/B33: the four-of-four false pause -----------------------
  it("a car SPAWNED on the осева, driven dead straight, is never convicted", () => {
    // sc-junction-rhr / -scan / -blind / -stop all compile a spawn at x = 0,
    // the road centreline, 4.06 m off the lane centre the objective is authored
    // on. The founder held the taught speed for 32 s and got a graded pause for
    // driving straight. There is no act here to grade: he was placed there.
    const { events } = drive(cruise(0, 12, riding));
    expect(codes(events)).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes(events)).not.toContain("POOR_LANE_KEEPING");
  });
});

describe("HARSH_BRAKING_NO_CAUSE (SP-11 — рязко спиране без причина)", () => {
  it("an emergency-grade slam on an empty clear road grades основна", () => {
    // ~-7.8 m/s² sustained over a second, nothing anywhere near.
    const { events } = drive([
      tick(0, { speedKmh: 55 }),
      tick(0.5, { speedKmh: 41 }),
      tick(1, { speedKmh: 27 }),
      tick(1.5, { speedKmh: 13 }),
      tick(2.5, { speedKmh: 0.5 }),
    ]);
    const v = violationsOf(events, "HARSH_BRAKING_NO_CAUSE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
  });

  it("one continuous slam fires exactly once", () => {
    const frames = [tick(0, { speedKmh: 60 })];
    for (let i = 1; i <= 6; i++) frames.push(tick(i * 0.5, { speedKmh: Math.max(0.5, 60 - i * 14) }));
    const { events } = drive(frames);
    expect(violationsOf(events, "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
  });

  it("low-speed brake stabs never fire (onset below the speed floor)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25 }),
      tick(0.5, { speedKmh: 11 }),
      tick(1, { speedKmh: 0.5 }),
    ]);
    expect(codes(events)).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });
});

describe("HESITATION_AT_GREEN (JU-09 — закъснели действия)", () => {
  const waiting: Partial<SimTick> = {
    speedKmh: 0.4,
    nextStopLineM: 5,
    nextStopLineControl: "trafficLight",
    nextStopLineState: "green",
  };

  it("frozen at a clear green for over five seconds grades второстепенна", () => {
    const { events } = drive([
      ...cruise(0, 3, { ...waiting, nextStopLineState: "red" }),
      ...cruise(4, 11, waiting),
    ]);
    const v = violationsOf(events, "HESITATION_AT_GREEN");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
  });

  it("moving off re-arms — a freeze at the NEXT green fires again", () => {
    const { events } = drive([
      ...cruise(0, 7, waiting),
      tick(8, { speedKmh: 20 }),
      ...cruise(20, 27, waiting),
    ]);
    expect(violationsOf(events, "HESITATION_AT_GREEN")).toHaveLength(2);
  });

  it("C3: a stall at the green bills as the stall — not ALSO as hesitation", () => {
    // One act, one code: the ~8 s freeze is caused by the stall (already a
    // второстепенна); charging the restart seconds again as закъснели
    // действия would double-bill. After the restart the hesitation clock
    // starts fresh.
    const { events } = drive([
      ...cruise(0, 4, { ...waiting, nextStopLineState: "red" }),
      tick(5, { ...waiting, speedKmh: 0.5, stalled: true }),
      ...cruise(6, 12, { ...waiting, speedKmh: 0.4, stalled: true }),
      tick(13, { ...waiting, speedKmh: 0.4, stalled: false }),
      tick(14, { speedKmh: 6, nextStopLineM: 3, nextStopLineControl: "trafficLight", nextStopLineState: "green" }),
      tick(15, { speedKmh: 15 }),
    ]);
    expect(violationsOf(events, "ENGINE_STALLED")).toHaveLength(1);
    expect(violationsOf(events, "HESITATION_AT_GREEN")).toHaveLength(0);
  });
});

describe("YELLOW_LIGHT_NOT_STOPPED / RED_YELLOW_CROSSED (JU-06 / JU-08)", () => {
  it("crossing on yellow when a comfortable stop existed grades основна", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30 }),
      tick(1, {
        speedKmh: 30,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "yellow", stoppable: true }],
      }),
    ]);
    const v = violationsOf(events, "YELLOW_LIGHT_NOT_STOPPED");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(codes(events)).not.toContain("RED_LIGHT_CROSSED");
  });

  it("entering on red+yellow grades основна — NOT the 10-point red entry", () => {
    const { events } = drive([
      tick(0, { speedKmh: 5 }),
      tick(1, {
        speedKmh: 8,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "redYellow" }],
      }),
    ]);
    const v = violationsOf(events, "RED_YELLOW_CROSSED");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
    expect(codes(events)).not.toContain("RED_LIGHT_CROSSED");
  });

  it("crossing on red still grades the 10-point RED_LIGHT_CROSSED", () => {
    const { events } = drive([
      tick(0, {
        speedKmh: 40,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }],
      }),
    ]);
    expect(codes(events)).toContain("RED_LIGHT_CROSSED");
  });

  it("C3 ruling: a creeping-queue entry on red+yellow is still the основна", () => {
    // Following the queue across the line while the combination shows is
    // потегляне на червено и жълто — examiners mark it; teach-first softens
    // the first encounter, the code stays guilty.
    const { events } = drive([
      tick(0, { speedKmh: 4, leadGapM: 6 }),
      tick(1, {
        speedKmh: 6,
        leadGapM: 7,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "redYellow" }],
      }),
    ]);
    expect(violationsOf(events, "RED_YELLOW_CROSSED")).toHaveLength(1);
    expect(codes(events)).not.toContain("RED_LIGHT_CROSSED");
  });

  it("C3 ruling: yellow with stoppable=true stays guilty — the tailgater defence is priced into the adjudicator", () => {
    // `stoppable: true` is only ever computed from COMFORTABLE-stop physics
    // (3 m/s² + 1 s reaction + 15% margin, worldRuntime) — a stop any
    // follower could match. A dilemma-zone entry where braking would be
    // harsh computes stoppable=false and stays innocent (see the FP battery).
    const { events } = drive([
      tick(0, { speedKmh: 30 }),
      tick(1, {
        speedKmh: 30,
        events: [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "yellow", stoppable: true }],
      }),
    ]);
    expect(violationsOf(events, "YELLOW_LIGHT_NOT_STOPPED")).toHaveLength(1);
  });
});
