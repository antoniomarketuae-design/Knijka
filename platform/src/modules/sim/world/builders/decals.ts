/**
 * Road decals — cracks, repair patches, oil stains, manholes, dirt pools —
 * as ONE batched quad mesh sharing ONE atlas texture = ONE draw call
 * (doc 71 §4.4). NOT THREE.DecalGeometry (roads are flat planes) and NOT
 * Y-lifted (lifted quads shear at grazing cockpit angles): quads are emitted
 * EXACTLY co-planar with the asphalt at ROAD_DECAL_Y; the renderer resolves
 * the depth tie with polygonOffset (StaticWorld).
 *
 * Placement is deterministic (seeded per edge id / per node id, independent
 * of iteration order): ~one decal per ROAD_DECAL_SPACING_M of ribbon
 * centreline, inset ROAD_DECAL_END_INSET_M from the ribbon ends so junction
 * paint (stop lines, corner zebras) stays clean. The inset applies to the
 * decal's EDGE, not its centre — each cell adds its own along-ribbon
 * half-extent (alongRibbonHalf), because a 5 m `patch` rotated onto the
 * ribbon axis reaches 2.5 m past its centre and a single global constant
 * cannot express that. Manholes avoid lane lines by hugging a lane centre;
 * patches align with the travel direction.
 *
 * PAINT ALWAYS WINS. Both passes reject any quad that lands within
 * DECAL_MARKING_CLEARANCE_M of the markings mesh (MarkingKeepOut below) and
 * re-draw the slot up to DECAL_PLACEMENT_ATTEMPTS times. Grime on asphalt is
 * the whole point of the wear system; grime under a zebra bar or a stop line
 * reads as a bug and costs marking legibility — and the rule engine grades
 * the student on seeing exactly those markings.
 *
 * JUNCTION WEAR (doc 82 V4) is a second pass into the SAME accumulator, so it
 * is still one mesh, one atlas, one draw call. It exists because the ribbon
 * pass structurally cannot reach a junction: ribbons are trimmed back to the
 * approach cuts, so the open patch — ~1,600 m² on a perceptually-scaled
 * 4-way, and the single most driven surface in the world — carried no wear at
 * all. Each decal is placed inside the fan triangle (node, approach.right,
 * approach.left) that buildJunctionPatch itself emits, which is what makes
 * containment EXACT rather than a radius guess: on a T-junction the patch is
 * not a disc, and a disc-sampled decal would float on the grass of the open
 * side.
 *
 * The atlas layout below is the SINGLE source of truth shared with the
 * procedural canvas generator (textures/decalAtlas.ts) — cells address a
 * 4x4 grid of a square texture in UV space (v = 0 at the bottom, flipY
 * handled by the generator).
 */

import {
  DECAL_MARKING_CLEARANCE_M,
  DECAL_PLACEMENT_ATTEMPTS,
  JUNCTION_DECAL_AREA_M2,
  JUNCTION_DECAL_MAX_PER_APPROACH,
  JUNCTION_DECAL_Y,
  LANE_WIDTH_M,
  ROAD_DECAL_END_INSET_M,
  ROAD_DECAL_SPACING_M,
  ROAD_DECAL_Y,
} from "./constants";
import {
  add,
  dist,
  hashString,
  mul,
  mulberry32,
  perpRight,
  pointAlong,
  polylineLength,
  sub,
  type Vec2,
} from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import type { NodeInfo, RoadNetwork } from "./network";

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
  /** Placement weight on ribbons (relative pick probability). */
  weight: number;
  /**
   * Placement weight inside a JUNCTION (doc 82 V4). A junction wears
   * differently from the open road, so the mix is different, not just denser:
   * oil and dirt collect where traffic idles at the stop line, ironwork
   * clusters at junctions (that is where the services cross), and utility
   * trench repairs are cut across mouths — while long running cracks are a
   * mid-block, thermal-fatigue defect. Weights are relative within this
   * column; they do not have to sum to the ribbon column.
   */
  junctionWeight: number;
}

export const DECAL_ATLAS_GRID = 4;

