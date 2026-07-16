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
   * Cold desaturated white, never the warm haze. HONEST SCOPE (doc 76 §0):
   * no snowfall particles and no white ground cover ship in this slice —
   * asset work; the haze + copy + snow-grip physics carry the winter story.
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

/** How much rain dims the key light (multiplier at full rain intensity). */
export const RAIN_SUN_DIM = 0.55;
/** How much rain dims the hemisphere fill. */
export const RAIN_HEMISPHERE_DIM = 0.3;

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
  // "Late golden" afternoon — low warm key from the WSW vs cool dim fill
  // (key:fill ≈ 3.5:1) with long diagonal shadows and warm aerial haze. The
  // doc 71 §4.1 Phase-1 rig: the old 55°/1.35-vs-0.85 noon read overcast-flat
  // (key:fill ≈ 1.6:1 — THE "washed out" root cause). Elevation stays at 22°
  // (not true golden 6–15°) until CSM lands — lower suns out-throw the
  // camera-following shadow frustum.
  day: {
    timeOfDay: "day",
    sky: {
      zenith: "#4a7ec2", // keep blue up top — contrast against the warm horizon
      horizon: "#f4c78e", // warm haze band
      horizonCurve: 2.1, // warmth hugs the horizon
      sunTint: "#ffdba8",
      sunDiscDeg: 1.0, // slightly fatter low sun
      sunDiscIntensity: 4.0,
      sunGlowIntensity: 0.35, // visible warm glow
      sunGlowPower: 14, // wider falloff
      starsIntensity: 0,
    },
    light: {
      sun: { azimuthDeg: 245, elevationDeg: 22, color: "#ffd9a0", intensity: 1.9 },
      hemisphere: { skyColor: "#b8cde8", groundColor: "#4a4034", intensity: 0.55 },
    },
    // Warm fog ≈ sky horizon, slightly greyer so it reads as air, not paint.
    // 0.0028: 200 m → 27 % faded, 400 m → 71 % — towers layer into the haze,
    // streets (and 100 m signage — rule-engine hard constraint, ~96 % clear)
    // stay legible.
    fog: { color: "#e3c49c", density: 0.0028 },
    rainFog: { color: "#9aabbd", density: 0.0034 },
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
    },
    light: {
      sun: { azimuthDeg: 262, elevationDeg: 8, color: "#ff9e54", intensity: 0.85 },
      hemisphere: { skyColor: "#e8b07f", groundColor: "#3c3a35", intensity: 0.5 },
    },
    // A hair denser than day's 0.0028 — the 8° sun reads hazier, and the
    // day < dusk < night fog ordering is a tested invariant.
    fog: { color: "#d9a06b", density: 0.0032 },
    rainFog: { color: "#958b91", density: 0.0042 },
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
    },
    light: {
      sun: { azimuthDeg: 300, elevationDeg: 42, color: "#b9ccf2", intensity: 0.16 },
      hemisphere: { skyColor: "#26324e", groundColor: "#10141d", intensity: 0.3 },
    },
    fog: { color: "#121c2e", density: 0.004 },
    rainFog: { color: "#0e141f", density: 0.0058 },
    // Night fog: a faintly-lit dark grey (streetlights glow into the bank),
    // denser than day — night fog is the blindest condition we render.
    fogWeather: { color: "#1a2028", density: 0.024 },
    // Night snow: a faintly-lit cold grey veil (headlights glitter into the
    // flakes), densest of the three snow specs.
    snowWeather: { color: "#252b34", density: 0.015 },
    exposure: 0.95,
  },
};
