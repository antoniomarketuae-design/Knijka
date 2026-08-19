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
//    Confirmed by eye on the two `pc-right/03-ready.png` frames side by side:
//    sky, haze, asphalt and light are indistinguishable, and no flake appears
//    in either.
//
//    THE HAZE HALF IS NOT FIXABLE FROM THIS FILE — the store already holds
//    four separate, correctly-ramped channels and hands snow and fog to the
//    same readers, saturated at 1 in both lessons. The differentiation lives
//    in `presets.ts` — DAY, the preset those frames were shot under:
//    snowWeather #e8ebef/0.012 against fogWeather #c9cdd2/0.020, a paler grey
//    at 0.6× the density, and the same ratio at dusk (0.013/0.022) and night
//    (0.015/0.024). Re-measured 2026-08-19: this note used to cite „0.022 …
//    HALF", which paired the DAY snow density against the DUSK fog one — a
//    stated measurement that did not reproduce, in a file whose whole
//    discipline is that its numbers do. Less haze reveals more dark asphalt,
//    which is the whole of the 3% and its wrong sign. Also
//    `SimEnvironment.tsx` (the `scratch.fogGoal` blend, the
//    `fogObj.density` damp and the SNOW_*_DIM / FOG_*_DIM constants) and
//    `SkyDome.tsx` (SNOW_SKY_WASH 0.75 vs FOG_SKY_WASH 0.85).
//
//    THE FLAKE HALF is `SnowFlakes.tsx`: the mesh mounts (SimEnvironment,
//    gated on `snowVisible && qp.snowParticles > 0`) and reads
//    getSnowIntensity() — which
//    this store saturates at 1 — so the missing flakes are geometry, not
//    signal. FLAKE_SIZE is 0.028 m in a box of AREA_HALF 20 m; a 2.8 cm quad
//    at cockpit distance is sub-pixel. Note the arrival frames had a second,
//    separate cause that IS now gone: before the scene-boundary primer the
//    snow channel started at 0 and took ~6 s to saturate, so `01-arrival` and
//    `03-ready` were always clear-weather frames whatever SnowFlakes did.
//
//    THE ROAD HALF is this file, and is fixed below — see 2.
//
// 2. THE ROAD-SURFACE MAPPING NOW BEARS SNOW; ITS READER DOES NOT PASS IT YET.
//    `wetnessToRoadParams` is the only road-material mapping in the codebase
//    (StaticWorld consumes it for asphalt, decals and paint) and its only
//    input was RAIN wetness, so no amount of snow could move the road by one
//    shade — sc-ac-snow renders clean grey asphalt while it is graded at 40%
//    grip. `roadSurfaceToParams` (below) is that mapping with the snow term
//    it was missing, and `wetnessToRoadParams` is now its `snow: 0` case, so
//    every dry and rain scene is bit-identical.
//
//    IT CHANGES NO PIXEL UNTIL ITS READER PASSES THE VALUE, and that reader is
//    not this lane's file. So this finding is NOT closed — and the state in
//    between is the dangerous one, because it reads like a fix. Measured
//    2026-08-19: `index.ts` exports `wetnessToRoadParams` and the type
//    `RoadWetnessParams`, and NOT `roadSurfaceToParams`; `StaticWorld.tsx`
//    imports `{ useWetness, wetnessToRoadParams }` and calls the rain-only
//    mapping at :279, :294 and :313. By §4's own rule that is a DEAD API —
//    no author reaches it, no reader calls it — and by doc 05 it does not
//    exist at all.
//
//    THE ASSERTION THAT EXISTED TO CATCH EXACTLY THIS WAS DELETED BY THE
//    CHANGE THAT CAUSED IT. The old test „carries no snow/ice term" carried
//    the docblock „a snow term added here must arrive together with its
//    StaticWorld reader, or this assertion is the thing that goes red". Its
//    body never implemented that promise (it compared f(0) with f(0) and
//    could not go red for any implementation), and the lane that shipped the
//    snow term removed it and replaced it with an assertion that the road
//    rendered under full snow EQUALS the dry road — the defect asserted as
//    correct. The test file now carries the guard that promise describes,
//    over the two files below; it is RED until both land, on purpose.
//
//    Both halves of the routing, exactly:
//      · `environment/index.ts` — add `roadSurfaceToParams` (and the type
//        `RoadSurfaceState`) to the barrel beside `wetnessToRoadParams`. Doc
//        05: StaticWorld imports from `@/modules/sim/environment`, so a
//        helper left out of the barrel does not exist. `useSnowIntensity` is
//        ALREADY exported — nothing else is needed.
//      · `world/components/StaticWorld.tsx:277-313` — take
//        `const snow = useSnowIntensity();` beside the existing
//        `const wetness = useWetness();`, add `snow` to the three `useMemo`
//        dep arrays, and pass `{ wet: wetness, snow }` on the ROAD (:279) and
//        DECAL (:294) calls. Leave the PAINT call (:313) on
//        `wetnessToRoadParams` or pass `snowBrighten: 1`: brightening the
//        markings buries them in the road, and the rule engine grades lane
//        keeping and stop lines off exactly those markings.
//
// 2b. ICE STILL HAS NO CHANNEL, AND MUST NOT GET A ROAD-MATERIAL ONE.
//    sc-ac-ice and sc-ac-bridge-ice author `weather: "dry"` (the vocabulary is
//    {dry|rain|fog|snow}, there is no cold state to author) and render high
//    summer under a briefing that says „зимна сутрин е около нулата" — full
//    green trees, blue sky, warm facades, verified by eye on
//    `sc-ac-bridge-ice/mobile-right/04-t076s.png` and
//    `sc-ac-ice/pc-right/03-ready.png`. The fix is NOT to make the ice
//    visible: black ice is invisible, and that is the lesson those two teach.
//    What is missing is the SEASON, and none of it lives here — a `cold`/
//    `winter` flag on `LessonSpec.environment` (contracts.ts) + compile.ts,
//    a winter grade in `presets.ts` (low cold sun, no warm facade bounce),
//    and bare trees / grey verges in the world module. Routed, not fixed.
//
// 3. THIS STORE HOLDS THE LOOK; NOTHING HOLDS THE GRIP, AND THE TWO ARE
//    AUTHORED SEPARATELY. What the student SEES comes from
//    `environment.{rain,fog,snow}` → setWeatherTarget → these channels. What
//    the car DOES comes from `LessonSpec.physics.{wetGrip,snowGrip}` →
//    VehicleRig `gripFactor`, an independent authored field that LessonScene
//    documents as „never derived from environment.rain/snow". Census
//    RE-MEASURED 2026-08-19 over `lessons/scenario/templates-*.ts` with
//    comments stripped, because the „47 / 15" this note used to give did not
//    reproduce and called its unit „lessons": 45 authorings of
//    `weather: "rain"` against 14 of `physics: { wetGrip: true }` — so ~31
//    render a soaked road and brake on dry grip. The unit is TEMPLATE
//    AUTHORINGS, not lessons: each expands to variants, so the per-lesson
//    figure is larger and only the compiled corpus can give it; the gap is
//    the point, not its third digit. And the ice pair renders a dry summer
//    street and runs ICE_PATCH_GRIP_FACTOR 0.15. The rule engine grades off
//    the PICTURE (`tick.rain/fog/snow` → conditionSpeed*Factor, and
//    FOLLOWING_TOO_CLOSE_FOR_RAIN, whose stated justification is „in rain the
//    braking distance grows ~1.5×" — true only in the 14). Reconciling those
//    two authored fields is a templates/compile change, not a store change,
//    and it must not be done by deriving grip from the weather tag: the
//    shadow traces of the render-only-rain lessons were recorded at dry
//    decel, so flipping them to wet grip would fail students against a ghost
//    they cannot match.
//
// 3b. TWO CORRECTIONS TO 3, BOTH READ OUT OF THE CODE RATHER THAN INFERRED.
//    · SEEN AND GRADED DO COME FROM ONE SOURCE. `lesson.environment.{rain,
//      fog,snow}` feeds BOTH this store (LessonScene's `<SimEnvironment rain
//      fog snow>` props → setWeatherTarget) AND the tick the engine grades on
//      (LessonScene's `runtime.sample(sample, t, isNight, rain, …, fog, snow)`
//      → `tick.rain/fog/snow` → engine.ts `const raining = tick.rain === true`,
//      the conditionSpeed*Factor site). One authored field, two
//      consumers. The single place they COULD disagree was this store's own
//      state, because it is a module singleton that ramps from 0 and outlives
//      a scene: the engine's flag is true on frame 1 while the picture took
//      4-6 s to arrive, and a dry lesson opened after a rain one was graded
//      dry over a wet road for 12 s. That is what `primeWeather` closes.
//    · THE 32 RENDER-ONLY-RAIN LESSONS ARE NOT SILENT. compile.ts'
//      LADDER_COPY_ORDER carries a distinct rung for each case — „Мокър паваж"
//      when rain AND wetGrip are both authored („настилката държи около 70%…"),
//      and „В дъжд" when only the rain is („включи чистачките…", no grip
//      claim). The student is told which one they are in. The genuinely
//      unnarrated direction is the MIRROR: grip WITHOUT a picture. The ladder
//      has a rung for that too („Настилката вече е истинска"), but it fires on
//      `physics.wetGrip/snowGrip`, and the ice pair's 0.15 arrives as
//      `built.gripPatches` from the DISTRICT's zone spans instead — so nothing
//      tells the student the road changed, and nothing in the picture shows
//      it. A car that slides on what looks like dry summer asphalt convicts
//      the student of a mistake the scene never let them see coming. That is
//      the founder's own false-failure complaint, and it is the sharpest
//      unclosed thing behind sc-ac-ice / sc-ac-bridge-ice. Routed:
//      compile.ts (a gripPatches rung) + the season work in 2b.
//
// 4. TWO FINDINGS ROUTED HERE HAVE NO CHANNEL IN THIS STORE AT ALL, AND ONE
//    MUST NOT BE GIVEN ONE.
//    · sc-ac-crosswind („the wheel shows no counter-steer at any point, there
//      is no wind force visible in the car's attitude"). Wind is real in the
//      physics — LessonScene passes VehicleRig's `windLateralN` /
//      `windGustAmplitudeN` / `windGustPeriodSec` from `physics.crosswind` — and
//      is rendered by nothing. A wind channel HERE would be a fifth 0..1
//      number with no author (nothing writes `environment.wind`) and no
//      reader, i.e. exactly the dead API this lane is meant not to add. The
//      lesson needs the disturbance made VISIBLE where it already exists:
//      steering-wheel counter-rotation and body attitude in VehicleRig /
//      the cockpit rig, and only then a weather channel if the sky is
//      supposed to show it too.
//    · sc-ac-truck-spray („the water curtain the lesson is named after never
//      exists"). Spray is emitted BY an NPC and occludes the air behind that
//      one vehicle — it is not a scene-wide 0..1 like fog, and putting it in
//      this store would make every driver in the lesson spray. Routed to the
//      NPC/effects layer; the only correct claim on this store is that spray
//      should ride the rain channel's intensity, not replace it.

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

