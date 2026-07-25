/**
 * The DOWNLOAD tier — what each quality level actually fetches over the wire.
 *
 * Audit 2026-07-24 H-11 part 2. The quality presets were a RENDER tier only:
 * `low` (no shadows, no composer, maxDpr 1.0, facadeMaps "colorOnly") is
 * explicitly the phone-class level, yet every level downloaded, transcoded and
 * uploaded the identical 4,465,053 B of KTX2 ground maps, the identical
 * 328,139 B of facade maps and the identical 1,596,163 B HDR — then threw the
 * unbound ones away on the GPU. A mid-range Android paid full freight for maps
 * its own tier had already decided not to sample.
 *
 * This module is the single place that answers "which bytes does this level
 * pull?". It is pure — no DOM, no three.js — so the fetch PLAN (not just the
 * policy) is unit-tested in Node against the real manifests on disk. The
 * loaders (pbrTextures / facadeTextures) execute the plan and do nothing else
 * to decide it; the IBL mount (LessonScene) reads `hdrEnvironment` from the
 * same table. That is what keeps the download tier from drifting away from the
 * render tier a second time.
 *
 * Measured against public/sim/textures/manifest.json + city-v3/textures
 * (see __tests__/textureBudget.test.ts, which recomputes these from disk):
 *
 *   level  ground      facade    HDR         total       vs high
 *   high   4,465,053   328,139   1,596,163   6,389,355        —
 *   med    4,089,819   264,321   1,596,163   5,950,303   −429 KB
 *   low      509,615   216,335           0     725,950   −5.40 MB
 *
 * The facade column is NOT a new decision — it is the existing render-tier
 * ruling (`QUALITY_PRESETS[level].facadeMaps`, environment/quality.ts) finally
 * applied to the fetch as well as the bind, which is why it is read from there
 * rather than restated here.
 */

import { QUALITY_PRESETS as RENDER_PRESETS, type FacadeMapsMode } from "@/modules/sim/environment";
import type { WorldQuality } from "../types";

/**
 * Which of the four ground PBR maps (color / normal / roughness / ao) a level
 * fetches. The ground sets are by far the heaviest simulator asset — the two
 * normal maps alone are 2.54 MB of the 4.47 MB — so this is where the phone
 * tier wins or loses.
 *
 *   full      — color + normal + roughness + ao. The authored look, unchanged.
 *   noAo      — drops the tiling detail-AO. On a ground plane lit by a single
 *               directional sun it is the least visible of the four (the
 *               normal map already carries the aggregate relief), and at med
 *               the composer's N8AO supplies screen-space contact darkening
 *               anyway. −375 KB and one fragment fetch.
 *   colorOnly — albedo only. Roughness falls back to the material's authored
 *               constant, which is exactly what the wet-road lerp already
 *               drives (`roughness={wet.roughness}` in StaticWorld), so rain
 *               still reads correctly; relief goes flat. −3.96 MB.
 */
export type GroundMapsMode = "full" | "noAo" | "colorOnly";

/** The four maps a ground PBR set can ship, in load order. */
export type GroundMapName = "color" | "normal" | "roughness" | "ao";
/** The four maps a baked facade set ships, in load order. */
export type FacadeMapName = "color" | "normal" | "orm" | "emissive";

export interface TextureBudget {
  /** Ground PBR sets (road / sidewalk / ground) — see GroundMapsMode. */
  groundMaps: GroundMapsMode;
  /** Baked facade sets. Mirrors the render tier's `facadeMaps` exactly. */
  facadeMaps: FacadeMapsMode;
  /**
   * Whether the 1.5 MB HDRI is fetched and PMREM-filtered for image-based
   * lighting. Off at `low`: it is a single asset costing more than twice the
   * entire low-tier texture budget, and the level it serves has no composer,
   * no shadows and no clearcoat, so the reflections it feeds are the least
   * visible they will ever be. Metal/glass/mirrors then reflect only the
   * sun + hemisphere rig — flatter, but the tier already traded that away.
   */
  hdrEnvironment: boolean;
}

