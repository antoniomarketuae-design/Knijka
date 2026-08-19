import { beforeEach, describe, expect, it } from "vitest";
import {
  FOG_IN_PER_SEC,
  PRIME_DT_SEC,
  RAIN_IN_PER_SEC,
  SNOW_IN_PER_SEC,
  WETNESS_IN_PER_SEC,
  WETNESS_OUT_PER_SEC,
  getFogIntensity,
  getRainIntensity,
  getSnowIntensity,
  getWetness,
  primeWeather,
  resetWeather,
  setWeatherTarget,
  stepWeather,
  wetnessToRoadParams,
} from "../weather";

function run(seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepWeather(dt);
}

/** Every channel at once — the shape the „did anything else move?" assertions
 *  compare, so a leak into a channel nobody named cannot hide behind a test
 *  that only looked at the channel it set. */
function channels(): { wetness: number; rain: number; fog: number; snow: number } {
  return {
    wetness: getWetness(),
    rain: getRainIntensity(),
    fog: getFogIntensity(),
    snow: getSnowIntensity(),
  };
}

describe("weather channel", () => {
  beforeEach(() => resetWeather());

  it("starts bone dry", () => {
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
  });

  it("ramps wetness at the documented rate while raining", () => {
    setWeatherTarget(true, false, false);
    run(1);
    expect(getWetness()).toBeCloseTo(WETNESS_IN_PER_SEC, 2);
    run(1 / WETNESS_IN_PER_SEC); // more than enough to saturate
    expect(getWetness()).toBe(1);
  });

  it("rain intensity leads wetness (clouds before puddles)", () => {
    setWeatherTarget(true, false, false);
    run(1);
    expect(getRainIntensity()).toBeCloseTo(RAIN_IN_PER_SEC, 2);
    expect(getRainIntensity()).toBeGreaterThan(getWetness());
  });

  it("dries out slower than it soaks (asymmetric rates)", () => {
    expect(WETNESS_OUT_PER_SEC).toBeLessThan(WETNESS_IN_PER_SEC);
    setWeatherTarget(true, false, false);
    run(6); // fully wet
    setWeatherTarget(false, false, false);
    run(1);
    expect(getWetness()).toBeCloseTo(1 - WETNESS_OUT_PER_SEC, 2);
    run(1 / WETNESS_OUT_PER_SEC);
    expect(getWetness()).toBe(0);
  });

  it("stays clamped to 0..1 under huge steps", () => {
    setWeatherTarget(true, false, false);
    stepWeather(999);
    expect(getWetness()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getWetness()).toBe(0);
  });

  it("ignores non-positive dt", () => {
    setWeatherTarget(true, false, false);
    stepWeather(0);
    stepWeather(-1);
    expect(getWetness()).toBe(0);
  });

  it("FOG channel: ramps at the documented rate, independent of rain/wetness", () => {
    setWeatherTarget(false, true, false);
    run(1);
    expect(getFogIntensity()).toBeCloseTo(FOG_IN_PER_SEC, 2);
    // Fog does NOT wet the road and brings no rain.
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
    run(1 / FOG_IN_PER_SEC); // more than enough to saturate
    expect(getFogIntensity()).toBe(1);
    // Clearing the fog flag lifts the bank.
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getFogIntensity()).toBe(0);
  });

  it("FOG channel: clamps and resets like the rain channels", () => {
    setWeatherTarget(true, true, false);
    stepWeather(999);
    expect(getFogIntensity()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    resetWeather();
    expect(getFogIntensity()).toBe(0);
  });

  it("SNOW channel: ramps at the documented rate, independent of rain/fog/wetness", () => {
    setWeatherTarget(false, false, true);
    run(1);
    expect(getSnowIntensity()).toBeCloseTo(SNOW_IN_PER_SEC, 2);
    // Snow does NOT wet the road (the honest scope cut) and brings no rain/fog.
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
    expect(getFogIntensity()).toBe(0);
    run(1 / SNOW_IN_PER_SEC); // more than enough to saturate
    expect(getSnowIntensity()).toBe(1);
    // Clearing the snow flag stops the snowfall.
    setWeatherTarget(false, false, false);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(0);
  });

  it("SNOW channel: clamps and resets like the other channels", () => {
    setWeatherTarget(true, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    resetWeather();
    expect(getSnowIntensity()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NO CHANNEL IS CLEARED BY A CALLER THAT DID NOT NAME IT
//
// The store is a module-level singleton with three writers. `fog` and `snow`
// shipped as defaulted trailing parameters so the callers that predated them
// stayed byte-identical, and the previous version of this file asserted that
// default as a FEATURE („the additive API"): `setWeatherTarget(false)` was
// tested to clear the fog. It is not additive — it is destructive, and it is
// the mechanism by which a rendered condition vanishes from a lesson without
// anyone getting an error, which is the shape of every sweep161 finding on
// this file. The parameters are now required, so the compiler is the guard;
// what stays testable at runtime is the pair of directions.
// ---------------------------------------------------------------------------

describe("weather channel: a named channel survives, an unnamed one is a type error", () => {
  beforeEach(() => resetWeather());

  it("SILENT CLEAR IS UNTYPEABLE: every channel must be named at the call site", () => {
    // @ts-expect-error — `setWeatherTarget(true)` used to compile and meant
    // „rain, AND stop the snow, AND lift the fog". Restoring the defaults on
    // setWeatherTarget makes this directive unused and turns tsc red.
    expect(() => setWeatherTarget(true)).not.toThrow();
    // @ts-expect-error — two arguments is the same hazard one channel later.
    expect(() => setWeatherTarget(true, true)).not.toThrow();
  });

  it("DIRECTION 1 — a channel the caller keeps asserting is NOT disturbed", () => {
    setWeatherTarget(false, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    // Rain starts while the snow is still authored: the snow must hold at 1.
    setWeatherTarget(true, false, true);
    run(4);
    expect(getSnowIntensity()).toBe(1);
    expect(getRainIntensity()).toBeGreaterThan(0);
  });

  it("DIRECTION 2 — a channel the caller drops DOES clear (no stuck weather)", () => {
    setWeatherTarget(false, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    // Same call, snow dropped: it must decay, not stick. A guard that only
    // proved direction 1 would be satisfied by a store that ignores the flag.
    setWeatherTarget(true, false, false);
    run(1);
    expect(getSnowIntensity()).toBeLessThan(1);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(0);
  });

  it("the four channels are mutually independent under a full sweep", () => {
    // Each channel driven alone leaves the other three untouched — the leak a
    // shared `approach` over shared scratch would produce.
    const only = (
      rain: boolean,
      fog: boolean,
      snow: boolean,
    ): ReturnType<typeof channels> => {
      resetWeather();
      setWeatherTarget(rain, fog, snow);
      stepWeather(999);
      return channels();
    };
    expect(only(true, false, false)).toEqual({ wetness: 1, rain: 1, fog: 0, snow: 0 });
    expect(only(false, true, false)).toEqual({ wetness: 0, rain: 0, fog: 1, snow: 0 });
    expect(only(false, false, true)).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
    expect(only(true, true, true)).toEqual({ wetness: 1, rain: 1, fog: 1, snow: 1 });
  });
});

// ---------------------------------------------------------------------------
// primeWeather — a lesson's weather is a STANDING CONDITION, not an event
//
// sc-ac-snow is not a clear street where it begins to snow; it is a snowy
// street. The channels nevertheless start at 0 and ramp (snow saturates in
// ~6 s), and nothing in the live path ever resets this singleton between
// lessons — so the first frame of a weather lesson is a clear-weather frame,
// and a lesson opened after another one inherits its weather for as long as
// the ramp-down takes. The clip-capture dev route hit exactly this in the
// founder's round-3 review and answered it by hand-rolling the sequence;
// this is that sequence, owned by the state it primes.
//
// The pair below is deliberate: „does not inherit" alone would be satisfied by
// a store that snapped on every setWeatherTarget and could not ramp at all,
// so „the leak it prevents is real" asserts the ramp still exists. Mutation
// run: snapping inside setWeatherTarget passes the first and fails the second.
// ---------------------------------------------------------------------------

describe("primeWeather: settle on frame 1", () => {
  beforeEach(() => resetWeather());

  it("lands on the steady state in ONE call, with no ramp left to run", () => {
    primeWeather(false, false, true);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
    // Already at target: further stepping must not move it (the „SimEnvironment
    // then holds it, already at target" half of the contract).
    run(3);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 1 });
  });

  it("PRIME_DT_SEC outruns the slowest ramp in the store", () => {
    // The single step is only exact because it is longer than every rate's
    // full traverse; the slowest is WETNESS_OUT_PER_SEC at 12 s. Shortening
    // PRIME_DT_SEC below that leaves a primed dry-after-rain scene damp.
    expect(PRIME_DT_SEC).toBeGreaterThan(1 / WETNESS_OUT_PER_SEC);
    setWeatherTarget(true, false, false);
    stepWeather(999);
    primeWeather(false, false, false);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 0 });
  });

  it("does not inherit the PREVIOUS scene's weather (the cross-lesson leak)", () => {
    // Lesson 1: snow, fully settled.
    primeWeather(false, false, true);
    expect(getSnowIntensity()).toBe(1);
    // Lesson 2 is sc-ac-ice — authored `weather: "dry"`. Its FIRST frame must
    // be dry. Plain setWeatherTarget leaves the snow haze up for ~8 s, which
    // is what the live path does today; priming is what makes frame 1 honest.
    primeWeather(false, false, false);
    expect(channels()).toEqual({ wetness: 0, rain: 0, fog: 0, snow: 0 });
  });

  it("the leak it prevents is real: plain setWeatherTarget carries weather over", () => {
    // The mirror of the assertion above — without it, the previous test would
    // be satisfied by a store that could not hold weather at all.
    primeWeather(false, false, true);
    setWeatherTarget(false, false, false);
    run(1);
    expect(getSnowIntensity()).toBeGreaterThan(0.5);
  });
});

describe("wetnessToRoadParams", () => {
  it("dry road: rough, undarkened", () => {
    const p = wetnessToRoadParams(0);
    expect(p.roughness).toBeCloseTo(0.92, 5);
    expect(p.darken).toBe(1);
  });

  it("soaked road: glossy and darkened", () => {
    const p = wetnessToRoadParams(1);
    expect(p.roughness).toBeCloseTo(0.42, 5);
    expect(p.darken).toBeCloseTo(0.62, 5);
  });

  it("interpolates monotonically and clamps out-of-range wetness", () => {
    const a = wetnessToRoadParams(0.25);
    const b = wetnessToRoadParams(0.75);
    expect(b.roughness).toBeLessThan(a.roughness);
    expect(b.darken).toBeLessThan(a.darken);
    expect(wetnessToRoadParams(-1)).toEqual(wetnessToRoadParams(0));
    expect(wetnessToRoadParams(2)).toEqual(wetnessToRoadParams(1));
  });

  it("honors custom material bounds", () => {
    const p = wetnessToRoadParams(1, { wetRoughness: 0.3, wetDarken: 0.5 });
    expect(p.roughness).toBeCloseTo(0.3, 5);
    expect(p.darken).toBeCloseTo(0.5, 5);
  });

  // THE ROAD HAS ONE SURFACE INPUT AND ONLY RAIN WRITES IT (sweep161, part A
  // on sc-ac-snow: „the road is bare grey asphalt … the student is being
  // taught winter grip on a picture of a dry summer street"). This is the
  // only road-material mapping in the codebase — StaticWorld drives asphalt,
  // decals and paint through it — and its single argument is the RAIN
  // wetness. Snow and ice therefore cannot change the road at all. Pinned so
  // the gap is a stated fact rather than an omission: a snow term added here
  // must arrive together with its StaticWorld reader, or this assertion is
  // the thing that goes red.
  it("carries no snow/ice term: a snow-covered road is indistinguishable from a dry one", () => {
    resetWeather();
    setWeatherTarget(false, false, true);
    stepWeather(999);
    expect(getSnowIntensity()).toBe(1);
    // Full snowfall, and the number StaticWorld feeds the road material is
    // still the dry one.
    expect(getWetness()).toBe(0);
    expect(wetnessToRoadParams(getWetness())).toEqual(wetnessToRoadParams(0));
  });
});
