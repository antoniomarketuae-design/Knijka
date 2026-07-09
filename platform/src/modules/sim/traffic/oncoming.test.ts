import { describe, expect, it } from "vitest";
import { oncomingNearFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player at origin heading north (0). Oncoming = a car ahead (+y) heading south.
describe("oncomingNearFor", () => {
  it("flags an oncoming car ahead", () => {
    expect(oncomingNearFor([veh(0, 15, 0, -1)], 0, 0, 0, 26)).toBe(true);
  });

  it("ignores a car ahead going the same way", () => {
    expect(oncomingNearFor([veh(0, 15, 0, 1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores an oncoming car behind the player", () => {
    expect(oncomingNearFor([veh(0, -15, 0, -1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores cars outside the radius", () => {
    expect(oncomingNearFor([veh(0, 40, 0, -1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores stopped cars", () => {
    expect(oncomingNearFor([veh(0, 15, 0, -1, 0)], 0, 0, 0, 26)).toBe(false);
  });
});
