// S0 parking-envelope harness — the 0–10 km/h maneuvering regime (doc 76 §0:
// "parking scenarios live at 0–10 km/h in REVERSE with full steering locks").
// Runs the REAL VehicleSim + rapier world headless, exactly like
// harness.test.ts (which stays byte-identical — these are ADDITIVE envelope
// gates, wired into scripts/sim-harness.mjs alongside the baseline 6).
//
// What is pinned here:
//   - creep hold: human-cadence keyboard bang-bang (QW8 pedal ramps +
//     beginner assists) holds 3 km/h ± 1 for 5 s
//   - full-lock reverse arc: curb turning radius in the compact band
//     (~5.2–5.5 m for the 2.56 m wheelbase), forward/reverse symmetric
//   - 0-crossing: R-throttle while rolling forward stops-then-reverses with
//     NO sign-flip oscillation and no legacy full-brake slam
//   - standstill honesty: on the explicit-driveline (cabin) machine, brake
//     held in D at a stop HOLDS the car (the legacy arcade machine still
//     reverses — that contract lives in the baseline harness, untouched)
//   - stop from 5 km/h: short, no overshoot; beginner crawl braking is
//     progressive (no 0.9 g head-snap at walking pace)
//   - full lock reachable at parking speed THROUGH the beginner assists
//
// Run: node scripts/sim-harness.mjs   (or npx vitest run src/modules/sim/vehicle)

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import { READY_DRIVELINE, type DrivelinePhysicsInput } from "./driveline";
import {
  applyDifficulty,
  createDriveAssistState,
  type DriveAssistState,
} from "./difficulty";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim, type VehicleInput } from "./VehicleSim";
import {
  BRAKE_ATTACK_S,
  BRAKE_RELEASE_S,
  stepPedal,
  THROTTLE_ATTACK_S,
  THROTTLE_RELEASE_S,
} from "../engine";

const TEST_TIMEOUT = 30_000;

// Explicit drivelines — the HONEST machine (every cabin session). The legacy
// arcade machine is selected by omitting the argument; its contract is pinned
// by harness.test.ts + drivelineGating.test.ts and is not re-tested here.
const DRIVE: DrivelinePhysicsInput = { ...READY_DRIVELINE };
const REVERSE: DrivelinePhysicsInput = { ...READY_DRIVELINE, selector: "R" };

// Vehicle geometry, derived from tuning (no magic numbers).
const WHEELBASE_M = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z; // 2.56
const HALF_TRACK_M = T.WHEEL_POSITIONS[0].x; // 0.76
const REAR_AXLE_FROM_CENTER_M = -T.WHEEL_POSITIONS[2].z; // 1.28

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

function step(rig: Rig, input: VehicleInput, driveline: DrivelinePhysicsInput): void {
  rig.sim.update(input, T.FIXED_DT, driveline);
  rig.world.step();
}

function settle(rig: Rig, driveline: DrivelinePhysicsInput): void {
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT, driveline);
}

/** Drive at constant raw throttle until reaching kmh (explicit driveline). */
function accelTo(rig: Rig, kmh: number, driveline: DrivelinePhysicsInput, maxSteps = 60 * 20): void {
  for (let i = 0; i < maxSteps; i++) {
    if (rig.sim.speedKmh >= kmh) return;
    step(rig, { ...IDLE_INPUT, throttle: 1 }, driveline);
  }
  throw new Error(`accelTo: never reached ${kmh} km/h`);
}

// Results table, printed after the suite — same discipline as the baseline
// harness (FEEL-NOTES: every tuning PR shows the scenario table).
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

