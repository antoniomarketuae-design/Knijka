/**
 * A15 mistake map — the pure fit-to-content transform (the canvas drawing is
 * visual; the projection math is what must not regress: markers at the
 * content edges have to land INSIDE the canvas with the padding applied).
 */

import { describe, expect, it } from "vitest";
import { fitMapTransform } from "../Minimap";

const W = 600;
const H = 260;

/** Project a world point with the Minimap/MistakeMap formula. */
function toPx(
  t: { centerX: number; centerY: number; pxPerMeter: number },
  wx: number,
  wy: number,
): [number, number] {
  return [W / 2 + (wx - t.centerX) * t.pxPerMeter, H / 2 - (wy - t.centerY) * t.pxPerMeter];
}

describe("fitMapTransform", () => {
  it("centers the bounding box and keeps every point inside the canvas", () => {
    const pts: Array<[number, number]> = [
      [-120, -80],
      [300, 40],
      [90, 210],
    ];
    const t = fitMapTransform(pts, W, H);
    expect(t.centerX).toBeCloseTo((-120 + 300) / 2);
    expect(t.centerY).toBeCloseTo((-80 + 210) / 2);
    for (const [x, y] of pts) {
      const [px, py] = toPx(t, x, y);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(W);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(H);
    }
  });

  it("clamps the zoom for a single marker (no 4-meter blob)", () => {
    const t = fitMapTransform([[10, 10]], W, H);
    expect(t.pxPerMeter).toBeLessThanOrEqual(4);
    expect(t.centerX).toBe(10);
    expect(t.centerY).toBe(10);
  });

  it("clamps the zoom floor for a cross-district spread", () => {
    const t = fitMapTransform(
      [
        [-50_000, -50_000],
        [50_000, 50_000],
      ],
      W,
      H,
    );
    expect(t.pxPerMeter).toBeGreaterThanOrEqual(0.05);
  });

  it("degrades to identity on empty input / zero-sized canvas", () => {
    expect(fitMapTransform([], W, H)).toEqual({ centerX: 0, centerY: 0, pxPerMeter: 1 });
    expect(fitMapTransform([[1, 2]], 0, H).pxPerMeter).toBe(1);
  });
});
