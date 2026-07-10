"use client";

/**
 * Hero player-car exterior — the fictional "Aurelis GT-E" (ADR-001, unbadged),
 * built via Rodin → voxel-rebuild (see tools/blender/HERO_CAR_RODIN_BRIEF.md).
 * Draco-compressed GLB with its OWN PBR materials (deep-gloss paint, tinted
 * glass, chrome, alloys, LED bars), so — unlike the old RoadsterBody — we keep
 * the model's materials and only bump envMapIntensity so the paint/glass reflect
 * the scene HDRI. Exterior shell + separate wheel nodes; no modelled interior,
 * so the cockpit view keeps VitokCockpit (the outward-facing shell backface-culls
 * from inside).
 *
 * Wheels are rigged: the four `wheel_*` nodes roll about local X from speed and
 * the front pair steers from `sim.steerRad`. Physics / rule-engine grading read
 * game state, not these meshes, so feel is unaffected either way.
 *
 * Auto-fits to the physics chassis: uniform scale so the model width matches the
 * collider, and a Y offset so the wheels sit on the ground. `HERO_YAW` flips the
 * facing if it renders backward.
 */

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { CHASSIS_HALF_EXTENTS, type VehicleSim } from "@/modules/sim/vehicle";

const HERO_URL = "/sim/vehicles/hero_car.glb";
/** Local Draco decoder (CSP-safe, no CDN) — copied to public/draco/. */
const DRACO_PATH = "/draco/";
/** Founder-confirmed on a real drive: the GLB renders nose backward → flip 180°. */
const HERO_YAW = Math.PI;
/** Approx tyre radius (m) for the roll rate (car is scaled to ~real size). */
const WHEEL_RADIUS_M = 0.34;
/** Visual front-wheel steer as a fraction of the physics steer angle. */
const STEER_VISUAL = 1.0;

interface Wheel {
  node: Object3D;
  front: boolean;
}

export function HeroCarBody({ simRef }: { simRef?: RefObject<VehicleSim | null> }) {
  const { scene } = useGLTF(HERO_URL, DRACO_PATH);
  const wheels = useRef<Wheel[]>([]);
  const roll = useRef(0);

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

    // Collect the rigged wheel nodes (steer applied before roll → YXZ order).
    const found: Wheel[] = [];
    for (const name of ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"]) {
      const node = root.getObjectByName(name);
      if (node) {
        node.rotation.order = "YXZ";
        found.push({ node, front: name.startsWith("wheel_F") });
      }
    }
    wheels.current = found;

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

  useFrame((_, delta) => {
    const sim = simRef?.current;
    if (!sim || wheels.current.length === 0) return;
    const speedMps = sim.speedKmh / 3.6;
    roll.current += (speedMps / WHEEL_RADIUS_M) * delta;
    const steer = (sim.steerRad ?? 0) * STEER_VISUAL;
    for (const w of wheels.current) {
      w.node.rotation.x = roll.current;
      w.node.rotation.y = w.front ? steer : 0;
    }
  });

  return (
    <group scale={scale} position={[0, offsetY, 0]} rotation={[0, HERO_YAW, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(HERO_URL, DRACO_PATH);
