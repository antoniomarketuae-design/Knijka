/**
 * The road's GLSL contract.
 *
 * A shader cannot be executed here, but every way this particular shader
 * fails SILENTLY can be. three leaves an undeclared uniform at zero and
 * compiles a splice that matched nothing into a perfectly valid program, so
 * the two realistic failures — a renamed uniform and a chunk anchor that
 * three moved — both produce a black road and no error anywhere. Those are
 * what is pinned here, plus the one GLSL keyword that would break the
 * compile outright.
 */

import { describe, expect, it } from "vitest";
import {
  HERO_ASPHALT_VARIATION,
  HERO_PAINT_FADE_END_M,
  HERO_PAINT_FADE_START_M,
  HERO_ROAD_FRAGMENT_ALBEDO,
  HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR,
  HERO_ROAD_FRAGMENT_DECL,
  HERO_ROAD_FRAGMENT_ROUGHNESS,
  HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR,
  HERO_ROAD_UNIFORM_NAMES,
  HERO_ROAD_VERTEX_DECL,
  HERO_ROAD_VERTEX_DEPTH,
  HERO_ROAD_VERTEX_DEPTH_ANCHOR,
  HERO_ROAD_VERTEX_UV,
  HERO_ROAD_VERTEX_UV_ANCHOR,
} from "../heroRoadShader";

const FRAGMENT_SOURCE = [
  HERO_ROAD_FRAGMENT_DECL,
  HERO_ROAD_FRAGMENT_ALBEDO,
  HERO_ROAD_FRAGMENT_ROUGHNESS,
].join("\n");

describe("uniforms", () => {
  it("declares every uniform the body uses", () => {
    // The failure this prevents: rename a uniform in the component, miss it
    // in the GLSL, ship a road drawn with zeros.
    const used = new Set(FRAGMENT_SOURCE.match(/\bu[A-Z]\w*/g) ?? []);
    for (const name of used) {
      expect(HERO_ROAD_FRAGMENT_DECL).toContain(`uniform`);
      expect(HERO_ROAD_UNIFORM_NAMES).toContain(name);
    }
  });

  it("uses every uniform it declares — no dead plumbing", () => {
    for (const name of HERO_ROAD_UNIFORM_NAMES) {
      expect(FRAGMENT_SOURCE).toContain(name);
    }
  });
});

describe("varyings cross the vertex/fragment boundary intact", () => {
  it("declares both varyings on both sides", () => {
    for (const varying of ["vHeroUv", "vHeroDepth"]) {
      expect(HERO_ROAD_VERTEX_DECL).toContain(`varying`);
      expect(HERO_ROAD_VERTEX_DECL).toContain(varying);
      expect(HERO_ROAD_FRAGMENT_DECL).toContain(varying);
    }
  });

  it("writes each varying exactly once, in the splice that can see its source", () => {
    // vHeroUv needs `uv` (available from <uv_vertex>); vHeroDepth needs
    // `mvPosition`, which only exists after <project_vertex>. Swapping the
    // two splices compiles to nothing useful.
    expect(HERO_ROAD_VERTEX_UV).toContain("vHeroUv = uv;");
    expect(HERO_ROAD_VERTEX_DEPTH).toContain("vHeroDepth = -mvPosition.z;");
    expect(HERO_ROAD_VERTEX_UV).not.toContain("mvPosition");
    expect(HERO_ROAD_VERTEX_DEPTH).not.toContain("uv");
  });
});

describe("GLSL that would not compile", () => {
  it("never names an identifier that GLSL ES reserves", () => {
    // `half` and `fixed` are reserved for future use; a parameter named
    // `half` is an instant compile error and an all-black material.
    const reserved = ["half", "fixed", "input", "output", "sampler3DRect"];
    const source = [HERO_ROAD_VERTEX_DECL, HERO_ROAD_FRAGMENT_DECL, FRAGMENT_SOURCE].join("\n");
    for (const word of reserved) {
      expect(source).not.toMatch(new RegExp(`\\b${word}\\s*[;,)=]`));
      expect(source).not.toMatch(new RegExp(`\\bfloat\\s+${word}\\b`));
    }
  });

  it("balances braces and parentheses in every splice", () => {
    for (const chunk of [
      HERO_ROAD_VERTEX_DECL,
      HERO_ROAD_VERTEX_UV,
      HERO_ROAD_VERTEX_DEPTH,
      HERO_ROAD_FRAGMENT_DECL,
      HERO_ROAD_FRAGMENT_ALBEDO,
      HERO_ROAD_FRAGMENT_ROUGHNESS,
    ]) {
      const count = (ch: string) => chunk.split(ch).length - 1;
      expect(count("{")).toBe(count("}"));
      expect(count("(")).toBe(count(")"));
    }
  });

  it("scopes the albedo splice so its locals cannot collide with three's", () => {
    // It is inserted into the middle of main(); an unscoped `vec2 heroM` next
    // to a future three chunk that declares the same name is a redefinition
    // error that only appears on a version bump.
    expect(HERO_ROAD_FRAGMENT_ALBEDO.trim().startsWith("{")).toBe(true);
    expect(HERO_ROAD_FRAGMENT_ALBEDO.trim().endsWith("}")).toBe(true);
  });
});

describe("splice anchors", () => {
  it("targets three chunk includes, not hand-copied source", () => {
    // Matching a chunk NAME survives three upgrades; matching a line of the
    // chunk's body does not.
    for (const anchor of [
      HERO_ROAD_VERTEX_UV_ANCHOR,
      HERO_ROAD_VERTEX_DEPTH_ANCHOR,
      HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR,
      HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR,
    ]) {
      expect(anchor).toMatch(/^#include <[a-z_0-9]+>$/);
    }
  });

  it("writes the albedo before lighting and the roughness before it is read", () => {
    expect(HERO_ROAD_FRAGMENT_ALBEDO).toContain("diffuseColor.rgb");
    expect(HERO_ROAD_FRAGMENT_ROUGHNESS).toContain("roughnessFactor");
  });
});

describe("the far field cannot shimmer", () => {
  it("dissolves the paint over a real distance before it goes sub-pixel", () => {
    // Canvas MSAA is the only AA in this scene (no composer), so a 0.15 m
    // line at 150 m is a strobe unless it has already faded out.
    expect(HERO_PAINT_FADE_START_M).toBeLessThan(HERO_PAINT_FADE_END_M);
    expect(HERO_PAINT_FADE_END_M - HERO_PAINT_FADE_START_M).toBeGreaterThan(50);
    expect(FRAGMENT_SOURCE).toContain("uPaintFadeStartM");
  });

  it("keeps the macro variation centred on the authored albedo", () => {
    // `1.0 + (n - 0.5) * uVariation` has mean 1: the asphalt varies around
    // its authored colour instead of being darkened by the noise.
    expect(HERO_ROAD_FRAGMENT_ALBEDO).toContain("1.0 + (n - 0.5) * uVariation");
    expect(HERO_ASPHALT_VARIATION).toBeGreaterThan(0);
    expect(HERO_ASPHALT_VARIATION).toBeLessThan(0.5);
  });
});
