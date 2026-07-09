"use client";

/**
 * Hero player-car exterior — the fictional "Aurelis GT-E" (ADR-001, unbadged),
 * built via Rodin → voxel-rebuild (see tools/blender/HERO_CAR_RODIN_BRIEF.md).
 * Draco-compressed GLB with its OWN PBR materials (deep-gloss paint, tinted
 * glass, chrome, alloys, LED bars), so — unlike the old RoadsterBody — we keep
 * the model's materials and only bump envMapIntensity so the paint/glass reflect
 * the scene HDRI. Exterior shell + separate wheel nodes; no modelled interior,
 * so the cockpit view keeps VitokCockpit (the outward-facing shell backface-culls
 * from inside). Wheels are rigged nodes but drawn static here for v1 — physics /
 * rule-engine grading read game state, not these meshes, so feel is unaffected.
 *
 * Auto-fits to the physics chassis: uniform scale so the model width matches the
 * collider, and a Y offset so the wheels sit on the ground. `HERO_YAW` flips the
 * facing if it renders backward.
 */

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { CHASSIS_HALF_EXTENTS } from "@/modules/sim/vehicle";

const HERO_URL = "/sim/vehicles/hero_car.glb";
/** Local Draco decoder (CSP-safe, no CDN) — copied to public/draco/. */
const DRACO_PATH = "/draco/";
/** 0, or Math.PI if the car renders facing backward, after a look. */
const HERO_YAW = 0;

export function HeroCarBody() {
  const { scene } = useGLTF(HERO_URL, DRACO_PATH);

  const { model, scale, offsetY } = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as MeshStandardMaterial;
        // Keep the model's own colours/metalness/roughness; just let the paint,
        // glass and chrome catch the scene HDRI (glossy reflective car look).
        if (sm && "envMapIntensity" in sm) sm.envMapIntensity = 1.3;
      }
    });

    // Auto-fit to the collider: scale model width → collider width, then drop it
    // so its lowest point (tyre contact) sits at the collider bottom (-h.y).
    const bbox = new Box3().setFromObject(root);
    const size = new Vector3();
    bbox.getSize(size);
    const targetWidth = CHASSIS_HALF_EXTENTS.x * 2;
    const fitScale = size.x > 1e-3 ? targetWidth / size.x : 1;
    const fitOffsetY = -CHASSIS_HALF_EXTENTS.y - bbox.min.y * fitScale;
    return { model: root, scale: fitScale, offsetY: fitOffsetY };
  }, [scene]);

  return (
    <group scale={scale} position={[0, offsetY, 0]} rotation={[0, HERO_YAW, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(HERO_URL, DRACO_PATH);
