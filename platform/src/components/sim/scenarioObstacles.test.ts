// Pure-helper contracts of the S0 scenario-obstacle layer (the R3F component
// itself is exercised in-scene; these pin the data math that the colliders
// and poses are built from).

import { describe, expect, it } from "vitest";
import { FLEET } from "@/modules/sim/traffic";
import {
  obstacleYawRad,
  PARKING_COLLISION_MIN_KMH,
  PROP_COLLIDERS,
  resolveVehicleModel,
  SCENARIO_OBSTACLE_NPC_ID_BASE,
  vehicleColliderDims,
} from "./ScenarioObstacles";

describe("scenario obstacle helpers", () => {
  it("district heading → three yaw matches the TrafficLayer mapping", () => {
    // north (0°): district dir (0,1) → yaw π (three −Z).
    expect(obstacleYawRad(0)).toBeCloseTo(Math.PI, 10);
    // east (90°): → yaw π/2 (three +X).
    expect(obstacleYawRad(90)).toBeCloseTo(Math.PI / 2, 10);
    // south (180°): → yaw 0 (three +Z).
    expect(obstacleYawRad(180)).toBeCloseTo(0, 10);
  });

  it("named fleet models resolve; unknown/absent fall back to a civilian", () => {
    expect(resolveVehicleModel("vela_h3", 0)).toBe(FLEET.indexOf("vela_h3"));
    expect(resolveVehicleModel("kargo_v", 0)).toBe(FLEET.indexOf("kargo_v"));
    const police = FLEET.indexOf("police");
    const boxy = FLEET.indexOf("suv_boxy_lux");
    for (const seed of [0, 1, 7, 42, 1234]) {
      const m = resolveVehicleModel(undefined, seed);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(FLEET.length);
      // Civilian parked pool: never police / hero SUV.
      expect(m).not.toBe(police);
      expect(m).not.toBe(boxy);
      // Deterministic: same seed → same model.
      expect(resolveVehicleModel(undefined, seed)).toBe(m);
      expect(resolveVehicleModel("no-such-model", seed)).toBe(m);
    }
  });

  it("vehicle collider dims wrap the measured bbox tightly", () => {
    // A vela_h3-ish rig: 1.62 m wide, 3.86 m long, roof at 1.45 m.
    const d = vehicleColliderDims(0.81, 1.93, 1.45);
    expect(d.half.x).toBeCloseTo(0.81, 10);
    expect(d.half.z).toBeCloseTo(1.93, 10);
    expect(d.half.y).toBeCloseTo(0.725, 10);
    expect(d.centerY).toBeCloseTo(0.725, 10); // box bottom sits ON the tarmac
  });

  it("prop colliders are slim (tight), tall enough for the chassis box", () => {
    // The player chassis box bottom rides at ~0.28 m; a collider that tops
    // out below that is untouchable — both props must reach past it.
    for (const dims of Object.values(PROP_COLLIDERS)) {
      expect(dims.centerY + dims.half.y).toBeGreaterThan(0.3);
      expect(dims.centerY - dims.half.y).toBeCloseTo(0, 5); // grounded
      expect(dims.half.x).toBeLessThanOrEqual(0.1); // tight, not a barrel
    }
  });

  it("grading constants: parking grades ANY contact; npcId space is clear", () => {
    expect(PARKING_COLLISION_MIN_KMH).toBe(0);
    // Ambient traffic < 1000, staged actors >= 1000 (contracts.ts) — the
    // scenario obstacle space must not collide with either.
    expect(SCENARIO_OBSTACLE_NPC_ID_BASE).toBeGreaterThanOrEqual(2000);
  });
});
