/**
 * City buildings — places our authored glass-tower models (public/sim/city,
 * `tower_*.glb`) onto the real OSM footprints. This is the VISUAL replacement
 * for the procedural extruded prisms: buildBuildings() still produces the
 * wall/roof mesh data + the collider (physics is unchanged and the renderer
 * keeps the colliders), but the renderer draws these instanced glass towers
 * instead of the flat prisms.
 *
 * Every footprint becomes ONE glass tower (towers are monolithic point/slab
 * blocks — tiling copies of a tower side-by-side would look wrong). For each
 * footprint we take its minimum-area oriented bounding box, derive a target
 * height from the footprint's plan size (bigger plots → taller towers, min/max
 * clamped) and pick the tower model whose authored floor count matches that
 * height. The footprint fit is proportion-preserving: the tower is scaled to
 * cover the plot but never stretched more than STRETCH× beyond the model's own
 * slender proportions, so a tower never becomes a squished box or a wildly fat
 * slab. Pure + testable: no three.js, no DOM. The CITY_MODELS dimension table
 * is the shared contract with the client loader (cityModels.ts), which
 * normalises every GLB to unit height with its footprint centred on x/z.
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
 * lands on a given plot size.
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

/** World metres per authored storey (sets a tower's rendered height band). */
const METERS_PER_FLOOR = 3.4;
/** Height clamp (m). Floor of the shortest tower / ceiling of the tallest. */
const H_MIN = 42;
const H_MAX = CITY_MODELS[CITY_MODELS.length - 1]!.floors * METERS_PER_FLOOR; // 50 floors → 170 m
/** Plan-size (√area, m) → target height gain. Tuned for a tall varied skyline. */
const AREA_TO_HEIGHT = 6.5;
/** Max footprint fit stretch vs the model's natural (proportional) footprint. */
const STRETCH = 1.6;
/** Keep the rendered height within this band of the model's authored height,
 *  so a tower is never vertically squished/stretched into an implausible shape. */
const PROPORTION_BAND = 0.15;

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
 * Pick the tower model whose authored floor count best matches `targetFloors`,
 * using a per-building hash to break ties (and split the two 40-floor twins) so
 * neighbouring plots of the same size don't all resolve to the same tower.
 */
function pickModel(targetFloors: number, hash: number): number {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < CITY_MODELS.length; i++) {
    // Tiny deterministic jitter breaks exact ties (e.g. twin_a vs twin_b).
    const jitter = ((hash >>> i) & 1) * 0.25;
    const score = Math.abs(CITY_MODELS[i]!.floors - targetFloors) + jitter;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * One instanced glass tower per footprint. World space, base at y=0, with a
 * non-uniform (width, height, depth) fit scale on the unit-height model. Height
 * is derived from the footprint's plan size (√area) — not the OSM height — so
 * the skyline is a tall, varied glass metropolis; the fit is capped so a tower
 * keeps plausible slender proportions rather than being stretched or squished.
 */
export function buildBuildingInstances(
  buildings: DistrictBuilding[],
): BuildingInstancePlacement[] {
  const out: BuildingInstancePlacement[] = [];
  for (const b of buildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const ring = toCCW(b.footprint as Vec2[]);
    const box = orientedBox(ring);
    if (box.w < 2 || box.d < 2) continue;

    const hash = hashString(b.id);
    // Deterministic ±15% skyline jitter from the id (varies equal-size plots).
    const jitter = 0.85 + ((hash % 1000) / 1000) * 0.3;

    // Height from plan size (√area is the plot's characteristic dimension), so
    // bigger plots carry taller towers. Clamped to the tower height band.
    const planSize = Math.sqrt(box.w * box.d);
    const targetH = clamp(planSize * AREA_TO_HEIGHT * jitter, H_MIN, H_MAX);

    // Choose the tower whose storey count fits, then render within a tight band
    // of that tower's authored height so it never looks vertically distorted.
    const modelIndex = pickModel(targetH / METERS_PER_FLOOR, hash);
    const m = CITY_MODELS[modelIndex]!;
    const authoredH = m.floors * METERS_PER_FLOOR;
    const H = clamp(targetH, authoredH * (1 - PROPORTION_BAND), authoredH * (1 + PROPORTION_BAND));

    // Fit the footprint but cap the stretch vs the model's natural footprint
    // (mw·H × md·H) so the glass box is neither absurdly fat nor a thin needle.
    const natW = m.mw * H;
    const natD = m.md * H;
    const worldW = clamp(box.w, natW / STRETCH, natW * STRETCH);
    const worldD = clamp(box.d, natD / STRETCH, natD * STRETCH);
    const sx = worldW / m.mw;
    const sy = H;
    const sz = worldD / m.md;

    out.push({
      model: modelIndex,
      position: [box.cx, 0, -box.cy], // district (x,y) -> world (x, 0, -y)
      yaw: box.angle,
      scale: [sx, sy, sz],
    });
  }
  return out;
}
