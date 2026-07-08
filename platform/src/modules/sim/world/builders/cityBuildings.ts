/**
 * City buildings — places Kenney "City Kit Commercial" (CC0) low-poly models
 * onto the real OSM footprints. This is the VISUAL replacement for the
 * procedural extruded prisms: buildBuildings() still produces the wall/roof
 * mesh data + the collider (physics is unchanged and the renderer keeps the
 * colliders), but the renderer draws these instanced models instead of the
 * flat prisms.
 *
 * For each footprint we take its minimum-area oriented bounding box and tile a
 * deterministically-chosen model along the long axis, so a 50 m panelka block
 * becomes a row of façade modules rather than one stretched box (which would
 * smear the windows). Pure + testable: no three.js, no DOM. The CITY_MODELS
 * dimension table is the shared contract with the client loader (cityModels.ts),
 * which normalises every GLB to unit height with its footprint centred on x/z.
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
  /** Tall tower — only chosen for high buildings. */
  tall: boolean;
}

/**
 * The shipped model set (public/sim/city). `mw`/`md` are measured from each
 * GLB's bounding box (x/y and z/y) and MUST match the loader's unit-height
 * normalisation — they drive the footprint fit.
 */
export const CITY_MODELS: CityModel[] = [
  { file: "building-a", mw: 0.68, md: 0.73, tall: false },
  { file: "building-b", mw: 0.75, md: 0.73, tall: false },
  { file: "building-c", mw: 0.99, md: 1.22, tall: false },
  { file: "building-d", mw: 0.65, md: 0.7, tall: false },
  { file: "building-e", mw: 1.84, md: 1.13, tall: false },
  { file: "building-f", mw: 0.5, md: 0.61, tall: false },
  { file: "building-g", mw: 0.57, md: 0.54, tall: false },
  { file: "building-h", mw: 0.68, md: 0.78, tall: false },
  { file: "building-i", mw: 0.74, md: 0.77, tall: false },
  { file: "building-skyscraper-a", mw: 0.47, md: 0.47, tall: true },
  { file: "building-skyscraper-c", mw: 0.31, md: 0.34, tall: true },
  { file: "building-skyscraper-e", mw: 0.32, md: 0.3, tall: true },
];

const REGULAR_IDX = CITY_MODELS.flatMap((m, i) => (m.tall ? [] : [i]));
const TALL_IDX = CITY_MODELS.flatMap((m, i) => (m.tall ? [i] : []));

const TALL_MIN_H = 24; // buildings >= this pick a tower model
const MAX_MODULES = 6; // cap on tiled façade modules per footprint
const DEPTH_STRETCH_CAP = 2.4; // limit depth vs the model's natural depth

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

/**
 * One instanced placement per façade module. World space, base at y=0, with a
 * non-uniform (width, height, depth) fit scale on the unit-height model.
 */
export function buildBuildingInstances(
  buildings: DistrictBuilding[],
): BuildingInstancePlacement[] {
  const out: BuildingInstancePlacement[] = [];
  for (const b of buildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const ring = toCCW(b.footprint as Vec2[]);
    const box = orientedBox(ring);
    if (box.w < 1 || box.d < 1) continue;

    const H = Math.max(3, b.height);
    const hash = hashString(b.id);
    const pool = H >= TALL_MIN_H ? TALL_IDX : REGULAR_IDX;
    const modelIndex = pool[hash % pool.length]!;
    const m = CITY_MODELS[modelIndex]!;

    // Tile the long axis: each module's natural width at height H is mw*H.
    const naturalModuleW = Math.max(0.5, m.mw * H);
    const n = Math.min(MAX_MODULES, Math.max(1, Math.round(box.w / naturalModuleW)));
    const moduleW = box.w / n;

    // Scale the unit-height model (native extents mw × 1 × md) to fit.
    const sx = moduleW / m.mw;
    const sy = H;
    const depth = Math.min(box.d, m.md * H * DEPTH_STRETCH_CAP);
    const sz = depth / m.md;

    const ux = Math.cos(box.angle);
    const uy = Math.sin(box.angle);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * moduleW;
      const mcx = box.cx + ux * off;
      const mcy = box.cy + uy * off;
      out.push({
        model: modelIndex,
        position: [mcx, 0, -mcy], // district (x,y) -> world (x, 0, -y)
        yaw: box.angle,
        scale: [sx, sy, sz],
      });
    }
  }
  return out;
}
