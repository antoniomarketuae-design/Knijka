import { describe, expect, it } from "vitest";
import {
  MAX_VALID_DELTA_MS,
  MIN_PROMOTION_SAMPLES,
  QUALITY_PRESETS,
  autoQualityCeiling,
  isTouchOnlyDevice,
  ledgerFromSample,
  levelFromLedger,
  maxDprFor,
  medianFpsFromDeltas,
  TOUCH_MAX_DPR,
  recommendQuality,
  seedQualityFromSignals,
  unknownDeviceSignals,
  type DeviceSignals,
  type QualityLedger,
} from "../quality";

describe("QUALITY_PRESETS", () => {
  it("low is the no-extras safety net (no composer, no AO)", () => {
    const low = QUALITY_PRESETS.low;
    expect(low.shadows).toBe(false);
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

  // Art pass 2026-08-03 (register row B71). `low` used to be 0 / 0, so the one
  // lesson family whose SUBJECT is the weather rendered dry on a phone. What
  // this pins now is the FLOOR, not the absence: every tier has to be able to
  // show that it is raining or snowing, and `low` still has to be a small
  // fraction of the authored densities.
  it("gates snowfall exactly like rain, and both carry a phone-tier floor", () => {
    const { low, med, high } = QUALITY_PRESETS;
    for (const n of [low.rainParticles, low.snowParticles]) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(400);
    }
    expect(low.rainParticles).toBe(low.snowParticles);
    expect(med.snowParticles).toBeGreaterThan(0);
    expect(high.snowParticles).toBeGreaterThan(0);
    // …and the floor stays well under a third of the laptop tier.
    expect(low.rainParticles * 3).toBeLessThan(med.rainParticles);
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

// ---------------------------------------------------------------------------
// The three devices this heuristic is actually judged on. Every field is what
// the browser reports, not what the spec sheet says — the gap between those two
// IS the bug these tests pin.
// ---------------------------------------------------------------------------

/**
 * iPhone 16 (A18) on Safari. `deviceMemory` is Chromium-only so Apple reports
 * null; iOS Safari reports 4 logical cores; dpr is exactly 3.
 * A18 GPU vs the A16's Mali-G57 MP2 is roughly an order of magnitude — and NOT
 * ONE of these fields says so, which is why the seed defers to measurement.
 */
function iphone16(over: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    coarsePointer: true,
    anyFinePointer: false,
    deviceMemoryGb: null,
    hardwareConcurrency: 4,
    dpr: 3,
    ...over,
  };
}

/** Galaxy A16 (€125, Helio G99 / Mali-G57 MP2, 4 GB) — doc 82 §2.2's floor. */
const galaxyA16 = phone;

/** A high-DPI Windows laptop: 300% display scaling reports dpr 3. */
function hidpiLaptop(over: Partial<DeviceSignals> = {}): DeviceSignals {
  return laptop({ dpr: 3, ...over });
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

  it("never seeds a pointing device down on weak-looking specs", () => {
    expect(seedQualityFromSignals(laptop())).toBe("med");
    // A 4 GB / 4-thread laptop is weak, but it has a trackpad, and the seed's
    // job is to avoid an expensive first fetch, not to grade hardware. If it
    // really cannot hold med, the probe demotes it after one session.
    expect(
      seedQualityFromSignals(laptop({ deviceMemoryGb: 4, hardwareConcurrency: 4 })),
    ).toBe("med");
    // A touch laptop still reports a fine pointer somewhere.
    expect(seedQualityFromSignals(laptop({ coarsePointer: true }))).toBe("med");
  });

  it("still refuses 2 GB devices outright", () => {
    // 2 GB total: Chromium on Android caps a WASM heap at 256 MB (§2.1), so
    // this is not a tier choice, it is a context-loss forecast.
    expect(seedQualityFromSignals(laptop({ deviceMemoryGb: 2 }))).toBe("low");
    expect(seedQualityFromSignals(phone({ deviceMemoryGb: 2 }))).toBe("low");
  });

  it("does NOT condemn a pointing device for having a dense panel", () => {
    // The regression this whole change exists for. `dpr >= 3 → low` used to be
    // the FIRST rule, so a Windows laptop at 300% display scaling was served
    // the 725,950 B phone texture set on a discrete GPU. devicePixelRatio is
    // not a GPU signal: the Canvas is wired `dpr={[1, maxDpr]}`, so fill cost
    // is bounded by the preset's maxDpr (1.0/1.25/1.5), NOT by the panel.
    expect(seedQualityFromSignals(hidpiLaptop())).toBe("med");
    expect(seedQualityFromSignals(laptop({ dpr: 2 }))).toBe("med");
    // …and a dense panel still counts INSIDE the touch family, where it is a
    // "this is a phone" cue rather than a "this is weak" claim.
    expect(seedQualityFromSignals(phone({ dpr: 3 }))).toBe("low");
  });

  it("seeds EVERY touch-only device low — the 8 GB carve-out is gone", () => {
    // It used to read `touch-only AND deviceMemoryGb >= 8 → med`, on the theory
    // that a phone reporting Chromium's clamped 8 must be a flagship. Measured
    // on the production build over six phone profiles, `med` costs 2.4× the
    // draw calls (205.6 → 492.5/frame on iPhone-16 portrait) and a 1.56× larger
    // backing store, on a tier already 3.3× over the ≤150 draw budget. And 8 GB
    // is mid-range silicon in 2026, so the rule was inferring a GPU from a RAM
    // figure. The FPS probe is mounted now: a real flagship pays `low` for one
    // session and is promoted on evidence (see ledgerFromSample below).
    expect(seedQualityFromSignals(phone({ deviceMemoryGb: 8, hardwareConcurrency: 8 }))).toBe(
      "low",
    );
    expect(seedQualityFromSignals(galaxyA16())).toBe("low");
    // A tablet is a touch-only device too, and it climbs the same way.
    expect(
      seedQualityFromSignals(phone({ deviceMemoryGb: 8, hardwareConcurrency: 8, dpr: 2 })),
    ).toBe("low");
  });

  it("falls back to med when the browser exposes nothing", () => {
    expect(seedQualityFromSignals(unknownDeviceSignals(1))).toBe("med");
    expect(seedQualityFromSignals(unknownDeviceSignals(1.5))).toBe("med");
    // Was "low". With no pointer evidence at all this is not a phone claim —
    // and the only environments that expose no matchMedia are SSR/jsdom.
    expect(seedQualityFromSignals(unknownDeviceSignals(3))).toBe("med");
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

  it("cold-start guess is med when the device says nothing about itself", () => {
    // dpr no longer decides anything on its own, at any value: without pointer
    // evidence there is no phone claim to make.
    expect(recommendQuality({ dpr: 1, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 2, fpsMedian: null })).toBe("med");
    expect(recommendQuality({ dpr: 3, fpsMedian: null })).toBe("med");
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

// ---------------------------------------------------------------------------
// Cross-session promotion — the half doc 82 §8 recorded as never wired.
// ---------------------------------------------------------------------------

describe("autoQualityCeiling", () => {
  it("caps every touch-only device at med, forever", () => {
    // doc 82 §2.2: "Do not raise the phone dpr cap. dpr 1.5 is 2.25× the fill
    // and destroys the parity the whole budget rests on." `high` IS a
    // maxDpr-1.5 tier, so no amount of measured headroom entitles a handset.
    expect(QUALITY_PRESETS.high.maxDpr).toBeGreaterThan(QUALITY_PRESETS.med.maxDpr);
    expect(autoQualityCeiling(iphone16())).toBe("med");
    expect(autoQualityCeiling(galaxyA16())).toBe("med");
    expect(autoQualityCeiling(laptop())).toBe("high");
    expect(autoQualityCeiling(hidpiLaptop())).toBe("high");
  });

  it("treats a touch laptop as a pointing device, not a phone", () => {
    expect(isTouchOnlyDevice(laptop({ coarsePointer: true }))).toBe(false);
    expect(autoQualityCeiling(laptop({ coarsePointer: true }))).toBe("high");
    expect(isTouchOnlyDevice(iphone16())).toBe(true);
  });
});

describe("maxDprFor", () => {
  it("renders a handset 1:1 with its CSS pixels on EVERY tier", () => {
    // The ceiling only bound `auto`. A device promoted to med by measurement,
    // or a student choosing a tier by hand, still reached maxDpr 1.25 — a
    // measured 1.56× backing store (492,195 px vs 315,172 px at the iPhone-16
    // landscape viewport, production build, 2026-08-12). doc 82 §2.2's ruling
    // is about the DEVICE, so the cap now is too.
    for (const level of ["low", "med", "high"] as const) {
      expect(maxDprFor(level, iphone16())).toBe(TOUCH_MAX_DPR);
      expect(maxDprFor(level, galaxyA16())).toBe(TOUCH_MAX_DPR);
    }
  });

  it("leaves every pointing device exactly as it was", () => {
    for (const level of ["low", "med", "high"] as const) {
      expect(maxDprFor(level, laptop())).toBe(QUALITY_PRESETS[level].maxDpr);
      // Including the 300%-scaled Windows laptop the old dpr rule condemned.
      expect(maxDprFor(level, hidpiLaptop())).toBe(QUALITY_PRESETS[level].maxDpr);
      expect(maxDprFor(level, laptop({ coarsePointer: true }))).toBe(
        QUALITY_PRESETS[level].maxDpr,
      );
    }
  });

  it("never raises a cap — it is a clamp, not a setting", () => {
    expect(maxDprFor("low", laptop())).toBe(1);
    expect(maxDprFor("low", iphone16())).toBe(1);
    expect(TOUCH_MAX_DPR).toBeLessThanOrEqual(QUALITY_PRESETS.low.maxDpr);
  });
});

/** A measurement window with a healthy sample count at `level`. */
function sample(level: "low" | "med" | "high", fpsMedian: number, samples = 240) {
  return { level, fpsMedian, samples };
}

describe("ledgerFromSample", () => {
  it("promotes a device sitting on its vsync ceiling, one step", () => {
    expect(ledgerFromSample(null, sample("low", 60), "med")).toEqual({
      earned: "med",
      failedAt: null,
    });
    expect(ledgerFromSample(null, sample("med", 60), "high")).toEqual({
      earned: "high",
      failedAt: null,
    });
  });

  it("never promotes past the ceiling — a phone stops at med", () => {
    expect(ledgerFromSample({ earned: "med", failedAt: null }, sample("med", 60), "med")).toEqual({
      earned: "med",
      failedAt: null,
    });
  });

  it("refuses to promote on a thin sample window", () => {
    // Demotion may act on the smaller window; climbing must earn a full one.
    const thin = { level: "low" as const, fpsMedian: 60, samples: MIN_PROMOTION_SAMPLES - 1 };
    expect(ledgerFromSample(null, thin, "med").earned).toBe("low");
    expect(ledgerFromSample(null, sample("low", 60, MIN_PROMOTION_SAMPLES), "med").earned).toBe(
      "med",
    );
  });

  it("does NOT promote the Galaxy A16 hitting its own 30 fps budget", () => {
    // doc 82 §2.2 sets the phone target at "30 flat (floor 24) — do not chase
    // 60". The reference device meeting that target scores ~30, nowhere near
    // the 57 promotion bar, so it is left exactly where it is.
    for (const fps of [24, 30, 33]) {
      expect(ledgerFromSample(null, sample("low", fps), "med").earned).toBe("low");
    }
  });

  it("holds a tier that is meeting its target", () => {
    expect(ledgerFromSample(null, sample("med", 50), "high").earned).toBe("med");
    expect(ledgerFromSample(null, sample("high", 48), "high").earned).toBe("high");
  });

  it("demotes a tier that fails, and remembers the failure", () => {
    expect(ledgerFromSample(null, sample("med", 40), "high")).toEqual({
      earned: "low",
      failedAt: "med",
    });
    expect(ledgerFromSample(null, sample("high", 20), "high")).toEqual({
      earned: "low",
      failedAt: "high",
    });
  });

  it("never marks `low` as failed — the floor has nothing under it", () => {
    // A 4 s window at 12 fps says the session was bad, not that the device
    // cannot run the simulator at all; and there is no tier to fall back to.
    expect(ledgerFromSample(null, sample("low", 12), "med")).toEqual({
      earned: "low",
      failedAt: null,
    });
  });

  it("converges instead of oscillating low → med → low forever", () => {
    // A borderline phone: clears 57 at low, then drowns at med. Without the
    // failure record it would flip tier every session for life.
    const up = ledgerFromSample(null, sample("low", 58), "med");
    expect(up.earned).toBe("med");
    const down = ledgerFromSample(up, sample("med", 30), "med");
    expect(down).toEqual({ earned: "low", failedAt: "med" });
    // The same device clears 57 at low again next session — and is refused.
    expect(ledgerFromSample(down, sample("low", 60), "med")).toEqual({
      earned: "low",
      failedAt: "med",
    });
  });

  it("keeps the LOWEST failure ever recorded", () => {
    const prev: QualityLedger = { earned: "med", failedAt: "high" };
    expect(ledgerFromSample(prev, sample("med", 20), "high").failedAt).toBe("med");
    const lower: QualityLedger = { earned: "low", failedAt: "med" };
    expect(ledgerFromSample(lower, sample("high", 20), "high").failedAt).toBe("med");
  });
});

describe("levelFromLedger", () => {
  it("reduces to the seed on a first visit", () => {
    expect(levelFromLedger("low", null, "med")).toBe("low");
    expect(levelFromLedger("med", null, "high")).toBe("med");
  });

  it("lets measurement overrule the guess in BOTH directions", () => {
    expect(levelFromLedger("low", { earned: "med", failedAt: null }, "med")).toBe("med");
    expect(levelFromLedger("med", { earned: "low", failedAt: "med" }, "high")).toBe("low");
  });

  it("re-applies the ceiling and the failure record to stored values", () => {
    // A ledger written before the device was understood as touch-only, or by an
    // older build: the clamp is re-derived on read, never trusted from storage.
    expect(levelFromLedger("low", { earned: "high", failedAt: null }, "med")).toBe("med");
    expect(levelFromLedger("med", { earned: "high", failedAt: "med" }, "high")).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// The three devices, end to end. This is the table the change is judged on.
// ---------------------------------------------------------------------------

/** The cold start for a device, given whatever it has measured so far. */
function coldStart(signals: DeviceSignals, ledger: QualityLedger | null = null) {
  return levelFromLedger(seedQualityFromSignals(signals), ledger, autoQualityCeiling(signals));
}

describe("device outcomes (before → after)", () => {
  it("iPhone 16: pinned to low forever → low once, then med for life", () => {
    // BEFORE: `dpr >= 3` was the FIRST rule, so an A18 was condemned on the
    // first signal, and doc 82 §8 records that nothing was mounted to promote
    // it. It fetched 725,950 B of textures on every visit, permanently.
    const device = iphone16();
    // AFTER, visit 1: still low. Nothing synchronous separates an A18 from a
    // Mali-G57, so the first fetch stays cheap. Deliberate.
    expect(coldStart(device)).toBe("low");
    // It then measures ~60 fps at low ("the FPS works perfectly flawlessly").
    const afterDrive = ledgerFromSample(null, sample("low", 60), autoQualityCeiling(device));
    // Visit 2 onward: med — full facade/ground maps, HDR IBL, shadows, AO,
    // bloom, grade. The founder's actual complaint, fixed.
    expect(coldStart(device, afterDrive)).toBe("med");
    // And it stops there, however good it is: no handset gets maxDpr 1.5.
    const atMed = ledgerFromSample(afterDrive, sample("med", 60), autoQualityCeiling(device));
    expect(coldStart(device, atMed)).toBe("med");
  });

  it("Galaxy A16: low before, low after, and it cannot be talked out of it", () => {
    // The safety statement. Every number in doc 82 §2.2 is a prediction until
    // an A16 log lands (§2.4), so this change must be a no-op on that class.
    const device = galaxyA16();
    expect(coldStart(device)).toBe("low");
    // Meeting its own 30 fps budget does not promote it…
    const met = ledgerFromSample(null, sample("low", 30), autoQualityCeiling(device));
    expect(coldStart(device, met)).toBe("low");
    // …and if it ever did reach med and struggle, it comes straight back down
    // and stays down.
    const failed = ledgerFromSample(
      { earned: "med", failedAt: null },
      sample("med", 28),
      autoQualityCeiling(device),
    );
    expect(coldStart(device, failed)).toBe("low");
  });

  it("desktop: med before, med at cold start, high once measured", () => {
    const device = laptop();
    expect(coldStart(device)).toBe("med");
    const afterDrive = ledgerFromSample(null, sample("med", 60), autoQualityCeiling(device));
    expect(coldStart(device, afterDrive)).toBe("high");
  });

  it("high-DPI laptop: low before (the collateral bug) → med, and can reach high", () => {
    const device = hidpiLaptop();
    expect(coldStart(device)).toBe("med");
    const afterDrive = ledgerFromSample(null, sample("med", 60), autoQualityCeiling(device));
    expect(coldStart(device, afterDrive)).toBe("high");
  });
});
