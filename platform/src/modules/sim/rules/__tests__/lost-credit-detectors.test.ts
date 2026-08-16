/**
 * LOST CREDIT — correct driving the detectors billed as a fault (2026-08-16
 * sweep). Three codes, each fired on a student doing what the product itself
 * teaches; each block drives the taught behaviour and is paired with the
 * counter-proof that the offence it grades still grades.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick, type SimTickEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

// ---------------------------------------------------------------------------
// ③ HESITATION_AT_GREEN — billing the чл. 50 duty not to block a junction
// ---------------------------------------------------------------------------

describe("hesitation at green is not charged for refusing a blocked junction", () => {
  /** At the line, green, engine running — the JU-09 pose. */
  const atGreen = (over: Partial<SimTick> = {}): Partial<SimTick> => ({
    speedKmh: 0.4,
    nextStopLineM: 6,
    nextStopLineControl: "trafficLight" as const,
    nextStopLineState: "green" as const,
    ...over,
  });

  it("the exit queue 56 m out: waiting is the lesson, not the fault", () => {
    // The shipped correct demonstration of `sc-jx-blocked-exit`, whose entire
    // subject is not entering a junction you cannot clear. Re-graded with
    // DEFAULT_RULE_CONFIG it collected violation:HESITATION_AT_GREEN@t=17.5 —
    // he stops at the line at t=12.5 with the light green and the queue tail
    // 56.4 m beyond the mouth, and is convicted 5.0 s later. The drill survives
    // only on a per-template `hesitationClearGapM: 63`; no other scenario and
    // no exam spec carries one.
    const { events } = drive(cruise(0, 20, atGreen({ leadGapM: 56.4 })));
    expect(codes(events)).not.toContain("HESITATION_AT_GREEN");
  });

  it("COUNTER-PROOF: a freeze on an EMPTY road is still закъснели действия", () => {
    const { events } = drive(cruise(0, 20, atGreen()));
    expect(codes(events)).toContain("HESITATION_AT_GREEN");
  });

  it("COUNTER-PROOF: traffic ahead that is MOVING AWAY does not excuse the freeze", () => {
    // The discriminator, and the reason the wider gate is safe: a lead opening
    // the gap will clear the box, so sitting behind it is the hesitation the
    // code exists for. 1 m/s of opening — twice `followRecoveryRateMps`.
    const frames: SimTick[] = [];
    for (let t = 0; t <= 20; t += 1) {
      frames.push(tick(t, atGreen({ leadGapM: 30 + t })));
    }
    expect(codes(drive(frames).events)).toContain("HESITATION_AT_GREEN");
  });

  it("COUNTER-PROOF: traffic beyond the queue window does not excuse it either", () => {
    const { events } = drive(cruise(0, 20, atGreen({ leadGapM: 95 })));
    expect(codes(events)).toContain("HESITATION_AT_GREEN");
  });
});

// ---------------------------------------------------------------------------
// ⑤ LANE_CHANGE_WITHOUT_MIRROR_CHECK — the wait the taught order contains
// ---------------------------------------------------------------------------

