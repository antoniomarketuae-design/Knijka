import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_PRESETS,
  environmentPreset,
  mixHex,
  sunDirection,
  winterGrade,
  type TimeOfDay,
} from "../presets";

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
    // Day is midday (art pass 2026-08-03: 56°), dusk still sits below it.
    // The band is a SHADOW-GEOMETRY contract, not a taste one, and both ends
    // were measured rather than guessed:
    //  · floor 50° — under it a 25 m block at the kerb throws more than the
    //    ~16 m perceptually-scaled carriageway is wide, every street sits in
    //    one flat tone, and the screen reads "there are NO CAST SHADOWS
    //    anywhere" (the founder's verdict). A/B-ing gl.shadowMap.enabled at
    //    22° moved 3.1/255 of the whole frame and at 41° still 8.4/255 of the
    //    road patch — a shadow that covers everything is not a shadow.
    //  · ceiling 66° — Sofia (42.7° N) never sees a higher sun, and past it
    //    the throws get too short to model a street at all.
    // The throw at 56° is 0.67 × height, so even a 50 m tower lands inside
    // the tightest camera-following frustum (quality.ts shadowRadiusM 45).
    const day = ENVIRONMENT_PRESETS.day.light.sun;
    expect(day.elevationDeg).toBeGreaterThan(dusk.elevationDeg);
    expect(day.elevationDeg).toBeGreaterThanOrEqual(50);
    expect(day.elevationDeg).toBeLessThanOrEqual(66);
    expect(50 / Math.tan((day.elevationDeg * Math.PI) / 180)).toBeLessThan(45);
    expect(sunDirection(day).x).toBeLessThan(0); // west-southwest key
  });

  // Doc 71 §4.1's actual finding, pinned so the next art pass cannot undo it
  // by "brightening the shadows": the "washed out" rig was key:fill ≈ 1.6:1
  // (1.35 sun vs 0.85 hemisphere). Contrast is the ratio, NOT the sun's
  // elevation — which is what let the 2026-08-03 pass raise the sun to a
  // midday 56° without going back to the flat noon look.
  it("keeps the day key at least 3.5× the hemisphere fill (doc 71 §4.1)", () => {
    const day = ENVIRONMENT_PRESETS.day.light;
    expect(day.sun.intensity / day.hemisphere.intensity).toBeGreaterThanOrEqual(3.5);
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

/**
 * THE SEASON — sc-ac-ice:5372f176 / sc-ac-bridge-ice:7eb16029 (critical).
 *
 * Both black-ice lessons open on «Ясна студена сутрин … около нулата» and both
 * rendered the same high-summer afternoon: measured 2026-08-28 across their two
 * DIFFERENT districts, sky 153.8/170.8/191.6 in both, facade 137.6/148.5/161.7
 * vs 137.5/148.5/161.6, canopy 73.4/97.4/75.5 vs 73.8/97.7/75.6. `winterGrade`
 * is the LIGHT half of the repair (the foliage half is
 * `world/textures/snowCover.ts`).
 *
 * These cases pin the PROPERTIES the grade has to keep, not the hexes it
 * happens to produce — a taste change should be free, a regression should not.
 */
describe("winterGrade — the season, over any hour", () => {
  const luma = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff);
  };
  const blueMinusRed = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return (n & 0xff) - ((n >> 16) & 0xff);
  };

  it("is a total function over every time of day, and every colour stays a hex", () => {
    for (const t of TIMES) {
      const w = winterGrade(ENVIRONMENT_PRESETS[t]);
      for (const hex of [
        w.sky.zenith,
        w.sky.horizon,
        w.sky.sunTint,
        w.sky.cloudColor,
        w.sky.ridgeColor,
        w.light.sun.color,
        w.light.hemisphere.skyColor,
        w.light.hemisphere.groundColor,
        w.fog.color,
      ]) {
        expect(hex, `${t}: ${hex}`).toMatch(HEX);
      }
      // The hour survives the season: winter is orthogonal to time of day, and
      // spelling it as a fourth TimeOfDay is exactly what the contract forbids.
      expect(w.timeOfDay).toBe(t);
      expect(w.light.sun.elevationDeg).toBe(ENVIRONMENT_PRESETS[t].light.sun.elevationDeg);
      expect(w.light.sun.azimuthDeg).toBe(ENVIRONMENT_PRESETS[t].light.sun.azimuthDeg);
    }
  });

  it("keeps doc 71's 3.5:1 key:fill ratio — a clear cold morning is CONTRASTY", () => {
    // The founder-ratified invariant behind the day rig. Both halves are scaled
    // by the same factor precisely so the grade cannot re-introduce the
    // "washed out" overcast look doc 71 §4.1 removed.
    const day = ENVIRONMENT_PRESETS.day;
    const w = winterGrade(day);
    expect(w.light.sun.intensity / w.light.hemisphere.intensity).toBeCloseTo(
      day.light.sun.intensity / day.light.hemisphere.intensity,
      6,
    );
    expect(w.light.sun.intensity / w.light.hemisphere.intensity).toBeGreaterThan(3.5);
    // …and it IS a dimmer light, or nothing on the road would change tone.
    expect(w.light.sun.intensity).toBeLessThan(day.light.sun.intensity);
    expect(w.exposure).toBeLessThan(day.exposure);
  });

  it("kills the warm ground bounce — the term that lit those facades July", () => {
    const day = ENVIRONMENT_PRESETS.day;
    const w = winterGrade(day);
    // Summer bounces warm brown off dry earth (#4d4740, red-dominant); frozen
    // ground and dead grass bounce cold grey. The SIGN is the assertion.
    expect(blueMinusRed(day.light.hemisphere.groundColor)).toBeLessThan(0);
    expect(blueMinusRed(w.light.hemisphere.groundColor)).toBeGreaterThan(0);
    // The key goes cold too — a warm key over a cold fill is a sunset, not a
    // winter morning.
    expect(blueMinusRed(w.light.sun.color)).toBeGreaterThan(
      blueMinusRed(day.light.sun.color),
    );
  });

  it("changes the SKY, which is 35–45 % of every frame and half the audit row", () => {
    for (const t of TIMES) {
      const p = ENVIRONMENT_PRESETS[t];
      const w = winterGrade(p);
      // Paler, milkier zenith: the summer #3f76c4 is exactly what the judge
      // photographed as identical across two districts.
      expect(luma(w.sky.zenith), t).toBeGreaterThan(luma(p.sky.zenith));
      expect(w.sky.zenith, t).not.toBe(p.sky.zenith);
      // More deck, never a closed lid (the sun disc still has to read).
      expect(w.sky.cloudCover, t).toBeGreaterThan(p.sky.cloudCover);
      expect(w.sky.cloudCover, t).toBeLessThanOrEqual(0.9);
      // Vitosha wears snow from ~1400 m in winter: the ONE element that gets
      // brighter, and the cheapest "this is winter" cue on a Sofia street.
      expect(luma(w.sky.ridgeColor), t).toBeGreaterThan(luma(p.sky.ridgeColor));
      // Colder, thicker clear-air haze — still above the 0.002552 floor
      // groundBackdrop.test.ts pins for the backdrop disc's own rim.
      expect(w.fog.density, t).toBeGreaterThan(p.fog.density);
      expect(w.fog.density, t).toBeGreaterThan(0.002552);
    }
  });

  it("passes the WEATHER veils through untouched — winter is not a fifth weather", () => {
    for (const t of TIMES) {
      const p = ENVIRONMENT_PRESETS[t];
      const w = winterGrade(p);
      expect(w.rainFog, t).toEqual(p.rainFog);
      expect(w.fogWeather, t).toEqual(p.fogWeather);
      expect(w.snowWeather, t).toEqual(p.snowWeather);
    }
  });

  it("environmentPreset is the identity when no season is authored", () => {
    // The property that makes this free for every other lesson in the corpus:
    // the un-wintered branch returns the SAME OBJECT, so nothing downstream
    // re-derives, re-allocates or drifts.
    for (const t of TIMES) {
      expect(environmentPreset(t)).toBe(ENVIRONMENT_PRESETS[t]);
      expect(environmentPreset(t, false)).toBe(ENVIRONMENT_PRESETS[t]);
      expect(environmentPreset(t, true)).toEqual(winterGrade(ENVIRONMENT_PRESETS[t]));
    }
  });

  it("mixHex is a real blend and clamps its parameter", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 9)).toBe("#ffffff");
  });
});
