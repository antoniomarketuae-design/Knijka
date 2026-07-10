// The three fixed benchmark camera poses (doc 71 §3 discipline, lane 10):
// after EVERY visual-quality phase, re-shoot all three (+ a greyscale
// variant) and compare against the previous set — a phase isn't done until
// its screenshots beat the last ones. Poses live in code so the framing can
// never drift between phases; `renderer.info.render.calls` at each pose is
// part of the same ritual.
//
// Pure data — deliberately NO three.js imports (vitest-in-Node pattern, same
// as presets.ts).
//
// Coordinates are DISTRICT space: x = east, y = north, z = height above the
// road surface (meters). Conversion to three.js world space (the same
// mapping LessonScene's spawnPose uses):
//
//   position = (x, z, -y)
//   yawRad   = PI - headingDeg * PI / 180   // heading: compass cw-from-north
//   pitchRad = pitchDeg * PI / 180          // + looks up, - looks down
//
// e.g. camera.position.set(x, z, -y);
//      camera.rotation.set(0, yawRad, 0, "YXZ"); camera.rotateX(pitchRad);

export interface BenchmarkCameraPose {
  id: "cockpit" | "chase" | "promenade";
  /** What the shot is for (the REF it is judged against, doc 70). */
  ref: string;
  /** District-space position: x east, y north (m). */
  x: number;
  y: number;
  /** Camera height above the road surface (m). */
  z: number;
  /** Compass heading, degrees cw from north (0 = north, 90 = east). */
  headingDeg: number;
  /** Pitch, degrees (positive = up, negative = down). */
  pitchDeg: number;
  /** Vertical FOV, degrees. */
  fovDeg: number;
}

/**
 * 1. `cockpit` — REF-6 framing: driver's eye on the spawn-1 street
 *    („Трайко Станоев"), the §4.9 camera contract numbers (vFOV 47, 8° down).
 * 2. `chase` — REF-5 framing: 6 m behind / 2.6 m above the spawn-1 pose,
 *    matching the in-game chase camera's CHASE_FOV 44.
 * 3. `promenade` — REF-1 wide: elevated 18 m shot from the mid-district
 *    looking NW at the tower cluster (the 63 m w897620090 + the twin 51 m
 *    slabs around (-100, 250)), sun at azimuth 245° raking across the
 *    facades — the greyscale-contrast + haze-layering gate shot.
 */
export const BENCHMARK_CAMERAS: readonly BenchmarkCameraPose[] = [
  {
    id: "cockpit",
    ref: "REF-6 cockpit framing (doc 71 §4.9 contract)",
    x: 620.96,
    y: -215.89,
    z: 1.2,
    headingDeg: 71.2,
    pitchDeg: -8,
    fovDeg: 47,
  },
  {
    id: "chase",
    ref: "REF-5 chase framing",
    x: 615.28,
    y: -217.82,
    z: 2.6,
    headingDeg: 71.2,
    pitchDeg: -6,
    fovDeg: 44,
  },
  {
    id: "promenade",
    ref: "REF-1 wide golden-hour tower shot",
    x: 130,
    y: 40,
    z: 18,
    headingDeg: 313,
    pitchDeg: -2,
    fovDeg: 55,
  },
] as const;
