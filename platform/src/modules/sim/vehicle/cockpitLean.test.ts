// The cockpit head-lean's lateral input — sc-ac-crosswind:a9db1738.
//
// The defect this gate exists for is a SUM WITH A MISSING ADDEND, which is the
// hardest kind to see: the formula was correct, complete-looking and wrong only
// by omission, and it produced a perfectly plausible dead-level head on the one
// lesson whose whole subject is being pushed sideways. So the assertions below
// are about the addend, not about the arithmetic.

import { describe, expect, it } from "vitest";

import { cockpitLatAccelMs2 } from "./cockpitLean";
import {
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  ESTIMATE_WHEELBASE,
} from "./tuning";

/** The shipped steady crosswind, as the acceleration a 1 220 kg car takes. */
const WIND_MS2 = CROSSWIND_BRIDGE_N / CHASSIS_MASS;

describe("cockpitLatAccelMs2 — the cockpit's lateral sense", () => {
  it("is the plain kinematic estimate when nothing else pushes the car", () => {
    // Every lesson that authors no `physics.crosswind` passes 0 here, so the
    // cockpit it has always had must come out unchanged to the bit.
    const speedMps = 14;
    const steerRad = 0.08;
    expect(
      cockpitLatAccelMs2({
        speedMps,
        steerRad,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: 0,
      }),
    ).toBe((speedMps * speedMps * Math.tan(steerRad)) / ESTIMATE_WHEELBASE);
  });

  it("REPORTS A PUSH THE STEERING DOES NOT EXPLAIN — the whole row", () => {
    // Hands fixed, wind blowing: the pre-repair formula returned 0 here, and a
    // 0 is what the audit photographed as „nothing in the cockpit reports a
    // lateral disturbance".
    const leaned = cockpitLatAccelMs2({
      speedMps: 14,
      steerRad: 0,
      wheelbaseM: ESTIMATE_WHEELBASE,
      disturbanceMs2: WIND_MS2,
    });
    expect(leaned).toBeCloseTo(WIND_MS2, 10);
    expect(leaned).not.toBe(0);
    // And it is a magnitude a head can be leaned by, not a rounding artefact:
    // ≈0.098 g for the shipped 1 200 N, which is roughly a third of the lean a
    // gentle 30 km/h corner produces.
    expect(leaned / 9.81).toBeGreaterThan(0.05);
    expect(leaned / 9.81).toBeLessThan(0.2);
  });

  it("reports it AT REST too — the wind does not wait for the student", () => {
    // The kinematic term is v²-scaled, so at a standstill (and on the crawling
    // legs the harness drives) it is ~0 whatever the wheel is doing. The gust
    // is not, and a student stopped on an exposed span is exactly who needs to
    // be told the air is pushing.
    expect(
      cockpitLatAccelMs2({
        speedMps: 0,
        steerRad: 0.2,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      }),
    ).toBeCloseTo(WIND_MS2, 10);
  });

  it("keeps the sign of the disturbance — a wind from the left leans left", () => {
    const base = { speedMps: 0, steerRad: 0, wheelbaseM: ESTIMATE_WHEELBASE };
    expect(cockpitLatAccelMs2({ ...base, disturbanceMs2: WIND_MS2 })).toBeGreaterThan(0);
    expect(cockpitLatAccelMs2({ ...base, disturbanceMs2: -WIND_MS2 })).toBeLessThan(0);
  });

  it("lets a counter-steer cancel the push, which is the taught duty", () => {
    // Briefing steps 5 and 7: meet the gust with a light, CONSTANT correction —
    // and the moment the correction matches the push, the cockpit goes level
    // again. That is the feedback loop the lesson is built on, and the sum is
    // what makes it exist at all.
    const speedMps = 14;
    // Steer INTO the wind (wind pushes left ⇒ steer right, negative).
    const cancelling = -Math.atan((WIND_MS2 * ESTIMATE_WHEELBASE) / (speedMps * speedMps));
    expect(
      cockpitLatAccelMs2({
        speedMps,
        steerRad: cancelling,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      }),
    ).toBeCloseTo(0, 10);
  });

  it("breathes over the gust envelope rather than sitting at one offset", () => {
    // The peak/trough of the shipped sine, expressed as head-lean input: the
    // ease is the cue briefing step 6 sends the student to read.
    const base = { speedMps: 14, steerRad: 0, wheelbaseM: ESTIMATE_WHEELBASE };
    const peak = (CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const trough = (CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const hi = cockpitLatAccelMs2({ ...base, disturbanceMs2: peak });
    const lo = cockpitLatAccelMs2({ ...base, disturbanceMs2: trough });
    expect(hi - lo).toBeCloseTo((2 * CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS, 10);
    // The gust never flips the wind, so the lean never crosses centre — the
    // car is pushed the same way throughout, harder and softer.
    expect(lo).toBeGreaterThan(0);
  });
});
