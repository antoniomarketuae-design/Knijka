import { describe, expect, it } from "vitest";
import { ENVIRONMENT_PRESETS, sunDirection, type TimeOfDay } from "../presets";

const TIMES: TimeOfDay[] = ["day", "dusk", "night"];
const HEX = /^#[0-9a-f]{6}$/i;

function length(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("sunDirection", () => {
  it("returns a unit vector for arbitrary angles", () => {
    for (const azimuthDeg of [0, 45, 90, 165, 262, 300, 359]) {
      for (const elevationDeg of [0, 8, 42, 55, 89]) {
        expect(length(sunDirection({ azimuthDeg, elevationDeg }))).toBeCloseTo(1, 10);
      }
    }
  });

  it("maps compass azimuth to three.js axes (+x east, -z north)", () => {
    const north = sunDirection({ azimuthDeg: 0, elevationDeg: 0 });
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.z).toBeCloseTo(-1, 10);

    const east = sunDirection({ azimuthDeg: 90, elevationDeg: 0 });
    expect(east.x).toBeCloseTo(1, 10);
    expect(east.z).toBeCloseTo(0, 10);

    const south = sunDirection({ azimuthDeg: 180, elevationDeg: 0 });
    expect(south.z).toBeCloseTo(1, 10);

    const west = sunDirection({ azimuthDeg: 270, elevationDeg: 0 });
    expect(west.x).toBeCloseTo(-1, 10);
  });

  it("elevation drives the vertical component", () => {
    expect(sunDirection({ azimuthDeg: 165, elevationDeg: 90 }).y).toBeCloseTo(1, 10);
    expect(sunDirection({ azimuthDeg: 165, elevationDeg: 0 }).y).toBeCloseTo(0, 10);
    expect(sunDirection({ azimuthDeg: 165, elevationDeg: -15 }).y).toBeLessThan(0);
  });
});

describe("ENVIRONMENT_PRESETS", () => {
  it("covers all three times of day and tags itself", () => {
    for (const t of TIMES) {
      expect(ENVIRONMENT_PRESETS[t]).toBeDefined();
      expect(ENVIRONMENT_PRESETS[t].timeOfDay).toBe(t);
    }
  });

  it("uses valid hex colors everywhere", () => {
    for (const t of TIMES) {
      const p = ENVIRONMENT_PRESETS[t];
      for (const c of [
        p.sky.zenith,
        p.sky.horizon,
        p.sky.sunTint,
        p.light.sun.color,
        p.light.hemisphere.skyColor,
        p.light.hemisphere.groundColor,
        p.fog.color,
        p.rainFog.color,
      ]) {
        expect(c).toMatch(HEX);
      }
    }
  });

  it("orders key light intensity day > dusk > night", () => {
    const day = ENVIRONMENT_PRESETS.day.light.sun.intensity;
    const dusk = ENVIRONMENT_PRESETS.dusk.light.sun.intensity;
    const night = ENVIRONMENT_PRESETS.night.light.sun.intensity;
    expect(day).toBeGreaterThan(dusk);
    expect(dusk).toBeGreaterThan(night);
  });

  it("puts the dusk sun low in the west for long shadows", () => {
    const dusk = ENVIRONMENT_PRESETS.dusk.light.sun;
    expect(dusk.elevationDeg).toBeLessThan(15);
    const dir = sunDirection(dusk);
    expect(dir.x).toBeLessThan(0); // west
    // Day is "late golden" (doc 71 §4.1: 22° — low for shape, but held above
    // 18° so shadows stay inside the camera-following frustum until CSM);
    // dusk still sits below it.
    const day = ENVIRONMENT_PRESETS.day.light.sun;
    expect(day.elevationDeg).toBeGreaterThan(dusk.elevationDeg);
    expect(day.elevationDeg).toBeGreaterThanOrEqual(18);
    expect(day.elevationDeg).toBeLessThanOrEqual(25);
    expect(sunDirection(day).x).toBeLessThan(0); // west-southwest key
  });

  it("gives every preset its own tone-mapping exposure, day punchiest", () => {
    const e = (t: TimeOfDay) => ENVIRONMENT_PRESETS[t].exposure;
    expect(e("day")).toBeGreaterThan(e("dusk"));
    expect(e("dusk")).toBeGreaterThan(e("night"));
    for (const t of TIMES) {
      expect(e(t)).toBeGreaterThan(0.5);
      expect(e(t)).toBeLessThan(1.5);
    }
  });

  it("keeps every key light above the horizon (shadow caster stays valid)", () => {
    for (const t of TIMES) {
      expect(ENVIRONMENT_PRESETS[t].light.sun.elevationDeg).toBeGreaterThan(0);
    }
  });

  it("thickens fog toward night, and rain fog is always denser than clear", () => {
    const d = (t: TimeOfDay) => ENVIRONMENT_PRESETS[t].fog.density;
    expect(d("night")).toBeGreaterThan(d("dusk"));
    expect(d("dusk")).toBeGreaterThan(d("day"));
    for (const t of TIMES) {
      const p = ENVIRONMENT_PRESETS[t];
      expect(p.rainFog.density).toBeGreaterThan(p.fog.density);
    }
  });

  it("shows stars only after dark", () => {
    expect(ENVIRONMENT_PRESETS.day.sky.starsIntensity).toBe(0);
    expect(ENVIRONMENT_PRESETS.dusk.sky.starsIntensity).toBeLessThan(0.5);
    expect(ENVIRONMENT_PRESETS.night.sky.starsIntensity).toBe(1);
  });

  it("swells the low sun disc at dusk (perceptual horizon illusion)", () => {
    expect(ENVIRONMENT_PRESETS.dusk.sky.sunDiscDeg).toBeGreaterThan(
      ENVIRONMENT_PRESETS.day.sky.sunDiscDeg,
    );
  });
});
