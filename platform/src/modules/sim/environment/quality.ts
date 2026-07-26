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

/**
 * How many facade texture maps each fragment samples on the 16 kit towers +
 * 238 mid-rise prisms — the dominant post-facade fragment cost (commit e3f81b7
 * bound color+normal+ORM(ao/rough/metal)+emissive on every building material).
 * The three levels are a per-fragment-fetch budget, wired at the material sites
 * (CityBuildings / StaticWorld):
 *   full        — color + normal + ORM(ao/rough/metal) + emissive (5 textures,
 *                 6 fetches: ORM feeds 3 slots). The high look, unchanged.
 *   colorNormal — color + normal + emissive; DROP the ORM (constant
 *                 roughness/metalness). 3 fetches — halves the facade fragment
 *                 cost while keeping surface relief.
 *   colorOnly   — color + emissive only; no normal, no ORM. 2 fetches — the
 *                 cheapest facade path for phone-class GPUs.
 */
export type FacadeMapsMode = "full" | "colorNormal" | "colorOnly";

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
  /** Instanced snowflake count (0 = snowfall disabled at this level). Same
   *  GPU design as rain (static seeds, one draw call) so it shares the rain
   *  budget tier-for-tier. */
  snowParticles: number;
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
   * Tight HDR bloom on the sun disc / bright speculars / emissive lights
   * (headlights, brake lights, signals, streetlights, cluster glow). On at
   * med + high — mipmapBlur keeps it cheap and the high luminance threshold
   * keeps it from reading "blobby" on a weak GPU. Requires `postprocessing`.
   */
  bloom: boolean;
  /**
   * Finishing grade (saturation + contrast + vignette) countering tone-map
   * flattening. Med + high — pmndrs merges consecutive effects into the one
   * fullscreen pass SMAA/ToneMapping already occupy, so it is ~free even on
   * Iris Xe (doc 71 §4.3). Requires `postprocessing`.
   */
  colorGrade: boolean;
  /** Recommended Canvas dpr cap — the integrator wires `dpr={[1, maxDpr]}`. */
  maxDpr: number;
  /**
   * Per-fragment facade texture budget for the towers + prisms (see
   * FacadeMapsMode). high = "full" (identical to the pre-tier look); med =
   * "colorNormal" (drops the ORM); low = "colorOnly" (drops normal + ORM).
   */
  facadeMaps: FacadeMapsMode;
  /**
   * Real automotive clearcoat (MeshPhysicalMaterial) on the HERO paint — the
   * player car (HeroCarBody) + the rare premium boxy SUV (vehicleFleet). false
   * → glossy MeshStandard (metalness ~0.7 + high envMapIntensity), ~½ the
   * fragment cost of the extra clearcoat lobe. On (true) only at high.
   */
  clearcoat: boolean;
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
    snowParticles: 0,
    postprocessing: false,
    aoEnabled: false,
    aoHalfRes: true,
    aoQuality: "performance",
    bloom: false,
    colorGrade: false,
    maxDpr: 1.0,
    // Cheapest facade path: albedo + lit-window emissive only (2 fetches). No
    // normal (relief goes flat) and no ORM (constant matte roughness) — the
    // phone-class fragment budget. Hero clearcoat off (glossy MeshStandard).
    facadeMaps: "colorOnly",
    clearcoat: false,
  },
  // The Iris Xe 60 fps target. One 1024² shadow map, GPU rain, and a lean
  // composer: half-res N8AO (the big "flatness" fix) + tight mipmap bloom
  // (the single cheapest "looks expensive" lever — lights/sun/speculars glow)
  // + grade + SMAA + tone map (grade/SMAA/tone-map merge into one pass, so
  // med students get the anti-"washed-out" grade too — doc 71 Phase 1).
  // Half-res AO is ≈1 ms; mipmap bloom ≈0.5 ms; the merged final pass ≈0.3 ms.
  // shadowRadiusM 55: the 22° golden sun throws ~2.5× longer shadows than the
  // old noon rig (texel 10.7 cm — still fine with texel snapping).
  med: {
    level: "med",
    shadows: true,
    shadowMapSize: 1024,
    shadowRadiusM: 55,
    rainParticles: 800,
    snowParticles: 800,
    postprocessing: true,
    aoEnabled: true,
    aoHalfRes: true,
    aoQuality: "performance",
    bloom: true,
    colorGrade: true,
    maxDpr: 1.25,
    // Keep the recess normals (relief is the "reads as a building" cue) but
    // drop the ORM (ao/rough/metal) → constant roughness/metalness. 3 fetches
    // vs high's 6 — halves the facade fragment cost, the Iris-Xe FPS fix. Hero
    // clearcoat off: the player/SUV paint runs glossy MeshStandard here.
    facadeMaps: "colorNormal",
    clearcoat: false,
  },
  // Discrete-GPU tier: 2048² shadows (75 m radius for the long golden-hour
  // throws), denser rain, and the full composer — half-res N8AO (more samples
  // than med) + subtle bloom + grade + SMAA + tone map. Still half-res AO to
  // stay safe.
  high: {
    level: "high",
    shadows: true,
    shadowMapSize: 2048,
    shadowRadiusM: 75,
    rainParticles: 1400,
    snowParticles: 1400,
    postprocessing: true,
    aoEnabled: true,
    aoHalfRes: true,
    aoQuality: "low",
    bloom: true,
    colorGrade: true,
    maxDpr: 1.5,
    // The full authored look — every facade map sampled, real automotive
    // clearcoat on the hero paint. Identical to the pre-tier (regression)
    // build; the discrete-GPU tier pays for it.
    facadeMaps: "full",
    clearcoat: true,
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

// ---------------------------------------------------------------------------
// Cold-start device seeding (doc 82 §2.3 fix 2)
// ---------------------------------------------------------------------------

/**
 * The device facts a cold start can read SYNCHRONOUSLY, before a single byte
 * of the simulator is requested. Collected by the DOM side
 * (qualityStore.readDeviceSignals); kept as a plain record so the ruling below
 * is a pure function unit-tested in Node.
 *
 * `null` means "this browser does not expose it" — never a guessed value. The
 * ruling must degrade to the shipped "med" cold start when nothing is known,
 * or a Firefox user (no `deviceMemory`) would be graded by absence.
 */
export interface DeviceSignals {
  /** `matchMedia("(pointer: coarse)")` — the PRIMARY pointer is a fingertip. */
  coarsePointer: boolean | null;
  /** `matchMedia("(any-pointer: fine)")` — a mouse/trackpad/stylus exists at all. */
  anyFinePointer: boolean | null;
  /** `navigator.deviceMemory`, GiB. Chromium-only, clamped to 0.25–8. */
  deviceMemoryGb: number | null;
  /** `navigator.hardwareConcurrency` — logical cores. */
  hardwareConcurrency: number | null;
  /** `window.devicePixelRatio`. */
  dpr: number;
}

/** Signals with nothing known but the pixel ratio — the pre-seeding behaviour. */
export function unknownDeviceSignals(dpr: number): DeviceSignals {
  return {
    coarsePointer: null,
    anyFinePointer: null,
    deviceMemoryGb: null,
    hardwareConcurrency: null,
    dpr,
  };
}

/**
 * The COLD-START tier, decided from device signals before the first fetch.
 *
 * Why this exists at all (doc 82 §2.3): the `low` preset is not only a render
 * tier — `TEXTURE_BUDGETS` (sim/world) makes it a DOWNLOAD tier that fetches
 * 725,950 B instead of the med plan's 5,950,303 B (incl. a 1,596,163 B HDR).
 * That 5.4 MB saving is worth nothing if the tier is decided after the fetch
 * has already been issued, so this ruling has to be synchronous and has to run
 * before anything mounts.
 *
 * WHY IT IS DELIBERATELY NARROW. The doc asks to "bias toward low on
 * disagreement", and inside the touch-only family it does. But a seed that
 * guesses `low` for a desktop is not self-correcting today: `useAutoQualityProbe`
 * is exported and never mounted (grep: no call site outside this module), so a
 * wrong `low` sticks until the student opens the graphics selector. So the
 * phone-class rules are all gated behind "touch-only" — a device whose primary
 * pointer is coarse AND which reports no fine pointer anywhere. Every shipping
 * phone matches that; a touch laptop with a trackpad does not.
 *
 * Rules, first match wins:
 *  1. `dpr ≥ 3` → low. Unchanged from the shipped cold start: 9× the fill of
 *     dpr 1, and the maxDpr cap cannot claw all of that back.
 *  2. `deviceMemoryGb ≤ 2` → low, pointer irrespective. Chromium on Android
 *     cannot grow a WASM heap past 256 MB (§2.1); at 2 GB total the med plan's
 *     5.9 MB of maps plus Rapier is not a tier, it is a context-loss.
 *  3. touch-only AND any one of: `dpr ≥ 2` (every modern phone panel),
 *     `deviceMemoryGb ≤ 4` (the Galaxy A16 / Redmi Note reference device),
 *     `hardwareConcurrency ≤ 4` → low.
 *  4. otherwise → med, exactly as before.
 *
 * Never returns "high": a cold start has no evidence of headroom, only of its
 * absence. Promotion stays the FPS probe's job.
 */
export function seedQualityFromSignals(signals: DeviceSignals): QualityLevel {
  const { coarsePointer, anyFinePointer, deviceMemoryGb, hardwareConcurrency, dpr } = signals;
  if (dpr >= 3) return "low";
  if (deviceMemoryGb !== null && deviceMemoryGb <= 2) return "low";
  const touchOnly = coarsePointer === true && anyFinePointer !== true;
  if (
    touchOnly &&
    (dpr >= 2 ||
      (deviceMemoryGb !== null && deviceMemoryGb <= 4) ||
      (hardwareConcurrency !== null && hardwareConcurrency <= 4))
  ) {
    return "low";
  }
  return "med";
}

/**
 * The "auto" heuristic.
 *
 * - No fps evidence (`fpsMedian` null):
 *   - with a `currentLevel` (probe ran but collected too few frames — hidden
 *     tab etc.): keep the current level, change nothing;
 *   - without one (cold start): defer to `seedQualityFromSignals`. Pass
 *     `signals` to give it the pointer/memory/core evidence; with only a `dpr`
 *     the seed reduces to the shipped rule (med, or low at dpr ≥ 3), which is
 *     why every existing caller keeps its answer.
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
  /** Cold-start device evidence (doc 82 §2.3). Omit → dpr-only, as shipped. */
  signals?: DeviceSignals;
}): QualityLevel {
  const { dpr, fpsMedian, currentLevel, signals } = input;
  if (fpsMedian === null) {
    if (currentLevel) return currentLevel;
    return seedQualityFromSignals(signals ?? unknownDeviceSignals(dpr));
  }
  const current = currentLevel ?? "med";
  if (fpsMedian >= 57) return stepUp(current);
  if (fpsMedian >= 48) return current;
  if (fpsMedian >= 34) return stepDown(current);
  return "low";
}
