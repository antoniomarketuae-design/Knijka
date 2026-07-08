// Quality presets + "auto" recommendation heuristic.
//
// Pure data & math (no DOM, no three.js) — unit-tested in Node. The client
// store (qualityStore.ts) persists the user's choice and runs the FPS probe
// that feeds `recommendQuality`.

export type QualityLevel = "low" | "med" | "high";
/** What the user picks in settings; "auto" defers to the probe recommendation. */
export type QualitySetting = QualityLevel | "auto";

/** N8AO sample budget. Maps to N8AO's `quality` prop (setQualityMode):
 *  performance = 8 AO / 4 denoise samples; low = 16 / 4; medium = 16 / 8. */
export type AoQuality = "performance" | "low" | "medium";

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
  /**
   * Whether the EffectComposer is mounted at all. When true it owns the final
   * image: N8AO + SMAA + ACES ToneMapping (+ bloom/color-grade at high). When
   * false the renderer draws directly with its own ACES and canvas MSAA.
   */
  postprocessing: boolean;
  /**
   * Screen-space ambient occlusion (N8AO) in the composer — the primary fix
   * for the "flat" look (grounds objects with contact darkening). Requires
   * `postprocessing`.
   */
  aoEnabled: boolean;
  /**
   * Render AO at half resolution (≈1 ms) instead of full-res (≈3–4 ms). Keep
   * true on integrated GPUs; N8AO depth-aware-upsamples it back cleanly.
   */
  aoHalfRes: boolean;
  /** N8AO sample budget for this level (see AoQuality). */
  aoQuality: AoQuality;
  /**
   * Subtle HDR bloom on the sun disc / bright speculars. High only (too costly
   * and prone to a "blobby" look at med). Requires `postprocessing`.
   */
  bloom: boolean;
  /**
   * Subtle finishing grade (vignette + a touch of saturation). High only.
   * Requires `postprocessing`.
   */
  colorGrade: boolean;
  /** Recommended Canvas dpr cap — the integrator wires `dpr={[1, maxDpr]}`. */
  maxDpr: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  // Iris-Xe-and-below safety net: no shadow map, no particles, no composer,
  // native-ish resolution. The whole environment is then: 1 sky draw call,
  // 2 lights, exponential fog. Canvas MSAA (Canvas `antialias`) does the AA
  // here — this is the only level that relies on it, since the other two run
  // a composer and antialias with SMAA instead.
  low: {
    level: "low",
    shadows: false,
    shadowMapSize: 1024,
    shadowRadiusM: 45,
    rainParticles: 0,
    postprocessing: false,
    aoEnabled: false,
    aoHalfRes: true,
    aoQuality: "performance",
    bloom: false,
    colorGrade: false,
    maxDpr: 1.0,
  },
  // The Iris Xe 60 fps target. One 1024² shadow map, GPU rain, and now a lean
  // composer: half-res N8AO (the big "flatness" fix) + SMAA + ACES tone map.
  // No bloom/grade — those are the parts that cost the most and read "blobby"
  // on a weak GPU. Half-res AO is ≈1 ms; SMAA ≈0.3 ms.
  med: {
    level: "med",
    shadows: true,
    shadowMapSize: 1024,
    shadowRadiusM: 45,
    rainParticles: 800,
    postprocessing: true,
    aoEnabled: true,
    aoHalfRes: true,
    aoQuality: "performance",
    bloom: false,
    colorGrade: false,
    maxDpr: 1.25,
  },
  // Discrete-GPU tier: 2048² shadows, denser rain, and the full composer —
  // half-res N8AO (more samples than med) + subtle bloom + a light vignette/
  // saturation grade + SMAA + ACES tone map. Still half-res AO to stay safe.
  high: {
    level: "high",
    shadows: true,
    shadowMapSize: 2048,
    shadowRadiusM: 60,
    rainParticles: 1400,
    postprocessing: true,
    aoEnabled: true,
    aoHalfRes: true,
    aoQuality: "low",
    bloom: true,
    colorGrade: true,
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
