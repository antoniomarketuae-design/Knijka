/**
 * l0-free-drive:ee9d9374 — THE STRUCK BODY'S HALF OF THE IMPACT SPEED.
 *
 * The repair defines a contact's impact speed as |v_chassis − v_other|, km/h:
 * v_chassis the chassis velocity `update()` hands the step's solve
 * (`solveStartVel`), v_other the struck body's velocity over that step. The
 * façade / block / touch tests (lessons/scenario/__tests__/
 * impact-speed-before-solve.test.ts) strike only FIXED bodies, where
 * v_other = 0, so dropping v_other (reading |v_chassis| alone) passed every
 * suite in the lane's verification (mutant V2, finding F3).
 *
 * This file strikes MOVING kinematic shells — the body type NpcColliders
 * drives with setNextKinematicTranslation — and reads the contact where the
 * product reads it: `recordPhysicsStep` after `world.step`, then the step
 * recorder's own `contactsAtStep`. Each reading is held to the closing speed
 * |v_car − v_shell| from the car's step-record speed before the contact and
 * the shell's commanded speed, within the repair's stated tolerance (one step
 * of the full service brake, 0.541 km/h) plus 0.1 km/h for the shell's own
 * integration.
 *
 *   - a standing car (brake held) rear-ended by a 30 km/h shell reads ≈ 30
 *     (|v_chassis| alone reads ≈ 0);
 *   - 40 km/h head-on into a 20 km/h shell reads ≈ 60 (alone: ≈ 40);
 *   - 50 km/h behind a 33.4 km/h shell reads ≈ 16.6 (alone: ≈ 50).
 */
import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import * as T from "./tuning";
import { IDLE_INPUT, VehicleSim, createHeadlessChassis } from "./VehicleSim";
import { READY_DRIVELINE } from "./driveline";
import { PlayerStepTrackRecorder, recordPhysicsStep, type PhysicsStepState } from "../traffic/playerTrack";

const H = T.FIXED_DT;
/** One step of the full service brake, km/h (the repair's stated tolerance). */
const TOL_KMH = (T.BRAKE_FORCE_N / T.CHASSIS_MASS / 60) * 3.6;
const SHELL_SLACK_KMH = 0.1;

beforeAll(async () => {
  await RAPIER.init();
});

interface Case {
  /** The car's held speed, km/h (0 = standing, full brake). */
  carKmh: number;
  /** The shell's speed, km/h, along world z (+ = the car's own direction). */
  shellVz: number;
  /** The shell's start, metres along world z from the car once it is ready. */
  shellDz: number;
}

interface Reading {
  impactKmh: number;
  carBeforeKmh: number;
  closingKmh: number;
  step: number;
}

/** The car faces world +z (yaw 0); the shell rides the same line. */
function strike(c: Case): Reading {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = H;
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body, { x: 0, y: 0.8, z: 0, yawRad: 0 }, {});
  sim.reset();
  const shell = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.75, 500));
  shell.userData = { npcCollider: true, kind: "vehicle", npcId: 7 };
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.2).setFriction(0.5).setRestitution(0.05), shell);
  const rec = new PlayerStepTrackRecorder();
  const st: PhysicsStepState = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };
  const sv = c.shellVz / 3.6;
  let shellZ = 0;
  let started = false;
  try {
    for (let k = 1; k <= 60 * 40; k++) {
      const err = c.carKmh - sim.speedKmh;
      const input =
        c.carKmh === 0
          ? { ...IDLE_INPUT, brake: 1 }
          : { ...IDLE_INPUT, throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12, brake: 0 };
      // The honest machine (D, engine on), as LessonScene drives it: the
      // omitted-argument legacy arcade reverses under a held brake.
      sim.update(input, H, READY_DRIVELINE);
      const ready = c.carKmh === 0 ? k > 120 : k > 60 && Math.abs(sim.speedKmh - c.carKmh) < 0.5;
      if (ready && !started) {
        started = true;
        shellZ = body.translation().z + c.shellDz;
        shell.setTranslation({ x: 0, y: 0.75, z: shellZ }, true);
      }
      if (started) {
        shellZ += sv * H;
        shell.setNextKinematicTranslation({ x: 0, y: 0.75, z: shellZ });
      }
      world.step();
      recordPhysicsStep(rec, body, sim);
      const hit = rec.contactsAtStep(k).find((x) => (x.otherUserData as { npcId?: number } | undefined)?.npcId === 7);
      if (hit) {
        if (!rec.stateAtStep(k - 1, st)) throw new Error(`no step record before the contact at ${k}`);
        // Signed speeds along +z: the car moves forward (+z) at its speed.
        return { impactKmh: hit.impactKmh, carBeforeKmh: st.speedKmh, closingKmh: Math.abs(st.speedKmh - c.shellVz), step: k };
      }
    }
    throw new Error(`the shell never struck the car (${JSON.stringify(c)})`);
  } finally {
    sim.dispose();
    world.free();
  }
}

function expectClosing(label: string, r: Reading, nominal: number): void {
  const d = Math.abs(r.impactKmh - r.closingKmh);
  expect(
    d <= TOL_KMH + SHELL_SLACK_KMH,
    `${label}: the contact read ${r.impactKmh.toFixed(3)} km/h — the closing speed was ${r.closingKmh.toFixed(3)} ` +
      `(car ${r.carBeforeKmh.toFixed(3)} before step ${r.step}; tolerance ${(TOL_KMH + SHELL_SLACK_KMH).toFixed(3)})`,
  ).toBe(true);
  // And the closing speed is the case it claims to be (the drive reached it).
  expect(Math.abs(r.closingKmh - nominal), `${label}: closing ${r.closingKmh.toFixed(3)} vs nominal ${nominal}`).toBeLessThan(2);
}

describe("l0-free-drive:ee9d9374 — the impact speed is the CLOSING speed: the struck body's velocity counts", () => {
  it("a standing car (brake held) rear-ended by a 30 km/h shell reads 30, not the standing car's ≈ 0", () => {
    const r = strike({ carKmh: 0, shellVz: 30, shellDz: -12 });
    expect(r.carBeforeKmh).toBeLessThan(0.5);
    expectClosing("standing, rear-ended at 30", r, 30);
  }, 60_000);

  it("40 km/h head-on into a 20 km/h shell reads about 60, not the car's own 40", () => {
    const r = strike({ carKmh: 40, shellVz: -20, shellDz: 40 });
    expectClosing("40 head-on to 20", r, 60);
  }, 60_000);

  it("50 km/h behind a 33.4 km/h shell reads about 16.6, not the car's own 50", () => {
    const r = strike({ carKmh: 50, shellVz: 33.4, shellDz: 20 });
    expectClosing("50 behind 33.4", r, 16.6);
  }, 60_000);
});
