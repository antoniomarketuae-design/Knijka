"use client";

// The atmosphere layer: sky, two-light rig, exponential fog, shadows, rain
// and (med + high presets) postprocessing — one component the integrator drops
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
// Tone mapping: AgX by default (SIM_TONE_MAPPING, ./toneMapping) — doc 71
// §4.3: hue preservation under the warm low sun (no orange→yellow skew) and it
// matches Blender 4/5's default view transform, so authored materials read the
// same in-browser. ACES stays one constant away as the A/B fallback. BOTH paths
// stay in sync: the renderer applies it directly while the composer is not
// in charge, and the composer re-applies the same operator as the LAST
// effect in its chain. Exposure is per-preset (presets.ts `exposure`) —
// three feeds gl.toneMappingExposure into the composer's tone-map shader too.
//
// Composer structure by quality level (the chain itself lives in
// ./SimComposer, loaded on demand — see the next/dynamic note below):
//   low  — none (renderer AgX + canvas MSAA)
//   med  — N8AO (half-res) → Bloom → SMAA → AgX ToneMapping →
//          HueSaturation + BrightnessContrast + Vignette (grade effects merge
//          into ONE fullscreen pass with SMAA/ToneMapping — ~free, doc 71
//          §4.3; the grade runs AFTER the tone map on purpose — see the
//          NaN note at the chain builder, doc 62 #4/#24)
//   high — same chain, more AO samples

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useFrame, useThree } from "@react-three/fiber";
import {
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
  FOG_HEMISPHERE_DIM,
  FOG_SUN_DIM,
  FOG_TOPDOWN_MAX_OPTICAL,
  RAIN_EXPOSURE_DIM,
  RAIN_HEMISPHERE_DIM,
  RAIN_SUN_DIM,
  SNOW_GROUND_WHITEN,
  SNOW_HEMISPHERE_DIM,
  SNOW_SUN_DIM,
  sunDirection,
  type TimeOfDay,
} from "./presets";
import { QUALITY_PRESETS, type QualityLevel } from "./quality";
import { useQuality } from "./qualityStore";
import { TONE_MAPPING_THREE } from "./toneMapping";
import {
  setWeatherTarget,
  stepWeather,
  getFogIntensity,
  getRainIntensity,
  getSnowIntensity,
  useRainIntensity,
  useSnowIntensity,
} from "./weather";
import { GroundBackdrop } from "./GroundBackdrop";
import { SkyDome } from "./SkyDome";
import { RainStreaks } from "./RainStreaks";
import { SnowFlakes } from "./SnowFlakes";

export interface SimEnvironmentProps {
  timeOfDay: TimeOfDay;
  rain: boolean;
  /** FOG weather (doc 72 AC-03) — dense FogExp2 + dimmed rig + grey sky wash.
   *  Additive; absent/false = today's clear/rain behavior. */
  fog?: boolean;
  /** SNOW weather (doc 72 AC-08 winter grip) — a LIGHTER, colder fog-like
   *  haze (presets.ts snowWeather) + a milder rig dim + a cold sky wash +
   *  instanced snowfall (SnowFlakes, gated by quality like rain) + a cold
   *  ground-bounce whitening (SNOW_GROUND_WHITEN). White ground TEXTURES
   *  remain world-module asset work. Additive; absent/false = the shipped
   *  behavior. */
  snow?: boolean;
  /** V3's skyline gate (doc 82 §3.2) — forwarded verbatim to the sky dome.
   *  `false` damps the Vitosha ridge uniform to 0, for the enclosed maps that
   *  have no far horizon to put it on. Scenes that mount a district decide
   *  this from the map itself: `mapKindHasSkyline(district.meta.mapKind)`
   *  (./skyline). Omitted = on, because a missing skyline is the „flat-earth
   *  test level" tell doc 82 §1.2 named. */
  skyline?: boolean;
  /** Explicit quality level; omit to follow the quality store ("auto"). */
  quality?: QualityLevel;
}

/**
 * The composer, in its OWN CHUNK (doc 82 §2.3 fix 3).
 *
 * `@react-three/postprocessing` + `postprocessing` are 330,491 B of minified
 * JS. This module is statically imported by LessonScene, so before the split a
 * phone at tier `low` — where `postprocessing` is false and the composer never
 * mounts — still paid ≈400–660 ms of Android parse time for it. §2.1: the
 * phone's deficit is CPU, not fill rate, so parse cost on the critical path to
 * the first frame is the expensive kind of byte.
 *
 * `ssr: false` because the chain only ever exists inside a live <Canvas>;
 * `loading` stays the default (null), which is exactly what `low` should
 * render. next/dynamic caches the resolved module, so the quality-switch
 * remount below re-mounts the component without re-fetching the chunk.
 */
const SimComposer = dynamic(() => import("./SimComposer").then((m) => m.SimComposer), {
  ssr: false,
});

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

