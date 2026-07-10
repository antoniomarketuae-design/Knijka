/**
 * City buildings — places the authored district building kit v3
 * (public/sim/city-v3, `t_*.glb` towers + `pav_*.glb` retail pavilions) onto
 * the real OSM footprints. The kit replicates doc 70 REF 1 (waterfront
 * financial district): five distinct tower facade SYSTEMS — punched-concrete
 * grids, cream vertical strips, bronze dark-glass curtain walls (incl. an
 * identical twin pair), white horizontal bands with rounded corners, and a
 * beige punched-window slab — plus low bronze-glass retail pavilions.
 * Everything else renders as the procedural facade prism (buildings.ts) at
 * its true height.
 *
 * QW3 (docs/simulation/68 §Phase 0, audit 03 B1): heights come from the
 * district data (`height` + `heightSource` per building, OSM-derived):
 *  - "height"/"levels": trust the data (clamped only against glitches);
 *  - "default" (no OSM data): deterministic 15–25 m jitter per building id —
 *    the Студентски град mid-rise reality.
 * A building becomes a kit tower only when it is genuinely tall
 * (>= TOWER_MIN_HEIGHT_M) AND its plot is compact enough for a point tower —
 * campus-scale multi-wing footprints stay prisms even when tall, because a
 * slender tower fitted to them would cover a fraction of the plot while its
 * full-footprint collider stayed (invisible walls).
 *
 * Model selection (doc 70: "VARIETY is the point"):
 *  - TWIN PAIR — the two curtain twins (t_curtain_twin_a/b_44) are placed as
 *    a matched pair on the closest two tower plots of near-equal height
 *    within TWIN_MAX_GAP_M; never individually.
 *  - the remaining tower plots are hash-ordered and round-robined across the
 *    facade systems, so a district with N tower plots shows min(N, systems)
 *    DISTINCT systems instead of collapsing onto the floor-count argmin.
 *    Within the assigned system, the model with the closest authored floor
 *    count wins (small per-building jitter varies multi-model systems).
 *  - RETAIL PAVILIONS — small (< PAVILION_MAX_PLOT_M2), LOW (data height
 *    < PAVILION_MAX_HEIGHT_M) plots get one of the bronze pavilions instead
 *    of a prism: hash-ordered, capped at MAX_PAVILIONS so they stay sparse.
 *
 * Towers render at the REAL data height: the models (12–50 authored floors)
 * are vertically compressed to match (doc 68: "scale down gracefully"). The
 * footprint fit stays proportional to the rendered height with a bounded
 * stretch, which also bounds window-aspect distortion to STRETCH. Pavilions
 * instead fit their plot OBB exactly — their storefront glazing tolerates
 * distortion, and an overhang past the plot would poke through the collider.
 *
 * Pure + testable: no three.js, no DOM. The CITY_MODELS dimension table is the
 * shared contract with the client loader (cityModels.ts), which normalises
 * every GLB to unit height with its footprint centred on x/z.
 */

import type { BuildingInstancePlacement, DistrictBuilding } from "../types";
import { hashString, toCCW, type Vec2 } from "./math2d";

/** Facade systems of the v3 kit (doc 70 REF 1 — "at least 4 distinct"). */
export type FacadeSystem = "grid" | "strip" | "curtain" | "band" | "slab" | "pavilion";

export interface CityModel {
  /** GLB basename under public/sim/city-v3 (no extension). */
  file: string;
  /** Native footprint width ÷ height (x-extent / y-extent) at unit height. */
  mw: number;
  /** Native footprint depth ÷ height (z-extent / y-extent) at unit height. */
  md: number;
  /** Authored floor count (parsed from the file name) — drives height fit. */
  floors: number;
  /** Facade system — placement spreads systems across the tower plots. */
  system: FacadeSystem;
  /** Twin towers place ONLY as a matched adjacent pair, never solo. */
  twin?: "a" | "b";
}

/**
 * The shipped district kit v3 (public/sim/city-v3). `mw`/`md` are measured
 * from each GLB's bounding box (x/y and z/y) at unit height and MUST match
 * the loader's unit-height normalisation — they drive the footprint fit.
 * `floors` is the authored storey count from the file name.
 */
