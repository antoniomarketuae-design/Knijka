// Reversing POV — the pure decision layer behind CameraRig's swing.
// The rig is a dumb consumer of these; everything worth asserting about the
// feature (when it engages, what overrides it, that it never cuts) is here.

import { describe, expect, it } from "vitest";
import {
  chaseOrbitLock,
  reverseSwingEnvelope,
  reverseViewTarget,
  stepReverseSwing,
  CHASE_ORBIT_LOCK_GAIN,
  CHASE_REVERSE_ORBIT_RAD,
  COCKPIT_SHOULDER_PITCH,
  COCKPIT_SHOULDER_YAW,
  REVERSE_SWING_LAMBDA,
  REVERSE_VIEW_FORWARD_HOLD_KMH,
  type ReverseViewFrame,
} from "../reverseView";
import { REVERSE_ASSIST_STANDSTILL_KMH } from "../reverseAssist";

/** A car reversing in the cockpit with the feature at its shipped default. */
function frame(over: Partial<ReverseViewFrame> = {}): ReverseViewFrame {
  return {
    selector: "R",
    speedKmh: -4,
    mode: "cockpit",
    glanceHeld: false,
    enabled: true,
    driveLocked: false,
    ...over,
  };
}

describe("reverseViewTarget — engagement", () => {
  it("looks back in R, in both the cockpit and the chase view", () => {
    expect(reverseViewTarget(frame({ mode: "cockpit" }))).toBe(1);
    expect(reverseViewTarget(frame({ mode: "chase" }))).toBe(1);
  });

  it("engages on the SELECTOR, before the car has moved — look before you go", () => {
    expect(reverseViewTarget(frame({ speedKmh: 0 }))).toBe(1);
  });

  it("looks forward again the moment R is left", () => {
    for (const selector of ["D", "N", "P", "M"] as const) {
      expect(reverseViewTarget(frame({ selector }))).toBe(0);
    }
  });

  it("does not swing for a backwards roll in D/N — only the selector states intent", () => {
    expect(reverseViewTarget(frame({ selector: "D", speedKmh: -3 }))).toBe(0);
    expect(reverseViewTarget(frame({ selector: "N", speedKmh: -3 }))).toBe(0);
  });

  it("holds off while R is engaged but the car still creeps forward", () => {
    // The gate interlock allows R up to 3 km/h forward; swinging the view
    // backwards while the car still moves forward is the disorientation the
    // feature exists to prevent.
    expect(reverseViewTarget(frame({ speedKmh: 2 }))).toBe(0);
    expect(reverseViewTarget(frame({ speedKmh: REVERSE_VIEW_FORWARD_HOLD_KMH + 0.01 }))).toBe(0);
    // ...and takes it the instant the forward roll dies.
    expect(reverseViewTarget(frame({ speedKmh: REVERSE_VIEW_FORWARD_HOLD_KMH }))).toBe(1);
  });

  it("shares one standstill band with the reverse assist", () => {
    expect(REVERSE_VIEW_FORWARD_HOLD_KMH).toBe(REVERSE_ASSIST_STANDSTILL_KMH);
  });
});

describe("reverseViewTarget — overrides (never imposed)", () => {
  it("does nothing at all when the student opted out", () => {
    expect(reverseViewTarget(frame({ enabled: false }))).toBe(0);
    expect(reverseViewTarget(frame({ enabled: false, mode: "chase" }))).toBe(0);
  });

  it("leaves top-down alone — it already sees everything", () => {
    expect(reverseViewTarget(frame({ mode: "topdown" }))).toBe(0);
  });

  it("yields the cockpit head to an explicit mirror glance", () => {
    expect(reverseViewTarget(frame({ glanceHeld: true }))).toBe(0);
  });

  it("keeps the chase orbit through a glance — Q/E/F move no camera there", () => {
    expect(reverseViewTarget(frame({ mode: "chase", glanceHeld: true }))).toBe(1);
  });

  it("never swings behind the pre-drive gate — a held brake there is a step", () => {
    expect(reverseViewTarget(frame({ driveLocked: true }))).toBe(0);
    expect(reverseViewTarget(frame({ driveLocked: true, mode: "chase" }))).toBe(0);
  });

  it("stays available in exam mode: nothing in the frame can express a rung", () => {
    // The contract is structural — a POV is not an aid, so there is no exam
    // input to gate on. This test pins that: if someone adds one, it fails.
    const keys = Object.keys(frame()).sort();
    expect(keys).toEqual([
      "driveLocked",
      "enabled",
      "glanceHeld",
      "mode",
      "selector",
      "speedKmh",
    ]);
  });
});

