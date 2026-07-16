import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

/**
 * SPEED_TOO_FAST_FOR_CURVE — the curve-envelope detector (doc 72 SP-05,
 * ЗДвП чл. 20 ал. 2). Armed EXCLUSIVELY by tick.curveAdvisoryKmh (authored
 * curveAdvisory district spans — data, never a heuristic).
 * Defaults: grace +5 km/h over the advisory · sustain 1.5 s.
 */

/** In-span frame on the rural-curve stage: advisory 50 on a 90 road. */
const inCurve = (t: number, speedKmh: number, over: Parameters<typeof tick>[1] = {}) =>
  tick(t, { speedKmh, maxSpeedKmh: 90, curveAdvisoryKmh: 50, ...over });

describe("curve-advisory overspeed detector", () => {
  it("fires when the advisory is exceeded beyond the grace, sustained through the span", () => {
    const ticks = [0, 0.5, 1, 1.5, 2, 2.5].map((t) => inCurve(t, 70));
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CURVE");
  });

  it("fires ONCE per sustained episode, no matter how long the curve is", () => {
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 12; t += 0.5) ticks.push(inCurve(t, 70));
    const all = codes(drive(ticks).events).filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE");
    expect(all).toHaveLength(1);
  });

  it("a second, distinct overspeed AFTER a genuine correction bills again (two acts)", () => {
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 3; t += 0.5) ticks.push(inCurve(t, 70)); // act 1
    for (let t = 3.5; t <= 6; t += 0.5) ticks.push(inCurve(t, 48)); // corrected (≤ advisory)
    for (let t = 6.5; t <= 10; t += 0.5) ticks.push(inCurve(t, 68)); // act 2
    const all = codes(drive(ticks).events).filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE");
    expect(all).toHaveLength(2);
  });

  it("does not fire at the advisory or inside the +5 grace band", () => {
    const at = [0, 1, 2, 3, 4].map((t) => inCurve(t, 50));
    expect(codes(drive(at).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
    const graced = [0, 1, 2, 3, 4].map((t) => inCurve(t, 54.5));
    expect(codes(drive(graced).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
  });

  it("does not fire on a brief entry overshoot corrected within the sustain (A12)", () => {
    const ticks = [
      inCurve(0, 62),
      inCurve(0.5, 60),
      inCurve(1, 56),
      inCurve(1.4, 49), // back at the advisory before 1.5 s
      inCurve(2, 48),
      inCurve(3, 48),
    ];
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
  });

  it("the approach BEFORE the span is unrestricted — only the posted limit governs", () => {
    // 85 on a 90 road, NO advisory on the tick (outside the span): innocent.
    const ticks = [0, 1, 2, 3, 4, 5].map((t) => tick(t, { speedKmh: 85, maxSpeedKmh: 90 }));
    expect(codes(drive(ticks).events)).toEqual([]);
  });

  it("leaving the span mid-episode never bills (the condition needs the span)", () => {
    const ticks = [
      inCurve(0, 70),
      inCurve(0.5, 70),
      inCurve(1, 70),
      // Span exited before the 1.5 s sustain elapsed:
      tick(1.4, { speedKmh: 70, maxSpeedKmh: 90 }),
      tick(2, { speedKmh: 70, maxSpeedKmh: 90 }),
      tick(3, { speedKmh: 70, maxSpeedKmh: 90 }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
  });

  it("reverse maneuvering and standstill inside the span are exempt", () => {
    const reversing = [0, 1, 2, 3, 4].map((t) => inCurve(t, 12, { gear: -1 }));
    expect(codes(drive(reversing).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
    const resting = [0, 1, 2, 3, 4].map((t) => inCurve(t, 0));
    expect(codes(drive(resting).events)).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
  });

  it("is NOT capped at the graced limit: a within-grace 95 into the bend still bills the curve code", () => {
    // 95 on a 90 road sits inside the 10% speeding grace (< 99): the SPEEDING_*
    // codes stay silent — the curve envelope must still convict (the design
    // decision documented in engine.ts; contrast SPEED_TOO_FAST_FOR_CONDITIONS).
    const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => inCurve(t, 95));
    const seen = codes(drive(ticks).events);
    expect(seen).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(seen).not.toContain("SPEEDING_OVER_LIMIT");
    expect(seen).not.toContain("SPEEDING_DANGEROUS");
  });

  it("far above the limit BOTH distinct faults bill (curve envelope + dangerous speeding)", () => {
    const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => inCurve(t, 105));
    const seen = codes(drive(ticks).events);
    expect(seen).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(seen).toContain("SPEEDING_DANGEROUS");
  });

  it("grades основна (3 т.) with the чл. 20 ал. 2 basis and the speed-adaptation concept", () => {
    const ticks = [0, 0.5, 1, 1.5, 2, 2.5].map((t) => inCurve(t, 70));
    const ev = drive(ticks).events.find(
      (e) => e.kind === "violation" && e.code === "SPEED_TOO_FAST_FOR_CURVE",
    );
    expect(ev).toBeDefined();
    if (ev && ev.kind === "violation") {
      expect(ev.severityClass).toBe("osnovna");
      expect(ev.points).toBe(3);
      expect(ev.lawRef).toBe("ЗДвП чл. 20, ал. 2");
      expect(ev.conceptId).toBe("c-speed-adaptation");
      expect(ev.titleBg).toMatch(/[Ѐ-ӿ]/);
    }
  });
});
