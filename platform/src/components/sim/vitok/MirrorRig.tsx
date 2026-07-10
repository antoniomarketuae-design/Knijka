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
// PERF BUDGET (documented per doc 68 A4):
//   targets: rear 256x96 (24.6k px) + 2x 192x128 (24.6k px each) ≈ 0.3 MB
//   RGBA + depth total.
//   cadence: round-robin, at most ONE mirror pass per frame —
//     low    = no RTT at all (authored dark-gloss glass stays);
//     medium = rear only, rendered every 2nd frame  (~0.2-0.4 ms avg/frame);
//     high   = all three, one per frame → each updates every 3rd frame
//              (~0.4-0.8 ms per frame on an Iris-Xe-class GPU — the cost is
//              draw-call-bound, not fill-bound, at these target sizes).
//   The pass renders the full layer-0 scene (world/traffic/sky) with shadows
//   frozen; the cabin (the heaviest close-up geometry) is layer-excluded.
//
// GRADING IS UNTOUCHED: mirror glances stay camera/key/click events through
// CabinControls.glance() — RTT is visual truth, not the graded signal.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  MeshBasicMaterial,
  PerspectiveCamera,
  WebGLRenderTarget,
  type Mesh,
} from "three";
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

const MIRROR_DEFS: Record<MirrorKind, MirrorDef> = {
  rear: { width: 256, height: 96, fovDeg: 14, pos: [0, 0.687, 0.575], yaw: 0, pitch: -0.02 },
  left: { width: 192, height: 128, fovDeg: 18, pos: [0.905, 0.455, 0.592], yaw: -0.14, pitch: -0.05 },
  right: { width: 192, height: 128, fovDeg: 18, pos: [-0.905, 0.455, 0.592], yaw: 0.14, pitch: -0.05 },
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
      const target = new WebGLRenderTarget(def.width, def.height, {
        stencilBuffer: false,
      });
      const camera = new PerspectiveCamera(
        def.fovDeg,
        def.width / def.height,
        0.3,
        500,
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

  useFrame(() => {
    if (!active || entries.length === 0) return;
    const frame = frameRef.current++;
    let entry: MirrorRigEntry;
    if (entries.length === 1) {
      // Single mirror (medium): every 2nd frame is plenty for glass.
      if (frame % 2 !== 0) return;
      entry = entries[0];
    } else {
      // Round-robin one mirror per frame → each refreshes every Nth frame.
      entry = entries[frame % entries.length];
    }

    const previousTarget = gl.getRenderTarget();
    const previousShadowAutoUpdate = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false; // reuse the main pass's shadow maps
    gl.setRenderTarget(entry.target);
    gl.render(scene, entry.camera);
    gl.setRenderTarget(previousTarget);
    gl.shadowMap.autoUpdate = previousShadowAutoUpdate;
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
