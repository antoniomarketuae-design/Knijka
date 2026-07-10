/**
 * Road decals — cracks, repair patches, oil stains, manholes, dirt pools —
 * as ONE batched quad mesh sharing ONE atlas texture = ONE draw call
 * (doc 71 §4.4). NOT THREE.DecalGeometry (roads are flat planes) and NOT
 * Y-lifted (lifted quads shear at grazing cockpit angles): quads are emitted
 * EXACTLY co-planar with the asphalt at ROAD_DECAL_Y; the renderer resolves
 * the depth tie with polygonOffset (StaticWorld).
 *
 * Placement is deterministic (seeded per edge id, independent of iteration
 * order): ~one decal per ROAD_DECAL_SPACING_M of ribbon centreline, inset
 * ROAD_DECAL_END_INSET_M from the ribbon ends so junction paint (stop lines,
 * corner zebras) stays clean. Manholes avoid lane lines by hugging a lane
 * centre; patches align with the travel direction.
 *
 * The atlas layout below is the SINGLE source of truth shared with the
 * procedural canvas generator (textures/decalAtlas.ts) — cells address a
 * 4x4 grid of a square texture in UV space (v = 0 at the bottom, flipY
 * handled by the generator).
 */

import { LANE_WIDTH_M, ROAD_DECAL_END_INSET_M, ROAD_DECAL_SPACING_M, ROAD_DECAL_Y } from "./constants";
import { add, hashString, mul, mulberry32, perpRight, pointAlong, polylineLength, type Vec2 } from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import type { RoadNetwork } from "./network";

// ---------------------------------------------------------------------------
// Atlas manifest (4x4 grid; 6 cells used in v1)
// ---------------------------------------------------------------------------

export type DecalKind = "crackA" | "crackB" | "patch" | "oil" | "manhole" | "dirt";

export interface DecalCell {
  kind: DecalKind;
  /** Atlas grid column/row (row 0 = BOTTOM of the texture, v0 = row/4). */
  cell: [number, number];
  /** World size range (metres, square footprint scaled by aspect). */
  minSizeM: number;
  maxSizeM: number;
  /** Height/width ratio of the quad (1 = square). */
  aspect: number;
  /** Placement weight (relative pick probability). */
  weight: number;
}

export const DECAL_ATLAS_GRID = 4;

export const DECAL_CELLS: readonly DecalCell[] = [
  { kind: "crackA", cell: [0, 0], minSizeM: 2.6, maxSizeM: 4.5, aspect: 1, weight: 0.2 },
  { kind: "crackB", cell: [1, 0], minSizeM: 2.4, maxSizeM: 4.0, aspect: 1, weight: 0.16 },
  { kind: "patch", cell: [2, 0], minSizeM: 2.6, maxSizeM: 5.0, aspect: 0.7, weight: 0.22 },
  { kind: "oil", cell: [3, 0], minSizeM: 1.3, maxSizeM: 2.3, aspect: 1, weight: 0.16 },
  { kind: "manhole", cell: [0, 1], minSizeM: 0.85, maxSizeM: 1.0, aspect: 1, weight: 0.16 },
  { kind: "dirt", cell: [1, 1], minSizeM: 1.6, maxSizeM: 3.0, aspect: 1, weight: 0.1 },
];

/** UV rect [u0, v0, u1, v1] of a cell (small inset guards filter bleed). */
export function decalCellUvRect(cell: [number, number]): [number, number, number, number] {
  const s = 1 / DECAL_ATLAS_GRID;
  const inset = s * 0.02;
  return [
    cell[0] * s + inset,
    cell[1] * s + inset,
    (cell[0] + 1) * s - inset,
    (cell[1] + 1) * s - inset,
  ];
}

function pickCell(rng: () => number): DecalCell {
  const total = DECAL_CELLS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of DECAL_CELLS) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return DECAL_CELLS[0]!;
}

// ---------------------------------------------------------------------------
// Placement + quad emission
// ---------------------------------------------------------------------------

export interface DecalBuildResult {
  decals: MeshAccumulator;
  count: number;
}

/** Rotate `p` by angle a (district space). */
const rot = (p: Vec2, a: number): Vec2 => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];

export function buildRoadDecals(network: RoadNetwork, seed: number): DecalBuildResult {
  const acc = new MeshAccumulator();
  let count = 0;

  for (const eb of network.edges) {
    if (!eb.line) continue;
    const length = polylineLength(eb.line);
    const usable = length - 2 * ROAD_DECAL_END_INSET_M;
    if (usable <= 4) continue;
    const n = Math.floor(length / ROAD_DECAL_SPACING_M);
    if (n < 1) continue;
    // Seeded per edge id so placement survives edge-list reordering.
    const rng = mulberry32((seed ^ hashString(eb.edge.id)) >>> 0);
    const travelHalf = eb.halfWidth - eb.parkingM;
    const lanes = Math.max(1, eb.edge.lanes);

    for (let k = 0; k < n; k++) {
      const cell = pickCell(rng);
      const size = cell.minSizeM + rng() * (cell.maxSizeM - cell.minSizeM);
      const hu = size / 2; // half-extent along the quad's local x
      const hv = (size * cell.aspect) / 2;
      const margin = Math.max(hu, hv) + 0.3;
      if (travelHalf <= margin) continue; // ribbon too thin for this decal

      // Longitudinal slot: k-th of n even slots, jittered — spreads decals
      // out instead of clumping while staying deterministic.
      const slot = usable / n;
      const s = ROAD_DECAL_END_INSET_M + slot * (k + 0.2 + rng() * 0.6);
      const { point, tangent } = pointAlong(eb.line, s);

      // Lateral: manholes/oil hug a lane centre (never ON a lane line —
      // real ironwork sits in the lane, doc 05 §5); the rest roam the
      // travel band.
      let lateral: number;
      if (cell.kind === "manhole" || cell.kind === "oil") {
        const lane = Math.floor(rng() * lanes);
        const laneCenter = -travelHalf + (lane + 0.5) * LANE_WIDTH_M;
        const wobble = (0.5 + rng()) * (rng() < 0.5 ? -1 : 1); // ±0.5–1.5 m
        lateral = Math.max(-travelHalf + margin, Math.min(travelHalf - margin, laneCenter + wobble));
      } else {
        lateral = (rng() * 2 - 1) * (travelHalf - margin);
      }

      // Rotation: repair patches align with travel (axis-aligned-ish), the
      // rest rotate freely.
      const roadAngle = Math.atan2(tangent[1], tangent[0]);
      const angle =
        cell.kind === "patch" ? roadAngle + (rng() - 0.5) * 0.3 : rng() * Math.PI * 2;

      const center = add(point, mul(perpRight(tangent), lateral));
      const [u0, v0, u1, v1] = decalCellUvRect(cell.cell);

      // CCW quad in district space (faces up after world mapping).
      const corners: Vec2[] = [
        add(center, rot([-hu, -hv], angle)),
        add(center, rot([hu, -hv], angle)),
        add(center, rot([hu, hv], angle)),
        add(center, rot([-hu, hv], angle)),
      ];
      const uvs: [number, number][] = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      const idx = corners.map((c, j) =>
        acc.vertex(toWorld(c[0], c[1], ROAD_DECAL_Y), UP, uvs[j]!),
      );
      acc.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
      count++;
    }
  }

  return { decals: acc, count };
}
