/**
 * The black-mirror regression (doc 82 §3.2, „fix immediately").
 *
 * `postprocessing`'s EffectComposer sets `renderer.autoClear = false` for the
 * whole life of the renderer. The mirror pass is the ONE raw `gl.render()` in
 * the app, so it was the one thing that stopped clearing — and an uncleared
 * depth buffer reads 0 (the near plane), which fails the default LESS test for
 * every fragment and leaves the glass solid black forever, on exactly the
 * med/high tiers where the composer mounts.
 *
 * The first test here fails against the pre-fix code.
 */

import { describe, expect, it } from "vitest";
import { renderMirrorPass, type MirrorPassRenderer } from "./mirrorPass";

interface Recorded {
  autoClearDuringRender: boolean;
  shadowAutoUpdateDuringRender: boolean;
  targetDuringRender: unknown;
  fogDuringRender: number | null;
  skyScaleDuringRender: number | null;
  renders: number;
}

function makeRig(opts?: { composerMounted?: boolean; sceneFogDensity?: number | null }) {
  const composerMounted = opts?.composerMounted ?? true;
  const fog =
    opts?.sceneFogDensity === null ? null : { density: opts?.sceneFogDensity ?? 0.0028 };
  const sky = {
    scale: {
      x: 520,
      setScalar(v: number) {
        sky.scale.x = v;
      },
    },
  };
  const rec: Recorded = {
    autoClearDuringRender: false,
    shadowAutoUpdateDuringRender: true,
    targetDuringRender: undefined,
    fogDuringRender: null,
    skyScaleDuringRender: null,
    renders: 0,
  };
  let current: unknown = null;
  const gl: MirrorPassRenderer = {
    // The composer flips this off globally the moment it takes the renderer.
    autoClear: !composerMounted,
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => current,
    setRenderTarget: (t) => {
      current = t;
    },
    render: () => {
      rec.renders += 1;
      rec.autoClearDuringRender = gl.autoClear;
      rec.shadowAutoUpdateDuringRender = gl.shadowMap.autoUpdate;
      rec.targetDuringRender = current;
      rec.fogDuringRender = fog ? fog.density : null;
      rec.skyScaleDuringRender = sky.scale.x;
    },
  };
  return { gl, fog, sky, rec, target: { id: "rear" } };
}

describe("renderMirrorPass", () => {
  it("clears the mirror target even though the composer disabled autoClear", () => {
    const { gl, fog, sky, rec, target } = makeRig({ composerMounted: true });
    expect(gl.autoClear).toBe(false); // the composer's global state

    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog,
      fogMinDensity: 0.0075,
      sky,
      skyRadius: 190,
    });

    expect(rec.renders).toBe(1);
    // THE FIX: without this the target's colour and depth are never cleared
    // and the glass renders solid black on every composer-enabled tier.
    expect(rec.autoClearDuringRender).toBe(true);
    // …and the composer's own state is handed back untouched, or the NEXT
    // frame's ClearPass would be double-clearing.
    expect(gl.autoClear).toBe(false);
  });

  it("leaves autoClear alone when the composer never mounted (tier low)", () => {
    const { gl, rec, fog, sky, target } = makeRig({ composerMounted: false });
    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog,
      fogMinDensity: 0.0075,
      sky,
      skyRadius: 190,
    });
    expect(rec.autoClearDuringRender).toBe(true);
    expect(gl.autoClear).toBe(true);
  });

  it("renders into the mirror target and restores the previous one", () => {
    const { gl, fog, sky, rec, target } = makeRig();
    gl.setRenderTarget(null);
    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog,
      fogMinDensity: 0.0075,
      sky,
      skyRadius: 190,
    });
    expect(rec.targetDuringRender).toBe(target);
    expect(gl.getRenderTarget()).toBeNull();
  });

  it("freezes shadows, floors the fog and shrinks the dome — then restores all three", () => {
    const { gl, fog, sky, rec, target } = makeRig({ sceneFogDensity: 0.0028 });
    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog,
      fogMinDensity: 0.0075,
      sky,
      skyRadius: 190,
    });
    expect(rec.shadowAutoUpdateDuringRender).toBe(false);
    expect(rec.fogDuringRender).toBe(0.0075); // floored past the 200 m cull
    expect(rec.skyScaleDuringRender).toBe(190); // inside MIRROR_FAR
    expect(gl.shadowMap.autoUpdate).toBe(true);
    expect(fog!.density).toBe(0.0028);
    expect(sky.scale.x).toBe(520);
  });

  it("never LOWERS a denser night/rain fog", () => {
    const { gl, fog, sky, rec, target } = makeRig({ sceneFogDensity: 0.024 });
    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog,
      fogMinDensity: 0.0075,
      sky,
      skyRadius: 190,
    });
    expect(rec.fogDuringRender).toBe(0.024);
  });

  it("survives a scene with no fog and a sky dome that has not mounted yet", () => {
    const { gl, rec, target } = makeRig({ sceneFogDensity: null });
    renderMirrorPass(gl, {
      target,
      scene: {} as never,
      camera: {} as never,
      fog: null,
      fogMinDensity: 0.0075,
      sky: null,
      skyRadius: 190,
    });
    expect(rec.renders).toBe(1);
    expect(rec.autoClearDuringRender).toBe(true);
  });
});
