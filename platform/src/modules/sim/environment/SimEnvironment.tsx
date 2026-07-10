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
// Tone mapping: AgX by default (SIM_TONE_MAPPING) — doc 71 §4.3: hue
// preservation under the warm low sun (no orange→yellow skew) and it matches
// Blender 4/5's default view transform, so authored materials read the same
// in-browser. ACES stays one constant away as the A/B fallback. BOTH paths
// stay in sync: the renderer applies it directly while the composer is not
// in charge, and the composer re-applies the same operator as the LAST
// effect in its chain. Exposure is per-preset (presets.ts `exposure`) —
// three feeds gl.toneMappingExposure into the composer's tone-map shader too.
//
// Composer structure by quality level:
//   low  — none (renderer AgX + canvas MSAA)
//   med  — N8AO (half-res) → Bloom → HueSaturation + BrightnessContrast +
//          Vignette → SMAA → AgX ToneMapping (grade effects merge into ONE
//          fullscreen pass with SMAA/ToneMapping — ~free, doc 71 §4.3)
//   high — same chain, more AO samples

import { useEffect, useMemo, useRef, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
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

/**
 * The tone-mapping operator, ONE switch for both paths (renderer fallback +
 * composer ToneMapping effect — the file header documents that contract).
 * "agx" is the doc 71 §4.3 ruling (A/B winner over ACES: hue preservation +
 * Blender-parity); flip to "aces" to compare — nothing else needs touching.
 */
const SIM_TONE_MAPPING = "agx" as "agx" | "aces";
const TONE_MAPPING_THREE =
  SIM_TONE_MAPPING === "aces" ? ACESFilmicToneMapping : AgXToneMapping;
const TONE_MAPPING_MODE =
  SIM_TONE_MAPPING === "aces" ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX;

/**
 * Color grade riding in the composer's final effect pass (med + high) —
 * counters the tone mapper's flattening (AgX lifts mid-contrast, ACES
 * desaturates). Doc 71 §4.3 bands: saturation 0.12–0.2, contrast 0.07–0.1.
 */
const GRADE_SATURATION = 0.15;
const GRADE_CONTRAST = 0.08;

/**
 * N8AO tuning (med + high). World-space radius, so contact darkening stays a
 * fixed physical size regardless of distance. Library guidance: intensity 2 =
 * subtle, 5 = heavy — the old 1.5/1.5 sat below the visibility floor on a
 * bright scene (part of "everything floats"). Radius 2.5 m reaches curb
 * bases, window recesses and street-canyon corners; half-res cost is
 * unchanged (samples don't scale with radius). If curb bases read "dirty",
 * drop intensity toward 1.9 before touching radius (doc 71 §4.3; retune DOWN
 * once baked AO lands in Phase 4 to avoid double-darkening).
 */
const AO_RADIUS_M = 2.5;
/** How quickly AO fades with world distance between occluder and receiver. */
const AO_DISTANCE_FALLOFF = 1.0;
/** AO strength (higher = darker crevices). */
const AO_INTENSITY = 2.2;

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

  const fogArgs = useMemo<[string, number]>(() => ["#e3c49c", 0.0028], []);

  useFrame((state, delta) => {
    stepWeather(delta);
    const rainNow = getRainIntensity();

    const hemi = hemiRef.current;
    const sun = sunRef.current;
    const fog = fogRef.current;
    const sunTarget = targetRef.current;
    if (!hemi || !sun || !fog || !sunTarget) return;

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
    state.gl.toneMappingExposure = MathUtils.damp(
      state.gl.toneMappingExposure,
      preset.exposure,
      FADE_LAMBDA,
      dt,
    );

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

  // The composer's effect chain for this quality level, memoized on the level
  // flags so it stays a stable array across the frequent rain-fade re-renders
  // — otherwise the EffectComposer would tear down and rebuild every pass on
  // each one. Order is load-bearing: N8AO (a Pass) runs first; ToneMapping is
  // the final Effect so ACES lands on the fully-composited HDR image.
  const composerChildren = useMemo<JSX.Element[]>(() => {
    const chain: JSX.Element[] = [];
    if (qp.aoEnabled) {
      // Half-res ambient occlusion — the single biggest "flatness" fix. Runs
      // its own depth pass (no composer normal pass needed).
      chain.push(
        <N8AO
          key="ao"
          halfRes={qp.aoHalfRes}
          quality={qp.aoQuality}
          aoRadius={AO_RADIUS_M}
          distanceFalloff={AO_DISTANCE_FALLOFF}
          intensity={AO_INTENSITY}
          screenSpaceRadius={false}
        />,
      );
    }
    if (qp.bloom) {
      // Tight HDR bloom on the sun disc / bright speculars / lit windows
      // (med + high). mipmapBlur with a small radius keeps the glow contained
      // (not "blobby") and cheap on a weak GPU. Threshold 0.9 (doc 71 §4.3):
      // with the low golden sun + exposure 1.15, paint speculars and DAY_GLOW
      // 2.0 window emissives sit just above it while lit facades stay clean.
      // Its convolution makes it its own pass, before tone mapping.
      chain.push(
        <Bloom
          key="bloom"
          mipmapBlur
          radius={0.6}
          intensity={0.75}
          luminanceThreshold={0.9}
          luminanceSmoothing={0.2}
        />,
      );
    }
    if (qp.colorGrade) {
      // Finishing grade (med + high — doc 71 §4.3: pmndrs merges consecutive
      // effects into ONE fullscreen pass with SMAA + ToneMapping, ~free):
      // saturation + contrast counter the tone mapper's flattening, plus a
      // soft vignette.
      chain.push(<HueSaturation key="grade" hue={0} saturation={GRADE_SATURATION} />);
      chain.push(
        <BrightnessContrast key="contrast" brightness={0} contrast={GRADE_CONTRAST} />,
      );
      chain.push(<Vignette key="vignette" eskil={false} offset={0.28} darkness={0.45} />);
    }
    // SMAA (the AA that replaces canvas MSAA) then the tone map close every
    // chain; ToneMapping stays LAST so it maps the fully-composited image
    // with the SAME operator as the non-composer renderer path.
    chain.push(<SMAA key="smaa" />);
    chain.push(<ToneMapping key="tonemap" mode={TONE_MAPPING_MODE} />);
    return chain;
  }, [qp.aoEnabled, qp.aoHalfRes, qp.aoQuality, qp.bloom, qp.colorGrade]);

  return (
    <>
      <SkyDome timeOfDay={timeOfDay} />
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
      {qp.postprocessing && (
        // SMAA (not canvas MSAA) antialiases here: the composer renders
        // offscreen, so the Canvas `antialias` flag can't reach scene edges.
        // multisampling=0 for that reason; frameBufferType defaults to
        // HalfFloat (HDR) which bloom + tone mapping need. Keyed by level so a
        // rare quality switch rebuilds the pass chain cleanly.
        <EffectComposer key={`fx-${level}`} multisampling={0} enableNormalPass={false}>
          {composerChildren}
        </EffectComposer>
      )}
    </>
  );
}
