/**
 * Quality presets for DistrictWorld. Budget targets Iris Xe at dpr 1.5.
 */

import type { WorldQuality } from "../types";

export interface QualityPreset {
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
    textureSize: 256,
    signTextureSize: 128,
    castShadows: "none",
    receiveShadows: false,
    treeFraction: 0.5,
    anisotropy: 2,
  },
  med: {
    textureSize: 512,
    signTextureSize: 256,
    castShadows: "buildings",
    receiveShadows: true,
    treeFraction: 0.8,
    anisotropy: 4,
  },
  high: {
    textureSize: 1024,
    signTextureSize: 256,
    castShadows: "full",
    receiveShadows: true,
    treeFraction: 1,
    anisotropy: 8,
  },
};
