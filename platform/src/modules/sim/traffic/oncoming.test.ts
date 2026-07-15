import { describe, expect, it } from "vitest";
import { oncomingApproachFor, oncomingNearFor } from "./system";

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

// N1 (doc 72 JU-10): the rich form carries distance + closing speed so the
// runtime's left-turn tracker adjudicates the accepted gap in SECONDS.
describe("oncomingApproachFor", () => {
  it("reports distance and closing speed of a head-on car", () => {
    const a = oncomingApproachFor([veh(0, 15, 0, -1, 8)], 0, 0, 0, 26);
    expect(a).not.toBeNull();
    expect(a!.distM).toBeCloseTo(15, 5);
    expect(a!.closingMps).toBeCloseTo(8, 5); // fully toward the player
    expect(a!.speedMps).toBe(8);
  });

  it("picks the most URGENT oncoming (smallest time-to-arrival), not the nearest", () => {
    // 20 m at 10 m/s (2 s) is more urgent than 12 m at 2 m/s (6 s).
    const a = oncomingApproachFor(
      [veh(0, 12, 0, -1, 2), veh(0, 20, 0, -1, 10)],
      0,
      0,
      0,
      26,
    );
    expect(a!.distM).toBeCloseTo(20, 5);
    expect(a!.closingMps).toBeCloseTo(10, 5);
  });

  it("closing speed is the component toward the player, not raw speed", () => {
    // Car ahead angled 45° off the approach line: closing < speed.
    const s = Math.SQRT1_2;
    const a = oncomingApproachFor([veh(0, 15, -s, -s, 8)], 0, 0, 0, 26);
    expect(a!.speedMps).toBe(8);
    expect(a!.closingMps).toBeCloseTo(8 * s, 5);
  });

  it("returns null when the way is clear / cars are stopped", () => {
    expect(oncomingApproachFor([], 0, 0, 0, 26)).toBeNull();
    expect(oncomingApproachFor([veh(0, 15, 0, -1, 0)], 0, 0, 0, 26)).toBeNull();
  });
});