export const DECAL_CELLS: readonly DecalCell[] = [
  { kind: "crackA", cell: [0, 0], minSizeM: 2.6, maxSizeM: 4.5, aspect: 1, weight: 0.2, junctionWeight: 0.12 },
  { kind: "crackB", cell: [1, 0], minSizeM: 2.4, maxSizeM: 4.0, aspect: 1, weight: 0.16, junctionWeight: 0.08 },
  { kind: "patch", cell: [2, 0], minSizeM: 2.6, maxSizeM: 5.0, aspect: 0.7, weight: 0.22, junctionWeight: 0.24 },
  { kind: "oil", cell: [3, 0], minSizeM: 1.3, maxSizeM: 2.3, aspect: 1, weight: 0.16, junctionWeight: 0.3 },
  { kind: "manhole", cell: [0, 1], minSizeM: 0.85, maxSizeM: 1.0, aspect: 1, weight: 0.16, junctionWeight: 0.22 },
  { kind: "dirt", cell: [1, 1], minSizeM: 1.6, maxSizeM: 3.0, aspect: 1, weight: 0.1, junctionWeight: 0.04 },
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

/** Weighted pick over the atlas cells; `weightOf` selects the column (open
 *  road vs junction interior). */
function pickCell(rng: () => number, weightOf: (c: DecalCell) => number): DecalCell {
  const total = DECAL_CELLS.reduce((s, c) => s + weightOf(c), 0);
  let r = rng() * total;
  for (const c of DECAL_CELLS) {
    r -= weightOf(c);
    if (r <= 0) return c;
  }
  return DECAL_CELLS[0]!;
}

const ribbonWeight = (c: DecalCell): number => c.weight;
const junctionWeight = (c: DecalCell): number => c.junctionWeight;

// ---------------------------------------------------------------------------
// Marking keep-out — no decal is allowed under paint
// ---------------------------------------------------------------------------

/**
 * Separating-axis test with a clearance band: true when the convex polygons
 * `a` and `b` come within `gap` of each other (plain overlap at gap = 0).
 *
 * Axes are unit-normalised, so the per-axis slack IS a distance in metres —
 * the test is therefore `a` grown by `gap` against `b`, which slightly
 * over-reports near corners (the Minkowski sum of a box and a disc has round
 * corners, the axis test has square ones). Over-reporting rejects a decal that
 * was marginally clear, which is the safe direction: paint wins ties.
 */
function convexWithin(a: readonly Vec2[], b: readonly Vec2[], gap: number): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const l = Math.hypot(ex, ey);
      if (l < 1e-9) continue; // degenerate edge (repeated apex) carries no axis
      const nx = -ey / l;
      const ny = ex / l;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const d = v[0] * nx + v[1] * ny;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const d = v[0] * nx + v[1] * ny;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }
      if (minA - maxB > gap || minB - maxA > gap) return false; // separated
    }
  }
  return true;
}

/** Grid cell for the keep-out hash. Comfortably larger than the biggest atlas
 *  cell (5 m) so a decal query never spans more than a 2x2 block of cells. */
const KEEP_OUT_CELL_M = 8;

/**
 * Spatial hash over the PAINTED MARKING TRIANGLES, so both decal passes can
 * ask "would this quad land on paint?" in ~constant time.
 *
 * It is built from the markings MeshAccumulator itself rather than from a
 * re-derivation of where markings.ts puts its paint. That is deliberate: the
 * marking set keeps growing (stop lines, zebras, bay U-shapes, zone solids,
 * lane arrows, painted speed numerals) and a hand-written keep-out would
 * silently miss whichever kind lands next. Reading the mesh means the keep-out
 * covers every kind by construction, and the test can assert against exactly
 * the same buffer the renderer draws.
 *
 * Marking vertices are world-space (x, y, z) with district y = −z (mesh.ts
 * toWorld); triangles are mapped straight back to district space here.
 */
export class MarkingKeepOut {
  private tris: [Vec2, Vec2, Vec2][] = [];
  private cells = new Map<string, number[]>();
  /** Query stamp per triangle — dedupes candidates across grid cells without
   *  allocating a Set per query (there is one query per decal attempt). */
  private stamp: number[] = [];
  private query = 0;

