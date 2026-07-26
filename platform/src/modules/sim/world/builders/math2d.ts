/**
 * Pure 2D geometry helpers for the world builders. District space (x east,
 * y north), plain arrays — no three.js so the whole builder layer runs in
 * node for vitest.
 */

export type Vec2 = [number, number];

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
/** z-component of the 2D cross product. */
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0];
}

/**
 * Unit vector 90° clockwise from `d` — the RIGHT-hand side of travel in
 * district coords (x east, y north): heading north (0,1) -> east (1,0).
 */
export const perpRight = (d: Vec2): Vec2 => [d[1], -d[0]];

export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

// ---------------------------------------------------------------------------
// Polylines
// ---------------------------------------------------------------------------

export function polylineLength(pts: readonly Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1] as Vec2, pts[i] as Vec2);
  return l;
}

/** Point + unit tangent at arc length `s` (clamped to the polyline). */
export function pointAlong(pts: readonly Vec2[], s: number): { point: Vec2; tangent: Vec2 } {
  const first = pts[0] as Vec2;
  const last = pts[pts.length - 1] as Vec2;
  if (pts.length < 2) return { point: [...first] as Vec2, tangent: [0, 1] };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const seg = dist(a, b);
    if (seg <= 1e-9) continue;
    if (acc + seg >= s) {
      const t = Math.min(1, Math.max(0, (s - acc) / seg));
      return { point: lerp2(a, b, t), tangent: norm(sub(b, a)) };
    }
    acc += seg;
  }
  const a = pts[pts.length - 2] as Vec2;
  return { point: [...last] as Vec2, tangent: norm(sub(last, a)) };
}

/**
 * Cut `s0` meters off the start and `s1` off the end. Returns null when the
 * remainder would be shorter than `minLen`.
 */
export function trimPolyline(
  pts: readonly Vec2[],
  s0: number,
  s1: number,
  minLen = 0.25,
): Vec2[] | null {
  const total = polylineLength(pts);
  if (total - s0 - s1 < minLen) return null;
  const start = pointAlong(pts, s0);
  const end = pointAlong(pts, total - s1);
  const out: Vec2[] = [start.point];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const seg = dist(a, b);
    const sAtB = acc + seg;
    if (sAtB > s0 && sAtB < total - s1) {
      const p = pts[i] as Vec2;
      const prev = out[out.length - 1] as Vec2;
      if (dist(prev, p) > 1e-6) out.push([...p] as Vec2);
    }
    acc = sAtB;
  }
  const prev = out[out.length - 1] as Vec2;
  if (dist(prev, end.point) > 1e-6) out.push(end.point);
  if (out.length < 2) return null;
  return out;
}

export interface PolyFrame {
  /** Unit right-of-travel vector at this vertex (averaged at joints). */
  right: Vec2;
  /** Miter scale (>= 1, clamped) so offsets keep constant width at joints. */
  miter: number;
}

/** Per-vertex offset frames for sweeping a ribbon along a polyline. */
export function polylineFrames(pts: readonly Vec2[]): PolyFrame[] {
  const n = pts.length;
  const segDirs: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    segDirs.push(norm(sub(pts[i + 1] as Vec2, pts[i] as Vec2)));
  }
  const frames: PolyFrame[] = [];
  for (let i = 0; i < n; i++) {
    const dPrev = segDirs[Math.max(0, i - 1)] ?? [0, 1];
    const dNext = segDirs[Math.min(segDirs.length - 1, i)] ?? dPrev;
    const avg = norm(add(dPrev, dNext));
    const dirUsed = len(avg) > 1e-9 ? avg : dNext;
    const right = perpRight(dirUsed);
    // Constant-width offset requires dividing by cos(half turn angle).
    const cosHalf = Math.max(0.4, dot(dirUsed, dNext)); // clamp miter at 2.5x
    frames.push({ right, miter: 1 / cosHalf });
  }
  return frames;
}

/** Offset a polyline sideways; positive = right of travel. */
export function offsetPolyline(pts: readonly Vec2[], offset: number): Vec2[] {
  const frames = polylineFrames(pts);
  return pts.map((p, i) => {
    const f = frames[i] as PolyFrame;
    return add(p as Vec2, mul(f.right, offset * f.miter));
  });
}

/** Closest point on a polyline to `p` (returns arc length + tangent too). */
export function projectOntoPolyline(
  pts: readonly Vec2[],
  p: Vec2,
): { point: Vec2; tangent: Vec2; s: number; distance: number } {
  let best = { point: [...(pts[0] as Vec2)] as Vec2, tangent: [0, 1] as Vec2, s: 0, distance: Infinity };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    const ab = sub(b, a);
    const segLen = len(ab);
    if (segLen <= 1e-9) continue;
    const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (segLen * segLen)));
    const q = lerp2(a, b, t);
    const d = dist(p, q);
    if (d < best.distance) {
      best = { point: q, tangent: norm(ab), s: acc + t * segLen, distance: d };
    }
    acc += segLen;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

