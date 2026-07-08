import { describe, expect, it } from "vitest";
import {
  MAX_VALID_DELTA_MS,
  QUALITY_PRESETS,
  medianFpsFromDeltas,
  recommendQuality,
} from "../quality";

describe("QUALITY_PRESETS", () => {
  it("low is the no-extras safety net (no composer, no AO)", () => {
    const low = QUALITY_PRESETS.low;
    expect(low.shadows).toBe(false);
    expect(low.rainParticles).toBe(0);
    expect(low.postprocessing).toBe(false);
    expect(low.aoEnabled).toBe(false);
    expect(low.bloom).toBe(false);
    expect(low.colorGrade).toBe(false);
    expect(low.maxDpr).toBe(1);
  });

  it("med runs a lean composer: half-res AO + SMAA, but no bloom/grade", () => {
    const med = QUALITY_PRESETS.med;
    expect(med.shadows).toBe(true);
    expect(med.shadowMapSize).toBe(1024);
    expect(med.rainParticles).toBeGreaterThan(0);
    expect(med.postprocessing).toBe(true);
    expect(med.aoEnabled).toBe(true);
    expect(med.aoHalfRes).toBe(true);
    expect(med.bloom).toBe(false);
    expect(med.colorGrade).toBe(false);
  });

  it("high runs the full composer: AO + bloom + grade", () => {
    const high = QUALITY_PRESETS.high;
    expect(high.postprocessing).toBe(true);
    expect(high.aoEnabled).toBe(true);
    expect(high.aoHalfRes).toBe(true);
    expect(high.bloom).toBe(true);
    expect(high.colorGrade).toBe(true);
    expect(high.shadowMapSize).toBe(2048);
  });

  it("ambient occlusion is enabled exactly on med + high and always half-res", () => {
    expect(QUALITY_PRESETS.low.aoEnabled).toBe(false);
    for (const level of ["med", "high"] as const) {
      const p = QUALITY_PRESETS[level];
      expect(p.aoEnabled).toBe(true);
      // Half-res AO keeps it Iris-Xe-safe (≈1 ms) at every level that runs it.
      expect(p.aoHalfRes).toBe(true);
    }
  });

  it("the composer runs at med + high and never at low", () => {
    expect(QUALITY_PRESETS.low.postprocessing).toBe(false);
    expect(QUALITY_PRESETS.med.postprocessing).toBe(true);
    expect(QUALITY_PRESETS.high.postprocessing).toBe(true);
  });

  it("cost knobs increase monotonically with level", () => {
    const { low, med, high } = QUALITY_PRESETS;
    expect(low.maxDpr).toBeLessThanOrEqual(med.maxDpr);
    expect(med.maxDpr).toBeLessThanOrEqual(high.maxDpr);
    expect(low.rainParticles).toBeLessThanOrEqual(med.rainParticles);
    expect(med.rainParticles).toBeLessThanOrEqual(high.rainParticles);
    expect(med.shadowMapSize).toBeLessThanOrEqual(high.shadowMapSize);
    expect(med.shadowRadiusM).toBeLessThanOrEqual(high.shadowRadiusM);
  });

  it("levels self-identify", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(QUALITY_PRESETS[level].level).toBe(level);
    }
  });
});

describe("medianFpsFromDeltas", () => {
  it("returns null with no usable samples", () => {
    expect(medianFpsFromDeltas([])).toBeNull();
    expect(medianFpsFromDeltas([0, -5, MAX_VALID_DELTA_MS + 1])).toBeNull();
  });

  it("computes fps from the median delta (odd and even counts)", () => {
    expect(medianFpsFromDeltas([16.67, 16.67, 16.67])).toBeCloseTo(60, 0);
    expect(medianFpsFromDeltas([10, 20])).toBeCloseTo(1000 / 15, 5);
  });

  it("is robust against GC/tab-switch stalls", () => {
    const steady = Array.from({ length: 100 }, () => 16.7);
    const withSpikes = [...steady, 500, 900, 240];
    const fps = medianFpsFromDeltas(withSpikes);
    expect(fps).not.toBeNull();
    expect(fps as number).toBeGreaterThan(55);
  });
});

describe("recommendQuality", () => {
  it("keeps the current level when the probe produced no evidence", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(recommendQuality({ dpr: 1.5, fpsMedian: null, currentLevel: level })).toBe(level);
    }
  });

  it("cold-start guess is med, or low on ultra-dense screens", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 2, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 3, fpsMedian: null })).toBe("low");
  });

  it("steps up exactly one level with clear headroom", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: 60, currentLevel: "low" })).toBe("med");
    expect(recommendQuality({ dpr: 1, fpsMedian: 60, currentLevel: "med" })).toBe("high");
    expect(recommendQuality({ dpr: 1, fpsMedian: 60, currentLevel: "high" })).toBe("high");
  });

  it("holds steady in the target band", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: 50, currentLevel: "med" })).toBe("med");
    expect(recommendQuality({ dpr: 1, fpsMedian: 48, currentLevel: "high" })).toBe("high");
  });

  it("steps down one level when struggling", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: 40, currentLevel: "high" })).toBe("med");
    expect(recommendQuality({ dpr: 1, fpsMedian: 40, currentLevel: "med" })).toBe("low");
    expect(recommendQuality({ dpr: 1, fpsMedian: 34, currentLevel: "low" })).toBe("low");
  });

  it("collapses straight to low when far below target", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: 25, currentLevel: "high" })).toBe("low");
    expect(recommendQuality({ dpr: 1, fpsMedian: 10, currentLevel: "med" })).toBe("low");
  });

  it("respects the documented band edges", () => {
    expect(recommendQuality({ dpr: 1, fpsMedian: 57, currentLevel: "med" })).toBe("high");
    expect(recommendQuality({ dpr: 1, fpsMedian: 56.9, currentLevel: "med" })).toBe("med");
    expect(recommendQuality({ dpr: 1, fpsMedian: 48, currentLevel: "med" })).toBe("med");
    expect(recommendQuality({ dpr: 1, fpsMedian: 47.9, currentLevel: "med" })).toBe("low");
    expect(recommendQuality({ dpr: 1, fpsMedian: 33.9, currentLevel: "high" })).toBe("low");
  });
});
