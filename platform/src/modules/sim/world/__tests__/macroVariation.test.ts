/**
 * Macro-variation shader hook tests (doc 71 §4.4). The hook rewrites the
 * REAL three.js MeshStandardMaterial shader sources by string replacement —
 * lane 05 §4a's explicit caveat is that the chunk anchors must stay verified
 * against the installed three version. This runs in node (shader sources are
 * plain strings; no GPU needed) so an upgrade that renames an anchor fails CI
 * here instead of silently disabling the ground variation in the browser.
 */

import { describe, expect, it } from "vitest";
import { ShaderChunk, ShaderLib } from "three";
import { macroOnBeforeCompile, macroProgramCacheKey } from "../textures/macroVariation";

type ShaderStub = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

function compileStub(): ShaderStub {
  // The exact sources three hands to onBeforeCompile for MeshStandardMaterial.
  const std = ShaderLib.standard;
  return {
    uniforms: {},
    vertexShader: std.vertexShader,
    fragmentShader: std.fragmentShader,
  };
}

describe("macroOnBeforeCompile (ground macro variation)", () => {
  it("anchors exist in the installed three's standard shader", () => {
    const std = ShaderLib.standard;
    expect(std.vertexShader).toContain("#include <common>");
    expect(std.vertexShader).toContain("#include <worldpos_vertex>");
    expect(std.fragmentShader).toContain("#include <common>");
    expect(std.fragmentShader).toContain("#include <map_fragment>");
    // The chunks themselves still resolve (rename would break includes).
    expect(ShaderChunk.worldpos_vertex).toBeDefined();
    expect(ShaderChunk.map_fragment).toBeDefined();
  });

  it("injects the uniforms, varying and albedo modulation into both stages", () => {
    const shader = compileStub();
    macroOnBeforeCompile(shader as never);

    // Uniforms wired (shared singleton texture + ruled values).
    expect(shader.uniforms.uMacro?.value).toBeDefined();
    expect(shader.uniforms.uMacroScale?.value).toBeCloseTo(1 / 80);
    expect(shader.uniforms.uMacroStrength?.value).toBeCloseTo(0.22);

    // Varying declared in BOTH stages, written in the vertex stage.
    expect(shader.vertexShader).toContain("varying vec2 vGroundMacroXZ;");
    expect(shader.vertexShader).toContain(
      "vGroundMacroXZ = (modelMatrix * vec4( position, 1.0 )).xz;",
    );
    expect(shader.fragmentShader).toContain("varying vec2 vGroundMacroXZ;");
    expect(shader.fragmentShader).toContain("uniform sampler2D uMacro;");

    // Modulation lands AFTER map_fragment (so it multiplies the sampled map)
    // and touches diffuseColor only — never roughness (the wet-road roughness
    // lerp must stay authoritative, doc 71 §4.4).
    const at = shader.fragmentShader.indexOf("#include <map_fragment>");
    const inject = shader.fragmentShader.indexOf("diffuseColor.rgb *= mix(");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(inject).toBeGreaterThan(at);
    expect(shader.fragmentShader).not.toContain("roughnessFactor *");

    // The anchors were consumed exactly once each (no duplicate injection).
    expect(shader.fragmentShader.match(/uniform sampler2D uMacro;/g)?.length).toBe(1);
    expect(shader.vertexShader.match(/varying vec2 vGroundMacroXZ;/g)?.length).toBe(1);
  });

  it("keeps the same shared uniforms across materials and a stable cache key", () => {
    const a = compileStub();
    const b = compileStub();
    macroOnBeforeCompile(a as never);
    macroOnBeforeCompile(b as never);
    // Same uniform OBJECTS -> all ground materials read one noise field.
    expect(a.uniforms.uMacro).toBe(b.uniforms.uMacro);
    expect(a.uniforms.uMacroScale).toBe(b.uniforms.uMacroScale);
    expect(macroProgramCacheKey()).toBe(macroProgramCacheKey());
  });

  it("noise texture is 256² single-channel, tileable and full-range", () => {
    const shader = compileStub();
    macroOnBeforeCompile(shader as never);
    const tex = shader.uniforms.uMacro!.value as {
      image: { data: Uint8Array; width: number; height: number };
      wrapS: number;
      wrapT: number;
    };
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(256);
    expect(tex.image.data.length).toBe(256 * 256); // RedFormat: 1 byte/px
    // Contrast-stretched to the full byte range (±strength means ±strength).
    let min = 255;
    let max = 0;
    for (const v of tex.image.data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBe(0);
    expect(max).toBe(255);
    // Tileable: opposite-edge rows/cols stay close (smooth periodic lattice —
    // the wrap seam must not exceed the typical neighbour step).
    const d = tex.image.data;
    let seam = 0;
    let interior = 0;
    for (let i = 0; i < 256; i++) {
      seam += Math.abs(d[i * 256]! - d[i * 256 + 255]!); // col 0 vs col 255
      interior += Math.abs(d[i * 256 + 127]! - d[i * 256 + 128]!);
    }
    expect(seam / 256).toBeLessThan(interior / 256 + 6);
  });
});
