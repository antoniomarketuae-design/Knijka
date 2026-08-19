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
//   snowIntensity — how heavy the SNOW weather is *right now* (doc 72 AC-08
//                   winter grip). Drives a colder fog-like haze, a milder rig
//                   dim, a cold SkyDome wash, the SnowFlakes fall opacity and
//                   the cold ground-bounce whitening (SNOW_GROUND_WHITEN).
//                   Like fog, snow does NOT wet the road (white ground
//                   textures remain asset work).
//
// WHAT THIS STORE DOES NOT CARRY, MEASURED — sweep161, six BROKEN findings.
//
// 1. THE SNOW HAZE IS NOT „LIGHTER THAN THE FOG BANK". That claim stood in
//    this header until it was measured, and the frames refute it. sc-ac-snow,
//    sc-ac-fog, sc-ac-rain-lights and sc-ac-wet-braking all run the SAME map
//    (`ac-rain-v1`, 360 m straight street) under the SAME day preset, so their
//    `pc-right/03-ready.png` frames are a clean A/B. Mean sRGB, identical
//    rectangles:
//
//                        near road (620,500 120x30)   far road (830,395 60x14)
//      sc-ac-snow          72.4/ 84.8/ 97.8  L 82.6     126.5/137.0/151.9 L 135.5
//      sc-ac-fog           75.4/ 86.9/ 99.1  L 84.8     140.7/149.8/162.9 L 148.6
//      sc-ac-rain-lights   83.1/ 84.1/ 82.6  L 83.6     113.8/117.6/124.6 L 117.3
//
//    Snow renders 2.6% DARKER than fog near and 8.8% darker far — the two are
//    within a few percent of each other on every channel, and what difference
//    exists points the WRONG WAY for a snow-covered street. The audit's words
//    for the same frames: „the snow preset appears to fall through to the fog
//    preset", and „the road is bare grey asphalt … not one flake falls".
//    NONE of that is fixable from this file: the store already holds four
//    separate, correctly-ramped channels and hands snow and fog to the same
//    readers. The differentiation lives in `presets.ts`
//    (snowWeather #e8ebef/0.012 vs fogWeather #c9cdd2/0.022 — one is a paler
//    grey at half the density of the other, which IS the 3%), `SkyDome.tsx`
//    (SNOW_SKY_WASH 0.75 vs FOG_SKY_WASH 0.85), `SnowFlakes.tsx` (flake size
//    and count — the mesh mounts and reads getSnowIntensity(), yet no flake is
//    visible in any sweep161 frame) and `StaticWorld.tsx`, whose road material
//    has no snow term at all (see 2).
//
// 2. THERE IS EXACTLY ONE ROAD-SURFACE CHANNEL AND ONLY RAIN WRITES IT.
//    `wetness` → `wetnessToRoadParams` is the only road-material mapping in
//    the codebase (StaticWorld consumes it for asphalt, decals and paint).
//    Snow has no surface term, ice has no channel at all — which is why
//    sc-ac-snow renders clean grey asphalt while it is graded at 40% grip, and
//    why sc-ac-ice and sc-ac-bridge-ice had to author `weather: "dry"` (the
//    vocabulary is {dry|rain|fog|snow}, there is no cold/ice state to author)
//    and therefore render high summer under a briefing that says „зимна
//    сутрин е около нулата". Adding the channel here without a reader would
//    change no pixel; the pair belongs in one wave with StaticWorld.
//
// 3. THIS STORE HOLDS THE LOOK; NOTHING HOLDS THE GRIP, AND THE TWO ARE
//    AUTHORED SEPARATELY. What the student SEES comes from
//    `environment.{rain,fog,snow}` → setWeatherTarget → these channels. What
//    the car DOES comes from `LessonSpec.physics.{wetGrip,snowGrip}` →
//    VehicleRig `gripFactor`, an independent authored field that LessonScene
//    documents as „never derived from environment.rain/snow". Census over the
//    shipped templates: 47 lessons tagged `weather: "rain"`, 15 with
//    `physics: { wetGrip: true }` — so 32 lessons render a soaked road and
//    brake on dry grip; and the ice pair renders a dry summer street and runs
//    ICE_PATCH_GRIP_FACTOR 0.15. The rule engine grades off the PICTURE
//    (`tick.rain/fog/snow` → conditionSpeed*Factor, and
//    FOLLOWING_TOO_CLOSE_FOR_RAIN, whose stated justification is „in rain the
//    braking distance grows ~1.5×" — true only in the 15). Reconciling those
//    two authored fields is a templates/compile change, not a store change,
//    and it must not be done by deriving grip from the weather tag: the
//    shadow traces of those 32 lessons were recorded at dry decel, so flipping
//    them to wet grip would fail students against a ghost they cannot match.

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
/** Snow intensity rise rate (1/s → full snowfall in ~6 s — weather fronts
 *  arrive, they don't switch; slowest of the three channels). */
export const SNOW_IN_PER_SEC = 1 / 6;
/** Snow intensity decay rate (1/s → clears in ~8 s). */
export const SNOW_OUT_PER_SEC = 1 / 8;
/** dt handed to `primeWeather`'s single step: longer than the slowest ramp of
 *  all eight rates (WETNESS_OUT_PER_SEC, 12 s), so every channel lands exactly
 *  on its target rather than partway. */
export const PRIME_DT_SEC = 20;

let wetness = 0;
let wetnessTarget = 0;
let rainIntensity = 0;
let rainTarget = 0;
let fogIntensity = 0;
let fogTarget = 0;
let snowIntensity = 0;
let snowTarget = 0;

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

