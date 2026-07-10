// Driveline → physics gating (A1) on the REAL VehicleSim + rapier world —
// the same headless pattern as harness.test.ts. Asserts the operable-car
// floor: a cold-spawned car does not move under full throttle, P/N transmit
// nothing, the stateful parking brake holds against the engine, R is a proper
// reverse (throttle drives backward, brake brakes), a clutch-down manual box
// freewheels — and, critically, that the DEFAULT driveline argument keeps the
// pre-A1 behavior so the CI feel-harness stays meaningful.
//
// Run: npx vitest run src/modules/sim/vehicle

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import { READY_DRIVELINE, type DrivelinePhysicsInput } from "./driveline";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim, type VehicleInput } from "./VehicleSim";

const TEST_TIMEOUT = 30_000;

interface Rig {
  world: World;
  sim: VehicleSim;
}

function makeRig(): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body);
  return { world, sim };
}

function freeRig(rig: Rig): void {
  rig.sim.dispose();
  rig.world.free();
}

function step(rig: Rig, input: VehicleInput, driveline?: DrivelinePhysicsInput): void {
  rig.sim.update(input, T.FIXED_DT, driveline);
  rig.world.step();
}

/** Run `seconds` of fixed steps with constant input/driveline; returns the
 *  peak |speed| observed (km/h). */
function run(
  rig: Rig,
  seconds: number,
  input: Partial<VehicleInput>,
  driveline?: DrivelinePhysicsInput,
): number {
  let peak = 0;
  const full: VehicleInput = { ...IDLE_INPUT, ...input };
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    step(rig, full, driveline);
    peak = Math.max(peak, Math.abs(rig.sim.speedKmh));
  }
  return peak;
}

function settle(rig: Rig, driveline?: DrivelinePhysicsInput): void {
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT, driveline);
}

function posX(rig: Rig): number {
  return rig.sim.debugState().position.x;
}

const d = (over: Partial<DrivelinePhysicsInput>): DrivelinePhysicsInput => ({
  ...READY_DRIVELINE,
  ...over,
});

beforeAll(async () => {
  await RAPIER.init();
});

describe("driveline physics gating (A1)", () => {
  it(
    "cold spawn (engine off, P, parking brake on): full throttle moves nothing",
    () => {
      const rig = makeRig();
      const cold = d({ engineOn: false, selector: "P", parkingBrakeOn: true });
      settle(rig, cold);
      const x0 = posX(rig);
      const peak = run(rig, 4, { throttle: 1 }, cold);
      const moved = Math.abs(posX(rig) - x0);
      freeRig(rig);
      expect(peak).toBeLessThan(0.5); // km/h
      expect(moved).toBeLessThan(0.3); // m
    },
    TEST_TIMEOUT,
  );

  it(
    "engine off in D: no tractive force (coasts nowhere from rest)",
    () => {
      const rig = makeRig();
      const dead = d({ engineOn: false });
      settle(rig, dead);
      const peak = run(rig, 3, { throttle: 1 }, dead);
      freeRig(rig);
      expect(peak).toBeLessThan(0.5);
    },
    TEST_TIMEOUT,
  );

  it(
    "N transmits nothing; shifting to D restores drive",
    () => {
      const rig = makeRig();
      const neutral = d({ selector: "N" });
      settle(rig, neutral);
      const peakN = run(rig, 3, { throttle: 1 }, neutral);
      expect(peakN).toBeLessThan(0.5);
      const peakD = run(rig, 3, { throttle: 1 }, d({}));
      freeRig(rig);
      expect(peakD).toBeGreaterThan(20);
    },
    TEST_TIMEOUT,
  );

  it(
    "parking brake holds against full throttle in D (creeps nowhere)",
    () => {
      const rig = makeRig();
      const held = d({ parkingBrakeOn: true });
      settle(rig, held);
      const x0 = posX(rig);
      const peak = run(rig, 4, { throttle: 1 }, held);
      const moved = Math.abs(posX(rig) - x0);
      // Release it → the same throttle pulls away immediately.
      const peakAfter = run(rig, 3, { throttle: 1 }, d({}));
      freeRig(rig);
      expect(peak).toBeLessThan(5); // km/h — pinned, at most a shudder
      expect(moved).toBeLessThan(3); // m over 4 s of full throttle
      expect(peakAfter).toBeGreaterThan(20);
    },
    TEST_TIMEOUT,
  );

  it(
    "R is a proper reverse: throttle drives backward (capped), brake stops it",
    () => {
      const rig = makeRig();
      const reverse = d({ selector: "R" });
      settle(rig, reverse);
      const x0 = posX(rig);
      let minV = 0;
      for (let i = 0; i < 60 * 8; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 1 }, reverse);
        minV = Math.min(minV, rig.sim.speedKmh);
      }
      const movedBack = posX(rig) - x0; // spawn faces +X → reverse = −X
      expect(movedBack).toBeLessThan(-5);
      expect(-minV).toBeGreaterThan(10); // actually reverses…
      expect(-minV).toBeLessThanOrEqual(T.REVERSE_MAX_KMH + 2); // …capped

      // Brake pedal stops the reverse roll (no arcade re-forward).
      let frames = 0;
      while (Math.abs(rig.sim.speedKmh) > 0.5 && frames < 60 * 6) {
        step(rig, { ...IDLE_INPUT, brake: 1 }, reverse);
        frames++;
      }
      const stopped = Math.abs(rig.sim.speedKmh);
      freeRig(rig);
      expect(stopped).toBeLessThanOrEqual(0.5);
    },
    TEST_TIMEOUT,
  );

  it(
    "manual with the clutch down freewheels (no drive in M1)",
    () => {
      const rig = makeRig();
      const clutched = d({ selector: "M", manualGear: 1, clutchDown: true });
      settle(rig, clutched);
      const peak = run(rig, 3, { throttle: 1 }, clutched);
      // Clutch up → M1 pulls.
      const peakUp = run(rig, 3, { throttle: 1 }, d({ selector: "M", manualGear: 1, clutchDown: false }));
      freeRig(rig);
      expect(peak).toBeLessThan(0.5);
      expect(peakUp).toBeGreaterThan(15);
    },
    TEST_TIMEOUT,
  );

  it(
    "default driveline argument = pre-A1 behavior (throttle pulls, brake-at-standstill reverses)",
    () => {
      const rig = makeRig();
      settle(rig);
      const peak = run(rig, 3, { throttle: 1 }); // no driveline argument
      expect(peak).toBeGreaterThan(20);
      // Brake to a stop, keep holding → the legacy D overload reverses.
      let minV = 0;
      for (let i = 0; i < 60 * 8; i++) {
        step(rig, { ...IDLE_INPUT, brake: 1 });
        minV = Math.min(minV, rig.sim.speedKmh);
      }
      freeRig(rig);
      expect(-minV).toBeGreaterThan(5);
    },
    TEST_TIMEOUT,
  );
});