describe("S0 parking envelope (0-10 km/h maneuvering)", () => {
  it(
    "creep hold: keyboard bang-bang through beginner assists holds 3 km/h ±1 for 5 s",
    () => {
      // Full student input pipeline: binary key → QW8 pedal ramp → beginner
      // difficulty shaping (creep ceiling) → VehicleSim. The "human" presses
      // W below 2.8 km/h and lifts above it, re-deciding at 4 Hz (250 ms
      // latency — a slow student, deliberately).
      const rig = makeRig();
      settle(rig, DRIVE);
      const assist: DriveAssistState = createDriveAssistState();
      const raw: VehicleInput = { ...IDLE_INPUT };
      let pedal = 0;
      let held = false;
      const DECIDE_EVERY = 15; // steps (250 ms)

      let minV = Infinity;
      let maxV = -Infinity;
      const RUN_STEPS = 60 * 12;
      const SETTLE_STEPS = 60 * 5; // reach + settle into the band
      for (let i = 0; i < RUN_STEPS; i++) {
        if (i % DECIDE_EVERY === 0) held = rig.sim.speedKmh < 2.8;
        pedal = stepPedal(pedal, held, T.FIXED_DT, THROTTLE_ATTACK_S, THROTTLE_RELEASE_S);
        raw.throttle = pedal;
        const shaped = applyDifficulty(raw, "beginner", rig.sim.speedKmh, T.FIXED_DT, assist);
        step(rig, shaped, DRIVE);
        if (i >= SETTLE_STEPS) {
          minV = Math.min(minV, rig.sim.speedKmh);
          maxV = Math.max(maxV, rig.sim.speedKmh);
        }
      }
      freeRig(rig);

      results.push({
        scenario: "Creep hold 3 km/h",
        measured: `${minV.toFixed(1)}..${maxV.toFixed(1)} km/h over 7 s`,
        target: "2-4 km/h (3 ±1)",
      });

      // 5+ seconds inside the ±1 band around 3 km/h.
      expect(minV).toBeGreaterThanOrEqual(2);
      expect(maxV).toBeLessThanOrEqual(4);
    },
    TEST_TIMEOUT,
  );

  it(
    "full-lock reverse arc: compact-car curb radius, symmetric with forward",
    () => {
      // Raw input at tuning level (assists proven separately): full left
      // lock, throttle regulated to keep the arc inside the full-lock speed
      // band. Measures the traced circle over a full revolution.
      const measureArc = (driveline: DrivelinePhysicsInput): number => {
        const rig = makeRig();
        settle(rig, driveline);
        const throttleFor = (v: number) => (Math.abs(v) < 6.5 ? 0.5 : 0);
        // Spin-up: let speed and steering converge before sampling.
        for (let i = 0; i < 60 * 3; i++) {
          step(
            rig,
            { ...IDLE_INPUT, steer: 1, throttle: throttleFor(rig.sim.speedKmh) },
            driveline,
          );
        }
        // Trace one+ full revolution, tracking the path's bounding box.
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let turned = 0;
        let prevYaw: number | null = null;
        for (let i = 0; i < 60 * 40 && turned < Math.PI * 2.1; i++) {
          step(
            rig,
            { ...IDLE_INPUT, steer: 1, throttle: throttleFor(rig.sim.speedKmh) },
            driveline,
          );
          const d = rig.sim.debugState();
          minX = Math.min(minX, d.position.x);
          maxX = Math.max(maxX, d.position.x);
          minZ = Math.min(minZ, d.position.z);
          maxZ = Math.max(maxZ, d.position.z);
          const q = d.rotation;
          const yaw = Math.atan2(
            2 * (q.w * q.y + q.x * q.z),
            1 - 2 * (q.y * q.y + q.z * q.z),
          );
          if (prevYaw !== null) {
            let dy = yaw - prevYaw;
            if (dy > Math.PI) dy -= 2 * Math.PI;
            if (dy < -Math.PI) dy += 2 * Math.PI;
            turned += Math.abs(dy);
          }
          prevYaw = yaw;
        }
        freeRig(rig);
        expect(turned).toBeGreaterThanOrEqual(Math.PI * 2); // completed the circle
        // Path bbox of a circle is 2R × 2R.
        return ((maxX - minX) + (maxZ - minZ)) / 4;
      };

      const rRev = measureArc(REVERSE);
      const rFwd = measureArc(DRIVE);
      // Chassis-centre radius → kerb radius (outer front wheel path):
      // R_rear = sqrt(Rc² − dRear²); R_kerb = sqrt((R_rear + halfTrack)² + L²).
      const rRear = Math.sqrt(Math.max(rRev * rRev - REAR_AXLE_FROM_CENTER_M ** 2, 0));
      const rKerb = Math.sqrt((rRear + HALF_TRACK_M) ** 2 + WHEELBASE_M ** 2);

      results.push({
        scenario: "Full-lock reverse arc",
        measured: `centre R ${rRev.toFixed(2)} m, kerb R ${rKerb.toFixed(2)} m, fwd ${rFwd.toFixed(2)} m`,
        target: "kerb 4.9-5.8 m (compact ~5.2-5.5)",
      });

      // Kinematic prediction at STEER_MAX_ANGLE 0.6: centre 3.95 m, kerb 5.18.
      expect(rRev).toBeGreaterThanOrEqual(3.4);
      expect(rRev).toBeLessThanOrEqual(4.6);
      expect(rKerb).toBeGreaterThanOrEqual(4.9);
      expect(rKerb).toBeLessThanOrEqual(5.8);
      // Forward and reverse arcs come from the same geometry — symmetric.
      expect(Math.abs(rFwd - rRev) / rFwd).toBeLessThan(0.15);
    },
    TEST_TIMEOUT,
  );

  it(
    "0-crossing: R-throttle while rolling forward — no oscillation, no slam",
    () => {
      const rig = makeRig();
      settle(rig, DRIVE);
      accelTo(rig, 6, DRIVE);

      // Gear to R while rolling forward ~6 km/h, throttle held: the sim must
      // stop first (firm, not violent), then reverse — and never flip back.
      let crossed = false;
      let reFlipKmh = 0; // worst positive speed seen AFTER the crossing
      let maxDecel = 0; // m/s², while still rolling forward
      let prevV = rig.sim.speedKmh / 3.6;
      let stepsToReverse = -1;
      const RUN = 60 * 8;
      for (let i = 0; i < RUN; i++) {
        step(rig, { ...IDLE_INPUT, throttle: 0.8 }, REVERSE);
        const v = rig.sim.speedKmh / 3.6;
        if (!crossed && v > 0.15) {
          maxDecel = Math.max(maxDecel, (prevV - v) / T.FIXED_DT);
        }
        if (!crossed && rig.sim.speedKmh < -0.5) {
          crossed = true;
          stepsToReverse = i;
        }
        if (crossed) reFlipKmh = Math.max(reFlipKmh, rig.sim.speedKmh);
        prevV = v;
      }
      freeRig(rig);

      results.push({
        scenario: "0-crossing R",
        measured: `decel ${maxDecel.toFixed(1)} m/s², reversed at ${(stepsToReverse / 60).toFixed(2)} s, re-flip ${reFlipKmh.toFixed(2)} km/h`,
        target: "decel <= 6.5, no re-flip > 0.2",
      });

      expect(crossed).toBe(true); // does reach reverse
      expect(stepsToReverse / 60).toBeLessThan(3); // promptly
      // STOP_FIRST_BRAKE softening: ~0.5 g, NOT the legacy 0.9 g slam.
      expect(maxDecel).toBeLessThanOrEqual(6.5);
      expect(maxDecel).toBeGreaterThan(2); // still firm — it does stop first
      // No sign-flip oscillation: once reversing, never forward again.
      expect(reFlipKmh).toBeLessThanOrEqual(0.2);
    },
    TEST_TIMEOUT,
  );

  it(
    "standstill honesty: brake held in D (cabin machine) parks the car",
    () => {
      const rig = makeRig();
      settle(rig, DRIVE);
      accelTo(rig, 10, DRIVE);

      // Brake to a stop…
      let frames = 0;
      while (Math.abs(rig.sim.speedKmh) > 0.1 && frames < 60 * 6) {
        step(rig, { ...IDLE_INPUT, brake: 1 }, DRIVE);
        frames++;
      }
      const xStop = rig.sim.debugState().position.x;
      // …and HOLD the pedal for 3 s. The legacy arcade machine would glide
      // backward here (brake-at-standstill = reverse); the honest machine
      // must hold the car parked.
      let worstKmh = 0;
      for (let i = 0; i < 60 * 3; i++) {
        step(rig, { ...IDLE_INPUT, brake: 1 }, DRIVE);
        worstKmh = Math.max(worstKmh, Math.abs(rig.sim.speedKmh));
      }
      const drift = Math.abs(rig.sim.debugState().position.x - xStop);
      freeRig(rig);

      results.push({
        scenario: "Brake-hold in D",
        measured: `peak ${worstKmh.toFixed(2)} km/h, drift ${(drift * 100).toFixed(1)} cm over 3 s`,
        target: "holds (no reverse creep)",
      });

      // Peak includes the residual roll right at the 0.1 km/h stop threshold;
      // the real pin is the drift — a parked car does not travel.
      expect(worstKmh).toBeLessThan(0.6);
      expect(drift).toBeLessThan(0.05);
    },
    TEST_TIMEOUT,
  );

  it(
    "stop from 5 km/h: short and overshoot-free (raw); progressive in beginner",
    () => {
      // Raw pedal (tuning truth): full brake from 5 km/h.
      const rig = makeRig();
      settle(rig, DRIVE);
      accelTo(rig, 5, DRIVE);
      const x0 = rig.sim.debugState().position.x;
      let minKmh = Infinity;
      for (let i = 0; i < 60 * 3; i++) {
        step(rig, { ...IDLE_INPUT, brake: 1 }, DRIVE);
        minKmh = Math.min(minKmh, rig.sim.speedKmh);
      }
      const rawDist = rig.sim.debugState().position.x - x0;
      freeRig(rig);

      // Student pipeline: binary S key (QW8 brake ramp) shaped by the
      // beginner crawl ceiling — the stop must stay tight but lose the snap.
      const rig2 = makeRig();
      settle(rig2, DRIVE);
      accelTo(rig2, 5, DRIVE);
      const assist = createDriveAssistState();
      const raw: VehicleInput = { ...IDLE_INPUT };
      let pedal = 0;
      let maxDecel = 0;
      let prevV = rig2.sim.speedKmh / 3.6;
      const x1 = rig2.sim.debugState().position.x;
      let minKmh2 = Infinity;
      for (let i = 0; i < 60 * 3; i++) {
        pedal = stepPedal(pedal, true, T.FIXED_DT, BRAKE_ATTACK_S, BRAKE_RELEASE_S);
        raw.brake = pedal;
        raw.throttle = 0;
        const shaped = applyDifficulty(raw, "beginner", rig2.sim.speedKmh, T.FIXED_DT, assist);
        step(rig2, shaped, DRIVE);
        const v = rig2.sim.speedKmh / 3.6;
        if (v > 0.05) maxDecel = Math.max(maxDecel, (prevV - v) / T.FIXED_DT);
        prevV = v;
        minKmh2 = Math.min(minKmh2, rig2.sim.speedKmh);
      }
      const easedDist = rig2.sim.debugState().position.x - x1;
      freeRig(rig2);

      results.push({
        scenario: "Stop from 5 km/h",
        measured: `raw ${(rawDist * 100).toFixed(0)} cm, beginner ${(easedDist * 100).toFixed(0)} cm @ ${maxDecel.toFixed(1)} m/s²`,
        target: "raw <= 35 cm, beginner <= 80 cm, decel <= 6",
      });

      expect(rawDist).toBeGreaterThan(0.02); // it did roll, we measured a stop
      expect(rawDist).toBeLessThanOrEqual(0.35);
      expect(minKmh).toBeGreaterThanOrEqual(-0.2); // no overshoot into reverse
      expect(easedDist).toBeLessThanOrEqual(0.8);
      expect(minKmh2).toBeGreaterThanOrEqual(-0.2);
      expect(maxDecel).toBeLessThanOrEqual(6); // progressive, no 0.9 g snap
    },
    TEST_TIMEOUT,
  );

  it(
    "scenario obstacle colliders: parked-car box and thin pole stop the car",
    () => {
      // Physical truth behind ScenarioObstacles' fixed cuboids: a bumper-
      // height box (parked-car dims from the fleet's measured rigs) and a
      // slim 8 cm training-pole cuboid must STOP the chassis at parking
      // speeds — contact fires, nothing tunnels. Spawn faces +X; the car
      // nose is chassis centre +2.02 m (CHASSIS_HALF_EXTENTS.z).
      const carFaceGap = (obstacleHalfX: number, obstacleX: number, driveKmh: number): number => {
        const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
        world.timestep = T.FIXED_DT;
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(obstacleHalfX, 0.72, 0.9)
            .setTranslation(obstacleX, 0.72, T.SPAWN.z)
            .setFriction(0.5),
        );
        const body = createHeadlessChassis(RAPIER, world);
        const sim = new VehicleSim(world, body);
        const rig: Rig = { world, sim };
        settle(rig, DRIVE);
        for (let i = 0; i < 60 * 12; i++) {
          const throttle = sim.speedKmh < driveKmh ? 0.5 : 0;
          step(rig, { ...IDLE_INPUT, throttle }, DRIVE);
        }
        const nose = rig.sim.debugState().position.x + T.CHASSIS_HALF_EXTENTS.z;
        freeRig(rig);
        return obstacleX - obstacleHalfX - nose; // >= 0 → stopped at the face
      };

      // Parked-car cuboid 7 m ahead, crept into at ~4 km/h.
      const gapCar = carFaceGap(0.81, T.SPAWN.x + 9, 4);
      // Thin pole (8 cm cuboid) hit at ~10 km/h — must not tunnel through.
      const gapPole = carFaceGap(0.04, T.SPAWN.x + 9, 10);

      results.push({
        scenario: "Obstacle contact",
        measured: `car-box gap ${(gapCar * 100).toFixed(1)} cm, pole gap ${(gapPole * 100).toFixed(1)} cm`,
        target: "stops at the face (>= -3 cm, no tunnel)",
      });

      // Stopped AT the obstacle: no tunneling (a few cm of solver overlap is
      // physical — bumpers deform; passing THROUGH would go metres negative).
      expect(gapCar).toBeGreaterThanOrEqual(-0.03);
      expect(gapCar).toBeLessThan(1.5); // it did reach the obstacle
      expect(gapPole).toBeGreaterThanOrEqual(-0.04);
      expect(gapPole).toBeLessThan(1.5);
    },
    TEST_TIMEOUT,
  );

  it(
    "full lock is reachable through beginner assists at parking speed",
    () => {
      const rig = makeRig();
      settle(rig, DRIVE);
      const assist = createDriveAssistState();
      const raw: VehicleInput = { ...IDLE_INPUT, throttle: 0.4, steer: 1 };
      // Creep forward at a few km/h with the wheel hard left, through the
      // beginner shaping. Pre-S0 the 0.6 sens capped the road wheels at
      // ~0.36 rad (turning circle ~7 m) — full lock (0.6 rad) must be there.
      let tToLock = -1;
      for (let i = 0; i < 60 * 3; i++) {
        const shaped = applyDifficulty(raw, "beginner", rig.sim.speedKmh, T.FIXED_DT, assist);
        step(rig, shaped, DRIVE);
        if (tToLock < 0 && rig.sim.steerRad >= T.STEER_MAX_ANGLE * 0.95) {
          tToLock = (i + 1) / 60;
        }
      }
      const finalSteer = rig.sim.steerRad;
      freeRig(rig);

      results.push({
        scenario: "Beginner full lock",
        measured: `${finalSteer.toFixed(3)} rad, 95% lock in ${tToLock < 0 ? ">3" : tToLock.toFixed(2)} s`,
        target: `>= ${(T.STEER_MAX_ANGLE * 0.95).toFixed(2)} rad within 0.8 s`,
      });

      expect(finalSteer).toBeGreaterThanOrEqual(T.STEER_MAX_ANGLE * 0.95);
      expect(tToLock).toBeGreaterThan(0);
      expect(tToLock).toBeLessThanOrEqual(0.8);
    },
    TEST_TIMEOUT,
  );
});
