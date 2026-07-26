/**
 * Terrain: one ground plane over the district bounds (+margin) with subtle
 * deterministic value-noise relief, flattened near roads and buildings so
 * nothing pokes through the (flat) physics ground plane where you drive.
 * Visual only — the collider stays a flat box (see colliders.ts).
 *
 * The single ground grid is split into two co-planar meshes that share the
 * exact same vertex positions/normals (so there are no seams): `grass` for
 * open space and `paved` for the built-up fabric — cells near buildings become
 * concrete courtyards/parking. This "ground-use zoning" is the code-only fix
 * that turns "park with roads" into "city" (see TERRAIN_PAVE_NEAR_BUILDING_M).
 */

import type { District } from "../types";
import {
  TERRAIN_FLAT_NEAR_ROAD_M,
  TERRAIN_FULL_RELIEF_M,
  TERRAIN_MARGIN_M,
  TERRAIN_MAX_RELIEF_M,
  TERRAIN_PAVE_NEAR_BUILDING_M,
} from "./constants";
import { AabbGrid, SegmentGrid, valueNoise2D, type Vec2 } from "./math2d";
import { MeshAccumulator } from "./mesh";
import type { RoadNetwork } from "./network";

const GRASS_UV_SCALE = 1 / 8;
/** Concrete pavement tiles finer than grass so courtyards read as pavers. */
const PAVED_UV_SCALE = 1 / 4;

export interface TerrainMeshes {
  /** Open ground (parks, verges, district edges). */
  grass: MeshAccumulator;
  /** Concrete courtyards/parking within the built-up fabric. */
  paved: MeshAccumulator;
}

export function buildTerrain(
  district: District,
  network: RoadNetwork,
  buildingAabbs: [number, number, number, number][],
  segments: number,
): TerrainMeshes {
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

  // Same predicate, bucketed: `segments²` cells × every footprint was linear,
  // and doc 82 V7 multiplied the footprint count by ~380 on the city map
  // (AabbGrid's header carries the measurement).
  const buildingGrid = new AabbGrid(24);
  for (const box of buildingAabbs) buildingGrid.add(box);
  const nearBuilding = (p: Vec2, pad: number) => buildingGrid.hits(p, pad);

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

  const nCols = nx + 1;
  const idxOf = (i: number, j: number) => j * nCols + i;

  // Height grid first, then normals from central differences.
  const hs = new Float32Array(nCols * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      hs[idxOf(i, j)] = heightAt(minX + i * dx, minY + j * dy);
    }
  }

  const grass = new MeshAccumulator();
  const paved = new MeshAccumulator();
  // Per-mesh vertex caches — a boundary vertex is emitted into each mesh it
  // borders (with that mesh's UV scale), so the two meshes tile gap-free.
  const grassVert = new Int32Array(nCols * (ny + 1)).fill(-1);
  const pavedVert = new Int32Array(nCols * (ny + 1)).fill(-1);

  const emitVertex = (
    acc: MeshAccumulator,
    cache: Int32Array,
    uvScale: number,
    i: number,
    j: number,
  ): number => {
    const key = idxOf(i, j);
    const cached = cache[key]!;
    if (cached >= 0) return cached;
    const x = minX + i * dx;
    const y = minY + j * dy;
    const h = hs[key]!;
    const hl = hs[idxOf(Math.max(0, i - 1), j)]!;
    const hr = hs[idxOf(Math.min(nx, i + 1), j)]!;
    const hd = hs[idxOf(i, Math.max(0, j - 1))]!;
    const hu = hs[idxOf(i, Math.min(ny, j + 1))]!;
    // District-space gradient -> world normal (y-up, z = -districtY).
    const gx = (hr - hl) / (2 * dx);
    const gy = (hu - hd) / (2 * dy);
    const inv = 1 / Math.hypot(gx, 1, gy);
    const vi = acc.vertex(
      [x, h - 0.01, -y],
      [-gx * inv, inv, gy * inv],
      [x * uvScale, y * uvScale],
    );
    cache[key] = vi;
    return vi;
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // Classify the cell by its centre's proximity to a building footprint.
      const ccx = minX + (i + 0.5) * dx;
      const ccy = minY + (j + 0.5) * dy;
      const isPaved = nearBuilding([ccx, ccy], TERRAIN_PAVE_NEAR_BUILDING_M);
      const acc = isPaved ? paved : grass;
      const cache = isPaved ? pavedVert : grassVert;
      const uvScale = isPaved ? PAVED_UV_SCALE : GRASS_UV_SCALE;
      // District-CCW quad: (i,j) -> (i+1,j) -> (i+1,j+1) -> (i,j+1).
      acc.quad(
        emitVertex(acc, cache, uvScale, i, j),
        emitVertex(acc, cache, uvScale, i + 1, j),
        emitVertex(acc, cache, uvScale, i + 1, j + 1),
        emitVertex(acc, cache, uvScale, i, j + 1),
      );
    }
  }
  return { grass, paved };
}
