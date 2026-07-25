/**
 * Audit M-18 — the acceleration gates must measure a DERIVATIVE, not a frame.
 *
 * Every accel-driven decision in the reducer (braking response on a crossing
 * approach, harsh-brake onset, the motorway steady-crawl test, the emergency-
 * lane pull-off exemption) reads one number: accelMps2. It used to be computed
 * across a single caller frame, and the live loop's frame is the RENDER frame —
 * at 120 fps ~8 ms, where a 0.06 km/h wobble in the reported speed
 * differentiates to ~2.1 m/s². That is above crossingBrakeResponseMps2, so the
 * engine read numerical noise as a firm braking response and handed out the
 * A12 exemption to a driver who never touched the brake.
 *
 * These are the two halves the window has to satisfy: noise must NOT buy
 * innocence, and a real brake must still be seen — at any frame rate.
 */

import { describe, expect, it } from "vitest";
import type { SimTick, SimTickEvent } from "../types";
import { DEFAULT_RULE_CONFIG } from "../types";
import { codes, drive, tick } from "./fixtures";

const pedZone: SimTickEvent = {
  kind: "crossingZoneEntered",
  crossingId: "x-m18",
  pedestrianOnCrossing: true,
};

/**
 * An approach to an occupied zebra at a constant `speedKmh`, sampled at `hz`
 * for `sec` seconds, with an alternating ±`jitterKmh` wobble on the reported
 * speed (the driveline's own noise floor — the car is NOT slowing down).
 */
function jitteryApproach(hz: number, sec: number, speedKmh: number, jitterKmh: number): SimTick[] {
  const out: SimTick[] = [];
  const frames = Math.round(hz * sec);
  for (let i = 0; i <= frames; i++) {
    out.push(
      tick(i / hz, {
        speedKmh: speedKmh - (i % 2) * jitterKmh,
        events: i === 0 ? [pedZone] : [],
      }),
    );
  }
  return out;
}

/** The same approach, braking honestly at `decelMps2` from `fromKmh`. */
function brakingApproach(hz: number, sec: number, fromKmh: number, decelMps2: number): SimTick[] {
  const out: SimTick[] = [];
  const frames = Math.round(hz * sec);
  for (let i = 0; i <= frames; i++) {
    const t = i / hz;
    out.push(
      tick(t, {
        speedKmh: Math.max(0, fromKmh - decelMps2 * 3.6 * t),
        events: i === 0 ? [pedZone] : [],
      }),
    );
  }
  return out;
}

describe("M-18 — acceleration is measured over a window, not one frame", () => {
  it("120 fps speed jitter no longer reads as a braking response", () => {
    // 0.06 km/h across an 8 ms frame = 2.0 m/s² of phantom deceleration — the
    // exemption's own threshold — which used to pause the too-fast clock every
    // other frame and let a 45 km/h run at an occupied zebra go ungraded.
    const jitterPerFrameMps2 = 0.06 / 3.6 / (1 / 120);
    expect(jitterPerFrameMps2).toBeGreaterThanOrEqual(DEFAULT_RULE_CONFIG.crossingBrakeResponseMps2);

    const { events } = drive(jitteryApproach(120, 2, 45, 0.06));
    expect(codes(events)).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });

  it("a real 3 m/s² brake still earns the exemption at render rate", () => {
    // The other half: the window must not smear an honest brake away, or the
    // A12 false positive it exists to prevent comes straight back.
    const { events } = drive(brakingApproach(120, 2, 50, 3));
    expect(codes(events)).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });

  it("grades the same drive identically at 1 Hz, 10 Hz and 120 Hz", () => {
    // Rate independence is the property the sustains already had and the accel
    // gates did not — the recorded traces run at 1 Hz, the live loop does not,
    // and both must reach the same verdict about the same driving.
    const verdicts = [1, 10, 120].map((hz) => codes(drive(jitteryApproach(hz, 3, 45, 0.06).slice()).events));
    for (const v of verdicts) expect(v).toContain("PEDESTRIAN_CROSSING_TOO_FAST");

    const braked = [1, 10, 120].map((hz) => codes(drive(brakingApproach(hz, 3, 50, 3)).events));
    for (const v of braked) expect(v).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });

  it("at trace rate (1 Hz) the window is exactly the old frame-to-frame delta", () => {
    // Every committed trace gate replays at 1 s frames: with a 0.3 s window
    // the anchor is always the single previous frame, so the ~145 recorded
    // regressions keep grading byte-identically.
    const oneHz = [
      tick(0, { speedKmh: 50, events: [pedZone] }),
      tick(1, { speedKmh: 50 - 3 * 3.6 }), // exactly -3 m/s² over the frame
      tick(2, { speedKmh: 50 - 6 * 3.6 }),
    ];
    expect(codes(drive(oneHz).events)).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });
});
