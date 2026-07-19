import { describe, expect, it, vi } from "vitest";
import {
  applyDifficulty,
  CRAWL_BRAKE_END_KMH,
  CREEP_CAP_END_KMH,
  createDriveAssistState,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  DIFFICULTY_STORAGE_KEY,
  FULL_LOCK_FADE_END_KMH,
  loadDifficulty,
  parseDifficultyMode,
  storeDifficulty,
} from "./difficulty";
import type { VehicleInput } from "./VehicleSim";

const FULL: VehicleInput = { throttle: 1, brake: 0, steer: 1, handbrake: false };
const DT = 1 / 60;

/** Converged steer output after many steps at a constant speed. */
function steerConverged(mode: "beginner" | "normal" | "advanced", speedKmh: number): number {
  const state = createDriveAssistState();
  let s = 0;
  for (let i = 0; i < 400; i++) s = applyDifficulty(FULL, mode, speedKmh, DT, state).steer;
  return s;
}

describe("applyDifficulty", () => {
  it("beginner halves+eases throttle vs advanced (above the creep band)", () => {
    // 20 km/h: creep ceiling fully faded — the authored street shaping rules.
    const b = applyDifficulty(FULL, "beginner", 20, DT, createDriveAssistState());
    // beginner: 1^2 * 0.5 = 0.5
    expect(b.throttle).toBeCloseTo(0.5, 5);
    const a = applyDifficulty(FULL, "advanced", 20, DT, createDriveAssistState());
    expect(a.throttle).toBeCloseTo(1, 5);
  });

  it("eased curve makes partial throttle gentler in beginner", () => {
    // input 0.5: beginner 0.5^2*0.5 = 0.125 ; advanced linear 0.5
    const b = applyDifficulty(
      { ...FULL, throttle: 0.5 },
      "beginner",
      0,
      DT,
      createDriveAssistState(),
    );
    expect(b.throttle).toBeCloseTo(0.125, 5);
  });

  it("S0 creep ceiling: held key at crawl is capped, gone by the band end", () => {
    const cap = DIFFICULTY_PRESETS.beginner.creepThrottleCap;
    const atRest = applyDifficulty(FULL, "beginner", 0, DT, createDriveAssistState());
    expect(atRest.throttle).toBeCloseTo(cap, 5);
    // Reverse creep is shaped identically (signed speed).
    const reversing = applyDifficulty(FULL, "beginner", -2, DT, createDriveAssistState());
    expect(reversing.throttle).toBeCloseTo(cap, 5);
    // Above the band: the authored beginner shaping (0.5) is back.
    const out = applyDifficulty(FULL, "beginner", CREEP_CAP_END_KMH, DT, createDriveAssistState());
    expect(out.throttle).toBeCloseTo(0.5, 5);
    // Advanced is the raw realism tier — no creep shaping at all.
    const adv = applyDifficulty(FULL, "advanced", 0, DT, createDriveAssistState());
    expect(adv.throttle).toBeCloseTo(1, 5);
  });

  it("governor cuts throttle to zero at/over the speed cap", () => {
    const cap = DIFFICULTY_PRESETS.beginner.speedCapKmh!;
    const atCap = applyDifficulty(FULL, "beginner", cap, DT, createDriveAssistState());
    expect(atCap.throttle).toBe(0);
    const over = applyDifficulty(FULL, "beginner", cap + 20, DT, createDriveAssistState());
    expect(over.throttle).toBe(0);
    // well below cap (and above the creep band): full (halved) throttle
    const below = applyDifficulty(FULL, "beginner", 15, DT, createDriveAssistState());
    expect(below.throttle).toBeCloseTo(0.5, 5);
  });

  it("advanced has no speed governor", () => {
    const fast = applyDifficulty(FULL, "advanced", 200, DT, createDriveAssistState());
    expect(fast.throttle).toBeCloseTo(1, 5);
  });

  it("steering low-passes toward the (scaled) target over time", () => {
    const state = createDriveAssistState();
    const first = applyDifficulty(FULL, "beginner", 30, DT, state).steer;
    // one 1/60s step → far from the street-speed 0.6 target
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.6);
    // many steps at 30 km/h (above the full-lock fade) → converges to 0.6
    expect(steerConverged("beginner", 30)).toBeCloseTo(0.6, 2);
  });

  it("S0 full-lock unlock: sens is 1 in every mode at parking speed", () => {
    // Below FULL_LOCK_BELOW_KMH the beginner reaches FULL lock — without this
    // the 0.6 sens capped the road-wheel angle at ~21° and the turning circle
    // ballooned past 7 m (the полигон bay is geometrically impossible there).
    expect(steerConverged("beginner", 4)).toBeCloseTo(1.0, 2);
    expect(steerConverged("normal", 4)).toBeCloseTo(1.0, 2);
    expect(steerConverged("advanced", 4)).toBeCloseTo(1.0, 2);
    // …and the authored street sens is fully restored past the fade band.
    expect(steerConverged("beginner", FULL_LOCK_FADE_END_KMH + 6)).toBeCloseTo(0.6, 2);
    expect(steerConverged("normal", FULL_LOCK_FADE_END_KMH + 6)).toBeCloseTo(0.8, 2);
  });

  it("S0 crawl steering responds fast (tau floor), street smoothing intact", () => {
    // At 3 km/h the beginner low-pass floors at PARKING_STEER_TAU_S: within
    // 0.5 s the wheel must be at >= 95% of lock. With the street tau (0.25 s)
    // it would sit near 86% — mushy exactly where shuffling matters.
    const state = createDriveAssistState();
    let s = 0;
    for (let i = 0; i < 30; i++) s = applyDifficulty(FULL, "beginner", 3, DT, state).steer;
    expect(s).toBeGreaterThan(0.95);
  });

  it("brake passes through at street speed; S0 crawl ceiling below the band", () => {
    // 20 km/h — above CRAWL_BRAKE_END_KMH: untouched (emergency stops keep
    // the full 11 000 N).
    const street = applyDifficulty(
      { throttle: 0, brake: 0.8, steer: 0, handbrake: true },
      "normal",
      20,
      DT,
      createDriveAssistState(),
    );
    expect(street.brake).toBeCloseTo(0.8, 5);
    expect(street.handbrake).toBe(true);
    // Walking pace: the binary-key slam is capped at the preset ceiling.
    const crawl = applyDifficulty(
      { throttle: 0, brake: 1, steer: 0, handbrake: false },
      "normal",
      3,
      DT,
      createDriveAssistState(),
    );
    expect(crawl.brake).toBeCloseTo(DIFFICULTY_PRESETS.normal.crawlBrakeCap, 5);
    // Advanced (realism tier): full brake at any speed.
    const adv = applyDifficulty(
      { throttle: 0, brake: 1, steer: 0, handbrake: false },
      "advanced",
      3,
      DT,
      createDriveAssistState(),
    );
    expect(adv.brake).toBeCloseTo(1, 5);
    // Sanity: the ceiling is fully gone at the band end.
    const bandEnd = applyDifficulty(
      { throttle: 0, brake: 1, steer: 0, handbrake: false },
      "normal",
      CRAWL_BRAKE_END_KMH,
      DT,
      createDriveAssistState(),
    );
    expect(bandEnd.brake).toBeCloseTo(1, 5);
  });
});

