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
    // WEATHER FLOOR, not a tier upgrade (register row B71, re-measured
    // 2026-08-02: "on «Дистанция в дъжд», a device sent to `low` is shown a
    // lesson about rain with no rain in it"). rainParticles was 0 and
    // SimEnvironment gates RainStreaks on `> 0`, so on a €125 handset the one
    // lesson whose entire subject is reduced grip and reduced visibility
    // rendered as a dry street. That is not a graphics setting, it is the
    // lesson failing to state its own premise — and the north-star test
    // ("does this produce safer drivers?")答 is decided by whether the
    // student can SEE that it is raining.
    //
    // 260 is the floor that keeps the claim honest at the lowest cost the
    // renderer can charge: RainStreaks/SnowFlakes are ONE instanced draw with
    // static per-instance seeds, so 260 streaks is +1 draw call and ~520
    // triangles against the phone budget's ≤70 calls / ≤250k triangles — and
    // it is paid ONLY on a wet lesson (the component is unmounted when
    // rain/snow are off, so every dry lesson at `low` is byte-identical to
    // before). med/high keep their authored densities.
    rainParticles: 260,
    snowParticles: 260,
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
 * A device whose PRIMARY pointer is a fingertip and which reports no fine
 * pointer anywhere — every shipping phone and tablet matches, a touch laptop
 * with a trackpad does not. The one signal in the set that describes a device
 * CLASS rather than a component, which is why every phone-budget rule below is
 * gated behind it.
 */
export function isTouchOnlyDevice(signals: DeviceSignals): boolean {
  return signals.coarsePointer === true && signals.anyFinePointer !== true;
}

/**
 * The highest tier `auto` may ever reach on this device, measurement or not.
 *
 * Touch-only → `med`, hard. Not a performance guess: doc 82 §2.2 states the
 * phone rule outright — *"Do not raise the phone dpr cap. dpr 1.5 is 2.25× the
 * fill and destroys the parity the whole budget rests on."* `high` IS a
 * maxDpr-1.5 tier (plus a 2048² shadow map), so no amount of measured headroom
 * entitles a handset to it. A phone that measures beautifully gets `med` — the
 * full facade/ground map set, the HDR IBL, shadows, AO, bloom, grade — and
 * stops there.
 */
export function autoQualityCeiling(signals: DeviceSignals): QualityLevel {
  return isTouchOnlyDevice(signals) ? "med" : "high";
}

/**
 * The dpr a HANDSET is allowed to render at, whatever tier it is on.
 *
 * Doc 82 §2.2's ruling — *"Do not raise the phone dpr cap. dpr 1.5 is 2.25× the
 * fill and destroys the parity the whole budget rests on"* — was enforced only
 * by `autoQualityCeiling` keeping `auto` out of `high`. That left two ways past
 * it: a device promoted to `med` by measurement, and a student choosing a tier
 * by hand. Both then render at `med`'s dpr 1.25.
 *
 * MEASURED, 2026-08-12, production build, `l0-free-drive`, six phone profiles
 * (this machine at phone dimensions — NOT a handset):
 *
 *   iPhone-16 portrait  low  377×836  = 315,172 px   med  471×1045 = 492,195 px
 *   iPhone-16 landscape low  836×377  = 315,172 px   med 1045×471  = 492,195 px
 *   Android 360 wide    low  344×764  = 262,816 px   med  430×955  = 410,650 px
 *
 * `med` is a **1.56× larger backing store on every profile** — 1.25², paid on
 * every fragment of every pass, on the tier that also runs a shadow map and a
 * four-effect composer. The panel's own `devicePixelRatio` is 3 on all six
 * profiles and it changes NOTHING: the Canvas is wired `dpr={[1, cap]}`, so the
 * 9×-fill fear about a dpr-3 phone was never real. The only dpr a phone ever
 * pays is this cap.
 *
 * So the cap becomes a property of the DEVICE, applied at the one place the
 * Canvas reads it, and a phone renders 1:1 with its CSS pixels on every tier.
 * A student who picks a higher tier on a phone is asking for the lighting —
 * shadows, AO, bloom, the full facade maps — not for 56 % more fragments.
 *
 * THAT LAST SENTENCE WAS A GUESS, AND THE FOUNDER HAS NOW CONTRADICTED IT
 * TWICE. Verbatim: *"the resolution is brutally low, ultra bad, not like the
 * PC"* and *"we need the highest quality as dpr 3"*. On his iPhone 16 Pro this
 * constant renders 393×852 and hands it to a 1179×2556 panel: **one rendered
 * pixel stretched over nine real ones**, which is exactly what he is seeing.
 * The paragraph above is still right about `low` and `med` — it was measured —
 * but it was written about a €125 Android and then applied to a flagship.
 *
 * SO THE CONSTANT STAYS AND STOPS BEING THE WHOLE RULE: see
 * `TOUCH_HIGH_MAX_DPR` below and `maxDprFor`.
 */
