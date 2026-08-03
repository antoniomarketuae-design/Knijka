// Time-of-day environment presets + sun position math.
//
// Pure data & math — deliberately NO three.js imports so vitest exercises it
// in plain Node (same pattern as vehicle/math.ts). The React layer
// (SimEnvironment / SkyDome) converts hex strings to THREE.Color and animates
// smoothly between presets, so these values are *targets*, not per-frame state.

export type TimeOfDay = "day" | "dusk" | "night";

export interface SunAngles {
  /** Compass azimuth, degrees: 0 = north, 90 = east, 180 = south, 270 = west. */
  azimuthDeg: number;
  /** Elevation above the horizon, degrees (positive = above). */
  elevationDeg: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Unit vector pointing FROM the scene TOWARD the sun, in three.js world
 * space: +x = east, +y = up, -z = north (district "y = north" maps to -z).
 */
export function sunDirection(angles: SunAngles): Vec3Like {
  const az = (angles.azimuthDeg * Math.PI) / 180;
  const el = (angles.elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(el);
  return {
    x: Math.sin(az) * horizontal,
    y: Math.sin(el),
    z: -Math.cos(az) * horizontal,
  };
}

/** Gradient sky + sun disc + stars parameters consumed by the SkyDome shader. */
export interface SkySpec {
  /** Color straight up. */
  zenith: string;
  /** Color at the horizon (should sit close to fog color for a seamless blend). */
  horizon: string;
  /** Exponent shaping the zenith→horizon gradient (higher = warmth hugs the horizon). */
  horizonCurve: number;
  /** Sun/moon disc tint (added on top of the gradient, HDR — may exceed 1). */
  sunTint: string;
  /** Angular RADIUS of the sun/moon disc, degrees (real sun ≈ 0.27°; we cheat bigger). */
  sunDiscDeg: number;
  /** HDR intensity of the disc (drives bloom at high quality). */
  sunDiscIntensity: number;
  /** Intensity of the wide glow around the sun. */
  sunGlowIntensity: number;
  /** Tightness of the glow falloff (pow exponent — higher = tighter). */
  sunGlowPower: number;
  /** 0..1 procedural starfield strength (night only). */
  starsIntensity: number;
  /**
   * 0..1 fraction of the dome the two-octave FBM cloud deck covers
   * (doc 82 V2 — the shipped sky was mix(zenith, horizon) + a sun disc over
   * 35–45 % of every frame). Rain lerps this toward RAIN_CLOUD_COVER.
   */
  cloudCover: number;
  /** Opacity of the deck where it covers. 0 disables the whole branch. */
  cloudDensity: number;
  /** Top-side cloud colour. The sun-facing rim adds `sunTint` on top of it,
   *  so this is the SHADED value, not the lit one. */
  cloudColor: string;
  /** 0..1 strength of the Vitosha ridge silhouette (doc 82 V3). */
  ridgeStrength: number;
  /** Ridge colour at the crest. Already haze-lifted per preset — the shader
   *  blends the massif's feet into `horizon` on top of this. */
  ridgeColor: string;
}

/** The two-light rig: one hemisphere fill + one directional key (sun or moon). */
export interface LightRigSpec {
  sun: SunAngles & { color: string; intensity: number };
  hemisphere: { skyColor: string; groundColor: string; intensity: number };
}

export interface FogSpec {
  color: string;
  /** THREE.FogExp2 density (factor = 1 − e^−(d·depth)²). */
  density: number;
}

export interface EnvironmentPreset {
  timeOfDay: TimeOfDay;
  sky: SkySpec;
  light: LightRigSpec;
  /** Clear-weather fog. */
  fog: FogSpec;
  /** Fog target while raining (denser, desaturated); blended in by rain intensity. */
  rainFog: FogSpec;
  /**
   * Fog target in FOG WEATHER (doc 72 AC-03 „Мъгла" — drastically reduced
   * visibility); blended in by fog intensity, and it WINS over the rain blend
   * (a foggy scene is fog first). Densities put usable sight at ~50–70 m:
   * at 0.02, FogExp2 transmittance e^−(d·s)² is ~37 % at 50 m and ~2 % at
   * 100 m — the „спри в рамките на видимостта" envelope the fog conditions
   * factor (rules cfg conditionSpeedFogFactor 0.6) grades against.
   */
  fogWeather: FogSpec;
  /**
   * Fog target in SNOW WEATHER (doc 72 AC-08 winter grip — the snowfall
   * veil); blended in by snow intensity. DELIBERATELY LIGHTER than the fog
   * bank: heavy snowfall shortens usable sight to ~80–120 m (at 0.012,
   * FogExp2 transmittance is ~40 % at 80 m and ~9 % at 130 m) — you see the
   * road, you just cannot STOP on it (the grip physics carries the lesson).
   * Cold desaturated white, never the warm haze. This color pulls double
   * duty: SnowFlakes fall through it AND the hemisphere ground bounce lerps
   * toward it (SNOW_GROUND_WHITEN) so the world reads snow-lit — the
   * particles + light blend carry the look; white ground textures remain
   * world-module asset work (the original scope note, now half-closed).
   * FOG weather wins over snow when both are on (fog is the denser veil).
   */
  snowWeather: FogSpec;
  /**
   * Renderer tone-mapping exposure target (gl.toneMappingExposure). Per-preset
   * so day can run punchy without brightening the intentionally-dark night rig
   * (doc 71 §4.1 — "stop sharing one knob"). SimEnvironment damps toward it on
   * time-of-day changes like every other rig value.
   */
  exposure: number;
}

/** How much rain dims the key light (multiplier at full rain intensity). Raised
 *  from the shipped 0.55 (founder v4: „road very bright from the Sun, no
 *  difference"): a light-rain overcast has almost no directional sun on the
 *  road, so the key must fall further than half. At full rain the day key
 *  (1.9) lands ~0.61 — a soft, low-contrast light, not the dry golden throw. */
export const RAIN_SUN_DIM = 0.68;
/** How much rain dims the hemisphere fill. Raised from 0.3 so the whole scene
 *  loses the bright-day ambient along with the key (an overcast sky is a dimmer
 *  fill, not just a hidden sun). */
export const RAIN_HEMISPHERE_DIM = 0.42;
/**
 * How much rain lowers tone-mapping exposure (multiplier at full rain). The
 * missing lever behind the founder v4 complaint: v4 dimmed the wet-road
 * reflection but the renderer exposure stayed at the dry preset (day 1.15), so
 * the sky, sun and road all still metered like a bright day. A light shower is
 * roughly a quarter-stop darker overall; at full rain the day exposure lands
 * ~0.98 (still above night's 0.95 — a gloomy DAY, never night-dark). RAIN-ONLY:
 * fog and snow keep their preset exposure (their own dims carry those looks).
 */
export const RAIN_EXPOSURE_DIM = 0.15;

/**
 * How much RAIN dims the DAY image-based (HDRI) ambient — the last
 * un-rain-aware daylight source. The drei <Environment> IBL is a constant
 * (day 0.5 / night 0.12) and never read the rain channel, so under day rain the
 * bright golden-hour day HDRI kept lighting AND reflecting off the wet road and
 * the scene still read "sunny" no matter how much the sun/exposure/sky dimmed
 * (founder, three rounds: "road still too bright"). Day IBL 0.5 → 0.20 at full
 * rain: a gloomy DAY, still clearly above night's 0.12. Gated to day only
 * (night rain is already dark); dry/fog/snow lessons (rain=false) unaffected.
 */
export const RAIN_IBL_DIM = 0.6;

/** How much FOG dims the key light at full fog intensity — heavier than rain:
 *  a fog bank diffuses the sun into the ambient, killing directionality. */
export const FOG_SUN_DIM = 0.8;
/** How much FOG dims the hemisphere fill (mild — fog scatters light around). */
export const FOG_HEMISPHERE_DIM = 0.2;

/** How much SNOW dims the key light at full snowfall — a snow overcast sits
 *  between rain (0.55) and fog (0.8): the sun is a diffuse smudge, not gone. */
export const SNOW_SUN_DIM = 0.6;
/** How much SNOW dims the hemisphere fill — LIGHTEST of the three: snowfall
 *  scatters light everywhere and a winter sky stays bright (high albedo). */
export const SNOW_HEMISPHERE_DIM = 0.1;
/**
 * How far the hemisphere GROUND bounce lerps toward the preset's snowWeather
 * color at full snow intensity — the ground-whitening lever. Fresh snow cover
 * has ~0.8 albedo where dry asphalt has ~0.1: under snowfall the light bounced
 * up from the ground turns cold and bright, and every underside in the scene
 * reads "the world is white below me" — zero extra draw calls, zero new
 * materials, no z-fighting risk (the cheapest honest whitening; actual white
 * ground textures/meshes remain world-module asset work).
 */
export const SNOW_GROUND_WHITEN = 0.85;

/**
 * Top-down fog cap (doc 76 §4 note: the topdown camera flies at a constant
 * ~110 m — at fog-weather densities the ground would be a solid white sheet).
 * The WEATHER fog density is capped so the optical depth from the camera to
 * the ground directly below never exceeds this value: at 0.75 the map reads
 * through a clearly-foggy ~43 % wash instead of disappearing. Driving views
 * (cockpit ~1.2 m, chase ~5 m) sit far below the cap and render full density —
 * the cap is an honest VIEW-AID concession (topdown is an L1 aid view; the
 * graded envelope always follows tick.fog, never the camera). The SNOW haze
 * rides the SAME cap (0.012 × 110 m ≈ 1.32 optical would white the map out
 * too) — one view-aid law for every weather veil.
 */
export const FOG_TOPDOWN_MAX_OPTICAL = 0.75;

/**
 * The three lighting moods. Rigs stay structurally constant across presets
 * (same lights, same shader defines) so switching time-of-day never triggers
 * material recompiles — only intensities/colors/directions animate.
 */
export const ENVIRONMENT_PRESETS: Record<TimeOfDay, EnvironmentPreset> = {
  // Mid-afternoon, sun HIGH ENOUGH TO REACH THE CARRIAGEWAY (art pass
  // 2026-08-03, founder-approved). The rig it replaces was a 22° "late golden"
  // key, and the review's flat verdict — *"there are NO CAST SHADOWS
  // anywhere"* — was that sun, not a broken shadow map. Measured on
  // /dev/gw-shell?lesson=l2-intersections at tier `high`: toggling
  // gl.shadowMap.enabled moved 3.1/255 of mean pixel value and darkened the
  // ENTIRE road plus both pavements uniformly. The map worked; there was
  // simply never a shadow EDGE on screen, because at 22° a 20 m building
  // throws 20/tan(22°) ≈ 50 m and the perceptually-scaled carriageway is only
  // ~32 m wide — so every north-south street sat wholly in the shade of its
  // own west building line. A uniformly-shaded street is indistinguishable
  // from "no directional light at all", which is exactly what the frame read
  // as.
  //
  // 41° was tried first and MEASURED as not enough (lightlab, 2026-08-03:
  // toggling the shadow map still moved the road patch in front of the car by
  // 8.4/255 — the street was still wholly shaded, just less so). 56° throws
  // 0.67 × height: a 27 m block set 8 m back off the kerb now reaches ~10 m
  // into a ~16 m carriageway, so there is a hard sunlit/shaded EDGE down the
  // street instead of one flat tone; a 1.4 m car drops a 0.9 m contact shadow;
  // trees, poles and signs stripe the pavement. It is also honest for Sofia
  // (42.7° N): solar noon runs ~40° at the equinox and ~66° at midsummer.
  //
  // And it FITS — the reason doc 71 capped this at 22–25 in the first place
  // was that lower suns out-throw the camera-following ortho shadow frustum
  // (45/55/75 m half-extent, quality.ts). At 56° even a 50 m tower throws
  // 34 m, inside the tightest of the three, so nothing here waits on CSM.
  //
  // The "washed out" root cause doc 71 §4.1 diagnosed was the key:fill RATIO,
  // not the elevation: the old noon rig was 1.35 vs 0.85 ≈ 1.6:1, and THAT is
  // what read overcast-flat. It is preserved here — 1.85 vs 0.50 = 3.7:1,
  // still above the 3.5:1 the doc ruled — while the elevation does the
  // shadow work. High sun + lean fill is a CONTRASTY midday, which is what the
  // founder's reference frame is; high sun + strong fill is the overcast rig
  // doc 71 removed. The ratio is the invariant, not the elevation.
  day: {
    timeOfDay: "day",
    sky: {
      zenith: "#3f76c4", // a real blue overhead
      // Pale blue-white haze, not the old cream #f4c78e. Doc 82 §1.2 item 5:
      // 35–45 % of every frame is sky, and ours was a sepia gradient — the
      // single biggest "prototype" tell after the missing shadows. The
      // founder's own reference is a blue sky with white cumulus over a
      // hazy pale horizon; this is that.
      horizon: "#d5e4ee",
      // col = mix(zenith, horizon, pow(1 - up, curve)) — a HIGHER curve pulls
      // the pale band down onto the horizon and gives the rest of the dome
      // back to the blue. 2.1 → 3.0 is most of why the sky stopped reading as
      // "a flat gradient with a hard horizon band".
      horizonCurve: 3.0,
      sunTint: "#fff4e0", // a 56° sun is far whiter than a 22° one
      sunDiscDeg: 0.85,
      sunDiscIntensity: 4.0,
      sunGlowIntensity: 0.28, // less flare now the sun is out of the eyeline
      sunGlowPower: 16,
      starsIntensity: 0,
      // Broken afternoon cumulus — enough sky left for the blue zenith to
      // still read, enough deck that the frame is no longer an empty
      // gradient. Pure white tops: a 41° sun lights them from above.
      cloudCover: 0.5,
      cloudDensity: 0.92,
      cloudColor: "#ffffff",
      // Vitosha in full daylight haze: a desaturated blue-grey, still a shade
      // DEEPER and cooler than the pale horizon it stands against. That
      // value split is what sells 15 km of air between the city and the
      // massif now that the horizon is no longer warm.
      ridgeStrength: 1,
      ridgeColor: "#8fa3bd",
    },
    light: {
      sun: { azimuthDeg: 245, elevationDeg: 56, color: "#fff3e0", intensity: 1.85 },
      // 0.50, not lower. Tier `low` has NO shadow map and NO HDRI ambient
      // (TEXTURE_BUDGETS.low.hdrEnvironment is false), so on the phone this
      // hemisphere IS the entire fill — measured at 0.42 the shaded faces of
      // every block went to near-black there while the desktop, which still
      // has the IBL, looked fine. The ratio that matters is still comfortably
      // above doc 71's floor.
      hemisphere: { skyColor: "#a8c6ea", groundColor: "#4d4740", intensity: 0.5 },
    },
    // Cool haze ≈ sky horizon, a shade greyer so it reads as air, not paint —
    // and the fog colour is what the GroundBackdrop disc dissolves into, so it
    // has to track the sky's horizon band or the join becomes the "hard
    // horizon line" the review named.
    // 0.0026 is the FLOOR, not a taste call: groundBackdrop.test.ts requires
    // fogOpacityAt(430 m) > 0.7 for every clear density so the backdrop disc's
    // own rim is never visible, and 1.097/430 = 0.002552.
    fog: { color: "#c6d5e0", density: 0.0026 },
    // Rain haze: a darker, cooler grey than the shipped silver-blue #9aabbd,
    // and a touch denser so the distance greys out under the shower instead of
    // reading the warm dry haze. 0.0042 still clears 100 m signage (~84 %) —
    // the rule-engine legibility floor holds.
    rainFog: { color: "#7c8794", density: 0.0042 },
    // Day fog: bright desaturated grey (fog scatters daylight) — ~50 m sight.
    fogWeather: { color: "#c9cdd2", density: 0.02 },
    // Day snow: bright COLD white haze, lighter than fog (~80–120 m usable
    // sight) — the snowfall veil, not a blinding bank.
    snowWeather: { color: "#e8ebef", density: 0.012 },
    exposure: 1.15,
  },

  // Low golden sun in the west — long shadows, warm horizon, cooling zenith.
  dusk: {
    timeOfDay: "dusk",
    sky: {
      zenith: "#35446e",
      horizon: "#f2a45c",
      horizonCurve: 2.3,
      sunTint: "#ffb066",
      sunDiscDeg: 1.5,
      sunDiscIntensity: 3.0,
      sunGlowIntensity: 0.55,
      sunGlowPower: 7,
      starsIntensity: 0.12,
      // An 8° sun underlights the deck from below — the cloud base goes warm
      // and the cover thickens as the evening inversion sets in.
      cloudCover: 0.5,
      cloudDensity: 0.9,
      cloudColor: "#ffcfa4",
      // The massif goes violet-grey against the orange band well before the
      // city does.
      ridgeStrength: 1,
      ridgeColor: "#6b6a86",
    },
    light: {
      sun: { azimuthDeg: 262, elevationDeg: 8, color: "#ff9e54", intensity: 0.85 },
      hemisphere: { skyColor: "#e8b07f", groundColor: "#3c3a35", intensity: 0.5 },
    },
    // A hair denser than day's 0.0028 — the 8° sun reads hazier, and the
    // day < dusk < night fog ordering is a tested invariant.
    fog: { color: "#d9a06b", density: 0.0032 },
    // Dusk rain: the warm low light is gone under cloud — a cool grey haze,
    // darker and a hair denser than the shipped #958b91.
    rainFog: { color: "#787c84", density: 0.005 },
    // Dusk fog: the low warm light barely tints the bank.
    fogWeather: { color: "#aca7a3", density: 0.022 },
    // Dusk snow: cold grey-blue veil — the day < dusk < night ordering of the
    // fog specs, mirrored.
    snowWeather: { color: "#c3c6cc", density: 0.013 },
    exposure: 1.1,
  },

  // Cool moonlit ambient. Streetlights (world module) and the car's own
  // headlights are expected to carry the scene — this rig only keeps geometry
  // readable, never bright. The faint directional is the moon.
  night: {
    timeOfDay: "night",
    sky: {
      zenith: "#070d1a",
      horizon: "#17233a",
      horizonCurve: 1.9,
      sunTint: "#dbe6ff",
      sunDiscDeg: 0.6,
      sunDiscIntensity: 1.6,
      sunGlowIntensity: 0.05,
      sunGlowPower: 20,
      starsIntensity: 1,
      // Thinner and darker than day: the deck's job at night is to OCCLUDE
      // stars in patches, which is what stops the starfield reading as a
      // uniform decal. Never brighter than the zenith or it glows.
      cloudCover: 0.35,
      cloudDensity: 0.7,
      cloudColor: "#1d2740",
      // Near-black against the city's sky glow — the ridge at night is a hole
      // in the stars, not a painted shape.
      ridgeStrength: 1,
      ridgeColor: "#0c1322",
    },
    light: {
      sun: { azimuthDeg: 300, elevationDeg: 42, color: "#b9ccf2", intensity: 0.16 },
      hemisphere: { skyColor: "#26324e", groundColor: "#10141d", intensity: 0.3 },
    },
    fog: { color: "#121c2e", density: 0.004 },
    // Night rain already reads gloomy; nudge it a touch darker/denser so a rainy
    // night sits below a clear one (streetlights still glow into the haze).
    rainFog: { color: "#0b1019", density: 0.0066 },
    // Night fog: a faintly-lit dark grey (streetlights glow into the bank),
    // denser than day — night fog is the blindest condition we render.
    fogWeather: { color: "#1a2028", density: 0.024 },
    // Night snow: a faintly-lit cold grey veil (headlights glitter into the
    // flakes), densest of the three snow specs.
    snowWeather: { color: "#252b34", density: 0.015 },
    exposure: 0.95,
  },
};
