// Grip-loss read channel (doc 82 §4.2 F1) — the pure half.
// The physics half (VehicleSim exposes it, and exposing it changes nothing)
// is asserted in feel-channels.test.ts.

import { describe, expect, it } from "vitest";
import {
  combinedGripUtilisation,
  deliveredGripUtilisation,
  demandedGripUtilisation,
  gripCeilingMs2,
  GRIP_SIGNAL_MAX_ACCEL_MS2,
  GRIP_SIGNAL_MU,
  GRIP_SIGNAL_WHEELBASE_M,
  GRIP_UTILISATION_MAX,
} from "./gripSignal";
import { AQUAPLANE_PATCH_GRIP_FACTOR, SNOW_GRIP_FACTOR, WET_GRIP_FACTOR } from "./tuning";

describe("gripCeilingMs2", () => {
  it("puts the DRY ceiling inside the harness-measured 13-14 m/s² band", () => {
    // tuning.ts FRICTION_SLIP_FRONT: "μ 1.4 caps lateral accel ≈ 13-14 m/s²".
    // If this drifts, the whole utilisation scale is lying to the student.
    expect(gripCeilingMs2(1)).toBeGreaterThan(13);
    expect(gripCeilingMs2(1)).toBeLessThan(15);
  });

  it("collapses with the surface, in the ratio the lessons teach", () => {
    const dry = gripCeilingMs2(1);
    expect(gripCeilingMs2(WET_GRIP_FACTOR)).toBeCloseTo(dry * WET_GRIP_FACTOR, 6);
    expect(gripCeilingMs2(SNOW_GRIP_FACTOR)).toBeCloseTo(dry * SNOW_GRIP_FACTOR, 6);
    // The ice/aquaplane band: ~2 m/s² is why the car "stops answering".
    expect(gripCeilingMs2(AQUAPLANE_PATCH_GRIP_FACTOR)).toBeLessThan(2.5);
  });

  it("never divides by zero on a pathological grip factor", () => {
    expect(gripCeilingMs2(0)).toBeGreaterThan(0);
  });

  it("derives its wheelbase and μ from the rig, not from a magic number", () => {
    expect(GRIP_SIGNAL_WHEELBASE_M).toBeCloseTo(2.56, 6);
    expect(GRIP_SIGNAL_MU).toBeCloseTo(1.45, 6);
  });
});

describe("deliveredGripUtilisation", () => {
  it("is 0 for a car doing nothing", () => {
    expect(deliveredGripUtilisation(0, 0, 1)).toBe(0);
  });

  it("reads 1 exactly at the ceiling", () => {
    expect(deliveredGripUtilisation(gripCeilingMs2(1), 0, 1)).toBeCloseTo(1, 6);
  });

  it("is a FRICTION CIRCLE — braking spends grip a corner then cannot have", () => {
    const half = gripCeilingMs2(1) * 0.7;
    // 0.7 lateral alone is 0.7; add 0.7 longitudinal and the combination is
    // already ~0.99 — the trail-braking loss of control, in one number.
    expect(deliveredGripUtilisation(half, 0, 1)).toBeCloseTo(0.7, 6);
    expect(deliveredGripUtilisation(half, half, 1)).toBeGreaterThan(0.98);
  });

  it("is sign-agnostic (a left corner is as expensive as a right one)", () => {
    expect(deliveredGripUtilisation(-5, -3, 1)).toBeCloseTo(
      deliveredGripUtilisation(5, 3, 1),
      12,
    );
  });

  it("rises when the SURFACE degrades at identical accelerations — the whole point on ice", () => {
    const a = 2;
    expect(deliveredGripUtilisation(a, 0, 1)).toBeLessThan(0.2);
    expect(deliveredGripUtilisation(a, 0, AQUAPLANE_PATCH_GRIP_FACTOR)).toBeGreaterThan(0.9);
  });

  it("clamps a runaway value", () => {
    expect(deliveredGripUtilisation(GRIP_SIGNAL_MAX_ACCEL_MS2 * 100, 0, 0.05)).toBe(
      GRIP_UTILISATION_MAX,
    );
  });
});

describe("demandedGripUtilisation", () => {
  it("is 0 with the wheel straight, at any speed", () => {
    expect(demandedGripUtilisation(30, 0, 1)).toBe(0);
  });

  it("is 0 at a standstill, at any steering angle", () => {
    expect(demandedGripUtilisation(0, 0.6, 1)).toBe(0);
  });

  it("matches the kinematic bicycle model", () => {
    const v = 15; // m/s
    const steer = 0.1;
    const expected =
      (v * v * Math.tan(steer)) / GRIP_SIGNAL_WHEELBASE_M / gripCeilingMs2(1);
    expect(demandedGripUtilisation(v, steer, 1)).toBeCloseTo(expected, 9);
  });

  it("EXCEEDS 1 when the driver asks for grip that does not exist", () => {
    // This is the half delivered utilisation can never express: rapier clamps
    // the side impulse at the ceiling, so measured accel plateaus BELOW 1 and
    // a slide would otherwise be silent.
    expect(demandedGripUtilisation(25, 0.25, 1)).toBeGreaterThan(1);
  });

  it("makes an ordinary town corner read as over-demand on ice", () => {
    // ~40 km/h, a gentle 6° of lock — nothing on dry, everything on glare ice.
    const v = 40 / 3.6;
    expect(demandedGripUtilisation(v, 0.1, 1)).toBeLessThan(0.4);
    expect(demandedGripUtilisation(v, 0.1, AQUAPLANE_PATCH_GRIP_FACTOR)).toBeGreaterThan(1);
  });

  it("is sign-agnostic", () => {
    expect(demandedGripUtilisation(20, -0.2, 1)).toBeCloseTo(
      demandedGripUtilisation(20, 0.2, 1),
      12,
    );
  });
});

describe("combinedGripUtilisation", () => {
  it("takes the worse of the two halves", () => {
    expect(combinedGripUtilisation(0.4, 1.3)).toBe(1.3);
    expect(combinedGripUtilisation(0.95, 0.2)).toBe(0.95);
  });
});
