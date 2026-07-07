// Headless vehicle-feel harness — the CI gate demanded by the spike's
// FEEL-NOTES: any tuning change must keep the measured envelope. Runs the
// REAL VehicleSim class (the same code the browser scene binds to) on a raw
// rapier world in Node — rapier's wasm needs no browser.
//
// Invariants asserted (from the spike's measured results):
//   - settle: 4 wheels grounded, ~0.63 m ride, no drift
//   - 0–100 km/h within 10.5–13 s (spike measured 11.6 s)
//   - full brake from 90 km/h stops in 30–38 m (spike: 32.9 m) with nose dive
//   - 12 cm sharp curb under the right wheels at ~50 km/h: stays upright
//   - lane change at 90 km/h: stays upright, keeps heading
//   - reverse state machine: capped, gear R, throttle stops-then-forward
//
// Run: npx vitest run src/modules/sim/vehicle    (or node scripts/sim-harness.mjs)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import { clamp, rotateInto, type Quat, type Vec3 } from "./math";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim, type VehicleInput } from "./VehicleSim";

const TEST_TIMEOUT = 30_000;

interface Rig {
  world: World;
  sim: VehicleSim;
}

function makeRig(setup?: (world: World) => void): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  // 8 km slab — long runs must never drive off the edge (the spike's first
  // harness "reached" 295 km/h in freefall off a 1 km slab).
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  setup?.(world);
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body);
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

/** Accelerate flat-out until `kmh`; returns steps used (-1 if never reached). */
function accelTo(rig: Rig, kmh: number, maxSteps: number): number {
  for (let i = 0; i < maxSteps; i++) {
    if (rig.sim.speedKmh >= kmh) return i;
    step(rig, { ...IDLE_INPUT, throttle: 1 });
  }
  return -1;
}

/** Roll/pitch in degrees + up-vector Y from the chassis quaternion. */
function attitude(q: Quat): { rollDeg: number; pitchDeg: number; upY: number } {
  const left: Vec3 = { x: 0, y: 0, z: 0 };
  const fwd: Vec3 = { x: 0, y: 0, z: 0 };
  const up: Vec3 = { x: 0, y: 0, z: 0 };
  rotateInto(q, 1, 0, 0, left); // car +X = left side
  rotateInto(q, 0, 0, 1, fwd);
  rotateInto(q, 0, 1, 0, up);
  const toDeg = 180 / Math.PI;
  return {
    rollDeg: Math.asin(clamp(left.y, -1, 1)) * toDeg,
    pitchDeg: Math.asin(clamp(fwd.y, -1, 1)) * toDeg,
    upY: up.y, // 1 = upright, <0 = flipped
  };
}

// Results table, printed after the suite — this is the "scenario table" that
// FEEL-NOTES requires on any tuning PR.
const results: Array<{ scenario: string; measured: string; target: string }> = [];

beforeAll(async () => {
  await RAPIER.init();
});

afterAll(() => {
  const w1 = Math.max(...results.map((r) => r.scenario.length), 8);
  const w2 = Math.max(...results.map((r) => r.measured.length), 8);
  const lines = [
    `\n${"Scenario".padEnd(w1)} | ${"Measured".padEnd(w2)} | Target`,
    `${"-".repeat(w1)}-+-${"-".repeat(w2)}-+--------`,
    ...results.map((r) => `${r.scenario.padEnd(w1)} | ${r.measured.padEnd(w2)} | ${r.target}`),
  ];
  console.log(lines.join("\n") + "\n");
});

