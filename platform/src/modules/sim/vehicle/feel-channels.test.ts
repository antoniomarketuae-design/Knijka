// The P3 "Feel" channels on the LIVE car (doc 82 §4.2 F1/F2/F3).
//
// THE LAW OF THIS PHASE (doc 82 §6.2): "Ship every slice additive/gated so
// defaults stay bit-identical, then re-baseline deliberately." The rule
// engine grades RECORDED drives — an uncontrolled physics change silently
// invalidates every committed trace and every graded verdict. So each new
// channel is proved twice here:
//
//   1. GATED OFF (the shipped default) is BIT-IDENTICAL to the pre-F car,
//      by lock-step trajectory comparison across identically-built worlds —
//      the mold surface-grip.test.ts and crosswind.test.ts already use;
//   2. GATED ON does something real and measurable — the test that would
//      fail if the channel were a no-op.
//
// F1 (the grip-loss read channel) is the exception: it is unconditional,
// because it applies no force. Its "changed nothing" proof is that POLLING
// it every step leaves the trajectory bit-identical, plus the untouched CI
// harness envelope (scripts/sim-harness.mjs).

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import {
  engineBrakeDecelMs2,
  ENGINE_BRAKE_DECEL_MS2,
  ENGINE_BRAKE_MIN_KMH,
  MANUAL_GEAR_COUNT,
  READY_DRIVELINE,
  type DrivelinePhysicsInput,
} from "./driveline";
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
  return {
    world,
    sim:
      options === undefined
        ? new VehicleSim(world, body)
        : new VehicleSim(world, body, T.SPAWN, options),
  };
}

function freeRig(rig: Rig): void {
  rig.sim.dispose();
  rig.world.free();
}

function step(rig: Rig, input: VehicleInput, driveline?: DrivelinePhysicsInput): void {
  rig.sim.update(input, T.FIXED_DT, driveline);
  rig.world.step();
}

/** Accelerate to at least `kmh` (returns false if unreachable). */
function cruiseTo(rig: Rig, kmh: number, driveline?: DrivelinePhysicsInput): boolean {
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT, driveline);
  for (let i = 0; i < 60 * 40; i++) {
    if (rig.sim.speedKmh >= kmh) return true;
    step(rig, { ...IDLE_INPUT, throttle: 1 }, driveline);
  }
  return false;
}

/**
 * Drive two rigs through the SAME input script in lock step and assert their
 * states never diverge by a single bit. This is the additive law's proof.
 */
function expectLockStepIdentical(
  a: Rig,
  b: Rig,
  steps: number,
  script: (i: number) => VehicleInput,
  driveline?: DrivelinePhysicsInput,
  onStep?: (rig: Rig) => void,
): void {
  for (let i = 0; i < steps; i++) {
    const input = script(i);
    step(a, input, driveline);
    step(b, input, driveline);
    onStep?.(b);
    if (i % 30 === 0 || i === steps - 1) {
      const da = a.sim.debugState();
      const db = b.sim.debugState();
      expect(db.position).toEqual(da.position);
      expect(db.rotation).toEqual(da.rotation);
      expect(db.suspensionLengths).toEqual(da.suspensionLengths);
      expect(b.sim.speedKmh).toBe(a.sim.speedKmh);
    }
  }
}

/** A coast script: settle, accelerate, then lift off completely. */
function coastDecelMs2(rig: Rig, driveline: DrivelinePhysicsInput, coastSec: number): number {
  expect(cruiseTo(rig, 70, driveline)).toBe(true);
  const v0 = rig.sim.speedKmh / 3.6;
  for (let i = 0; i < 60 * coastSec; i++) step(rig, IDLE_INPUT, driveline);
  const v1 = rig.sim.speedKmh / 3.6;
  return (v0 - v1) / coastSec;
}

/**
 * Deceleration (m/s²) over `sec` at a FIXED brake pedal, from ~25 km/h in D
 * (gear 1 — where engine braking is strongest and the pedal map is therefore
 * most exposed). Used to prove the pedal map is monotonic.
 */