  constructor(
    markings: MeshAccumulator,
    private readonly clearanceM: number = DECAL_MARKING_CLEARANCE_M,
  ) {
    const pos = markings.positionsView;
    const idx = markings.indicesView;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const tri: [Vec2, Vec2, Vec2] = [
        [pos[idx[t]! * 3]!, -pos[idx[t]! * 3 + 2]!],
        [pos[idx[t + 1]! * 3]!, -pos[idx[t + 1]! * 3 + 2]!],
        [pos[idx[t + 2]! * 3]!, -pos[idx[t + 2]! * 3 + 2]!],
      ];
      const i = this.tris.length;
      this.tris.push(tri);
      this.stamp.push(-1);
      const minX = Math.min(tri[0][0], tri[1][0], tri[2][0]);
      const maxX = Math.max(tri[0][0], tri[1][0], tri[2][0]);
      const minY = Math.min(tri[0][1], tri[1][1], tri[2][1]);
      const maxY = Math.max(tri[0][1], tri[1][1], tri[2][1]);
      for (let cx = Math.floor(minX / KEEP_OUT_CELL_M); cx <= Math.floor(maxX / KEEP_OUT_CELL_M); cx++) {
        for (let cy = Math.floor(minY / KEEP_OUT_CELL_M); cy <= Math.floor(maxY / KEEP_OUT_CELL_M); cy++) {
          const key = `${cx},${cy}`;
          let bucket = this.cells.get(key);
          if (!bucket) this.cells.set(key, (bucket = []));
          bucket.push(i);
        }
      }
    }
  }

  /** True when the decal quad `corners` is on, or within the clearance of,
   *  any painted marking — i.e. the placement must be re-drawn or dropped. */
  blocks(corners: readonly Vec2[]): boolean {
    if (this.tris.length === 0) return false;
    const pad = this.clearanceM;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    }
    const q = this.query++;
    for (let cx = Math.floor((minX - pad) / KEEP_OUT_CELL_M); cx <= Math.floor((maxX + pad) / KEEP_OUT_CELL_M); cx++) {
      for (let cy = Math.floor((minY - pad) / KEEP_OUT_CELL_M); cy <= Math.floor((maxY + pad) / KEEP_OUT_CELL_M); cy++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const i of bucket) {
          if (this.stamp[i] === q) continue;
          this.stamp[i] = q;
          if (convexWithin(corners, this.tris[i]!, pad)) return true;
        }
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Placement + quad emission
// ---------------------------------------------------------------------------

export interface DecalBuildResult {
  decals: MeshAccumulator;
  /** TOTAL quads in the batch (ribbon pass + junction pass). */
  count: number;
  /** How many of `count` came from the junction pass (doc 82 V4). */
  junctionCount: number;
}

/** Rotate `p` by angle a (district space). */
const rot = (p: Vec2, a: number): Vec2 => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];

/** The four district-space corners of a decal quad, CCW. Computed BEFORE the
 *  quad is emitted so the marking keep-out can veto the placement. */
function decalCorners(center: Vec2, hu: number, hv: number, angle: number): Vec2[] {
  return [
    add(center, rot([-hu, -hv], angle)),
    add(center, rot([hu, -hv], angle)),
    add(center, rot([hu, hv], angle)),
    add(center, rot([-hu, hv], angle)),
  ];
}

/**
 * Repair patches align with the ribbon / mouth axis to within this much
 * (radians, half the jitter band). Named because the ribbon end-clearance
 * bound below depends on it: `patch` is the one cell whose rotation is NOT
 * free, so it is the one cell whose along-ribbon reach is smaller than its
 * circumradius — and it is also the widest cell in the atlas, which is what
 * made the old centre-based inset overhang the approach cut.
 */
const PATCH_ALIGN_JITTER_RAD = 0.15;

/**
 * Half-extent of a decal quad ALONG the ribbon — the clearance it needs at
 * each ribbon end on top of ROAD_DECAL_END_INSET_M.
 *
 * Free-rotating cells can present any diagonal to the ribbon, so their reach
 * is the circumradius. A `patch` is drawn at roadAngle ± PATCH_ALIGN_JITTER_
 * RAD, so its reach is max(hu·cosΔ + hv·sinΔ) over that cone = hypot(hu, hv)·
 * cos(Δ − atan2(hv, hu)), maximised at Δ = min(atan2(hv, hu), jitter).
 */
function alongRibbonHalf(cell: DecalCell, hu: number, hv: number): number {
  if (cell.kind !== "patch") return Math.hypot(hu, hv);
  const d = Math.min(Math.atan2(hv, hu), PATCH_ALIGN_JITTER_RAD);
  return hu * Math.cos(d) + hv * Math.sin(d);
}

/** One atlas-cell quad, CCW in district space (faces up after world mapping),
 *  emitted EXACTLY on plane `y` — never lifted (see the header). */
function emitDecalQuad(
  acc: MeshAccumulator,
  cell: DecalCell,
  corners: readonly Vec2[],
  y: number,
): void {
  const [u0, v0, u1, v1] = decalCellUvRect(cell.cell);
  const uvs: [number, number][] = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];
  const idx = corners.map((c, j) => acc.vertex(toWorld(c[0], c[1], y), UP, uvs[j]!));
  acc.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
}


