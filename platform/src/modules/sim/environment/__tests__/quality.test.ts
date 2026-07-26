import { describe, expect, it } from "vitest";
import {
  MAX_VALID_DELTA_MS,
  QUALITY_PRESETS,
  medianFpsFromDeltas,
  recommendQuality,
  seedQualityFromSignals,
  unknownDeviceSignals,
  type DeviceSignals,
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

  it("med runs a lean composer: half-res AO + tight bloom + grade + SMAA", () => {
    const med = QUALITY_PRESETS.med;
    expect(med.shadows).toBe(true);
    expect(med.shadowMapSize).toBe(1024);
    expect(med.rainParticles).toBeGreaterThan(0);
    expect(med.postprocessing).toBe(true);
    expect(med.aoEnabled).toBe(true);
    expect(med.aoHalfRes).toBe(true);
    // Bloom is the cheapest "looks expensive" lever — on at med (mipmap bloom
    // is ≈0.5 ms). The color grade rides in the SAME merged fullscreen pass
    // as SMAA + tone mapping, so med (most students) gets it too (doc 71).
    expect(med.bloom).toBe(true);
    expect(med.colorGrade).toBe(true);
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
    expect(low.snowParticles).toBeLessThanOrEqual(med.snowParticles);
    expect(med.snowParticles).toBeLessThanOrEqual(high.snowParticles);
    expect(med.shadowMapSize).toBeLessThanOrEqual(high.shadowMapSize);
    expect(med.shadowRadiusM).toBeLessThanOrEqual(high.shadowRadiusM);
  });

  it("gates snowfall exactly like rain: none at low, on at med + high", () => {
    expect(QUALITY_PRESETS.low.snowParticles).toBe(0);
    expect(QUALITY_PRESETS.med.snowParticles).toBeGreaterThan(0);
    expect(QUALITY_PRESETS.high.snowParticles).toBeGreaterThan(0);
  });

  it("levels self-identify", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(QUALITY_PRESETS[level].level).toBe(level);
    }
  });

  it("gates the facade texture budget by tier (the dominant post-facade cost)", () => {
    // high keeps the full authored look; med drops the ORM but keeps relief;
    // low is albedo + emissive only.
    expect(QUALITY_PRESETS.high.facadeMaps).toBe("full");
    expect(QUALITY_PRESETS.med.facadeMaps).toBe("colorNormal");
    expect(QUALITY_PRESETS.low.facadeMaps).toBe("colorOnly");
  });

  it("enables real clearcoat only at high (med/low fall back to glossy standard)", () => {
    expect(QUALITY_PRESETS.high.clearcoat).toBe(true);
    expect(QUALITY_PRESETS.med.clearcoat).toBe(false);
    expect(QUALITY_PRESETS.low.clearcoat).toBe(false);
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

/** A mid-range Android as the browser reports it: touch-only, HiDPI, 4 GB. */
function phone(over: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    coarsePointer: true,
    anyFinePointer: false,
    deviceMemoryGb: 4,
    hardwareConcurrency: 8, // the A16's Helio G99 is 2×A76 + 6×A55
    dpr: 2.625,
    ...over,
  };
}

/** A laptop as the browser reports it: fine pointer, 8 GB (Chrome's cap). */
function laptop(over: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    coarsePointer: false,
    anyFinePointer: true,
    deviceMemoryGb: 8,
    hardwareConcurrency: 8,
    dpr: 1,
    ...over,
  };
}

describe("seedQualityFromSignals", () => {
  it("seeds the Galaxy A16 reference device to low", () => {
    // The whole point of doc 82 §2.3 fix 2: this decision has to be reachable
    // BEFORE the first fetch, because `low` is a download tier (725,950 B)
    // and `med` is a 5,950,303 B one.
    expect(seedQualityFromSignals(phone())).toBe("low");
  });

  it("catches a phone even when only ONE phone signal is legible", () => {
    // Firefox Android: no deviceMemory. Still a phone.
    expect(seedQualityFromSignals(phone({ deviceMemoryGb: null }))).toBe("low");
    // A dpr-1.5 tablet with 4 GB — the panel alone would not convict it.
    expect(seedQualityFromSignals(phone({ dpr: 1.5, hardwareConcurrency: null }))).toBe("low");
    // Two big cores, whatever else it claims.
    expect(
      seedQualityFromSignals(phone({ dpr: 1, deviceMemoryGb: null, hardwareConcurrency: 4 })),
    ).toBe("low");
  });

  it("never seeds a pointing device down — a wrong low does not self-correct", () => {
    expect(seedQualityFromSignals(laptop())).toBe("med");
    // A 4 GB / 4-thread laptop is weak, but it has a trackpad and the FPS
    // probe is not mounted on the shipped path, so a `low` seed would stick
    // forever. The graphics selector is the remedy there, not a guess.
    expect(
      seedQualityFromSignals(laptop({ deviceMemoryGb: 4, hardwareConcurrency: 4 })),
    ).toBe("med");
    // A touch laptop still reports a fine pointer somewhere.
    expect(seedQualityFromSignals(laptop({ coarsePointer: true }))).toBe("med");
  });

  it("still refuses ultra-dense panels and 2 GB devices outright", () => {
    expect(seedQualityFromSignals(laptop({ dpr: 3 }))).toBe("low");
    // 2 GB total: Chromium on Android caps a WASM heap at 256 MB (§2.1), so
    // this is not a tier choice, it is a context-loss forecast.
    expect(seedQualityFromSignals(laptop({ deviceMemoryGb: 2 }))).toBe("low");
  });

  it("falls back to med when the browser exposes nothing", () => {
    expect(seedQualityFromSignals(unknownDeviceSignals(1))).toBe("med");
    expect(seedQualityFromSignals(unknownDeviceSignals(1.5))).toBe("med");
    expect(seedQualityFromSignals(unknownDeviceSignals(3))).toBe("low");
  });

  it("never seeds high — a cold start has no evidence of headroom", () => {
    const beefy = laptop({ deviceMemoryGb: 8, hardwareConcurrency: 32, dpr: 1 });
    expect(seedQualityFromSignals(beefy)).toBe("med");
  });
});

describe("recommendQuality", () => {
  it("keeps the current level when the probe produced no evidence", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(recommendQuality({ dpr: 1.5, fpsMedian: null, currentLevel: level })).toBe(level);
    }
  });

  it("cold-start guess is med, or low on ultra-dense screens", () => {
    // Unchanged with no device evidence: dpr alone still decides. doc 82 §8
    // expected this row to need updating — it does not, because the seed
    // reduces to exactly the shipped rule when every other signal is unknown.
    expect(recommendQuality({ dpr: 1, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 2, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 3, fpsMedian: null })).toBe("low");
  });

  it("defers the cold start to the device seed when signals are supplied", () => {
    // A dpr-2 panel that is ALSO touch-only is a phone, and now reads as one —
    // the case the dpr-only rule above got wrong.
    expect(
      recommendQuality({ dpr: 2, fpsMedian: null, signals: phone({ dpr: 2 }) }),
    ).toBe("low");
    // With an fps median the signals are irrelevant: measurement beats guess.
    expect(
      recommendQuality({
        dpr: 2,
        fpsMedian: 60,
        currentLevel: "low",
        signals: phone({ dpr: 2 }),
      }),
    ).toBe("med");
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
