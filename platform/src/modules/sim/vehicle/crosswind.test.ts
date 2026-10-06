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
//   - holding the lane takes a VISIBLE STEADY CORRECTION, 3–5 % of full
//     input at the lesson's speeds (founder ruling 2026-10-04 — section 2),
//     which the side force alone cannot ask for at any magnitude, so the
//     wind also TURNS the car (the yaw pull, `crosswindPull.ts`);
//   - a car left alone is carried downwind, STRICTLY further the faster it
//     goes over the whole 8–110 km/h both wind lessons are driven at, and
//     never as hard as the wind's own F/m (round 2 — the pull law's two
//     properties, measured here on the car);
//   - it stays a correction, not a crash: a late driver recovers with a
//     tenth of the wheel, and a twentieth out-pulls the wind;
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
import { cockpitLatAccelMs2, cockpitLeanFromSim } from "./cockpitLean";
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
// 2. WHAT THE WIND ASKS OF THE DRIVER — founder ruling 2026-10-04,
//    «Stronger wind» (sc-ac-crosswind:a9db1738): holding the lane must take a
//    VISIBLE STEADY CORRECTION, about 3–5 % of full steering input.
//
//    HOW IT IS MEASURED, because the three numbers this section replaced were
//    measured wrong. They drove the car hands-fixed from a standstill, flat
//    out, until it reached 70 km/h — eight to ten seconds under the wind —
//    and only THEN started the clock, so what they called „the drift at
//    cruise" was the heading error of the launch. Here the car is brought to
//    speed ON A HELD LINE by a closed-loop driver (PD on lateral position with
//    a slow integral — the way a person settles onto a correction), and:
//      · the EQUILIBRIUM is that driver's own mean input once the line is held
//        (constant wind: the last 20 s; gusty wind: four whole gust periods);
//      · the DRIFT is what happens from that settled state when the wheel is
//        let go.
//    Every figure is the real `VehicleSim` on rapier — the chain the rest of
//    this file uses — at the lesson's own conditions: flat straight road, the
//    shipped CROSSWIND_BRIDGE_N across it, the 34 km/h sc-ac-crosswind teaches
//    and the 40 km/h its objective caps.
// ---------------------------------------------------------------------------

/** The lesson's taught speed and its objective ceiling (templates-conditions.ts
 *  step 3: „тук около 34 км/ч, таванът е 40"). */
const TAUGHT_KMH = 34;
const CEILING_KMH = 40;
/** The founder's band, as a fraction of full input. */
const RULED_MIN = 0.03;
const RULED_MAX = 0.05;

/** `VehicleSim`'s speed-sensitive lock: the road-wheel angle full input gives. */
function maxSteerRad(kmh: number): number {
  const f = Math.min(
    1,
    Math.max(0, (Math.abs(kmh) - T.STEER_FULL_SPEED_KMH) / (T.STEER_MIN_SPEED_KMH - T.STEER_FULL_SPEED_KMH)),
  );
  return T.STEER_MAX_ANGLE + (T.STEER_MIN_ANGLE - T.STEER_MAX_ANGLE) * f;
}

/** A pedal that holds `kmh` — a plain P loop; the pedal is not under test. */
function cruiseThrottle(rig: Rig, kmh: number): number {
  return Math.min(1, Math.max(0, (kmh - rig.sim.speedKmh) * 0.25 + 0.12));
}

interface LaneHold {
  integ: number;
  prevX: number;
}

/** One step of the closed-loop driver holding the line x = 0 at `kmh`.
 *  Returns the steer INPUT it applied (−1..1, + = left). */
function laneHoldStep(rig: Rig, h: LaneHold, kmh: number): number {
  const x = rig.sim.debugState().position.x;
  const vx = (x - h.prevX) / T.FIXED_DT;
  h.prevX = x;
  h.integ += x * T.FIXED_DT;
  const steer = Math.min(1, Math.max(-1, -(0.08 * x + 0.12 * vx + 0.02 * h.integ)));
  step(rig, { ...IDLE_INPUT, throttle: cruiseThrottle(rig, kmh), steer });
  return steer;
}

interface Settled {
  rig: Rig;
  hold: LaneHold;
  /** Mean input over the measurement window — the equilibrium correction. */
  mean: number;
  min: number;
  max: number;
  /** Largest |x| over the window, m — how well the line was actually held. */
  maxAbsX: number;
  /** The last input applied. */
  last: number;
}

/** Bring a north-facing car to `kmh` on the line x = 0 and hold it there:
 *  `settleSec` to settle, then `windowSec` measured. The rig is returned LIVE
 *  (still on the line, still at speed) for a release; the caller frees it. */
