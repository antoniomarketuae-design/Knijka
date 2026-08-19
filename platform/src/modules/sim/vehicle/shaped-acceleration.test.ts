/**
 * THE SHAPED CAR — the acceleration envelope of the car a STUDENT actually
 * drives, on the real rapier rig.
 *
 * WHY THIS FILE EXISTS. `harness.test.ts` pins 0–100 km/h at 10.5–13 s, and it
 * is a good gate, but it drives `{ throttle: 1 }` straight into `VehicleSim`.
 * Nobody drives that car. Every browser session runs the pedal through TWO
 * layers first (VehicleRig.tsx, `useBeforePhysicsStep`):
 *
 *     key ──► stepPedal(THROTTLE_ATTACK_S 0.35 s) ──► applyDifficulty(tier)
 *          ──► VehicleSim.update(shaped, dt, driveline)
 *
 * and `applyDifficulty` is where `throttleExp`, `throttleMul`, the governor and
 * the S0 `creepThrottleCap` live. `parking-envelope.test.ts` drives that whole
 * chain but only in the 0–10 km/h maneuvering band. Between 10 km/h and the
 * governor there was NOTHING: the tier constants could be moved by a factor of
 * five and every gate in this directory would still be green.
 *
 * THE FINDING THAT PUT IT HERE (sweep161, 2026-08-16). Two lessons —
 * `sc-ed-d2-priority-run` and `sc-lane-change` — were filed BROKEN with the
 * cause „the car does not accelerate like a car … short throttle inputs produce
 * almost no acceleration", off drive logs that never passed 16 км/ч in 210 s on
 * a 50 km/h boulevard and recorded 15 and 27 full stops.
 *
 * THAT CAUSE IS FALSE, and the numbers below are the refutation — but the
 * accusation was unanswerable for seven rounds because no instrument in the
 * tree could measure the shaped car. The 16 км/ч ceiling is the AUDIT
 * HARNESS's own control law: `tools/mobile/lesson-audit.mjs` drives `right` at
 * `CRUISE_KMH = 12` with `BRAKE_CAP_OVER_KMH = 2` and a roll → full-stop →
 * roll cadence, all of it inside the tier's creep band. `harnessControlLaw`
 * below reproduces it on this rig and lands in the same teens; the held key on
 * the SAME rig reaches the governor. The contrast is the whole answer, so both
 * halves are asserted here rather than argued in a report.
 *
 * MEASURED 2026-08-19 on this rig (READY_DRIVELINE, flat slab, key ramped by
 * `stepPedal`), seconds from rest:
 *
 *   held key      0→12   0→30   0→50   0→70   top (40 s)
 *     beginner    2.22   4.93   never  never   39.1     ← the 40 governor
 *     normal      1.65   3.43   5.72   8.85    87.5     ← the 90 governor
 *     advanced    1.03   2.35   4.02   6.22   153.3     ← tractive equilibrium
 *
 *   tapped key, 0.35 s down / 0.65 s up — 35 % duty, the „short throttle
 *   inputs" of the finding, on the tier every fresh drive gets:
 *     normal      5.38  14.33  31.37     —      54.9   · 382 m in 40 s
 *
 * The bands below are wide enough to survive a different box and narrow enough
 * to die on a tuning change: every one was checked by MUTATION (see the note on
 * each assertion), and the mutations were reverted.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import type { World } from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import * as T from "./tuning";
import { READY_DRIVELINE } from "./driveline";
import {
  applyDifficulty,
  createDriveAssistState,
  DIFFICULTY_PRESETS,
  type DifficultyMode,
} from "./difficulty";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "./VehicleSim";
import { stepPedal, THROTTLE_ATTACK_S, THROTTLE_RELEASE_S } from "../engine";

const TEST_TIMEOUT = 60_000;

interface Rig {
  world: World;
  sim: VehicleSim;
}

function makeRig(): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  // Same 8 km slab as harness.test.ts — a 40 s advanced run covers 1.5 km.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  return { world, sim: new VehicleSim(world, body) };
}

interface DriveResult {
  /** Seconds from rest to each requested km/h mark; null = never reached. */
  marks: Record<number, number | null>;
  topKmh: number;
  distM: number;
}