export const TOUCH_MAX_DPR = 1.0;

/**
 * THE RESOLUTION A HANDSET MAY REACH AT THE TOP TIER — its own screen, and
 * never more than that.
 *
 * THE RULING, AND THE CONSTRAINT IT HAS TO SURVIVE. He must get native dpr on
 * his phone; a €125 handset must not be handed 9× the fill and die. Those are
 * not in conflict once you notice that **`high` is not reachable by accident on
 * a phone**: `autoQualityCeiling()` caps `auto` at `med` on every touch-only
 * device, forever, so the ONLY way a handset renders at this cap is a student
 * opening the lesson menu and choosing «Високо» — one deliberate press, on a
 * control that states the trade in words before the press lands
 * (`qualityTradeBg`, lesson-ui/qualityChoice.ts). Nothing is granted silently,
 * which is the thing that would have been indefensible.
 *
 * WHY `signals.dpr` AND NOT `QUALITY_PRESETS.high.maxDpr` (1.5). On a desktop,
 * 1.5 is SUPERSAMPLING — more fragments than the panel has pixels, bought for
 * edge quality. On a phone the same number is still a downscale: the panel has
 * three device pixels per CSS pixel, so 1.5 renders 1179×2556 worth of screen
 * at 590×1278. There is nothing to invent here and nothing to be clever about —
 * the top tier on a phone means "draw the pixels the screen actually has", and
 * that is `window.devicePixelRatio`, whatever it happens to be. A dpr-1 tablet
 * therefore gets 1.0 at `high` and not 1.5: a phone never pays for
 * supersampling, only for its own glass.
 *
 * 3 IS A GUARD, NOT A TARGET. It is the reference device's own ratio and the
 * top of the shipping range; it exists so a future dpr-4 panel cannot quietly
 * ask for 16× the fill of `low` on the strength of a constant nobody revisited.
 */
export const TOUCH_HIGH_MAX_DPR = 3.0;

/**
 * The Canvas dpr cap for a tier on a given device.
 *
 * Pointing devices: the preset's own cap, exactly as authored — untouched.
 * Handsets: 1:1 with CSS pixels at `low` and `med` (the tiers `auto` can reach
 * on its own), and the screen's real pixels at `high` (the tier only an
 * explicit student choice reaches). Pure, so the ruling is unit-tested in Node;
 * `canvasMaxDpr()` in the store is the DOM half that reads the signals.
 */
