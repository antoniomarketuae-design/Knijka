/**
 * Test support — a hand-built answer to the runtime's circulating query.
 *
 * The roundabout tracker convicts on what the cars on the ring HAD TO DO
 * (founder ruling 2026-10-05, «bill forced braking»): the query hands it every
 * vehicle in the ring band with the running total of the speed that vehicle's
 * own traffic model has shed because of the student. A runtime unit test has no
 * traffic system, so it says what the cars did by hand — one `StubCar` per car,
 * mutated between frames — and `ringReport` shapes it the way
 * `TrafficSystem.circulatingConflict` does.
 *
 * NO_RING is the answer of an empty ring; BUSY_RING is «a car is there to be
 * watched and nothing else is known about it» — presence without any account,
 * which under the ruling can commend (with the rest of the evidence) and can
 * never convict.
 */

import type { CirculatingQueryReport, CirculatingVehicleReport } from "../worldRuntime";

export interface StubCar {
  id: number;
  /** Compass azimuth of the car about the ring centre, degrees (180 = south). */
  azDeg: number;
  /** Its distance from the ring centre, m. */
  radiusM: number;
  speedMps: number;
  /** Running total of the speed it has shed because of the student, m/s. */
  shedMps: number;
  /** Presence flags, as the traffic module would compute them for his pose. */
  approaching?: boolean;
  pastEntry?: boolean;
  /** Heading: "ccw" (default) goes round the ring; "inward" is a car entering it. */
  heading?: "ccw" | "inward";
}

export const NO_RING: CirculatingQueryReport = { conflict: false, vehicles: [] };
export const BUSY_RING: CirculatingQueryReport = { conflict: true, vehicles: [] };

export function stubVehicle(centre: { x: number; y: number }, car: StubCar): CirculatingVehicleReport {
  const a = (car.azDeg * Math.PI) / 180;
  const sx = Math.sin(a);
  const sy = Math.cos(a);
  const inward = car.heading === "inward";
  return {
    id: car.id,
    x: centre.x + car.radiusM * sx,
    y: centre.y + car.radiusM * sy,
    // Counter-clockwise round the centre (compass azimuth decreasing), or
    // straight at it.
    dirX: inward ? -sx : -sy,
    dirY: inward ? -sy : sx,
    speedMps: car.speedMps,
    halfLengthM: 2.05,
    halfWidthM: 0.9,
    approaching: car.approaching ?? false,
    pastEntry: car.pastEntry ?? false,
    playerShedMps: car.shedMps,
  };
}

/** The report for these cars; `conflict` defaults to «one of them is approaching». */
export function ringReport(
  centre: { x: number; y: number },
  cars: readonly StubCar[],
  conflict?: boolean,
): CirculatingQueryReport {
  return {
    conflict: conflict ?? cars.some((c) => c.approaching === true),
    vehicles: cars.map((c) => stubVehicle(centre, c)),
  };
}
