/**
 * SceneStill math core (THEO-1) — the pure geometry behind the static
 * top-down question scene. No React, no DOM: view fitting and actor sizing
 * live here so the canvas component stays thin and node-testable.
 *
 * Deliberately reuses mistakeReplayCore's coordinate contract (ReplayView +
 * replayToCanvas: world meters, x east / y north, canvas y DOWN) so the two
 * 2D surfaces can never drift apart — but fits by the AUTHORED zoom window
 * instead of trace bounds: the question says exactly how much world to show,
 * so the replay's px-per-meter clamps do not apply.
 */

import type { SceneStillFocus, SceneStillPoseKind } from "@/lib/content/types";
import type { ReplayView } from "./mistakeReplayCore";

/** Margin kept clear around the focus window, px. */
export const SCENE_MARGIN_PX = 12;

/**
 * Fit the focus window (zoomM × zoomM meters centered on focus.x/y) into a
 * canvas: focus lands at the canvas center, the window's full extent fits
 * the SHORTER canvas side (the longer side shows extra context).
 */
export function fitSceneView(
  focus: SceneStillFocus,
  widthPx: number,
  heightPx: number,
  marginPx = SCENE_MARGIN_PX,
): ReplayView {
  if (widthPx <= 0 || heightPx <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, widthPx, heightPx };
  }
  const usable = Math.max(Math.min(widthPx, heightPx) - 2 * marginPx, 1);
  const scale = usable / Math.max(focus.zoomM, 1e-6);
  return {
    scale,
    // replayToCanvas: cx = scale*x + offsetX, cy = offsetY - scale*y
    offsetX: widthPx / 2 - scale * focus.x,
    offsetY: heightPx / 2 + scale * focus.y,
    widthPx,
    heightPx,
  };
}

/** Real-world actor footprints, meters (length along heading × width). */
export const POSE_SIZE_M: Record<SceneStillPoseKind, { lengthM: number; widthM: number }> = {
  car: { lengthM: 4.4, widthM: 1.8 },
  truck: { lengthM: 8.5, widthM: 2.5 },
  bus: { lengthM: 11, widthM: 2.5 },
  tram: { lengthM: 14, widthM: 2.4 },
  bike: { lengthM: 1.8, widthM: 0.6 },
  ped: { lengthM: 0.7, widthM: 0.7 },
};

/** Smallest drawn footprint, px — a ped at wide zoom must stay visible. */
export const POSE_MIN_LENGTH_PX = 5;
export const POSE_MIN_WIDTH_PX = 3;

/** Footprint of a pose in canvas px at the view's scale, floored for
 *  visibility. */
export function poseSizePx(
  kind: SceneStillPoseKind,
  scale: number,
): { lengthPx: number; widthPx: number } {
  const size = POSE_SIZE_M[kind];
  return {
    lengthPx: Math.max(size.lengthM * scale, POSE_MIN_LENGTH_PX),
    widthPx: Math.max(size.widthM * scale, POSE_MIN_WIDTH_PX),
  };
}
