// The crosswind's yaw pull — the arithmetic (founder ruling 2026-10-04,
// «Stronger wind», sc-ac-crosswind:a9db1738).
//
// `crosswind.test.ts` measures what this law does to the live car, and the
// lesson-level witness (`scenario/__tests__/crosswind-live-lane-hold.test.ts`)
// what it does to a drive. This file pins the law ITSELF, without a physics
// world, so that each of its two clauses has an assertion that names it:
//
//     pull = F_lateral · min( RAD_PER_N , L / (m · (v² + v_s²)) )
//
// ROUND 2 (2026-10-06). Round 1's second clause was L/(m·v²): it pinned the arc
// a hands-off car is turned onto at EXACTLY the wind's F/m above ~43 km/h, so
// from there up the displacement over a reaction time no longer rose with
// speed (measured, it fell a little) — and «по-бавно покрай камиона значи
// по-малко отместване от порива», shown at 70–78 км/ч, stopped being true of
// the car (round-1 verifier, V-01). The `+ v_s²` is the repair: the share of
// F/m the arc gets is v²/(v² + v_s²) above the crossover — strictly rising at
// every speed, strictly below 1 at every speed — and the three properties the
// repair was specified by each have an assertion below that names it.

import { describe, expect, it } from "vitest";

import {
  crosswindPathShareOfWind,
  crosswindSteerPullRad,
  CROSSWIND_PULL_CROSSOVER_MS,
} from "./crosswindPull";
import {
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_PULL_SATURATION_MS,
  CROSSWIND_STEER_PULL_RAD_PER_N,
  STEER_FULL_SPEED_KMH,
  STEER_MAX_ANGLE,
  STEER_MIN_ANGLE,
  STEER_MIN_SPEED_KMH,
  WHEELBASE_M,
  WHEEL_POSITIONS,
} from "./tuning";

const KMH = 1 / 3.6;

/** `VehicleSim`'s speed-sensitive lock: the road-wheel angle full input gives. */
function maxSteerRad(kmh: number): number {
  const f = Math.min(
    1,
    Math.max(0, (kmh - STEER_FULL_SPEED_KMH) / (STEER_MIN_SPEED_KMH - STEER_FULL_SPEED_KMH)),
  );
  return STEER_MAX_ANGLE + (STEER_MIN_ANGLE - STEER_MAX_ANGLE) * f;
}

