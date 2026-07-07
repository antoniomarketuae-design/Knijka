// Minimal allocation-conscious 3D math for the vehicle physics core.
// Deliberately NOT three.js: the physics core must run identically in the
// browser (R3F) and in Node (harness) with zero rendering dependencies.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` by at most `maxDelta` (rate limiter). */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Quaternion for a rotation of `rad` about the +Y (up) axis. */
export function yawQuat(rad: number): Quat {
  return { x: 0, y: Math.sin(rad / 2), z: 0, w: Math.cos(rad / 2) };
}

/**
 * Rotate vector (vx, vy, vz) by quaternion q, writing into `out`.
 * Standard optimized form: v' = v + 2w(q×v) + 2(q×(q×v)).
 */
export function rotateInto(q: Quat, vx: number, vy: number, vz: number, out: Vec3): Vec3 {
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  out.x = vx + q.w * tx + (q.y * tz - q.z * ty);
  out.y = vy + q.w * ty + (q.z * tx - q.x * tz);
  out.z = vz + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
