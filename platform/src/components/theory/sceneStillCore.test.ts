/**
 * SceneStill core math (THEO-1): the authored focus window must land centered
 * and fully visible, and actor footprints must stay drawable at any zoom.
 */
import { describe, expect, it } from "vitest";
import type { SceneStillPoseKind } from "@/lib/content/types";
import { replayToCanvas } from "./mistakeReplayCore";
import {
  fitSceneView,
  POSE_MIN_LENGTH_PX,
  POSE_MIN_WIDTH_PX,
  POSE_SIZE_M,
  poseSizePx,
} from "./sceneStillCore";

describe("fitSceneView", () => {
  it("centers the focus point on the canvas", () => {
    const view = fitSceneView({ x: 120, y: -40, zoomM: 60 }, 320, 240);
    expect(replayToCanvas(view, 120, -40)).toEqual([160, 120]);
  });

  it("fits the zoom window into the shorter canvas side, margins kept clear", () => {
    const view = fitSceneView({ x: 0, y: 0, zoomM: 50 }, 400, 200, 10);
    // shorter side 200 → usable 180 → 3.6 px/m
    expect(view.scale).toBeCloseTo(3.6);
    // window edge north (y=+25) lands margin-distance from the top
    const [, topY] = replayToCanvas(view, 0, 25);
    expect(topY).toBeCloseTo(10);
    // window edge south lands margin-distance from the bottom
    const [, bottomY] = replayToCanvas(view, 0, -25);
    expect(bottomY).toBeCloseTo(190);
  });

  it("does NOT clamp px-per-meter like the replay fit (authored zoom wins)", () => {
    // 12 m stall drill on a 300px canvas → ~23 px/m, far above the replay's 4.
    const view = fitSceneView({ x: 0, y: 0, zoomM: 12 }, 300, 300, 6);
    expect(view.scale).toBeGreaterThan(20);
  });

  it("degrades to identity on a zero-size canvas", () => {
    const view = fitSceneView({ x: 5, y: 5, zoomM: 60 }, 0, 0);
    expect(view.scale).toBe(1);
  });

  it("keeps north up: +y world maps to smaller canvas y", () => {
    const view = fitSceneView({ x: 0, y: 0, zoomM: 100 }, 200, 200);
    const [, northY] = replayToCanvas(view, 0, 10);
    const [, southY] = replayToCanvas(view, 0, -10);
    expect(northY).toBeLessThan(southY);
  });
});

describe("poseSizePx", () => {
  const kinds = Object.keys(POSE_SIZE_M) as SceneStillPoseKind[];

  it("covers every pose kind with a real-world footprint", () => {
    for (const kind of kinds) {
      expect(POSE_SIZE_M[kind].lengthM).toBeGreaterThan(0);
      expect(POSE_SIZE_M[kind].widthM).toBeGreaterThan(0);
      expect(POSE_SIZE_M[kind].lengthM).toBeGreaterThanOrEqual(POSE_SIZE_M[kind].widthM);
    }
  });

  it("scales with the view and never collapses below the visibility floor", () => {
    for (const kind of kinds) {
      const big = poseSizePx(kind, 10);
      expect(big.lengthPx).toBeCloseTo(POSE_SIZE_M[kind].lengthM * 10);
      const tiny = poseSizePx(kind, 0.01);
      expect(tiny.lengthPx).toBeGreaterThanOrEqual(POSE_MIN_LENGTH_PX);
      expect(tiny.widthPx).toBeGreaterThanOrEqual(POSE_MIN_WIDTH_PX);
    }
  });
});