/**
 * EVERY ramp rate in this store, by name. `primeWeather`'s single step has to
 * outrun the slowest of them, and the old spelling of that was a hand-written
 * `PRIME_DT_SEC = 20` under a comment naming WETNESS_OUT_PER_SEC as the
 * slowest — true when it was written, and silently false the moment anyone
 * adds a slower channel. A number derived from the rates cannot go stale, and
 * the test reflects over this module's exports to prove no rate escaped the
 * registry (a rate added and not listed here fails that check, rather than
 * quietly leaving primed scenes partway through their ramp).
 */
export const WEATHER_RATES = {
  WETNESS_IN_PER_SEC,
  WETNESS_OUT_PER_SEC,
  RAIN_IN_PER_SEC,
  RAIN_OUT_PER_SEC,
  FOG_IN_PER_SEC,
  FOG_OUT_PER_SEC,
  SNOW_IN_PER_SEC,
  SNOW_OUT_PER_SEC,
} as const;

/** Seconds the slowest channel needs to cross its full 0..1 range. */
export const SLOWEST_TRAVERSE_SEC = Math.max(
  ...Object.values(WEATHER_RATES).map((rate) => 1 / rate),
);

/**
 * dt handed to `primeWeather`'s single step. Derived, with a ×2 margin, so
 * that the priming contract survives the next channel.
 *
 * The margin is NOT decoration: `approach` clamps at the target, so exactly
 * one traverse looks sufficient — but `(1 / 12) * 12 === 0.9999999999999999`,
 * so a step of exactly 12 s leaves wetness at ~1.1e-16 instead of 0. That
 * residue quantizes to 0 (the React hooks would never see it) while
 * `getWetness()` — what the per-frame road material actually reads — returns
 * a non-zero. A primed dry scene would render imperceptibly damp forever.
 */
