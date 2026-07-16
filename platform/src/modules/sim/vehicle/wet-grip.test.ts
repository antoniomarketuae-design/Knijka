// Wet-grip slice (ADR-006 stage 4a) — the OPT-IN surface-grip factor.
//
// THE LAW OF THIS SLICE: strictly additive and opt-in. The default path
// (options omitted, empty, or gripFactor 1) must be BIT-IDENTICAL to the
// pre-4a car — proven here by lock-step trajectory comparison across three
// identically-built worlds, and independently by the untouched CI harness
// baselines (scripts/sim-harness.mjs).
//
// The wet path (gripFactor = WET_GRIP_FACTOR = 0.7) must be HONEST:
//   - braking distance from 50 km/h grows by ~1/0.7 ≈ 1.4× (doc 72 FO-04
//     „braking distance ~1.5× wet"; wet asphalt holds ~0.65–0.75 of dry μ),
//   - lateral grip drops: the same full-steer maneuver at speed turns the
//     car measurably LESS (frictionSlip clamps the side impulse).
//
// NOTE: recorded scenario traces are KINEMATIC (traces/recorder.ts authored
// envelopes) and never run VehicleSim — this factor changes only the LIVE
// car. Wet demo ghosts are authored consistent with it (SCRIPT_DECEL ×
// WET_GRIP_FACTOR in traces/scAcWetBraking.ts).

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import { rotateInto, type Vec3 } from "./math";
import {
  createHeadlessChassis,
  IDLE_INPUT,
  VehicleSim,
  type VehicleInput,
  type VehicleSimOptions,
} from "./VehicleSim";

const TEST_TIMEOUT = 30_000;

interface Rig {
  world: World;
  sim: VehicleSim;
}

function makeRig(options?: VehicleSimOptions): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  // `options === undefined` exercises the OMITTED-argument path (today's
  // callers); an explicit object exercises the new one.
  const sim =
    options === undefined
      ? new VehicleSim(world, body)
      : new VehicleSim(world, body, T.SPAWN, options);
  return { world, sim };
}

function freeRig(rig: Rig): void {
  rig.sim.dispose();
  rig.world.free();
}

function step(rig: Rig, input: VehicleInput): void {
  rig.sim.update(input, T.FIXED_DT);
  rig.world.step();
}

/** Heading (rad) of the car's forward axis projected on the ground plane. */
function headingRad(rig: Rig): number {
  const fwd: Vec3 = { x: 0, y: 0, z: 0 };
  rotateInto(rig.sim.debugState().rotation, 0, 0, 1, fwd);
  return Math.atan2(fwd.x, fwd.z);
}

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// 1. Default bit-identity — the design law of the slice
// ---------------------------------------------------------------------------

