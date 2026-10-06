// The cockpit head-lean's lateral input — sc-ac-crosswind:a9db1738.
//
// The defect this gate exists for is a SUM WITH A MISSING ADDEND, which is the
// hardest kind to see: the formula was correct, complete-looking and wrong only
// by omission, and it produced a perfectly plausible dead-level head on the one
// lesson whose whole subject is being pushed sideways. So the assertions below
// are about the addend, not about the arithmetic.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { cockpitLatAccelMs2, cockpitLeanFromSim } from "./cockpitLean";
import {
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  ESTIMATE_WHEELBASE,
} from "./tuning";

/** The shipped steady crosswind, as the acceleration a 1 220 kg car takes. */
const WIND_MS2 = CROSSWIND_BRIDGE_N / CHASSIS_MASS;

describe("cockpitLatAccelMs2 — the cockpit's lateral sense", () => {
  it("is the plain kinematic estimate when nothing else pushes the car", () => {
    // Every lesson that authors no `physics.crosswind` passes 0 here, so the
    // cockpit it has always had must come out unchanged to the bit.
    const speedMps = 14;
    const steerRad = 0.08;
    expect(
      cockpitLatAccelMs2({
        speedMps,
        steerRad,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: 0,
      }),
    ).toBe((speedMps * speedMps * Math.tan(steerRad)) / ESTIMATE_WHEELBASE);
  });

  it("REPORTS A PUSH THE STEERING DOES NOT EXPLAIN — the whole row", () => {
    // Hands fixed, wind blowing: the pre-repair formula returned 0 here, and a
    // 0 is what the audit photographed as „nothing in the cockpit reports a
    // lateral disturbance".
    const leaned = cockpitLatAccelMs2({
      speedMps: 14,
      steerRad: 0,
      wheelbaseM: ESTIMATE_WHEELBASE,
      disturbanceMs2: WIND_MS2,
    });
    expect(leaned).toBeCloseTo(WIND_MS2, 10);
    expect(leaned).not.toBe(0);
    // And it is a magnitude a head can be leaned by, not a rounding artefact:
    // ≈0.098 g for the shipped 1 200 N, which is roughly a third of the lean a
    // gentle 30 km/h corner produces.
    expect(leaned / 9.81).toBeGreaterThan(0.05);
    expect(leaned / 9.81).toBeLessThan(0.2);
  });

  it("reports it AT REST too — the wind does not wait for the student", () => {
    // The kinematic term is v²-scaled, so at a standstill (and on the crawling
    // legs the harness drives) it is ~0 whatever the wheel is doing. The gust
    // is not, and a student stopped on an exposed span is exactly who needs to
    // be told the air is pushing.
    expect(
      cockpitLatAccelMs2({
        speedMps: 0,
        steerRad: 0.2,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      }),
    ).toBeCloseTo(WIND_MS2, 10);
  });

  it("keeps the sign of the disturbance — a wind from the left leans left", () => {
    const base = { speedMps: 0, steerRad: 0, wheelbaseM: ESTIMATE_WHEELBASE };
    expect(cockpitLatAccelMs2({ ...base, disturbanceMs2: WIND_MS2 })).toBeGreaterThan(0);
    expect(cockpitLatAccelMs2({ ...base, disturbanceMs2: -WIND_MS2 })).toBeLessThan(0);
  });

  it("a real arc the other way takes the push off the head — the sum is still a sum", () => {
    // The arithmetic the row was first repaired with: a path bent INTO the
    // wind hard enough to accelerate the car at F/m the other way reads level.
    // (Until the wind had a yaw pull this was also what „the taught duty" did
    // to the head. It no longer is — the next block.)
    const speedMps = 14;
    // Steer INTO the wind (wind pushes left ⇒ steer right, negative).
    const cancelling = -Math.atan((WIND_MS2 * ESTIMATE_WHEELBASE) / (speedMps * speedMps));
    expect(
      cockpitLatAccelMs2({
        speedMps,
        steerRad: cancelling,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      }),
    ).toBeCloseTo(0, 10);
  });

  it("THE HELD CORRECTION DOES NOT CANCEL THE WIND — a lane-holder's head gets the push whole (round-1 verifier V-05)", () => {
    // The wind turns the steered pair by `pull`; the driver who holds the lane
    // holds his wheel at −pull. The road wheels are straight, the car is
    // going straight, and the head must still be told about the wind — fed
    // the driver's wheel alone, the estimate read his correction as a corner
    // the other way and the head went level on the driver doing it right.
    for (const [kmh, pull] of [
      [34, 0.01752], // the taught speed — `crosswindSteerPullRad(1200, 9.44)`
      [40, 0.01474],
      [78, 0.00494], // the motorway sibling
    ] as const) {
      const speedMps = kmh / 3.6;
      const held = cockpitLatAccelMs2({
        speedMps,
        steerRad: -pull,
        windSteerPullRad: pull,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      });
      expect(held, `${kmh} km/h`).toBeCloseTo(WIND_MS2, 12);
      // What round 1 fed the camera for the same driver: 0.35 of it at 34,
      // about a twentieth of it at 78.
      const roundOne = cockpitLatAccelMs2({
        speedMps,
        steerRad: -pull,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: WIND_MS2,
      });
      expect(roundOne, `${kmh} km/h, round 1`).toBeLessThan(WIND_MS2 * 0.4);
    }
  });

  it("…a driver who LETS GO is leaned by the wind plus the arc the car is turned onto — more, never less", () => {
    const speedMps = 34 / 3.6;
    const pull = 0.01752;
    const released = cockpitLatAccelMs2({
      speedMps,
      steerRad: 0,
      windSteerPullRad: pull,
      wheelbaseM: ESTIMATE_WHEELBASE,
      disturbanceMs2: WIND_MS2,
    });
    const arc = (speedMps * speedMps * Math.tan(pull)) / ESTIMATE_WHEELBASE;
    expect(released).toBeCloseTo(WIND_MS2 + arc, 12);
    expect(arc).toBeGreaterThan(WIND_MS2 * 0.5);
    expect(arc).toBeLessThan(WIND_MS2); // the arc never out-pushes the wind
  });

  it("…and one who OVER-HOLDS it — the gust eased, the wheel did not — is taken back toward level: the cue to release", () => {
    const speedMps = 34 / 3.6;
    const lullMs2 = (CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const pullAtLull = 0.01752 * (700 / 1200);
    const heldForThePeak = -0.01752 * (1700 / 1200);
    const overHeld = cockpitLatAccelMs2({
      speedMps,
      steerRad: heldForThePeak,
      windSteerPullRad: pullAtLull,
      wheelbaseM: ESTIMATE_WHEELBASE,
      disturbanceMs2: lullMs2,
    });
    expect(overHeld).toBeLessThan(lullMs2 * 0.2);
    expect(overHeld).toBeGreaterThan(-lullMs2);
  });

  it("no pull, no change — every calm cockpit and every caller that passes none is the estimate it always was, to the bit", () => {
    for (const speedMps of [0, 3, 9.44, 14, 30]) {
      for (const steerRad of [-0.5, -0.08, -0, 0, 0.0178, 0.3]) {
        const old = (speedMps * speedMps * Math.tan(steerRad)) / ESTIMATE_WHEELBASE + 0;
        const base = { speedMps, steerRad, wheelbaseM: ESTIMATE_WHEELBASE, disturbanceMs2: 0 };
        expect(Object.is(cockpitLatAccelMs2(base), old)).toBe(true);
        expect(Object.is(cockpitLatAccelMs2({ ...base, windSteerPullRad: 0 }), old)).toBe(true);
      }
    }
  });

  it("breathes over the gust envelope rather than sitting at one offset", () => {
    // The peak/trough of the shipped sine, expressed as head-lean input: the
    // ease is the cue briefing step 6 sends the student to read.
    const base = { speedMps: 14, steerRad: 0, wheelbaseM: ESTIMATE_WHEELBASE };
    const peak = (CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const trough = (CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS;
    const hi = cockpitLatAccelMs2({ ...base, disturbanceMs2: peak });
    const lo = cockpitLatAccelMs2({ ...base, disturbanceMs2: trough });
    expect(hi - lo).toBeCloseTo((2 * CROSSWIND_GUST_AMPLITUDE_N) / CHASSIS_MASS, 10);
    // The gust never flips the wind, so the lean never crosses centre — the
    // car is pushed the same way throughout, harder and softer.
    expect(lo).toBeGreaterThan(0);
  });
});

describe("cockpitLeanFromSim — the lean input off the live car (round 3, verifier V2-04)", () => {
  const car = {
    speedKmh: 34,
    steerRad: -0.0178, // the driver's held correction, to the right
    windSteerPullRad: 0.0178, // the wind's pull, to the left: the road wheels are straight
    windLatAccelMs2: WIND_MS2,
    roadWheelRad: 0, // what the car reports for the pair — the sum of the two above
  };

  it("is cockpitLatAccelMs2 of the car's driver's wheel, pull, speed and wind — nothing else", () => {
    expect(cockpitLeanFromSim(car)).toBe(
      cockpitLatAccelMs2({
        speedMps: car.speedKmh / 3.6,
        steerRad: car.steerRad,
        windSteerPullRad: car.windSteerPullRad,
        wheelbaseM: ESTIMATE_WHEELBASE,
        disturbanceMs2: car.windLatAccelMs2,
      }),
    );
    // A lane-holder is leaned by the wind's own F/m, to the bit here.
    expect(cockpitLeanFromSim(car)).toBeCloseTo(WIND_MS2, 12);
  });

  it("never reads the road-wheel angle: the pull is in it already, and counting it twice tilts a lane-holder", () => {
    // A car reporting a different road-wheel angle leans the same.
    const otherPair = { ...car, roadWheelRad: 0.05 };
    expect(cockpitLeanFromSim(otherPair)).toBe(cockpitLeanFromSim(car));
    // What reading it as the driver's wheel would do (the V6 edit): with the
    // pull added on top, the lane-holder is leaned by a corner he is not in.
    // (verifier: «about 0.98 + 0.61 m/s² at 34 км/ч, not 0.97»).
    const v6 = cockpitLeanFromSim({ ...car, steerRad: car.roadWheelRad });
    expect(v6 - WIND_MS2).toBeGreaterThan(0.5);
  });

  it("no car yet is a level head", () => {
    expect(cockpitLeanFromSim(null)).toBe(0);
    expect(cockpitLeanFromSim(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// THE ROUTING GUARD — the camera is the consumer, not a unit test
// ---------------------------------------------------------------------------

const RIG_SRC = readFileSync(path.resolve(__dirname, "../../../components/sim/CameraRig.tsx"), "utf8");

/**
 * ROUND 3 (verifier V2-04). `CameraRig` hands the lean the WHOLE live car —
 * `cockpitLeanFromSim(sim)` — so it cannot pick a field the behavioural tests
 * do not drive (`crosswind.test.ts` leans a lane-holder on the real
 * `VehicleSim` through this very function), and nothing in the camera reads
 * `roadWheelRad`, which already carries the pull. Round 2's guard pinned
 * `steerRad: steer` and never what `steer` was; the verifier's mutant
 * `const steer = sim?.roadWheelRad ?? 0` passed it and 689 tests.
 */
const cameraFeedsTheRoadWheels = (src: string) =>
  /const latAccel = cockpitLeanFromSim\(sim\);/.test(src) &&
  /const steer = sim\?\.steerRad \?\? 0;/.test(src) &&
  !/roadWheelRad/.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")) &&
  !/cockpitLatAccelMs2\(/.test(src);

describe("routing: CameraRig feeds the lean the road wheels and the wind, from the live sim", () => {
  it("the cockpit camera hands the lean function the whole live car, and its own wheel is the driver's", () => {
    // Without this leg the pure function above is right and the head is still
    // level on the driver who holds his lane — round 1, exactly.
    expect(cameraFeedsTheRoadWheels(RIG_SRC)).toBe(true);
  });

  it("cutting the leg out of the REAL source turns the guard red", () => {
    const cut = RIG_SRC.replace("const latAccel = cockpitLeanFromSim(sim);", "const latAccel = sim?.windLatAccelMs2 ?? 0;");
    expect(cut).not.toBe(RIG_SRC);
    expect(cameraFeedsTheRoadWheels(cut)).toBe(false);
    // …and so does the verifier's V6: the car's road-wheel angle as `steer`,
    // which counts the pull twice wherever `steer` meets the pull.
    const v6 = RIG_SRC.replace("const steer = sim?.steerRad ?? 0;", "const steer = sim?.roadWheelRad ?? 0;");
    expect(v6).not.toBe(RIG_SRC);
    expect(cameraFeedsTheRoadWheels(v6)).toBe(false);
    // …and picking the fields by hand again, whatever they are.
    const byHand = RIG_SRC.replace(
      "const latAccel = cockpitLeanFromSim(sim);",
      "const latAccel = cockpitLatAccelMs2({ speedMps: vMps, steerRad: steer, windSteerPullRad: sim?.windSteerPullRad ?? 0, wheelbaseM: ESTIMATE_WHEELBASE, disturbanceMs2: sim?.windLatAccelMs2 ?? 0 });",
    );
    expect(cameraFeedsTheRoadWheels(byHand)).toBe(false);
  });
});