export const PRIME_DT_SEC = 2 * SLOWEST_TRAVERSE_SEC;

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

/** `a` at t=0, `b` at t=1. At t=0 this returns `a` EXACTLY (`a + 0`), which is
 *  what makes the snow term below provably free for every dry and rain
 *  scene — see the byte-identity test. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
 * THE LIVE PATH NOW USES IT — 2026-08-19, and the route was traced end to end
 * rather than assumed, because the debt note this replaces was read past twice.
 * `SimEnvironment` primes on its FIRST effect run and ramps on every later
 * `[rain, fog, snow]` change: a mid-drive weather change is a transition the
 * student should watch happen, only the scene boundary is a cut.
 *
 * That boundary is real, which was the open question. `LessonScene` mounts
 * `<SimEnvironment>` with no key of its own, but `LessonPlayShell` renders
 * `<SceneSlot key={sceneEpoch}>` and its owner keys the SHELL on the lesson id.
 * So a different lesson remounts the whole subtree, and «Повтори» bumps
 * `sceneEpoch` to remount it again — the prime fires on both, which is exactly
 * the pair of moments a previous scene's rain could otherwise ramp into.
 *
 * `environment/index.ts` exports this too. It did not until the same day, and
 * doc 05's module boundary meant the two dev capture routes that exist to use
 * it could not reach it: a helper the boundary rule hides is a helper that does
 * not exist.
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
  /**
   * Multiply the road's base color by this. Wet asphalt darkens (< 1); snow
   * lying on it BRIGHTENS it (> 1) — the one channel in this pair that can
   * point either way, and the reason a snow-covered street stopped having to
   * render as bare grey.
   */
  darken: number;
}

