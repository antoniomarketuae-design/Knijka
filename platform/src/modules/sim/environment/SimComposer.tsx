"use client";

// The postprocessing chain, split out of SimEnvironment into its own chunk.
//
// WHY THIS FILE EXISTS (doc 82 §2.3 fix 3, the phone-parse budget). It is
// nothing but the `qp.postprocessing` branch that used to live at the bottom
// of SimEnvironment.tsx — moved verbatim, not retuned. What changed is where
// its IMPORTS land: `@react-three/postprocessing` + `postprocessing` are
// 330,491 B of minified JS, and SimEnvironment is statically imported by
// LessonScene, so a phone at tier `low` (`postprocessing: false`) parsed all
// of it and mounted none of it — ≈400–660 ms of Android CPU before the first
// frame (§2.1: the phone is a weak CPU, not a weak GPU; parse time is the
// deficit that matters). SimEnvironment now pulls this module through
// `next/dynamic`, so the chunk is requested only by the tiers that render it.
//
// The chain itself is unchanged and stays load-bearing in order:
//   N8AO (half-res) → Bloom → SMAA → AgX ToneMapping →
//   HueSaturation + BrightnessContrast + Vignette
// N8AO is a Pass and runs first; ToneMapping maps the fully-composited HDR
// image; the grade runs LAST, on the tone-mapped output (the doc 62 #4/#24
// NaN fix — see the note at the chain builder).

import { useMemo, type JSX } from "react";
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
import { QUALITY_PRESETS, type QualityLevel } from "./quality";
import { SIM_TONE_MAPPING } from "./toneMapping";

/** The postprocessing enum for the operator SimEnvironment applies directly. */
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

export interface SimComposerProps {
  /** Quality level; its preset flags select the chain. */
  level: QualityLevel;
}

export function SimComposer({ level }: SimComposerProps) {
  const qp = QUALITY_PRESETS[level];

  // The effect chain for this quality level, memoized on the level flags so it
  // stays a stable array across the frequent rain-fade re-renders SimEnvironment
  // pushes down — otherwise the EffectComposer would tear down and rebuild
  // every pass on each one.
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
    // SMAA (the AA that replaces canvas MSAA) then the tone map: ToneMapping
    // maps the fully-composited HDR image with the SAME operator as the
    // non-composer renderer path (both read toneMapping.ts).
    chain.push(<SMAA key="smaa" />);
    chain.push(<ToneMapping key="tonemap" mode={TONE_MAPPING_MODE} />);
    if (qp.colorGrade) {
      // Finishing grade (med + high — doc 71 §4.3: pmndrs merges consecutive
      // effects into ONE fullscreen pass with SMAA + ToneMapping, ~free):
      // saturation + contrast counter the tone mapper's flattening, plus a
      // soft vignette.
      //
      // ORDER IS LOAD-BEARING — the grade must run AFTER ToneMapping (founder
      // review doc 62 #4/#24 "dark spots"): HueSaturation's boost is
      // mix(luminance, color, 1 + s), which drives the weakest channel of any
      // saturated bright pixel NEGATIVE in HDR (amber indicator glow, the
      // cyan objective pillar, fleet blinker lamps). The merged EffectPass
      // then feeds that negative value through a pow() colorspace conversion
      // → NaN → the pixel renders BLACK. Post-AgX the input is display-
      // referred [0,1] and never saturated enough to go negative, so the
      // same grade is NaN-safe (verified pixel-exact in the doc 62 S5 wave:
      // pre-fix lamp pixel (0,0,0), post-fix (224,178,89)).
      chain.push(<HueSaturation key="grade" hue={0} saturation={GRADE_SATURATION} />);
      chain.push(
        <BrightnessContrast key="contrast" brightness={0} contrast={GRADE_CONTRAST} />,
      );
      chain.push(<Vignette key="vignette" eskil={false} offset={0.28} darkness={0.45} />);
    }
    return chain;
  }, [qp.aoEnabled, qp.aoHalfRes, qp.aoQuality, qp.bloom, qp.colorGrade]);

  // SMAA (not canvas MSAA) antialiases here: the composer renders offscreen,
  // so the Canvas `antialias` flag can't reach scene edges. multisampling=0 for
  // that reason; frameBufferType defaults to HalfFloat (HDR) which bloom + tone
  // mapping need. Keyed by level so a rare quality switch rebuilds the pass
  // chain cleanly — the same remount semantics as before the code split.
  return (
    <EffectComposer key={`fx-${level}`} multisampling={0} enableNormalPass={false}>
      {composerChildren}
    </EffectComposer>
  );
}

export default SimComposer;
