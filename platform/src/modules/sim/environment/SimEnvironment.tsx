"use client";

// The atmosphere layer: sky, two-light rig, exponential fog, shadows, rain
// and (high preset only) postprocessing — one component the integrator drops
// into the Canvas next to the world.
//
//   <SimEnvironment timeOfDay="dusk" rain quality="med" />
//
// Design rules that keep it 60 fps on Iris Xe:
//  - The rig is structurally constant across time-of-day (1 hemisphere +
//    1 directional + FogExp2 + sky dome): switching day/dusk/night only
//    animates values, so three.js never recompiles materials mid-drive.
//  - All per-frame writes go straight to three objects via refs (no React
//    state at frame rate).
//  - The directional shadow map is a tight camera-following ortho frustum,
//    snapped to shadow-texel increments so edges don't shimmer as you drive.
//  - Quality changes remount the light (key) — a deliberate, rare hitch.
//
// Tone mapping: R3F already defaults the renderer to ACES filmic (do NOT
// pass `flat` on the Canvas); this component re-asserts it defensively while
// the composer is not in charge. At the high preset the EffectComposer takes
// over the final image and ACES is re-applied as the last effect in its chain.

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  ACESFilmicToneMapping,
  Color,
  MathUtils,
  Vector3,
  type DirectionalLight,
  type FogExp2,
  type HemisphereLight,
  type Object3D,
} from "three";
import {
  ENVIRONMENT_PRESETS,
  RAIN_HEMISPHERE_DIM,
  RAIN_SUN_DIM,
  sunDirection,
  type TimeOfDay,
} from "./presets";
import { QUALITY_PRESETS, type QualityLevel } from "./quality";
import { useQuality } from "./qualityStore";
import { setWeatherTarget, stepWeather, getRainIntensity, useRainIntensity } from "./weather";
import { SkyDome } from "./SkyDome";
import { RainStreaks } from "./RainStreaks";

export interface SimEnvironmentProps {
  timeOfDay: TimeOfDay;
  rain: boolean;
  /** Explicit quality level; omit to follow the quality store ("auto"). */
  quality?: QualityLevel;
}

/** Damping stiffness for time-of-day crossfades (≈2 s to settle). */
const FADE_LAMBDA = 2.2;
/** Distance from the shadow anchor to the light along the sun direction, m. */
const SUN_DISTANCE = 140;
/** How far ahead of the camera the shadow frustum is biased, m. */
const SHADOW_AHEAD_M = 20;

function dampColor(cur: Color, goal: Color, lambda: number, dt: number): void {
  cur.r = MathUtils.damp(cur.r, goal.r, lambda, dt);
  cur.g = MathUtils.damp(cur.g, goal.g, lambda, dt);
  cur.b = MathUtils.damp(cur.b, goal.b, lambda, dt);
}

