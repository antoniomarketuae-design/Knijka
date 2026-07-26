/**
 * The hero shot, as numbers.
 *
 * Everything the live scene animates lives here as pure functions of elapsed
 * seconds — no three.js, no React (the presets.ts / skyShader.ts split, for
 * the same reason), so vitest can pin the choreography in plain Node. The
 * component is then only wiring: read a pose, write it to the camera.
 *
 * WHY A LOOP AND NOT A ONE-SHOT. A landing hero is watched for four seconds
 * by most visitors and for forty by the founder's mother. A one-shot move
 * either ends (dead frame) or restarts (visible cut). Every function here is
 * periodic and C¹-continuous across the seam — see `heroCameraPose` — so the
 * shot can run forever with no cut and no drift.
 *
 * WHY THE CAR NEVER MOVES. The car sits at the origin and the ROAD scrolls
 * underneath it. That is what keeps this a marketing prop instead of the
 * simulator: no physics, no world streaming, no rule engine, and float
 * precision that cannot degrade because nothing accumulates (both scroll
 * functions wrap).
 */

// ---------------------------------------------------------------------------
// Road geometry — real Bulgarian dimensions, not the simulator's
// ---------------------------------------------------------------------------

/**
 * Lane width, m. The simulator multiplies its 3.25 m base by
 * PERCEPTUAL_ROAD_SCALE = 2.5 (a founder call, `sim/contracts.ts`), which
 * docs/simulation/82 §1.2 item 3 names as the single biggest reason the sim
 * reads as an oversized toy world: 8.125 m lanes beside a real-size car with
 * no human-scale reference. The marketing shot has no lane-discipline
 * grading to satisfy, so it uses the REAL number and gets the human scale
 * the audit says is missing.
 */
export const HERO_LANE_WIDTH_M = 3.25;

/** Two lanes plus a shoulder each side — as wide as the shot ever needs. */
export const HERO_ROAD_WIDTH_M = HERO_LANE_WIDTH_M * 2 + 2.4;

/**
 * Road length, m. Long enough that its far end is buried in the dusk fog
 * (density 0.0032 → ~93 % opaque at 320 m) rather than ending on camera.
 */
export const HERO_ROAD_LENGTH_M = 320;

/** Broken centre line: 3 m of paint, 9 m of gap — the real urban cadence. */
export const HERO_DASH_MARK_M = 3;
export const HERO_DASH_GAP_M = 9;
export const HERO_DASH_PERIOD_M = HERO_DASH_MARK_M + HERO_DASH_GAP_M;
/** Painted line width, m. */
export const HERO_MARK_WIDTH_M = 0.15;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Cruising speed, km/h. 48 is the honest number for the shot: fast enough
 * that the dashes stream, slow enough that a 17-year-old reading the headline
 * is not being sold speeding by a driving school.
 */
export const HERO_SPEED_KMH = 48;

/** Tyre radius, m — the hero car's, so the wheels roll at the right rate. */
export const HERO_WHEEL_RADIUS_M = 0.34;

/** One full camera cycle, s. Long enough that the move reads as a drift. */
export const HERO_LOOP_S = 26;

export function kmhToMps(kmh: number): number {
  return (kmh * 1000) / 3600;
}

/**
 * Metres of road that have passed under the car, wrapped into one dash
 * period.
 *
 * The wrap is load-bearing, not tidiness: this feeds a float uniform, and an
 * unwrapped metre count reaches 10⁵ inside an hour, where a 32-bit float can
 * no longer resolve the 0.01 m steps between frames and the dashes visibly
 * stutter. Wrapped, the uniform never leaves [0, 12) and the pattern is
 * indistinguishable — `fract()` in the shader cannot tell the difference.
 */
export function roadScrollM(tSec: number, speedKmh: number = HERO_SPEED_KMH): number {
  const travelled = kmhToMps(speedKmh) * tSec;
  const wrapped = travelled % HERO_DASH_PERIOD_M;
  return wrapped < 0 ? wrapped + HERO_DASH_PERIOD_M : wrapped;
}

/**
 * Wheel roll angle, rad, wrapped into one turn — same float-precision reason
 * as `roadScrollM`, and a wrapped angle is what three's Euler wants anyway.
 */
