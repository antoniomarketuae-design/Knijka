import { describe, expect, it } from "vitest";
import { circulatingConflictFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player at origin heading north; roundabout centre ahead at (0,20), band 25.
// The player's LEFT is -x (west) — circulating traffic to give way to.
describe("circulatingConflictFor", () => {
  it("flags a car circulating on the driver's left within the ring band", () => {
    expect(circulatingConflictFor([veh(-15, 20, 1, 0)], 0, 20, 0, 0, 0, 25)).toBe(true);
  });

  it("ignores a car on the driver's right (already past the entry)", () => {
    expect(circulatingConflictFor([veh(15, 20, -1, 0)], 0, 20, 0, 0, 0, 25)).toBe(false);
  });

  it("ignores a car outside the ring band", () => {
    expect(circulatingConflictFor([veh(-15, 60, 1, 0)], 0, 20, 0, 0, 0, 25)).toBe(false);
  });

  it("ignores a stopped car on the left", () => {
    expect(circulatingConflictFor([veh(-15, 20, 1, 0, 0)], 0, 20, 0, 0, 0, 25)).toBe(false);
  });

  it("is direction-agnostic — any moving car circulating on the left conflicts", () => {
    // A car heading the other way around the ring is still crossing the entry.
    expect(circulatingConflictFor([veh(-12, 22, 0, -1)], 0, 20, 0, 0, 0, 25)).toBe(true);
  });
});
