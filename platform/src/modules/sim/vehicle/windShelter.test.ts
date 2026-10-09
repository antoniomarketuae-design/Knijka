/**
 * THE LEE OF A TALL VEHICLE — the geometry of `windShelter.ts`, and the one
 * place the wind model reads it (`VehicleSim.setWindShelterFactor`).
 *
 * sc-ac-wind-truck-pass:ff1d4290, the restage of 2026-10-08. The lesson-level
 * measurements (the force on the car beside the staged truck, the wheel, the
 * sentences) are `lessons/scenario/__tests__/wind-truck-pass-restage.test.ts`;
 * this file pins the function they stand on and the identity law: a sim nobody
 * feeds a shelter — every lesson but that one — is bit-identical to before.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CHASSIS_HALF_EXTENTS,
  createHeadlessChassis,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  FIXED_DT,
  GRAVITY,
  IDLE_INPUT,
  READY_DRIVELINE,
  SPAWN,
  VehicleSim,
  WIND_SHELTER_CAR_LENGTH_M,
  WIND_SHELTER_FADE_M,
  WIND_SHELTER_REACH_M,
  WIND_SHELTER_RESIDUAL,
  WIND_SHELTER_WAKE_M,
  createRigWindShelter,
  stepRigWindShelter,
  windShelterDepth,
  windShelterFactor,
  type WindShelterBody,
} from "./index";

/** The box rig of sc-ac-wind-truck-pass: 7.5 × 2.4 m, heading north at the origin. */
const TRUCK: WindShelterBody = { x: 0, y: 0, dirX: 0, dirY: 1, halfLengthM: 3.75, halfWidthM: 1.2 };
const WEST = -1; // the shipped wind: its force points to district −X
const HALF_CAR = CHASSIS_HALF_EXTENTS.z;
const LANE = 8.12;

beforeAll(async () => {
  await RAPIER.init();
});

describe("windShelter — the numbers", () => {
  it("are the documented ones", () => {
    expect(WIND_SHELTER_RESIDUAL).toBe(0.3);
    expect(WIND_SHELTER_REACH_M).toBe(12);
    expect(WIND_SHELTER_FADE_M).toBe(4);
    // 13, not round 1's 15: the wake ends a metre short of where the rule
    // engine starts to bill a car following the lesson's 40 км/ч truck
    // (`windShelter.ts`; the 14.0 is derived from the engine's own numbers in
    // lessons/scenario/__tests__/wind-truck-pass-restage.test.ts).
    expect(WIND_SHELTER_WAKE_M).toBe(13);
    expect(WIND_SHELTER_CAR_LENGTH_M).toBeCloseTo(4.04, 9);
  });
});

