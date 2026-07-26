/**
 * The A4 mirror render-to-texture pass, extracted from MirrorRig so the
 * renderer-state contract is testable in plain Node (doc 82 §3.2 — „the
 * rear-view mirror is a solid black rectangle", fix immediately).
 *
 * THE BUG THIS FILE EXISTS TO KILL. `postprocessing`'s EffectComposer sets
 * `renderer.autoClear = false` permanently the moment it is handed the
 * renderer (node_modules/postprocessing → `setRenderer`), because it drives
 * its own ClearPass. Every OTHER render in the app goes through the composer,
 * so nothing noticed — but the mirror pass is a RAW `gl.render()` into its own
 * render target, and with autoClear off that target's colour AND DEPTH buffers
 * are never cleared. A freshly allocated depth renderbuffer reads 0, i.e. the
 * near plane, so with the default LESS depth func every fragment in the pass
 * fails the test and the glass renders solid black — permanently, because the
 * depth is never cleared on any later frame either.
 *
 * That is exactly what the only shipped cockpit clip frame shows
 * (`public/clips/sc-vp-readiness__m0.k2.png`, captured at quality `high`,
 * where the composer IS mounted). At tier `low` the composer never mounts,
 * autoClear stays true, and the same code path works — which is why this
 * survived: the mirror was broken precisely on the tiers that look best.
 *
 * The fix is to own `autoClear` for the duration of the pass, alongside the
 * shadow-freeze / fog-floor / sky-shrink state the pass already borrows and
 * restores. Every mutation here is saved and restored in the same call, so the
 * main render that follows sees byte-identical renderer state.
 *
 * GRADING IS UNTOUCHED: mirror glances are camera/key/click events through
 * CabinControls.glance(). RTT is visual truth, never the graded signal.
 */

/** The slice of THREE.WebGLRenderer the pass mutates. Structural on purpose:
 *  a real WebGLRenderer satisfies it, and so does a test double. */
export interface MirrorPassRenderer {
  autoClear: boolean;
  shadowMap: { autoUpdate: boolean };
  getRenderTarget(): unknown;
  setRenderTarget(target: unknown): void;
  render(scene: never, camera: never): void;
}

export interface MirrorPassTargets {
  /** Where this pass draws. */
  target: unknown;
  /** The scene + mirror-eye camera, passed straight through to `render`. */
  scene: never;
  camera: never;
  /** The scene's FogExp2, or null when the scene has no exponential fog. */
  fog: { density: number } | null;
  /** Minimum fog density for the pass, so geometry fades out BEFORE the short
   *  mirror far plane instead of popping at it. */
  fogMinDensity: number;
  /** The sky dome object, or null if it has not mounted yet. */
  sky: { scale: { x: number; setScalar(v: number): void } } | null;
  /** Uniform scale to shrink the (scale-invariant) dome inside the mirror
   *  frustum. */
  skyRadius: number;
}

/**
 * Run one mirror RTT pass and restore every piece of renderer/scene state it
 * touched. Returns nothing: the result is the pixels in `target.texture`.
 */
export function renderMirrorPass(gl: MirrorPassRenderer, p: MirrorPassTargets): void {
  const previousTarget = gl.getRenderTarget();
  const previousShadowAutoUpdate = gl.shadowMap.autoUpdate;
  // See the header: without this the pass never clears colour or depth and
  // the glass is a permanent black rectangle on every composer-enabled tier.
  const previousAutoClear = gl.autoClear;
  const previousFogDensity = p.fog ? p.fog.density : 0;
  const previousSkyScale = p.sky ? p.sky.scale.x : 1;

  gl.shadowMap.autoUpdate = false; // reuse the main pass's shadow maps
  gl.autoClear = true;
  if (p.fog) p.fog.density = Math.max(p.fog.density, p.fogMinDensity);
  if (p.sky) p.sky.scale.setScalar(p.skyRadius);

  gl.setRenderTarget(p.target);
  gl.render(p.scene, p.camera);

  gl.setRenderTarget(previousTarget);
  gl.autoClear = previousAutoClear;
  gl.shadowMap.autoUpdate = previousShadowAutoUpdate;
  if (p.fog) p.fog.density = previousFogDensity;
  if (p.sky) p.sky.scale.setScalar(previousSkyScale);
}
