import { describe, expect, it } from "vitest";
import type { SignalPhase } from "../../contracts";
import { DEFAULT_TRAFFIC_CONFIG } from "../types";
import { createVehicleAgent, updateVehicle, VEHICLE_LENGTH_M, type VehicleAgent, type VehicleEnv } from "../vehicles";
import { buildSquareGraph, makeVehicleEnv, squareRoute } from "./fixtures";

const DT = 1 / 60;

/** Advance the whole env by `seconds`, calling `probe` after every step. */
function run(env: VehicleEnv, seconds: number, probe?: (t: number) => void): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    env.timeSec += DT;
    for (const agent of env.agents) updateVehicle(agent, DT, env);
    probe?.(env.timeSec);
  }
}

function setup(phase: SignalPhase | ((id: string) => SignalPhase)) {
  const { district, graph } = buildSquareGraph({ signalAtB: true });
  const route = squareRoute(graph);
  const agent = createVehicleAgent(0, route, 0, 0.9, 0);
  const env = makeVehicleEnv(graph, district, [agent]);
  env.signalPhase = typeof phase === "function" ? phase : () => phase;
  updateVehicle(agent, 0, env); // publish initial pose
  return { agent, env, route, graph };
}

// Lane A->B is route index 0; its stop line for signal B sits at
// length - signalStopOffset - halfLen. Node B is degree 2, so its junction
// mouth (~2.6 m) never exceeds the config floor and the floor applies.
const STOP_LINE_S = 300 - DEFAULT_TRAFFIC_CONFIG.signalStopOffsetM - VEHICLE_LENGTH_M / 2;

describe("red-light stopping envelope", () => {
  it("stops before the stop line on red and never crosses", () => {
    const { agent, env } = setup("red");
    let maxS = 0;
    run(env, 90, () => {
      if (agent.routePos === 0) maxS = Math.max(maxS, agent.s);
      // Never leaves lane A->B: crossing node B would advance routePos.
      expect(agent.routePos).toBe(0);
      expect(agent.s).toBeLessThan(STOP_LINE_S + 0.3);
    });
    // It actually drove up to the line (not just idled at spawn) ...
    expect(maxS).toBeGreaterThan(STOP_LINE_S - 8);
    // ... and is now held there.
    expect(agent.speed).toBeLessThan(0.2);
  });

  it("treats redYellow as stop", () => {
    const { agent, env } = setup("redYellow");
    run(env, 60);
    expect(agent.routePos).toBe(0);
    expect(agent.s).toBeLessThan(STOP_LINE_S + 0.3);
    expect(agent.speed).toBeLessThan(0.2);
  });

  it("stops on yellow when there is room to stop comfortably", () => {
    const { agent, env } = setup("yellow");
    run(env, 60);
    expect(agent.routePos).toBe(0);
    expect(agent.s).toBeLessThan(STOP_LINE_S + 0.3);
  });

  it("commits through on yellow when already too close to stop", () => {
    const { agent, env } = setup("yellow");
    agent.s = STOP_LINE_S - 8; // ~8 m from the stop line
    agent.speed = 13; // needs ~15 m at full braking -> cannot stop
    let minSpeedBeforeB = Infinity;
    run(env, 10, () => {
      if (agent.routePos === 0) minSpeedBeforeB = Math.min(minSpeedBeforeB, agent.speed);
    });
    expect(agent.routePos).toBeGreaterThan(0); // passed node B
    // No panic stop at the line (the 90-degree corner itself caps speed ~4).
    expect(minSpeedBeforeB).toBeGreaterThan(3);
  });

  it("drives through and keeps looping on green", () => {
    const { agent, env } = setup("green");
    let maxSpeed = 0;
    let lapped = false;
    run(env, 180, () => {
      maxSpeed = Math.max(maxSpeed, agent.speed);
      if (agent.routePos === 3) lapped = true;
    });
    expect(lapped).toBe(true);
    expect(maxSpeed).toBeGreaterThan(8);
  });
});