export const CITY_MODELS: CityModel[] = [
  { file: "t_grid_grey_12", mw: 0.566, md: 0.624, floors: 12, system: "grid" },
  { file: "t_strip_cream_14", mw: 0.464, md: 0.422, floors: 14, system: "strip" },
  { file: "t_band_white_16", mw: 0.652, md: 0.477, floors: 16, system: "band" },
  { file: "t_slab_beige_18", mw: 0.705, md: 0.333, floors: 18, system: "slab" },
  { file: "t_curtain_bronze_20", mw: 0.363, md: 0.402, floors: 20, system: "curtain" },
  { file: "t_strip_cream_24", mw: 0.349, md: 0.273, floors: 24, system: "strip" },
  { file: "t_grid_beige_26", mw: 0.347, md: 0.35, floors: 26, system: "grid" },
  { file: "t_band_white_28", mw: 0.468, md: 0.327, floors: 28, system: "band" },
  { file: "t_strip_cream_36", mw: 0.288, md: 0.195, floors: 36, system: "strip" },
  { file: "t_grid_grey_38", mw: 0.257, md: 0.259, floors: 38, system: "grid" },
  { file: "t_band_white_40", mw: 0.471, md: 0.253, floors: 40, system: "band" },
  { file: "t_curtain_twin_a_44", mw: 0.205, md: 0.223, floors: 44, system: "curtain", twin: "a" },
  { file: "t_curtain_twin_b_44", mw: 0.205, md: 0.223, floors: 44, system: "curtain", twin: "b" },
  { file: "t_grid_beige_50", mw: 0.238, md: 0.25, floors: 50, system: "grid" },
  { file: "pav_bronze_1f", mw: 5.558, md: 3.032, floors: 1, system: "pavilion" },
  { file: "pav_bronze_2f", mw: 3.503, md: 1.881, floors: 2, system: "pavilion" },
];

/** Round-robin order for spreading tower systems across the tower plots. */
const TOWER_SYSTEM_ORDER: FacadeSystem[] = ["grid", "strip", "band", "slab", "curtain"];

const TWIN_A_MODEL = CITY_MODELS.findIndex((m) => m.twin === "a");
const TWIN_B_MODEL = CITY_MODELS.findIndex((m) => m.twin === "b");
const PAV_1F_MODEL = CITY_MODELS.findIndex((m) => m.system === "pavilion" && m.floors === 1);
const PAV_2F_MODEL = CITY_MODELS.findIndex((m) => m.system === "pavilion" && m.floors === 2);

/** World metres per authored storey (converts data height → target floors). */
const METERS_PER_FLOOR = 3.4;

/** Height band (m) for buildings with NO OSM data (heightSource "default"). */
export const DEFAULT_HEIGHT_MIN_M = 15;
export const DEFAULT_HEIGHT_MAX_M = 25;
/** Data-glitch clamps on OSM-sourced heights. */
const DATA_HEIGHT_MIN_M = 3;
const DATA_HEIGHT_MAX_M = 75;

/** Data height at/above which a building renders as a kit tower. */
export const TOWER_MIN_HEIGHT_M = 40;
/** Plots with a longer OBB axis than this stay prisms even when tall —
 *  they are multi-wing complexes a single point tower cannot cover. */
export const TOWER_MAX_PLOT_M = 40;

/** Max footprint fit stretch vs the model's natural (proportional) footprint —
 *  also the bound on window-aspect distortion. */
const STRETCH = 1.6;

/** Twin pair: max centre distance and height mismatch for two tower plots to
 *  host the identical curtain twins (doc 70 REF 1 — "identical pair"). */
export const TWIN_MAX_GAP_M = 120;
const TWIN_MAX_HEIGHT_DELTA_M = 8;

/** Retail pavilions: only small, LOW, data-known plots qualify; keep sparse. */
export const PAVILION_MAX_HEIGHT_M = 8;
export const PAVILION_MAX_PLOT_M2 = 300;
const PAVILION_MIN_W_M = 8;
const PAVILION_MIN_D_M = 5;
const PAVILION_MAX_ASPECT = 3.2;
export const MAX_PAVILIONS = 6;
/** Data height at/above which the 2-floor pavilion is used over the 1-floor. */
const PAVILION_2F_MIN_H_M = 5;

/**
 * Rendered height for a building, from the district data (see module header).
 * Deterministic: the "default" jitter hashes the building id.
 */
