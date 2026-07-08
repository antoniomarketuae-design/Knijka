"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Fog, type DirectionalLight, type HemisphereLight } from "three";
import type { CabinControls } from "./cabin";

const DAY_SKY = new Color("#8fb4dc");
const NIGHT_SKY = new Color("#0b1120");
const DAY_HEMI_SKY = new Color("#cfe5ff");
const NIGHT_HEMI_SKY = new Color("#2a3450");
const DAY_HEMI_GROUND = new Color("#3a4438");
const NIGHT_HEMI_GROUND = new Color("#05070c");
const DAY_SUN = new Color("#fff2df");
const NIGHT_MOON = new Color("#aebfe8");

/**
 * Scene lighting + sky with a smooth day/night blend (N key toggles the
 * night preview — the environment module will own real time-of-day later).
 * Mutates light/fog/background colors per frame; no React state, no
 * re-renders. Night is what makes the „Виток" headlight spotlights and lamp
 * emissives readable.
 */
export function SceneLighting({ cabinRef }: { cabinRef: RefObject<CabinControls | null> }) {
  const hemiRef = useRef<HemisphereLight>(null);
  const dirRef = useRef<DirectionalLight>(null);
  const factor = useRef(0);
  const scratch = useRef(new Color());

  useFrame((state, delta) => {
    const target = cabinRef.current?.nightPreview ? 1 : 0;
    const f = factor.current + (target - factor.current) * Math.min(1, 2.5 * delta);
    if (Math.abs(f - factor.current) < 1e-5 && f === target) return;
    factor.current = f;

    const hemi = hemiRef.current;
    const dir = dirRef.current;
    if (hemi) {
      hemi.intensity = 0.9 + (0.16 - 0.9) * f;
      hemi.color.lerpColors(DAY_HEMI_SKY, NIGHT_HEMI_SKY, f);
      hemi.groundColor.lerpColors(DAY_HEMI_GROUND, NIGHT_HEMI_GROUND, f);
    }
    if (dir) {
      dir.intensity = 1.4 + (0.08 - 1.4) * f;
      dir.color.lerpColors(DAY_SUN, NIGHT_MOON, f);
    }
    const sky = scratch.current.lerpColors(DAY_SKY, NIGHT_SKY, f);
    if (state.scene.background instanceof Color) state.scene.background.copy(sky);
    if (state.scene.fog instanceof Fog) {
      state.scene.fog.color.copy(sky);
      state.scene.fog.near = 150 + (60 - 150) * f;
      state.scene.fog.far = 550 + (320 - 550) * f;
    }
  });

  return (
    <>
      <color attach="background" args={["#8fb4dc"]} />
      <fog attach="fog" args={["#8fb4dc", 150, 550]} />
      <hemisphereLight ref={hemiRef} args={["#cfe5ff", "#3a4438", 0.9]} />
      <directionalLight ref={dirRef} position={[80, 120, 40]} intensity={1.4} color="#fff2df" />
    </>
  );
}