function settleOnLine(
  options: VehicleSimOptions,
  kmh: number,
  settleSec = 25,
  windowSec = 20,
): Settled {
  const rig = makeNorthRig(options);
  const hold: LaneHold = { integ: 0, prevX: 0 };
  for (let i = 0; i < 60; i++) step(rig, IDLE_INPUT);
  for (let i = 0; i < 60 * settleSec; i++) laneHoldStep(rig, hold, kmh);
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let maxAbsX = 0;
  let last = 0;
  const n = 60 * windowSec;
  for (let i = 0; i < n; i++) {
    last = laneHoldStep(rig, hold, kmh);
    sum += last;
    min = Math.min(min, last);
    max = Math.max(max, last);
    maxAbsX = Math.max(maxAbsX, Math.abs(rig.sim.debugState().position.x));
  }
  return { rig, hold, mean: sum / n, min, max, maxAbsX, last };
}

/** Let the wheel go for `sec` seconds at a held speed; lateral travel, m. */
function release(rig: Rig, kmh: number, sec: number): number {
  const x0 = rig.sim.debugState().position.x;
  for (let i = 0; i < Math.round(60 * sec); i++) {
    step(rig, { ...IDLE_INPUT, throttle: cruiseThrottle(rig, kmh), steer: 0 });
  }
  return rig.sim.debugState().position.x - x0;
}

/** Yaw about +Y, rad (+ = turning left, toward world +X for a north rig). */
function yawRad(rig: Rig): number {
  const q = rig.sim.debugState().rotation;
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
}

const WIND: VehicleSimOptions = { windLateralN: T.CROSSWIND_BRIDGE_N };
const GUSTY_WIND: VehicleSimOptions = {
  windLateralN: T.CROSSWIND_BRIDGE_N,
  windGust: { periodSec: T.CROSSWIND_GUST_PERIOD_SEC, amplitudeN: T.CROSSWIND_GUST_AMPLITUDE_N },
};
const WIND_MS2 = T.CROSSWIND_BRIDGE_N / T.CHASSIS_MASS;