export function SimEnvironment({ timeOfDay, rain, quality }: SimEnvironmentProps) {
  const store = useQuality();
  const level = quality ?? store.level;
  const qp = QUALITY_PRESETS[level];
  const preset = ENVIRONMENT_PRESETS[timeOfDay];

  const gl = useThree((s) => s.gl);

  const hemiRef = useRef<HemisphereLight>(null);
  const sunRef = useRef<DirectionalLight>(null);
  const targetRef = useRef<Object3D>(null);
  const fogRef = useRef<FogExp2>(null);
  const initialized = useRef(false);

  // Wire the light to its scene-resident target (both R3F-created).
  useEffect(() => {
    const light = sunRef.current;
    const target = targetRef.current;
    if (light && target) light.target = target;
  }, [level]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && qp.shadows && !gl.shadowMap.enabled) {
      console.warn(
        "[SimEnvironment] quality preset wants shadows but gl.shadowMap is disabled — pass `shadows` on the <Canvas>.",
      );
    }
  }, [gl, qp.shadows]);

  // Weather targets follow the rain prop; the store ramps toward them.
  useEffect(() => {
    setWeatherTarget(rain);
  }, [rain]);

  // Streaks stay mounted while the rain intensity fades out after rain stops
  // (the store update re-renders us at quantized steps until it hits 0).
  const rainFade = useRainIntensity();
  const rainVisible = rain || rainFade > 0.01;

  // Per-preset goal values (allocated only when timeOfDay changes).
  const goal = useMemo(() => {
    const s = sunDirection(preset.light.sun);
    return {
      sunDir: new Vector3(s.x, s.y, s.z),
      sunColor: new Color(preset.light.sun.color),
      hemiSky: new Color(preset.light.hemisphere.skyColor),
      hemiGround: new Color(preset.light.hemisphere.groundColor),
      fogColor: new Color(preset.fog.color),
      rainFogColor: new Color(preset.rainFog.color),
    };
  }, [preset]);

  // Scratch objects — never allocate in useFrame (CameraRig pattern).
  const scratchRef = useRef({
    sunDir: new Vector3(0, 1, 0),
    anchor: new Vector3(),
    forward: new Vector3(),
    right: new Vector3(),
    upL: new Vector3(),
    fogGoal: new Color(),
    up: new Vector3(0, 1, 0),
  });

  const fogArgs = useMemo<[string, number]>(() => ["#b7cfe6", 0.002], []);

  useFrame((state, delta) => {
    stepWeather(delta);
    const rainNow = getRainIntensity();

    const hemi = hemiRef.current;
    const sun = sunRef.current;
    const fog = fogRef.current;
    const sunTarget = targetRef.current;
    if (!hemi || !sun || !fog || !sunTarget) return;

    // While the composer is not in charge of the final image, keep the
    // renderer on ACES (the composer sets NoToneMapping while mounted and
    // re-applies ACES as its last effect — never fight it there).
    if (!qp.postprocessing && state.gl.toneMapping !== ACESFilmicToneMapping) {
      state.gl.toneMapping = ACESFilmicToneMapping;
      state.gl.toneMappingExposure = 1;
    }

    // First frame snaps to the preset (damp with dt→∞ lands exactly);
    // afterwards everything eases.
    const dt = initialized.current ? Math.min(delta, 0.1) : 1000;
    initialized.current = true;
    const scratch = scratchRef.current;

    // Hemisphere fill.
    dampColor(hemi.color, goal.hemiSky, FADE_LAMBDA, dt);
    dampColor(hemi.groundColor, goal.hemiGround, FADE_LAMBDA, dt);
    hemi.intensity = MathUtils.damp(
      hemi.intensity,
      preset.light.hemisphere.intensity * (1 - RAIN_HEMISPHERE_DIM * rainNow),
      FADE_LAMBDA,
      dt,
    );

    // Key light (sun/moon).
    dampColor(sun.color, goal.sunColor, FADE_LAMBDA, dt);
    sun.intensity = MathUtils.damp(
      sun.intensity,
      preset.light.sun.intensity * (1 - RAIN_SUN_DIM * rainNow),
      FADE_LAMBDA,
      dt,
    );
    const dir = scratch.sunDir;
    dir.x = MathUtils.damp(dir.x, goal.sunDir.x, FADE_LAMBDA, dt);
    dir.y = MathUtils.damp(dir.y, goal.sunDir.y, FADE_LAMBDA, dt);
    dir.z = MathUtils.damp(dir.z, goal.sunDir.z, FADE_LAMBDA, dt);
    dir.normalize();

    // Fog: blend clear↔rain spec by rain intensity, then ease toward it.
    scratch.fogGoal.copy(goal.fogColor).lerp(goal.rainFogColor, rainNow);
    dampColor(fog.color, scratch.fogGoal, FADE_LAMBDA, dt);
    fog.density = MathUtils.damp(
      fog.density,
      preset.fog.density + (preset.rainFog.density - preset.fog.density) * rainNow,
      FADE_LAMBDA,
      dt,
    );

    // Anchor the light (and its shadow frustum) just ahead of the camera on
    // the ground plane, snapped to shadow-texel increments in light space so
    // shadow edges don't crawl while driving.
    const cam = state.camera;
    cam.getWorldDirection(scratch.forward);
    scratch.anchor.copy(cam.position).addScaledVector(scratch.forward, SHADOW_AHEAD_M);
    scratch.anchor.y = 0;

    if (qp.shadows) {
      const texel = (2 * qp.shadowRadiusM) / qp.shadowMapSize;
      scratch.right.crossVectors(scratch.up, dir);
      if (scratch.right.lengthSq() < 1e-6) scratch.right.set(1, 0, 0);
      scratch.right.normalize();
      scratch.upL.crossVectors(dir, scratch.right);
      const ax = Math.round(scratch.anchor.dot(scratch.right) / texel) * texel;
      const ay = Math.round(scratch.anchor.dot(scratch.upL) / texel) * texel;
      const az = scratch.anchor.dot(dir);
      scratch.anchor
        .set(0, 0, 0)
        .addScaledVector(scratch.right, ax)
        .addScaledVector(scratch.upL, ay)
        .addScaledVector(dir, az);
    }

    sunTarget.position.copy(scratch.anchor);
    sun.position.copy(scratch.anchor).addScaledVector(dir, SUN_DISTANCE);
  });

  return (
    <>
      <SkyDome timeOfDay={timeOfDay} />
      <fogExp2 ref={fogRef} attach="fog" args={fogArgs} />
      <hemisphereLight ref={hemiRef} intensity={0} />
      <directionalLight
        key={level}
        ref={sunRef}
        intensity={0}
        castShadow={qp.shadows}
        shadow-mapSize-width={qp.shadowMapSize}
        shadow-mapSize-height={qp.shadowMapSize}
        shadow-bias={-0.0003}
        shadow-normalBias={0.6}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[
            -qp.shadowRadiusM,
            qp.shadowRadiusM,
            qp.shadowRadiusM,
            -qp.shadowRadiusM,
            1,
            350,
          ]}
        />
      </directionalLight>
      <object3D ref={targetRef} />
      {rainVisible && qp.rainParticles > 0 && (
        <RainStreaks count={qp.rainParticles} timeOfDay={timeOfDay} />
      )}
      {qp.postprocessing && (
        <EffectComposer multisampling={qp.composerMultisampling} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.45} luminanceThreshold={1.0} luminanceSmoothing={0.25} />
          <Vignette eskil={false} offset={0.28} darkness={0.45} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
