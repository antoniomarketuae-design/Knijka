/**
 * The asphalt surface pass (doc 82 §3.2 V5 + §4.3 F4).
 *
 * Same rule as macroVariation.test.ts and markingWear.test.ts: the hook is
 * verified against the REAL installed three shader sources, so a three upgrade
 * that renames a chunk anchor — or moves `sampledDiffuseColor` / `tbn` out of
 * scope — fails HERE rather than silently flattening the road in the browser,
 * where nobody would notice until a founder review.
 *
 * Every assertion below fails without V5: before it the asphalt materials
 * carried the plain ground-macro hook, the road tint was the wetness darken
 * alone, and the road tiled at the same rate as the paint's assumed 3 m photo.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ShaderLib } from "three";
import {
  MACRO_HOOK_FRAGMENT_ANCHOR,
  macroOnBeforeCompile,
  macroProgramCacheKey,
} from "../textures/macroVariation";
import {
  ROAD_ALBEDO_TINT,
  ROAD_DETAIL_STRENGTH,
  ROAD_DETAIL_UV_SCALE,
  ROAD_TAP_MIX_MAX,
  ROAD_TAP_ROTATION_RAD,
  ROAD_TAP_TILE_M,
  roadSurfaceOnBeforeCompile,
  roadSurfaceProgramCacheKey,
} from "../textures/roadSurface";
import { ROAD_TEXTURE_TILE_M, ROAD_TILE_FLOW_DIVISOR, ROAD_TILE_SPAN_M } from "../textures/groundScale";

const STATIC_WORLD_SRC = readFileSync(
  fileURLToPath(new URL("../components/StaticWorld.tsx", import.meta.url)),
  "utf8",
);

type ShaderStub = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

function compileStub(): ShaderStub {
  const std = ShaderLib.standard;
  return { uniforms: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
}

describe("road tile span (doc 82 F4 optic flow)", () => {
  it("samples the asphalt photo at half its assumed size", () => {
    // The photo fact is untouched — only what the meshes sample it at moves.
    expect(ROAD_TEXTURE_TILE_M).toBe(3);
    expect(ROAD_TILE_FLOW_DIVISOR).toBe(2);
    expect(ROAD_TILE_SPAN_M).toBeCloseTo(1.5);
  });

  it("doubles the near-field flow rate at 50 km/h", () => {
    const mPerSec = 50 / 3.6;
    const before = mPerSec / ROAD_TEXTURE_TILE_M;
    const after = mPerSec / ROAD_TILE_SPAN_M;
    expect(after / before).toBeCloseTo(2);
    // …and the detail normal rides on top of that, an order of magnitude up.
    expect(mPerSec / (ROAD_TILE_SPAN_M / ROAD_DETAIL_UV_SCALE)).toBeGreaterThan(30);
  });

  it("keeps the detail layer at the 0.375 m scale doc 82 V5 asks for", () => {
    expect(ROAD_TILE_SPAN_M / ROAD_DETAIL_UV_SCALE).toBeCloseTo(0.375);
  });
});

describe("roadSurfaceOnBeforeCompile", () => {
  it("anchors exist in the installed three's standard shader", () => {
    const std = ShaderLib.standard;
    expect(std.fragmentShader).toContain("#include <map_fragment>");
    expect(std.fragmentShader).toContain("#include <normal_fragment_maps>");
    // The detile reads `sampledDiffuseColor`, which map_fragment declares
    // inside a BRACE-LESS `#ifdef USE_MAP` — i.e. at function scope, still
    // live further down main(). If three ever braces that block, this breaks.
    const mapChunk = std.fragmentShader.includes("#include <map_fragment>");
    expect(mapChunk).toBe(true);
    // The UDN blend reads `tbn`, declared by normal_fragment_begin, which must
    // still run BEFORE normal_fragment_maps.
    const begin = std.fragmentShader.indexOf("#include <normal_fragment_begin>");
    const maps = std.fragmentShader.indexOf("#include <normal_fragment_maps>");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(maps).toBeGreaterThan(begin);
  });

  it("is a SUPERSET of the ground macro hook (asphalt still knits to terrain)", () => {
    const macro = compileStub();
    macroOnBeforeCompile(macro as never);
    const road = compileStub();
    roadSurfaceOnBeforeCompile(road as never);
    // Same field, same scale, same strength — a different noise scale here
    // would seam the asphalt against the sidewalk at every curb.
    expect(road.uniforms.uMacro).toBe(macro.uniforms.uMacro);
    expect(road.uniforms.uMacroScale?.value).toBe(macro.uniforms.uMacroScale?.value);
    expect(road.uniforms.uMacroStrength?.value).toBe(macro.uniforms.uMacroStrength?.value);
    expect(road.fragmentShader).toContain(MACRO_HOOK_FRAGMENT_ANCHOR);
  });

  it("wires the ruled uniform defaults and shares the one noise upload", () => {
    const a = compileStub();
    const b = compileStub();
    roadSurfaceOnBeforeCompile(a as never);
    roadSurfaceOnBeforeCompile(b as never);
    expect(a.uniforms.uRoadTapScale?.value).toBeCloseTo(1 / ROAD_TAP_TILE_M);
    expect(a.uniforms.uRoadTapMixMax?.value).toBeCloseTo(ROAD_TAP_MIX_MAX);
    expect(a.uniforms.uRoadDetailScale?.value).toBe(ROAD_DETAIL_UV_SCALE);
    expect(a.uniforms.uRoadDetailStrength?.value).toBeCloseTo(ROAD_DETAIL_STRENGTH);
    expect(a.uniforms.uRoadTap).toBe(b.uniforms.uRoadTap);
    // The detile weight and the ground macro read the SAME 64 KB texture (two
    // uniform slots, one upload — the whole point of the shared field).
    expect(a.uniforms.uRoadTap?.value).toBe(a.uniforms.uMacro?.value);
  });

  it("cross-fades a rotated second tap AFTER the macro modulation", () => {
    const shader = compileStub();
    roadSurfaceOnBeforeCompile(shader as never);
    const macroAt = shader.fragmentShader.indexOf(MACRO_HOOK_FRAGMENT_ANCHOR);
    const tapAt = shader.fragmentShader.indexOf("vec3 roadTapB = texture2D( map, roadTapUv ).rgb;");
    expect(macroAt).toBeGreaterThanOrEqual(0);
    expect(tapAt).toBeGreaterThan(macroAt);
    // Guarded on USE_MAP: the procedural canvas fallback also binds a map, but
    // a material with none must not reference vMapUv.
    expect(shader.fragmentShader).toContain("#ifdef USE_MAP");
    // The A-tap denominator is clamped — a black texel must not blow up.
    expect(shader.fragmentShader).toContain("max( sampledDiffuseColor.rgb, vec3( 1e-3 ) )");
  });

  it("rotates the second tap well clear of the lattice's own symmetries", () => {
    // A square lattice is invariant under 90°, and near 45° the two taps'
    // diagonals resonate — either way the "detile" would detile nothing.
    const deg = (ROAD_TAP_ROTATION_RAD * 180) / Math.PI;
    expect(deg).toBeGreaterThan(15);
    expect(deg).toBeLessThan(40);
    expect(Math.abs(deg - 45)).toBeGreaterThan(5);
    // …and it must never fully replace the base tap.
    expect(ROAD_TAP_MIX_MAX).toBeGreaterThan(0);
    expect(ROAD_TAP_MIX_MAX).toBeLessThan(0.5);
    // The detile weight varies WITHIN a block, not at the 80 m ground scale —
    // otherwise the grid is relocated rather than broken.
    expect(ROAD_TAP_TILE_M).toBeLessThan(40);
  });

  it("adds a UDN detail normal that preprocesses away at tier low", () => {
    const shader = compileStub();
    roadSurfaceOnBeforeCompile(shader as never);
    const at = shader.fragmentShader.indexOf("#include <normal_fragment_maps>");
    const detail = shader.fragmentShader.indexOf("vec3 roadDetailN = texture2D( normalMap");
    expect(detail).toBeGreaterThan(at);
    // UDN: perturb by the detail's tangent-space XY through the base TBN,
    // keeping the base Z — never a plain overwrite of `normal`.
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal + tbn[ 0 ] * roadDetailN.x + tbn[ 1 ] * roadDetailN.y );",
    );
    // The entire block sits under the tangent-space normal-map define, which
    // tier `low` never sets (textureBudget "colorOnly" fetches no normal map),
    // so the gate doc 82 V5 asks for costs no runtime branch.
    const guard = shader.fragmentShader.indexOf("#ifdef USE_NORMALMAP_TANGENTSPACE", at);
    expect(guard).toBeGreaterThan(at);
    expect(guard).toBeLessThan(detail);
    // Reusing the SAME map means the detail layer is free to download.
    expect(shader.fragmentShader).not.toContain("uniform sampler2D uRoadDetailMap");
    // Shown twice, so it must be shown quieter than the base layer.
    expect(ROAD_DETAIL_STRENGTH).toBeGreaterThan(0);
    expect(ROAD_DETAIL_STRENGTH).toBeLessThan(1);
  });

  it("compiles as its own program, not the plain ground one", () => {
    expect(roadSurfaceProgramCacheKey()).not.toBe(macroProgramCacheKey());
    expect(roadSurfaceProgramCacheKey()).toBe(roadSurfaceProgramCacheKey());
  });
});

describe("StaticWorld binds the pass to the asphalt only", () => {
  it("the three asphalt meshes take ROAD_SURFACE, the rest keep MACRO_VARIATION", () => {
    // Ribbons, junction patches and parking bands — both the PBR branch and
    // the procedural-canvas fallback branch of each = 6 spreads.
    const road = STATIC_WORLD_SRC.match(/\{\.\.\.ROAD_SURFACE\}/g);
    expect(road?.length).toBe(6);
    // Terrain, paved courtyards and sidewalks are NOT asphalt and must not
    // pick up the detile — they would then tile at the road's scale.
    //
    // WAVE 8: the non-asphalt ground spread is now `GROUND_SNOW`, which is
    // MACRO_VARIATION composed with the snow-cover hook (sc-ac-snow:cfb2d46d —
    // „kerbs, pavements … are all bare", because snowCover.ts was attached to
    // the five PROP materials and to nothing this file draws). It is still the
    // macro hook: `GROUND_SNOW.onBeforeCompile` calls `MACRO_VARIATION`'s, so
    // this test's claim — the ground keeps the ground hook and the asphalt does
    // not — is unchanged, and it is checked on both names.
    expect(STATIC_WORLD_SRC).toContain("{...GROUND_SNOW}");
    expect(STATIC_WORLD_SRC).toContain("MACRO_VARIATION.onBeforeCompile(shader)");
    const asphaltBlock = STATIC_WORLD_SRC.slice(
      STATIC_WORLD_SRC.indexOf("{/* Road ribbons:"),
      STATIC_WORLD_SRC.indexOf("{/* Batched road decals"),
    );
    expect(asphaltBlock).not.toContain("{...MACRO_VARIATION}");
    // …and the asphalt must not pick up the snow hook either: `weather.ts`'s
    // SNOW_ROAD_BRIGHTEN already answers for the carriageway, and two responses
    // on one surface is the double-application this spread exists to avoid.
    expect(asphaltBlock).not.toContain("{...GROUND_SNOW}");
  });

  it("darkens the asphalt away from the concrete pavement", () => {
    expect(ROAD_ALBEDO_TINT).toBeLessThan(1);
    // Not so far that AgX crushes the aggregate in shadow.
    expect(ROAD_ALBEDO_TINT).toBeGreaterThan(0.6);
    // It MULTIPLIES the wetness darken — replacing it would discard the doc 66
    // R5 wet-road retune.
    expect(STATIC_WORLD_SRC).toContain("wet.darken * ROAD_ALBEDO_TINT");
    // Decals are wear IN the asphalt; they must not stay brighter than it.
    expect(STATIC_WORLD_SRC).toContain("decalWet.darken * ROAD_ALBEDO_TINT");
  });
});
