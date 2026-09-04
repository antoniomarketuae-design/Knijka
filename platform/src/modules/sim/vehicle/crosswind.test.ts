// Crosswind slice (doc 72 AC-12) — the OPT-IN lateral-wind channel, on the
// wet-grip (4a) pattern.
//
// THE LAW OF THIS SLICE: strictly additive and opt-in. The default path
// (options omitted, empty, windLateralN 0, or a guarded-inert gust) must be
// BIT-IDENTICAL to the calm car — proven here by lock-step trajectory
// comparison across identically-built worlds (the wet-grip identity mold),
// and independently by the untouched CI harness baselines
// (scripts/sim-harness.mjs).
//
// The wind path (windLateralN = CROSSWIND_BRIDGE_N) must be HONEST:
//   - a hands-fixed cruise drifts measurably downwind (the AC-12 shove) —
//     the tuning constant documents the same bands asserted here;
//   - a small steady counter-steer out-pulls the wind (controllable — the
//     taught duty genuinely works);
//   - the gust envelope is a PURE SINE: deterministic (no RNG), rewound by
//     reset(), and smaller than the base term so the wind never flips
//     direction mid-lesson.
//
// NOTE: recorded scenario traces are KINEMATIC (traces/recorder.ts authored
// envelopes) and never run VehicleSim — wind changes only the LIVE car. The
// crosswind demo ghosts AUTHOR the drift-and-correct story in their
// polylines (traces/scAcCrosswind.ts — the dual-channel honesty note).

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import {
  createHeadlessChassis,
  IDLE_INPUT,
  VehicleSim,
  type VehicleInput,
  type VehicleSimOptions,
} from "./VehicleSim";

const TEST_TIMEOUT = 30_000;

/** North-facing spawn (forward = world +Z), so the world +X wind axis is a
 *  pure CROSSWIND from the car's right. Applied via sim.reset() — the
 *  headless chassis is created at T.SPAWN; the custom spawn pose lives in
 *  the sim and a reset teleports onto it. */
const NORTH_SPAWN = { x: 0, y: 0.8, z: 0, yawRad: 0 };

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

/** A rig facing NORTH with the given options (crosswind measurement frame). */
function makeNorthRig(options?: VehicleSimOptions): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body, NORTH_SPAWN, options ?? {});
  sim.reset();
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

/** Cruise the north rig to `kmh`, then run `sec` seconds of hands-fixed
 *  driving at a holding throttle. Returns lateral (world X) displacement
 *  measured from the moment the target speed was reached. */
function handsFixedDrift(rig: Rig, kmh: number, holdThrottle: number, sec: number): number {
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
  for (let i = 0; i < 60 * 30 && rig.sim.speedKmh < kmh; i++) {
    step(rig, { ...IDLE_INPUT, throttle: 1 });
  }
  expect(rig.sim.speedKmh).toBeGreaterThanOrEqual(kmh);
  const x0 = rig.sim.debugState().position.x;
  for (let i = 0; i < Math.round(60 * sec); i++) {
    step(rig, { ...IDLE_INPUT, throttle: holdThrottle });
  }
  return rig.sim.debugState().position.x - x0;
}

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// 1. Default bit-identity — the design law of the slice (the wet-grip mold)
// ---------------------------------------------------------------------------