describe("default difficulty (founder ruling 2026-07-19)", () => {
  it("defaults to normal — the default tier must let speeding mistakes happen", () => {
    expect(DEFAULT_DIFFICULTY).toBe("normal");
    // The trap that forced the flip: beginner's 40 km/h governor sits below
    // the graced street threshold (50 × 1.1 = 55, rules/types.ts), so
    // SPEEDING_OVER_LIMIT could never fire — the default tier's cap must
    // clear it so the mistake is committable (and gradable).
    const cap = DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY].speedCapKmh;
    expect(cap === null || cap > 55).toBe(true);
    expect(DIFFICULTY_PRESETS.beginner.speedCapKmh).toBeLessThan(55);
  });

  it("parseDifficultyMode: valid modes round-trip, everything else → null", () => {
    for (const m of ["beginner", "normal", "advanced"] as const) {
      expect(parseDifficultyMode(m)).toBe(m);
    }
    expect(parseDifficultyMode(null)).toBeNull();
    expect(parseDifficultyMode("")).toBeNull();
    expect(parseDifficultyMode("expert")).toBeNull();
    expect(parseDifficultyMode(2)).toBeNull();
  });

  it("loadDifficulty: no storage at all (node env) → the default", () => {
    expect(loadDifficulty()).toBe(DEFAULT_DIFFICULTY);
  });

  it("explicit stored choice is authoritative; absent/garbage → default", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    try {
      // Nothing stored (fresh user OR an existing user who never clicked the
      // selector — the key is only ever written on an explicit click, so both
      // look identical here): the new default applies.
      expect(loadDifficulty()).toBe(DEFAULT_DIFFICULTY);
      // Explicit click persists and stays authoritative over the default.
      storeDifficulty("beginner");
      expect(store.get(DIFFICULTY_STORAGE_KEY)).toBe("beginner");
      expect(loadDifficulty()).toBe("beginner");
      // Corrupted value degrades to the default, never throws.
      store.set(DIFFICULTY_STORAGE_KEY, "turbo");
      expect(loadDifficulty()).toBe(DEFAULT_DIFFICULTY);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
