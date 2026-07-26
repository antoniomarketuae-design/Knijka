/**
 * SkyDome shader contract (doc 82 §3.2 V2 clouds + V3 Vitosha ridge).
 *
 * Shader OUTPUT cannot be tested without a GPU, so what is pinned here is
 * everything that can be: the silhouette geometry (which is the actual
 * Bulgaria-recognition claim — a Sofia teenager knows that ridge, and a
 * wrong one is worse than none), the weather response, and the structural
 * facts that keep the „zero new draw calls, zero new textures" promise
 * doc 82 §6.1 makes.
 */

import { describe, expect, it } from "vitest";
import {
  CLOUD_HORIZON_EPS,
  CLOUD_HORIZON_FADE,
  CLOUD_SCALE,
  cloudCoverGoal,
  cloudDensityGoal,
  RAIN_CLOUD_COVER,
  RIDGE_CREST_JITTER_DEG,
  RIDGE_EDGE,
  RIDGE_RAIN_DIM,
  RIDGE_SKY_CUTOFF,
  ridgeElevationDeg,
  ridgeStrengthGoal,
  SKY_FRAGMENT_SHADER,
  SKY_VERTEX_SHADER,
  VITOSHA_HUMPS,
} from "../skyShader";
import { ENVIRONMENT_PRESETS } from "../presets";

describe("Vitosha silhouette (V3)", () => {
  it("puts Cherni Vrah ~6.6° above the horizon, due south", () => {
    // 2,290 m summit over a ~550 m city floor at ~15 km.
    const summit = ridgeElevationDeg(4);
    expect(summit).toBeGreaterThan(6.5);
    expect(summit).toBeLessThan(7.6);
    // …and it IS the maximum of the whole horizon.
    let best = -1;
    let bestAz = 0;
    for (let az = -180; az < 180; az += 0.25) {
      const e = ridgeElevationDeg(az);
      if (e > best) {
        best = e;
        bestAz = az;
      }
    }
    expect(bestAz).toBeGreaterThan(-10);
    expect(bestAz).toBeLessThan(20);
  });

  it("is asymmetric — a massif, not a bell curve", () => {
    // The western shoulder toward Vladaya sits higher than the eastern spur
    // at the same angular distance from the summit; a symmetric profile is
    // the thing that reads as procedural.
    expect(ridgeElevationDeg(4 + 22)).toBeGreaterThan(ridgeElevationDeg(4 - 22) * 1.1);
  });

  it("leaves the northern horizon low but never razor-flat", () => {
    // Stara Planina: visible relief, but an order below Vitosha — turn the
    // car around and the world still has edges without a second mountain.
    const north = ridgeElevationDeg(180);
    expect(north).toBeGreaterThan(0.5);
    expect(north).toBeLessThan(2);
    // No azimuth is a hard zero.
    for (let az = -180; az < 180; az += 5) {
      expect(ridgeElevationDeg(az)).toBeGreaterThan(0);
    }
  });

  it("wraps azimuth, so the profile is continuous across ±180°", () => {
    expect(ridgeElevationDeg(179.5)).toBeCloseTo(ridgeElevationDeg(-180.5), 6);
    expect(ridgeElevationDeg(360 + 4)).toBeCloseTo(ridgeElevationDeg(4), 6);
  });

  it("generates its GLSL from the same hump table", () => {
    const emitted = SKY_FRAGMENT_SHADER.match(/e \+= ridgeHump\([^;]+;/g) ?? [];
    expect(emitted.length).toBe(VITOSHA_HUMPS.length);
    VITOSHA_HUMPS.forEach((h, i) => {
      const args = emitted[i]!.match(/\(([^)]+)\)/)![1]!.split(",").map((s) => Number(s));
      expect(args.slice(1)).toEqual([h.azimuthDeg, h.widthDeg, h.elevationDeg]);
    });
    for (const line of emitted) {
      // A bare integer literal (digits with no adjacent decimal point) is an
      // `int` in GLSL and poisons every expression it touches.
      expect(line).not.toMatch(/(?<![.\d])\d+(?![.\d])/);
    }
  });

  it("squares the azimuth delta with a multiply, never pow()", () => {
    // pow(x, y) is UNDEFINED for x < 0 in GLSL, and the wrapped delta is
    // negative on half the horizon — this would have been a driver-dependent
    // garbage ridge rather than a compile error.
    expect(SKY_FRAGMENT_SHADER).toContain("return peakDeg * exp(-t * t);");
    expect(SKY_FRAGMENT_SHADER).not.toMatch(/pow\([^)]*ridgeDelta/);
  });

  it("skips the ridge branch above every possible crest", () => {
    // The cutoff is also the guard against atan(0, 0) at the zenith.
    let highest = 0;
    for (let az = -180; az < 180; az += 0.25) {
      highest = Math.max(highest, ridgeElevationDeg(az));
    }
    const highestY = Math.sin(((highest + RIDGE_CREST_JITTER_DEG) * Math.PI) / 180);
    expect(RIDGE_SKY_CUTOFF).toBeGreaterThan(highestY);
    expect(SKY_FRAGMENT_SHADER).toContain(`dir.y < ${RIDGE_SKY_CUTOFF}`);
  });

  it("uses a forward smoothstep across the crest", () => {
    // edge0 >= edge1 is undefined behaviour; the shipped star term gets away
    // with it, a per-pixel horizon line should not.
    expect(SKY_FRAGMENT_SHADER).toContain(
      `1.0 - smoothstep(crest - ${RIDGE_EDGE}, crest + ${RIDGE_EDGE}, dir.y)`,
    );
  });

  it("keeps the crest edge about a pixel wide and the jitter sub-degree", () => {
    // RIDGE_EDGE is in dir.y units; ~0.09° against the phone tier's
    // 891 px / 75.4° hFOV ≈ 0.085°/px.
    expect((Math.asin(RIDGE_EDGE) * 180) / Math.PI).toBeLessThan(0.2);
    expect(RIDGE_CREST_JITTER_DEG).toBeLessThan(0.5);
    expect(RIDGE_CREST_JITTER_DEG).toBeGreaterThan(0);
  });
});

