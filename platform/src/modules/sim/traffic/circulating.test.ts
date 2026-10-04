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

// Clause (R) DEPARTING AND CLEAR — rb-mini-v1's own geometry: ring centre
// (0, 0), circulators on r = 18 going counter-clockwise, the driver at the
// south mouth (4.06, −27.5). Ring angle φ is measured from the SOUTH node,
// counter-clockwise through EAST (traces/scRbBusyGap.ts's convention).
describe("circulatingConflictFor — clause (R): a car already past the driver's entry is not his to give way to", () => {
  const R = 18;
  const MOUTH: [number, number] = [4.06, -27.5];
  const BAND = R + 9;
  /** A circulator at ring angle φ, moving counter-clockwise (or clockwise). */
  const onRing = (phiDeg: number, sense: 1 | -1 = 1, speedMps = 2.9) => {
    const a = (phiDeg * Math.PI) / 180;
    return veh(R * Math.sin(a), -R * Math.cos(a), sense * Math.cos(a), sense * Math.sin(a), speedMps);
  };
  const ask = (car: ReturnType<typeof veh>, headingDeg: number) =>
    circulatingConflictFor([car], 0, 0, MOUTH[0], MOUTH[1], headingDeg, BAND);

  it("a car 52° DOWNSTREAM of his mouth (15.7 m beyond it) is on his left as the chord turns north-east — and is NOT a conflict", () => {
    // Precondition: the presence-only part of the test does see it (in the
    // band, within 26 m, ≥ 1.5 m on his left at heading 40°)…
    const car = onRing(60);
    const lx = -Math.cos((40 * Math.PI) / 180);
    const ly = Math.sin((40 * Math.PI) / 180);
    expect((car.x - MOUTH[0]) * lx + (car.y - MOUTH[1]) * ly).toBeGreaterThan(1.5);
    expect(Math.hypot(car.x - MOUTH[0], car.y - MOUTH[1])).toBeLessThan(26);
    // …and it has already gone past him.
    expect(ask(car, 40)).toBe(false);
  });

  it("the SAME place, driving the other way round (clockwise, towards his mouth), IS a conflict", () => {
    expect(ask(onRing(60, -1), 40)).toBe(true);
  });

  it("a car only ~12° past his mouth (≈ 3.6 m — still straddling it, under CONFLICT_CLEARED_M) still counts", () => {
    expect(ask(onRing(20), 40)).toBe(true);
  });

  it("a car UPSTREAM, approaching his mouth from the west/south-west, still counts at every heading he can hold", () => {
    for (const h of [0, 20, 40]) expect(ask(onRing(-40), h), `heading ${h}`).toBe(true);
  });

  it("the short gap's shape: the lead gone 60° downstream AND the follower 26° behind it upstream of him — the follower keeps the conviction", () => {
    const lead = onRing(60);
    const follower = onRing(-10);
    expect(circulatingConflictFor([lead], 0, 0, MOUTH[0], MOUTH[1], 40, BAND)).toBe(false);
    expect(circulatingConflictFor([lead, follower], 0, 0, MOUTH[0], MOUTH[1], 40, BAND)).toBe(true);
  });
});
