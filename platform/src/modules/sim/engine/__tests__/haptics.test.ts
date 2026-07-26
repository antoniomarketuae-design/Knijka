// F5 haptics (doc 82 §4.3) — three discrete events, rate-limited, and never
// the sole carrier of information (navigator.vibrate does not exist on iOS
// Safari at any version, so ~a quarter of the phone audience feels nothing).

import { describe, expect, it } from "vitest";
import {
  SimHaptics,
  collisionVibrationPattern,
  BRAKE_ONSET_MIN_KMH,
  BRAKE_ONSET_PEDAL,
  BRAKE_ONSET_RELEASE_PEDAL,
  BRAKE_ONSET_VIBRATION_MS,
  COLLISION_MAX_MS,
  COLLISION_MIN_MS,
  CURB_VIBRATION_MS,
  HAPTIC_MIN_GAP_MS,
} from "../haptics";

/** A fake device: a controllable clock plus a recording vibrate sink. */
function fakeDevice() {
  const fired: Array<number | number[]> = [];
  let t = 0;
  return {
    fired,
    advance: (ms: number) => {
      t += ms;
    },
    haptics: new SimHaptics({
      now: () => t,
      vibrate: (pattern) => fired.push(pattern),
      enabled: true,
    }),
  };
}

describe("collisionVibrationPattern", () => {
  it("is a hit-then-tail pattern, never a continuous buzz", () => {
    const p = collisionVibrationPattern(40);
    expect(p).toHaveLength(3);
    expect(p[2]).toBeLessThan(p[0] as number); // the tail is the lighter half
  });

  it("scales with impact speed and is clamped at both ends", () => {
    const gentle = collisionVibrationPattern(5);
    const hard = collisionVibrationPattern(90);
    expect(hard[0]).toBeGreaterThan(gentle[0] as number);
    expect(gentle[0]).toBeGreaterThanOrEqual(COLLISION_MIN_MS);
    expect(hard[0]).toBeLessThanOrEqual(COLLISION_MAX_MS);
  });

  it("survives a garbage impact speed (NaN reaches it from a torn linvel)", () => {
    expect(collisionVibrationPattern(Number.NaN)[0]).toBe(COLLISION_MIN_MS);
    expect(collisionVibrationPattern(-30)[0]).toBe(collisionVibrationPattern(30)[0]);
  });

  it("emits integers only — the Vibration API truncates", () => {
    for (const v of collisionVibrationPattern(37.4)) expect(Number.isInteger(v)).toBe(true);
  });
});

describe("SimHaptics rate limiting", () => {
  it("collapses a multi-contact pile-up into one buzz", () => {
    const d = fakeDevice();
    expect(d.haptics.curb()).toBe(true);
    expect(d.haptics.curb()).toBe(false); // same instant — swallowed
    d.advance(HAPTIC_MIN_GAP_MS - 1);
    expect(d.haptics.collision(50)).toBe(false);
    d.advance(2);
    expect(d.haptics.collision(50)).toBe(true);
    expect(d.fired).toEqual([CURB_VIBRATION_MS, collisionVibrationPattern(50)]);
  });

  it("does nothing at all on a device that cannot vibrate", () => {
    const fired: Array<number | number[]> = [];
    const haptics = new SimHaptics({ now: () => 0, vibrate: (p) => fired.push(p), enabled: false });
    expect(haptics.active).toBe(false);
    expect(haptics.curb()).toBe(false);
    expect(haptics.collision(80)).toBe(false);
    expect(fired).toEqual([]);
  });

  it("cancels anything running when switched off mid-session", () => {
    const d = fakeDevice();
    d.haptics.setEnabled(false);
    expect(d.fired).toEqual([0]);
    expect(d.haptics.curb()).toBe(false);
  });
});

describe("SimHaptics threshold-braking onset", () => {
  it("taps ONCE on the crossing, not every frame of a held pedal", () => {
    const d = fakeDevice();
    let taps = 0;
    for (let i = 0; i < 60; i++) {
      d.advance(1000); // well past the rate limit every frame
      if (d.haptics.brakePedal(1, 80)) taps++;
    }
    expect(taps).toBe(1);
    expect(d.fired).toEqual([BRAKE_ONSET_VIBRATION_MS]);
  });

  it("re-arms only after the pedal is genuinely released", () => {
    const d = fakeDevice();
    expect(d.haptics.brakePedal(1, 80)).toBe(true);
    d.advance(1000);
    // Easing off but still on the brake must NOT re-arm — otherwise a
    // modulated stop stutters the motor all the way to the stop line.
    expect(d.haptics.brakePedal(BRAKE_ONSET_RELEASE_PEDAL + 0.1, 80)).toBe(false);
    d.advance(1000);
    expect(d.haptics.brakePedal(0, 80)).toBe(false); // released, re-armed
    d.advance(1000);
    expect(d.haptics.brakePedal(1, 80)).toBe(true);
  });

  it("stays silent for a gentle pedal and for a low-speed parking stop", () => {
    const d = fakeDevice();
    expect(d.haptics.brakePedal(BRAKE_ONSET_PEDAL - 0.1, 80)).toBe(false);
    d.advance(1000);
    expect(d.haptics.brakePedal(1, BRAKE_ONSET_MIN_KMH - 1)).toBe(false);
    expect(d.fired).toEqual([]);
  });

  it("fires while reversing hard too (speed is read as a magnitude)", () => {
    const d = fakeDevice();
    expect(d.haptics.brakePedal(1, -(BRAKE_ONSET_MIN_KMH + 5))).toBe(true);
  });
});