describe("vehicle feel harness (ported spike invariants)", () => {
  it(
    "settles at rest: 4 wheels grounded, ~0.63 m ride height, no drift",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60 * 4; i++) step(rig, IDLE_INPUT);
      const d = rig.sim.debugState();
      const a = attitude(d.rotation);
      const drift = Math.abs(rig.sim.speedKmh);
      freeRig(rig);

      results.push({
        scenario: "Settle 4 s",
        measured: `ride ${d.position.y.toFixed(3)} m, drift ${drift.toFixed(3)} km/h`,
        target: "~0.63 m, ~0 km/h",
      });

      expect(d.wheelsInContact).toEqual([true, true, true, true]);
      expect(d.position.y).toBeGreaterThan(0.55);
      expect(d.position.y).toBeLessThan(0.72);
      expect(drift).toBeLessThan(0.5);
      expect(Math.abs(a.rollDeg)).toBeLessThan(1.5);
      expect(Math.abs(a.pitchDeg)).toBeLessThan(1.5);
    },
    TEST_TIMEOUT,
  );

  it(
    "accelerates 0-100 km/h in 10.5-13 s, moving in the correct direction",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT); // settle 1 s
      const startX = rig.sim.debugState().position.x;

      let t50 = -1;
      let t100 = -1;
      const RUN_STEPS = 60 * 20;
      for (let i = 0; i < RUN_STEPS; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 1 });
        const v = rig.sim.speedKmh;
        const t = (i + 1) / 60;
        if (t50 < 0 && v >= 50) t50 = t;
        if (t100 < 0 && v >= 100) {
          t100 = t;
          break;
        }
      }
      const endX = rig.sim.debugState().position.x;
      freeRig(rig);

      results.push({
        scenario: "0-100 km/h",
        measured: `${t100 < 0 ? ">20" : t100.toFixed(1)} s (0-50: ${t50.toFixed(1)} s)`,
        target: "10.5-13 s (spike 11.6)",
      });

      // Direction check doubles as the setIndexForwardAxis regression gate:
      // if the forward axis silently falls back to X, signs break and the
      // car never reaches speed / moves the wrong way.
      expect(endX).toBeGreaterThan(startX);
      expect(t100).toBeGreaterThanOrEqual(10.5);
      expect(t100).toBeLessThanOrEqual(13);
    },
    TEST_TIMEOUT,
  );

  it(
    "full brake from 90 km/h: 30-38 m with visible nose dive",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
      expect(accelTo(rig, 90, 60 * 25)).toBeGreaterThanOrEqual(0);

      const v0 = rig.sim.speedKmh / 3.6;
      const x0 = rig.sim.debugState().position.x;
      let frames = 0;
      let maxNoseDive = 0;
      while (rig.sim.speedKmh > 2 && frames < 60 * 15) {
        step(rig, { ...IDLE_INPUT, brake: 1 });
        maxNoseDive = Math.min(maxNoseDive, attitude(rig.sim.debugState().rotation).pitchDeg);
        frames++;
      }
      const dist = rig.sim.debugState().position.x - x0;
      const tStop = frames / 60;
      const avgG = v0 / tStop / 9.81;
      freeRig(rig);

      results.push({
        scenario: "Brake from 90",
        measured: `${dist.toFixed(1)} m, ${avgG.toFixed(2)} g, dive ${maxNoseDive.toFixed(1)} deg`,
        target: "30-38 m (spike 32.9)",
      });

      expect(dist).toBeGreaterThanOrEqual(30);
      expect(dist).toBeLessThanOrEqual(38);
      expect(avgG).toBeGreaterThan(0.8);
      expect(avgG).toBeLessThan(1.15);
      expect(maxNoseDive).toBeLessThan(-1); // visible dive…
      expect(maxNoseDive).toBeGreaterThan(-6); // …not a faceplant
    },
    TEST_TIMEOUT,
  );

  it(
    "12 cm sharp curb under the right wheels at ~50 km/h: stays upright",
    () => {
      // Curb across the RIGHT wheel path only (car faces +X at spawn; right
      // side is world +Z). 2 m along the travel direction so 60 Hz wheel rays
      // cannot skip it. Same worst-case geometry as the spike.
      const rig = makeRig((world) => {
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(1.0, 0.06, 0.8).setTranslation(25, 0.06, -39.3).setFriction(0.9),
        );
      });
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);

      let maxRoll = 0;
      let minUpY = 1;
      let speedAtCurb = 0;
      for (let i = 0; i < 60 * 12; i++) {
        const x = rig.sim.debugState().position.x;
        step(rig, { ...IDLE_INPUT, throttle: x < 20 ? 1 : 0 });
        const a = attitude(rig.sim.debugState().rotation);
        maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
        minUpY = Math.min(minUpY, a.upY);
        if (speedAtCurb === 0 && x >= 25) speedAtCurb = rig.sim.speedKmh;
      }
      const end = attitude(rig.sim.debugState().rotation);
      freeRig(rig);

      results.push({
        scenario: "12 cm curb strike",
        measured: `${speedAtCurb.toFixed(0)} km/h, roll ${maxRoll.toFixed(1)} deg, min upY ${minUpY.toFixed(2)}`,
        target: "~50 km/h, upright (spike roll 2.2)",
      });

      expect(speedAtCurb).toBeGreaterThan(45);
      expect(speedAtCurb).toBeLessThan(62);
      expect(minUpY).toBeGreaterThan(0.85); // never close to tipping
      expect(end.upY).toBeGreaterThan(0.9); // upright at the end
    },
    TEST_TIMEOUT,
  );

  it(
    "lane change at 90 km/h: stays upright, keeps heading",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
      expect(accelTo(rig, 90, 60 * 25)).toBeGreaterThanOrEqual(0);

      let maxRoll = 0;
      let minUpY = 1;
      for (let i = 0; i < 60 * 5; i++) {
        const t = i / 60;
        let steer = 0;
        if (t < 0.6) steer = 0.5; // left
        else if (t < 1.2) steer = -0.5; // right
        step(rig, { ...IDLE_INPUT, throttle: 0.4, steer });
        const a = attitude(rig.sim.debugState().rotation);
        maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
        minUpY = Math.min(minUpY, a.upY);
      }
      const d = rig.sim.debugState();
      const fwd: Vec3 = { x: 0, y: 0, z: 0 };
      rotateInto(d.rotation, 0, 0, 1, fwd);
      freeRig(rig);

      results.push({
        scenario: "Lane change @ 90",
        measured: `roll ${maxRoll.toFixed(1)} deg, min upY ${minUpY.toFixed(2)}, fwd.z ${fwd.z.toFixed(2)}`,
        target: "upright, no spin (spike roll 3.4)",
      });

      expect(minUpY).toBeGreaterThan(0.85);
      expect(maxRoll).toBeLessThan(8);
      // Started heading +X (fwd.z ≈ 0); |fwd.z| ≥ 0.7 would mean it spun.
      expect(Math.abs(fwd.z)).toBeLessThan(0.7);
    },
    TEST_TIMEOUT,
  );

  it(
    "reverse state machine: capped speed, gear R, throttle stops-then-forward",
    () => {
      const rig = makeRig();
      for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);

      // Hold brake from standstill → reverses, capped at REVERSE_MAX_KMH.
      let minV = 0;
      for (let i = 0; i < 60 * 8; i++) {
        step(rig, { ...IDLE_INPUT, brake: 1 });
        minV = Math.min(minV, rig.sim.speedKmh);
      }
      const gearInReverse = rig.sim.gear;

      // Now throttle: must BRAKE to a stop first, then drive forward.
      for (let i = 0; i < 60 * 6; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 1 });
      }
      const finalV = rig.sim.speedKmh;
      freeRig(rig);

      results.push({
        scenario: "Reverse logic",
        measured: `max ${(-minV).toFixed(1)} km/h, gear ${gearInReverse}, then +${finalV.toFixed(0)} km/h`,
        target: `cap ${T.REVERSE_MAX_KMH}, gear R, recovers fwd`,
      });

      expect(-minV).toBeLessThanOrEqual(T.REVERSE_MAX_KMH + 2);
      expect(-minV).toBeGreaterThan(10); // actually reverses
      expect(gearInReverse).toBe("R");
      expect(finalV).toBeGreaterThan(20); // back to driving forward
    },
    TEST_TIMEOUT,
  );
});