describe("crosswind (AC-12) — the correction the wind asks for (founder ruling 2026-10-04)", () => {
  it(
    "THE RULED BAND — holding the lane takes 3–5 % of full input at the lesson's speeds",
    () => {
      // Conditions, stated: flat straight road, constant CROSSWIND_BRIDGE_N
      // square across it, the lane held to the centimetre.
      // …and, beyond the lesson's own two speeds, 20 and 30 on the way up.
      // MEASURED (round 2): 3.13 % at 20, 3.39 % at 30, 3.51 % at the taught
      // 34, 3.13 % at the 40 км/ч ceiling.
      for (const kmh of [20, 30, TAUGHT_KMH, CEILING_KMH]) {
        const s = settleOnLine(WIND, kmh);
        // The wind blows +X on this rig (pushed LEFT); the correction is to
        // the RIGHT — a negative input. Its size is the equilibrium.
        const correction = -s.mean;
        expect(s.maxAbsX, `${kmh} km/h: the line is held`).toBeLessThan(0.02);
        expect(correction, `${kmh} km/h`).toBeGreaterThanOrEqual(RULED_MIN);
        expect(correction, `${kmh} km/h`).toBeLessThanOrEqual(RULED_MAX);
        // STEADY: once held it does not hunt.
        expect(s.max - s.min, `${kmh} km/h: steady`).toBeLessThan(0.002);
        freeRig(s.rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "…and the two lesson conditions are INSIDE it with room — 34 and 40 км/ч, stated to a tenth of a point",
    () => {
      // Round 2 moved the 40 км/ч figure (3.71 % → 3.13 %) and left the 34 one
      // where it was (3.51 %): the taught speed is below the law's crossover.
      const taught = settleOnLine(WIND, TAUGHT_KMH);
      const ceiling = settleOnLine(WIND, CEILING_KMH);
      expect(-taught.mean).toBeGreaterThan(0.0345);
      expect(-taught.mean).toBeLessThan(0.0357);
      expect(-ceiling.mean).toBeGreaterThan(0.0307);
      expect(-ceiling.mean).toBeLessThan(0.0319);
      freeRig(taught.rig);
      freeRig(ceiling.rig);
    },
    TEST_TIMEOUT,
  );

  it(
    "STATED, NOT RULED — above the ceiling the held wheel gets smaller: 2.5 % at 50, 1.7 % at the sibling's 78",
    () => {
      // The ruling is about the lesson's conditions. Past them the pull rolls
      // off (the price of a path acceleration that may never reach F/m), and
      // the motorway sibling's driver holds about half of what the street's
      // does. Pinned so that a retune cannot move it unannounced.
      for (const [kmh, lo, hi] of [
        [50, 0.0235, 0.0262], // measured 2.49 %
        [78, 0.016, 0.018], // measured 1.70 %
        [110, 0.0175, 0.0195], // measured 1.85 % (the lock itself is down to 0.14 rad)
      ] as const) {
        const s = settleOnLine(WIND, kmh, kmh >= 90 ? 45 : 25);
        expect(s.maxAbsX, `${kmh} km/h: the line is held`).toBeLessThan(0.02);
        expect(-s.mean, `${kmh} km/h`).toBeGreaterThan(lo);
        expect(-s.mean, `${kmh} km/h`).toBeLessThan(hi);
        freeRig(s.rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "…and on the shipped gust it BREATHES around that mean — more wheel on the gust, less in the lull",
    () => {
      for (const kmh of [TAUGHT_KMH, CEILING_KMH]) {
        // 20 s = four whole gust periods, so the mean is the mean of the sine.
        const s = settleOnLine(GUSTY_WIND, kmh, 25, 4 * T.CROSSWIND_GUST_PERIOD_SEC);
        const mean = -s.mean;
        const least = -s.max; // the lull
        const most = -s.min; // the gust
        expect(mean, `${kmh} km/h mean`).toBeGreaterThanOrEqual(RULED_MIN);
        expect(mean, `${kmh} km/h mean`).toBeLessThanOrEqual(RULED_MAX);
        // Briefing step 6 — „отслабне ли, отпусни плавно корекцията": there
        // is something to release. Measured 1.9 % → 5.1 % at 34 km/h.
        expect(most - least, `${kmh} km/h swing`).toBeGreaterThan(0.025);
        expect(least, `${kmh} km/h lull`).toBeGreaterThan(0.015);
        expect(most, `${kmh} km/h gust`).toBeLessThan(0.07);
        // The wind never flips, so the correction never changes side.
        expect(s.max, `${kmh} km/h: always into the wind`).toBeLessThan(0);
        // And a driver who follows it keeps the lane to a hand's width.
        expect(s.maxAbsX, `${kmh} km/h`).toBeLessThan(0.25);
        freeRig(s.rig);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "THE SIDE FORCE ALONE COULD NOT ASK FOR IT — at any magnitude the tyres survive",
    () => {
      // With the lane held, the ROAD wheels stand where the side force alone
      // needs them: everything else in the driver's hands is the yaw pull. So
      // `roadWheelRad` at equilibrium IS the force-only correction — the
      // number `tuning.ts` used to quote as „below 0.01 of full input".
      const measured: number[] = [];
      for (const [forceN, ceiling] of [
        [T.CROSSWIND_BRIDGE_N, 0.001], // measured 0.05 %
        [6000, 0.005], // measured 0.27 %
        [12000, 0.01], // measured 0.54 % — a 1 g „wind", and still under 1 %
      ] as const) {
        const s = settleOnLine({ windLateralN: forceN }, TAUGHT_KMH);
        expect(s.maxAbsX, `${forceN} N: the line is held`).toBeLessThan(0.05);
        const forceOnly = Math.abs(s.rig.sim.roadWheelRad) / maxSteerRad(TAUGHT_KMH);
        expect(forceOnly, `${forceN} N`).toBeLessThan(ceiling);
        expect(forceOnly, `${forceN} N`).toBeLessThan(RULED_MIN / 3);
        measured.push(forceOnly);
        freeRig(s.rig);
      }
      // …and it IS still there: the side force is applied, it asks for a
      // little, and it asks for it in proportion (0.05 % → 0.27 % → 0.54 %).
      // A wind that only turned the car and never pushed it would read 0 here.
      expect(measured[0]).toBeGreaterThan(0.0003);
      expect(measured[1] / measured[0]).toBeGreaterThan(4);
      expect(measured[1] / measured[0]).toBeLessThan(6);
      expect(measured[2] / measured[0]).toBeGreaterThan(8);
      expect(measured[2] / measured[0]).toBeLessThan(12);
    },
    TEST_TIMEOUT,
  );

  it(
    "let go, the car is carried downwind — and the faster it goes the further (briefing step 4)",
    () => {
      const carried = (options: VehicleSimOptions | undefined, kmh: number, sec: number) => {
        const s = settleOnLine(options ?? {}, kmh);
        const d = release(s.rig, kmh, sec);
        freeRig(s.rig);
        return d;
      };
      // The calm car tracks dead straight: the drift is the WIND, not noise.
      expect(Math.abs(carried(undefined, TAUGHT_KMH, 2))).toBeLessThan(0.02);
      // Measured 0.38 m in 1 s and 1.38 m in 2 s at 34 km/h (before the
      // ruling: 0.006 m and 0.02 m — a wind a student could ignore).
      const d1 = carried(WIND, TAUGHT_KMH, 1);
      const d2 = carried(WIND, TAUGHT_KMH, 2);
      expect(d1).toBeGreaterThan(0.25);
      expect(d1).toBeLessThan(0.55);
      expect(d2).toBeGreaterThan(1.0);
      expect(d2).toBeLessThan(1.8);
      // „Колкото по-бавно караш, толкова по-малко те мести поривът."
      const slow = carried(WIND, 20, 2); // measured 0.54 m
      const fast = carried(WIND, 50, 2); // measured 1.70 m (2.10 m under round 1's law)
      expect(slow).toBeLessThan(d2 * 0.6);
      expect(fast).toBeGreaterThan(d2 * 1.15);
    },
    TEST_TIMEOUT,
  );

  it(
    "(i) SLOWER IS LESS, EVERYWHERE — the hands-off displacement over a fixed reaction time rises STRICTLY with speed, 8 to 110 км/ч",
    () => {
      // THE SENTENCES THIS IS: sc-ac-crosswind step 4 «колкото по-бавно караш,
      // толкова по-малко те мести поривът» (driven at 8–50 км/ч), its demo's
      // «колкото по-бавно, толкова по-малко те мести вятърът», and
      // sc-ac-wind-truck-pass step 5 «по-бавно покрай камиона значи по-малко
      // отместване от порива» and its demo's «колкото по-бавно минаваме,
      // толкова по-малко ще ни отмести поривът» (driven at 54–92 км/ч, capped
      // at 100). Round 1's law made the last two false: above ~43 км/ч the arc
      // sat AT F/m, and the round-1 verifier measured 2.049 m in 2 s at 70,
      // 2.037 at 78, 2.012 at 100, 2.004 at 110 — FALLING. One settled car per
      // speed, released, read at four reaction times.
      const SPEEDS = [8, 15, 20, 30, TAUGHT_KMH, CEILING_KMH, 50, 60, 70, 78, 90, 100, 110];
      const TIMES = [1, 1.5, 2, 3];
      const table = SPEEDS.map((kmh) => {
        const s = settleOnLine(WIND, kmh, kmh >= 90 ? 45 : 25);
        const x0 = s.rig.sim.debugState().position.x;
        const at: number[] = [];
        let done = 0;
        for (const sec of TIMES) {
          release(s.rig, kmh, sec - done);
          done = sec;
          at.push(s.rig.sim.debugState().position.x - x0);
        }
        freeRig(s.rig);
        return at;
      });
      for (let t = 0; t < TIMES.length; t++) {
        for (let i = 1; i < SPEEDS.length; i++) {
          expect(
            table[i]![t]!,
            `${TIMES[t]} s: ${SPEEDS[i]} km/h (${table[i]![t]!.toFixed(4)} m) vs ${SPEEDS[i - 1]} km/h (${table[i - 1]![t]!.toFixed(4)} m)`,
          ).toBeGreaterThan(table[i - 1]![t]!);
        }
      }
      // HOW MUCH, so the sentence is not true by a hair where it is shown.
      // On the street (2 s): 0.54 m at 20, 1.38 m at 34, 1.70 m at 50.
      const at2 = (kmh: number) => table[SPEEDS.indexOf(kmh)]![TIMES.indexOf(2)]!;
      expect(at2(20) / at2(TAUGHT_KMH)).toBeLessThan(0.45);
      expect(at2(TAUGHT_KMH) / at2(50)).toBeLessThan(0.85);
      // On the motorway (2 s): 1.78 m at 60, 1.83 at 70, 1.86 at 78, 1.89 at
      // 90 — a real difference, and a SMALL one: 4 % between 60 and 78. The
      // law cannot give more here without leaving the ruled band at 40 км/ч
      // (F/m is the ceiling and 0.72 of it is already spent there).
      expect(at2(60) / at2(78)).toBeLessThan(0.97);
      expect(at2(70) / at2(78)).toBeLessThan(0.99);
      expect(at2(78) / at2(90)).toBeLessThan(0.99);
      // DISCLOSED LIMIT: at the top of the range the rise is millimetres per
      // 10 км/ч at 1 s (0.486 → 0.487 m from 100 to 110) and about a
      // centimetre at 2 s. Strict, and flat for any practical purpose.
      expect(at2(110) - at2(100)).toBeGreaterThan(0.005);
      expect(at2(110) - at2(100)).toBeLessThan(0.03);
    },
    60_000,
  );

  it(
    "THE WIND CANNOT OUT-PUSH ITSELF — hands off, the path never accelerates harder than F/m",
    () => {
      // The arc a released car is turned onto has sideways acceleration
      // v · (yaw rate). (ii): it is BELOW the wind's own F/m at every speed —
      // round 1 sat AT it from 43 km/h up — and it keeps climbing toward it:
      // 0.63 of F/m at the taught 34 км/ч, 0.72 at 40, 0.80 at 50, 0.90 at 78,
      // 0.94 at 110 (measured; the kinematic law reads 1–2 points higher).
      const pathAccel = (kmh: number) => {
        const s = settleOnLine(WIND, kmh);
        const y0 = yawRad(s.rig);
        release(s.rig, kmh, 1);
        const a = (yawRad(s.rig) - y0) * (s.rig.sim.speedKmh / 3.6);
        freeRig(s.rig);
        return a;
      };
      let prev = 0;
      for (const kmh of [20, TAUGHT_KMH, CEILING_KMH, 50, 78, 110]) {
        const a = pathAccel(kmh);
        expect(a, `${kmh} km/h: under F/m`).toBeLessThan(WIND_MS2);
        expect(a, `${kmh} km/h: rising`).toBeGreaterThan(prev);
        prev = a;
      }
      const taught = pathAccel(TAUGHT_KMH);
      expect(taught).toBeGreaterThan(WIND_MS2 * 0.5);
      expect(taught).toBeLessThan(WIND_MS2 * 0.8);
      // The motorway figures, pinned from both sides: close to the wind's own
      // push (a lesson, not a nudge) and never at it.
      const sibling = pathAccel(78);
      expect(sibling).toBeGreaterThan(WIND_MS2 * 0.85);
      expect(sibling).toBeLessThan(WIND_MS2 * 0.94);
      const top = pathAccel(110);
      expect(top).toBeGreaterThan(WIND_MS2 * 0.9);
      expect(top).toBeLessThan(WIND_MS2 * 0.97);
    },
    TEST_TIMEOUT,
  );

  it(
    "IT STAYS A CORRECTION, NOT A CRASH — a driver a full second late recovers with a tenth of the wheel",
    () => {
      // The student who was reading the briefing: the wheel is let go for
      // `lateSec`, then a plain proportional driver answers, never using more
      // than 10 % of the input. Peak excursion and time back to within 0.3 m.
      const recover = (lateSec: number) => {
        const s = settleOnLine(WIND, TAUGHT_KMH);
        const x0 = s.rig.sim.debugState().position.x;
        release(s.rig, TAUGHT_KMH, lateSec);
        let peak = 0;
        let backAtSec = Infinity;
        let prevX = s.rig.sim.debugState().position.x;
        for (let i = 0; i < 60 * 8; i++) {
          const xAbs = s.rig.sim.debugState().position.x;
          const x = xAbs - x0;
          const vx = (xAbs - prevX) / T.FIXED_DT;
          prevX = xAbs;
          peak = Math.max(peak, Math.abs(x));
          if (backAtSec === Infinity && i > 30 && Math.abs(x) < 0.3) backAtSec = i / 60;
          const steer = Math.min(0.1, Math.max(-0.1, s.mean - (0.08 * x + 0.12 * vx)));
          step(s.rig, { ...IDLE_INPUT, throttle: cruiseThrottle(s.rig, TAUGHT_KMH), steer });
        }
        const final = Math.abs(s.rig.sim.debugState().position.x - x0);
        freeRig(s.rig);
        return { peak, backAtSec, final };
      };
      const oneLate = recover(1); // measured: peak 0.50 m, back in 1.8 s
      expect(oneLate.peak).toBeLessThan(1.0);
      expect(oneLate.backAtSec).toBeLessThan(4);
      expect(oneLate.final).toBeLessThan(0.05);
      const twoLate = recover(2); // measured: peak 1.94 m, back in 3.8 s
      // Still inside the 3.25 m lane-keep band (rules DEFAULT_RULE_CONFIG
      // .laneKeepMaxOffsetM) — late, frightening, and not a conviction.
      expect(twoLate.peak).toBeLessThan(3.25);
      expect(twoLate.final).toBeLessThan(0.05);
    },
    TEST_TIMEOUT,
  );

  it(
    "controllable: a twentieth of the wheel out-pulls the wind (the taught duty works)",
    () => {
      const s = settleOnLine(WIND, TAUGHT_KMH);
      const x0 = s.rig.sim.debugState().position.x;
      // 5 % of input INTO a wind blowing +X: the car must move UPWIND.
      for (let i = 0; i < 60 * 4; i++) {
        step(s.rig, { ...IDLE_INPUT, throttle: cruiseThrottle(s.rig, TAUGHT_KMH), steer: -0.05 });
      }
      expect(s.rig.sim.debugState().position.x - x0).toBeLessThan(-1.2); // measured −2.23 m
      freeRig(s.rig);
    },
    TEST_TIMEOUT,
  );

  it(
    "THE SECOND SWING IS IN THE CAR NOW — a correction sized for the gust, kept into the lull, throws it upwind",
    () => {
      // Briefing step 7 and `teach.whyBg`: „когато поривът внезапно отслабне,
      // рязко завъртяният волан сам изхвърля колата на другата страна". Before
      // the ruling there was no correction to keep (0.08 % at the peak, 0.03 %
      // in the lull) and this moved the car two centimetres.
      const peakN = T.CROSSWIND_BRIDGE_N + T.CROSSWIND_GUST_AMPLITUDE_N;
      const lullN = T.CROSSWIND_BRIDGE_N - T.CROSSWIND_GUST_AMPLITUDE_N;
      const atPeak = settleOnLine({ windLateralN: peakN }, TAUGHT_KMH);
      const heldForTheGust = atPeak.mean;
      freeRig(atPeak.rig);
      const lull = settleOnLine({ windLateralN: lullN }, TAUGHT_KMH);
      expect(Math.abs(heldForTheGust)).toBeGreaterThan(Math.abs(lull.mean) * 2);
      const x0 = lull.rig.sim.debugState().position.x;
      for (let i = 0; i < 60 * 2; i++) {
        step(lull.rig, {
          ...IDLE_INPUT,
          throttle: cruiseThrottle(lull.rig, TAUGHT_KMH),
          steer: heldForTheGust,
        });
      }
      // UPWIND (−X): the correction, not the wind, is now moving the car.
      expect(lull.rig.sim.debugState().position.x - x0).toBeLessThan(-0.5);
      freeRig(lull.rig);
    },
    TEST_TIMEOUT,
  );

  it(
    "…and at the motorway sibling's speed too — sc-ac-wind-truck-pass's «изхвърля колата на другата страна, обратно към камиона»",
    () => {
      // The sibling's `teach.whyBg` (round 2) attributes the throw back toward
      // the truck to the over-held correction, not to the gust. On that lesson
      // the wind pushes the overtaking car toward the median and the truck is
      // on the UPWIND side, so „toward the truck" is upwind here: −X.
      const kmh = 74;
      const peakN = T.CROSSWIND_BRIDGE_N + T.CROSSWIND_GUST_AMPLITUDE_N;
      const lullN = T.CROSSWIND_BRIDGE_N - T.CROSSWIND_GUST_AMPLITUDE_N;
      const atPeak = settleOnLine({ windLateralN: peakN }, kmh);
      const heldForTheGust = atPeak.mean;
      freeRig(atPeak.rig);
      const lull = settleOnLine({ windLateralN: lullN }, kmh);
      const x0 = lull.rig.sim.debugState().position.x;
      for (let i = 0; i < 60 * 2; i++) {
        step(lull.rig, { ...IDLE_INPUT, throttle: cruiseThrottle(lull.rig, kmh), steer: heldForTheGust });
      }
      const moved = lull.rig.sim.debugState().position.x - x0;
      expect(moved).toBeLessThan(-0.5); // measured −1.5 m in 2 s
      expect(moved).toBeGreaterThan(-3);
      freeRig(lull.rig);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2b. THE PULL'S OWN CONTRACT — whose wheel it is, which way, and what it may
//     not touch.
// ---------------------------------------------------------------------------

describe("crosswind (AC-12) — the yaw pull's contract", () => {
  it("is exactly 0 on the calm car, and the road wheels ARE the driver's wheel", () => {
    const calm = makeNorthRig();
    for (let i = 0; i < 90; i++) {
      step(calm, { ...IDLE_INPUT, throttle: 0.6, steer: i < 45 ? 0.3 : -0.2 });
      expect(calm.sim.windSteerPullRad).toBe(0);
      expect(calm.sim.roadWheelRad).toBe(calm.sim.steerRad);
    }
    freeRig(calm);
  });

  it("turns the road wheels DOWNWIND and leaves the driver's wheel alone — the rim never moves by itself", () => {
    const east = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N }); // pushed left (+)
    const west = makeNorthRig({ windLateralN: -T.CROSSWIND_BRIDGE_N }); // pushed right (−)
    for (let i = 0; i < 120; i++) {
      // Hands off the wheel for the whole run.
      step(east, { ...IDLE_INPUT, throttle: 0.5 });
      step(west, { ...IDLE_INPUT, throttle: 0.5 });
      // `steerRad` is what the cockpit rim and secondSwing.ts read.
      expect(east.sim.steerRad).toBe(0);
      expect(west.sim.steerRad).toBe(0);
    }
    expect(east.sim.windSteerPullRad).toBeGreaterThan(0.015);
    expect(west.sim.windSteerPullRad).toBeLessThan(-0.015);
    expect(east.sim.roadWheelRad).toBe(east.sim.windSteerPullRad);
    // …and the car goes where the wheels point: downwind.
    expect(east.sim.debugState().position.x).toBeGreaterThan(0.05);
    expect(west.sim.debugState().position.x).toBeLessThan(-0.05);
    freeRig(east);
    freeRig(west);
  });

  it("a car driving ALONG the wind is not turned by it — the pull reads the car-local side force", () => {
    // Facing +X (yaw +90°), the +X wind is a pure tailwind.
    const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
    world.timestep = T.FIXED_DT;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
    );
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body, { x: 0, y: 0.8, z: 0, yawRad: Math.PI / 2 }, {
      windLateralN: T.CROSSWIND_BRIDGE_N,
    });
    sim.reset();
    const along: Rig = { world, sim };
    const across = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    for (let i = 0; i < 60; i++) {
      step(along, { ...IDLE_INPUT, throttle: 0.5 });
      step(across, { ...IDLE_INPUT, throttle: 0.5 });
    }
    expect(Math.abs(along.sim.windSteerPullRad)).toBeLessThan(across.sim.windSteerPullRad * 0.02);
    freeRig(along);
    freeRig(across);
  });

  it("breathes on the SAME clock as the force — one number, read once per step", () => {
    // The pull advances the gust clock and the force further down the step
    // reads it; a second advance would run the gust at twice its period.
    const rig = makeNorthRig(GUSTY_WIND);
    const steps = 97; // an arbitrary non-multiple of the period
    let pullAtPeak = 0;
    let pullAtLull = Infinity;
    for (let i = 1; i <= steps; i++) step(rig, IDLE_INPUT);
    const expected =
      T.CROSSWIND_BRIDGE_N +
      T.CROSSWIND_GUST_AMPLITUDE_N *
        Math.sin((2 * Math.PI * steps * T.FIXED_DT) / T.CROSSWIND_GUST_PERIOD_SEC);
    expect(rig.sim.windLateralNow).toBeCloseTo(expected, 6);
    // …and the pull is that force's (at rest: clause 1). Seven places, not
    // exact: the pull was computed from the pose BEFORE this step's
    // world.step(), the getter reads the pose after it.
    expect(rig.sim.windSteerPullRad).toBeCloseTo(
      rig.sim.windLatAccelMs2 * T.CHASSIS_MASS * T.CROSSWIND_STEER_PULL_RAD_PER_N,
      7,
    );
    for (let i = 0; i < Math.round(60 * T.CROSSWIND_GUST_PERIOD_SEC); i++) {
      step(rig, IDLE_INPUT);
      pullAtPeak = Math.max(pullAtPeak, rig.sim.windSteerPullRad);
      pullAtLull = Math.min(pullAtLull, rig.sim.windSteerPullRad);
    }
    const ratio =
      (T.CROSSWIND_BRIDGE_N + T.CROSSWIND_GUST_AMPLITUDE_N) /
      (T.CROSSWIND_BRIDGE_N - T.CROSSWIND_GUST_AMPLITUDE_N);
    expect(pullAtPeak / pullAtLull).toBeGreaterThan(ratio * 0.97);
    expect(pullAtPeak / pullAtLull).toBeLessThan(ratio * 1.03);
    freeRig(rig);
  });

  it("reset() clears it with the rest of the attempt", () => {
    const rig = makeNorthRig({ windLateralN: T.CROSSWIND_BRIDGE_N });
    for (let i = 0; i < 30; i++) step(rig, { ...IDLE_INPUT, throttle: 0.5 });
    expect(rig.sim.windSteerPullRad).not.toBe(0);
    rig.sim.reset();
    expect(rig.sim.windSteerPullRad).toBe(0);
    expect(rig.sim.roadWheelRad).toBe(0);
    freeRig(rig);
  });

  it(
    "THE HEAD LEANS WITH THE WIND WHEN THE LANE IS HELD — and with the wind plus the arc when it is not (round-1 verifier V-05)",
    () => {
      // `cockpitLean.ts`: a = v²·tan(driver's wheel + wind's pull)/L + the
      // wind's F/m — the corner estimate on the ROAD wheels, the wind whole.
      // ROUND 3 (verifier V2-04): taken through `cockpitLeanFromSim`, handed
      // the live car whole — the very call `CameraRig` makes — so this is a
      // behavioural test of the camera's lean input, not of a hand-copied
      // argument list. The routing guard in `cockpitLean.test.ts` pins that
      // the camera makes that call and reads no `roadWheelRad`.
      const cockpit = (rig: Rig) => cockpitLeanFromSim(rig.sim);
      // The verifier's mutant V6, as a reading: the car's road-wheel angle
      // (which has the pull in it) handed in as the driver's wheel.
      const doubleCounted = (rig: Rig) =>
        cockpitLeanFromSim({
          speedKmh: rig.sim.speedKmh,
          steerRad: rig.sim.roadWheelRad,
          windSteerPullRad: rig.sim.windSteerPullRad,
          windLatAccelMs2: rig.sim.windLatAccelMs2,
        });
      // What round 1 fed the camera: the driver's wheel alone.
      const roundOne = (rig: Rig) =>
        cockpitLatAccelMs2({
          speedMps: rig.sim.speedKmh / 3.6,
          steerRad: rig.sim.steerRad,
          wheelbaseM: T.ESTIMATE_WHEELBASE,
          disturbanceMs2: rig.sim.windLatAccelMs2,
        });
      // LANE HELD — the taught duty. The head gets the wind's own push, at the
      // street's speed AND at the motorway sibling's, where round 1 left a
      // third of it and none of it. BEFORE → AFTER, measured:
      //   34 км/ч held   0.34 → 0.97 m/s²     40 км/ч held   0.10 → 0.97
      //   74 км/ч held  −0.04 → 0.96          78 км/ч held  −0.05 → 0.96
      // (the AFTER column is, to four places, what the car without any pull
      // gave a lane-holder: 0.9737 at 34, 0.9613 at 78.)
      for (const kmh of [TAUGHT_KMH, CEILING_KMH, 50, 74, 78]) {
        const held = settleOnLine(WIND, kmh);
        expect(held.maxAbsX, `${kmh} km/h: the lane IS held`).toBeLessThan(0.02);
        expect(cockpit(held.rig), `${kmh} km/h held`).toBeGreaterThan(WIND_MS2 * 0.95);
        expect(cockpit(held.rig), `${kmh} km/h held`).toBeLessThan(WIND_MS2 * 1.05);
        // …and the round-1 reading it replaces was a fraction of that.
        expect(roundOne(held.rig), `${kmh} km/h held, round 1`).toBeLessThan(WIND_MS2 * 0.45);
        // …and the double-counted one leans him by a corner he is not in
        // (measured +0.61 m/s² at 34 км/ч, +0.88 at 78 — the arc of the pull).
        expect(doubleCounted(held.rig) - cockpit(held.rig), `${kmh} km/h held, V6`).toBeGreaterThan(0.5);
        if (kmh === 50) {
          // The demanded-grip signal reads the ROAD wheels, so a car going
          // straight is asking its tyres for nothing (fed the driver's wheel
          // it would report his held correction as cornering).
          expect(held.rig.sim.demandedGripUtilisation).toBeLessThan(0.01);
        }
        freeRig(held.rig);
      }
      // RELEASED — the wind's push PLUS the arc the chassis is really turning
      // on (v·ω, read off the body). BEFORE → AFTER, measured:
      //   34 км/ч released 1 s  0.98 → 1.62 m/s²   (the arc alone: 0.62)
      //   78 км/ч released 1 s  0.98 → 1.90 m/s²   (the arc alone: 0.89)
      for (const kmh of [TAUGHT_KMH, 78]) {
        const released = settleOnLine(WIND, kmh);
        const y0 = yawRad(released.rig);
        release(released.rig, kmh, 1);
        const arc = (yawRad(released.rig) - y0) * (released.rig.sim.speedKmh / 3.6);
        const lean = cockpit(released.rig);
        expect(lean, `${kmh} km/h released`).toBeGreaterThan((WIND_MS2 + arc) * 0.93);
        expect(lean, `${kmh} km/h released`).toBeLessThan((WIND_MS2 + arc) * 1.07);
        // A driver who lets go is leaned MORE than one who holds — never less.
        expect(lean, `${kmh} km/h released vs held`).toBeGreaterThan(WIND_MS2 * 1.5);
        freeRig(released.rig);
      }
      // OVER-HELD — the gust has eased and the wheel has not: the lean comes
      // back toward level and past it. The cue to release.
      const peakN = T.CROSSWIND_BRIDGE_N + T.CROSSWIND_GUST_AMPLITUDE_N;
      const lullN = T.CROSSWIND_BRIDGE_N - T.CROSSWIND_GUST_AMPLITUDE_N;
      const atPeak = settleOnLine({ windLateralN: peakN }, TAUGHT_KMH);
      const heldForTheGust = atPeak.mean;
      freeRig(atPeak.rig);
      const lull = settleOnLine({ windLateralN: lullN }, TAUGHT_KMH);
      const lullLean = cockpit(lull.rig); // the lull's own F/m, 0.57 m/s²
      for (let i = 0; i < 30; i++) {
        step(lull.rig, { ...IDLE_INPUT, throttle: cruiseThrottle(lull.rig, TAUGHT_KMH), steer: heldForTheGust });
      }
      expect(lullLean).toBeGreaterThan((lullN / T.CHASSIS_MASS) * 0.95);
      expect(cockpit(lull.rig)).toBeLessThan(lullLean * 0.25); // measured 0.03, from 0.57
      freeRig(lull.rig);
    },
    60_000,
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
      void polled.sim.windSteerPullRad;
      void polled.sim.roadWheelRad;
      step(quiet, input);
      expect(polled.sim.debugState().position).toEqual(quiet.sim.debugState().position);
      expect(polled.sim.debugState().rotation).toEqual(quiet.sim.debugState().rotation);
    }
    freeRig(polled);
    freeRig(quiet);
  }, TEST_TIMEOUT);
});
