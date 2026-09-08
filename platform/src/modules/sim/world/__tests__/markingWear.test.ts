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
  PAINT_SNOW_DRIFT_HI,
  PAINT_SNOW_DRIFT_LO,
  PAINT_SNOW_FRAGMENT_ANCHOR,
  PAINT_WEAR_STRENGTH,
  PAINT_WEAR_TILE_M,
} from "../textures/markingWear";
import { ROAD_TILE_SPAN_M } from "../textures/groundScale";
import { getMacroNoiseTexture, macroProgramCacheKey } from "../textures/macroVariation";
import {
  ROAD_SNOW_PATCH_HI,
  ROAD_SNOW_PATCH_LO,
  ROAD_SNOW_PATCH_TILE_M,
  roadSurfaceOnBeforeCompile,
} from "../textures/roadSurface";
import { getSnowPaintCover, setSnowCover } from "../textures/snowCover";

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SNOW LYING OVER THE PAINT — the second clause of `sc-ac-snow:f1673b60`
 * („bare grey asphalt WITH CLEAN UNBROKEN WHITE EDGE AND LANE MARKINGS").
 *
 * `roadSurface.ts`'s drift mix closed the asphalt half; the stripe was left
 * untouched by every snow term in the tree, so the lesson whose instruction 1
 * reads «пътят е заснежен» drew a razor-clean line down a white road. What is
 * pinned here is the three things that make the fix a repair rather than a
 * second weather: the operation is ALPHA and never colour, the drift is the
 * SAME drift the road beside it carries, and the window is the shipped field's
 * own quantiles rather than a taste.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("the markings take the carriageway's snow — as occlusion, not as tint", () => {
  /** The shipped field's samples, 0..1, exactly as `texture2D().r` sees them. */
  const field = Array.from(getMacroNoiseTexture().image.data as Uint8Array, (b) => b / 255);
  const sorted = [...field].sort((a, b) => a - b);
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  /** GLSL `smoothstep`, to the letter. */
  const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  it("the window IS the field's own quantiles — derived, not picked", () => {
    expect(PAINT_SNOW_DRIFT_LO).toBeCloseTo(q(0.6), 2);
    expect(PAINT_SNOW_DRIFT_HI).toBeCloseTo(q(0.95), 2);
    expect(PAINT_SNOW_DRIFT_LO).toBeLessThan(PAINT_SNOW_DRIFT_HI);
    // It is DEEPER into the field than the carriageway's, and that ordering is
    // the physics: the asphalt asks „how white", the stripe asks „buried or
    // not", and only the deepest drifts bury one.
    expect(PAINT_SNOW_DRIFT_LO).toBeGreaterThan(ROAD_SNOW_PATCH_LO);
    expect(PAINT_SNOW_DRIFT_HI).toBeGreaterThan(ROAD_SNOW_PATCH_HI);
  });

  it("buries a fifth of the stripe — enough to break it, not enough to lose it", () => {
    // The stripe's BODY (`paintEdge` = 1, so alpha is 1 before snow), at full
    // snowfall (`uSnowPaint` = 1). alphaTest discards below PAINT_ALPHA_TEST.
    const buried =
      field.filter((x) => 1 - smoothstep(PAINT_SNOW_DRIFT_LO, PAINT_SNOW_DRIFT_HI, x) < PAINT_ALPHA_TEST)
        .length / field.length;
    // Below the lower bound the row's own word survives — a stripe that loses
    // only its fringe is still an unbroken line. Above the upper one the line
    // stops being followable, and lane discipline is a skill the picture would
    // have taken away.
    expect(buried).toBeGreaterThan(0.12);
    expect(buried).toBeLessThan(0.25);
  });

  it("the stripe goes exactly where the road beside it is whitest", () => {
    // The continuity claim, as arithmetic rather than as a sentence: over the
    // texels that bury the paint, the CARRIAGEWAY's own drift weight is at its
    // cap. A stripe that vanished where the road was bare would be a second
    // weather, which is the failure `roadSurface.ts` rules out for the decals.
    const buriedRoadPatch = field
      .filter((x) => 1 - smoothstep(PAINT_SNOW_DRIFT_LO, PAINT_SNOW_DRIFT_HI, x) < PAINT_ALPHA_TEST)
      .map((x) => smoothstep(ROAD_SNOW_PATCH_LO, ROAD_SNOW_PATCH_HI, x));
    expect(buriedRoadPatch.length).toBeGreaterThan(0);
    expect(Math.min(...buriedRoadPatch)).toBeGreaterThan(0.9);
  });

  it("the operation is ALPHA — the surviving paint keeps the value it had", () => {
    const shader = compileStub();
    markingWearOnBeforeCompile(shader as never);
    expect(shader.fragmentShader).toContain(PAINT_SNOW_FRAGMENT_ANCHOR);
    // The anchor may never touch `diffuseColor.rgb`: brightening the stripe is
    // exactly what StaticWorld's `paintWet` block forbids, because it lands
    // white-on-white and takes away the cue the rule engine grades.
    expect(PAINT_SNOW_FRAGMENT_ANCHOR).toContain("diffuseColor.a *=");
    expect(PAINT_SNOW_FRAGMENT_ANCHOR).not.toContain("diffuseColor.rgb");
    expect(PAINT_SNOW_FRAGMENT_ANCHOR).not.toContain("uSnowColor");
    // …and it runs after the erosion, so a fragment already at the fringe is
    // not resurrected by an ordering accident.
    const erode = shader.fragmentShader.indexOf("diffuseColor.a *= mix( paintWear, 1.0, paintEdge )");
    expect(shader.fragmentShader.indexOf(PAINT_SNOW_FRAGMENT_ANCHOR)).toBeGreaterThan(erode);
  });

  it("samples the SAME field at the SAME scale as the asphalt's own drift", () => {
    const paint = compileStub();
    const asphalt = compileStub();
    markingWearOnBeforeCompile(paint as never);
    roadSurfaceOnBeforeCompile(asphalt as never);
    // One upload — the paint's wear texture IS the drift field the road reads.
    expect(paint.uniforms.uPaintWear!.value).toBe(asphalt.uniforms.uRoadTap!.value);
    // …at the road's metres-per-tile, not the paint's 3.2 m wear scale, or the
    // drift on the stripe is a different drift from the one around it.
    expect(paint.uniforms.uPaintSnowScale!.value).toBe(asphalt.uniforms.uRoadSnowScale!.value);
    expect(paint.uniforms.uPaintSnowScale!.value).toBeCloseTo(1 / ROAD_SNOW_PATCH_TILE_M);
    expect(paint.uniforms.uPaintSnowScale!.value).not.toBeCloseTo(1 / PAINT_WEAR_TILE_M);
    expect(paint.uniforms.uPaintSnowLo!.value).toBeCloseTo(PAINT_SNOW_DRIFT_LO);
    expect(paint.uniforms.uPaintSnowHi!.value).toBeCloseTo(PAINT_SNOW_DRIFT_HI);
  });

  it("the channel is the shared one, by reference, and its writer already ticks", () => {
    const shader = compileStub();
    markingWearOnBeforeCompile(shader as never);
    // A uniform nobody writes computes nothing. `DistrictWorld` calls
    // `setSnowCover` every frame; this is the same object it writes into.
    setSnowCover(1);
    expect((shader.uniforms.uSnowPaint!.value as number)).toBe(getSnowPaintCover());
    expect(shader.uniforms.uSnowPaint!.value).toBe(1);
    // FREE OUTSIDE A SNOW LESSON, and bit-identical rather than merely close:
    // `a *= 1.0 - 0.0 * patch` is `a * 1.0`.
    setSnowCover(0);
    expect(shader.uniforms.uSnowPaint!.value).toBe(0);
  });

  it("the program cache key moved — a v1 program would keep a clean line", () => {
    expect(markingWearProgramCacheKey()).toBe("marking-wear-v2");
  });

  it("routing: the hook reaches the shipped markings mesh and nothing else", () => {
    // A hook nobody attaches computes a perfectly correct number that changes
    // no pixel — the measured failure mode of this audit. `PAINT_WEAR` is the
    // spread that carries it, and it belongs to exactly one mesh.
    expect(STATIC_WORLD_SRC.match(/\{\.\.\.PAINT_WEAR\}/g)?.length).toBe(1);
    const markingsMesh = STATIC_WORLD_SRC.slice(
      STATIC_WORLD_SRC.indexOf("<mesh geometry={geometries.markings}"),
      STATIC_WORLD_SRC.indexOf("{/* Railway level-crossing"),
    );
    expect(markingsMesh).toContain("{...PAINT_WEAR}");
    expect(markingsMesh).toContain("alphaTest={PAINT_ALPHA_TEST}");
  });
});
