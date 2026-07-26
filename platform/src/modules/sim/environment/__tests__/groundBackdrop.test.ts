/**
 * The ground backdrop contract.
 *
 * The defect this defends against is not subtle and not hypothetical: it was
 * measured off a shipped frame (see ./groundBackdrop's header). What is pinned
 * here is everything about the fix that can be checked without a GPU — the two
 * bounds that make the disc work at all (it must sit inside the sky dome, and
 * its haze must complete before its rim), the guarantee that it changes NOTHING
 * at the distances where a real terrain edge meets it, and the structural facts
 * that keep the "one draw call, no textures, no collider" promise doc 82 §2.2's
 * phone budget rests on.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backdropHazeAt,
  fogOpacityAt,
  GROUND_BACKDROP_ALBEDO,
  GROUND_BACKDROP_HAZE_END_M,
  GROUND_BACKDROP_HAZE_START_M,
  GROUND_BACKDROP_RADIUS_M,
  GROUND_BACKDROP_SEGMENTS,
  GROUND_BACKDROP_Y,
  horizonHazeAt,
  HORIZON_HAZE_ANCHOR,
  HORIZON_HAZE_FRAGMENT,
} from "../groundBackdropShader";
import { ENVIRONMENT_PRESETS } from "../presets";
import { SKY_DOME_RADIUS_M } from "../skyShader";

const ENV_DIR = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(ENV_DIR, file), "utf8");

/** Every clear-weather fog density the sim can be driving under. Rain, fog and
 *  snow weather are all DENSER than these (presets.ts), so clear is the worst
 *  case for hiding anything at distance — assert against it. */
const CLEAR_DENSITIES = Object.values(ENVIRONMENT_PRESETS).map((p) => p.fog.density);

/** Where `tj-stop-v1`'s terrain ends as seen from the clip's chase camera:
 *  bounds maxY 0 + TERRAIN_MARGIN_M 60, ~15 m behind the camera. */
const SHIPPED_TERRAIN_EDGE_M = 75;

describe("the defect", () => {
  it("fog alone cannot hide a terrain edge at the distance maps put one", () => {
    // This is the whole reason the disc has to exist rather than "just turn up
    // the fog": at 75 m even the densest clear preset is barely started, so a
    // ground plane that ENDS there ends in full, saturated colour against the
    // sky. Raising the density enough to cover it would put a wall 40 m in
    // front of the driver and break the 100 m signage legibility the rule
    // engine depends on (presets.ts, day fog note).
    for (const density of CLEAR_DENSITIES) {
      expect(fogOpacityAt(SHIPPED_TERRAIN_EDGE_M, density)).toBeLessThan(0.12);
    }
  });
});