describe("windShelter — where the lee is", () => {
  it("beside the body on the LEEWARD side: the full lee; on the windward side: the open wind", () => {
    // The wind blows west, so the lee is to the WEST of a northbound truck.
    expect(windShelterFactor(-LANE, 0, [TRUCK], WEST)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    expect(windShelterFactor(+LANE, 0, [TRUCK], WEST)).toBe(1);
    // Turn the wind round and the sides swap.
    expect(windShelterFactor(-LANE, 0, [TRUCK], +1)).toBe(1);
    expect(windShelterFactor(+LANE, 0, [TRUCK], +1)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    // A southbound truck with the same west wind: the lee is still to the west.
    const south: WindShelterBody = { ...TRUCK, dirY: -1 };
    expect(windShelterFactor(-LANE, 0, [south], WEST)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    expect(windShelterFactor(+LANE, 0, [south], WEST)).toBe(1);
  });

  it("along the body: full while the car's nose is behind the body's, gone one car length later — linearly", () => {
    const at = (a: number) => windShelterDepth(-LANE, a, TRUCK, WEST);
    const noseLevel = TRUCK.halfLengthM - HALF_CAR; // the two noses level
    expect(at(noseLevel - 3)).toBe(1);
    expect(at(noseLevel)).toBeCloseTo(1, 12);
    expect(at(noseLevel + WIND_SHELTER_CAR_LENGTH_M / 4)).toBeCloseTo(0.75, 9);
    expect(at(noseLevel + WIND_SHELTER_CAR_LENGTH_M / 2)).toBeCloseTo(0.5, 9);
    expect(at(noseLevel + WIND_SHELTER_CAR_LENGTH_M)).toBeCloseTo(0, 9);
    expect(at(noseLevel + WIND_SHELTER_CAR_LENGTH_M + 0.01)).toBe(0);
    expect(at(60)).toBe(0);
    // Monotone on the way out: the wind never dips again once it has started back.
    let prev = 1;
    for (let a = noseLevel; a <= noseLevel + 5; a += 0.05) {
      const d = at(a);
      expect(d).toBeLessThanOrEqual(prev + 1e-12);
      prev = d;
    }
  });

  it("behind the body: the wake, and nothing past it", () => {
    const behind = (bumperGapM: number) =>
      windShelterDepth(0, -TRUCK.halfLengthM - HALF_CAR - bumperGapM, TRUCK, WEST);
    expect(behind(1)).toBe(1);
    expect(behind(WIND_SHELTER_WAKE_M - WIND_SHELTER_CAR_LENGTH_M)).toBeCloseTo(1, 9);
    expect(behind(WIND_SHELTER_WAKE_M - WIND_SHELTER_CAR_LENGTH_M / 2)).toBeCloseTo(0.5, 9);
    expect(behind(WIND_SHELTER_WAKE_M + 0.01)).toBe(0);
    // AT the wake's end the factor is exactly 1: the shelter begins on the
    // frame the car's nose crosses it, not before.
    expect(behind(WIND_SHELTER_WAKE_M)).toBe(0);
    expect(windShelterFactor(0, -TRUCK.halfLengthM - HALF_CAR - WIND_SHELTER_WAKE_M, [TRUCK], WEST)).toBe(1);
    expect(behind(WIND_SHELTER_WAKE_M - 0.5)).toBeGreaterThan(0.1);
    expect(behind(20)).toBe(0);
    expect(behind(60)).toBe(0);
  });

  it("across the wind: the whole adjacent lane, fading out beyond it; one metre to windward of the flank it is gone", () => {
    const acrossAt = (e: number) => windShelterDepth(-e, 0, TRUCK, WEST); // e metres downwind
    expect(acrossAt(0)).toBe(1);
    expect(acrossAt(LANE)).toBe(1);
    expect(acrossAt(WIND_SHELTER_REACH_M)).toBe(1);
    expect(acrossAt(WIND_SHELTER_REACH_M + WIND_SHELTER_FADE_M / 2)).toBeCloseTo(0.5, 9);
    expect(acrossAt(WIND_SHELTER_REACH_M + WIND_SHELTER_FADE_M)).toBe(0);
    expect(acrossAt(-TRUCK.halfWidthM)).toBe(1);
    expect(acrossAt(-TRUCK.halfWidthM - 0.5)).toBeCloseTo(0.5, 9);
    expect(acrossAt(-TRUCK.halfWidthM - 1)).toBe(0);
  });

  it("is total: no body, no wind, a degenerate heading or a body running along the wind give the open wind", () => {
    expect(windShelterFactor(-LANE, 0, [], WEST)).toBe(1);
    expect(windShelterFactor(-LANE, 0, [TRUCK], 0)).toBe(1);
    expect(windShelterFactor(-LANE, 0, [{ ...TRUCK, dirX: 0, dirY: 0 }], WEST)).toBe(1);
    expect(windShelterFactor(0, -LANE, [{ ...TRUCK, dirX: 1, dirY: 0 }], WEST)).toBe(1);
    // Two walls do not shelter twice: the deepest lee wins.
    const second: WindShelterBody = { ...TRUCK, x: 3 };
    expect(windShelterFactor(-LANE, 0, [TRUCK, second], WEST)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    for (let x = -30; x <= 30; x += 1.5) {
      for (let y = -40; y <= 40; y += 2) {
        const f = windShelterFactor(x, y, [TRUCK], WEST);
        expect(f).toBeGreaterThanOrEqual(WIND_SHELTER_RESIDUAL - 1e-12);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The one reader: VehicleSim
// ---------------------------------------------------------------------------

interface Run {
  xs: number[];
  winds: number[];
  pulls: number[];
  accels: number[];
}
function run(shelterAtStep: ((step: number) => number) | null, steps = 300): Run {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = FIXED_DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(
    world,
    body,
    { x: 0, y: SPAWN.y, z: 0, yawRad: Math.PI },
    {
      gripFactor: 1,
      windLateralN: -CROSSWIND_BRIDGE_N,
      windGust: { periodSec: CROSSWIND_GUST_PERIOD_SEC, amplitudeN: -CROSSWIND_GUST_AMPLITUDE_N },
    },
  );
  sim.reset();
  const out: Run = { xs: [], winds: [], pulls: [], accels: [] };
  for (let i = 0; i < steps; i++) {
    if (shelterAtStep !== null) sim.setWindShelterFactor(shelterAtStep(i));
    sim.update({ ...IDLE_INPUT, throttle: 0.6 }, FIXED_DT, READY_DRIVELINE);
    world.step();
    out.xs.push(sim.debugState().position.x);
    out.winds.push(sim.windLateralNow);
    out.pulls.push(sim.windSteerPullRad);
    out.accels.push(sim.windLatAccelMs2);
  }
  sim.dispose();
  world.free();
  return out;
}

describe("VehicleSim — the shelter multiplies the wind's ONE number", () => {
  it("a sim that is never fed a shelter is bit-identical to one fed 1 on every step (the identity law)", () => {
    const never = run(null);
    const ones = run(() => 1);
    expect(ones.xs).toEqual(never.xs);
    expect(ones.winds).toEqual(never.winds);
    expect(ones.pulls).toEqual(never.pulls);
    expect(ones.accels).toEqual(never.accels);
  });

  it("the force, the yaw pull and the lean's wind term are all the open value times the factor, on the same step", () => {
    const open = run(null);
    const lee = run(() => WIND_SHELTER_RESIDUAL);
    for (let i = 0; i < open.winds.length; i++) {
      expect(lee.winds[i]!).toBeCloseTo(open.winds[i]! * WIND_SHELTER_RESIDUAL, 9);
    }
    // The pull is linear in the force at a given speed; the two cars' speeds
    // are within a hair of each other over five seconds, so are the ratios.
    const k = 240;
    expect(lee.pulls[k]! / open.pulls[k]!).toBeGreaterThan(0.29);
    expect(lee.pulls[k]! / open.pulls[k]!).toBeLessThan(0.31);
    expect(lee.accels[k]! / open.accels[k]!).toBeGreaterThan(0.29);
    expect(lee.accels[k]! / open.accels[k]!).toBeLessThan(0.31);
    // …and the car in the lee is carried less far west with its wheel untouched.
    expect(Math.abs(lee.xs[299]!)).toBeLessThan(0.5 * Math.abs(open.xs[299]!));
  });

  it("the factor takes effect on the step it is set for and is released the step it is lifted; a restart puts the car back in the open wind", () => {
    const open = run(null, 120);
    const stepped = run((i) => (i >= 40 && i < 80 ? WIND_SHELTER_RESIDUAL : 1), 120);
    expect(stepped.winds[39]!).toBeCloseTo(open.winds[39]!, 9);
    expect(stepped.winds[40]!).toBeCloseTo(open.winds[40]! * WIND_SHELTER_RESIDUAL, 9);
    expect(stepped.winds[79]!).toBeCloseTo(open.winds[79]! * WIND_SHELTER_RESIDUAL, 9);
    expect(stepped.winds[80]!).toBeCloseTo(open.winds[80]!, 9);

    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body, { x: 0, y: SPAWN.y, z: 0, yawRad: Math.PI }, { windLateralN: -CROSSWIND_BRIDGE_N });
    expect(sim.windShelterFactor).toBe(1);
    sim.setWindShelterFactor(0.3);
    expect(sim.windShelterFactor).toBe(0.3);
    expect(sim.windLateralNow).toBeCloseTo(-CROSSWIND_BRIDGE_N * 0.3, 9);
    sim.setWindShelterFactor(7); // clamped: a lee never adds wind
    expect(sim.windShelterFactor).toBe(1);
    sim.setWindShelterFactor(0.3);
    sim.reset();
    expect(sim.windShelterFactor).toBe(1);
    expect(sim.windLateralNow).toBe(-CROSSWIND_BRIDGE_N);
    sim.dispose();
    world.free();
  });

  it("a calm car ignores it entirely", () => {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body, { x: 0, y: SPAWN.y, z: 0, yawRad: Math.PI });
    sim.setWindShelterFactor(0.3);
    expect(sim.windLateralNow).toBe(0);
    expect(sim.windLatAccelMs2).toBe(0);
    expect(sim.windSteerPullRad).toBe(0);
    sim.dispose();
    world.free();
  });
});

// ---------------------------------------------------------------------------
// The rig's own step — `stepRigWindShelter`, the function VehicleRig calls
// ---------------------------------------------------------------------------

/**
 * ROUND 2, the round-1 verifier's F-02. The lee was wired into the product by
 * three lines inside `VehicleRig`'s physics callback, which no test executes;
 * two mutants on committed product files — the rig working the factor out and
 * never handing it to the sim (V4), the scene passing `null` (V5) — left the
 * browser with NO lee and every test green, because the harness had its own
 * copy of those three lines. They are one function now, the rig and the
 * harness both call it, and it is run here against the real `VehicleSim`.
 * (`lessonWind.test.ts` holds the two component sources to the call sites.)
 */
describe("stepRigWindShelter — the rig hands THIS step's lee to the sim, from where the chassis is", () => {
  function liveSim(): { sim: VehicleSim; world: RAPIER.World; body: ReturnType<typeof createHeadlessChassis> } {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(
      world,
      body,
      { x: -8.12, y: SPAWN.y, z: -200, yawRad: Math.PI },
      { gripFactor: 1, windLateralN: -CROSSWIND_BRIDGE_N },
    );
    sim.reset();
    return { sim, world, body };
  }

  it("asks the lee at the chassis' DISTRICT position (x = world x, y = −world z), sets the answer on the sim, and the very next update is pushed with it", () => {
    const { sim, world, body } = liveSim();
    const asked: Array<[number, number]> = [];
    const shelterAt = (x: number, y: number): number => {
      asked.push([x, y]);
      return 0.3;
    };
    expect(sim.windShelterFactor).toBe(1);
    const t = body.translation();
    const set = stepRigWindShelter(sim, shelterAt, t);
    expect(set).toBe(0.3);
    expect(asked).toEqual([[t.x, -t.z]]);
    expect(asked[0]![1]).toBeCloseTo(200, 6); // the district's north is −z
    // V4 dies here: a rig that works the factor out and does not hand it over
    // leaves the sim at 1 and the force whole.
    expect(sim.windShelterFactor).toBe(0.3);
    sim.update(IDLE_INPUT, FIXED_DT, READY_DRIVELINE);
    world.step();
    expect(sim.windLateralNow).toBeCloseTo(-CROSSWIND_BRIDGE_N * 0.3, 9);
    sim.dispose();
    world.free();
  });

  it("with the real geometry: a car beside the staged truck's trailer is stepped into the full lee, and the same car one lane to WINDWARD is not", () => {
    const { sim, world, body } = liveSim();
    // The truck abeam of the chassis (district y = 200), one lane to its east.
    const truck: WindShelterBody = { x: 0, y: 200, dirX: 0, dirY: 1, halfLengthM: 3.75, halfWidthM: 1.2 };
    const shelterAt = (x: number, y: number): number => windShelterFactor(x, y, [truck], WEST);
    expect(stepRigWindShelter(sim, shelterAt, body.translation())).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    expect(sim.windShelterFactor).toBeCloseTo(WIND_SHELTER_RESIDUAL, 12);
    // A translation on the truck's windward side (district x = +8.12).
    expect(stepRigWindShelter(sim, shelterAt, { x: 8.12, z: -200 })).toBe(1);
    expect(sim.windShelterFactor).toBe(1);
    // …and a sign error in the z mapping would look for the truck 400 m away.
    expect(shelterAt(-8.12, -200)).toBe(1);
    sim.dispose();
    world.free();
  });

  it("with no shelter function, or no body yet, it sets NOTHING — the sim of a lesson without a lee is never touched", () => {
    let calls = 0;
    const spy = { setWindShelterFactor: () => void calls++ };
    expect(stepRigWindShelter(spy, null, { x: 1, z: 2 })).toBeNull();
    expect(stepRigWindShelter(spy, undefined, { x: 1, z: 2 })).toBeNull();
    expect(stepRigWindShelter(spy, () => 0.3, null)).toBeNull();
    expect(stepRigWindShelter(spy, () => 0.3, undefined)).toBeNull();
    expect(calls).toBe(0);
    expect(stepRigWindShelter(spy, () => 0.3, { x: 1, z: 2 })).toBe(0.3);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The rig's HELD lee — `createRigWindShelter`, what VehicleRig keeps across renders
// ---------------------------------------------------------------------------

/**
 * ROUND 3, the round-2 verifier's F2-03(a). The rig copied its `windShelterAt`
 * prop into a ref from an effect, and that effect given an EMPTY dependency
 * list kept the first lesson's lee for the life of the component — every test
 * green, because nothing executed the copy. The copy is this object's
 * `follow` now, and it is executed here: whatever function was followed LAST
 * is the one the next physics step asks, on the real VehicleSim.
 */
describe("createRigWindShelter — the rig follows a CHANGED shelter function, and gives the open wind back when it goes", () => {
  function liveSim(): { sim: VehicleSim; world: RAPIER.World } {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = FIXED_DT;
    world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body, { x: -8.12, y: SPAWN.y, z: -200, yawRad: Math.PI }, { gripFactor: 1, windLateralN: -CROSSWIND_BRIDGE_N });
    sim.reset();
    return { sim, world };
  }

  it("F2-03(a): a second lesson's function, followed on a later render, is the one the next step asks — not the first one's", () => {
    const { sim, world } = liveSim();
    const lee = createRigWindShelter();
    const first = (): number => 0.3;
    const second = (): number => 0.65;
    lee.follow(first);
    expect(lee.step(sim, { x: -8.12, z: -200 })).toBe(0.3);
    expect(sim.windShelterFactor).toBe(0.3);
    lee.follow(second); // the prop changed
    expect(lee.step(sim, { x: -8.12, z: -200 })).toBe(0.65);
    expect(sim.windShelterFactor).toBe(0.65);
    sim.update(IDLE_INPUT, FIXED_DT, READY_DRIVELINE);
    world.step();
    expect(sim.windLateralNow).toBeCloseTo(-CROSSWIND_BRIDGE_N * 0.65, 9);
    sim.dispose();
    world.free();
  });

  it("a lee that goes away (the prop becomes null) is given back ONCE: the sim is put in the open wind, then left alone", () => {
    const { sim, world } = liveSim();
    const lee = createRigWindShelter();
    lee.follow(() => 0.3);
    lee.step(sim, { x: 0, z: 0 });
    expect(sim.windShelterFactor).toBe(0.3);
    lee.follow(null);
    expect(lee.step(sim, { x: 0, z: 0 })).toBe(1);
    expect(sim.windShelterFactor).toBe(1);
    let calls = 0;
    const spy = { setWindShelterFactor: () => void calls++ };
    expect(lee.step(spy, { x: 0, z: 0 })).toBeNull();
    expect(calls).toBe(0);
    sim.dispose();
    world.free();
  });

  it("a rig that never had a lee never touches the sim — however often it renders and steps", () => {
    let calls = 0;
    const spy = { setWindShelterFactor: () => void calls++ };
    const lee = createRigWindShelter();
    for (let i = 0; i < 10; i++) {
      lee.follow(i % 2 === 0 ? null : undefined);
      expect(lee.step(spy, { x: 1, z: 2 })).toBeNull();
    }
    expect(calls).toBe(0);
    // …and with no body yet, nothing either, even with a lee to give.
    lee.follow(() => 0.3);
    expect(lee.step(spy, null)).toBeNull();
    expect(calls).toBe(0);
  });
});
