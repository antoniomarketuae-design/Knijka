// Surface-patch slice (doc 72 AC-07-full aquaplane float / AC-08 ice band) —
// the RUNTIME grip setter (VehicleSim.setSurfaceGripFactor).
//
// THE LAW OF THIS SLICE: strictly additive. The setter UNUSED (every
// pre-slice caller — the CI harness, all shipped lessons) must be
// BIT-IDENTICAL to today's car; the setter fed the CURRENT value (an
// explicit 1 on a dry car, the lesson base after leaving a patch — exactly
// what VehicleRig does every substep outside a patch) must ALSO be
// bit-identical — proven here by lock-step trajectory comparison across
// identically-built worlds (the wet-grip identity mold), and independently
// by the untouched CI harness baselines (scripts/sim-harness.mjs).
//
// The patch path (0.15 — tuning.AQUAPLANE_PATCH_GRIP_FACTOR /
// ICE_PATCH_GRIP_FACTOR) must be HONEST, and its measurements back the
// tuning-note claims:
//   - full-brake distance from 80 km/h grows toward 1/0.15 (measured ≈ 5.5×
//     — aero drag does some far-end work the tyres no longer can) — inside
//     standing water / on ice braking effectively stops existing;
//   - a full-lock turn at speed yaws < ⅓ of dry — steering stops answering;
//   - LEAVING the patch (set back to the base) restores the base envelope
//     immediately — the doc-72 story that grip RETURNS below the float
//     speed / off the ice is physically real in the live car;
//   - reset() rewinds a diverged factor to the lesson base (attempt
//     restart = surface state restart).
//
// NOTE: recorded scenario traces are KINEMATIC (traces/recorder.ts authored
// envelopes) and never run VehicleSim — the patches change only the LIVE
// car. The aquaplane/ice ghosts AUTHOR the float story (unbraked span
// transit, ICE_DECEL ramps — the dual-channel notes in traces/scAcAquaplane
// .ts and traces/scAcIce.ts). The district-side seam (span → rect → per-
// substep factor, incl. the water speed gate) is covered by
// runtime/__tests__/surface-patches.test.ts.

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

/** Accelerate the rig to at least `kmh` (fails the test if unreachable). */
function cruiseTo(rig: Rig, kmh: number): void {
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
  for (let i = 0; i < 60 * 40 && rig.sim.speedKmh < kmh; i++) {
    step(rig, { ...IDLE_INPUT, throttle: 1 });
  }
  expect(rig.sim.speedKmh).toBeGreaterThanOrEqual(kmh);
}

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// 1. Bit-identity — the design law of the slice (the wet-grip mold)
// ---------------------------------------------------------------------------

