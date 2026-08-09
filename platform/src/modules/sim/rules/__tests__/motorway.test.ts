import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

/**
 * MOTORWAY-SEGMENT detectors (doc 72 SP-10 + the чл. 58, т. 4 emergency-lane
 * ban). Both are armed EXCLUSIVELY by authored district data:
 *  - DRIVING_TOO_SLOW_FOR_MOTORWAY ← tick.motorway (edge `motorway: true`);
 *    defaults: floor 50 km/h · steady band 0.5 m/s² · queue gap 60 m ·
 *    sustain 4 s · config-gated (motorwayMinSpeedEnabled, default ON —
 *    structurally safe: no shipped map is a motorway).
 *  - EMERGENCY_LANE_DRIVING ← tick.emergencyLaneRight (authored emergencyLane
 *    span) + laneId 0; defaults: sustain 3 s · brake exemption 1 m/s² · NO
 *    indicator exemption (contrast DRIVING_IN_BUS_LANE).
 */

/** A motorway frame: 140 limit, 3-lane bank, curb lane = emergency. */
const mw = (t: number, over: Parameters<typeof tick>[1] = {}) =>
  tick(t, {
    maxSpeedKmh: 140,
    motorway: true,
    emergencyLaneRight: true,
    laneId: 1,
    laneCount: 3,
    ...over,
  });

