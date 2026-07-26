// Road-surface vertical motion (doc 82 §4.2 F2) — the pure half.
//
// DETERMINISM IS THE CONTRACT here, not an implementation detail: the whole
// reason the excitation is sampled at the WHEEL'S WORLD POSITION instead of
// off a clock is that recorded student drives are replayed and re-graded. If
// these tests ever go red, every committed trace has silently drifted.

import { describe, expect, it } from "vitest";
import {
  roadNoiseAt,
  roadRoughnessForceN,
  roadRoughnessSpeedScale,
  ROAD_NOISE_WAVELENGTH_M,
  ROAD_ROUGHNESS_FORCE_N,
  ROAD_ROUGHNESS_FULL_KMH,
  ROAD_ROUGHNESS_MIN_KMH,
} from "./roadNoise";
import { CHASSIS_MASS, SUSPENSION_STIFFNESS } from "./tuning";

describe("roadNoiseAt (deterministic 2-octave value noise)", () => {
  it("is a PURE FUNCTION OF PLACE — the same metre of road, forever", () => {
    for (const [x, z] of [
      [0, 0],
      [12.5, -40],
      [-1934.25, 1631.75],
    ] as const) {
      expect(roadNoiseAt(x, z)).toBe(roadNoiseAt(x, z));
    }
  });

  it("stays inside [-1, 1] across a long sweep of the map", () => {
    for (let i = 0; i < 4000; i++) {
      const x = (i * 7.13) % 1900;
      const z = -((i * 3.37) % 1600);
      const n = roadNoiseAt(x, z);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it("actually varies at the wheel scale (it is not a flat plane in disguise)", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 500; i++) {
      const n = roadNoiseAt(i * 0.25, 0);
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    expect(max - min).toBeGreaterThan(0.8);
  });

  it("is CONTINUOUS — no step a suspension would read as a pothole", () => {
    // Two samples 1 cm apart must be near-identical, or the car would be
    // kicked rather than floated.
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37;
      worst = Math.max(worst, Math.abs(roadNoiseAt(x, 0) - roadNoiseAt(x + 0.01, 0)));
    }
    expect(worst).toBeLessThan(0.05);
  });

  it("carries its energy at the authored feature scale", () => {
    // Samples one wavelength apart must be uncorrelated-looking (the long
    // octave really is ~3.6 m, not 36 m or 0.36 m).
    let diffSum = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 11.7;
      diffSum += Math.abs(roadNoiseAt(x, 0) - roadNoiseAt(x + ROAD_NOISE_WAVELENGTH_M, 0));
    }
    expect(diffSum / 200).toBeGreaterThan(0.15);
  });
});

describe("roadRoughnessSpeedScale", () => {
  it("is silent at a standstill and through the parking band", () => {
    expect(roadRoughnessSpeedScale(0)).toBe(0);
    expect(roadRoughnessSpeedScale(ROAD_ROUGHNESS_MIN_KMH)).toBe(0);
  });

  it("ramps to full by city speed and stays there", () => {
    expect(roadRoughnessSpeedScale(20)).toBeGreaterThan(0);
    expect(roadRoughnessSpeedScale(20)).toBeLessThan(1);
    expect(roadRoughnessSpeedScale(ROAD_ROUGHNESS_FULL_KMH)).toBe(1);
    expect(roadRoughnessSpeedScale(140)).toBe(1);
  });

  it("uses absolute speed (reversing over a bad surface is still bumpy)", () => {
    expect(roadRoughnessSpeedScale(-30)).toBe(roadRoughnessSpeedScale(30));
  });
});

describe("roadRoughnessForceN", () => {
  it("is EXACTLY zero at roughness 0 — the shipped default", () => {
    expect(roadRoughnessForceN(12.5, -40, 90, 0)).toBe(0);
  });

  it("is zero below the speed floor however rough the road", () => {
    expect(roadRoughnessForceN(12.5, -40, 2, 1)).toBe(0);
  });

  it("scales linearly with the authored roughness", () => {
    const full = roadRoughnessForceN(12.5, -40, 60, 1);
    expect(roadRoughnessForceN(12.5, -40, 60, 0.5)).toBeCloseTo(full * 0.5, 9);
  });

  it("stays SUB-CENTIMETRE against the real per-wheel spring rate", () => {
    // doc 82 F2: "Target sub-centimetre wheel displacement at city speed;
    // overdoing amplitude causes sim sickness." Per-wheel rate is
    // mass-normalised (tuning.ts cheat-sheet point 1): k = stiffness · mass.
    const kNPerM = SUSPENSION_STIFFNESS * CHASSIS_MASS;
    const worstTravelM = ROAD_ROUGHNESS_FORCE_N / kNPerM;
    expect(worstTravelM).toBeLessThan(0.01);
    expect(worstTravelM).toBeGreaterThan(0.002); // …but not imperceptible
  });

  it("never exceeds the amplitude ceiling anywhere on the map", () => {
    for (let i = 0; i < 3000; i++) {
      const f = roadRoughnessForceN((i * 5.9) % 1900, -((i * 2.3) % 1600), 90, 1);
      expect(Math.abs(f)).toBeLessThanOrEqual(ROAD_ROUGHNESS_FORCE_N + 1e-9);
    }
  });
});