describe("following distance (IDM-lite)", () => {
  it("queues behind a leader held at a red light without overlap", () => {
    const { district, graph } = buildSquareGraph({ signalAtB: true });
    const route = squareRoute(graph);
    const leader = createVehicleAgent(0, route, 60, 0.9, 0);
    const follower = createVehicleAgent(1, route, 0, 1.0, 1);
    const env = makeVehicleEnv(graph, district, [leader, follower]);
    env.signalPhase = () => "red";
    updateVehicle(leader, 0, env);
    updateVehicle(follower, 0, env);

    run(env, 90, () => {
      if (leader.routePos === 0 && follower.routePos === 0) {
        const gap = leader.s - follower.s;
        expect(gap).toBeGreaterThanOrEqual(VEHICLE_LENGTH_M); // no clipping
      }
    });
    // Settled: leader at the line, follower one car-slot behind.
    const gap = leader.s - follower.s;
    expect(follower.speed).toBeLessThan(0.25);
    expect(gap).toBeGreaterThanOrEqual(VEHICLE_LENGTH_M + 1.0);
    expect(gap).toBeLessThan(VEHICLE_LENGTH_M + 8);
  });

  it("a fast follower never rams a slow leader", () => {
    const { district, graph } = buildSquareGraph({});
    const route = squareRoute(graph);
    const leader = createVehicleAgent(0, route, 40, 0.4, 0); // slow temperament
    const follower = createVehicleAgent(1, route, 0, 1.0, 1);
    const env = makeVehicleEnv(graph, district, [leader, follower]);
    updateVehicle(leader, 0, env);
    updateVehicle(follower, 0, env);

    run(env, 120, () => {
      // Loop-space distance follower -> leader (both on the same loop).
      const ls = route.laneStartS;
      const sL = ls[leader.routePos] + leader.s;
      const sF = ls[follower.routePos] + follower.s;
      const ahead = (sL - sF + route.totalLength) % route.totalLength;
      expect(ahead).toBeGreaterThanOrEqual(VEHICLE_LENGTH_M - 0.01);
    });
  });
});

describe("player blocking the lane", () => {
  it("stops behind the player and resumes when the player leaves", () => {
    const { agent, env } = setup("green");
    env.hasPlayer = true;
    env.playerX = 150;
    env.playerY = -DEFAULT_TRAFFIC_CONFIG.laneWidthM / 2; // exactly on the A->B lane center
    env.playerSpeedMps = 0;

    let minDist = Infinity;
    run(env, 60, () => {
      const d = Math.hypot(agent.state.x - env.playerX, agent.state.y - env.playerY);
      minDist = Math.min(minDist, d);
    });
    expect(agent.routePos).toBe(0); // never drove through the player
    expect(agent.speed).toBeLessThan(0.2);
    expect(minDist).toBeGreaterThanOrEqual(VEHICLE_LENGTH_M + 0.5); // center-center

    env.hasPlayer = false;
    let resumed = false;
    run(env, 15, () => {
      if (agent.speed > 2) resumed = true;
    });
    expect(resumed).toBe(true);
  });

  it("ignores a player parked outside the lane", () => {
    const { agent, env } = setup("green");
    env.hasPlayer = true;
    env.playerX = 150;
    env.playerY = -14; // ~10 m off the lane center: > playerLateralM (5 m)
    env.playerSpeedMps = 0;
    run(env, 60);
    expect(agent.routePos).toBeGreaterThan(0); // passed the parked car
  });
});

describe("pedestrian-on-crossing yield", () => {
  it("stops before an occupied crossing and continues once it clears", () => {
    const { district, graph } = buildSquareGraph({ crossingOnAB: true });
    const route = squareRoute(graph);
    const agent: VehicleAgent = createVehicleAgent(0, route, 0, 0.9, 0);
    const env = makeVehicleEnv(graph, district, [agent]);
    env.crossingCounts.set("x1", 1); // pedestrian on the crossing at s=150
    updateVehicle(agent, 0, env);

    run(env, 60);
    expect(agent.routePos).toBe(0);
    // Stopped before the crossing minus the configured stop offset.
    expect(agent.s).toBeLessThan(150 - DEFAULT_TRAFFIC_CONFIG.crossingStopOffsetM);
    expect(agent.speed).toBeLessThan(0.2);

    env.crossingCounts.set("x1", 0);
    run(env, 30);
    expect(route.laneStartS[agent.routePos] + agent.s).toBeGreaterThan(160);
  });
});
