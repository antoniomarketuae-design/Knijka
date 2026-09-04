/**
 * Rear-proximity cue pure logic (rearProximity.ts): the honesty contract
 * (doc 62 #39/#48 — Infinity, the traffic system's no-vehicle report, maps
 * to NO badge from every state, including mid-display), the founder severity
 * ramp (neutral > 8 m, amber < 8, red < 4 while moving), the 1 m exit
 * hysteresis, and the identity-stability that lets the badge's setState bail
 * out at the 5 Hz poll rate.
 *
 * THE `toEqual` ROWS GAINED `kind: "vehicle"` ON 2026-09-04, because the CUE
 * gained the field: the badge now names the body it is about, and every call in
 * this file omits the kind and therefore takes `stepRearCue`'s own default —
 * the car sentence this file has always been about. Nothing here was loosened;
 * each of those rows still enumerates the WHOLE snapshot, which is why they
 * went red rather than passing quietly. The cyclist branch is asserted in
 * `rear-cyclist-behind.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  REAR_CUE_DANGER_M,
  REAR_CUE_EXIT_M,
  REAR_CUE_MOVING_KMH,
  REAR_CUE_RANGE_M,
  REAR_CUE_WARN_M,
  rearCueLabelBg,
  stepRearCue,
  type RearCue,
} from "../rearProximity";

describe("stepRearCue — honesty contract (no vehicle = no badge)", () => {
  it("Infinity from the cold state never raises a badge", () => {
    expect(stepRearCue(null, Infinity, 0)).toBeNull();
    expect(stepRearCue(null, Infinity, 120)).toBeNull();
  });

  it("Infinity DROPS a visible badge immediately — it can never linger", () => {
    // Every visible state, every level: the vehicle leaving kills the badge.
    const states: RearCue[] = [
      { level: "info", meters: 12, kind: "vehicle" },
      { level: "warn", meters: 6, kind: "vehicle" },
      { level: "danger", meters: 3, kind: "vehicle" },
    ];
    for (const prev of states) {
      expect(stepRearCue(prev, Infinity, 0)).toBeNull();
      expect(stepRearCue(prev, Infinity, 50)).toBeNull();
    }
  });

  it("NaN (a malformed read) is treated as no vehicle, not as a badge", () => {
    expect(stepRearCue(null, NaN, 30)).toBeNull();
    expect(stepRearCue({ level: "warn", meters: 6, kind: "vehicle" }, NaN, 30)).toBeNull();
  });
});

describe("stepRearCue — range + hysteresis", () => {
  it("stays silent beyond the 15 m raise range", () => {
    expect(stepRearCue(null, REAR_CUE_RANGE_M + 0.1, 30)).toBeNull();
    expect(stepRearCue(null, 40, 30)).toBeNull();
  });

  it("raises at the 15 m edge", () => {
    expect(stepRearCue(null, REAR_CUE_RANGE_M, 30)).toEqual({ level: "info", meters: 15, kind: "vehicle" });
  });

  it("a raised badge survives to 16 m (exit hysteresis), then drops", () => {
    const up = stepRearCue(null, 14.8, 30);
    expect(up).not.toBeNull();
    // 15.5 m would NOT raise a fresh badge, but keeps a raised one up.
    expect(stepRearCue(up, 15.5, 30)).toEqual({ level: "info", meters: 16, kind: "vehicle" });
    expect(stepRearCue(null, 15.5, 30)).toBeNull();
    // Past the exit edge it drops.
    expect(stepRearCue(up, REAR_CUE_EXIT_M + 0.1, 30)).toBeNull();
  });
});

describe("stepRearCue — severity ramp", () => {
  it("neutral above 8 m", () => {
    expect(stepRearCue(null, 12, 30)?.level).toBe("info");
    expect(stepRearCue(null, REAR_CUE_WARN_M, 30)?.level).toBe("info");
  });

  it("amber under 8 m", () => {
    expect(stepRearCue(null, 7.9, 30)?.level).toBe("warn");
    expect(stepRearCue(null, REAR_CUE_DANGER_M, 30)?.level).toBe("warn");
  });

  it("red under 4 m while moving", () => {
    expect(stepRearCue(null, 3.5, REAR_CUE_MOVING_KMH)?.level).toBe("danger");
    expect(stepRearCue(null, 3.5, -20)?.level).toBe("danger"); // reversing counts as moving
  });

  it("under 4 m at a standstill stays amber — a queue is not a tailgater", () => {
    expect(stepRearCue(null, 3.5, 0)?.level).toBe("warn");
    expect(stepRearCue(null, 3.5, REAR_CUE_MOVING_KMH - 1)?.level).toBe("warn");
  });
});

describe("stepRearCue — render stability + label", () => {
  it("returns the SAME snapshot identity when nothing visible changed", () => {
    const a = stepRearCue(null, 10.2, 30);
    const b = stepRearCue(a, 10.4, 32); // still info · 10 м
    expect(b).toBe(a);
  });

  it("returns a fresh snapshot on a meter or level edge", () => {
    const a = stepRearCue(null, 10.2, 30);
    expect(stepRearCue(a, 8.6, 30)).toEqual({ level: "info", meters: 9, kind: "vehicle" });
    expect(stepRearCue(a, 6.0, 30)).toEqual({ level: "warn", meters: 6, kind: "vehicle" });
  });

  it("display meters never go negative (overlap clamps to 0)", () => {
    expect(stepRearCue(null, 0, 30)).toEqual({ level: "danger", meters: 0, kind: "vehicle" });
  });

  it("labels in Bulgarian with whole meters", () => {
    expect(rearCueLabelBg({ level: "warn", meters: 6, kind: "vehicle" })).toBe("Кола отзад · 6 м");
  });
});