describe("disc geometry", () => {
  it("stays inside the sky dome", () => {
    // Load-bearing: the dome is a depth-tested mesh at its own radius, so
    // ground drawn past it terminates at the dome — the original bug, moved
    // outward and made draw-order dependent.
    expect(GROUND_BACKDROP_RADIUS_M).toBeLessThan(SKY_DOME_RADIUS_M);
    // …with room for the rim's own slant distance from a raised camera and for
    // anyone who nudges either number later.
    expect(SKY_DOME_RADIUS_M - GROUND_BACKDROP_RADIUS_M).toBeGreaterThanOrEqual(20);
  });

  it("sits below the lowest terrain vertex any world can emit", () => {
    // world/builders/terrain.ts writes y = h - 0.01 with h >= 0, so -0.01 is
    // the floor. Below that by enough to be many depth-buffer LSBs apart
    // wherever the two overlap, and not so far that the step where they meet
    // is resolvable.
    expect(GROUND_BACKDROP_Y).toBeLessThan(-0.01);
    expect(GROUND_BACKDROP_Y).toBeGreaterThan(-1);
  });

  it("is one draw call's worth of geometry, not a tile grid", () => {
    // doc 82 §2.2: 70 draws / 250k triangles per frame on the phone tier. A
    // fan of this many triangles is noise against that; hundreds of ground
    // tiles would not be.
    expect(GROUND_BACKDROP_SEGMENTS).toBeLessThanOrEqual(128);
    expect(GROUND_BACKDROP_ALBEDO).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("horizon fade", () => {
  it("is a no-op everywhere a scenario map's ground can end", () => {
    // The seam against the real terrain must be invisible, and the only way to
    // guarantee that is for the disc to be rendering EXACTLY what plain scene
    // fog renders at those distances. Every scenario micro-map's terrain edge
    // sits far inside this.
    for (const d of [0, SHIPPED_TERRAIN_EDGE_M, 200, 300, GROUND_BACKDROP_HAZE_START_M]) {
      expect(horizonHazeAt(d)).toBe(0);
    }
  });

  it("only ever touches distances the haze has already taken", () => {
    // If the band started somewhere the ground is still legible it would read
    // as a haze wall of its own. At its start the thinnest clear preset is
    // already three quarters opaque.
    for (const density of CLEAR_DENSITIES) {
      expect(fogOpacityAt(GROUND_BACKDROP_HAZE_START_M, density)).toBeGreaterThan(0.7);
    }
  });

  it("completes before the rim, so the outermost ring is pure haze", () => {
    expect(GROUND_BACKDROP_HAZE_END_M).toBeLessThan(GROUND_BACKDROP_RADIUS_M);
    expect(horizonHazeAt(GROUND_BACKDROP_HAZE_END_M)).toBe(1);
    // The rim as a raised camera actually sees it: sqrt(R² + h²) >= R.
    for (const cameraY of [1.2, 5, 110]) {
      const rim = Math.hypot(GROUND_BACKDROP_RADIUS_M, cameraY - GROUND_BACKDROP_Y);
      expect(horizonHazeAt(rim)).toBe(1);
    }
  });

  it("leaves no ground colour at the rim, in any time of day", () => {
    // The actual claim: there is no terminator. Whatever the preset, the last
    // ring of the disc is the scene's fog colour — the same colour the dome
    // paints just above it.
    for (const density of CLEAR_DENSITIES) {
      expect(backdropHazeAt(GROUND_BACKDROP_RADIUS_M, density)).toBe(1);
    }
  });

  it("ramps monotonically with no kink at either end", () => {
    let prev = -1;
    for (let d = 0; d <= GROUND_BACKDROP_RADIUS_M; d += 5) {
      const h = horizonHazeAt(d);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
    // smoothstep, not a linear ramp: zero gradient at both ends (a kink is a
    // faint line, which is the artefact class this module exists to remove).
    const eps = 0.5;
    expect(horizonHazeAt(GROUND_BACKDROP_HAZE_START_M + eps)).toBeLessThan(0.001);
    expect(horizonHazeAt(GROUND_BACKDROP_HAZE_END_M - eps)).toBeGreaterThan(0.999);
  });
});

describe("the shader splice", () => {
  const glsl = HORIZON_HAZE_FRAGMENT;

  it("mixes toward three's own fogColor, after three's own fog chunk", () => {
    // Same uniform, same colour space, same operation — that is what makes the
    // rim land on the scene's haze under every preset and every weather without
    // this module knowing anything about them.
    expect(HORIZON_HAZE_ANCHOR).toBe("#include <fog_fragment>");
    expect(glsl).toContain("fogColor");
    expect(glsl).toContain("gl_FragColor.rgb = mix(");
  });

  it("measures RADIAL distance, not fog depth", () => {
    // three's fog is planar (-mvPosition.z). On a disc of constant radius that
    // would finish the fade in the middle of the screen and never at the
    // corners, leaving the terminator exactly where the eye scans for it.
    expect(glsl).toContain("length(vViewPosition)");
    expect(glsl).not.toContain("vFogDepth");
  });

  it("is guarded by USE_FOG (fogColor does not exist without it)", () => {
    expect(glsl).toContain("#ifdef USE_FOG");
    expect(glsl.match(/#endif/g)).toHaveLength(1);
  });

  it("carries the documented band as GLSL float literals", () => {
    // Generated from the constants, never hand-typed — an int literal here
    // fails to compile, and a drifting copy fails silently.
    expect(glsl).toContain(`${GROUND_BACKDROP_HAZE_START_M}.0`);
    expect(glsl).toContain(`${GROUND_BACKDROP_HAZE_END_M}.0`);
  });
});

describe("wiring", () => {
  it("is mounted by SimEnvironment, ungated", () => {
    // Ungated is the point: every scene that has an atmosphere has ground under
    // it. A conditional here would reintroduce the edge on whichever map kind
    // nobody remembered.
    const source = read("SimEnvironment.tsx");
    expect(source).toContain("<GroundBackdrop />");
    expect(source).not.toMatch(/\{\s*\w+\s*&&\s*<GroundBackdrop/);
  });

  it("stays backdrop-only: no collider, no shadows, no pick", () => {
    // The rule engine grades on world geometry and on what a driver could see;
    // this disc must never be either. Shadows are the perf half of the same
    // promise.
    const source = read("GroundBackdrop.tsx");
    expect(source).toContain("castShadow={false}");
    expect(source).toContain("receiveShadow={false}");
    expect(source).toContain("raycast={NO_RAYCAST}");
    expect(source).not.toContain("RigidBody");
    expect(source).not.toContain("Collider");
    // No map/normalMap/etc: a texture on a camera-following plane swims, and
    // beyond 60 m it resolves to its own average anyway.
    expect(source).not.toMatch(/\bmap=\{/);
  });

  it("keeps its Y fixed while following the camera in XZ", () => {
    // Following in Y would make the ground rise with the camera — the one
    // degree of freedom a ground plane cannot have.
    const source = read("GroundBackdrop.tsx");
    expect(source).toContain(
      "mesh.position.set(state.camera.position.x, GROUND_BACKDROP_Y, state.camera.position.z)",
    );
  });
});