describe("crosswindSteerPullRad — the wind's yaw pull", () => {
  it("is exactly 0 for no wind, at every speed — the calm car is not touched", () => {
    for (const v of [0, 1, 9.44, 30]) {
      expect(crosswindSteerPullRad(0, v)).toBe(0);
    }
  });

  it("turns the wheels the way the car is PUSHED — downwind, so the correction is into the wind", () => {
    // + force = pushed LEFT; + angle = wheels LEFT.
    expect(crosswindSteerPullRad(CROSSWIND_BRIDGE_N, 9)).toBeGreaterThan(0);
    expect(crosswindSteerPullRad(-CROSSWIND_BRIDGE_N, 9)).toBeLessThan(0);
    // Odd in the force, even in the speed (reversing does not flip it).
    expect(crosswindSteerPullRad(-CROSSWIND_BRIDGE_N, 9)).toBe(
      -crosswindSteerPullRad(CROSSWIND_BRIDGE_N, 9),
    );
    expect(crosswindSteerPullRad(CROSSWIND_BRIDGE_N, -9)).toBe(
      crosswindSteerPullRad(CROSSWIND_BRIDGE_N, 9),
    );
  });

  it("CLAUSE 1 — below the crossover it is a constant angle per newton, whatever the speed", () => {
    const expected = CROSSWIND_BRIDGE_N * CROSSWIND_STEER_PULL_RAD_PER_N;
    for (const kmh of [0, 5, 15, 25, 34]) {
      expect(kmh * KMH).toBeLessThan(CROSSWIND_PULL_CROSSOVER_MS);
      expect(crosswindSteerPullRad(CROSSWIND_BRIDGE_N, kmh * KMH)).toBe(expected);
    }
    // …and at a standstill clause 1 decides because the ceiling is finite and
    // LARGER there (L/(m·v_s²)), not because of a special case.
    expect(WHEELBASE_M / (CHASSIS_MASS * CROSSWIND_PULL_SATURATION_MS ** 2)).toBeGreaterThan(
      CROSSWIND_STEER_PULL_RAD_PER_N * 2,
    );
  });

  it("CLAUSE 2 — above it the arc's sideways acceleration is F/m · v²/(v² + v_s²): under the wind's own, and closing on it", () => {
    const vs2 = CROSSWIND_PULL_SATURATION_MS ** 2;
    for (const kmh of [40, 45, 50, 78, 110, 140]) {
      const v = kmh * KMH;
      expect(v).toBeGreaterThan(CROSSWIND_PULL_CROSSOVER_MS);
      const pull = crosswindSteerPullRad(CROSSWIND_BRIDGE_N, v);
      // v²·pull/L is the kinematic lateral acceleration of the arc.
      const arc = (v * v * pull) / WHEELBASE_M;
      expect(arc).toBeCloseTo(((CROSSWIND_BRIDGE_N / CHASSIS_MASS) * v * v) / (v * v + vs2), 10);
      expect(crosswindPathShareOfWind(v)).toBeCloseTo((v * v) / (v * v + vs2), 12);
    }
    // Stated: 0.73 of F/m at the lesson's 40 км/ч ceiling, 0.91 at the
    // sibling's 78, 0.95 at 110.
    expect(crosswindPathShareOfWind(40 * KMH)).toBeCloseTo(0.7275, 3);
    expect(crosswindPathShareOfWind(78 * KMH)).toBeCloseTo(0.9103, 3);
    expect(crosswindPathShareOfWind(110 * KMH)).toBeCloseTo(0.9528, 3);
  });

  it("(i) THE SHARE OF THE WIND'S PUSH RISES WITH SPEED, STRICTLY, AT EVERY SPEED — the property round 1 lost", () => {
    // Round 1: constant 1 from 43 km/h up, so „slower past the truck means
    // less displacement" was false across the sibling's whole range. Every
    // km/h from walking pace to far past both lessons, and not by rounding:
    // each step is a real increase.
    let prev = crosswindPathShareOfWind(1 * KMH);
    expect(prev).toBeGreaterThan(0);
    for (let kmh = 2; kmh <= 250; kmh += 1) {
      const share = crosswindPathShareOfWind(kmh * KMH);
      expect(share, `${kmh} km/h`).toBeGreaterThan(prev);
      // Not a float-epsilon „rise": even at 250 km/h a 1 km/h step is worth
      // more than 1e-5 of F/m.
      expect(share - prev, `${kmh} km/h step`).toBeGreaterThan(1e-5);
      prev = share;
    }
    // The driven range of both lessons, in the terms the sentences use: a
    // tenth slower is measurably less push at 78 км/ч, not just at 34.
    expect(crosswindPathShareOfWind(70 * KMH) / crosswindPathShareOfWind(78 * KMH)).toBeLessThan(0.985);
    expect(crosswindPathShareOfWind(60 * KMH) / crosswindPathShareOfWind(78 * KMH)).toBeLessThan(0.95);
    expect(crosswindPathShareOfWind(20 * KMH) / crosswindPathShareOfWind(34 * KMH)).toBeLessThan(0.4);
  });

  it("(ii) THE BOUND HOLDS EVERYWHERE — at no speed does the pull out-push the wind, and now it never even equals it", () => {
    // The mutations this exists for: dropping the second clause (a constant
    // angle at motorway speed would be several times F/m), and dropping the
    // `+ v_s²` (round 1's law sits AT F/m, which this refuses as well).
    for (let kmh = 1; kmh <= 300; kmh += 1) {
      const v = kmh * KMH;
      for (const f of [CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N, CROSSWIND_BRIDGE_N, CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N]) {
        const arc = (v * v * crosswindSteerPullRad(f, v)) / WHEELBASE_M;
        expect(arc, `${kmh} km/h, ${f} N`).toBeLessThan(f / CHASSIS_MASS);
      }
      expect(crosswindPathShareOfWind(v), `${kmh} km/h`).toBeLessThan(1);
    }
    // The margin at the top of the driven range is real, not a rounding: 4.7 %
    // under F/m at 110 км/ч.
    expect(crosswindPathShareOfWind(110 * KMH)).toBeLessThan(0.96);
  });

  it("is continuous across the crossover, and the crossover sits just ABOVE the taught speed", () => {
    const below = crosswindSteerPullRad(CROSSWIND_BRIDGE_N, CROSSWIND_PULL_CROSSOVER_MS * 0.9999);
    const above = crosswindSteerPullRad(CROSSWIND_BRIDGE_N, CROSSWIND_PULL_CROSSOVER_MS * 1.0001);
    expect(Math.abs(below - above) / below).toBeLessThan(1e-3);
    // sc-ac-crosswind teaches ~34 km/h: that speed stays on clause 1, so
    // every number round 1 measured there — the 3.5 % held wheel, the
    // 0.4 / 1.4 / 3.0 m of drift — is untouched by round 2. The 40 km/h
    // ceiling is now on clause 2 (3.1 % instead of 3.7 %).
    expect(CROSSWIND_PULL_CROSSOVER_MS / KMH).toBeGreaterThan(34.5);
    expect(CROSSWIND_PULL_CROSSOVER_MS / KMH).toBeLessThan(37);
    expect(CROSSWIND_PULL_CROSSOVER_MS ** 2).toBeCloseTo(
      WHEELBASE_M / (CHASSIS_MASS * CROSSWIND_STEER_PULL_RAD_PER_N) - CROSSWIND_PULL_SATURATION_MS ** 2,
      10,
    );
  });

  it("is linear in the force — the gust breathes the pull by the gust's own ratio", () => {
    const v = 34 * KMH;
    const base = crosswindSteerPullRad(CROSSWIND_BRIDGE_N, v);
    const peak = crosswindSteerPullRad(CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N, v);
    expect(peak / base).toBeCloseTo((CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N) / CROSSWIND_BRIDGE_N, 12);
  });

  it("(iii) THE RULED SIZE, ON PAPER — the pull alone is 3–5 % of full lock across the lesson's speeds", () => {
    // The measurement on the live car is crosswind.test.ts's; this is the
    // arithmetic it should agree with, so a retune that leaves the band fails
    // in the file that names the constant too.
    const share = (kmh: number) => crosswindSteerPullRad(CROSSWIND_BRIDGE_N, kmh * KMH) / maxSteerRad(kmh);
    for (const kmh of [20, 30, 34, 40]) {
      expect(share(kmh), `${kmh} km/h`).toBeGreaterThanOrEqual(0.03);
      expect(share(kmh), `${kmh} km/h`).toBeLessThanOrEqual(0.05);
    }
    // THE TWO LESSON CONDITIONS HAVE MARGIN, AND v_s IS WHAT SETS THE SECOND:
    // 3.45 % at the taught 34 км/ч (clause 1), 3.09 % at the 40 км/ч ceiling
    // (clause 2 — every 0.1 m/s added to v_s takes about 0.025 points off it,
    // which is why v_s cannot buy more slope at motorway speed than it has).
    expect(share(34)).toBeGreaterThan(0.034);
    expect(share(40)).toBeGreaterThan(0.0305);
    // STATED, outside the band and meant to be: above the ceiling the wheel
    // that holds the lane gets SMALLER — 2.5 % at 50, 1.7 % at the sibling's 78.
    expect(share(50)).toBeGreaterThan(0.022);
    expect(share(50)).toBeLessThan(0.028);
    expect(share(78)).toBeGreaterThan(0.015);
    expect(share(78)).toBeLessThan(0.02);
  });

  it("the pull never exceeds the ratified constant — nothing got stronger at low speed", () => {
    // The verifier's own suggestion, F·K/(1 + (v/v_x)²) retuned to keep 3 % at
    // 40 км/ч, needs a K about three times this one: 0.079 rad at a gust peak
    // on a standing car, and a launch that veers on a 46 m radius. The min()
    // keeps round 1's constant below the knee instead.
    for (let kmh = 0; kmh <= 250; kmh += 1) {
      expect(crosswindSteerPullRad(1, kmh * KMH)).toBeLessThanOrEqual(CROSSWIND_STEER_PULL_RAD_PER_N);
    }
    expect(CROSSWIND_STEER_PULL_RAD_PER_N).toBe(1.46e-5);
  });

  it("WHEELBASE_M is the wheelbase the wheels are actually bolted at", () => {
    expect(WHEELBASE_M).toBe(WHEEL_POSITIONS[0].z - WHEEL_POSITIONS[2].z);
    expect(WHEELBASE_M).toBeCloseTo(2.56, 10);
  });
});
