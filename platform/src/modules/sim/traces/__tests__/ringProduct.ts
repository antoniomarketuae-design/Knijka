/**
 * RING PRODUCT GEOMETRY — test support for the roundabout family's drivability
 * pins (catalogue-demo-curvature:dae908c7, family curvring). Nothing in the
 * product imports it.
 *
 * Two things a ring demo is measured against, both taken from the product and
 * neither typed in:
 *
 *  1. THE STATIC BODIES, as physics sees them. `WorldColliders` hands rapier
 *     three fixed bodies built from `buildWorldGeometry(district).colliders`:
 *     the ground with the pavement trimesh (the 12 cm kerbs), the building
 *     trimesh, and the raised walls split out of the pavement trimesh by
 *     `splitDriveOverSurface` (on a ring district: the central island's
 *     planter wall). Here each triangle is laid flat on the district plane
 *     (world x = district x, world z = −district y) and the hero's chassis box
 *     (`CHASSIS_HALF_EXTENTS`, the box the product's own contact reporters
 *     use) is measured against it. The kerb's foot is the carriageway's edge,
 *     so «0.25 m from the pavement body» is also «a quarter of a metre inside
 *     the tarmac».
 *
 *  2. THE CAR. The recorder heads the ghost along its path's tangent; a real
 *     car with its centre on that path does not stand along the tangent — its
 *     rear axle can only roll along the body — so `bicycleOnPath` recovers the
 *     body heading a no-slip car would have and the wheel it would need, and
 *     the pins measure THAT body as well as the recorded one.
 */

import { splitDriveOverSurface } from "../../world/components/WorldColliders";
import { buildWorldGeometry } from "../../world/builders/buildWorldGeometry";
import { assertDistrict } from "../../world/types";
import * as T from "../../vehicle/tuning";
import type { TraceSample } from "../types";

export const HERO_HALF_WIDTH_M = T.CHASSIS_HALF_EXTENTS.x;
export const HERO_HALF_LENGTH_M = T.CHASSIS_HALF_EXTENTS.z;
export const WHEELBASE_M = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z;
export const REAR_AXLE_BEHIND_CENTRE_M = -T.WHEEL_POSITIONS[2].z;

export type StaticBodyKind = "pavement" | "wall" | "building";

interface Tri {
  kind: StaticBodyKind;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
}

export interface RingStaticBodies {
  /** Triangle count per body, so a pin can refuse an empty measurement. */
  counts: Record<StaticBodyKind, number>;
  /** Smallest separation between a chassis box at this pose and any body, m
   *  (0 when they overlap), and which body it was. */
  clearance(x: number, y: number, headingDeg: number): { m: number; kind: StaticBodyKind | null };
}

const CELL_M = 8;
const cellKey = (ix: number, iy: number) => ix * 100003 + iy;

function segSegDist(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const pointSeg = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => {
    const vx = rx - qx;
    const vy = ry - qy;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - qx) * vx + (py - qy) * vy) / l2)) : 0;
    return Math.hypot(px - (qx + vx * t), py - (qy + vy * t));
  };
  const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 * o2 < 0 && o3 * o4 < 0) return 0;
  return Math.min(
    pointSeg(ax, ay, cx, cy, dx, dy),
    pointSeg(bx, by, cx, cy, dx, dy),
    pointSeg(cx, cy, ax, ay, bx, by),
    pointSeg(dx, dy, ax, ay, bx, by),
  );
}

function pointInConvex(px: number, py: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < 1e-12) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The four corners of the hero's chassis box at a pose (district plane). */
export function heroCorners(x: number, y: number, headingDeg: number): Array<[number, number]> {
  const h = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(h);
  const fy = Math.cos(h);
  const rx = Math.cos(h);
  const ry = -Math.sin(h);
  const L = HERO_HALF_LENGTH_M;
  const W = HERO_HALF_WIDTH_M;
  return [
    [x + fx * L + rx * W, y + fy * L + ry * W],
    [x + fx * L - rx * W, y + fy * L - ry * W],
    [x - fx * L - rx * W, y - fy * L - ry * W],
    [x - fx * L + rx * W, y - fy * L + ry * W],
  ];
}

