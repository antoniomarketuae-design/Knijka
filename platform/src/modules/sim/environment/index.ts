/**
 * sim/environment — public API of the atmosphere layer.
 *
 * React components (mounted inside the R3F Canvas by the /simulator route):
 *   SimEnvironment      — sky, lighting rig, fog, rain, postprocessing
 *   WindshieldDroplets  — cockpit-only fullscreen droplet overlay
 *
 * Stores/hooks (page-level or cross-module consumers):
 *   quality store       — user setting + auto recommendation + FPS probe
 *   weather channel     — wetness / rain intensity the world & vehicle read
 *
 * Pure data/math (also consumed by tests):
 *   ENVIRONMENT_PRESETS, sunDirection, QUALITY_PRESETS
 *
 * `ledgerFromSample` was listed here until 2026-08-26 and never exported. It
 * is live — `qualityStore.ts` calls it — but its consumer is INSIDE this
 * module, so it is not part of the public surface and a caller reaching for
 * it through the barrel would have found nothing.
 */

export { SimEnvironment, type SimEnvironmentProps } from "./SimEnvironment";
// The AC-12 wind depiction. `SimEnvironment` mounts the layer itself (pass it
// `readWindLateralN`); the force→look mapping and its constants are exported
// because they are the contract the physics is drawn against — doc 05: a helper
// missing from this barrel does not exist, which is how the snow term once sat
// in the tree moving no pixel.
export {
  windDriftLook,
  WIND_DRIFT_REFERENCE_N,
  WIND_DRIFT_SPEED_AT_REFERENCE_MPS,
  WIND_DRIFT_MAX_OPACITY,
  type WindDriftLook,
} from "./windDrift";
export { WindshieldDroplets } from "./WindshieldDroplets";
// The A4 mirror rig shrinks the (scale-invariant) sky dome into its short
// mirror frustum during RTT passes — name lookup only, no component export.
export { SKY_DOME_NAME } from "./SkyDome";

// The two horizon halves, exported INDIVIDUALLY as well as through
// SimEnvironment. The marketing hero (components/marketing/hero) draws a
// minimal dusk scene that must NOT pull the simulator — no rule engine, no
// physics, no traffic, no composer — but must share this project's one sky
// and one horizon, so the landing page and the product cannot drift apart.
// Consumers outside the sim get the pieces, never the rig.
export { SkyDome } from "./SkyDome";
export { GroundBackdrop, GROUND_BACKDROP_NAME } from "./GroundBackdrop";
// …and the grade they were tuned under. Any scene that mounts them outside
// SimEnvironment must apply the same operator or the sky renders in a
// different colour space than the one its presets were authored against.
export { SIM_TONE_MAPPING, TONE_MAPPING_THREE } from "./toneMapping";

export {
  ENVIRONMENT_PRESETS,
  // The SEASON grade (sc-ac-ice / sc-ac-bridge-ice): a pure function over a
  // time-of-day preset, so a winter dusk costs nothing and `TimeOfDay` stays
  // three members wide.
  environmentPreset,
  winterGrade,
  sunDirection,
  RAIN_SUN_DIM,
  RAIN_HEMISPHERE_DIM,
  RAIN_IBL_DIM,
  FOG_SUN_DIM,
  FOG_HEMISPHERE_DIM,
  FOG_TOPDOWN_MAX_OPTICAL,
  SNOW_SUN_DIM,
  SNOW_HEMISPHERE_DIM,
  SNOW_GROUND_WHITEN,
} from "./presets";
// V3's skyline gate: scenes that mount a district derive `skyline` from the
// map's own meta.mapKind instead of guessing (doc 82 §3.2 V3).
export { mapKindHasSkyline, ENCLOSED_MAP_KINDS } from "./skyline";
export { BENCHMARK_CAMERAS } from "./benchmarkCameras";
export type { BenchmarkCameraPose } from "./benchmarkCameras";
export type {
  TimeOfDay,
  SunAngles,
  Vec3Like,
  SkySpec,
  LightRigSpec,
  FogSpec,
  EnvironmentPreset,
} from "./presets";

