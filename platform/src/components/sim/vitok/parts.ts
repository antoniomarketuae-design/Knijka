// „Виток" visual layer — shared constants + procedural-geometry helpers.
//
// FITTING THE CC0 BASE MESH TO THE PHYSICS (see public/models/LICENSES.md):
// Kenney's hatchback-sports body measures 1.30 x 1.10 x 2.85 m with wheel
// arches at x ±0.30, z ±0.81 (front = +Z, +X = left — the SAME frame as
// tuning.ts, verified from the GLB node transforms). We scale per-axis onto
// the physics envelope (1.70 wide x 4.04 long, CHASSIS_HALF_EXTENTS), so the
// visual body matches the collider footprint exactly. The visual wheels sit
// at the scaled ARCH anchors (not the physics attachment x/z) so they stay
// inside the fenders; suspension travel, steer angle and spin still come
// 1:1 from the physics wheel state.

import { BoxGeometry, TorusGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const BODY_URL = "/models/vitok/vitok-body.glb";
export const WHEEL_URL = "/models/vitok/vitok-wheel.glb";

/** Chassis-local Y of the ground plane at rest ride height (harness: 0.63 m). */
export const GROUND_Y = -0.63;

/** Per-axis fit: [1.70/1.30, 1.45/1.10, 4.04/2.85]. */
export const BODY_SCALE = [1.308, 1.318, 1.418] as const;
/** Kenney body is centred at z=-0.025; recentre onto the collider. */
export const BODY_OFFSET = [0, GROUND_Y, 0.035] as const;

/** Kenney wheel radius 0.30 m -> physics WHEEL_RADIUS 0.32 m. */
export const WHEEL_SCALE = 0.32 / 0.3;

/**
 * Visual wheel anchors (chassis-local x/z), index-matched to
 * tuning.WHEEL_POSITIONS (FL, FR, RL, RR). x/z follow the scaled body arches
 * (0.81 * 1.418 = 1.148; centre pushed out to 0.57 so the tyre face sits
 * flush with the fender like the source model); y is the physics attachment.
 */
export const WHEEL_ANCHORS = [
  { x: 0.57, z: 1.148 }, // FL
  { x: -0.57, z: 1.148 }, // FR
  { x: 0.57, z: -1.148 }, // RL
  { x: -0.57, z: -1.148 }, // RR
] as const;

export interface BoxSpec {
  /** BoxGeometry size (m). */
  size: readonly [number, number, number];
  /** Centre position, chassis-local (m). */
  pos: readonly [number, number, number];
  /** Optional Euler rotation (rad), applied X -> Y -> Z before translation. */
  rot?: readonly [number, number, number];
}

/** Merge many boxes into ONE BufferGeometry = one draw call per material. */
export function mergedBoxes(specs: readonly BoxSpec[]): BufferGeometry {
  const parts = specs.map((s) => {
    const g = new BoxGeometry(s.size[0], s.size[1], s.size[2]);
    if (s.rot) {
      if (s.rot[0]) g.rotateX(s.rot[0]);
      if (s.rot[1]) g.rotateY(s.rot[1]);
      if (s.rot[2]) g.rotateZ(s.rot[2]);
    }
    g.translate(s.pos[0], s.pos[1], s.pos[2]);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("mergedBoxes: incompatible geometries");
  return merged;
}

/**
 * Steering wheel: rim (torus in the XY plane) + two spokes + hub, merged to
 * a single draw call. Local +Z is the wheel's facing axis; the mounting
 * group tilts it toward the driver.
 */
export function steeringWheelGeometry(): BufferGeometry {
  const rim = new TorusGeometry(0.19, 0.026, 10, 28);
  const spokeH = new BoxGeometry(0.34, 0.045, 0.025);
  const spokeV = new BoxGeometry(0.045, 0.155, 0.025);
  spokeV.translate(0, -0.1, 0);
  const hub = new BoxGeometry(0.09, 0.09, 0.045);
  const merged = mergeGeometries([rim, spokeH, spokeV, hub], false);
  rim.dispose();
  spokeH.dispose();
  spokeV.dispose();
  hub.dispose();
  if (!merged) throw new Error("steeringWheelGeometry: merge failed");
  return merged;
}