/**
 * Drive the FULL production chain for `seconds`.
 *
 * `accel(t, kmh)` returns the KEY state — down or up — not a pedal value, so
 * the 0.35 s attack ramp is inside the measurement rather than assumed away.
 * `brake` is the same, and defaults to never. The explicit `READY_DRIVELINE`
 * selects the honest (cabin) machine, which is what every lesson session runs.
 */
function drive(
  mode: DifficultyMode,
  seconds: number,
  marksAt: readonly number[],
  accel: (tSec: number, kmh: number) => boolean,
  brake: (tSec: number, kmh: number) => boolean = () => false,
): DriveResult {
  const rig = makeRig();
  const assist = createDriveAssistState();
  const marks: Record<number, number | null> = {};
  for (const g of marksAt) marks[g] = null;
  let throttlePedal = 0;
  let brakePedal = 0;
  let topKmh = 0;
  let distM = 0;

  // Settle on the suspension before the clock starts (harness.test.ts's ritual).
  for (let i = 0; i < 60; i++) {
    rig.sim.update(IDLE_INPUT, T.FIXED_DT, READY_DRIVELINE);
    rig.world.step();
  }

  const steps = Math.round(seconds / T.FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const t = i * T.FIXED_DT;
    const kmh = rig.sim.speedKmh;
    for (const g of marksAt) if (marks[g] === null && kmh >= g) marks[g] = t;
    throttlePedal = stepPedal(throttlePedal, accel(t, kmh), T.FIXED_DT, THROTTLE_ATTACK_S, THROTTLE_RELEASE_S);
    brakePedal = stepPedal(brakePedal, brake(t, kmh), T.FIXED_DT, THROTTLE_ATTACK_S, THROTTLE_RELEASE_S);
    const shaped = applyDifficulty(
      { ...IDLE_INPUT, throttle: throttlePedal, brake: brakePedal },
      mode,
      kmh,
      T.FIXED_DT,
      assist,
    );
    rig.sim.update(shaped, T.FIXED_DT, READY_DRIVELINE);
    rig.world.step();
    const now = Math.abs(rig.sim.speedKmh);
    distM += (now / 3.6) * T.FIXED_DT;
    if (now > topKmh) topKmh = now;
  }

  rig.sim.dispose();
  rig.world.free();
  return { marks, topKmh, distM };
}

/** The `right` drive of tools/mobile/lesson-audit.mjs, as a control law. */
const AUDIT_CRUISE_KMH = 12;
const AUDIT_BRAKE_CAP_OVER_KMH = 2;
const AUDIT_ROLL_S = 4;
const AUDIT_STOP_S = 7;
function harnessControlLaw(t: number, kmh: number): { accel: boolean; brake: boolean } {
  const rolling = t % (AUDIT_ROLL_S + AUDIT_STOP_S) < AUDIT_ROLL_S;
  if (!rolling) return { accel: false, brake: true };
  const over = kmh > AUDIT_CRUISE_KMH + AUDIT_BRAKE_CAP_OVER_KMH;
  return { accel: !over, brake: over };
}

beforeAll(async () => {
  await RAPIER.init();
}, TEST_TIMEOUT);

