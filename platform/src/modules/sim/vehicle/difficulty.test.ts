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
  governorCapKmh,
  GOVERNOR_BAND_KMH,
  governorIsEasing,
  parseDifficultyMode,
  REQUIRED_SPEED_HEADROOM_KMH,
  storeDifficulty,
  THROTTLE_AUTHORITY_FADE_FROM_KMH,
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

  /**
   * `governorIsEasing` — THE READ CHANNEL THAT MAKES THE CAP SPEAKABLE
   * (2026-08-11).
   *
   * The governor has been taking the student's throttle away since the first
   * tier shipped and the product never said so: press harder, go no faster,
   * and the only reading available is „the car is broken". The cluster now
   * prints the cap and lights it while it bites — but a HUD flag that lit at a
   * different speed from the clamp would be a NEW lie, so these assert the two
   * against each other rather than against a re-derived inequality.
   */
  describe("governorIsEasing", () => {
    it("is true exactly where applyDifficulty actually loses throttle", () => {
      // Начинаещ in the 50 km/h city: cap 40, so the ease begins just above 34.
      const cap = governorCapKmh("beginner", 50)!;
      expect(cap).toBe(40);
      const start = cap - GOVERNOR_BAND_KMH;
      // The tier's authored authority, measured where nothing else shapes it:
      // above the creep band (12) and far below the motorway fade (100).
      const free = applyDifficulty(FULL, "beginner", start, DT, createDriveAssistState());
      expect(free.throttle).toBeCloseTo(DIFFICULTY_PRESETS.beginner.throttleMul, 5);
      expect(governorIsEasing(cap, start)).toBe(false);

      for (const kmh of [start + 0.1, start + 3, cap - 0.1]) {
        const shaped = applyDifficulty(FULL, "beginner", kmh, DT, createDriveAssistState());
        expect(shaped.throttle, `${kmh} km/h`).toBeLessThan(free.throttle);
        expect(shaped.throttle, `${kmh} km/h`).toBeGreaterThan(0);
        expect(governorIsEasing(cap, kmh), `${kmh} km/h`).toBe(true);
      }
      // …and at/over the cap, where the throttle is gone entirely.
      expect(applyDifficulty(FULL, "beginner", cap, DT, createDriveAssistState()).throttle).toBe(0);
      expect(governorIsEasing(cap, cap)).toBe(true);
    });

    it("reverse counts — the governor caps both directions, so the mark must too", () => {
      const cap = governorCapKmh("beginner", 50)!;
      expect(governorIsEasing(cap, -(cap - 1))).toBe(true);
      expect(governorIsEasing(cap, -1)).toBe(false);
    });

    it("no cap („Напреднал“) is never easing — the mark stays off, not zero", () => {
      expect(governorCapKmh("advanced", 50)).toBeNull();
      for (const kmh of [0, 60, 200]) expect(governorIsEasing(null, kmh)).toBe(false);
    });
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

describe("domain-scaled governor (founder review R3 #37 — the motorway drill)", () => {
  it("no threaded domain = the legacy static caps, byte-identically", () => {
    expect(governorCapKmh("beginner")).toBe(DIFFICULTY_PRESETS.beginner.speedCapKmh);
    expect(governorCapKmh("normal")).toBe(DIFFICULTY_PRESETS.normal.speedCapKmh);
    expect(governorCapKmh("advanced")).toBeNull();
    // Garbage domains degrade to the preset, never throw / never NaN.
    expect(governorCapKmh("normal", Number.NaN)).toBe(90);
    expect(governorCapKmh("normal", 0)).toBe(90);
    expect(governorCapKmh("normal", -5)).toBe(90);
  });

  it("Нормален on the АМ-140 map reaches the flow: full throttle at 140, cut by 150", () => {
    expect(governorCapKmh("normal", 140)).toBe(150);
    // At the drill's own ceiling (140) the governor band (144–150) is not yet
    // entered, so the governor takes nothing.
    //
    // RE-BASELINED 2026-07-30 (doc 86 L17): 0.75 → 1. This line used to assert
    // that the Нормален multiplier still bit at 140 km/h, which was precisely
    // the defect — `throttleMul` scales TRACTIVE FORCE, so at 0.75 the car's
    // equilibrium was 124.9 km/h and „full throttle at 140" was never a state
    // the student could actually be in. The multiplier now fades to 1 across
    // 100–118 km/h (THROTTLE_AUTHORITY_FADE_*), leaving the governor as the
    // only top-speed authority, so at 140 the pedal really is full. The two
    // things this test exists to protect are unchanged and still asserted: the
    // cap is 150, and the throttle is cut to zero there.
    const at140 = applyDifficulty(FULL, "normal", 140, DT, createDriveAssistState(), 140);
    expect(at140.throttle).toBeCloseTo(1, 5);
    // …and BELOW the fade band nothing moved: the authored 0.75 still applies.
    const at99 = applyDifficulty(FULL, "normal", 99, DT, createDriveAssistState(), 140);
    expect(at99.throttle).toBeCloseTo(0.75, 5);
    const at150 = applyDifficulty(FULL, "normal", 150, DT, createDriveAssistState(), 140);
    expect(at150.throttle).toBe(0);
  });

  it("Нормален in the 50-city governs ~60 but keeps the speeding mistake committable", () => {
    expect(governorCapKmh("normal", 50)).toBe(60);
    // The founder's original ruling: SPEEDING_OVER_LIMIT needs limit × 1.1
    // (= 55 in a 50-zone, rules/types.ts speedingGraceRatio) — the domain cap
    // must leave usable throttle above it so the mistake stays failable.
    const at55 = applyDifficulty(FULL, "normal", 55, DT, createDriveAssistState(), 50);
    expect(at55.throttle).toBeGreaterThan(0.5); // 5/6 of the shaped 0.75
    const at60 = applyDifficulty(FULL, "normal", 60, DT, createDriveAssistState(), 50);
    expect(at60.throttle).toBe(0);
  });

  it("Начинаещ keeps the training wheel: 40 in the 50-city (identical), 130 on the АМ", () => {
    expect(governorCapKmh("beginner", 50)).toBe(DIFFICULTY_PRESETS.beginner.speedCapKmh);
    expect(governorCapKmh("beginner", 140)).toBe(130);
    // Still UNDER the domain everywhere — a beginner can never speed.
    expect(governorCapKmh("beginner", 140)!).toBeLessThan(140);
  });

  it("полигон floor: the 20–30 domain never squeezes a cap below 30", () => {
    expect(governorCapKmh("beginner", 30)).toBe(30);
    // RE-BASELINED 2026-07-30 (doc 86 L17, founder item 5 „в Нормален мога да
    // карам само до 30 км/ч"). The four `lot-*` districts publish a 20 km/h
    // domain, so `20 + 10` collapsed onto DOMAIN_CAP_FLOOR_KMH and Нормален
    // governed at exactly the same 30 as Начинаещ — the tier selector was
    // inert there, and a 30 km/h ceiling reads as a broken car. Нормален now
    // has its own floor at the national in-town limit (NORMAL_CAP_FLOOR_KMH,
    // ЗДвП чл. 21): the default tier never governs below the speed the law
    // itself permits in a settlement. Only the 8 districts whose domain is
    // 20 or 30 move; 40 and above already cleared 50 by the formula.
    expect(governorCapKmh("normal", 30)).toBe(50);
    expect(governorCapKmh("normal", 20)).toBe(50);
    expect(governorCapKmh("beginner", 20)).toBe(30);
    // The tiers must be distinguishable again on the low-limit maps.
    expect(governorCapKmh("normal", 20)!).toBeGreaterThan(governorCapKmh("beginner", 20)!);
  });

  it("B7: a speed the LESSON requires floors the tier cap", () => {
    // sig-wave-v1: domain 50, `meta.scenario.wave.speedKmh` 50. Начинаещ's
    // 40 km/h cap (sustainable 39.1) made a 264 m block take 23.8 s against
    // the 19.01 s the lamp offsets are solved for — the phase slipped ~4.8 s
    // per block and the 2nd/3rd greens were unreachable on EVERY rung.
    expect(governorCapKmh("beginner", 50)).toBe(40);
    expect(governorCapKmh("beginner", 50, 50)).toBe(50 + REQUIRED_SPEED_HEADROOM_KMH);
    // One full governor band of headroom = undiminished throttle AT 50, not a
    // pedal already ramping to zero there.
    const at50 = applyDifficulty(FULL, "beginner", 50, DT, createDriveAssistState(), 50, 50);
    expect(at50.throttle).toBeCloseTo(DIFFICULTY_PRESETS.beginner.throttleMul, 5);
    // It is a FLOOR, never a ceiling: a required speed below the tier's own
    // cap changes nothing at all.
    expect(governorCapKmh("normal", 140, 50)).toBe(governorCapKmh("normal", 140));
    // …and garbage is ignored rather than governed to.
    expect(governorCapKmh("beginner", 50, Number.NaN)).toBe(40);
    expect(governorCapKmh("beginner", 50, 0)).toBe(40);
    expect(governorCapKmh("advanced", 50, 200)).toBeNull();
  });

  it("the throttle-authority fade cannot reach any non-motorway lesson", () => {
    // Every district domain in content/world is one of 20/30/40/50/70/90/140.
    // For all but 140 the Нормален cap is ≤ 100 = the fade's first km/h, and
    // the governor has already zeroed the throttle by then.
    for (const domain of [20, 30, 40, 50, 70, 90]) {
      const cap = governorCapKmh("normal", domain)!;
      expect(cap).toBeLessThanOrEqual(THROTTLE_AUTHORITY_FADE_FROM_KMH);
      for (const mode of ["beginner", "normal"] as const) {
        for (const kmh of [0, 10, 25, 40, 55, 75, 95]) {
          const withFade = applyDifficulty(
            FULL,
            mode,
            kmh,
            DT,
            createDriveAssistState(),
            domain,
          ).throttle;
          // Below 100 km/h the multiplier is the authored one, so the shaped
          // throttle is exactly preset.throttleMul × the governor's scale.
          const p = DIFFICULTY_PRESETS[mode];
          const capM = governorCapKmh(mode, domain)!;
          const over = kmh - (capM - 6);
          const gov = over > 0 ? Math.max(0, 1 - over / 6) : 1;
          const creep =
            kmh >= CREEP_CAP_END_KMH
              ? 1
              : p.creepThrottleCap +
                (1 - p.creepThrottleCap) * Math.max(0, (kmh - 4) / (CREEP_CAP_END_KMH - 4));
          expect(withFade, `${mode} @ ${kmh} on domain ${domain}`).toBeCloseTo(
            Math.min(p.throttleMul * gov, creep),
            5,
          );
        }
      }
    }
  });

  it("Напреднал stays uncapped in every domain", () => {
    const fast = applyDifficulty(FULL, "advanced", 200, DT, createDriveAssistState(), 140);
    expect(fast.throttle).toBeCloseTo(1, 5);
    expect(governorCapKmh("advanced", 50)).toBeNull();
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

  /**
   * THE READER IS GONE; THE WRITER'S CONTRACT IS WHAT MATTERED.
   *
   * `loadDifficulty` was deleted on 2026-08-26 (dead-predicate census): this
   * file was its only caller, and `LessonScene.tsx` states in as many words
   * why nothing else may have one — a tier is a choice about THIS drive, and
   * restoring it silently pinned every later scenario to the manual tier.
   *
   * What is still LIVE is `storeDifficulty`: the tier picker calls it on every
   * click (LessonScene `setDifficulty`). Its whole contract is that the key is
   * written ONLY on an explicit click, never eagerly with the default — that
   * is what let the 2026-07-19 default flip reach users who never touched the
   * selector — so that is what is asserted here.
   */
  it("storeDifficulty writes the explicit click, and only that", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    try {
      // Nothing is written before a click — a fresh user and an existing user
      // who never touched the selector must look identical, so both follow
      // whatever DEFAULT_DIFFICULTY currently says.
      expect(store.has(DIFFICULTY_STORAGE_KEY)).toBe(false);
      storeDifficulty("beginner");
      expect(store.get(DIFFICULTY_STORAGE_KEY)).toBe("beginner");
      storeDifficulty("advanced");
      expect(store.get(DIFFICULTY_STORAGE_KEY)).toBe("advanced");
      // …and whatever comes back out of that key is still parsed, never
      // trusted: this is the guard for a hand-edited or stale value.
      expect(parseDifficultyMode(store.get(DIFFICULTY_STORAGE_KEY))).toBe("advanced");
      store.set(DIFFICULTY_STORAGE_KEY, "turbo");
      expect(parseDifficultyMode(store.get(DIFFICULTY_STORAGE_KEY))).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never throws where there is no storage at all (node env / private mode)", () => {
    expect(() => storeDifficulty("normal")).not.toThrow();
  });
});
