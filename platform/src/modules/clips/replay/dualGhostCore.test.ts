import { describe, expect, it } from "vitest";
import {
  DIVERGENCE_NOTABLE_GAP_M,
  DIVERGENCE_SAMPLE_HZ,
  divergenceSeries,
  firstDivergenceSec,
  pairedDurationSec,
} from "./dualGhostCore";
import { TRACE_VERSION, type ScenarioTrace, type TraceSample } from "@/modules/sim/traces";

/**
 * A 20 Hz trace whose position and speed at time t are whatever `at` returns.
 * Straight-line synthetics keep every expectation below arithmetic rather than
 * a fixture nobody can re-derive.
 */
function trace(
  durationSec: number,
  at: (tSec: number) => { x: number; y: number; speedKmh: number },
  kind: ScenarioTrace["meta"]["kind"] = "attempt",
): ScenarioTrace {
  const samples: TraceSample[] = [];
  for (let i = 0; i <= Math.round(durationSec * 20); i++) {
    const tSec = i / 20;
    const p = at(tSec);
    samples.push({
      tSec,
      x: p.x,
      y: p.y,
      headingDeg: 0,
      steerRad: 0,
      speedKmh: p.speedKmh,
      gear: 1,
      indicator: "off",
      brakeOn: false,
      throttleOn: true,
    });
  }
  return {
    meta: { scenarioId: "sc-lane-change", kind, version: TRACE_VERSION, durationSec },
    samples,
    events: [],
  };
}

/** Both cars drive the same line at the same speed. */
const identical = () => trace(10, (t) => ({ x: 0, y: 10 * t, speedKmh: 36 }));

describe("pairedDurationSec", () => {
  it("stops at the SHORTER drive", () => {
    // A student who finished in 40 s against a 55 s shadow did not diverge by
    // 15 s — they finished. Comparing past that samples the shadow against a
    // parked car and draws a growing gap that describes nothing.
    const a = trace(40, () => ({ x: 0, y: 0, speedKmh: 0 }));
    const b = trace(55, () => ({ x: 0, y: 0, speedKmh: 0 }));
    expect(pairedDurationSec(a, b)).toBe(40);
    expect(pairedDurationSec(b, a)).toBe(40);
  });
});

describe("divergenceSeries", () => {
  it("reports a zero gap for two identical drives", () => {
    const s = divergenceSeries(identical(), identical());
    expect(s.maxGapM).toBeCloseTo(0, 9);
    expect(s.points.every((p) => p.speedDeltaKmh === 0)).toBe(true);
  });

  it("samples at the strip rate and always includes the final instant", () => {
    const s = divergenceSeries(identical(), identical());
    expect(s.durationSec).toBe(10);
    expect(s.points.length).toBe(10 * DIVERGENCE_SAMPLE_HZ + 1);
    expect(s.points[s.points.length - 1].tSec).toBeCloseTo(10, 9);
  });

  it("measures the straight-line gap between the two cars", () => {
    const attempt = trace(10, (t) => ({ x: 3, y: 10 * t, speedKmh: 50 }));
    const shadow = trace(10, (t) => ({ x: 0, y: 10 * t, speedKmh: 36 }), "shadow");
    const s = divergenceSeries(attempt, shadow);
    expect(s.maxGapM).toBeCloseTo(3, 6);
    expect(s.points[0].speedDeltaKmh).toBeCloseTo(14, 6);
  });

  it("signs the speed delta so positive means the student was faster", () => {
    const slow = trace(4, () => ({ x: 0, y: 0, speedKmh: 20 }));
    const fast = trace(4, () => ({ x: 0, y: 0, speedKmh: 50 }), "shadow");
    expect(divergenceSeries(slow, fast).points[0].speedDeltaKmh).toBeCloseTo(-30, 6);
    expect(divergenceSeries(fast, slow).points[0].speedDeltaKmh).toBeCloseTo(30, 6);
  });

  it("locates the peak gap in time", () => {
    // Student drifts away linearly: the widest point is the last instant.
    const attempt = trace(10, (t) => ({ x: t, y: 0, speedKmh: 36 }));
    const shadow = trace(10, () => ({ x: 0, y: 0, speedKmh: 36 }), "shadow");
    const s = divergenceSeries(attempt, shadow);
    expect(s.maxGapAtSec).toBeCloseTo(10, 6);
    expect(s.maxGapM).toBeCloseTo(10, 6);
  });
});

describe("firstDivergenceSec", () => {
  it("returns the moment the lines PARTED, not the peak", () => {
    // The peak is the consequence; the student needs the instant the choice
    // was made. Gap crosses 4 m at t = 4 and keeps growing to 10 m.
    const attempt = trace(10, (t) => ({ x: t, y: 0, speedKmh: 36 }));
    const shadow = trace(10, () => ({ x: 0, y: 0, speedKmh: 36 }), "shadow");
    const s = divergenceSeries(attempt, shadow);
    expect(s.maxGapAtSec).toBeCloseTo(10, 6);
    expect(firstDivergenceSec(s)).toBeCloseTo(4, 6);
  });

  it("ignores a single-sample spike that does not hold", () => {
    // One 6 m blip at t = 2, back inside the band immediately after: a scrub
    // through a tight turn is not a decision.
    const attempt = trace(10, (t) => ({
      x: Math.abs(t - 2) < 0.13 ? 6 : 0,
      y: 0,
      speedKmh: 36,
    }));
    const shadow = trace(10, () => ({ x: 0, y: 0, speedKmh: 36 }), "shadow");
    expect(firstDivergenceSec(divergenceSeries(attempt, shadow))).toBeNull();
  });

  it("says nothing when the two drives never leave the same manoeuvre", () => {
    const attempt = trace(10, () => ({ x: DIVERGENCE_NOTABLE_GAP_M - 1, y: 0, speedKmh: 36 }));
    const shadow = trace(10, () => ({ x: 0, y: 0, speedKmh: 36 }), "shadow");
    expect(firstDivergenceSec(divergenceSeries(attempt, shadow))).toBeNull();
  });
});
