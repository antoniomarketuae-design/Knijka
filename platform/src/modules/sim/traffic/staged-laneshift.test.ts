/**
 * laneShift — the staged lane-change command (doc 72 FO-03/FO-07, the
 * "small traffic-port addition"). Contract under test:
 *  - the published pose ramps linearly to `toOffsetM` right of the resolved
 *    path over `rampSec`, then parks EXACTLY on the target (clamped);
 *  - the LATERAL channel is independent: the longitudinal command (cruise)
 *    keeps driving arc progress while the glide runs;
 *  - deterministic: same command + dt sequence ⇒ identical published poses;
 *  - `reset` clears the offset with the rest of the pose;
 *  - an actor never commanded publishes byte-identically (lat stays 0);
 *  - pedestrians ignore the command (vehicle-only, like matchPlayer/brake);
 *  - matchPlayer accepts a NEGATIVE gap (the FO-07 rear-pacing recipe).
 */

import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "./system";
import type { TrafficDistrict, TrafficSystem, TrafficUpdateContext } from "./types";

/** ln-v1's shape in miniature: one straight 4-lane bidirectional street. */
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

/** Northbound driving-lane center of the fixture (1.5 × the 8.125 m drawn lane). */
const LANE_X = 12.1875;
const LANE_SHIFT = 8.125;
const DT = 1 / 60;

const CTX: TrafficUpdateContext = {
  signalPhase: () => "green",
  playerPos: null,
};

function sys(): TrafficSystem {
  return createTrafficSystem(district(), { seed: 1, vehicleCount: 0, pedestrianCount: 0 });
}

function stageCar(traffic: TrafficSystem, id = "car") {
  const view = traffic.stage({
    kind: "vehicle",
    id,
    pathNodes: ["n1", "n2"],
    hold: { nodeIndex: 0, offsetM: 50 },
    cruiseSpeedMps: 10,
  });
  expect(view).not.toBeNull();
  return view!;
}

describe("staged laneShift", () => {
  it("ramps the published pose to the target offset and parks exactly on it", () => {
    const traffic = sys();
    const view = stageCar(traffic);
    expect(view.x).toBeCloseTo(LANE_X, 3);

    traffic.stagedCommand("car", { type: "cruise" });
    traffic.stagedCommand("car", { type: "laneShift", toOffsetM: -LANE_SHIFT, rampSec: 1.5 });
    // Mid-glide (~0.75 s): about halfway across, still moving forward.
    for (let i = 0; i < 45; i++) traffic.update(DT, CTX);
    expect(view.x).toBeGreaterThan(LANE_X - LANE_SHIFT + 1);
    expect(view.x).toBeLessThan(LANE_X - 1);
    // Well past the ramp: parked EXACTLY one lane left, still cruising.
    for (let i = 0; i < 120; i++) traffic.update(DT, CTX);
    expect(view.x).toBeCloseTo(LANE_X - LANE_SHIFT, 6);
    expect(view.speedMps).toBeGreaterThan(5);
    expect(view.s).toBeGreaterThan(55); // the longitudinal cruise never paused
  });

  it("is deterministic: same commands + dt sequence publish identical poses", () => {
    const run = (): number[] => {
      const traffic = sys();
      const view = stageCar(traffic);
      traffic.stagedCommand("car", { type: "cruise", speedMps: 9 });
      traffic.stagedCommand("car", { type: "laneShift", toOffsetM: -LANE_SHIFT, rampSec: 1.2 });
      const xs: number[] = [];
      for (let i = 0; i < 180; i++) {
        traffic.update(DT, CTX);
        xs.push(view.x, view.y, view.speedMps);
      }
      return xs;
    };
    expect(run()).toEqual(run());
  });

  it("reset clears the lateral offset with the rest of the pose", () => {
    const traffic = sys();
    const view = stageCar(traffic);
    traffic.stagedCommand("car", { type: "cruise" });
    traffic.stagedCommand("car", { type: "laneShift", toOffsetM: -LANE_SHIFT, rampSec: 0.5 });
    for (let i = 0; i < 90; i++) traffic.update(DT, CTX);
    expect(view.x).toBeCloseTo(LANE_X - LANE_SHIFT, 6);
    traffic.stagedCommand("car", { type: "reset" });
    expect(view.x).toBeCloseTo(LANE_X, 3); // back at the hold pose, own lane
    expect(view.s).toBeCloseTo(50, 3);
  });

  it("an actor never commanded publishes on its lane center (lat stays 0)", () => {
    const traffic = sys();
    const view = stageCar(traffic);
    traffic.stagedCommand("car", { type: "cruise" });
    for (let i = 0; i < 120; i++) traffic.update(DT, CTX);
    expect(view.x).toBeCloseTo(LANE_X, 6);
  });

  it("pedestrians ignore laneShift (vehicle-only command)", () => {
    const traffic = sys();
    const view = traffic.stage({
      kind: "pedestrian",
      id: "ped",
      path: [
        { x: 20, y: 0 },
        { x: 20, y: 10 },
      ],
      speedMps: 1.2,
    });
    expect(view).not.toBeNull();
    traffic.stagedCommand("ped", { type: "laneShift", toOffsetM: 5, rampSec: 1 });
    for (let i = 0; i < 60; i++) traffic.update(DT, CTX);
    expect(view!.x).toBeCloseTo(20, 6); // unmoved laterally, never released
  });

  it("matchPlayer holds a NEGATIVE gap — pacing BEHIND the player (FO-07)", () => {
    const traffic = sys();
    // playerGuard OFF — the guard's stop-6-m-short corridor would forbid the
    // glued rear pose (exactly why the rearTailgater runner disables it).
    const view = traffic.stage({
      kind: "vehicle",
      id: "tail",
      pathNodes: ["n1", "n2"],
      hold: { nodeIndex: 0, offsetM: 50 },
      cruiseSpeedMps: 10,
      decelMps2: 12,
      playerGuard: false,
    })!;
    expect(view).not.toBeNull();
    traffic.stagedCommand("tail", { type: "matchPlayer", gapM: -9, maxSpeedMps: 18 });
    // Player cruises the same lane at 12 m/s, starting 20 m ahead of the actor.
    let playerY = 70;
    const ctx: TrafficUpdateContext = {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: playerY },
      playerSpeedKmh: 43.2,
      playerHeadingDeg: 0,
    };
    // Long enough for the spin-up (accel-limited from a standstill while the
    // player pulls away) plus the proportional convergence onto the pose.
    for (let i = 0; i < 60 * 20; i++) {
      playerY += 12 * DT;
      ctx.playerPos = { x: LANE_X, y: playerY };
      traffic.update(DT, ctx);
    }
    // Converged: ~9 m of centers behind the player, matching their speed.
    expect(playerY - view.y).toBeGreaterThan(7);
    expect(playerY - view.y).toBeLessThan(11);
    expect(view.speedMps).toBeGreaterThan(11);
    expect(view.speedMps).toBeLessThan(13);
  });
});
