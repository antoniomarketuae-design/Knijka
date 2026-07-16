// Shared weather channel between the environment rig (writer) and the rest of
// the sim (readers): road wetness and rain intensity, both 0..1.
//
// Module-level store, NOT React state: SimEnvironment steps it once per frame
// and consumers inside useFrame read it imperatively (getWetness) at zero
// cost. The React hooks (useWetness/useRainIntensity) are for occasional
// consumers (material props, overlays) — they re-render only on quantized
// 0.01 changes, i.e. ~100 renders spread over a several-second transition and
// none at steady state.
//
//   wetness       — how soaked the road looks. Ramps up in ~4 s of rain and
//                   dries out over ~12 s after it stops (asymmetric on
//                   purpose: puddles outlive the shower). The world module
//                   maps it to roughness/darkening via wetnessToRoadParams.
//   rainIntensity — how hard it is raining *right now* (cloud cover, streak
//                   opacity, light dimming). Faster in/out than wetness.
//   fogIntensity  — how dense the FOG weather is *right now* (doc 72 AC-03).
//                   Drives the FogExp2 density/color blend, the light dims and
//                   the SkyDome gray-out. Slower in/out than rain — fog banks
//                   roll in, they don't switch. Fog does NOT wet the road
//                   (wetness stays a rain channel).

import { useSyncExternalStore } from "react";

/** Wetness rise rate while raining (1/s → full soak in ~4 s). */
export const WETNESS_IN_PER_SEC = 1 / 4;
/** Wetness decay rate after rain stops (1/s → dry in ~12 s). */
export const WETNESS_OUT_PER_SEC = 1 / 12;
/** Rain intensity rise rate (1/s). */
export const RAIN_IN_PER_SEC = 1 / 1.5;
/** Rain intensity decay rate (1/s). */
export const RAIN_OUT_PER_SEC = 1 / 3;
/** Fog intensity rise rate (1/s → full bank in ~5 s). */
export const FOG_IN_PER_SEC = 1 / 5;
/** Fog intensity decay rate (1/s → lifts in ~6 s). */
export const FOG_OUT_PER_SEC = 1 / 6;

let wetness = 0;
let wetnessTarget = 0;
let rainIntensity = 0;
let rainTarget = 0;
let fogIntensity = 0;
let fogTarget = 0;

const listeners = new Set<() => void>();

function quantize(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function approach(current: number, target: number, ratePerSec: number, dtSec: number): number {
  const maxDelta = ratePerSec * dtSec;
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Set the targets from the lesson's rain/fog flags. Called by SimEnvironment.
 *  `fog` is additive (default false = today's rain-only behavior). */
export function setWeatherTarget(rain: boolean, fog = false): void {
  wetnessTarget = rain ? 1 : 0;
  rainTarget = rain ? 1 : 0;
  fogTarget = fog ? 1 : 0;
}

/**
 * Advance the weather toward its targets. Called once per frame by
 * SimEnvironment; safe to call from tests with synthetic dt.
 */
export function stepWeather(dtSec: number): void {
  if (dtSec <= 0) return;
  const prevW = quantize(wetness);
  const prevR = quantize(rainIntensity);
  const prevF = quantize(fogIntensity);
  wetness = clamp01(
    approach(wetness, wetnessTarget, wetness < wetnessTarget ? WETNESS_IN_PER_SEC : WETNESS_OUT_PER_SEC, dtSec),
  );
  rainIntensity = clamp01(
    approach(rainIntensity, rainTarget, rainIntensity < rainTarget ? RAIN_IN_PER_SEC : RAIN_OUT_PER_SEC, dtSec),
  );
  fogIntensity = clamp01(
    approach(fogIntensity, fogTarget, fogIntensity < fogTarget ? FOG_IN_PER_SEC : FOG_OUT_PER_SEC, dtSec),
  );
  if (quantize(wetness) !== prevW || quantize(rainIntensity) !== prevR || quantize(fogIntensity) !== prevF) {
    for (const fn of listeners) fn();
  }
}

/** Imperative read for per-frame consumers (shader uniforms, useFrame). */
export function getWetness(): number {
  return wetness;
}

/** Imperative read of current rain intensity 0..1. */
export function getRainIntensity(): number {
  return rainIntensity;
}

/** Imperative read of current FOG intensity 0..1 (per-frame consumers). */
export function getFogIntensity(): number {
  return fogIntensity;
}

/** Reset to bone-dry and clear. For tests and full sim teardown. */
export function resetWeather(): void {
  wetness = 0;
  wetnessTarget = 0;
  rainIntensity = 0;
  rainTarget = 0;
  fogIntensity = 0;
  fogTarget = 0;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Road wetness 0..1, quantized to 0.01. The world module consumes this for
 * the wet-road look; grip logic may read getWetness() directly.
 */
export function useWetness(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(wetness),
    () => 0,
  );
}

/** Rain intensity 0..1, quantized to 0.01 (drives overlays like droplets). */
export function useRainIntensity(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(rainIntensity),
    () => 0,
  );
}

/** Fog intensity 0..1, quantized to 0.01 (occasional React consumers). */
export function useFogIntensity(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(fogIntensity),
    () => 0,
  );
}

export interface RoadWetnessParams {
  /** Assign to MeshStandardMaterial.roughness on road surfaces. */
  roughness: number;
  /** Multiply the road's base color by this (wet asphalt darkens). */
  darken: number;
}

/**
 * Map a wetness value to standard-material params for road surfaces.
 * Dry: rough matte asphalt. Wet: darker + glossy so the sky/streetlights
 * smear into reflections. Pure — unit-tested.
 */
export function wetnessToRoadParams(
  w: number,
  opts?: { dryRoughness?: number; wetRoughness?: number; wetDarken?: number },
): RoadWetnessParams {
  const dryRoughness = opts?.dryRoughness ?? 0.92;
  const wetRoughness = opts?.wetRoughness ?? 0.42;
  const wetDarken = opts?.wetDarken ?? 0.62;
  const t = clamp01(w);
  return {
    roughness: dryRoughness + (wetRoughness - dryRoughness) * t,
    darken: 1 + (wetDarken - 1) * t,
  };
}
