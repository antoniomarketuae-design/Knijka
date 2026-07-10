"use client";

// A4 functional mirrors — render-to-texture onto the GLB mirror glass.
//
// Three WebGLRenderTargets (rear 256x96, doors 192x128) fed by mirror-eye
// PerspectiveCameras parented to the chassis at the GLB mirror-glass
// positions, all looking BACKWARD (chassis -Z; the cars' forward is +Z, so an
// unrotated camera already faces the rear). The horizontal mirror-image flip
// is baked into the glass quads' synthesized UVs (VitokCockpit.ensureQuadUVs
// mirrorU) — a raw rear camera shows car-left on image-right; flipping U puts
// it on the mirror's left, like real glass.
//
// RECURSION / SELF-VIEW GUARD: the mirror cameras keep the default layer-0
// mask while the whole cabin (interior GLB, mirror quads, hotspot proxies,
// windshield plane) lives on INTERIOR_LAYER — a mirror pass can never see a
// mirror, so no feedback loop is possible. Shadow-map auto-update is
// suspended around the pass so the main render's shadow maps are reused.
//
// PERF BUDGET (documented per doc 68 A4, tightened after the 0d1c922 FPS
// regression — once the mirrors started actually rendering, each pass was a
// FULL district re-render at far 560):
//   targets: rear 256x96 (24.6k px) + 2x 160x96 (15.4k px each) ≈ 0.45 MB
//   RGBA16F + depth total (HalfFloat so the composer tone-maps mirror
//   content identically to the direct view — see the aim-table comment).
//   cadence (MIRROR_CADENCE): at most ONE mirror pass per frame —
//     low    = no RTT at all (authored dark-gloss glass stays);
//     medium = rear only, rendered every 2nd frame;
//     high   = rear every 2nd frame, doors every 4th (staggered on the
//              rear's off-frames, phases 1 and 3).
//   REDUCED SCENE per pass: mirror far plane 200 m (vs the main camera's 900)
//   frustum-culls the CityBuildings 200 m chunk grid — the pass submits only
//   the nearby chunks instead of the whole district — while the fog density
//   is floored so geometry fades out BEFORE the cull boundary and the
//   (scale-invariant) sky dome is shrunk into the frustum. Shadows are frozen
//   (main pass's maps reused); the cabin is layer-excluded; the pass is a raw
//   gl.render — no composer/postprocessing ever runs for a mirror.
//   Passes only run at all while the cockpit camera is live (`active`).
//
// GRADING IS UNTOUCHED: mirror glances stay camera/key/click events through
// CabinControls.glance() — RTT is visual truth, not the graded signal.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  FogExp2,
  HalfFloatType,
  MeshBasicMaterial,
  PerspectiveCamera,
  WebGLRenderTarget,
  type Mesh,
  type Object3D,
} from "three";
import { SKY_DOME_NAME } from "@/modules/sim/environment";
import { loadQualityPreset } from "../lesson-ui/QualityPresetSelector";

export interface MirrorMeshes {
  left: Mesh | null;
  right: Mesh | null;
  rear: Mesh | null;
}

type MirrorKind = keyof MirrorMeshes;

interface MirrorDef {
  /** Render-target size — small on purpose; mirrors are ~0.1-0.2 m of glass. */
  width: number;
  height: number;
  /** Vertical FOV (deg) approximating the real glass's angular coverage. */
  fovDeg: number;
  /** Camera position, chassis-local (m) — the GLB mirror-glass positions
   *  (authored node transforms through the yaw-π / y-0.55 interior mount). */
  pos: readonly [number, number, number];
  /** Small outward yaw (doors) so the adjacent lane fills the glass, and a
   *  touch of down-pitch to keep road in frame. YXZ, radians. */
  yaw: number;
  pitch: number;
}

