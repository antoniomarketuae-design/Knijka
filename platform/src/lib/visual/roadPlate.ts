/**
 * A ROAD AT DUSK, AS NUMBERS — shared by every surface that draws one.
 *
 * This file exists because a second surface asked for the same picture. The
 * landing hero drew a Bulgarian road under a Vitosha crest by hand
 * (components/marketing/hero/heroScene.ts), and the authenticated app now
 * wants the SAME road behind its instruments — seen from the driver's seat
 * rather than from a chase camera.
 *
 * Two ways to do that. Copy the projection into the dashboard, and own two
 * drawings of one road that drift apart the first time anybody nudges a lane
 * width. Or lift the geometry to a neutral module and give each surface its
 * own CAMERA over it. This is the second one.
 *
 * WHY IT LIVES OUTSIDE components/marketing. That barrel's contract is
 * explicit: "Nothing here may import from the authenticated app, and nothing
 * there may import from here." The (dashboard) group is the authenticated app,
 * so it may not reach into the hero — and the hero's road is not a marketing
 * asset anyway, it is the product's own metaphor. `src/lib/visual` is the
 * neutral ground both may stand on. heroScene.ts re-exports every name it used
 * to own, so the marketing surface's public API is byte-for-byte what it was.
 *
 * Pure data & math: no DOM, no three.js, no React. Every consumer here is a
 * Server Component, so all of this runs at build/request time and costs the
 * browser nothing at all.
 */

// ---------------------------------------------------------------------------
// Road geometry — real Bulgarian dimensions, not the simulator's
// ---------------------------------------------------------------------------

/**
 * Lane width, m. The simulator multiplies its 3.25 m base by
 * PERCEPTUAL_ROAD_SCALE = 2.5 (a founder call, `sim/contracts.ts`), which
 * docs/simulation/82 §1.2 item 3 names as the single biggest reason the sim
 * reads as an oversized toy world. A DRAWN road has no lane-discipline grading
 * to satisfy, so it uses the REAL number and gets the human scale back.
 */
export const ROAD_LANE_WIDTH_M = 3.25;

/** Two lanes plus a shoulder each side — as wide as any of these shots needs. */
export const ROAD_WIDTH_M = ROAD_LANE_WIDTH_M * 2 + 2.4;

/** Broken centre line: 3 m of paint, 9 m of gap — the real urban cadence. */
export const ROAD_DASH_MARK_M = 3;
export const ROAD_DASH_GAP_M = 9;
export const ROAD_DASH_PERIOD_M = ROAD_DASH_MARK_M + ROAD_DASH_GAP_M;
/** Painted line width, m. */
export const ROAD_MARK_WIDTH_M = 0.15;

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/**
 * A pinhole camera on the road, expressed in the coordinates of the SVG that
 * will draw it.
 *
 * Four numbers is the whole model, and that is the point: a surface that wants
 * this road from a different seat changes these four and nothing else. The
 * projection, the dash run, the ridge and the angular helpers all follow.
 */
export interface PlateCamera {
  /** viewBox x the centre line converges to — dead ahead. */
  vanishingX: number;
  /** viewBox y of the horizon. Also the eye's own height on screen. */
  horizonY: number;
  /** Focal length in viewBox units. Larger = longer lens = flatter road. */
  focalPx: number;
  /** Eye height above the road surface, m. */
  eyeHeightM: number;
}

/**
 * Project a point on (or above) the road into this camera's viewBox.
 *
 * @param lateralM  metres right of the centre line (negative = left)
 * @param heightM   metres above the road surface
 * @param distanceM metres ahead of the camera; must be > 0
 */
export function projectOnPlate(
  cam: PlateCamera,
  lateralM: number,
  heightM: number,
  distanceM: number,
): readonly [number, number] {
  const z = Math.max(distanceM, 0.01);
  return [
    cam.vanishingX + (cam.focalPx * lateralM) / z,
    cam.horizonY + (cam.focalPx * (cam.eyeHeightM - heightM)) / z,
  ];
}

/**
 * viewBox y of a given ELEVATION above the horizon, degrees — everything a
 * caller needs to place something by its real angular size instead of by eye.
 * This is how the Vitosha crest lands at its true 6.6°.
 */
