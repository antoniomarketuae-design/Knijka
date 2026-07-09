"use client";

/**
 * Instanced street props:
 * - TrafficLights: housings (1 instanced mesh) + lamps (1 instanced mesh,
 *   per-instance color driven each frame from `getSignalPhase(nodeId)` —
 *   phase LOGIC lives in runtime/WorldRuntime; this only lights lamps).
 * - SignPoles: shared pole instanced mesh + one instanced plate mesh per
 *   sign kind (textured from the SVG catalog with procedural fallback).
 * - Streetlights: housing + emissive head (night glow).
 * - Trees: 4 real Kenney low-poly GLB models, one instanced mesh each,
 *   vertex-colored (baked from glTF base colors); procedural blob fallback
 *   until the GLBs load.
 *
 * Draw calls: 2 (signals) + 5 (signs) + 2 (streetlights) + 4 (trees) = 13.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SignalPhase } from "../../contracts";
import type { SignKind, TreePlacement, WorldGeometry } from "../types";
import { loadSignTextureFromSvg, proceduralSignTexture } from "../textures/signTextures";
import {
  createInstancedMesh,
  createOffsetInstancedMesh,
  disposeAll,
  mergeSafe,
  paintGeometry,
} from "./three-helpers";
import { preloadTreeModels, TREE_MODEL_FILES, useTreeModels } from "./treeModels";
import { CityBuildings } from "./CityBuildings";
import type { QualityPreset } from "./quality";

// Start fetching + baking the Kenney tree GLBs as soon as this module loads,
// before any <Trees/> mounts (no-op on the server).
preloadTreeModels();

const METAL = 0x3c4043;
const DARK_HOUSING = 0x232527;

// ---------------------------------------------------------------------------
// Traffic lights
// ---------------------------------------------------------------------------

// Lamp local offsets on the head (x, y, z-forward): red top, yellow, green.
const LAMP_OFFSETS: [number, number, number][] = [
  [0, 3.06, 0.13],
  [0, 2.82, 0.13],
  [0, 2.58, 0.13],
];

const LAMP_ON = {
  red: new THREE.Color(0xff3b30),
  yellow: new THREE.Color(0xffb300),
  green: new THREE.Color(0x30d158),
} as const;
const LAMP_OFF = {
  red: LAMP_ON.red.clone().multiplyScalar(0.1),
  yellow: LAMP_ON.yellow.clone().multiplyScalar(0.1),
  green: LAMP_ON.green.clone().multiplyScalar(0.1),
} as const;

function lampColorsFor(phase: SignalPhase): [THREE.Color, THREE.Color, THREE.Color] {
  const red = phase === "red" || phase === "redYellow";
  const yellow = phase === "yellow" || phase === "redYellow";
  const green = phase === "green";
  return [
    red ? LAMP_ON.red : LAMP_OFF.red,
    yellow ? LAMP_ON.yellow : LAMP_OFF.yellow,
    green ? LAMP_ON.green : LAMP_OFF.green,
  ];
}

function TrafficLights({
  world,
  preset,
  getSignalPhase,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  getSignalPhase?: (signalNodeId: string) => SignalPhase;
}) {
  const lights = world.trafficLights;

  const housing = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.055, 0.07, 3.3, 8).translate(0, 1.65, 0);
    const head = new THREE.BoxGeometry(0.3, 0.82, 0.22).translate(0, 2.82, 0);
    const geometry = mergeSafe([pole, head], false);
    pole.dispose();
    head.dispose();
    const material = new THREE.MeshStandardMaterial({
      color: DARK_HOUSING,
      roughness: 0.6,
      metalness: 0.35,
    });
    const mesh = createInstancedMesh(geometry, material, lights, {
      castShadow: preset.castShadows === "full",
      name: "traffic-light-housings",
    });
    return { geometry, material, mesh };
  }, [lights, preset.castShadows]);

  const lamps = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.082, 10, 8);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    const mesh = createOffsetInstancedMesh(geometry, material, lights, LAMP_OFFSETS);
    mesh.name = "traffic-light-lamps";
    // Initialize instance colors so the attribute exists before frame 1.
    const initial = lampColorsFor("green");
    for (let i = 0; i < lights.length; i++) {
      mesh.setColorAt(i * 3, initial[0]);
      mesh.setColorAt(i * 3 + 1, initial[1]);
      mesh.setColorAt(i * 3 + 2, initial[2]);
    }
    return { geometry, material, mesh };
  }, [lights]);

  useEffect(
    () => () => {
      disposeAll([housing.geometry, housing.material]);
      housing.mesh.dispose();
    },
    [housing],
  );
  useEffect(
    () => () => {
      disposeAll([lamps.geometry, lamps.material]);
      lamps.mesh.dispose();
    },
    [lamps],
  );

  // Per-frame lamp state, mutated through refs (R3F escape hatch).
  const lampsRef = useRef<THREE.InstancedMesh | null>(null);
  const lastPhases = useRef<(SignalPhase | null)[]>([]);
  useEffect(() => {
    lastPhases.current = new Array<SignalPhase | null>(lights.length).fill(null);
  }, [lights, lamps]);

  useFrame(() => {
    const mesh = lampsRef.current;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < lights.length; i++) {
      const phase: SignalPhase = getSignalPhase?.(lights[i]!.nodeId) ?? "green";
      if (lastPhases.current[i] === phase) continue;
      lastPhases.current[i] = phase;
      const colors = lampColorsFor(phase);
      mesh.setColorAt(i * 3, colors[0]);
      mesh.setColorAt(i * 3 + 1, colors[1]);
      mesh.setColorAt(i * 3 + 2, colors[2]);
      dirty = true;
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="traffic-lights">
      <primitive object={housing.mesh} />
      <primitive object={lamps.mesh} ref={lampsRef} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Sign poles
// ---------------------------------------------------------------------------

/** Plate mount heights per kind (Д11 rides above Б1 on shared poles). */
const PLATE_HEIGHT: Record<SignKind, number> = {
  stop: 2.35,
  giveWay: 2.05,
  limit50: 2.35,
  roundabout: 2.72,
};