/**
 * What is lying ON the road right now. Two independent 0..1 components,
 * because they are two different materials with opposite optics: water
 * darkens and glosses, snow brightens and mattes.
 */
export interface RoadSurfaceState {
  /** Rain water on the road — the store's `wetness` channel (`getWetness`). */
  wet: number;
  /** Snow on the road — the store's `snowIntensity` channel
   *  (`getSnowIntensity` / `useSnowIntensity`, both already exported from the
   *  module barrel). */
  snow: number;
}

/**
 * How much a fully snow-covered road brightens its own albedo.
 *
 * THIS IS THE ONE NUMBER IN THIS FILE NO TEST CAN VALIDATE — it is REASONED,
 * not measured, and R0 says look before shipping. The reasoning and the R0
 * recipe, so the check is cheap:
 *
 *  · Bounded BELOW by 1: the audit measured sc-ac-snow's road at mean sRGB
 *    L 82.6 near / 135.5 far against sc-ac-fog's L 84.8 / 148.6 on the same
 *    map under the same preset — snow rendering 2.6% and 8.8% DARKER than
 *    fog. Anything ≤ 1 keeps that wrong way round.
 *  · Bounded ABOVE by the lane markings. StaticWorld tints the road
 *    `darken × ROAD_ALBEDO_TINT (0.72) × asphaltMapTexel` and paints the
 *    markings at #e9e7df × 1.0 ≈ 0.91. Snow that buried them would be
 *    photographically truer and pedagogically a trap: the rule engine grades
 *    lane keeping and stop lines off those markings, so a picture that
 *    removes them fails students on a skill it just took away. This is a
 *    DUSTED road, deliberately, not a buried one.
 *
 *    EVERY NUMBER PAST THIS POINT DEPENDS ON `asphaltMapTexel`, AND NOTHING
 *    HERE CAN READ IT — the asphalt is a photo loaded at runtime. Worked
 *    through 2026-08-19 so the R0 look knows what it is checking: the road
 *    reaches the paint at `1.8 × 0.72 × t ≥ 0.91`, i.e. `t ≥ 0.70`, and it
 *    reaches the composer's bloom threshold (0.9, med/high) at the same `t`.
 *    A mid-grey map (t ≈ 0.45) lands the snowed road at ≈ 0.58 — clearly
 *    below the paint, no bloom, and about two fifths of the way from the dry
 *    road to the markings. This note used to assert „roughly two thirds" and
 *    „below the bloom threshold" as if computed; they hold for a brighter map
 *    (t ≈ 0.55) and not for a darker one, which is exactly why the R0 look is
 *    the check and this arithmetic is only the thing it is looking for.
 *    Neither the round-2 wet retune's white-sheet failure nor this one can be
 *    ruled out from a unit test (StaticWorld's R5 comment).
 *
 * R0: `/dev/scene-still` on a `weather: "snow"` lesson, beside the same map
 * dry — the road must read paler than the concrete pavement, and the lane
 * markings must still be the brightest thing in the carriageway.
 */