describe("stepReverseSwing", () => {
  it("settles ~95 % of the way back within half a second — smooth, never a cut", () => {
    let swing = 0;
    for (let t = 0; t < 0.5; t += 1 / 60) swing = stepReverseSwing(swing, 1, 1 / 60);
    expect(swing).toBeGreaterThan(0.93);
    expect(swing).toBeLessThan(0.97);
    // The whole first frame moves a small fraction — no teleport.
    expect(stepReverseSwing(0, 1, 1 / 60)).toBeLessThan(0.12);
  });

  it("is frame-rate independent: 30 fps and 120 fps land in the same place", () => {
    let slow = 0;
    for (let i = 0; i < 15; i++) slow = stepReverseSwing(slow, 1, 1 / 30);
    let fast = 0;
    for (let i = 0; i < 60; i++) fast = stepReverseSwing(fast, 1, 1 / 120);
    expect(slow).toBeCloseTo(fast, 3);
  });

  it("swings home symmetrically when R is left", () => {
    let swing = 1;
    for (let t = 0; t < 0.5; t += 1 / 60) swing = stepReverseSwing(swing, 0, 1 / 60);
    expect(swing).toBeLessThan(0.07);
  });

  it("snaps to the target instead of trailing an asymptote forever", () => {
    let swing = 0;
    for (let i = 0; i < 600; i++) swing = stepReverseSwing(swing, 1, 1 / 60);
    expect(swing).toBe(1);
  });

  it("is a no-op on a dead frame (paused tab, first frame) — never NaN", () => {
    expect(stepReverseSwing(0.4, 1, 0)).toBe(0.4);
    expect(stepReverseSwing(0.4, 1, -1)).toBe(0.4);
  });

  it("honours the tuning lambda", () => {
    const lazy = stepReverseSwing(0, 1, 0.1, REVERSE_SWING_LAMBDA / 2);
    const shipped = stepReverseSwing(0, 1, 0.1);
    expect(lazy).toBeLessThan(shipped);
  });
});

describe("reverseSwingEnvelope", () => {
  it("pins the ends and eases both of them", () => {
    expect(reverseSwingEnvelope(0)).toBe(0);
    expect(reverseSwingEnvelope(1)).toBe(1);
    expect(reverseSwingEnvelope(0.5)).toBeCloseTo(0.5, 6);
    // Ease-in: early swing lags the raw value (no whip off the mark).
    expect(reverseSwingEnvelope(0.1)).toBeLessThan(0.1);
    // Ease-out: late swing leads it (arrival is gentle).
    expect(reverseSwingEnvelope(0.9)).toBeGreaterThan(0.9);
  });

  it("clamps a swing outside 0..1", () => {
    expect(reverseSwingEnvelope(-0.5)).toBe(0);
    expect(reverseSwingEnvelope(1.5)).toBe(1);
  });

  it("is monotonic across the swing", () => {
    let prev = -1;
    for (let s = 0; s <= 1; s += 0.05) {
      const env = reverseSwingEnvelope(s);
      expect(env).toBeGreaterThanOrEqual(prev);
      prev = env;
    }
  });
});

describe("chaseOrbitLock", () => {
  it("is inert once settled — the chase keeps its trailing lag, either way round", () => {
    expect(chaseOrbitLock(0, 0)).toBe(0);
    expect(chaseOrbitLock(1, 1)).toBe(0);
  });

  it("locks the camera to the arc while the swing is in motion", () => {
    expect(chaseOrbitLock(0, 1)).toBe(1);
    expect(chaseOrbitLock(1, 0)).toBe(1);
    expect(chaseOrbitLock(0.5, 1)).toBe(1);
  });

  it("hands the lag back over the last quarter of the swing", () => {
    expect(chaseOrbitLock(1 - 1 / CHASE_ORBIT_LOCK_GAIN, 1)).toBeCloseTo(1, 6);
    expect(chaseOrbitLock(0.9, 1)).toBeCloseTo(0.4, 6);
    expect(chaseOrbitLock(0.99, 1)).toBeCloseTo(0.04, 6);
  });

  it("never exceeds a full lerp", () => {
    for (let s = 0; s <= 1; s += 0.05) {
      expect(chaseOrbitLock(s, 1)).toBeLessThanOrEqual(1);
      expect(chaseOrbitLock(s, 0)).toBeLessThanOrEqual(1);
    }
  });
});

describe("view aspects", () => {
  it("mirrors the chase exactly — 'from front to back'", () => {
    expect(CHASE_REVERSE_ORBIT_RAD).toBeCloseTo(Math.PI, 10);
  });

  it("checks over the RIGHT shoulder, and stops at a head's worth of turn", () => {
    // Negative yaw = toward car-right in the GLANCE_OFFSETS frame.
    expect(COCKPIT_SHOULDER_YAW).toBeLessThan(0);
    // Past the right door mirror (−0.93) — this is a shoulder check, not a
    // mirror check — but inside a real neck's limit, not a 180° spin.
    expect(Math.abs(COCKPIT_SHOULDER_YAW)).toBeGreaterThan(0.93);
    expect(Math.abs(COCKPIT_SHOULDER_YAW)).toBeLessThan(Math.PI / 2 + 0.35);
    // Eyes drop toward the kerb/boot line, not up into the headliner.
    expect(COCKPIT_SHOULDER_PITCH).toBeLessThan(0);
  });
});