describe("motorway crawl detector (DRIVING_TOO_SLOW_FOR_MOTORWAY)", () => {
  it("fires on a sustained causeless steady crawl under the 50 km/h floor", () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) => mw(t, { speedKmh: 40 }));
    expect(codes(drive(ticks).events)).toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("fires ONCE per crawl episode, however long it lasts", () => {
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 30; t += 1) ticks.push(mw(t, { speedKmh: 42 }));
    const all = codes(drive(ticks).events).filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(all).toHaveLength(1);
  });

  it("a second, distinct crawl AFTER a genuine recovery bills again (two acts)", () => {
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 6; t += 1) ticks.push(mw(t, { speedKmh: 40 })); // act 1
    for (let t = 7; t <= 12; t += 1) ticks.push(mw(t, { speedKmh: 110 })); // recovered
    for (let t = 13; t <= 20; t += 1) ticks.push(mw(t, { speedKmh: 44 })); // act 2
    const all = codes(drive(ticks).events).filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY");
    // NOTE the transition frames carry |a| >= the steady band, so the clocks
    // only run on the held plateaus — exactly two acts.
    expect(all).toHaveLength(2);
  });

  it("never fires off a motorway — the field is authored data (structural default-ON safety)", () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) =>
      tick(t, { speedKmh: 30, maxSpeedKmh: 90 }),
    );
    expect(codes(drive(ticks).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("accelerating up THROUGH the sub-50 band after a move-off is innocent (transition, not a crawl)", () => {
    // 0 → 60 km/h at ~2.2 m/s² (≈ 8 km/h per second): |a| >> the steady band.
    const ticks = [0, 8, 16, 24, 32, 40, 48, 56, 60, 60].map((kmh, i) => mw(i, { speedKmh: kmh }));
    expect(codes(drive(ticks).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("braking down THROUGH the band toward a stop is innocent (the end-of-drive case)", () => {
    const ticks = [120, 100, 80, 60, 40, 20, 5, 0, 0].map((kmh, i) => mw(i, { speedKmh: kmh }));
    expect(codes(drive(ticks).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("a queue crawl behind a lead is innocent (congestion is a cause)", () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => mw(t, { speedKmh: 30, leadGapM: 18 }));
    expect(codes(drive(ticks).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("the standstill and reverse maneuvering are exempt (stopping is a different story, descoped)", () => {
    const resting = [0, 1, 2, 3, 4, 5, 6].map((t) => mw(t, { speedKmh: 0 }));
    expect(codes(drive(resting).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    const reversing = [0, 1, 2, 3, 4, 5, 6].map((t) => mw(t, { speedKmh: 10, gear: -1 }));
    expect(codes(drive(reversing).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("a crawl ALONG the emergency lane is the emergency-lane act, not this one (one act, one code)", () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => mw(t, { speedKmh: 30, laneId: 0 }));
    const seen = codes(drive(ticks).events);
    expect(seen).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(seen).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("the config gate silences it entirely (motorwayMinSpeedEnabled: false)", () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) => mw(t, { speedKmh: 40 }));
    const { events } = drive(ticks, { motorwayMinSpeedEnabled: false });
    expect(codes(events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("grades второстепенна (1 т.) on the verified чл. 22, ал. 1 basis with the motorway concept", () => {
    // LAW NOTE (see catalog.ts): the slice brief's „чл. 21 минимална 50" did
    // NOT verify — the content bank teaches NO general motorway minimum
    // exists; чл. 55, ал. 1's constructive > 70 km/h line is a condition on the
    // VEHICLE and the 50 km/h detection floor is authored, not statutory, and
    // the soft second-degree tier is the FP-biased severity.
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) => mw(t, { speedKmh: 40 }));
    const ev = drive(ticks).events.find(
      (e) => e.kind === "violation" && e.code === "DRIVING_TOO_SLOW_FOR_MOTORWAY",
    );
    expect(ev).toBeDefined();
    if (ev && ev.kind === "violation") {
      expect(ev.severityClass).toBe("vtorostepenna");
      expect(ev.points).toBe(1);
      // 2026-08-03: was pinned to „ЗДвП чл. 54" — the rail-crossing article.
      // The graded duty is чл. 22, ал. 1 („без основателна причина… пречи");
      // чл. 55, ал. 1 is the >70 km/h condition on the VEHICLE.
      expect(ev.lawRef).toBe("ЗДвП чл. 22, ал. 1; чл. 55, ал. 1");
      expect(ev.conceptId).toBe("c-motorway-rules");
      expect(ev.titleBg).toMatch(/[Ѐ-ӿ]/);
    }
  });
});

describe("emergency-lane detector (EMERGENCY_LANE_DRIVING)", () => {
  it("fires on sustained driving in the curb lane of an authored span", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => mw(t, { speedKmh: 100, laneId: 0 }));
    expect(codes(drive(ticks).events)).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("fires ONCE per excursion; a second excursion bills again", () => {
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 8; t += 1) ticks.push(mw(t, { speedKmh: 100, laneId: 0 })); // excursion 1
    for (let t = 9; t <= 12; t += 1) ticks.push(mw(t, { speedKmh: 100, laneId: 1 })); // back out
    for (let t = 13; t <= 18; t += 1) ticks.push(mw(t, { speedKmh: 100, laneId: 0 })); // excursion 2
    const all = codes(drive(ticks).events).filter((c) => c === "EMERGENCY_LANE_DRIVING");
    expect(all).toHaveLength(2);
  });

  it("a brief clip of the lane (under the 3 s sustain) never bills", () => {
    const ticks = [
      mw(0, { speedKmh: 100, laneId: 1 }),
      mw(1, { speedKmh: 100, laneId: 0 }),
      mw(2.5, { speedKmh: 100, laneId: 0 }),
      mw(3.5, { speedKmh: 100, laneId: 1 }),
      mw(5, { speedKmh: 100, laneId: 1 }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("a RIGHT indicator does NOT exempt — a signalled undertake is still the fault (contrast the bus lane)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      mw(t, { speedKmh: 100, laneId: 0, indicator: "right" }),
    );
    expect(codes(drive(ticks).events)).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("the breakdown pull-off is innocent: firm braking toward a stop pauses the clock, the stop disarms it", () => {
    // Enter the lane at 90 already braking (~3 m/s² ≈ −11 km/h per second),
    // come to rest — the legal чл. 58 use; the STOP itself is descoped.
    const ticks = [
      mw(0, { speedKmh: 90, laneId: 1 }),
      mw(1, { speedKmh: 79, laneId: 0 }),
      mw(2, { speedKmh: 68, laneId: 0 }),
      mw(3, { speedKmh: 57, laneId: 0 }),
      mw(4, { speedKmh: 46, laneId: 0 }),
      mw(5, { speedKmh: 35, laneId: 0 }),
      mw(6, { speedKmh: 24, laneId: 0 }),
      mw(7, { speedKmh: 13, laneId: 0 }),
      mw(8, { speedKmh: 2, laneId: 0 }),
      mw(9, { speedKmh: 0, laneId: 0 }),
      mw(12, { speedKmh: 0, laneId: 0 }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("never fires without the authored span (laneId 0 on an ordinary road is just the right lane)", () => {
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      tick(t, { speedKmh: 50, laneId: 0, laneCount: 2 }),
    );
    expect(codes(drive(ticks).events)).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("a degenerate single-lane span never convicts (nothing to teach)", () => {
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      mw(t, { speedKmh: 100, laneId: 0, laneCount: 1 }),
    );
    expect(codes(drive(ticks).events)).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("an emergencyLane span OFF a motorway never convicts — чл. 58 opens „при движение по автомагистрала“", () => {
    // Added 2026-08-09 with the Наредба № 38 re-grounding (rules/n38.ts). The
    // 10 rests on the lane's legal purpose, and that purpose is a MOTORWAY
    // fact; the cited article is expressly conditioned on motorway travel. The
    // detector used to arm on the authored span alone, so a span authored on
    // an urban street would have billed 10 points citing an article that does
    // not reach it. All three shipped spans (mw-v1, mw-entry-v1, mw-exit-v1)
    // sit on `motorway: true` edges, so nothing shipped moves — this pins the
    // charge to the road its citation names.
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      tick(t, {
        maxSpeedKmh: 50,
        emergencyLaneRight: true,
        laneId: 0,
        laneCount: 3,
        speedKmh: 45,
      }),
    );
    expect(codes(drive(ticks).events)).not.toContain("EMERGENCY_LANE_DRIVING");
  });

  it("…and the SAME frames WITH the motorway tag do convict — the gate is the tag, not the fixture", () => {
    const ticks = [0, 1, 2, 3, 4, 5].map((t) =>
      tick(t, {
        maxSpeedKmh: 50,
        motorway: true,
        emergencyLaneRight: true,
        laneId: 0,
        laneCount: 3,
        speedKmh: 45,
      }),
    );
    expect(codes(drive(ticks).events)).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("grades опасна (10 т.) on the verified чл. 58, т. 4 basis with the prohibitions concept", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => mw(t, { speedKmh: 100, laneId: 0 }));
    const ev = drive(ticks).events.find(
      (e) => e.kind === "violation" && e.code === "EMERGENCY_LANE_DRIVING",
    );
    expect(ev).toBeDefined();
    if (ev && ev.kind === "violation") {
      expect(ev.severityClass).toBe("opasna");
      expect(ev.points).toBe(10);
      // 2026-08-03: т. 3 is the STOPPING permission; DRIVING along the lane is т. 4.
      expect(ev.lawRef).toBe("ЗДвП чл. 58, т. 4");
      expect(ev.conceptId).toBe("c-motorway-prohibitions");
      expect(ev.titleBg).toMatch(/[Ѐ-ӿ]/);
    }
  });
});

describe("keep-right on the motorway bank (the emergencyLaneRight seam)", () => {
  it("cruising the rightmost TRAVEL lane (laneId 1) never grades NOT_KEEPING_RIGHT", () => {
    const ticks = Array.from({ length: 20 }, (_, t) => mw(t, { speedKmh: 125, laneId: 1 }));
    expect(codes(drive(ticks).events)).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("hogging the LEFT lane (laneId 2) at speed still fires after the 12 s sustain", () => {
    const ticks = Array.from({ length: 18 }, (_, t) => mw(t, { speedKmh: 130, laneId: 2 }));
    expect(codes(drive(ticks).events)).toContain("NOT_KEEPING_RIGHT");
  });

  it("a declared overtake (left indicator) stays exempt on the motorway too", () => {
    const ticks = Array.from({ length: 18 }, (_, t) =>
      mw(t, { speedKmh: 130, laneId: 2, indicator: "left" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("NOT_KEEPING_RIGHT");
  });
});
