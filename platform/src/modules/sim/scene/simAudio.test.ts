import { describe, expect, it } from "vitest";
import {
  IDLE_RPM,
  SIREN_HEAR_M,
  SIREN_HI_HZ,
  SIREN_LO_HZ,
  SIREN_TONE_S,
  TOP_RPM,
  TYRE_LP_MAX_HZ,
  TYRE_LP_MIN_HZ,
  brakeHissLevel,
  npcHumLevel,
  rpmTarget,
  sirenLevel,
  tyreCutoffHz,
  tyreLevel,
  windLevel,
  wiperEnvelope,
} from "./simAudio";

describe("tyreLevel (the #1 speed cue)", () => {
  it("is silent parked", () => {
    expect(tyreLevel(0)).toBe(0);
    expect(tyreLevel(0.5)).toBe(0);
  });

  it("rises monotonically with speed and caps at 1 by 90 km/h", () => {
    expect(tyreLevel(10)).toBeGreaterThan(0);
    expect(tyreLevel(30)).toBeGreaterThan(tyreLevel(10));
    expect(tyreLevel(60)).toBeGreaterThan(tyreLevel(30));
    expect(tyreLevel(90)).toBe(1);
    expect(tyreLevel(130)).toBe(1);
  });

  it("uses absolute speed (reversing makes tyre noise too)", () => {
    expect(tyreLevel(-30)).toBeCloseTo(tyreLevel(30));
  });
});

describe("tyreCutoffHz (brightness sweep)", () => {
  it("sweeps 300 Hz → 2 kHz across 0 → 90 km/h, then flat", () => {
    expect(tyreCutoffHz(0)).toBe(TYRE_LP_MIN_HZ);
    expect(tyreCutoffHz(45)).toBeCloseTo((TYRE_LP_MIN_HZ + TYRE_LP_MAX_HZ) / 2);
    expect(tyreCutoffHz(90)).toBe(TYRE_LP_MAX_HZ);
    expect(tyreCutoffHz(120)).toBe(TYRE_LP_MAX_HZ);
  });
});

describe("windLevel", () => {
  it("is silent at and below 40 km/h", () => {
    expect(windLevel(0)).toBe(0);
    expect(windLevel(40)).toBe(0);
  });

  it("scales harder than linear (convex) and caps at 1", () => {
    const a = windLevel(55) - windLevel(40); // early increment
    const b = windLevel(110) - windLevel(95); // late increment, same span
    expect(windLevel(55)).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(windLevel(110)).toBe(1);
    expect(windLevel(140)).toBe(1);
  });
});

describe("brakeHissLevel", () => {
  it("is silent at standstill even at full pedal", () => {
    expect(brakeHissLevel(1, 0)).toBe(0);
    expect(brakeHissLevel(1, 2)).toBe(0);
  });

  it("is silent without brake input", () => {
    expect(brakeHissLevel(0, 80)).toBe(0);
  });

  it("scales with pedal and speed, speed factor capping at 60 km/h", () => {
    expect(brakeHissLevel(0.5, 30)).toBeCloseTo(0.25);
    expect(brakeHissLevel(1, 30)).toBeCloseTo(0.5);
    expect(brakeHissLevel(1, 60)).toBe(1);
    expect(brakeHissLevel(1, 120)).toBe(1);
  });

  it("clamps a wild pedal value", () => {
    expect(brakeHissLevel(3, 60)).toBe(1);
  });
});

describe("npcHumLevel", () => {
  it("is silent with no traffic (Infinity) or far traffic", () => {
    expect(npcHumLevel(Infinity)).toBe(0);
    expect(npcHumLevel(45)).toBe(0);
    expect(npcHumLevel(400)).toBe(0);
  });

  it("rises as the nearest car closes in", () => {
    expect(npcHumLevel(40)).toBeGreaterThan(0);
    expect(npcHumLevel(20)).toBeGreaterThan(npcHumLevel(40));
    expect(npcHumLevel(5)).toBeGreaterThan(npcHumLevel(20));
  });

  it("clamps point-blank distances (leadGap can hit 0)", () => {
    expect(npcHumLevel(0)).toBe(npcHumLevel(2));
    expect(npcHumLevel(0)).toBeLessThanOrEqual(1);
  });
});

describe("sirenLevel (VU-09 emergency stimulus)", () => {
  it("is silent with no active emergency actor (Infinity) or beyond earshot", () => {
    expect(sirenLevel(Infinity)).toBe(0);
    expect(sirenLevel(SIREN_HEAR_M)).toBe(0);
    expect(sirenLevel(1000)).toBe(0);
  });

  it("carries much further than the NPC hum and rises as the actor closes", () => {
    expect(sirenLevel(120)).toBeGreaterThan(0); // audible before the mirror fills
    expect(sirenLevel(60)).toBeGreaterThan(sirenLevel(120));
    expect(sirenLevel(15)).toBeGreaterThan(sirenLevel(60));
    expect(npcHumLevel(120)).toBe(0); // the hum is long gone out here
  });

  it("clamps point-blank distances", () => {
    expect(sirenLevel(0)).toBe(sirenLevel(2));
    expect(sirenLevel(0)).toBeLessThanOrEqual(1);
  });

  it("two-tone constants are a genuine hi-lo pair", () => {
    expect(SIREN_HI_HZ).toBeGreaterThan(SIREN_LO_HZ);
    expect(SIREN_TONE_S).toBeGreaterThan(0);
  });
});

describe("rpmTarget (cosmetic pitch curve)", () => {
  it("idles at standstill with no throttle", () => {
    expect(rpmTarget(0, 0)).toBe(IDLE_RPM);
  });

  it("revs a stationary throttle blip above idle", () => {
    expect(rpmTarget(0, 1)).toBeGreaterThan(IDLE_RPM);
  });

  it("rises with speed inside a gear band and never exceeds TOP_RPM", () => {
    expect(rpmTarget(10, 0)).toBeGreaterThan(rpmTarget(3, 0));
    for (const v of [0, 15, 30, 50, 75, 100, 134, 200]) {
      expect(rpmTarget(v, 1)).toBeLessThanOrEqual(TOP_RPM);
      expect(rpmTarget(v, 1)).toBeGreaterThanOrEqual(IDLE_RPM);
    }
  });

  it("drops at an upshift boundary (band restarts)", () => {
    expect(rpmTarget(17, 0)).toBeLessThan(rpmTarget(15.9, 0));
  });
});

describe("wiperEnvelope", () => {
  it("is silent at the turnaround points", () => {
    expect(wiperEnvelope(0)).toBeCloseTo(0);
    expect(wiperEnvelope(0.5)).toBeCloseTo(0);
    expect(wiperEnvelope(1)).toBeCloseTo(0);
  });

  it("peaks once per stroke — two swishes per cycle", () => {
    expect(wiperEnvelope(0.25)).toBeCloseTo(1);
    expect(wiperEnvelope(0.75)).toBeCloseTo(1);
    expect(wiperEnvelope(0.1)).toBeGreaterThan(0);
    expect(wiperEnvelope(0.1)).toBeLessThan(1);
  });
});