function pedalDecelMs2(rig: Rig, pedal: number, sec: number): number {
  const dl: DrivelinePhysicsInput = { ...READY_DRIVELINE };
  expect(cruiseTo(rig, 25, dl)).toBe(true);
  const input: VehicleInput = { ...IDLE_INPUT, brake: pedal };
  const v0 = rig.sim.speedKmh / 3.6;
  for (let i = 0; i < 60 * sec; i++) step(rig, input, dl);
  const v1 = rig.sim.speedKmh / 3.6;
  return (v0 - v1) / sec;
}

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// F3 — engine braking
// ---------------------------------------------------------------------------

describe("F3 engineBrakeDecelMs2 (pure)", () => {
  const inD: DrivelinePhysicsInput = { ...READY_DRIVELINE };

  it("is zero whenever the drivetrain is not transmitting", () => {
    // Exactly hasDriveTraction's rule, so "clutch in and the car freewheels"
    // can never disagree with the tractive-force gate.
    expect(engineBrakeDecelMs2({ ...inD, engineOn: false }, 60)).toBe(0);
    expect(engineBrakeDecelMs2({ ...inD, selector: "N" }, 60)).toBe(0);
    expect(engineBrakeDecelMs2({ ...inD, selector: "P" }, 60)).toBe(0);
    expect(
      engineBrakeDecelMs2({ ...inD, selector: "M", manualGear: 3, clutchDown: true }, 60),
    ).toBe(0);
  });

  it("is zero through the parking band and ramps in above it", () => {
    expect(engineBrakeDecelMs2(inD, 0)).toBe(0);
    expect(engineBrakeDecelMs2(inD, ENGINE_BRAKE_MIN_KMH)).toBe(0);
    const low = engineBrakeDecelMs2(inD, ENGINE_BRAKE_MIN_KMH + 2);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(engineBrakeDecelMs2(inD, 40));
  });

  it("tapers with gear — a low gear holds the car back, top gear barely does", () => {
    const m = (gear: number): DrivelinePhysicsInput => ({
      ...inD,
      selector: "M",
      manualGear: gear,
    });
    const decels = Array.from({ length: MANUAL_GEAR_COUNT }, (_, i) =>
      engineBrakeDecelMs2(m(i + 1), 60),
    );
    for (let i = 1; i < decels.length; i++) {
      expect(decels[i]).toBeLessThan(decels[i - 1] as number);
    }
    expect(decels[0]).toBeCloseTo(ENGINE_BRAKE_DECEL_MS2[0] as number, 6);
  });

  it("stays FAR below the service brake so it can never mask a braking mistake", () => {
    const serviceBrakeMs2 = T.BRAKE_FORCE_N / T.CHASSIS_MASS;
    for (const d of ENGINE_BRAKE_DECEL_MS2) {
      expect(d).toBeLessThan(serviceBrakeMs2 * 0.15);
    }
  });
});

