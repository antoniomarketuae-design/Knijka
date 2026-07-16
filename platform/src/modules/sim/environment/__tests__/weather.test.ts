import { beforeEach, describe, expect, it } from "vitest";
import {
  FOG_IN_PER_SEC,
  RAIN_IN_PER_SEC,
  WETNESS_IN_PER_SEC,
  WETNESS_OUT_PER_SEC,
  getFogIntensity,
  getRainIntensity,
  getWetness,
  resetWeather,
  setWeatherTarget,
  stepWeather,
  wetnessToRoadParams,
} from "../weather";

function run(seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepWeather(dt);
}

describe("weather channel", () => {
  beforeEach(() => resetWeather());

  it("starts bone dry", () => {
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
  });

  it("ramps wetness at the documented rate while raining", () => {
    setWeatherTarget(true);
    run(1);
    expect(getWetness()).toBeCloseTo(WETNESS_IN_PER_SEC, 2);
    run(1 / WETNESS_IN_PER_SEC); // more than enough to saturate
    expect(getWetness()).toBe(1);
  });

  it("rain intensity leads wetness (clouds before puddles)", () => {
    setWeatherTarget(true);
    run(1);
    expect(getRainIntensity()).toBeCloseTo(RAIN_IN_PER_SEC, 2);
    expect(getRainIntensity()).toBeGreaterThan(getWetness());
  });

  it("dries out slower than it soaks (asymmetric rates)", () => {
    expect(WETNESS_OUT_PER_SEC).toBeLessThan(WETNESS_IN_PER_SEC);
    setWeatherTarget(true);
    run(6); // fully wet
    setWeatherTarget(false);
    run(1);
    expect(getWetness()).toBeCloseTo(1 - WETNESS_OUT_PER_SEC, 2);
    run(1 / WETNESS_OUT_PER_SEC);
    expect(getWetness()).toBe(0);
  });

  it("stays clamped to 0..1 under huge steps", () => {
    setWeatherTarget(true);
    stepWeather(999);
    expect(getWetness()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    setWeatherTarget(false);
    stepWeather(999);
    expect(getWetness()).toBe(0);
  });

  it("ignores non-positive dt", () => {
    setWeatherTarget(true);
    stepWeather(0);
    stepWeather(-1);
    expect(getWetness()).toBe(0);
  });

  it("FOG channel: ramps at the documented rate, independent of rain/wetness", () => {
    setWeatherTarget(false, true);
    run(1);
    expect(getFogIntensity()).toBeCloseTo(FOG_IN_PER_SEC, 2);
    // Fog does NOT wet the road and brings no rain.
    expect(getWetness()).toBe(0);
    expect(getRainIntensity()).toBe(0);
    run(1 / FOG_IN_PER_SEC); // more than enough to saturate
    expect(getFogIntensity()).toBe(1);
    // The default (rain-only signature) clears the fog target — additive API.
    setWeatherTarget(false);
    stepWeather(999);
    expect(getFogIntensity()).toBe(0);
  });

  it("FOG channel: clamps and resets like the rain channels", () => {
    setWeatherTarget(true, true);
    stepWeather(999);
    expect(getFogIntensity()).toBe(1);
    expect(getRainIntensity()).toBe(1);
    resetWeather();
    expect(getFogIntensity()).toBe(0);
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
});
