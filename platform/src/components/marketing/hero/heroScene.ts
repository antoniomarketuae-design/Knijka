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
 *
 * WHERE THE ROAD ITSELF NOW LIVES. The lane widths, the dash cadence, the
 * pinhole projection and the Vitosha crest moved to `@/lib/visual/roadPlate`
 * when the authenticated app asked for the SAME road from the driver's seat
 * (components/deck). Nothing about the hero changed: every name this module
 * used to own is re-exported below with the identical value, and the plate's
 * camera is one of that module's `PlateCamera`s. What changed is that there is
 * now exactly one definition of where a Bulgarian lane line goes, instead of
 * one per surface that draws one.
 */

import {
  dashesOnPlate,
  HERO_PLATE_CAMERA,
  ROAD_DASH_GAP_M,
  ROAD_DASH_MARK_M,
  ROAD_DASH_PERIOD_M,
  ROAD_LANE_WIDTH_M,
  ROAD_MARK_WIDTH_M,
  ROAD_WIDTH_M,
  azimuthXOnPlate,
  elevationYOnPlate,
  projectOnPlate,
  type PlateDash,
} from "@/lib/visual/roadPlate";

export {
  PLATE_RIDGE_AZ_FROM,
  PLATE_RIDGE_AZ_STEP,
  PLATE_RIDGE_AZ_TO,
  PLATE_RIDGE_POINTS,
} from "@/lib/visual/roadPlate";
export type { PlateDash } from "@/lib/visual/roadPlate";

// ---------------------------------------------------------------------------
// Road geometry — real Bulgarian dimensions, not the simulator's
// ---------------------------------------------------------------------------

/**
 * Lane width, m. See `ROAD_LANE_WIDTH_M` for why the marketing shot uses the
 * real 3.25 m rather than the simulator's perceptually-scaled 8.125 m.
 */
export const HERO_LANE_WIDTH_M = ROAD_LANE_WIDTH_M;

/** Two lanes plus a shoulder each side — as wide as the shot ever needs. */
export const HERO_ROAD_WIDTH_M = ROAD_WIDTH_M;

/**
 * Road length, m. Long enough that its far end is buried in the dusk fog
 * (density 0.0032 → ~93 % opaque at 320 m) rather than ending on camera.
 */
export const HERO_ROAD_LENGTH_M = 320;

/** Broken centre line: 3 m of paint, 9 m of gap — the real urban cadence. */
export const HERO_DASH_MARK_M = ROAD_DASH_MARK_M;
export const HERO_DASH_GAP_M = ROAD_DASH_GAP_M;
export const HERO_DASH_PERIOD_M = ROAD_DASH_PERIOD_M;
/** Painted line width, m. */
export const HERO_MARK_WIDTH_M = ROAD_MARK_WIDTH_M;

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

// ---------------------------------------------------------------------------
// The pre-rendered loop — the same shot, for devices that never get the 3D
// ---------------------------------------------------------------------------

/**
 * THE WINDOW OF THE SHOT THAT BECOMES A VIDEO.
 *
 * A phone gets the plate (heroCapability.ts) and the plate is still, which the
 * founder read as broken. The fix is a few seconds of this exact scene,
 * rendered offline at real GPU quality by tools/clips/headless/
 * render-hero-loop.mjs and shipped as one small file. Everything below picks
 * WHICH seconds, and the choice is entirely about making the seam invisible —
 * a hero loop is watched for a minute, so a visible cut every few seconds is
 * worse than no motion at all.
 *
 * Two things have to line up at the seam, and they have incommensurable
 * periods:
 *
 *   the ROAD repeats every dash period — 12 m at 48 km/h = 0.9 s,
 *   the CAMERA repeats every HERO_LOOP_S = 26 s.
 *
 * 26 and 0.9 have a least common multiple of 234 s, so "render one full cycle
 * of both" is not an option at any sane file size. Instead:
 *
 *   LENGTH — an exact whole number of dash periods, so the painted lines land
 *   in the same place on the last frame as on the first. This is the one that
 *   would be unmissable: the dashes are the only hard-edged high-contrast
 *   thing in the frame, and a fractional-period loop makes them jump.
 *
 *   POSITION — centred on the camera move's turning point (phase 0.5, where
 *   `pingPong` peaks). `pingPong` is symmetric about its extremum, so
 *   pose(centre − x) === pose(centre + x) EXACTLY: the last frame's camera is
 *   the first frame's camera, to the bit. What the seam does NOT preserve is
 *   the camera's VELOCITY, which reverses there — but inside this window the
 *   dolly runs at ~0.28 m/s against an 11 m subject distance, so the reversal
 *   reads as the second half of a breath rather than as a bounce. Widening the
 *   window would make that reversal faster, not slower; shortening it costs
 *   dash periods. Eight is the balance point.
 *
 * The wheels are the one thing left over: their period is 2πr/v ≈ 0.16 s,
 * irrational against the dash period, so the seam pops the tyres by ~23°. At
 * 6.2 revolutions per second sampled at 25 fps they are already an aliased
 * blur 10 m from the camera, and 23° is under a third of a frame's worth of
 * apparent motion. It is not visible and it is not fixable — see the header of
 * render-hero-loop.mjs for the arithmetic.
 */