const SIGN_KINDS: SignKind[] = ["stop", "giveWay", "limit50", "roundabout"];

function SignPoles({
  world,
  preset,
  signSvgBaseUrl,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  signSvgBaseUrl: string | null;
}) {
  const signs = world.signs;

  // Procedural sign faces render immediately; the real catalog SVGs replace
  // them when fetched (plates rebuild — cheap, a few hundred instances).
  const procedural = useMemo(
    () => ({
      stop: proceduralSignTexture("stop", preset.signTextureSize),
      giveWay: proceduralSignTexture("giveWay", preset.signTextureSize),
      limit50: proceduralSignTexture("limit50", preset.signTextureSize),
      roundabout: proceduralSignTexture("roundabout", preset.signTextureSize),
    }),
    [preset.signTextureSize],
  );
  useEffect(() => () => disposeAll(Object.values(procedural)), [procedural]);

  const [svgTextures, setSvgTextures] = useState<Partial<
    Record<SignKind, THREE.Texture>
  > | null>(null);
  useEffect(() => {
    if (!signSvgBaseUrl) return;
    let cancelled = false;
    const loaded: Partial<Record<SignKind, THREE.Texture>> = {};
    Promise.all(
      SIGN_KINDS.map(async (kind) => {
        const tex = await loadSignTextureFromSvg(kind, signSvgBaseUrl, preset.signTextureSize);
        if (tex) loaded[kind] = tex;
      }),
    ).then(() => {
      if (cancelled || Object.keys(loaded).length === 0) {
        disposeAll(Object.values(loaded));
        return;
      }
      setSvgTextures(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [signSvgBaseUrl, preset.signTextureSize]);
  useEffect(
    () => () => {
      if (svgTextures) disposeAll(Object.values(svgTextures));
    },
    [svgTextures],
  );

  const poles = useMemo(() => {
    // One pole per placement EXCEPT roundabout plates (shared pole with Б1).
    const poleTransforms = signs.filter((s) => s.kind !== "roundabout");
    const geometry = new THREE.CylinderGeometry(0.035, 0.045, 2.9, 8).translate(0, 1.45, 0);
    const material = new THREE.MeshStandardMaterial({
      color: METAL,
      roughness: 0.55,
      metalness: 0.5,
    });
    const mesh = createInstancedMesh(geometry, material, poleTransforms, {
      castShadow: preset.castShadows === "full",
      name: "sign-poles",
    });
    return { geometry, material, mesh };
  }, [signs, preset.castShadows]);
  useEffect(
    () => () => {
      disposeAll([poles.geometry, poles.material]);
      poles.mesh.dispose();
    },
    [poles],
  );

  const plates = useMemo(() => {
    const base = new THREE.PlaneGeometry(0.72, 0.72);
    const list = SIGN_KINDS.map((kind) => {
      const geometry = base.clone().translate(0, PLATE_HEIGHT[kind], 0.05);
      const material = new THREE.MeshStandardMaterial({
        map: svgTextures?.[kind] ?? procedural[kind],
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = createInstancedMesh(
        geometry,
        material,
        signs.filter((s) => s.kind === kind),
        { name: `signs-${kind}` },
      );
      return { kind, geometry, material, mesh };
    });
    base.dispose();
    return list;
  }, [signs, procedural, svgTextures]);
  useEffect(
    () => () => {
      for (const p of plates) {
        p.geometry.dispose();
        p.material.dispose();
        p.mesh.dispose();
      }
    },
    [plates],
  );

  return (
    <group name="sign-poles">
      <primitive object={poles.mesh} />
      {plates.map((p) => (
        <primitive key={p.kind} object={p.mesh} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Streetlights
// ---------------------------------------------------------------------------

function Streetlights({
  world,
  preset,
  night,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night: boolean;
}) {
  const lights = world.streetlights;

  const housing = useMemo(() => {
    const pole = new THREE.CylinderGeometry(0.05, 0.075, 5.6, 8).translate(0, 2.8, 0);
    const arm = new THREE.CylinderGeometry(0.04, 0.045, 1.5, 6)
      .rotateX(Math.PI / 2 - 0.35)
      .translate(0, 5.75, 0.62);
    const head = new THREE.BoxGeometry(0.24, 0.1, 0.62).translate(0, 6.0, 1.28);
    const geometry = mergeSafe([pole, arm, head], false);
    pole.dispose();
    arm.dispose();
    head.dispose();
    const material = new THREE.MeshStandardMaterial({
      color: METAL,
      roughness: 0.6,
      metalness: 0.45,
    });
    const mesh = createInstancedMesh(geometry, material, lights, {
      castShadow: preset.castShadows === "full",
      name: "streetlight-housings",
    });
    return { geometry, material, mesh };
  }, [lights, preset.castShadows]);
  useEffect(
    () => () => {
      disposeAll([housing.geometry, housing.material]);
      housing.mesh.dispose();
    },
    [housing],
  );

  // Rebuilds on night toggle (rare, cheap) — keeps materials immutable.
  const glow = useMemo(() => {
    const geometry = new THREE.BoxGeometry(0.2, 0.04, 0.54).translate(0, 5.94, 1.28);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8f9498,
      emissive: 0xffd9a0,
      emissiveIntensity: night ? 2.4 : 0,
      roughness: 0.4,
    });
    const mesh = createInstancedMesh(geometry, material, lights, { name: "streetlight-glow" });
    return { geometry, material, mesh };
  }, [lights, night]);
  useEffect(
    () => () => {
      disposeAll([glow.geometry, glow.material]);
      glow.mesh.dispose();
    },
    [glow],
  );

  return (
    <group name="streetlights">
      <primitive object={housing.mesh} />
      <primitive object={glow.mesh} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

const TRUNK = 0x6b5340;
const FOLIAGE = [0x5d7a4a, 0x6f8c52, 0x4c6b45];

/**
 * Deterministic 4-way bucket: fold the builder's variant with a hash of the
 * (already deterministic) world position so all four GLB models get used while
 * placement stays fully reproducible.
 */
function modelIndexFor(t: TreePlacement): number {
  const n = TREE_MODEL_FILES.length;
  const hx = Math.imul(Math.floor(t.position[0]), 73856093);
  const hz = Math.imul(Math.floor(t.position[2]), 19349663);
  return (t.variant + (Math.abs(hx ^ hz) % n)) % n;
}

/** Procedural blob tree — retained as the fallback shown until the GLBs load. */
function makeTreeGeometry(variant: 0 | 1 | 2): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (variant === 2) {
    // Conifer: trunk + two stacked cones.
    parts.push(
      paintGeometry(new THREE.CylinderGeometry(0.09, 0.13, 1.2, 6).translate(0, 0.6, 0), TRUNK),
    );
    parts.push(paintGeometry(new THREE.ConeGeometry(1.15, 2.4, 7).translate(0, 2.2, 0), FOLIAGE[2]!));
    parts.push(paintGeometry(new THREE.ConeGeometry(0.8, 1.8, 7).translate(0, 3.6, 0), FOLIAGE[0]!));
  } else {
    const tall = variant === 1;
    const trunkH = tall ? 2.2 : 1.5;
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.1, 0.15, trunkH, 6).translate(0, trunkH / 2, 0),
        TRUNK,
      ),
    );
    const blob = new THREE.IcosahedronGeometry(tall ? 1.5 : 1.8, 0)
      .scale(1, tall ? 1.3 : 1.05, 1)
      .translate(0, trunkH + (tall ? 1.5 : 1.4), 0);
    parts.push(paintGeometry(blob, FOLIAGE[variant]!));
    if (!tall) {
      parts.push(
        paintGeometry(
          new THREE.IcosahedronGeometry(1.0, 0).translate(0.9, trunkH + 0.9, 0.3),
          FOLIAGE[1]!,
        ),
      );
    }
  }
  const merged = mergeSafe(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

interface TreeVariantMesh {
  mesh: THREE.InstancedMesh;
  /** Set only for the procedural fallback (the GLB geometries are cache-owned). */
  ownedGeometry: THREE.BufferGeometry | null;
}

function Trees({ world, preset }: { world: WorldGeometry; preset: QualityPreset }) {
  const models = useTreeModels();

  // Quality decimation: deterministic slice of the placement list.
  const kept = useMemo(() => {
    const keepEvery = preset.treeFraction >= 1 ? 1 : Math.round(1 / (1 - preset.treeFraction));
    return preset.treeFraction >= 1
      ? world.trees
      : world.trees.filter((_, i) => i % keepEvery !== 0);
  }, [world.trees, preset.treeFraction]);

  const assets = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    if (models) {
      // Real Kenney GLB trees: one instanced mesh per model, shared material,
      // placements bucketed deterministically across the four models.
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0,
      });
      const buckets: TreePlacement[][] = models.map(() => []);
      for (const t of kept) buckets[modelIndexFor(t)]!.push(t);
      const variants: TreeVariantMesh[] = models.map((geometry, i) => ({
        mesh: createInstancedMesh(geometry, material, buckets[i]!, {
          castShadow,
          name: `trees-glb-${i}`,
        }),
        ownedGeometry: null,
      }));
      return { material, variants };
    }
    // Fallback (GLBs not loaded yet / failed): procedural blob trees.
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
    });
    const variants: TreeVariantMesh[] = ([0, 1, 2] as const).map((variant) => {
      const geometry = makeTreeGeometry(variant);
      const placements = kept.filter((t) => t.variant === variant);
      return {
        mesh: createInstancedMesh(geometry, material, placements, {
          castShadow,
          name: `trees-${variant}`,
        }),
        ownedGeometry: geometry,
      };
    });
    return { material, variants };
  }, [models, kept, preset.castShadows]);

  useEffect(
    () => () => {
      assets.material.dispose();
      for (const v of assets.variants) {
        v.ownedGeometry?.dispose();
        v.mesh.dispose();
      }
    },
    [assets],
  );

  return (
    <group name="trees">
      {assets.variants.map((v, i) => (
        <primitive key={i} object={v.mesh} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export function WorldPropsGroup({
  world,
  preset,
  night,
  getSignalPhase,
  signSvgBaseUrl,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night: boolean;
  getSignalPhase?: (signalNodeId: string) => SignalPhase;
  signSvgBaseUrl: string | null;
}) {
  return (
    <group name="world-props">
      <CityBuildings world={world} preset={preset} night={night} />
      <TrafficLights world={world} preset={preset} getSignalPhase={getSignalPhase} />
      <SignPoles world={world} preset={preset} signSvgBaseUrl={signSvgBaseUrl} />
      <Streetlights world={world} preset={preset} night={night} />
      <Trees world={world} preset={preset} />
    </group>
  );
}
