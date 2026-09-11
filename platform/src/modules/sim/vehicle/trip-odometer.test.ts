// THE TRIP ODOMETER — sc-pk-stop-vs-park:e788ce46, „the cluster has no
// tachometer, no fuel gauge and no odometer".
//
// WHY THE INTEGRATOR LIVES ON VehicleSim AND IS PINNED HERE. The obvious place
// for a trip meter is the render loop that draws it, and that placement is
// wrong in a way no unit test of the cluster could catch: `LessonScene.resetCar`
// (bound to R, and to the touch dock's reset) calls `VehicleSim.reset()` and
// does NOT remount the cockpit, so a render-loop accumulator would hand the next
// attempt the previous attempt's metres. An odometer that counts a drive the
// student did not make is worse than no odometer, because it cannot be told
// apart from one that works. So the rewind is tested where the rewind is.
//
// AND IT MUST NOT MOVE THE CAR. The field is display-only: nothing in `update()`
// reads it. That is asserted as a trajectory identity rather than by reading the
// diff, because "no consumer" is exactly the claim that decays — the CI harness
// baselines (scripts/sim-harness.mjs) rest on this car stepping bit-identically.

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
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
  return { world, sim: new VehicleSim(world, createHeadlessChassis(RAPIER, world)) };
}

function freeRig(rig: Rig): void {
  rig.sim.dispose();
  rig.world.free();
}

function step(rig: Rig, input: VehicleInput): void {
  rig.sim.update(input, T.FIXED_DT);
  rig.world.step();
}

function drive(rig: Rig, steps: number, input: VehicleInput = { ...IDLE_INPUT, throttle: 1 }): void {
  for (let i = 0; i < steps; i++) step(rig, input);
}

/** Ground-plane distance from spawn — the yardstick the odometer is judged on. */
function displacementM(rig: Rig): number {
  const p = rig.sim.debugState().position;
  return Math.hypot(p.x - T.SPAWN.x, p.z - T.SPAWN.z);
}

beforeAll(async () => {
  await RAPIER.init();
});

describe("VehicleSim.tripDistanceM", () => {
  it(
    "starts at zero and grows with the ground the car actually covers",
    () => {
      const rig = makeRig();
      try {
        expect(rig.sim.tripDistanceM).toBe(0);
        // A settling second on idle: suspension bounce is not travel.
        drive(rig, 60, IDLE_INPUT);
        expect(rig.sim.tripDistanceM).toBeLessThan(0.5);

        drive(rig, 60 * 6);
        const trip = rig.sim.tripDistanceM;
        expect(trip).toBeGreaterThan(5);
        // The car drives straight here, so the integral of |speed| and the
        // straight-line displacement are the same quantity to within the
        // suspension's own wander. This is what makes the readout a DISTANCE
        // rather than a number that merely rises.
        expect(trip).toBeGreaterThanOrEqual(displacementM(rig) - 0.5);
        expect(trip / displacementM(rig)).toBeLessThan(1.1);
      } finally {
        freeRig(rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "reset() rewinds it — a retry starts at 0 m",
    () => {
      const rig = makeRig();
      try {
        drive(rig, 60 * 6);
        expect(rig.sim.tripDistanceM).toBeGreaterThan(5);
        rig.sim.reset();
        expect(rig.sim.tripDistanceM).toBe(0);
        // …and it counts again afterwards, rather than latching at zero.
        drive(rig, 60 * 4);
        expect(rig.sim.tripDistanceM).toBeGreaterThan(1);
      } finally {
        freeRig(rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "counts metres driven BACKWARDS too — it is a trip meter, not a displacement",
    () => {
      // The bay drills reverse for their whole length. A meter that subtracted
      // would answer „how far have I gone" with a shrinking number on exactly
      // the manoeuvre where the metres matter most.
      const rig = makeRig();
      try {
        drive(rig, 60, IDLE_INPUT);
        const settled = rig.sim.tripDistanceM;
        // The legacy machine (no driveline argument) reverses on a held brake
        // at a standstill — the arcade contract `update()`'s docblock names.
        drive(rig, 60 * 5, { ...IDLE_INPUT, brake: 1 });
        expect(rig.sim.speedKmh).toBeLessThan(0);
        expect(rig.sim.tripDistanceM).toBeGreaterThan(settled + 1);
      } finally {
        freeRig(rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "is display-only: two identically built cars step identically with it read or not",
    () => {
      const a = makeRig();
      const b = makeRig();
      try {
        for (let i = 0; i < 60 * 5; i++) {
          step(a, { ...IDLE_INPUT, throttle: 1, steer: 0.3 });
          step(b, { ...IDLE_INPUT, throttle: 1, steer: 0.3 });
          // Reading the odometer on one rig and not the other may not perturb it.
          void a.sim.tripDistanceM;
        }
        const pa = a.sim.debugState().position;
        const pb = b.sim.debugState().position;
        expect(pa.x).toBe(pb.x);
        expect(pa.y).toBe(pb.y);
        expect(pa.z).toBe(pb.z);
        expect(a.sim.speedKmh).toBe(b.sim.speedKmh);
      } finally {
        freeRig(a);
        freeRig(b);
      }
    },
    TEST_TIMEOUT,
  );
});
