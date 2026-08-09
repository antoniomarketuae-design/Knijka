/**
 * Quality presets for DistrictWorld. Budget targets Iris Xe at dpr 1.5.
 */

import type { WorldQuality } from "../types";

export interface QualityPreset {
  /**
   * Which tier this preset IS. Carried explicitly since audit H-11: the
   * texture-download budget (textures/textureBudget.ts) is keyed by level, and
   * the consumers used to recover the level by back-mapping `textureSize`
   * (>=1024 -> high, >=512 -> med, else low) — a coincidence of the current
   * numbers, not a contract.
   */
  level: WorldQuality;
  /** Tiling texture size (asphalt/grass/facades). */
  textureSize: 256 | 512 | 1024;
  signTextureSize: 128 | 256;
  /** Which static meshes cast shadows. */
  castShadows: "none" | "buildings" | "full";
  receiveShadows: boolean;
  /** Fraction of built tree instances actually rendered. */
  treeFraction: number;
  /** Anisotropy for the procedural canvas textures and the baked facade sets. */
  anisotropy: number;
  /**
   * Anisotropy for the three GROUND PBR sets — road, sidewalk, terrain.
   *
   * SEPARATE FROM `anisotropy` BECAUSE THE GROUND IS A DIFFERENT OPTICAL
   * PROBLEM, and it is the one the founder's „detail collapses past fifteen
   * metres" is about. A cockpit eye sits 1.36 m above the road, so the road
   * plane is seen at atan(1.36/d): 9.7° at 8 m, 3.9° at 20 m. The pixel
   * footprint on that plane is therefore wildly elongated — at 20 m it is
   * ~25 mm across the road and ~410 mm along it, a 17:1 ellipse. A mip level
   * is chosen from max(minor, major / anisotropy), so with anisotropy 4 the
   * road at 20 m is sampled at a ~100 mm footprint: two full mip levels
   * coarser than the geometry actually requires. THAT is the falloff. It is
   * not a shortage of texture detail — the detail is fetched, uploaded and
   * then filtered away on the way to the screen.
   *
   * MEASURED on `l0p-poligon-free` at tier `low`, cockpit pose, car stationary:
   * pixel-scale structure (3x3 Laplacian RMS as a % of mean luma) on a fixed
   * 4.4 m strip of carriageway, same pixels in every row of the table.
   *
   *      anisotropy      8 m      12 m      20 m     20 m / 8 m
   *          1          1.999     1.747     1.481       0.74
   *          2          3.200     2.473     1.999       0.62
   *          4  (was)   4.418     3.147     2.369       0.54
   *          8          4.669     4.091     2.668       0.57
   *         16  (now)   4.669     4.774     3.432       0.74
   *
   * Read the 8 m column and the 20 m column together: 8 m SATURATES at 8 (the
   * footprint ratio there is only 6.7:1, so nothing above 8 can help it) while
   * 20 m is still climbing at 16. A single number that fixes the far field
   * therefore costs nothing in the near field, and the fall from 8 m to 20 m
   * goes from −46 % to −27 %.
   *
   * The distances are honest ones: the cockpit's optical down-pitch was solved
   * from parallax (roll a telemetry-measured 4.532 m, find the pitch that makes
   * the two luminance-vs-distance profiles the same curve) and came out at
   * 4.35°, not the authored COCKPIT_PITCH_BASE of 4.00° — the car rests
   * nose-down on its suspension and nothing publishes that. Taking the
   * authored number would have called an 18.35 m strip "20 m".
   *
   * WHY THIS IS AFFORDABLE ON THE PHONE, WHICH IS THE TIER THE FPS COMPLAINT
   * IS ABOUT. Anisotropy is a CEILING, not a count: the hardware takes extra
   * samples only where the footprint is actually elongated, and the near half
   * of the road — which owns most of the pixels — has ratios of 4–7. And at
   * `low` the download budget is `colorOnly`, so each ground material has ONE
   * map bound instead of three or four; the tier with the least to filter is
   * the tier that can most afford to filter it properly.
   *
   * Clamped at bind time to `gl.capabilities.getMaxAnisotropy()` — 16 is the
   * universal cap on the hardware this ships to, but a device that reports
   * less must get what it has, not a silently ignored request.
   */
  groundAnisotropy: number;
}

export const QUALITY_PRESETS: Record<WorldQuality, QualityPreset> = {
  low: {
    level: "low",
    textureSize: 256,
    signTextureSize: 128,
    castShadows: "none",
    receiveShadows: false,
    treeFraction: 0.5,
    anisotropy: 2,
    groundAnisotropy: 16,
  },
  med: {
    level: "med",
    textureSize: 512,
    signTextureSize: 256,
    castShadows: "buildings",
    receiveShadows: true,
    treeFraction: 0.8,
    anisotropy: 4,
    groundAnisotropy: 16,
  },
  high: {
    level: "high",
    textureSize: 1024,
    signTextureSize: 256,
    castShadows: "full",
    receiveShadows: true,
    treeFraction: 1,
    anisotropy: 8,
    groundAnisotropy: 16,
  },
};