describe("surface grip setter — unused / no-op paths are bit-identical", () => {
  it(
    "legacy rig, setter-never-called rig, and set-to-current-value rigs produce IDENTICAL trajectories",
    () => {
      // Identically-built worlds; rapier is deterministic, so any divergence
      // can only come from the setter code path.
      const legacy = makeRig(); // options OMITTED, setter never called
      const noop = makeRig({ gripFactor: 1 }); // setter called with 1 EVERY step
      const wetControl = makeRig({ gripFactor: T.WET_GRIP_FACTOR }); // setter never called
      const wetNoop = makeRig({ gripFactor: T.WET_GRIP_FACTOR }); // setter fed the base EVERY step

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
          // The VehicleRig steady state outside a patch: the setter is fed
          // MIN(base, 1) = the CURRENT factor, every single substep.
          noop.sim.setSurfaceGripFactor(1);
          wetNoop.sim.setSurfaceGripFactor(T.WET_GRIP_FACTOR);
          step(legacy, phase.input);
          step(noop, phase.input);
          step(wetControl, phase.input);
          step(wetNoop, phase.input);
          const a = legacy.sim.debugState();
          const b = noop.sim.debugState();
          // EXACT equality — bit-identity, not toBeCloseTo. Any epsilon here
          // would hide a real divergence compounding over minutes of play.
          expect(b.position, `step ${i} position (noop-1)`).toEqual(a.position);
          expect(b.rotation, `step ${i} rotation (noop-1)`).toEqual(a.rotation);
          expect(b.steerRad, `step ${i} steer (noop-1)`).toBe(a.steerRad);
          const c = wetControl.sim.debugState();
          const d = wetNoop.sim.debugState();
          expect(d.position, `step ${i} position (noop-wet)`).toEqual(c.position);
          expect(d.rotation, `step ${i} rotation (noop-wet)`).toEqual(c.rotation);
          expect(d.steerRad, `step ${i} steer (noop-wet)`).toBe(c.steerRad);
        }
      }
      expect(Math.abs(legacy.sim.speedKmh)).toBeGreaterThanOrEqual(0); // rigs alive
      freeRig(legacy);
      freeRig(noop);
      freeRig(wetControl);
      freeRig(wetNoop);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2. The patch bite — braking effectively stops existing at 0.15
// ---------------------------------------------------------------------------

/** Full-brake stopping distance from `kmh` with `patchGrip` applied at the
 *  moment the brake goes down (null = setter never touched). */
function brakeDistanceFrom(kmh: number, patchGrip: number | null): number {
  const rig = makeRig();
  cruiseTo(rig, kmh);
  if (patchGrip !== null) rig.sim.setSurfaceGripFactor(patchGrip);
  const x0 = rig.sim.debugState().position.x;
  let frames = 0;
  while (rig.sim.speedKmh > 2 && frames < 60 * 60) {
    step(rig, { ...IDLE_INPUT, brake: 1 });
    frames++;
  }
  const dist = rig.sim.debugState().position.x - x0;
  freeRig(rig);
  return dist;
}

describe("surface grip setter — the measured patch bite", () => {
  it(
    "full brake from 80 km/h at patch grip 0.15: distance grows ~1/0.15 (the tuning-note measurement)",
    () => {
      const dry = brakeDistanceFrom(80, null);
      const patch = brakeDistanceFrom(80, T.AQUAPLANE_PATCH_GRIP_FACTOR);
      // Dry sanity: ~0.9 g from 80 ≈ 28–30 m (the harness envelope scaled).
      expect(dry).toBeGreaterThan(22);
      expect(dry).toBeLessThan(38);
      // The patch law: braking is tyre-limited, so distance ≈ × 1/0.15. The
      // band is generous (rolling resistance and aero help a little at the
      // long end) but pins the order of magnitude the lesson teaches:
      // measured ≈ 5.5× (≈ 144 m vs ≈ 26 m).
      const ratio = patch / dry;
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeLessThanOrEqual(8.5);
    },
    TEST_TIMEOUT,
  );

  it(
    "full steer at speed on 0.15: the car yaws < 1/3 of dry — steering stops answering",
    () => {
      const yawOf = (patchGrip: number | null): number => {
        const rig = makeRig();
        cruiseTo(rig, 70);
        if (patchGrip !== null) rig.sim.setSurfaceGripFactor(patchGrip);
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
      };
      const dry = yawOf(null);
      const patch = yawOf(T.ICE_PATCH_GRIP_FACTOR);
      expect(dry).toBeGreaterThan(0.5); // the dry car genuinely turns
      expect(patch).toBeLessThan(dry / 3); // the floating/icy car barely does
      expect(patch).toBeGreaterThan(0.005); // …but not a teleporting brick
    },
    TEST_TIMEOUT,
  );

  it(
    "LEAVING the patch restores the base envelope: the post-restore stop is dry-sharp again",
    () => {
      // Brake from ~80 with the patch grip for 1.5 s (the float: barely any
      // speed comes off), then restore base 1 (the rig's exit behavior) and
      // keep braking. The decel measured in the two windows must differ by
      // the grip ratio's order — proof the setter is fully reversible.
      const rig = makeRig();
      cruiseTo(rig, 80);
      rig.sim.setSurfaceGripFactor(T.AQUAPLANE_PATCH_GRIP_FACTOR);
      const vPatch0 = rig.sim.speedKmh;
      for (let i = 0; i < 90; i++) step(rig, { ...IDLE_INPUT, brake: 1 });
      const vPatch1 = rig.sim.speedKmh;
      const patchDecel = ((vPatch0 - vPatch1) / 3.6) / 1.5; // m/s² over the window
      rig.sim.setSurfaceGripFactor(1); // leaving the span (base grip 1)
      expect(rig.sim.surfaceGripFactor).toBe(1);
      const vDry0 = rig.sim.speedKmh;
      for (let i = 0; i < 60 && rig.sim.speedKmh > 5; i++) {
        step(rig, { ...IDLE_INPUT, brake: 1 });
      }
      const vDry1 = rig.sim.speedKmh;
      const dryDecel = ((vDry0 - vDry1) / 3.6) / 1; // m/s² over ≤ 1 s
      // In the patch the car sheds almost nothing (~1.3 m/s²); restored, the
      // full ~8+ m/s² service brake is back instantly.
      expect(patchDecel).toBeLessThan(2.5);
      expect(dryDecel).toBeGreaterThan(patchDecel * 3);
      freeRig(rig);
    },
    TEST_TIMEOUT,
  );

  it("reset() rewinds a diverged factor to the lesson base (attempt restart)", () => {
    const wet = makeRig({ gripFactor: T.WET_GRIP_FACTOR });
    expect(wet.sim.surfaceGripFactor).toBe(T.WET_GRIP_FACTOR);
    wet.sim.setSurfaceGripFactor(T.AQUAPLANE_PATCH_GRIP_FACTOR);
    expect(wet.sim.surfaceGripFactor).toBe(T.AQUAPLANE_PATCH_GRIP_FACTOR);
    wet.sim.reset();
    expect(wet.sim.surfaceGripFactor).toBe(T.WET_GRIP_FACTOR);
    freeRig(wet);
  });

  it("the setter clamps to its documented [0.05, 1] band", () => {
    const rig = makeRig();
    rig.sim.setSurfaceGripFactor(0.0001);
    expect(rig.sim.surfaceGripFactor).toBe(0.05);
    rig.sim.setSurfaceGripFactor(7);
    expect(rig.sim.surfaceGripFactor).toBe(1);
    freeRig(rig);
  });
});
