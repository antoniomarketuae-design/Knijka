import { describe, expect, it } from "vitest";
import { conflictNearFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player approaches the junction at origin heading north (approach bearing 0).
describe("conflictNearFor", () => {
  it("flags a crossing vehicle near the junction", () => {
    expect(conflictNearFor([veh(5, 5, 1, 0)], 0, 0, 16, 0)).toBe(true); // car crossing east
  });

  it("flags oncoming traffic", () => {
    expect(conflictNearFor([veh(0, 6, 0, -1)], 0, 0, 16, 0)).toBe(true); // car heading south
  });

  it("ignores same-direction traffic", () => {
    expect(conflictNearFor([veh(0, 6, 0, 1)], 0, 0, 16, 0)).toBe(false); // car also heading north
  });

  it("ignores vehicles outside the radius", () => {
    expect(conflictNearFor([veh(50, 50, 1, 0)], 0, 0, 16, 0)).toBe(false);
  });

  it("ignores stopped / parked vehicles", () => {
    expect(conflictNearFor([veh(5, 5, 1, 0, 0)], 0, 0, 16, 0)).toBe(false);
  });
});
