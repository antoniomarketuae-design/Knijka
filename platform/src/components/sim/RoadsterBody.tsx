"use client";

/**
 * Roadster exterior body — a purchased/downloaded glTF car mesh (CC-BY, see
 * public/models/roadster/CREDITS.md), decimated + meshopt-compressed for web.
 *
 * This model is an exterior shell with baked (static) wheels and no interior,
 * so it replaces the procedural „Виток" exterior AND wheels; the interior view
 * keeps VitokCockpit. Cosmetic wheel-spin and lamp animation are not driven
 * here (the mesh isn't rigged) — physics and rule-engine grading are unaffected
 * (they read game state, not these meshes). Swap for a rigged car later to
 * restore animated wheels/lamps.
 *
 * Fitting constants are tunable after a look — the model is 2.03w × 1.38h ×
 * 3.77l m; the physics chassis is 1.7w × 4.04l. If the car faces backward,
 * flip ROADSTER_YAW to Math.PI.
 */

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";

const ROADSTER_URL = "/models/roadster/roadster.glb";
/** Uniform scale to fit width 2.03 m → ~1.7 m collider width. */
const ROADSTER_SCALE = 0.84;
/** Chassis-local Y so the wheels/underbody sit on the ground. */
const ROADSTER_OFFSET_Y = -0.34;
/** 0, or Math.PI if the car renders facing backward. */
const ROADSTER_YAW = 0;

export function RoadsterBody() {
  const { scene } = useGLTF(ROADSTER_URL);

  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Glossy car-paint look that reflects the HDRI environment map. Keep the
      // model's own per-part colours (body/glass/trim differ) but make them
      // read as painted metal instead of flat matte.
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const srcColor =
        src && "color" in src ? (src as MeshStandardMaterial).color.clone() : undefined;
      const mat = new MeshStandardMaterial({
        metalness: 0.5,
        roughness: 0.38,
        envMapIntensity: 1.1,
      });
      if (srcColor) mat.color.copy(srcColor);
      mesh.material = mat;
    });
    return root;
  }, [scene]);

  return (
    <group
      scale={ROADSTER_SCALE}
      position={[0, ROADSTER_OFFSET_Y, 0]}
      rotation={[0, ROADSTER_YAW, 0]}
    >
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(ROADSTER_URL);
