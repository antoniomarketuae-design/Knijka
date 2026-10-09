/**
 * THE FLOOR LIFTS FOR A FOLLOWER IT PUT AT RISK — the rule engine's half of
 * `sc-follow-tailgater:63c0c28c` C1/C2a (2026-10-09).
 *
 * `harshBrakeMinSpeedKmh` (35) acquits a causeless emergency stop from lower
 * speed. It still does, EXCEPT for the one brake a close follower reports, on
 * its own account, that it had to brake hard for (`followerBraked` — published
 * only by the staged runner of a car glued behind him: runners.ts
 * `RearTailgaterRunner.stepFollowerAccount`). The founder's principle, ruled
 * 2026-09-30 and 2026-10-05: a conviction about another car rests on what that
 * car actually had to do. Every other gate of the detector is untouched — the
 * cause ledger, the mean and the accrual — so this file drives the reducer at
 * 60 Hz over a 9.5 m/s² stop from 33 км/ч and asks each half separately.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick, type SimTickEvent } from "../types";
import { drive, tick } from "./fixtures";

const HZ = 60;
const DT = 1 / HZ;

/** The follower's report as the runner publishes it (a 9.8 m/s² mean held 0.4 s from 9 m/s). */
function report(
  over: Partial<Extract<SimTickEvent, { kind: "followerBraked" }>> = {},
): SimTickEvent {
  return {
    kind: "followerBraked",
    vehicleId: 1001,
    decelMps2: 9.8,
    heldSec: 0.4,
    qualifiedSec: 0.4,
    shedMps: 3.92,
    speedMps: 9,
    gapM: 4.6,
    ...over,
  };
}

interface Stop {
  /** Speed before the pedal, км/ч. */
  fromKmh: number;
  /** Deceleration of the stop, m/s². */
  decel?: number;
  /** Reports pushed into the tick at these times, s after the pedal. */
  reports?: Array<{
    at: number;
    e?: Partial<Extract<SimTickEvent, { kind: "followerBraked" }>>;
  }>;
  /** Tick fields for the whole drive (a cause ahead). */
  over?: Partial<SimTick>;
  /** Pedal released at this speed, км/ч (default: to rest). */
  releaseAtKmh?: number;
  tailSec?: number;
}
const ONSET = 1;

/** Cruise 1 s, the stop from ONSET, then `tailSec` held. Returns the HARSH bills' times, relative to the pedal. */
function bills(s: Stop): number[] {
  const ticks: SimTick[] = [];
  let v = s.fromKmh / 3.6;
  const decel = s.decel ?? 9.5;
  const release = (s.releaseAtKmh ?? 0) / 3.6;
  let braking = true;
  const end = ONSET + 2 + (s.tailSec ?? 3);
  const pending = [...(s.reports ?? [])];
  for (let k = 0; k * DT <= end + 1e-9; k++) {
    const t = k * DT;
    if (t > ONSET + 1e-9 && braking) {
      v = Math.max(0, v - decel * DT);
      if (v <= release + 1e-9) braking = false;
    }
    const events: SimTickEvent[] = [];
    while (pending.length > 0 && t >= ONSET + pending[0]!.at - 1e-9)
      events.push(report(pending.shift()!.e));
    ticks.push(
      tick(t, {
        speedKmh: v * 3.6,
        maxSpeedKmh: 50,
        gear: 3,
        events,
        ...s.over,
      }),
    );
  }
  const { events } = drive(ticks);
  return events
    .filter((e) => e.code === "HARSH_BRAKING_NO_CAUSE")
    .map((e) => Math.round((e.t - ONSET) * 1000) / 1000);
}

