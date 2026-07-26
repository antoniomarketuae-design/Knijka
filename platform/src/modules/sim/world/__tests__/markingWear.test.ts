/**
 * Lane-marking paint treatment (doc 82 §3.2 V1).
 *
 * Two things are pinned here.
 *
 * 1. THE SHADOW FLAG. Doc 82 §1.2 item 7 measured the markings mesh as the
 *    ONE ground mesh in StaticWorld without `receiveShadow`, so paint glowed
 *    at full value straight through building and car shadows. There is no DOM
 *    test environment in this repo (vitest runs in node), so the invariant is
 *    enforced by SOURCE SCAN — deliberately, because the invariant IS
 *    „no ground mesh may be declared without the flag", and a scan catches the
 *    next one too. It fails without the fix.
 *
 * 2. THE SHADER HOOK, against the REAL three shader sources — same rule as
 *    macroVariation.test.ts: a three upgrade that renames a chunk anchor must
 *    fail here rather than silently flatten the paint in the browser.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ShaderChunk, ShaderLib } from "three";
import {
  markingWearOnBeforeCompile,
  markingWearProgramCacheKey,
  PAINT_ALPHA_TEST,
  PAINT_EDGE_BAND,
  PAINT_NORMAL_SCALE,
  PAINT_WEAR_STRENGTH,
  PAINT_WEAR_TILE_M,
} from "../textures/markingWear";
import { ROAD_TILE_SPAN_M } from "../textures/groundScale";
import { macroProgramCacheKey } from "../textures/macroVariation";

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

describe("StaticWorld ground meshes take shadow", () => {
  it("every geometry mesh declares receiveShadow — including the markings", () => {
    // Each `<mesh geometry={geometries.X}` opening tag, up to its `>`.
    const tags = STATIC_WORLD_SRC.match(/<mesh\s+geometry=\{geometries\.[\s\S]*?>/g);
    expect(tags).not.toBeNull();
    // road, junctions, parkingLanes, roadDecals, waterDecals, sidewalks,
    // markings, railDeck, railRails, terrain, terrainPaved, roofs.
    expect(tags!.length).toBeGreaterThanOrEqual(12);
    const missing = tags!.filter((t) => !t.includes("receiveShadow"));
    expect(missing).toEqual([]);
  });

  it("the markings mesh is the one that regressed — pin it by name", () => {
    const tag = STATIC_WORLD_SRC.match(/<mesh\s+geometry=\{geometries\.markings\}[\s\S]*?>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).toContain("receiveShadow={receive}");
  });

  it("the paint material binds the borrowed asphalt maps and the erosion test", () => {
    // The whole point of V1: paint inherits the ROAD's relief rather than
    // sitting on the world as a flat decal.
    expect(STATIC_WORLD_SRC).toContain("normalMap={asphalt?.normalMap ?? undefined}");
    expect(STATIC_WORLD_SRC).toContain("roughnessMap={asphalt?.roughnessMap ?? undefined}");
    expect(STATIC_WORLD_SRC).toContain("alphaTest={PAINT_ALPHA_TEST}");
  });
});

describe("markingWearOnBeforeCompile", () => {
  it("anchors exist in the installed three's standard shader", () => {
    const std = ShaderLib.standard;
    expect(std.vertexShader).toContain("#include <uv_vertex>");
    expect(std.vertexShader).toContain("#include <worldpos_vertex>");
    expect(std.fragmentShader).toContain("#include <map_fragment>");
    // The erosion writes diffuseColor.a, so alphatest_fragment must still run
    // AFTER map_fragment or nothing is ever discarded.
    const map = std.fragmentShader.indexOf("#include <map_fragment>");
    const alphaTest = std.fragmentShader.indexOf("#include <alphatest_fragment>");
    expect(map).toBeGreaterThanOrEqual(0);
    expect(alphaTest).toBeGreaterThan(map);
  });

  it("wires the ruled uniform defaults", () => {
    const shader = compileStub();
    markingWearOnBeforeCompile(shader as never);
    expect(shader.uniforms.uPaintWear?.value).toBeDefined();
    expect(shader.uniforms.uPaintWearScale?.value).toBeCloseTo(1 / PAINT_WEAR_TILE_M);
    expect(shader.uniforms.uPaintWearStrength?.value).toBeCloseTo(PAINT_WEAR_STRENGTH);
    expect(shader.uniforms.uPaintEdgeBand?.value).toBeCloseTo(PAINT_EDGE_BAND);
    // The tile scale MUST be the road's SPAN (not the photo size), or the
    // paint's micro-relief tiles at a different rate from the asphalt 12 mm
    // underneath it — which is the decal read V1 exists to remove. Doc 82 F4
    // halved that span for optic flow; the paint follows it automatically.
    expect(shader.uniforms.uPaintTileScale?.value).toBeCloseTo(1 / ROAD_TILE_SPAN_M);
    expect(ROAD_TILE_SPAN_M).toBe(1.5);
  });

  it("re-points the map UVs to world XZ in the vertex stage", () => {
    const shader = compileStub();
    markingWearOnBeforeCompile(shader as never);
    expect(shader.vertexShader).toContain("vPaintXZ = (modelMatrix * vec4( position, 1.0 )).xz;");
    expect(shader.vertexShader).toContain("vNormalMapUv = vPaintXZ * uPaintTileScale;");
    expect(shader.vertexShader).toContain("vRoughnessMapUv = vPaintXZ * uPaintTileScale;");
    // Guarded, because tier `low` fetches neither map and the varyings then
    // do not exist (uv_pars_vertex declares them under the same defines).
    expect(shader.vertexShader).toContain("#ifdef USE_NORMALMAP");
    expect(shader.vertexShader).toContain("#ifdef USE_ROUGHNESSMAP");
    // The override must land AFTER three's own assignment or it is a no-op.
    // onBeforeCompile still sees unresolved `#include`s, so the ordering is
    // asserted against the chunk that carries three's assignment.
    expect(ShaderChunk.uv_vertex).toContain("vNormalMapUv = ( normalMapTransform");
    expect(ShaderChunk.uv_vertex).toContain("vRoughnessMapUv = ( roughnessMapTransform");
    const own = shader.vertexShader.indexOf("#include <uv_vertex>");
    const ours = shader.vertexShader.indexOf("vNormalMapUv = vPaintXZ");
    expect(own).toBeGreaterThanOrEqual(0);
    expect(ours).toBeGreaterThan(own);
  });

  it("grimes the albedo and erodes only the edge band in the fragment stage", () => {
    const shader = compileStub();
    markingWearOnBeforeCompile(shader as never);
    const at = shader.fragmentShader.indexOf("#include <map_fragment>");
    const grime = shader.fragmentShader.indexOf("diffuseColor.rgb *= mix( 1.0 - uPaintWearStrength");
    const erode = shader.fragmentShader.indexOf("diffuseColor.a *= mix( paintWear, 1.0, paintEdge )");
    expect(grime).toBeGreaterThan(at);
    expect(erode).toBeGreaterThan(grime);
    // Edge distance comes from the builders' across-the-quad U, not a new
    // attribute (paintQuad / paintSolidLine / the glyph quads all agree).
    expect(shader.fragmentShader).toContain("min( vPaintUv.x, 1.0 - vPaintUv.x )");
    // Paint may never be brighter than authored — grime subtracts only.
    expect(PAINT_WEAR_STRENGTH).toBeGreaterThan(0);
    expect(PAINT_WEAR_STRENGTH).toBeLessThan(1);
    // Aggregate shows THROUGH the paint film; at full strength it reads gravel.
    expect(PAINT_NORMAL_SCALE).toBeLessThan(1);
    // The erosion is only meaningful if alphaTest can actually bite the
    // eroded fringe (alpha there falls to the noise value, mean ≈ 0.5).
    expect(PAINT_ALPHA_TEST).toBeGreaterThan(0);
    expect(PAINT_ALPHA_TEST).toBeLessThan(0.5);
    // …and only the OUTER band may erode: a stop line keeps a solid body.
    expect(PAINT_EDGE_BAND).toBeLessThan(1);
  });

  it("does not share a program cache key with the ground macro hook", () => {
    expect(markingWearProgramCacheKey()).not.toBe(macroProgramCacheKey());
    expect(markingWearProgramCacheKey()).toBe(markingWearProgramCacheKey());
  });

  it("shares one noise upload with the ground materials", () => {
    const a = compileStub();
    const b = compileStub();
    markingWearOnBeforeCompile(a as never);
    markingWearOnBeforeCompile(b as never);
    expect(a.uniforms.uPaintWear).toBe(b.uniforms.uPaintWear);
  });
});