export function maxDprFor(level: QualityLevel, signals: DeviceSignals): number {
  const preset = QUALITY_PRESETS[level].maxDpr;
  if (!isTouchOnlyDevice(signals)) return preset;
  if (level === "high") {
    // A garbage `devicePixelRatio` (0, NaN, negative) must degrade to the old
    // behaviour, never to a blank drawing buffer.
    const native = Number.isFinite(signals.dpr) && signals.dpr > 0 ? signals.dpr : TOUCH_MAX_DPR;
    return Math.min(Math.max(native, TOUCH_MAX_DPR), TOUCH_HIGH_MAX_DPR);
  }
  return Math.min(preset, TOUCH_MAX_DPR);
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
 * disagreement", and inside the touch-only family it still does. The phone-class
 * rules are all gated behind `isTouchOnlyDevice`.
 *
 * WHAT CHANGED, AND WHY (the iPhone-16 bug). The first rule used to be a bare
 * `dpr >= 3 → low`, justified as "9× the fill of dpr 1". That justification does
 * not survive reading QUALITY_PRESETS: the Canvas is wired `dpr={[1, maxDpr]}`,
 * so fill cost is bounded by `maxDpr` (1.0 / 1.25 / 1.5) and NOT by the panel's
 * devicePixelRatio. A dpr-3 device renders at exactly the same buffer size as a
 * dpr-1 device at the same tier. `devicePixelRatio` describes a good SCREEN; it
 * is not evidence about a GPU, and it never separated the two devices it was
 * being asked to separate — an A18 (iPhone 16) and a Mali-G57 MP2 (€125 Galaxy
 * A16) both report 3 and 2.625 respectively. What it DID do was condemn every
 * high-DPI pointing device — a Windows laptop at 300% display scaling reports
 * dpr 3 and was being served the 725 KB texture set on a discrete GPU.
 *
 * So dpr is demoted from "proof of weakness" to "one of the touch-family cues"
 * (rule 3, where it always belonged), and the standalone rule is gone.
 *
 * WHAT STILL SEPARATES AN iPHONE FROM AN A16, honestly: nothing synchronous and
 * reliable. `hardwareConcurrency` is worse than useless here — the A16's Helio
 * G99 reports 8 logical cores and iOS Safari reports 4, so the cheap phone looks
 * like the strong one. `deviceMemory` is Chromium-only, so every Apple device
 * reports `null` and promoting on that absence would also promote Firefox
 * Android on a 4 GB handset straight into a 5.9 MB fetch and a 256 MB WASM heap
 * cap (§2.1) — an OOM black canvas, the single worst failure mode in the doc.
 * The one thing that genuinely separates them is a frame time, so the seed stays
 * conservative for the whole touch family and MEASUREMENT does the promoting
 * (`ledgerFromSample` below). An iPhone therefore pays the `low` tier for its
 * first session only, then climbs; the A16 measures ~30 fps against a 57 fps
 * promotion bar and stays exactly where it is.
 *
 * THE 8 GB CARVE-OUT IS GONE, AND IT WAS MEASURED OUT, NOT ARGUED OUT.
 *
 * The rule was `touch-only AND deviceMemoryGb >= 8 → med`, on the reasoning
 * that Chromium clamps `deviceMemory` to 8, so a phone reporting 8 has ≥8 GB —
 * *"a flagship Android, not a €125 handset"*. Two things retired it:
 *
 *  1. WHAT `med` ACTUALLY COSTS A PHONE, measured on the production build over
 *     six phone profiles (this machine at phone dimensions — not a handset):
 *     **2.4× the draw calls** (205.6 → 492.5 per frame on iPhone-16 portrait;
 *     233.8 → 521.2 landscape; 206.2 → 492.8 on the 360-wide Android) and a
 *     **1.56× larger backing store**, on top of doc 91 §G1's 5.7× GPU time.
 *     `low` is already 205–234 draws against a ≤150 budget; `med` is 3.3× over
 *     the cap. That is not a tier a guess should hand out.
 *  2. THE RULE INFERRED A GPU FROM A RAM FIGURE, and in 2026 8 GB is mid-range,
 *     not flagship — a Helio-G99 handset ships with 8 GB. The rule's own
 *     defence was that *"nothing synchronous and reliable"* separates an
 *     iPhone from an A16, so RAM had to stand in. That defence expired when the
 *     FPS probe was finally mounted: measurement now does the promoting, and a
 *     genuine flagship pays `low` for exactly one session before
 *     `ledgerFromSample` earns it `med` permanently. The cost of being wrong is
 *     no longer symmetric — a wrong `low` costs one session of shadows, a wrong
 *     `med` costs 2.4× the draws and a 5.9 MB texture plan on a 4 GB phone.
 *
 * Every touch-only device therefore starts at `low` and climbs on evidence.
 *
 * Rules, first match wins:
 *  1. `deviceMemoryGb ≤ 2` → low, pointer irrespective. Chromium on Android
 *     cannot grow a WASM heap past 256 MB (§2.1); at 2 GB total the med plan's
 *     5.9 MB of maps plus Rapier is not a tier, it is a context-loss.
 *  2. touch-only → low. No memory or core figure buys a handset out of it;
 *     `ledgerFromSample` does, with a frame time.
 *  3. otherwise → med, exactly as before.
 *
 * Never returns "high": a cold start has no evidence of headroom, only of its
 * absence. Promotion stays measurement's job.
 */
export function seedQualityFromSignals(signals: DeviceSignals): QualityLevel {
  const { deviceMemoryGb } = signals;
  if (deviceMemoryGb !== null && deviceMemoryGb <= 2) return "low";
  if (isTouchOnlyDevice(signals)) return "low";
  return "med";
}

// ---------------------------------------------------------------------------
// Cross-session promotion (doc 82 §8, the "recorded, deliberately not actioned"
// row) — the other half of the iPhone-16 bug.
// ---------------------------------------------------------------------------

/** Median fps at or above which a tier is judged to have headroom to spare. */
export const PROMOTE_FPS = 57;
/** Median fps at or above which a tier is judged to be holding its target. */
export const HOLD_FPS = 48;
/** Below this the tier is not merely missing its target, it is failing. */
export const STRUGGLE_FPS = 34;
/**
 * Clean frame samples a PROMOTION requires — twice `MIN_PROBE_SAMPLES`.
 * Demotion may act on the smaller sample (a device that is drowning should not
 * have to prove it twice); climbing has to earn a fuller window.
 */
export const MIN_PROMOTION_SAMPLES = 60;

/**
 * One measurement window, and the tier that was actually on screen for it.
 * `level` is load-bearing: an fps number means nothing without the tier it was
 * paid at, and the whole ledger below is "what did this device do at X".
 */
export interface QualitySample {
  /** The tier that was rendering while the window was collected. */
  level: QualityLevel;
  /** `medianFpsFromDeltas` over that window. */
  fpsMedian: number;
  /** Clean frame deltas behind the median (stalls already discarded). */
  samples: number;
}

/**
 * The persisted verdict about THIS device. Small on purpose — it is written to
 * localStorage and read synchronously on every cold start.
 *
 * ADR-004: two enum-ish fields describing a GPU's behaviour. No identifier, no
 * timestamp, nothing joinable to a person, never transmitted.
 */
export interface QualityLedger {
  /** The tier this device has EARNED. The cold start for the next session. */
  earned: QualityLevel;
  /**
   * The LOWEST tier ever measured as not holding up here. `auto` never seeds at
   * or above it again — the hysteresis that stops a borderline device flipping
   * low→med→low every session. The graphics selector remains the manual
   * override; this only binds `auto`.
   */
  failedAt: QualityLevel | null;
}

function minLevel(a: QualityLevel, b: QualityLevel): QualityLevel {
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
}

/** Clamp to strictly below a tier already proven too heavy here. */
function clampBelowFailure(level: QualityLevel, failedAt: QualityLevel | null): QualityLevel {
  return failedAt === null ? level : minLevel(level, stepDown(failedAt));
}

/**
 * Fold one measurement into the persisted verdict.
 *
 * Deliberately NOT a live tier change. Doc 82 §8 records why the probe was left
 * unmounted: *"Wiring the probe would change render tier mid-drive for an
 * existing user"* — and at `low`→`med` that is not just a visual pop, it is a
 * 5.2 MB texture fetch and an HDR decode starting under the student's wheels.
 * So a sample only ever updates this record; the tier it implies is applied at
 * the next cold start, before a single byte is requested (`levelFromLedger`).
 * Promotion is therefore paid for exactly once, at the one moment in the
 * session where changing tiers costs nothing.
 *
 * Bands mirror `recommendQuality`, with two differences that matter on a phone:
 * promotion needs the fuller sample window, and `ceiling` is applied on the way
 * out so a handset can never be promoted into `high`'s dpr-1.5 buffer.
 *
 * Note what the 57 fps promotion bar means at tier `low` on the reference
 * device: doc 82 §2.2 sets the phone target at *"30 flat (floor 24) — do not
 * chase 60"*. A Galaxy A16 meeting its own budget scores ~30 and is nowhere
 * near 57, so it is never promoted. The bar is only cleared by a device sitting
 * on its vsync ceiling with frames to spare — which is precisely the reported
 * iPhone-16 symptom ("the FPS works perfectly flawlessly").
 */
export function ledgerFromSample(
  prev: QualityLedger | null,
  sample: QualitySample,
  ceiling: QualityLevel,
): QualityLedger {
  const at = sample.level;
  let failedAt = prev?.failedAt ?? null;
  let earned: QualityLevel;

  if (sample.fpsMedian >= PROMOTE_FPS && sample.samples >= MIN_PROMOTION_SAMPLES) {
    earned = stepUp(at);
  } else if (sample.fpsMedian >= HOLD_FPS) {
    earned = at;
  } else {
    // This tier did not hold up here. Record it so `auto` stops trying —
    // except at `low`, which is the floor: there is nothing under it to fall
    // back to, and marking it failed would say "this device cannot run the
    // simulator at all", which is not a claim a 4 s window can make.
    if (at !== "low") failedAt = failedAt === null ? at : minLevel(failedAt, at);
    earned = sample.fpsMedian >= STRUGGLE_FPS ? stepDown(at) : "low";
  }

  return { earned: clampBelowFailure(minLevel(earned, ceiling), failedAt), failedAt };
}

/**
 * The cold-start tier once measurement is taken into account: the seed's guess,
 * overruled in BOTH directions by anything this device has actually done, and
 * clamped by the ceiling and by any tier already proven too heavy.
 *
 * With no ledger this reduces to the seed, so a first visit behaves exactly as
 * documented above.
 */
export function levelFromLedger(
  seed: QualityLevel,
  ledger: QualityLedger | null,
  ceiling: QualityLevel,
): QualityLevel {
  if (ledger === null) return minLevel(seed, ceiling);
  return clampBelowFailure(minLevel(ledger.earned, ceiling), ledger.failedAt);
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
