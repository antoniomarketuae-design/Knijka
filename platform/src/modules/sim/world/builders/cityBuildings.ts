/**
 * City buildings — places the authored glass-tower models (public/sim/city,
 * `tower_*.glb`) onto the real OSM footprints, but ONLY where the district
 * data says a genuine high-rise stands. Everything else renders as the
 * procedural facade prism (buildings.ts) at its true height.
 *
 * QW3 (docs/simulation/68 §Phase 0, audit 03 B1): the previous version
 * derived tower height from the PLOT size, clamped 42–170 m — every one of
 * the 248 footprints became a tower, a ~10:1 street canyon that made the
 * (correct) 3.25 m lanes read miniature. Heights now come from the district
 * data (`height` + `heightSource` per building, OSM-derived):
 *  - "height"/"levels": trust the data (clamped only against glitches);
 *  - "default" (no OSM data): deterministic 15–25 m jitter per building id —
 *    the Студентски град mid-rise reality.
 * A building becomes a glass tower only when it is genuinely tall
 * (>= TOWER_MIN_HEIGHT_M) AND its plot is compact enough for a point tower —
 * campus-scale multi-wing footprints stay prisms even when tall, because a
 * slender tower fitted to them would cover a fraction of the plot while its
 * full-footprint collider stayed (invisible walls).
 *
 * Towers render at the REAL data height: the models (24–50 authored floors)
 * are vertically compressed to match (doc 68: "scale down gracefully"). The
 * footprint fit stays proportional to the rendered height with a bounded
 * stretch, which also bounds window-aspect distortion to STRETCH — compression
 * shrinks windows but never squashes their shape beyond that band.
 *
 * Pure + testable: no three.js, no DOM. The CITY_MODELS dimension table is the
 * shared contract with the client loader (cityModels.ts), which normalises
 * every GLB to unit height with its footprint centred on x/z.
 */

import type { BuildingInstancePlacement, DistrictBuilding } from "../types";
import { hashString, toCCW, type Vec2 } from "./math2d";

export interface CityModel {
  /** GLB basename under public/sim/city (no extension). */
  file: string;
  /** Native footprint width ÷ height (x-extent / y-extent) at unit height. */
  mw: number;
  /** Native footprint depth ÷ height (z-extent / y-extent) at unit height. */
  md: number;
  /** Authored floor count (parsed from the model) — drives height-class fit. */
  floors: number;
}

/**
 * The shipped glass-tower set (public/sim/city). `mw`/`md` are measured from
 * each GLB's bounding box (x/y and z/y) at unit height and MUST match the
 * loader's unit-height normalisation — they drive the footprint fit. `floors`
 * is the authored storey count (from the file name) and selects which tower
 * lands on a given building height.
 */
export const CITY_MODELS: CityModel[] = [
  { file: "tower_res_blue_24", mw: 0.246, md: 0.248, floors: 24 },
  { file: "tower_res_silver_28", mw: 0.212, md: 0.181, floors: 28 },
  { file: "tower_office_bronze_30", mw: 0.228, md: 0.229, floors: 30 },
  { file: "tower_office_teal_34", mw: 0.228, md: 0.176, floors: 34 },
  { file: "tower_res_teal_36", mw: 0.126, md: 0.149, floors: 36 },
  { file: "tower_twin_a_40", mw: 0.126, md: 0.127, floors: 40 },
  { file: "tower_twin_b_40", mw: 0.126, md: 0.127, floors: 40 },
  { file: "tower_office_dark_42", mw: 0.165, md: 0.146, floors: 42 },
  { file: "tower_res_bronze_46", mw: 0.099, md: 0.117, floors: 46 },
  { file: "tower_office_grey_50", mw: 0.125, md: 0.109, floors: 50 },
];

/** World metres per authored storey (converts data height → target floors). */
const METERS_PER_FLOOR = 3.4;

/** Height band (m) for buildings with NO OSM data (heightSource "default"). */
export const DEFAULT_HEIGHT_MIN_M = 15;
export const DEFAULT_HEIGHT_MAX_M = 25;
/** Data-glitch clamps on OSM-sourced heights. */
const DATA_HEIGHT_MIN_M = 3;
const DATA_HEIGHT_MAX_M = 75;

/** Data height at/above which a building renders as a glass tower. */
export const TOWER_MIN_HEIGHT_M = 40;
/** Plots with a longer OBB axis than this stay prisms even when tall —
 *  they are multi-wing complexes a single point tower cannot cover. */
export const TOWER_MAX_PLOT_M = 40;

/** Max footprint fit stretch vs the model's natural (proportional) footprint —
 *  also the bound on window-aspect distortion. */
const STRETCH = 1.6;

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
 * Pick the tower model whose authored floor count best matches `targetFloors`.
 * Real district heights (12–22 floors) sit below every authored tower, so a
 * pure argmin would put the SAME shortest tower on every tall plot; a 0–6
 * floor deterministic per-building jitter varies neighbouring high-rises
 * while still bounding the vertical compression to the shorter models.
 */
function pickModel(targetFloors: number, hash: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < CITY_MODELS.length; i++) {
    const jitter = ((hash >>> i) & 3) * 2;
    const score = Math.abs(CITY_MODELS[i]!.floors - targetFloors) + jitter;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * One instanced glass tower per QUALIFYING footprint (tall + compact — see
 * module header); every other building is left to the facade-prism pass.
 * World space, base at y=0, with a non-uniform (width, height, depth) fit
 * scale on the unit-height model. Height is the resolved DATA height; the
 * footprint fit is capped so windows keep a plausible aspect.
 */
export function buildBuildingInstances(
  buildings: DistrictBuilding[],
): BuildingInstancePlacement[] {
  const out: BuildingInstancePlacement[] = [];
  for (const b of buildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const H = resolveBuildingHeightM(b);
    if (H < TOWER_MIN_HEIGHT_M) continue; // mid-rise → facade prism
    const ring = toCCW(b.footprint as Vec2[]);
    const box = orientedBox(ring);
    if (box.w < 2 || box.d < 2) continue;
    if (Math.max(box.w, box.d) > TOWER_MAX_PLOT_M) continue; // multi-wing → prism

    const hash = hashString(b.id);
    const modelIndex = pickModel(H / METERS_PER_FLOOR, hash);
    const m = CITY_MODELS[modelIndex]!;

    // Fit the footprint but cap the stretch vs the model's natural footprint
    // at the RENDERED height (mw·H × md·H). This bounds window-aspect
    // distortion to STRETCH even under vertical compression.
    const natW = m.mw * H;
    const natD = m.md * H;
    const worldW = clamp(box.w, natW / STRETCH, natW * STRETCH);
    const worldD = clamp(box.d, natD / STRETCH, natD * STRETCH);
    const sx = worldW / m.mw;
    const sy = H;
    const sz = worldD / m.md;

    out.push({
      buildingId: b.id,
      model: modelIndex,
      position: [box.cx, 0, -box.cy], // district (x,y) -> world (x, 0, -y)
      yaw: box.angle,
      scale: [sx, sy, sz],
    });
  }
  return out;
}