/** Signed area of an unclosed ring; positive = counter-clockwise. */
export function signedArea(ring: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Copy of `ring` wound counter-clockwise. */
export function toCCW(ring: readonly Vec2[]): Vec2[] {
  const copy = ring.map((p) => [...p] as Vec2);
  return signedArea(copy) >= 0 ? copy : copy.reverse();
}

function pointInTri(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(p, a));
  const d2 = cross(sub(c, b), sub(p, b));
  const d3 = cross(sub(a, c), sub(p, c));
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clipping triangulation of a simple polygon (CCW or CW input; handles
 * collinear points). Returns index triples into the input ring, CCW winding.
 * Falls back to a center fan if clipping stalls (degenerate input).
 */
export function triangulate(ring: readonly Vec2[]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  const ccw = signedArea(ring) >= 0;
  // Work on an index list in CCW order.
  const idx = Array.from({ length: n }, (_, i) => (ccw ? i : n - 1 - i));
  const tris: number[] = [];
  let guard = 0;
  const maxGuard = n * n * 2;
  while (idx.length > 3 && guard++ < maxGuard) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length] as number;
      const i1 = idx[i] as number;
      const i2 = idx[(i + 1) % idx.length] as number;
      const a = ring[i0] as Vec2;
      const b = ring[i1] as Vec2;
      const c = ring[i2] as Vec2;
      const conv = cross(sub(b, a), sub(c, b));
      if (conv <= 1e-10) continue; // reflex or collinear — not an ear
      let contains = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(ring[j] as Vec2, a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      tris.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // Degenerate (self-touching / all-collinear remainder): fan what's left.
      for (let i = 1; i < idx.length - 1; i++) {
        tris.push(idx[0] as number, idx[i] as number, idx[i + 1] as number);
      }
      return tris;
    }
  }
  if (idx.length === 3) tris.push(idx[0] as number, idx[1] as number, idx[2] as number);
  return tris;
}

export function pointInRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i] as Vec2;
    const b = ring[j] as Vec2;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Deterministic randomness / noise
// ---------------------------------------------------------------------------

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2i(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise in [0, 1], smooth, deterministic. Feed scaled coordinates. */
export function valueNoise2D(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const v00 = hash2i(xi, yi, seed);
  const v10 = hash2i(xi + 1, yi, seed);
  const v01 = hash2i(xi, yi + 1, seed);
  const v11 = hash2i(xi + 1, yi + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

// ---------------------------------------------------------------------------
// Spatial hash over line segments (distance-to-road queries)
// ---------------------------------------------------------------------------

export class SegmentGrid {
  private cells = new Map<string, [Vec2, Vec2][]>();
  constructor(private cellSize: number) {}

  addPolyline(pts: readonly Vec2[]): void {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as Vec2;
      const b = pts[i] as Vec2;
      const minX = Math.floor(Math.min(a[0], b[0]) / this.cellSize);
      const maxX = Math.floor(Math.max(a[0], b[0]) / this.cellSize);
      const minY = Math.floor(Math.min(a[1], b[1]) / this.cellSize);
      const maxY = Math.floor(Math.max(a[1], b[1]) / this.cellSize);
      for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
          const key = `${cx},${cy}`;
          let bucket = this.cells.get(key);
          if (!bucket) this.cells.set(key, (bucket = []));
          bucket.push([a, b]);
        }
      }
    }
  }

  /** Distance from `p` to the nearest stored segment, capped at `maxDist`. */
  distanceTo(p: Vec2, maxDist: number): number {
    const r = Math.ceil(maxDist / this.cellSize);
    const cx = Math.floor(p[0] / this.cellSize);
    const cy = Math.floor(p[1] / this.cellSize);
    let best = maxDist;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = this.cells.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const [a, b] of bucket) {
          const ab = sub(b, a);
          const l2 = dot(ab, ab);
          const t = l2 > 1e-12 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
          const d = dist(p, add(a, mul(ab, t)));
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Spatial hash over building AABBs (near-a-building queries)
// ---------------------------------------------------------------------------

/**
 * The same trick as SegmentGrid, for the „is this point near a building"
 * predicate that terrain.ts (paved-vs-grass zoning, relief masking) and
 * props.ts (tree/prop rejection) each ran as a LINEAR scan over every footprint
 * AABB — once per terrain cell and once per prop candidate.
 *
 * That was fine at 248 footprints. Doc 82 V7 puts 380 on `d2-v1` alone, and the
 * cost is a product: 112 × 112 terrain cells × N buildings. Measured on d2, the
 * scan took `buildWorldGeometry` from 204 ms to 345 ms — a load-time cost paid
 * on the main thread by exactly the mid-range phone §2.2 is written for.
 *
 * The predicate is UNCHANGED, so the classification of every cell and every
 * prop is bit-identical: a box is inserted into the cells it covers, and a
 * query at `pad` only has to look `ceil(pad / cellSize)` cells out, because a
 * box within `pad` of `p` must cover a cell that close.
 */
export class AabbGrid {
  private cells = new Map<string, [number, number, number, number][]>();
  private empty = true;
  constructor(private cellSize: number) {}

  add(box: [number, number, number, number]): void {
    this.empty = false;
    const minX = Math.floor(box[0] / this.cellSize);
    const maxX = Math.floor(box[2] / this.cellSize);
    const minY = Math.floor(box[1] / this.cellSize);
    const maxY = Math.floor(box[3] / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = `${cx},${cy}`;
        let bucket = this.cells.get(key);
        if (!bucket) this.cells.set(key, (bucket = []));
        bucket.push(box);
      }
    }
  }

  /** True when `p` is strictly inside some stored box expanded by `pad`. */
  hits(p: Vec2, pad: number): boolean {
    if (this.empty) return false;
    const r = Math.ceil(pad / this.cellSize);
    const cx = Math.floor(p[0] / this.cellSize);
    const cy = Math.floor(p[1] / this.cellSize);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const bucket = this.cells.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const [x0, y0, x1, y1] of bucket) {
          if (p[0] > x0 - pad && p[0] < x1 + pad && p[1] > y0 - pad && p[1] < y1 + pad) return true;
        }
      }
    }
    return false;
  }
}
