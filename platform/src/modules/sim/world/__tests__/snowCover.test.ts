/**
 * Prop snow-cover shader hook (sweep w11, `sc-ac-snow:cfb2d46d`).
 *
 * Like `macroVariation.test.ts` this rewrites the REAL three.js
 * MeshStandardMaterial sources in node — shader chunks are plain strings, no
 * GPU — so a three upgrade that renames an anchor fails here instead of
 * silently un-snowing the world in the browser. This hook takes FOUR anchors
 * (two per stage) and one of them, `<color_fragment>`, was chosen over the
 * `<map_fragment>` the sibling hooks use; the ordering test below is the thing
 * that keeps that choice from being undone by a copy-paste.
 *
 * The load-bearing assertion in this file is the IDENTITY one. This hook is
 * attached to five materials that every single lesson in the corpus renders,
 * and only ONE lesson in the corpus authors `weather: "snow"`. The claim that
 * the other 149 are untouched is therefore the claim that makes the change
 * shippable, and it is a claim about the emitted GLSL, so it is checked as one.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ShaderChunk, ShaderLib } from "three";
import {
  getSnowCover,
  setSnowCover,
  snowCoverOnBeforeCompile,
  snowCoverProgramCacheKey,
  SNOW_COVER_COLOR,
  SNOW_COVER_FACING_HI,
  SNOW_COVER_FACING_LO,
  SNOW_COVER_FRAGMENT_ANCHOR,
  SNOW_COVER_MAX,
} from "../textures/snowCover";

type ShaderStub = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

function compileStub(): ShaderStub {
  const std = ShaderLib.standard;
  return { uniforms: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
}

describe("snowCoverOnBeforeCompile (snow lying on props)", () => {
  it("all four anchors exist in the installed three's standard shader", () => {
    const std = ShaderLib.standard;
    expect(std.vertexShader).toContain("#include <common>");
    expect(std.vertexShader).toContain("#include <defaultnormal_vertex>");
    expect(std.fragmentShader).toContain("#include <color_fragment>");
    expect(std.fragmentShader).toContain("#include <roughnessmap_fragment>");
    expect(std.fragmentShader).toContain("#include <metalnessmap_fragment>");
    expect(ShaderChunk.defaultnormal_vertex).toBeDefined();
    expect(ShaderChunk.color_fragment).toBeDefined();
    expect(ShaderChunk.roughnessmap_fragment).toBeDefined();
    expect(ShaderChunk.metalnessmap_fragment).toBeDefined();
  });

  it("the world-normal helper and the view matrix the vertex splice needs are both in scope", () => {
    // `transformNormalByInverseViewMatrix` is declared in <common>, which the
    // standard VERTEX shader includes; `viewMatrix` comes from three's own
    // vertex prefix. Neither is ours, so both are asserted rather than assumed.
    expect(ShaderChunk.common).toContain("transformNormalByInverseViewMatrix");
    // defaultnormal_vertex is what folds instanceMatrix into the normal — the
    // whole reason the splice reads `transformedNormal` instead of `normal`.
    expect(ShaderChunk.defaultnormal_vertex).toContain("instanceMatrix");
  });

  it("injects the uniforms, the varying and the three surface terms", () => {
    const shader = compileStub();
    snowCoverOnBeforeCompile(shader as never);

    expect(shader.uniforms.uSnowCover?.value).toBe(getSnowCover());
    expect((shader.uniforms.uSnowColor?.value as { getHex(): number }).getHex()).toBe(
      SNOW_COVER_COLOR,
    );
    const facing = shader.uniforms.uSnowFacing?.value as { x: number; y: number };
    expect(facing.x).toBeCloseTo(SNOW_COVER_FACING_LO);
    expect(facing.y).toBeCloseTo(SNOW_COVER_FACING_HI);

    expect(shader.vertexShader).toContain("varying float vSnowUp;");
    expect(shader.vertexShader).toContain(
      "vSnowUp = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix ).y;",
    );
    expect(shader.fragmentShader).toContain("varying float vSnowUp;");
    expect(shader.fragmentShader).toContain(SNOW_COVER_FRAGMENT_ANCHOR);
    expect(shader.fragmentShader).toContain(
      "roughnessFactor = mix( roughnessFactor, uSnowRoughness, snowCoverAmount );",
    );
    expect(shader.fragmentShader).toContain(
      "metalnessFactor = mix( metalnessFactor, 0.0, snowCoverAmount );",
    );

    // Each anchor consumed exactly once — a double splice would redeclare the
    // varying and fail to compile only in the browser.
    expect(shader.fragmentShader.match(/varying float vSnowUp;/g)?.length).toBe(1);
    expect(shader.fragmentShader.match(/float snowCoverAmount =/g)?.length).toBe(1);
  });

  it("mixes AFTER the vertex colours and BEFORE they are used, not after map_fragment", () => {
    const shader = compileStub();
    snowCoverOnBeforeCompile(shader as never);
    const map = shader.fragmentShader.indexOf("#include <map_fragment>");
    const color = shader.fragmentShader.indexOf("#include <color_fragment>");
    const mix = shader.fragmentShader.indexOf(SNOW_COVER_FRAGMENT_ANCHOR);
    // The prop materials are vertexColors:true and three applies vColor AFTER
    // the map, so a mix spliced at map_fragment would be multiplied by the
    // prop's own green/steel tint afterwards and the snow would come out green.
    expect(map).toBeGreaterThanOrEqual(0);
    expect(color).toBeGreaterThan(map);
    expect(mix).toBeGreaterThan(color);
    // The amount is declared before every one of its three readers.
    const decl = shader.fragmentShader.indexOf("float snowCoverAmount =");
    expect(decl).toBeLessThan(mix);
    expect(decl).toBeLessThan(shader.fragmentShader.indexOf("roughnessFactor = mix("));
    expect(decl).toBeLessThan(shader.fragmentShader.indexOf("metalnessFactor = mix("));
  });

  it("is an exact identity at zero snow — the property that makes it free for 149 lessons", () => {
    setSnowCover(0);
    expect(getSnowCover()).toBe(0);
    const shader = compileStub();
    snowCoverOnBeforeCompile(shader as never);
    // Every term is `mix(existing, snowValue, snowCoverAmount)`, and
    // `snowCoverAmount` is `uSnowCover * smoothstep(...)`. At uSnowCover === 0
    // that product is 0 for every fragment whatever the normal, and GLSL
    // mix(x, y, 0.0) is x * 1.0 + y * 0.0 — bit-identical, not approximately.
    // Assert the SHAPE that guarantees it: the cover is a product with the
    // uniform, and nothing is ADDED to the surface outside a mix.
    expect(shader.fragmentShader).toContain(
      "float snowCoverAmount = uSnowCover * smoothstep( uSnowFacing.x, uSnowFacing.y, vSnowUp );",
    );
    for (const term of ["diffuseColor.rgb =", "roughnessFactor =", "metalnessFactor ="]) {
      const line = shader.fragmentShader
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(term));
      expect(line, `${term} must be a mix at snowCoverAmount`).toMatch(
        /mix\( .*, .*, snowCoverAmount \);$/,
      );
    }
  });

  it("caps the cover and clamps its input", () => {
    setSnowCover(1);
    expect(getSnowCover()).toBeCloseTo(SNOW_COVER_MAX);
    setSnowCover(0.5);
    expect(getSnowCover()).toBeCloseTo(SNOW_COVER_MAX / 2);
    setSnowCover(4);
    expect(getSnowCover()).toBeCloseTo(SNOW_COVER_MAX);
    setSnowCover(-1);
    expect(getSnowCover()).toBe(0);
    // Never fully white: a canopy mixed the whole way stops being a landmark.
    expect(SNOW_COVER_MAX).toBeLessThan(1);
    setSnowCover(0);
  });

  it("shares one uniform set and one cache key across materials", () => {
    const a = compileStub();
    const b = compileStub();
    snowCoverOnBeforeCompile(a as never);
    snowCoverOnBeforeCompile(b as never);
    expect(a.uniforms.uSnowCover).toBe(b.uniforms.uSnowCover);
    expect(a.uniforms.uSnowColor).toBe(b.uniforms.uSnowColor);
    expect(snowCoverProgramCacheKey()).toBe(snowCoverProgramCacheKey());
    // Distinct from the ground hook's key: a prop material must never be
    // handed the ground-macro program or vice versa.
    expect(snowCoverProgramCacheKey()).not.toBe("ground-macro-v1");
  });
});

// ---------------------------------------------------------------------------
// THE ROUTING GUARD — the half that stops this being a dead predicate.
//
// A shader hook nobody attaches, or a uniform nobody writes, computes a
// perfectly correct number that changes no pixel. That is the measured failure
// mode of this audit (51 of 82 repairs in one sample shipped a measurement with
// no live consumer), so the hook's own correctness is only half the evidence.
// The other half is that the five shipped prop materials CARRY it and that
// exactly one component WRITES it, and both are read out of the real sources.
//
// Every check below is also run against a MUTATED copy of the same source with
// its leg cut out, so a green here is load-bearing rather than vacuous.
// ---------------------------------------------------------------------------

const COMPONENTS_DIR = path.resolve(__dirname, "../components");
const readComponent = (file: string) => readFileSync(path.join(COMPONENTS_DIR, file), "utf8");

/** The body of the shared-material factory, so a hook attached to some OTHER
 *  material elsewhere in a 2,400-line file cannot satisfy these assertions. */
