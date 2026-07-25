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
  anisotropy: number;
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
  },
  med: {
    level: "med",
    textureSize: 512,
    signTextureSize: 256,
    castShadows: "buildings",
    receiveShadows: true,
    treeFraction: 0.8,
    anisotropy: 4,
  },
  high: {
    level: "high",
    textureSize: 1024,
    signTextureSize: 256,
    castShadows: "full",
    receiveShadows: true,
    treeFraction: 1,
    anisotropy: 8,
  },
};