// AIM TABLE (doc 71 §4.9 / lane 12 §7 — explicit, NOT derived from the GLB
// mirror-node orientations: those encode the GLASS plane tilted toward the
// driver's eyes, and a fixed backward camera is our approximation of the
// reflected view, so the aim is authored here on purpose).
//
//   mirror | pos (chassis-local, GLB glass) | yaw    | pitch        | vFOV
//   rear   | (0, 0.687, 0.575) — 1.18 m up  | 0      | 0 (horizon)  | 14°
//   left   | (+0.905, 0.455, 0.592)         | 0      | −0.08 ≈ −4.6°| 18°
//   right  | (−0.905, 0.455, 0.592)         | 0      | −0.08 ≈ −4.6°| 18°
//
// Rear looks straight back along −Z with the horizon centred (the glass sits
// at real eye/horizon height). Door cameras look rearward PARALLEL to the
// body axis, 4–5° down (lane-12's real-mirror numbers): the ±0.905 m lateral
// camera position already gives the outboard eye a real glass provides, so
// road fills the lower two-thirds and horizon rides the upper third.
//
// REF 6 post-mortem (why the mirrors were broken, so nobody re-breaks them):
//  1. far plane 500 < SkyDome radius 520 → EVERY mirror pass clipped the sky
//     dome and rendered clear-colour black sky (MIRROR_FAR fixes this);
//  2. 8-bit UNSIGNED_BYTE targets stored the LINEAR pre-composer scene —
//     HDR >1 clipped and linear quantisation crushed the dark asphalt into
//     the "dark smear" (HalfFloatType fixes this — see below);
//  3. the old ∓0.14 outward yaw aimed the left glass ~8° into the roadside
//     lawn — with the black sky that read as "solid green".
const MIRROR_DEFS: Record<MirrorKind, MirrorDef> = {
  rear: { width: 256, height: 96, fovDeg: 14, pos: [0, 0.687, 0.575], yaw: 0, pitch: 0 },
  left: { width: 160, height: 96, fovDeg: 18, pos: [0.905, 0.455, 0.592], yaw: 0, pitch: -0.08 },
  right: { width: 160, height: 96, fovDeg: 18, pos: [-0.905, 0.455, 0.592], yaw: 0, pitch: -0.08 },
};

/** Mirror-camera near plane (m) — glass positions sit just outside the
 *  chassis box, nothing legitimate is closer. */
const MIRROR_NEAR = 0.3;
/**
 * Mirror-camera far plane (m) — deliberately SHORT (the post-0d1c922 perf
 * fix): CityBuildings' 200 m chunk grid has instance-aware bounding spheres
 * with frustumCulled=true, so a 200 m far plane culls every distant chunk
 * from the pass and the mirror renders a small neighbourhood, not the whole
 * district. (frustumCulled=false props — trees/furniture/traffic shells —
 * are still submitted, but they're the cheap minority.)
 *
 * REF 6 GUARD STILL HOLDS: the sky is a mesh dome (radius 520) and a far
 * plane below it clips the entire sky to black clear-colour (the original
 * REF 6 failure #1). Instead of raising the far plane back to 560, the pass
 * temporarily shrinks the dome to MIRROR_SKY_RADIUS (< far) — the dome's
 * shading is direction-based and scale-invariant, so the mirrored sky
 * (gradient + sun disc/glow) is pixel-identical to the full-size dome.
 */
const MIRROR_FAR = 200;
/** Sky-dome scale during a mirror pass — just inside MIRROR_FAR. */
const MIRROR_SKY_RADIUS = 190;
/**
 * Fog-density floor for mirror passes so geometry fades toward the fog
 * colour BEFORE the 200 m cull boundary instead of popping there:
 * FogExp2 transmittance exp(-(d·far)²) with d·far = 1.5 ≈ 0.105 at the far
 * plane. The main scene's density (day 0.0028) would still be ~68 % visible
 * at 200 m. Applied as max(scene density, floor) so denser night/rain fog
 * wins; restored right after the pass.
 */
const MIRROR_FOG_MIN_DENSITY = 1.5 / MIRROR_FAR;

/**
 * Per-mirror refresh cadence: render mirror `kind` on frames where
 * frame % interval === phase. Phases are disjoint (rear owns 0 and 2 mod 4,
 * doors own 1 and 3), so AT MOST ONE mirror pass ever runs per frame:
 *   medium (rear only) — passes on half the frames;
 *   high (all three)   — rear at 30 Hz, each door at 15 Hz.
 * Glass is small and mostly glanced at — 15 Hz doors read fine.
 */
const MIRROR_CADENCE: Record<MirrorKind, { interval: number; phase: number }> = {
  rear: { interval: 2, phase: 0 },
  left: { interval: 4, phase: 1 },
  right: { interval: 4, phase: 3 },
};

/** Which mirrors run RTT per quality tier (lesson-ui preset, fixed for the
 *  life of the scene — the selector lives on the pre-lesson screen). */
function activeKindsFor(preset: "low" | "medium" | "high"): MirrorKind[] {
  if (preset === "high") return ["rear", "left", "right"];
  if (preset === "medium") return ["rear"];
  return [];
}

interface MirrorRigEntry {
  kind: MirrorKind;
  mesh: Mesh;
  target: WebGLRenderTarget;
  camera: PerspectiveCamera;
  material: MeshBasicMaterial;
}

