/**
 * Canopy wind-sway shader hook (sweep161, `sc-ac-crosswind:e0b9507e`, critical:
 * „wind is never depicted in any form: no swaying trees, no drifting debris,
 * no leaning vehicles").
 *
 * Same shape as `snowCover.test.ts`, for the same reason: this rewrites the
 * REAL three.js MeshStandardMaterial sources in node — shader chunks are plain
 * strings, no GPU — so a three upgrade that renames an anchor fails here
 * instead of silently un-bending the world in the browser.
 *
 * TWO assertions in this file are the load-bearing ones.
 *
 *  1. THE IDENTITY. The hook is attached to the tree material, and EVERY
 *     district in the corpus plants trees (fo-follow-v1 40, ac-aqua-v1 52,
 *     mw-v1 132) while exactly two templates author `physics.crosswind`. The
 *     claim that the other ~148 lessons render the bytes they rendered before
 *     is therefore the claim that makes this shippable, and it is a claim
 *     about the emitted GLSL, so it is checked as one.
 *
 *  2. THE ROUTING. A uniform nobody writes bends nothing. This audit's
 *     measured failure mode is a repair that ships a predicate with no live
 *     consumer (51 of 82 in one sample), so the second half of the file reads
 *     the REAL `WorldProps.tsx` and `VehicleRig.tsx` sources and proves the
 *     hook is attached and the uniform is driven — each check re-run against a
 *     mutated copy of the same source with its leg cut out, so a green here
 *     cannot be vacuous.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ShaderChunk, ShaderLib } from "three";
import {
  getWindSway,
  setWindSway,
  windSwayOnBeforeCompile,
  windSwayProgramCacheKey,
  WIND_SWAY_BEND_ANCHOR,
  WIND_SWAY_CROWN_M,
  WIND_SWAY_MAX_M,
  WIND_SWAY_REFERENCE_N,
  WIND_SWAY_TRUNK_M,
  WIND_SWAY_VERTEX_ANCHOR,
} from "../textures/windSway";
import { snowCoverOnBeforeCompile, snowCoverProgramCacheKey } from "../textures/snowCover";
import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
} from "../../vehicle/tuning";

type ShaderStub = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

function compileStub(): ShaderStub {
  const std = ShaderLib.standard;
  return { uniforms: {}, vertexShader: std.vertexShader, fragmentShader: std.fragmentShader };
}

describe("windSwayOnBeforeCompile (the wind the student can see)", () => {
  it("both anchors exist in the installed three's standard vertex shader", () => {
    expect(ShaderLib.standard.vertexShader).toContain("#include <common>");
    expect(ShaderLib.standard.vertexShader).toContain("#include <project_vertex>");
    expect(ShaderChunk.project_vertex).toContain("vec4 mvPosition");
    expect(ShaderChunk.project_vertex).toContain("gl_Position = projectionMatrix * mvPosition;");
  });

  it("the world-position ladder the splice writes is three's own, not invented", () => {
    // `worldpos_vertex` is how three itself takes a vertex to world space, and
    // the splice mirrors it exactly — batching matrix, then instance matrix,
    // then modelMatrix. If a three release changes that order this goes red
    // and the next lane knows the bend is being computed in the wrong space,
    // instead of the trees quietly leaning by a per-instance amount.
    const ladder = ShaderChunk.worldpos_vertex;
    const bat = ladder.indexOf("batchingMatrix");
    const inst = ladder.indexOf("instanceMatrix");
    const model = ladder.indexOf("worldPosition = modelMatrix * worldPosition;");
    expect(bat).toBeGreaterThanOrEqual(0);
    expect(inst).toBeGreaterThan(bat);
    expect(model).toBeGreaterThan(inst);
    // …and `viewMatrix` is in the vertex stage's prefix, which is what
    // `viewMatrix[0].xyz` (world +X carried into view space) relies on. Proven
    // by a core chunk using it in the same stage rather than assumed.
    expect(ShaderChunk.envmap_vertex).toContain("viewMatrix");
  });

  it("injects the uniforms and both stages of the bend", () => {
    const shader = compileStub();
    windSwayOnBeforeCompile(shader as never);

    expect(shader.uniforms.uWindSway?.value).toBe(getWindSway());
    const window_ = shader.uniforms.uWindHeight?.value as { x: number; y: number };
    expect(window_.x).toBeCloseTo(WIND_SWAY_TRUNK_M);
    expect(window_.y).toBeCloseTo(WIND_SWAY_CROWN_M);

    expect(shader.vertexShader).toContain("uniform float uWindSway;");
    expect(shader.vertexShader).toContain("uniform vec2 uWindHeight;");
    expect(shader.vertexShader).toContain("vec4 windSwayWorld = modelMatrix * windSwayLocal;");
    expect(shader.vertexShader).toContain(WIND_SWAY_BEND_ANCHOR);
    expect(shader.vertexShader).toContain(WIND_SWAY_VERTEX_ANCHOR);
    // The chunk itself is still three's — bracketed, never replaced.
    expect(shader.vertexShader).toContain("#include <project_vertex>");
    // Each anchor consumed exactly once: a double splice would redeclare
    // `windSwayLocal` and fail to compile only in the browser.
    expect(shader.vertexShader.match(/vec4 windSwayLocal =/g)?.length).toBe(1);
    expect(shader.vertexShader.match(/float windSwayBend =/g)?.length).toBe(1);
    // The fragment stage is not touched at all — this is a shape change.
    expect(shader.fragmentShader).toBe(ShaderLib.standard.fragmentShader);
  });

  it("bends AFTER the projection and re-projects, so gl_Position carries it", () => {
    const shader = compileStub();
    windSwayOnBeforeCompile(shader as never);
    const bend = shader.vertexShader.indexOf(WIND_SWAY_BEND_ANCHOR);
    const chunk = shader.vertexShader.indexOf("#include <project_vertex>");
    const push = shader.vertexShader.indexOf(WIND_SWAY_VERTEX_ANCHOR);
    const reproject = shader.vertexShader.indexOf(
      "gl_Position = projectionMatrix * mvPosition;",
      push,
    );
    // The amount is computed before the chunk (it needs `transformed`, which
    // the chunk consumes), the displacement is applied after it (it needs
    // `mvPosition`, which the chunk declares), and gl_Position is recomputed
    // last — without that line the bend would move nothing on screen.
    expect(bend).toBeGreaterThanOrEqual(0);
    expect(chunk).toBeGreaterThan(bend);
    expect(push).toBeGreaterThan(chunk);
    expect(reproject).toBeGreaterThan(push);
  });

  it("is an exact identity at zero wind — the property that makes it free for ~148 lessons", () => {
    setWindSway(0);
    expect(getWindSway()).toBe(0);
    const shader = compileStub();
    windSwayOnBeforeCompile(shader as never);
    // `windSwayBend` is a PRODUCT with the uniform, so at uWindSway === 0 it is
    // 0 for every vertex whatever its height, and the only write to the
    // pipeline is `mvPosition.xyz += 0.0 * viewMatrix[0].xyz` — an exact
    // identity on finite input, not an approximate one. `transformed` itself
    // is never assigned, so world position, normals, the shadow pass and the
    // colliders are untouched at ANY wind.
    expect(shader.vertexShader).toContain(WIND_SWAY_BEND_ANCHOR);
    expect(WIND_SWAY_BEND_ANCHOR.startsWith("float windSwayBend = uWindSway *")).toBe(true);
    expect(shader.vertexShader).not.toMatch(/^\s*transformed\s*[+.]?=/m);
  });

  it("maps newtons to metres, clamps, and keeps the direction the car is pushed", () => {
    // The shipped envelope: constant 1200 N west plus a ±500 N sine, so the
    // total runs −1700..−700 N and the crown travels 0.70..0.29 m WEST — the
    // same way `LessonScene` pushes the chassis (`windLateralN` is negative).
    setWindSway(-WIND_SWAY_REFERENCE_N);
    expect(getWindSway()).toBeCloseTo(-WIND_SWAY_MAX_M);
    setWindSway(-(CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N));
    expect(getWindSway()).toBeCloseTo(-WIND_SWAY_MAX_M * (700 / 1700));
    // Sign follows the force: an eastward wind leans the canopies east.
    setWindSway(WIND_SWAY_REFERENCE_N);
    expect(getWindSway()).toBeCloseTo(WIND_SWAY_MAX_M);
    // Clamped both ways, and a non-finite reading parks the trees upright
    // rather than sending a NaN into every vertex of the street.
    setWindSway(-99999);
    expect(getWindSway()).toBeCloseTo(-WIND_SWAY_MAX_M);
    setWindSway(Number.NaN);
    expect(getWindSway()).toBe(0);
    setWindSway(0);
  });

  it("the reference force IS the shipped gust peak — a retune cannot drift the picture", () => {
    // The one number this module duplicates rather than imports (sim/world
    // must not depend on sim/vehicle for a constant). Pinned here so a change
    // in tuning.ts turns THIS red instead of quietly rescaling the lean.
    expect(WIND_SWAY_REFERENCE_N).toBe(CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N);
    expect(CROSSWIND_GUST_PERIOD_SEC).toBeGreaterThan(0);
    // A lean must be a lean, not a fall: under a metre at the crown of a
    // ~5-8 m street tree.
    expect(WIND_SWAY_MAX_M).toBeGreaterThan(0.2);
    expect(WIND_SWAY_MAX_M).toBeLessThan(1);
    // The trunk never shears and the window is a real ramp, not a step.
    expect(WIND_SWAY_TRUNK_M).toBeGreaterThan(0);
    expect(WIND_SWAY_CROWN_M).toBeGreaterThan(WIND_SWAY_TRUNK_M);
  });

  it("shares one uniform set and one cache key across materials", () => {
    const a = compileStub();
    const b = compileStub();
    windSwayOnBeforeCompile(a as never);
    windSwayOnBeforeCompile(b as never);
    expect(a.uniforms.uWindSway).toBe(b.uniforms.uWindSway);
    expect(a.uniforms.uWindHeight).toBe(b.uniforms.uWindHeight);
    expect(windSwayProgramCacheKey()).toBe(windSwayProgramCacheKey());
    expect(windSwayProgramCacheKey()).not.toBe(snowCoverProgramCacheKey());
  });

  it("chains with the snow hook in either order without either losing its anchor", () => {
    // They share only `#include <common>` in the vertex stage, and a string
    // `.replace` substitutes the FIRST occurrence and leaves the include in
    // place. Proven by running the pair rather than asserted — this is the
    // exact composition `WorldProps` ships on the tree material.
    const a = compileStub();
    snowCoverOnBeforeCompile(a as never);
    windSwayOnBeforeCompile(a as never);
    expect(a.vertexShader).toContain("varying float vSnowUp;");
    expect(a.vertexShader).toContain("uniform float uWindSway;");
    expect(a.vertexShader).toContain(WIND_SWAY_VERTEX_ANCHOR);
    expect(a.fragmentShader).toContain("uniform float uSnowCover;");

    const b = compileStub();
    windSwayOnBeforeCompile(b as never);
    snowCoverOnBeforeCompile(b as never);
    expect(b.vertexShader).toContain("varying float vSnowUp;");
    expect(b.vertexShader).toContain("uniform float uWindSway;");
    expect(b.vertexShader).toContain(WIND_SWAY_VERTEX_ANCHOR);
    expect(b.fragmentShader).toContain("uniform float uSnowCover;");
  });
});

// ---------------------------------------------------------------------------
// THE ROUTING GUARD — the half that stops this being a dead predicate.
// ---------------------------------------------------------------------------

const PROPS_SRC = readFileSync(
  path.resolve(__dirname, "../components/WorldProps.tsx"),
  "utf8",
);
const RIG_SRC = readFileSync(
  path.resolve(__dirname, "../../../../components/sim/VehicleRig.tsx"),
  "utf8",
);
const SIM_SRC = readFileSync(
  path.resolve(__dirname, "../../vehicle/VehicleSim.ts"),
  "utf8",
);

function sharedMaterialFactory(src: string): string {
  const start = src.indexOf("function makeSharedMaterials(");
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf("async function buildPropAssets(", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const attachesWindHook = (factory: string) =>
  /materials\.tree\.onBeforeCompile\s*=\s*\(shader\)\s*=>\s*\{[\s\S]{0,200}?windSwayOnBeforeCompile\(shader\)/.test(
    factory,
  );
const attachesWindCacheKey = (factory: string) =>
  /materials\.tree\.customProgramCacheKey\s*=[\s\S]{0,200}?windSwayProgramCacheKey\(\)/.test(
    factory,
  );
const rigWritesUniform = (src: string) =>
  /useFrame\(\([\s\S]{0,4000}?setWindSway\(\s*sim\.windLateralNow\s*\)/.test(src);

describe("routing: the bend reaches the shipped canopies and something drives it", () => {
  it("the tree material — and ONLY the tree material — carries the wind hook", () => {
    const factory = sharedMaterialFactory(PROPS_SRC);
    expect(attachesWindHook(factory)).toBe(true);
    expect(attachesWindCacheKey(factory)).toBe(true);
    // The snow hook still reaches all five via std(); the wind hook is the one
    // extra composition. A sign plate, a signal visor, a lamp column and a
    // bollard must stay rigid: they are what the student is graded on reading.
    expect(factory.match(/windSwayOnBeforeCompile/g)?.length).toBe(1);
    for (const other of ["signBody", "signalHousing", "streetSteel", "furniture"]) {
      expect(factory).not.toContain(`materials.${other}.onBeforeCompile`);
    }
    // …and the composed key is the PAIR, so three cannot hand a swaying canopy
    // the rigid props' program.
    expect(factory).toContain("snowCoverProgramCacheKey()");
    expect(factory).toContain("windSwayProgramCacheKey()");
  });

  it("VehicleRig writes the uniform every render frame from the sim's own gust", () => {
    expect(rigWritesUniform(RIG_SRC)).toBe(true);
    expect(RIG_SRC).toContain('import { setWindSway } from "@/modules/sim/world";');
    // …and parks the trees on unmount: the uniform is a module singleton that
    // outlives the scene, so a crosswind lesson followed by a calm one would
    // otherwise leave the next street leaning.
    expect(RIG_SRC).toContain("setWindSway(0);");
  });

  it("the picture and the force are ONE number, not two clocks", () => {
    // `step()` and `windLateralNow` both go through `currentWindN()`. If a
    // later change recomputes the gust sine anywhere else, the two can drift
    // out of phase exactly where the lesson asks the student to read the gust.
    expect(SIM_SRC.match(/Math\.sin\(\(2 \* Math\.PI \* this\.windClockSec\)/g)?.length).toBe(1);
    expect(SIM_SRC).toContain("this.body.addForce({ x: this.currentWindN(), y: 0, z: 0 }, true);");
    expect(SIM_SRC).toContain("get windLateralNow(): number {");
  });

  it("cutting any leg out of the REAL source turns the guard red", () => {
    const factory = sharedMaterialFactory(PROPS_SRC);
    expect(attachesWindHook(factory.replace(/windSwayOnBeforeCompile\(shader\);/, ""))).toBe(false);
    expect(attachesWindCacheKey(factory.replace(/windSwayProgramCacheKey\(\)/, ""))).toBe(false);
    expect(rigWritesUniform(RIG_SRC.replace(/setWindSway\(\s*sim\.windLateralNow\s*\)/, ""))).toBe(
      false,
    );
    // A setWindSway call that is not inside a per-frame loop is also dead —
    // the canopies would freeze at whatever the sim read on mount.
    expect(rigWritesUniform(RIG_SRC.replace(/useFrame\(/g, "useEffect("))).toBe(false);
  });
});