export function wheelSpinRad(tSec: number, speedKmh: number = HERO_SPEED_KMH): number {
  const TAU = Math.PI * 2;
  const angle = (kmhToMps(speedKmh) * tSec) / HERO_WHEEL_RADIUS_M;
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * THE SHOT FACES SOUTH, and that is a content decision, not a coordinate
 * accident. The sky dome puts the Vitosha massif at due south (+Z — see
 * skyShader.ts `VITOSHA_HUMPS`, "0 = due south"), and the dusk sun sits at
 * azimuth 262°, i.e. nearly due west. Drive south at dusk and you get the
 * 2,290 m ridge at the end of the road with the warm sun off the right
 * shoulder. Drive north — which is what the simulator's maps do — and the
 * hero is a road into an empty gradient. doc 82 §1.2 item 6 calls the missing
 * massif the "flat-earth test level" tell and the reason the sim reads as
 * generic-nowhere rather than as Bulgaria; the landing page is the last place
 * that can afford to read as nowhere.
 *
 * So: the car faces +Z, the camera sits on the −Z side, and screen-right is
 * world −X (facing +Z with +Y up, right = forward × up = −X).
 *
 * Camera azimuth, rad, measured from dead astern of the car (azimuth 0 puts
 * the camera at −Z) and increasing toward world +X, which is screen-LEFT —
 * so a positive sweep is what parks the car in the right third of frame. The
 * sweep stays in the rear quarter on purpose: a landing hero that orbits to
 * the nose turns into a car advert, and this product is not selling the car —
 * the shot has to keep the ROAD in frame, because the road is what the
 * student is being taught to read.
 */
export const HERO_CAM_AZIMUTH_RAD: readonly [number, number] = [0.5, 0.16];
/** Camera distance from the car, m — closes in as the move settles. */
export const HERO_CAM_RADIUS_M: readonly [number, number] = [13.5, 10.5];
/** Camera height, m — drops toward the tarmac, which is what sells speed. */
export const HERO_CAM_HEIGHT_M: readonly [number, number] = [2.6, 1.5];

/**
 * Where the camera looks. Height 0.85 m is roof-line rather than roof-top, so
 * the vanishing point sits in the upper third and the road, not the sky, owns
 * the middle of the frame.
 */
export const HERO_LOOK_HEIGHT_M = 0.85;
/** Look ahead of the car (south, +Z) so the road opens up in front of it, m. */
export const HERO_LOOK_AHEAD_M = 16;
/**
 * Lateral bias of the look target, m, relative to the car's own lane.
 * POSITIVE is world +X, which is screen-left when facing south — aiming left
 * pushes the CAR into the right third, which is the composition the headline
 * column on the left assumes. Flip the sign if the copy ever moves.
 */
export const HERO_LOOK_X_M = 2.4;

/**
 * The car's lane, metres in world X.
 *
 * Facing south (+Z) with +Y up, screen-right is −X, so the RIGHT-hand lane —
 * the one Bulgaria drives in — is at negative X. It is half a lane off the
 * centre line. This is not pedantry on a marketing image: a driving school
 * whose hero car straddles the centre line has failed the only test that
 * matters (docs/00: does it produce safer drivers), and a 17-year-old who
 * has just learned lane discipline will notice.
 */
export const HERO_LANE_X_M = -HERO_LANE_WIDTH_M / 2;

/** A plain-array pose so this module stays three-free. */
export interface HeroCameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/**
 * Smooth ping-pong on [0, 1] with a period of 1.
 *
 * `0.5 − 0.5·cos(2πp)` rather than a triangle wave because both the value AND
 * its derivative are continuous at p = 0, which is what makes the loop seam
 * invisible: a triangle wave holds the same positions but reverses direction
 * instantaneously, and the eye reads that as a bounce.
 */
export function pingPong(p: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The camera pose at `tSec`. Periodic with period HERO_LOOP_S. */
export function heroCameraPose(tSec: number): HeroCameraPose {
  // Modulo twice so a negative t (a clock reset, a paused tab resuming) still
  // lands in [0, 1) instead of mirroring the move.
  const phase = (((tSec % HERO_LOOP_S) + HERO_LOOP_S) % HERO_LOOP_S) / HERO_LOOP_S;
  const s = pingPong(phase);

  const azimuth = lerp(HERO_CAM_AZIMUTH_RAD[0], HERO_CAM_AZIMUTH_RAD[1], s);
  const radius = lerp(HERO_CAM_RADIUS_M[0], HERO_CAM_RADIUS_M[1], s);
  const height = lerp(HERO_CAM_HEIGHT_M[0], HERO_CAM_HEIGHT_M[1], s);

  return {
    // Astern is −Z: the car drives south (+Z), so the camera trails it — and
    // it trails it IN ITS LANE, which is why both x values carry the offset.
    position: [
      HERO_LANE_X_M + Math.sin(azimuth) * radius,
      height,
      -Math.cos(azimuth) * radius,
    ],
    target: [HERO_LANE_X_M + HERO_LOOK_X_M, HERO_LOOK_HEIGHT_M, HERO_LOOK_AHEAD_M],
  };
}

/**
 * Field of view, degrees. Wider than the simulator's chase camera: a long
 * lens on an empty road flattens into a poster, and the whole point of paying
 * for WebGL here is the parallax a wide lens gives as the camera closes in.
 */
export const HERO_CAM_FOV_DEG = 46;
/** Near/far planes, m. Far sits just inside the sky dome. */
export const HERO_CAM_NEAR_M = 0.3;
export const HERO_CAM_FAR_M = 900;

// ---------------------------------------------------------------------------
// The plate — the same road, projected by hand
// ---------------------------------------------------------------------------

/**
 * The zero-JS plate is drawn with the SAME geometry the WebGL scene renders,
 * put through a pinhole projection here instead of through a GPU. That is the
 * whole reason these numbers live beside the camera rig rather than inside
 * the SVG: when the 3D fades in over the plate, the horizon, the vanishing
 * point and the dash cadence have to land in the same place, or the crossfade
 * reads as a cut. One dash period, one lane width, two renderers.
 *
 * All of it runs on the server (HeroPlate is not a Client Component), so the
 * arithmetic below costs the browser nothing at all.
 */
/**
 * 2.5 : 1 — a hero BAND, not a 16:9 frame. The SVG is drawn with
 * `preserveAspectRatio=slice`, so whichever axis is short gets cropped; a
 * 16:9 viewBox inside a typical 1440×600 hero would be scaled by width and
 * lose a third of its height, which is how a carefully placed horizon ends up
 * off-screen and a car ends up filling the frame.
 */
export const PLATE_VIEWBOX_W = 1600;
export const PLATE_VIEWBOX_H = 640;
/** Horizon height in viewBox units — 39 % down, leaving sky for the ridge. */
export const PLATE_HORIZON_Y = 250;
/** Where the centre line converges: dead ahead, which is due south. */
export const PLATE_VANISHING_X = 1000;
/** Eye height of the plate's virtual camera, m — mid-way through the 3D move. */
export const PLATE_CAM_HEIGHT_M = 1.6;
/**
 * Focal length in viewBox units. Chosen so the road reaches the bottom edge
 * at ~4 m: `PLATE_HORIZON_Y + f·h/z = PLATE_VIEWBOX_H` at z = 4.
 */
export const PLATE_FOCAL_PX = 975;

/**
 * Vertical half-angle the plate's pinhole subtends, degrees — everything a
 * caller needs to place something by its real angular size instead of by eye.
 * `y = PLATE_HORIZON_Y − f·tan(elevation)` for anything above the horizon,
 * which is how the Vitosha crest lands at its true 6.6°.
 */
export function plateElevationY(elevationDeg: number): number {
  return PLATE_HORIZON_Y - PLATE_FOCAL_PX * Math.tan((elevationDeg * Math.PI) / 180);
}

/** …and the same for azimuth, degrees from dead ahead, positive toward +X. */
export function plateAzimuthX(azimuthDeg: number): number {
  return PLATE_VANISHING_X + PLATE_FOCAL_PX * Math.tan((azimuthDeg * Math.PI) / 180);
}

/**
 * The Vitosha crest, in plate coordinates.
 *
 * GENERATED, not drawn: each point is `ridgeElevationDeg()` from
 * sim/environment/skyShader.ts — the exact function the sky dome's fragment
 * shader evaluates — sampled every 2° of azimuth from 34° east of south to
 * 48° west of it, and projected through `plateAzimuthX`/`plateElevationY`.
 * The shader measures azimuth positive toward the WEST while the plate
 * measures x positive toward +X (east), hence the sign flip in the generator.
 *
 * It is inlined rather than computed because HeroPlate is a Server Component
 * whose entire value is costing the client zero JavaScript, and importing the
 * sim's public barrel from it would drag that module's client boundaries into
 * the landing page's manifest for four dozen numbers.
 *
 * Drift is impossible anyway: `__tests__/heroScene.test.ts` recomputes the
 * whole list from `ridgeElevationDeg` and fails if a single point moves. To
 * regenerate, read that test — it contains the generator.
 */
export const PLATE_RIDGE_POINTS: readonly (readonly [number, number])[] = [
  [-82.8, 240.7], [-9.6, 237.7], [58.5, 233.1], [122.1, 226.7], [181.9, 218.7],
  [238.2, 209], [291.6, 198], [342.4, 186.2], [390.8, 174.3], [437.1, 163],
  [481.6, 152.9], [524.5, 144.5], [565.9, 138], [606.1, 133.5], [645.1, 130.6],
  [683.2, 128.9], [720.4, 128], [756.9, 127.5], [792.8, 127.2], [828.1, 127.1],
  [863, 127.3], [897.5, 128.1], [931.8, 129.6], [966, 131.9], [1000, 135],
  [1034, 138.7], [1068.2, 142.6], [1102.5, 146.4], [1137, 149.8], [1171.9, 152.4],
  [1207.2, 154.5], [1243.1, 156.4], [1279.6, 158.4], [1316.8, 161.3], [1354.9, 165.6],
  [1393.9, 171.5], [1434.1, 179.1], [1475.5, 188], [1518.4, 197.8], [1562.9, 207.7],
  [1609.2, 217.1], [1657.6, 225.4],
];

/** Azimuth sampling the ridge points were generated at (degrees, west-positive). */
export const PLATE_RIDGE_AZ_FROM = -34;
export const PLATE_RIDGE_AZ_TO = 48;
export const PLATE_RIDGE_AZ_STEP = 2;

/**
 * Project a point on (or above) the road into plate coordinates.
 *
 * @param lateralM  metres right of the centre line (negative = left)
 * @param heightM   metres above the road surface
 * @param distanceM metres ahead of the camera; must be > 0
 */
export function plateProject(
  lateralM: number,
  heightM: number,
  distanceM: number,
): readonly [number, number] {
  const z = Math.max(distanceM, 0.01);
  return [
    PLATE_VANISHING_X + (PLATE_FOCAL_PX * lateralM) / z,
    PLATE_HORIZON_Y + (PLATE_FOCAL_PX * (PLATE_CAM_HEIGHT_M - heightM)) / z,
  ];
}

/** One painted dash of the broken centre line, already projected. */
export interface PlateDash {
  /** Screen y of the near (bottom) end and the far (top) end. */
  yNear: number;
  yFar: number;
  /** Half-width in viewBox units at each end — the taper that IS perspective. */
  halfNear: number;
  halfFar: number;
  /** Centre x at each end (the centre line is at lateral 0, so both = VP x). */
  x: number;
}

/**
 * The visible run of centre-line dashes, nearest first.
 *
 * Stops when a dash is shorter than `minPx` viewBox units. The default is
 * deliberately small: the plate is vector, so a quarter-unit sliver still
 * resolves on a 4K panel and it is what makes the last stretch of road read
 * as a converging line rather than as six dashes and then nothing. The
 * plate's paint gradient has already faded that far run to near-zero opacity,
 * so the cost is a few hundred bytes of path data and no visual noise.
 *
 * Nothing here depends on time — the plate is deliberately still, because it
 * is what a reduced-motion visitor sees.
 */
export function plateDashes(startM = 3.2, minPx = 0.25): PlateDash[] {
  const out: PlateDash[] = [];
  const halfMark = HERO_MARK_WIDTH_M / 2;
  for (let i = 0; i < 64; i += 1) {
    const near = startM + i * HERO_DASH_PERIOD_M;
    const far = near + HERO_DASH_MARK_M;
    const [, yNear] = plateProject(0, 0, near);
    const [, yFar] = plateProject(0, 0, far);
    if (yNear - yFar < minPx) break;
    out.push({
      yNear,
      yFar,
      halfNear: (PLATE_FOCAL_PX * halfMark) / near,
      halfFar: (PLATE_FOCAL_PX * halfMark) / far,
      x: PLATE_VANISHING_X,
    });
  }
  return out;
}