/**
 * Set the targets from the lesson's rain/fog/snow flags. Called by
 * SimEnvironment.
 *
 * EVERY CHANNEL IS NAMED EXPLICITLY — no defaults. `fog` and `snow` shipped as
 * `fog = false, snow = false` so the callers that predated them stayed
 * byte-identical, and this file's own test canonised that as „the additive
 * API". It is not additive, it is destructive: the store is a module-level
 * singleton with three writers, so `setWeatherTarget(true)` does not mean
 * „start raining", it means „start raining AND stop the snow AND lift the
 * fog". A channel added tomorrow would be silently cleared by every caller
 * written today, which is precisely how a rendered condition disappears from
 * a lesson without anyone getting an error. Required parameters move that to
 * compile time: all three production call sites (SimEnvironment, the
 * clip-capture and scene-still dev routes) already pass three arguments, so
 * this is a no-op at runtime and a guard against the next channel.
 */
export function setWeatherTarget(rain: boolean, fog: boolean, snow: boolean): void {
  wetnessTarget = rain ? 1 : 0;
  rainTarget = rain ? 1 : 0;
  fogTarget = fog ? 1 : 0;
  snowTarget = snow ? 1 : 0;
}

/**
 * Enter a scene ALREADY in its weather — the „settle on frame 1" contract the
 * rig's own lighting damp implements with dt→∞, which this store never had.
 *
 * A lesson's weather is a STANDING CONDITION, not an event: sc-ac-snow is not
 * a clear street where it begins to snow, it is a snowy street. But the
 * channels always start at 0 and ramp (snow takes ~6 s to saturate), and the
 * store is a module singleton that nothing in the LIVE path ever resets — only
 * the two dev routes do. Both consequences are visible:
 *
 *   · the first frame of every weather lesson is a CLEAR-weather frame, and
 *     SkyDome/SimEnvironment snap their damped rig onto that clear goal
 *     (`dt = initialized ? min(delta, 0.1) : 1000`) before easing toward the
 *     ramping one;
 *   · weather LEAKS between lessons — a dry lesson opened after a rain lesson
 *     renders a wet road for ~12 s (WETNESS_OUT_PER_SEC), after a snow lesson
 *     a snow haze for ~8 s.
 *
 * `clip-capture` hit the first one in the founder's round-3 review („rain road
 * too bright, can't tell rain from dry") and answered it by hand-rolling
 * `resetWeather(); setWeatherTarget(…); stepWeather(PRIME_DT)` under a
 * fourteen-line comment; `scene-still` copied the incantation. That sequence
 * is this function, and the reason it exists belongs next to the state it
 * primes rather than in two dev routes.
 *
 * ROUTED OUT, NOT FIXED HERE: the LIVE path still opens clear and still leaks,
 * because the scene boundary is SimEnvironment's mount effect — one line,
 * `primeWeather` instead of `setWeatherTarget`, in a file this lane does not
 * own (`SimEnvironment.tsx:191`).
 */
export function primeWeather(rain: boolean, fog: boolean, snow: boolean): void {
  setWeatherTarget(rain, fog, snow);
  // ONE step, longer than the slowest traverse in the store — `approach`
  // clamps to the target, so any dt past the ramp lands exactly on it. That
  // single step is the whole mechanism: it carries a channel DOWN from a
  // previous scene's value just as exactly as it carries one up, which is why
  // there is no `resetWeather()` here. Both dev routes open with one — and a
  // mutation run proved it dead: removing it changes nothing, because they
  // both step with dt = 1000 straight afterwards. A redundant call that reads
  // like the safety is worse than none, since the next reader trusts it.
  stepWeather(PRIME_DT_SEC);
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
  const prevS = quantize(snowIntensity);
  wetness = clamp01(
    approach(wetness, wetnessTarget, wetness < wetnessTarget ? WETNESS_IN_PER_SEC : WETNESS_OUT_PER_SEC, dtSec),
  );
  rainIntensity = clamp01(
    approach(rainIntensity, rainTarget, rainIntensity < rainTarget ? RAIN_IN_PER_SEC : RAIN_OUT_PER_SEC, dtSec),
  );
  fogIntensity = clamp01(
    approach(fogIntensity, fogTarget, fogIntensity < fogTarget ? FOG_IN_PER_SEC : FOG_OUT_PER_SEC, dtSec),
  );
  snowIntensity = clamp01(
    approach(snowIntensity, snowTarget, snowIntensity < snowTarget ? SNOW_IN_PER_SEC : SNOW_OUT_PER_SEC, dtSec),
  );
  if (
    quantize(wetness) !== prevW ||
    quantize(rainIntensity) !== prevR ||
    quantize(fogIntensity) !== prevF ||
    quantize(snowIntensity) !== prevS
  ) {
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

/** Imperative read of current SNOW intensity 0..1 (per-frame consumers). */
export function getSnowIntensity(): number {
  return snowIntensity;
}

/** Reset to bone-dry and clear. For tests and full sim teardown. */
export function resetWeather(): void {
  wetness = 0;
  wetnessTarget = 0;
  rainIntensity = 0;
  rainTarget = 0;
  fogIntensity = 0;
  fogTarget = 0;
  snowIntensity = 0;
  snowTarget = 0;
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

/** Snow intensity 0..1, quantized to 0.01 (occasional React consumers). */
export function useSnowIntensity(): number {
  return useSyncExternalStore(
    subscribe,
    () => quantize(snowIntensity),
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