describe("crosswind (AC-12) — default path bit-identity", () => {
  it(
    "omitted options, {}, { windLateralN: 0 } and a period-0 gust produce IDENTICAL trajectories",
    () => {
      // Identically-built worlds; rapier is deterministic, so any divergence
      // can only come from the wind code path.
      const legacy = makeRig(); // options argument OMITTED (today's callers)
      const empty = makeRig({}); // new argument, no fields
      const zero = makeRig({ windLateralN: 0 }); // explicit calm
      // periodSec 0 is the guarded-inert gust: the constructor must disarm it.
      const inertGust = makeRig({ windGust: { periodSec: 0, amplitudeN: 500 } });

      // A scripted sequence that exercises every dynamic regime: throttle,
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
          step(zero, phase.input);
          step(inertGust, phase.input);
          const a = legacy.sim.debugState();
          for (const [rig, label] of [
            [empty, "{}"],
            [zero, "{windLateralN:0}"],
            [inertGust, "{windGust period 0}"],
          ] as const) {
            const b = rig.sim.debugState();
            // EXACT equality — bit-identity, not toBeCloseTo. Any epsilon here
            // would hide a real divergence compounding over minutes of play.
            expect(b.position, `step ${i} position (${label})`).toEqual(a.position);
            expect(b.rotation, `step ${i} rotation (${label})`).toEqual(a.rotation);
            expect(b.steerRad, `step ${i} steer (${label})`).toBe(a.steerRad);
          }
        }
      }
      expect(Math.abs(legacy.sim.speedKmh)).toBeGreaterThanOrEqual(0); // rigs alive
      freeRig(legacy);
      freeRig(empty);
      freeRig(zero);
      freeRig(inertGust);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2. The measured push — the tuned constant genuinely shoves the car
// ---------------------------------------------------------------------------

describe("crosswind (AC-12) — the measured push at CROSSWIND_BRIDGE_N", () => {
  it(
    "hands-fixed at ~70+ km/h: the wind drifts the car downwind ~1 m in 5 s; calm drifts zero",
    () => {
      const calm = makeNorthRig();
      const windy = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
      const calmDrift = handsFixedDrift(calm, 70, 0.36, 5);
      const windDrift = handsFixedDrift(windy, 70, 0.36, 5);
      // The calm car tracks dead straight (the drift is the WIND, not noise).
      expect(Math.abs(calmDrift)).toBeLessThan(0.02);
      // The tuning-documented band: ≈1.0 m measured; the band tolerates
      // future re-tunes of unrelated constants without hiding a dead channel.
      expect(windDrift).toBeGreaterThan(0.5);
      expect(windDrift).toBeLessThan(2.0);
      freeRig(calm);
      freeRig(windy);
    },
    TEST_TIMEOUT,
  );

  it(
    "the drift COMPOUNDS uncorrected (heading blows downwind): 10 s ≫ 2 × the 5 s drift",
    () => {
      const a = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
      const b = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
      const d5 = handsFixedDrift(a, 70, 0.36, 5);
      const d10 = handsFixedDrift(b, 70, 0.36, 10);
      expect(d10).toBeGreaterThan(d5 * 2.2); // super-linear — the AC-12 story
      expect(d10).toBeGreaterThan(2.0); // ≈2.7 m measured — half-lane territory
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "controllable: a small steady counter-steer out-pulls the wind (the taught duty works)",
    () => {
      const rig = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
      for (let i = 0; i < 60 * 30 && rig.sim.speedKmh < 70; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 1 });
      }
      const x0 = rig.sim.debugState().position.x;
      // 5% of input against a wind blowing +X: the car must move UPWIND —
      // steering authority dwarfs the shove (grip ceiling ≈ 13 m/s² vs 1).
      for (let i = 0; i < 60 * 4; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 0.36, steer: -0.05 });
      }
      expect(rig.sim.debugState().position.x - x0).toBeLessThan(-2);
      freeRig(rig);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. The gust envelope — deterministic, rewindable, direction-preserving
// ---------------------------------------------------------------------------

describe("crosswind (AC-12) — gust determinism", () => {
  const GUSTY: VehicleSimOptions = {
    windLateralN: T.CROSSWIND_BRIDGE_N,
    windGust: { periodSec: T.CROSSWIND_GUST_PERIOD_SEC, amplitudeN: T.CROSSWIND_GUST_AMPLITUDE_N },
  };

  it("the gust never flips the wind direction (amplitude < base — a tuning invariant)", () => {
    expect(T.CROSSWIND_GUST_AMPLITUDE_N).toBeGreaterThan(0);
    expect(T.CROSSWIND_GUST_AMPLITUDE_N).toBeLessThan(T.CROSSWIND_BRIDGE_N);
    expect(T.CROSSWIND_GUST_PERIOD_SEC).toBeGreaterThan(0);
  });

  it(
    "two identically-driven gusty rigs stay EXACTLY equal (pure sine, no RNG)",
    () => {
      const a = makeNorthRig(GUSTY);
      const b = makeNorthRig(GUSTY);
      for (let i = 0; i < 60 * 8; i++) {
        const input = { ...IDLE_INPUT, throttle: 0.6 };
        step(a, input);
        step(b, input);
        const pa = a.sim.debugState().position;
        const pb = b.sim.debugState().position;
        expect(pb).toEqual(pa);
      }
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "reset() rewinds the gust clock: a post-reset drive matches a fresh rig's drive",
    () => {
      // Rig A drives 2 s INTO the gust cycle (clock advanced 144° of the 5 s
      // period), resets, then drives the scripted 5 s. Rig B drives the same
      // 5 s from a fresh world. If reset() rewound the clock, both saw the
      // same wind story and land together; a surviving 2 s phase error would
      // displace A by decimeters. Tolerance is millimetric, NOT exact: rapier
      // keeps controller warm-start caches across reset() (measured ~2.5e-5 m
      // — solver noise, far below any gust-phase signal), so bit-exact replay
      // is a fresh-world property (the determinism test above), not reset()'s.
      const a = makeNorthRig(GUSTY);
      const b = makeNorthRig(GUSTY);
      for (let i = 0; i < 60 * 2; i++) step(a, { ...IDLE_INPUT, throttle: 0.6 });
      a.sim.reset();
      for (let i = 0; i < 60 * 5; i++) {
        const input = { ...IDLE_INPUT, throttle: 0.6 };
        step(a, input);
        step(b, input);
      }
      const pa = a.sim.debugState().position;
      const pb = b.sim.debugState().position;
      expect(Math.abs(pa.x - pb.x)).toBeLessThan(0.005);
      expect(Math.abs(pa.z - pb.z)).toBeLessThan(0.005);
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 4. THE COCKPIT READ CHANNEL — sc-ac-crosswind:a9db1738, „nothing in the
//    cockpit reports a lateral disturbance".
//
//    The camera's head-lean input was the kinematic bicycle estimate ALONE
//    (a = v²·tan(steer)/L), which is a function of the driver's own steering,
//    so a crosswind moved the student's head by exactly zero on the one lesson
//    built around it. `windLatAccelMs2` is the newtons the chassis is being
//    pushed with, in the frame the driver sits in; `cockpitLatAccelMs2` sums
//    the two and `CameraRig` reads the sum.
//
//    F1's law applies: this is a PURE READ. No force, no impulse, no clock —
//    polling it must leave the trajectory bit-identical, which is asserted
//    below rather than asserted in prose.
// ---------------------------------------------------------------------------

describe("crosswind (AC-12) — the cockpit lateral read channel", () => {
  it("is exactly 0 on the calm car — every non-wind cockpit is unchanged", () => {
    const calm = makeNorthRig();
    for (let i = 0; i < 60; i++) step(calm, { ...IDLE_INPUT, throttle: 0.5 });
    expect(calm.sim.windLatAccelMs2).toBe(0);
    freeRig(calm);
  });

  it("is the shipped force over the shipped mass, toward the car's left", () => {
    // NORTH_SPAWN faces world +Z, so the car's left axis IS world +X and the
    // whole of a +X wind is lateral: a = F / m, positive (pushed left).
    const rig = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    for (let i = 0; i < 30; i++) step(rig, IDLE_INPUT);
    const expected = T.CROSSWIND_BRIDGE_N / T.CHASSIS_MASS;
    expect(rig.sim.windLatAccelMs2).toBeGreaterThan(expected * 0.9);
    expect(rig.sim.windLatAccelMs2).toBeLessThan(expected * 1.1);
    // …and it is a real fraction of gravity, not a rounding artefact: the
    // magnitude the student's head is leaned by (≈0.10 g).
    expect(Math.abs(rig.sim.windLatAccelMs2) / 9.81).toBeGreaterThan(0.05);
    freeRig(rig);
  });

  it("carries the SIGN of the wind — a westerly leans the head the other way", () => {
    const east = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    const west = makeNorthRig({ windLateralN: -T.CROSSWIND_BRIDGE_N });
    for (let i = 0; i < 30; i++) {
      step(east, IDLE_INPUT);
      step(west, IDLE_INPUT);
    }
    expect(east.sim.windLatAccelMs2).toBeGreaterThan(0);
    expect(west.sim.windLatAccelMs2).toBeLessThan(0);
    freeRig(east);
    freeRig(west);
  });

  it("BREATHES on the gust — the easing step 6 tells the student to read", () => {
    // The whole point of the channel for THIS lesson: the lean must swell and
    // ease with the gust, because the ease is the cue to release the
    // correction (briefing step 6) and its absence is the „втора корекция"
    // step 7 warns about. Sampled over one full period.
    const rig = makeNorthRig({
      windLateralN: T.CROSSWIND_BRIDGE_N,
      windGust: {
        periodSec: T.CROSSWIND_GUST_PERIOD_SEC,
        amplitudeN: T.CROSSWIND_GUST_AMPLITUDE_N,
      },
    });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < Math.round(60 * T.CROSSWIND_GUST_PERIOD_SEC); i++) {
      step(rig, IDLE_INPUT);
      const a = rig.sim.windLatAccelMs2;
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    // Peak-to-trough is the gust envelope over the mass, within sampling.
    const swing = (2 * T.CROSSWIND_GUST_AMPLITUDE_N) / T.CHASSIS_MASS;
    expect(hi - lo).toBeGreaterThan(swing * 0.9);
    // …and it never flips direction mid-lesson (the amplitude < base law).
    expect(lo).toBeGreaterThan(0);
    freeRig(rig);
  });

  it("MUTATION — polling it every step leaves the trajectory bit-identical", () => {
    // F1's proof shape: a read channel that moved the car would be a physics
    // change smuggled in as an instrument.
    const polled = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    const quiet = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    for (let i = 0; i < 60 * 3; i++) {
      const input = { ...IDLE_INPUT, throttle: 0.5 };
      step(polled, input);
      void polled.sim.windLatAccelMs2;
      void polled.sim.windLatAccelMs2;
      step(quiet, input);
      expect(polled.sim.debugState().position).toEqual(quiet.sim.debugState().position);
      expect(polled.sim.debugState().rotation).toEqual(quiet.sim.debugState().rotation);
    }
    freeRig(polled);
    freeRig(quiet);
  }, TEST_TIMEOUT);
});
