import { describe, expect, it } from "vitest";
import { conflictFromRightFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player at origin heading north; junction ahead at (0,10); the player's right is +x (east).
describe("conflictFromRightFor", () => {
  it("flags a car approaching from the right", () => {
    expect(conflictFromRightFor([veh(8, 12, -1, 0)], 0, 10, 0, 0, 0, 16)).toBe(true);
  });

  it("ignores a car on the left", () => {
    expect(conflictFromRightFor([veh(-8, 12, 1, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores a car far from the junction", () => {
    expect(conflictFromRightFor([veh(30, 40, -1, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores same-direction traffic on the right", () => {
    expect(conflictFromRightFor([veh(8, 12, 0, 1)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores stopped cars", () => {
    expect(conflictFromRightFor([veh(8, 12, -1, 0, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });
});
