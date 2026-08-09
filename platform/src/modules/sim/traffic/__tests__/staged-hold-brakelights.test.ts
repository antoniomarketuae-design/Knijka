/**
 * B40 — A STAGED CAR THAT IS WAITING SHOWS ITS BRAKE LIGHTS.
 *
 * The founder, playing catalog 19 («Спане на зелено»): *„who is sleeping on
 * green? … who?"*. The lesson's whole subject is one staged car standing on the
 * far stop line with the same green as him, not moving — and it was measured
 * from the driving seat, at the pose the lesson's own card points at (57 m out),
 * as *„a ~30 px dark shape among other stationary vehicles"*. You could not tell
 * it faced you, and you could not tell it apart from the parked cars.
 *
 * The reason was one line in `staged.ts`: `braking = cmd.type === "brake" ||
 * speed > target + 0.3`, which is false when both speed and target are zero. So
 * every scripted actor asked to WAIT — the car pinned short of a junction box,
 * the колона at the end of `sc-follow-standstill`, and the sleeper this row is
 * about — sat with unlit lamps. The AMBIENT fleet did not have this bug
 * (`vehicles.ts`: `term > 0.8 && speed < 0.5`), so the two halves of the traffic
 * system disagreed about what a stopped car looks like.
 *
 * Two lit lamps is both the truth (a car held at a line has its foot on the
 * brake) and the cue a driver actually reads. This file is the gate on it.
 */

import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict, TrafficSystem, TrafficUpdateContext } from "../types";

function district(): TrafficDistrict {
  return {
    roads: {
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 0, y: 400 },
      ],
      edges: [
        {
          id: "e1",
          from: "n1",
          to: "n2",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 4,
          maxspeed: 50,
          length: 400,
          geometry: [
            [0, 0],
            [0, 400],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };
}

const DT = 1 / 60;
const CTX: TrafficUpdateContext = { signalPhase: () => "green", playerPos: null };

function sys(): TrafficSystem {
  return createTrafficSystem(district(), { seed: 1, vehicleCount: 0, pedestrianCount: 0 });
}

function stageCar(traffic: TrafficSystem, id = "car", offsetM = 50) {
  const view = traffic.stage({
    kind: "vehicle",
    id,
    pathNodes: ["n1", "n2"],
    hold: { nodeIndex: 0, offsetM },
    cruiseSpeedMps: 10,
  });
  expect(view).not.toBeNull();
  return view!;
}

/** Brake lamps live on the PUBLISHED vehicle state — the array `TrafficLayer`
 *  actually reads (`v.braking` → the tail-lamp colour). `StagedActorView` does
 *  not carry them, so a test that read the view would be testing nothing. */
function lamp(traffic: TrafficSystem) {
  const v = traffic.vehicles[traffic.vehicles.length - 1];
  expect(v, "the staged car must be published into system.vehicles").toBeDefined();
  return v;
}

const tick = (traffic: TrafficSystem, n: number) => {
  for (let i = 0; i < n; i++) traffic.update(DT, CTX);
};

describe("staged brake lamps — the standing hold (B40)", () => {
  it("an actor on its hold, never commanded, shows its brake lights", () => {
    // This is the sleeper's own state: staged, waiting for its armDistM, and on
    // screen the whole approach. It used to be unlit.
    const traffic = sys();
    const car = stageCar(traffic);
    tick(traffic, 60);
    expect(car.speedMps).toBe(0);
    expect(lamp(traffic).braking).toBe(true);
  });

  it("an actor PINNED by `cruise speedMps 0` shows them too", () => {
    // The priorityFromRight runner's „hold just short of the box" command —
    // a car visibly waiting at a junction, which is what it should look like.
    const traffic = sys();
    const car = stageCar(traffic);
    traffic.stagedCommand("car", { type: "cruise", speedMps: 0 });
    tick(traffic, 60);
    expect(car.speedMps).toBe(0);
    expect(lamp(traffic).braking).toBe(true);
  });

  it("…and drops them the moment it actually pulls away", () => {
    const traffic = sys();
    const car = stageCar(traffic);
    tick(traffic, 30);
    expect(lamp(traffic).braking).toBe(true);
    traffic.stagedCommand("car", { type: "cruise", speedMps: 8 });
    tick(traffic, 60); // ~1 s of a 2.6 m/s² ramp — well past the 0.5 m/s bar
    expect(car.speedMps).toBeGreaterThan(1);
    expect(lamp(traffic).braking).toBe(false);
  });

  it("a cruising actor is unlit, and lights up again as it comes back to rest", () => {
    const traffic = sys();
    const car = stageCar(traffic);
    traffic.stagedCommand("car", { type: "cruise", speedMps: 8 });
    tick(traffic, 180);
    expect(lamp(traffic).braking).toBe(false);
    traffic.stagedCommand("car", { type: "hold" });
    // Decelerating: lit by the OLD rule (speed > target + 0.3) …
    tick(traffic, 6);
    expect(lamp(traffic).braking).toBe(true);
    // …and still lit once it is standing still, which is the new half.
    tick(traffic, 180);
    expect(car.speedMps).toBe(0);
    expect(lamp(traffic).braking).toBe(true);
  });

  it("an actor that RAN OUT OF PATH is parked, not waiting — lamps off", () => {
    // The distinction the fix has to keep: `finished` actors are scenery that
    // has come to a stop, and a parked car with its brake lights on is a lie in
    // the other direction. (This is also the FR-B5-VAN shape — an actor stuck at
    // the end of its path must not read as a car that is about to move.)
    const traffic = sys();
    const car = stageCar(traffic, "car", 380);
    traffic.stagedCommand("car", { type: "cruise", speedMps: 10 });
    tick(traffic, 60 * 12); // 380 → 400 m of a 400 m path, then finished
    expect(car.speedMps).toBe(0);
    expect(lamp(traffic).braking).toBe(false);
  });

  it("NON-VACUITY: the pre-fix predicate would have left the standing car dark", () => {
    // Reconstructs the defect exactly. If this ever stops being true the tests
    // above have gone vacuous.
    const traffic = sys();
    const car = stageCar(traffic);
    tick(traffic, 60);
    const target = 0; // a held actor's commanded target
    const oldRule = car.speedMps > target + 0.3;
    expect(oldRule).toBe(false);
    expect(lamp(traffic).braking).toBe(true);
  });
});
