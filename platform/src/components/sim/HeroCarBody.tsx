"use client";

/**
 * Hero player-car exterior — the fictional "Aurelis GT-E" (ADR-001, unbadged),
 * built via Rodin → voxel-rebuild (see tools/blender/HERO_CAR_RODIN_BRIEF.md).
 * Draco-compressed GLB with its OWN PBR materials (tinted glass, chrome, alloys,
 * LED bars). The BODY PAINT is upgraded to a real automotive clearcoat
 * (MeshPhysicalMaterial, shared carPaintMaterial recipe — docs/simulation/71
 * §4.8: hero-only, so the traffic fleet stays cheap), keeping the model's
 * authored pigment colour; every other material is left as authored with only a
 * bumped envMapIntensity so glass/chrome reflect the scene HDRI.
 *
 * COCKPIT VIEW HIDES THE EXTERIOR (A3): every material in the GLB is
 * double-sided and the tinted-glass canopy is OPAQUE near-black, spanning
 * chassis y 0.31–0.77 — it encloses the driver eye (y 0.66), so from inside
 * the shell reads as a black box. The authored hero interior (VitokCockpit)
 * replaces the cabin visuals entirely, so in the cockpit view this component
 * hides itself (context.enabled from LessonScene's provider). Two accepted
 * trade-offs while hidden: the car casts no shadow (barely readable from the
 * driver seat) and the A4 mirror RTT passes don't show the own-car flank.
 *
 * Wheels are rigged: the four `wheel_*` nodes roll about local X from speed and
 * the front pair steers from `sim.steerRad`. Physics / rule-engine grading read
 * game state, not these meshes, so feel is unaffected either way.
 *
 * Auto-fits to the physics chassis: uniform scale so the model width matches the
 * collider, and a Y offset so the wheels sit on the ground. `HERO_YAW` flips the
 * facing if it renders backward.
 */

import { useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { CHASSIS_HALF_EXTENTS, type VehicleSim } from "@/modules/sim/vehicle";
import { carPaintMaterial } from "@/modules/sim/traffic";
import { CockpitInteractionContext } from "./vitok/hotspots";

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
  // Cockpit view (context.enabled) → hide the shell; see the header comment.
  const { enabled: cockpitView } = useContext(CockpitInteractionContext);
  const wheels = useRef<Wheel[]>([]);
  const roll = useRef(0);

  const { model, scale, offsetY, paintMaterial } = useMemo(() => {
    const root = scene.clone(true);
    // One shared clearcoat material for every paint panel (single shader
    // program), built lazily from the model's authored pigment colour.
    let paintMaterial: MeshPhysicalMaterial | null = null;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const sm = m as MeshStandardMaterial;
        // Body paint -> real automotive clearcoat (recipe: docs/simulation/71
        // §4.8), keeping the authored pigment colour + double-sidedness. The
        // cloned mesh gets OUR material; the drei-cached one is never mutated.
        if (sm && /paint/i.test(sm.name ?? "")) {
          if (!paintMaterial) {
            const p = carPaintMaterial({ color: sm.color?.clone() });
            p.name = sm.name ?? "car_paint";
            p.side = sm.side; // preserve the GLB's double-sided shell
            paintMaterial = p;
          }
          return paintMaterial as MeshPhysicalMaterial;
        }
        // Glass, chrome, tyre and lights stay as authored; just let them catch
        // the scene HDRI (glossy reflective car look).
        if (sm && "envMapIntensity" in sm) sm.envMapIntensity = 1.3;
        return m;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
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
    // `paintMaterial` is assigned synchronously inside the traverse above, but
    // TS can't see through the closure — assert its declared type back.
    return {
      model: root,
      scale: fitScale,
      offsetY: fitOffsetY,
      paintMaterial: paintMaterial as MeshPhysicalMaterial | null,
    };
  }, [scene]);

  // Dispose the clearcoat we created when the model re-clones or unmounts (the
  // GLB's own cached materials belong to the drei cache and are left alone).
  useEffect(() => () => paintMaterial?.dispose(), [paintMaterial]);

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
    <group
      visible={!cockpitView}
      scale={scale}
      position={[0, offsetY, 0]}
      rotation={[0, HERO_YAW, 0]}
    >
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(HERO_URL, DRACO_PATH);
