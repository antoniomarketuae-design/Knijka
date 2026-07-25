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
 * WORKING LAMPS (founder report 2026-07-19 — "pressing the light controls only
 * changes the button state in the UI"): the GLB's `drl` (front LED bar) and
 * `tail` materials are authored ALWAYS-emissive, so no control ever read on
 * the body. This component now clones both (the drei cache is never mutated)
 * and drives them per frame from the SAME state the cluster reads:
 *  - drl:  off → dim cool DRL signature · low → warm white · high → brighter,
 *    whiter (CabinControls.headlights);
 *  - tail: brake pressed (SimInput.read().brake — the per-frame ref channel
 *    the audio uses) → bright red · night + headlights on → dim red glow ·
 *    else barely-lit lens;
 *  - indicators: four amber corner glow quads toggled by the SAME 600 ms
 *    blink clock as the cluster arrows (cabin.blinkOn / hazardBlinkOn — one
 *    clock, never a second one);
 *  - fog lamps: two low pale quads on driveline.fogLightsOn.
 * All of it is render-only and zero-allocation: shared materials created once,
 * per-frame writes are visibility booleans + state-keyed emissive swaps. The
 * night light THROW (SpotLights) lives in VehicleRig — it must shine in
 * cockpit view too, where this whole shell is hidden.
 *
 * Auto-fits to the physics chassis: uniform scale so the model width matches the
 * collider, and a Y offset so the wheels sit on the ground. `HERO_YAW` flips the
 * facing if it renders backward.
 */

import { useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  AdditiveBlending,
  Box3,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { CHASSIS_HALF_EXTENTS, type VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import { carPaintMaterial, carPaintStandardMaterial } from "@/modules/sim/traffic";
import { QUALITY_PRESETS, type QualityLevel } from "@/modules/sim/environment";
import { loadQualityPreset } from "./lesson-ui/QualityPresetSelector";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import { CockpitInteractionContext } from "@/modules/sim/scene/vitok/hotspots";

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

// --- Lamp emissive states (state-keyed: written only on change) -------------
// The GLB authors drl emissive (0.75, 0.85, 1) × 4 and tail (1, 0.06, 0.03)
// × 4.5, permanently — the "lights never change" bug. These are the replacement
// per-state values; AgX + bloom make the jumps read even in daylight.
/** drl bar per headlight state [r, g, b, intensity]: off / low / high. */
const DRL_STATES: readonly [number, number, number, number][] = [
  [0.75, 0.85, 1, 1], // off: the authored cool DRL signature, dimmed
  [1, 0.87, 0.62, 6], // low: warm white
  [0.92, 0.96, 1, 16], // high: visibly brighter AND whiter
];
/** tail emissive intensity per state: unlit lens / night tail / brake. */
const TAIL_INTENSITY: readonly number[] = [0.12, 2.5, 10];
/** Brake pedal position that lights the brake lamps. */
const BRAKE_LAMP_THRESHOLD = 0.06;

export function HeroCarBody({
  simRef,
  cabinRef,
  inputRef,
  night = false,
  rain = false,
}: {
  simRef?: RefObject<VehicleSim | null>;
  /** Cabin electrics truth (headlights / indicator / hazards / fog) — the
   *  SAME object the cluster + HUD read, so lamp visuals can never disagree
   *  with the dashboard. Absent (legacy/harness) = everything stays off. */
  cabinRef?: RefObject<CabinControls | null>;
  /** Brake-pedal channel for the brake lamps. read() reuses an internal
   *  object and is documented multi-consumer-per-frame safe. */
  inputRef?: RefObject<SimInput | null>;
  /** Lesson night flag — arms the dim red tail glow with headlights on. */
  night?: boolean;
  /** Lesson rain flag (doc 62 #41) — the tail glow also arms in day rain, so
   *  switching the lights on in a rain lesson visibly lights the car's rear
   *  (the beam throw itself lives in VehicleRig, mounted on night || rain). */
  rain?: boolean;
}) {
  const { scene } = useGLTF(HERO_URL, DRACO_PATH);
  // Cockpit view (context.enabled) → hide the shell; see the header comment.
  const { enabled: cockpitView } = useContext(CockpitInteractionContext);
  const wheels = useRef<Wheel[]>([]);
  const roll = useRef(0);
  // Lamp state cache — emissive uniforms rewritten only when the key changes.
  const lampState = useRef({ head: -1, tail: -1 });
  // Indicator / fog glow quads (visibility-toggled per frame — zero cost off).
  const indFLRef = useRef<Mesh>(null);
  const indRLRef = useRef<Mesh>(null);
  const indFRRef = useRef<Mesh>(null);
  const indRRRef = useRef<Mesh>(null);
  const fogLRef = useRef<Mesh>(null);
  const fogRRef = useRef<Mesh>(null);

  // Tier gate for the body paint (docs/simulation/71 §4.8): real clearcoat only
  // at high, glossy MeshStandard on med/low (~½ the fragment cost). The rendered
  // tier is the lesson-ui preset (LessonScene's `quality` prop origin — the sim
  // canvas is client-only, so the localStorage read is safe); the clearcoat
  // ruling itself lives in the environment presets. Fixed per session, so a
  // one-time read is enough.
  const useClearcoat = useMemo(() => {
    const q = loadQualityPreset(); // "low" | "medium" | "high"
    const level: QualityLevel = q === "medium" ? "med" : q;
    return QUALITY_PRESETS[level].clearcoat;
  }, []);

  const { model, scale, offsetY, paintMaterial, drlMaterial, tailMaterial, lamp } = useMemo(() => {
    const root = scene.clone(true);
    // One shared paint material for every panel (single shader program), built
    // lazily from the model's authored pigment colour — clearcoat or glossy
    // standard by tier.
    let paintMaterial: MeshStandardMaterial | null = null;
    // Lamp materials: clones of the GLB's authored `drl` / `tail` (emissive
    // strength baked at 4 / 4.5 — permanently "on"). WE own the clones and
    // drive their emissive per frame; the drei-cached originals (shared with
    // ShadowCar's ghost) are never touched.
    let drlMaterial: MeshStandardMaterial | null = null;
    let tailMaterial: MeshStandardMaterial | null = null;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const sm = m as MeshStandardMaterial;
        // Body paint -> hero paint (recipe: docs/simulation/71 §4.8): real
        // automotive clearcoat at high, glossy MeshStandard on med/low. Keeps
        // the authored pigment colour + double-sidedness. The cloned mesh gets
        // OUR material; the drei-cached one is never mutated.
        if (sm && /paint/i.test(sm.name ?? "")) {
          if (!paintMaterial) {
            const p = useClearcoat
              ? carPaintMaterial({ color: sm.color?.clone() })
              : carPaintStandardMaterial({ color: sm.color?.clone() });
            p.name = sm.name ?? "car_paint";
            p.side = sm.side; // preserve the GLB's double-sided shell
            paintMaterial = p;
          }
          return paintMaterial as MeshStandardMaterial;
        }
        // Front LED bar / tail lamps -> OUR controllable clones.
        if (sm && /^drl$/i.test(sm.name ?? "")) {
          if (!drlMaterial) {
            drlMaterial = sm.clone();
            drlMaterial.envMapIntensity = 1.3;
          }
          return drlMaterial as MeshStandardMaterial;
        }
        if (sm && /^tail$/i.test(sm.name ?? "")) {
          if (!tailMaterial) {
            tailMaterial = sm.clone();
            tailMaterial.envMapIntensity = 1.3;
          }
          return tailMaterial as MeshStandardMaterial;
        }
        // Glass, chrome and tyre stay as authored; just let them catch
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
    // Corner-lamp glow-quad placements in CHASSIS space (+Z forward, +X left —
    // HERO_YAW flips the GLB, whose nose is −Z). Derived from the authored
    // lamp-prim bounds (drl bar x ±0.84 y ~0.72 z −2.56; tail x ±0.848 y ~0.75
    // z 2.57; grille front z −2.586) so the quads hug the fitted shell.
    const lamp = {
      frontZ: -bbox.min.z * fitScale + 0.02,
      rearZ: bbox.max.z * fitScale + 0.02,
      indX: 0.87 * fitScale,
      indFrontY: 0.72 * fitScale + fitOffsetY,
      indRearY: 0.75 * fitScale + fitOffsetY,
      fogX: 0.6 * fitScale,
      fogY: 0.42 * fitScale + fitOffsetY,
    };
    // `paintMaterial` (+ lamp clones) are assigned synchronously inside the
    // traverse above, but TS can't see through the closure — assert the
    // declared types back.
    return {
      model: root,
      scale: fitScale,
      offsetY: fitOffsetY,
      paintMaterial: paintMaterial as MeshStandardMaterial | null,
      drlMaterial: drlMaterial as MeshStandardMaterial | null,
      tailMaterial: tailMaterial as MeshStandardMaterial | null,
      lamp,
    };
  }, [scene, useClearcoat]);

  // Dispose the materials we created when the model re-clones or unmounts
  // (the GLB's own cached materials belong to the drei cache and are left alone).
  useEffect(
    () => () => {
      paintMaterial?.dispose();
      drlMaterial?.dispose();
      tailMaterial?.dispose();
    },
    [paintMaterial, drlMaterial, tailMaterial],
  );

  // Shared glow-quad materials (amber indicators / pale fog) — created once,
  // toneMapped off so they read as light and catch the bloom pass like the
  // fleet's lamp overlays (TrafficLayer).
  const glowMats = useMemo(
    () => ({
      indicator: new MeshBasicMaterial({
        color: "#ffb300",
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
      fog: new MeshBasicMaterial({
        color: "#f2ecd4",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      glowMats.indicator.dispose();
      glowMats.fog.dispose();
    },
    [glowMats],
  );

  useFrame((_, delta) => {
    const sim = simRef?.current;
    if (sim && wheels.current.length > 0) {
      const speedMps = sim.speedKmh / 3.6;
      roll.current += (speedMps / WHEEL_RADIUS_M) * delta;
      const steer = (sim.steerRad ?? 0) * STEER_VISUAL;
      for (const w of wheels.current) {
        w.node.rotation.x = roll.current;
        w.node.rotation.y = w.front ? steer : 0;
      }
    }

    // --- Working lamps (render-only, zero-alloc; see the header) ------------
    const cabin = cabinRef?.current;
    const st = lampState.current;
    // Front bar: off / low / high (emissive rewritten only on change).
    const headKey = cabin?.headlights === "high" ? 2 : cabin?.headlights === "low" ? 1 : 0;
    if (drlMaterial && headKey !== st.head) {
      st.head = headKey;
      const s = DRL_STATES[headKey];
      drlMaterial.emissive.setRGB(s[0], s[1], s[2]);
      drlMaterial.emissiveIntensity = s[3];
    }
    // Tail: brake > lit-tail > barely-lit lens (the fleet's exact ordering).
    // The lit-tail state arms at night AND in rain (doc 62 #41) — with the
    // headlights on, the rear lamp bar must read lit in a rain lesson too.
    const brakeOn = (inputRef?.current?.read().brake ?? 0) > BRAKE_LAMP_THRESHOLD;
    const tailKey = brakeOn ? 2 : (night || rain) && headKey !== 0 ? 1 : 0;
    if (tailMaterial && tailKey !== st.tail) {
      st.tail = tailKey;
      tailMaterial.emissiveIntensity = TAIL_INTENSITY[tailKey];
    }
    // Indicators — the SAME 600 ms clock as the cluster arrows (cabin.blinkOn
    // starts "on" at the stalk click; hazards light both sides).
    const blink = cabin?.blinkOn ?? false;
    const hazardBlink = cabin?.hazardBlinkOn ?? false;
    const leftLit = (blink && cabin?.indicator === "left") || hazardBlink;
    const rightLit = (blink && cabin?.indicator === "right") || hazardBlink;
    if (indFLRef.current) indFLRef.current.visible = leftLit;
    if (indRLRef.current) indRLRef.current.visible = leftLit;
    if (indFRRef.current) indFRRef.current.visible = rightLit;
    if (indRRRef.current) indRRRef.current.visible = rightLit;
    // Fog lamps (key V) — visibility-only, so free while off.
    const fogOn = cabin?.driveline.fogLightsOn ?? false;
    if (fogLRef.current) fogLRef.current.visible = fogOn;
    if (fogRRef.current) fogRRef.current.visible = fogOn;
  });

  return (
    <group visible={!cockpitView}>
      <group scale={scale} position={[0, offsetY, 0]} rotation={[0, HERO_YAW, 0]}>
        <primitive object={model} />
      </group>

      {/* Corner lamp glow quads (chassis space: +Z forward, +X left) —
          additive, depthWrite off, visibility-toggled per frame above.
          Invisible meshes never enter the render list, so the off state is
          free; lit they are 1 tiny draw each. */}
      <mesh ref={indFLRef} position={[lamp.indX, lamp.indFrontY, lamp.frontZ]} visible={false}>
        <planeGeometry args={[0.15, 0.11]} />
        <primitive object={glowMats.indicator} attach="material" />
      </mesh>
      <mesh ref={indFRRef} position={[-lamp.indX, lamp.indFrontY, lamp.frontZ]} visible={false}>
        <planeGeometry args={[0.15, 0.11]} />
        <primitive object={glowMats.indicator} attach="material" />
      </mesh>
      <mesh ref={indRLRef} position={[lamp.indX, lamp.indRearY, -lamp.rearZ]} visible={false}>
        <planeGeometry args={[0.15, 0.11]} />
        <primitive object={glowMats.indicator} attach="material" />
      </mesh>
      <mesh ref={indRRRef} position={[-lamp.indX, lamp.indRearY, -lamp.rearZ]} visible={false}>
        <planeGeometry args={[0.15, 0.11]} />
        <primitive object={glowMats.indicator} attach="material" />
      </mesh>
      {/* Front fog lamps — low on the fascia, pale warm glow. */}
      <mesh ref={fogLRef} position={[lamp.fogX, lamp.fogY, lamp.frontZ]} visible={false}>
        <planeGeometry args={[0.16, 0.07]} />
        <primitive object={glowMats.fog} attach="material" />
      </mesh>
      <mesh ref={fogRRef} position={[-lamp.fogX, lamp.fogY, lamp.frontZ]} visible={false}>
        <planeGeometry args={[0.16, 0.07]} />
        <primitive object={glowMats.fog} attach="material" />
      </mesh>
    </group>
  );
}

useGLTF.preload(HERO_URL, DRACO_PATH);
