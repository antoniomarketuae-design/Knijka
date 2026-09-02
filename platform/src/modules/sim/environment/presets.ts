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
   * bank: heavy snowfall shortens usable sight to ~80–120 m — YOU SEE THE
   * ROAD, YOU JUST CANNOT STOP ON IT (the grip physics carries the lesson).
   * Cold desaturated white, never the warm haze. This color pulls double
   * duty: SnowFlakes fall through it AND the hemisphere ground bounce lerps
   * toward it (SNOW_GROUND_WHITEN) so the world reads snow-lit — the
   * particles + light blend carry the look; white ground textures remain
   * world-module asset work (the original scope note, now half-closed).
   * FOG weather wins over snow when both are on (fog is the denser veil).
   *
   * THE TWO SENTENCES ABOVE ARE THE DESIGN; UNTIL 2026-08-28 THE NUMBERS
   * BELOW DID NOT IMPLEMENT EITHER OF THEM, AND THAT IS THE WHOLE OF
   * sc-ac-snow:0c76a9e9 („a student cannot tell sc-ac-snow from sc-ac-fog by
   * looking at the arrival screen", critical). Both halves were measured on
   * the corpus frames rather than reasoned:
   *
   *  · „~80–120 m usable sight" DID NOT REPRODUCE. At the shipped 0.012,
   *    FogExp2 transmittance e^−(d·s)² is 50 % at 69 m and 4 % at 150 m —
   *    a bank, not a veil, and only 1.67× further than the fog lesson's own
   *    42 m. Both lessons ended in a grey wall inside the same city block,
   *    which is why the student's whole forward view read the same in each.
   *    Measured on
   *    `.audit-frames/w14/frames/sc-ac-snow__pc-right/03-ready.png` against
   *    `.audit-frames/w13/frames/sc-ac-fog__pc-right/03-ready.png` (same map
   *    `ac-rain-v1`, same DAY preset — a clean A/B), mean sRGB, L709:
   *      far road (830,395 60×14)   snow 137.9/153.2/165.0 L150.8
   *                                 fog  141.5/155.2/166.0 L153.1  → 1.5 %
   *      sky      (700,140 120×30)  snow 186.4/190.2/195.3 L189.7
   *                                 fog  176.4/180.5/185.6 L180.0  → 5.4 %
   *    while the near road — where `roadSurfaceToParams`' snow term reaches —
   *    is 23.5 % apart (106.3 vs 86.1). The lane's own lane is separated; the
   *    view down the street is not. That is why this is a HAZE row.
   *
   *  · „COLD DESATURATED WHITE, NEVER THE WARM HAZE" WAS FALSE BY
   *    MEASUREMENT. The shipped day pair was snow #e8ebef (R−B = −7) against
   *    fog #c9cdd2 (R−B = −9): the SNOW veil was the WARMER of the two, by
   *    two levels, and at dusk the split was the right sign but only because
   *    fog is warm there. A claim in this file is worth nothing if the hex
   *    beside it says otherwise.
   *
   * SO THE DENSITIES ARE NOW DERIVED FROM THE SENTENCE, NOT TASTE: solve
   * e^−(d·s)² = 0.5 for the stated ~80–120 m and take the middle — s ≈
   * 0.693^0.5 / 100 ≈ 0.0083 by day, shipped as 0.0085: inside the band, and
   * leaving room for the day < dusk < night thickening every other spec in
   * this file uses. That lands day sight at 98 m against fog's 42 m — a
   * 2.35× split, which is a difference a seventeen-year-old reads off the
   * arrival screen without being told.
   *
   * AND THE SEPARATION HAS TO BE THIS ONE, not a prettier veil, because of
   * what the two lessons TEACH. sc-ac-fog step 5 is «виждаш 50 метра — значи
   * спирачният ти път … е под 50»: fog is a SIGHT envelope. sc-ac-snow says
   * nothing about sight and everything about grip («снегът държи около 40 %
   * от сухото — спирачката спира 2,5 пъти по-дълго»). A picture that renders
   * snow as a visibility bank teaches the student to pick their speed off
   * what they can SEE on a surface where that is exactly the wrong rule —
   * you can see perfectly well on ice. Making the snow street VISIBLE is the
   * safety content of this constant, not decoration.
   *
   * NO DRIVE WAS TAKEN ON THIS, SO IT SHIPS AS A FALSIFIABLE PREDICTION
   * RATHER THAN AS A PHOTOGRAPH — the R0 look is OWED, and saying so is worth
   * more than an R0 claim nobody can check. `fogWeather` was deliberately NOT
   * touched, so the fog lesson is an unmoved control and one re-drive settles
   * this. Depths were solved out of the frames above (FogExp2 f = 1−e^−(d·s)²,
   * inverted against the near-road scene colour 94/107/120 and the tone-mapped
   * veil 186.4/190.2/195.3): the mid rectangle (620,400 120×30) sits at ~46 m
   * and the far one (830,395 60×14) at ~73 m. Same rectangles, same frames,
   * next round:
   *                        BEFORE (w14)   PREDICTED     fog control (w13)
   *   mid road   L709        127.4          ~118            127.9
   *   far road   L709        150.8          ~135            153.1
   *   sky        L709        189.7          ~197            180.0
   *   sky        R−B          −8.9          ~−15             −9.3
   * i.e. snow-vs-fog goes from 0.4 % / 1.5 % / 5.4 % apart to roughly
   * 8 % / 12 % / 10 %, and the sign is the honest one: the SNOW street gets
   * DARKER at distance because the road is visible through the veil, while
   * the fog street stays a bright wall. If a re-drive shows the two still
   * within a few percent, this change is wrong and the residue is in
   * `SkyDome.tsx`'s SNOW_SKY_WASH / `SimEnvironment.tsx`'s SNOW_*_DIM, not
   * here.
   *
   * WHAT THIS CHANGE DOES NOT FIX, so the next reader does not re-derive it:
   * the CARRIAGEWAY is the surface still missing its snow, and since repair
   * wave 8 it is the ONLY one. This paragraph used to say the opposite — „the
   * pavements, kerbs, verges and parked cars still carry no snow … a snowed
   * road beside bare concrete", w14: road L106.3 against pavement L112.4 —
   * and that sentence went stale the day `StaticWorld.tsx` spread
   * `GROUND_SNOW` over the terrain and the sidewalks. It is corrected here
   * rather than deleted because it did not merely age: `sc-ac-snow:f1673b60`
   * was routed to THIS FILE on the strength of it, and a stale note that
   * addresses an audit row is a defect in a file whose comments are its
   * interface.
   *
   * RE-MEASURED 2026-08-31, same lesson, same drive, same rectangles, on the
   * SETTLED frame (`03-ready.png`) of w14 (`6399a8d`, before wave 8) against
   * w21 (`b224c7e`, after it), mean sRGB L709:
   *      carriageway (880,435 60×20)   124.5 → 122.9   (−1.3 %)
   *      pavement    (968,396 44×10)   158.0 → 169.3   (+7.2 %)
   * The pavement moved and the road did not, so the gap the old sentence
   * blamed on bare concrete is now the REVERSE gap — white pavement beside a
   * grey road, 1.38× apart — and the veil retune above did not cause it (the
   * carriageway is within 1.3 % of its pre-retune value; the veil moved the
   * far field, which is what it was aimed at).
   *
   * NOTHING IN THIS FILE CAN CLOSE THAT GAP, which is the part worth writing
   * down: every lever here — sun, hemisphere, exposure, veil colour, veil
   * density — lights the road and the pavement EQUALLY, so any of them moves
   * both and the ratio survives. The asymmetry is in HOW the two surfaces
   * take their snow. `world/textures/snowCover.ts` MIXES the ground materials
   * toward `SNOW_COVER_COLOR` at `SNOW_COVER_MAX` 0.85 per fragment, which
   * erases the dark texture underneath; the carriageway takes a neutral
   * MULTIPLY (`StaticWorld.tsx`'s `roadTint` = `wet.darken × ROAD_ALBEDO_TINT`),
   * which scales the asphalt map and therefore AMPLIFIES its variance — the
   * wheel-track wear and gutter grime baked into the road's vertex colours go
   * blotchy well before the surface goes white — where a mix compresses that
   * variance toward the snow colour, which is what lying snow physically does:
   * it covers. Reaching the pavement's neighbourhood from the multiply side
   * wants `SNOW_ROAD_BRIGHTEN ≈ 2.7` (0.72 × 2.7 × a ~0.28 asphalt texel,
   * inferred from the frame above, ≈ 0.55 against the pavement's ~0.75) — past
   * the `< 2` bound `weather.test.ts` pins, and it would ship the blotch. So
   * the remaining address is a per-fragment snow mix on the ASPHALT material,
   * capped below the pavement's 0.85 because a carriageway is trodden, and it
   * is not a constant in this file.
   *
   * THAT MIX SHIPPED 2026-09-02 and this paragraph is now a ROUTING, not a
   * request — kept whole because it is the derivation the constant was set
   * from, and re-deriving it is the cost this file keeps paying. It is
   * `snowCover.ts`'s `SNOW_ROAD_COVER_MAX` (0.40, off the same 0.28 texel and
   * the same 0.75 pavement worked here) spent by `roadSurface.ts` after
   * `<color_fragment>`, patch-modulated so the road reads as drifted and
   * trodden rather than as a paler grey. The ceiling is the MARKINGS, not the
   * pavement: 0.42 is where the brightest drift meets the grimiest stripe of
   * `markingWear.ts`'s grime octave, and `weather.ts`'s R0 criterion needs the
   * paint to stay the brightest thing in the carriageway. Its own R0 look is
   * still owed — and per the paragraph below, it must be taken on `03-ready`.
   *
   * AND DO NOT RE-CONVICT IT OFF AN `01-arrival` FRAME. In the w21 sweep that
   * capture lands before the ground materials settle (`usePbrSet` resolves the
   * asphalt/concrete/grass sets asynchronously and `StaticWorld` renders the
   * canvas fallback until they arrive), so the near carriageway photographs
   * ~30 % dark — sweep-wide, on dry lessons too. Ground band (700,390 400×110),
   * arrival vs ready: w21 sc-ac-snow 89.5 vs 125.8 and sc-ac-ice 84.9 vs 123.5,
   * where the same pair in w17 reads 125.3 vs 125.5 and 123.5 vs 123.8. A
   * finding measured on that frame is measuring the loader, not the weather.
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
 * rides the SAME cap — one view-aid law for every weather veil. It still bites
 * after the 2026-08-28 veil retune (0.0085 × 110 m ≈ 0.94 optical, above 0.75),
 * and it has to: what the cap bounds is the DENSITY × ALTITUDE product under a
 * topdown camera, not the veil's own strength, so a thinner veil moves the
 * bound further out rather than removing it.
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
    // Day snow: bright COLD white veil — 50 % transmittance at 98 m against
    // the fog bank's 42 m, so the street ahead SURVIVES the snowfall and does
    // not survive the fog. R−B = −15 (fog's is −9): now actually the colder
    // of the two, which the docblock has claimed since it was written.
    snowWeather: { color: "#eef4fd", density: 0.0085 },
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
    // Dusk snow: cold grey-blue veil, sight ~90 m. The sharpest of the three
    // splits and the cheapest: dusk FOG is a WARM bank (#aca7a3, R−B = +9)
    // and dusk snowfall is a cold one (R−B = −30), so the two dusk lessons
    // separate on hue before they separate on depth.
    snowWeather: { color: "#ccd8ea", density: 0.0092 },
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
    // Night snow: a faintly-lit cold BLUE-grey veil (headlights glitter into
    // the flakes), densest of the three snow specs — sight ~79 m against
    // night fog's ~35 m, the blindest thing this rig renders. Lifted above
    // night fog's #1a2028 in value as well as in hue: a snowfall throws the
    // headlights back at you, a fog bank swallows them.
    snowWeather: { color: "#2f3c50", density: 0.0105 },
    exposure: 0.95,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WINTER — THE SEASON, NOT A FOURTH TIME OF DAY AND NOT A WEATHER.
//
// sc-ac-ice („Черен лед") and sc-ac-bridge-ice („Мостът замръзва пръв") both
// open on «Ясна студена сутрин … около нулата» and both rendered the same
// high-summer afternoon this file's `day` preset describes: warm #fff3e0 key,
// warm brown ground bounce, #3f76c4 zenith. Measured 2026-08-28 across the two
// lessons' own `03-ready` frames (two DIFFERENT districts): sky
// 153.8/170.8/191.6 in both, facade 137.6/148.5/161.7 vs 137.5/148.5/161.6,
// canopy 73.4/97.4/75.5 vs 73.8/97.7/75.6. That is the audit row
// sc-ac-ice:5372f176 / sc-ac-bridge-ice:7eb16029.
//
// A GRADE, NOT A FOURTH PRESET, and the reason is the one `contracts.ts` gives
// for not spelling winter as a `TimeOfDay`: `TimeOfDay` is `Record`-keyed at
// `RainStreaks.tsx` and `SnowFlakes.tsx`, so widening that union turns an
// authoring change into a compile error in two render files — and a winter
// DUSK is a lesson someone will want. Season is orthogonal to hour, so it is
// a pure function OVER a preset and every time of day gets its winter for free.
//
// WHAT IS DELIBERATELY NOT CHANGED: the sun's ELEVATION. A Sofia winter noon
// really does run ~24°, but this file already carries the measurement that
// says a low sun here is a rendering defect, not realism — at 22° a 20 m
// building throws ~50 m across a ~16 m carriageway, every street sits wholly
// in the shade of its own west building line, and the frame reads as „no
// directional light at all" (the founder's „there are NO CAST SHADOWS
// anywhere"). 41° was measured as still not enough. So winter is carried by
// COLOUR and LEVEL, which is also the honest read of a clear morning at 0 °C:
// a winter street is pale and blue, not dark. The key:fill RATIO — doc 71's
// 3.5:1 invariant — is preserved exactly, because a clear cold morning is a
// CONTRASTY light; both halves are scaled by the same factor.
//
// `rainFog`, `fogWeather` and `snowWeather` are passed through untouched: the
// two lessons that author winter author no weather at all, and a graded veil
// nothing renders would be a value with no consumer.
// ═══════════════════════════════════════════════════════════════════════════

/** Key + fill scale under winter. Applied to BOTH so doc 71's 3.5:1 key:fill
 *  ratio survives the grade (day lands 1.44 : 0.39 = 3.7:1, unchanged). */
export const WINTER_LIGHT_SCALE = 0.78;
/** Tone-mapping exposure scale — a quarter-stop under the same sky. */
export const WINTER_EXPOSURE_SCALE = 0.95;
/** The cold white a winter key light is graded toward, and how far. */
export const WINTER_KEY_TINT = "#e6eefc";
export const WINTER_KEY_MIX = 0.75;
/** The hemisphere SKY fill: paler, colder, higher-albedo winter dome. */
export const WINTER_SKY_FILL_TINT = "#cddff5";
export const WINTER_SKY_FILL_MIX = 0.5;
/** The hemisphere GROUND bounce — THE warm-facade term. Frozen ground and
 *  dead grass bounce cold grey; the summer presets bounce warm brown
 *  (#4d4740), and that single colour is most of why the ice frames read July
 *  on every vertical surface in shot. */
export const WINTER_GROUND_BOUNCE_TINT = "#586470";
export const WINTER_GROUND_BOUNCE_MIX = 0.8;
/** Sky dome: a paler, milkier blue overhead and a cooler horizon band. */
export const WINTER_ZENITH_TINT = "#9fbcda";
export const WINTER_ZENITH_MIX = 0.55;
export const WINTER_HORIZON_TINT = "#e9eff6";
export const WINTER_HORIZON_MIX = 0.6;
/** Extra cloud deck (clamped at 0.9 — a fully covered dome loses the sun
 *  disc the low-sun read depends on). */
export const WINTER_CLOUD_COVER_ADD = 0.18;
export const WINTER_CLOUD_COVER_MAX = 0.9;
export const WINTER_CLOUD_TINT = "#e6ecf4";
export const WINTER_CLOUD_MIX = 0.5;
/** Vitosha wears snow from about 1400 m up from December — the ridge is the
 *  one element of this grade that gets BRIGHTER, and it is the cheapest
 *  „this is winter" cue on any Sofia street with a horizon. */
export const WINTER_RIDGE_TINT = "#dfe8f2";
export const WINTER_RIDGE_MIX = 0.55;
/** Cold air holds less water but scatters harder at a low sun: the clear-day
 *  haze goes pale-blue and thickens by a third (day 0.0026 → 0.0035, still far
 *  above the 0.002552 floor groundBackdrop.test.ts pins). */
export const WINTER_HAZE_TINT = "#dbe6f0";
export const WINTER_HAZE_MIX = 0.6;
export const WINTER_HAZE_DENSITY_SCALE = 1.35;
/** A low winter sun sits in more air: a wider, softer glow around the disc. */
export const WINTER_SUN_GLOW_SCALE = 1.2;

/** `#rrggbb` → [0..255, 0..255, 0..255]. Local, because this module keeps its
 *  no-three.js promise (vitest runs it in plain Node). */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

/**
 * Blend two `#rrggbb` targets in sRGB. sRGB and not linear on purpose: every
 * value in this file is an ART TARGET the React layer converts to
 * THREE.Color, and the presets beside it were picked by eye in the same space
 * — a linear mix here would grade toward a colour no one chose.
 */
export function mixHex(from: string, to: string, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

/**
 * The WINTER grade of any time-of-day preset. Pure and total: same input,
 * same output, no three.js, no module state — `presets.test.ts` exercises it
 * in plain Node the way it exercises `sunDirection`.
 *
 * READ BY: `SimEnvironment` (light rig, fog, exposure) and `SkyDome` (dome
 * gradient, clouds, ridge), both gated on the `winter` prop `LessonScene`
 * forwards from `LessonSpec.environment.winter`. It is the LIGHT half of the
 * season; the FOLIAGE half is `world/textures/snowCover.ts`'s dormancy term,
 * driven by `DistrictWorld`. Neither closes the audit row alone: a winter
 * light grade under full-leaf green canopies still photographs as July.
 */
export function winterGrade(preset: EnvironmentPreset): EnvironmentPreset {
  return {
    ...preset,
    sky: {
      ...preset.sky,
      zenith: mixHex(preset.sky.zenith, WINTER_ZENITH_TINT, WINTER_ZENITH_MIX),
      horizon: mixHex(preset.sky.horizon, WINTER_HORIZON_TINT, WINTER_HORIZON_MIX),
      sunTint: mixHex(preset.sky.sunTint, WINTER_KEY_TINT, WINTER_KEY_MIX),
      sunGlowIntensity: preset.sky.sunGlowIntensity * WINTER_SUN_GLOW_SCALE,
      cloudCover: Math.min(
        WINTER_CLOUD_COVER_MAX,
        preset.sky.cloudCover + WINTER_CLOUD_COVER_ADD,
      ),
      cloudColor: mixHex(preset.sky.cloudColor, WINTER_CLOUD_TINT, WINTER_CLOUD_MIX),
      ridgeColor: mixHex(preset.sky.ridgeColor, WINTER_RIDGE_TINT, WINTER_RIDGE_MIX),
    },
    light: {
      sun: {
        ...preset.light.sun,
        color: mixHex(preset.light.sun.color, WINTER_KEY_TINT, WINTER_KEY_MIX),
        intensity: preset.light.sun.intensity * WINTER_LIGHT_SCALE,
      },
      hemisphere: {
        skyColor: mixHex(
          preset.light.hemisphere.skyColor,
          WINTER_SKY_FILL_TINT,
          WINTER_SKY_FILL_MIX,
        ),
        groundColor: mixHex(
          preset.light.hemisphere.groundColor,
          WINTER_GROUND_BOUNCE_TINT,
          WINTER_GROUND_BOUNCE_MIX,
        ),
        intensity: preset.light.hemisphere.intensity * WINTER_LIGHT_SCALE,
      },
    },
    fog: {
      color: mixHex(preset.fog.color, WINTER_HAZE_TINT, WINTER_HAZE_MIX),
      density: preset.fog.density * WINTER_HAZE_DENSITY_SCALE,
    },
    exposure: preset.exposure * WINTER_EXPOSURE_SCALE,
  };
}

/** The preset a scene actually renders: the time of day, graded by season. */
export function environmentPreset(timeOfDay: TimeOfDay, winter = false): EnvironmentPreset {
  const base = ENVIRONMENT_PRESETS[timeOfDay];
  return winter ? winterGrade(base) : base;
}