export function SimEnvironment({
  timeOfDay,
  rain,
  fog = false,
  snow = false,
  skyline = true,
  quality,
}: SimEnvironmentProps) {
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

  // Assert the operator on the renderer once, at EVERY tier.
  //
  // At `low` the per-frame guard below owns it, as before. At med/high the
  // composer owns the final image — but it now arrives one or two frames late
  // (its chunk is fetched on demand), and until it mounts the renderer would
  // tone-map with R3F's own default rather than ours: a brief ACES-vs-AgX
  // flash at scene start that did not exist while the import was static.
  // Setting it here also means the value @react-three/postprocessing SAVES on
  // mount — and restores when a quality switch unmounts it — is the right one.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/immutability -- the renderer's tone
       mapper is a mutable field on the three.js renderer; there is no other API
       for it, and the useFrame path below already writes it at `low`. */
    gl.toneMapping = TONE_MAPPING_THREE;
  }, [gl]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && qp.shadows && !gl.shadowMap.enabled) {
      console.warn(
        "[SimEnvironment] quality preset wants shadows but gl.shadowMap is disabled — pass `shadows` on the <Canvas>.",
      );
    }
  }, [gl, qp.shadows]);

  // Weather targets follow the rain/fog/snow props; the store ramps toward them.
  useEffect(() => {
    setWeatherTarget(rain, fog, snow);
  }, [rain, fog, snow]);

  // Streaks stay mounted while the rain intensity fades out after rain stops
  // (the store update re-renders us at quantized steps until it hits 0).
  const rainFade = useRainIntensity();
  const rainVisible = rain || rainFade > 0.01;
  // Same lifecycle for snowfall — flakes fade out, they don't pop.
  const snowFade = useSnowIntensity();
  const snowVisible = snow || snowFade > 0.01;

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
      fogWeatherColor: new Color(preset.fogWeather.color),
      snowWeatherColor: new Color(preset.snowWeather.color),
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
    hemiGroundGoal: new Color(),
    up: new Vector3(0, 1, 0),
  });

  const fogArgs = useMemo<[string, number]>(() => ["#e3c49c", 0.0028], []);

  useFrame((state, delta) => {
    stepWeather(delta);
    const rainNow = getRainIntensity();
    const fogNow = getFogIntensity();
    const snowNow = getSnowIntensity();

    const hemi = hemiRef.current;
    const sun = sunRef.current;
    const fogObj = fogRef.current;
    const sunTarget = targetRef.current;
    if (!hemi || !sun || !fogObj || !sunTarget) return;

    // While the composer is not in charge of the final image, keep the
    // renderer on the chosen tone mapper (the composer sets NoToneMapping
    // while mounted and re-applies the same operator as its last effect —
    // never fight it there).
    if (!qp.postprocessing && state.gl.toneMapping !== TONE_MAPPING_THREE) {
      state.gl.toneMapping = TONE_MAPPING_THREE;
    }

    // First frame snaps to the preset (damp with dt→∞ lands exactly);
    // afterwards everything eases.
    const dt = initialized.current ? Math.min(delta, 0.1) : 1000;
    initialized.current = true;
    const scratch = scratchRef.current;

    // Per-preset exposure, damped like the rest of the rig so time-of-day
    // switches crossfade. Applies on BOTH paths: the renderer's built-in tone
    // map (no composer) and the composer's ToneMapping effect (three copies
    // gl.toneMappingExposure into that effect's shader uniform each frame).
    // Rain lowers it (RAIN_EXPOSURE_DIM) — the founder-v4 missing lever: without
    // this the whole image still metered like a bright day under the shower.
    // Rain-only: fog/snow keep the preset exposure (rainNow is 0 in a dry/fog/
    // snow scene, so this term is a no-op there).
    state.gl.toneMappingExposure = MathUtils.damp(
      state.gl.toneMappingExposure,
      preset.exposure * (1 - RAIN_EXPOSURE_DIM * rainNow),
      FADE_LAMBDA,
      dt,
    );

    // Hemisphere fill. Rain, fog and snow dims stack multiplicatively (a foggy
    // rain is darker than either alone; fog's own dim dominates via its
    // constants; snow's is the mildest — a winter sky stays bright).
    dampColor(hemi.color, goal.hemiSky, FADE_LAMBDA, dt);
    // Ground whitening under snow rides the LIGHT, not new geometry: lerp the
    // hemisphere ground bounce toward the preset's cold snowWeather color
    // (already graded per time of day — bright white by day, faint cold grey
    // at night). Fresh snow albedo ~0.8 vs asphalt ~0.1, so undersides start
    // reading "white world below". Zero extra draw calls, no z-fighting — the
    // road-overlay-plane alternative was rejected: any plane above the road
    // either buries the raised lane markings or shimmers against them.
    scratch.hemiGroundGoal
      .copy(goal.hemiGround)
      .lerp(goal.snowWeatherColor, snowNow * SNOW_GROUND_WHITEN);
    dampColor(hemi.groundColor, scratch.hemiGroundGoal, FADE_LAMBDA, dt);
    hemi.intensity = MathUtils.damp(
      hemi.intensity,
      preset.light.hemisphere.intensity *
        (1 - RAIN_HEMISPHERE_DIM * rainNow) *
        (1 - FOG_HEMISPHERE_DIM * fogNow) *
        (1 - SNOW_HEMISPHERE_DIM * snowNow),
      FADE_LAMBDA,
      dt,
    );

    // Key light (sun/moon) — fog diffuses it heavily (FOG_SUN_DIM 0.8); a
    // snow overcast sits between rain and fog (SNOW_SUN_DIM 0.6).
    dampColor(sun.color, goal.sunColor, FADE_LAMBDA, dt);
    sun.intensity = MathUtils.damp(
      sun.intensity,
      preset.light.sun.intensity *
        (1 - RAIN_SUN_DIM * rainNow) *
        (1 - FOG_SUN_DIM * fogNow) *
        (1 - SNOW_SUN_DIM * snowNow),
      FADE_LAMBDA,
      dt,
    );
    const dir = scratch.sunDir;
    dir.x = MathUtils.damp(dir.x, goal.sunDir.x, FADE_LAMBDA, dt);
    dir.y = MathUtils.damp(dir.y, goal.sunDir.y, FADE_LAMBDA, dt);
    dir.z = MathUtils.damp(dir.z, goal.sunDir.z, FADE_LAMBDA, dt);
    dir.normalize();

    // Fog: blend clear↔rain spec by rain intensity, then let SNOW pull the
    // haze toward its cold white veil, then let FOG WEATHER win over both
    // (a foggy scene is fog first — it is the denser bank), then ease toward
    // the result.
    scratch.fogGoal.copy(goal.fogColor).lerp(goal.rainFogColor, rainNow);
    scratch.fogGoal.lerp(goal.snowWeatherColor, snowNow);
    scratch.fogGoal.lerp(goal.fogWeatherColor, fogNow);
    dampColor(fogObj.color, scratch.fogGoal, FADE_LAMBDA, dt);
    // FOG/SNOW-weather density, capped by camera altitude so the ~110 m
    // topdown view reads a clearly-veiled wash instead of a solid sheet (see
    // FOG_TOPDOWN_MAX_OPTICAL — an honest view-aid concession; driving views
    // sit far below the cap and render full density). The damp smooths the
    // cap change across view-mode switches like every other rig value.
    const camAltitudeM = Math.max(state.camera.position.y, 1);
    const fogWeatherDensity = Math.min(
      preset.fogWeather.density,
      FOG_TOPDOWN_MAX_OPTICAL / camAltitudeM,
    );
    const snowWeatherDensity = Math.min(
      preset.snowWeather.density,
      FOG_TOPDOWN_MAX_OPTICAL / camAltitudeM,
    );
    const baseDensity = preset.fog.density + (preset.rainFog.density - preset.fog.density) * rainNow;
    const withSnowDensity = baseDensity + (snowWeatherDensity - baseDensity) * snowNow;
    fogObj.density = MathUtils.damp(
      fogObj.density,
      withSnowDensity + (fogWeatherDensity - withSnowDensity) * fogNow,
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
      <SkyDome timeOfDay={timeOfDay} skyline={skyline} />
      {/* …and the GROUND half of the same horizon. Ungated on purpose: the
          `skyline` flag asks whether the scene has somewhere to hang Vitosha,
          while this asks whether the world continues past the edge of the map —
          and it does on the полигон and the parking lots too (./GroundBackdrop
          carries the measurement from sc-junction-stop__m0.k2.webp). */}
      <GroundBackdrop />
      <fogExp2 ref={fogRef} attach="fog" args={fogArgs} />
      <hemisphereLight ref={hemiRef} intensity={0} />
      {/* Shadow bias: a small depth bias kills acne while a low normalBias
          keeps contact shadows attached (0.6 peter-panned them off the ground
          so objects looked to float). Retuned together for the tight
          camera-following ortho map. */}
      <directionalLight
        key={level}
        ref={sunRef}
        intensity={0}
        castShadow={qp.shadows}
        shadow-mapSize-width={qp.shadowMapSize}
        shadow-mapSize-height={qp.shadowMapSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
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
      {snowVisible && qp.snowParticles > 0 && (
        <SnowFlakes count={qp.snowParticles} timeOfDay={timeOfDay} />
      )}
      {qp.postprocessing && (
        // The chain lives in ./SimComposer (its own chunk). It still carries
        // the `key={`fx-${level}`}` remount on its EffectComposer, so a rare
        // quality switch rebuilds the pass chain exactly as before.
        <SimComposer level={level} />
      )}
    </>
  );
}
