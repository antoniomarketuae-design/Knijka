// Quality presets + "auto" recommendation heuristic.
//
// Pure data & math (no DOM, no three.js) — unit-tested in Node. The client
// store (qualityStore.ts) persists the user's choice and runs the FPS probe
// that feeds `recommendQuality`.

export type QualityLevel = "low" | "med" | "high";
/** What the user picks in settings; "auto" defers to the probe recommendation. */
export type QualitySetting = QualityLevel | "auto";

export interface QualityPreset {
  level: QualityLevel;
  /** Whether the directional light casts a shadow map at all. */
  shadows: boolean;
  /** Shadow map resolution (square). Ignored when `shadows` is false. */
  shadowMapSize: 1024 | 2048;
  /** Half-extent of the camera-following ortho shadow frustum, meters. */
  shadowRadiusM: number;
  /** Instanced rain streak count (0 = rain particles disabled at this level). */
  rainParticles: number;
  /** Whether the postprocessing composer (bloom + vignette) is mounted. */
  postprocessing: boolean;
  /** MSAA samples for the composer's render target (composer bypasses canvas MSAA). */
  composerMultisampling: number;
  /** Recommended Canvas dpr cap — the integrator wires `dpr={[1, maxDpr]}`. */
  maxDpr: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  // Iris-Xe-and-below safety net: no shadow map, no particles, no composer,
  // native-ish resolution. The whole environment is then: 1 sky draw call,
  // 2 lights, exponential fog.
  low: {
    level: "low",
    shadows: false,
    shadowMapSize: 1024,
    shadowRadiusM: 45,
    rainParticles: 0,
    postprocessing: false,
    composerMultisampling: 0,
    maxDpr: 1.0,
  },
  // The Iris Xe 60 fps target. One 1024² shadow map, GPU rain, still no
  // composer — canvas MSAA provides the anti-aliasing for free.
  med: {
    level: "med",
    shadows: true,
    shadowMapSize: 1024,
    shadowRadiusM: 45,
    rainParticles: 800,
    postprocessing: false,
    composerMultisampling: 0,
    maxDpr: 1.25,
  },
  // Discrete-GPU tier: 2048² shadows, denser rain, subtle bloom + vignette
  // (+ ACES inside the composer, since it bypasses renderer tone mapping).
  high: {
    level: "high",
    shadows: true,
    shadowMapSize: 2048,
    shadowRadiusM: 60,
    rainParticles: 1400,
    postprocessing: true,
    composerMultisampling: 4,
    maxDpr: 1.5,
  },
};

/** Minimum probe samples before an fps median is considered trustworthy. */
export const MIN_PROBE_SAMPLES = 30;

/** Frame deltas above this are treated as tab-switch/GC stalls and discarded. */
export const MAX_VALID_DELTA_MS = 250;

/**
 * Robust fps estimate from raw rAF frame deltas (milliseconds).
 * Median, after discarding non-positive and stall deltas. Returns null when
 * nothing valid remains — callers must then not act on the probe.
 */
export function medianFpsFromDeltas(deltasMs: number[]): number | null {
  const valid = deltasMs.filter((d) => d > 0 && d <= MAX_VALID_DELTA_MS).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  const median =
    valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return 1000 / median;
}

const ORDER: QualityLevel[] = ["low", "med", "high"];

function stepUp(level: QualityLevel): QualityLevel {
  return ORDER[Math.min(ORDER.indexOf(level) + 1, ORDER.length - 1)];
}

function stepDown(level: QualityLevel): QualityLevel {
  return ORDER[Math.max(ORDER.indexOf(level) - 1, 0)];
}

/**
 * The "auto" heuristic.
 *
 * - No fps evidence (`fpsMedian` null):
 *   - with a `currentLevel` (probe ran but collected too few frames — hidden
 *     tab etc.): keep the current level, change nothing;
 *   - without one (cold start): guess "med", except ultra-dense screens
 *     (dpr ≥ 3, phone-class panels paying 9× the fill of dpr 1) start "low".
 * - With an fps median measured *at* `currentLevel`:
 *   - ≥ 57 fps: headroom → step up one level (never more than one per probe);
 *   - ≥ 48 fps: holding target → stay;
 *   - ≥ 34 fps: struggling → step down one level;
 *   - below:    step straight to "low".
 */
export function recommendQuality(input: {
  dpr: number;
  fpsMedian: number | null;
  currentLevel?: QualityLevel;
}): QualityLevel {
  const { dpr, fpsMedian, currentLevel } = input;
  if (fpsMedian === null) {
    if (currentLevel) return currentLevel;
    return dpr >= 3 ? "low" : "med";
  }
  const current = currentLevel ?? "med";
  if (fpsMedian >= 57) return stepUp(current);
  if (fpsMedian >= 48) return current;
  if (fpsMedian >= 34) return stepDown(current);
  return "low";
}