/**
 * Mounts the mirror cameras into the chassis-local tree and drives the
 * round-robin RTT passes from useFrame (manual gl.render before the main
 * pass, so the glass shows this frame's world). Inactive tiers/mirrors keep
 * the authored dark-gloss glass material — the "static dark glass" look.
 */
export function MirrorRig({ mirrors, active }: { mirrors: MirrorMeshes; active: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // Read once on mount: the quality selector lives on the lesson-select
  // screen, so the preset cannot change while this scene is alive.
  const [preset] = useState(() => loadQualityPreset());

  const entries = useMemo<MirrorRigEntry[]>(() => {
    return activeKindsFor(preset).flatMap((kind) => {
      const mesh = mirrors[kind];
      if (!mesh) return [];
      const def = MIRROR_DEFS[kind];
      // HalfFloat target = "exposure locked to main scene" (lane 12 §7): the
      // main pipeline renders LINEAR HDR and tone-maps in the composer, so
      // the mirror target must carry linear HDR too — the glass quad is then
      // graded/tone-mapped by the same composer pass as the directly-seen
      // world. An 8-bit target here clips HDR and bands the darks (REF 6).
      const target = new WebGLRenderTarget(def.width, def.height, {
        stencilBuffer: false,
        type: HalfFloatType,
      });
      const camera = new PerspectiveCamera(
        def.fovDeg,
        def.width / def.height,
        MIRROR_NEAR,
        MIRROR_FAR,
      );
      camera.position.set(def.pos[0], def.pos[1], def.pos[2]);
      camera.rotation.order = "YXZ";
      camera.rotation.set(def.pitch, def.yaw, 0);
      // Default layer-0 mask = world only; the cabin is on INTERIOR_LAYER.
      const material = new MeshBasicMaterial({ map: target.texture, toneMapped: false });
      return [{ kind, mesh, target, camera, material }];
    });
    // `mirrors` is a new object per GLB (re)clone; preset is mount-constant.
  }, [mirrors, preset]);

  // Swap the RTT material onto the glass; restore the authored material and
  // dispose everything we created when the rig (or the GLB) goes away.
  useEffect(() => {
    const restores = entries.map((e) => {
      const previous = e.mesh.material;
      e.mesh.material = e.material;
      return () => {
        e.mesh.material = previous;
      };
    });
    return () => {
      for (const restore of restores) restore();
      for (const e of entries) {
        e.target.dispose();
        e.material.dispose();
      }
    };
  }, [entries]);

  const frameRef = useRef(0);
  // The SkyDome mesh, resolved lazily by name (it mounts in a sibling tree,
  // possibly after us) and re-resolved if the environment remounts.
  const skyRef = useRef<Object3D | null>(null);

  useFrame(() => {
    if (!active || entries.length === 0) return;
    const frame = frameRef.current++;
    // MIRROR_CADENCE phases are disjoint → at most one entry matches.
    let entry: MirrorRigEntry | null = null;
    for (const e of entries) {
      const c = MIRROR_CADENCE[e.kind];
      if (frame % c.interval === c.phase) {
        entry = e;
        break;
      }
    }
    if (!entry) return;

    let sky = skyRef.current;
    if (!sky || !sky.parent) {
      sky = scene.getObjectByName(SKY_DOME_NAME) ?? null;
      skyRef.current = sky;
    }
    const fog = scene.fog instanceof FogExp2 ? scene.fog : null;

    // Reduced-scene render (see MIRROR_FAR/MIRROR_FOG_MIN_DENSITY): freeze
    // shadows (reuse the main pass's maps), floor the fog so the short far
    // plane never pops, shrink the sky dome into the frustum — then restore
    // every piece of mutated global state before the main render.
    const previousTarget = gl.getRenderTarget();
    const previousShadowAutoUpdate = gl.shadowMap.autoUpdate;
    const previousFogDensity = fog ? fog.density : 0;
    const previousSkyScale = sky ? sky.scale.x : 1;
    gl.shadowMap.autoUpdate = false;
    if (fog) fog.density = Math.max(fog.density, MIRROR_FOG_MIN_DENSITY);
    if (sky) sky.scale.setScalar(MIRROR_SKY_RADIUS);
    gl.setRenderTarget(entry.target);
    gl.render(scene, entry.camera);
    gl.setRenderTarget(previousTarget);
    gl.shadowMap.autoUpdate = previousShadowAutoUpdate;
    if (fog) fog.density = previousFogDensity;
    if (sky) sky.scale.setScalar(previousSkyScale);
  });

  // The cameras join the chassis-local tree so they inherit the interpolated
  // body pose; nothing visible renders from this component itself.
  return (
    <group>
      {entries.map((e) => (
        <primitive key={e.kind} object={e.camera} />
      ))}
    </group>
  );
}
