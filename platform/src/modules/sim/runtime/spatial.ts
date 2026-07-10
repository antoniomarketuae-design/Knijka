/**
 * sim/runtime — district spatial index.
 *
 * Precomputes per-edge runtime geometry (cumulative arclengths, lane banks)
 * and a uniform grid hash over road segments for nearest-edge queries.
 * At district scale (323 edges, ~1.6 × 1.2 km) a grid hash comfortably beats
 * anything fancier: queries touch a 3×3 cell neighborhood (cell 32 m ≥ the
 * 30 m off-road cutoff), a handful of segments each.
 *
 * Allocation discipline: `nearestEdge`/`projectOnEdge` write into caller-owned
 * hit slots; the only per-query allocation is nothing.
 */

import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import type { District, DistrictEdge, DistrictIntersection, DistrictNode } from "./district";
import { projectOnSegment, type SegProjection } from "./geometry";

/**
 * Lane width used for procedural lane banks. MUST equal the world builder's
 * LANE_WIDTH_M exactly (3.25 m BG standard × the perceptual road scale) —
 * the locator's lane fix is graded against the painted lanes.
 */
export const LANE_WIDTH_M = 3.25 * PERCEPTUAL_ROAD_SCALE;

/** Beyond this distance from every edge centerline the vehicle is off-road.
 * Must exceed the widest scaled carriageway half-width (6 lanes ≈ 24.4 m +
 * parking) or driving the outer lane of an arterial would read as off-road. */
export const OFF_ROAD_DISTANCE_M = 30;

/** Rank used by the stop-sign heuristic and signal grouping. Higher = more arterial. */
export const CLASS_RANK: Record<string, number> = {
  primary: 5,
  secondary: 4,
  secondary_link: 4,
  tertiary: 3,
  unclassified: 2,
  residential: 2,
  service: 1,
};

/** Precomputed runtime view of one district edge. */
export interface EdgeRt {
  idx: number;
  edge: DistrictEdge;
  /** Flat vertex buffer [x0, y0, x1, y1, …]. */
  pts: Float64Array;
  /** Cumulative arclength at each vertex; cum[0] = 0, cum[n-1] = totalLen. */
  cum: Float64Array;
  totalLen: number;
  /**
   * Marked lanes per travel direction. Oneway: all lanes. Two-way: floor(n/2),
   * min 1 (an odd middle lane — usually a turn pocket — is not assigned to
   * either bank until wave-2 lane topology exists).
   */
  lanesPerDir: number;
  /** Half of the full carriageway width, meters (used to rank candidates). */
  halfWidthM: number;
  classRank: number;
}

/** Caller-owned nearest/projection result slot. */
export interface EdgeHit {
  edgeIdx: number;
  /** Distance to the edge centerline, meters. */
  distM: number;
  /** Arclength of the projection along the edge polyline, meters. */
  sM: number;
  /** Signed lateral offset from centerline, + = left of geometry direction. */
  latSignedM: number;
  /** Unit tangent of the geometry (forward = from → to) at the projection. */
  tanX: number;
  tanY: number;
  /** distM minus the carriageway half width (0 while inside the roadway). */
  outsideM: number;
}

export function makeEdgeHit(): EdgeHit {
  return { edgeIdx: -1, distM: Infinity, sM: 0, latSignedM: 0, tanX: 0, tanY: 1, outsideM: Infinity };
}

function copyHit(from: EdgeHit, to: EdgeHit): void {
  to.edgeIdx = from.edgeIdx;
  to.distM = from.distM;
  to.sM = from.sM;
  to.latSignedM = from.latSignedM;
  to.tanX = from.tanX;
  to.tanY = from.tanY;
  to.outsideM = from.outsideM;
}

const CELL_M = 32;
/** Max polyline segments per edge supported by the packed segment refs. */
const SEG_PACK = 64;

export class DistrictIndex {
  readonly district: District;
  readonly edges: EdgeRt[];
  readonly edgeIdxById: Map<string, number>;
  readonly nodeById: Map<string, DistrictNode>;
  /** Incident edge indices per node id (graph adjacency). */
  readonly edgesAtNode: Map<string, number[]>;
  readonly intersections: DistrictIntersection[];

  private readonly grid = new Map<number, number[]>();
  private readonly minX: number;
  private readonly minY: number;
  private readonly cols: number;

  // Scratch (no per-query allocation).
  private readonly proj: SegProjection = { t: 0, dist: 0, latSigned: 0 };
  private readonly scratchHit = makeEdgeHit();

