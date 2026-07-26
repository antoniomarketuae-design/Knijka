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
 *   ENVIRONMENT_PRESETS, sunDirection, QUALITY_PRESETS, recommendQuality
 */

export { SimEnvironment, type SimEnvironmentProps } from "./SimEnvironment";
export { WindshieldDroplets } from "./WindshieldDroplets";
// The A4 mirror rig shrinks the (scale-invariant) sky dome into its short
// mirror frustum during RTT passes — name lookup only, no component export.
export { SKY_DOME_NAME } from "./SkyDome";

export {
  ENVIRONMENT_PRESETS,
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
  recommendQuality,
  seedQualityFromSignals,
  unknownDeviceSignals,
  medianFpsFromDeltas,
  MIN_PROBE_SAMPLES,
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
export { PerfProbe } from "./PerfProbe";
export { GlContextGuard } from "./GlContextGuard";
export { getContextLossLog, recordContextLoss, resetContextLossLog } from "./contextLoss";
export type { ContextLossEvent } from "./contextLoss";

export {
  useWetness,
  useRainIntensity,
  useFogIntensity,
  useSnowIntensity,
  getWetness,
  getRainIntensity,
  getFogIntensity,
  getSnowIntensity,
  wetnessToRoadParams,
  resetWeather,
  setWeatherTarget,
  stepWeather,
} from "./weather";
export type { RoadWetnessParams } from "./weather";