/** The product's static bodies of a district, flattened onto the district plane. */
export function ringStaticBodies(districtRaw: unknown): RingStaticBodies {
  const geo = buildWorldGeometry(assertDistrict(districtRaw));
  const { sidewalks, buildings } = geo.colliders;
  const split = splitDriveOverSurface(sidewalks);
  const tris: Tri[] = [];
  const counts: Record<StaticBodyKind, number> = { pavement: 0, wall: 0, building: 0 };
  const add = (kind: StaticBodyKind, positions: ArrayLike<number>, indices: ArrayLike<number>) => {
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const a = indices[t] * 3;
      const b = indices[t + 1] * 3;
      const c = indices[t + 2] * 3;
      tris.push({
        kind,
        ax: positions[a], ay: -positions[a + 2],
        bx: positions[b], by: -positions[b + 2],
        cx: positions[c], cy: -positions[c + 2],
      });
      counts[kind]++;
    }
  };
  add("pavement", split.driveOver.positions, split.driveOver.indices);
  add("wall", split.walls.positions, split.walls.indices);
  add("building", buildings.positions, buildings.indices);
  const grid = new Map<number, number[]>();
  tris.forEach((t, i) => {
    const x0 = Math.floor(Math.min(t.ax, t.bx, t.cx) / CELL_M);
    const x1 = Math.floor(Math.max(t.ax, t.bx, t.cx) / CELL_M);
    const y0 = Math.floor(Math.min(t.ay, t.by, t.cy) / CELL_M);
    const y1 = Math.floor(Math.max(t.ay, t.by, t.cy) / CELL_M);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = cellKey(ix, iy);
        let cell = grid.get(k);
        if (cell === undefined) grid.set(k, (cell = []));
        cell.push(i);
      }
    }
  });
  return {
    counts,
    clearance(x, y, headingDeg) {
      const box = heroCorners(x, y, headingDeg);
      let best = Infinity;
      let kind: StaticBodyKind | null = null;
      const seen = new Set<number>();
      const cx = Math.floor(x / CELL_M);
      const cy = Math.floor(y / CELL_M);
      // The search reaches one cell (8 m) each way: more than the box's own
      // reach (2.2 m) plus any clearance a pin asks about.
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iy = cy - 1; iy <= cy + 1; iy++) {
          for (const i of grid.get(cellKey(ix, iy)) ?? []) {
            if (seen.has(i)) continue;
            seen.add(i);
            const t = tris[i];
            const tri: Array<[number, number]> = [[t.ax, t.ay], [t.bx, t.by], [t.cx, t.cy]];
            let d = Infinity;
            if (pointInConvex(box[0][0], box[0][1], tri) || pointInConvex(t.ax, t.ay, box)) d = 0;
            for (let e = 0; e < 4 && d > 0; e++) {
              const [px, py] = box[e];
              const [qx, qy] = box[(e + 1) % 4];
              for (let f = 0; f < 3 && d > 0; f++) {
                const [rx, ry] = tri[f];
                const [sx, sy] = tri[(f + 1) % 3];
                d = Math.min(d, segSegDist(px, py, qx, qy, rx, ry, sx, sy));
              }
            }
            if (d < best) {
              best = d;
              kind = t.kind;
            }
          }
        }
      }
      return { m: best, kind };
    },
  };
}

export interface BicyclePose {
  tSec: number;
  x: number;
  y: number;
  /** Body heading of a no-slip car whose CENTRE is on the recorded path. */
  headingDeg: number;
  /** Signed body-vs-tangent angle, deg. */
  lagDeg: number;
  /** Radius the rear axle is turning on, m (Infinity: straight). */
  rearRadiusM: number;
  /** Road-wheel angle the bicycle needs here, rad (|…|). */
  steerRad: number;
}

/**
 * The car a recorded centre path asks for. The centre moves along the recorded
 * chord; the rear axle (REAR_AXLE_BEHIND_CENTRE_M behind it) may only roll
 * along the body, so the body's yaw rate is v·sin(β)/a, β the angle of the
 * centre's velocity off the body axis — integrated here sample by sample from
 * a body that starts along the path. Forward gear only (no ring demo reverses).
 */
export function bicycleOnPath(samples: readonly TraceSample[]): BicyclePose[] {
  const a = REAR_AXLE_BEHIND_CENTRE_M;
  const out: BicyclePose[] = [];
  let theta = (samples[0].headingDeg * Math.PI) / 180;
  out.push({ tSec: samples[0].tSec, x: samples[0].x, y: samples[0].y, headingDeg: samples[0].headingDeg, lagDeg: 0, rearRadiusM: Infinity, steerRad: 0 });
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    const dist = Math.hypot(dx, dy);
    let rearRadiusM = Infinity;
    let steerRad = 0;
    if (dist > 1e-6) {
      const course = Math.atan2(dx, dy);
      // Sub-step so a 0.2 m sample never turns the body in one lump.
      const n = Math.max(1, Math.ceil(dist / 0.01));
      for (let k = 0; k < n; k++) {
        const beta = Math.atan2(Math.sin(course - theta), Math.cos(course - theta));
        theta += (Math.sin(beta) / a) * (dist / n);
      }
      const beta = Math.atan2(Math.sin(course - theta), Math.cos(course - theta));
      const tanB = Math.tan(beta);
      rearRadiusM = Math.abs(tanB) > 1e-9 ? Math.abs(a / tanB) : Infinity;
      steerRad = Number.isFinite(rearRadiusM) ? Math.atan(WHEELBASE_M / rearRadiusM) : 0;
    }
    const tangent = (samples[i].headingDeg * Math.PI) / 180;
    const lag = Math.atan2(Math.sin(theta - tangent), Math.cos(theta - tangent));
    out.push({
      tSec: samples[i].tSec,
      x: samples[i].x,
      y: samples[i].y,
      headingDeg: (theta * 180) / Math.PI,
      lagDeg: (lag * 180) / Math.PI,
      rearRadiusM,
      steerRad,
    });
  }
  return out;
}