export function resolveBuildingHeightM(b: DistrictBuilding): number {
  if (b.heightSource === "default") {
    const u = (hashString(b.id) % 1000) / 1000;
    return DEFAULT_HEIGHT_MIN_M + u * (DEFAULT_HEIGHT_MAX_M - DEFAULT_HEIGHT_MIN_M);
  }
  return clamp(b.height, DATA_HEIGHT_MIN_M, DATA_HEIGHT_MAX_M);
}

interface OBB {
  cx: number;
  cy: number;
  /** Angle of the long (width) axis, radians, district space. */
  angle: number;
  /** Extent along the long axis. */
  w: number;
  /** Extent along the short axis. */
  d: number;
}

/**
 * Minimum-area oriented bounding box of a polygon ring (rotating calipers,
 * brute-forced over every edge — footprints are tiny). Returns the box centre,
 * the LONG-axis angle, and the width (long) / depth (short) extents.
 */
export function orientedBox(ring: Vec2[]): OBB {
  let best: OBB | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i]!;
    const p1 = ring[(i + 1) % ring.length]!;
    const ex = p1[0] - p0[0];
    const ey = p1[1] - p0[1];
    const elen = Math.hypot(ex, ey);
    if (elen < 1e-6) continue;
    const c = ex / elen;
    const s = ey / elen;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of ring) {
      const u = p[0] * c + p[1] * s; // rotate by -edgeAngle
      const v = -p[0] * s + p[1] * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const wu = maxU - minU;
    const wv = maxV - minV;
    const area = wu * wv;
    if (area < bestArea) {
      bestArea = area;
      const uc = (minU + maxU) / 2;
      const vc = (minV + maxV) / 2;
      const cx = uc * c - vc * s; // rotate centre back by +edgeAngle
      const cy = uc * s + vc * c;
      // Long axis is width; short axis is depth.
      if (wu >= wv) {
        best = { cx, cy, angle: Math.atan2(s, c), w: wu, d: wv };
      } else {
        best = { cx, cy, angle: Math.atan2(c, -s), w: wv, d: wu };
      }
    }
  }
  return best ?? { cx: ring[0]?.[0] ?? 0, cy: ring[0]?.[1] ?? 0, angle: 0, w: 6, d: 6 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Pick the model of `system` whose authored floor count best matches
 * `targetFloors` (twins excluded — they place only as the pair). A 0–6 floor
 * deterministic per-building jitter varies neighbouring high-rises within
 * multi-model systems while still bounding the vertical compression.
 */
function pickTowerModel(system: FacadeSystem, targetFloors: number, hash: number): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < CITY_MODELS.length; i++) {
    const m = CITY_MODELS[i]!;
    if (m.system !== system || m.twin) continue;
    const jitter = ((hash >>> i) & 3) * 2;
    const score = Math.abs(m.floors - targetFloors) + jitter;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

interface Candidate {
  b: DistrictBuilding;
  H: number;
  box: OBB;
  hash: number;
  /** Input order — keeps the output ordering stable. */
  index: number;
}

/** Deterministic hash order (ties broken by id) — the "hash spread". */
function byHash(a: Candidate, b: Candidate): number {
  return a.hash - b.hash || (a.b.id < b.b.id ? -1 : 1);
}

/** Tower placement: footprint fit capped at STRETCH vs the model's natural
 *  footprint at the RENDERED height — bounds window-aspect distortion even
 *  under vertical compression. */
function towerPlacement(c: Candidate, modelIndex: number): BuildingInstancePlacement {
  const m = CITY_MODELS[modelIndex]!;
  const natW = m.mw * c.H;
  const natD = m.md * c.H;
  const worldW = clamp(c.box.w, natW / STRETCH, natW * STRETCH);
  const worldD = clamp(c.box.d, natD / STRETCH, natD * STRETCH);
  return {
    buildingId: c.b.id,
    model: modelIndex,
    position: [c.box.cx, 0, -c.box.cy], // district (x,y) -> world (x, 0, -y)
    yaw: c.box.angle,
    scale: [worldW / m.mw, c.H, worldD / m.md],
  };
}

/**
 * One instanced kit building per QUALIFYING footprint — tall + compact plots
 * become towers, a sparse handful of small low plots become retail pavilions
 * (see module header); every other building is left to the facade-prism pass.
 * World space, base at y=0, with a non-uniform (width, height, depth) fit
 * scale on the unit-height model. Height is the resolved DATA height.
 */
export function buildBuildingInstances(
  buildings: DistrictBuilding[],
): BuildingInstancePlacement[] {
  const towers: Candidate[] = [];
  const pavilions: Candidate[] = [];
  for (let index = 0; index < buildings.length; index++) {
    const b = buildings[index]!;
    if (!b.footprint || b.footprint.length < 3) continue;
    const H = resolveBuildingHeightM(b);
    const ring = toCCW(b.footprint as Vec2[]);
    const box = orientedBox(ring);
    if (box.w < 2 || box.d < 2) continue;
    const hash = hashString(b.id);
    if (H >= TOWER_MIN_HEIGHT_M) {
      if (Math.max(box.w, box.d) > TOWER_MAX_PLOT_M) continue; // multi-wing → prism
      towers.push({ b, H, box, hash, index });
    } else if (
      H < PAVILION_MAX_HEIGHT_M && // low (also excludes 15–25 m "default" jitter)
      box.w * box.d < PAVILION_MAX_PLOT_M2 &&
      box.w >= PAVILION_MIN_W_M &&
      box.d >= PAVILION_MIN_D_M &&
      box.w / box.d <= PAVILION_MAX_ASPECT // no pavilion stretched into a wall
    ) {
      pavilions.push({ b, H, box, hash, index });
    }
    // Everything else: facade prism (buildings.ts).
  }

  // Model assignment per tower candidate (keyed by input index).
  const assigned = new Map<number, number>();

  // TWIN PAIR — the closest two tower plots of near-equal height host the
  // identical curtain twins (O(n²) is fine: tower plots are a handful).
  let twinPlaced = false;
  {
    let pair: [Candidate, Candidate] | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < towers.length; i++) {
      for (let j = i + 1; j < towers.length; j++) {
        const a = towers[i]!;
        const c = towers[j]!;
        if (Math.abs(a.H - c.H) > TWIN_MAX_HEIGHT_DELTA_M) continue;
        const dist = Math.hypot(a.box.cx - c.box.cx, a.box.cy - c.box.cy);
        if (dist <= TWIN_MAX_GAP_M && dist < bestDist) {
          bestDist = dist;
          pair = [a, c];
        }
      }
    }
    if (pair && TWIN_A_MODEL >= 0 && TWIN_B_MODEL >= 0) {
      assigned.set(pair[0].index, TWIN_A_MODEL);
      assigned.set(pair[1].index, TWIN_B_MODEL);
      twinPlaced = true;
    }
  }

  // Remaining towers: hash-order, then round-robin the facade systems so a
  // district with N tower plots shows min(N, systems) DISTINCT systems.
  // Curtain is already on show when the twins placed.
  const systemOrder = twinPlaced
    ? TOWER_SYSTEM_ORDER.filter((s) => s !== "curtain")
    : TOWER_SYSTEM_ORDER;
  const rest = towers.filter((t) => !assigned.has(t.index)).sort(byHash);
  for (let rank = 0; rank < rest.length; rank++) {
    const t = rest[rank]!;
    const system = systemOrder[rank % systemOrder.length]!;
    const model = pickTowerModel(system, t.H / METERS_PER_FLOOR, t.hash);
    if (model >= 0) assigned.set(t.index, model);
  }

  const out: BuildingInstancePlacement[] = [];
  for (const t of towers) {
    const model = assigned.get(t.index);
    if (model !== undefined) out.push(towerPlacement(t, model));
  }

  // RETAIL PAVILIONS — hash-pick a sparse capped set; exact plot-OBB fit (a
  // stretch-capped fit could overhang the plot and poke through the collider).
  const picked = pavilions.sort(byHash).slice(0, MAX_PAVILIONS);
  picked.sort((a, b) => a.index - b.index);
  for (const t of picked) {
    const modelIndex = t.H >= PAVILION_2F_MIN_H_M ? PAV_2F_MODEL : PAV_1F_MODEL;
    if (modelIndex < 0) break;
    const m = CITY_MODELS[modelIndex]!;
    out.push({
      buildingId: t.b.id,
      model: modelIndex,
      position: [t.box.cx, 0, -t.box.cy],
      yaw: t.box.angle,
      scale: [t.box.w / m.mw, t.H, t.box.d / m.md],
    });
  }
  return out;
}