describe("HARSH_BRAKING_NO_CAUSE under the 35 км/ч floor — billed only on a close follower's own account", () => {
  it("the floor stands without a report: a 9.5 m/s² stop from 33 км/ч is not billed", () => {
    expect(DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh).toBe(35);
    expect(bills({ fromKmh: 33 })).toEqual([]);
  });

  it("with the follower's hard brake reported 0.42 s into his, it is billed once, on that frame", () => {
    expect(bills({ fromKmh: 33, reports: [{ at: 0.42 }] })).toEqual([0.433]);
  });

  it("…and once only, whatever the follower reports again in the same pedal application", () => {
    expect(
      bills({ fromKmh: 33, reports: [{ at: 0.42 }, { at: 0.7 }, { at: 0.9 }] }),
    ).toEqual([0.433]);
  });

  it("a report that is not HARSH by this config (mean 6.5 m/s², or held under the sustain) bills nothing", () => {
    expect(
      bills({ fromKmh: 33, reports: [{ at: 0.42, e: { decelMps2: 6.5 } }] }),
    ).toEqual([]);
    expect(
      bills({ fromKmh: 33, reports: [{ at: 0.42, e: { decelMps2: 7 } }] }),
    ).toEqual([]);
    expect(
      bills({
        fromKmh: 33,
        reports: [{ at: 0.42, e: { heldSec: 0.3, qualifiedSec: 0.3 } }],
      }),
    ).toEqual([]);
  });

  it("the student's own brake must still be emergency-grade: a firm 5 m/s² stop is not billed whatever the follower did", () => {
    expect(bills({ fromKmh: 33, decel: 5, reports: [{ at: 0.42 }] })).toEqual(
      [],
    );
    expect(bills({ fromKmh: 33, decel: 7, reports: [{ at: 0.42 }] })).toEqual(
      [],
    );
  });

  it("a follower that braked hard BEFORE his pedal went down was not answering his brake", () => {
    expect(bills({ fromKmh: 33, reports: [{ at: -0.3 }] })).toEqual([]);
  });

  it("the window is the follower's own hard stop after his last emergency-grade frame (speedMps / 7 m/s²): inside it a late report bills, past it nothing", () => {
    // 33 км/ч at 9.5 m/s² is at rest 0.965 s after the pedal; the follower's 9 m/s is a 1.286 s stop.
    expect(bills({ fromKmh: 33, reports: [{ at: 1.9 }] })).toHaveLength(1);
    expect(bills({ fromKmh: 33, reports: [{ at: 2.4 }] })).toEqual([]);
    // …and a slower follower answers for less.
    expect(
      bills({ fromKmh: 33, reports: [{ at: 1.9, e: { speedMps: 3 } }] }),
    ).toEqual([]);
  });

  it("a stab released early is still his brake: the report after the release, inside the window, bills it", () => {
    expect(
      bills({ fromKmh: 33, releaseAtKmh: 12, reports: [{ at: 0.7 }] }),
    ).toHaveLength(1);
  });

  it("a CAUSE ahead acquits the whole brake, follower or not — a lead inside 45 m, a stop line inside 60 m, a junction inside 35 m", () => {
    expect(
      bills({ fromKmh: 33, reports: [{ at: 0.42 }], over: { leadGapM: 20 } }),
    ).toEqual([]);
    expect(
      bills({
        fromKmh: 33,
        reports: [{ at: 0.42 }],
        over: { nextStopLineM: 30 },
      }),
    ).toEqual([]);
    expect(
      bills({
        fromKmh: 33,
        reports: [{ at: 0.42 }],
        over: { nextJunctionM: 20 },
      }),
    ).toEqual([]);
  });

  it("a cause that APPEARS mid-brake still acquits the whole application (the sticky-cause ledger, C3) — even after the floor had recorded it", () => {
    // The gates hold from ~0.4 s; a lead appears 18 m ahead at 0.5 s; the follower reports at 0.6 s.
    const ticks: SimTick[] = [];
    let v = 33 / 3.6;
    for (let k = 0; k * DT <= 5; k++) {
      const t = k * DT;
      if (t > ONSET + 1e-9) v = Math.max(0, v - 9.5 * DT);
      const events: SimTickEvent[] =
        Math.abs(t - (ONSET + 0.6)) < DT / 2 ? [report()] : [];
      const lead = t >= ONSET + 0.5 && t < ONSET + 0.55 ? { leadGapM: 18 } : {};
      ticks.push(
        tick(t, {
          speedKmh: v * 3.6,
          maxSpeedKmh: 50,
          gear: 3,
          events,
          ...lead,
        }),
      );
    }
    const { events } = drive(ticks);
    expect(events.filter((e) => e.code === "HARSH_BRAKING_NO_CAUSE")).toEqual(
      [],
    );
  });

  it("the rest of the billed stop is not clean driving: no praise is minted between the bill and the rest (the episode reads as billed, as over the floor)", () => {
    // A 1 m praise streak so the stop's own metres would mint one if they counted.
    const ticks: SimTick[] = [];
    let v = 33 / 3.6;
    for (let k = 0; k * DT <= ONSET + 1.2; k++) {
      const t = k * DT;
      if (t > ONSET + 1e-9) v = Math.max(0, v - 9.5 * DT);
      const events: SimTickEvent[] =
        Math.abs(t - (ONSET + 0.42)) < DT / 2 ? [report()] : [];
      ticks.push(
        tick(t, { speedKmh: v * 3.6, maxSpeedKmh: 50, gear: 3, events }),
      );
    }
    const { events } = drive(ticks, { cleanDrivingDistanceM: 1 });
    const bill = events.find((e) => e.code === "HARSH_BRAKING_NO_CAUSE")!;
    expect(bill).toBeDefined();
    expect(
      events.filter((e) => e.code === "CLEAN_DRIVING" && e.t > bill.t),
    ).toEqual([]);
  });

  it("over the floor nothing changes: one bill at the gates, with or without a report", () => {
    const plain = bills({ fromKmh: 46 });
    expect(plain).toHaveLength(1);
    expect(bills({ fromKmh: 46, reports: [{ at: 0.42 }] })).toEqual(plain);
  });

  it("ONE report bills ONE pedal application: a new pedal inside the follower's window, after the bill, is not billed again on the same report (round 2 — the new-pedal reset)", () => {
    // Pedal 1: the 9.5 m/s² stop from 33 км/ч, released at 12 км/ч (~0.62 s), billed on the report at 0.42 s.
    // Coast 0.15 s, then pedal 2 — a 3 m/s² slow-down (over the 2 m/s² braking line, under the harsh one) —
    // still inside the follower's 1.29 s answer window. Nothing new happened to the follower: no second bill.
    const ticks: SimTick[] = [];
    let v = 33 / 3.6;
    let phase: "cruise" | "p1" | "coast" | "p2" = "cruise";
    let coastUntil = 0;
    for (let k = 0; k * DT <= ONSET + 4; k++) {
      const t = k * DT;
      if (phase === "cruise" && t > ONSET + 1e-9) phase = "p1";
      if (phase === "p1") {
        v = Math.max(0, v - 9.5 * DT);
        if (v <= 12 / 3.6) {
          phase = "coast";
          coastUntil = t + 0.15;
        }
      } else if (phase === "coast" && t >= coastUntil) phase = "p2";
      else if (phase === "p2") v = Math.max(0, v - 3 * DT);
      const events: SimTickEvent[] =
        Math.abs(t - (ONSET + 0.42)) < DT / 2 ? [report()] : [];
      ticks.push(tick(t, { speedKmh: v * 3.6, maxSpeedKmh: 50, gear: 3, events }));
    }
    const { events } = drive(ticks);
    const harsh = events.filter((e) => e.code === "HARSH_BRAKING_NO_CAUSE");
    expect(harsh).toHaveLength(1);
    expect(harsh[0]!.t - ONSET).toBeLessThan(0.62);
  });

  it("a second, separate brake check under the floor is a new act: each is billed on its own report", () => {
    const ticks: SimTick[] = [];
    let v = 33 / 3.6;
    const stops = [1, 5];
    for (let k = 0; k * DT <= 9; k++) {
      const t = k * DT;
      const inStop = stops.some((s0) => t > s0 + 1e-9 && t < s0 + 1.2);
      if (inStop) v = Math.max(0, v - 9.5 * DT);
      else if (t > 2.5 && t < 5) v = Math.min(33 / 3.6, v + 3 * DT);
      const events: SimTickEvent[] = [];
      for (const s0 of stops)
        if (Math.abs(t - (s0 + 0.42)) < DT / 2) events.push(report());
      ticks.push(
        tick(t, { speedKmh: v * 3.6, maxSpeedKmh: 50, gear: 3, events }),
      );
    }
    const { events } = drive(ticks);
    expect(
      events.filter((e) => e.code === "HARSH_BRAKING_NO_CAUSE"),
    ).toHaveLength(2);
  });
});
