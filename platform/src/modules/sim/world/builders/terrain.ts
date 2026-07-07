/**
 * Terrain: one ground plane over the district bounds (+margin) with subtle
 * deterministic value-noise relief, flattened near roads and buildings so
 * nothing pokes through the (flat) physics ground plane where you drive.
 * Visual only — the collider stays a flat box (see colliders.ts).
 */

import type { District } from "../types";
import {
  TERRAIN_FLAT_NEAR_ROAD_M,
  TERRAIN_FULL_RELIEF_M,
  TERRAIN_MARGIN_M,
  TERRAIN_MAX_RELIEF_M,
} from "./constants";
import { SegmentGrid, valueNoise2D, type Vec2 } from "./math2d";
import { MeshAccumulator } from "./mesh";
import type { RoadNetwork } from "./network";

const GRASS_UV_SCALE = 1 / 8;

export function buildTerrain(
  district: District,
  network: RoadNetwork,
  buildingAabbs: [number, number, number, number][],
  segments: number,
): MeshAccumulator {
  const b = district.meta.boundsLocalMeters;
  const minX = b.minX - TERRAIN_MARGIN_M;
  const minY = b.minY - TERRAIN_MARGIN_M;
  const maxX = b.maxX + TERRAIN_MARGIN_M;
  const maxY = b.maxY + TERRAIN_MARGIN_M;
  const nx = segments;
  const ny = segments;
  const dx = (maxX - minX) / nx;
  const dy = (maxY - minY) / ny;

  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  const nearBuilding = (p: Vec2, pad: number) =>
    buildingAabbs.some(
      ([x0, y0, x1, y1]) =>
        p[0] > x0 - pad && p[0] < x1 + pad && p[1] > y0 - pad && p[1] < y1 + pad,
    );

  const heightAt = (x: number, y: number): number => {
    const p: Vec2 = [x, y];
    const road = roadGrid.distanceTo(p, TERRAIN_FULL_RELIEF_M + 1);
    if (road <= TERRAIN_FLAT_NEAR_ROAD_M) return 0;
    if (nearBuilding(p, 6)) return 0;
    const mask = Math.min(
      1,
      (road - TERRAIN_FLAT_NEAR_ROAD_M) / (TERRAIN_FULL_RELIEF_M - TERRAIN_FLAT_NEAR_ROAD_M),
    );
    const n =
      valueNoise2D(x * 0.02, y * 0.02, 7) * 0.7 + valueNoise2D(x * 0.07, y * 0.07, 13) * 0.3;
    return n * TERRAIN_MAX_RELIEF_M * mask * mask;
  };

  // Height grid first, then normals from central differences.
  const hs = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      hs[j * (nx + 1) + i] = heightAt(minX + i * dx, minY + j * dy);
    }
  }

  const acc = new MeshAccumulator();
  const idxOf = (i: number, j: number) => j * (nx + 1) + i;
  const vertIdx = new Int32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = minX + i * dx;
      const y = minY + j * dy;
      const h = hs[idxOf(i, j)]!;
      const hl = hs[idxOf(Math.max(0, i - 1), j)]!;
      const hr = hs[idxOf(Math.min(nx, i + 1), j)]!;
      const hd = hs[idxOf(i, Math.max(0, j - 1))]!;
      const hu = hs[idxOf(i, Math.min(ny, j + 1))]!;
      // District-space gradient -> world normal (y-up, z = -districtY).
      const gx = (hr - hl) / (2 * dx);
      const gy = (hu - hd) / (2 * dy);
      const inv = 1 / Math.hypot(gx, 1, gy);
      vertIdx[idxOf(i, j)] = acc.vertex(
        [x, h - 0.01, -y],
        [-gx * inv, inv, gy * inv],
        [x * GRASS_UV_SCALE, y * GRASS_UV_SCALE],
      );
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // District-CCW quad: (i,j) -> (i+1,j) -> (i+1,j+1) -> (i,j+1).
      acc.quad(
        vertIdx[idxOf(i, j)]!,
        vertIdx[idxOf(i + 1, j)]!,
        vertIdx[idxOf(i + 1, j + 1)]!,
        vertIdx[idxOf(i, j + 1)]!,
      );
    }
  }
  return acc;
}
