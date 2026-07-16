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
  FOG_SUN_DIM,
  FOG_HEMISPHERE_DIM,
  FOG_TOPDOWN_MAX_OPTICAL,
} from "./presets";
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
  medianFpsFromDeltas,
  MIN_PROBE_SAMPLES,
} from "./quality";
export type { QualityLevel, QualitySetting, QualityPreset, FacadeMapsMode } from "./quality";

export {
  effectiveQuality,
  getQualityState,
  setQualitySetting,
  setQualityRecommendation,
  subscribeQuality,
  useQuality,
  useAutoQualityProbe,
} from "./qualityStore";
export type { QualityState } from "./qualityStore";

export {
  useWetness,
  useRainIntensity,
  useFogIntensity,
  getWetness,
  getRainIntensity,
  getFogIntensity,
  wetnessToRoadParams,
  resetWeather,
} from "./weather";
export type { RoadWetnessParams } from "./weather";