describe("wet grip (4a) — default path bit-identity", () => {
  it(
    "omitted options, {} and { gripFactor: 1 } produce IDENTICAL state trajectories",
    () => {
      // Three identically-built worlds; rapier is deterministic, so any
      // divergence can only come from the gripFactor code path.
      const legacy = makeRig(); // options argument OMITTED (today's callers)
      const empty = makeRig({}); // new argument, no fields
      const one = makeRig({ gripFactor: 1 }); // explicit dry

      // A scripted sequence that exercises EVERY grip-scaled term: throttle,
      // full service brake, combined steer+throttle, handbrake, coast.
      const script: Array<{ steps: number; input: VehicleInput }> = [
        { steps: 60, input: { ...IDLE_INPUT } }, // settle
        { steps: 240, input: { ...IDLE_INPUT, throttle: 1 } }, // accelerate
        { steps: 90, input: { ...IDLE_INPUT, brake: 1 } }, // full brake
        { steps: 120, input: { ...IDLE_INPUT, throttle: 0.6, steer: 0.5 } }, // corner
        { steps: 60, input: { ...IDLE_INPUT, throttle: 0.3, handbrake: true } }, // handbrake
        { steps: 60, input: { ...IDLE_INPUT } }, // coast
      ];

      let i = 0;
      for (const phase of script) {
        for (let k = 0; k < phase.steps; k++, i++) {
          step(legacy, phase.input);
          step(empty, phase.input);
          step(one, phase.input);
          const a = legacy.sim.debugState();
          const b = empty.sim.debugState();
          const c = one.sim.debugState();
          // EXACT equality — bit-identity, not toBeCloseTo. Any epsilon here
          // would hide a real divergence compounding over minutes of play.
          for (const [other, label] of [
            [b, "{}"],
            [c, "{gripFactor:1}"],
          ] as const) {
            expect(other.position, `step ${i} position (${label})`).toEqual(a.position);
            expect(other.rotation, `step ${i} rotation (${label})`).toEqual(a.rotation);
            expect(other.steerRad, `step ${i} steer (${label})`).toBe(a.steerRad);
          }
        }
      }
      expect(Math.abs(legacy.sim.speedKmh)).toBeGreaterThanOrEqual(0); // rigs alive
      freeRig(legacy);
      freeRig(empty);
      freeRig(one);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2. Wet braking distance — the ~1.4× law (doc 72 / AC wet braking)
// ---------------------------------------------------------------------------

/** Full-brake stopping distance from `kmh`, metres along the travel axis. */
function brakeDistanceFrom(kmh: number, options?: VehicleSimOptions): number {
  const rig = makeRig(options);
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
  for (let i = 0; i < 60 * 30 && rig.sim.speedKmh < kmh; i++) {
    step(rig, { ...IDLE_INPUT, throttle: 1 });
  }
  expect(rig.sim.speedKmh).toBeGreaterThanOrEqual(kmh);
  const x0 = rig.sim.debugState().position.x;
  let frames = 0;
  while (rig.sim.speedKmh > 2 && frames < 60 * 20) {
    step(rig, { ...IDLE_INPUT, brake: 1 });
    frames++;
  }
  const dist = rig.sim.debugState().position.x - x0;
  freeRig(rig);
  return dist;
}

describe("wet grip (4a) — braking distance", () => {
  it(
    "same full-brake input from 50 km/h: the wet car stops ~1.4× longer",
    () => {
      const dry = brakeDistanceFrom(50);
      const wet = brakeDistanceFrom(50, { gripFactor: T.WET_GRIP_FACTOR });
      // Dry sanity: ~0.9 g from 50 km/h ≈ 11 m (the harness pins 30–38 m
      // from 90; same envelope scaled by v²).
      expect(dry).toBeGreaterThan(8);
      expect(dry).toBeLessThan(15);
      // The wet law: distance × ~1/0.7. Band allows the speed-sensitive
      // overshoot of reaching exactly 50 km/h before the stop.
      const ratio = wet / dry;
      expect(wet).toBeGreaterThan(dry);
      expect(ratio).toBeGreaterThanOrEqual(1.3);
      expect(ratio).toBeLessThanOrEqual(1.6);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. Wet lateral grip — the same steer input turns the car less
// ---------------------------------------------------------------------------

/** Total heading change (rad) over a sustained full-lock turn at speed. */
function sustainedTurnYaw(options?: VehicleSimOptions): number {
  const rig = makeRig(options);
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
  for (let i = 0; i < 60 * 30 && rig.sim.speedKmh < 60; i++) {
    step(rig, { ...IDLE_INPUT, throttle: 1 });
  }
  expect(rig.sim.speedKmh).toBeGreaterThanOrEqual(60);
  let prev = headingRad(rig);
  let total = 0;
  for (let i = 0; i < 60 * 3; i++) {
    step(rig, { ...IDLE_INPUT, throttle: 0.3, steer: 1 });
    const h = headingRad(rig);
    let d = h - prev;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = h;
  }
  freeRig(rig);
  return Math.abs(total);
}

describe("wet grip (4a) — lateral grip", () => {
  it(
    "full steer at 60 km/h: the wet car yaws measurably less (understeers wide)",
    () => {
      const dry = sustainedTurnYaw();
      const wet = sustainedTurnYaw({ gripFactor: T.WET_GRIP_FACTOR });
      // At 60 km/h full lock saturates the tyres in BOTH conditions (lateral
      // demand ≫ μg), so achieved yaw tracks the grip cap: wet ≈ 0.7 × dry.
      expect(dry).toBeGreaterThan(0.5); // the dry car genuinely turns
      expect(wet).toBeLessThan(dry * 0.85);
      expect(wet).toBeGreaterThan(dry * 0.45); // reduced, not absent — still a car
    },
    TEST_TIMEOUT,
  );
});
