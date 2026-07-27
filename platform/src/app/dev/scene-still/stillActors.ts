/**
 * Which drawing path a scene-still actor takes.
 *
 * This exists because "nothing" used to be a silent third answer: SceneStillScene
 * mapped every pose through the instanced vehicle fleet and returned null for the
 * kinds the fleet has no rig for (bike/ped), so a cyclist question rendered an
 * empty road and nobody found out until the founder reviewed the picture
 * (2026-07-27 Half-A review). A pose kind that draws nothing is a broken
 * question, not a missing feature, so the mapping is exhaustive here and the
 * test battery walks every kind.
 *
 * Pure data — no three.js, no React — so it can be asserted in the node suite.
 */

import type { SceneStillPoseKind } from "@/lib/content/types";

/** "vehicle" = the instanced traffic fleet; "figure" = a code-mesh body. */
export type StillDrawPath = "vehicle" | "figure";

/**
 * Vulnerable road users. They get code meshes rather than fleet rigs: the fleet
 * only knows vehicles, and TrafficLayer's articulated pedestrians are driven by
 * a live TrafficSystem a motionless still has no reason to spin up.
 */
export const VULNERABLE_POSE_KINDS = ["bike", "ped"] as const satisfies readonly SceneStillPoseKind[];

const DRAW_PATH: Record<SceneStillPoseKind, StillDrawPath> = {
  car: "vehicle",
  truck: "vehicle",
  bus: "vehicle",
  tram: "vehicle",
  bike: "figure",
  ped: "figure",
};

/** Total by construction: every authorable pose kind reaches the screen. */
export function poseDrawPath(kind: SceneStillPoseKind): StillDrawPath {
  return DRAW_PATH[kind];
}

export function isVulnerablePoseKind(kind: SceneStillPoseKind): boolean {
  return poseDrawPath(kind) === "figure";
}