export const SNOW_ROAD_BRIGHTEN = 1.8;

/**
 * Map what is lying on the road to standard-material params for road surfaces.
 * Dry: rough matte asphalt. Wet: darker + glossy so the sky/streetlights smear
 * into reflections. Snow: brighter and back to matte. Pure — unit-tested.
 *
 * WHY THIS EXISTS (sweep161, sc-ac-snow part A, critical: „the road is bare
 * grey asphalt with clean white lane markings … the student is being taught
 * winter grip on a picture of a dry summer street"). This is the ONLY
 * road-material mapping in the codebase — StaticWorld drives asphalt, decals
 * and paint through it — and until now its only input was RAIN wetness, so no
 * amount of snow could move the road by one shade. The previous lane read
 * that correctly and then concluded the fix was world-module asset work
 * („white ground cover … snow textures / meshes on the road", SnowFlakes.tsx
 * header). It is not: the albedo multiply the wet road already rides is
 * enough, costs no texture, no plane above the road and no z-fighting with
 * the raised markings — which is precisely why that plane was rejected.
 *
 * ORDERING: water first, then snow ON TOP of it. Snow is the last thing to
 * land on the surface, so it wins — the same „the denser bank wins" discipline
 * SimEnvironment uses when it blends the rain haze, then snow, then fog.
 *
 * NO ICE TERM, AND THAT IS THE POINT. sc-ac-ice and sc-ac-bridge-ice are also
 * routed to this file, and the tempting read of them is „the road should look
 * icy". It must not. Black ice is invisible — that is the whole lesson
 * (bridge-ice briefing item 2: „Прочети знака А15 … той не е украса", item 3:
 * „откритите участъци замръзват първи"). A road material that revealed ice
 * would teach a seventeen-year-old that they can see it, which is a false
 * certificate for a skill nobody has. What those two lessons are missing is
 * the SEASON — see the header note, routed out.
 */
export function roadSurfaceToParams(
  surface: RoadSurfaceState,
  opts?: {
    dryRoughness?: number;
    wetRoughness?: number;
    wetDarken?: number;
    snowRoughness?: number;
    snowBrighten?: number;
  },
): RoadWetnessParams {
  const dryRoughness = opts?.dryRoughness ?? 0.92;
  const wetRoughness = opts?.wetRoughness ?? 0.42;
  const wetDarken = opts?.wetDarken ?? 0.62;
  // Snow does not gloss the road, it UN-glosses it: fresh snow is the mattest
  // surface a street ever has. Defaulting to the caller's own dryRoughness
  // means a snowed-over wet road returns to the roughness that caller
  // authored for dry, rather than to a number invented in this file — and it
  // is the reason each of StaticWorld's three call sites (road 1.0, decals
  // 0.95, paint 0.85) keeps its own character under snow.
  const snowRoughness = opts?.snowRoughness ?? dryRoughness;
  const snowBrighten = opts?.snowBrighten ?? SNOW_ROAD_BRIGHTEN;
  const w = clamp01(surface.wet);
  const s = clamp01(surface.snow);
  return {
    roughness: lerp(lerp(dryRoughness, wetRoughness, w), snowRoughness, s),
    darken: lerp(lerp(1, wetDarken, w), snowBrighten, s),
  };
}

/**
 * The rain-only case of `roadSurfaceToParams`, kept because it is the shipped
 * signature: StaticWorld's three call sites and the module barrel both spell
 * it this way, and at `snow: 0` the lerp above returns its first argument
 * EXACTLY (`a + (b - a) * 0`), so every dry and every rain scene is
 * bit-identical to before the snow term existed. That identity is pinned by
 * test, over the three shipped opts bags, rather than asserted here.
 */
export function wetnessToRoadParams(
  w: number,
  opts?: { dryRoughness?: number; wetRoughness?: number; wetDarken?: number },
): RoadWetnessParams {
  return roadSurfaceToParams({ wet: w, snow: 0 }, opts);
}
