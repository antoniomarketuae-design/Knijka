/**
 * sim/runtime — small pure geometry/angle helpers shared by the runtime.
 *
 * Conventions (match contracts.ts / district-v1.json):
 * - x = east, y = north, meters.
 * - headings/bearings in degrees, 0 = north, clockwise positive.
 */

/** Normalize an angle to [0, 360). */
export function normDeg(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** Signed shortest rotation from `fromDeg` to `toDeg`, in (-180, 180]. */
export function signedDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = (toDeg - fromDeg) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Compass bearing of the vector (dx east, dy north): 0 = north, clockwise. */
export function bearingDeg(dx: number, dy: number): number {
  return normDeg((Math.atan2(dx, dy) * 180) / Math.PI);
}

export type Axis = "ns" | "ew";

/** Fold a bearing onto the N-S / E-W axis it is closest to (45° split). */
export function axisOfBearing(deg: number): Axis {
  const folded = normDeg(deg) % 180; // [0, 180)
  return folded <= 45 || folded >= 135 ? "ns" : "ew";
}

/** Result slot for point→segment projection (caller-owned, reused per query). */
export interface SegProjection {
  /** Clamped parameter along the segment, [0, 1]. */
  t: number;
  /** Distance point→projection, meters. */
  dist: number;
  /**
   * Signed lateral offset, meters. Positive = point lies LEFT of the segment
   * direction a→b (cross(dir, toPoint) > 0), negative = right.
   */
  latSigned: number;
}

/** Project p onto segment a→b, filling `out`. Returns `out`. */
export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  out: SegProjection,
): SegProjection {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  const vx = px - qx;
  const vy = py - qy;
  out.t = t;
  out.dist = Math.hypot(vx, vy);
  // Sign from the unclamped lateral component (stable beyond the endpoints).
  const len = Math.sqrt(len2);
  out.latSigned = len > 0 ? (dx * (py - ay) - dy * (px - ax)) / len : out.dist;
  return out;
}

/** FNV-1a 32-bit string hash — deterministic seed source (no Math.random). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Douglas–Peucker polyline simplification (used by the minimap builder only —
 * never on live geometry). Returns a new array; endpoints always kept.
 */
export function simplifyPolyline(points: [number, number][], toleranceM: number): [number, number][] {
  if (points.length <= 2 || toleranceM <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [i0, i1] = stack.pop() as [number, number];
    if (i1 - i0 < 2) continue;
    const [ax, ay] = points[i0];
    const [bx, by] = points[i1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let worstDist = toleranceM;
    for (let i = i0 + 1; i < i1; i++) {
      const [px, py] = points[i];
      const dist =
        len > 0
          ? Math.abs(dx * (py - ay) - dy * (px - ax)) / len
          : Math.hypot(px - ax, py - ay);
      if (dist > worstDist) {
        worstDist = dist;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}