  constructor(district: District) {
    this.district = district;
    const b = district.meta.boundsLocalMeters;
    this.minX = b.minX - CELL_M;
    this.minY = b.minY - CELL_M;
    this.cols = Math.ceil((b.maxX - b.minX) / CELL_M) + 3;

    this.nodeById = new Map(district.roads.nodes.map((n) => [n.id, n]));
    this.intersections = district.intersections;
    this.edgeIdxById = new Map();
    this.edgesAtNode = new Map();
    this.edges = district.roads.edges.map((edge, idx) => this.buildEdge(edge, idx));

    for (const rt of this.edges) {
      this.edgeIdxById.set(rt.edge.id, rt.idx);
      for (const nodeId of [rt.edge.from, rt.edge.to]) {
        let list = this.edgesAtNode.get(nodeId);
        if (!list) this.edgesAtNode.set(nodeId, (list = []));
        if (!list.includes(rt.idx)) list.push(rt.idx);
      }
      this.insertEdgeIntoGrid(rt);
    }
  }

  private buildEdge(edge: DistrictEdge, idx: number): EdgeRt {
    const n = edge.geometry.length;
    const pts = new Float64Array(n * 2);
    const cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = edge.geometry[i][0];
      pts[i * 2 + 1] = edge.geometry[i][1];
      if (i > 0) {
        cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      }
    }
    const lanesPerDir = edge.oneway ? Math.max(1, edge.lanes) : Math.max(1, Math.floor(edge.lanes / 2));
    const fullWidth = (edge.oneway ? Math.max(1, edge.lanes) : lanesPerDir * 2) * LANE_WIDTH_M;
    return {
      idx,
      edge,
      pts,
      cum,
      totalLen: cum[n - 1],
      lanesPerDir,
      halfWidthM: fullWidth / 2,
      classRank: CLASS_RANK[edge.class] ?? 2,
    };
  }

  private cellKey(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private cellOf(x: number, y: number): [number, number] {
    return [Math.floor((x - this.minX) / CELL_M), Math.floor((y - this.minY) / CELL_M)];
  }

  private insertEdgeIntoGrid(rt: EdgeRt): void {
    const segCount = rt.edge.geometry.length - 1;
    if (segCount >= SEG_PACK) {
      throw new Error(`district edge ${rt.edge.id}: ${segCount} segments exceeds index capacity`);
    }
    for (let s = 0; s < segCount; s++) {
      const ax = rt.pts[s * 2];
      const ay = rt.pts[s * 2 + 1];
      const bx = rt.pts[s * 2 + 2];
      const by = rt.pts[s * 2 + 3];
      const [c0x, c0y] = this.cellOf(Math.min(ax, bx), Math.min(ay, by));
      const [c1x, c1y] = this.cellOf(Math.max(ax, bx), Math.max(ay, by));
      const ref = rt.idx * SEG_PACK + s;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const key = this.cellKey(cx, cy);
          let bucket = this.grid.get(key);
          if (!bucket) this.grid.set(key, (bucket = []));
          bucket.push(ref);
        }
      }
    }
  }

  edgeRt(edgeIdx: number): EdgeRt {
    return this.edges[edgeIdx];
  }

  edgeRtById(edgeId: string): EdgeRt | null {
    const idx = this.edgeIdxById.get(edgeId);
    return idx === undefined ? null : this.edges[idx];
  }

  /**
   * Nearest edge within `maxDistM` of `pos`, writing into `out`.
   * Candidates are ranked by distance OUTSIDE the carriageway first (so a
   * vehicle in the outer lane of a wide arterial is not stolen by a service
   * road hugging the curb), raw centerline distance second, edge index third
   * (deterministic ties). Returns false when nothing is in range.
   */
  nearestEdge(x: number, y: number, maxDistM: number, out: EdgeHit, excludeEdgeIdx = -1): boolean {
    const [cx, cy] = this.cellOf(x, y);
    let found = false;
    out.edgeIdx = -1;
    out.distM = Infinity;
    out.outsideM = Infinity;
    const ring = Math.max(1, Math.ceil(maxDistM / CELL_M));
    for (let gy = cy - ring; gy <= cy + ring; gy++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        const bucket = this.grid.get(this.cellKey(gx, gy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const ref = bucket[i];
          const edgeIdx = (ref / SEG_PACK) | 0;
          if (edgeIdx === excludeEdgeIdx) continue;
          const seg = ref % SEG_PACK;
          const rt = this.edges[edgeIdx];
          const p = projectOnSegment(
            x,
            y,
            rt.pts[seg * 2],
            rt.pts[seg * 2 + 1],
            rt.pts[seg * 2 + 2],
            rt.pts[seg * 2 + 3],
            this.proj,
          );
          if (p.dist > maxDistM) continue;
          const outside = Math.max(0, p.dist - rt.halfWidthM);
          const better =
            outside < out.outsideM - 1e-9 ||
            (Math.abs(outside - out.outsideM) <= 1e-9 &&
              (p.dist < out.distM - 1e-9 ||
                (Math.abs(p.dist - out.distM) <= 1e-9 && edgeIdx < out.edgeIdx)));
          if (!better) continue;
          this.fillHit(rt, seg, p, out);
          out.outsideM = outside;
          found = true;
        }
      }
    }
    return found;
  }

  /** Project `pos` onto one specific edge (no distance cutoff). */
  projectOnEdge(edgeIdx: number, x: number, y: number, out: EdgeHit): EdgeHit {
    const rt = this.edges[edgeIdx];
    const best = this.scratchHit;
    best.distM = Infinity;
    const segCount = rt.edge.geometry.length - 1;
    for (let seg = 0; seg < segCount; seg++) {
      const p = projectOnSegment(
        x,
        y,
        rt.pts[seg * 2],
        rt.pts[seg * 2 + 1],
        rt.pts[seg * 2 + 2],
        rt.pts[seg * 2 + 3],
        this.proj,
      );
      if (p.dist < best.distM) {
        this.fillHit(rt, seg, p, best);
        best.outsideM = Math.max(0, p.dist - rt.halfWidthM);
      }
    }
    copyHit(best, out);
    return out;
  }

  private fillHit(rt: EdgeRt, seg: number, p: SegProjection, out: EdgeHit): void {
    const ax = rt.pts[seg * 2];
    const ay = rt.pts[seg * 2 + 1];
    const dx = rt.pts[seg * 2 + 2] - ax;
    const dy = rt.pts[seg * 2 + 3] - ay;
    const segLen = rt.cum[seg + 1] - rt.cum[seg];
    const inv = segLen > 0 ? 1 / Math.hypot(dx, dy) : 0;
    out.edgeIdx = rt.idx;
    out.distM = p.dist;
    out.sM = rt.cum[seg] + p.t * segLen;
    out.latSignedM = p.latSigned;
    out.tanX = dx * inv;
    out.tanY = dy * inv;
    if (inv === 0) {
      out.tanX = 0;
      out.tanY = 1;
    }
  }

  /** Unit tangent (geometry-forward) at arclength `sM` of an edge. */
  tangentAt(edgeIdx: number, sM: number): [number, number] {
    const rt = this.edges[edgeIdx];
    const n = rt.cum.length;
    let seg = 0;
    while (seg < n - 2 && rt.cum[seg + 1] < sM) seg++;
    const dx = rt.pts[seg * 2 + 2] - rt.pts[seg * 2];
    const dy = rt.pts[seg * 2 + 3] - rt.pts[seg * 2 + 1];
    const len = Math.hypot(dx, dy);
    return len > 0 ? [dx / len, dy / len] : [0, 1];
  }

  /** Point at arclength `sM` along an edge (clamped). */
  pointAt(edgeIdx: number, sM: number): [number, number] {
    const rt = this.edges[edgeIdx];
    const n = rt.cum.length;
    const s = Math.max(0, Math.min(rt.totalLen, sM));
    let seg = 0;
    while (seg < n - 2 && rt.cum[seg + 1] < s) seg++;
    const segLen = rt.cum[seg + 1] - rt.cum[seg];
    const t = segLen > 0 ? (s - rt.cum[seg]) / segLen : 0;
    return [
      rt.pts[seg * 2] + t * (rt.pts[seg * 2 + 2] - rt.pts[seg * 2]),
      rt.pts[seg * 2 + 1] + t * (rt.pts[seg * 2 + 3] - rt.pts[seg * 2 + 1]),
    ];
  }

  /**
   * Nearest intersection node within `maxDistM`, or null. Linear scan — the
   * district has ~112 intersections; at one call per frame this is noise.
   */
  nearestIntersection(x: number, y: number, maxDistM: number): DistrictIntersection | null {
    let best: DistrictIntersection | null = null;
    let bestD2 = maxDistM * maxDistM;
    for (let i = 0; i < this.intersections.length; i++) {
      const it = this.intersections[i];
      const dx = it.x - x;
      const dy = it.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = it;
      }
    }
    return best;
  }
}