/**
 * Junction-interior wear for ONE node, into the shared accumulator.
 *
 * Containment is exact rather than approximate: for each approach the patch
 * builder emits the fan triangle (node.pos, approach.right, approach.left),
 * so anything inside that triangle is guaranteed to be on asphalt whatever
 * the junction's shape. A decal is a quad, so the sample is additionally
 * pulled toward the triangle's INCENTRE by (1 − R / r_in), where R is the
 * quad's circumradius and r_in the incircle radius — the exact erosion that
 * keeps all four corners inside the triangle. A decal too big for its mouth
 * (R ≥ r_in) is skipped rather than clipped.
 *
 * Containment on asphalt is not enough on its own: the mouth is also where
 * paint is DENSEST (the stop line sits at cut + STOP_LINE_BEYOND_CUT_M, the
 * zebra bars hug the crossing), and the first cut of this pass sampled the
 * whole fan with no regard for it — oil and trench patches landed straight
 * under the give-way dashes. Every candidate is now tested against
 * `keepOut`, and the slot re-drawn, before it is emitted.
 */
function buildNodeDecals(
  acc: MeshAccumulator,
  node: NodeInfo,
  seed: number,
  keepOut: MarkingKeepOut,
): number {
  if (node.approaches.length < 2) return 0; // no patch is drawn here
  // Seeded per node id so placement survives node-map reordering.
  const rng = mulberry32((seed ^ hashString(node.id)) >>> 0);
  let count = 0;

  for (const ap of node.approaches) {
    const p0 = node.pos;
    const p1 = ap.right;
    const p2 = ap.left;
    const e1 = sub(p1, p0);
    const e2 = sub(p2, p0);
    const area = Math.abs(e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    if (area < 1) continue;
    const a = dist(p1, p2); // side opposite p0
    const b = dist(p0, p2); // side opposite p1
    const c = dist(p0, p1); // side opposite p2
    const perimeter = a + b + c;
    if (perimeter <= 0) continue;
    const rIn = (2 * area) / perimeter;
    // Incentre: sides weight the opposite vertices.
    const incentre: Vec2 = [
      (a * p0[0] + b * p1[0] + c * p2[0]) / perimeter,
      (a * p0[1] + b * p1[1] + c * p2[1]) / perimeter,
    ];
    const n = Math.min(
      JUNCTION_DECAL_MAX_PER_APPROACH,
      Math.round(area / JUNCTION_DECAL_AREA_M2),
    );

    for (let k = 0; k < n; k++) {
      // Re-draw the whole candidate (cell, size, sample, rotation) when it
      // lands on paint: a mouth is small and its paint is fixed, so nudging
      // one parameter would just walk along the same stop line.
      for (let attempt = 0; attempt < DECAL_PLACEMENT_ATTEMPTS; attempt++) {
        const cell = pickCell(rng, junctionWeight);
        const size = cell.minSizeM + rng() * (cell.maxSizeM - cell.minSizeM);
        const hu = size / 2;
        const hv = (size * cell.aspect) / 2;
        const shrink = 1 - Math.hypot(hu, hv) / rIn;
        if (shrink <= 0) continue; // quad is wider than the mouth's incircle

        // Uniform barycentric sample of the fan triangle (fold the far half).
        let u = rng();
        let v = rng();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const p: Vec2 = [p0[0] + u * e1[0] + v * e2[0], p0[1] + u * e1[1] + v * e2[1]];
        const center: Vec2 = [
          incentre[0] + (p[0] - incentre[0]) * shrink,
          incentre[1] + (p[1] - incentre[1]) * shrink,
        ];

        // Trench repairs are cut ACROSS the mouth (utility crossings run
        // perpendicular to the street they cross); everything else is random.
        const acrossAngle = Math.atan2(ap.dir[0], -ap.dir[1]);
        const angle =
          cell.kind === "patch" ? acrossAngle + (rng() - 0.5) * 0.4 : rng() * Math.PI * 2;

        const corners = decalCorners(center, hu, hv, angle);
        if (keepOut.blocks(corners)) continue; // stop line / zebra / give-way

        emitDecalQuad(acc, cell, corners, JUNCTION_DECAL_Y);
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * @param markings the markings mesh built for the SAME network — the paint
 *   every decal has to keep out of. buildWorldGeometry therefore paints before
 *   it wears; the parameter is required rather than optional so a new caller
 *   cannot quietly ship un-vetted decals.
 */
export function buildRoadDecals(
  network: RoadNetwork,
  seed: number,
  markings: MeshAccumulator,
): DecalBuildResult {
  const acc = new MeshAccumulator();
  const keepOut = new MarkingKeepOut(markings);
  let count = 0;

  for (const eb of network.edges) {
    if (!eb.line) continue;
    const length = polylineLength(eb.line);
    // Cheap edge-level reject on the BARE inset. The band each decal actually
    // gets is narrower still (its own half-extent comes off both ends below),
    // so this only rules out ribbons too short for any decal at all.
    if (length - 2 * ROAD_DECAL_END_INSET_M <= 4) continue;
    const n = Math.floor(length / ROAD_DECAL_SPACING_M);
    if (n < 1) continue;
    // Seeded per edge id so placement survives edge-list reordering.
    const rng = mulberry32((seed ^ hashString(eb.edge.id)) >>> 0);
    const travelHalf = eb.halfWidth - eb.parkingM;
    const lanes = Math.max(1, eb.edge.lanes);

    for (let k = 0; k < n; k++) {
      // Re-draw the candidate when it lands on paint (lane dashes, edge
      // lines, arrows, glyphs). Re-picking the CELL too is the point: the
      // slot usually resolves to a smaller cell that fits between the dashes
      // instead of being lost, which is what keeps V4's density.
      for (let attempt = 0; attempt < DECAL_PLACEMENT_ATTEMPTS; attempt++) {
        const cell = pickCell(rng, ribbonWeight);
        const size = cell.minSizeM + rng() * (cell.maxSizeM - cell.minSizeM);
        const hu = size / 2; // half-extent along the quad's local x
        const hv = (size * cell.aspect) / 2;
        const margin = Math.max(hu, hv) + 0.3;
        if (travelHalf <= margin) continue; // ribbon too thin for this decal

        // Longitudinal slot: k-th of n even slots, jittered — spreads decals
        // out instead of clumping while staying deterministic. The band is
        // the cell's OWN: ROAD_DECAL_END_INSET_M is a clearance for the quad's
        // edge, so a wide `patch` gets a shorter band than a small oil stain
        // rather than overhanging the approach cut with half its footprint.
        const endClear = ROAD_DECAL_END_INSET_M + alongRibbonHalf(cell, hu, hv);
        const band = length - 2 * endClear;
        if (band <= 0) continue; // ribbon too short for a cell this wide
        const slot = band / n;
        const s = endClear + slot * (k + 0.2 + rng() * 0.6);
        const { point, tangent } = pointAlong(eb.line, s);

        // Lateral: manholes/oil hug a lane centre (never ON a lane line —
        // real ironwork sits in the lane, doc 05 §5); the rest roam the
        // travel band.
        let lateral: number;
        if (cell.kind === "manhole" || cell.kind === "oil") {
          const lane = Math.floor(rng() * lanes);
          const laneCenter = -travelHalf + (lane + 0.5) * LANE_WIDTH_M;
          const wobble = (0.5 + rng()) * (rng() < 0.5 ? -1 : 1); // ±0.5–1.5 m
          lateral = Math.max(
            -travelHalf + margin,
            Math.min(travelHalf - margin, laneCenter + wobble),
          );
        } else {
          lateral = (rng() * 2 - 1) * (travelHalf - margin);
        }

        // Rotation: repair patches align with travel (within the same cone
        // alongRibbonHalf budgeted for above), the rest rotate freely.
        const roadAngle = Math.atan2(tangent[1], tangent[0]);
        const angle =
          cell.kind === "patch"
            ? roadAngle + (rng() - 0.5) * 2 * PATCH_ALIGN_JITTER_RAD
            : rng() * Math.PI * 2;

        const center = add(point, mul(perpRight(tangent), lateral));
        const corners = decalCorners(center, hu, hv, angle);
        if (keepOut.blocks(corners)) continue;

        emitDecalQuad(acc, cell, corners, ROAD_DECAL_Y);
        count++;
        break;
      }
    }
  }

  // Junction interiors — same accumulator, same atlas, same draw call.
  let junctionCount = 0;
  for (const node of network.nodes.values()) {
    junctionCount += buildNodeDecals(acc, node, seed, keepOut);
  }

  return { decals: acc, count: count + junctionCount, junctionCount };
}