export function elevationYOnPlate(cam: PlateCamera, elevationDeg: number): number {
  return cam.horizonY - cam.focalPx * Math.tan((elevationDeg * Math.PI) / 180);
}

/** …and the same for azimuth, degrees from dead ahead, positive toward +X. */
export function azimuthXOnPlate(cam: PlateCamera, azimuthDeg: number): number {
  return cam.vanishingX + cam.focalPx * Math.tan((azimuthDeg * Math.PI) / 180);
}

/**
 * Re-aim a point drawn for one camera at another.
 *
 * The inverse of the two helpers above, then the forward pair. It is exact —
 * both cameras are pinholes looking dead ahead at the same world, so a point is
 * fully described by the (azimuth, elevation) it subtends, and that pair is
 * camera-independent. This is what lets the deck reuse the crest the hero
 * plate ships without re-deriving it from the sky shader, and it is why the two
 * surfaces cannot disagree about where a mountain is.
 */
export function reprojectPlatePoint(
  from: PlateCamera,
  to: PlateCamera,
  point: readonly [number, number],
): readonly [number, number] {
  const tanAz = (point[0] - from.vanishingX) / from.focalPx;
  const tanEl = (from.horizonY - point[1]) / from.focalPx;
  return [to.vanishingX + to.focalPx * tanAz, to.horizonY - to.focalPx * tanEl];
}

// ---------------------------------------------------------------------------
// The broken centre line
// ---------------------------------------------------------------------------

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
 * deliberately small: these plates are vector, so a quarter-unit sliver still
 * resolves on a 4K panel and it is what makes the last stretch of road read as
 * a converging line rather than as six dashes and then nothing.
 *
 * Nothing here depends on time — a drawn plate is deliberately still, because
 * it is what a reduced-motion visitor sees.
 */
export function dashesOnPlate(cam: PlateCamera, startM = 3.2, minPx = 0.25): PlateDash[] {
  const out: PlateDash[] = [];
  const halfMark = ROAD_MARK_WIDTH_M / 2;
  for (let i = 0; i < 64; i += 1) {
    const near = startM + i * ROAD_DASH_PERIOD_M;
    const far = near + ROAD_DASH_MARK_M;
    const [, yNear] = projectOnPlate(cam, 0, 0, near);
    const [, yFar] = projectOnPlate(cam, 0, 0, far);
    if (yNear - yFar < minPx) break;
    out.push({
      yNear,
      yFar,
      halfNear: (cam.focalPx * halfMark) / near,
      halfFar: (cam.focalPx * halfMark) / far,
      x: cam.vanishingX,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vitosha
// ---------------------------------------------------------------------------

/**
 * The camera the crest below is expressed in — the landing hero's plate.
 *
 * It is the CANONICAL frame only because it is where the points were first
 * generated; `reprojectPlatePoint` moves them to any other seat exactly.
 */
export const HERO_PLATE_CAMERA: PlateCamera = {
  vanishingX: 1000,
  horizonY: 250,
  focalPx: 975,
  eyeHeightM: 1.6,
};

/**
 * The Vitosha crest, in HERO_PLATE_CAMERA coordinates.
 *
 * GENERATED, not drawn: each point is `ridgeElevationDeg()` from
 * sim/environment/skyShader.ts — the exact function the sky dome's fragment
 * shader evaluates — sampled every 2° of azimuth from 34° east of south to
 * 48° west of it, and projected through `azimuthXOnPlate`/`elevationYOnPlate`.
 * The shader measures azimuth positive toward the WEST while the plate measures
 * x positive toward +X (east), hence the sign flip in the generator.
 *
 * It is inlined rather than computed because its consumers are Server
 * Components whose entire value is costing the client zero JavaScript, and
 * importing the sim's public barrel would drag that module's client boundaries
 * into their manifests for four dozen numbers.
 *
 * Drift is impossible anyway: marketing/hero/__tests__/heroScene.test.ts
 * recomputes the whole list from `ridgeElevationDeg` and fails if a single
 * point moves. To regenerate, read that test — it contains the generator.
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