describe("the lane-change mirror survives the wait the lesson orders", () => {
  const glanceLeft: SimTickEvent = { kind: "mirrorGlance", mirror: "left" };

  /**
   * огледало → мигач → ИЗЧАКАЙ ПРОЛУКА → маневра, from a standstill: he checks
   * the mirror at t=2, signals at t=3, holds at the tail of a stopped queue for
   * the gap, and pulls out at t=26. 24 s from the glance to the wheels crossing,
   * 23 of them at a standstill.
   */
  function mirrorSignalWaitMove(waitUntil: number): SimTick[] {
    const frames: SimTick[] = [];
    for (let t = 0; t <= waitUntil; t += 1) {
      frames.push(
        tick(t, {
          speedKmh: 0,
          laneId: 0,
          indicator: t >= 3 ? "left" : "off",
          events: t === 2 ? [glanceLeft] : [],
        }),
      );
    }
    frames.push(tick(waitUntil + 1, { speedKmh: 12, laneId: 0, indicator: "left" }));
    frames.push(tick(waitUntil + 2, { speedKmh: 14, laneId: 1, indicator: "left" }));
    return frames;
  }

  it("a 23 s wait at a standstill does not stale the glance he made", () => {
    // OLD: LANE_CHANGE_WITHOUT_MIRROR_CHECK. `mirrorLookbackSec` is a wall
    // clock and the drilled sequence has an unbounded beat in the middle of it,
    // so the student who looked, signalled and then waited — the three things
    // the lesson asked for — was billed for the pull-away.
    expect(codes(drive(mirrorSignalWaitMove(25)).events)).toEqual(["SAFE_LANE_CHANGE"]);
  });

  it("COUNTER-PROOF: the freeze is capped — a glance from a minute ago is stale", () => {
    // 60 s of standing time, of which only `mirrorWaitFreezeMaxSec` is
    // forgiven: a blind spot behind a stationary car does fill in.
    expect(codes(drive(mirrorSignalWaitMove(60)).events)).toContain(
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
    );
  });

  it("COUNTER-PROOF: standing still is not a glance — the no-mirror demo still grades", () => {
    const frames: SimTick[] = [];
    for (let t = 0; t <= 25; t += 1) {
      frames.push(tick(t, { speedKmh: 0, laneId: 0, indicator: t >= 3 ? "left" : "off" }));
    }
    frames.push(tick(26, { speedKmh: 12, laneId: 0, indicator: "left" }));
    frames.push(tick(27, { speedKmh: 14, laneId: 1, indicator: "left" }));
    expect(codes(drive(frames).events)).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });

  it("COUNTER-PROOF: MOVING time still ages a glance exactly as it did", () => {
    // The freeze buys nothing at speed — 12 s of driving between the glance and
    // the crossing is a stale observation and stays one.
    const frames: SimTick[] = [];
    for (let t = 0; t <= 12; t += 1) {
      frames.push(
        tick(t, {
          speedKmh: 30,
          laneId: 0,
          indicator: t >= 3 ? "left" : "off",
          events: t === 0 ? [glanceLeft] : [],
        }),
      );
    }
    frames.push(tick(13, { speedKmh: 30, laneId: 1, indicator: "left" }));
    expect(codes(drive(frames).events)).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });

  it("the ceiling is stated in seconds, not left to the reader", () => {
    expect(DEFAULT_RULE_CONFIG.mirrorWaitFreezeMaxSec).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// ⑦ CENTER_LINE_TOUCHED — the stalk the CAR put out mid-manoeuvre
// ---------------------------------------------------------------------------

describe("center-line touch reads the declaration, not the lamp", () => {
  const riding = (t: number, indicator: SimTick["indicator"]): SimTick =>
    tick(t, { speedKmh: 15, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 3.5, indicator });
  const inLane = (t: number): SimTick =>
    tick(t, { speedKmh: 15, oneway: false, laneCount: 1, laneId: 0, laneOffsetM: 0 });

  /**
   * Squeezing past a parked obstacle: he declares, swings out — and the wheel
   * passes CabinControls' AUTOCANCEL_ARM_RAD (0.22), which puts his own
   * indicator out at t=3 while he is still alongside the obstacle, on the line.
   */
  function declaredDodge(untilSec: number): SimTick[] {
    const frames = [inLane(0), riding(1, "left"), riding(2, "left")];
    for (let t = 3; t <= untilSec; t += 1) frames.push(riding(t, "off"));
    return frames;
  }

  it("a signalled dodge is not billed because the car cancelled the stalk", () => {
    // OLD: CENTER_LINE_TOUCHED at t=7 — `centerLineSustainSec` (3.5 s) started
    // counting the instant the lamp went out, on a driver who had declared the
    // manoeuvre two seconds earlier and was still performing it.
    expect(codes(drive(declaredDodge(8)).events)).not.toContain("CENTER_LINE_TOUCHED");
  });

  it("COUNTER-PROOF: the memory is a 5 s tail, not an amnesty", () => {
    // Keep riding the осева long after the declaration has expired and the code
    // arms and bills exactly as shipped.
    expect(codes(drive(declaredDodge(14)).events)).toContain("CENTER_LINE_TOUCHED");
  });

  it("COUNTER-PROOF: an undeclared ride on the осева grades from the first second", () => {
    const frames = [inLane(0)];
    for (let t = 1; t <= 6; t += 1) frames.push(riding(t, "off"));
    expect(codes(drive(frames).events)).toContain("CENTER_LINE_TOUCHED");
  });
});