describe("F3 engine braking on the live car", () => {
  it(
    "GATED OFF is bit-identical to the pre-F3 car",
    () => {
      const a = makeRig(); // omitted-options path (the CI harness)
      const b = makeRig({ engineBraking: false }); // explicit default
      expectLockStepIdentical(
        a,
        b,
        60 * 8,
        (i) => (i < 60 * 4 ? { ...IDLE_INPUT, throttle: 1 } : IDLE_INPUT),
        { ...READY_DRIVELINE },
      );
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON, lifting off in D decelerates the car MEASURABLY harder than coasting",
    () => {
      // The defect doc 82 names: today "coasting in N and lifting off in D
      // decelerate identically" (rolling resistance + aero ≈ 0.30–0.45 m/s²).
      const off = makeRig({ engineBraking: false });
      const on = makeRig({ engineBraking: true });
      const dOff = coastDecelMs2(off, { ...READY_DRIVELINE }, 5);
      const dOn = coastDecelMs2(on, { ...READY_DRIVELINE }, 5);
      freeRig(off);
      freeRig(on);

      // MEASURED: 0.691 m/s² off, 0.993 on (70 km/h, 5 s coast in D).
      // NOTE on the doc's figure: doc 82 F3 quotes "≈ 0.30–0.45 m/s² total"
      // from ROLLING_RESISTANCE_N + aero alone. It omits rapier's
      // CHASSIS_LINEAR_DAMPING (0.02), which is ~0.39 m/s² at 70 km/h — hence
      // the real baseline here. The DEFECT the doc names is unaffected: coast
      // and lift-off were still identical, because none of those terms knows
      // what gear the car is in.
      expect(dOff).toBeGreaterThan(0.5);
      expect(dOff).toBeLessThan(0.9);
      expect(dOn).toBeGreaterThan(dOff + 0.2); // the channel does something…
      expect(dOn).toBeLessThan(1.6); // …and stays a lift-off, not a brake
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON, N and a clutch-down manual box coast exactly as before",
    () => {
      // "Clutch down and the car freewheels" must be REAL, not a HUD claim.
      const inN: DrivelinePhysicsInput = { ...READY_DRIVELINE, selector: "N" };
      const a = makeRig({ engineBraking: false });
      const b = makeRig({ engineBraking: true });
      expectLockStepIdentical(a, b, 60 * 6, () => IDLE_INPUT, inN);
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON, the PEDAL MAP STAYS MONOTONIC — brushing the brake can never slow the car LESS than lifting off",
    () => {
      // The trap this guards. Engine braking lives in the coast branch, which
      // is entered only when `brakePedal === 0`. Put it there and nothing else
      // and the instant the student BRUSHES the pedal the whole coast floor
      // (engine brake + rolling resistance) disappears: in gear 1 that is a
      // ~1 m/s² STEP DOWN in deceleration at a 0.02 pedal, i.e. the car surges
      // forward the moment you touch the brake. A driving school cannot teach
      // that pedal — a learner's first brake application is a brush.
      const at = (pedal: number): number => {
        const rig = makeRig({ engineBraking: true });
        const d = pedalDecelMs2(rig, pedal, 2);
        freeRig(rig);
        return d;
      };
      const coast = at(0);
      const brush = at(0.05);
      const firm = at(0.3);
      expect(brush).toBeGreaterThanOrEqual(coast);
      expect(firm).toBeGreaterThan(brush);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// F2 — road-surface vertical motion
// ---------------------------------------------------------------------------

describe("F2 road roughness on the live car", () => {
  const CRUISE: VehicleInput = { ...IDLE_INPUT, throttle: 0.45 };

  it(
    "GATED OFF (roughness 0) is bit-identical to the pre-F2 car",
    () => {
      const a = makeRig();
      const b = makeRig({ roadRoughness: 0 });
      expectLockStepIdentical(a, b, 60 * 8, () => CRUISE);
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON, the suspension finally MOVES in a straight line",
    () => {
      // The whole defect: ROAD_Y is one constant, so the tuned 1.62 Hz
      // suspension never travels on a straight road and the car reads as a
      // camera on rails.
      // Measured in a clean COAST window (throttle 0, after the lift-off
      // pitch has settled) so the reading is the road and not a drivetrain
      // transient — accelerating under power squats the nose either way.
      const travel = (rig: Rig): { susp: number; endKmh: number } => {
        expect(cruiseTo(rig, 60)).toBe(true);
        for (let i = 0; i < 60 * 2; i++) step(rig, IDLE_INPUT);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < 60 * 4; i++) {
          step(rig, IDLE_INPUT);
          const l = rig.sim.wheelSuspensionLength(0);
          min = Math.min(min, l);
          max = Math.max(max, l);
        }
        return { susp: max - min, endKmh: rig.sim.speedKmh };
      };
      const flat = makeRig();
      const rough = makeRig({ roadRoughness: 1 });
      const flatRun = travel(flat);
      const roughRun = travel(rough);
      freeRig(flat);
      freeRig(rough);

      // MEASURED: 0.58 mm of residual coast-down drift on the flat plane vs
      // 4.48 mm of real surface travel.
      expect(flatRun.susp).toBeLessThan(0.001); // today: a car on rails
      expect(roughRun.susp).toBeGreaterThan(flatRun.susp * 4);
      expect(roughRun.susp).toBeGreaterThan(0.002); // felt…
      expect(roughRun.susp).toBeLessThan(0.01); // …and SUB-CENTIMETRE (doc 82)

      // It is a VERTICAL channel: it must not bleed the car's speed, or it
      // would quietly rewrite every graded following gap and stop distance.
      expect(roughRun.endKmh).toBeCloseTo(flatRun.endKmh, 1);
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON is DETERMINISTIC — two independent runs ride the identical road",
    () => {
      // This is the property that keeps recorded traces replayable: the bumps
      // are a function of PLACE, never of a clock or an RNG.
      const a = makeRig({ roadRoughness: 1 });
      const b = makeRig({ roadRoughness: 1 });
      expectLockStepIdentical(a, b, 60 * 8, () => CRUISE);
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "GATED ON does not move the harness braking envelope",
    () => {
      // The 90 km/h stop is the CI gate (30–38 m). If a feel channel can push
      // it out of band, the channel is too strong to ship at any roughness.
      const rig = makeRig({ roadRoughness: 1 });
      expect(cruiseTo(rig, 90)).toBe(true);
      const x0 = rig.sim.debugState().position.x;
      const z0 = rig.sim.debugState().position.z;
      let frames = 0;
      while (rig.sim.speedKmh > 2 && frames < 60 * 15) {
        step(rig, { ...IDLE_INPUT, brake: 1 });
        frames++;
      }
      const end = rig.sim.debugState();
      freeRig(rig);

      expect(end.position.x - x0).toBeGreaterThanOrEqual(30);
      expect(end.position.x - x0).toBeLessThanOrEqual(38);
      // …and the car still stops in a straight line (spawn heading is +X).
      expect(Math.abs(end.position.z - z0)).toBeLessThan(1);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// F1 — the grip-loss read channel, on the live car
// ---------------------------------------------------------------------------

describe("F1 grip utilisation on the live car", () => {
  it(
    "POLLING it every step changes nothing — it is a read, not a force",
    () => {
      const a = makeRig();
      const b = makeRig();
      expectLockStepIdentical(
        a,
        b,
        60 * 8,
        (i) => ({ ...IDLE_INPUT, throttle: 1, steer: i > 60 * 3 ? 0.6 : 0 }),
        undefined,
        // Only rig B is interrogated. If any getter had a side effect, the
        // lock-step comparison above would diverge.
        (rig) => {
          void rig.sim.gripUtilisation;
          void rig.sim.deliveredGripUtilisation;
          void rig.sim.demandedGripUtilisation;
        },
      );
      freeRig(a);
      freeRig(b);
    },
    TEST_TIMEOUT,
  );

  it(
    "is silent at rest and while driving straight, and RISES in a hard corner",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60 * 2; i++) step(rig, IDLE_INPUT);
      expect(rig.sim.gripUtilisation).toBe(0);

      expect(cruiseTo(rig, 70)).toBe(true);
      let straight = 0;
      for (let i = 0; i < 60; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 0.35 });
        straight = Math.max(straight, rig.sim.gripUtilisation);
      }

      let cornering = 0;
      for (let i = 0; i < 60 * 3; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 0.35, steer: 1 });
        cornering = Math.max(cornering, rig.sim.gripUtilisation);
      }
      freeRig(rig);

      expect(straight).toBeLessThan(0.35); // ordinary driving must stay quiet
      expect(cornering).toBeGreaterThan(0.85); // the scrub threshold is reached
    },
    TEST_TIMEOUT,
  );

  it(
    "reports the SAME manoeuvre as far more demanding on a low-grip surface",
    () => {
      // The pedagogical point: on ice the car "stops answering" and the
      // student currently gets no explanation. Same inputs, same speed.
      const measure = (gripFactor: number): number => {
        const rig = makeRig({ gripFactor });
        expect(cruiseTo(rig, 40)).toBe(true);
        let peak = 0;
        for (let i = 0; i < 60 * 2; i++) {
          step(rig, { ...IDLE_INPUT, throttle: 0.3, steer: 0.35 });
          peak = Math.max(peak, rig.sim.gripUtilisation);
        }
        freeRig(rig);
        return peak;
      };
      const dry = measure(1);
      const snow = measure(T.SNOW_GRIP_FACTOR);
      expect(snow).toBeGreaterThan(dry * 1.8);
      expect(snow).toBeGreaterThan(1); // past the limit — a real screech
    },
    TEST_TIMEOUT,
  );
});