export const HERO_LOOP_VIDEO_DASH_PERIODS = 8;

/**
 * Frame rate of the pre-rendered loop.
 *
 * 25 rather than 30 because it divides the length into a whole number of
 * frames (7.2 s × 25 = 180) — a fractional frame count would either drop the
 * seam frame or duplicate it, and either one is a stutter once a second. It is
 * also 17 % fewer frames to encode, which is 17 % fewer bytes on a phone.
 */
export const HERO_LOOP_VIDEO_FPS = 25;

/** Length of the loop, s — a whole number of dash periods, by construction. */
export const HERO_LOOP_VIDEO_SECONDS =
  (HERO_LOOP_VIDEO_DASH_PERIODS * HERO_DASH_PERIOD_M) / kmhToMps(HERO_SPEED_KMH);

/**
 * Frames in the loop.
 *
 * Frame `HERO_LOOP_VIDEO_FRAMES` is deliberately NOT rendered: it is frame 0
 * again (that is what "seamless" means), and encoding it would hold the same
 * image for two frame slots once per cycle — a hitch the eye reads as a
 * dropped frame.
 */
export const HERO_LOOP_VIDEO_FRAMES = Math.round(
  HERO_LOOP_VIDEO_SECONDS * HERO_LOOP_VIDEO_FPS,
);

/** Scene time the window is centred on — the camera move's turning point. */
export const HERO_LOOP_VIDEO_CENTRE_S = HERO_LOOP_S / 2;

/**
 * Scene time to render frame `index` at, s.
 *
 * Pure, so the offline renderer never has to reimplement the window: the dev
 * capture route publishes `heroLoopVideoTime(i)` for every i and the Playwright
 * driver just seeks to the numbers it is handed. One definition, one shot.
 */
export function heroLoopVideoTime(index: number): number {
  const start = HERO_LOOP_VIDEO_CENTRE_S - HERO_LOOP_VIDEO_SECONDS / 2;
  return start + (index * HERO_LOOP_VIDEO_SECONDS) / HERO_LOOP_VIDEO_FRAMES;
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
export const PLATE_HORIZON_Y = HERO_PLATE_CAMERA.horizonY;
/** Where the centre line converges: dead ahead, which is due south. */
export const PLATE_VANISHING_X = HERO_PLATE_CAMERA.vanishingX;
/** Eye height of the plate's virtual camera, m — mid-way through the 3D move. */
export const PLATE_CAM_HEIGHT_M = HERO_PLATE_CAMERA.eyeHeightM;
/**
 * Focal length in viewBox units. Chosen so the road reaches the bottom edge
 * at ~4 m: `PLATE_HORIZON_Y + f·h/z = PLATE_VIEWBOX_H` at z = 4.
 */
export const PLATE_FOCAL_PX = HERO_PLATE_CAMERA.focalPx;

/**
 * Vertical half-angle the plate's pinhole subtends, degrees — everything a
 * caller needs to place something by its real angular size instead of by eye.
 * `y = PLATE_HORIZON_Y − f·tan(elevation)` for anything above the horizon,
 * which is how the Vitosha crest lands at its true 6.6°.
 */
export function plateElevationY(elevationDeg: number): number {
  return elevationYOnPlate(HERO_PLATE_CAMERA, elevationDeg);
}

/** …and the same for azimuth, degrees from dead ahead, positive toward +X. */
export function plateAzimuthX(azimuthDeg: number): number {
  return azimuthXOnPlate(HERO_PLATE_CAMERA, azimuthDeg);
}

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
  return projectOnPlate(HERO_PLATE_CAMERA, lateralM, heightM, distanceM);
}

/**
 * The visible run of centre-line dashes, nearest first. See `dashesOnPlate`
 * for why the sliver cut-off is as small as it is.
 */
export function plateDashes(startM = 3.2, minPx = 0.25): PlateDash[] {
  return dashesOnPlate(HERO_PLATE_CAMERA, startM, minPx);
}
