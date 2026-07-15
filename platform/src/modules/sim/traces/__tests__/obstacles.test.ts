/**
 * S1 recorder seams — the 2D OBB overlap (the headless twin of the scene's
 * ScenarioObstacles colliders) and the scenario-lot obstacle derivation from
 * the district's meta.scenario occupancy.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { obstacleRectsOverlap } from "../recorder";
import {
  lotObstacleRects,
  PARKED_CAR_HALF_LENGTH_M,
  PARKED_CAR_HALF_WIDTH_M,
} from "../scParkPerpRev";

const lotRaw: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../../content/world/lot-perp-v1.json", import.meta.url)),
    "utf8",
  ),
);

describe("obstacleRectsOverlap (SAT over 2D OBBs)", () => {
  const car = (x: number, y: number, headingDeg = 0) => ({
    x,
    y,
    headingDeg,
    halfWidthM: 0.85,
    halfLengthM: 2.0,
  });

  it("separated rects do not overlap; touching-side rects do", () => {
    expect(obstacleRectsOverlap(car(0, 0), car(2.0, 0))).toBe(false); // 0.3 m gap
    expect(obstacleRectsOverlap(car(0, 0), car(1.5, 0))).toBe(true); // sides interpenetrate
    expect(obstacleRectsOverlap(car(0, 0), car(0, 4.5))).toBe(false); // nose-to-tail gap
    expect(obstacleRectsOverlap(car(0, 0), car(0, 3.5))).toBe(true);
  });

  it("rotation matters: a diagonal car reaches where an axis-aligned one cannot", () => {
    // Axis-aligned at x = 2.6: gap 0.9 m. Rotated 45°, its x-extent grows to
    // ~2.0 m and the corners cross into the first rect.
    expect(obstacleRectsOverlap(car(0, 0), car(2.6, 0))).toBe(false);
    expect(obstacleRectsOverlap(car(0, 0), car(2.6, 0, 45))).toBe(true);
    // Heading is axis-symmetric (a rect at 180° equals 0°).
    expect(obstacleRectsOverlap(car(0, 0), car(2.0, 0, 180))).toBe(
      obstacleRectsOverlap(car(0, 0), car(2.0, 0)),
    );
  });

  it("SAT catches the no-corner-inside cross configuration", () => {
    // A long thin rect crossing another at 90° — no corner of either lies
    // inside the other; only an axis test sees the overlap.
    const a = { x: 0, y: 0, headingDeg: 0, halfWidthM: 0.2, halfLengthM: 3 };
    const b = { x: 0, y: 0, headingDeg: 90, halfWidthM: 0.2, halfLengthM: 3 };
    expect(obstacleRectsOverlap(a, b)).toBe(true);
  });
});

describe("lotObstacleRects (occupancy → headless parked cars)", () => {
  it("derives one vehicle rect per OCCUPIED bay of lot-perp-v1 (4 of 5)", () => {
    const rects = lotObstacleRects(lotRaw);
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.withWhat).toBe("vehicle");
      expect(r.halfWidthM).toBe(PARKED_CAR_HALF_WIDTH_M);
      expect(r.halfLengthM).toBe(PARKED_CAR_HALF_LENGTH_M);
      expect(r.headingDeg).toBe(90);
      expect(r.x).toBe(5.03);
    }
    // The FREE target bay (y = 0) carries no obstacle.
    expect(rects.some((r) => r.y === 0)).toBe(false);
    expect(rects.map((r) => r.y).sort((a, b) => a - b)).toEqual([-5.4, -2.7, 2.7, 5.4]);
  });

  it("districts without scenario meta yield no obstacles", () => {
    expect(lotObstacleRects({ meta: {} })).toEqual([]);
    expect(lotObstacleRects(null)).toEqual([]);
  });
});