describe("shaped acceleration — the car the student drives", () => {
  it(
    "normal (the default tier) reaches street speed like a car, not a milk float",
    () => {
      const r = drive("normal", 40, [12, 30, 50, 70], () => true);

      // MEASURED 5.72 s to 50 km/h. The band is a car: below 3 s is not a
      // 1220 kg hatchback, above 9 s is the accusation this file answers.
      // MUTATION (2026-08-19, reverted): DIFFICULTY_PRESETS.normal.throttleMul
      // 0.75 → 0.15 took 0→50 from 5.72 s to 38.92 s and this assertion failed
      // („expected 38.916666666666664 to be less than 9"), along with the two
      // tests below.
      expect(r.marks[50]).not.toBeNull();
      expect(r.marks[50]!).toBeGreaterThan(3);
      expect(r.marks[50]!).toBeLessThan(9);

      // …and the low end is not bought by a launch that ignores the creep cap.
      // MEASURED 1.65 / 3.43 s.
      expect(r.marks[12]!).toBeLessThan(3);
      expect(r.marks[30]!).toBeLessThan(6);

      // The 90 governor is the ONLY thing that stops it. MEASURED top 87.5.
      expect(r.topKmh).toBeGreaterThan(80);
      expect(r.topKmh).toBeLessThanOrEqual(DIFFICULTY_PRESETS.normal.speedCapKmh!);
    },
    TEST_TIMEOUT,
  );

  it(
    "the tiers are ordered, and beginner is stopped by its governor and nothing else",
    () => {
      const marks = [12, 30, 50] as const;
      const beginner = drive("beginner", 40, marks, () => true);
      const normal = drive("normal", 40, marks, () => true);
      const advanced = drive("advanced", 40, marks, () => true);

      // Strictly ordered to 30 km/h — a tier that assists more must be slower,
      // never merely different. MEASURED 4.93 / 3.43 / 2.35 s.
      expect(advanced.marks[30]!).toBeLessThan(normal.marks[30]!);
      expect(normal.marks[30]!).toBeLessThan(beginner.marks[30]!);

      // Beginner tops out AT its cap, not short of it: 39.1 against a 40
      // governor is the governor doing the work. A tier whose throttle simply
      // ran out would settle well below, and that is the shape the two BROKEN
      // findings claimed for every tier.
      expect(beginner.marks[50]).toBeNull();
      expect(beginner.topKmh).toBeGreaterThan(DIFFICULTY_PRESETS.beginner.speedCapKmh! - 5);
      expect(beginner.topKmh).toBeLessThanOrEqual(DIFFICULTY_PRESETS.beginner.speedCapKmh!);

      // Advanced is the raw tier: no cap, so drag alone holds it. MEASURED 153.3.
      expect(DIFFICULTY_PRESETS.advanced.speedCapKmh).toBeNull();
      expect(advanced.topKmh).toBeGreaterThan(120);
    },
    TEST_TIMEOUT,
  );

  it(
    "SHORT throttle inputs accelerate the car — the literal claim of the two BROKEN findings",
    () => {
      // 0.35 s down, 0.65 s up: the key is UP for two thirds of the drive, and
      // each press only just reaches full pedal before it is released
      // (THROTTLE_ATTACK_S = 0.35 s). This is as short as a real input gets.
      const r = drive("normal", 40, [12, 30, 50], (t) => t % 1 < 0.35);

      // MEASURED 14.33 s to 30 km/h, 382 m covered in 40 s, top 54.9.
      // MUTATION (2026-08-19, reverted): creepThrottleCap 0.45 → 0.02 on the
      // normal preset — the „almost no acceleration" the finding describes —
      // left the tapped drive short of 30 km/h for the whole 40 s window
      // („expected null not to be null"), and dragged the HELD 0→30 from
      // 3.43 s to 20.92 s, failing the tier-ordering test beside it.
      expect(r.marks[30]).not.toBeNull();
      expect(r.marks[30]!).toBeLessThan(25);
      expect(r.distM).toBeGreaterThan(200);
      expect(r.topKmh).toBeGreaterThan(45);
    },
    TEST_TIMEOUT,
  );

  it(
    "the 16 км/ч sweep ceiling belongs to the audit's control law, not to the car",
    () => {
      // Same rig, same tier, same 210 s — the only difference is the driver.
      const cautious = drive(
        "normal",
        210,
        [30],
        (t, kmh) => harnessControlLaw(t, kmh).accel,
        (t, kmh) => harnessControlLaw(t, kmh).brake,
      );
      const held = drive("normal", 40, [30], () => true);

      // The creep-and-stop law cannot leave the teens, because it brakes at
      // CRUISE + 2 by construction. That is what `drive: top 16 км/ч · 27 full
      // stops` in the sweep log is a picture of.
      expect(cautious.topKmh).toBeLessThan(30);
      expect(cautious.marks[30]).toBeNull();

      // …and the identical car, given a held key, is more than four times
      // faster. If this pair ever inverts, the car really did break.
      expect(held.topKmh).toBeGreaterThan(cautious.topKmh * 3);
    },
    TEST_TIMEOUT,
  );
});