export {
  QUALITY_PRESETS,
  seedQualityFromSignals,
  unknownDeviceSignals,
  medianFpsFromDeltas,
  MIN_PROBE_SAMPLES,
  maxDprFor,
  TOUCH_MAX_DPR,
  TOUCH_MED_MAX_DPR,
  TOUCH_HIGH_MAX_DPR,
} from "./quality";
export type {
  QualityLevel,
  QualitySetting,
  QualityPreset,
  FacadeMapsMode,
  DeviceSignals,
} from "./quality";

export {
  effectiveQuality,
  getQualityState,
  setQualitySetting,
  setQualityRecommendation,
  subscribeQuality,
  useQuality,
  useAutoQualityProbe,
  readDeviceSignals,
  seedQualityLevel,
  refreshSeededQuality,
  canvasMaxDpr,
  isQualityProbeWindowVoid,
  resetQualityProbeForTests,
} from "./qualityStore";
export type { QualityState } from "./qualityStore";

// Perf envelope (doc 82 §2.2 / §6.2 P1): the budget table, the in-canvas
// probe that measures against it, and the WebGL context-loss guard.
export { PERF_BUDGETS, buildPerfReport, formatPerfReportMarkdown } from "./perfBudget";
export type {
  PerfBudget,
  PerfMetricVerdict,
  PerfReport,
  PerfRunInput,
  PerfWindowSample,
} from "./perfBudget";
// The FRAME, as opposed to the static world. `world.stats.staticDrawSlots`
// answers a different question and cannot be scored against a draw budget —
// `scoreFrameDrawBudget` takes a nominal `MeasuredFrame` for that reason, and
// `measuredFrame()` refuses anything without measurement provenance.
export {
  COCKPIT_DRAWS,
  DEFAULT_TRAFFIC_MESHES,
  LEVEL1_AID_DRAWS,
  MEASURED_FRAMES,
  NotAMeasurementError,
  frameCostTerms,
  frameDrawCeiling,
  measuredFrame,
  scoreFrameDrawBudget,
} from "./frameCost";
export type { FrameCostInput, FrameCostTerm, FrameProvenance, MeasuredFrame } from "./frameCost";
export { PerfProbe } from "./PerfProbe";
export { GlContextGuard } from "./GlContextGuard";
export { getContextLossLog, recordContextLoss, resetContextLossLog } from "./contextLoss";
export type { ContextLossEvent } from "./contextLoss";

export {
  useWetness,
  useRainIntensity,
  // No `useFogIntensity`: fog is read per frame by `SkyDome` through
  // `getFogIntensity` below, deliberately outside React. The hook was removed
  // 2026-08-26 — see the block in `weather.ts` where it stood.
  useSnowIntensity,
  getWetness,
  getRainIntensity,
  getFogIntensity,
  getSnowIntensity,
  wetnessToRoadParams,
  // The road mapping that bears SNOW as well as rain. `wetnessToRoadParams` is
  // now its `snow: 0` case, so every dry and rain scene is bit-identical — but
  // a helper missing from this barrel does not exist under doc 05, and that is
  // precisely how the snow term sat in the tree for a day moving no pixel while
  // sc-ac-snow rendered clean grey asphalt at 40% grip.
  roadSurfaceToParams,
  resetWeather,
  setWeatherTarget,
  // The scene-boundary primer. It was added for the two dev capture routes and
  // then left out of this barrel, so neither could reach it: doc 05 says
  // modules talk only through `index.ts`, and CaptureScene/SceneStillScene both
  // import from here. A helper the boundary rule makes unreachable is a helper
  // that does not exist.
  primeWeather,
  stepWeather,
} from "./weather";
export type { RoadWetnessParams, RoadSurfaceState } from "./weather";
