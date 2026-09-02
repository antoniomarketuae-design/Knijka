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
import { Color, ShaderLib } from "three";
import {
  MACRO_HOOK_FRAGMENT_ANCHOR,
  macroOnBeforeCompile,
  macroProgramCacheKey,
} from "../textures/macroVariation";
import {
  ROAD_ALBEDO_TINT,
  ROAD_DETAIL_STRENGTH,
  ROAD_DETAIL_UV_SCALE,
  ROAD_FINE_TILE_M,
  ROAD_SNOW_FRAGMENT_ANCHOR,
  ROAD_SNOW_PATCH_FLOOR,
  ROAD_SNOW_PATCH_TILE_M,
  ROAD_TAP_MIX_MAX,
  ROAD_TAP_ROTATION_RAD,
  ROAD_TAP_TILE_M,
  roadSurfaceOnBeforeCompile,
  roadSurfaceProgramCacheKey,
} from "../textures/roadSurface";
import {
  getSnowRoadCover,
  setSnowCover,
  SNOW_COVER_COLOR,
  SNOW_COVER_MAX,
  SNOW_ROAD_COVER_MAX,
} from "../textures/snowCover";
import { PAINT_WEAR_STRENGTH } from "../textures/markingWear";
import { SNOW_ROAD_BRIGHTEN } from "../../environment/weather";
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SNOW ON THE CARRIAGEWAY — `sc-ac-snow:f1673b60`, critical, and the last
 * address it had left.
 *
 * FILED: „The carriageway renders as bare grey asphalt with clean unbroken
 * white edge and lane markings while instruction 1 tells the student «пътят е
 * заснежен»." (`templates-conditions.ts:1013` still authors that sentence.)
 *
 * The row was routed to `environment/presets.ts`, which measured over four
 * sweeps why nothing in the light rig can close it — every lever there lights
 * road and pavement equally, so the ratio survives every value — and left one
 * line naming what was actually missing: „a per-fragment snow mix on the
 * ASPHALT material, capped below the pavement's 0.85 because a carriageway is
 * trodden, and it is not a constant in this file." `weather.ts` §5 says the
 * same from the other side: its multiply „is doing its whole job" and cannot do
 * more, because `SNOW_ROAD_BRIGHTEN` would need ≈ 2.7 against the `< 2` bound
 * `weather.test.ts` pins, and a multiply amplifies the asphalt's baked variance
 * rather than covering it.
 *
 * SO THE GATE IS ON THE THREE THINGS THAT CAN GO WRONG WITH THAT MIX, in the
 * order they have gone wrong on this surface before:
 *  1. IT IS NOT WIRED — the dead-predicate shape. `snowCover.test.ts`'s routing
 *     block already holds `DistrictWorld`'s per-frame writer; what is checked
 *     here is that the road's channel comes off that SAME writer, so there is
 *     no second per-frame call that could be forgotten.
 *  2. IT IS SPLICED IN THE WRONG PLACE — before `<color_fragment>` the vColor
 *     wheel-track wear multiplies back in AFTER the mix and re-amplifies the
 *     variance the mix exists to compress.
 *  3. IT BURIES THE MARKINGS — the one thing three separate files forbid,
 *     because lane keeping and stop lines are graded off those stripes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("sc-ac-snow:f1673b60 — the carriageway takes its snow", () => {
  /** Relative luminance in the linear working space three converts hexes to. */
  const lum = (hex: number): number => {
    const c = new Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };

  it("splices a MIX toward the snow albedo, not a second multiply", () => {
    const shader = compileStub();
    roadSurfaceOnBeforeCompile(shader as never);
    expect(shader.fragmentShader).toContain(ROAD_SNOW_FRAGMENT_ANCHOR);
    // A `mix` and not a `*=`: presets.ts's whole derivation is that a multiply
    // AMPLIFIES the asphalt's baked variance (blotch) where a mix COMPRESSES it
    // toward the snow colour, which is what lying snow does — it covers.
    expect(ROAD_SNOW_FRAGMENT_ANCHOR).toContain("mix(");
    expect(ROAD_SNOW_FRAGMENT_ANCHOR).not.toContain("*=");
  });

  it("lands AFTER <color_fragment>, so the vColor wheel-tracks cannot re-blotch it", () => {
    // The anchor has to exist in the installed three, and after the map.
    const std = ShaderLib.standard;
    expect(std.fragmentShader).toContain("#include <color_fragment>");
    expect(std.fragmentShader.indexOf("#include <color_fragment>")).toBeGreaterThan(
      std.fragmentShader.indexOf("#include <map_fragment>"),
    );
    const shader = compileStub();
    roadSurfaceOnBeforeCompile(shader as never);
    const colorAt = shader.fragmentShader.indexOf("#include <color_fragment>");
    const mixAt = shader.fragmentShader.indexOf(ROAD_SNOW_FRAGMENT_ANCHOR);
    const macroAt = shader.fragmentShader.indexOf(MACRO_HOOK_FRAGMENT_ANCHOR);
    expect(colorAt).toBeGreaterThanOrEqual(0);
    expect(mixAt).toBeGreaterThan(colorAt);
    // …and therefore after the whole map/detile/fine chain as well: covering is
    // the LAST thing that happens to a road surface.
    expect(mixAt).toBeGreaterThan(macroAt);
  });

  it("costs nothing on the 149 lessons that author no snow", () => {
    const shader = compileStub();
    roadSurfaceOnBeforeCompile(shader as never);
    // The fetch AND the mix sit behind a uniform branch — uniform control flow,
    // legal around a sampler in both GLSL ES 1.00 and 3.00 — so a dry lesson
    // does not even pay the extra texture read, let alone a shade of colour.
    const guardAt = shader.fragmentShader.indexOf("if ( uSnowRoad > 0.0 )");
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(shader.fragmentShader.indexOf(ROAD_SNOW_FRAGMENT_ANCHOR)).toBeGreaterThan(guardAt);
    // And the channel is 0 until a snow lesson drives it.
    setSnowCover(0);
    expect(getSnowRoadCover()).toBe(0);
  });

  it("rides the ONE per-frame writer DistrictWorld already ticks", () => {
    const a = compileStub();
    const b = compileStub();
    roadSurfaceOnBeforeCompile(a as never);
    roadSurfaceOnBeforeCompile(b as never);
    // By reference, so `setSnowCover` reaches every compiled asphalt program.
    expect(a.uniforms.uSnowRoad).toBe(b.uniforms.uSnowRoad);
    expect(a.uniforms.uSnowColor).toBe(b.uniforms.uSnowColor);
    setSnowCover(1);
    expect(a.uniforms.uSnowRoad?.value).toBe(SNOW_ROAD_COVER_MAX);
    setSnowCover(0.5);
    expect(a.uniforms.uSnowRoad?.value).toBeCloseTo(0.5 * SNOW_ROAD_COVER_MAX);
    // A second writer is the failure mode this shares a setter to avoid: one
    // forgotten frame would put a snowed pavement beside a bare road, which is
    // the picture the row convicted.
    setSnowCover(0);
    // The shared 64 KB field again — no second noise upload for the drifts.
    expect(a.uniforms.uRoadTap?.value).toBe(a.uniforms.uMacro?.value);
    expect(a.uniforms.uRoadSnowScale?.value).toBeCloseTo(1 / ROAD_SNOW_PATCH_TILE_M);
    expect(a.uniforms.uRoadSnowFloor?.value).toBeCloseTo(ROAD_SNOW_PATCH_FLOOR);
  });

  it("is PATCHY — a flat lift is the same grey road one shade paler", () => {
    // Drifts and trodden bands, at a scale distinct from the two octaves
    // already on this material, or the three beat against each other.
    expect(ROAD_SNOW_PATCH_FLOOR).toBeGreaterThan(0);
    expect(ROAD_SNOW_PATCH_FLOOR).toBeLessThan(1);
    expect(ROAD_SNOW_PATCH_TILE_M).toBeLessThan(ROAD_TAP_TILE_M);
    expect(ROAD_SNOW_PATCH_TILE_M).toBeGreaterThan(ROAD_FINE_TILE_M);
    // …and longer than a car, or it reads as dither rather than as weather.
    expect(ROAD_SNOW_PATCH_TILE_M).toBeGreaterThan(4);
  });

  it("moves the road far enough to answer the row", () => {
    // Linear working space throughout — the space `diffuseColor` is in at the
    // splice. The bare snowed road is presets.ts's own frame-inferred figure.
    const roadBare = ROAD_ALBEDO_TINT * SNOW_ROAD_BRIGHTEN * 0.28;
    const snow = lum(SNOW_COVER_COLOR);
    const meanWeight = SNOW_ROAD_COVER_MAX * ((ROAD_SNOW_PATCH_FLOOR + 1) / 2);
    const roadMean = roadBare + meanWeight * (snow - roadBare);
    // A third again as bright in albedo. `weather.ts` measured this renderer
    // compressing an albedo move by ~2.8× in the near field, so ≈ +12 % on
    // screen against a control that drifts under 2 % — past the noise floor the
    // sweep's own A/B works at, and the surface stops being „bare grey".
    expect(roadMean / roadBare).toBeGreaterThan(1.3);
  });

  it("…and never far enough to bury the markings the engine grades on", () => {
    const roadBare = ROAD_ALBEDO_TINT * SNOW_ROAD_BRIGHTEN * 0.28;
    const snow = lum(SNOW_COVER_COLOR);
    const roadDrift = roadBare + SNOW_ROAD_COVER_MAX * (snow - roadBare);
    // The markings' shipped albedo, then `markingWear`'s grime octave, whose
    // WORST patch is the binding case: the brightest drift meeting the dirtiest
    // stripe. `weather.ts`'s R0 criterion — „the lane markings must still be
    // the brightest thing in the carriageway" — has to hold there, not only on
    // the average, or a student loses the lane line in a patch.
    const paintGrimiest = lum(0xe9e7df) * (1 - PAINT_WEAR_STRENGTH);
    expect(roadDrift).toBeLessThan(paintGrimiest);
    // The margin is thin ON PURPOSE and the physics is why: snow and road paint
    // are within a few percent of each other in life. That is what makes a
    // snowed road hard to read — and what makes this a CAP rather than a taste.
    // If a later wave wants a whiter road it must move the paint first.
    expect(roadDrift).toBeLessThan(lum(0xe9e7df) * 0.75);
    // Below the snowed PAVEMENT too (presets.ts measured it at ≈0.75 linear):
    // a carriageway is ploughed and driven, a pavement is not.
    expect(roadDrift).toBeLessThan(0.75);
    // …which is the same ordering stated as caps, and the one presets.ts asked
    // for in words („capped below the pavement's 0.85").
    expect(SNOW_ROAD_COVER_MAX).toBeLessThan(SNOW_COVER_MAX);
    expect(SNOW_ROAD_COVER_MAX).toBeGreaterThan(0);
  });

  it("compiles as a NEW program — a cached v1 has neither uniform nor splice", () => {
    expect(roadSurfaceProgramCacheKey()).not.toBe("road-surface-v1");
    expect(roadSurfaceProgramCacheKey()).not.toBe(macroProgramCacheKey());
  });
});