function sharedMaterialFactory(src: string): string {
  const start = src.indexOf("function makeSharedMaterials(");
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf("async function buildPropAssets(", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const attachesHook = (factory: string) =>
  /onBeforeCompile\s*=\s*snowCoverOnBeforeCompile/.test(factory);
const attachesCacheKey = (factory: string) =>
  /customProgramCacheKey\s*=\s*snowCoverProgramCacheKey/.test(factory);
const writesUniform = (src: string) =>
  /useFrame\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}?setSnowCover\(\s*getSnowIntensity\(\)\s*\)/.test(src);

describe("routing: the hook reaches the shipped materials and something writes it", () => {
  it("every shared prop material is built by the one hooked factory", () => {
    const factory = sharedMaterialFactory(readComponent("WorldProps.tsx"));
    // ONE construction site, so there is no second, unhooked path.
    expect(factory.match(/new THREE\.MeshStandardMaterial\(/g)?.length).toBe(1);
    // …and all five families come out of it. If a sixth is added it must be
    // added here too, which is the point of listing them.
    for (const name of ["signBody", "signalHousing", "streetSteel", "tree", "furniture"]) {
      expect(factory, `${name} must come from the hooked std() factory`).toMatch(
        new RegExp(`${name}:\\s*std\\(`),
      );
    }
    expect(attachesHook(factory)).toBe(true);
    expect(attachesCacheKey(factory)).toBe(true);
  });

  it("DistrictWorld writes the uniform every frame from the shared snow channel", () => {
    const src = readComponent("DistrictWorld.tsx");
    expect(writesUniform(src)).toBe(true);
    // The value must come from the same store SkyDome/SnowFlakes/StaticWorld
    // read, not from a second source that could disagree with the picture.
    expect(src).toContain('from "@/modules/sim/environment"');
    expect(src).toContain("getSnowIntensity");
  });

  it("cutting either leg out of the REAL source turns the guard red", () => {
    const factory = sharedMaterialFactory(readComponent("WorldProps.tsx"));
    expect(
      attachesHook(factory.replace(/onBeforeCompile\s*=\s*snowCoverOnBeforeCompile/, "")),
    ).toBe(false);
    expect(
      attachesCacheKey(factory.replace(/customProgramCacheKey\s*=\s*snowCoverProgramCacheKey/, "")),
    ).toBe(false);

    const districtSrc = readComponent("DistrictWorld.tsx");
    expect(
      writesUniform(districtSrc.replace(/setSnowCover\(\s*getSnowIntensity\(\)\s*\)/, "")),
    ).toBe(false);
    // A setSnowCover call that is NOT inside a per-frame loop is also dead —
    // the uniform would freeze at whatever the channel read on mount.
    expect(writesUniform(districtSrc.replace(/useFrame\(/g, "useEffect("))).toBe(false);
  });
});
