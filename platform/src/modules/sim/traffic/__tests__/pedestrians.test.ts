import { describe, expect, it } from "vitest";
import {
  buildPedRoute,
  createPedestrianAgent,
  crossingGateOpen,
  updatePedestrian,
  type PedestrianAgent,
  type PedestrianEnv,
} from "../pedestrians";
import { mulberry32 } from "../rng";
import { createTrafficSystem } from "../system";
import { createVehicleAgent } from "../vehicles";
import { DEFAULT_TRAFFIC_CONFIG } from "../types";
import { buildSquareGraph, makePedestrianEnv, makeSquareDistrict, squareRoute } from "./fixtures";

const DT = 1 / 60;

function makeWalker(seed = 5): { agent: PedestrianAgent; env: PedestrianEnv } {
  const { district, graph } = buildSquareGraph({ crossingOnAB: true });
  const crossing = district.crossings[0];
  const edge = district.roads.edges.find((e) => e.id === crossing.edgeId)!;
  const route = buildPedRoute(crossing, edge, DEFAULT_TRAFFIC_CONFIG.laneWidthM, mulberry32(seed));
  expect(route).not.toBeNull();
  const agent = createPedestrianAgent(0, route!, mulberry32(seed + 1), 0, DEFAULT_TRAFFIC_CONFIG);
  const env = makePedestrianEnv(graph, district);
  updatePedestrian(agent, 0, env);
  return { agent, env };
}

describe("pedestrian crossing flow (unsignalized, clear road)", () => {
  it("approaches, waits 1-2 s, crosses, and clears the occupancy count", () => {
    const { agent, env } = makeWalker();
    let tWaitStart = -1;
    let tCrossStart = -1;
    let sawCount = false;
    let t = 0;
    for (let i = 0; i < 60 * 120 && tCrossStart < 0; i++) {
      updatePedestrian(agent, DT, env);
      t += DT;
      if (agent.mode === "waiting" && tWaitStart < 0) tWaitStart = t;
      if (agent.state.onCrossing && tCrossStart < 0) tCrossStart = t;
      if ((env.crossingCounts.get("x1") ?? 0) > 0) {
        sawCount = true;
        expect(agent.state.onCrossing).toBe(true);
      }
    }
    expect(tWaitStart).toBeGreaterThan(0);
    expect(tCrossStart).toBeGreaterThan(tWaitStart);
    // Curb wait before stepping onto the road: at least the configured min.
    expect(tCrossStart - tWaitStart).toBeGreaterThanOrEqual(DEFAULT_TRAFFIC_CONFIG.pedWaitMinSec);
    expect(sawCount).toBe(true);

    // Finish the crossing: occupancy must drop back to zero.
    for (let i = 0; i < 60 * 60 && agent.state.onCrossing; i++) {
      updatePedestrian(agent, DT, env);
    }
    expect(agent.state.onCrossing).toBe(false);
    expect(env.crossingCounts.get("x1")).toBe(0);
  });
});

describe("unsignalized gate logic", () => {
  it("blocks while a vehicle is close or arriving soon, opens when past", () => {
    const { district, graph } = buildSquareGraph({ crossingOnAB: true });
    const route = squareRoute(graph);
    const veh = createVehicleAgent(0, route, 140, 0.9, 0); // 10 m before x1@150
    veh.speed = 0;
    const env = makePedestrianEnv(graph, district, [veh]);

    // 10 m away (< 12 m hard block), even stationary.
    expect(crossingGateOpen("x1", 150, 0, env)).toBe(false);

    // 35 m away at 12 m/s -> arrives in ~2.9 s < 3 s gap.
    veh.s = 115;
    veh.speed = 12;
    expect(crossingGateOpen("x1", 150, 0, env)).toBe(false);

    // 50 m away at 12 m/s -> ~4.2 s: acceptable gap.
    veh.s = 100;
    expect(crossingGateOpen("x1", 150, 0, env)).toBe(true);

    // Already past the crossing.
    veh.s = 155;
    veh.speed = 12;
    expect(crossingGateOpen("x1", 150, 0, env)).toBe(true);
  });

  it("blocks for a moving player near the crossing, yields to a stopped one", () => {
    const { agent, env } = makeWalker();
    env.hasPlayer = true;
    env.playerX = 140;
    env.playerY = 0;
    env.playerSpeedKmh = 30;

    let crossed = false;
    for (let i = 0; i < 60 * 40; i++) {
      updatePedestrian(agent, DT, env);
      if (agent.state.onCrossing) crossed = true;
    }
    expect(crossed).toBe(false); // waits out the moving player
    expect(agent.mode).toBe("waiting");

    env.playerSpeedKmh = 0; // player stopped to yield — teaching moment
    for (let i = 0; i < 60 * 20 && !crossed; i++) {
      updatePedestrian(agent, DT, env);
      if (agent.state.onCrossing) crossed = true;
    }
    expect(crossed).toBe(true);
  });
});

describe("signalized gate logic", () => {
  it("crosses only while the mapped vehicle signal is red", () => {
    const { district, graph } = buildSquareGraph({
      signalAtB: true,
      signalizedCrossingNearB: true,
    });
    const env = makePedestrianEnv(graph, district);

    env.signalPhase = () => "green";
    expect(crossingGateOpen("x2", 280, 0, env)).toBe(false);
    env.signalPhase = () => "yellow";
    expect(crossingGateOpen("x2", 280, 0, env)).toBe(false);
    env.signalPhase = () => "redYellow";
    expect(crossingGateOpen("x2", 280, 0, env)).toBe(false);
    env.signalPhase = () => "red"; // vehicle red = pedestrian green
    expect(crossingGateOpen("x2", 280, 0, env)).toBe(true);
  });
});

describe("TrafficSystem.pedestrianOnCrossing", () => {
  it("answers per crossing id — the runtime setPedestrianQuery hook", () => {
    const system = createTrafficSystem(makeSquareDistrict({ crossingOnAB: true }), {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 1,
    });
    expect(system.pedestrians.length).toBe(1);
    expect(system.pedestrianOnCrossing("x1")).toBe(false);
    expect(system.pedestrianOnCrossing("unknown-id")).toBe(false);

    const ctx = { signalPhase: () => "green" as const, playerPos: null };
    let everOn = false;
    let offAfterOn = false;
    for (let i = 0; i < 60 * 240; i++) {
      system.update(DT, ctx);
      const on = system.pedestrianOnCrossing("x1");
      if (on) everOn = true;
      else if (everOn) {
        offAfterOn = true;
        break;
      }
    }
    expect(everOn).toBe(true);
    expect(offAfterOn).toBe(true);
  });
});
