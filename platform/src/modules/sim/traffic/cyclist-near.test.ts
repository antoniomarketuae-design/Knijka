/**
 * cyclistNearFor — the VU-02 same-direction cyclist query (system.ts).
 *
 * The query is the vulnerable-pass tracker's ONLY telemetry seam, so its
 * filters carry the archetype's legal boundaries:
 *  - only states the caller tags as CYCLISTS return (the vehicleCollisionKind
 *    marker — staged curb proxies, extraRightOffsetM > 0);
 *  - ONCOMING cyclists never return (a meeting is not a pass — the oncoming
 *    bank is a different duty, doc 72 VU-02);
 *  - crossing traffic never returns (the right-hook family's turf);
 *  - nearest-first among several, radius-bounded.
 *
 * Plus the system-level integration: a staged curb-riding proxy (positive
 * extraRightOffsetM) is returned by TrafficSystem.cyclistNear, an ordinary
 * staged vehicle is not.
 */

import { describe, expect, it } from "vitest";
import { createTrafficSystem, cyclistNearFor } from "./system";
import type { TrafficDistrict } from "./types";

interface V {
  id: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
}

const north = (id: number, x: number, y: number, speedMps = 3): V => ({
  id,
  x,
  y,
  dirX: 0,
  dirY: 1,
  speedMps,
});
const south = (id: number, x: number, y: number, speedMps = 3): V => ({
  id,
  x,
  y,
  dirX: 0,
  dirY: -1,
  speedMps,
});
const east = (id: number, x: number, y: number, speedMps = 3): V => ({
  id,
  x,
  y,
  dirX: 1,
  dirY: 0,
  speedMps,
});

const isCyclist = (ids: number[]) => (id: number) => ids.includes(id);

describe("cyclistNearFor — the VU-02 telemetry seam", () => {
  it("returns the same-direction cyclist's live pose", () => {
    const c = cyclistNearFor([north(1000, 6.66, 120)], isCyclist([1000]), 4.06, 100, 0, 30);
    expect(c).toEqual({ x: 6.66, y: 120, dirX: 0, dirY: 1, speedMps: 3 });
  });

  it("ignores non-cyclist states entirely (ambient cars never arm the tracker)", () => {
    expect(cyclistNearFor([north(3, 6.66, 120)], isCyclist([1000]), 4.06, 100, 0, 30)).toBeNull();
  });

  it("an ONCOMING cyclist never returns — a meeting is not a pass", () => {
    expect(cyclistNearFor([south(1000, 6.66, 120)], isCyclist([1000]), 4.06, 100, 0, 30)).toBeNull();
  });

  it("crossing traffic never returns — the right-hook family's turf", () => {
    expect(cyclistNearFor([east(1000, 6.66, 120)], isCyclist([1000]), 4.06, 100, 0, 30)).toBeNull();
  });

  it("radius-bounded, nearest-first among several", () => {
    const far = north(1000, 6.66, 200); // 100 m up the street — outside 30 m
    const near = north(1001, 6.66, 118);
    const nearer = north(1002, 6.66, 110);
    expect(cyclistNearFor([far], isCyclist([1000, 1001, 1002]), 4.06, 100, 0, 30)).toBeNull();
    const c = cyclistNearFor([far, near, nearer], isCyclist([1000, 1001, 1002]), 4.06, 100, 0, 30);
    expect(c?.y).toBe(110);
  });

  it("a STANDING cyclist still returns (the pass duty is not speed-gated here)", () => {
    const c = cyclistNearFor([north(1000, 6.66, 118, 0)], isCyclist([1000]), 4.06, 100, 0, 30);
    expect(c?.speedMps).toBe(0);
  });
});

describe("TrafficSystem.cyclistNear — the staged-proxy integration", () => {
  // Minimal 1-street district (the staged-laneshift test fixture shape).
  const district: TrafficDistrict = {
    roads: {
      nodes: [
        { id: "n-a", x: 0, y: 0 },
        { id: "n-b", x: 0, y: 300 },
      ],
      edges: [
        {
          id: "e-street",
          from: "n-a",
          to: "n-b",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 2,
          maxspeed: 50,
          length: 300,
          geometry: [
            [0, 0],
            [0, 300],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };

  it("returns a staged curb-riding proxy (extraRightOffsetM > 0), not a plain staged car", () => {
    const traffic = createTrafficSystem(district, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const cyclist = traffic.stage({
      kind: "vehicle",
      id: "probe-cyclist",
      pathNodes: ["n-a", "n-b"],
      hold: { nodeIndex: 0, offsetM: 120 },
      cruiseSpeedMps: 3,
      extraRightOffsetM: 2.6, // the cyclist tag
    });
    const car = traffic.stage({
      kind: "vehicle",
      id: "probe-car",
      pathNodes: ["n-a", "n-b"],
      hold: { nodeIndex: 0, offsetM: 140 },
      cruiseSpeedMps: 10,
    });
    expect(cyclist).not.toBeNull();
    expect(car).not.toBeNull();

    // Query from the lane center 20 m south of the cyclist, heading north.
    const c = traffic.cyclistNear(4.06, 100, 0, 30);
    expect(c).not.toBeNull();
    // The cyclist rides curb-side of the northbound lane (positive offset).
    expect(c!.x).toBeCloseTo(4.0625 + 2.6, 3);
    expect(c!.y).toBeCloseTo(120, 3);

    // The plain staged car (also within 30 m, same direction) must NOT be the
    // returned state even though it is nearer than nothing — prove it by
    // querying a window that only reaches the car.
    expect(traffic.cyclistNear(4.06, 139, 0, 5)).toBeNull();
  });
});