export const TEXTURE_BUDGETS: Record<WorldQuality, TextureBudget> = {
  low: {
    groundMaps: "colorOnly",
    facadeMaps: RENDER_PRESETS.low.facadeMaps,
    hdrEnvironment: false,
  },
  med: {
    groundMaps: "noAo",
    facadeMaps: RENDER_PRESETS.med.facadeMaps,
    hdrEnvironment: true,
  },
  high: {
    groundMaps: "full",
    facadeMaps: RENDER_PRESETS.high.facadeMaps,
    hdrEnvironment: true,
  },
};

/** Which ground maps `mode` fetches, in load order. */
export function groundMapsOf(mode: GroundMapsMode): readonly GroundMapName[] {
  switch (mode) {
    case "colorOnly":
      return ["color"];
    case "noAo":
      return ["color", "normal", "roughness"];
    case "full":
      return ["color", "normal", "roughness", "ao"];
  }
}

/**
 * Which facade maps `mode` fetches, in load order. `color` and `emissive` are
 * bound at every tier (albedo + the lit-window glow the day/night effect
 * drives), so they are always fetched; normal and ORM follow the tier.
 */
export function facadeMapsOf(mode: FacadeMapsMode): readonly FacadeMapName[] {
  switch (mode) {
    case "colorOnly":
      return ["color", "emissive"];
    case "colorNormal":
      return ["color", "normal", "emissive"];
    case "full":
      return ["color", "normal", "orm", "emissive"];
  }
}

// ---------------------------------------------------------------------------
// Fetch plans — the exact requests a tier issues
// ---------------------------------------------------------------------------

/** One texture request: which map, its colour space, and where it lives. */
export interface TextureRequest {
  map: string;
  /** Albedo/emissive are sRGB; normal/roughness/ao/orm are linear. */
  srgb: boolean;
  /** KTX2 url when the manifest declares one, else null (PNG-only path). */
  ktx2Url: string | null;
  /** The source PNG — the fallback when the KTX2 is missing or untranscodable. */
  pngUrl: string;
}

/**
 * The ground-set requests for one group at `mode`. `entry` is the group's
 * section of public/sim/textures/manifest.json (undefined → the whole set
 * loads PNGs, exactly as before KTX2 existed). `hasAo` is a property of the
 * source set, not of the tier: sidewalk/concrete ships no ao.png at all.
 *
 * Extracted from the loader so the byte weight of a tier can be asserted in
 * Node — the loader now has no say in which files it asks for.
 */
export function groundFetchPlan(args: {
  baseUrl: string;
  dir: string;
  hasAo: boolean;
  mode: GroundMapsMode;
  entry: Partial<Record<GroundMapName, string>> | undefined;
}): TextureRequest[] {
  const { baseUrl, dir, hasAo, mode, entry } = args;
  return groundMapsOf(mode)
    .filter((map) => map !== "ao" || hasAo)
    .map((map) => ({
      map,
      srgb: map === "color",
      ktx2Url: entry?.[map] ? `${baseUrl}/${entry[map]}` : null,
      pngUrl: `${baseUrl}/${dir}/${map}.png`,
    }));
}

/**
 * The facade requests for one set at `mode`. Unlike the ground sets there is
 * no PNG fallback — the packed sets are manifest-declared or absent — so a map
 * this tier WANTS but the manifest omits is an authoring bug and throws.
 */
export function facadeFetchPlan(args: {
  baseUrl: string;
  setName: string;
  mode: FacadeMapsMode;
  entry: Partial<Record<FacadeMapName, string>>;
}): { map: FacadeMapName; srgb: boolean; url: string }[] {
  const { baseUrl, setName, mode, entry } = args;
  return facadeMapsOf(mode).map((map) => {
    const file = entry[map];
    if (!file) throw new Error(`facade manifest missing ${setName}.${map}`);
    return { map, srgb: map === "color" || map === "emissive", url: `${baseUrl}/${file}` };
  });
}
