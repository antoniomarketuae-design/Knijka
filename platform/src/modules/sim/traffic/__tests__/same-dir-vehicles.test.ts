/**
 * Two traffic-module seams round 3 of sc-merge-lane-end:0487bcec publishes
 * (founder ruling 2026-09-30, «bill the forced braking»):
 *
 *  1. `sameDirVehiclesNear` — EVERY same-direction vehicle near the player
 *     (the lane-entry adjudicator picks the one behind him in the lane he
 *     entered; the nearest body is as often the car ahead in his own lane), with
 *     its id and half body length (the gap that matters is nose to tail);
 *  2. `StagedActorView.passGuardArmed` — what the staged layer actually did with
 *     the runner's `passGuard` commands, so a test can check the promise „the
 *     guard is disarmed while the car keeps station" against the layer that
 *     keeps it rather than against the commands that were sent.
 */

import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import { vehicleHalfLengthM, type StagedVehicleSpec, type TrafficUpdateContext } from "../types";
import { makeSquareDistrict } from "./fixtures";

const DT = 1 / 60;
const ctx = (x: number, y: number): TrafficUpdateContext => ({
  signalPhase: () => "green",
  playerPos: { x, y },
  playerSpeedKmh: 0,
  playerHeadingDeg: 90,
});

/** Square loop A(0,0)->B(300,0)->C(300,300)->D(0,300)->A (oneway, 2 lanes):
 *  the A→B side runs EAST (heading 90). */
function system() {
  return createTrafficSystem(makeSquareDistrict({}), { seed: 5, vehicleCount: 0, pedestrianCount: 0 });
}
const car = (id: string, offsetM: number, profile?: StagedVehicleSpec["profile"]): StagedVehicleSpec => ({
  kind: "vehicle",
  id,
  pathNodes: ["A", "B", "C"],
  hold: { nodeIndex: 0, offsetM },
  cruiseSpeedMps: 10,
  ...(profile ? { profile } : {}),
});

describe("sameDirVehiclesNear", () => {
  it("returns every same-direction vehicle inside the radius, with its id, speed and half body length", () => {
    const s = system();
    const a = s.stage(car("a", 60))!;
    const b = s.stage(car("b", 100, "bus"))!;
    s.stage(car("far", 290)); // 290 m up the A→B side: outside a 100 m probe from x ≈ 80
    s.update(DT, ctx(80, a.y));
    const got = s.sameDirVehiclesNear(80, a.y, 90, 100);
    const ids = got.map((v) => v.id).sort();
    const stateOf = (view: { x: number; y: number }) => s.vehicles.find((v) => v.x === view.x && v.y === view.y)!;
    expect(ids).toEqual([stateOf(a).id, stateOf(b).id].sort());
    const gb = got.find((v) => v.id === stateOf(b).id)!;
    expect(gb.halfLengthM).toBe(vehicleHalfLengthM("bus"));
    expect(got.find((v) => v.id === stateOf(a).id)!.halfLengthM).toBe(vehicleHalfLengthM("car"));
    expect(gb.x).toBe(b.x);
    expect(gb.dirX).toBeCloseTo(1, 6);
  });

  it("drops oncoming / crossing traffic (heading more than the same-direction cone off)", () => {
    const s = system();
    const a = s.stage(car("a", 60))!;
    s.update(DT, ctx(80, a.y));
    expect(s.sameDirVehiclesNear(80, a.y, 270, 100)).toEqual([]); // player facing WEST
    expect(s.sameDirVehiclesNear(80, a.y, 0, 100)).toEqual([]); // player facing NORTH (crossing)
    expect(s.sameDirVehiclesNear(80, a.y, 90 + 50, 100).length).toBe(1); // inside the 60° cone
  });
});

describe("StagedActorView.passGuardArmed", () => {
  it("publishes what the staged layer DID: false until armed, true once armed, false once disarmed, false after reset", () => {
    const s = system();
    const v = s.stage({ ...car("g", 60), playerGuard: false })!;
    s.update(DT, ctx(0, 400));
    expect(v.passGuardArmed).toBe(false);
    s.stagedCommand("g", { type: "passGuard", on: true });
    s.update(DT, ctx(0, 400));
    expect(v.passGuardArmed).toBe(true);
    s.stagedCommand("g", { type: "passGuard", on: false });
    s.update(DT, ctx(0, 400));
    expect(v.passGuardArmed).toBe(false);
    s.stagedCommand("g", { type: "passGuard", on: true });
    s.update(DT, ctx(0, 400));
    s.stagedCommand("g", { type: "reset" });
    s.update(DT, ctx(0, 400));
    expect(v.passGuardArmed).toBe(false);
  });

  it("a SECOND disarm after a second arm still disarms (the guard is not a one-way latch)", () => {
    const s = system();
    const v = s.stage({ ...car("g", 60), playerGuard: false })!;
    for (let k = 0; k < 3; k++) {
      s.stagedCommand("g", { type: "passGuard", on: true });
      s.update(DT, ctx(0, 400));
      expect(v.passGuardArmed, `arm ${k}`).toBe(true);
      s.stagedCommand("g", { type: "passGuard", on: false });
      s.update(DT, ctx(0, 400));
      expect(v.passGuardArmed, `disarm ${k}`).toBe(false);
    }
  });
});