describe("cloud deck (V2)", () => {
  it("is two octaves, domain-warped, with no texture fetch", () => {
    // Two vnoise() octaves for the FBM plus two for the warp — and nothing
    // sampled: the whole promise of V2 is „no new draw call, no new texture".
    expect(SKY_FRAGMENT_SHADER).not.toContain("sampler2D");
    expect(SKY_FRAGMENT_SHADER).not.toContain("texture2D");
    const fbm = SKY_FRAGMENT_SHADER.match(/float fbm = [^;]+;/);
    expect(fbm).not.toBeNull();
    expect((fbm![0].match(/vnoise\(/g) ?? []).length).toBe(2);
    expect(SKY_FRAGMENT_SHADER).toContain("vec2 warp = vec2(vnoise(");
  });

  it("compresses toward the horizon and stops below the ridge crest", () => {
    // The 1/y projection is the horizon compression; the fade has to end
    // BELOW the Vitosha crest or cloud paints over the silhouette.
    expect(SKY_FRAGMENT_SHADER).toContain(`dir.xz / (max(dir.y, 0.0) + ${CLOUD_HORIZON_EPS})`);
    const crestY = Math.sin((ridgeElevationDeg(4) * Math.PI) / 180);
    expect(CLOUD_HORIZON_FADE).toBeLessThan(crestY);
    // The projected plane coordinate must stay bounded where cover is
    // non-zero, or the FBM aliases into shimmer along the horizon.
    const maxCoord = (1 / (CLOUD_HORIZON_FADE + CLOUD_HORIZON_EPS)) * CLOUD_SCALE;
    expect(maxCoord).toBeLessThan(20);
  });

  it("adds a sun-side silver lining rather than a flat grey sheet", () => {
    expect(SKY_FRAGMENT_SHADER).toContain("uSunColor * (0.9 * pow(cosA,");
  });
});

describe("weather response", () => {
  it("rain thickens the deck toward a real overcast", () => {
    const base = ENVIRONMENT_PRESETS.day.sky.cloudCover;
    expect(cloudCoverGoal(base, 0)).toBe(base); // dry is byte-identical
    expect(cloudCoverGoal(base, 1)).toBeCloseTo(RAIN_CLOUD_COVER, 10);
    expect(cloudCoverGoal(base, 0.5)).toBeGreaterThan(base);
  });

  it("fog and snow remove the deck entirely — it must not hang inside a bank", () => {
    expect(cloudDensityGoal(0.85, 0, 0)).toBe(0.85);
    expect(cloudDensityGoal(0.85, 1, 0)).toBe(0);
    expect(cloudDensityGoal(0.85, 0, 1)).toBe(0);
    expect(cloudDensityGoal(0.85, 0.5, 0)).toBeCloseTo(0.425);
  });

  it("any weather takes the 15 km sight line first", () => {
    expect(ridgeStrengthGoal(1, 0, 0, 0)).toBe(1); // clear = full massif
    expect(ridgeStrengthGoal(1, 1, 0, 0)).toBeCloseTo(1 - RIDGE_RAIN_DIM);
    expect(ridgeStrengthGoal(1, 0, 1, 0)).toBe(0);
    expect(ridgeStrengthGoal(1, 0, 0, 1)).toBe(0);
    // Rain hits the ridge harder than it hits the deck (the deck GROWS).
    expect(ridgeStrengthGoal(1, 0.5, 0, 0)).toBeLessThan(0.7);
  });
});

describe("shader structure", () => {
  it("declares exactly the uniforms SkyDome supplies", () => {
    const declared = [...SKY_FRAGMENT_SHADER.matchAll(/^uniform \w+ (u\w+);/gm)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(
      new Set([
        "uZenith",
        "uHorizon",
        "uHorizonCurve",
        "uSunDir",
        "uSunColor",
        "uSunDiscCos",
        "uSunDiscIntensity",
        "uGlow",
        "uGlowPower",
        "uStars",
        "uCloudCover",
        "uCloudDensity",
        "uCloudColor",
        "uRidge",
        "uRidgeColor",
        "uTime",
      ]),
    );
  });

  it("keeps both new terms behind coherent uniform branches", () => {
    // Same pattern as the shipped star branch: uniform-driven, so the branch
    // is coherent across the warp and costs nothing when damped to zero.
    expect(SKY_FRAGMENT_SHADER).toContain("if (uStars > 0.001)");
    expect(SKY_FRAGMENT_SHADER).toContain("if (uCloudDensity > 0.001)");
    expect(SKY_FRAGMENT_SHADER).toContain("if (uRidge > 0.001 &&");
  });

  it("draws the ridge over the deck, and the deck over sun and stars", () => {
    const stars = SKY_FRAGMENT_SHADER.indexOf("if (uStars > 0.001)");
    const clouds = SKY_FRAGMENT_SHADER.indexOf("if (uCloudDensity > 0.001)");
    const ridge = SKY_FRAGMENT_SHADER.indexOf("if (uRidge > 0.001 &&");
    expect(clouds).toBeGreaterThan(stars);
    expect(ridge).toBeGreaterThan(clouds);
  });

  it("keeps the shipped gradient/sun/star terms untouched", () => {
    // V2/V3 are additions. A clear-weather day sky with the deck and the
    // ridge damped to zero must still be the exact shipped image.
    expect(SKY_FRAGMENT_SHADER).toContain(
      "vec3 col = mix(uZenith, uHorizon, pow(1.0 - up, uHorizonCurve));",
    );
    expect(SKY_FRAGMENT_SHADER).toContain("col += uSunColor * (uGlow * pow(cosA, uGlowPower));");
    expect(SKY_FRAGMENT_SHADER).toContain("float star = step(0.9955, h);");
    expect(SKY_VERTEX_SHADER).toContain("vDir = position;");
    expect(SKY_FRAGMENT_SHADER).toContain("#include <tonemapping_fragment>");
    expect(SKY_FRAGMENT_SHADER).toContain("#include <colorspace_fragment>");
  });
});

describe("presets carry the new sky fields", () => {
  it("every time of day authors a deck and a ridge", () => {
    for (const preset of Object.values(ENVIRONMENT_PRESETS)) {
      expect(preset.sky.cloudCover).toBeGreaterThan(0);
      expect(preset.sky.cloudCover).toBeLessThan(1);
      expect(preset.sky.cloudDensity).toBeGreaterThan(0);
      expect(preset.sky.cloudDensity).toBeLessThanOrEqual(1);
      expect(preset.sky.cloudColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.sky.ridgeStrength).toBe(1);
      expect(preset.sky.ridgeColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("the night deck is darker than the night zenith so it never glows", () => {
    const { cloudColor, zenith } = ENVIRONMENT_PRESETS.night.sky;
    const lum = (hex: string) => parseInt(hex.slice(1), 16);
    // Both are near-black; what matters is that the deck reads as an
    // occluder of stars, not as a light source.
    expect(lum(cloudColor)).toBeLessThan(lum("#3a4a6a"));
    expect(lum(zenith)).toBeLessThan(lum(cloudColor));
  });
});
