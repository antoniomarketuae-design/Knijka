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

import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Color, ShaderChunk, ShaderLib } from "three";
import {
  getSnowCover,
  getWinterCover,
  setSnowCover,
  setWinterCover,
  snowCoverOnBeforeCompile,
  snowCoverProgramCacheKey,
  winterDormantTint,
  SNOW_COVER_COLOR,
  SNOW_COVER_FACING_HI,
  SNOW_COVER_FACING_LO,
  SNOW_COVER_FRAGMENT_ANCHOR,
  SNOW_COVER_MAX,
  WINTER_COVER_MAX,
  WINTER_DORMANCY_FRAGMENT_ANCHOR,
  WINTER_DORMANT_VALUE,
  WINTER_GREEN_HI,
  WINTER_GREEN_LO,
} from "../textures/snowCover";
import { macroOnBeforeCompile } from "../textures/macroVariation";

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

  it("is an exact identity at zero snow AND zero winter — the property that makes it free for 148 lessons", () => {
    setSnowCover(0);
    setWinterCover(0);
    expect(getSnowCover()).toBe(0);
    expect(getWinterCover()).toBe(0);
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
    // …and the same shape for the winter dormancy term: a product with its own
    // uniform, so at uWinterCover === 0 it is 0 for every fragment whatever the
    // albedo.
    expect(shader.fragmentShader).toContain(
      "float winterDormancyAmount = uWinterCover * smoothstep( uWinterGreen.x, uWinterGreen.y, winterGreenFraction );",
    );
    // EVERY write this hook makes — not merely the first one of each kind, which
    // is what this loop used to check. It was `.find()`, and a second injected
    // term (the winter mix, spliced ahead of the snow one) would have slipped
    // past it in either direction. `.filter()` closes that: every assignment the
    // hook introduces must be a mix at an amount that is a product with a
    // uniform, which is the property the identity claim actually rests on.
    for (const term of ["diffuseColor.rgb =", "roughnessFactor =", "metalnessFactor ="]) {
      const lines = shader.fragmentShader
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith(term));
      expect(lines.length, `${term} must be written by the hook`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `${term} must be a mix at a zero-when-off amount`).toMatch(
          /mix\( .*, .*, (snowCoverAmount|winterDormancyAmount) \);$/,
        );
      }
    }
    // The two writes to diffuseColor are ordered leaves-then-snow: a tree goes
    // bare and THEN snow lies on it.
    expect(shader.fragmentShader.indexOf(WINTER_DORMANCY_FRAGMENT_ANCHOR)).toBeLessThan(
      shader.fragmentShader.indexOf(SNOW_COVER_FRAGMENT_ANCHOR),
    );
  });

  it("browns off foliage and nothing else — the greenness window excludes every neutral surface", () => {
    // The window is in `g / (r + g + b)` of the LINEAR albedo. Neutral grey —
    // asphalt, concrete, kerbs, galvanised steel, a sign plate — is exactly 1/3
    // whatever its brightness, and the low edge sits above it, so the season
    // cannot touch a single surface the rule engine grades on.
    expect(WINTER_GREEN_LO).toBeGreaterThan(1 / 3);
    expect(WINTER_GREEN_HI).toBeGreaterThan(WINTER_GREEN_LO);

    const greenFraction = (hex: number) => {
      const c = new Color(hex); // sRGB → the working space diffuseColor is in
      return c.g / (c.r + c.g + c.b);
    };
    // This project's own verge (canvasTextures.makeGrassTexture base) and a
    // representative baked canopy green: both inside the window, the canopy
    // fully saturated — grass dies back, a crown goes bare.
    expect(greenFraction(0x77875c)).toBeGreaterThan(WINTER_GREEN_LO);
    expect(greenFraction(0x5eab52)).toBeGreaterThan(WINTER_GREEN_HI);
    // …and the neutrals stay out, with room to spare.
    for (const neutral of [0x4a4a4a, 0x9aa0a6, 0xffffff, 0x2b2b2b]) {
      expect(greenFraction(neutral), neutral.toString(16)).toBeLessThan(WINTER_GREEN_LO);
    }
  });

  it("the dormant tint is luminance-neutral, so a canopy keeps its shading", () => {
    // The shader multiplies the fragment's OWN luminance through this tint. If
    // the tint were not normalised to unit luminance the term would double as a
    // brightness change and a winter canopy would go flat — the failure
    // SNOW_COVER_COLOR records for a whole-material tint on a tree.
    const t = winterDormantTint();
    const lum = 0.2126 * t.x + 0.7152 * t.y + 0.0722 * t.z;
    expect(lum).toBeCloseTo(WINTER_DORMANT_VALUE, 5);
    // Warm: dormant vegetation is straw-brown, never a cold grey (that is the
    // SNOW colour's job, and the two must not converge).
    expect(t.x).toBeGreaterThan(t.z);
  });

  it("caps the dormancy and clamps its input", () => {
    setWinterCover(1);
    expect(getWinterCover()).toBeCloseTo(WINTER_COVER_MAX);
    setWinterCover(0.5);
    expect(getWinterCover()).toBeCloseTo(WINTER_COVER_MAX / 2);
    setWinterCover(4);
    expect(getWinterCover()).toBeCloseTo(WINTER_COVER_MAX);
    setWinterCover(-1);
    expect(getWinterCover()).toBe(0);
    // Never total: Sofia streets carry conifers, and a street where literally
    // nothing is green reads as a colour grade rather than as winter.
    expect(WINTER_COVER_MAX).toBeLessThan(1);
    setWinterCover(0);
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
/** The SEASON's writer — same shape, same reason: a uniform nobody writes is a
 *  correct number that changes no pixel, and this one has to be written every
 *  frame because the uniform set outlives the scene that set it. */
const writesWinterUniform = (src: string) =>
  /useFrame\(\s*\(\)\s*=>\s*\{[\s\S]{0,300}?setWinterCover\(\s*winter\s*\?\s*1\s*:\s*0\s*\)/.test(
    src,
  );

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

  it("DistrictWorld writes the SEASON uniform every frame, from a prop a lesson can author", () => {
    const src = readComponent("DistrictWorld.tsx");
    expect(writesWinterUniform(src)).toBe(true);
    // The prop exists and is defaulted OFF, so every lesson that authors no
    // season renders exactly the bytes it rendered before.
    expect(src).toMatch(/winter\?:\s*boolean/);
    expect(src).toMatch(/winter\s*=\s*false/);
  });

  it("the SEASON reaches DistrictWorld from a lesson — LessonScene is the one wire", () => {
    // The half of this repair that is not in the world module: without this
    // line the uniform is written every frame with a value no lesson can ever
    // set, which is the dead-predicate shape stated at the head of this block.
    const scene = readFileSync(
      path.resolve(__dirname, "../../../../components/sim/LessonScene.tsx"),
      "utf8",
    );
    expect(scene).toContain("lesson.environment?.winter");
    // Both readers, from the ONE flag: the light grade and the foliage. A
    // winter light rig over full-leaf green canopies still photographs as July.
    expect(scene).toMatch(/<SimEnvironment[\s\S]{0,400}?winter=\{winter\}/);
    expect(scene).toMatch(/<DistrictWorld[\s\S]{0,400}?winter=\{winter\}/);
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

    // Same two cuts for the season.
    expect(
      writesWinterUniform(districtSrc.replace(/setWinterCover\(\s*winter\s*\?\s*1\s*:\s*0\s*\)/, "")),
    ).toBe(false);
    expect(writesWinterUniform(districtSrc.replace(/useFrame\(/g, "useEffect("))).toBe(false);
  });
});

/**
 * WAVE 8 — THE HOOK REACHES THE SURFACES THE FINDING PHOTOGRAPHED.
 *
 * sc-ac-snow:cfb2d46d (critical): «No snow has accumulated on any
 * off-carriageway surface in shot — kerbs, pavements, guard rail and building
 * faces are all bare.» This file's own header records the root cause and then
 * attaches the hook in `WorldProps.makeSharedMaterials()` — five PROP
 * materials. Of the four surfaces the row names, only the guard rail was ever
 * in scope: kerbs and pavements are `StaticWorld`'s `geometries.sidewalks` and
 * the verge is `geometries.terrain`, and neither was hooked to anything.
 *
 * A predicate with no consumer on the surface it is about is the shape this
 * programme keeps re-finding, so the gate is on the WIRING, not on the maths.
 */
describe("wave 8 — the ground carries the snow term too", () => {
  const STATIC_WORLD_SRC = fs.readFileSync(
    path.resolve(__dirname, "../components/StaticWorld.tsx"),
    "utf8",
  );

  it("StaticWorld composes the snow hook onto its ground materials", () => {
    expect(STATIC_WORLD_SRC).toContain("snowCoverOnBeforeCompile(shader)");
    expect(STATIC_WORLD_SRC).toContain("snowCoverProgramCacheKey()");
    // Every ground spread is the composed one — terrain, paved courtyards,
    // roundabout islands and sidewalks, in both the PBR and the canvas-fallback
    // branch of each: 8 sites.
    expect(STATIC_WORLD_SRC.match(/\{\.\.\.GROUND_SNOW\}/g)?.length).toBe(8);
  });

  it("…and NOT onto the asphalt or the paint", () => {
    // The carriageway has its own snow response (weather.ts SNOW_ROAD_BRIGHTEN)
    // and the markings must never be buried — this file's own rule for sign
    // faces and signal lenses, applied to the paint the student is graded on.
    const roadBlock = STATIC_WORLD_SRC.slice(
      STATIC_WORLD_SRC.indexOf("{/* Road ribbons:"),
      STATIC_WORLD_SRC.indexOf("{/* Batched road decals"),
    );
    expect(roadBlock).not.toContain("GROUND_SNOW");
    const paintBlock = STATIC_WORLD_SRC.slice(
      STATIC_WORLD_SRC.indexOf("{/* Lane markings"),
      STATIC_WORLD_SRC.indexOf("{/* Lane markings") + 2000,
    );
    expect(paintBlock).not.toContain("GROUND_SNOW");
  });

  it("the two chained hooks do not fight over an anchor", () => {
    // They share only `#include <common>`, and a string `.replace` substitutes
    // the FIRST occurrence and leaves the include in place, so the second hook
    // still finds it. Proven by running the pair over a real shader pair rather
    // than asserted.
    const shader = compileStub() as unknown as import("three").WebGLProgramParametersWithUniforms;
    macroOnBeforeCompile(shader);
    snowCoverOnBeforeCompile(shader);
    expect(shader.vertexShader).toContain("varying vec2 vGroundMacroXZ;");
    expect(shader.vertexShader).toContain("varying float vSnowUp;");
    expect(shader.fragmentShader).toContain("uniform float uMacroStrength;");
    expect(shader.fragmentShader).toContain("uniform float uSnowCover;");
    expect(shader.fragmentShader).toContain(SNOW_COVER_FRAGMENT_ANCHOR);
    // …and in the other order, because nothing pins which hook runs first.
    const flipped = compileStub() as unknown as import("three").WebGLProgramParametersWithUniforms;
    snowCoverOnBeforeCompile(flipped);
    macroOnBeforeCompile(flipped);
    expect(flipped.fragmentShader).toContain("uniform float uMacroStrength;");
    expect(flipped.fragmentShader).toContain("uniform float uSnowCover;");
  });
});
